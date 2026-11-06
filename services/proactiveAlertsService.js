'use strict';

/**
 * PÁTIO CRM — SERVIÇO DE ALERTAS PROATIVOS DA VERÔNICA NO WHATSAPP
 * Fachada Modular (< 60 linhas).
 *
 * Submódulos:
 * - services/alerts/proactiveDetection.js: Detecção determinística de orçamentos parados e gargalos em boxes
 * - services/alerts/proactiveDispatch.js: Cooldown, formatação e envio de mensagens via WhatsApp
 */

const {
  CONFIG_PADRAO_ALERTAS,
  obterConfigAlertas,
  detectarOrcamentosParados,
  detectarGargalosBox
} = require('./alerts/proactiveDetection');

const {
  verificarCooldown,
  registrarDisparo,
  limparHistoricoCooldown,
  formatarMensagemOrcamentoParado,
  formatarMensagemGargaloBox,
  avaliarAlertasProativos,
  dispararAlertasProativos
} = require('./alerts/proactiveDispatch');

module.exports = {
  CONFIG_PADRAO_ALERTAS,
  obterConfigAlertas,
  detectarOrcamentosParados,
  detectarGargalosBox,
  verificarCooldown,
  registrarDisparo,
  limparHistoricoCooldown,
  formatarMensagemOrcamentoParado,
  formatarMensagemGargaloBox,
  avaliarAlertasProativos,
  dispararAlertasProativos
};
