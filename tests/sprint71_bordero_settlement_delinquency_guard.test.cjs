'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const fleetBorderoSettlementService = require('../services/billing/fleetBorderoSettlementService');
const mechanicProductivityCommissionService = require('../services/patio/mechanicProductivityCommissionService');

function criarEstadoMock() {
  return {
    os: [
      {
        id: 'os_b2b_1',
        num: 7101,
        tenantId: 'tenant_b2b_71',
        cli: 'cli_transp_alfa',
        clienteId: 'cli_transp_alfa',
        clienteNome: 'Transportadora Alfa Log',
        placa: 'ALF4A01',
        st: 'finalizada',
        total: 1000.00,
        valorTotal: 1000.00,
        servicos: [{ id: 'srv_mola_1', desc: 'Feixe de Molas', valor: 1000.00, status: 'aprovado' }],
        pecas: [],
        pago: false,
        statusPagamento: 'pendente'
      },
      {
        id: 'os_b2b_2',
        num: 7102,
        tenantId: 'tenant_b2b_71',
        cli: 'cli_transp_alfa',
        clienteId: 'cli_transp_alfa',
        clienteNome: 'Transportadora Alfa Log',
        placa: 'ALF4A02',
        st: 'finalizada',
        total: 1500.00,
        valorTotal: 1500.00,
        servicos: [{ id: 'srv_mola_2', desc: 'Embuchamento e Pinos', valor: 1500.00, status: 'aprovado' }],
        pecas: [],
        pago: false,
        statusPagamento: 'pendente'
      }
    ],
    borderos: [
      {
        id: 'bord_alfa_001',
        num: 'BORD-0001',
        tenantId: 'tenant_b2b_71',
        clienteId: 'cli_transp_alfa',
        clienteNome: 'Transportadora Alfa Log',
        status: 'faturado',
        valorTotal: 2500.00,
        totais: { totalLiquido: 2500.00 },
        saldoDevedor: 2500.00,
        valorPagoAcumulado: 0,
        osIds: ['os_b2b_1', 'os_b2b_2'],
        contasIds: ['cta_rec_001'],
        dataVencimento: '2026-11-20'
      }
    ],
    contas: [
      {
        id: 'cta_rec_001',
        tenantId: 'tenant_b2b_71',
        tipo: 'receber',
        borderoId: 'bord_alfa_001',
        valor: 2500.00,
        pago: false,
        status: 'aberto'
      }
    ],
    timeLogs: [
      {
        id: 'log_mecanico_1',
        tenantId: 'tenant_b2b_71',
        osId: 'os_b2b_1',
        servicoId: 'srv_mola_1',
        mecanicoId: 'mec_roberto_1',
        mecanicoNome: 'Roberto Molas',
        status: 'concluido',
        valorServico: 1000.00,
        horasVendidas: 5,
        horasTrabalhadas: 4,
        concluidoEm: '2026-11-05T10:00:00.000Z'
      }
    ],
    mechanicCommissionRules: [
      {
        id: 'reg_com_1',
        tenantId: 'tenant_b2b_71',
        mecanicoId: 'mec_roberto_1',
        percentualBase: 10,
        bonusEficienciaPercentual: 0,
        modalidadeGatilho: 'os_recebida' // <- Só libera quando a OS estiver paga!
      }
    ],
    fleetCreditPolicies: [],
    creditOverrideLogs: [],
    borderoSettlements: [],
    auditoria: []
  };
}

