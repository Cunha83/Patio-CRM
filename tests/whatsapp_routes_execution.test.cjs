'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('fs');
const os = require('os');
const express = require('express');

// Prepara banco temporário isolado antes de carregar o sistema para respeitar o DB_GUARD
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'patio_wpp_routes_'));
const testDb = path.join(tempDir, 'test_wpp_routes.db');
process.env.DB_PATH = testDb;
process.env.DISABLE_INTEGRATIONS = 'true';

const { initDB, closeDB } = require('../db');
const whatsappRoutes = require('../routes/whatsapp.routes');

test('Rotas do WhatsApp e Grupos - Verificação de Referências e Execução', async (t) => {
  await initDB();

  t.after(async () => {
    try { await closeDB(); } catch (_) {}
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}
  });

  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    req.securityContext = {
      tenantId: 'test_tenant',
      actorId: 'admin_test',
      role: 'dono',
      permissions: ['*']
    };
    next();
  });
  app.use(whatsappRoutes);

  await t.test('POST /api/whatsapp/disparar-grupo/admin executa sem getTenantKey ReferenceError', async () => {
    const resMock = {
      statusCode: 200,
      jsonData: null,
      status(c) { this.statusCode = c; return this; },
      json(d) { this.jsonData = d; return this; }
    };
    const reqMock = {
      method: 'POST',
      params: { tipo: 'admin' },
      query: {},
      body: {},
      headers: {},
      securityContext: {
        tenantId: 'test_tenant',
        actorId: 'admin_test',
        role: 'dono',
        permissions: ['*']
      }
    };

    // Acessa o handler diretamente ou através de chamada simulada
    const route = whatsappRoutes.stack.find(s => s.route && s.route.path === '/api/whatsapp/disparar-grupo/:tipo');
    assert.ok(route, 'Rota /api/whatsapp/disparar-grupo/:tipo deve existir');

    const handler = route.route.stack[route.route.stack.length - 1].handle;
    await handler(reqMock, resMock);

    assert.ok(resMock.jsonData, 'Deve responder JSON');
    assert.strictEqual(
      resMock.jsonData.error === 'getTenantKey is not defined',
      false,
      'Não pode falhar por getTenantKey não definido'
    );
  });

  await t.test('POST /api/whatsapp/disparar-grupo/operacao executa sem getTenantKey ReferenceError', async () => {
    const resMock = {
      statusCode: 200,
      jsonData: null,
      status(c) { this.statusCode = c; return this; },
      json(d) { this.jsonData = d; return this; }
    };
    const reqMock = {
      method: 'POST',
      params: { tipo: 'operacao' },
      query: {},
      body: {},
      headers: {},
      securityContext: {
        tenantId: 'test_tenant',
        actorId: 'admin_test',
        role: 'dono',
        permissions: ['*']
      }
    };

    const route = whatsappRoutes.stack.find(s => s.route && s.route.path === '/api/whatsapp/disparar-grupo/:tipo');
    const handler = route.route.stack[route.route.stack.length - 1].handle;
    await handler(reqMock, resMock);

    assert.ok(resMock.jsonData, 'Deve responder JSON');
    assert.strictEqual(
      resMock.jsonData.error === 'getTenantKey is not defined',
      false,
      'Não pode falhar por getTenantKey não definido'
    );
  });

  await t.test('GET /api/whatsapp/relatorio-preview executa com gerarMensagensOperacao disponível', async () => {
    const resMock = {
      statusCode: 200,
      jsonData: null,
      status(c) { this.statusCode = c; return this; },
      json(d) { this.jsonData = d; return this; }
    };
    const reqMock = {
      method: 'GET',
      query: {},
      headers: {},
      securityContext: {
        tenantId: 'test_tenant',
        actorId: 'admin_test',
        role: 'dono',
        permissions: ['*']
      }
    };

    const route = whatsappRoutes.stack.find(s => s.route && s.route.path === '/api/whatsapp/relatorio-preview');
    assert.ok(route, 'Rota /api/whatsapp/relatorio-preview deve existir');
    const handler = route.route.stack[route.route.stack.length - 1].handle;
    await handler(reqMock, resMock);

    assert.ok(resMock.jsonData, 'Deve responder JSON');
    assert.strictEqual(resMock.jsonData.success, true);
    assert.ok(Array.isArray(resMock.jsonData.mensagensAdmin), 'mensagensAdmin deve ser array');
    assert.ok(Array.isArray(resMock.jsonData.mensagensOperacao), 'mensagensOperacao deve ser array');
  });

  await t.test('GET /api/financeiro/dashboard executa com financialEngine disponível', async () => {
    const resMock = {
      statusCode: 200,
      jsonData: null,
      status(c) { this.statusCode = c; return this; },
      json(d) { this.jsonData = d; return this; }
    };
    const reqMock = {
      method: 'GET',
      query: { filtro: '30d' },
      headers: {},
      securityContext: {
        tenantId: 'test_tenant',
        actorId: 'admin_test',
        role: 'dono',
        permissions: ['*']
      }
    };

    const route = whatsappRoutes.stack.find(s => s.route && s.route.path === '/api/financeiro/dashboard');
    assert.ok(route, 'Rota /api/financeiro/dashboard deve existir');
    const handler = route.route.stack[route.route.stack.length - 1].handle;
    await handler(reqMock, resMock);

    assert.ok(resMock.jsonData, 'Deve responder JSON');
    assert.strictEqual(typeof resMock.jsonData.kpis, 'object');
  });
});
