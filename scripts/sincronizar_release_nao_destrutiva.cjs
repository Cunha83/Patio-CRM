'use strict';

/**
 * PÁTIO CRM — SINCRONIZADOR NÃO DESTRUTIVO DE RELEASE PARA DEPLOY
 * Copia ou atualiza todos os arquivos do manifesto para deploy-piloto/
 * preservando RIGOROSAMENTE:
 * - patio.db, patio.db-wal, patio.db-shm
 * - .env
 * - public/uploads
 * - node_modules
 * - locks
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const rootDir = path.resolve(__dirname, '..');
const manifestPath = path.join(rootDir, 'docs', 'operacao', 'manifesto_release.json');
const targetDir = path.resolve(process.env.DEPLOY_DIR || path.join(rootDir, 'deploy-piloto'));

function computeSha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function sincronizarReleaseNaoDestrutiva() {
  console.log('================================================================');
  console.log(' PÁTIO CRM — SINCRONIZAÇÃO NÃO DESTRUTIVA DE RELEASE');
  console.log(' Origem:', rootDir);
  console.log(' Destino:', targetDir);
  console.log('================================================================\n');

  if (!fs.existsSync(manifestPath)) {
    throw new Error('manifesto_release.json não encontrado.');
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

  fs.mkdirSync(targetDir, { recursive: true });

  const preservePrefixes = [
    'patio.db',
    'public/uploads',
    'uploads',
    'node_modules',
    'locks',
    'backups'
  ];

  let copied = 0;
  let skipped = 0;

  for (const [relPath, expectedSha] of Object.entries(manifest.arquivos)) {
    const isPreserved = preservePrefixes.some(p => relPath === p || relPath.startsWith(p + '/') || relPath.startsWith(p + '\\'));
    if (isPreserved) {
      skipped++;
      continue;
    }

    const src = path.join(rootDir, relPath);
    const dest = path.join(targetDir, relPath);

    if (!fs.existsSync(src)) {
      throw new Error(`Arquivo fonte ausente: ${src}`);
    }

    fs.mkdirSync(path.dirname(dest), { recursive: true });

    // Só copia se o arquivo não existir ou tiver hash diferente
    let needsCopy = true;
    if (fs.existsSync(dest)) {
      const currentSha = computeSha256(dest);
      if (currentSha === expectedSha) {
        needsCopy = false;
      }
    }

    if (needsCopy) {
      fs.copyFileSync(src, dest);
      copied++;
    }
  }

  // Garante que .env de produção existe no destino
  const envPath = path.join(targetDir, '.env');
  if (!fs.existsSync(envPath)) {
    const defaultEnv = [
      'PORT=3000',
      'HOST=127.0.0.1',
      'DB_PATH=patio.db',
      'UPLOAD_DIR=public/uploads',
      'BACKUP_DIR=backups',
      'BACKUP_EXTERNAL_DIR=B:\\PatioCRM_Backups',
      'REQUIRE_EXTERNAL_BACKUP=true',
      'DISABLE_WHATSAPP=true',
      'DISABLE_INTEGRATIONS=true',
      'NODE_ENV=production'
    ].join('\r\n') + '\r\n';
    fs.writeFileSync(envPath, defaultEnv, 'utf8');
    console.log('✔ Arquivo .env gerado em deploy-piloto com BACKUP_EXTERNAL_DIR=B:\\PatioCRM_Backups');
  }

  console.log(`✔ Sincronização não destrutiva concluída: ${copied} arquivos atualizados, ${skipped} preservados.`);
  return { copied, skipped, targetDir };
}

if (require.main === module) {
  try {
    sincronizarReleaseNaoDestrutiva();
    process.exit(0);
  } catch (err) {
    console.error('Falha na sincronização:', err.message);
    process.exit(1);
  }
}

module.exports = {
  sincronizarReleaseNaoDestrutiva
};
