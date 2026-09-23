'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const net = require('node:net');

test('P0: Concorrência HTTP Real em /api/comando-voz e Persistência Pós-Reinício', { timeout: 120000 }, async (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'patio-concurrency-voice-'));
  const dbPath = path.join(tempDir, 'test_voice.db');
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

  const confirmedOsIds = [];

  await t.test('1. 20 aberturas de OS simultâneas em /api/comando-voz devem todas persistir no SQLite', async () => {
    const TOTAL = 20;
    const voicePromises = Array.from({ length: TOTAL }).map((_, i) => {
      const idx = String(i + 1).padStart(2, '0');
      const texto = `João, chegou aqui um Onix branco 2021 do Carlos ${idx}. Tá com 82 mil quilômetros. Cliente falou que quando freia, faz um barulho na roda dianteira direita`;
      return fetch(`http://127.0.0.1:${port}/api/comando-voz`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ texto })
      }).then(async res => ({
        status: res.status,
        data: await res.json()
      }));
    });

    const responses = await Promise.all(voicePromises);

    for (let i = 0; i < TOTAL; i++) {
      const r = responses[i];
      assert.ok([200, 201].includes(r.status), `Requisição ${i + 1} deve retornar status 200/201 (recebido: ${r.status}, erro: ${r.data?.error})`);
      assert.equal(r.data.success, true, `Requisição ${i + 1} deve retornar success: true`);
      assert.equal(r.data.acao, 'abrir_os', `Requisição ${i + 1} deve retornar acao: 'abrir_os'`);
      assert.ok(r.data.osId, `Requisição ${i + 1} deve retornar osId gerado`);
      confirmedOsIds.push(r.data.osId);
    }

    // Consulta GET /api/estado para verificar quantas OSs foram gravadas
    const getRes = await fetch(`http://127.0.0.1:${port}/api/estado`, {
      method: 'GET',
      headers: authHeaders
    });
    assert.equal(getRes.status, 200);
    const stateData = await getRes.json();
    const persistedOs = stateData.os || [];

    assert.equal(
      persistedOs.length,
      TOTAL,
      `Exatamente ${TOTAL} OSs devem estar presentes no estado final (encontradas: ${persistedOs.length})`
    );

    const persistedOsIds = new Set(persistedOs.map(o => o.id));
    for (const id of confirmedOsIds) {
      assert.ok(persistedOsIds.has(id), `OS com ID ${id} deve estar persistida no SQLite`);
    }
  });

  await t.test('2. Todas as 20 OSs devem persistir intactas após reinício do servidor', async () => {
    await killServer(child);
    child = await spawnServer();

    const getRes = await fetch(`http://127.0.0.1:${port}/api/estado`, {
      method: 'GET',
      headers: authHeaders
    });
    assert.equal(getRes.status, 200);
    const stateData = await getRes.json();
    const persistedOs = stateData.os || [];

    assert.equal(
      persistedOs.length,
      20,
      `Todas as 20 OSs devem persistir após reinício do servidor (encontradas: ${persistedOs.length})`
    );

    const persistedOsIds = new Set(persistedOs.map(o => o.id));
    for (const id of confirmedOsIds) {
      assert.ok(persistedOsIds.has(id), `OS com ID ${id} deve continuar persistida após o reinício`);
    }
  });

  await t.test('3. Operação de voz concorrendo simultaneamente com criação de peças no mesmo tenant', async () => {
    const COUNT = 5;
    const mixedPromises = [];

    // 5 comandos de voz
    for (let i = 1; i <= COUNT; i++) {
      const idx = String(i + 20).padStart(2, '0');
      const texto = `João, chegou aqui um Scania 2022 do Motorista ${idx}. Tá com 150 mil quilômetros. Revisão geral de freios`;
      mixedPromises.push(
        fetch(`http://127.0.0.1:${port}/api/comando-voz`, {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify({ texto })
        }).then(async r => ({ type: 'voice', status: r.status, data: await r.json() }))
      );
    }

    // 5 criações de peças
    for (let i = 1; i <= COUNT; i++) {
      const idx = String(i).padStart(2, '0');
      mixedPromises.push(
        fetch(`http://127.0.0.1:${port}/api/pecas`, {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify({
            codigoInterno: `VOICE-MIX-${idx}`,
            descricao: `Válvula de Ar Mista ${idx}`,
            precoVenda: 120.00
          })
        }).then(async r => ({ type: 'peca', status: r.status, data: await r.json() }))
      );
    }

    const mixedResults = await Promise.all(mixedPromises);

    const voiceOk = mixedResults.filter(r => r.type === 'voice' && [200, 201].includes(r.status));
    const pecaOk = mixedResults.filter(r => r.type === 'peca' && [200, 201].includes(r.status));

    assert.equal(voiceOk.length, COUNT, 'Todos os 5 comandos de voz devem ter sucesso');
    assert.equal(pecaOk.length, COUNT, 'Todas as 5 peças devem ter sucesso');

    // Confere estado final
    const getRes = await fetch(`http://127.0.0.1:${port}/api/estado`, {
      method: 'GET',
      headers: authHeaders
    });
    const stateData = await getRes.json();
    assert.equal(stateData.os.length, 25, 'Total de 25 OSs devem existir no estado');
    assert.ok(stateData.pecas.some(p => p.codigoInterno === 'VOICE-MIX-01'), 'Peça deve existir no estado');
  });
});
