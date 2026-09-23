'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const UPLOADS_BASE = require('./security/testPaths').assertTestResourcePath(process.env.UPLOAD_DIR || path.join(__dirname, '..', 'public', 'uploads'),'uploads');
if ((process.env.NODE_ENV === 'test' || process.env.NODE_TEST_CONTEXT) && !process.env.UPLOAD_DIR) throw new Error('UPLOAD_DIR temporário obrigatório em testes.');

function sanitizeTenant(tenantId) {
  if (!/^[a-zA-Z0-9_-]{3,64}$/.test(String(tenantId))) throw new Error('Oficina inválida para upload.');
  return tenantId;
}

function extensionFromMime(mimeType) {
  const mime = String(mimeType || '').toLowerCase().trim();
  if (mime.includes('png')) return 'png';
  if (mime.includes('jpeg') || mime.includes('jpg')) return 'jpg';
  if (mime.includes('webp')) return 'webp';
  if (mime.includes('svg')) throw new Error('SVG ativo não permitido em uploads.');
  return 'bin';
}

/**
 * Salva um buffer de imagem/arquivo em disco sob public/uploads/{tenantId}/
 */
function salvarUpload({ tenantId, tipo = 'imagem', buffer, mimeType = 'image/png' }) {
  if (!buffer || !Buffer.isBuffer(buffer)) {
    throw new Error('Buffer inválido para salvamento de arquivo.');
  }

  if (!/^[a-zA-Z0-9_-]{1,40}$/.test(tipo) || buffer.length > 20*1024*1024) throw new Error('Nome ou tamanho do upload inválido.');
  const cleanTenant = sanitizeTenant(tenantId);
  const tenantDir = path.join(UPLOADS_BASE, cleanTenant);
  if (!fs.existsSync(tenantDir)) {
    fs.mkdirSync(tenantDir, { recursive: true });
  }

  const hash = crypto.createHash('sha256').update(buffer).digest('hex').slice(0, 16);
  const ext = extensionFromMime(mimeType);
  const fileName = `${tipo}_${hash}.${ext}`;
  const filePath = path.join(tenantDir, fileName);

  fs.writeFileSync(filePath, buffer);

  const relativeUrl = `/uploads/${cleanTenant}/${fileName}`;
  const fileId = `${tipo}_${hash}`;

  return {
    fileId,
    url: relativeUrl,
    path: path.relative(path.resolve(__dirname, '..'), filePath).replace(/\\/g, '/'),
    hash,
    mimeType,
    sizeBytes: buffer.length,
    salvoEm: new Date().toISOString()
  };
}

/**
 * Resolve a URL de uma imagem para renderização, suportando tanto
 * strings legadas (Base64 data:image ou URLs absolutas/relativas)
 * quanto objetos estruturados de metadados.
 */
function resolverUrlImagem(val) {
  if (!val) return null;
  if (typeof val === 'string') return val;
  if (typeof val === 'object') {
    return val.url || val.dataUrl || val.base64 || null;
  }
  return null;
}

/**
 * Remove um arquivo previamente salvo se existir.
 */
function removerUpload({ tenantId, url, filePath }) {
  try {
    let target = null;
    if (filePath) {
      target = path.resolve(__dirname, '..', filePath);
    } else if (url && url.startsWith('/uploads/')) {
      target = path.join(UPLOADS_BASE, url.slice('/uploads/'.length));
    }
    if (target && fs.existsSync(target)) {
      const tenantRoot=fs.realpathSync(path.join(UPLOADS_BASE,sanitizeTenant(tenantId)));
      const relative=path.relative(tenantRoot,fs.realpathSync(target));
      if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Arquivo fora da oficina.');
      fs.unlinkSync(target);
      return true;
    }
  } catch (err) {
    console.warn('[FileStorage] Falha ao remover arquivo:', err.message);
  }
  return false;
}

module.exports = {
  salvarUpload,
  resolverUrlImagem,
  removerUpload,
  UPLOADS_BASE
};
