'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const net = require('net');
const { spawn } = require('child_process');
const { once } = require('events');

const { metrics, MetricsCollector } = require('../lib/metrics');
const { IdentityRegistry } = require('../lib/auth/identity');
const { createAuthMiddleware } = require('../lib/auth/context');
const { getState, persistState, clearMemoryCache } = require('../lib/repository/stateRepository');
const { createWriteQueue } = require('../lib/core');

/* ── 1. TESTE: COLETOR DE MÉTRICAS UNITÁRIO ─────────────────── */
test('1. MetricsCollector: registro, cálculo de estatísticas e buffer circular', () => {
  const collector = new MetricsCollector({ enableConsoleLog: false });

  // 1.1 Registro de autenticações
  collector.recordAuth({ latencyMs: 1.2, success: true, tenantId: 'oficina_a', actorId: 'user1', role: 'admin' });
  collector.recordAuth({ latencyMs: 2.5, success: true, tenantId: 'oficina_a', actorId: 'user1', role: 'admin' });
  collector.recordAuth({ latencyMs: 0.8, success: false, errorType: '401_missing_credentials', tenantId: 'unresolved' });

  const m1 = collector.getMetrics();
  assert.equal(m1.auth.totalRequests, 3);
  assert.equal(m1.auth.successCount, 2);
  assert.equal(m1.auth.errorCount, 1);
  assert.equal(m1.auth.errorsByType['401_missing_credentials'], 1);
  assert.equal(m1.auth.latency.count, 3);
  assert.ok(m1.auth.latency.avgMs > 0);
  assert.equal(m1.auth.byTenant['oficina_a'].successCount, 2);

  // 1.2 Registro de leituras e escritas no repositório
  collector.recordRepoRead({ latencyMs: 0.5, success: true, cacheHit: true, tenantId: 'oficina_a' });
  collector.recordRepoRead({ latencyMs: 4.2, success: true, cacheHit: false, tenantId: 'oficina_a' });
  collector.recordRepoRead({ latencyMs: 1.1, success: false, cacheHit: false, tenantId: 'oficina_b', error: 'db_error' });

  collector.recordRepoWrite({ latencyMs: 8.0, success: true, status: 200, tenantId: 'oficina_a' });
  collector.recordRepoWrite({ latencyMs: 2.1, success: false, status: 409, conflict: true, tenantId: 'oficina_a' });
  collector.recordRepoWrite({ latencyMs: 0.9, success: false, status: 400, tenantId: 'oficina_a', error: 'invalid_data' });

  const m2 = collector.getMetrics({ detail: true });
  assert.equal(m2.repository.reads.total, 3);
  assert.equal(m2.repository.reads.cacheHits, 1);
  assert.equal(m2.repository.reads.dbReads, 2);
  assert.equal(m2.repository.reads.errors, 1);

  assert.equal(m2.repository.writes.total, 3);
  assert.equal(m2.repository.writes.successCount, 1);
  assert.equal(m2.repository.writes.conflicts409, 1);
  assert.equal(m2.repository.writes.validationErrors, 1);

  assert.ok(m2.recentEvents.length >= 6);
  assert.equal(m2.recentEvents[0].type, 'metric');

  // 1.3 Reset
  collector.reset();
  const m3 = collector.getMetrics();
  assert.equal(m3.auth.totalRequests, 0);
  assert.equal(m3.repository.reads.total, 0);
  assert.equal(m3.repository.writes.total, 0);
});

