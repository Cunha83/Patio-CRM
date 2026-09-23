'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const net = require('node:net');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'patio-backup-sec-'));
const backupDir = path.join(tempDir, 'backups_autorizados');
const outsideDir = path.join(tempDir, 'outside_forbidden');
const similarPrefixDir = path.join(tempDir, 'backups_autorizados_malicioso');

fs.mkdirSync(backupDir, { recursive: true });
fs.mkdirSync(outsideDir, { recursive: true });
fs.mkdirSync(similarPrefixDir, { recursive: true });

process.env.DB_PATH = path.join(tempDir, 'test.db');
process.env.BACKUP_DIR = backupDir;

const { initDB, run, closeDB } = require('../db');
const backupService = require('../services/backupService');
const userRepository = require('../lib/auth/userRepository');

test('Controles de Segurança de Backup: Autorização de Infraestrutura e Contenção Canônica contra Traversal, Symlinks e Prefixos', async (t) => {
  await initDB();

  // 1. Cria usuário de infraestrutura autorizado (platform_admin com backup:global)
  const infraUser = 'admin_infra_seguranca@realsolucoes.com.br';
  const infraPass = 'SenhaSuperSegura#2026';
  await userRepository.createUser({
    username: infraUser,
    password: infraPass,
    role: 'platform_admin',
    memberships: [
      {
        tenantId: '_platform_',
        role: 'platform_admin',
        permissions: ['platform:read', 'platform:manage', 'backup:global', 'backup:manage', '*']
      }
    ],
    allowWeakInTest: false
  });

  // 2. Cria usuário comum da oficina (tenant_admin) SEM privilégios de plataforma
  const tenantUser = 'gestor_oficina@oficina.com.br';
  const tenantPass = 'SenhaOficina#2026';
  await userRepository.createUser({
    username: tenantUser,
    password: tenantPass,
    role: 'tenant_admin',
    tenantId: 'oficina_alfa',
    allowWeakInTest: false
  });

  // 3. Cria um backup legítimo dentro de backupDir
  const backupValido = await backupService.executarBackupWal({
    tenantId: '_all_',
    actorId: 'infra_setup',
    includeUploads: false,
    backupDir
  });
  assert.equal(backupValido.ok, true);

  // 4. Cria arquivos para testes de contenção
  const arquivoFora = path.join(outsideDir, 'evil_backup.db');
  fs.copyFileSync(backupValido.filepath, arquivoFora);

  const arquivoPrefixoSimilar = path.join(similarPrefixDir, 'similar_prefix_backup.db');
  fs.copyFileSync(backupValido.filepath, arquivoPrefixoSimilar);

  // 4b. Criação de Symlink de Arquivo e Junction de Diretório em casos estritamente separados
  let symlinkCriado = false;
  let symlinkMotivo = null;
  const symlinkFora = path.join(backupDir, 'link_para_fora.db');
  try {
    fs.symlinkSync(arquivoFora, symlinkFora, 'file');
    symlinkCriado = true;
  } catch (err) {
    symlinkMotivo = err.code || err.message;
  }

  let junctionCriada = false;
  let junctionMotivo = null;
  const junctionDir = path.join(backupDir, 'junction_fora');
  try {
    fs.symlinkSync(outsideDir, junctionDir, 'junction');
    junctionCriada = true;
  } catch (err) {
    junctionMotivo = err.code || err.message;
  }

  // 5. Sobe servidor para teste real dos endpoints HTTP
  const probe = net.createServer();
  probe.listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const port = probe.address().port;
  await new Promise(r => probe.close(r));

  const root = path.resolve(__dirname, '..');
  let childLogs = '';
  const child = spawn(process.execPath, ['server.js'], {
    cwd: root,
    windowsHide: true,
    env: {
      ...process.env,
      PORT: String(port),
      API_KEY: 'test-api-key',
      AUTH_USER: '',
      AUTH_PASSWORD: '',
      DISABLE_INTEGRATIONS: 'true',
      DB_PATH: path.join(tempDir, 'test.db'),
      BACKUP_DIR: backupDir
    }
  });

  child.stdout.on('data', d => { childLogs += d; });
  child.stderr.on('data', d => { childLogs += d; });

  try {
    for (let i = 0; i < 300; i++) {
      if (child.exitCode !== null) throw new Error('Servidor encerrou: ' + childLogs);
      try {
        const res = await fetch(`http://127.0.0.1:${port}/health`);
        if (res.status === 200) break;
      } catch (_) {}
      await new Promise(r => setTimeout(r, 50));
    }

    const authHeadersTenant = {
      'Authorization': 'Basic ' + Buffer.from(`${tenantUser}:${tenantPass}`).toString('base64'),
      'x-tenant-id': 'oficina_alfa'
    };

    const authHeadersInfra = {
      'Authorization': 'Basic ' + Buffer.from(`${infraUser}:${infraPass}`).toString('base64'),
      'x-tenant-id': '_platform_'
    };

    // Subteste 1: Usuário comum de tenant tentando restaurar backup recebe HTTP 403
    await t.test('1. Usuário comum de tenant tentando restaurar backup recebe HTTP 403', async () => {
      const resTenant = await fetch(`http://127.0.0.1:${port}/api/backup/restaurar`, {
        method: 'POST',
        headers: { ...authHeadersTenant, 'Content-Type': 'application/json' },
        body: JSON.stringify({ backupFilepath: path.basename(backupValido.filepath), verifyOnly: true })
      });
      assert.equal(resTenant.status, 403, 'Usuário de tenant comum deve receber 403');
    });

    // Subteste 2: Usuário autorizado de infraestrutura com arquivo VÁLIDO dentro da raiz recebe HTTP 200
    await t.test('2. Usuário autorizado de infraestrutura com arquivo VÁLIDO dentro da raiz recebe HTTP 200', async () => {
      const resValido = await fetch(`http://127.0.0.1:${port}/api/backup/restaurar`, {
        method: 'POST',
        headers: { ...authHeadersInfra, 'Content-Type': 'application/json' },
        body: JSON.stringify({ backupFilepath: path.basename(backupValido.filepath), verifyOnly: true })
      });
      assert.equal(resValido.status, 200, 'Infra autorizada com arquivo na raiz deve receber 200');
      const jsonValido = await resValido.json();
      assert.equal(jsonValido.ok, true);
    });

    // Subteste 3: Caminho relativo escapando da raiz (../../outside_forbidden/evil_backup.db) recebe HTTP 400
    await t.test('3. Caminho relativo escapando da raiz recebe HTTP 400', async () => {
      const resRelativoEscapando = await fetch(`http://127.0.0.1:${port}/api/backup/restaurar`, {
        method: 'POST',
        headers: { ...authHeadersInfra, 'Content-Type': 'application/json' },
        body: JSON.stringify({ backupFilepath: '../../outside_forbidden/evil_backup.db', verifyOnly: true })
      });
      assert.equal(resRelativoEscapando.status, 400, 'Caminho relativo escapando deve ser bloqueado com 400');
    });

    // Subteste 4: Caminho absoluto externo (arquivoFora) recebe HTTP 400
    await t.test('4. Caminho absoluto externo recebe HTTP 400', async () => {
      const resAbsolutoExterno = await fetch(`http://127.0.0.1:${port}/api/backup/restaurar`, {
        method: 'POST',
        headers: { ...authHeadersInfra, 'Content-Type': 'application/json' },
        body: JSON.stringify({ backupFilepath: arquivoFora, verifyOnly: true })
      });
      assert.equal(resAbsolutoExterno.status, 400, 'Caminho absoluto externo deve ser bloqueado com 400');
    });

    // Subteste 5: Diretório com prefixo semelhante (backups_autorizados_malicioso) recebe HTTP 400
    await t.test('5. Diretório com prefixo semelhante recebe HTTP 400', async () => {
      const resPrefixoSimilar = await fetch(`http://127.0.0.1:${port}/api/backup/restaurar`, {
        method: 'POST',
        headers: { ...authHeadersInfra, 'Content-Type': 'application/json' },
        body: JSON.stringify({ backupFilepath: arquivoPrefixoSimilar, verifyOnly: true })
      });
      assert.equal(resPrefixoSimilar.status, 400, 'Diretório de prefixo semelhante deve ser bloqueado com 400');
    });

    // Subteste 6: Symlink de Arquivo apontando para fora da raiz (com skip formal pelo runner se impedido)
    const symlinkSkipReason = !symlinkCriado
      ? `Ambiente impediu criação de symlink de arquivo (${symlinkMotivo}). Não contabilizado como controle comprovado.`
      : false;
    await t.test('6. Symlink de Arquivo apontando para fora da raiz', { skip: symlinkSkipReason }, async () => {
      const resSymlink = await fetch(`http://127.0.0.1:${port}/api/backup/restaurar`, {
        method: 'POST',
        headers: { ...authHeadersInfra, 'Content-Type': 'application/json' },
        body: JSON.stringify({ backupFilepath: 'link_para_fora.db', verifyOnly: true })
      });
      assert.equal(resSymlink.status, 400, 'Symlink de arquivo apontando para fora da raiz deve ser bloqueado com 400');
    });

    // Subteste 7: Junction de Diretório apontando para fora da raiz (com skip formal pelo runner se impedido)
    const junctionSkipReason = !junctionCriada
      ? `Ambiente impediu criação de junction (${junctionMotivo}). Não contabilizado como controle comprovado.`
      : false;
    await t.test('7. Junction de Diretório apontando para fora da raiz (arquivo acessado através da junction)', { skip: junctionSkipReason }, async () => {
      const resJunction = await fetch(`http://127.0.0.1:${port}/api/backup/restaurar`, {
        method: 'POST',
        headers: { ...authHeadersInfra, 'Content-Type': 'application/json' },
        body: JSON.stringify({ backupFilepath: 'junction_fora/evil_backup.db', verifyOnly: true })
      });
      assert.equal(resJunction.status, 400, 'Arquivo acessado através de junction externa deve ser bloqueado com 400');
    });

  } finally {
    if (child && child.exitCode === null) {
      const exitDone = once(child, 'exit');
      child.kill();
      await exitDone;
    }
    await closeDB().catch(() => {});
  }
});
