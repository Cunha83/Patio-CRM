'use strict';

const { extrairResposta } = require('../intakeQuestionEngine');
const {
  localizarSessaoAtiva,
  iniciarIntake
} = require('./intakeSessionManager');
const {
  corrigirCampo,
  responderPergunta
} = require('./intakeLifecycle');
const {
  confirmarIntake,
  cancelarIntake
} = require('./intakeResolution');

/**
 * Roteador unificado de mensagens (Voz, WhatsApp, Web).
 * Mantém canal agnóstico de regras de negócio.
 */
async function processarMensagem({
  tenantId,
  actorId = 'operador',
  channel = 'web',
  texto = '',
  placa = null,
  vehicleId = null,
  state,
  context = {}
}) {
  if (!tenantId || !state) throw new Error('tenantId e state são obrigatórios.');
  const t = String(texto || '').trim();
  const tLower = t.toLowerCase();

  let session = localizarSessaoAtiva({
    tenantId,
    actorId,
    channel,
    vehicleId,
    placa,
    sessionId: context.sessionId || null,
    preOSId: context.preOSId || null,
    state
  });

  const isConsultaPatio = tLower.includes('quantos') || tLower.includes('quais caminhoes') || tLower.includes('boxes livres') || tLower.includes('status patio');
  if (isConsultaPatio && session) {
    session.interrupted = true;
    session.lastQueryInterruption = t;
    session.updatedAt = new Date().toISOString();
    return {
      ok: true,
      tipo: 'interrupcao_consulta',
      sessaoPreservada: true,
      sessionId: session.id,
      resposta: 'Temos atualmente veículos em atendimento nos boxes e vagas disponíveis no pátio. Quando quiser, basta dizer "continuar" para retomarmos a Pré-OS em andamento.'
    };
  }

  const isRetomada = tLower.includes('continuar') || tLower.includes('retomar') || tLower.includes('vamos continuar');
  if (isRetomada && session) {
    session.interrupted = false;
    session.updatedAt = new Date().toISOString();
    if (session.pendingQuestion) {
      return {
        ok: true,
        tipo: 'pergunta_retomada',
        sessionId: session.id,
        resposta: `Retomando a Pré-OS do veículo ${session.placa}. ${session.pendingQuestion.texto}`
      };
    }
    if (session.status === 'aguardando_confirmacao') {
      return {
        ok: true,
        tipo: 'confirmacao_retomada',
        sessionId: session.id,
        pendenteConfirmacao: true,
        token: session.confirmToken,
        resposta: `A Pré-OS do veículo ${session.placa} aguarda confirmação. Deseja confirmar a abertura da OS?`
      };
    }
  }

  const isCancelamentoExpresso = /^(cancelar|cancela|deixa pra lá|deixa pra la|abortar|cancela tudo)$/i.test(tLower);
  if (isCancelamentoExpresso && session) {
    const resCanc = cancelarIntake({
      tenantId,
      sessionId: session.id,
      motivo: 'Cancelado pelo operador no diálogo',
      state,
      actorId
    });
    return {
      ok: true,
      tipo: 'cancelamento_sucesso',
      sessionId: session.id,
      resposta: `❌ ${resCanc.mensagem}`
    };
  }

  if (session) {
    const isCorrecaoKm = tLower.includes('quilometragem') || tLower.includes('km') || tLower.startsWith('não') || tLower.startsWith('nao') || tLower.includes('errei');
    const kmNum = (t.match(/\b\d+(?:[.,]\d+)?\s*(?:mil|k)?\b/i)) ? extrairResposta({ question: { tipo: 'km' }, textoResposta: t }) : null;
    const isExplicitCorrection = tLower.startsWith('não') || tLower.startsWith('nao') || tLower.includes('errei') || tLower.includes('corrige') || tLower.includes('corrigir') || tLower.includes('quilometragem é');
    const isAnsweringKmQuestion = session.pendingQuestion && session.pendingQuestion.campo === 'kmAtual';

    if (isCorrecaoKm && kmNum && kmNum.valor > 0 && (!session.pendingQuestion || (!isAnsweringKmQuestion && isExplicitCorrection))) {
      const resCorrigido = corrigirCampo({
        tenantId,
        sessionId: session.id,
        campo: 'kmAtual',
        valor: kmNum.valor,
        state,
        actorId
      });
      return {
        ok: true,
        tipo: 'correcao_campo',
        sessionId: session.id,
        resposta: `${resCorrigido.mensagem}\n\n${resCorrigido.resumoFormatado}`
      };
    }

    if (session.status === 'aguardando_resposta' && session.pendingQuestion) {
      const resResp = responderPergunta({
        tenantId,
        sessionId: session.id,
        resposta: t,
        state,
        actorId
      });

      if (!resResp.concluido) {
        return {
          ok: true,
          tipo: 'proxima_pergunta',
          sessionId: session.id,
          resposta: resResp.proximaPergunta
        };
      }

      return {
        ok: true,
        tipo: 'resumo_triagem',
        sessionId: session.id,
        pendenteConfirmacao: resResp.precisaConfirmacao,
        token: session.confirmToken,
        resposta: `${resResp.resumoFormatado}\n\n${resResp.precisaConfirmacao ? '❓ *Deseja confirmar a abertura da Ordem de Serviço definitiva? (Sim/Não)*' : 'Pronto para prosseguir.'}`
      };
    }

    if (session.status === 'aguardando_confirmacao' || session.status === 'pronta_para_confirmacao') {
      const isSim = /^(sim|confirmar|confirmo|pode abrir|pode confirmar|autorizado|ok|pode fazer)$/i.test(tLower);
      const isNao = /^(não|nao|cancelar|cancela|deixa|abortar)$/i.test(tLower);

      if (isSim) {
        const resConf = confirmarIntake({
          tenantId,
          sessionId: session.id,
          state,
          actorId,
          confirmToken: session.confirmToken
        });
        return {
          ok: true,
          tipo: 'confirmacao_sucesso',
          sessionId: session.id,
          os: resConf.os,
          resposta: `✅ ${resConf.mensagem} Veículo alocado e pronto para atendimento!`
        };
      }

      if (isNao) {
        const resCanc = cancelarIntake({
          tenantId,
          sessionId: session.id,
          motivo: 'Cancelado pelo operador no diálogo',
          state,
          actorId
        });
        return {
          ok: true,
          tipo: 'cancelamento_sucesso',
          sessionId: session.id,
          resposta: `❌ ${resCanc.mensagem}`
        };
      }

      return {
        ok: true,
        tipo: 'aguardando_confirmacao',
        sessionId: session.id,
        resposta: '⚠️ A Pré-OS aguarda sua confirmação antes de gerar a Ordem de Serviço definitiva. Por favor, envie *Sim* para confirmar ou *Não* para cancelar.'
      };
    }
  }

  return iniciarIntake({
    tenantId,
    actorId,
    channel,
    vehicleId,
    placa,
    kmAtual: 0,
    reclamacao: t,
    state
  });
}

module.exports = {
  processarMensagem
};
