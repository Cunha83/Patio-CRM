'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const heavyPartsPurchaseOrderService = require('../services/inventory/heavyPartsPurchaseOrderService');

function criarEstadoBase() {
  return {
    tenantId: 'tenant_sprint72',
    pecas: [{ id: 'peca_mola_1', codigo: 'MOL-001', descricao: 'Lâmina Mestra Scania R450', qtd: 2, custoMedio: 100, custo: 100, ultimoCustoCompra: 100, precoVenda: 250 }],
    os: [{ id: 'os_pesada_100', num: 7201, tenantId: 'tenant_sprint72', st: 'em_andamento', boxAtualId: 'box_pesado_1', pecas: [{ id: 'item_os_peca_1', pecaId: 'peca_mola_1', descricao: 'Lâmina Mestra Scania R450', qtd: 3, valor: 250, custo: 100, total: 750 }] }],
    patioBoxes: [{ id: 'box_pesado_1', nome: 'Box 01 - Suspensão Pesada', status: 'bloqueado_gargalo', osAtualId: 'os_pesada_100', gargaloAtivoId: 'gar_peca_100' }],
    patioBottlenecks: [{ id: 'gar_peca_100', osId: 'os_pesada_100', boxId: 'box_pesado_1', motivoParada: 'aguardando_peca', status: 'aberto', inicioParadaEm: '2026-11-10T10:00:00Z', slaMaximoMinutos: 120 }],
    partReservations: [],
    inventoryMovements: [],
    contas: [],
    purchaseOrders: []
  };
}

test('Sprint 7.2 — Task 1: Motor de Compras Pesadas, CMP e Destravamento de Box', async (t) => {
  await t.test('1.1: Criar Pedido de Compra de Peças com validações e totais', () => {
    const state = criarEstadoBase();
    const pedidoRes = heavyPartsPurchaseOrderService.criarPedidoCompraPecas(state, {
      tenantId: 'tenant_sprint72',
      fornecedorNome: 'Molas Brasil Distribuidora',
      fornecedorDocumento: '12.345.678/0001-90',
      osVinculadaId: 'os_pesada_100',
      gargaloVinculadoId: 'gar_peca_100',
      condicaoPagamentoParcelas: 2,
      primeiroVencimento: '2026-12-10',
      responsavel: 'comprador_marcos',
      itens: [
        {
          pecaId: 'peca_mola_1',
          codigo: 'MOL-001',
          descricao: 'Lâmina Mestra Scania R450',
          quantidade: 3,
          custoUnitario: 150.00
        }
      ]
    });

    assert.equal(pedidoRes.ok, true);
    assert.ok(pedidoRes.pedido.id);
    assert.equal(pedidoRes.pedido.valorTotalPedido, 450.00);
    assert.equal(pedidoRes.pedido.status, 'aguardando_entrega');
    assert.equal(state.purchaseOrders.length, 1);
  });

  await t.test('1.2: Recebimento de NF, Recálculo do CMP, Contas a Pagar e Destravamento de Box', () => {
    const state = criarEstadoBase();
    const pedidoRes = heavyPartsPurchaseOrderService.criarPedidoCompraPecas(state, {
      tenantId: 'tenant_sprint72',
      fornecedorNome: 'Molas Brasil Distribuidora',
      osVinculadaId: 'os_pesada_100',
      gargaloVinculadoId: 'gar_peca_100',
      condicaoPagamentoParcelas: 2,
      primeiroVencimento: '2026-12-10',
      itens: [
        {
          pecaId: 'peca_mola_1',
          codigo: 'MOL-001',
          descricao: 'Lâmina Mestra Scania R450',
          quantidade: 3,
          custoUnitario: 150.00
        }
      ]
    });

    const nfRes = heavyPartsPurchaseOrderService.receberNotaFiscalCompraPecas(state, pedidoRes.pedido.id, {
      numeroNF: 'NF-89211',
      chaveAcessoNF: '35261112345678000190550010000892111000892114',
      dataRecebimento: '2026-11-10T14:30:00Z',
      reservarAutomaticamenteParaOS: true,
      responsavel: 'estoquista_joao'
    });

    assert.equal(nfRes.ok, true);
    assert.equal(state.purchaseOrders[0].status, 'recebido');

    // 1. CMP: Anterior = 2 un @ 100.00 (200). Nova entrada = 3 un @ 150.00 (450). Total = 650 / 5 = 130.00
    const peca = state.pecas.find(p => p.id === 'peca_mola_1');
    assert.equal(peca.qtd, 5);
    assert.equal(peca.custoMedio, 130.00);
    assert.equal(peca.ultimoCustoCompra, 150.00);

    // 2. Contas a Pagar: 2 parcelas de 225.00
    const contasPagar = state.contas.filter(c => c.pedidoCompraId === pedidoRes.pedido.id);
    assert.equal(contasPagar.length, 2);
    assert.equal(contasPagar[0].valor, 225.00);
    assert.equal(contasPagar[0].tipo, 'pagar');
    assert.equal(contasPagar[0].cat, 'fornecedor_pecas');
    assert.equal(contasPagar[0].status, 'pendente');

    // 3. Reserva Automática na OS vinculada
    const reservas = state.partReservations.filter(r => r.osId === 'os_pesada_100');
    assert.equal(reservas.length, 1);
    assert.equal(reservas[0].quantity, 3);
    assert.equal(reservas[0].status, 'ativa');

    // 4. Destravamento do Gargalo e Box Pesado
    const gargalo = state.patioBottlenecks.find(g => g.id === 'gar_peca_100');
    assert.equal(gargalo.status, 'encerrado');
    const box = state.patioBoxes.find(b => b.id === 'box_pesado_1');
    assert.equal(box.status, 'ocupado'); // Retoma ocupado com a OS
    assert.equal(box.gargaloAtivoId, null);

    // 5. Tentativa de receber novamente deve lançar 409
    assert.throws(
      () => heavyPartsPurchaseOrderService.receberNotaFiscalCompraPecas(state, pedidoRes.pedido.id, { numeroNF: 'NF-89211' }),
      (err) => err.code === 'PURCHASE_ORDER_ALREADY_RECEIVED'
    );
  });

  await t.test('1.3: Cálculo de Margem Real de Peças da OS (CMP vs Venda)', () => {
    const state = criarEstadoBase();
    // Atualiza CMP para 130.00 na peça
    state.pecas[0].custoMedio = 130.00;

    // Na OS 7201: 3 unidades vendidas a R$ 250,00 cada = R$ 750,00 de receita
    // Custo CMP = 3 * 130.00 = R$ 390,00
    // Lucro bruto = 750.00 - 390.00 = 360.00
    // Margem bruta % = (360.00 / 750.00) * 100 = 48.00%
    const margem = heavyPartsPurchaseOrderService.calcularMargemRealOSPecas(state, 'os_pesada_100');
    assert.equal(margem.receitaPecasTotal, 750.00);
    assert.equal(margem.custoPecasCMPTotal, 390.00);
    assert.equal(margem.lucroBrutoPecas, 360.00);
    assert.equal(margem.margemBrutaPercentual, 48.00);
  });
});

