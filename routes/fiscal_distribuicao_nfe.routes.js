'use strict';

/**
 * routes/fiscal_distribuicao_nfe.routes.js
 * Pátio-CRM — Endpoints REST para Distribuição DF-e e Importação de XMLs contra CNPJ Ativo
 * Arquitetura Modular (< 150 linhas).
 */

const express = require('express');
const router = express.Router();

const {
  getOrLoadState,
  mutateTenantState,
  extractTenantId
} = require('../lib/serverContext');

const nfeDistributionService = require('../services/fiscal/nfeDistributionService');

// 1. Consultar/Sincronizar XMLs emitidos contra o CNPJ na SEFAZ
router.post('/api/fiscal/nfe/buscar-xml-destinatario', async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    let resultado = null;

    const saveRes = await mutateTenantState(req, (draft) => {
      resultado = nfeDistributionService.buscarXmlsDestinatario(draft, {
        tenantId,
        ...req.body
      });
    });

    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({ success: false, error: saveRes?.error || 'Falha ao sincronizar XMLs de notas fiscais.' });
    }

    res.json({ success: true, ...resultado });
  } catch (err) {
    res.status(err.status || 400).json({ success: false, code: err.code || 'FISCAL_XML_ERROR', error: err.message });
  }
});

// 2. Listar XMLs recebidos já capturados para a empresa ativa
router.get('/api/fiscal/nfe/xml-recebidos', async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    const state = await getOrLoadState(req);
    const resultado = nfeDistributionService.listarXmlsRecebidos(state, { tenantId });
    res.json({ success: true, ...resultado });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, error: err.message });
  }
});

// 3. Importar XML para Estoque (CMP) e Financeiro (Contas a Pagar)
router.post('/api/fiscal/nfe/importar-xml', async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    const { chave, id, numero } = req.body || {};
    const alvo = chave || id || numero;

    if (!alvo) {
      return res.status(400).json({ success: false, error: 'Chave de acesso ou identificador do XML é obrigatório para importação.' });
    }

    let resultado = null;
    const saveRes = await mutateTenantState(req, (draft) => {
      resultado = nfeDistributionService.importarXmlParaEstoqueEFinanceiro(draft, alvo, {
        tenantId,
        ...req.body
      });
    });

    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({ success: false, error: saveRes?.error || 'Falha ao importar XML para estoque e financeiro.' });
    }

    res.json({ success: true, ...resultado });
  } catch (err) {
    res.status(err.status || 400).json({ success: false, code: err.code || 'IMPORT_XML_ERROR', error: err.message });
  }
});

module.exports = router;
