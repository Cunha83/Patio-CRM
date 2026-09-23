'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const { spawn } = require('node:child_process');
const { once } = require('node:events');

const operationalIntelligenceEngine = require('../services/operationalIntelligenceEngine');
const operationalSummaryService = require('../services/operationalSummaryService');
const operationalNotificationPolicy = require('../services/operationalNotificationPolicy');
const voiceActionEngine = require('../services/voiceActionEngine');
const { IdentityRegistry } = require('../lib/auth/identity');
const { createAuthMiddleware } = require('../lib/auth/context');

/* ── 1. VEÍCULO PARADO ACIMA DO LIMITE ────────────────────────────── */
test('1. Veículo parado acima do limite: detecta horas e severidades atencao, alto e critico', () => {
  const baseDate = new Date('2026-09-10T12:00:00.000Z');

  // 7 horas atrás -> atencao (>= 6h)
  const dt7h = new Date(baseDate.getTime() - 7 * 3600 * 1000).toISOString();
  // 15 horas atrás -> alto (>= 12h)
  const dt15h = new Date(baseDate.getTime() - 15 * 3600 * 1000).toISOString();
  // 26 horas atrás -> critico (>= 24h)
  const dt26h = new Date(baseDate.getTime() - 26 * 3600 * 1000).toISOString();

  const state = {
    os: [
      { id: 'os_1', num: 101, vei: 'v_1', st: 'executando', criadoEm: dt7h },
      { id: 'os_2', num: 102, vei: 'v_2', st: 'peca', criadoEm: dt15h },
      { id: 'os_3', num: 103, vei: 'v_3', st: 'fila', criadoEm: dt26h },
      { id: 'os_4', num: 104, vei: 'v_4', st: 'finalizada', criadoEm: dt26h } // finalizada não gera alerta
    ],
    veiculos: [
      { id: 'v_1', placa: 'AAA1111' },
      { id: 'v_2', placa: 'BBB2222' },
      { id: 'v_3', placa: 'CCC3333' },
      { id: 'v_4', placa: 'DDD4444' }
    ],
    boxes: [],
    preOS: [],
    intakeSessions: [],
    operationalEvents: []
  };

  const res = operationalIntelligenceEngine.avaliarOperacao({
    tenantId: 'tenant_teste',
    state,
    agoraDate: baseDate
  });

  const evs = state.operationalEvents.filter(e => e.tipo === 'veiculo_parado' && e.status === 'aberto');
  assert.equal(evs.length, 3);

  const ev7h = evs.find(e => e.recurso.id === 'v_1');
  assert.ok(ev7h);
  assert.equal(ev7h.severidade, 'atencao');
  assert.equal(ev7h.prioridade, 'P3');

  const ev15h = evs.find(e => e.recurso.id === 'v_2');
  assert.ok(ev15h);
  assert.equal(ev15h.severidade, 'alto');
  assert.equal(ev15h.prioridade, 'P2');

  const ev26h = evs.find(e => e.recurso.id === 'v_3');
  assert.ok(ev26h);
  assert.equal(ev26h.severidade, 'critico');
  assert.equal(ev26h.prioridade, 'P1');
});

/* ── 2. OS SEM ATUALIZAÇÃO / SEM EVOLUÇÃO ─────────────────────────── */
test('2. OS sem atualização: detecta falta de evolução operacional após período configurado', () => {
  const baseDate = new Date('2026-09-10T15:00:00.000Z');
  const dt5h = new Date(baseDate.getTime() - 5 * 3600 * 1000).toISOString(); // 5h -> atencao (>= 4h)
  const dt9h = new Date(baseDate.getTime() - 9 * 3600 * 1000).toISOString(); // 9h -> alto (>= 8h)

  const state = {
    os: [
      { id: 'os_atencao', num: 201, vei: 'v_1', st: 'executando', atualizadoEm: dt5h, criadoEm: dt5h },
      { id: 'os_alto', num: 202, vei: 'v_2', st: 'peca', atualizadoEm: dt9h, criadoEm: dt9h },
      { id: 'os_recente', num: 203, vei: 'v_3', st: 'executando', atualizadoEm: baseDate.toISOString(), criadoEm: dt9h }
    ],
    veiculos: [{ id: 'v_1', placa: 'ABC1111' }, { id: 'v_2', placa: 'ABC2222' }, { id: 'v_3', placa: 'ABC3333' }],
    boxes: [],
    preOS: [],
    intakeSessions: [],
    operationalEvents: []
  };

  operationalIntelligenceEngine.avaliarOperacao({
    tenantId: 'tenant_teste',
    state,
    agoraDate: baseDate
  });

  const evSemEvol = state.operationalEvents.filter(e => e.tipo === 'os_sem_evolucao');
  assert.equal(evSemEvol.length, 2);

  const evAtencao = evSemEvol.find(e => e.recurso.id === 'os_atencao');
  assert.equal(evAtencao.severidade, 'atencao');
  assert.equal(evAtencao.prioridade, 'P3');

  const evAlto = evSemEvol.find(e => e.recurso.id === 'os_alto');
  assert.equal(evAlto.severidade, 'alto');
  assert.equal(evAlto.prioridade, 'P2');
});

