'use strict';

/**
 * routes/whatsapp_banco_autonomo.routes.js
 *
 * Endpoints REST do Agente WhatsApp Autônomo e Conector Direto de API Bancária:
 * 1. POST /api/whatsapp/agente/recepcao-interativa
 * 2. POST /api/whatsapp/agente/analista-financeiro
 * 3. POST /api/whatsapp/agente/cobranca-pix-boleto
 * 4. POST /api/financeiro/banco-direto/configurar
 * 5. POST /api/financeiro/banco-direto/sincronizar-api
 * 6. POST /api/financeiro/banco-direto/webhook-pix-boleto
 *
 * Teto Modular: <= 240 linhas
 */

const express = require('express');
const router = express.Router();
const {
  getOrLoadState,
  mutateTenantState,
  extractTenantId,
  requirePermission
} = require('../lib/serverContext');

const whatsappAgentSkillsService = require('../services/whatsapp/whatsappAgentSkillsService');
const bankDirectApiConnectorService = require('../services/finance/bankDirectApiConnectorService');

// 1. Recepção Interativa no WhatsApp (Triagem, Fast Check-in, Link de Aprovação)
router.post('/api/whatsapp/agente/recepcao-interativa', requirePermission('patio:read', 'patio:write'), async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    let resultado = null;

    const saveRes = await mutateTenantState(req, (draft) => {
      resultado = whatsappAgentSkillsService.executarSkillRecepcaoInterativaWhatsApp(draft, {
        tenantId,
        ...req.body
      });
    });

    if (!saveRes?.ok) {
      return res.status(saveRes?.status || 500).json({ success: false, error: saveRes?.error || 'Erro ao persistir recepção' });
    }
    res.json({ success: true, ...resultado });
  } catch (err) {
    res.status(err.status || 400).json({ success: false, code: err.code || 'RECEPTION_ERROR', error: err.message });
  }
});

// 2. Analista Financeiro da Gerência no WhatsApp (Briefing e Baixa de Extrato)
router.post('/api/whatsapp/agente/analista-financeiro', requirePermission('financial:read', 'financial:write'), async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    let resultado = null;

    const saveRes = await mutateTenantState(req, (draft) => {
      resultado = whatsappAgentSkillsService.executarSkillAnalistaFinanceiroAutonomo(draft, {
        tenantId,
        perfilRemetente: req.user?.role || req.body.perfilRemetente || 'gerencia',
        ...req.body
      });
    });

    if (!saveRes?.ok) {
      return res.status(saveRes?.status || 500).json({ success: false, error: saveRes?.error || 'Erro ao persistir financeiro' });
    }
    res.json({ success: true, ...resultado });
  } catch (err) {
    res.status(err.status || 400).json({ success: false, code: err.code || 'FINANCIAL_ANALYST_ERROR', error: err.message });
  }
});

// 3. Emissão de Cobrança PIX e Boleto para Borderô / OS
router.post('/api/whatsapp/agente/cobranca-pix-boleto', requirePermission('financial:write'), async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    let resultado = null;

    const saveRes = await mutateTenantState(req, (draft) => {
      resultado = whatsappAgentSkillsService.gerarCobrancaPixBoletoWhatsApp(draft, {
        tenantId,
        ...req.body
      });
    });

    if (!saveRes?.ok) {
      return res.status(saveRes?.status || 500).json({ success: false, error: saveRes?.error || 'Erro ao persistir cobrança' });
    }
    res.json({ success: true, ...resultado });
  } catch (err) {
    res.status(err.status || 400).json({ success: false, code: err.code || 'CHARGE_ERROR', error: err.message });
  }
});

// 4. Configurar Conexão de API Bancária Direta
router.post('/api/financeiro/banco-direto/configurar', requirePermission('financial:write'), async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    let resultado = null;

    const saveRes = await mutateTenantState(req, (draft) => {
      resultado = bankDirectApiConnectorService.configurarCredenciaisApiBanco(draft, {
        tenantId,
        ...req.body
      });
    });

    if (!saveRes?.ok) {
      return res.status(saveRes?.status || 500).json({ success: false, error: saveRes?.error || 'Erro ao configurar API bancária' });
    }
    res.json({ success: true, ...resultado });
  } catch (err) {
    res.status(err.status || 400).json({ success: false, code: err.code || 'BANK_CONFIG_ERROR', error: err.message });
  }
});

// 5. Sincronizar Extrato Diretamente via API Bancária
router.post('/api/financeiro/banco-direto/sincronizar-api', requirePermission('financial:write'), async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    let resultado = null;

    const saveRes = await mutateTenantState(req, (draft) => {
      resultado = bankDirectApiConnectorService.sincronizarExtratoDiretoApiBanco(draft, {
        tenantId,
        responsavel: req.user?.nome || req.user?.id || 'API-Banco-Direta',
        ...req.body
      });
    });

    if (!saveRes?.ok) {
      return res.status(saveRes?.status || 500).json({ success: false, error: saveRes?.error || 'Erro ao sincronizar extrato' });
    }
    res.json({ success: true, ...resultado });
  } catch (err) {
    res.status(err.status || 400).json({ success: false, code: err.code || 'BANK_SYNC_ERROR', error: err.message });
  }
});

// 6. Webhook de Liquidação Instantânea PIX e Boleto
router.post('/api/financeiro/banco-direto/webhook-pix-boleto', async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    let resultado = null;

    const saveRes = await mutateTenantState(req, (draft) => {
      resultado = bankDirectApiConnectorService.processarWebhookLiquidacaoInstantaneaPixBoleto(draft, {
        tenantId,
        ...req.body
      });
    });

    if (!saveRes?.ok) {
      return res.status(saveRes?.status || 500).json({ success: false, error: saveRes?.error || 'Erro no webhook' });
    }
    res.json({ success: true, ...resultado });
  } catch (err) {
    res.status(err.status || 400).json({ success: false, code: err.code || 'WEBHOOK_ERROR', error: err.message });
  }
});

module.exports = router;

