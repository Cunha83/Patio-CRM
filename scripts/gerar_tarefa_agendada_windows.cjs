'use strict';

/**
 * PÁTIO CRM — GERADOR DE CONFIGURAÇÃO DE TAREFA AGENDADA WINDOWS
 * Gera definição XML oficial compatível com Windows Task Scheduler 2.0
 * configurando estritamente MultipleInstancesPolicy=IgnoreNew para impedir sobreposição.
 */

const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const scriptPath = path.join(rootDir, 'scripts', 'executar_backup_operacional.cjs');
const nodeExe = process.execPath;
const targetXmlPath = path.join(rootDir, 'docs', 'operacao', 'PatioCRM_Backup_WAL.xml');

function escapeXml(unsafe) {
  if (typeof unsafe !== 'string') return '';
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function buildTaskXml(options = {}) {
  const node = options.nodePath || nodeExe;
  const script = options.scriptPath || scriptPath;
  const workingDir = options.workingDir || rootDir;
  const interval = options.interval || 'PT1H'; // Padrão: a cada 1 hora
  const user = options.user || 'NT AUTHORITY\\SYSTEM';

  const escapedNode = escapeXml(node);
  const escapedScriptArg = escapeXml(`"${script}"`);
  const escapedWorkingDir = escapeXml(workingDir);
  const escapedInterval = escapeXml(interval);
  const escapedUser = escapeXml(user);

  return `<?xml version="1.0" encoding="UTF-8"?>
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo>
    <Description>Backup WAL físico e anexos operacionais do Pátio CRM com integridade SHA-256 e cópia externa garantida.</Description>
    <URI>\\PatioCRM_Backup_WAL</URI>
  </RegistrationInfo>
  <Triggers>
    <TimeTrigger>
      <Repetition>
        <Interval>${escapedInterval}</Interval>
        <StopAtDurationEnd>false</StopAtDurationEnd>
      </Repetition>
      <StartBoundary>2026-09-21T00:00:00</StartBoundary>
      <Enabled>true</Enabled>
    </TimeTrigger>
  </Triggers>
  <Principals>
    <Principal id="Author">
      <UserId>${escapedUser}</UserId>
      <RunLevel>HighestAvailable</RunLevel>
    </Principal>
  </Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <AllowHardTerminate>true</AllowHardTerminate>
    <StartWhenAvailable>true</StartWhenAvailable>
    <RunOnlyIfNetworkAvailable>false</RunOnlyIfNetworkAvailable>
    <IdleSettings>
      <StopOnIdleEnd>true</StopOnIdleEnd>
      <RestartOnIdle>false</RestartOnIdle>
    </IdleSettings>
    <AllowStartOnDemand>true</AllowStartOnDemand>
    <Enabled>true</Enabled>
    <Hidden>false</Hidden>
    <RunOnlyIfIdle>false</RunOnlyIfIdle>
    <WakeToRun>false</WakeToRun>
    <ExecutionTimeLimit>PT2H</ExecutionTimeLimit>
    <Priority>7</Priority>
  </Settings>
  <Actions Context="Author">
    <Exec>
      <Command>${escapedNode}</Command>
      <Arguments>${escapedScriptArg}</Arguments>
      <WorkingDirectory>${escapedWorkingDir}</WorkingDirectory>
    </Exec>
  </Actions>
</Task>
`;
}

function gerarArquivoXml(destPath = targetXmlPath) {
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  const xml = buildTaskXml();
  fs.writeFileSync(destPath, xml, 'utf8');
  console.log(`[Agendador] Definição XML gerada com sucesso em: ${destPath}`);
  return destPath;
}

if (require.main === module) {
  gerarArquivoXml();
}

module.exports = {
  escapeXml,
  buildTaskXml,
  gerarArquivoXml
};
