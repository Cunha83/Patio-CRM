'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const express = require('express');
const { SupportRepository } = require('../services/support/repository');
const { SupportAgent } = require('../services/support/agent');
const { createSupportRouter } = require('../services/support/router');
const { messageText } = require('../services/support/privacy');
const key = () => crypto.randomUUID();
const alice = { tenantId: 'office-a', actorId: 'alice', actorType: 'user', role: 'tenant_admin' };
async function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'patio-support-test-'));
  const repository = new SupportRepository({ filename: path.join(dir, 'test.sqlite') });
  t.after(async () => { await repository.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  return repository;
}
test('orientação verificada, encaminhamento urgente e ausência de execução', async () => {
  const agent = new SupportAgent();
  assert.equal((await agent.answer('preciso de ajuda com estoque')).references[0].id, 'estoque');
  const urgent = await agent.answer('vejo dados de outra oficina');
  assert.equal(urgent.priority, 'urgent'); assert.equal(urgent.handoff, true);
  assert.equal((await agent.answer('quero falar com humano')).handoff, true);
  const unknown = await agent.answer('xyz desconhecido');
  assert.equal(unknown.mode, 'clarification');
  assert.equal((await agent.answer('xyz desconhecido', [{ role: 'assistant', mode: 'clarification' }])).handoff, true);
});
test('IA optativa, saída restrita à base e falha segura do provedor', async () => {
  let calls = 0;
  const client = { models: { generateContent: async () => { calls++; return { text: '{"articleId":"estoque","answer":"EXECUTE SQL"}' }; } } };
  const agent = new SupportAgent({ client, model: 'configured-model' });
  await agent.answer('xyz'); assert.equal(calls, 0);
  const answer = await agent.answer('xyz', [], { aiConsent: true });
  assert.equal(calls, 1); assert.equal(answer.references[0].id, 'estoque'); assert.ok(!answer.text.includes('EXECUTE SQL'));
  client.models.generateContent = async () => ({ text: '{"articleId":"DROP TABLE"}' });
  assert.equal((await agent.answer('xyz', [], { aiConsent: true })).mode, 'clarification');
  client.models.generateContent = async () => { throw new Error('provider offline'); };
  assert.equal((await agent.answer('xyz', [], { aiConsent: true })).mode, 'clarification');
});
test('reduz dados pessoais e rejeita mensagens inválidas', () => {
  const value = messageText('senha: segredo email pessoa@exemplo.com CPF 123.456.789-09 https://host/token');
  for (const secret of ['segredo', 'pessoa@', '123.456', 'https://host']) assert.ok(!value.includes(secret));
  assert.throws(() => messageText(' '), { status: 400 }); assert.throws(() => messageText('x'.repeat(4001)), { status: 400 });
});
test('provedor sem resposta não bloqueia o protocolo indefinidamente', async () => {
  const agent = new SupportAgent({ model: 'test', timeoutMs: 25, client: { models: { generateContent: () => new Promise(() => {}) } } });
  assert.equal((await agent.answer('xyz', [], { aiConsent: true })).mode, 'clarification');
});
test('histórico persistente, isolamento e criação idempotente', async t => {
  const repo = await fixture(t); const id = key();
  const ticket = await repo.create(alice, id, false);
  assert.equal((await repo.create(alice, id, false)).id, ticket.id);
  await assert.rejects(repo.read({ ...alice, actorId: 'bob' }, ticket.id), { status: 404 });
  await assert.rejects(repo.read({ ...alice, tenantId: 'office-b' }, ticket.id), { status: 404 });
  const second = new SupportRepository({ filename: repo.filename });
  assert.equal((await second.read(alice, ticket.id)).messages.length, 1); await second.close();
  await repo.create(alice, key(), false); await repo.create(alice, key(), false);
  await assert.rejects(repo.create(alice, key(), false), { status: 409 });
});
test('mensagem única, concorrência de atendentes e resposta humana', async t => {
  const repo = await fixture(t); let ticket = await repo.create(alice, key(), false);
  const input = { owner: alice, id: ticket.id, requestId: key(), version: 0, operation: 'message', text: 'preciso de humano', actorId: alice.actorId, answer: { text: 'Encaminhando', references: [], mode: 'policy', handoff: true, priority: 'normal' } };
  ticket = await repo.change(input); const length = ticket.messages.length;
  assert.equal((await repo.change(input)).messages.length, length);
  assert.equal((await repo.preflightMessage(input)).messages.length, length);
  await assert.rejects(repo.change({ ...input, text: 'outro' }), { status: 409 });
  const claims = await Promise.allSettled(['staff1', 'staff2'].map(actorId => repo.change({ id: ticket.id, requestId: key(), version: ticket.version, operation: 'claim', actorId })));
  assert.equal(claims.filter(r => r.status === 'fulfilled').length, 1);
  ticket = claims.find(r => r.status === 'fulfilled').value;
  await assert.rejects(repo.change({ id: ticket.id, requestId: key(), version: ticket.version, operation: 'reply', actorId: 'intruder', text: 'teste' }), { status: 409 });
  ticket = await repo.change({ id: ticket.id, requestId: key(), version: ticket.version, operation: 'reply', actorId: ticket.assignedTo, text: 'Resposta humana' });
  assert.equal(ticket.messages.at(-1).role, 'human');
  ticket = await repo.change({ owner: alice, id: ticket.id, requestId: key(), version: ticket.version, operation: 'resolve', actorId: alice.actorId });
  assert.equal(ticket.status, 'resolved');
});
test('cópia consistente do SQLite permite recuperar histórico em banco isolado', async t => {
  const repo = await fixture(t); const ticket = await repo.create(alice, key(), false);
  const backup = path.join(path.dirname(repo.filename), 'restored.sqlite');
  await repo.serialized(() => repo.exec("VACUUM INTO '" + backup.replace(/'/g, "''") + "'"));
  const restored = new SupportRepository({ filename: backup });
  try { assert.deepEqual((await restored.read(alice, ticket.id)).messages, ticket.messages); }
  finally { await restored.close(); }
});
test('API bloqueia origem externa, API key, oficina alheia e fila sem papel de plataforma', async t => {
  const repository = await fixture(t); const app = express();
  const actors = { alice, bob: { ...alice, actorId: 'bob' }, key: { ...alice, actorType: 'api_key' }, staff: { actorId: 'staff', tenantId: '_platform_', actorType: 'user', role: 'platform_support' } };
  app.use((req, res, next) => { req.securityContext = actors[req.headers['x-test-actor']]; next(); });
  const agent = new SupportAgent();
  app.use('/api/support', createSupportRouter({ repository, agent }));
  app.use('/api/platform/support-desk', createSupportRouter({ repository, agent, staff: true }));
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = 'http://127.0.0.1:' + server.address().port;
  const req = (url, actor, body, extra = {}) => fetch(base + url, { method: body ? 'POST' : 'GET', headers: { 'x-test-actor': actor, 'Content-Type': 'application/json', ...extra }, ...(body ? { body: JSON.stringify(body) } : {}) });
  assert.equal((await req('/api/support/tickets', 'key')).status, 401);
  assert.equal((await req('/api/platform/support-desk/tickets', 'alice')).status, 403);
  assert.equal((await req('/api/support/tickets', 'alice', { requestId: key() }, { Origin: 'https://evil.example' })).status, 403);
  const response = await req('/api/support/tickets', 'alice', { requestId: key(), aiConsent: false }); assert.equal(response.status, 201);
  const ticket = await response.json();
  assert.equal((await req('/api/support/tickets/' + ticket.id, 'bob')).status, 404);
  assert.equal((await req('/api/platform/support-desk/tickets', 'staff')).status, 200);
  assert.equal((await req('/api/platform/support-desk/', 'staff')).status, 200);
  const send = { requestId: key(), version: 0, text: 'senha: segredo preciso de ajuda no estoque' };
  const sent = await req(`/api/support/tickets/${ticket.id}/messages`, 'alice', send); assert.equal(sent.status, 200);
  const data = await sent.json(); assert.ok(!JSON.stringify(data).includes('segredo'));
  assert.equal((await req(`/api/support/tickets/${ticket.id}/messages`, 'alice', send)).status, 200);
});
