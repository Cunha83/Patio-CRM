'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const manifestJsonPath = path.join(rootDir, 'docs', 'operacao', 'manifesto_release.json');

test('P1: Validação de Instalação Limpa a Partir do Manifesto de Release', async (t) => {
  assert.ok(fs.existsSync(manifestJsonPath), 'manifesto_release.json deve existir');
  const manifestData = JSON.parse(fs.readFileSync(manifestJsonPath, 'utf8'));

  assert.ok(manifestData.totalArquivosAuditados > 100, 'Deve conter mais de 100 arquivos auditados');
  assert.ok(manifestData.arquivos['public/aprovacao.html'], 'Recursos de public/ devem estar no manifesto');
  assert.ok(manifestData.arquivos['public/support/inbox.html'], 'Recursos de public/support devem estar no manifesto');

  const cleanRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'patio-clean-install-'));

  await t.test('1. Todos os arquivos mapeados conferem SHA-256 no repositório', () => {
    for (const [relPath, expectedSha] of Object.entries(manifestData.arquivos)) {
      const fullPath = path.join(rootDir, relPath);
      assert.ok(fs.existsSync(fullPath), `Arquivo deve existir: ${relPath}`);
      const actualSha = crypto.createHash('sha256').update(fs.readFileSync(fullPath)).digest('hex');
      assert.equal(actualSha, expectedSha, `Hash SHA-256 divergente para ${relPath}`);
    }
  });

  await t.test('2. Cópia, Integridade Criptográfica e Sintaxe de Código a partir do Manifesto', () => {
    // Copia todos os arquivos do manifesto para o diretório limpo
    for (const [relPath] of Object.entries(manifestData.arquivos)) {
      const src = path.join(rootDir, relPath);
      const dest = path.join(cleanRoot, relPath);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(src, dest);
    }

    // Confere que public/uploads NÃO existe na instalação limpa
    assert.ok(!fs.existsSync(path.join(cleanRoot, 'public', 'uploads')), 'public/uploads NÃO deve existir na release limpa');
    assert.ok(!fs.existsSync(path.join(cleanRoot, 'patio.db')), 'patio.db NÃO deve existir na release limpa');

    // Executa verificação de sintaxe de server.js e db.js no diretório limpo
    const checkServer = spawnSync(process.execPath, ['--check', 'server.js'], {
      cwd: cleanRoot,
      encoding: 'utf8'
    });
    assert.equal(checkServer.status, 0, `server.js deve compilar sem erro de sintaxe: ${checkServer.stderr}`);

    const checkDb = spawnSync(process.execPath, ['--check', 'db.js'], {
      cwd: cleanRoot,
      encoding: 'utf8'
    });
    assert.equal(checkDb.status, 0, `db.js deve compilar sem erro de sintaxe: ${checkDb.stderr}`);
  });

  await t.test('3. Execução de Boot Funcional em Diretório Limpo com Verificação de /health e /ready', async () => {
    // Comprova que o pacote instalado a partir do manifesto é capaz de inicializar o servidor funcionalmente
    const net = require('net');
    const { spawn } = require('child_process');

    const probe = net.createServer();
    probe.listen(0, '127.0.0.1');
    await new Promise(r => probe.once('listening', r));
    const cleanPort = probe.address().port;
    await new Promise(r => probe.close(r));

    const cleanDbPath = path.join(cleanRoot, 'clean_boot.db');
    const cleanUploadsDir = path.join(cleanRoot, 'public', 'uploads');

    let cleanLogs = '';
    const child = spawn(process.execPath, ['server.js'], {
      cwd: cleanRoot,
      windowsHide: true,
      env: {
        ...process.env,
        NODE_PATH: path.join(rootDir, 'node_modules'),
        PORT: String(cleanPort),
        HOST: '127.0.0.1',
        DB_PATH: cleanDbPath,
        UPLOAD_DIR: cleanUploadsDir,
        DISABLE_INTEGRATIONS: 'true',
        API_KEY: 'test-clean-install-key'
      }
    });

    child.stdout.on('data', d => { cleanLogs += d.toString(); });
    child.stderr.on('data', d => { cleanLogs += d.toString(); });

    let isHealthy = false;
    let isReady = false;
    const deadline = Date.now() + 25000;

    try {
      while (Date.now() < deadline) {
        if (child.exitCode !== null) {
          throw new Error('Servidor na pasta limpa encerrou prematuramente: ' + cleanLogs);
        }
        try {
          const resHealth = await fetch(`http://127.0.0.1:${cleanPort}/health`);
          if (resHealth.status === 200) {
            const bodyHealth = await resHealth.json();
            if (bodyHealth.status === 'ok') isHealthy = true;
          }
        } catch (_) {}

        try {
          const resReady = await fetch(`http://127.0.0.1:${cleanPort}/ready`);
          if (resReady.status === 200) {
            const bodyReady = await resReady.json();
            if (bodyReady.status === 'ready' || bodyReady.status === 'ok') isReady = true;
          }
        } catch (_) {}

        if (isHealthy && isReady) break;
        await new Promise(r => setTimeout(r, 200));
      }

      assert.ok(isHealthy, `O endpoint /health deve responder 200 OK na instalação limpa. Logs:\n${cleanLogs}`);
      assert.ok(isReady, `O endpoint /ready deve responder 200 OK na instalação limpa. Logs:\n${cleanLogs}`);
      assert.ok(fs.existsSync(cleanDbPath), 'O banco SQLite inicial deve ter sido provisionado na pasta limpa');
    } finally {
      child.kill('SIGKILL');
      await new Promise(r => setTimeout(r, 500));
    }
  });

  // Limpeza
  try {
    fs.rmSync(cleanRoot, { recursive: true, force: true });
  } catch (_) {}
});
