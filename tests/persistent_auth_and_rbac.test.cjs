'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { initDB, run, get } = require('../db');
const userRepository = require('../lib/auth/userRepository');
const { filterStateByRole, persistState, getState, getDefaultState } = require('../lib/repository/stateRepository');

test('Autenticação Persistente & RBAC no Pátio CRM', async (t) => {
  await initDB();

  await t.test('1. Validação estrita da política de senhas', () => {
    // Menor que 12 caracteres (produção)
    const r1 = userRepository.validatePasswordPolicy('Curta1@', { allowWeakInTest: false });
    assert.equal(r1.valid, false);
    assert.ok(r1.errors.some(e => e.includes('12 caracteres')));

    // Senha fraca conhecida (insecure passwords list)
    const r2 = userRepository.validatePasswordPolicy('patio-password-test', { allowWeakInTest: false });
    assert.equal(r2.valid, false);
    assert.ok(r2.errors.some(e => e.includes('fraca')));

    // Sem maiúscula ou símbolo
    const r3 = userRepository.validatePasswordPolicy('senhasemletramaiuscula123', { allowWeakInTest: false });
    assert.equal(r3.valid, false);

    // Senha forte válida
    const r4 = userRepository.validatePasswordPolicy('OficinaSegura#2026@Forte', { allowWeakInTest: false });
    assert.equal(r4.valid, true);
    assert.equal(r4.errors.length, 0);
  });

  await t.test('2. Hash criptográfico com Scrypt e Salt individual', async () => {
    const pwd = 'TesteSenhaSegura@2026';
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = userRepository.hashPassword(pwd, salt);
    assert.ok(hash);
    assert.ok(salt);
    assert.equal(salt.length, 32); // 16 bytes hex

    const matchOk = userRepository.verifyPassword(pwd, hash, salt);
    assert.equal(matchOk, true);

    const matchErr = userRepository.verifyPassword('SenhaIncorreta@2026', hash, salt);
    assert.equal(matchErr, false);
  });

  await t.test('3. Criação de usuário durável no SQLite e persistência', async () => {
    const uniqueUser = `gestor_${Date.now()}@oficina.com.br`;
    const tenantId = `tenant_${Date.now()}`;
    const password = 'MinhaSenhaDeGestor#2026';

    const created = await userRepository.createUser({
      username: uniqueUser,
      email: uniqueUser,
      password,
      role: 'tenant_admin',
      tenantId,
      fullName: 'Gestor da Oficina',
      allowWeakInTest: false
    });

    assert.ok(created.id);
    assert.equal(created.username, uniqueUser);
    assert.equal(created.role, 'tenant_admin');

    // Recupera diretamente do banco SQLite para comprovar persistência física
    const dbUser = await userRepository.getUserByUsername(uniqueUser);
    assert.ok(dbUser);
    assert.equal(dbUser.username, uniqueUser);
    assert.ok(dbUser.memberships.some(m => m.tenantId === tenantId));

    // Autenticação com credenciais válidas
    const authOk = await userRepository.authenticateUser(uniqueUser, password);
    assert.equal(authOk.success, true);
    assert.equal(authOk.user.username, uniqueUser);

    // Tentativa com senha errada
    const authFail = await userRepository.authenticateUser(uniqueUser, 'SenhaErrada#2026');
    assert.equal(authFail.success, false);
  });

  await t.test('4. Bloqueio automático de conta após 5 tentativas consecutivas incorretas', async () => {
    const bruteUser = `brute_${Date.now()}@oficina.com.br`;
    const password = 'SenhaForteOriginal#2026';

    await userRepository.createUser({
      username: bruteUser,
      email: bruteUser,
      password,
      role: 'gerente',
      allowWeakInTest: false
    });

    // 4 falhas consecutivas
    for (let i = 0; i < 4; i++) {
      const res = await userRepository.authenticateUser(bruteUser, 'SenhaErrada#1234');
      assert.equal(res.success, false);
      assert.equal(res.locked, false);
    }

    // 5ª falha -> bloqueio disparado
    const lockRes = await userRepository.authenticateUser(bruteUser, 'SenhaErrada#1234');
    assert.equal(lockRes.success, false);
    assert.equal(lockRes.locked, true);
    assert.ok(lockRes.error.includes('bloqueada temporariamente'));

    // Mesmo com a senha correta, permanece bloqueada durante o período de lockout
    const blockedWithRightPass = await userRepository.authenticateUser(bruteUser, password);
    assert.equal(blockedWithRightPass.success, false);
    assert.equal(blockedWithRightPass.locked, true);
  });

  await t.test('5. Registro e auditoria de consentimento LGPD dos Termos e Privacidade', async () => {
    const consentUser = `consent_${Date.now()}@oficina.com.br`;
    const user = await userRepository.createUser({
      username: consentUser,
      email: consentUser,
      password: 'ConsentPassword@2026',
      role: 'tenant_admin',
      allowWeakInTest: false
    });

    const consent = await userRepository.recordTermsConsent({
      userId: user.id,
      tenantId: 'tenant_lgpd_test',
      termsVersion: '1.0.0',
      privacyVersion: '1.0.0',
      ipAddress: '192.168.1.100',
      userAgent: 'Mozilla/5.0 Test Suite'
    });

    assert.ok(consent.id);
    assert.ok(consent.acceptedAt);

    // Verifica inserção direta na tabela terms_consents
    const row = await get('SELECT * FROM terms_consents WHERE id = ?', [consent.id]);
    assert.ok(row);
    assert.equal(row.user_id, user.id);
    assert.equal(row.terms_version, '1.0.0');
    assert.equal(row.ip_address, '192.168.1.100');
  });

  await t.test('6. Filtragem de estado por papel (RBAC filterStateByRole)', () => {
    const mockState = {
      os: [{ id: 1, placa: 'ABC-1234', valorTotal: 1500 }],
      veiculos: [{ id: 1, placa: 'ABC-1234' }],
      pecas: [{ id: 10, nome: 'Pastilha', estoque: 5, precoVenda: 120, custoMedio: 60 }],
      contas: [{ id: 101, valor: 1500, tipo: 'receber' }],
      caixa: { saldo: 50000, entradas: 65000, saidas: 15000 },
      financeiro: { faturamentoTotal: 85000, custosTotal: 35000, margemOperacional: 50000 },
      cfg: { empresa: 'Oficina Central', apiKeyExterna: 'sec_12345', fone: '11999999999' },
      auditoria: [{ id: 'aud_1', acao: 'login_admin', timestamp: '2026-09-14' }]
    };

    // A. Atendente / Consultor: NÃO vê contas, caixa, financeiro nem auditoria
    const ctxAtendente = { role: 'atendente', permissions: userRepository.ROLE_PERMISSIONS.atendente };
    const filteredAtendente = filterStateByRole(mockState, ctxAtendente);

    assert.ok(filteredAtendente.os, 'Atendente tem acesso a OS');
    assert.ok(filteredAtendente.veiculos, 'Atendente tem acesso a veículos');
    assert.equal(filteredAtendente.contas.length, 0, 'Contas a receber/pagar devem ser ocultadas');
    assert.equal(filteredAtendente.caixa.saldo, 0, 'Saldo de caixa deve ser zerado para atendente');
    assert.equal(filteredAtendente.financeiro.faturamentoTotal, 0, 'Métricas financeiras ocultadas');
    assert.equal(filteredAtendente.auditoria.length, 0, 'Log de auditoria ocultado para operador');
    assert.equal(filteredAtendente.cfg.apiKeyExterna, undefined, 'Segredos de configuração ocultados');

    // B. Mecânico: apenas ordens de serviço, veículos e catálogo técnico
    const ctxMecanico = { role: 'mecanico', permissions: userRepository.ROLE_PERMISSIONS.mecanico };
    const filteredMecanico = filterStateByRole(mockState, ctxMecanico);
    assert.ok(filteredMecanico.os);
    assert.equal(filteredMecanico.contas.length, 0);
    assert.equal(filteredMecanico.caixa.saldo, 0);

    // C. Tenant Admin: Acesso a dados financeiros operacionais da sua oficina
    const ctxAdmin = { role: 'tenant_admin', permissions: ['*'] };
    const filteredAdmin = filterStateByRole(mockState, ctxAdmin);
    assert.equal(filteredAdmin.contas.length, 1, 'Admin tem acesso total às contas');
    assert.equal(filteredAdmin.caixa.saldo, 50000, 'Admin visualiza saldo gerencial');
    assert.equal(filteredAdmin.financeiro.faturamentoTotal, 85000);
    assert.equal(filteredAdmin.auditoria.length, 1);
  });

  await t.test('7. Imutabilidade do log de auditoria (Append-only mesmo para Admin)', async () => {
    const tenantId = `tenant_audit_${Date.now()}`;
    const adminContext = {
      tenantId,
      actorId: 'admin_rogue',
      role: 'tenant_admin',
      permissions: ['*'],
      channel: 'http'
    };

    // Estado inicial com uma entrada de auditoria
    const state1 = getDefaultState(tenantId);
    state1.auditoria = [{ id: 'audit_init', acao: 'setup', autor: 'admin' }];
    const res1 = await persistState(adminContext, state1, { enqueueWrite: async (fn) => fn() });
    assert.ok(res1.ok);

    // Tentativa de adulterar ou apagar o histórico de auditoria
    const state2 = JSON.parse(JSON.stringify(res1.state));
    state2.auditoria = [{ id: 'audit_falsificado', acao: 'apaguei_os_rastros' }];
    const res2 = await persistState(adminContext, state2, { enqueueWrite: async (fn) => fn() });
    assert.ok(res2.ok);

    // O repositório preserva todas as entradas antigas e apenas anexa a nova
    const persisted = await getState(tenantId);
    const hasOriginal = persisted.auditoria.some(a => a.id === 'audit_init');
    const hasNew = persisted.auditoria.some(a => a.id === 'audit_falsificado');
    assert.equal(hasOriginal, true, 'Registro original de auditoria não pode ser deletado');
    assert.equal(hasNew, true, 'Nova entrada é anexada com sucesso');
  });
});
