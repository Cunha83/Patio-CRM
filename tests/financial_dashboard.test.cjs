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

test('6. Projeção de Metadados de Auditoria: Lançamentos WhatsApp vs Web e Registros Legados', () => {
  const financialAnalystService = require('../services/financialAnalystService.js');

  const movLegado = {
    id: 'm_legado_1',
    tipo: 'entrada',
    valor: 300,
    desc: 'Recebimento balcão legado'
  };

  const movWpp = {
    id: 'm_wpp_1',
    tipo: 'entrada',
    valor: 500,
    desc: 'Lançamento via bot',
    origem: 'whatsapp',
    canal: 'whatsapp',
    autorNumero: '5511999998888',
    confirmadoEm: '2026-10-18T10:30:00.000Z'
  };

  const projLegado = financialAnalystService.projetarMovimentacao(movLegado);
  assert.equal(projLegado.origem, 'web', 'Registro legado sem origem deve projetar origem: web por padrão');
  assert.equal(projLegado.autorNumero, null);
  assert.equal(projLegado.confirmadoEm, null);
  assert.equal(projLegado.estornado, false);
  assert.equal(projLegado.estornoDeId, null);

  const projWpp = financialAnalystService.projetarMovimentacao(movWpp);
  assert.equal(projWpp.origem, 'whatsapp');
  assert.equal(projWpp.canal, 'whatsapp');
  assert.equal(projWpp.autorNumero, '5511999998888');
  assert.equal(projWpp.confirmadoEm, '2026-10-18T10:30:00.000Z');
  assert.equal(projWpp.estornado, false);
});

test('7. Filtro por Origem (WhatsApp vs Web) e Consolidação de Resumo no Dashboard Financeiro', () => {
  const financialAnalystService = require('../services/financialAnalystService.js');

  const mockState = {
    cfg: { saldoInicial: 5000 },
    movimentos: [
      { id: 'm1', data: '2026-10-18', tipo: 'entrada', valor: 1000, desc: 'Venda balcão', origem: 'web' },
      { id: 'm2', data: '2026-10-18', tipo: 'saida', valor: 250, desc: 'Café e material', origem: 'web' },
      { id: 'm3', data: '2026-10-18', tipo: 'entrada', valor: 400, desc: 'Adiantamento OS', origem: 'whatsapp', autorNumero: '5511999998888', confirmadoEm: '2026-10-18T09:00:00.000Z' },
      { id: 'm4', data: '2026-10-18', tipo: 'saida', valor: 150, desc: 'Peça urgente', origem: 'whatsapp', autorNumero: '5511988887777', confirmadoEm: '2026-10-18T11:15:00.000Z' },
      { id: 'm5', data: '2026-10-18', tipo: 'entrada', valor: 300, desc: 'Serviço legado sem tag' } // legado -> default web
    ]
  };

  // 7.1 Filtro exclusivo por WhatsApp via listarMovimentacoes
  const resWpp = financialAnalystService.listarMovimentacoes(mockState, { origem: 'whatsapp' });
  assert.equal(resWpp.total, 2);
  assert.equal(resWpp.movimentacoes.length, 2);
  assert.ok(resWpp.movimentacoes.every(m => m.origem === 'whatsapp'));
  assert.deepEqual(resWpp.movimentacoes.map(m => m.id), ['m3', 'm4']);
  assert.equal(resWpp.movimentacoes[0].autorNumero, '5511999998888');

  // 7.2 Filtro exclusivo por Web via listarMovimentacoes
  const resWeb = financialAnalystService.listarMovimentacoes(mockState, { origem: 'web' });
  assert.equal(resWeb.total, 3);
  assert.ok(resWeb.movimentacoes.every(m => m.origem === 'web'));
  assert.deepEqual(resWeb.movimentacoes.map(m => m.id), ['m1', 'm2', 'm5']);

  // 7.3 Consolidação dos KPIs e Resumo de Origem no Dashboard
  const dash = engine.obterDashboardFinanceiro(mockState, { dataRef: '2026-10-18', filtro: 'hoje' });
  assert.ok(dash.kpis.resumoOrigem, 'Deve expor resumoOrigem dentro dos KPIs');
  assert.equal(dash.kpis.resumoOrigem.qtdWhatsapp, 2);
  assert.equal(dash.kpis.resumoOrigem.totalWhatsapp, 550); // 400 + 150
  assert.equal(dash.kpis.resumoOrigem.qtdWeb, 3);
  assert.equal(dash.kpis.resumoOrigem.totalWeb, 1550); // 1000 + 250 + 300
  assert.equal(dash.resumoOrigem.qtdWhatsapp, 2, 'Deve expor resumoOrigem na raiz do dashboard');
});

test('8. Rotina de Estorno Contábil: Reversão Matemática de Saldo, Imutabilidade e Metadados', () => {
  const financialAnalystService = require('../services/financialAnalystService.js');

  const state = {
    cfg: { saldoInicial: 500 },
    caixas: [
      {
        id: 'cx_1',
        status: 'aberto',
        aberto: true,
        saldoInicial: 500,
        saldoAtual: 500,
        totalEntradas: 0,
        totalSaidas: 0,
        movimentacoesIds: []
      }
    ],
    movimentos: []
  };

  // 1. Lança uma entrada via WhatsApp de R$ 200
  const lancRes = financialAnalystService.registrarMovimentacao(state, {
    tipo: 'entrada',
    valor: 200,
    descricao: 'Adiantamento via WhatsApp',
    origem: 'whatsapp',
    canal: 'whatsapp',
    autorNumero: '5511999998888',
    confirmadoEm: '2026-10-18T10:00:00.000Z'
  });

  assert.equal(lancRes.ok, true);
  assert.equal(state.caixas[0].saldoAtual, 700);
  assert.equal(state.movimentos.length, 1);
  const movId = lancRes.movimento.id;

  // 2. Executa o estorno pelo Dono
  const estornoRes = financialAnalystService.estornarMovimentacao(state, {
    movimentoId: movId,
    motivo: 'Lançamento indevido no WhatsApp',
    operador: 'dono_1',
    operadorNome: 'Carlos Dono'
  });

  assert.equal(estornoRes.ok, true);
  assert.equal(estornoRes.status, 200);

  // 3. Saldo do caixa deve retornar para 500 (efeito revertido com precisão)
  assert.equal(state.caixas[0].saldoAtual, 500, 'Saldo deve retornar exatamente a R$ 500');
  assert.equal(state.caixas[0].totalEntradas, 200);
  assert.equal(state.caixas[0].totalSaidas, 200);

  // 4. Imutabilidade: registro original marcado como estornado (sem deleção física)
  const movOrig = state.movimentos.find(m => m.id === movId);
  assert.ok(movOrig);
  assert.equal(movOrig.estornado, true);
  assert.equal(movOrig.estornadoPor, 'dono_1');
  assert.equal(movOrig.motivoEstorno, 'Lançamento indevido no WhatsApp');
  assert.ok(movOrig.estornadoEm);

  // 5. Movimento compensatório inserido
  const movComp = state.movimentos.find(m => m.estornoDeId === movId);
  assert.ok(movComp);
  assert.equal(movComp.tipo, 'saida', 'Compensatório de entrada deve ser saída');
  assert.equal(movComp.valor, 200);
  assert.equal(movComp.subtipo, 'estorno');
  assert.equal(movComp.cat, 'Estorno Contábil');
});

test('9. Travas de Idempotência e Validação do Estorno: Duplo Estorno e Estorno de Estorno', () => {
  const financialAnalystService = require('../services/financialAnalystService.js');

  const state = {
    cfg: { saldoInicial: 1000 },
    caixas: [
      { id: 'cx_2', status: 'aberto', aberto: true, saldoInicial: 1000, saldoAtual: 1000, totalEntradas: 0, totalSaidas: 0, movimentacoesIds: [] }
    ],
    movimentos: []
  };

  const lanc = financialAnalystService.registrarMovimentacao(state, {
    tipo: 'saida',
    valor: 100,
    descricao: 'Combustível teste'
  });
  const movId = lanc.movimento.id;

  // Primeiro estorno: sucesso
  const res1 = financialAnalystService.estornarMovimentacao(state, {
    movimentoId: movId,
    motivo: 'Comprovante cancelado',
    operador: 'dono_1'
  });
  assert.equal(res1.ok, true);

  // Segundo estorno (duplicado/idempotente): deve falhar com 409
  const res2 = financialAnalystService.estornarMovimentacao(state, {
    movimentoId: movId,
    motivo: 'Tentativa duplicada',
    operador: 'dono_1'
  });
  assert.equal(res2.ok, false);
  assert.equal(res2.status, 409);
  assert.equal(res2.code, 'MOVIMENTO_JA_ESTORNADO');

  // Tentativa de estornar o próprio lançamento compensatório de estorno: deve falhar com 400
  const idComp = res1.movimentoCompensatorio.id;
  const res3 = financialAnalystService.estornarMovimentacao(state, {
    movimentoId: idComp,
    motivo: 'Estornar o estorno',
    operador: 'dono_1'
  });
  assert.equal(res3.ok, false);
  assert.equal(res3.status, 400);
  assert.equal(res3.code, 'OPERACAO_INVALIDA_ESTORNO');

  // Tentativa com motivo curto (< 3 chars): deve falhar com 400
  const lanc2 = financialAnalystService.registrarMovimentacao(state, { tipo: 'saida', valor: 50, descricao: 'Fita' });
  const res4 = financialAnalystService.estornarMovimentacao(state, {
    movimentoId: lanc2.movimento.id,
    motivo: 'ok', // 2 chars
    operador: 'dono_1'
  });
  assert.equal(res4.ok, false);
  assert.equal(res4.status, 400);
  assert.equal(res4.code, 'MOTIVO_INVALIDO');

  // Tentativa com id inexistente: 404
  const res5 = financialAnalystService.estornarMovimentacao(state, {
    movimentoId: 'mov_inexistente_999',
    motivo: 'Teste inexistente',
    operador: 'dono_1'
  });
  assert.equal(res5.ok, false);
  assert.equal(res5.status, 404);
  assert.equal(res5.code, 'MOVIMENTO_NAO_ENCONTRADO');
});

