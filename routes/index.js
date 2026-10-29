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
  app.use(require('./coreLoop.routes'));
  app.use(require('./static.routes'));
}

module.exports = {
  mountRoutes
};
