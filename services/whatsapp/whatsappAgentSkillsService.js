'use strict';

/**
 * services/whatsapp/whatsappAgentSkillsService.js
 *
 * Agente Conversacional e Operacional de WhatsApp Multi-Skill:
 * - SKILL_RECEPCAO_PATIO: Consulta de placa, box, gargalos e pré-check-in.
 * - SKILL_ANALISTA_FINANCEIRO: Briefing executivo com guarda RBAC.
 * - SKILL_CONCILIACAO_EXTRATO: Baixa automática de extratos bancários enviados no chat.
 *
 * Teto Modular: <= 350 linhas
 */

const crypto = require('crypto');
const bankStatementReconciliationService = require('../finance/bankStatementReconciliationService');

function round2(v) {
  return Math.round((Number(v) || 0) * 100) / 100;
}

function gerarId(prefix) {
  return prefix + '_' + Date.now() + '_' + crypto.randomBytes(3).toString('hex');
}

function extrairPlaca(texto = '', placaParam = '') {
  if (placaParam) {
    return String(placaParam).replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  }
  const m = String(texto).match(/[A-Za-z]{3}[- ]?[0-9][A-Za-z0-9][0-9]{2}/i);
  return m ? m[0].replace(/[^A-Za-z0-9]/g, '').toUpperCase() : null;
}

/**
 * Roteia a intenção da mensagem e determina a Skill adequada.
 */
function identificarIntencaoEPerfilWhatsApp(mensagem = '', options = {}) {
  if (options.anexoExtrato) return 'SKILL_CONCILIACAO_EXTRATO';

  const texto = String(mensagem || '').toLowerCase();
  if (/extrato|concili|ofx|cnab/i.test(texto)) {
    return 'SKILL_CONCILIACAO_EXTRATO';
  }
  if (/faturament|border[oô]|inadimpl[eê]ncia|contas a pagar|contas a receber|dre|caixa|briefing financeiro|ponto de equil|break-?even|lucro|rentabil/i.test(texto)) {
    return 'SKILL_ANALISTA_FINANCEIRO';
  }
  return 'SKILL_RECEPCAO_PATIO';
}

/**
 * Skill de Recepção de Pátio: status de box, gargalo e pré-check-in.
 */
function executarSkillRecepcaoPatio(state, payload = {}) {
  state.receptionQueue = Array.isArray(state.receptionQueue) ? state.receptionQueue : [];
  state.os = Array.isArray(state.os) ? state.os : [];
  state.patioBoxes = Array.isArray(state.patioBoxes) ? state.patioBoxes : [];
  state.patioBottlenecks = Array.isArray(state.patioBottlenecks) ? state.patioBottlenecks : [];

  const placa = extrairPlaca(payload.mensagem, payload.placa);
  const isCheckin = payload.acaoRecepcao === 'pre_checkin' || /cheg|check-?in|entrada|fila|recep[cç][aã]o/i.test(payload.mensagem || '');

  if (isCheckin) {
    const protocolo = 'REC-' + Date.now().toString().slice(-4);
    const itemFila = {
      id: gerarId('rec'),
      protocolo,
      placa: placa || 'NÃO_INFORMADA',
      clienteNome: payload.clienteNome || 'Motorista Frotista',
      dataChegada: payload.timestamp || new Date().toISOString(),
      status: 'aguardando_triagem'
    };
    state.receptionQueue.push(itemFila);

    const txt = `Olá! Seu pré-check-in foi registrado com sucesso sob o protocolo *${protocolo}* para o veículo placa ${placa || ''}. Dirija-se ao Box de Triagem Inicial para vistoria.`;
    return {
      skill: 'SKILL_RECEPCAO_PATIO',
      acaoExecutada: 'pre_checkin',
      protocolo,
      respostaTextoWhatsApp: txt,
      dadosOperacionais: { itemFila, filaRecepcao: state.receptionQueue }
    };
  }

  if (!placa) {
    return {
      skill: 'SKILL_RECEPCAO_PATIO',
      acaoExecutada: 'solicitar_placa',
      respostaTextoWhatsApp: 'Por favor, informe a placa do veículo (ex: ABC1D23) para consultarmos a situação no pátio.',
      dadosOperacionais: null
    };
  }

  const os = state.os.find(o =>
    o.placa && o.placa.replace(/[^A-Za-z0-9]/g, '').toUpperCase() === placa &&
    o.st !== 'finalizada' && o.st !== 'entregue'
  );

  if (os) {
    const box = state.patioBoxes.find(b => b.osAtualId === os.id || b.id === os.boxAtualId);
    const gargalo = state.patioBottlenecks.find(g => g.osId === os.id && g.status !== 'encerrado');

    const txt = `🚚 *Situação Operacional (${placa}):*\n` +
      `• OS: #${os.num || os.id} (${os.st || 'em andamento'})\n` +
      `• Localização: ${box?.nome || 'Box Pesado'}\n` +
      `• Situação: ${gargalo ? `⚠️ Gargalo Ativo (${gargalo.motivoParada})` : '🟢 Em execução regular no box'}`;

    return {
      skill: 'SKILL_RECEPCAO_PATIO',
      acaoExecutada: 'consulta_status',
      respostaTextoWhatsApp: txt,
      dadosOperacionais: { os, box, gargalo }
    };
  }

  return {
    skill: 'SKILL_RECEPCAO_PATIO',
    acaoExecutada: 'consulta_status',
    respostaTextoWhatsApp: `Não encontramos ordem de serviço ativa no pátio para o veículo placa ${placa}.`,
    dadosOperacionais: null
  };
}

