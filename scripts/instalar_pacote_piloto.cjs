'use strict';

/**
 * PÁTIO CRM — INSTALADOR LIMPO DO PACOTE OPERACIONAL DO PILOTO
 * Extrai todos os 120 arquivos auditados no manifesto de release para uma pasta independente
 * e executa `npm ci` para instalar as dependências de produção sem reutilizar node_modules de desenvolvimento.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const manifestPath = path.join(rootDir, 'docs', 'operacao', 'manifesto_release.json');
const defaultTargetDir = path.resolve(process.env.DEPLOY_DIR || path.join(rootDir, 'deploy-piloto'));

function instalarPacoteIndependente(options = {}) {
  const targetDir = path.resolve(options.targetDir || process.env.DEPLOY_DIR || defaultTargetDir);

  console.log('================================================================');
  console.log(' PÁTIO CRM — INSTALAÇÃO DO PACOTE OPERACIONAL DO PILOTO');
  console.log(' Destino:', targetDir);
  console.log(' Manifesto:', manifestPath);
  console.log('================================================================\n');

  if (!fs.existsSync(manifestPath)) {
    throw new Error('manifesto_release.json não encontrado.');
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

  // Proteção Anti-Data-Loss: Recusa se o diretório de destino já existir e contiver arquivos
  if (fs.existsSync(targetDir)) {
    const existingEntries = fs.readdirSync(targetDir);
    if (existingEntries.length > 0) {
      throw new Error(`DESTINO_JA_EXISTE: O diretório de instalação "${targetDir}" já existe e contém ${existingEntries.length} arquivo(s)/pasta(s). O instalador recusa sobrescrever ou apagar dados existentes.`);
    }
  } else {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  console.log(`Copiando ${Object.keys(manifest.arquivos).length} arquivos auditados a partir do manifesto...`);
  for (const [relPath, expectedSha] of Object.entries(manifest.arquivos)) {
    const src = path.join(rootDir, relPath);
    const dest = path.join(targetDir, relPath);
    if (!fs.existsSync(src)) {
      throw new Error(`Arquivo fonte ausente: ${src}`);
    }

    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);

    const actualSha = crypto.createHash('sha256').update(fs.readFileSync(dest)).digest('hex');
    if (actualSha !== expectedSha) {
      throw new Error(`Divergência de hash SHA-256 no arquivo ${relPath}!`);
    }
  }

  // Confere que arquivos privados / de desenvolvimento não foram copiados
  if (fs.existsSync(path.join(targetDir, 'patio.db'))) {
    throw new Error('ERRO DE SEGURANÇA: patio.db foi copiado para a instalação limpa!');
  }
  if (fs.existsSync(path.join(targetDir, 'public', 'uploads'))) {
    throw new Error('ERRO DE SEGURANÇA: public/uploads foi copiado para a instalação limpa!');
  }
  if (fs.existsSync(path.join(targetDir, 'node_modules'))) {
    throw new Error('ERRO: node_modules já existia no diretório limpo antes do npm ci!');
  }

  console.log('✔ Todos os arquivos auditados copiados e conferidos com 100% de integridade SHA-256.');
  console.log('\nExecutando `npm ci` em pasta isolada para instalar dependências do lockfile...');

  const nodeDir = path.dirname(process.execPath);
  let npmPath = path.join(nodeDir, 'npm.cmd');
  if (!fs.existsSync(npmPath)) npmPath = 'npm';

  const quotedNpm = `"${npmPath}"`;
  const npmRes = spawnSync(quotedNpm, ['ci', '--omit=dev'], {
    cwd: targetDir,
    encoding: 'utf8',
    shell: true,
    stdio: 'inherit'
  });

  if (npmRes.status !== 0) {
    throw new Error(`npm ci falhou com código de saída ${npmRes.status}`);
  }

  const installedModules = path.join(targetDir, 'node_modules');
  if (!fs.existsSync(installedModules)) {
    throw new Error('node_modules não foi gerado após npm ci!');
  }

  console.log('\n✔ Instalação limpa com `npm ci` concluída com sucesso!');
  console.log(`Pasta independente pronta em: ${targetDir}`);
  return targetDir;
}

if (require.main === module) {
  try {
    instalarPacoteIndependente();
    process.exit(0);
  } catch (err) {
    console.error('Falha na instalação:', err.message);
    process.exit(1);
  }
}

module.exports = {
  instalarPacoteIndependente
};
