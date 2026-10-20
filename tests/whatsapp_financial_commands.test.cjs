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
  podeExecutarEscritaFinanceira,
  podeExecutarEstorno
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

  // ── 17. CONSULTA DE EXTRATO RECENTE VIA WHATSAPP ──
  await t.test('17. Consulta de extrato recente de caixa via WhatsApp com filtros de quantidade e origem', async () => {
    const mockState = criarEstadoMock();
    const adminNum = '5511999998888';

    // Cria caixa e 3 lançamentos
    mockState.caixas = [{
      id: 'cx-extrato-1',
      status: 'aberto',
      aberto: true,
      saldoInicial: 500,
      saldoAtual: 850,
      totalEntradas: 450,
      totalSaidas: 100,
      movimentacoesIds: ['m1', 'm2', 'm3']
    }];
    mockState.movimentos = [
      { id: 'm3', caixaId: 'cx-extrato-1', tipo: 'entrada', valor: 450, desc: 'Entrada via Pix Oficina', origem: 'whatsapp', autorNumero: adminNum, confirmadoEm: new Date().toISOString() },
      { id: 'm2', caixaId: 'cx-extrato-1', tipo: 'saida', valor: 100, desc: 'Combustível Teste', origem: 'web' },
      { id: 'm1', caixaId: 'cx-extrato-1', tipo: 'entrada', valor: 500, desc: 'Abertura de Caixa', origem: 'web' }
    ];

    // 17.1 Extrato geral padrão
    const repliesGeral = [];
    await processarMensagemTexto({
      from: `${adminNum}@c.us`,
      author: `${adminNum}@c.us`,
      body: 'extrato',
      reply: async (txt) => { repliesGeral.push(txt); }
    }, { tenantKey: 'default', tenantState: mockState, fromNumber: adminNum });

    assert.equal(repliesGeral.length, 1);
    assert.match(repliesGeral[0], /EXTRATO RECENTE DE MOVIMENTAÇÕES/i);
    assert.match(repliesGeral[0], /450,00/);
    assert.match(repliesGeral[0], /100,00/);
    assert.match(repliesGeral[0], /📱 WPP/);
    assert.match(repliesGeral[0], /💻 WEB/);

    // 17.2 Extrato com limite numérico (ex: extrato 1)
    const repliesQtd = [];
    await processarMensagemTexto({
      from: `${adminNum}@c.us`,
      author: `${adminNum}@c.us`,
      body: 'extrato 1',
      reply: async (txt) => { repliesQtd.push(txt); }
    }, { tenantKey: 'default', tenantState: mockState, fromNumber: adminNum });

    assert.equal(repliesQtd.length, 1);
    assert.ok(repliesQtd[0].includes('Exibindo:* 1') || repliesQtd[0].includes('1 lançamento'));
    assert.match(repliesQtd[0], /Entrada via Pix Oficina/);
    assert.doesNotMatch(repliesQtd[0], /Combustível Teste/);

    // 17.3 Extrato filtrando apenas WhatsApp
    const repliesWpp = [];
    await processarMensagemTexto({
      from: `${adminNum}@c.us`,
      author: `${adminNum}@c.us`,
      body: 'extrato whatsapp',
      reply: async (txt) => { repliesWpp.push(txt); }
    }, { tenantKey: 'default', tenantState: mockState, fromNumber: adminNum });

    assert.equal(repliesWpp.length, 1);
    assert.match(repliesWpp[0], /Apenas WhatsApp/i);
    assert.match(repliesWpp[0], /📱 WPP/);
    assert.doesNotMatch(repliesWpp[0], /💻 WEB/);
  });

  // ── 18. COMANDO DE ESTORNO COM FLUXO EM 2 ETAPAS (CONFIRMAR) E REVERSÃO CONTÁBIL ──
  await t.test('18. Comando estornar via WhatsApp: confirmação em 2 etapas, reversão de saldo e metadados', async () => {
    const mockState = criarEstadoMock();
    const adminNum = '5511999998888';

    // Cria caixa ativo com R$ 200 de saldo inicial
    mockState.caixas = [{
      id: 'cx-est-1',
      status: 'aberto',
      aberto: true,
      saldoInicial: 200,
      saldoAtual: 300,
      totalEntradas: 100,
      totalSaidas: 0,
      movimentacoesIds: ['mov-alvo-1']
    }];
    mockState.movimentos = [
      { id: 'mov-alvo-1', caixaId: 'cx-est-1', tipo: 'entrada', valor: 100, desc: 'Lançamento de teste duplicado', origem: 'whatsapp', autorNumero: adminNum }
    ];

    // 18.1 Solicita estorno do último lançamento
    const repliesEstorno = [];
    await processarMensagemTexto({
      from: `${adminNum}@c.us`,
      author: `${adminNum}@c.us`,
      body: 'estornar ultimo lançamento duplicado por engano',
      reply: async (txt) => { repliesEstorno.push(txt); }
    }, { tenantKey: 'default', tenantState: mockState, fromNumber: adminNum });

    assert.equal(repliesEstorno.length, 1);
    assert.match(repliesEstorno[0], /CONFIRMAÇÃO DE ESTORNO CONTÁBIL/i);
    assert.match(repliesEstorno[0], /mov-alvo-1/);
    assert.match(repliesEstorno[0], /100,00/);
    assert.match(repliesEstorno[0], /CONFIRMAR/);
    assert.equal(confirmacoesPendentes.size, 1, 'Deve haver 1 pendência de estorno');

    // 18.2 Confirma com 'CONFIRMAR'
    const repliesConfirm = [];
    await processarMensagemTexto({
      from: `${adminNum}@c.us`,
      author: `${adminNum}@c.us`,
      body: 'CONFIRMAR',
      reply: async (txt) => { repliesConfirm.push(txt); }
    }, { tenantKey: 'default', tenantState: mockState, fromNumber: adminNum });

    assert.equal(repliesConfirm.length, 1);
    assert.match(repliesConfirm[0], /Estorno Realizado com Sucesso/i);
    assert.match(repliesConfirm[0], /Compensatório/);
    assert.equal(confirmacoesPendentes.size, 0, 'Pendência deve ser consumida');

    // Verifica saldo do caixa recalculado (300 - 100 = 200)
    assert.equal(mockState.caixas[0].saldoAtual, 200, 'Saldo deve voltar para 200 após estorno de entrada');
    const movOriginal = mockState.movimentos.find(m => m.id === 'mov-alvo-1');
    assert.equal(movOriginal.estornado, true);
    assert.equal(movOriginal.motivoEstorno, 'lançamento duplicado por engano');

    // Verifica lançamento compensatório
    const movComp = mockState.movimentos.find(m => m.estornoDeId === 'mov-alvo-1');
    assert.ok(movComp, 'Lançamento compensatório deve ser gerado');
    assert.equal(movComp.tipo, 'saida', 'Compensatório de entrada deve ser saída');
    assert.equal(movComp.valor, 100);
    assert.equal(movComp.origem, 'whatsapp', 'Deve preservar origem whatsapp');
    assert.equal(movComp.autorNumero, adminNum, 'Deve registrar autorNumero do admin');
  });

  // ── 19. BLOQUEIO DE RBAC PARA MECÂNICO E ATENDENTE NO ESTORNO ──
  await t.test('19. Bloqueio de RBAC para mecânico e atendente ao tentar estornar via WhatsApp com auditoria', async () => {
    const mockState = criarEstadoMock();
    const foneMecanico = '5511955554444';
    const foneAtendente = '5511944443333';

    mockState.caixas = [{ id: 'cx-rbac', status: 'aberto', aberto: true, saldoInicial: 100, saldoAtual: 100 }];
    mockState.movimentos = [{ id: 'mov-rbac-1', caixaId: 'cx-rbac', tipo: 'entrada', valor: 50, desc: 'Teste' }];

    // 19.1 Mecânico tenta estornar
    const repliesMec = [];
    await processarMensagemTexto({
      from: `${foneMecanico}@c.us`,
      author: `${foneMecanico}@c.us`,
      body: 'estornar ultimo cancelamento indevido',
      reply: async (txt) => { repliesMec.push(txt); }
    }, { tenantKey: 'default', tenantState: mockState, fromNumber: foneMecanico });

    assert.equal(repliesMec.length, 1);
    assert.match(repliesMec[0], /Acesso Negado|perfil de usuário \(mecanico\)/i);
    assert.equal(confirmacoesPendentes.size, 0, 'Mecânico não pode criar pendência de estorno');

    // 19.2 Atendente tenta estornar
    const repliesAtend = [];
    await processarMensagemTexto({
      from: `${foneAtendente}@c.us`,
      author: `${foneAtendente}@c.us`,
      body: 'estornar ultimo cancelamento indevido',
      reply: async (txt) => { repliesAtend.push(txt); }
    }, { tenantKey: 'default', tenantState: mockState, fromNumber: foneAtendente });

    assert.equal(repliesAtend.length, 1);
    assert.match(repliesAtend[0], /Acesso Negado|perfil de usuário \(atendente\)/i);
    assert.equal(confirmacoesPendentes.size, 0, 'Atendente não pode criar pendência de estorno');

    // 19.3 Verifica auditoria de estorno negado no SQLite
    const auditRows = await all('SELECT action, actor_id FROM security_audit_log WHERE action = ?', ['financeiro:movimento:estorno_negado']);
    assert.ok(auditRows.length >= 2, 'Deve registrar eventos de estorno negado no security_audit_log');
  });

  // ── 20. IDEMPOTÊNCIA E BLOQUEIO DE DUPLO ESTORNO VIA WHATSAPP ──
  await t.test('20. Bloqueio de duplo estorno e bloqueio de estorno de lançamento compensatório via WhatsApp', async () => {
    const mockState = criarEstadoMock();
    const adminNum = '5511999998888';

    mockState.caixas = [{ id: 'cx-idemp', status: 'aberto', aberto: true, saldoInicial: 100, saldoAtual: 100 }];
    mockState.movimentos = [
      { id: 'mov-ja-estornado', caixaId: 'cx-idemp', tipo: 'entrada', valor: 50, desc: 'Original', estornado: true, estornadoPor: 'Admin' },
      { id: 'mov-compensatorio', caixaId: 'cx-idemp', tipo: 'saida', valor: 50, desc: 'Compensatório', estornoDeId: 'mov-ja-estornado', subtipo: 'estorno' }
    ];

    // 20.1 Tenta estornar movimentação já estornada
    const repliesJaEst = [];
    await processarMensagemTexto({
      from: `${adminNum}@c.us`,
      author: `${adminNum}@c.us`,
      body: 'estornar mov-ja-estornado segundo estorno',
      reply: async (txt) => { repliesJaEst.push(txt); }
    }, { tenantKey: 'default', tenantState: mockState, fromNumber: adminNum });

    assert.equal(repliesJaEst.length, 1);
    assert.match(repliesJaEst[0], /já foi estornada anteriormente/i);
    assert.equal(confirmacoesPendentes.size, 0);

    // 20.2 Tenta estornar movimentação compensatória
    const repliesComp = [];
    await processarMensagemTexto({
      from: `${adminNum}@c.us`,
      author: `${adminNum}@c.us`,
      body: 'estornar mov-compensatorio estornar estorno',
      reply: async (txt) => { repliesComp.push(txt); }
    }, { tenantKey: 'default', tenantState: mockState, fromNumber: adminNum });

    assert.equal(repliesComp.length, 1);
    assert.match(repliesComp[0], /Não é permitido estornar um lançamento compensatório/i);
    assert.equal(confirmacoesPendentes.size, 0);
  });

  // ── 21. FECHAMENTO DE CAIXA AUDITADO POR ORIGEM E COMANDO RESUMO CAIXA VIA WHATSAPP ──
  await t.test('21. Fechamento de caixa com snapshot por origem e comando resumo caixa via WhatsApp', async () => {
    const mockState = criarEstadoMock();
    const adminNum = '5511999998888';
    mockState.cfg.adminFones = [adminNum];
    mockState.caixas = [
      {
        id: 'cx-fechamento-1',
        status: 'aberto',
        aberto: true,
        abertoPor: adminNum,
        abertoPorNome: 'Dono WhatsApp',
        saldoInicial: 200,
        saldoAtual: 650,
        totalEntradas: 500,
        totalSaidas: 50,
        movimentacoesIds: ['m-wpp-1', 'm-web-1']
      }
    ];
    mockState.movimentos = [
      { id: 'm-wpp-1', caixaId: 'cx-fechamento-1', tipo: 'entrada', valor: 300, desc: 'Entrada WPP', origem: 'whatsapp', canal: 'whatsapp' },
      { id: 'm-web-1', caixaId: 'cx-fechamento-1', tipo: 'entrada', valor: 200, desc: 'Entrada Web', origem: 'web', canal: 'web' },
      { id: 'm-wpp-2', caixaId: 'cx-fechamento-1', tipo: 'saida', valor: 50, desc: 'Saída WPP', origem: 'whatsapp', canal: 'whatsapp' }
    ];
    mockState.caixas[0].movimentacoesIds.push('m-wpp-2');

    // 21.1 Consulta de Resumo Caixa / Fechamento Parcial
    const repliesResumo = [];
    await processarMensagemTexto({
      from: `${adminNum}@c.us`,
      author: `${adminNum}@c.us`,
      body: 'resumo caixa',
      reply: async (txt) => { repliesResumo.push(txt); }
    }, { tenantKey: 'default', tenantState: mockState, fromNumber: adminNum });

    assert.equal(repliesResumo.length, 1);
    assert.match(repliesResumo[0], /FECHAMENTO PARCIAL DE CAIXA/i);
    assert.match(repliesResumo[0], /WhatsApp:/);
    assert.match(repliesResumo[0], /Web \/ Balcão:/);
    assert.match(repliesResumo[0], /650,00/);

    // 21.2 Fechamento de Caixa com confirmação em 2 etapas
    const repliesPedirFechar = [];
    await processarMensagemTexto({
      from: `${adminNum}@c.us`,
      author: `${adminNum}@c.us`,
      body: 'fechar caixa',
      reply: async (txt) => { repliesPedirFechar.push(txt); }
    }, { tenantKey: 'default', tenantState: mockState, fromNumber: adminNum });

    assert.equal(repliesPedirFechar.length, 1);
    assert.match(repliesPedirFechar[0], /CONFIRMAÇÃO DE OPERAÇÃO FINANCEIRA/i);
    assert.match(repliesPedirFechar[0], /Fechamento de Caixa/i);

    // Confirmação
    const repliesConfirmaFechar = [];
    await processarMensagemTexto({
      from: `${adminNum}@c.us`,
      author: `${adminNum}@c.us`,
      body: 'CONFIRMAR',
      reply: async (txt) => { repliesConfirmaFechar.push(txt); }
    }, { tenantKey: 'default', tenantState: mockState, fromNumber: adminNum });

    assert.equal(repliesConfirmaFechar.length, 1);
    assert.match(repliesConfirmaFechar[0], /Caixa Fechado com Sucesso/i);

    const cxEncerrado = mockState.caixas[0];
    assert.equal(cxEncerrado.status, 'fechado');
    assert.ok(cxEncerrado.fechamento);
    assert.ok(cxEncerrado.fechamento.resumoOrigem);
    assert.equal(cxEncerrado.fechamento.resumoOrigem.qtdWhatsapp, 2);
    assert.equal(cxEncerrado.fechamento.resumoOrigem.qtdWeb, 1);
    assert.ok(cxEncerrado.fechamento.resumoTextoWhatsapp);
    assert.match(cxEncerrado.fechamento.resumoTextoWhatsapp, /BOLETIM DE FECHAMENTO DE CAIXA/);
  });

  // ── 22. MEIOS DE PAGAMENTO, OS E PLACA: EXTRAÇÃO HEURÍSTICA E PERSISTÊNCIA ──
  await t.test('22. Extração heurística de meio de pagamento, OS e placa com confirmação e persistência', async () => {
    const mockState = criarEstadoMock();
    const adminNum = '5511999998888';
    mockState.cfg.adminFones = [adminNum];
    mockState.caixas = [
      {
        id: 'cx-meios-1',
        status: 'aberto',
        aberto: true,
        abertoPor: adminNum,
        saldoInicial: 500,
        saldoAtual: 500,
        totalEntradas: 0,
        totalSaidas: 0,
        movimentacoesIds: []
      }
    ];

    // 22.1 Envia comando com valor, descrição, meio de pagamento (pix), OS e placa
    const repliesEntrada = [];
    await processarMensagemTexto({
      from: `${adminNum}@c.us`,
      author: `${adminNum}@c.us`,
      body: 'lançar entrada de R$ 350,00 adiantamento OS #502 placa ABC1D23 via pix',
      reply: async (txt) => { repliesEntrada.push(txt); }
    }, { tenantKey: 'default', tenantState: mockState, fromNumber: adminNum });

    assert.equal(repliesEntrada.length, 1);
    assert.match(repliesEntrada[0], /CONFIRMAÇÃO DE OPERAÇÃO FINANCEIRA/i);
    assert.match(repliesEntrada[0], /350,00/);
    assert.match(repliesEntrada[0], /PIX/);
    assert.match(repliesEntrada[0], /502/);
    assert.match(repliesEntrada[0], /ABC1D23/);

    // 22.2 Confirmação explícita
    const repliesConfirm = [];
    await processarMensagemTexto({
      from: `${adminNum}@c.us`,
      author: `${adminNum}@c.us`,
      body: 'CONFIRMAR',
      reply: async (txt) => { repliesConfirm.push(txt); }
    }, { tenantKey: 'default', tenantState: mockState, fromNumber: adminNum });

    assert.equal(repliesConfirm.length, 1);
    assert.match(repliesConfirm[0], /Entrada Registrada com Sucesso/i);

    const movCriada = mockState.movimentos[0];
    assert.equal(movCriada.valor, 350);
    assert.equal(movCriada.forma, 'pix');
    assert.equal(movCriada.osId, '502');
    assert.equal(movCriada.placa, 'ABC1D23');
    assert.equal(movCriada.origem, 'whatsapp');
    assert.equal(movCriada.autorNumero, adminNum);

    // 22.3 Validação de resumoMeiosPagamento via financialAnalystService
    const listaRes = financialAnalystService.listarMovimentacoes(mockState, { caixaId: 'cx-meios-1' });
    assert.ok(listaRes.resumoMeiosPagamento);
    assert.equal(listaRes.resumoMeiosPagamento.pix?.qtd, 1);
    assert.equal(listaRes.resumoMeiosPagamento.pix?.total, 350);
  });

  await t.test('23. Consulta de extrato financeiro por OS via WhatsApp com múltiplos recebimentos e estorno', async () => {
    const mockState = criarEstadoMock();
    const adminNum = '5511999998888';
    mockState.cfg.adminFones = [adminNum];
    mockState.caixas = [
      {
        id: 'cx-os-test',
        status: 'aberto',
        aberto: true,
        abertoPor: adminNum,
        saldoInicial: 500,
        saldoAtual: 500,
        totalEntradas: 0,
        totalSaidas: 0,
        movimentacoesIds: []
      }
    ];

    // Lança entrada 1: R$ 400 sinal Pix OS 777
    financialAnalystService.registrarMovimentacao(mockState, {
      tipo: 'entrada',
      valor: 400,
      forma: 'pix',
      osId: '777',
      placa: 'XYZ9K88',
      descricao: 'Sinal 50% OS 777'
    });

    // Lança entrada 2: R$ 400 quitação Cartão Débito OS 777
    const movQuitacao = financialAnalystService.registrarMovimentacao(mockState, {
      tipo: 'entrada',
      valor: 400,
      forma: 'cartao_debito',
      osId: '777',
      placa: 'XYZ9K88',
      descricao: 'Quitação OS 777'
    });

    // 23.1 Consulta por administrador: extrato os 777
    const repliesAdmin = [];
    await processarMensagemTexto({
      from: `${adminNum}@c.us`,
      author: `${adminNum}@c.us`,
      body: 'extrato os 777',
      reply: async (txt) => { repliesAdmin.push(txt); }
    }, { tenantKey: 'default', tenantState: mockState, fromNumber: adminNum });

    assert.equal(repliesAdmin.length, 1);
    assert.match(repliesAdmin[0], /POSIÇÃO FINANCEIRA - OS #777/i);
    assert.match(repliesAdmin[0], /XYZ9K88/);
    assert.match(repliesAdmin[0], /800,00/); // Total recebido
    assert.match(repliesAdmin[0], /PIX/);
    assert.match(repliesAdmin[0], /CARTAO_DEBITO/);

    // 23.2 Bloqueio de permissão para mecânico
    const mecNum = '5511988887777';
    mockState.mecanicos = [{ fone: mecNum, nome: 'Mecânico Zé' }];
    const repliesMec = [];
    await processarMensagemTexto({
      from: `${mecNum}@c.us`,
      author: `${mecNum}@c.us`,
      body: 'extrato os 777',
      reply: async (txt) => { repliesMec.push(txt); }
    }, { tenantKey: 'default', tenantState: mockState, fromNumber: mecNum, isContextAdmin: false });

    assert.equal(repliesMec.length, 1);
    assert.match(repliesMec[0], /Acesso Restrito|Olá! Sou o assistente do Pátio CRM/i);

    // 23.3 Consulta de OS inexistente sem movimentações
    const repliesInexistente = [];
    await processarMensagemTexto({
      from: `${adminNum}@c.us`,
      author: `${adminNum}@c.us`,
      body: 'extrato os 99999',
      reply: async (txt) => { repliesInexistente.push(txt); }
    }, { tenantKey: 'default', tenantState: mockState, fromNumber: adminNum });

    assert.equal(repliesInexistente.length, 1);
    assert.match(repliesInexistente[0], /Nenhuma movimentação financeira vinculada à OS #99999/i);

    // 23.4 Estorno e re-consulta: reflete abatimento imediato
    financialAnalystService.estornarMovimentacao(mockState, {
      movimentoId: movQuitacao.movimento.id,
      motivo: 'Estorno de quitação para teste'
    });

    const repliesAposEstorno = [];
    await processarMensagemTexto({
      from: `${adminNum}@c.us`,
      author: `${adminNum}@c.us`,
      body: 'extrato os 777',
      reply: async (txt) => { repliesAposEstorno.push(txt); }
    }, { tenantKey: 'default', tenantState: mockState, fromNumber: adminNum });

    assert.equal(repliesAposEstorno.length, 1);
    assert.match(repliesAposEstorno[0], /400,00/); // Total após abatimento
  });

  await t.test('24. Operações de sangria e suprimento via WhatsApp com confirmação em 2 etapas, saldo e RBAC', async () => {
    const mockState = criarEstadoMock();
    const adminNum = '5511999998888';
    mockState.cfg.adminFones = [adminNum];
    mockState.caixas = [
      {
        id: 'cx-tes-wpp',
        status: 'aberto',
        aberto: true,
        abertoPor: adminNum,
        saldoInicial: 600,
        saldoAtual: 600,
        totalEntradas: 0,
        totalSaidas: 0,
        movimentacoesIds: []
      }
    ];

    // 24.1 Comando suprimento 200 reforço de troco
    const repliesSup1 = [];
    await processarMensagemTexto({
      from: `${adminNum}@c.us`,
      author: `${adminNum}@c.us`,
      body: 'suprimento 200 reforço de troco',
      reply: async (txt) => { repliesSup1.push(txt); }
    }, { tenantKey: 'default', tenantState: mockState, fromNumber: adminNum });

    assert.equal(repliesSup1.length, 1);
    assert.match(repliesSup1[0], /CONFIRMAÇÃO DE SUPRIMENTO DE CAIXA/i);
    assert.match(repliesSup1[0], /200,00/);
    assert.match(repliesSup1[0], /800,00/); // Saldo previsto

    // Confirmação do suprimento
    const repliesSupConf = [];
    await processarMensagemTexto({
      from: `${adminNum}@c.us`,
      author: `${adminNum}@c.us`,
      body: 'CONFIRMAR',
      reply: async (txt) => { repliesSupConf.push(txt); }
    }, { tenantKey: 'default', tenantState: mockState, fromNumber: adminNum });

    assert.equal(repliesSupConf.length, 1);
    assert.match(repliesSupConf[0], /Suprimento de Caixa Realizado com Sucesso/i);
    assert.equal(mockState.caixas[0].saldoAtual, 800);
    assert.equal(mockState.movimentos[0].naturezaOperacao, 'suprimento');

    // 24.2 Comando sangria 350 recolhimento cofre
    const repliesSang1 = [];
    await processarMensagemTexto({
      from: `${adminNum}@c.us`,
      author: `${adminNum}@c.us`,
      body: 'sangria 350 recolhimento cofre',
      reply: async (txt) => { repliesSang1.push(txt); }
    }, { tenantKey: 'default', tenantState: mockState, fromNumber: adminNum });

    assert.equal(repliesSang1.length, 1);
    assert.match(repliesSang1[0], /CONFIRMAÇÃO DE SANGRIA DE CAIXA/i);
    assert.match(repliesSang1[0], /350,00/);
    assert.match(repliesSang1[0], /450,00/); // Saldo previsto (800 - 350)

    // Confirmação da sangria via SIM
    const repliesSangConf = [];
    await processarMensagemTexto({
      from: `${adminNum}@c.us`,
      author: `${adminNum}@c.us`,
      body: 'SIM',
      reply: async (txt) => { repliesSangConf.push(txt); }
    }, { tenantKey: 'default', tenantState: mockState, fromNumber: adminNum });

    assert.equal(repliesSangConf.length, 1);
    assert.match(repliesSangConf[0], /Sangria de Caixa Realizada com Sucesso/i);
    assert.equal(mockState.caixas[0].saldoAtual, 450);
    assert.equal(mockState.movimentos[0].naturezaOperacao, 'sangria');

    // 24.3 Tentativa de sangria excedendo saldo disponível (500 > 450)
    const repliesInsuf = [];
    await processarMensagemTexto({
      from: `${adminNum}@c.us`,
      author: `${adminNum}@c.us`,
      body: 'sangria 500 cofre',
      reply: async (txt) => { repliesInsuf.push(txt); }
    }, { tenantKey: 'default', tenantState: mockState, fromNumber: adminNum });

    assert.equal(repliesInsuf.length, 1);
    assert.match(repliesInsuf[0], /Saldo Insuficiente/i);
    assert.equal(mockState.caixas[0].saldoAtual, 450);

    // 24.4 Bloqueio de RBAC para mecânico tentando sangria
    const mecNum = '5511955554444';
    const repliesMecSang = [];
    await processarMensagemTexto({
      from: `${mecNum}@c.us`,
      author: `${mecNum}@c.us`,
      body: 'sangria 100 cofre',
      reply: async (txt) => { repliesMecSang.push(txt); }
    }, { tenantKey: 'default', tenantState: mockState, fromNumber: mecNum, isContextAdmin: false });

    assert.equal(repliesMecSang.length, 1);
    assert.match(repliesMecSang[0], /Acesso Negado|Olá! Sou o assistente/i);
  });

  // ── 25. CONSULTA DE VENCIMENTOS E TÍTULOS DO DIA COM IDS E DICA DE BAIXA ──
  await t.test('25. Consulta de títulos e vencimentos do dia no WhatsApp com IDs e instrução de baixa', async () => {
    const mockState = criarEstadoMock();
    const adminNum = '5511999998888';
    mockState.cfg.adminFones = [adminNum];

    const hoje = financialEngine.obterAgoraSP().dataISO;
    mockState.contas = [
      { id: 'tit_rec_venc1', tipo: 'receber', valor: 250, desc: 'Revisão Básica', parte: 'Frota A', venc: hoje, pago: false },
      { id: 'tit_pag_venc2', tipo: 'pagar', valor: 180, desc: 'Óleo e Filtros', parte: 'Distribuidora X', venc: hoje, pago: false }
    ];

    const repliesVenc = [];
    await processarMensagemTexto({
      from: `${adminNum}@c.us`,
      author: `${adminNum}@c.us`,
      body: 'vencimentos',
      reply: async (txt) => { repliesVenc.push(txt); }
    }, { tenantKey: 'default', tenantState: mockState, fromNumber: adminNum });

    assert.equal(repliesVenc.length, 1);
    const msgVenc = repliesVenc[0];
    assert.match(msgVenc, /TÍTULOS E VENCIMENTOS DE HOJE/i);
    assert.match(msgVenc, /tit_rec_venc1/);
    assert.match(msgVenc, /tit_pag_venc2/);
    assert.match(msgVenc, /250,00/);
    assert.match(msgVenc, /180,00/);
    assert.match(msgVenc, /Para liquidar pelo WhatsApp/i);
  });

  // ── 26. BAIXA INTEGRADA DE TÍTULOS VIA WHATSAPP COM CONFIRMAÇÃO EM 2 ETAPAS E RBAC ──
  await t.test('26. Fluxo completo de baixa de títulos a receber e pagar via WhatsApp com auditoria e limites', async () => {
    const mockState = criarEstadoMock();
    const adminNum = '5511999998888';
    mockState.cfg.adminFones = [adminNum];
    mockState.cfg.comandosFinanceirosEscrita = true;
    mockState.cfg.limiteValorLancamentoWhatsapp = 1000.00;

    mockState.caixas = [
      {
        id: 'cx-wpp-liq-1',
        status: 'aberto',
        aberto: true,
        saldoInicial: 400,
        saldoAtual: 400,
        totalEntradas: 0,
        totalSaidas: 0,
        movimentacoesIds: []
      }
    ];

    mockState.contas = [
      { id: 'tit_wpp_rec_1', tipo: 'receber', valor: 300, desc: 'Manutenção Preventiva', parte: 'Transportes Sol', pago: false, status: 'aberto' },
      { id: 'tit_wpp_pag_1', tipo: 'pagar', valor: 150, desc: 'Ferramental Oficina', parte: 'Casa do Mecânico', pago: false, status: 'aberto' },
      { id: 'tit_wpp_alto', tipo: 'receber', valor: 1500, desc: 'Motor Completo', parte: 'Transportes Sol', pago: false, status: 'aberto' }
    ];

    // 26.1 Mecânico tenta executar comando de baixa -> Bloqueado
    const mecNum = '5511955554444';
    const repliesMec = [];
    await processarMensagemTexto({
      from: `${mecNum}@c.us`,
      author: `${mecNum}@c.us`,
      body: 'baixar tit_wpp_rec_1 pix',
      reply: async (txt) => { repliesMec.push(txt); }
    }, { tenantKey: 'default', tenantState: mockState, fromNumber: mecNum, isContextAdmin: false });

    assert.equal(repliesMec.length, 1);
    assert.match(repliesMec[0], /Acesso Negado|Olá! Sou o assistente/i);

    // 26.2 Dono executa comando de baixa de título a receber -> Confirmação 2 etapas
    const repliesBaixa1 = [];
    await processarMensagemTexto({
      from: `${adminNum}@c.us`,
      author: `${adminNum}@c.us`,
      body: 'baixar tit_wpp_rec_1 pix',
      reply: async (txt) => { repliesBaixa1.push(txt); }
    }, { tenantKey: 'default', tenantState: mockState, fromNumber: adminNum });

    assert.equal(repliesBaixa1.length, 1);
    assert.match(repliesBaixa1[0], /CONFIRMAÇÃO DE LIQUIDAÇÃO FINANCEIRA/i);
    assert.match(repliesBaixa1[0], /tit_wpp_rec_1/);
    assert.match(repliesBaixa1[0], /300,00/);
    assert.match(repliesBaixa1[0], /PIX/);
    assert.match(repliesBaixa1[0], /entrada no caixa/i);

    // 26.3 Dono confirma a baixa com CONFIRMAR
    const repliesConf1 = [];
    await processarMensagemTexto({
      from: `${adminNum}@c.us`,
      author: `${adminNum}@c.us`,
      body: 'CONFIRMAR',
      reply: async (txt) => { repliesConf1.push(txt); }
    }, { tenantKey: 'default', tenantState: mockState, fromNumber: adminNum });

    assert.equal(repliesConf1.length, 1);
    assert.match(repliesConf1[0], /Título Liquidado com Sucesso/i);
    assert.match(repliesConf1[0], /700,00/); // Saldo atual 400 + 300
    assert.equal(mockState.caixas[0].saldoAtual, 700);
    assert.equal(mockState.contas[0].pago, true);
    assert.equal(mockState.contas[0].status, 'liquidado');

    // 26.4 Dono executa baixa de conta a pagar
    const repliesBaixaPag = [];
    await processarMensagemTexto({
      from: `${adminNum}@c.us`,
      author: `${adminNum}@c.us`,
      body: 'pagar conta tit_wpp_pag_1 dinheiro',
      reply: async (txt) => { repliesBaixaPag.push(txt); }
    }, { tenantKey: 'default', tenantState: mockState, fromNumber: adminNum });

    assert.equal(repliesBaixaPag.length, 1);
    assert.match(repliesBaixaPag[0], /CONFIRMAÇÃO DE LIQUIDAÇÃO FINANCEIRA/i);
    assert.match(repliesBaixaPag[0], /saída do caixa/i);

    // Confirma com SIM
    const repliesConfPag = [];
    await processarMensagemTexto({
      from: `${adminNum}@c.us`,
      author: `${adminNum}@c.us`,
      body: 'SIM',
      reply: async (txt) => { repliesConfPag.push(txt); }
    }, { tenantKey: 'default', tenantState: mockState, fromNumber: adminNum });

    assert.equal(repliesConfPag.length, 1);
    assert.match(repliesConfPag[0], /Título Liquidado com Sucesso/i);
    assert.equal(mockState.caixas[0].saldoAtual, 550); // 700 - 150
    assert.equal(mockState.contas[1].pago, true);

    // 26.5 Tentativa de baixar título já liquidado
    const repliesJaLiq = [];
    await processarMensagemTexto({
      from: `${adminNum}@c.us`,
      author: `${adminNum}@c.us`,
      body: 'baixar tit_wpp_rec_1 pix',
      reply: async (txt) => { repliesJaLiq.push(txt); }
    }, { tenantKey: 'default', tenantState: mockState, fromNumber: adminNum });

    assert.equal(repliesJaLiq.length, 1);
    assert.match(repliesJaLiq[0], /já foi liquidado anteriormente/i);

    // 26.6 Tentativa de baixar título com valor acima do limite (1500 > 1000)
    const repliesLimite = [];
    await processarMensagemTexto({
      from: `${adminNum}@c.us`,
      author: `${adminNum}@c.us`,
      body: 'baixar tit_wpp_alto pix',
      reply: async (txt) => { repliesLimite.push(txt); }
    }, { tenantKey: 'default', tenantState: mockState, fromNumber: adminNum });

    assert.equal(repliesLimite.length, 1);
    assert.match(repliesLimite[0], /Limite Excedido/i);
    assert.match(repliesLimite[0], /1\.000,00/);

    // 26.7 Verifica auditoria de liquidação via WhatsApp no SQLite
    const auditRows = await all(`
      SELECT action, entity_id FROM security_audit_log
      WHERE action = 'financeiro:titulo:liquidar'
      ORDER BY id ASC
    `);
    assert.ok(auditRows.length >= 2, 'Deve registrar auditorias no security_audit_log');
  });

  await t.test('27. Comando liberar os <id> <justificativa> via WhatsApp com RBAC e confirmação em 2 etapas (Frente 5A)', async () => {
    const mockState = criarEstadoMock();
    const adminNum = '5511999998888';
    const mecNum = '5511988887777';
    mockState.cfg.adminFones = [adminNum];
    mockState.cfg.comandosFinanceirosEscrita = true;
    mockState.mecanicos = [
      { id: 'usr_mec', nome: 'Mecânico Zé', telefone: mecNum }
    ];
    mockState.os = [
      { id: '901', numero: '901', total: 2500, cliente: 'Transporte Rodoviário Silva' }
    ];

    // 27.1 Mecânico tenta executar comando de liberação -> Acesso Negado
    const repliesMec = [];
    await processarMensagemTexto({
      from: `${mecNum}@c.us`,
      author: `${mecNum}@c.us`,
      body: 'liberar os 901 Acordo verbal com cliente',
      reply: async (txt) => { repliesMec.push(txt); }
    }, { tenantKey: 'default', tenantState: mockState, fromNumber: mecNum, isSenderAdmin: false });

    assert.equal(repliesMec.length, 1);
    assert.match(repliesMec[0], /Acesso Negado/i);
    assert.match(repliesMec[0], /Dono\/Administrador/i);

    // 27.2 Dono tenta sem justificativa válida (< 5 chars)
    const repliesDonoCurto = [];
    await processarMensagemTexto({
      from: `${adminNum}@c.us`,
      author: `${adminNum}@c.us`,
      body: 'liberar os 901 ok',
      reply: async (txt) => { repliesDonoCurto.push(txt); }
    }, { tenantKey: 'default', tenantState: mockState, fromNumber: adminNum, isSenderAdmin: true });

    assert.equal(repliesDonoCurto.length, 1);
    assert.match(repliesDonoCurto[0], /pelo menos 5 caracteres/i);

    // 27.3 Dono envia comando com justificativa válida -> Pedido de confirmação
    const repliesDonoValido = [];
    await processarMensagemTexto({
      from: `${adminNum}@c.us`,
      author: `${adminNum}@c.us`,
      body: 'liberar os 901 Cliente frotista VIP liberado com duplicata emitida',
      reply: async (txt) => { repliesDonoValido.push(txt); }
    }, { tenantKey: 'default', tenantState: mockState, fromNumber: adminNum, isSenderAdmin: true });

    assert.equal(repliesDonoValido.length, 1);
    assert.match(repliesDonoValido[0], /CONFIRMAÇÃO DE LIBERAÇÃO EXCEPCIONAL DE PÁTIO/i);
    assert.match(repliesDonoValido[0], /901/);
    assert.match(repliesDonoValido[0], /2\.500,00/);
    assert.match(repliesDonoValido[0], /duplicata emitida/i);

    // 27.4 Dono confirma com CONFIRMAR -> Sucesso e persistência
    const repliesConf = [];
    await processarMensagemTexto({
      from: `${adminNum}@c.us`,
      author: `${adminNum}@c.us`,
      body: 'CONFIRMAR',
      reply: async (txt) => { repliesConf.push(txt); }
    }, { tenantKey: 'default', tenantState: mockState, fromNumber: adminNum, isSenderAdmin: true });

    assert.equal(repliesConf.length, 1);
    assert.match(repliesConf[0], /Liberação Excepcional de Pátio Concedida/i);
    assert.match(repliesConf[0], /901/);

    // Verifica que a OS no state agora possui a liberação excepcional
    const osGravada = mockState.os.find(o => o.id === '901');
    assert.ok(osGravada.liberacaoExcepcional);
    assert.equal(osGravada.liberacaoExcepcional.saldoPendenteNaSaida, 2500);
    assert.match(osGravada.liberacaoExcepcional.justificativa, /duplicata emitida/);

    // 27.5 Tentativa de liberar novamente a mesma OS já liberada -> Informa que já está liberada
    const repliesJaLib = [];
    await processarMensagemTexto({
      from: `${adminNum}@c.us`,
      author: `${adminNum}@c.us`,
      body: 'liberar os 901 Nova tentativa',
      reply: async (txt) => { repliesJaLib.push(txt); }
    }, { tenantKey: 'default', tenantState: mockState, fromNumber: adminNum, isSenderAdmin: true });

    assert.equal(repliesJaLib.length, 1);
    assert.match(repliesJaLib[0], /já se encontra liberada/i);

    // 27.6 Verifica auditoria de segurança no SQLite
    const auditRows = await all(`
      SELECT action, entity_id FROM security_audit_log
      WHERE action IN ('financeiro:os:liberar_saida_negada', 'financeiro:os:liberar_saida_excepcional')
      ORDER BY id ASC
    `);
    assert.ok(auditRows.length >= 2, 'Deve conter auditorias de tentativa negada e concessao excepcional');
  });

  await t.test('28. Reabertura bidirecional de títulos via estorno no WhatsApp e comando DRE (Frente 5B)', async () => {
    const mockState = criarEstadoMock();
    const adminNum = '5511999998888';
    mockState.cfg.adminFones = [adminNum];
    mockState.cfg.comandosFinanceirosEscrita = true;
    mockState.caixas = [
      {
        id: 'cx-dre-wpp',
        status: 'aberto',
        aberto: true,
        saldoInicial: 1000,
        saldoAtual: 1000,
        totalEntradas: 0,
        totalSaidas: 0,
        movimentacoesIds: []
      }
    ];
    mockState.contas = [
      {
        id: 'tit_wpp_dre_1',
        tipo: 'receber',
        osId: '990',
        valor: 450,
        desc: 'Serviço Suspensão OS #990',
        pago: false,
        status: 'aberto'
      }
    ];
    mockState.os = [
      { id: '990', numero: '990', total: 450, cliente: 'Transportes Brasil' }
    ];

    // 28.1 Baixa do título via WhatsApp
    const repliesBaixa = [];
    await processarMensagemTexto({
      from: `${adminNum}@c.us`,
      author: `${adminNum}@c.us`,
      body: 'baixar tit_wpp_dre_1 pix',
      reply: async (txt) => { repliesBaixa.push(txt); }
    }, { tenantKey: 'default', tenantState: mockState, fromNumber: adminNum });

    assert.equal(repliesBaixa.length, 1);
    assert.match(repliesBaixa[0], /CONFIRMAÇÃO DE LIQUIDAÇÃO FINANCEIRA/i);

    // Confirmação
    const repliesConf = [];
    await processarMensagemTexto({
      from: `${adminNum}@c.us`,
      author: `${adminNum}@c.us`,
      body: 'CONFIRMAR',
      reply: async (txt) => { repliesConf.push(txt); }
    }, { tenantKey: 'default', tenantState: mockState, fromNumber: adminNum });

    assert.equal(repliesConf.length, 1);
    assert.match(repliesConf[0], /Título Liquidado com Sucesso/i);
    assert.equal(mockState.contas[0].pago, true);

    // 28.2 Dono executa estorno do último lançamento pelo WhatsApp
    const repliesEstorno = [];
    await processarMensagemTexto({
      from: `${adminNum}@c.us`,
      author: `${adminNum}@c.us`,
      body: 'estornar ultimo cancelamento solicitado pelo cliente',
      reply: async (txt) => { repliesEstorno.push(txt); }
    }, { tenantKey: 'default', tenantState: mockState, fromNumber: adminNum });

    assert.equal(repliesEstorno.length, 1);
    assert.match(repliesEstorno[0], /CONFIRMAÇÃO DE ESTORNO CONTÁBIL/i);

    // Confirma o estorno com SIM
    const repliesConfEst = [];
    await processarMensagemTexto({
      from: `${adminNum}@c.us`,
      author: `${adminNum}@c.us`,
      body: 'SIM',
      reply: async (txt) => { repliesConfEst.push(txt); }
    }, { tenantKey: 'default', tenantState: mockState, fromNumber: adminNum });

    assert.equal(repliesConfEst.length, 1);
    assert.match(repliesConfEst[0], /Estorno Realizado com Sucesso/i);

    // Título deve estar reaberto
    assert.equal(mockState.contas[0].pago, false, 'Título deve ser reaberto pelo estorno');
    assert.ok(mockState.contas[0].status === 'pendente' || mockState.contas[0].status === 'aberto');
    assert.ok(mockState.contas[0].reabertoPorEstornoEm);

    // 28.3 Consulta de DRE Operacional Simplificado via WhatsApp
    // Injeta movimentações operacionais puras e movimentações de tesouraria
    const agoraSP = financialEngine.obterAgoraSP();
    const dHoje = agoraSP.dataISO;
    mockState.movimentos = [
      { id: 'm_op_rec', tipo: 'entrada', subtipo: 'receita', valor: 4000, data: dHoje },
      { id: 'm_op_desp', tipo: 'saida', subtipo: 'despesa', valor: 1500, data: dHoje },
      { id: 'm_tes_sup', tipo: 'entrada', subtipo: 'suprimento', naturezaOperacao: 'suprimento', valor: 800, data: dHoje },
      { id: 'm_tes_sang', tipo: 'saida', subtipo: 'sangria', naturezaOperacao: 'sangria', valor: 600, data: dHoje }
    ];

    const repliesDRE = [];
    await processarMensagemTexto({
      from: `${adminNum}@c.us`,
      author: `${adminNum}@c.us`,
      body: 'dre',
      reply: async (txt) => { repliesDRE.push(txt); }
    }, { tenantKey: 'default', tenantState: mockState, fromNumber: adminNum });

    assert.equal(repliesDRE.length, 1);
    assert.match(repliesDRE[0], /DEMONSTRATIVO DE RESULTADO OPERACIONAL \(DRE\)/i);
    assert.match(repliesDRE[0], /4\.000,00/); // Receita operacional
    assert.match(repliesDRE[0], /1\.500,00/); // Despesa operacional
    assert.match(repliesDRE[0], /2\.500,00/); // Lucro operacional líquido 4000 - 1500
    assert.match(repliesDRE[0], /62,5%/);     // Margem operacional 2500/4000
    assert.match(repliesDRE[0], /LUCRO OPERACIONAL/i);
    assert.match(repliesDRE[0], /Tesouraria \(Neutra\)/i);
    assert.match(repliesDRE[0], /800,00/); // Suprimento
    assert.match(repliesDRE[0], /600,00/); // Sangria
  });

  await t.test('29. Comando de cobrança amigável de OS via WhatsApp com dados do cliente e chave Pix (Frente 5C)', async () => {
    const mockState = criarEstadoMock();
    const adminNum = '5511999998888';
    mockState.cfg.adminFones = [adminNum];
    mockState.cfg.nomeOficina = 'Oficina Pátio Diesel';
    mockState.cfg.chavePix = 'financeiro@patiodiesel.com.br';
    mockState.clientes = [
      { id: 'cli_zap_5c', nome: 'Transportes Rápido Ltda', fantasia: 'Expresso Rápido' }
    ];
    mockState.veiculos = [
      { id: 'vei_zap_5c', placa: 'XYZ9K88', modelo: 'Scania R450', marca: 'Scania' }
    ];
    mockState.os = [
      {
        id: '881',
        numero: '881',
        num: '881',
        cli: 'cli_zap_5c',
        vei: 'vei_zap_5c',
        total: 5000,
        statusLiberacaoPatio: 'retido_pendente'
      },
      {
        id: '882',
        numero: '882',
        num: '882',
        cli: 'cli_zap_5c',
        vei: 'vei_zap_5c',
        total: 1200,
        statusLiberacaoPatio: 'liberado_quitado'
      }
    ];
    mockState.movimentos = [
      { id: 'mov_pago_881', tipo: 'entrada', valor: 2000, osId: '881', estornado: false },
      { id: 'mov_pago_882', tipo: 'entrada', valor: 1200, osId: '882', estornado: false }
    ];

    // 29.1 Comando de cobrança para OS com saldo devedor
    const repliesCob1 = [];
    await processarMensagemTexto({
      from: `${adminNum}@c.us`,
      author: `${adminNum}@c.us`,
      body: 'cobranca os 881',
      reply: async (txt) => { repliesCob1.push(txt); }
    }, { tenantKey: 'default', tenantState: mockState, fromNumber: adminNum });

    assert.equal(repliesCob1.length, 1);
    assert.match(repliesCob1[0], /Expresso Rápido/);
    assert.match(repliesCob1[0], /Oficina Pátio Diesel/);
    assert.match(repliesCob1[0], /OS \*#881\*/);
    assert.match(repliesCob1[0], /Scania R450/);
    assert.match(repliesCob1[0], /5\.000,00/);
    assert.match(repliesCob1[0], /3\.000,00/); // Saldo pendente: 5000 - 2000
    assert.match(repliesCob1[0], /financeiro@patiodiesel\.com\.br/);

    // 29.2 Comando de cobrança para OS já quitada
    const repliesCob2 = [];
    await processarMensagemTexto({
      from: `${adminNum}@c.us`,
      author: `${adminNum}@c.us`,
      body: 'aviso vencimento 882',
      reply: async (txt) => { repliesCob2.push(txt); }
    }, { tenantKey: 'default', tenantState: mockState, fromNumber: adminNum });

    assert.equal(repliesCob2.length, 1);
    assert.match(repliesCob2[0], /regularizada|já está quitada/i);

    // 29.3 Comando para OS inexistente
    const repliesCobInexistente = [];
    await processarMensagemTexto({
      from: `${adminNum}@c.us`,
      author: `${adminNum}@c.us`,
      body: 'cobranca os 99999',
      reply: async (txt) => { repliesCobInexistente.push(txt); }
    }, { tenantKey: 'default', tenantState: mockState, fromNumber: adminNum });

    assert.equal(repliesCobInexistente.length, 1);
    assert.match(repliesCobInexistente[0], /Não foi possível localizar|quitada/i);
  });

  // ── 30. APONTAMENTO DE MECÂNICOS, BOXES E RADAR DE GARGALOS VIA WHATSAPP (FRENTE 5B) ──
  await t.test('30. Comandos de Pátio para Mecânico: alocação, trava de colisão, apontamentos e radar de gargalos', async () => {
    const mockState = criarEstadoMock({
      comandosFinanceirosEscrita: true
    });
    mockState.boxes = [
      { id: 'BOX-01', nome: 'Box 01' },
      { id: 'BOX-02', nome: 'Box 02' }
    ];
    mockState.veiculos = [
      { id: 'v101', placa: 'AAA1111', marca: 'Scania', modelo: 'R450' },
      { id: 'v102', placa: 'BBB2222', marca: 'Volvo', modelo: 'FH460' }
    ];
    mockState.clientes = [
      { id: 'c101', nome: 'Transportes ABC' }
    ];
    mockState.os = [
      { id: 'os-101', num: 101, vei: 'v101', cli: 'c101', st: 'fila', total: 4000 },
      { id: 'os-102', num: 102, vei: 'v102', cli: 'c101', st: 'fila', total: 2500 }
    ];

    const mecanicoFone = '5511955554444'; // cadastrado como mecanico em criarEstadoMock

    // 30.1 Mecânico aloca OS 101 no Box 01
    const repliesAloc = [];
    await processarMensagemTexto({
      from: `${mecanicoFone}@c.us`,
      author: `${mecanicoFone}@c.us`,
      body: 'box 1 os 101 Joao',
      reply: async (txt) => { repliesAloc.push(txt); }
    }, { tenantKey: 'default', tenantState: mockState, fromNumber: mecanicoFone });

    assert.equal(repliesAloc.length, 1);
    assert.match(repliesAloc[0], /Alocação de Box Confirmada/i);
    assert.match(repliesAloc[0], /#101/);
    const os101 = mockState.os.find(o => o.num === 101);
    assert.equal(os101.boxId, 'BOX-01');

    // 30.2 Trava de Colisão: Outra alocação no mesmo Box 01 ocupado
    const repliesColisao = [];
    await processarMensagemTexto({
      from: `${mecanicoFone}@c.us`,
      author: `${mecanicoFone}@c.us`,
      body: 'box 1 os 102 Marcos',
      reply: async (txt) => { repliesColisao.push(txt); }
    }, { tenantKey: 'default', tenantState: mockState, fromNumber: mecanicoFone });

    assert.equal(repliesColisao.length, 1);
    assert.match(repliesColisao[0], /Box Ocupado/i);

    // 30.3 Apontamento: Iniciar OS 101
    const repliesIniciar = [];
    await processarMensagemTexto({
      from: `${mecanicoFone}@c.us`,
      author: `${mecanicoFone}@c.us`,
      body: 'iniciar os 101',
      reply: async (txt) => { repliesIniciar.push(txt); }
    }, { tenantKey: 'default', tenantState: mockState, fromNumber: mecanicoFone });

    assert.equal(repliesIniciar.length, 1);
    assert.match(repliesIniciar[0], /Execução Iniciada/i);
    assert.equal(os101.etapaPatio, 'em_execucao');
    assert.equal(os101.st, 'executando');

    // 30.4 Apontamento: Pausar OS 101 por falta de feixe de mola (Gargalo)
    const repliesPausar = [];
    await processarMensagemTexto({
      from: `${mecanicoFone}@c.us`,
      author: `${mecanicoFone}@c.us`,
      body: 'pausar os 101 aguardando feixe de mola',
      reply: async (txt) => { repliesPausar.push(txt); }
    }, { tenantKey: 'default', tenantState: mockState, fromNumber: mecanicoFone });

    assert.equal(repliesPausar.length, 1);
    assert.match(repliesPausar[0], /OS Pausada \(Gargalo Registrado\)/i);
    assert.match(repliesPausar[0], /aguardando feixe de mola/i);
    assert.equal(os101.etapaPatio, 'pausado_gargalo');
    assert.equal(os101.st, 'peca');
    const box1 = mockState.boxes.find(b => b.id === 'BOX-01');
    assert.equal(box1.status, 'bloqueado_peca');

    // 30.5 Consulta: Radar de Gargalos Operacionais
    const repliesRadar = [];
    await processarMensagemTexto({
      from: `${mecanicoFone}@c.us`,
      author: `${mecanicoFone}@c.us`,
      body: 'gargalos',
      reply: async (txt) => { repliesRadar.push(txt); }
    }, { tenantKey: 'default', tenantState: mockState, fromNumber: mecanicoFone });

    assert.equal(repliesRadar.length, 1);
    assert.match(repliesRadar[0], /RADAR OPERACIONAL DE GARGALOS & PÁTIO/i);
    assert.match(repliesRadar[0], /OS #101/);
    assert.match(repliesRadar[0], /aguardando feixe de mola/);

    // 30.6 Apontamento: Finalizar OS 101 (libera box)
    const repliesFinalizar = [];
    await processarMensagemTexto({
      from: `${mecanicoFone}@c.us`,
      author: `${mecanicoFone}@c.us`,
      body: 'finalizar os 101',
      reply: async (txt) => { repliesFinalizar.push(txt); }
    }, { tenantKey: 'default', tenantState: mockState, fromNumber: mecanicoFone });

    assert.equal(repliesFinalizar.length, 1);
    assert.match(repliesFinalizar[0], /OS Concluída no Pátio/i);
    assert.equal(os101.etapaPatio, 'pronto_retirada');
    assert.equal(os101.st, 'finalizada');
    assert.equal(os101.boxId, null);
    assert.equal(box1.status, 'livre');

    // 30.7 RBAC: Visitante / desconhecido recebe acesso negado
    const repliesInvasor = [];
    await processarMensagemTexto({
      from: '5511999990000@c.us',
      author: '5511999990000@c.us',
      body: 'box 1 os 102',
      reply: async (txt) => { repliesInvasor.push(txt); }
    }, { tenantKey: 'default', tenantState: mockState, fromNumber: '5511999990000' });

    assert.equal(repliesInvasor.length, 1);
    assert.match(repliesInvasor[0], /Acesso Negado/i);
  });

  await t.test('31. Comandos de Estoque, Requisição de Peças na OS e Desbloqueio de Gargalo via WhatsApp (Frente 6B)', async () => {
    const mockState = criarEstadoMock();
    const mecanicoFone = '5511977776666';
    mockState.equipe = [
      { id: 'eq_1', nome: 'João Mecânico', telefone: mecanicoFone, role: 'mecanico' }
    ];
    mockState.estoque = [
      { id: 'pec_1', codigo: 'MOL-01', nome: 'Feixe de Mola Dianteiro', quantidade: 5, estoqueMinimo: 2, custoUnitario: 350, precoVenda: 580 },
      { id: 'pec_2', codigo: 'LON-02', nome: 'Jogo Lona Freio', quantidade: 1, estoqueMinimo: 3, custoUnitario: 140, precoVenda: 260 }
    ];
    mockState.boxes = [
      { id: 'BOX-01', nome: 'Box 01 — Mecânica', status: 'bloqueado_peca', osId: '101' }
    ];
    mockState.os = [
      {
        id: '101',
        num: 101,
        boxId: 'BOX-01',
        box: 'BOX-01',
        st: 'peca',
        etapaPatio: 'pausado_gargalo',
        motivoPausa: 'Aguardando feixe de mola',
        pecasUtilizadas: [],
        historicoPatio: []
      }
    ];

    // 31.1 Consulta de estoque via WhatsApp (alerta de estoque crítico)
    const repliesEstoque = [];
    await processarMensagemTexto({
      from: `${mecanicoFone}@c.us`,
      author: `${mecanicoFone}@c.us`,
      body: 'estoque',
      reply: async (txt) => { repliesEstoque.push(txt); }
    }, { tenantKey: 'default', tenantState: mockState, fromNumber: mecanicoFone });

    assert.equal(repliesEstoque.length, 1);
    assert.match(repliesEstoque[0], /Catálogo de Estoque & Peças/i);
    assert.match(repliesEstoque[0], /MOL-01/);
    assert.match(repliesEstoque[0], /CRÍTICO/); // LON-02 tem 1 un com mínimo 3

    // 31.2 Consulta com filtro por termo
    const repliesFiltro = [];
    await processarMensagemTexto({
      from: `${mecanicoFone}@c.us`,
      author: `${mecanicoFone}@c.us`,
      body: 'consultar peca mola',
      reply: async (txt) => { repliesFiltro.push(txt); }
    }, { tenantKey: 'default', tenantState: mockState, fromNumber: mecanicoFone });

    assert.equal(repliesFiltro.length, 1);
    assert.match(repliesFiltro[0], /Feixe de Mola Dianteiro/i);
    assert.doesNotMatch(repliesFiltro[0], /LON-02/);

    // 31.3 Requisição de peça na OS por mecânico
    const repliesReq = [];
    await processarMensagemTexto({
      from: `${mecanicoFone}@c.us`,
      author: `${mecanicoFone}@c.us`,
      body: 'peca os 101 2 MOL-01',
      reply: async (txt) => { repliesReq.push(txt); }
    }, { tenantKey: 'default', tenantState: mockState, fromNumber: mecanicoFone });

    assert.equal(repliesReq.length, 1);
    assert.match(repliesReq[0], /Peça Requisitada na OS/i);
    assert.match(repliesReq[0], /Feixe de Mola Dianteiro/);
    assert.match(repliesReq[0], /Saldo em Estoque:\* 3 un/);
    assert.equal(mockState.estoque[0].quantidade, 3);
    const os101 = mockState.os.find(o => o.num === 101);
    assert.equal(os101.pecasUtilizadas.length, 1);

    // 31.4 Tentativa de requisitar quantidade acima do estoque disponível
    const repliesEstoqueInsuf = [];
    await processarMensagemTexto({
      from: `${mecanicoFone}@c.us`,
      author: `${mecanicoFone}@c.us`,
      body: 'peca os 101 10 MOL-01',
      reply: async (txt) => { repliesEstoqueInsuf.push(txt); }
    }, { tenantKey: 'default', tenantState: mockState, fromNumber: mecanicoFone });

    assert.equal(repliesEstoqueInsuf.length, 1);
    assert.match(repliesEstoqueInsuf[0], /Estoque Insuficiente/i);

    // 31.5 Desbloqueio e retomada da OS e box via WhatsApp
    const repliesRetomada = [];
    await processarMensagemTexto({
      from: `${mecanicoFone}@c.us`,
      author: `${mecanicoFone}@c.us`,
      body: 'chegou peca os 101 Feixe instalado',
      reply: async (txt) => { repliesRetomada.push(txt); }
    }, { tenantKey: 'default', tenantState: mockState, fromNumber: mecanicoFone });

    assert.equal(repliesRetomada.length, 1);
    assert.match(repliesRetomada[0], /Gargalo Desbloqueado! OS Retomada/i);
    assert.equal(os101.etapaPatio, 'em_execucao');
    assert.equal(os101.motivoPausa, null);
    assert.equal(mockState.boxes[0].status, 'ocupado');

    // 31.6 Auditoria gravada no banco de dados SQLite
    const auditRows = await all(`
      SELECT action, entity_id FROM security_audit_log
      WHERE action IN ('patio:os:requisitar_peca', 'patio:os:liberar_gargalo_peca')
      ORDER BY id ASC
    `);
    assert.ok(auditRows.length >= 2, 'Deve registrar auditorias de requisição e desbloqueio');
  });

  // ── 32. DEMONSTRATIVO DRE OPERACIONAL, AVISO DE RETIRADA E DEVOLUÇÃO DE PEÇA VIA WHATSAPP (FRENTE 7B) ──
  await t.test('32. DRE Operacional, Aviso de Retirada/Cobrança e Devolução de Peça via WhatsApp', async () => {
    const mockState = criarEstadoMock({
      comandosFinanceirosEscrita: true
    });
    const adminNum = '5511999998888';
    const mecanicoFone = '5511977776666';
    mockState.cfg.adminFones = [adminNum];
    mockState.cfg.nomeOficina = 'Truck Center Brasil';
    mockState.cfg.chavePix = 'pix@truckcenter.com.br';

    mockState.clientes = [
      { id: 'cli_zap_7b', nome: 'Transportes Brasil Central', fantasia: 'Brasil Central' }
    ];
    mockState.veiculos = [
      { id: 'vei_zap_7b', placa: 'BRC1A22', marca: 'Mercedes-Benz', modelo: 'Actros 2651' }
    ];

    const agoraSP = financialEngine.obterAgoraSP();
    const dHoje = agoraSP.dataISO;

    mockState.movimentos = [
      { id: 'm_op_rec', tipo: 'entrada', subtipo: 'receita', valor: 8000, data: dHoje },
      { id: 'm_op_desp', tipo: 'saida', subtipo: 'despesa', valor: 3000, data: dHoje },
      { id: 'm_tes_sup', tipo: 'entrada', subtipo: 'suprimento', naturezaOperacao: 'suprimento', valor: 1500, data: dHoje },
      { id: 'm_tes_sang', tipo: 'saida', subtipo: 'sangria', naturezaOperacao: 'sangria', valor: 500, data: dHoje }
    ];

    mockState.estoque = [
      { id: 'pec_valvula', codigo: 'VALV-99', nome: 'Válvula Reguladora de Pressão', quantidade: 5, estoqueMinimo: 2, custoUnitario: 180, precoVenda: 350 }
    ];

    mockState.os = [
      {
        id: '202',
        numero: '202',
        num: 202,
        cli: 'cli_zap_7b',
        vei: 'vei_zap_7b',
        total: 4200,
        statusLiberacaoPatio: 'retido_pendente',
        pecasUtilizadas: [
          { id: 'pec_valvula', codigo: 'VALV-99', nome: 'Válvula Reguladora de Pressão', quantidade: 2, valorUnitario: 350, subtotal: 700 }
        ],
        totalPecas: 700,
        historicoPatio: []
      }
    ];

    // 32.1 Consulta DRE com custo de peças ativas e tesouraria neutra
    const repliesDRE = [];
    await processarMensagemTexto({
      from: `${adminNum}@c.us`,
      author: `${adminNum}@c.us`,
      body: 'resultado operacional',
      reply: async (txt) => { repliesDRE.push(txt); }
    }, { tenantKey: 'default', tenantState: mockState, fromNumber: adminNum });

    assert.equal(repliesDRE.length, 1);
    assert.match(repliesDRE[0], /DEMONSTRATIVO DE RESULTADO OPERACIONAL/i);
    assert.match(repliesDRE[0], /8\.000,00/); // Receita
    assert.match(repliesDRE[0], /3\.000,00/); // Despesa
    assert.match(repliesDRE[0], /700,00/);   // Peças em OSs
    assert.match(repliesDRE[0], /5\.000,00/); // Resultado líquido (8000 - 3000)
    assert.match(repliesDRE[0], /1\.500,00/); // Suprimento
    assert.match(repliesDRE[0], /500,00/);   // Sangria

    // 32.2 Aviso de Retirada / Comunicação de OS ao cliente
    const repliesAviso = [];
    await processarMensagemTexto({
      from: `${adminNum}@c.us`,
      author: `${adminNum}@c.us`,
      body: 'aviso retirada os 202',
      reply: async (txt) => { repliesAviso.push(txt); }
    }, { tenantKey: 'default', tenantState: mockState, fromNumber: adminNum });

    assert.equal(repliesAviso.length, 1);
    assert.match(repliesAviso[0], /COMUNICADO DE ORDEM DE SERVIÇO/i);
    assert.match(repliesAviso[0], /Brasil Central/);
    assert.match(repliesAviso[0], /Truck Center Brasil/);
    assert.match(repliesAviso[0], /Actros 2651/);
    assert.match(repliesAviso[0], /BRC1A22/);
    assert.match(repliesAviso[0], /pix@truckcenter\.com\.br/);

    // 32.3 Devolução de peça da OS para o estoque via WhatsApp
    const repliesDev = [];
    await processarMensagemTexto({
      from: `${mecanicoFone}@c.us`,
      author: `${mecanicoFone}@c.us`,
      body: 'devolver peca os 202 VALV-99',
      reply: async (txt) => { repliesDev.push(txt); }
    }, { tenantKey: 'default', tenantState: mockState, fromNumber: mecanicoFone });

    assert.equal(repliesDev.length, 1);
    assert.match(repliesDev[0], /Peça Devolvida ao Estoque/i);
    assert.match(repliesDev[0], /Válvula Reguladora de Pressão/);
    assert.equal(mockState.estoque[0].quantidade, 7, 'Estoque deve voltar de 5 para 7');
    assert.equal(mockState.os[0].pecasUtilizadas.length, 0);
    assert.equal(mockState.os[0].totalPecas, 0);

    // 32.4 Verificação de auditoria SQLite
    const auditRows = await all(`
      SELECT action, entity_id FROM security_audit_log
      WHERE action = 'patio:os:estornar_peca'
      ORDER BY id ASC
    `);
    assert.ok(auditRows.length >= 1, 'Deve registrar auditoria de estorno/devolução de peça');
  });

  // ── 33. CHECKLIST TÉCNICO PESADO (SUSPENSÃO & FREIOS) E LAUDO DE VISTORIA VIA WHATSAPP (FRENTE 8B) ──
  await t.test('33. Comandos de Vistoria, Trava de Conclusão e Laudo de Qualidade via WhatsApp Bot', async () => {
    const mockState = criarEstadoMock({
      comandosFinanceirosEscrita: true
    });
    const mecanicoFone = '5511977776666';

    mockState.boxes = [
      { id: 'BOX-01', nome: 'Box 01', status: 'ocupado' }
    ];

    mockState.os = [
      {
        id: '303',
        numero: '303',
        num: 303,
        st: 'executando',
        etapaPatio: 'em_execucao',
        boxId: 'BOX-01',
        mecanico: 'Mecânico Valter',
        placa: 'SCN9900',
        historicoPatio: []
      }
    ];

    // 33.1 Reprovação de checklist via WhatsApp
    const repliesReprovar = [];
    await processarMensagemTexto({
      from: `${mecanicoFone}@c.us`,
      author: `${mecanicoFone}@c.us`,
      body: 'checklist os 303 falha vazamento valvula pedal',
      reply: async (txt) => { repliesReprovar.push(txt); }
    }, { tenantKey: 'default', tenantState: mockState, fromNumber: mecanicoFone });

    assert.equal(repliesReprovar.length, 1);
    assert.match(repliesReprovar[0], /VISTORIA TÉCNICA REPROVADA/i);
    assert.match(repliesReprovar[0], /REPROVADO CRÍTICO/);
    assert.match(repliesReprovar[0], /vazamento valvula pedal/);
    assert.equal(mockState.os[0].statusChecklist, 'reprovado_critico');

    // 33.2 Bloqueio de finalização com checklist reprovado
    const repliesFinalizarTravado = [];
    await processarMensagemTexto({
      from: `${mecanicoFone}@c.us`,
      author: `${mecanicoFone}@c.us`,
      body: 'finalizar os 303',
      reply: async (txt) => { repliesFinalizarTravado.push(txt); }
    }, { tenantKey: 'default', tenantState: mockState, fromNumber: mecanicoFone });

    assert.equal(repliesFinalizarTravado.length, 1);
    assert.match(repliesFinalizarTravado[0], /Falha ao finalizar OS/i);
    assert.match(repliesFinalizarTravado[0], /checklist técnico reprovado com falha crítica/i);
    assert.equal(mockState.os[0].etapaPatio, 'em_execucao', 'OS deve continuar em execução mecânica');

    // 33.3 Aprovação de checklist via WhatsApp
    const repliesAprovar = [];
    await processarMensagemTexto({
      from: `${mecanicoFone}@c.us`,
      author: `${mecanicoFone}@c.us`,
      body: 'checklist os 303 ok valvula pedal substituida',
      reply: async (txt) => { repliesAprovar.push(txt); }
    }, { tenantKey: 'default', tenantState: mockState, fromNumber: mecanicoFone });

    assert.equal(repliesAprovar.length, 1);
    assert.match(repliesAprovar[0], /VISTORIA TÉCNICA APROVADA/i);
    assert.match(repliesAprovar[0], /100% Aprovado nos 5 itens/i);
    assert.equal(mockState.os[0].statusChecklist, 'aprovado');

    // 33.4 Consulta de laudo técnico completo via WhatsApp
    const repliesLaudo = [];
    await processarMensagemTexto({
      from: `${mecanicoFone}@c.us`,
      author: `${mecanicoFone}@c.us`,
      body: 'laudo os 303',
      reply: async (txt) => { repliesLaudo.push(txt); }
    }, { tenantKey: 'default', tenantState: mockState, fromNumber: mecanicoFone });

    assert.equal(repliesLaudo.length, 1);
    assert.match(repliesLaudo[0], /LAUDO DE VISTORIA TÉCNICA PESADA/i);
    assert.match(repliesLaudo[0], /Torque\/Reaperto de Grampos e Feixe de Molas/);
    assert.match(repliesLaudo[0], /Estanqueidade Pneumática, Cuícas e Catracas de Freio/);
    assert.match(repliesLaudo[0], /APROVADO/);

    // 33.5 Agora com vistoria aprovada, finalização deve concluir com sucesso
    const repliesFinalizarOk = [];
    await processarMensagemTexto({
      from: `${mecanicoFone}@c.us`,
      author: `${mecanicoFone}@c.us`,
      body: 'finalizar os 303',
      reply: async (txt) => { repliesFinalizarOk.push(txt); }
    }, { tenantKey: 'default', tenantState: mockState, fromNumber: mecanicoFone });

    assert.equal(repliesFinalizarOk.length, 1);
    assert.match(repliesFinalizarOk[0], /OS Concluída no Pátio/i);
    assert.equal(mockState.os[0].etapaPatio, 'pronto_retirada');
    assert.equal(mockState.boxes[0].status, 'livre');

    // 33.6 Auditoria gravada no banco de dados SQLite
    const auditRows = await all(`
      SELECT action, entity_id FROM security_audit_log
      WHERE action = 'patio:os:checklist_tecnico'
      ORDER BY id ASC
    `);
    assert.ok(auditRows.length >= 2, 'Deve registrar auditorias de reprovação e aprovação de checklist');
  });

  // ── 34. RASTREAMENTO DE GARANTIA POR PLACA E VÍNCULO DE RETORNO VIA WHATSAPP (FRENTE 9B) ──
  await t.test('34. Comandos de Consulta de Garantia por Placa e Registro de Retorno via WhatsApp Bot', async () => {
    const mockState = criarEstadoMock({
      comandosFinanceirosEscrita: true
    });
    const mecanicoFone = '5511977776666';
    const agoraSP = financialEngine.obterAgoraSP();
    const dHoje = agoraSP.dataISO;
    const dPassado15 = financialEngine.addDias(dHoje, -15);

    mockState.os = [
      {
        id: '401',
        numero: '401',
        num: 401,
        st: 'finalizada',
        etapaPatio: 'finalizada',
        placa: 'KMT5544',
        mecanico: 'Mecânico Carlos',
        total: 2800,
        concluidoExecucaoEm: `${dPassado15}T14:00:00.000Z`,
        pecasUtilizadas: [
          { id: 'pec_pino', nome: 'Pino de Centro 1/2', quantidade: 2, subtotal: 180 }
        ],
        historicoPatio: []
      },
      {
        id: '404',
        numero: '404',
        num: 404,
        st: 'executando',
        etapaPatio: 'em_execucao',
        placa: 'KMT5544',
        total: 0,
        historicoPatio: []
      }
    ];

    // 34.1 Consulta de garantia e histórico por placa
    const repliesDossie = [];
    await processarMensagemTexto({
      from: `${mecanicoFone}@c.us`,
      author: `${mecanicoFone}@c.us`,
      body: 'garantia placa KMT5544',
      reply: async (txt) => { repliesDossie.push(txt); }
    }, { tenantKey: 'default', tenantState: mockState, fromNumber: mecanicoFone });

    assert.equal(repliesDossie.length, 1);
    assert.match(repliesDossie[0], /DOSSIÊ HISTÓRICO & GARANTIA POR PLACA/i);
    assert.match(repliesDossie[0], /GARANTIA ATIVA \(90 DIAS\)/);
    assert.match(repliesDossie[0], /Mecânico Carlos/);
    assert.match(repliesDossie[0], /Pino de Centro/);

    // 34.2 Vínculo de retorno em garantia na OS atual
    const repliesGarantia = [];
    await processarMensagemTexto({
      from: `${mecanicoFone}@c.us`,
      author: `${mecanicoFone}@c.us`,
      body: 'garantia os 404 origem 401 folga de pino recorrente',
      reply: async (txt) => { repliesGarantia.push(txt); }
    }, { tenantKey: 'default', tenantState: mockState, fromNumber: mecanicoFone });

    assert.equal(repliesGarantia.length, 1);
    assert.match(repliesGarantia[0], /RETORNO EM GARANTIA VINCULADO/i);
    assert.match(repliesGarantia[0], /OS Origem:\* #401/);
    assert.match(repliesGarantia[0], /Liberado \(Garantia\)/);
    assert.equal(mockState.os[1].isRetornoGarantia, true);
    assert.equal(mockState.os[1].osOrigemGarantiaId, '401');

    // 34.3 Auditoria no banco SQLite
    const auditRows = await all(`
      SELECT action, entity_id FROM security_audit_log
      WHERE action = 'patio:os:retorno_garantia'
      ORDER BY id ASC
    `);
    assert.ok(auditRows.length >= 1, 'Deve registrar auditoria do retorno de garantia');
  });

  // ── 35. COMANDOS DE RELATÓRIO PERIÓDICO E PRODUTIVIDADE VIA BOT (FRENTE 10B) ──
  await t.test('35. Comandos de Relatório Semanal, Mensal e Produtividade via WhatsApp Bot', async () => {
    const mockState = criarEstadoMock({
      comandosFinanceirosEscrita: true
    });
    const mecanicoFone = '5511966665555';
    const donoFone = '5511999998888';
    const agoraSP = financialEngine.obterAgoraSP();
    const dHoje = agoraSP.dataISO;

    mockState.mecanicos.push({
      id: 'mec-carlos',
      nome: 'Mecânico Carlos',
      fone: mecanicoFone
    });
    mockState.boxes = [
      { id: 'BOX-01', nome: 'Box 01 — Linha Pesada' },
      { id: 'BOX-02', nome: 'Box 02 — Freios' }
    ];
    mockState.os = [
      {
        id: '501',
        num: 501,
        st: 'finalizada',
        mecanico: 'Mecânico Carlos',
        box: 'BOX-01',
        concluidoEm: `${dHoje}T11:00:00`,
        tempoOcupacaoMinutos: 90,
        servicos: [{ id: 's1', nome: 'Troca de Mola', valor: 1200 }],
        totalPecas: 400
      },
      {
        id: '502',
        num: 502,
        st: 'finalizada',
        mecanico: 'Mecânico Carlos',
        box: 'BOX-01',
        concluidoEm: `${dHoje}T15:00:00`,
        tempoOcupacaoMinutos: 60,
        isRetornoGarantia: true,
        servicos: [{ id: 's2', nome: 'Ajuste Garantia', valor: 300 }],
        totalPecas: 0
      }
    ];

    // 35.1 Comando: relatorio semanal
    const repliesSemanal = [];
    await processarMensagemTexto({
      from: `${donoFone}@c.us`,
      author: `${donoFone}@c.us`,
      body: 'relatorio semanal',
      reply: async (txt) => { repliesSemanal.push(txt); }
    }, { tenantKey: 'default', tenantState: mockState, fromNumber: donoFone });

    assert.equal(repliesSemanal.length, 1);
    assert.match(repliesSemanal[0], /BOLETIM DE PRODUTIVIDADE & BI \(SEMANAL\)/i);
    assert.match(repliesSemanal[0], /Faturamento Mão de Obra/i);
    assert.match(repliesSemanal[0], /Mecânico Destaque/i);
    assert.match(repliesSemanal[0], /Mecânico Carlos/);
    assert.match(repliesSemanal[0], /Box 01/);

    // 35.2 Comando: relatorio mensal
    const repliesMensal = [];
    await processarMensagemTexto({
      from: `${donoFone}@c.us`,
      author: `${donoFone}@c.us`,
      body: 'relatorio mensal',
      reply: async (txt) => { repliesMensal.push(txt); }
    }, { tenantKey: 'default', tenantState: mockState, fromNumber: donoFone });

    assert.equal(repliesMensal.length, 1);
    assert.match(repliesMensal[0], /BOLETIM DE PRODUTIVIDADE & BI \(MENSAL\)/i);
    assert.match(repliesMensal[0], /Total de Comissões/i);

    // 35.3 Comando: minha comissao (enviado pelo próprio mecânico)
    const repliesMinhaComissao = [];
    await processarMensagemTexto({
      from: `${mecanicoFone}@c.us`,
      author: `${mecanicoFone}@c.us`,
      body: 'minha comissao',
      reply: async (txt) => { repliesMinhaComissao.push(txt); }
    }, { tenantKey: 'default', tenantState: mockState, fromNumber: mecanicoFone });

    assert.equal(repliesMinhaComissao.length, 1);
    assert.match(repliesMinhaComissao[0], /EXTRATO DE COMISSÃO — MECÂNICO CARLOS/i);
    assert.match(repliesMinhaComissao[0], /Base Comissionável/i);
    // Comissão sobre 1200 (excluindo 300 de garantia): 20% de 1200 = 240
    assert.match(repliesMinhaComissao[0], /240,00/);

    // 35.4 Comando: comissoes (enviado pelo gestor / dono da oficina)
    const repliesComissoesGeral = [];
    await processarMensagemTexto({
      from: `${donoFone}@c.us`,
      author: `${donoFone}@c.us`,
      body: 'comissoes',
      reply: async (txt) => { repliesComissoesGeral.push(txt); }
    }, { tenantKey: 'default', tenantState: mockState, fromNumber: donoFone });

    assert.equal(repliesComissoesGeral.length, 1);
    assert.match(repliesComissoesGeral[0], /EXTRATO DE COMISSÕES — FECHAMENTO MENSAL/i);
    assert.match(repliesComissoesGeral[0], /Mecânico Carlos/);
  });
});





