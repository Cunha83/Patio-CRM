'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const net = require('net');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');
const { once } = require('events');

const laborTrackingService = require('../services/laborTrackingService');
const productivityService = require('../services/productivityService');
const costingService = require('../services/costingService');
const inventoryService = require('../services/inventoryService');
const operationalIntelligenceEngine = require('../services/operationalIntelligenceEngine');
const voiceActionEngine = require('../services/voiceActionEngine');

function criarEstadoBase(tenantId = 'oficina_teste_1') {
  return {
    tenantId,
    cfg: {
      empresa: 'Oficina Heavy Diesel',
      equipe: { jornadaPadraoHoras: 8 }
    },
    clientes: [{ id: 'cli_1', tenantId, nome: 'Transportadora Carga Pesada' }],
    veiculos: [{ id: 'vei_1', tenantId, placa: 'MEC1D23', modelo: 'Volvo FH 540' }],
    boxes: [
      { id: 'box_1', tenantId, nome: 'Box 01' },
      { id: 'box_2', tenantId, nome: 'Box 02' }
    ],
    os: [
      {
        id: 'os_100',
        num: 8921,
        tenantId,
        cli: 'cli_1',
        vei: 'vei_1',
        box: 'box_1',
        st: 'executando',
        abertura: '2026-09-11T08:00:00.000Z',
        servicos: [
          { id: 'srv_1', nome: 'Embuchamento eixo dianteiro', valor: 800, preco: 800, autorizado: true, status: 'aprovado' },
          { id: 'srv_2', nome: 'Alinhamento de eixos', valor: 400, preco: 400, autorizado: true, status: 'aprovado' },
          { id: 'srv_3', nome: 'Revisão do ar condicionado', valor: 350, preco: 350, autorizado: false, status: 'recusado' }
        ],
        pecas: [
          { id: 'peca_item_1', partId: 'part_bucha', nome: 'Jogo de Buchas Bronze', qtd: 2, preco: 600, valorTotal: 600, autorizado: true, consumida: true }
        ],
        desc: 50
      },
      {
        id: 'os_200',
        num: 8930,
        tenantId,
        cli: 'cli_1',
        vei: 'vei_1',
        box: 'box_2',
        st: 'executando',
        abertura: '2026-09-11T09:00:00.000Z',
        servicos: [
          { id: 'srv_20', nome: 'Troca de Lonas de Freio', valor: 500, preco: 500, autorizado: true, status: 'aprovado' }
        ],
        pecas: []
      }
    ],
    servicos: [
      { id: 'srv_1', nome: 'Embuchamento eixo dianteiro', tempoEstimadoMinutos: 240, horas: 4, valor: 800 },
      { id: 'srv_2', nome: 'Alinhamento de eixos', tempoEstimadoMinutos: 90, horas: 1.5, valor: 400 }
    ],
    pecas: [
      { id: 'part_bucha', tenantId, codigoInterno: 'BCH-01', descricao: 'Jogo de Buchas Bronze', custoMedio: 150, custo: 150, qtd: 10, venda: 300 }
    ],
    inventoryMovements: [
      {
        id: 'mov_1',
        tenantId,
        partId: 'part_bucha',
        osId: 'os_100',
        type: 'saida_os',
        quantity: 2,
        unitCost: 150,
        createdAt: '2026-09-11T10:00:00.000Z'
      }
    ],
    partRequirements: [],
    workers: [],
    laborEntries: [],
    auditoria: [],
    operationalEvents: []
  };
}

async function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const port = srv.address().port;
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

/* ─────────────────────────────────────────────────────────────────
 * TESTES OBRIGATÓRIOS DO CICLO DE EQUIPE, APONTAMENTO & CUSTOS
 * ───────────────────────────────────────────────────────────────── */

test('1. Criação de Colaborador: cadastra com jornada e custo/hora', () => {
  const state = criarEstadoBase();
  const res = laborTrackingService.cadastrarColaborador({
    tenantId: 'oficina_teste_1',
    state,
    workerData: {
      nome: 'João da Silva',
      funcao: 'Mecânico Diesel',
      custoHora: 38.0,
      jornadaHorasDia: 8,
      especialidades: ['Suspensão', 'Freios']
    },
    actorId: 'gerente'
  });

  assert.equal(res.ok, true);
  assert.equal(res.worker.nome, 'João da Silva');
  assert.equal(res.worker.custoHora, 38.0);
  assert.equal(res.worker.jornadaHorasDia, 8);
  assert.equal(res.worker.ativo, true);
  assert.equal(res.worker.disponivelHoje, true);
  assert.equal(state.workers.length, 1);
});

