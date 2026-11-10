'use strict';

/**
 * routes/suprimentos_whatsapp_conciliacao.routes.js
 *
 * Endpoints REST para:
 * 1. Compras pesadas, CMP e recebimento de NF com baixa de gargalo.
 * 2. Cálculo de margem bruta real de peças na OS.
 * 3. Conciliação bancária multi-formato (PDF, OFX/CNAB e API Webhook).
 * 4. Webhook do Agente WhatsApp Multi-Skill (Recepção e Analista Financeiro).
 *
 * Teto Modular: <= 350 linhas
 */

const express = require('express');
const router = express.Router();

const {
  getOrLoadState,
  mutateTenantState,
  extractTenantId,
  requirePermission
} = require('../lib/serverContext');

const heavyPartsPurchaseOrderService = require('../services/inventory/heavyPartsPurchaseOrderService');
const bankStatementReconciliationService = require('../services/finance/bankStatementReconciliationService');
const whatsappAgentSkillsService = require('../services/whatsapp/whatsappAgentSkillsService');

// 1. Criar pedido de compra de peças pesadas
router.post('/api/suprimentos/pedidos-compra', requirePermission('inventory:write', 'inventory:manage'), async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    let resultado = null;

    const saveRes = await mutateTenantState(req, (draft) => {
      resultado = heavyPartsPurchaseOrderService.criarPedidoCompraPecas(draft, {
        tenantId,
        responsavel: req.securityContext?.actorId || req.user?.username || 'operador_compras',
        ...req.body
      });
    });

    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({ success: false, error: saveRes?.error || 'Falha ao salvar pedido de compra.' });
    }

    res.json({ success: true, ...resultado });
  } catch (err) {
    res.status(400).json({ success: false, code: 'PURCHASE_ORDER_CREATE_ERROR', error: err.message });
  }
});

// 2. Receber Nota Fiscal de Compra, recalcular CMP e baixar gargalo de box
router.post('/api/suprimentos/pedidos-compra/:id/receber-nf', requirePermission('inventory:write', 'inventory:manage'), async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    const pedidoId = req.params.id;
    let resultado = null;

    const saveRes = await mutateTenantState(req, (draft) => {
      resultado = heavyPartsPurchaseOrderService.receberNotaFiscalCompraPecas(draft, pedidoId, {
        tenantId,
        responsavel: req.securityContext?.actorId || req.user?.username || 'almoxarife',
        ...req.body
      });
    });

    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({ success: false, error: saveRes?.error || 'Falha ao processar recebimento da NF.' });
    }

    res.json({ success: true, ...resultado });
  } catch (err) {
    const status = err.code === 'PURCHASE_ORDER_ALREADY_RECEIVED' ? 409 : 400;
    res.status(status).json({ success: false, code: err.code || 'PURCHASE_ORDER_RECEIVE_ERROR', error: err.message });
  }
});

// 3. Obter margem bruta real de peças da OS baseada no CMP
router.get('/api/suprimentos/os/:osId/margem-real', requirePermission('inventory:read', 'financial:read'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const osId = req.params.osId;
    const margem = heavyPartsPurchaseOrderService.calcularMargemRealOSPecas(state, osId);

    res.json({ success: true, ...margem });
  } catch (err) {
    const status = err.message?.includes('não encontrada') ? 404 : 400;
    res.status(status).json({ success: false, code: 'CALCULATE_MARGIN_ERROR', error: err.message });
  }
});

// 4. Processar conciliação bancária via extrato (PDF, OFX, CNAB ou JSON)
router.post('/api/financeiro/conciliacao-bancaria/processar', requirePermission('financial:manage', 'bordero:manage'), async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    let resultado = null;

    const saveRes = await mutateTenantState(req, (draft) => {
      resultado = bankStatementReconciliationService.conciliarExtratoBancarioAutomatico(draft, {
        tenantId,
        responsavel: req.securityContext?.actorId || req.user?.username || 'analista_conciliacao',
        ...req.body
      });
    });

    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({ success: false, error: saveRes?.error || 'Falha ao conciliar extrato.' });
    }

    res.json({ success: true, ...resultado });
  } catch (err) {
    res.status(400).json({ success: false, code: 'RECONCILIATION_ERROR', error: err.message });
  }
});

// 5. Webhook direto para API Bancária / Open Finance
router.post('/api/financeiro/conciliacao-bancaria/webhook-api', async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    let resultado = null;

    const saveRes = await mutateTenantState(req, (draft) => {
      resultado = bankStatementReconciliationService.conciliarExtratoBancarioAutomatico(draft, {
        tenantId,
        formato: 'api_json',
        origemCanal: 'webhook_api_bancaria',
        lancamentos: Array.isArray(req.body) ? req.body : req.body.lancamentos || [],
        responsavel: 'webhook_open_finance'
      });
    });

    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({ success: false, error: saveRes?.error || 'Falha ao processar webhook bancário.' });
    }

    res.json({ success: true, ...resultado });
  } catch (err) {
    res.status(400).json({ success: false, code: 'WEBHOOK_RECONCILIATION_ERROR', error: err.message });
  }
});

// 6. Webhook do Agente WhatsApp Multi-Skill
router.post('/api/whatsapp/agente/webhook', async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    let resultado = null;

    const saveRes = await mutateTenantState(req, (draft) => {
      resultado = whatsappAgentSkillsService.processarMensagemAgenteWhatsApp(draft, {
        tenantId,
        ...req.body
      });
    });

    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({ success: false, error: saveRes?.error || 'Falha ao processar mensagem do agente.' });
    }

    res.json({ success: true, ...resultado });
  } catch (err) {
    if (err.code === 'WHATSAPP_UNAUTHORIZED_MANAGEMENT_SKILL') {
      return res.status(403).json({ success: false, code: err.code, error: err.message });
    }
    res.status(400).json({ success: false, code: 'WHATSAPP_AGENT_ERROR', error: err.message });
  }
});

module.exports = router;

