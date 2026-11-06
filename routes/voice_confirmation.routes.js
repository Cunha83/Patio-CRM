const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const {
  getOrLoadState,
  salvarEstado,
  mutateTenantState,
  extractTenantId,
  requirePermission,
  getAiClient,
  safeJsonParse
} = require('../lib/serverContext');
const voiceActionEngine = require('../services/voiceActionEngine');
const preOSEngine = require('../services/preOSEngine');
const {
  validarTokenAcao,
  consumirTokenAcao,
  reservarTokenAcao
} = require('../lib/tokens/securityToken');
const {
  filterStateByRole,
  PersistenceError
} = require('../lib/repository/stateRepository');

const limiterUploads = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  message: { success: false, error: 'Limite de uploads temporariamente excedido.' },
  standardHeaders: true,
  legacyHeaders: false
});

router.post('/api/comando-voz/confirmar', async (req, res) => {
  let tokenReservado = null;
  try {
    const { token } = req.body || {};
    if (!token) return res.status(400).json({ error: 'Token de confirmação não fornecido.' });

    const secCtx = req.securityContext || {};
    const tenantId = extractTenantId(req);
    const actorId = secCtx.actorId || 'operador';
    const role = secCtx.role || 'mecanico';
    const permissions = Array.isArray(secCtx.permissions) ? [...secCtx.permissions] : [];
    const isSenderAdmin = permissions.includes('*') || ['admin', 'tenant_admin', 'platform_admin'].includes(role);

    // Reserva atômica de concorrência antes de entrar na fila de escrita
    const reserva = reservarTokenAcao(token, { tenantId, actorId });
    if (!reserva.ok) {
      return res.status(reserva.concorrencia ? 409 : 400).json({
        success: false,
        ok: false,
        resposta: reserva.error,
        error: reserva.error || 'Token de confirmação inválido ou expirado.'
      });
    }
    tokenReservado = token;

    const safeContext = {
      confirmToken: token,
      confirmadoPeloUsuario: true,
      autoConsumirToken: false,
      tenantId,
      actorId,
      role,
      permissions,
      isSenderAdmin
    };

    let resultadoFinal = null;
    const mutateRes = await mutateTenantState(req, async (draft) => {
      const resultado = await voiceActionEngine.interpretarEExecutar({
        input: { text: 'confirmar' },
        context: { ...safeContext, autoConsumirToken: false },
        state: draft,
        aiClient: getAiClient()
      });
      resultadoFinal = resultado;
      if (!resultado.ok) {
        return { abort: true, status: 400, error: resultado.resposta || 'Falha ao confirmar ação de voz.' };
      }
      return draft;
    });

    if (!mutateRes.ok) {
      if (tokenReservado) {
        voiceActionEngine.abortarConfirmacaoAcao(tokenReservado);
        tokenReservado = null;
      }
      return res.status(mutateRes.status || 400).json({
        success: false,
        ok: false,
        resposta: mutateRes.error || 'Falha ao confirmar ação de voz.',
        error: mutateRes.error || 'Falha ao confirmar ação de voz.'
      });
    }

    // Token é consumido SOMENTE após a gravação atômica durável com sucesso no SQLite
    voiceActionEngine.consumirAcaoPendente(token, { tenantId, actorId });
    tokenReservado = null;

    res.json({
      success: resultadoFinal?.ok !== false,
      ...resultadoFinal,
      novoEstado: { versao: mutateRes.versao }
    });
  } catch (err) {
    if (tokenReservado) {
      voiceActionEngine.abortarConfirmacaoAcao(tokenReservado);
      tokenReservado = null;
    }
    if (err instanceof PersistenceError || err.name === 'PersistenceError') {
      return res.status(err.status || 409).json({
        success: false,
        ok: false,
        error: err.message,
        conflict: err.conflict,
        versao: err.versao
      });
    }
    console.error('[API /api/comando-voz/confirmar] Erro:', err);
    res.status(500).json({ error: err.message });
  }
});

/* ── Conciliação de Veículos e Anexo de Foto de OS ─────────── */



module.exports = router;
