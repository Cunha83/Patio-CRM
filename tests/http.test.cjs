const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');

test('servidor real: autenticação, concorrência, backup, upload e persistência', {timeout:120000}, async t => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(),'patio-crm-test-'));
  const probe = net.createServer();
  probe.listen(0,'127.0.0.1'); await once(probe,'listening');
  const port = probe.address().port; await new Promise(r=>probe.close(r));
  const root = path.resolve(__dirname,'..');
  let logs = '';
  let child;
  async function start() {
    child = spawn(process.execPath,['server.js'], {cwd:root, windowsHide:true,
      env:{...process.env, PORT:String(port), API_KEY:'integration-test-key', GEMINI_API_KEY:'',
        DISABLE_INTEGRATIONS:'true', DB_PATH:path.join(temp,'test.db')} });
    child.stdout.on('data',d=>{logs+=d;}); child.stderr.on('data',d=>{logs+=d;});
    for (let i=0;i<500;i++) {
      if (child.exitCode !== null) throw Error(logs);
      try { const res=await fetch(`http://127.0.0.1:${port}/`); if(res.status===401) return; } catch (_) {}
      await new Promise(r=>setTimeout(r,100));
    }
    throw Error('Servidor não iniciou: '+logs);
  }
  async function stop() { if(child && child.exitCode===null) { const done=once(child,'exit'); child.kill(); await done; } }
  t.after(async()=>{await stop(); fs.rmSync(temp,{recursive:true,force:true});});
  await start();
  const api = (url,options={})=>fetch(`http://127.0.0.1:${port}${url}`,{
    ...options,headers:{'x-api-key':'integration-test-key',...options.headers}});
  const post = (url,body)=>api(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  for (const route of ['/api/estado','/api/backup/download','/api/whatsapp/qr.png','/api/whatsapp/config-grupos']) {
    const res=await fetch(`http://127.0.0.1:${port}${route}`,{headers:{'sec-fetch-site':'same-origin'}});
    assert.equal(res.status,401,route);
  }
  assert.equal((await api('/')).status,200);
  assert.equal((await api('/server.js')).status,403);
  assert.equal((await api('/lib/core.js')).status,403);
  assert.equal((await api('/workspace%20CRM%20Oficina.code-workspace')).status,404);
  assert.equal((await api('/api/backup/download')).status,200);
  assert.equal((await post('/api/estado',{os:[],versao:0})).status,200);
  let state=await (await api('/api/estado')).json();
  const both=await Promise.all([post('/api/estado',{...state,clientes:[{id:'a'}]}),post('/api/estado',{...state,clientes:[{id:'b'}]})]);
  assert.deepEqual(both.map(r=>r.status).sort(),[200,409]);
  state=await (await api('/api/estado')).json();
  assert.equal((await post('/api/estado',{...state,os:'invalid'})).status,400);
  const big='x'.repeat(3*1024*1024);
  assert.equal((await post('/api/estado',{...state,nota:big})).status,200,'estado maior que 2 MB');
  assert.equal((await post('/api/upload-nota',{imagemBase64:big})).status,500,'chega à rota sem IA, não recebe 413');
  state=await (await api('/api/estado')).json();
  assert.equal((await post('/api/backup/importar',{dados:{os:[],nota:big},modo:'substituir',versao:state.versao})).status,200);
  assert.equal((await post('/api/backup/importar',{dados:{os:[]},modo:'substituir',versao:state.versao})).status,409);
  const saved=await (await api('/api/estado')).json();
  assert.equal(saved.nota.length,big.length);
  const broken = await post('/api/backup/importar',{modo:'mesclar',versao:saved.versao,
    dados:{clientes:[{id:'good',nome:'Teste'},{id:'bad',doc:123}]}});
  assert.equal(broken.status,500);
  assert.deepEqual(await (await api('/api/estado')).json(),saved,'importação com erro não publica alterações parciais');
  // Validações de regressão P0-1, P0-3 e P1-5
  const healthRes = await (await fetch(`http://127.0.0.1:${port}/health`)).json();
  assert.equal(healthRes.version, require('../package.json').version);

  // Backup físico exige ator de plataforma com backup:global; chave comum recebe 403
  const traversalRestore = await post('/api/backup/restaurar', { backupFilepath: '../../etc/passwd' });
  assert.equal(traversalRestore.status, 403);

  const unauthPostEstado = await fetch(`http://127.0.0.1:${port}/api/estado`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'sec-fetch-site': 'same-origin' },
    body: JSON.stringify({ os: [], versao: 0 })
  });
  assert.equal(unauthPostEstado.status, 401);

  await stop(); await start();
  assert.deepEqual(await (await api('/api/estado')).json(),saved,'SQLite preserva o estado após reinício');
  assert.ok(!logs.includes('[WhatsApp] Inicializando'));
});
