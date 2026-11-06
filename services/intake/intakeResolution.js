'use strict';

const preOSEngine = require('../preOSEngine');
const { consumirTokenAcao } = require('../../lib/tokens/securityToken');
const { registrarAuditoria } = require('./intakeSessionManager');

/**
 * Confirma a Pré-OS e converte em Ordem de Serviço definitiva
 */
function confirmarIntake({
  tenantId,
  sessionId,
  state,
  actorId = 'operador',
  boxId = null,
  mecanico = 'A Definir',
  confirmToken = null
}) {
  if (!tenantId || !state) throw new Error('tenantId e state são obrigatórios.');
  const sessoes = Array.isArray(state.intakeSessions) ? state.intakeSessions : [];
  const session = sessoes.find(s => s.id === sessionId && s.tenantId === tenantId);
  if (!session) {
    return { ok: false, status: 404, error: 'Sessão de intake não encontrada.' };
  }

  if (session.status === 'concluida') {
    return { ok: false, status: 409, error: 'Sessão já confirmada e convertida em OS anteriormente.' };
  }
  if (session.status === 'cancelada') {
    return { ok: false, status: 400, error: 'Sessão de intake foi cancelada e não pode ser convertida.' };
  }

  if (confirmToken) {
    const validacaoToken = consumirTokenAcao(confirmToken, {
      tenantId,
      resourceId: session.preOSId,
      action: 'converter_pre_os'
    });
    if (!validacaoToken.ok) {
      return { ok: false, status: 403, error: `Token de confirmação inválido ou expirado: ${validacaoToken.error}` };
    }
  }

  const conv = preOSEngine.converterEmOS({
    tenantId,
    preOSId: session.preOSId,
    state,
    actorId,
    boxId,
    mecanico
  });

  if (!conv.ok) {
    return conv;
  }

  session.status = 'concluida';
  session.updatedAt = new Date().toISOString();

  registrarAuditoria(state, {
    acao: 'pre_os_confirmada',
    sessionId: session.id,
    preOSId: session.preOSId,
    osNum: conv.os.num,
    osId: conv.os.id,
    tenantId,
    usuario: actorId
  });

  return {
    ok: true,
    session,
    os: conv.os,
    preOS: conv.preOS,
    mensagem: `Pré-OS confirmada com sucesso! OS #${conv.os.num} gerada.`
  };
}

/**
 * Cancela a sessão de intake e a Pré-OS associada
 */
function cancelarIntake({
  tenantId,
  sessionId,
  motivo = 'Cancelado pelo operador',
  state,
  actorId = 'operador'
}) {
  if (!tenantId || !state) throw new Error('tenantId e state são obrigatórios.');
  const sessoes = Array.isArray(state.intakeSessions) ? state.intakeSessions : [];
  const session = sessoes.find(s => s.id === sessionId && s.tenantId === tenantId);
  if (!session) {
    return { ok: false, status: 404, error: 'Sessão de intake não encontrada.' };
  }

  if (session.status === 'concluida') {
    return { ok: false, status: 400, error: 'Não é possível cancelar uma sessão já concluída e convertida em OS.' };
  }

  preOSEngine.cancelarPreOS({
    tenantId,
    preOSId: session.preOSId,
    motivo,
    state,
    actorId
  });

  session.status = 'cancelada';
  session.updatedAt = new Date().toISOString();

  registrarAuditoria(state, {
    acao: 'pre_os_cancelada',
    sessionId: session.id,
    preOSId: session.preOSId,
    motivo,
    tenantId,
    usuario: actorId
  });

  return {
    ok: true,
    session,
    mensagem: 'Sessão de Pré-OS cancelada com sucesso.'
  };
}

module.exports = {
  confirmarIntake,
  cancelarIntake
};

