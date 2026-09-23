'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const { spawn } = require('node:child_process');
const { once } = require('node:events');

const technicalIntakeEngine = require('../services/technicalIntakeEngine');
const intakeQuestionEngine = require('../services/intakeQuestionEngine');
const preOSEngine = require('../services/preOSEngine');
const voiceActionEngine = require('../services/voiceActionEngine');
const { getState, persistState, clearMemoryCache } = require('../lib/repository/stateRepository');
const { initDB, closeDB } = require('../db');
const { gerarTokenAcao } = require('../lib/tokens/securityToken');

/* ── 1. TRIAGEM SIMPLES SEM HISTÓRICO ────────────────────────────── */
test('1. Triagem simples sem histórico: extrai domínio técnico, prioriza km e não gera autodiagnóstico', async () => {
  const state = {
    veiculos: [{ id: 'v_1', placa: 'DEF5678', modelo: 'FH 540', marca: 'Volvo', ano: '2022', km: 120000, cli: 'c_1' }],
    clientes: [{ id: 'c_1', nome: 'Transportadora Rápida' }],
    os: [],
    preOS: [],
    intakeSessions: [],
    auditoria: []
  };

  const res = technicalIntakeEngine.iniciarIntake({
    tenantId: 'tenant_alfa',
    actorId: 'op_joao',
    channel: 'web',
    placa: 'DEF5678',
    kmAtual: 120000,
    reclamacao: 'Barulho no freio ao pisar no pedal',
    state
  });

  assert.equal(res.ok, true);
  assert.ok(res.session.id.startsWith('ses_'));
  assert.equal(res.session.collected.kmAtual, 120000);
  assert.equal(res.resumoContexto.nivelAtencao, 'info');
  assert.equal(res.preOS.possivelGarantia, false);
  assert.equal(res.preOS.ocorrenciasRelacionadas.length, 0);

  // Não emite diagnóstico autônomo fechado
  const resumo = res.respostaSugerida;
  assert.doesNotMatch(resumo, /troca obrigatória da pastilha|defeito confirmado no disco/i);
  assert.match(resumo, /freio|DEF5678/i);

  // Auditoria registrada
  const aud = state.auditoria.find(a => a.acao === 'intake_iniciado');
  assert.ok(aud);
  assert.equal(aud.placa, 'DEF5678');
});

/* ── 2. TRIAGEM COM RECORRÊNCIA DETECTADA ────────────────────────── */
test('2. Triagem com recorrência: detecta serviço correlato prévio e calcula delta de dias e km', async () => {
  const dataHoje = '2026-09-10';
  const dataAnterior = '2026-08-01'; // ~40 dias atrás

  const state = {
    veiculos: [{ id: 'v_scania_1', placa: 'SCN1234', modelo: 'R 450', km: 245000, cli: 'c_1' }],
    clientes: [{ id: 'c_1', nome: 'Frota Sul' }],
    os: [
      {
        id: 'os_antiga_1',
        num: 800,
        vei: 'v_scania_1',
        cli: 'c_1',
        st: 'finalizada',
        abertura: dataAnterior,
        km: 240000,
        queixa: 'Revisão geral do sistema de freios e troca de pastilhas',
        servicos: [{ id: 's1', nome: 'Troca de pastilhas e revisão de cuíca', qtd: 1, valor: 650 }],
        pecas: []
      }
    ],
    preOS: [],
    intakeSessions: [],
    auditoria: []
  };

  const res = technicalIntakeEngine.iniciarIntake({
    tenantId: 'tenant_alfa',
    actorId: 'op_maria',
    channel: 'whatsapp',
    placa: 'SCN1234',
    kmAtual: 245000,
    reclamacao: 'Freio fazendo barulho e chiando',
    state,
    dataReferencia: dataHoje
  });

  assert.equal(res.ok, true);
  assert.equal(res.preOS.ocorrenciasRelacionadas.length > 0, true);
  assert.equal(res.resumoContexto.nivelAtencao, 'alto', 'Retorno em menos de 90 dias deve ter nível alto');
  assert.equal(res.resumoContexto.kmDesdeUltimoServicoRelacionado, 5000);

  const audRec = state.auditoria.find(a => a.acao === 'recorrencia_detectada');
  assert.ok(audRec);
});

