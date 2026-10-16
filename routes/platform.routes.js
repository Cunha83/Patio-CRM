const express = require('express');
const router = express.Router();
const {
  getOrLoadState,
  mutateTenantState,
  extractTenantId,
  requirePermission
} = require('../lib/serverContext');
const userRepository = require('../lib/auth/userRepository');
const erpIntegrationService = require('../services/erpIntegrationService');
const platformAdmin = require('../services/billing/platformAdminService');
const billingService = require('../services/billing/billingService');
const saasTelemetry = require('../services/billing/saasTelemetryService');

router.get('/api/auditoria', requirePermission('admin:settings'), async (req, res) => {
  try {
    const tenantId = req.securityContext?.tenantId;
    const isPlatform = ['platform_admin', 'platform_support'].includes(req.securityContext?.role);
    const { action, page = 1, limit = 50 } = req.query;

    const lim = Math.max(1, Math.min(Number(limit) || 50, 200));
    const offset = (Math.max(1, Number(page) || 1) - 1) * lim;

    let whereSql = ' WHERE 1=1';
    const whereParams = [];

    if (!isPlatform && tenantId && tenantId !== '_all_') {
      whereSql += ' AND tenant_id = ?';
      whereParams.push(tenantId);
    }

    if (action) {
      whereSql += ' AND action = ?';
      whereParams.push(action);
    }

    const { all, get } = require('./db');
    const countRow = await get(`SELECT COUNT(*) as total FROM security_audit_log${whereSql}`, whereParams);

    const queryParams = [...whereParams, lim, offset];
    const sql = `SELECT * FROM security_audit_log${whereSql} ORDER BY created_at DESC LIMIT ? OFFSET ?`;
    const rows = await all(sql, queryParams);

    res.json({
      success: true,
      items: (rows || []).map(r => ({
        id: r.id,
        tenantId: r.tenant_id,
        actorId: r.actor_id,
        actorType: r.actor_type,
        action: r.action,
        entity: r.entity,
        entityId: r.entity_id,
        ipAddress: r.ip_address,
        details: JSON.parse(r.details_json || '{}'),
        createdAt: r.created_at
      })),
      total: countRow ? countRow.total : 0,
      page: Number(page) || 1,
      limit: lim
    });
  } catch (err) {
    console.error('[API /api/auditoria GET] Erro:', err);
    res.status(500).json({ error: err.message });
  }
});