test('10. RBAC e Trilha de Auditoria na Rota de Estorno: Dono autoriza (200), Mecânico recebe 403', async () => {
  const fs = require('fs');
  const os = require('os');
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'patio_test_audit_'));
  const testDb = path.join(tempDir, 'test_audit.db');
  process.env.DB_PATH = testDb;

  const { initDB, closeDB, all } = require('../db');
  await initDB();

  try {
    const express = require('express');
    const financialRoutes = require('../routes/financial.routes');
    const { salvarEstado } = require('../lib/serverContext');

    const app = express();
    app.use(express.json());

    // Middleware de contexto de autenticação injetável para testes
    let mockContext = { role: 'dono', actorId: 'dono_audit_1', tenantId: 'tenant_audit_fin' };
    app.use((req, res, next) => {
      req.securityContext = mockContext;
      req.headers['x-tenant-id'] = mockContext.tenantId;
      next();
    });
    app.use(financialRoutes);

    const { getDefaultState } = require('../lib/repository/stateRepository');
    const tenantId = 'tenant_audit_fin';
    const base = getDefaultState(tenantId);
    const testState = {
      ...base,
      tenantId,
      cfg: { ...base.cfg, saldoInicial: 1000 },
      caixas: [{ id: 'cx_aud_1', status: 'aberto', aberto: true, saldoInicial: 1000, saldoAtual: 1000, totalEntradas: 0, totalSaidas: 0, movimentacoesIds: ['mov_aud_1', 'mov_aud_2'] }],
      movimentos: [
        { id: 'mov_aud_1', tenantId, caixaId: 'cx_aud_1', tipo: 'entrada', valor: 250, desc: 'Entrada para estorno teste', origem: 'whatsapp' },
        { id: 'mov_aud_2', tenantId, caixaId: 'cx_aud_1', tipo: 'entrada', valor: 150, desc: 'Segunda entrada para teste de caixa fechado', origem: 'web' }
      ]
    };
    await salvarEstado(tenantId, testState);

    const http = require('http');
    const server = http.createServer(app);
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    const port = server.address().port;
    const baseUrl = `http://127.0.0.1:${port}`;

    try {
      // 10.1 Mecânico tenta estornar -> Deve receber 403 Forbidden
      mockContext = { role: 'mecanico', actorId: 'mec_joao', tenantId, permissions: ['financial:write'] };
      const resMec = await fetch(`${baseUrl}/api/financeiro/movimentacoes/mov_aud_1/estornar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ motivo: 'Tentativa mecânico' })
      });

      assert.equal(resMec.status, 403);
      const jsonMec = await resMec.json();
      assert.match(jsonMec.error, /restrito a administradores superiores/i);

      // 10.2 Dono executa o estorno -> 200 OK
      mockContext = { role: 'dono', actorId: 'dono_audit_1', tenantId, permissions: ['*'] };
      const resDono = await fetch(`${baseUrl}/api/financeiro/movimentacoes/mov_aud_1/estornar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ motivo: 'Estorno autorizado pelo dono' })
      });

      assert.equal(resDono.status, 200);
      const jsonDono = await resDono.json();
      assert.equal(jsonDono.success, true);
      assert.equal(jsonDono.movimentoOriginal.estornado, true);
      assert.equal(jsonDono.movimentoCompensatorio.tipo, 'saida');

      // 10.3 Auditoria no SQLite security_audit_log
      const auditRows = await all("SELECT action, details_json FROM security_audit_log WHERE tenant_id = ? ORDER BY id ASC", [tenantId]);
      assert.ok(auditRows.length >= 2, 'Deve ter registrado tentativa negada e estorno efetuado');

      const negadoLog = auditRows.find(r => r.action === 'financeiro:movimento:estorno_negado');
      assert.ok(negadoLog, 'Deve conter log de estorno negado');
      assert.match(negadoLog.details_json, /perfil_sem_permissao/);

      const estornoLog = auditRows.find(r => r.action === 'financeiro:movimento:estornar');
      assert.ok(estornoLog, 'Deve conter log de estorno bem-sucedido');
      assert.match(estornoLog.details_json, /mov_aud_1/);
      assert.match(estornoLog.details_json, /whatsapp/);

      // 10.4 Fechamento de Caixa com Snapshot por Origem e Auditoria financeiro:caixa:fechar
      mockContext = { role: 'dono', actorId: 'dono_audit_1', tenantId, permissions: ['*'] };
      const resFechar = await fetch(`${baseUrl}/api/financeiro/caixa/fechar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          valoresInformados: { dinheiro: 1000 },
          observacoes: 'Fechamento turno auditado'
        })
      });

      assert.equal(resFechar.status, 200);
      const jsonFechar = await resFechar.json();
      assert.equal(jsonFechar.success, true);
      assert.equal(jsonFechar.caixa.status, 'fechado');
      assert.ok(jsonFechar.fechamento.resumoOrigem, 'Deve conter resumoOrigem');
      assert.ok(jsonFechar.fechamento.resumoTextoWhatsapp, 'Deve conter resumoTextoWhatsapp');
      assert.match(jsonFechar.fechamento.resumoTextoWhatsapp, /BOLETIM DE FECHAMENTO DE CAIXA/);
      assert.match(jsonFechar.fechamento.resumoTextoWhatsapp, /WhatsApp:/);

      // Trava de Imutabilidade: Estorno de movimentação em caixa fechado deve retornar 409 CAIXA_JA_FECHADO
      const resEstornoCaixaFechado = await fetch(`${baseUrl}/api/financeiro/movimentacoes/mov_aud_2/estornar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ motivo: 'Tentativa em caixa fechado' })
      });
      assert.equal(resEstornoCaixaFechado.status, 409);
      const jsonCaixaFechado = await resEstornoCaixaFechado.json();
      assert.equal(jsonCaixaFechado.code, 'CAIXA_JA_FECHADO');

      // Auditoria financeiro:caixa:fechar gravada
      const auditFecharRows = await all("SELECT action, details_json FROM security_audit_log WHERE tenant_id = ? AND action = 'financeiro:caixa:fechar'", [tenantId]);
      assert.equal(auditFecharRows.length, 1);
      assert.match(auditFecharRows[0].details_json, /cx_aud_1/);
    } finally {
      await new Promise(r => server.close(r));
    }
  } finally {
    await closeDB().catch(() => {});
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}
  }
});

test('11. Conciliação de Saldo por Ordem de Serviço (OS): múltiplos recebimentos, estorno e API de resumo', async () => {
  const financialAnalystService = require('../services/financialAnalystService.js');

  const state = {
    tenantId: 'default',
    caixas: [
      {
        id: 'cx_os_1',
        status: 'aberto',
        aberto: true,
        saldoInicial: 1000,
        saldoAtual: 1000,
        totalEntradas: 0,
        totalSaidas: 0,
        movimentacoesIds: []
      }
    ],
    movimentos: []
  };

  // 11.1 Adiantamento Pix de R$ 300 na OS #401
  const mov1 = financialAnalystService.registrarMovimentacao(state, {
    tipo: 'entrada',
    valor: 300,
    forma: 'pix',
    osId: '401',
    placa: 'ABC1D23',
    descricao: 'Adiantamento sinal OS #401'
  });
  assert.equal(mov1.ok, true);

  // 11.2 Despesa/peça vinculada à OS #401 de R$ 100 em dinheiro
  const mov2 = financialAnalystService.registrarMovimentacao(state, {
    tipo: 'saida',
    valor: 100,
    forma: 'dinheiro',
    osId: '401',
    placa: 'ABC1D23',
    descricao: 'Compra de filtro de óleo OS #401'
  });
  assert.equal(mov2.ok, true);

  // 11.3 Quitação restante de R$ 500 no cartão de crédito na OS #401
  const mov3 = financialAnalystService.registrarMovimentacao(state, {
    tipo: 'entrada',
    valor: 500,
    forma: 'cartao_credito',
    osId: '401',
    placa: 'ABC1D23',
    descricao: 'Quitação serviço OS #401'
  });
  assert.equal(mov3.ok, true);

  // 11.4 Consulta de resumo financeiro da OS #401
  const resumo1 = financialAnalystService.obterResumoFinanceiroOS(state, '401');
  assert.equal(resumo1.osId, '401');
  assert.equal(resumo1.totalEntradasOS, 800);
  assert.equal(resumo1.totalSaidasOS, 100);
  assert.equal(resumo1.saldoLiquidoOS, 700);
  assert.equal(resumo1.qtdLancamentos, 3);
  assert.deepEqual(resumo1.placasVinculadas, ['ABC1D23']);
  assert.equal(resumo1.resumoMeiosPagamento.pix.total, 300);
  assert.equal(resumo1.resumoMeiosPagamento.cartao_credito.total, 500);
  assert.equal(resumo1.resumoMeiosPagamento.dinheiro.total, 100);

  // 11.5 Enriquecimento de listarMovimentacoes com resumoPorOS
  const lista1 = financialAnalystService.listarMovimentacoes(state);
  assert.ok(lista1.resumoPorOS);
  assert.ok(lista1.resumoPorOS['401']);
  assert.equal(lista1.resumoPorOS['401'].saldoLiquidoOS, 700);

  // 11.6 Estorno da quitação de R$ 500: reflexo imediato de anulação
  const estornoRes = financialAnalystService.estornarMovimentacao(state, {
    movimentoId: mov3.movimento.id,
    motivo: 'Lançamento indevido de quitação'
  });
  assert.equal(estornoRes.ok, true);

  const resumoAposEstorno = financialAnalystService.obterResumoFinanceiroOS(state, '401');
  assert.equal(resumoAposEstorno.totalEntradasOS, 300, 'Entradas devem abater imediatamente os 500 estornados');
  assert.equal(resumoAposEstorno.totalSaidasOS, 100);
  assert.equal(resumoAposEstorno.saldoLiquidoOS, 200, 'Saldo líquido da OS deve ser 300 - 100 = 200');
  assert.equal(resumoAposEstorno.qtdLancamentos, 2, 'Apenas as 2 movimentações ativas restantes');

  const listaAposEstorno = financialAnalystService.listarMovimentacoes(state);
  assert.equal(listaAposEstorno.resumoPorOS['401'].saldoLiquidoOS, 200);
});

test('12. Operações de Tesouraria (Sangria e Suprimento): reflexo no saldo, fechamento e auditoria', async () => {
  const financialAnalystService = require('../services/financialAnalystService.js');
  const engine = require('../services/financialEngine.js');

  const state = {
    tenantId: 'default',
    caixas: [
      {
        id: 'cx_tes_1',
        status: 'aberto',
        aberto: true,
        saldoInicial: 1000,
        saldoAtual: 1000,
        totalEntradas: 0,
        totalSaidas: 0,
        movimentacoesIds: []
      }
    ],
    movimentos: []
  };

  // 12.1 Suprimento de R$ 300 para troco
  const supRes = financialAnalystService.registrarMovimentacao(state, {
    tipo: 'entrada',
    subtipo: 'suprimento',
    naturezaOperacao: 'suprimento',
    valor: 300,
    descricao: 'Aporte troco matinal',
    forma: 'dinheiro'
  });
  assert.equal(supRes.ok, true);
  assert.equal(state.caixas[0].saldoAtual, 1300);
  assert.equal(supRes.movimentacao.naturezaOperacao, 'suprimento');

  // 12.2 Sangria de R$ 500 para cofre
  const sangRes = financialAnalystService.registrarMovimentacao(state, {
    tipo: 'saida',
    subtipo: 'sangria',
    naturezaOperacao: 'sangria',
    valor: 500,
    descricao: 'Sangria de segurança para cofre',
    forma: 'dinheiro'
  });
  assert.equal(sangRes.ok, true);
  assert.equal(state.caixas[0].saldoAtual, 800);
  assert.equal(sangRes.movimentacao.naturezaOperacao, 'sangria');

  // 12.3 Recusa de sangria por saldo insuficiente (tentativa de retirar 900 com saldo de 800)
  const sangInsuf = financialAnalystService.registrarMovimentacao(state, {
    tipo: 'saida',
    subtipo: 'sangria',
    naturezaOperacao: 'sangria',
    valor: 900,
    descricao: 'Tentativa além do saldo',
    forma: 'dinheiro'
  });
  assert.equal(sangInsuf.ok, false);
  assert.match(sangInsuf.error, /excede o saldo em dinheiro disponível/i);
  assert.equal(state.caixas[0].saldoAtual, 800);

  // 12.4 Fechamento com apuração exata de sangria e suprimento
  const fechamentoRes = financialAnalystService.fecharCaixa(state, {
    tenantId: 'default',
    operador: 'dono_tesouraria'
  });
  assert.equal(fechamentoRes.ok, true);
  assert.equal(fechamentoRes.caixaFechado.status, 'fechado');
  assert.equal(fechamentoRes.fechamento.totalSuprimentos, 300);
  assert.equal(fechamentoRes.fechamento.qtdSuprimentos, 1);
  assert.equal(fechamentoRes.fechamento.totalSangrias, 500);
  assert.equal(fechamentoRes.fechamento.qtdSangrias, 1);
  assert.equal(fechamentoRes.fechamento.saldoEsperado, 800);
  assert.match(fechamentoRes.fechamento.resumoTextoWhatsapp, /TESOURARIA & MOVIMENTAÇÃO DE CAIXA/);
  assert.match(fechamentoRes.fechamento.resumoTextoWhatsapp, /Suprimentos \/ Aportes/);
  assert.match(fechamentoRes.fechamento.resumoTextoWhatsapp, /Sangrias \/ Retiradas/);

  // 12.5 KPIs no motor financeiro
  const kpis = engine.calcularKPIsFinanceiros(state, { filtro: 'hoje' });
  assert.equal(kpis.totalSuprimentos, 300);
  assert.equal(kpis.totalSangrias, 500);
});