test('2. Início de Apontamento: cria laborEntry ativo para serviço autorizado', () => {
  const state = criarEstadoBase();
  const wRes = laborTrackingService.cadastrarColaborador({
    tenantId: 'oficina_teste_1',
    state,
    workerData: { nome: 'João', custoHora: 38.0 }
  });

  const res = laborTrackingService.iniciarApontamento({
    tenantId: 'oficina_teste_1',
    state,
    workerId: wRes.worker.id,
    osId: 'os_100',
    serviceItemId: 'srv_1',
    boxId: 'box_1',
    type: 'produtivo',
    actorId: 'joao',
    timestamp: '2026-09-11T08:10:00.000Z'
  });

  assert.equal(res.ok, true);
  assert.equal(res.entry.status, 'ativo');
  assert.equal(res.entry.workerNome, 'João');
  assert.equal(res.entry.serviceNome, 'Embuchamento eixo dianteiro');
  assert.equal(res.entry.osNum, 8921);
  assert.equal(state.laborEntries.length, 1);
});

test('3. Pausa de Apontamento: encerra intervalo atual e grava motivo', () => {
  const state = criarEstadoBase();
  const wRes = laborTrackingService.cadastrarColaborador({
    tenantId: 'oficina_teste_1',
    state,
    workerData: { nome: 'João', custoHora: 38.0 }
  });

  const ini = laborTrackingService.iniciarApontamento({
    tenantId: 'oficina_teste_1',
    state,
    workerId: wRes.worker.id,
    osId: 'os_100',
    serviceItemId: 'srv_1',
    timestamp: '2026-09-11T08:10:00.000Z'
  });

  // Pausa às 10:20 (2h10 = 130 min)
  const resPausa = laborTrackingService.pausarApontamento({
    tenantId: 'oficina_teste_1',
    state,
    entryId: ini.entry.id,
    motivo: 'espera_peca',
    timestamp: '2026-09-11T10:20:00.000Z'
  });

  assert.equal(resPausa.ok, true);
  assert.equal(resPausa.entry.status, 'pausado');
  assert.equal(resPausa.entry.motivoPausa, 'espera_peca');
  assert.equal(resPausa.entry.durationMinutes, 130);
  assert.equal(state.os.find(o => o.id === 'os_100').st, 'peca');
});

test('4. Retomada de Apontamento: cria novo intervalo sem sobrescrever histórico anterior', () => {
  const state = criarEstadoBase();
  const wRes = laborTrackingService.cadastrarColaborador({
    tenantId: 'oficina_teste_1',
    state,
    workerData: { nome: 'João', custoHora: 38.0 }
  });

  const ini = laborTrackingService.iniciarApontamento({
    tenantId: 'oficina_teste_1',
    state,
    workerId: wRes.worker.id,
    osId: 'os_100',
    serviceItemId: 'srv_1',
    timestamp: '2026-09-11T08:10:00.000Z'
  });

  laborTrackingService.pausarApontamento({
    tenantId: 'oficina_teste_1',
    state,
    entryId: ini.entry.id,
    motivo: 'espera_peca',
    timestamp: '2026-09-11T10:20:00.000Z'
  });

  // Retomada às 11:05
  const resRet = laborTrackingService.retomarApontamento({
    tenantId: 'oficina_teste_1',
    state,
    entryId: ini.entry.id,
    timestamp: '2026-09-11T11:05:00.000Z'
  });

  assert.equal(resRet.ok, true);
  assert.equal(resRet.entry.status, 'ativo');
  assert.equal(resRet.entry.intervals.length, 2);
  assert.equal(resRet.entry.intervals[0].durationMinutes, 130);
  assert.equal(resRet.entry.intervals[1].startedAt, '2026-09-11T11:05:00.000Z');
  assert.equal(resRet.entry.intervals[1].endedAt, null);
});

test('5. Encerramento de Apontamento: calcula duração total e atualiza serviço da OS', () => {
  const state = criarEstadoBase();
  const wRes = laborTrackingService.cadastrarColaborador({
    tenantId: 'oficina_teste_1',
    state,
    workerData: { nome: 'João', custoHora: 38.0 }
  });

  const ini = laborTrackingService.iniciarApontamento({
    tenantId: 'oficina_teste_1',
    state,
    workerId: wRes.worker.id,
    osId: 'os_100',
    serviceItemId: 'srv_1',
    timestamp: '2026-09-11T08:10:00.000Z'
  });

  laborTrackingService.pausarApontamento({
    tenantId: 'oficina_teste_1',
    state,
    entryId: ini.entry.id,
    timestamp: '2026-09-11T10:20:00.000Z' // 130 min
  });

  laborTrackingService.retomarApontamento({
    tenantId: 'oficina_teste_1',
    state,
    entryId: ini.entry.id,
    timestamp: '2026-09-11T11:05:00.000Z'
  });

  // Encerramento às 13:30 (11:05 a 13:30 = 2h25 = 145 min. Total: 130 + 145 = 275 min = 4h35)
  const resFim = laborTrackingService.encerrarApontamento({
    tenantId: 'oficina_teste_1',
    state,
    entryId: ini.entry.id,
    timestamp: '2026-09-11T13:30:00.000Z'
  });

  assert.equal(resFim.ok, true);
  assert.equal(resFim.entry.status, 'finalizado');
  assert.equal(resFim.entry.durationMinutes, 275);
  // Não finaliza a OS inteira, apenas o item de serviço
  const os = state.os.find(o => o.id === 'os_100');
  assert.equal(os.servicos.find(s => s.id === 'srv_1').concluido, true);
  assert.notEqual(os.st, 'finalizada');
});

