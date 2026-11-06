'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const net = require('net');
const { spawn } = require('child_process');

const rootDir = path.resolve(__dirname, '..');

test('Smoke Test E2E de Rotas, CSS, Frontend e Ciclo Funcional da API', async (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'patio-smoke-e2e-'));
  const tempDbPath = path.join(tempDir, 'smoke.db');
  const tempUploads = path.join(tempDir, 'uploads');

  // Obtém porta efêmera livre
  const probe = net.createServer();
  probe.listen(0, '127.0.0.1');
  await new Promise(r => probe.once('listening', r));
  const port = probe.address().port;
  await new Promise(r => probe.close(r));

  let serverLogs = '';
  const child = spawn(process.execPath, ['server.js'], {
    cwd: rootDir,
    windowsHide: true,
    env: {
      ...process.env,
      PORT: String(port),
      HOST: '127.0.0.1',
      DB_PATH: tempDbPath,
      UPLOAD_DIR: tempUploads,
      DISABLE_INTEGRATIONS: 'true',
      NODE_ENV: 'test',
      API_KEY: 'test-smoke-key'
    }
  });

  child.stdout.on('data', d => { serverLogs += d.toString(); });
  child.stderr.on('data', d => { serverLogs += d.toString(); });

  t.after(() => {
    try { child.kill('SIGINT'); } catch (_) {}
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}
  });

  const baseUrl = `http://127.0.0.1:${port}`;

  // Aguarda servidor estar pronto (/health & /ready)
  const deadline = Date.now() + 25000;
  let ready = false;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error('Servidor encerrou prematuramente: ' + serverLogs);
    }
    try {
      const res = await fetch(`${baseUrl}/ready`);
      if (res.ok) {
        const data = await res.json();
        if (data && (data.status === 'ready' || data.status === 'ok')) {
          ready = true;
          break;
        }
      }
    } catch (_) {}
    await new Promise(r => setTimeout(r, 200));
  }
  assert.ok(ready, 'Servidor deve responder /ready com HTTP 200 e ready:true');

  await t.test('1. GET / e endpoints de integridade (/health, /ready)', async () => {
    const resHome = await fetch(`${baseUrl}/`);
    assert.equal(resHome.status, 200, 'GET / deve retornar HTTP 200');
    const html = await resHome.text();
    assert.ok(html.includes('id="app"'), 'HTML deve conter container id="app"');
    assert.ok(html.includes('style.css'), 'HTML deve linkar style.css');

    // Valida headers de segurança configurados via Helmet
    const nosniff = resHome.headers.get('x-content-type-options');
    const xFrame = resHome.headers.get('x-frame-options');
    const refPol = resHome.headers.get('referrer-policy');
    assert.equal(nosniff, 'nosniff', 'Header X-Content-Type-Options deve ser nosniff');
    assert.equal(xFrame, 'SAMEORIGIN', 'Header X-Frame-Options deve ser SAMEORIGIN');
    assert.ok(refPol && refPol.includes('strict-origin'), 'Referrer-Policy deve ser strict-origin-when-cross-origin');

    const resHealth = await fetch(`${baseUrl}/health`);
    assert.equal(resHealth.status, 200, 'GET /health deve retornar HTTP 200');
    const healthJson = await resHealth.json();
    assert.equal(healthJson.status, 'ok', 'Status de /health deve ser ok');

    const resReady = await fetch(`${baseUrl}/ready`);
    assert.equal(resReady.status, 200, 'GET /ready deve retornar HTTP 200');
    const readyJson = await resReady.json();
    assert.equal(readyJson.status, 'ready', 'Status de /ready deve ser ready');
  });

  await t.test('2. Carregamento de todos os 12 arquivos CSS modulares e master style.css', async () => {
    const cssFiles = [
      '/style.css',
      '/css/variables.css',
      '/css/base-layout.css',
      '/css/components.css',
      '/css/voice-drawer.css',
      '/css/voice-modal.css',
      '/css/financeiro.css',
      '/css/dashboard-operacional.css',
      '/css/patio-monday.css',
      '/css/patio-monday-cells.css',
      '/css/enterprise-nav.css',
      '/css/automations-modal.css',
      '/css/responsive.css'
    ];

    for (const cssPath of cssFiles) {
      const res = await fetch(`${baseUrl}${cssPath}`);
      assert.equal(res.status, 200, `CSS ${cssPath} deve retornar HTTP 200`);
      const text = await res.text();
      assert.ok(text.length > 10, `CSS ${cssPath} deve conter conteúdo válido`);
    }
  });

  await t.test('3. Carregamento de scripts estáticos do frontend', async () => {
    const jsFiles = [
      '/js/app.js',
      '/js/vendas.js',
      '/js/modules/events.js',
      '/js/state.js',
      '/js/estoque.js',
      '/js/compras.js',
      '/js/financeiro.js',
      '/js/modules/monday_board.js',
      '/js/modules/automations_modal.js'
    ];

    for (const jsPath of jsFiles) {
      const res = await fetch(`${baseUrl}${jsPath}`);
      assert.equal(res.status, 200, `Script ${jsPath} deve retornar HTTP 200`);
      const text = await res.text();
      assert.ok(text.length > 50, `Script ${jsPath} deve conter código válido`);
    }
  });

  await t.test('4. Ciclo Funcional da API (Signup -> Auth -> Estado -> Webhook Pix)', async () => {
    // 4.1 Signup de nova oficina
    const signupPayload = {
      nome: 'Carlos Mecânico',
      empresa: 'Auto Mecânica São Paulo Ltda',
      email: `carlos_${Date.now()}@mecanica.com.br`,
      senha: 'SenhaForte1234#@Test',
      whatsapp: '11999998888',
      aceitouTermos: true
    };

    const resSignup = await fetch(`${baseUrl}/api/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(signupPayload)
    });
    assert.ok(resSignup.status === 200 || resSignup.status === 201, `Signup deve retornar HTTP 200 ou 201, obtido: ${resSignup.status}`);

    // 4.2 Login formal para obter token JWT
    const resLogin = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: signupPayload.email,
        password: signupPayload.senha
      })
    });
    assert.equal(resLogin.status, 200, 'Login deve retornar HTTP 200');
    const loginData = await resLogin.json();
    assert.ok(loginData.token, 'Login deve retornar token JWT');
    const token = loginData.token;

    // 4.3 Consulta de estado da oficina (/api/estado)
    const resEstado = await fetch(`${baseUrl}/api/estado`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    assert.equal(resEstado.status, 200, 'GET /api/estado deve retornar HTTP 200');
    const estado = await resEstado.json();
    assert.ok(estado.cfg, 'Estado retornado deve conter objeto cfg');

    // 4.4 Criação / Atualização de OS e configuração no estado
    estado.cfg.empresa = 'Auto Mecânica São Paulo Ltda';
    const novaOS = {
      id: 'os_e2e_01',
      num: '1099',
      st: 'executando',
      box: 'Box 01',
      cli: 'cli_01',
      vei: 'vei_01',
      servicos: [{ id: 's1', nome: 'Alinhamento Técnico', qtd: 1, valor: 350 }],
      pecas: [{ id: 'p1', nome: 'Bolsa de Ar Wabco', qtd: 2, valor: 450 }],
      total: 1250,
      pago: false
    };
    estado.os = estado.os || [];
    estado.os.push(novaOS);

    const resSalvar = await fetch(`${baseUrl}/api/estado`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(estado)
    });
    assert.equal(resSalvar.status, 200, 'POST /api/estado deve salvar com HTTP 200');

    // 4.5 Re-leitura para comprovar persistência durável no banco
    const resReleitura = await fetch(`${baseUrl}/api/estado`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    assert.equal(resReleitura.status, 200, 'Re-leitura deve retornar HTTP 200');
    const estadoReleitura = await resReleitura.json();
    assert.equal(estadoReleitura.cfg.empresa, 'Auto Mecânica São Paulo Ltda');
    assert.ok(estadoReleitura.os.some(o => o.id === 'os_e2e_01'), 'OS criada deve estar persistida');

    // 4.6 Simulação de Liquidação Pix via Webhook
    const resPix = await fetch(`${baseUrl}/api/webhooks/pix`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        txid: 'tx_pix_smoke_test_001',
        status: 'PAGO',
        valor: 1250.00
      })
    });
    assert.equal(resPix.status, 200, 'Webhook Pix deve responder HTTP 200');
  });
});

