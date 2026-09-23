'use strict';

/**
 * PÁTIO CRM — ENSAIO DE RECUPERAÇÃO OPERACIONAL E2E (DISASTER RECOVERY COMPLETO)
 * Valida a recuperação operacional total partindo EXCLUSIVAMENTE do pacote externo.
 * Mede separadamente: cópia/descompactação, integridade estrutural/hashes, boot do servidor
 * e recuperação ponta a ponta com autenticação HTTP, consulta de OS e download de anexo.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { spawn, spawnSync } = require('child_process');
const sqlite3 = require('sqlite3').verbose();

const rootDir = path.resolve(__dirname, '..');

function computeSha256(filePath) {
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
    if (entry.isDirectory()) {
      count += copyDirRecursive(srcPath, destPath);
    } else if (entry.isFile()) {
      fs.copyFileSync(srcPath, destPath);
      count++;
    }
  }
  return count;
}

async function waitForHttp(url, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.status === 200) return true;
    } catch (_) {}
    await new Promise(r => setTimeout(r, 150));
  }
  throw new Error(`Timeout aguardando endpoint HTTP: ${url}`);
}

async function runOperationalRecoveryE2E() {
  console.log('================================================================');
  console.log('🧪 [Pátio CRM] Ensaio de Recuperação Operacional Ponta a Ponta (E2E)');
  console.log('================================================================');

  const tTotalStart = performance.now();
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'patio-e2e-dr-'));
  const sourceDbDir = path.join(tempRoot, 'source_db');
  const sourceUploads = path.join(tempRoot, 'source_uploads');
  const localBackups = path.join(tempRoot, 'local_backups');
  const externalBackups = path.join(tempRoot, 'external_backups');
  const restoredDir = path.join(tempRoot, 'restored');

  fs.mkdirSync(sourceDbDir, { recursive: true });
  fs.mkdirSync(sourceUploads, { recursive: true });
  fs.mkdirSync(localBackups, { recursive: true });
  fs.mkdirSync(externalBackups, { recursive: true });
  fs.mkdirSync(restoredDir, { recursive: true });

  const sourceDbPath = path.join(sourceDbDir, 'patio.db');
  const TEST_PORT = 3999;
  const TEST_HOST = '127.0.0.1';

  // ── 1. Setup da Base Fonte com Usuário, OS e Anexos ──
  console.log('[1/6] Configurando banco operacional simulado e dados de negócio...');
  const sampleAttachmentContent = 'JPEG_MOCK_DATA_EIXO_TRASEIRO_DISASTER_RECOVERY_2026';
  fs.mkdirSync(path.join(sourceUploads, 'default'), { recursive: true });
  fs.writeFileSync(path.join(sourceUploads, 'default', 'foto_eixo_1.jpg'), sampleAttachmentContent);

  // Inicializa SQLite com schema e tabelas
  const sourceDb = new sqlite3.Database(sourceDbPath);
  const runSql = (sql, params = []) => new Promise((res, rej) => sourceDb.run(sql, params, function(err) { if (err) rej(err); else res(this); }));
  
  await runSql('PRAGMA journal_mode = WAL');
  await runSql('CREATE TABLE kv (key TEXT PRIMARY KEY, value TEXT)');
  await runSql('CREATE TABLE backups (id TEXT PRIMARY KEY, tenant_id TEXT, type TEXT, filepath TEXT, size_bytes INTEGER, checksum_sha256 TEXT, status TEXT, executed_by TEXT, created_at TEXT, details_json TEXT)');
  await runSql(`CREATE TABLE users (
    id TEXT PRIMARY KEY, username TEXT UNIQUE, password_hash TEXT, password_salt TEXT, password_algo TEXT,
    name TEXT, phone TEXT, status TEXT, failed_login_attempts INTEGER, locked_until TEXT,
    must_change_password INTEGER, created_at TEXT, updated_at TEXT
  )`);
  await runSql(`CREATE TABLE memberships (
    id TEXT PRIMARY KEY, user_id TEXT, tenant_id TEXT, role TEXT, permissions_json TEXT, created_at TEXT
  )`);

  // Cria usuário admin (com hash scrypt compatível com userRepository)
  const salt = crypto.randomBytes(16).toString('hex');
  const passwordHash = crypto.scryptSync('SenhaSeguraPiloto2026!', salt, 64).toString('hex');
  const now = new Date().toISOString();
  await runSql(`INSERT INTO users VALUES (?, ?, ?, ?, 'scrypt', ?, '', 'active', 0, NULL, 0, ?, ?)`, [
    'usr_admin_1', 'admin_piloto', passwordHash, salt, 'Administrador Piloto', now, now
  ]);
  await runSql(`INSERT INTO memberships VALUES (?, ?, ?, ?, ?, ?)`, [
    'mem_1', 'usr_admin_1', 'default', 'tenant_admin', JSON.stringify(['*']), now
  ]);

  // Estado com OS
  const stateData = {
    tenantId: 'default',
    versao: 1,
    os: [
      { id: 'os_piloto_1001', num: '1001', vei: 'v1', cli: 'c1', st: 'executando', queixa: 'Mola mestra partida' }
    ],
    veiculos: [{ id: 'v1', placa: 'BRA2E19', modelo: 'Constellation 24.280' }],
    clientes: [{ id: 'c1', nome: 'Transportes Brasil Real' }]
  };
  await runSql('INSERT INTO kv VALUES (?, ?)', ['state:default', JSON.stringify(stateData)]);

  await new Promise(r => sourceDb.close(r));
  console.log('✔ Base simulada com schema, usuário autenticável, OS e anexo criada.');

  // ── 2. Executar Backup Operacional com Destino Externo ──
  console.log('[2/6] Executando script oficial de backup operacional com réplica externa...');
  const backupScript = path.join(rootDir, 'scripts', 'executar_backup_operacional.cjs');
  const backupProc = spawnSync(process.execPath, [backupScript], {
    env: {
      ...process.env,
      DB_PATH: sourceDbPath,
      UPLOAD_DIR: sourceUploads,
      BACKUP_DIR: localBackups,
      BACKUP_EXTERNAL_DIR: externalBackups,
      REQUIRE_EXTERNAL_BACKUP: 'true'
    },
    encoding: 'utf8'
  });

  if (backupProc.status !== 0) {
    throw new Error(`Falha no backup operacional: ${backupProc.stderr || backupProc.stdout}`);
  }
  console.log('✔ Backup operacional e replicação externa concluídos com saída 0.');

  // ── 3. Simulação de Desastre Total do Host Local ──
  console.log('[3/6] Simulando desastre total: destruindo banco fonte, anexos fonte e backups locais...');
  fs.rmSync(sourceDbDir, { recursive: true, force: true });
  fs.rmSync(sourceUploads, { recursive: true, force: true });
  fs.rmSync(localBackups, { recursive: true, force: true });

  // Localiza o único pacote sobrevivente no destino externo
  const extPackages = fs.readdirSync(externalBackups).filter(f => f.startsWith('package_'));
  if (extPackages.length !== 1) {
    throw new Error(`Esperado 1 pacote no destino externo, encontrado: ${extPackages.length}`);
  }
  const externalPackageDir = path.join(externalBackups, extPackages[0]);
  console.log(`✔ Desastre simulado. Único artefato sobrevivente: ${externalPackageDir}`);

  // ── 4. Recuperação a Partir do Pacote Externo: Medições Discretas ──
  console.log('[4/6] Iniciando procedimento de recuperação isolada do desastre...');

  // Métrica 1: Descompactação / Cópia dos Arquivos
  const tUnpack0 = performance.now();
  const restoredDbPath = path.join(restoredDir, 'patio.db');
  const restoredUploadsDir = path.join(restoredDir, 'public', 'uploads');
  fs.mkdirSync(restoredUploadsDir, { recursive: true });

  fs.copyFileSync(path.join(externalPackageDir, 'patio.db'), restoredDbPath);
  copyDirRecursive(path.join(externalPackageDir, 'uploads'), restoredUploadsDir);
  const unpackDurationMs = Math.round(performance.now() - tUnpack0);
  console.log(`✔ Tempo de Cópia/Descompactação Física: ${unpackDurationMs} ms`);

  // Métrica 2: Validação de Integridade (Hashes do Manifesto + PRAGMA SQLite)
  const tVal0 = performance.now();
  const manifest = JSON.parse(fs.readFileSync(path.join(externalPackageDir, 'manifest.json'), 'utf8'));

  // Confere hashes
  for (const [relPath, fileInfo] of Object.entries(manifest.files)) {
    let targetPath = null;
    if (relPath === 'patio.db') targetPath = restoredDbPath;
    else if (relPath.startsWith('uploads/')) targetPath = path.join(restoredDir, 'public', relPath);
    else targetPath = path.join(restoredDir, relPath);

    if (!fs.existsSync(targetPath)) {
      throw new Error(`Arquivo ausente na restauração: ${targetPath}`);
    }
    const currentSha = computeSha256(targetPath);
    if (currentSha !== fileInfo.sha256) {
      throw new Error(`Divergência de hash na restauração de ${relPath}`);
    }
  }

  // Integridade estrutural SQLite
  const rDb = new sqlite3.Database(restoredDbPath, sqlite3.OPEN_READONLY);
  const integrity = await new Promise((res, rej) => {
    rDb.get('PRAGMA integrity_check;', (err, row) => {
      rDb.close();
      if (err) rej(err); else res(row?.integrity_check);
    });
  });
  if (integrity !== 'ok') {
    throw new Error(`Falha no PRAGMA integrity_check do banco restaurado: ${integrity}`);
  }
  const validationDurationMs = Math.round(performance.now() - tVal0);
  console.log(`✔ Tempo de Validação de Integridade Criptográfica/Estrutural: ${validationDurationMs} ms`);

  // ── 5. Inicialização da Aplicação Isolada e Boot ──
  console.log(`[5/6] Inicializando servidor isolado na porta ${TEST_PORT}...`);
  const tBoot0 = performance.now();

  const serverProc = spawn(process.execPath, [path.join(rootDir, 'server.js')], {
    cwd: rootDir,
    env: {
      ...process.env,
      HOST: TEST_HOST,
      PORT: String(TEST_PORT),
      DB_PATH: restoredDbPath,
      UPLOAD_DIR: restoredUploadsDir,
      DISABLE_WHATSAPP: 'true',
      DISABLE_INTEGRATIONS: 'true'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  serverProc.on('error', (err) => console.error('[Server Isolado] Erro:', err));

  // Aguarda resposta em /health
  await waitForHttp(`http://${TEST_HOST}:${TEST_PORT}/health`);
  const serverStartupDurationMs = Math.round(performance.now() - tBoot0);
  console.log(`✔ Servidor inicializado e saudável em: ${serverStartupDurationMs} ms`);

  // ── 6. Verificação Funcional HTTP Ponta a Ponta ──
  console.log('[6/6] Executando verificações de negócio: Login, OS e Anexo...');
  const tHttp0 = performance.now();

  // 6.1 Autenticação HTTP (POST /api/auth/login)
  const loginRes = await fetch(`http://${TEST_HOST}:${TEST_PORT}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: 'admin_piloto',
      password: 'SenhaSeguraPiloto2026!'
    })
  });

  if (loginRes.status !== 200) {
    const errText = await loginRes.text();
    throw new Error(`Falha no login do usuário restaurado (HTTP ${loginRes.status}): ${errText}`);
  }
  const loginData = await loginRes.json();
  if (!loginData.success || loginData.user?.username !== 'admin_piloto') {
    throw new Error(`Resposta de login inesperada: ${JSON.stringify(loginData)}`);
  }
  console.log('✔ Login via POST /api/auth/login autenticado com sucesso.');

  // 6.2 Consulta de Estado e OS via API autenticada (Basic Auth)
  const basicAuthHeader = 'Basic ' + Buffer.from('admin_piloto:SenhaSeguraPiloto2026!').toString('base64');
  const stateRes = await fetch(`http://${TEST_HOST}:${TEST_PORT}/api/estado`, {
    headers: { 'Authorization': basicAuthHeader }
  });
  if (stateRes.status !== 200) {
    const errText = await stateRes.text();
    throw new Error(`Falha ao obter estado via HTTP (HTTP ${stateRes.status}): ${errText}`);
  }
  const restoredState = await stateRes.json();
  const osFound = restoredState.os?.find(o => o.num === '1001' || o.id === 'os_piloto_1001');
  if (!osFound || osFound.queixa !== 'Mola mestra partida') {
    throw new Error(`Divergência na OS restaurada: ${JSON.stringify(osFound)}`);
  }
  const vehicleFound = restoredState.veiculos?.find(v => v.placa === 'BRA2E19');
  if (!vehicleFound) throw new Error('Veículo BRA2E19 não localizado no estado restaurado.');
  console.log('✔ Ordem de Serviço 1001 e Veículo BRA2E19 validados via API.');

  // 6.3 Consulta e Download do Anexo via HTTP (com isolamento de tenant)
  const attachRes = await fetch(`http://${TEST_HOST}:${TEST_PORT}/uploads/default/foto_eixo_1.jpg`, {
    headers: { 'Authorization': basicAuthHeader }
  });
  if (attachRes.status !== 200) {
    throw new Error(`Falha ao baixar anexo restaurado via HTTP (HTTP ${attachRes.status})`);
  }
  const attachContent = await attachRes.text();
  if (attachContent !== sampleAttachmentContent) {
    throw new Error('Conteúdo do anexo baixado via HTTP difere dos dados originais!');
  }
  console.log('✔ Download do anexo via HTTP verificado byte a byte com sucesso.');

  const httpVerificationDurationMs = Math.round(performance.now() - tHttp0);
  const e2eRecoveryDurationMs = Math.round(performance.now() - tTotalStart);

  // Encerra servidor de teste
  console.log('Finalizando servidor isolado de teste...');
  serverProc.kill('SIGTERM');
  await new Promise(r => setTimeout(r, 1000));

  // Limpeza
  try { fs.rmSync(tempRoot, { recursive: true, force: true }); } catch (_) {}

  // Gera relatório estruturado
  const report = {
    ensaio: 'Ensaio de Recuperação Operacional E2E (Disaster Recovery Completo)',
    timestamp: new Date().toISOString(),
    ambiente: {
      node: process.version,
      plataforma: process.platform,
      arch: process.arch
    },
    cenario: {
      origem: 'Exclusivamente pacote de backup externo (host original 100% destruído)',
      pacoteRestaurado: extPackages[0]
    },
    metricasDiscretas: {
      tempoDescompactacaoCopiasMs: unpackDurationMs,
      tempoValidacaoIntegridadeHashesMs: validationDurationMs,
      tempoBootServidorMs: serverStartupDurationMs,
      tempoVerificacaoHttpNegocioMs: httpVerificationDurationMs,
      tempoTotalRecuperacaoE2EMs: e2eRecoveryDurationMs
    },
    verificacoesNegocio: {
      autenticacaoHttp: 'APROVADO (POST /api/auth/login -> HTTP 200)',
      ordemDeServicoIntegridade: 'APROVADO (OS 1001, Veículo BRA2E19 conferidos)',
      anexoDownloadHttp: 'APROVADO (GET /uploads/foto_eixo_1.jpg conferido byte a byte)'
    },
    parecerTecnico: 'APROVADO — Recuperação de desastre total comprovada exclusivamente a partir da réplica externa.'
  };

  const outputDir = path.join(rootDir, 'docs', 'evidencias');
  fs.mkdirSync(outputDir, { recursive: true });
  const outputFile = path.join(outputDir, 'recuperacao_operacional_e2e_2026-09-21.json');
  fs.writeFileSync(outputFile, JSON.stringify(report, null, 2), 'utf8');

  console.log('================================================================');
  console.log(`🎉 RECUPERAÇÃO OPERACIONAL E2E CONCLUÍDA COM SUCESSO TOTAL!`);
  console.log(`  - Cópia Física/Descompactação:      ${unpackDurationMs} ms`);
  console.log(`  - Validação SHA-256 e SQLite:      ${validationDurationMs} ms`);
  console.log(`  - Inicialização do Servidor:       ${serverStartupDurationMs} ms`);
  console.log(`  - Verificação de Negócio (HTTP):   ${httpVerificationDurationMs} ms`);
  console.log(`  - TEMPO TOTAL DE RECUPERAÇÃO E2E:  ${e2eRecoveryDurationMs} ms`);
  console.log(`  - Relatório salvo em: ${outputFile}`);
  console.log('================================================================');

  return report;
}

if (require.main === module) {
  runOperationalRecoveryE2E().then(() => process.exit(0)).catch((err) => {
    console.error('❌ Falha crítica no ensaio de recuperação E2E:', err);
    process.exit(1);
  });
}

module.exports = { runOperationalRecoveryE2E };
