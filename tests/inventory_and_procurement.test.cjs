'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const net = require('net');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');
const { once } = require('events');

const inventoryService = require('../services/inventoryService');
const supplierService = require('../services/supplierService');
const procurementService = require('../services/procurementService');
const operationalIntelligenceEngine = require('../services/operationalIntelligenceEngine');
const voiceActionEngine = require('../services/voiceActionEngine');

function criarEstadoBase(tenantId = 'oficina_teste_1') {
  return {
    tenantId,
    clientes: [{ id: 'cli_1', tenantId, nome: 'Transportadora TransRodas' }],
    veiculos: [{ id: 'vei_1', tenantId, placa: 'ABC1D23', modelo: 'Scania R450' }],
    boxes: [{ id: 'box_1', tenantId, nome: 'Box 01' }],
    os: [
      {
        id: 'os_1',
        num: '1001',
        tenantId,
        cli: 'cli_1',
        vei: 'vei_1',
        box: 'box_1',
        st: 'execucao',
        previsaoEntrega: new Date(Date.now() + 86400000 * 2).toISOString(),
        servicos: [{ id: 's_1', nome: 'Revisão Freio', valor: 300, autorizado: true }],
        pecas: []
      }
    ],
    pecas: [],
    inventoryMovements: [],
    partRequirements: [],
    suppliers: [],
    fornecedores: [],
    purchaseQuotes: [],
    purchaseOrders: [],
    contas: [],
    auditoria: [],
    cfg: {
      compras: {
        exigirAprovacaoAcimaDe: 2000
      }
    }
  };
}

// 1. Cadastro de Peça com Referências Cruzadas
test('1. Cadastro de peça com referências cruzadas e campos obrigatórios', () => {
  const state = criarEstadoBase();
  const res = inventoryService.cadastrarPeca({
    tenantId: 'oficina_teste_1',
    state,
    partData: {
      descricao: 'Lona de Freio Traseira Scania',
      codigoInterno: 'LONA-001',
      referencias: ['SCN-20412', 'FRASLE-FD87'],
      custo: 120.0,
      venda: 220.0,
      estoqueMinimo: 4,
      localizacao: 'Prat. A-01'
    },
    actorId: 'usuario_teste'
  });

  const peca = res.part;
  assert.ok(peca.id, 'Peça deve receber ID');
  assert.equal(peca.codigoInterno, 'LONA-001');
  assert.equal(peca.descricao, 'Lona de Freio Traseira Scania');
  assert.ok(peca.referencias.includes('SCN-20412'));
  assert.equal(state.pecas.length, 1);
});

// 2. Colisão de código interno no mesmo tenant
test('2. Validação de colisão de código interno no mesmo tenant', () => {
  const state = criarEstadoBase();
  inventoryService.cadastrarPeca({
    tenantId: 'oficina_teste_1',
    state,
    partData: { descricao: 'Filtro de Óleo', codigoInterno: 'FLT-100' }
  });

    assert.throws(() => {
    inventoryService.cadastrarPeca({
      tenantId: 'oficina_teste_1',
      state,
      partData: { descricao: 'Filtro de Óleo Secundário', codigoInterno: 'FLT-100' }
    });
  }, /cadastrada|já existe/i);
});

// 3. Isolamento multi-tenant estrito no cadastro e busca
test('3. Isolamento multi-tenant estrito no cadastro e busca de peças', () => {
  const stateA = criarEstadoBase('tenant_a');
  const stateB = criarEstadoBase('tenant_b');

  const resA = inventoryService.cadastrarPeca({
    tenantId: 'tenant_a',
    state: stateA,
    partData: { descricao: 'Amortecedor Dianteiro', codigoInterno: 'AMORT-1' }
  });

  // Mesmo código em tenant diferente DEVE ser permitido
  const resB = inventoryService.cadastrarPeca({
    tenantId: 'tenant_b',
    state: stateB,
    partData: { descricao: 'Amortecedor Dianteiro B', codigoInterno: 'AMORT-1' }
  });

  assert.equal(resA.part.codigoInterno, resB.part.codigoInterno);
  assert.notEqual(resA.part.id, resB.part.id);

  // Busca delimitada
  const buscaA = inventoryService.buscarPecas({ tenantId: 'tenant_a', state: stateA, query: 'AMORT' });
  assert.equal(buscaA.length, 1);
  assert.equal(buscaA[0].tenantId, 'tenant_a');
});

// 4. Cálculo determinístico de saldos
test('4. Cálculo determinístico de saldos: Físico, Reservado e Disponível', () => {
  const state = criarEstadoBase();
  const res = inventoryService.cadastrarPeca({
    tenantId: 'oficina_teste_1',
    state,
    partData: { descricao: 'Pastilha Freio', codigoInterno: 'PST-01', estoqueInicial: 10 }
  });
  const peca = res.part;

  let saldos = inventoryService.calcularSaldos({ tenantId: 'oficina_teste_1', state, partId: peca.id });
  assert.equal(saldos.estoqueFisico, 10);
  assert.equal(saldos.estoqueReservado, 0);
  assert.equal(saldos.estoqueDisponivel, 10);

  // Simula reserva ativa
  state.partRequirements.push({
    id: 'req_1',
    tenantId: 'oficina_teste_1',
    osId: 'os_1',
    partId: peca.id,
    status: 'reservada',
    reservedQuantity: 4
  });

  saldos = inventoryService.calcularSaldos({ tenantId: 'oficina_teste_1', state, partId: peca.id });
  assert.equal(saldos.estoqueFisico, 10);
  assert.equal(saldos.estoqueReservado, 4);
  assert.equal(saldos.estoqueDisponivel, 6);
});

