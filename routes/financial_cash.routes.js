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
 * Pátio CRM — Rotas de Caixa Diário e Saldo Operacional
 * Sub-router extraído de routes/financial.routes.js (< 350 linhas)
 */

/**
 * 1. GET /api/financeiro/resumo
 * Retorna status do caixa ativo, KPIs do dia, fluxo resumido e parecer dos controles internos
 */
router.get('/api/financeiro/resumo', requirePermission('financial:read'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const tenantId = extractTenantId(req);

    const caixaAberto = financialAnalystService.obterCaixaAberto(state, tenantId);
    const kpis = financialEngine.calcularKPIsFinanceiros(state, { filtro: 'hoje' });
    const controles = financialAnalystService.avaliarControlesInternos(state);
    const previsao30d = financialAnalystService.gerarPrevisaoFluxoCaixa(state, { dias: 30 });

    res.json({
      success: true,
      statusCaixa: caixaAberto ? 'aberto' : 'fechado',
      caixa: {
        aberto: Boolean(caixaAberto),
        dados: financialAnalystService.projetarCaixa(caixaAberto)
      },
      indicadores: kpis,
      resumoOrigem: kpis.resumoOrigem || null,
      dreOperacional: financialAnalystService.calcularDREOperacional(state, req.query || {}),
      previsao: {
        saldoAtual: previsao30d.saldoAtual,
        em7Dias: previsao30d.marcos.em7Dias,
        em15Dias: previsao30d.marcos.em15Dias,
        em30Dias: previsao30d.marcos.em30Dias,
        receitaPotencialPatio: previsao30d.receitaPotencialPatio.cenarioProvavel,
        furoDetectado: previsao30d.diagnosticoFuro.furoDetectado,
        dataPrimeiroFuro: previsao30d.diagnosticoFuro.dataPrimeiroFuro
      },
      controlesInternos: {
        totalAnomalias: controles.totalAnomalias,
        criticas: controles.anomaliasCriticas,
        anomalias: controles.anomalias
      },
      auditoria: controles,
      parecerVerônica: controles.parecerExecutivo
    });
  } catch (err) {
    console.error('[API /api/financeiro/resumo GET] Erro:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * 2. POST /api/financeiro/caixa/abrir
 * Abre o turno de caixa diário (bloqueia se já houver caixa aberto)
 */
router.post('/api/financeiro/caixa/abrir', requirePermission('financial:write', 'financial:manage'), async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    const { saldoInicial, observacoes, registrarSuprimentoAbertura } = req.body || {};
    const operador = req.securityContext?.actorId || 'operador';
    const operadorNome = req.securityContext?.fullName || req.securityContext?.actorId || 'Operador';

    let resultado = null;
    const saveRes = await mutateTenantState(req, (draft) => {
      resultado = financialAnalystService.abrirCaixa(draft, {
        tenantId,
        saldoInicial,
        observacoes,
        operador,
        operadorNome,
        registrarSuprimentoAbertura
      });

      if (!resultado.ok) {
        return { abort: true, status: resultado.code === 'CAIXA_JA_ABERTO' ? 409 : 400, code: resultado.code, error: resultado.error, caixa: resultado.caixa };
      }
    });

    if (saveRes?.aborted) {
      return res.status(saveRes.status || 400).json({
        success: false,
        code: saveRes.mutatorResult?.code || saveRes.code,
        error: saveRes.error,
        caixa: saveRes.mutatorResult?.caixa || saveRes.caixa
      });
    }

    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({
        success: false,
        error: saveRes?.error || 'Falha ao persistir abertura de caixa.'
      });
    }

    // Disparo orientado a eventos para WhatsApp (não bloqueia nem quebra o caixa em caso de falha)
    try {
      const dryRun = Boolean(req.body?.dryRun);
      notificarEventoCaixaWhatsApp({
        tipo: 'abertura',
        operadorNome,
        saldoInicial: resultado.caixa?.saldoInicial,
        tenantKey: tenantId,
        dryRun
      }).catch(errWpp => console.warn('[Caixa WhatsApp] Aviso ao enviar notificação de abertura:', errWpp.message));
    } catch (eWpp) {
      console.warn('[Caixa WhatsApp] Falha silenciosa no disparo de abertura:', eWpp.message);
    }

    res.status(201).json({
      success: true,
      mensagem: resultado.mensagem,
      caixa: resultado.caixa
    });
  } catch (err) {
    console.error('[API /api/financeiro/caixa/abrir POST] Erro:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * 3. POST /api/financeiro/caixa/fechar
 * Encerra o caixa aberto, consolida movimentações e apura diferenças
 */
router.post('/api/financeiro/caixa/fechar', requirePermission('financial:write', 'financial:manage'), async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    const { valoresInformados, conferenciaCega, observacoes } = req.body || {};
    const operador = req.securityContext?.actorId || 'operador';
    const operadorNome = req.securityContext?.fullName || req.securityContext?.actorId || 'Operador';

    let resultado = null;
    const saveRes = await mutateTenantState(req, (draft) => {
      resultado = financialAnalystService.fecharCaixa(draft, {
        tenantId,
        valoresInformados: valoresInformados || conferenciaCega,
        observacoes,
        operador,
        operadorNome
      });

      if (!resultado.ok) {
        return { abort: true, status: resultado.status || 400, code: resultado.code, error: resultado.error };
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
        error: saveRes?.error || 'Falha ao persistir fechamento de caixa.'
      });
    }

    // Auditoria de fechamento de caixa
    try {
      await recordSecurityAudit({
        tenantId,
        actorId: operador,
        action: 'financeiro:caixa:fechar',
        entity: 'caixa_turno',
        entityId: resultado.caixaFechado?.id,
        details: {
          caixaId: resultado.caixaFechado?.id,
          saldoFinal: resultado.caixaFechado?.saldoFinal,
          totalEntradas: resultado.resumoFechamento?.totalEntradas,
          totalSaidas: resultado.resumoFechamento?.totalSaidas,
          diferenca: resultado.resumoFechamento?.diferenca,
          statusConferencia: resultado.resumoFechamento?.statusConferencia,
          resumoOrigem: resultado.resumoFechamento?.resumoOrigem,
          operador
        }
      });
    } catch (auditErr) {
      console.warn('[Caixa Fechar Audit] Falha não-bloqueante:', auditErr.message);
    }

    // Disparo orientado a eventos para WhatsApp (não bloqueia nem quebra o caixa em caso de falha)
    try {
      const dryRun = Boolean(req.body?.dryRun);
      notificarEventoCaixaWhatsApp({
        tipo: 'fechamento',
        operadorNome,
        saldoFinal: resultado.caixaFechado?.saldoFinal,
        diferenca: resultado.resumoFechamento?.diferenca,
        tenantKey: tenantId,
        dryRun
      }).catch(errWpp => console.warn('[Caixa WhatsApp] Aviso ao enviar notificação de fechamento:', errWpp.message));
    } catch (eWpp) {
      console.warn('[Caixa WhatsApp] Falha silenciosa no disparo de fechamento:', eWpp.message);
    }

    res.json({
      success: true,
      mensagem: resultado.mensagem,
      caixa: resultado.caixaFechado,
      fechamento: {
        ...resultado.resumoFechamento,
        status: resultado.caixaFechado?.status || 'fechado',
        saldoFinalSistema: resultado.caixaFechado?.saldoFinal
      }
    });
  } catch (err) {
    console.error('[API /api/financeiro/caixa/fechar POST] Erro:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * 4. GET /api/financeiro/movimentacoes
 * Lista as movimentações do caixa e histórico financeiro
 */
router.get('/api/financeiro/movimentacoes', requirePermission('financial:read'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const resultado = financialAnalystService.listarMovimentacoes(state, req.query || {});

    res.json({
      success: true,
      total: resultado.total,
      movimentacoes: resultado.movimentacoes,
      resumoOrigem: resultado.resumoOrigem,
      resumoMeiosPagamento: resultado.resumoMeiosPagamento,
      resumoPorOS: resultado.resumoPorOS
    });
  } catch (err) {
    console.error('[API /api/financeiro/movimentacoes GET] Erro:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * 4.1 GET /api/financeiro/os/:osId/resumo
 * Retorna o extrato e a posição financeira consolidada de uma Ordem de Serviço (OS)
 */

module.exports = router;
