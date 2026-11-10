'use strict';

/**
 * Pátio CRM — Motor de Apontamento de Horas por Mecânico & Box
 * Módulo de rastreamento de execução real, pausas auditadas e índice de eficiência (< 300 linhas).
 */

const crypto = require('crypto');

function gerarId(prefix) {
  return prefix + '_' + Date.now() + '_' + crypto.randomBytes(3).toString('hex');
}

function garantirColecoes(state) {
  state.os = Array.isArray(state.os) ? state.os : (Array.isArray(state.serviceOrders) ? state.serviceOrders : []);
  state.timeLogs = Array.isArray(state.timeLogs) ? state.timeLogs : [];
  state.auditoria = Array.isArray(state.auditoria) ? state.auditoria : [];
}

function iniciarApontamentoServico(state, {
  tenantId = 'default',
  osId,
  servicoId,
  mecanicoId,
  mecanicoNome = 'Mecânico',
  boxId = null,
  horasPadrao = 1,
  timestamp = null,
  actorId = 'sistema'
}) {
  if (!state) throw new Error('Estado é obrigatório.');
  if (!osId || !servicoId || !mecanicoId) {
    throw new Error('osId, servicoId e mecanicoId são obrigatórios para iniciar apontamento.');
  }
  garantirColecoes(state);

  // 1. Valida OS e Serviço
  const os = state.os.find(o => o.id === osId && (!tenantId || !o.tenantId || o.tenantId === tenantId));
  if (!os) {
    throw new Error(`Ordem de serviço "${osId}" não encontrada.`);
  }

  const servicos = Array.isArray(os.servicos) ? os.servicos : (Array.isArray(os.services) ? os.services : []);
  const servico = servicos.find(s => s.id === servicoId || s.servicoId === servicoId);
  if (!servico) {
    throw new Error(`Item de serviço "${servicoId}" não encontrado na OS #${os.num || os.id}.`);
  }

  const stItem = String(servico.statusItem || servico.status || '').toLowerCase();
  if (stItem === 'recusado' || stItem === 'adiado') {
    throw new Error(`Serviço "${servico.desc || servicoId}" não está aprovado para execução (Status: ${stItem}).`);
  }

  // 2. Regra Anti-Conflito Operacional (Mecânico já ativo em outro serviço)
  const apontamentoAtivo = state.timeLogs.find(l =>
    l.mecanicoId === mecanicoId &&
    l.status === 'em_execucao' &&
    (!tenantId || !l.tenantId || l.tenantId === tenantId)
  );

  if (apontamentoAtivo) {
    const err = new Error(
      `MECHANIC_ALREADY_ACTIVE_IN_ANOTHER_SERVICE: Mecânico "${mecanicoNome || mecanicoId}" já possui apontamento em execução na OS #${apontamentoAtivo.osNum || apontamentoAtivo.osId}. Pause ou conclua o serviço anterior.`
    );
    err.code = 'MECHANIC_ALREADY_ACTIVE_IN_ANOTHER_SERVICE';
    throw err;
  }

  const inicioEm = timestamp || new Date().toISOString();
  const horasVendidas = Number(horasPadrao || servico.horasPadrao || servico.qtdHoras || 1);
  const valorServico = Number(servico.valor != null ? servico.valor : (servico.preco || 0));

  const apontamento = {
    id: gerarId('log'),
    tenantId,
    osId,
    osNum: os.num || os.numero || null,
    servicoId,
    servicoNome: servico.desc || servico.nome || 'Serviço',
    valorServico,
    mecanicoId,
    mecanicoNome,
    boxId: boxId || null,
    status: 'em_execucao',
    inicioEm,
    pausas: [],
    tempoBrutoMinutos: 0,
    tempoPausasMinutos: 0,
    tempoLiquidoMinutos: 0,
    horasVendidas,
    horasTrabalhadas: 0,
    indiceEficiencia: 0,
    concluidoEm: null,
    observacao: null,
    criadoEm: new Date().toISOString(),
    atualizadoEm: new Date().toISOString()
  };

  state.timeLogs.push(apontamento);

  servico.statusExecucao = 'em_execucao';
  servico.mecanicoId = mecanicoId;
  servico.boxId = boxId || servico.boxId || null;

  state.auditoria.push({
    id: gerarId('aud'),
    tenantId,
    timestamp: new Date().toISOString(),
    actorId,
    acao: 'iniciar_apontamento_servico',
    detalhes: {
      apontamentoId: apontamento.id,
      osId,
      servicoId,
      mecanicoId,
      boxId
    }
  });

  return { ok: true, apontamento };
}