// 5. Livro-razão imutável de movimentações de estoque
test('5. Livro-razão imutável de movimentações de estoque com auditoria', () => {
  const state = criarEstadoBase();
  const res = inventoryService.cadastrarPeca({
    tenantId: 'oficina_teste_1',
    state,
    partData: { descricao: 'Cruzeta Cardan', codigoInterno: 'CRZ-01', estoqueInicial: 0 }
  });
  const peca = res.part;

  const mov = inventoryService.registrarMovimentacao({
    tenantId: 'oficina_teste_1',
    state,
    partId: peca.id,
    type: 'entrada_compra',
    quantity: 5,
    unitCost: 150.0,
    reason: 'Nota Fiscal NF-9921',
    actorId: 'comprador_carlos'
  });

  assert.equal(state.inventoryMovements.length, 1);
  assert.equal(mov.type, 'entrada_compra');
  assert.equal(mov.quantity, 5);
  assert.equal(mov.saldoAnterior, 0);
  assert.equal(mov.saldoNovo, 5);
  assert.equal(state.pecas[0].qtd, 5);
});

// 6. Custo Médio Ponderado
test('6. Cálculo correto do Custo Médio Ponderado no recebimento', () => {
  const state = criarEstadoBase();
  const res = inventoryService.cadastrarPeca({
    tenantId: 'oficina_teste_1',
    state,
    partData: { descricao: 'Tambor de Freio', codigoInterno: 'TMB-01', estoqueInicial: 10, custo: 100.0 }
  });
  const peca = res.part;

  // Saldo atual: 10 un * R$ 100 = R$ 1.000
  // Nova entrada: 10 un * R$ 150 = R$ 1.500
  // Custo médio ponderado: (1000 + 1500) / 20 = R$ 125.00
  inventoryService.registrarMovimentacao({
    tenantId: 'oficina_teste_1',
    state,
    partId: peca.id,
    type: 'entrada_compra',
    quantity: 10,
    unitCost: 150.0,
    actorId: 'almoxarife'
  });

  assert.equal(state.pecas[0].qtd, 20);
  assert.equal(state.pecas[0].custo, 125.0);
});

// 7. Reserva atômica de peças para OS
test('7. Reserva atômica de peças para Ordem de Serviço', () => {
  const state = criarEstadoBase();
  const resPeca = inventoryService.cadastrarPeca({
    tenantId: 'oficina_teste_1',
    state,
    partData: { descricao: 'Correia Poly-V', codigoInterno: 'COR-01', estoqueInicial: 8, venda: 180.0 }
  });
  const peca = resPeca.part;

  const res = inventoryService.reservarParaOS({
    tenantId: 'oficina_teste_1',
    state,
    osId: 'os_1',
    partId: peca.id,
    quantity: 3,
    actorId: 'consultor_tecnico'
  });

  assert.ok(res.ok);
  assert.equal(res.reservedQuantity, 3);
  assert.equal(res.saldos.estoqueDisponivel, 5);
  assert.equal(res.saldos.estoqueReservado, 3);

  const os = state.os.find(o => o.id === 'os_1');
  assert.ok(os.pecas.some(p => p.pecaId === peca.id && p.status === 'reservada'));
});

// 8. Reserva concorrente e bloqueio quando disponível for insuficiente
test('8. Bloqueio quando estoque disponível for insuficiente para reserva total', () => {
  const state = criarEstadoBase();
  const res = inventoryService.cadastrarPeca({
    tenantId: 'oficina_teste_1',
    state,
    partData: { descricao: 'Bomba d Água', codigoInterno: 'BMB-01', estoqueInicial: 2 }
  });
  const peca = res.part;

  assert.throws(() => {
    inventoryService.reservarParaOS({
      tenantId: 'oficina_teste_1',
      state,
      osId: 'os_1',
      partId: peca.id,
      quantity: 5,
      permitirParcial: false
    });
  }, /insuficiente/i);
});

// 9. Liberação de reserva
test('9. Liberação de reserva na exclusão de item ou cancelamento de OS', () => {
  const state = criarEstadoBase();
  const res = inventoryService.cadastrarPeca({
    tenantId: 'oficina_teste_1',
    state,
    partData: { descricao: 'Sensor ABS', codigoInterno: 'ABS-01', estoqueInicial: 5 }
  });
  const peca = res.part;

  inventoryService.reservarParaOS({
    tenantId: 'oficina_teste_1',
    state,
    osId: 'os_1',
    partId: peca.id,
    quantity: 2
  });

  let saldos = inventoryService.calcularSaldos({ tenantId: 'oficina_teste_1', state, partId: peca.id });
  assert.equal(saldos.estoqueDisponivel, 3);

  inventoryService.liberarReserva({
    tenantId: 'oficina_teste_1',
    state,
    osId: 'os_1',
    partId: peca.id,
    quantity: 2,
    reason: 'Serviço cancelado pelo cliente'
  });

  saldos = inventoryService.calcularSaldos({ tenantId: 'oficina_teste_1', state, partId: peca.id });
  assert.equal(saldos.estoqueDisponivel, 5);
  assert.equal(saldos.estoqueReservado, 0);
});