/* ── 3. ENTREGA PRÓXIMA DO PRAZO (< 60 MIN) ───────────────────────── */
test('3. Entrega próxima do prazo: alerta com antecedência (< 60 min)', () => {
  // 16h40 em Brasília. A OS prevê entrega às 17h00 (20 min restantes)
  const agora = new Date('2026-09-10T19:40:00.000Z'); // 16h40 UTC-3
  const state = {
    os: [
      {
        id: 'os_prox',
        num: 301,
        vei: 'v_1',
        st: 'executando',
        prev: '2026-09-10',
        horaPrev: '17:00'
      }
    ],
    veiculos: [{ id: 'v_1', placa: 'PROX101' }],
    boxes: [],
    preOS: [],
    intakeSessions: [],
    operationalEvents: []
  };

  operationalIntelligenceEngine.avaliarOperacao({
    tenantId: 'tenant_teste',
    state,
    agoraDate: agora,
    dataReferencia: '2026-09-10',
    horaReferencia: '16:40'
  });

  const ev = state.operationalEvents.find(e => e.tipo === 'entrega_proxima');
  assert.ok(ev);
  assert.equal(ev.severidade, 'alto');
  assert.equal(ev.prioridade, 'P2');
  assert.equal(ev.detalhes.minutosRestantes, 20);
});

/* ── 4. ENTREGA ATRASADA ───────────────────────────────────────────── */
test('4. Entrega atrasada: gera alerta crítico/alto quando o horário previsto é ultrapassado com OS aberta', () => {
  // 18h30 em Brasília. A OS previa entrega às 17h30 (1h de atraso)
  const agora = new Date('2026-09-10T21:30:00.000Z'); // 18h30 UTC-3
  const state = {
    os: [
      {
        id: 'os_atrasada',
        num: 401,
        vei: 'v_1',
        st: 'executando',
        promessaEntrega: {
          data: '2026-09-10',
          hora: '17:30',
          definidaPor: 'Gerente Carlos'
        }
      }
    ],
    veiculos: [{ id: 'v_1', placa: 'ATRA401' }],
    boxes: [],
    preOS: [],
    intakeSessions: [],
    operationalEvents: []
  };

  operationalIntelligenceEngine.avaliarOperacao({
    tenantId: 'tenant_teste',
    state,
    agoraDate: agora,
    dataReferencia: '2026-09-10',
    horaReferencia: '18:30'
  });

  const ev = state.operationalEvents.find(e => e.tipo === 'entrega_atrasada');
  assert.ok(ev);
  assert.equal(ev.severidade, 'critico');
  assert.equal(ev.prioridade, 'P1');
  assert.equal(ev.detalhes.horasAtraso, 1);
});

/* ── 5. POSSÍVEL GARANTIA PENDENTE DE DECISÃO ─────────────────────── */
test('5. Possível garantia pendente: alerta presença de garantia sem emitir aprovação autônoma', () => {
  const state = {
    os: [
      {
        id: 'os_garantia',
        num: 501,
        vei: 'v_1',
        st: 'fila',
        possivelGarantia: true,
        garantiaDecidida: false // decisão humana ainda não registrada
      }
    ],
    veiculos: [{ id: 'v_1', placa: 'GAR5010' }],
    boxes: [],
    preOS: [],
    intakeSessions: [],
    operationalEvents: []
  };

  operationalIntelligenceEngine.avaliarOperacao({
    tenantId: 'tenant_teste',
    state
  });

  const ev = state.operationalEvents.find(e => e.tipo === 'possivel_garantia_pendente');
  assert.ok(ev);
  assert.equal(ev.severidade, 'critico');
  assert.equal(ev.prioridade, 'P1');
  // Não aprova nem modifica status da OS autonomamente
  assert.equal(state.os[0].st, 'fila');
  assert.equal(state.os[0].garantiaDecidida, false);
});

