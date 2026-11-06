const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const {
  getOrLoadState,
  salvarEstado,
  persistTenantState,
  mutateTenantState,
  extractTenantId,
  requirePermission,
  getAiClient
} = require('../lib/serverContext');
const { salvarUpload, removerUpload } = require('../lib/file-storage');
const lgpdService = require('../services/lgpdService');
const demoDataService = require('../services/demoDataService');
const operationalSummaryService = require('../services/operationalSummaryService');
const financialEngine = require('../services/financialEngine');

const limiterUploads = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  message: { success: false, error: 'Limite de uploads temporariamente excedido.' },
  standardHeaders: true,
  legacyHeaders: false
});

router.get('/api/lgpd/clientes/:id/exportar', requirePermission('crm:read'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const tenantId = extractTenantId(req);
    const resultado = await lgpdService.exportarDadosClienteAsync({ tenantId, state, customerId: req.params.id });
    if (!resultado.ok) return res.status(resultado.status || 404).json(resultado);
    res.json(resultado);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/api/lgpd/clientes/:id/anonimizar', requirePermission('crm:write', 'admin:settings'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const tenantId = extractTenantId(req);
    const { motivo } = req.body || {};
    const resultado = lgpdService.anonimizarDadosCliente({
      tenantId,
      state,
      customerId: req.params.id,
      motivo,
      ator: req.securityContext?.actorId || 'operador'
    });
    if (!resultado.ok) return res.status(404).json(resultado);
    const saveRes = await persistTenantState(req, state);
    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({ success: false, error: saveRes?.error || 'Falha ao anonimizar cliente.' });
    }
    res.json(resultado);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/* ── 10. ONBOARDING & DADOS DE DEMONSTRAÇÃO ─────────────────────── */
router.post('/api/onboarding/demo-data', requirePermission('company:settings', 'admin:settings'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const tenantId = extractTenantId(req);
    const resultado = demoDataService.carregarDadosDemonstracao({
      tenantId,
      state,
      ator: req.securityContext?.actorId || 'administrador'
    });
    const saveRes = await persistTenantState(req, state);
    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({ success: false, error: saveRes?.error || 'Falha ao carregar dados de demonstração.' });
    }
    res.json(resultado);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/api/onboarding/demo-data', requirePermission('company:settings', 'admin:settings'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const tenantId = extractTenantId(req);
    const resultado = demoDataService.removerDadosDemonstracao({
      tenantId,
      state,
      ator: req.securityContext?.actorId || 'administrador'
    });
    const saveRes = await persistTenantState(req, state);
    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({ success: false, error: saveRes?.error || 'Falha ao remover dados de demonstração.' });
    }
    res.json(resultado);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/* ── 11. ASSINATURA SaaS & FEATURE FLAGS ────────────────────────── */



module.exports = router;