// 10. Consumo mecânico autorizado na OS
test('10. Consumo mecânico autorizado na OS com baixa no estoque físico', () => {
  const state = criarEstadoBase();
  const res = inventoryService.cadastrarPeca({
    tenantId: 'oficina_teste_1',
    state,
    partData: { descricao: 'Filtro Ar', codigoInterno: 'FAR-01', estoqueInicial: 6 }
  });
  const peca = res.part;

  inventoryService.reservarParaOS({
    tenantId: 'oficina_teste_1',
    state,
    osId: 'os_1',
    partId: peca.id,
    quantity: 2
  });

  const consum = inventoryService.consumirPecaOS({
    tenantId: 'oficina_teste_1',
    state,
    osId: 'os_1',
    partId: peca.id,
    quantity: 2,
    actorId: 'mecanico_ze'
  });

  assert.ok(consum.ok);
  assert.equal(state.pecas[0].qtd, 4, 'Estoque físico deve baixar');
  assert.equal(consum.saldos.estoqueReservado, 0, 'Reserva deve ser zerada após consumo');

  const os = state.os.find(o => o.id === 'os_1');
  const itemConsumido = os.pecas.find(p => p.pecaId === peca.id);
  assert.equal(itemConsumido.status, 'consumida');
});

// 11. Devolução de peças da OS para o almoxarifado
test('11. Devolução de peças da OS para o almoxarifado', () => {
  const state = criarEstadoBase();
  const res = inventoryService.cadastrarPeca({
    tenantId: 'oficina_teste_1',
    state,
    partData: { descricao: 'Graxa Azul Chassi', codigoInterno: 'GRX-01', estoqueInicial: 10 }
  });
  const peca = res.part;

  inventoryService.reservarParaOS({ tenantId: 'oficina_teste_1', state, osId: 'os_1', partId: peca.id, quantity: 4 });
  inventoryService.consumirPecaOS({ tenantId: 'oficina_teste_1', state, osId: 'os_1', partId: peca.id, quantity: 4 });

  // Devolve 1 unidade excedente
  const dev = inventoryService.devolverPecaOS({
    tenantId: 'oficina_teste_1',
    state,
    osId: 'os_1',
    partId: peca.id,
    quantity: 1,
    reason: 'Sobrou 1 kg não utilizado na aplicação',
    actorId: 'mecanico_ze'
  });

  assert.ok(dev.ok);
  assert.equal(state.pecas[0].qtd, 7, 'Estoque físico deve receber a devolução (10 - 4 + 1 = 7)');
});

// 12. Ajuste manual de inventário com auditoria
test('12. Ajuste manual de inventário com auditoria', () => {
  const state = criarEstadoBase();
  const res = inventoryService.cadastrarPeca({
    tenantId: 'oficina_teste_1',
    state,
    partData: { descricao: 'Parafuso Roda Traseira', codigoInterno: 'PRF-01', estoqueInicial: 50 }
  });
  const peca = res.part;

  const aj = inventoryService.ajustarEstoque({
    tenantId: 'oficina_teste_1',
    state,
    partId: peca.id,
    novaQuantidade: 46,
    reason: 'Inventário rotativo: 4 unidades extraviadas',
    actorId: 'auditor_chefe'
  });

  assert.ok(aj.ok);
  assert.equal(state.pecas[0].qtd, 46);
  assert.equal(aj.movement.type, 'ajuste_negativo');
  assert.equal(aj.movement.quantity, 4);
});

// 13. Cadastro e consulta de fornecedores
test('13. Cadastro e consulta de fornecedores com condições comerciais', () => {
  const state = criarEstadoBase();
  const res = supplierService.cadastrarFornecedor({
    tenantId: 'oficina_teste_1',
    state,
    supplierData: {
      razaoSocial: 'Distribuidora Rodas e Freios Ltda',
      nome: 'Rodas & Freios',
      documento: '12.345.678/0001-99',
      prazoMedioDias: 2,
      condicoesPagamento: '30 DDL'
    }
  });

  const sup = res.supplier;
  assert.ok(sup.id);
  assert.equal(sup.documento, '12.345.678/0001-99');
  const list = supplierService.listarFornecedores({ tenantId: 'oficina_teste_1', state });
  assert.equal(list.length, 1);
});