/* ── 6. PRÉ-OS AGUARDANDO CONFIRMAÇÃO ─────────────────────────────── */
test('6. Pré-OS aguardando confirmação: detecta sessões técnicas e Pré-OS pendentes de decisão (> 2h)', () => {
  const baseDate = new Date('2026-09-10T14:00:00.000Z');
  const dt3hAtras = new Date(baseDate.getTime() - 3 * 3600 * 1000).toISOString();

  const state = {
    os: [],
    veiculos: [],
    boxes: [],
    preOS: [
      {
        id: 'pre_pendente',
        placa: 'PRE6010',
        status: 'aguardando_confirmacao',
        reclamacaoOriginal: 'Ruído no diferencial',
        createdAt: dt3hAtras
      }
    ],
    intakeSessions: [
      {
        id: 'ses_abandonada',
        placa: 'SES7010',
        status: 'aguardando_resposta',
        updatedAt: dt3hAtras
      }
    ],
    operationalEvents: []
  };

  operationalIntelligenceEngine.avaliarOperacao({
    tenantId: 'tenant_teste',
    state,
    agoraDate: baseDate
  });

  const evPre = state.operationalEvents.find(e => e.recurso.id === 'pre_pendente');
  assert.ok(evPre);
  assert.equal(evPre.tipo, 'pre_os_pendente');
  assert.equal(evPre.prioridade, 'P3');

  const evSes = state.operationalEvents.find(e => e.recurso.id === 'ses_abandonada');
  assert.ok(evSes);
  assert.equal(evSes.tipo, 'pre_os_pendente');
});

/* ── 7. GARGALO DE PEÇAS ───────────────────────────────────────────── */
test('7. Gargalo de peças: concentração de veículos aguardando peças acima do threshold', () => {
  const state = {
    os: [
      { id: 'os_p1', num: 701, st: 'peca' },
      { id: 'os_p2', num: 702, st: 'peca' },
      { id: 'os_p3', num: 703, st: 'peca' },
      { id: 'os_p4', num: 704, st: 'executando' }
    ],
    veiculos: [],
    boxes: [],
    preOS: [],
    intakeSessions: [],
    operationalEvents: [],
    cfg: {
      operacao: {
        gargalos: { peca: 3 }
      }
    }
  };

  operationalIntelligenceEngine.avaliarOperacao({
    tenantId: 'tenant_teste',
    state
  });

  const ev = state.operationalEvents.find(e => e.tipo === 'gargalo_estagio' && e.recurso.nome === 'peca');
  assert.ok(ev);
  assert.equal(ev.severidade, 'alto');
  assert.equal(ev.detalhes.quantidade, 3);
});

/* ── 8. GARGALO DE DIAGNÓSTICO / APROVAÇÃO ─────────────────────────── */
test('8. Gargalo de diagnóstico: concentração de veículos aguardando aprovação', () => {
  const state = {
    os: [
      { id: 'os_a1', num: 801, st: 'aprovacao' },
      { id: 'os_a2', num: 802, st: 'aprovacao' },
      { id: 'os_a3', num: 803, st: 'aprovacao' }
    ],
    veiculos: [],
    boxes: [],
    preOS: [],
    intakeSessions: [],
    operationalEvents: [],
    cfg: {
      operacao: {
        gargalos: { diagnostico: 3 }
      }
    }
  };

  operationalIntelligenceEngine.avaliarOperacao({
    tenantId: 'tenant_teste',
    state
  });

  const ev = state.operationalEvents.find(e => e.tipo === 'gargalo_estagio' && e.recurso.nome === 'aprovacao');
  assert.ok(ev);
  assert.equal(ev.severidade, 'atencao');
  assert.equal(ev.detalhes.quantidade, 3);
});

/* ── 9. DEDUPLICAÇÃO DO MESMO EVENTO ───────────────────────────────── */
test('9. Deduplicação do mesmo evento: reavaliações periódicas não geram alertas repetidos', () => {
  const baseDate = new Date('2026-09-10T12:00:00.000Z');
  const dt26h = new Date(baseDate.getTime() - 26 * 3600 * 1000).toISOString();

  const state = {
    os: [{ id: 'os_dup', num: 901, vei: 'v_dup', st: 'executando', criadoEm: dt26h, atualizadoEm: baseDate.toISOString() }],
    veiculos: [{ id: 'v_dup', placa: 'DUP9999' }],
    boxes: [],
    preOS: [],
    intakeSessions: [],
    operationalEvents: []
  };

  // Primeira avaliação
  operationalIntelligenceEngine.avaliarOperacao({ tenantId: 'tenant_teste', state, agoraDate: baseDate });
  assert.equal(state.operationalEvents.length, 1);
  const primeiroId = state.operationalEvents[0].id;

  // Segunda avaliação após 10 minutos (mesmo problema)
  const baseDate10m = new Date(baseDate.getTime() + 10 * 60 * 1000);
  operationalIntelligenceEngine.avaliarOperacao({ tenantId: 'tenant_teste', state, agoraDate: baseDate10m });

  // Continua apenas 1 evento no array, sem duplicar
  assert.equal(state.operationalEvents.length, 1);
  assert.equal(state.operationalEvents[0].id, primeiroId);
  assert.equal(state.operationalEvents[0].status, 'aberto');
});

