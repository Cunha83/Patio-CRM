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

/* =====================================================================
   TESTES DO DASHBOARD OPERACIONAL EM TEMPO REAL (20 CENÁRIOS)
   ===================================================================== */

/* ── 1. GET /api/operacao/painel — ESTRUTURA CANÔNICA ──────────────── */
test('1. Estrutura Canônica: Painel Operacional completo retorna todas as seções obrigatórias', () => {
  const state = {
    os: [
      { id: 'os_1', num: 101, vei: 'v_1', cli: 'c_1', box: 'b1', st: 'executando', abertura: '2026-09-11T08:00:00.000Z', criadoEm: '2026-09-11T08:00:00.000Z' }
    ],
    veiculos: [{ id: 'v_1', placa: 'AAA1111', modelo: 'FH 540', marca: 'Volvo', ano: 2022, cli: 'c_1' }],
    clientes: [{ id: 'c_1', nome: 'Transportadora Alfa' }],
    boxes: [{ id: 'b1', nome: 'Box 01' }, { id: 'b2', nome: 'Box 02' }],
    operationalEvents: [],
    operationalSnapshots: []
  };

  const painel = operationalSummaryService.gerarPainelOperacionalCompleto({
    tenantId: 'tenant_teste',
    state,
    dataReferencia: '2026-09-11',
    horaReferencia: '10:00'
  });

  assert.equal(painel.success, true);
  assert.equal(painel.tenantId, 'tenant_teste');
  assert.ok(painel.timestamp);
  assert.ok(painel.resumo, 'Deve conter objeto resumo');
  assert.ok(Array.isArray(painel.boxes), 'boxes deve ser array');
  assert.ok(painel.estagios, 'Deve conter objeto estagios');
  assert.ok(Array.isArray(painel.entregas), 'entregas deve ser array');
  assert.ok(Array.isArray(painel.alertas), 'alertas deve ser array');
  assert.ok(painel.gargalos, 'Deve conter objeto gargalos');
  assert.ok(painel.metricas, 'Deve conter objeto metricas');
  assert.ok(Array.isArray(painel.veiculos), 'veiculos deve ser array');
});

/* ── 2. CARDS EXECUTIVOS & KPIS CONSOLIDADOS ───────────────────────── */
test('2. Cards Executivos: contagens de veículos no pátio, boxes e entregas refletem o estado', () => {
  const state = {
    os: [
      { id: 'os_1', num: 101, vei: 'v_1', box: 'b1', st: 'executando', abertura: '2026-09-11T08:00:00.000Z', criadoEm: '2026-09-11T08:00:00.000Z' },
      { id: 'os_2', num: 102, vei: 'v_2', box: 'b2', st: 'peca', abertura: '2026-09-11T08:30:00.000Z', criadoEm: '2026-09-11T08:30:00.000Z' },
      { id: 'os_3', num: 103, vei: 'v_3', st: 'fila', abertura: '2026-09-11T09:00:00.000Z', criadoEm: '2026-09-11T09:00:00.000Z' },
      { id: 'os_4', num: 104, vei: 'v_4', st: 'finalizada', abertura: '2026-09-10T10:00:00.000Z', concluidoEm: '2026-09-11T08:00:00.000Z' }
    ],
    veiculos: [
      { id: 'v_1', placa: 'AAA1111' },
      { id: 'v_2', placa: 'BBB2222' },
      { id: 'v_3', placa: 'CCC3333' },
      { id: 'v_4', placa: 'DDD4444' }
    ],
    boxes: [{ id: 'b1', nome: 'Box 01' }, { id: 'b2', nome: 'Box 02' }, { id: 'b3', nome: 'Box 03' }],
    operationalEvents: []
  };

  const painel = operationalSummaryService.gerarPainelOperacionalCompleto({
    tenantId: 'tenant_kpis',
    state,
    dataReferencia: '2026-09-11',
    horaReferencia: '10:00'
  });

  // Veículos ativos no pátio (os_1, os_2, os_3 = 3)
  assert.equal(painel.resumo.veiculosPatio, 3);
  // Boxes: 3 total, 2 ocupados (b1, b2), 1 livre (b3)
  assert.equal(painel.resumo.boxes.total, 3);
  assert.equal(painel.resumo.boxes.ocupados, 2);
  assert.equal(painel.resumo.boxes.livres, 1);
  // Box bloqueado por peça: b2 com os_2 (st: 'peca')
  assert.equal(painel.resumo.boxes.bloqueadosPeca, 1);
});

