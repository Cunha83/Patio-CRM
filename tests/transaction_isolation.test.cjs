'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'patio-tx-test-'));
const testDbPath = path.join(tempDir, 'test.db');
process.env.DB_PATH = testDbPath;

const { initDB, run, get, all, transaction, runIndependent, allIndependent, closeDB } = require('../db');

test('Isolamento Transacional & Concorrência Robusta no SQLite (db.js)', async (t) => {
  await initDB();

  t.after(async () => {
    await closeDB().catch(() => {});
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (_) {}
  });

  // Setup de tabela de teste
  await run(`CREATE TABLE IF NOT EXISTS test_isolation (
    id TEXT PRIMARY KEY,
    val TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`);

  // 1. Transação A falha; gravação independente B permanece intacta
  await t.test('1. Transação A falha e sofre rollback; gravação independente B permanece intacta', async () => {
    let independentWriteCompleted = false;

    const txPromise = transaction(async (tx) => {
      await tx.run('INSERT INTO test_isolation VALUES (?, ?, ?)', ['item_A', 'valor_A', new Date().toISOString()]);
      
      // Dispara gravação independente B concorrente (fora de qualquer transação)
      const pB = (async () => {
        // Usa setTimeout para garantir que a gravação B tenta executar enquanto A está aberta
        await new Promise(r => setTimeout(r, 50));
        await runIndependent('INSERT INTO test_isolation VALUES (?, ?, ?)', ['item_B', 'valor_B', new Date().toISOString()]);
        independentWriteCompleted = true;
      })();

      // Aguarda B tentar escrever
      await new Promise(r => setTimeout(r, 120));
      assert.equal(independentWriteCompleted, false, 'Gravação independente B deve aguardar o fim da transação A no SQLite');

      // Força erro e rollback em A
      throw new Error('Falha intencional na transação A');
    }).catch(err => {
      assert.equal(err.message, 'Falha intencional na transação A');
    });

    await txPromise;
    // Aguarda conclusão da gravação B
    for (let i = 0; i < 50; i++) {
      if (independentWriteCompleted) break;
      await new Promise(r => setTimeout(r, 50));
    }
    assert.equal(independentWriteCompleted, true, 'Gravação independente B deve ter sido concluída');

    // Verifica que item_A foi revertido e item_B persiste no banco
    const rowA = await get('SELECT * FROM test_isolation WHERE id = ?', ['item_A']);
    const rowB = await get('SELECT * FROM test_isolation WHERE id = ?', ['item_B']);

    assert.equal(rowA, undefined, 'item_A deve ter sido desfeito pelo rollback');
    assert.ok(rowB, 'item_B deve existir no banco de dados');
    assert.equal(rowB.val, 'valor_B');
  });

  // 2. Operação B não lê alterações não confirmadas de A (Zero dirty reads)
  await t.test('2. Operação B independente não lê alterações não confirmadas de A (Snapshot Isolation)', async () => {
    let uncommittedVisible = null;

    const txPromise = transaction(async (tx) => {
      await tx.run('INSERT INTO test_isolation VALUES (?, ?, ?)', ['item_dirty', 'valor_sujo', new Date().toISOString()]);

      // Leitura externa independente executada enquanto a transação ainda não comitou
      const rowsReadExternally = await allIndependent('SELECT * FROM test_isolation WHERE id = ?', ['item_dirty']);
      uncommittedVisible = rowsReadExternally.length > 0;

      // Desfaz a inserção
      throw new Error('Rollback de dirty read');
    }).catch(() => {});

    await txPromise;
    assert.equal(uncommittedVisible, false, 'Leitura externa não pode ver alterações não confirmadas');
  });

  // 3. Duas transações concorrentes mantêm consistência serializada
  await t.test('3. Duas transações concorrentes serializam e mantêm consistência', async () => {
    const t1 = transaction(async (tx) => {
      await tx.run('INSERT INTO test_isolation VALUES (?, ?, ?)', ['tx1', 'val1', new Date().toISOString()]);
      await new Promise(r => setTimeout(r, 60));
    });

    const t2 = transaction(async (tx) => {
      await tx.run('INSERT INTO test_isolation VALUES (?, ?, ?)', ['tx2', 'val2', new Date().toISOString()]);
      await new Promise(r => setTimeout(r, 30));
    });

    await Promise.all([t1, t2]);

    const rows = await all('SELECT * FROM test_isolation WHERE id IN (?, ?) ORDER BY id', ['tx1', 'tx2']);
    assert.equal(rows.length, 2);
    assert.equal(rows[0].id, 'tx1');
    assert.equal(rows[1].id, 'tx2');
  });

  // 4. Falha intermediária em transação aninhada reverte somente a operação correspondente (Savepoint)
  await t.test('4. Transação aninhada com falha intermediária reverte apenas o bloco interno via Savepoint', async () => {
    await transaction(async (outerTx) => {
      await outerTx.run('INSERT INTO test_isolation VALUES (?, ?, ?)', ['item_outer_1', 'val_out_1', new Date().toISOString()]);

      // Bloco aninhado que falha
      try {
        await transaction(async (innerTx) => {
          await innerTx.run('INSERT INTO test_isolation VALUES (?, ?, ?)', ['item_inner_fail', 'val_fail', new Date().toISOString()]);
          throw new Error('Falha no bloco interno');
        });
      } catch (err) {
        assert.equal(err.message, 'Falha no bloco interno');
      }

      // Bloco externo continua normalmente
      await outerTx.run('INSERT INTO test_isolation VALUES (?, ?, ?)', ['item_outer_2', 'val_out_2', new Date().toISOString()]);
    });

    const rowsOuter1 = await get('SELECT * FROM test_isolation WHERE id = ?', ['item_outer_1']);
    const rowsInner = await get('SELECT * FROM test_isolation WHERE id = ?', ['item_inner_fail']);
    const rowsOuter2 = await get('SELECT * FROM test_isolation WHERE id = ?', ['item_outer_2']);

    assert.ok(rowsOuter1, 'item_outer_1 deve ter sido confirmado');
    assert.equal(rowsInner, undefined, 'item_inner_fail deve ter sido revertido pelo savepoint');
    assert.ok(rowsOuter2, 'item_outer_2 deve ter sido confirmado');
  });

  // 5. Reinício preserva operações confirmadas
  await t.test('5. Reinício e fechamento de conexões preserva rigorosamente operações confirmadas', async () => {
    await transaction(async (tx) => {
      await tx.run('INSERT INTO test_isolation VALUES (?, ?, ?)', ['item_persistente', 'gravado', new Date().toISOString()]);
    });

    // Simula reinício fechando o banco e reabrindo
    await closeDB();
    await initDB();

    const row = await get('SELECT * FROM test_isolation WHERE id = ?', ['item_persistente']);
    assert.ok(row, 'Registro deve existir após reabertura do banco');
    assert.equal(row.val, 'gravado');
  });

  // 6. Conexões e processos independentes exercitam a concorrência real do SQLite
  await t.test('6. Processo externo em paralelo grava com concorrência real no arquivo SQLite', async () => {
    const childScript = `
      const path = require('path');
      process.env.DB_PATH = '${testDbPath.replace(/\\/g, '\\\\')}';
      const { initDB, run, closeDB } = require('./db');

      (async () => {
        await initDB();
        await run('INSERT INTO test_isolation VALUES (?, ?, ?)', ['item_subprocesso', 'val_subprocesso', new Date().toISOString()]);
        await closeDB();
        process.exit(0);
      })().catch(err => {
        console.error(err);
        process.exit(1);
      });
    `;

    const child = spawn(process.execPath, ['-e', childScript], {
      cwd: path.resolve(__dirname, '..'),
      timeout: 5000
    });

    const [code] = await require('node:events').once(child, 'exit');
    assert.equal(code, 0, 'Subprocesso deve gravar com sucesso no SQLite em WAL mode');

    const rowSub = await get('SELECT * FROM test_isolation WHERE id = ?', ['item_subprocesso']);
    assert.ok(rowSub, 'Registro do subprocesso deve existir no banco principal');
    assert.equal(rowSub.val, 'val_subprocesso');
  });
});
