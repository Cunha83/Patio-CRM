'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const net = require('node:net');

test('Assistente Virtual: Configurações de Briefing e Geração Executiva Gerencial', { timeout: 60000 }, async (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'patio-briefing-test-'));
  const dbPath = path.join(tempDir, 'briefing_test.db');
  const uploadDir = path.join(tempDir, 'uploads');
  fs.mkdirSync(uploadDir, { recursive: true });

  process.env.TOKEN_SECRET = 'segredo-teste-hmac-briefing-2026';
  process.env.DB_PATH = dbPath;

  const db = require('../db');
  await db.initDB();

  const userRepo = require('../lib/auth/userRepository');
  await userRepo.createUser({
    username: 'mecanico_joao',
    email: 'mecanico@teste.com',
    password: 'SenhaMecanico#2026',
    role: 'mecanico',
    tenantId: 'tenant_briefing',
    fullName: 'João Mecânico'
  });

  await userRepo.createUser({
    username: 'financeiro_maria',
    email: 'financeiro@teste.com',
    password: 'SenhaFinanceiro#2026',
    role: 'financeiro',
    tenantId: 'tenant_briefing',
    fullName: 'Maria Financeira'
  });

  await userRepo.createUser({
    username: 'admin_carlos',
    email: 'admin@teste.com',
    password: 'SenhaAdmin#2026',
    role: 'admin',
    tenantId: 'tenant_briefing',
    fullName: 'Carlos Gerente Admin'
  });

  const mockState = {
    versao: 1,
    clientes: [
      { id: 'cli1', nome: 'Transportadora TransRodas', doc: '12.345.678/0001-90' }
    ],
    veiculos: [
      { id: 'vei1', placa: 'ABC1D23', modelo: 'Volvo FH 540' },
      { id: 'vei2', placa: 'XYZ9K87', modelo: 'Scania R450' }
    ],
    boxes: [
      { id: 'b1', nome: 'Box 01 - Mecânica Pesada' },
      { id: 'b2', nome: 'Box 02 - Suspensão' },
      { id: 'b3', nome: 'Box 03 - Rápida' }
    ],
    os: [
      { id: 'os1', num: 201, box: 'b1', vei: 'vei1', cli: 'cli1', st: 'executando', total: 6200 },
      { id: 'os2', num: 202, box: 'b2', vei: 'vei2', cli: 'cli1', st: 'peca', total: 3100 }
    ],
    pecas: [
      { id: 'p1', cod: 'MOL-01', nome: 'Mola Mestra Traseira', qtd: 4, min: 2, custo: 350, venda: 700 }
    ],
    contas: [
      { id: 'cnt1', tipo: 'pagar', desc: 'Auto Peças Molas Brasil', valor: 2800, venc: '2026-09-18', pago: false },
      { id: 'cnt2', tipo: 'receber', desc: 'Fatura TransRodas OS 200', valor: 5500, venc: '2026-09-18', pago: false }
    ],
    movimentos: [
      { id: 'm1', tipo: 'entrada', valor: 10000, data: '2026-09-01' },
      { id: 'm2', tipo: 'saida', valor: 3000, data: '2026-09-05' }
    ],
    cfg: {
      empresa: 'Auto Molas Fort Diesel',
      saldoInicial: 5000,
      assistente: {
        displayName: 'Verônica',
        voiceGender: 'female',
        enabled: true,
        briefingDiarioAtivo: false,
        briefingDiarioHorario: '07:30',
        briefingDiarioDias: ['segunda', 'terca', 'quarta', 'quinta', 'sexta'],
        briefingSemanalAtivo: false,
        briefingSemanalDia: 'segunda',
        briefingSemanalHorario: '08:00',
        briefingDestinatarios: 'gestores'
      }
    }
  };

  const { persistState } = require('../lib/repository/stateRepository');
  await persistState({ tenantId: 'tenant_briefing', role: 'admin', permissions: ['*'], actorId: 'seed' }, mockState);
  await db.closeDB();

  const probe = net.createServer();
  probe.listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const port = probe.address().port;
  await new Promise(r => probe.close(r));

  let childLogs = '';
  const child = spawn(process.execPath, ['server.js'], {
    cwd: path.resolve(__dirname, '..'),
    windowsHide: true,
    env: {
      ...process.env,
      PORT: String(port),
      HOST: '127.0.0.1',
      API_KEY: 'master-briefing-test-key',
      DB_PATH: dbPath,
      UPLOAD_DIR: uploadDir,
      DISABLE_WHATSAPP: 'true',
      DISABLE_INTEGRATIONS: 'true',
      NODE_ENV: 'test'
    }
  });

  child.stdout.on('data', d => { childLogs += d; });
  child.stderr.on('data', d => { childLogs += d; });

  t.after(async () => {
    if (!online) {
      console.error('[TEST DIAGNOSTIC childLogs]:', childLogs);
    }
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

  const baseUrl = `http://127.0.0.1:${port}`;
  let online = false;
  for (let i = 0; i < 50; i++) {
    try {
      const res = await fetch(`${baseUrl}/health`);
      if (res.ok) { online = true; break; }
    } catch (_) {}
    await new Promise(r => setTimeout(r, 100));
  }
  assert.ok(online, 'Servidor deve inicializar e responder /health');

  const basicAuth = (user, pass) => 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64');
  const authMecanico = basicAuth('mecanico_joao', 'SenhaMecanico#2026');
  const authFinanceiro = basicAuth('financeiro_maria', 'SenhaFinanceiro#2026');
  const authAdmin = basicAuth('admin_carlos', 'SenhaAdmin#2026');

  await t.test('1. GET /api/configuracoes/assistente: Retorna configurações com parâmetros de briefing', async () => {
    const res = await fetch(`${baseUrl}/api/configuracoes/assistente`, {
      headers: { Authorization: authAdmin, 'x-tenant-id': 'tenant_briefing' }
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.ok(data.assistente);
    assert.equal(data.assistente.displayName, 'Verônica');
    assert.equal(data.assistente.briefingDiarioAtivo, false);
    assert.equal(data.assistente.briefingDiarioHorario, '07:30');
    assert.deepEqual(data.assistente.briefingDiarioDias, ['segunda', 'terca', 'quarta', 'quinta', 'sexta']);
    assert.equal(data.assistente.briefingSemanalAtivo, false);
    assert.equal(data.assistente.briefingSemanalDia, 'segunda');
    assert.equal(data.assistente.briefingSemanalHorario, '08:00');
    assert.equal(data.assistente.briefingDestinatarios, 'gestores');
  });

  await t.test('2. PUT /api/configuracoes/assistente: Atualiza e persiste parâmetros de briefing', async () => {
    const res = await fetch(`${baseUrl}/api/configuracoes/assistente`, {
      method: 'PUT',
      headers: {
        Authorization: authAdmin,
        'Content-Type': 'application/json',
        'x-tenant-id': 'tenant_briefing'
      },
      body: JSON.stringify({
        displayName: 'Verônica Gestão',
        briefingDiarioAtivo: true,
        briefingDiarioHorario: '06:45',
        briefingSemanalAtivo: true,
        briefingSemanalDia: 'sexta',
        briefingSemanalHorario: '17:30',
        briefingDestinatarios: 'gestores'
      })
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.equal(data.assistente.briefingDiarioAtivo, true);
    assert.equal(data.assistente.briefingDiarioHorario, '06:45');
    assert.equal(data.assistente.briefingSemanalAtivo, true);
    assert.equal(data.assistente.briefingSemanalDia, 'sexta');
    assert.equal(data.assistente.briefingSemanalHorario, '17:30');

    // Checar persistência via novo GET
    const resGet = await fetch(`${baseUrl}/api/configuracoes/assistente`, {
      headers: { Authorization: authAdmin, 'x-tenant-id': 'tenant_briefing' }
    });
    const dataGet = await resGet.json();
    assert.equal(dataGet.assistente.briefingDiarioAtivo, true);
    assert.equal(dataGet.assistente.briefingDiarioHorario, '06:45');
  });

  await t.test('3. Segurança: Mecânico tenta gerar briefing executivo -> 403 Acesso Negado', async () => {
    const resPost = await fetch(`${baseUrl}/api/assistente/briefing/gerar`, {
      method: 'POST',
      headers: { Authorization: authMecanico, 'x-tenant-id': 'tenant_briefing' }
    });
    assert.equal(resPost.status, 403, 'POST deve ser barrado com 403 para mecânico');
    const errPost = await resPost.json();
    assert.ok(errPost.error.includes('Acesso negado'));

    const resGet = await fetch(`${baseUrl}/api/assistente/briefing`, {
      headers: { Authorization: authMecanico, 'x-tenant-id': 'tenant_briefing' }
    });
    assert.equal(resGet.status, 403, 'GET deve ser barrado com 403 para mecânico');
  });

  await t.test('4. Geração: Usuário Financeiro gera briefing executivo -> 200 OK com payload estruturado', async () => {
    const res = await fetch(`${baseUrl}/api/assistente/briefing/gerar`, {
      method: 'POST',
      headers: { Authorization: authFinanceiro, 'x-tenant-id': 'tenant_briefing' }
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.ok(data.briefing);

    // Validação do bloco Pátio
    const patio = data.briefing.patio;
    assert.ok(patio);
    assert.equal(patio.veiculosNoPatio, 2, 'Deve indicar 2 veículos ativos no pátio');
    assert.equal(patio.boxesOcupados, 2, 'Deve indicar 2 boxes ocupados');
    assert.equal(patio.totalBoxes, 3, 'Deve indicar 3 boxes no total');
    assert.ok(patio.estagios);
    assert.equal(patio.estagios.executando, 1);
    assert.equal(patio.estagios.peca, 1);

    // Validação do bloco Financeiro
    const financeiro = data.briefing.financeiro;
    assert.ok(financeiro);
    assert.equal(typeof financeiro.saldoConsolidado, 'number');
    assert.ok(financeiro.vencimentosHoje);
    assert.equal(typeof financeiro.vencimentosHoje.aReceber, 'number');
    assert.equal(typeof financeiro.vencimentosHoje.aPagar, 'number');

    // Validação do texto formatado executivo
    assert.ok(data.briefing.textoFormatado);
    assert.ok(data.briefing.textoFormatado.includes('BRIEFING GERENCIAL EXECUTIVO'));
    assert.ok(data.briefing.textoFormatado.includes('POSIÇÃO FINANCEIRA'));
    assert.ok(data.briefing.textoFormatado.includes('OPERAÇÃO & PÁTIO'));

    // Timestamp
    assert.ok(data.briefing.geradoEm);
    assert.ok(new Date(data.briefing.geradoEm).getTime() > 0);
  });

  await t.test('5. Geração: Admin gera briefing executivo via GET -> 200 OK e coerente', async () => {
    const res = await fetch(`${baseUrl}/api/assistente/briefing`, {
      headers: { Authorization: authAdmin, 'x-tenant-id': 'tenant_briefing' }
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.ok(data.briefing.patio);
    assert.ok(data.briefing.financeiro);
    assert.ok(data.briefing.textoFormatado);
  });
});
