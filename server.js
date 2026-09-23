if (process.env.NODE_ENV !== 'test') require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { initDB, all, run, get, closeDB, transaction } = require('./db');
const { createWriteQueue, createAuth, isAdminPhone, validateState } = require('./lib/core');
const { IdentityRegistry } = require('./lib/auth/identity');
const { createAuthMiddleware } = require('./lib/auth/context');
const { metrics } = require('./lib/metrics');
const {
  PersistenceError,
  getState,
  getDefaultState,
  persistState,
  mutateState,
  isValidTenantId,
  storageKey,
  nextRevision: repoNextRevision,
  filterStateByRole
} = require('./lib/repository/stateRepository');
const userRepository = require('./lib/auth/userRepository');
const backupService = require('./services/backupService');
const erpIntegrationService = require('./services/erpIntegrationService');
const incidentResponseService = require('./services/incidentResponseService');
const { correlationMiddleware, logSecurityEvent } = require('./lib/security/logSanitizer');
const { ImageRenderCache } = require('./lib/image-cache');
const { UPLOADS_BASE } = require('./lib/file-storage');

// Lazy loading de módulos opcionais pesados para otimização de inicialização e memória
let _wweb = null;
function getWhatsAppModules() {
  if (!_wweb) {
    _wweb = require('whatsapp-web.js');
  }
  return _wweb;
}

let _puppeteer = null;
function getPuppeteer() {
  if (!_puppeteer) {
    _puppeteer = require('puppeteer');
  }
  return _puppeteer;
}
const qrcode = require('qrcode-terminal');
const QRCode = require('qrcode');
const { GoogleGenAI } = require('@google/genai');
const Tesseract = require('tesseract.js');
const voiceActionEngine = require('./services/voiceActionEngine');
const vehicleReconciliation = require('./services/vehicleReconciliation');
const financialEngine = require('./services/financialEngine');
const preOSEngine = require('./services/preOSEngine');
const technicalIntakeEngine = require('./services/technicalIntakeEngine');
const operationalIntelligenceEngine = require('./services/operationalIntelligenceEngine');
const operationalSummaryService = require('./services/operationalSummaryService');
const inspectionService = require('./services/inspectionService');
const quotationService = require('./services/quotationService');
const inventoryService = require('./services/inventoryService');
const procurementService = require('./services/procurementService');
const supplierService = require('./services/supplierService');
const laborTrackingService = require('./services/laborTrackingService');
const productivityService = require('./services/productivityService');
const costingService = require('./services/costingService');
const pricingEngine = require('./services/pricingEngine');
const customerTimelineService = require('./services/customerTimelineService');
const maintenancePlanService = require('./services/maintenancePlanService');
const afterSalesService = require('./services/afterSalesService');
const relationshipService = require('./services/relationshipService');
const appointmentService = require('./services/appointmentService');
const consultaClienteService = require('./services/consultaClienteService');
const { salvarUpload, resolverUrlImagem, removerUpload } = require('./lib/file-storage');
const subscriptionService = require('./services/subscriptionService');
const { BILLING_CONFIG, calculateSubscriptionPrice, lockTenantPrice, getTenantPriceLock } = require('./services/billing/billingConfig');
const { getPaymentAdapter } = require('./services/billing/paymentProviderAdapter');
const billingService = require('./services/billing/billingService');
const saasTelemetry = require('./services/billing/saasTelemetryService');
const platformAdmin = require('./services/billing/platformAdminService');
const lgpdService = require('./services/lgpdService');
const demoDataService = require('./services/demoDataService');
const { migrarSchemaEstado } = require('./lib/repository/migration');
const {
  gerarTokenAcao,
  consumirTokenAcao,
  reservarTokenAcao,
  liberarTokenAcao,
  validarTokenAcao,
  gerarTokenAprovacaoOrcamento,
  validarTokenAprovacaoOrcamento,
  consumirTokenAprovacaoOrcamento
} = require('./lib/tokens/securityToken');

// Mutex em memória para avaliações operacionais concorrentes por tenant
const runningEvaluations = new Set();
const runningMaintenanceEvals = new Set();
const runningAfterSalesEvals = new Set();
const runningRelationshipEvals = new Set();

async function avaliarManutencoes(tenantId) {
  if (!tenantId || runningMaintenanceEvals.has(tenantId)) return null;
  runningMaintenanceEvals.add(tenantId);
  try {
    const res = await mutateState(
      { tenantId, actorId: 'scheduler', role: 'system', permissions: ['*'] },
      async (draft) => {
        return maintenancePlanService.avaliarVencimentos({ tenantId, state: draft });
      },
      { enqueueWrite }
    );
    return res?.mutatorResult || null;
  } finally {
    runningMaintenanceEvals.delete(tenantId);
  }
}

async function avaliarPosVenda(tenantId) {
  if (!tenantId || runningAfterSalesEvals.has(tenantId)) return null;
  runningAfterSalesEvals.add(tenantId);
  try {
    const res = await mutateState(
      { tenantId, actorId: 'scheduler', role: 'system', permissions: ['*'] },
      async (draft) => {
        return afterSalesService.avaliarPosVenda({ tenantId, state: draft });
      },
      { enqueueWrite }
    );
    return res?.mutatorResult || null;
  } finally {
    runningAfterSalesEvals.delete(tenantId);
  }
}

async function avaliarRelacionamento(tenantId) {
  if (!tenantId || runningRelationshipEvals.has(tenantId)) return null;
  runningRelationshipEvals.add(tenantId);
  try {
    const res = await mutateState(
      { tenantId, actorId: 'scheduler', role: 'system', permissions: ['*'] },
      async (draft) => {
        return relationshipService.avaliarOportunidades({ tenantId, state: draft });
      },
      { enqueueWrite }
    );
    return res?.mutatorResult || null;
  } finally {
    runningRelationshipEvals.delete(tenantId);
  }
}

// Memória de curto prazo para placas enviadas recentemente por número de telefone
const ultimasPlacas = new Map();

// Limpeza periódica do mapa de placas (TTL 15 minutos)
setInterval(() => {
  const agora = Date.now();
  for (const [key, val] of ultimasPlacas) {
    if (agora - (val.timestamp || 0) > 15 * 60 * 1000) ultimasPlacas.delete(key);
  }
}, 5 * 60 * 1000);

// Mutex para serialização de escritas no banco
const enqueueWrite = createWriteQueue();
function nextRevision(targetState = null, tenantId = null) {
  const tid = tenantId || (targetState?._tenantId) || 'default';
  const currentVer = targetState?.versao || 0;
  return repoNextRevision(tid, currentVer);
}

// Multi-tenancy Cache & Key Resolver
const tenantStates = new Map();
const durableTenantStates = new Map();

function extractTenantId(req) {
  if (!req) return 'default';
  if (typeof req === 'string') {
    if (isValidTenantId(req)) return req.trim();
    if (req.startsWith('state:')) return req.slice(6);
    if (req.startsWith('tenant:')) {
      const m = /^tenant:([a-zA-Z0-9_-]+):state$/.exec(req);
      if (m) return m[1];
    }
    return 'default';
  }
  if (req.securityContext && req.securityContext.tenantId) {
    return req.securityContext.tenantId;
  }
  const tid = req.headers ? req.headers['x-tenant-id'] : null;
  if (tid && isValidTenantId(tid)) return tid.trim();
  return 'default';
}

function getTenantKey(req) {
  return extractTenantId(req);
}

async function getOrLoadState(req = null) {
  const tid = extractTenantId(req);
  let state = await getState(tid);
  if (!state) {
    state = getDefaultState(tid);
  }
  return state;
}

async function salvarEstado(req = null, stateToSave = null) {
  const tid = extractTenantId(req);
  const context = (req && req.securityContext) ? { ...req.securityContext, channel: 'internal' } : {
    tenantId: tid,
    actorId: 'system',
    role: 'service_admin',
    permissions: ['*'],
    channel: 'internal'
  };
  const targetState = stateToSave || (await getOrLoadState(req));
  const res = await persistState(context, targetState, { enqueueWrite });
  if (!res || res.ok !== true) {
    const err = new PersistenceError(res?.error || 'Falha ao persistir estado.', {
      status: res?.status || 500,
      conflict: Boolean(res?.conflict),
      versao: res?.versao,
      result: res
    });
    throw err;
  }
  return res;
}

async function persistTenantState(req = null, stateToSave = null) {
  return await salvarEstado(req, stateToSave);
}

async function persistCurrentState(req = null, stateToSave = null) {
  return await salvarEstado(req, stateToSave);
}

async function mutateTenantState(req = null, mutatorFn, options = {}) {
  const tid = extractTenantId(req);
  const context = (req && req.securityContext) ? { ...req.securityContext, channel: 'internal' } : {
    tenantId: tid,
    actorId: 'system',
    role: 'service_admin',
    permissions: ['*'],
    channel: 'internal'
  };
  return await mutateState(context, mutatorFn, { enqueueWrite, ...options });
}

// Gerador de IDs únicos (evita colisão por timestamp)
function gerarId(prefix) {
  return `${prefix}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
}

// Helper para sanitizar HTML (proteção contra XSS no Puppeteer)
function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Safe JSON parse — extrai bloco JSON e retorna null em vez de throw
function safeJsonParse(text) {
  if (!text) return null;
  try {
    let cleaned = text.replace(/```json\s*/gi, '').replace(/```/g, '').trim();
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    const matchArr = cleaned.match(/\[[\s\S]*\]/);
    if (matchArr) return JSON.parse(matchArr[0]);
    return JSON.parse(cleaned);
  } catch (e) {
    console.warn('[safeJsonParse] Falha ao parsear JSON:', e.message);
    return null;
  }
}

// Autenticação Desacoplada: Chave de API de Máquina vs Usuário/Senha Humano com Contexto Multi-Tenant
const API_KEY = process.env.API_KEY || '';
const AUTH_USER = process.env.AUTH_USER || '';
const AUTH_PASSWORD = process.env.AUTH_PASSWORD || '';

const isTestEnv = process.env.NODE_ENV !== 'production';
const identityRegistry = new IdentityRegistry({ allowWeakInTest: isTestEnv });

// Inicialização e hidratação assíncrona do banco SQLite
const serverInitializationPromise = (async () => {
  try {
    await initDB();
    await identityRegistry.loadFromDB();
    await billingService.loadBillingFromDB();
  } catch (err) {
    console.warn('[Server] Inicialização de dados persistentes:', err.message);
  }
})();

if (API_KEY) {
  identityRegistry.registerApiKey({
    key: API_KEY,
    tenantId: 'default',
    name: 'api_master',
    scopes: ['*']
  });
}

if (AUTH_USER && AUTH_PASSWORD) {
  if (process.env.NODE_ENV === 'production') {
    if (AUTH_PASSWORD === 'patio' || AUTH_PASSWORD.length < 12 || userRepository.INSECURE_PASSWORDS.has(AUTH_PASSWORD.toLowerCase())) {
      console.error('❌ [Segurança] Bloqueio de Inicialização: Credencial padrão ou fraca detectada em AUTH_PASSWORD.');
      console.error('Defina uma senha forte de produção ou execute: node scripts/provision-admin.js');
      process.exit(1);
    }
  }
  identityRegistry.registerUser({
    username: AUTH_USER,
    password: AUTH_PASSWORD,
    memberships: [
      { tenantId: 'default', role: 'tenant_admin', permissions: userRepository.ROLE_PERMISSIONS.tenant_admin }
    ]
  });
}

const authMiddleware = createAuthMiddleware(identityRegistry, { defaultSingleTenantId: 'default' });

function requirePermission(...permissions) {
  return (req, res, next) => {
    const perms = req.securityContext?.permissions || [];
    if (perms.includes('*') || permissions.some(p => perms.includes(p))) {
      return next();
    }
    const msg = permissions.length === 1
      ? `Acesso negado: requer permissão "${permissions[0]}".`
      : `Acesso negado: requer permissão (${permissions.join(' ou ')}).`;
    return res.status(403).json({ error: msg });
  };
}

const PORT = parseInt(process.env.PORT, 10) || 3000;
const ROOT_DIR = __dirname;

// Inicializa cliente Gemini AI com apiKey se configurada
let ai = null;
if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'sua_chave_aqui') {
  try {
    ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    console.log('[AI] Google Gen AI configurado com chave do .env.');
  } catch (err) {
    console.warn('[AI] Aviso ao instanciar Google Gen AI:', err.message);
  }
}

const app = express();

app.use(correlationMiddleware);

/* ── Headers de Segurança & CORS ─────────────────────────── */
app.use(helmet({
  contentSecurityPolicy: false, // CSP gerenciado separadamente para compatibilidade
  crossOriginEmbedderPolicy: false
}));

/* ── Liveness & Readiness Checks ─────────────────────────── */
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'patio-crm',
    version: require('./package.json').version || '1.0.0',
    uptimeSeconds: Math.floor(process.uptime()),
    memoryUsage: process.memoryUsage(),
    timestamp: new Date().toISOString()
  });
});

app.get('/ready', async (req, res) => {
  try {
    if (serverInitializationPromise) await serverInitializationPromise;

    // 1. Database alive probe obrigatório (falha = 503)
    const row = await get('SELECT 1 as alive');
    if (!row || row.alive !== 1) throw new Error('Falha no teste de vida do banco SQLite.');

    // 2. Storage / uploads write probe assíncrono em UPLOADS_BASE (falha = 503)
    if (!fs.existsSync(UPLOADS_BASE)) await fs.promises.mkdir(UPLOADS_BASE, { recursive: true });
    const probePath = path.join(UPLOADS_BASE, `.probe_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`);
    await fs.promises.writeFile(probePath, 'probe', 'utf8');
    await fs.promises.unlink(probePath);

    // 3. Write queue status
    const queueDepth = typeof enqueueWrite?.getQueueLength === 'function' ? enqueueWrite.getQueueLength() : 0;

    // 4. Scheduler status real
    const integrationsDisabled = process.env.DISABLE_INTEGRATIONS === 'true';
    const schedulerStatus = integrationsDisabled ? 'disabled' : 'active';

    // 5. WhatsApp & AI status
    const whatsappStatus = (integrationsDisabled || process.env.DISABLE_WHATSAPP === 'true')
      ? 'disabled'
      : (wppClient?.info ? 'connected' : (wppClient ? 'initializing' : 'disabled'));
    const aiStatus = (integrationsDisabled || !ai) ? 'disabled' : 'ready';

    // 6. Billing status
    const isProd = process.env.NODE_ENV === 'production';
    const asaasKey = process.env.ASAAS_API_KEY;
    let billingStatus = 'ready';
    if (integrationsDisabled || !asaasKey || asaasKey === 'sua_chave_asaas_aqui') {
      billingStatus = isProd ? 'unconfigured_warning' : 'disabled';
    }

    res.json({
      status: 'ready',
      service: 'patio-crm',
      checks: {
        database: 'ok',
        storage: 'ok',
        writeQueue: { pending: queueDepth, status: 'ok' },
        scheduler: schedulerStatus,
        whatsapp: whatsappStatus,
        ai: aiStatus,
        fiscal: 'homologacao_only',
        billing: billingStatus
      },
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    res.status(503).json({
      status: 'not_ready',
      error: err.message,
      timestamp: new Date().toISOString()
    });
  }
});

/* ── Rate Limiters Específicos ───────────────────────────── */
const limiterAprovacaoPublica = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  message: { success: false, error: 'Muitas requisições para a aprovação digital. Tente novamente em alguns minutos.' },
  standardHeaders: true,
  legacyHeaders: false
});

const limiterUploads = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  message: { success: false, error: 'Limite de uploads temporariamente excedido.' },
  standardHeaders: true,
  legacyHeaders: false
});

// Protege também HTML, imagens de QR e downloads com autenticação do navegador.
app.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: 100, skipSuccessfulRequests: true,
  standardHeaders: true, legacyHeaders: false }));
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

// Rate limiting global para API (com margem para sincronização em tempo real e operadores locais)
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 5000,
  skip: (req) => {
    // Bypass para polling ultra-leve de versão (usado por múltiplos monitores/tablets na oficina)
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

// Exceções: JS do frontend que DEVEM ser acessíveis
const ALLOWED_JS_DIRS = ['js'];

app.use((req, res, next) => {
  let cleanPath;
  try {
    cleanPath = decodeURIComponent(req.path || '');
  } catch (e) {
    return res.status(400).send('400 Bad Request: URI inválida.');
  }

  // Normalização estrita contra Windows path traversal (\ e %5c)
  const normalizedPath = path.normalize(cleanPath).replace(/\\/g, '/');
  if (normalizedPath.includes('..')) {
    return res.status(403).send('403 Forbidden: Acesso bloqueado (traversal detectado).');
  }

  const segments = normalizedPath.split('/').filter(Boolean);
  const isBlocked = segments.some((seg, idx) => {
    const blocked = BLOCKED_PATTERNS.some(pat => pat.test(seg));
    if (!blocked) return false;
    // Permitir arquivos .js dentro de pastas autorizadas (js/)
    if (/\.js$/i.test(seg) && idx > 0 && ALLOWED_JS_DIRS.includes(segments[idx - 1])) return false;
    return true;
  });
  if (isBlocked) {
    return res.status(403).send('403 Forbidden: Acesso bloqueado a arquivos de sistema.');
  }
  next();
});

/* ── Persistência e Multi-Tenancy Isolado por Tenant ─────── */

app.get('/api/estado', async (req, res) => {
  try {
    await enqueueWrite(async () => {});
    const state = await getOrLoadState(req);
    if (state && typeof state.versao !== 'number') {
      state.versao = 0;
    }
    const filteredState = filterStateByRole(state || {}, req.securityContext);
    if (filteredState?.cfg && typeof filteredState.cfg === 'object') {
      delete filteredState.cfg.apiKeyExterna;
      delete filteredState.cfg.apiKey;
      delete filteredState.cfg.asaasApiKey;
      delete filteredState.cfg.geminiApiKey;
      delete filteredState.cfg.token;
    }
    if (req.securityContext) {
      filteredState.user = {
        id: req.securityContext.actorId,
        username: req.securityContext.actorId,
        role: req.securityContext.role,
        permissions: req.securityContext.permissions
      };
      filteredState.perfil = req.securityContext.role;
      filteredState.ui = filteredState.ui || {};
      if (req.securityContext.role === 'mecanico') {
        filteredState.ui.perfilAtivo = 'mecanico';
      } else {
        filteredState.ui.perfilAtivo = 'todos';
      }
    }
    res.json(filteredState);
  } catch (error) {
    console.error('[API /api/estado GET] Erro:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/versao', async (req, res) => {
  await enqueueWrite(async () => {});
  const state = await getOrLoadState(req);
  res.json({
    versao: state?.versao || 1,
    totalOS: (state?.os || []).length,
    totalVei: (state?.veiculos || []).length
  });
});

app.get('/api/backup/download', requirePermission('backup:manage'), async (req, res) => {
  try {
    await enqueueWrite(async () => {});
    const state = await getOrLoadState(req);
    const dHoje = new Date().toISOString().slice(0, 10);
    const nomeArquivo = `backup_patio_crm_${dHoje}_${Date.now()}.json`;
    res.setHeader('Content-Disposition', `attachment; filename="${nomeArquivo}"`);
    res.setHeader('Content-Type', 'application/json');
    res.send(JSON.stringify(state || {}, null, 2));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Backups físicos contêm TODAS as oficinas e segredos: nunca são operações de administrador de tenant.
app.use(['/api/backup/wal','/api/backup/listar','/api/backup/restaurar'], (req,res,next) => {
  const c=req.securityContext;
  if(c?.actorType!=='user' || c.supportSession || c.tenantId!=='_platform_' || !c.permissions?.includes('backup:global')) return res.status(403).json({error:'Backup físico restrito à operação de infraestrutura.'});
  next();
});
app.post('/api/backup/wal', requirePermission('backup:manage'), async (req, res) => {
  try {
    const tenantId = req.securityContext?.tenantId || 'default';
    const actorId = req.securityContext?.actorId || 'operator';
    const { includeUploads = true } = req.body || {};
    const result = await backupService.executarBackupWal({ tenantId, actorId, includeUploads });
    res.json(result);
  } catch (err) {
    console.error('[API /api/backup/wal POST] Erro:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/backup/listar', requirePermission('backup:manage'), async (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 20;
    const backups = await backupService.listarBackups(limit);
    res.json({ success: true, backups });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/backup/restaurar', requirePermission('backup:manage'), async (req, res) => {
  try {
    const { backupFilepath, verifyOnly = false } = req.body || {};
    if (!backupFilepath) return res.status(400).json({ error: 'backupFilepath é obrigatório.' });
    // P0-3: Validar que backupFilepath resolve para um arquivo real estritamente contido no diretório de backups
    const rawBackupDir = process.env.BACKUP_DIR || path.join(ROOT_DIR, 'backups');
    if (!fs.existsSync(rawBackupDir)) {
      fs.mkdirSync(rawBackupDir, { recursive: true });
    }
    const realBackupDir = fs.realpathSync(path.resolve(rawBackupDir));
    const resolvedPath = path.resolve(realBackupDir, backupFilepath);

    if (!fs.existsSync(resolvedPath)) {
      return res.status(400).json({ error: 'Arquivo de backup não encontrado ou caminho inválido.' });
    }

    const realTargetFile = fs.realpathSync(resolvedPath);
    const relative = path.relative(realBackupDir, realTargetFile);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
      return res.status(400).json({ error: 'Caminho de backup inválido: fora do diretório permitido.' });
    }

    const result = await backupService.restaurarBackup({ backupFilepath: realTargetFile, verifyOnly });
    res.json(result);
  } catch (err) {
    console.error('[API /api/backup/restaurar POST] Erro:', err);
    res.status(500).json({ error: err.message });
  }
});

/* ── Telemetria e Coleta de Métricas ──────────────────────── */
app.get(['/api/metricas', '/api/metrics'], requirePermission('admin:settings'), async (req, res) => {
  try {
    const isGlobalAdmin = req.securityContext?.role === 'admin' && (req.securityContext?.permissions?.includes('*') || false);
    const tenantFilter = req.query.tenantId || (isGlobalAdmin ? null : req.securityContext?.tenantId);
    const detail = req.query.detail === 'true';
    const data = metrics.getMetrics({ tenantId: tenantFilter, detail });
    res.json({
      success: true,
      ...data
    });
  } catch (err) {
    console.error('[API /api/metricas GET] Erro:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/metricas/reset', requirePermission('admin:settings'), async (req, res) => {
  try {
    metrics.reset();
    res.json({ success: true, message: 'Métricas reinicializadas com sucesso.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/estado', async (req, res) => {
  try {
    if (!req.securityContext) {
      return res.status(401).json({ error: 'Contexto de segurança ausente. Autenticação obrigatória.' });
    }
    const context = { ...req.securityContext, channel: 'http' };
    const result = await persistState(context, req.body, { enqueueWrite, authorizeReplacement: true });
    if (!result.ok) {
      return res.status(result.status || 400).json(result);
    }
    const filteredState = filterStateByRole(result.state, req.securityContext);
    if (req.securityContext) {
      filteredState.user = {
        id: req.securityContext.actorId,
        username: req.securityContext.actorId,
        role: req.securityContext.role,
        permissions: req.securityContext.permissions
      };
      filteredState.perfil = req.securityContext.role;
      filteredState.ui = filteredState.ui || {};
      if (req.securityContext.role === 'mecanico') {
        filteredState.ui.perfilAtivo = 'mecanico';
      } else {
        filteredState.ui.perfilAtivo = 'todos';
      }
    }
    return res.status(200).json({ success: true, versao: result.versao, state: filteredState });
  } catch (error) {
    console.error('[API /api/estado POST]', error.message);
    res.status(500).json({ error: 'Não foi possível gravar o estado. Preserve o rascunho e tente novamente.' });
  }
});

app.post('/api/backup/importar', requirePermission('backup:manage'), async (req, res) => {
  try {
    const { dados, modo = 'mesclar', versao } = req.body || {};
    if (!['mesclar', 'substituir'].includes(modo)) return res.status(400).json({ error: 'Modo inválido.' });
    const invalid = validateState(dados, modo !== 'substituir');
    if (invalid) return res.status(400).json({ error: invalid });
    if (!dados || typeof dados !== 'object') {
      return res.status(400).json({ success: false, error: 'Objeto de dados inválido para importação.' });
    }

    const stats = {
      clientes: { inseridos: 0, atualizados: 0 },
      veiculos: { inseridos: 0, atualizados: 0 },
      pecas: { inseridos: 0, atualizados: 0 },
      servicos: { inseridos: 0, atualizados: 0 },
      fornecedores: { inseridos: 0, atualizados: 0 },
      os: { inseridos: 0, atualizados: 0 },
      contas: { inseridos: 0, atualizados: 0 }
    };

    let draft = null;

    await enqueueWrite(async () => {
      const currentState = await getOrLoadState(req);
      if (versao !== (currentState?.versao || 0)) {
        const error = new Error('O estado mudou. Atualize os dados antes de importar.');
        error.status = 409;
        throw error;
      }
      draft = JSON.parse(JSON.stringify(currentState || {}));
      if (modo === 'substituir') {
        const cfgAtual = draft.cfg || {};
        const incomingCfg = dados.cfg || {};
        dados.cfg = {
          ...cfgAtual,
          ...incomingCfg,
          grupoAdminId: incomingCfg.grupoAdminId || cfgAtual.grupoAdminId,
          grupoOperacaoId: incomingCfg.grupoOperacaoId || cfgAtual.grupoOperacaoId,
          adminFones: incomingCfg.adminFones || cfgAtual.adminFones
        };
        dados.versao = versao;
        draft = dados;

        stats.clientes.inseridos = (draft.clientes || []).length;
        stats.veiculos.inseridos = (draft.veiculos || []).length;
        stats.pecas.inseridos = (draft.pecas || []).length;
        stats.servicos.inseridos = (draft.servicos || []).length;
        stats.fornecedores.inseridos = (draft.fornecedores || []).length;
        stats.os.inseridos = (draft.os || []).length;
        stats.contas.inseridos = (draft.contas || []).length;
      } else {
        if (!draft.clientes) draft.clientes = [];
        if (!draft.veiculos) draft.veiculos = [];
        if (!draft.pecas) draft.pecas = [];
        if (!draft.servicos) draft.servicos = [];
        if (!draft.fornecedores) draft.fornecedores = [];
        if (!draft.os) draft.os = [];
        if (!draft.contas) draft.contas = [];

        // 1. Clientes
        if (Array.isArray(dados.clientes)) {
          for (const inc of dados.clientes) {
            const docLimpo = (inc.doc || '').replace(/\D/g, '');
            const nomeNorm = (inc.nome || '').trim().toLowerCase();
            const exist = draft.clientes.find(c =>
              (docLimpo && (c.doc || '').replace(/\D/g, '') === docLimpo) ||
              (nomeNorm && (c.nome || '').trim().toLowerCase() === nomeNorm)
            );
            if (exist) {
              Object.assign(exist, inc, { id: exist.id });
              stats.clientes.atualizados++;
            } else {
              inc.id = inc.id || gerarId('c');
              draft.clientes.push(inc);
              stats.clientes.inseridos++;
            }
          }
        }

        // 2. Veículos
        if (Array.isArray(dados.veiculos)) {
          for (const inc of dados.veiculos) {
            const placaNorm = (inc.placa || '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
            const exist = draft.veiculos.find(v => (v.placa || '').replace(/[^A-Z0-9]/gi, '').toUpperCase() === placaNorm);
            if (exist) {
              Object.assign(exist, inc, { id: exist.id });
              stats.veiculos.atualizados++;
            } else {
              inc.id = inc.id || gerarId('v');
              inc.placa = placaNorm || inc.placa;
              draft.veiculos.push(inc);
              stats.veiculos.inseridos++;
            }
          }
        }

        // 3. Peças / Estoque
        if (Array.isArray(dados.pecas)) {
          for (const inc of dados.pecas) {
            const codNorm = (inc.cod || '').trim().toLowerCase();
            const nomeNorm = (inc.nome || '').trim().toLowerCase();
            const exist = draft.pecas.find(p =>
              (codNorm && (p.cod || '').trim().toLowerCase() === codNorm) ||
              (nomeNorm && (p.nome || '').trim().toLowerCase() === nomeNorm)
            );
            if (exist) {
              exist.qtd = (exist.qtd || 0) + (Number(inc.qtd) || 0);
              if (inc.custo) exist.custo = Number(inc.custo);
              if (inc.venda) exist.venda = Number(inc.venda);
              if (inc.loc && !exist.loc) exist.loc = inc.loc;
              if (inc.forn && !exist.forn) exist.forn = inc.forn;
              stats.pecas.atualizados++;
            } else {
              inc.id = inc.id || gerarId('p');
              draft.pecas.push(inc);
              stats.pecas.inseridos++;
            }
          }
        }

        // 4. Serviços
        if (Array.isArray(dados.servicos)) {
          for (const inc of dados.servicos) {
            const nomeNorm = (inc.nome || '').trim().toLowerCase();
            const exist = draft.servicos.find(s => (s.nome || '').trim().toLowerCase() === nomeNorm);
            if (exist) {
              if (inc.valor) exist.valor = Number(inc.valor);
              if (inc.horas) exist.horas = Number(inc.horas);
              stats.servicos.atualizados++;
            } else {
              inc.id = inc.id || gerarId('s');
              draft.servicos.push(inc);
              stats.servicos.inseridos++;
            }
          }
        }

        // 5. Fornecedores
        if (Array.isArray(dados.fornecedores)) {
          for (const inc of dados.fornecedores) {
            const docLimpo = (inc.doc || '').replace(/\D/g, '');
            const nomeNorm = (inc.nome || '').trim().toLowerCase();
            const exist = draft.fornecedores.find(f =>
              (docLimpo && (f.doc || '').replace(/\D/g, '') === docLimpo) ||
              (nomeNorm && (f.nome || '').trim().toLowerCase() === nomeNorm)
            );
            if (exist) {
              Object.assign(exist, inc, { id: exist.id });
              stats.fornecedores.atualizados++;
            } else {
              inc.id = inc.id || gerarId('f');
              draft.fornecedores.push(inc);
              stats.fornecedores.inseridos++;
            }
          }
        }

        // 6. Ordens de Serviço (OS)
        if (Array.isArray(dados.os)) {
          for (const inc of dados.os) {
            const numStr = String(inc.num || '');
            const exist = draft.os.find(o => String(o.num) === numStr);
            if (exist) {
              stats.os.atualizados++;
            } else {
              inc.id = inc.id || gerarId('os');
              draft.os.push(inc);
              stats.os.inseridos++;
            }
          }
        }

        // 7. Contas
        if (Array.isArray(dados.contas)) {
          for (const inc of dados.contas) {
            inc.id = inc.id || gerarId('ct');
            draft.contas.push(inc);
            stats.contas.inseridos++;
          }
        }

      }

      const saveRes = await salvarEstado(req, draft);
      if (saveRes && !saveRes.ok) {
        const error = new Error(saveRes.error || 'Erro ao persistir importação.');
        error.status = saveRes.status || 500;
        throw error;
      }
      draft.versao = saveRes.versao;
    });

    console.log(`[Backup Import] Concluído com sucesso (Modo: ${modo}). Estatísticas:`, JSON.stringify(stats));
    res.json({ success: true, modo, stats, versao: draft.versao });
  } catch (error) {
    console.error('[API /api/backup/importar] Erro:', error);
    res.status(error.status || 500).json({ success: false, error: error.message });
  }
});

/* ── Status e Controle do WhatsApp ───────────────────────── */
let wppStatus = {
  status: 'inicializando',
  qr: null,
  qrImage: null,
  user: null,
  ultimoUpdate: new Date().toISOString()
};
let wppClient = null;
let ultimoDiaEnvioRelatorio = '';

function formatarMoeda(val) {
  return (Number(val) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/* ── Geradores Canônicos de Relatórios & Mensagens (Single Source of Truth: financialEngine) ── */
const {
  gerarRelatorioExecutivo,
  gerarMensagensAdmin,
  gerarMensagensOperacao,
  gerarResumoCaixa,
  gerarResumoPatio
} = financialEngine;

/* ── Gerador de Infográfico Visual em JPG (Puppeteer 1080x1350) ────── */
let browserRenderCache = null;
async function getRenderBrowser() {
  if (browserRenderCache && browserRenderCache.isConnected()) return browserRenderCache;
  const pptr = getPuppeteer();
  try {
    browserRenderCache = await pptr.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
    });
    return browserRenderCache;
  } catch (e) {
    browserRenderCache = await pptr.launch({ headless: true, args: ['--no-sandbox'] });
    return browserRenderCache;
  }
}

const imageRenderCache = new ImageRenderCache({ maxEntries: 50 });

async function gerarImagemIndicadoresJPG(state, tenantKey = 'default', options = {}) {
  state = state || {};
  const stVer = state.versao || 0;

  const cached = imageRenderCache.get(tenantKey, stVer, options.dataRef || '', options);
  if (cached) {
    return cached;
  }

  const agoraSP = financialEngine.obterAgoraSP(options.dataRef);
  const dHoje = agoraSP.dataISO;
  const dataFormatada = agoraSP.dataBR;
  const horaFormatada = agoraSP.horaBR;

  const cfg = state.cfg || {};
  const fin = financialEngine.calcularKPIsFinanceiros(state, { ...options, dataRef: dHoje, filtro: '30d' });
  const series = financialEngine.gerarSeriesGraficos(state, { ...options, dataRef: dHoje, filtro: '15d' });
  const op = financialEngine.calcularResumoOperacional(state, { ...options, dataRef: dHoje });

  const svgFluxo = financialEngine.gerarSVGBarrasFluxo(series.grafico1Fluxo, 990, 200);
  const svgProjecao = financialEngine.gerarSVGProjecao(series.grafico4Projecao, 990, 180);

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
  body {
    background: #070b14;
    color: #f8fafc;
    width: 1080px;
    height: 1350px;
    overflow: hidden;
    padding: 38px 44px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
  }

  /* Cabeçalho */
  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 2px solid #1e293b;
    padding-bottom: 18px;
  }
  .brand-title {
    font-size: 34px;
    font-weight: 900;
    color: #38bdf8;
    letter-spacing: -0.8px;
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .brand-sub {
    font-size: 13px;
    color: #94a3b8;
    font-weight: 600;
    letter-spacing: 0.5px;
    margin-top: 4px;
  }
  .header-badge {
    background: #111827;
    border: 1px solid #334155;
    padding: 8px 16px;
    border-radius: 12px;
    text-align: right;
  }
  .header-empresa {
    font-size: 14px;
    font-weight: 800;
    color: #f1f5f9;
  }
  .header-data {
    font-size: 12px;
    color: #38bdf8;
    font-weight: 600;
    margin-top: 2px;
  }

  /* Cartão Hero Saldo */
  .hero-card {
    background: linear-gradient(135deg, #0f172a 0%, #131c2e 100%);
    border: 1.5px solid #2563eb;
    border-radius: 16px;
    padding: 22px 28px;
    box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5);
    display: flex;
    justify-content: space-between;
    align-items: center;
    position: relative;
    overflow: hidden;
  }
  .hero-card::before {
    content: '';
    position: absolute;
    top: 0; left: 0; right: 0; height: 4px;
    background: linear-gradient(90deg, #10b981, #38bdf8, #2563eb);
  }
  .hero-label {
    font-size: 13px;
    font-weight: 800;
    text-transform: uppercase;
    color: #94a3b8;
    letter-spacing: 0.8px;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .hero-val {
    font-size: 46px;
    font-weight: 900;
    color: ${fin.saldoConsolidado >= 0 ? '#10b981' : '#ef4444'};
    letter-spacing: -1px;
    line-height: 1.1;
    margin-top: 6px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace;
  }
  .hero-desc {
    font-size: 12.5px;
    color: #64748b;
    margin-top: 4px;
  }
  .hero-pill {
    background: rgba(16, 185, 129, 0.12);
    border: 1px solid #10b981;
    color: #34d399;
    padding: 8px 16px;
    border-radius: 20px;
    font-size: 13px;
    font-weight: 700;
    text-align: center;
  }

  /* Grade de KPIs Secundários */
  .kpis-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 14px;
  }
  .card-kpi {
    background: #101726;
    border: 1px solid #1e293b;
    border-radius: 12px;
    padding: 14px 16px;
    position: relative;
  }
  .card-kpi::before {
    content: '';
    position: absolute;
    top: 0; left: 0; right: 0; height: 3px;
    background: var(--cor, #38bdf8);
    border-radius: 12px 12px 0 0;
  }
  .kpi-rotulo {
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    color: #94a3b8;
    letter-spacing: 0.5px;
  }
  .kpi-valor {
    font-size: 22px;
    font-weight: 800;
    color: #ffffff;
    margin-top: 6px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace;
  }
  .kpi-detalhe {
    font-size: 11px;
    color: #64748b;
    margin-top: 4px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* Cartões dos Gráficos */
  .chart-card {
    background: #101726;
    border: 1px solid #1e293b;
    border-radius: 14px;
    padding: 16px 20px;
  }
  .chart-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
    padding-bottom: 8px;
    border-bottom: 1px solid #1e293b;
  }
  .chart-title {
    font-size: 14px;
    font-weight: 800;
    color: #f1f5f9;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .chart-legend {
    display: flex;
    align-items: center;
    gap: 14px;
    font-size: 11.5px;
    color: #cbd5e1;
    font-weight: 600;
  }
  .dot {
    display: inline-block;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    margin-right: 4px;
  }

  /* Radar Operacional do Pátio */
  .radar-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 12px;
  }
  .radar-box {
    background: #0d131f;
    border: 1px solid #1e293b;
    border-radius: 10px;
    padding: 10px 14px;
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .radar-icon {
    font-size: 20px;
  }
  .radar-info-title {
    font-size: 10.5px;
    color: #94a3b8;
    font-weight: 700;
    text-transform: uppercase;
  }
  .radar-info-val {
    font-size: 16px;
    font-weight: 800;
    color: #f8fafc;
  }

  /* Rodapé */
  .footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-top: 1px solid #1e293b;
    padding-top: 14px;
    font-size: 11.5px;
    color: #64748b;
  }
</style>
</head>
<body>
  <!-- Cabeçalho -->
  <div class="header">
    <div>
      <div class="brand-title">🚛 PÁTIO CRM</div>
      <div class="brand-sub">PAINEL EXECUTIVO DE INTELIGÊNCIA FINANCEIRA</div>
    </div>
    <div class="header-badge">
      <div class="header-empresa">🏢 ${escapeHtml(cfg.empresa) || 'Pátio Diesel & Hidráulica'}</div>
      <div class="header-data">📅 ${dataFormatada} às ${horaFormatada}</div>
    </div>
  </div>

  <!-- Cartão Hero Saldo Consolidado -->
  <div class="hero-card">
    <div>
      <div class="hero-label">💵 Saldo Consolidado em Caixa</div>
      <div class="hero-val">${formatarMoeda(fin.saldoConsolidado)}</div>
      <div class="hero-desc">Disponibilidade financeira imediata | Saldo Inicial: ${formatarMoeda(fin.saldoInicial)}</div>
    </div>
    <div class="hero-pill">
      <div>● Caixa Conciliado</div>
      <div style="font-size:11px;font-weight:400;margin-top:2px">${fin.qtdMovimentosPeriodo} lançamentos em 30d</div>
    </div>
  </div>

  <!-- Grade de 4 KPIs Financeiros -->
  <div class="kpis-grid">
    <div class="card-kpi" style="--cor:#10b981">
      <div class="kpi-rotulo">🟢 A Receber</div>
      <div class="kpi-valor" style="color:#34d399">${formatarMoeda(fin.totalReceberAberto)}</div>
      <div class="kpi-detalhe">${fin.qtdReceberAberto} títulos (${formatarMoeda(fin.totalRecVencidos)} vencidos)</div>
    </div>
    <div class="card-kpi" style="--cor:#ef4444">
      <div class="kpi-rotulo">🔴 A Pagar</div>
      <div class="kpi-valor" style="color:#f87171">${formatarMoeda(fin.totalPagarAberto)}</div>
      <div class="kpi-detalhe">${fin.qtdPagarAberto} contas (${formatarMoeda(fin.totalPagVencidos)} vencidas)</div>
    </div>
    <div class="card-kpi" style="--cor:${fin.resultadoLiquidoPeriodo >= 0 ? '#10b981' : '#f59e0b'}">
      <div class="kpi-rotulo">⚖️ Resultado (30d)</div>
      <div class="kpi-valor" style="color:${fin.resultadoLiquidoPeriodo >= 0 ? '#10b981' : '#f59e0b'}">${fin.resultadoLiquidoPeriodo >= 0 ? '+' : ''}${formatarMoeda(fin.resultadoLiquidoPeriodo)}</div>
      <div class="kpi-detalhe">+${formatarMoeda(fin.entradasPeriodo)} ent | -${formatarMoeda(fin.saidasPeriodo)} saí</div>
    </div>
    <div class="card-kpi" style="--cor:#38bdf8">
      <div class="kpi-rotulo">📈 Projeção (30d)</div>
      <div class="kpi-valor" style="color:#38bdf8">${formatarMoeda(fin.saldoPrevisto30d)}</div>
      <div class="kpi-detalhe">Caixa + A Receber − A Pagar</div>
    </div>
  </div>

  <!-- Gráfico 1: Fluxo de Caixa (Entradas x Saídas) -->
  <div class="chart-card">
    <div class="chart-header">
      <div class="chart-title">📊 FLUXO DE CAIXA RECENTE (ENTRADAS X SAÍDAS)</div>
      <div class="chart-legend">
        <span><span class="dot" style="background:#10b981"></span> Entradas (+${formatarMoeda(series.grafico1Fluxo.totalEntradas)})</span>
        <span><span class="dot" style="background:#ef4444"></span> Saídas (-${formatarMoeda(series.grafico1Fluxo.totalSaidas)})</span>
      </div>
    </div>
    <div>${svgFluxo}</div>
  </div>

  <!-- Gráfico 2: Projeção de Liquidez Futura -->
  <div class="chart-card">
    <div class="chart-header">
      <div class="chart-title">📈 PROJEÇÃO DE LIQUIDEZ E SALDO (PRÓXIMOS 30 DIAS)</div>
      <div class="chart-legend">
        <span><span class="dot" style="background:#38bdf8"></span> Curva Projetada por Vencimentos</span>
      </div>
    </div>
    <div>${svgProjecao}</div>
  </div>

  <!-- Radar Operacional da Oficina -->
  <div class="radar-grid">
    <div class="radar-box">
      <span class="radar-icon">🚚</span>
      <div>
        <div class="radar-info-title">Pátio Total</div>
        <div class="radar-info-val">${op.totalOSAtivas} caminhões</div>
      </div>
    </div>
    <div class="radar-box">
      <span class="radar-icon">🔧</span>
      <div>
        <div class="radar-info-title">Boxes Ocupados</div>
        <div class="radar-info-val">${op.boxesOcupados} de ${op.totalBoxes}</div>
      </div>
    </div>
    <div class="radar-box">
      <span class="radar-icon">⏳</span>
      <div>
        <div class="radar-info-title">Fila de Triagem</div>
        <div class="radar-info-val">${op.naFila} na espera</div>
      </div>
    </div>
    <div class="radar-box">
      <span class="radar-icon">⚠️</span>
      <div>
        <div class="radar-info-title">Inadimplência</div>
        <div class="radar-info-val" style="color:${fin.taxaInadimplencia > 0 ? '#f59e0b' : '#10b981'}">${fin.taxaInadimplencia}%</div>
      </div>
    </div>
  </div>

  <!-- Rodapé -->
  <div class="footer">
    <div>Pátio CRM • Módulo de Gestão Especializado para Oficinas Pesadas & Diesel</div>
    <div>Relatório Gerencial Confidencial • Emitido via Servidor WhatsApp Web</div>
  </div>
</body>
</html>`;

  const browser = await getRenderBrowser();
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: 1080, height: 1350, deviceScaleFactor: 1.5 });
    await page.setContent(html, { waitUntil: 'load' });
    const buffer = await page.screenshot({ type: 'jpeg', quality: 90 });
    imageRenderCache.set(tenantKey, stVer, options.dataRef || '', options, buffer);
    return buffer;
  } finally {
    await page.close();
  }
}

