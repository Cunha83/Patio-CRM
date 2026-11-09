'use strict';

/**
 * Pátio CRM — Rotas Especializadas de Comissões de Mecânicos
 * Sub-roteador financeiro (< 80 linhas).
 */

const express = require('express');
const router = express.Router();
const { getOrLoadState, requirePermission, extractTenantId } = require('../lib/serverContext');
const commissionService = require('../services/commissionService');

router.get('/api/financeiro/comissoes', requirePermission('financial:read', 'productivity:manage'), async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    const state = await getOrLoadState(req);
    const { dataInicio, dataFim, workerId } = req.query;

    const fechamento = commissionService.gerarFechamentoComissoes({
      state,
      tenantId,
      dataInicio,
      dataFim,
      workerId
    });

    res.json({ ok: true, ...fechamento });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/api/financeiro/comissoes/colaborador/:workerId', requirePermission('financial:read', 'productivity:manage', 'labor:read'), async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    const state = await getOrLoadState(req);
    const { workerId } = req.params;
    const { dataInicio, dataFim } = req.query;

    const resumo = commissionService.obterResumoComissoesColaborador({
      state,
      tenantId,
      workerId,
      dataInicio,
      dataFim
    });

    if (!resumo) {
      return res.status(404).json({ ok: false, error: 'Colaborador não encontrado.' });
    }

    res.json({ ok: true, ...resumo });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;

