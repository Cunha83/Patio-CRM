'use strict';

const crypto = require('crypto');
const preOSEngine = require('./preOSEngine');
const { obterHistoricoVeiculo } = require('./vehicleHistoryService');
const { detectarRecorrencia } = require('./recurrenceDetector');
const { avaliarGarantia } = require('./warrantyService');
const { gerarResumoContexto } = require('./maintenanceContextService');
const {
  determinarProximaPergunta,
  extrairResposta,
  formatarResumoPreOS
} = require('./intakeQuestionEngine');
const { gerarTokenAcao, consumirTokenAcao } = require('../lib/tokens/securityToken');

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
 * Resolução composta por: tenantId + (actorId ou canal) + (veiculoId ou placa se fornecido).
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

  // Limpeza de sessões expiradas
  sessoes.forEach(s => {
    if (s.expiresAt && agora > s.expiresAt && STATUS_ATIVOS.includes(s.status)) {
      s.status = 'expirada';
      s.updatedAt = new Date().toISOString();
    }
  });

  // 1. Busca direta por sessionId
  if (sessionId) {
    return sessoes.find(s => s.id === sessionId && s.tenantId === tenantId) || null;
  }

  // 2. Busca por preOSId
  if (preOSId) {
    return sessoes.find(s => s.preOSId === preOSId && s.tenantId === tenantId) || null;
  }

  const placaLimpa = normalizarPlaca(placa);

  // 3. Busca por placa ou veículo se fornecido
  if (placaLimpa || vehicleId) {
    const sVeic = sessoes.find(s =>
      s.tenantId === tenantId &&
      STATUS_ATIVOS.includes(s.status) &&
      ((vehicleId && s.vehicleId === vehicleId) || (placaLimpa && normalizarPlaca(s.placa) === placaLimpa)) &&
      (!actorId || s.actorId === actorId)
    );
    if (sVeic) return sVeic;
  }

  // 4. Busca por actorId + channel ativos
  if (actorId && channel) {
    const sActor = sessoes.find(s =>
      s.tenantId === tenantId &&
      s.actorId === actorId &&
      s.channel === channel &&
      STATUS_ATIVOS.includes(s.status)
    );
    if (sActor) return sActor;
  }

  // 5. Busca apenas por actorId ativo
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

  // Executa triagem inicial da Pré-OS
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
    expiresAt: Date.now() + (24 * 60 * 60 * 1000)
  };

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

  // Verifica se há pergunta progressiva relevante a fazer
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
    // Se não há perguntas adicionais a fazer, gera resumo para confirmação
    concluirTriagemSessao({ session, preOS, resumo, state, actorId });
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

  // Gera token seguro de confirmação HMAC
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
 * Aplica uma correção natural de campo (ex: "Não, a quilometragem é 423.500")
 * Atualiza campo, recalcula contexto e auditoria sem duplicar a Pré-OS.
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

  // Atualiza campo na sessão e na Pré-OS
  session.collected[campo] = valor;
  if (campo === 'kmAtual') {
    preOS.kmAtual = Number(valor) || 0;
  }
  if (campo === 'reclamacaoOriginal') {
    preOS.reclamacaoOriginal = valor;
  }
  session.updatedAt = new Date().toISOString();

  // Recalcula histórico, recorrência e garantia com os novos dados
  const hist = obterHistoricoVeiculo({ tenantId, vehicleId: preOS.vehicleId, state });
  const recorrencia = detectarRecorrencia({
    reclamacao: preOS.reclamacaoOriginal,
    kmAtual: preOS.kmAtual,
    historicoVeiculo: hist
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

  // Atualiza alertas da Pré-OS
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

  // Verifica próxima pergunta ou encerra triagem
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

  // Finaliza perguntas e monta o resumo
  const hist = obterHistoricoVeiculo({ tenantId, vehicleId: preOS.vehicleId, state });
  const recorrencia = detectarRecorrencia({
    reclamacao: preOS.reclamacaoOriginal,
    kmAtual: preOS.kmAtual,
    historicoVeiculo: hist
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

  // Validação de token de confirmação seguro quando exigido
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

  // Converte Pré-OS em OS
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

  // 1. Tenta localizar sessão ativa existente
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

  // 2. Verifica se a mensagem é uma consulta permitida no meio da conversa (interrupção temporária)
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

  // 3. Verifica se a mensagem é um pedido de retomada de conversa interrompida
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
      const preOS = (state.preOS || []).find(p => p.id === session.preOSId);
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

  // 3.5 Cancelamento expresso durante qualquer fase da sessão
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

  // 4. Se já existe uma sessão ativa
  if (session) {
    // 4.1 Correção natural durante a conversa (ex: "não, a quilometragem é 423500", "errei o km")
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

    // 4.2 Sessão aguardando resposta de uma pergunta técnica específica
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

      // Se concluiu a triagem
      return {
        ok: true,
        tipo: 'resumo_triagem',
        sessionId: session.id,
        pendenteConfirmacao: resResp.precisaConfirmacao,
        token: session.confirmToken,
        resposta: `${resResp.resumoFormatado}\n\n${resResp.precisaConfirmacao ? '❓ *Deseja confirmar a abertura da Ordem de Serviço definitiva? (Sim/Não)*' : 'Pronto para prosseguir.'}`
      };
    }

    // 4.3 Sessão aguardando confirmação humana
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

      // Mensagem não reconhecida como confirmação (NUNCA auto-confirmar!)
      return {
        ok: true,
        tipo: 'aguardando_confirmacao',
        sessionId: session.id,
        resposta: '⚠️ A Pré-OS aguarda sua confirmação antes de gerar a Ordem de Serviço definitiva. Por favor, envie *Sim* para confirmar ou *Não* para cancelar.'
      };
    }
  }

  // 5. Nenhuma sessão ativa: Inicia novo intake se a mensagem indicar entrada veicular
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
  localizarSessaoAtiva,
  iniciarIntake,
  responderPergunta,
  corrigirCampo,
  confirmarIntake,
  cancelarIntake,
  processarMensagem
};
