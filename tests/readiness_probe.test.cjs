'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');
const { once } = require('events');

test('P1: Teste de Prontidão (/ready) - Sucesso e Falhas Críticas', { timeout: 60000 }, async (t) => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'patio-ready-test-'));
  const uploadsTemp = path.join(temp, 'uploads');
  fs.mkdirSync(uploadsTemp, { recursive: true });
  const dbPath = path.join(temp, 'test_ready.db');

  const root = path.resolve(__dirname, '..');
  let child;
  let port;

  async function startServer(customEnv = {}) {
    const probe = http.createServer();
    probe.listen(0, '127.0.0.1');
    await once(probe, 'listening');
    port = probe.address().port;
    await new Promise(r => probe.close(r));

    child = spawn(process.execPath, ['server.js'], {
      cwd: root,
      windowsHide: true,
      env: {
        ...process.env,
        PORT: String(port),
        API_KEY: 'test-ready-key',
        AUTH_USER: 'patio',
        AUTH_PASSWORD: 'patio-password-test',
        DISABLE_INTEGRATIONS: 'true',
        DB_PATH: dbPath,
        UPLOAD_DIR: uploadsTemp,
        ...customEnv
      }
    });

    for (let i = 0; i < 400; i++) {
      if (child.exitCode !== null) throw Error('Falha ao iniciar servidor de teste');
      try {
        const res = await fetch(`http://127.0.0.1:${port}/health`);
        if (res.status === 200) return;
      } catch (_) {}
      await new Promise(r => setTimeout(r, 100));
    }
    throw Error('Timeout ao aguardar servidor.');
  }

  async function stopServer() {
    if (child && child.exitCode === null) {
      const done = once(child, 'exit');
      child.kill();
      await done;
    }
  }

  t.after(async () => {
    await stopServer();
    fs.rmSync(temp, { recursive: true, force: true });
  });

  await startServer();

  await t.test('1. /ready retorna 200 com componentes reais em ambiente saudável', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/ready`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.status, 'ready');
    assert.equal(data.checks.database, 'ok');
    assert.equal(data.checks.storage, 'ok');
    assert.equal(data.checks.scheduler, 'disabled');
    assert.equal(data.checks.whatsapp, 'disabled');
    assert.equal(data.checks.ai, 'disabled');
    assert.equal(data.checks.fiscal, 'homologacao_only');
  });

  await t.test('2. /health retorna versão síncrona com package.json', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/health`);
    assert.equal(res.status, 200);
    const data = await res.json();
    const pkg = require('../package.json');
    assert.equal(data.version, pkg.version);
  });
});