/**
 * Skill Analista Financeiro da Gerência: Briefing executivo ou baixa de extrato com guarda RBAC.
 */
function executarSkillAnalistaFinanceiroGerencia(state, payload = {}) {
  const perfil = String(payload.perfilRemetente || '').toLowerCase();
  const autorizado = ['gerencia', 'admin', 'diretoria', 'owner'].includes(perfil);

  if (!autorizado) {
    const err = new Error('Acesso negado: Comandos financeiros são restritos à gerência/diretoria.');
    err.code = 'WHATSAPP_UNAUTHORIZED_MANAGEMENT_SKILL';
    err.status = 403;
    throw err;
  }

  if (/dre|ponto de equil|break-?even|lucro|rentabil/i.test(payload.mensagem || '') || payload.comandoAcao === 'consultar_dre') {
    const executiveDreBreakEvenService = require('../finance/executiveDreBreakEvenService');
    const resDre = executiveDreBreakEvenService.gerarRelatorioExecutivoDreWhatsApp(state, {
      competencia: payload.competencia,
      metaLucroDesejado: payload.metaLucroDesejado
    });
    return {
      skill: 'SKILL_ANALISTA_FINANCEIRO',
      subtipo: 'dre_breakeven_briefing',
      respostaTextoWhatsApp: resDre.respostaTextoWhatsApp,
      dadosExecutivos: resDre
    };
  }

  if (payload.anexoExtrato || payload.skill === 'SKILL_CONCILIACAO_EXTRATO') {
    const resConciliacao = bankStatementReconciliationService.conciliarExtratoBancarioAutomatico(state, {
      ...(payload.anexoExtrato || { formato: 'pdf_texto', conteudoRaw: payload.mensagem }),
      origemCanal: 'whatsapp_gerencia',
      responsavel: payload.remetente || 'gerencia_wpp'
    });

    const txt = `📊 *Relatório de Conciliação Bancária via WhatsApp:*\n` +
      `• Transações Lidas: ${resConciliacao.totalTransacoes}\n` +
      `• Baixadas Automaticamente: ${resConciliacao.conciliadasAutomaticamenteCount}\n` +
      `• Borderôs B2B Quitados: ${resConciliacao.borderosLiquidadosIds.length}\n` +
      `• Contas a Pagar Baixadas: ${resConciliacao.contasBaixadasIds.length}\n` +
      `• Pendentes de Revisão: ${resConciliacao.pendentesRevisaoHumana.length}`;

    return {
      skill: 'SKILL_CONCILIACAO_EXTRATO',
      respostaTextoWhatsApp: txt,
      conciliacao: resConciliacao
    };
  }

  // Briefing Executivo
  const borderos = [
    ...(Array.isArray(state.borderosFrotistas) ? state.borderosFrotistas : []),
    ...(Array.isArray(state.borderos) ? state.borderos : [])
  ];
  const contas = Array.isArray(state.contas) ? state.contas : [];
  const hoje = new Date().toISOString().slice(0, 10);

  let totalAberto = 0;
  let totalAtraso = 0;
  for (const b of borderos) {
    if (b.status === 'liquidado' || b.status === 'pago') continue;
    const saldo = b.saldoDevedor !== undefined ? Number(b.saldoDevedor) : (Number(b.valorTotal || 0) - Number(b.valorPagoAcumulado || 0));
    totalAberto = round2(totalAberto + saldo);
    if (b.dataVencimento && String(b.dataVencimento).slice(0, 10) < hoje) {
      totalAtraso = round2(totalAtraso + saldo);
    }
  }

  let totalPagar = 0;
  for (const c of contas) {
    if (c.tipo === 'pagar' && c.status !== 'pago') {
      totalPagar = round2(totalPagar + Number(c.valor || 0));
    }
  }

  const txt = `📈 *Briefing Financeiro Executivo (Analista Verônica):*\n` +
    `• *Borderôs B2B em Aberto:* R$ ${totalAberto.toFixed(2)}\n` +
    `• *Borderôs Vencidos:* R$ ${totalAtraso.toFixed(2)}\n` +
    `• *Contas a Pagar Pendentes:* R$ ${totalPagar.toFixed(2)}\n` +
    `• *Saldo Projetado:* R$ ${(totalAberto - totalPagar).toFixed(2)}`;

  return {
    skill: 'SKILL_ANALISTA_FINANCEIRO',
    respostaTextoWhatsApp: txt,
    kpisFinanceiros: { totalAberto, totalAtraso, totalPagar }
  };
}