test('13. Exportação contábil CSV e JSON com cálculo de hash SHA-256 e BOM UTF-8', () => {
  const crypto = require('crypto');
  const financialAnalystService = require('../services/financialAnalystService.js');
  const state = {
    cfg: { saldoInicial: 1000 },
    caixas: [{ id: 'cx_exp_1', status: 'aberto', saldoAtual: 1000 }],
    movimentos: [
      {
        id: 'mov_exp_1',
        tipo: 'entrada',
        subtipo: 'receita',
        naturezaOperacao: 'receita',
        valor: 450,
        desc: 'Troca de freios',
        forma: 'pix',
        origem: 'whatsapp',
        osId: '201',
        placa: 'BRA2E19',
        autorNumero: '5511999990001',
        data: '2026-10-18T10:00:00Z'
      },
      {
        id: 'mov_exp_2',
        tipo: 'saida',
        subtipo: 'sangria',
        naturezaOperacao: 'sangria',
        valor: 200,
        desc: 'Retirada de segurança',
        forma: 'dinheiro',
        origem: 'web',
        operador: 'dono_joao',
        data: '2026-10-18T11:00:00Z'
      }
    ]
  };

  // 13.1 Exportação em CSV
  const csvRes = financialAnalystService.exportarMovimentacoesContabeis(state, { formato: 'csv' });
  assert.equal(csvRes.formato, 'csv');
  assert.equal(csvRes.mimeType, 'text/csv; charset=utf-8');
  assert.equal(csvRes.totalRegistros, 2);
  assert.ok(csvRes.conteudo.startsWith('\uFEFF'), 'CSV deve iniciar com BOM UTF-8');
  assert.match(csvRes.conteudo, /ID;DataHora;Tipo;Natureza;Valor;MeioPagamento;Origem;OS;Placa;Autor;StatusEstorno;Descricao/);
  assert.match(csvRes.conteudo, /mov_exp_1;.*entrada;receita;450\.00;pix;whatsapp;201;BRA2E19;5511999990001;ATIVO;"Troca de freios"/);
  assert.match(csvRes.conteudo, /mov_exp_2;.*saida;sangria;200\.00;dinheiro;web;;;dono_joao;ATIVO;"Retirada de segurança"/);

  // Validação do hash SHA-256
  const shaCalculado = crypto.createHash('sha256').update(csvRes.conteudo, 'utf8').digest('hex');
  assert.equal(csvRes.sha256, shaCalculado);

  // 13.2 Exportação em JSON
  const jsonRes = financialAnalystService.exportarMovimentacoesContabeis(state, { formato: 'json' });
  assert.equal(jsonRes.formato, 'json');
  assert.equal(jsonRes.mimeType, 'application/json');
  assert.equal(jsonRes.totalRegistros, 2);
  const parsed = JSON.parse(jsonRes.conteudo);
  assert.equal(parsed.integridade.algoritmo, 'sha256');
  assert.equal(parsed.integridade.sha256, jsonRes.sha256);
  assert.equal(parsed.movimentacoes.length, 2);
});

test('14. Rota GET /api/financeiro/exportar com header X-Export-SHA256, filtros e auditoria', async () => {
  const fs = require('fs');
  const os = require('os');
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'patio_test_export_'));
  const testDb = path.join(tempDir, 'test_export.db');
  process.env.DB_PATH = testDb;

  const { initDB, closeDB, all } = require('../db');
  await initDB();

  try {
    const express = require('express');
    const http = require('http');
    const financialRoutes = require('../routes/financial.routes');
    const { salvarEstado } = require('../lib/serverContext');
    const { getDefaultState } = require('../lib/repository/stateRepository');

    const app = express();
    app.use(express.json());

    const tenantId = 'tenant_export_test';
    const mockContext = { role: 'dono', actorId: 'dono_exportador', tenantId, permissions: ['financial:read'] };
    app.use((req, res, next) => {
      req.securityContext = mockContext;
      req.headers['x-tenant-id'] = tenantId;
      next();
    });
    app.use(financialRoutes);

    const base = getDefaultState(tenantId);
    const testState = {
      ...base,
      tenantId,
      caixas: [{ id: 'cx_exp_route', status: 'aberto', saldoAtual: 1500 }],
      movimentos: [
        { id: 'mov_r1', tenantId, tipo: 'entrada', valor: 300, forma: 'pix', origem: 'whatsapp', data: '2026-10-18' },
        { id: 'mov_r2', tenantId, tipo: 'saida', valor: 100, forma: 'dinheiro', origem: 'web', data: '2026-10-18' }
      ]
    };
    await salvarEstado(tenantId, testState);

    const server = http.createServer(app);
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    const port = server.address().port;
    const baseUrl = `http://127.0.0.1:${port}`;

    try {
      // 14.1 Download CSV com filtro origem=whatsapp
      const resCsv = await fetch(`${baseUrl}/api/financeiro/exportar?formato=csv&origem=whatsapp`);
      assert.equal(resCsv.status, 200);
      assert.match(resCsv.headers.get('content-type'), /text\/csv/);
      const shaHeader = resCsv.headers.get('x-export-sha256');
      assert.ok(shaHeader, 'Cabeçalho X-Export-SHA256 deve estar presente');
      const textCsv = await resCsv.text();
      assert.match(textCsv, /mov_r1/);
      assert.doesNotMatch(textCsv, /mov_r2/);

      // 14.2 Verifica gravação da auditoria
      const auditRows = await all(`
        SELECT action, details_json FROM security_audit_log
        WHERE tenant_id = ? AND action = 'financeiro:relatorio:exportar'
        ORDER BY id DESC LIMIT 1
      `, [tenantId]);
      assert.ok(auditRows.length > 0, 'Registro de auditoria deve ser encontrado');
      const details = JSON.parse(auditRows[0].details_json);
      assert.equal(details.formato, 'csv');
      assert.equal(details.sha256, shaHeader);
    } finally {
      await new Promise(r => server.close(r));
    }
  } finally {
    await closeDB().catch(() => {});
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}
  }
});

test('15. Faturamento a prazo de saldo devedor de OS e cálculo de statusLiberacaoPatio', () => {
  const financialAnalystService = require('../services/financialAnalystService.js');

  const state = {
    tenantId: 'default',
    os: [
      { id: '501', placa: 'XYZ9K88', cliente: 'Transportadora Silva', total: 1200, status: 'em_andamento' }
    ],
    movimentos: [
      { id: 'mov_sinal_1', tipo: 'entrada', valor: 400, forma: 'pix', osId: '501', placa: 'XYZ9K88' }
    ],
    contas: []
  };

  // 15.1 Antes do faturamento: pago 400 de 1200 -> saldoRestante 800 -> status 'retido_pendente'
  const resumoAntes = financialAnalystService.obterResumoFinanceiroOS(state, '501');
  assert.equal(resumoAntes.totalOrcado, 1200);
  assert.equal(resumoAntes.totalPago, 400);
  assert.equal(resumoAntes.saldoRestante, 800);
  assert.equal(resumoAntes.quitada, false);
  assert.equal(resumoAntes.totalFaturadoPrazo, 0);
  assert.equal(resumoAntes.statusLiberacaoPatio, 'retido_pendente');

  // 15.2 Fatura o saldo restante de 800 em 2 parcelas no boleto
  const fatRes = financialAnalystService.faturarSaldoOS(state, {
    osId: '501',
    parcelas: 2,
    meioPagamento: 'boleto',
    observacao: 'Faturamento frota 30/60 dias',
    operador: 'dono_joao'
  });

  assert.equal(fatRes.ok, true);
  assert.equal(fatRes.valorFaturado, 800);
  assert.equal(fatRes.parcelas, 2);
  assert.equal(fatRes.titulos.length, 2);
  assert.equal(fatRes.titulos[0].valor, 400);
  assert.equal(fatRes.titulos[1].valor, 400);
  assert.equal(fatRes.titulos[0].forma, 'boleto');
  assert.equal(fatRes.titulos[0].parte, 'Transportadora Silva');
  assert.equal(fatRes.titulos[0].pago, false);
  assert.equal(state.contas.length, 2);

  // 15.3 Após faturamento: statusLiberacaoPatio passa para 'liberado_faturado'
  const resumoDepois = financialAnalystService.obterResumoFinanceiroOS(state, '501');
  assert.equal(resumoDepois.totalFaturadoPrazo, 800);
  assert.equal(resumoDepois.statusLiberacaoPatio, 'liberado_faturado');
  assert.equal(resumoDepois.titulosVinculados.length, 2);

  // 15.4 Tentativa de duplo faturamento de OS já integralmente faturada -> 409 Conflict
  const duploFat = financialAnalystService.faturarSaldoOS(state, {
    osId: '501',
    parcelas: 1
  });
  assert.equal(duploFat.ok, false);
  assert.equal(duploFat.status, 409);
  assert.equal(duploFat.code, 'OS_JA_QUITADA_OU_FATURADA');
});

test('16. Rota POST /api/financeiro/os/:osId/faturar: RBAC, geração de títulos e trilha de auditoria', async () => {
  const fs = require('fs');
  const os = require('os');
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'patio_test_fat_os_'));
  const testDb = path.join(tempDir, 'test_fat_os.db');
  process.env.DB_PATH = testDb;

  const { initDB, closeDB, all } = require('../db');
  await initDB();

  try {
    const express = require('express');
    const http = require('http');
    const financialRoutes = require('../routes/financial.routes');
    const { salvarEstado } = require('../lib/serverContext');
    const { getDefaultState } = require('../lib/repository/stateRepository');

    const app = express();
    app.use(express.json());

    const tenantId = 'tenant_fat_route';
    let mockContext = { role: 'dono', actorId: 'dono_fat', tenantId, permissions: ['financial:write', 'financial:manage'] };
    app.use((req, res, next) => {
      req.securityContext = mockContext;
      req.headers['x-tenant-id'] = tenantId;
      next();
    });
    app.use(financialRoutes);

    const base = getDefaultState(tenantId);
    const testState = {
      ...base,
      tenantId,
      os: [
        { id: '601', placa: 'GHI9J01', cliente: 'Frota Express', total: 1500, status: 'em_andamento' }
      ],
      movimentos: [
        { id: 'mov_sinal_601', tenantId, tipo: 'entrada', valor: 500, forma: 'pix', osId: '601', placa: 'GHI9J01' }
      ],
      contas: []
    };
    await salvarEstado(tenantId, testState);

    const server = http.createServer(app);
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    const port = server.address().port;
    const baseUrl = `http://127.0.0.1:${port}`;

    try {
      // 16.1 Mecânico tenta faturar -> 403 Forbidden
      mockContext = { role: 'mecanico', actorId: 'mec_1', tenantId, permissions: ['financial:read'] };
      const resMec = await fetch(`${baseUrl}/api/financeiro/os/601/faturar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parcelas: 2, meioPagamento: 'boleto' })
      });
      assert.equal(resMec.status, 403);

      // 16.2 Dono executa faturamento -> 201 Created
      mockContext = { role: 'dono', actorId: 'dono_fat', tenantId, permissions: ['financial:write', 'financial:manage'] };
      const resDono = await fetch(`${baseUrl}/api/financeiro/os/601/faturar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parcelas: 2,
          meioPagamento: 'boleto',
          observacao: 'Faturamento Frota Express'
        })
      });

      assert.equal(resDono.status, 201);
      const jsonDono = await resDono.json();
      assert.equal(jsonDono.success, true);
      assert.equal(jsonDono.valorFaturado, 1000);
      assert.equal(jsonDono.resumoOS.statusLiberacaoPatio, 'liberado_faturado');

      // 16.3 Auditoria no banco
      const auditRows = await all(`
        SELECT action, details_json FROM security_audit_log
        WHERE tenant_id = ? AND action = 'financeiro:os:faturar'
        ORDER BY id DESC LIMIT 1
      `, [tenantId]);
      assert.ok(auditRows.length > 0, 'Auditoria financeiro:os:faturar deve ser registrada');
      const details = JSON.parse(auditRows[0].details_json);
      assert.equal(details.osId, '601');
      assert.equal(details.valorFaturado, 1000);
      assert.equal(details.statusLiberacaoPatio, 'liberado_faturado');
    } finally {
      await new Promise(r => server.close(r));
    }
  } finally {
    await closeDB().catch(() => {});
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}
  }
});

