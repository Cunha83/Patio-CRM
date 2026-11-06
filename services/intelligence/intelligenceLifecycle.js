'use strict';

const { obterAgoraSP } = require('../financialEngine');
const {
  gerarId,
  parseDataHora,
  registrarAuditoria
} = require('./intelligenceHelpers');
const { detectarRegrasVeiculosEPatio } = require('./intelligenceVehicleRules');
const { detectarRegrasIntakeEOrcamentos } = require('./intelligenceIntakeRules');
const { detectarRegrasEstoqueEMaoDeObra } = require('./intelligenceStockLaborRules');
const { detectarRegrasMargemECRM } = require('./intelligenceMarginCrmRules');

/**
 * Avalia continuamente o estado operacional da oficina para um tenant específico
 */
function avaliarOperacao(params) {
  const p = params && params.state ? params : { state: params, tenantId: params?.tenantId || 'default' };
  const tenantId = p.tenantId || p.state?.tenantId || 'default';
  const state = p.state;
  const dataReferencia = p.dataReferencia || null;
  const horaReferencia = p.horaReferencia || null;
  const agoraIso = p.agoraIso || null;
  const agoraDate = p.agoraDate || null;

  if (!state) {
    throw new Error('Estado do tenant é obrigatório.');
  }

  state.operationalEvents = Array.isArray(state.operationalEvents) ? state.operationalEvents : [];
  state.os = Array.isArray(state.os) ? state.os : [];
  state.veiculos = Array.isArray(state.veiculos) ? state.veiculos : [];
  state.boxes = Array.isArray(state.boxes) ? state.boxes : [];
  state.preOS = Array.isArray(state.preOS) ? state.preOS : [];
  state.intakeSessions = Array.isArray(state.intakeSessions) ? state.intakeSessions : [];
  const cfg = state.cfg || {};
  const cfgOp = cfg.operacao || {};

  // Determina o momento presente da avaliação
  let agora;
  if (agoraDate instanceof Date && !isNaN(agoraDate.getTime())) {
    agora = agoraDate;
  } else if (agoraIso) {
    agora = new Date(agoraIso);
  } else if (dataReferencia && horaReferencia) {
    agora = parseDataHora(dataReferencia, horaReferencia);
  } else if (dataReferencia) {
    agora = parseDataHora(dataReferencia, '12:00');
  } else {
    agora = new Date();
  }
  if (!agora || isNaN(agora.getTime())) agora = new Date();

  const infoAgoraSP = obterAgoraSP(agora);
  const dataHojeISO = dataReferencia || infoAgoraSP.dataISO;
  const agoraTimestampISO = agora.toISOString();

  // Limites configuráveis por tenant com defaults determinísticos
  const limitesVeiculo = {
    critico: Number(cfgOp.limitesVeiculoParado?.horasCritico) || 24,
    alto: Number(cfgOp.limitesVeiculoParado?.horasAlto) || 12,
    atencao: Number(cfgOp.limitesVeiculoParado?.horasAtencao) || 6
  };

  const limitesOS = {
    alto: Number(cfgOp.limitesSemEvolucao?.horasAlto) || 8,
    atencao: Number(cfgOp.limitesSemEvolucao?.horasAtencao) || 4
  };

  const limitesGargalos = {
    peca: Number(cfgOp.gargalos?.peca) || 3,
    diagnostico: Number(cfgOp.gargalos?.diagnostico) || 3,
    fila: Number(cfgOp.gargalos?.fila) || 4
  };

  // Conjunto de chaves de deduplicação ativas nesta rodada
  const activeDetectedKeys = new Set();
  const detectedEvents = [];

  // Regras 1 a 5 (Pátio, Veículos, Boxes, Gargalos de Estágio)
  detectarRegrasVeiculosEPatio({
    tenantId,
    state,
    agora,
    limitesVeiculo,
    limitesOS,
    limitesGargalos,
    activeDetectedKeys,
    detectedEvents
  });

  // Regras 6 a 8 (Pré-OS, Intake, Garantias, Orçamentos)
  detectarRegrasIntakeEOrcamentos({
    tenantId,
    state,
    agora,
    activeDetectedKeys,
    detectedEvents
  });

  // Regras 9 e 10 (Almoxarifado, Peças, Mão de Obra e Produtividade)
  detectarRegrasEstoqueEMaoDeObra({
    tenantId,
    state,
    agora,
    dataHojeISO,
    cfg,
    cfgOp,
    activeDetectedKeys,
    detectedEvents
  });

  // Regras 11 e 12 (Precificação, Rentabilidade, CRM e Preventiva)
  detectarRegrasMargemECRM({
    tenantId,
    state,
    dataHojeISO,
    activeDetectedKeys,
    detectedEvents
  });

  /* ─────────────────────────────────────────────────────────────────
   * CICLO DE VIDA, DEDUPLICAÇÃO E AUTO-RESOLUÇÃO
   * ───────────────────────────────────────────────────────────────── */
  const agoraStr = agoraTimestampISO;
  const eventosAtuais = state.operationalEvents;

  // 1. Processa eventos detectados nesta rodada
  for (const novo of detectedEvents) {
    const existente = eventosAtuais.find(e =>
      e.dedupeKey === novo.dedupeKey &&
      (e.status === 'aberto' || e.status === 'reconhecido')
    );

    if (existente) {
      existente.atualizadoEm = agoraStr;
      existente.descricao = novo.descricao;
      existente.detalhes = novo.detalhes;
      existente.referenciaId = novo.referenciaId || novo.recurso?.id || existente.referenciaId || null;
      existente.prioridade = novo.prioridade;
      existente.severidade = novo.severidade;
    } else {
      eventosAtuais.unshift({
        id: gerarId('ope'),
        tenantId,
        tipo: novo.tipo,
        referenciaId: novo.referenciaId || novo.recurso?.id || null,
        subtipo: novo.subtipo || null,
        prioridade: novo.prioridade,
        severidade: novo.severidade,
        status: 'aberto',
        titulo: novo.titulo,
        descricao: novo.descricao,
        recurso: novo.recurso,
        dedupeKey: novo.dedupeKey,
        criadoEm: agoraStr,
        atualizadoEm: agoraStr,
        reconhecidoEm: null,
        reconhecidoPor: null,
        reconhecidoMotivo: null,
        resolvidoEm: null,
        detalhes: novo.detalhes || {}
      });
    }
  }

  // 2. Auto-resolução: eventos que estavam abertos/reconhecidos mas cuja condição não é mais detectada
  for (const ev of eventosAtuais) {
    if ((ev.status === 'aberto' || ev.status === 'reconhecido') && !activeDetectedKeys.has(ev.dedupeKey)) {
      ev.status = 'resolvido';
      ev.resolvidoEm = agoraStr;
      ev.atualizadoEm = agoraStr;
      registrarAuditoria(state, {
        acao: 'evento_operacional_auto_resolvido',
        eventoId: ev.id,
        tipo: ev.tipo,
        dedupeKey: ev.dedupeKey,
        resolvidoEm: agoraStr
      });
    }
  }

  // Mantém tamanho máximo de histórico de eventos (máx 1000)
  if (state.operationalEvents.length > 1000) {
    state.operationalEvents = state.operationalEvents.slice(0, 1000);
  }

  const eventosAtivos = state.operationalEvents.filter(e => e.status === 'aberto' || e.status === 'reconhecido');
  return {
    tenantId,
    timestamp: agoraStr,
    totalDetectados: detectedEvents.length,
    novosOuAtivos: eventosAtivos.length,
    eventos: eventosAtivos,
    alertas: eventosAtivos,
    novosEventos: detectedEvents,
    find(...args) { return eventosAtivos.find(...args); },
    filter(...args) { return eventosAtivos.filter(...args); },
    some(...args) { return eventosAtivos.some(...args); },
    map(...args) { return eventosAtivos.map(...args); },
    forEach(...args) { return eventosAtivos.forEach(...args); },
    get length() { return eventosAtivos.length; }
  };
}

