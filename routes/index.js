const express = require('express');

function mountRoutes(app) {
  app.use(require('./health.routes'));
  app.use(require('./state.routes'));
  app.use(require('./backup.routes'));
  app.use(require('./whatsapp.routes'));
  app.use(require('./voice.routes'));
  app.use(require('./os.routes'));
  app.use(require('./preOs.routes'));
  app.use(require('./inspection.routes'));
  app.use(require('./quotation.routes'));
  app.use(require('./inventory.routes'));
  app.use(require('./team.routes'));
  app.use(require('./pricing.routes'));
  app.use(require('./crm.routes'));
  app.use(require('./config.routes'));
  app.use(require('./operation.routes'));
  app.use(require('./billing.routes'));
  app.use(require('./auth.routes'));
  app.use(require('./platform.routes'));
  app.use(require('./financial.routes'));
  app.use(require('./patio_produtividade_comissoes.routes'));
  app.use(require('./patio_qualidade_folha.routes'));
  app.use(require('./patio_boxes_gargalos.routes'));
  app.use(require('./financeiro_bordero_inadimplencia.routes'));
  app.use(require('./suprimentos_whatsapp_conciliacao.routes'));
  app.use(require('./aprovacao_externa_frotista.routes'));
  app.use(require('./financeiro_dre_rentabilidade.routes'));
  app.use(require('./crm_preventiva_preditiva.routes'));
  app.use(require('./fiscal_b2b_fechamento.routes'));
  app.use(require('./patio_prontuario_laudo.routes'));
  app.use(require('./torre_controle_executiva.routes'));
  app.use(require('./patio_terminal_box_despacho.routes'));
  app.use(require('./coreLoop.routes'));
  app.use(require('./static.routes'));
}

module.exports = {
  mountRoutes
};
