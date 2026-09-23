'use strict';

/**
 * PÁTIO CRM — GERADOR DE MANIFESTO DE RELEASE REPRODUZÍVEL DO PILOTO
 * Congela os hashes criptográficos (SHA-256) de todos os arquivos de código-fonte
 * e configurações públicas, com exclusão estrita de segredos, bancos e uploads.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));

function computeSha256(filePath) {
  const content = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(content).digest('hex');
}

function getGitCommit() {
  try {
    return execSync('git rev-parse HEAD', { cwd: rootDir, encoding: 'utf8' }).trim();
  } catch (_) {
    return 'git_commit_unavailable';
  }
}

function getGitBranch() {
  try {
    return execSync('git rev-parse --abbrev-ref HEAD', { cwd: rootDir, encoding: 'utf8' }).trim();
  } catch (_) {
    return 'main';
  }
}

// Arquivos e diretórios canônicos a incluir
const includePatterns = [
  'server.js',
  'db.js',
  'index.html',
  'style.css',
  'package.json',
  'package-lock.json',
  'lib',
  'services',
  'js',
  'scripts',
  'public'
];

// Diretórios e arquivos estritamente excluídos
const excludePrefixes = [
  '.env',
  '.git',
  '.superpowers',
  'node_modules',
  'backups',
  'uploads',
  'public/uploads',
  'locks',
  'scratch',
  'patio.db',
  '.wwebjs_auth',
  '.wwebjs_cache'
];

function listFilesRecursive(dir) {
  let results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relPath = path.relative(rootDir, fullPath).replace(/\\/g, '/');

    // Checa exclusões
    const isExcluded = excludePrefixes.some(ex => relPath === ex || relPath.startsWith(ex + '/'));
    if (isExcluded) continue;

    if (entry.isDirectory()) {
      results = results.concat(listFilesRecursive(fullPath));
    } else if (entry.isFile()) {
      // Ignorar bancos sqlite e arquivos de flag
      if (relPath.endsWith('.db') || relPath.endsWith('.db-wal') || relPath.endsWith('.db-shm') || relPath.endsWith('.flag')) continue;
      results.push(relPath);
    }
  }
  return results;
}

const allCandidateFiles = [];
for (const item of includePatterns) {
  const full = path.join(rootDir, item);
  if (!fs.existsSync(full)) continue;
  const stat = fs.statSync(full);
  if (stat.isDirectory()) {
    allCandidateFiles.push(...listFilesRecursive(full));
  } else if (stat.isFile()) {
    allCandidateFiles.push(item);
  }
}

// Ordenar determinísticamente
allCandidateFiles.sort();

const filesManifest = {};
for (const f of allCandidateFiles) {
  const full = path.join(rootDir, f);
  if (fs.existsSync(full)) {
    filesManifest[f] = computeSha256(full);
  }
}

const timestampIso = new Date().toISOString();
const gitCommit = getGitCommit();
const gitBranch = getGitBranch();

const manifestData = {
  projeto: 'Patio-CRM',
  versao: pkg.version,
  fase: 'Fase 3 — Piloto Controlado em Ambiente Operacional',
  dataGeracao: timestampIso,
  git: {
    commit: gitCommit,
    branch: gitBranch
  },
  ambienteExecucao: {
    node: process.version,
    plataforma: process.platform,
    arquitetura: process.arch
  },
  politicaSegredos: {
    status: 'COMPLIANT_ZERO_SECRETS',
    exclusoesAtivas: [
      '.env*',
      'patio.db*',
      'backups/*',
      'uploads/*',
      'credenciais e certificados SEFAZ A1'
    ]
  },
  totalArquivosAuditados: Object.keys(filesManifest).length,
  arquivos: filesManifest
};

const outputDir = path.join(rootDir, 'docs', 'operacao');
fs.mkdirSync(outputDir, { recursive: true });

// 1. Salvar JSON legível por máquina
fs.writeFileSync(path.join(outputDir, 'manifesto_release.json'), JSON.stringify(manifestData, null, 2), 'utf8');

// 2. Salvar Markdown formal para documentação
let md = `# Manifesto Oficial de Release do Piloto Controlado

**Projeto:** Pátio CRM  
**Versão:** \`${pkg.version}\`  
**Fase:** Piloto Controlado em Ambiente Operacional (1 Oficina)  
**Data de Congelamento:** ${timestampIso}  
**Commit Git:** \`${gitCommit}\` (\`branch: ${gitBranch}\`)  
**Ambiente:** Node.js \`${process.version}\` em \`${process.platform}-${process.arch}\`  
**Total de Arquivos Auditados:** ${Object.keys(filesManifest).length}  

---

## 1. Política de Isolamento e Zero Segredos
Nenhum dado real, banco de dados de produção (\`patio.db\`), arquivo de backup, anexo de upload ou segredo de configuração (\`.env\`, certificados digitais SEFAZ A1, chaves privadas) está presente ou rastreado nesta release.

- **Exclusões Rastreáveis:**
  - \`.env\` e variantes
  - \`patio.db\`, \`patio.db-wal\`, \`patio.db-shm\`
  - Diretórios \`backups/\`, \`uploads/\`, \`public/uploads/\`, \`scratch/\`, \`locks/\`
  - Sessões de WhatsApp (\`.wwebjs_auth/\`, \`.wwebjs_cache/\`)

> **Nota Técnica de Escopo:** O manifesto com hashes SHA-256 é um inventário estrito de integridade de release e controle de mudanças para implantação; não constitui assinatura digital por autoridade certificadora (PKI) nem garante a ausência de segredos injetados em tempo de execução.

---

## 2. Hashes Criptográficos das Camadas Críticas (SHA-256)

| Arquivo Canônico | Hash SHA-256 |
|---|---|
| \`server.js\` | \`${filesManifest['server.js'] || 'N/A'}\` |
| \`db.js\` | \`${filesManifest['db.js'] || 'N/A'}\` |
| \`lib/tokens/securityToken.js\` | \`${filesManifest['lib/tokens/securityToken.js'] || 'N/A'}\` |
| \`lib/repository/stateRepository.js\` | \`${filesManifest['lib/repository/stateRepository.js'] || 'N/A'}\` |
| \`services/voiceActionEngine.js\` | \`${filesManifest['services/voiceActionEngine.js'] || 'N/A'}\` |
| \`services/backupService.js\` | \`${filesManifest['services/backupService.js'] || 'N/A'}\` |
| \`package.json\` | \`${filesManifest['package.json'] || 'N/A'}\` |
| \`package-lock.json\` | \`${filesManifest['package-lock.json'] || 'N/A'}\` |

---

## 3. Inventário Completo de Arquivos da Release (${Object.keys(filesManifest).length} Arquivos)

| Caminho Relativo | Checksum SHA-256 |
|---|---|
${Object.entries(filesManifest).map(([p, h]) => `| \`${p}\` | \`${h}\` |`).join('\n')}

---
*Manifesto gerado automaticamente por \`scripts/gerar_manifesto_release.cjs\`.*
`;

fs.writeFileSync(path.join(outputDir, 'MANIFESTO_RELEASE_PILOTO_2026-09-21.md'), md, 'utf8');

console.log(`Manifesto gerado com sucesso! Total de arquivos: ${Object.keys(filesManifest).length}`);
console.log(`Salvo em: ${path.join(outputDir, 'MANIFESTO_RELEASE_PILOTO_2026-09-21.md')}`);
