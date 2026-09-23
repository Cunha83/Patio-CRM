'use strict';

/**
 * PÁTIO CRM — SCRIPT OPERACIONAL DE BACKUP WAL COM ANEXOS & CÓPIA EXTERNA VERIFICADA
 * Produz um pacote autocontido (SQLite WAL VACUUM INTO, anexos uploads/, manifest.json com SHA-256).
 * Realiza publicação atômica via staging e replicação externa verificada por recálculo de hashes.
 */

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const rootDir = path.resolve(__dirname, '..');

// Carrega variáveis se disponível
if (fs.existsSync(path.join(rootDir, '.env'))) {
  try { require('dotenv').config({ path: path.join(rootDir, '.env') }); } catch (_) {}
}

const { initDB, closeDB, run } = require('../db');

function computeFileSha256(filePath) {
  const hash = crypto.createHash('sha256');
  const buffer = fs.readFileSync(filePath);
  hash.update(buffer);
  return hash.digest('hex');
}

function copyDirRecursive(src, dest) {
  if (!fs.existsSync(src)) return 0;
  fs.mkdirSync(dest, { recursive: true });
  let count = 0;
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error(`Link simbólico não permitido na replicação de backup: ${entry.name}`);
    }
    if (entry.isDirectory()) {
      count += copyDirRecursive(srcPath, destPath);
    } else if (entry.isFile()) {
      fs.copyFileSync(srcPath, destPath);
      count++;
    }
  }
  return count;
}

function scanFilesForManifest(baseDir, currentDir = baseDir) {
  let fileMap = {};
  if (!fs.existsSync(currentDir)) return fileMap;
  const entries = fs.readdirSync(currentDir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(currentDir, entry.name);
    if (entry.name === 'manifest.json') continue; // O manifesto não contém seu próprio hash
    if (entry.isDirectory()) {
      Object.assign(fileMap, scanFilesForManifest(baseDir, fullPath));
    } else if (entry.isFile()) {
      const relPath = path.relative(baseDir, fullPath).replace(/\\/g, '/');
      const stat = fs.statSync(fullPath);
      fileMap[relPath] = {
        size: stat.size,
        sha256: computeFileSha256(fullPath)
      };
    }
  }
  return fileMap;
}

function assertIndependentDestination(sourceDir, targetDir, remoteUrl) {
  if (process.env.ALLOW_SAME_DISK_BACKUP === 'true') return;

  // 1. Rejeição de URLs remotas apontando para a própria máquina local (loopback)
  if (remoteUrl) {
    try {
      const parsed = new URL(remoteUrl);
      if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Protocolo de backup inválido.');
      const host = (parsed.hostname || '').toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
      const isLoopback = host === 'localhost' || host.endsWith('.localhost') || host === '::' || host === '::1' || host === '0.0.0.0' || host.startsWith('127.') || /^::ffff:7f[0-9a-f]{2}:/.test(host);
      if (isLoopback && process.env.ALLOW_LOCAL_REMOTE_VAULT_IN_TEST !== 'true') {
        throw new Error(`DESTINO_INVALIDO_LOCAL: O destino remoto "${remoteUrl}" aponta para a própria máquina local (loopback/localhost). Armazenamento independente requer outro servidor autêntico na rede/nuvem ou dispositivo físico separado.`);
      }
    } catch (urlErr) {
      if (urlErr.message && urlErr.message.includes('DESTINO_INVALIDO_LOCAL')) throw urlErr;
      throw new Error('DESTINO_INVALIDO_URL: configure uma URL HTTP(S) válida para o backup remoto.');
    }
  }

  if (!targetDir) return;
  const resolvedTarget = path.resolve(targetDir);
  const resolvedSource = path.resolve(sourceDir);

  // 2. Rejeição estrita de unidades virtuais mapeadas via comando 'subst'
  try {
    const substOutput = require('child_process').execSync('subst', { encoding: 'utf8', timeout: 2000 });
    const substLines = substOutput.split(/\r?\n/);
    for (const line of substLines) {
      const m = line.match(/^([A-Za-z]):\\:\s*=>\s*(.+)$/);
      if (m) {
        const substDrive = m[1].toUpperCase() + ':';
        if (resolvedTarget.toUpperCase().startsWith(substDrive)) {
          throw new Error(`DESTINO_INVALIDO_SUBST: O destino "${targetDir}" reside na unidade virtual ("${substDrive}") mapeada via 'subst' para "${m[2]}". Unidades 'subst' não representam armazenamento independente.`);
        }
      }
    }
  } catch (substErr) {
    if (substErr.message && substErr.message.includes('DESTINO_INVALIDO_SUBST')) throw substErr;
  }

  // 3. Rejeição de caminhos no mesmo volume / partição / disco local
  const targetMatch = resolvedTarget.match(/^([A-Za-z]):/);
  const sourceMatch = resolvedSource.match(/^([A-Za-z]):/);
  if (targetMatch && sourceMatch) {
    const targetDrive = targetMatch[1].toUpperCase();
    const sourceDrive = sourceMatch[1].toUpperCase();
    if (targetDrive === sourceDrive) {
      throw new Error(`DESTINO_INVALIDO_MESMO_DISCO: O destino de backup "${targetDir}" está no mesmo disco/unidade física ("${targetDrive}:") que a aplicação ("${sourceDrive}:"). Armazenamento independente requer dispositivo físico segregado (pendrive/disco externo) ou destino de rede/remoto (BACKUP_REMOTE_URL).`);
    }
  }
}

