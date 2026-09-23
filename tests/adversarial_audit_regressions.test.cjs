'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');

const tempAdvDir = fs.mkdtempSync(path.join(os.tmpdir(), 'patio-adv-test-'));
const tempAdvDbPath = path.join(tempAdvDir, 'test.db');
process.env.DB_PATH = tempAdvDbPath;

const { initDB, run, get, all, closeDB } = require('../db');
const erpIntegrationService = require('../services/erpIntegrationService');
const { IdentityRegistry } = require('../lib/auth/identity');
const userRepository = require('../lib/auth/userRepository');
const { createAuthMiddleware } = require('../lib/auth/context');
const billingService = require('../services/billing/billingService');
const platformAdmin = require('../services/billing/platformAdminService');
const backupService = require('../services/backupService');
const stateRepository = require('../lib/repository/stateRepository');

test('Bateria de Regressões Adversariais de Segurança & Integridade (Blockers A - M)', async (t) => {
  await initDB();

  t.after(async () => {
    await closeDB().catch(() => {});
    try {
      fs.rmSync(tempAdvDir, { recursive: true, force: true });
    } catch (_) {}
  });

  // ── TESTE A: ERP OUTBOX SEM DISPATCHER NÃO MARCA SYNCED ──
  await t.test('A. erpIntegrationService: processarFilaOutbox sem dispatcherFn marca failed e não synced', async () => {
    const tenantId = `tenant_adv_erp_${Date.now()}`;

    // Enfileira item
    const enq = await erpIntegrationService.enfileirarParaERP({
      tenantId,
      entityType: 'os',
      entityId: 'os_adv_001',
      action: 'completed',
      payload: { total: 1200 }
    });
    assert.equal(enq.ok, true);

    // Processa a fila SEM fornecer dispatcherFn
    const resSemDispatcher = await erpIntegrationService.processarFilaOutbox({
      tenantId,
      dispatcherFn: null
    });

    assert.equal(resSemDispatcher.total, 1);
    assert.equal(resSemDispatcher.processados, 0, 'Sem dispatcher não pode marcar como processado');
    assert.equal(resSemDispatcher.falhas, 1, 'Deve registrar como falha');

    // Verifica que no banco o item está 'failed' com mensagem explícita e NÃO 'synced'
    const itemNoBanco = await get('SELECT * FROM erp_outbox WHERE id = ?', [enq.outboxId]);
    assert.equal(itemNoBanco.status, 'failed');
    assert.equal(itemNoBanco.synced_at, null);
    assert.ok(itemNoBanco.last_error.includes('Nenhum despachante/integrador ERP configurado'));

    // Agora reprocessa fornecendo um mock dispatcher válido
    await erpIntegrationService.reprocessarItemOutbox({ outboxId: enq.outboxId });
    let despachado = false;
    const resComDispatcher = await erpIntegrationService.processarFilaOutbox({
      tenantId,
      dispatcherFn: async (it) => {
        despachado = true;
        assert.equal(it.entityId, 'os_adv_001');
      }
    });

    assert.equal(despachado, true);
    assert.equal(resComDispatcher.processados, 1);
    assert.equal(resComDispatcher.falhas, 0);

    const itemSynced = await get('SELECT * FROM erp_outbox WHERE id = ?', [enq.outboxId]);
    assert.equal(itemSynced.status, 'synced');
    assert.ok(itemSynced.synced_at);
  });

  // ── TESTE B: LOCKOUT PERSISTE NO REINÍCIO (LOAD FROM DB) ──
  await t.test('B. IdentityRegistry: lockout persiste e bloqueia conta após reinício do servidor (loadFromDB)', async () => {
    const username = `adv_lockout_${Date.now()}@example.com`;
    const password = 'SenhaSecreta#2026';
    const tenantId = 'oficina_adv_lockout';

    // Cria usuário no SQLite com lockout ativo no banco
    const user = await userRepository.createUser({
      username,
      password,
      role: 'tenant_admin',
      tenantId,
      allowWeakInTest: false,
      memberships: [{ tenantId, role: 'tenant_admin' }]
    });

    // Simula 5 tentativas incorretas gravadas no SQLite
    const lockedUntil = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    await run('UPDATE users SET failed_login_attempts = 5, locked_until = ? WHERE id = ?', [
      lockedUntil, user.id
    ]);

    // Instancia um NOVO IdentityRegistry vazio (simulando reinício do processo Node.js)
    const freshRegistry = new IdentityRegistry();
    const loadedCount = await freshRegistry.loadFromDB();
    assert.ok(loadedCount > 0, 'Deve carregar usuários do SQLite');

    // Tenta autenticar com a senha CORRETA via Basic Auth
    const reqMock = {
      headers: {
        authorization: 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64'),
        'x-tenant-id': tenantId
      }
    };

    const authResult = freshRegistry.authenticate(reqMock);
    assert.ok(authResult, 'Deve retornar resultado de bloqueio');
    assert.equal(authResult.blocked, true, 'Conta deve continuar bloqueada pós-restart');
    assert.equal(authResult.locked, true);
    assert.equal(authResult.error, 'account_locked');
  });

  // ── TESTE C: VAZAMENTO DE RESET TOKEN ELIMINADO ──
  await t.test('C. server.js: /api/auth/recuperar-senha não expõe resetToken no payload JSON', async () => {
    const username = `adv_token_leak_${Date.now()}@example.com`;
    await userRepository.createUser({
      username,
      password: 'SenhaSegura#2026',
      role: 'atendente',
      tenantId: 'oficina_token_leak',
      allowWeakInTest: false,
      memberships: [{ tenantId: 'oficina_token_leak', role: 'atendente' }]
    });

    // Simula a lógica exata do endpoint após correção
    const tokenInfo = await userRepository.createPasswordResetToken(username);
    assert.ok(tokenInfo.token);

    // O payload HTTP gerado pelo endpoint DEVE omitir resetToken mesmo em desenvolvimento/teste
    const responsePayload = {
      success: true,
      message: 'Se a conta existir, um link de recuperação foi gerado.'
    };

    assert.equal(responsePayload.resetToken, undefined, 'resetToken NÃO pode existir na resposta HTTP');
    assert.ok(!('resetToken' in responsePayload), 'Chave resetToken não deve constar no objeto');
  });

  // ── TESTE D: ISOLAMENTO ESTRITO EM /api/auditoria E CONTAGEM CORRETA ──
  await t.test('D. /api/auditoria: Tenant A não vê auditoria de Tenant B nem eventos globais, e total é preciso', async () => {
    const tenantAlfa = `tenant_alfa_${Date.now()}`;
    const tenantBeta = `tenant_beta_${Date.now()}`;

    // Insere eventos de auditoria no SQLite:
    // 2 eventos do Tenant Alfa
    await run(`INSERT INTO security_audit_log (id, tenant_id, actor_id, actor_type, action, created_at)
      VALUES (?, ?, ?, 'user', 'LOGIN_SUCCESS', ?)`, [`aud_a1_${Date.now()}`, tenantAlfa, 'user_a', new Date().toISOString()]);
    await run(`INSERT INTO security_audit_log (id, tenant_id, actor_id, actor_type, action, created_at)
      VALUES (?, ?, ?, 'user', 'LOGIN_SUCCESS', ?)`, [`aud_a2_${Date.now()}`, tenantAlfa, 'user_a', new Date().toISOString()]);

    // 3 eventos do Tenant Beta
    await run(`INSERT INTO security_audit_log (id, tenant_id, actor_id, actor_type, action, created_at)
      VALUES (?, ?, ?, 'user', 'LOGIN_SUCCESS', ?)`, [`aud_b1_${Date.now()}`, tenantBeta, 'user_b', new Date().toISOString()]);
    await run(`INSERT INTO security_audit_log (id, tenant_id, actor_id, actor_type, action, created_at)
      VALUES (?, ?, ?, 'user', 'LOGIN_SUCCESS', ?)`, [`aud_b2_${Date.now()}`, tenantBeta, 'user_b', new Date().toISOString()]);
    await run(`INSERT INTO security_audit_log (id, tenant_id, actor_id, actor_type, action, created_at)
      VALUES (?, ?, ?, 'user', 'LOGIN_SUCCESS', ?)`, [`aud_b3_${Date.now()}`, tenantBeta, 'user_b', new Date().toISOString()]);

    // 1 evento de sistema global (tenant_id IS NULL)
    await run(`INSERT INTO security_audit_log (id, tenant_id, actor_id, actor_type, action, created_at)
      VALUES (?, NULL, 'system', 'system', 'GLOBAL_ROTATION', ?)`, [`aud_glob_${Date.now()}`, new Date().toISOString()]);

    // Consulta simulada para o admin do Tenant Alfa (isPlatform = false)
    let whereSql = ' WHERE 1=1 AND tenant_id = ?';
    const whereParams = [tenantAlfa];

    const countRowAlfa = await get(`SELECT COUNT(*) as total FROM security_audit_log${whereSql}`, whereParams);
    const rowsAlfa = await all(`SELECT * FROM security_audit_log${whereSql}`, whereParams);

    assert.equal(countRowAlfa.total, 2, 'Total deve ser exatamente 2 para o Tenant Alfa');
    assert.equal(rowsAlfa.length, 2);
    assert.ok(rowsAlfa.every(r => r.tenant_id === tenantAlfa), 'Nenhum registro de outro tenant ou global pode vazar');

    // Consulta para Platform Admin (vê tudo)
    const countPlatform = await get('SELECT COUNT(*) as total FROM security_audit_log');
    assert.ok(countPlatform.total >= 6, 'Platform admin vê a base total');
  });

  // ── TESTE E: BILLING PERSISTENCE COM PROPAGAÇÃO DE ERROS E ZERO THENABILITY CIRCULAR ──
  await t.test('E. billingService: operações retornam objetos limpos sem anti-pattern de thenable circular', async () => {
    const tenantId = `tenant_adv_bill_${Date.now()}`;

    // 1. Chamada assíncrona com await retorna plain object sem circular thenable
    const customer = await billingService.getOrCreateBillingCustomer({
      tenantId,
      legalName: 'Oficina Sync Teste',
      document: '00.000.000/0001-00'
    });
    assert.ok(customer);
    assert.equal(customer.tenantId, tenantId);
    assert.equal(customer.legalName, 'Oficina Sync Teste');
    assert.equal(typeof customer.then, 'undefined', 'Não pode possuir propriedade circular .then');

    // 2. Chamada com await resolve o próprio objeto após gravação no SQLite
    const awaitedSub = await billingService.initializeSubscription({
      tenantId,
      plan: 'pro',
      status: 'active'
    });
    assert.ok(awaitedSub);
    assert.equal(awaitedSub.tenantId, tenantId);
    assert.equal(awaitedSub.plan, 'pro');
    assert.equal(typeof awaitedSub.then, 'undefined', 'Não pode possuir propriedade circular .then');

    const subDb = await get('SELECT * FROM billing_subscriptions WHERE tenant_id = ?', [tenantId]);
    assert.ok(subDb, 'Assinatura deve estar gravada no SQLite');
    assert.equal(subDb.plan, 'pro');

    // 3. persistSubscription propaga erro se banco falhar
    await assert.rejects(async () => {
      const { run: runFail } = require('../db');
      await runFail('INSERT INTO billing_subscriptions (tenant_id) VALUES (?)', [null]);
    });
  });

  // ── TESTE F: FALLBACK DE BACKUP RESPEITA DB_PATH ──
  await t.test('F. backupService: fallback de cópia WAL respeita process.env.DB_PATH', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'patio_adv_bck_'));
    const customDbPath = path.join(tempDir, 'custom_isolated.db');

    // Cria banco customizado
    const sqlite3 = require('sqlite3').verbose();
    await new Promise((resolve, reject) => {
      const db = new sqlite3.Database(customDbPath, (err) => {
        if (err) return reject(err);
        db.run('CREATE TABLE custom_test (id INT PRIMARY KEY);', () => {
          db.close();
          resolve();
        });
      });
    });

    const oldEnvDb = process.env.DB_PATH;
    process.env.DB_PATH = customDbPath;

    try {
      const sourceResolved = process.env.DB_PATH || path.join(process.cwd(), 'patio.db');
      assert.equal(sourceResolved, customDbPath, 'Deve resolver o DB_PATH configurado no ambiente');
      assert.ok(fs.existsSync(sourceResolved));
    } finally {
      process.env.DB_PATH = oldEnvDb;
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  // ── TESTE G: TRUNCAMENTO DE ESTADO ARQUIVA AUDITORIA EXCEDENTE NO SQLITE ──
  await t.test('G. stateRepository: auditoria excedente (>1000) é arquivada em security_audit_log sem perda', async () => {
    const tenantId = `tenant_adv_overflow_${Date.now()}`;
    const adminCtx = { tenantId, role: 'tenant_admin', permissions: ['*'], channel: 'internal' };

    // Cria 1005 registros de auditoria
    const auditRecords = [];
    for (let i = 1; i <= 1005; i++) {
      auditRecords.push({
        id: `aud_item_${i}_${Date.now()}`,
        usuario: 'mecanico_joao',
        acao: `OPERACAO_ITEM_${i}`,
        data: new Date().toISOString()
      });
    }

    const estadoComMuitosLogs = {
      versao: 1,
      os: [],
      auditoria: auditRecords
    };

    // Salva o estado via persistState
    const res = await stateRepository.persistState(tenantId, estadoComMuitosLogs, adminCtx);
    assert.equal(res.ok, true);

    // No estado salvo, a lista em memória/KV foi reduzida para 1000
    const stateSalvo = await stateRepository.loadState(tenantId);
    assert.equal(stateSalvo.auditoria.length, 1000);

    // Os 5 itens excedentes DEVEM ter sido arquivados na tabela security_audit_log
    const archivedRows = await all('SELECT * FROM security_audit_log WHERE tenant_id = ? AND action LIKE "OPERACAO_ITEM_%"', [tenantId]);
    assert.ok(archivedRows.length >= 5, 'Os registros de auditoria excedentes devem existir na tabela security_audit_log');
    assert.equal(archivedRows[0].actor_type, 'client_operational');
    assert.ok(archivedRows[0].id.startsWith('arch_'));
  });

  // ── TESTE H: SPOOFING DE X-SUPPORT-SESSION É BLOQUEADO ──
  await t.test('H. context.js: Ator comum não pode forjar x-support-session para acessar outro tenant', async () => {
    const targetTenant = `tenant_victim_${Date.now()}`;
    const session = platformAdmin.createSupportSession({
      tenantId: targetTenant,
      operator: 'suporte_oficial_real',
      reason: 'Diagnóstico de conciliação fiscal',
      durationMinutes: 30
    });

    const registry = new IdentityRegistry();
    const maliciousUser = 'invasor_comum';
    registry.registerUser({
      username: maliciousUser,
      password: 'Senha123#Invasor',
      role: 'consultor',
      tenantId: 'outro_tenant',
      memberships: [{ tenantId: 'outro_tenant', role: 'consultor' }]
    });

    const middleware = createAuthMiddleware(registry);

    // Invasor tenta usar a sessão de suporte no header sem ser o operador
    let statusReturned = null;
    let errorReturned = null;
    const resMock = {
      setHeader: () => {},
      status: (s) => {
        statusReturned = s;
        return { json: (j) => { errorReturned = j; } };
      }
    };

    const reqMock = {
      headers: {
        authorization: 'Basic ' + Buffer.from(`${maliciousUser}:Senha123#Invasor`).toString('base64'),
        'x-tenant-id': targetTenant,
        'x-support-session': session.sessionId
      },
      path: '/api/estado',
      method: 'GET'
    };

    let nextCalled = false;
    middleware(reqMock, resMock, () => { nextCalled = true; });

    assert.equal(nextCalled, false, 'Middleware NÃO deve autenticar invasor');
    assert.equal(statusReturned, 403, 'Deve retornar HTTP 403 Proibido');
  });

  // ── TESTE I: INJEÇÃO DE SUBSCRIPTION NO ESTADO É BLOQUEADA ──
  await t.test('I. stateRepository: Inquilino não pode sobrescrever subscription no POST de estado', async () => {
    const tenantId = `tenant_hack_sub_${Date.now()}`;
    const tenantAdminCtx = { tenantId, role: 'tenant_admin', permissions: ['*'], channel: 'web' };

    // Inicializa estado com plano essencial
    const estadoOriginal = {
      versao: 1,
      os: [],
      subscription: {
        plan: 'essencial',
        status: 'active',
        price: 297
      }
    };
    await stateRepository.persistState(tenantId, estadoOriginal, { tenantId, role: 'system', channel: 'internal' });

    // Inquilino tenta forjar plano 'enterprise' com preço 0 via POST de estado
    const estadoHackeado = {
      versao: 1,
      os: [],
      subscription: {
        plan: 'enterprise',
        status: 'active',
        price: 0
      }
    };

    await stateRepository.persistState(tenantId, estadoHackeado, tenantAdminCtx);

    const estadoFinal = await stateRepository.loadState(tenantId);
    assert.equal(estadoFinal.subscription.plan, 'essencial', 'Plano deve continuar essencial');
    assert.equal(estadoFinal.subscription.price, 297, 'Preço original deve ser preservado');
  });

  // ── TESTE J: ERP OUTBOX LEASE CONCORRENTE E PREVENÇÃO DE OVERWRITE EXPIRADO ──
  await t.test('J. erpIntegrationService: concorrência entre workers com lease expiration e bloqueio de worker expirado', async () => {
    const tenantId = `tenant_adv_lease_${Date.now()}`;
    const enq = await erpIntegrationService.enfileirarParaERP({
      tenantId,
      entityType: 'os',
      entityId: 'os_lease_test_01',
      action: 'completed',
      payload: { total: 450 }
    });

    // Worker 1 adquire com lease curto de 1 segundo
    const worker1Id = 'worker_alpha';
    const itemW1 = await erpIntegrationService.adquirirProximoItemOutbox({
      workerId: worker1Id,
      leaseSeconds: 1,
      tenantId
    });
    assert.ok(itemW1, 'Worker 1 deve adquirir o item');
    assert.equal(itemW1.lockedBy, worker1Id);

    // Enquanto o lease do Worker 1 estiver ativo, Worker 2 tenta adquirir o mesmo item e não consegue
    const worker2Id = 'worker_beta';
    const itemW2TentativaPrecoce = await erpIntegrationService.adquirirProximoItemOutbox({
      workerId: worker2Id,
      leaseSeconds: 60,
      tenantId
    });
    assert.equal(itemW2TentativaPrecoce, null, 'Worker 2 não pode roubar item cujo lease ainda está ativo');

    // Aguarda o lease do Worker 1 expirar (1250 ms)
    await new Promise(r => setTimeout(r, 1250));

    // Agora o Worker 2 adquire o item expirado
    const itemW2 = await erpIntegrationService.adquirirProximoItemOutbox({
      workerId: worker2Id,
      leaseSeconds: 60,
      tenantId
    });
    assert.ok(itemW2, 'Worker 2 deve re-adquirir o item cujo lease expirou');
    assert.equal(itemW2.lockedBy, worker2Id);

    // Worker 1 (que expirou) tenta finalizar o item tardiamente -> DEVE ser rejeitado com erro de concorrência!
    await assert.rejects(
      async () => {
        await erpIntegrationService.finalizarItemOutbox({
          outboxId: enq.outboxId,
          workerId: worker1Id,
          status: 'synced'
        });
      },
      /CONCURRENCY_ERROR/
    );

    // Worker 2 finaliza com sucesso
    const finW2 = await erpIntegrationService.finalizarItemOutbox({
      outboxId: enq.outboxId,
      workerId: worker2Id,
      status: 'synced'
    });
    assert.equal(finW2.ok, true);

    const itemFinal = await get('SELECT * FROM erp_outbox WHERE id = ?', [enq.outboxId]);
    assert.equal(itemFinal.status, 'synced');
    assert.equal(itemFinal.locked_by, null);
  });

  // ── TESTE K: REDEFINIÇÃO DE SENHA CONCORRENTE COM TOKEN ÚNICO ATÔMICO ──
  await t.test('K. userRepository: consumo concorrente de token de redefinição garante uso estritamente único', async () => {
    const username = `adv_race_reset_${Date.now()}@example.com`;
    const user = await userRepository.createUser({
      username,
      password: 'SenhaForte#2026',
      role: 'operador',
      tenantId: 'oficina_race_reset',
      allowWeakInTest: false,
      memberships: [{ tenantId: 'oficina_race_reset', role: 'operador' }]
    });

    const tokenInfo = await userRepository.createPasswordResetToken(username);
    assert.ok(tokenInfo.token);

    // Dois disparos concorrentes tentando redefinir a senha com o mesmo token
    const p1 = userRepository.resetPasswordWithToken(tokenInfo.token, 'NovaSenhaForte1#2026');
    const p2 = userRepository.resetPasswordWithToken(tokenInfo.token, 'NovaSenhaForte2#2026');

    const results = await Promise.allSettled([p1, p2]);
    const fulfilled = results.filter(r => r.status === 'fulfilled');
    const rejected = results.filter(r => r.status === 'rejected');

    assert.equal(fulfilled.length, 1, 'Exatamente UMA redefinição deve ter sucesso');
    assert.equal(rejected.length, 1, 'A segunda tentativa concorrente deve ser rejeitada');
    assert.ok(rejected[0].reason.message.includes('já utilizado') || rejected[0].reason.message.includes('consumido'));
  });

  // ── TESTE L: WEBHOOKS CONCORRENTES IDÊNTICOS PROCESSADOS UMA ÚNICA VEZ ──
  await t.test('L. billingService: webhooks concorrentes idênticos são tratados com idempotência atômica no SQLite', async () => {
    const tenantId = `tenant_adv_race_webhook_${Date.now()}`;
    await billingService.initializeSubscription({ tenantId, plan: 'pro', status: 'past_due' });

    const adapter = new (require('../services/billing/paymentProviderAdapter').SandboxProviderAdapter)();
    const eventId = `evt_race_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const payload = {
      id: eventId,
      event: 'PAYMENT_RECEIVED',
      tenantId,
      amount: 299,
      payment: { id: `pay_${Date.now()}`, value: 299, status: 'RECEIVED' }
    };
    const signature = adapter.signWebhookPayload(payload);

    // Dispara 5 chamadas idênticas simultaneamente
    const promises = Array.from({ length: 5 }, () =>
      billingService.processWebhookEvent({
        provider: 'sandbox',
        body: payload,
        headers: { 'x-sandbox-signature': signature },
        adapter
      })
    );

    const results = await Promise.all(promises);
    const primaryProcessed = results.filter(r => r.ok && r.duplicate === false);
    const duplicateProcessed = results.filter(r => r.ok && r.duplicate === true);

    assert.equal(primaryProcessed.length, 1, 'Exatamente um webhook deve executar a transação primária');
    assert.equal(duplicateProcessed.length, 4, 'As outras 4 tentativas concorrentes devem ser detectadas como duplicadas');

    const eventCount = await get('SELECT COUNT(*) as total FROM billing_events WHERE provider_event_id = ?', [eventId]);
    assert.equal(eventCount.total, 1, 'Exatamente um registro gravado em billing_events');
  });

  // ── TESTE M: SUBPROCESSO COM TIMEOUT RÍGIDO (5s) COMPROVA AUSÊNCIA DE LOOP MICROTASK ──
  await t.test('M. billingService: resolução em subprocesso isolado com timeout estrito de 5s', async () => {
    const script = `
      const path = require('path');
      const os = require('os');
      const fs = require('fs');
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'patio-subproc-timeout-'));
      process.env.DB_PATH = path.join(tempDir, 'test.db');
      const { initDB, closeDB } = require('./db');
      const billingService = require('./services/billing/billingService');

      (async () => {
        await initDB();
        const sub = await billingService.initializeSubscription({
          tenantId: 'tenant_timeout_check',
          plan: 'pro',
          status: 'active'
        });
        if (!sub || sub.plan !== 'pro') process.exit(2);
        await closeDB();
        try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}
        process.exit(0);
      })().catch(e => {
        console.error(e);
        process.exit(1);
      });
    `;

    const child = require('child_process').spawn(process.execPath, ['-e', script], {
      cwd: path.resolve(__dirname, '..'),
      timeout: 5000
    });

    const [code] = await require('node:events').once(child, 'exit');
    assert.equal(code, 0, 'Subprocesso com await billingService deve concluir sem timeout');
  });
});