/* ── 3. TRIAGEM COM POSSÍVEL GARANTIA (NÃO AUTÔNOMA) ─────────────── */
test('3. Triagem com possível garantia: aponta hipótese sem aprovar garantia autonomamente', async () => {
  const dataHoje = '2026-09-10';
  const dataAnterior = '2026-08-15'; // 26 dias atrás

  const state = {
    veiculos: [{ id: 'v_volvo_2', placa: 'VOL2022', modelo: 'FH 460', km: 152000, cli: 'c_1' }],
    clientes: [{ id: 'c_1', nome: 'Transportes Brasil' }],
    os: [
      {
        id: 'os_embuchamento',
        num: 920,
        vei: 'v_volvo_2',
        cli: 'c_1',
        st: 'finalizada',
        abertura: dataAnterior,
        km: 150000,
        queixa: 'Folga no eixo dianteiro e embuchamento',
        servicos: [{ id: 's_emb', nome: 'Embuchamento completo do eixo dianteiro', qtd: 1, valor: 1400 }],
        pecas: []
      }
    ],
    cfg: {
      garantias: {
        embuchamento_eixo: { dias: 180, km: 20000, descricao: 'Garantia de Embuchamento' }
      }
    },
    preOS: [],
    intakeSessions: [],
    auditoria: []
  };

  const res = technicalIntakeEngine.iniciarIntake({
    tenantId: 'tenant_alfa',
    actorId: 'op_marcos',
    channel: 'web',
    placa: 'VOL2022',
    kmAtual: 152000,
    reclamacao: 'Batendo eixo dianteiro com folga nas buchas',
    state,
    dataReferencia: dataHoje
  });

  assert.equal(res.ok, true);
  assert.equal(res.preOS.possivelGarantia, true);
  assert.equal(res.preOS.status, 'aguardando_confirmacao');
  // Não pode haver nenhuma flag de garantia aprovada de forma autônoma
  assert.equal(res.preOS.garantiaAprovada, undefined);

  // Se houver pergunta pendente, responde e conclui a sessão para aguardar confirmação
  if (res.session.status === 'aguardando_resposta') {
    const resResp = await technicalIntakeEngine.processarMensagem({
      tenantId: 'tenant_alfa',
      actorId: 'op_marcos',
      channel: 'web',
      texto: 'ao passar em desnível na pista',
      state
    });
    assert.equal(resResp.ok, true);
  }

  assert.equal(res.session.status, 'aguardando_confirmacao');
  const audGar = state.auditoria.find(a => a.acao === 'possivel_garantia_detectada');
  assert.ok(audGar);
});

/* ── 4. PERSISTÊNCIA DA SESSÃO APÓS RELOAD / REINÍCIO (SQLITE) ────── */
test('4. Persistência da sessão após reload/reinício (SQLite)', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'patio_intake_db_'));
  const dbPath = path.join(tempDir, 'test_intake.db');
  process.env.DB_PATH = dbPath;

  await initDB();
  clearMemoryCache();

  const tenantId = 'oficina_persist_1';
  const stateInicial = {
    versao: 1,
    os: [],
    clientes: [],
    pecas: [],
    veiculos: [{ id: 'v_persist_1', placa: 'PST1234', modelo: 'Constellation', km: 80000, cli: 'c_1' }],
    preOS: [],
    intakeSessions: [],
    auditoria: []
  };

  // Inicia o intake na memória
  const intakeRes = technicalIntakeEngine.iniciarIntake({
    tenantId,
    actorId: 'operador_sqlite',
    channel: 'whatsapp',
    placa: 'PST1234',
    kmAtual: 80000,
    reclamacao: 'Vazamento de ar próximo ao reservatório',
    state: stateInicial
  });

  const sessionId = intakeRes.session.id;

  // Persiste no SQLite com contexto de segurança adequado
  const enqueueWrite = fn => fn();
  const context = { tenantId, permissions: ['*'], channel: 'internal' };
  await persistState(context, stateInicial, { enqueueWrite });

  // Limpa o cache de memória para forçar leitura limpa do SQLite
  clearMemoryCache();

  // Lê do SQLite
  const stateRecarregado = await getState(tenantId);
  assert.ok(Array.isArray(stateRecarregado.intakeSessions));
  assert.equal(stateRecarregado.intakeSessions.length, 1);

  const sessaoCarregada = stateRecarregado.intakeSessions[0];
  assert.equal(sessaoCarregada.id, sessionId);
  assert.equal(sessaoCarregada.placa, 'PST1234');
  assert.equal(sessaoCarregada.collected.kmAtual, 80000);

  // Localizador ativo recupera a sessão carregada do banco
  const sessaoAtiva = technicalIntakeEngine.localizarSessaoAtiva({
    tenantId,
    sessionId,
    state: stateRecarregado
  });
  assert.ok(sessaoAtiva);
  assert.equal(sessaoAtiva.id, sessionId);

  await closeDB();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

