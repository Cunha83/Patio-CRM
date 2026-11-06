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
 * Pátio CRM — Rotas de Boxes, Alocação e Gargalos de Pátio
 * Sub-router extraído de routes/financial.routes.js (< 350 linhas)
 */

router.get('/api/financeiro/patio/boxes', requirePermission('financial:read', 'os:read', 'operation:read', 'labor:read'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const resultado = financialAnalystService.listarOcupacaoBoxes(state, req.query || {});
    res.json({
      success: true,
      boxes: resultado.boxes || resultado,
      resumoBoxes: resultado.resumoBoxes
    });
  } catch (err) {
    console.error('[API /api/financeiro/patio/boxes GET] Erro:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * 4.1.4 POST /api/financeiro/os/:osId/alocar-box
 * Aloca a OS em um box com trava de colisão (409) e auditoria
 */
router.post('/api/financeiro/os/:osId/alocar-box', requirePermission('os:write', 'labor:write', 'financial:write', 'operation:manage'), async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    const osId = req.params.osId;
    const { boxId, mecanico } = req.body || {};
    const operador = req.securityContext?.fullName || req.securityContext?.actorId || 'operador';

    let resultado = null;
    const saveRes = await mutateTenantState(req, (draft) => {
      try {
        resultado = financialAnalystService.alocarBoxOS(draft, {
          osId,
          boxId,
          mecanico,
          operador: {
            actorId: req.securityContext?.actorId,
            nome: operador
          }
        });
      } catch (err) {
        return {
          abort: true,
          status: err.status || err.statusCode || 400,
          code: err.code || 'ERRO_ALOCACAO_BOX',
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
        error: saveRes?.error || 'Falha ao persistir alocação de box'
      });
    }

    try {
      await recordSecurityAudit({
        tenantId,
        actorId: req.securityContext?.actorId || 'operador',
        action: 'patio:os:alocar_box',
        entity: 'ordem_servico',
        entityId: String(osId),
        details: {
          osId,
          boxId: resultado?.box?.id || boxId,
          mecanico: resultado?.os?.mecanico,
          operador
        }
      });
    } catch (auditErr) {
      console.warn('[Alocar Box Audit] Falha não-bloqueante:', auditErr.message);
    }

    res.json({
      success: true,
      os: resultado.os,
      box: resultado.box,
      resumoBoxes: resultado.resumoBoxes
    });
  } catch (err) {
    console.error('[API /api/financeiro/os/:osId/alocar-box POST] Erro:', err);
    res.status(err.status || 500).json({ success: false, code: err.code, error: err.message });
  }
});

/**
 * 4.1.5 POST /api/financeiro/os/:osId/liberar-box
 * Libera o box ocupado pela OS calculando tempo de permanência e registrando auditoria
 */
router.post('/api/financeiro/os/:osId/liberar-box', requirePermission('os:write', 'labor:write', 'financial:write', 'operation:manage'), async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    const osId = req.params.osId;
    const { boxId, motivo } = req.body || {};
    const operador = req.securityContext?.fullName || req.securityContext?.actorId || 'operador';

    let resultado = null;
    const saveRes = await mutateTenantState(req, (draft) => {
      try {
        resultado = financialAnalystService.liberarBoxOS(draft, {
          osId,
          boxId,
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
          code: err.code || 'ERRO_LIBERACAO_BOX',
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
        error: saveRes?.error || 'Falha ao persistir liberação de box'
      });
    }

    try {
      await recordSecurityAudit({
        tenantId,
        actorId: req.securityContext?.actorId || 'operador',
        action: 'patio:os:liberar_box',
        entity: 'ordem_servico',
        entityId: String(osId),
        details: {
          osId,
          boxId: resultado?.boxId,
          tempoPermanenciaMinutos: resultado?.tempoPermanenciaMinutos,
          motivo: motivo || 'liberacao_manual',
          operador
        }
      });
    } catch (auditErr) {
      console.warn('[Liberar Box Audit] Falha não-bloqueante:', auditErr.message);
    }

    res.json({
      success: true,
      os: resultado.os,
      boxId: resultado.boxId,
      tempoPermanenciaMinutos: resultado.tempoPermanenciaMinutos,
      resumoBoxes: resultado.resumoBoxes
    });
  } catch (err) {
    console.error('[API /api/financeiro/os/:osId/liberar-box POST] Erro:', err);
    res.status(err.status || 500).json({ success: false, code: err.code, error: err.message });
  }
});

/**
 * 4.1.6 GET /api/financeiro/patio/gargalos
 * Retorna o radar consolidado de gargalos operacionais (boxes, OSs pausadas, OSs prontas retidas e produtividade)
 */
router.get('/api/financeiro/patio/gargalos', requirePermission('financial:read', 'os:read', 'operation:read', 'labor:read'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const radar = financialAnalystService.obterRadarGargalosPatio(state, req.query || {});
    res.json({
      success: true,
      ...radar
    });
  } catch (err) {
    console.error('[API /api/financeiro/patio/gargalos GET] Erro:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * 4.1.7 POST /api/financeiro/os/:osId/apontamento
 * Registra apontamento de mecânico (iniciar, pausar com gargalo, finalizar) e atualiza boxes
 */
router.post('/api/financeiro/os/:osId/apontamento', requirePermission('os:write', 'labor:write', 'financial:write', 'operation:manage'), async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    const osId = req.params.osId;
    const { acao, motivo, boxId, mecanico } = req.body || {};
    const operador = req.securityContext?.fullName || req.securityContext?.actorId || 'operador';

    let resultado = null;
    const saveRes = await mutateTenantState(req, (draft) => {
      try {
        resultado = financialAnalystService.registrarApontamentoPatioOS(draft, {
          osId,
          acao,
          motivo,
          boxId,
          mecanico,
          operador: {
            actorId: req.securityContext?.actorId,
            nome: operador
          }
        });
      } catch (err) {
        return {
          abort: true,
          status: err.status || err.statusCode || 400,
          code: err.code || 'ERRO_APONTAMENTO_PATIO',
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
        error: saveRes?.error || 'Falha ao persistir apontamento de pátio'
      });
    }

    try {
      await recordSecurityAudit({
        tenantId,
        actorId: req.securityContext?.actorId || 'operador',
        action: 'patio:os:apontamento',
        entity: 'ordem_servico',
        entityId: String(osId),
        details: {
          osId,
          acao: resultado?.acao,
          etapaPatio: resultado?.etapaPatio,
          boxId: resultado?.boxId,
          motivoPausa: resultado?.motivoPausa,
          mecanico: resultado?.os?.mecanico,
          operador
        }
      });
    } catch (auditErr) {
      console.warn('[Apontamento Patio Audit] Falha não-bloqueante:', auditErr.message);
    }

    res.json({
      success: true,
      ...resultado
    });
  } catch (err) {
    console.error('[API /api/financeiro/os/:osId/apontamento POST] Erro:', err);
    res.status(err.status || 500).json({ success: false, code: err.code, error: err.message });
  }
});

/**
 * 4.1.8 GET /api/financeiro/patio/estoque
 * Retorna o catálogo de estoque e resumo de peças críticas/mínimas
 */
router.get('/api/financeiro/patio/placa/:placa/historico', requirePermission('financial:read', 'os:read'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const historico = financialAnalystService.obterHistoricoGarantiaPlaca(state, req.params.placa, req.query || {});
    res.json(historico);
  } catch (err) {
    console.error('[API /api/financeiro/patio/placa/:placa/historico GET] Erro:', err);
    res.status(err.status || 500).json({ success: false, code: err.code, error: err.message });
  }
});

/**
 * 4.1.17 POST /api/financeiro/os/:osId/retorno-garantia
 * Registra retorno em garantia para uma OS vinculada a uma OS de origem, aplicando isenção e auditoria
 */

module.exports = router;
