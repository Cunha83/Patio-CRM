'use strict';

const { acoesPendentes, consumirTokenAcao, validarTokenAcao } = require('./voiceSecurity');
const preOSEngine = require('../preOSEngine');

async function handleConfirmationAction({ context = {}, state = {}, executarAcaoFn }) {
  let token = context.confirmToken;
  if (!token && context.canal) {
    for (const [t, a] of acoesPendentes) {
      if (a.context?.canal === context.canal &&
          (!context.remetente || a.context?.remetente === context.remetente)) {
        token = t;
        break;
      }
    }
  }

  if (!token) {
    return {
      ok: false,
      acao: 'confirmar_acao',
      negado: true,
      resposta: 'Não há token de confirmação informado para a ação.'
    };
  }

  const shouldAutoConsume = context.autoConsumirToken === true;
  const validacao = shouldAutoConsume
    ? consumirTokenAcao(token, {
        tenantId: context.tenantId,
        actorId: context.actorId
      })
    : validarTokenAcao(token, {
        tenantId: context.tenantId,
        actorId: context.actorId
      });

  if (!validacao.ok) {
    return {
      ok: false,
      acao: 'confirmar_acao',
      negado: true,
      resposta: validacao.error || 'Token de confirmação inválido ou expirado.'
    };
  }

  let acaoPendente = acoesPendentes.get(token);
  if (!acaoPendente) {
    return {
      ok: false,
      acao: 'confirmar_acao',
      resposta: 'Não há nenhuma ação pendente aguardando confirmação no momento.'
    };
  }

  if (acaoPendente.context?.tenantId && context.tenantId && acaoPendente.context.tenantId !== context.tenantId) {
    if (shouldAutoConsume) acoesPendentes.delete(token);
    return {
      ok: false,
      acao: 'confirmar_acao',
      resposta: 'Violação de isolamento: token pertence a outro tenant.'
    };
  }

  if (acaoPendente.context?.actorId && context.actorId && acaoPendente.context.actorId !== context.actorId) {
    if (shouldAutoConsume) acoesPendentes.delete(token);
    return {
      ok: false,
      acao: 'confirmar_acao',
      resposta: 'Ação só pode ser confirmada pelo mesmo operador que a solicitou.'
    };
  }

  if (shouldAutoConsume) {
    acoesPendentes.delete(token);
  } else {
    acaoPendente.emProcessamento = true;
  }

  if (acaoPendente.preOSId) {
    const tenantId = context.tenantId || acaoPendente.context?.tenantId || 'default';
    const conv = preOSEngine.converterEmOS({
      tenantId,
      preOSId: acaoPendente.preOSId,
      state,
      actorId: context.actorId || acaoPendente.context?.actorId || 'operador'
    });
    if (!conv.ok) {
      return conv;
    }
    return {
      ok: true,
      acao: 'abrir_os',
      osId: conv.os.id,
      numOS: conv.os.num,
      veiculoId: conv.os.vei,
      clienteId: conv.os.cli,
      preOSId: acaoPendente.preOSId,
      possivelGarantia: conv.preOS.possivelGarantia,
      resposta: `Abertura confirmada! OS #${conv.os.num} gerada com sucesso a partir da Pré-OS.${conv.preOS.possivelGarantia ? ' (Identificado possível retorno em garantia)' : ''}`
    };
  }

  // Executa a ação guardada com autorização interna comprovada
  return await executarAcaoFn({
    interpretado: acaoPendente.interpretado,
    input: acaoPendente.input,
    context: { ...acaoPendente.context, _confirmadoInternamente: true, preOSConfirmada: true },
    state
  });
}

function handleCancellationAction({ context = {}, state = {} }) {
  let token = context.confirmToken;
  if (!token && context.canal) {
    for (const [t, a] of acoesPendentes) {
      if (a.context?.canal === context.canal &&
          (!context.remetente || a.context?.remetente === context.remetente)) {
        token = t;
        break;
      }
    }
  }
  let preOSId = null;
  if (token && acoesPendentes.has(token)) {
    const p = acoesPendentes.get(token);
    preOSId = p.preOSId;
    acoesPendentes.delete(token);
  }
  if (preOSId) {
    const tenantId = context.tenantId || 'default';
    preOSEngine.cancelarPreOS({
      tenantId,
      preOSId,
      motivo: 'Operador cancelou a abertura após alerta de histórico',
      state,
      actorId: context.actorId || 'operador'
    });
  }
  return {
    ok: true,
    acao: 'cancelar_acao_pendente',
    preOSId,
    resposta: 'Abertura cancelada com segurança. A Pré-OS foi mantida como cancelada no histórico técnico.'
  };
}

module.exports = {
  handleConfirmationAction,
  handleCancellationAction
};