test('Sprint 7.2 — Task 2: Motor de Conciliação Bancária Multi-Formato (PDF, OFX/CNAB, API)', async (t) => {
  const bankStatementReconciliationService = require('../services/finance/bankStatementReconciliationService');

  function criarEstadoConciliacao() {
    return {
      tenantId: 'tenant_sprint72',
      borderos: [{ id: 'bord_7201', num: 'BORD-7201', tenantId: 'tenant_sprint72', clienteId: 'cli_transp_alfa', clienteNome: 'Alfa Transportes Cargas', status: 'faturado', valorTotal: 2500, saldoDevedor: 2500, valorPagoAcumulado: 0, osIds: ['os_b2b_72'], dataVencimento: '2026-11-20' }],
      os: [{ id: 'os_b2b_72', num: 7202, tenantId: 'tenant_sprint72', cli: 'cli_transp_alfa', total: 2500, pago: false, statusPagamento: 'pendente' }],
      contas: [{ id: 'cta_pag_fornec_1', tenantId: 'tenant_sprint72', tipo: 'pagar', cat: 'fornecedor_pecas', descricao: 'NF 89211 - Molas Brasil', fornecedor: 'Molas Brasil Distribuidora', numeroNF: '89211', valor: 450, status: 'pendente' }],
      bankReconciliations: []
    };
  }

  await t.test('2.1: Conciliação via PDF Texto e OFX/CNAB baixando Borderô B2B e Contas a Pagar', () => {
    const state = criarEstadoConciliacao();

    // 1. Simula extrato PDF com 1 crédito de Borderô e 1 débito de fornecedor
    const pdfRaw = `
      EXTRATO DE CONTA CORRENTE BANCO ITAU
      Data: 10/11/2026
      10/11/2026 PIX RECEBIDO - BORD-7201 ALFA TRANSPORTES + 2.500,00
      10/11/2026 PAGTO BOLETO - NF 89211 MOLAS BRASIL - 450,00
      10/11/2026 TARIFA BANCARIA PACOTE MENSAL - 89,90
    `;

    const resPdf = bankStatementReconciliationService.conciliarExtratoBancarioAutomatico(state, {
      formato: 'pdf_texto',
      conteudoRaw: pdfRaw,
      responsavel: 'analista_bancario'
    });

    assert.equal(resPdf.totalTransacoes, 3);
    assert.equal(resPdf.conciliadasAutomaticamenteCount, 2);
    assert.equal(resPdf.borderosLiquidadosIds.length, 1);
    assert.equal(resPdf.borderosLiquidadosIds[0], 'bord_7201');
    assert.equal(resPdf.contasBaixadasIds.length, 1);
    assert.equal(resPdf.pendentesRevisaoHumana.length, 1); // Tarifa bancária fica para revisão

    // Borderô quitado e OS baixada em cascata
    const bord = state.borderos.find(b => b.id === 'bord_7201');
    assert.ok(bord.status === 'pago' || bord.status === 'liquidado');
    assert.equal(bord.saldoDevedor, 0);
    const os = state.os.find(o => o.id === 'os_b2b_72');
    assert.equal(os.pago, true);

    // Boleto do fornecedor baixado
    const cta = state.contas.find(c => c.id === 'cta_pag_fornec_1');
    assert.equal(cta.status, 'pago');
    assert.equal(cta.pago, true);
  });

  await t.test('2.2: Conciliação via OFX e API JSON estruturada', () => {
    const state = criarEstadoConciliacao();

    const ofxRaw = `
      <OFX>
        <STMTTRN>
          <TRNTYPE>CREDIT</TRNTYPE>
          <DTPOSTED>20261110</DTPOSTED>
          <TRNAMT>2500.00</TRNAMT>
          <FITID>OFX-9821</FITID>
          <MEMO>PIX BORD-7201</MEMO>
        </STMTTRN>
      </OFX>
    `;

    const resOfx = bankStatementReconciliationService.conciliarExtratoBancarioAutomatico(state, {
      formato: 'ofx_cnab',
      conteudoRaw: ofxRaw
    });

    assert.equal(resOfx.totalTransacoes, 1);
    assert.equal(resOfx.conciliadasAutomaticamenteCount, 1);
    assert.equal(state.borderos[0].saldoDevedor, 0);
  });
});

