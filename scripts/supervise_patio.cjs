'use strict';

/**
 * PÁTIO CRM — SUPERVISOR DE PROCESSO NODE NO WINDOWS
 * Garante processo único (trava atômica de arquivo + detecção de porta TCP),
 * repassa variáveis de ambiente explicitamente (HOST, PORT, DB_PATH, UPLOAD_DIR),
 * grava logs contínuos e reinicia automaticamente em caso de crash (com proteção contra loop).
 */

const { spawn } = require('child_process');
const net = require('net');
const path = require('path');
const fs = require('fs');

const rootDir = path.resolve(__dirname, '..');

// Carrega variáveis se disponível
if (fs.existsSync(path.join(rootDir, '.env'))) {
  try { require('dotenv').config({ path: path.join(rootDir, '.env') }); } catch (_) {}
}

const logsDir = path.resolve(process.env.SUPERVISOR_LOGS_DIR || process.env.LOGS_DIR || path.join(rootDir, 'logs'));
if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });

const outLog = path.join(logsDir, 'patio-supervisor.log');
const errLog = path.join(logsDir, 'patio-supervisor-err.log');

const PORT = parseInt(process.env.PORT, 10) || 3000;
const HOST = process.env.HOST || '127.0.0.1';
const DB_PATH = path.resolve(process.env.DB_PATH || path.join(rootDir, 'patio.db'));
const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || path.join(rootDir, 'public', 'uploads'));

const lockFile = process.env.SUPERVISOR_LOCK_FILE
  ? path.resolve(process.env.SUPERVISOR_LOCK_FILE)
  : path.join(rootDir, 'locks', 'patio-supervisor.lock');

const serverScript = process.env.SERVER_SCRIPT
  ? path.resolve(process.env.SERVER_SCRIPT)
  : path.join(rootDir, 'server.js');

function log(msg) {
  const line = `[${new Date().toISOString()}] [Supervisor] ${msg}\n`;
  process.stdout.write(line);
  try { fs.appendFileSync(outLog, line); } catch (_) {}
}

function logErr(msg) {
  const line = `[${new Date().toISOString()}] [Supervisor:ERROR] ${msg}\n`;
  process.stderr.write(line);
  try { fs.appendFileSync(errLog, line); } catch (_) {}
}

// Trava atômica exclusiva de instância com recuperação de trava abandonada
function tryAcquireExclusive(lockPath) {
  fs.mkdirSync(path.dirname(lockPath), { recursive: true });
  const fd = fs.openSync(lockPath, 'wx');
  const info = JSON.stringify({
    pid: process.pid,
    host: HOST,
    port: PORT,
    startedAt: new Date().toISOString()
  }, null, 2);
  fs.writeFileSync(fd, info, 'utf8');
  fs.closeSync(fd);
}

function acquireInstanceLock(lockPath) {
  try {
    tryAcquireExclusive(lockPath);
    return true;
  } catch (err) {
    if (err.code === 'EEXIST') {
      let isAlive = false;
      let existingPid = null;
      try {
        const content = fs.readFileSync(lockPath, 'utf8');
        const data = JSON.parse(content);
        existingPid = data.pid;
        if (typeof existingPid === 'number') {
          try {
            process.kill(existingPid, 0);
            isAlive = true;
          } catch (probeErr) {
            isAlive = (probeErr.code === 'EPERM');
          }
        }
      } catch (_) {
        isAlive = false;
      }

      if (!isAlive) {
        log(`Trava abandonada detectada (PID ${existingPid || 'desconhecido'} inativo). Removendo trava antiga e reassumindo...`);
        try { fs.unlinkSync(lockPath); } catch (_) {}
        try {
          tryAcquireExclusive(lockPath);
          return true;
        } catch (retryErr) {
          logErr(`Falha ao reassumir trava após limpeza: ${retryErr.message}`);
          return false;
        }
      } else {
        logErr(`Instância duplicada detectada! Supervisor já em execução com PID: ${existingPid}. Abortando.`);
        return false;
      }
    }
    logErr(`Falha ao criar arquivo de trava (${lockPath}): ${err.message}`);
    return false;
  }
}

