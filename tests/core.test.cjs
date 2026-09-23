const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createWriteQueue, createAuth, isAdminPhone, validateState } = require('../lib/core');
const createStateHandler = require('../lib/state-route');
const { merge, clone } = require('../js/sync');
const response = () => ({ code: 200, headers: {}, setHeader(k,v) { this.headers[k]=v; }, status(code) { this.code=code; return this; }, json(body) { this.body=body; return this; } });

test('autenticação não aceita cabeçalhos forjados, chave na URL ou configuração vazia', () => {
  assert.throws(() => createAuth(''));
  const auth = createAuth('test-secret');
  for (const headers of [{}, {'sec-fetch-site':'same-origin'}, {origin:'http://localhost'}, {referer:'http://localhost'}, {'x-api-key':'errada'}]) {
    const res = response();
    auth({ headers: {host:'localhost', ...headers}, query:{apikey:'test-secret'}, method:'GET' }, res, () => assert.fail('Acesso indevido'));
    assert.equal(res.code,401);
  }
  let allowed = 0;
  for (const headers of [{'x-api-key':'test-secret'}, {authorization:'Basic '+Buffer.from('patio:test-secret').toString('base64')}]) {
    auth({headers, method:'GET'}, response(), () => allowed++);
  }
  assert.equal(allowed,2);
  const res = response();
  auth({headers:{'x-api-key':'test-secret',host:'localhost',origin:'http://localhost.evil.test'},method:'POST'},res,()=>assert.fail());
  assert.equal(res.code,403);
});

test('administrador exige DDD e número completos', () => {
  assert.equal(isAdminPhone('5562991234567',['62991234567']),true);
  assert.equal(isAdminPhone('5511991234567',['62991234567']),false);
  assert.equal(isAdminPhone('991234567',['62991234567']),false);
  assert.equal(isAdminPhone('', ['']),false);
});

test('política de senha respeita ambiente de teste por padrão e mantém produção estrita', () => {
  const { validatePasswordPolicy } = require('../lib/auth/userRepository');
  const original = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = 'test';
    assert.equal(validatePasswordPolicy('Patio1!').valid, true);
    assert.equal(validatePasswordPolicy('patio').valid, false);
    process.env.NODE_ENV = 'production';
    assert.equal(validatePasswordPolicy('Patio1!').valid, false);
  } finally {
    process.env.NODE_ENV = original;
  }
});

test('fila propaga falha e continua executando em ordem', async () => {
  const queue = createWriteQueue();
  const order = [];
  const first = queue(async () => { order.push(1); throw Error('disco cheio'); });
  const second = queue(async () => { order.push(2); return 'ok'; });
  await assert.rejects(first,/disco cheio/);
  assert.equal(await second,'ok');
  assert.deepEqual(order,[1,2]);
});

test('escritores concorrentes: apenas uma versão é aceita; falha não retorna sucesso', async () => {
  let state = {versao:1,os:[]};
  let revision = 1;
  let fail = false;
  const handler = createStateHandler({ enqueueWrite:createWriteQueue(), getState:()=>state, setState:s=>{state=s;},
    nextRevision:()=>++revision, persist:async()=>{ if(fail) throw Error('disco cheio'); } });
  const responses = [response(),response()];
  await Promise.all(responses.map((res,i)=>handler({body:{versao:1,os:[{id:'os'+i}]}},res)));
  assert.deepEqual(responses.map(r=>r.code),[200,409]);
  assert.equal(state.os[0].id,'os0');
  const before = clone(state);
  fail = true;
  const failed = response();
  await handler({body:{versao:state.versao,os:[]}},failed);
  assert.equal(failed.code,500);
  assert.deepEqual(state,before);
  fail = false;
  const recovered = response();
  await handler({body:{versao:state.versao,os:[]}},recovered);
  assert.equal(recovered.code,200);
});

test('validação rejeita coleções e versões inválidas', () => {
  for (const state of [null,[],{}, {os:[null]}, {os:[],pecas:{}}, {os:[],versao:'1'}, {os:[],cfg:[]}]) assert.ok(validateState(state));
  assert.equal(validateState({os:[],versao:1}),null);
});

test('concilia edições independentes, inclusões e exclusões em todas as coleções', () => {
  const base = {versao:1,os:[{id:'a',st:'fila',mec:'Ana'}],fornecedores:[{id:'f',nome:'Fornecedor'}],cfg:{hora:'07:30'}};
  const local = clone(base); local.os[0].mec='Bia'; local.fornecedores=[];
  const remote = clone(base); remote.versao=2; remote.os[0].st='executando'; remote.os.push({id:'b'}); remote.cfg.hora='08:00';
  const result = merge(base,local,remote);
  assert.deepEqual(result.conflicts,[]);
  assert.deepEqual(result.state.os,[{id:'a',st:'executando',mec:'Bia'},{id:'b'}]);
  assert.deepEqual(result.state.fornecedores,[]);
  assert.equal(result.state.cfg.hora,'08:00');
  assert.equal(result.state.versao,2);
});

test('conflitos no mesmo campo ou exclusão contra edição preservam o rascunho', () => {
  const base = {os:[{id:'a',st:'fila'}]};
  const local = {os:[{id:'a',st:'peca'}]};
  const remote = {os:[{id:'a',st:'executando'}]};
  assert.deepEqual(merge(base,local,remote).conflicts,['os[a].st']);
  assert.equal(merge(base,local,remote).state.os[0].st,'peca');
  assert.deepEqual(merge(base,{os:[]},remote).conflicts,['os[a]']);
});
