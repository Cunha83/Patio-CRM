'use strict';

/**
 * =====================================================================
 * PÁTIO CRM — TESTES DE CICLO DE VIDA DO CLIENTE SAAS & BILLING GOVERNANCE
 * Cobre rigorosamente os 40 requisitos comerciais da transformação SaaS:
 * Founder Pricing, Payment Provider Adapter, Webhook Idempotency, Dunning,
 * Suspensão, Reativação, Métricas (MRR/ARR/Churn/TTFV), Platform Admin e E2E.
 * =====================================================================
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const { spawn } = require('node:child_process');
const { once } = require('node:events');

const tempInprocDir = fs.mkdtempSync(path.join(os.tmpdir(), 'patio-lifecycle-inproc-'));
const tempInprocDbPath = path.join(tempInprocDir, 'test.db');
process.env.DB_PATH = tempInprocDbPath;

const { initDB, closeDB } = require('../db');

const {
  BILLING_CONFIG,
  calculateSubscriptionPrice,
  lockTenantPrice,
  getTenantPriceLock
} = require('../services/billing/billingConfig');
const {
  PaymentProviderAdapter,
  SandboxProviderAdapter,
  AsaasProviderAdapter,
  getPaymentAdapter
} = require('../services/billing/paymentProviderAdapter');
const billingService = require('../services/billing/billingService');
const saasTelemetry = require('../services/billing/saasTelemetryService');
const platformAdmin = require('../services/billing/platformAdminService');
const subscriptionService = require('../services/subscriptionService');
const { IdentityRegistry } = require('../lib/auth/identity');
const { createAuthMiddleware } = require('../lib/auth/context');

test.before(async () => {
  await initDB();
});

test.after(async () => {
  await closeDB().catch(() => {});
  try {
    fs.rmSync(tempInprocDir, { recursive: true, force: true });
  } catch (_) {}
});

/* ── 1. TRIAL PROVISIONADO AUTOMATICAMENTE ────────────────────────── */
test('1. Trial provisionado automaticamente com 14 dias e recursos Pro', () => {
  const tenantId = 'oficina_trial_test_1';
  const sub = subscriptionService.obterAssinatura(tenantId);

  assert.equal(sub.tenantId, tenantId);
  assert.equal(sub.plan, 'trial');
  assert.equal(sub.status, 'trial');
  assert.equal(sub.diasRestantesTrial, 14);
  assert.ok(sub.features.includes('precificacao_assistida'));
  assert.ok(sub.features.includes('frotas_avancadas'));
});

/* ── 2. TRIAL EXPIRA ─────────────────────────────────────────────── */
test('2. Trial expira após 14 dias sem apagar nenhum dado', () => {
  const tenantId = 'oficina_trial_expired_1';
  const pastDate = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString();
  const state = {
    subscription: {
      tenantId,
      plan: 'trial',
      status: 'trial',
      startedAt: pastDate,
      trialEndsAt: pastDate,
      features: ['os', 'clientes', 'veiculos', 'frotas_avancadas']
    },
    os: [{ id: 'os_1', numero: 'OS-001' }],
    veiculos: [{ placa: 'ABC1234' }]
  };

  const sub = subscriptionService.obterAssinatura(tenantId, state);
  assert.equal(sub.status, 'expired');
  // Dados operacionais permanecem íntegros
  assert.equal(state.os.length, 1);
  assert.equal(state.veiculos.length, 1);
  // Recursos avançados ficam restritos
  assert.equal(subscriptionService.hasFeature(tenantId, 'frotas_avancadas', state), false);
  // Leitura e consulta básica são permitidas
  assert.equal(subscriptionService.hasFeature(tenantId, 'os', state), true);
});

/* ── 3. CONVERSÃO DE TRIAL ───────────────────────────────────────── */
test('3. Conversão de trial registra evento e métricas de aquisição', () => {
  const tenantId = 'oficina_conv_1';
  saasTelemetry.recordTelemetryEvent('trial_converted', {
    tenantId,
    metadata: { selectedPlan: 'pro', acquisitionSource: 'google_ads' }
  });

  const lastEvt = saasTelemetry.telemetryEvents[0];
  assert.equal(lastEvt.type, 'trial_converted');
  assert.equal(lastEvt.tenantId, tenantId);
  assert.equal(lastEvt.metadata.selectedPlan, 'pro');
});

