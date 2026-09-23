'use strict';

/**
 * PÁTIO CRM — SERVIÇO DE BACKUP CONSISTENTE (SQLITE WAL) & RECUPERAÇÃO
 * Implementa backups atômicos consistentes com o modo WAL via VACUUM INTO,
 * integridade criptográfica SHA-256, arquivamento de uploads, auditoria e
 * procedimento formal de restauração isolada com aferição de RTO/RPO.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sqlite3 = require('sqlite3').verbose();
const { run, get, all } = require('../db');

const DEFAULT_BACKUP_DIR = process.env.BACKUP_DIR || path.join(process.cwd(), 'backups');

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function computeFileHash(filepath) {
  const hash = crypto.createHash('sha256');
  const buffer = fs.readFileSync(filepath);
  hash.update(buffer);
  return hash.digest('hex');
}

/**
 * Executa backup consistente e atômico do SQLite em modo WAL.
 */
async function executarBackupWal({
  tenantId = '_all_',
  actorId = 'system',
  includeUploads = true,
  backupDir = null
} = {}) {
  const t0 = performance.now();
  const targetDir = require('../lib/security/testPaths').assertTestResourcePath(backupDir || DEFAULT_BACKUP_DIR,'backup');
  ensureDir(targetDir);

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupId = `bck_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
  const dbFilename = `patio_${backupId}_${timestamp}.db`;
  const dbBackupPath = path.resolve(targetDir, dbFilename);

  // Falha de VACUUM deve falhar o backup. Copiar o arquivo vivo após checkpoint não é consistente.
  await run('VACUUM INTO ?', [dbBackupPath]);

  const stat = fs.statSync(dbBackupPath);
  const checksum = computeFileHash(dbBackupPath);

  // 2. Arquivamento de uploads se solicitado
  let uploadsArchived = 0;
  let uploadsDirTarget = null;
  if (includeUploads) {
    const uploadsSource = process.env.UPLOAD_DIR || path.join(process.cwd(), 'public', 'uploads');
    if ((process.env.NODE_TEST_CONTEXT || process.env.NODE_ENV === 'test') && !process.env.UPLOAD_DIR) throw new Error('UPLOAD_DIR temporário obrigatório em testes.');
    if (fs.existsSync(uploadsSource)) {
      uploadsDirTarget = path.resolve(targetDir, `uploads_${tenantId}_${timestamp}`);
      ensureDir(uploadsDirTarget);
      
      const copyRecursive = (src, dest) => {
        const entries = fs.readdirSync(src, { withFileTypes: true });
        for (const entry of entries) {
          const srcPath = path.join(src, entry.name);
          const destPath = path.join(dest, entry.name);
          if (entry.isSymbolicLink()) throw new Error('Link simbólico não permitido no arquivo de uploads.');
          if (entry.isDirectory()) {
            ensureDir(destPath);
            copyRecursive(srcPath, destPath);
          } else {
            fs.copyFileSync(srcPath, destPath);
            uploadsArchived++;
          }
        }
      };

      try {
        copyRecursive(uploadsSource, uploadsDirTarget);
      } catch (uploadErr) {
        throw new Error('Backup incompleto: falha ao arquivar uploads.');
      }
    }
  }

  const durationMs = Math.round(performance.now() - t0);
  const nowIso = new Date().toISOString();

  // 3. Registro no banco de controle de backups
  try {
    await run(`INSERT INTO backups (
      id, tenant_id, type, filepath, size_bytes, checksum_sha256, status, executed_by, created_at, details_json
    ) VALUES (?, ?, 'sqlite_wal', ?, ?, ?, 'completed', ?, ?, ?)`, [
      backupId,
      tenantId,
      dbBackupPath,
      stat.size,
      checksum,
      actorId,
      nowIso,
      JSON.stringify({
        durationMs,
        uploadsArchived,
        uploadsDir: uploadsDirTarget,
        snapshotAt: nowIso
      })
    ]);
  } catch (logErr) {
    console.warn('[Backup] Aviso ao registrar na tabela backups:', logErr.message);
  }

  return {
    ok: true,
    backupId,
    tenantId,
    filepath: dbBackupPath,
    sizeBytes: stat.size,
    checksumSha256: checksum,
    uploadsArchived,
    durationMs,
    createdAt: nowIso
  };
}

/**
 * Restauração com validação de integridade criptográfica e teste isolado.
 */
async function restaurarBackup({
  backupId = null,
  backupFilepath = null,
  expectedChecksum = null,
  targetDbPath = null,
  verifyOnly = false
} = {}) {
  const t0 = performance.now();

  let targetFile = backupFilepath;
  let storedChecksum = expectedChecksum;

  if (backupId && !targetFile) {
    const row = await get('SELECT * FROM backups WHERE id = ?', [backupId]);
    if (!row) throw new Error(`Backup "${backupId}" não encontrado no registro.`);
    targetFile = row.filepath;
    storedChecksum = row.checksum_sha256;
  }

  if (!targetFile || !fs.existsSync(targetFile)) {
    throw new Error(`Arquivo de backup não localizado no caminho: ${targetFile}`);
  }

  if (!storedChecksum) {
    const registered = await get('SELECT checksum_sha256 FROM backups WHERE filepath=?',[path.resolve(targetFile)]);
    storedChecksum = registered?.checksum_sha256;
  }
  if (!storedChecksum) throw new Error('Checksum de referência obrigatório para restauração.');
  // 1. Verificação Criptográfica de Integridade SHA-256
  const actualChecksum = computeFileHash(targetFile);
  if (storedChecksum && actualChecksum !== storedChecksum) {
    throw new Error(`Falha de integridade: Checksum SHA-256 divergente! Esperado: ${storedChecksum}, Atual: ${actualChecksum}. O arquivo pode estar corrompido.`);
  }

  // 2. Teste de Integridade Estrutural no SQLite (Isolado)
  await new Promise((resolve, reject) => {
    const testDb = new sqlite3.Database(targetFile, sqlite3.OPEN_READONLY, (err) => {
      if (err) return reject(new Error(`Falha ao abrir arquivo de backup no SQLite: ${err.message}`));
      testDb.get('PRAGMA integrity_check;', (checkErr, row) => {
        testDb.close();
        if (checkErr) return reject(checkErr);
        if (!row || row.integrity_check !== 'ok') {
          return reject(new Error(`Falha na integridade estrutural do banco: ${row?.integrity_check || 'Desconhecido'}`));
        }
        resolve();
      });
    });
  });

  // 3. Efetivação da restauração se não for apenas verificação
  if (!verifyOnly && targetDbPath) {
    require('../lib/security/testPaths').assertTestResourcePath(targetDbPath,'restauração');
    ensureDir(path.dirname(targetDbPath));
    if (fs.existsSync(targetDbPath) || path.resolve(targetDbPath) === path.resolve(process.env.DB_PATH || 'patio.db')) throw new Error('Restauração exige destino novo e isolado.');
    fs.copyFileSync(targetFile, targetDbPath, fs.constants.COPYFILE_EXCL);
    fs.writeFileSync(targetDbPath + '.fiscal-recovery-required', 'Reconcilie documentos e numeração externamente antes de habilitar transmissão.');
  }

  const recoveryTimeMs = Math.round(performance.now() - t0);

  return {
    ok: true,
    verified: true,
    checksumSha256: actualChecksum,
    integrityCheck: 'ok',
    recoveryTimeMs,
    targetDbPath: verifyOnly ? null : targetDbPath
  };
}

/**
 * Lista histórico de backups executados.
 */
async function listarBackups(options = {}) {
  try {
    const opts = typeof options === 'number' ? { limit: options } : (options || {});
    const { tenantId = null, limit = 20 } = opts;
    let sql = 'SELECT * FROM backups';
    const params = [];
    if (tenantId && tenantId !== '_all_') {
      sql += ' WHERE tenant_id = ? OR tenant_id = "_all_"';
      params.push(tenantId);
    }
    sql += ' ORDER BY created_at DESC LIMIT ?';
    params.push(limit);
    const rows = await all(sql, params);
    return (rows || []).map(r => ({
      ...r,
      details: r.details_json ? JSON.parse(r.details_json) : {}
    }));
  } catch (_) {
    return [];
  }
}

/**
 * Aplica política de retenção excluindo backups antigos além do limite.
 */
async function aplicarRetencaoBackups({ manterUltimos = 7, tenantId = null } = {}) {
  try {
    const backups = await listarBackups({ tenantId, limit: 100 });
    if (backups.length <= manterUltimos) {
      return { ok: true, expurgados: 0 };
    }

    const paraExcluir = backups.slice(manterUltimos);
    let expurgados = 0;

    for (const b of paraExcluir) {
      try {
        const base = fs.realpathSync(DEFAULT_BACKUP_DIR);
        const contained = value => { const resolved = fs.realpathSync(value); const relative = path.relative(base, resolved); if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Retenção fora da raiz de backups recusada.'); };
        if (fs.existsSync(b.filepath)) contained(b.filepath);
        if (b.details?.uploadsDir && fs.existsSync(b.details.uploadsDir)) contained(b.details.uploadsDir);
        if (fs.existsSync(b.filepath)) {
          fs.unlinkSync(b.filepath);
        }
        if (b.details && b.details.uploadsDir && fs.existsSync(b.details.uploadsDir)) {
          fs.rmSync(b.details.uploadsDir, { recursive: true, force: true });
        }
        await run('DELETE FROM backups WHERE id = ?', [b.id]);
        expurgados++;
      } catch (err) {
        console.warn(`[Backup] Aviso ao expurgar backup antigo ${b.id}:`, err.message);
      }
    }

    return { ok: true, expurgados };
  } catch (err) {
    console.error('[Backup] Erro na política de retenção:', err.message);
    return { ok: false, error: err.message };
  }
}

module.exports = {
  executarBackupWal,
  restaurarBackup,
  listarBackups,
  aplicarRetencaoBackups,
  computeFileHash
};
