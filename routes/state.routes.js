const express = require('express');
const router = express.Router();
const {
  getOrLoadState,
  extractTenantId,
  salvarEstado,
  requirePermission,
  enqueueWrite
} = require('../lib/serverContext');
const { filterStateByRole, persistState } = require('../lib/repository/stateRepository');
const { migrarSchemaEstado } = require('../lib/repository/migration');
const { metrics } = require('../lib/metrics');


router.get('/api/estado', async (req, res) => {
  try {
    await enqueueWrite(async () => {});
    const state = await getOrLoadState(req);
    if (state && typeof state.versao !== 'number') {
      state.versao = 0;
    }
    const filteredState = filterStateByRole(state || {}, req.securityContext);
    if (filteredState?.cfg && typeof filteredState.cfg === 'object') {
      delete filteredState.cfg.apiKeyExterna;
      delete filteredState.cfg.apiKey;
      delete filteredState.cfg.asaasApiKey;
      delete filteredState.cfg.geminiApiKey;
      delete filteredState.cfg.token;
    }
    if (req.securityContext) {
      filteredState.user = {
        id: req.securityContext.actorId,
        username: req.securityContext.actorId,
        role: req.securityContext.role,
        permissions: req.securityContext.permissions
      };
      filteredState.perfil = req.securityContext.role;
      filteredState.ui = filteredState.ui || {};
      if (req.securityContext.role === 'mecanico') {
        filteredState.ui.perfilAtivo = 'mecanico';
      } else {
        filteredState.ui.perfilAtivo = 'todos';
      }
    }
    res.json(filteredState);
  } catch (error) {
    console.error('[API /api/estado GET] Erro:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/api/versao', async (req, res) => {
  await enqueueWrite(async () => {});
  const state = await getOrLoadState(req);
  res.json({
    versao: state?.versao || 1,
    totalOS: (state?.os || []).length,
    totalVei: (state?.veiculos || []).length
  });
});

router.post('/api/estado', async (req, res) => {
  try {
    if (!req.securityContext) {
      return res.status(401).json({ error: 'Contexto de segurança ausente. Autenticação obrigatória.' });
    }
    const context = { ...req.securityContext, channel: 'http' };
    const result = await persistState(context, req.body, { enqueueWrite, authorizeReplacement: true });
    if (!result.ok) {
      return res.status(result.status || 400).json(result);
    }
    const filteredState = filterStateByRole(result.state, req.securityContext);
    if (req.securityContext) {
      filteredState.user = {
        id: req.securityContext.actorId,
        username: req.securityContext.actorId,
        role: req.securityContext.role,
        permissions: req.securityContext.permissions
      };
      filteredState.perfil = req.securityContext.role;
      filteredState.ui = filteredState.ui || {};
      if (req.securityContext.role === 'mecanico') {
        filteredState.ui.perfilAtivo = 'mecanico';
      } else {
        filteredState.ui.perfilAtivo = 'todos';
      }
    }
    return res.status(200).json({ success: true, versao: result.versao, state: filteredState });
  } catch (error) {
    console.error('[API /api/estado POST]', error.message);
    res.status(500).json({ error: 'Não foi possível gravar o estado. Preserve o rascunho e tente novamente.' });
  }
});


module.exports = router;