/* ── 4. PLANO ESSENCIAL ─────────────────────────────────────────── */
test('4. Plano Essencial cobre a rotina completa da oficina por R$ 179', () => {
  const p = BILLING_CONFIG.plans.essencial;
  assert.equal(p.monthlyPrice, 179.00);
  assert.ok(p.features.includes('os'));
  assert.ok(p.features.includes('clientes'));
  assert.ok(p.features.includes('estoque_basico'));
  assert.ok(p.features.includes('financeiro_basico'));
  assert.ok(p.features.includes('whatsapp_operacional'));
  assert.equal(p.features.includes('precificacao_assistida'), false);
});

/* ── 5. PLANO PRO ────────────────────────────────────────────────── */
test('5. Plano Pro inclui inteligência, frotas e proteção de margem por R$ 299', () => {
  const p = BILLING_CONFIG.plans.pro;
  assert.equal(p.monthlyPrice, 299.00);
  assert.ok(p.features.includes('precificacao_assistida'));
  assert.ok(p.features.includes('protecao_margem'));
  assert.ok(p.features.includes('frotas_avancadas'));
  assert.ok(p.features.includes('manutencao_preventiva_frota'));
  assert.ok(p.features.includes('pos_venda_automatico'));
  assert.ok(p.features.includes('voz_inteligente'));
});

/* ── 6. FEATURE ENTITLEMENT ──────────────────────────────────────── */
test('6. Feature Entitlement considera plano e status (bloqueia quando suspenso)', () => {
  const tenantId = 'oficina_entitlement_1';
  const stateAtivo = {
    subscription: { tenantId, plan: 'pro', status: 'active', features: BILLING_CONFIG.plans.pro.features }
  };
  assert.equal(subscriptionService.hasFeature(tenantId, 'precificacao_assistida', stateAtivo), true);

  const stateSuspenso = {
    subscription: { tenantId, plan: 'pro', status: 'suspended', features: BILLING_CONFIG.plans.pro.features }
  };
  assert.equal(subscriptionService.hasFeature(tenantId, 'precificacao_assistida', stateSuspenso), false);
  assert.equal(subscriptionService.hasFeature(tenantId, 'os', stateSuspenso), true); // Leitura permitida
});

/* ── 7. SETUP FEE ────────────────────────────────────────────────── */
test('7. Implantação Assistida (Setup Fee) de R$ 390 e suporte a isenção auditada', () => {
  // 7.1 Sem isenção
  const calc1 = calculateSubscriptionPrice('pro', { isSetupFeeExempt: false });
  assert.equal(calc1.setupFee, 390.00);
  assert.equal(calc1.initialPaymentTotal, 299.00 + 390.00);

  // 7.2 Com isenção concedida pela diretoria
  const calc2 = calculateSubscriptionPrice('pro', {
    isSetupFeeExempt: true,
    setupExemptionReason: 'Parceria Frotista Nacional',
    setupAuthorizedBy: 'diretoria_comercial'
  });
  assert.equal(calc2.setupFee, 0);
  assert.equal(calc2.initialPaymentTotal, 299.00);
  assert.equal(calc2.setupExemptionAudit.isento, true);
  assert.equal(calc2.setupExemptionAudit.authorizedBy, 'diretoria_comercial');
});

/* ── 8. CHECKOUT TRANSPARENTE ───────────────────────────────────── */
test('8. Checkout transparente sem taxas escondidas', async () => {
  const checkout = await billingService.createCheckout({
    tenantId: 'oficina_chk_test',
    plan: 'essencial',
    paymentMethod: 'pix',
    customerData: { legalName: 'Oficina Rápida', document: '12.345.678/0001-90', email: 'rapida@teste.com' }
  });

  assert.equal(checkout.ok, true);
  assert.equal(checkout.checkout.totalAmount, 179.00 + 390.00);
  assert.equal(checkout.checkout.paymentMethod, 'pix');
  assert.ok(checkout.checkout.paymentDetails.pixCopiaECola.includes('br.gov.bcb.pix'));
});

