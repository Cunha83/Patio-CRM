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
router.post('/api/intake/iniciar', async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    const { vehicleId, placa, clienteId, kmAtual, reclamacao, channel } = req.body || {};
    let resultado = null;
    const saveRes = await mutateTenantState(req, (draft) => {
      resultado = technicalIntakeEngine.iniciarIntake({
        tenantId,
        actorId: req.securityContext?.actorId || 'operador',
        channel: channel || 'web',
        vehicleId,
        placa,
        clienteId,
        kmAtual,
        reclamacao,
        state: draft
      });
    });
    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({
        success: false,
        error: saveRes?.error || 'Falha ao iniciar intake.'
      });
    }
    res.json({
      success: true,
      ...resultado,
      novoEstado: { versao: saveRes.versao }
    });
  } catch (err) {
    console.error('[API /api/intake/iniciar] Erro:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/intake/mensagem', async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    const { texto, placa, vehicleId, channel, sessionId } = req.body || {};
    let resultado = null;
    const saveRes = await mutateTenantState(req, async (draft) => {
      resultado = await technicalIntakeEngine.processarMensagem({
        tenantId,
        actorId: req.securityContext?.actorId || 'operador',
        channel: channel || 'web',
        texto,
        placa,
        vehicleId,
        state: draft,
        context: { sessionId }
      });
    });
    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({
        success: false,
        error: saveRes?.error || 'Falha ao processar mensagem de intake.'
      });
    }
    res.json({
      success: true,
      ...resultado,
      novoEstado: { versao: saveRes.versao }
    });
  } catch (err) {
    console.error('[API /api/intake/mensagem] Erro:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/api/intake/sessao/:id', async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const tenantId = extractTenantId(req);
    const sessoes = Array.isArray(state.intakeSessions) ? state.intakeSessions : [];
    const sessao = sessoes.find(s => s.id === req.params.id && s.tenantId === tenantId);
    if (!sessao) {
      return res.status(404).json({ error: 'Sessão de intake não encontrada.' });
    }
    res.json({
      success: true,
      session: sessao
    });
  } catch (err) {
    console.error('[API /api/intake/sessao/:id GET] Erro:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/intake/sessao/:id/resposta', async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    const { resposta } = req.body || {};
    let resultado = null;
    const saveRes = await mutateTenantState(req, (draft) => {
      resultado = technicalIntakeEngine.responderPergunta({
        tenantId,
        sessionId: req.params.id,
        resposta,
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
        error: saveRes?.error || 'Falha ao responder pergunta de intake.'
      });
    }
    res.json({
      success: true,
      ...resultado,
      novoEstado: { versao: saveRes.versao }
    });
  } catch (err) {
    console.error('[API /api/intake/sessao/:id/resposta] Erro:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/intake/sessao/:id/corrigir', async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    const { campo, valor } = req.body || {};
    let resultado = null;
    const saveRes = await mutateTenantState(req, (draft) => {
      resultado = technicalIntakeEngine.corrigirCampo({
        tenantId,
        sessionId: req.params.id,
        campo,
        valor,
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
        error: saveRes?.error || 'Falha ao corrigir campo de intake.'
      });
    }
    res.json({
      success: true,
      ...resultado,
      novoEstado: { versao: saveRes.versao }
    });
  } catch (err) {
    console.error('[API /api/intake/sessao/:id/corrigir] Erro:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/intake/sessao/:id/confirmar', async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    const { boxId, mecanico, confirmToken } = req.body || {};
    let resultado = null;
    const saveRes = await mutateTenantState(req, (draft) => {
      resultado = technicalIntakeEngine.confirmarIntake({
        tenantId,
        sessionId: req.params.id,
        state: draft,
        actorId: req.securityContext?.actorId || 'operador',
        boxId,
        mecanico,
        confirmToken
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
        error: saveRes?.error || 'Falha ao confirmar intake.'
      });
    }
    res.json({
      success: true,
      ...resultado,
      novoEstado: { versao: saveRes.versao }
    });
  } catch (err) {
    console.error('[API /api/intake/sessao/:id/confirmar] Erro:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/intake/sessao/:id/cancelar', async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    const { motivo } = req.body || {};
    let resultado = null;
    const saveRes = await mutateTenantState(req, (draft) => {
      resultado = technicalIntakeEngine.cancelarIntake({
        tenantId,
        sessionId: req.params.id,
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
        error: saveRes?.error || 'Falha ao cancelar intake.'
      });
    }
    res.json({
      success: true,
      ...resultado,
      novoEstado: { versao: saveRes.versao }
    });
  } catch (err) {
    console.error('[API /api/intake/sessao/:id/cancelar] Erro:', err);
    res.status(500).json({ error: err.message });
  }
});

/* ── Inspeção Técnica e Diagnóstico Físico Humano ─────────── */

module.exports = router;