test('6. Duração Correta: 2 horas de apontamento resultam em exatamente 120 minutos', () => {
  const state = criarEstadoBase();
  const wRes = laborTrackingService.cadastrarColaborador({
    tenantId: 'oficina_teste_1',
    state,
    workerData: { nome: 'Carlos', custoHora: 40.0 }
  });

  const ini = laborTrackingService.iniciarApontamento({
    tenantId: 'oficina_teste_1',
    state,
    workerId: wRes.worker.id,
    osId: 'os_100',
    serviceItemId: 'srv_2',
    timestamp: '2026-09-11T14:00:00.000Z'
  });

  const fim = laborTrackingService.encerrarApontamento({
    tenantId: 'oficina_teste_1',
    state,
    entryId: ini.entry.id,
    timestamp: '2026-09-11T16:00:00.000Z'
  });

  assert.equal(fim.entry.durationMinutes, 120);
});

test('7. Múltiplos Mecânicos na mesma OS: 2 mecânicos com 1h cada totalizam 2 horas-homem', () => {
  const state = criarEstadoBase();
  const w1 = laborTrackingService.cadastrarColaborador({ tenantId: 'oficina_teste_1', state, workerData: { nome: 'João', custoHora: 30 } }).worker;
  const w2 = laborTrackingService.cadastrarColaborador({ tenantId: 'oficina_teste_1', state, workerData: { nome: 'Pedro', custoHora: 30 } }).worker;

  const e1 = laborTrackingService.iniciarApontamento({ tenantId: 'oficina_teste_1', state, workerId: w1.id, osId: 'os_100', serviceItemId: 'srv_1', timestamp: '2026-09-11T08:00:00.000Z' }).entry;
  const e2 = laborTrackingService.iniciarApontamento({ tenantId: 'oficina_teste_1', state, workerId: w2.id, osId: 'os_100', serviceItemId: 'srv_2', timestamp: '2026-09-11T08:00:00.000Z' }).entry;

  laborTrackingService.encerrarApontamento({ tenantId: 'oficina_teste_1', state, entryId: e1.id, timestamp: '2026-09-11T09:00:00.000Z' });
  laborTrackingService.encerrarApontamento({ tenantId: 'oficina_teste_1', state, entryId: e2.id, timestamp: '2026-09-11T09:00:00.000Z' });

  const apuracao = costingService.calcularCustoMaoDeObraOS({ tenantId: 'oficina_teste_1', state, osId: 'os_100' });
  assert.equal(apuracao.horasHomemTotal, 2.0);
  assert.equal(apuracao.custoMaoObra, 60.0);
});

test('8. Anti-Sobreposição: mesmo mecânico bloqueado de ter dois serviços ativos simultaneamente', () => {
  const state = criarEstadoBase();
  const w = laborTrackingService.cadastrarColaborador({ tenantId: 'oficina_teste_1', state, workerData: { nome: 'João' } }).worker;

  laborTrackingService.iniciarApontamento({ tenantId: 'oficina_teste_1', state, workerId: w.id, osId: 'os_100', serviceItemId: 'srv_1' });

  assert.throws(() => {
    laborTrackingService.iniciarApontamento({ tenantId: 'oficina_teste_1', state, workerId: w.id, osId: 'os_200', serviceItemId: 'srv_20' });
  }, /já possui um apontamento ativo/);
});

test('9. Serviço Não Autorizado Bloqueado: rejeita apontamento produtivo em item recusado', () => {
  const state = criarEstadoBase();
  const w = laborTrackingService.cadastrarColaborador({ tenantId: 'oficina_teste_1', state, workerData: { nome: 'João' } }).worker;

  assert.throws(() => {
    laborTrackingService.iniciarApontamento({
      tenantId: 'oficina_teste_1',
      state,
      workerId: w.id,
      osId: 'os_100',
      serviceItemId: 'srv_3', // recusado
      type: 'produtivo'
    });
  }, /Somente serviços com status autorizado podem receber apontamento produtivo/);
});

test('10. Apontamento Manual Auditado: correção de horário exige motivo e grava histórico', () => {
  const state = criarEstadoBase();
  const w = laborTrackingService.cadastrarColaborador({ tenantId: 'oficina_teste_1', state, workerData: { nome: 'João' } }).worker;
  const ini = laborTrackingService.iniciarApontamento({ tenantId: 'oficina_teste_1', state, workerId: w.id, osId: 'os_100', serviceItemId: 'srv_1', timestamp: '2026-09-11T08:00:00.000Z' }).entry;

  const resAjuste = laborTrackingService.ajustarApontamentoManual({
    tenantId: 'oficina_teste_1',
    state,
    entryId: ini.id,
    dadosAjuste: {
      startedAt: '2026-09-11T08:00:00.000Z',
      endedAt: '2026-09-11T11:00:00.000Z',
      status: 'finalizado'
    },
    motivo: 'Esqueci de encerrar o serviço ontem.',
    actorId: 'gerente_carlos'
  });

  assert.equal(resAjuste.ok, true);
  assert.equal(resAjuste.entry.durationMinutes, 180);
  assert.equal(resAjuste.entry.ajustado, true);
  assert.equal(resAjuste.entry.motivoAjuste, 'Esqueci de encerrar o serviço ontem.');
  assert.ok(state.auditoria.some(a => a.intencao === 'labor_adjusted'));
});