/* ── 5. RESPOSTA CURTA RELACIONADA À PERGUNTA ANTERIOR ───────────── */
test('5. Resposta curta relacionada à pergunta anterior: responde número ou posição sem perder contexto', async () => {
  const state = {
    veiculos: [{ id: 'v_5', placa: 'ABC9876', km: 0 }],
    clientes: [],
    os: [],
    preOS: [],
    intakeSessions: [],
    auditoria: []
  };

  // 5.1 Inicia sem informar quilometragem
  const resIni = technicalIntakeEngine.iniciarIntake({
    tenantId: 'tenant_alfa',
    actorId: 'op_teste',
    channel: 'whatsapp',
    placa: 'ABC9876',
    kmAtual: 0,
    reclamacao: 'Estalo na suspensão ao passar em buraco',
    state
  });

  assert.equal(resIni.session.status, 'aguardando_resposta');
  assert.equal(resIni.session.pendingQuestion.campo, 'kmAtual');

  // 5.2 Responde apenas número "421500"
  const resMsg = await technicalIntakeEngine.processarMensagem({
    tenantId: 'tenant_alfa',
    actorId: 'op_teste',
    channel: 'whatsapp',
    texto: '421500',
    state
  });

  assert.equal(resMsg.ok, true);
  assert.equal(resIni.session.collected.kmAtual, 421500);
  assert.equal(state.preOS[0].kmAtual, 421500);

  // 5.3 Resposta sobre localização/região
  if (resIni.session.status === 'aguardando_resposta' && resIni.session.pendingQuestion) {
    const resMsg2 = await technicalIntakeEngine.processarMensagem({
      tenantId: 'tenant_alfa',
      actorId: 'op_teste',
      channel: 'whatsapp',
      texto: 'na frente do lado direito',
      state
    });
    assert.equal(resMsg2.ok, true);
  }
});

/* ── 6. CORREÇÃO DE QUILOMETRAGEM NO DIÁLOGO ─────────────────────── */
test('6. Correção de quilometragem no diálogo: "Não, errei. A quilometragem é 423.500"', async () => {
  const state = {
    veiculos: [{ id: 'v_6', placa: 'COR1234', km: 420000 }],
    clientes: [],
    os: [],
    preOS: [],
    intakeSessions: [],
    auditoria: []
  };

  // Inicia com km 420000
  const ini = technicalIntakeEngine.iniciarIntake({
    tenantId: 'tenant_alfa',
    actorId: 'op_corretor',
    channel: 'whatsapp',
    placa: 'COR1234',
    kmAtual: 420000,
    reclamacao: 'Barulho no diferencial ao acelerar',
    state
  });

  // Operador corrige espontaneamente durante a conversa
  const resCorrecao = await technicalIntakeEngine.processarMensagem({
    tenantId: 'tenant_alfa',
    actorId: 'op_corretor',
    channel: 'whatsapp',
    texto: 'Não, errei. A quilometragem é 423.500',
    state
  });

  assert.equal(resCorrecao.ok, true);
  assert.equal(resCorrecao.tipo, 'correcao_campo');
  assert.equal(ini.session.collected.kmAtual, 423500);
  assert.equal(state.preOS[0].kmAtual, 423500);

  const audCor = state.auditoria.find(a => a.acao === 'campo_corrigido');
  assert.ok(audCor);
  assert.equal(audCor.campo, 'kmAtual');
  assert.equal(audCor.novoValor, 423500);
});

/* ── 7. RECÁLCULO DE GARANTIA APÓS CORREÇÃO ───────────────────────── */
test('7. Recálculo de garantia após correção: km corrigido reavalia cobertura automaticamente', async () => {
  const dataHoje = '2026-09-10';
  const dataAnterior = '2026-08-01'; // 40 dias atrás

  const state = {
    veiculos: [{ id: 'v_7', placa: 'GAR7777', km: 200000 }],
    clientes: [{ id: 'c_7', nome: 'Transportes 7' }],
    os: [
      {
        id: 'os_antiga_7',
        num: 700,
        vei: 'v_7',
        cli: 'c_7',
        st: 'finalizada',
        abertura: dataAnterior,
        km: 200000,
        queixa: 'Troca de pastilhas de freio',
        servicos: [{ id: 's7', nome: 'Pastilhas de freio dianteiras', qtd: 1, valor: 500 }],
        pecas: []
      }
    ],
    cfg: {
      garantias: {
        freios: { dias: 90, km: 10000, descricao: 'Garantia de Freios 10.000 km' }
      }
    },
    preOS: [],
    intakeSessions: [],
    auditoria: []
  };

  // Inicialmente informado 250.000 km (delta 50.000 km > 10.000 km -> FORA de garantia)
  const ini = technicalIntakeEngine.iniciarIntake({
    tenantId: 'tenant_alfa',
    actorId: 'op_7',
    channel: 'whatsapp',
    placa: 'GAR7777',
    kmAtual: 250000,
    reclamacao: 'Chiado no freio dianteiro',
    state,
    dataReferencia: dataHoje
  });

  assert.equal(ini.preOS.possivelGarantia, false);

  // Operador corrige: "Não, a quilometragem é 204.000 km" (delta 4.000 km <= 10.000 km -> DENTRO de garantia!)
  const resCorr = await technicalIntakeEngine.processarMensagem({
    tenantId: 'tenant_alfa',
    actorId: 'op_7',
    channel: 'whatsapp',
    texto: 'Não, errei. A quilometragem é 204.000 km',
    state
  });

  assert.equal(resCorr.ok, true);
  assert.equal(ini.preOS.possivelGarantia, true);
  assert.equal(ini.session.status, 'aguardando_confirmacao');
  assert.ok(ini.preOS.alertas.some(a => a.tipo === 'garantia'));
});