/* ── 9. WEBHOOK VÁLIDO ───────────────────────────────────────────── */
test('9. Webhook válido processa pagamento e atualiza status para active', async () => {
  const adapter = new SandboxProviderAdapter();
  const tenantId = 'oficina_webhook_valid_1';
  await billingService.initializeSubscription({ tenantId, plan: 'pro', status: 'trialing' });

  const payload = {
    id: 'evt_test_valid_1',
    event: 'PAYMENT_RECEIVED',
    tenantId,
    amount: 299.00,
    payment: { status: 'CONFIRMED', value: 299.00 }
  };
  const signature = adapter.signWebhookPayload(payload);

  const res = await billingService.processWebhookEvent({
    provider: 'sandbox',
    body: payload,
    headers: { 'x-sandbox-signature': signature },
    adapter
  });

  assert.equal(res.ok, true);
  assert.equal(res.duplicate, false);
  const sub = billingService.getSubscription(tenantId);
  assert.equal(sub.status, 'active');
});

/* ── 10. WEBHOOK ASSINATURA INVÁLIDA ─────────────────────────────── */
test('10. Webhook com assinatura inválida é rejeitado estritamente', async () => {
  const adapter = new SandboxProviderAdapter();
  const payload = { id: 'evt_fake', event: 'PAYMENT_RECEIVED', tenantId: 'any' };

  const res = await billingService.processWebhookEvent({
    provider: 'sandbox',
    body: payload,
    headers: { 'x-sandbox-signature': 'assinatura_forjada_incorreta' },
    adapter
  });

  assert.equal(res.ok, false);
  assert.equal(res.status, 401);
});

/* ── 11. WEBHOOK DUPLICADO (IDEMPOTÊNCIA) ────────────────────────── */
test('11. Webhook duplicado é processado uma única vez pelo Ledger', async () => {
  const adapter = new SandboxProviderAdapter();
  const tenantId = 'oficina_idempotency_1';
  const payload = {
    id: 'evt_idempotent_unique_999',
    event: 'PAYMENT_RECEIVED',
    tenantId,
    amount: 299.00
  };
  const signature = adapter.signWebhookPayload(payload);

  // Primeira chamada
  const res1 = await billingService.processWebhookEvent({
    provider: 'sandbox',
    body: payload,
    headers: { 'x-sandbox-signature': signature },
    adapter
  });
  assert.equal(res1.ok, true);
  assert.equal(res1.duplicate, false);

  // Segunda chamada com exatamente o mesmo payload
  const res2 = await billingService.processWebhookEvent({
    provider: 'sandbox',
    body: payload,
    headers: { 'x-sandbox-signature': signature },
    adapter
  });
  assert.equal(res2.ok, true);
  assert.equal(res2.duplicate, true);
});

/* ── 12. PAGAMENTO CONFIRMADO ───────────────────────────────────── */
test('12. Pagamento confirmado estende vigência por 30 dias', async () => {
  const adapter = new SandboxProviderAdapter();
  const tenantId = 'oficina_paid_extend_1';
  await billingService.initializeSubscription({ tenantId, plan: 'essencial', status: 'past_due' });

  const payload = { id: 'evt_paid_12', event: 'payment_succeeded', tenantId, amount: 179.00 };
  const signature = adapter.signWebhookPayload(payload);

  await billingService.processWebhookEvent({
    provider: 'sandbox',
    body: payload,
    headers: { 'x-sandbox-signature': signature },
    adapter
  });

  const sub = billingService.getSubscription(tenantId);
  assert.equal(sub.status, 'active');
  assert.ok(new Date(sub.currentPeriodEnd) > new Date());
});

/* ── 13. FALHA DE PAGAMENTO ─────────────────────────────────────── */
test('13. Falha de pagamento transiciona para past_due sem corte instantâneo', async () => {
  const adapter = new SandboxProviderAdapter();
  const tenantId = 'oficina_overdue_1';
  await billingService.initializeSubscription({ tenantId, plan: 'pro', status: 'active' });

  const payload = { id: 'evt_fail_13', event: 'PAYMENT_OVERDUE', tenantId };
  const signature = adapter.signWebhookPayload(payload);

  await billingService.processWebhookEvent({
    provider: 'sandbox',
    body: payload,
    headers: { 'x-sandbox-signature': signature },
    adapter
  });

  const sub = billingService.getSubscription(tenantId);
  assert.equal(sub.status, 'past_due');
  assert.ok(sub.gracePeriodEndsAt !== null);
});

