const express = require('express');
const router = express.Router();
const {
  getOrLoadState,
  mutateTenantState,
  extractTenantId,
  requirePermission
} = require('../lib/serverContext');

const mechanicTimeTrackingService = require('../services/patio/mechanicTimeTrackingService');
const mechanicProductivityCommissionService = require('../services/patio/mechanicProductivityCommissionService');

// 1. Iniciar apontamento de serviço no box
router.post('/api/patio/apontamentos/iniciar', requirePermission('patio:write', 'labor:write', 'os:write'), async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    const actorId = req.securityContext?.actorId || 'operador';
    let operacao = null;

    const saveRes = await mutateTenantState(req, (draft) => {
      operacao = mechanicTimeTrackingService.iniciarApontamentoServico(draft, {
        tenantId,
        ...req.body,
        actorId
      });
    });

    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({
        success: false,
        error: saveRes?.error || 'Falha ao iniciar apontamento.'
      });
    }

    res.json({ success: true, ...operacao });
  } catch (err) {
    const code = err.code || 'APPOINTMENT_ERROR';
    const status = (code === 'MECHANIC_ALREADY_ACTIVE_IN_ANOTHER_SERVICE') ? 409 : 400;
    res.status(status).json({ success: false, code, error: err.message });
  }
});

// 2. Pausar apontamento
router.post('/api/patio/apontamentos/:id/pausar', requirePermission('patio:write', 'labor:write', 'os:write'), async (req, res) => {
  try {
    const actorId = req.securityContext?.actorId || 'operador';
    const apontamentoId = req.params.id;
    let operacao = null;

    const saveRes = await mutateTenantState(req, (draft) => {
      operacao = mechanicTimeTrackingService.pausarApontamentoServico(draft, apontamentoId, {
        motivo: req.body?.motivo,
        timestamp: req.body?.timestamp,
        actorId
      });
    });

    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({
        success: false,
        error: saveRes?.error || 'Falha ao pausar apontamento.'
      });
    }

    res.json({ success: true, ...operacao });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// 3. Retomar apontamento
router.post('/api/patio/apontamentos/:id/retomar', requirePermission('patio:write', 'labor:write', 'os:write'), async (req, res) => {
  try {
    const actorId = req.securityContext?.actorId || 'operador';
    const apontamentoId = req.params.id;
    let operacao = null;

    const saveRes = await mutateTenantState(req, (draft) => {
      operacao = mechanicTimeTrackingService.retomarApontamentoServico(draft, apontamentoId, {
        timestamp: req.body?.timestamp,
        actorId
      });
    });

    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({
        success: false,
        error: saveRes?.error || 'Falha ao retomar apontamento.'
      });
    }

    res.json({ success: true, ...operacao });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// 4. Concluir apontamento
router.post('/api/patio/apontamentos/:id/concluir', requirePermission('patio:write', 'labor:write', 'os:write'), async (req, res) => {
  try {
    const actorId = req.securityContext?.actorId || 'operador';
    const apontamentoId = req.params.id;
    let operacao = null;

    const saveRes = await mutateTenantState(req, (draft) => {
      operacao = mechanicTimeTrackingService.concluirApontamentoServico(draft, apontamentoId, {
        timestamp: req.body?.timestamp,
        observacao: req.body?.observacao,
        actorId
      });
    });

    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({
        success: false,
        error: saveRes?.error || 'Falha ao concluir apontamento.'
      });
    }

    res.json({ success: true, ...operacao });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// 5. Listar apontamentos
router.get('/api/patio/apontamentos', requirePermission('patio:read', 'labor:read', 'os:read'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const tenantId = extractTenantId(req);
    const { osId, mecanicoId, boxId, status, competencia } = req.query || {};

    const apontamentos = mechanicTimeTrackingService.listarApontamentosPatio(state, {
      tenantId,
      osId,
      mecanicoId,
      boxId,
      status,
      competencia
    });

    res.json({ success: true, total: apontamentos.length, apontamentos });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 6. Regra de comissão do mecânico
router.put('/api/patio/mecanicos/:mecanicoId/regra-comissao', requirePermission('productivity:manage', 'labor:write'), async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    const actorId = req.securityContext?.actorId || 'operador';
    const mecanicoId = req.params.mecanicoId;
    let operacao = null;

    const saveRes = await mutateTenantState(req, (draft) => {
      operacao = mechanicProductivityCommissionService.configurarRegraComissaoMecanico(draft, mecanicoId, {
        tenantId,
        ...req.body,
        actorId
      });
    });

    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({
        success: false,
        error: saveRes?.error || 'Falha ao salvar regra de comissão.'
      });
    }

    res.json({ success: true, ...operacao });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// 7. Produtividade e comissões (individual ou equipe)
router.get('/api/patio/produtividade-comissoes', requirePermission('productivity:read', 'labor:read'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const tenantId = extractTenantId(req);
    const { mecanicoId, competencia } = req.query || {};

    if (mecanicoId) {
      const calculo = mechanicProductivityCommissionService.calcularProdutividadeEComissaoMecanico(state, {
        tenantId,
        mecanicoId,
        competencia
      });
      return res.json({ success: true, ...calculo });
    }

    const resumo = mechanicProductivityCommissionService.gerarResumoProdutividadeEquipe(state, {
      tenantId,
      competencia
    });
    res.json({ success: true, ...resumo });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;

