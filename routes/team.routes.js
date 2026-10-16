const express = require('express');
const router = express.Router();
const {
  getOrLoadState,
  salvarEstado,
  mutateTenantState,
  extractTenantId,
  requirePermission
} = require('../lib/serverContext');
const laborTrackingService = require('../services/laborTrackingService');
const productivityService = require('../services/productivityService');

router.get('/api/equipe', requirePermission('labor:read', 'labor:write'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const tenantId = extractTenantId(req);
    const perms = req.securityContext?.permissions || [];
    const colaboradores = laborTrackingService.listarColaboradores({
      tenantId,
      state,
      incluirInativos: req.query.inativos === 'true',
      userPermissions: perms
    });
    res.json({ success: true, colaboradores });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/api/equipe/agora', requirePermission('labor:read', 'productivity:read', 'operation:read'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const tenantId = extractTenantId(req);
    const agora = req.query.agora ? new Date(req.query.agora) : new Date();
    const equipe = productivityService.obterEquipeAgora({ tenantId, state, agora });
    res.json({ success: true, equipe });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/equipe', requirePermission('labor:write', 'productivity:manage'), async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    let resultado = null;
    const saveRes = await mutateTenantState(req, (draft) => {
      resultado = laborTrackingService.cadastrarColaborador({
        tenantId,
        state: draft,
        workerData: req.body,
        actorId: req.securityContext?.actorId || 'gerente'
      });
    });
    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({
        success: false,
        error: saveRes?.error || 'Falha ao persistir colaborador.'
      });
    }
    res.json({ success: true, ...resultado });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/api/equipe/:id', requirePermission('labor:read', 'labor:write'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const tenantId = extractTenantId(req);
    const perms = req.securityContext?.permissions || [];
    const colaborador = laborTrackingService.obterColaborador({
      tenantId,
      state,
      workerId: req.params.id,
      userPermissions: perms
    });
    if (!colaborador) return res.status(404).json({ error: 'Colaborador não encontrado.' });
    res.json({ success: true, colaborador });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/api/equipe/:id', requirePermission('labor:write', 'productivity:manage'), async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    let resultado = null;
    const saveRes = await mutateTenantState(req, (draft) => {
      resultado = laborTrackingService.atualizarColaborador({
        tenantId,
        state: draft,
        workerId: req.params.id,
        workerData: req.body,
        actorId: req.securityContext?.actorId || 'gerente'
      });
    });
    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({
        success: false,
        error: saveRes?.error || 'Falha ao persistir alteração do colaborador.'
      });
    }
    res.json({ success: true, ...resultado });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/* ── Apontamentos de Tempo (Labor Tracking) ─────────────────── */