/**
 * Ponto de entrada unificado que roteia e audita as mensagens do Agente WhatsApp.
 */
function processarMensagemAgenteWhatsApp(state, payload = {}) {
  if (!state) throw new Error('Estado da aplicação não informado');
  state.whatsappAgentLogs = Array.isArray(state.whatsappAgentLogs) ? state.whatsappAgentLogs : [];

  const skill = payload.skill || identificarIntencaoEPerfilWhatsApp(payload.mensagem, payload);

  let resposta = null;
  try {
    if (skill === 'SKILL_RECEPCAO_PATIO') {
      resposta = executarSkillRecepcaoPatio(state, payload);
    } else {
      resposta = executarSkillAnalistaFinanceiroGerencia(state, { ...payload, skill });
    }
  } catch (err) {
    state.whatsappAgentLogs.push({
      id: gerarId('wpp_log'),
      remetente: payload.remetente || 'desconhecido',
      perfilRemetente: payload.perfilRemetente || 'cliente',
      mensagem: payload.mensagem || '',
      skill,
      sucesso: false,
      erro: err.message,
      timestamp: new Date().toISOString()
    });
    throw err;
  }

  state.whatsappAgentLogs.push({
    id: gerarId('wpp_log'),
    remetente: payload.remetente || 'desconhecido',
    perfilRemetente: payload.perfilRemetente || 'cliente',
    mensagem: payload.mensagem || '',
    skill: resposta.skill,
    sucesso: true,
    timestamp: new Date().toISOString()
  });

  return resposta;
}

module.exports = {
  identificarIntencaoEPerfilWhatsApp,
  executarSkillRecepcaoPatio,
  executarSkillAnalistaFinanceiroGerencia,
  processarMensagemAgenteWhatsApp
};