function releaseInstanceLock(lockPath) {
  try {
    if (fs.existsSync(lockPath)) {
      const content = fs.readFileSync(lockPath, 'utf8');
      const data = JSON.parse(content);
      if (data.pid === process.pid) {
        fs.unlinkSync(lockPath);
      }
    }
  } catch (_) {}
}

// Verifica se a porta já está ocupada antes de iniciar
function checkPortInUse(port, host) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(1000);
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.once('error', () => {
      resolve(false);
    });
    socket.connect(port, host);
  });
}

let child = null;
let restartsInLastMinute = [];
let shuttingDown = false;

async function spawnChild() {
  if (shuttingDown) return;

  // 1. Pré-voo na porta TCP
  const isBusy = await checkPortInUse(PORT, HOST);
  if (isBusy) {
    logErr(`A porta ${PORT} (${HOST}) JÁ está em uso por outro processo.`);
    logErr('Para evitar instâncias concorrentes duplicadas, o supervisor não iniciará um novo processo.');
    releaseInstanceLock(lockFile);
    process.exit(1);
  }

  log(`Iniciando servidor Pátio CRM em ${HOST}:${PORT}...`);
  log(`  Banco SQLite: ${DB_PATH}`);
  log(`  Anexos:       ${UPLOAD_DIR}`);

  const outStream = fs.createWriteStream(outLog, { flags: 'a' });
  const errStream = fs.createWriteStream(errLog, { flags: 'a' });

  // 2. Inicialização do processo filho com ambiente unificado
  child = spawn(process.execPath, [serverScript], {
    cwd: rootDir,
    env: {
      ...process.env,
      HOST: HOST,
      PORT: String(PORT),
      DB_PATH: DB_PATH,
      UPLOAD_DIR: UPLOAD_DIR
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  log(`Processo Node iniciado com PID: ${child.pid}`);

  child.stdout.pipe(outStream);
  child.stdout.pipe(process.stdout);

  child.stderr.pipe(errStream);
  child.stderr.pipe(process.stderr);

  child.on('exit', async (code, signal) => {
    if (shuttingDown) {
      log(`Processo encerrou normalmente durante finalização do supervisor (código: ${code}, sinal: ${signal}).`);
      releaseInstanceLock(lockFile);
      return;
    }

    logErr(`Processo filho PID ${child.pid} encerrou inesperadamente com código ${code} / sinal ${signal}.`);

    const now = Date.now();
    restartsInLastMinute = restartsInLastMinute.filter(t => now - t < 60000);
    restartsInLastMinute.push(now);

    if (restartsInLastMinute.length > 5) {
      logErr('FATAL: Mais de 5 falhas consecutivas em 60 segundos (Crash Loop Detectado). Suspendo reinício.');
      releaseInstanceLock(lockFile);
      process.exit(1);
    }

    log('Aguardando 2 segundos antes de reiniciar o processo...');
    await new Promise(r => setTimeout(r, 2000));
    spawnChild();
  });
}

async function startProcess() {
  // 1. Aquisição da trava de instância exclusiva UMA ÚNICA VEZ pelo supervisor na inicialização
  const lockAcquired = acquireInstanceLock(lockFile);
  if (!lockAcquired) {
    process.exit(1);
  }

  await spawnChild();
}

function handleSignal(sig) {
  log(`Recebido sinal ${sig}. Encerrando supervisor e processo filho com segurança...`);
  shuttingDown = true;
  releaseInstanceLock(lockFile);
  if (child && child.exitCode === null) {
    child.kill('SIGTERM');
    setTimeout(() => {
      if (child.exitCode === null) child.kill('SIGKILL');
      process.exit(0);
    }, 5000).unref();
  } else {
    process.exit(0);
  }
}

process.on('SIGINT', () => handleSignal('SIGINT'));
process.on('SIGTERM', () => handleSignal('SIGTERM'));
process.on('exit', () => releaseInstanceLock(lockFile));

if (require.main === module) {
  startProcess();
}

module.exports = {
  startProcess,
  startSupervisor: startProcess,
  spawnChild,
  acquireInstanceLock,
  releaseInstanceLock,
  checkPortInUse
};
