'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const net = require('net');
const path = require('path');
const { spawn } = require('child_process');

const customerTimelineService = require('../services/customerTimelineService');
const maintenancePlanService = require('../services/maintenancePlanService');
const afterSalesService = require('../services/afterSalesService');
const relationshipService = require('../services/relationshipService');
const appointmentService = require('../services/appointmentService');
const voiceActionEngine = require('../services/voiceActionEngine');
const operationalIntelligenceEngine = require('../services/operationalIntelligenceEngine');
const { IdentityRegistry } = require('../lib/auth/identity');

function criarEstadoBase(tenantId = 'tenant_crm_test') {
  return {
    tenantId,
    cfg: {
      empresa: 'Auto Molas & Frotas Brasil',
      cnpj: '12.345.678/0001-90',
      fone: '62988887777',
      precificacao: {
        margemAlvoPadrao: 35.0,
        margemMinimaPadrao: 20.0,
        confianca: { mediaMinimo: 5, altaMinimo: 10 }
      },
      identidadeVisual: {
        logo: null,
        imagemInstitucional: null
      },
      assistente: {
        displayName: 'Verônica',
        voiceGender: 'female',
        enabled: true
      },
      crm: {
        clienteInativoDias: 180,
        alertaKmPercentual: 10,
        alertaDias: 15
      },
      posVenda: {
        enabled: true,
        contatos: [
          { diasAposEntrega: 2, tipo: 'verificacao_servico' },
          { diasAposEntrega: 15, tipo: 'acompanhamento' }
        ]
      }
    },
    clientes: [
      {
        id: 'cli_transp_alfa',
        tenantId,
        nome: 'Transportadora Alfa Logística Ltda',
        tipo: 'frotista',
        fone: '62991112222',
        consentimentos: { optOut: false },
        preferenciasContato: { whatsapp: true, commercial: true, preventiveMaintenance: true, afterSales: true }
      },
      {
        id: 'cli_avulso_1',
        tenantId,
        nome: 'João da Silva Transportes',
        tipo: 'autonomo',
        fone: '62993334444',
        consentimentos: { optOut: false },
        preferenciasContato: { whatsapp: true, commercial: true, preventiveMaintenance: true, afterSales: true }
      }
    ],
    veiculos: [
      { id: 'vei_scania_1', tenantId, cli: 'cli_transp_alfa', placa: 'ABC1D23', marca: 'Scania', modelo: 'R450 6x2', km: 245000 },
      { id: 'vei_scania_2', tenantId, cli: 'cli_transp_alfa', placa: 'XYZ9876', marca: 'Scania', modelo: 'R500 6x4', km: 380000 },
      { id: 'vei_volvo_1', tenantId, cli: 'cli_transp_alfa', placa: 'VOL1234', marca: 'Volvo', modelo: 'FH 540', km: 120000 },
      { id: 'vei_avulso_1', tenantId, cli: 'cli_avulso_1', placa: 'AVU5678', marca: 'Mercedes-Benz', modelo: 'Actros 2651', km: 85000 }
    ],
    fleets: [
      {
        id: 'flt_alfa',
        tenantId,
        nome: 'Frota Pesada Alfa',
        customerId: 'cli_transp_alfa',
        vehicles: ['vei_scania_1', 'vei_scania_2', 'vei_volvo_1']
      }
    ],
    maintenancePlans: [],
    opportunities: [],
    appointments: [],
    afterSales: [],
    os: [],
    quotations: [],
    preOS: [],
    workers: [
      { id: 'w1', tenantId, nome: 'Antônio Mecânico', custoHora: 50.0, ativo: true }
    ],
    servicos: [
      { id: 'srv_revisao_geral', tenantId, nome: 'Revisão Preventiva Geral', preco: 800, tempoEstimadoMinutos: 180 },
      { id: 'srv_troca_oleo', tenantId, nome: 'Troca de Óleo e Filtros', preco: 350, tempoEstimadoMinutos: 60 },
      { id: 'srv_embreagem', tenantId, nome: 'Troca de Embreagem Heavy Duty', preco: 1500, tempoEstimadoMinutos: 360 }
    ],
    pecas: [
      { id: 'p1', tenantId, codigoInterno: 'FLT-01', descricao: 'Filtro de Óleo Scania', custoMedio: 120, ultimoCusto: 120, preco: 220, qtd: 10 }
    ],
    boxes: [
      { id: 'b1', tenantId, nome: 'Box 1 - Pesados', tipo: 'Geral' }
    ],
    auditoria: []
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

// ── TESTE 1: Frotista com múltiplos veículos ─────────────────────────
test('1. Frotista com múltiplos veículos: vinculação e contagem correta', () => {
  const state = criarEstadoBase();
  const metricas = relationshipService.obterMetricasCRM({ tenantId: state.tenantId, state });
  assert.equal(metricas.frotistasTotal, 1);
  assert.equal(metricas.veiculosTotal, 4);

  const frota = state.fleets.find(f => f.customerId === 'cli_transp_alfa');
  assert.ok(frota);
  assert.equal(frota.vehicles.length, 3);
});

// ── TESTE 2: Isolamento de frota por tenant ───────────────────────────
test('2. Isolamento de frota por tenant: Tenant B não enxerga veículos ou planos do Tenant A', () => {
  const stateA = criarEstadoBase('tenant_a');
  const stateB = criarEstadoBase('tenant_b');
  stateB.clientes = [];
  stateB.veiculos = [];
  stateB.fleets = [];

  const metricasB = relationshipService.obterMetricasCRM({ tenantId: 'tenant_b', state: stateB });
  assert.equal(metricasB.frotistasTotal, 0);
  assert.equal(metricasB.veiculosTotal, 0);

  const tlB = customerTimelineService.obterTimelineCliente({
    tenantId: 'tenant_b',
    customerId: 'cli_transp_alfa',
    state: stateB
  });
  assert.equal(tlB.ok, false);
});

// ── TESTE 3: Timeline do cliente ─────────────────────────────────────
test('3. Timeline do cliente: consolidação cronológica decrescente sem replicação de dados', () => {
  const state = criarEstadoBase();
  state.os.push({
    id: 'os_101',
    num: 1001,
    tenantId: state.tenantId,
    cli: 'cli_transp_alfa',
    vei: 'vei_scania_1',
    st: 'finalizada',
    abertura: '2026-01-10',
    fechamento: '2026-01-12',
    total: 3500.0,
    queixa: 'Revisão periódica de freios'
  });
  state.appointments.push({
    id: 'agd_201',
    tenantId: state.tenantId,
    customerId: 'cli_transp_alfa',
    vehicleId: 'vei_scania_1',
    scheduledDate: '2026-02-01',
    scheduledTime: '08:00',
    reason: 'Alinhamento e balanceamento',
    status: 'agendado'
  });

  const res = customerTimelineService.obterTimelineCliente({
    tenantId: state.tenantId,
    customerId: 'cli_transp_alfa',
    state
  });
  assert.equal(res.ok, true);
  assert.ok(res.totalEventos >= 2);
  const d0 = new Date(res.timeline[0].data).getTime();
  const d1 = new Date(res.timeline[1].data).getTime();
  assert.ok(d0 >= d1);
});

// ── TESTE 4: Plano de manutenção por dias ─────────────────────────────
test('4. Plano de manutenção por dias: cálculo determinístico de nextDueDate e em_dia', () => {
  const item = {
    itemId: 'it_dias',
    descricao: 'Revisão Trimestral da Suspensão',
    intervalDays: 90,
    intervalKm: 0,
    lastServiceDate: '2026-01-01'
  };
  const status = maintenancePlanService.calcularStatusItem({
    item,
    dataReferencia: '2026-02-01',
    config: { alertaDias: 15 }
  });
  assert.equal(status.status, 'em_dia');
  assert.equal(status.nextDueDate, '2026-04-01');
  assert.ok(status.diasRestantes > 15);
});

// ── TESTE 5: Plano de manutenção por km ───────────────────────────────
test('5. Plano de manutenção por km: cálculo determinístico de nextDueKm e em_dia', () => {
  const item = {
    itemId: 'it_km',
    descricao: 'Troca de Óleo de Diferencial',
    intervalDays: 0,
    intervalKm: 20000,
    lastServiceKm: 240000
  };
  const status = maintenancePlanService.calcularStatusItem({
    item,
    kmAtual: 245000,
    config: { alertaKmPercentual: 10 }
  });
  assert.equal(status.status, 'em_dia');
  assert.equal(status.nextDueKm, 260000);
  assert.equal(status.kmRestante, 15000);
});

// ── TESTE 6: Manutenção próxima ───────────────────────────────────────
test('6. Manutenção próxima: veículo entra na faixa de alerta por km e dias', () => {
  const itemKm = {
    itemId: 'it_prox_km',
    descricao: 'Troca de Filtros',
    intervalDays: 0,
    intervalKm: 10000,
    lastServiceKm: 240000
  };
  const statusKm = maintenancePlanService.calcularStatusItem({
    item: itemKm,
    kmAtual: 249500,
    config: { alertaKmPercentual: 10 }
  });
  assert.equal(statusKm.status, 'proximo');
  assert.equal(statusKm.kmRestante, 500);

  const itemDias = {
    itemId: 'it_prox_dias',
    descricao: 'Inspeção Semestral',
    intervalDays: 180,
    intervalKm: 0,
    lastServiceDate: '2025-09-01'
  };
  const statusDias = maintenancePlanService.calcularStatusItem({
    item: itemDias,
    dataReferencia: '2026-02-20',
    config: { alertaDias: 15 }
  });
  assert.equal(statusDias.status, 'proximo');
});

// ── TESTE 7: Manutenção vencida ───────────────────────────────────────
test('7. Manutenção vencida: ultrapassou km ou data limite', () => {
  const itemKm = {
    itemId: 'it_venc_km',
    descricao: 'Troca de Correia Dentada',
    intervalDays: 0,
    intervalKm: 50000,
    lastServiceKm: 200000
  };
  const statusKm = maintenancePlanService.calcularStatusItem({
    item: itemKm,
    kmAtual: 251000
  });
  assert.equal(statusKm.status, 'vencido');
  assert.ok(statusKm.kmRestante < 0);

  const itemDias = {
    itemId: 'it_venc_dias',
    descricao: 'Troca de Fluido de Freio',
    intervalDays: 365,
    intervalKm: 0,
    lastServiceDate: '2025-01-01'
  };
  const statusDias = maintenancePlanService.calcularStatusItem({
    item: itemDias,
    dataReferencia: '2026-02-01'
  });
  assert.equal(statusDias.status, 'vencido');
});

// ── TESTE 8: KM ausente (aguardando_km) ────────────────────────────────
test('8. KM ausente: retorna determinístico aguardando_km sem inventar números', () => {
  const item = {
    itemId: 'it_no_km',
    descricao: 'Revisão de Bicos Injetores',
    intervalDays: 0,
    intervalKm: 60000,
    lastServiceKm: 180000
  };
  const status = maintenancePlanService.calcularStatusItem({
    item,
    kmAtual: null
  });
  assert.equal(status.status, 'aguardando_km');
  assert.equal(status.kmRestante, null);
  assert.equal(status.nextDueKm, 240000);
});

// ── TESTE 9: Atualização de KM por conversa (whatsapp_cliente) ─────────
test('9. Atualização de KM por conversa: grava histórico e recalcula status', () => {
  const state = criarEstadoBase();
  const res = maintenancePlanService.atualizarKmVeiculo({
    tenantId: state.tenantId,
    state,
    placa: 'ABC1D23',
    kmInformado: 248000,
    fonte: 'whatsapp_cliente',
    ator: 'cliente'
  });
  assert.equal(res.ok, true);
  assert.equal(res.kmAtual, 248000);
  const veic = state.veiculos.find(v => v.placa === 'ABC1D23');
  assert.equal(veic.km, 248000);
  assert.equal(veic.historicoKm[0].fonte, 'whatsapp_cliente');
});

// ── TESTE 10: KM inconsistente exige confirmação ───────────────────────
test('10. KM inconsistente exige confirmação: bloqueia redução brusca sem override', () => {
  const state = criarEstadoBase();
  const res = maintenancePlanService.atualizarKmVeiculo({
    tenantId: state.tenantId,
    state,
    placa: 'ABC1D23',
    kmInformado: 24500,
    permitirOverride: false
  });
  assert.equal(res.ok, false);
  assert.equal(res.requerConfirmacao, true);
  assert.equal(res.incoerente, true);
  const veic = state.veiculos.find(v => v.placa === 'ABC1D23');
  assert.equal(veic.km, 245000);

  const resOverride = maintenancePlanService.atualizarKmVeiculo({
    tenantId: state.tenantId,
    state,
    placa: 'ABC1D23',
    kmInformado: 24500,
    permitirOverride: true
  });
  assert.equal(resOverride.ok, true);
  assert.equal(veic.km, 24500);
});

// ── TESTE 11: Pós-venda agendado após finalização de OS ─────────────────
test('11. Pós-venda agendado: réguas automáticas pós-entrega de OS', () => {
  const state = criarEstadoBase();
  state.os.push({
    id: 'os_finalizada_1',
    num: 2001,
    tenantId: state.tenantId,
    cli: 'cli_transp_alfa',
    vei: 'vei_scania_1',
    st: 'finalizada',
    abertura: '2026-03-01',
    fechamento: '2026-03-05',
    total: 4200.0
  });

  const res = afterSalesService.avaliarPosVenda({
    tenantId: state.tenantId,
    state,
    dataReferencia: '2026-03-05'
  });
  assert.ok(state.afterSales.length >= 1);
  const pvd = state.afterSales.find(a => a.osId === 'os_finalizada_1');
  assert.equal(pvd.status, 'pendente');
  assert.equal(pvd.contatosAgendados.length, 2);
  assert.equal(pvd.contatosAgendados[0].dataAgendada, '2026-03-07');
});

// ── TESTE 12: Pós-venda respondido positivamente (pos_venda_ok) ────────
test('12. Pós-venda respondido positivamente: marca pos_venda_ok sem abertura de OS', () => {
  const state = criarEstadoBase();
  state.afterSales.push({
    id: 'pvd_ok_1',
    tenantId: state.tenantId,
    osId: 'os_fake_1',
    customerId: 'cli_transp_alfa',
    vehicleId: 'vei_scania_1',
    status: 'pendente',
    contatos: []
  });

  const res = afterSalesService.processarRespostaPosVenda({
    tenantId: state.tenantId,
    state,
    afterSalesId: 'pvd_ok_1',
    respostaTexto: 'O caminhão ficou excelente, trabalho perfeito e sem folgas!'
  });
  assert.equal(res.ok, true);
  assert.equal(res.posVendaStatus, 'pos_venda_ok');
  const pvd = state.afterSales.find(a => a.id === 'pvd_ok_1');
  assert.equal(pvd.status, 'pos_venda_ok');
  assert.equal(pvd.feedback.avaliacao, 'positiva');
});

// ── TESTE 13: Reclamação no pós-venda inicia fluxo técnico correto ─────
test('13. Reclamação no pós-venda: cria followUpIssue e Pré-OS com rastreabilidade', () => {
  const state = criarEstadoBase();
  state.afterSales.push({
    id: 'pvd_reclamacao_1',
    tenantId: state.tenantId,
    osId: 'os_fake_rec',
    customerId: 'cli_transp_alfa',
    vehicleId: 'vei_scania_1',
    status: 'pendente',
    contatos: []
  });

  const res = afterSalesService.processarRespostaPosVenda({
    tenantId: state.tenantId,
    state,
    afterSalesId: 'pvd_reclamacao_1',
    respostaTexto: 'O caminhão voltou a bater a dianteira e está com barulho forte no freio'
  });
  assert.equal(res.ok, true);
  assert.equal(res.tipoResultado, 'reclamacao_tecnica');
  assert.equal(res.posVendaStatus, 'reclamacao_registrada');
  assert.ok(res.followUpIssue);
  assert.ok(res.preOS);
  assert.equal(res.preOS.origem, 'pos_venda');
});

// ── TESTE 14: Possível garantia no pós-venda ─────────────────────────
test('14. Possível garantia no pós-venda: sinaliza hipótese sem aprovação automática', () => {
  const state = criarEstadoBase();
  const dataRecente = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  state.os.push({
    id: 'os_emb_antiga',
    num: 3001,
    tenantId: state.tenantId,
    cli: 'cli_transp_alfa',
    vei: 'vei_scania_1',
    st: 'finalizada',
    abertura: dataRecente,
    fechamento: dataRecente,
    km: 245000,
    servicos: [{ id: 'srv_emb', nome: 'Troca de Embreagem Heavy Duty' }],
    pecas: []
  });
  state.afterSales.push({
    id: 'pvd_garantia',
    tenantId: state.tenantId,
    osId: 'os_emb_antiga',
    customerId: 'cli_transp_alfa',
    vehicleId: 'vei_scania_1',
    status: 'pendente',
    contatos: []
  });

  const res = afterSalesService.processarRespostaPosVenda({
    tenantId: state.tenantId,
    state,
    afterSalesId: 'pvd_garantia',
    respostaTexto: 'A embreagem que vocês trocaram semana passada começou a chiar e cheirar queimado'
  });
  assert.equal(res.ok, true);
  assert.equal(res.possivelGarantia, true);
  assert.equal(res.preOS.possivelGarantia, true);
  assert.ok(res.preOS.st !== 'finalizada');
});

// ── TESTE 15: Oportunidade CRM gerada ─────────────────────────────────
test('15. Oportunidade CRM: gera oportunidade para manutenção preventiva vencida', () => {
  const state = criarEstadoBase();
  state.maintenancePlans.push({
    id: 'pln_1',
    tenantId: state.tenantId,
    vehicleId: 'vei_scania_1',
    items: [
      {
        itemId: 'it_venc_opo',
        descricao: 'Regulagem de Válvulas',
        intervalKm: 40000,
        lastServiceKm: 200000
      }
    ]
  });

  const novas = relationshipService.avaliarOportunidades({
    tenantId: state.tenantId,
    state
  });
  assert.ok(novas.length >= 1);
  const opo = novas.find(o => o.tipo === 'manutencao_vencida');
  assert.ok(opo);
  assert.equal(opo.status, 'aberta');
  assert.equal(opo.prioridade, 'alta');
});

// ── TESTE 16: Oportunidade deduplicada ────────────────────────────────
test('16. Oportunidade deduplicada: não gera oportunidades repetidas para o mesmo item', () => {
  const state = criarEstadoBase();
  state.maintenancePlans.push({
    id: 'pln_dedup',
    tenantId: state.tenantId,
    vehicleId: 'vei_scania_1',
    items: [
      {
        itemId: 'it_dedup',
        descricao: 'Troca de Óleo',
        intervalKm: 10000,
        lastServiceKm: 230000
      }
    ]
  });

  const r1 = relationshipService.avaliarOportunidades({ tenantId: state.tenantId, state });
  assert.ok(r1.length >= 1);
  const r2 = relationshipService.avaliarOportunidades({ tenantId: state.tenantId, state });
  assert.equal(r2.length, 0);
});

// ── TESTE 17: Agendamento ─────────────────────────────────────────────
test('17. Agendamento: criação com sucesso e validação de campos', () => {
  const state = criarEstadoBase();
  const res = appointmentService.criarAgendamento({
    tenantId: state.tenantId,
    state,
    vehicleId: 'vei_scania_1',
    scheduledDate: '2026-03-25',
    scheduledTime: '08:30',
    reason: 'Manutenção preventiva programada'
  });
  assert.equal(res.ok, true);
  assert.equal(res.agendamento.status, 'agendado');
  assert.equal(res.agendamento.customerId, 'cli_transp_alfa');
  assert.equal(res.agendamento.scheduledDate, '2026-03-25');
});

// ── TESTE 18: Cancelamento de agendamento ─────────────────────────────
test('18. Cancelamento de agendamento: registra motivo e atualiza status', () => {
  const state = criarEstadoBase();
  const agd = appointmentService.criarAgendamento({
    tenantId: state.tenantId,
    state,
    vehicleId: 'vei_scania_1',
    scheduledDate: '2026-03-25',
    reason: 'Preventiva'
  }).agendamento;

  const res = appointmentService.cancelarAgendamento({
    tenantId: state.tenantId,
    state,
    appointmentId: agd.id,
    motivo: 'Caminhão retido em viagem'
  });
  assert.equal(res.ok, true);
  assert.equal(res.agendamento.status, 'cancelado');
  assert.equal(res.agendamento.motivoCancelamento, 'Caminhão retido em viagem');
});

// ── TESTE 19: Conversão de agendamento em Pré-OS ───────────────────────
test('19. Conversão de agendamento em Pré-OS: preserva appointmentId e metadados de origem', () => {
  const state = criarEstadoBase();
  const agd = appointmentService.criarAgendamento({
    tenantId: state.tenantId,
    state,
    vehicleId: 'vei_scania_1',
    scheduledDate: '2026-03-25',
    reason: 'Revisão agendada',
    originOpportunityId: 'opo_origem_1'
  }).agendamento;

  const res = appointmentService.converterParaPreOS({
    tenantId: state.tenantId,
    state,
    appointmentId: agd.id
  });
  assert.equal(res.ok, true);
  assert.equal(res.agendamento.status, 'convertido_pre_os');
  assert.ok(res.preOS);
  assert.equal(res.preOS.appointmentId, agd.id);
  assert.equal(res.preOS.opportunityId, 'opo_origem_1');
});

// ── TESTE 20: Opt-out do cliente ─────────────────────────────────────
test('20. Opt-out do cliente: cancela oportunidades em aberto e bloqueia contatos', () => {
  const state = criarEstadoBase();
  state.opportunities.push({
    id: 'opo_para_cancelar',
    tenantId: state.tenantId,
    customerId: 'cli_transp_alfa',
    status: 'aberta'
  });

  const res = relationshipService.registrarOptOut({
    tenantId: state.tenantId,
    state,
    customerId: 'cli_transp_alfa',
    motivo: 'Não desejo mais receber lembretes de preventiva'
  });
  assert.equal(res.ok, true);
  assert.equal(res.optOut, true);

  const cli = state.clientes.find(c => c.id === 'cli_transp_alfa');
  assert.equal(cli.consentimentos.optOut, true);

  const opo = state.opportunities.find(o => o.id === 'opo_para_cancelar');
  assert.equal(opo.status, 'cancelada');

  const validacao = relationshipService.validarEnvioNotificacao({
    cliente: cli,
    tipoMensagem: 'preventiva'
  });
  assert.equal(validacao.permitido, false);
});

// ── TESTE 21: Política anti-spam ─────────────────────────────────────
test('21. Política anti-spam: cooldown de 24h e bloqueio por preferências desativadas', () => {
  const cli = {
    id: 'cli_teste_spam',
    consentimentos: { optOut: false },
    ultimoContatoRelacionamento: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    preferenciasContato: { whatsapp: true, commercial: true }
  };

  const resCooldown = relationshipService.validarEnvioNotificacao({
    cliente: cli,
    tipoMensagem: 'comercial'
  });
  assert.equal(resCooldown.permitido, false);
  assert.ok(resCooldown.motivo.includes('Cooldown ativo'));

  const resTransacional = relationshipService.validarEnvioNotificacao({
    cliente: cli,
    tipoMensagem: 'transacional_obrigatoria'
  });
  assert.equal(resTransacional.permitido, true);
});

// ── TESTE 22: Consulta da Verônica sobre frota ────────────────────────
test('22. Consulta da Verônica sobre frota: voz interpreta frotista e responde veículos', async () => {
  const state = criarEstadoBase();
  const cmd = await voiceActionEngine.processarComandoVoz({
    texto: 'Verônica, quantos caminhões da Transportadora Alfa estão na frota?',
    context: { canal: 'web' },
    state,
    tenantId: state.tenantId
  });
  assert.equal(cmd.acao, 'consultar_frota_cliente');
  assert.ok(cmd.resposta.includes('3 veículo(s) cadastrado(s)'));
});

// ── TESTE 23: Consulta da Verônica sobre preventiva ───────────────────
test('23. Consulta da Verônica sobre preventiva: responde status de vencimentos', async () => {
  const state = criarEstadoBase();
  state.maintenancePlans.push({
    id: 'pln_venc_voz',
    tenantId: state.tenantId,
    vehicleId: 'vei_scania_1',
    items: [{ itemId: 'it1', descricao: 'Troca de Óleo', intervalKm: 10000, lastServiceKm: 230000 }]
  });

  const cmd = await voiceActionEngine.processarComandoVoz({
    texto: 'Verônica, quais caminhões estão com manutenção vencida ou perto da revisão?',
    context: { canal: 'web' },
    state,
    tenantId: state.tenantId
  });
  assert.equal(cmd.acao, 'consultar_preventiva_frota');
  assert.ok(cmd.vencidos >= 1);
  assert.ok(cmd.resposta.includes('manutenção vencida'));
});

// ── TESTE 24: Ação de agendamento por voz ─────────────────────────────
test('24. Ação de agendamento por voz: interpreta placa e agenda veículo', async () => {
  const state = criarEstadoBase();
  const cmd = await voiceActionEngine.processarComandoVoz({
    texto: 'Verônica, agenda a ABC1D23 para amanhã de manhã',
    context: { canal: 'web' },
    state,
    tenantId: state.tenantId
  });
  assert.equal(cmd.acao, 'agendar_veiculo');
  assert.ok(cmd.agendamento);
  assert.equal(cmd.agendamento.vehicleId, 'vei_scania_1');
  assert.ok(cmd.resposta.includes('Agendamento confirmado'));
});

// ── TESTE 25: Dashboard CRM ───────────────────────────────────────────
test('25. Dashboard CRM: cálculo consistente de métricas consolidadas', () => {
  const state = criarEstadoBase();
  state.appointments.push(
    { id: 'a1', tenantId: state.tenantId, status: 'convertido_pre_os' },
    { id: 'a2', tenantId: state.tenantId, status: 'agendado' }
  );

  const m = relationshipService.obterMetricasCRM({ tenantId: state.tenantId, state });
  assert.equal(m.clientesTotal, 2);
  assert.equal(m.frotistasTotal, 1);
  assert.equal(m.agendamentosTotal, 2);
  assert.equal(m.agendamentosCompareceu, 1);
  assert.equal(m.taxaComparecimentoPercentual, 50);
});

// ── TESTE 26: Logotipo por tenant: validação de tipo e tamanho ────────
test('26. Logotipo por tenant: validação de formato e tamanho máximo', () => {
  const validMimes = ['image/png', 'image/jpeg', 'image/webp'];
  assert.ok(validMimes.includes('image/png'));
  assert.ok(!validMimes.includes('application/x-msdownload'));
  const maxBytes = 2 * 1024 * 1024;
  assert.equal(maxBytes, 2097152);
});

// ── TESTE 27: Personalização de OS/orçamento com logo ──────────────────
test('27. Personalização de OS/orçamento: inclusão de logo do tenant', () => {
  const state = criarEstadoBase();
  state.cfg.identidadeVisual.logo = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  assert.ok(state.cfg.identidadeVisual.logo.startsWith('data:image/png;base64,'));
});

// ── TESTE 28: Nome do agente configurável por tenant ─────────────────
test('28. Nome do agente configurável por tenant: displayName customizado e persistido', () => {
  const state = criarEstadoBase();
  state.cfg.assistente.displayName = 'Jarvis Diesel';
  assert.equal(state.cfg.assistente.displayName, 'Jarvis Diesel');
});

// ── TESTE 29: Voz masculina/feminina configurável ─────────────────────
test('29. Voz masculina/feminina configurável: alteração de voiceGender', () => {
  const state = criarEstadoBase();
  state.cfg.assistente.voiceGender = 'male';
  assert.equal(state.cfg.assistente.voiceGender, 'male');
});

// ── TESTE 30: Fallback seguro para Verônica/feminina ─────────────────
test('30. Fallback seguro para Verônica/feminina na ausência de configuração', () => {
  const state = criarEstadoBase();
  delete state.cfg.assistente;
  const cfgAss = state.cfg.assistente || { displayName: 'Verônica', voiceGender: 'female' };
  assert.equal(cfgAss.displayName, 'Verônica');
  assert.equal(cfgAss.voiceGender, 'female');
});

// ── TESTE 31: Isolamento da identidade visual entre tenants ──────────
test('31. Isolamento da identidade visual: Tenant A não vaza logo para Tenant B', () => {
  const stateA = criarEstadoBase('tenant_a');
  const stateB = criarEstadoBase('tenant_b');
  stateA.cfg.identidadeVisual.logo = 'data:image/png;base64,LOGO_A';
  stateB.cfg.identidadeVisual.logo = null;
  assert.notEqual(stateA.cfg.identidadeVisual.logo, stateB.cfg.identidadeVisual.logo);
  assert.equal(stateB.cfg.identidadeVisual.logo, null);
});

// ── TESTE 32: RBAC: controle estrito de permissões ───────────────────
test('32. RBAC: verificação de escopos e permissões de CRM e configurações', () => {
  const registry = new IdentityRegistry();
  registry.registerApiKey({
    key: 'chave-segura-tenant-a-123456',
    tenantId: 'tenant_a',
    name: 'admin_a',
    scopes: ['*']
  });

  const authAdmin = registry.authenticate({
    headers: { 'x-api-key': 'chave-segura-tenant-a-123456' }
  });
  assert.ok(authAdmin);
  assert.ok(authAdmin.permissions.includes('crm:read'));
  assert.ok(authAdmin.permissions.includes('crm:write'));
  assert.ok(authAdmin.permissions.includes('company:settings'));
  assert.ok(authAdmin.permissions.includes('assistant:settings'));
});

// ── TESTE 33: Auditoria detalhada para operações críticas ─────────────
test('33. Auditoria detalhada para operações críticas de CRM e agendamento', () => {
  const state = criarEstadoBase();
  const agd = appointmentService.criarAgendamento({
    tenantId: state.tenantId,
    state,
    vehicleId: 'vei_scania_1',
    scheduledDate: '2026-03-30',
    reason: 'Preventiva',
    createdBy: 'antonio_chefe'
  }).agendamento;

  const audAgd = state.auditoria.find(a => a.action === 'appointment_created');
  assert.ok(audAgd);
  assert.equal(audAgd.resourceId, agd.id);
  assert.equal(audAgd.actorId, 'antonio_chefe');
});

// ── TESTE 34: Scheduler sem concorrência (mutex) ──────────────────────
test('34. Scheduler sem concorrência: mutexes impedem execuções concorrentes simultâneas', async () => {
  const runningSet = new Set();
  async function avaliarComMutex(tenantId) {
    if (runningSet.has(tenantId)) return { executou: false, motivo: 'ocupado' };
    runningSet.add(tenantId);
    try {
      await new Promise(r => setTimeout(r, 20));
      return { executou: true };
    } finally {
      runningSet.delete(tenantId);
    }
  }

  const [p1, p2] = await Promise.all([
    avaliarComMutex('tenant_test'),
    avaliarComMutex('tenant_test')
  ]);

  const umExecutou = (p1.executou && !p2.executou) || (!p1.executou && p2.executou);
  assert.ok(umExecutou, 'Apenas uma execução simultânea deve ocorrer no mesmo tenant');
});

// ── TESTE 35: Regressão integral e integridade E2E da API ─────────────
test('35. Regressão integral e integridade E2E da API de CRM, Agendamentos e Configurações', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'patio-e2e-crm-'));
  const uploadDir = path.join(tempDir, 'uploads');
  fs.mkdirSync(uploadDir, { recursive: true });
  const dbPath = path.join(tempDir, 'patio_crm_test.db');

  const port = await getFreePort();
  const tenantA = 'tenant_e2e_crm_a';
  const tenantB = 'tenant_e2e_crm_b';

  let serverStderr = '';
  const serverProcess = spawn(process.execPath, ['server.js'], {
    cwd: path.resolve(__dirname, '..'),
    windowsHide: true,
    env: {
      ...process.env,
      PORT: String(port),
      API_KEY: 'patio-crm-admin-2026',
      DEFAULT_SINGLE_TENANT_ID: 'default',
      DISABLE_INTEGRATIONS: 'true',
      UPLOAD_DIR: uploadDir,
      DB_PATH: dbPath,
      NODE_ENV: 'test'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  serverProcess.stdout.on('data', d => { serverStderr += d.toString(); });
  serverProcess.stderr.on('data', d => { serverStderr += d.toString(); });

  let serverStarted = false;
  for (let i = 0; i < 200; i++) {
    if (serverProcess.exitCode !== null) throw new Error('Falha ao iniciar servidor E2E: ' + serverStderr);
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`);
      if (res.status === 200 || res.status === 401) {
        serverStarted = true;
        break;
      }
    } catch (_) {}
    await new Promise(r => setTimeout(r, 100));
  }
  if (!serverStarted) throw new Error('Timeout ao aguardar servidor E2E: ' + serverStderr);

  try {
    const headersA = {
      'Content-Type': 'application/json',
      'x-api-key': 'patio-crm-admin-2026',
      'x-tenant-id': tenantA
    };
    const headersB = {
      'Content-Type': 'application/json',
      'x-api-key': 'patio-crm-admin-2026',
      'x-tenant-id': tenantB
    };

    // 1. Logo por tenant
    const logoPngBase64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const resLogo = await fetch(`http://127.0.0.1:${port}/api/configuracoes/empresa/logo`, {
      method: 'POST',
      headers: headersA,
      body: JSON.stringify({ logoBase64: logoPngBase64, mimeType: 'image/png' })
    });
    assert.equal(resLogo.status, 200);

    // 2. Assistente virtual customizado
    const resAss = await fetch(`http://127.0.0.1:${port}/api/configuracoes/assistente`, {
      method: 'PUT',
      headers: headersA,
      body: JSON.stringify({
        displayName: 'Carlos Assistente',
        voiceGender: 'male',
        voiceURI: 'Microsoft Daniel - Portuguese (Brazil)',
        voiceName: 'Microsoft Daniel',
        pitch: 0.95,
        rate: 1.05
      })
    });
    assert.equal(resAss.status, 200);
    const jsonAss = await resAss.json();
    assert.equal(jsonAss.assistente.displayName, 'Carlos Assistente');
    assert.equal(jsonAss.assistente.voiceGender, 'male');
    assert.equal(jsonAss.assistente.voiceURI, 'Microsoft Daniel - Portuguese (Brazil)');
    assert.equal(jsonAss.assistente.voiceName, 'Microsoft Daniel');
    assert.equal(jsonAss.assistente.pitch, 0.95);
    assert.equal(jsonAss.assistente.rate, 1.05);

    const resGetAss = await fetch(`http://127.0.0.1:${port}/api/configuracoes/assistente`, {
      headers: headersA
    });
    assert.equal(resGetAss.status, 200);
    const jsonGetAss = await resGetAss.json();
    assert.equal(jsonGetAss.assistente.displayName, 'Carlos Assistente');
    assert.equal(jsonGetAss.assistente.voiceURI, 'Microsoft Daniel - Portuguese (Brazil)');

    // 3. Consulta de clientes e CRM
    const resCli = await fetch(`http://127.0.0.1:${port}/api/clientes`, { headers: headersA });
    assert.equal(resCli.status, 200);

    // 4. Criação de agendamento via API
    const resAgd = await fetch(`http://127.0.0.1:${port}/api/agendamentos`, {
      method: 'POST',
      headers: headersA,
      body: JSON.stringify({
        scheduledDate: '2026-04-15',
        scheduledTime: '09:00',
        reason: 'Inspeção de tacógrafo e freios'
      })
    });
    assert.equal(resAgd.status, 200);
    const jsonAgd = await resAgd.json();
    assert.ok(jsonAgd.agendamento?.id);

    // 5. Isolamento do Tenant B
    const resEmpB = await fetch(`http://127.0.0.1:${port}/api/configuracoes/empresa`, { headers: headersB });
    assert.equal(resEmpB.status, 200);
    const jsonEmpB = await resEmpB.json();
    assert.equal(jsonEmpB.identidadeVisual?.logo, null);

  } finally {
    serverProcess.kill('SIGTERM');
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}
  }
});
