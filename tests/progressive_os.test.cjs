'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const { spawn } = require('node:child_process');
const { once } = require('node:events');

const { conciliarVeiculoOS } = require('../services/vehicleReconciliation');
const voiceActionEngine = require('../services/voiceActionEngine');
const { createAuth } = require('../lib/core');

/* ── 1. TESTE UNITÁRIO: ABERTURA DE OS SEM PLACA & STATUS OPERACIONAL ── */
test('1. Abertura progressiva de OS sem placa: cria pendência cadastral e preserva status operacional', async () => {
  const state = {
    os: [],
    veiculos: [],
    clientes: [{ id: 'c1', nome: 'Transportadora Silva' }],
    boxes: [
      { id: 'b1', nome: 'Box 1', tipo: 'Vala' },
      { id: 'b2', nome: 'Box 2', tipo: 'Elevador' }
    ],
    auditoria: []
  };

  // 1.1 Entrada via Voice Engine sem placa (direcionado ao box 1)
  const resBox1 = await voiceActionEngine.interpretarEExecutar({
    input: { text: 'Chegou um caminhão azul do Carlos com vazamento de ar, colocar no box 1' },
    context: { activeOsId: null, role: 'atendente', permissions: ['os:write', 'os:read'], tenantId: 'default' },
    state
  });

  assert.equal(resBox1.ok, true);
  const osCriadaBox = state.os.find(o => o.id === resBox1.osId);
  assert.ok(osCriadaBox, 'OS deve ser criada');
  assert.equal(osCriadaBox.pendenciaCadastral, true, 'OS deve ter pendenciaCadastral = true');
  assert.deepEqual(osCriadaBox.pendencias, ['placa_pendente'], 'Deve listar placa_pendente nas pendências');
  assert.equal(osCriadaBox.st, 'executando', 'Status operacional DEVE ser executando quando alocado em box');
  assert.equal(osCriadaBox.box, 'b1', 'Deve estar alocado no box 1');

  // 1.2 Entrada via Voice Engine sem placa (na fila do pátio)
  const resFila = await voiceActionEngine.interpretarEExecutar({
    input: { text: 'Chegou outro caminhão branco sem placa, deixar na fila de espera' },
    context: { activeOsId: null, role: 'atendente', permissions: ['os:write', 'os:read'], tenantId: 'default' },
    state
  });

  assert.equal(resFila.ok, true);
  const osCriadaFila = state.os.find(o => o.id === resFila.osId);
  assert.ok(osCriadaFila, 'OS na fila deve ser criada');
  assert.equal(osCriadaFila.pendenciaCadastral, true, 'OS deve ter pendenciaCadastral = true');
  assert.equal(osCriadaFila.st, 'aguardando', 'Status operacional na fila deve ser aguardando/fila');

  // Veículos temporários cadastrados
  const vTemp = state.veiculos.find(v => v.id === osCriadaBox.vei);
  assert.ok(vTemp, 'Veículo temporário deve existir');
  assert.equal(vTemp.placa, 'SEM-PLACA');
  assert.equal(vTemp.pendenciaCadastral, true);
});

/* ── 2. TESTE: ANEXAR FOTO, RECONCILIAÇÃO E NÃO-DUPLICIDADE ── */
test('2. Anexar foto: concilia com veículo já existente na base sem gerar duplicidade', async () => {
  // Veículo que já existia na oficina de um atendimento anterior
  const veicExistente = {
    id: 'v_scania_existente',
    cli: 'c_frotista',
    placa: 'BRA2E19',
    marca: 'Scania',
    modelo: 'R 450',
    ano: '2022',
    cor: 'Azul',
    km: 250000,
    pendenciaCadastral: false
  };

  // Veículo temporário gerado na entrada rápida sem placa
  const veicRascunho = {
    id: 'v_rascunho_temp',
    cli: 'c_frotista',
    placa: 'SEM-PLACA',
    marca: 'Pendente',
    modelo: 'Veículo Não Identificado',
    pendenciaCadastral: true,
    pendencias: ['placa_pendente']
  };

  const osAberta = {
    id: 'os_1050',
    num: '1050',
    vei: veicRascunho.id,
    cli: 'c_frotista',
    box: 'b1',
    st: 'executando', // Status operacional preservado
    pendenciaCadastral: true,
    pendencias: ['placa_pendente']
  };

  const state = {
    os: [osAberta],
    veiculos: [veicExistente, veicRascunho],
    clientes: [{ id: 'c_frotista', nome: 'TransRodrigues' }],
    auditoria: []
  };

  // Anexa foto simulada com a placa BRA2E19
  const res = await conciliarVeiculoOS({
    osId: 'os_1050',
    imagemBase64: 'mock:BRA2E19',
    state
  });

  assert.equal(res.ok, true);
  assert.equal(res.conflito, false);
  assert.equal(res.conciliouComExistente, true, 'Deve conciliar diretamente com veículo já cadastrado');
  assert.equal(res.placa, 'BRA2E19');

  // A OS foi repontada para o veículo original existente
  assert.equal(osAberta.vei, veicExistente.id, 'OS deve apontar para o veículo existente');
  assert.equal(osAberta.pendenciaCadastral, false, 'Pendência cadastral da OS deve ser resolvida');
  assert.deepEqual(osAberta.pendencias, [], 'Lista de pendências deve estar vazia');
  assert.equal(osAberta.st, 'executando', 'Status operacional executando DEVE permanecer inalterado');

  // NÃO-DUPLICIDADE: O veículo rascunho temporário foi eliminado do banco
  const veiculosComMesmaPlaca = state.veiculos.filter(v => v.placa === 'BRA2E19');
  assert.equal(veiculosComMesmaPlaca.length, 1, 'Não deve criar veículo duplicado com a mesma placa');
  assert.equal(state.veiculos.some(v => v.id === 'v_rascunho_temp'), false, 'Rascunho temporário unreferenced deve ser removido');

  // Auditoria registrada
  assert.equal(state.auditoria.length, 1);
  assert.ok(state.auditoria[0].resumo.includes('conciliada com veículo existente'));
});

