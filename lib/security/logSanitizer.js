'use strict';

/**
 * PÁTIO CRM — SANITIZADOR DE LOGS E TRATAMENTO DE CORRELATION ID
 * Impede vazamento de credenciais, dados de cartão, segredos de webhook
 * e PII nos logs da aplicação, garantindo rastreabilidade por Correlation ID.
 */

const crypto = require('crypto');

const SENSITIVE_KEYS = new Set([
  'senha', 'password', 'pass', 'secret', 'token', 'apikey', 'api_key',
  'asaas_api_key', 'authorization', 'access_token', 'creditcard',
  'creditcardtoken', 'creditcardnumber', 'cvv', 'ccv', 'card_number',
  'chavepix', 'banco', 'conta', 'agencia'
]);

function sanitizeObject(obj, depth = 0) {
  if (depth > 5) return '[MaxDepth]';
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(item => sanitizeObject(item, depth + 1));

  const clean = {};
  for (const [k, v] of Object.entries(obj)) {
    const lowerKey = k.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (SENSITIVE_KEYS.has(lowerKey)) {
      clean[k] = '***REDACTED***';
    } else if (typeof v === 'string' && v.length > 500) {
      clean[k] = v.slice(0, 500) + '...[TRUNCATED]';
    } else if (typeof v === 'object' && v !== null) {
      clean[k] = sanitizeObject(v, depth + 1);
    } else {
      clean[k] = v;
    }
  }
  return clean;
}

function correlationMiddleware(req, res, next) {
  const reqId = req.headers['x-request-id'] || (`req_${Date.now()}_` + crypto.randomBytes(4).toString('hex'));
  req.id = reqId;
  res.setHeader('x-request-id', reqId);
  next();
}

function logSecurityEvent({ tenantId = 'system', actorId = 'system', actorType = 'system', action, entity = null, entityId = null, details = {}, ip = null }) {
  const cleanDetails = sanitizeObject(details);
  const entry = {
    timestamp: new Date().toISOString(),
    type: 'security_audit',
    tenantId,
    actorId,
    actorType,
    action,
    entity,
    entityId,
    ip,
    details: cleanDetails
  };

  try {
    const { run } = require('../../db');
    const auditId = `sec_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    run(`INSERT INTO security_audit_log (
      id, tenant_id, actor_id, actor_type, action, entity, entity_id, ip_address, details_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
      auditId, tenantId, actorId, actorType, action, entity, entityId, ip || '', JSON.stringify(cleanDetails), entry.timestamp
    ]).catch((auditErr) => { console.error('[AUDIT_LOG_FAILURE] Falha ao persistir evento de segurança:', auditErr.message, '| Ação:', action); });
  } catch (_) {}

  return entry;
}

module.exports = {
  sanitizeObject,
  correlationMiddleware,
  logSecurityEvent
};