// 14. Histórico de compras e desempenho do fornecedor
test('14. Histórico de compras e cálculo de pontualidade do fornecedor', () => {
  const state = criarEstadoBase();
  const res = supplierService.cadastrarFornecedor({
    tenantId: 'oficina_teste_1',
    state,
    supplierData: { razaoSocial: 'Auto Peças Express', nome: 'Auto Peças Express', documento: '00.111.222/0001-33' }
  });
  const sup = res.supplier;

  // Compra pontual
  supplierService.registrarHistoricoCompra({
    tenantId: 'oficina_teste_1',
    state,
    supplierId: sup.id,
    orderId: 'ped_1',
    valor: 1000,
    diasPrometidos: 2,
    diasRealizados: 2
  });

  // Compra atrasada
  supplierService.registrarHistoricoCompra({
    tenantId: 'oficina_teste_1',
    state,
    supplierId: sup.id,
    orderId: 'ped_2',
    valor: 2000,
    diasPrometidos: 2,
    diasRealizados: 4
  });

  const perf = supplierService.calcularDesempenhoFornecedor({ tenantId: 'oficina_teste_1', state, supplierId: sup.id });
  assert.equal(perf.totalCompras, 2);
  assert.equal(perf.valorTotalComprado, 3000);
  assert.equal(perf.taxaPontualidadePercentual, 50.0);
});

// 15. Geração automática de Necessidade de Compra
test('15. Geração automática de Necessidade de Compra para peça faltante em OS', () => {
  const state = criarEstadoBase();
  const res = inventoryService.cadastrarPeca({
    tenantId: 'oficina_teste_1',
    state,
    partData: { descricao: 'Cilindro Freio', codigoInterno: 'CL-01', estoqueInicial: 2 }
  });
  const peca = res.part;

  // OS precisa de 5, temos 2 em estoque -> falta 3
  const req = procurementService.gerarNecessidadeCompra({
    tenantId: 'oficina_teste_1',
    state,
    osId: 'os_1',
    partId: peca.id,
    requiredQuantity: 5,
    reservedQuantity: 2
  });

  assert.equal(req.requiredQuantity, 5);
  assert.equal(req.reservedQuantity, 2);
  assert.equal(req.missingQuantity, 3);
  assert.equal(req.status, 'parcial');
});

// 16. Criação de Cotação com múltiplos fornecedores
test('16. Criação de Cotação com múltiplos fornecedores', () => {
  const state = criarEstadoBase();
  const resP = inventoryService.cadastrarPeca({
    tenantId: 'oficina_teste_1',
    state,
    partData: { descricao: 'Servo Embreagem', codigoInterno: 'SRV-01' }
  });
  const peca = resP.part;

  const req = procurementService.gerarNecessidadeCompra({
    tenantId: 'oficina_teste_1',
    state,
    osId: 'os_1',
    partId: peca.id,
    requiredQuantity: 2
  });

  const supA = supplierService.cadastrarFornecedor({ tenantId: 'oficina_teste_1', state, supplierData: { nome: 'Fornecedor A' } }).supplier;
  const supB = supplierService.cadastrarFornecedor({ tenantId: 'oficina_teste_1', state, supplierData: { nome: 'Fornecedor B' } }).supplier;

  const resCot = procurementService.criarCotacao({
    tenantId: 'oficina_teste_1',
    state,
    requirementIds: [req.id],
    supplierIds: [supA.id, supB.id]
  });

  const cot = resCot.quote;
  assert.ok(cot.id);
  assert.equal(cot.status, 'aberta');
  assert.equal(cot.supplierIds.length, 2);
});

// 17. Registro de respostas de cotação
test('17. Registro de respostas dos fornecedores com preços e prazos', () => {
  const state = criarEstadoBase();
  const peca = inventoryService.cadastrarPeca({ tenantId: 'oficina_teste_1', state, partData: { descricao: 'Válvula Relé', codigoInterno: 'VLV-01' } }).part;
  const req = procurementService.gerarNecessidadeCompra({ tenantId: 'oficina_teste_1', state, osId: 'os_1', partId: peca.id, requiredQuantity: 1 });
  const supA = supplierService.cadastrarFornecedor({ tenantId: 'oficina_teste_1', state, supplierData: { nome: 'Fornecedor Alpha' } }).supplier;
  const cot = procurementService.criarCotacao({ tenantId: 'oficina_teste_1', state, requirementIds: [req.id], supplierIds: [supA.id] }).quote;

  const resp = procurementService.registrarRespostaFornecedor({
    tenantId: 'oficina_teste_1',
    state,
    quoteId: cot.id,
    supplierId: supA.id,
    items: [{ partId: peca.id, unitPrice: 350.0, leadTimeDays: 2 }],
    condicoesPagamento: '28 DDL'
  });

  assert.ok(resp.ok);
  assert.equal(cot.status, 'respondida');
  assert.equal(cot.suppliers[0].items[0].unitPrice, 350.0);
});

