'use strict';

/**
 * routes/whatsapp_compras_cotacoes.routes.js
 *
 * Endpoints REST:
 * 1. GET /api/suprimentos/memoria-fornecedores-item
 * 2. POST /api/suprimentos/cotacoes-whatsapp
 * 3. POST /api/suprimentos/cotacoes-whatsapp/:id/complementar-fornecedores
 * 4. POST /api/suprimentos/cotacoes-whatsapp/:id/propostas
 * 5. GET /api/suprimentos/cotacoes-whatsapp/:id/mapa-comparativo
 * 6. POST /api/suprimentos/cotacoes-whatsapp/:id/aprovar-gerar-pedido
 * 7. POST /api/whatsapp/agente/compras-fornecedores
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
  consultarMemoriaFornecedoresEPrecosItem
} = require('../services/inventory/supplierPriceMemoryHelper');

const {
  abrirCotacaoFornecedoresWhatsApp,
  complementarFornecedoresCotacaoWhatsApp,
  registrarPropostaFornecedorWhatsApp,
  apurarMapaComparativoCotacao,
  aprovarPropostaEGerarPedidoCompra,
  executarSkillComprasFornecedoresWhatsApp
} = require('../services/whatsapp/whatsappSupplierQuotationSkill');

// 1. Consulta memória histórica de fornecedores e preços da peça
router.get('/api/suprimentos/memoria-fornecedores-item', requirePermission('inventory:read'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const memoria = consultarMemoriaFornecedoresEPrecosItem(state, req.query);
    res.json({ success: true, memoria });
  } catch (err) {
    res.status(err.status || 400).json({ success: false, code: 'MEMORY_LOOKUP_ERROR', error: err.message });
  }
});

// 2. Abrir cotação via WhatsApp com regra de mínimo 3 fornecedores
router.post('/api/suprimentos/cotacoes-whatsapp', requirePermission('inventory:write'), async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    let cotacao = null;

    const saveRes = await mutateTenantState(req, (draft) => {
      cotacao = abrirCotacaoFornecedoresWhatsApp(draft, { tenantId, ...req.body });
    });

    if (!saveRes?.ok) {
      return res.status(saveRes?.status || 500).json({ success: false, error: saveRes?.error || 'Erro ao abrir cotação' });
    }
    res.json({ success: true, cotacao });
  } catch (err) {
    res.status(err.status || 400).json({ success: false, code: err.code || 'OPEN_QUOTATION_ERROR', error: err.message });
  }
});

// 3. Complementar fornecedores faltantes indicados pelo comprador
router.post('/api/suprimentos/cotacoes-whatsapp/:id/complementar-fornecedores', requirePermission('inventory:write'), async (req, res) => {
  try {
    let result = null;

    const saveRes = await mutateTenantState(req, (draft) => {
      result = complementarFornecedoresCotacaoWhatsApp(draft, req.params.id, req.body);
    });

    if (!saveRes?.ok) {
      return res.status(saveRes?.status || 500).json({ success: false, error: saveRes?.error || 'Erro ao complementar fornecedores' });
    }
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(err.status || 400).json({ success: false, code: err.code || 'COMPLEMENT_ERROR', error: err.message });
  }
});

// 4. Registrar proposta de fornecedor com auditoria vs histórico
router.post('/api/suprimentos/cotacoes-whatsapp/:id/propostas', requirePermission('inventory:write'), async (req, res) => {
  try {
    let result = null;

    const saveRes = await mutateTenantState(req, (draft) => {
      result = registrarPropostaFornecedorWhatsApp(draft, req.params.id, req.body);
    });

    if (!saveRes?.ok) {
      return res.status(saveRes?.status || 500).json({ success: false, error: saveRes?.error || 'Erro ao registrar proposta' });
    }
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(err.status || 400).json({ success: false, code: err.code || 'PROPOSAL_ERROR', error: err.message });
  }
});

// 5. Obter Mapa Comparativo Ponderado
router.get('/api/suprimentos/cotacoes-whatsapp/:id/mapa-comparativo', requirePermission('inventory:read'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const mapa = apurarMapaComparativoCotacao(state, req.params.id, req.query);
    res.json({ success: true, mapa });
  } catch (err) {
    res.status(err.status || 400).json({ success: false, code: 'MAP_ERROR', error: err.message });
  }
});

// 6. Aprovar proposta vencedora e gerar Pedido de Compra
router.post('/api/suprimentos/cotacoes-whatsapp/:id/aprovar-gerar-pedido', requirePermission('inventory:write'), async (req, res) => {
  try {
    let result = null;

    const saveRes = await mutateTenantState(req, (draft) => {
      result = aprovarPropostaEGerarPedidoCompra(draft, req.params.id, {
        responsavel: req.user?.username || req.body.responsavel,
        ...req.body
      });
    });

    if (!saveRes?.ok) {
      return res.status(saveRes?.status || 500).json({ success: false, error: saveRes?.error || 'Erro ao aprovar cotação' });
    }
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(err.status || 400).json({ success: false, code: err.code || 'APPROVE_ERROR', error: err.message });
  }
});

// 7. Webhook conversacional no Agente WhatsApp
router.post('/api/whatsapp/agente/compras-fornecedores', requirePermission('inventory:read'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const result = executarSkillComprasFornecedoresWhatsApp(state, req.body);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(err.status || 400).json({ success: false, code: 'SKILL_ERROR', error: err.message });
  }
});

module.exports = router;

