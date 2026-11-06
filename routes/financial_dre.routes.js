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
 * Pátio CRM — Rotas de DRE, Produtividade, Liquidação e Exportações
 * Sub-router extraído de routes/financial.routes.js (< 350 linhas)
 */

router.get('/api/financeiro/dre', requirePermission('financial:read'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const dre = financialAnalystService.calcularDREOperacional(state, req.query || {});
    res.json(dre);
  } catch (err) {
    console.error('[API /api/financeiro/dre GET] Erro:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * 4.1.13 GET /api/financeiro/os/:osId/aviso-cliente
 * Retorna dados consolidados e texto estruturado de aviso/cobrança para WhatsApp do cliente
 */
router.get('/api/financeiro/patio/produtividade', requirePermission('financial:read', 'os:read'), async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    const state = await getOrLoadState(req);
    const resultado = financialAnalystService.calcularProdutividadeEComissoes(state, req.query || {});

    try {
      await recordSecurityAudit({
        tenantId,
        actorId: req.securityContext?.actorId || 'operador',
        action: 'patio:relatorio:produtividade_bi',
        entity: 'patio_bi',
        entityId: String(req.query?.periodo || 'mensal'),
        details: {
          periodo: req.query?.periodo || 'mensal',
          totalOSConcluidas: resultado?.resumo?.totalOSConcluidas,
          totalMaoDeObra: resultado?.resumo?.totalMaoDeObra,
          totalComissoes: resultado?.resumo?.totalComissoes,
          solicitante: req.securityContext?.fullName || req.securityContext?.actorId || 'operador'
        }
      });
    } catch (auditErr) {
      console.warn('[Produtividade BI Audit] Falha não-bloqueante:', auditErr.message);
    }

    res.json({
      success: true,
      ...resultado
    });
  } catch (err) {
    console.error('[API /api/financeiro/patio/produtividade GET] Erro:', err);
    res.status(err.status || 500).json({ success: false, code: err.code, error: err.message });
  }
});

/**
 * 4.1.2 POST /api/financeiro/titulos/:id/liquidar
 * Realiza a liquidação (baixa) de um título a receber ou conta a pagar com geração de movimento no caixa e auditoria
 */
router.post('/api/financeiro/titulos/:id/liquidar', requirePermission('financial:write', 'financial:manage'), async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    const tituloId = req.params.id;
    const operador = req.securityContext?.actorId || req.user?.username || 'operador_financeiro';

    let resultado = null;
    const saveRes = await mutateTenantState(req, (draft) => {
      resultado = financialAnalystService.liquidarTituloFinanceiro(draft, {
        ...req.body,
        id: tituloId,
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
        error: saveRes?.error || 'Falha ao persistir liquidação de título.'
      });
    }

    // Auditoria de liquidação de título
    try {
      await recordSecurityAudit({
        tenantId,
        actorId: operador,
        action: 'financeiro:titulo:liquidar',
        entity: 'titulo_financeiro',
        entityId: tituloId,
        details: {
          tituloId,
          tipo: resultado.titulo?.tipo,
          valor: resultado.titulo?.valor,
          meioLiquidacao: resultado.titulo?.meioLiquidacao,
          movimentoId: resultado.movimentacao?.id,
          saldoCaixaAtual: resultado.saldoCaixaAtual
        }
      });
    } catch (auditErr) {
      console.warn('[Financeiro Liquidar Titulo Audit] Falha não-bloqueante:', auditErr.message);
    }

    res.status(200).json({
      success: true,
      ...resultado
    });
  } catch (err) {
    console.error('[API /api/financeiro/titulos/:id/liquidar POST] Erro:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * 4.2 GET /api/financeiro/exportar
 * Exporta lote de movimentações contábeis em formato CSV ou JSON com assinatura SHA-256 e auditoria
 */
router.get('/api/financeiro/exportar', requirePermission('financial:read'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const formato = String(req.query.formato || 'csv').toLowerCase();
    const exportResult = financialAnalystService.exportarMovimentacoesContabeis(state, req.query || {});

    // Auditoria de exportação contábil
    try {
      await recordSecurityAudit({
        tenantId: extractTenantId(req),
        actorId: req.securityContext?.actorId || req.user?.username || 'usuario_web',
        action: 'financeiro:relatorio:exportar',
        entity: 'relatorio_financeiro',
        entityId: null,
        details: {
          formato: exportResult.formato,
          sha256: exportResult.sha256,
          totalRegistros: exportResult.totalRegistros,
          filtros: req.query
        }
      });
    } catch (auditErr) {
      console.warn('[Financeiro Exportar Audit] Falha não-bloqueante:', auditErr.message);
    }

    res.setHeader('X-Export-SHA256', exportResult.sha256);

    if (formato === 'json') {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return res.send(exportResult.conteudo);
    }

    const filename = `extrato_financeiro_${new Date().toISOString().slice(0, 10)}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(exportResult.conteudo);
  } catch (err) {
    console.error('[API /api/financeiro/exportar GET] Erro:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * 6. GET /api/financeiro/fluxo-caixa
 * Retorna DFC realizado e a projeção de forecast (7, 15 ou 30 dias)
 */
router.get('/api/financeiro/fluxo-caixa', requirePermission('financial:read'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const { filtro, dias, de, ate, dataRef } = req.query || {};

    const realizado = financialAnalystService.gerarFluxoDeCaixa(state, {
      filtro: filtro || '30d',
      dataRef,
      customDe: de,
      customAte: ate
    });

    const previsao = financialAnalystService.gerarPrevisaoFluxoCaixa(state, {
      dias: dias || 30,
      dataRef
    });

    res.json({
      success: true,
      fluxoRealizado: realizado,
      realizado,
      previsao
    });
  } catch (err) {
    console.error('[API /api/financeiro/fluxo-caixa GET] Erro:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * 7. GET /api/financeiro/controles-internos
 * Retorna auditoria gerencial, anomalias e o Parecer Executivo da Verônica
 */
router.get('/api/financeiro/controles-internos', requirePermission('financial:read'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const controles = financialAnalystService.avaliarControlesInternos(state);
    res.json({
      success: true,
      ...controles,
      auditoria: controles
    });
  } catch (err) {
    console.error('[API /api/financeiro/controles-internos GET] Erro:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;

module.exports = router;
