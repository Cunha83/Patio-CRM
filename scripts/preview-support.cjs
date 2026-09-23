'use strict';
// Ambiente de demonstração local descartável. Não importar no servidor do produto.
const express = require('express');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { SupportRepository } = require('../services/support/repository');
const { SupportAgent } = require('../services/support/agent');
const { createSupportRouter } = require('../services/support/router');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'patio-support-preview-'));
const repository = new SupportRepository({ filename: path.join(dir, 'preview.sqlite') });
const agent = new SupportAgent();
const app = express();
app.use((req, res, next) => {
  req.securityContext = req.path.startsWith('/api/platform/')
    ? { tenantId: '_platform_', actorId: 'preview-staff', actorType: 'user', role: 'platform_support' }
    : { tenantId: 'oficina-demonstracao', actorId: 'preview-client', actorType: 'user', role: 'tenant_admin' };
  next();
});
app.use('/api/support', createSupportRouter({ repository, agent }));
app.use('/api/platform/support-desk', createSupportRouter({ repository, agent, staff: true }));
app.get('/js/support-widget.js', (req, res) => res.sendFile('support-widget.js', { root: path.resolve(__dirname, '../js') }));
app.get('/', (req, res) => res.send('<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Demonstração local do suporte</title><body style="font:16px system-ui;background:#f1f5f3;padding:40px;color:#17383e"><h1>Suporte Pátio CRM</h1><p>Demonstração local · dados descartáveis · sem IA externa</p><p>Abra “Ajuda e suporte” para testar uma conversa.</p><a href="/api/platform/support-desk/" target="_blank">Abrir fila de demonstração</a><script src="/js/support-widget.js"></script></body></html>'));
const server = app.listen(3891, '127.0.0.1', () => console.log('Demonstração de suporte: http://127.0.0.1:3891 (somente local, dados temporários)'));
async function close() {
  server.close(); server.closeAllConnections();
  await repository.close();
  // Caminho retornado por mkdtemp, dedicado exclusivamente a esta demonstração.
  if (path.dirname(dir) === path.resolve(os.tmpdir()) && path.basename(dir).startsWith('patio-support-preview-')) fs.rmSync(dir, { recursive: true, force: true });
  process.exit(0);
}
process.on('SIGINT', close); process.on('SIGTERM', close);