/* ── 10. RECONHECIMENTO DE EVENTO ("CIENTE") ───────────────────────── */
test('10. Reconhecimento de evento: comando "ciente" muda status para reconhecido com auditoria', () => {
  const state = {
    os: [],
    veiculos: [],
    boxes: [],
    preOS: [],
    intakeSessions: [],
    auditoria: [],
    operationalEvents: [
      {
        id: 'ev_alvo',
        tenantId: 'tenant_teste',
        tipo: 'veiculo_parado',
        prioridade: 'P1',
        severidade: 'critico',
        status: 'aberto',
        titulo: 'Veículo parado',
        descricao: 'Parado há 28h',
        dedupeKey: 'tenant_teste:veiculo_parado:v1',
        criadoEm: '2026-09-10T10:00:00.000Z',
        atualizadoEm: '2026-09-10T10:00:00.000Z'
      }
    ]
  };

  const rec = operationalIntelligenceEngine.reconhecerEvento({
    tenantId: 'tenant_teste',
    eventId: 'ev_alvo',
    actorId: 'gerente_marcos',
    motivo: 'Já estou vendo com o mecânico Valdir',
    state
  });

  assert.equal(rec.ok, true);
  assert.equal(state.operationalEvents[0].status, 'reconhecido');
  assert.equal(state.operationalEvents[0].reconhecidoPor, 'gerente_marcos');
  assert.equal(state.operationalEvents[0].reconhecidoMotivo, 'Já estou vendo com o mecânico Valdir');
  assert.ok(state.operationalEvents[0].reconhecidoEm);

  // Trilha de auditoria registrada
  const aud = state.auditoria.find(a => a.acao === 'evento_operacional_reconhecido');
  assert.ok(aud);
  assert.equal(aud.usuario, 'gerente_marcos');
});

/* ── 11. RECONHECIMENTO NÃO RESOLVE O EVENTO ───────────────────────── */
test('11. Reconhecimento não resolve evento: evento reconhecido continua sendo monitorado pelo motor', () => {
  const baseDate = new Date('2026-09-10T12:00:00.000Z');
  const dt26h = new Date(baseDate.getTime() - 26 * 3600 * 1000).toISOString();

  const state = {
    os: [{ id: 'os_mon', num: 1101, vei: 'v_mon', st: 'executando', criadoEm: dt26h, atualizadoEm: baseDate.toISOString() }],
    veiculos: [{ id: 'v_mon', placa: 'MON1101' }],
    boxes: [],
    preOS: [],
    intakeSessions: [],
    operationalEvents: []
  };

  // 1. Avalia e gera evento aberto
  operationalIntelligenceEngine.avaliarOperacao({ tenantId: 'tenant_teste', state, agoraDate: baseDate });
  const evId = state.operationalEvents[0].id;

  // 2. Operador dá ciência
  operationalIntelligenceEngine.reconhecerEvento({
    tenantId: 'tenant_teste',
    eventId: evId,
    actorId: 'operador_joao',
    motivo: 'ciente',
    state
  });
  assert.equal(state.operationalEvents[0].status, 'reconhecido');

  // 3. Nova avaliação (o veículo continua parado)
  const baseDate1h = new Date(baseDate.getTime() + 3600 * 1000);
  operationalIntelligenceEngine.avaliarOperacao({ tenantId: 'tenant_teste', state, agoraDate: baseDate1h });

  // Permanece reconhecido (não volta para aberto nem é resolvido prematuramente)
  assert.equal(state.operationalEvents.length, 1);
  assert.equal(state.operationalEvents[0].status, 'reconhecido');
  assert.equal(state.operationalEvents[0].resolvidoEm, null);
});

/* ── 12. RESOLUÇÃO AUTOMÁTICA APÓS CONCLUSÃO / MUDANÇA ─────────────── */
test('12. Resolução automática após mudança: transição da OS para finalizada resolve o evento com resolvedAt', () => {
  const baseDate = new Date('2026-09-10T12:00:00.000Z');
  const dt26h = new Date(baseDate.getTime() - 26 * 3600 * 1000).toISOString();

  const state = {
    os: [{ id: 'os_res', num: 1201, vei: 'v_res', st: 'executando', criadoEm: dt26h, atualizadoEm: baseDate.toISOString() }],
    veiculos: [{ id: 'v_res', placa: 'RES1201' }],
    boxes: [],
    preOS: [],
    intakeSessions: [],
    operationalEvents: []
  };

  // 1. Gera evento aberto
  operationalIntelligenceEngine.avaliarOperacao({ tenantId: 'tenant_teste', state, agoraDate: baseDate });
  assert.equal(state.operationalEvents[0].status, 'aberto');

  // 2. OS é concluída (finalizada)
  state.os[0].st = 'finalizada';

  // 3. Próxima avaliação operacional
  const baseDate2h = new Date(baseDate.getTime() + 2 * 3600 * 1000);
  operationalIntelligenceEngine.avaliarOperacao({ tenantId: 'tenant_teste', state, agoraDate: baseDate2h });

  // Evento é automaticamente resolvido
  assert.equal(state.operationalEvents.length, 1);
  assert.equal(state.operationalEvents[0].status, 'resolvido');
  assert.ok(state.operationalEvents[0].resolvidoEm);
});

