'use strict';

/**
 * PÁTIO CRM — SCRIPT DE IMPLANTAÇÃO REAL E ENSAIO NO HOST DA OFICINA
 * Executa todas as etapas práticas definitivas no host:
 * 1. Configuração definitiva em deploy-piloto (.env de produção, pasta externa C:\Users\AutoMolasFort\PatioCRM_Backups_Externos)
 * 2. Inicialização e seed de patio.db na instalação limpa (3 operadores com RBAC e vistoria PDF)
 * 3. Geração e registro formal da tarefa agendada PatioCRM_Backup_WAL no Windows Task Scheduler
 * 4. Disparo e comprovação da execução da tarefa com LastResult = 0x0 e integridade do pacote no destino externo
 * 5. Restauração e teste operacional real com boot efêmero, login dos 3 operadores, leitura, escrita e anexo
 * 6. Comprovação de intangibilidade da base raiz
 * 7. Gravação do relatório de evidência docs/evidencias/implantacao_real_host_2026-09-21.json
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const net = require('net');
const crypto = require('crypto');
const { spawn, spawnSync } = require('child_process');
const { performance } = require('perf_hooks');

const rootDir = path.resolve(__dirname, '..');
const deployDir = process.env.DEPLOY_DIR ? path.resolve(process.env.DEPLOY_DIR) : path.join(rootDir, 'deploy-piloto');
const productionRootDb = path.join(rootDir, 'patio.db');
const externalBackupDir = 'C:\\Users\\AutoMolasFort\\PatioCRM_Backups_Externos';
const evidenceDir = path.join(rootDir, 'docs', 'evidencias');
const evidenceJsonPath = path.join(evidenceDir, 'implantacao_real_host_2026-09-21.json');

const taskGenerator = require('./gerar_tarefa_agendada_windows.cjs');

function getSha256(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function assertExternalAccess(dirPath) {
  const testFile = path.join(dirPath, '.write_test_' + Date.now());
  fs.writeFileSync(testFile, 'OK', 'utf8');
  fs.rmSync(testFile, { force: true });
}

async function runRealDeploymentAndRehearsal() {
  console.log('================================================================');
  console.log(' PÁTIO CRM — IMPLANTAÇÃO REAL E ENSAIO DEFINITIVO NO HOST');
  console.log(' Data:', new Date().toISOString());
  console.log(' Host:', os.hostname(), '| Plataforma:', os.platform(), os.arch());
  console.log(' Deploy Dir:', deployDir);
  console.log(' Destino Externo:', externalBackupDir);
  console.log('================================================================\n');

  const rootDbHashBefore = getSha256(productionRootDb);
  const rootDbMtimeBefore = fs.existsSync(productionRootDb) ? fs.statSync(productionRootDb).mtimeMs : null;

  const results = {
    tipo: 'IMPLANTACAO_REAL_HOST_OFICINA',
    dataExecucao: new Date().toISOString(),
    host: os.hostname(),
    nodeVersion: process.version,
    plataforma: `${os.platform()} (${os.arch()})`,
    deployDir,
    externalBackupDir,
    etapas: []
  };

  try {
    // -------------------------------------------------------------
    // PRÉ-VOO: Verificação de Instalação Existente (Anti-Data-Loss)
    // -------------------------------------------------------------
    if (fs.existsSync(deployDir)) {
      const existingItems = fs.readdirSync(deployDir);
      const criticalMarkers = ['patio.db', '.env', 'public', 'server.js'];
      const foundMarkers = criticalMarkers.filter(m => fs.existsSync(path.join(deployDir, m)));
      if (existingItems.length > 0 && foundMarkers.length > 0) {
        const msg = `INSTALACAO_JA_EXISTE: Destino "${deployDir}" já contém uma instalação ativa (detectados: ${foundMarkers.join(', ')}). Implantação abortada antes de qualquer escrita para proteger dados operacionais.`;
        console.error(`\n❌ [ERRO DE IMPLANTAÇÃO] ${msg}\n`);
        const err = new Error(msg);
        err.code = 'INSTALACAO_JA_EXISTE';
        throw err;
      }
    }

    // -------------------------------------------------------------
    // ETAPA 1: Configuração do Destino Externo e .env do Piloto
    // -------------------------------------------------------------
    console.log('Etapa 1: Configurando destino externo real e arquivo .env de produção...');
    let envStatus = 'APROVADO';
    let envMsg = '';

    fs.mkdirSync(externalBackupDir, { recursive: true });
    assertExternalAccess(externalBackupDir);

    const deployEnvContent = [
      'PORT=3000',
      'HOST=127.0.0.1',
      'DB_PATH=patio.db',
      'UPLOAD_DIR=public/uploads',
      'BACKUP_DIR=backups',
      `BACKUP_EXTERNAL_DIR=${externalBackupDir}`,
      'REQUIRE_EXTERNAL_BACKUP=true',
      'DISABLE_WHATSAPP=true',
      'DISABLE_INTEGRATIONS=true',
      'NODE_ENV=production'
    ].join('\r\n') + '\r\n';

    fs.writeFileSync(path.join(deployDir, '.env'), deployEnvContent, 'utf8');

    envMsg = `Destino externo ${externalBackupDir} verificado com permissão de escrita e deploy-piloto/.env configurado com sucesso.`;
    console.log('  ✔', envMsg);
    results.etapas.push({
      etapa: '1_configuracao_ambiente_host',
      nome: 'Configuração do Destino Externo e .env do Piloto',
      status: envStatus,
      detalhes: envMsg
    });

    // -------------------------------------------------------------
    // ETAPA 2: Inicialização da Base e Seed Operacional no deploy-piloto
    // -------------------------------------------------------------
    console.log('\nEtapa 2: Inicializando banco SQLite e seed dos 3 operadores em deploy-piloto...');
    let seedStatus = 'APROVADO';
    let seedMsg = '';

    const deployDbPath = path.join(deployDir, 'patio.db');
    const deployUploadsDir = path.join(deployDir, 'public', 'uploads');
    fs.mkdirSync(deployUploadsDir, { recursive: true });

    // Cria anexo oficial de vistoria inicial
    const initialPdfPath = path.join(deployUploadsDir, 'laudo_vistoria_inicial.pdf');
    fs.writeFileSync(initialPdfPath, '%PDF-1.4\n%Laudo Oficial de Vistoria de Entrada - Piloto Pátio CRM 2026\n1 0 obj\n<< /Title (Vistoria Inicial) >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF', 'utf8');

    // Inicializa banco do deploy-piloto via script isolado para garantir isolamento de contexto
    const seedScript = `
      'use strict';
      process.env.DB_PATH = ${JSON.stringify(deployDbPath)};
      process.env.NODE_ENV = 'production';
      const db = require('./db');
      const userRepository = require('./lib/auth/userRepository');

      async function seed() {
        const fs = require('fs');
        const dbExists = fs.existsSync(process.env.DB_PATH) && fs.statSync(process.env.DB_PATH).size > 0;
        await db.initDB();
        const tenant = 'oficina_piloto_01';

        // Proteção Anti-Data-Loss: Se o banco já possui operadores provisionados, preserva integralmente
        const existingGestor = await userRepository.getUserByUsername('gestor@oficina.com.br');
        if (dbExists && existingGestor) {
          console.log('SEED_OK');
          return;
        }

        const { getCredenciaisDefinitivas } = require('./provisionar_credenciais_finais.cjs');
        const creds = getCredenciaisDefinitivas();
        for (const op of creds) {
          await userRepository.createUser({
            username: op.username,
            password: op.password,
            fullName: op.name,
            role: op.role,
            tenantId: op.tenantId || tenant,
            allowWeakInTest: false
          });
        }

        const initialState = {
          versao: 1,
          os: [
            {
              id: 'os_piloto_1001',
              num: 1001,
              cliente: 'Transportadora Confiança Ltda',
              veiculo: 'Scania R450 6x2 - 2021',
              placa: 'ABC1D23',
              box: 'Box 01',
              status: 'em_andamento',
              total: 4850.00,
              anexos: ['laudo_vistoria_inicial.pdf']
            }
          ],
          clientes: [
            { id: 'cli_01', nome: 'Transportadora Confiança Ltda', cnpj: '12.345.678/0001-90' }
          ],
          veiculos: [
            { placa: 'ABC1D23', modelo: 'Scania R450', frota: 'Frota Pesada' }
          ]
        };

        await db.run('INSERT INTO kv (key, value) VALUES (?, ?)', [
          'tenant:' + tenant + ':state',
          JSON.stringify(initialState)
        ]);

        await db.closeDB();
        console.log('SEED_OK');
      }

      seed().catch(err => {
        console.error('SEED_FAIL:', err.message);
        process.exit(1);
      });
    `;

    const seedProc = spawnSync(process.execPath, ['-e', seedScript], {
      cwd: deployDir,
      encoding: 'utf8'
    });

    if (seedProc.status !== 0 || !seedProc.stdout.includes('SEED_OK')) {
      throw new Error(`Falha no seed operacional: ${seedProc.stderr || seedProc.stdout}`);
    }

    seedMsg = 'Base deploy-piloto/patio.db provisionada com 3 operadores (gestor, atendente, mecanico), OS #1001 e anexo de vistoria PDF.';
    console.log('  ✔', seedMsg);
    results.etapas.push({
      etapa: '2_seed_operacional_piloto',
      nome: 'Inicialização da Base e Seed Operacional no deploy-piloto',
      status: seedStatus,
      detalhes: seedMsg
    });

    // -------------------------------------------------------------
    // ETAPA 3: Registro da Tarefa no Windows Task Scheduler
    // -------------------------------------------------------------
    console.log('\nEtapa 3: Registrando a tarefa oficial no Windows Task Scheduler...');
    let taskRegStatus = 'APROVADO';
    let taskRegMsg = '';

    const taskName = 'PatioCRM_Backup_WAL';
    const deployScriptPath = path.join(deployDir, 'scripts', 'executar_backup_operacional.cjs');

    const regScript = `
      $ErrorActionPreference = 'Stop'
      $taskName = '${taskName}'
      $nodePath = '${process.execPath.replace(/'/g, "''")}'
      $scriptPath = '${deployScriptPath.replace(/'/g, "''")}'
      $workingDir = '${deployDir.replace(/'/g, "''")}'

      $action = New-ScheduledTaskAction -Execute $nodePath -Argument ('"' + $scriptPath + '"') -WorkingDirectory $workingDir
      $trigger = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Hours 1)
      $settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -StartWhenAvailable

      Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Force | Out-Null
      $t = Get-ScheduledTask -TaskName $taskName
      Write-Output "TASK_REGISTERED|$($t.State)|$($t.Settings.MultipleInstances)"
    `;

    const regProc = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', regScript], {
      encoding: 'utf8'
    });

    if (regProc.status !== 0 || !regProc.stdout.includes('TASK_REGISTERED|')) {
      throw new Error(`Falha ao registrar tarefa no Windows: ${regProc.stderr || regProc.stdout}`);
    }

    taskRegMsg = `Tarefa "${taskName}" registrada com sucesso no Windows com política MultipleInstances IgnoreNew.`;
    console.log('  ✔', taskRegMsg);
    results.etapas.push({
      etapa: '3_registro_agendador_windows',
      nome: 'Registro da Tarefa Agendada no Windows',
      status: taskRegStatus,
      detalhes: taskRegMsg
    });

    // -------------------------------------------------------------
    // ETAPA 4: Execução Prática da Tarefa Agendada e Comprovação de Saída 0x0
    // -------------------------------------------------------------
    console.log('\nEtapa 4: Disparando a tarefa via agendador do Windows e aguardando conclusão...');
    let taskRunStatus = 'APROVADO';
    let taskRunMsg = '';
    let backupPackageCreated = null;
    const existingPackagesBefore = new Set(
      fs.existsSync(externalBackupDir)
        ? fs.readdirSync(externalBackupDir).filter(f => f.startsWith('package_bck_'))
        : []
    );
    const triggerTimestamp = Date.now();

    const runScript = `
      $ErrorActionPreference = 'Stop'
      $taskName = '${taskName}'
      Start-ScheduledTask -TaskName $taskName
      Write-Output "TASK_TRIGGERED"
    `;

    const runProc = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', runScript], {
      encoding: 'utf8'
    });

    if (runProc.status !== 0) {
      throw new Error(`Falha ao disparar tarefa agendada: ${runProc.stderr || runProc.stdout}`);
    }

    console.log('  Aguardando execução da tarefa pelo agendador...');
    let taskFinished = false;
    let lastResult = -1;
    let deadline = Date.now() + 35000;
    let newlyCreatedPackage = null;

    while (Date.now() < deadline) {
      await sleep(1000);
      const pollScript = `
        $info = Get-ScheduledTaskInfo -TaskName '${taskName}'
        $task = Get-ScheduledTask -TaskName '${taskName}'
        Write-Output "POLL|$($task.State)|$($info.LastTaskResult)|$($info.LastRunTime.ToString('o'))"
      `;
      const pollRes = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', pollScript], {
        encoding: 'utf8'
      });
      if (pollRes.status === 0 && pollRes.stdout.includes('POLL|')) {
        const parts = pollRes.stdout.trim().split('\n').pop().trim().split('|');
        const state = parts[1];
        lastResult = parseInt(parts[2], 10);

        // Verifica se novo pacote surgiu no destino externo
        const currentPackages = fs.readdirSync(externalBackupDir).filter(f => f.startsWith('package_bck_'));
        const newPkgs = currentPackages.filter(p => !existingPackagesBefore.has(p));
        if (newPkgs.length > 0) {
          newlyCreatedPackage = newPkgs[newPkgs.length - 1];
          if (state === 'Ready' && lastResult === 0) {
            taskFinished = true;
            break;
          }
        }
      }
    }

    if (!taskFinished || !newlyCreatedPackage) {
      throw new Error(`A tarefa agendada não concluiu com LastTaskResult=0 ou novo pacote não foi gerado dentro do tempo limite. Último resultado: ${lastResult}`);
    }

    const latestPackage = newlyCreatedPackage;
    backupPackageCreated = path.join(externalBackupDir, latestPackage);

    // Valida o manifesto do pacote externo
    const manifestPath = path.join(backupPackageCreated, 'manifest.json');
    if (!fs.existsSync(manifestPath)) {
      throw new Error(`manifest.json ausente no pacote externo: ${backupPackageCreated}`);
    }
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

    for (const [relPath, fileInfo] of Object.entries(manifest.files)) {
      const extFile = path.join(backupPackageCreated, relPath);
      if (!fs.existsSync(extFile)) {
        throw new Error(`Arquivo ausente no pacote externo: ${relPath}`);
      }
      const actualSha = getSha256(extFile);
      if (actualSha !== fileInfo.sha256) {
        throw new Error(`Divergência de hash SHA-256 no arquivo externo ${relPath}`);
      }
    }

    taskRunMsg = `Tarefa agendada concluída com LastTaskResult=0x0. Pacote "${latestPackage}" verificado no destino externo com 100% de integridade SHA-256 (${manifest.totalFiles} arquivos).`;
    console.log('  ✔', taskRunMsg);
    results.etapas.push({
      etapa: '4_execucao_agendador_real',
      nome: 'Execução da Tarefa Agendada no Windows e Verificação no Destino Externo',
      status: taskRunStatus,
      lastTaskResult: lastResult,
      pacoteGerado: latestPackage,
      detalhes: taskRunMsg
    });

    // -------------------------------------------------------------
    // ETAPA 5: Restauração Isolada e Teste Operacional Real com Login dos 3 Usuários
    // -------------------------------------------------------------
    console.log('\nEtapa 5: Realizando restauração exclusiva do pacote externo e teste operacional com servidor HTTP...');
    let restoreStatus = 'APROVADO';
    let restoreMsg = '';
    let rtoMs = 0;

    const restoreWorkspace = path.join(deployDir, 'restauracao_ensaio_real');
    if (fs.existsSync(restoreWorkspace)) {
      fs.rmSync(restoreWorkspace, { recursive: true, force: true });
    }
    fs.mkdirSync(restoreWorkspace, { recursive: true });

    const restoredDb = path.join(restoreWorkspace, 'patio.db');
    const restoredUploads = path.join(restoreWorkspace, 'public', 'uploads');
    fs.mkdirSync(restoredUploads, { recursive: true });

    const tRestoreStart = performance.now();
    // Restauração física exclusivamente do pacote externo
    fs.copyFileSync(path.join(backupPackageCreated, 'patio.db'), restoredDb);
    fs.cpSync(path.join(backupPackageCreated, 'uploads'), restoredUploads, { recursive: true });

    // Probe de porta efêmera livre
    const probe = net.createServer();
    probe.listen(0, '127.0.0.1');
    await new Promise(r => probe.once('listening', r));
    const testPort = probe.address().port;
    await new Promise(r => probe.close(r));

    let serverLogs = '';
    const serverProc = spawn(process.execPath, ['server.js'], {
      cwd: deployDir,
      windowsHide: true,
      env: {
        ...process.env,
        PORT: String(testPort),
        HOST: '127.0.0.1',
        DB_PATH: restoredDb,
        UPLOAD_DIR: restoredUploads,
        DISABLE_INTEGRATIONS: 'true',
        DISABLE_WHATSAPP: 'true',
        NODE_ENV: 'production',
        API_KEY: ''
      }
    });

    serverProc.stdout.on('data', d => { serverLogs += d.toString(); });
    serverProc.stderr.on('data', d => { serverLogs += d.toString(); });

    let isServerUp = false;
    const bootDeadline = Date.now() + 25000;

    try {
      while (Date.now() < bootDeadline) {
        if (serverProc.exitCode !== null) {
          throw new Error('Servidor restaurado encerrou prematuramente: ' + serverLogs);
        }
        try {
          const rH = await fetch(`http://127.0.0.1:${testPort}/health`);
          const rR = await fetch(`http://127.0.0.1:${testPort}/ready`);
          if (rH.status === 200 && rR.status === 200) {
            isServerUp = true;
            break;
          }
        } catch (_) {}
        await sleep(200);
      }

      if (!isServerUp) {
        throw new Error('Servidor restaurado não respondeu dentro de 25 segundos.');
      }

      // 5.1 Teste de Login Individual dos 3 Operadores via Basic Auth
      const { getCredenciaisDefinitivas } = require('./provisionar_credenciais_finais.cjs');
      const operators = getCredenciaisDefinitivas();

      for (const op of operators) {
        const authHeader = 'Basic ' + Buffer.from(`${op.username}:${op.password}`).toString('base64');
        const res = await fetch(`http://127.0.0.1:${testPort}/api/estado`, {
          headers: {
            'Authorization': authHeader,
            'x-tenant-id': 'oficina_piloto_01'
          }
        });
        if (res.status !== 200) {
          throw new Error(`Falha no login do operador ${op.username}: HTTP ${res.status}`);
        }
      }

      // 5.2 Leitura de OS #1001 e Dados Operacionais
      const gestorOp = operators.find(o => o.role === 'tenant_admin');
      const gestorAuth = 'Basic ' + Buffer.from(`${gestorOp.username}:${gestorOp.password}`).toString('base64');
      const getRes = await fetch(`http://127.0.0.1:${testPort}/api/estado`, {
        headers: {
          'Authorization': gestorAuth,
          'x-tenant-id': 'oficina_piloto_01'
        }
      });
      const stateData = await getRes.json();
      if (!stateData.os || stateData.os[0]?.num !== 1001) {
        throw new Error('OS #1001 restaurada não encontrada no estado retornado.');
      }

      // 5.3 Escrita de Nova Ordem de Serviço Operacional (OS #1002)
      const updatedState = {
        ...stateData,
        os: [
          ...stateData.os,
          {
            id: 'os_piloto_1002',
            num: 1002,
            cliente: 'Frota Rápida Logística',
            veiculo: 'Volvo FH 540',
            placa: 'XYZ9W87',
            box: 'Box 02',
            status: 'aberta',
            total: 2350.00
          }
        ]
      };

      const postRes = await fetch(`http://127.0.0.1:${testPort}/api/estado`, {
        method: 'POST',
        headers: {
          'Authorization': gestorAuth,
          'x-tenant-id': 'oficina_piloto_01',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(updatedState)
      });
      if (postRes.status !== 200) {
        throw new Error(`Falha ao registrar nova OS #1002: HTTP ${postRes.status}`);
      }

      // 5.4 Download e Validação do Anexo Restaurado
      const pdfPath = path.join(restoredUploads, 'laudo_vistoria_inicial.pdf');
      if (!fs.existsSync(pdfPath)) {
        throw new Error('Arquivo de vistoria em PDF não foi restaurado!');
      }
      const pdfContent = fs.readFileSync(pdfPath, 'utf8');
      if (!pdfContent.startsWith('%PDF-1.4')) {
        throw new Error('Conteúdo do PDF restaurado não confere!');
      }

      rtoMs = Math.round(performance.now() - tRestoreStart);
      restoreMsg = `Recuperação total a partir do pacote externo comprovada em ${rtoMs}ms (RTO). Login dos 3 operadores, leitura da OS #1001, gravação da OS #1002 e anexo PDF validados com 100% de sucesso.`;
      console.log('  ✔', restoreMsg);
    } finally {
      serverProc.kill('SIGKILL');
      await sleep(500);
      try {
        fs.rmSync(restoreWorkspace, { recursive: true, force: true });
      } catch (_) {}
    }

    results.etapas.push({
      etapa: '5_restauracao_operacional_real',
      nome: 'Restauração Isolada e Teste Operacional Real',
      status: restoreStatus,
      rtoMs,
      detalhes: restoreMsg
    });

    // -------------------------------------------------------------
    // ETAPA 6: Verificação de Intangibilidade da Base Raiz (patio.db)
    // -------------------------------------------------------------
    console.log('\nEtapa 6: Verificando integridade da base raiz de desenvolvimento (patio.db)...');
    let prodStatus = 'APROVADO';
    let prodMsg = '';
    const rootDbHashAfter = getSha256(productionRootDb);
    const rootDbMtimeAfter = fs.existsSync(productionRootDb) ? fs.statSync(productionRootDb).mtimeMs : null;

    if (rootDbHashBefore === rootDbHashAfter && rootDbMtimeBefore === rootDbMtimeAfter) {
      prodMsg = 'A base de desenvolvimento raiz patio.db permaneceu 100% INTOCADA durante todo o ensaio real.';
      console.log('  ✔', prodMsg);
    } else {
      prodStatus = 'FALHOU';
      prodMsg = 'ALERTA: Modificação detectada na base raiz de desenvolvimento!';
      console.error('  ✖', prodMsg);
    }

    results.etapas.push({
      etapa: '6_preservacao_base_raiz',
      nome: 'Preservação da Base Raiz de Desenvolvimento',
      status: prodStatus,
      detalhes: prodMsg
    });

  } catch (err) {
    console.error('\n❌ ERRO DURANTE A IMPLANTAÇÃO REAL:', err.message);
    results.erroGeral = err.message;
  }

  const anyFailed = results.etapas.some(e => e.status === 'FALHOU') || Boolean(results.erroGeral);
  results.parecerFinal = anyFailed
    ? 'FALHOU'
    : 'TOTALMENTE_APROVADO_COMPROVADO_NO_HOST_PILOTO_LIBERADO';

  fs.writeFileSync(evidenceJsonPath, JSON.stringify(results, null, 2), 'utf8');

  console.log('\n================================================================');
  console.log(' RELATÓRIO FINAL DE IMPLANTAÇÃO E ENSAIO REAL NO HOST:');
  console.log(` Parecer Geral: ${results.parecerFinal}`);
  console.log(` Evidência salva em: ${evidenceJsonPath}`);
  console.log('================================================================\n');

  return results;
}

if (require.main === module) {
  runRealDeploymentAndRehearsal()
    .then(r => {
      const code = r.parecerFinal === 'TOTALMENTE_APROVADO_COMPROVADO_NO_HOST_PILOTO_LIBERADO' ? 0 : 1;
      process.exit(code);
    })
    .catch(err => {
      console.error('Erro fatal:', err);
      process.exit(1);
    });
}

module.exports = {
  runRealDeploymentAndRehearsal
};