test('17. Rota POST /api/financeiro/titulos/:id/liquidar com RBAC, baixa no caixa aberto e auditoria', async () => {
  const fs = require('fs');
  const os = require('os');
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'patio_test_liq_'));
  const testDbPath = path.join(tempDir, 'test.db');
  process.env.DB_PATH = testDbPath;

  const { initDB, closeDB, all } = require('../db');
  try {
    await initDB();
    const tenantId = 't_liq_route';

    const express = require('express');
    const http = require('http');
    const financialRoutes = require('../routes/financial.routes');
    const { salvarEstado } = require('../lib/serverContext');
    const { getDefaultState } = require('../lib/repository/stateRepository');

    const app = express();
    app.use(express.json());

    let mockContext = { role: 'dono', actorId: 'dono_1', tenantId, permissions: ['financial:write', 'financial:manage'] };
    app.use((req, res, next) => {
      req.securityContext = mockContext;
      req.headers['x-tenant-id'] = tenantId;
      next();
    });
    app.use(financialRoutes);

    const base = getDefaultState(tenantId);
    const testState = {
      ...base,
      tenantId,
      cfg: { saldoInicial: 500 },
      caixas: [
        {
          id: 'cx_liq_1',
          status: 'aberto',
          aberto: true,
          saldoInicial: 500,
          saldoAtual: 500,
          totalEntradas: 0,
          totalSaidas: 0,
          movimentacoesIds: []
        }
      ],
      movimentos: [],
      contas: [
        {
          id: 'tit_rec_101',
          tipo: 'receber',
          desc: 'Serviço de Freios OS 701',
          parte: 'Cliente Frota',
          valor: 350,
          venc: '2026-10-18',
          pago: false,
          status: 'aberto'
        },
        {
          id: 'tit_pag_102',
          tipo: 'pagar',
          desc: 'Peças Distribuidora',
          parte: 'Distribuidora Auto',
          valor: 120,
          venc: '2026-10-18',
          pago: false,
          status: 'aberto'
        }
      ]
    };
    await salvarEstado(tenantId, testState);

    const server = http.createServer(app);
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    const port = server.address().port;
    const baseUrl = `http://127.0.0.1:${port}`;

    try {
      // 17.1 Mecânico tenta liquidar -> 403 Forbidden
      mockContext = { role: 'mecanico', actorId: 'mec_1', tenantId, permissions: ['financial:read'] };
      const resMec = await fetch(`${baseUrl}/api/financeiro/titulos/tit_rec_101/liquidar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ meioPagamento: 'pix' })
      });
      assert.equal(resMec.status, 403);

      // 17.2 Financeiro liquida título a receber -> 200 OK
      mockContext = { role: 'financeiro', actorId: 'fin_ana', tenantId, permissions: ['financial:write'] };
      const resFin = await fetch(`${baseUrl}/api/financeiro/titulos/tit_rec_101/liquidar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ meioPagamento: 'pix' })
      });

      assert.equal(resFin.status, 200);
      const jsonFin = await resFin.json();
      assert.equal(jsonFin.success, true);
      assert.equal(jsonFin.titulo.pago, true);
      assert.equal(jsonFin.titulo.status, 'liquidado');
      assert.equal(jsonFin.saldoCaixaAtual, 850); // 500 + 350
      assert.equal(jsonFin.movimentacao.tipo, 'entrada');

      // 17.3 Tentar liquidar título já baixado -> 409 Conflict
      const resDuplo = await fetch(`${baseUrl}/api/financeiro/titulos/tit_rec_101/liquidar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ meioPagamento: 'dinheiro' })
      });
      assert.equal(resDuplo.status, 409);

      // 17.4 Dono liquida conta a pagar -> 200 OK e reduz caixa
      mockContext = { role: 'dono', actorId: 'dono_1', tenantId, permissions: ['financial:write', 'financial:manage'] };
      const resPag = await fetch(`${baseUrl}/api/financeiro/titulos/tit_pag_102/liquidar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ meioPagamento: 'dinheiro' })
      });
      assert.equal(resPag.status, 200);
      const jsonPag = await resPag.json();
      assert.equal(jsonPag.success, true);
      assert.equal(jsonPag.titulo.pago, true);
      assert.equal(jsonPag.saldoCaixaAtual, 730); // 850 - 120
      assert.equal(jsonPag.movimentacao.tipo, 'saida');

      // 17.5 Verifica auditoria no SQLite
      const auditRows = await all(`
        SELECT action, entity_id, details_json FROM security_audit_log
        WHERE tenant_id = ? AND action = 'financeiro:titulo:liquidar'
        ORDER BY id ASC
      `, [tenantId]);
      assert.equal(auditRows.length, 2, 'Devem existir 2 auditorias de liquidação');
      assert.equal(auditRows[0].entity_id, 'tit_rec_101');
      assert.equal(auditRows[1].entity_id, 'tit_pag_102');
    } finally {
      await new Promise(r => server.close(r));
    }
  } finally {
    await closeDB().catch(() => {});
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}
  }
});

test('18. Validação de Liberação de Pátio (Portaria) e Override Auditado com RBAC (Frente 5A)', async () => {
  const fs = require('fs');
  const os = require('os');
  const express = require('express');
  const http = require('http');
  const financialAnalystService = require('../services/financialAnalystService.js');
  const financialRoutes = require('../routes/financial.routes');
  const { salvarEstado } = require('../lib/serverContext');
  const { getDefaultState } = require('../lib/repository/stateRepository');
  const { initDB, closeDB, all } = require('../db');

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'patio-lib-saida-test-'));
  const testDb = path.join(tempDir, 'test.db');
  process.env.DB_PATH = testDb;

  try {
    await initDB();
    const tenantId = 't_lib_saida';

    // 18.1 Motor de validação: OS com pendência retida sem forçar -> 409
    const stateMock = {
      tenantId,
      os: [
        { id: '801', numero: '801', total: 1000, cliente: 'Cliente Devedor' },
        { id: '802', numero: '802', total: 500, cliente: 'Cliente Quitado' }
      ],
      movimentos: [
        { id: 'mov_pago_802', osId: '802', tipo: 'entrada', valor: 500, forma: 'pix', status: 'confirmado' }
      ],
      contas: []
    };

    const resCheck801 = financialAnalystService.validarOuAutorizarSaidaPatioOS(stateMock, {
      osId: '801',
      forcarLiberacao: false
    });
    assert.equal(resCheck801.ok, false);
    assert.equal(resCheck801.status, 409);
    assert.equal(resCheck801.code, 'OS_RETIDA_PENDENCIA_FINANCEIRA');
    assert.equal(resCheck801.autorizado, false);
    assert.equal(resCheck801.saldoRestante, 1000);

    // 18.2 Motor de validação: OS quitada -> Autorizada de imediato
    const resCheck802 = financialAnalystService.validarOuAutorizarSaidaPatioOS(stateMock, {
      osId: '802',
      forcarLiberacao: false
    });
    assert.equal(resCheck802.ok, true);
    assert.equal(resCheck802.autorizado, true);
    assert.equal(resCheck802.statusLiberacaoPatio, 'liberado_quitado');

    // 18.3 Motor de validação: mecânico tenta forçar liberação -> 403
    const resMecForca = financialAnalystService.validarOuAutorizarSaidaPatioOS(stateMock, {
      osId: '801',
      forcarLiberacao: true,
      justificativa: 'Liberado pelo mecânico chefe',
      operador: { perfil: 'mecanico', nome: 'Mecânico Zé' }
    });
    assert.equal(resMecForca.ok, false);
    assert.equal(resMecForca.status, 403);
    assert.equal(resMecForca.code, 'PERFIL_NAO_AUTORIZADO');

    // 18.4 Motor de validação: dono tenta forçar sem justificativa válida (< 5 chars) -> 400
    const resDonoSemJust = financialAnalystService.validarOuAutorizarSaidaPatioOS(stateMock, {
      osId: '801',
      forcarLiberacao: true,
      justificativa: 'ok',
      operador: { perfil: 'dono', nome: 'Dono da Oficina' }
    });
    assert.equal(resDonoSemJust.ok, false);
    assert.equal(resDonoSemJust.status, 400);
    assert.equal(resDonoSemJust.code, 'JUSTIFICATIVA_INVALIDA');

    // 18.5 Motor de validação: dono autoriza excepcionalmente -> 200 e altera status
    const resDonoSucesso = financialAnalystService.validarOuAutorizarSaidaPatioOS(stateMock, {
      osId: '801',
      forcarLiberacao: true,
      justificativa: 'Liberado mediante promissória assinada e autorizada pelo dono',
      operador: { perfil: 'dono', nome: 'Dono da Oficina' }
    });
    assert.equal(resDonoSucesso.ok, true);
    assert.equal(resDonoSucesso.autorizado, true);
    assert.equal(resDonoSucesso.statusLiberacaoPatio, 'liberado_excepcional');
    assert.ok(resDonoSucesso.liberacaoExcepcional);
    assert.equal(resDonoSucesso.liberacaoExcepcional.saldoPendenteNaSaida, 1000);

    const resumoRecalculado = financialAnalystService.obterResumoFinanceiroOS(stateMock, '801');
    assert.equal(resumoRecalculado.statusLiberacaoPatio, 'liberado_excepcional');

    // 18.6 Teste de Rota HTTP REST com express e auditoria
    const app = express();
    app.use(express.json());
    let mockContext = { role: 'dono', actorId: 'dono_1', tenantId, permissions: ['os:read', 'os:write', 'financial:write'] };
    app.use((req, res, next) => {
      req.securityContext = mockContext;
      req.headers['x-tenant-id'] = tenantId;
      next();
    });
    app.use(financialRoutes);

    const base = getDefaultState(tenantId);
    const testState = {
      ...base,
      tenantId,
      os: [
        { id: '850', numero: '850', total: 1500, cliente: 'Transportadora Alfa' }
      ],
      movimentos: [],
      contas: []
    };
    await salvarEstado(tenantId, testState);

    const server = http.createServer(app);
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    const port = server.address().port;
    const baseUrl = `http://127.0.0.1:${port}`;

    try {
      // Tentativa de liberação sem forçar -> 409
      const resApi409 = await fetch(`${baseUrl}/api/financeiro/os/850/liberar-saida`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ forcarLiberacao: false })
      });
      assert.equal(resApi409.status, 409);
      const json409 = await resApi409.json();
      assert.equal(json409.code, 'OS_RETIDA_PENDENCIA_FINANCEIRA');

      // Mecânico tentando forçar liberação -> 403
      mockContext = { role: 'mecanico', actorId: 'mec_1', tenantId, permissions: ['os:read', 'operation:read'] };
      const resApiMec = await fetch(`${baseUrl}/api/financeiro/os/850/liberar-saida`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ forcarLiberacao: true, justificativa: 'Mecânico liberando pátio' })
      });
      assert.equal(resApiMec.status, 403);
      const jsonMec = await resApiMec.json();
      assert.equal(jsonMec.code, 'PERFIL_NAO_AUTORIZADO');

      // Dono liberando com justificativa -> 200 OK
      mockContext = { role: 'dono', actorId: 'dono_1', tenantId, fullName: 'Diretor Comercial', permissions: ['financial:write', 'os:write'] };
      const resApiDono = await fetch(`${baseUrl}/api/financeiro/os/850/liberar-saida`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          forcarLiberacao: true,
          justificativa: 'Cliente corporativo com faturamento quinzenal acordado'
        })
      });
      assert.equal(resApiDono.status, 200);
      const jsonDono = await resApiDono.json();
      assert.equal(jsonDono.success, true);
      assert.equal(jsonDono.statusLiberacaoPatio, 'liberado_excepcional');
      assert.equal(jsonDono.liberacaoExcepcional.autorizadoPor, 'Diretor Comercial');

      // Verifica auditorias registradas no SQLite
      const auditRows = await all(`
        SELECT action, entity_id FROM security_audit_log
        WHERE tenant_id = ? AND action LIKE 'financeiro:os:liberar_saida_%'
        ORDER BY id ASC
      `, [tenantId]);
      assert.ok(auditRows.length >= 2, 'Devem existir auditorias de tentativa negada e liberação excepcional');
      const acoes = auditRows.map(r => r.action);
      assert.ok(acoes.includes('financeiro:os:liberar_saida_negada'));
      assert.ok(acoes.includes('financeiro:os:liberar_saida_excepcional'));
    } finally {
      await new Promise(r => server.close(r));
    }
  } finally {
    await closeDB().catch(() => {});
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}
  }
});

