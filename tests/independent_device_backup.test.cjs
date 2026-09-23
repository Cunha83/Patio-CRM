'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const rootDir = path.resolve(__dirname, '..');
const { executarBackupOperacional, assertIndependentDestination } = require('../scripts/executar_backup_operacional.cjs');
const { createRemoteVaultServer } = require('../scripts/servico_backup_remoto.cjs');

test('P0: Validação de Armazenamento Independente de Backup e Rejeição de Mesmo Disco', async (t) => {
  const tempWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), 'patio-indep-test-'));
  const testDb = path.join(tempWorkspace, 'source.db');
  const testUploads = path.join(tempWorkspace, 'uploads');
  const testLocalBackups = path.join(tempWorkspace, 'local_bck');
  const vaultStorageDir = path.join(tempWorkspace, 'vault_storage');

  fs.mkdirSync(testUploads, { recursive: true });
  fs.mkdirSync(testLocalBackups, { recursive: true });
  fs.mkdirSync(vaultStorageDir, { recursive: true });

  // 1. Validação de rejeição estrita de mesmo disco e subst
  await t.test('1. Recusa de destinos no mesmo disco físico ou subst', async () => {
    assert.throws(() => {
      assertIndependentDestination(rootDir, 'C:\\Destino_Mesmo_Disco');
    }, /DESTINO_INVALIDO_MESMO_DISCO/);
  });

  // Cria anexo de teste
  fs.writeFileSync(path.join(testUploads, 'comprovante.pdf'), '%PDF-1.4 TESTE INDEPENDENTE');

  // Inicializa banco de teste
  const { initDB, run, closeDB, all } = require('../db');
  process.env.DB_PATH = testDb;
  await initDB();
  await run('INSERT INTO kv (key, value) VALUES (?, ?)', [
    'tenant:oficina_piloto_01:state',
    JSON.stringify({ versao: 1, os: [{ id: 'os_indep_01', num: 7777 }] })
  ]);
  await closeDB();

  process.env.ALLOW_LOCAL_REMOTE_VAULT_IN_TEST = 'true';

  const vault = createRemoteVaultServer({
    port: 3007,
    host: '127.0.0.1',
    vaultDir: vaultStorageDir,
    token: 'TokenIndep2026!'
  });
  await vault.start();

  let backupRes = null;

  await t.test('2. Execução de backup em destino independente remoto e verificação de recibo', async () => {
    backupRes = await executarBackupOperacional({
      backupDir: testLocalBackups,
      remoteUrl: 'http://127.0.0.1:3007/api/remote-vault/upload',
      remoteToken: 'TokenIndep2026!',
      requireExternal: true,
      uploadDir: testUploads
    });

    assert.equal(backupRes.ok, true, 'Backup operacional deve concluir com sucesso');
    assert.equal(backupRes.remoteVerified, true, 'Cofre remoto deve ter verificado o pacote');
    assert.ok(backupRes.remoteReceipt, 'Recibo deve existir');
    assert.equal(backupRes.remoteReceipt.allHashesMatchManifest, true);
  });

  await t.test('3. Restauração e verificação de integridade a partir do cofre remoto', async () => {
    const downloadRes = await fetch(`http://127.0.0.1:3007/api/remote-vault/download/${backupRes.backupId}`, {
      headers: { 'Authorization': 'Bearer TokenIndep2026!' }
    });
    assert.equal(downloadRes.status, 200);
    const dlData = await downloadRes.json();
    assert.equal(dlData.ok, true);

    const restoreDir = path.join(tempWorkspace, 'restored');
    const restoredDb = path.join(restoreDir, 'patio.db');
    const restoredUploads = path.join(restoreDir, 'uploads');
    fs.mkdirSync(restoredUploads, { recursive: true });

    for (const [relPath, b64] of Object.entries(dlData.files)) {
      if (relPath === 'manifest.json' || !dlData.manifest.files[relPath]) continue;
      const targetPath = path.join(restoreDir, relPath);
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      fs.writeFileSync(targetPath, Buffer.from(b64, 'base64'));
    }

    // Verifica integridade física do SQLite restaurado
    process.env.DB_PATH = restoredDb;
    await initDB();
    const rows = await all('PRAGMA integrity_check');
    assert.equal(rows[0].integrity_check, 'ok', 'PRAGMA integrity_check deve retornar ok');

    const stateRow = await all("SELECT value FROM kv WHERE key = 'tenant:oficina_piloto_01:state'");
    assert.ok(stateRow.length > 0, 'Estado deve existir no banco restaurado');
    const state = JSON.parse(stateRow[0].value);
    assert.equal(state.os[0].num, 7777, 'Número da OS restaurada deve ser 7777');
    await closeDB();

    assert.ok(fs.existsSync(path.join(restoredUploads, 'comprovante.pdf')), 'Anexo PDF deve ter sido restaurado');
  });

  await vault.stop();

  // Limpeza
  try {
    fs.rmSync(tempWorkspace, { recursive: true, force: true });
  } catch (_) {}
});