function pausarApontamentoServico(state, apontamentoId, {
  motivo = 'Aguardando peça / apoio',
  timestamp = null,
  actorId = 'sistema'
} = {}) {
  if (!state || !apontamentoId) throw new Error('state e apontamentoId são obrigatórios.');
  garantirColecoes(state);

  const apt = state.timeLogs.find(l => l.id === apontamentoId);
  if (!apt) throw new Error(`Apontamento "${apontamentoId}" não encontrado.`);

  if (apt.status !== 'em_execucao') {
    const err = new Error(`INVALID_TIMELOG_STATE: Apenas apontamentos em execução podem ser pausados (Status atual: ${apt.status}).`);
    err.code = 'INVALID_TIMELOG_STATE';
    throw err;
  }

  const inicioPausa = timestamp || new Date().toISOString();
  apt.pausas = Array.isArray(apt.pausas) ? apt.pausas : [];
  apt.pausas.push({
    id: gerarId('pau'),
    inicioPausa,
    fimPausa: null,
    motivo: String(motivo).trim(),
    duracaoMinutos: 0
  });

  apt.status = 'pausado';
  apt.atualizadoEm = new Date().toISOString();

  state.auditoria.push({
    id: gerarId('aud'),
    tenantId: apt.tenantId,
    timestamp: new Date().toISOString(),
    actorId,
    acao: 'pausar_apontamento_servico',
    detalhes: { apontamentoId: apt.id, motivo, inicioPausa }
  });

  return { ok: true, apontamento: apt };
}

function retomarApontamentoServico(state, apontamentoId, {
  timestamp = null,
  actorId = 'sistema'
} = {}) {
  if (!state || !apontamentoId) throw new Error('state e apontamentoId são obrigatórios.');
  garantirColecoes(state);

  const apt = state.timeLogs.find(l => l.id === apontamentoId);
  if (!apt) throw new Error(`Apontamento "${apontamentoId}" não encontrado.`);

  if (apt.status !== 'pausado') {
    const err = new Error(`INVALID_TIMELOG_STATE: Apenas apontamentos pausados podem ser retomados (Status atual: ${apt.status}).`);
    err.code = 'INVALID_TIMELOG_STATE';
    throw err;
  }

  const fimPausa = timestamp || new Date().toISOString();
  apt.pausas = Array.isArray(apt.pausas) ? apt.pausas : [];
  const pausaAberta = apt.pausas.slice().reverse().find(p => p.fimPausa === null);

  if (pausaAberta) {
    pausaAberta.fimPausa = fimPausa;
    const diffMs = new Date(fimPausa).getTime() - new Date(pausaAberta.inicioPausa).getTime();
    pausaAberta.duracaoMinutos = Math.max(0, Math.round(diffMs / 60000));
  }

  apt.status = 'em_execucao';
  apt.atualizadoEm = new Date().toISOString();

  state.auditoria.push({
    id: gerarId('aud'),
    tenantId: apt.tenantId,
    timestamp: new Date().toISOString(),
    actorId,
    acao: 'retomar_apontamento_servico',
    detalhes: { apontamentoId: apt.id, fimPausa }
  });

  return { ok: true, apontamento: apt };
}