/* ── 2. TESTE: MIDDLEWARE DE CONTEXTO COLETANDO MÉTRICAS ───── */
test('2. Middleware de Contexto: coleta latência de autenticação e categoriza erros', () => {
  metrics.reset();

  const registry = new IdentityRegistry({ allowWeakInTest: true });
  registry.registerUser({
    username: 'operador1',
    password: 'senha-segura-123456',
    memberships: [{ tenantId: 'oficina_alfa', role: 'operador', permissions: ['os:read'] }]
  });

  const middleware = createAuthMiddleware(registry);

  // 2.1 Requisição sem autenticação (401)
  let status401 = null;
  const mockRes401 = {
    setHeader: () => {},
    status: (s) => { status401 = s; return mockRes401; },
    json: () => {}
  };
  middleware({ headers: {}, method: 'GET' }, mockRes401, () => {});
  assert.equal(status401, 401);

  // 2.2 Requisição com tenant inválido (403_invalid_tenant_id)
  const basicAuthValid = 'Basic ' + Buffer.from('operador1:senha-segura-123456').toString('base64');
  let status403Inv = null;
  const mockRes403Inv = {
    setHeader: () => {},
    status: (s) => { status403Inv = s; return mockRes403Inv; },
    json: () => {}
  };
  middleware({
    headers: { authorization: basicAuthValid, 'x-tenant-id': 'inv@lid!!' },
    method: 'GET'
  }, mockRes403Inv, () => {});
  assert.equal(status403Inv, 403);

  // 2.3 Requisição com tenant não autorizado para o usuário (403_unauthorized_tenant)
  let status403Unauth = null;
  const mockRes403Unauth = {
    setHeader: () => {},
    status: (s) => { status403Unauth = s; return mockRes403Unauth; },
    json: () => {}
  };
  middleware({
    headers: { authorization: basicAuthValid, 'x-tenant-id': 'oficina_beta' },
    method: 'GET'
  }, mockRes403Unauth, () => {});
  assert.equal(status403Unauth, 403);

  // 2.4 Requisição com autenticação e tenant válidos (sucesso)
  let nextChamado = false;
  const reqOk = {
    headers: { authorization: basicAuthValid, 'x-tenant-id': 'oficina_alfa' },
    method: 'GET'
  };
  middleware(reqOk, {}, () => { nextChamado = true; });
  assert.equal(nextChamado, true);

  // 2.5 Validação das métricas acumuladas
  const snapshot = metrics.getMetrics();
  assert.equal(snapshot.auth.totalRequests, 4);
  assert.equal(snapshot.auth.successCount, 1);
  assert.equal(snapshot.auth.errorCount, 3);
  assert.equal(snapshot.auth.errorsByType['401_missing_or_invalid_credentials'], 1);
  assert.equal(snapshot.auth.errorsByType['403_invalid_tenant_id'], 1);
  assert.equal(snapshot.auth.errorsByType['403_unauthorized_tenant'], 1);
  assert.ok(snapshot.auth.latency.avgMs >= 0);
});

/* ── 3. TESTE: REPOSITÓRIO COLETANDO MÉTRICAS DE LEITURA/ESCRITA ── */
test('3. Repositório: mede tempo de leitura (cache hit vs db) e de escrita (sucesso, validação e conflito)', async () => {
  const { initDB } = require('../db');
  await initDB();
  metrics.reset();
  clearMemoryCache();
  const queue = createWriteQueue();

  const tenantId = 'oficina_metrica_' + Date.now();
  const context = {
    tenantId,
    actorId: 'admin1',
    role: 'admin',
    permissions: ['*'],
    channel: 'http'
  };

  // 3.1 Escrita com falha de validação (status 400)
  const resInvalido = await persistState(context, { versao: 1, colecaoInvalida: [] }, { enqueueWrite: queue });
  assert.equal(resInvalido.ok, false);
  assert.equal(resInvalido.status, 400);

  // 3.2 Escrita válida (status 200)
  const estadoValido = {
    versao: 0,
    cfg: { empresa: 'Oficina Métrica' },
    os: [], veiculos: [], clientes: [], boxes: [], contas: [], pecas: [], servicos: [], movimentos: [], auditoria: []
  };
  const resValido = await persistState(context, estadoValido, { enqueueWrite: queue });
  assert.equal(resValido.ok, true);
  assert.equal(resValido.status, 200);

  // 3.3 Escrita com conflito de concorrência CAS (status 409)
  const estadoConflito = {
    versao: 999, // versao errada
    cfg: { empresa: 'Oficina Conflito' },
    os: [], veiculos: [], clientes: [], boxes: [], contas: [], pecas: [], servicos: [], movimentos: [], auditoria: []
  };
  const resConflito = await persistState(context, estadoConflito, { enqueueWrite: queue });
  assert.equal(resConflito.ok, false);
  assert.equal(resConflito.status, 409);

  // 3.4 Leitura do cache em memória (cacheHit: true)
  const lidoCache = await getState(tenantId);
  assert.ok(lidoCache);

  // 3.5 Limpar cache em memória para forçar leitura do SQLite (cacheHit: false)
  clearMemoryCache(tenantId);
  const lidoDb = await getState(tenantId);
  assert.ok(lidoDb);

  // 3.6 Checagem das métricas do repositório
  const snap = metrics.getMetrics();
  assert.equal(snap.repository.writes.total, 3);
  assert.equal(snap.repository.writes.successCount, 1);
  assert.equal(snap.repository.writes.validationErrors, 1);
  assert.equal(snap.repository.writes.conflicts409, 1);
  assert.ok(snap.repository.writes.latency.avgMs >= 0);

  assert.ok(snap.repository.reads.total >= 2);
  assert.ok(snap.repository.reads.cacheHits >= 1);
  assert.ok(snap.repository.reads.dbReads >= 1);
  assert.ok(snap.repository.reads.latency.avgMs >= 0);
});