test('Sprint 7.2 — Task 3: Agente de WhatsApp com Skills de Recepção e Analista Financeiro', async (t) => {
  const whatsappAgentSkillsService = require('../services/whatsapp/whatsappAgentSkillsService');

  function criarEstadoWhatsApp() {
    return {
      tenantId: 'tenant_sprint72',
      os: [{ id: 'os_truck_99', num: 7299, placa: 'BRA2E19', st: 'em_andamento', boxAtualId: 'box_pesado_2' }],
      patioBoxes: [{ id: 'box_pesado_2', nome: 'Box 02 - Alinhamento Laser', osAtualId: 'os_truck_99' }],
      patioBottlenecks: [],
      receptionQueue: [],
      borderos: [{ id: 'bord_wpp_1', num: 'BORD-9901', status: 'faturado', saldoDevedor: 3200, dataVencimento: '2026-11-01' }],
      contas: [{ id: 'cta_pag_wpp_1', tipo: 'pagar', valor: 1500, status: 'pendente' }],
      whatsappAgentLogs: []
    };
  }

  await t.test('3.1: Skill de Recepção de Pátio — Consulta de Placa e Pré-Check-in', () => {
    const state = criarEstadoWhatsApp();

    // Consulta de status do caminhão por placa
    const resConsulta = whatsappAgentSkillsService.processarMensagemAgenteWhatsApp(state, {
      remetente: '5511988887777',
      mensagem: 'Olá, qual a situação do caminhão placa BRA-2E19?'
    });

    assert.equal(resConsulta.skill, 'SKILL_RECEPCAO_PATIO');
    assert.ok(resConsulta.respostaTextoWhatsApp.includes('BRA2E19'));
    assert.ok(resConsulta.respostaTextoWhatsApp.includes('Box 02'));

    // Pré-check-in na chegada
    const resCheckin = whatsappAgentSkillsService.processarMensagemAgenteWhatsApp(state, {
      remetente: '5511988887777',
      mensagem: 'Cheguei na oficina com a carreta placa XYZ9A99 para revisão',
      clienteNome: 'Transportes Rápido Brasil'
    });

    assert.equal(resCheckin.skill, 'SKILL_RECEPCAO_PATIO');
    assert.ok(resCheckin.protocolo);
    assert.equal(state.receptionQueue.length, 1);
    assert.equal(state.receptionQueue[0].placa, 'XYZ9A99');
  });

  await t.test('3.2: Skill Analista Financeiro — Bloqueio RBAC 403 e Relatório para a Gerência', () => {
    const state = criarEstadoWhatsApp();

    // Tentativa por motorista/cliente comum -> Bloqueio 403
    assert.throws(
      () => whatsappAgentSkillsService.processarMensagemAgenteWhatsApp(state, {
        remetente: '5511988887777',
        perfilRemetente: 'cliente',
        mensagem: 'Qual o faturamento e borderôs vencidos hoje?'
      }),
      (err) => err.code === 'WHATSAPP_UNAUTHORIZED_MANAGEMENT_SKILL'
    );

    // Consulta pela Gerência -> Retorna briefing analítico
    const resGerencia = whatsappAgentSkillsService.processarMensagemAgenteWhatsApp(state, {
      remetente: '5511999990000',
      perfilRemetente: 'gerencia',
      mensagem: 'Verônica, me passe o briefing financeiro de borderôs e contas a pagar'
    });

    assert.equal(resGerencia.skill, 'SKILL_ANALISTA_FINANCEIRO');
    assert.ok(resGerencia.respostaTextoWhatsApp.includes('Borderôs'));
    assert.equal(state.whatsappAgentLogs.length, 2);
  });
});
