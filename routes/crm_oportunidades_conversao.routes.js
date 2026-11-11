'use strict';

/**
 * routes/crm_oportunidades_conversao.routes.js
 *
 * Rotas de Fila Ativa de Follow-up e Conversão de Demanda Reprimida em OS:
 * - Listagem de oportunidades adiadas por cliente/placa
 * - Listagem da fila de follow-up com status (vencida, hoje, futura)
 * - Registro de interações e contatos de follow-up
 * - Conversão de orçamentos parciais e oportunidades em Ordens de Serviço
 *
 * Teto Modular: <= 250 linhas
 */

const express = require('express');
const router = express.Router();
const {
  getOrLoadState,
  mutateTenantState,
  extractTenantId,
  requirePermission
} = require('../lib/serverContext');
const partialApprovalService = require('../services/quotation/partialApprovalService');
const opportunityConversionService = require('../services/crm/opportunityConversionService');

router.get('/api/crm/oportunidades-adiadas', requirePermission('crm:read'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const tenantId = extractTenantId(req);
    const { clienteId, placa, criticidade } = req.query || {};
    const oportunidades = partialApprovalService.listarOportunidadesAdiadas({
      tenantId,
      state,
      clienteId,
      placa,
      criticidade
    });
    res.json({ success: true, total: oportunidades.length, oportunidades });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/api/crm/oportunidades-adiadas/fila-followup', requirePermission('crm:read'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const tenantId = extractTenantId(req);
    const { clienteId, placa, criticidade, statusFollowUp, centroCustoId } = req.query || {};
    const resultado = opportunityConversionService.listarFilaFollowUpDemandaReprimida({
      tenantId,
      state,
      clienteId,
      placa,
      criticidade,
      statusFollowUp,
      centroCustoId
    });
    res.json({ success: true, ...resultado });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/api/crm/oportunidades-adiadas/:id/follow-up', requirePermission('crm:contact', 'crm:write'), async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    const actorId = req.securityContext?.actorId || 'operador';
    const oportunidadeId = req.params.id;
    const { canal, resultado: resultadoContato, observacao, dataProximoContato, novaDataFollowUp, responsavel } = req.body || {};

    let operacao = null;
    const saveRes = await mutateTenantState(req, (draft) => {
      operacao = opportunityConversionService.registrarFollowUpOportunidade({
        tenantId,
        state: draft,
        oportunidadeId,
        responsavel: responsavel || actorId,
        canal,
        resultado: resultadoContato,
        observacao,
        novaDataFollowUp: novaDataFollowUp || dataProximoContato || null,
        actorId
      });
    });

    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({
        success: false,
        error: saveRes?.error || 'Falha ao registrar follow-up de oportunidade.'
      });
    }

    res.json({ success: true, ...operacao });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.post('/api/crm/oportunidades-adiadas/:id/converter-os', requirePermission('crm:write', 'os:write'), async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    const actorId = req.securityContext?.actorId || 'operador';
    const oportunidadeId = req.params.id;
    const { itensSelecionadosIds, centroCustoId, autorizarEstouroAlcada, clienteId, veiculoId, placa, modelo } = req.body || {};

    let operacao = null;
    const saveRes = await mutateTenantState(req, (draft) => {
      operacao = opportunityConversionService.converterOportunidadeEmOS({
        tenantId,
        state: draft,
        oportunidadeId,
        opcoes: {
          itensSelecionadosIds,
          centroCustoId,
          autorizarEstouroAlcada,
          clienteId,
          veiculoId,
          placa,
          modelo
        },
        actorId
      });
    });

    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({
        success: false,
        error: saveRes?.error || 'Falha ao converter oportunidade em OS.'
      });
    }

    res.json({ success: true, ...operacao });
  } catch (err) {
    const code = err.code || 'CONVERSION_ERROR';
    const status = (code === 'INSUFFICIENT_STOCK' || code === 'COST_CENTER_BUDGET_EXCEEDED') ? 400 : 422;
    res.status(status).json({ success: false, code, error: err.message });
  }
});

module.exports = router;
