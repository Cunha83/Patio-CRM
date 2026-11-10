'use strict';

/**
 * routes/financeiro_bordero_inadimplencia.routes.js
 * 
 * Endpoints REST para:
 * 1. Liquidação integral/parcial de Borderôs B2B e baixa em cascata nas OSs e comissões.
 * 2. Estorno auditado de liquidação.
 * 3. Extrato cronológico de liquidações.
 * 4. Configuração de Política de Crédito de frotistas e tolerância de atraso.
 * 5. Avaliação de Risco de Inadimplência e Exposição.
 * 6. Validação de Trava de Crédito com suporte a Override Gerencial.
 * 
 * Teto de Linhas: <= 350 linhas
 */

const express = require('express');
const router = express.Router();

const {
  getOrLoadState,
  mutateTenantState,
  extractTenantId,
  requirePermission
} = require('../lib/serverContext');

const fleetBorderoSettlementService = require('../services/billing/fleetBorderoSettlementService');
const fleetDelinquencyGuardService = require('../services/billing/fleetDelinquencyGuardService');

// 1. Liquidação de Borderô B2B
router.post('/api/financeiro/borderos/:id/liquidar', requirePermission('financial:manage', 'bordero:manage'), async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    const borderoId = req.params.id;
    let resultado = null;

    const saveRes = await mutateTenantState(req, (draft) => {
      resultado = fleetBorderoSettlementService.liquidarBorderoB2B(draft, borderoId, {
        tenantId,
        operador: req.securityContext?.actorId || req.user?.username || 'operador',
        ...req.body
      });
    });

    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({ success: false, error: saveRes?.error || 'Falha ao salvar liquidação.' });
    }

    res.json({ success: true, ...resultado });
  } catch (err) {
    const status = err.message?.includes('não encontrado') ? 404 : 400;
    res.status(status).json({ success: false, code: 'SETTLEMENT_ERROR', error: err.message });
  }
});

// 2. Estorno de Liquidação de Borderô B2B
router.post('/api/financeiro/borderos/:id/estornar', requirePermission('financial:manage', 'bordero:manage'), async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    const borderoId = req.params.id;
    let resultado = null;

    const saveRes = await mutateTenantState(req, (draft) => {
      resultado = fleetBorderoSettlementService.estornarLiquidacaoBorderoB2B(draft, borderoId, {
        tenantId,
        operador: req.securityContext?.actorId || req.user?.username || 'operador',
        ...req.body
      });
    });

    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({ success: false, error: saveRes?.error || 'Falha ao salvar estorno.' });
    }

    res.json({ success: true, ...resultado });
  } catch (err) {
    const status = err.message?.includes('não encontrado') ? 404 : 400;
    res.status(status).json({ success: false, code: 'REVERSAL_ERROR', error: err.message });
  }
});

// 3. Extrato de Liquidações de Borderô
router.get('/api/financeiro/borderos/extrato-liquidacoes', requirePermission('financial:read', 'bordero:read'), async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    const state = await getOrLoadState(req);

    const resultado = fleetBorderoSettlementService.listarExtratoLiquidacoesBordero(state, {
      tenantId,
      ...req.query
    });

    res.json({ success: true, ...resultado });
  } catch (err) {
    res.status(500).json({ success: false, code: 'EXTRACT_ERROR', error: err.message });
  }
});

// 4. Configurar Política de Crédito Frotista
router.post('/api/financeiro/credito-frotistas/:clienteId/politica', requirePermission('financial:manage', 'credit:manage'), async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    const clienteId = req.params.clienteId;
    let resultado = null;

    const saveRes = await mutateTenantState(req, (draft) => {
      resultado = fleetDelinquencyGuardService.configurarPoliticaCreditoFrotista(draft, clienteId, {
        tenantId,
        usuario: req.securityContext?.actorId || req.user?.username || 'operador',
        ...req.body
      });
    });

    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({ success: false, error: saveRes?.error || 'Falha ao salvar política de crédito.' });
    }

    res.json({ success: true, politica: resultado });
  } catch (err) {
    res.status(400).json({ success: false, code: 'CREDIT_POLICY_ERROR', error: err.message });
  }
});

// 5. Avaliar Risco e Exposição de Inadimplência Frotista
router.get('/api/financeiro/credito-frotistas/:clienteId/risco', requirePermission('financial:read', 'credit:read'), async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    const clienteId = req.params.clienteId;
    const state = await getOrLoadState(req);

    const avaliacao = fleetDelinquencyGuardService.avaliarRiscoInadimplenciaFrotista(state, clienteId, {
      tenantId,
      ...req.query
    });

    res.json({ success: true, avaliacao });
  } catch (err) {
    res.status(500).json({ success: false, code: 'RISK_ASSESSMENT_ERROR', error: err.message });
  }
});

// 6. Validar Trava de Inadimplência / Limite com Override Opcional
router.post('/api/financeiro/credito-frotistas/:clienteId/validar-trava', requirePermission('financial:manage', 'patio:write', 'os:create'), async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    const clienteId = req.params.clienteId;
    let resultado = null;

    if (req.body?.permitirOverride) {
      const saveRes = await mutateTenantState(req, (draft) => {
        resultado = fleetDelinquencyGuardService.validarTravaInadimplenciaFrotista(draft, clienteId, {
          tenantId,
          usuarioLiberacao: req.securityContext?.actorId || req.user?.username || 'gerente',
          ...req.body
        });
      });
      if (!saveRes || !saveRes.ok) {
        return res.status(saveRes?.status || 500).json({ success: false, error: saveRes?.error || 'Falha ao salvar override.' });
      }
    } else {
      const state = await getOrLoadState(req);
      resultado = fleetDelinquencyGuardService.validarTravaInadimplenciaFrotista(state, clienteId, {
        tenantId,
        ...req.body
      });
    }

    res.json({ success: true, ...resultado });
  } catch (err) {
    if (err.code === 'FLEET_DELINQUENCY_CREDIT_BLOCKED') {
      return res.status(403).json({
        success: false,
        code: err.code,
        error: err.message,
        avaliacao: err.avaliacao
      });
    }
    res.status(400).json({ success: false, code: 'VALIDATE_LOCK_ERROR', error: err.message });
  }
});

module.exports = router;

