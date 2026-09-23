const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const PatioSync = require('../js/sync');
function frontend(fetch) {
  const storage = new Map();
  const nodes = new Map();
  const element = () => ({style:{},setAttribute(){},appendChild(){},replaceChildren(){},remove(){nodes.delete('sync-error');}});
  const context = vm.createContext({
    PatioSync,fetch,console,setTimeout,clearTimeout,Blob,URL,
    window:{addEventListener(){},confirm(){return false;}},
    document:{getElementById:id=>nodes.get(id),createElement:element,body:{appendChild:e=>nodes.set(e.id,e)}},
    localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)}
  });
  const source = fs.readFileSync(path.join(__dirname,'../js/state.js'),'utf8');
  vm.runInContext(source+`;globalThis.testAPI={armazem,flushSave,salvar,storageKey:CHAVE_RASCUNHO,
    init(state,base=state){S=state;armazem.base=PatioSync.clone(base);pendingLocalSave=true;},
    edit(fn){fn(S);localGeneration++;}, get state(){return S;},get pending(){return pendingLocalSave;}};`,context);
  return {api:context.testAPI,storage};
}
const response = (status,body) => ({status,ok:status>=200&&status<300,json:async()=>body});

test('falha de rede mantém rascunho recuperável e bloqueia sincronização', async () => {
  const {api,storage}=frontend(async()=>{throw Error('offline');});
  api.init({versao:1,os:[{id:'a',st:'peca'}]});
  await api.flushSave();
  assert.equal(api.pending,true);
  assert.equal(JSON.parse(storage.get(api.storageKey)).state.os[0].st,'peca');
  const recovered=await api.armazem.ler();
  assert.equal(recovered.os[0].st,'peca');
});

test('409 concilia edições independentes e confirma a nova versão', async () => {
  const base={versao:1,os:[{id:'a',st:'fila',mec:'Ana'}]};
  const local=PatioSync.clone(base);local.os[0].mec='Bia';
  const remote=PatioSync.clone(base);remote.versao=2;remote.os[0].st='executando';
  let writes=0;
  const {api,storage}=frontend(async(url,options)=>{
    if(!options) return response(200,remote);
    if(++writes===1) return response(409,{});
    const sent=JSON.parse(options.body);
    assert.equal(sent.versao,2); assert.equal(sent.os[0].mec,'Bia'); assert.equal(sent.os[0].st,'executando');
    return response(200,{versao:3});
  });
  api.init(local,base);await api.flushSave();
  assert.equal(writes,2);assert.equal(api.pending,false);
  assert.equal(api.state.versao,3);assert.equal(storage.has(api.storageKey),false);
});

test('conflito no mesmo campo não reenvia nem descarta a edição', async () => {
  const base={versao:1,os:[{id:'a',st:'fila'}]};
  let writes=0;
  const {api}=frontend(async(url,options)=>{
    if(options){writes++;return response(409,{});}
    return response(200,{versao:2,os:[{id:'a',st:'executando'}]});
  });
  api.init({versao:1,os:[{id:'a',st:'peca'}]},base);await api.flushSave();
  assert.equal(writes,1);assert.equal(api.pending,true);assert.equal(api.state.os[0].st,'peca');
});

test('digitação durante envio é salva depois, sem requisições sobrepostas', async () => {
  let unblock,started;
  const ready=new Promise(r=>{started=r;});
  const payloads=[];
  const {api}=frontend(async(url,options)=>{
    payloads.push(JSON.parse(options.body));
    if(payloads.length===1){started();await new Promise(r=>{unblock=r;});}
    return response(200,{versao:payloads.length+1});
  });
  api.init({versao:1,os:[{id:'a',mec:'Ana'}]});
  const saving=api.flushSave();await ready;
  api.edit(s=>{s.os[0].mec='Bia';});
  await api.flushSave();assert.equal(payloads.length,1);
  unblock();await saving;
  assert.equal(payloads.length,2);assert.equal(payloads[1].os[0].mec,'Bia');
  assert.equal(payloads[1].versao,2);assert.equal(api.pending,false);
});