/* ── 3. EMPTY STATE HANDLING ───────────────────────────────────────── */
test('3. Empty State: estado sem ordens de serviço retorna contagens zeradas sem erro', () => {
  const state = {
    os: [],
    veiculos: [],
    boxes: [{ id: 'b1', nome: 'Box 01' }, { id: 'b2', nome: 'Box 02' }],
    operationalEvents: []
  };

  const painel = operationalSummaryService.gerarPainelOperacionalCompleto({
    tenantId: 'tenant_vazio',
    state,
    dataReferencia: '2026-09-11',
    horaReferencia: '10:00'
  });

  assert.equal(painel.resumo.veiculosPatio, 0);
  assert.equal(painel.resumo.boxes.ocupados, 0);
  assert.equal(painel.resumo.boxes.livres, 2);
  assert.equal(painel.entregas.length, 0);
  assert.equal(painel.alertas.length, 0);
  assert.equal(painel.veiculos.length, 0);
  assert.equal(painel.metricas.tempoMedioPatioHoras, null);
  assert.equal(painel.metricas.tempoMedioPatioMinutos, null);
});

/* ── 4. ORDENAÇÃO ESTRITA DE ALERTAS P1 > P2 > P3 > P4 ─────────────── */
test('4. Ordenação de Alertas: prioridade P1 estritamente precede P2, P3 e P4', () => {
  const state = {
    os: [],
    boxes: [],
    operationalEvents: [
      { id: 'ev_p3', prioridade: 'P3', severidade: 'atencao', status: 'aberto', geradoEm: '2026-09-11T09:00:00.000Z' },
      { id: 'ev_p1', prioridade: 'P1', severidade: 'critico', status: 'aberto', geradoEm: '2026-09-11T09:10:00.000Z' },
      { id: 'ev_p4', prioridade: 'P4', severidade: 'baixo', status: 'aberto', geradoEm: '2026-09-11T08:00:00.000Z' },
      { id: 'ev_p2', prioridade: 'P2', severidade: 'alto', status: 'aberto', geradoEm: '2026-09-11T09:05:00.000Z' }
    ]
  };

  const painel = operationalSummaryService.gerarPainelOperacionalCompleto({
    tenantId: 'tenant_ordem',
    state
  });

  assert.equal(painel.alertas.length, 4);
  assert.equal(painel.alertas[0].prioridade, 'P1');
  assert.equal(painel.alertas[1].prioridade, 'P2');
  assert.equal(painel.alertas[2].prioridade, 'P3');
  assert.equal(painel.alertas[3].prioridade, 'P4');
});

/* ── 5. RECONHECIMENTO DE ALERTA VIA MOTOR / API ───────────────────── */
test('5. Reconhecimento de Alerta: altera status para reconhecido com auditoria', () => {
  const state = {
    operationalEvents: [
      {
        id: 'ev_rec_1',
        tipo: 'entrega_atrasada',
        severidade: 'alto',
        prioridade: 'P2',
        status: 'aberto',
        geradoEm: '2026-09-11T09:00:00.000Z'
      }
    ]
  };

  const res = operationalIntelligenceEngine.reconhecerEvento({
    tenantId: 'tenant_rec',
    state,
    eventId: 'ev_rec_1',
    actorId: 'gerente_joao',
    motivo: 'Peça a caminho via transportadora'
  });

  assert.equal(res.ok, true);
  assert.equal(res.evento.status, 'reconhecido');
  assert.equal(res.evento.reconhecidoPor, 'gerente_joao');
  assert.equal(res.evento.motivoReconhecimento, 'Peça a caminho via transportadora');
  assert.ok(res.evento.reconhecidoEm);
});

/* ── 6. RECONHECIMENTO NÃO RESOLVE EVENTO PREMATURAMENTE ───────────── */
test('6. Não-Resolução: alerta reconhecido permanece no painel como reconhecido', () => {
  const state = {
    os: [],
    boxes: [],
    operationalEvents: [
      {
        id: 'ev_rec_perm',
        tipo: 'veiculo_parado',
        severidade: 'critico',
        prioridade: 'P1',
        status: 'reconhecido',
        reconhecidoPor: 'operador_1',
        geradoEm: '2026-09-11T08:00:00.000Z'
      }
    ]
  };

  const painel = operationalSummaryService.gerarPainelOperacionalCompleto({
    tenantId: 'tenant_perm',
    state
  });

  // Evento reconhecido continua presente no painel de alertas ativos
  assert.equal(painel.alertas.length, 1);
  assert.equal(painel.alertas[0].id, 'ev_rec_perm');
  assert.equal(painel.alertas[0].status, 'reconhecido');
});

