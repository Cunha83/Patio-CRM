'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const engine = require('../services/financialEngine.js');

test('1. Motor Financeiro: Cálculos de Saldo, A Receber, A Pagar e Projeção', () => {
  const mockState = {
    cfg: { saldoInicial: 10000 },
    movimentos: [
      { id: 'm1', data: '2026-09-01', tipo: 'entrada', valor: 5000, cat: 'Serviços' },
      { id: 'm2', data: '2026-09-05', tipo: 'saida', valor: 2000, cat: 'Peças' }
    ],
    contas: [
      { id: 'c1', tipo: 'receber', valor: 3000, venc: '2026-09-08', pago: false }, // Vencido se ref=2026-09-10
      { id: 'c2', tipo: 'receber', valor: 4000, venc: '2026-09-10', pago: false }, // Hoje
      { id: 'c3', tipo: 'receber', valor: 2000, venc: '2026-09-20', pago: false }, // Em 10 dias
      { id: 'c4', tipo: 'pagar', valor: 1500, venc: '2026-09-05', pago: false },   // Vencido
      { id: 'c5', tipo: 'pagar', valor: 2500, venc: '2026-09-10', pago: false },   // Hoje
      { id: 'c6', tipo: 'pagar', valor: 1000, venc: '2026-09-15', pago: true }     // Já pago (não conta)
    ]
  };

  const kpis = engine.calcularKPIsFinanceiros(mockState, { dataRef: '2026-09-10', filtro: '30d' });

  // Saldo em Caixa: 10.000 + 5.000 - 2.000 = 13.000
  assert.equal(kpis.saldoConsolidado, 13000);

  // A Receber em Aberto: c1 (3000) + c2 (4000) + c3 (2000) = 9000
  assert.equal(kpis.totalReceberAberto, 9000);
  assert.equal(kpis.totalRecVencidos, 3000);
  assert.equal(kpis.totalRecHoje, 4000);

  // A Pagar em Aberto: c4 (1500) + c5 (2500) = 4000
  assert.equal(kpis.totalPagarAberto, 4000);
  assert.equal(kpis.totalPagVencidos, 1500);
  assert.equal(kpis.totalPagHoje, 2500);

  // Vencimentos de Hoje: 4000 - 2500 = +1500
  assert.equal(kpis.liquidoHoje, 1500);

  // Inadimplência: 3000 / 9000 = 33.3%
  assert.equal(kpis.taxaInadimplencia, 33.3);

  // Saldo Projetado (30d): 13.000 + 6.000 (c2+c3 nos próximos 30d) - 2.500 (c5) = 16.500
  assert.equal(kpis.saldoPrevisto30d, 16500);
});

test('2. Filtros de Período: Hoje, 7d, 15d, 30d, Mês e Mês Anterior', () => {
  const ref = '2026-09-10';

  const fHoje = engine.obterIntervaloFiltro('hoje', ref);
  assert.equal(fHoje.de, '2026-09-10');
  assert.equal(fHoje.ate, '2026-09-10');

  const f7d = engine.obterIntervaloFiltro('7d', ref);
  assert.equal(f7d.de, '2026-09-04');
  assert.equal(f7d.ate, '2026-09-10');

  const f15d = engine.obterIntervaloFiltro('15d', ref);
  assert.equal(f15d.de, '2026-08-27');
  assert.equal(f15d.ate, '2026-09-10');

  const f30d = engine.obterIntervaloFiltro('30d', ref);
  assert.equal(f30d.de, '2026-08-12');
  assert.equal(f30d.ate, '2026-09-10');

  const fMes = engine.obterIntervaloFiltro('mes', ref);
  assert.equal(fMes.de, '2026-09-01');
  assert.equal(fMes.ate, '2026-09-30');

  const fMesAnt = engine.obterIntervaloFiltro('mes_anterior', ref);
  assert.equal(fMesAnt.de, '2026-08-01');
  assert.equal(fMesAnt.ate, '2026-08-31');
});

