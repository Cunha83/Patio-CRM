'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

// Configura banco isolado para a suíte de testes
const tempDbDir = fs.mkdtempSync(path.join(os.tmpdir(), 'patio-auth-rbac-test-'));
const testDbPath = path.join(tempDbDir, 'patio_auth_test.db');
process.env.DB_PATH = testDbPath;
process.env.NODE_ENV = 'test';

const { initDB, run, get, all, closeDB } = require('../db');
const userRepository = require('../lib/auth/userRepository');
const { IdentityRegistry } = require('../lib/auth/identity');
const { createAuthMiddleware } = require('../lib/auth/context');
const { getState, persistState } = require('../lib/repository/stateRepository');
const erpIntegrationService = require('../services/erpIntegrationService');
const backupService = require('../services/backupService');

test('Hardening Operacional: Lockout Real, Troca Obrigatória de Senha, Preservação RBAC, Auditoria e ERP Outbox', async (t) => {
  await initDB();

  t.after(async () => {
    try {
      await closeDB();
    } catch (_) {}
    try {
      fs.rmSync(tempDbDir, { recursive: true, force: true });
    } catch (_) {}
  });

  const registry = new IdentityRegistry({ allowWeakInTest: true });

  // ── 1. BLOQUEIO REAL POR TENTATIVAS INCORRETAS (LOCKOUT) ──
  await t.test('1. Lockout após 5 tentativas incorretas bloqueia conta no SQLite e no IdentityRegistry', async () => {
    const testUsername = `op_lockout_${Date.now()}@example.com`;
    const correctPassword = 'SenhaForte#2026';

    const user = await userRepository.createUser({
      username: testUsername,
      password: correctPassword,
      role: 'operador',
      tenantId: 'oficina_lockout',
      allowWeakInTest: false,
      memberships: [{ tenantId: 'oficina_lockout', role: 'operador' }]
    });

    registry.registerUser({
      username: testUsername,
      password: correctPassword,
      passwordHash: user.password_hash,
      salt: user.password_salt,
      memberships: [{ tenantId: 'oficina_lockout', role: 'operador' }]
    });

    const middleware = createAuthMiddleware(registry);

    // 4 tentativas incorretas: conta ainda não bloqueada (retorna 401)
    for (let i = 1; i <= 4; i++) {
      let statusCode = null;
      let jsonBody = null;
      const resMock = {
        setHeader: () => {},
        status: (s) => { statusCode = s; return { json: (j) => { jsonBody = j; } }; }
      };

      const reqMock = {
        headers: {
          authorization: 'Basic ' + Buffer.from(`${testUsername}:SenhaErrada#${i}`).toString('base64'),
          'x-tenant-id': 'oficina_lockout'
        },
        path: '/api/estado',
        method: 'GET'
      };

      middleware(reqMock, resMock, () => {});
      assert.equal(statusCode, 401, `Tentativa ${i} deve falhar com 401`);
    }

    // 5ª tentativa incorreta: ativa lockout temporário de 15 minutos (retorna 423)
    let statusCode5 = null;
    let jsonBody5 = null;
    const resMock5 = {
      setHeader: () => {},
      status: (s) => { statusCode5 = s; return { json: (j) => { jsonBody5 = j; } }; }
    };
    const reqMock5 = {
      headers: {
        authorization: 'Basic ' + Buffer.from(`${testUsername}:SenhaErrada#5`).toString('base64'),
        'x-tenant-id': 'oficina_lockout'
      },
      path: '/api/estado',
      method: 'GET'
    };

    middleware(reqMock5, resMock5, () => {});
    assert.equal(statusCode5, 423, '5ª tentativa deve retornar HTTP 423 Locked');
    assert.equal(jsonBody5.error, 'account_locked');

    // Tentativa subsequente COM A SENHA CORRETA deve continuar BLOQUEADA
    let statusCodeCorreta = null;
    let jsonBodyCorreta = null;
    const resMockCorreta = {
      setHeader: () => {},
      status: (s) => { statusCodeCorreta = s; return { json: (j) => { jsonBodyCorreta = j; } }; }
    };
    const reqMockCorreta = {
      headers: {
        authorization: 'Basic ' + Buffer.from(`${testUsername}:${correctPassword}`).toString('base64'),
        'x-tenant-id': 'oficina_lockout'
      },
      path: '/api/estado',
      method: 'GET'
    };

    middleware(reqMockCorreta, resMockCorreta, () => {});
    assert.equal(statusCodeCorreta, 423, 'Conta bloqueada não pode autenticar nem com senha correta');
  });

  // ── 2. OBRIGATORIEDADE DE TROCA DE SENHA (mustChangePassword) ──
  await t.test('2. mustChangePassword bloqueia operações com HTTP 403 e libera apenas rota de troca', async () => {
    const userMustChange = `admin_temp_${Date.now()}@example.com`;
    const tempPass = 'SenhaTemporaria#123';

    const user = await userRepository.createUser({
      username: userMustChange,
      password: tempPass,
      role: 'tenant_admin',
      tenantId: 'oficina_troca_senha',
      mustChangePassword: true,
      allowWeakInTest: false,
      memberships: [{ tenantId: 'oficina_troca_senha', role: 'tenant_admin' }]
    });

    registry.registerUser({
      username: userMustChange,
      password: tempPass,
      passwordHash: user.password_hash,
      salt: user.password_salt,
      mustChangePassword: true,
      memberships: [{ tenantId: 'oficina_troca_senha', role: 'tenant_admin' }]
    });

    const middleware = createAuthMiddleware(registry);

    // Tentativa de acessar /api/estado deve ser barrada com 403 password_change_required
    let statusBloqueado = null;
    let bodyBloqueado = null;
    const resBloq = {
      setHeader: () => {},
      status: (s) => { statusBloqueado = s; return { json: (j) => { bodyBloqueado = j; } }; }
    };
    const reqBloq = {
      headers: {
        authorization: 'Basic ' + Buffer.from(`${userMustChange}:${tempPass}`).toString('base64'),
        'x-tenant-id': 'oficina_troca_senha'
      },
      path: '/api/estado',
      method: 'GET'
    };

    let nextCalledBloq = false;
    middleware(reqBloq, resBloq, () => { nextCalledBloq = true; });

    assert.equal(nextCalledBloq, false, 'Middleware não deve chamar next() para rotas operacionais');
    assert.equal(statusBloqueado, 403);
    assert.equal(bodyBloqueado.error, 'password_change_required');

    // Acesso à rota de troca de senha /api/auth/change-password é permitido
    let nextCalledTroca = false;
    const reqTroca = {
      headers: {
        authorization: 'Basic ' + Buffer.from(`${userMustChange}:${tempPass}`).toString('base64'),
        'x-tenant-id': 'oficina_troca_senha'
      },
      path: '/api/auth/change-password',
      method: 'POST'
    };
    middleware(reqTroca, resBloq, () => { nextCalledTroca = true; });
    assert.equal(nextCalledTroca, true, 'Middleware DEVE permitir rota de troca de senha');
  });

  // ── 3. RECUPERAÇÃO E REDEFINIÇÃO DE SENHA COM TOKEN ÚNICO ──
  await t.test('3. Fluxo de recuperação de senha: token expira, é de uso único e atualiza credencial', async () => {
    const userReset = `usuario_recuperacao_${Date.now()}@example.com`;
    const oldPass = 'SenhaAntiga#12345';
    const newPass = 'NovaSenhaSuper#2026';

    await userRepository.createUser({
      username: userReset,
      password: oldPass,
      role: 'atendente',
      tenantId: 'oficina_reset',
      allowWeakInTest: false,
      memberships: [{ tenantId: 'oficina_reset', role: 'atendente' }]
    });

    // 1. Gera token de recuperação
    const tokenInfo = await userRepository.createPasswordResetToken(userReset);
    assert.ok(tokenInfo.token);
    assert.equal(tokenInfo.token.length, 64);

    // 2. Token é verificado com sucesso
    const verify1 = await userRepository.verifyPasswordResetToken(tokenInfo.token);
    assert.equal(verify1.valid, true);
    assert.equal(verify1.user.username, userReset);

    // 3. Redefine a senha com o token
    const resetResult = await userRepository.resetPasswordWithToken(tokenInfo.token, newPass, { allowWeakInTest: false });
    assert.equal(resetResult.success, true);

    // 4. Token reutilizado DEVE ser rejeitado (uso único)
    await assert.rejects(async () => {
      await userRepository.resetPasswordWithToken(tokenInfo.token, 'OutraSenha#2026', { allowWeakInTest: false });
    }, /Link de redefinição já utilizado/);

    // 5. Autenticação com senha antiga falha, com a nova tem sucesso
    const authOld = await userRepository.authenticateUser(userReset, oldPass);
    assert.equal(authOld.success, false);

    const authNew = await userRepository.authenticateUser(userReset, newPass);
    assert.equal(authNew.success, true);
    assert.equal(authNew.user.mustChangePassword, false);
  });

  // ── 4. PRESERVAÇÃO RBAC EM POST /api/estado ──
  await t.test('4. Mecânico ou Atendente postando /api/estado NÃO apaga contas, caixa, fornecedores ou compras', async () => {
    const tenantId = `tenant_rbac_preserv_${Date.now()}`;
    const adminCtx = { tenantId, role: 'tenant_admin', permissions: ['*'], channel: 'internal' };

    // Estado inicial completo salvo pelo Administrador
    const estadoCompleto = {
      versao: 1,
      os: [{ id: 'os_101', placa: 'ABC-1234', valorTotal: 3500 }],
      veiculos: [{ id: 'vei_1', placa: 'ABC-1234' }],
      clientes: [{ id: 'cli_1', nome: 'Transportes ABC' }],
      contas: [
        { id: 'cnt_1', valor: 3500, tipo: 'receber', status: 'pendente' }
      ],
      caixa: { saldo: 75000, entradas: 120000, saidas: 45000 },
      financeiro: { faturamentoTotal: 150000, custosTotal: 60000, margemOperacional: 90000 },
      suppliers: [{ id: 'forn_1', name: 'Molas Maringá' }],
      purchaseOrders: [{ id: 'ped_1', supplierId: 'forn_1', totalAmount: 4200 }],
      pricingOverrides: [{ id: 'po_1', pecaId: 'pec_1', precoManual: 150 }]
    };

    const resAdmin = await persistState(adminCtx, estadoCompleto, { enqueueWrite: async (fn) => fn() });
    assert.equal(resAdmin.ok, true);

    // Contexto de mecânico (sem permissões financeiras nem de compras)
    const mecCtx = { tenantId, role: 'mecanico', permissions: ['os:read', 'os:write', 'labor:write'], channel: 'http' };

    // O mecânico submete seu estado local (onde coleções financeiras e compras vieram vazias por sanitização)
    const estadoMecanico = {
      versao: resAdmin.versao,
      os: [{ id: 'os_101', placa: 'ABC-1234', valorTotal: 3500, status: 'em_execucao' }],
      veiculos: [{ id: 'vei_1', placa: 'ABC-1234' }],
      clientes: [{ id: 'cli_1', nome: 'Transportes ABC' }],
      contas: [], // Sanitizado pelo RBAC no GET
      caixa: { saldo: 0, entradas: 0, saidas: 0 },
      financeiro: { faturamentoTotal: 0, custosTotal: 0, margemOperacional: 0 },
      suppliers: [], // Ocultado para mecânico
      purchaseOrders: [], // Ocultado para mecânico
      pricingOverrides: []
    };

    const resMec = await persistState(mecCtx, estadoMecanico, { enqueueWrite: async (fn) => fn() });
    assert.equal(resMec.ok, true);

    // Recupera o estado do banco e verifica se os dados sensíveis foram preservados
    const estadoSalvo = await getState(tenantId);
    assert.equal(estadoSalvo.contas.length, 1, 'Contas a receber NÃO devem ser apagadas pelo mecânico');
    assert.equal(estadoSalvo.contas[0].valor, 3500);
    assert.equal(estadoSalvo.caixa.saldo, 75000, 'Saldo de caixa NÃO deve ser zerado');
    assert.equal(estadoSalvo.financeiro.faturamentoTotal, 150000, 'Métricas financeiras preservadas');
    assert.equal(estadoSalvo.suppliers.length, 1, 'Fornecedores NÃO devem ser apagados');
    assert.equal(estadoSalvo.purchaseOrders.length, 1, 'Pedidos de compra NÃO devem ser apagados');
    assert.equal(estadoSalvo.os[0].status, 'em_execucao', 'Alteração legítima da OS pelo mecânico é mantida');
  });

  // ── 5. FILA ASSÍNCRONA ERP OUTBOX E RETRIES ──
  await t.test('5. ERP Outbox enfileira, lista e processa itens com backoff e atualização de status', async () => {
    const tenantId = `tenant_erp_${Date.now()}`;

    // 1. Enfileira 2 eventos na outbox
    const enq1 = await erpIntegrationService.enfileirarParaERP({
      tenantId,
      entityType: 'cliente',
      entityId: 'cli_demo_99',
      action: 'created',
      payload: { nome: 'Empresa Teste ERP', doc: '12.345.678/0001-90' }
    });
    assert.equal(enq1.ok, true);

    const enq2 = await erpIntegrationService.enfileirarParaERP({
      tenantId,
      entityType: 'os',
      entityId: 'os_demo_88',
      action: 'completed',
      payload: { placa: 'ERP-9999', total: 4500 }
    });
    assert.equal(enq2.ok, true);

    // 2. Lista itens pendentes
    const lista = await erpIntegrationService.listarItensOutbox({ tenantId, status: 'pending' });
    assert.equal(lista.length, 2);

    // 3. Processa a fila com mock dispatcher com sucesso para cliente e falha para OS
    const dispatchResults = [];
    const mockDispatcher = async (item) => {
      dispatchResults.push(item.entityType);
      if (item.entityType === 'os') {
        throw new Error('Falha de conexão com o Webhook Totvs');
      }
    };

    const processRes = await erpIntegrationService.processarFilaOutbox({
      tenantId,
      dispatcherFn: mockDispatcher
    });

    assert.equal(processRes.total, 2);
    assert.equal(processRes.processados, 1);
    assert.equal(processRes.falhas, 1);

    // 4. Verifica status no banco de controle
    const statusIntegracao = await erpIntegrationService.obterStatusIntegracao({ tenantId });
    assert.equal(statusIntegracao.outbox.sincronizados, 1);
    assert.equal(statusIntegracao.outbox.erros, 1);

    // 5. Reprocessamento do item que falhou
    const itensFalhos = await erpIntegrationService.listarItensOutbox({ tenantId, status: 'failed' });
    assert.equal(itensFalhos.length, 1);
    assert.ok(itensFalhos[0].lastError.includes('Totvs'));

    await erpIntegrationService.reprocessarItemOutbox({ outboxId: itensFalhos[0].id });
    const pendentesAposRetry = await erpIntegrationService.listarItensOutbox({ tenantId, status: 'pending' });
    assert.equal(pendentesAposRetry.length, 1);
  });

  // ── 6. RESTAURAÇÃO ISOLADA END-TO-END (RTO < 5s) ──
  await t.test('6. Restauração isolada com nova instância SQLite, PRAGMA integrity_check e RTO medido', async () => {
    const backupDir = path.join(tempDbDir, 'backups_wal');
    fs.mkdirSync(backupDir, { recursive: true });

    // Gera snapshot atômico WAL
    const resBackup = await backupService.executarBackupWal({
      tenantId: '_all_',
      actorId: 'restore_tester',
      backupDir
    });
    assert.equal(resBackup.ok, true);

    const targetRestorePath = path.join(tempDbDir, 'restored_isolated.db');

    // Executa restauração completa copiando e verificando
    const t0 = performance.now();
    const resRestore = await backupService.restaurarBackup({
      backupFilepath: resBackup.filepath,
      expectedChecksum: resBackup.checksumSha256,
      targetDbPath: targetRestorePath,
      verifyOnly: false
    });
    const rto = performance.now() - t0;

    assert.equal(resRestore.ok, true);
    assert.equal(resRestore.integrityCheck, 'ok');
    assert.ok(fs.existsSync(targetRestorePath), 'Arquivo restaurado deve existir');
    assert.ok(rto < 5000, `RTO medido (${rto.toFixed(2)}ms) deve ser estritamente inferior a 5000ms`);

    // Abre instância SQLite totalmente separada no arquivo restaurado e valida integridade dos dados
    const sqlite3 = require('sqlite3').verbose();
    await new Promise((resolve, reject) => {
      const dbRestored = new sqlite3.Database(targetRestorePath, sqlite3.OPEN_READONLY, (err) => {
        if (err) return reject(err);
        dbRestored.all('SELECT name FROM sqlite_master WHERE type="table"', (tabErr, tables) => {
          if (tabErr) {
            dbRestored.close();
            return reject(tabErr);
          }
          const tableNames = tables.map(t => t.name);
          assert.ok(tableNames.includes('users'));
          assert.ok(tableNames.includes('memberships'));
          assert.ok(tableNames.includes('kv'));
          assert.ok(tableNames.includes('backups'));
          assert.ok(tableNames.includes('erp_outbox'));

          dbRestored.close((closeErr) => {
            if (closeErr) return reject(closeErr);
            resolve();
          });
        });
      });
    });
  });
});