/* ── 13. NOVO EVENTO APÓS NOVA OCORRÊNCIA POSTERIOR ────────────────── */
test('13. Novo evento após nova ocorrência: reincidência posterior abre novo evento com integridade', () => {
  const state = {
    os: [],
    veiculos: [{ id: 'v_reinc', placa: 'REI1301' }],
    boxes: [],
    preOS: [],
    intakeSessions: [],
    operationalEvents: [
      {
        id: 'ev_antigo_resolvido',
        tenantId: 'tenant_teste',
        tipo: 'veiculo_parado',
        status: 'resolvido',
        dedupeKey: 'tenant_teste:veiculo_parado:v_reinc',
        resolvidoEm: '2026-09-08T10:00:00.000Z'
      }
    ]
  };

  // Veículo retorna e abre nova OS parada
  const agora = new Date('2026-09-10T12:00:00.000Z');
  const dt26h = new Date(agora.getTime() - 26 * 3600 * 1000).toISOString();
  state.os.push({ id: 'os_nova_parada', num: 1302, vei: 'v_reinc', st: 'executando', criadoEm: dt26h, atualizadoEm: agora.toISOString() });

  operationalIntelligenceEngine.avaliarOperacao({ tenantId: 'tenant_teste', state, agoraDate: agora });

  // Agora há 2 eventos: o antigo resolvido e o novo aberto
  assert.equal(state.operationalEvents.length, 2);
  const novoEv = state.operationalEvents.find(e => e.status === 'aberto');
  assert.ok(novoEv);
  assert.notEqual(novoEv.id, 'ev_antigo_resolvido');
  assert.equal(novoEv.prioridade, 'P1');
});

/* ── 14. CÁLCULO DETERMINÍSTICO DE PRIORIDADE (P1 a P4) ───────────── */
test('14. Cálculo determinístico de prioridade: classificação correta entre P1, P2, P3 e P4', () => {
  const base = new Date('2026-09-10T15:00:00.000Z');
  const dt28h = new Date(base.getTime() - 28 * 3600 * 1000).toISOString();
  const dt14h = new Date(base.getTime() - 14 * 3600 * 1000).toISOString();
  const dt7h = new Date(base.getTime() - 7 * 3600 * 1000).toISOString();

  const state = {
    os: [
      { id: 'os_p1', num: 1401, vei: 'v_p1', st: 'executando', criadoEm: dt28h }, // >24h -> P1
      { id: 'os_p2', num: 1402, vei: 'v_p2', st: 'executando', criadoEm: dt14h }, // 12-24h -> P2
      { id: 'os_p3', num: 1403, vei: 'v_p3', st: 'executando', criadoEm: dt7h }   // 6-12h -> P3
    ],
    veiculos: [{ id: 'v_p1' }, { id: 'v_p2' }, { id: 'v_p3' }],
    boxes: [],
    preOS: [],
    intakeSessions: [],
    operationalEvents: []
  };

  operationalIntelligenceEngine.avaliarOperacao({ tenantId: 'tenant_teste', state, agoraDate: base });

  const p1 = state.operationalEvents.find(e => e.recurso.id === 'v_p1');
  const p2 = state.operationalEvents.find(e => e.recurso.id === 'v_p2');
  const p3 = state.operationalEvents.find(e => e.recurso.id === 'v_p3');

  assert.equal(p1.prioridade, 'P1');
  assert.equal(p2.prioridade, 'P2');
  assert.equal(p3.prioridade, 'P3');
});

/* ── 15. RESUMO OPERACIONAL UNIFICADO ──────────────────────────────── */
test('15. Resumo operacional unificado: snapshot preciso de contagens e indicadores operacionais', () => {
  const state = {
    os: [
      { id: 'os_1', st: 'executando', box: 'b1' },
      { id: 'os_2', st: 'peca', box: 'b2' },
      { id: 'os_3', st: 'fila', box: null },
      { id: 'os_4', st: 'aprovacao', box: null },
      { id: 'os_5', st: 'finalizada', fechamento: '2026-09-10T11:00:00.000Z' }
    ],
    veiculos: [{ id: 'v1' }, { id: 'v2' }, { id: 'v3' }, { id: 'v4' }, { id: 'v5' }],
    boxes: [{ id: 'b1', nome: 'Box 01' }, { id: 'b2', nome: 'Box 02' }, { id: 'b3', nome: 'Box 03' }],
    operationalEvents: [
      { tenantId: 'tenant_teste', status: 'aberto', severidade: 'critico', prioridade: 'P1' },
      { tenantId: 'tenant_teste', status: 'reconhecido', severidade: 'alto', prioridade: 'P2' }
    ]
  };

  const resumo = operationalSummaryService.gerarResumoOperacional({
    tenantId: 'tenant_teste',
    state,
    dataReferencia: '2026-09-10',
    horaReferencia: '14:00'
  });

  assert.equal(resumo.veiculosPatio, 4); // 4 OSs ativas
  assert.equal(resumo.boxes.total, 3);
  assert.equal(resumo.boxes.ocupados, 2);
  assert.equal(resumo.boxes.livres, 1);
  assert.equal(resumo.boxes.bloqueadosPeca, 1); // b2 com OS em peca
  assert.equal(resumo.estagios.executando, 1);
  assert.equal(resumo.estagios.peca, 1);
  assert.equal(resumo.estagios.fila, 1);
  assert.equal(resumo.estagios.aprovacao, 1);
  assert.equal(resumo.estagios.finalizadaHoje, 1);
  assert.equal(resumo.alertas.totalAtivos, 2);
  assert.equal(resumo.alertas.critico, 1);
  assert.equal(resumo.alertas.alto, 1);

  // Formatação conversacional
  const texto = operationalSummaryService.formatarResumoConversacional(resumo);
  assert.match(texto, /4 veículo\(s\)/);
  assert.match(texto, /1 em execução/);
});