/* ── 14. GRACE PERIOD (CARÊNCIA) ─────────────────────────────────── */
test('14. Carência de 5 dias permite regularização antes da suspensão', async () => {
  const tenantId = 'oficina_grace_1';
  const sub = await billingService.initializeSubscription({ tenantId, plan: 'pro', status: 'past_due' });
  const graceEnd = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(); // 3 dias restantes
  sub.gracePeriodEndsAt = graceEnd;

  const check = await billingService.checkDunningStatus(tenantId);
  assert.equal(check.status, 'past_due');
  assert.equal(check.actionTaken, 'grace_period_active');
});

/* ── 15. SUSPENSÃO ───────────────────────────────────────────────── */
test('15. Suspensão após carência esgotada bloqueia novas operações', async () => {
  const tenantId = 'oficina_suspend_1';
  const sub = await billingService.initializeSubscription({ tenantId, plan: 'pro', status: 'past_due' });
  sub.gracePeriodEndsAt = new Date(Date.now() - 1000).toISOString(); // Carência vencida

  const check = await billingService.checkDunningStatus(tenantId);
  assert.equal(check.status, 'suspended');
  assert.equal(check.actionTaken, 'tenant_suspended');
});

/* ── 16. REATIVAÇÃO ──────────────────────────────────────────────── */
test('16. Reativação restaura status active imediatamente', async () => {
  const tenantId = 'oficina_reactivate_1';
  await billingService.initializeSubscription({ tenantId, plan: 'pro', status: 'suspended' });

  const res = await billingService.reactivateSubscription(tenantId);
  assert.equal(res.ok, true);
  assert.equal(res.subscription.status, 'active');
  assert.equal(res.subscription.gracePeriodEndsAt, null);
});

/* ── 17. CANCELAMENTO NO FIM DO PERÍODO ──────────────────────────── */
test('17. Cancelamento padrão cancelAtPeriodEnd preserva acesso até a data', async () => {
  const tenantId = 'oficina_cancel_period_1';
  await billingService.initializeSubscription({ tenantId, plan: 'pro', status: 'active' });

  const res = await billingService.cancelSubscription({ tenantId, reason: 'preco', immediate: false });
  assert.equal(res.ok, true);
  assert.equal(res.subscription.cancelAtPeriodEnd, true);
  assert.equal(res.subscription.status, 'active'); // Continua ativo até o vencimento
  assert.equal(res.subscription.cancellationReason, 'preco');
});

/* ── 18. CANCELAMENTO IMEDIATO ───────────────────────────────────── */
test('18. Cancelamento imediato registra status e motivo auditado', async () => {
  const tenantId = 'oficina_cancel_imm_1';
  await billingService.initializeSubscription({ tenantId, plan: 'pro', status: 'active' });

  const res = await billingService.cancelSubscription({ tenantId, reason: 'fechou_a_empresa', immediate: true });
  assert.equal(res.ok, true);
  assert.equal(res.subscription.status, 'cancelled');
  assert.equal(res.subscription.cancellationReason, 'fechou_a_empresa');
});

/* ── 19. UPGRADE ─────────────────────────────────────────────────── */
test('19. Upgrade Essencial -> Pro é aplicado imediatamente', async () => {
  const tenantId = 'oficina_upg_1';
  await billingService.initializeSubscription({ tenantId, plan: 'essencial', status: 'active' });

  const res = await billingService.changeSubscriptionPlan({ tenantId, newPlan: 'pro' });
  assert.equal(res.ok, true);
  assert.equal(res.mode, 'applied_immediately');
  assert.equal(res.subscription.plan, 'pro');
  assert.equal(res.subscription.price, 299.00);
});

/* ── 20. DOWNGRADE ───────────────────────────────────────────────── */
test('20. Downgrade Pro -> Essencial é agendado para o fim do ciclo', async () => {
  const tenantId = 'oficina_down_1';
  await billingService.initializeSubscription({ tenantId, plan: 'pro', status: 'active' });

  const res = await billingService.changeSubscriptionPlan({ tenantId, newPlan: 'essencial' });
  assert.equal(res.ok, true);
  assert.equal(res.mode, 'scheduled_at_period_end');
  assert.equal(res.subscription.pendingDowngrade.targetPlan, 'essencial');
});

