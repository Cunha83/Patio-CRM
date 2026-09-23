'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const net = require('node:net');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'patio-e2e-recovery-'));
const primaryDbPath = path.join(tempDir, 'primary.db');
const backupDir = path.join(tempDir, 'backups');
fs.mkdirSync(backupDir, { recursive: true });

process.env.DB_PATH = primaryDbPath;
process.env.BACKUP_DIR = backupDir;

const { initDB, run, get, closeDB } = require('../db');
const backupService = require('../services/backupService');
const userRepository = require('../lib/auth/userRepository');
const { IdentityRegistry } = require('../lib/auth/identity');
const { createAuthMiddleware } = require('../lib/auth/context');

test('Recuperação Operacional Completa: Backup -> Restauração -> Inicialização -> Operação -> Medições RTO/RPO', async (t) => {
  await initDB();

  t.after(async () => {
    await closeDB().catch(() => {});
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}
  });

  // 1. Popula banco primário com estado operacional
  const tenantId = 'oficina_recuperacao_e2e';
  const agora = new Date().toISOString();

  await userRepository.createUser({
    username: 'gestor_recuperacao@oficina.com.br',
    password: 'SenhaForte#2026',
    role: 'tenant_admin',
    tenantId,
    allowWeakInTest: false
  });

  const estadoOriginal = {
    versao: 1,
    os: [{ id: 'os_recuperada_01', num: 7001, total: 5800.00, st: 'em_andamento' }],
    clientes: [{ id: 'cli_rec_01', nome: 'Frotista Brasil Transporte' }]
  };

  await run('INSERT INTO kv (key, value) VALUES (?, ?)', [`tenant:${tenantId}:state`, JSON.stringify(estadoOriginal)]);

  // 2. Mede tempo de criação do backup consistente WAL
  const tBackupStart = performance.now();
  const backupRes = await backupService.executarBackupWal({
    tenantId: '_all_',
    actorId: 'admin_infra',
    includeUploads: false,
    backupDir
  });
  const duracaoCriacaoBackupMs = performance.now() - tBackupStart;

  assert.equal(backupRes.ok, true);
  assert.ok(fs.existsSync(backupRes.filepath));

  // 3. Mede separadamente o tempo de validação criptográfica e integridade estrutural
  const tValidacaoStart = performance.now();
  const validacaoRes = await backupService.restaurarBackup({
    backupFilepath: backupRes.filepath,
    verifyOnly: true
  });
  const tempoValidacaoArquivoMs = performance.now() - tValidacaoStart;

  assert.equal(validacaoRes.ok, true);
  assert.equal(validacaoRes.integrityCheck, 'ok');

  // 4. Mede o tempo de restauração física em destino novo e isolado
  const restoredDbPath = path.join(tempDir, 'restored_isolated.db');
  const tRestauracaoFisicaStart = performance.now();
  const restauracaoRes = await backupService.restaurarBackup({
    backupFilepath: backupRes.filepath,
    targetDbPath: restoredDbPath,
    verifyOnly: false
  });
  const tempoRestauracaoFisicaMs = performance.now() - tRestauracaoFisicaStart;

  assert.equal(restauracaoRes.ok, true);
  assert.ok(fs.existsSync(restoredDbPath));
  assert.ok(fs.existsSync(restoredDbPath + '.fiscal-recovery-required'), 'Marcador de bloqueio pós-restauração obrigatório');

  // 5. Mede o tempo de recuperação operacional: subida de servidor com o banco restaurado, login, leitura e escrita
  const tRecupOperacionalStart = performance.now();

  const probe = net.createServer();
  probe.listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const port = probe.address().port;
  await new Promise(r => probe.close(r));

  const uploadsDir = path.join(tempDir, 'uploads');
  fs.mkdirSync(uploadsDir, { recursive: true });

  const root = path.resolve(__dirname, '..');
  let childLogs = '';
  const child = spawn(process.execPath, ['server.js'], {
    cwd: root,
    windowsHide: true,
    env: {
      ...process.env,
      PORT: String(port),
      API_KEY: 'chave-infra-restaurada-2026',
      AUTH_USER: '',
      AUTH_PASSWORD: '',
      DISABLE_INTEGRATIONS: 'true',
      DB_PATH: restoredDbPath,
      UPLOAD_DIR: uploadsDir
    }
  });

  let spawnError = null;
  child.on('error', err => { spawnError = err; });
  child.stdout.on('data', d => { childLogs += d; });
  child.stderr.on('data', d => { childLogs += d; });

  try {
    let isReady = false;
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
      if (spawnError) throw spawnError;
      if (child.exitCode !== null) throw new Error('Servidor restaurado encerrou prematuramente: ' + childLogs);
      try {
        const res = await fetch(`http://127.0.0.1:${port}/ready`);
        if (res.status === 200) { isReady = true; break; }
      } catch (_) {}
      await new Promise(r => setTimeout(r, 100));
    }
    if (!isReady) throw new Error('Servidor restaurado não atingiu prontidão dentro de 30s. Logs:\n' + childLogs);

    // 5.1 Autenticação no servidor restaurado
    const authHeaders = {
      'Authorization': 'Basic ' + Buffer.from('gestor_recuperacao@oficina.com.br:SenhaForte#2026').toString('base64'),
      'x-tenant-id': tenantId
    };

    // 5.2 Leitura do estado restaurado
    const resGet = await fetch(`http://127.0.0.1:${port}/api/estado`, { headers: authHeaders });
    assert.equal(resGet.status, 200);
    const estadoRestaurado = await resGet.json();
    assert.equal(estadoRestaurado.os[0].num, 7001);
    assert.equal(estadoRestaurado.clientes[0].nome, 'Frotista Brasil Transporte');

    // 5.3 Escrita operacional no banco restaurado
    const novoEstado = {
      ...estadoRestaurado,
      versao: estadoRestaurado.versao,
      os: [
        ...estadoRestaurado.os,
        { id: 'os_recuperada_02', num: 7002, total: 1200.00, st: 'aberta' }
      ]
    };

    const resPost = await fetch(`http://127.0.0.1:${port}/api/estado`, {
      method: 'POST',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify(novoEstado)
    });
    assert.equal(resPost.status, 200);

    // 5.4 Confirmação de persistência da escrita pós-restauração
    const resGetConfirm = await fetch(`http://127.0.0.1:${port}/api/estado`, { headers: authHeaders });
    const jsonConfirm = await resGetConfirm.json();
    assert.equal(jsonConfirm.os.length, 2);
    assert.equal(jsonConfirm.os[1].num, 7002);

  } finally {
    if (child && child.exitCode === null) {
      const exitDone = once(child, 'exit');
      child.kill();
      await exitDone;
    }
  }

  const tempoRecuperacaoOperacionalMs = performance.now() - tRecupOperacionalStart;

  // Registro explícito das medições
  console.log(`\n======================================================`);
  console.log(`MEDIÇÕES EFETIVAS DE CONTINUIDADE OPERACIONAL:`);
  console.log(`- Criação do Backup Atômico WAL: ${duracaoCriacaoBackupMs.toFixed(2)} ms`);
  console.log(`- Validação do Arquivo (SHA-256 + Integrity Check): ${tempoValidacaoArquivoMs.toFixed(2)} ms`);
  console.log(`- Restauração Física (Cópia Exclusiva + Trava Fiscal): ${tempoRestauracaoFisicaMs.toFixed(2)} ms`);
  console.log(`- Recuperação Operacional (Boot + Auth + Read + Write): ${tempoRecuperacaoOperacionalMs.toFixed(2)} ms`);
  console.log(`- RTO Operacional Total Medido: ${(tempoRestauracaoFisicaMs + tempoRecuperacaoOperacionalMs).toFixed(2)} ms`);
  console.log(`======================================================\n`);

  assert.ok(tempoValidacaoArquivoMs < 5000, 'Validação de integridade < 5s');
  assert.ok(tempoRestauracaoFisicaMs < 5000, 'Restauração física < 5s');
  assert.ok(tempoRecuperacaoOperacionalMs < 10000, 'Recuperação operacional completa < 10s');
});
