'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const net = require('node:net');

test('P0: Concorrência HTTP Real em /api/fornecedores e Persistência Pós-Reinício', { timeout: 90000 }, async (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'patio-concurrency-fornecedores-'));
  const dbPath = path.join(tempDir, 'test_fornecedores.db');
  const uploadDir = path.join(tempDir, 'uploads');
  const backupDir = path.join(tempDir, 'backups');
  fs.mkdirSync(uploadDir, { recursive: true });
  fs.mkdirSync(backupDir, { recursive: true });

  const root = path.resolve(__dirname, '..');
  let child;
  let port;

  async function getFreePort() {
    const s = net.createServer();
    s.listen(0, '127.0.0.1');
    await once(s, 'listening');
    const p = s.address().port;
    await new Promise(r => s.close(r));
    return p;
  }

  async function spawnServer() {
    port = await getFreePort();
    let childLogs = '';
    const proc = spawn(process.execPath, ['server.js'], {
      cwd: root,
      windowsHide: true,
      env: {
        ...process.env,
        PORT: String(port),
        API_KEY: 'test-concurrency-key',
        AUTH_USER: 'test_admin',
        AUTH_PASSWORD: 'PasswordTestAdmin123#',
        DB_PATH: dbPath,
        UPLOAD_DIR: uploadDir,
        BACKUP_DIR: backupDir,
        DISABLE_INTEGRATIONS: 'true',
        DISABLE_WHATSAPP: 'true',
        NODE_ENV: 'test'
      }
    });

    proc.stdout.on('data', d => { childLogs += d; });
    proc.stderr.on('data', d => { childLogs += d; });

    const deadline = Date.now() + 30000;
    let ready = false;
    while (Date.now() < deadline) {
      if (proc.exitCode !== null) {
        throw new Error(`Servidor encerrou prematuramente (${proc.exitCode}): ${childLogs.slice(0, 500)}`);
      }
      try {
        const res = await fetch(`http://127.0.0.1:${port}/ready`);
        if (res.status === 200) {
          ready = true;
          break;
        }
      } catch (_) {}
      await new Promise(r => setTimeout(r, 100));
    }

    if (!ready) {
      proc.kill();
      throw new Error(`Timeout aguardando servidor na porta ${port}. Logs: ${childLogs.slice(0, 500)}`);
    }

    return proc;
  }

  async function killServer(proc) {
    if (proc && proc.exitCode === null) {
      const exitPromise = once(proc, 'exit');
      proc.kill();
      await exitPromise.catch(() => {});
    }
  }

  child = await spawnServer();

  t.after(async () => {
    await killServer(child);
    for (let i = 0; i < 5; i++) {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
        break;
      } catch (_) {
        await new Promise(r => setTimeout(r, 150));
      }
    }
  });

  const authHeaders = {
    'Authorization': 'Basic ' + Buffer.from('test_admin:PasswordTestAdmin123#').toString('base64'),
    'x-api-key': 'test-concurrency-key',
    'Content-Type': 'application/json',
    'x-tenant-id': 'default'
  };

  await t.test('1. 20 POSTs simultâneos em /api/fornecedores devem todos persistir sem falso sucesso', async () => {
    const TOTAL = 20;
    const postPromises = Array.from({ length: TOTAL }).map((_, i) => {
      const idx = String(i + 1).padStart(2, '0');
      const razaoSocial = `Fornecedor Distribuidora ${idx} Ltda`;
      const nome = `Distribuidora ${idx}`;
      const documento = `12.345.678/0001-${idx}`;
      return fetch(`http://127.0.0.1:${port}/api/fornecedores`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          razaoSocial,
          nome,
          documento,
          fone: `(11) 98765-43${idx}`,
          email: `contato@distribuidora${idx}.com.br`,
          prazoMedioDias: 3,
          condicoesPagamento: '28 DDL'
        })
      }).then(async res => ({
        status: res.status,
        data: await res.json()
      }));
    });

    const responses = await Promise.all(postPromises);

    // Todos devem ter tido sucesso com status 200 ou 201
    const confirmedIds = [];
    for (let i = 0; i < TOTAL; i++) {
      const r = responses[i];
      assert.ok([200, 201].includes(r.status), `Requisição ${i + 1} deve retornar status 200 ou 201 (recebido: ${r.status}, erro: ${r.data?.error})`);
      assert.equal(r.data.success, true, `Requisição ${i + 1} deve indicar success: true`);
      assert.ok(r.data.supplier && r.data.supplier.id, `Requisição ${i + 1} deve retornar o objeto supplier com id`);
      confirmedIds.push(r.data.supplier.id);
    }

    // Consulta GET /api/fornecedores
    const getRes = await fetch(`http://127.0.0.1:${port}/api/fornecedores`, {
      method: 'GET',
      headers: authHeaders
    });
    assert.equal(getRes.status, 200);
    const getData = await getRes.json();
    assert.equal(getData.success, true);
    assert.equal(
      getData.fornecedores.length,
      TOTAL,
      `Exatamente ${TOTAL} fornecedores devem estar presentes no GET (encontrados: ${getData.fornecedores.length})`
    );

    // Confere se todos os IDs confirmados existem no retorno
    const persistedIds = new Set(getData.fornecedores.map(f => f.id));
    for (const id of confirmedIds) {
      assert.ok(persistedIds.has(id), `Fornecedor com ID ${id} deve estar presente no GET`);
    }
  });

  await t.test('2. Todos os 20 fornecedores devem persistir intactos após reinício do servidor', async () => {
    // Encerra processo atual
    await killServer(child);

    // Sobe novo processo com o mesmo banco
    child = await spawnServer();

    // Consulta GET /api/fornecedores no novo processo
    const getRes = await fetch(`http://127.0.0.1:${port}/api/fornecedores`, {
      method: 'GET',
      headers: authHeaders
    });
    assert.equal(getRes.status, 200);
    const getData = await getRes.json();
    assert.equal(getData.success, true);
    assert.equal(
      getData.fornecedores.length,
      20,
      `Todos os 20 fornecedores devem persistir após reinício do servidor (encontrados: ${getData.fornecedores.length})`
    );

    // Valida que os documentos de todos os 20 fornecedores estão presentes
    const docs = new Set(getData.fornecedores.map(f => f.documento));
    for (let i = 1; i <= 20; i++) {
      const idx = String(i).padStart(2, '0');
      const esperado = `12.345.678/0001-${idx}`;
      assert.ok(docs.has(esperado), `Fornecedor com documento "${esperado}" deve existir após o reinício`);
    }
  });
});