/* ── 3. TESTE: DETECÇÃO DE CONFLITO DE PLACA ── */
test('3. Detecção de conflito: placa da foto difere de placa já confirmada e exige token', async () => {
  const veicConfirmado = {
    id: 'v_confirmado',
    cli: 'c1',
    placa: 'AAA1111',
    marca: 'Volvo',
    modelo: 'FH 540',
    pendenciaCadastral: false
  };

  const osAberta = {
    id: 'os_2000',
    num: '2000',
    vei: veicConfirmado.id,
    cli: 'c1',
    box: 'b2',
    st: 'executando',
    pendenciaCadastral: false
  };

  const state = {
    os: [osAberta],
    veiculos: [veicConfirmado],
    clientes: [{ id: 'c1', nome: 'Cliente Teste' }],
    auditoria: []
  };

  // Foto com placa diferente BBB2222
  const res = await conciliarVeiculoOS({
    osId: 'os_2000',
    imagemBase64: 'mock:BBB2222',
    state
  });

  assert.equal(res.ok, true);
  assert.equal(res.conflito, true, 'Deve identificar conflito de placa');
  assert.ok(res.tokenConfirmacao, 'Deve gerar token de confirmação');
  assert.equal(res.placaAtual, 'AAA1111');
  assert.equal(res.placaDetectada, 'BBB2222');
  assert.equal(veicConfirmado.placa, 'AAA1111', 'Ainda não deve ter alterado antes da confirmação');

  // Confirmação com o token
  const resConf = await conciliarVeiculoOS({
    tokenConfirmacao: res.tokenConfirmacao,
    state
  });

  assert.equal(resConf.ok, true);
  assert.equal(resConf.conflito, false);
  assert.equal(veicConfirmado.placa, 'BBB2222', 'Após confirmação com token, a nova placa deve ser aplicada');
});

/* ── 4. TESTE: DESACOPLAMENTO ENTRE API_KEY E SENHA HUMANA ── */
test('4. Autenticação desacoplada: x-api-key (máquina) vs Basic Auth (usuário/senha)', () => {
  const auth = createAuth({
    apiKey: 'chave-secreta-api-2026',
    authUser: 'patio',
    authPassword: 'senha-humano-patio'
  });

  const makeRes = () => ({
    code: 200,
    headers: {},
    setHeader(k, v) { this.headers[k] = v; },
    status(c) { this.code = c; return this; },
    json(b) { this.body = b; return this; }
  });

  // 4.1 Máquina com header x-api-key válido
  let authed = false;
  auth({ headers: { 'x-api-key': 'chave-secreta-api-2026', host: 'localhost' }, method: 'GET' }, makeRes(), () => { authed = true; });
  assert.equal(authed, true, 'x-api-key correta deve autorizar');

  // 4.2 Máquina tentando usar a senha humana no x-api-key (NÃO DEVE MISTURAR)
  const resApiKeyErrada = makeRes();
  authed = false;
  auth({ headers: { 'x-api-key': 'senha-humano-patio', host: 'localhost' }, method: 'GET' }, resApiKeyErrada, () => { authed = true; });
  assert.equal(authed, false, 'Senha humana não deve autorizar no header x-api-key');
  assert.equal(resApiKeyErrada.code, 401);

  // 4.3 Usuário humano com Basic Auth correto
  authed = false;
  const basicCorreto = 'Basic ' + Buffer.from('patio:senha-humano-patio').toString('base64');
  auth({ headers: { authorization: basicCorreto, host: 'localhost' }, method: 'GET' }, makeRes(), () => { authed = true; });
  assert.equal(authed, true, 'Basic Auth com usuário e senha corretos deve autorizar');

  // 4.4 Usuário humano tentando usar a API_KEY como senha (NÃO DEVE MISTURAR)
  const resBasicErrado = makeRes();
  authed = false;
  const basicComApiKey = 'Basic ' + Buffer.from('patio:chave-secreta-api-2026').toString('base64');
  auth({ headers: { authorization: basicComApiKey, host: 'localhost' }, method: 'GET' }, resBasicErrado, () => { authed = true; });
  assert.equal(authed, false, 'API_KEY não deve autorizar como senha humana no Basic Auth');
  assert.equal(resBasicErrado.code, 401);
});

