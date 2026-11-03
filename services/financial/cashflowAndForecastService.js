'use strict';

const financialEngine = require('../financialEngine');
const { arredondar, hojeISO, normalizarFormaPagamento } = require('./financialHelpers');

/**
 * Consolida o DFC (Demonstrativo de Fluxo de Caixa) Realizado
 */
function gerarFluxoDeCaixa(state = {}, opcoes = {}) {
  const filtro = opcoes.filtro || '30d';
  const dataRef = opcoes.dataRef || hojeISO();
  const { de, ate } = financialEngine.obterIntervaloFiltro(filtro, dataRef, opcoes.customDe, opcoes.customAte);

  const kpis = financialEngine.calcularKPIsFinanceiros(state, {
    filtro,
    dataRef,
    customDe: de,
    customAte: ate
  });

  const movimentos = Array.isArray(state.movimentos) ? state.movimentos : [];
  const movsPeriodo = movimentos.filter(m => {
    const d = (m.data || '').slice(0, 10);
    return d >= de && d <= ate;
  });

  const entradasPorCategoria = {};
  const saidasPorCategoria = {};
  const porFormaPagamento = {};

  for (const m of movsPeriodo) {
    const val = Number(m.valor) || 0;
    const cat = m.cat || m.categoria || (m.tipo === 'entrada' ? 'Receitas Diversas' : 'Despesas Gerais');
    const f = normalizarFormaPagamento(m.forma || m.formaPagamento);

    if (m.tipo === 'entrada') {
      entradasPorCategoria[cat] = arredondar((entradasPorCategoria[cat] || 0) + val);
    } else {
      saidasPorCategoria[cat] = arredondar((saidasPorCategoria[cat] || 0) + val);
    }

    if (!porFormaPagamento[f]) porFormaPagamento[f] = { entradas: 0, saidas: 0, liquido: 0 };
    if (m.tipo === 'entrada') {
      porFormaPagamento[f].entradas = arredondar(porFormaPagamento[f].entradas + val);
    } else {
      porFormaPagamento[f].saidas = arredondar(porFormaPagamento[f].saidas + val);
    }
    porFormaPagamento[f].liquido = arredondar(porFormaPagamento[f].entradas - porFormaPagamento[f].saidas);
  }

  return {
    periodo: { de, ate, filtro },
    saldoConsolidado: kpis.saldoConsolidado,
    entradasTotal: kpis.entradasPeriodo,
    saidasTotal: kpis.saidasPeriodo,
    resultadoLiquido: kpis.resultadoLiquidoPeriodo,
    entradasPorCategoria,
    saidasPorCategoria,
    porFormaPagamento,
    totalLancamentos: movsPeriodo.length,
    lancamentos: movsPeriodo.slice(0, 100)
  };
}

/**
 * Gera a Previsão (Forecast) de Fluxo de Caixa combinando títulos, pátio e risco de furo de caixa
 */