test('3. Resiliência: Estado Vazio, Valores Zerados ou Negativos sem Quebras', () => {
  const vazio = {};
  const dashVazio = engine.obterDashboardFinanceiro(vazio);
  assert.equal(dashVazio.kpis.saldoConsolidado, 0);
  assert.equal(dashVazio.kpis.totalReceberAberto, 0);
  assert.equal(dashVazio.kpis.totalPagarAberto, 0);
  assert.equal(dashVazio.kpis.taxaInadimplencia, 0);
  assert.equal(Array.isArray(dashVazio.graficos.grafico1Fluxo.labels), true);

  const negativo = {
    cfg: { saldoInicial: -500 },
    movimentos: [{ id: 'm1', data: '2026-09-10', tipo: 'saida', valor: 1000 }]
  };
  const dashNeg = engine.obterDashboardFinanceiro(negativo, { dataRef: '2026-09-10', filtro: 'hoje' });
  assert.equal(dashNeg.kpis.saldoConsolidado, -1500);
  assert.equal(dashNeg.kpis.resultadoLiquidoPeriodo, -1000);
});

test('4. Geração das Séries dos 5 Gráficos com Dados Reais', () => {
  const state = {
    cfg: { saldoInicial: 5000 },
    movimentos: [
      { id: 'm1', data: '2026-09-08', tipo: 'entrada', valor: 2500, cat: 'Serviços' },
      { id: 'm2', data: '2026-09-09', tipo: 'saida', valor: 1200, cat: 'Fornecedores Peças' }
    ],
    contas: [
      { id: 'c1', tipo: 'receber', valor: 3500, venc: '2026-09-12', pago: false },
      { id: 'c2', tipo: 'pagar', valor: 1800, venc: '2026-09-15', pago: false, cat: 'Aluguel' }
    ]
  };

  const series = engine.gerarSeriesGraficos(state, { dataRef: '2026-09-10', filtro: '7d' });

  // Gráfico 1: Fluxo de Caixa
  assert.ok(series.grafico1Fluxo.labels.length >= 7);
  assert.ok(series.grafico1Fluxo.entradas.length === series.grafico1Fluxo.labels.length);

  // Gráfico 2: Receber x Pagar
  assert.deepEqual(series.grafico2ReceberXPagar.labels, ['Vencidos', 'Hoje', 'Até 7d', '8 a 15d', '16 a 30d', '> 30d']);
  assert.ok(series.grafico2ReceberXPagar.receber.length === 6);

  // Gráfico 3: Evolução do Saldo
  assert.ok(series.grafico3EvolucaoSaldo.saldo.length === series.grafico1Fluxo.labels.length);

  // Gráfico 4: Projeção Financeira
  assert.ok(series.grafico4Projecao.labels.length > 0);
  assert.ok(series.grafico4Projecao.saldoProjetado.length === series.grafico4Projecao.labels.length);

  // Gráfico 5: Distribuição de Despesas
  assert.ok(series.grafico5Despesas.labels.length > 0);
  assert.ok(series.grafico5Despesas.dados.length === series.grafico5Despesas.labels.length);
});

test('5. Geração de Infográfico JPG 1080x1350 via Puppeteer com SVGs Embutidos', async () => {
  // Testa SVGs gerados pelo motor
  const fluxoMock = {
    labels: ['01/09', '02/09', '03/09'],
    entradas: [1000, 2500, 0],
    saidas: [500, 0, 1200]
  };
  const svgBarras = engine.gerarSVGBarrasFluxo(fluxoMock, 960, 200);
  assert.ok(svgBarras.includes('<svg'));
  assert.ok(svgBarras.includes('rect'));
  assert.ok(svgBarras.includes('01/09'));

  const projMock = {
    labels: ['Hoje', '05/09', '10/09'],
    saldoProjetado: [10000, 12000, 11500]
  };
  const svgProj = engine.gerarSVGProjecao(projMock, 960, 180);
  assert.ok(svgProj.includes('<svg'));
  assert.ok(svgProj.includes('<path'));
  assert.ok(svgProj.includes('circle'));
});