/* ── 8. RETOMADA DE CONVERSA INTERROMPIDA ────────────────────────── */
test('8. Retomada de conversa interrompida: mantém sessão em espera e retoma com "vamos continuar"', async () => {
  const state = {
    veiculos: [{ id: 'v_8', placa: 'INT8888', km: 0 }],
    clientes: [],
    os: [],
    preOS: [],
    intakeSessions: [],
    auditoria: []
  };

  const ini = technicalIntakeEngine.iniciarIntake({
    tenantId: 'tenant_alfa',
    actorId: 'op_interrupcao',
    channel: 'whatsapp',
    placa: 'INT8888',
    kmAtual: 0,
    reclamacao: 'Vazamento de óleo perto da caixa de direção',
    state
  });

  assert.equal(ini.session.status, 'aguardando_resposta');
  const perguntaOriginal = ini.session.pendingQuestion.texto;

  // Usuário interrompe o fluxo perguntando algo não técnico do pátio
  const resInterrupcao = await technicalIntakeEngine.processarMensagem({
    tenantId: 'tenant_alfa',
    actorId: 'op_interrupcao',
    channel: 'whatsapp',
    texto: 'quantos caminhões temos no pátio agora?',
    state
  });

  assert.equal(resInterrupcao.ok, true);
  assert.equal(resInterrupcao.tipo, 'interrupcao_consulta');
  assert.equal(resInterrupcao.sessaoPreservada, true);
  assert.equal(ini.session.interrupted, true);

  // Usuário solicita retomar o atendimento da Pré-OS
  const resRetomada = await technicalIntakeEngine.processarMensagem({
    tenantId: 'tenant_alfa',
    actorId: 'op_interrupcao',
    channel: 'whatsapp',
    texto: 'vamos continuar',
    state
  });

  assert.equal(resRetomada.ok, true);
  assert.equal(resRetomada.tipo, 'pergunta_retomada');
  assert.equal(ini.session.interrupted, false);
  assert.match(resRetomada.resposta, new RegExp(perguntaOriginal));
});

/* ── 9. DOIS VEÍCULOS SENDO TRATADOS PELO MESMO OPERADOR ─────────── */
test('9. Dois veículos sendo tratados pelo mesmo operador: coexistem sem sobrescrita', async () => {
  const state = {
    veiculos: [
      { id: 'v_9a', placa: 'AAA1111', km: 100000 },
      { id: 'v_9b', placa: 'BBB2222', km: 200000 }
    ],
    clientes: [],
    os: [],
    preOS: [],
    intakeSessions: [],
    auditoria: []
  };

  // Inicia veículo A
  const resA = technicalIntakeEngine.iniciarIntake({
    tenantId: 'tenant_alfa',
    actorId: 'op_multitask',
    channel: 'web',
    placa: 'AAA1111',
    kmAtual: 100000,
    reclamacao: 'Barulho no freio',
    state
  });

  // Inicia veículo B
  const resB = technicalIntakeEngine.iniciarIntake({
    tenantId: 'tenant_alfa',
    actorId: 'op_multitask',
    channel: 'web',
    placa: 'BBB2222',
    kmAtual: 200000,
    reclamacao: 'Vazamento de ar',
    state
  });

  assert.equal(state.intakeSessions.length, 2);
  assert.notEqual(resA.session.id, resB.session.id);

  // Localiza especificando a placa de cada um
  const achouA = technicalIntakeEngine.localizarSessaoAtiva({
    tenantId: 'tenant_alfa',
    actorId: 'op_multitask',
    placa: 'AAA1111',
    state
  });
  const achouB = technicalIntakeEngine.localizarSessaoAtiva({
    tenantId: 'tenant_alfa',
    actorId: 'op_multitask',
    placa: 'BBB2222',
    state
  });

  assert.equal(achouA.id, resA.session.id);
  assert.equal(achouB.id, resB.session.id);
  assert.equal(achouA.collected.kmAtual, 100000);
  assert.equal(achouB.collected.kmAtual, 200000);
});

/* ── 10. DOIS OPERADORES NO MESMO TENANT ──────────────────────────── */
test('10. Dois operadores no mesmo tenant: sessões independentes simultâneas', async () => {
  const state = {
    veiculos: [
      { id: 'v_10a', placa: 'OPR1111', km: 50000 },
      { id: 'v_10b', placa: 'OPR2222', km: 60000 }
    ],
    clientes: [],
    os: [],
    preOS: [],
    intakeSessions: [],
    auditoria: []
  };

  const resCarlos = technicalIntakeEngine.iniciarIntake({
    tenantId: 'tenant_alfa',
    actorId: 'carlos',
    channel: 'whatsapp',
    placa: 'OPR1111',
    kmAtual: 50000,
    reclamacao: 'Alinhamento puxando para esquerda',
    state
  });

  const resAna = technicalIntakeEngine.iniciarIntake({
    tenantId: 'tenant_alfa',
    actorId: 'ana',
    channel: 'whatsapp',
    placa: 'OPR2222',
    kmAtual: 60000,
    reclamacao: 'Embreagem patinando',
    state
  });

  const sCarlos = technicalIntakeEngine.localizarSessaoAtiva({
    tenantId: 'tenant_alfa',
    actorId: 'carlos',
    channel: 'whatsapp',
    state
  });
  const sAna = technicalIntakeEngine.localizarSessaoAtiva({
    tenantId: 'tenant_alfa',
    actorId: 'ana',
    channel: 'whatsapp',
    state
  });

  assert.equal(sCarlos.id, resCarlos.session.id);
  assert.equal(sAna.id, resAna.session.id);
  assert.notEqual(sCarlos.id, sAna.id);
});

