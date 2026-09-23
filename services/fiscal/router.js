'use strict';
const express=require('express');
const {rateLimit}=require('express-rate-limit');
const config=require('./fiscalConfigService');
const lifecycle=require('./fiscalLifecycleService');
const {reviewDocument}=require('./review');
const events=require('./fiscalEventService');
const {getState}=require('../../lib/repository/stateRepository');
const wrap=fn=>(req,res,next)=>Promise.resolve().then(()=>fn(req,res)).catch(next);
function createFiscalRouter(){
  const router=express.Router();
  router.use((req,res,next)=>{
    const c=req.securityContext;
    if(!c||c.actorType!=='user'||c.supportSession||['platform_support','service_admin'].includes(c.role)||c.tenantId==='_platform_')return res.status(403).json({error:'Acesso fiscal exige usuário da oficina.'});
    const permission=req.path.endsWith('/transmitir')?'fiscal:emit':req.path.endsWith('/cancelar')?'fiscal:cancel':req.path.endsWith('/cce')?'fiscal:correct':/\/(xml|pdf|exportar)$/.test(req.path)?'fiscal:export':req.method==='GET'?'fiscal:read':'fiscal:manage';
    if(!['admin','tenant_admin'].includes(c.role)&&!c.permissions?.includes(permission))return res.status(403).json({error:'Permissão fiscal insuficiente.'});
    if(req.method!=='GET'&&(req.headers['sec-fetch-site']==='cross-site'||req.headers.origin&&new URL(req.headers.origin).host!==req.headers.host))return res.status(403).json({error:'Origem não permitida.'});
    res.setHeader('Cache-Control','no-store');next();
  });
  router.use(rateLimit({windowMs:60000,limit:60,standardHeaders:true,legacyHeaders:false}));
  router.get('/monitoramento',wrap(async(req,res)=>{
    const db=require('../../db'),tenant=req.securityContext.tenantId;
    const docs=await db.all('SELECT status,COUNT(*) AS quantidade FROM fiscal_documents WHERE tenant_id=? GROUP BY status',[tenant]);
    const uncertain=await db.get("SELECT COUNT(*) AS quantidade FROM fiscal_documents WHERE tenant_id=? AND status IN ('transmitindo','processando') AND updated_at < ?",[tenant,new Date(Date.now()-15*60000).toISOString()]);
    const pending=await db.get("SELECT COUNT(*) AS quantidade FROM fiscal_events WHERE tenant_id=? AND status='processando'",[tenant]);
    res.json({productionBlocked:true,documents:docs,uncertainOlderThan15Minutes:uncertain.quantidade,pendingEvents:pending.quantidade,checkedAt:new Date().toISOString()});
  }));
  router.get('/config',wrap(async(req,res)=>res.json(await config.getPublicFiscalConfig(req.securityContext.tenantId))));
  router.put('/config',wrap(async(req,res)=>{
    if(!['admin','tenant_admin'].includes(req.securityContext.role))return res.status(403).json({error:'Configuração restrita ao administrador da oficina.'});
    const allowed=['ambiente','provider','cnpj','razaoSocial','nomeFantasia','inscricaoEstadual','inscricaoMunicipal','regimeTributario','cnaePrincipal','codigoMunicipioIbge','uf','nfeSerie','nfeProximoNumero','nfseSerie','nfseProximoNumero','regrasTributarias'];
    if(Object.keys(req.body).some(k=>!allowed.includes(k)))return res.status(400).json({error:'Configuração contém campos não permitidos. Segredos são provisionados no servidor.'});
    await config.saveFiscalConfig(req.securityContext.tenantId,req.body);
    await require('../../db').run("INSERT INTO security_audit_log(id,tenant_id,actor_id,actor_type,action,entity,entity_id,details_json,created_at) VALUES(?,?,?,'user','FISCAL_CONFIG_UPDATED','fiscal_config',?,'{}',?)",[require('crypto').randomUUID(),req.securityContext.tenantId,req.securityContext.actorId,req.securityContext.tenantId,new Date().toISOString()]);
    res.json(await config.getPublicFiscalConfig(req.securityContext.tenantId));
  }));
  router.get('/documentos',wrap(async(req,res)=>res.json(await lifecycle.listarDocumentosFiscais({tenantId:req.securityContext.tenantId,limit:Math.max(1,Math.min(100,Number(req.query.limit)||50)),offset:Math.max(0,Number(req.query.offset)||0)}))));
  router.post('/documentos',wrap(async(req,res)=>{
    const {modelo,destinatario,itens,descontoGeral,freteGeral,outrasDespesasGeral,idempotencyKey}=req.body;
    if(!Array.isArray(itens)||itens.length>100||typeof idempotencyKey!=='string'||!/^[\w-]{12,100}$/.test(idempotencyKey))return res.status(400).json({error:'Itens ou identificador da operação inválidos.'});
    res.status(201).json(await lifecycle.criarRascunhoDocumentoFiscal({tenantId:req.securityContext.tenantId,modelo,destinatario,itens,descontoGeral,freteGeral,outrasDespesasGeral,idempotencyKey}));
  }));
  router.post('/os/:id',wrap(async(req,res)=>{
    const state=await getState(req.securityContext.tenantId);
    const os=(state.os||[]).find(x=>String(x.id)===req.params.id);if(!os)return res.status(404).json({error:'OS não encontrada.'});
    res.json(await lifecycle.gerarDocumentosFiscaisDeOS({tenantId:req.securityContext.tenantId,os}));
  }));
  router.put('/documentos/:id',wrap(async(req,res)=>res.json(await lifecycle.atualizarRascunho({documentId:req.params.id,tenantId:req.securityContext.tenantId,destinatario:req.body.destinatario,itens:req.body.itens}))));
  router.get('/documentos/:id',wrap(async(req,res)=>{const doc=await lifecycle.obterDocumentoFiscalPorId(req.params.id,req.securityContext.tenantId);if(!doc)return res.status(404).json({error:'Documento não encontrado.'});res.json(doc);}));
  for(const [action,fn] of Object.entries({revisar:reviewDocument,transmitir:lifecycle.transmitirDocumentoFiscal,consultar:lifecycle.consultarSituacaoDocumentoFiscal}))router.post(`/documentos/:id/${action}`,wrap(async(req,res)=>res.json(await fn({documentId:req.params.id,tenantId:req.securityContext.tenantId,actorId:req.securityContext.actorId,usuario:req.securityContext.actorId}))));
  router.get('/documentos/:id/eventos',wrap(async(req,res)=>res.json(await events.listarEventosDocumento(req.params.id,req.securityContext.tenantId))));
  for(const [action,fn] of Object.entries({cancelar:events.cancelarDocumentoFiscal,cce:events.emitirCartaCorrecao}))router.post('/documentos/:id/'+action,wrap(async(req,res)=>res.json(await fn({documentId:req.params.id,tenantId:req.securityContext.tenantId,usuario:req.securityContext.actorId,justificativa:req.body.justificativa,correcao:req.body.correcao}))));
  router.get('/documentos/:id/exportar',wrap(async(req,res)=>{
    const tenantId=req.securityContext.tenantId,doc=await lifecycle.obterDocumentoFiscalPorId(req.params.id,tenantId);
    if(!doc)return res.status(404).json({error:'Documento não encontrado.'});
    const rows=await require('../../db').all('SELECT tipo_evento,sequencial,protocolo,status,detalhes_json FROM fiscal_events WHERE fiscal_document_id=? AND tenant_id=?',[doc.id,tenantId]);
    if(doc.xmlOficial && require('crypto').createHash('sha256').update(doc.xmlOficial).digest('hex')!==doc.xmlSha256)return res.status(409).json({error:'Integridade do XML não confirmada.'});
    res.setHeader('Content-Disposition','attachment; filename="exportacao-fiscal.json"');
    res.json({version:1,documento:doc,eventos:rows.map(e=>({...e,detalhes:JSON.parse(e.detalhes_json||'{}')}))});
  }));
  router.get('/documentos/:id/pdf',wrap(async(req,res)=>{
    const {get,run}=require('../../db'),crypto=require('crypto');
    const row=await get('SELECT * FROM fiscal_documents WHERE id=? AND tenant_id=?',[req.params.id,req.securityContext.tenantId]);
    if(!row?.danfe_url || !['autorizado','cancelado'].includes(row.status))return res.status(404).json({error:'Representação auxiliar ainda não disponível.'});
    let bytes=row.pdf_auxiliar,hash=row.pdf_sha256;
    if(!bytes){const conf=await require('./transmission').configuration(row);const adapter=require('./fiscalProviderAdapter').getFiscalProviderAdapter(conf.provider,conf.providerToken,row.ambiente);bytes=await adapter.downloadPdf(row.danfe_url);hash=crypto.createHash('sha256').update(bytes).digest('hex');await run('UPDATE fiscal_documents SET pdf_auxiliar=?,pdf_sha256=? WHERE id=? AND tenant_id=?',[bytes,hash,row.id,row.tenant_id]);}
    if(crypto.createHash('sha256').update(bytes).digest('hex')!==hash)return res.status(409).json({error:'Integridade do PDF não confirmada.'});
    res.setHeader('Content-Disposition','attachment; filename="representacao-auxiliar.pdf"');res.type('application/pdf').send(bytes);
  }));
  router.get('/documentos/:id/xml',wrap(async(req,res)=>{
    const doc=await lifecycle.obterDocumentoFiscalPorId(req.params.id,req.securityContext.tenantId);
    if(!doc?.xmlOficial)return res.status(404).json({error:'XML oficial ainda não recuperado.'});
    const hash=require('crypto').createHash('sha256').update(doc.xmlOficial).digest('hex');
    if(hash!==doc.xmlSha256)return res.status(409).json({error:'Integridade do XML não confirmada.'});
    res.setHeader('Content-Disposition',`attachment; filename="fiscal-${doc.id.replace(/[^a-zA-Z0-9_-]/g,'')}.xml"`);res.type('application/xml').send(doc.xmlOficial);
  }));
  router.use((error,req,res,next)=>{if(res.headersSent)return next(error);res.status(422).json({error:error.code?.startsWith('SQLITE')?'Falha de persistência fiscal. Nenhuma autorização foi presumida.':error.message});});
  return router;
}
module.exports={createFiscalRouter};
