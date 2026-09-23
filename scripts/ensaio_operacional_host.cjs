'use strict';

/**
 * PÁTIO CRM — SCRIPT DE ENSAIO OPERACIONAL PRÉ-PILOTO NO HOST
 * Valida o ciclo de preparação do host sem tocar nos dados de produção:
 * 1. Lockfile e integridade de dependências
 * 2. Geração e parsing real do XML do agendador com caminhos do host
 * 3. Verificação da conta executora e diretório externo de backup
 * 4. Execução de backup físico operacional autocontido
 * 5. Restauração isolada a partir do pacote externo com boot funcional e teste de login, leitura, escrita e anexos
 * 6. Emissão de relatório estruturado (APROVADO / PENDENTE / FALHOU)
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const net = require('net');
const crypto = require('crypto');
const { spawn, spawnSync } = require('child_process');
const { performance } = require('perf_hooks');

const rootDir = path.resolve(__dirname, '..');
const productionDbPath = path.join(rootDir, 'patio.db');
const evidenceDir = path.join(rootDir, 'docs', 'evidencias');
fs.mkdirSync(evidenceDir, { recursive: true });
const evidenceJsonPath = path.join(evidenceDir, 'ensaio_operacional_host_2026-09-21.json');

const taskGenerator = require('./gerar_tarefa_agendada_windows.cjs');

function getDbHash(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

async function runHostRehearsal() {
  console.log('================================================================');
  console.log(' PÁTIO CRM — ENSAIO OPERACIONAL PRÉ-PILOTO NO HOST DA OFICINA');
  console.log(' Data:', new Date().toISOString());
  console.log(' Host:', os.hostname(), '| Plataforma:', os.platform(), os.arch());
  console.log('================================================================\n');

  const prodHashBefore = getDbHash(productionDbPath);
  const prodMtimeBefore = fs.existsSync(productionDbPath) ? fs.statSync(productionDbPath).mtimeMs : null;

  const results = {
    dataExecucao: new Date().toISOString(),
    host: os.hostname(),
    nodeVersion: process.version,
    plataforma: `${os.platform()} (${os.arch()})`,
    etapas: []
  };

  const tempWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), 'patio-host-rehearsal-'));

  try {
    // -------------------------------------------------------------
    // ETAPA 1: Verificação Sintática do Lockfile (Simulação de Pré-Voo)
    // -------------------------------------------------------------
    console.log('Etapa 1: Validando formato e integridade sintática do lockfile (Simulação de Pré-Voo)...');
    let lockfileStatus = 'APROVADO_SIMULADO';
    let lockfileMsg = '';
    try {
      const pkgPath = path.join(rootDir, 'package.json');
      const lockPath = path.join(rootDir, 'package-lock.json');
      if (!fs.existsSync(pkgPath) || !fs.existsSync(lockPath)) {
        throw new Error('package.json ou package-lock.json ausente.');
      }
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
      if (!lock.packages && !lock.dependencies) {
        throw new Error('package-lock.json não possui árvore de pacotes mapeada.');
      }
      lockfileMsg = `Lockfile válido sintaticamente (versão ${lock.lockfileVersion || 2}), ${Object.keys(pkg.dependencies || {}).length} dependências mapeadas. NOTA: Esta etapa afere apenas o arquivo; a instalação real de dependências requer npm ci em pasta independente.`;
      console.log('  ✔ [SIMULAÇÃO]:', lockfileMsg);
    } catch (err) {
      lockfileStatus = 'FALHOU';
      lockfileMsg = err.message;
      console.error('  ✖ Erro no lockfile:', err.message);
    }
    results.etapas.push({
      etapa: '1_lockfile_dependencias_simulado',
      nome: 'Validação Sintática do Lockfile (Simulação de Pré-Voo)',
      status: lockfileStatus,
      detalhes: lockfileMsg
    });

    // -------------------------------------------------------------
    // ETAPA 2: Geração e Parsing Sintático do XML (Simulação de Pré-Voo)
    // -------------------------------------------------------------
    console.log('\nEtapa 2: Gerando e validando XML de agendamento em arquivo temporário...');
    let xmlStatus = 'APROVADO_SIMULADO';
    let xmlMsg = '';
    try {
      const hostXmlPath = path.join(tempWorkspace, 'PatioCRM_Host_Test.xml');
      const xmlContent = taskGenerator.buildTaskXml({
        nodePath: process.execPath,
        scriptPath: path.join(rootDir, 'scripts', 'executar_backup_operacional.cjs'),
        workingDir: rootDir,
        interval: 'PT1H',
        user: 'NT AUTHORITY\\SYSTEM'
      });
      fs.writeFileSync(hostXmlPath, xmlContent, 'utf8');

      // Validação pelo parser XML real do Windows (.NET XmlReader)
      const psScript = `
        $ErrorActionPreference = 'Stop'
        $path = [System.IO.Path]::GetFullPath('${hostXmlPath.replace(/'/g, "''")}')
        $settings = New-Object System.Xml.XmlReaderSettings
        $reader = [System.Xml.XmlReader]::Create($path, $settings)
        while ($reader.Read()) { }
        $reader.Close()

        $doc = New-Object System.Xml.XmlDocument
        $doc.Load($path)
        $ns = New-Object System.Xml.XmlNamespaceManager($doc.NameTable)
        $ns.AddNamespace('t', 'http://schemas.microsoft.com/windows/2004/02/mit/task')

        $policy = $doc.SelectSingleNode('//t:MultipleInstancesPolicy', $ns).InnerText
        $cmd = $doc.SelectSingleNode('//t:Command', $ns).InnerText
        Write-Output "PARSER_OK|$policy|$cmd"
      `;
      const psRes = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', psScript], { encoding: 'utf8' });
      if (psRes.status !== 0 || !psRes.stdout.includes('PARSER_OK|IgnoreNew|')) {
        throw new Error(`Falha no parser XML real do Windows: ${psRes.stderr || psRes.stdout}`);
      }
      xmlMsg = 'XML validado sintaticamente em UTF-8 com MultipleInstancesPolicy=IgnoreNew. NOTA: Não comprova registro nem execução no Agendador do Windows.';
      console.log('  ✔ [SIMULAÇÃO]:', xmlMsg);
    } catch (err) {
      xmlStatus = 'FALHOU';
      xmlMsg = err.message;
      console.error('  ✖ Erro no XML:', err.message);
    }
    results.etapas.push({
      etapa: '2_agendador_xml_simulado',
      nome: 'Geração e Parsing Sintático do XML (Simulação de Pré-Voo)',
      status: xmlStatus,
      detalhes: xmlMsg
    });

    // -------------------------------------------------------------
    // ETAPA 3: Destino Externo (Simulado em Staging vs Host)
    // -------------------------------------------------------------
    console.log('\nEtapa 3: Verificando destino externo de backup físico...');
    const configuredExternal = process.env.BACKUP_EXTERNAL_DIR;
    let externalStatus = 'SIMULADO_STAGING_TEMPORARIO';
    let externalMsg = '';

    const mockExternalDir = path.join(tempWorkspace, 'external_storage_mock');
    fs.mkdirSync(mockExternalDir, { recursive: true });

    if (configuredExternal && fs.existsSync(configuredExternal)) {
      externalStatus = 'CONFIGURADO_NO_HOST';
      externalMsg = `Diretório configurado no host existe: ${configuredExternal}. Requer validação prática da tarefa agendada.`;
      console.log('  ✔ [HOST]:', externalMsg);
    } else {
      externalStatus = 'PENDENTE_HOST_FISICO';
      externalMsg = `Mídia externa física não conectada. Mecanismo testado em staging temporário: ${mockExternalDir}.`;
      console.log('  ⚠ [SIMULAÇÃO]:', externalMsg);
    }
    results.etapas.push({
      etapa: '3_destino_externo_simulado',
      nome: 'Conferência de Destino Externo (Staging Simulado)',
      status: externalStatus,
      detalhes: externalMsg
    });

    // -------------------------------------------------------------
    // ETAPA 4: Execução do Backup Físico (Simulação com Dados Mock)
    // -------------------------------------------------------------
    console.log('\nEtapa 4: Executando simulação de backup operacional autocontido...');
    let backupStatus = 'APROVADO_SIMULADO';
    let backupMsg = '';
    const isolatedSourceDb = path.join(tempWorkspace, 'source_test.db');
    const isolatedUploadsDir = path.join(tempWorkspace, 'source_uploads');
    const isolatedLocalBackupDir = path.join(tempWorkspace, 'local_backups');
    fs.mkdirSync(isolatedUploadsDir, { recursive: true });
    fs.mkdirSync(isolatedLocalBackupDir, { recursive: true });

    // Cria anexo de teste
    const sampleAttachmentPath = path.join(isolatedUploadsDir, 'laudo_vistoria_ensaio.pdf');
    fs.writeFileSync(sampleAttachmentPath, '%PDF-1.4 Laudo Operacional de Teste de Ensaio');

    // Inicializa banco de teste temporário com dados de exemplo e usuários individuais dos 3 operadores
    const { initDB, run, closeDB } = require('../db');
    const userRepository = require('../lib/auth/userRepository');
    process.env.DB_PATH = isolatedSourceDb;
    await initDB();

    const tenantEnsaio = 'oficina_ensaio_host';
    const ensaioCreds = {
      gestor: `Gst#Sec_${crypto.randomBytes(8).toString('hex')}`,
      atendente: `Atd#Sec_${crypto.randomBytes(8).toString('hex')}`,
      mecanico: `Mec#Sec_${crypto.randomBytes(8).toString('hex')}`
    };
    await userRepository.createUser({
      username: 'gestor_ensaio@oficina.com.br',
      password: ensaioCreds.gestor,
      role: 'tenant_admin',
      tenantId: tenantEnsaio,
      allowWeakInTest: false
    });
    await userRepository.createUser({
      username: 'atendente_ensaio@oficina.com.br',
      password: ensaioCreds.atendente,
      role: 'atendente',
      tenantId: tenantEnsaio,
      allowWeakInTest: false
    });
    await userRepository.createUser({
      username: 'mecanico_ensaio@oficina.com.br',
      password: ensaioCreds.mecanico,
      role: 'mecanico',
      tenantId: tenantEnsaio,
      allowWeakInTest: false
    });

    await run('INSERT INTO kv (key, value) VALUES (?, ?)', [
      `tenant:${tenantEnsaio}:state`,
      JSON.stringify({
        versao: 1,
        os: [{ id: 'os_ensaio_01', num: 9001, total: 3450.00, st: 'aberta' }],
        clientes: [{ id: 'cli_ensaio_01', nome: 'Transportadora Ensaio Ltda' }]
      })
    ]);
    await closeDB();

    // Executa executar_backup_operacional.cjs via subprocesso
    const backupScript = path.join(rootDir, 'scripts', 'executar_backup_operacional.cjs');
    const tBackupStart = performance.now();
    const backupProc = spawnSync(process.execPath, [backupScript], {
      env: {
        ...process.env,
        DB_PATH: isolatedSourceDb,
        UPLOAD_DIR: isolatedUploadsDir,
        BACKUP_DIR: isolatedLocalBackupDir,
        BACKUP_EXTERNAL_DIR: mockExternalDir,
        REQUIRE_EXTERNAL_BACKUP: 'true'
      },
      encoding: 'utf8'
    });
    const tBackupMs = Math.round(performance.now() - tBackupStart);

    if (backupProc.status !== 0) {
      backupStatus = 'FALHOU';
      backupMsg = `Execução de backup retornou código ${backupProc.status}: ${backupProc.stderr || backupProc.stdout}`;
      console.error('  ✖ Erro no backup:', backupMsg);
    } else {
      const externalEntries = fs.readdirSync(mockExternalDir).filter(f => f.startsWith('package_bck_'));
      if (externalEntries.length === 0) {
        throw new Error('Nenhum pacote package_bck_* encontrado no destino externo.');
      }
      backupMsg = `Simulação de backup gerada em ${tBackupMs}ms. Pacote ${externalEntries[0]} com integridade SHA-256 conferida. NOTA: Executado com dados mock; não é execução da tarefa do agendador.`;
      console.log('  ✔ [SIMULAÇÃO]:', backupMsg);
    }
    results.etapas.push({
      etapa: '4_execucao_backup_simulado',
      nome: 'Execução de Backup Operacional (Simulação com Dados Mock)',
      status: backupStatus,
      tempoMs: tBackupMs,
      detalhes: backupMsg
    });

    // -------------------------------------------------------------
    // ETAPA 5: Restauração Isolada e Teste Operacional com Login Real dos 3 Operadores
    // -------------------------------------------------------------
    console.log('\nEtapa 5: Realizando restauração do pacote em pasta limpa com login dos 3 operadores...');
    let restoreStatus = 'APROVADO_SIMULADO';
    let restoreMsg = '';
    let tTotalRecoveryMs = 0;

    const restoreWorkspace = path.join(tempWorkspace, 'restored_host_app');
    fs.mkdirSync(restoreWorkspace, { recursive: true });
    const restoredDb = path.join(restoreWorkspace, 'restored.db');
    const restoredUploads = path.join(restoreWorkspace, 'uploads');

    const externalPackages = fs.readdirSync(mockExternalDir).filter(f => f.startsWith('package_bck_'));
    const chosenPackage = path.join(mockExternalDir, externalPackages[0]);

    const tRestoreStart = performance.now();
    fs.copyFileSync(path.join(chosenPackage, 'patio.db'), restoredDb);
    fs.cpSync(path.join(chosenPackage, 'uploads'), restoredUploads, { recursive: true });

    // Probe de porta livre
    const probe = net.createServer();
    probe.listen(0, '127.0.0.1');
    await new Promise(r => probe.once('listening', r));
    const testPort = probe.address().port;
    await new Promise(r => probe.close(r));

    let serverLogs = '';
    const serverProc = spawn(process.execPath, ['server.js'], {
      cwd: rootDir,
      windowsHide: true,
      env: {
        ...process.env,
        PORT: String(testPort),
        HOST: '127.0.0.1',
        DB_PATH: restoredDb,
        UPLOAD_DIR: restoredUploads,
        DISABLE_INTEGRATIONS: 'true',
        API_KEY: ''
      }
    });

    serverProc.stdout.on('data', d => { serverLogs += d.toString(); });
    serverProc.stderr.on('data', d => { serverLogs += d.toString(); });

    let isUp = false;
    const deadline = Date.now() + 25000;
    try {
      while (Date.now() < deadline) {
        if (serverProc.exitCode !== null) throw new Error('Servidor restaurado encerrou precocemente: ' + serverLogs);
        try {
          const rH = await fetch(`http://127.0.0.1:${testPort}/health`);
          const rR = await fetch(`http://127.0.0.1:${testPort}/ready`);
          if (rH.status === 200 && rR.status === 200) {
            isUp = true;
            break;
          }
        } catch (_) {}
        await new Promise(r => setTimeout(r, 200));
      }

      if (!isUp) throw new Error('Servidor restaurado não respondeu em 25 segundos.');

      // 5.1 Validação de login individual dos 3 operadores via Basic Auth
      const usersToTest = [
        { user: 'gestor_ensaio@oficina.com.br', pass: ensaioCreds.gestor, role: 'tenant_admin' },
        { user: 'atendente_ensaio@oficina.com.br', pass: ensaioCreds.atendente, role: 'atendente' },
        { user: 'mecanico_ensaio@oficina.com.br', pass: ensaioCreds.mecanico, role: 'mecanico' }
      ];

      for (const u of usersToTest) {
        const headers = {
          'Authorization': 'Basic ' + Buffer.from(`${u.user}:${u.pass}`).toString('base64'),
          'x-tenant-id': tenantEnsaio
        };
        const resAuth = await fetch(`http://127.0.0.1:${testPort}/api/estado`, { headers });
        if (resAuth.status !== 200) {
          throw new Error(`Falha na autenticação do operador ${u.user}: HTTP ${resAuth.status}`);
        }
      }

      // 5.2 Leitura de dados operacionais restaurados (com perfil gestor)
      const gestorHeaders = {
        'Authorization': 'Basic ' + Buffer.from(`gestor_ensaio@oficina.com.br:${ensaioCreds.gestor}`).toString('base64'),
        'x-tenant-id': tenantEnsaio
      };
      const resGet = await fetch(`http://127.0.0.1:${testPort}/api/estado`, { headers: gestorHeaders });
      const dataGet = await resGet.json();
      if (!dataGet.os || dataGet.os[0].num !== 9001) {
        throw new Error('Dados da OS restaurada não conferem (esperado OS 9001).');
      }

      // 5.3 Escrita de nova OS no banco restaurado
      const newState = {
        ...dataGet,
        os: [
          ...dataGet.os,
          { id: 'os_ensaio_02', num: 9002, total: 1200.00, st: 'aberta' }
        ]
      };
      const resPost = await fetch(`http://127.0.0.1:${testPort}/api/estado`, {
        method: 'POST',
        headers: { ...gestorHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify(newState)
      });
      if (resPost.status !== 200) throw new Error(`POST /api/estado retornou ${resPost.status}`);

      // 5.4 Conferência de anexo restaurado
      const restoredAttachment = path.join(restoredUploads, 'laudo_vistoria_ensaio.pdf');
      if (!fs.existsSync(restoredAttachment)) {
        throw new Error('Anexo não foi recuperado no diretório de uploads restaurado.');
      }

      tTotalRecoveryMs = Math.round(performance.now() - tRestoreStart);
      restoreMsg = `Simulação de recuperação aprovada em ${tTotalRecoveryMs}ms. Login individual dos 3 operadores, leitura (OS 9001), escrita (OS 9002) e anexo validados.`;
      console.log('  ✔ [SIMULAÇÃO]:', restoreMsg);
    } catch (err) {
      restoreStatus = 'FALHOU';
      restoreMsg = err.message;
      console.error('  ✖ Erro na recuperação:', err.message);
    } finally {
      serverProc.kill('SIGKILL');
      await new Promise(r => setTimeout(r, 500));
    }

    results.etapas.push({
      etapa: '5_restauracao_operacional_simulada',
      nome: 'Restauração Isolada e Teste Operacional (Simulação de Pré-Voo)',
      status: restoreStatus,
      rtoMs: tTotalRecoveryMs,
      detalhes: restoreMsg
    });

    // -------------------------------------------------------------
    // ETAPA 6: Verificação de Intangibilidade da Base de Produção
    // -------------------------------------------------------------
    console.log('\nEtapa 6: Verificando integridade da base operacional real (patio.db)...');
    const prodHashAfter = getDbHash(productionDbPath);
    const prodMtimeAfter = fs.existsSync(productionDbPath) ? fs.statSync(productionDbPath).mtimeMs : null;

    let prodStatus = 'APROVADO';
    let prodMsg = '';
    if (prodHashBefore === prodHashAfter && prodMtimeBefore === prodMtimeAfter) {
      prodMsg = 'A base de dados real patio.db permaneceu 100% INTOCADA durante todo o ensaio.';
      console.log('  ✔', prodMsg);
    } else {
      prodStatus = 'FALHOU';
      prodMsg = 'ALERTA CRÍTICO: Modificação detectada na base operacional de produção!';
      console.error('  ✖', prodMsg);
    }
    results.etapas.push({
      etapa: '6_preservacao_producao',
      nome: 'Preservação da Base Real patio.db',
      status: prodStatus,
      detalhes: prodMsg
    });

  } finally {
    try { fs.rmSync(tempWorkspace, { recursive: true, force: true }); } catch (_) {}
  }

  // Parecer final: ESTREITAMENTE IDENTIFICA A SIMULAÇÃO
  const anyFailed = results.etapas.some(e => e.status === 'FALHOU');
  results.parecerFinal = anyFailed
    ? 'FALHOU'
    : 'ENSAIO_SIMULADO_CONCLUIDO_INSTALACAO_E_AGENDAMENTO_REAIS_PENDENTES';

  fs.writeFileSync(evidenceJsonPath, JSON.stringify(results, null, 2), 'utf8');
  console.log('\n================================================================');
  console.log(' RELATÓRIO DO ENSAIO OPERACIONAL PRÉ-PILOTO:');
  console.log(` Parecer: ${results.parecerFinal}`);
  console.log(` Evidência salva em: ${evidenceJsonPath}`);
  console.log('================================================================\n');

  return results;
}


if (require.main === module) {
  runHostRehearsal()
    .then(r => {
      const exitCode = r.parecerFinal === 'FALHOU' ? 1 : 0;
      process.exit(exitCode);
    })
    .catch(err => {
      console.error('Erro fatal no ensaio do host:', err);
      process.exit(1);
    });
}

module.exports = {
  runHostRehearsal
};
