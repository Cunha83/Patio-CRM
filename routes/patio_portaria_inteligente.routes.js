'use strict';

/**
 * routes/patio_portaria_inteligente.routes.js
 * 
 * Endpoints REST para Portaria Inteligente, Triagem 360º por Placa,
 * Fast Check-in Integrado e Controle de Saída Segura de Veículos.
 * 
 * Arquitetura: <= 350 linhas
 */

const express = require('express');
const router = express.Router();
const {
  getOrLoadState,
  mutateTenantState,
  extractTenantId,
  requirePermission
} = require('../lib/serverContext');

const gatehouseService = require('../services/patio/smartGatehouseCheckinService');

// 1. Triagem 360º de portaria por placa
router.post('/api/patio/portaria/triagem-placa', requirePermission('patio:read'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const tenantId = extractTenantId(req);
    const triagem = gatehouseService.realizarTriagemPortariaPorPlaca(state, {
      tenantId,
      ...req.body
    });

    res.json({ success: true, triagem });
  } catch (err) {
    res.status(err.status || 400).json({ success: false, code: err.code || 'TRIAGE_ERROR', error: err.message });
  }
});

// 2. Realizar Fast Check-in 360º com abertura de OS e alocação de box
router.post('/api/patio/portaria/fast-checkin', requirePermission('patio:write', 'os:write'), async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    let operacao = null;

    const saveRes = await mutateTenantState(req, (draft) => {
      operacao = gatehouseService.registrarFastCheckinPortaria360(draft, {
        tenantId,
        ...req.body,
        responsavel: req.user?.nome || req.user?.id || 'Operador Portaria'
      });
    });

    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({ success: false, error: saveRes?.error || 'Falha ao salvar check-in.' });
    }
    res.json({ success: true, ...operacao });
  } catch (err) {
    const status = err.status || (err.code === 'CLIENT_CREDIT_BLOCKED_AT_GATEHOUSE' ? 422 : 400);
    res.status(status).json({ success: false, code: err.code || 'CHECKIN_ERROR', error: err.message });
  }
});

// 3. Registrar saída física de veículo na portaria com trava de qualidade
router.post('/api/patio/portaria/:id/saida', requirePermission('patio:write'), async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    const portariaLogId = req.params.id;
    let operacao = null;

    const saveRes = await mutateTenantState(req, (draft) => {
      operacao = gatehouseService.registrarSaidaPortariaVeiculo(draft, portariaLogId, {
        tenantId,
        ...req.body,
        responsavel: req.user?.nome || req.user?.id || 'Operador Portaria'
      });
    });

    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({ success: false, error: saveRes?.error || 'Falha ao registrar saída.' });
    }
    res.json({ success: true, ...operacao });
  } catch (err) {
    const status = err.status || (err.code === 'QUALITY_INSPECTION_REQUIRED_OR_FAILED' ? 412 : (err.code === 'GATEHOUSE_LOG_NOT_FOUND' ? 404 : 400));
    res.status(status).json({ success: false, code: err.code || 'EXIT_ERROR', error: err.message });
  }
});

// 4. Listar histórico de movimentações e veículos no pátio
router.get('/api/patio/portaria/movimentacoes', requirePermission('patio:read'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const tenantId = extractTenantId(req);
    const dados = gatehouseService.listarMovimentacaoPortariaPatio(state, {
      tenantId,
      ...req.query
    });

    res.json({ success: true, ...dados });
  } catch (err) {
    res.status(500).json({ success: false, code: err.code || 'LIST_ERROR', error: err.message });
  }
});

module.exports = router;
