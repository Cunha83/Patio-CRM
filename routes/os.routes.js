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
const { salvarUpload } = require('../lib/file-storage');
const vehicleReconciliation = require('../services/vehicleReconciliation');
const costingService = require('../services/costingService');
const inventoryService = require('../services/inventoryService');
const { processarEntradaVeiculo } = require('../services/vehicleEntryService');

router.post('/api/os/:id/anexar-foto', async (req, res) => {
  try {
    const osId = req.params.id;
    const { imagemBase64, placaInformada, confirmarConflito, tokenConfirmacao } = req.body || {};

    if (!imagemBase64 && !placaInformada && !tokenConfirmacao) {
      return res.status(400).json({ error: 'Envie a foto em base64, a placa ou o token de confirmação.' });
    }

    let resultado = null;
    const saveRes = await mutateTenantState(req, async (draft) => {
      resultado = await vehicleReconciliation.conciliarVeiculoOS({
        osId,
        placaInformada,
        imagemBase64,
        confirmarConflito: Boolean(confirmarConflito),
        tokenConfirmacao,
        state: draft,
        aiClient: getAiClient(),
        context: req.securityContext
      });

      if (!resultado.ok || resultado.conflito) {
        return { abort: true, resultado };
      }
    });

    if (saveRes?.aborted && saveRes?.mutatorResult?.resultado) {
      const r = saveRes.mutatorResult.resultado;
      if (!r.ok) return res.status(422).json(r);
      if (r.conflito) return res.status(409).json(r);
    }

    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({
        success: false,
        error: saveRes?.error || 'Falha ao conciliar veículo e anexar foto.'
      });
    }

    res.json({
      success: true,
      ...resultado,
      novoEstado: { versao: saveRes.versao }
    });
  } catch (err) {
    console.error('[API /api/os/:id/anexar-foto] Erro:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/veiculos/conciliar', async (req, res) => {
  try {
    const { osId, imagemBase64, placaInformada, confirmarConflito, tokenConfirmacao } = req.body || {};
    if (!osId && !tokenConfirmacao) {
      return res.status(400).json({ error: 'Identificador da OS ou token de confirmação é obrigatório.' });
    }

    let resultado = null;
    const saveRes = await mutateTenantState(req, async (draft) => {
      resultado = await vehicleReconciliation.conciliarVeiculoOS({
        osId,
        placaInformada,
        imagemBase64,
        confirmarConflito: Boolean(confirmarConflito),
        tokenConfirmacao,
        state: draft,
        aiClient: getAiClient(),
        context: req.securityContext
      });

      if (!resultado.ok || resultado.conflito) {
        return { abort: true, resultado };
      }
    });

    if (saveRes?.aborted && saveRes?.mutatorResult?.resultado) {
      const r = saveRes.mutatorResult.resultado;
      if (!r.ok) return res.status(422).json(r);
      if (r.conflito) return res.status(409).json(r);
    }

    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({
        success: false,
        error: saveRes?.error || 'Falha ao conciliar veículo.'
      });
    }

    res.json({
      success: true,
      ...resultado,
      novoEstado: { versao: saveRes.versao }
    });
  } catch (err) {
    console.error('[API /api/veiculos/conciliar] Erro:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/os/entrada', async (req, res) => {
  try {
    const { placa, clienteNome, clienteFone, textoOriginal, servicos } = req.body || {};
    const resultado = await processarEntradaVeiculo({
      placa,
      clienteNome,
      clienteFone,
      textoOriginal,
      servicos,
      req
    });
    res.json({
      success: true,
      pendenteConfirmacao: Boolean(resultado.pendenteConfirmacao),
      os: resultado.novaOS,
      preOS: resultado.preOS,
      preOSId: resultado.preOS?.id || null,
      token: resultado.token,
      veiculo: resultado.veiculo,
      box: resultado.boxLivre,
      resposta: resultado.respostaWhatsApp
    });
  } catch (err) {
    console.error('[API /api/os/entrada] Erro:', err);
    res.status(500).json({ error: err.message });
  }
});

/* ── Gestão de Pré-Ordem de Serviço (Pré-OS) ────────────────── */

router.post('/api/os/:id/pecas/consumir', requirePermission('os:write'), async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    let resultado = null;
    const saveRes = await mutateTenantState(req, (draft) => {
      resultado = inventoryService.consumirPecaOS({
        tenantId,
        state: draft,
        osId: req.params.id,
        partId: req.body.partId,
        quantity: req.body.quantidade,
        mechanicId: req.body.mecanicoId || req.securityContext?.actorId,
        actorId: req.securityContext?.actorId || 'mecanico'
      });
    });
    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({
        success: false,
        error: saveRes?.error || 'Falha ao persistir consumo de peça na OS.'
      });
    }
    res.json({ success: true, ...resultado });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/api/os/:id/pecas/devolver', requirePermission('os:write'), async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    let resultado = null;
    const saveRes = await mutateTenantState(req, (draft) => {
      resultado = inventoryService.devolverPecaOS({
        tenantId,
        state: draft,
        osId: req.params.id,
        partId: req.body.partId,
        quantity: req.body.quantidade,
        reason: req.body.motivo,
        actorId: req.securityContext?.actorId || 'mecanico'
      });
    });
    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({
        success: false,
        error: saveRes?.error || 'Falha ao persistir devolução de peça da OS.'
      });
    }
    res.json({ success: true, ...resultado });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/* ── Equipe, Colaboradores & Mecânicos ───────────────────────── */

router.get('/api/os/:id/custos', requirePermission('costing:read', 'productivity:manage'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const tenantId = extractTenantId(req);
    const custos = costingService.calcularCustoRealOS({ tenantId, state, osId: req.params.id });
    res.json({ success: true, custos });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/api/os/:id', requirePermission('os:delete'), async (req, res, next) => {
  try {
    const { id } = req.params;
    if (id === 'lote') return next();
    let removido = false;
    const saveRes = await mutateTenantState(req, (draft) => {
      draft.os = Array.isArray(draft.os) ? draft.os : [];
      const antes = draft.os.length;
      draft.os = draft.os.filter(x => x.id !== id && String(x.num) !== id);
      removido = draft.os.length < antes;

      draft.auditoria = Array.isArray(draft.auditoria) ? draft.auditoria : [];
      draft.auditoria.push({
        id: 'aud_' + Date.now(),
        tipo: 'EXCLUSAO_OS',
        entidade: 'os',
        osId: id,
        timestamp: new Date().toISOString(),
        usuario: req.securityContext?.actorId || 'operador'
      });
    });

    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({ success: false, error: saveRes?.error || 'Erro ao excluir OS.' });
    }

    res.json({ success: true, removido });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/* ── Precificação Assistida e Análise de Rentabilidade ──────── */

module.exports = router;