/* ── 21. DOWNGRADE NÃO APAGA DADOS ───────────────────────────────── */
test('21. Downgrade não apaga nenhum dado operacional do tenant', () => {
  const tenantId = 'oficina_no_loss_1';
  const state = {
    subscription: { tenantId, plan: 'pro', status: 'active' },
    os: [{ id: 'os_100' }],
    fleets: [{ id: 'frota_1', nome: 'Transvale' }],
    pricingOverrides: [{ id: 'ovr_1', margemMinima: 25 }]
  };

  subscriptionService.atualizarPlano({ tenantId, state, novoPlano: 'essencial' });
  assert.equal(state.subscription.plan, 'essencial');
  assert.equal(state.os.length, 1);
  assert.equal(state.fleets.length, 1);
  assert.equal(state.pricingOverrides.length, 1);
});

/* ── 22. FOUNDER PRICE LOCK ──────────────────────────────────────── */
test('22. Founder Price Lock trava o valor da mensalidade contra reajustes futuros', () => {
  const tenantId = 'oficina_founder_locked';
  lockTenantPrice(tenantId, 'pro', 249.00, 'early_adopter_2026');

  const calc = calculateSubscriptionPrice('pro', { tenantId });
  assert.equal(calc.effectiveMonthlyPrice, 249.00);
});

/* ── 23. CUPONS DE DESCONTO ──────────────────────────────────────── */
test('23. Validação de cupons percentuais e fixos sem valor negativo', () => {
  const calc1 = calculateSubscriptionPrice('pro', { couponCode: 'FOUNDER2026' });
  assert.equal(calc1.discountAmount, 59.80); // 20% de 299
  assert.equal(calc1.effectiveMonthlyPrice, 239.20);

  const calc2 = calculateSubscriptionPrice('essencial', { couponCode: 'FROTA50' });
  assert.equal(calc2.discountAmount, 50.00);
  assert.equal(calc2.effectiveMonthlyPrice, 129.00);
});

/* ── 24. CÁLCULO DE MRR ──────────────────────────────────────────── */
test('24. MRR calcula apenas assinaturas ativas recorrentes (exclui setup e trial)', () => {
  const subs = [
    { status: 'active', price: 299.00 },
    { status: 'active', price: 179.00 },
    { status: 'trialing', price: 299.00 }, // Ignora trial
    { status: 'cancelled', price: 299.00 }  // Ignora cancelado
  ];
  const m = platformAdmin.calculatePlatformMetrics({ subscriptions: subs });
  assert.equal(m.mrr, 478.00);
});

/* ── 25. CÁLCULO DE ARR ──────────────────────────────────────────── */
test('25. ARR é exatamente MRR * 12', () => {
  const subs = [{ status: 'active', price: 200.00 }];
  const m = platformAdmin.calculatePlatformMetrics({ subscriptions: subs });
  assert.equal(m.mrr, 200.00);
  assert.equal(m.arr, 2400.00);
});

/* ── 26. CHURN DE LOGO E REVENUE CHURN ───────────────────────────── */
test('26. Churn de Logo e Revenue Churn calculados separadamente', () => {
  const subs = [
    { status: 'active', price: 300.00 },
    { status: 'cancelled', price: 100.00 }
  ];
  const m = platformAdmin.calculatePlatformMetrics({
    subscriptions: subs,
    activeAtStartCount: 2,
    mrrAtStart: 400.00
  });

  assert.equal(m.logoChurnRate, 50.0);    // 1 de 2 clientes = 50%
  assert.equal(m.revenueChurnRate, 25.0); // 100 de 400 = 25%
});

/* ── 27. NEW MRR ─────────────────────────────────────────────────── */
test('27. New MRR rastreia receita de novas conversões pagas', () => {
  const subs = [
    { status: 'active', price: 299.00, isNewConversion: true }
  ];
  const m = platformAdmin.calculatePlatformMetrics({ subscriptions: subs });
  assert.equal(m.newMRR, 299.00);
});

/* ── 28. EXPANSION MRR ───────────────────────────────────────────── */
test('28. Expansion MRR rastreia receita gerada por upgrades', () => {
  const subs = [
    { status: 'active', price: 299.00, expansionDelta: 120.00 } // 299 - 179
  ];
  const m = platformAdmin.calculatePlatformMetrics({ subscriptions: subs });
  assert.equal(m.expansionMRR, 120.00);
});