function gerarPrevisaoFluxoCaixa(state = {}, opcoes = {}) {
  const horizonteDias = Number(opcoes.dias || opcoes.horizonteDias) || 30;
  const dataHoje = opcoes.dataRef || hojeISO();
  const dataFim = financialEngine.addDias(dataHoje, horizonteDias);

  const kpisFin = financialEngine.calcularKPIsFinanceiros(state, { filtro: 'hoje', dataRef: dataHoje });
  const saldoAtual = Number(kpisFin.saldoConsolidado) || 0;

  const contas = Array.isArray(state.contas) ? state.contas : [];
  const osList = Array.isArray(state.os) ? state.os : [];
  const quotations = Array.isArray(state.quotations) ? state.quotations : (Array.isArray(state.orcamentos) ? state.orcamentos : []);

  const recNoPeriodo = contas.filter(c =>
    c.tipo === 'receber' && !c.pago && (c.venc || '') >= dataHoje && (c.venc || '') <= dataFim
  );
  const pagNoPeriodo = contas.filter(c =>
    c.tipo === 'pagar' && !c.pago && (c.venc || '') >= dataHoje && (c.venc || '') <= dataFim
  );

  const totRecPeriodo = arredondar(recNoPeriodo.reduce((acc, c) => acc + (Number(c.valor) || 0), 0));
  const totPagPeriodo = arredondar(pagNoPeriodo.reduce((acc, c) => acc + (Number(c.valor) || 0), 0));

  const osAtivas = osList.filter(o => o.st !== 'finalizada' && o.st !== 'cancelada');
  const valorTotalOSAtivas = osAtivas.reduce((acc, o) => acc + (Number(o.total || o.valorTotal) || 0), 0);

  const orcamentosPendentes = quotations.filter(q =>
    ['enviado', 'pendente', 'aguardando_aprovacao', 'rascunho'].includes(String(q.status || '').toLowerCase())
  );
  const valorTotalOrcPendentes = orcamentosPendentes.reduce((acc, q) => acc + (Number(q.totalGeral || q.valorTotal) || 0), 0);

  const potencialPatioProvavel = arredondar((valorTotalOSAtivas * 0.8) + (valorTotalOrcPendentes * 0.4));
  const potencialPatioConservador = arredondar((valorTotalOSAtivas * 0.5) + (valorTotalOrcPendentes * 0.15));

  const cfg = state.cfg || {};
  const caixaMinimoSeguranca = Number(cfg.caixaMinimoSeguranca || 2000);

  let saldoProjetadoAcum = saldoAtual;
  const diasProjecao = [];
  const diasComFuro = [];
  let menorSaldoProjetado = saldoAtual;
  let dataPrimeiroFuro = null;

  for (let i = 0; i <= horizonteDias; i++) {
    const dt = financialEngine.addDias(dataHoje, i);
    const recDoDia = recNoPeriodo
      .filter(c => (c.venc || '').slice(0, 10) === dt)
      .reduce((acc, c) => acc + (Number(c.valor) || 0), 0);
    const pagDoDia = pagNoPeriodo
      .filter(c => (c.venc || '').slice(0, 10) === dt)
      .reduce((acc, c) => acc + (Number(c.valor) || 0), 0);

    saldoProjetadoAcum = arredondar(saldoProjetadoAcum + recDoDia - pagDoDia);
    if (saldoProjetadoAcum < menorSaldoProjetado) {
      menorSaldoProjetado = saldoProjetadoAcum;
    }

    const riscoNegativo = saldoProjetadoAcum < 0;
    const riscoCaixaMinimo = saldoProjetadoAcum < caixaMinimoSeguranca;

    if ((riscoNegativo || riscoCaixaMinimo) && !dataPrimeiroFuro) {
      dataPrimeiroFuro = dt;
    }

    if (riscoNegativo || riscoCaixaMinimo) {
      diasComFuro.push({
        data: dt,
        saldoProjetado: saldoProjetadoAcum,
        deficit: arredondar(caixaMinimoSeguranca - saldoProjetadoAcum),
        negativo: riscoNegativo
      });
    }

    diasProjecao.push({
      data: dt,
      diaSemana: new Date(dt + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short' }),
      aReceber: arredondar(recDoDia),
      aPagar: arredondar(pagDoDia),
      saldoProjetado: saldoProjetadoAcum,
      risco: riscoNegativo ? 'critico' : (riscoCaixaMinimo ? 'alerta' : 'seguro')
    });
  }

  const saldo7d = diasProjecao[Math.min(7, diasProjecao.length - 1)]?.saldoProjetado ?? saldoAtual;
  const saldo15d = diasProjecao[Math.min(15, diasProjecao.length - 1)]?.saldoProjetado ?? saldoAtual;
  const saldo30d = diasProjecao[Math.min(30, diasProjecao.length - 1)]?.saldoProjetado ?? saldoAtual;

  return {
    horizonteDias,
    dataHoje,
    dataFim,
    saldoAtual,
    caixaMinimoSeguranca,
    totaisPeriodo: {
      aReceber: totRecPeriodo,
      aPagar: totPagPeriodo,
      saldoPrevistoFinanceiro: arredondar(saldoAtual + totRecPeriodo - totPagPeriodo)
    },
    marcos: {
      em7Dias: { saldo: saldo7d, seguro: saldo7d >= caixaMinimoSeguranca },
      em15Dias: { saldo: saldo15d, seguro: saldo15d >= caixaMinimoSeguranca },
      em30Dias: { saldo: saldo30d, seguro: saldo30d >= caixaMinimoSeguranca }
    },
    receitaPotencialPatio: {
      totalOSAtivas: arredondar(valorTotalOSAtivas),
      totalOrcamentosPendentes: arredondar(valorTotalOrcPendentes),
      cenarioProvavel: potencialPatioProvavel,
      cenarioConservador: potencialPatioConservador,
      saldoProvavel30dComPatio: arredondar(saldo30d + potencialPatioProvavel),
      saldoConservador30dComPatio: arredondar(saldo30d + potencialPatioConservador)
    },
    diagnosticoFuro: {
      furoDetectado: diasComFuro.length > 0,
      menorSaldoProjetado,
      dataPrimeiroFuro,
      diasEmRisco: diasComFuro.length,
      detalhesFuro: diasComFuro.slice(0, 10)
    },
    evolucaoDiaria: diasProjecao
  };
}

module.exports = {
  gerarFluxoDeCaixa,
  gerarPrevisaoFluxoCaixa
};
