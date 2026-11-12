'use strict';

/**
 * routes/whatsapp_cobranca_gateway.routes.js
 *
 * Endpoints REST:
 * 1. GET  /api/financeiro/cobranca-ativa/fila-clientes
 * 2. POST /api/financeiro/cobranca-ativa/disparar-regua
 * 3. POST /api/financeiro/cobranca-ativa/acordos
 * 4. POST /api/financeiro/cobranca-ativa/acordos/:id/liquidar-entrada
 * 5. POST /api/whatsapp/gateway/configurar
 * 6. POST /api/whatsapp/gateway/webhook-inbound
 * 7. POST /api/whatsapp/gateway/processar-fila
 * 8. POST /api/whatsapp/agente/ciclo-autonomo-diario
 *
 * Teto Modular: <= 230 linhas
 */

const express = require('express');
const router = express.Router();
const {
  getOrLoadState,
  mutateTenantState,
  requirePermission
} = require('../lib/serverContext');

const {
  apurarFilaReguaCobrancaPorCliente,
  dispararReguaCobrancaAtivaWhatsApp,
  formalizarAcordoRenegociacaoDividaCliente,
  liquidarEntradaAcordoEDesbloquearCreditoCliente
} = require('../services/whatsapp/whatsappCreditRecoverySkill');

const {
  configurarInstanciaGatewayWhatsApp,
  receberWebhookRealGatewayWhatsApp,
  processarFilaRetentativasOutboundWhatsApp
} = require('../services/whatsapp/whatsappGatewayAdapterService');

const {
  executarCicloAutonomoDiarioAgenteWhatsApp
} = require('../services/whatsapp/whatsappAutonomousCommandCenterService');

// 1. Fila de clientes na régua de cobrança
router.get('/api/financeiro/cobranca-ativa/fila-clientes', requirePermission('financial:read'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const fila = apurarFilaReguaCobrancaPorCliente(state, req.query);
    res.json({ success: true, fila, total: fila.length });
  } catch (err) {
    res.status(err.status || 400).json({ success: false, code: 'COLLECTION_QUEUE_ERROR', error: err.message });
  }
});

// 2. Disparo ativo da régua de cobrança
router.post('/api/financeiro/cobranca-ativa/disparar-regua', requirePermission('financial:write'), async (req, res) => {
  try {
    let result = null;
    await mutateTenantState(req, draft => {
      result = dispararReguaCobrancaAtivaWhatsApp(draft, req.body);
    });
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(err.status || 400).json({ success: false, code: 'COLLECTION_TRIGGER_ERROR', error: err.message });
  }
});

// 3. Formalização de acordo de renegociação
router.post('/api/financeiro/cobranca-ativa/acordos', requirePermission('financial:write'), async (req, res) => {
  try {
    let result = null;
    await mutateTenantState(req, draft => {
      result = formalizarAcordoRenegociacaoDividaCliente(draft, req.body);
    });
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(err.status || 400).json({ success: false, code: err.code || 'SETTLEMENT_ERROR', error: err.message });
  }
});

// 4. Liquidação da entrada do acordo e desbloqueio de crédito
router.post('/api/financeiro/cobranca-ativa/acordos/:id/liquidar-entrada', requirePermission('financial:write'), async (req, res) => {
  try {
    let result = null;
    await mutateTenantState(req, draft => {
      result = liquidarEntradaAcordoEDesbloquearCreditoCliente(draft, req.params.id, req.body);
    });
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(err.status || 400).json({ success: false, code: err.code || 'SETTLEMENT_SETTLE_ERROR', error: err.message });
  }
});

// 5. Configurar gateway WhatsApp
router.post('/api/whatsapp/gateway/configurar', requirePermission('whatsapp:admin'), async (req, res) => {
  try {
    let config = null;
    await mutateTenantState(req, draft => {
      config = configurarInstanciaGatewayWhatsApp(draft, req.body);
    });
    res.json({ success: true, config });
  } catch (err) {
    res.status(err.status || 400).json({ success: false, code: 'GATEWAY_CONFIG_ERROR', error: err.message });
  }
});

// 6. Webhook inbound real com validação HMAC e idempotência
router.post('/api/whatsapp/gateway/webhook-inbound', async (req, res) => {
  try {
    const signature = req.headers['x-hub-signature-256'] || req.headers['x-webhook-signature'] || req.headers['signature'];
    let result = null;
    await mutateTenantState(req, draft => {
      result = receberWebhookRealGatewayWhatsApp(draft, req.body, {
        signatureHeader: signature,
        rawBody: req.rawBody,
        ignorarAssinatura: req.query.ignorarAssinatura === 'true'
      });
    });
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(err.status || 400).json({ success: false, code: err.code || 'WEBHOOK_INBOUND_ERROR', error: err.message });
  }
});

// 7. Processar fila de retentativas outbound
router.post('/api/whatsapp/gateway/processar-fila', requirePermission('whatsapp:write'), async (req, res) => {
  try {
    let result = null;
    await mutateTenantState(req, draft => {
      result = processarFilaRetentativasOutboundWhatsApp(draft, req.body);
    });
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(err.status || 400).json({ success: false, code: 'QUEUE_PROCESS_ERROR', error: err.message });
  }
});

// 8. Executar ciclo autônomo diário 360º
router.post('/api/whatsapp/agente/ciclo-autonomo-diario', requirePermission('whatsapp:admin'), async (req, res) => {
  try {
    let ciclo = null;
    await mutateTenantState(req, draft => {
      ciclo = executarCicloAutonomoDiarioAgenteWhatsApp(draft, req.body);
    });
    res.json({ success: true, ciclo });
  } catch (err) {
    res.status(err.status || 400).json({ success: false, code: 'AUTONOMOUS_CYCLE_ERROR', error: err.message });
  }
});

module.exports = router;

