const express = require('express');
const router = express.Router();
const {
  getOrLoadState,
  salvarEstado,
  mutateTenantState,
  extractTenantId,
  requirePermission
} = require('../lib/serverContext');
const inspectionService = require('../services/inspectionService');

router.get('/api/inspecoes', requirePermission('inspection:read'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const tenantId = extractTenantId(req);
    const { osId, vehicleId, placa, status } = req.query || {};
    const lista = inspectionService.listarInspecoes({ tenantId, state, osId, vehicleId, placa, status });
    res.json({
      success: true,
      total: lista.length,
      inspecoes: lista
    });
  } catch (err) {
    console.error('[API /api/inspecoes GET] Erro:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/api/inspecoes/:id', requirePermission('inspection:read'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const tenantId = extractTenantId(req);
    const inspecao = inspectionService.obterInspecao({ tenantId, state, inspectionId: req.params.id });
    if (!inspecao) {
      return res.status(404).json({ error: 'Inspeção não encontrada.' });
    }
    res.json({
      success: true,
      inspecao
    });
  } catch (err) {
    console.error('[API /api/inspecoes/:id GET] Erro:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/inspecoes', requirePermission('inspection:write'), async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    const { preOSId, osId, vehicleId, placa, clienteId, mechanicId, mecanico, reclamacaoCliente } = req.body || {};
    let resultado = null;
    const saveRes = await mutateTenantState(req, (draft) => {
      resultado = inspectionService.criarInspecao({
        tenantId,
        state: draft,
        preOSId,
        osId,
        vehicleId,
        placa,
        clienteId,
        mechanicId,
        mecanico,
        reclamacaoCliente,
        actorId: req.securityContext?.actorId || 'operador'
      });
    });
    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({
        success: false,
        error: saveRes?.error || 'Falha ao criar inspeção.'
      });
    }
    res.json({
      success: true,
      ...resultado,
      novoEstado: { versao: saveRes.versao }
    });
  } catch (err) {
    console.error('[API /api/inspecoes POST] Erro:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/inspecoes/:id/itens', requirePermission('inspection:write'), async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    const item = req.body || {};
    let resultado = null;
    const saveRes = await mutateTenantState(req, (draft) => {
      resultado = inspectionService.adicionarItemInspecao({
        tenantId,
        state: draft,
        inspectionId: req.params.id,
        item,
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
        error: saveRes?.error || 'Falha ao adicionar item na inspeção.'
      });
    }
    res.json({
      success: true,
      ...resultado,
      novoEstado: { versao: saveRes.versao }
    });
  } catch (err) {
    console.error('[API /api/inspecoes/:id/itens] Erro:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/inspecoes/:id/itens/:itemId/diagnostico', requirePermission('inspection:write'), async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    const { diagnosticoConfirmado, confirmedBy } = req.body || {};
    let resultado = null;
    const saveRes = await mutateTenantState(req, (draft) => {
      resultado = inspectionService.confirmarDiagnosticoHumano({
        tenantId,
        state: draft,
        inspectionId: req.params.id,
        itemId: req.params.itemId,
        diagnosticoConfirmado,
        confirmedBy,
        actorId: req.securityContext?.actorId || 'mecanico'
      });
      if (!resultado.ok) {
        return { abort: true, resultado };
      }
    });
    if (saveRes?.aborted && saveRes?.mutatorResult?.resultado) {
      const r = saveRes.mutatorResult.resultado;
      return res.status(r.status || 422).json(r);
    }
    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({
        success: false,
        error: saveRes?.error || 'Falha ao confirmar diagnóstico da inspeção.'
      });
    }
    res.json({
      success: true,
      ...resultado,
      novoEstado: { versao: saveRes.versao }
    });
  } catch (err) {
    console.error('[API /api/inspecoes/:id/itens/:itemId/diagnostico] Erro:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/inspecoes/:id/itens/:itemId/fotos', requirePermission('inspection:write'), async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    const { fotoBase64, url, descricao } = req.body || {};
    let resultado = null;
    const saveRes = await mutateTenantState(req, (draft) => {
      resultado = inspectionService.adicionarFotoItem({
        tenantId,
        state: draft,
        inspectionId: req.params.id,
        itemId: req.params.itemId,
        fotoBase64,
        url,
        descricao,
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
        error: saveRes?.error || 'Falha ao adicionar foto ao item.'
      });
    }
    res.json({
      success: true,
      ...resultado,
      novoEstado: { versao: saveRes.versao }
    });
  } catch (err) {
    console.error('[API /api/inspecoes/:id/itens/:itemId/fotos] Erro:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/inspecoes/:id/itens/:itemId/servicos', requirePermission('inspection:write'), async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    const servico = req.body || {};
    let resultado = null;
    const saveRes = await mutateTenantState(req, (draft) => {
      resultado = inspectionService.adicionarServicoRecomendado({
        tenantId,
        state: draft,
        inspectionId: req.params.id,
        itemId: req.params.itemId,
        servico,
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
        error: saveRes?.error || 'Falha ao adicionar serviço recomendado.'
      });
    }
    res.json({
      success: true,
      ...resultado,
      novoEstado: { versao: saveRes.versao }
    });
  } catch (err) {
    console.error('[API /api/inspecoes/:id/itens/:itemId/servicos] Erro:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/inspecoes/:id/concluir', requirePermission('inspection:write'), async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    const { laudoGeral } = req.body || {};
    let resultado = null;
    const saveRes = await mutateTenantState(req, (draft) => {
      resultado = inspectionService.concluirInspecao({
        tenantId,
        state: draft,
        inspectionId: req.params.id,
        laudoGeral,
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
        error: saveRes?.error || 'Falha ao concluir inspeção.'
      });
    }
    res.json({
      success: true,
      ...resultado,
      novoEstado: { versao: saveRes.versao }
    });
  } catch (err) {
    console.error('[API /api/inspecoes/:id/concluir] Erro:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/inspecoes/:id/cancelar', requirePermission('inspection:write'), async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    const { motivo } = req.body || {};
    let resultado = null;
    const saveRes = await mutateTenantState(req, (draft) => {
      resultado = inspectionService.cancelarInspecao({
        tenantId,
        state: draft,
        inspectionId: req.params.id,
        motivo,
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
        error: saveRes?.error || 'Falha ao cancelar inspeção.'
      });
    }
    res.json({
      success: true,
      ...resultado,
      novoEstado: { versao: saveRes.versao }
    });
  } catch (err) {
    console.error('[API /api/inspecoes/:id/cancelar] Erro:', err);
    res.status(500).json({ error: err.message });
  }
});

/* ── Gestão Comercial de Orçamentos e Versionamento ────────── */

module.exports = router;