async function resolverTenantPorChatId(chatId, senderPhone = '') {
  try {
    const rows = await all("SELECT key, value FROM kv WHERE key LIKE 'tenant:%:state' OR key = 'state'");
    for (const r of (rows || [])) {
      try {
        const parsed = JSON.parse(r.value);
        if (parsed && parsed.cfg) {
          const tenantId = extractTenantId(r.key);
          if (parsed.cfg.grupoAdminId === chatId || parsed.cfg.grupoOperacaoId === chatId) {
            return { tenantKey: tenantId, state: parsed };
          }
          if (senderPhone && Array.isArray(parsed.cfg.adminFones)) {
            const match = parsed.cfg.adminFones.some(f => {
              const clean = String(f).replace(/\D/g, '');
              return clean && (clean.endsWith(senderPhone) || senderPhone.endsWith(clean));
            });
            if (match) {
              return { tenantKey: tenantId, state: parsed };
            }
          }
        }
      } catch (_) {}
    }
  } catch (err) {
    console.warn('[resolverTenantPorChatId] Erro ao consultar kv:', err.message);
  }

  const defState = await getOrLoadState('default');
  return { tenantKey: 'default', state: defState };
}

async function fecharModaisWhatsAppWeb() {
  if (!wppClient || !wppClient.pupPage) return;
  try {
    for (let i = 0; i < 3; i++) {
      await wppClient.pupPage.keyboard.press('Escape').catch(() => {});
      await new Promise(r => setTimeout(r, 200));
      const closed = await wppClient.pupPage.evaluate(() => {
        let clicked = false;
        const all = Array.from(document.querySelectorAll('button, div[role="button"], span[data-icon="x"], span[data-icon="x-alt"]'));
        for (const el of all) {
          const aria = (el.getAttribute('aria-label') || '').toLowerCase();
          const text = (el.innerText || el.textContent || '').toLowerCase().trim();
          const title = (el.getAttribute('title') || '').toLowerCase();
          if (aria.includes('fechar') || aria.includes('close') ||
              title.includes('fechar') || title.includes('close') ||
              text === 'ok' || text === 'entendi' || text === 'fechar' || text === 'continuar' || text.includes('continuar')) {
            try { el.click(); clicked = true; } catch (_) {}
            break;
          }
        }
        return clicked;
      }).catch(() => false);
      if (!closed) break;
      await new Promise(r => setTimeout(r, 300));
    }
  } catch (err) {
    console.warn('[WhatsApp] Aviso ao fechar modal:', err.message);
  }
}

async function registrarIdMensagem(sent, targetChatId, messageIds) {
  let id = null;
  if (sent) {
    if (typeof sent === 'string') id = sent;
    else if (sent.id) {
      if (typeof sent.id === 'string') id = sent.id;
      else if (sent.id._serialized) id = sent.id._serialized;
      else if (sent.id.id) id = `${sent.id.fromMe ? 'true' : 'false'}_${sent.id.remote || targetChatId}_${sent.id.id}`;
    } else if (sent._serialized) {
      id = sent._serialized;
    }
  }

  // Se sent for undefined ou não tiver id retornado na hora, busca via WAWebCollections diretamente no Puppeteer
  if (!id && wppClient && wppClient.pupPage) {
    try {
      await new Promise(r => setTimeout(r, 600));
      id = await wppClient.pupPage.evaluate((chatId, currentIds) => {
        try {
          const coll = window.require ? window.require('WAWebCollections') : null;
          if (!coll) return null;
          let chat = coll.Chat ? coll.Chat.get(chatId) : null;
          if (chat && chat.msgs) {
            const arr = typeof chat.msgs.getModelsArray === 'function' ? chat.msgs.getModelsArray() : (chat.msgs.models || []);
            const match = arr.slice().reverse().find(m => m && m.id && (m.id.fromMe === true || m.fromMe === true) && !currentIds.includes(m.id._serialized || m.id));
            if (match) return match.id._serialized || (typeof match.id === 'string' ? match.id : match.id.id);
          }
          if (coll.Msg) {
            const allMsgs = typeof coll.Msg.getModelsArray === 'function' ? coll.Msg.getModelsArray() : (coll.Msg.models || []);
            const cleanTarget = String(chatId).replace(/@.*$/, '');
            const match = allMsgs.slice().reverse().find(m => m && m.id && (m.id.fromMe === true || m.fromMe === true) && String(m.id.remote || '').includes(cleanTarget) && !currentIds.includes(m.id._serialized || m.id));
            if (match) return match.id._serialized || (typeof match.id === 'string' ? match.id : match.id.id);
          }
        } catch (_) {}
        return null;
      }, targetChatId, messageIds);
    } catch (ePup) {
      console.warn('[WhatsApp] Aviso ao buscar mensagem recente no Puppeteer:', ePup.message);
    }
  }

  if (id) {
    messageIds.push(id);
    return id;
  }
  return null;
}

async function enviarRelatorioGrupo(tipo = 'admin', context = {}) {
  const tenantKey = context.tenantKey || 'state';
  let state = context.state;
  if (!state) {
    state = await getOrLoadState(tenantKey);
  }
  if (!state) {
    return { success: false, error: `Estado não encontrado para o tenant ${tenantKey}.` };
  }

  if (process.env.DISABLE_INTEGRATIONS === 'true') {
    return { success: true, mock: true, tipo, totalMensagens: tipo === 'admin' ? 3 : 2, tenantKey };
  }

  if (!wppClient) {
    console.error('[WhatsApp] Falha no disparo: wppClient não inicializado.');
    return { success: false, error: 'WhatsApp Web não está inicializado no servidor.' };
  }

  // Se não estiver com status 'pronto', verifica se já está conectado
  if (wppStatus.status !== 'pronto') {
    const st = await wppClient.getState().catch(() => null);
    if (st === 'CONNECTED' || wppClient.info) {
      wppStatus.status = 'pronto';
      wppStatus.user = wppClient.info ? wppClient.info.wid.user : 'Conectado';
    } else {
      console.error(`[WhatsApp] Falha no disparo: status atual é "${wppStatus.status}".`);
      return { success: false, error: `WhatsApp Web não está pronto no servidor (status atual: ${wppStatus.status}).` };
    }
  }

  const cfg = state.cfg || {};
  let targetChatId = (tipo === 'admin'
    ? (cfg.grupoAdminId || process.env.WHATSAPP_GRUPO_ADMIN_ID)
    : (cfg.grupoOperacaoId || process.env.WHATSAPP_GRUPO_OPERACAO_ID)
  );

  // Blacklist estrita: Faturamento e Compras NUNCA podem ser usados para envio de relatórios da Administração
  if (tipo === 'admin') {
    if (targetChatId === '120363428179962435@g.us' || targetChatId === '120363428840376088@g.us') {
      console.warn(`[WhatsApp] Grupo proibido detectado para Administração (${targetChatId}). Desvinculando imediatamente.`);
      targetChatId = null;
      await mutateTenantState(tenantKey, (draft) => {
        if (!draft.cfg) draft.cfg = {};
        draft.cfg.grupoAdminId = '';
      });
    }
  }

  // Se o ID for o dummy/mock antigo ou não estiver setado, tenta auto-descobrir agora nos chats do WhatsApp
  if (!targetChatId || targetChatId.startsWith('12036300000000000')) {
    console.log(`[WhatsApp] ID do grupo ${tipo} não configurado ou dummy. Buscando grupos disponíveis nos chats do WhatsApp...`);
    try {
      const grupos = await obterGruposWhatsApp();
      let achado = null;
      if (tipo === 'admin') {
        achado = grupos.find(g => {
          const n = (g.name || '').toLowerCase();
          if (n.includes('faturamento') || n.includes('compras')) return false;
          return n.includes('admin') || n.includes('administra') || n.includes('gestão') || n.includes('gerência');
        });
      } else {
        achado = grupos.find(g => {
          const n = (g.name || '').toLowerCase();
          return (n.includes('opera') || n.includes('patio') || n.includes('pátio') || n.includes('oficina')) && g.id !== cfg.grupoAdminId;
        });
      }
      if (achado) {
        targetChatId = achado.id;
        await mutateTenantState(tenantKey, (draft) => {
          if (!draft.cfg) draft.cfg = {};
          if (tipo === 'admin') draft.cfg.grupoAdminId = targetChatId;
          else draft.cfg.grupoOperacaoId = targetChatId;
        });
        console.log(`🎯 [WhatsApp] Grupo ${tipo} auto-descoberto com sucesso: "${achado.name}" (${targetChatId})`);
      }
    } catch (eBusca) {
      console.warn('[WhatsApp] Erro ao listar chats para auto-descoberta:', eBusca.message);
    }
  }

  if (!targetChatId || targetChatId.startsWith('12036300000000000')) {
    const errMsg = `Grupo de ${tipo === 'admin' ? 'Administração' : 'Operação'} não localizado no WhatsApp. Verifique se o número foi adicionado ao grupo.`;
    console.error(`❌ [WhatsApp] ${errMsg}`);
    return { success: false, error: errMsg };
  }

  try {
    const messageIds = [];
    await fecharModaisWhatsAppWeb();

    if (tipo === 'admin') {
      const msgs = gerarMensagensAdmin(state);
      console.log(`[WhatsApp] Disparando 3 mensagens + JPG para Grupo Admin (${targetChatId})...`);

      // 1. Gera imagem JPG dos Indicadores e envia com a Msg 1 como legenda
      let sent1;
      try {
        console.log('[WhatsApp] Gerando imagem JPG de indicadores para Grupo Admin...');
        const jpgBuffer = await gerarImagemIndicadoresJPG(state, tenantKey);
        const { MessageMedia } = getWhatsAppModules();
        const media = new MessageMedia('image/jpeg', jpgBuffer.toString('base64'), 'painel_executivo.jpg');
        sent1 = await wppClient.sendMessage(targetChatId, media, { caption: msgs[0], waitUntilMsgSent: true });
      } catch (imgErr) {
        console.warn('[WhatsApp] Falha ao renderizar imagem JPG, enviando texto puro:', imgErr.message);
        sent1 = await wppClient.sendMessage(targetChatId, msgs[0], { waitUntilMsgSent: true });
      }
      await registrarIdMensagem(sent1, targetChatId, messageIds);

      await new Promise(r => setTimeout(r, 1200));
      const sent2 = await wppClient.sendMessage(targetChatId, msgs[1], { waitUntilMsgSent: true });
      await registrarIdMensagem(sent2, targetChatId, messageIds);

      await new Promise(r => setTimeout(r, 1200));
      const sent3 = await wppClient.sendMessage(targetChatId, msgs[2], { waitUntilMsgSent: true });
      await registrarIdMensagem(sent3, targetChatId, messageIds);

      console.log(`✅ [WhatsApp] Relatório completo (3 mensagens + JPG) enviado com sucesso para Grupo Admin (${targetChatId}):`, messageIds);
      return { success: true, tipo: 'admin', grupoId: targetChatId, totalMensagens: 3, messageIds };
    } else {
      const msgsOp = gerarMensagensOperacao(state);
      console.log(`[WhatsApp] Disparando 2 mensagens operacionais para Grupo Operação (${targetChatId})...`);

      const sent1 = await wppClient.sendMessage(targetChatId, msgsOp[0], { waitUntilMsgSent: true });
      await registrarIdMensagem(sent1, targetChatId, messageIds);

      await new Promise(r => setTimeout(r, 1200));
      const sent2 = await wppClient.sendMessage(targetChatId, msgsOp[1], { waitUntilMsgSent: true });
      await registrarIdMensagem(sent2, targetChatId, messageIds);

      console.log(`✅ [WhatsApp] Relatório operacional (2 mensagens sem finanças) enviado para Grupo Operação (${targetChatId}):`, messageIds);
      return { success: true, tipo: 'operacao', grupoId: targetChatId, totalMensagens: 2, messageIds };
    }
  } catch (err) {
    console.error(`❌ [WhatsApp] Erro ao disparar para grupo ${tipo}:`, err.message);
    return { success: false, error: err.message };
  }
}

async function enviarRelatorioAdministradores(destinatarioEspecifico = null, context = {}) {
  const tenantKey = context.tenantKey || 'state';
  let state = context.state;
  if (!state) {
    state = await getOrLoadState(tenantKey);
  }
  if (!state) {
    return { success: false, error: `Estado não encontrado para o tenant ${tenantKey}.` };
  }

  if (process.env.DISABLE_INTEGRATIONS === 'true') {
    return { success: true, mock: true, totalEnviados: 1, enviados: ['mock_admin'], tenantKey };
  }

  // Se for especificado um grupo ou fone
  if (destinatarioEspecifico && destinatarioEspecifico.includes('@g.us')) {
    return await enviarRelatorioGrupo('admin', context);
  }

  const rel = gerarRelatorioExecutivo(state);
  let lista = [];
  if (destinatarioEspecifico) {
    lista = [destinatarioEspecifico];
  } else {
    const envAdmins = (process.env.WHATSAPP_ADMIN_NUMBERS || '')
      .split(',')
      .map(s => s.trim().replace(/\D/g, ''))
      .filter(Boolean);
    const cfgAdmins = (state.cfg?.adminFones || [])
      .map(s => String(s).trim().replace(/\D/g, ''))
      .filter(Boolean);
    lista = [...new Set([...envAdmins, ...cfgAdmins])];
  }

  if (lista.length === 0) {
    return { success: false, error: 'Nenhum telefone de administrador cadastrado no sistema (.env ou Configurações).' };
  }

  if (!wppClient || wppStatus.status !== 'pronto') {
    return {
      success: false,
      error: `WhatsApp Web não está pronto no servidor (status atual: ${wppStatus.status}). Conecte pelo painel primeiro.`,
      textoPreview: rel.texto,
      destinatarios: lista
    };
  }

  const enviados = [];
  const falhas = [];
  const messageIds = [];

  await fecharModaisWhatsAppWeb();
  for (const fone of lista) {
    try {
      let foneFormatado = fone.replace(/\D/g, '');
      if (!foneFormatado.startsWith('55') && foneFormatado.length >= 10 && foneFormatado.length <= 11) {
        foneFormatado = '55' + foneFormatado;
      }
      const chatId = `${foneFormatado}@c.us`;
      const sent = await wppClient.sendMessage(chatId, rel.texto, { waitUntilMsgSent: true });
      await registrarIdMensagem(sent, chatId, messageIds);
      enviados.push(fone);
      console.log(`[WhatsApp] Relatório executivo enviado com sucesso para ${fone}`);
    } catch (err) {
      console.error(`[WhatsApp] Falha ao enviar para ${fone}:`, err.message);
      falhas.push({ fone, erro: err.message });
    }
  }

  return {
    success: enviados.length > 0,
    totalEnviados: enviados.length,
    enviados,
    falhas,
    messageIds,
    textoRelatorio: rel.texto
  };
}

const ultimoDiaEnvioPorTenant = new Map();
function iniciarAgendadorRelatorioDiario() {
  if (process.env.DISABLE_INTEGRATIONS === 'true') {
    console.log('[Agendador WhatsApp] DISABLE_INTEGRATIONS=true: Agendador inativo em modo de teste.');
    return;
  }

  console.log('[Agendador WhatsApp] Rotina matinal diária multi-tenant inicializada.');
  setInterval(async () => {
    try {
      const agoraSP = financialEngine.obterAgoraSP();
      const horaAtual = agoraSP.horaBR;
      const diaHoje = agoraSP.dataISO;
      const isDiaUtil = agoraSP.diaSemana >= 1 && agoraSP.diaSemana <= 5;

      // Coleta todos os tenants cadastrados no banco
      const rows = await all("SELECT key, value FROM kv WHERE key LIKE 'tenant:%:state' OR key = 'state'");
      const tenantEntries = (rows && rows.length > 0)
        ? rows.map(r => ({ key: extractTenantId(r.key), state: safeJsonParse(r.value) })).filter(e => e.state)
        : [];

      for (const entry of tenantEntries) {
        const tenantKey = entry.key;
        const tenantState = entry.state;
        if (!tenantState) continue;

        const cfg = tenantState.cfg || {};
        const horaConfig = (cfg.horaRelatorioDiario || process.env.HORA_RELATORIO_DIARIO || '07:30').trim();
        const autoAtivo = cfg.envioAutomaticoRelatorio !== false && process.env.ENVIO_AUTOMATICO_RELATORIO !== 'false';
        const apenasDiasUteis = cfg.relatorioApenasDiasUteis !== false && process.env.RELATORIO_APENAS_DIAS_UTEIS !== 'false';

        if (!autoAtivo) continue;
        if (apenasDiasUteis && !isDiaUtil) continue;
        if (tenantState._enviandoRelatorio) continue;

        const ultimoEnvio = ultimoDiaEnvioPorTenant.get(tenantKey);
        if (horaAtual === horaConfig && ultimoEnvio !== diaHoje) {
          tenantState._enviandoRelatorio = true;
          ultimoDiaEnvioPorTenant.set(tenantKey, diaHoje);
          try {
            console.log(`⏰ [Agendador WhatsApp] Horário de disparo matinal (${horaConfig}) atingido para tenant ${tenantKey}.`);

            const resAdm = await enviarRelatorioGrupo('admin', { tenantKey, state: tenantState });
            console.log(`⏰ [${tenantKey}] Resultado disparo admin:`, JSON.stringify(resAdm));

            const resOp = await enviarRelatorioGrupo('operacao', { tenantKey, state: tenantState });
            console.log(`⏰ [${tenantKey}] Resultado disparo operacao:`, JSON.stringify(resOp));

            if (!resAdm.success && !resOp.success) {
              console.log(`⏰ [${tenantKey}] Grupos não configurados ou com falha. Acionando fallback direto para administradores...`);
              await enviarRelatorioAdministradores(null, { tenantKey, state: tenantState });
            }
          } finally {
            tenantState._enviandoRelatorio = false;
          }
        }
      }
    } catch (err) {
      console.error('[Agendador WhatsApp] Erro no agendador:', err);
    }
  }, 30000).unref();
}

app.get('/api/whatsapp/status', async (req, res) => {
  let userWid = null;
  if (wppClient && wppClient.info && wppClient.info.wid) {
    userWid = wppClient.info.wid.user;
    if (wppStatus.status !== 'pronto') {
      wppStatus.status = 'pronto';
      wppStatus.user = userWid;
    }
  }
  res.json(wppStatus);
});

// Retorna o QR Code em PNG com alto contraste
app.get('/api/whatsapp/qr.png', async (req, res) => {
  if (wppStatus.qr) {
    try {
      const buffer = await QRCode.toBuffer(wppStatus.qr, {
        width: 400,
        margin: 2,
        color: { dark: '#000000', light: '#ffffff' }
      });
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      return res.send(buffer);
    } catch (e) {
      return res.status(500).send('Erro ao renderizar QR Code.');
    }
  }
  res.status(404).send('Nenhum QR Code pendente no momento.');
});

// Helper resiliente para listar grupos do WhatsApp contornando instabilidades do getChats()
async function obterGruposWhatsApp() {
  if (!wppClient) return [];

  // Tentativa 1: Extração direta resiliente via evaluate no Puppeteer (bypassa WAWebLidMigrationUtils e getChatModel corrompido)
  if (wppClient.pupPage) {
    try {
      const grupos = await wppClient.pupPage.evaluate(() => {
        try {
          let chatModels = [];
          if (typeof window.require === 'function') {
            try {
              const coll = window.require('WAWebCollections');
              if (coll && coll.Chat) {
                chatModels = typeof coll.Chat.getModelsArray === 'function' ? coll.Chat.getModelsArray() : (coll.Chat.models || []);
              }
            } catch (eColl) {}
          }
          if (!chatModels || chatModels.length === 0) {
            if (window.Store && window.Store.Chat) {
              chatModels = typeof window.Store.Chat.getModelsArray === 'function'
                ? window.Store.Chat.getModelsArray()
                : (window.Store.Chat.models || []);
            }
          }

          const resultado = [];
          const jaInseridos = new Set();

          for (const c of (chatModels || [])) {
            try {
              const rawId = c.id ? (c.id._serialized || c.id) : null;
              let idStr = '';
              if (typeof rawId === 'string') idStr = rawId;
              else if (rawId && rawId.user && rawId.server) idStr = `${rawId.user}@${rawId.server}`;
              else if (rawId && rawId._serialized) idStr = rawId._serialized;

              if (idStr && idStr.endsWith('@g.us') && !jaInseridos.has(idStr)) {
                jaInseridos.add(idStr);
                const name = c.formattedTitle || c.name || (c.contact ? (c.contact.formattedName || c.contact.name) : '') || 'Grupo';
                resultado.push({ id: idStr, name: String(name) });
              }
            } catch (errItem) {}
          }
          return resultado;
        } catch (errEval) {
          return [];
        }
      });

      if (Array.isArray(grupos) && grupos.length > 0) {
        console.log(`[WhatsApp] Extração resiliente no Puppeteer encontrou ${grupos.length} grupos.`);
        return grupos;
      }
    } catch (e2) {
      console.warn('[WhatsApp] evaluate() resiliente no Puppeteer falhou:', e2.message);
    }
  }

  // Tentativa 2: getChats() padrão (se disponível e não crashar)
  try {
    const chats = await wppClient.getChats();
    if (Array.isArray(chats) && chats.length > 0) {
      return chats.filter(c => c.isGroup).map(c => ({
        id: c.id ? (c.id._serialized || c.id) : '',
        name: c.name || 'Grupo sem nome'
      })).filter(g => g.id && String(g.id).endsWith('@g.us'));
    }
  } catch (e1) {
    console.warn('[WhatsApp] getChats() padrão retornou erro (esperado no WhatsApp Web atual):', e1.message);
  }

  return [];
}

// ── Rotas do Relatório Executivo e Grupos do WhatsApp ────────
app.get('/api/whatsapp/grupos', async (req, res) => {
  try {
    if (!wppClient) {
      return res.json({ grupos: [], error: 'WhatsApp não inicializado.' });
    }
    const grupos = await obterGruposWhatsApp();
    res.json({ grupos });
  } catch (err) {
    console.error('[API /api/whatsapp/grupos] Erro:', err);
    res.status(500).json({ error: err.message, grupos: [] });
  }
});

