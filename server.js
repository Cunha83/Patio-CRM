if (process.env.NODE_ENV !== 'test') require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const os = require('os');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { GoogleGenAI } = require('@google/genai');

const { initDB, all, run, get, closeDB, transaction } = require('./db');
const { correlationMiddleware } = require('./lib/security/logSanitizer');
const { metrics } = require('./lib/metrics');
const {
  authMiddleware,
  serverInitializationPromise,
  getOrLoadState,
  salvarEstado,
  enqueueWrite,
  setAiClient,
  setPasswordResetDeliveryAdapter,
  getPasswordResetDeliveryAdapter,
  setPatioSupport
} = require('./lib/serverContext');

const {
  gerarRelatorioExecutivo,
  gerarMensagensAdmin,
  gerarMensagensOperacao,
  gerarResumoCaixa,
  gerarResumoPatio,
  gerarImagemIndicadoresJPG,
  enviarRelatorioGrupo,
  enviarRelatorioAdministradores
} = require('./services/reportGenerationService');

const { resolverTenantPorChatId } = require('./services/whatsapp/whatsappState');
const { iniciarWhatsApp, finalizarProcessosFilhos } = require('./services/whatsapp/whatsappClient');
const { iniciarAgendadorRelatorioDiario, pararAgendadorRelatorioDiario } = require('./services/whatsapp/whatsappScheduler');
const { mountRoutes } = require('./routes');

// Inicializa cliente Gemini AI se configurado
let ai = null;
if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'sua_chave_aqui') {
  try {
    ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    console.log('[AI] Google Gen AI configurado com chave do .env.');
  } catch (err) {
    console.warn('[AI] Aviso ao instanciar Google Gen AI:', err.message);
  }
}
setAiClient(ai);

const app = express();

app.use(correlationMiddleware);

/* ── Headers de Segurança & CORS ─────────────────────────── */
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));

/* ── Rate Limiters Globais & Middlewares de Autenticação ─── */
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false
}));
app.use(authMiddleware);
app.use('/api', (req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });

// Um parser por requisição: os limites maiores precisam preceder o padrão.
const jsonDefault = express.json({ limit: '2mb', verify: (req, res, buf) => { req.rawBody = buf ? buf.toString() : ''; } });
const jsonMedia = express.json({ limit: '50mb' });
const jsonBackup = express.json({ limit: '100mb' });
app.use((req, res, next) => {
  const parser = req.path === '/api/backup/importar' ? jsonBackup :
    (['/api/estado', '/api/upload-nota', '/api/processar-audio-os', '/api/comando-voz', '/api/veiculos/conciliar'].includes(req.path) || req.path.includes('/anexar-foto')) ? jsonMedia : jsonDefault;
  parser(req, res, next);
});
app.use(express.urlencoded({ extended: false, limit: '2mb' }));

// Rate limiting global para API
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5000,
  skip: (req) => {
    const p = req.path || '';
    if (p === '/api/versao' || p === '/versao') return true;
    const ip = req.ip || (req.connection && req.connection.remoteAddress) || '';
    return ip.includes('127.0.0.1') || ip.includes('::1') || ip === 'localhost';
  },
  message: { error: 'Muitas requisições. Tente novamente em alguns minutos.' },
  standardHeaders: true,
  legacyHeaders: false
});
app.use('/api/', apiLimiter);

const patioSupport = require('./services/support').mountSupport(app, { aiClient: ai });
setPatioSupport(patioSupport);
app.use('/api/fiscal', require('./services/fiscal/router').createFiscalRouter());

/* ── Bloqueio de Arquivos Sensíveis & Proteção Path Traversal ── */
const BLOCKED_PATTERNS = [
  /^\./,
  /\.env$/i,
  /\.db$/i,
  /\.db-wal$/i,
  /\.db-shm$/i,
  /\.log$/i,
  /\.js$/i,
  /\.py$/i,
  /\.zip$/i,
  /\.bak$/i,
  /package\.json/i,
  /package-lock\.json/i,
  /node_modules/i
];

const ALLOWED_JS_DIRS = ['js', 'modules'];

app.use((req, res, next) => {
  let cleanPath;
  try {
    cleanPath = decodeURIComponent(req.path || '');
  } catch (e) {
    return res.status(400).send('400 Bad Request: URI inválida.');
  }

  const normalizedPath = path.normalize(cleanPath).replace(/\\/g, '/');
  if (normalizedPath.includes('..')) {
    return res.status(403).send('403 Forbidden: Acesso bloqueado (traversal detectado).');
  }

  const segments = normalizedPath.split('/').filter(Boolean);
  const isBlocked = segments.some((seg, idx) => {
    const blocked = BLOCKED_PATTERNS.some(pat => pat.test(seg));
    if (!blocked) return false;
    if (/\.js$/i.test(seg) && (segments[0] === 'js' || (idx > 0 && ALLOWED_JS_DIRS.includes(segments[idx - 1])))) return false;
    return true;
  });
  if (isBlocked) {
    return res.status(403).send('403 Forbidden: Acesso bloqueado a arquivos de sistema.');
  }
  next();
});

