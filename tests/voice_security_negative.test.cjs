'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const net = require('node:net');

process.env.TOKEN_SECRET = 'segredo-teste-hmac-voice-2026';

const voiceEngine = require('../services/voiceActionEngine');
const { gerarTokenAcao } = require('../lib/tokens/securityToken');

test('Segurança e Autorização da Voz: Testes Unitários e HTTP Negativos', { timeout: 60000 }, async (t) => {
  // ── 1. TESTES UNITÁRIOS DIRETOS EM voiceActionEngine ─────────────────────────
  const mockStateAlfa = {
    versao: 10,
    clientes: [{ id: 'c1', nome: 'Transportes Rodoviários Alfa', doc: '11.222.333/0001-44' }],
    veiculos: [{ id: 'v1', placa: 'BRA2E19', modelo: 'Scania R450' }],
    os: [{ id: 'os1', num: 1001, box: 'b1', vei: 'v1', cli: 'c1', st: 'executando', total: 5400 }],
    pecas: [{ id: 'p1', cod: 'LONA-01', nome: 'Lona de Freio Traseira', qtd: 8, min: 4, custo: 80, venda: 180 }],
    contas: [
      { id: 'cnt1', tipo: 'pagar', desc: 'Distribuidora Molas Brasil', valor: 3500, venc: '2026-09-25', pago: false, parte: 'Distribuidora Molas' },
      { id: 'cnt2', tipo: 'pagar', desc: 'CPFL Energia Elétrica', valor: 920, venc: '2026-09-22', pago: false, parte: 'CPFL Energia' },
      { id: 'cnt3', tipo: 'receber', desc: 'Fatura OS 1000 - Rodoviários Alfa', valor: 7800, venc: '2026-09-28', pago: false }
    ],
    financeiro: { faturamentoTotal: 25000, saldoInicial: 10000 },
    caixa: { saldo: 14500, entradas: 25000, saidas: 10500 }
  };

  await t.test('Unitário 1: Mecânico com os:read tenta consultar contas a pagar -> Acesso negado e zero vazamento', async () => {
    const resMecanico = await voiceEngine.interpretarEExecutar({
      input: 'quais os próximos vencimentos a pagar?',
      context: {
        role: 'mecanico',
        permissions: ['os:read', 'labor:read', 'labor:write', 'inventory:read'],
        tenantId: 'tenant_alfa',
        actorId: 'mecanico_joao'
      },
      state: mockStateAlfa
    });

    assert.equal(resMecanico.ok, false, 'Deve retornar ok: false para consulta financeira não autorizada');
    assert.equal(resMecanico.acao, 'consultar_financeiro');
    assert.equal(resMecanico.negado, true, 'Deve indicar formalmente que a ação foi negada por autorização');
    assert.ok(resMecanico.resposta.toLowerCase().includes('permissão') || resMecanico.resposta.toLowerCase().includes('negado'), 'Deve conter mensagem amigável de restrição');
    
    // Garantir ausência total de vazamento de valores monetários, fornecedores e listas
    assert.equal(resMecanico.kpis, undefined, 'NÃO deve retornar objeto kpis para mecânico');
    assert.ok(!resMecanico.resposta.includes('Distribuidora'), 'NÃO deve vazar nome do fornecedor');
    assert.ok(!resMecanico.resposta.includes('CPFL'), 'NÃO deve vazar nome de concessionária/conta');
    assert.ok(!resMecanico.resposta.includes('3.500') && !resMecanico.resposta.includes('3500'), 'NÃO deve vazar valor da conta a pagar');
    assert.ok(!resMecanico.resposta.includes('920'), 'NÃO deve vazar valor de energia');
  });

  await t.test('Unitário 2: Usuário financeiro e Admin obtêm retorno financeiro normal', async () => {
    const resFin = await voiceEngine.interpretarEExecutar({
      input: 'quais os próximos vencimentos a pagar?',
      context: {
        role: 'financeiro',
        permissions: ['financial:read', 'financial:write', 'reports:read'],
        tenantId: 'tenant_alfa',
        actorId: 'financeiro_maria'
      },
      state: mockStateAlfa
    });

    assert.equal(resFin.ok, true, 'Financeiro deve ser autorizado com sucesso');
    assert.equal(resFin.acao, 'consultar_financeiro');
    assert.ok(resFin.kpis, 'Deve conter KPIs para perfil financeiro autorizado');
    assert.ok(resFin.resposta.includes('3.500') || resFin.resposta.includes('3500') || resFin.resposta.includes('Molas'), 'Deve detalhar vencimentos para financeiro');

    const resAdmin = await voiceEngine.interpretarEExecutar({
      input: 'qual o saldo atual do caixa?',
      context: {
        role: 'tenant_admin',
        permissions: ['*'],
        tenantId: 'tenant_alfa',
        actorId: 'admin_carlos'
      },
      state: mockStateAlfa
    });

    assert.equal(resAdmin.ok, true, 'Admin deve ser autorizado');
    assert.ok(resAdmin.resposta.includes('saldo') || resAdmin.resposta.includes('caixa'));
  });

  await t.test('Unitário 3: Mecânico sem permissão de escrita não pode faturar nem excluir OS', async () => {
    const resFaturar = await voiceEngine.interpretarEExecutar({
      input: 'faturar a os 1001',
      context: {
        role: 'mecanico',
        permissions: ['os:read'],
        tenantId: 'tenant_alfa',
        actorId: 'mecanico_joao'
      },
      state: mockStateAlfa
    });

    assert.equal(resFaturar.ok, false);
    assert.equal(resFaturar.negado, true);

    const resExcluir = await voiceEngine.interpretarEExecutar({
      input: 'excluir a os 1001',
      context: {
        role: 'mecanico',
        permissions: ['os:read'],
        tenantId: 'tenant_alfa',
        actorId: 'mecanico_joao'
      },
      state: mockStateAlfa
    });

    assert.equal(resExcluir.ok, false);
    assert.equal(resExcluir.negado, true);
  });

  await t.test('Unitário 4: context = {} (vazio) -> negado por default-deny para todas as ações protegidas', async () => {
    // 1. Financeiro
    const resFin = await voiceEngine.interpretarEExecutar({
      input: 'quais os próximos vencimentos a pagar?',
      context: {},
      state: mockStateAlfa
    });
    assert.equal(resFin.ok, false, 'Financeiro com context vazio deve ser negado');
    assert.equal(resFin.negado, true);

    // 2. Faturar OS
    const resFat = await voiceEngine.interpretarEExecutar({
      input: 'faturar a os 1001',
      context: {},
      state: mockStateAlfa
    });
    assert.equal(resFat.ok, false, 'Faturar com context vazio deve ser negado');
    assert.equal(resFat.negado, true);

    // 3. Excluir OS
    const resExc = await voiceEngine.interpretarEExecutar({
      input: 'excluir a os 1001',
      context: {},
      state: mockStateAlfa
    });
    assert.equal(resExc.ok, false, 'Excluir com context vazio deve ser negado');
    assert.equal(resExc.negado, true);

    // 4. Abrir OS
    const resAbr = await voiceEngine.interpretarEExecutar({
      input: 'abrir nova os para o veiculo BRA2E19',
      context: {},
      state: mockStateAlfa
    });
    assert.equal(resAbr.ok, false, 'Abrir OS com context vazio deve ser negado');
    assert.equal(resAbr.negado, true);

    // 5. Ajustar Estoque
    const resEst = await voiceEngine.interpretarEExecutar({
      input: 'ajustar estoque da peça LONA-01 para 10',
      context: {},
      state: mockStateAlfa
    });
    assert.equal(resEst.ok, false, 'Ajustar estoque com context vazio deve ser negado');
    assert.equal(resEst.negado, true);
  });

  await t.test('Unitário 5: actorId com substring de papel ("gerente_sintetico", "admin_externo") sem role/permissões -> negado', async () => {
    const resGerenteForjado = await voiceEngine.interpretarEExecutar({
      input: 'quais os próximos vencimentos a pagar?',
      context: {
        actorId: 'gerente_sintetico',
        permissions: []
      },
      state: mockStateAlfa
    });
    assert.equal(resGerenteForjado.ok, false, 'Substring gerente em actorId NÃO deve conceder privilégios');
    assert.equal(resGerenteForjado.negado, true);

    const resAdminForjado = await voiceEngine.interpretarEExecutar({
      input: 'qual o saldo atual do caixa?',
      context: {
        actorId: 'admin_externo_nao_autenticado',
        permissions: []
      },
      state: mockStateAlfa
    });
    assert.equal(resAdminForjado.ok, false, 'Substring admin em actorId NÃO deve conceder privilégios');
    assert.equal(resAdminForjado.negado, true);
  });

  await t.test('Unitário 6: actorId de admin sem permissões canônicas e sem role -> negado', async () => {
    const resAdminSemRole = await voiceEngine.interpretarEExecutar({
      input: 'excluir a os 1001',
      context: {
        actorId: 'admin',
        tenantId: 'tenant_alfa'
      },
      state: mockStateAlfa
    });
    assert.equal(resAdminSemRole.ok, false, 'actorId admin sem role/perms canônicas deve ser negado');
    assert.equal(resAdminSemRole.negado, true);
  });

  await t.test('Unitário 7: Token de confirmação ausente, inválido ou expirado -> negado com negado: true', async () => {
    // 1. Token ausente ao confirmar ação
    const resSemToken = await voiceEngine.interpretarEExecutar({
      input: 'confirmar',
      context: {
        tenantId: 'tenant_alfa',
        actorId: 'admin_carlos',
        role: 'tenant_admin',
        permissions: ['*']
      },
      state: mockStateAlfa
    });
    assert.equal(resSemToken.ok, false);
    assert.equal(resSemToken.negado, true, 'Confirmação sem token deve indicar negado: true');

    // 2. Token inválido/forjado
    const resTokenInvalido = await voiceEngine.interpretarEExecutar({
      input: 'confirmar',
      context: {
        confirmToken: 'token_falso_12345_invalido',
        tenantId: 'tenant_alfa',
        actorId: 'admin_carlos',
        role: 'tenant_admin',
        permissions: ['*']
      },
      state: mockStateAlfa
    });
    assert.equal(resTokenInvalido.ok, false);
    assert.equal(resTokenInvalido.negado, true, 'Token inválido deve retornar negado: true');
  });

  await t.test('Unitário 8: Contextos válidos de admin e gerente com papéis/permissões canônicos -> permitidos com sucesso', async () => {
    // 1. Admin com permissões canônicas
    const resAdminValido = await voiceEngine.interpretarEExecutar({
      input: 'qual o saldo atual do caixa?',
      context: {
        tenantId: 'tenant_alfa',
        actorId: 'admin_carlos',
        role: 'tenant_admin',
        permissions: ['*']
      },
      state: mockStateAlfa
    });
    assert.equal(resAdminValido.ok, true, 'Admin com context canônico deve ser aprovado');

    // 2. Gerente com permissões operacionais e de estoque
    const resGerenteValido = await voiceEngine.interpretarEExecutar({
      input: 'Como está o estoque da peça LONA-01?',
      context: {
        tenantId: 'tenant_alfa',
        actorId: 'gerente_antonio',
        role: 'gerente',
        permissions: ['inventory:read', 'inventory:write', 'inventory:adjust']
      },
      state: mockStateAlfa
    });
    assert.equal(resGerenteValido.ok, true, 'Gerente com permissão de inventário deve ser aprovado');
    assert.equal(resGerenteValido.acao, 'consultar_estoque_peca');
  });

  // ── 2. TESTES HTTP COM SERVIDOR EXPRESS REAL E AUTENTICAÇÃO PERSISTENTE ─────
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'patio-voice-sec-'));
  const dbPath = path.join(tempDir, 'test.db');
  const uploadDir = path.join(tempDir, 'uploads');
  fs.mkdirSync(uploadDir, { recursive: true });

  // Provisionar banco com usuários sintéticos dos perfis mecânico, financeiro e admin
  process.env.DB_PATH = dbPath;
  const db = require('../db');
  await db.initDB();

  const userRepo = require('../lib/auth/userRepository');
  await userRepo.createUser({
    username: 'mecanico_teste',
    email: 'mecanico@teste.com',
    password: 'SenhaForteMecanico#2026',
    role: 'mecanico',
    tenantId: 'tenant_alfa',
    fullName: 'Mecânico Silva'
  });

  await userRepo.createUser({
    username: 'financeiro_teste',
    email: 'financeiro@teste.com',
    password: 'SenhaForteFinanceiro#2026',
    role: 'financeiro',
    tenantId: 'tenant_alfa',
    fullName: 'Financeiro Souza'
  });

  await userRepo.createUser({
    username: 'admin_teste',
    email: 'admin@teste.com',
    password: 'SenhaForteAdmin#2026',
    role: 'tenant_admin',
    tenantId: 'tenant_alfa',
    fullName: 'Administrador Alfa'
  });

  await userRepo.createUser({
    username: 'operador_beta',
    email: 'beta@teste.com',
    password: 'SenhaForteBeta#2026',
    role: 'mecanico',
    tenantId: 'tenant_beta',
    fullName: 'Operador Oficina Beta'
  });

  // Gravar estado inicial com contas a pagar em tenant_alfa
  const { persistState } = require('../lib/repository/stateRepository');
  await persistState({ tenantId: 'tenant_alfa', role: 'admin', permissions: ['*'], actorId: 'init' }, {
    ...mockStateAlfa,
    versao: 1
  });

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
      API_KEY: 'master-voice-sec-key',
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
    if (child.exitCode !== null && child.exitCode !== 0) {
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

  // Aguardar servidor HTTP responder /health
  const baseUrl = `http://127.0.0.1:${port}`;
  let online = false;
  for (let i = 0; i < 150; i++) {
    if (child.exitCode !== null) {
      throw new Error(`Servidor finalizou prematuramente com código ${child.exitCode}: ${childLogs}`);
    }
    try {
      const res = await fetch(`${baseUrl}/health`);
      if (res.ok) { online = true; break; }
    } catch (_) {}
    await new Promise(r => setTimeout(r, 100));
  }
  assert.ok(online, 'Servidor deve inicializar e responder /health');

  const basicAuth = (user, pass) => 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64');
  const authMecanico = basicAuth('mecanico_teste', 'SenhaForteMecanico#2026');
  const authFinanceiro = basicAuth('financeiro_teste', 'SenhaForteFinanceiro#2026');
  const authAdmin = basicAuth('admin_teste', 'SenhaForteAdmin#2026');
  const authBeta = basicAuth('operador_beta', 'SenhaForteBeta#2026');

  await t.test('HTTP 1: Mecânico autenticado tenta consultar contas a pagar via /api/comando-voz -> Erro de autorização e sem vazamento', async () => {
    const res = await fetch(`${baseUrl}/api/comando-voz`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authMecanico,
        'x-tenant-id': 'tenant_alfa'
      },
      body: JSON.stringify({
        texto: 'quais os próximos vencimentos a pagar?'
      })
    });

    assert.equal(res.status, 200, 'Endpoint de voz retorna 200 com envelope de resposta');
    const body = await res.json();
    assert.equal(body.ok, false, 'Deve indicar ok: false na resposta');
    assert.equal(body.negado, true, 'Deve indicar negado: true');
    assert.ok(body.resposta.toLowerCase().includes('permissão') || body.resposta.toLowerCase().includes('negado'), 'Mensagem deve informar restrição');

    // Validação estrita contra vazamento de fornecedores ou valores monetários
    assert.equal(body.kpis, undefined);
    assert.ok(!body.resposta.includes('Distribuidora'), 'NÃO deve conter nome do fornecedor');
    assert.ok(!body.resposta.includes('CPFL'), 'NÃO deve conter nome da concessionária');
    assert.ok(!body.resposta.includes('3.500') && !body.resposta.includes('3500'), 'NÃO deve vazar valores a pagar');
  });

  await t.test('HTTP 2: Usuário financeiro obtém o retorno normalmente via /api/comando-voz', async () => {
    const res = await fetch(`${baseUrl}/api/comando-voz`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authFinanceiro,
        'x-tenant-id': 'tenant_alfa'
      },
      body: JSON.stringify({
        texto: 'quais os próximos vencimentos a pagar?'
      })
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true, 'Financeiro autenticado deve ser aprovado');
    assert.equal(body.acao, 'consultar_financeiro');
    assert.ok(body.resposta.includes('3.500') || body.resposta.includes('3500') || body.resposta.includes('Molas'));
  });

  await t.test('HTTP 3: Contexto forjado pelo cliente (permissions: ["*"], role: "admin") é ignorado pelo servidor', async () => {
    // Mecânico tenta se passar por admin enviando context manipulado no corpo
    const res = await fetch(`${baseUrl}/api/comando-voz`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authMecanico,
        'x-tenant-id': 'tenant_alfa'
      },
      body: JSON.stringify({
        texto: 'quais os próximos vencimentos a pagar?',
        context: {
          role: 'admin',
          permissions: ['*'],
          isSenderAdmin: true,
          tenantId: 'tenant_alfa',
          actorId: 'admin_injetado'
        }
      })
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    // Deve ser bloqueado, pois o servidor obedece req.securityContext (que é mecanico)
    assert.equal(body.ok, false, 'Contexto forjado no body NÃO deve conceder privilégios');
    assert.equal(body.negado, true);
    assert.equal(body.kpis, undefined);
    assert.ok(!body.resposta.includes('Distribuidora'));
  });

  await t.test('HTTP 4: Tentativa de ação em outro tenant é bloqueada pelo middleware', async () => {
    // Mecânico do tenant_alfa tenta acessar tenant_beta
    const res = await fetch(`${baseUrl}/api/comando-voz`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authMecanico,
        'x-tenant-id': 'tenant_beta'
      },
      body: JSON.stringify({
        texto: 'como tá a oficina?'
      })
    });

    assert.equal(res.status, 403, 'Acesso cruzado a outro tenant deve ser rejeitado com HTTP 403');
  });

  await t.test('HTTP 5: Confirmação com token gerado para outro usuário ou tenant é rejeitada', async () => {
    // Gerar token de ação de alto risco legítimo para admin_teste em tenant_alfa
    const tokenLegitimoAdmin = gerarTokenAcao({
      tenantId: 'tenant_alfa',
      actorId: 'admin_teste',
      resourceId: 'os1',
      action: 'excluir_os',
      version: 1
    });

    // 1. Mecânico de tenant_alfa tenta confirmar ação gerada pelo Admin
    const resMecanicoTentando = await fetch(`${baseUrl}/api/comando-voz/confirmar`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authMecanico,
        'x-tenant-id': 'tenant_alfa'
      },
      body: JSON.stringify({ token: tokenLegitimoAdmin })
    });

    const bodyMecanico = await resMecanicoTentando.json();
    assert.equal(bodyMecanico.ok, false, 'Confirmação por outro operador deve falhar');
    assert.ok(bodyMecanico.resposta.toLowerCase().includes('mesmo operador') || (bodyMecanico.error && bodyMecanico.error.toLowerCase().includes('mesmo operador')));

    // 2. Operador de outro tenant tenta confirmar ação
    const resBetaTentando = await fetch(`${baseUrl}/api/comando-voz/confirmar`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authBeta,
        'x-tenant-id': 'tenant_beta'
      },
      body: JSON.stringify({ token: tokenLegitimoAdmin })
    });

    const bodyBeta = await resBetaTentando.json();
    assert.equal(bodyBeta.ok, false, 'Confirmação de outro tenant deve falhar');
  });

  await t.test('HTTP 6: Consulta de leitura não gera alteração ou gravação de versão de estado', async () => {
    // 1. Obter estado e versão inicial do tenant_alfa
    const resEstado1 = await fetch(`${baseUrl}/api/estado`, {
      headers: {
        'Authorization': authFinanceiro,
        'x-tenant-id': 'tenant_alfa'
      }
    });
    const dataEstado1 = await resEstado1.json();
    const versaoInicial = dataEstado1.versao || dataEstado1.state?.versao;

    // 2. Executar consulta de leitura financeira
    const resVoz = await fetch(`${baseUrl}/api/comando-voz`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authFinanceiro,
        'x-tenant-id': 'tenant_alfa'
      },
      body: JSON.stringify({
        texto: 'quais os próximos vencimentos a pagar?'
      })
    });
    const bodyVoz = await resVoz.json();
    assert.equal(bodyVoz.ok, true);
    assert.equal(bodyVoz.novoEstado, null, 'Consulta de leitura NÃO deve retornar novoEstado');

    // 3. Obter estado novamente e assegurar que versão continua idêntica
    const resEstado2 = await fetch(`${baseUrl}/api/estado`, {
      headers: {
        'Authorization': authFinanceiro,
        'x-tenant-id': 'tenant_alfa'
      }
    });
    const dataEstado2 = await resEstado2.json();
    const versaoFinal = dataEstado2.versao || dataEstado2.state?.versao;

    assert.equal(versaoFinal, versaoInicial, 'Versão do estado no banco de dados deve permanecer estritamente inalterada após consulta de leitura');
  });
});