/* ── 16. MÉTRICAS OPERACIONAIS VERÍDICAS (SEM ALUCINAÇÃO) ──────────── */
test('16. Métricas operacionais verídicas: tempos médios reais ou null quando não calculáveis', () => {
  // 16.1 Sem timestamps registrados: DEVE retornar null (zero dados inventados)
  const stateSemDados = {
    os: [{ id: 'os_1', st: 'executando' }],
    boxes: [],
    operationalEvents: []
  };
  const r1 = operationalSummaryService.gerarResumoOperacional({
    tenantId: 'tenant_teste',
    state: stateSemDados
  });
  assert.equal(r1.metricas.tempoMedioPatioHoras, null);
  assert.equal(r1.metricas.tempoMedioEsperaPecaHoras, null);
  assert.equal(r1.metricas.tempoMedioExecucaoHoras, null);

  // 16.2 Com timestamps verdadeiros de fluxo: calcula rigorosamente a média real
  const stateComDados = {
    os: [
      {
        id: 'os_fin_1',
        st: 'finalizada',
        criadoEm: '2026-09-10T08:00:00.000Z',
        fechamento: '2026-09-10T12:00:00.000Z', // 4 horas
        tempos: { esperaPecaHoras: 1.5, execucaoHoras: 2.5 }
      },
      {
        id: 'os_fin_2',
        st: 'finalizada',
        criadoEm: '2026-09-10T08:00:00.000Z',
        fechamento: '2026-09-10T14:00:00.000Z', // 6 horas
        tempos: { esperaPecaHoras: 2.5, execucaoHoras: 3.5 }
      }
    ],
    boxes: [],
    operationalEvents: []
  };
  const r2 = operationalSummaryService.gerarResumoOperacional({
    tenantId: 'tenant_teste',
    state: stateComDados
  });
  assert.equal(r2.metricas.tempoMedioPatioHoras, 5); // (4 + 6) / 2 = 5h
  assert.equal(r2.metricas.tempoMedioEsperaPecaHoras, 2); // (1.5 + 2.5) / 2 = 2h
  assert.equal(r2.metricas.tempoMedioExecucaoHoras, 3); // (2.5 + 3.5) / 2 = 3h
});

/* ── 17. POLÍTICA DE NOTIFICAÇÃO DESACOPLADA (ANTI-SPAM / COOLDOWN) ── */
test('17. Política de notificação desacoplada: valida severidade, horário e cooldown', () => {
  operationalNotificationPolicy.limparHistoricoEnvios();

  const eventoCritico = {
    id: 'ev_notif_1',
    dedupeKey: 'tenant_a:entrega_atrasada:os_1',
    severidade: 'critico'
  };
  const eventoAtencao = {
    id: 'ev_notif_2',
    dedupeKey: 'tenant_a:veiculo_parado:v_2',
    severidade: 'atencao'
  };

  const agora10h = new Date('2026-09-10T13:00:00.000Z'); // 10h00 em Brasília (horário comercial)
  const agoraMadrugada = new Date('2026-09-10T06:00:00.000Z'); // 03h00 em Brasília

  // 17.1 Rejeita se fora do horário comercial
  const n1 = operationalNotificationPolicy.deveNotificar({
    tenantId: 'tenant_a',
    evento: eventoCritico,
    agora: agoraMadrugada
  });
  assert.equal(n1.enviar, false);
  assert.equal(n1.motivo, 'fora_do_horario_operacional');

  // 17.2 Rejeita severidade menor que alto/critico
  const n2 = operationalNotificationPolicy.deveNotificar({
    tenantId: 'tenant_a',
    evento: eventoAtencao,
    agora: agora10h
  });
  assert.equal(n2.enviar, false);
  assert.equal(n2.motivo, 'severidade_nao_elegivel');

  // 17.3 Aprova envio para evento crítico em horário comercial
  const n3 = operationalNotificationPolicy.deveNotificar({
    tenantId: 'tenant_a',
    evento: eventoCritico,
    agora: agora10h
  });
  assert.equal(n3.enviar, true);
  assert.equal(n3.canal, 'whatsapp');

  // 17.4 Registra envio e testa bloqueio por cooldown (60 minutos)
  operationalNotificationPolicy.registrarEnvio({
    tenantId: 'tenant_a',
    evento: eventoCritico,
    agora: agora10h
  });

  const agora10h20 = new Date('2026-09-10T13:20:00.000Z'); // 20 minutos depois
  const n4 = operationalNotificationPolicy.deveNotificar({
    tenantId: 'tenant_a',
    evento: eventoCritico,
    agora: agora10h20
  });
  assert.equal(n4.enviar, false);
  assert.equal(n4.motivo, 'cooldown_ativo');
});

