'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const net = require('node:net');
const sqlite3 = require('sqlite3').verbose();

test('P1: Testes Negativos de Prontidão (/ready) - HTTP 503 para Falhas Críticas', { timeout: 90000 }, async (t) => {
  const root = path.resolve(__dirname, '..');

  async function getFreePort() {
    const probe = net.createServer();
    probe.listen(0, '127.0.0.1');
    await once(probe, 'listening');
    const p = probe.address().port;
    await new Promise(r => probe.close(r));
    return p;
  }

  await t.test('1. Falha de Storage: quando diretório de uploads é inacessível, /ready retorna HTTP 503', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'patio-ready-neg-storage-'));
    const dbPath = path.join(tempDir, 'test_ready_storage.db');
    // Criar uploadDir como um arquivo em vez de pasta para causar ENOTDIR na escrita do probe
    const invalidUploadDir = path.join(tempDir, 'uploads_as_file');
    fs.writeFileSync(invalidUploadDir, 'bloqueio_de_diretorio', 'utf8');

    const port = await getFreePort();
    let childLogs = '';
    const child = spawn(process.execPath, ['server.js'], {
      cwd: root,
      windowsHide: true,
      env: {
        ...process.env,
        PORT: String(port),
        API_KEY: 'test-ready-key',
        AUTH_USER: 'patio',
        AUTH_PASSWORD: 'patio-password-test',
        DISABLE_INTEGRATIONS: 'true',
        DISABLE_WHATSAPP: 'true',
        DB_PATH: dbPath,
        UPLOAD_DIR: invalidUploadDir,
        NODE_ENV: 'test'
      }
    });

    child.stdout.on('data', d => { childLogs += d; });
    child.stderr.on('data', d => { childLogs += d; });

    try {
      // Aguarda /health responder 200 (servidor no ar)
      let live = false;
      for (let i = 0; i < 200; i++) {
        if (child.exitCode !== null) break;
        try {
          const res = await fetch(`http://127.0.0.1:${port}/health`);
          if (res.status === 200) { live = true; break; }
        } catch (_) {}
        await new Promise(r => setTimeout(r, 100));
      }
      assert.ok(live, 'Servidor deve estar vivo em /health');

      // Testa /ready que deve retornar HTTP 503 com status 'not_ready'
      const resReady = await fetch(`http://127.0.0.1:${port}/ready`);
      assert.equal(resReady.status, 503, 'Readiness deve falhar com HTTP 503 quando storage falha');
      const dataReady = await resReady.json();
      assert.equal(dataReady.status, 'not_ready');
      assert.ok(dataReady.error, 'Deve conter mensagem de erro descritiva');
    } finally {
      if (child && child.exitCode === null) {
        const exitDone = once(child, 'exit');
        child.kill();
        await exitDone.catch(() => {});
      }
      try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}
    }
  });

  await t.test('2. Falha de Banco de Dados: quando SQLite sofre falha/bloqueio crítico, /ready retorna HTTP 503', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'patio-ready-neg-db-'));
    const dbPath = path.join(tempDir, 'test_ready_db.db');
    const uploadDir = path.join(tempDir, 'uploads');
    fs.mkdirSync(uploadDir, { recursive: true });

    const port = await getFreePort();
    let childLogs = '';
    const child = spawn(process.execPath, [
      '-e',
      `
      const db = require('./db');
      const origGet = db.get;
      let readyCount = 0;
      db.get = function(sql, params) {
        if (typeof sql === 'string' && sql.includes('SELECT 1 as alive')) {
          readyCount++;
          if (readyCount > 1) {
            return Promise.reject(new Error('SQLITE_BUSY: database is locked'));
          }
        }
        return origGet.call(this, sql, params);
      };
      require('./server');
      `
    ], {
      cwd: root,
      windowsHide: true,
      env: {
        ...process.env,
        PORT: String(port),
        API_KEY: 'test-ready-key',
        AUTH_USER: 'patio',
        AUTH_PASSWORD: 'patio-password-test',
        DISABLE_INTEGRATIONS: 'true',
        DISABLE_WHATSAPP: 'true',
        DB_PATH: dbPath,
        UPLOAD_DIR: uploadDir,
        NODE_ENV: 'test'
      }
    });

    child.stdout.on('data', d => { childLogs += d; });
    child.stderr.on('data', d => { childLogs += d; });

    try {
      // 1. Aguarda /ready responder 200 na primeira verificação (inicialização saudável)
      let ready = false;
      for (let i = 0; i < 200; i++) {
        if (child.exitCode !== null) break;
        try {
          const res = await fetch(`http://127.0.0.1:${port}/ready`);
          if (res.status === 200) { ready = true; break; }
        } catch (_) {}
        await new Promise(r => setTimeout(r, 100));
      }
      assert.ok(ready, 'Servidor deve estar pronto inicialmente');

      // 2. Segunda chamada de /ready dispara a falha simulada de banco e deve retornar HTTP 503
      const resReady = await fetch(`http://127.0.0.1:${port}/ready`);
      assert.equal(resReady.status, 503, 'Readiness deve retornar HTTP 503 quando o teste de vida do banco falha');
      const dataReady = await resReady.json();
      assert.equal(dataReady.status, 'not_ready');
      assert.equal(dataReady.error, 'SQLITE_BUSY: database is locked');
    } finally {
      if (child && child.exitCode === null) {
        const exitDone = once(child, 'exit');
        child.kill();
        await exitDone.catch(() => {});
      }
      for (let i = 0; i < 5; i++) {
        try {
          fs.rmSync(tempDir, { recursive: true, force: true });
          break;
        } catch (_) {
          await new Promise(r => setTimeout(r, 100));
        }
      }
    }
  });

  await t.test('3. Status do WhatsApp em /ready reflete estado real e respeita flag de desativação', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'patio-ready-neg-wpp-'));
    const dbPath = path.join(tempDir, 'test_ready_wpp.db');
    const uploadDir = path.join(tempDir, 'uploads');
    fs.mkdirSync(uploadDir, { recursive: true });

    const port = await getFreePort();
    const child = spawn(process.execPath, ['server.js'], {
      cwd: root,
      windowsHide: true,
      env: {
        ...process.env,
        PORT: String(port),
        API_KEY: 'test-ready-key',
        AUTH_USER: 'patio',
        AUTH_PASSWORD: 'patio-password-test',
        DISABLE_INTEGRATIONS: 'false',
        DISABLE_WHATSAPP: 'true',
        DB_PATH: dbPath,
        UPLOAD_DIR: uploadDir,
        NODE_ENV: 'test'
      }
    });

    try {
      let ready = false;
      for (let i = 0; i < 200; i++) {
        if (child.exitCode !== null) break;
        try {
          const res = await fetch(`http://127.0.0.1:${port}/ready`);
          if (res.status === 200) { ready = true; break; }
        } catch (_) {}
        await new Promise(r => setTimeout(r, 100));
      }
      assert.ok(ready, 'Servidor deve estar pronto');

      const resReady = await fetch(`http://127.0.0.1:${port}/ready`);
      assert.equal(resReady.status, 200);
      const data = await resReady.json();
      assert.equal(data.checks.whatsapp, 'disabled', 'Com DISABLE_WHATSAPP=true, o status de WhatsApp deve ser disabled');
    } finally {
      if (child && child.exitCode === null) {
        const exitDone = once(child, 'exit');
        child.kill();
        await exitDone.catch(() => {});
      }
      try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}
    }
  });
});
