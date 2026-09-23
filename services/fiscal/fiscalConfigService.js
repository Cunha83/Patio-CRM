'use strict';

const crypto = require('crypto');
const { get, run, all } = require('../../db');

// Chave mestre de derivação para criptografia em repouso de certificados e tokens
function getDerivedKey() {
  const key = process.env.FISCAL_ENCRYPTION_KEY;
  if (!key || !/^[a-fA-F0-9]{64}$/.test(key)) throw new Error('FISCAL_ENCRYPTION_KEY deve conter 32 bytes aleatórios em hexadecimal. Configure o segredo no servidor.');
  return Buffer.from(key, 'hex');
}

function encryptSecret(plainText) {
  if (!plainText) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getDerivedKey(), iv);
  let enc = cipher.update(String(plainText), 'utf8', 'hex');
  enc += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return `${iv.toString('hex')}:${authTag}:${enc}`;
}

function decryptSecret(encryptedString) {
  if (!encryptedString || !encryptedString.includes(':')) return null;
  try {
    const [ivHex, authTagHex, encHex] = encryptedString.split(':');
    const decipher = crypto.createDecipheriv('aes-256-gcm', getDerivedKey(), Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
    let dec = decipher.update(encHex, 'hex', 'utf8');
    dec += decipher.final('utf8');
    return dec;
  } catch (err) {
    throw new Error('Não foi possível abrir o segredo fiscal. Verifique a chave de custódia; não sobrescreva a configuração.');
  }
}

function normalizeDoc(doc) {
  return String(doc || '').replace(/\D/g, '');
}

function validateCNPJ(cnpj) {
  const clean = normalizeDoc(cnpj);
  if (clean.length !== 14) return false;
  if (/^(\d)\1+$/.test(clean)) return false;

  let size = clean.length - 2;
  let numbers = clean.substring(0, size);
  let digits = clean.substring(size);
  let sum = 0;
  let pos = size - 7;
  for (let i = size; i >= 1; i--) {
    sum += numbers.charAt(size - i) * pos--;
    if (pos < 2) pos = 9;
  }
  let result = sum % 11 < 2 ? 0 : 11 - (sum % 11);
  if (result !== parseInt(digits.charAt(0), 10)) return false;

  size = size + 1;
  numbers = clean.substring(0, size);
  sum = 0;
  pos = size - 7;
  for (let i = size; i >= 1; i--) {
    sum += numbers.charAt(size - i) * pos--;
    if (pos < 2) pos = 9;
  }
  result = sum % 11 < 2 ? 0 : 11 - (sum % 11);
  return result === parseInt(digits.charAt(1), 10);
}

function tokenFromEnvironment(tenantId) {
  try { return JSON.parse(process.env.FISCAL_FOCUS_TOKENS || '{}')[tenantId] || null; } catch (_) { throw new Error('Mapa de tokens fiscais inválido no servidor.'); }
}
async function getFiscalConfig(tenantId) {
  if (!tenantId) return null;
  const row = await get('SELECT * FROM fiscal_settings WHERE tenant_id = ?', [tenantId]);
  if (!row) {
    // Configuração inicial padrão para o tenant
    return {
      tenantId,
      ambiente: 'homologacao',
      provider: 'nao_configurado',
      providerToken: null,
      certA1Base64: null,
      certPassword: null,
      cnpj: '',
      razaoSocial: '',
      nomeFantasia: '',
      inscricaoEstadual: '',
      inscricaoMunicipal: '',
      regimeTributario: '',
      cnaePrincipal: '',
      codigoMunicipioIbge: '',
      uf: '',
      nfeSerie: 1,
      nfeProximoNumero: 1,
      nfseSerie: '1',
      nfseProximoNumero: 1,
      nfceSerie: 1,
      nfceProximoNumero: 1,
      regrasTributarias: []
    };
  }

  return {
    tenantId: row.tenant_id,
    ambiente: row.ambiente || 'homologacao',
    provider: row.provider || 'nao_configurado',
    providerToken: decryptSecret(row.provider_token_encrypted) || JSON.parse(process.env.FISCAL_FOCUS_TOKENS || '{}')[tenantId] || null,
    certA1Base64: decryptSecret(row.cert_a1_encrypted),
    certPassword: decryptSecret(row.cert_password_encrypted),
    cnpj: row.cnpj || '',
    razaoSocial: row.razao_social || '',
    nomeFantasia: row.nome_fantasia || '',
    inscricaoEstadual: row.inscricao_estadual || '',
    inscricaoMunicipal: row.inscricao_municipal || '',
    regimeTributario: row.regime_tributario || '',
    cnaePrincipal: row.cnae_principal || '',
    codigoMunicipioIbge: row.codigo_municipio_ibge || '',
    uf: row.uf || '',
    nfeSerie: row.nfe_serie == null ? 1 : Number(row.nfe_serie),
    nfeProximoNumero: Number(row.nfe_proximo_numero) || 1,
    nfseSerie: String(row.nfse_serie || '1'),
    nfseProximoNumero: Number(row.nfse_proximo_numero) || 1,
    nfceSerie: Number(row.nfce_serie) || 1,
    nfceProximoNumero: Number(row.nfce_proximo_numero) || 1,
    regrasTributarias: JSON.parse(row.regras_tributarias_json || '[]'),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function getPublicFiscalConfig(tenantId) {
  const conf = await getFiscalConfig(tenantId);
  if (!conf) return null;

  return {
    tenantId: conf.tenantId,
    ambiente: conf.ambiente,
    provider: conf.provider,
    hasProviderToken: Boolean(conf.providerToken),
    hasCertA1: Boolean(conf.certA1Base64),
    hasCertPassword: Boolean(conf.certPassword),
    cnpj: conf.cnpj,
    razaoSocial: conf.razaoSocial,
    nomeFantasia: conf.nomeFantasia,
    inscricaoEstadual: conf.inscricaoEstadual,
    inscricaoMunicipal: conf.inscricaoMunicipal,
    regimeTributario: conf.regimeTributario,
    cnaePrincipal: conf.cnaePrincipal,
    codigoMunicipioIbge: conf.codigoMunicipioIbge,
    uf: conf.uf,
    nfeSerie: conf.nfeSerie,
    nfeProximoNumero: conf.nfeProximoNumero,
    nfseSerie: conf.nfseSerie,
    nfseProximoNumero: conf.nfseProximoNumero,
    nfceSerie: conf.nfceSerie,
    nfceProximoNumero: conf.nfceProximoNumero,
    regrasTributarias: conf.regrasTributarias,
    isProductionReady: false
  };
}

async function saveFiscalConfig(tenantId, incomingConfig = {}) {
  if (!tenantId) throw new Error('Tenant ID é obrigatório para salvar configuração fiscal.');
  if (incomingConfig.ambiente === 'producao') throw new Error('Produção fiscal bloqueada nesta versão até homologação e liberação específica.');
  if (incomingConfig.provider && !['focus_nfe', 'nao_configurado'].includes(incomingConfig.provider) && !(process.env.NODE_TEST_CONTEXT && process.env.FISCAL_TEST_ADAPTER === 'enabled' && incomingConfig.provider === 'mock_homologacao')) throw new Error('Provedor fiscal não suportado.');

  for (const field of ['nfeSerie','nfeProximoNumero','nfseProximoNumero']) {
    if (incomingConfig[field] !== undefined && (!Number.isSafeInteger(Number(incomingConfig[field])) || Number(incomingConfig[field]) < (field === 'nfeSerie' ? 0 : 1) || Number(incomingConfig[field]) > (field === 'nfeSerie' ? 999 : 999999999))) throw new Error('Série ou numeração inválida.');
  }
  if (incomingConfig.regrasTributarias !== undefined && !Array.isArray(incomingConfig.regrasTributarias)) throw new Error('Perfis fiscais devem ser uma lista.');
  if (incomingConfig.ambiente && incomingConfig.ambiente !== 'homologacao') throw new Error('Ambiente fiscal inválido.');
  const existing = await getFiscalConfig(tenantId);
  const now = new Date().toISOString();

  const ambiente = incomingConfig.ambiente || existing.ambiente || 'homologacao';
  const provider = incomingConfig.provider || existing.provider || 'nao_configurado';
  
  let providerTokenEnc = existing.providerToken ? encryptSecret(existing.providerToken) : null;
  if (incomingConfig.providerToken !== undefined) {
    providerTokenEnc = incomingConfig.providerToken ? encryptSecret(incomingConfig.providerToken) : null;
  }

  let certA1Enc = existing.certA1Base64 ? encryptSecret(existing.certA1Base64) : null;
  if (incomingConfig.certA1Base64 !== undefined) {
    certA1Enc = incomingConfig.certA1Base64 ? encryptSecret(incomingConfig.certA1Base64) : null;
  }

  let certPasswordEnc = existing.certPassword ? encryptSecret(existing.certPassword) : null;
  if (incomingConfig.certPassword !== undefined) {
    certPasswordEnc = incomingConfig.certPassword ? encryptSecret(incomingConfig.certPassword) : null;
  }

  const cnpj = incomingConfig.cnpj !== undefined ? normalizeDoc(incomingConfig.cnpj) : existing.cnpj;
  const razaoSocial = incomingConfig.razaoSocial !== undefined ? String(incomingConfig.razaoSocial).trim() : existing.razaoSocial;
  const nomeFantasia = incomingConfig.nomeFantasia !== undefined ? String(incomingConfig.nomeFantasia).trim() : existing.nomeFantasia;
  const inscricaoEstadual = incomingConfig.inscricaoEstadual !== undefined ? String(incomingConfig.inscricaoEstadual).trim() : existing.inscricaoEstadual;
  const inscricaoMunicipal = incomingConfig.inscricaoMunicipal !== undefined ? String(incomingConfig.inscricaoMunicipal).trim() : existing.inscricaoMunicipal;
  const regimeTributario = incomingConfig.regimeTributario || existing.regimeTributario || '';
  const cnaePrincipal = incomingConfig.cnaePrincipal || existing.cnaePrincipal || '';
  const codigoMunicipioIbge = incomingConfig.codigoMunicipioIbge || existing.codigoMunicipioIbge || '';
  const uf = (incomingConfig.uf || existing.uf || '').toUpperCase();

  const nfeSerie = incomingConfig.nfeSerie !== undefined ? Number(incomingConfig.nfeSerie) : existing.nfeSerie;
  const nfeProximoNumero = incomingConfig.nfeProximoNumero !== undefined ? Number(incomingConfig.nfeProximoNumero) : existing.nfeProximoNumero;
  const nfseSerie = incomingConfig.nfseSerie !== undefined ? String(incomingConfig.nfseSerie) : existing.nfseSerie;
  const nfseProximoNumero = incomingConfig.nfseProximoNumero !== undefined ? Number(incomingConfig.nfseProximoNumero) : existing.nfseProximoNumero;
  const nfceSerie = incomingConfig.nfceSerie !== undefined ? Number(incomingConfig.nfceSerie) : existing.nfceSerie;
  const nfceProximoNumero = incomingConfig.nfceProximoNumero !== undefined ? Number(incomingConfig.nfceProximoNumero) : existing.nfceProximoNumero;

  const regrasTributarias = incomingConfig.regrasTributarias || existing.regrasTributarias || [];

  // Validações de segurança e integridade
  if (ambiente === 'producao') {
    if (!cnpj || !validateCNPJ(cnpj)) {
      throw new Error('Ambiente de produção exige CNPJ válido e homologado.');
    }
    if (provider !== 'mock_homologacao' && !providerTokenEnc && (!certA1Enc || !certPasswordEnc)) {
      throw new Error('Ambiente de produção exige token de provedor fiscal ou certificado digital A1 com senha.');
    }
  }

  await run(`INSERT INTO fiscal_settings (
    tenant_id, ambiente, provider, provider_token_encrypted, cert_a1_encrypted, cert_password_encrypted,
    cnpj, razao_social, nome_fantasia, inscricao_estadual, inscricao_municipal, regime_tributario,
    cnae_principal, codigo_municipio_ibge, uf, nfe_serie, nfe_proximo_numero, nfse_serie, nfse_proximo_numero,
    nfce_serie, nfce_proximo_numero, regras_tributarias_json, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(tenant_id) DO UPDATE SET
    ambiente = excluded.ambiente,
    provider = excluded.provider,
    provider_token_encrypted = excluded.provider_token_encrypted,
    cert_a1_encrypted = excluded.cert_a1_encrypted,
    cert_password_encrypted = excluded.cert_password_encrypted,
    cnpj = excluded.cnpj,
    razao_social = excluded.razao_social,
    nome_fantasia = excluded.nome_fantasia,
    inscricao_estadual = excluded.inscricao_estadual,
    inscricao_municipal = excluded.inscricao_municipal,
    regime_tributario = excluded.regime_tributario,
    cnae_principal = excluded.cnae_principal,
    codigo_municipio_ibge = excluded.codigo_municipio_ibge,
    uf = excluded.uf,
    nfe_serie = excluded.nfe_serie,
    nfe_proximo_numero = excluded.nfe_proximo_numero,
    nfse_serie = excluded.nfse_serie,
    nfse_proximo_numero = excluded.nfse_proximo_numero,
    nfce_serie = excluded.nfce_serie,
    nfce_proximo_numero = excluded.nfce_proximo_numero,
    regras_tributarias_json = excluded.regras_tributarias_json,
    updated_at = excluded.updated_at`,
  [
    tenantId, ambiente, provider, providerTokenEnc, certA1Enc, certPasswordEnc,
    cnpj, razaoSocial, nomeFantasia, inscricaoEstadual, inscricaoMunicipal, regimeTributario,
    cnaePrincipal, codigoMunicipioIbge, uf, nfeSerie, nfeProximoNumero, nfseSerie, nfseProximoNumero,
    nfceSerie, nfceProximoNumero, JSON.stringify(regrasTributarias), now, now
  ]);

  return await getFiscalConfig(tenantId);
}

module.exports = {
  getFiscalConfig,
  getPublicFiscalConfig,
  saveFiscalConfig,
  encryptSecret,
  decryptSecret,
  validateCNPJ,
  normalizeDoc
};
