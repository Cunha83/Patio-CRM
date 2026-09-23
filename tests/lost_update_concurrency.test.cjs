'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { initDB, closeDB } = require('../db');
const { createWriteQueue } = require('../lib/core');
const { getState, persistState, mutateState, getDefaultState } = require('../lib/repository/stateRepository');

test('P0: Proteção contra Lost Update e Concorrência Atômica', async (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'patio-lost-update-test-'));
  const dbPath = path.join(tempDir, 'lost_update.db');
  process.env.DB_PATH = dbPath;
  await initDB(dbPath);

  const enqueueWrite = createWriteQueue();

  t.after(async () => {
    try {
      await enqueueWrite(() => closeDB());
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (_) {}
  });

  const tenantId = 'oficina_concorrente';
  const context = {
    tenantId,
    actorId: 'test_user',
    role: 'admin',
    permissions: ['*'],
    channel: 'internal'
  };

  // Inicializa estado vazio para o tenant
  const initial = getDefaultState(tenantId);
  initial.clientes = [];
  initial.veiculos = [];
  initial.os = [];
  initial.versao = 0;
  const resInit = await persistState(context, initial, { enqueueWrite, force: true });
  assert.equal(resInit.ok, true);
  const versaoInicial = resInit.versao;

  await t.test('1. Conflito otimista 409: persistState detecta e rejeita versão obsoleta', async () => {
    // Leitura 1 e Leitura 2 obtêm a mesma versão
    const readA = await getState(tenantId);
    const readB = await getState(tenantId);
    assert.equal(readA.versao, versaoInicial);
    assert.equal(readB.versao, versaoInicial);

    // Gravação A adiciona cliente
    readA.clientes.push({ id: 'c1', nome: 'Cliente Concorrente 1' });
    const resA = await persistState(context, readA, { enqueueWrite });
    assert.equal(resA.ok, true, 'Gravação A deve ser bem-sucedida');
    assert.ok(resA.versao > versaoInicial, 'Versão deve ser incrementada');

    // Gravação B tenta gravar com a versão antiga
    readB.veiculos.push({ id: 'v1', placa: 'CON0001' });
    const resB = await persistState(context, readB, { enqueueWrite });
    assert.equal(resB.ok, false, 'Gravação B com versão obsoleta deve falhar');
    assert.equal(resB.status, 409, 'Status retornado deve ser 409 Conflito');
    assert.equal(resB.conflict, true);

    // Estado persistido preservou o cliente da gravação A
    const estadoFinal = await getState(tenantId);
    assert.equal(estadoFinal.clientes.length, 1);
    assert.equal(estadoFinal.clientes[0].id, 'c1');
    assert.equal(estadoFinal.veiculos.length, 0, 'Veículo não deve ter sobrescrito o cliente');
  });

  await t.test('2. Mutação Atômica: mutateState serializa alterações simultâneas sem perder dados', async () => {
    const tid2 = 'oficina_mutate_atomic';
    const ctx2 = { ...context, tenantId: tid2 };

    const init2 = getDefaultState(tid2);
    init2.clientes = [];
    init2.veiculos = [];
    init2.versao = 0;
    await persistState(ctx2, init2, { enqueueWrite, force: true });

    // Dispara simultaneamente duas mutações atômicas independentes
    const p1 = mutateState(ctx2, async (draft) => {
      await new Promise(r => setTimeout(r, 15));
      draft.clientes.push({ id: 'c_atomic_1', nome: 'Cliente Atômico 1' });
    }, { enqueueWrite });

    const p2 = mutateState(ctx2, async (draft) => {
      await new Promise(r => setTimeout(r, 10));
      draft.veiculos.push({ id: 'v_atomic_1', placa: 'ATO1111' });
    }, { enqueueWrite });

    const [r1, r2] = await Promise.all([p1, p2]);
    assert.equal(r1.ok, true, 'Mutação 1 deve ter sucesso');
    assert.equal(r2.ok, true, 'Mutação 2 deve ter sucesso');

    // Ambas as alterações devem estar presentes no estado final
    const finalState = await getState(tid2);
    assert.equal(finalState.clientes.length, 1, 'Cliente deve ser preservado');
    assert.equal(finalState.clientes[0].id, 'c_atomic_1');
    assert.equal(finalState.veiculos.length, 1, 'Veículo deve ser preservado');
    assert.equal(finalState.veiculos[0].placa, 'ATO1111');
  });

  await t.test('3. Isolamento Multi-tenant: operações concorrentes em tenants diferentes não se interferem', async () => {
    const tidA = 'oficina_iso_a';
    const tidB = 'oficina_iso_b';
    const ctxA = { ...context, tenantId: tidA };
    const ctxB = { ...context, tenantId: tidB };

    await Promise.all([
      mutateState(ctxA, async (draft) => {
        draft.clientes = [{ id: 'cli_a', nome: 'Tenant A Exclusivo' }];
      }, { enqueueWrite }),
      mutateState(ctxB, async (draft) => {
        draft.clientes = [{ id: 'cli_b', nome: 'Tenant B Exclusivo' }];
      }, { enqueueWrite })
    ]);

    const [stA, stB] = await Promise.all([
      getState(tidA),
      getState(tidB)
    ]);

    assert.equal(stA.clientes.length, 1);
    assert.equal(stA.clientes[0].id, 'cli_a');
    assert.equal(stB.clientes.length, 1);
    assert.equal(stB.clientes[0].id, 'cli_b');
  });

  await t.test('4. Mutação Atômica sem options.enqueueWrite: utiliza a fila canônica interna por tenant e preserva concorrência', async () => {
    const tid3 = 'oficina_canonical_queue';
    const ctx3 = { ...context, tenantId: tid3 };

    const init3 = getDefaultState(tid3);
    init3.clientes = [];
    init3.veiculos = [];
    init3.versao = 0;
    await persistState(ctx3, init3, { force: true });

    // Dispara 5 mutações simultâneas SEM passar options.enqueueWrite
    const promises = Array.from({ length: 5 }).map((_, i) =>
      mutateState(ctx3, async (draft) => {
        await new Promise(r => setTimeout(r, Math.floor(Math.random() * 20)));
        draft.clientes.push({ id: `c_canon_${i}`, nome: `Cliente Canon ${i}` });
      })
    );

    const results = await Promise.all(promises);
    for (const r of results) {
      assert.equal(r.ok, true, 'Cada mutação deve ter sucesso');
    }

    const finalState = await getState(tid3);
    assert.equal(finalState.clientes.length, 5, 'Todos os 5 clientes devem ter sido persistidos sem lost update');
  });
});