test('11. Custo Hora: R$ 38,00/h em 3h30 (210 min) resulta em R$ 133,00', () => {
  const state = criarEstadoBase();
  const w = laborTrackingService.cadastrarColaborador({ tenantId: 'oficina_teste_1', state, workerData: { nome: 'João', custoHora: 38 } }).worker;

  const e = laborTrackingService.iniciarApontamento({ tenantId: 'oficina_teste_1', state, workerId: w.id, osId: 'os_100', serviceItemId: 'srv_1', timestamp: '2026-09-11T08:00:00.000Z' }).entry;
  laborTrackingService.encerrarApontamento({ tenantId: 'oficina_teste_1', state, entryId: e.id, timestamp: '2026-09-11T11:30:00.000Z' }); // 3.5h

  const apuracao = costingService.calcularCustoMaoDeObraOS({ tenantId: 'oficina_teste_1', state, osId: 'os_100' });
  assert.equal(apuracao.custoMaoObra, 133.0);
});

test('12. Custo Real de Mão de Obra: consolidado individual preciso na OS', () => {
  const state = criarEstadoBase();
  const w1 = laborTrackingService.cadastrarColaborador({ tenantId: 'oficina_teste_1', state, workerData: { nome: 'Mecânico A', custoHora: 50 } }).worker;
  const w2 = laborTrackingService.cadastrarColaborador({ tenantId: 'oficina_teste_1', state, workerData: { nome: 'Mecânico B', custoHora: 40 } }).worker;

  const e1 = laborTrackingService.iniciarApontamento({ tenantId: 'oficina_teste_1', state, workerId: w1.id, osId: 'os_100', serviceItemId: 'srv_1', timestamp: '2026-09-11T08:00:00.000Z' }).entry;
  laborTrackingService.encerrarApontamento({ tenantId: 'oficina_teste_1', state, entryId: e1.id, timestamp: '2026-09-11T10:00:00.000Z' }); // 2h * 50 = 100

  const e2 = laborTrackingService.iniciarApontamento({ tenantId: 'oficina_teste_1', state, workerId: w2.id, osId: 'os_100', serviceItemId: 'srv_2', timestamp: '2026-09-11T10:00:00.000Z' }).entry;
  laborTrackingService.encerrarApontamento({ tenantId: 'oficina_teste_1', state, entryId: e2.id, timestamp: '2026-09-11T11:30:00.000Z' }); // 1.5h * 40 = 60

  const apuracao = costingService.calcularCustoMaoDeObraOS({ tenantId: 'oficina_teste_1', state, osId: 'os_100' });
  assert.equal(apuracao.custoMaoObra, 160.0);
  assert.equal(apuracao.horasHomemTotal, 3.5);
});

test('13. Custo Real de Peças: utiliza custo médio/real e não preço de venda', () => {
  const state = criarEstadoBase();
  // Jogo de buchas: venda 300, custo médio 150. Qtd consumida: 2 un. Custo real = 300
  const apuracaoPecas = costingService.calcularCustoPecasOS({ tenantId: 'oficina_teste_1', state, osId: 'os_100' });
  assert.equal(apuracaoPecas.custoPecasConsumidas, 300.0);
});

test('14. Custo Real da OS: soma peças consumidas + mão de obra + custos adicionais', () => {
  const state = criarEstadoBase();
  const w = laborTrackingService.cadastrarColaborador({ tenantId: 'oficina_teste_1', state, workerData: { nome: 'João', custoHora: 40 } }).worker;
  const e = laborTrackingService.iniciarApontamento({ tenantId: 'oficina_teste_1', state, workerId: w.id, osId: 'os_100', serviceItemId: 'srv_1', timestamp: '2026-09-11T08:00:00.000Z' }).entry;
  laborTrackingService.encerrarApontamento({ tenantId: 'oficina_teste_1', state, entryId: e.id, timestamp: '2026-09-11T10:00:00.000Z' }); // 2h * 40 = 80

  const custoTotal = costingService.calcularCustoRealOS({ tenantId: 'oficina_teste_1', state, osId: 'os_100' });
  // Peças: 300 + MO: 80 = 380
  assert.equal(custoTotal.custoPecasConsumidas, 300.0);
  assert.equal(custoTotal.custoMaoObra, 80.0);
  assert.equal(custoTotal.custoRealOS, 380.0);
});

