'use strict';

/**
 * routes/whatsapp_nlu_producao.routes.js
 *
 * Endpoints REST:
 * 1. POST /api/whatsapp/nlu/configurar
 * 2. POST /api/whatsapp/nlu/interpretar-executar
 * 3. GET  /api/ops/producao/healthcheck-stack
 * 4. GET  /api/ops/producao/docker-blueprint
 *
 * Teto Modular: <= 190 linhas
 */

const express = require('express');
const router = express.Router();
const {
  getOrLoadState,
  mutateTenantState,
  requirePermission
} = require('../lib/serverContext');

const {
  configurarProvedorNluWhatsApp,
  rotearMensagemComNluParaSkill
} = require('../services/whatsapp/whatsappLocalLlmNluService');

const {
  gerarConfiguracaoStackProducao,
  executarHealthcheckIntegradoProducao
} = require('../services/ops/productionDockerStackService');

// 1. Configurar provedor NLU
router.post('/api/whatsapp/nlu/configurar', requirePermission('whatsapp:admin'), async (req, res) => {
  try {
    let config = null;
    await mutateTenantState(req, draft => {
      config = configurarProvedorNluWhatsApp(draft, req.body);
    });
    res.json({ success: true, config });
  } catch (err) {
    res.status(err.status || 400).json({ success: false, code: 'NLU_CONFIG_ERROR', error: err.message });
  }
});

// 2. Interpretar com NLU e executar skill correspondente
router.post('/api/whatsapp/nlu/interpretar-executar', async (req, res) => {
  try {
    let result = null;
    await mutateTenantState(req, draft => {
      result = rotearMensagemComNluParaSkill(draft, req.body);
    });
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(err.status || 400).json({ success: false, code: err.code || 'NLU_DISPATCH_ERROR', error: err.message });
  }
});

// 3. Healthcheck integrado da stack de produção
router.get('/api/ops/producao/healthcheck-stack', async (req, res) => {
  try {
    let diagnostico = null;
    await mutateTenantState(req, draft => {
      diagnostico = executarHealthcheckIntegradoProducao(draft, req.query);
    });
    res.json({ success: true, diagnostico });
  } catch (err) {
    res.status(err.status || 400).json({ success: false, code: 'OPS_HEALTHCHECK_ERROR', error: err.message });
  }
});

// 4. Blueprint da stack Docker Compose
router.get('/api/ops/producao/docker-blueprint', async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const blueprint = gerarConfiguracaoStackProducao(state, req.query);
    res.json({ success: true, blueprint });
  } catch (err) {
    res.status(err.status || 400).json({ success: false, code: 'DOCKER_BLUEPRINT_ERROR', error: err.message });
  }
});

module.exports = router;

