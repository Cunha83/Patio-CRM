'use strict';

/**
 * services/whatsapp/whatsappLocalLlmNluService.js
 *
 * Motor NLU Híbrido para Agente WhatsApp (Ollama Local GPU + Fallback Determinístico).
 * Extração de Entidades, Catálogo de Tools e Despacho com Guarda RBAC.
 *
 * Teto Modular: <= 265 linhas
 */

const crypto = require('crypto');
const gerarId = p => `${p}_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;

const TOOLS_CATALOGO_PATIO_CRM = {
  SKILL_RECEPCAO_PATIO: ['triagem_360', 'fast_checkin_whatsapp', 'consultar_status_box', 'solicitar_link_aprovacao', 'consultar_prontuario'],
  SKILL_ORCAMENTISTA_TECNICO: ['gerar_pre_orcamento_cmp'],
  SKILL_COMPRAS_FORNECEDORES: ['abrir_cotacao_minimo_3', 'complementar_fornecedores', 'registrar_proposta_vendedor', 'mapa_comparativo'],
  SKILL_RECUPERACAO_CREDITO: ['consultar_regua_cliente', 'propor_acordo_divida', 'liquidar_entrada_acordo'],
  SKILL_ANALISTA_FINANCEIRO: ['briefing_dre_caixa', 'fechamento_caixa_diario', 'gerar_cobranca_pix_boleto', 'torre_controle_360'],
  SKILL_CONCILIACAO_EXTRATO: ['conciliar_extrato_bancario']
};

function configurarProvedorNluWhatsApp(state, payload = {}) {
  if (!state) throw new Error('Estado da aplicação não informado');
  state.whatsappNluConfig = {
    provedorPrimario: payload.provedorPrimario || 'ollama_local',
    ollamaBaseUrl: payload.ollamaBaseUrl || 'http://127.0.0.1:11434',
    modeloOllama: payload.modeloOllama || 'qwen2.5-coder:7b',
    fallbackProvedor: payload.fallbackProvedor || 'heuristico_deterministico',
    timeoutMs: Number(payload.timeoutMs) || 4000,
    temperatura: Number(payload.temperatura ?? 0.1),
    limiarConfiancaMinimo: Number(payload.limiarConfiancaMinimo ?? 0.75),
    ativo: payload.ativo !== false,
    atualizadoEm: payload.timestamp || new Date().toISOString()
  };
  return { ...state.whatsappNluConfig };
}

function extrairEntidadesTexto(mensagem = '') {
  const txt = String(mensagem || '');
  const entidades = {};

  // Placa Mercosul (ex: ABC1D23 ou ABC-1D23) ou Tradicional (ex: ABC-1234 ou ABC1234)
  const matchPlaca = txt.match(/\b([A-Z]{3}-?[0-9][A-Z0-9][0-9]{2})\b/i) || txt.match(/\b([A-Z]{3}-?[0-9]{4})\b/i);
  if (matchPlaca) entidades.placa = matchPlaca[1].replace(/[^A-Za-z0-9]/g, '').toUpperCase();

  // Quilometragem (ex: 412500 km ou 412.500 km)
  const matchKm = txt.match(/(\d{1,3}(?:\.\d{3})*|\d+)\s*(?:km|quil[oô]metros?)\b/i);
  if (matchKm) entidades.kmEntrada = Number(matchKm[1].replace(/\./g, ''));

  // Identificador de cliente (ex: cli_transp_ceara ou cliente Ceará)
  const matchCli = txt.match(/\b(cli_[a-z0-9_]+)\b/i);
  if (matchCli) entidades.clienteId = matchCli[1];

  // Valor monetário (ex: R$ 1.500,00 ou 1500)
  const matchVal = txt.match(/R\$\s*([\d\.]+(?:,\d{2})?)/i);
  if (matchVal) entidades.valorMonetario = Number(matchVal[1].replace(/\./g, '').replace(',', '.'));

  // Itens ou peças citados
  const itens = [];
  if (/mola|feixe/i.test(txt)) itens.push('Feixe de Molas Traseiro');
  if (/grampo/i.test(txt)) itens.push('Grampo de Mola 3/4');
  if (/pino.*centro/i.test(txt)) itens.push('Pino de Centro 1/2');
  if (/bucha/i.test(txt)) itens.push('Bucha de Bronze');
  if (itens.length > 0) entidades.itensMencionados = itens;

  return entidades;
}

function interpretarMensagemNluHibrido(state, payload = {}) {
  if (!state) throw new Error('Estado da aplicação não informado');
  const { mensagem = '', anexoExtrato = null, respostaLlmSimulada = null, simularFalhaOllama = false, timestamp } = payload;
  state.whatsappNluTelemetryLogs = Array.isArray(state.whatsappNluTelemetryLogs) ? state.whatsappNluTelemetryLogs : [];
  const cfg = state.whatsappNluConfig || {};

  if (anexoExtrato) {
    return {
      skillAlvo: 'SKILL_CONCILIACAO_EXTRATO',
      acaoEspecifica: 'conciliar_extrato_bancario',
      entidadesExtraidas: { anexoExtrato },
      confianca: 1.0,
      provedorExecutado: 'heuristico_deterministico',
      fallbackAcionado: false
    };
  }

  const entidadesExtraidas = extrairEntidadesTexto(mensagem);
  let skillAlvo = 'SKILL_RECEPCAO_PATIO';
  let acaoEspecifica = 'triagem_360';
  let confianca = 0.90;
  let provedorExecutado = 'heuristico_deterministico';
  let fallbackAcionado = false;

  const limiar = cfg.limiarConfiancaMinimo ?? 0.75;
  const podeUsarLlm = !simularFalhaOllama && respostaLlmSimulada && (respostaLlmSimulada.confianca || 0.9) >= limiar;

  if (podeUsarLlm) {
    skillAlvo = respostaLlmSimulada.skillAlvo || skillAlvo;
    acaoEspecifica = respostaLlmSimulada.acaoEspecifica || acaoEspecifica;
    confianca = respostaLlmSimulada.confianca || 0.95;
    provedorExecutado = cfg.modeloOllama || 'ollama_local';
    fallbackAcionado = false;
    if (respostaLlmSimulada.entidadesExtraidas) {
      Object.assign(entidadesExtraidas, respostaLlmSimulada.entidadesExtraidas);
    }
  } else {
    fallbackAcionado = !!simularFalhaOllama || !respostaLlmSimulada;
    provedorExecutado = 'heuristico_deterministico';

    const t = String(mensagem).toLowerCase();
    if (/comprar pe[cç]a|cota[cç][aã]o fornecedor|cota[cç][aã]o de pe[cç]a|compras/i.test(t)) {
      skillAlvo = 'SKILL_COMPRAS_FORNECEDORES'; acaoEspecifica = 'abrir_cotacao_minimo_3';
    } else if (/or[cç]amento|quanto fica|pr[eé]-?or[cç]amento|custo/i.test(t)) {
      skillAlvo = 'SKILL_ORCAMENTISTA_TECNICO'; acaoEspecifica = 'gerar_pre_orcamento_cmp';
    } else if (/r[eé]gua.*cobran[cç]a|renegoci|propor acordo|acordo.*d[ií]vida|liquidar entrada/i.test(t)) {
      skillAlvo = 'SKILL_RECUPERACAO_CREDITO';
      acaoEspecifica = /liquidar|pagar/i.test(t) ? 'liquidar_entrada_acordo' : (/acordo|proposta/i.test(t) ? 'propor_acordo_divida' : 'consultar_regua_cliente');
    } else if (/fechamento.*caixa|fechar caixa/i.test(t)) {
      skillAlvo = 'SKILL_ANALISTA_FINANCEIRO'; acaoEspecifica = 'fechamento_caixa_diario';
    } else if (/extrato|concili|ofx|cnab/i.test(t)) {
      skillAlvo = 'SKILL_CONCILIACAO_EXTRATO'; acaoEspecifica = 'conciliar_extrato_bancario';
    } else if (/torre de controle|briefing|dre|break-?even|faturament|inadimpl[eê]ncia|cobran[cç]a|pix|boleto/i.test(t)) {
      skillAlvo = 'SKILL_ANALISTA_FINANCEIRO'; acaoEspecifica = 'briefing_dre_caixa';
    } else {
      skillAlvo = 'SKILL_RECEPCAO_PATIO';
      acaoEspecifica = /box.*livre|status.*box/i.test(t) ? 'consultar_status_box' : (/prontu[aá]rio/i.test(t) ? 'consultar_prontuario' : 'triagem_360');
    }
  }

  const telemetria = {
    id: gerarId('nlu_telemetry'),
    mensagem,
    skillAlvo,
    acaoEspecifica,
    entidadesExtraidas,
    confianca,
    provedorExecutado,
    fallbackAcionado,
    timestamp: timestamp || new Date().toISOString()
  };
  state.whatsappNluTelemetryLogs.push(telemetria);

  return { skillAlvo, acaoEspecifica, entidadesExtraidas, confianca, provedorExecutado, fallbackAcionado };
}

function rotearMensagemComNluParaSkill(state, payload = {}) {
  const interpretacao = interpretarMensagemNluHibrido(state, payload);
  const { skillAlvo, acaoEspecifica, entidadesExtraidas } = interpretacao;

  // Guarda RBAC Estrita para comandos gerenciais / financeiros
  const skillsGerenciais = ['SKILL_ANALISTA_FINANCEIRO', 'SKILL_CONCILIACAO_EXTRATO', 'SKILL_COMPRAS_FORNECEDORES', 'SKILL_RECUPERACAO_CREDITO'];
  if (skillsGerenciais.includes(skillAlvo)) {
    const perfil = String(payload.perfilRemetente || '').toLowerCase();
    const permitido = ['gerencia', 'gerente', 'admin', 'diretoria', 'owner', 'financeiro', 'compras'].includes(perfil);
    if (!permitido) {
      const err = new Error('Acesso negado: Comandos de gestão são restritos à gerência/diretoria.');
      err.code = 'WHATSAPP_UNAUTHORIZED_MANAGEMENT_SKILL';
      err.status = 403;
      throw err;
    }
  }

  // Despacha para o orquestrador oficial de skills
  const { processarMensagemAgenteWhatsApp } = require('./whatsappAgentSkillsService');
  const resultadoSkill = processarMensagemAgenteWhatsApp(state, {
    ...payload,
    ...entidadesExtraidas,
    skill: skillAlvo,
    acaoRecepcao: acaoEspecifica,
    comandoAcao: acaoEspecifica
  });

  return { interpretacaoNlu: interpretacao, resultadoSkill };
}

module.exports = {
  TOOLS_CATALOGO_PATIO_CRM,
  configurarProvedorNluWhatsApp,
  extrairEntidadesTexto,
  interpretarMensagemNluHibrido,
  rotearMensagemComNluParaSkill
};