// 18. Comparativo determinístico de cotações
test('18. Comparativo determinístico de cotações com melhor preço e melhor prazo', () => {
  const state = criarEstadoBase();
  const peca = inventoryService.cadastrarPeca({ tenantId: 'oficina_teste_1', state, partData: { descricao: 'Mola Dianteira', codigoInterno: 'MLA-01' } }).part;
  const req = procurementService.gerarNecessidadeCompra({ tenantId: 'oficina_teste_1', state, osId: 'os_1', partId: peca.id, requiredQuantity: 2 });
  const supBarato = supplierService.cadastrarFornecedor({ tenantId: 'oficina_teste_1', state, supplierData: { nome: 'Barato Lento' } }).supplier;
  const supRapido = supplierService.cadastrarFornecedor({ tenantId: 'oficina_teste_1', state, supplierData: { nome: 'Rapido Caro' } }).supplier;

  const cot = procurementService.criarCotacao({
    tenantId: 'oficina_teste_1',
    state,
    requirementIds: [req.id],
    supplierIds: [supBarato.id, supRapido.id]
  }).quote;

  // Barato: R$ 400 total, 5 dias
  procurementService.registrarRespostaFornecedor({
    tenantId: 'oficina_teste_1',
    state,
    quoteId: cot.id,
    supplierId: supBarato.id,
    items: [{ partId: peca.id, unitPrice: 200.0, leadTimeDays: 5 }]
  });

  // Rápido: R$ 500 total, 1 dia
  procurementService.registrarRespostaFornecedor({
    tenantId: 'oficina_teste_1',
    state,
    quoteId: cot.id,
    supplierId: supRapido.id,
    items: [{ partId: peca.id, unitPrice: 250.0, leadTimeDays: 1 }]
  });

  const comp = procurementService.compararCotacoes({ tenantId: 'oficina_teste_1', state, quoteId: cot.id });
  assert.equal(comp.melhorPreco.supplierId, supBarato.id);
  assert.equal(comp.melhorPrazo.supplierId, supRapido.id);
});

// 19. Alerta de impacto no prazo da OS
test('19. Detecção de impacto no prazo de entrega prometido na OS', () => {
  const state = criarEstadoBase();
  // OS promete entrega amanhã (24h)
  state.os[0].previsaoEntrega = new Date(Date.now() + 86400000).toISOString();

  const peca = inventoryService.cadastrarPeca({ tenantId: 'oficina_teste_1', state, partData: { descricao: 'Turbina Scania', codigoInterno: 'TRB-01' } }).part;
  const req = procurementService.gerarNecessidadeCompra({ tenantId: 'oficina_teste_1', state, osId: 'os_1', partId: peca.id, requiredQuantity: 1 });
  const supLento = supplierService.cadastrarFornecedor({ tenantId: 'oficina_teste_1', state, supplierData: { nome: 'Fabrica Turbinas' } }).supplier;

  const cot = procurementService.criarCotacao({
    tenantId: 'oficina_teste_1',
    state,
    requirementIds: [req.id],
    supplierIds: [supLento.id]
  }).quote;

  // Fornecedor pede 4 dias
  procurementService.registrarRespostaFornecedor({
    tenantId: 'oficina_teste_1',
    state,
    quoteId: cot.id,
    supplierId: supLento.id,
    items: [{ partId: peca.id, unitPrice: 3000.0, leadTimeDays: 4 }]
  });

  const comp = procurementService.compararCotacoes({ tenantId: 'oficina_teste_1', state, quoteId: cot.id });
  assert.ok(comp.alertasImpacto.length > 0, 'Deve acusar impacto no prazo prometido da OS');
});

// 20. Pedido de compra abaixo da alçada
test('20. Criação de Pedido de Compra abaixo do limite de alçada (aprovação automática)', () => {
  const state = criarEstadoBase();
  const peca = inventoryService.cadastrarPeca({ tenantId: 'oficina_teste_1', state, partData: { descricao: 'Retentor Cubo', codigoInterno: 'RET-01' } }).part;
  const sup = supplierService.cadastrarFornecedor({ tenantId: 'oficina_teste_1', state, supplierData: { nome: 'Retentores Brasil' } }).supplier;

  // Total: R$ 800 (limite é R$ 2.000)
  const resOrder = procurementService.criarPedidoCompra({
    tenantId: 'oficina_teste_1',
    state,
    supplierId: sup.id,
    items: [{ partId: peca.id, quantity: 4, unitPrice: 200.0 }],
    actorId: 'comprador_junior'
  });

  const order = resOrder.order;
  assert.equal(order.totalGeral, 800.0);
  assert.equal(order.status, 'pedido_realizado', 'Pedido abaixo da alçada deve seguir sem bloqueio');
});

// 21. Pedido de compra acima da alçada
test('21. Criação de Pedido de Compra acima do limite de alçada (aguardando aprovação)', () => {
  const state = criarEstadoBase();
  const peca = inventoryService.cadastrarPeca({ tenantId: 'oficina_teste_1', state, partData: { descricao: 'Caixa de Câmbio ZF', codigoInterno: 'CAMB-01' } }).part;
  const sup = supplierService.cadastrarFornecedor({ tenantId: 'oficina_teste_1', state, supplierData: { nome: 'ZF do Brasil' } }).supplier;

  // Total: R$ 12.000 (limite é R$ 2.000)
  const resOrder = procurementService.criarPedidoCompra({
    tenantId: 'oficina_teste_1',
    state,
    supplierId: sup.id,
    items: [{ partId: peca.id, quantity: 1, unitPrice: 12000.0 }],
    actorId: 'comprador_junior'
  });

  const order = resOrder.order;
  assert.equal(order.status, 'aguardando_aprovacao', 'Pedido acima da alçada deve requerer aprovação');
});

