'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),os=require('os'),path=require('path'),crypto=require('crypto'),net=require('net');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'patio-security-fixes-'));
process.env.DB_PATH=path.join(root,'test.db');
const db=require('../db');
const repo=require('../lib/repository/stateRepository');
const {ROLE_PERMISSIONS}=require('../lib/auth/userRepository');
const {createAuthMiddleware}=require('../lib/auth/context');
const {createRemoteVaultServer}=require('../scripts/servico_backup_remoto.cjs');
const {assertIndependentDestination}=require('../scripts/executar_backup_operacional.cjs');

test('Regressões das cinco falhas da auditoria',async t=>{
 await db.initDB();t.after(async()=>{await db.closeDB();fs.rmSync(root,{recursive:true,force:true});});
 await t.test('Estado: mecânico não altera clientes nem exclui OS; atendente edita e admin exclui',async()=>{
  const tenantId='fixes_test';const admin={tenantId,role:'tenant_admin',permissions:ROLE_PERMISSIONS.tenant_admin};
  const mec={tenantId,role:'mecanico',permissions:ROLE_PERMISSIONS.mecanico};
  const attendant={tenantId,role:'atendente',permissions:ROLE_PERMISSIONS.atendente};
  const s=repo.getDefaultState();s.os=[{id:'o1',num:1,total:123}];s.clientes=[{id:'c1',nome:'Original'}];s.veiculos=[{id:'v1',placa:'ABC1234'}];await repo.persistState(admin,s);
  const original=await repo.getState(tenantId);
  for(const field of ['os','clientes','veiculos']){const malicious=repo.filterStateByRole(original,mec);malicious[field]=[];assert.equal((await repo.persistState(mec,malicious,{authorizeReplacement:true})).status,403);assert.deepEqual(await repo.getState(tenantId),original);}
  const same=repo.filterStateByRole(original,mec);assert.equal((await repo.persistState(mec,same,{authorizeReplacement:true})).ok,true);
  const progress=repo.filterStateByRole(await repo.getState(tenantId),mec);progress.os[0].st='executando';assert.equal((await repo.persistState(mec,progress,{authorizeReplacement:true})).ok,true);
  const forbidden=repo.filterStateByRole(await repo.getState(tenantId),mec);forbidden.os[0].num=999;assert.equal((await repo.persistState(mec,forbidden,{authorizeReplacement:true})).status,403);
  let next=repo.filterStateByRole(await repo.getState(tenantId),attendant);next.clientes[0].nome='Permitido';assert.equal((await repo.persistState(attendant,next,{authorizeReplacement:true})).ok,true);
  next=repo.filterStateByRole(await repo.getState(tenantId),attendant);next.os=[];assert.equal((await repo.persistState(attendant,next,{authorizeReplacement:true})).status,403);
  next=await repo.getState(tenantId);next.os=[];assert.equal((await repo.persistState(admin,next,{authorizeReplacement:true})).ok,true);
 });
 await t.test('Plataforma: suporte limitado e origem verificada para suporte e administrador',async()=>{
  async function auth(role,url,method='GET',headers={}){const mw=createAuthMiddleware({authenticate:()=>({actorType:'user',actorId:'test',memberships:[{role,permissions:ROLE_PERMISSIONS[role]}]})});const req={path:url,method,headers:{host:'localhost',...headers}};let status=200,allowed=false;await mw(req,{setHeader(){},status(s){status=s;return this},json(){return this}},()=>allowed=true);return {status,allowed,ctx:req.securityContext};}
  const read=await auth('platform_support','/api/platform/status');assert.equal(read.allowed,true);assert.equal(read.ctx.permissions.includes('*'),false);
  assert.equal((await auth('platform_support','/api/platform/reconcile','POST')).status,403);
  assert.equal((await auth('platform_support','/api/platform/support/impersonate','POST')).allowed,true);
  assert.equal((await auth('platform_admin','/api/platform/reconcile','POST')).allowed,true);
  for(const role of ['platform_admin','platform_support'])assert.equal((await auth(role,'/api/platform/reconcile','POST',{origin:'https://evil.invalid','sec-fetch-site':'cross-site'})).status,403);
 });
 await t.test('Destino remoto: loopback IPv4/IPv6 e URLs inválidas bloqueados',()=>{
  const oldSame=process.env.ALLOW_SAME_DISK_BACKUP,oldLocal=process.env.ALLOW_LOCAL_REMOTE_VAULT_IN_TEST;delete process.env.ALLOW_SAME_DISK_BACKUP;delete process.env.ALLOW_LOCAL_REMOTE_VAULT_IN_TEST;
  try{for(const u of ['http://[::1]:3005/','http://[0:0:0:0:0:0:0:1]/','http://[::ffff:127.0.0.1]/','http://localhost./','http://127.1/','invalid','file:///C:/backup'])assert.throws(()=>assertIndependentDestination(root,null,u),/DESTINO_INVALIDO/);assert.doesNotThrow(()=>assertIndependentDestination(root,null,'https://backup.example.com/upload'));}finally{if(oldSame!==undefined)process.env.ALLOW_SAME_DISK_BACKUP=oldSame;if(oldLocal!==undefined)process.env.ALLOW_LOCAL_REMOTE_VAULT_IN_TEST=oldLocal;}
 });
 await t.test('Cofre: rejeita caminhos perigosos e pacotes incompletos sem destruir backups; aceita pacote íntegro',async()=>{
  const probe=net.createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));
  const vaultDir=path.join(root,'vault');const vault=createRemoteVaultServer({vaultDir,port,token:'test-private-token'});await vault.start();
  const sentinel=path.join(vaultDir,'previous.txt');fs.writeFileSync(sentinel,'preservar');
  const buffer=Buffer.from('SQLite format 3\0synthetic fixture');const hash=crypto.createHash('sha256').update(buffer).digest('hex');
  const valid={backupId:'test_1',packageFolderName:'package_test_1',manifest:{files:{'patio.db':{size:buffer.length,sha256:hash}}},files:{'patio.db':buffer.toString('base64')}};
  async function send(payload){const r=await fetch(`http://127.0.0.1:${port}/api/remote-vault/upload`,{method:'POST',headers:{Authorization:'Bearer test-private-token','Content-Type':'application/json'},body:JSON.stringify(payload)});return {status:r.status,body:await r.json()};}
  try{
   for(const name of ['.','..','../outside','package_/../outside','package_bad/name']){assert.equal((await send({...valid,packageFolderName:name})).status,400);assert.equal(fs.readFileSync(sentinel,'utf8'),'preservar');}
   for(const override of [{files:{}},{manifest:{files:{}}},{files:{...valid.files,'uploads/extra.txt':'eA=='}},{manifest:{files:{'patio.db':{size:1,sha256:hash}}}},{manifest:{files:{'patio.db':{size:buffer.length}}}}])assert.equal((await send({...valid,...override})).status,400);
   assert.equal((await send(valid)).status,200);assert.deepEqual(fs.readFileSync(path.join(vaultDir,'package_test_1','patio.db')),buffer);
   assert.equal((await send(valid)).status,409);assert.equal(fs.readFileSync(sentinel,'utf8'),'preservar');assert.deepEqual(fs.readFileSync(path.join(vaultDir,'package_test_1','patio.db')),buffer);
  }finally{await vault.stop();}
 });
});
