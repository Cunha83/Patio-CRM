const crypto = require('crypto');
const { initDB, all, run, get, closeDB, transaction } = require('../db');
const { createWriteQueue, createAuth, isAdminPhone, validateState } = require('./core');
const { IdentityRegistry } = require('./auth/identity');
const { createAuthMiddleware } = require('./auth/context');
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
} = require('./repository/stateRepository');
const userRepository = require('./auth/userRepository');
const billingService = require('../services/billing/billingService');
const maintenancePlanService = require('../services/maintenancePlanService');
const afterSalesService = require('../services/afterSalesService');
const relationshipService = require('../services/relationshipService');

// Mutex em memória para avaliações operacionais concorrentes por tenant
const runningEvaluations = new Set();
const runningMaintenanceEvals = new Set();
const runningAfterSalesEvals = new Set();
const runningRelationshipEvals = new Set();

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

// Avaliações periódicas
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
const placaCleanupInterval = setInterval(() => {
  const agora = Date.now();
  for (const [key, val] of ultimasPlacas) {
    if (agora - (val.timestamp || 0) > 15 * 60 * 1000) ultimasPlacas.delete(key);
  }
}, 5 * 60 * 1000);
if (placaCleanupInterval.unref) placaCleanupInterval.unref();

// Gerador de IDs únicos
function gerarId(prefix) {
  return `${prefix}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
}

// Helper para sanitizar HTML
function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Safe JSON parse
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

// Autenticação Desacoplada
const API_KEY = process.env.API_KEY || '';
const AUTH_USER = process.env.AUTH_USER || '';
const AUTH_PASSWORD = process.env.AUTH_PASSWORD || '';

const isTestEnv = process.env.NODE_ENV !== 'production';
const identityRegistry = new IdentityRegistry({ allowWeakInTest: isTestEnv });

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

// Singletons / instâncias de integração e adapters
let aiClientInstance = null;
let wppClientInstance = null;
let browserRenderCacheInstance = null;
let passwordResetDeliveryAdapterInstance = null;
let patioSupportInstance = null;

function getAiClient() {
  return aiClientInstance;
}
function setAiClient(client) {
  aiClientInstance = client;
}

function getWppClient() {
  return wppClientInstance;
}
function setWppClient(client) {
  wppClientInstance = client;
}

function getBrowserRenderCache() {
  return browserRenderCacheInstance;
}
function setBrowserRenderCache(cache) {
  browserRenderCacheInstance = cache;
}

function getPasswordResetDeliveryAdapter() {
  return passwordResetDeliveryAdapterInstance;
}
function setPasswordResetDeliveryAdapter(adapter) {
  passwordResetDeliveryAdapterInstance = adapter;
}

function getPatioSupport() {
  return patioSupportInstance;
}
function setPatioSupport(support) {
  patioSupportInstance = support;
}

module.exports = {
  runningEvaluations,
  runningMaintenanceEvals,
  runningAfterSalesEvals,
  runningRelationshipEvals,
  enqueueWrite,
  nextRevision,
  extractTenantId,
  getTenantKey,
  getOrLoadState,
  salvarEstado,
  persistTenantState,
  persistCurrentState,
  mutateTenantState,
  avaliarManutencoes,
  avaliarPosVenda,
  avaliarRelacionamento,
  ultimasPlacas,
  gerarId,
  escapeHtml,
  safeJsonParse,
  identityRegistry,
  serverInitializationPromise,
  authMiddleware,
  requirePermission,
  recordSecurityAudit,
  getAiClient,
  setAiClient,
  getWppClient,
  setWppClient,
  getBrowserRenderCache,
  setBrowserRenderCache,
  getPasswordResetDeliveryAdapter,
  setPasswordResetDeliveryAdapter,
  getPatioSupport,
  setPatioSupport
};