test('15. Margem Bruta da OS: receita autorizada menos custo real sem chamar de lucro líquido', () => {
  const state = criarEstadoBase();
  const w = laborTrackingService.cadastrarColaborador({ tenantId: 'oficina_teste_1', state, workerData: { nome: 'João', custoHora: 40 } }).worker;
  const e = laborTrackingService.iniciarApontamento({ tenantId: 'oficina_teste_1', state, workerId: w.id, osId: 'os_100', serviceItemId: 'srv_1', timestamp: '2026-09-11T08:00:00.000Z' }).entry;
  laborTrackingService.encerrarApontamento({ tenantId: 'oficina_teste_1', state, entryId: e.id, timestamp: '2026-09-11T10:00:00.000Z' });

  const res = costingService.calcularCustoRealOS({ tenantId: 'oficina_teste_1', state, osId: 'os_100' });
  // Receita: Servicos autorizados (800 + 400) + Pecas (600) - Desc (50) = 1750
  assert.equal(res.receitaAutorizada, 1750.0);
  assert.equal(res.custoRealOS, 380.0);
  assert.equal(res.margemBrutaOS, 1370.0);
  assert.equal(res.margemPercentual, 78.3);
});

test('16. Tempo Estimado vs Real: calcula desvio em minutos e percentual', () => {
  const state = criarEstadoBase();
  const w = laborTrackingService.cadastrarColaborador({ tenantId: 'oficina_teste_1', state, workerData: { nome: 'João' } }).worker;

  // srv_1 tem estimado de 240 min no catálogo
  const e = laborTrackingService.iniciarApontamento({ tenantId: 'oficina_teste_1', state, workerId: w.id, osId: 'os_100', serviceItemId: 'srv_1', timestamp: '2026-09-11T08:00:00.000Z' }).entry;
  laborTrackingService.encerrarApontamento({ tenantId: 'oficina_teste_1', state, entryId: e.id, timestamp: '2026-09-11T12:30:00.000Z' }); // 270 min

  const comp = productivityService.compararEstimadoVsReal({ tenantId: 'oficina_teste_1', state, osId: 'os_100', serviceItemId: 'srv_1' });
  assert.equal(comp.tempoEstimadoMinutos, 240);
  assert.equal(comp.tempoRealMinutos, 270);
  assert.equal(comp.desvioMinutos, 30);
  assert.equal(comp.percentualDesvio, 12.5);
});

test('17. Retrabalho: tipo específico vinculado a causa e apuração de custo', () => {
  const state = criarEstadoBase();
  const w = laborTrackingService.cadastrarColaborador({ tenantId: 'oficina_teste_1', state, workerData: { nome: 'João', custoHora: 50 } }).worker;

  const iniRet = laborTrackingService.iniciarApontamento({
    tenantId: 'oficina_teste_1',
    state,
    workerId: w.id,
    osId: 'os_100',
    serviceItemId: 'srv_1',
    type: 'retrabalho',
    causaRetrabalho: 'Bucha com folga prematura após aperto',
    timestamp: '2026-09-11T13:00:00.000Z'
  }).entry;

  laborTrackingService.encerrarApontamento({ tenantId: 'oficina_teste_1', state, entryId: iniRet.id, timestamp: '2026-09-11T14:30:00.000Z' }); // 1.5h

  const apuracao = costingService.calcularCustoMaoDeObraOS({ tenantId: 'oficina_teste_1', state, osId: 'os_100' });
  assert.equal(apuracao.horasRetrabalho, 1.5);
  assert.equal(apuracao.custoRetrabalho, 75.0);
});

test('18. Produtividade do Mecânico: calcula horas produtivas, espera e utilização', () => {
  const state = criarEstadoBase();
  const w = laborTrackingService.cadastrarColaborador({
    tenantId: 'oficina_teste_1',
    state,
    workerData: { nome: 'João', jornadaHorasDia: 8 }
  }).worker;

  // 4 horas de produtivo
  const e1 = laborTrackingService.iniciarApontamento({ tenantId: 'oficina_teste_1', state, workerId: w.id, osId: 'os_100', serviceItemId: 'srv_1', timestamp: '2026-09-11T08:00:00.000Z' }).entry;
  laborTrackingService.encerrarApontamento({ tenantId: 'oficina_teste_1', state, entryId: e1.id, timestamp: '2026-09-11T12:00:00.000Z' });

  const prod = productivityService.calcularProdutividadeColaborador({
    tenantId: 'oficina_teste_1',
    state,
    workerId: w.id,
    dataReferencia: '2026-09-11'
  });

  assert.equal(prod.horasDisponiveis, 8);
  assert.equal(prod.horasProdutivas, 4);
  assert.equal(prod.utilizacao, 50.0);
});

