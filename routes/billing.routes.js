const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const {
  getOrLoadState,
  salvarEstado,
  persistTenantState,
  mutateTenantState,
  extractTenantId,
  requirePermission
} = require('../lib/serverContext');
const subscriptionService = require('../services/subscriptionService');
const billingService = require('../services/billing/billingService');
const { BILLING_CONFIG } = require('../services/billing/billingConfig');
const { getPaymentAdapter } = require('../services/billing/paymentProviderAdapter');
const saasTelemetry = require('../services/billing/saasTelemetryService');
const { isValidTenantId } = require('../lib/repository/stateRepository');

router.get('/api/assinatura', requirePermission('company:settings', 'admin:settings', 'reports:read'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const tenantId = extractTenantId(req);
    const sub = subscriptionService.obterAssinatura(tenantId, state);
    res.json({ success: true, subscription: sub });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.put('/api/assinatura/plano', requirePermission('admin:settings'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const tenantId = extractTenantId(req);
    const { plano, billingCycle } = req.body || {};
    const resultado = subscriptionService.atualizarPlano({
      tenantId,
      state,
      novoPlano: plano,
      billingCycle,
      ator: req.securityContext?.actorId || 'administrador'
    });
    const saveRes = await persistTenantState(req, state);
    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({ success: false, error: saveRes?.error || 'Falha ao atualizar plano de assinatura.' });
    }
    res.json({ success: true, ...resultado });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

/* ── Gestão Operacional Proativa (Operational Intelligence Engine) ── */

const limiterWebhooks = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 600,
  message: { error: 'Limite de webhooks excedido temporariamente.' },
  standardHeaders: true,
  legacyHeaders: false
});

// 1. Webhook do Gateway de Pagamento (Idempotência e Assinatura Estrita)
router.post('/webhooks/billing/:provider', limiterWebhooks, async (req, res) => {
  const provider = req.params.provider;
  try {
    const result = await billingService.processWebhookEvent({
      provider,
      rawBody: req.rawBody,
      body: req.body,
      headers: req.headers
    });

    if (!result.ok) {
      return res.status(result.status || 401).json({ error: result.error });
    }

    // Se o webhook atualizou a assinatura de um tenant existente, sincroniza no state do SQLite
    if (result.tenantId && isValidTenantId(result.tenantId)) {
      try {
        const subAtual = billingService.getSubscription(result.tenantId);
        await mutateTenantState({ securityContext: { tenantId: result.tenantId, role: 'system', permissions: ['*'] } }, (draft) => {
          draft.subscription = {
            ...subAtual,
            features: subAtual.status === 'suspended' || subAtual.status === 'expired'
              ? ['os', 'clientes', 'veiculos', 'export', 'billing', 'support']
              : (subscriptionService.PLANOS_FEATURES[subAtual.plan] || subscriptionService.PLANOS_FEATURES.pro)
          };
        });
      } catch (syncErr) {
        console.warn(`[Webhook Billing] Aviso ao sincronizar state do tenant ${result.tenantId}:`, syncErr.message);
      }
    }

    return res.status(200).json(result);
  } catch (err) {
    console.error(`[Webhook Billing / ${provider}] Erro crítico:`, err);
    return res.status(500).json({ error: err.message });
  }
});

// 2. Consulta Pública de Catálogo de Planos
router.get('/api/public/planos', (req, res) => {
  res.json({
    ok: true,
    plans: BILLING_CONFIG.plans,
    setupFee: BILLING_CONFIG.setupFee,
    trial: BILLING_CONFIG.trial
  });
});

// 3. Cadastro Self-Service com Provisionamento Automático de Tenant

router.post('/api/billing/checkout', async (req, res) => {
  const {
    tenantId,
    plan = 'pro',
    paymentMethod = 'pix',
    couponCode = null,
    isSetupFeeExempt = false,
    setupExemptionReason = null,
    setupAuthorizedBy = null,
    customerData = {}
  } = req.body || {};

  const tid = tenantId || extractTenantId(req);
  if (!tid) return res.status(400).json({ error: 'tenantId obrigatório para checkout.' });

  try {
    const checkoutResult = await billingService.createCheckout({
      tenantId: tid,
      plan,
      paymentMethod,
      couponCode,
      isSetupFeeExempt,
      setupExemptionReason,
      setupAuthorizedBy,
      customerData
    });
    res.json(checkoutResult);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 5. Geração de Imagem Dinâmica de QR Code PIX
router.get('/api/billing/pix/qr/:checkoutId.png', async (req, res) => {
  try {
    const text = `00020101021226840014br.gov.bcb.pix2562qrcodes.patio-crm.com.br/pix/${req.params.checkoutId}`;
    const qrBuffer = await QRCode.toBuffer(text, { width: 300, margin: 2 });
    res.setHeader('Content-Type', 'image/png');
    res.send(qrBuffer);
  } catch (err) {
    res.status(500).send('Erro ao gerar QR Code.');
  }
});

// 6. Consulta de Assinatura do Tenant
router.get('/api/billing/subscription', requirePermission('admin:settings'), async (req, res) => {
  const tenantId = extractTenantId(req);
  const sub = billingService.getSubscription(tenantId);
  const cost = saasTelemetry.getCostToServe(tenantId, sub.price);
  res.json({ ok: true, subscription: sub, costToServe: cost });
});

// 7. Alteração de Plano (Upgrade/Downgrade)
router.post('/api/billing/change-plan', requirePermission('admin:settings'), async (req, res) => {
  const tenantId = extractTenantId(req);
  const { newPlan, immediate } = req.body || {};

  try {
    const result = await billingService.changeSubscriptionPlan({
      tenantId,
      newPlan,
      immediate,
      actor: req.securityContext?.actorId || 'admin'
    });

    // Atualiza o state local se aplicou imediatamente
    if (result.mode === 'applied_immediately') {
      await mutateTenantState(req, async (draft) => {
        draft.subscription = {
          ...draft.subscription,
          plan: newPlan,
          features: [...subscriptionService.PLANOS_FEATURES[newPlan]]
        };
        return draft;
      });
      saasTelemetry.recordTelemetryEvent('plan_upgraded', { tenantId, metadata: { newPlan } });
    } else {
      saasTelemetry.recordTelemetryEvent('plan_downgraded', { tenantId, metadata: { newPlan } });
    }

    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 8. Cancelamento de Assinatura
router.post('/api/billing/cancel', requirePermission('admin:settings'), async (req, res) => {
  const tenantId = extractTenantId(req);
  const { reason = 'outro', immediate = false } = req.body || {};

  try {
    const result = await billingService.cancelSubscription({
      tenantId,
      reason,
      immediate,
      actor: req.securityContext?.actorId || 'admin'
    });

    saasTelemetry.recordTelemetryEvent('subscription_cancelled', { tenantId, metadata: { reason, immediate } });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 9. Histórico de Pagamentos e Faturas
router.get('/api/billing/history', requirePermission('admin:settings'), (req, res) => {
  const tenantId = extractTenantId(req);
  const history = billingService.getBillingHistory(tenantId);
  res.json({ ok: true, invoices: history });
});

/* ── ROTAS DE PLATAFORMA SAAS (REAL SOLUÇÕES ADMIN) ───────── */

// 10. Métricas Oficiais da Plataforma (MRR, ARR, Churn, Funil)

module.exports = router;