/* ── 11. MESMO USUÁRIO EM TENANTS DIFERENTES SEM VAZAMENTO ────────── */
test('11. Mesmo usuário em tenants diferentes: isolamento estrito sem vazamento entre estados', async () => {
  const stateAlfa = {
    veiculos: [{ id: 'v_11a', placa: 'ALF9999', km: 10000 }],
    os: [],
    preOS: [],
    intakeSessions: [],
    auditoria: []
  };

  const stateBeta = {
    veiculos: [{ id: 'v_11b', placa: 'BET9999', km: 20000 }],
    os: [],
    preOS: [],
    intakeSessions: [],
    auditoria: []
  };

  // Usuário compartilhado inicia sessão em Alfa
  const resAlfa = technicalIntakeEngine.iniciarIntake({
    tenantId: 'oficina_alfa',
    actorId: 'usuario_global',
    channel: 'web',
    placa: 'ALF9999',
    kmAtual: 10000,
    reclamacao: 'Troca de óleo',
    state: stateAlfa
  });

  // Tenta localizar sessão do usuário em Beta
  const achouEmBeta = technicalIntakeEngine.localizarSessaoAtiva({
    tenantId: 'oficina_beta',
    actorId: 'usuario_global',
    state: stateBeta
  });

  assert.equal(achouEmBeta, null, 'Tenant Beta não deve localizar a sessão de Alfa');
  assert.equal(stateBeta.intakeSessions.length, 0);
  assert.equal(stateAlfa.intakeSessions.length, 1);
});

/* ── 12. SESSÃO EXPIRADA (TTL) ────────────────────────────────────── */
test('12. Sessão expirada (TTL): expiração limpa status e impede continuação', async () => {
  const state = {
    veiculos: [{ id: 'v_12', placa: 'TTL1234', km: 100000 }],
    os: [],
    preOS: [],
    intakeSessions: [
      {
        id: 'ses_expirada_teste',
        tenantId: 'tenant_alfa',
        actorId: 'op_ttl',
        channel: 'whatsapp',
        placa: 'TTL1234',
        status: 'aguardando_resposta',
        expiresAt: Date.now() - 5000 // Expirou há 5 segundos
      }
    ],
    auditoria: []
  };

  const achou = technicalIntakeEngine.localizarSessaoAtiva({
    tenantId: 'tenant_alfa',
    actorId: 'op_ttl',
    state
  });

  assert.equal(achou, null, 'Sessão expirada não deve ser retornada como ativa');
  assert.equal(state.intakeSessions[0].status, 'expirada');
});

/* ── 13. CANCELAMENTO DA SESSÃO ──────────────────────────────────── */
test('13. Cancelamento da sessão: encerra a sessão e cancela a Pré-OS no histórico técnico', async () => {
  const state = {
    veiculos: [{ id: 'v_13', placa: 'CNC1234', km: 100000 }],
    os: [],
    preOS: [],
    intakeSessions: [],
    auditoria: []
  };

  const ini = technicalIntakeEngine.iniciarIntake({
    tenantId: 'tenant_alfa',
    actorId: 'op_canc',
    channel: 'whatsapp',
    placa: 'CNC1234',
    kmAtual: 100000,
    reclamacao: 'Barulho no rolamento',
    state
  });

  // Operador envia mensagem de cancelamento
  const resCanc = await technicalIntakeEngine.processarMensagem({
    tenantId: 'tenant_alfa',
    actorId: 'op_canc',
    channel: 'whatsapp',
    texto: 'cancelar',
    state
  });

  assert.equal(resCanc.ok, true);
  assert.equal(ini.session.status, 'cancelada');
  assert.equal(state.preOS[0].status, 'cancelada');

  // Tentativa de confirmação posterior deve ser rejeitada
  const tentConfirmar = technicalIntakeEngine.confirmarIntake({
    tenantId: 'tenant_alfa',
    sessionId: ini.session.id,
    state,
    actorId: 'op_canc'
  });

  assert.equal(tentConfirmar.ok, false);
  assert.equal(tentConfirmar.status, 400);
});

