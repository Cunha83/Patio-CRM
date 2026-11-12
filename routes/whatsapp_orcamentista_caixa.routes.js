'use strict';

/**
 * routes/whatsapp_orcamentista_caixa.routes.js
 *
 * Endpoints REST:
 * 1. POST /api/whatsapp/agente/orcamentista-tecnico
 * 2. POST /api/whatsapp/agente/pre-orcamentos/:id/converter-os
 * 3. GET /api/financeiro/caixa-diario/previa
 * 4. POST /api/financeiro/caixa-diario/fechar
 * 5. POST /api/financeiro/caixa-diario/relatorio-whatsapp
 *
 * Teto Modular: <= 220 linhas
 */

const express = require('express');
const router = express.Router();
const {
  getOrLoadState,
  mutateTenantState,
  extractTenantId,
  requirePermission
} = require('../lib/serverContext');

const {
  gerarPreOrcamentoRapidoSuspensao,
  converterPreOrcamentoWhatsAppEmOS
} = require('../services/whatsapp/whatsappTechnicalQuotationSkill');

const {
  apurarPreviaFechamentoCaixaDiario,
  fecharCaixaDiarioComAuditoria,
  gerarRelatorioFechamentoCaixaWhatsApp
} = require('../services/finance/dailyCashRegisterClosingService');

// 1. Pré-orçamento rápido de suspensão pesada com proteção de margem CMP
router.post('/api/whatsapp/agente/orcamentista-tecnico', requirePermission('patio:read', 'financial:read'), async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    let quote = null;

    const saveRes = await mutateTenantState(req, (draft) => {
      quote = gerarPreOrcamentoRapidoSuspensao(draft, { tenantId, ...req.body });
    });

    if (!saveRes?.ok) {
      return res.status(saveRes?.status || 500).json({ success: false, error: saveRes?.error || 'Erro ao salvar pré-orçamento' });
    }
    res.json({ success: true, preOrcamento: quote });
  } catch (err) {
    res.status(err.status || 400).json({ success: false, code: err.code || 'QUOTATION_ERROR', error: err.message });
  }
});

// 2. Converter pré-orçamento em Ordem de Serviço
router.post('/api/whatsapp/agente/pre-orcamentos/:id/converter-os', requirePermission('patio:write'), async (req, res) => {
  try {
    let result = null;

    const saveRes = await mutateTenantState(req, (draft) => {
      result = converterPreOrcamentoWhatsAppEmOS(draft, req.params.id, req.body);
    });

    if (!saveRes?.ok) {
      return res.status(saveRes?.status || 500).json({ success: false, error: saveRes?.error || 'Erro ao converter pré-orçamento' });
    }
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(err.status || 400).json({ success: false, code: err.code || 'CONVERSION_ERROR', error: err.message });
  }
});

// 3. Prévia analítica do fechamento de caixa diário
router.get('/api/financeiro/caixa-diario/previa', requirePermission('financial:read'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const previa = apurarPreviaFechamentoCaixaDiario(state, {
      dataCaixa: req.query.dataCaixa,
      saldoInicialInformado: req.query.saldoInicialInformado
    });
    res.json({ success: true, previa });
  } catch (err) {
    res.status(err.status || 400).json({ success: false, code: 'PREVIA_ERROR', error: err.message });
  }
});

// 4. Fechar caixa diário com carimbo criptográfico e auditoria de divergências
router.post('/api/financeiro/caixa-diario/fechar', requirePermission('financial:write'), async (req, res) => {
  try {
    let result = null;

    const saveRes = await mutateTenantState(req, (draft) => {
      result = fecharCaixaDiarioComAuditoria(draft, {
        responsavel: req.user?.username || req.body.responsavel,
        ...req.body
      });
    });

    if (!saveRes?.ok) {
      return res.status(saveRes?.status || 500).json({ success: false, error: saveRes?.error || 'Erro ao fechar caixa' });
    }
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(err.status || 400).json({ success: false, code: err.code || 'CLOSING_ERROR', error: err.message });
  }
});

// 5. Demonstrativo de fechamento no WhatsApp da gerência
router.post('/api/financeiro/caixa-diario/relatorio-whatsapp', requirePermission('financial:read'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const rel = gerarRelatorioFechamentoCaixaWhatsApp(state, req.body);
    res.json({ success: true, ...rel });
  } catch (err) {
    res.status(err.status || 400).json({ success: false, code: 'REPORT_ERROR', error: err.message });
  }
});

module.exports = router;

