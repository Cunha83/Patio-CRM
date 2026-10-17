// Costing and DRE unit tests
const { test } = require('node:test');
const assert = require('node:assert/strict');
const costingService = require('../services/costingService');

/** Helper to build a minimal state */
function buildState(overrides = {}) {
  const base = {
    os: [
      {
        id: 'os1',
        tenantId: 't1',
        servicos: [{ preco: 100 }],
        pecas: [{ preco: 50 }],
        custosAdicionais: 10,
        desc: 5,
        st: 'aberto'
      }
    ],
    workers: [{ id: 'w1', tenantId: 't1', custoHora: 20 }],
    laborEntries: [
      {
        tenantId: 't1',
        osId: 'os1',
        workerId: 'w1',
        durationMinutes: 60,
        type: 'normal'
      }
    ],
    inventoryMovements: [],
    pecas: []
  };
  return { ...base, ...overrides };
}

test('obterDREPorOS returns correct DRE for profitable OS', async () => {
  const state = buildState();
  const dre = costingService.obterDREPorOS({ tenantId: 't1', state, osId: 'os1' });
  // Verify key fields
  assert.strictEqual(dre.custoMaoObra, 20, 'custoMaoObra should be 20');
  assert.strictEqual(dre.custoPecasConsumidas, 0, 'no parts movements, cost should be 0');
  assert.strictEqual(dre.custosAdicionais, 10);
  assert.strictEqual(dre.custoRealOS, 30);
  assert.strictEqual(dre.receitaServicos, 100);
  assert.strictEqual(dre.receitaPecas, 50);
  assert.strictEqual(dre.descontoGeral, 5);
  assert.strictEqual(dre.receitaAutorizada, 145);
  assert.strictEqual(dre.margemBrutaOS, 115);
  // margemPercentual rounded to 1 decimal place
  assert.strictEqual(dre.margemPercentual, 79.3);
});

test('obterDREPorOS handles loss scenario with high parts cost', async () => {
  const state = buildState({
    os: [
      {
        id: 'os2',
        tenantId: 't1',
        servicos: [{ preco: 50 }],
        pecas: [{ preco: 200 }], // high parts revenue but we will simulate high cost via movements
        custosAdicionais: 0,
        desc: 0,
        st: 'aberto'
      }
    ],
    // Simulate part consumption with unitCost 250 (higher than revenue)
    inventoryMovements: [
      {
        tenantId: 't1',
        osId: 'os2',
        type: 'saida_os',
        partId: 'p1',
        quantity: 1,
        unitCost: 250
      }
    ],
    pecas: [
      { id: 'p1', descricao: 'Peça cara', custoMedio: 250 }
    ]
  });
  const dre = costingService.obterDREPorOS({ tenantId: 't1', state, osId: 'os2' });
  // Parts cost should be 250, labor cost 0 (no entries)
  assert.strictEqual(dre.custoPecasConsumidas, 250);
  assert.strictEqual(dre.custoMaoObra, 0);
  assert.strictEqual(dre.custoRealOS, 250);
  assert.strictEqual(dre.receitaServicos, 50);
  assert.strictEqual(dre.receitaPecas, 200);
  assert.strictEqual(dre.receitaAutorizada, 250);
  // Margem Bruta should be 0 (break-even)
  assert.strictEqual(dre.margemBrutaOS, 0);
  assert.strictEqual(dre.margemPercentual, 0);
});
