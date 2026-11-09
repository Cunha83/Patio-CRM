'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const partialApprovalService = require('../services/quotation/partialApprovalService');
const fleetCostCenterService = require('../services/crm/fleetCostCenterService');
const fleetBorderoService = require('../services/billing/fleetBorderoService');
const inventoryReservationService = require('../services/inventory/inventoryReservationService');

describe('Sprint 5.1 — Aprovação Parcial de Orçamentos e CRM', () => {
  const tenantId = 'tenant_sprint51_test';

  function criarEstadoMock() {
    return {
      pecas: [
        { id: 'peca_mola_1', nome: 'Lâmina Mestra 120mm', qtd: 5, valor: 450.00, tenantId },
        { id: 'peca_buch_1', nome: 'Bucha de Bronze Traseira', qtd: 10, valor: 85.00, tenantId },
        { id: 'peca_grampo_1', nome: 'Grampo Redondo 3/4', qtd: 8, valor: 65.00, tenantId }
      ],
      servicos: [
        { id: 'srv_troca_mestra', nome: 'Troca de Lâmina Mestra', valor: 250.00, tenantId },
        { id: 'srv_reaperto', nome: 'Reaperto e Alinhamento de Feixe', valor: 180.00, tenantId },
        { id: 'srv_embuchamento', nome: 'Embuchamento Traseiro', valor: 320.00, tenantId }
      ],
      clientes: [
        { id: 'cli_transp_alfa', nome: 'Transportadora Alfa Logística Ltda', doc: '12.345.678/0001-90', tenantId }
      ],
      veiculos: [
        { id: 'vei_volvo_fh', placa: 'ABC1D23', modelo: 'Volvo FH 540 6x4', cli: 'cli_transp_alfa', tenantId }
      ],
      os: [
        {
          id: 'os_teste_01',
          num: 1501,
          tenantId,
          cli: 'cli_transp_alfa',
          vei: 'vei_volvo_fh',
          placa: 'ABC1D23',
          st: 'orcamento',
          desc: 0,
          servicos: [
            { id: 'item_srv_1', servicoId: 'srv_troca_mestra', desc: 'Troca de Lâmina Mestra', valor: 250.00 },
            { id: 'item_srv_2', servicoId: 'srv_embuchamento', desc: 'Embuchamento Traseiro', valor: 320.00 }
          ],
          pecas: [
            { id: 'item_peca_1', partId: 'peca_mola_1', pecaId: 'peca_mola_1', nome: 'Lâmina Mestra 120mm', qtd: 2, valor: 450.00, total: 900.00 },
            { id: 'item_peca_2', partId: 'peca_buch_1', pecaId: 'peca_buch_1', nome: 'Bucha de Bronze Traseira', qtd: 4, valor: 85.00, total: 340.00 }
          ]
        }
      ],
      partReservations: [],
      inventoryMovements: [],
      inventoryBatches: [],
      opportunities: [],
      auditoria: []
    };
  }

  test('1.1: Deve aprovar parcialmente itens da OS, estornar reservas de itens adiados e recalcular total', () => {
    const state = criarEstadoMock();

    // 1. Inicializa reservas atômicas para todas as peças da OS
    inventoryReservationService.reservarPecasOS({
      tenantId,
      state,
      osId: 'os_teste_01',
      itens: [
        { partId: 'peca_mola_1', quantity: 2 },
        { partId: 'peca_buch_1', quantity: 4 }
      ]
    });

    const saldoBuchasAntes = inventoryReservationService.obterSaldosDetalhados({
      tenantId,
      state,
      partId: 'peca_buch_1'
    });
    assert.equal(saldoBuchasAntes.saldoReservado, 4);
    assert.equal(saldoBuchasAntes.saldoDisponivel, 6);

    // 2. Executa aprovação parcial:
    // - Aprova: item_srv_1 (250) e item_peca_1 (900)
    // - Adia: item_srv_2 (320, criticidade alta) e item_peca_2 (340, criticidade media)
    const resultado = partialApprovalService.processarAprovacaoParcial({
      tenantId,
      state,
      osId: 'os_teste_01',
      itens: [
        { id: 'item_srv_1', tipo: 'servico', statusItem: 'aprovado' },
        { id: 'item_peca_1', tipo: 'peca', statusItem: 'aprovado' },
        { id: 'item_srv_2', tipo: 'servico', statusItem: 'adiado', motivo: 'Gestor postergou para próxima revisão', criticidade: 'alta', prazoDias: 15 },
        { id: 'item_peca_2', tipo: 'peca', statusItem: 'adiado', motivo: 'Custo no momento', criticidade: 'media', prazoDias: 30 }
      ],
      actorId: 'consultor_frotas',
      observacoes: 'Aprovação emergencial do feixe principal; buchas adiadas para revisão mensal'
    });

    assert.equal(resultado.ok, true);
    assert.equal(resultado.statusAprovacao, 'parcialmente_aprovada');

    // Verifica recálculo financeiro da OS (apenas aprovados: 250 + 900 = 1150)
    const os = state.os.find(o => o.id === 'os_teste_01');
    assert.equal(os.totalServicos, 250);
    assert.equal(os.totalPecas, 900);
    assert.equal(os.total, 1150);
    assert.equal(os.statusAprovacao, 'parcialmente_aprovada');

    // Verifica estorno atômico da reserva da bucha (adiada)
    const saldoBuchasDepois = inventoryReservationService.obterSaldosDetalhados({
      tenantId,
      state,
      partId: 'peca_buch_1'
    });
    assert.equal(saldoBuchasDepois.saldoReservado, 0, 'Reserva da peça adiada deve ser liberada');
    assert.equal(saldoBuchasDepois.saldoDisponivel, 10, 'Saldo disponível deve voltar a 10');

    // Reserva da mola (aprovada) deve permanecer ativa
    const saldoMola = inventoryReservationService.obterSaldosDetalhados({
      tenantId,
      state,
      partId: 'peca_mola_1'
    });
    assert.equal(saldoMola.saldoReservado, 2, 'Peça aprovada mantém reserva ativa');

    // 3. Verifica registro gerado em state.opportunities (CRM de demanda reprimida)
    assert.equal(state.opportunities.length, 1);
    const opp = state.opportunities[0];
    assert.equal(opp.tipo, 'demanda_reprimida_orcamento');
    assert.equal(opp.origemOSId, 'os_teste_01');
    assert.equal(opp.origemOSNum, 1501);
    assert.equal(opp.clienteId, 'cli_transp_alfa');
    assert.equal(opp.placa, 'ABC1D23');
    assert.equal(opp.criticidadeMaxima, 'alta');
    assert.equal(opp.valorTotalEstimado, 660); // 320 (srv) + 340 (peca)
    assert.equal(opp.itensAdiados.length, 2);
    assert.ok(opp.dataFollowUp, 'Deve ter data programada de follow-up');
    assert.equal(opp.status, 'aberta');
  });

  test('1.2: Deve listar oportunidades adiadas com filtros por cliente e criticidade', () => {
    const state = criarEstadoMock();
    state.opportunities = [
      { id: 'opp_1', tenantId, clienteId: 'cli_transp_alfa', placa: 'ABC1D23', criticidadeMaxima: 'alta', tipo: 'demanda_reprimida_orcamento', status: 'aberta' },
      { id: 'opp_2', tenantId, clienteId: 'cli_transp_alfa', placa: 'XYZ9K88', criticidadeMaxima: 'baixa', tipo: 'demanda_reprimida_orcamento', status: 'aberta' },
      { id: 'opp_3', tenantId: 'outro_tenant', clienteId: 'cli_outro', placa: 'OUT1234', criticidadeMaxima: 'alta', tipo: 'demanda_reprimida_orcamento', status: 'aberta' }
    ];

    const altas = partialApprovalService.listarOportunidadesAdiadas({
      tenantId,
      state,
      clienteId: 'cli_transp_alfa',
      criticidade: 'alta'
    });
    assert.equal(altas.length, 1);
    assert.equal(altas[0].id, 'opp_1');
  });

  test('2.1: Deve cadastrar Centros de Custo no cliente frotista e associar a veículos e OSs', () => {
    const state = criarEstadoMock();

    // 1. Cadastra Centros de Custo
    const cc1 = fleetCostCenterService.cadastrarCentroCusto({
      tenantId,
      state,
      clienteId: 'cli_transp_alfa',
      nome: 'Operação Grãos - Centro-Oeste',
      codigo: 'CC-GRAOS',
      responsavel: 'Carlos Gestor',
      orcamentoMensal: 50000.00
    });
    assert.equal(cc1.ok, true);
    assert.ok(cc1.centroCusto.id);

    const cc2 = fleetCostCenterService.cadastrarCentroCusto({
      tenantId,
      state,
      clienteId: 'cli_transp_alfa',
      nome: 'Operação Frigorífico - Sudeste',
      codigo: 'CC-FRIGO',
      responsavel: 'Marcos Frota',
      orcamentoMensal: 35000.00
    });
    assert.equal(cc2.ok, true);

    const lista = fleetCostCenterService.listarCentrosCustoPorCliente({
      tenantId,
      state,
      clienteId: 'cli_transp_alfa'
    });
    assert.equal(lista.length, 2);

    // 2. Vincula Centro de Custo ao Veículo e à OS
    const vRes = fleetCostCenterService.vincularCentroCustoVeiculo({
      tenantId,
      state,
      veiculoId: 'vei_volvo_fh',
      centroCustoId: cc1.centroCusto.id
    });
    assert.equal(vRes.ok, true);
    assert.equal(state.veiculos[0].centroCustoId, cc1.centroCusto.id);

    const osRes = fleetCostCenterService.vincularCentroCustoOS({
      tenantId,
      state,
      osId: 'os_teste_01',
      centroCustoId: cc1.centroCusto.id
    });
    assert.equal(osRes.ok, true);
    assert.equal(state.os[0].centroCustoId, cc1.centroCusto.id);
  });

  test('2.2: Deve agrupar e discriminar itens de Borderô de Frotas por Centro de Custo', () => {
    const state = criarEstadoMock();

    // Cadastra 2 centros de custo
    const cc1 = fleetCostCenterService.cadastrarCentroCusto({
      tenantId,
      state,
      clienteId: 'cli_transp_alfa',
      nome: 'Operação Grãos',
      codigo: 'CC-GRAOS'
    });
    const cc2 = fleetCostCenterService.cadastrarCentroCusto({
      tenantId,
      state,
      clienteId: 'cli_transp_alfa',
      nome: 'Operação Frigorífico',
      codigo: 'CC-FRIGO'
    });

    // Cria 2 OSs finalizadas para faturamento
    state.os = [
      {
        id: 'os_fat_1',
        num: 2001,
        tenantId,
        cli: 'cli_transp_alfa',
        st: 'finalizada',
        fechamento: '2026-11-08',
        centroCustoId: cc1.centroCusto.id,
        servicos: [{ desc: 'Alinhamento', valor: 300 }],
        pecas: [{ nome: 'Grampo', valor: 100, qtd: 2 }]
      },
      {
        id: 'os_fat_2',
        num: 2002,
        tenantId,
        cli: 'cli_transp_alfa',
        st: 'finalizada',
        fechamento: '2026-11-08',
        centroCustoId: cc2.centroCusto.id,
        servicos: [{ desc: 'Revisão Freio', valor: 500 }],
        pecas: [{ nome: 'Lona', valor: 250, qtd: 2 }]
      }
    ];

    // Simula prévia de borderô
    const previa = fleetBorderoService.simularPreviaBordero({
      state,
      tenantId,
      clienteId: 'cli_transp_alfa',
      osIds: ['os_fat_1', 'os_fat_2']
    });

    assert.equal(previa.ok, true);
    assert.ok(previa.agrupamentoCentrosCusto, 'Deve conter agrupamento de centros de custo');
    assert.equal(previa.agrupamentoCentrosCusto.length, 2);

    const grupoGraos = previa.agrupamentoCentrosCusto.find(g => g.centroCustoId === cc1.centroCusto.id);
    assert.ok(grupoGraos);
    assert.equal(grupoGraos.totalMaoDeObra, 300);
    assert.equal(grupoGraos.totalPecas, 200);
    assert.equal(grupoGraos.totalGeral, 500);

    const grupoFrigo = previa.agrupamentoCentrosCusto.find(g => g.centroCustoId === cc2.centroCusto.id);
    assert.ok(grupoFrigo);
    assert.equal(grupoFrigo.totalMaoDeObra, 500);
    assert.equal(grupoFrigo.totalPecas, 500);
    assert.equal(grupoFrigo.totalGeral, 1000);
  });

  test('3.1: Endpoints REST (Aprovação Parcial, Oportunidades Adiadas e Centros de Custo)', async () => {
    const { initDB } = require('../db');
    await initDB();

    const express = require('express');
    const http = require('http');
    const { mountRoutes } = require('../routes/index.js');
    const { getState, getDefaultState, persistState } = require('../lib/repository/stateRepository');

    const app = express();
    app.use(express.json());

    const apiTenantId = 'tenant_http_sprint51';
    const mockState = {
      ...getDefaultState(apiTenantId),
      clientes: [
        { id: 'cli_http_1', nome: 'Transportes Brasil S.A.', doc: '99.888.777/0001-11', tenantId: apiTenantId, centrosCusto: [] }
      ],
      veiculos: [
        { id: 'vei_http_1', placa: 'BR51E20', modelo: 'Scania 540', cli: 'cli_http_1', tenantId: apiTenantId }
      ],
      os: [
        {
          id: 'os_http_1',
          num: 5101,
          tenantId: apiTenantId,
          cli: 'cli_http_1',
          vei: 'vei_http_1',
          placa: 'BR51E20',
          st: 'orcamento',
          desc: 0,
          servicos: [
            { id: 'srv_1', desc: 'Troca Pino', valor: 200 },
            { id: 'srv_2', desc: 'Revisão Eixo', valor: 350 }
          ],
          pecas: [
            { id: 'peca_1', nome: 'Pino Balancim', valor: 150, qtd: 1, total: 150 },
            { id: 'peca_2', nome: 'Bucha Eixo', valor: 80, qtd: 2, total: 160 }
          ]
        }
      ],
      opportunities: [],
      partReservations: [],
      inventoryMovements: []
    };
    await persistState(apiTenantId, mockState);

    app.use((req, res, next) => {
      req.securityContext = {
        tenantId: apiTenantId,
        actorId: 'admin_test',
        role: 'admin',
        permissions: ['*'],
        channel: 'api'
      };
      next();
    });

    mountRoutes(app);

    const server = http.createServer(app);
    await new Promise(resolve => server.listen(0, resolve));
    const port = server.address().port;
    const baseUrl = `http://127.0.0.1:${port}`;

    try {
      // 1. POST /api/clientes/:id/centros-custo
      const resPostCC = await fetch(`${baseUrl}/api/clientes/cli_http_1/centros-custo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nome: 'Operação Grãos Sul',
          codigo: 'CC-SUL',
          responsavel: 'João Frota',
          orcamentoMensal: 60000
        })
      });
      const dataPostCC = await resPostCC.json();
      assert.equal(resPostCC.status, 200);
      assert.equal(dataPostCC.success, true);
      assert.equal(dataPostCC.centroCusto.codigo, 'CC-SUL');

      // 2. GET /api/clientes/:id/centros-custo
      const resGetCC = await fetch(`${baseUrl}/api/clientes/cli_http_1/centros-custo`);
      const dataGetCC = await resGetCC.json();
      assert.equal(resGetCC.status, 200);
      assert.equal(dataGetCC.success, true);
      assert.equal(dataGetCC.centrosCusto.length, 1);

      // 3. POST /api/os/:id/aprovacao-parcial
      const resAprov = await fetch(`${baseUrl}/api/os/os_http_1/aprovacao-parcial`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itens: [
            { id: 'srv_1', statusItem: 'aprovado' },
            { id: 'peca_1', statusItem: 'aprovado' },
            { id: 'srv_2', statusItem: 'adiado', motivo: 'Revisão futura', criticidade: 'alta', prazoDias: 15 },
            { id: 'peca_2', statusItem: 'adiado', motivo: 'Sem verba imediata', criticidade: 'media', prazoDias: 30 }
          ],
          observacoes: 'Aprovação parcial autorizada pelo gestor'
        })
      });
      const dataAprov = await resAprov.json();
      assert.equal(resAprov.status, 200);
      assert.equal(dataAprov.success, true);
      assert.equal(dataAprov.statusAprovacao, 'parcialmente_aprovada');
      assert.equal(dataAprov.totais.total, 350); // 200 (srv_1) + 150 (peca_1)

      // 4. GET /api/crm/oportunidades-adiadas
      const resOpp = await fetch(`${baseUrl}/api/crm/oportunidades-adiadas?clienteId=cli_http_1`);
      const dataOpp = await resOpp.json();
      assert.equal(resOpp.status, 200);
      assert.equal(dataOpp.success, true);
      assert.equal(dataOpp.total, 1);
      assert.equal(dataOpp.oportunidades[0].criticidadeMaxima, 'alta');
    } finally {
      await new Promise(resolve => server.close(resolve));
    }
  });

  test('4.1: Componentes visuais de UI de Aprovação Parcial e Centros de Custo', () => {
    const fs = require('fs');
    const vm = require('vm');
    const path = require('path');

    const uiPath = path.resolve(__dirname, '../js/modules/orcamento_parcial_ui.js');
    assert.ok(fs.existsSync(uiPath), 'orcamento_parcial_ui.js deve existir');

    const ctx = {
      window: {},
      document: {
        querySelectorAll: () => [],
        getElementById: () => null
      },
      S: { os: [], clientes: [], costCenters: [] },
      fecharModalGenerico: () => {},
      abrirModalGenerico: () => {}
    };
    ctx.window = ctx;
    ctx.globalThis = ctx;
    vm.createContext(ctx);

    const code = fs.readFileSync(uiPath, 'utf8');
    vm.runInContext(code, ctx);

    // 1. Badges de Status do Item
    const badgeAprov = ctx.renderBadgeStatusItemHtml('aprovado');
    assert.ok(badgeAprov.includes('Aprovado'));
    assert.ok(badgeAprov.includes('badge-success') || badgeAprov.includes('10b981'));

    const badgeAdiado = ctx.renderBadgeStatusItemHtml('adiado');
    assert.ok(badgeAdiado.includes('Adiado (CRM)'));

    const badgeRecusado = ctx.renderBadgeStatusItemHtml('recusado');
    assert.ok(badgeRecusado.includes('Recusado'));

    // 2. Badges de Criticidade
    const badgeAlta = ctx.renderBadgeCriticidadeHtml('alta');
    assert.ok(badgeAlta.includes('Alta (D+15)'));

    const badgeMedia = ctx.renderBadgeCriticidadeHtml('media');
    assert.ok(badgeMedia.includes('Média (D+30)'));

    // 3. Modal de Aprovação Parcial
    const mockOS = {
      id: 'os_view_1',
      num: 1234,
      placa: 'XYZ9K88',
      cliente: 'Frota Rápida',
      total: 1000,
      servicos: [{ id: 'srv_1', desc: 'Troca Bucha', valor: 300 }],
      pecas: [{ id: 'peca_1', nome: 'Bucha Balancim', valor: 700, qtd: 1 }]
    };
    const mockCentrosCusto = [
      { id: 'cc_1', codigo: 'CC-OESTE', nome: 'Operação Oeste' }
    ];

    const htmlModal = ctx.modalAprovacaoParcialHtml(mockOS, mockCentrosCusto);
    assert.ok(htmlModal.includes('OS #1234'), 'Deve exibir número da OS no título');
    assert.ok(htmlModal.includes('XYZ9K88'), 'Deve exibir placa do veículo');
    assert.ok(htmlModal.includes('Troca Bucha'), 'Deve conter item de serviço');
    assert.ok(htmlModal.includes('Bucha Balancim'), 'Deve conter item de peça');
    assert.ok(htmlModal.includes('CC-OESTE'), 'Deve conter opção do Centro de Custo');
    assert.ok(htmlModal.includes('data-act="confirmar-aprovacao-parcial"'), 'Deve conter trigger de confirmação');

    // 4. Seletor de Centro de Custo no Borderô
    const htmlSelectBordero = ctx.renderSeletorCentroCustoBorderoHtml(mockCentrosCusto);
    assert.ok(htmlSelectBordero.includes('filtro_bordero_centro_custo'));
    assert.ok(htmlSelectBordero.includes('CC-OESTE'));
  });
});
