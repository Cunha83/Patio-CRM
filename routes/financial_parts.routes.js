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
 * Pátio CRM — Rotas de Peças e Requisições em OS
 * Sub-router extraído de routes/financial.routes.js (< 350 linhas)
 */

router.get('/api/financeiro/patio/estoque', requirePermission('financial:read', 'os:read', 'operation:read', 'labor:read'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const resultado = financialAnalystService.listarEstoquePecas(state, req.query || {});
    res.json({
      success: true,
      ...resultado
    });
  } catch (err) {
    console.error('[API /api/financeiro/patio/estoque GET] Erro:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * 4.1.9 POST /api/financeiro/os/:osId/requisitar-peca
 * Requisita peça na OS, deduz estoque e grava auditoria
 */
router.post('/api/financeiro/os/:osId/requisitar-peca', requirePermission('os:write', 'labor:write', 'financial:write', 'operation:manage'), async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    const osId = req.params.osId;
    const { pecaIdOuNome, quantidade, valorUnitario } = req.body || {};
    const operador = req.securityContext?.fullName || req.securityContext?.actorId || 'operador';

    let resultado = null;
    const saveRes = await mutateTenantState(req, (draft) => {
      try {
        resultado = financialAnalystService.requisitarPecaOS(draft, {
          osId,
          pecaIdOuNome,
          quantidade,
          valorUnitario,
          operador: {
            actorId: req.securityContext?.actorId,
            nome: operador
          }
        });
      } catch (err) {
        return {
          abort: true,
          status: err.status || err.statusCode || 400,
          code: err.code || 'ERRO_REQUISICAO_PECA',
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
        error: saveRes?.error || 'Falha ao persistir requisição de peça'
      });
    }

    try {
      await recordSecurityAudit({
        tenantId,
        actorId: req.securityContext?.actorId || 'operador',
        action: 'patio:os:requisitar_peca',
        entity: 'ordem_servico',
        entityId: String(osId),
        details: {
          osId,
          peca: resultado?.peca,
          saldoEstoqueRestante: resultado?.saldoEstoqueRestante,
          totalPecasOS: resultado?.totalPecasOS,
          operador
        }
      });
    } catch (auditErr) {
      console.warn('[Requisitar Peca Audit] Falha não-bloqueante:', auditErr.message);
    }

    res.json({
      success: true,
      ...resultado
    });
  } catch (err) {
    console.error('[API /api/financeiro/os/:osId/requisitar-peca POST] Erro:', err);
    res.status(err.status || 500).json({ success: false, code: err.code, error: err.message });
  }
});

/**
 * 4.1.10 POST /api/financeiro/os/:osId/liberar-gargalo-peca
 * Desbloqueia gargalo da OS e restaura status do box para ocupado
 */
router.post('/api/financeiro/os/:osId/liberar-gargalo-peca', requirePermission('os:write', 'labor:write', 'financial:write', 'operation:manage'), async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    const osId = req.params.osId;
    const { observacao } = req.body || {};
    const operador = req.securityContext?.fullName || req.securityContext?.actorId || 'operador';

    let resultado = null;
    const saveRes = await mutateTenantState(req, (draft) => {
      try {
        resultado = financialAnalystService.liberarGargaloPecaOS(draft, {
          osId,
          observacao,
          operador: {
            actorId: req.securityContext?.actorId,
            nome: operador
          }
        });
      } catch (err) {
        return {
          abort: true,
          status: err.status || err.statusCode || 400,
          code: err.code || 'ERRO_LIBERAR_GARGALO_PECA',
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
        error: saveRes?.error || 'Falha ao persistir liberação de gargalo'
      });
    }

    try {
      await recordSecurityAudit({
        tenantId,
        actorId: req.securityContext?.actorId || 'operador',
        action: 'patio:os:liberar_gargalo_peca',
        entity: 'ordem_servico',
        entityId: String(osId),
        details: {
          osId,
          etapaPatio: resultado?.etapaPatio,
          boxId: resultado?.boxId,
          boxStatus: resultado?.boxStatus,
          observacao,
          operador
        }
      });
    } catch (auditErr) {
      console.warn('[Liberar Gargalo Peca Audit] Falha não-bloqueante:', auditErr.message);
    }

    res.json({
      success: true,
      ...resultado
    });
  } catch (err) {
    console.error('[API /api/financeiro/os/:osId/liberar-gargalo-peca POST] Erro:', err);
    res.status(err.status || 500).json({ success: false, code: err.code, error: err.message });
  }
});

/**
 * 4.1.11 POST /api/financeiro/os/:osId/estornar-peca
 * Devolve peça da OS ao estoque, deduz total de peças da OS e grava auditoria
 */
router.post('/api/financeiro/os/:osId/estornar-peca', requirePermission('os:write', 'labor:write', 'financial:write', 'operation:manage'), async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    const osId = req.params.osId;
    const { itemIndexOuPecaId, motivo } = req.body || {};
    const operador = req.securityContext?.fullName || req.securityContext?.actorId || 'operador';

    let resultado = null;
    const saveRes = await mutateTenantState(req, (draft) => {
      try {
        resultado = financialAnalystService.estornarPecaOS(draft, {
          osId,
          itemIndexOuPecaId,
          motivo,
          operador: {
            actorId: req.securityContext?.actorId,
            nome: operador
          }
        });
      } catch (err) {
        return {
          abort: true,
          status: err.status || err.statusCode || 400,
          code: err.code || 'ERRO_ESTORNO_PECA',
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
        error: saveRes?.error || 'Falha ao persistir estorno de peça'
      });
    }

    try {
      await recordSecurityAudit({
        tenantId,
        actorId: req.securityContext?.actorId || 'operador',
        action: 'patio:os:estornar_peca',
        entity: 'ordem_servico',
        entityId: String(osId),
        details: {
          osId,
          pecaDevolvida: resultado?.pecaDevolvida,
          saldoEstoqueAtual: resultado?.saldoEstoqueAtual,
          totalPecasOS: resultado?.totalPecasOS,
          motivo,
          operador
        }
      });
    } catch (auditErr) {
      console.warn('[Estornar Peca Audit] Falha não-bloqueante:', auditErr.message);
    }

    res.json({
      success: true,
      ...resultado
    });
  } catch (err) {
    console.error('[API /api/financeiro/os/:osId/estornar-peca POST] Erro:', err);
    res.status(err.status || 500).json({ success: false, code: err.code, error: err.message });
  }
});

/**
 * 4.1.12 GET /api/financeiro/dre
 * Retorna demonstrativo do resultado operacional (DRE) com isolamento de tesouraria
 */

module.exports = router;