/* ── 14. CONVERSÃO APÓS CONFIRMAÇÃO HUMANA VÁLIDA ────────────────── */
test('14. Conversão após confirmação humana válida: gera OS definitiva com dados consolidados', async () => {
  const state = {
    veiculos: [{ id: 'v_14', placa: 'CNV1234', km: 150000, cli: 'c_14' }],
    clientes: [{ id: 'c_14', nome: 'Cliente 14' }],
    os: [],
    preOS: [],
    intakeSessions: [],
    auditoria: []
  };

  const ini = technicalIntakeEngine.iniciarIntake({
    tenantId: 'tenant_alfa',
    actorId: 'op_confirmador',
    channel: 'whatsapp',
    placa: 'CNV1234',
    kmAtual: 150000,
    reclamacao: 'Troca de lâmpadas do farol',
    state
  });

  // Se houver pergunta pendente, responde primeiro
  if (ini.session.status === 'aguardando_resposta') {
    await technicalIntakeEngine.processarMensagem({
      tenantId: 'tenant_alfa',
      actorId: 'op_confirmador',
      channel: 'whatsapp',
      texto: 'lâmpada dianteira esquerda queimada',
      state
    });
  }

  // Operador confirma com "sim"
  const resConf = await technicalIntakeEngine.processarMensagem({
    tenantId: 'tenant_alfa',
    actorId: 'op_confirmador',
    channel: 'whatsapp',
    texto: 'sim',
    state
  });

  assert.equal(resConf.ok, true);
  assert.equal(resConf.tipo, 'confirmacao_sucesso');
  assert.equal(ini.session.status, 'concluida');
  assert.equal(state.os.length, 1);
  assert.equal(state.os[0].preOSId, ini.preOS.id);
  assert.equal(state.os[0].vei, 'v_14');
});

/* ── 15. TENTATIVA DE CONVERSÃO COM TOKEN FORJADO OU DIVERGENTE ──── */
test('15. Tentativa de conversão com token forjado ou divergente: rejeição estrita', async () => {
  const state = {
    veiculos: [{ id: 'v_15', placa: 'FRG1234', km: 100000, cli: 'c_15' }],
    clientes: [{ id: 'c_15', nome: 'Cliente 15' }],
    os: [],
    preOS: [],
    intakeSessions: [],
    auditoria: []
  };

  const ini = technicalIntakeEngine.iniciarIntake({
    tenantId: 'tenant_alfa',
    actorId: 'op_legitimo',
    channel: 'web',
    placa: 'FRG1234',
    kmAtual: 100000,
    reclamacao: 'Barulho no cardan',
    state
  });

  // Token gerado para outro tenant
  const tokenForjado = gerarTokenAcao({
    tenantId: 'tenant_invasor',
    actorId: 'op_legitimo',
    resourceId: ini.preOS.id,
    action: 'converter_pre_os',
    version: 1
  });

  const resInvasao = technicalIntakeEngine.confirmarIntake({
    tenantId: 'tenant_alfa',
    sessionId: ini.session.id,
    state,
    actorId: 'op_legitimo',
    confirmToken: tokenForjado
  });

  assert.equal(resInvasao.ok, false);
  assert.equal(resInvasao.status, 403);
  assert.equal(state.os.length, 0, 'Nenhuma OS deve ser criada com token inválido');
});

/* ── 16. WHATSAPP RESPEITANDO AGUARDANDO_CONFIRMACAO ──────────────── */
test('16. WhatsApp respeitando aguardando_confirmacao: não cria OS autônoma em caso de reincidência', async () => {
  const dataHoje = '2026-09-10';
  const state = {
    veiculos: [{ id: 'v_zap', placa: 'WPP1234', km: 210000, cli: 'c_zap' }],
    clientes: [{ id: 'c_zap', nome: 'Transportes WhatsApp' }],
    os: [
      {
        id: 'os_antiga_zap',
        num: 501,
        vei: 'v_zap',
        cli: 'c_zap',
        st: 'finalizada',
        abertura: '2026-08-20',
        km: 208000,
        queixa: 'Troca de pastilhas de freio',
        servicos: [{ id: 's_z', nome: 'Pastilhas de freio', qtd: 1, valor: 450 }],
        pecas: []
      }
    ],
    preOS: [],
    intakeSessions: [],
    auditoria: []
  };

  // Entrada simulada por WhatsApp com reincidência
  const triagem = preOSEngine.triagemEntrada({
    tenantId: 'tenant_alfa',
    vehicleId: 'v_zap',
    placa: 'WPP1234',
    clienteId: 'c_zap',
    kmAtual: 210000,
    reclamacao: 'Freio chiando e com barulho alto',
    origem: 'whatsapp',
    actorId: '5562999999999',
    state,
    dataReferencia: dataHoje
  });

  assert.equal(triagem.resumoContexto.nivelAtencao, 'alto');
  assert.equal(triagem.preOS.status, 'aguardando_confirmacao');
  assert.equal(state.os.length, 1, 'Não deve adicionar nova OS em state.os');
});

