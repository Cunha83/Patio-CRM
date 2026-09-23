'use strict';

/**
 * PÁTIO CRM — ENSAIO SINTÉTICO DE CÓPIA FÍSICA E INTEGRIDADE SQLITE
 * Mede a velocidade de cópia física e validação de integridade estrutural
 * em pasta efêmera no os.tmpdir(), sem tocar na base patio.db de produção.
 * Para o ensaio completo ponta a ponta com boot e login HTTP, ver scripts/testar_restauracao_operacional_e2e.cjs.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const sqlite3 = require('sqlite3').verbose();

async function runTest() {
  console.log('======================================================');
  console.log('🧪 [Pátio CRM] Ensaio de Restauração Operacional Isolada');
  console.log('======================================================');

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'patio-restore-ensayo-'));
  const sourceDbDir = path.join(tempRoot, 'source');
  const backupDir = path.join(tempRoot, 'backups');
  const restoreTargetDir = path.join(tempRoot, 'restored');
  const uploadsSource = path.join(tempRoot, 'uploads');

  fs.mkdirSync(sourceDbDir, { recursive: true });
  fs.mkdirSync(backupDir, { recursive: true });
  fs.mkdirSync(restoreTargetDir, { recursive: true });
  fs.mkdirSync(uploadsSource, { recursive: true });

  const sourceDbPath = path.join(sourceDbDir, 'operational.db');

  // Cria arquivo de anexo simulado
  fs.writeFileSync(path.join(uploadsSource, 'foto_eixo_1.jpg'), 'JPEG_MOCK_DATA_EIXO_TRASEIRO_123');

  console.log(`[1/5] Inicializando banco de teste em: ${sourceDbPath}`);
  const db = new sqlite3.Database(sourceDbPath);

  const runSql = (sql, params = []) => new Promise((res, rej) => {
    db.run(sql, params, function(err) {
      if (err) rej(err); else res(this);
    });
  });

  const getSql = (sql, params = []) => new Promise((res, rej) => {
    db.get(sql, params, (err, row) => {
      if (err) rej(err); else res(row);
    });
  });

  await runSql('PRAGMA journal_mode = WAL');
  await runSql('CREATE TABLE kv (key TEXT PRIMARY KEY, value TEXT)');
  await runSql('CREATE TABLE backups (id TEXT PRIMARY KEY, tenant_id TEXT, type TEXT, filepath TEXT, size_bytes INTEGER, checksum_sha256 TEXT, status TEXT, executed_by TEXT, created_at TEXT, details_json TEXT)');

  const mockState = {
    tenantId: 'oficina_piloto',
    versao: 15,
    os: [
      { id: 'os_piloto_1001', num: '1001', vei: 'v1', cli: 'c1', st: 'executando', queixa: 'Mola mestra partida' }
    ],
    veiculos: [{ id: 'v1', placa: 'BRA2E19', modelo: 'Constellation 24.280' }],
    clientes: [{ id: 'c1', nome: 'Transportes Brasil Real' }]
  };

  await runSql('INSERT INTO kv (key, value) VALUES (?, ?)', ['state:oficina_piloto', JSON.stringify(mockState)]);

  console.log('[2/5] Executando VACUUM INTO para gerar snapshot atômico WAL...');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupId = `bck_ensayo_${Date.now()}`;
  const backupDbPath = path.join(backupDir, `patio_${backupId}_${timestamp}.db`);

  const t0 = performance.now();
  await runSql('VACUUM INTO ?', [backupDbPath]);
  const backupDurationMs = Math.round(performance.now() - t0);
  console.log(`✔ Snapshot WAL gerado em ${backupDurationMs}ms (${fs.statSync(backupDbPath).size} bytes).`);

  // Cópia dos anexos
  const uploadsBackupTarget = path.join(backupDir, `uploads_oficina_piloto_${timestamp}`);
  fs.mkdirSync(uploadsBackupTarget, { recursive: true });
  fs.copyFileSync(path.join(uploadsSource, 'foto_eixo_1.jpg'), path.join(uploadsBackupTarget, 'foto_eixo_1.jpg'));
  console.log('✔ Anexos arquivados com sucesso.');

  // Checksum
  const checksum = crypto.createHash('sha256').update(fs.readFileSync(backupDbPath)).digest('hex');
  console.log(`✔ Checksum SHA-256: ${checksum}`);

  // Fecha conexão fonte
  await new Promise(r => db.close(r));

  console.log('[3/5] Validando integridade da imagem de backup antes da restauração...');
  const verifyDb = new sqlite3.Database(backupDbPath);
  const verifyGet = (sql) => new Promise((res, rej) => verifyDb.get(sql, (err, row) => err ? rej(err) : res(row)));
  const integrity = await verifyGet('PRAGMA integrity_check');
  await new Promise(r => verifyDb.close(r));

  if (integrity.integrity_check !== 'ok') {
    throw new Error(`Integridade comprometida no arquivo de backup: ${JSON.stringify(integrity)}`);
  }
  console.log('✔ PRAGMA integrity_check = ok no arquivo de backup.');

  console.log('[4/5] Executando restauração isolada no diretório destino...');
  const tRestore0 = performance.now();

  const restoredDbPath = path.join(restoreTargetDir, 'patio.db');
  fs.copyFileSync(backupDbPath, restoredDbPath);

  const restoredUploadsDir = path.join(restoreTargetDir, 'uploads');
  fs.mkdirSync(restoredUploadsDir, { recursive: true });
  fs.copyFileSync(path.join(uploadsBackupTarget, 'foto_eixo_1.jpg'), path.join(restoredUploadsDir, 'foto_eixo_1.jpg'));

  const restoreDurationMs = Math.round(performance.now() - tRestore0);
  console.log(`✔ Restauração física concluída em ${restoreDurationMs}ms.`);

  console.log('[5/5] Conferindo integridade de dados restaurados no SQLite...');
  const restoredDb = new sqlite3.Database(restoredDbPath);
  const rGet = (sql, params = []) => new Promise((res, rej) => restoredDb.get(sql, params, (err, row) => err ? rej(err) : res(row)));

  const restoredIntegrity = await rGet('PRAGMA integrity_check');
  const restoredKv = await rGet('SELECT value FROM kv WHERE key = ?', ['state:oficina_piloto']);
  await new Promise(r => restoredDb.close(r));

  const parsedState = JSON.parse(restoredKv.value);
  if (parsedState.os[0].id !== 'os_piloto_1001' || parsedState.veiculos[0].placa !== 'BRA2E19') {
    throw new Error('Divergência de conteúdo nos dados restaurados!');
  }

  // Verifica anexo restaurado
  const restoredAttachmentData = fs.readFileSync(path.join(restoredUploadsDir, 'foto_eixo_1.jpg'), 'utf8');
  if (restoredAttachmentData !== 'JPEG_MOCK_DATA_EIXO_TRASEIRO_123') {
    throw new Error('Anexo corrompido na restauração!');
  }

  console.log('✔ Todos os dados e anexos conferidos com 100% de precisão.');
  console.log(`✔ Duração da Cópia Física Sintética: ${restoreDurationMs} ms (Nota: Não representa o RTO E2E total; para recuperação ponta a ponta com boot e HTTP, execute scripts/testar_restauracao_operacional_e2e.cjs).`);

  // Limpeza
  try {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  } catch (_) {}

  console.log('======================================================');
  console.log('🎉 Ensaio de Restauração Isolada concluído com SUCESSO TOTAL');
  console.log('======================================================');

  return {
    ok: true,
    backupDurationMs,
    restoreDurationMs,
    integrity: 'ok',
    dataVerified: true
  };
}

if (require.main === module) {
  runTest().then(() => process.exit(0)).catch(err => {
    console.error('❌ Falha no ensaio de restauração:', err);
    process.exit(1);
  });
}

module.exports = { runTest };