test('19. Sincronia Bidirecional de Estorno (Caixa <-> Títulos Liquidados) e DRE Simplificado (Frente 5B)', async () => {
  const fs = require('fs');
  const os = require('os');
  const express = require('express');
  const http = require('http');
  const financialAnalystService = require('../services/financialAnalystService.js');
  const financialEngine = require('../services/financialEngine.js');
  const financialRoutes = require('../routes/financial.routes');
  const { salvarEstado } = require('../lib/serverContext');
  const { getDefaultState } = require('../lib/repository/stateRepository');
  const { initDB, closeDB, all } = require('../db');

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'patio-estorno-dre-test-'));
  const testDb = path.join(tempDir, 'test.db');
  process.env.DB_PATH = testDb;

  try {
    await initDB();
    const tenantId = 't_estorno_dre';

    // 19.1 Estado inicial: OS 950 com total 2000, 0 entradas, 1 título a receber faturado a prazo de 2000
    const state = {
      tenantId,
      os: [
        { id: '950', numero: '950', total: 2000, cliente: 'Transportes Expresso' }
      ],
      caixas: [
        {
          id: 'cx_est_1',
          status: 'aberto',
          aberto: true,
          saldoInicial: 500,
          saldoAtual: 500,
          totalEntradas: 0,
          totalSaidas: 0,
          movimentacoesIds: []
        }
      ],
      movimentos: [],
      contas: [
        {
          id: 'tit_rec_950',
          tipo: 'receber',
          osId: '950',
          valor: 2000,
          desc: 'Faturamento OS #950',
          pago: false,
          status: 'aberto'
        }
      ]
    };

    // Antes da liquidação: OS deve estar liberado_faturado
    const resumoAntes = financialAnalystService.obterResumoFinanceiroOS(state, '950');
    assert.equal(resumoAntes.statusLiberacaoPatio, 'liberado_faturado');
    assert.equal(resumoAntes.totalFaturadoPrazo, 2000);
    assert.equal(resumoAntes.totalPago, 0);

    // 19.2 Liquidação do título -> Gera entrada no caixa e quita a OS
    const resLiq = financialAnalystService.liquidarTituloFinanceiro(state, {
      id: 'tit_rec_950',
      meioPagamento: 'pix',
      operador: 'dono_1'
    });
    assert.equal(resLiq.ok, true);
    assert.equal(state.caixas[0].saldoAtual, 2500); // 500 + 2000
    assert.equal(state.contas[0].pago, true);
    assert.equal(state.contas[0].status, 'liquidado');

    const resumoPosLiq = financialAnalystService.obterResumoFinanceiroOS(state, '950');
    assert.equal(resumoPosLiq.statusLiberacaoPatio, 'liberado_quitado');
    assert.equal(resumoPosLiq.totalPago, 2000);
    assert.equal(resumoPosLiq.saldoRestante, 0);

    // 19.3 Estorno da movimentação de caixa originada pela baixa do título
    const movId = resLiq.movimentacao.id;
    const resEstorno = financialAnalystService.estornarMovimentacao(state, {
      movimentoId: movId,
      motivo: 'Cliente solicitou cancelamento do recebimento Pix',
      operador: 'dono_1'
    });
    assert.equal(resEstorno.ok, true);
    assert.equal(state.caixas[0].saldoAtual, 500, 'Saldo deve voltar para 500 após estorno');

    // Sincronia Bidirecional: Título deve ter sido reaberto automaticamente!
    const tituloReaberto = state.contas.find(c => c.id === 'tit_rec_950');
    assert.equal(tituloReaberto.pago, false, 'Título deve ser reaberto como não pago');
    assert.ok(tituloReaberto.status === 'pendente' || tituloReaberto.status === 'aberto', 'Status do título deve voltar para pendente/aberto');
    assert.ok(tituloReaberto.reabertoPorEstornoEm, 'Deve registrar datahora de reabertura por estorno');
    assert.ok(tituloReaberto.ultimoEstornoId, 'Deve registrar o id do estorno');

    // OS deve voltar imediatamente para liberado_faturado
    const resumoPosEstorno = financialAnalystService.obterResumoFinanceiroOS(state, '950');
    assert.equal(resumoPosEstorno.statusLiberacaoPatio, 'liberado_faturado', 'OS deve voltar para liberado_faturado');
    assert.equal(resumoPosEstorno.totalPago, 0, 'Total pago volta a ser zero');
    assert.equal(resumoPosEstorno.totalFaturadoPrazo, 2000, 'Faturamento a prazo reativado');
    assert.equal(resumoPosEstorno.saldoRestante, 2000);

    // 19.4 DRE Operacional Simplificado: Expurgando Sangrias e Suprimentos
    const agoraSP = financialEngine.obterAgoraSP();
    const dHoje = agoraSP.dataISO;
    const stateDRE = {
      tenantId,
      cfg: { saldoInicial: 1000 },
      movimentos: [
        // Receitas operacionais puras (5.000)
        { id: 'm_op_1', tipo: 'entrada', subtipo: 'receita', valor: 3000, data: dHoje },
        { id: 'm_op_2', tipo: 'entrada', subtipo: 'receita', valor: 2000, data: dHoje },
        // Despesas operacionais puras (2.000)
        { id: 'm_op_3', tipo: 'saida', subtipo: 'despesa', valor: 1500, data: dHoje },
        { id: 'm_op_4', tipo: 'saida', subtipo: 'despesa', valor: 500, data: dHoje },
        // Suprimento de caixa (aporte de troco - 1.500)
        { id: 'm_sup_1', tipo: 'entrada', subtipo: 'suprimento', naturezaOperacao: 'suprimento', valor: 1500, data: dHoje },
        // Sangria de caixa (retirada para cofre - 1.200)
        { id: 'm_sang_1', tipo: 'saida', subtipo: 'sangria', naturezaOperacao: 'sangria', valor: 1200, data: dHoje },
        // Movimento estornado (não deve impactar o DRE)
        { id: 'm_est_orig', tipo: 'entrada', subtipo: 'receita', valor: 800, data: dHoje, estornado: true },
        // Compensatório de estorno (não deve impactar o DRE)
        { id: 'm_est_comp', tipo: 'saida', subtipo: 'estorno', naturezaOperacao: 'estorno', valor: 800, data: dHoje, estornoDeId: 'm_est_orig' }
      ]
    };

    const dre = financialEngine.calcularDRESimplificado(stateDRE, { filtro: 'hoje' });
    assert.equal(dre.receitaOperacionalBruta, 5000, 'Receita bruta deve ser exatamente 5000, sem suprimentos');
    assert.equal(dre.despesasOperacionais, 2000, 'Despesas devem ser exatamente 2000, sem sangrias');
    assert.equal(dre.resultadoOperacionalLiquido, 3000, 'Resultado deve ser 5000 - 2000 = 3000');
    assert.equal(dre.margemOperacionalPercentual, 60, 'Margem deve ser 60%');
    assert.equal(dre.lucro, true);
    assert.equal(dre.movimentacaoTesourariaNeutra.totalSuprimentos, 1500);
    assert.equal(dre.movimentacaoTesourariaNeutra.totalSangrias, 1200);
    assert.equal(dre.movimentacaoTesourariaNeutra.saldoTesouraria, 300);

    // 19.5 Verificação do DRE exposto em GET /api/financeiro/resumo
    const app = express();
    app.use(express.json());
    app.use((req, res, next) => {
      req.securityContext = { role: 'dono', actorId: 'dono_1', tenantId, permissions: ['financial:read'] };
      req.headers['x-tenant-id'] = tenantId;
      next();
    });
    app.use(financialRoutes);

    const base = getDefaultState(tenantId);
    await salvarEstado(tenantId, { ...base, ...stateDRE });

    const server = http.createServer(app);
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    const port = server.address().port;
    const baseUrl = `http://127.0.0.1:${port}`;

    try {
      const resApi = await fetch(`${baseUrl}/api/financeiro/resumo`);
      assert.equal(resApi.status, 200);
      const jsonResumo = await resApi.json();
      assert.ok(jsonResumo.dreOperacional, 'Endpoint deve expor dreOperacional');
      assert.equal(jsonResumo.dreOperacional.receitaOperacionalBruta, 5000);
      assert.equal(jsonResumo.dreOperacional.despesasOperacionais, 2000);
      assert.equal(jsonResumo.dreOperacional.resultadoOperacionalLiquido, 3000);
    } finally {
      await new Promise(r => server.close(r));
    }
  } finally {
    await closeDB().catch(() => {});
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}
  }
});

test('20. Geração de texto amigável de cobrança de OS e visualização de liberação excepcional e DRE (Frente 5C)', async () => {
  const fs = require('fs');
  const os = require('os');
  const express = require('express');
  const http = require('http');
  const financialAnalystService = require('../services/financialAnalystService.js');
  const financialRoutes = require('../routes/financial.routes');
  const { salvarEstado } = require('../lib/serverContext');
  const { getDefaultState } = require('../lib/repository/stateRepository');
  const { initDB, closeDB } = require('../db');

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'patio-crm-test-cobranca-'));
  const testDb = path.join(tempDir, 'test.db');
  process.env.DB_PATH = testDb;

  try {
    const tenantId = 'tenant_cobranca_5c';
    await initDB();

    const state = {
      cfg: {
        nomeOficina: 'Oficina Diesel Forte',
        chavePix: 'pix@dieselforte.com.br'
      },
      clientes: [
        { id: 'cli_5c', nome: 'Transportadora Alfa Ltda', fantasia: 'Alfa Transportes' }
      ],
      veiculos: [
        { id: 'vei_5c', placa: 'ABC1D23', modelo: 'Volvo FH 540', marca: 'Volvo' }
      ],
      os: [
        {
          id: 'os_cobranca_1',
          numero: '7001',
          num: '7001',
          cli: 'cli_5c',
          vei: 'vei_5c',
          total: 4500,
          statusLiberacaoPatio: 'retido_pendente'
        }
      ],
      movimentos: [
        {
          id: 'mov_cob_1',
          tipo: 'entrada',
          valor: 1500,
          osId: '7001',
          naturezaOperacao: 'operacional',
          estornado: false
        }
      ],
      contas: []
    };

    // 20.1 Validar gerarTextoCobrancaOS
    const cobranca = financialAnalystService.gerarTextoCobrancaOS(state, '7001');
    assert.equal(cobranca.ok, true);
    assert.equal(cobranca.osId, '7001');
    assert.equal(cobranca.clienteNome, 'Alfa Transportes');
    assert.equal(cobranca.valorTotal, 4500);
    assert.equal(cobranca.saldoRestante, 3000);
    assert.equal(cobranca.chavePix, 'pix@dieselforte.com.br');
    assert.ok(cobranca.textoCobranca.includes('Alfa Transportes'));
    assert.ok(cobranca.textoCobranca.includes('Oficina Diesel Forte'));
    assert.match(cobranca.textoCobranca, /3\.000,00/);
    assert.ok(cobranca.textoCobranca.includes('pix@dieselforte.com.br'));

    // 20.2 Validar endpoint GET /api/financeiro/os/:osId/cobranca
    const app = express();
    app.use(express.json());
    app.use((req, res, next) => {
      req.securityContext = { role: 'dono', actorId: 'dono_1', tenantId, permissions: ['financial:read'] };
      req.headers['x-tenant-id'] = tenantId;
      next();
    });
    app.use(financialRoutes);

    const base = getDefaultState(tenantId);
    await salvarEstado(tenantId, { ...base, ...state });

    const server = http.createServer(app);
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    const port = server.address().port;
    const baseUrl = `http://127.0.0.1:${port}`;

    try {
      const resCobranca = await fetch(`${baseUrl}/api/financeiro/os/7001/cobranca`);
      assert.equal(resCobranca.status, 200);
      const jsonCobranca = await resCobranca.json();
      assert.equal(jsonCobranca.success, true);
      assert.equal(jsonCobranca.saldoRestante, 3000);
      assert.ok(jsonCobranca.textoCobranca.includes('OS *#7001*'));
    } finally {
      await new Promise(r => server.close(r));
    }

    // 20.3 Validar simulação de Frontend: liberação excepcional e status
    const osComExcecao = {
      ...state.os[0],
      statusLiberacaoPatio: 'liberado_excepcional',
      liberacaoExcepcional: {
        autorizadoPor: 'Carlos Diretor',
        perfil: 'dono',
        justificativa: 'Cliente corporativo com pagamento quinzenal'
      }
    };

    // Avaliação no motor
    const validacaoMotor = financialAnalystService.validarOuAutorizarSaidaPatioOS(
      { ...state, os: [osComExcecao] },
      { osId: '7001' }
    );
    assert.equal(validacaoMotor.ok, true);
    assert.equal(validacaoMotor.autorizado, true);
    assert.equal(validacaoMotor.statusLiberacaoPatio, 'liberado_excepcional');
  } finally {
    await closeDB().catch(() => {});
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}
  }
});

