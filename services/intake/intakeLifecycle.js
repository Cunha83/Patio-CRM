'use strict';

const { obterHistoricoVeiculo } = require('../vehicleHistoryService');
const { detectarRecorrencia } = require('../recurrenceDetector');
const { avaliarGarantia } = require('../warrantyService');
const { gerarResumoContexto } = require('../maintenanceContextService');
const {
  determinarProximaPergunta,
  extrairResposta,
  formatarResumoPreOS
} = require('../intakeQuestionEngine');
const {
  registrarAuditoria,
  concluirTriagemSessao
} = require('./intakeSessionManager');

/**
 * Aplica uma correção natural de campo (ex: "Não, a quilometragem é 423.500")
 */
function corrigirCampo({
  tenantId,
  sessionId,
  campo,
  valor,
  state,
  actorId = 'operador'
}) {
  if (!tenantId || !state) throw new Error('tenantId e state são obrigatórios.');
  const sessoes = Array.isArray(state.intakeSessions) ? state.intakeSessions : [];
  const session = sessoes.find(s => s.id === sessionId && s.tenantId === tenantId);
  if (!session) {
    return { ok: false, status: 404, error: 'Sessão de intake não encontrada.' };
  }

  const preOS = (state.preOS || []).find(p => p.id === session.preOSId && p.tenantId === tenantId);
  if (!preOS) {
    return { ok: false, status: 404, error: 'Pré-OS associada à sessão não encontrada.' };
  }

  const valorAnterior = session.collected[campo] !== undefined ? session.collected[campo] : preOS[campo];

  session.collected[campo] = valor;
  if (campo === 'kmAtual') {
    preOS.kmAtual = Number(valor) || 0;
  }
  if (campo === 'reclamacaoOriginal') {
    preOS.reclamacaoOriginal = valor;
  }
  session.updatedAt = new Date().toISOString();

  const hist = obterHistoricoVeiculo({ tenantId, vehicleId: preOS.vehicleId, state });
  const recorrencia = detectarRecorrencia({
    reclamacao: preOS.reclamacaoOriginal,
    kmAtual: preOS.kmAtual,
    historicoVeiculo: hist,
    dataReferencia: session.dataReferencia || preOS.dataReferencia || null
  });

  let garantia = null;
  if (recorrencia.ocorrenciasRelacionadas.length > 0) {
    garantia = avaliarGarantia({
      ocorrencia: recorrencia.ocorrenciasRelacionadas[0],
      tenantCfg: state.cfg || {}
    });
  }

  const resumo = gerarResumoContexto({
    vehicleId: preOS.vehicleId,
    placa: preOS.placa,
    kmAtual: preOS.kmAtual,
    historicoVeiculo: hist,
    ocorrenciasRelacionadas: recorrencia.ocorrenciasRelacionadas,
    garantiaAvaliada: garantia,
    reclamacaoOriginal: preOS.reclamacaoOriginal
  });

  preOS.ocorrenciasRelacionadas = recorrencia.ocorrenciasRelacionadas;
  preOS.possivelGarantia = Boolean(garantia?.possivelGarantia);

  preOS.alertas = [];
  if (garantia && garantia.possivelGarantia) {
    preOS.alertas.push({ nivel: 'alto', mensagem: garantia.motivo, tipo: 'garantia' });
  } else if (recorrencia.ocorrenciasRelacionadas.length > 0) {
    const rec = recorrencia.ocorrenciasRelacionadas[0];
    preOS.alertas.push({
      nivel: resumo.nivelAtencao,
      mensagem: `Serviço semelhante realizado há ${rec.diasAtras} dias (OS #${rec.osNum}, ${rec.kmAnterior.toLocaleString('pt-BR')} km).`,
      tipo: 'recorrencia'
    });
  }

  preOS.status = (resumo.nivelAtencao === 'alto' || resumo.nivelAtencao === 'atencao' || preOS.possivelGarantia)
    ? 'aguardando_confirmacao'
    : 'rascunho';

  session.status = preOS.status === 'aguardando_confirmacao' ? 'aguardando_confirmacao' : 'pronta_para_confirmacao';

  registrarAuditoria(state, {
    acao: 'campo_corrigido',
    sessionId: session.id,
    preOSId: preOS.id,
    campo,
    valorAnterior,
    novoValor: valor,
    usuario: actorId,
    tenantId
  });

  const textoResumo = formatarResumoPreOS({ preOS, session, resumoContexto: resumo });

  return {
    ok: true,
    session,
    preOS,
    resumoContexto: resumo,
    mensagem: `Campo "${campo}" corrigido com sucesso para ${typeof valor === 'number' ? valor.toLocaleString('pt-BR') : valor}.`,
    resumoFormatado: textoResumo
  };
}

