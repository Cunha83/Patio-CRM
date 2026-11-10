'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const opportunityConversionService = require('../services/crm/opportunityConversionService');
const fleetCostCenterService = require('../services/crm/fleetCostCenterService');

describe('Sprint 5.2 — Fila de Follow-up de Demanda Reprimida & Conversão em OS', () => {
  const tenantId = 'tenant_sprint52_test';

  function criarEstadoMock() {
    return {
      clientes: [
        { id: 'cli_transp_sul', nome: 'Transportadora Sul Express Ltda', doc: '11.222.333/0001-44', tenantId, centrosCusto: [] }
      ],
      veiculos: [
        { id: 'vei_scania_r450', placa: 'SUL1A22', modelo: 'Scania R450 6x2', cli: 'cli_transp_sul', tenantId }
      ],
      pecas: [
        { id: 'peca_pino_1', nome: 'Pino de Balancim 38mm', qtd: 4, preco: 180.00, tenantId },
        { id: 'peca_bucha_1', nome: 'Bucha de Aço 50mm', qtd: 6, preco: 95.00, tenantId }
      ],
      servicos: [
        { id: 'srv_revisao_susp', nome: 'Revisão de Suspensão', valor: 350.00, tenantId }
      ],
      os: [],
      opportunities: [
        {
          id: 'opp_vencida',
          tenantId,
          tipo: 'demanda_reprimida_orcamento',
          status: 'aberta',
          clienteId: 'cli_transp_sul',
          clienteNome: 'Transportadora Sul Express Ltda',
          placa: 'SUL1A22',
          origemOSId: 'os_antiga_1',
          origemOSNum: 1001,
          criticidadeMaxima: 'alta',
          dataFollowUp: '2026-11-05',
          valorTotalEstimado: 1200.00,
          itensAdiados: [
            { id: 'item_s1', tipo: 'servico', nome: 'Revisão de Suspensão', valor: 350.00, criticidade: 'alta' },
            { id: 'item_p1', tipo: 'peca', nome: 'Pino de Balancim 38mm', valor: 360.00, partId: 'peca_pino_1', qtd: 2, criticidade: 'alta' }
          ]
        },
        {
          id: 'opp_hoje',
          tenantId,
          tipo: 'demanda_reprimida_orcamento',
          status: 'aberta',
          clienteId: 'cli_transp_sul',
          clienteNome: 'Transportadora Sul Express Ltda',
          placa: 'SUL1A22',
          origemOSId: 'os_antiga_2',
          origemOSNum: 1002,
          criticidadeMaxima: 'media',
          dataFollowUp: '2026-11-10',
          valorTotalEstimado: 800.00,
          itensAdiados: [
            { id: 'item_p2', tipo: 'peca', nome: 'Bucha de Aço 50mm', valor: 190.00, partId: 'peca_bucha_1', qtd: 2, criticidade: 'media' }
          ]
        },
        {
          id: 'opp_futura',
          tenantId,
          tipo: 'demanda_reprimida_orcamento',
          status: 'aberta',
          clienteId: 'cli_transp_sul',
          clienteNome: 'Transportadora Sul Express Ltda',
          placa: 'SUL1A22',
          origemOSId: 'os_antiga_3',
          origemOSNum: 1003,
          criticidadeMaxima: 'baixa',
          dataFollowUp: '2026-11-20',
          valorTotalEstimado: 450.00,
          itensAdiados: [
            { id: 'item_p3', tipo: 'peca', nome: 'Bucha de Aço 50mm', valor: 95.00, partId: 'peca_bucha_1', qtd: 1, criticidade: 'baixa' }
          ]
        },
        {
          id: 'opp_convertida_antiga',
          tenantId,
          tipo: 'demanda_reprimida_orcamento',
          status: 'convertida',
          clienteId: 'cli_transp_sul',
          dataFollowUp: '2026-11-01',
          valorTotalEstimado: 300.00
        }
      ],
      partReservations: [],
      inventoryMovements: [],
      costCenters: [],
      auditoria: []
    };
  }

  test('1.1: Deve listar fila de follow-up priorizada por status temporal (vencida > hoje > futura) e criticidade', () => {
    const state = criarEstadoMock();
    const resultado = opportunityConversionService.listarFilaFollowUpDemandaReprimida({
      tenantId,
      state,
      dataReferencia: '2026-11-10'
    });

    assert.equal(resultado.ok, true);
    assert.equal(resultado.total, 3, 'Deve listar apenas oportunidades não convertidas/não arquivadas');
    assert.equal(resultado.resumo.vencidas, 1);
    assert.equal(resultado.resumo.hoje, 1);
    assert.equal(resultado.resumo.futuras, 1);

    // Prioridade da fila
    assert.equal(resultado.fila[0].id, 'opp_vencida');
    assert.equal(resultado.fila[0].statusFollowUp, 'vencida');
    assert.equal(resultado.fila[1].id, 'opp_hoje');
    assert.equal(resultado.fila[1].statusFollowUp, 'hoje');
    assert.equal(resultado.fila[2].id, 'opp_futura');
    assert.equal(resultado.fila[2].statusFollowUp, 'futura');
  });

  test('1.2: Deve registrar interação de follow-up com reagendamento e arquivamento por perda', () => {
    const state = criarEstadoMock();

    // 1. Reagendamento com novo contato
    const resReg = opportunityConversionService.registrarFollowUpOportunidade({
      tenantId,
      state,
      oportunidadeId: 'opp_vencida',
      responsavel: 'Carlos Comercial',
      canal: 'whatsapp',
      resultado: 'contatado',
      observacao: 'Cliente pediu para retornar na quinta-feira após chegada de frete',
      novaDataFollowUp: '2026-11-12'
    });

    assert.equal(resReg.ok, true);
    const opp = state.opportunities.find(o => o.id === 'opp_vencida');
    assert.equal(opp.dataFollowUp, '2026-11-12', 'Deve atualizar dataFollowUp');
    assert.equal(opp.historicoFollowUp.length, 1);
    assert.equal(opp.historicoFollowUp[0].resultado, 'contatado');
    assert.equal(opp.historicoFollowUp[0].canal, 'whatsapp');

    // 2. Arquivamento por perda
    const resPerda = opportunityConversionService.registrarFollowUpOportunidade({
      tenantId,
      state,
      oportunidadeId: 'opp_futura',
      responsavel: 'Carlos Comercial',
      canal: 'telefone',
      resultado: 'perdida',
      observacao: 'Caminhão foi vendido e não pertence mais à frota'
    });

    assert.equal(resPerda.ok, true);
    const oppPerdida = state.opportunities.find(o => o.id === 'opp_futura');
    assert.equal(oppPerdida.status, 'arquivada', 'Deve arquivar oportunidade quando perdida');
  });

  test('2.1: Deve converter oportunidade totalmente em nova OS com reserva atômica e bloquear dupla conversão', () => {
    const state = criarEstadoMock();

    const resConv = opportunityConversionService.converterOportunidadeEmOS({
      tenantId,
      state,
      oportunidadeId: 'opp_hoje',
      opcoes: {
        centroCustoId: 'cc_sul_graos'
      },
      actorId: 'consultor_frotas'
    });

    assert.equal(resConv.ok, true);
    assert.ok(resConv.novaOS);
    assert.equal(resConv.novaOS.centroCustoId, 'cc_sul_graos');
    assert.equal(resConv.novaOS.origemOportunidadeId, 'opp_hoje');
    assert.equal(resConv.novaOS.pecas.length, 1);
    assert.equal(resConv.novaOS.pecas[0].status, 'reservada');

    // Reserva atômica deve estar registrada em state.partReservations
    const resPeca = state.partReservations.find(r => r.partId === 'peca_bucha_1' && r.osId === resConv.novaOS.id);
    assert.ok(resPeca, 'Reserva de peça deve ser gerada');
    assert.equal(resPeca.quantity, 2);

    // Oportunidade deve estar marcada como convertida
    const opp = state.opportunities.find(o => o.id === 'opp_hoje');
    assert.equal(opp.status, 'convertida');
    assert.equal(opp.osGeradaId, resConv.novaOS.id);

    // Tentativa de converter novamente deve falhar
    assert.throws(() => {
      opportunityConversionService.converterOportunidadeEmOS({
        tenantId,
        state,
        oportunidadeId: 'opp_hoje'
      });
    }, /OPPORTUNITY_ALREADY_CONVERTED|já foi convertida/i);
  });

  test('2.2: Deve converter parcialmente a oportunidade em OS mantendo itens pendentes', () => {
    const state = criarEstadoMock();

    // opp_vencida possui 2 itens: item_s1 (servico) e item_p1 (peca)
    const resConvParcial = opportunityConversionService.converterOportunidadeEmOS({
      tenantId,
      state,
      oportunidadeId: 'opp_vencida',
      opcoes: {
        itensSelecionadosIds: ['item_s1']
      }
    });

    assert.equal(resConvParcial.ok, true);
    assert.equal(resConvParcial.novaOS.servicos.length, 1);
    assert.equal(resConvParcial.novaOS.pecas.length, 0);

    // Oportunidade deve reter o item remanescente item_p1
    const opp = state.opportunities.find(o => o.id === 'opp_vencida');
    assert.notEqual(opp.status, 'convertida');
    assert.equal(opp.itensAdiados.length, 1);
    assert.equal(opp.itensAdiados[0].id, 'item_p1');
    assert.equal(opp.valorTotalEstimado, 360.00);
  });

  test('2.3: Deve abortar com INSUFFICIENT_STOCK e não criar OS caso peça não possua saldo disponível', () => {
    const state = criarEstadoMock();

    // Define saldo físico da peça como 1, mas opp_vencida solicita 2
    state.pecas.find(p => p.id === 'peca_pino_1').qtd = 1;

    const totalOSAntes = state.os.length;
    const totalReservasAntes = state.partReservations.length;

    assert.throws(() => {
      opportunityConversionService.converterOportunidadeEmOS({
        tenantId,
        state,
        oportunidadeId: 'opp_vencida'
      });
    }, /INSUFFICIENT_STOCK|Saldo disponível insuficiente/i);

    // Estado deve permanecer limpo (rollback atômico)
    assert.equal(state.os.length, totalOSAntes, 'Nenhuma OS deve ser criada');
    assert.equal(state.partReservations.length, totalReservasAntes, 'Nenhuma reserva parcial deve ser retida');
  });

  test('3.1: Deve configurar limite mensal por Centro de Custo e calcular consumo analítico (faturado vs. comprometido)', () => {
    const state = criarEstadoMock();

    // 1. Cadastra Centro de Custo
    const cadCC = fleetCostCenterService.cadastrarCentroCusto({
      tenantId,
      state,
      clienteId: 'cli_transp_sul',
      nome: 'Operação Sul Grãos',
      codigo: 'CC-SUL-GRAOS'
    });
    const ccId = cadCC.centroCusto.id;

    // 2. Define limite orçamentário
    const resOrc = fleetCostCenterService.definirOrcamentoCentroCusto({
      tenantId,
      state,
      centroCustoId: ccId,
      limiteMensal: 10000.00,
      alertaPercentual: 80,
      bloquearEstouro: true
    });
    assert.equal(resOrc.ok, true);
    assert.equal(resOrc.centroCusto.limiteMensal, 10000);
    assert.equal(resOrc.centroCusto.bloquearEstouro, true);

    // 3. Simula OSs na competência '2026-11'
    state.os = [
      {
        id: 'os_fat_1',
        num: 3001,
        tenantId,
        centroCustoId: ccId,
        st: 'finalizada',
        fechamento: '2026-11-03',
        total: 5000.00
      },
      {
        id: 'os_and_1',
        num: 3002,
        tenantId,
        centroCustoId: ccId,
        st: 'executando',
        abertura: '2026-11-08',
        total: 3500.00
      }
    ];

    const consumo = fleetCostCenterService.calcularConsumoOrcamentoCentroCusto({
      state,
      tenantId,
      centroCustoId: ccId,
      competencia: '2026-11'
    });

    assert.equal(consumo.ok, true);
    assert.equal(consumo.valorFaturado, 5000);
    assert.equal(consumo.valorComprometido, 3500);
    assert.equal(consumo.consumoTotal, 8500);
    assert.equal(consumo.saldoDisponivel, 1500);
    assert.equal(consumo.percentualUtilizado, 85);
    assert.equal(consumo.statusOrcamento, 'alerta', '85% está acima do alerta de 80%');
  });

  test('3.2: Deve bloquear conversão com COST_CENTER_BUDGET_EXCEEDED quando limite mensal for estourado e permitir override', () => {
    const state = criarEstadoMock();

    const cadCC = fleetCostCenterService.cadastrarCentroCusto({
      tenantId,
      state,
      clienteId: 'cli_transp_sul',
      nome: 'Operação Sul Frigo',
      codigo: 'CC-FRIGO'
    });
    const ccId = cadCC.centroCusto.id;

    fleetCostCenterService.definirOrcamentoCentroCusto({
      tenantId,
      state,
      centroCustoId: ccId,
      limiteMensal: 600.00,
      bloquearEstouro: true
    });

    // opp_vencida possui valor de 710.00 (> limite de 600.00)
    // 1. Rejeição com erro de alçada
    assert.throws(() => {
      opportunityConversionService.converterOportunidadeEmOS({
        tenantId,
        state,
        oportunidadeId: 'opp_vencida',
        opcoes: {
          centroCustoId: ccId
        }
      });
    }, /COST_CENTER_BUDGET_EXCEEDED|seria excedido/i);

    // 2. Com override autorizado (autorizarEstouroAlcada: true) deve converter anexando alerta
    const resOverride = opportunityConversionService.converterOportunidadeEmOS({
      tenantId,
      state,
      oportunidadeId: 'opp_vencida',
      opcoes: {
        centroCustoId: ccId,
        autorizarEstouroAlcada: true
      }
    });

    assert.equal(resOverride.ok, true);
    assert.ok(resOverride.alertaOrcamentoCentroCusto);
    assert.equal(resOverride.alertaOrcamentoCentroCusto.status, 'estourado');
  });

  test('4.1: Endpoints REST (Fila Follow-up, Registro Follow-up, Budget CC e Conversão em OS)', async () => {
    const { initDB } = require('../db');
    await initDB();

    const express = require('express');
    const http = require('http');
    const { mountRoutes } = require('../routes/index.js');
    const { getDefaultState, persistState } = require('../lib/repository/stateRepository');

    const app = express();
    app.use(express.json());

    const apiTenantId = 'tenant_http_sprint52';
    const mockState = {
      ...getDefaultState(apiTenantId),
      clientes: [
        {
          id: 'cli_http_52',
          nome: 'Expresso Rodo Sul Ltda',
          doc: '11.222.333/0001-44',
          tenantId: apiTenantId,
          centrosCusto: [
            {
              id: 'cc_http_sul',
              tenantId: apiTenantId,
              clienteId: 'cli_http_52',
              nome: 'Frota Frigo Sul',
              codigo: 'CC-FRIGO-SUL',
              limiteMensal: 5000.00,
              alertaPercentual: 80,
              bloquearEstouro: true
            }
          ]
        }
      ],
      costCenters: [
        {
          id: 'cc_http_sul',
          tenantId: apiTenantId,
          clienteId: 'cli_http_52',
          nome: 'Frota Frigo Sul',
          codigo: 'CC-FRIGO-SUL',
          limiteMensal: 5000.00,
          alertaPercentual: 80,
          bloquearEstouro: true
        }
      ],
      veiculos: [
        { id: 'vei_http_52', placa: 'SUL5252', modelo: 'Volvo FH 540', cli: 'cli_http_52', tenantId: apiTenantId }
      ],
      pecas: [
        { id: 'peca_mola_52', tenantId: apiTenantId, nome: 'Feixe de Mola 12 Lâminas', qtd: 5, preco: 1200.00 }
      ],
      os: [
        {
          id: 'os_base_52',
          num: 5200,
          tenantId: apiTenantId,
          cli: 'cli_http_52',
          st: 'finalizada',
          fechamento: new Date().toISOString(),
          centroCustoId: 'cc_http_sul',
          total: 2000.00
        }
      ],
      opportunities: [
        {
          id: 'opp_http_52',
          tenantId: apiTenantId,
          tipo: 'demanda_reprimida_orcamento',
          status: 'aberta',
          clienteId: 'cli_http_52',
          clienteNome: 'Expresso Rodo Sul Ltda',
          placa: 'SUL5252',
          origemOSId: 'os_base_52',
          origemOSNum: 5200,
          criticidadeMaxima: 'alta',
          dataFollowUp: '2026-11-01',
          valorTotalEstimado: 1200.00,
          itensAdiados: [
            { id: 'it_mola', tipo: 'peca', nome: 'Feixe de Mola', partId: 'peca_mola_52', qtd: 1, valor: 1200.00, criticidade: 'alta' }
          ]
        }
      ],
      partReservations: [],
      inventoryMovements: []
    };

    await persistState(apiTenantId, mockState);

    app.use((req, res, next) => {
      req.securityContext = {
        tenantId: apiTenantId,
        actorId: 'gestor_sprint52',
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
      // 1. GET /api/crm/oportunidades-adiadas/fila-followup
      const resFila = await fetch(`${baseUrl}/api/crm/oportunidades-adiadas/fila-followup?statusFollowUp=vencida`);
      const dataFila = await resFila.json();
      assert.equal(resFila.status, 200);
      assert.equal(dataFila.success, true);
      assert.ok(dataFila.total >= 1);
      assert.equal(dataFila.fila[0].id, 'opp_http_52');

      // 2. POST /api/crm/oportunidades-adiadas/:id/follow-up
      const resFollow = await fetch(`${baseUrl}/api/crm/oportunidades-adiadas/opp_http_52/follow-up`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          canal: 'whatsapp',
          resultado: 'reagendado',
          observacao: 'Frotista solicitou novo contato após fechamento da quinzena',
          dataProximoContato: '2026-11-18'
        })
      });
      const dataFollow = await resFollow.json();
      assert.equal(resFollow.status, 200);
      assert.equal(dataFollow.success, true);
      assert.equal(dataFollow.oportunidade.dataFollowUp, '2026-11-18');

      // 3. PATCH /api/clientes/:id/centros-custo/:ccId/orcamento
      const resBudget = await fetch(`${baseUrl}/api/clientes/cli_http_52/centros-custo/cc_http_sul/orcamento`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          limiteMensal: 6000.00,
          alertaPercentual: 75,
          bloquearEstouro: true
        })
      });
      const dataBudget = await resBudget.json();
      assert.equal(resBudget.status, 200);
      assert.equal(dataBudget.success, true);
      assert.equal(dataBudget.centroCusto.limiteMensal, 6000.00);

      // 4. GET /api/clientes/:id/centros-custo/:ccId/consumo
      const resConsumo = await fetch(`${baseUrl}/api/clientes/cli_http_52/centros-custo/cc_http_sul/consumo`);
      const dataConsumo = await resConsumo.json();
      assert.equal(resConsumo.status, 200);
      assert.equal(dataConsumo.success, true);
      assert.equal(dataConsumo.consumo.valorFaturado, 2000.00);
      assert.equal(dataConsumo.consumo.saldoDisponivel, 4000.00);

      // 5. POST /api/crm/oportunidades-adiadas/:id/converter-os
      const resConv = await fetch(`${baseUrl}/api/crm/oportunidades-adiadas/opp_http_52/converter-os`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          centroCustoId: 'cc_http_sul'
        })
      });
      const dataConv = await resConv.json();
      assert.equal(resConv.status, 200);
      assert.equal(dataConv.success, true);
      assert.ok(dataConv.novaOS);
      assert.equal(dataConv.novaOS.centroCustoId, 'cc_http_sul');
      assert.equal(dataConv.novaOS.origemOportunidadeId, 'opp_http_52');
      assert.equal(dataConv.novaOS.pecas.length, 1);
    } finally {
      await new Promise(resolve => server.close(resolve));
    }
  });

  test('5.1: Componentes de UI de Conversão de Demanda e Follow-up (renderFilaFollowUpHtml, modalConverterOportunidadeHtml, modalRegistrarFollowUpHtml)', () => {
    const fs = require('fs');
    const vm = require('vm');
    const path = require('path');

    const uiPath = path.resolve(__dirname, '../js/modules/crm_conversao_oportunidades_ui.js');
    assert.ok(fs.existsSync(uiPath), 'crm_conversao_oportunidades_ui.js deve existir');

    const ctx = {
      window: {},
      document: {
        querySelectorAll: () => [],
        getElementById: () => null
      },
      S: { os: [], clientes: [], costCenters: [], opportunities: [] },
      fecharModalGenerico: () => {},
      abrirModalGenerico: () => {},
      torrar: () => {},
      fetch: () => {}
    };
    ctx.globalThis = ctx;
    ctx.window = ctx;

    const code = fs.readFileSync(uiPath, 'utf8');
    vm.runInNewContext(code, ctx);

    // Valida exports
    assert.equal(typeof ctx.renderFilaFollowUpHtml, 'function');
    assert.equal(typeof ctx.modalConverterOportunidadeHtml, 'function');
    assert.equal(typeof ctx.modalRegistrarFollowUpHtml, 'function');
    assert.equal(typeof ctx.abrirModalConverterOportunidade, 'function');
    assert.equal(typeof ctx.confirmarConversaoOportunidade, 'function');
    assert.equal(typeof ctx.abrirModalRegistrarFollowUp, 'function');
    assert.equal(typeof ctx.confirmarRegistroFollowUp, 'function');
    assert.equal(typeof ctx.salvarOrcamentoCentroCusto, 'function');

    // 1. Renderiza fila de follow-up
    const mockFila = [
      {
        id: 'opp_ui_1',
        clienteNome: 'Transportes Rápido',
        placa: 'RAP1010',
        valorTotalEstimado: 1500.00,
        origemOSNum: 3001,
        criticidadeMaxima: 'alta',
        statusFollowUp: 'vencida',
        dataFollowUp: '2026-11-01',
        itensAdiados: [{ id: 'it_1', nome: 'Mola Mestra', tipo: 'peca', valor: 800 }]
      }
    ];
    const htmlFila = ctx.renderFilaFollowUpHtml(mockFila, { vencidas: 1, hoje: 0 });
    assert.ok(htmlFila.includes('Transportes Rápido'));
    assert.ok(htmlFila.includes('RAP1010'));
    assert.ok(htmlFila.includes('Vencida'));
    assert.ok(htmlFila.includes('data-act="abrir-modal-converter-oportunidade"'));
    assert.ok(htmlFila.includes('data-act="abrir-modal-followup-oportunidade"'));

    // 2. Renderiza modal de conversão com Centro de Custo e Orçamento
    const htmlConv = ctx.modalConverterOportunidadeHtml(
      mockFila[0],
      [{ id: 'cc_1', nome: 'Frota Pesada', codigo: 'CC-PESADA' }],
      { limiteMensal: 1000, consumoTotal: 1200, saldoDisponivel: 0, percentualUtilizado: 120 }
    );
    assert.ok(htmlConv.includes('Converter Oportunidade em Nova OS'));
    assert.ok(htmlConv.includes('CC-PESADA'));
    assert.ok(htmlConv.includes('Mola Mestra'));
    assert.ok(htmlConv.includes('Autorizar estouro de alçada'));
    assert.ok(htmlConv.includes('data-act="confirmar-conversao-oportunidade"'));

    // 3. Renderiza modal de registro de follow-up
    const htmlFol = ctx.modalRegistrarFollowUpHtml(mockFila[0]);
    assert.ok(htmlFol.includes('Registrar Contato de Follow-up'));
    assert.ok(htmlFol.includes('sel-follow-canal'));
    assert.ok(htmlFol.includes('sel-follow-resultado'));
    assert.ok(htmlFol.includes('data-act="confirmar-followup-oportunidade"'));
  });
});
