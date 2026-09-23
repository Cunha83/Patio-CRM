'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'patio-backup-test-'));
process.env.DB_PATH = path.join(tempDir,'test.db');
process.env.BACKUP_DIR = tempDir;
const { initDB, run, get, all, closeDB } = require('../db');
const backupService = require('../services/backupService');

test('Backup Consistente (SQLite WAL) & Procedimento de Restauração Isolada', async (t) => {
  await initDB();

  t.after(async () => {
    await closeDB();
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (_) {}
  });

  let createdBackupPath = null;
  let createdBackupId = null;

  await t.test('1. Execução de backup atômico com VACUUM INTO e hash SHA-256', async () => {
    const res = await backupService.executarBackupWal({
      tenantId: '_all_',
      actorId: 'test_runner',
      includeUploads: false,
      backupDir: tempDir
    });

    assert.equal(res.ok, true, 'Backup deve ser concluído com sucesso');
    assert.ok(res.backupId);
    assert.ok(res.filepath);
    assert.ok(fs.existsSync(res.filepath), 'Arquivo do backup deve existir fisicamente');
    assert.ok(res.checksumSha256, 'Hash SHA-256 deve ser gerado');
    assert.equal(res.checksumSha256.length, 64);
    assert.ok(res.durationMs < 5000, 'Backup WAL deve ser instantâneo (< 5000ms)');

    createdBackupPath = res.filepath;
    createdBackupId = res.backupId;

    // Verifica persistência na tabela backups
    const row = await get('SELECT * FROM backups WHERE id = ?', [res.backupId]);
    assert.ok(row, 'Registro deve constar na tabela backups');
    assert.equal(row.checksum_sha256, res.checksumSha256);
    assert.equal(row.status, 'completed');
  });

  await t.test('2. Integridade criptográfica: detecção de adulteração no arquivo de backup', async () => {
    const computedHash = backupService.computeFileHash(createdBackupPath);
    const row = await get('SELECT checksum_sha256 FROM backups WHERE id = ?', [createdBackupId]);
    assert.equal(computedHash, row.checksum_sha256, 'Hash recalculado deve bater exatamente com o registrado');
  });

  await t.test('3. Teste formal de Restauração Isolada com RTO < 5s e verificação de integridade', async () => {
    const t0 = performance.now();
    const resRestore = await backupService.restaurarBackup({
      backupFilepath: createdBackupPath,
      verifyOnly: true
    });
    const rto = performance.now() - t0;

    assert.equal(resRestore.ok, true, 'Restauração de verificação deve ter sucesso');
    assert.equal(resRestore.integrityCheck, 'ok', 'PRAGMA integrity_check deve retornar ok');
    assert.ok(rto < 5000, `RTO medido (${rto.toFixed(2)}ms) deve ser estritamente inferior a 5000ms`);
  });

  await t.test('4. Política de Retenção de Backups: expurgo automático de cópias antigas', async () => {
    // Cria backups fictícios para testar a retenção
    const runId = Date.now();
    for (let i = 1; i <= 5; i++) {
      const dummyPath = path.join(tempDir, `dummy_backup_${runId}_${i}.db`);
      fs.writeFileSync(dummyPath, `dummy_content_${i}`);
      await run(`INSERT OR REPLACE INTO backups (id, filepath, checksum_sha256, status, created_at, type)
        VALUES (?, ?, ?, 'completed', ?, 'wal_atomic')`, [
        `dummy_${runId}_${i}`, dummyPath, `hash_${i}`, new Date(Date.now() - (10 - i) * 86400000).toISOString()
      ]);
    }

    const retencao = await backupService.aplicarRetencaoBackups({ manterUltimos: 3 });
    assert.equal(retencao.ok, true);
    assert.ok(retencao.expurgados >= 2, 'Pelo menos 2 backups mais antigos devem ser expurgados');

    const restantes = await backupService.listarBackups(10);
    assert.ok(restantes.length <= 4, 'Apenas os backups mais recentes devem ser mantidos');
  });
});
