'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');

test('Fase B: Autenticação Multi-Usuário, RBAC por Perfil, Isolamento Multi-Tenant e Auditoria', { timeout: 120000 }, async t => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'patio-fase-b-'));
  const probe = net.createServer();
  probe.listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const port = probe.address().port;
  await new Promise(r => probe.close(r));
  const root = path.resolve(__dirname, '..');

  let logs = '';
  let child;

  async function start() {
    child = spawn(process.execPath, ['server.js'], {
      cwd: root,
      windowsHide: true,
      env: {
        ...process.env,
        PORT: String(port),
        API_KEY: 'test-fase-b-key',
        GEMINI_API_KEY: '',
        DISABLE_INTEGRATIONS: 'true',
        DB_PATH: path.join(temp, 'test.db')
      }
    });

    child.stdout.on('data', d => { logs += d; });
    child.stderr.on('data', d => { logs += d; });

    for (let i = 0; i < 500; i++) {
      if (child.exitCode !== null) throw Error('Processo terminou prematuramente: ' + logs);
      try {
        const res = await fetch(`http://127.0.0.1:${port}/ready`);
        if (res.status === 200 || res.status === 401) return;
      } catch (_) {}
      await new Promise(r => setTimeout(r, 100));
    }
    throw Error('Servidor não iniciou: ' + logs);
  }

  async function stop() {
    if (child && child.exitCode === null) {
      const done = once(child, 'exit');
      child.kill();
      await done;
    }
  }

  t.after(async () => {
    await stop();
    fs.rmSync(temp, { recursive: true, force: true });
  });

  await start();

  const baseUrl = `http://127.0.0.1:${port}`;

  const postJson = (url, body, headers = {}) => fetch(`${baseUrl}${url}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body)
  });

  const getJson = (url, headers = {}) => fetch(`${baseUrl}${url}`, {
    method: 'GET',
    headers: { ...headers }
  });

  const deleteJson = (url, body = null, headers = {}) => fetch(`${baseUrl}${url}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body ? JSON.stringify(body) : undefined
  });

  const putJson = (url, body, headers = {}) => fetch(`${baseUrl}${url}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body)
  });

  // ── 1. LOGIN DOS 4 PERFIS BASE E EMISSÃO DE TOKEN HMAC ────────
  let tokenAdmin, tokenVendedor, tokenCaixa, tokenMecanico;

  // 1.1 Gerente Geral (admin)
  const loginAdminRes = await postJson('/api/auth/login', { username: 'admin', password: 'admin123' });
  assert.equal(loginAdminRes.status, 200, 'Login do admin deve retornar 200');
  const loginAdminData = await loginAdminRes.json();
  assert.ok(loginAdminData.success);
  assert.ok(loginAdminData.token, 'Deve retornar token assinado');
  assert.equal(loginAdminData.user.role, 'admin');
  assert.equal(loginAdminData.user.cargo, 'Gerente Geral');
  tokenAdmin = loginAdminData.token;

  // 1.2 Consultor / Vendedor (vendedor)
  const loginVendedorRes = await postJson('/api/auth/login', { username: 'vendedor', password: 'vendedor123' });
  assert.equal(loginVendedorRes.status, 200, 'Login do vendedor deve retornar 200');
  const loginVendedorData = await loginVendedorRes.json();
  assert.ok(loginVendedorData.success);
  assert.equal(loginVendedorData.user.role, 'vendedor');
  assert.equal(loginVendedorData.user.cargo, 'Consultor / Vendedor');
  tokenVendedor = loginVendedorData.token;

  // 1.3 Financeiro / Caixa (caixa)
  const loginCaixaRes = await postJson('/api/auth/login', { username: 'caixa', password: 'caixa123' });
  assert.equal(loginCaixaRes.status, 200, 'Login do caixa deve retornar 200');
  const loginCaixaData = await loginCaixaRes.json();
  assert.ok(loginCaixaData.success);
  assert.equal(loginCaixaData.user.role, 'caixa');
  assert.equal(loginCaixaData.user.cargo, 'Financeiro / Caixa');
  tokenCaixa = loginCaixaData.token;

  // 1.4 Mecânico de Pátio (mecanico)
  const loginMecanicoRes = await postJson('/api/auth/login', { username: 'mecanico', password: 'mecanico123' });
  assert.equal(loginMecanicoRes.status, 200, 'Login do mecânico deve retornar 200');
  const loginMecanicoData = await loginMecanicoRes.json();
  assert.ok(loginMecanicoData.success);
  assert.equal(loginMecanicoData.user.role, 'mecanico');
  assert.equal(loginMecanicoData.user.cargo, 'Mecânico / Operador de Box');
  tokenMecanico = loginMecanicoData.token;

  // ── 2. VERIFICAÇÃO DE SESSÃO (/api/auth/me) ──────────────────
  // 2.1 Sem token
  const meSemToken = await getJson('/api/auth/me');
  assert.equal(meSemToken.status, 401, 'Requisição sem token deve retornar 401');

  // 2.2 Com Bearer Token do Admin
  const meAdmin = await getJson('/api/auth/me', { 'Authorization': `Bearer ${tokenAdmin}` });
  assert.equal(meAdmin.status, 200);
  const meAdminData = await meAdmin.json();
  assert.equal(meAdminData.user.role, 'admin');

  // 2.3 Com Bearer Token do Mecânico
  const meMecanico = await getJson('/api/auth/me', { 'Authorization': `Bearer ${tokenMecanico}` });
  assert.equal(meMecanico.status, 200);
  const meMecanicoData = await meMecanico.json();
  assert.equal(meMecanicoData.user.role, 'mecanico');

  // ── 3. ISOLAMENTO RBAC E PROTEÇÃO 403 FORBIDDEN ──────────────
  // 3.1 Mecânico tentando exclusão em lote (/api/:entidade/lote) -> deve retornar 403
  const delLoteMecanico = await deleteJson('/api/pecas/lote', { ids: ['p1'] }, { 'Authorization': `Bearer ${tokenMecanico}` });
  assert.equal(delLoteMecanico.status, 403, 'Mecânico deve receber 403 ao tentar exclusão em lote');

  // 3.2 Mecânico tentando acessar gestão de usuários (/api/usuarios) -> deve retornar 403
  const usuariosMecanico = await getJson('/api/usuarios', { 'Authorization': `Bearer ${tokenMecanico}` });
  assert.equal(usuariosMecanico.status, 403, 'Mecânico deve receber 403 ao tentar listar usuários');

  // 3.3 Vendedor tentando acessar gestão de usuários (/api/usuarios) -> deve retornar 403
  const usuariosVendedor = await getJson('/api/usuarios', { 'Authorization': `Bearer ${tokenVendedor}` });
  assert.equal(usuariosVendedor.status, 403, 'Vendedor deve receber 403 ao tentar listar usuários');

  // 3.4 Mecânico tentando gerar Pix (/api/financeiro/pix/gerar) -> deve retornar 403
  const pixMecanico = await postJson('/api/financeiro/pix/gerar', { osId: '101', valor: 100 }, { 'Authorization': `Bearer ${tokenMecanico}` });
  assert.equal(pixMecanico.status, 403, 'Mecânico deve receber 403 ao tentar movimentar financeiro');

  // 3.5 Mecânico tentando deletar OS (/api/os/:id) -> deve retornar 403
  const delOsMecanico = await deleteJson('/api/os/101', null, { 'Authorization': `Bearer ${tokenMecanico}` });
  assert.equal(delOsMecanico.status, 403, 'Mecânico deve receber 403 ao tentar deletar OS');

  // 3.6 Caixa tentando deletar OS (/api/os/:id) -> deve retornar 403
  const delOsCaixa = await deleteJson('/api/os/101', null, { 'Authorization': `Bearer ${tokenCaixa}` });
  assert.equal(delOsCaixa.status, 403, 'Caixa não pode excluir OS (403)');

  // 3.7 Vendedor tentando consultar auditoria (/api/auditoria) -> deve retornar 403
  const auditVendedor = await getJson('/api/auditoria', { 'Authorization': `Bearer ${tokenVendedor}` });
  assert.equal(auditVendedor.status, 403, 'Vendedor não pode ver trilha de auditoria');

  // ── 4. CRUD DE USUÁRIOS PELO GERENTE GERAL (ADMIN) ───────────
  // 4.1 Admin lista usuários com sucesso
  const usuariosAdmin = await getJson('/api/usuarios', { 'Authorization': `Bearer ${tokenAdmin}` });
  assert.equal(usuariosAdmin.status, 200, 'Admin deve conseguir listar usuários');
  const usuariosLista = await usuariosAdmin.json();
  assert.ok(Array.isArray(usuariosLista.usuarios));
  assert.ok(usuariosLista.usuarios.length >= 4, 'Deve conter ao menos os 4 usuários base');

  // 4.2 Admin cadastra novo funcionário
  const novoUserPayload = {
    username: 'mecanico_junior',
    nome: 'Mecânico Júnior Teste',
    email: 'mecanico.jr@automolas.com.br',
    role: 'mecanico',
    senha: 'senhaSegura123'
  };
  const createRes = await postJson('/api/usuarios', novoUserPayload, { 'Authorization': `Bearer ${tokenAdmin}` });
  assert.equal(createRes.status, 201, 'Admin deve conseguir cadastrar novo usuário');
  const createData = await createRes.json();
  assert.ok(createData.user.id);
  const novoUserId = createData.user.id;

  // 4.3 Login com a nova conta criada
  const loginNovoRes = await postJson('/api/auth/login', { username: 'mecanico_junior', password: 'senhaSegura123' });
  assert.equal(loginNovoRes.status, 200, 'Novo usuário criado deve conseguir se autenticar');
  const loginNovoData = await loginNovoRes.json();
  assert.equal(loginNovoData.user.role, 'mecanico');

  // 4.4 Admin atualiza dados do funcionário
  const updateRes = await putJson(`/api/usuarios/${novoUserId}`, { nome: 'Mecânico Pleno Promovido' }, { 'Authorization': `Bearer ${tokenAdmin}` });
  assert.equal(updateRes.status, 200);
  const updateData = await updateRes.json();
  assert.equal(updateData.user.name, 'Mecânico Pleno Promovido');

  // 4.5 Admin desativa usuário
  const delUserRes = await deleteJson(`/api/usuarios/${novoUserId}`, null, { 'Authorization': `Bearer ${tokenAdmin}` });
  assert.equal(delUserRes.status, 200);

  // ── 5. TRILHA DE AUDITORIA (/api/auditoria) ──────────────────
  const auditRes = await getJson('/api/auditoria', { 'Authorization': `Bearer ${tokenAdmin}` });
  assert.equal(auditRes.status, 200, 'Admin deve conseguir ler a trilha de auditoria');
  const auditData = await auditRes.json();
  assert.ok(Array.isArray(auditData.auditoria));
  assert.ok(auditData.auditoria.length > 0, 'Auditoria deve registrar eventos anteriores');
  const acoes = auditData.auditoria.map(a => a.acao);
  assert.ok(acoes.includes('USER_LOGIN_SUCCESS'), 'Deve registrar logins com sucesso');
  assert.ok(acoes.includes('USER_CREATED'), 'Deve registrar criação de usuário');

  // ── 6. RETROCOMPATIBILIDADE COM BASIC AUTH patio:patio ───────
  const basicAuthHeader = 'Basic ' + Buffer.from('patio:patio').toString('base64');
  const resBasicMe = await getJson('/api/auth/me', { 'Authorization': basicAuthHeader });
  assert.equal(resBasicMe.status, 200, 'Basic Auth legado patio:patio deve continuar funcionando');
  const basicMeData = await resBasicMe.json();
  assert.equal(basicMeData.user.role, 'admin');

  // ── 7. LOGOUT SEGURO (/api/auth/logout) ──────────────────────
  const logoutRes = await postJson('/api/auth/logout', {}, { 'Authorization': `Bearer ${tokenAdmin}` });
  assert.equal(logoutRes.status, 200);
  const logoutData = await logoutRes.json();
  assert.ok(logoutData.success);
});

