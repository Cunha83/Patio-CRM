'use strict';
const crypto = require('crypto');
const { get, run, all, transaction } = require('../../db');
const { configuration, ensureTransmissionAllowed } = require('./transmission');
const { getFiscalProviderAdapter } = require('./fiscalProviderAdapter');
const { obterDocumentoFiscalPorId, formatarDocumento } = require('./fiscalLifecycleService');

async function executeEvent({ documentId, tenantId, texto, tipo, usuario = 'operador' }) {
  ensureTransmissionAllowed();
  const max = tipo === 'cce' ? 1000 : 255;
  if (typeof texto !== 'string' || texto.trim().length < 15 || texto.trim().length > max) throw new Error(`Texto deve possuir no mínimo 15 caracteres e no máximo ${max}.`);
  const pending = await transaction(async () => {
    const row = await get('SELECT * FROM fiscal_documents WHERE id=? AND tenant_id=?', [documentId, tenantId]);
    if (!row || row.status !== 'autorizado') throw new Error('Evento exige documento autorizado da oficina.');
    if (tipo === 'cce' && row.modelo !== '55') throw new Error('CC-e disponível somente para NF-e modelo 55.');
    if (row.operation_id) throw new Error('Operação em andamento; consulte a situação antes de prosseguir.');
    const unresolved = await get("SELECT id FROM fiscal_events WHERE fiscal_document_id=? AND tenant_id=? AND status='processando'", [documentId, tenantId]);
    if (unresolved) throw new Error('Evento com resultado incerto. Reconcilie junto ao provedor antes de criar outro.');
    const config = await configuration(row);
    getFiscalProviderAdapter(config.provider, config.providerToken, row.ambiente);
    const count = await get('SELECT COALESCE(MAX(sequencial),0) AS n FROM fiscal_events WHERE fiscal_document_id=? AND tenant_id=? AND tipo_evento=?', [documentId, tenantId, tipo]);
    const sequencial = count.n + 1;
    if (tipo === 'cce' && sequencial > 20) throw new Error('Limite de 20 CC-e atingido.');
    const id = crypto.randomUUID(), now = new Date().toISOString();
    await run("INSERT INTO fiscal_events(id,tenant_id,fiscal_document_id,tipo_evento,sequencial,justificativa,detalhes_json,status,created_at) VALUES(?,?,?,?,?,?,?,'processando',?)", [id,tenantId,documentId,tipo,sequencial,texto.trim(),JSON.stringify({actorId:usuario}),now]);
    await run('UPDATE fiscal_documents SET operation_id=?,operation_started_at=? WHERE id=? AND tenant_id=?', [id,now,documentId,tenantId]);
    return {row,config,id,sequencial};
  });
  const { row, config, id, sequencial } = pending;
  try {
    const adapter = getFiscalProviderAdapter(config.provider,config.providerToken,row.ambiente);
    const doc = formatarDocumento(row);
    const result = tipo === 'cce'
      ? await adapter.enviarCCE({doc,correcao:texto.trim(),sequencial,config})
      : await adapter.cancelarDocumento({doc,justificativa:texto.trim(),config});
    const protocol = tipo === 'cce' ? result.protocoloCCE : result.protocoloCancelamento;
    const confirmed = result.ok === true && Boolean(protocol);
    await transaction(async () => {
      await run('UPDATE fiscal_events SET status=?,protocolo=?,detalhes_json=? WHERE id=? AND tenant_id=?', [confirmed?'autorizado':'processando',protocol || null,JSON.stringify(result),id,tenantId]);
      if (confirmed && tipo === 'cancelamento') await run("UPDATE fiscal_documents SET status='cancelado',updated_at=? WHERE id=? AND tenant_id=? AND operation_id=?", [new Date().toISOString(),documentId,tenantId,id]);
      await run("INSERT INTO security_audit_log(id,tenant_id,actor_id,actor_type,action,entity,entity_id,details_json,created_at) VALUES(?,?,?,'user','FISCAL_EVENT_RESULT','fiscal_document',?,?,?)", [crypto.randomUUID(),tenantId,usuario,documentId,JSON.stringify({eventId:id,tipo,confirmed}),new Date().toISOString()]);
    });
    return {ok:confirmed,status:confirmed?(tipo==='cce'?'autorizado':'cancelado'):'processando',sequencial,protocolo:protocol,eventId:id,documento:await obterDocumentoFiscalPorId(documentId,tenantId)};
  } finally {
    // A tentativa permanece registrada mesmo quando a rede falha. Nunca repetir automaticamente.
    await run('UPDATE fiscal_documents SET operation_id=NULL WHERE id=? AND tenant_id=? AND operation_id=?', [documentId,tenantId,id]);
  }
}
const cancelarDocumentoFiscal = args => executeEvent({...args,texto:args.justificativa,tipo:'cancelamento'});
const emitirCartaCorrecao = args => executeEvent({...args,texto:args.correcao,tipo:'cce'});
async function listarEventosDocumento(documentId,tenantId) {
  const rows=await all('SELECT * FROM fiscal_events WHERE fiscal_document_id=? AND tenant_id=? ORDER BY created_at',[documentId,tenantId]);
  return rows.map(r=>({id:r.id,tipoEvento:r.tipo_evento,sequencial:r.sequencial,protocolo:r.protocolo,justificativa:r.justificativa,status:r.status,createdAt:r.created_at}));
}
module.exports={cancelarDocumentoFiscal,emitirCartaCorrecao,listarEventosDocumento};
