'use strict';

const crypto = require('crypto');
const { run, all, get } = require('../../db');
const { SCHEMA_VERSION } = require('./erpExportCanonical');

async function enfileirarParaERP({ tenantId, entityType, entityId, action = 'created', payload = {} }) {
  if (!tenantId || !entityType || !entityId) {
    throw new Error('Parâmetros obrigatórios: tenantId, entityType, entityId.');
  }
  const outboxId = `out_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
  const now = new Date().toISOString();
  const idempotencyKey = payload.idempotencyKey || `${tenantId}:${entityType}:${entityId}:${action}:${Date.now()}`;

  await run(`INSERT INTO erp_outbox (
    id, tenant_id, entity_type, entity_id, action, payload_json, status, attempts, idempotency_key, created_at
  ) VALUES (?, ?, ?, ?, ?, ?, 'pending', 0, ?, ?)`, [
    outboxId, tenantId, entityType, entityId, action, JSON.stringify(payload), idempotencyKey, now
  ]);

  return { ok: true, outboxId, idempotencyKey };
}

async function registrarSincronizacao({ tenantId, entityType, entityId, erpExternalId = null, status = 'synced', errorMessage = null }) {
  const now = new Date().toISOString();
  await run(`UPDATE erp_outbox 
    SET status = ?, last_error = ?, synced_at = ?, attempts = attempts + 1,
        locked_by = NULL, locked_at = NULL, locked_until = NULL
    WHERE tenant_id = ? AND entity_type = ? AND entity_id = ?`, [
    status, errorMessage, now, tenantId, entityType, entityId
  ]);
  return { ok: true, syncedAt: now };
}

async function obterStatusIntegracao({ tenantId }) {
  const pendentesRow = await get(`SELECT COUNT(*) as total FROM erp_outbox WHERE tenant_id = ? AND status = 'pending'`, [tenantId]);
  const sincronizadosRow = await get(`SELECT COUNT(*) as total FROM erp_outbox WHERE tenant_id = ? AND status = 'synced'`, [tenantId]);
  const errosRow = await get(`SELECT COUNT(*) as total FROM erp_outbox WHERE tenant_id = ? AND status = 'failed'`, [tenantId]);
  const processandoRow = await get(`SELECT COUNT(*) as total FROM erp_outbox WHERE tenant_id = ? AND status = 'processing'`, [tenantId]);
  const ultimoSync = await get(`SELECT synced_at FROM erp_outbox WHERE tenant_id = ? AND status = 'synced' ORDER BY synced_at DESC LIMIT 1`, [tenantId]);

  return {
    tenantId,
    schemaVersion: SCHEMA_VERSION,
    outbox: {
      pendentes: pendentesRow ? pendentesRow.total : 0,
      sincronizados: sincronizadosRow ? sincronizadosRow.total : 0,
      erros: errosRow ? errosRow.total : 0,
      processando: processandoRow ? processandoRow.total : 0,
      ultimoSincronismo: ultimoSync ? ultimoSync.synced_at : null
    }
  };
}

async function listarItensOutbox({ tenantId, status = null, limit = 50, offset = 0 }) {
  const lim = Math.max(1, Math.min(Number(limit) || 50, 200));
  const off = Math.max(0, Number(offset) || 0);
  let sql = 'SELECT * FROM erp_outbox WHERE tenant_id = ?';
  const params = [tenantId];

  if (status) {
    sql += ' AND status = ?';
    params.push(status);
  }

  sql += ' ORDER BY created_at ASC LIMIT ? OFFSET ?';
  params.push(lim, off);

  const rows = await all(sql, params);
  return (rows || []).map(r => ({
    id: r.id,
    tenantId: r.tenant_id,
    entityType: r.entity_type,
    entityId: r.entity_id,
    action: r.action,
    payload: JSON.parse(r.payload_json || '{}'),
    status: r.status,
    attempts: r.attempts,
    lastError: r.last_error,
    lockedBy: r.locked_by,
    lockedAt: r.locked_at,
    lockedUntil: r.locked_until,
    idempotencyKey: r.idempotency_key,
    syncedAt: r.synced_at,
    createdAt: r.created_at
  }));
}

async function reprocessarItemOutbox({ outboxId }) {
  if (!outboxId) throw new Error('outboxId é obrigatório.');
  await run(`UPDATE erp_outbox SET status = 'pending', last_error = NULL, locked_by = NULL, locked_at = NULL, locked_until = NULL WHERE id = ?`, [outboxId]);
  return { ok: true, outboxId };
}

async function adquirirProximoItemOutbox({ workerId = `worker_${crypto.randomBytes(4).toString('hex')}`, leaseSeconds = 60, tenantId = null, maxAttempts = 5, excludeIds = [] } = {}) {
  let sql = `SELECT id, tenant_id, entity_type, entity_id, action, payload_json, status, attempts, last_error, locked_by, locked_at, locked_until, idempotency_key, created_at 
             FROM erp_outbox 
             WHERE attempts < ? 
               AND (status IN ('pending', 'failed') OR (status = 'processing' AND (locked_until IS NULL OR datetime(locked_until) <= datetime('now'))))`;
  const params = [maxAttempts];

  if (tenantId && tenantId !== '_all_') {
    sql += ' AND tenant_id = ?';
    params.push(tenantId);
  }

  if (Array.isArray(excludeIds) && excludeIds.length > 0) {
    sql += ` AND id NOT IN (${excludeIds.map(() => '?').join(',')})`;
    params.push(...excludeIds);
  }

  sql += ' ORDER BY created_at ASC LIMIT 10';

  const candidates = await all(sql, params);
  for (const cand of candidates) {
    const lockRes = await run(
      `UPDATE erp_outbox 
       SET status = 'processing', 
           locked_by = ?, 
           locked_at = datetime('now'), 
           locked_until = datetime('now', '+' || ? || ' seconds')
       WHERE id = ? 
         AND (status IN ('pending', 'failed') OR (status = 'processing' AND (locked_until IS NULL OR datetime(locked_until) <= datetime('now'))))`,
      [workerId, leaseSeconds, cand.id]
    );

    if (lockRes.changes === 1) {
      return {
        id: cand.id,
        tenantId: cand.tenant_id,
        entityType: cand.entity_type,
        entityId: cand.entity_id,
        action: cand.action,
        payload: JSON.parse(cand.payload_json || '{}'),
        status: 'processing',
        attempts: cand.attempts,
        lastError: cand.last_error,
        lockedBy: workerId,
        leaseSeconds,
        idempotencyKey: cand.idempotency_key,
        createdAt: cand.created_at
      };
    }
  }

  return null;
}

async function finalizarItemOutbox({ outboxId, workerId, status = 'synced', errorMessage = null, incrementAttempts = true } = {}) {
  if (!outboxId || !workerId) {
    throw new Error('Parâmetros obrigatórios: outboxId, workerId.');
  }
  const now = new Date().toISOString();

  const attemptsClause = incrementAttempts ? 'attempts = attempts + 1,' : '';

  const updateRes = await run(
    `UPDATE erp_outbox 
     SET status = ?, 
         last_error = ?, 
         ${attemptsClause}
         synced_at = CASE WHEN ? = 'synced' THEN ? ELSE synced_at END, 
         locked_by = NULL, 
         locked_at = NULL, 
         locked_until = NULL 
     WHERE id = ? 
       AND locked_by = ? 
       AND datetime(locked_until) >= datetime('now')`,
    [status, errorMessage, status, now, outboxId, workerId]
  );

  if (updateRes.changes === 0) {
    throw new Error(`CONCURRENCY_ERROR: O lease do item ${outboxId} expirou ou foi assumido por outro worker.`);
  }

  return { ok: true, outboxId, status, syncedAt: status === 'synced' ? now : null };
}

async function processarFilaOutbox({ tenantId = null, maxAttempts = 5, dispatcherFn = null, workerId = null, leaseSeconds = 60, batchLimit = 100 } = {}) {
  const currentWorkerId = workerId || `worker_${crypto.randomBytes(4).toString('hex')}`;
  let processados = 0;
  let falhas = 0;
  let total = 0;
  const seenIds = [];

  while (seenIds.length < batchLimit) {
    const item = await adquirirProximoItemOutbox({
      workerId: currentWorkerId,
      leaseSeconds,
      tenantId,
      maxAttempts,
      excludeIds: seenIds
    });

    if (!item) {
      break;
    }

    seenIds.push(item.id);
    total++;

    if (typeof dispatcherFn !== 'function') {
      await run(
        `UPDATE erp_outbox 
         SET status = 'failed', 
             last_error = 'CONFIG_MISSING: Nenhum despachante/integrador ERP configurado', 
             locked_by = NULL, 
             locked_at = NULL, 
             locked_until = NULL 
         WHERE id = ? AND locked_by = ?`,
        [item.id, currentWorkerId]
      );
      falhas++;
      continue;
    }

    try {
      await dispatcherFn({
        id: item.id,
        tenantId: item.tenantId,
        entityType: item.entityType,
        entityId: item.entityId,
        action: item.action,
        payload: item.payload,
        idempotencyKey: item.idempotencyKey || `idemp_${item.id}`
      });

      await finalizarItemOutbox({
        outboxId: item.id,
        workerId: currentWorkerId,
        status: 'synced',
        errorMessage: null,
        incrementAttempts: true
      });
      processados++;
    } catch (err) {
      falhas++;
      try {
        await finalizarItemOutbox({
          outboxId: item.id,
          workerId: currentWorkerId,
          status: 'failed',
          errorMessage: err.message || 'Erro no envio ao ERP',
          incrementAttempts: true
        });
      } catch (finErr) {
        console.warn(`[ERP Outbox] Falha ao finalizar item ${item.id}: ${finErr.message}`);
      }
    }
  }

  return { total, processados, falhas };
}

module.exports = {
  enfileirarParaERP,
  registrarSincronizacao,
  obterStatusIntegracao,
  listarItensOutbox,
  reprocessarItemOutbox,
  adquirirProximoItemOutbox,
  finalizarItemOutbox,
  processarFilaOutbox
};