/* ── LGPD: Registro de Aceite de Termos de Uso e Privacidade ── */
router.post('/api/lgpd/aceite-termos', async (req, res) => {
  try {
    const { userId, tenantId, termsVersion = '1.0', privacyVersion = '1.0' } = req.body || {};
    const targetUserId = userId || req.securityContext?.actorId;
    const targetTenantId = tenantId || req.securityContext?.tenantId;
    if (!targetUserId || !targetTenantId) {
      return res.status(400).json({ error: 'userId e tenantId são obrigatórios.' });
    }
    const record = await userRepository.recordTermsConsent({
      userId: targetUserId,
      tenantId: targetTenantId,
      termsVersion,
      privacyVersion,
      ipAddress: req.ip || req.connection?.remoteAddress,
      userAgent: req.headers['user-agent']
    });
    res.json({ success: true, consent: record });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ── Camada Canônica de Integração ERP (Fiscal & Contábil) ── */

router.get('/api/integracao/erp/status', requirePermission('reports:read', 'admin:settings', 'erp:sync'), async (req, res) => {
  try {
    const tenantId = req.securityContext?.tenantId || 'default';
    const status = await erpIntegrationService.obterStatusIntegracao({ tenantId });
    res.json({ success: true, ...status });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/api/integracao/erp/exportar/:entidade', requirePermission('reports:read', 'financial:read', 'erp:sync'), async (req, res) => {
  try {
    const { entidade } = req.params;
    const { desde, limit, cursor } = req.query;
    const state = await getOrLoadState(req);

    let resultado;
    switch (entidade) {
      case 'clientes':
        resultado = erpIntegrationService.exportarClientes({ state, desde, limit, cursor });
        break;
      case 'fornecedores':
        resultado = erpIntegrationService.exportarFornecedores({ state, desde, limit, cursor });
        break;
      case 'pecas':
        resultado = erpIntegrationService.exportarPecas({ state, desde, limit, cursor });
        break;
      case 'os':
      case 'ordens-servico':
        resultado = erpIntegrationService.exportarOrdensServico({ state, desde, limit, cursor });
        break;
      case 'contas':
        resultado = erpIntegrationService.exportarContas({ state, desde, limit, cursor });
        break;
      case 'pedidos-compra':
        resultado = erpIntegrationService.exportarPedidosCompra({ state, desde, limit, cursor });
        break;
      default:
        return res.status(400).json({
          error: `Entidade desconhecida '${entidade}'. Suportadas: clientes, fornecedores, pecas, os, contas, pedidos-compra.`
        });
    }

    res.json({
      success: true,
      entidade,
      schemaVersion: erpIntegrationService.SCHEMA_VERSION,
      ...resultado
    });
  } catch (err) {
    console.error('[API /api/integracao/erp/exportar] Erro:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/integracao/erp/sincronizar', requirePermission('erp:sync', 'admin:settings'), async (req, res) => {
  try {
    const tenantId = req.securityContext?.tenantId || 'default';
    const { entityType, entityId, erpExternalId, status = 'synced', errorMessage } = req.body || {};
    if (!entityType || !entityId) {
      return res.status(400).json({ error: 'entityType e entityId são obrigatórios.' });
    }
    const result = await erpIntegrationService.registrarSincronizacao({
      tenantId,
      entityType,
      entityId,
      erpExternalId,
      status,
      errorMessage
    });
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/integracao/erp/enfileirar', requirePermission('erp:sync', 'admin:settings'), async (req, res) => {
  try {
    const tenantId = req.securityContext?.tenantId || 'default';
    const { entityType, entityId, action, payload } = req.body || {};
    const result = await erpIntegrationService.enfileirarParaERP({
      tenantId,
      entityType,
      entityId,
      action,
      payload
    });
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/api/integracao/erp/outbox', requirePermission('erp:sync', 'admin:settings', 'reports:read'), async (req, res) => {
  try {
    const tenantId = req.securityContext?.tenantId || 'default';
    const { status, limit, offset } = req.query;
    const items = await erpIntegrationService.listarItensOutbox({
      tenantId,
      status: status || null,
      limit: limit ? Number(limit) : 50,
      offset: offset ? Number(offset) : 0
    });
    res.json({ success: true, count: items.length, items });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/integracao/erp/outbox/processar', requirePermission('erp:sync', 'admin:settings'), async (req, res) => {
  try {
    const tenantId = req.securityContext?.tenantId || 'default';
    const result = await erpIntegrationService.processarFilaOutbox({ tenantId });
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. Criação de Checkout (Self-Service de Assinatura)

router.get('/api/platform/metrics', (req, res) => {
  // Lista assinaturas para consolidar métricas
  const allSubs = [];
  for (const tid of ['default', req.securityContext?.tenantId].filter(Boolean)) {
    allSubs.push(billingService.getSubscription(tid));
  }
  const metricsData = platformAdmin.calculatePlatformMetrics({ subscriptions: allSubs });
  res.json({ ok: true, metrics: metricsData });
});

// 11. Lista de Tenants e Telemetria para Platform Admin
router.get('/api/platform/tenants', async (req, res) => {
  try {
    const rows = await all("SELECT key FROM kv WHERE key LIKE 'tenant:%:state'");
    const tenantsList = [];

    for (const r of (rows || [])) {
      const match = /^tenant:([a-zA-Z0-9_-]+):state$/.exec(r.key);
      if (match) {
        const tid = match[1];
        const sub = billingService.getSubscription(tid);
        const cost = saasTelemetry.getCostToServe(tid, sub.price);
        tenantsList.push({ tenantId: tid, subscription: sub, costToServe: cost });
      }
    }
    res.json({ ok: true, total: tenantsList.length, tenants: tenantsList });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 12. Iniciar Sessão de Suporte (Support Impersonation Auditado)
router.post('/api/platform/support/impersonate', async (req, res) => {
  const { tenantId, operator, reason, durationMinutes = 60 } = req.body || {};
  if (!tenantId || !reason) {
    return res.status(400).json({ error: 'tenantId e reason são obrigatórios.' });
  }

  const op = operator || req.securityContext?.actorId || 'suporte_real_solucoes';
  try {
    let session = null;
    await mutateTenantState(
      { securityContext: { tenantId, role: 'system', permissions: ['*'], channel: 'internal' } },
      async (draft) => {
        session = platformAdmin.createSupportSession({
          tenantId,
          operator: op,
          reason,
          durationMinutes,
          targetState: draft
        });
        return draft;
      }
    );

    res.status(201).json({ ok: true, session });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 13. Fechar Sessão de Suporte
router.post('/api/platform/support/sessions/:id/close', (req, res) => {
  const ok = platformAdmin.closeSupportSession(req.params.id, {
    operator: req.securityContext?.actorId || 'admin'
  });
  res.json({ ok });
});

// 14. Status Geral dos Subsistemas da Plataforma
router.get('/api/platform/status', (req, res) => {
  res.json(platformAdmin.getPlatformSubsystemsStatus());
});

// 15. Trilha de Auditoria da Plataforma
router.get('/api/platform/audit', (req, res) => {
  res.json({ ok: true, auditLog: platformAdmin.platformAuditLog });
});

// 16. Telemetria de Eventos sem PII
router.get('/api/platform/telemetry', (req, res) => {
  res.json({ ok: true, events: saasTelemetry.telemetryEvents });
});

// 17. Reconciliação Periódica de Assinaturas
router.post('/api/platform/reconcile', async (req, res) => {
  const result = await billingService.reconcileSubscriptions();
  res.json({ ok: true, ...result });
});

/* ── PÁGINAS COMERCIAIS PÚBLICAS ──────────────────────────── */

module.exports = router;
