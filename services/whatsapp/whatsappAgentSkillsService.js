'use strict';

/**
 * services/whatsapp/whatsappAgentSkillsService.js
 *
 * Fachada Central e Orquestrador do Agente de WhatsApp Multi-Skill:
 * - SKILL_RECEPCAO_PATIO: Delegado para whatsappReceptionPatioSkill.js
 * - SKILL_ANALISTA_FINANCEIRO: Delegado para whatsappFinancialAnalystSkill.js
 * - SKILL_CONCILIACAO_EXTRATO: Delegado para whatsappFinancialAnalystSkill.js
 *
 * Teto Modular: <= 200 linhas (Padrão Fachada Re-Export)
 */

const crypto = require('crypto');
const {
  executarSkillRecepcaoInterativaWhatsApp,
  executarSkillRecepcaoPatio,
  extrairPlaca
} = require('./whatsappReceptionPatioSkill');

const {
  executarSkillAnalistaFinanceiroAutonomo,
  executarSkillAnalistaFinanceiroGerencia,
  gerarCobrancaPixBoletoWhatsApp
} = require('./whatsappFinancialAnalystSkill');

function gerarId(prefix) {
  return prefix + '_' + Date.now() + '_' + crypto.randomBytes(3).toString('hex');
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
  if (/torre de controle|briefing|faturament|border[oô]|inadimpl[eê]ncia|contas a pagar|contas a receber|dre|caixa|briefing financeiro|ponto de equil|break-?even|lucro|rentabil|cobranca|pix|boleto/i.test(texto)) {
    return 'SKILL_ANALISTA_FINANCEIRO';
  }
  return 'SKILL_RECEPCAO_PATIO';
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
      resposta = executarSkillRecepcaoInterativaWhatsApp(state, payload);
    } else {
      resposta = executarSkillAnalistaFinanceiroAutonomo(state, { ...payload, skill });
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
    skill: resposta?.skill || skill,
    sucesso: true,
    timestamp: new Date().toISOString()
  });

  return resposta;
}

module.exports = {
  identificarIntencaoEPerfilWhatsApp,
  executarSkillRecepcaoPatio,
  executarSkillRecepcaoInterativaWhatsApp,
  executarSkillAnalistaFinanceiroGerencia,
  executarSkillAnalistaFinanceiroAutonomo,
  gerarCobrancaPixBoletoWhatsApp,
  processarMensagemAgenteWhatsApp,
  extrairPlaca
};