/* ── Montagem Centralizada de Todas as Rotas Modulares ─────── */
mountRoutes(app);

/* ── Inicialização do Banco de Dados e Servidor HTTP ───────── */
const PORT = parseInt(process.env.PORT, 10) || 3000;
const ROOT_DIR = __dirname;

initDB().then(async () => {
  const rows = await all("SELECT key, value FROM kv WHERE key LIKE 'tenant:%:state' OR key = 'state'");
  if (rows && rows.length > 0) {
    const toUpdate = [];
    for (const row of rows) {
      try {
        const parsed = JSON.parse(row.value);
        if (parsed && Array.isArray(parsed.os)) {
          const boxesDoEstado = Array.isArray(parsed.boxes) ? parsed.boxes.map(b => (typeof b === 'string' ? b : b?.id)).filter(Boolean) : [];
          const boxesValidos = new Set(['b1', 'b2', 'b3', 'b4', 'b5', 'b6', ...boxesDoEstado]);
          let corrigiu = false;
          parsed.os.forEach(o => {
            if (o.box && !boxesValidos.has(o.box)) {
              o.box = null;
              if (o.st !== 'finalizada') o.st = 'fila';
              corrigiu = true;
            }
          });
          if (!parsed.versao) {
            parsed.versao = Date.now();
            corrigiu = true;
          }
          if (corrigiu) {
            toUpdate.push({ key: row.key, json: JSON.stringify(parsed) });
          }
        }
      } catch (e) {
        throw new Error('Estado do SQLite inválido. Restaure um backup antes de iniciar: ' + e.message);
      }
    }
    if (toUpdate.length > 0) {
      await transaction(async () => {
        for (const item of toUpdate) {
          await run("UPDATE kv SET value = ? WHERE key = ?", [item.json, item.key]);
        }
      });
    }
  }

  const host = process.env.HOST || '127.0.0.1';
  app.listen(PORT, host, () => {
    const interfaces = os.networkInterfaces();
    const ips = [];
    for (const ifaceName in interfaces) {
      for (const iface of interfaces[ifaceName]) {
        if (iface.family === 'IPv4' && !iface.internal) {
          ips.push(iface.address);
        }
      }
    }

    console.log('\n======================================================');
    console.log(`🚀 [Pátio CRM] Servidor no ar!`);
    console.log(`💻 Acesso Local:         http://localhost:${PORT}/`);
    (process.env.HOST === '127.0.0.1' ? [] : ips).forEach(ip => {
      console.log(`📱 Acesso na Rede Local: http://${ip}:${PORT}/`);
    });
    console.log('======================================================\n');
  });

  if (process.env.DISABLE_INTEGRATIONS !== 'true') {
    if (process.env.DISABLE_WHATSAPP !== 'true') {
      iniciarWhatsApp();
    }
    iniciarAgendadorRelatorioDiario();
  }
}).catch(err => {
  console.error('[FATAL] Erro ao inicializar banco de dados SQLite:', err);
  process.exit(1);
});

/* ── Encerramento Gracioso ─────────────────────────────────── */
let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  pararAgendadorRelatorioDiario();
  await finalizarProcessosFilhos(signal);
  if (patioSupport) await patioSupport.close();
  await enqueueWrite(() => closeDB());
  process.exit(0);
}
process.on('SIGINT', () => shutdown('SIGINT').catch(err => { console.error(err); process.exit(1); }));
process.on('SIGTERM', () => shutdown('SIGTERM').catch(err => { console.error(err); process.exit(1); }));

/* ── Exportação Canônica com Preservação Estrita de Contrato ── */
if (typeof module !== 'undefined') {
  module.exports = {
    app,
    getOrLoadState,
    salvarEstado,
    gerarRelatorioExecutivo,
    gerarMensagensAdmin,
    gerarMensagensOperacao,
    gerarResumoCaixa,
    gerarResumoPatio,
    gerarImagemIndicadoresJPG,
    enviarRelatorioGrupo,
    enviarRelatorioAdministradores,
    resolverTenantPorChatId,
    metrics,
    setPasswordResetDeliveryAdapter
  };
}
