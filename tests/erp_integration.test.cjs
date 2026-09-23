'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { initDB, run, get } = require('../db');
const erpIntegrationService = require('../services/erpIntegrationService');

test('Camada Canônica de Integração com ERP Fiscal & Contábil Externo', async (t) => {
  await initDB();

  const mockState = {
    clientes: [
      { id: 1, nome: 'Transportadora Rápido Soluções LTDA', doc: '12.345.678/0001-90', fone: '(11) 98765-4321', email: 'contato@rapido.com' },
      { id: 2, nome: 'João da Silva', doc: '123.456.789-00', fone: '11999998888', email: 'joao@silva.com' }
    ],
    fornecedores: [
      { id: 10, razaoSocial: 'Distribuidora Molas Brasil LTDA', cnpj: '98.765.432/0001-10', fone: '1133334444' }
    ],
    pecas: [
      { id: 101, codigo: 'ML-502', nome: 'Mola Mestra Dianteira MB 1620', fabricante: 'Fabrini', precoVenda: 650, custoMedio: 380, estoque: 8, un: 'PC' }
    ],
    os: [
      {
        id: 5001,
        placa: 'BRA2E19',
        clienteId: 1,
        clienteNome: 'Transportadora Rápido Soluções LTDA',
        st: 'finalizada',
        abertura: '2026-09-10T08:00:00.000Z',
        termino: '2026-09-12T17:30:00.000Z',
        servicos: [{ id: 1, nome: 'Arqueamento de Molas', preco: 400 }],
        pecas: [{ partId: 101, nome: 'Mola Mestra Dianteira MB 1620', qtd: 2, preco: 650, unitCost: 380 }],
        totalServicos: 400,
        totalPecas: 1300,
        total: 1700
      }
    ],
    contas: [
      { id: 'cnt_1', desc: 'Faturamento OS #5001', valor: 1700, tipo: 'receber', status: 'pago', vencimento: '2026-09-12', pagamento: '2026-09-12', formaPagto: 'pix' },
      { id: 'cnt_2', desc: 'Compra Aço Distribuidora Molas', valor: 3000, tipo: 'pagar', status: 'pendente', vencimento: '2026-09-30' }
    ],
    pedidosCompra: [
      {
        id: 'po_99',
        supplierName: 'Distribuidora Molas Brasil LTDA',
        status: 'received',
        total: 760,
        createdAt: '2026-09-08T10:00:00.000Z',
        receivedAt: '2026-09-10T14:00:00.000Z',
        items: [{ partId: 101, name: 'Mola Mestra Dianteira MB 1620', quantity: 2, unitCost: 380 }]
      }
    ]
  };

  await t.test('1. Exportação canônica de Clientes com normalização e CPF/CNPJ', () => {
    const res = erpIntegrationService.exportarClientes({ state: mockState });
    assert.equal(res.count, 2);
    assert.equal(res.items[0].erpSyncId, 'cli_1');
    assert.equal(res.items[0].schemaVersion, '1.0.0');
    assert.equal(res.items[0].tipoPessoa, 'J');
    assert.equal(res.items[0].cpfCnpj, '12345678000190');

    assert.equal(res.items[1].erpSyncId, 'cli_2');
    assert.equal(res.items[1].tipoPessoa, 'F');
    assert.equal(res.items[1].cpfCnpj, '12345678900');
  });

  await t.test('2. Exportação canônica de Peças com custo médio e margem para o ERP', () => {
    const res = erpIntegrationService.exportarPecas({ state: mockState });
    assert.equal(res.count, 1);
    const p = res.items[0];
    assert.equal(p.erpSyncId, 'pec_101');
    assert.equal(p.codigo, 'ML-502');
    assert.equal(p.precoVenda, 650);
    assert.equal(p.custoMedio, 380);
    assert.equal(p.estoqueAtual, 8);
  });

  await t.test('3. Exportação canônica de Ordens de Serviço (separando peças, serviços e totais)', () => {
    const res = erpIntegrationService.exportarOrdensServico({ state: mockState });
    assert.equal(res.count, 1);
    const os = res.items[0];
    assert.equal(os.erpSyncId, 'os_5001');
    assert.equal(os.veiculo.placa, 'BRA2E19');
    assert.equal(os.status, 'finalizada');
    assert.equal(os.totalServicos, 400);
    assert.equal(os.totalPecas, 1300);
    assert.equal(os.totalGeral, 1700);
    assert.equal(os.itensServico.length, 1);
    assert.equal(os.itensPeca.length, 1);
  });

  await t.test('4. Exportação canônica de Movimentos Financeiros Gerenciais (Contas a Pagar/Receber)', () => {
    const res = erpIntegrationService.exportarContas({ state: mockState });
    assert.equal(res.count, 2);
    const c1 = res.items[0];
    assert.equal(c1.erpSyncId, 'cta_cnt_1');
    assert.equal(c1.natureza, 'RECEITA');
    assert.equal(c1.valor, 1700);
    assert.equal(c1.status, 'pago');
    assert.equal(c1.regime, 'CAIXA_GERENCIAL');
  });

  await t.test('5. Paginação com cursor', () => {
    const stateMany = {
      clientes: Array.from({ length: 25 }, (_, i) => ({
        id: i + 1,
        nome: `Cliente ${i + 1}`,
        doc: '12345678900'
      }))
    };

    const pag1 = erpIntegrationService.exportarClientes({ state: stateMany, limit: 10 });
    assert.equal(pag1.count, 10);
    assert.equal(pag1.nextCursor, 10);

    const pag2 = erpIntegrationService.exportarClientes({ state: stateMany, limit: 10, cursor: 10 });
    assert.equal(pag2.count, 10);
    assert.equal(pag2.items[0].id, 11);
    assert.equal(pag2.nextCursor, 20);

    const pag3 = erpIntegrationService.exportarClientes({ state: stateMany, limit: 10, cursor: 20 });
    assert.equal(pag3.count, 5);
    assert.equal(pag3.nextCursor, null);
  });

  await t.test('6. Fila Outbox do ERP: enfileiramento, atualização de sincronização e status', async () => {
    const tenantId = `tenant_erp_${Date.now()}`;

    // 1. Enfileira evento de OS finalizada
    const enq = await erpIntegrationService.enfileirarParaERP({
      tenantId,
      entityType: 'os',
      entityId: '5001',
      action: 'finalizada',
      payload: { osId: 5001, total: 1700 }
    });
    assert.equal(enq.ok, true);
    assert.ok(enq.outboxId);

    // 2. Consulta status inicial
    const status1 = await erpIntegrationService.obterStatusIntegracao({ tenantId });
    assert.equal(status1.outbox.pendentes, 1);
    assert.equal(status1.outbox.sincronizados, 0);

    // 3. Simula ERP confirmando sincronismo com sucesso
    const syncRes = await erpIntegrationService.registrarSincronizacao({
      tenantId,
      entityType: 'os',
      entityId: '5001',
      erpExternalId: 'ERP_TOTVS_OS_99881',
      status: 'synced'
    });
    assert.equal(syncRes.ok, true);

    // 4. Consulta status após sync
    const status2 = await erpIntegrationService.obterStatusIntegracao({ tenantId });
    assert.equal(status2.outbox.pendentes, 0);
    assert.equal(status2.outbox.sincronizados, 1);
    assert.ok(status2.outbox.ultimoSincronismo);
  });
});