// 22. Aprovação de Pedido de Compra por gestor
test('22. Aprovação de Pedido de Compra por gestor com permissão purchase:approve', () => {
  const state = criarEstadoBase();
  const peca = inventoryService.cadastrarPeca({ tenantId: 'oficina_teste_1', state, partData: { descricao: 'Módulo Injeção', codigoInterno: 'ECU-01' } }).part;
  const sup = supplierService.cadastrarFornecedor({ tenantId: 'oficina_teste_1', state, supplierData: { nome: 'Bosch Diesel' } }).supplier;

  const order = procurementService.criarPedidoCompra({
    tenantId: 'oficina_teste_1',
    state,
    supplierId: sup.id,
    items: [{ partId: peca.id, quantity: 1, unitPrice: 5000.0 }],
    actorId: 'comprador_junior'
  }).order;

  // Tentativa sem permissão
  assert.throws(() => {
    procurementService.aprovarPedidoCompra({
      tenantId: 'oficina_teste_1',
      state,
      orderId: order.id,
      userPermissions: ['purchase:read']
    });
  }, /exige permissão|acesso negado/i);

  // Com permissão
  const resAp = procurementService.aprovarPedidoCompra({
    tenantId: 'oficina_teste_1',
    state,
    orderId: order.id,
    userPermissions: ['purchase:approve'],
    actorId: 'diretor_operacoes'
  });

  assert.equal(resAp.order.status, 'aprovado');
});

// 23. Cancelamento de pedido de compra
test('23. Cancelamento de Pedido de Compra com registro de auditoria', () => {
  const state = criarEstadoBase();
  const peca = inventoryService.cadastrarPeca({ tenantId: 'oficina_teste_1', state, partData: { descricao: 'Kit Embreagem', codigoInterno: 'KIT-01' } }).part;
  const sup = supplierService.cadastrarFornecedor({ tenantId: 'oficina_teste_1', state, supplierData: { nome: 'Sachs do Brasil' } }).supplier;

  const order = procurementService.criarPedidoCompra({
    tenantId: 'oficina_teste_1',
    state,
    supplierId: sup.id,
    items: [{ partId: peca.id, quantity: 1, unitPrice: 1500.0 }]
  }).order;

  const resCanc = procurementService.cancelarPedidoCompra({
    tenantId: 'oficina_teste_1',
    state,
    orderId: order.id,
    reason: 'Cliente desistiu do serviço adicional',
    actorId: 'gerente'
  });

  assert.equal(resCanc.order.status, 'cancelado');
});

// 24. Recebimento total de pedido de compra
test('24. Recebimento total de Pedido de Compra atualiza estoque físico e custo médio', () => {
  const state = criarEstadoBase();
  const peca = inventoryService.cadastrarPeca({
    tenantId: 'oficina_teste_1',
    state,
    partData: { descricao: 'Sapata de Freio', codigoInterno: 'SPT-01', estoqueInicial: 4, custo: 100.0 }
  }).part;
  const sup = supplierService.cadastrarFornecedor({ tenantId: 'oficina_teste_1', state, supplierData: { nome: 'Freios Sul' } }).supplier;

  const order = procurementService.criarPedidoCompra({
    tenantId: 'oficina_teste_1',
    state,
    supplierId: sup.id,
    items: [{ partId: peca.id, quantity: 6, unitPrice: 150.0 }]
  }).order;

  const rec = procurementService.receberPedidoCompra({
    tenantId: 'oficina_teste_1',
    state,
    orderId: order.id,
    itensRecebidos: [{ partId: peca.id, quantity: 6 }],
    nfNumero: 'NF-100293',
    actorId: 'conferente_pedro'
  });

  assert.ok(rec.ok);
  assert.equal(rec.status, 'recebido');
  assert.equal(state.pecas[0].qtd, 10, 'Estoque físico deve ser 4 + 6 = 10');
  // Custo: (4 * 100 + 6 * 150) / 10 = (400 + 900) / 10 = 130.00
  assert.equal(state.pecas[0].custo, 130.0);
});

// 25. Reserva automática prioritária para a OS de origem ao receber mercadoria
test('25. Reserva automática prioritária para a OS de origem ao receber mercadoria', () => {
  const state = criarEstadoBase();
  const peca = inventoryService.cadastrarPeca({
    tenantId: 'oficina_teste_1',
    state,
    partData: { descricao: 'Válvula Pedal Wabco', codigoInterno: 'WBC-01', estoqueInicial: 0 }
  }).part;
  const sup = supplierService.cadastrarFornecedor({ tenantId: 'oficina_teste_1', state, supplierData: { nome: 'Wabco Distribuidor' } }).supplier;

  // Necessidade e pedido originados diretamente para a OS os_1
  const req = procurementService.gerarNecessidadeCompra({
    tenantId: 'oficina_teste_1',
    state,
    osId: 'os_1',
    partId: peca.id,
    requiredQuantity: 1
  });

  const order = procurementService.criarPedidoCompra({
    tenantId: 'oficina_teste_1',
    state,
    supplierId: sup.id,
    items: [{ partId: peca.id, quantity: 1, unitPrice: 980.0, osId: 'os_1', requirementId: req.id }]
  }).order;

  procurementService.receberPedidoCompra({
    tenantId: 'oficina_teste_1',
    state,
    orderId: order.id,
    itensRecebidos: [{ partId: peca.id, quantity: 1 }],
    actorId: 'conferente'
  });

  const saldos = inventoryService.calcularSaldos({ tenantId: 'oficina_teste_1', state, partId: peca.id });
  assert.equal(saldos.estoqueFisico, 1);
  assert.equal(saldos.estoqueReservado, 1, 'Deve estar reservado automaticamente para a OS de origem');
  assert.equal(saldos.estoqueDisponivel, 0);

  const reqAtualizada = state.partRequirements.find(r => r.id === req.id);
  assert.equal(reqAtualizada.status, 'atendida');
});

