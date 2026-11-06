'use strict';

const crypto = require('crypto');
const preOSEngine = require('../preOSEngine');
const {
  determinarProximaPergunta,
  formatarResumoPreOS
} = require('../intakeQuestionEngine');
const { gerarTokenAcao } = require('../../lib/tokens/securityToken');

function gerarId(prefix) {
  return `${prefix}_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
}

function normalizarPlaca(str) {
  if (!str) return null;
  return String(str).toUpperCase().replace(/[^A-Z0-9]/g, '');
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

/**
 * Localiza a sessão de intake ativa mais apropriada para a mensagem.
 */
function localizarSessaoAtiva({
  tenantId,
  actorId = null,
  channel = null,
  vehicleId = null,
  placa = null,
  sessionId = null,
  preOSId = null,
  state
}) {
  if (!tenantId || !state) return null;
  const sessoes = Array.isArray(state.intakeSessions) ? state.intakeSessions : [];
  const agora = Date.now();

  const STATUS_ATIVOS = ['coletando', 'aguardando_resposta', 'aguardando_confirmacao', 'pronta_para_confirmacao'];

  sessoes.forEach(s => {
    if (s.expiresAt && agora > s.expiresAt && STATUS_ATIVOS.includes(s.status)) {
      s.status = 'expirada';
      s.updatedAt = new Date().toISOString();
    }
  });

  if (sessionId) {
    return sessoes.find(s => s.id === sessionId && s.tenantId === tenantId) || null;
  }

  if (preOSId) {
    return sessoes.find(s => s.preOSId === preOSId && s.tenantId === tenantId) || null;
  }

  const placaLimpa = normalizarPlaca(placa);

  if (placaLimpa || vehicleId) {
    const sVeic = sessoes.find(s =>
      s.tenantId === tenantId &&
      STATUS_ATIVOS.includes(s.status) &&
      ((vehicleId && s.vehicleId === vehicleId) || (placaLimpa && normalizarPlaca(s.placa) === placaLimpa)) &&
      (!actorId || s.actorId === actorId)
    );
    if (sVeic) return sVeic;
  }

  if (actorId && channel) {
    const sActor = sessoes.find(s =>
      s.tenantId === tenantId &&
      s.actorId === actorId &&
      s.channel === channel &&
      STATUS_ATIVOS.includes(s.status)
    );
    if (sActor) return sActor;
  }

  if (actorId) {
    const sA = sessoes.find(s =>
      s.tenantId === tenantId &&
      s.actorId === actorId &&
      STATUS_ATIVOS.includes(s.status)
    );
    if (sA) return sA;
  }

  return null;
}

function formatarInicioConversa({ preOS, resumo, proximaPergunta }) {
  const placa = preOS.placa || 'do veículo';
  const linhas = [`Localizei o veículo ${placa}.`];

  const ocorrencia = resumo.servicosRelacionados && resumo.servicosRelacionados[0];
  if (ocorrencia) {
    const nomeS = (ocorrencia.servicos && ocorrencia.servicos[0]) || 'manutenção anterior';
    linhas.push(`Encontrei no histórico um ${nomeS} realizado há ${ocorrencia.diasAtras || 0} dias.`);
  }

  if (proximaPergunta) {
    linhas.push(proximaPergunta);
  }

  return linhas.join('\n\n');
}

/**
 * Conclui a fase de perguntas da sessão e prepara para confirmação
 */
function concluirTriagemSessao({ session, preOS, resumo, state, actorId }) {
  session.status = (resumo.nivelAtencao === 'alto' || resumo.nivelAtencao === 'atencao' || preOS.possivelGarantia)
    ? 'aguardando_confirmacao'
    : 'pronta_para_confirmacao';

  session.pendingQuestion = null;
  session.updatedAt = new Date().toISOString();

  const token = gerarTokenAcao({
    tenantId: session.tenantId,
    actorId: actorId || session.actorId,
    resourceId: preOS.id,
    action: 'converter_pre_os',
    version: state.versao || 0,
    ttlMs: 24 * 60 * 60 * 1000
  });

  session.confirmToken = token;

  registrarAuditoria(state, {
    acao: 'intake_concluido',
    sessionId: session.id,
    preOSId: preOS.id,
    status: session.status,
    nivelAtencao: resumo.nivelAtencao,
    possivelGarantia: preOS.possivelGarantia,
    tenantId: session.tenantId
  });
}

/**
 * Inicia uma nova sessão técnica de intake.
 */
function iniciarIntake({
  tenantId,
  actorId = 'operador',
  channel = 'web',
  vehicleId = null,
  placa = null,
  clienteId = null,
  kmAtual = 0,
  reclamacao = '',
  state,
  dataReferencia = null
}) {
  if (!tenantId || typeof tenantId !== 'string') {
    throw new Error('tenantId é obrigatório para iniciar sessão técnica de intake.');
  }
  if (!state) {
    throw new Error('Estado do tenant é obrigatório.');
  }

  state.intakeSessions = Array.isArray(state.intakeSessions) ? state.intakeSessions : [];

  const triagem = preOSEngine.triagemEntrada({
    tenantId,
    vehicleId,
    placa,
    clienteId,
    kmAtual,
    reclamacao,
    origem: channel,
    actorId,
    state,
    dataReferencia
  });

  const preOS = triagem.preOS;
  const resumo = triagem.resumoContexto;

  const session = {
    id: gerarId('ses'),
    tenantId,
    actorId: actorId || 'operador',
    channel: channel || 'web',
    vehicleId: preOS.vehicleId,
    placa: preOS.placa,
    clienteId: preOS.clienteId,
    preOSId: preOS.id,
    status: 'coletando',
    collected: {
      kmAtual: Number(preOS.kmAtual) || 0,
      reclamacaoOriginal: preOS.reclamacaoOriginal,
      categoria: preOS.categoria || null,
      sintomas: preOS.sintomas || [],
      condicoes: null,
      regiao: null,
      ruido: null,
      fluido: null
    },
    missing: [],
    answeredQuestions: [],
    pendingQuestion: null,
    confirmToken: null,
    interrupted: false,
    lastQueryInterruption: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    expiresAt: Date.now() + (24 * 60 * 60 * 1000),
    dataReferencia: dataReferencia || null
  };
  preOS.dataReferencia = dataReferencia || null;

  registrarAuditoria(state, {
    acao: 'intake_iniciado',
    sessionId: session.id,
    preOSId: preOS.id,
    placa: preOS.placa,
    tenantId,
    usuario: actorId,
    canal: channel
  });

  if (resumo.historicoVeiculo?.totalOS > 0) {
    registrarAuditoria(state, {
      acao: 'historico_consultado',
      sessionId: session.id,
      vehicleId: preOS.vehicleId,
      placa: preOS.placa,
      totalOS: resumo.historicoVeiculo.totalOS,
      tenantId
    });
  }

  if (preOS.ocorrenciasRelacionadas && preOS.ocorrenciasRelacionadas.length > 0) {
    registrarAuditoria(state, {
      acao: 'recorrencia_detectada',
      sessionId: session.id,
      preOSId: preOS.id,
      ocorrenciasTotal: preOS.ocorrenciasRelacionadas.length,
      tenantId
    });
  }

  if (preOS.possivelGarantia) {
    registrarAuditoria(state, {
      acao: 'possivel_garantia_detectada',
      sessionId: session.id,
      preOSId: preOS.id,
      motivo: resumo.motivoGarantia,
      tenantId
    });
  }

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
  } else {
    concluirTriagemSessao({ session, preOS, resumo, state, actorId });
  }

  if (!Array.isArray(state.preOS)) state.preOS = [];
  if (!state.preOS.some(p => p.id === preOS.id)) {
    state.preOS.unshift(preOS);
  }
  state.intakeSessions.unshift(session);

  return {
    ok: true,
    session,
    preOS,
    resumoContexto: resumo,
    proximaPergunta: session.pendingQuestion ? session.pendingQuestion.texto : null,
    respostaSugerida: session.pendingQuestion
      ? formatarInicioConversa({ preOS, resumo, proximaPergunta: session.pendingQuestion.texto })
      : formatarResumoPreOS({ preOS, session, resumoContexto: resumo })
  };
}

module.exports = {
  gerarId,
  normalizarPlaca,
  registrarAuditoria,
  localizarSessaoAtiva,
  formatarInicioConversa,
  concluirTriagemSessao,
  iniciarIntake
};