describe('Sprint 7.1 — Conciliação de Borderôs B2B, Cascata em OS/Comissões & Trava de Inadimplência', () => {
  const tenantId = 'tenant_b2b_71';

  test('1.1: Liquidação integral de Borderô B2B com baixa em cascata nas OSs filhas e contas a receber', () => {
    const state = criarEstadoMock();

    const resLiq = fleetBorderoSettlementService.liquidarBorderoB2B(state, 'bord_alfa_001', {
      tenantId,
      valorRecebido: 2500.00,
      formaPagamento: 'pix_b2b',
      dataPagamento: '2026-11-10T14:00:00.000Z',
      responsavel: 'Financeiro Central'
    });

    assert.equal(resLiq.ok, true);
    assert.equal(resLiq.bordero.status, 'pago');
    assert.equal(resLiq.bordero.saldoDevedor, 0);
    assert.equal(resLiq.bordero.valorPagoAcumulado, 2500.00);

    // Baixa em cascata em todas as OSs filhas
    const os1 = state.os.find(o => o.id === 'os_b2b_1');
    const os2 = state.os.find(o => o.id === 'os_b2b_2');
    assert.equal(os1.pago, true);
    assert.equal(os1.statusPagamento, 'pago');
    assert.equal(os1.borderoLiquidadoId, 'bord_alfa_001');
    assert.equal(os2.pago, true);
    assert.equal(os2.statusPagamento, 'pago');

    // Sincronização em contas a receber
    const conta = state.contas.find(c => c.id === 'cta_rec_001');
    assert.equal(conta.pago, true);
    assert.equal(conta.status, 'pago');
    assert.equal(conta.valorPago, 2500.00);

    // Tentativa de liquidar novamente deve lançar BORDERO_ALREADY_SETTLED
    assert.throws(() => {
      fleetBorderoSettlementService.liquidarBorderoB2B(state, 'bord_alfa_001', {
        tenantId,
        valorRecebido: 500.00
      });
    }, /BORDERO_ALREADY_SETTLED/i);
  });

  test('1.2: Integração Ponta a Ponta: Quitação de borderô destrava comissão retida no gatilho os_recebida', () => {
    const state = criarEstadoMock();

    // 1. Antes da liquidação: OS não está paga, então comissão fica RETIDA
    const antes = mechanicProductivityCommissionService.calcularProdutividadeEComissaoMecanico(state, {
      tenantId,
      mecanicoId: 'mec_roberto_1',
      competencia: '2026-11'
    });

    assert.equal(antes.baseComissionavelRetida, 1000.00);
    assert.equal(antes.valorComissaoRetida, 100.00);
    assert.equal(antes.valorComissaoTotalLiberada, 0);

    // 2. Executa a liquidação do borderô
    fleetBorderoSettlementService.liquidarBorderoB2B(state, 'bord_alfa_001', {
      tenantId,
      valorRecebido: 2500.00,
      formaPagamento: 'ted'
    });

    // 3. Após liquidação do borderô: OS baixada para pago=true -> Comissão passa a ser LIBERADA!
    const depois = mechanicProductivityCommissionService.calcularProdutividadeEComissaoMecanico(state, {
      tenantId,
      mecanicoId: 'mec_roberto_1',
      competencia: '2026-11'
    });

    assert.equal(depois.baseComissionavelLiberada, 1000.00);
    assert.equal(depois.valorComissaoTotalLiberada, 100.00);
    assert.equal(depois.baseComissionavelRetida, 0);
    assert.equal(depois.valorComissaoRetida, 0);
  });

  test('1.3: Liquidação parcial cronológica de borderô e estorno auditado', () => {
    const state = criarEstadoMock();

    // Pagamento parcial de R$ 1.000,00 (cobre integralmente a OS 1 de R$ 1.000, mas não a OS 2 de R$ 1.500)
    const resParcial = fleetBorderoSettlementService.liquidarBorderoB2B(state, 'bord_alfa_001', {
      tenantId,
      valorRecebido: 1000.00,
      formaPagamento: 'boleto'
    });

    assert.equal(resParcial.ok, true);
    assert.equal(resParcial.bordero.status, 'parcialmente_pago');
    assert.equal(resParcial.bordero.saldoDevedor, 1500.00);

    // OS 1 coberta pelo saldo pago -> quitada
    const os1 = state.os.find(o => o.id === 'os_b2b_1');
    assert.equal(os1.pago, true);
    assert.equal(os1.statusPagamento, 'pago');

    // OS 2 ainda não coberta -> pendente
    const os2 = state.os.find(o => o.id === 'os_b2b_2');
    assert.equal(os2.pago, false);
    assert.equal(os2.statusPagamento, 'pendente');

    // Estorno da liquidação
    const resEstorno = fleetBorderoSettlementService.estornarLiquidacaoBorderoB2B(state, 'bord_alfa_001', {
      tenantId,
      motivo: 'Estorno por devolução de TED'
    });

    assert.equal(resEstorno.ok, true);
    assert.equal(state.borderos[0].status, 'faturado');
    assert.equal(state.borderos[0].saldoDevedor, 2500.00);
    assert.equal(os1.pago, false);
    assert.equal(os1.statusPagamento, 'pendente');
  });

  test('2.1: Configuração de política de crédito e avaliação de risco (tolerância vs bloqueio)', () => {
    const fleetDelinquencyGuardService = require('../services/billing/fleetDelinquencyGuardService');
    const state = criarEstadoMock();

    // Configura política de crédito: limite R$ 10.000, 5 dias tolerância
    const pol = fleetDelinquencyGuardService.configurarPoliticaCreditoFrotista(state, 'cli_transp_alfa', {
      tenantId,
      limiteCredito: 10000.00,
      diasToleranciaAtraso: 5,
      bloqueioAutomatico: true
    });
    assert.equal(pol.limiteCredito, 10000.00);
    assert.equal(pol.diasToleranciaAtraso, 5);

    // Caso A: Em dia (dataRef = data vencimento)
    const riscoEmDia = fleetDelinquencyGuardService.avaliarRiscoInadimplenciaFrotista(state, 'cli_transp_alfa', {
      tenantId,
      dataReferencia: '2026-11-20T12:00:00Z'
    });
    assert.equal(riscoEmDia.statusRisco, 'regular');
    assert.equal(riscoEmDia.aprovadoParaNovosServicos, true);

    // Caso B: Atraso de 3 dias (dentro da tolerância de 5 dias)
    const riscoTolerancia = fleetDelinquencyGuardService.avaliarRiscoInadimplenciaFrotista(state, 'cli_transp_alfa', {
      tenantId,
      dataReferencia: '2026-11-23T12:00:00Z'
    });
    assert.equal(riscoTolerancia.statusRisco, 'atencao_atraso_tolerancia');
    assert.equal(riscoTolerancia.aprovadoParaNovosServicos, true);

    // Caso C: Atraso de 8 dias (> tolerância de 5 dias) -> BLOQUEADO
    const riscoBloqueado = fleetDelinquencyGuardService.avaliarRiscoInadimplenciaFrotista(state, 'cli_transp_alfa', {
      tenantId,
      dataReferencia: '2026-11-28T12:00:00Z'
    });
    assert.equal(riscoBloqueado.statusRisco, 'bloqueado_inadimplencia');
    assert.equal(riscoBloqueado.aprovadoParaNovosServicos, false);
    assert.ok(riscoBloqueado.diasMaiorAtraso >= 8);
  });

  test('2.2: Trava de crédito frotista com recusa e override gerencial auditado', () => {
    const fleetDelinquencyGuardService = require('../services/billing/fleetDelinquencyGuardService');
    const state = criarEstadoMock();

    fleetDelinquencyGuardService.configurarPoliticaCreditoFrotista(state, 'cli_transp_alfa', {
      tenantId,
      limiteCredito: 3000.00, // Saldo devedor atual é 2500
      diasToleranciaAtraso: 5,
      bloqueioAutomatico: true
    });

    // Tentativa 1: Novo serviço de R$ 1.000 ultrapassa limite (2500 + 1000 > 3000) -> BLOQUEIO
    assert.throws(
      () => fleetDelinquencyGuardService.validarTravaInadimplenciaFrotista(state, 'cli_transp_alfa', {
        tenantId,
        valorNovoServico: 1000.00,
        dataReferencia: '2026-11-10T12:00:00Z'
      }),
      (err) => err.code === 'FLEET_DELINQUENCY_CREDIT_BLOCKED' || err.message.includes('restrição de crédito')
    );

    // Tentativa 2: Com Override Gerencial auditado
    const aprovacaoOverride = fleetDelinquencyGuardService.validarTravaInadimplenciaFrotista(state, 'cli_transp_alfa', {
      tenantId,
      valorNovoServico: 1000.00,
      dataReferencia: '2026-11-10T12:00:00Z',
      permitirOverride: true,
      motivoLiberacao: 'Autorizado pelo Diretor Comercial para carga prioritária',
      usuarioLiberacao: 'diretor_carlos'
    });

    assert.equal(aprovacaoOverride.liberado, true);
    assert.equal(aprovacaoOverride.override, true);
    assert.ok(state.creditOverrideLogs && state.creditOverrideLogs.length > 0);
    assert.equal(state.creditOverrideLogs[0].usuarioLiberacao, 'diretor_carlos');
    assert.equal(state.creditOverrideLogs[0].motivoLiberacao, 'Autorizado pelo Diretor Comercial para carga prioritária');
  });
});
