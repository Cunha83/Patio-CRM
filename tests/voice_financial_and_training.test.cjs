'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const voiceEngine = require('../services/voiceActionEngine');
const financialEngine = require('../services/financialEngine');

test('Motor Inteligente de Voz: Consultas Financeiras, Almoxarifado e Treinamento', async (t) => {
  const mockState = {
    versao: 1,
    boxes: [
      { id: 'b1', nome: 'Box 01 — Mecânica Pesada', tipo: 'Geral' },
      { id: 'b2', nome: 'Box 02 — Alinhamento Laser', tipo: 'Alinhamento' }
    ],
    clientes: [
      { id: 'c1', nome: 'Transportes TransRodrigues Ltda', fone: '(11) 98888-1111' },
      { id: 'c2', nome: 'Logística Modelo S/A', fone: '(19) 97777-2222' }
    ],
    veiculos: [
      { id: 'v1', cli: 'c1', placa: 'BRA2E19', modelo: 'Scania R450' }
    ],
    os: [
      { id: 'os1', num: 1001, box: 'b1', vei: 'v1', cli: 'c1', st: 'executando', total: 3500.00 }
    ],
    pecas: [
      { id: 'p1', cod: 'MOL-01', nome: 'Lâmina Mestra Scania', qtd: 2, min: 5, custo: 450, venda: 950, loc: 'Prateleira A2' },
      { id: 'p2', cod: 'FIL-02', nome: 'Filtro Racor Parker', qtd: 20, min: 10, custo: 120, venda: 280, loc: 'Corredor B1' }
    ],
    servicos: [
      { id: 's1', nome: 'Alinhamento de Eixo Duplo', valor: 650.00 }
    ],
    financeiro: {
      faturamentoTotal: 15400.00,
      saldoInicial: 5000.00
    },
    contas: [
      { id: 'cnt1', tipo: 'pagar', desc: 'Distribuidora de Molas Brasil', valor: 2800.00, venc: '2026-09-20', pago: false, parte: 'Distribuidora Molas' },
      { id: 'cnt2', tipo: 'pagar', desc: 'Aluguel do Galpão da Oficina', valor: 4500.00, venc: '2026-09-25', pago: false, parte: 'Imobiliária Central' },
      { id: 'cnt3', tipo: 'pagar', desc: 'Conta de Energia Elétrica', valor: 850.00, venc: '2026-09-15', pago: true, parte: 'CPFL Energia' },
      { id: 'cnt4', tipo: 'receber', desc: 'Fatura OS 1000 — TransRodrigues', valor: 6200.00, venc: '2026-09-22', pago: false, parte: 'TransRodrigues' }
    ],
    movimentos: [
      { id: 'm1', tipo: 'entrada', valor: 6000.00, data: '2026-09-10' },
      { id: 'm2', tipo: 'saida', valor: 1500.00, data: '2026-09-12' }
    ]
  };

  const finContext = { role: 'financeiro', permissions: ['financial:read'], tenantId: 'default' };

  await t.test('1. Consulta de Próximos Vencimentos a Pagar', async () => {
    const res = await voiceEngine.interpretarEExecutar({
      input: 'quais os próximos vencimentos a pagar?',
      context: finContext,
      state: mockState
    });

    assert.equal(res.ok, true);
    assert.equal(res.acao, 'consultar_financeiro');
    assert.ok(res.resposta, 'Deve conter resposta explicativa');
    assert.ok(res.resposta.includes('2.800') || res.resposta.includes('2800') || res.resposta.includes('Molas'), 'Deve citar dados da conta a pagar');
    assert.ok(!res.resposta.includes('Entendido. Como posso ajudar com a oficina?'), 'NÃO deve cair no fallback genérico');
  });

  await t.test('2. Consulta de Contas a Receber', async () => {
    const res = await voiceEngine.interpretarEExecutar({
      input: 'quanto temos para receber de clientes?',
      context: finContext,
      state: mockState
    });

    assert.equal(res.ok, true);
    assert.equal(res.acao, 'consultar_financeiro');
    assert.ok(res.resposta.includes('6.200') || res.resposta.includes('6200') || res.resposta.includes('receber'), 'Deve informar valores a receber');
    assert.ok(!res.resposta.includes('Entendido. Como posso ajudar com a oficina?'));
  });

  await t.test('3. Consulta de Saldo de Caixa', async () => {
    const res = await voiceEngine.interpretarEExecutar({
      input: 'qual o saldo atual do caixa?',
      context: finContext,
      state: mockState
    });

    assert.equal(res.ok, true);
    assert.equal(res.acao, 'consultar_financeiro');
    assert.ok(res.resposta.includes('saldo') || res.resposta.includes('caixa'), 'Deve mencionar saldo');
    assert.ok(res.resposta.includes('R$'), 'Deve formatar em moeda brasileira');
    assert.ok(!res.resposta.includes('Entendido. Como posso ajudar com a oficina?'));
  });

  await t.test('4. Consulta de Peças em Falta / Estoque Crítico', async () => {
    const res = await voiceEngine.interpretarEExecutar({
      input: 'quais peças estão com estoque baixo para repor?',
      state: mockState
    });

    assert.equal(res.ok, true);
    assert.equal(res.acao, 'consultar_estoque');
    assert.ok(res.resposta.includes('Lâmina Mestra') || res.resposta.includes('MOL-01'), 'Deve listar a peça crítica');
    assert.ok(!res.resposta.includes('Entendido. Como posso ajudar com a oficina?'));
  });

  await t.test('5. Dúvida de Treinamento: Como Cadastrar Cliente', async () => {
    const res = await voiceEngine.interpretarEExecutar({
      input: 'como faço para cadastrar um novo cliente?',
      state: mockState
    });

    assert.equal(res.ok, true);
    assert.equal(res.acao, 'ajuda_sistema_treinamento');
    assert.ok(res.resposta.includes('Cadastros') && res.resposta.includes('Cliente'), 'Deve orientar acesso ao menu');
    assert.ok(res.resposta.includes('CNPJ') || res.resposta.includes('CPF'), 'Deve citar documento');
    assert.ok(!res.resposta.includes('Entendido. Como posso ajudar com a oficina?'));
  });

  await t.test('6. Dúvida de Treinamento: Como Abrir Ordem de Serviço', async () => {
    const res = await voiceEngine.interpretarEExecutar({
      input: 'como abrir uma ordem de serviço no pátio?',
      state: mockState
    });

    assert.equal(res.ok, true);
    assert.equal(res.acao, 'ajuda_sistema_treinamento');
    assert.ok(res.resposta.includes('Pátio') || res.resposta.includes('Nova OS'), 'Deve orientar abertura');
    assert.ok(!res.resposta.includes('Entendido. Como posso ajudar com a oficina?'));
  });

  await t.test('7. Dúvida de Treinamento: Como Emitir Nota Fiscal', async () => {
    const res = await voiceEngine.interpretarEExecutar({
      input: 'como emitir nota fiscal no sistema?',
      state: mockState
    });

    assert.equal(res.ok, true);
    assert.equal(res.acao, 'ajuda_sistema_treinamento');
    assert.ok(res.resposta.includes('Nota') || res.resposta.includes('Fiscal') || res.resposta.includes('NF-e'), 'Deve orientar emissão fiscal');
    assert.ok(!res.resposta.includes('Entendido. Como posso ajudar com a oficina?'));
  });
});
