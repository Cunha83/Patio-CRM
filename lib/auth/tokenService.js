'use strict';

const crypto = require('crypto');

const AUTH_SECRET = process.env.AUTH_SECRET || 'patio_crm_jwt_secret_key_2026_super_secure';

const BASE_ROLES = {
  admin: {
    role: 'admin',
    nome: 'Gerente Geral',
    cargo: 'Gerente Geral',
    permissions: ['*']
  },
  vendedor: {
    role: 'vendedor',
    nome: 'Consultor de Vendas',
    cargo: 'Consultor / Vendedor',
    permissions: [
      'os:read', 'os:write', 'patio:read', 'patio:write',
      'sales:read', 'sales:write', 'client:read', 'client:write',
      'inventory:read', 'quotation:read', 'quotation:write'
    ]
  },
  caixa: {
    role: 'caixa',
    nome: 'Operador Financeiro',
    cargo: 'Financeiro / Caixa',
    permissions: [
      'dashboard:read', 'financial:read', 'financial:write',
      'pix:read', 'pix:write', 'purchase:read', 'purchase:write',
      'sales:read', 'fiscal:read', 'fiscal:write'
    ]
  },
  mecanico: {
    role: 'mecanico',
    nome: 'Mecânico de Pátio',
    cargo: 'Mecânico / Operador de Box',
    permissions: [
      'patio:read', 'patio:write', 'os:read', 'os:write',
      'labor:write', 'inventory:read'
    ]
  }
};

function base64UrlEncode(str) {
  return Buffer.from(str)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function base64UrlDecode(str) {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  return Buffer.from(base64, 'base64').toString('utf8');
}

function generateToken(payload, expiresInSeconds = 7 * 24 * 3600) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const fullPayload = {
    ...payload,
    iat: now,
    exp: now + expiresInSeconds
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(fullPayload));
  const data = `${encodedHeader}.${encodedPayload}`;

  const signature = crypto
    .createHmac('sha256', AUTH_SECRET)
    .update(data)
    .digest('base64url');

  return `${data}.${signature}`;
}

function verifyToken(token) {
  if (!token || typeof token !== 'string') return null;

  const parts = token.trim().split('.');
  if (parts.length !== 3) return null;

  const [encodedHeader, encodedPayload, signature] = parts;
  const data = `${encodedHeader}.${encodedPayload}`;

  const expectedSignature = crypto
    .createHmac('sha256', AUTH_SECRET)
    .update(data)
    .digest('base64url');

  const sigBuf = Buffer.from(signature);
  const expSigBuf = Buffer.from(expectedSignature);

  if (sigBuf.length !== expSigBuf.length || !crypto.timingSafeEqual(sigBuf, expSigBuf)) {
    return null;
  }

  try {
    const payload = JSON.parse(base64UrlDecode(encodedPayload));
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) {
      return null; // Token expirado
    }
    return payload;
  } catch (_) {
    return null;
  }
}

module.exports = {
  AUTH_SECRET,
  BASE_ROLES,
  generateToken,
  verifyToken,
  base64UrlEncode,
  base64UrlDecode
};

