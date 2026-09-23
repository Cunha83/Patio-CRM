'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const net = require('net');
const { spawn, spawnSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const supervisorScript = path.join(rootDir, 'scripts', 'supervise_patio.cjs');

test('P1: Supervisor Unificado com Trava Atômica, Recuperação e Port Check', async (t) => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'patio-superv-test-'));
  const testLock = path.join(tempRoot, 'test-supervisor.lock');
  const testLogs = path.join(tempRoot, 'logs');
  fs.mkdirSync(testLogs, { recursive: true });

  const DUMMY_PORT = 3995;
  const DUMMY_HOST = '127.0.0.1';

  // Cria script filho simulado rápido para testar supervisor
  const mockChildScript = path.join(tempRoot, 'mock_server.cjs');
  fs.writeFileSync(mockChildScript, `
    const http = require('http');
    const port = parseInt(process.env.PORT, 10) || 3995;
    const host = process.env.HOST || '127.0.0.1';
    const server = http.createServer((req, res) => {
      res.writeHead(200);
      res.end('OK');
    });
    server.listen(port, host, () => {
      console.log('MOCK_SERVER_READY');
    });
  `);

  await t.test('1. Trava atômica impede duas instâncias simultâneas do supervisor', async () => {
    // Inicia primeira instância com mockChildScript
    const sub1 = spawn(process.execPath, [supervisorScript], {
      env: {
        ...process.env,
        PORT: String(DUMMY_PORT),
        HOST: DUMMY_HOST,
        SUPERVISOR_LOCK_FILE: testLock,
        SUPERVISOR_LOGS_DIR: testLogs,
        SERVER_SCRIPT: mockChildScript
      },
      stdio: ['ignore', 'pipe', 'pipe']
    });

    // Aguarda lock ser criado
    let waitLock = 0;
    while (!fs.existsSync(testLock) && waitLock < 50) {
      await new Promise(r => setTimeout(r, 100));
      waitLock++;
    }
    assert.ok(fs.existsSync(testLock), 'O arquivo de trava deve existir após o início da instância 1');

    // Tenta iniciar a segunda instância simultaneamente
    const sub2 = spawnSync(process.execPath, [supervisorScript], {
      env: {
        ...process.env,
        PORT: String(DUMMY_PORT),
        HOST: DUMMY_HOST,
        SUPERVISOR_LOCK_FILE: testLock,
        SUPERVISOR_LOGS_DIR: testLogs,
        SERVER_SCRIPT: mockChildScript
      },
      encoding: 'utf8'
    });

    assert.notEqual(sub2.status, 0, 'Segunda instância do supervisor deve ser rejeitada com código != 0');
    assert.match(sub2.stderr, /Instância duplicada detectada|em execução/i);

    // Encerra primeira instância
    sub1.kill('SIGTERM');
    await new Promise(r => setTimeout(r, 1000));
  });

  await t.test('2. Detecção de porta ocupada impede nova inicialização', async () => {
    // Ocupa a porta DUMMY_PORT diretamente via net.Server
    const dummyServer = net.createServer();
    await new Promise((resolve) => dummyServer.listen(DUMMY_PORT, DUMMY_HOST, resolve));

    // Remove qualquer trava residual do teste anterior para testar isoladamente a porta
    try { fs.unlinkSync(testLock); } catch (_) {}

    const proc = spawnSync(process.execPath, [supervisorScript], {
      env: {
        ...process.env,
        PORT: String(DUMMY_PORT),
        HOST: DUMMY_HOST,
        SUPERVISOR_LOCK_FILE: testLock,
        SUPERVISOR_LOGS_DIR: testLogs,
        SERVER_SCRIPT: mockChildScript
      },
      encoding: 'utf8'
    });

    dummyServer.close();

    assert.notEqual(proc.status, 0, 'Supervisor deve falhar quando a porta estiver ocupada');
    assert.match(proc.stderr, /já está em uso/i);
  });

  await t.test('3. Recuperação de trava abandonada (PID inativo)', async () => {
    // Escreve um arquivo de trava com PID que comprovadamente não existe (ex: 999999)
    const deadPid = 999999;
    fs.writeFileSync(testLock, JSON.stringify({
      pid: deadPid,
      host: DUMMY_HOST,
      port: DUMMY_PORT,
      startedAt: new Date().toISOString()
    }), 'utf8');

    // Executa o supervisor: deve detectar que 999999 está inativo, remover a trava e iniciar
    const sub = spawn(process.execPath, [supervisorScript], {
      env: {
        ...process.env,
        PORT: String(DUMMY_PORT),
        HOST: DUMMY_HOST,
        SUPERVISOR_LOCK_FILE: testLock,
        SUPERVISOR_LOGS_DIR: testLogs,
        SERVER_SCRIPT: mockChildScript
      },
      stdio: ['ignore', 'pipe', 'pipe']
    });

    await new Promise(r => setTimeout(r, 1500));
    assert.ok(fs.existsSync(testLock), 'Trava deve ter sido reassumida com o novo PID');

    const lockData = JSON.parse(fs.readFileSync(testLock, 'utf8'));
    assert.notEqual(lockData.pid, deadPid, 'O PID na trava deve ser o novo processo');
    assert.equal(lockData.pid, sub.pid, 'O PID deve corresponder ao supervisor ativo');

    sub.kill('SIGTERM');
    await new Promise(r => setTimeout(r, 1000));
  });

  await t.test('4. Recuperação do processo filho com retenção contínua da trava do supervisor e bloqueio de concorrência', async () => {
    const runCountFile = path.join(tempRoot, 'child_run_count.txt');
    try { fs.unlinkSync(runCountFile); } catch (_) {}
    try { fs.unlinkSync(testLock); } catch (_) {}

    // Mock script que falha com código 7 na 1ª execução e responde saudável na 2ª
    const failThenRecoverScript = path.join(tempRoot, 'fail_then_recover.cjs');
    fs.writeFileSync(failThenRecoverScript, `
      const fs = require('fs');
      const http = require('http');
      const countFile = ${JSON.stringify(runCountFile)};
      let runs = 0;
      if (fs.existsSync(countFile)) {
        runs = parseInt(fs.readFileSync(countFile, 'utf8'), 10) || 0;
      }
      runs++;
      fs.writeFileSync(countFile, String(runs), 'utf8');

      if (runs === 1) {
        console.log('MOCK_CHILD: Primeira execucao falhando com codigo 7');
        process.exit(7);
      }

      const port = parseInt(process.env.PORT, 10) || 3995;
      const host = process.env.HOST || '127.0.0.1';
      const server = http.createServer((req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', runs }));
      });
      server.listen(port, host, () => {
        console.log('MOCK_CHILD_HEALTHY_RUN_2');
      });
    `);

    // Inicia supervisor
    const supervisor = spawn(process.execPath, [supervisorScript], {
      env: {
        ...process.env,
        PORT: String(DUMMY_PORT),
        HOST: DUMMY_HOST,
        SUPERVISOR_LOCK_FILE: testLock,
        SUPERVISOR_LOGS_DIR: testLogs,
        SERVER_SCRIPT: failThenRecoverScript
      },
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let supervisorOutput = '';
    supervisor.stdout.on('data', (d) => { supervisorOutput += d.toString(); });
    supervisor.stderr.on('data', (d) => { supervisorOutput += d.toString(); });

    // Aguarda o reinício e o filho ficar saudável na run 2 (espera ~3 a 6 segundos devido ao delay de 2s)
    let isHealthy = false;
    const http = require('http');
    for (let i = 0; i < 60; i++) {
      await new Promise(r => setTimeout(r, 100));
      if (fs.existsSync(runCountFile)) {
        const count = parseInt(fs.readFileSync(runCountFile, 'utf8'), 10);
        if (count >= 2) {
          try {
            const res = await new Promise((resolve, reject) => {
              const req = http.get(`http://${DUMMY_HOST}:${DUMMY_PORT}`, (r) => {
                let data = '';
                r.on('data', chunk => data += chunk);
                r.on('end', () => resolve({ statusCode: r.statusCode, data }));
              });
              req.on('error', reject);
              req.setTimeout(500, () => req.destroy());
            });
            if (res.statusCode === 200) {
              isHealthy = true;
              break;
            }
          } catch (_) {}
        }
      }
    }

    assert.ok(isHealthy, `O processo filho deve reiniciar e responder na porta após falha inicial. Output supervisor:\n${supervisorOutput}`);
    assert.equal(supervisor.exitCode, null, 'O supervisor deve continuar vivo durante todo o ciclo de queda e reinício do filho');

    // Verifica que outro supervisor tentando iniciar continua BLOQUEADO durante a execução saudável do filho
    const competitor = spawnSync(process.execPath, [supervisorScript], {
      env: {
        ...process.env,
        PORT: String(DUMMY_PORT),
        HOST: DUMMY_HOST,
        SUPERVISOR_LOCK_FILE: testLock,
        SUPERVISOR_LOGS_DIR: testLogs,
        SERVER_SCRIPT: mockChildScript
      },
      encoding: 'utf8'
    });

    assert.notEqual(competitor.status, 0, 'Outro supervisor concorrente deve ser rejeitado mesmo após reinício do filho');
    assert.match(competitor.stderr, /Instância duplicada detectada|já em execução/i);

    // Finaliza supervisor limpo
    supervisor.kill('SIGTERM');
    await new Promise(r => setTimeout(r, 1000));
  });

  // Limpeza
  try {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  } catch (_) {}
});