async function executarBackupOperacional(options = {}) {
  const t0 = performance.now();
  console.log(`[Backup Operacional] Iniciando às ${new Date().toISOString()}...`);

  let dbInitialized = false;
  let localStagingDir = null;
  let localPackageDir = null;
  let extStagingDir = null;

  const logsDir = path.resolve(options.logsDir || process.env.LOGS_DIR || path.join(rootDir, 'logs'));
  if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });

  const backupDir = path.resolve(options.backupDir || process.env.BACKUP_DIR || path.join(rootDir, 'backups'));
  const remoteUrl = options.remoteUrl || process.env.BACKUP_REMOTE_URL || null;
  const remoteToken = options.remoteToken || process.env.BACKUP_REMOTE_TOKEN || null;
  const externalDir = (options.externalDir !== undefined ? options.externalDir : process.env.BACKUP_EXTERNAL_DIR)
    ? path.resolve(options.externalDir || process.env.BACKUP_EXTERNAL_DIR)
    : null;
  const requireExternal = options.requireExternal !== undefined
    ? options.requireExternal
    : (process.env.REQUIRE_EXTERNAL_BACKUP === 'true' || Boolean(externalDir) || Boolean(remoteUrl));
  const uploadDir = path.resolve(options.uploadDir || process.env.UPLOAD_DIR || path.join(rootDir, 'public', 'uploads'));

  try {
    // Guardrails de teste se aplicável
    try {
      const testPaths = require('../lib/security/testPaths');
      testPaths.assertTestResourcePath(backupDir, 'backup');
      if (externalDir) testPaths.assertTestResourcePath(externalDir, 'backup externo');
    } catch (_) {}

    // Validação estrita de independência de destino externo ou remoto
    assertIndependentDestination(rootDir, externalDir, remoteUrl);

    if (remoteUrl) {
      if (!remoteToken || remoteToken === 'PatioRemoteVaultSecretToken2026!') {
        throw new Error('CONFIG_SEGURANCA_OBRIGATORIA: BACKUP_REMOTE_TOKEN privado deve ser configurado no ambiente e não pode utilizar tokens padrão/expostos.');
      }
    }

    if (requireExternal && !externalDir && !remoteUrl) {
      throw new Error('REQUER_ARMAZENAMENTO_INDEPENDENTE: REQUIRE_EXTERNAL_BACKUP=true, mas nenhum dispositivo independente (BACKUP_EXTERNAL_DIR) ou destino remoto (BACKUP_REMOTE_URL) foi configurado.');
    }

    fs.mkdirSync(backupDir, { recursive: true });

    await initDB();
    dbInitialized = true;

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupId = `bck_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    const packageFolderName = `package_${backupId}_${timestamp}`;

    // 1. Preparação atômica em staging local
    localStagingDir = path.join(backupDir, `.staging_${backupId}_${timestamp}`);
    fs.mkdirSync(localStagingDir, { recursive: true });

    // 1.1 Snapshot WAL consistente via VACUUM INTO
    const stagingDbPath = path.join(localStagingDir, 'patio.db');
    await run('VACUUM INTO ?', [stagingDbPath]);

    // 1.2 Arquivamento de uploads
    const stagingUploadsDir = path.join(localStagingDir, 'uploads');
    const uploadsArchived = copyDirRecursive(uploadDir, stagingUploadsDir);

    // 1.3 Geração do manifesto SHA-256 por arquivo
    const manifestFiles = scanFilesForManifest(localStagingDir);
    let totalBytes = 0;
    for (const f of Object.values(manifestFiles)) totalBytes += f.size;

    const packageManifest = {
      backupId,
      timestamp,
      createdAt: new Date().toISOString(),
      totalFiles: Object.keys(manifestFiles).length,
      totalBytes,
      files: manifestFiles
    };

    const manifestPath = path.join(localStagingDir, 'manifest.json');
    fs.writeFileSync(manifestPath, JSON.stringify(packageManifest, null, 2), 'utf8');

    // 1.4 Publicação final atômica do pacote local
    localPackageDir = path.join(backupDir, packageFolderName);
    fs.renameSync(localStagingDir, localPackageDir);
    localStagingDir = null; // Staging consolidado

    const localElapsed = Math.round(performance.now() - t0);
    console.log(`✔ [Backup Operacional] Snapshot local concluído em ${localElapsed}ms:`);
    console.log(`  Pacote: ${localPackageDir}`);
    console.log(`  Arquivos: ${packageManifest.totalFiles} (${(totalBytes / (1024 * 1024)).toFixed(2)} MB)`);
    console.log(`  Uploads: ${uploadsArchived}`);

    // Registro na tabela backups
    try {
      await run(`INSERT INTO backups (
        id, tenant_id, type, filepath, size_bytes, checksum_sha256, status, executed_by, created_at, details_json
      ) VALUES (?, ?, 'package_wal', ?, ?, ?, 'local_completed', ?, ?, ?)`, [
        backupId,
        '_all_',
        localPackageDir,
        totalBytes,
        manifestFiles['patio.db']?.sha256 || 'N/A',
        'scheduler_windows',
        new Date().toISOString(),
        JSON.stringify({
          durationMs: localElapsed,
          uploadsArchived,
          packageManifest
        })
      ]);
    } catch (dbErr) {
      console.warn('[Backup Operacional] Aviso ao registrar na tabela backups:', dbErr.message);
    }

    // 2. Replicação para Armazenamento Independente (Remoto ou Dispositivo Físico)
    let externalVerified = false;
    let remoteVerified = false;
    let remoteReceipt = null;

    // 2.1 Replicação Remota Segregada via HTTP/Rede
    if (remoteUrl) {
      console.log(`[Backup Operacional] Replicando pacote para destino remoto independente: ${remoteUrl}...`);
      const payloadFiles = {};
      for (const relPath of Object.keys(manifestFiles)) {
        const filePath = path.join(localPackageDir, relPath);
        payloadFiles[relPath] = fs.readFileSync(filePath).toString('base64');
      }

      const uploadPayload = {
        backupId,
        timestamp,
        packageFolderName,
        manifest: packageManifest,
        files: payloadFiles
      };

      const res = await fetch(remoteUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${remoteToken}`
        },
        body: JSON.stringify(uploadPayload)
      });

      if (!res.ok) {
        const errBody = await res.text();
        throw new Error(`Falha no envio para destino remoto (${res.status}): ${errBody}`);
      }

      const resJson = await res.json();
      if (!resJson.ok || !resJson.verified) {
        throw new Error(`Destino remoto rejeitou pacote ou falhou na verificação de integridade: ${JSON.stringify(resJson)}`);
      }

      remoteVerified = true;
      remoteReceipt = resJson.receipt;
      console.log(`✔ [Backup Operacional] Pacote remoto verificado com sucesso por SHA-256 no receptor: ${backupId}`);

      try {
        await run(`UPDATE backups SET status = 'completed_remote_verified', details_json = ? WHERE id = ?`, [
          JSON.stringify({
            durationMs: Math.round(performance.now() - t0),
            remoteUrl,
            remoteReceipt
          }),
          backupId
        ]);
      } catch (_) {}
    }

    // 2.2 Replicação para Dispositivo Físico Independente
    if (externalDir) {
      if (!fs.existsSync(externalDir)) {
        throw new Error(`Destino externo inacessível ou inexistente: "${externalDir}". Snapshot local preservado em "${localPackageDir}", mas proteção externa pendente/falhou.`);
      }

      console.log(`[Backup Operacional] Replicando pacote para destino externo: ${externalDir}...`);
      extStagingDir = path.join(externalDir, `.staging_ext_${backupId}_${timestamp}`);
      fs.mkdirSync(extStagingDir, { recursive: true });

      // Copia recursiva para o staging externo
      copyDirRecursive(localPackageDir, extStagingDir);

      // Verificação Criptográfica de Integridade no Destino Externo
      for (const [relPath, fileInfo] of Object.entries(manifestFiles)) {
        const extFilePath = path.join(extStagingDir, relPath);
        if (!fs.existsSync(extFilePath)) {
          throw new Error(`Arquivo ausente na réplica externa: ${relPath}`);
        }
        const actualSha = computeFileSha256(extFilePath);
        if (actualSha !== fileInfo.sha256) {
          throw new Error(`Divergência de integridade na réplica externa para "${relPath}". Esperado: ${fileInfo.sha256}, Obtido: ${actualSha}`);
        }
      }

      const finalExtPackageDir = path.join(externalDir, packageFolderName);
      fs.renameSync(extStagingDir, finalExtPackageDir);
      extStagingDir = null; // Publicado com sucesso
      externalVerified = true;

      console.log(`✔ [Backup Operacional] Pacote externo replicado e 100% verificado: ${finalExtPackageDir}`);

      // Atualiza status no banco para proteção externa comprovada
      try {
        await run(`UPDATE backups SET status = 'completed_external_verified' WHERE id = ?`, [backupId]);
      } catch (_) {}
    }

    if (requireExternal && !externalVerified && !remoteVerified) {
      throw new Error('Falha na comprovação de cópia externa ou remota independente.');
    }

    // 3. Aplica política de retenção local (mantém os últimos 30 pacotes)
    try {
      const entries = fs.readdirSync(backupDir).filter(f => f.startsWith('package_'));
      entries.sort();
      if (entries.length > 30) {
        const toDelete = entries.slice(0, entries.length - 30);
        for (const dirName of toDelete) {
          fs.rmSync(path.join(backupDir, dirName), { recursive: true, force: true });
        }
        console.log(`  Retenção: ${toDelete.length} pacote(s) antigo(s) expurgado(s) localmente.`);
      }
    } catch (retErr) {
      console.warn('  Retenção: aviso ao aplicar política:', retErr.message);
    }

    process.exitCode = 0;
    return {
      ok: true,
      backupId,
      localPackageDir,
      externalPackageDir: externalDir ? path.join(externalDir, packageFolderName) : null,
      remoteVerified,
      remoteReceipt,
      manifest: packageManifest
    };
  } catch (err) {
    console.error(`❌ [Backup Operacional] FALHA: ${err.message}`);
    process.exitCode = 1;

    // Limpa diretórios temporários de staging que não foram consolidados
    if (localStagingDir && fs.existsSync(localStagingDir)) {
      try { fs.rmSync(localStagingDir, { recursive: true, force: true }); } catch (_) {}
    }
    if (extStagingDir && fs.existsSync(extStagingDir)) {
      try { fs.rmSync(extStagingDir, { recursive: true, force: true }); } catch (_) {}
    }

    const alertFile = path.join(logsDir, 'backup_alert.json');
    try {
      fs.writeFileSync(alertFile, JSON.stringify({
        timestamp: new Date().toISOString(),
        error: err.message,
        localSnapshotPreserved: Boolean(localPackageDir && fs.existsSync(localPackageDir)),
        localPackageDir,
        externalDir,
        remoteUrl,
        requireExternal
      }, null, 2), 'utf8');
    } catch (_) {}

    return {
      ok: false,
      error: err.message,
      localSnapshotPreserved: Boolean(localPackageDir && fs.existsSync(localPackageDir)),
      localPackageDir
    };
  } finally {
    if (dbInitialized) {
      await closeDB().catch(() => {});
    }
  }
}

if (require.main === module) {
  executarBackupOperacional().catch(() => {
    process.exitCode = 1;
  });
}

module.exports = {
  executarBackupOperacional,
  assertIndependentDestination,
  computeFileSha256,
  scanFilesForManifest
};
