'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const rootDir = path.resolve(__dirname, '..');
const inventoryBatchService = require(path.join(rootDir, 'services', 'inventory', 'inventoryBatchService.js'));

test('P0: Almoxarifado Pesado - Rastreabilidade de Lotes, Fornecedores e Recall', async (t) => {
  function criarEstadoMock() {
    return {
      pecas: [
        {
          id: 'peca_lamina_mestra',
          tenantId: 'tenant_teste',
          nome: 'Lâmina Mestra Scania R450',
          descricao: 'Lâmina Mestra Scania R450',
          qtd: 0,
          preco: 350,
          custo: 180
        }
      ],
      os: [
        {
          id: 'os_201',
          num: '201',
          tenantId: 'tenant_teste',
          placa: 'BRA2E19',
          modelo: 'Scania R450',
          cliente: 'Transportadora Falcão',
          st: 'aprovada',
          pecas: []
        }
      ],
      inventoryBatches: [],
      inventoryMovements: []
    };
  }

  await t.test('1.1. Entrada de Lotes com Rastreabilidade de Fornecedor e Fabricante', () => {
    const state = criarEstadoMock();
    const lote1 = inventoryBatchService.registrarEntradaLote({
      tenantId: 'tenant_teste',
      state,
      partId: 'peca_lamina_mestra',
      loteCodigo: 'LOT-2026-A1',
      fornecedorId: 'forn_aco_norte',
      fabricante: 'Aço Forte Molas',
      quantidade: 10,
      custoUnitario: 175.50,
      dataEntrada: '2026-11-01T10:00:00.000Z',
      notaFiscal: 'NF-10492'
    });

    assert.equal(lote1.loteCodigo, 'LOT-2026-A1');
    assert.equal(lote1.quantidadeAtual, 10);
    assert.equal(lote1.fabricante, 'Aço Forte Molas');
    assert.equal(state.inventoryBatches.length, 1);
    assert.equal(state.pecas[0].qtd, 10, 'Saldo físico da peça deve ser incrementado');

    // Segunda entrada (lote mais recente)
    const lote2 = inventoryBatchService.registrarEntradaLote({
      tenantId: 'tenant_teste',
      state,
      partId: 'peca_lamina_mestra',
      loteCodigo: 'LOT-2026-A2',
      fornecedorId: 'forn_aco_sul',
      fabricante: 'Molas Brasil',
      quantidade: 5,
      custoUnitario: 180.00,
      dataEntrada: '2026-11-05T10:00:00.000Z',
      notaFiscal: 'NF-10550'
    });

    assert.equal(lote2.loteCodigo, 'LOT-2026-A2');
    assert.equal(state.inventoryBatches.length, 2);
    assert.equal(state.pecas[0].qtd, 15, 'Saldo físico deve somar 10 + 5 = 15');
  });

  await t.test('1.2. Alocação FIFO (PEPS) e Esgotamento Automático de Lote', () => {
    const state = criarEstadoMock();
    inventoryBatchService.registrarEntradaLote({
      tenantId: 'tenant_teste',
      state,
      partId: 'peca_lamina_mestra',
      loteCodigo: 'LOT-2026-A1',
      fornecedorId: 'forn_1',
      fabricante: 'Aço Forte',
      quantidade: 8,
      custoUnitario: 170,
      dataEntrada: '2026-11-01T08:00:00.000Z'
    });
    inventoryBatchService.registrarEntradaLote({
      tenantId: 'tenant_teste',
      state,
      partId: 'peca_lamina_mestra',
      loteCodigo: 'LOT-2026-A2',
      fornecedorId: 'forn_2',
      fabricante: 'Molas Brasil',
      quantidade: 6,
      custoUnitario: 180,
      dataEntrada: '2026-11-04T08:00:00.000Z'
    });

    // Consumo de 10 unidades via FIFO: consome 8 do lote 1 e 2 do lote 2
    const alocacao = inventoryBatchService.alocarLoteConsumo({
      tenantId: 'tenant_teste',
      state,
      partId: 'peca_lamina_mestra',
      quantity: 10,
      osId: 'os_201'
    });

    assert.equal(alocacao.length, 2, 'Deve ter dividido a alocação em 2 lotes');
    assert.equal(alocacao[0].loteCodigo, 'LOT-2026-A1');
    assert.equal(alocacao[0].quantidade, 8);
    assert.equal(alocacao[1].loteCodigo, 'LOT-2026-A2');
    assert.equal(alocacao[1].quantidade, 2);

    const b1 = state.inventoryBatches.find(b => b.loteCodigo === 'LOT-2026-A1');
    const b2 = state.inventoryBatches.find(b => b.loteCodigo === 'LOT-2026-A2');
    assert.equal(b1.quantidadeAtual, 0);
    assert.equal(b1.status, 'esgotado');
    assert.equal(b2.quantidadeAtual, 4);
    assert.equal(b2.status, 'ativo');
    assert.equal(state.pecas[0].qtd, 4, 'Saldo físico deve refletir 14 - 10 = 4');
  });

  await t.test('1.3. Rastreamento Reverso de Recall/Garantia de Lote por Placa e OS', () => {
    const state = criarEstadoMock();
    inventoryBatchService.registrarEntradaLote({
      tenantId: 'tenant_teste',
      state,
      partId: 'peca_lamina_mestra',
      loteCodigo: 'LOT-RECALL-99',
      fornecedorId: 'forn_forja',
      fabricante: 'Forjaria Pesada',
      quantidade: 10,
      custoUnitario: 200,
      dataEntrada: '2026-10-15T08:00:00.000Z'
    });

    // Vincula consumo à OS 201
    inventoryBatchService.alocarLoteConsumo({
      tenantId: 'tenant_teste',
      state,
      partId: 'peca_lamina_mestra',
      quantity: 4,
      osId: 'os_201',
      loteCodigo: 'LOT-RECALL-99'
    });

    const resultadoRecall = inventoryBatchService.rastrearLote({
      tenantId: 'tenant_teste',
      state,
      loteCodigo: 'LOT-RECALL-99'
    });

    assert.equal(resultadoRecall.lote.loteCodigo, 'LOT-RECALL-99');
    assert.equal(resultadoRecall.lote.fabricante, 'Forjaria Pesada');
    assert.equal(resultadoRecall.utilizacoes.length, 1);
    assert.equal(resultadoRecall.utilizacoes[0].osId, 'os_201');
    assert.equal(resultadoRecall.utilizacoes[0].placa, 'BRA2E19');
    assert.equal(resultadoRecall.utilizacoes[0].veiculo, 'Scania R450');
    assert.equal(resultadoRecall.utilizacoes[0].cliente, 'Transportadora Falcão');
    assert.equal(resultadoRecall.utilizacoes[0].quantidadeConsumida, 4);
  });

  await t.test('2.1. Reserva Atômica por OS e Proteção Contra Overbooking', () => {
    const inventoryReservationService = require(path.join(rootDir, 'services', 'inventory', 'inventoryReservationService.js'));
    const state = criarEstadoMock();
    state.pecas[0].qtd = 10; // Saldo físico inicial = 10

    // Verifica saldos iniciais
    const s0 = inventoryReservationService.obterSaldosDetalhados({
      tenantId: 'tenant_teste',
      state,
      partId: 'peca_lamina_mestra'
    });
    assert.equal(s0.saldoFisico, 10);
    assert.equal(s0.saldoReservado, 0);
    assert.equal(s0.saldoDisponivel, 10);

    // Reserva 6 unidades para a OS 201
    const res1 = inventoryReservationService.reservarPecasOS({
      tenantId: 'tenant_teste',
      state,
      osId: 'os_201',
      itens: [{ partId: 'peca_lamina_mestra', quantity: 6 }]
    });
    assert.equal(res1.ok, true);

    const s1 = inventoryReservationService.obterSaldosDetalhados({
      tenantId: 'tenant_teste',
      state,
      partId: 'peca_lamina_mestra'
    });
    assert.equal(s1.saldoFisico, 10, 'Físico permanece intacto durante a reserva');
    assert.equal(s1.saldoReservado, 6);
    assert.equal(s1.saldoDisponivel, 4, 'Disponível reduzido para 4');

    // Adiciona OS 202 para testar overbooking
    state.os.push({
      id: 'os_202',
      num: '202',
      tenantId: 'tenant_teste',
      st: 'aprovada',
      pecas: []
    });

    // Tentativa de reservar 5 unidades para outra OS deve falhar (overbooking)
    assert.throws(
      () => {
        inventoryReservationService.reservarPecasOS({
          tenantId: 'tenant_teste',
          state,
          osId: 'os_202',
          itens: [{ partId: 'peca_lamina_mestra', quantity: 5 }]
        });
      },
      /Saldo disponível insuficiente/
    );
  });

  await t.test('2.2. Baixa Definitiva (Commit) ao Finalizar OS e Estorno (Release) ao Cancelar', () => {
    const inventoryReservationService = require(path.join(rootDir, 'services', 'inventory', 'inventoryReservationService.js'));
    const state = criarEstadoMock();
    state.pecas[0].qtd = 10;

    inventoryBatchService.registrarEntradaLote({
      tenantId: 'tenant_teste',
      state,
      partId: 'peca_lamina_mestra',
      loteCodigo: 'LOT-COMMIT-01',
      quantidade: 10,
      custoUnitario: 150
    });
    // Zera o acúmulo duplicado do mock para manter 10
    state.pecas[0].qtd = 10;

    // Reserva 4 unidades
    inventoryReservationService.reservarPecasOS({
      tenantId: 'tenant_teste',
      state,
      osId: 'os_201',
      itens: [{ partId: 'peca_lamina_mestra', quantity: 4 }]
    });

    // Baixa definitiva da OS
    const baixa = inventoryReservationService.efetivarBaixaOS({
      tenantId: 'tenant_teste',
      state,
      osId: 'os_201'
    });
    assert.equal(baixa.ok, true);
    assert.equal(baixa.totalItensBaixados, 1);

    const sBaixa = inventoryReservationService.obterSaldosDetalhados({
      tenantId: 'tenant_teste',
      state,
      partId: 'peca_lamina_mestra'
    });
    assert.equal(sBaixa.saldoFisico, 6, 'Saldo físico foi abatido para 6');
    assert.equal(sBaixa.saldoReservado, 0, 'Reserva foi liquidada');
    assert.equal(sBaixa.saldoDisponivel, 6);

    // Nova reserva de 2 unidades para OS 203
    state.os.push({
      id: 'os_203',
      num: '203',
      tenantId: 'tenant_teste',
      st: 'cancelada',
      pecas: []
    });

    inventoryReservationService.reservarPecasOS({
      tenantId: 'tenant_teste',
      state,
      osId: 'os_203',
      itens: [{ partId: 'peca_lamina_mestra', quantity: 2 }]
    });

    const sRes2 = inventoryReservationService.obterSaldosDetalhados({
      tenantId: 'tenant_teste',
      state,
      partId: 'peca_lamina_mestra'
    });
    assert.equal(sRes2.saldoReservado, 2);
    assert.equal(sRes2.saldoDisponivel, 4);

    // Estorno/Release da reserva
    const estorno = inventoryReservationService.liberarReservaOS({
      tenantId: 'tenant_teste',
      state,
      osId: 'os_203',
      reason: 'OS cancelada pelo frotista'
    });
    assert.equal(estorno.ok, true);

    const sEstorno = inventoryReservationService.obterSaldosDetalhados({
      tenantId: 'tenant_teste',
      state,
      partId: 'peca_lamina_mestra'
    });
    assert.equal(sEstorno.saldoFisico, 6, 'Saldo físico inalterado no estorno');
    assert.equal(sEstorno.saldoReservado, 0, 'Reserva liberada para zero');
    assert.equal(sEstorno.saldoDisponivel, 6, 'Saldo disponível restaurado para 6');
  });

  await t.test('3.1. Curva ABC Dinâmica (80/15/5), Ponto de Pedido e Sugestão de Compras', () => {
    const inventoryAbcEngine = require(path.join(rootDir, 'services', 'inventory', 'inventoryAbcEngine.js'));
    const state = {
      pecas: [
        { id: 'p_feixe_mola', tenantId: 'tenant_teste', nome: 'Feixe de Molas Traseiro', preco: 1500, custo: 1000, qtd: 2, leadTimeDias: 10 },
        { id: 'p_grampo_aco', tenantId: 'tenant_teste', nome: 'Grampo 4140 Reforçado', preco: 80, custo: 50, qtd: 5, leadTimeDias: 5 },
        { id: 'p_bucha_bronze', tenantId: 'tenant_teste', nome: 'Bucha de Bronze Silenciosa', preco: 40, custo: 20, qtd: 50, leadTimeDias: 3 },
        { id: 'p_parafuso_roda', tenantId: 'tenant_teste', nome: 'Parafuso de Roda M22', preco: 15, custo: 8, qtd: 100, leadTimeDias: 2 }
      ],
      os: [
        {
          id: 'os_301',
          tenantId: 'tenant_teste',
          st: 'finalizada',
          finalizadoEm: '2026-11-01T10:00:00.000Z',
          pecas: [
            // Consumo: 8 feixes de molas x R$ 1000 = R$ 8.000
            { partId: 'p_feixe_mola', qtd: 8, valor: 1000, status: 'baixada' },
            // Consumo: 30 grampos x R$ 50 = R$ 1.500
            { partId: 'p_grampo_aco', qtd: 30, valor: 50, status: 'baixada' },
            // Consumo: 10 buchas x R$ 20 = R$ 200
            { partId: 'p_bucha_bronze', qtd: 10, valor: 20, status: 'baixada' }
            // Parafuso de roda não foi consumido (0)
          ]
        }
      ],
      partReservations: [],
      inventoryMovements: []
    };

    // Total de consumo: 8000 + 1500 + 200 = 9700
    // Feixe: 8000 / 9700 = 82.47% -> Classe A
    // Grampo: 1500 / 9700 = 15.46% (acumulado ~97.9%) -> Classe B
    // Bucha: 200 / 9700 = 2.06% -> Classe C
    // Parafuso: 0 -> Classe C

    const abc = inventoryAbcEngine.calcularCurvaABC({
      tenantId: 'tenant_teste',
      state,
      diasHistorico: 30
    });

    assert.equal(abc.totais.totalItens, 4);
    assert.equal(abc.totais.valorTotalConsumo, 9700);

    const feixeItem = abc.itens.find(i => i.partId === 'p_feixe_mola');
    assert.equal(feixeItem.classeABC, 'A', 'Feixe deve ser Classe A (>80% do valor)');
    assert.ok(feixeItem.pontoDePedido > feixeItem.saldoDisponivel, 'Feixe deve estar abaixo do ponto de pedido');
    assert.equal(feixeItem.necessitaReposicao, true);
    assert.ok(feixeItem.sugestaoCompraQtd > 0, 'Deve sugerir compra');

    const grampoItem = abc.itens.find(i => i.partId === 'p_grampo_aco');
    assert.equal(grampoItem.classeABC, 'B', 'Grampo deve ser Classe B');

    const buchaItem = abc.itens.find(i => i.partId === 'p_bucha_bronze');
    assert.equal(buchaItem.classeABC, 'C', 'Bucha deve ser Classe C');

    // Sugestões de reposição crítica devem conter feixe e grampo
    assert.ok(abc.sugestoesReposicaoCritica.some(s => s.partId === 'p_feixe_mola'));
  });

  await t.test('4.1. Endpoints HTTP da API de Estoque Pesado (/api/estoque/...)', async () => {
    const { initDB } = require(path.join(rootDir, 'db'));
    await initDB();

    const { mutateTenantState } = require(path.join(rootDir, 'lib', 'serverContext'));
    await mutateTenantState({ securityContext: { tenantId: 'tenant_api_heavy' } }, (draft) => {
      draft.os = draft.os || [];
      if (!draft.os.some(o => o.id === 'os_api_1')) {
        draft.os.push({
          id: 'os_api_1',
          num: '9901',
          tenantId: 'tenant_api_heavy',
          st: 'aprovada',
          placa: 'API9A99',
          pecas: []
        });
      }
    });

    const express = require('express');
    const http = require('http');
    const { mountRoutes } = require(path.join(rootDir, 'routes', 'index.js'));

    const app = express();
    app.use(express.json());

    // Middleware simulado de autenticação para teste de rotas
    app.use((req, res, next) => {
      req.securityContext = {
        tenantId: 'tenant_api_heavy',
        actorId: 'operador_almoxarifado',
        role: 'admin',
        permissions: ['inventory:read', 'inventory:write', 'inventory:manage']
      };
      next();
    });

    mountRoutes(app);

    const server = http.createServer(app);
    await new Promise(resolve => server.listen(0, resolve));
    const port = server.address().port;
    const baseUrl = `http://127.0.0.1:${port}`;

    try {
      // 1. Cadastra peça para o teste via POST /api/pecas
      const cadRes = await fetch(`${baseUrl}/api/pecas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          codigoInterno: 'GRP-4140',
          nome: 'Grampo 4140 Teste API',
          descricao: 'Grampo 4140 Teste API',
          preco: 95,
          custo: 50,
          qtd: 0
        })
      });
      const cadData = await cadRes.json();
      const partId = cadData.part?.id || cadData.id || cadData.peca?.id;

      // 2. POST /api/estoque/lotes/entrada
      const loteRes = await fetch(`${baseUrl}/api/estoque/lotes/entrada`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          partId,
          loteCodigo: 'LOT-API-001',
          fornecedorId: 'forn_aco_api',
          fabricante: 'Molas Brasil API',
          quantidade: 20,
          custoUnitario: 48,
          notaFiscal: 'NF-9988'
        })
      });
      const loteData = await loteRes.json();
      assert.equal(loteRes.status, 200);
      assert.equal(loteData.success, true);
      assert.equal(loteData.lote.loteCodigo, 'LOT-API-001');

      // 3. GET /api/estoque/lotes/rastreio/:loteCodigo
      const rastreioRes = await fetch(`${baseUrl}/api/estoque/lotes/rastreio/LOT-API-001`);
      const rastreioData = await rastreioRes.json();
      assert.equal(rastreioRes.status, 200);
      assert.equal(rastreioData.success, true);
      assert.equal(rastreioData.rastreio.lote.fabricante, 'Molas Brasil API');

      // 4. GET /api/estoque/curva-abc
      const abcRes = await fetch(`${baseUrl}/api/estoque/curva-abc?dias=30`);
      const abcData = await abcRes.json();
      assert.equal(abcRes.status, 200);
      assert.equal(abcData.success, true);
      assert.ok(abcData.abc.totais.totalItens >= 1);

      // 5. POST /api/estoque/reservas/sincronizar (criar OS mock se necessário)
      const resSync = await fetch(`${baseUrl}/api/estoque/reservas/sincronizar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          acao: 'reservar',
          osId: 'os_api_1',
          itens: [{ partId, quantity: 5 }]
        })
      });
      const dataSync = await resSync.json();
      assert.equal(resSync.status, 200);
      assert.equal(dataSync.success, true);
    } finally {
      await new Promise(resolve => server.close(resolve));
    }
  });

  await t.test('5.1. Componentes de UI de Estoque Pesado (Badges ABC, Saldos Triplos e Modais de Lote)', () => {
    const fs = require('fs');
    const vm = require('vm');

    const uiPath = path.join(rootDir, 'js', 'modules', 'estoque_pesado_ui.js');
    assert.ok(fs.existsSync(uiPath), 'estoque_pesado_ui.js deve existir');

    const ctx = {
      window: {},
      document: { getElementById: () => null },
      S: { pecas: [{ id: 'p1', nome: 'Mola Pesada' }], inventoryBatches: [] },
      fecharModalGenerico: () => {},
      abrirModalGenerico: () => {}
    };
    ctx.window = ctx;
    ctx.globalThis = ctx;
    vm.createContext(ctx);

    const code = fs.readFileSync(uiPath, 'utf8');
    vm.runInContext(code, ctx);

    // 1. Badges ABC
    const badgeA = ctx.renderBadgeClasseAbcHtml('A');
    assert.ok(badgeA.includes('Classe A'), 'Deve conter rótulo Classe A');
    assert.ok(badgeA.includes('badge-success') || badgeA.includes('10b981'), 'Deve ter estilo verde/destaque');

    const badgeB = ctx.renderBadgeClasseAbcHtml('B');
    assert.ok(badgeB.includes('Classe B'));

    const badgeC = ctx.renderBadgeClasseAbcHtml('C');
    assert.ok(badgeC.includes('Classe C'));

    // 2. Saldos Triplos
    const saldosHtml = ctx.renderSaldosTriplosHtml({ saldoFisico: 10, saldoReservado: 4, saldoDisponivel: 6 });
    assert.ok(saldosHtml.includes('10'), 'Deve exibir saldo físico');
    assert.ok(saldosHtml.includes('4'), 'Deve exibir saldo reservado');
    assert.ok(saldosHtml.includes('6'), 'Deve exibir saldo disponível');

    // 3. Modal de Rastreio de Lote (Recall)
    const mockRastreio = {
      lote: {
        loteCodigo: 'LOT-REC-01',
        pecaNome: 'Lâmina Mestra',
        fabricante: 'Tupã',
        quantidadeInicial: 10,
        quantidadeAtual: 2
      },
      utilizacoes: [
        { osNum: '305', placa: 'BRA2E19', veiculo: 'Volvo FH', cliente: 'Transfalcão', quantidadeConsumida: 8 }
      ]
    };
    const modalRecallHtml = ctx.modalRastreioLoteHtml(mockRastreio);
    assert.ok(modalRecallHtml.includes('LOT-REC-01'), 'Deve exibir código do lote no recall');
    assert.ok(modalRecallHtml.includes('BRA2E19'), 'Deve exibir placa do veículo rastreado');
    assert.ok(modalRecallHtml.includes('Transfalcão'), 'Deve exibir cliente da OS');

    // 4. Modal de Entrada de Lote
    const modalEntradaHtml = ctx.modalEntradaLoteHtml('p1', 'Mola Pesada');
    assert.ok(modalEntradaHtml.includes('data-act="salvar-entrada-lote"'), 'Deve conter trigger de salvar lote');
    assert.ok(modalEntradaHtml.includes('Mola Pesada'), 'Deve conter nome da peça');
  });
});