/**
 * Responde a uma pergunta técnica pendente na sessão
 */
function responderPergunta({
  tenantId,
  sessionId,
  resposta,
  state,
  actorId = 'operador'
}) {
  if (!tenantId || !state) throw new Error('tenantId e state são obrigatórios.');
  const sessoes = Array.isArray(state.intakeSessions) ? state.intakeSessions : [];
  const session = sessoes.find(s => s.id === sessionId && s.tenantId === tenantId);
  if (!session) {
    return { ok: false, status: 404, error: 'Sessão de intake não encontrada.' };
  }

  const preOS = (state.preOS || []).find(p => p.id === session.preOSId && p.tenantId === tenantId);
  if (!preOS) {
    return { ok: false, status: 404, error: 'Pré-OS associada não encontrada.' };
  }

  const q = session.pendingQuestion;
  const extraido = extrairResposta({ question: q, textoResposta: resposta });

  if (q) {
    session.answeredQuestions.push({
      id: q.id,
      campo: q.campo,
      pergunta: q.texto,
      resposta: extraido ? extraido.valor : resposta,
      formatado: extraido ? extraido.formatado : resposta,
      timestamp: new Date().toISOString()
    });

    if (extraido) {
      session.collected[q.campo] = extraido.valor;
      if (q.campo === 'kmAtual') {
        preOS.kmAtual = Number(extraido.valor) || 0;
      }
    }

    registrarAuditoria(state, {
      acao: 'resposta_registrada',
      sessionId: session.id,
      preOSId: preOS.id,
      campo: q.campo,
      resposta: extraido ? extraido.valor : resposta,
      tenantId,
      usuario: actorId
    });
  }

  session.updatedAt = new Date().toISOString();

  const prox = determinarProximaPergunta({
    categoria: preOS.categoria,
    reclamacaoOriginal: preOS.reclamacaoOriginal,
    collected: session.collected,
    answeredQuestions: session.answeredQuestions
  });

  if (prox) {
    session.pendingQuestion = prox;
    session.status = 'aguardando_resposta';

    registrarAuditoria(state, {
      acao: 'pergunta_realizada',
      sessionId: session.id,
      campo: prox.campo,
      pergunta: prox.texto,
      tenantId
    });

    return {
      ok: true,
      concluido: false,
      session,
      proximaPergunta: prox.texto
    };
  }

  const hist = obterHistoricoVeiculo({ tenantId, vehicleId: preOS.vehicleId, state });
  const recorrencia = detectarRecorrencia({
    reclamacao: preOS.reclamacaoOriginal,
    kmAtual: preOS.kmAtual,
    historicoVeiculo: hist,
    dataReferencia: session.dataReferencia || preOS.dataReferencia || null
  });

  let garantia = null;
  if (recorrencia.ocorrenciasRelacionadas.length > 0) {
    garantia = avaliarGarantia({
      ocorrencia: recorrencia.ocorrenciasRelacionadas[0],
      tenantCfg: state.cfg || {}
    });
  }

  const resumo = gerarResumoContexto({
    vehicleId: preOS.vehicleId,
    placa: preOS.placa,
    kmAtual: preOS.kmAtual,
    historicoVeiculo: hist,
    ocorrenciasRelacionadas: recorrencia.ocorrenciasRelacionadas,
    garantiaAvaliada: garantia,
    reclamacaoOriginal: preOS.reclamacaoOriginal
  });

  concluirTriagemSessao({ session, preOS, resumo, state, actorId });

  const textoResumo = formatarResumoPreOS({ preOS, session, resumoContexto: resumo });

  return {
    ok: true,
    concluido: true,
    session,
    preOS,
    resumoContexto: resumo,
    resumoFormatado: textoResumo,
    precisaConfirmacao: session.status === 'aguardando_confirmacao'
  };
}

module.exports = {
  corrigirCampo,
  responderPergunta
};
