'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const net = require('node:net');

test('Server Endpoints Fine-Tuning: Validação, Consistência de Respostas e Segurança de Tipos', { timeout: 60000 }, async (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'patio-finetune-test-'));
  const dbPath = path.join(tempDir, 'test.db');
  const uploadDir = path.join(tempDir, 'uploads');
  fs.mkdirSync(uploadDir, { recursive: true });

  const probe = net.createServer();
  probe.listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const port = probe.address().port;
  await new Promise(r => probe.close(r));

  const root = path.resolve(__dirname, '..');
  let childLogs = '';
  const child = spawn(process.execPath, ['server.js'], {
    cwd: root,
    windowsHide: true,
    env: {
      ...process.env,
      PORT: String(port),
      API_KEY: 'test-api-key-finetune',
      AUTH_USER: 'admin_finetune',
      AUTH_PASSWORD: 'SuperPassword123#',
      DB_PATH: dbPath,
      UPLOAD_DIR: uploadDir,
      DISABLE_INTEGRATIONS: 'true'
    }
  });

  let spawnError = null;
  child.on('error', err => { spawnError = err; });
  child.stdout.on('data', d => { childLogs += d; });
  child.stderr.on('data', d => { childLogs += d; });

  t.after(async () => {
    if (child.exitCode === null) {
      const exitDone = once(child, 'exit');
      child.kill();
      await exitDone.catch(() => {});
    }
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
        break;
      } catch (_) {
        await new Promise(r => setTimeout(r, 100));
      }
    }
  });

  let isReady = false;
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (spawnError) throw spawnError;
    if (child.exitCode !== null) {
      throw new Error(`Servidor encerrou prematuramente com código ${child.exitCode}: ${childLogs}`);
    }
    try {
      const res = await fetch(`http://127.0.0.1:${port}/ready`);
      if (res.status === 200) {
        isReady = true;
        break;
      }
    } catch (_) {}
    await new Promise(r => setTimeout(r, 100));
  }

  if (!isReady) {
    throw new Error(`Servidor não atingiu prontidão dentro de 30s. Logs:\n${childLogs}`);
  }

  const authHeaders = {
    'Authorization': 'Basic ' + Buffer.from('admin_finetune:SuperPassword123#').toString('base64'),
    'Content-Type': 'application/json',
    'x-tenant-id': 'default'
  };

  await t.test('1. GET /api/configuracoes/assistente retorna schema consistente e padrão seguro', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/configuracoes/assistente`, { headers: authHeaders });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.ok(body.assistente);
    assert.equal(typeof body.assistente.displayName, 'string');
    assert.equal(typeof body.assistente.voiceGender, 'string');
    assert.equal(typeof body.assistente.pitch, 'number');
    assert.equal(typeof body.assistente.rate, 'number');
  });

  await t.test('2. PUT /api/configuracoes/assistente valida limites de pitch (0.5 a 2.0) e rate sem crash', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/configuracoes/assistente`, {
      method: 'PUT',
      headers: authHeaders,
      body: JSON.stringify({
        displayName: 'Sofia',
        voiceGender: 'female',
        pitch: 99.9, // Deve ser clampado para 2.0
        rate: -5.0   // Deve ser clampado para 0.5
      })
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.assistente.displayName, 'Sofia');
    assert.equal(body.assistente.pitch, 2.0, 'Pitch deve ser limitado a no máximo 2.0');
    assert.equal(body.assistente.rate, 0.5, 'Rate deve ser limitado a no mínimo 0.5');
  });

  await t.test('3. POST /api/estado rejeita payload não-objeto sem lançar 500', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/estado`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify("string_invalida_nao_objeto")
    });
    assert.ok([400, 422].includes(res.status), `Status esperado 400 ou 422, obtido ${res.status}`);
  });
});
