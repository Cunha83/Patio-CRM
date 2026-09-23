'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const net = require('node:net');

test('API de Consulta de Cliente: Indisponibilidade Segura, Sem Geração Fictícia e Adaptador de Teste', { timeout: 60000 }, async (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'patio-consulta-cli-'));
  const dbPath = path.join(tempDir, 'test.db');
  const uploadDir = path.join(tempDir, 'uploads');
  fs.mkdirSync(uploadDir, { recursive: true });

  const probe = net.createServer();
  probe.listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const port = probe.address().port;
  await new Promise(r => probe.close(r));

  let childLogs = '';
  let spawnError = null;
  const child = spawn(process.execPath, ['server.js'], {
    cwd: path.resolve(__dirname, '..'),
    windowsHide: true,
    env: {
      ...process.env,
      PORT: String(port),
      API_KEY: 'api-key-consulta-cli',
      AUTH_USER: 'operador_cli',
      AUTH_PASSWORD: 'PasswordConsulta123#',
      DB_PATH: dbPath,
      UPLOAD_DIR: uploadDir,
      DISABLE_INTEGRATIONS: 'true',
      NODE_ENV: 'test'
    }
  });

  child.on('error', err => { spawnError = err; });
  child.stdout.on('data', d => { childLogs += d; });
  child.stderr.on('data', d => { childLogs += d; });

  t.after(async () => {
    if (child.exitCode === null) {
      const exitDone = once(child, 'exit');
      child.kill();
      await exitDone.catch(() => {});
    }
    for (let i = 0; i < 5; i++) {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
        break;
      } catch (_) {
        await new Promise(r => setTimeout(r, 100));
      }
    }
  });

  let isReady = false;
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (spawnError) throw spawnError;
    if (child.exitCode !== null) throw new Error(`Servidor encerrou prematuramente (${child.exitCode}): ${childLogs}`);
    try {
      const res = await fetch(`http://127.0.0.1:${port}/ready`);
      if (res.status === 200) { isReady = true; break; }
    } catch (_) {}
    await new Promise(r => setTimeout(r, 100));
  }
  assert.ok(isReady, 'Servidor deve estar pronto');

  const authHeaders = {
    'Authorization': 'Basic ' + Buffer.from('operador_cli:PasswordConsulta123#').toString('base64'),
    'Content-Type': 'application/json',
    'x-tenant-id': 'default'
  };

  await t.test('1. Rejeita documento com formato ou tamanho incorreto com HTTP 400', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/integracoes/consulta-cliente`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ doc: '12345' })
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.success, false);
    assert.ok(body.erro || body.error);
  });

  await t.test('2. Sem provedor externo configurado: reporta indisponibilidade segura sem fórmulas ou seeds fictícias', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/integracoes/consulta-cliente`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ doc: '12.345.678/0001-90', incluirSerasa: true })
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, false, 'Não deve inventar sucesso');
    assert.equal(body.disponivel, false, 'Integração não configurada');
    assert.equal(body.codigo, 'INTEGRACAO_NAO_CONFIGURADA');
    assert.equal(body.cadastroManualPermitido, true, 'Permite cadastro manual');
    assert.equal(body.dados, null, 'Nenhum dado fictício deve ser retornado');
    assert.equal(body.consultaRealizada, false);
  });

  await t.test('3. Adaptador de teste explícito via header retorna dados marcados como simulados', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/integracoes/consulta-cliente`, {
      method: 'POST',
      headers: {
        ...authHeaders,
        'x-test-consulta-adapter': 'mock'
      },
      body: JSON.stringify({ doc: '12.345.678/0001-90', incluirSerasa: true })
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.simulado, true, 'Deve ser explicitamente identificado como simulado');
    assert.equal(body.origem, 'simulacao_teste');
    assert.ok(body.dados);
    assert.equal(body.dados.scoreSerasa, 590);
    assert.equal(body.dados.consultaSerasaRealizada, true);
  });

  await t.test('4. Falha ou timeout de provedor não gera fallback fictício', async () => {
    // Timeout
    const resTimeout = await fetch(`http://127.0.0.1:${port}/api/integracoes/consulta-cliente`, {
      method: 'POST',
      headers: {
        ...authHeaders,
        'x-test-consulta-adapter': 'timeout'
      },
      body: JSON.stringify({ doc: '12.345.678/0001-90' })
    });
    assert.equal(resTimeout.status, 504);
    const bodyTimeout = await resTimeout.json();
    assert.equal(bodyTimeout.success, false);
    assert.equal(bodyTimeout.codigo, 'TIMEOUT_PROVEDOR_EXTERNO');
    assert.equal(bodyTimeout.dados, undefined);

    // Erro do provedor
    const resError = await fetch(`http://127.0.0.1:${port}/api/integracoes/consulta-cliente`, {
      method: 'POST',
      headers: {
        ...authHeaders,
        'x-test-consulta-adapter': 'error'
      },
      body: JSON.stringify({ doc: '12.345.678/0001-90' })
    });
    assert.equal(resError.status, 502);
    const bodyError = await resError.json();
    assert.equal(bodyError.success, false);
    assert.equal(bodyError.codigo, 'ERRO_PROVEDOR_EXTERNO');
  });

  await t.test('5. Cliente existente localmente é retornado sem consulta externa e sem score fictício', async () => {
    // 1. Cadastra cliente localmente via POST /api/estado
    const estadoInicial = {
      versao: 1,
      clientes: [{
        id: 'cli_existente_01',
        nome: 'Transportadora Local Existente Ltda',
        doc: '98.765.432/0001-10',
        fone: '(11) 97777-1111',
        cidade: 'Campinas',
        uf: 'SP'
      }],
      os: [],
      veiculos: []
    };

    await fetch(`http://127.0.0.1:${port}/api/estado`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify(estadoInicial)
    });

    // 2. Consulta pelo documento cadastrado SEM adaptador de teste
    const resLocal = await fetch(`http://127.0.0.1:${port}/api/integracoes/consulta-cliente`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ doc: '98765432000110', incluirSerasa: true })
    });

    assert.equal(resLocal.status, 200);
    const bodyLocal = await resLocal.json();
    assert.equal(bodyLocal.success, true);
    assert.equal(bodyLocal.origem, 'local');
    assert.equal(bodyLocal.consultaRealizada, false, 'Consulta externa não foi realizada');
    assert.equal(bodyLocal.dados.nome, 'Transportadora Local Existente Ltda');
    assert.equal(bodyLocal.dados.scoreSerasa, null, 'Score deve ser nulo pois não houve consulta externa');
    assert.equal(bodyLocal.dados.fonte, 'cadastro_interno');
  });

  await t.test('6. Diferencia TRANSPORTE_NAO_IMPLEMENTADO quando variáveis de ambiente existem mas adaptador não foi construído', async () => {
    const consultaService = require('../services/consultaClienteService');
    const oldUrl = process.env.SINTEGRA_API_URL;
    const oldKey = process.env.SINTEGRA_API_KEY;
    try {
      process.env.SINTEGRA_API_URL = 'https://api.sintegra.exemplo.com';
      process.env.SINTEGRA_API_KEY = 'chave_teste_123';

      const res = await consultaService.consultarCliente({ doc: '11222333000199' });
      assert.equal(res.status, 501);
      assert.equal(res.codigo, 'TRANSPORTE_NAO_IMPLEMENTADO');
      assert.equal(res.disponivel, false);
      assert.equal(res.cadastroManualPermitido, true);
      assert.ok(res.mensagem.includes('ainda não implementado'));
    } finally {
      process.env.SINTEGRA_API_URL = oldUrl;
      process.env.SINTEGRA_API_KEY = oldKey;
    }
  });
});
