'use strict';

const crypto = require('crypto');
const preOSEngine = require('./preOSEngine');

function gerarId(prefix = 'agd') {
  return `${prefix}_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
}

function normalizarData(dt) {
  if (!dt) return null;
  if (dt instanceof Date) return dt.toISOString().slice(0, 10);
  const s = String(dt).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return s.slice(0, 10);
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

function criarAgendamento({ tenantId, state, customerId = null, vehicleId = null, fleetId = null, scheduledDate, scheduledTime = '08:00', reason, maintenancePlanId = null, originOpportunityId = null, createdBy = 'sistema' }) {
  if (!tenantId) throw new Error('tenantId é obrigatório para agendamento.');
  if (!scheduledDate) throw new Error('Data do agendamento é obrigatória (YYYY-MM-DD).');

  if (!state.appointments) state.appointments = [];

  const dataFormatada = normalizarData(scheduledDate);
  if (!dataFormatada) throw new Error('Data do agendamento inválida.');

  const id = gerarId('agd');
  const agora = new Date().toISOString();

  // Se passou veículo, tenta encontrar cliente automaticamente se ausente
  let cid = customerId;
  if (!cid && vehicleId) {
    const veic = (state.veiculos || []).find(v => v.id === vehicleId);
    if (veic) cid = veic.cli || null;
  }

  const agendamento = {
    id,
    tenantId,
    customerId: cid,
    vehicleId,
    fleetId,
    scheduledDate: dataFormatada,
    scheduledTime: scheduledTime || '08:00',
    reason: reason || 'Manutenção agendada',
    maintenancePlanId,
    originOpportunityId,
    status: 'agendado', // 'agendado' | 'confirmado' | 'chegou' | 'nao_compareceu' | 'cancelado' | 'convertido_pre_os'
    createdBy,
    createdAt: agora,
    updatedAt: agora
  };

  state.appointments.push(agendamento);

  // Se originou de oportunidade CRM, atualiza status da oportunidade
  if (originOpportunityId) {
    const opo = (state.opportunities || []).find(o => o.id === originOpportunityId);
    if (opo) {
      opo.status = 'agendado';
      opo.updatedAt = agora;
    }
  }

  registrarAuditoria(state, {
    action: 'appointment_created',
    actorId: createdBy,
    resourceId: id,
    tenantId,
    details: { scheduledDate: dataFormatada, scheduledTime, vehicleId, reason }
  });

  return { ok: true, agendamento };
}

function cancelarAgendamento({ tenantId, state, appointmentId, motivo = 'Cancelado pelo usuário', actorId = 'usuario' }) {
  if (!tenantId || !appointmentId) throw new Error('Parâmetros obrigatórios ausentes.');

  const list = state.appointments || [];
  const ag = list.find(a => a.id === appointmentId && a.tenantId === tenantId);
  if (!ag) return { ok: false, error: 'Agendamento não encontrado.' };

  ag.status = 'cancelado';
  ag.motivoCancelamento = motivo;
  ag.updatedAt = new Date().toISOString();

  registrarAuditoria(state, {
    action: 'appointment_cancelled',
    actorId,
    resourceId: appointmentId,
    tenantId,
    details: { motivo }
  });

  return { ok: true, agendamento: ag };
}

/**
 * Converte um agendamento existente em Pré-OS no momento da chegada do veículo.
 * Preserva appointmentId, maintenancePlanId e originOpportunityId.
 */
function converterParaPreOS({ tenantId, state, appointmentId, actorId = 'recepcao' }) {
  if (!tenantId || !appointmentId) throw new Error('Parâmetros obrigatórios ausentes.');

  const list = state.appointments || [];
  const ag = list.find(a => a.id === appointmentId && a.tenantId === tenantId);
  if (!ag) return { ok: false, error: 'Agendamento não encontrado.' };

  const veiculo = ag.vehicleId ? (state.veiculos || []).find(v => v.id === ag.vehicleId) : null;
  const placa = veiculo ? veiculo.placa : 'SEM-PLACA';

  const triagem = preOSEngine.triagemEntrada({
    tenantId,
    vehicleId: ag.vehicleId,
    placa,
    clienteId: ag.customerId,
    kmAtual: veiculo ? Number(veiculo.km) : 0,
    reclamacao: ag.reason || 'Atendimento agendado',
    origem: 'agendamento',
    actorId,
    state
  });

  if (triagem?.preOS) {
    triagem.preOS.appointmentId = ag.id;
    triagem.preOS.maintenancePlanId = ag.maintenancePlanId;
    triagem.preOS.opportunityId = ag.originOpportunityId;
  }

  ag.status = 'convertido_pre_os';
  ag.preOSId = triagem?.preOS?.id;
  ag.updatedAt = new Date().toISOString();

  registrarAuditoria(state, {
    action: 'appointment_converted_pre_os',
    actorId,
    resourceId: ag.id,
    tenantId,
    details: { preOSId: triagem?.preOS?.id, placa }
  });

  return {
    ok: true,
    agendamento: ag,
    preOS: triagem.preOS,
    triagem
  };
}

module.exports = {
  criarAgendamento,
  cancelarAgendamento,
  converterParaPreOS
};
