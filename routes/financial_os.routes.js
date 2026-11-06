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
 * Pátio CRM — Rotas de Faturamento, Cobrança e Liberação de OS
 * Sub-router extraído de routes/financial.routes.js (< 350 linhas)
 */

router.get('/api/financeiro/os/:osId/resumo', requirePermission('financial:read'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const osId = req.params.osId;
    const resumoOS = financialAnalystService.obterResumoFinanceiroOS(state, osId, req.query || {});

    res.json({
      success: true,
      ...resumoOS
    });
  } catch (err) {
    console.error('[API /api/financeiro/os/:osId/resumo GET] Erro:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * 4.1.1 POST /api/financeiro/os/:osId/faturar
 * Fatura a prazo o saldo devedor restante de uma OS em Contas a Receber (com RBAC e auditoria)
 */
router.post('/api/financeiro/os/:osId/faturar', requirePermission('financial:write', 'financial:manage'), async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    const osId = req.params.osId;
    const operador = req.securityContext?.actorId || req.user?.username || 'operador_financeiro';

    let resultado = null;
    const saveRes = await mutateTenantState(req, (draft) => {
      resultado = financialAnalystService.faturarSaldoOS(draft, {
        ...req.body,
        osId,
        operador,
        origem: 'web'
      });

      if (!resultado.ok) {
        return { abort: true, status: resultado.status || 400, error: resultado.error, code: resultado.code };
      }
    });

    if (saveRes?.aborted) {
      return res.status(saveRes.status || 400).json({
        success: false,
        code: saveRes.mutatorResult?.code || saveRes.code,
        error: saveRes.mutatorResult?.error || saveRes.error
      });
    }

    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({
        success: false,
        error: saveRes?.error || 'Falha ao persistir faturamento de OS.'
      });
    }

    // Auditoria de faturamento de OS
    try {
      await recordSecurityAudit({
        tenantId,
        actorId: operador,
        action: 'financeiro:os:faturar',
        entity: 'ordem_servico',
        entityId: osId,
        details: {
          osId,
          valorFaturado: resultado.valorFaturado,
          parcelas: resultado.parcelas,
          titulosIds: resultado.titulos?.map(t => t.id),
          statusLiberacaoPatio: resultado.resumoOS?.statusLiberacaoPatio
        }
      });
    } catch (auditErr) {
      console.warn('[Financeiro Faturar OS Audit] Falha não-bloqueante:', auditErr.message);
    }

    res.status(201).json({
      success: true,
      ...resultado
    });
  } catch (err) {
    console.error('[API /api/financeiro/os/:osId/faturar POST] Erro:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * 4.1.1 POST /api/financeiro/os/:osId/liberar-saida
 * Valida a liberação de saída da OS no pátio ou concede liberação excepcional auditada com RBAC
 */
router.post('/api/financeiro/os/:osId/liberar-saida', requirePermission('os:read', 'os:write', 'financial:read', 'financial:write', 'operation:read'), async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    const osId = req.params.osId;
    const { forcarLiberacao, justificativa } = req.body || {};
    const role = (req.securityContext?.role || req.user?.role || '').toLowerCase();
    const operadorNome = req.securityContext?.fullName || req.securityContext?.actorId || req.user?.username || 'operador';

    let resultado = null;
    const saveRes = await mutateTenantState(req, (draft) => {
      resultado = financialAnalystService.validarOuAutorizarSaidaPatioOS(draft, {
        osId,
        forcarLiberacao: Boolean(forcarLiberacao),
        justificativa,
        operador: {
          perfil: role,
          nome: operadorNome,
          actorId: req.securityContext?.actorId
        }
      });

      if (!resultado.ok) {
        return {
          abort: true,
          status: resultado.status || 400,
          code: resultado.code,
          error: resultado.error || resultado.message,
          message: resultado.message,
          saldoRestante: resultado.saldoRestante
        };
      }
    });

    if (saveRes?.aborted) {
      const mutRes = saveRes.mutatorResult || saveRes;
      // Registro de auditoria quando liberação for negada (por retenção ou por falta de permissão RBAC)
      try {
        await recordSecurityAudit({
          tenantId,
          actorId: req.securityContext?.actorId || 'operador',
          action: 'financeiro:os:liberar_saida_negada',
          entity: 'ordem_servico',
          entityId: String(osId),
          details: {
            osId,
            motivo: mutRes.code || 'bloqueado',
            forcarLiberacao: Boolean(forcarLiberacao),
            role,
            saldoRestante: mutRes.saldoRestante
          }
        });
      } catch (_) {}

      return res.status(mutRes.status || saveRes.status || 400).json({
        success: false,
        code: mutRes.code,
        error: mutRes.error,
        message: mutRes.message,
        saldoRestante: mutRes.saldoRestante
      });
    }

    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({
        success: false,
        error: saveRes?.error || 'Falha ao processar liberação de saída de pátio.'
      });
    }

    // Registro de auditoria quando liberação excepcional for concedida
    if (resultado.statusLiberacaoPatio === 'liberado_excepcional') {
      try {
        await recordSecurityAudit({
          tenantId,
          actorId: req.securityContext?.actorId || 'operador',
          action: 'financeiro:os:liberar_saida_excepcional',
          entity: 'ordem_servico',
          entityId: String(osId),
          details: {
            osId,
            justificativa,
            saldoPendenteNaSaida: resultado.saldoRestante,
            autorizadoPor: operadorNome,
            role
          }
        });
      } catch (auditErr) {
        console.warn('[Financeiro Liberar Saida OS Audit] Falha não-bloqueante:', auditErr.message);
      }
    }

    res.status(200).json({
      success: true,
      ...resultado
    });
  } catch (err) {
    console.error('[API /api/financeiro/os/:osId/liberar-saida POST] Erro:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/financeiro/os/:osId/cobranca
 * Retorna mensagem de cobrança amigável formatada para envio ao cliente da OS via WhatsApp
 */
router.get('/api/financeiro/os/:osId/cobranca', requirePermission('financial:read'), async (req, res) => {
  try {
    const { osId } = req.params;
    const state = await getOrLoadState(req);
    const resultado = financialAnalystService.gerarTextoCobrancaOS(state, osId, req.query || {});
    res.status(200).json({
      success: true,
      ...resultado
    });
  } catch (err) {
    console.error('[API /api/financeiro/os/:osId/cobranca GET] Erro:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * 4.1.3 GET /api/financeiro/patio/boxes
 * Retorna o mapa de ocupação física de boxes/valetas e contadores de resumo
 */
router.get('/api/financeiro/os/:osId/aviso-cliente', requirePermission('financial:read', 'os:read'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const aviso = financialAnalystService.gerarAvisoClienteOS(state, req.params.osId);
    res.json(aviso);
  } catch (err) {
    console.error('[API /api/financeiro/os/:osId/aviso-cliente GET] Erro:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * 4.1.14 GET /api/financeiro/os/:osId/checklist
 * Retorna o checklist técnico pesado (suspensão & freios) e laudo de vistoria da OS
 */
router.post('/api/financeiro/os/:osId/retorno-garantia', requirePermission('os:write', 'labor:write', 'financial:write', 'operation:manage'), async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    const osId = req.params.osId;
    const { osOrigemId, motivoGarantia, isentarCobranca } = req.body || {};
    const operador = req.securityContext?.fullName || req.securityContext?.actorId || 'operador';

    let resultado = null;
    const saveRes = await mutateTenantState(req, (draft) => {
      try {
        resultado = financialAnalystService.registrarRetornoGarantiaOS(draft, {
          osId,
          osOrigemId,
          motivoGarantia,
          isentarCobranca,
          operador: {
            actorId: req.securityContext?.actorId,
            nome: operador
          }
        });
      } catch (err) {
        return {
          abort: true,
          status: err.status || err.statusCode || 400,
          code: err.code || 'ERRO_RETORNO_GARANTIA',
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
        error: saveRes?.error || 'Falha ao persistir retorno em garantia'
      });
    }

    try {
      await recordSecurityAudit({
        tenantId,
        actorId: req.securityContext?.actorId || 'operador',
        action: 'patio:os:retorno_garantia',
        entity: 'ordem_servico',
        entityId: String(osId),
        details: {
          osId,
          osOrigemId,
          motivoGarantia,
          isentarCobranca,
          statusLiberacaoPatio: resultado?.statusLiberacaoPatio,
          operador
        }
      });
    } catch (auditErr) {
      console.warn('[Retorno Garantia Audit] Falha não-bloqueante:', auditErr.message);
    }

    res.json({
      success: true,
      ...resultado
    });
  } catch (err) {
    console.error('[API /api/financeiro/os/:osId/retorno-garantia POST] Erro:', err);
    res.status(err.status || 500).json({ success: false, code: err.code, error: err.message });
  }
});

/**
 * 4.1.18 GET /api/financeiro/patio/produtividade
 * Retorna métricas de BI e produtividade de boxes/mecânicos com filtros semanal/mensal e comissões
 */

module.exports = router;