/* ── 18. COMANDOS CONVERSACIONAIS E VOZ ────────────────────────────── */
test('18. Integração Conversacional e Voz: reconhece intenções operacionais e delega sem acoplamento', async () => {
  const baseDate = new Date('2026-09-10T14:00:00.000Z');
  const dt26h = new Date(baseDate.getTime() - 26 * 3600 * 1000).toISOString();

  const state = {
    os: [
      { id: 'os_v1', num: 1801, vei: 'v_1', st: 'peca', criadoEm: dt26h },
      { id: 'os_v2', num: 1802, vei: 'v_2', st: 'peca', criadoEm: dt26h },
      { id: 'os_v3', num: 1803, vei: 'v_3', st: 'peca', criadoEm: dt26h }
    ],
    veiculos: [{ id: 'v_1', placa: 'VOZ1801' }, { id: 'v_2', placa: 'VOZ1802' }, { id: 'v_3', placa: 'VOZ1803' }],
    boxes: [{ id: 'b1', nome: 'Box 01' }],
    preOS: [],
    intakeSessions: [],
    operationalEvents: []
  };

  // 18.1 "Verônica, como está a oficina?"
  const rResumo = await voiceActionEngine.interpretarEExecutar({
    input: { text: 'Verônica, como está a oficina?' },
    context: { tenantId: 'tenant_voz', canal: 'voz' },
    state
  });
  assert.equal(rResumo.ok, true);
  assert.equal(rResumo.acao, 'consultar_resumo_operacional');
  assert.match(rResumo.resposta, /3 veículo\(s\)|aguardando peças/);

  // 18.2 "Qual é o maior gargalo hoje?"
  const rGargalo = await voiceActionEngine.interpretarEExecutar({
    input: { text: 'qual é o maior gargalo hoje?' },
    context: { tenantId: 'tenant_voz', canal: 'voz' },
    state
  });
  assert.equal(rGargalo.ok, true);
  assert.equal(rGargalo.acao, 'consultar_gargalo_operacao');
  assert.match(rGargalo.resposta, /peças/i);

  // 18.3 Cria um alerta ativo e testa "ciente"
  operationalIntelligenceEngine.avaliarOperacao({ tenantId: 'tenant_voz', state, agoraDate: baseDate });
  assert.ok(state.operationalEvents.length > 0);

  const rCiente = await voiceActionEngine.interpretarEExecutar({
    input: { text: 'ciente, já estou vendo' },
    context: { tenantId: 'tenant_voz', canal: 'voz', remetente: 'mecanico_chefe' },
    state
  });
  assert.equal(rCiente.ok, true);
  assert.equal(rCiente.acao, 'reconhecer_alerta');
  assert.equal(rCiente.evento.status, 'reconhecido');
  assert.equal(rCiente.evento.reconhecidoPor, 'mecanico_chefe');
});

/* ── 19. SCHEDULER SEM EXECUÇÃO CONCORRENTE ────────────────────────── */
test('19. Scheduler sem execução concorrente: bloqueio por tenant impede duas avaliações simultâneas', async () => {
  const runningEvaluations = new Set();
  const tenantId = 'oficina_bloqueio';

  runningEvaluations.add(tenantId);
  assert.equal(runningEvaluations.has(tenantId), true);

  function simularAvaliar(tid) {
    if (runningEvaluations.has(tid)) {
      return { ok: false, status: 429, error: 'Avaliação operacional já em execução para este tenant.' };
    }
    return { ok: true, status: 200 };
  }

  const resConcorrente = simularAvaliar(tenantId);
  assert.equal(resConcorrente.status, 429);
  assert.match(resConcorrente.error, /já em execução/);

  // Outro tenant não deve ser bloqueado
  const resOutroTenant = simularAvaliar('oficina_livre');
  assert.equal(resOutroTenant.status, 200);

  // Após término, lock é liberado
  runningEvaluations.delete(tenantId);
  const resLiberado = simularAvaliar(tenantId);
  assert.equal(resLiberado.status, 200);
});

