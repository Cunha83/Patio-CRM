'use strict';
const crypto=require('crypto');
const {get,run,transaction}=require('../../db');
const {getFiscalConfig}=require('./fiscalConfigService');
const {getFiscalProviderAdapter}=require('./fiscalProviderAdapter');
const {alocarProximoNumeroFiscal}=require('./fiscalNumberingService');
const format=row=>require('./fiscalLifecycleService').formatarDocumento(row);
const testFixture=config=>process.env.NODE_TEST_CONTEXT && process.env.FISCAL_TEST_ADAPTER==='enabled' && config.provider==='mock_homologacao';
async function configuration(row) {
  const current=await getFiscalConfig(row.tenant_id);
  if (row.ambiente!=='homologacao') throw new Error('Produção fiscal bloqueada.');
  if (!testFixture(current) && (!row.reviewed_at || !row.config_snapshot_json)) throw new Error('Revise o documento fiscal antes de transmitir.');
  const frozen=row.config_snapshot_json?JSON.parse(row.config_snapshot_json):current;
  if (frozen.cnpj!==current.cnpj || frozen.provider!==current.provider) throw new Error('Emitente ou provedor alterado. Não transmita; revise a configuração.');
  return {...frozen,providerToken:current.providerToken};
}
async function persistResult(row,result,adapter,actorId) {
  let xml=result.xmlOficial || (result.status==='autorizado' ? row.xml_oficial : null);
  if (result.xmlPath && adapter.downloadXml) xml=await adapter.downloadXml(result.xmlPath);
  const recoveredEvents=[];
  if(adapter.eventArtifact) {
    for(const [path,type,code,seq] of [[result.cancelXmlPath,'cancelamento','110111',1],[result.correctionXmlPath,'cce','110110',result.correctionSequence]]) {
      if(path) { const artifact=await adapter.eventArtifact(path,{...format(row),chaveAcesso:result.chaveAcesso || row.chave_acesso},code); if(artifact.protocol)recoveredEvents.push({type,seq,artifact}); }
    }
  }
  let status=result.status;
  if(status==='cancelado' && adapter.eventArtifact && !recoveredEvents.some(e=>e.type==='cancelamento')) throw new Error('Cancelamento informado, mas protocolo do evento ainda não recuperado.');
  if (!['autorizado','cancelado','rejeitado','processando'].includes(status)) status='processando';
  if (status==='autorizado' && !xml) status='processando';
  let protocol=result.protocolo || null;
  if (xml && row.modelo==='55') {
    if (!xml.includes(result.chaveAcesso || '__missing__') || /<!ENTITY|<!DOCTYPE/i.test(xml)) throw new Error('XML não corresponde ao documento consultado.');
    const conf=await configuration(row);
    if(!testFixture(conf)) {
      const key=String(result.chaveAcesso||'');
      if(key.slice(6,20)!==conf.cnpj || key.slice(20,22)!=='55' || Number(key.slice(22,25))!==Number(row.serie) || Number(key.slice(25,34))!==Number(row.numero) || !/<(?:\w+:)?tpAmb>2<\//.test(xml) || !/<(?:\w+:)?cStat>100<\//.test(xml)) throw new Error('XML não corresponde ao emitente, modelo, série, número ou ambiente esperado.');
    }
    protocol=protocol || xml.match(/<(?:\w+:)?nProt>(\d+)<\//)?.[1] || null;
    if (!protocol) status='processando';
  }
  await transaction(async()=>{
    const now=new Date().toISOString();
    await run('UPDATE fiscal_attempts SET status=?,finished_at=?,result_json=? WHERE id=? AND tenant_id=?',[status,now,JSON.stringify({status,chaveAcesso:result.chaveAcesso,protocolo:protocol,codigo:result.codigoStatus}),row.operation_id,row.tenant_id]);
    const updated=await run(`UPDATE fiscal_documents SET status=?,chave_acesso=COALESCE(?,chave_acesso),protocolo_autorizacao=COALESCE(?,protocolo_autorizacao),xml_oficial=COALESCE(?,xml_oficial),xml_sha256=COALESCE(?,xml_sha256),xml_path=COALESCE(?,xml_path),numero_oficial=COALESCE(?,numero_oficial),danfe_url=COALESCE(?,danfe_url),codigo_status_sefaz=?,motivo_status_sefaz=?,data_autorizacao=COALESCE(data_autorizacao,?),operation_id=NULL,updated_at=? WHERE id=? AND tenant_id=? AND operation_id=? `,
      [status,result.chaveAcesso,protocol,xml,xml?crypto.createHash('sha256').update(xml).digest('hex'):null,result.xmlPath || null,result.remoteNumber || null,result.danfeUrl || null,result.codigoStatus || null,result.motivoStatus || null,status==='autorizado'?now:null,now,row.id,row.tenant_id,row.operation_id]);
    for(const event of recoveredEvents) {
      const pending=await get('SELECT id FROM fiscal_events WHERE tenant_id=? AND fiscal_document_id=? AND tipo_evento=? AND sequencial=?',[row.tenant_id,row.id,event.type,event.seq]);
      if(pending) await run("UPDATE fiscal_events SET status='autorizado',protocolo=?,detalhes_json=? WHERE id=? AND tenant_id=?",[event.artifact.protocol,JSON.stringify(event.artifact),pending.id,row.tenant_id]);
      else await run("INSERT INTO fiscal_events(id,tenant_id,fiscal_document_id,tipo_evento,sequencial,protocolo,detalhes_json,status,created_at) VALUES(?,?,?,?,?,?,?,'autorizado',?)",[crypto.randomUUID(),row.tenant_id,row.id,event.type,event.seq,event.artifact.protocol,JSON.stringify(event.artifact),now]);
    }
    if(updated.changes!==1) throw new Error('Resultado concorrente: consulte novamente a situação.');
    await run(`INSERT INTO security_audit_log(id,tenant_id,actor_id,actor_type,action,entity,entity_id,details_json,created_at) VALUES(?,?,?,'user','FISCAL_RESULT','fiscal_document',?,?,?)`,[crypto.randomUUID(),row.tenant_id,actorId,row.id,JSON.stringify({status,simulated:Boolean(testFixture(await getFiscalConfig(row.tenant_id)))}),now]);
  });
  return {ok:status==='autorizado',status,documento:format(await get('SELECT * FROM fiscal_documents WHERE id=? AND tenant_id=?',[row.id,row.tenant_id]))};
}
function ensureTransmissionAllowed() {
  if(require('fs').existsSync(require('path').resolve(process.env.DB_PATH || 'patio.db') + '.fiscal-recovery-required')) throw new Error('Banco restaurado: transmissão bloqueada até reconciliação externa.');
}
async function transmitirDocumentoFiscal({documentId,tenantId,usuario='sistema'}) {
  ensureTransmissionAllowed();
  const row=await transaction(async()=>{
    const r=await get('SELECT * FROM fiscal_documents WHERE id=? AND tenant_id=?',[documentId,tenantId]);
    if(!r)throw new Error('Documento fiscal não encontrado.');
    if(r.status==='autorizado')return r;
    if(r.status==='cancelado')throw new Error('Documento cancelado não pode ser retransmitido.');
    if(r.status!=='rascunho')throw new Error('Documento já transmitido ou com resultado incerto. Consulte antes de qualquer nova emissão.');
    const conf=await configuration(r);
    getFiscalProviderAdapter(conf.provider,conf.providerToken,r.ambiente);
    const allocated=r.numero>0?{numero:r.numero}:await alocarProximoNumeroFiscal({tenantId,modelo:r.modelo,serie:r.serie,ambiente:r.ambiente});
    r.numero=allocated.numero;r.operation_id=crypto.randomUUID();
    await run("INSERT INTO fiscal_attempts(id,tenant_id,document_id,operation,status,started_at) VALUES(?,?,?,'emitir','pendente',?)",[r.operation_id,tenantId,r.id,new Date().toISOString()]);
    await run("UPDATE fiscal_documents SET numero=?,status='transmitindo',operation_id=?,operation_started_at=?,updated_at=? WHERE id=? AND tenant_id=?",[r.numero,r.operation_id,new Date().toISOString(),new Date().toISOString(),r.id,tenantId]);
    return r;
  });
  if(row.status==='autorizado')return {ok:true,jaAutorizado:true,documento:format(row)};
  const config=await configuration(row),adapter=getFiscalProviderAdapter(config.provider,config.providerToken,row.ambiente);
  try {return await persistResult(row,await adapter.emitirDocumento({doc:format(row),config}),adapter,usuario);}
  catch(error){await run("UPDATE fiscal_documents SET status='processando',operation_id=NULL,mensagem_erro='Resultado incerto. Consulte o provedor antes de reenviar.' WHERE id=? AND tenant_id=? AND operation_id=?",[row.id,tenantId,row.operation_id]);throw error;}
}
async function consultarSituacaoDocumentoFiscal({documentId,tenantId,usuario='sistema'}) {
  const row=await transaction(async()=>{
    const r=await get('SELECT * FROM fiscal_documents WHERE id=? AND tenant_id=?',[documentId,tenantId]);
    if(!r)throw new Error('Documento fiscal não encontrado.');
    if(r.status==='rascunho')throw new Error('Documento sem consulta externa pendente.');
    if(r.operation_id && Date.parse(r.operation_started_at)>Date.now()-60000)throw new Error('Operação em andamento. Aguarde para consultar.');
    r.operation_id=crypto.randomUUID();await run("INSERT INTO fiscal_attempts(id,tenant_id,document_id,operation,status,started_at) VALUES(?,?,?,'consultar','pendente',?)",[r.operation_id,tenantId,r.id,new Date().toISOString()]);await run('UPDATE fiscal_documents SET operation_id=?,operation_started_at=? WHERE id=? AND tenant_id=?',[r.operation_id,new Date().toISOString(),r.id,tenantId]);return r;
  });
  try {
    const config=await configuration(row),adapter=getFiscalProviderAdapter(config.provider,config.providerToken,row.ambiente);
    const result=await adapter.consultarSituacao({doc:format(row),config});
    if(row.status==='cancelado' && result.status!=='cancelado')throw new Error('Retorno fora de ordem: cancelamento anterior preservado.');
    if(row.status==='autorizado' && !['autorizado','cancelado'].includes(result.status))throw new Error('Consulta inconclusiva; autorização anterior preservada.');
    return await persistResult(row,result,adapter,usuario);
  } finally {await run('UPDATE fiscal_documents SET operation_id=NULL WHERE id=? AND tenant_id=? AND operation_id=?',[row.id,tenantId,row.operation_id]);}
}
module.exports={transmitirDocumentoFiscal,consultarSituacaoDocumentoFiscal,configuration,ensureTransmissionAllowed};