/* ── 7. DETECÇÃO DE RISCO DE ENTREGA (< 60 MINUTOS) ────────────────── */
test('7. Risco de Entrega: veículo com horário prometido em menos de 60 min é em_risco', () => {
  const state = {
    os: [
      {
        id: 'os_risco',
        num: 501,
        vei: 'v_risco',
        st: 'executando',
        promessaEntrega: { data: '2026-09-11', hora: '10:30' } // Em 30 min (ref 10:00)
      }
    ],
    veiculos: [{ id: 'v_risco', placa: 'RIS1030', modelo: 'Actros' }],
    boxes: [],
    operationalEvents: []
  };

  const painel = operationalSummaryService.gerarPainelOperacionalCompleto({
    tenantId: 'tenant_risco',
    state,
    dataReferencia: '2026-09-11',
    horaReferencia: '10:00'
  });

  assert.equal(painel.entregas.length, 1);
  assert.equal(painel.entregas[0].statusEntrega, 'em_risco');
  assert.equal(painel.resumo.entregas.emRisco, 1);
});

/* ── 8. DETECÇÃO DE ENTREGA ATRASADA ───────────────────────────────── */
test('8. Entrega Atrasada: veículo com horário prometido ultrapassado é atrasada', () => {
  const state = {
    os: [
      {
        id: 'os_atraso',
        num: 502,
        vei: 'v_atraso',
        st: 'executando',
        promessaEntrega: { data: '2026-09-11', hora: '09:00' } // Já passou (ref 10:00)
      }
    ],
    veiculos: [{ id: 'v_atraso', placa: 'ATR0900', modelo: 'Scania R450' }],
    boxes: [],
    operationalEvents: []
  };

  const painel = operationalSummaryService.gerarPainelOperacionalCompleto({
    tenantId: 'tenant_atraso',
    state,
    dataReferencia: '2026-09-11',
    horaReferencia: '10:00'
  });

  assert.equal(painel.entregas.length, 1);
  assert.equal(painel.entregas[0].statusEntrega, 'atrasada');
  assert.equal(painel.resumo.entregas.atrasadas, 1);
});

/* ── 9. BOXES OCUPADOS VS BLOQUEADOS POR PEÇA ──────────────────────── */
test('9. Baia Bloqueada: detecta box bloqueado aguardando peça', () => {
  const state = {
    os: [
      { id: 'os_b1', num: 601, vei: 'v_b1', box: 'b1', st: 'executando', abertura: '2026-09-11T08:00:00.000Z' },
      { id: 'os_b2', num: 602, vei: 'v_b2', box: 'b2', st: 'peca', abertura: '2026-09-11T08:00:00.000Z' }
    ],
    veiculos: [{ id: 'v_b1', placa: 'EXE1000' }, { id: 'v_b2', placa: 'PEC2000' }],
    boxes: [{ id: 'b1', nome: 'Box 01' }, { id: 'b2', nome: 'Box 02' }],
    operationalEvents: []
  };

  const painel = operationalSummaryService.gerarPainelOperacionalCompleto({
    tenantId: 'tenant_boxes',
    state,
    dataReferencia: '2026-09-11',
    horaReferencia: '10:00'
  });

  const box1 = painel.boxes.find(b => b.id === 'b1');
  const box2 = painel.boxes.find(b => b.id === 'b2');

  assert.equal(box1.status, 'ocupado');
  assert.equal(box2.status, 'bloqueado_peca');
});

/* ── 10. DIAGNÓSTICO DE GARGALO & SUGESTÃO DE AÇÃO ─────────────────── */
test('10. Maior Gargalo: identifica estágio crítico com sugestão acionável', () => {
  const state = {
    os: [
      { id: 'os_1', num: 701, st: 'peca' },
      { id: 'os_2', num: 702, st: 'peca' },
      { id: 'os_3', num: 703, st: 'peca' },
      { id: 'os_4', num: 704, st: 'executando' }
    ],
    boxes: [],
    operationalEvents: []
  };

  const painel = operationalSummaryService.gerarPainelOperacionalCompleto({
    tenantId: 'tenant_gargalo',
    state
  });

  assert.equal(painel.gargalos.maiorGargalo.tipo, 'peca');
  assert.equal(painel.gargalos.maiorGargalo.quantidade, 3);
  assert.ok(typeof painel.gargalos.maiorGargalo.sugestaoAcao === 'string');
  assert.ok(painel.gargalos.maiorGargalo.sugestaoAcao.length > 5);
});

