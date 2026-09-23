'use strict';

/**
 * PÁTIO CRM — SERVIÇO DE ARMAZENAMENTO REMOTO INDEPENDENTE (REMOTE BACKUP VAULT)
 * 
 * Atua como receptor de backups fora do host de produção ou em partição/servidor segregado.
 * Valida autenticação via token Bearer, armazena pacotes WAL de forma isolada,
 * recalcula independentemente o hash SHA-256 de cada arquivo recebido contra o manifesto
 * e disponibiliza endpoints de listagem e download para recuperação de desastres.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const rootDir = path.resolve(__dirname, '..');
const defaultVaultDir = path.resolve(process.env.REMOTE_VAULT_DIR || path.join(rootDir, 'PatioCRM_Remote_Vault'));
const defaultToken = process.env.BACKUP_REMOTE_TOKEN || null;
const defaultPort = parseInt(process.env.REMOTE_VAULT_PORT || '3005', 10);
const defaultHost = process.env.REMOTE_VAULT_HOST || '127.0.0.1';

function computeSha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function createRemoteVaultServer(options = {}) {
  const vaultDir = path.resolve(options.vaultDir || defaultVaultDir);
  const vaultToken = options.token || defaultToken;
  const port = options.port || defaultPort;
  const host = options.host || defaultHost;

  if (!vaultToken || vaultToken === 'PatioRemoteVaultSecretToken2026!') {
    throw new Error('CONFIG_SEGURANCA_OBRIGATORIA: BACKUP_REMOTE_TOKEN privado deve ser configurado para inicializar o cofre remoto e não pode utilizar tokens padrão/expostos.');
  }

  fs.mkdirSync(vaultDir, { recursive: true });

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`);
    const method = req.method.toUpperCase();

    const sendJson = (statusCode, data) => {
      const body = JSON.stringify(data);
      res.writeHead(statusCode, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(body),
        'X-Content-Type-Options': 'nosniff'
      });
      res.end(body);
    };

    // 1. Healthcheck público
    if (method === 'GET' && url.pathname === '/health') {
      let packageCount = 0;
      try {
        packageCount = fs.readdirSync(vaultDir).filter(f => f.startsWith('package_')).length;
      } catch (_) {}
      return sendJson(200, {
        status: 'healthy',
        service: 'PatioCRM Remote Backup Vault',
        vaultDir,
        packageCount,
        uptime: process.uptime()
      });
    }

    // Validação de Token de Autenticação para todas as operações do cofre
    const authHeader = req.headers['authorization'] || '';
    const expectedAuth = `Bearer ${vaultToken}`;
    if (authHeader !== expectedAuth) {
      return sendJson(401, { ok: false, error: 'UNAUTHORIZED: Token de cofre remoto inválido ou ausente.' });
    }

    // 2. Upload e Verificação Criptográfica de Pacote de Backup
    if (method === 'POST' && url.pathname === '/api/remote-vault/upload') {
      const chunks = [];
      let totalLength = 0;
      const MAX_UPLOAD_BYTES = 100 * 1024 * 1024; // 100MB

      req.on('data', chunk => {
        totalLength += chunk.length;
        if (totalLength > MAX_UPLOAD_BYTES) {
          req.destroy(new Error('PAYLOAD_TOO_LARGE'));
        }
        chunks.push(chunk);
      });

      req.on('error', err => {
        sendJson(413, { ok: false, error: 'Payload excede o limite máximo suportado (100MB).' });
      });

      req.on('end', () => {
        let stagingDest;
        try {
          const raw = Buffer.concat(chunks).toString('utf8');
          const payload = JSON.parse(raw);

          const { backupId, timestamp, packageFolderName, manifest, files } = payload;
          if (!backupId || !packageFolderName || !manifest || !files) {
            return sendJson(400, { ok: false, error: 'Campos obrigatórios ausentes no pacote de backup remoto.' });
          }

          // Validar todo o pacote antes de escrever. Nomes não são caminhos.
          const validName = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,200}$/.test(value);
          if (!validName(backupId) || !validName(packageFolderName) || !packageFolderName.startsWith('package_')) {
            return sendJson(400, { ok: false, error: 'Identificador de pacote inválido.' });
          }
          const isRecord = value => value && typeof value === 'object' && !Array.isArray(value);
          if (!isRecord(files) || !isRecord(manifest.files) || !Object.hasOwn(files, 'patio.db') ||
              Object.keys(files).length !== Object.keys(manifest.files).length) {
            return sendJson(400, { ok: false, error: 'Pacote incompleto: banco e manifesto correspondentes obrigatórios.' });
          }
          const verifiedFiles = {};
          const buffers = new Map();
          const canonicalNames = new Set();
          for (const [relPath, content] of Object.entries(files)) {
            const segments = relPath.split('/');
            if ((relPath !== 'patio.db' && !relPath.startsWith('uploads/')) ||
                segments.some(p => !p || p === '.' || p === '..' || /[\\:<>"|?*\x00-\x1f]/.test(p) || /[. ]$/.test(p)) ||
                canonicalNames.has(relPath.toLowerCase())) {
              throw new Error('Caminho de arquivo inválido.');
            }
            canonicalNames.add(relPath.toLowerCase());
            const expected = Object.hasOwn(manifest.files, relPath) && manifest.files[relPath];
            if (!expected || !/^[a-f0-9]{64}$/i.test(expected.sha256 || '') ||
                !Number.isSafeInteger(expected.size) || expected.size < 0 || typeof content !== 'string') {
              throw new Error('Metadados de integridade inválidos.');
            }
            const buffer = Buffer.from(content, 'base64');
            const calculatedSha = computeSha256(buffer);
            if (buffer.toString('base64') !== content || buffer.length !== expected.size || calculatedSha !== expected.sha256.toLowerCase() ||
                (relPath === 'patio.db' && !buffer.length)) {
              throw new Error('Divergência de tamanho ou SHA-256 no receptor remoto.');
            }
            buffers.set(relPath, buffer);
            verifiedFiles[relPath] = { size: buffer.length, sha256: calculatedSha, verified: true };
          }
          const safePackageName = packageFolderName;
          const packageDest = path.join(vaultDir, safePackageName);
          if (fs.existsSync(packageDest)) {
            return sendJson(409, { ok: false, error: 'Pacote já existe; substituição não permitida.' });
          }
          stagingDest = fs.mkdtempSync(path.join(vaultDir, '.staging_rx_'));
          for (const [relPath, buffer] of buffers) {
            const fileDest = path.join(stagingDest, relPath);
            fs.mkdirSync(path.dirname(fileDest), { recursive: true });
            fs.writeFileSync(fileDest, buffer);
          }

          // Grava o manifesto verificado no pacote
          fs.writeFileSync(path.join(stagingDest, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');

          // Emite recibo de integridade do pacote verificado
          const receipt = {
            backupId,
            packageFolderName: safePackageName,
            receivedAt: new Date().toISOString(),
            vaultDir,
            totalFilesVerified: Object.keys(verifiedFiles).length,
            verifiedFiles,
            allHashesMatchManifest: true,
            receiptHash: crypto.createHash('sha256').update(JSON.stringify(verifiedFiles)).digest('hex')
          };
          fs.writeFileSync(path.join(stagingDest, 'vault_receipt.json'), JSON.stringify(receipt, null, 2), 'utf8');

          // Publicação atômica no cofre remoto
          fs.renameSync(stagingDest, packageDest);
          stagingDest = null;

          console.log(`✔ [Remote Vault] Pacote "${safePackageName}" recebido e verificado com sucesso (${Object.keys(verifiedFiles).length} arquivos).`);

          return sendJson(200, {
            ok: true,
            backupId,
            packageFolderName: safePackageName,
            totalFiles: Object.keys(verifiedFiles).length,
            verified: true,
            receipt
          });
        } catch (parseErr) {
          if (stagingDest) fs.rmSync(stagingDest, { recursive: true, force: true });
          return sendJson(400, { ok: false, error: `Erro ao processar pacote de backup: ${parseErr.message}` });
        }
      });
      return;
    }

    // 3. Listagem de Pacotes Disponíveis no Cofre
    if (method === 'GET' && url.pathname === '/api/remote-vault/packages') {
      try {
        const entries = fs.readdirSync(vaultDir, { withFileTypes: true });
        const packages = [];
        for (const entry of entries) {
          if (entry.isDirectory() && entry.name.startsWith('package_')) {
            const pkgPath = path.join(vaultDir, entry.name);
            const receiptPath = path.join(pkgPath, 'vault_receipt.json');
            const manifestPath = path.join(pkgPath, 'manifest.json');
            if (fs.existsSync(receiptPath)) {
              try {
                const receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
                packages.push({
                  packageFolderName: entry.name,
                  backupId: receipt.backupId,
                  receivedAt: receipt.receivedAt,
                  totalFiles: receipt.totalFilesVerified,
                  receiptHash: receipt.receiptHash
                });
              } catch (_) {}
            }
          }
        }
        packages.sort((a, b) => (b.receivedAt || '').localeCompare(a.receivedAt || ''));
        return sendJson(200, { ok: true, packages });
      } catch (listErr) {
        return sendJson(500, { ok: false, error: listErr.message });
      }
    }

    // 4. Download Integral de Pacote para Recuperação de Desastres
    const downloadMatch = url.pathname.match(/^\/api\/remote-vault\/download\/(.+)$/);
    if (method === 'GET' && downloadMatch) {
      const targetBackupId = decodeURIComponent(downloadMatch[1]);
      const entries = fs.readdirSync(vaultDir, { withFileTypes: true });
      let matchedDir = null;

      for (const entry of entries) {
        if (entry.isDirectory() && entry.name.includes(targetBackupId)) {
          matchedDir = path.join(vaultDir, entry.name);
          break;
        }
      }

      if (!matchedDir || !fs.existsSync(matchedDir)) {
        return sendJson(404, { ok: false, error: `Pacote de backup "${targetBackupId}" não encontrado no cofre remoto.` });
      }

      try {
        const manifestPath = path.join(matchedDir, 'manifest.json');
        const receiptPath = path.join(matchedDir, 'vault_receipt.json');
        if (!fs.existsSync(manifestPath)) {
          return sendJson(500, { ok: false, error: 'manifest.json ausente no pacote remoto.' });
        }

        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        const receipt = fs.existsSync(receiptPath) ? JSON.parse(fs.readFileSync(receiptPath, 'utf8')) : null;

        // Empacota arquivos em base64 para restauração
        const files = {};
        function collect(dir, base) {
          const items = fs.readdirSync(dir, { withFileTypes: true });
          for (const it of items) {
            const fullP = path.join(dir, it.name);
            if (it.isDirectory()) {
              collect(fullP, base);
            } else if (it.isFile() && it.name !== 'vault_receipt.json' && it.name !== 'manifest.json') {
              const rel = path.relative(base, fullP).replace(/\\/g, '/');
              files[rel] = fs.readFileSync(fullP).toString('base64');
            }
          }
        }
        collect(matchedDir, matchedDir);

        return sendJson(200, {
          ok: true,
          backupId: targetBackupId,
          packageFolderName: path.basename(matchedDir),
          manifest,
          receipt,
          files
        });
      } catch (dlErr) {
        return sendJson(500, { ok: false, error: `Falha ao ler pacote para download: ${dlErr.message}` });
      }
    }

    return sendJson(404, { ok: false, error: 'Endpoint não encontrado.' });
  });

  return {
    server,
    vaultDir,
    start: () => new Promise((resolve, reject) => {
      server.listen(port, host, () => {
        console.log(`[Remote Vault] Servidor escutando em http://${host}:${port}`);
        resolve({ port, host, vaultDir });
      });
      server.on('error', reject);
    }),
    stop: () => new Promise(resolve => {
      server.close(resolve);
    })
  };
}

if (require.main === module) {
  const vault = createRemoteVaultServer();
  vault.start().catch(err => {
    console.error('[Remote Vault] Falha ao iniciar servidor:', err);
    process.exit(1);
  });
}

module.exports = {
  createRemoteVaultServer,
  computeSha256
};
