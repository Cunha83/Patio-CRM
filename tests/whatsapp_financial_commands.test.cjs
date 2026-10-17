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

  // ── 10. IDEMPOTÊNCIA DURÁVEL EM SQLITE KV COM TTL ───────────────────
  await t.test('10. Idempotência durável em SQLite KV com TTL: sobrevive à limpeza da memória', async () => {
    const msgId = 'true_5511999998888@c.us_DURABLE_TEST_001';

    // Inicialmente não duplicada
    const check1 = await verificarIdempotencia(msgId);
    assert.equal(check1.duplicada, false);

    // Registra idempotência durável
    await registrarIdempotencia(msgId, 'Resposta salva no SQLite KV');

    // Confere que gravou no SQLite KV
    const row = await get('SELECT value FROM kv WHERE key = ?', [`wpp_msg:${msgId}`]);
    assert.ok(row && row.value, 'Deve ter persistido no SQLite KV');
    const parsed = JSON.parse(row.value);
    assert.equal(parsed.resposta, 'Resposta salva no SQLite KV');
    assert.ok(parsed.expiraEm > Date.now());

    // Limpa a memória RAM para simular restart do processo
    mensagensProcessadas.clear();

    // Consulta novamente: deve buscar do SQLite KV e reportar duplicada com a mesma resposta
    const check2 = await verificarIdempotencia(msgId);
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
});