/* ── 4. TESTE: EMISSÃO DE LOGS ESTRUTURADOS EM JSON ──────────── */
test('4. Logs Estruturados: emite JSON padronizado para ingestão de telemetria', () => {
  const collector = new MetricsCollector({ enableConsoleLog: true });

  const logs = [];
  const originalLog = console.log;
  console.log = (msg) => {
    logs.push(msg);
  };

  try {
    collector.recordAuth({
      latencyMs: 1.45,
      success: true,
      tenantId: 'oficina_log',
      actorId: 'usuario_teste',
      role: 'operador'
    });

    collector.recordRepoRead({
      latencyMs: 0.88,
      success: true,
      cacheHit: true,
      tenantId: 'oficina_log'
    });
  } finally {
    console.log = originalLog;
  }

  assert.equal(logs.length, 2);
  const logAuth = JSON.parse(logs[0]);
  assert.equal(logAuth.type, 'metric');
  assert.equal(logAuth.subsystem, 'auth');
  assert.equal(logAuth.op, 'authenticate');
  assert.equal(logAuth.tenantId, 'oficina_log');
  assert.equal(logAuth.success, true);
  assert.equal(logAuth.latencyMs, 1.45);
  assert.ok(logAuth.timestamp);

  const logRead = JSON.parse(logs[1]);
  assert.equal(logRead.type, 'metric');
  assert.equal(logRead.subsystem, 'repository');
  assert.equal(logRead.op, 'read');
  assert.equal(logRead.cacheHit, true);
  assert.equal(logRead.latencyMs, 0.88);
});

/* ── 5. TESTE E2E HTTP: ENDPOINT /api/metricas E CONTROLE DE ACESSO ── */
test('5. Servidor Real E2E: endpoint /api/metricas com controle de acesso administrativo e filtro de tenant', { timeout: 60000 }, async t => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'patio-crm-metrics-test-'));
  const probe = net.createServer();
  probe.listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const port = probe.address().port;
  await new Promise(r => probe.close(r));

  const root = path.resolve(__dirname, '..');
  let child;

  async function startServer() {
    child = spawn(process.execPath, ['server.js'], {
      cwd: root,
      windowsHide: true,
      env: {
        ...process.env,
        PORT: String(port),
        API_KEY: 'test-api-key-metrics-secret-1234',
        AUTH_USER: 'patio',
        AUTH_PASSWORD: 'patio-password-test',
        DISABLE_INTEGRATIONS: 'true',
        METRICS_LOG_SILENT: 'true',
        DB_PATH: path.join(temp, 'test_metrics.db')
      }
    });

    for (let i = 0; i < 500; i++) {
      if (child.exitCode !== null) throw Error('Falha ao iniciar servidor de teste');
      try {
        const res = await fetch(`http://127.0.0.1:${port}/`);
        if (res.status === 401) return;
      } catch (_) {}
      await new Promise(r => setTimeout(r, 100));
    }
    throw Error('Timeout ao aguardar servidor.');
  }

  async function stopServer() {
    if (child && child.exitCode === null) {
      const done = once(child, 'exit');
      child.kill();
      await done;
    }
  }

  t.after(async () => {
    await stopServer();
    fs.rmSync(temp, { recursive: true, force: true });
  });

  await startServer();

  // 5.1 Chamada não autenticada ao endpoint /api/metricas -> 401
  const resUnauth = await fetch(`http://127.0.0.1:${port}/api/metricas`);
  assert.equal(resUnauth.status, 401, 'Requisição sem autenticação deve retornar 401');

  // 5.2 Chamada autenticada com API Key administrativa -> 200
  const adminHeaders = {
    'x-api-key': 'test-api-key-metrics-secret-1234',
    'x-tenant-id': 'default'
  };
  const resAdmin = await fetch(`http://127.0.0.1:${port}/api/metricas?detail=true`, {
    headers: adminHeaders
  });
  assert.equal(resAdmin.status, 200, 'Admin deve conseguir ler métricas');
  const dataAdmin = await resAdmin.json();
  assert.equal(dataAdmin.success, true);
  assert.ok(dataAdmin.auth.totalRequests >= 1);
  assert.ok(dataAdmin.repository);
  assert.ok(Array.isArray(dataAdmin.recentEvents));

  // 5.3 Reset de métricas via POST /api/metricas/reset
  const resReset = await fetch(`http://127.0.0.1:${port}/api/metricas/reset`, {
    method: 'POST',
    headers: adminHeaders
  });
  assert.equal(resReset.status, 200);

  const resAfterReset = await fetch(`http://127.0.0.1:${port}/api/metricas`, {
    headers: adminHeaders
  });
  const dataAfterReset = await resAfterReset.json();
  assert.equal(dataAfterReset.repository.reads.total, 0);

  // 5.4 Alias /api/metrics também responde com 200
  const resAlias = await fetch(`http://127.0.0.1:${port}/api/metrics`, {
    headers: adminHeaders
  });
  assert.equal(resAlias.status, 200);
});
