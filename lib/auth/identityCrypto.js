'use strict';

const crypto = require('crypto');

const DEFAULT_INSECURE_SECRETS = new Set([
  'patio',
  'patio-password-test',
  'patio-api-secret-2026',
  'sua_chave_aqui',
  'your_api_key_here',
  'secret',
  '123456',
  '12345678',
  'admin',
  'password'
]);

function digest(val) {
  return crypto.createHash('sha256').update(String(val ?? '')).digest();
}

function safeCompare(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = digest(a);
  const bufB = digest(b);
  return crypto.timingSafeEqual(bufA, bufB);
}

module.exports = {
  DEFAULT_INSECURE_SECRETS,
  digest,
  safeCompare
};
