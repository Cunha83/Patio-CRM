'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('fs');
const os = require('os');

// Prepara banco temporário isolado antes de carregar o sistema para respeitar o DB_GUARD
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'patio_wpp_fin_'));
const testDb = path.join(tempDir, 'test_fin.db');
process.env.DB_PATH = testDb;

const { initDB, closeDB, run, all, get } = require('../db');
const {
  processarMensagemTexto,
  tratarMensagemWhatsApp,
  verificarRateLimit,
  rateLimitMap,
  confirmacoesPendentes,
  mensagensProcessadas,
  verificarIdempotencia,
  registrarIdempotencia,
  extrairValorMonetario,
  obterPerfilNumeroWhatsApp,
  podeExecutarEscritaFinanceira
} = require('../services/whatsapp/whatsappHandlers');
const financialEngine = require('../services/financialEngine');
const financialAnalystService = require('../services/financialAnalystService');
const { getOrLoadState, salvarEstado } = require('../lib/serverContext');

test('WhatsApp Agente Financeiro - Suíte Completa de Leitura e Escrita Controlada', async (t) => {
  await initDB();

  t.after(async () => {
    try { await closeDB(); } catch (_) {}
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}
  });

  const agoraSP = financialEngine.obterAgoraSP();
  const hoje = agoraSP.dataISO;

  function criarEstadoMock(cfgOverrides = {}) {
    return {
      cfg: {
        adminFones: ['5511999998888', '5511888887777'],
        financeiroFones: ['5511977776666'],
        comandosFinanceirosEscrita: true,
        ...cfgOverrides
      },
      mecanicos: [
        { id: 'mec-1', nome: 'Mecânico João', fone: '5511955554444' }
      ],
      atendentes: [
        { id: 'ate-1', nome: 'Atendente Bia', fone: '5511944443333' }
      ],
      caixas: [],
      movimentos: [
        { id: 'm1', tipo: 'entrada', valor: 1500, descricao: 'Recebimento OS 101', data: hoje, hora: '10:00' },
        { id: 'm2', tipo: 'saida', valor: 350, descricao: 'Compra de óleo lubrificante', data: hoje, hora: '11:30' }
      ],
      contas: [
        { id: 'c1', tipo: 'receber', valor: 2800, parte: 'Transportadora Silva', venc: hoje, pago: false },
        { id: 'c2', tipo: 'pagar', valor: 900, desc: 'Distribuidora de Filtros', venc: hoje, pago: false }
      ],
      os: [
        { id: 'os-1', num: 101, st: 'em_andamento', total: 1500 }
      ],
      boxes: [
        { id: 'b1', nome: 'Box 01' }
      ],
      security_audit_log: []
    };
  }

  test.beforeEach(() => {
    rateLimitMap.clear();
    confirmacoesPendentes.clear();
    mensagensProcessadas.clear();
  });

  // ── 1. LEITURA SEM CONFIRMAÇÃO ──────────────────────────────────────
  await t.test('1. Comandos de Leitura executam diretamente sem confirmação', async () => {
    const mockState = criarEstadoMock();

    // 1.1 Saldo do Caixa
    const repliesCaixa = [];
    const msgCaixa = {
      from: '5511999998888@c.us',
      author: '5511999998888@c.us',
      body: '!caixa',
      reply: async (txt) => { repliesCaixa.push(txt); }
    };
    const pCaixa = await processarMensagemTexto(msgCaixa, {
      texto: '!caixa',
      tenantKey: 'default',
      tenantState: mockState,
      isContextAdmin: true
    });
    assert.equal(pCaixa, true);
    assert.equal(repliesCaixa.length, 1);
    assert.match(repliesCaixa[0], /CAIXA|SALDO/i);
    assert.equal(confirmacoesPendentes.size, 0, 'Leitura NÃO deve gerar pendência de confirmação');

    // 1.2 Entradas e Saídas do Dia
    const repliesMov = [];
    const msgMov = {
      from: '5511999998888@c.us',
      author: '5511999998888@c.us',
      body: 'entradas e saídas',
      reply: async (txt) => { repliesMov.push(txt); }
    };
    const pMov = await processarMensagemTexto(msgMov, {
      texto: 'entradas e saídas',
      tenantKey: 'default',
      tenantState: mockState,
      isContextAdmin: true
    });
    assert.equal(pMov, true);
    assert.match(repliesMov[0], /ENTRADAS E SAÍDAS DE HOJE/i);
    assert.match(repliesMov[0], /1\.500,00/);
    assert.equal(confirmacoesPendentes.size, 0);

    // 1.3 Contas a Pagar e a Receber
    const repliesContas = [];
    const msgContas = {
      from: '5511999998888@c.us',
      author: '5511999998888@c.us',
      body: 'contas a pagar e a receber',
      reply: async (txt) => { repliesContas.push(txt); }
    };
    const pContas = await processarMensagemTexto(msgContas, {
      texto: 'contas a pagar e a receber',
      tenantKey: 'default',
      tenantState: mockState,
      isContextAdmin: true
    });
    assert.equal(pContas, true);
    assert.match(repliesContas[0], /TÍTULOS E VENCIMENTOS DE HOJE/i);
    assert.equal(confirmacoesPendentes.size, 0);
  });

  // ── 2. NÚMERO NÃO AUTORIZADO (DESCONHECIDO) ─────────────────────────
  await t.test('2. Número desconhecido recebe resposta neutra e zero dados financeiros vazados', async () => {
    const mockState = criarEstadoMock();
    const defaultState = await getOrLoadState('default');
    const prevCfg = defaultState.cfg;
    defaultState.cfg = { adminFones: ['5511999998888'] };

    try {
      const replies = [];
      const msgDesconhecido = {
        from: '5511911112222@c.us',
        body: 'Qual o saldo do caixa ou movimentações?',
        hasMedia: false,
        reply: async (txt) => { replies.push(txt); }
      };

      await tratarMensagemWhatsApp(msgDesconhecido, null);

      assert.equal(replies.length, 1);
      assert.match(replies[0], /Olá! Sou o assistente do Pátio CRM/i);
      assert.doesNotMatch(replies[0], /saldo|caixa|1\.500|5\.000/i);

      // Consulta tanto no banco persistente de auditoria quanto na memória
      const auditRows = await all("SELECT * FROM security_audit_log WHERE actor_id = 'whatsapp:5511911112222'");
      const memLogs = (defaultState.security_audit_log || []).filter(l => l.details?.numeroNormalizado === '5511911112222');
      assert.ok(auditRows.length > 0 || memLogs.length > 0, 'Deve registrar auditoria para número desconhecido');
      if (auditRows.length > 0) {
        const lastRow = auditRows[auditRows.length - 1];
        const details = JSON.parse(lastRow.details_json || '{}');
        assert.equal(details.resultado, 'recusado_nao_autorizado');
      }
    } finally {
      defaultState.cfg = prevCfg;
    }
  });

  // ── 3. FLAG comandosFinanceirosEscrita (PADRÃO FALSE) ───────────────
  await t.test('3. Flag comandosFinanceirosEscrita desligada: bloqueia escrita mas mantém leitura', async () => {
    const mockStateDesativado = criarEstadoMock({ comandosFinanceirosEscrita: false });
    const numeroAdmin = '5511999998888';

    // 3.1 Tentativa de abrir caixa com flag desligada
    const repliesEscrita = [];
    const msgEscrita = {
      from: `${numeroAdmin}@c.us`,
      author: `${numeroAdmin}@c.us`,
      body: 'abrir caixa com R$ 100,00',
      reply: async (txt) => { repliesEscrita.push(txt); }
    };
    await processarMensagemTexto(msgEscrita, {
      tenantKey: 'default',
      tenantState: mockStateDesativado,
      fromNumber: numeroAdmin
    });

    assert.equal(repliesEscrita.length, 1);
    assert.match(repliesEscrita[0], /Operações Financeiras Desativadas/i);
    assert.equal(confirmacoesPendentes.size, 0, 'Não deve criar confirmação quando flag estiver desligada');

    // 3.2 Leitura continua funcionando com flag desligada
    const repliesLeitura = [];
    const msgLeitura = {
      from: `${numeroAdmin}@c.us`,
      author: `${numeroAdmin}@c.us`,
      body: '!caixa',
      reply: async (txt) => { repliesLeitura.push(txt); }
    };
    await processarMensagemTexto(msgLeitura, {
      tenantKey: 'default',
      tenantState: mockStateDesativado,
      fromNumber: numeroAdmin
    });
    assert.equal(repliesLeitura.length, 1);
    assert.match(repliesLeitura[0], /CAIXA|SALDO/i);
  });

  // ── 4. PERFIL SEM PERMISSÃO DE ESCRITA (MECÂNICO E ATENDENTE) ───────
  await t.test('4. Mecânico e Atendente são bloqueados ao tentar executar escrita financeira', async () => {
    const mockState = criarEstadoMock();

    // 4.1 Mecânico tenta abrir caixa
    const repliesMec = [];
    const msgMec = {
      from: '5511955554444@c.us', // cadastrado em mockState.mecanicos
      author: '5511955554444@c.us',
      body: 'abrir caixa com R$ 100,00',
      reply: async (txt) => { repliesMec.push(txt); }
    };

    const resMec = await processarMensagemTexto(msgMec, {
      tenantKey: 'default',
      tenantState: mockState,
      fromNumber: '5511955554444'
    });

    assert.equal(resMec, true);
    assert.equal(repliesMec.length, 1);
    assert.match(repliesMec[0], /Acesso Negado/i);
    assert.match(repliesMec[0], /mecanico/i);
    assert.equal(confirmacoesPendentes.size, 0, 'Não deve criar pendência para perfil sem permissão');

    // 4.2 Atendente tenta lançar saída
    const repliesAtend = [];
    const msgAtend = {
      from: '5511944443333@c.us', // cadastrado em mockState.atendentes
      author: '5511944443333@c.us',
      body: 'lançar saída de R$ 50,00 referente a compra de fita',
      reply: async (txt) => { repliesAtend.push(txt); }
    };

    const resAtend = await processarMensagemTexto(msgAtend, {
      tenantKey: 'default',
      tenantState: mockState,
      fromNumber: '5511944443333'
    });

    assert.equal(resAtend, true);
    assert.equal(repliesAtend.length, 1);
    assert.match(repliesAtend[0], /Acesso Negado/i);
    assert.match(repliesAtend[0], /atendente/i);
    assert.equal(confirmacoesPendentes.size, 0);
  });

  // ── 5. VALOR AUSENTE OU AMBÍGUO (PERGUNTAR, NUNCA PRESUMIR) ─────────
  await t.test('5. Valor ausente ou ambíguo: agente pergunta e não presume', async () => {
    const mockState = criarEstadoMock();
    financialAnalystService.abrirCaixa(mockState, { tenantId: 'default', saldoInicial: 500 });

    // 5.1 Valor ausente em lançamento de entrada
    const repliesAusente = [];
    const msgAusente = {
      from: '5511999998888@c.us',
      author: '5511999998888@c.us',
      body: 'lançar entrada de adiantamento de cliente',
      reply: async (txt) => { repliesAusente.push(txt); }
    };

    await processarMensagemTexto(msgAusente, {
      tenantKey: 'default',
      tenantState: mockState,
      fromNumber: '5511999998888'
    });

    assert.equal(repliesAusente.length, 1);
    assert.match(repliesAusente[0], /Não identifiquei o valor exato/i);
    assert.equal(confirmacoesPendentes.size, 0, 'Não deve criar confirmação para valor ausente');

    // 5.2 Valor ambíguo (dois valores no mesmo comando)
    const repliesAmbiguo = [];
    const msgAmbiguo = {
      from: '5511999998888@c.us',
      author: '5511999998888@c.us',
      body: 'lançar saída de 50 ou 100 reais para peças',
      reply: async (txt) => { repliesAmbiguo.push(txt); }
    };

    await processarMensagemTexto(msgAmbiguo, {
      tenantKey: 'default',
      tenantState: mockState,
      fromNumber: '5511999998888'
    });

    assert.equal(repliesAmbiguo.length, 1);
    assert.match(repliesAmbiguo[0], /múltiplos valores/i);
    assert.equal(confirmacoesPendentes.size, 0);

    // 5.3 Abertura de caixa sem valor inicial
    const mockSemCaixa = criarEstadoMock();
    const repliesAberturaSemVal = [];
    const msgAberturaSemVal = {
      from: '5511999998888@c.us',
      author: '5511999998888@c.us',
      body: 'abrir o caixa por favor',
      reply: async (txt) => { repliesAberturaSemVal.push(txt); }
    };

    await processarMensagemTexto(msgAberturaSemVal, {
      tenantKey: 'default',
      tenantState: mockSemCaixa,
      fromNumber: '5511999998888'
    });

    assert.equal(repliesAberturaSemVal.length, 1);
    assert.match(repliesAberturaSemVal[0], /Não identifiquei o saldo inicial/i);
    assert.equal(confirmacoesPendentes.size, 0);
  });

  // ── 6. FLUXO DE CONFIRMAÇÃO COM ESCRITA (CONFIRMAR) ────────────────
  await t.test('6. Fluxo de escrita: resumo claro e execução apenas com CONFIRMAR explícito', async () => {
    const mockState = criarEstadoMock();
    const numeroAdmin = '5511999998888';

    // 6.1 Solicita abertura de caixa
    const repliesAbertura = [];
    const msgAbertura = {
      from: `${numeroAdmin}@c.us`,
      author: `${numeroAdmin}@c.us`,
      body: 'abrir caixa com R$ 250,00',
      reply: async (txt) => { repliesAbertura.push(txt); }
    };

    await processarMensagemTexto(msgAbertura, {
      tenantKey: 'default',
      tenantState: mockState,
      fromNumber: numeroAdmin
    });

    assert.equal(repliesAbertura.length, 1);
    assert.match(repliesAbertura[0], /CONFIRMAÇÃO DE OPERAÇÃO FINANCEIRA/i);
    assert.match(repliesAbertura[0], /Abertura de Caixa/);
    assert.match(repliesAbertura[0], /250,00/);
    assert.match(repliesAbertura[0], /CONFIRMAR/);
    assert.equal(confirmacoesPendentes.size, 1, 'Deve conter 1 pendência ativa');

    // 6.2 Responde CONFIRMAR
    const repliesConfirm = [];
    const msgConfirm = {
      from: `${numeroAdmin}@c.us`,
      author: `${numeroAdmin}@c.us`,
      body: 'CONFIRMAR',
      reply: async (txt) => { repliesConfirm.push(txt); }
    };

    await processarMensagemTexto(msgConfirm, {
      tenantKey: 'default',
      tenantState: mockState,
      fromNumber: numeroAdmin
    });

    assert.equal(repliesConfirm.length, 1);
    assert.match(repliesConfirm[0], /Caixa Aberto com Sucesso/i);
    assert.equal(confirmacoesPendentes.size, 0, 'Pendência deve ser consumida e removida');

    // Verifica que o caixa foi realmente aberto no estado
    const caixaAberto = financialAnalystService.obterCaixaAberto(mockState, 'default');
    assert.ok(caixaAberto, 'O turno de caixa deve estar aberto');
    assert.equal(caixaAberto.saldoAtual, 250);

    // 6.3 Lança entrada com confirmação
    const repliesEntrada1 = [];
    await processarMensagemTexto({
      from: `${numeroAdmin}@c.us`,
      author: `${numeroAdmin}@c.us`,
      body: 'lançar entrada de R$ 120,00 referente a pagamento pix peça',
      reply: async (txt) => { repliesEntrada1.push(txt); }
    }, { tenantKey: 'default', tenantState: mockState, fromNumber: numeroAdmin });

    assert.match(repliesEntrada1[0], /Lançar Entrada/);
    assert.match(repliesEntrada1[0], /120,00/);
    assert.match(repliesEntrada1[0], /pagamento pix peça/);

    const repliesEntradaConfirm = [];
    await processarMensagemTexto({
      from: `${numeroAdmin}@c.us`,
      author: `${numeroAdmin}@c.us`,
      body: 'confirmar',
      reply: async (txt) => { repliesEntradaConfirm.push(txt); }
    }, { tenantKey: 'default', tenantState: mockState, fromNumber: numeroAdmin });

    assert.match(repliesEntradaConfirm[0], /Entrada Registrada com Sucesso/i);
    assert.equal(caixaAberto.saldoAtual, 370); // 250 + 120
  });

  // ── 7. ISOLAMENTO DO CONFIRMAR: OUTRO NÚMERO NÃO EXECUTA NEM REVELA ──
  await t.test('7. CONFIRMAR vindo de outro número não executa nem revela a pendência', async () => {
    const mockState = criarEstadoMock();
    const numero1 = '5511999998888';
    const numero2 = '5511888887777'; // Outro admin

    // Número 1 solicita abertura de caixa de R$ 500,00
    await processarMensagemTexto({
      from: `${numero1}@c.us`,
      author: `${numero1}@c.us`,
      body: 'abrir caixa com R$ 500,00',
      reply: async () => {}
    }, { tenantKey: 'default', tenantState: mockState, fromNumber: numero1 });

    assert.equal(confirmacoesPendentes.size, 1);
    assert.ok(confirmacoesPendentes.has(`default:${numero1}`));

    // Número 2 tenta enviar CONFIRMAR
    const repliesNumero2 = [];
    const tratado = await processarMensagemTexto({
      from: `${numero2}@c.us`,
      author: `${numero2}@c.us`,
      body: 'CONFIRMAR',
      reply: async (txt) => { repliesNumero2.push(txt); }
    }, { tenantKey: 'default', tenantState: mockState, fromNumber: numero2 });

    // Garante que o caixa NÃO foi aberto
    const caixaAberto = financialAnalystService.obterCaixaAberto(mockState, 'default');
    assert.equal(caixaAberto, null, 'Caixa não pode ter sido aberto por confirmação de outro número');

    // Garante que nenhuma mensagem vazou os dados da pendência do número 1
    repliesNumero2.forEach(txt => {
      assert.doesNotMatch(txt, /500/);
      assert.doesNotMatch(txt, /Abertura de Caixa/i);
    });

    // A pendência do número 1 continua intacta
    assert.ok(confirmacoesPendentes.has(`default:${numero1}`));

    // Quando o próprio número 1 confirma, executa
    const repliesNumero1 = [];
    await processarMensagemTexto({
      from: `${numero1}@c.us`,
      author: `${numero1}@c.us`,
      body: 'CONFIRMAR',
      reply: async (txt) => { repliesNumero1.push(txt); }
    }, { tenantKey: 'default', tenantState: mockState, fromNumber: numero1 });

    assert.match(repliesNumero1[0], /Caixa Aberto com Sucesso/i);
    assert.equal(confirmacoesPendentes.size, 0);
  });

  // ── 8. RESPOSTA DIFERENTE CANCELA OPERAÇÃO ───────────────────────────
  await t.test('8. Qualquer resposta diferente de CONFIRMAR cancela a operação', async () => {
    const mockState = criarEstadoMock();
    const numeroAdmin = '5511999998888';

    // Solicita abertura de caixa
    await processarMensagemTexto({
      from: `${numeroAdmin}@c.us`,
      author: `${numeroAdmin}@c.us`,
      body: 'abrir caixa com R$ 500,00',
      reply: async () => {}
    }, { tenantKey: 'default', tenantState: mockState, fromNumber: numeroAdmin });

    assert.equal(confirmacoesPendentes.size, 1);

    // Responde cancelando (ex: 'cancelar', 'não', '100', etc.)
    const repliesCancela = [];
    await processarMensagemTexto({
      from: `${numeroAdmin}@c.us`,
      author: `${numeroAdmin}@c.us`,
      body: 'não, digitei o valor errado',
      reply: async (txt) => { repliesCancela.push(txt); }
    }, { tenantKey: 'default', tenantState: mockState, fromNumber: numeroAdmin });

    assert.equal(repliesCancela.length, 1);
    assert.match(repliesCancela[0], /Operação Cancelada/i);
    assert.equal(confirmacoesPendentes.size, 0);

    const caixaAberto = financialAnalystService.obterCaixaAberto(mockState, 'default');
    assert.equal(caixaAberto, null, 'O caixa NÃO deve ser aberto');
  });

  // ── 9. CONFIRMAÇÃO EXPIRADA (> 2 MINUTOS) ───────────────────────────
  await t.test('9. Confirmação expirada (> 2 minutos) não executa e cancela', async () => {
    const mockState = criarEstadoMock();
    const numeroAdmin = '5511999998888';

    // Cria solicitação de abertura
    await processarMensagemTexto({
      from: `${numeroAdmin}@c.us`,
      author: `${numeroAdmin}@c.us`,
      body: 'abrir caixa com R$ 300,00',
      reply: async () => {}
    }, { tenantKey: 'default', tenantState: mockState, fromNumber: numeroAdmin });

    const chave = `default:${numeroAdmin}`;
    assert.ok(confirmacoesPendentes.has(chave));

    // Simula passagem de 2 minutos e 1 segundo
    confirmacoesPendentes.get(chave).expiraEm = Date.now() - 1000;

    // Usuário tenta confirmar após expiração
    const repliesExp = [];
    await processarMensagemTexto({
      from: `${numeroAdmin}@c.us`,
      author: `${numeroAdmin}@c.us`,
      body: 'CONFIRMAR',
      reply: async (txt) => { repliesExp.push(txt); }
    }, { tenantKey: 'default', tenantState: mockState, fromNumber: numeroAdmin });

    assert.equal(repliesExp.length, 1);
    assert.match(repliesExp[0], /prazo de 2 minutos para confirmação expirou/i);
    assert.equal(confirmacoesPendentes.size, 0);

    const caixaAberto = financialAnalystService.obterCaixaAberto(mockState, 'default');
    assert.equal(caixaAberto, null, 'Caixa não deve abrir com confirmação expirada');
  });

  // ── 10. IDEMPOTÊNCIA DURÁVEL EM SQLITE KV COM TTL (PREFIXADA POR TENANT) ───
  await t.test('10. Idempotência durável em SQLite KV com TTL: sobrevive à limpeza da memória', async () => {
    const msgId = 'true_5511999998888@c.us_DURABLE_TEST_001';
    const tenantId = 'oficina_alfa';

    // Inicialmente não duplicada
    const check1 = await verificarIdempotencia(msgId, tenantId);
    assert.equal(check1.duplicada, false);

    // Registra idempotência durável
    await registrarIdempotencia(msgId, 'Resposta salva no SQLite KV', tenantId);

    // Confere que gravou no SQLite KV com o prefixo do tenant
    const row = await get('SELECT value FROM kv WHERE key = ?', [`tenant:${tenantId}:wpp_msg:${msgId}`]);
    assert.ok(row && row.value, 'Deve ter persistido no SQLite KV com chave prefixada');
    const parsed = JSON.parse(row.value);
    assert.equal(parsed.resposta, 'Resposta salva no SQLite KV');
    assert.equal(parsed.tenantKey, tenantId);
    assert.ok(parsed.expiraEm > Date.now());

    // Limpa a memória RAM para simular restart do processo
    mensagensProcessadas.clear();

    // Consulta novamente: deve buscar do SQLite KV e reportar duplicada com a mesma resposta
    const check2 = await verificarIdempotencia(msgId, tenantId);
    assert.equal(check2.duplicada, true);
    assert.equal(check2.resposta, 'Resposta salva no SQLite KV');
  });

  // ── 11. MENSAGEM DE GRUPO: REMETENTE PRECISA ESTAR NA WHITELIST ─────
  await t.test('11. Mensagem de grupo: remetente fora da whitelist é barrado na escrita', async () => {
    const mockState = criarEstadoMock();

    const replies = [];
    const msgGrupo = {
      from: '1203630293810293@g.us', // É grupo
      author: '5511912345678@c.us', // Remetente NÃO listado em adminFones
      body: 'abrir caixa com R$ 100,00',
      reply: async (txt) => { replies.push(txt); }
    };

    await processarMensagemTexto(msgGrupo, {
      tenantKey: 'default',
      tenantState: mockState,
      isGroup: true,
      fromNumber: '5511912345678'
    });

    assert.equal(replies.length, 1);
    assert.match(replies[0], /whitelist/i);
    assert.equal(confirmacoesPendentes.size, 0);
  });

  // ── 12. ISOLAMENTO DE IDEMPOTÊNCIA ENTRE TENANTS DISTINTOS ─────────
  await t.test('12. Isolamento de idempotência: mesmo msgId em tenants diferentes não conflita', async () => {
    const msgId = 'msg_compartilhada_id_999';
    const tenantA = 'tenant_oficina_a';
    const tenantB = 'tenant_oficina_b';

    mensagensProcessadas.clear();

    // Registra mensagem no Tenant A
    await registrarIdempotencia(msgId, 'Resposta Tenant A', tenantA);

    // No Tenant A deve constar como duplicada
    const checkA = await verificarIdempotencia(msgId, tenantA);
    assert.equal(checkA.duplicada, true);
    assert.equal(checkA.resposta, 'Resposta Tenant A');

    // No Tenant B a mesma mensagem NÃO deve constar como duplicada
    const checkB = await verificarIdempotencia(msgId, tenantB);
    assert.equal(checkB.duplicada, false, 'Tenant B não deve ser afetado pelo registro do Tenant A');
  });

  // ── 13. LIMITE DE VALOR POR LANÇAMENTO VIA WHATSAPP (PADRÃO R$ 1.000)
  await t.test('13. Limite de valor por lançamento via WhatsApp: padrão R$ 1.000,00, bloqueio pré-confirmação e auditoria', async () => {
    const mockState = criarEstadoMock();
    financialAnalystService.abrirCaixa(mockState, {
      tenantId: 'default',
      saldoInicial: 500,
      operador: '5511999998888',
      operadorNome: 'Admin'
    });
    const numeroAdmin = '5511999998888';

    // 13.1 Valor no limite exato de R$ 1.000,00 -> passa para CONFIRMAÇÃO
    const repliesNoLimite = [];
    await processarMensagemTexto({
      from: `${numeroAdmin}@c.us`,
      author: `${numeroAdmin}@c.us`,
      body: 'lançar entrada de R$ 1.000,00 referente a pagamento de serviço',
      reply: async (txt) => { repliesNoLimite.push(txt); }
    }, { tenantKey: 'default', tenantState: mockState, fromNumber: numeroAdmin });

    assert.equal(repliesNoLimite.length, 1);
    assert.match(repliesNoLimite[0], /CONFIRMAÇÃO DE OPERAÇÃO FINANCEIRA/);
    assert.match(repliesNoLimite[0], /1\.000,00/);
    confirmacoesPendentes.clear();

    // 13.2 Valor acima do limite padrão (ex: R$ 1.000,01 ou R$ 1.500,00) -> recusa sem pedir confirmação
    const repliesAcima = [];
    await processarMensagemTexto({
      from: `${numeroAdmin}@c.us`,
      author: `${numeroAdmin}@c.us`,
      body: 'lançar entrada de R$ 1.500,00 referente a pagamento lote',
      reply: async (txt) => { repliesAcima.push(txt); }
    }, { tenantKey: 'default', tenantState: mockState, fromNumber: numeroAdmin });

    assert.equal(repliesAcima.length, 1);
    assert.match(repliesAcima[0], /Limite Excedido/i);
    assert.match(repliesAcima[0], /Pátio CRM Web/i);
    assert.equal(confirmacoesPendentes.size, 0, 'Não deve gerar pendência quando exceder o limite');

    // 13.3 Abertura de caixa acima do limite -> também recusa
    const mockSemCaixa = criarEstadoMock();
    const repliesAberturaAcima = [];
    await processarMensagemTexto({
      from: `${numeroAdmin}@c.us`,
      author: `${numeroAdmin}@c.us`,
      body: 'abrir caixa com R$ 2.000,00',
      reply: async (txt) => { repliesAberturaAcima.push(txt); }
    }, { tenantKey: 'default', tenantState: mockSemCaixa, fromNumber: numeroAdmin });

    assert.equal(repliesAberturaAcima.length, 1);
    assert.match(repliesAberturaAcima[0], /Limite Excedido/i);
    assert.equal(confirmacoesPendentes.size, 0);

    // 13.4 Configuração customizada válida (ex: R$ 500,00)
    mockState.cfg.limiteValorLancamentoWhatsapp = 500.00;
    const repliesCustomAcima = [];
    await processarMensagemTexto({
      from: `${numeroAdmin}@c.us`,
      author: `${numeroAdmin}@c.us`,
      body: 'lançar saída de R$ 600,00 referente a ferramenta',
      reply: async (txt) => { repliesCustomAcima.push(txt); }
    }, { tenantKey: 'default', tenantState: mockState, fromNumber: numeroAdmin });

    assert.match(repliesCustomAcima[0], /Limite Excedido/i);
    assert.match(repliesCustomAcima[0], /500,00/);

    // 13.5 Configuração inválida, zerada ou negativa -> volta estritamente para o padrão R$ 1.000,00
    mockState.cfg.limiteValorLancamentoWhatsapp = 0; // Inválido / Tentativa de burlar limite
    const repliesCfgInvalida = [];
    await processarMensagemTexto({
      from: `${numeroAdmin}@c.us`,
      author: `${numeroAdmin}@c.us`,
      body: 'lançar saída de R$ 1.200,00 referente a peça cara',
      reply: async (txt) => { repliesCfgInvalida.push(txt); }
    }, { tenantKey: 'default', tenantState: mockState, fromNumber: numeroAdmin });

    assert.match(repliesCfgInvalida[0], /Limite Excedido/i);
    assert.match(repliesCfgInvalida[0], /1\.000,00/, 'Deve adotar o fallback seguro de R$ 1.000,00');

    // 13.6 Auditoria gravada com resultado negado_limite
    const auditRows = await all("SELECT * FROM security_audit_log WHERE details_json LIKE '%negado_limite%'");
    assert.ok(auditRows.length >= 3, 'Deve registrar eventos de auditoria com resultado negado_limite');
  });

  // ── 14. BLOQUEIO DE ÁUDIO/VOZ EM OPERAÇÕES FINANCEIRAS DE ESCRITA E CONFIRMAR ─
  await t.test('14. Bloqueio de áudio/voz: escrita e CONFIRMAR só por texto digitado', async () => {
    const { tratarMensagemWhatsApp } = require('../services/whatsapp/whatsappHandlers');
    const mockState = criarEstadoMock();
    const numeroAdmin = '5511999998888';

    // 14.1 Simula recebimento de áudio quando há pendência de confirmação
    const chavePendente = `default:${numeroAdmin}`;
    confirmacoesPendentes.set(chavePendente, {
      acao: 'lancar_entrada',
      valor: 200,
      expiraEm: Date.now() + 60000,
      fromNumber: numeroAdmin
    });

    const repliesAudio = [];
    const msgAudio = {
      id: { _serialized: 'msg_audio_confirm_attempt' },
      from: `${numeroAdmin}@c.us`,
      author: `${numeroAdmin}@c.us`,
      hasMedia: true,
      type: 'audio',
      body: '',
      downloadMedia: async () => ({ data: 'fake_audio_base64_data', mimetype: 'audio/ogg' }),
      reply: async (txt) => { repliesAudio.push(txt); }
    };

    await tratarMensagemWhatsApp(msgAudio, null);

    assert.equal(repliesAudio.length, 1);
    assert.match(repliesAudio[0], /Operação Financeira Pendente/i);
    assert.match(repliesAudio[0], /texto digitado/i);
    assert.ok(confirmacoesPendentes.has(chavePendente), 'Pendência não deve ser consumida nem afetada por áudio');
  });

  // ── 15. AUDITORIA DE CONCORRÊNCIA, TTL, SOBRESCRITA E RASTREABILIDADE (TAREFA 1) ─
  await t.test('15. Confirmação financeira: TTL com SIM, sobrescrita de comandos encadeados, atomicidade contra duplo clique e metadados', async () => {
    const mockState = criarEstadoMock();
    const numeroAdmin = '5511999998888';
    const chave = `default:${numeroAdmin}`;

    // A. Tentativa de confirmar ('SIM') após expiração do TTL: deve bloquear e limpar pendência
    confirmacoesPendentes.clear();
    await processarMensagemTexto({
      from: `${numeroAdmin}@c.us`,
      author: `${numeroAdmin}@c.us`,
      body: 'abrir caixa com R$ 150,00',
      reply: async () => {}
    }, { tenantKey: 'default', tenantState: mockState, fromNumber: numeroAdmin });

    assert.ok(confirmacoesPendentes.has(chave));
    // Força expiração do TTL
    confirmacoesPendentes.get(chave).expiraEm = Date.now() - 5000;

    const repliesSimExpirado = [];
    await processarMensagemTexto({
      from: `${numeroAdmin}@c.us`,
      author: `${numeroAdmin}@c.us`,
      body: 'SIM',
      reply: async (txt) => { repliesSimExpirado.push(txt); }
    }, { tenantKey: 'default', tenantState: mockState, fromNumber: numeroAdmin });

    assert.equal(repliesSimExpirado.length, 1);
    assert.match(repliesSimExpirado[0], /prazo .* confirmação expirou/i);
    assert.equal(confirmacoesPendentes.has(chave), false, 'Pendência expirada deve ser limpa');
    assert.equal(financialAnalystService.obterCaixaAberto(mockState, 'default'), null);

    // B. Envio de dois comandos financeiros seguidos antes do SIM (apenas o segundo deve permanecer)
    confirmacoesPendentes.clear();
    const repliesPrimeiro = [];
    await processarMensagemTexto({
      from: `${numeroAdmin}@c.us`,
      author: `${numeroAdmin}@c.us`,
      body: 'abrir caixa com R$ 200,00',
      reply: async (txt) => { repliesPrimeiro.push(txt); }
    }, { tenantKey: 'default', tenantState: mockState, fromNumber: numeroAdmin });

    assert.ok(confirmacoesPendentes.has(chave));
    assert.equal(confirmacoesPendentes.get(chave).valor, 200);

    // Segundo comando antes da confirmação
    const repliesSegundo = [];
    await processarMensagemTexto({
      from: `${numeroAdmin}@c.us`,
      author: `${numeroAdmin}@c.us`,
      body: 'abrir caixa com R$ 350,00',
      reply: async (txt) => { repliesSegundo.push(txt); }
    }, { tenantKey: 'default', tenantState: mockState, fromNumber: numeroAdmin });

    assert.ok(confirmacoesPendentes.has(chave));
    assert.equal(confirmacoesPendentes.get(chave).valor, 350, 'A pendência deve ter sido substituída pelo valor do segundo comando');
    assert.match(repliesSegundo[0], /substituída por esta nova/i, 'Deve avisar que a pendência anterior foi substituída');
    assert.match(repliesSegundo[0], /350,00/);

    // Confirma o segundo comando via 'SIM'
    const repliesConfirmarSegundo = [];
    await processarMensagemTexto({
      from: `${numeroAdmin}@c.us`,
      author: `${numeroAdmin}@c.us`,
      body: 'SIM',
      reply: async (txt) => { repliesConfirmarSegundo.push(txt); }
    }, { tenantKey: 'default', tenantState: mockState, fromNumber: numeroAdmin });

    assert.match(repliesConfirmarSegundo[0], /Caixa Aberto com Sucesso/i);
    const caixaAberto = financialAnalystService.obterCaixaAberto(mockState, 'default');
    assert.ok(caixaAberto);
    assert.equal(caixaAberto.saldoInicial, 350);
    assert.equal(caixaAberto.origem, 'whatsapp', 'Deve registrar origem whatsapp no caixa');
    assert.equal(caixaAberto.autorNumero, numeroAdmin, 'Deve registrar autorNumero no caixa');

    // C. Disparo concorrente/duplicado de 'SIM' para a mesma pendência (deve efetivar apenas 1 lançamento)
    confirmacoesPendentes.clear();
    await processarMensagemTexto({
      from: `${numeroAdmin}@c.us`,
      author: `${numeroAdmin}@c.us`,
      body: 'lançar entrada de R$ 80,00 adiantamento',
      reply: async () => {}
    }, { tenantKey: 'default', tenantState: mockState, fromNumber: numeroAdmin });

    assert.ok(confirmacoesPendentes.has(chave));
    const qtdMovimentosAntes = (mockState.movimentos || []).length;

    // Dispara dois SIM quase em paralelo simulando duplo clique ou reentrega simultânea
    const repliesConc1 = [];
    const repliesConc2 = [];
    const p1 = processarMensagemTexto({
      from: `${numeroAdmin}@c.us`,
      author: `${numeroAdmin}@c.us`,
      body: 'SIM',
      reply: async (txt) => { repliesConc1.push(txt); }
    }, { tenantKey: 'default', tenantState: mockState, fromNumber: numeroAdmin });

    const p2 = processarMensagemTexto({
      from: `${numeroAdmin}@c.us`,
      author: `${numeroAdmin}@c.us`,
      body: 'SIM',
      reply: async (txt) => { repliesConc2.push(txt); }
    }, { tenantKey: 'default', tenantState: mockState, fromNumber: numeroAdmin });

    await Promise.all([p1, p2]);

    const qtdMovimentosDepois = (mockState.movimentos || []).length;
    assert.equal(qtdMovimentosDepois, qtdMovimentosAntes + 1, 'Deve efetivar estritamente 1 lançamento mesmo com confirmações concorrentes');
    const ultimaMov = mockState.movimentos[0];
    assert.equal(ultimaMov.valor, 80);
    assert.equal(ultimaMov.origem, 'whatsapp', 'Metadado de origem deve ser whatsapp');
    assert.equal(ultimaMov.autorNumero, numeroAdmin, 'Metadado de autorNumero deve ser o telefone normalizado');
    assert.ok(ultimaMov.confirmadoEm, 'Deve registrar timestamp de confirmação');
  });

  // ── 16. NORMALIZAÇÃO CANÔNICA DE TELEFONE BR (9º DÍGITO E JID) - TAREFA 2 ──
  await t.test('16. Normalização canônica de telefone BR: 9º dígito, formatos de JID e fail-closed de @lid', async () => {
    const { isAdminPhone, isSameBrazilianPhone, parseBrazilianPhone } = require('../lib/core');
    const { extrairTelefoneDeJid } = require('../services/whatsapp/whatsappHandlers');

    // Testes unitários das funções puras de telefone
    assert.equal(isSameBrazilianPhone('5562999998888', '6299998888'), true, 'Com 9º dígito vs sem 9º dígito deve dar match');
    assert.equal(isSameBrazilianPhone('556299998888@c.us', '5562999998888'), true, 'JID @c.us sem 9º dígito vs cadastrado com 9º dígito deve dar match');
    assert.equal(isSameBrazilianPhone('5562999998888:2@s.whatsapp.net', '6299998888'), true, 'Multi-device @s.whatsapp.net com 9º dígito vs cadastrado sem 9º dígito deve dar match');
    assert.equal(isSameBrazilianPhone('5562999998888', '5562999998887'), false, 'Números com último dígito diferente NÃO devem dar match');
    assert.equal(isSameBrazilianPhone('5561999998888', '5562999998888'), false, 'Números com DDD diferente NÃO devem dar match');
    assert.equal(isSameBrazilianPhone('123456789@lid', '5562999998888'), false, 'JID @lid não resolvível NÃO deve dar match');

    // 16.1 Admin cadastrado com 9º dígito (5562999998888) enviando a partir de JID sem 9º dígito (556299998888@c.us)
    const mockStateA = criarEstadoMock();
    mockStateA.cfg.adminFones = ['5562999998888'];
    const repliesA = [];
    await processarMensagemTexto({
      from: '556299998888@c.us',
      author: '556299998888@c.us',
      body: 'saldo',
      reply: async (txt) => { repliesA.push(txt); }
    }, { tenantKey: 'default', tenantState: mockStateA });

    assert.equal(repliesA.length, 1);
    assert.match(repliesA[0], /POSIÇÃO FINANCEIRA|Saldo em Caixa/i, 'Admin sem 9º dígito no JID deve ser reconhecido');
    assert.match(repliesA[0], /R\$/);

    // 16.2 Admin cadastrado sem 9º dígito (6299998888) enviando a partir de JID com 9º dígito (5562999998888@s.whatsapp.net)
    const mockStateB = criarEstadoMock();
    mockStateB.cfg.adminFones = ['6299998888'];
    const repliesB = [];
    await processarMensagemTexto({
      from: '5562999998888@s.whatsapp.net',
      author: '5562999998888@s.whatsapp.net',
      body: 'entradas do dia',
      reply: async (txt) => { repliesB.push(txt); }
    }, { tenantKey: 'default', tenantState: mockStateB });

    assert.equal(repliesB.length, 1);
    assert.match(repliesB[0], /ENTRADAS E SAÍDAS|Total de Entradas/i, 'Admin com 9º dígito no JID deve ser reconhecido quando cadastrado sem');

    // 16.3 Rejeição estrita (fail-closed) de número parecido mas distinto
    const mockStateC = criarEstadoMock();
    mockStateC.cfg.adminFones = ['5562999998888'];
    const repliesC = [];
    await processarMensagemTexto({
      from: '5562999998887@c.us', // final 8887 em vez de 8888
      author: '5562999998887@c.us',
      body: 'saldo',
      reply: async (txt) => { repliesC.push(txt); }
    }, { tenantKey: 'default', tenantState: mockStateC });

    assert.equal(repliesC.length, 1);
    assert.match(repliesC[0], /atendimento automatizado está disponível apenas/i, 'Número distinto deve ser rejeitado');
    assert.doesNotMatch(repliesC[0], /POSIÇÃO FINANCEIRA|Saldo em Caixa/i);

    // 16.4 JID @lid não resolvível -> Fail-closed imediato
    const mockStateD = criarEstadoMock();
    mockStateD.cfg.adminFones = ['5562999998888'];
    const repliesD = [];
    await processarMensagemTexto({
      from: '987654321098765@lid',
      author: '987654321098765@lid',
      body: 'abrir caixa com R$ 100,00',
      reply: async (txt) => { repliesD.push(txt); }
    }, { tenantKey: 'default', tenantState: mockStateD });

    assert.equal(repliesD.length, 1);
    assert.match(repliesD[0], /atendimento automatizado está disponível apenas/i, 'JID @lid não resolvível deve sofrer fail-closed');
    assert.equal(confirmacoesPendentes.size, 0, 'Nenhuma pendência financeira deve ser criada para LID não resolvível');

    // 16.5 JID @lid com propriedade alternativa contendo telefone real do admin
    const repliesE = [];
    await processarMensagemTexto({
      from: '987654321098765@lid',
      author: '987654321098765@lid',
      sender: { number: '5562999998888' },
      body: 'saldo',
      reply: async (txt) => { repliesE.push(txt); }
    }, { tenantKey: 'default', tenantState: mockStateD });

    assert.equal(repliesE.length, 1);
    assert.match(repliesE[0], /POSIÇÃO FINANCEIRA|Saldo em Caixa/i, 'JID @lid resolvido via propriedade de telefone real deve ser aceito');
  });
});

