'use strict';

/**
 * routes/financeiro_dre_rentabilidade.routes.js
 *
 * Endpoints REST para DRE Gerencial Dual, Ponto de Equilíbrio e Rentabilidade:
 * 1. GET  /api/financeiro/dre-gerencial (Regime de Competência vs. Regime de Caixa)
 * 2. GET  /api/financeiro/ponto-equilibrio (Break-Even Contábil e Econômico)
 * 3. GET  /api/financeiro/rentabilidade-frotas-boxes (Ranking de Frotas e Boxes)
 * 4. POST /api/financeiro/dre-gerencial/briefing-whatsapp (Briefing Executivo no WhatsApp)
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

const executiveDreBreakEvenService = require('../services/finance/executiveDreBreakEvenService');

// 1. DRE Gerencial Dual
router.get('/api/financeiro/dre-gerencial', requirePermission('financial:read', 'financial:analyst', 'financial:manage'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const resultado = executiveDreBreakEvenService.apurarDreGerencialCompetenciaECaixa(state, {
      competencia: req.query.competencia,
      aliquotaImpostoPadrao: req.query.aliquota ? Number(req.query.aliquota) : 8
    });
    res.json({ success: true, ...resultado });
  } catch (err) {
    res.status(400).json({ success: false, code: 'DRE_ERROR', error: err.message });
  }
});

// 2. Ponto de Equilíbrio (Break-Even)
router.get('/api/financeiro/ponto-equilibrio', requirePermission('financial:read', 'financial:analyst', 'financial:manage'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const resultado = executiveDreBreakEvenService.calcularPontoEquilibrioOficina(state, {
      competencia: req.query.competencia,
      metaLucroDesejado: req.query.metaLucroDesejado ? Number(req.query.metaLucroDesejado) : 0,
      aliquotaImpostoPadrao: req.query.aliquota ? Number(req.query.aliquota) : 8
    });
    res.json({ success: true, ...resultado });
  } catch (err) {
    res.status(400).json({ success: false, code: 'BREAKEVEN_ERROR', error: err.message });
  }
});

// 3. Ranking de Rentabilidade por Frota e por Box
router.get('/api/financeiro/rentabilidade-frotas-boxes', requirePermission('financial:read', 'financial:analyst', 'financial:manage'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const resultado = executiveDreBreakEvenService.apurarRankingRentabilidadeFrotasEBoxes(state, {
      competencia: req.query.competencia
    });
    res.json({ success: true, ...resultado });
  } catch (err) {
    res.status(400).json({ success: false, code: 'PROFITABILITY_RANKING_ERROR', error: err.message });
  }
});

// 4. Briefing Executivo DRE no WhatsApp
router.post('/api/financeiro/dre-gerencial/briefing-whatsapp', requirePermission('financial:analyst', 'financial:manage', 'financial:write'), async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    let resultado = null;

    const saveRes = await mutateTenantState(req, (draft) => {
      resultado = executiveDreBreakEvenService.gerarRelatorioExecutivoDreWhatsApp(draft, {
        competencia: req.body.competencia,
        metaLucroDesejado: req.body.metaLucroDesejado
      });

      if (!Array.isArray(draft.whatsappAgentLogs)) draft.whatsappAgentLogs = [];
      draft.whatsappAgentLogs.push({
        id: `log_dre_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        tenantId,
        tipo: 'briefing_dre_executivo',
        telefone: req.body.telefone || 'gerencia',
        timestamp: new Date().toISOString()
      });
    });

    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({ success: false, error: saveRes?.error || 'Falha ao processar briefing DRE.' });
    }

    res.json({ success: true, ...resultado });
  } catch (err) {
    res.status(400).json({ success: false, code: 'DRE_WHATSAPP_BRIEFING_ERROR', error: err.message });
  }
});

module.exports = router;

