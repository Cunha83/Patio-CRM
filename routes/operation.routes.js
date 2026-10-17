const express = require('express');
const router = express.Router();
const {
  getOrLoadState,
  mutateTenantState,
  extractTenantId,
  requirePermission,
  runningEvaluations,
  enqueueWrite
} = require('../lib/serverContext');
const financialEngine = require('../services/financialEngine');
const operationalIntelligenceEngine = require('../services/operationalIntelligenceEngine');
const operationalSummaryService = require('../services/operationalSummaryService');
const proactiveAlertsService = require('../services/proactiveAlertsService');
const executiveManagerService = require('../services/executiveManagerService');

router.get('/api/financeiro/dashboard', requirePermission('financial:read'), async (req, res) => {
  try {
    const targetState = await getOrLoadState(req);
    const filtro = req.query.filtro || '30d';
    const dataRef = req.query.dataRef || null;
    const customDe = req.query.de || null;
    const customAte = req.query.ate || null;
    const dash = financialEngine.obterDashboardFinanceiro(targetState, { filtro, dataRef, customDe, customAte });
    res.json(dash);
  } catch (err) {
    console.error('[API /api/financeiro/dashboard] Erro:', err);
    res.status(500).json({ error: err.message });
  }
});


router.get('/api/operacao/resumo', requirePermission('operation:read'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const tenantId = extractTenantId(req);
    const { data, hora } = req.query || {};
    const resumo = operationalSummaryService.gerarResumoOperacional({
      tenantId,
      state,
      dataReferencia: data,
      horaReferencia: hora
    });
    res.json({
      success: true,
      resumo
    });
  } catch (err) {
    console.error('[API /api/operacao/resumo GET] Erro:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/api/operacao/alertas', requirePermission('operation:read'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const tenantId = extractTenantId(req);
    const { status, severidade, prioridade, tipo, limit } = req.query || {};
    const alertas = operationalIntelligenceEngine.listarEventos({
      tenantId,
      state,
      status,
      severidade,
      prioridade,
      tipo,
      limit: limit ? Number(limit) : 50
    });
    res.json({
      success: true,
      total: alertas.length,
      alertas
    });
  } catch (err) {
    console.error('[API /api/operacao/alertas GET] Erro:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/api/operacao/alertas/:id', requirePermission('operation:read'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const tenantId = extractTenantId(req);
    const alerta = operationalIntelligenceEngine.obterEvento({
      tenantId,
      state,
      eventId: req.params.id
    });
    if (!alerta) {
      return res.status(404).json({ error: 'Alerta operacional não encontrado.' });
    }
    res.json({
      success: true,
      alerta
    });
  } catch (err) {
    console.error('[API /api/operacao/alertas/:id GET] Erro:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/operacao/alertas/:id/reconhecer', requirePermission('operation:read', 'operation:manage'), async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    const { motivo } = req.body || {};
    let resultado = null;
    const saveRes = await mutateTenantState(req, (draft) => {
      resultado = operationalIntelligenceEngine.reconhecerEvento({
        tenantId,
        eventId: req.params.id,
        actorId: req.securityContext?.actorId || 'operador',
        motivo,
        state: draft
      });
      if (!resultado.ok) {
        return { abort: true, resultado };
      }
    });
    if (saveRes?.aborted && saveRes?.mutatorResult?.resultado) {
      const r = saveRes.mutatorResult.resultado;
      return res.status(r.status || 400).json(r);
    }
    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({
        success: false,
        error: saveRes?.error || 'Falha ao reconhecer alerta operacional.'
      });
    }
    res.json({
      success: true,
      alerta: resultado.evento,
      novoEstado: { versao: saveRes.versao }
    });
  } catch (err) {
    console.error('[API /api/operacao/alertas/:id/reconhecer POST] Erro:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/api/operacao/gargalos', requirePermission('operation:read'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const tenantId = extractTenantId(req);
    const resumo = operationalSummaryService.gerarResumoOperacional({
      tenantId,
      state
    });
    res.json({
      success: true,
      maiorGargalo: resumo.maiorGargalo,
      estagios: resumo.estagios
    });
  } catch (err) {
    console.error('[API /api/operacao/gargalos GET] Erro:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/api/operacao/painel', requirePermission('operation:read'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const tenantId = extractTenantId(req);
    const { data, hora, filtroStatus, busca } = req.query || {};
    const painel = operationalSummaryService.gerarPainelOperacionalCompleto({
      tenantId,
      state,
      dataReferencia: data,
      horaReferencia: hora,
      filtroStatus,
      busca
    });
    res.json({
      success: true,
      painel
    });
  } catch (err) {
    console.error('[API /api/operacao/painel GET] Erro:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/api/operacao/historico', requirePermission('operation:read'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const tenantId = extractTenantId(req);
    const { periodo } = req.query || {};
    const historico = operationalSummaryService.obterHistoricoSnapshots({
      tenantId,
      state,
      periodo
    });
    res.json({
      success: true,
      total: historico.length,
      historico
    });
  } catch (err) {
    console.error('[API /api/operacao/historico GET] Erro:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/operacao/avaliar', requirePermission('operation:manage'), async (req, res) => {
  const tenantId = extractTenantId(req);
  if (runningEvaluations.has(tenantId)) {
    return res.status(429).json({ error: 'Avaliação operacional já em execução para este tenant.' });
  }
  runningEvaluations.add(tenantId);
  try {
    const { dataReferencia, horaReferencia, agoraIso } = req.body || {};
    let resultado = null;
    const saveRes = await mutateTenantState(req, (draft) => {
      resultado = operationalIntelligenceEngine.avaliarOperacao({
        tenantId,
        state: draft,
        dataReferencia,
        horaReferencia,
        agoraIso
      });
    });
    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({
        success: false,
        error: saveRes?.error || 'Falha ao avaliar operação.'
      });
    }
    res.json({
      success: true,
      ...resultado,
      novoEstado: { versao: saveRes.versao }
    });
  } catch (err) {
    console.error('[API /api/operacao/avaliar POST] Erro:', err);
    res.status(500).json({ error: err.message });
  } finally {
    runningEvaluations.delete(tenantId);
  }
});

/* ── ALERTAS PROATIVOS DA VERÔNICA (ORÇAMENTOS PARADOS & GARGALOS EM BOXES) ── */
router.get('/api/operacao/alertas-proativos', requirePermission('operation:read', 'assistant:settings'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const tenantId = extractTenantId(req);
    const resultado = proactiveAlertsService.avaliarAlertasProativos({ state, tenantId });
    res.json(resultado);
  } catch (err) {
    console.error('[API /api/operacao/alertas-proativos GET] Erro:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/api/operacao/alertas-proativos/disparar', requirePermission('operation:manage', 'assistant:settings', 'admin:settings'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const tenantId = extractTenantId(req);
    const { force } = req.body || {};
    const resultado = await proactiveAlertsService.dispararAlertasProativos({
      state,
      tenantId,
      force: Boolean(force)
    });
    res.json(resultado);
  } catch (err) {
    console.error('[API /api/operacao/alertas-proativos/disparar POST] Erro:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/* ── VERÔNICA GESTORA 360º (SUPRIMENTOS, PRODUTIVIDADE & INTELIGÊNCIA COMERCIAL) ── */
router.get('/api/operacao/gestao-360', requirePermission('operation:read'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const tenantId = extractTenantId(req);
    const { dataReferencia } = req.query || {};
    const relatorio = executiveManagerService.gerarRelatorioGerencial360(state, {
      tenantId,
      dataReferencia
    });
    res.json(relatorio);
  } catch (err) {
    console.error('[API /api/operacao/gestao-360 GET] Erro:', err);
    res.status(500).json({ sucesso: false, error: err.message });
  }
});

router.get('/api/operacao/compras-sugeridas', requirePermission('operation:read'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const tenantId = extractTenantId(req);
    const { dataRef } = req.query || {};
    const analise = executiveManagerService.analisarComprasEEstoque(state, {
      tenantId,
      dataRef
    });
    res.json(analise);
  } catch (err) {
    console.error('[API /api/operacao/compras-sugeridas GET] Erro:', err);
    res.status(500).json({ sucesso: false, error: err.message });
  }
});

router.get('/api/operacao/produtividade-equipe', requirePermission('operation:read'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const tenantId = extractTenantId(req);
    const { dataReferencia } = req.query || {};
    const analise = executiveManagerService.analisarProdutividadeEquipe(state, {
      tenantId,
      dataReferencia
    });
    res.json(analise);
  } catch (err) {
    console.error('[API /api/operacao/produtividade-equipe GET] Erro:', err);
    res.status(500).json({ sucesso: false, error: err.message });
  }
});

/* ── BILLING & PLATAFORMA SAAS (REAL SOLUÇÕES) ─────────────── */

// Rate Limiter para Webhooks

module.exports = router;
