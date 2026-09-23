'use strict';

const crypto = require('crypto');
const { obterAgoraSP } = require('./financialEngine');

function gerarId(prefix = 'lab') {
  return `${prefix}_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
}

function arredondar(val, decimais = 2) {
  const n = Number(val) || 0;
  return Number(Math.round(n + 'e' + decimais) + 'e-' + decimais);
}

function registrarAuditoria(state, entrada) {
  if (!state.auditoria) state.auditoria = [];
  state.auditoria.unshift({
    id: gerarId('aud'),
    timestamp: new Date().toISOString(),
    ...entrada
  });
  if (state.auditoria.length > 500) {
    state.auditoria = state.auditoria.slice(0, 500);
  }
}

function garantirColecoesLabor(state) {
  state.workers = Array.isArray(state.workers) ? state.workers : [];
  state.laborEntries = Array.isArray(state.laborEntries) ? state.laborEntries : [];
  state.os = Array.isArray(state.os) ? state.os : [];
  state.cfg = state.cfg || {};
  if (!state.cfg.equipe) {
    state.cfg.equipe = { jornadaPadraoHoras: 8 };
  }
}

/**
 * ─────────────────────────────────────────────────────────────────
 * 1. GESTÃO DE COLABORADORES / MECÂNICOS
 * ─────────────────────────────────────────────────────────────────
 */

function cadastrarColaborador({ tenantId, state, workerData = {}, actorId = 'sistema' }) {
  if (!tenantId || typeof tenantId !== 'string') {
    throw new Error('tenantId é obrigatório para cadastrar colaborador.');
  }
  if (!state) throw new Error('Estado do tenant é obrigatório.');

  garantirColecoesLabor(state);

  const nome = String(workerData.nome || '').trim();
  if (!nome) {
    throw new Error('Nome do colaborador é obrigatório.');
  }

  const jornadaPadrao = Number(state.cfg?.equipe?.jornadaPadraoHoras) || 8;
  const jornada = Number(workerData.jornadaHorasDia) > 0 ? Number(workerData.jornadaHorasDia) : jornadaPadrao;
  const custoHora = Math.max(0, Number(workerData.custoHora) || 0);

  const worker = {
    id: workerData.id || gerarId('wrk'),
    tenantId,
    userId: workerData.userId || null,
    nome,
    funcao: String(workerData.funcao || 'Mecânico').trim(),
    custoHora: arredondar(custoHora),
    jornadaHorasDia: jornada,
    ativo: workerData.ativo !== false,
    disponivelHoje: workerData.disponivelHoje !== false,
    motivoIndisponibilidade: workerData.motivoIndisponibilidade || null,
    especialidades: Array.isArray(workerData.especialidades) ? workerData.especialidades : (workerData.especialidade ? [workerData.especialidade] : ['Geral']),
    fone: workerData.fone || '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  state.workers.push(worker);

  registrarAuditoria(state, {
    tenantId,
    actorId,
    usuario: actorId,
    intencao: 'cadastrar_colaborador',
    resumo: `Colaborador "${worker.nome}" (${worker.funcao}) cadastrado na equipe.`,
    workerId: worker.id
  });

  return { ok: true, worker };
}

function listarColaboradores({ tenantId, state, incluirInativos = false, userPermissions = [] }) {
  if (!state) return [];
  garantirColecoesLabor(state);

  const podeVerCusto = userPermissions.includes('*') ||
    userPermissions.includes('costing:read') ||
    userPermissions.includes('productivity:manage');

  return state.workers
    .filter(w => w.tenantId === tenantId && (incluirInativos || w.ativo !== false))
    .map(w => {
      const clone = { ...w };
      if (!podeVerCusto) {
        delete clone.custoHora;
      }
      return clone;
    });
}

function obterColaborador({ tenantId, state, workerId, userPermissions = [] }) {
  if (!state) return null;
  garantirColecoesLabor(state);

  const w = state.workers.find(it => it.id === workerId && it.tenantId === tenantId);
  if (!w) return null;

  const podeVerCusto = userPermissions.includes('*') ||
    userPermissions.includes('costing:read') ||
    userPermissions.includes('productivity:manage');

  const clone = { ...w };
  if (!podeVerCusto) {
    delete clone.custoHora;
  }
  return clone;
}

function atualizarColaborador({ tenantId, state, workerId, workerData = {}, actorId = 'sistema' }) {
  if (!state) throw new Error('Estado do tenant é obrigatório.');
  garantirColecoesLabor(state);

  const worker = state.workers.find(w => w.id === workerId && w.tenantId === tenantId);
  if (!worker) {
    throw new Error(`Colaborador "${workerId}" não encontrado.`);
  }

  if (workerData.nome) worker.nome = String(workerData.nome).trim();
  if (workerData.funcao) worker.funcao = String(workerData.funcao).trim();
  if (workerData.custoHora !== undefined) worker.custoHora = arredondar(Math.max(0, Number(workerData.custoHora) || 0));
  if (workerData.jornadaHorasDia !== undefined) worker.jornadaHorasDia = Number(workerData.jornadaHorasDia) || 8;
  if (workerData.ativo !== undefined) worker.ativo = Boolean(workerData.ativo);
  if (workerData.disponivelHoje !== undefined) worker.disponivelHoje = Boolean(workerData.disponivelHoje);
  if (workerData.motivoIndisponibilidade !== undefined) worker.motivoIndisponibilidade = workerData.motivoIndisponibilidade;
  if (Array.isArray(workerData.especialidades)) worker.especialidades = workerData.especialidades;
  if (workerData.fone !== undefined) worker.fone = workerData.fone;

  worker.updatedAt = new Date().toISOString();

  registrarAuditoria(state, {
    tenantId,
    actorId,
    usuario: actorId,
    intencao: 'atualizar_colaborador',
    resumo: `Cadastro do colaborador "${worker.nome}" atualizado.`,
    workerId: worker.id
  });

  return { ok: true, worker };
}

/**
 * ─────────────────────────────────────────────────────────────────
 * 2. APONTAMENTO DE TEMPO (LABOR TRACKING)
 * ─────────────────────────────────────────────────────────────────
 */

/**
 * Inicia um apontamento de mão de obra para um colaborador.
 * Enforça regras estritas:
 *  - Somente serviços com status 'autorizado' (ou aprovados) podem receber tipo 'produtivo'
 *  - Anti-sobreposição: um mecânico não pode ter dois apontamentos ativos simultaneamente
 *  - Idempotência: requisição repetida para o mesmo mecânico/serviço ativo retorna o apontamento existente
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
      // Se não especificou item específico, busca o primeiro serviço autorizado da OS
      servicoEncontrado = os.servicos.find(s => s.autorizado !== false && s.status !== 'recusado');
    }
  }

  if (servicoEncontrado) {
    serviceNome = servicoEncontrado.nome || servicoEncontrado.desc || 'Serviço';
    serviceItemId = servicoEncontrado.id || serviceItemId;

    // Se for produtivo ou retrabalho, valida autorização estrita
    if (['produtivo', 'retrabalho'].includes(type)) {
      const isRecusado = servicoEncontrado.status === 'recusado' || servicoEncontrado.recusado === true;
      const isPendente = servicoEncontrado.status === 'pendente' || servicoEncontrado.autorizado === false;
      if (isRecusado || isPendente) {
        throw new Error(`Não é permitido iniciar trabalho em serviço não autorizado ou recusado ("${serviceNome}"). Somente serviços com status autorizado podem receber apontamento produtivo.`);
      }
    }
  } else if (['produtivo', 'retrabalho'].includes(type) && serviceItemId) {
    // Especificou um ID que não existe ou não está na OS
    throw new Error(`Serviço "${serviceItemId}" não encontrado ou não autorizado na OS #${os.num || os.id}.`);
  }

  // 4. Verificação de Idempotência & Anti-Sobreposição (Regra Fundamental 11)
  const apontamentosAtivos = state.laborEntries.filter(
    e => e.tenantId === tenantId && e.workerId === workerId && e.status === 'ativo'
  );

  if (apontamentosAtivos.length > 0) {
    const entryExistente = apontamentosAtivos[0];
    // Idempotência: se for exatamente a mesma OS e serviço, retorna o apontamento já ativo sem duplicar
    if (entryExistente.osId === osId && (entryExistente.serviceItemId === serviceItemId || !serviceItemId)) {
      return {
        ok: true,
        entry: entryExistente,
        idempotente: true,
        mensagem: `Apontamento já está ativo para ${worker.nome} neste serviço.`
      };
    }

    // Bloqueio de sobreposição incoerente
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

  // Se a OS estava em fila ou aguardando, transita para executando
  if (os.st === 'fila' || os.st === 'aguardando') {
    os.st = 'executando';
    os.atualizadoEm = new Date().toISOString();
  }

  // Atualiza box se informado
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

  // Idempotência
  if (entry.status === 'pausado') {
    return { ok: true, entry, idempotente: true, mensagem: 'Apontamento já está pausado.' };
  }
  if (entry.status === 'finalizado' || entry.status === 'cancelado') {
    throw new Error(`Não é possível pausar um apontamento com status "${entry.status}".`);
  }

  const agoraIso = timestamp ? new Date(timestamp).toISOString() : new Date().toISOString();
  const agoraMs = new Date(agoraIso).getTime();

  // Fecha o último intervalo aberto
  if (Array.isArray(entry.intervals) && entry.intervals.length > 0) {
    const ultimoIntervalo = entry.intervals[entry.intervals.length - 1];
    if (!ultimoIntervalo.endedAt) {
      ultimoIntervalo.endedAt = agoraIso;
      const startMs = new Date(ultimoIntervalo.startedAt).getTime();
      const dur = Math.max(0, (agoraMs - startMs) / (1000 * 60));
      ultimoIntervalo.durationMinutes = arredondar(dur, 1);
    }
  }

  // Recalcula duração total acumulada
  const duracaoTotal = (entry.intervals || []).reduce((acc, it) => acc + (it.durationMinutes || 0), 0);
  entry.durationMinutes = arredondar(duracaoTotal, 1);
  entry.status = 'pausado';
  entry.motivoPausa = motivo;
  entry.updatedAt = new Date().toISOString();

  // Se o motivo for espera de peças, atualiza status operacional da OS caso coerente
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
 * Preserva integralmente o histórico e timestamps anteriores.
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

  // Idempotência
  if (entry.status === 'ativo') {
    return { ok: true, entry, idempotente: true, mensagem: 'Apontamento já está ativo.' };
  }
  if (entry.status === 'finalizado' || entry.status === 'cancelado') {
    throw new Error(`Não é possível retomar um apontamento com status "${entry.status}".`);
  }

  // Anti-sobreposição: verifica se o mecânico não tem outro ativo no momento
  const outrosAtivos = state.laborEntries.filter(
    e => e.tenantId === tenantId && e.workerId === entry.workerId && e.status === 'ativo' && e.id !== entry.id
  );
  if (outrosAtivos.length > 0) {
    const outro = outrosAtivos[0];
    throw new Error(`O mecânico "${entry.workerNome}" já está ativo na OS #${outro.osNum || outro.osId}. Pause-o antes de retomar este serviço.`);
  }

  const agoraIso = timestamp ? new Date(timestamp).toISOString() : new Date().toISOString();

  // Inicia um novo intervalo na lista preservando os anteriores
  entry.intervals = Array.isArray(entry.intervals) ? entry.intervals : [];
  entry.intervals.push({
    startedAt: agoraIso,
    endedAt: null,
    durationMinutes: 0
  });

  entry.status = 'ativo';
  entry.motivoPausa = null;
  entry.updatedAt = new Date().toISOString();

  // Se a OS estava em estágio 'peca', retorna para 'executando'
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

/**
 * Encerra um apontamento de mão de obra e consolida a duração final.
 */
function encerrarApontamento({
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

  // Idempotência
  if (entry.status === 'finalizado') {
    return { ok: true, entry, idempotente: true, mensagem: 'Apontamento já finalizado anteriormente.' };
  }

  const agoraIso = timestamp ? new Date(timestamp).toISOString() : new Date().toISOString();
  const agoraMs = new Date(agoraIso).getTime();

  // Se estava ativo, fecha o intervalo aberto
  if (entry.status === 'ativo') {
    if (Array.isArray(entry.intervals) && entry.intervals.length > 0) {
      const ultimo = entry.intervals[entry.intervals.length - 1];
      if (!ultimo.endedAt) {
        ultimo.endedAt = agoraIso;
        const startMs = new Date(ultimo.startedAt).getTime();
        const dur = Math.max(0, (agoraMs - startMs) / (1000 * 60));
        ultimo.durationMinutes = arredondar(dur, 1);
      }
    }
  }

  const duracaoTotal = (entry.intervals || []).reduce((acc, it) => acc + (it.durationMinutes || 0), 0);
  entry.durationMinutes = arredondar(duracaoTotal, 1);
  entry.endedAt = agoraIso;
  entry.status = 'finalizado';
  entry.updatedAt = new Date().toISOString();

  // Atualiza item de serviço na OS (marca como concluído se aplicável, sem finalizar a OS inteira)
  const os = state.os.find(o => o.id === entry.osId);
  if (os && Array.isArray(os.servicos)) {
    const itemServ = os.servicos.find(s => s.id === entry.serviceItemId);
    if (itemServ) {
      itemServ.concluido = true;
      itemServ.executado = true;
      itemServ.executadoPor = entry.workerNome;
      itemServ.executadoEm = agoraIso;
    }
  }

  registrarAuditoria(state, {
    tenantId,
    actorId,
    usuario: actorId,
    intencao: entry.type === 'retrabalho' ? 'rework_finished' : 'labor_finished',
    resumo: `Serviço concluído por ${entry.workerNome} na OS #${entry.osNum || entry.osId} (${entry.serviceNome}). Duração total: ${entry.durationMinutes} min (${(entry.durationMinutes / 60).toFixed(1)}h).`,
    osId: entry.osId,
    workerId: entry.workerId,
    laborEntryId: entry.id
  });

  return { ok: true, entry, idempotente: false };
}

/**
 * Ajuste manual de apontamento com auditoria estrita.
 */
function ajustarApontamentoManual({
  tenantId,
  state,
  entryId,
  dadosAjuste = {},
  motivo,
  actorId = 'gerente'
}) {
  if (!state) throw new Error('Estado do tenant é obrigatório.');
  garantirColecoesLabor(state);

  const entry = state.laborEntries.find(e => e.id === entryId && e.tenantId === tenantId);
  if (!entry) {
    throw new Error(`Apontamento "${entryId}" não encontrado.`);
  }

  const motivoTrim = String(motivo || '').trim();
  if (!motivoTrim) {
    throw new Error('Motivo do ajuste é obrigatório para correção manual de apontamento.');
  }

  const snapshotOriginal = {
    startedAt: entry.startedAt,
    endedAt: entry.endedAt,
    durationMinutes: entry.durationMinutes,
    status: entry.status,
    type: entry.type
  };

  if (dadosAjuste.startedAt) entry.startedAt = new Date(dadosAjuste.startedAt).toISOString();
  if (dadosAjuste.endedAt) entry.endedAt = new Date(dadosAjuste.endedAt).toISOString();
  if (dadosAjuste.status) entry.status = dadosAjuste.status;
  if (dadosAjuste.type) entry.type = dadosAjuste.type;

  if (dadosAjuste.durationMinutes !== undefined) {
    entry.durationMinutes = arredondar(Math.max(0, Number(dadosAjuste.durationMinutes) || 0), 1);
  } else if (entry.startedAt && entry.endedAt) {
    const sMs = new Date(entry.startedAt).getTime();
    const eMs = new Date(entry.endedAt).getTime();
    entry.durationMinutes = arredondar(Math.max(0, (eMs - sMs) / (1000 * 60)), 1);
  }

  entry.ajustado = true;
  entry.ajustadoPor = actorId;
  entry.motivoAjuste = motivoTrim;
  entry.ajustadoEm = new Date().toISOString();
  entry.updatedAt = new Date().toISOString();

  registrarAuditoria(state, {
    tenantId,
    actorId,
    usuario: actorId,
    intencao: 'labor_adjusted',
    resumo: `Apontamento manual ajustado por ${actorId}. Motivo: ${motivoTrim}. Duração original: ${snapshotOriginal.durationMinutes} min ➔ Nova duração: ${entry.durationMinutes} min.`,
    osId: entry.osId,
    workerId: entry.workerId,
    laborEntryId: entry.id,
    detalhes: {
      original: snapshotOriginal,
      novo: {
        startedAt: entry.startedAt,
        endedAt: entry.endedAt,
        durationMinutes: entry.durationMinutes,
        status: entry.status
      }
    }
  });

  return { ok: true, entry };
}

/**
 * Consulta apontamentos com filtros
 */
function listarApontamentos({
  tenantId,
  state,
  workerId = null,
  osId = null,
  status = null,
  type = null,
  dataInicio = null,
  dataFim = null,
  limit = 100
}) {
  if (!state) return [];
  garantirColecoesLabor(state);

  let filtrados = state.laborEntries.filter(e => e.tenantId === tenantId);

  if (workerId) filtrados = filtrados.filter(e => e.workerId === workerId);
  if (osId) filtrados = filtrados.filter(e => e.osId === osId);
  if (status) filtrados = filtrados.filter(e => e.status === status);
  if (type) filtrados = filtrados.filter(e => e.type === type);

  if (dataInicio) {
    filtrados = filtrados.filter(e => new Date(e.startedAt) >= new Date(dataInicio));
  }
  if (dataFim) {
    filtrados = filtrados.filter(e => new Date(e.startedAt) <= new Date(dataFim));
  }

  filtrados.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());

  return filtrados.slice(0, limit);
}

module.exports = {
  cadastrarColaborador,
  listarColaboradores,
  obterColaborador,
  atualizarColaborador,
  iniciarApontamento,
  pausarApontamento,
  retomarApontamento,
  encerrarApontamento,
  ajustarApontamentoManual,
  listarApontamentos,
  garantirColecoesLabor
};
