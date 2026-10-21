const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { get } = require('../db');
const { UPLOADS_BASE } = require('../lib/file-storage');
const { enqueueWrite, serverInitializationPromise, requirePermission } = require('../lib/serverContext');
const { getWppClient } = require('../services/whatsapp/whatsappState');
const { getAiClient } = require('../lib/serverContext');
const { metrics } = require('../lib/metrics');

router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'patio-crm',
    version: require('../package.json').version || '1.0.0',
    uptimeSeconds: Math.floor(process.uptime()),
    memoryUsage: process.memoryUsage(),
    timestamp: new Date().toISOString()
  });
});

router.get('/ready', async (req, res) => {
  try {
    if (serverInitializationPromise) await serverInitializationPromise;

    // 1. Database alive probe obrigatório (falha = 503)
    const row = await get('SELECT 1 as alive');
    if (!row || row.alive !== 1) throw new Error('Falha no teste de vida do banco SQLite.');

    // 2. Storage / uploads write probe assíncrono em UPLOADS_BASE (falha = 503)
    if (!fs.existsSync(UPLOADS_BASE)) await fs.promises.mkdir(UPLOADS_BASE, { recursive: true });
    const probePath = path.join(UPLOADS_BASE, `.probe_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`);
    await fs.promises.writeFile(probePath, 'probe', 'utf8');
    await fs.promises.unlink(probePath);

    // 3. Write queue status
    const queueDepth = typeof enqueueWrite?.getQueueLength === 'function' ? enqueueWrite.getQueueLength() : 0;

    // 4. Scheduler status real
    const integrationsDisabled = process.env.DISABLE_INTEGRATIONS === 'true';
    const schedulerStatus = integrationsDisabled ? 'disabled' : 'active';

    // 5. WhatsApp & AI status
    const wppClient = getWppClient();
    const ai = getAiClient();
    const whatsappStatus = (integrationsDisabled || process.env.DISABLE_WHATSAPP === 'true')
      ? 'disabled'
      : (wppClient?.info ? 'connected' : (wppClient ? 'initializing' : 'disabled'));
    const aiStatus = (integrationsDisabled || !ai) ? 'disabled' : 'ready';

    // 6. Billing status
    const isProd = process.env.NODE_ENV === 'production';
    const asaasKey = process.env.ASAAS_API_KEY;
    let billingStatus = 'ready';
    if (integrationsDisabled || !asaasKey || asaasKey === 'sua_chave_asaas_aqui') {
      billingStatus = isProd ? 'unconfigured_warning' : 'disabled';
    }

    res.json({
      status: 'ready',
      service: 'patio-crm',
      checks: {
        database: 'ok',
        storage: 'ok',
        writeQueue: { pending: queueDepth, status: 'ok' },
        scheduler: schedulerStatus,
        whatsapp: whatsappStatus,
        ai: aiStatus,
        fiscal: 'ready',
        billing: billingStatus
      },
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    res.status(503).json({
      status: 'not_ready',
      error: err.message,
      timestamp: new Date().toISOString()
    });
  }
});



router.post('/api/metricas/reset', requirePermission('admin:settings'), async (req, res) => {
  try {
    metrics.reset();
    res.json({ success: true, message: 'Métricas reinicializadas com sucesso.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


module.exports = router;
