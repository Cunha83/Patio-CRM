'use strict';

const path = require('path');
const { SupportRepository } = require('./repository');
const { SupportAgent } = require('./agent');
const { createSupportRouter } = require('./router');

function mountSupport(app, { aiClient = null, repository = null, model = process.env.SUPPORT_AI_MODEL || '' } = {}) {
  if (process.env.SUPPORT_ENABLED === 'false') return null;
  // Tabelas próprias no banco configurado: entram no backup integral sem editar db.js.
  const store = repository || new SupportRepository({ filename: path.resolve(process.env.DB_PATH || path.join(__dirname, '../../patio.db')) });
  const agent = new SupportAgent({ client: aiClient, model });
  app.use('/api/support', createSupportRouter({ repository: store, agent }));
  app.use('/api/platform/support-desk', createSupportRouter({ repository: store, agent, staff: true }));
  return { repository: store, agent, close: () => store.close() };
}

module.exports = { mountSupport };
