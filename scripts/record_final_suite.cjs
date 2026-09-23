'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { spawnSync, execSync } = require('child_process');

const startTime = new Date().toISOString();
const rootDir = path.resolve(__dirname, '..');

// 1. Obtenção de versões e dados reais do ambiente
const nodeVer = process.version;
let npmVer = 'desconhecido';
try {
  npmVer = execSync('npm -v', { encoding: 'utf8', timeout: 8000 }).trim();
} catch (e) {
  npmVer = `erro: ${e.message}`;
}

const osPlatform = os.platform();
const osRelease = os.release();
const osArch = os.arch();
const cpus = os.cpus();
const cpuModel = cpus && cpus[0] ? cpus[0].model : 'desconhecido';
const cpuCount = cpus ? cpus.length : 0;
const totalMemMB = Math.round(os.totalmem() / (1024 * 1024));
const freeMemMB = Math.round(os.freemem() / (1024 * 1024));

// 2. Metadados do Git (commit e status)
let gitHead = 'N/A';
let gitStatus = 'N/A';
try {
  gitHead = execSync('git rev-parse HEAD', { cwd: rootDir, encoding: 'utf8', timeout: 5000 }).trim();
  gitStatus = execSync('git status --short', { cwd: rootDir, encoding: 'utf8', timeout: 5000 }).trim();
} catch (e) {
  gitStatus = e.message;
}

// 3. Manifesto criptográfico de hashes (SHA-256) dos arquivos relevantes, excluindo segredos
function buildContentManifest(baseDir) {
  const manifest = [];
  const ignoreDirs = new Set([
    '.git', 'node_modules', 'scratch', '.wwebjs_auth', '.wwebjs_cache',
    'uploads', 'backups', '.gemini'
  ]);
  const secretPattern = /^\.env(?:\..+)?$/i;

  function walk(currentDir) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      const relPath = path.relative(baseDir, fullPath).replace(/\\/g, '/');

      if (entry.isDirectory()) {
        if (ignoreDirs.has(entry.name)) continue;
        walk(fullPath);
      } else if (entry.isFile()) {
        if (secretPattern.test(entry.name) && entry.name !== '.env.example') continue;
        if (entry.name.endsWith('.db') || entry.name.endsWith('.db-wal') || entry.name.endsWith('.db-shm')) continue;
        if (entry.name.endsWith('.log') || entry.name.endsWith('.png') || entry.name.endsWith('.jpg')) continue;

        const isRelevant = /\.(js|cjs|mjs|json|html|css|md)$/i.test(entry.name);
        if (!isRelevant) continue;

        try {
          const content = fs.readFileSync(fullPath);
          const hash = crypto.createHash('sha256').update(content).digest('hex');
          manifest.push(`${hash}  ${relPath}`);
        } catch (_) {}
      }
    }
  }

  walk(baseDir);
  manifest.sort();
  return manifest.join('\n');
}

const contentManifest = buildContentManifest(rootDir);

// 4. Descoberta dinâmica dos arquivos de teste
const testsDir = path.join(rootDir, 'tests');
const testFiles = fs.readdirSync(testsDir)
  .filter(f => f.endsWith('.test.cjs'))
  .sort()
  .map(f => path.join('tests', f));

// 5. Geração de nome único por execução
const now = new Date();
const pad = (n) => String(n).padStart(2, '0');
const timestampSafe = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
const uniqueHex = crypto.randomBytes(3).toString('hex');
const evidenceFilename = `testes-completos-execucao-${timestampSafe}-${uniqueHex}.txt`;
const targetFile = path.join(rootDir, 'docs', 'evidencias', evidenceFilename);

// 6. Montagem e registro do comando efetivo
const runnerArgs = [
  '--require', './scripts/test-preload.cjs',
  '--test',
  '--test-timeout=120000',
  ...testFiles
];
const executedCommand = `node ${runnerArgs.join(' ')}`;

console.log('Iniciando execução da suíte completa de testes:');
console.log('  Arquivo de destino único:', targetFile);
console.log('  Total de arquivos de teste descobertos:', testFiles.length);

const header = [
  '======================================================================',
  'EXECUÇÃO OFICIAL DA SUÍTE COMPLETA DE TESTES AUTOMATIZADOS - PÁTIO CRM',
  'Data Início: ' + startTime,
  'Node.js: ' + nodeVer,
  'NPM: ' + npmVer,
  'Plataforma: ' + osPlatform + ' ' + osRelease + ' (' + osArch + ')',
  'CPU: ' + cpuModel + ' (' + cpuCount + ' núcleos)',
  'Memória: ' + freeMemMB + ' MB livres de ' + totalMemMB + ' MB totais',
  'Git Commit: ' + gitHead,
  'Status Git (Arquivos modificados / não rastreados):',
  gitStatus,
  '----------------------------------------------------------------------',
  'Comando Efetivamente Executado:',
  executedCommand,
  '----------------------------------------------------------------------',
  'Arquivos de Teste Descobertos Dinamicamente (' + testFiles.length + ' arquivos):',
  testFiles.map((f, i) => `  [${pad(i + 1)}] ${f}`).join('\n'),
  '----------------------------------------------------------------------',
  'Manifesto Criptográfico de Conteúdo Testado (SHA-256, sem segredos):',
  contentManifest,
  '======================================================================\n'
].join('\n');

fs.writeFileSync(targetFile, header, 'utf8');

// 7. Execução do processo de testes
const t0 = Date.now();
const testProc = spawnSync(process.execPath, runnerArgs, {
  cwd: rootDir,
  encoding: 'utf8',
  maxBuffer: 50 * 1024 * 1024,
  env: { ...process.env }
});

const t1 = Date.now();
const durationSec = ((t1 - t0) / 1000).toFixed(2);
const endTime = new Date().toISOString();

// 8. Tratamento estrito do código de saída e sinais
let finalExitCode = 1;
let exitDescription = '';

if (testProc.error) {
  finalExitCode = 1;
  exitDescription = `ERRO DE INICIALIZAÇÃO DO PROCESSO: ${testProc.error.message}`;
} else if (testProc.signal) {
  finalExitCode = 1;
  exitDescription = `PROCESSO INTERROMPIDO POR SINAL: ${testProc.signal} (FALHA)`;
} else if (typeof testProc.status === 'number') {
  finalExitCode = testProc.status;
  exitDescription = `CÓDIGO DE SAÍDA REAL DO PROCESSO: ${finalExitCode}`;
} else {
  finalExitCode = 1;
  exitDescription = `ESTADO DE TÉRMINO INDEFINIDO (FALHA)`;
}

fs.appendFileSync(targetFile, (testProc.stdout || '') + (testProc.stderr || ''), 'utf8');

const footer = [
  '\n======================================================================',
  exitDescription,
  'Status Final da Execução: ' + (finalExitCode === 0 ? 'SUCESSO' : 'FALHA'),
  'Data Fim: ' + endTime,
  'Duração Total: ' + durationSec + ' segundos',
  'Arquivo Gravado: ' + targetFile,
  '======================================================================\n'
].join('\n');

fs.appendFileSync(targetFile, footer, 'utf8');

console.log('SUITE_FINISHED');
console.log('EVIDENCE_FILE:', targetFile);
console.log('EXIT_CODE:', finalExitCode);
console.log('DURATION_SEC:', durationSec);

// 9. Propagação estrita do código de saída
process.exit(finalExitCode);