/* ── 11. LISTA DE VEÍCULOS PARA BUSCA RÁPIDA ───────────────────────── */
test('11. Veículos para Busca: lista normalizada com placa, modelo, cliente e alertas', () => {
  const state = {
    os: [
      { id: 'os_v', num: 801, vei: 'v_1', cli: 'c_1', box: 'b1', mec: 'Carlos', st: 'executando', abertura: '2026-09-11' }
    ],
    veiculos: [{ id: 'v_1', placa: 'BUS1234', modelo: 'Constellation 24.280', cli: 'c_1' }],
    clientes: [{ id: 'c_1', nome: 'Transportes Brasil' }],
    boxes: [{ id: 'b1', nome: 'Box 01' }],
    operationalEvents: [
      { id: 'al_1', recurso: { id: 'os_v' }, prioridade: 'P2', status: 'aberto' }
    ]
  };

  const painel = operationalSummaryService.gerarPainelOperacionalCompleto({
    tenantId: 'tenant_busca',
    state
  });

  assert.equal(painel.veiculos.length, 1);
  const v = painel.veiculos[0];
  assert.equal(v.placa, 'BUS1234');
  assert.equal(v.modelo, 'Constellation 24.280');
  assert.equal(v.cliente, 'Transportes Brasil');
  assert.equal(v.mec, 'Carlos');
  assert.equal(v.alertasQtd, 1);
});

/* ── 12. REGRA DE OURO: MÉTRICAS VERÍDICAS OU NULL (NUNCA ZERO) ─────── */
test('12. Zero Inventado: métricas sem dados de ciclo retornam estritamente null', () => {
  const state = {
    os: [
      { id: 'os_sem_ciclo', num: 901, st: 'fila' } // Sem timestamps de transição
    ],
    boxes: [],
    operationalEvents: []
  };

  const painel = operationalSummaryService.gerarPainelOperacionalCompleto({
    tenantId: 'tenant_null_metric',
    state
  });

  assert.equal(painel.metricas.tempoMedioPatioHoras, null);
  assert.equal(painel.metricas.tempoMedioPatioMinutos, null);
  assert.equal(painel.metricas.tempoMedioEsperaPecaMinutos, null);
  assert.equal(painel.metricas.tempoMedioExecucaoMinutos, null);
});

/* ── 13. REGISTRO DE SNAPSHOT HISTÓRICO ────────────────────────────── */
test('13. Snapshot Histórico: grava snapshot com timestamp e indicadores operacionais', () => {
  const state = {
    os: [{ id: 'os_1', num: 1001, st: 'executando' }],
    boxes: [{ id: 'b1', nome: 'Box 01' }],
    operationalEvents: [],
    operationalSnapshots: []
  };

  const snap = operationalSummaryService.registrarSnapshotOperacional({
    tenantId: 'tenant_snap',
    state,
    agoraIso: '2026-09-11T12:00:00.000Z'
  });

  assert.ok(snap);
  assert.equal(snap.tenantId, 'tenant_snap');
  assert.equal(snap.timestamp, '2026-09-11T12:00:00.000Z');
  assert.equal(snap.veiculosPatio, 1);
  assert.equal(state.operationalSnapshots.length, 1);
});

/* ── 14. RETENÇÃO MÁXIMA DE SNAPSHOTS (1000 ITENS) ─────────────────── */
test('14. Retenção de Snapshots: array é limitado a 1000 itens', () => {
  const state = {
    os: [],
    boxes: [],
    operationalEvents: [],
    operationalSnapshots: []
  };

  // Preenche com 1005 snapshots sintéticos
  for (let i = 0; i < 1005; i++) {
    state.operationalSnapshots.push({ id: `snap_${i}`, tenantId: 'tenant_limite' });
  }

  // Novo snapshot deve podar excedente
  operationalSummaryService.registrarSnapshotOperacional({
    tenantId: 'tenant_limite',
    state
  });

  assert.equal(state.operationalSnapshots.length, 1000);
});

