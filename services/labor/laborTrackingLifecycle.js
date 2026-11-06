'use strict';

const {
  arredondar,
  registrarAuditoria,
  garantirColecoesLabor
} = require('./laborWorkers');

/**
 * ─────────────────────────────────────────────────────────────────
 * 3. ENCERRAMENTO, AJUSTE E CONSULTAS DE APONTAMENTO
 * ─────────────────────────────────────────────────────────────────
 */

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

  // Atualiza item de serviço na OS
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
  encerrarApontamento,
  ajustarApontamentoManual,
  listarApontamentos
};

