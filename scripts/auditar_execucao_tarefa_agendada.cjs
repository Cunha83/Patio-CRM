'use strict';

/**
 * PÁTIO CRM — AUDITORIA DE EXECUÇÃO REAL DA TAREFA AGENDADA DO WINDOWS
 * 
 * Executa a tarefa agendada oficial via schtasks /Run /TN "PatioCRM_Backup_WAL",
 * aguarda o término e realiza auditoria em profundidade:
 * 1. Status retornado pelo agendador.
 * 2. Registro gravado no banco SQLite de produção (deploy-piloto/patio.db).
 * 3. Existência física do pacote de backup e manifesto SHA-256 no disco.
 * 4. Alerta operacional gerado (logs/backup_alert.json) caso o hardware externo esteja desconectado.
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const rootDir = path.resolve(__dirname, '..');
const deployDir = path.join(rootDir, 'deploy-piloto');
const deployDbPath = path.join(deployDir, 'patio.db');
const alertLogPath = path.join(deployDir, 'logs', 'backup_alert.json');

async function auditarExecucaoTarefaAgendada() {
  console.log('================================================================');
  console.log(' PÁTIO CRM — AUDITORIA DE EXECUÇÃO REAL DA TAREFA AGENDADA');
  console.log(' Tarefa: \\PatioCRM_Backup_WAL');
  console.log(' Host:   AMF01');
  console.log(' Data:  ', new Date().toISOString());
  console.log('================================================================\n');

  // 1. Consulta estado anterior no banco SQLite
  const db = require(path.join(deployDir, 'db'));
  process.env.DB_PATH = deployDbPath;
  process.env.NODE_ENV = 'production';
  await db.initDB();

  const prevBackups = await db.all('SELECT id, status, created_at FROM backups ORDER BY created_at DESC LIMIT 1');
  const prevId = prevBackups[0]?.id || null;
  console.log(`[Pré-Execução] Último backup registrado anteriormente: ${prevId || 'Nenhum'}`);

  // Limpa alerta anterior para auditar evento fresco
  if (fs.existsSync(alertLogPath)) {
    try { fs.unlinkSync(alertLogPath); } catch (_) {}
  }

  // 2. Dispara a tarefa agendada
  console.log('[Execução] Disparando schtasks /Run /TN "PatioCRM_Backup_WAL"...');
  try {
    const runOutput = execSync('schtasks /Run /TN "PatioCRM_Backup_WAL"', { encoding: 'utf8' });
    console.log('  Saída schtasks /Run:', runOutput.trim());
  } catch (runErr) {
    throw new Error(`Falha ao disparar tarefa agendada: ${runErr.message}`);
  }

  // 3. Aguarda a tarefa concluir a execução
  console.log('[Execução] Aguardando término do processo disparado pelo agendador...');
  let taskStatus = 'Desconhecido';
  let lastResult = 'N/A';
  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 1000));
    try {
      const qOutput = execSync('schtasks /Query /TN "PatioCRM_Backup_WAL" /V /FO LIST', { encoding: 'utf8' });
      const statusMatch = qOutput.match(/Status:\s+([^\r\n]+)/);
      const resultMatch = qOutput.match(/(?:Último resultado|Result):\s+([^\r\n]+)/i);
      taskStatus = statusMatch ? statusMatch[1].trim() : 'Desconhecido';
      lastResult = resultMatch ? resultMatch[1].trim() : 'N/A';
      if (taskStatus === 'Pronto' || taskStatus === 'Ready') {
        break;
      }
    } catch (_) {}
  }

  console.log(`[Agendador Windows] Status final: "${taskStatus}" | Código de retorno: ${lastResult}`);

  // 4. Inspeciona a tabela backups para comprovar a execução
  await new Promise(r => setTimeout(r, 1500)); // Pequena margem para liberação de escrita
  const currentBackups = await db.all('SELECT id, type, filepath, size_bytes, checksum_sha256, status, executed_by, created_at, details_json FROM backups ORDER BY created_at DESC LIMIT 1');
  await db.closeDB();

  const latest = currentBackups[0];
  if (!latest) {
    throw new Error('Nenhum registro encontrado na tabela backups.');
  }

  console.log('\n[Auditoria SQLite de Produção]');
  console.log(`  ID do Backup:       ${latest.id}`);
  console.log(`  Tipo:               ${latest.type}`);
  console.log(`  Status no Banco:    ${latest.status}`);
  console.log(`  Executado Por:      ${latest.executed_by}`);
  console.log(`  Timestamp SQLite:   ${latest.created_at}`);
  console.log(`  Tamanho (bytes):    ${latest.size_bytes}`);
  console.log(`  Checksum SHA-256:   ${latest.checksum_sha256}`);
  console.log(`  Caminho do Pacote:  ${latest.filepath}`);

  const isNewBackup = latest.id !== prevId;
  console.log(`\n  ✔ Novo registro confirmado: ${isNewBackup ? 'SIM' : 'NÃO'}`);

  // 5. Inspeciona integridade física do pacote no disco
  let pkgExists = false;
  let manifestExists = false;
  let dbExists = false;
  if (latest.filepath && fs.existsSync(latest.filepath)) {
    pkgExists = true;
    manifestExists = fs.existsSync(path.join(latest.filepath, 'manifest.json'));
    dbExists = fs.existsSync(path.join(latest.filepath, 'patio.db'));
  }

  console.log(`  ✔ Pacote local existente no disco: ${pkgExists ? 'SIM' : 'NÃO'}`);
  console.log(`  ✔ Manifesto JSON no pacote:        ${manifestExists ? 'SIM' : 'NÃO'}`);
  console.log(`  ✔ Snapshot WAL patio.db no pacote: ${dbExists ? 'SIM' : 'NÃO'}`);

  // 6. Inspeciona alerta de hardware externo
  let alertDetails = null;
  if (fs.existsSync(alertLogPath)) {
    try {
      alertDetails = JSON.parse(fs.readFileSync(alertLogPath, 'utf8'));
    } catch (_) {}
  }

  console.log('\n[Auditoria de Redundância Externa Independente]');
  if (alertDetails) {
    console.log(`  Status da Cópia Externa: PENDENTE / ALERTA REGISTRADO`);
    console.log(`  Mensagem do Alerta:      "${alertDetails.error}"`);
    console.log(`  Snapshot Local Preservado: ${alertDetails.localSnapshotPreserved}`);
    console.log(`  Destino Externo Alvo:    "${alertDetails.externalDir}"`);
  } else if (latest.status === 'completed_external_verified') {
    console.log(`  Status da Cópia Externa: CONCLUÍDO E VERIFICADO NO DESTINO EXTERNO`);
  } else {
    console.log(`  Status da Cópia Externa: ${latest.status}`);
  }

  const report = {
    timestamp: new Date().toISOString(),
    taskName: '\\PatioCRM_Backup_WAL',
    schedulerStatus: taskStatus,
    schedulerLastResult: lastResult,
    sqliteRecord: {
      isNew: isNewBackup,
      id: latest.id,
      status: latest.status,
      executedBy: latest.executed_by,
      createdAt: latest.created_at,
      sizeBytes: latest.size_bytes,
      checksumSha256: latest.checksum_sha256,
      filepath: latest.filepath
    },
    physicalIntegrity: {
      packageExists: pkgExists,
      manifestExists,
      snapshotDbExists: dbExists
    },
    externalProtection: {
      status: alertDetails ? 'pending_hardware_connection' : latest.status,
      alert: alertDetails
    }
  };

  const reportFile = path.join(rootDir, 'docs', 'evidencias', 'auditoria_execucao_tarefa_agendada.json');
  fs.writeFileSync(reportFile, JSON.stringify(report, null, 2), 'utf8');
  console.log(`\n✔ Relatório formal de auditoria gravado em: ${reportFile}`);

  return report;
}

if (require.main === module) {
  auditarExecucaoTarefaAgendada()
    .then(() => process.exit(0))
    .catch(err => {
      console.error('Erro na auditoria da tarefa agendada:', err.message);
      process.exit(1);
    });
}

module.exports = {
  auditarExecucaoTarefaAgendada
};