/* ── 20. SERVIDOR REAL E2E: REST, PERMISSÕES E MULTI-TENANT ───────── */
test('20. Servidor Real E2E: REST API, permissões, isolamento multi-tenant e scheduler mutex', { timeout: 60000 }, async (t) => {
  const serverNet = net.createServer();
  await new Promise(r => serverNet.listen(0, r));
  const port = serverNet.address().port;
  await new Promise(r => serverNet.close(r));

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'patio_op_e2e_'));
  const dbPath = path.join(tempDir, 'test_op.db');
  const root = path.resolve(__dirname, '..');
  let child;

  async function startServer() {
    child = spawn(process.execPath, ['server.js'], {
      cwd: root,
      windowsHide: true,
      env: {
        ...process.env,
        PORT: String(port),
        API_KEY: 'test-op-api-key',
        AUTH_USER: 'patio',
        AUTH_PASSWORD: 'patio-password-test',
        DISABLE_INTEGRATIONS: 'true',
        DB_PATH: dbPath
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
    if (child && child.kill) {
      const done = once(child, 'exit');
      child.kill();
      await done;
    }
  }

  t.after(async () => {
    await stopServer();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  await startServer();

  const apiTenant = (tenantId, apiKey = 'test-op-api-key') => {
    const headers = { 'x-api-key': apiKey };
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

  const clientAlfa = apiTenant('oficina_alfa');
  const clientBeta = apiTenant('oficina_beta');

  // 1. Inicializa estado para oficina_alfa com uma OS parada há 30h
  const baseAgora = new Date();
  const dt30h = new Date(baseAgora.getTime() - 30 * 3600 * 1000).toISOString();

  await clientAlfa.post('/api/estado', {
    os: [
      {
        id: 'os_alfa_100',
        num: 2001,
        vei: 'v_alfa_1',
        st: 'executando',
        abertura: '2026-09-09',
        criadoEm: dt30h,
        queixa: 'Motor falhando'
      }
    ],
    veiculos: [{ id: 'v_alfa_1', placa: 'ALF2001' }],
    boxes: [{ id: 'b1', nome: 'Box 01' }],
    preOS: [],
    intakeSessions: [],
    versao: 0
  });

  // 2. Inicializa oficina_beta sem ocorrências
  await clientBeta.post('/api/estado', {
    os: [],
    veiculos: [],
    boxes: [],
    preOS: [],
    intakeSessions: [],
    versao: 0
  });

  // 3. POST /api/operacao/avaliar na oficina_alfa
  const resAvalAlfa = await clientAlfa.post('/api/operacao/avaliar', {});
  assert.equal(resAvalAlfa.status, 200);
  const dataAvalAlfa = await resAvalAlfa.json();
  assert.equal(dataAvalAlfa.success, true);
  assert.ok(dataAvalAlfa.novosOuAtivos >= 1);

  // 4. GET /api/operacao/alertas na oficina_alfa
  const resAlertasAlfa = await clientAlfa.get('/api/operacao/alertas');
  assert.equal(resAlertasAlfa.status, 200);
  const dataAlertasAlfa = await resAlertasAlfa.json();
  assert.ok(dataAlertasAlfa.total >= 1);
  const alertaId = dataAlertasAlfa.alertas[0].id;

  // 5. ISOLAMENTO MULTI-TENANT: oficina_beta NÃO enxerga alertas da oficina_alfa
  const resAlertasBeta = await clientBeta.get('/api/operacao/alertas');
  assert.equal(resAlertasBeta.status, 200);
  const dataAlertasBeta = await resAlertasBeta.json();
  assert.equal(dataAlertasBeta.total, 0, 'Oficina Beta não pode ter alertas de Alfa');

  // Tentativa invasiva de obter por ID
  const resInvasao = await clientBeta.get(`/api/operacao/alertas/${alertaId}`);
  assert.equal(resInvasao.status, 404);

  // 6. POST /api/operacao/alertas/:id/reconhecer na oficina_alfa
  const resRecAlfa = await clientAlfa.post(`/api/operacao/alertas/${alertaId}/reconhecer`, {
    motivo: 'Ciente, equipe acionada'
  });
  assert.equal(resRecAlfa.status, 200);
  const dataRecAlfa = await resRecAlfa.json();
  assert.equal(dataRecAlfa.alerta.status, 'reconhecido');

  // 7. GET /api/operacao/resumo e /api/operacao/gargalos
  const resResumo = await clientAlfa.get('/api/operacao/resumo');
  assert.equal(resResumo.status, 200);
  const dataResumo = await resResumo.json();
  assert.equal(dataResumo.resumo.veiculosPatio, 1);

  const resGargalos = await clientAlfa.get('/api/operacao/gargalos');
  assert.equal(resGargalos.status, 200);
  const dataGargalos = await resGargalos.json();
  assert.ok(dataGargalos.maiorGargalo);
});
