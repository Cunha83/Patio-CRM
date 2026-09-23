'use strict';

const express = require('express');
const rateLimit = require('express-rate-limit');
const path = require('path');
const { fail } = require('./repository');
const { messageText } = require('./privacy');
const { VERSION, articles } = require('./knowledge');

const assets = path.resolve(__dirname, '../../public/support');
const route = handler => (req, res, next) => Promise.resolve().then(() => handler(req, res)).catch(next);

function contextGuard(staff) {
  return (req, res, next) => {
    const ctx = req.securityContext;
    if (!ctx?.actorId || !ctx?.tenantId || ctx.actorType !== 'user') return res.status(401).json({ error: 'Entre com uma conta de usuário para acessar o suporte.' });
    if (staff) {
      if (ctx.tenantId !== '_platform_' || !['platform_admin', 'platform_support'].includes(ctx.role)) return res.status(403).json({ error: 'A fila é restrita à equipe de suporte da plataforma.' });
    } else if (ctx.tenantId === '_platform_' || ctx.supportSession || ctx.role === 'platform_support') {
      return res.status(403).json({ error: 'Use a fila da plataforma para atendimento de clientes.' });
    }
    // A proteção local também cobre a rota de plataforma, cujo middleware legado antecipa o retorno.
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      if (req.headers['sec-fetch-site'] === 'cross-site') return res.status(403).json({ error: 'Origem não permitida.' });
      if (req.headers.origin) {
        try { if (new URL(req.headers.origin).host !== req.headers.host) throw new Error(); }
        catch (_) { return res.status(403).json({ error: 'Origem não permitida.' }); }
      }
    }
    res.setHeader('Cache-Control', 'no-store');
    next();
  };
}

function createSupportRouter({ repository, agent, staff = false }) {
  const router = express.Router();
  router.use(contextGuard(staff));
  router.use(express.json({ limit: '12kb' }));
  const limiter = rateLimit({
    windowMs: 60000, limit: staff ? 60 : 20,
    keyGenerator: req => JSON.stringify([req.securityContext.tenantId, req.securityContext.actorId]),
    skip: req => ['GET', 'HEAD'].includes(req.method),
    standardHeaders: true, legacyHeaders: false,
    message: { error: 'Muitas solicitações. Aguarde um minuto e tente novamente.' },
  });
  router.use(limiter);
  router.get('/assets/support.css', (req, res) => res.sendFile('support.css', { root: assets }));
  if (staff) {
    router.get('/', (req, res) => res.sendFile('inbox.html', { root: assets }));
    router.get('/assets/inbox.js', (req, res) => res.sendFile('inbox.js', { root: assets }));
  }
  const owner = req => staff ? null : req.securityContext;
  router.get('/meta', (req, res) => res.json({
    aiAvailable: agent.aiAvailable, knowledgeVersion: VERSION,
    articles: articles.map(a => ({ id: a.id, title: a.title })),
    privacyNotice: 'As mensagens são armazenadas para atender sua solicitação e podem ser lidas pela equipe de suporte. Não envie dados sensíveis. Se autorizar a IA, o texto da dúvida será enviado ao Google Gemini para identificar o assunto; a remoção automática de dados pessoais não é completa.',
  }));
  router.get('/tickets', route(async (req, res) => res.json({ tickets: await repository.list(owner(req)) })));
  router.get('/tickets/:id', route(async (req, res) => res.json(await repository.read(owner(req), req.params.id))));
  if (!staff) {
    router.post('/tickets', route(async (req, res) => {
      if (req.body.aiConsent !== undefined && typeof req.body.aiConsent !== 'boolean') throw fail(400, 'Preferência de IA inválida.');
      res.status(201).json(await repository.create(owner(req), req.body.requestId, req.body.aiConsent === true && agent.aiAvailable));
    }));
    const busy = new Set();
    router.post('/tickets/:id/messages', route(async (req, res) => {
      const text = messageText(req.body.text);
      const ticket = await repository.read(owner(req), req.params.id);
      if (busy.has(ticket.id)) throw fail(409, 'Aguarde a resposta anterior antes de enviar outra mensagem.');
      busy.add(ticket.id);
      try {
        const replay = await repository.preflightMessage({ owner: owner(req), id: ticket.id, requestId: req.body.requestId, version: req.body.version, text, actorId: req.securityContext.actorId });
        if (replay) return res.json(replay);
        // Sem geração enquanto um humano atende; a mensagem ainda permanece no protocolo.
        const answer = await agent.answer(text, ticket.messages, { aiConsent: ticket.status === 'bot' && ticket.aiConsent });
        const result = await repository.change({ owner: owner(req), id: ticket.id, requestId: req.body.requestId, version: req.body.version, operation: 'message', text, actorId: req.securityContext.actorId, answer });
        res.json(result);
      } finally { busy.delete(ticket.id); }
    }));
  }
  for (const operation of staff ? ['claim', 'reply', 'resolve'] : ['handoff', 'resolve']) {
    router.post(`/tickets/:id/${operation}`, route(async (req, res) => {
      const text = operation === 'reply' ? messageText(req.body.text) : '';
      res.json(await repository.change({ owner: owner(req), id: req.params.id, requestId: req.body.requestId, version: req.body.version, operation, text, actorId: req.securityContext.actorId }));
    }));
  }
  router.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    const status = Number.isInteger(err.status) ? err.status : 503;
    if (status >= 500) console.warn(JSON.stringify({ component: 'support', event: 'request_failed', code: err.code || 'SUPPORT_UNAVAILABLE' }));
    res.status(status).json({ error: status >= 500 ? 'O suporte está temporariamente indisponível. Sua mensagem pode ser reenviada com segurança.' : err.message });
  });
  return router;
}

module.exports = { createSupportRouter };
