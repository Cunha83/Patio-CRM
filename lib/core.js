'use strict';
const crypto = require('crypto');

const { AsyncLocalStorage } = require('async_hooks');
const writeQueueContext = new AsyncLocalStorage();

function createWriteQueue() {
  let tail = Promise.resolve();
  return fn => {
    if (writeQueueContext.getStore()) {
      return fn();
    }
    const result = tail.then(() => writeQueueContext.run(true, fn));
    tail = result.catch(() => {});
    return result;
  };
}

function createAuth(options) {
  let apiKey, authUser, authPassword;
  if (typeof options === 'string') {
    apiKey = options;
    authUser = process.env.AUTH_USER || 'patio';
    authPassword = process.env.AUTH_PASSWORD || options;
  } else {
    options = options || {};
    apiKey = options.apiKey || process.env.API_KEY || '';
    authUser = options.authUser || process.env.AUTH_USER || '';
    authPassword = options.authPassword || process.env.AUTH_PASSWORD || '';
  }

  if (!apiKey || /^(your_api_key_here|sua_chave_aqui)$/.test(apiKey)) {
    throw new Error('Configure API_KEY no .env antes de iniciar o servidor.');
  }

  const digest = value => crypto.createHash('sha256').update(String(value ?? '')).digest();

  return function auth(req, res, next) {
    let isApiAuthed = false;
    let isUserAuthed = false;

    // 1. Autenticação de Máquina / Integração via Header x-api-key (Responsabilidade: Chave de API)
    const reqApiKey = req.headers['x-api-key'];
    if (typeof reqApiKey === 'string' && reqApiKey.length > 0) {
      try {
        isApiAuthed = crypto.timingSafeEqual(digest(reqApiKey), digest(apiKey));
      } catch (_) {}
    }

    // 2. Autenticação Interativa de Usuário via HTTP Basic Auth (Responsabilidade: Usuário e Senha)
    const basic = /^Basic\s+(.+)$/i.exec(req.headers.authorization || '');
    if (basic) {
      try {
        const credentials = Buffer.from(basic[1], 'base64').toString('utf8');
        const sepIdx = credentials.indexOf(':');
        if (sepIdx !== -1) {
          const u = credentials.slice(0, sepIdx);
          const p = credentials.slice(sepIdx + 1);
          if (u === authUser && crypto.timingSafeEqual(digest(p), digest(authPassword))) {
            isUserAuthed = true;
          }
        }
      } catch (_) {}
    }

    if (!isApiAuthed && !isUserAuthed) {
      res.setHeader('WWW-Authenticate', 'Basic realm="Patio CRM", charset="UTF-8"');
      return res.status(401).json({ error: 'Entre com o usuário patio e a senha de acesso do servidor.' });
    }
    // Credenciais do navegador não autorizam formulários ou scripts de outra origem.
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      if (req.headers['sec-fetch-site'] === 'cross-site') return res.status(403).json({ error: 'Origem não permitida.' });
      if (req.headers.origin) {
        try {
          if (new URL(req.headers.origin).host !== req.headers.host) throw new Error();
        } catch (_) { return res.status(403).json({ error: 'Origem não permitida.' }); }
      }
    }
    next();
  };
}

function normalizePhone(value) {
  let number = String(value || '').replace(/\D/g, '');
  if (number.length === 10 || number.length === 11) number = '55' + number;
  return /^55\d{10,11}$/.test(number) ? number : '';
}
function isAdminPhone(sender, admins) {
  const number = normalizePhone(sender);
  return !!number && admins.some(admin => normalizePhone(admin) === number);
}
function validateState(state, partial = false) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) return 'Estado deve ser um objeto.';
  const collections = ['os', 'veiculos', 'clientes', 'pecas', 'servicos', 'fornecedores', 'contas', 'movimentos', 'boxes', 'extrato', 'nfsRecebidas', 'compras', 'auditoria', 'preOS', 'intakeSessions', 'operationalEvents', 'operationalSnapshots', 'inspections', 'quotations', 'inventoryMovements', 'partRequirements', 'purchaseQuotes', 'purchaseOrders', 'suppliers', 'workers', 'laborEntries', 'mecanicos', 'pricingOverrides', 'fleets', 'frotas', 'maintenancePlans', 'planosManutencao', 'opportunities', 'oportunidades', 'appointments', 'agendamentos', 'afterSales', 'posVenda'];
  for (const key of collections) {
    if (state[key] !== undefined && (!Array.isArray(state[key]) || state[key].some(v => !v || typeof v !== 'object' || Array.isArray(v)))) return `Coleção inválida: ${key}.`;
  }
  if (!partial && !Array.isArray(state.os)) return 'Coleção os obrigatória.';
  if (state.versao !== undefined && (!Number.isSafeInteger(state.versao) || state.versao < 0)) return 'Versão inválida.';
  if (state.cfg !== undefined && (!state.cfg || typeof state.cfg !== 'object' || Array.isArray(state.cfg))) return 'Configuração inválida.';
  return null;
}
module.exports = { createWriteQueue, createAuth, normalizePhone, isAdminPhone, validateState };
