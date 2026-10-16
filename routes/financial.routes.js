'use strict';

const express = require('express');
const router = express.Router();
const {
  getOrLoadState,
  mutateTenantState,
  extractTenantId,
  requirePermission
} = require('../lib/serverContext');
const financialAnalystService = require('../services/financialAnalystService');
const financialEngine = require('../services/financialEngine');

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
        dados: caixaAberto
      },
      indicadores: kpis,
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
        return { abort: true, status: 400, error: resultado.error };
      }
    });

    if (saveRes?.aborted) {
      return res.status(saveRes.status || 400).json({
        success: false,
        error: saveRes.error
      });
    }

    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({
        success: false,
        error: saveRes?.error || 'Falha ao persistir fechamento de caixa.'
      });
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
    const { tipo, subtipo, de, ate, forma, caixaId, limit } = req.query || {};

    let movs = Array.isArray(state.movimentos) ? [...state.movimentos] : [];

    if (tipo) {
      movs = movs.filter(m => m.tipo === tipo);
    }
    if (subtipo) {
      movs = movs.filter(m => m.subtipo === subtipo);
    }
    if (caixaId) {
      movs = movs.filter(m => m.caixaId === caixaId);
    }
    if (forma) {
      movs = movs.filter(m => (m.forma || m.formaPagamento) === forma);
    }
    if (de) {
      movs = movs.filter(m => (m.data || '').slice(0, 10) >= de);
    }
    if (ate) {
      movs = movs.filter(m => (m.data || '').slice(0, 10) <= ate);
    }

    const maxItems = Number(limit) > 0 ? Number(limit) : 200;
    res.json({
      success: true,
      total: movs.length,
      movimentacoes: movs.slice(0, maxItems)
    });
  } catch (err) {
    console.error('[API /api/financeiro/movimentacoes GET] Erro:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * 5. POST /api/financeiro/movimentacoes
 * Registra lançamento no caixa (receita, despesa, sangria, suprimento)
 */
router.post('/api/financeiro/movimentacoes', requirePermission('financial:write', 'financial:manage'), async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    const payload = req.body || {};
    const operador = req.securityContext?.actorId || 'operador';

    let resultado = null;
    const saveRes = await mutateTenantState(req, (draft) => {
      resultado = financialAnalystService.registrarMovimentacao(draft, {
        ...payload,
        tenantId,
        operador
      });

      if (!resultado.ok) {
        return { abort: true, status: 400, error: resultado.error };
      }
    });

    if (saveRes?.aborted) {
      return res.status(saveRes.status || 400).json({
        success: false,
        error: saveRes.error
      });
    }

    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({
        success: false,
        error: saveRes?.error || 'Falha ao persistir movimentação financeira.'
      });
    }

    res.status(201).json({
      success: true,
      mensagem: resultado.mensagem,
      movimento: resultado.movimentacao,
      movimentacao: resultado.movimentacao,
      saldoCaixaAtual: resultado.saldoCaixaAtual,
      caixa: { id: resultado.movimentacao?.caixaId, saldoAtual: resultado.saldoCaixaAtual }
    });
  } catch (err) {
    console.error('[API /api/financeiro/movimentacoes POST] Erro:', err);
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