function concluirApontamentoServico(state, apontamentoId, {
  timestamp = null,
  observacao = null,
  actorId = 'sistema'
} = {}) {
  if (!state || !apontamentoId) throw new Error('state e apontamentoId são obrigatórios.');
  garantirColecoes(state);

  const apt = state.timeLogs.find(l => l.id === apontamentoId);
  if (!apt) throw new Error(`Apontamento "${apontamentoId}" não encontrado.`);

  if (apt.status === 'concluido') {
    const err = new Error('INVALID_TIMELOG_STATE: O apontamento já está concluído.');
    err.code = 'INVALID_TIMELOG_STATE';
    throw err;
  }

  const concluidoEm = timestamp || new Date().toISOString();

  // Fecha pausa pendente se estiver pausado
  if (apt.status === 'pausado' && Array.isArray(apt.pausas)) {
    const pausaAberta = apt.pausas.slice().reverse().find(p => p.fimPausa === null);
    if (pausaAberta) {
      pausaAberta.fimPausa = concluidoEm;
      const diffMs = new Date(concluidoEm).getTime() - new Date(pausaAberta.inicioPausa).getTime();
      pausaAberta.duracaoMinutos = Math.max(0, Math.round(diffMs / 60000));
    }
  }

  const diffBrutoMs = new Date(concluidoEm).getTime() - new Date(apt.inicioEm).getTime();
  const tempoBrutoMinutos = Math.max(0, Math.round(diffBrutoMs / 60000));

  const tempoPausasMinutos = (apt.pausas || []).reduce((acc, p) => acc + (Number(p.duracaoMinutos) || 0), 0);
  const tempoLiquidoMinutos = Math.max(0, tempoBrutoMinutos - tempoPausasMinutos);
  const horasTrabalhadas = +(tempoLiquidoMinutos / 60).toFixed(2);

  const horasVendidas = Number(apt.horasVendidas) || 1;
  const indiceEficiencia = Math.round((horasVendidas / Math.max(horasTrabalhadas, 0.01)) * 100);

  apt.status = 'concluido';
  apt.concluidoEm = concluidoEm;
  apt.tempoBrutoMinutos = tempoBrutoMinutos;
  apt.tempoPausasMinutos = tempoPausasMinutos;
  apt.tempoLiquidoMinutos = tempoLiquidoMinutos;
  apt.horasTrabalhadas = horasTrabalhadas;
  apt.indiceEficiencia = indiceEficiencia;
  apt.observacao = observacao || apt.observacao || null;
  apt.atualizadoEm = new Date().toISOString();

  // Reflete no item de serviço da OS
  const os = state.os.find(o => o.id === apt.osId);
  if (os) {
    const servicos = Array.isArray(os.servicos) ? os.servicos : (Array.isArray(os.services) ? os.services : []);
    const servico = servicos.find(s => s.id === apt.servicoId || s.servicoId === apt.servicoId);
    if (servico) {
      servico.statusExecucao = 'concluido';
      servico.mecanicoId = apt.mecanicoId;
      servico.horasReais = horasTrabalhadas;
    }
  }

  state.auditoria.push({
    id: gerarId('aud'),
    tenantId: apt.tenantId,
    timestamp: new Date().toISOString(),
    actorId,
    acao: 'concluir_apontamento_servico',
    detalhes: {
      apontamentoId: apt.id,
      tempoLiquidoMinutos,
      horasTrabalhadas,
      indiceEficiencia
    }
  });

  return { ok: true, apontamento: apt };
}

function listarApontamentosPatio(state, {
  tenantId = null,
  osId = null,
  mecanicoId = null,
  boxId = null,
  status = null,
  competencia = null
} = {}) {
  if (!state) return [];
  garantirColecoes(state);

  return state.timeLogs.filter(apt => {
    if (tenantId && apt.tenantId && apt.tenantId !== tenantId) return false;
    if (osId && apt.osId !== osId) return false;
    if (mecanicoId && apt.mecanicoId !== mecanicoId) return false;
    if (boxId && apt.boxId !== boxId) return false;
    if (status && apt.status !== status) return false;

    if (competencia) {
      const dataRef = String(apt.concluidoEm || apt.inicioEm || apt.criadoEm || '').slice(0, 7);
      if (dataRef && dataRef !== competencia) return false;
    }

    return true;
  });
}

module.exports = {
  iniciarApontamentoServico,
  pausarApontamentoServico,
  retomarApontamentoServico,
  concluirApontamentoServico,
  listarApontamentosPatio
};

