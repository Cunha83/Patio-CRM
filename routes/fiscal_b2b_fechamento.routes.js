'use strict';

/**
 * routes/fiscal_b2b_fechamento.routes.js
 *
 * Endpoints REST do Fechamento Fiscal B2B:
 * 1. PUT  /api/fiscal/perfil-tributario
 * 2. POST /api/fiscal/espelho-b2b/gerar
 * 3. POST /api/fiscal/espelho-b2b/:id/emitir-notas
 * 4. GET  /api/fiscal/lote-contabil
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

const b2bFiscalClosingService = require('../services/fiscal/b2bFiscalClosingService');

// 1. Configurar Perfil Tributário
router.put('/api/fiscal/perfil-tributario', requirePermission('fiscal:manage', 'fiscal:write', 'config:write'), async (req, res) => {
  try {
    let resultado = null;
    const saveRes = await mutateTenantState(req, (draft) => {
      resultado = b2bFiscalClosingService.configurarPerfilTributarioOficina(draft, req.body);
    });

    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({ success: false, error: saveRes?.error || 'Falha ao salvar perfil tributário.' });
    }

    res.json({ success: true, ...resultado });
  } catch (err) {
    res.status(err.status || 400).json({ success: false, code: err.code || 'FISCAL_PROFILE_ERROR', error: err.message });
  }
});

// 2. Gerar Espelho Fiscal B2B
router.post('/api/fiscal/espelho-b2b/gerar', requirePermission('fiscal:write', 'billing:write', 'os:write'), async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    let resultado = null;

    const saveRes = await mutateTenantState(req, (draft) => {
      resultado = b2bFiscalClosingService.gerarEspelhoFiscalOSOuBordero(draft, {
        tenantId,
        ...req.body
      });
    });

    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({ success: false, error: saveRes?.error || 'Falha ao gerar espelho fiscal.' });
    }

    res.json({ success: true, ...resultado });
  } catch (err) {
    res.status(err.status || 400).json({ success: false, code: err.code || 'GENERATE_CLOSING_ERROR', error: err.message });
  }
});

// 3. Registrar Emissão de Notas Fiscais B2B
router.post('/api/fiscal/espelho-b2b/:id/emitir-notas', requirePermission('fiscal:write', 'billing:write', 'os:write'), async (req, res) => {
  try {
    const responsavel = req.securityContext?.actorId || req.user?.username || 'Operador Fiscal';
    let resultado = null;

    const saveRes = await mutateTenantState(req, (draft) => {
      resultado = b2bFiscalClosingService.emitirLoteNotasFiscaisB2B(draft, req.params.id, {
        responsavel,
        ...req.body
      });
    });

    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({ success: false, error: saveRes?.error || 'Falha ao registrar emissão de notas.' });
    }

    res.json({ success: true, ...resultado });
  } catch (err) {
    res.status(err.status || 400).json({ success: false, code: err.code || 'ISSUE_INVOICES_ERROR', error: err.message });
  }
});

// 4. Consultar Lote Contábil e Exportação CSV
router.get('/api/fiscal/lote-contabil', requirePermission('fiscal:read', 'billing:read', 'relatorios:read'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const resultado = b2bFiscalClosingService.exportarLoteContabilFiscal(state, {
      competencia: req.query.competencia
    });

    res.json({ success: true, lote: resultado });
  } catch (err) {
    res.status(err.status || 400).json({ success: false, code: err.code || 'ACCOUNTING_BATCH_ERROR', error: err.message });
  }
});

module.exports = router;