/* ── 15. CONSULTA DE HISTÓRICO POR PERÍODO ─────────────────────────── */
test('15. Histórico por Período: filtra snapshots em 24h, 7d e 30d', () => {
  const agora = new Date('2026-09-11T12:00:00.000Z');
  const t2hAtras = new Date(agora.getTime() - 2 * 3600 * 1000).toISOString();
  const t2dAtras = new Date(agora.getTime() - 2 * 24 * 3600 * 1000).toISOString();
  const t15dAtras = new Date(agora.getTime() - 15 * 24 * 3600 * 1000).toISOString();
  const t40dAtras = new Date(agora.getTime() - 40 * 24 * 3600 * 1000).toISOString();

  const state = {
    operationalSnapshots: [
      { id: 's1', tenantId: 't_hist', timestamp: t2hAtras },
      { id: 's2', tenantId: 't_hist', timestamp: t2dAtras },
      { id: 's3', tenantId: 't_hist', timestamp: t15dAtras },
      { id: 's4', tenantId: 't_hist', timestamp: t40dAtras },
      { id: 's_outro', tenantId: 'outro_tenant', timestamp: t2hAtras }
    ]
  };

  const res24h = operationalSummaryService.obterHistoricoSnapshots({
    tenantId: 't_hist',
    state,
    periodo: '24h',
    agora
  });
  assert.equal(res24h.length, 1);
  assert.equal(res24h[0].id, 's1');

  const res7d = operationalSummaryService.obterHistoricoSnapshots({
    tenantId: 't_hist',
    state,
    periodo: '7d',
    agora
  });
  assert.equal(res7d.length, 2);

  const res30d = operationalSummaryService.obterHistoricoSnapshots({
    tenantId: 't_hist',
    state,
    periodo: '30d',
    agora
  });
  assert.equal(res30d.length, 3);
});

/* =====================================================================
   TESTES E2E COM SERVIDOR HTTP REAL (CENÁRIOS 16 A 20)
   ===================================================================== */
let e2eContext = null;

