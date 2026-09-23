'use strict';
// Executado ANTES dos imports de cada arquivo de teste pelo runner.
const fs=require('fs'),path=require('path'),os=require('os');
process.env.NODE_ENV='test';
process.env.DISABLE_INTEGRATIONS='true';
process.env.FISCAL_FOCUS_TOKENS='{}';
if(process.env.NODE_TEST_CONTEXT){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'patio-suite-'));
  process.env.DB_PATH=path.join(root,'test.db');
  process.env.BACKUP_DIR=path.join(root,'backups');
  process.env.UPLOAD_DIR=path.join(root,'uploads');
  for(const name of ['backups','uploads'])fs.mkdirSync(path.join(root,name));
  process.on('exit',()=>{if(fs.realpathSync(root).startsWith(fs.realpathSync(os.tmpdir())+path.sep)){try{fs.rmSync(root,{recursive:true,force:true});}catch(_){}}});
}
const originalFetch=global.fetch;
global.fetch=(input,options)=>{
  const url=new URL(typeof input==='string'||input instanceof URL?input:input.url);
  if(!['127.0.0.1','localhost','[::1]'].includes(url.hostname))return Promise.reject(Error('TEST_NETWORK_GUARD: destino externo bloqueado.'));
  return originalFetch(input,options);
};
