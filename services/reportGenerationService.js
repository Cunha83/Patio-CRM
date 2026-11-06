'use strict';

const financialEngine = require('./financialEngine');
const reportImageRender = require('./reports/reportImageRender');
const reportDailyExecutive = require('./reports/reportDailyExecutive');

module.exports = {
  // Re-exports de relatórios e resumos do financialEngine
  gerarRelatorioExecutivo: financialEngine.gerarRelatorioExecutivo,
  gerarMensagensAdmin: financialEngine.gerarMensagensAdmin,
  gerarMensagensOperacao: financialEngine.gerarMensagensOperacao,
  gerarResumoCaixa: financialEngine.gerarResumoCaixa,
  gerarResumoPatio: financialEngine.gerarResumoPatio,

  // Renderização e Cache de Imagem JPG
  gerarImagemIndicadoresJPG: reportImageRender.gerarImagemIndicadoresJPG,
  closeRenderBrowser: reportImageRender.closeRenderBrowser,

  // Disparo e Notificações WhatsApp
  enviarRelatorioGrupo: reportDailyExecutive.enviarRelatorioGrupo,
  enviarRelatorioAdministradores: reportDailyExecutive.enviarRelatorioAdministradores,
  notificarEventoCaixaWhatsApp: reportDailyExecutive.notificarEventoCaixaWhatsApp
};