router.get('/api/apontamentos', requirePermission('labor:read', 'labor:write'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const tenantId = extractTenantId(req);
    const apontamentos = laborTrackingService.listarApontamentos({
      tenantId,
      state,
      workerId: req.query.workerId,
      osId: req.query.osId,
      status: req.query.status,
      type: req.query.type,
      dataInicio: req.query.dataInicio,
      dataFim: req.query.dataFim,
      limit: parseInt(req.query.limit, 10) || 100
    });
    res.json({ success: true, total: apontamentos.length, apontamentos });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/apontamentos/iniciar', requirePermission('labor:write'), async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    let resultado = null;
    const saveRes = await mutateTenantState(req, (draft) => {
      resultado = laborTrackingService.iniciarApontamento({
        tenantId,
        state: draft,
        workerId: req.body.workerId,
        osId: req.body.osId,
        serviceItemId: req.body.serviceItemId,
        boxId: req.body.boxId,
        type: req.body.type || 'produtivo',
        source: req.body.source || 'web',
        causaRetrabalho: req.body.causaRetrabalho,
        reworkOriginalEntryId: req.body.reworkOriginalEntryId,
        timestamp: req.body.timestamp,
        actorId: req.securityContext?.actorId || 'operador'
      });
    });
    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({
        success: false,
        error: saveRes?.error || 'Falha ao persistir início de apontamento.'
      });
    }
    res.json({ success: true, ...resultado });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/api/apontamentos/:id/pausar', requirePermission('labor:write'), async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    let resultado = null;
    const saveRes = await mutateTenantState(req, (draft) => {
      resultado = laborTrackingService.pausarApontamento({
        tenantId,
        state: draft,
        entryId: req.params.id,
        motivo: req.body.motivo || 'pausa',
        timestamp: req.body.timestamp,
        actorId: req.securityContext?.actorId || 'operador'
      });
    });
    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({
        success: false,
        error: saveRes?.error || 'Falha ao persistir pausa de apontamento.'
      });
    }
    res.json({ success: true, ...resultado });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/api/apontamentos/:id/retomar', requirePermission('labor:write'), async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    let resultado = null;
    const saveRes = await mutateTenantState(req, (draft) => {
      resultado = laborTrackingService.retomarApontamento({
        tenantId,
        state: draft,
        entryId: req.params.id,
        timestamp: req.body.timestamp,
        actorId: req.securityContext?.actorId || 'operador'
      });
    });
    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({
        success: false,
        error: saveRes?.error || 'Falha ao persistir retomada de apontamento.'
      });
    }
    res.json({ success: true, ...resultado });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/api/apontamentos/:id/encerrar', requirePermission('labor:write'), async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    let resultado = null;
    const saveRes = await mutateTenantState(req, (draft) => {
      resultado = laborTrackingService.encerrarApontamento({
        tenantId,
        state: draft,
        entryId: req.params.id,
        timestamp: req.body.timestamp,
        actorId: req.securityContext?.actorId || 'operador'
      });
    });
    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({
        success: false,
        error: saveRes?.error || 'Falha ao persistir encerramento de apontamento.'
      });
    }
    res.json({ success: true, ...resultado });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/api/apontamentos/:id/ajustar', requirePermission('labor:adjust'), async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    let resultado = null;
    const saveRes = await mutateTenantState(req, (draft) => {
      resultado = laborTrackingService.ajustarApontamentoManual({
        tenantId,
        state: draft,
        entryId: req.params.id,
        dadosAjuste: req.body.dadosAjuste || req.body,
        motivo: req.body.motivo,
        actorId: req.securityContext?.actorId || 'gerente'
      });
    });
    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({
        success: false,
        error: saveRes?.error || 'Falha ao persistir ajuste de apontamento.'
      });
    }
    res.json({ success: true, ...resultado });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/* ── Produtividade & Capacidade ─────────────────────────────── */
router.get('/api/produtividade/resumo', requirePermission('productivity:read'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const tenantId = extractTenantId(req);
    const dataRef = req.query.data || null;
    const agora = req.query.agora ? new Date(req.query.agora) : new Date();
    const resumo = productivityService.calcularProdutividadeOficina({ tenantId, state, dataReferencia: dataRef, agora });
    const capacidade = productivityService.calcularCapacidadeDiaria({ tenantId, state, dataReferencia: dataRef, agora });
    res.json({ success: true, resumo, capacidade });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/api/produtividade/mecanicos', requirePermission('productivity:read'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const tenantId = extractTenantId(req);
    const dataRef = req.query.data || null;
    const agora = req.query.agora ? new Date(req.query.agora) : new Date();
    const prod = productivityService.calcularProdutividadeOficina({ tenantId, state, dataReferencia: dataRef, agora });
    res.json({ success: true, data: prod.dataReferencia, mecanicos: prod.mecanicos });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/api/produtividade/os/:id', requirePermission('productivity:read', 'labor:read'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const tenantId = extractTenantId(req);
    const osId = req.params.id;
    const serviceItemId = req.query.serviceItemId || null;
    if (serviceItemId) {
      const comp = productivityService.compararEstimadoVsReal({ tenantId, state, osId, serviceItemId });
      return res.json({ success: true, ...comp });
    }
    const apontamentos = laborTrackingService.listarApontamentos({ tenantId, state, osId });
    res.json({ success: true, osId, apontamentos });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ── Custo Real da OS e Margem Bruta ────────────────────────── */

module.exports = router;