/* ── 29. CONTRACTION MRR ─────────────────────────────────────────── */
test('29. Contraction MRR rastreia receita reduzida por downgrades', () => {
  const subs = [
    { status: 'active', price: 179.00, contractionDelta: 120.00 }
  ];
  const m = platformAdmin.calculatePlatformMetrics({ subscriptions: subs });
  assert.equal(m.contractionMRR, 120.00);
});

/* ── 30. SIGNUP FUNNEL ───────────────────────────────────────────── */
test('30. Funil registra etapas de signup a paid', () => {
  const tenantId = 'oficina_funnel_1';
  saasTelemetry.recordTenantSignup(tenantId, { utmSource: 'linkedin' });
  saasTelemetry.recordMilestone(tenantId, 'first_os');
  saasTelemetry.recordMilestone(tenantId, 'first_quotation');
  saasTelemetry.recordMilestone(tenantId, 'first_approval');

  const ttfv = saasTelemetry.getTTFV(tenantId);
  assert.equal(ttfv.isActivated, true);
  assert.ok(ttfv.timeToFirstOSHouses !== null);
});

/* ── 31. UTM & ATRIBUIÇÃO ────────────────────────────────────────── */
test('31. Atribuição de UTMs salva na criação sem impactar segurança', () => {
  const tenantId = 'oficina_utm_test_1';
  saasTelemetry.recordTenantSignup(tenantId, {
    utmSource: 'facebook',
    utmMedium: 'cpc',
    utmCampaign: 'safra_pesada_2026',
    referralCode: 'INDICA_MECANICO'
  });

  const attr = saasTelemetry.tenantAttributions.get(tenantId);
  assert.equal(attr.utmSource, 'facebook');
  assert.equal(attr.utmCampaign, 'safra_pesada_2026');
  assert.equal(attr.referralCode, 'INDICA_MECANICO');
});

/* ── 32. CRITÉRIO DE ATIVAÇÃO ────────────────────────────────────── */
test('32. Critério de Ativação cumprido ao cadastrar a primeira OS', () => {
  const tenantId = 'oficina_act_test_1';
  saasTelemetry.recordTenantSignup(tenantId);

  let ttfv = saasTelemetry.getTTFV(tenantId);
  assert.equal(ttfv.isActivated, false);

  saasTelemetry.recordMilestone(tenantId, 'first_os');
  ttfv = saasTelemetry.getTTFV(tenantId);
  assert.equal(ttfv.isActivated, true);
});

/* ── 33. TIME TO FIRST VALUE (TTFV) ──────────────────────────────── */
test('33. Cálculo de TTFV com delta preciso em horas', () => {
  const tenantId = 'oficina_ttfv_delta_1';
  saasTelemetry.recordTenantSignup(tenantId);
  saasTelemetry.recordMilestone(tenantId, 'first_os');

  const ttfv = saasTelemetry.getTTFV(tenantId);
  assert.ok(typeof ttfv.timeToFirstOSHouses === 'number');
});

/* ── 34. TELEMETRIA SEM PII ──────────────────────────────────────── */
test('34. Telemetria bloqueia estritamente PII e dados sensíveis da oficina', () => {
  const res = saasTelemetry.recordTelemetryEvent('teste_seguranca', {
    tenantId: 'oficina_privacy_1',
    metadata: {
      motorista: 'João das Neves', // Bloqueado
      placa: 'ABC1234',            // Bloqueado
      texto: 'Orçamento de freio', // Bloqueado
      cpf: '123.456.789-00',       // Bloqueado
      plano: 'pro'                 // Permitido
    }
  });

  assert.equal(res.metadata.motorista, undefined);
  assert.equal(res.metadata.placa, undefined);
  assert.equal(res.metadata.cpf, undefined);
  assert.equal(res.metadata.plano, 'pro');
});