/* ── 17. VOZ RESPEITANDO AGUARDANDO_CONFIRMACAO ──────────────────── */
test('17. Voz respeitando aguardando_confirmacao: pausa com token de confirmação criptográfico', async () => {
  const dataHoje = '2026-09-10';
  const state = {
    veiculos: [{ id: 'v_voz', placa: 'VOZ1234', km: 115000, cli: 'c_voz' }],
    clientes: [{ id: 'c_voz', nome: 'Transportes Voz' }],
    os: [
      {
        id: 'os_antiga_voz',
        num: 601,
        vei: 'v_voz',
        cli: 'c_voz',
        st: 'finalizada',
        abertura: '2026-08-25',
        km: 110000,
        queixa: 'Troca de buchas de eixo dianteiro',
        servicos: [{ id: 's_v', nome: 'Buchas de eixo dianteiro', qtd: 1, valor: 700 }],
        pecas: []
      }
    ],
    preOS: [],
    intakeSessions: [],
    auditoria: []
  };

  const execVoz = await voiceActionEngine.executarAcao({
    interpretado: {
      intencao: 'abrir_os',
      risco: 'baixo',
      veiculo: { placa: 'VOZ1234', km: 115000 },
      cliente: { nome: 'Transportes Voz' },
      os: { reclamacoes: ['Troca de buchas de eixo dianteiro com folga'] }
    },
    input: { text: 'Chegou o caminhão VOZ1234 com folga nas buchas de eixo dianteiro com 115 mil km' },
    context: { tenantId: 'tenant_alfa', canal: 'voz', actorId: 'operador_voz', role: 'atendente', permissions: ['os:read', 'os:write'] },
    state
  });

  assert.equal(execVoz.ok, true);
  assert.equal(execVoz.pendenteConfirmacao, true);
  assert.ok(execVoz.token, 'Deve retornar token seguro de confirmação');
  assert.equal(execVoz.acao, 'converter_pre_os');
  assert.equal(state.os.length, 1, 'Voz não deve gerar nova OS sem confirmação quando houver reincidência');
});

