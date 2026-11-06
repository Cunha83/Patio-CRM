const express = require('express');
const router = express.Router();
const {
  getOrLoadState,
  salvarEstado,
  mutateTenantState,
  extractTenantId,
  requirePermission,
  gerarId,
  getAiClient
} = require('../lib/serverContext');
const preOSEngine = require('../services/preOSEngine');
const technicalIntakeEngine = require('../services/technicalIntakeEngine');
const {
  validarTokenAcao,
  consumirTokenAcao
} = require('../lib/tokens/securityToken');

router.post('/api/pre-os/triagem', async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    const { vehicleId, placa, clienteId, motorista, kmAtual, reclamacao, origem } = req.body || {};
    let resultado = null;
    const saveRes = await mutateTenantState(req, (draft) => {
      resultado = preOSEngine.triagemEntrada({
        tenantId,
        vehicleId,
        placa,
        clienteId,
        motorista,
        kmAtual,
        reclamacao,
        origem: origem || 'web',
        actorId: req.securityContext?.actorId || 'operador',
        state: draft
      });
    });
    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({
        success: false,
        error: saveRes?.error || 'Falha ao realizar triagem de Pré-OS.'
      });
    }
    res.json({
      success: true,
      ...resultado,
      novoEstado: { versao: saveRes.versao }
    });
  } catch (err) {
    console.error('[API /api/pre-os/triagem] Erro:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/api/pre-os', async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const tenantId = extractTenantId(req);
    const { status, placa } = req.query || {};
    const lista = preOSEngine.listarPreOS({ tenantId, state, status, placa });
    res.json({
      success: true,
      total: lista.length,
      preOS: lista
    });
  } catch (err) {
    console.error('[API /api/pre-os GET] Erro:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/api/pre-os/:id', async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const tenantId = extractTenantId(req);
    const preOS = preOSEngine.consultarPreOS({ tenantId, preOSId: req.params.id, state });
    if (!preOS) {
      return res.status(404).json({ error: 'Pré-OS não encontrada.' });
    }
    res.json({
      success: true,
      preOS
    });
  } catch (err) {
    console.error('[API /api/pre-os/:id GET] Erro:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/pre-os/:id/converter', async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    const { boxId, mecanico } = req.body || {};
    let resultado = null;
    const saveRes = await mutateTenantState(req, (draft) => {
      resultado = preOSEngine.converterEmOS({
        tenantId,
        preOSId: req.params.id,
        state: draft,
        actorId: req.securityContext?.actorId || 'operador',
        boxId,
        mecanico
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
        error: saveRes?.error || 'Falha ao converter Pré-OS em OS.'
      });
    }
    res.json({
      success: true,
      ...resultado,
      novoEstado: { versao: saveRes.versao }
    });
  } catch (err) {
    console.error('[API /api/pre-os/:id/converter] Erro:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/pre-os/:id/cancelar', async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    const { motivo } = req.body || {};
    let resultado = null;
    const saveRes = await mutateTenantState(req, (draft) => {
      resultado = preOSEngine.cancelarPreOS({
        tenantId,
        preOSId: req.params.id,
        motivo,
        state: draft,
        actorId: req.securityContext?.actorId || 'operador'
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
        error: saveRes?.error || 'Falha ao cancelar Pré-OS.'
      });
    }
    res.json({
      success: true,
      ...resultado,
      novoEstado: { versao: saveRes.versao }
    });
  } catch (err) {
    console.error('[API /api/pre-os/:id/cancelar] Erro:', err);
    res.status(500).json({ error: err.message });
  }
});

/* ── Gestão de Recepção Técnica Conversacional (Technical Intake) ── */

module.exports = router;