/**
 * Operador ou Gerente reconhece um evento ativo ("ciente", "já estou vendo")
 */
function reconhecerEvento({
  tenantId,
  eventId,
  actorId = 'operador',
  motivo = 'ciente',
  state,
  agoraIso = null
}) {
  if (!tenantId || !eventId || !state) {
    throw new Error('tenantId, eventId e state são obrigatórios.');
  }
  state.operationalEvents = Array.isArray(state.operationalEvents) ? state.operationalEvents : [];

  const ev = state.operationalEvents.find(e => e.id === eventId && (!e.tenantId || e.tenantId === tenantId));
  if (!ev) {
    return { ok: false, status: 404, error: 'Evento operacional não encontrado para este tenant.' };
  }
  if (!ev.tenantId) ev.tenantId = tenantId;

  if (ev.status === 'resolvido') {
    return { ok: false, status: 400, error: 'Evento operacional já está resolvido.' };
  }

  const agora = agoraIso || new Date().toISOString();
  ev.status = 'reconhecido';
  ev.reconhecidoEm = agora;
  ev.reconhecidoPor = actorId;
  ev.reconhecidoMotivo = motivo;
  ev.motivoReconhecimento = motivo;
  ev.atualizadoEm = agora;

  registrarAuditoria(state, {
    acao: 'evento_operacional_reconhecido',
    eventoId: ev.id,
    tipo: ev.tipo,
    usuario: actorId,
    motivo
  });

  return {
    ok: true,
    evento: ev
  };
}

/**
 * Lista eventos operacionais com filtros opcionais
 */
function listarEventos({
  tenantId,
  state,
  status = null,
  severidade = null,
  prioridade = null,
  tipo = null,
  limit = 50
}) {
  if (!state || !Array.isArray(state.operationalEvents)) return [];

  let filtrados = state.operationalEvents.filter(e => e.tenantId === tenantId);

  if (status) {
    const stArr = Array.isArray(status) ? status : [status];
    filtrados = filtrados.filter(e => stArr.includes(e.status));
  }
  if (severidade) {
    const sevArr = Array.isArray(severidade) ? severidade : [severidade];
    filtrados = filtrados.filter(e => sevArr.includes(e.severidade));
  }
  if (prioridade) {
    const priArr = Array.isArray(prioridade) ? prioridade : [prioridade];
    filtrados = filtrados.filter(e => priArr.includes(e.prioridade));
  }
  if (tipo) {
    filtrados = filtrados.filter(e => e.tipo === tipo);
  }

  const ordemP = { P1: 1, P2: 2, P3: 3, P4: 4 };
  filtrados.sort((a, b) => {
    const pDiff = (ordemP[a.prioridade] || 5) - (ordemP[b.prioridade] || 5);
    if (pDiff !== 0) return pDiff;
    return new Date(b.atualizadoEm || b.criadoEm).getTime() - new Date(a.atualizadoEm || a.criadoEm).getTime();
  });

  return filtrados.slice(0, limit);
}

/**
 * Consulta um evento operacional específico
 */
function obterEvento({ tenantId, state, eventId }) {
  if (!state || !Array.isArray(state.operationalEvents)) return null;
  return state.operationalEvents.find(e => e.id === eventId && e.tenantId === tenantId) || null;
}

module.exports = {
  avaliarOperacao,
  reconhecerEvento,
  listarEventos,
  obterEvento
};