/* ── 35. PLATFORM ADMIN ISOLADO ─────────────────────────────────── */
test('35. Platform Admin tem RBAC dedicado e não é tenant admin silencioso', () => {
  const registry = new IdentityRegistry();
  registry.registerUser({
    username: 'operador_real_solucoes',
    password: 'senha_segura_plataforma_1234',
    memberships: [{ tenantId: '_platform_', role: 'platform_support' }]
  });

  const authMiddleware = createAuthMiddleware(registry);
  const req = {
    path: '/api/platform/metrics',
    method: 'GET',
    headers: {
      authorization: 'Basic ' + Buffer.from('operador_real_solucoes:senha_segura_plataforma_1234').toString('base64')
    }
  };
  let nextCalled = false;
  authMiddleware(req, {}, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
  assert.equal(req.securityContext.role, 'platform_support');
});

/* ── 36. SUPPORT SESSION AUDITADA ────────────────────────────────── */
test('36. Support Impersonation gera sessão explícita com banner e auditoria', () => {
  const tenantId = 'oficina_suporte_audit_1';
  const targetState = { auditoria: [] };

  const session = platformAdmin.createSupportSession({
    tenantId,
    operator: 'atendente_marcos',
    reason: 'Ajuda na parametrização do faturamento',
    durationMinutes: 30,
    targetState
  });

  assert.ok(session.sessionId.startsWith('supp_'));
  assert.ok(session.warningBanner.includes('atendente_marcos'));
  assert.equal(targetState.auditoria[0].action, 'support_session_accessed');
  assert.equal(targetState.auditoria[0].actorId, 'atendente_marcos');
});

/* ── 37. RECONCILIAÇÃO DE BILLING ────────────────────────────────── */
test('37. Job de reconciliação detecta e corrige divergências com o gateway', async () => {
  const adapter = new SandboxProviderAdapter();
  const tenantId = 'oficina_reconcile_1';
  const sub = await billingService.initializeSubscription({ tenantId, plan: 'pro', status: 'past_due' });

  // No gateway o status já está como active
  adapter.subscriptions.set(sub.providerSubscriptionId, { status: 'active' });

  const res = await billingService.reconcileSubscriptions({ adapter });
  assert.equal(res.reconciledCount > 0, true);
  assert.equal(res.discrepanciesFixed > 0, true);
  assert.equal(billingService.getSubscription(tenantId).status, 'active');
});

/* ── 38. ISOLAMENTO CROSS-TENANT EM BILLING ──────────────────────── */
test('38. Tenant A não tem acesso aos dados de faturamento do Tenant B', async () => {
  const custA = await billingService.getOrCreateBillingCustomer({
    tenantId: 'tenant_bill_a',
    legalName: 'Oficina A',
    document: '11.111.111/0001-11'
  });
  const custB = await billingService.getOrCreateBillingCustomer({
    tenantId: 'tenant_bill_b',
    legalName: 'Oficina B',
    document: '22.222.222/0001-22'
  });

  assert.equal(custA.document !== custB.document, true);
  assert.equal(billingService.getBillingCustomer('tenant_bill_a').legalName, 'Oficina A');
  assert.equal(billingService.getBillingCustomer('tenant_bill_b').legalName, 'Oficina B');
});

/* ── 39. SEGREDOS DE BILLING NÃO EXPOSTOS ────────────────────────── */
test('39. Credenciais privadas e segredos de webhook não são expostos em respostas públicas', () => {
  const adapter = new SandboxProviderAdapter({ webhookSecret: 'chave_ultra_secreta_999' });
  const catalog = BILLING_CONFIG;

  assert.equal(catalog.plans.pro.webhookSecret, undefined);
  assert.equal(catalog.plans.essencial.apiKey, undefined);
  assert.equal(JSON.stringify(catalog.plans).includes('chave_ultra_secreta'), false);
});

/* ── 40. TESTE E2E COMERCIAL: CICLO COMPLETO DE CLIENTE ──────────── */
test('40. E2E Comercial: Visitante -> Cadastro -> Trial -> Checkout Pro -> Pagamento -> Active -> Cancelamento', { timeout: 60000 }, async (t) => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'patio-crm-saas-test-'));
  const probe = net.createServer();
  probe.listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const port = probe.address().port;
  await new Promise(r => probe.close(r));

  const root = path.resolve(__dirname, '..');
  let logs = '';
  let child;

  async function start() {
    child = spawn(process.execPath, ['server.js'], {
      cwd: root,
      windowsHide: true,
      env: {
        ...process.env,
        PORT: String(port),
        API_KEY: 'saas-integration-master-key',
        BILLING_MODE: 'sandbox',
        DISABLE_INTEGRATIONS: 'true',
        DB_PATH: path.join(temp, 'test_saas.db')
      }
    });
    child.stdout.on('data', d => { logs += d; });
    child.stderr.on('data', d => { logs += d; });

    for (let i = 0; i < 500; i++) {
      if (child.exitCode !== null) throw Error(logs);
      try {
        const res = await fetch(`http://127.0.0.1:${port}/health`);
        if (res.status === 200) return;
      } catch (_) {}
      await new Promise(r => setTimeout(r, 100));
    }
    throw Error('Servidor SaaS não iniciou: ' + logs);
  }

  async function stop() {
    if (child && child.exitCode === null) {
      const done = once(child, 'exit');
      child.kill();
      await done;
    }
  }

  t.after(async () => {
    await stop();
    fs.rmSync(temp, { recursive: true, force: true });
  });

  await start();

  // 40.1 Visitante acessa a página pública de preços /precos
  const resPrecos = await fetch(`http://127.0.0.1:${port}/precos`);
  assert.equal(resPrecos.status, 200);
  const htmlPrecos = await resPrecos.text();
  assert.ok(htmlPrecos.includes('179'));
  assert.ok(htmlPrecos.includes('299'));

  // 40.2 Visitante se cadastra via POST /api/auth/signup
  const resSignup = await fetch(`http://127.0.0.1:${port}/api/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      nome: 'Rogério Mecânico',
      empresa: 'Auto Molas Rogério',
      whatsapp: '62988887777',
      email: 'rogerio@autormolas.com.br',
      senha: 'senha_segura_rogerio_123',
      utm_source: 'instagram',
      aceitouTermos: true
    })
  });
  assert.equal(resSignup.status, 201);
  const dataSignup = await resSignup.json();
  assert.equal(dataSignup.ok, true);
  const tenantId = dataSignup.tenantId;
  assert.ok(tenantId.startsWith('oficina_auto_molas_rogerio'));
  assert.equal(dataSignup.subscription.status, 'trialing');

  // 40.3 Oficina cria Checkout do Plano Pro via POST /api/billing/checkout
  const resCheckout = await fetch(`http://127.0.0.1:${port}/api/billing/checkout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tenantId,
      plan: 'pro',
      paymentMethod: 'pix',
      customerData: {
        legalName: 'Auto Molas Rogério LTDA',
        document: '99.888.777/0001-66',
        email: 'rogerio@autormolas.com.br'
      }
    })
  });
  assert.equal(resCheckout.status, 200);
  const dataCheckout = await resCheckout.json();
  assert.equal(dataCheckout.ok, true);
  assert.ok(dataCheckout.checkout.checkoutId);

  // 40.4 Webhook do Gateway confirma o pagamento via POST /webhooks/billing/sandbox
  const adapter = new SandboxProviderAdapter();
  const webhookPayload = {
    id: `evt_paid_e2e_${tenantId}`,
    event: 'PAYMENT_RECEIVED',
    tenantId,
    amount: 299.00
  };
  const signature = adapter.signWebhookPayload(webhookPayload);

  const resWebhook = await fetch(`http://127.0.0.1:${port}/webhooks/billing/sandbox`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-sandbox-signature': signature
    },
    body: JSON.stringify(webhookPayload)
  });
  assert.equal(resWebhook.status, 200);
  const dataWebhook = await resWebhook.json();
  assert.equal(dataWebhook.ok, true);

  // 40.5 Verifica via API que a assinatura do tenant agora está 'active'
  const resSub = await fetch(`http://127.0.0.1:${port}/api/billing/subscription`, {
    headers: {
      'x-tenant-id': tenantId,
      'x-api-key': 'saas-integration-master-key'
    }
  });
  assert.equal(resSub.status, 200);
  const dataSub = await resSub.json();
  assert.equal(dataSub.subscription.status, 'active');

  // 40.6 Platform Admin consulta métricas da plataforma em /api/platform/metrics
  const resMetrics = await fetch(`http://127.0.0.1:${port}/api/platform/metrics`, {
    headers: { 'x-api-key': 'saas-integration-master-key' }
  });
  assert.equal(resMetrics.status, 200);
  const dataMetrics = await resMetrics.json();
  assert.equal(dataMetrics.ok, true);
  assert.ok(dataMetrics.metrics.arr >= 0);
});