// 26. Recebimento parcial de Pedido de Compra
test('26. Recebimento parcial de Pedido de Compra com saldo remanescente', () => {
  const state = criarEstadoBase();
  const peca = inventoryService.cadastrarPeca({ tenantId: 'oficina_teste_1', state, partData: { descricao: 'Parafuso Cardan', codigoInterno: 'PC-01', estoqueInicial: 0 } }).part;
  const sup = supplierService.cadastrarFornecedor({ tenantId: 'oficina_teste_1', state, supplierData: { nome: 'Parafusos Gerais' } }).supplier;

  const order = procurementService.criarPedidoCompra({
    tenantId: 'oficina_teste_1',
    state,
    supplierId: sup.id,
    items: [{ partId: peca.id, quantity: 10, unitPrice: 15.0 }]
  }).order;

  const rec = procurementService.receberPedidoCompra({
    tenantId: 'oficina_teste_1',
    state,
    orderId: order.id,
    itensRecebidos: [{ partId: peca.id, quantity: 6 }]
  });

  assert.equal(rec.status, 'parcialmente_recebido');
  assert.equal(order.items[0].receivedQuantity, 6);
  assert.equal(order.items[0].pendingQuantity, 4);
  assert.equal(state.pecas[0].qtd, 6);
});

// 27. Integração financeira: Conta a Pagar Pendente (NUNCA paga automaticamente)
test('27. Integração com Contas a Pagar: status pendente (NUNCA paga automaticamente)', () => {
  const state = criarEstadoBase();
  const peca = inventoryService.cadastrarPeca({ tenantId: 'oficina_teste_1', state, partData: { descricao: 'Bucha Feixe Molas', codigoInterno: 'BCH-01', estoqueInicial: 0 } }).part;
  const sup = supplierService.cadastrarFornecedor({ tenantId: 'oficina_teste_1', state, supplierData: { nome: 'Molas Brasil' } }).supplier;

  const order = procurementService.criarPedidoCompra({
    tenantId: 'oficina_teste_1',
    state,
    supplierId: sup.id,
    items: [{ partId: peca.id, quantity: 2, unitPrice: 150.0 }]
  }).order;

  procurementService.receberPedidoCompra({
    tenantId: 'oficina_teste_1',
    state,
    orderId: order.id,
    itensRecebidos: [{ partId: peca.id, quantity: 2 }]
  });

  assert.equal(state.contas.length, 1);
  const conta = state.contas[0];
  assert.equal(conta.tipo, 'pagar');
  assert.equal(conta.st, 'pendente', 'Conta a pagar criada deve ser estritamente pendente');
  assert.notEqual(conta.st, 'paga');
  assert.equal(conta.valor, 300.0);
});

// 28. OperationalIntelligenceEngine: Alertas de Suprimentos
test('28. OperationalIntelligenceEngine: Alertas de Suprimentos (Bloqueando Box e Pedido Atrasado)', () => {
  const state = criarEstadoBase();
  const peca = inventoryService.cadastrarPeca({ tenantId: 'oficina_teste_1', state, partData: { descricao: 'Cruzeta', codigoInterno: 'CRZ-99', estoqueInicial: 0 } }).part;

  // OS no box aguardando peça com urgência alta
  state.partRequirements.push({
    id: 'req_urgente',
    tenantId: 'oficina_teste_1',
    osId: 'os_1',
    partId: peca.id,
    status: 'aguardando_compra',
    missingQuantity: 1,
    urgencia: 'alta'
  });

  // Pedido em atraso
  state.purchaseOrders.push({
    id: 'ped_atrasado',
    tenantId: 'oficina_teste_1',
    codigo: 'PED-900',
    status: 'pedido_realizado',
    expectedAt: new Date(Date.now() - 86400000).toISOString(),
    items: []
  });

  const res = operationalIntelligenceEngine.avaliarEventosOperacionais({
    tenantId: 'oficina_teste_1',
    state
  });

  const alertaBox = res.novosEventos.find(e => e.tipo === 'peca_bloqueando_box');
  assert.ok(alertaBox, 'Deve gerar alerta de peça bloqueando box');
  assert.equal(alertaBox.prioridade, 'P1');

  const alertaPedAtrasado = res.novosEventos.find(e => e.tipo === 'pedido_compra_atrasado');
  assert.ok(alertaPedAtrasado, 'Deve gerar alerta de pedido de compra atrasado');
});

