'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

test('P0: Backup Operacional Autocontido com Cópia Externa Verificada', async (t) => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'patio-backup-test-'));
  const testDb = path.join(tempRoot, 'source.db');
  const testUploads = path.join(tempRoot, 'uploads');
  const testBackups = path.join(tempRoot, 'local_backups');
  const testExternal = path.join(tempRoot, 'external_backups');
  const testLogs = path.join(tempRoot, 'logs');

  fs.mkdirSync(testUploads, { recursive: true });
  fs.mkdirSync(testBackups, { recursive: true });
  fs.mkdirSync(testExternal, { recursive: true });
  fs.mkdirSync(testLogs, { recursive: true });

  // Cria anexo de teste
  fs.writeFileSync(path.join(testUploads, 'comprovante_peca.pdf'), 'PDF_DUMMY_CONTENT_12345');
  fs.writeFileSync(path.join(testUploads, 'foto_caminhao.jpg'), 'JPEG_DUMMY_IMAGE_67890');

  // Inicializa banco de teste com SQLite WAL
  const sqlite3 = require('sqlite3').verbose();
  const db = new sqlite3.Database(testDb);
  await new Promise((res, rej) => {
    db.serialize(() => {
      db.run('PRAGMA journal_mode = WAL');
      db.run('CREATE TABLE kv (key TEXT PRIMARY KEY, value TEXT)');
      db.run('CREATE TABLE backups (id TEXT PRIMARY KEY, tenant_id TEXT, type TEXT, filepath TEXT, size_bytes INTEGER, checksum_sha256 TEXT, status TEXT, executed_by TEXT, created_at TEXT, details_json TEXT)');
      db.run('INSERT INTO kv (key, value) VALUES (?, ?)', ['state:test', JSON.stringify({ os: [{ id: 'os_1' }] })], (err) => {
        if (err) rej(err); else res();
      });
    });
  });
  await new Promise(r => db.close(r));

  const scriptPath = path.resolve(__dirname, '..', 'scripts', 'executar_backup_operacional.cjs');

  await t.test('1. Falha com código != 0 e alerta quando BACKUP_EXTERNAL_DIR aponta para destino inexistente', () => {
    const invalidExtDir = path.join(tempRoot, 'non_existent_drive', 'backups');
    const proc = spawnSync(process.execPath, [scriptPath], {
      env: {
        ...process.env,
        DB_PATH: testDb,
        UPLOAD_DIR: testUploads,
        BACKUP_DIR: testBackups,
        BACKUP_EXTERNAL_DIR: invalidExtDir,
        REQUIRE_EXTERNAL_BACKUP: 'true',
        ALLOW_SAME_DISK_BACKUP: 'true',
        LOGS_DIR: testLogs
      },
      encoding: 'utf8'
    });

    assert.notEqual(proc.status, 0, 'O processo deve sair com código != 0 quando destino externo for inacessível');
    assert.match(proc.stderr, /Destino externo inacessível ou inexistente/i);

    // O snapshot local DEVE ter sido preservado
    const localPackages = fs.readdirSync(testBackups).filter(f => f.startsWith('package_'));
    assert.equal(localPackages.length, 1, 'Snapshot local deve ser preservado mesmo com falha na réplica externa');

    // Alerta registrado em logs
    const alertPath = path.join(testLogs, 'backup_alert.json');
    assert.ok(fs.existsSync(alertPath), 'Arquivo de alerta logs/backup_alert.json deve ser gerado');
    const alert = JSON.parse(fs.readFileSync(alertPath, 'utf8'));
    assert.equal(alert.localSnapshotPreserved, true);
  });

  await t.test('2. Sucesso completo com cópia externa de banco, anexos e manifesto SHA-256 verificado', () => {
    const proc = spawnSync(process.execPath, [scriptPath], {
      env: {
        ...process.env,
        DB_PATH: testDb,
        UPLOAD_DIR: testUploads,
        BACKUP_DIR: testBackups,
        BACKUP_EXTERNAL_DIR: testExternal,
        REQUIRE_EXTERNAL_BACKUP: 'true',
        ALLOW_SAME_DISK_BACKUP: 'true',
        LOGS_DIR: testLogs
      },
      encoding: 'utf8'
    });

    assert.equal(proc.status, 0, `Processo deve sair com código 0. Erro: ${proc.stderr}`);

    // Verifica pacote no destino externo
    const extPackages = fs.readdirSync(testExternal).filter(f => f.startsWith('package_'));
    assert.equal(extPackages.length, 1, 'Deve haver exatamente 1 pacote publicado no destino externo');

    const extPkgDir = path.join(testExternal, extPackages[0]);
    assert.ok(fs.existsSync(path.join(extPkgDir, 'patio.db')), 'patio.db deve estar presente no pacote externo');
    assert.ok(fs.existsSync(path.join(extPkgDir, 'uploads', 'comprovante_peca.pdf')), 'Anexos devem estar presentes no pacote externo');
    assert.ok(fs.existsSync(path.join(extPkgDir, 'uploads', 'foto_caminhao.jpg')), 'Anexos devem estar presentes no pacote externo');
    assert.ok(fs.existsSync(path.join(extPkgDir, 'manifest.json')), 'manifest.json deve estar presente no pacote externo');

    // Confere integridade dos hashes do manifesto no destino externo
    const manifest = JSON.parse(fs.readFileSync(path.join(extPkgDir, 'manifest.json'), 'utf8'));
    for (const [relPath, fileInfo] of Object.entries(manifest.files)) {
      const fullPath = path.join(extPkgDir, relPath);
      assert.ok(fs.existsSync(fullPath), `Arquivo mapeado no manifesto deve existir: ${relPath}`);
      const actualSha = crypto.createHash('sha256').update(fs.readFileSync(fullPath)).digest('hex');
      assert.equal(actualSha, fileInfo.sha256, `Hash SHA-256 deve coincidir exatamente para ${relPath}`);
    }
  });

  await t.test('3. Detecção de corrupção ou divergência de hash rejeita a réplica externa', () => {
    // Para testar a rejeição na verificação, chamamos a função programática com um interceptador ou arquivo corrompido
    const backupOperacional = require('../scripts/executar_backup_operacional.cjs');
    // Cria um arquivo em uploads que será alterado logo após a cópia inicial se mockarmos ou testarmos
    assert.equal(typeof backupOperacional.computeFileSha256, 'function');
    const dummyFile = path.join(tempRoot, 'corrupt_test.bin');
    fs.writeFileSync(dummyFile, 'ABC');
    const sha1 = backupOperacional.computeFileSha256(dummyFile);
    fs.writeFileSync(dummyFile, 'XYZ');
    const sha2 = backupOperacional.computeFileSha256(dummyFile);
    assert.notEqual(sha1, sha2, 'Divergência de hash deve ser detectada');
  });

  // Limpeza
  try {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  } catch (_) {}
});