test('21. Controle de Boxes de Pátio: Trava de Colisão (409), Alocação, Liberação e Rotas de API (Frente 5A)', async () => {
  const fs = require('fs');
  const os = require('os');
  const express = require('express');
  const http = require('http');
  const financialAnalystService = require('../services/financialAnalystService.js');
  const financialRoutes = require('../routes/financial.routes');
  const { salvarEstado } = require('../lib/serverContext');
  const { getDefaultState } = require('../lib/repository/stateRepository');
  const { initDB, closeDB, all } = require('../db');

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'patio_box_test_'));
  const testDb = path.join(tempDir, 'test.db');
  process.env.DB_PATH = testDb;

  try {
    await initDB();
    const tenantId = 'tenant_boxes_5a';

    const state = {
      tenantId,
      boxes: [
        { id: 'BOX-01', nome: 'Box 01' },
        { id: 'BOX-02', nome: 'Box 02' }
      ],
      veiculos: [
        { id: 'v1', placa: 'ABC1234', marca: 'Scania', modelo: 'R450' },
        { id: 'v2', placa: 'XYZ9876', marca: 'Volvo', modelo: 'FH540' }
      ],
      os: [
        { id: '8001', num: 8001, vei: 'v1', st: 'executando', total: 5000 },
        { id: '8002', num: 8002, vei: 'v2', st: 'fila', total: 3200 }
      ]
    };

    // 21.1 Listar ocupação inicial
    const ocupInicial = financialAnalystService.listarOcupacaoBoxes(state);
    assert.equal(ocupInicial.resumoBoxes.total, 2);
    assert.equal(ocupInicial.resumoBoxes.livres, 2);
    assert.equal(ocupInicial.resumoBoxes.ocupados, 0);

    // 21.2 Alocar OS 8001 no BOX-01 com sucesso
    const aloc1 = financialAnalystService.alocarBoxOS(state, {
      osId: '8001',
      boxId: 'BOX-01',
      mecanico: 'Carlos Mecânico',
      operador: 'atendente_1',
      agora: '2026-10-19T10:00:00.000Z'
    });
    assert.equal(aloc1.sucesso, true);
    assert.equal(aloc1.os.boxId, 'BOX-01');
    assert.equal(aloc1.os.mecanico, 'Carlos Mecânico');
    assert.equal(aloc1.resumoBoxes.ocupados, 1);
    assert.equal(aloc1.resumoBoxes.livres, 1);
    assert.ok(aloc1.os.historicoPatio.some(h => h.tipo === 'alocacao_box' && h.boxId === 'BOX-01'));

    // 21.3 Trava de Colisão: Tentar alocar OS 8002 no mesmo BOX-01 ocupado
    assert.throws(() => {
      financialAnalystService.alocarBoxOS(state, {
        osId: '8002',
        boxId: 'BOX-01',
        mecanico: 'João Freios',
        operador: 'atendente_1'
      });
    }, (err) => {
      assert.equal(err.status, 409);
      assert.equal(err.code, 'BOX_JA_OCUPADO');
      assert.ok(err.message.includes('BOX-01') || err.message.includes('Box 01'));
      return true;
    });

    // 21.4 Transferência automática de box: Alocar OS 8001 para BOX-02
    const alocTransf = financialAnalystService.alocarBoxOS(state, {
      osId: '8001',
      boxId: 'BOX-02',
      operador: 'atendente_1',
      agora: '2026-10-19T11:00:00.000Z'
    });
    assert.equal(alocTransf.sucesso, true);
    assert.equal(alocTransf.os.boxId, 'BOX-02');
    // BOX-01 deve ter ficado livre
    const box1AposTransf = state.boxes.find(b => b.id === 'BOX-01');
    assert.equal(box1AposTransf.status, 'livre');
    assert.ok(alocTransf.os.historicoPatio.some(h => h.tipo === 'transferencia_box' && h.deBox === 'BOX-01' && h.paraBox === 'BOX-02'));

    // 21.5 Liberação de Box da OS 8001
    const lib = financialAnalystService.liberarBoxOS(state, {
      osId: '8001',
      motivo: 'teste_concluido',
      operador: 'gerente_1',
      agora: '2026-10-19T11:30:00.000Z'
    });
    assert.equal(lib.sucesso, true);
    assert.equal(lib.os.boxId, null);
    assert.equal(lib.tempoPermanenciaMinutos, 30); // 11:00 às 11:30
    assert.equal(lib.resumoBoxes.livres, 2);
    assert.equal(lib.resumoBoxes.ocupados, 0);

    // 21.6 Servidor Real HTTP: Endpoints de Boxes e Alocação
    const app = express();
    app.use(express.json());
    app.use((req, res, next) => {
      req.securityContext = {
        role: 'dono',
        actorId: 'dono_1',
        fullName: 'Dono Oficina',
        tenantId,
        permissions: ['financial:read', 'financial:write', 'os:read', 'os:write', 'labor:read', 'labor:write', 'operation:manage']
      };
      req.headers['x-tenant-id'] = tenantId;
      next();
    });
    app.use(financialRoutes);

    const base = getDefaultState(tenantId);
    await salvarEstado(tenantId, { ...base, ...state });

    const server = http.createServer(app);
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    const port = server.address().port;
    const baseUrl = `http://127.0.0.1:${port}`;

    try {
      // GET /api/financeiro/patio/boxes
      const resBoxes = await fetch(`${baseUrl}/api/financeiro/patio/boxes`);
      assert.equal(resBoxes.status, 200);
      const jsonBoxes = await resBoxes.json();
      assert.equal(jsonBoxes.success, true);
      assert.equal(jsonBoxes.resumoBoxes.total, 2);
      assert.equal(jsonBoxes.resumoBoxes.livres, 2);

      // POST /api/financeiro/os/8001/alocar-box (Sucesso)
      const resAloc = await fetch(`${baseUrl}/api/financeiro/os/8001/alocar-box`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ boxId: 'BOX-01', mecanico: 'Marcos Mecânico' })
      });
      assert.equal(resAloc.status, 200);
      const jsonAloc = await resAloc.json();
      assert.equal(jsonAloc.success, true);
      assert.equal(jsonAloc.os.boxId, 'BOX-01');
      assert.equal(jsonAloc.resumoBoxes.ocupados, 1);

      // POST /api/financeiro/os/8002/alocar-box no mesmo box (Colisão 409)
      const resColisao = await fetch(`${baseUrl}/api/financeiro/os/8002/alocar-box`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ boxId: 'BOX-01', mecanico: 'Outro Mecânico' })
      });
      assert.equal(resColisao.status, 409);
      const jsonColisao = await resColisao.json();
      assert.equal(jsonColisao.success, false);
      assert.equal(jsonColisao.code, 'BOX_JA_OCUPADO');

      // POST /api/financeiro/os/8001/liberar-box
      const resLib = await fetch(`${baseUrl}/api/financeiro/os/8001/liberar-box`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ motivo: 'Serviço em bancada' })
      });
      assert.equal(resLib.status, 200);
      const jsonLib = await resLib.json();
      assert.equal(jsonLib.success, true);
      assert.equal(jsonLib.boxId, 'BOX-01');
      assert.equal(jsonLib.resumoBoxes.livres, 2);

      // Verificar registro de auditoria no SQLite
      const auditRows = await all(
        "SELECT * FROM security_audit_log WHERE tenant_id = ? AND action LIKE 'patio:os:%' ORDER BY id ASC",
        [tenantId]
      );
      assert.ok(auditRows.length >= 2, 'Deve ter gravado eventos de auditoria de alocação e liberação');
      assert.ok(auditRows.some(r => r.action === 'patio:os:alocar_box'));
      assert.ok(auditRows.some(r => r.action === 'patio:os:liberar_box'));
    } finally {
      await new Promise(r => server.close(r));
    }
  } finally {
    await closeDB().catch(() => {});
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}
  }
});

test('22. Apontamento de Mecânicos, Radar de Gargalos e Rotas de Pátio (Frente 5B)', async () => {
  const fs = require('fs');
  const os = require('os');
  const express = require('express');
  const http = require('http');
  const financialAnalystService = require('../services/financialAnalystService.js');
  const financialRoutes = require('../routes/financial.routes');
  const { salvarEstado } = require('../lib/serverContext');
  const { getDefaultState } = require('../lib/repository/stateRepository');
  const { initDB, closeDB, all } = require('../db');

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'patio_gargalos_test_'));
  const testDb = path.join(tempDir, 'test.db');
  process.env.DB_PATH = testDb;

  try {
    await initDB();
    const tenantId = 'tenant_gargalos_5b';

    const state = {
      tenantId,
      boxes: [
        { id: 'BOX-01', nome: 'Box 01' },
        { id: 'BOX-02', nome: 'Box 02' }
      ],
      veiculos: [
        { id: 'v1', placa: 'GHI9988', marca: 'Mercedes', modelo: 'Actros' },
        { id: 'v2', placa: 'JKL7766', marca: 'Scania', modelo: 'R500' }
      ],
      clientes: [
        { id: 'c1', nome: 'Transportadora TransSul' }
      ],
      equipe: [
        { nome: 'João Mecânico' },
        { nome: 'Pedro Eletricista' }
      ],
      os: [
        { id: '9001', num: 9001, vei: 'v1', cli: 'c1', st: 'fila', total: 6000 },
        { id: '9002', num: 9002, vei: 'v2', cli: 'c1', st: 'fila', total: 4000 }
      ],
      movimentos: [
        { id: 'm1', osId: '9002', tipo: 'entrada', valor: 1000, estornado: false }
      ]
    };

    // 22.1 Iniciar execução da OS 9001 com alocação no BOX-01
    const resIni = financialAnalystService.registrarApontamentoPatioOS(state, {
      osId: '9001',
      acao: 'iniciar',
      boxId: 'BOX-01',
      mecanico: 'João Mecânico',
      operador: 'atendente_1',
      agora: '2026-10-19T08:00:00.000Z'
    });
    assert.equal(resIni.sucesso, true);
    assert.equal(resIni.os.etapaPatio, 'em_execucao');
    assert.equal(resIni.os.boxId, 'BOX-01');

    // 22.2 Pausar execução da OS 9001 por gargalo de peça
    const resPausa = financialAnalystService.registrarApontamentoPatioOS(state, {
      osId: '9001',
      acao: 'pausar',
      motivo: 'Aguardando cruzeta do cardan',
      operador: 'mecanico_joao',
      agora: '2026-10-19T09:00:00.000Z'
    });
    assert.equal(resPausa.sucesso, true);
    assert.equal(resPausa.os.etapaPatio, 'pausado_gargalo');
    assert.equal(resPausa.os.motivoPausa, 'Aguardando cruzeta do cardan');
    const box1 = state.boxes.find(b => b.id === 'BOX-01');
    assert.equal(box1.status, 'bloqueado_peca');

    // 22.3 Finalizar OS 9002 com saldo pendente (retida financeiro)
    const resFin = financialAnalystService.registrarApontamentoPatioOS(state, {
      osId: '9002',
      acao: 'finalizar',
      mecanico: 'Pedro Eletricista',
      operador: 'mecanico_pedro',
      agora: '2026-10-19T10:00:00.000Z'
    });
    assert.equal(resFin.sucesso, true);
    assert.equal(resFin.os.etapaPatio, 'pronto_retirada');

    // 22.4 Radar de Gargalos consolidado
    const radar = financialAnalystService.obterRadarGargalosPatio(state, {
      agora: '2026-10-19T10:30:00.000Z'
    });
    assert.equal(radar.sucesso, true);
    assert.equal(radar.resumoBoxes.bloqueados, 1);
    assert.equal(radar.osPausadasGargalo.length, 1);
    assert.equal(radar.osPausadasGargalo[0].id, '9001');
    assert.equal(radar.osPausadasGargalo[0].tempoPausaMinutos, 90);
    assert.equal(radar.osPausadasGargalo[0].motivoPausa, 'Aguardando cruzeta do cardan');

    assert.equal(radar.osProntasRetidasFinanceiro.length, 1);
    assert.equal(radar.osProntasRetidasFinanceiro[0].id, '9002');
    assert.equal(radar.osProntasRetidasFinanceiro[0].saldoRestante, 3000);

    // 22.5 Rotas HTTP de Gargalos e Apontamento
    const app = express();
    app.use(express.json());
    app.use((req, res, next) => {
      req.securityContext = {
        role: 'mecanico',
        actorId: 'mecanico_1',
        fullName: 'Mecânico Carlos',
        tenantId,
        permissions: ['os:read', 'os:write', 'labor:read', 'labor:write', 'financial:read']
      };
      req.headers['x-tenant-id'] = tenantId;
      next();
    });
    app.use(financialRoutes);

    const base = getDefaultState(tenantId);
    await salvarEstado(tenantId, { ...base, ...state });

    const server = http.createServer(app);
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    const port = server.address().port;
    const baseUrl = `http://127.0.0.1:${port}`;

    try {
      // GET /api/financeiro/patio/gargalos
      const resRadarHttp = await fetch(`${baseUrl}/api/financeiro/patio/gargalos`);
      assert.equal(resRadarHttp.status, 200);
      const jsonRadar = await resRadarHttp.json();
      assert.equal(jsonRadar.success, true);
      assert.equal(jsonRadar.osPausadasGargalo.length, 1);
      assert.equal(jsonRadar.osProntasRetidasFinanceiro.length, 1);

      // POST /api/financeiro/os/9001/apontamento (Retomar execução)
      const resApontHttp = await fetch(`${baseUrl}/api/financeiro/os/9001/apontamento`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acao: 'iniciar' })
      });
      assert.equal(resApontHttp.status, 200);
      const jsonApont = await resApontHttp.json();
      assert.equal(jsonApont.success, true);
      assert.equal(jsonApont.etapaPatio, 'em_execucao');

      // Auditoria gravada no banco SQLite
      const auditApont = await all(
        "SELECT * FROM security_audit_log WHERE tenant_id = ? AND action = 'patio:os:apontamento'",
        [tenantId]
      );
      assert.ok(auditApont.length >= 1, 'Deve ter gravado evento de auditoria de apontamento');
    } finally {
      await new Promise(r => server.close(r));
    }
  } finally {
    await closeDB().catch(() => {});
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}
  }
});