// 29. VoiceActionEngine: Intenções de Estoque e Suprimentos
test('29. VoiceActionEngine: Consulta de estoque e solicitação de ajuste com token de confirmação', async () => {
  const state = criarEstadoBase();
  inventoryService.cadastrarPeca({
    tenantId: 'oficina_teste_1',
    state,
    partData: { descricao: 'Lona de Freio Traseira', codigoInterno: 'LONA-55', estoqueInicial: 8 }
  });

  // 1. Consulta simples por voz
  const queryRes = await voiceActionEngine.interpretarEExecutar({
    input: { text: 'Como está o estoque de lona de freio?' },
    context: { tenantId: 'oficina_teste_1', actorId: 'gerente_antonio', role: 'gerente', permissions: ['inventory:read', 'inventory:write', 'inventory:adjust'] },
    state
  });

  assert.ok(queryRes.ok);
  assert.equal(queryRes.acao, 'consultar_estoque_peca');
  assert.match(queryRes.resposta, /Lona de Freio Traseira|8 físico/i);

  // 2. Ação de risco por voz: ajuste de estoque exige confirmação
  const ajusteRes = await voiceActionEngine.interpretarEExecutar({
    input: { text: 'Ajustar estoque da peça LONA-55 para 12 unidades' },
    context: { tenantId: 'oficina_teste_1', actorId: 'gerente_antonio', role: 'gerente', permissions: ['inventory:read', 'inventory:write', 'inventory:adjust'] },
    state
  });

  assert.ok(ajusteRes.ok);
  assert.equal(ajusteRes.acao, 'ajustar_estoque');
  assert.equal(ajusteRes.risco, 'alto');
  assert.ok(ajusteRes.pendenteConfirmacao, 'Ajuste manual por voz deve exigir confirmação');
  assert.ok(ajusteRes.token);
});

// 30. Servidor Real E2E: REST API de Peças com isolamento multi-tenant
test('30. Servidor Real E2E: REST API de Peças com isolamento multi-tenant', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'patio-inv-e2e-'));
  const tempDb = path.join(tempDir, 'test.db');
  const tempUploads = path.join(tempDir, 'uploads');
  fs.mkdirSync(tempUploads, { recursive: true });
  const serverNet = net.createServer();
  serverNet.listen(0, '127.0.0.1');
  await once(serverNet, 'listening');
  const port = serverNet.address().port;
  await new Promise(r => serverNet.close(r));

  const child = spawn(process.execPath, ['server.js'], {
    cwd: path.resolve(__dirname, '..'),
    windowsHide: true,
    env: {
      ...process.env,
      PORT: String(port),
      NODE_ENV: 'test',
      DB_PATH: tempDb,
      UPLOAD_DIR: tempUploads,
      API_KEY: 'patio-crm-admin-2026',
      DISABLE_INTEGRATIONS: 'true'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let childErr = '';
  child.stderr.on('data', d => { childErr += d; });
  let serverStarted = false;
  for (let i = 0; i < 150; i++) {
    if (child.exitCode !== null) throw new Error('Falha ao iniciar servidor de teste: ' + childErr);
    try {
      const res = await fetch(`http://127.0.0.1:${port}/`);
      if (res.status === 401 || res.status === 200) {
        serverStarted = true;
        break;
      }
    } catch (_) {}
    await new Promise(r => setTimeout(r, 100));
  }
  if (!serverStarted) throw new Error('Timeout ao aguardar servidor de teste iniciar');

  const baseUrl = 'http://127.0.0.1:' + port;

  try {
    // 1. Criar peça via POST /api/pecas com código único
    const codPeca = 'TMB-' + Date.now();
    const tenantIdE2E = 'oficina_e2e_' + Date.now();
    const postPecaRes = await fetch(baseUrl + '/api/pecas', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': 'patio-crm-admin-2026',
        'x-tenant-id': tenantIdE2E
      },
      body: JSON.stringify({
        descricao: 'Tambor Traseiro Volvo FH',
        codigoInterno: codPeca,
        custo: 350.0,
        venda: 600.0,
        estoqueInicial: 4
      })
    });

    assert.ok(postPecaRes.status === 200 || postPecaRes.status === 201, 'Status deve ser 200 ou 201');
    const pecaData = await postPecaRes.json();
    assert.ok(pecaData.part && pecaData.part.id);
    const pecaId = pecaData.part.id;

    // 2. Consultar saldos via GET /api/pecas/:id/saldos
    const saldosRes = await fetch(baseUrl + '/api/pecas/' + pecaId + '/saldos', {
      headers: {
        'x-api-key': 'patio-crm-admin-2026',
        'x-tenant-id': tenantIdE2E
      }
    });

    assert.equal(saldosRes.status, 200);
    const saldosData = await saldosRes.json();
    assert.equal(saldosData.saldos.estoqueFisico, 4);
    assert.equal(saldosData.saldos.estoqueDisponivel, 4);

    // 3. Validação de isolamento: Tenant B não consegue ver a peça
    const saldosTenantB = await fetch(baseUrl + '/api/pecas/' + pecaId + '/saldos', {
      headers: {
        'x-api-key': 'patio-crm-admin-2026',
        'x-tenant-id': 'outro_tenant_alheio'
      }
    });
    assert.equal(saldosTenantB.status, 404);

  } finally {
    child.kill();
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}
  }
});
