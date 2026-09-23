'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { spawn, spawnSync } = require('node:child_process');
const { install, verifyPackage, cleanEnvironment, portAvailable } = require('../installer/windows/setup.cjs');
const { allowed } = require('../scripts/build_windows_pilot.cjs');

test('Distribuicao: allowlist exclui dados, configuracoes e scripts de operacao local', () => {
  for (const file of ['.env', '.env.example', 'patio.db', 'public/uploads/empresa/foto.png', 'backups/test.json', 'scripts/provisionar_credenciais_finais.cjs', 'lib/secret.key']) assert.equal(allowed(file), false, file);
  for (const file of ['server.js', 'lib/auth/context.js', 'public/support/inbox.js', 'scripts/supervise_patio.cjs']) assert.equal(allowed(file), true, file);
  assert.equal(cleanEnvironment().API_KEY, undefined);
  assert.equal(cleanEnvironment().NODE_OPTIONS, undefined);
});

test('Instalacao Windows real: tres empresas, reinicio, isolamento e protecoes', { skip: !process.env.PATIO_TEST_PACKAGE || process.platform !== 'win32', timeout: 900000 }, async t => {
  const source = path.resolve(process.env.PATIO_TEST_PACKAGE);
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'patio-distribution-'));
  console.log('Ambiente descartavel:', work);
  const installations = [];
  const active = new Set();
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
  async function freePort() {
    const socket = net.createServer();
    await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve));
    const port = socket.address().port;
    await new Promise(resolve => socket.close(resolve));
    return port;
  }
  async function boot(info, launcher = false) {
    const app = path.join(info.target, 'app');
    const env = require(path.join(app, 'node_modules/dotenv')).parse(fs.readFileSync(path.join(app, '.env')));
    const script = launcher ? ['-e', "require('./start.cjs').start(process.cwd(), {openBrowser:false}).catch(e=>{console.error(e.message);process.exitCode=1})"] : ['server.js'];
    const child = spawn(path.join(info.target, 'runtime/node.exe'), script, { cwd: launcher ? info.target : app, env: { ...cleanEnvironment(), ...env }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    active.add(child);
    child.testInfo = { info, launcher };
    let output = '';
    child.stdout.on('data', data => { output += data; child.testOutput = output; });
    child.stderr.on('data', data => { output += data; });
    for (let i = 0; i < 80; i++) {
      assert.equal(child.exitCode, null, output);
      try {
        const res = await fetch(`http://127.0.0.1:${info.port}/ready`, { signal: AbortSignal.timeout(1000) });
        if (res.ok) { const ready = await res.json(); assert.equal(ready.status, 'ready'); return child; }
      } catch (_) {}
      await pause(250);
    }
    throw new Error('Boot falhou: ' + output);
  }
  async function stop(child) {
    const { info, launcher } = child.testInfo;
    if (child.exitCode === null) {
      if (launcher) {
        // PIDs registrados pela copia descartavel iniciada por este teste.
        const lock = JSON.parse(fs.readFileSync(path.join(info.target, 'app/locks/patio-supervisor.lock'), 'utf8'));
        assert.equal(lock.port, info.port);
        const serverPid = Number(child.testOutput?.match(/Processo Node iniciado com PID: (\d+)/)?.[1]);
        assert.ok(serverPid > 0);
        process.kill(lock.pid);
        process.kill(serverPid);
      }
      child.kill();
      for (let i = 0; child.exitCode === null && i < 40; i++) await pause(100);
    }
    assert.ok(child.exitCode !== null || child.signalCode !== null, 'Processo criado deve estar encerrado');
    assert.equal(await portAvailable(info.port), true, 'Porta deve estar livre antes do reinicio real');
    active.delete(child);
  }
  function credentials(info) {
    const text = fs.readFileSync(path.join(info.target, 'ACESSOS.txt'), 'utf8');
    return Object.fromEntries([...text.matchAll(/(gestor|atendente|mecanico): (\S+)\r?\nSenha: (\S+)/g)].map(m => [m[1], { username: m[2], password: m[3] }]));
  }
  const request = (info, credential, route = '/api/estado', options = {}) => fetch(`http://127.0.0.1:${info.port}${route}`, {
    ...options, headers: { authorization: 'Basic ' + Buffer.from(`${credential.username}:${credential.password}`).toString('base64'), 'x-tenant-id': info.tenant, 'content-type': 'application/json', ...options.headers }
  });
  try {
    await t.test('pacote sem dados reais e sem arquivos extras', () => {
      verifyPackage(source);
      for (const file of ['app/.env', 'app/patio.db', 'app/public/uploads', 'ACESSOS.txt']) assert.equal(fs.existsSync(path.join(source, file)), false, file);
      const marker = path.join(source, 'unexpected-audit-marker.txt');
      try { fs.writeFileSync(marker, 'synthetic'); assert.throws(() => verifyPackage(source), /Inventario/); }
      finally { fs.unlinkSync(marker); }
    });
    await t.test('tres instalacoes novas com nomes acentuados e caminho com espacos', async () => {
      for (let i = 1; i <= 3; i++) {
        installations.push(await install({ source, target: path.join(work, `Empresa ${i} acentuacao`), company: `Oficina Teste ${i} São José`, port: await freePort(), shortcut: false }));
      }
      assert.equal(new Set(installations.map(info => info.tenant)).size, 3);
      assert.equal(new Set(installations.map(info => credentials(info).gestor.password)).size, 3);
      for (const info of installations) assert.equal(Object.keys(credentials(info)).length, 3);
    });
    await t.test('reinstalacao recusa destino existente sem alterar banco', async () => {
      const info = installations[0];
      const before = fs.readFileSync(path.join(info.target, 'app/patio.db'));
      await assert.rejects(install({ source, company: 'Outra', target: info.target, shortcut: false }), /Destino ja existe/);
      assert.deepEqual(fs.readFileSync(path.join(info.target, 'app/patio.db')), before);
    });
    await t.test('tres perfis por empresa; gravacao e leitura apos reinicio; rejeicao de tenant e senha de outra empresa', async () => {
      for (const [index, info] of installations.entries()) {
        const accounts = credentials(info);
        let child = await boot(info, index === 0);
        try {
          for (const account of Object.values(accounts)) assert.equal((await request(info, account)).status, 200);
          const state = await (await request(info, accounts.gestor)).json();
          assert.equal(state.cfg.empresa, `Oficina Teste ${index + 1} São José`);
          assert.equal(state.clientes.length, 0);
          assert.equal(state.os.length, 0);
          const other = installations[(index + 1) % 3];
          assert.equal((await request(info, credentials(other).gestor)).status, 401);
          assert.equal((await request(info, accounts.gestor, '/api/estado', { headers: { 'x-tenant-id': other.tenant } })).status, 403);
          state.clientes.push({ id: `cli_${index}`, nome: `Cliente Ficticio ${index}` });
          assert.equal((await request(info, accounts.mecanico, '/api/estado', { method: 'POST', body: JSON.stringify(state) })).status, 403);
          assert.equal((await request(info, accounts.gestor, '/api/estado', { method: 'POST', body: JSON.stringify(state) })).status, 200);
          await stop(child);
          child = await boot(info);
          const persisted = await (await request(info, accounts.gestor)).json();
          assert.equal(persisted.clientes.length, 1);
          assert.equal(persisted.clientes[0].nome, `Cliente Ficticio ${index}`);
        } finally { await stop(child); }
      }
    });
    await t.test('porta ocupada e nome invalido recusados antes de criar dados', async () => {
      const socket = net.createServer();
      await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve));
      const target = path.join(work, 'recusado');
      try { await assert.rejects(install({ source, company: 'Teste', target, port: socket.address().port, shortcut: false }), /Porta invalida ou ocupada/); }
      finally { await new Promise(resolve => socket.close(resolve)); }
      assert.equal(fs.existsSync(target), false);
      await assert.rejects(install({ source, company: 'Nome\nHOST=0.0.0.0', target }), /Nome de empresa invalido/);
    });
  } finally {
    for (const child of active) await stop(child);
    // Preserva evidencias no TEMP. Nunca remove pasta de usuario/instalacao existente.
  }
});