/* ── 5. TESTE END-TO-END HTTP: MULTI-TENANCY, ROTAS E WHATSAPP AUTOMATION ── */
test('5. Servidor Real E2E: OS sem placa, upload foto, conciliação e multi-tenancy isolado', { timeout: 120000 }, async t => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'patio-crm-prog-test-'));
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
        API_KEY: 'test-api-key-secret',
        AUTH_USER: 'patio',
        AUTH_PASSWORD: 'patio-password-test',
        DISABLE_INTEGRATIONS: 'true',
        DB_PATH: path.join(temp, 'test_prog.db')
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

  const apiTenant = (tenantId) => {
    const headers = {
      'x-api-key': 'test-api-key-secret'
    };
    if (tenantId) headers['x-tenant-id'] = tenantId;

    return {
      get: (url) => fetch(`http://127.0.0.1:${port}${url}`, { headers }),
      post: (url, body) => fetch(`http://127.0.0.1:${port}${url}`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
    };
  };

  const clientMatriz = apiTenant('oficina_matriz');
  const clientFilial = apiTenant('oficina_filial');

  // 5.1 Inicializa estado para matriz
  await clientMatriz.post('/api/estado', {
    os: [],
    veiculos: [
      { id: 'v_matriz_1', placa: 'MAT1111', modelo: 'FH 540', cli: 'c_matriz', pendenciaCadastral: false }
    ],
    clientes: [{ id: 'c_matriz', nome: 'Cliente Matriz' }],
    versao: 0
  });

  // 5.2 Inicializa estado para filial
  await clientFilial.post('/api/estado', {
    os: [],
    veiculos: [
      { id: 'v_filial_1', placa: 'FIL2222', modelo: 'Actros', cli: 'c_filial', pendenciaCadastral: false }
    ],
    clientes: [{ id: 'c_filial', nome: 'Cliente Filial' }],
    versao: 0
  });

  // 5.3 ISOLAMENTO MULTI-TENANCY: Verifica que cada filial enxerga apenas seus dados
  const stMatriz = await (await clientMatriz.get('/api/estado')).json();
  const stFilial = await (await clientFilial.get('/api/estado')).json();

  assert.equal(stMatriz.veiculos.length, 1);
  assert.equal(stMatriz.veiculos[0].placa, 'MAT1111');
  assert.equal(stFilial.veiculos.length, 1);
  assert.equal(stFilial.veiculos[0].placa, 'FIL2222');

  // 5.4 Abertura de OS sem placa na matriz via POST /api/os/entrada
  const resEntrada = await clientMatriz.post('/api/os/entrada', {
    placa: 'SEM-PLACA',
    clienteNome: 'Motorista Avulso',
    textoOriginal: 'Entrada rápida sem placa para ver barulho no câmbio'
  });
  assert.equal(resEntrada.status, 200);
  const entradaData = await resEntrada.json();
  assert.equal(entradaData.success, true);
  assert.equal(entradaData.os.pendenciaCadastral, true, 'OS aberta sem placa deve ter pendência cadastral');
  assert.deepEqual(entradaData.os.pendencias, ['placa_pendente']);
  assert.ok(['executando', 'fila'].includes(entradaData.os.st), 'Status operacional deve ser válido e preservado');

  const osIdMatriz = entradaData.os.id;

  // 5.5 Anexar foto na OS da matriz para conciliação com MAT1111
  const resAnexo = await clientMatriz.post(`/api/os/${encodeURIComponent(osIdMatriz)}/anexar-foto`, {
    imagemBase64: 'mock:MAT1111'
  });
  assert.equal(resAnexo.status, 200);
  const anexoData = await resAnexo.json();
  assert.equal(anexoData.success, true);
  assert.equal(anexoData.conciliouComExistente, true, 'Deve conciliar com veículo existente na matriz');
  assert.equal(anexoData.placa, 'MAT1111');

  // 5.6 Verifica que na filial o estado não foi afetado pela matriz (Multi-tenancy garantido)
  const stFilialCheck = await (await clientFilial.get('/api/estado')).json();
  assert.equal(stFilialCheck.os.length, 0, 'Filial não deve ter OS da matriz');
  assert.equal(stFilialCheck.veiculos.length, 1);
  assert.equal(stFilialCheck.veiculos[0].placa, 'FIL2222');
});