async function setupE2EServer() {
  const serverNet = net.createServer();
  serverNet.listen(0, '127.0.0.1');
  await once(serverNet, 'listening');
  const port = serverNet.address().port;
  await new Promise(r => serverNet.close(r));

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'patio_dash_e2e_'));
  const dbPath = path.join(tempDir, 'test_dash.db');
  const root = path.resolve(__dirname, '..');
  let child = spawn(process.execPath, ['server.js'], {
    cwd: root,
    windowsHide: true,
    env: {
      ...process.env,
      PORT: String(port),
      API_KEY: 'test-dash-api-key',
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
      if (res.status === 401) break;
    } catch (_) {}
    await new Promise(r => setTimeout(r, 100));
  }

  const apiTenant = (tenantId, apiKey = 'test-dash-api-key') => {
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

  return {
    port,
    child,
    tempDir,
    apiTenant,
    cleanup: async () => {
      if (child && child.kill) {
        const done = once(child, 'exit');
        child.kill();
        await done;
      }
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  };
}

/* ── 16. E2E: GET /api/operacao/painel NO SERVIDOR REAL ────────────── */
test('16. E2E: GET /api/operacao/painel retorna 200 com payload estruturado', async (t) => {
  if (!e2eContext) e2eContext = await setupE2EServer();
  t.after(async () => {
    // mantem servidor ativo para os testes seguintes
  });

  const client = e2eContext.apiTenant('oficina_teste_16');
  await client.post('/api/estado', {
    os: [
      { id: 'os_16_1', num: 1601, vei: 'v_16_1', st: 'fila', abertura: '2026-09-11' }
    ],
    veiculos: [{ id: 'v_16_1', placa: 'E2E1601', modelo: 'Constellation' }],
    boxes: [{ id: 'b1', nome: 'Box 01' }],
    versao: 0
  });

  const res = await client.get('/api/operacao/painel');
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.success, true);
  assert.ok(data.painel);
  assert.equal(data.painel.veiculos.length, 1);
  assert.equal(data.painel.veiculos[0].placa, 'E2E1601');
});

/* ── 17. E2E: ISOLAMENTO MULTI-TENANT ESTRIRO NO PAINEL ─────────────── */
test('17. E2E: Isolamento Multi-Tenant estrito no painel operacional', async () => {
  if (!e2eContext) e2eContext = await setupE2EServer();
  const clientA = e2eContext.apiTenant('tenant_dash_a');
  const clientB = e2eContext.apiTenant('tenant_dash_b');

  await clientA.post('/api/estado', {
    os: [{ id: 'os_a_1', num: 1701, vei: 'v_a_1', st: 'executando', box: 'b1', abertura: '2026-09-11' }],
    veiculos: [{ id: 'v_a_1', placa: 'AAA1701' }],
    boxes: [{ id: 'b1', nome: 'Box Alfa' }],
    versao: 0
  });

  await clientB.post('/api/estado', {
    os: [{ id: 'os_b_1', num: 1702, vei: 'v_b_1', st: 'peca', box: 'b1', abertura: '2026-09-11' }],
    veiculos: [{ id: 'v_b_1', placa: 'BBB1702' }],
    boxes: [{ id: 'b1', nome: 'Box Beta' }],
    versao: 0
  });

  const resA = await clientA.get('/api/operacao/painel');
  const dataA = await resA.json();
  assert.equal(dataA.painel.veiculos[0].placa, 'AAA1701');
  assert.equal(dataA.painel.boxes[0].status, 'ocupado');

  const resB = await clientB.get('/api/operacao/painel');
  const dataB = await resB.json();
  assert.equal(dataB.painel.veiculos[0].placa, 'BBB1702');
  assert.equal(dataB.painel.boxes[0].status, 'bloqueado_peca');
});

/* ── 18. E2E: CONTROLE DE ACESSO RBAC ──────────────────────────────── */
test('18. E2E: RBAC rejeita requisição não autenticada e com chave inválida', async () => {
  if (!e2eContext) e2eContext = await setupE2EServer();

  // Sem autenticação
  const res1 = await fetch(`http://127.0.0.1:${e2eContext.port}/api/operacao/painel`);
  assert.equal(res1.status, 401);

  // Chave errada
  const res2 = await fetch(`http://127.0.0.1:${e2eContext.port}/api/operacao/painel`, {
    headers: { 'x-api-key': 'chave_errada' }
  });
  assert.equal(res2.status, 401);
});

/* ── 19. E2E: ATUALIZAÇÃO EM TEMPO REAL APÓS MUDANÇA DE OS ─────────── */
test('19. E2E: Transição de status da OS reflete imediatamente no painel', async () => {
  if (!e2eContext) e2eContext = await setupE2EServer();
  const client = e2eContext.apiTenant('tenant_tempo_real');

  // 1. Inicia OS em fila
  const post1 = await client.post('/api/estado', {
    os: [{ id: 'os_tr_1', num: 1901, vei: 'v_tr_1', st: 'fila', abertura: '2026-09-11' }],
    veiculos: [{ id: 'v_tr_1', placa: 'TR1901' }],
    boxes: [{ id: 'b1', nome: 'Box 01' }],
    versao: 0
  });
  const dataPost1 = await post1.json();

  const res1 = await client.get('/api/operacao/painel');
  const data1 = await res1.json();
  assert.equal(data1.painel.estagios.fila, 1);
  assert.equal(data1.painel.boxes[0].status, 'livre');

  // 2. Aloca no box b1 e move para executando
  await client.post('/api/estado', {
    os: [{ id: 'os_tr_1', num: 1901, vei: 'v_tr_1', st: 'executando', box: 'b1', abertura: '2026-09-11' }],
    veiculos: [{ id: 'v_tr_1', placa: 'TR1901' }],
    boxes: [{ id: 'b1', nome: 'Box 01' }],
    versao: dataPost1.versao
  });

  const res2 = await client.get('/api/operacao/painel');
  const data2 = await res2.json();
  assert.equal(data2.painel.estagios.executando, 1);
  assert.equal(data2.painel.boxes[0].status, 'ocupado');
  assert.equal(data2.painel.boxes[0].placa, 'TR1901');
});

/* ── 20. E2E: VOZ COM TENANTID & MUTEX CONCORRENTE ─────────────────── */
test('20. E2E: Comando de voz recebe tenantId e mutex concorrente de avaliação', async () => {
  if (!e2eContext) e2eContext = await setupE2EServer();
  const client = e2eContext.apiTenant('tenant_voz_mutex');

  // 1. Comando de voz
  const resVoz = await client.post('/api/comando-voz', {
    texto: 'Status da OS 1901'
  });
  assert.equal(resVoz.status, 200);
  const dataVoz = await resVoz.json();
  assert.equal(dataVoz.success, true);

  // 2. Avaliações concorrentes no mesmo tenant
  const p1 = client.post('/api/operacao/avaliar', {});
  const p2 = client.post('/api/operacao/avaliar', {});
  const [r1, r2] = await Promise.all([p1, p2]);

  assert.ok(r1.status === 200 || r1.status === 429);
  assert.ok(r2.status === 200 || r2.status === 429);

  // Limpeza final do servidor E2E
  await e2eContext.cleanup();
  e2eContext = null;
});