/* ── 18. WEB/API RESPEITANDO AGUARDANDO_CONFIRMACAO ──────────────── */
test('18. Web/API respeitando aguardando_confirmacao em /api/os/entrada e isolamento em /api/intake', async () => {
  const serverNet = net.createServer();
  await new Promise(r => serverNet.listen(0, r));
  const port = serverNet.address().port;
  await new Promise(r => serverNet.close(r));

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'patio_intake_e2e_'));
  const dbPath = path.join(tempDir, 'test_intake_e2e.db');
  const uploadDir = path.join(tempDir, 'uploads');
  fs.mkdirSync(uploadDir, { recursive: true });
  const root = path.resolve(__dirname, '..');
  let child;

  async function startServer() {
    child = spawn(process.execPath, ['server.js'], {
      cwd: root,
      windowsHide: true,
      env: {
        ...process.env,
        PORT: String(port),
        API_KEY: 'test-intake-api-key',
        AUTH_USER: 'patio',
        AUTH_PASSWORD: 'patio-password-test',
        DISABLE_INTEGRATIONS: 'true',
        DB_PATH: dbPath,
        UPLOAD_DIR: uploadDir
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

  await startServer();

  try {
    const headersAlfa = { 'x-api-key': 'test-intake-api-key', 'x-tenant-id': 'oficina_alfa', 'Content-Type': 'application/json' };
    const headersBeta = { 'x-api-key': 'test-intake-api-key', 'x-tenant-id': 'oficina_beta', 'Content-Type': 'application/json' };

    // Inicializa estado de alfa com veículo e OS prévia recente
    await fetch(`http://127.0.0.1:${port}/api/estado`, {
      method: 'POST',
      headers: headersAlfa,
      body: JSON.stringify({
        veiculos: [{ id: 'v_api_1', placa: 'API1234', km: 100000, cli: 'c_api' }],
        clientes: [{ id: 'c_api', nome: 'Cliente API' }],
        os: [
          {
            id: 'os_antiga_api',
            num: 333,
            vei: 'v_api_1',
            cli: 'c_api',
            st: 'finalizada',
            abertura: new Date().toISOString().slice(0, 10),
            km: 98000,
            queixa: 'Troca de pastilha de freio',
            servicos: [{ id: 's_api', nome: 'Pastilhas de freio', qtd: 1, valor: 400 }],
            pecas: []
          }
        ]
      })
    });

    // Chamada à rota de entrada veicular
    const resEntrada = await fetch(`http://127.0.0.1:${port}/api/os/entrada`, {
      method: 'POST',
      headers: headersAlfa,
      body: JSON.stringify({
        placa: 'API1234',
        km: 100000,
        textoOriginal: 'Barulho no freio ao desacelerar'
      })
    });

    assert.equal(resEntrada.status, 200);
    const entradaData = await resEntrada.json();
    assert.equal(entradaData.pendenteConfirmacao, true, 'Deve pausar para confirmação em caso de reincidência');
    assert.ok(entradaData.preOSId);

    /* ── 19. TENANT A INCAPAZ DE ACESSAR SESSÃO DO TENANT B ───────── */
    // Cria sessão no Tenant Alfa via /api/intake/iniciar
    const resIntakeAlfa = await fetch(`http://127.0.0.1:${port}/api/intake/iniciar`, {
      method: 'POST',
      headers: headersAlfa,
      body: JSON.stringify({
        placa: 'API1234',
        kmAtual: 100000,
        reclamacao: 'Barulho na embreagem'
      })
    });

    assert.equal(resIntakeAlfa.status, 200);
    const intakeAlfaData = await resIntakeAlfa.json();
    const sessionIdAlfa = intakeAlfaData.session.id;

    // Tenant Beta tenta consultar a sessão do Tenant Alfa (deve receber 404)
    const resConsultaInvasor = await fetch(`http://127.0.0.1:${port}/api/intake/sessao/${sessionIdAlfa}`, {
      method: 'GET',
      headers: headersBeta
    });
    assert.equal(resConsultaInvasor.status, 404, 'Tenant Beta não pode acessar sessão do Tenant Alfa');

    // Tenant Beta tenta confirmar a sessão do Tenant Alfa (deve receber 404)
    const resConfirmarInvasor = await fetch(`http://127.0.0.1:${port}/api/intake/sessao/${sessionIdAlfa}/confirmar`, {
      method: 'POST',
      headers: headersBeta,
      body: JSON.stringify({ boxId: 'b1' })
    });
    assert.equal(resConfirmarInvasor.status, 404);

    // Tenant Alfa consulta com sucesso
    const resConsultaLegitima = await fetch(`http://127.0.0.1:${port}/api/intake/sessao/${sessionIdAlfa}`, {
      method: 'GET',
      headers: headersAlfa
    });
    assert.equal(resConsultaLegitima.status, 200);
  } finally {
    await stopServer();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

/* ── 19. TENANT A INCAPAZ DE ACESSAR SESSÃO DO TENANT B ───────── */
test('19. Isolamento Multi-Tenant estrito: Tenant B incapaz de acessar, responder ou confirmar sessão do Tenant A', () => {
  const stateA = {
    veiculos: [{ id: 'v_a', placa: 'AAA0001', km: 100000 }],
    os: [],
    preOS: [],
    intakeSessions: [],
    auditoria: []
  };
  const stateB = {
    veiculos: [{ id: 'v_b', placa: 'BBB0002', km: 200000 }],
    os: [],
    preOS: [],
    intakeSessions: [],
    auditoria: []
  };

  const resA = technicalIntakeEngine.iniciarIntake({
    tenantId: 'tenant_alfa',
    actorId: 'op_a',
    channel: 'web',
    placa: 'AAA0001',
    kmAtual: 100000,
    reclamacao: 'Barulho no câmbio',
    state: stateA
  });

  const sessionAId = resA.session.id;

  // Tenant B tenta localizar a sessão de A
  const buscaB = technicalIntakeEngine.localizarSessaoAtiva({
    tenantId: 'tenant_beta',
    sessionId: sessionAId,
    state: stateB
  });
  assert.equal(buscaB, null, 'Tenant B não pode localizar sessão ativa do Tenant A');

  // Tenant B tenta responder à sessão de A no seu próprio estado
  const respB = technicalIntakeEngine.responderPergunta({
    tenantId: 'tenant_beta',
    sessionId: sessionAId,
    resposta: 'está roncando forte',
    state: stateB,
    actorId: 'op_b'
  });
  assert.equal(respB.ok, false);
  assert.equal(respB.status, 404);

  // Tenant B tenta confirmar a sessão de A
  const confB = technicalIntakeEngine.confirmarIntake({
    tenantId: 'tenant_beta',
    sessionId: sessionAId,
    state: stateB,
    actorId: 'op_b'
  });
  assert.equal(confB.ok, false);
  assert.equal(confB.status, 404);

  // Tenant B tenta cancelar a sessão de A
  const cancB = technicalIntakeEngine.cancelarIntake({
    tenantId: 'tenant_beta',
    sessionId: sessionAId,
    state: stateB,
    actorId: 'op_b'
  });
  assert.equal(cancB.ok, false);
  assert.equal(cancB.status, 404);
});

/* ── 20. REGRESSÃO COMPLETA E NÃO-AUTONOMIA DO DIAGNÓSTICO ───────── */
test('20. Regressão e não-autonomia: perguntas técnicas não fecham diagnóstico sem inspeção física', () => {
  const dominios = [
    'SUSPENSAO', 'FREIOS', 'DIRECAO', 'TRANSMISSAO', 'VAZAMENTO',
    'ESTRUTURAL', 'MOTOR', 'PNEUS', 'ELETRICA', 'OUTROS'
  ];

  for (const dom of dominios) {
    const q = intakeQuestionEngine.determinarProximaPergunta({
      categoria: dom,
      reclamacaoOriginal: 'Verificar ruído e vibração',
      collected: { kmAtual: 100000 },
      answeredQuestions: []
    });

    if (q) {
      assert.ok(q.texto, `Pergunta deve ter texto para domínio ${dom}`);
      assert.doesNotMatch(q.texto, /defeito constatado|diagnóstico definitivo|peça condenada/i);
    }
  }
});