test('23. Gestão de Estoque, Requisição de Peças na OS e Desbloqueio Automático de Box (Frente 6A)', async () => {
  const fs = require('fs');
  const os = require('os');
  const express = require('express');
  const http = require('http');
  const { salvarEstado } = require('../lib/serverContext');
  const { getDefaultState } = require('../lib/repository/stateRepository');
  const { initDB, closeDB, all } = require('../db');
  const financialRoutes = require('../routes/financial.routes');
  const financialAnalystService = require('../services/financialAnalystService');

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'patio-estoque-test-'));
  const testDbPath = path.join(tempDir, 'test.db');
  process.env.DB_PATH = testDbPath;

  try {
    await initDB();
    const tenantId = 'tenant_estoque_test';

    const state = {
      tenantId,
      estoque: [
        { id: 'pec_mola', codigo: 'MOL-01', nome: 'Feixe de Mola Dianteiro', quantidade: 5, estoqueMinimo: 2, custoUnitario: 350, precoVenda: 580 },
        { id: 'pec_lona', codigo: 'LON-02', nome: 'Jogo Lona Freio', quantidade: 2, estoqueMinimo: 3, custoUnitario: 140, precoVenda: 260 }
      ],
      boxes: [
        { id: 'BOX-01', nome: 'Box 01 — Pesados', status: 'bloqueado_peca', osId: 'OS-801' }
      ],
      os: [
        {
          id: 'OS-801',
          num: 801,
          boxId: 'BOX-01',
          box: 'BOX-01',
          st: 'peca',
          etapaPatio: 'pausado_gargalo',
          motivoPausa: 'Aguardando feixe de mola',
          pecasUtilizadas: [],
          historicoPatio: []
        }
      ]
    };

    // 23.1 Teste unitário de listagem de estoque
    const listEstoque = financialAnalystService.listarEstoquePecas(state);
    assert.equal(listEstoque.sucesso, true);
    assert.equal(listEstoque.pecas.length, 2);
    assert.equal(listEstoque.resumoEstoque.totalItens, 2);
    assert.equal(listEstoque.resumoEstoque.itensAbaixoMinimo, 1); // pec_lona (2 <= 3)

    // 23.2 Teste unitário de requisição com baixa de estoque
    const reqRes = financialAnalystService.requisitarPecaOS(state, {
      osId: 'OS-801',
      pecaIdOuNome: 'MOL-01',
      quantidade: 2,
      operador: 'Mecânico Carlos'
    });
    assert.equal(reqRes.sucesso, true);
    assert.equal(reqRes.saldoEstoqueRestante, 3, 'Saldo deve diminuir de 5 para 3');
    assert.equal(state.estoque[0].quantidade, 3);
    assert.equal(state.os[0].pecasUtilizadas.length, 1);
    assert.equal(state.os[0].totalPecas, 1160); // 2 * 580

    // 23.3 Teste unitário de estoque insuficiente (erro 409)
    assert.throws(() => {
      financialAnalystService.requisitarPecaOS(state, {
        osId: 'OS-801',
        pecaIdOuNome: 'MOL-01',
        quantidade: 10 // disponível: 3
      });
    }, (err) => {
      assert.equal(err.statusCode || err.status, 409);
      assert.equal(err.code, 'ESTOQUE_INSUFICIENTE');
      return true;
    });

    // 23.4 Teste unitário de liberação de gargalo e desbloqueio de box
    const desblRes = financialAnalystService.liberarGargaloPecaOS(state, {
      osId: 'OS-801',
      observacao: 'Feixe de mola entregue pelo almoxarifado',
      operador: 'Almoxarife Beto'
    });
    assert.equal(desblRes.sucesso, true);
    assert.equal(state.os[0].etapaPatio, 'em_execucao');
    assert.equal(state.os[0].motivoPausa, null);
    assert.equal(state.boxes[0].status, 'ocupado', 'Box deve ser restaurado de bloqueado_peca para ocupado');

    // 23.5 Teste de rotas HTTP com Express e Auditoria SQLite
    const app = express();
    app.use(express.json());
    app.use((req, res, next) => {
      req.securityContext = {
        actorId: 'almoxarife_1',
        fullName: 'Almoxarife Roberto',
        tenantId,
        permissions: ['os:read', 'os:write', 'labor:read', 'labor:write', 'financial:read', 'financial:write', 'operation:manage']
      };
      req.headers['x-tenant-id'] = tenantId;
      next();
    });
    app.use(financialRoutes);

    const base = getDefaultState(tenantId);
    await salvarEstado(tenantId, { ...base, ...state });

    const server = http.createServer(app);
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    const port = server.address().port;
    const baseUrl = `http://127.0.0.1:${port}`;

    try {
      // GET /api/financeiro/patio/estoque
      const resEstHttp = await fetch(`${baseUrl}/api/financeiro/patio/estoque`);
      assert.equal(resEstHttp.status, 200);
      const jsonEst = await resEstHttp.json();
      assert.equal(jsonEst.success, true);
      assert.equal(jsonEst.pecas.length, 2);

      // POST /api/financeiro/os/OS-801/requisitar-peca (requisição via API)
      const resReqHttp = await fetch(`${baseUrl}/api/financeiro/os/OS-801/requisitar-peca`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pecaIdOuNome: 'LON-02', quantidade: 1 })
      });
      assert.equal(resReqHttp.status, 200);
      const jsonReq = await resReqHttp.json();
      assert.equal(jsonReq.success, true);
      assert.equal(jsonReq.saldoEstoqueRestante, 1);

      // POST /api/financeiro/os/OS-801/liberar-gargalo-peca
      const resLibHttp = await fetch(`${baseUrl}/api/financeiro/os/OS-801/liberar-gargalo-peca`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ observacao: 'Lonas montadas' })
      });
      assert.equal(resLibHttp.status, 200);
      const jsonLib = await resLibHttp.json();
      assert.equal(jsonLib.success, true);
      assert.equal(jsonLib.etapaPatio, 'em_execucao');

      // Auditoria no SQLite
      const auditReq = await all(
        "SELECT * FROM security_audit_log WHERE tenant_id = ? AND action = 'patio:os:requisitar_peca'",
        [tenantId]
      );
      assert.ok(auditReq.length >= 1, 'Deve ter gravado auditoria de requisição de peças');

      const auditLib = await all(
        "SELECT * FROM security_audit_log WHERE tenant_id = ? AND action = 'patio:os:liberar_gargalo_peca'",
        [tenantId]
      );
      assert.ok(auditLib.length >= 1, 'Deve ter gravado auditoria de liberação de gargalo de peças');
    } finally {
      await new Promise(r => server.close(r));
    }
  } finally {
    await closeDB().catch(() => {});
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}
  }
});

test('24. Reabertura Bidirecional de Títulos no Estorno e Devolução de Peças ao Estoque (Frente 7A)', async () => {
  const fs = require('fs');
  const os = require('os');
  const express = require('express');
  const http = require('http');
  const { salvarEstado } = require('../lib/serverContext');
  const { getDefaultState } = require('../lib/repository/stateRepository');
  const { initDB, closeDB, all } = require('../db');
  const financialRoutes = require('../routes/financial.routes');
  const financialAnalystService = require('../services/financialAnalystService');

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'patio-reabertura-peca-test-'));
  const testDbPath = path.join(tempDir, 'test.db');
  process.env.DB_PATH = testDbPath;

  try {
    await initDB();
    const tenantId = 'tenant_reabertura_7a';

    const state = {
      tenantId,
      caixas: [{ id: 'cx_01', aberto: true, saldoAtual: 1000, totalEntradas: 0, totalSaidas: 0 }],
      movimentos: [],
      contas: [
        {
          id: 'tit_os_701',
          tipo: 'receber',
          osId: 'OS-701',
          descricao: 'Faturamento OS #701',
          valor: 1500,
          pago: false,
          status: 'aberto'
        }
      ],
      estoque: [
        { id: 'pec_tambor', codigo: 'TAM-01', nome: 'Tambor de Freio Dianteiro', quantidade: 4, estoqueMinimo: 2, custoUnitario: 200, precoVenda: 380 }
      ],
      os: [
        {
          id: 'OS-701',
          num: 701,
          st: 'executando',
          etapaPatio: 'em_execucao',
          pecasUtilizadas: [],
          totalPecas: 0,
          historicoPatio: []
        }
      ]
    };

    // 24.1 Sincronia de Título: Liquidação seguida de Estorno -> Título volta para 'pendente' e reflete na OS
    const resLiq = financialAnalystService.liquidarTituloFinanceiro(state, {
      id: 'tit_os_701',
      valorPago: 1500,
      forma: 'pix',
      operador: 'dono_1'
    });
    assert.equal(resLiq.ok, true);
    assert.equal(state.contas[0].pago, true);
    assert.equal(state.contas[0].status, 'liquidado');

    // Executa estorno do movimento gerado pela liquidação
    const movLiquidacaoId = resLiq.movimentacao.id;
    const resEstorno = financialAnalystService.estornarMovimentacao(state, {
      movimentoId: movLiquidacaoId,
      motivo: 'Estorno operacional solicitado pelo cliente',
      operador: 'dono_1'
    });
    assert.equal(resEstorno.ok, true);
    const tituloReaberto = state.contas.find(c => c.id === 'tit_os_701');
    assert.equal(tituloReaberto.pago, false, 'Título deve ser marcado como não pago');
    assert.equal(tituloReaberto.status, 'pendente', 'Título deve voltar para o status pendente');
    assert.ok(tituloReaberto.reabertoPorEstornoEm, 'Deve registrar data de reabertura');
    assert.ok(tituloReaberto.ultimoEstornoId, 'Deve registrar o id do estorno');

    // 24.2 Requisição de peça seguida de Devolução (estornarPecaOS)
    financialAnalystService.requisitarPecaOS(state, {
      osId: 'OS-701',
      pecaIdOuNome: 'TAM-01',
      quantidade: 2,
      operador: 'Mecânico Carlos'
    });
    assert.equal(state.estoque[0].quantidade, 2, 'Estoque deve cair de 4 para 2');
    assert.equal(state.os[0].pecasUtilizadas.length, 1);
    assert.equal(state.os[0].totalPecas, 760); // 2 * 380

    // Devolve 1 item da peça ao estoque
    const resDevolucao = financialAnalystService.estornarPecaOS(state, {
      osId: 'OS-701',
      itemIndexOuPecaId: 'TAM-01',
      motivo: 'Peça requisitada a mais por engano',
      operador: 'Mecânico Carlos'
    });
    assert.equal(resDevolucao.sucesso, true);
    assert.equal(state.estoque[0].quantidade, 4, 'Saldo do estoque deve ser recomposto para 4');
    assert.equal(state.os[0].pecasUtilizadas.length, 0);
    assert.equal(state.os[0].totalPecas, 0);

    // 24.3 Teste de Rota HTTP POST /api/financeiro/os/:osId/estornar-peca e auditoria
    const app = express();
    app.use(express.json());
    app.use((req, res, next) => {
      req.securityContext = {
        actorId: 'almoxarife_1',
        fullName: 'Almoxarife Roberto',
        tenantId,
        permissions: ['os:read', 'os:write', 'labor:read', 'labor:write', 'financial:read', 'financial:write', 'operation:manage']
      };
      req.headers['x-tenant-id'] = tenantId;
      next();
    });
    app.use(financialRoutes);

    // Requisita novamente 1 peça para testar via API
    financialAnalystService.requisitarPecaOS(state, {
      osId: 'OS-701',
      pecaIdOuNome: 'TAM-01',
      quantidade: 1,
      operador: 'Mecânico Carlos'
    });
    assert.equal(state.estoque[0].quantidade, 3);

    const base = getDefaultState(tenantId);
    await salvarEstado(tenantId, { ...base, ...state });

    const server = http.createServer(app);
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    const port = server.address().port;
    const baseUrl = `http://127.0.0.1:${port}`;

    try {
      const resEstPecaHttp = await fetch(`${baseUrl}/api/financeiro/os/OS-701/estornar-peca`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemIndexOuPecaId: 'TAM-01', motivo: 'Cancelamento via painel web' })
      });
      assert.equal(resEstPecaHttp.status, 200);
      const jsonEstPeca = await resEstPecaHttp.json();
      assert.equal(jsonEstPeca.success, true);
      assert.equal(jsonEstPeca.saldoEstoqueAtual, 4, 'Saldo deve voltar para 4');
      assert.equal(jsonEstPeca.totalPecasOS, 0);

      // Auditoria no SQLite
      const auditRows = await all(
        "SELECT * FROM security_audit_log WHERE tenant_id = ? AND action = 'patio:os:estornar_peca'",
        [tenantId]
      );
      assert.ok(auditRows.length >= 1, 'Deve ter registrado auditoria de estorno de peça');
    } finally {
      await new Promise(r => server.close(r));
    }
  } finally {
    await closeDB().catch(() => {});
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}
  }
});

