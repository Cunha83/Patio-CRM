'use strict';

/**
 * PÁTIO CRM — COMPROVAÇÃO DE RESTAURAÇÃO DE DESASTRES
 * 
 * Restaura um pacote autocontido (manifest.json, patio.db WAL, uploads/)
 * a partir de um pacote independente ou do cofre de backup,
 * valida a integridade de todos os arquivos via SHA-256 e PRAGMA integrity_check,
 * inicializa o servidor de aplicação em porta efêmera e audita:
 * 1. Login dos 3 operadores com as credenciais privadas rotacionadas.
 * 2. Rejeição de senhas antigas de exemplo com 401.
 * 3. Recuperação de estado de OS e anexos.
 * 4. RTO medido em segundos.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { spawn } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const deployDir = path.join(rootDir, 'deploy-piloto');

// Carrega variáveis se disponível de deploy-piloto
if (fs.existsSync(path.join(deployDir, '.env'))) {
  try { require('dotenv').config({ path: path.join(deployDir, '.env') }); } catch (_) {}
}

const { getCredenciaisDefinitivas } = require('./provisionar_credenciais_finais.cjs');
const sqlite3 = require('sqlite3');

function computeFileSha256(filePath) {
  const hash = crypto.createHash('sha256');
  const buffer = fs.readFileSync(filePath);
  hash.update(buffer);
  return hash.digest('hex');
}

async function comprovarRestauracaoRemota(options = {}) {
  console.log('================================================================');
  console.log(' PÁTIO CRM — COMPROVAÇÃO DE RESTAURAÇÃO DE PACOTE DE BACKUP');
  console.log(' Host: AMF01 | Data:', new Date().toISOString());
  console.log('================================================================\n');

  const tStart = performance.now();

  // 1. Identifica o pacote a ser restaurado
  let packageDir = options.packageDir || process.env.BACKUP_PACKAGE_DIR || null;

  if (!packageDir) {
    // Localiza o pacote mais recente gerado pelo agendador em deploy-piloto/backups
    const backupsBase = path.join(deployDir, 'backups');
    if (fs.existsSync(backupsBase)) {
      const pkgs = fs.readdirSync(backupsBase).filter(f => f.startsWith('package_'));
      pkgs.sort();
      if (pkgs.length > 0) {
        packageDir = path.join(backupsBase, pkgs[pkgs.length - 1]);
      }
    }
  }

  if (!packageDir || !fs.existsSync(packageDir)) {
    throw new Error(`Nenhum pacote de backup válido encontrado para restauração.`);
  }

  console.log(`[1/5] Pacote selecionado para restauração: ${path.basename(packageDir)}`);
  const manifestPath = path.join(packageDir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    throw new Error('manifest.json ausente no pacote de backup.');
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  console.log(`  ID do Backup:       ${manifest.backupId}`);
  console.log(`  Arquivos no Pacote: ${manifest.totalFiles} (${manifest.totalBytes} bytes)`);

  // 2. Extração para ambiente isolado de recuperação
  console.log('\n[2/5] Montando ambiente isolado de recuperação...');
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'patio-dr-test-'));
  const restoredDbPath = path.join(tempDir, 'patio.db');
  const restoredUploadsDir = path.join(tempDir, 'uploads');
  fs.mkdirSync(restoredUploadsDir, { recursive: true });

  // 3. Validação Criptográfica de cada arquivo contra o Manifesto
  console.log('\n[3/5] Verificando integridade SHA-256 de todos os arquivos contra o manifesto...');
  const fileVerifications = [];

  for (const [relPath, fileInfo] of Object.entries(manifest.files)) {
    const srcFile = path.join(packageDir, relPath);
    if (!fs.existsSync(srcFile)) {
      throw new Error(`Arquivo declarado no manifesto ausente no pacote: ${relPath}`);
    }

    const destFile = path.join(tempDir, relPath);
    fs.mkdirSync(path.dirname(destFile), { recursive: true });
    fs.copyFileSync(srcFile, destFile);

    const actualSha = computeFileSha256(destFile);
    if (actualSha !== fileInfo.sha256) {
      throw new Error(`Divergência de integridade para "${relPath}". Esperado: ${fileInfo.sha256}, Obtido: ${actualSha}`);
    }

    fileVerifications.push({ relPath, sha256: actualSha, size: fileInfo.size, status: 'verified' });
    console.log(`  ✔ ${relPath} verificado por SHA-256 (${actualSha.slice(0, 16)}...)`);
  }

  // 3.1 Integridade estrutural do SQLite restaurado
  const db = new sqlite3.Database(restoredDbPath);
  const integrity = await new Promise((resolve, reject) => {
    db.get('PRAGMA integrity_check', (err, row) => {
      db.close();
      if (err) reject(err); else resolve(row?.integrity_check);
    });
  });

  if (integrity !== 'ok') {
    throw new Error(`SQLite PRAGMA integrity_check falhou: ${integrity}`);
  }
  console.log('  ✔ Integridade física do banco SQLite: OK (PRAGMA integrity_check = ok)');

  // 4. Inicialização de servidor isolado em porta efêmera para testes
  console.log('\n[4/5] Inicializando servidor isolado na porta 3009 com a base restaurada...');
  const testPort = 3009;
  const serverProc = spawn(process.execPath, [path.join(rootDir, 'server.js')], {
    cwd: rootDir,
    env: {
      ...process.env,
      HOST: '127.0.0.1',
      PORT: String(testPort),
      DB_PATH: restoredDbPath,
      UPLOAD_DIR: restoredUploadsDir,
      DISABLE_WHATSAPP: 'true',
      DISABLE_INTEGRATIONS: 'true',
      NODE_ENV: 'test'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let isUp = false;
  for (let i = 0; i < 50; i++) {
    try {
      const resH = await fetch(`http://127.0.0.1:${testPort}/health`);
      if (resH.status === 200) {
        isUp = true;
        break;
      }
    } catch (_) {}
    await new Promise(r => setTimeout(r, 200));
  }

  if (!isUp) {
    serverProc.kill();
    throw new Error('Servidor isolado não respondeu dentro de 10 segundos.');
  }
  console.log('  ✔ Servidor de testes isolado ativo e saudável em /health');

  // 5. Auditoria de autenticação e permissões
  console.log('\n[5/5] Auditando login dos 3 operadores e integridade de dados...');
  const operators = getCredenciaisDefinitivas();

  try {
    // 5.1 Rejeição de credenciais antigas no servidor restaurado
    const oldPass = 'Gst#P4t1o!9xM8v2';
    const oldAuth = 'Basic ' + Buffer.from(`gestor@oficina.com.br:${oldPass}`).toString('base64');
    const resOld = await fetch(`http://127.0.0.1:${testPort}/api/estado`, {
      headers: { 'Authorization': oldAuth, 'x-tenant-id': 'oficina_piloto_01' }
    });
    if (resOld.status !== 401) {
      throw new Error(`Credencial antiga deveria retornar 401, retornou: ${resOld.status}`);
    }
    console.log('  ✔ Credenciais antigas de desenvolvimento rejeitadas com 401 Unauthorized.');

    // 5.2 Autenticação dos 3 operadores com novas credenciais
    for (const op of operators) {
      const auth = 'Basic ' + Buffer.from(`${op.username}:${op.password}`).toString('base64');
      const resLogin = await fetch(`http://127.0.0.1:${testPort}/api/estado`, {
        headers: {
          'Authorization': auth,
          'x-tenant-id': 'oficina_piloto_01'
        }
      });
      if (resLogin.status !== 200) {
        throw new Error(`Falha no login do operador ${op.username}: HTTP ${resLogin.status}`);
      }
      console.log(`  ✔ Operador "${op.username}" (${op.role}) autenticado com sucesso [SENHA_PROTEGIDA]`);
    }

    // 5.3 Leitura do estado de OS
    const gestorOp = operators.find(o => o.role === 'tenant_admin');
    const gestorAuth = 'Basic ' + Buffer.from(`${gestorOp.username}:${gestorOp.password}`).toString('base64');
    const resState = await fetch(`http://127.0.0.1:${testPort}/api/estado`, {
      headers: {
        'Authorization': gestorAuth,
        'x-tenant-id': 'oficina_piloto_01'
      }
    });

    const state = await resState.json();
    console.log(`  ✔ Estado da oficina recuperado: ${state.os ? state.os.length : 0} OS(s), ${state.clientes ? state.clientes.length : 0} cliente(s).`);

    const rtoSeconds = ((performance.now() - tStart) / 1000).toFixed(2);
    console.log('\n================================================================');
    console.log(`🎉 RESTAURAÇÃO DE DESASTRES COMPROVADA COM SUCESSO!`);
    console.log(`⏱ RTO Medido (Extração + Hash + Boot + 3 Logins + OS): ${rtoSeconds}s`);
    console.log('================================================================\n');

    const evidence = {
      timestamp: new Date().toISOString(),
      backupId: manifest.backupId,
      packageFolderName: path.basename(packageDir),
      filesVerified: fileVerifications,
      sqliteIntegrity: integrity,
      rtoSeconds: parseFloat(rtoSeconds),
      operatorsTested: operators.map(o => ({ username: o.username, role: o.role, status: '200_OK' })),
      oldCredentialsRejected401: true,
      dataRecovery: {
        osCount: state.os ? state.os.length : 0,
        clientesCount: state.clientes ? state.clientes.length : 0
      }
    };

    const evidenceFile = path.join(rootDir, 'docs', 'evidencias', 'comprovacao_restauracao_host.json');
    fs.writeFileSync(evidenceFile, JSON.stringify(evidence, null, 2), 'utf8');
    console.log(`✔ Evidência formal gravada em: ${evidenceFile}`);

    return {
      ok: true,
      backupId: manifest.backupId,
      rtoSeconds,
      packageFolderName: path.basename(packageDir),
      evidence
    };
  } finally {
    serverProc.kill();
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (_) {}
  }
}

if (require.main === module) {
  comprovarRestauracaoRemota().catch(err => {
    console.error('❌ Falha na comprovação de restauração:', err.message);
    process.exit(1);
  });
}

module.exports = { comprovarRestauracaoRemota };