app.post('/api/whatsapp/sincronizar-grupos', async (req, res) => {
  try {
    if (!wppClient) return res.json({ success: false, error: 'WhatsApp não inicializado.' });
    await sincronizarGruposAutomaticamente();
    const targetState = await getOrLoadState(req);
    const grupos = await obterGruposWhatsApp();
    res.json({ success: true, grupos, cfg: targetState?.cfg });
  } catch (err) {
    console.error('[API /api/whatsapp/sincronizar-grupos] Erro:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/whatsapp/entrar-grupo', async (req, res) => {
  try {
    const { inviteCode, url } = req.body || {};
    let code = inviteCode;
    if (!code && url) {
      const m = url.match(/chat\.whatsapp\.com\/([a-zA-Z0-9_-]+)/);
      if (m) code = m[1];
    }
    if (!code) return res.status(400).json({ success: false, error: 'Código ou URL do convite não fornecido.' });
    if (!wppClient) return res.status(500).json({ success: false, error: 'WhatsApp não inicializado.' });

    const groupId = await wppClient.acceptInvite(code);
    await sincronizarGruposAutomaticamente();
    const targetState = await getOrLoadState(req);
    res.json({ success: true, groupId, cfg: targetState?.cfg });
  } catch (err) {
    console.error('[API /api/whatsapp/entrar-grupo] Erro:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/whatsapp/diagnostico', requirePermission('whatsapp:admin'), async (req, res) => {
  try {
    if (!wppClient || !wppClient.pupPage) {
      return res.json({ error: 'WhatsApp Web ou pupPage indisponível.' });
    }
    const info = await wppClient.pupPage.evaluate(async () => {
      const titles = [];
      document.querySelectorAll('span[title]').forEach(el => {
        const t = el.getAttribute('title');
        if (t && t.length > 1 && !titles.includes(t)) titles.push(t);
      });

      let storeChats = [];
      try {
        const coll = window.require ? window.require('WAWebCollections') : null;
        if (coll && coll.Chat) {
          const arr = typeof coll.Chat.getModelsArray === 'function' ? coll.Chat.getModelsArray() : (coll.Chat.models || []);
          storeChats = arr.map(c => ({
            id: c.id ? (c.id._serialized || c.id) : null,
            name: c.formattedTitle || c.name || (c.contact ? (c.contact.formattedName || c.contact.name) : '') || '',
            isGroup: Boolean(c.isGroup || (c.id && String(c.id._serialized || c.id).endsWith('@g.us'))),
            unreadCount: c.unreadCount || 0
          }));
        }
      } catch (e) {}

      return { titles, storeChats };
    });

    res.json({ success: true, ...info });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/whatsapp/screenshot', authMiddleware, requirePermission('whatsapp:admin'), async (req, res) => {
  try {
    if (!wppClient || !wppClient.pupPage) return res.status(400).json({ error: 'Puppeteer não disponível.' });
    const buffer = await wppClient.pupPage.screenshot({ type: 'png' });
    res.set('Content-Type', 'image/png');
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/whatsapp/pesquisar-termo/:termo', authMiddleware, requirePermission('whatsapp:admin'), async (req, res) => {
  try {
    if (!wppClient || !wppClient.pupPage) return res.json({ error: 'pupPage indisponível' });
    const termo = req.params.termo;
    const resultado = await wppClient.pupPage.evaluate(async (busca) => {
      const searchBox = document.querySelector('div[contenteditable="true"][data-tab="3"]') ||
                        document.querySelector('div[role="textbox"]');
      if (!searchBox) return { erro: 'Caixa de busca não encontrada no DOM' };

      searchBox.focus();
      document.execCommand('selectAll', false, null);
      document.execCommand('insertText', false, busca);

      await new Promise(r => setTimeout(r, 2500));

      const items = [];
      document.querySelectorAll('span[title]').forEach(el => {
        const t = el.getAttribute('title');
        if (t && !items.includes(t)) items.push(t);
      });

      let chatsEncontrados = [];
      try {
        const coll = window.require ? window.require('WAWebCollections') : null;
        if (coll && coll.Chat) {
          const arr = typeof coll.Chat.getModelsArray === 'function' ? coll.Chat.getModelsArray() : (coll.Chat.models || []);
          chatsEncontrados = arr.map(c => ({
            id: c.id ? (c.id._serialized || c.id) : null,
            name: c.formattedTitle || c.name || (c.contact ? (c.contact.formattedName || c.contact.name) : '') || '',
            isGroup: Boolean(c.isGroup || (c.id && String(c.id._serialized || c.id).endsWith('@g.us')))
          })).filter(c => c.name.toLowerCase().includes(busca.toLowerCase()) || c.isGroup);
        }
      } catch (eColl) {}

      return { titlesAposBusca: items, chatsEncontrados };
    }, termo);

    res.json(resultado);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/whatsapp/imagem-preview.jpg', async (req, res) => {
  try {
    const targetState = await getOrLoadState(req);
    const tenantKey = getTenantKey(req);
    const dataRef = req.query.dataRef || null;
    const buffer = await gerarImagemIndicadoresJPG(targetState, tenantKey, { dataRef });
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.send(buffer);
  } catch (err) {
    console.error('[API /api/whatsapp/imagem-preview.jpg] Erro:', err);
    res.status(500).send('Erro ao renderizar imagem preview.');
  }
});

app.get('/api/financeiro/dashboard', requirePermission('financial:read'), async (req, res) => {
  try {
    const targetState = await getOrLoadState(req);
    const filtro = req.query.filtro || '30d';
    const dataRef = req.query.dataRef || null;
    const customDe = req.query.de || null;
    const customAte = req.query.ate || null;
    const dash = financialEngine.obterDashboardFinanceiro(targetState, { filtro, dataRef, customDe, customAte });
    res.json(dash);
  } catch (err) {
    console.error('[API /api/financeiro/dashboard] Erro:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/whatsapp/relatorio-preview', requirePermission('financial:read', 'reports:read'), async (req, res) => {
  try {
    const targetState = await getOrLoadState(req);
    const dataRef = req.query.dataRef || null;
    const options = { dataRef };
    const msgsAdmin = gerarMensagensAdmin(targetState, options);
    const msgsOp = gerarMensagensOperacao(targetState, options);
    const rel = gerarRelatorioExecutivo(targetState, options);
    res.json({
      success: true,
      texto: rel.texto,
      mensagensAdmin: msgsAdmin,
      mensagensOperacao: msgsOp,
      indicadores: rel.indicadores
    });
  } catch (err) {
    console.error('[API /api/whatsapp/relatorio-preview] Erro:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/whatsapp/disparar-grupo/:tipo', authMiddleware, async (req, res) => {
  try {
    const targetState = await getOrLoadState(req);
    const tenantKey = getTenantKey(req);
    const tipo = req.params.tipo === 'operacao' ? 'operacao' : 'admin';
    const resultado = await enviarRelatorioGrupo(tipo, { tenantKey, state: targetState });
    res.json(resultado);
  } catch (err) {
    console.error(`[API /api/whatsapp/disparar-grupo/${req.params.tipo}] Erro:`, err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/whatsapp/disparar-relatorio-admin', authMiddleware, async (req, res) => {
  try {
    const targetState = await getOrLoadState(req);
    const tenantKey = getTenantKey(req);
    const resultado = await enviarRelatorioAdministradores(null, { tenantKey, state: targetState });
    res.json(resultado);
  } catch (err) {
    console.error('[API /api/whatsapp/disparar-relatorio-admin] Erro:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/whatsapp/config-grupos', async (req, res) => {
  try {
    const targetState = (await getOrLoadState(req)) || {};
    const cfg = targetState.cfg || {};
    res.json({
      grupoAdminId: cfg.grupoAdminId || process.env.WHATSAPP_GRUPO_ADMIN_ID || '',
      grupoOperacaoId: cfg.grupoOperacaoId || process.env.WHATSAPP_GRUPO_OPERACAO_ID || '',
      horaRelatorio: cfg.horaRelatorioDiario || process.env.HORA_RELATORIO_DIARIO || '07:30',
      envioAutomatico: cfg.envioAutomaticoRelatorio !== false && process.env.ENVIO_AUTOMATICO_RELATORIO !== 'false',
      apenasDiasUteis: cfg.relatorioApenasDiasUteis !== false && process.env.RELATORIO_APENAS_DIAS_UTEIS !== 'false',
      wppStatus: wppStatus.status
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/whatsapp/config-grupos', authMiddleware, async (req, res) => {
  try {
    const targetState = await getOrLoadState(req);
    if (!targetState) return res.status(404).json({ error: 'Tenant não encontrado.' });
    if (!targetState.cfg) targetState.cfg = {};

    const { grupoAdminId, grupoOperacaoId, horaRelatorio, envioAutomatico, apenasDiasUteis } = req.body || {};

    let cfgAtualizada = null;
    const mutateRes = await mutateTenantState(req, async (draft) => {
      if (!draft.cfg) draft.cfg = {};
      if (grupoAdminId !== undefined) {
        if (grupoAdminId === '120363428179962435@g.us' || grupoAdminId === '120363428840376088@g.us') {
          draft.cfg.grupoAdminId = '';
        } else {
          draft.cfg.grupoAdminId = grupoAdminId;
        }
      }
      if (grupoOperacaoId !== undefined) draft.cfg.grupoOperacaoId = grupoOperacaoId;
      if (horaRelatorio) draft.cfg.horaRelatorioDiario = horaRelatorio;
      if (typeof envioAutomatico === 'boolean') draft.cfg.envioAutomaticoRelatorio = envioAutomatico;
      if (typeof apenasDiasUteis === 'boolean') draft.cfg.relatorioApenasDiasUteis = apenasDiasUteis;
      cfgAtualizada = draft.cfg;
      return draft;
    });

    if (!mutateRes.ok) {
      return res.status(mutateRes.status || 500).json({ error: mutateRes.error || 'Falha ao salvar configurações de grupo.' });
    }
    res.json({ success: true, cfg: cfgAtualizada });
  } catch (err) {
    console.error('[API /api/whatsapp/config-grupos POST] Erro:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/whatsapp/config-relatorio', async (req, res) => {
  try {
    const targetState = (await getOrLoadState(req)) || {};
    const envAdmins = (process.env.WHATSAPP_ADMIN_NUMBERS || '').split(',').map(s => s.trim()).filter(Boolean);
    const cfgAdmins = targetState.cfg?.adminFones || [];
    const adminFones = [...new Set([...envAdmins, ...cfgAdmins])];
    const cfg = targetState.cfg || {};
    const horaRelatorio = cfg.horaRelatorioDiario || process.env.HORA_RELATORIO_DIARIO || '07:30';
    const envioAutomatico = cfg.envioAutomaticoRelatorio !== false && process.env.ENVIO_AUTOMATICO_RELATORIO !== 'false';
    const apenasDiasUteis = cfg.relatorioApenasDiasUteis !== false && process.env.RELATORIO_APENAS_DIAS_UTEIS !== 'false';

    res.json({
      adminFones,
      horaRelatorio,
      envioAutomatico,
      apenasDiasUteis,
      wppStatus: wppStatus.status
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/whatsapp/config-relatorio', authMiddleware, async (req, res) => {
  try {
    const { adminFones, horaRelatorio, envioAutomatico, apenasDiasUteis } = req.body || {};

    let cfgAtualizada = null;
    const mutateRes = await mutateTenantState(req, async (draft) => {
      if (!draft.cfg) draft.cfg = {};
      if (Array.isArray(adminFones)) draft.cfg.adminFones = adminFones;
      if (horaRelatorio) draft.cfg.horaRelatorioDiario = horaRelatorio;
      if (typeof envioAutomatico === 'boolean') draft.cfg.envioAutomaticoRelatorio = envioAutomatico;
      if (typeof apenasDiasUteis === 'boolean') draft.cfg.relatorioApenasDiasUteis = apenasDiasUteis;
      cfgAtualizada = draft.cfg;
      return draft;
    });

    if (!mutateRes.ok) {
      return res.status(mutateRes.status || 500).json({ error: mutateRes.error || 'Falha ao salvar configuração de relatório.' });
    }
    res.json({ success: true, cfg: cfgAtualizada });
  } catch (err) {
    console.error('[API /api/whatsapp/config-relatorio POST] Erro:', err);
    res.status(500).json({ error: err.message });
  }
});

/* ── Integração IA: Upload e Leitura de Nota Fiscal ──────── */
app.post('/api/upload-nota', async (req, res) => {
  try {
    const { imagemBase64 } = req.body;
    if (!imagemBase64) return res.status(400).json({ error: 'Nenhuma imagem recebida.' });
    if (!ai) return res.status(500).json({ error: 'Google Gen AI não configurado no servidor.' });

    const base64Data = imagemBase64.replace(/^data:image\/\w+;base64,/, '');
    const prompt = `Extraia os dados desta Nota Fiscal ou recibo de autopeças/serviços.
Retorne APENAS um JSON estrito no seguinte formato:
{
  "fornecedor": "Nome da Empresa Emissora",
  "numero_nf": "Número da NF ou Danfe",
  "data_emissao": "YYYY-MM-DD",
  "valor_total": 0.00,
  "itens": [
    {
      "nome": "Nome da Peça ou Serviço",
      "quantidade": 1,
      "valor_unitario": 0.00,
      "valor_total": 0.00
    }
  ]
}`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          role: 'user',
          parts: [
            { text: prompt },
            { inlineData: { mimeType: 'image/jpeg', data: base64Data } }
          ]
        }
      ]
    });

    const dadosNF = safeJsonParse(response.text);
    if (!dadosNF || !dadosNF.itens || !Array.isArray(dadosNF.itens)) {
      return res.status(422).json({ error: 'Não foi possível extrair os itens da nota fiscal com clareza.' });
    }

    let finalState = null;
    const mutateRes = await mutateTenantState(req, async (draft) => {
      if (!draft.pecas) draft.pecas = [];
      for (const item of dadosNF.itens) {
        const existing = draft.pecas.find(p => p.nome.toLowerCase() === item.nome.toLowerCase());
        if (existing) {
          existing.qtd = (existing.qtd || 0) + (Number(item.quantidade) || 1);
          existing.custo = Number(item.valor_unitario) || existing.custo;
        } else {
          draft.pecas.push({
            id: 'p_' + Date.now() + Math.floor(Math.random() * 1000),
            cod: 'NF-' + Math.floor(Math.random() * 900 + 100),
            nome: item.nome,
            un: 'un',
            qtd: Number(item.quantidade) || 1,
            min: 1,
            custo: Number(item.valor_unitario) || 0,
            venda: (Number(item.valor_unitario) || 0) * 1.5,
            loc: 'Pátio',
            forn: dadosNF.fornecedor || ''
          });
        }
      }
      finalState = draft;
      return draft;
    });

    if (!mutateRes.ok) {
      return res.status(mutateRes.status || 500).json({ success: false, error: mutateRes.error || 'Falha ao persistir dados da nota fiscal.' });
    }

    res.json({
      success: true,
      message: 'Nota fiscal lida com sucesso via IA!',
      dadosProcessados: dadosNF,
      newState: finalState
    });
  } catch (err) {
    console.error('[API /api/upload-nota] Erro:', err);
    res.status(500).json({ error: err.message });
  }
});

/* ── Integração IA: Ditado de Áudio para Abertura de OS ───── */
app.post('/api/processar-audio-os', async (req, res) => {
  try {
    const { audioBase64, catalogoServicos, catalogoPecas } = req.body;
    if (!audioBase64) return res.status(400).json({ error: 'Nenhum áudio recebido.' });
    if (!ai) return res.status(500).json({ error: 'Google Gen AI não configurado.' });

    const matches = audioBase64.match(/^data:(.+);base64,(.+)$/);
    let mimeType = 'audio/webm';
    let base64Data = audioBase64;
    if (matches && matches.length === 3) {
      mimeType = matches[1].split(';')[0];
      base64Data = matches[2];
    }

    const prompt = `Você é um assistente de oficina mecânica diesel pesada.
O mecânico ditou um áudio com serviços e peças de uma ordem de serviço.
Catálogo de serviços: ${JSON.stringify(catalogoServicos || [])}
Catálogo de peças: ${JSON.stringify(catalogoPecas || [])}
Retorne APENAS um JSON estrito:
{
  "servicos_identificados": [
    { "id_catalogo": "id ou null", "nome": "nome do serviço", "qtd": 1, "valor": 0.00 }
  ],
  "pecas_identificadas": [
    { "id_catalogo": "id ou null", "nome": "nome da peça", "qtd": 1, "valor": 0.00 }
  ]
}`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          role: 'user',
          parts: [
            { inlineData: { mimeType, data: base64Data } },
            { text: prompt }
          ]
        }
      ]
    });

    const dados = safeJsonParse(response.text);
    if (!dados || typeof dados !== 'object') {
      return res.status(422).json({ error: 'Não foi possível extrair os serviços e peças do áudio informado.' });
    }
    res.json({ success: true, dadosProcessados: dados });
  } catch (err) {
    console.error('[API /api/processar-audio-os] Erro:', err);
    res.status(500).json({ error: err.message });
  }
});

/* ── Camada Inteligente de Entrada e Operação por Voz ──────── */
app.post('/api/comando-voz', async (req, res) => {
  let tokenReservado = null;
  try {
    const { texto, audioBase64, mimeType, context, token: directToken } = req.body || {};
    if (!texto && !audioBase64) {
      return res.status(400).json({ error: 'Nenhum texto ou áudio fornecido para interpretação.' });
    }

    const secCtx = req.securityContext || {};
    const tenantId = extractTenantId(req);
    const actorId = secCtx.actorId || 'operador';
    const role = secCtx.role || 'mecanico';
    const permissions = Array.isArray(secCtx.permissions) ? [...secCtx.permissions] : [];
    const isSenderAdmin = permissions.includes('*') || ['admin', 'tenant_admin', 'platform_admin'].includes(role);

    // Aceitar do cliente apenas campos contextuais não-privilegiados permitidos
    const clientCtx = (context && typeof context === 'object') ? context : {};
    const tokenInformado = (typeof directToken === 'string' && directToken) ||
                           (typeof clientCtx.confirmToken === 'string' && clientCtx.confirmToken) ||
                           (typeof clientCtx.token === 'string' && clientCtx.token) || null;

    const safeContext = {
      canal: typeof clientCtx.canal === 'string' ? clientCtx.canal.slice(0, 32) : 'web',
      activeOsId: typeof clientCtx.activeOsId === 'string' ? clientCtx.activeOsId.slice(0, 64) : (typeof clientCtx.activeOsId === 'number' ? clientCtx.activeOsId : null),
      activeBoxId: typeof clientCtx.activeBoxId === 'string' ? clientCtx.activeBoxId.slice(0, 32) : null,
      activeQuotationId: typeof clientCtx.activeQuotationId === 'string' ? clientCtx.activeQuotationId.slice(0, 64) : null,
      activeServiceId: typeof clientCtx.activeServiceId === 'string' ? clientCtx.activeServiceId.slice(0, 64) : null,
      origem: typeof clientCtx.origem === 'string' ? clientCtx.origem.slice(0, 32) : 'web',
      confirmToken: tokenInformado,
      autoConsumirToken: false,
      // Segurança inegociável derivada exclusivamente do req.securityContext
      tenantId,
      actorId,
      role,
      permissions,
      isSenderAdmin
    };

    let fullState = await getOrLoadState(req);
    // Projeta o estado estritamente de acordo com o papel do usuário autenticado
    const projectedState = filterStateByRole(fullState, safeContext);

    // 1. Interpretação FORA da fila de escrita (sem segurar mutex durante IA ou fallback)
    const interpretado = await voiceActionEngine.interpretarComando({
      input: { text: texto, audioBase64, mimeType },
      context: safeContext,
      state: projectedState,
      aiClient: ai
    });

    const acoesApenasLeitura = [
      'consultar_status', 'duvida_geral', 'ajuda_sistema_treinamento',
      'consultar_financeiro', 'consultar_estoque', 'consultar_estoque_peca',
      'consultar_fornecedor_peca', 'consultar_equipe_livre', 'consultar_mecanico_trabalho',
      'consultar_box_mecanico', 'consultar_tempo_os', 'consultar_mecanico_mais_produtivo',
      'consultar_retrabalho', 'consultar_custo_mao_obra_os', 'consultar_custo_real_os',
      'consultar_gargalo_operacao', 'consultar_entregas_risco', 'consultar_alertas_operacao',
      'consultar_resumo_operacional', 'consultar_orcamento', 'consultar_desconto_seguro',
      'consultar_sugestao_preco', 'consultar_margem_orcamento', 'consultar_servicos_pouca_margem',
      'consultar_servico_mais_retrabalho', 'consultar_custo_medio_servico', 'consultar_adequacao_preco_servico',
      'consultar_preventiva_frota', 'consultar_frota_cliente', 'consultar_contatos_crm',
      'consultar_manutencao_veiculo', 'consultar_pos_venda'
    ];

    const intencaoOuAcao = interpretado?.intencao || interpretado?.acao;
    const isLeitura = acoesApenasLeitura.includes(intencaoOuAcao) || interpretado?.negado;

    // Se for ação apenas de leitura ou negada, executa sobre o snapshot de leitura e retorna
    if (isLeitura) {
      const resultadoExec = await voiceActionEngine.executarAcao({
        interpretado,
        input: { text: texto, audioBase64, mimeType },
        context: safeContext,
        state: projectedState
      });
      return res.json({
        success: resultadoExec.ok !== false,
        ...resultadoExec,
        interpretado,
        novoEstado: null
      });
    }

    // Se a intenção for confirmação de ação, resolve e reserva o token contra concorrência
    if (intencaoOuAcao === 'confirmar_acao') {
      const tokenParaConfirmar = voiceActionEngine.buscarTokenPendente({
        canal: safeContext.canal,
        remetente: actorId,
        token: tokenInformado
      });

      if (!tokenParaConfirmar) {
        return res.status(400).json({
          success: false,
          ok: false,
          error: 'Não há token de confirmação informado para a ação.'
        });
      }

      // Reserva atômica de concorrência antes de entrar na fila de escrita
      const reserva = reservarTokenAcao(tokenParaConfirmar, { tenantId, actorId });
      if (!reserva.ok) {
        return res.status(reserva.concorrencia ? 409 : 400).json({
          success: false,
          ok: false,
          error: reserva.error || 'Token de confirmação inválido ou expirado.'
        });
      }
      tokenReservado = tokenParaConfirmar;
      safeContext.confirmToken = tokenParaConfirmar;
    }

    // 2. Ação de mutação de dados: aplica as alterações atomicamente dentro de mutateTenantState
    let resultadoFinal = null;
    const mutateRes = await mutateTenantState(req, async (draft) => {
      const resultadoExec = await voiceActionEngine.executarAcao({
        interpretado,
        input: { text: texto, audioBase64, mimeType },
        context: { ...safeContext, autoConsumirToken: false },
        state: draft
      });
      resultadoFinal = {
        ...resultadoExec,
        interpretado
      };

      if (resultadoExec.ok === false || resultadoExec.negado) {
        return { abort: true, status: 400, error: resultadoExec.resposta || 'Comando de voz rejeitado.' };
      }

      if (resultadoExec.pendenteConfirmacao) {
        // Ação de alto risco que gerou token de confirmação pendente em memória — não persiste agora
        return { abort: true, status: 200, pendente: true };
      }

      return draft;
    });

    if (mutateRes.aborted && mutateRes.mutatorResult?.pendente) {
      return res.json({
        success: true,
        ...resultadoFinal,
        novoEstado: null
      });
    }

    if (!mutateRes.ok) {
      if (tokenReservado) {
        voiceActionEngine.abortarConfirmacaoAcao(tokenReservado);
        tokenReservado = null;
      }
      return res.status(mutateRes.status || 400).json({
        success: false,
        error: mutateRes.error || 'Falha ao processar comando de voz.'
      });
    }

    // Gravação no banco teve SUCESSO DURÁVEL: agora sim consumimos o token definitivamente
    if (tokenReservado) {
      voiceActionEngine.consumirAcaoPendente(tokenReservado, { tenantId, actorId });
      tokenReservado = null;
    }

    return res.json({
      success: resultadoFinal?.ok !== false,
      ...resultadoFinal,
      novoEstado: { versao: mutateRes.versao }
    });
  } catch (err) {
    if (tokenReservado) {
      voiceActionEngine.abortarConfirmacaoAcao(tokenReservado);
      tokenReservado = null;
    }
    if (err instanceof PersistenceError || err.name === 'PersistenceError') {
      return res.status(err.status || 409).json({
        success: false,
        ok: false,
        error: err.message,
        conflict: err.conflict,
        versao: err.versao
      });
    }
    console.error('[API /api/comando-voz] Erro:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/comando-voz/confirmar', async (req, res) => {
  let tokenReservado = null;
  try {
    const { token } = req.body || {};
    if (!token) return res.status(400).json({ error: 'Token de confirmação não fornecido.' });

    const secCtx = req.securityContext || {};
    const tenantId = extractTenantId(req);
    const actorId = secCtx.actorId || 'operador';
    const role = secCtx.role || 'mecanico';
    const permissions = Array.isArray(secCtx.permissions) ? [...secCtx.permissions] : [];
    const isSenderAdmin = permissions.includes('*') || ['admin', 'tenant_admin', 'platform_admin'].includes(role);

    // Reserva atômica de concorrência antes de entrar na fila de escrita
    const reserva = reservarTokenAcao(token, { tenantId, actorId });
    if (!reserva.ok) {
      return res.status(reserva.concorrencia ? 409 : 400).json({
        success: false,
        ok: false,
        resposta: reserva.error,
        error: reserva.error || 'Token de confirmação inválido ou expirado.'
      });
    }
    tokenReservado = token;

    const safeContext = {
      confirmToken: token,
      confirmadoPeloUsuario: true,
      autoConsumirToken: false,
      tenantId,
      actorId,
      role,
      permissions,
      isSenderAdmin
    };

    let resultadoFinal = null;
    const mutateRes = await mutateTenantState(req, async (draft) => {
      const resultado = await voiceActionEngine.interpretarEExecutar({
        input: { text: 'confirmar' },
        context: { ...safeContext, autoConsumirToken: false },
        state: draft,
        aiClient: ai
      });
      resultadoFinal = resultado;
      if (!resultado.ok) {
        return { abort: true, status: 400, error: resultado.resposta || 'Falha ao confirmar ação de voz.' };
      }
      return draft;
    });

    if (!mutateRes.ok) {
      if (tokenReservado) {
        voiceActionEngine.abortarConfirmacaoAcao(tokenReservado);
        tokenReservado = null;
      }
      return res.status(mutateRes.status || 400).json({
        success: false,
        ok: false,
        resposta: mutateRes.error || 'Falha ao confirmar ação de voz.',
        error: mutateRes.error || 'Falha ao confirmar ação de voz.'
      });
    }

    // Token é consumido SOMENTE após a gravação atômica durável com sucesso no SQLite
    voiceActionEngine.consumirAcaoPendente(token, { tenantId, actorId });
    tokenReservado = null;

    res.json({
      success: resultadoFinal?.ok !== false,
      ...resultadoFinal,
      novoEstado: { versao: mutateRes.versao }
    });
  } catch (err) {
    if (tokenReservado) {
      voiceActionEngine.abortarConfirmacaoAcao(tokenReservado);
      tokenReservado = null;
    }
    if (err instanceof PersistenceError || err.name === 'PersistenceError') {
      return res.status(err.status || 409).json({
        success: false,
        ok: false,
        error: err.message,
        conflict: err.conflict,
        versao: err.versao
      });
    }
    console.error('[API /api/comando-voz/confirmar] Erro:', err);
    res.status(500).json({ error: err.message });
  }
});

/* ── Conciliação de Veículos e Anexo de Foto de OS ─────────── */
app.post('/api/os/:id/anexar-foto', async (req, res) => {
  try {
    const osId = req.params.id;
    const { imagemBase64, placaInformada, confirmarConflito, tokenConfirmacao } = req.body || {};

    if (!imagemBase64 && !placaInformada && !tokenConfirmacao) {
      return res.status(400).json({ error: 'Envie a foto em base64, a placa ou o token de confirmação.' });
    }

    let resultado = null;
    const saveRes = await mutateTenantState(req, async (draft) => {
      resultado = await vehicleReconciliation.conciliarVeiculoOS({
        osId,
        placaInformada,
        imagemBase64,
        confirmarConflito: Boolean(confirmarConflito),
        tokenConfirmacao,
        state: draft,
        aiClient: ai,
        context: req.securityContext
      });

      if (!resultado.ok || resultado.conflito) {
        return { abort: true, resultado };
      }
    });

    if (saveRes?.aborted && saveRes?.mutatorResult?.resultado) {
      const r = saveRes.mutatorResult.resultado;
      if (!r.ok) return res.status(422).json(r);
      if (r.conflito) return res.status(409).json(r);
    }

    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({
        success: false,
        error: saveRes?.error || 'Falha ao conciliar veículo e anexar foto.'
      });
    }

    res.json({
      success: true,
      ...resultado,
      novoEstado: { versao: saveRes.versao }
    });
  } catch (err) {
    console.error('[API /api/os/:id/anexar-foto] Erro:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/veiculos/conciliar', async (req, res) => {
  try {
    const { osId, imagemBase64, placaInformada, confirmarConflito, tokenConfirmacao } = req.body || {};
    if (!osId && !tokenConfirmacao) {
      return res.status(400).json({ error: 'Identificador da OS ou token de confirmação é obrigatório.' });
    }

    let resultado = null;
    const saveRes = await mutateTenantState(req, async (draft) => {
      resultado = await vehicleReconciliation.conciliarVeiculoOS({
        osId,
        placaInformada,
        imagemBase64,
        confirmarConflito: Boolean(confirmarConflito),
        tokenConfirmacao,
        state: draft,
        aiClient: ai,
        context: req.securityContext
      });

      if (!resultado.ok || resultado.conflito) {
        return { abort: true, resultado };
      }
    });

    if (saveRes?.aborted && saveRes?.mutatorResult?.resultado) {
      const r = saveRes.mutatorResult.resultado;
      if (!r.ok) return res.status(422).json(r);
      if (r.conflito) return res.status(409).json(r);
    }

    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({
        success: false,
        error: saveRes?.error || 'Falha ao conciliar veículo.'
      });
    }

    res.json({
      success: true,
      ...resultado,
      novoEstado: { versao: saveRes.versao }
    });
  } catch (err) {
    console.error('[API /api/veiculos/conciliar] Erro:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/os/entrada', async (req, res) => {
  try {
    const { placa, clienteNome, clienteFone, textoOriginal, servicos } = req.body || {};
    const resultado = await processarEntradaVeiculo({
      placa,
      clienteNome,
      clienteFone,
      textoOriginal,
      servicos,
      req
    });
    res.json({
      success: true,
      pendenteConfirmacao: Boolean(resultado.pendenteConfirmacao),
      os: resultado.novaOS,
      preOS: resultado.preOS,
      preOSId: resultado.preOS?.id || null,
      token: resultado.token,
      veiculo: resultado.veiculo,
      box: resultado.boxLivre,
      resposta: resultado.respostaWhatsApp
    });
  } catch (err) {
    console.error('[API /api/os/entrada] Erro:', err);
    res.status(500).json({ error: err.message });
  }
});

/* ── Gestão de Pré-Ordem de Serviço (Pré-OS) ────────────────── */
app.post('/api/pre-os/triagem', async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    const { vehicleId, placa, clienteId, motorista, kmAtual, reclamacao, origem } = req.body || {};
    let resultado = null;
    const saveRes = await mutateTenantState(req, (draft) => {
      resultado = preOSEngine.triagemEntrada({
        tenantId,
        vehicleId,
        placa,
        clienteId,
        motorista,
        kmAtual,
        reclamacao,
        origem: origem || 'web',
        actorId: req.securityContext?.actorId || 'operador',
        state: draft
      });
    });
    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({
        success: false,
        error: saveRes?.error || 'Falha ao realizar triagem de Pré-OS.'
      });
    }
    res.json({
      success: true,
      ...resultado,
      novoEstado: { versao: saveRes.versao }
    });
  } catch (err) {
    console.error('[API /api/pre-os/triagem] Erro:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/pre-os', async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const tenantId = extractTenantId(req);
    const { status, placa } = req.query || {};
    const lista = preOSEngine.listarPreOS({ tenantId, state, status, placa });
    res.json({
      success: true,
      total: lista.length,
      preOS: lista
    });
  } catch (err) {
    console.error('[API /api/pre-os GET] Erro:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/pre-os/:id', async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const tenantId = extractTenantId(req);
    const preOS = preOSEngine.consultarPreOS({ tenantId, preOSId: req.params.id, state });
    if (!preOS) {
      return res.status(404).json({ error: 'Pré-OS não encontrada.' });
    }
    res.json({
      success: true,
      preOS
    });
  } catch (err) {
    console.error('[API /api/pre-os/:id GET] Erro:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/pre-os/:id/converter', async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    const { boxId, mecanico } = req.body || {};
    let resultado = null;
    const saveRes = await mutateTenantState(req, (draft) => {
      resultado = preOSEngine.converterEmOS({
        tenantId,
        preOSId: req.params.id,
        state: draft,
        actorId: req.securityContext?.actorId || 'operador',
        boxId,
        mecanico
      });
      if (!resultado.ok) {
        return { abort: true, resultado };
      }
    });
    if (saveRes?.aborted && saveRes?.mutatorResult?.resultado) {
      const r = saveRes.mutatorResult.resultado;
      return res.status(r.status || 400).json(r);
    }
    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({
        success: false,
        error: saveRes?.error || 'Falha ao converter Pré-OS em OS.'
      });
    }
    res.json({
      success: true,
      ...resultado,
      novoEstado: { versao: saveRes.versao }
    });
  } catch (err) {
    console.error('[API /api/pre-os/:id/converter] Erro:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/pre-os/:id/cancelar', async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    const { motivo } = req.body || {};
    let resultado = null;
    const saveRes = await mutateTenantState(req, (draft) => {
      resultado = preOSEngine.cancelarPreOS({
        tenantId,
        preOSId: req.params.id,
        motivo,
        state: draft,
        actorId: req.securityContext?.actorId || 'operador'
      });
      if (!resultado.ok) {
        return { abort: true, resultado };
      }
    });
    if (saveRes?.aborted && saveRes?.mutatorResult?.resultado) {
      const r = saveRes.mutatorResult.resultado;
      return res.status(r.status || 400).json(r);
    }
    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({
        success: false,
        error: saveRes?.error || 'Falha ao cancelar Pré-OS.'
      });
    }
    res.json({
      success: true,
      ...resultado,
      novoEstado: { versao: saveRes.versao }
    });
  } catch (err) {
    console.error('[API /api/pre-os/:id/cancelar] Erro:', err);
    res.status(500).json({ error: err.message });
  }
});

/* ── Gestão de Recepção Técnica Conversacional (Technical Intake) ── */
app.post('/api/intake/iniciar', async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    const { vehicleId, placa, clienteId, kmAtual, reclamacao, channel } = req.body || {};
    let resultado = null;
    const saveRes = await mutateTenantState(req, (draft) => {
      resultado = technicalIntakeEngine.iniciarIntake({
        tenantId,
        actorId: req.securityContext?.actorId || 'operador',
        channel: channel || 'web',
        vehicleId,
        placa,
        clienteId,
        kmAtual,
        reclamacao,
        state: draft
      });
    });
    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({
        success: false,
        error: saveRes?.error || 'Falha ao iniciar intake.'
      });
    }
    res.json({
      success: true,
      ...resultado,
      novoEstado: { versao: saveRes.versao }
    });
  } catch (err) {
    console.error('[API /api/intake/iniciar] Erro:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/intake/mensagem', async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    const { texto, placa, vehicleId, channel, sessionId } = req.body || {};
    let resultado = null;
    const saveRes = await mutateTenantState(req, async (draft) => {
      resultado = await technicalIntakeEngine.processarMensagem({
        tenantId,
        actorId: req.securityContext?.actorId || 'operador',
        channel: channel || 'web',
        texto,
        placa,
        vehicleId,
        state: draft,
        context: { sessionId }
      });
    });
    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({
        success: false,
        error: saveRes?.error || 'Falha ao processar mensagem de intake.'
      });
    }
    res.json({
      success: true,
      ...resultado,
      novoEstado: { versao: saveRes.versao }
    });
  } catch (err) {
    console.error('[API /api/intake/mensagem] Erro:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/intake/sessao/:id', async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const tenantId = extractTenantId(req);
    const sessoes = Array.isArray(state.intakeSessions) ? state.intakeSessions : [];
    const sessao = sessoes.find(s => s.id === req.params.id && s.tenantId === tenantId);
    if (!sessao) {
      return res.status(404).json({ error: 'Sessão de intake não encontrada.' });
    }
    res.json({
      success: true,
      session: sessao
    });
  } catch (err) {
    console.error('[API /api/intake/sessao/:id GET] Erro:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/intake/sessao/:id/resposta', async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    const { resposta } = req.body || {};
    let resultado = null;
    const saveRes = await mutateTenantState(req, (draft) => {
      resultado = technicalIntakeEngine.responderPergunta({
        tenantId,
        sessionId: req.params.id,
        resposta,
        state: draft,
        actorId: req.securityContext?.actorId || 'operador'
      });
      if (!resultado.ok) {
        return { abort: true, resultado };
      }
    });
    if (saveRes?.aborted && saveRes?.mutatorResult?.resultado) {
      const r = saveRes.mutatorResult.resultado;
      return res.status(r.status || 400).json(r);
    }
    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({
        success: false,
        error: saveRes?.error || 'Falha ao responder pergunta de intake.'
      });
    }
    res.json({
      success: true,
      ...resultado,
      novoEstado: { versao: saveRes.versao }
    });
  } catch (err) {
    console.error('[API /api/intake/sessao/:id/resposta] Erro:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/intake/sessao/:id/corrigir', async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    const { campo, valor } = req.body || {};
    let resultado = null;
    const saveRes = await mutateTenantState(req, (draft) => {
      resultado = technicalIntakeEngine.corrigirCampo({
        tenantId,
        sessionId: req.params.id,
        campo,
        valor,
        state: draft,
        actorId: req.securityContext?.actorId || 'operador'
      });
      if (!resultado.ok) {
        return { abort: true, resultado };
      }
    });
    if (saveRes?.aborted && saveRes?.mutatorResult?.resultado) {
      const r = saveRes.mutatorResult.resultado;
      return res.status(r.status || 400).json(r);
    }
    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({
        success: false,
        error: saveRes?.error || 'Falha ao corrigir campo de intake.'
      });
    }
    res.json({
      success: true,
      ...resultado,
      novoEstado: { versao: saveRes.versao }
    });
  } catch (err) {
    console.error('[API /api/intake/sessao/:id/corrigir] Erro:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/intake/sessao/:id/confirmar', async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    const { boxId, mecanico, confirmToken } = req.body || {};
    let resultado = null;
    const saveRes = await mutateTenantState(req, (draft) => {
      resultado = technicalIntakeEngine.confirmarIntake({
        tenantId,
        sessionId: req.params.id,
        state: draft,
        actorId: req.securityContext?.actorId || 'operador',
        boxId,
        mecanico,
        confirmToken
      });
      if (!resultado.ok) {
        return { abort: true, resultado };
      }
    });
    if (saveRes?.aborted && saveRes?.mutatorResult?.resultado) {
      const r = saveRes.mutatorResult.resultado;
      return res.status(r.status || 400).json(r);
    }
    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({
        success: false,
        error: saveRes?.error || 'Falha ao confirmar intake.'
      });
    }
    res.json({
      success: true,
      ...resultado,
      novoEstado: { versao: saveRes.versao }
    });
  } catch (err) {
    console.error('[API /api/intake/sessao/:id/confirmar] Erro:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/intake/sessao/:id/cancelar', async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    const { motivo } = req.body || {};
    let resultado = null;
    const saveRes = await mutateTenantState(req, (draft) => {
      resultado = technicalIntakeEngine.cancelarIntake({
        tenantId,
        sessionId: req.params.id,
        motivo,
        state: draft,
        actorId: req.securityContext?.actorId || 'operador'
      });
      if (!resultado.ok) {
        return { abort: true, resultado };
      }
    });
    if (saveRes?.aborted && saveRes?.mutatorResult?.resultado) {
      const r = saveRes.mutatorResult.resultado;
      return res.status(r.status || 400).json(r);
    }
    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({
        success: false,
        error: saveRes?.error || 'Falha ao cancelar intake.'
      });
    }
    res.json({
      success: true,
      ...resultado,
      novoEstado: { versao: saveRes.versao }
    });
  } catch (err) {
    console.error('[API /api/intake/sessao/:id/cancelar] Erro:', err);
    res.status(500).json({ error: err.message });
  }
});

/* ── Inspeção Técnica e Diagnóstico Físico Humano ─────────── */
app.get('/api/inspecoes', requirePermission('inspection:read'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const tenantId = extractTenantId(req);
    const { osId, vehicleId, placa, status } = req.query || {};
    const lista = inspectionService.listarInspecoes({ tenantId, state, osId, vehicleId, placa, status });
    res.json({
      success: true,
      total: lista.length,
      inspecoes: lista
    });
  } catch (err) {
    console.error('[API /api/inspecoes GET] Erro:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/inspecoes/:id', requirePermission('inspection:read'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const tenantId = extractTenantId(req);
    const inspecao = inspectionService.obterInspecao({ tenantId, state, inspectionId: req.params.id });
    if (!inspecao) {
      return res.status(404).json({ error: 'Inspeção não encontrada.' });
    }
    res.json({
      success: true,
      inspecao
    });
  } catch (err) {
    console.error('[API /api/inspecoes/:id GET] Erro:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/inspecoes', requirePermission('inspection:write'), async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    const { preOSId, osId, vehicleId, placa, clienteId, mechanicId, mecanico, reclamacaoCliente } = req.body || {};
    let resultado = null;
    const saveRes = await mutateTenantState(req, (draft) => {
      resultado = inspectionService.criarInspecao({
        tenantId,
        state: draft,
        preOSId,
        osId,
        vehicleId,
        placa,
        clienteId,
        mechanicId,
        mecanico,
        reclamacaoCliente,
        actorId: req.securityContext?.actorId || 'operador'
      });
    });
    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({
        success: false,
        error: saveRes?.error || 'Falha ao criar inspeção.'
      });
    }
    res.json({
      success: true,
      ...resultado,
      novoEstado: { versao: saveRes.versao }
    });
  } catch (err) {
    console.error('[API /api/inspecoes POST] Erro:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/inspecoes/:id/itens', requirePermission('inspection:write'), async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    const item = req.body || {};
    let resultado = null;
    const saveRes = await mutateTenantState(req, (draft) => {
      resultado = inspectionService.adicionarItemInspecao({
        tenantId,
        state: draft,
        inspectionId: req.params.id,
        item,
        actorId: req.securityContext?.actorId || 'operador'
      });
      if (!resultado.ok) {
        return { abort: true, resultado };
      }
    });
    if (saveRes?.aborted && saveRes?.mutatorResult?.resultado) {
      const r = saveRes.mutatorResult.resultado;
      return res.status(r.status || 400).json(r);
    }
    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({
        success: false,
        error: saveRes?.error || 'Falha ao adicionar item na inspeção.'
      });
    }
    res.json({
      success: true,
      ...resultado,
      novoEstado: { versao: saveRes.versao }
    });
  } catch (err) {
    console.error('[API /api/inspecoes/:id/itens] Erro:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/inspecoes/:id/itens/:itemId/diagnostico', requirePermission('inspection:write'), async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    const { diagnosticoConfirmado, confirmedBy } = req.body || {};
    let resultado = null;
    const saveRes = await mutateTenantState(req, (draft) => {
      resultado = inspectionService.confirmarDiagnosticoHumano({
        tenantId,
        state: draft,
        inspectionId: req.params.id,
        itemId: req.params.itemId,
        diagnosticoConfirmado,
        confirmedBy,
        actorId: req.securityContext?.actorId || 'mecanico'
      });
      if (!resultado.ok) {
        return { abort: true, resultado };
      }
    });
    if (saveRes?.aborted && saveRes?.mutatorResult?.resultado) {
      const r = saveRes.mutatorResult.resultado;
      return res.status(r.status || 422).json(r);
    }
    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({
        success: false,
        error: saveRes?.error || 'Falha ao confirmar diagnóstico da inspeção.'
      });
    }
    res.json({
      success: true,
      ...resultado,
      novoEstado: { versao: saveRes.versao }
    });
  } catch (err) {
    console.error('[API /api/inspecoes/:id/itens/:itemId/diagnostico] Erro:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/inspecoes/:id/itens/:itemId/fotos', requirePermission('inspection:write'), async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    const { fotoBase64, url, descricao } = req.body || {};
    let resultado = null;
    const saveRes = await mutateTenantState(req, (draft) => {
      resultado = inspectionService.adicionarFotoItem({
        tenantId,
        state: draft,
        inspectionId: req.params.id,
        itemId: req.params.itemId,
        fotoBase64,
        url,
        descricao,
        actorId: req.securityContext?.actorId || 'operador'
      });
      if (!resultado.ok) {
        return { abort: true, resultado };
      }
    });
    if (saveRes?.aborted && saveRes?.mutatorResult?.resultado) {
      const r = saveRes.mutatorResult.resultado;
      return res.status(r.status || 400).json(r);
    }
    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({
        success: false,
        error: saveRes?.error || 'Falha ao adicionar foto ao item.'
      });
    }
    res.json({
      success: true,
      ...resultado,
      novoEstado: { versao: saveRes.versao }
    });
  } catch (err) {
    console.error('[API /api/inspecoes/:id/itens/:itemId/fotos] Erro:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/inspecoes/:id/itens/:itemId/servicos', requirePermission('inspection:write'), async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    const servico = req.body || {};
    let resultado = null;
    const saveRes = await mutateTenantState(req, (draft) => {
      resultado = inspectionService.adicionarServicoRecomendado({
        tenantId,
        state: draft,
        inspectionId: req.params.id,
        itemId: req.params.itemId,
        servico,
        actorId: req.securityContext?.actorId || 'operador'
      });
      if (!resultado.ok) {
        return { abort: true, resultado };
      }
    });
    if (saveRes?.aborted && saveRes?.mutatorResult?.resultado) {
      const r = saveRes.mutatorResult.resultado;
      return res.status(r.status || 400).json(r);
    }
    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({
        success: false,
        error: saveRes?.error || 'Falha ao adicionar serviço recomendado.'
      });
    }
    res.json({
      success: true,
      ...resultado,
      novoEstado: { versao: saveRes.versao }
    });
  } catch (err) {
    console.error('[API /api/inspecoes/:id/itens/:itemId/servicos] Erro:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/inspecoes/:id/concluir', requirePermission('inspection:write'), async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    const { laudoGeral } = req.body || {};
    let resultado = null;
    const saveRes = await mutateTenantState(req, (draft) => {
      resultado = inspectionService.concluirInspecao({
        tenantId,
        state: draft,
        inspectionId: req.params.id,
        laudoGeral,
        actorId: req.securityContext?.actorId || 'operador'
      });
      if (!resultado.ok) {
        return { abort: true, resultado };
      }
    });
    if (saveRes?.aborted && saveRes?.mutatorResult?.resultado) {
      const r = saveRes.mutatorResult.resultado;
      return res.status(r.status || 400).json(r);
    }
    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({
        success: false,
        error: saveRes?.error || 'Falha ao concluir inspeção.'
      });
    }
    res.json({
      success: true,
      ...resultado,
      novoEstado: { versao: saveRes.versao }
    });
  } catch (err) {
    console.error('[API /api/inspecoes/:id/concluir] Erro:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/inspecoes/:id/cancelar', requirePermission('inspection:write'), async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    const { motivo } = req.body || {};
    let resultado = null;
    const saveRes = await mutateTenantState(req, (draft) => {
      resultado = inspectionService.cancelarInspecao({
        tenantId,
        state: draft,
        inspectionId: req.params.id,
        motivo,
        actorId: req.securityContext?.actorId || 'operador'
      });
      if (!resultado.ok) {
        return { abort: true, resultado };
      }
    });
    if (saveRes?.aborted && saveRes?.mutatorResult?.resultado) {
      const r = saveRes.mutatorResult.resultado;
      return res.status(r.status || 400).json(r);
    }
    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({
        success: false,
        error: saveRes?.error || 'Falha ao cancelar inspeção.'
      });
    }
    res.json({
      success: true,
      ...resultado,
      novoEstado: { versao: saveRes.versao }
    });
  } catch (err) {
    console.error('[API /api/inspecoes/:id/cancelar] Erro:', err);
    res.status(500).json({ error: err.message });
  }
});

/* ── Gestão Comercial de Orçamentos e Versionamento ────────── */
app.get('/api/orcamentos', requirePermission('quotation:read'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const tenantId = extractTenantId(req);
    const { osId, status, placa } = req.query || {};
    const lista = quotationService.listarOrcamentos({ tenantId, state, osId, status, placa });
    res.json({
      success: true,
      total: lista.length,
      orcamentos: lista
    });
  } catch (err) {
    console.error('[API /api/orcamentos GET] Erro:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/orcamentos/:id', requirePermission('quotation:read'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const tenantId = extractTenantId(req);
    const orcamento = quotationService.obterOrcamento({ tenantId, state, quotationId: req.params.id });
    if (!orcamento) {
      return res.status(404).json({ error: 'Orçamento não encontrado.' });
    }
    res.json({
      success: true,
      orcamento
    });
  } catch (err) {
    console.error('[API /api/orcamentos/:id GET] Erro:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/orcamentos', requirePermission('quotation:write'), async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    const { osId, inspectionId, items, descontoGeral, validadeHoras, adicional, parentQuotationId, motivoAdicional } = req.body || {};
    let resultado = null;
    const saveRes = await mutateTenantState(req, (draft) => {
      resultado = quotationService.criarOrcamento({
        tenantId,
        state: draft,
        osId,
        inspectionId,
        items,
        descontoGeral,
        validadeHoras,
        adicional,
        parentQuotationId,
        motivoAdicional,
        actorId: req.securityContext?.actorId || 'operador'
      });
    });
    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({
        success: false,
        error: saveRes?.error || 'Falha ao criar orçamento.'
      });
    }
    res.json({
      success: true,
      ...resultado,
      novoEstado: { versao: saveRes.versao }
    });
  } catch (err) {
    console.error('[API /api/orcamentos POST] Erro:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/orcamentos/:id/nova-versao', requirePermission('quotation:write'), async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    const { novosItens, descontoGeral, motivo } = req.body || {};
    let resultado = null;
    const saveRes = await mutateTenantState(req, (draft) => {
      resultado = quotationService.criarNovaVersao({
        tenantId,
        state: draft,
        quotationId: req.params.id,
        novosItens,
        descontoGeral,
        motivo,
        actorId: req.securityContext?.actorId || 'operador'
      });
      if (!resultado.ok) {
        return { abort: true, resultado };
      }
    });
    if (saveRes?.aborted && saveRes?.mutatorResult?.resultado) {
      const r = saveRes.mutatorResult.resultado;
      return res.status(r.status || 400).json(r);
    }
    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({
        success: false,
        error: saveRes?.error || 'Falha ao criar nova versão de orçamento.'
      });
    }
    res.json({
      success: true,
      ...resultado,
      novoEstado: { versao: saveRes.versao }
    });
  } catch (err) {
    console.error('[API /api/orcamentos/:id/nova-versao] Erro:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/orcamentos/:id/adicional', requirePermission('quotation:write'), async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    const { items, motivo } = req.body || {};
    let resultado = null;
    const saveRes = await mutateTenantState(req, (draft) => {
      const orcAtual = quotationService.obterOrcamento({ tenantId, state: draft, quotationId: req.params.id });
      if (!orcAtual) {
        return { abort: true, notFound: true };
      }
      resultado = quotationService.criarAdicionalEscopo({
        tenantId,
        state: draft,
        osId: orcAtual.osId,
        parentQuotationId: orcAtual.id,
        items,
        motivo,
        actorId: req.securityContext?.actorId || 'operador'
      });
    });
    if (saveRes?.aborted && saveRes?.mutatorResult?.notFound) {
      return res.status(404).json({ error: 'Orçamento pai não encontrado.' });
    }
    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({
        success: false,
        error: saveRes?.error || 'Falha ao criar adicional de escopo.'
      });
    }
    res.json({
      success: true,
      ...resultado,
      novoEstado: { versao: saveRes.versao }
    });
  } catch (err) {
    console.error('[API /api/orcamentos/:id/adicional] Erro:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/orcamentos/:id/enviar', requirePermission('quotation:send'), async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    const { canal, validadeHoras } = req.body || {};
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    let resultado = null;
    const saveRes = await mutateTenantState(req, (draft) => {
      resultado = quotationService.enviarOrcamento({
        tenantId,
        state: draft,
        quotationId: req.params.id,
        canal: canal || 'link',
        validadeHoras,
        baseUrl,
        actorId: req.securityContext?.actorId || 'operador'
      });
      if (!resultado.ok) {
        return { abort: true, resultado };
      }
    });
    if (saveRes?.aborted && saveRes?.mutatorResult?.resultado) {
      const r = saveRes.mutatorResult.resultado;
      return res.status(r.status || 400).json(r);
    }
    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({
        success: false,
        error: saveRes?.error || 'Falha ao enviar orçamento.'
      });
    }
    res.json({
      success: true,
      ...resultado,
      novoEstado: { versao: saveRes.versao }
    });
  } catch (err) {
    console.error('[API /api/orcamentos/:id/enviar] Erro:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/orcamentos/:id/imprimir', requirePermission('quotation:read'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const tenantId = extractTenantId(req);
    const orcamento = quotationService.obterOrcamento({ tenantId, state, quotationId: req.params.id });
    if (!orcamento) {
      return res.status(404).json({ error: 'Orçamento não encontrado.' });
    }
    const os = (state.os || []).find(o => o.id === orcamento.osId);
    res.json({
      success: true,
      orcamento,
      os,
      empresa: state.cfg?.empresa || 'Oficina Mecânica'
    });
  } catch (err) {
    console.error('[API /api/orcamentos/:id/imprimir] Erro:', err);
    res.status(500).json({ error: err.message });
  }
});


/* ── Rotas de Peças, Almoxarifado e Estoque ─────────────────── */
app.get('/api/pecas', requirePermission('inventory:read'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const tenantId = extractTenantId(req);
    let pecas = inventoryService.buscarPecas({ tenantId, state, query: req.query.q || '' });
    const canReadFinancial = req.securityContext?.permissions?.includes('financial:read') || ['admin', 'tenant_admin', 'financeiro'].includes(req.securityContext?.role);
    if (!canReadFinancial && Array.isArray(pecas)) {
      pecas = pecas.map(p => {
        const cp = { ...p };
        delete cp.custo;
        delete cp.venda;
        delete cp.margem;
        delete cp.preco;
        delete cp.valor;
        delete cp.precoVenda;
        delete cp.custoMedio;
        return cp;
      });
    }
    res.json({ success: true, pecas });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/pecas', requirePermission('inventory:write'), async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    let resultado = null;
    const saveRes = await mutateTenantState(req, (draft) => {
      resultado = inventoryService.cadastrarPeca({
        tenantId,
        state: draft,
        partData: req.body,
        actorId: req.securityContext?.actorId || 'operador'
      });
    });
    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({
        success: false,
        error: saveRes?.error || 'Falha ao persistir peça.'
      });
    }
    res.json({ success: true, ...resultado });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/pecas/:id', requirePermission('inventory:read'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const tenantId = extractTenantId(req);
    let peca = inventoryService.obterPeca({ tenantId, state, partId: req.params.id });
    if (!peca) return res.status(404).json({ error: 'Peça não encontrada.' });
    const canReadFinancial = req.securityContext?.permissions?.includes('financial:read') || ['admin', 'tenant_admin', 'financeiro'].includes(req.securityContext?.role);
    if (!canReadFinancial && peca && typeof peca === 'object') {
      peca = { ...peca };
      delete peca.custo;
      delete peca.venda;
      delete peca.margem;
      delete peca.preco;
      delete peca.valor;
      delete peca.precoVenda;
      delete peca.custoMedio;
    }
    res.json({ success: true, peca });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/pecas/:id/saldos', requirePermission('inventory:read'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const tenantId = extractTenantId(req);
    const peca = inventoryService.obterPeca({ tenantId, state, partId: req.params.id });
    if (!peca) return res.status(404).json({ error: 'Peça não encontrada.' });
    const saldos = inventoryService.calcularSaldos({ tenantId, state, partId: req.params.id });
    res.json({ success: true, saldos, peca });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/pecas/:id', requirePermission('inventory:write'), async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    let resultado = null;
    const saveRes = await mutateTenantState(req, (draft) => {
      resultado = inventoryService.atualizarPeca({
        tenantId,
        state: draft,
        partId: req.params.id,
        partData: req.body,
        actorId: req.securityContext?.actorId || 'operador'
      });
    });
    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({
        success: false,
        error: saveRes?.error || 'Falha ao persistir atualização da peça.'
      });
    }
    res.json({ success: true, ...resultado });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/pecas/:id/movimentacoes', requirePermission('inventory:read'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const tenantId = extractTenantId(req);
    const movs = (state.inventoryMovements || []).filter(m => m.tenantId === tenantId && m.partId === req.params.id);
    res.json({ success: true, movements: movs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/pecas/:id/ajustar', requirePermission('inventory:adjust'), async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    let resultado = null;
    const saveRes = await mutateTenantState(req, (draft) => {
      resultado = inventoryService.ajustarEstoque({
        tenantId,
        state: draft,
        partId: req.params.id,
        novaQuantidade: req.body.novaQuantidade,
        reason: req.body.motivo,
        actorId: req.securityContext?.actorId || 'gerente'
      });
    });
    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({
        success: false,
        error: saveRes?.error || 'Falha ao persistir ajuste de estoque.'
      });
    }
    res.json({ success: true, ...resultado });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/* ── Rotas de Fornecedores ─────────────────────────────────── */
app.get('/api/fornecedores', requirePermission('supplier:read'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const tenantId = extractTenantId(req);
    const fornecedores = supplierService.listarFornecedores({ tenantId, state, query: req.query.q || '' });
    res.json({ success: true, fornecedores });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/fornecedores', requirePermission('supplier:write'), async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    let resultado = null;
    const saveRes = await mutateTenantState(req, (draft) => {
      resultado = supplierService.cadastrarFornecedor({
        tenantId,
        state: draft,
        supplierData: req.body,
        actorId: req.securityContext?.actorId || 'operador'
      });
    });
    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({
        success: false,
        error: saveRes?.error || 'Falha ao persistir fornecedor.'
      });
    }
    res.json({ success: true, ...resultado });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/fornecedores/:id', requirePermission('supplier:read'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const tenantId = extractTenantId(req);
    const fornecedor = supplierService.obterFornecedor({ tenantId, state, supplierId: req.params.id });
    if (!fornecedor) return res.status(404).json({ error: 'Fornecedor não encontrado.' });
    const desempenho = supplierService.calcularDesempenhoFornecedor({ tenantId, state, supplierId: req.params.id });
    res.json({ success: true, fornecedor, desempenho });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/fornecedores/:id', requirePermission('supplier:write'), async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    let resultado = null;
    const saveRes = await mutateTenantState(req, (draft) => {
      resultado = supplierService.atualizarFornecedor({
        tenantId,
        state: draft,
        supplierId: req.params.id,
        supplierData: req.body,
        actorId: req.securityContext?.actorId || 'operador'
      });
    });
    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({
        success: false,
        error: saveRes?.error || 'Falha ao persistir alteração do fornecedor.'
      });
    }
    res.json({ success: true, ...resultado });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/* ── Rotas de Compras, Cotações e Pedidos (Procurement) ─────── */
app.get('/api/compras/necessidades', requirePermission('purchase:read'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const tenantId = extractTenantId(req);
    const necessidades = procurementService.listarNecessidadesCompra({
      tenantId,
      state,
      status: req.query.status,
      osId: req.query.osId
    });
    res.json({ success: true, necessidades });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/compras/cotacoes', requirePermission('purchase:write'), async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    let resultado = null;
    const saveRes = await mutateTenantState(req, (draft) => {
      resultado = procurementService.criarCotacao({
        tenantId,
        state: draft,
        requirementIds: req.body.requirementIds,
        supplierIds: req.body.supplierIds,
        observacoes: req.body.observacoes,
        actorId: req.securityContext?.actorId || 'comprador'
      });
    });
    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({
        success: false,
        error: saveRes?.error || 'Falha ao persistir cotação.'
      });
    }
    res.json({ success: true, ...resultado });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/compras/cotacoes/:id/respostas', requirePermission('purchase:write'), async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    let resultado = null;
    const saveRes = await mutateTenantState(req, (draft) => {
      resultado = procurementService.registrarRespostaFornecedor({
        tenantId,
        state: draft,
        quoteId: req.params.id,
        supplierId: req.body.supplierId,
        items: req.body.items,
        freight: req.body.freight,
        paymentTerms: req.body.paymentTerms,
        validUntil: req.body.validUntil,
        actorId: req.securityContext?.actorId || 'comprador'
      });
    });
    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({
        success: false,
        error: saveRes?.error || 'Falha ao persistir resposta da cotação.'
      });
    }
    res.json({ success: true, ...resultado });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/compras/cotacoes/:id/comparar', requirePermission('purchase:read'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const tenantId = extractTenantId(req);
    const comparativo = procurementService.compararCotacoes({
      tenantId,
      state,
      quoteId: req.params.id,
      osId: req.query.osId
    });
    res.json({ success: true, ...comparativo });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/compras/pedidos', requirePermission('purchase:read'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const tenantId = extractTenantId(req);
    const pedidos = (state.purchaseOrders || []).filter(p => p.tenantId === tenantId);
    res.json({ success: true, pedidos });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/compras/pedidos', requirePermission('purchase:write'), async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    let resultado = null;
    const saveRes = await mutateTenantState(req, (draft) => {
      resultado = procurementService.criarPedidoCompra({
        tenantId,
        state: draft,
        supplierId: req.body.supplierId,
        items: req.body.items,
        quoteId: req.body.quoteId,
        freight: req.body.freight,
        paymentTerms: req.body.paymentTerms,
        expectedAt: req.body.expectedAt,
        observacoes: req.body.observacoes,
        actorId: req.securityContext?.actorId || 'comprador'
      });
    });
    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({
        success: false,
        error: saveRes?.error || 'Falha ao persistir pedido de compra.'
      });
    }
    res.json({ success: true, ...resultado });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/compras/pedidos/:id/aprovar', requirePermission('purchase:approve'), async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    let resultado = null;
    const saveRes = await mutateTenantState(req, (draft) => {
      resultado = procurementService.aprovarPedidoCompra({
        tenantId,
        state: draft,
        orderId: req.params.id,
        actorId: req.securityContext?.actorId || 'gerente',
        userPermissions: req.securityContext?.permissions || []
      });
    });
    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({
        success: false,
        error: saveRes?.error || 'Falha ao aprovar pedido de compra.'
      });
    }
    res.json({ success: true, ...resultado });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/compras/pedidos/:id/receber', requirePermission('purchase:write'), async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    let resultado = null;
    const saveRes = await mutateTenantState(req, (draft) => {
      resultado = procurementService.receberPedidoCompra({
        tenantId,
        state: draft,
        orderId: req.params.id,
        itensRecebidos: req.body.itensRecebidos,
        nfNumero: req.body.nfNumero,
        actorId: req.securityContext?.actorId || 'almoxarife'
      });
    });
    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({
        success: false,
        error: saveRes?.error || 'Falha ao receber pedido de compra.'
      });
    }
    res.json({ success: true, ...resultado });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/compras/pedidos/:id/cancelar', requirePermission('purchase:write'), async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    let resultado = null;
    const saveRes = await mutateTenantState(req, (draft) => {
      resultado = procurementService.cancelarPedidoCompra({
        tenantId,
        state: draft,
        orderId: req.params.id,
        reason: req.body.motivo,
        actorId: req.securityContext?.actorId || 'gerente'
      });
    });
    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({
        success: false,
        error: saveRes?.error || 'Falha ao cancelar pedido de compra.'
      });
    }
    res.json({ success: true, ...resultado });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/* ── Consumo e Devolução de Peça na OS pelo Mecânico ────────── */
app.post('/api/os/:id/pecas/consumir', requirePermission('os:write'), async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    let resultado = null;
    const saveRes = await mutateTenantState(req, (draft) => {
      resultado = inventoryService.consumirPecaOS({
        tenantId,
        state: draft,
        osId: req.params.id,
        partId: req.body.partId,
        quantity: req.body.quantidade,
        mechanicId: req.body.mecanicoId || req.securityContext?.actorId,
        actorId: req.securityContext?.actorId || 'mecanico'
      });
    });
    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({
        success: false,
        error: saveRes?.error || 'Falha ao persistir consumo de peça na OS.'
      });
    }
    res.json({ success: true, ...resultado });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/os/:id/pecas/devolver', requirePermission('os:write'), async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    let resultado = null;
    const saveRes = await mutateTenantState(req, (draft) => {
      resultado = inventoryService.devolverPecaOS({
        tenantId,
        state: draft,
        osId: req.params.id,
        partId: req.body.partId,
        quantity: req.body.quantidade,
        reason: req.body.motivo,
        actorId: req.securityContext?.actorId || 'mecanico'
      });
    });
    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({
        success: false,
        error: saveRes?.error || 'Falha ao persistir devolução de peça da OS.'
      });
    }
    res.json({ success: true, ...resultado });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/* ── Equipe, Colaboradores & Mecânicos ───────────────────────── */
app.get('/api/equipe', requirePermission('labor:read', 'labor:write'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const tenantId = extractTenantId(req);
    const perms = req.securityContext?.permissions || [];
    const colaboradores = laborTrackingService.listarColaboradores({
      tenantId,
      state,
      incluirInativos: req.query.inativos === 'true',
      userPermissions: perms
    });
    res.json({ success: true, colaboradores });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/equipe/agora', requirePermission('labor:read', 'productivity:read', 'operation:read'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const tenantId = extractTenantId(req);
    const agora = req.query.agora ? new Date(req.query.agora) : new Date();
    const equipe = productivityService.obterEquipeAgora({ tenantId, state, agora });
    res.json({ success: true, equipe });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/equipe', requirePermission('labor:write', 'productivity:manage'), async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    let resultado = null;
    const saveRes = await mutateTenantState(req, (draft) => {
      resultado = laborTrackingService.cadastrarColaborador({
        tenantId,
        state: draft,
        workerData: req.body,
        actorId: req.securityContext?.actorId || 'gerente'
      });
    });
    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({
        success: false,
        error: saveRes?.error || 'Falha ao persistir colaborador.'
      });
    }
    res.json({ success: true, ...resultado });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/equipe/:id', requirePermission('labor:read', 'labor:write'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const tenantId = extractTenantId(req);
    const perms = req.securityContext?.permissions || [];
    const colaborador = laborTrackingService.obterColaborador({
      tenantId,
      state,
      workerId: req.params.id,
      userPermissions: perms
    });
    if (!colaborador) return res.status(404).json({ error: 'Colaborador não encontrado.' });
    res.json({ success: true, colaborador });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/equipe/:id', requirePermission('labor:write', 'productivity:manage'), async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    let resultado = null;
    const saveRes = await mutateTenantState(req, (draft) => {
      resultado = laborTrackingService.atualizarColaborador({
        tenantId,
        state: draft,
        workerId: req.params.id,
        workerData: req.body,
        actorId: req.securityContext?.actorId || 'gerente'
      });
    });
    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({
        success: false,
        error: saveRes?.error || 'Falha ao persistir alteração do colaborador.'
      });
    }
    res.json({ success: true, ...resultado });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/* ── Apontamentos de Tempo (Labor Tracking) ─────────────────── */
app.get('/api/apontamentos', requirePermission('labor:read', 'labor:write'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const tenantId = extractTenantId(req);
    const apontamentos = laborTrackingService.listarApontamentos({
      tenantId,
      state,
      workerId: req.query.workerId,
      osId: req.query.osId,
      status: req.query.status,
      type: req.query.type,
      dataInicio: req.query.dataInicio,
      dataFim: req.query.dataFim,
      limit: parseInt(req.query.limit, 10) || 100
    });
    res.json({ success: true, total: apontamentos.length, apontamentos });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/apontamentos/iniciar', requirePermission('labor:write'), async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    let resultado = null;
    const saveRes = await mutateTenantState(req, (draft) => {
      resultado = laborTrackingService.iniciarApontamento({
        tenantId,
        state: draft,
        workerId: req.body.workerId,
        osId: req.body.osId,
        serviceItemId: req.body.serviceItemId,
        boxId: req.body.boxId,
        type: req.body.type || 'produtivo',
        source: req.body.source || 'web',
        causaRetrabalho: req.body.causaRetrabalho,
        reworkOriginalEntryId: req.body.reworkOriginalEntryId,
        timestamp: req.body.timestamp,
        actorId: req.securityContext?.actorId || 'operador'
      });
    });
    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({
        success: false,
        error: saveRes?.error || 'Falha ao persistir início de apontamento.'
      });
    }
    res.json({ success: true, ...resultado });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/apontamentos/:id/pausar', requirePermission('labor:write'), async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    let resultado = null;
    const saveRes = await mutateTenantState(req, (draft) => {
      resultado = laborTrackingService.pausarApontamento({
        tenantId,
        state: draft,
        entryId: req.params.id,
        motivo: req.body.motivo || 'pausa',
        timestamp: req.body.timestamp,
        actorId: req.securityContext?.actorId || 'operador'
      });
    });
    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({
        success: false,
        error: saveRes?.error || 'Falha ao persistir pausa de apontamento.'
      });
    }
    res.json({ success: true, ...resultado });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/apontamentos/:id/retomar', requirePermission('labor:write'), async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    let resultado = null;
    const saveRes = await mutateTenantState(req, (draft) => {
      resultado = laborTrackingService.retomarApontamento({
        tenantId,
        state: draft,
        entryId: req.params.id,
        timestamp: req.body.timestamp,
        actorId: req.securityContext?.actorId || 'operador'
      });
    });
    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({
        success: false,
        error: saveRes?.error || 'Falha ao persistir retomada de apontamento.'
      });
    }
    res.json({ success: true, ...resultado });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/apontamentos/:id/encerrar', requirePermission('labor:write'), async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    let resultado = null;
    const saveRes = await mutateTenantState(req, (draft) => {
      resultado = laborTrackingService.encerrarApontamento({
        tenantId,
        state: draft,
        entryId: req.params.id,
        timestamp: req.body.timestamp,
        actorId: req.securityContext?.actorId || 'operador'
      });
    });
    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({
        success: false,
        error: saveRes?.error || 'Falha ao persistir encerramento de apontamento.'
      });
    }
    res.json({ success: true, ...resultado });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/apontamentos/:id/ajustar', requirePermission('labor:adjust'), async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    let resultado = null;
    const saveRes = await mutateTenantState(req, (draft) => {
      resultado = laborTrackingService.ajustarApontamentoManual({
        tenantId,
        state: draft,
        entryId: req.params.id,
        dadosAjuste: req.body.dadosAjuste || req.body,
        motivo: req.body.motivo,
        actorId: req.securityContext?.actorId || 'gerente'
      });
    });
    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({
        success: false,
        error: saveRes?.error || 'Falha ao persistir ajuste de apontamento.'
      });
    }
    res.json({ success: true, ...resultado });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/* ── Produtividade & Capacidade ─────────────────────────────── */
app.get('/api/produtividade/resumo', requirePermission('productivity:read'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const tenantId = extractTenantId(req);
    const dataRef = req.query.data || null;
    const agora = req.query.agora ? new Date(req.query.agora) : new Date();
    const resumo = productivityService.calcularProdutividadeOficina({ tenantId, state, dataReferencia: dataRef, agora });
    const capacidade = productivityService.calcularCapacidadeDiaria({ tenantId, state, dataReferencia: dataRef, agora });
    res.json({ success: true, resumo, capacidade });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/produtividade/mecanicos', requirePermission('productivity:read'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const tenantId = extractTenantId(req);
    const dataRef = req.query.data || null;
    const agora = req.query.agora ? new Date(req.query.agora) : new Date();
    const prod = productivityService.calcularProdutividadeOficina({ tenantId, state, dataReferencia: dataRef, agora });
    res.json({ success: true, data: prod.dataReferencia, mecanicos: prod.mecanicos });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/produtividade/os/:id', requirePermission('productivity:read', 'labor:read'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const tenantId = extractTenantId(req);
    const osId = req.params.id;
    const serviceItemId = req.query.serviceItemId || null;
    if (serviceItemId) {
      const comp = productivityService.compararEstimadoVsReal({ tenantId, state, osId, serviceItemId });
      return res.json({ success: true, ...comp });
    }
    const apontamentos = laborTrackingService.listarApontamentos({ tenantId, state, osId });
    res.json({ success: true, osId, apontamentos });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ── Custo Real da OS e Margem Bruta ────────────────────────── */
app.get('/api/os/:id/custos', requirePermission('costing:read', 'productivity:manage'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const tenantId = extractTenantId(req);
    const custos = costingService.calcularCustoRealOS({ tenantId, state, osId: req.params.id });
    res.json({ success: true, custos });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/* ── Precificação Assistida e Análise de Rentabilidade ──────── */
app.get('/api/precificacao/servicos/:id', requirePermission('pricing:read'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const tenantId = extractTenantId(req);
    const secCtx = req.securityContext;
    const userPermissions = secCtx ? secCtx.permissions : [];
    const recomendacao = pricingEngine.gerarRecomendacaoPreco({
      tenantId,
      state,
      serviceId: req.params.id,
      userPermissions
    });
    if (!recomendacao.ok) {
      return res.status(404).json({ success: false, error: recomendacao.error });
    }
    res.json({ success: true, ...recomendacao });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/precificacao/simular', requirePermission('pricing:recommend'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const tenantId = extractTenantId(req);
    const simulacao = pricingEngine.simularPrecificacao({
      tenantId,
      state,
      ...req.body
    });
    res.json({ success: true, ...simulacao });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.get('/api/precificacao/historico/:serviceId', requirePermission('pricing:read'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const tenantId = extractTenantId(req);
    const historico = pricingEngine.consultarHistoricoServico({
      tenantId,
      state,
      serviceId: req.params.serviceId,
      periodo: req.query.periodo,
      veiculoModelo: req.query.veiculoModelo,
      categoria: req.query.categoria
    });
    res.json({ success: true, historico });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/rentabilidade/resumo', requirePermission('profitability:read'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const tenantId = extractTenantId(req);
    const resumo = pricingEngine.obterResumoRentabilidade({
      tenantId,
      state,
      periodo: req.query.periodo
    });
    res.json({ success: true, resumo });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/rentabilidade/servicos', requirePermission('profitability:read'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const tenantId = extractTenantId(req);
    const servicos = pricingEngine.obterRentabilidadeServicos({
      tenantId,
      state,
      periodo: req.query.periodo,
      ordenarPor: req.query.ordenarPor,
      limite: req.query.limite ? parseInt(req.query.limite, 10) : undefined
    });
    res.json({ success: true, servicos });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/rentabilidade/categorias', requirePermission('profitability:read'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const tenantId = extractTenantId(req);
    const categorias = pricingEngine.obterRentabilidadeCategorias({
      tenantId,
      state,
      periodo: req.query.periodo
    });
    res.json({ success: true, categorias });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/rentabilidade/clientes', requirePermission('profitability:read'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const tenantId = extractTenantId(req);
    const clientes = pricingEngine.obterRentabilidadeClientes({
      tenantId,
      state,
      periodo: req.query.periodo,
      limite: req.query.limite ? parseInt(req.query.limite, 10) : undefined
    });
    res.json({ success: true, clientes });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/orcamentos/:id/margem', requirePermission('pricing:read'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const tenantId = extractTenantId(req);
    const orcId = req.params.id;
    const orcamentos = [
      ...(Array.isArray(state.quotations) ? state.quotations : []),
      ...(Array.isArray(state.orcamentos) ? state.orcamentos : [])
    ];
    let orc = orcamentos.find(o => (o.id === orcId || o.osId === orcId || o.num === parseInt(orcId, 10) || o.numero === parseInt(orcId, 10)) && (o.tenantId === tenantId || !o.tenantId));
    if (!orc) {
      const os = (state.os || []).find(o => (o.id === orcId || o.num === parseInt(orcId, 10)) && (o.tenantId === tenantId || !o.tenantId));
      if (os) orc = os;
    }
    if (!orc) {
      return res.status(404).json({ success: false, error: 'Orçamento não encontrado.' });
    }

    let precoTotal = 0;
    let custoTotalEsperado = 0;
    const itensDetalhados = [];

    for (const s of (orc.servicos || orc.services || [])) {
      const qtd = Number(s.qtd || 1);
      const pUnit = Number(s.preco || s.valor || 0);
      const pTot = pUnit * qtd;
      precoTotal += pTot;
      const cEsp = pricingEngine.calcularCustoEsperadoServico({ tenantId, state, serviceId: s.id || s.serviceId, serviceNome: s.nome || s.desc });
      const cTot = (cEsp.custoTotalEsperado || 0) * qtd;
      custoTotalEsperado += cTot;
      itensDetalhados.push({
        tipo: 'servico',
        id: s.id || s.serviceId,
        nome: s.nome || s.desc,
        qtd,
        precoTotal: pTot,
        custoTotal: cTot,
        margemBruta: pTot - cTot,
        margemPercentual: pricingEngine.calcularMargemBruta(pTot, cTot)
      });
    }

    for (const p of (orc.pecas || orc.parts || [])) {
      const qtd = Number(p.qtd || p.quantidade || 1);
      const pUnit = Number(p.precoUnitario || p.preco || p.valor || 0);
      const pTot = pUnit * qtd;
      precoTotal += pTot;
      const pCad = (state.pecas || []).find(item => item.id === (p.id || p.partId));
      const cUnit = Number(pCad?.custoMedio || pCad?.ultimoCusto || p.custoUnitario || 0);
      const cTot = cUnit * qtd;
      custoTotalEsperado += cTot;
      itensDetalhados.push({
        tipo: 'peca',
        id: p.id || p.partId,
        nome: p.desc || p.nome || pCad?.descricao || 'Peça',
        qtd,
        precoTotal: pTot,
        custoTotal: cTot,
        margemBruta: pTot - cTot,
        margemPercentual: pricingEngine.calcularMargemBruta(pTot, cTot)
      });
    }

    const margemBrutaTotal = precoTotal - custoTotalEsperado;
    const margemPercentualTotal = pricingEngine.calcularMargemBruta(precoTotal, custoTotalEsperado);
    const margemMinima = state.cfg?.precificacao?.margemMinimaPadrao != null ? Number(state.cfg.precificacao.margemMinimaPadrao) : 20.0;
    const precoMinimoTotal = pricingEngine.calcularPrecoMinimo(custoTotalEsperado, margemMinima);
    const descontoSeguro = pricingEngine.calcularDescontoSeguro(precoTotal, precoMinimoTotal);

    res.json({
      success: true,
      orcamentoId: orc.id,
      precoTotal,
      custoTotalEsperado,
      margemBrutaTotal,
      margemPercentualTotal,
      margemMinimaPolitica: margemMinima,
      precoMinimoTotal,
      descontoMaximoSeguro: descontoSeguro.descontoMaximoSeguro,
      descontoMaximoPercentual: descontoSeguro.descontoMaximoPercentual,
      abaixoDaMargemMinima: margemPercentualTotal < margemMinima,
      itens: itensDetalhados
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/orcamentos/:id/override-preco', requirePermission('pricing:override'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const tenantId = extractTenantId(req);
    const secCtx = req.securityContext;
    const actorId = secCtx?.user?.id || secCtx?.user?.username || 'admin';
    const { serviceId, partId, precoProposto, motivo } = req.body;

    if (precoProposto == null || isNaN(precoProposto)) {
      return res.status(400).json({ success: false, error: 'Preço proposto é obrigatório e deve ser numérico.' });
    }
    if (!motivo || String(motivo).trim().length < 3) {
      return res.status(400).json({ success: false, error: 'Justificativa do override é obrigatória.' });
    }

    const orcamentos = [
      ...(Array.isArray(state.quotations) ? state.quotations : []),
      ...(Array.isArray(state.orcamentos) ? state.orcamentos : [])
    ];
    let orc = orcamentos.find(o => (o.id === req.params.id || o.osId === req.params.id || o.num === parseInt(req.params.id, 10)) && (o.tenantId === tenantId || !o.tenantId));
    if (!orc) {
      const os = (state.os || []).find(o => (o.id === req.params.id || o.num === parseInt(req.params.id, 10)) && (o.tenantId === tenantId || !o.tenantId));
      if (os) orc = os;
    }
    if (!orc) {
      return res.status(404).json({ success: false, error: 'Orçamento não encontrado.' });
    }

    let precoMinimo = 0;
    let custoEsperado = 0;
    let margemMinima = state.cfg?.precificacao?.margemMinimaPadrao != null ? Number(state.cfg.precificacao.margemMinimaPadrao) : 20.0;

    if (serviceId) {
      const c = pricingEngine.calcularCustoEsperadoServico({ tenantId, state, serviceId });
      custoEsperado = c.custoTotalEsperado;
      precoMinimo = pricingEngine.calcularPrecoMinimo(custoEsperado, margemMinima);
    } else if (partId) {
      const pCad = (state.pecas || []).find(p => p.id === partId);
      custoEsperado = Number(pCad?.custoMedio || pCad?.ultimoCusto || 0);
      precoMinimo = pricingEngine.calcularPrecoMinimo(custoEsperado, margemMinima);
    }

    const reg = pricingEngine.registrarOverridePreco({
      tenantId,
      state,
      quotationId: orc.id,
      serviceId,
      partId,
      precoProposto: Number(precoProposto),
      precoMinimo,
      motivo,
      autorizadoPor: actorId
    });

    const saveRes = await persistTenantState(req, state);
    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({ success: false, error: saveRes?.error || 'Falha ao persistir override de preço.' });
    }

    res.json({
      success: true,
      override: reg.override
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});



/* ── CRM, Frotistas, Manutenção Preventiva, Pós-Venda e Configurações ── */

// ── 1. CLIENTES E TIMELINE ──────────────────────────────────────
app.get('/api/clientes', requirePermission('crm:read', 'os:read'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const clientes = state.clientes || [];
    res.json({ success: true, total: clientes.length, clientes });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/clientes/:id', requirePermission('crm:read', 'os:read'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const cliente = (state.clientes || []).find(c => c.id === req.params.id);
    if (!cliente) return res.status(404).json({ success: false, error: 'Cliente não encontrado.' });
    res.json({ success: true, cliente });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/clientes/:id/timeline', requirePermission('crm:read'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const tenantId = extractTenantId(req);
    const resultado = customerTimelineService.obterTimelineCliente({
      tenantId,
      customerId: req.params.id,
      state
    });
    if (!resultado.ok) {
      return res.status(404).json({ success: false, error: resultado.error });
    }
    res.json({ success: true, ...resultado });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post(['/api/integracoes/consulta-cliente', '/api/clientes/consultar'], requirePermission('crm:read', 'crm:write', 'os:read', 'os:write'), async (req, res) => {
  try {
    const { doc, incluirSerasa = false } = req.body || {};
    const tenantId = extractTenantId(req);
    const state = await getOrLoadState(req);
    const testAdapterHeader = req.headers['x-test-consulta-adapter'];

    const resultado = await consultaClienteService.consultarCliente({
      doc,
      incluirSerasa,
      state,
      tenantId,
      testAdapterHeader
    });

    return res.status(resultado.status || (resultado.success ? 200 : 400)).json(resultado);
  } catch (err) {
    console.error('[API /api/integracoes/consulta-cliente] Erro:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── 2. FROTAS ───────────────────────────────────────────────────
app.get('/api/frotas', requirePermission('crm:read'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const tenantId = extractTenantId(req);
    const frotas = (state.fleets || state.frotas || []).filter(f => !f.tenantId || f.tenantId === tenantId);
    res.json({ success: true, total: frotas.length, frotas });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/frotas', requirePermission('crm:write'), async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    const { customerId, nome, vehicles = [], responsavelId, ativo = true } = req.body || {};

    if (!nome || String(nome).trim().length < 2) {
      return res.status(400).json({ success: false, error: 'Nome da frota é obrigatório.' });
    }

    const id = gerarId('flt');
    const agora = new Date().toISOString();

    const novaFrota = {
      id,
      tenantId,
      customerId: customerId || null,
      nome: String(nome).trim(),
      vehicles: Array.isArray(vehicles) ? vehicles : [],
      responsavelId: responsavelId || null,
      ativo: Boolean(ativo),
      createdAt: agora,
      updatedAt: agora
    };

    const saveRes = await mutateTenantState(req, (draft) => {
      if (!draft.fleets) draft.fleets = [];
      draft.fleets.push(novaFrota);
    });

    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({
        success: false,
        error: saveRes?.error || 'Falha ao persistir frota.'
      });
    }

    res.json({ success: true, frota: novaFrota });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/frotas/:id', requirePermission('crm:read'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const tenantId = extractTenantId(req);
    const frotas = state.fleets || state.frotas || [];
    const frota = frotas.find(f => f.id === req.params.id && (!f.tenantId || f.tenantId === tenantId));
    if (!frota) return res.status(404).json({ success: false, error: 'Frota não encontrada.' });
    res.json({ success: true, frota });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/frotas/:id/veiculos', requirePermission('crm:read'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const tenantId = extractTenantId(req);
    const frotas = state.fleets || state.frotas || [];
    const frota = frotas.find(f => f.id === req.params.id && (!f.tenantId || f.tenantId === tenantId));
    if (!frota) return res.status(404).json({ success: false, error: 'Frota não encontrada.' });

    const veiculos = state.veiculos || [];
    const veiculosIds = new Set(frota.vehicles || []);
    const veiculosDaFrota = veiculos.filter(v => veiculosIds.has(v.id) || v.fleetId === frota.id);

    const prev = maintenancePlanService.avaliarVencimentos({ tenantId, state, fleetId: frota.id });
    const ordens = (state.os || []).filter(o => o.st !== 'finalizada');

    const lista = veiculosDaFrota.map(v => {
      const osAtiva = ordens.find(o => o.vei === v.id);
      const prevVeic = (prev.itens || []).filter(it => it.vehicleId === v.id);
      return {
        id: v.id,
        placa: v.placa,
        modelo: v.modelo,
        marca: v.marca,
        ano: v.ano,
        km: v.km || 0,
        naOficina: Boolean(osAtiva),
        osNumero: osAtiva ? osAtiva.num : null,
        osStatus: osAtiva ? osAtiva.st : null,
        manutencoes: prevVeic
      };
    });

    res.json({ success: true, frotaNome: frota.nome, total: lista.length, veiculos: lista });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── 3. PLANOS DE MANUTENÇÃO PREVENTIVA ──────────────────────────
app.get('/api/manutencao/planos', requirePermission('maintenance:read'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const tenantId = extractTenantId(req);
    const { vehicleId, fleetId } = req.query || {};
    const planos = maintenancePlanService.listarPlanos({ tenantId, state, vehicleId, fleetId });
    res.json({ success: true, total: planos.length, planos });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/manutencao/planos', requirePermission('maintenance:write'), async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    const secCtx = req.securityContext;
    const actorId = secCtx?.actorId || 'operador';

    let resultado;
    const saveRes = await mutateTenantState(req, (draft) => {
      resultado = maintenancePlanService.criarPlano({
        tenantId,
        state: draft,
        actorId,
        ...req.body
      });
    });

    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({ success: false, error: saveRes?.error || 'Falha ao persistir plano de manutenção.' });
    }
    res.json({ success: true, ...resultado });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.get('/api/manutencao/vencimentos', requirePermission('maintenance:read'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const tenantId = extractTenantId(req);
    const { vehicleId, fleetId, data } = req.query || {};
    const resultado = maintenancePlanService.avaliarVencimentos({
      tenantId,
      state,
      vehicleId,
      fleetId,
      dataReferencia: data
    });
    res.json({ success: true, ...resultado });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/manutencao/atualizar-km', requirePermission('maintenance:write'), async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    const secCtx = req.securityContext;
    const actorId = secCtx?.actorId || 'operador';
    const { vehicleId, placa, km, fonte, permitirOverride } = req.body || {};

    let resultado;
    const saveRes = await mutateTenantState(req, (draft) => {
      resultado = maintenancePlanService.atualizarKmVeiculo({
        tenantId,
        state: draft,
        vehicleId,
        placa,
        kmInformado: km,
        fonte: fonte || 'web',
        ator: actorId,
        permitirOverride: Boolean(permitirOverride)
      });
      if (!resultado.ok) {
        return { abort: true, error: resultado.erro || 'Atualização de KM inválida' };
      }
    });

    if (!resultado?.ok) {
      return res.status(resultado?.incoerente ? 409 : 400).json({ success: false, ...resultado });
    }

    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({ success: false, error: saveRes?.error || 'Falha ao persistir KM.' });
    }

    res.json({ success: true, ...resultado });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── 4. CRM & OPORTUNIDADES ──────────────────────────────────────
app.get('/api/crm/oportunidades', requirePermission('crm:read'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const tenantId = extractTenantId(req);
    relationshipService.avaliarOportunidades({ tenantId, state });
    const oportunidades = (state.opportunities || []).filter(o => o.tenantId === tenantId);
    res.json({ success: true, total: oportunidades.length, oportunidades });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/crm/oportunidades/:id/contatar', requirePermission('crm:contact'), async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    const { canal = 'whatsapp', mensagem = '' } = req.body || {};

    let opoRetornado, motivo403 = null, naoEncontrado = false;
    const saveRes = await mutateTenantState(req, (draft) => {
      const list = draft.opportunities || [];
      const opo = list.find(o => o.id === req.params.id && o.tenantId === tenantId);
      if (!opo) {
        naoEncontrado = true;
        return { abort: true, error: 'Oportunidade não encontrada.' };
      }

      const cliente = (draft.clientes || []).find(c => c.id === opo.customerId);
      const val = relationshipService.validarEnvioNotificacao({ cliente, tipoMensagem: 'comercial', canal });
      if (!val.permitido) {
        motivo403 = val.motivo;
        return { abort: true, error: val.motivo };
      }

      opo.status = 'contatado';
      opo.contatadoEm = new Date().toISOString();
      opo.ultimoCanal = canal;
      if (cliente) cliente.ultimoContatoRelacionamento = new Date().toISOString();
      opoRetornado = opo;
    });

    if (naoEncontrado) return res.status(404).json({ success: false, error: 'Oportunidade não encontrada.' });
    if (motivo403) return res.status(403).json({ success: false, error: motivo403 });
    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({ success: false, error: saveRes?.error || 'Falha ao persistir oportunidade.' });
    }

    res.json({ success: true, oportunidade: opoRetornado, mensagemEnviada: mensagem });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/crm/metricas', requirePermission('crm:read'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const tenantId = extractTenantId(req);
    const metricas = relationshipService.obterMetricasCRM({ tenantId, state });
    res.json({ success: true, metricas });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/crm/frotistas', requirePermission('crm:read'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const tenantId = extractTenantId(req);
    const secCtx = req.securityContext;
    const temPermissaoFinanceira = (secCtx?.permissions || []).includes('financial:read') || (secCtx?.permissions || []).includes('*');

    const clientes = state.clientes || [];
    const veiculos = state.veiculos || [];
    const ordens = state.os || [];
    const frotas = state.fleets || state.frotas || [];
    const quotations = state.quotations || [];

    const frotistas = clientes.filter(c => c.tipo === 'frotista' || frotas.some(f => f.customerId === c.id));
    const prev = maintenancePlanService.avaliarVencimentos({ tenantId, state });

    const painel = frotistas.map(f => {
      const veics = veiculos.filter(v => v.cli === f.id);
      const veicsIds = new Set(veics.map(v => v.id));
      const osAtivas = ordens.filter(o => o.st !== 'finalizada' && (o.cli === f.id || veicsIds.has(o.vei)));
      const osFinalizadas = ordens.filter(o => o.st === 'finalizada' && (o.cli === f.id || veicsIds.has(o.vei)));
      const orcamentosPendentes = quotations.filter(q => q.customerId === f.id && q.status === 'enviado');

      const itensPrev = (prev.itens || []).filter(i => veicsIds.has(i.vehicleId));
      const prox = itensPrev.filter(i => i.status === 'proximo').length;
      const venc = itensPrev.filter(i => i.status === 'vencido').length;

      const valorMovimentado = osFinalizadas.reduce((acc, o) => acc + (Number(o.total) || 0), 0);

      return {
        id: f.id,
        nome: f.nome,
        nomeFantasia: f.nomeFantasia || f.fantasia,
        doc: f.doc || f.documento,
        contatoPrincipal: (f.contatos && f.contatos.find(c => c.principal)) || f.contato,
        veiculosTotal: veics.length,
        veiculosNaOficina: osAtivas.length,
        manutencoesProximas: prox,
        manutencoesVencidas: venc,
        orçamentosPendentes: orcamentosPendentes.length,
        valorMovimentado: temPermissaoFinanceira ? valorMovimentado : null,
        ultimoContato: f.ultimoContatoRelacionamento || null
      };
    });

    res.json({ success: true, total: painel.length, frotistas: painel });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── 5. AGENDAMENTOS ─────────────────────────────────────────────
app.get('/api/agendamentos', requirePermission('appointments:read'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const tenantId = extractTenantId(req);
    const agendamentos = (state.appointments || []).filter(a => a.tenantId === tenantId);
    res.json({ success: true, total: agendamentos.length, agendamentos });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/agendamentos', requirePermission('appointments:write'), async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    const secCtx = req.securityContext;
    const actorId = secCtx?.actorId || 'operador';

    let resultado;
    const saveRes = await mutateTenantState(req, (draft) => {
      resultado = appointmentService.criarAgendamento({
        tenantId,
        state: draft,
        createdBy: actorId,
        ...req.body
      });
    });

    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({ success: false, error: saveRes?.error || 'Falha ao persistir agendamento.' });
    }
    res.json({ success: true, ...resultado });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.post('/api/agendamentos/:id/cancelar', requirePermission('appointments:write'), async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    const secCtx = req.securityContext;
    const actorId = secCtx?.actorId || 'operador';
    const { motivo } = req.body || {};

    let resultado;
    const saveRes = await mutateTenantState(req, (draft) => {
      resultado = appointmentService.cancelarAgendamento({
        tenantId,
        state: draft,
        appointmentId: req.params.id,
        motivo,
        actorId
      });
      if (!resultado.ok) {
        return { abort: true, error: resultado.error };
      }
    });

    if (!resultado?.ok) return res.status(404).json({ success: false, error: resultado?.error });
    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({ success: false, error: saveRes?.error || 'Falha ao persistir cancelamento.' });
    }

    res.json({ success: true, ...resultado });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/agendamentos/:id/converter-pre-os', requirePermission('appointments:write', 'os:write'), async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    const secCtx = req.securityContext;
    const actorId = secCtx?.actorId || 'recepcao';

    let resultado;
    const saveRes = await mutateTenantState(req, (draft) => {
      resultado = appointmentService.converterParaPreOS({
        tenantId,
        state: draft,
        appointmentId: req.params.id,
        actorId
      });
      if (!resultado.ok) {
        return { abort: true, error: resultado.error };
      }
    });

    if (!resultado?.ok) return res.status(400).json({ success: false, error: resultado?.error });
    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({ success: false, error: saveRes?.error || 'Falha ao persistir conversão para pré-OS.' });
    }

    res.json({ success: true, ...resultado });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── 6. PÓS-VENDA ────────────────────────────────────────────────
app.get('/api/pos-venda', requirePermission('crm:read'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const tenantId = extractTenantId(req);
    afterSalesService.avaliarPosVenda({ tenantId, state });
    const registros = (state.afterSales || []).filter(a => a.tenantId === tenantId);
    res.json({ success: true, total: registros.length, registros });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/pos-venda/:id/contatar', requirePermission('crm:contact'), async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    const { tipo = 'verificacao_servico', canal = 'whatsapp' } = req.body || {};

    let regRetornado, msg;
    const saveRes = await mutateTenantState(req, (draft) => {
      const reg = (draft.afterSales || []).find(a => a.id === req.params.id && a.tenantId === tenantId);
      if (!reg) return { abort: true, error: 'Registro de pós-venda não encontrado.' };

      msg = afterSalesService.gerarMensagemFollowUp({ tenantId, state: draft, osId: reg.osId });
      if (!Array.isArray(reg.contatos)) reg.contatos = [];
      reg.contatos.push({
        data: new Date().toISOString(),
        tipo,
        canal,
        status: 'enviado'
      });
      reg.status = 'contatado';
      regRetornado = reg;
    });

    if (!regRetornado) return res.status(404).json({ success: false, error: 'Registro de pós-venda não encontrado.' });
    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({ success: false, error: saveRes?.error || 'Falha ao persistir contato de pós-venda.' });
    }

    res.json({ success: true, registro: regRetornado, mensagem: msg });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/pos-venda/:id/responder', async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    const { resposta, canal = 'whatsapp' } = req.body || {};

    let resultado;
    const saveRes = await mutateTenantState(req, (draft) => {
      resultado = afterSalesService.processarRespostaCliente({
        tenantId,
        state: draft,
        afterSalesId: req.params.id,
        respostaTexto: resposta,
        canal
      });
      if (!resultado.ok) {
        return { abort: true, error: resultado.error || 'Resposta de pós-venda inválida' };
      }
    });

    if (!resultado?.ok) return res.status(400).json(resultado);
    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({ success: false, error: saveRes?.error || 'Falha ao persistir resposta de pós-venda.' });
    }

    res.json({ success: true, ...resultado });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── 7. CONFIGURAÇÕES: EMPRESA E IDENTIDADE VISUAL ───────────────
app.get('/api/configuracoes/empresa', requirePermission('company:settings', 'admin:settings'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const cfg = state.cfg || {};
    res.json({
      success: true,
      empresa: cfg.empresa || '',
      cnpj: cfg.cnpj || '',
      endereco: cfg.endereco || '',
      fone: cfg.fone || '',
      identidadeVisual: cfg.identidadeVisual || { logo: null, imagemInstitucional: null }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.put('/api/configuracoes/empresa', requirePermission('company:settings', 'admin:settings'), async (req, res) => {
  try {
    const { empresa, cnpj, endereco, fone } = req.body || {};
    let cfgAtualizada;
    const saveRes = await mutateTenantState(req, (draft) => {
      if (!draft.cfg) draft.cfg = {};
      if (empresa !== undefined) draft.cfg.empresa = String(empresa).trim();
      if (cnpj !== undefined) draft.cfg.cnpj = String(cnpj).trim();
      if (endereco !== undefined) draft.cfg.endereco = String(endereco).trim();
      if (fone !== undefined) draft.cfg.fone = String(fone).trim();
      cfgAtualizada = draft.cfg;
    });

    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({ success: false, error: saveRes?.error || 'Falha ao persistir configurações.' });
    }

    res.json({ success: true, cfg: cfgAtualizada });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/configuracoes/empresa/logo', limiterUploads, requirePermission('company:settings', 'admin:settings'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const tenantId = extractTenantId(req);
    const { logoBase64, mimeType = 'image/png' } = req.body || {};

    if (!logoBase64 || typeof logoBase64 !== 'string') {
      return res.status(400).json({ success: false, error: 'Arquivo de logotipo base64 é obrigatório.' });
    }

    // Validação de segurança: nunca aceitar executáveis ou formatos não-imagem
    const allowedMimes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/svg+xml'];
    const cleanMime = mimeType.toLowerCase().trim();
    if (!allowedMimes.includes(cleanMime)) {
      return res.status(400).json({ success: false, error: 'Formato de arquivo não permitido. Envie PNG, JPEG ou WEBP.' });
    }

    // Validação de tamanho: máximo 2MB
    const buffer = Buffer.from(logoBase64.replace(/^data:image\/[a-z+]+;base64,/, ''), 'base64');
    if (buffer.length > 2 * 1024 * 1024) {
      return res.status(400).json({ success: false, error: 'Logotipo excede o tamanho máximo de 2MB.' });
    }

    if (!state.cfg) state.cfg = {};
    if (!state.cfg.identidadeVisual) state.cfg.identidadeVisual = {};

    const uploadMeta = salvarUpload({ tenantId, tipo: 'logo', buffer, mimeType: cleanMime });
    state.cfg.identidadeVisual.logo = uploadMeta.url;
    state.cfg.identidadeVisual.logoMeta = uploadMeta;
    state.cfg.identidadeVisual.updatedAt = new Date().toISOString();

    const saveRes = await persistTenantState(req, state);
    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({ success: false, error: saveRes?.error || 'Falha ao salvar logotipo.' });
    }
    res.json({ success: true, mensagem: 'Logotipo atualizado com sucesso!', url: uploadMeta.url });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/configuracoes/empresa/logo', requirePermission('company:settings', 'admin:settings'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    if (!state.cfg) state.cfg = {};
    if (!state.cfg.identidadeVisual) state.cfg.identidadeVisual = {};

    if (state.cfg.identidadeVisual.logoMeta?.path) {
      removerUpload({ filePath: state.cfg.identidadeVisual.logoMeta.path });
    }
    state.cfg.identidadeVisual.logo = null;
    state.cfg.identidadeVisual.logoMeta = null;
    state.cfg.identidadeVisual.updatedAt = new Date().toISOString();

    const saveRes = await persistTenantState(req, state);
    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({ success: false, error: saveRes?.error || 'Falha ao remover logotipo.' });
    }
    res.json({ success: true, mensagem: 'Logotipo removido com sucesso!' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/configuracoes/empresa/imagem-institucional', limiterUploads, requirePermission('company:settings', 'admin:settings'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const tenantId = extractTenantId(req);
    const { imagemBase64, mimeType = 'image/png' } = req.body || {};

    if (!imagemBase64 || typeof imagemBase64 !== 'string') {
      return res.status(400).json({ success: false, error: 'Arquivo de imagem base64 é obrigatório.' });
    }

    const allowedMimes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
    const cleanMime = mimeType.toLowerCase().trim();
    if (!allowedMimes.includes(cleanMime)) {
      return res.status(400).json({ success: false, error: 'Formato de arquivo não permitido. Envie PNG, JPEG ou WEBP.' });
    }

    const buffer = Buffer.from(imagemBase64.replace(/^data:image\/[a-z+]+;base64,/, ''), 'base64');
    if (buffer.length > 2 * 1024 * 1024) {
      return res.status(400).json({ success: false, error: 'Imagem excede o tamanho máximo de 2MB.' });
    }

    if (!state.cfg) state.cfg = {};
    if (!state.cfg.identidadeVisual) state.cfg.identidadeVisual = {};

    const uploadMeta = salvarUpload({ tenantId, tipo: 'imagem_institucional', buffer, mimeType: cleanMime });
    state.cfg.identidadeVisual.imagemInstitucional = uploadMeta.url;
    state.cfg.identidadeVisual.imagemInstitucionalMeta = uploadMeta;
    state.cfg.identidadeVisual.updatedAt = new Date().toISOString();

    const saveRes = await persistTenantState(req, state);
    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({ success: false, error: saveRes?.error || 'Falha ao salvar imagem institucional.' });
    }
    res.json({ success: true, mensagem: 'Imagem institucional atualizada com sucesso!', url: uploadMeta.url });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/configuracoes/empresa/imagem-institucional', requirePermission('company:settings', 'admin:settings'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    if (!state.cfg) state.cfg = {};
    if (!state.cfg.identidadeVisual) state.cfg.identidadeVisual = {};

    if (state.cfg.identidadeVisual.imagemInstitucionalMeta?.path) {
      removerUpload({ filePath: state.cfg.identidadeVisual.imagemInstitucionalMeta.path });
    }
    state.cfg.identidadeVisual.imagemInstitucional = null;
    state.cfg.identidadeVisual.imagemInstitucionalMeta = null;
    state.cfg.identidadeVisual.updatedAt = new Date().toISOString();

    const saveRes = await persistTenantState(req, state);
    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({ success: false, error: saveRes?.error || 'Falha ao remover imagem institucional.' });
    }
    res.json({ success: true, mensagem: 'Imagem institucional removida com sucesso!' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── 8. CONFIGURAÇÕES: ASSISTENTE VIRTUAL E VOZ ───────────────────
app.get('/api/configuracoes/assistente', requirePermission('assistant:settings', 'admin:settings'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const raw = state.cfg?.assistente || state.cfg?.assistant || {};
    const cfg = {
      displayName: raw.displayName || 'Verônica',
      voiceGender: raw.voiceGender || 'female',
      voiceURI: raw.voiceURI || '',
      voiceName: raw.voiceName || '',
      pitch: (typeof raw.pitch === 'number' && Number.isFinite(raw.pitch)) ? raw.pitch : 1.0,
      rate: (typeof raw.rate === 'number' && Number.isFinite(raw.rate)) ? raw.rate : 1.0,
      enabled: raw.enabled !== undefined ? Boolean(raw.enabled) : true,
      briefingDiarioAtivo: raw.briefingDiarioAtivo !== undefined ? Boolean(raw.briefingDiarioAtivo) : false,
      briefingDiarioHorario: raw.briefingDiarioHorario || '07:30',
      briefingDiarioDias: Array.isArray(raw.briefingDiarioDias) ? raw.briefingDiarioDias : ['segunda', 'terca', 'quarta', 'quinta', 'sexta'],
      briefingSemanalAtivo: raw.briefingSemanalAtivo !== undefined ? Boolean(raw.briefingSemanalAtivo) : false,
      briefingSemanalDia: raw.briefingSemanalDia || 'segunda',
      briefingSemanalHorario: raw.briefingSemanalHorario || '08:00',
      briefingDestinatarios: raw.briefingDestinatarios || 'gestores'
    };
    res.json({ success: true, assistente: cfg });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.put('/api/configuracoes/assistente', requirePermission('assistant:settings', 'admin:settings'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const {
      displayName,
      voiceGender,
      enabled,
      voiceURI,
      voiceName,
      pitch,
      rate,
      briefingDiarioAtivo,
      briefingDiarioHorario,
      briefingDiarioDias,
      briefingSemanalAtivo,
      briefingSemanalDia,
      briefingSemanalHorario,
      briefingDestinatarios
    } = req.body || {};

    if (!state.cfg) state.cfg = {};
    if (!state.cfg.assistente) {
      state.cfg.assistente = {
        displayName: 'Verônica',
        voiceGender: 'female',
        voiceURI: '',
        voiceName: '',
        pitch: 1.0,
        rate: 1.0,
        enabled: true,
        briefingDiarioAtivo: false,
        briefingDiarioHorario: '07:30',
        briefingDiarioDias: ['segunda', 'terca', 'quarta', 'quinta', 'sexta'],
        briefingSemanalAtivo: false,
        briefingSemanalDia: 'segunda',
        briefingSemanalHorario: '08:00',
        briefingDestinatarios: 'gestores'
      };
    }

    if (displayName !== undefined && String(displayName).trim().length >= 2) {
      state.cfg.assistente.displayName = String(displayName).trim();
    }
    if (voiceGender !== undefined) {
      const g = String(voiceGender).toLowerCase().trim();
      state.cfg.assistente.voiceGender = (g === 'male' || g === 'masculina') ? 'male' : 'female';
    }
    if (voiceURI !== undefined) {
      state.cfg.assistente.voiceURI = String(voiceURI || '').trim();
    }
    if (voiceName !== undefined) {
      state.cfg.assistente.voiceName = String(voiceName || '').trim();
    }
    if (pitch !== undefined && pitch !== null && Number.isFinite(Number(pitch))) {
      state.cfg.assistente.pitch = Math.max(0.5, Math.min(2.0, Number(pitch)));
    }
    if (rate !== undefined && rate !== null && Number.isFinite(Number(rate))) {
      state.cfg.assistente.rate = Math.max(0.5, Math.min(2.0, Number(rate)));
    }
    if (enabled !== undefined) {
      state.cfg.assistente.enabled = Boolean(enabled);
    }
    if (briefingDiarioAtivo !== undefined) {
      state.cfg.assistente.briefingDiarioAtivo = Boolean(briefingDiarioAtivo);
    }
    if (briefingDiarioHorario !== undefined && typeof briefingDiarioHorario === 'string') {
      const h = briefingDiarioHorario.trim();
      if (/^\d{2}:\d{2}$/.test(h)) state.cfg.assistente.briefingDiarioHorario = h;
    }
    if (briefingDiarioDias !== undefined && Array.isArray(briefingDiarioDias)) {
      state.cfg.assistente.briefingDiarioDias = briefingDiarioDias.map(String);
    }
    if (briefingSemanalAtivo !== undefined) {
      state.cfg.assistente.briefingSemanalAtivo = Boolean(briefingSemanalAtivo);
    }
    if (briefingSemanalDia !== undefined && typeof briefingSemanalDia === 'string') {
      state.cfg.assistente.briefingSemanalDia = briefingSemanalDia.trim();
    }
    if (briefingSemanalHorario !== undefined && typeof briefingSemanalHorario === 'string') {
      const h = briefingSemanalHorario.trim();
      if (/^\d{2}:\d{2}$/.test(h)) state.cfg.assistente.briefingSemanalHorario = h;
    }
    if (briefingDestinatarios !== undefined && typeof briefingDestinatarios === 'string') {
      state.cfg.assistente.briefingDestinatarios = briefingDestinatarios.trim();
    }

    const saveRes = await persistTenantState(req, state);
    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({ success: false, error: saveRes?.error || 'Falha ao salvar configurações do assistente.' });
    }
    res.json({ success: true, assistente: state.cfg.assistente });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── BRIEFING EXECUTIVO GERENCIAL DO ASSISTENTE ────────────────────────
async function gerarBriefingExecutivo(req, state) {
  const tenantId = extractTenantId(req);
  const dataHoje = new Date().toISOString().slice(0, 10);

  // 1. Resumo Operacional do Pátio
  const resumoOp = operationalSummaryService.gerarResumoOperacional({
    tenantId,
    state,
    dataReferencia: dataHoje
  });

  // 2. Resumo Financeiro (KPIs e fluxo)
  const kpisFin = financialEngine.calcularKPIsFinanceiros(state, {
    filtro: 'hoje',
    dataRef: dataHoje
  });

  const patio = {
    veiculosNoPatio: resumoOp.veiculosPatio ?? (Array.isArray(state.os) ? state.os.filter(o => o.st !== 'finalizada').length : 0),
    boxesOcupados: resumoOp.boxes?.ocupados ?? 0,
    boxesLivres: resumoOp.boxes?.livres ?? 0,
    totalBoxes: resumoOp.boxes?.total ?? 0,
    taxaOcupacaoPercentual: resumoOp.metricas?.taxaOcupacaoBoxesPercentual ?? 0,
    estagios: resumoOp.estagios || {},
    entregas: resumoOp.entregas || { hoje: 0, emRisco: 0, atrasadas: 0 },
    maiorGargalo: resumoOp.maiorGargalo || null
  };

  const financeiro = {
    saldoConsolidado: kpisFin.saldoConsolidado ?? 0,
    vencimentosHoje: {
      aReceber: kpisFin.totalRecHoje ?? 0,
      qtdReceber: kpisFin.qtdRecHoje ?? 0,
      aPagar: kpisFin.totalPagHoje ?? 0,
      qtdPagar: kpisFin.qtdPagHoje ?? 0,
      liquido: kpisFin.liquidoHoje ?? 0
    },
    vencimentosSemana: {
      aReceber: kpisFin.totRec7d ?? 0,
      aPagar: kpisFin.totPag7d ?? 0,
      saldoPrevisto: kpisFin.saldoPrevisto7d ?? 0
    },
    inadimplencia: {
      totalVencidos: kpisFin.totalRecVencidos ?? 0,
      qtdVencidos: kpisFin.qtdRecVencidos ?? 0
    },
    totalReceberAberto: kpisFin.totalReceberAberto ?? 0,
    totalPagarAberto: kpisFin.totalPagarAberto ?? 0
  };

  const empresa = state.cfg?.empresa || 'Auto Molas Fort';
  const agoraFormatada = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

  let textoFormatado = `📊 *BRIEFING GERENCIAL EXECUTIVO — PÁTIO CRM*\n`;
  textoFormatado += `📅 *Gerado em:* ${agoraFormatada}\n`;
  textoFormatado += `🏢 *Empresa:* ${empresa}\n\n`;

  textoFormatado += `════════════════════════════\n`;
  textoFormatado += `💰 *1. POSIÇÃO FINANCEIRA*\n`;
  textoFormatado += `════════════════════════════\n`;
  textoFormatado += `💵 *Saldo em Caixa:* R$ ${Number(financeiro.saldoConsolidado).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}\n`;
  textoFormatado += `🟢 *A Receber Hoje:* R$ ${Number(financeiro.vencimentosHoje.aReceber).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} (${financeiro.vencimentosHoje.qtdReceber} títulos)\n`;
  textoFormatado += `🔴 *A Pagar Hoje:* R$ ${Number(financeiro.vencimentosHoje.aPagar).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} (${financeiro.vencimentosHoje.qtdPagar} contas)\n`;
  textoFormatado += `⚖️ *Resultado Líquido do Dia:* R$ ${Number(financeiro.vencimentosHoje.liquido).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}\n`;
  textoFormatado += `🗓️ *Previsão 7 Dias:* R$ ${Number(financeiro.vencimentosSemana.saldoPrevisto).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} (Rec: R$ ${Number(financeiro.vencimentosSemana.aReceber).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} / Pag: R$ ${Number(financeiro.vencimentosSemana.aPagar).toLocaleString('pt-BR', { minimumFractionDigits: 2 })})\n`;
  if (financeiro.inadimplencia.qtdVencidos > 0) {
    textoFormatado += `⚠️ *Atenção Cobrança:* ${financeiro.inadimplencia.qtdVencidos} título(s) vencido(s) (R$ ${Number(financeiro.inadimplencia.totalVencidos).toLocaleString('pt-BR', { minimumFractionDigits: 2 })})\n`;
  }

  textoFormatado += `\n════════════════════════════\n`;
  textoFormatado += `🚛 *2. OPERAÇÃO & PÁTIO*\n`;
  textoFormatado += `════════════════════════════\n`;
  textoFormatado += `🚚 *Veículos no Pátio:* ${patio.veiculosNoPatio}\n`;
  textoFormatado += `🔧 *Ocupação de Boxes:* ${patio.boxesOcupados} de ${patio.totalBoxes} (${patio.taxaOcupacaoPercentual}%)\n`;
  textoFormatado += `📋 *Estágios Ativos:* Fila (${patio.estagios.fila || 0}) | Diagnóstico (${patio.estagios.diagnostico || 0}) | Aprovação (${patio.estagios.aprovacao || 0}) | Execução (${patio.estagios.executando || 0}) | Aguardando Peça (${patio.estagios.peca || 0}) | Prontos (${patio.estagios.pronto || 0})\n`;
  textoFormatado += `📦 *Entregas Hoje:* ${patio.entregas.hoje} previstas | ${patio.entregas.emRisco} em risco | ${patio.entregas.atrasadas} atrasadas\n`;
  if (patio.maiorGargalo) {
    textoFormatado += `⚠️ *Gargalo Identificado:* ${patio.maiorGargalo.descricao || patio.maiorGargalo.tipo}\n`;
  }

  return {
    patio,
    financeiro,
    textoFormatado,
    geradoEm: new Date().toISOString()
  };
}

app.get('/api/assistente/briefing', requirePermission('financial:read', 'admin:settings'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const briefing = await gerarBriefingExecutivo(req, state);
    res.json({ success: true, briefing });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/assistente/briefing/gerar', requirePermission('financial:read', 'admin:settings'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const briefing = await gerarBriefingExecutivo(req, state);
    res.json({ success: true, briefing });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/* ── Rotas Públicas de Aprovação Digital do Cliente (Sem login, via Token HMAC) ── */
app.get('/aprovacao/:token', limiterAprovacaoPublica, (req, res) => {
  const publicDir = path.resolve(ROOT_DIR, 'public');
  const filePath = path.join(publicDir, 'aprovacao.html');
  if (fs.existsSync(filePath)) {
    return res.sendFile('aprovacao.html', { root: publicDir }, (err) => {
      if (err && !res.headersSent) {
        res.status(err.status || 500).send('Erro ao carregar página de aprovação.');
      }
    });
  }
  return res.status(404).send('Página de aprovação não encontrada.');
});

app.get('/api/aprovacao/:token', limiterAprovacaoPublica, async (req, res) => {
  try {
    const token = req.params.token;
    const validacao = validarTokenAprovacaoOrcamento(token);
    if (!validacao.ok) {
      return res.status(validacao.expirado ? 410 : 400).json({
        success: false,
        error: validacao.error,
        expirado: validacao.expirado
      });
    }

    const { tenantId } = validacao.payload;
    const state = (await getState(tenantId)) || getDefaultState(tenantId);
    const consulta = quotationService.consultarPorToken({ tokenString: token, state });
    if (!consulta.ok) {
      return res.status(consulta.status || 400).json({
        success: false,
        error: consulta.error,
        conflict: consulta.conflict
      });
    }

    res.json({
      success: true,
      quotation: consulta.quotation,
      fotosInspecao: consulta.fotosInspecao
    });
  } catch (err) {
    console.error('[API /api/aprovacao/:token GET] Erro:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/aprovacao/:token/decidir', limiterAprovacaoPublica, async (req, res) => {
  try {
    const token = req.params.token;
    const validacao = validarTokenAprovacaoOrcamento(token);
    if (!validacao.ok) {
      return res.status(validacao.expirado ? 410 : 400).json({
        success: false,
        error: validacao.error
      });
    }

    const { tenantId } = validacao.payload;
    const { aprovarTudo, recusarTudo, itensAprovadosIds, itensRecusadosIds, motivoRecusa } = req.body || {};

    let resultadoFinal = null;
    const mutateRes = await mutateTenantState(
      { securityContext: { tenantId, actorId: 'cliente_aprovacao', role: 'customer', permissions: ['*'], channel: 'internal' } },
      async (draft) => {
        const resultado = quotationService.processarAprovacaoCliente({
          tenantId,
          state: draft,
          tokenString: token,
          itensAprovadosIds,
          itensRecusadosIds,
          aprovarTudo: Boolean(aprovarTudo),
          recusarTudo: Boolean(recusarTudo),
          motivoRecusa,
          canalAprovacao: 'link_digital',
          ipOrigem: req.ip || (req.connection && req.connection.remoteAddress) || '127.0.0.1',
          userAgent: req.headers['user-agent'] || 'Browser',
          actorId: 'cliente_web'
        });
        resultadoFinal = resultado;

        if (!resultado.ok) {
          return {
            abort: true,
            status: resultado.status || 400,
            error: resultado.error || 'Falha ao processar aprovação do orçamento.'
          };
        }

        return draft;
      }
    );

    if (!mutateRes.ok) {
      return res.status(mutateRes.status || 400).json({
        success: false,
        error: mutateRes.error || resultadoFinal?.error || 'Falha ao persistir aprovação.',
        ...resultadoFinal
      });
    }

    res.json({
      success: true,
      ...resultadoFinal,
      novoEstado: { versao: mutateRes.versao }
    });
  } catch (err) {
    if (err instanceof PersistenceError || err.name === 'PersistenceError') {
      return res.status(err.status || 409).json({
        success: false,
        ok: false,
        error: err.message,
        conflict: err.conflict,
        versao: err.versao
      });
    }
    console.error('[API /api/aprovacao/:token/decidir POST] Erro:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/* ── 9. CONFORMIDADE LGPD (Exportação e Anonimização de Titulares) ── */
app.get('/api/lgpd/clientes/:id/exportar', requirePermission('crm:read'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const tenantId = extractTenantId(req);
    const resultado = await lgpdService.exportarDadosClienteAsync({ tenantId, state, customerId: req.params.id });
    if (!resultado.ok) return res.status(resultado.status || 404).json(resultado);
    res.json(resultado);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/lgpd/clientes/:id/anonimizar', requirePermission('crm:write', 'admin:settings'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const tenantId = extractTenantId(req);
    const { motivo } = req.body || {};
    const resultado = lgpdService.anonimizarDadosCliente({
      tenantId,
      state,
      customerId: req.params.id,
      motivo,
      ator: req.securityContext?.actorId || 'operador'
    });
    if (!resultado.ok) return res.status(404).json(resultado);
    const saveRes = await persistTenantState(req, state);
    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({ success: false, error: saveRes?.error || 'Falha ao anonimizar cliente.' });
    }
    res.json(resultado);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/* ── 10. ONBOARDING & DADOS DE DEMONSTRAÇÃO ─────────────────────── */
app.post('/api/onboarding/demo-data', requirePermission('company:settings', 'admin:settings'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const tenantId = extractTenantId(req);
    const resultado = demoDataService.carregarDadosDemonstracao({
      tenantId,
      state,
      ator: req.securityContext?.actorId || 'administrador'
    });
    const saveRes = await persistTenantState(req, state);
    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({ success: false, error: saveRes?.error || 'Falha ao carregar dados de demonstração.' });
    }
    res.json(resultado);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/onboarding/demo-data', requirePermission('company:settings', 'admin:settings'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const tenantId = extractTenantId(req);
    const resultado = demoDataService.removerDadosDemonstracao({
      tenantId,
      state,
      ator: req.securityContext?.actorId || 'administrador'
    });
    const saveRes = await persistTenantState(req, state);
    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({ success: false, error: saveRes?.error || 'Falha ao remover dados de demonstração.' });
    }
    res.json(resultado);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/* ── 11. ASSINATURA SaaS & FEATURE FLAGS ────────────────────────── */
app.get('/api/assinatura', requirePermission('company:settings', 'admin:settings', 'reports:read'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const tenantId = extractTenantId(req);
    const sub = subscriptionService.obterAssinatura(tenantId, state);
    res.json({ success: true, subscription: sub });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.put('/api/assinatura/plano', requirePermission('admin:settings'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const tenantId = extractTenantId(req);
    const { plano, billingCycle } = req.body || {};
    const resultado = subscriptionService.atualizarPlano({
      tenantId,
      state,
      novoPlano: plano,
      billingCycle,
      ator: req.securityContext?.actorId || 'administrador'
    });
    const saveRes = await persistTenantState(req, state);
    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({ success: false, error: saveRes?.error || 'Falha ao atualizar plano de assinatura.' });
    }
    res.json({ success: true, ...resultado });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

/* ── Gestão Operacional Proativa (Operational Intelligence Engine) ── */
app.get('/api/operacao/resumo', requirePermission('operation:read'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const tenantId = extractTenantId(req);
    const { data, hora } = req.query || {};
    const resumo = operationalSummaryService.gerarResumoOperacional({
      tenantId,
      state,
      dataReferencia: data,
      horaReferencia: hora
    });
    res.json({
      success: true,
      resumo
    });
  } catch (err) {
    console.error('[API /api/operacao/resumo GET] Erro:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/operacao/alertas', requirePermission('operation:read'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const tenantId = extractTenantId(req);
    const { status, severidade, prioridade, tipo, limit } = req.query || {};
    const alertas = operationalIntelligenceEngine.listarEventos({
      tenantId,
      state,
      status,
      severidade,
      prioridade,
      tipo,
      limit: limit ? Number(limit) : 50
    });
    res.json({
      success: true,
      total: alertas.length,
      alertas
    });
  } catch (err) {
    console.error('[API /api/operacao/alertas GET] Erro:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/operacao/alertas/:id', requirePermission('operation:read'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const tenantId = extractTenantId(req);
    const alerta = operationalIntelligenceEngine.obterEvento({
      tenantId,
      state,
      eventId: req.params.id
    });
    if (!alerta) {
      return res.status(404).json({ error: 'Alerta operacional não encontrado.' });
    }
    res.json({
      success: true,
      alerta
    });
  } catch (err) {
    console.error('[API /api/operacao/alertas/:id GET] Erro:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/operacao/alertas/:id/reconhecer', requirePermission('operation:read', 'operation:manage'), async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    const { motivo } = req.body || {};
    let resultado = null;
    const saveRes = await mutateTenantState(req, (draft) => {
      resultado = operationalIntelligenceEngine.reconhecerEvento({
        tenantId,
        eventId: req.params.id,
        actorId: req.securityContext?.actorId || 'operador',
        motivo,
        state: draft
      });
      if (!resultado.ok) {
        return { abort: true, resultado };
      }
    });
    if (saveRes?.aborted && saveRes?.mutatorResult?.resultado) {
      const r = saveRes.mutatorResult.resultado;
      return res.status(r.status || 400).json(r);
    }
    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({
        success: false,
        error: saveRes?.error || 'Falha ao reconhecer alerta operacional.'
      });
    }
    res.json({
      success: true,
      alerta: resultado.evento,
      novoEstado: { versao: saveRes.versao }
    });
  } catch (err) {
    console.error('[API /api/operacao/alertas/:id/reconhecer POST] Erro:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/operacao/gargalos', requirePermission('operation:read'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const tenantId = extractTenantId(req);
    const resumo = operationalSummaryService.gerarResumoOperacional({
      tenantId,
      state
    });
    res.json({
      success: true,
      maiorGargalo: resumo.maiorGargalo,
      estagios: resumo.estagios
    });
  } catch (err) {
    console.error('[API /api/operacao/gargalos GET] Erro:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/operacao/painel', requirePermission('operation:read'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const tenantId = extractTenantId(req);
    const { data, hora, filtroStatus, busca } = req.query || {};
    const painel = operationalSummaryService.gerarPainelOperacionalCompleto({
      tenantId,
      state,
      dataReferencia: data,
      horaReferencia: hora,
      filtroStatus,
      busca
    });
    res.json({
      success: true,
      painel
    });
  } catch (err) {
    console.error('[API /api/operacao/painel GET] Erro:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/operacao/historico', requirePermission('operation:read'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const tenantId = extractTenantId(req);
    const { periodo } = req.query || {};
    const historico = operationalSummaryService.obterHistoricoSnapshots({
      tenantId,
      state,
      periodo
    });
    res.json({
      success: true,
      total: historico.length,
      historico
    });
  } catch (err) {
    console.error('[API /api/operacao/historico GET] Erro:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/operacao/avaliar', requirePermission('operation:manage'), async (req, res) => {
  const tenantId = extractTenantId(req);
  if (runningEvaluations.has(tenantId)) {
    return res.status(429).json({ error: 'Avaliação operacional já em execução para este tenant.' });
  }
  runningEvaluations.add(tenantId);
  try {
    const { dataReferencia, horaReferencia, agoraIso } = req.body || {};
    let resultado = null;
    const saveRes = await mutateTenantState(req, (draft) => {
      resultado = operationalIntelligenceEngine.avaliarOperacao({
        tenantId,
        state: draft,
        dataReferencia,
        horaReferencia,
        agoraIso
      });
    });
    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({
        success: false,
        error: saveRes?.error || 'Falha ao avaliar operação.'
      });
    }
    res.json({
      success: true,
      ...resultado,
      novoEstado: { versao: saveRes.versao }
    });
  } catch (err) {
    console.error('[API /api/operacao/avaliar POST] Erro:', err);
    res.status(500).json({ error: err.message });
  } finally {
    runningEvaluations.delete(tenantId);
  }
});

/* ── BILLING & PLATAFORMA SAAS (REAL SOLUÇÕES) ─────────────── */

// Rate Limiter para Webhooks
const limiterWebhooks = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 600,
  message: { error: 'Limite de webhooks excedido temporariamente.' },
  standardHeaders: true,
  legacyHeaders: false
});

// 1. Webhook do Gateway de Pagamento (Idempotência e Assinatura Estrita)
app.post('/webhooks/billing/:provider', limiterWebhooks, async (req, res) => {
  const provider = req.params.provider;
  try {
    const result = await billingService.processWebhookEvent({
      provider,
      rawBody: req.rawBody,
      body: req.body,
      headers: req.headers
    });

    if (!result.ok) {
      return res.status(result.status || 401).json({ error: result.error });
    }

    // Se o webhook atualizou a assinatura de um tenant existente, sincroniza no state do SQLite
    if (result.tenantId && isValidTenantId(result.tenantId)) {
      try {
        const subAtual = billingService.getSubscription(result.tenantId);
        await mutateTenantState({ securityContext: { tenantId: result.tenantId, role: 'system', permissions: ['*'] } }, (draft) => {
          draft.subscription = {
            ...subAtual,
            features: subAtual.status === 'suspended' || subAtual.status === 'expired'
              ? ['os', 'clientes', 'veiculos', 'export', 'billing', 'support']
              : (subscriptionService.PLANOS_FEATURES[subAtual.plan] || subscriptionService.PLANOS_FEATURES.pro)
          };
        });
      } catch (syncErr) {
        console.warn(`[Webhook Billing] Aviso ao sincronizar state do tenant ${result.tenantId}:`, syncErr.message);
      }
    }

    return res.status(200).json(result);
  } catch (err) {
    console.error(`[Webhook Billing / ${provider}] Erro crítico:`, err);
    return res.status(500).json({ error: err.message });
  }
});

// 2. Consulta Pública de Catálogo de Planos
app.get('/api/public/planos', (req, res) => {
  res.json({
    ok: true,
    plans: BILLING_CONFIG.plans,
    setupFee: BILLING_CONFIG.setupFee,
    trial: BILLING_CONFIG.trial
  });
});

// 3. Cadastro Self-Service com Provisionamento Automático de Tenant
app.post('/api/auth/signup', async (req, res) => {
  const { nome, empresa, whatsapp, email, senha, utm_source, utm_medium, utm_campaign, utm_content, referralCode, aceitouTermos } = req.body || {};

  if (!nome || !empresa || !email || !senha) {
    return res.status(400).json({ error: 'Campos obrigatórios: nome, empresa, email, senha.' });
  }

  // Validação rigorosa de política de senhas (mínimo 12 caracteres em produção)
  const isTest = process.env.NODE_ENV !== 'production';
  const pwCheck = userRepository.validatePasswordPolicy(senha, { allowWeakInTest: isTest });
  if (!pwCheck.valid) {
    return res.status(400).json({ error: `Senha inválida: ${pwCheck.errors.join(' ')}` });
  }

  // Gera slug seguro de tenant
  const slugBase = empresa.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '_')
    .slice(0, 20);
  const tenantSlug = `oficina_${slugBase}_${crypto.randomBytes(3).toString('hex')}`;

  try {
    // 3.1 Inicializa o estado padrão da nova oficina
    const newState = getDefaultState(tenantSlug);
    newState.cfg.empresa = empresa.trim();
    if (whatsapp) newState.cfg.fone = whatsapp.trim();
    newState.cfg.contatoResponsavel = nome.trim();

    // 3.2 Vincula Trial Pro de 14 dias
    const trialDays = BILLING_CONFIG.trial.durationDays;
    const now = new Date();
    const trialEnds = new Date(now.getTime() + trialDays * 24 * 60 * 60 * 1000);

    newState.subscription = {
      tenantId: tenantSlug,
      plan: 'trial',
      status: 'trialing',
      startedAt: now.toISOString(),
      trialEndsAt: trialEnds.toISOString(),
      billingCycle: 'mensal',
      features: [...subscriptionService.PLANOS_FEATURES.pro]
    };

    // 3.3 Persiste no SQLite
    await salvarEstado({
      securityContext: { tenantId: tenantSlug, role: 'admin', permissions: ['*'], channel: 'internal' }
    }, newState);

    const userEmail = email.trim().toLowerCase();

    // 3.4 Criação durável de usuário no banco SQLite com Scrypt
    const userRecord = await userRepository.createUser({
      username: userEmail,
      email: userEmail,
      password: senha,
      role: 'tenant_admin',
      tenantId: tenantSlug,
      allowWeakInTest: isTest,
      memberships: [
        { tenantId: tenantSlug, role: 'tenant_admin', permissions: userRepository.ROLE_PERMISSIONS.tenant_admin }
      ]
    });

    // 3.5 Registro de auditoria do aceite dos Termos de Uso e Política de Privacidade
    if (aceitouTermos) {
      await userRepository.recordTermsConsent({
        userId: userRecord.id,
        tenantId: tenantSlug,
        termsVersion: req.body.termsVersion || '1.0',
        privacyVersion: req.body.privacyVersion || '1.0',
        ipAddress: req.ip || req.connection?.remoteAddress,
        userAgent: req.headers['user-agent']
      });
    }

    // 3.6 Registra usuário no IdentityRegistry em memória para autenticação imediata
    identityRegistry.registerUser({
      username: userEmail,
      password: senha,
      passwordHash: userRecord.password_hash,
      salt: userRecord.password_salt,
      memberships: [
        { tenantId: tenantSlug, role: 'tenant_admin', permissions: userRepository.ROLE_PERMISSIONS.tenant_admin }
      ]
    });

    // 3.7 Registra no subsistema de billing
    await billingService.getOrCreateBillingCustomer({
      tenantId: tenantSlug,
      legalName: empresa.trim(),
      email: userEmail,
      phone: whatsapp ? whatsapp.trim() : ''
    });
    await billingService.initializeSubscription({
      tenantId: tenantSlug,
      plan: 'pro',
      status: 'trialing',
      startedAt: now.toISOString()
    });

    // 3.8 Registra telemetria comercial de cadastro e início de trial (sem PII)
    saasTelemetry.recordTenantSignup(tenantSlug, {
      utmSource: utm_source,
      utmMedium: utm_medium,
      utmCampaign: utm_campaign,
      utmContent: utm_content,
      referralCode
    });

    return res.status(201).json({
      ok: true,
      tenantId: tenantSlug,
      user: { username: userEmail, name: nome.trim() },
      subscription: newState.subscription,
      redirect: '/#onboarding'
    });
  } catch (err) {
    console.error('[API /api/auth/signup POST] Erro ao provisionar tenant:', err);
    return res.status(500).json({ error: 'Falha ao provisionar tenant: ' + err.message });
  }
});

async function recordSecurityAudit({
  tenantId = null,
  actorId = 'system',
  actorType = 'user',
  action,
  entity = null,
  entityId = null,
  ipAddress = null,
  details = {}
}) {
  const auditId = `sec_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  const now = new Date().toISOString();
  try {
    const { run } = require('./db');
    await run(`INSERT INTO security_audit_log (
      id, tenant_id, actor_id, actor_type, action, entity, entity_id, ip_address, details_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
      auditId, tenantId, actorId, actorType, action, entity, entityId,
      ipAddress || null, JSON.stringify(details || {}), now
    ]);
  } catch (err) {
    console.warn('[SecurityAudit] Aviso ao gravar log de auditoria:', err.message);
  }
}

// 4. Autenticação Formal: Login, Troca de Senha, Recuperação e Redefinição
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'Credenciais ausentes: username e password são obrigatórios.' });
  }

  const cleanUser = String(username).trim().toLowerCase();
  const clientIp = req.ip || req.connection?.remoteAddress || '';

  try {
    const authRes = await userRepository.authenticateUser(cleanUser, password);
    if (!authRes.success) {
      await recordSecurityAudit({
        actorId: cleanUser,
        action: authRes.locked ? 'USER_LOCKED_OUT' : 'USER_LOGIN_FAILED',
        entity: 'user',
        entityId: cleanUser,
        ipAddress: clientIp,
        details: { attempts: authRes.attempts, locked: authRes.locked }
      });

      const statusCode = authRes.locked ? 423 : 401;
      return res.status(statusCode).json({
        error: authRes.locked ? 'account_locked' : 'invalid_credentials',
        message: authRes.error
      });
    }

    const { user } = authRes;
    await recordSecurityAudit({
      tenantId: user.memberships[0]?.tenantId || null,
      actorId: user.username,
      action: 'USER_LOGIN_SUCCESS',
      entity: 'user',
      entityId: user.id,
      ipAddress: clientIp
    });

    identityRegistry.registerUser({
      username: user.username,
      password,
      passwordHash: user.password_hash,
      salt: user.password_salt,
      mustChangePassword: user.mustChangePassword,
      memberships: user.memberships
    });

    return res.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
        role: user.role,
        mustChangePassword: user.mustChangePassword,
        memberships: user.memberships
      }
    });
  } catch (err) {
    console.error('[API /api/auth/login POST] Erro:', err);
    res.status(500).json({ error: 'Erro interno ao autenticar usuário.' });
  }
});

app.post('/api/auth/change-password', async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  const userContext = req.securityContext;

  if (!userContext || !userContext.actorId) {
    return res.status(401).json({ error: 'Requer autenticação prévia.' });
  }

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'currentPassword e newPassword são obrigatórios.' });
  }

  const username = userContext.actorId.toLowerCase();
  const clientIp = req.ip || req.connection?.remoteAddress || '';

  try {
    const authCheck = await userRepository.authenticateUser(username, currentPassword);
    if (!authCheck.success) {
      return res.status(401).json({ error: 'Senha atual incorreta.' });
    }

    const isTest = process.env.NODE_ENV !== 'production';
    await userRepository.updatePassword(authCheck.user.id, newPassword, { allowWeakInTest: isTest });
    identityRegistry.invalidateUser(username);

    await recordSecurityAudit({
      tenantId: userContext.tenantId,
      actorId: username,
      action: 'PASSWORD_CHANGED',
      entity: 'user',
      entityId: authCheck.user.id,
      ipAddress: clientIp
    });

    res.json({ success: true, message: 'Senha alterada com sucesso.' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

let passwordResetDeliveryAdapter = null;
function setPasswordResetDeliveryAdapter(adapter) {
  passwordResetDeliveryAdapter = adapter;
}

app.post('/api/auth/recuperar-senha', async (req, res) => {
  const { username, email } = req.body || {};
  const identifier = username || email;
  if (!identifier) {
    return res.status(400).json({ error: 'Informe o e-mail ou nome de usuário.' });
  }

  const clientIp = req.ip || req.connection?.remoteAddress || '';
  const hasDeliveryChannel = Boolean(
    passwordResetDeliveryAdapter ||
    process.env.SMTP_HOST ||
    process.env.MAIL_PROVIDER
  );

  try {
    const tokenInfo = await userRepository.createPasswordResetToken(identifier);
    if (tokenInfo) {
      await recordSecurityAudit({
        actorId: String(identifier).toLowerCase(),
        action: 'PASSWORD_RESET_REQUESTED',
        entity: 'user',
        entityId: tokenInfo.userId,
        ipAddress: clientIp
      });

      if (passwordResetDeliveryAdapter && typeof passwordResetDeliveryAdapter.sendResetLink === 'function') {
        await passwordResetDeliveryAdapter.sendResetLink({
          identifier,
          userId: tokenInfo.userId,
          token: tokenInfo.token,
          expiresAt: tokenInfo.expiresAt
        });
      }
    }

    if (!hasDeliveryChannel) {
      return res.status(200).json({
        success: false,
        status: 'delivery_channel_not_configured',
        message: 'Nenhum provedor de e-mail (SMTP) ou mensageria está configurado nesta instância do Pátio CRM. Para recuperação de acesso, solicite a redefinição diretamente a um Administrador da Oficina no painel administrativo.',
        procedure: 'administrative_reset_required'
      });
    }

    return res.json({
      success: true,
      message: 'Se a conta existir, as instruções de recuperação foram enviadas ao canal cadastrado.'
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/auth/resetar-senha', async (req, res) => {
  const { token, newPassword } = req.body || {};
  if (!token || !newPassword) {
    return res.status(400).json({ error: 'token e newPassword são obrigatórios.' });
  }

  const clientIp = req.ip || req.connection?.remoteAddress || '';
  const isTest = process.env.NODE_ENV !== 'production';

  try {
    const result = await userRepository.resetPasswordWithToken(token, newPassword, { allowWeakInTest: isTest });
    identityRegistry.invalidateUser(result.username);

    await recordSecurityAudit({
      actorId: result.username,
      action: 'PASSWORD_RESET_COMPLETED',
      entity: 'user',
      entityId: result.userId,
      ipAddress: clientIp
    });

    res.json({ success: true, message: 'Senha redefinida com sucesso. Faça login com a nova senha.' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/auditoria', requirePermission('admin:settings'), async (req, res) => {
  try {
    const tenantId = req.securityContext?.tenantId;
    const isPlatform = ['platform_admin', 'platform_support'].includes(req.securityContext?.role);
    const { action, page = 1, limit = 50 } = req.query;

    const lim = Math.max(1, Math.min(Number(limit) || 50, 200));
    const offset = (Math.max(1, Number(page) || 1) - 1) * lim;

    let whereSql = ' WHERE 1=1';
    const whereParams = [];

    if (!isPlatform && tenantId && tenantId !== '_all_') {
      whereSql += ' AND tenant_id = ?';
      whereParams.push(tenantId);
    }

    if (action) {
      whereSql += ' AND action = ?';
      whereParams.push(action);
    }

    const { all, get } = require('./db');
    const countRow = await get(`SELECT COUNT(*) as total FROM security_audit_log${whereSql}`, whereParams);

    const queryParams = [...whereParams, lim, offset];
    const sql = `SELECT * FROM security_audit_log${whereSql} ORDER BY created_at DESC LIMIT ? OFFSET ?`;
    const rows = await all(sql, queryParams);

    res.json({
      success: true,
      items: (rows || []).map(r => ({
        id: r.id,
        tenantId: r.tenant_id,
        actorId: r.actor_id,
        actorType: r.actor_type,
        action: r.action,
        entity: r.entity,
        entityId: r.entity_id,
        ipAddress: r.ip_address,
        details: JSON.parse(r.details_json || '{}'),
        createdAt: r.created_at
      })),
      total: countRow ? countRow.total : 0,
      page: Number(page) || 1,
      limit: lim
    });
  } catch (err) {
    console.error('[API /api/auditoria GET] Erro:', err);
    res.status(500).json({ error: err.message });
  }
});

/* ── LGPD: Registro de Aceite de Termos de Uso e Privacidade ── */
app.post('/api/lgpd/aceite-termos', async (req, res) => {
  try {
    const { userId, tenantId, termsVersion = '1.0', privacyVersion = '1.0' } = req.body || {};
    const targetUserId = userId || req.securityContext?.actorId;
    const targetTenantId = tenantId || req.securityContext?.tenantId;
    if (!targetUserId || !targetTenantId) {
      return res.status(400).json({ error: 'userId e tenantId são obrigatórios.' });
    }
    const record = await userRepository.recordTermsConsent({
      userId: targetUserId,
      tenantId: targetTenantId,
      termsVersion,
      privacyVersion,
      ipAddress: req.ip || req.connection?.remoteAddress,
      userAgent: req.headers['user-agent']
    });
    res.json({ success: true, consent: record });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ── Camada Canônica de Integração ERP (Fiscal & Contábil) ── */
app.get('/api/integracao/erp/status', requirePermission('reports:read', 'admin:settings', 'erp:sync'), async (req, res) => {
  try {
    const tenantId = req.securityContext?.tenantId || 'default';
    const status = await erpIntegrationService.obterStatusIntegracao({ tenantId });
    res.json({ success: true, ...status });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/integracao/erp/exportar/:entidade', requirePermission('reports:read', 'financial:read', 'erp:sync'), async (req, res) => {
  try {
    const { entidade } = req.params;
    const { desde, limit, cursor } = req.query;
    const state = await getOrLoadState(req);

    let resultado;
    switch (entidade) {
      case 'clientes':
        resultado = erpIntegrationService.exportarClientes({ state, desde, limit, cursor });
        break;
      case 'fornecedores':
        resultado = erpIntegrationService.exportarFornecedores({ state, desde, limit, cursor });
        break;
      case 'pecas':
        resultado = erpIntegrationService.exportarPecas({ state, desde, limit, cursor });
        break;
      case 'os':
      case 'ordens-servico':
        resultado = erpIntegrationService.exportarOrdensServico({ state, desde, limit, cursor });
        break;
      case 'contas':
        resultado = erpIntegrationService.exportarContas({ state, desde, limit, cursor });
        break;
      case 'pedidos-compra':
        resultado = erpIntegrationService.exportarPedidosCompra({ state, desde, limit, cursor });
        break;
      default:
        return res.status(400).json({
          error: `Entidade desconhecida '${entidade}'. Suportadas: clientes, fornecedores, pecas, os, contas, pedidos-compra.`
        });
    }

    res.json({
      success: true,
      entidade,
      schemaVersion: erpIntegrationService.SCHEMA_VERSION,
      ...resultado
    });
  } catch (err) {
    console.error('[API /api/integracao/erp/exportar] Erro:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/integracao/erp/sincronizar', requirePermission('erp:sync', 'admin:settings'), async (req, res) => {
  try {
    const tenantId = req.securityContext?.tenantId || 'default';
    const { entityType, entityId, erpExternalId, status = 'synced', errorMessage } = req.body || {};
    if (!entityType || !entityId) {
      return res.status(400).json({ error: 'entityType e entityId são obrigatórios.' });
    }
    const result = await erpIntegrationService.registrarSincronizacao({
      tenantId,
      entityType,
      entityId,
      erpExternalId,
      status,
      errorMessage
    });
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/integracao/erp/enfileirar', requirePermission('erp:sync', 'admin:settings'), async (req, res) => {
  try {
    const tenantId = req.securityContext?.tenantId || 'default';
    const { entityType, entityId, action, payload } = req.body || {};
    const result = await erpIntegrationService.enfileirarParaERP({
      tenantId,
      entityType,
      entityId,
      action,
      payload
    });
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/integracao/erp/outbox', requirePermission('erp:sync', 'admin:settings', 'reports:read'), async (req, res) => {
  try {
    const tenantId = req.securityContext?.tenantId || 'default';
    const { status, limit, offset } = req.query;
    const items = await erpIntegrationService.listarItensOutbox({
      tenantId,
      status: status || null,
      limit: limit ? Number(limit) : 50,
      offset: offset ? Number(offset) : 0
    });
    res.json({ success: true, count: items.length, items });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/integracao/erp/outbox/processar', requirePermission('erp:sync', 'admin:settings'), async (req, res) => {
  try {
    const tenantId = req.securityContext?.tenantId || 'default';
    const result = await erpIntegrationService.processarFilaOutbox({ tenantId });
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. Criação de Checkout (Self-Service de Assinatura)
app.post('/api/billing/checkout', async (req, res) => {
  const {
    tenantId,
    plan = 'pro',
    paymentMethod = 'pix',
    couponCode = null,
    isSetupFeeExempt = false,
    setupExemptionReason = null,
    setupAuthorizedBy = null,
    customerData = {}
  } = req.body || {};

  const tid = tenantId || extractTenantId(req);
  if (!tid) return res.status(400).json({ error: 'tenantId obrigatório para checkout.' });

  try {
    const checkoutResult = await billingService.createCheckout({
      tenantId: tid,
      plan,
      paymentMethod,
      couponCode,
      isSetupFeeExempt,
      setupExemptionReason,
      setupAuthorizedBy,
      customerData
    });
    res.json(checkoutResult);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 5. Geração de Imagem Dinâmica de QR Code PIX
app.get('/api/billing/pix/qr/:checkoutId.png', async (req, res) => {
  try {
    const text = `00020101021226840014br.gov.bcb.pix2562qrcodes.patio-crm.com.br/pix/${req.params.checkoutId}`;
    const qrBuffer = await QRCode.toBuffer(text, { width: 300, margin: 2 });
    res.setHeader('Content-Type', 'image/png');
    res.send(qrBuffer);
  } catch (err) {
    res.status(500).send('Erro ao gerar QR Code.');
  }
});

// 6. Consulta de Assinatura do Tenant
app.get('/api/billing/subscription', requirePermission('admin:settings'), async (req, res) => {
  const tenantId = extractTenantId(req);
  const sub = billingService.getSubscription(tenantId);
  const cost = saasTelemetry.getCostToServe(tenantId, sub.price);
  res.json({ ok: true, subscription: sub, costToServe: cost });
});

// 7. Alteração de Plano (Upgrade/Downgrade)
app.post('/api/billing/change-plan', requirePermission('admin:settings'), async (req, res) => {
  const tenantId = extractTenantId(req);
  const { newPlan, immediate } = req.body || {};

  try {
    const result = await billingService.changeSubscriptionPlan({
      tenantId,
      newPlan,
      immediate,
      actor: req.securityContext?.actorId || 'admin'
    });

    // Atualiza o state local se aplicou imediatamente
    if (result.mode === 'applied_immediately') {
      await mutateTenantState(req, async (draft) => {
        draft.subscription = {
          ...draft.subscription,
          plan: newPlan,
          features: [...subscriptionService.PLANOS_FEATURES[newPlan]]
        };
        return draft;
      });
      saasTelemetry.recordTelemetryEvent('plan_upgraded', { tenantId, metadata: { newPlan } });
    } else {
      saasTelemetry.recordTelemetryEvent('plan_downgraded', { tenantId, metadata: { newPlan } });
    }

    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 8. Cancelamento de Assinatura
app.post('/api/billing/cancel', requirePermission('admin:settings'), async (req, res) => {
  const tenantId = extractTenantId(req);
  const { reason = 'outro', immediate = false } = req.body || {};

  try {
    const result = await billingService.cancelSubscription({
      tenantId,
      reason,
      immediate,
      actor: req.securityContext?.actorId || 'admin'
    });

    saasTelemetry.recordTelemetryEvent('subscription_cancelled', { tenantId, metadata: { reason, immediate } });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 9. Histórico de Pagamentos e Faturas
app.get('/api/billing/history', requirePermission('admin:settings'), (req, res) => {
  const tenantId = extractTenantId(req);
  const history = billingService.getBillingHistory(tenantId);
  res.json({ ok: true, invoices: history });
});

/* ── ROTAS DE PLATAFORMA SAAS (REAL SOLUÇÕES ADMIN) ───────── */

// 10. Métricas Oficiais da Plataforma (MRR, ARR, Churn, Funil)
app.get('/api/platform/metrics', (req, res) => {
  // Lista assinaturas para consolidar métricas
  const allSubs = [];
  for (const tid of ['default', req.securityContext?.tenantId].filter(Boolean)) {
    allSubs.push(billingService.getSubscription(tid));
  }
  const metricsData = platformAdmin.calculatePlatformMetrics({ subscriptions: allSubs });
  res.json({ ok: true, metrics: metricsData });
});

// 11. Lista de Tenants e Telemetria para Platform Admin
app.get('/api/platform/tenants', async (req, res) => {
  try {
    const rows = await all("SELECT key FROM kv WHERE key LIKE 'tenant:%:state'");
    const tenantsList = [];

    for (const r of (rows || [])) {
      const match = /^tenant:([a-zA-Z0-9_-]+):state$/.exec(r.key);
      if (match) {
        const tid = match[1];
        const sub = billingService.getSubscription(tid);
        const cost = saasTelemetry.getCostToServe(tid, sub.price);
        tenantsList.push({ tenantId: tid, subscription: sub, costToServe: cost });
      }
    }
    res.json({ ok: true, total: tenantsList.length, tenants: tenantsList });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 12. Iniciar Sessão de Suporte (Support Impersonation Auditado)
app.post('/api/platform/support/impersonate', async (req, res) => {
  const { tenantId, operator, reason, durationMinutes = 60 } = req.body || {};
  if (!tenantId || !reason) {
    return res.status(400).json({ error: 'tenantId e reason são obrigatórios.' });
  }

  const op = operator || req.securityContext?.actorId || 'suporte_real_solucoes';
  try {
    let session = null;
    await mutateTenantState(
      { securityContext: { tenantId, role: 'system', permissions: ['*'], channel: 'internal' } },
      async (draft) => {
        session = platformAdmin.createSupportSession({
          tenantId,
          operator: op,
          reason,
          durationMinutes,
          targetState: draft
        });
        return draft;
      }
    );

    res.status(201).json({ ok: true, session });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 13. Fechar Sessão de Suporte
app.post('/api/platform/support/sessions/:id/close', (req, res) => {
  const ok = platformAdmin.closeSupportSession(req.params.id, {
    operator: req.securityContext?.actorId || 'admin'
  });
  res.json({ ok });
});

// 14. Status Geral dos Subsistemas da Plataforma
app.get('/api/platform/status', (req, res) => {
  res.json(platformAdmin.getPlatformSubsystemsStatus());
});

// 15. Trilha de Auditoria da Plataforma
app.get('/api/platform/audit', (req, res) => {
  res.json({ ok: true, auditLog: platformAdmin.platformAuditLog });
});

// 16. Telemetria de Eventos sem PII
app.get('/api/platform/telemetry', (req, res) => {
  res.json({ ok: true, events: saasTelemetry.telemetryEvents });
});

// 17. Reconciliação Periódica de Assinaturas
app.post('/api/platform/reconcile', async (req, res) => {
  const result = await billingService.reconcileSubscriptions();
  res.json({ ok: true, ...result });
});

/* ── PÁGINAS COMERCIAIS PÚBLICAS ──────────────────────────── */
app.get('/precos', (req, res) => res.sendFile('precos.html', { root: path.join(ROOT_DIR, 'public') }));
app.get('/cadastro', (req, res) => res.sendFile('cadastro.html', { root: path.join(ROOT_DIR, 'public') }));
app.get('/checkout', (req, res) => res.sendFile('checkout.html', { root: path.join(ROOT_DIR, 'public') }));
app.get('/assinatura', (req, res) => res.sendFile('assinatura.html', { root: path.join(ROOT_DIR, 'public') }));

/* ── Servir Arquivos Estáticos do Frontend ────────────────── */
app.use('/js', express.static(path.join(ROOT_DIR, 'js'), { dotfiles: 'deny' }));
app.use('/uploads', (req,res,next)=>{
  const tenant=req.securityContext?.tenantId;
  let requested;try{requested=decodeURIComponent(req.path);}catch(_){return res.status(400).end();}
  const base=path.resolve(process.env.UPLOAD_DIR || path.join(ROOT_DIR,'public','uploads'));
  const target=path.resolve(base,'.'+requested),tenantRoot=path.join(base,String(tenant||''));
  const relative=path.relative(tenantRoot,target);
  if(!tenant || requested.split('/')[1]!==tenant || !relative || relative.startsWith('..') || path.isAbsolute(relative))return res.status(404).end();
  if(fs.existsSync(target)){const realRelative=path.relative(tenantRoot,fs.realpathSync(target));if(realRelative.startsWith('..')||path.isAbsolute(realRelative))return res.status(404).end();}
  if(req.path.toLowerCase().endsWith('.svg')) return res.status(403).end();
  next();
}, express.static(process.env.UPLOAD_DIR || path.join(ROOT_DIR,'public','uploads'), {dotfiles:'deny'}));
app.get('/style.css', (req, res) => res.sendFile('style.css', { root: ROOT_DIR }));
app.get('/index.html', (req, res) => res.sendFile('index.html', { root: ROOT_DIR }));
app.use((err, req, res, next) => {
  if (!err) return next();
  const status = err.type === 'entity.too.large' ? 413 : err.status || 500;
  res.status(status).json({ error: status === 413 ? 'Arquivo excede o limite permitido.' : 'Requisição inválida.' });
});

app.get('/', (req, res) => {
  res.sendFile('index.html', { root: ROOT_DIR });
});

/* ── Inicialização do Banco de Dados e Servidor ──────────── */
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

/* ── Encerramento Gracioso de Processos (Puppeteer & WhatsApp) ── */
async function finalizarProcessosFilhos(sinal) {
  console.log(`\n[Servidor] Recebido sinal ${sinal}. Limpando recursos e processos em segundo plano...`);
  try {
    if (browserRenderCache) {
      console.log('[Puppeteer] Fechando navegador de renderização...');
      await browserRenderCache.close().catch(() => {});
      browserRenderCache = null;
    }
  } catch (_) {}
  try {
    if (wppClient) {
      console.log('[WhatsApp] Desconectando sessão com segurança...');
      await wppClient.destroy().catch(() => {});
      wppClient = null;
    }
  } catch (_) {}
}

let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  await finalizarProcessosFilhos(signal);
  if (patioSupport) await patioSupport.close();
  await enqueueWrite(() => closeDB());
  process.exit(0);
}
process.on('SIGINT', () => shutdown('SIGINT').catch(err => { console.error(err); process.exit(1); }));
process.on('SIGTERM', () => shutdown('SIGTERM').catch(err => { console.error(err); process.exit(1); }));

/* ── 1. Consulta Online de Dados do Veículo ──────────────── */
async function consultarDadosVeiculoOnline(placa, cfg = {}) {
  const placaLimpa = placa.replace(/[^A-Z0-9]/gi, '').toUpperCase();

  // Opção A: APIBrasil se credenciais estiverem preenchidas no .env ou no sistema
  const deviceToken = process.env.APIBRASIL_DEVICE_TOKEN || cfg?.apibrasil?.deviceToken;
  const bearerToken = process.env.APIBRASIL_BEARER_TOKEN || cfg?.apibrasil?.bearerToken;

  if (deviceToken && bearerToken) {
    try {
      console.log(`[Consulta Online] Consultando placa ${placaLimpa} na base nacional via APIBrasil...`);
      const resp = await fetch('https://gateway.apibrasil.io/api/v2/veiculos/dados', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'DeviceToken': deviceToken,
          'Authorization': 'Bearer ' + bearerToken
        },
        body: JSON.stringify({ placa: placaLimpa }),
        signal: AbortSignal.timeout(8000)
      });
      const data = await resp.json();
      const veic = data?.data || data?.dados || data;
      if (veic && (veic.marca || veic.modelo)) {
        console.log(`[Consulta Online] Sucesso APIBrasil: ${veic.marca} ${veic.modelo} (${veic.ano || veic.anoModelo})`);
        return {
          marca: veic.marca || veic.brand || 'Caminhão',
          modelo: veic.modelo || veic.model || 'Linha Pesada',
          ano: String(veic.anoModelo || veic.ano || '2022'),
          cor: veic.cor || veic.color || 'Branco',
          tipo: veic.segmento || veic.tipo_veiculo || veic.tipo || 'Cavalo Mecânico',
          municipio: veic.municipio || veic.cidade || '',
          uf: veic.uf || '',
          chassi: veic.chassi || '',
          km: 0,
          origem: 'APIBrasil (Base Nacional Denatran)'
        };
      }
    } catch (e) {
      console.warn('[Consulta Online] Erro ao consultar APIBrasil:', e.message);
    }
  }

  // Opção B: Consulta Inteligente via IA Gemini se disponível
  if (ai) {
    try {
      const prompt = `Consulte ou identifique as informações veiculares correspondentes à placa automotiva brasileira "${placaLimpa}".
Se você identificar o veículo ou se for um caminhão/veículo pesado comercial brasileiro, retorne APENAS um JSON estrito:
{
  "marca": "Ex: Volvo / Scania / Mercedes-Benz / DAF / Iveco / Volkswagen",
  "modelo": "Ex: FH 540 Globetrotter / R 450 Highline / Actros 2651 / XF 480 / Constellation 24.280",
  "ano": "2022",
  "cor": "Branco",
  "tipo": "Cavalo Mecânico"
}
Retorne exclusivamente o JSON, sem markdown ou texto extra.`;

      const respAI = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [{ role: 'user', parts: [{ text: prompt }] }]
      });
      let txt = (respAI.text || '').trim();
      if (txt.startsWith('```')) txt = txt.replace(/^```(json)?/, '').replace(/```$/, '').trim();
      const parsed = JSON.parse(txt);
      if (parsed && parsed.modelo) {
        return {
          marca: parsed.marca || 'Volvo',
          modelo: parsed.modelo || 'FH 540',
          ano: String(parsed.ano || '2022'),
          cor: parsed.cor || 'Branco',
          tipo: parsed.tipo || 'Cavalo Mecânico',
          km: 0,
          origem: 'Consulta Online IA'
        };
      }
    } catch (eAI) {
      console.warn('[Consulta Online] Falha na consulta IA:', eAI.message);
    }
  }

  // Opção C: Fallback para quando todas as consultas online falham
  return {
    marca: 'Não Identificada',
    modelo: 'Caminhão',
    ano: '',
    cor: '',
    tipo: '',
    km: 0,
    origem: 'Cadastro Pendente'
  };
}

/* ── 2. Fluxo Completo de Entrada, Alocação de Box e Abertura de OS ── */
async function processarEntradaVeiculo({ placa, clienteNome, clienteFone, textoOriginal, servicos = [], req = null }) {
  const targetState = await getOrLoadState(req);
  if (!targetState.os) targetState.os = [];
  if (!targetState.veiculos) targetState.veiculos = [];
  if (!targetState.clientes) targetState.clientes = [];
  if (!targetState.boxes) targetState.boxes = [];

  const isSemPlaca = !placa ||
    placa === 'SEM-PLACA' ||
    placa.toUpperCase() === 'SEMPLACA' ||
    /sem\s+placa/i.test(placa) ||
    (!placa && textoOriginal && /sem\s+placa/i.test(textoOriginal));

  let placaLimpa = isSemPlaca ? 'SEM-PLACA' : (placa || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  let veiculo = null;
  let statusCadastro = '';

  if (isSemPlaca) {
    // Localiza ou cadastra cliente
    let cliente = targetState.clientes.find(c =>
      (c.fone && clienteFone && c.fone.includes(clienteFone.slice(-8))) ||
      (c.nome && clienteNome && c.nome.toLowerCase() === clienteNome.toLowerCase())
    );
    if (!cliente) {
      cliente = {
        id: gerarId('c'),
        nome: clienteNome || 'Cliente Recepção',
        fone: clienteFone || '',
        doc: '',
        tipo: 'frotista'
      };
      targetState.clientes.push(cliente);
    }

    // Cria veículo temporário com pendência cadastral
    veiculo = {
      id: gerarId('v'),
      cli: cliente.id,
      placa: 'SEM-PLACA',
      marca: 'Pendente',
      modelo: 'Veículo Não Identificado',
      ano: '',
      cor: 'Não informada',
      tipo: 'Cavalo Mecânico',
      km: 0,
      pendenciaCadastral: true,
      pendencias: ['placa_pendente'],
      criadoEm: Date.now()
    };
    targetState.veiculos.push(veiculo);
    statusCadastro = `⚠️ *Pendência Cadastral:* Veículo sem placa identificada. Anexe a foto da placa/veículo para conciliação automática.`;
  } else {
    // PASSO 1: Consulta Interna
    veiculo = targetState.veiculos.find(v =>
      v.placa && v.placa.toUpperCase().replace(/[^A-Z0-9]/g, '') === placaLimpa
    );

    // PASSO 2: Caso não tenha cadastro interno, consulta online e cadastra
    if (!veiculo) {
      console.log(`[Pátio CRM] Placa ${placaLimpa} não cadastrada internamente. Iniciando consulta online...`);
      const dadosOnline = await consultarDadosVeiculoOnline(placaLimpa, targetState?.cfg);

      let cliente = targetState.clientes.find(c =>
        (c.fone && clienteFone && c.fone.includes(clienteFone.slice(-8))) ||
        (c.nome && clienteNome && c.nome.toLowerCase() === clienteNome.toLowerCase())
      );
      if (!cliente) {
        cliente = {
          id: gerarId('c'),
          nome: clienteNome || `Cliente WhatsApp (${placaLimpa})`,
          fone: clienteFone || '',
          doc: '',
          tipo: 'frotista'
        };
        targetState.clientes.push(cliente);
      }

      veiculo = {
        id: gerarId('v'),
        cli: cliente.id,
        placa: placaLimpa,
        marca: dadosOnline.marca || 'Caminhão',
        modelo: dadosOnline.modelo || 'Cavalo Mecânico',
        ano: String(dadosOnline.ano || new Date().getFullYear()),
        cor: dadosOnline.cor || 'Branco',
        tipo: dadosOnline.tipo || 'Cavalo Mecânico',
        km: dadosOnline.km || 0,
        pendenciaCadastral: false,
        pendencias: [],
        criadoEm: Date.now()
      };
      targetState.veiculos.push(veiculo);
      statusCadastro = `🆕 *Veículo Cadastrado:* ${veiculo.marca} ${veiculo.modelo} (${dadosOnline.origem})`;
      console.log(`[Pátio CRM] Veículo ${placaLimpa} cadastrado com sucesso via ${dadosOnline.origem}.`);
    } else {
      statusCadastro = `🔎 *Cadastro Interno:* Veículo já localizado na base de dados (${veiculo.marca || ''} ${veiculo.modelo || ''})`;
      console.log(`[Pátio CRM] Placa ${placaLimpa} já existente no cadastro interno.`);
    }
  }

  const clienteAssociado = targetState.clientes.find(c => c.id === veiculo.cli) || { nome: clienteNome || 'Cliente' };

  // PASSO 3: Verificar ocupação dos Boxes e alocar
  const boxesValidos = new Set(['b1', 'b2', 'b3', 'b4', 'b5', 'b6']);
  const boxes = (targetState.boxes || []).filter(b => boxesValidos.has(b.id));

  targetState.os.forEach(o => {
    if (o.box && !boxesValidos.has(o.box)) {
      o.box = null;
      if (o.st !== 'finalizada') o.st = 'fila';
    }
  });

  const osOcupandoBoxes = targetState.os.filter(o => o.st !== 'finalizada' && o.box && boxesValidos.has(o.box));
  const boxesOcupadosIds = new Set(osOcupandoBoxes.map(o => o.box));

  let boxDesejado = null;
  if (textoOriginal) {
    const txt = textoOriginal.toLowerCase();
    if (txt.includes('fila') || txt.includes('pátio') || txt.includes('patio') || txt.includes('espera')) {
      boxDesejado = 'fila';
    } else {
      const matchBox = txt.match(/\b(?:direcionar\s+(?:para\s+o\s+|ao\s+)?box|no\s+box|box\s*:?)\s*(?:b)?([1-6]|um|dois|tr[eê]s|quatro|cinco|seis)\b/i) ||
                       txt.match(/\bbox\s*(?:b)?([1-6])\b/i);
      if (matchBox) {
        const mapaNum = { '1': 'b1', 'um': 'b1', '2': 'b2', 'dois': 'b2', '3': 'b3', 'tres': 'b3', 'três': 'b3', '4': 'b4', 'quatro': 'b4', '5': 'b5', 'cinco': 'b5', '6': 'b6', 'seis': 'b6' };
        const raw = matchBox[1].toLowerCase();
        boxDesejado = mapaNum[raw] || ('b' + raw);
      }
    }
  }

  const boxLivre = boxes.find(b => !boxesOcupadosIds.has(b.id));

  let boxIdAlocado = null;
  let statusOS = 'fila';
  let textoAlocacao = '';

  if (boxDesejado === 'fila') {
    boxIdAlocado = null;
    statusOS = 'fila';
    textoAlocacao = `🟡 *Fila de Espera:* Veículo posicionado na *Fila de Espera* do pátio conforme solicitado.`;
  } else if (boxDesejado && boxesValidos.has(boxDesejado)) {
    const boxAlvo = boxes.find(b => b.id === boxDesejado);
    const osNoBox = osOcupandoBoxes.find(o => o.box === boxDesejado);

    if (!osNoBox) {
      boxIdAlocado = boxDesejado;
      statusOS = 'executando';
      textoAlocacao = `🟢 *Box Alocado:* ${boxAlvo ? boxAlvo.nome : boxDesejado} (Conforme Solicitado)\nO box estava livre e o caminhão foi posicionado para atendimento imediato!`;
    } else {
      const veicOcup = (targetState.veiculos || []).find(v => v.id === osNoBox.vei);
      const placaOcup = veicOcup ? veicOcup.placa : 'N/I';
      if (boxLivre) {
        boxIdAlocado = boxLivre.id;
        statusOS = 'executando';
        textoAlocacao = `⚠️ *Box ${boxAlvo ? boxAlvo.nome : boxDesejado} Ocupado:* Já ocupado pela OS #${osNoBox.num} (${placaOcup}).\n🟢 *Redirecionado para:* ${boxLivre.nome} que estava disponível!`;
      } else {
        boxIdAlocado = null;
        statusOS = 'fila';
        textoAlocacao = `⚠️ *Box ${boxAlvo ? boxAlvo.nome : boxDesejado} Ocupado:* Já ocupado pela OS #${osNoBox.num} (${placaOcup}) e os demais boxes estão cheios.\n🟡 *Fila de Espera:* Veículo aguardando liberação no pátio.`;
      }
    }
  } else if (boxLivre) {
    boxIdAlocado = boxLivre.id;
    statusOS = 'executando';
    textoAlocacao = `🟢 *Box Alocado:* ${boxLivre.nome}\nO box está livre e o caminhão foi posicionado para atendimento imediato!`;
  } else {
    boxIdAlocado = null;
    statusOS = 'fila';
    const totalBoxes = boxes.length || 6;
    textoAlocacao = `🟡 *Fila de Espera:* Todos os ${totalBoxes} boxes do pátio estão ocupados no momento.\nO veículo foi colocado na *Fila de Espera* e será chamado assim que o próximo box for liberado!`;
  }

  // PASSO 4: Abrir a OS
  const maxNum = targetState.os.reduce((max, o) => Math.max(max, parseInt(o.num, 10) || 1000), 1040);
  const novoNum = String(maxNum + 1);

  const servicosIniciais = [
    { id: 'srv_diag', nome: 'Diagnóstico e Check-in de Pátio', qtd: 1, valor: 150, autorizado: true, status: 'aprovado' }
  ];
  let totalInicial = 150;

  if (Array.isArray(servicos) && servicos.length > 0) {
    servicos.forEach(s => {
      servicosIniciais.push({
        id: s.id || gerarId('srv'),
        nome: s.nome || s.desc || 'Serviço Solicitado',
        qtd: s.qtd || 1,
        valor: s.valor || s.preco || 0,
        preco: s.preco || s.valor || 0,
        autorizado: s.autorizado !== false,
        status: s.status || (s.autorizado !== false ? 'aprovado' : 'pendente')
      });
      totalInicial += (s.qtd || 1) * (s.valor || s.preco || 0);
    });
  }

  // Se o texto de abertura já continha serviço e valor (ex: "6 serv roda a 180 reais")
  if (textoOriginal && (textoOriginal.toLowerCase().includes('serv') || textoOriginal.toLowerCase().includes('roda') || textoOriginal.toLowerCase().includes('peça') || textoOriginal.toLowerCase().includes('inclua') || textoOriginal.toLowerCase().includes('unit'))) {
    const textoLimpoDePlaca = textoOriginal
      .replace(new RegExp(placaLimpa, 'gi'), '')
      .replace(/\b[A-Z]{3}[- ]?[0-9][0-9A-Z][0-9]{2}\b/gi, '')
      .replace(/\b[A-Z]{3}[- ]?[0-9]{4}\b/gi, '');

    const qtdMatch = textoLimpoDePlaca.match(/\b(\d+)\s*(?:x|serv|pecas?|un)?\b/i);
    const qtd = qtdMatch ? parseInt(qtdMatch[1], 10) : 1;

    const valorMatch = textoLimpoDePlaca.match(/(?:r\$\s*|a\s+)?(\d+(?:[.,]\d{2})?)\s*(?:reais|cada|unit)?/i);
    let valorUnit = valorMatch ? parseFloat(valorMatch[1].replace(',', '.')) : 0;
    if (valorUnit === qtd && valorMatch) {
      const todosNumeros = [...textoLimpoDePlaca.matchAll(/\b\d+(?:[.,]\d{2})?\b/g)].map(m => m[0]);
      if (todosNumeros.length > 1) valorUnit = parseFloat(todosNumeros[1].replace(',', '.'));
    }
    if (valorUnit > 0) {
      let descItem = textoLimpoDePlaca
        .replace(/^(?:por favor,?\s*)?(?:abrir\s+os\s+e\s+)?(?:inclua|incluir|adicione|adicionar|lance|lançar)\s+/i, '')
        .replace(/\b\d+\s*(?:serv|pecas?|un|x)\b/i, '')
        .replace(/(?:a\s+)?\d+(?:[.,]\d{2})?\s*(?:reais|cada|unit)?/i, '')
        .trim();
      if (!descItem || descItem.length < 3) descItem = 'Serviço Solicitado';
      servicosIniciais.push({
        id: 'srv_' + Date.now(),
        nome: descItem.charAt(0).toUpperCase() + descItem.slice(1),
        qtd: qtd,
        valor: valorUnit
      });
      totalInicial += (qtd * valorUnit);
    }
  }

  // PASSO 3.5: Triagem Inteligente de Pré-OS
  const tid = extractTenantId(req);
  let triagemPreOS = null;
  try {
    triagemPreOS = preOSEngine.triagemEntrada({
      tenantId: tid,
      vehicleId: veiculo ? veiculo.id : null,
      placa: veiculo ? veiculo.placa : placaLimpa,
      clienteId: veiculo ? veiculo.cli : null,
      kmAtual: veiculo ? veiculo.km : 0,
      reclamacao: textoOriginal || (isSemPlaca ? 'Entrada sem placa identificada' : 'Check-in via WhatsApp'),
      origem: 'whatsapp',
      actorId: 'whatsapp',
      state: targetState
    });
  } catch (err) {
    console.error('[Pátio CRM] Erro na triagem inteligente de Pré-OS:', err);
  }

  // Se a triagem identificou alto risco ou atenção (recorrência ou garantia),
  // a Pré-OS NÃO pode ser convertida automaticamente em OS em nenhum canal.
  const requerConfirmacao = triagemPreOS?.preOS?.status === 'aguardando_confirmacao' ||
                            triagemPreOS?.resumoContexto?.nivelAtencao === 'alto' ||
                            triagemPreOS?.resumoContexto?.nivelAtencao === 'atencao' ||
                            Boolean(triagemPreOS?.preOS?.possivelGarantia);

  if (requerConfirmacao && triagemPreOS?.preOS) {
    const actorId = clienteFone ? `zap_${clienteFone}` : 'whatsapp';
    const confirmToken = gerarTokenAcao({
      tenantId: tid,
      actorId,
      resourceId: triagemPreOS.preOS.id,
      action: 'converter_pre_os',
      version: targetState.versao || 0,
      ttlMs: 24 * 60 * 60 * 1000
    });

    const session = {
      id: gerarId('ses'),
      tenantId: tid,
      actorId,
      channel: 'whatsapp',
      vehicleId: veiculo ? veiculo.id : null,
      placa: veiculo ? veiculo.placa : placaLimpa,
      clienteId: veiculo ? veiculo.cli : null,
      preOSId: triagemPreOS.preOS.id,
      status: 'aguardando_confirmacao',
      collected: {
        kmAtual: veiculo ? veiculo.km : 0,
        reclamacaoOriginal: triagemPreOS.preOS.reclamacaoOriginal,
        categoria: triagemPreOS.preOS.categoria,
        sintomas: triagemPreOS.preOS.sintomas
      },
      missing: [],
      answeredQuestions: [],
      pendingQuestion: null,
      confirmToken,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      expiresAt: Date.now() + (24 * 60 * 60 * 1000)
    };

    targetState.intakeSessions = Array.isArray(targetState.intakeSessions) ? targetState.intakeSessions : [];
    targetState.intakeSessions.unshift(session);

    const saveRes = await salvarEstado(req, targetState);
    if (!saveRes || !saveRes.ok) {
      throw new Error(saveRes?.error || 'Falha ao salvar sessão de intake de Pré-OS.');
    }

    const descVeiculo = `${veiculo.marca || ''} ${veiculo.modelo || 'Caminhão'}`.trim();
    const nomeCliente = clienteAssociado.fantasia || clienteAssociado.nome || 'Cliente';
    const linhasAlerta = (triagemPreOS.preOS.alertas || []).map(a => {
      const icone = a.tipo === 'garantia' ? '🛡️' : '🔍';
      return `${icone} *Alerta de Histórico:* ${a.mensagem}`;
    }).join('\n');

    const respostaWhatsApp =
`⚠️ *Atenção: Pré-OS #${triagemPreOS.preOS.id} Registrada*

🚛 *Veículo:* ${descVeiculo}
🏷️ *Placa:* *${veiculo.placa}* ${veiculo.ano ? `(${veiculo.ano})` : ''}
👤 *Cliente:* ${nomeCliente}

${linhasAlerta || 'Serviço com histórico recente identificado.'}

❓ *Atenção necessária antes da abertura definitiva da OS.*
Deseja confirmar a abertura da Ordem de Serviço?
_Envie *Sim* para confirmar ou *Não* para cancelar._`;

    return {
      novaOS: null,
      preOS: triagemPreOS.preOS,
      session,
      veiculo,
      boxLivre,
      pendenteConfirmacao: true,
      token: confirmToken,
      respostaWhatsApp
    };
  }

  const novaOS = {
    id: gerarId('os'),
    num: novoNum,
    cli: veiculo.cli,
    vei: veiculo.id,
    box: boxIdAlocado,
    st: statusOS, // Status operacional preservado: 'executando' ou 'fila'
    pendenciaCadastral: isSemPlaca,
    pendencias: isSemPlaca ? ['placa_pendente'] : [],
    abertura: new Date().toISOString().split('T')[0],
    prev: new Date(Date.now() + 2 * 86400000).toISOString().split('T')[0],
    desc: 0,
    queixa: textoOriginal || (isSemPlaca ? 'Entrada sem placa identificada' : 'Check-in via WhatsApp'),
    preOSId: triagemPreOS?.preOS?.id || null,
    historicoRelacionado: triagemPreOS?.preOS?.ocorrenciasRelacionadas || [],
    possivelGarantia: Boolean(triagemPreOS?.preOS?.possivelGarantia),
    alertasGerados: triagemPreOS?.preOS?.alertas || [],
    pecas: [],
    servicos: servicosIniciais,
    total: totalInicial,
    criadoEm: Date.now()
  };

  // Se gerou Pré-OS na triagem de entrada, marcar como convertida para manter histórico
  if (triagemPreOS?.preOS) {
    triagemPreOS.preOS.status = 'convertida';
    triagemPreOS.preOS.convertedToOS = novaOS.num;
    triagemPreOS.preOS.convertedOSId = novaOS.id;
    triagemPreOS.preOS.convertedAt = new Date().toISOString();
  }

  await enqueueWrite(async () => {
    // Re-check box allocation to prevent race conditions
    if (boxIdAlocado) {
      const isBoxOccupied = targetState.os.some(o => o.box === boxIdAlocado && o.st !== 'finalizada');
      if (isBoxOccupied) {
        // Redireciona para fila de espera
        novaOS.box = null;
        novaOS.st = 'fila';
        textoAlocacao += `\n⚠️ *Atenção:* O box escolhido foi ocupado neste exato momento por outro veículo. Direcionado para a fila.`;
      }
    }

    // Garante OS sequence sem duplicidade
    const maxNumReal = targetState.os.reduce((max, o) => Math.max(max, parseInt(o.num, 10) || 1000), 1040);
    novaOS.num = String(maxNumReal + 1);
    if (triagemPreOS?.preOS) {
      triagemPreOS.preOS.convertedToOS = novaOS.num;
    }

    targetState.os.unshift(novaOS);
    const saveRes = await salvarEstado(req, targetState);
    if (!saveRes || !saveRes.ok) {
      throw new Error(saveRes?.error || 'Falha ao salvar Ordem de Serviço.');
    }
  });
  console.log(`[Pátio CRM] OS #${novoNum} aberta para ${placaLimpa}. Box: ${boxLivre ? boxLivre.nome : 'Fila de Espera'}. Total: R$ ${totalInicial.toFixed(2)}`);

  if (clienteFone && !isSemPlaca) {
    ultimasPlacas.set(`${tid}:direct:${clienteFone}`, { placa: placaLimpa, timestamp: Date.now() });
  }

  // PASSO 5: Formatar mensagem completa para o WhatsApp
  const descVeiculo = `${veiculo.marca || ''} ${veiculo.modelo || 'Caminhão'}`.trim();
  const nomeCliente = clienteAssociado.fantasia || clienteAssociado.nome || 'Cliente';

  let blocoAlertaTecnico = '';
  if (triagemPreOS?.preOS?.alertas && triagemPreOS.preOS.alertas.length > 0) {
    const linhasAlerta = triagemPreOS.preOS.alertas.map(a => {
      const icone = a.tipo === 'garantia' ? '🛡️' : '🔍';
      return `${icone} *Alerta de Histórico:* ${a.mensagem}`;
    }).join('\n');
    blocoAlertaTecnico = `\n${linhasAlerta}\n`;
  }

  const respostaWhatsApp =
`✅ *Ordem de Serviço #${novaOS.num} Aberta com Sucesso!*

🚛 *Veículo:* ${descVeiculo}
🏷️ *Placa:* *${veiculo.placa}* ${veiculo.ano ? `(${veiculo.ano})` : ''}
👤 *Cliente:* ${nomeCliente}

${statusCadastro}

${textoAlocacao}
${blocoAlertaTecnico}
📋 *Situação da OS:* ${boxLivre ? 'Em Execução no Box' : 'Na Fila de Espera'}${isSemPlaca ? ' (Pendência Cadastral: Sem Placa)' : ''}
📅 *Entrada:* ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}

_Pátio CRM — Gestão de Oficina Pesada_`;

  return { novaOS, veiculo, boxLivre, respostaWhatsApp };
}

/* ── 3. Classificação e Processamento de Documentos (Fotos & Mensagens) ── */

function formatarDataBR(d) {
  if (!d) return new Date().toLocaleDateString('pt-BR');
  if (typeof d === 'string' && d.includes('-')) {
    const parts = d.split('-');
    if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return d;
}

function extrairDadosDocumentoHeuristico(texto) {
  const t = (texto || '').toUpperCase();

  // 1. Identificação de Placa Veicular (Mercosul ou Padrão Antigo)
  const placaRegex = /\b([A-Z]{3}[0-9][0-9A-Z][0-9]{2}|[A-Z]{3}[- ]?[0-9]{4})\b/i;
  const matchPlaca = t.match(placaRegex);

  // 2. Classificação por termos-chave
  const isPixOuComprovante = t.includes('COMPROVANTE') || t.includes('PAGAMENTO EFETUADO') ||
    t.includes('PAGAMENTO REALIZADO') || t.includes('TRANSFERENCIA') || t.includes('TRANSFERÊNCIA') ||
    t.includes('PIX REALIZADO') || (t.includes('PIX') && (t.includes('AUTENTICA') || t.includes('TRANSACAO') || t.includes('TRANSAÇÃO') || t.includes('DESTINO') || t.includes('FAVORECIDO') || t.includes('VALOR PAGO') || t.includes('PAGO PARA') || t.includes('ENVIO PIX')));

  const isNotaFiscal = t.includes('DANFE') || t.includes('DOCUMENTO AUXILIAR') ||
    t.includes('NF-E') || t.includes('NFE') || t.includes('NOTA FISCAL') ||
    t.includes('CHAVE DE ACESSO') || t.includes('PROTOCOLO DE AUTORIZ') || t.includes('INSCRIÇÃO ESTADUAL');

  const isPedido = t.includes('PEDIDO') || t.includes('ORÇAMENTO') || t.includes('ORCAMENTO') ||
    t.includes('COTAÇÃO') || t.includes('COTACAO') || t.includes('ESPELHO DE PEDIDO') ||
    t.includes('PROPOSTA COMERCIAL') || t.includes('PEDIDO DE COMPRA') || t.includes('COND. PAG');

  let tipo = 'outro';
  if (isPixOuComprovante) {
    tipo = 'comprovante_pagamento';
  } else if (isNotaFiscal) {
    tipo = 'nota_fiscal';
  } else if (isPedido) {
    tipo = 'pedido_compra';
  } else if (matchPlaca) {
    tipo = 'placa_veiculo';
  }

  // 3. Extração de Valores Monetários (R$)
  let valorTotal = 0;
  const valoresEncontrados = [];
  const regexValor = /(?:R\$\s*|VALOR\s*(?:TOTAL|PAGO|L[IÍ]QUIDO)?[:\s]*R?\$?\s*)(\d{1,3}(?:\.\d{3})*,\d{2}|\d+(?:[.,]\d{2}))/gi;
  let mv;
  while ((mv = regexValor.exec(t)) !== null) {
    const limpo = mv[1].replace(/\./g, '').replace(',', '.');
    const num = parseFloat(limpo);
    if (!isNaN(num) && num > 0) valoresEncontrados.push(num);
  }
  if (valoresEncontrados.length > 0) {
    valorTotal = Math.max(...valoresEncontrados);
  } else {
    const regexMoedaSolta = /\b\d{1,3}(?:\.\d{3})*,\d{2}\b/g;
    const moedas = [...t.matchAll(regexMoedaSolta)].map(m => parseFloat(m[0].replace(/\./g, '').replace(',', '.')));
    if (moedas.length > 0) valorTotal = Math.max(...moedas);
  }

  // 4. Extração de CNPJ
  let cnpj = '';
  const matchCNPJ = t.match(/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/);
  if (matchCNPJ) cnpj = matchCNPJ[0].replace(/\D/g, '');

  // 5. Extração de Chave NF-e (44 dígitos)
  let chaveAcesso = '';
  const seqsNumericas = t.match(/\d{44}/g);
  if (seqsNumericas && seqsNumericas.length > 0) {
    chaveAcesso = seqsNumericas[0];
  } else {
    // Tenta agrupar números ignorando espaços
    const textoSoNumeros = t.replace(/[^0-9]/g, '');
    const matchChave = textoSoNumeros.match(/\d{44}/);
    if (matchChave) chaveAcesso = matchChave[0];
  }

  // 6. Extração de Número de Documento (NF ou Pedido)
  let numeroDoc = '';
  const matchNum = t.match(/(?:N[ºo°\.]\s*|NUMERO[:\s]*|NF[:\s]*|PEDIDO[:\s]*(?:N[ºo°\.]\s*)?|Nº[:\s]*)(\d+(?:[\.\-]\d+)*)/i);
  if (matchNum) {
    numeroDoc = matchNum[1].replace(/\D/g, '');
  }

  // 7. Extração de Fornecedor / Favorecido
  let fornecedorOuFavorecido = '';
  const matchFav = t.match(/(?:PARA|FAVORECIDO|DESTINAT[AÁ]RIO|RECEBEDOR|NOME DO RECEBEDOR|FORNECEDOR|EMITENTE|RAZ[AÃ]O SOCIAL|PAGO PARA)[:\s]+([^\n\r]+)/i);
  if (matchFav) {
    fornecedorOuFavorecido = matchFav[1].split(/[-–|,\.]/)[0].trim();
  }

  // 8. Extração de Autenticação / Código Pix
  let autenticacao = '';
  const matchAuth = t.match(/(?:AUTENTICA[CÇ][AÃ]O|ID DA TRANSA[CÇ][AÃ]O|ID[:\s]+|C[OÓ]DIGO DE CONTROLE|TRANSAC[AÃ]O)[:\s]+([A-Z0-9\.\-]+)/i);
  if (matchAuth) autenticacao = matchAuth[1].trim();

  // 9. Forma de Pagamento
  let forma = 'Pix';
  if (t.includes('BOLETO')) forma = 'Boleto';
  else if (t.includes('TED')) forma = 'TED';
  else if (t.includes('TRANSFERENCIA') || t.includes('TRANSFERÊNCIA')) forma = 'Transferência Bancária';
  else if (t.includes('PIX')) forma = 'Pix';

  // 10. Data (DD/MM/YYYY)
  let dataISO = new Date().toISOString().slice(0, 10);
  const matchData = t.match(/\b(\d{2})[\/\-](\d{2})[\/\-](\d{4})\b/);
  if (matchData) {
    dataISO = `${matchData[3]}-${matchData[2]}-${matchData[1]}`;
  }

  return {
    tipo,
    placa: matchPlaca ? matchPlaca[1].replace(/[- ]/g, '') : null,
    valor_total: valorTotal,
    numero_documento: numeroDoc,
    chave_acesso: chaveAcesso,
    cnpj,
    fornecedor: fornecedorOuFavorecido || (tipo === 'comprovante_pagamento' ? 'Favorecido Identificado' : 'Fornecedor Identificado'),
    favorecido: fornecedorOuFavorecido || 'Favorecido Identificado',
    autenticacao,
    forma_pagamento: forma,
    data: dataISO
  };
}

async function analisarDocumentoWhatsApp(base64Image, textoMensagem) {
  // Tentativa 1: IA Gemini se configurada e ativa
  if (ai && base64Image) {
    try {
      console.log('[Classificador IA] Enviando documento para análise multimodal no Gemini...');
      const prompt = `Você é um assistente contábil e operacional de oficina diesel pesada no Brasil.
Analise a imagem deste documento e a mensagem do usuário (se houver).
Classifique em uma das seguintes opções:
- "pedido_compra": se for pedido de compra, cotação, proposta ou orçamento de autopeças.
- "nota_fiscal": se for DANFE, NF-e ou cupom/nota fiscal de compra de peças ou serviços.
- "comprovante_pagamento": se for comprovante de Pix, boleto pago, TED ou transferência.
- "placa_veiculo": se for foto de caminhão, carreta ou placa veicular.
- "outro": caso não pertença a nenhuma acima.

Retorne APENAS um JSON estrito no formato:
{
  "tipo": "pedido_compra" | "nota_fiscal" | "comprovante_pagamento" | "placa_veiculo" | "outro",
  "fornecedor": "Razão social ou nome do fornecedor/favorecido",
  "cnpj": "CNPJ limpo se houver",
  "numero_documento": "Número do pedido ou NF",
  "chave_acesso": "Chave de 44 dígitos da NF se houver",
  "valor_total": 0.00,
  "data": "YYYY-MM-DD",
  "vencimento": "YYYY-MM-DD",
  "favorecido": "Nome do favorecido do pagamento",
  "pagador": "Nome do pagador",
  "autenticacao": "Código de autenticação bancária ou transação",
  "forma_pagamento": "Pix / Boleto / TED",
  "placa": "Placa veicular se houver",
  "itens": [
    { "nome": "Nome da peça", "quantidade": 1, "valor_unitario": 0.00 }
  ]
}`;
      const safeText = String(textoMensagem || '').replace(/"/g, '\\"').replace(/\{/g, '(').replace(/\}/g, ')');
      const resp = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [{
          role: 'user',
          parts: [
            { inlineData: { mimeType: 'image/jpeg', data: base64Image } },
            { text: `O usuário enviou a seguinte mensagem junto com a imagem: "${safeText}".\n\n` + prompt }
          ]
        }]
      });
      const parsed = safeJsonParse(resp.text);
      if (parsed && parsed.tipo && parsed.tipo !== 'outro') {
        console.log(`[Classificador IA] Documento classificado com sucesso como "${parsed.tipo}" via Gemini!`);
        return {
          tipo: parsed.tipo,
          origem: 'Gemini AI',
          dados: parsed
        };
      }
    } catch (eAI) {
      console.warn('[Classificador IA] Gemini indisponível ou token expirado, acionando OCR Tesseract heurístico:', eAI.message);
    }
  }

  // Tentativa 2: Extração via Tesseract OCR + Heurísticas robustas offline
  let textoExtraido = textoMensagem || '';
  if (base64Image) {
    try {
      console.log('[Classificador OCR] Executando OCR Tesseract local no documento...');
      const buffer = Buffer.from(base64Image, 'base64');
      const resOcr = await Tesseract.recognize(buffer, 'por');
      const textOcr = resOcr?.data?.text || '';
      console.log(`[Classificador OCR] Texto extraído (${textOcr.length} caracteres).`);
      textoExtraido = textOcr + '\n' + (textoMensagem || '');
    } catch (errOcr) {
      console.warn('[Classificador OCR] Erro no Tesseract OCR:', errOcr.message);
    }
  }

  const heuristica = extrairDadosDocumentoHeuristico(textoExtraido);
  console.log(`[Classificador Heurístico] Resultado da análise: tipo="${heuristica.tipo}", valor=${heuristica.valor_total}, forn="${heuristica.fornecedor}"`);
  return {
    tipo: heuristica.tipo,
    origem: 'Tesseract OCR / Heurística',
    dados: heuristica
  };
}

async function processarEntradaPedidoCompra({ forn, cnpj, numPedido, valor, itens, data, venc, remitenteFone, isContextOperacao, tenantKey = 'default', tenantState = null }) {
  const numero = String(numPedido || Math.floor(Math.random() * 9000 + 1000));
  const fornecedorNome = (forn && forn !== 'Fornecedor Identificado') ? forn : 'Fornecedor Peças Diesel';
  const valorTotal = Number(valor) || 0;
  const dataHoje = data || new Date().toISOString().slice(0, 10);
  const dataVenc = venc || new Date(Date.now() + 15 * 86400000).toISOString().slice(0, 10);

  const compraId = gerarId('cmp');
  const contaId = gerarId('ct');
  const itensLista = (itens && itens.length > 0)
    ? itens.map(it => ({
        nome: it.nome || 'Peça / Insumo',
        qtd: Number(it.quantidade || it.qtd) || 1,
        custo: Number(it.valor_unitario || it.custo || it.valor) || 0
      }))
    : [{ nome: `Peças Conforme Pedido #${numero}`, qtd: 1, custo: valorTotal }];

  let novoPedido = null;
  let novaConta = null;

  await mutateTenantState(tenantKey, async (draft) => {
    if (!draft.compras) draft.compras = [];
    if (!draft.contas) draft.contas = [];

    // 1. Registra o Pedido de Compra (Sem alterar pecas/estoque)
    novoPedido = {
      id: compraId,
      tipo: 'pedido',
      num: numero,
      forn: fornecedorNome,
      cnpj: cnpj || '',
      data: dataHoje,
      valor: valorTotal,
      situacao: 'Aguardando NF',
      itens: itensLista,
      origem: 'WhatsApp Operação',
      remetente: remitenteFone || ''
    };
    draft.compras.unshift(novoPedido);

    // 2. Cria Provisionamento no Contas a Pagar
    novaConta = {
      id: contaId,
      tipo: 'pagar',
      desc: `[PROVISIONAMENTO] Pedido #${numero} — ${fornecedorNome}`,
      parte: fornecedorNome,
      valor: valorTotal,
      venc: dataVenc,
      pago: false,
      provisionado: true,
      situacao: 'Aguardando NF',
      pedidoId: compraId,
      doc: `PED-${numero}`,
      cat: 'Fornecedores Peças',
      origem: 'WhatsApp'
    };
    draft.contas.unshift(novaConta);
    return draft;
  });

  console.log(`[Pátio CRM] Pedido #${numero} registrado e provisionado no Contas a Pagar (R$ ${valorTotal.toFixed(2)}). Estoque aguardando NF.`);

  const respostaWhatsApp =
`📋 *PEDIDO DE COMPRA REGISTRADO COM SUCESSO!* 📦

🏢 *Fornecedor:* ${fornecedorNome}
🔢 *Nº do Pedido:* #${numero}
💵 *Valor Total:* ${formatarMoeda(valorTotal)}
📅 *Previsão de Vencimento:* ${formatarDataBR(dataVenc)}

⚠️ *Situação Contábil & Estoque:*
• 🟡 *Provisionado no Contas a Pagar* (Status: _Aguardando NF_).
• 🛑 *Estoque Físico/Fiscal:* Não alterado (aguardando emissão da Nota Fiscal pelo fornecedor).
• 🔗 Assim que a Nota Fiscal deste fornecedor for enviada aqui no grupo, o provisionamento será liquidado e as peças darão entrada no estoque automaticamente!

_Pátio CRM — Gestão de Compras & Operação_`;

  return { novoPedido, novaConta, respostaWhatsApp };
}

async function processarEntradaNotaFiscal({ forn, cnpj, numNF, chave, valor, itens, data, venc, remitenteFone, isContextOperacao, tenantKey = 'default', tenantState = null }) {
  const numero = String(numNF || Math.floor(Math.random() * 90000 + 10000));
  const fornecedorNome = (forn && forn !== 'Fornecedor Identificado') ? forn : 'Fornecedor Peças Diesel';
  const valorTotal = Number(valor) || 0;
  const dataHoje = data || new Date().toISOString().slice(0, 10);
  const dataVenc = venc || new Date(Date.now() + 28 * 86400000).toISOString().slice(0, 10);

  let textoVinculo = '';
  const resumoItens = [];

  await mutateTenantState(tenantKey, async (draft) => {
    if (!draft.compras) draft.compras = [];
    if (!draft.contas) draft.contas = [];
    if (!draft.pecas) draft.pecas = [];
    if (!draft.nfsRecebidas) draft.nfsRecebidas = [];

    // 1. Verifica se há Pedido de Compra provisionado em aberto para este fornecedor
    const fornLower = fornecedorNome.toLowerCase();
    const pedidosAguardando = draft.compras.filter(c => c.tipo === 'pedido' && c.situacao === 'Aguardando NF');
    const pedidoVinculado = pedidosAguardando.find(p => {
      const pForn = (p.forn || '').toLowerCase();
      const mesmoFornecedor = pForn && (pForn.includes(fornLower) || fornLower.includes(pForn));
      const valorParecido = valorTotal > 0 && Math.abs((p.valor || 0) - valorTotal) < 2.0;
      return mesmoFornecedor && valorParecido;
    });

    if (pedidoVinculado) {
      pedidoVinculado.situacao = 'Concluída';
      pedidoVinculado.nfNumero = numero;
      pedidoVinculado.nfChave = chave || '';

      // Converte a conta provisionada em conta definitiva
      const contaProvisionada = draft.contas.find(c =>
        c.provisionado && (c.pedidoId === pedidoVinculado.id || c.doc === `PED-${pedidoVinculado.num}`)
      );
      if (contaProvisionada) {
        contaProvisionada.provisionado = false;
        contaProvisionada.situacao = 'Confirmada NF';
        contaProvisionada.desc = `NF-e ${numero} — ${fornecedorNome} (Ref. Pedido #${pedidoVinculado.num})`;
        contaProvisionada.doc = `NF-${numero}`;
        contaProvisionada.parte = fornecedorNome;
        if (valorTotal > 0) contaProvisionada.valor = valorTotal;
        contaProvisionada.venc = dataVenc;
      }
      textoVinculo = `🔗 *Vinculado ao Pedido:* #${pedidoVinculado.num} (Provisionamento confirmado em definitivo)`;
      console.log(`[Pátio CRM] NF-e ${numero} vinculada com sucesso ao pedido provisionado #${pedidoVinculado.num}!`);
    } else {
      // Entrada direta de NF: cria conta a pagar definitiva
      const contaId = gerarId('ct');
      draft.contas.unshift({
        id: contaId,
        tipo: 'pagar',
        desc: `NF-e ${numero} — ${fornecedorNome}`,
        parte: fornecedorNome,
        valor: valorTotal,
        venc: dataVenc,
        pago: false,
        provisionado: false,
        doc: `NF-${numero}`,
        cat: 'Fornecedores Peças',
        origem: 'WhatsApp'
      });
      textoVinculo = `📑 *Entrada:* Nota Fiscal Direta (Contas a Pagar gerado com vencimento em ${formatarDataBR(dataVenc)})`;
    }

    // 2. Alimenta Estoque (draft.pecas)
    const itensLista = (itens && itens.length > 0)
      ? itens.map(it => ({
          nome: it.nome || 'Peça Diesel Conforme NF',
          qtd: Number(it.quantidade || it.qtd) || 1,
          custo: Number(it.valor_unitario || it.custo || it.valor) || (valorTotal / itens.length) || 0
        }))
      : [{ nome: `Peças Conforme NF-e #${numero}`, qtd: 1, custo: valorTotal }];

    for (const it of itensLista) {
      const nomeNorm = it.nome.trim();
      let p = draft.pecas.find(x => x.nome && x.nome.toLowerCase() === nomeNorm.toLowerCase());
      if (p) {
        p.qtd = (p.qtd || 0) + it.qtd;
        p.custo = it.custo || p.custo;
        if (p.venda <= p.custo) p.venda = Math.round(p.custo * 1.6);
        resumoItens.push(`• ${nomeNorm}: +${it.qtd} un (Estoque atual: ${p.qtd})`);
      } else {
        const novaPeca = {
          id: 'p_' + Date.now() + Math.floor(Math.random() * 1000),
          cod: 'NF-' + numero.slice(-4),
          nome: nomeNorm,
          un: 'un',
          qtd: it.qtd,
          min: 2,
          custo: it.custo,
          venda: Math.round(it.custo * 1.6) || 100,
          loc: 'Almoxarifado',
          forn: fornecedorNome
        };
        draft.pecas.push(novaPeca);
        resumoItens.push(`• ${nomeNorm}: ${it.qtd} un (Novo item no almoxarifado)`);
      }
    }

    // 3. Registra no Módulo Fiscal
    draft.nfsRecebidas.unshift({
      id: gerarId('nf'),
      num: numero,
      serie: '1',
      forn: fornecedorNome,
      cnpj: cnpj || '',
      chave: chave || '',
      valor: valorTotal,
      data: dataHoje,
      venc: dataVenc,
      pedidoVinculado: pedidoVinculado ? pedidoVinculado.num : null
    });

    // Salva no histórico de compras
    draft.compras.unshift({
      id: gerarId('cmp'),
      tipo: 'nf',
      num: numero,
      forn: fornecedorNome,
      cnpj: cnpj || '',
      data: dataHoje,
      valor: valorTotal,
      situacao: 'Concluída',
      itens: itensLista,
      origem: 'WhatsApp',
      remetente: remitenteFone || ''
    });

    return draft;
  });

  const respostaWhatsApp =
`🧾 *NOTA FISCAL PROCESSADA COM SUCESSO!* 🚚

🏢 *Fornecedor:* ${fornecedorNome} ${cnpj ? `\n📄 *CNPJ:* ${cnpj}` : ''}
🔢 *NF-e Nº:* #${numero}
💵 *Valor Total:* ${formatarMoeda(valorTotal)}
${textoVinculo}

📦 *Estoque / Almoxarifado Atualizado:*
${resumoItens.slice(0, 5).join('\n')}
${resumoItens.length > 5 ? `_... e mais ${resumoItens.length - 5} item(ns)_` : ''}

🏛️ *Fiscal & Financeiro:*
• Registro fiscal lançado em Notas Recebidas.
• Título confirmado no Contas a Pagar com vencimento em ${formatarDataBR(dataVenc)}.

_Pátio CRM — Gestão Integrada de Estoque & Compras_`;

  return { respostaWhatsApp };
}

async function processarComprovantePagamento({ favorecido, pagador, valor, data, autenticacao, forma, remitenteFone, isContextOperacao, tenantKey = 'default', tenantState = null }) {
  const valorPago = Number(valor) || 0;
  const favNome = (favorecido && favorecido !== 'Favorecido Identificado') ? favorecido : '';
  const dataHoje = data || new Date().toISOString().slice(0, 10);
  const formaPgto = forma || 'Pix';

  let contaAlvo = null;
  let novoMovimento = null;
  let saldoAtual = 0;
  let detalheLiquidacao = '';

  await mutateTenantState(tenantKey, async (draft) => {
    if (!draft.contas) draft.contas = [];
    if (!draft.movimentos) draft.movimentos = [];

    // 1. Localiza conta a pagar correspondente em aberto
    const contasPagarAbertas = draft.contas.filter(c => c.tipo === 'pagar' && !c.pago);
    if (favNome && valorPago > 0) {
      const favNorm = favNome.toLowerCase();
      contaAlvo = contasPagarAbertas.find(c => {
        const pNome = (c.parte || c.desc || '').toLowerCase();
        const bateValor = Math.abs((c.valor || 0) - valorPago) < 0.1;
        return bateValor && (pNome.includes(favNorm) || favNorm.includes(pNome));
      });
    }

    if (contaAlvo) {
      contaAlvo.pago = true;
      contaAlvo.dataPgto = dataHoje;
      contaAlvo.comprovanteAuth = autenticacao || '';
      contaAlvo.forma = formaPgto;
      detalheLiquidacao = `✅ *Título Liquidado:* Baixa confirmada no título "${contaAlvo.desc}"`;
    } else {
      detalheLiquidacao = `📝 *Lançamento:* Pagamento avulso registrado como despesa de peças/fornecedores`;
    }

    // 2. Lança saída de caixa em movimentos
    const movId = 'mv_' + Date.now();
    const descMov = contaAlvo
      ? `Baixa: ${contaAlvo.desc} (${contaAlvo.parte || favNome})`
      : `Pagamento: ${favNome || 'Fornecedor'} (${formaPgto})`;

    novoMovimento = {
      id: movId,
      data: dataHoje,
      tipo: 'saida',
      desc: descMov,
      valor: valorPago || (contaAlvo ? contaAlvo.valor : 0),
      cat: contaAlvo ? (contaAlvo.cat || 'Fornecedores Peças') : 'Fornecedores Peças',
      conc: true,
      forma: formaPgto,
      auth: autenticacao || '',
      origem: 'WhatsApp'
    };
    draft.movimentos.push(novoMovimento);

    // Calcula novo saldo
    const cfg = draft.cfg || {};
    const saldoInicial = Number(cfg.saldoInicial) || 0;
    const totalEntradas = draft.movimentos.filter(m => m.tipo === 'entrada').reduce((a, m) => a + (Number(m.valor) || 0), 0);
    const totalSaidas = draft.movimentos.filter(m => m.tipo === 'saida').reduce((a, m) => a + (Number(m.valor) || 0), 0);
    saldoAtual = saldoInicial + totalEntradas - totalSaidas;

    return draft;
  });

  console.log(`[Pátio CRM] Comprovante de ${formaPgto} processado: R$ ${novoMovimento ? novoMovimento.valor.toFixed(2) : '0.00'}. Novo saldo: R$ ${saldoAtual.toFixed(2)}`);

  const respostaWhatsApp =
`💸 *COMPROVANTE DE PAGAMENTO CONCILIADO!* ✅

👤 *Favorecido:* ${favNome || (contaAlvo ? contaAlvo.parte : 'Fornecedor')}
💵 *Valor Liquidado:* ${formatarMoeda(novoMovimento ? novoMovimento.valor : valorPago)}
💳 *Forma:* ${formaPgto}
📅 *Data:* ${formatarDataBR(dataHoje)}
${autenticacao ? `🔐 *Autenticação:* ${autenticacao}\n` : ''}
${detalheLiquidacao}

💵 *Novo Saldo em Caixa:* *${formatarMoeda(saldoAtual)}*
_Movimentação financeira lançada no fluxo de caixa e conciliada no Pátio CRM._`;

  return { respostaWhatsApp, contaAlvo, novoMovimento, saldoAtual };
}

/* ── Auto-Sincronização e Descoberta de Grupos ───────────── */
async function sincronizarGruposAutomaticamente() {
  try {
    if (!wppClient) return;
    console.log('[WhatsApp] Sincronizando e auto-detectando grupos no WhatsApp...');
    const grupos = await obterGruposWhatsApp();
    console.log(`[WhatsApp] Total de grupos encontrados na conta: ${grupos.length}`);
    grupos.forEach(g => {
      console.log(`   📁 Grupo: "${g.name}" | ID: ${g.id}`);
    });

    const rows = await all("SELECT key, value FROM kv WHERE key LIKE 'tenant:%:state' OR key = 'state'");
    for (const r of (rows || [])) {
      try {
        const parsed = JSON.parse(r.value);
        if (!parsed.cfg) parsed.cfg = {};
        let atualizou = false;
        if (parsed.cfg.grupoAdminId === '120363428179962435@g.us' || parsed.cfg.grupoAdminId === '120363428840376088@g.us') {
          parsed.cfg.grupoAdminId = '';
          atualizou = true;
        }
        if (atualizou) {
          const tenantId = extractTenantId(r.key);
          await mutateTenantState(tenantId, (draft) => {
            if (!draft.cfg) draft.cfg = {};
            if (draft.cfg.grupoAdminId === '120363428179962435@g.us' || draft.cfg.grupoAdminId === '120363428840376088@g.us') {
              draft.cfg.grupoAdminId = '';
            }
          });
        }
      } catch (_) {}
    }
  } catch (err) {
    console.warn('[WhatsApp] Erro na auto-sincronização de grupos:', err.message);
  }
}

/* ── Inicialização do Cliente WhatsApp ───────────────────── */
function iniciarWhatsApp() {
  console.log('[WhatsApp] Iniciando cliente WhatsApp Web...');
  const { Client, LocalAuth } = getWhatsAppModules();
  const authPath = path.resolve(ROOT_DIR, '.wwebjs_auth');

  wppClient = new Client({
    authStrategy: new LocalAuth({ dataPath: authPath }),
    puppeteer: {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-first-run'
      ]
    }
  });

  wppClient.on('qr', async (qr) => {
    wppStatus.status = 'aguardando_qr';
    wppStatus.qr = qr;
    try {
      wppStatus.qrImage = await QRCode.toDataURL(qr, { width: 340, margin: 2 });
    } catch (e) {
      wppStatus.qrImage = null;
    }
    wppStatus.ultimoUpdate = new Date().toISOString();

    console.log('\n======================================================');
    console.log('📱 NOVO QR CODE GERADO NO SERVIDOR');
    console.log(`🔗 Ver Imagem Direta no Navegador: http://localhost:${PORT}/api/whatsapp/qr.png`);
    console.log('======================================================\n');
    qrcode.generate(qr, { small: true });
  });

  wppClient.on('authenticated', () => {
    wppStatus.status = 'autenticado';
    wppStatus.ultimoUpdate = new Date().toISOString();
    console.log('🔒 [WhatsApp] Autenticado com sucesso!');

    // Monitoramento ativo: se por qualquer motivo o evento 'ready' demorar,
    // verifica via getState() / info se o cliente já está pronto para operar
    let tentativasReady = 0;
    const monitorPronto = setInterval(async () => {
      tentativasReady++;
      try {
        if (wppStatus.status === 'pronto') {
          clearInterval(monitorPronto);
          return;
        }
        const state = await wppClient.getState().catch(() => null);
        if (state === 'CONNECTED' || wppClient.info) {
          wppStatus.status = 'pronto';
          wppStatus.qr = null;
          wppStatus.user = wppClient.info ? wppClient.info.wid.user : 'Conectado';
          wppStatus.ultimoUpdate = new Date().toISOString();
          console.log(`✅ [WhatsApp] Agente Virtual Conectado e Pronto! (${wppStatus.user})`);
          clearInterval(monitorPronto);
          await sincronizarGruposAutomaticamente();
        }
      } catch (e) {}
      if (tentativasReady > 30) clearInterval(monitorPronto);
    }, 2000);
  });

  wppClient.on('ready', async () => {
    wppStatus.status = 'pronto';
    wppStatus.qr = null;
    wppStatus.user = wppClient.info ? wppClient.info.wid.user : 'Conectado';
    wppStatus.ultimoUpdate = new Date().toISOString();
    console.log(`✅ [WhatsApp] Agente Virtual Conectado e Pronto! (${wppStatus.user})`);
    await sincronizarGruposAutomaticamente();
  });

  wppClient.on('auth_failure', (msg) => {
    wppStatus.status = 'erro';
    wppStatus.ultimoUpdate = new Date().toISOString();
    console.error('❌ [WhatsApp] Falha de autenticação:', msg);
  });

  wppClient.on('disconnected', (reason) => {
    wppStatus.status = 'desconectado';
    wppStatus.ultimoUpdate = new Date().toISOString();
    console.warn('⚠️ [WhatsApp] Desconectado:', reason);
  });

  // Handler de Mensagens com IA + Fallback Robusto
  // Handler de Mensagens com IA + Roteamento por Grupos (Admin vs Operação)
  wppClient.on('message', async (msg) => {
    // 1. Ignora status/stories e transmissões de broadcast
    if (msg.from.includes('status') || msg.from.includes('@broadcast')) {
      return;
    }

    const isGroup = msg.from.includes('@g.us');
    const rawAuthor = isGroup ? (msg.author || msg.from) : msg.from;
    const fromNumber = (rawAuthor || '').split('@')[0].replace(/\D/g, '');

    const { tenantKey, state: tenantState } = await resolverTenantPorChatId(msg.from, fromNumber);
    const cfg = tenantState?.cfg || {};
    const grupoAdminId = cfg.grupoAdminId || process.env.WHATSAPP_GRUPO_ADMIN_ID || '';
    const grupoOperacaoId = cfg.grupoOperacaoId || process.env.WHATSAPP_GRUPO_OPERACAO_ID || '';

    const isGrupoAdmin = isGroup && Boolean(grupoAdminId) && (msg.from === grupoAdminId);
    const isGrupoOperacao = isGroup && Boolean(grupoOperacaoId) && (msg.from === grupoOperacaoId);

    // Lista de administradores cadastrados (env + estado)
    const adminList = (process.env.WHATSAPP_ADMIN_NUMBERS || '')
      .split(',')
      .map(s => s.trim().replace(/\D/g, ''))
      .filter(Boolean);
    if (cfg.adminFones && Array.isArray(cfg.adminFones)) {
      cfg.adminFones.forEach(f => {
        const clean = String(f).replace(/\D/g, '');
        if (clean && !adminList.includes(clean)) adminList.push(clean);
      });
    }

    const isSenderAdmin = isAdminPhone(fromNumber, adminList);

    // ── Política de Grupos e Privacidade de Clientes ──
    if (isGroup) {
      // Se for grupo e ainda não estava mapeado pelo ID, não faz auto-vínculo inseguro.
      // A vinculação de grupos deve ser feita explicitamente pelo painel administrativo (UI).
      if (msg.from === '120363428179962435@g.us' || msg.from === '120363428840376088@g.us') {
        return; // Jamais processar mensagens do Faturamento ou Compras
      }

      // Se não for nenhum dos dois grupos autorizados do Pátio CRM, ignora
      if (!isGrupoAdmin && !isGrupoOperacao) {
        return;
      }
    } else {
      // Se for link de convite para grupo recebido no privado
      const linkInviteMatch = (msg.body || '').match(/chat\.whatsapp\.com\/([a-zA-Z0-9_-]{20,30})/);
      if (linkInviteMatch && linkInviteMatch[1]) {
        try {
          if (!isSenderAdmin) {
            console.log(`[WhatsApp] Convite negado: remetente não é administrador.`);
            return;
          }
          const inviteCode = linkInviteMatch[1];
          console.log(`[WhatsApp] Link de convite recebido do administrador (${inviteCode}). Aceitando convite...`);
          const groupId = await wppClient.acceptInvite(inviteCode);
          console.log(`✅ [WhatsApp] Entrou com sucesso no grupo via convite: ${groupId}`);
          await sincronizarGruposAutomaticamente();
          await msg.reply(`✅ *Convite aceito com sucesso!*\nO agente agora faz parte do grupo (\`${groupId}\`).`);
          return;
        } catch (eInv) {
          console.error('[WhatsApp] Erro ao aceitar convite:', eInv.message);
          await msg.reply(`⚠️ Falha ao entrar no grupo: ${eInv.message}`);
          return;
        }
      }

      // Se for mensagem direta / privada:
      // O agente permanece SILENCIOSO para clientes comuns para não interferir no atendimento humano.
      // Somente responde se o remetente for um administrador autorizado testando/gerenciando no privado.
      if (!isSenderAdmin) {
        return;
      }
    }

    const isContextAdmin = isGrupoAdmin || (!isGroup && isSenderAdmin);
    const isContextOperacao = isGrupoOperacao;

    // 2. Download de Mídia se houver anexo (Foto ou Áudio/Voz) com retentativas automáticas
    let base64Image = null;
    let imageMime = 'image/jpeg';
    let base64Audio = null;
    let audioMime = null;

    if (msg.hasMedia) {
      for (let tentativa = 1; tentativa <= 4; tentativa++) {
        try {
          await new Promise(r => setTimeout(r, 400 * tentativa));
          const media = await msg.downloadMedia();
          if (media && media.data) {
            const mime = (media.mimetype || '').toLowerCase();
            if (mime.startsWith('audio/') || msg.type === 'ptt' || msg.type === 'audio') {
              base64Audio = media.data;
              audioMime = media.mimetype || 'audio/ogg';
              console.log(`[WhatsApp] Áudio/Voz baixado com sucesso (${audioMime}, ${base64Audio.length} bytes) na tentativa ${tentativa}`);
            } else {
              base64Image = media.data;
              imageMime = media.mimetype || 'image/jpeg';
              console.log(`[WhatsApp] Imagem baixada com sucesso (${imageMime}, ${base64Image.length} bytes) na tentativa ${tentativa}`);
            }
            break;
          }
        } catch (err) {
          if (tentativa === 4) console.warn('[WhatsApp] Erro ao baixar mídia recebida após retentativas:', err.message);
        }
      }
    }

    // Se for mensagem de voz/áudio, direciona imediatamente para o VoiceActionEngine!
    if (base64Audio) {
      try {
        console.log(`[WhatsApp] Processando áudio de voz recebido de ${fromNumber} via VoiceActionEngine...`);
        const resVoz = await voiceActionEngine.interpretarEExecutar({
          input: { audioBase64: base64Audio, mimeType: audioMime },
          context: {
            canal: 'whatsapp',
            tenantId: tenantKey,
            remetente: fromNumber,
            actorId: fromNumber,
            role: isSenderAdmin ? 'tenant_admin' : (isContextOperacao ? 'atendente' : 'cliente'),
            permissions: isSenderAdmin ? ['*'] : (isContextOperacao ? ['os:read', 'os:write'] : []),
            isSenderAdmin: !!isSenderAdmin,
            isContextOperacao: !!isContextOperacao,
            isContextAdmin: !!isContextAdmin
          },
          state: tenantState,
          aiClient: ai
        });

        if (resVoz.ok && !resVoz.pendenteConfirmacao && resVoz.acao !== 'consultar_status' && resVoz.acao !== 'duvida_geral') {
          await msg.reply(
            `⚠️ *Canal em Modo Consulta (Piloto Controlado)*\n\n` +
            `Mutações de dados via áudio de WhatsApp estão desabilitadas no piloto controlado para garantir rastreabilidade.\n` +
            `Por favor, utilize o *Pátio CRM Web* ou o *Assistente de Voz* no navegador para abertura de OS e cadastros.`
          );
          return;
        }

        await msg.reply(resVoz.resposta || 'Áudio processado pelo Pátio CRM.');
        return;
      } catch (errVoz) {
        console.error('[WhatsApp] Erro ao processar áudio no VoiceActionEngine:', errVoz);
        await msg.reply('Não consegui compreender o áudio com clareza. Você pode repetir ou digitar a mensagem?');
        return;
      }
    }

    const textoMensagem = (msg.body || '').trim();
    const textoLower = textoMensagem.toLowerCase().trim();
    console.log(`[WhatsApp] Mensagem no contexto [${isContextAdmin ? 'ADMIN' : (isContextOperacao ? 'OPERAÇÃO' : 'PRIVADO')}] de ${fromNumber}: "${textoMensagem}" | Foto: ${!!base64Image}`);

    // ── Comandos Rápidos de Decisão de Orçamento via WhatsApp ──
    if (textoLower.includes('aprovar') || textoLower.includes('recusar') || (textoLower.includes('orcamento') && (textoLower.includes('sim') || textoLower.includes('não') || textoLower.includes('nao')))) {
      const resOrcWpp = quotationService.processarComandoWhatsAppOrcamento({
        texto: textoMensagem,
        fromNumber,
        state: tenantState,
        tenantId: tenantKey
      });
      if (resOrcWpp.reconhecido && resOrcWpp.resposta) {
        if (resOrcWpp.sucesso) {
          await msg.reply(
            `⚠️ *Aprovação Digital via Link (Piloto Controlado)*\n\n` +
            `No piloto controlado, decisões de orçamento devem ser feitas através do link direto de aprovação digital enviado ao cliente.`
          );
          return;
        }
        await msg.reply(resOrcWpp.resposta);
        return;
      }
    }

    // ── Análise Inteligente de Documento (Fotos & Mensagens) ──
    let docAnalise = null;
    const isDocTextual = textoLower.includes('pedido') || textoLower.includes('orçamento') || textoLower.includes('orcamento') ||
      textoLower.includes('nota fiscal') || textoLower.includes('danfe') || textoLower.includes('nf-e') || textoLower.includes('nfe') ||
      textoLower.includes('comprovante') || textoLower.includes('pagamento pix') || textoLower.includes('pago ');

    if (base64Image || isDocTextual) {
      try {
        docAnalise = await analisarDocumentoWhatsApp(base64Image, textoMensagem);
      } catch (eDoc) {
        console.warn('[WhatsApp] Erro na análise de documento:', eDoc.message);
      }
    }

    // 1. Processamento de Pedido de Compra
    if (docAnalise && docAnalise.tipo === 'pedido_compra') {
      await msg.reply(
        `⚠️ *Canal em Modo Consulta (Piloto Controlado)*\n\n` +
        `O envio de pedidos de compra via WhatsApp está bloqueado no piloto controlado. Realize a entrada de compras diretamente pelo Pátio CRM Web.`
      );
      return;
    }

    // 2. Processamento de Nota Fiscal
    if (docAnalise && docAnalise.tipo === 'nota_fiscal') {
      await msg.reply(
        `⚠️ *Canal em Modo Consulta (Piloto Controlado)*\n\n` +
        `O envio de Notas Fiscais via WhatsApp está bloqueado no piloto controlado. Utilize o módulo Fiscal ou Estoque no Pátio CRM Web.`
      );
      return;
    }

    // 3. Processamento de Comprovante de Pagamento
    if (docAnalise && docAnalise.tipo === 'comprovante_pagamento') {
      await msg.reply(
        `⚠️ *Canal em Modo Consulta (Piloto Controlado)*\n\n` +
        `A conciliação de comprovantes via WhatsApp está bloqueada no piloto controlado. Realize a baixa financeira diretamente no Financeiro do Pátio CRM Web.`
      );
      return;
    }

    // Expressão regular para placas de veículos brasileiros (Mercosul ou Antiga: ABC1234, ABC1D23, ABC-1234)
    const placaRegex = /\b([A-Z]{3}[0-9][0-9A-Z][0-9]{2}|[A-Z]{3}[- ]?[0-9]{4})\b/i;
    let matchPlaca = textoMensagem.match(placaRegex);
    let placaDaFoto = docAnalise?.dados?.placa || null;

    if (base64Image && !placaDaFoto) {
      try {
        const buffer = Buffer.from(base64Image, 'base64');
        const resOcr = await Tesseract.recognize(buffer, 'por');
        const textOcr = (resOcr?.data?.text || '').toUpperCase();
        const m = textOcr.match(placaRegex);
        if (m) {
          placaDaFoto = m[1].replace(/[- ]/g, '');
        }
      } catch (_) {}
    }

    const placaIdentificada = matchPlaca ? matchPlaca[1].toUpperCase().replace(/[- ]/g, '') : placaDaFoto;
    if (placaIdentificada) {
      ultimasPlacas.set(fromNumber, { placa: placaIdentificada, timestamp: Date.now() });
    }

    // Memória contextual de placa recente para este contato (últimos 15 minutos)
    const infoRecente = ultimasPlacas.get(fromNumber);
    const placaContexto = (infoRecente && (Date.now() - infoRecente.timestamp < 15 * 60 * 1000)) ? infoRecente.placa : null;

    // Em grupos, evitar responder conversas normais/paralelas entre funcionários (anti-spam)
    const isComandoExplicito = textoLower.startsWith('!') ||
      ['relatorio', 'relatório', 'caixa', 'saldo', 'patio', 'pátio', 'boxes', 'ajuda', 'menu', 'comandos'].includes(textoLower);
    const isConsultaStatus = textoLower.includes('status') || textoLower.includes('como está') || textoLower.includes('consultar') || textoLower.includes('andamento');
    const isAberturaOS = textoLower.includes('abrir os') || textoLower.startsWith('abrir ') || textoLower === 'abrir';
    const isLancamentoItem = textoLower.includes('inclua') || textoLower.includes('incluir') || textoLower.includes('adicione') || textoLower.includes('adicionar') || textoLower.includes('lance') || textoLower.includes('lancar') || textoLower.includes('lançar');
    const isSaudacao = textoLower === 'oi' || textoLower === 'ola' || textoLower === 'olá' || textoLower === 'bom dia' || textoLower === 'boa tarde' || textoLower === 'boa noite' || textoLower.startsWith('bot') || textoLower.startsWith('agente');

    if (isGroup && !isComandoExplicito && !isConsultaStatus && !isAberturaOS && !isLancamentoItem && !base64Image && !matchPlaca) {
      // Conversa comum entre membros no grupo — robô não interfere
      return;
    }

    try {
      // ── COMANDO: Consulta de Caixa / Posição Financeira ──
      if (textoLower === '!caixa' || textoLower === 'caixa' || textoLower === 'saldo' || textoLower === '!financeiro' || textoLower === 'financeiro') {
        if (isContextOperacao) {
          await msg.reply('🔒 *Acesso Restrito:* Informações financeiras de caixa e valores são disponibilizadas exclusivamente no Grupo da Administração.');
          return;
        }
        const resCaixa = gerarResumoCaixa(tenantState);
        await msg.reply(resCaixa);
        return;
      }

      // ── COMANDO: Relatório Diário ──
      if (textoLower === '!relatorio' || textoLower === 'relatorio' || textoLower === 'relatório' || textoLower === '!posicao' || textoLower === 'posicao' || textoLower === 'posiçao') {
        if (isContextOperacao) {
          // Grupo Operação: 2 mensagens sem nenhum dado financeiro ou R$
          const msgsOp = gerarMensagensOperacao(tenantState);
          await msg.reply(msgsOp[0]);
          await new Promise(r => setTimeout(r, 800));
          await wppClient.sendMessage(msg.from, msgsOp[1]);
          return;
        } else {
          // Grupo Administração: 3 mensagens temáticas + Infográfico JPG
          const msgs = gerarMensagensAdmin(tenantState);
          try {
            const jpgBuffer = await gerarImagemIndicadoresJPG(tenantState, tenantKey);
            const { MessageMedia } = getWhatsAppModules();
            const media = new MessageMedia('image/jpeg', jpgBuffer.toString('base64'), 'painel_executivo.jpg');
            await wppClient.sendMessage(msg.from, media, { caption: msgs[0] });
          } catch (imgErr) {
            console.warn('[WhatsApp] Falha ao enviar imagem JPG no comando !relatorio, enviando texto:', imgErr.message);
            await msg.reply(msgs[0]);
          }
          await new Promise(r => setTimeout(r, 800));
          await wppClient.sendMessage(msg.from, msgs[1]);
          await new Promise(r => setTimeout(r, 800));
          await wppClient.sendMessage(msg.from, msgs[2]);
          return;
        }
      }

      // ── COMANDO: Ocupação do Pátio e Boxes ──
      if (textoLower === '!patio' || textoLower === 'patio' || textoLower === 'pátio' || textoLower === 'boxes') {
        const resPatio = gerarResumoPatio(tenantState);
        await msg.reply(resPatio);
        return;
      }

      // ── COMANDO: Menu de Ajuda / Comandos ──
      if (textoLower === '!ajuda' || textoLower === 'ajuda' || textoLower === 'menu' || textoLower === '!comandos' || textoLower === 'comandos') {
        if (isContextOperacao) {
          const menuOp =
`🛠️ *COMANDOS OPERACIONAIS — PÁTIO CRM* 🚛

Olá, equipe de pátio e compras! Comandos e ações disponíveis:

📦 *Entradas & Documentos (Envie a Foto ou Texto):*
• 📋 *Foto de Pedido de Compra / Orçamento* ➔ Provisiona no Contas a Pagar (Status: _Aguardando NF_)
• 🧾 *Foto de Nota Fiscal (NF-e / DANFE)* ➔ Entrada de peças no almoxarifado, liquida pedido pendente e alimenta o financeiro/fiscal
• 💸 *Foto de Comprovante de Pagamento (Pix / Boleto / TED)* ➔ Baixa em conta a pagar e lançamento de saída de caixa

🚛 *Pátio & Ordens de Serviço:*
• 📸 *Foto da Placa ou Caminhão* ➔ Check-in e abertura automática de OS
• 🚛 *!patio* ➔ Ocupação dos boxes em tempo real
• 📋 *!relatorio* ➔ Veículos amanhecidos na oficina
• 🔍 *Status [placa]* ➔ Andamento e serviços (ex: *Status ABC1234*)
• ➕ *Abrir OS [placa]* ➔ Nova OS por texto (ex: *Abrir OS ABC1234*)
• 📝 *Inclua [serviço]* ➔ Adicionar item à OS (ex: *Inclua troca de mola*)

_Pátio CRM — Operação de Pátio e Oficina_`;
          await msg.reply(menuOp);
          return;
        } else {
          const menuAdmin =
`🛠️ *COMANDOS DE ADMINISTRADOR — PÁTIO CRM* 🚛

Olá! Você tem acesso aos comandos executivos do sistema:

📊 *!relatorio* — Relatório executivo completo (3 mensagens + Gráfico JPG)
💰 *!caixa* — Posição financeira consolidada e títulos do dia
🚛 *!patio* — Ocupação dos boxes e pátio em tempo real
📦 *Fotos de Pedidos, Notas Fiscais e Comprovantes* — Lançamento, provisionamento e conciliação automáticos
🔍 *Status [placa]* — Consultar OS de um veículo (ex: *Status ABC1234*)
➕ *Abrir OS [placa]* — Abrir nova OS com placa ou foto do caminhão
📝 *Inclua [serviço]* — Adicionar item à OS em andamento

_Pátio CRM — Gestão de Oficina Pesada_`;
          await msg.reply(menuAdmin);
          return;
        }
      }

      // ── FLUXO A: Consulta de Status de Veículo ou OS ──
      if (textoLower.includes('status') || textoLower.includes('como está') || textoLower.includes('consultar') || textoLower.includes('andamento')) {
        const osLista = tenantState?.os || [];
        const placaAlvo = placaIdentificada || placaContexto;

        if (placaAlvo) {
          const veic = (tenantState?.veiculos || []).find(v => v.placa && v.placa.toUpperCase().replace(/[^A-Z0-9]/g, '') === placaAlvo);
          const osVeiculo = veic ? osLista.find(o => o.vei === veic.id && o.st !== 'finalizada') : null;

          if (osVeiculo) {
            const boxInfo = osVeiculo.box ? ((tenantState?.boxes || []).find(b => b.id === osVeiculo.box) || { nome: 'Box Pátio' }).nome : 'Fila de Espera no Pátio';
            
            // Para Operação, não exibir preços ou R$
            let itensServ = '';
            let itensPec = '';
            if (isContextOperacao) {
              itensServ = (osVeiculo.servicos || []).map(s => `• ${s.nome} (${s.qtd}x)`).join('\n') || '• Vistoria de Entrada';
              itensPec = (osVeiculo.pecas || []).map(p => `• ${p.nome} (${p.qtd}x)`).join('\n');
            } else {
              itensServ = (osVeiculo.servicos || []).map(s => `• ${s.nome} (${s.qtd}x) — R$ ${(s.valor * s.qtd).toFixed(2)}`).join('\n') || '• Vistoria de Entrada';
              itensPec = (osVeiculo.pecas || []).map(p => `• ${p.nome} (${p.qtd}x) — R$ ${(p.valor * p.qtd).toFixed(2)}`).join('\n');
            }

            let resposta =
`📋 *Status da OS #${osVeiculo.num} — Placa ${veic.placa}*

🚛 *Veículo:* ${veic.marca || ''} ${veic.modelo || 'Caminhão'}
📍 *Localização:* ${boxInfo}
⚙️ *Situação:* *${osVeiculo.st.toUpperCase()}*
📅 *Previsão de Entrega:* ${osVeiculo.prev || 'Em andamento'}

🔧 *Serviços Lançados:*
${itensServ}
${itensPec ? `\n📦 *Peças:* \n${itensPec}` : ''}`;

            if (!isContextOperacao) {
              resposta += `\n\n💰 *Valor Atual da OS:* R$ ${(osVeiculo.total || 0).toFixed(2)}`;
            }

            resposta += `\n\n_Para adicionar serviços à OS, digite: "Inclua [serviço]"_`;
            await msg.reply(resposta);
            return;
          } else {
            await msg.reply(`Não localizei nenhuma OS em andamento para a placa *${placaAlvo}*. Para abrir uma nova OS, envie: *Abrir OS placa ${placaAlvo}*.`);
            return;
          }
        }

        // Status geral das últimas OSs
        if (osLista.length > 0) {
          const ultimas = osLista.slice(0, 4).map(o => {
            const v = (tenantState?.veiculos || []).find(x => x.id === o.vei) || { placa: 'N/I' };
            const b = o.box ? ((tenantState?.boxes || []).find(bx => bx.id === o.box) || {}).nome : 'Fila de Espera';
            return `• *OS #${o.num}* — Placa *${v.placa}*: ${o.st.toUpperCase()} (${b})`;
          }).join('\n');

          await msg.reply(`📋 *Painel Geral de Ordens de Serviço:*\n\n${ultimas}\n\nPara consultar o status de um veículo específico, envie: *Status placa ABC1234*.`);
        } else {
          await msg.reply('Nenhuma Ordem de Serviço ativa no momento. Para abrir uma nova OS, digite: *Abrir OS placa ABC1234*.');
        }
        return;
      }

      // ── FLUXO B0: Redirecionamento de Veículo Ativo para Box / Fila de Espera ──
      const isRedirecionamentoBox = (
        textoLower.includes('direcionar') ||
        textoLower.includes('mover') ||
        textoLower.includes('mudar box') ||
        textoLower.includes('trocar box') ||
        textoLower.includes('colocar no box') ||
        textoLower.includes('passar para o box')
      ) && !textoLower.includes('abrir os') && !textoLower.includes('abrir nova os');

      if (isRedirecionamentoBox) {
        const placaAlvo = placaIdentificada || placaContexto;
        const osLista = (tenantState?.os || []).filter(o => o.st !== 'finalizada');
        let osAlvo = null;
        let veicAlvo = null;

        if (placaAlvo) {
          veicAlvo = (tenantState?.veiculos || []).find(v => v.placa && v.placa.toUpperCase().replace(/[^A-Z0-9]/g, '') === placaAlvo);
          if (veicAlvo) osAlvo = osLista.find(o => o.vei === veicAlvo.id);
        }

        if (!osAlvo) {
          const matchNum = textoMensagem.match(/\bos\s*(?:#|n[º°]?)?\s*(\d+)\b/i);
          if (matchNum) {
            osAlvo = osLista.find(o => String(o.num) === matchNum[1]);
            if (osAlvo) veicAlvo = (tenantState?.veiculos || []).find(v => v.id === osAlvo.vei);
          }
        }

        if (osAlvo && veicAlvo) {
          const boxesValidos = new Set(['b1', 'b2', 'b3', 'b4', 'b5', 'b6']);
          const boxes = (tenantState.boxes || []).filter(b => boxesValidos.has(b.id));

          let boxDesejado = null;
          if (textoLower.includes('fila') || textoLower.includes('pátio') || textoLower.includes('patio') || textoLower.includes('espera')) {
            boxDesejado = 'fila';
          } else {
            const matchBox = textoLower.match(/\b(?:box|ao\s+box|para\s+o\s+box)\s*(?:b)?([1-6]|um|dois|tr[eê]s|quatro|cinco|seis)\b/i) ||
                             textoLower.match(/\bbox\s*(?:b)?([1-6])\b/i);
            if (matchBox) {
              const mapaNum = { '1': 'b1', 'um': 'b1', '2': 'b2', 'dois': 'b2', '3': 'b3', 'tres': 'b3', 'três': 'b3', '4': 'b4', 'quatro': 'b4', '5': 'b5', 'cinco': 'b5', '6': 'b6', 'seis': 'b6' };
              const raw = matchBox[1].toLowerCase();
              boxDesejado = mapaNum[raw] || ('b' + raw);
            }
          }

          if (boxDesejado) {
            await msg.reply(
              `⚠️ *Canal em Modo Consulta (Piloto Controlado)*\n\n` +
              `Movimentação de boxes via WhatsApp está desativada no piloto controlado. Utilize o painel de Pátio & Boxes na Web.`
            );
            return;
          }
        }
      }

      // ── FLUXO INTAKE / DIÁLOGO DE PRÉ-OS ATIVA (WhatsApp) ──
      const sessaoAtiva = technicalIntakeEngine.localizarSessaoAtiva({
        tenantId: tenantKey,
        actorId: `zap_${fromNumber}`,
        channel: 'whatsapp',
        state: tenantState
      });

      if (sessaoAtiva && !textoLower.includes('abrir nova os') && !base64Image) {
        await msg.reply(
          `⚠️ *Canal em Modo Consulta (Piloto Controlado)*\n\n` +
          `A triagem interativa via WhatsApp está desativada no piloto controlado. Abra a OS diretamente pelo Pátio CRM Web ou por voz no navegador.`
        );
        return;
      }

      // ── FLUXO B: Abertura de Nova OS (Se tiver placa na foto ou no texto, ou se o usuário pediu "abrir os") ──
      const querAbrirOS = placaIdentificada || textoLower.includes('abrir os') || textoLower.includes('abrir') || base64Image;
      const placaFinalParaAbrir = placaIdentificada || (textoLower.includes('abrir') ? placaContexto : null);

      if (placaFinalParaAbrir) {
        await msg.reply(
          `⚠️ *Canal em Modo Consulta (Piloto Controlado)*\n\n` +
          `Abertura de OS via WhatsApp está desativada durante o piloto controlado para assegurar integridade transacional.\n` +
          `Por favor, utilize o Pátio CRM Web ou o assistente de voz no navegador para abrir a OS da placa ${placaFinalParaAbrir}.`
        );
        return;
      }

      // ── FLUXO C: Lançar/Incluir Serviço ou Peça na OS Ativa ──
      if (textoLower.includes('inclua') || textoLower.includes('incluir') || textoLower.includes('adicione') || textoLower.includes('adicionar') || textoLower.includes('lance') || textoLower.includes('lancar') || textoLower.includes('lançar')) {
        await msg.reply(
          `⚠️ *Canal em Modo Consulta (Piloto Controlado)*\n\n` +
          `Lançamento de itens na OS via WhatsApp desativado no piloto controlado. Acesse a folha da OS no Pátio CRM Web.`
        );
        return;
      }

      // ── FLUXO D: Usuário enviou foto mas não foi possível identificar documento ou placa ──
      if (base64Image) {
        const resposta = `📸 *Foto recebida no Pátio CRM!*\n\n` +
          `Não consegui identificar o documento ou a placa do caminhão com nitidez.\n\n` +
          `Você pode enviar:\n` +
          `• 📋 *Foto de Pedido de Compra / Orçamento*\n` +
          `• 🧾 *Foto ou DANFE de Nota Fiscal (NF-e)*\n` +
          `• 💸 *Comprovante de Pagamento (Pix / Boleto / TED)*\n` +
          `• 🚛 *Foto da Placa do Caminhão (Ex: ABC1D23)*`;
        await msg.reply(resposta);
        return;
      }

      // ── FLUXO E: Usuário pediu para abrir OS mas não informou placa ──
      if (textoLower.includes('abrir') && textoLower.includes('os')) {
        await msg.reply('Para abrir a Ordem de Serviço, por favor informe a placa do veículo (ex: *Abrir OS placa ABC1234*) ou envie uma foto do caminhão/placa.');
        return;
      }

      // ── FLUXO F: Saudações ──
      if (isSaudacao) {
        const saudacao = `Olá! Sou o assistente virtual do *Pátio CRM* 🚛⚙️\n\n` +
          `Como posso ajudar você hoje?\n` +
          `1️⃣ *Para abrir uma OS:* Digite *Abrir OS placa ABC1234* ou envie a foto da placa.\n` +
          `2️⃣ *Para consultar status:* Digite *Status placa ABC1234*.\n` +
          `3️⃣ *Para incluir serviços:* Digite *Inclua [serviço]*.\n` +
          `4️⃣ *Para ver a ocupação:* Digite *!patio*`;
        await msg.reply(saudacao);
        return;
      }

      // ── FLUXO G: Conversação e Comandos Naturais via VoiceActionEngine ──
      const isFalaNatural = textoLower.includes('chegou') || textoLower.includes('coloca') || textoLower.includes('adiciona') ||
        textoLower.includes('não, a') || textoLower.includes('nao, a') || textoLower.includes('reclamou') || textoLower.includes('falou') ||
        textoLower.includes('quando freia') || textoLower.includes('barulho') || textoLower.includes('gelando') || textoLower.includes('vibrando') ||
        textoLower.includes('quilometragem') || textoLower.includes('excluir os') || textoLower.includes('apagar os');

      if (isFalaNatural || (!isGroup && textoMensagem.length > 5)) {
        const resNat = await voiceActionEngine.interpretarEExecutar({
          input: { text: textoMensagem },
          context: {
            canal: 'whatsapp',
            tenantId: tenantKey,
            remetente: fromNumber,
            actorId: fromNumber,
            role: isSenderAdmin ? 'tenant_admin' : (isContextOperacao ? 'atendente' : 'cliente'),
            permissions: isSenderAdmin ? ['*'] : (isContextOperacao ? ['os:read', 'os:write'] : []),
            isSenderAdmin: !!isSenderAdmin,
            isContextOperacao: !!isContextOperacao,
            isContextAdmin: !!isContextAdmin
          },
          state: tenantState,
          aiClient: ai
        });

        if (resNat.ok) {
          if (resNat.acao === 'consultar_status' || resNat.acao === 'duvida_geral') {
            await msg.reply(resNat.resposta);
            return;
          } else {
            await msg.reply(
              `⚠️ *Canal em Modo Consulta (Piloto Controlado)*\n\n` +
              `Operações de abertura e alteração de OS via WhatsApp estão desativadas durante o piloto controlado para assegurar integridade transacional.\n` +
              `Por favor, utilize o Pátio CRM Web ou o assistente de voz no navegador.`
            );
            return;
          }
        }
      }

      // Se estiver no chat privado do administrador e não deu match nos anteriores:
      if (!isGroup) {
        await msg.reply(
          `Mensagem recebida no *Pátio CRM*! 🚛\n\n` +
          `• Digite *!ajuda* para ver todos os comandos disponíveis.\n` +
          `• Digite *!relatorio* para o relatório executivo matinal.\n` +
          `• Digite *!caixa* para a posição financeira.`
        );
      }
    } catch (localErr) {
      console.error('[WhatsApp] Erro no processamento de mensagem:', localErr);
      try {
        await msg.reply('Recebemos sua mensagem! Nossa equipe já está verificando no sistema.');
      } catch (_) {}
    }
  });

  try {
    wppClient.initialize();
  } catch (err) {
    console.error('[WhatsApp] Erro ao chamar wppClient.initialize():', err);
  }
}

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