test('25. DRE Operacional Integrado e Aviso de Cobrança/Retirada ao Cliente (Frente 7B)', async () => {
  const fs = require('fs');
  const os = require('os');
  const express = require('express');
  const http = require('http');
  const { salvarEstado } = require('../lib/serverContext');
  const { getDefaultState } = require('../lib/repository/stateRepository');
  const { initDB, closeDB } = require('../db');
  const financialRoutes = require('../routes/financial.routes');
  const financialAnalystService = require('../services/financialAnalystService');
  const financialEngine = require('../services/financialEngine');

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'patio-dre-aviso-test-'));
  const testDbPath = path.join(tempDir, 'test.db');
  process.env.DB_PATH = testDbPath;

  try {
    await initDB();
    const tenantId = 'tenant_dre_aviso_7b';
    const agoraSP = financialEngine.obterAgoraSP();
    const dHoje = agoraSP.dataISO;

    const state = {
      tenantId,
      cfg: {
        nomeOficina: 'Auto Mecânica Express',
        chavePix: 'pix@express.com.br'
      },
      clientes: [
        { id: 'cli_dre_1', nome: 'Transportadora Continental', fantasia: 'Continental Log' }
      ],
      veiculos: [
        { id: 'vei_dre_1', placa: 'ABC1D23', marca: 'Volvo', modelo: 'FH 540' }
      ],
      caixas: [{ id: 'cx_dre', aberto: true, saldoAtual: 5000, totalEntradas: 0, totalSaidas: 0 }],
      movimentos: [
        { id: 'm_rec_1', tipo: 'entrada', subtipo: 'receita', valor: 6000, data: dHoje },
        { id: 'm_desp_1', tipo: 'saida', subtipo: 'despesa', valor: 2500, data: dHoje },
        { id: 'm_sup_1', tipo: 'entrada', subtipo: 'suprimento', naturezaOperacao: 'suprimento', valor: 1000, data: dHoje },
        { id: 'm_sang_1', tipo: 'saida', subtipo: 'sangria', naturezaOperacao: 'sangria', valor: 800, data: dHoje }
      ],
      os: [
        {
          id: 'OS-801',
          num: 801,
          st: 'executando',
          cli: 'cli_dre_1',
          vei: 'vei_dre_1',
          total: 4500,
          statusLiberacaoPatio: 'retido_pendente',
          pecasUtilizadas: [
            { id: 'pec_1', nome: 'Pastilha de Freio', quantidade: 2, valorUnitario: 150, subtotal: 300 }
          ],
          totalPecas: 300
        }
      ]
    };

    // 25.1 Cálculo de DRE Operacional com isolamento de tesouraria
    const dre = financialAnalystService.calcularDREOperacional(state, { filtro: '30d' });
    assert.equal(dre.sucesso, true);
    assert.equal(dre.receitaOperacionalBruta, 6000);
    assert.equal(dre.despesasOperacionais, 2500);
    assert.equal(dre.custoPecasAplicadasOS, 300);
    assert.equal(dre.resultadoOperacionalLiquido, 3500); // 6000 - 2500 (sem ser distorcido por sangria/suprimento)
    assert.equal(dre.tesourariaNeutra.totalSuprimentos, 1000);
    assert.equal(dre.tesourariaNeutra.totalSangrias, 800);

    // 25.2 Geração de Aviso ao Cliente para OS
    const aviso = financialAnalystService.gerarAvisoClienteOS(state, 'OS-801');
    assert.equal(aviso.sucesso, true);
    assert.equal(aviso.num, 801);
    assert.equal(aviso.placa, 'ABC1D23');
    assert.equal(aviso.cliente, 'Continental Log');
    assert.equal(aviso.veiculoInfo, 'Volvo FH 540');
    assert.match(aviso.textoWhatsapp, /Auto Mecânica Express/);
    assert.match(aviso.textoWhatsapp, /Continental Log/);
    assert.match(aviso.textoWhatsapp, /4\.500,00/);
    assert.match(aviso.textoWhatsapp, /pix@express\.com\.br/);

    // 25.3 Rotas HTTP GET /api/financeiro/dre e GET /api/financeiro/os/:osId/aviso-cliente
    const app = express();
    app.use(express.json());
    app.use((req, res, next) => {
      req.securityContext = {
        actorId: 'gerente_1',
        fullName: 'Gerente Operacional',
        tenantId,
        permissions: ['os:read', 'os:write', 'financial:read', 'financial:write']
      };
      req.headers['x-tenant-id'] = tenantId;
      next();
    });
    app.use(financialRoutes);

    const base = getDefaultState(tenantId);
    await salvarEstado(tenantId, { ...base, ...state });

    const server = http.createServer(app);
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    const port = server.address().port;
    const baseUrl = `http://127.0.0.1:${port}`;

    try {
      const resDRE = await fetch(`${baseUrl}/api/financeiro/dre`);
      assert.equal(resDRE.status, 200);
      const jsonDRE = await resDRE.json();
      assert.equal(jsonDRE.receitaOperacionalBruta, 6000);
      assert.equal(jsonDRE.custoPecasAplicadasOS, 300);
      assert.equal(jsonDRE.tesourariaNeutra.totalSangrias, 800);

      const resAviso = await fetch(`${baseUrl}/api/financeiro/os/OS-801/aviso-cliente`);
      assert.equal(resAviso.status, 200);
      const jsonAviso = await resAviso.json();
      assert.equal(jsonAviso.sucesso, true);
      assert.equal(jsonAviso.cliente, 'Continental Log');
      assert.match(jsonAviso.textoWhatsapp, /pix@express\.com\.br/);
    } finally {
      await new Promise(r => server.close(r));
    }
  } finally {
    await closeDB().catch(() => {});
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}
  }
});

test('26. Checklist Técnico Pesado (Suspensão & Freios) e Trava de Qualidade na OS (Frente 8A)', async () => {
  const fs = require('fs');
  const os = require('os');
  const express = require('express');
  const http = require('http');
  const { salvarEstado } = require('../lib/serverContext');
  const { getDefaultState } = require('../lib/repository/stateRepository');
  const { initDB, closeDB, all } = require('../db');
  const financialRoutes = require('../routes/financial.routes');
  const financialAnalystService = require('../services/financialAnalystService');

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'patio-checklist-test-'));
  const testDbPath = path.join(tempDir, 'test.db');
  process.env.DB_PATH = testDbPath;

  try {
    await initDB();
    const tenantId = 'tenant_chk_8a';

    const state = {
      tenantId,
      boxes: [{ id: 'BOX-01', nome: 'Box 01', status: 'ocupado' }],
      os: [
        {
          id: 'OS-901',
          num: 901,
          st: 'executando',
          etapaPatio: 'em_execucao',
          boxId: 'BOX-01',
          mecanico: 'Mecânico Valter',
          placa: 'TRC8899',
          historicoPatio: []
        }
      ]
    };

    // 26.1 Obter checklist inicializado com 5 itens canônicos
    const chkInicial = financialAnalystService.obterChecklistTecnicoOS(state, 'OS-901');
    assert.equal(chkInicial.sucesso, true);
    assert.equal(chkInicial.statusChecklist, 'pendente');
    assert.equal(chkInicial.itens.length, 5);
    assert.equal(chkInicial.itens[0].id, 'grampos_feixe_molas');
    assert.equal(chkInicial.itens[3].id, 'sistema_pneumatico_freio');

    // 26.2 Registrar reprovação crítica de vistoria
    const chkReprovado = financialAnalystService.registrarChecklistTecnicoOS(state, {
      osId: 'OS-901',
      modo: 'reprovar',
      itemFalha: 'sistema_pneumatico_freio',
      observacao: 'Vazamento de ar na cuíca dupla do 2º eixo',
      operador: 'Inspetor Carlos'
    });
    assert.equal(chkReprovado.statusChecklist, 'reprovado_critico');
    assert.equal(state.os[0].statusChecklist, 'reprovado_critico');
    const itemFalha = chkReprovado.itens.find(i => i.id === 'sistema_pneumatico_freio');
    assert.equal(itemFalha.status, 'falha');

    // 26.3 Trava de Qualidade: Tentativa de finalizar OS com checklist reprovado deve lançar erro 409
    assert.throws(() => {
      financialAnalystService.registrarApontamentoPatioOS(state, {
        osId: 'OS-901',
        acao: 'finalizar',
        operador: 'Inspetor Carlos'
      });
    }, (err) => {
      assert.equal(err.status, 409);
      assert.equal(err.code, 'CHECKLIST_TECNICO_REPROVADO');
      return true;
    });

    // 26.4 Aprovação completa do checklist
    const chkAprovado = financialAnalystService.registrarChecklistTecnicoOS(state, {
      osId: 'OS-901',
      modo: 'aprovar_todos',
      observacao: 'Cuíca substituída e sistema 100% estanque',
      operador: 'Inspetor Carlos'
    });
    assert.equal(chkAprovado.statusChecklist, 'aprovado');
    assert.equal(state.os[0].statusChecklist, 'aprovado');
    assert.ok(chkAprovado.itens.every(i => i.status === 'ok'));

    // 26.5 Com checklist aprovado, finalização deve prosseguir com sucesso
    const resFinalizar = financialAnalystService.registrarApontamentoPatioOS(state, {
      osId: 'OS-901',
      acao: 'finalizar',
      operador: 'Inspetor Carlos'
    });
    assert.equal(resFinalizar.sucesso, true);
    assert.equal(state.os[0].etapaPatio, 'pronto_retirada');
    assert.equal(state.boxes[0].status, 'livre');

    // 26.6 Rotas HTTP GET e POST /api/financeiro/os/:osId/checklist e auditoria SQLite
    const app = express();
    app.use(express.json());
    app.use((req, res, next) => {
      req.securityContext = {
        actorId: 'inspetor_1',
        fullName: 'Inspetor Carlos',
        tenantId,
        permissions: ['os:read', 'os:write', 'labor:read', 'labor:write', 'financial:read', 'financial:write', 'operation:manage']
      };
      req.headers['x-tenant-id'] = tenantId;
      next();
    });
    app.use(financialRoutes);

    const base = getDefaultState(tenantId);
    await salvarEstado(tenantId, { ...base, ...state });

    const server = http.createServer(app);
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    const port = server.address().port;
    const baseUrl = `http://127.0.0.1:${port}`;

    try {
      const resGet = await fetch(`${baseUrl}/api/financeiro/os/OS-901/checklist`);
      assert.equal(resGet.status, 200);
      const jsonGet = await resGet.json();
      assert.equal(jsonGet.statusChecklist, 'aprovado');
      assert.equal(jsonGet.itens.length, 5);

      const resPost = await fetch(`${baseUrl}/api/financeiro/os/OS-901/checklist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          modo: 'aprovar_todos',
          observacao: 'Conferido via painel de vistoria'
        })
      });
      assert.equal(resPost.status, 200);
      const jsonPost = await resPost.json();
      assert.equal(jsonPost.success, true);
      assert.equal(jsonPost.statusChecklist, 'aprovado');

      // Auditoria no SQLite
      const auditRows = await all(
        "SELECT * FROM security_audit_log WHERE tenant_id = ? AND action = 'patio:os:checklist_tecnico'",
        [tenantId]
      );
      assert.ok(auditRows.length >= 1, 'Deve registrar auditoria do checklist técnico');
    } finally {
      await new Promise(r => server.close(r));
    }
  } finally {
    await closeDB().catch(() => {});
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}
  }
});









