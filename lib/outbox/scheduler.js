'use strict';

const crypto = require('crypto');
const { run, get, all } = require('../../db');

async function initOutboxTable() {
  await run(`
    CREATE TABLE IF NOT EXISTS job_outbox (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      data_ref TEXT NOT NULL,
      tipo TEXT NOT NULL,
      destino TEXT NOT NULL,
      status TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      error TEXT,
      message_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(tenant_id, data_ref, tipo, destino)
    )
  `);
  await run('CREATE INDEX IF NOT EXISTS idx_job_status ON job_outbox (status, attempts)');
}

async function agendarJob({ tenantId, dataRef, tipo, destino }) {
  if (!tenantId || !dataRef || !tipo || !destino) {
    throw new Error('Parâmetros obrigatórios: tenantId, dataRef, tipo, destino.');
  }
  const id = 'job_' + crypto.randomUUID();
  const agora = new Date().toISOString();

  try {
    await run(`
      INSERT INTO job_outbox (id, tenant_id, data_ref, tipo, destino, status, attempts, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'pending', 0, ?, ?)
    `, [id, tenantId, dataRef, tipo, destino, agora, agora]);
    return { ok: true, id, status: 'pending' };
  } catch (err) {
    if (String(err.message).includes('UNIQUE')) {
      const existing = await get(
        'SELECT id, status, message_id FROM job_outbox WHERE tenant_id = ? AND data_ref = ? AND tipo = ? AND destino = ?',
        [tenantId, dataRef, tipo, destino]
      );
      return { ok: true, id: existing?.id, status: existing?.status, duplicate: true };
    }
    throw err;
  }
}

async function processarProximoJob(adapter, { maxAttempts = 3 } = {}) {
  const agora = new Date().toISOString();

  // Reivindicação atômica do próximo job pendente
  const row = await get(`
    SELECT * FROM job_outbox
    WHERE status = 'pending' AND attempts < ?
    ORDER BY created_at ASC LIMIT 1
  `, [maxAttempts]);

  if (!row) return null;

  // Marca como 'processing' e incrementa tentativas
  await run(
    'UPDATE job_outbox SET status = \'processing\', attempts = attempts + 1, updated_at = ? WHERE id = ?',
    [agora, row.id]
  );

  try {
    const resultado = await adapter.enviar({
      jobId: row.id,
      tenantId: row.tenant_id,
      dataRef: row.data_ref,
      tipo: row.tipo,
      destino: row.destino
    });

    if (resultado && resultado.success && resultado.messageId) {
      await run(
        'UPDATE job_outbox SET status = \'completed\', message_id = ?, updated_at = ? WHERE id = ?',
        [resultado.messageId, new Date().toISOString(), row.id]
      );
      return { ok: true, jobId: row.id, status: 'completed', messageId: resultado.messageId };
    } else {
      throw new Error(resultado?.error || 'Envio não retornou confirmação de ID de mensagem.');
    }
  } catch (err) {
    const finalStatus = (row.attempts + 1 >= maxAttempts) ? 'failed' : 'pending';
    await run(
      'UPDATE job_outbox SET status = ?, error = ?, updated_at = ? WHERE id = ?',
      [finalStatus, String(err.message || err), new Date().toISOString(), row.id]
    );
    return { ok: false, jobId: row.id, status: finalStatus, error: err.message };
  }
}

module.exports = {
  initOutboxTable,
  agendarJob,
  processarProximoJob
};
