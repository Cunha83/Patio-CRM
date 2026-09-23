'use strict';

/**
 * TESTE P0: VALIDAÇÃO DE ARMAZENAMENTO REALMENTE INDEPENDENTE & RECUPERAÇÃO REMOTA
 * 
 * Comprova:
 * 1. Rejeição estrita de unidades subst ou pastas no mesmo disco.
 * 2. Rejeição quando requireExternal=true sem destino autêntico.
 * 3. Envio e verificação criptográfica SHA-256 em serviço de cofre remoto independente.
 * 4. Simulação de desastre total local e restauração exclusiva a partir do pacote remoto.
 * 5. Inicialização da aplicação restaurada, login dos 3 operadores e conferência de OS/anexos.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const http = require('http');

const rootDir = path.resolve(__dirname, '..');
const { executarBackupOperacional, assertIndependentDestination } = require('../scripts/executar_backup_operacional.cjs');
const { createRemoteVaultServer } = require('../scripts/servico_backup_remoto.cjs');

test('P0: Armazenamento Realmente Independente e Restauração Remota de Desastres', async (t) => {
  const tempBase = fs.mkdtempSync(path.join(os.tmpdir(), 'patio-remote-test-'));
  const testLocalDb = path.join(tempBase, 'patio.db');
  const testUploads = path.join(tempBase, 'uploads');
  const testLocalBackups = path.join(tempBase, 'local_bck');
  const remoteVaultDir = path.join(tempBase, 'remote_vault_storage');

  fs.mkdirSync(testUploads, { recursive: true });
  fs.mkdirSync(testLocalBackups, { recursive: true });
  fs.mkdirSync(remoteVaultDir, { recursive: true });

  const samplePdfPath = path.join(testUploads, 'laudo_independente.pdf');
  fs.writeFileSync(samplePdfPath, '%PDF-1.4 LAUDO_TESTE_ARMAZENAMENTO_INDEPENDENTE_2026');

  // 1. Rejeição de Armazenamento no Mesmo Disco, Subst e Loopback Local
  await t.test('1. assertIndependentDestination recusa rigorosamente mesmo disco', async () => {
    assert.throws(() => {
      assertIndependentDestination('C:\\PatioCRM', 'C:\\PatioCRM_Backups');
    }, /DESTINO_INVALIDO_MESMO_DISCO/, 'Deve rejeitar destino no mesmo disco local');
  });

  await t.test('1.1 assertIndependentDestination recusa URLs apontando para localhost ou loopback', async () => {
    delete process.env.ALLOW_LOCAL_REMOTE_VAULT_IN_TEST;
    assert.throws(() => {
      assertIndependentDestination('C:\\PatioCRM', null, 'http://127.0.0.1:3005/api/remote-vault/upload');
    }, /DESTINO_INVALIDO_LOCAL/, 'Deve rejeitar 127.0.0.1 como destino independente');

    assert.throws(() => {
      assertIndependentDestination('C:\\PatioCRM', null, 'http://localhost:3005/api/remote-vault/upload');
    }, /DESTINO_INVALIDO_LOCAL/, 'Deve rejeitar localhost como destino independente');
  });

  await t.test('1.2 Servidor e backup recusam token exposto ou token ausente', async () => {
    assert.throws(() => {
      createRemoteVaultServer({ token: 'PatioRemoteVaultSecretToken2026!' });
    }, /CONFIG_SEGURANCA_OBRIGATORIA/, 'Deve rejeitar token fixo exposto');

    assert.throws(() => {
      createRemoteVaultServer({ token: null });
    }, /CONFIG_SEGURANCA_OBRIGATORIA/, 'Deve rejeitar token nulo');
  });

  await t.test('2. executarBackupOperacional recusa se requireExternal=true e sem destino independente', async () => {
    const res = await executarBackupOperacional({
      backupDir: testLocalBackups,
      requireExternal: true,
      externalDir: null,
      remoteUrl: null
    });
    assert.equal(res.ok, false);
    assert.match(res.error, /REQUER_ARMAZENAMENTO_INDEPENDENTE/);
  });

  // Habilita autorização controlada exclusivamente para o teste com mock local
  process.env.ALLOW_LOCAL_REMOTE_VAULT_IN_TEST = 'true';

  // Inicializa servidor do Cofre Remoto de Ensaio
  const vaultPort = 3006;
  const vaultToken = 'SecretRemoteVaultTokenTest2026_Unique_Token!';
  const vault = createRemoteVaultServer({
    port: vaultPort,
    host: '127.0.0.1',
    vaultDir: remoteVaultDir,
    token: vaultToken
  });

  await vault.start();

  // Inicializa banco de dados local com operadores e OS
  const { initDB, run, closeDB, all } = require('../db');
  const userRepository = require('../lib/auth/userRepository');

  process.env.DB_PATH = testLocalDb;
  await initDB();

  const tenant = 'oficina_piloto_01';
  const testPasswords = {
    gestor: `Gst#Tst_${crypto.randomBytes(6).toString('hex')}`,
    atendente: `Atd#Tst_${crypto.randomBytes(6).toString('hex')}`,
    mecanico: `Mec#Tst_${crypto.randomBytes(6).toString('hex')}`
  };

  await userRepository.createUser({
    username: 'gestor@oficina.com.br',
    password: testPasswords.gestor,
    fullName: 'Gestor Teste',
    role: 'tenant_admin',
    tenantId: tenant,
    allowWeakInTest: false
  });

  await userRepository.createUser({
    username: 'atendente@oficina.com.br',
    password: testPasswords.atendente,
    fullName: 'Atendente Teste',
    role: 'atendente',
    tenantId: tenant,
    allowWeakInTest: false
  });

  await userRepository.createUser({
    username: 'mecanico@oficina.com.br',
    password: testPasswords.mecanico,
    fullName: 'Mecanico Teste',
    role: 'mecanico',
    tenantId: tenant,
    allowWeakInTest: false
  });

  await run('INSERT INTO kv (key, value) VALUES (?, ?)', [
    `tenant:${tenant}:state`,
    JSON.stringify({
      versao: 1,
      os: [{ id: 'os_indep_999', num: 9999, total: 4500.00, st: 'aberta' }],
      clientes: [{ id: 'cli_999', nome: 'Transportadora Independente S/A' }]
    })
  ]);

  await closeDB();

  let generatedBackupId = null;

  // 3. Execução de Backup com Replicação Remota Verificada
  await t.test('3. Execução de backup e verificação remota no Cofre Independente', async () => {
    const remoteUrl = `http://127.0.0.1:${vaultPort}/api/remote-vault/upload`;

    process.env.DB_PATH = testLocalDb;
    const backupResult = await executarBackupOperacional({
      backupDir: testLocalBackups,
      uploadDir: testUploads,
      remoteUrl,
      remoteToken: vaultToken,
      requireExternal: true
    });

    assert.equal(backupResult.ok, true, 'Backup operacional deve concluir com sucesso');
    assert.equal(backupResult.remoteVerified, true, 'Cofre remoto deve ter verificado o pacote');
    assert.ok(backupResult.remoteReceipt, 'Deve receber recibo criptográfico do cofre remoto');
    assert.equal(backupResult.remoteReceipt.allHashesMatchManifest, true);

    generatedBackupId = backupResult.backupId;

    // Confirma que o pacote existe no cofre remoto com seu recibo
    const remotePackages = fs.readdirSync(remoteVaultDir).filter(f => f.startsWith('package_'));
    assert.ok(remotePackages.length >= 1, 'Deve existir pacote gravado no cofre remoto');

    const remotePkgDir = path.join(remoteVaultDir, remotePackages[0]);
    assert.ok(fs.existsSync(path.join(remotePkgDir, 'manifest.json')), 'Manifesto deve existir no cofre remoto');
    assert.ok(fs.existsSync(path.join(remotePkgDir, 'patio.db')), 'patio.db deve existir no cofre remoto');
    assert.ok(fs.existsSync(path.join(remotePkgDir, 'uploads', 'laudo_independente.pdf')), 'Anexo PDF deve existir no cofre remoto');
  });

  // 4. Simulação de Perda Total Local e Restauração Exclusiva a partir do Destino Remoto
  await t.test('4. Restauração autônoma a partir do cofre remoto e validação de login e dados', async () => {
    const tStartRestore = performance.now();

    // Simula perda total do ambiente local (apaga banco, uploads e backups locais)
    fs.rmSync(testLocalDb, { force: true });
    fs.rmSync(testUploads, { recursive: true, force: true });
    fs.rmSync(testLocalBackups, { recursive: true, force: true });

    assert.equal(fs.existsSync(testLocalDb), false, 'Banco local destruído');

    // Recuperação: baixa o pacote do Cofre Remoto via HTTP GET
    const downloadRes = await fetch(`http://127.0.0.1:${vaultPort}/api/remote-vault/download/${generatedBackupId}`, {
      headers: {
        'Authorization': `Bearer ${vaultToken}`
      }
    });

    assert.equal(downloadRes.status, 200, 'Download do pacote remoto deve responder 200 OK');
    const dlData = await downloadRes.json();
    assert.equal(dlData.ok, true);
    assert.ok(dlData.manifest);
    assert.ok(dlData.files['patio.db']);

    // Monta ambiente isolado de recuperação
    const isolatedRestoreDir = path.join(tempBase, 'isolated_restore');
    const restoredDbPath = path.join(isolatedRestoreDir, 'patio.db');
    const restoredUploadsDir = path.join(isolatedRestoreDir, 'uploads');

    fs.mkdirSync(restoredUploadsDir, { recursive: true });

    // Grava o manifest.json
    fs.writeFileSync(path.join(isolatedRestoreDir, 'manifest.json'), JSON.stringify(dlData.manifest, null, 2), 'utf8');

    // Descompacta arquivos recebidos do remoto conferindo hashes do manifesto
    for (const [relPath, base64Content] of Object.entries(dlData.files)) {
      if (relPath === 'manifest.json' || !dlData.manifest.files[relPath]) continue;
      const targetPath = path.join(isolatedRestoreDir, relPath);
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      const buf = Buffer.from(base64Content, 'base64');
      fs.writeFileSync(targetPath, buf);

      // Verificação criptográfica do arquivo restaurado
      const calcHash = crypto.createHash('sha256').update(buf).digest('hex');
      const expectedHash = dlData.manifest.files[relPath].sha256;
      assert.equal(calcHash, expectedHash, `Hash verificado para ${relPath}`);
    }

    // 4.1 Verifica integridade física do SQLite restaurado
    process.env.DB_PATH = restoredDbPath;
    await initDB();
    const pragmaRows = await all('PRAGMA integrity_check');
    assert.equal(pragmaRows[0].integrity_check, 'ok', 'PRAGMA integrity_check deve ser ok');
    await closeDB();

    // 4.2 Inicializa servidor isolado de aplicação na porta 3008 para testes funcionais
    const { spawn } = require('child_process');
    const appPort = 3008;
    const serverProc = spawn(process.execPath, [path.join(rootDir, 'server.js')], {
      cwd: rootDir,
      env: {
        ...process.env,
        HOST: '127.0.0.1',
        PORT: String(appPort),
        DB_PATH: restoredDbPath,
        UPLOAD_DIR: restoredUploadsDir,
        DISABLE_WHATSAPP: 'true',
        DISABLE_INTEGRATIONS: 'true',
        NODE_ENV: 'test'
      },
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let serverLogs = '';
    serverProc.stdout.on('data', d => serverLogs += d.toString());
    serverProc.stderr.on('data', d => serverLogs += d.toString());

    let isUp = false;
    for (let i = 0; i < 50; i++) {
      try {
        const resH = await fetch(`http://127.0.0.1:${appPort}/health`);
        if (resH.status === 200) {
          isUp = true;
          break;
        }
      } catch (_) {}
      await new Promise(r => setTimeout(r, 200));
    }
    assert.equal(isUp, true, `Servidor isolado restaurado deve responder no healthcheck. Logs: ${serverLogs}`);

    try {
      // 4.3 Confirmação de login dos 3 operadores via Basic Auth
      const operators = [
        { user: 'gestor@oficina.com.br', pass: testPasswords.gestor, role: 'tenant_admin' },
        { user: 'atendente@oficina.com.br', pass: testPasswords.atendente, role: 'atendente' },
        { user: 'mecanico@oficina.com.br', pass: testPasswords.mecanico, role: 'mecanico' }
      ];

      for (const op of operators) {
        const auth = 'Basic ' + Buffer.from(`${op.user}:${op.pass}`).toString('base64');
        const resLogin = await fetch(`http://127.0.0.1:${appPort}/api/estado`, {
          headers: {
            'Authorization': auth,
            'x-tenant-id': tenant
          }
        });
        assert.equal(resLogin.status, 200, `Login de ${op.user} deve ser 200 OK no ambiente restaurado`);
      }

      // 4.4 Conferência de dados de OS recuperados
      const gestorAuth = 'Basic ' + Buffer.from(`gestor@oficina.com.br:${testPasswords.gestor}`).toString('base64');
      const resState = await fetch(`http://127.0.0.1:${appPort}/api/estado`, {
        headers: {
          'Authorization': gestorAuth,
          'x-tenant-id': tenant
        }
      });
      const state = await resState.json();
      assert.ok(state.os, 'OS deve existir');
      assert.equal(state.os[0].num, 9999, 'OS restaurada deve ter num = 9999');

      // 4.5 Conferência de anexo recuperado
      assert.ok(fs.existsSync(path.join(restoredUploadsDir, 'laudo_independente.pdf')), 'Anexo PDF deve estar íntegro no disco restaurado');
      const restoredPdfContent = fs.readFileSync(path.join(restoredUploadsDir, 'laudo_independente.pdf'), 'utf8');
      assert.match(restoredPdfContent, /LAUDO_TESTE_ARMAZENAMENTO_INDEPENDENTE_2026/);

      const rtoSeconds = ((performance.now() - tStartRestore) / 1000).toFixed(2);
      console.log(`✔ [RTO Medido em Recuperação Remota]: ${rtoSeconds} segundos.`);
      assert.ok(parseFloat(rtoSeconds) < 60, 'RTO medido deve ser menor que 60 segundos');
    } finally {
      serverProc.kill();
      await new Promise(r => setTimeout(r, 200));
    }
  });

  // Finalização do cofre remoto e limpeza
  await vault.stop();
  try {
    fs.rmSync(tempBase, { recursive: true, force: true });
  } catch (_) {}
});