test('19. Produtividade da Oficina: consolidação de equipe e horas por período', () => {
  const state = criarEstadoBase();
  const w1 = laborTrackingService.cadastrarColaborador({ tenantId: 'oficina_teste_1', state, workerData: { nome: 'João', jornadaHorasDia: 8 } }).worker;
  const w2 = laborTrackingService.cadastrarColaborador({ tenantId: 'oficina_teste_1', state, workerData: { nome: 'Pedro', jornadaHorasDia: 8 } }).worker;

  const e1 = laborTrackingService.iniciarApontamento({ tenantId: 'oficina_teste_1', state, workerId: w1.id, osId: 'os_100', serviceItemId: 'srv_1', timestamp: '2026-09-11T08:00:00.000Z' }).entry;
  laborTrackingService.encerrarApontamento({ tenantId: 'oficina_teste_1', state, entryId: e1.id, timestamp: '2026-09-11T14:00:00.000Z' }); // 6h

  const e2 = laborTrackingService.iniciarApontamento({ tenantId: 'oficina_teste_1', state, workerId: w2.id, osId: 'os_200', serviceItemId: 'srv_20', timestamp: '2026-09-11T08:00:00.000Z' }).entry;
  laborTrackingService.encerrarApontamento({ tenantId: 'oficina_teste_1', state, entryId: e2.id, timestamp: '2026-09-11T10:00:00.000Z' }); // 2h

  const prodOficina = productivityService.calcularProdutividadeOficina({
    tenantId: 'oficina_teste_1',
    state,
    dataReferencia: '2026-09-11'
  });

  assert.equal(prodOficina.totalMecanicos, 2);
  assert.equal(prodOficina.horasDisponiveis, 16);
  assert.equal(prodOficina.horasProdutivas, 8);
  assert.equal(prodOficina.utilizacao, 50.0);
});

test('20. Capacidade Diária: disponível, utilizada e restante com base na equipe ativa', () => {
  const state = criarEstadoBase();
  laborTrackingService.cadastrarColaborador({ tenantId: 'oficina_teste_1', state, workerData: { nome: 'João', jornadaHorasDia: 8 } });
  laborTrackingService.cadastrarColaborador({ tenantId: 'oficina_teste_1', state, workerData: { nome: 'Pedro', jornadaHorasDia: 8 } });
  // Colaborador em folga (indisponível hoje)
  laborTrackingService.cadastrarColaborador({ tenantId: 'oficina_teste_1', state, workerData: { nome: 'Lucas', jornadaHorasDia: 8, disponivelHoje: false } });

  const cap = productivityService.calcularCapacidadeDiaria({
    tenantId: 'oficina_teste_1',
    state,
    dataReferencia: '2026-09-11'
  });

  assert.equal(cap.capacidadeDisponivelHoje, 16); // 8 + 8 (Lucas indisponível)
  assert.equal(cap.capacidadeRestanteHoje, 16);
});

test('21. Detecção Inteligente: box ocupado sem atividade de mecânico', () => {
  const state = criarEstadoBase();
  // os_100 está no box_1 como executando, mas não tem nenhum laborEntry ativo
  state.laborEntries = [];

  const aval = operationalIntelligenceEngine.avaliarOperacao({
    tenantId: 'oficina_teste_1',
    state,
    dataReferencia: '2026-09-11',
    horaReferencia: '10:00'
  });

  assert.ok(aval.eventos.some(e => e.tipo === 'box_sem_atividade' && e.recurso.id === 'box_1'));
});

test('22. Detecção Inteligente: apontamento esquecido aberto além da jornada (P2)', () => {
  const state = criarEstadoBase();
  const w = laborTrackingService.cadastrarColaborador({ tenantId: 'oficina_teste_1', state, workerData: { nome: 'João', jornadaHorasDia: 8 } }).worker;

  // Aberto há 11 horas
  laborTrackingService.iniciarApontamento({
    tenantId: 'oficina_teste_1',
    state,
    workerId: w.id,
    osId: 'os_100',
    serviceItemId: 'srv_1',
    timestamp: '2026-09-11T06:00:00.000Z'
  });

  const aval = operationalIntelligenceEngine.avaliarOperacao({
    tenantId: 'oficina_teste_1',
    state,
    dataReferencia: '2026-09-11',
    horaReferencia: '18:00'
  });

  const evEsquecido = aval.eventos.find(e => e.tipo === 'apontamento_aberto_esquecido');
  assert.ok(evEsquecido);
  assert.equal(evEsquecido.prioridade, 'P2');
  assert.match(evEsquecido.descricao, /excedendo a jornada/);
});

