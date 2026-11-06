'use strict';

const express = require('express');
const router = express.Router();
const {
  getOrLoadState,
  mutateTenantState,
  extractTenantId,
  requirePermission,
  recordSecurityAudit
} = require('../lib/serverContext');
const financialAnalystService = require('../services/financialAnalystService');
const financialEngine = require('../services/financialEngine');
const { notificarEventoCaixaWhatsApp } = require('../services/reportGenerationService');

/**
 * Pátio CRM — Rotas de Checklist de Veículos em OS
 * Sub-router extraído de routes/financial.routes.js (< 350 linhas)
 */

router.get('/api/financeiro/os/:osId/checklist', requirePermission('financial:read', 'os:read'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const checklist = financialAnalystService.obterChecklistTecnicoOS(state, req.params.osId);
    res.json(checklist);
  } catch (err) {
    console.error('[API /api/financeiro/os/:osId/checklist GET] Erro:', err);
    res.status(err.status || 500).json({ success: false, code: err.code, error: err.message });
  }
});

/**
 * 4.1.15 POST /api/financeiro/os/:osId/checklist
 * Registra aprovação ou reprovação crítica de checklist técnico na OS e grava auditoria SQLite
 */
router.post('/api/financeiro/os/:osId/checklist', requirePermission('os:write', 'labor:write', 'financial:write', 'operation:manage'), async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    const osId = req.params.osId;
    const { modo, itemFalha, observacao, itens } = req.body || {};
    const operador = req.securityContext?.fullName || req.securityContext?.actorId || 'operador';

    let resultado = null;
    const saveRes = await mutateTenantState(req, (draft) => {
      try {
        resultado = financialAnalystService.registrarChecklistTecnicoOS(draft, {
          osId,
          modo,
          itemFalha,
          observacao,
          itens,
          operador: {
            actorId: req.securityContext?.actorId,
            nome: operador
          }
        });
      } catch (err) {
        return {
          abort: true,
          status: err.status || err.statusCode || 400,
          code: err.code || 'ERRO_CHECKLIST_TECNICO',
          error: err.message,
          message: err.message
        };
      }
    });

    if (saveRes?.aborted) {
      const mutRes = saveRes.mutatorResult || saveRes;
      return res.status(mutRes.status || saveRes.status || 400).json({
        success: false,
        code: mutRes.code,
        error: mutRes.error,
        message: mutRes.message
      });
    }

    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({
        success: false,
        error: saveRes?.error || 'Falha ao persistir checklist técnico'
      });
    }

    try {
      await recordSecurityAudit({
        tenantId,
        actorId: req.securityContext?.actorId || 'operador',
        action: 'patio:os:checklist_tecnico',
        entity: 'ordem_servico',
        entityId: String(osId),
        details: {
          osId,
          statusChecklist: resultado?.statusChecklist,
          modo,
          itemFalha,
          observacao,
          operador
        }
      });
    } catch (auditErr) {
      console.warn('[Checklist Tecnico Audit] Falha não-bloqueante:', auditErr.message);
    }

    res.json({
      success: true,
      ...resultado
    });
  } catch (err) {
    console.error('[API /api/financeiro/os/:osId/checklist POST] Erro:', err);
    res.status(err.status || 500).json({ success: false, code: err.code, error: err.message });
  }
});

/**
 * 4.1.16 GET /api/financeiro/patio/placa/:placa/historico
 * Retorna dossiê histórico completo e status de garantia ativa de 90 dias da placa
 */

module.exports = router;
