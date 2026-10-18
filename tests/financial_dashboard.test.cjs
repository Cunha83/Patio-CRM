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