test('23. Consultas da Verônica por Voz: quem está livre agora e em que o João está trabalhando', async () => {
  const state = criarEstadoBase();
  const w1 = laborTrackingService.cadastrarColaborador({ tenantId: 'oficina_teste_1', state, workerData: { nome: 'João' } }).worker;
  const w2 = laborTrackingService.cadastrarColaborador({ tenantId: 'oficina_teste_1', state, workerData: { nome: 'Carlos' } }).worker;

  laborTrackingService.iniciarApontamento({ tenantId: 'oficina_teste_1', state, workerId: w1.id, osId: 'os_100', serviceItemId: 'srv_1' });

  // 1. Quem está livre agora?
  const resLivre = await voiceActionEngine.interpretarEExecutar({
    input: { text: 'Verônica, quem está livre agora?' },
    context: { tenantId: 'oficina_teste_1' },
    state
  });
  assert.equal(resLivre.ok, true);
  assert.match(resLivre.resposta, /Carlos/);

  // 2. Em que o João está trabalhando?
  const resTrab = await voiceActionEngine.interpretarEExecutar({
    input: { text: 'Em que o João está trabalhando?' },
    context: { tenantId: 'oficina_teste_1' },
    state
  });
  assert.equal(resTrab.ok, true);
  assert.match(resTrab.resposta, /João está trabalhando na OS #8921/);
});

test('24. Ação de Voz Iniciar: "Verônica, vou começar o embuchamento da 8921"', async () => {
  const state = criarEstadoBase();
  laborTrackingService.cadastrarColaborador({ tenantId: 'oficina_teste_1', state, workerData: { nome: 'João' } });

  const res = await voiceActionEngine.interpretarEExecutar({
    input: { text: 'Verônica, vou começar o embuchamento da 8921.' },
    context: { tenantId: 'oficina_teste_1', remetente: 'João' },
    state
  });

  assert.equal(res.ok, true);
  assert.equal(res.acao, 'iniciar_servico');
  assert.equal(state.laborEntries.length, 1);
  assert.equal(state.laborEntries[0].status, 'ativo');
});

test('25. Ação de Voz Pausar: "Verônica, pausa esse serviço, tô aguardando peça"', async () => {
  const state = criarEstadoBase();
  const w = laborTrackingService.cadastrarColaborador({ tenantId: 'oficina_teste_1', state, workerData: { nome: 'João' } }).worker;
  laborTrackingService.iniciarApontamento({ tenantId: 'oficina_teste_1', state, workerId: w.id, osId: 'os_100', serviceItemId: 'srv_1' });

  const res = await voiceActionEngine.interpretarEExecutar({
    input: { text: 'Verônica, pausa esse serviço, tô aguardando peça.' },
    context: { tenantId: 'oficina_teste_1', remetente: 'João' },
    state
  });

  assert.equal(res.ok, true);
  assert.equal(res.acao, 'pausar_servico');
  assert.equal(state.laborEntries[0].status, 'pausado');
  assert.equal(state.laborEntries[0].motivoPausa, 'espera_peca');
});

test('26. RBAC: perfil sem permissão gerencial tem custoHora omitido no cadastro', () => {
  const state = criarEstadoBase();
  laborTrackingService.cadastrarColaborador({ tenantId: 'oficina_teste_1', state, workerData: { nome: 'João', custoHora: 45.0 } });

  // Mecânico consultando equipe
  const listaMecanico = laborTrackingService.listarColaboradores({
    tenantId: 'oficina_teste_1',
    state,
    userPermissions: ['labor:read', 'labor:write']
  });
  assert.equal(listaMecanico[0].custoHora, undefined);

  // Gerente consultando equipe
  const listaGerente = laborTrackingService.listarColaboradores({
    tenantId: 'oficina_teste_1',
    state,
    userPermissions: ['costing:read', 'productivity:manage']
  });
  assert.equal(listaGerente[0].custoHora, 45.0);
});

test('27. Isolamento Multi-Tenant: Tenant B jamais acessa equipe ou apontamentos do Tenant A', () => {
  const state = criarEstadoBase();
  laborTrackingService.cadastrarColaborador({ tenantId: 'oficina_A', state, workerData: { nome: 'Mecânico A', custoHora: 50 } });
  laborTrackingService.cadastrarColaborador({ tenantId: 'oficina_B', state, workerData: { nome: 'Mecânico B', custoHora: 40 } });

  const listaA = laborTrackingService.listarColaboradores({ tenantId: 'oficina_A', state });
  const listaB = laborTrackingService.listarColaboradores({ tenantId: 'oficina_B', state });

  assert.equal(listaA.length, 1);
  assert.equal(listaA[0].nome, 'Mecânico A');
  assert.equal(listaB.length, 1);
  assert.equal(listaB[0].nome, 'Mecânico B');
});

test('28. Concorrência: proteção atômica contra sobreposição no mesmo mecânico', () => {
  const state = criarEstadoBase();
  const w = laborTrackingService.cadastrarColaborador({ tenantId: 'oficina_teste_1', state, workerData: { nome: 'João' } }).worker;

  const r1 = laborTrackingService.iniciarApontamento({ tenantId: 'oficina_teste_1', state, workerId: w.id, osId: 'os_100', serviceItemId: 'srv_1' });
  assert.equal(r1.ok, true);

  assert.throws(() => {
    laborTrackingService.iniciarApontamento({ tenantId: 'oficina_teste_1', state, workerId: w.id, osId: 'os_100', serviceItemId: 'srv_2' });
  }, /já possui um apontamento ativo/);
});

test('29. Idempotência: chamadas repetidas de iniciar/pausar não duplicam apontamentos', () => {
  const state = criarEstadoBase();
  const w = laborTrackingService.cadastrarColaborador({ tenantId: 'oficina_teste_1', state, workerData: { nome: 'João' } }).worker;

  // Iniciar duplicado
  const r1 = laborTrackingService.iniciarApontamento({ tenantId: 'oficina_teste_1', state, workerId: w.id, osId: 'os_100', serviceItemId: 'srv_1' });
  const r2 = laborTrackingService.iniciarApontamento({ tenantId: 'oficina_teste_1', state, workerId: w.id, osId: 'os_100', serviceItemId: 'srv_1' });
  assert.equal(r2.idempotente, true);
  assert.equal(state.laborEntries.length, 1);

  // Pausar duplicado
  const p1 = laborTrackingService.pausarApontamento({ tenantId: 'oficina_teste_1', state, entryId: r1.entry.id });
  const p2 = laborTrackingService.pausarApontamento({ tenantId: 'oficina_teste_1', state, entryId: r1.entry.id });
  assert.equal(p2.idempotente, true);
});

test('30. Servidor Real E2E: ciclo HTTP completo (equipe -> iniciar -> pausar -> retomar -> encerrar -> custos da OS)', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'patio-labor-e2e-'));
  const tempDb = path.join(tempDir, 'test.db');
  const port = await getFreePort();
  const tenantId = 'tenant_e2e_labor_' + Date.now();
  const serverPath = path.resolve(__dirname, '../server.js');

  const proc = spawn('node', [serverPath], {
    env: {
      ...process.env,
      PORT: String(port),
      NODE_ENV: 'test',
      DB_PATH: tempDb,
      API_KEY: 'patio-crm-admin-2026',
      AUTH_USER: 'patio',
      AUTH_PASSWORD: 'patio-password-test',
      DEFAULT_SINGLE_TENANT_ID: 'default',
      DISABLE_INTEGRATIONS: 'true'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let serverStderr = '';
  proc.stderr.on('data', d => { serverStderr += d.toString(); });

  let serverStarted = false;
  for (let i = 0; i < 100; i++) {
    if (proc.exitCode !== null) throw new Error('Falha ao iniciar servidor de teste: ' + serverStderr);
    try {
      const res = await fetch(`http://127.0.0.1:${port}/`);
      if (res.status === 401 || res.status === 200) {
        serverStarted = true;
        break;
      }
    } catch (_) {}
    await new Promise(r => setTimeout(r, 100));
  }
  if (!serverStarted) throw new Error('Timeout ao aguardar servidor: ' + serverStderr);

  try {
    const headers = {
      'Content-Type': 'application/json',
      'x-api-key': 'patio-crm-admin-2026',
      'x-tenant-id': tenantId
    };

    // 1. Cadastra colaborador
    const resW = await fetch(`http://127.0.0.1:${port}/api/equipe`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ nome: 'Mecânico E2E', custoHora: 50.0, jornadaHorasDia: 8 })
    });
    assert.equal(resW.status, 200);
    const jsonW = await resW.json();
    assert.equal(jsonW.success, true);
    const workerId = jsonW.worker.id;

    // 2. Consulta equipe agora (deve estar livre)
    const resAgora = await fetch(`http://127.0.0.1:${port}/api/equipe/agora`, { headers });
    assert.equal(resAgora.status, 200);
    const jsonAgora = await resAgora.json();
    assert.equal(jsonAgora.equipe.totalLivres, 1);

    // 3. Cadastra OS de teste
    const resOS = await fetch(`http://127.0.0.1:${port}/api/os/entrada`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        placa: 'TEST1234',
        modelo: 'Scania R450',
        clienteNome: 'Cliente E2E',
        servicos: [{ id: 'srv_e2e', nome: 'Manutenção Preventiva', valor: 600, preco: 600, autorizado: true, status: 'aprovado' }]
      })
    });
    const jsonOS = await resOS.json();
    const osId = jsonOS.osId || jsonOS.os?.id;

    // 4. Inicia apontamento
    const resIni = await fetch(`http://127.0.0.1:${port}/api/apontamentos/iniciar`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ workerId, osId, serviceItemId: 'srv_e2e' })
    });
    assert.equal(resIni.status, 200);
    const jsonIni = await resIni.json();
    const entryId = jsonIni.entry.id;

    // 5. Pausa apontamento
    const resPausa = await fetch(`http://127.0.0.1:${port}/api/apontamentos/${entryId}/pausar`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ motivo: 'espera_peca' })
    });
    assert.equal(resPausa.status, 200);

    // 6. Retoma apontamento
    const resRet = await fetch(`http://127.0.0.1:${port}/api/apontamentos/${entryId}/retomar`, {
      method: 'POST',
      headers,
      body: JSON.stringify({})
    });
    assert.equal(resRet.status, 200);

    // 7. Encerra apontamento
    const resFim = await fetch(`http://127.0.0.1:${port}/api/apontamentos/${entryId}/encerrar`, {
      method: 'POST',
      headers,
      body: JSON.stringify({})
    });
    assert.equal(resFim.status, 200);

    // 8. Consulta custos e margem da OS
    const resCustos = await fetch(`http://127.0.0.1:${port}/api/os/${osId}/custos`, { headers });
    assert.equal(resCustos.status, 200);
    const jsonCustos = await resCustos.json();
    assert.equal(jsonCustos.success, true);
    assert.ok(jsonCustos.custos.custoRealOS !== undefined);
  } finally {
    proc.kill('SIGTERM');
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}
  }
});
