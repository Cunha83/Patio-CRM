'use strict';

const {
  gerarId,
  arredondar,
  registrarAuditoria,
  garantirColecoesLabor
} = require('./laborWorkers');

/**
 * ─────────────────────────────────────────────────────────────────
 * 2. APONTAMENTO DE TEMPO (LABOR TRACKING CORE)
 * ─────────────────────────────────────────────────────────────────
 */

/**
 * Inicia um apontamento de mão de obra para um colaborador.
 */
function iniciarApontamento({
  tenantId,
  state,
  workerId,
  osId,
  serviceItemId = null,
  boxId = null,
  type = 'produtivo',
  source = 'web',
  causaRetrabalho = null,
  reworkOriginalEntryId = null,
  actorId = 'sistema',
  timestamp = null
}) {
  if (!tenantId || typeof tenantId !== 'string') {
    throw new Error('tenantId é obrigatório para iniciar apontamento.');
  }
  if (!state) throw new Error('Estado do tenant é obrigatório.');
  if (!workerId) throw new Error('workerId é obrigatório para iniciar apontamento.');
  if (!osId) throw new Error('osId é obrigatório para iniciar apontamento.');

  garantirColecoesLabor(state);

  // 1. Localiza colaborador
  const worker = state.workers.find(w => w.id === workerId && w.tenantId === tenantId);
  if (!worker) {
    throw new Error(`Colaborador com ID "${workerId}" não encontrado.`);
  }
  if (worker.ativo === false) {
    throw new Error(`Colaborador "${worker.nome}" está inativo.`);
  }

  // 2. Localiza Ordem de Serviço
  const os = state.os.find(o => o.id === osId && (o.tenantId === tenantId || !o.tenantId));
  if (!os) {
    throw new Error(`Ordem de serviço "${osId}" não encontrada.`);
  }
  if (os.st === 'cancelada') {
    throw new Error(`Não é possível apontar horas em uma OS cancelada.`);
  }

  // 3. Validação de Serviço Autorizado (Regra Fundamental 6)
  let serviceNome = 'Serviço Geral';
  let servicoEncontrado = null;

  if (Array.isArray(os.servicos) && os.servicos.length > 0) {
    if (serviceItemId) {
      servicoEncontrado = os.servicos.find(s => s.id === serviceItemId || s.codigo === serviceItemId);
    } else {
      servicoEncontrado = os.servicos.find(s => s.autorizado !== false && s.status !== 'recusado');
    }
  }

  if (servicoEncontrado) {
    serviceNome = servicoEncontrado.nome || servicoEncontrado.desc || 'Serviço';
    serviceItemId = servicoEncontrado.id || serviceItemId;

    if (['produtivo', 'retrabalho'].includes(type)) {
      const isRecusado = servicoEncontrado.status === 'recusado' || servicoEncontrado.recusado === true;
      const isPendente = servicoEncontrado.status === 'pendente' || servicoEncontrado.autorizado === false;
      if (isRecusado || isPendente) {
        throw new Error(`Não é permitido iniciar trabalho em serviço não autorizado ou recusado ("${serviceNome}"). Somente serviços com status autorizado podem receber apontamento produtivo.`);
      }
    }
  } else if (['produtivo', 'retrabalho'].includes(type) && serviceItemId) {
    throw new Error(`Serviço "${serviceItemId}" não encontrado ou não autorizado na OS #${os.num || os.id}.`);
  }

  // 4. Verificação de Idempotência & Anti-Sobreposição (Regra Fundamental 11)
  const apontamentosAtivos = state.laborEntries.filter(
    e => e.tenantId === tenantId && e.workerId === workerId && e.status === 'ativo'
  );

  if (apontamentosAtivos.length > 0) {
    const entryExistente = apontamentosAtivos[0];
    if (entryExistente.osId === osId && (entryExistente.serviceItemId === serviceItemId || !serviceItemId)) {
      return {
        ok: true,
        entry: entryExistente,
        idempotente: true,
        mensagem: `Apontamento já está ativo para ${worker.nome} neste serviço.`
      };
    }

    throw new Error(
      `O mecânico "${worker.nome}" já possui um apontamento ativo na OS #${entryExistente.osNum || entryExistente.osId} (${entryExistente.serviceNome || 'Serviço'}). Pause ou encerre o serviço atual antes de iniciar outro.`
    );
  }

  const dataHoraInicio = timestamp ? new Date(timestamp).toISOString() : new Date().toISOString();
  const boxFinal = boxId || os.box || 'Box';

  const entry = {
    id: gerarId('lab'),
    tenantId,
    workerId: worker.id,
    workerNome: worker.nome,
    osId: os.id,
    osNum: os.num || os.id,
    serviceItemId: serviceItemId || null,
    serviceNome,
    boxId: boxFinal,
    type,
    motivoPausa: null,
    causaRetrabalho: type === 'retrabalho' ? (causaRetrabalho || 'Não especificada') : null,
    reworkOriginalEntryId: reworkOriginalEntryId || null,
    startedAt: dataHoraInicio,
    endedAt: null,
    durationMinutes: 0,
    source,
    status: 'ativo',
    intervals: [
      {
        startedAt: dataHoraInicio,
        endedAt: null,
        durationMinutes: 0
      }
    ],
    createdBy: actorId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  state.laborEntries.unshift(entry);

  if (os.st === 'fila' || os.st === 'aguardando') {
    os.st = 'executando';
    os.atualizadoEm = new Date().toISOString();
  }

  if (boxId && !os.box) {
    os.box = boxId;
  }

  registrarAuditoria(state, {
    tenantId,
    actorId,
    usuario: actorId,
    intencao: type === 'retrabalho' ? 'rework_started' : 'labor_started',
    resumo: `Início de apontamento [${type}] por ${worker.nome} na OS #${os.num || os.id} - ${serviceNome}.`,
    osId: os.id,
    workerId: worker.id,
    serviceItemId,
    laborEntryId: entry.id
  });

  return { ok: true, entry, idempotente: false };
}

/**
 * Pausa um apontamento ativo de mão de obra.
 */
function pausarApontamento({
  tenantId,
  state,
  entryId,
  motivo = 'pausa',
  actorId = 'sistema',
  timestamp = null
}) {
  if (!state) throw new Error('Estado do tenant é obrigatório.');
  garantirColecoesLabor(state);

  const entry = state.laborEntries.find(e => e.id === entryId && e.tenantId === tenantId);
  if (!entry) {
    throw new Error(`Apontamento "${entryId}" não encontrado.`);
  }

  if (entry.status === 'pausado') {
    return { ok: true, entry, idempotente: true, mensagem: 'Apontamento já está pausado.' };
  }
  if (entry.status === 'finalizado' || entry.status === 'cancelado') {
    throw new Error(`Não é possível pausar um apontamento com status "${entry.status}".`);
  }

  const agoraIso = timestamp ? new Date(timestamp).toISOString() : new Date().toISOString();
  const agoraMs = new Date(agoraIso).getTime();

  if (Array.isArray(entry.intervals) && entry.intervals.length > 0) {
    const ultimoIntervalo = entry.intervals[entry.intervals.length - 1];
    if (!ultimoIntervalo.endedAt) {
      ultimoIntervalo.endedAt = agoraIso;
      const startMs = new Date(ultimoIntervalo.startedAt).getTime();
      const dur = Math.max(0, (agoraMs - startMs) / (1000 * 60));
      ultimoIntervalo.durationMinutes = arredondar(dur, 1);
    }
  }

  const duracaoTotal = (entry.intervals || []).reduce((acc, it) => acc + (it.durationMinutes || 0), 0);
  entry.durationMinutes = arredondar(duracaoTotal, 1);
  entry.status = 'pausado';
  entry.motivoPausa = motivo;
  entry.updatedAt = new Date().toISOString();

  if (motivo === 'espera_peca' || motivo === 'aguardando_peca') {
    const os = state.os.find(o => o.id === entry.osId);
    if (os && os.st === 'executando') {
      os.st = 'peca';
      os.atualizadoEm = new Date().toISOString();
    }
  }

  registrarAuditoria(state, {
    tenantId,
    actorId,
    usuario: actorId,
    intencao: 'labor_paused',
    resumo: `Apontamento de ${entry.workerNome} na OS #${entry.osNum || entry.osId} pausado. Motivo: ${motivo}. Tempo acumulado: ${entry.durationMinutes} min.`,
    osId: entry.osId,
    workerId: entry.workerId,
    laborEntryId: entry.id
  });

  return { ok: true, entry, idempotente: false };
}

/**
 * Retoma um apontamento de mão de obra pausado.
 */
function retomarApontamento({
  tenantId,
  state,
  entryId,
  actorId = 'sistema',
  timestamp = null
}) {
  if (!state) throw new Error('Estado do tenant é obrigatório.');
  garantirColecoesLabor(state);

  const entry = state.laborEntries.find(e => e.id === entryId && e.tenantId === tenantId);
  if (!entry) {
    throw new Error(`Apontamento "${entryId}" não encontrado.`);
  }

  if (entry.status === 'ativo') {
    return { ok: true, entry, idempotente: true, mensagem: 'Apontamento já está ativo.' };
  }
  if (entry.status === 'finalizado' || entry.status === 'cancelado') {
    throw new Error(`Não é possível retomar um apontamento com status "${entry.status}".`);
  }

  const outrosAtivos = state.laborEntries.filter(
    e => e.tenantId === tenantId && e.workerId === entry.workerId && e.status === 'ativo' && e.id !== entry.id
  );
  if (outrosAtivos.length > 0) {
    const outro = outrosAtivos[0];
    throw new Error(`O mecânico "${entry.workerNome}" já está ativo na OS #${outro.osNum || outro.osId}. Pause-o antes de retomar este serviço.`);
  }

  const agoraIso = timestamp ? new Date(timestamp).toISOString() : new Date().toISOString();

  entry.intervals = Array.isArray(entry.intervals) ? entry.intervals : [];
  entry.intervals.push({
    startedAt: agoraIso,
    endedAt: null,
    durationMinutes: 0
  });

  entry.status = 'ativo';
  entry.motivoPausa = null;
  entry.updatedAt = new Date().toISOString();

  const os = state.os.find(o => o.id === entry.osId);
  if (os && os.st === 'peca') {
    os.st = 'executando';
    os.atualizadoEm = new Date().toISOString();
  }

  registrarAuditoria(state, {
    tenantId,
    actorId,
    usuario: actorId,
    intencao: 'labor_resumed',
    resumo: `Serviço retomado por ${entry.workerNome} na OS #${entry.osNum || entry.osId} (${entry.serviceNome}).`,
    osId: entry.osId,
    workerId: entry.workerId,
    laborEntryId: entry.id
  });

  return { ok: true, entry, idempotente: false };
}

module.exports = {
  iniciarApontamento,
  pausarApontamento,
  retomarApontamento
};
