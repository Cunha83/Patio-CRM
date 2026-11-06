'use strict';

const { get, run, all, transaction } = require('../../db');
const { validateState, createWriteQueue } = require('../core');
const { metrics } = require('../metrics');
const { getDefaultState } = require('./defaultState');
const { filterStateByRole } = require('./stateRoleFilter');
const { sanitizeAndProtectState } = require('./stateSanitizer');

class PersistenceError extends Error {
  constructor(message, { status = 500, conflict = false, versao = null, cause = null, result = null } = {}) {
    super(message || 'Falha na persistência de estado.');
    this.name = 'PersistenceError';
    this.status = status;
    this.conflict = conflict;
    this.versao = versao;
    this.cause = cause;
    this.result = result;
  }
}

const tenantStates = new Map();
const tenantRevisionMemory = new Map();
const tenantWriteQueues = new Map();

function getTenantWriteQueue(tenantId) {
  const tid = (tenantId || 'default').trim();
  if (!tenantWriteQueues.has(tid)) {
    tenantWriteQueues.set(tid, createWriteQueue());
  }
  return tenantWriteQueues.get(tid);
}

function isValidTenantId(id) {
  if (!id || typeof id !== 'string') return false;
  return /^[a-zA-Z0-9_-]{3,64}$/.test(id.trim());
}

function storageKey(tenantId) {
  if (!isValidTenantId(tenantId)) {
    throw new Error(`TenantId inválido: "${tenantId}". Identificadores devem conter apenas letras, números, hífens e underscores (3 a 64 caracteres).`);
  }
  return `tenant:${tenantId.trim()}:state`;
}

function nextRevision(tenantId, currentVersao = 0) {
  const lastRev = tenantRevisionMemory.get(tenantId) || 0;
  const next = Math.max(Date.now(), lastRev + 1, (currentVersao || 0) + 1);
  tenantRevisionMemory.set(tenantId, next);
  return next;
}



async function getState(tenantId) {
  const t0 = performance.now();
  if (!isValidTenantId(tenantId)) return null;
  const key = storageKey(tenantId);
  if (tenantStates.has(tenantId)) {
    const result = JSON.parse(JSON.stringify(tenantStates.get(tenantId)));
    metrics.recordRepoRead({
      latencyMs: performance.now() - t0,
      success: true,
      cacheHit: true,
      tenantId
    });
    return result;
  }

  let row;
  try {
    row = await get('SELECT value FROM kv WHERE key = ?', [key]);
    if (!row && (tenantId === 'default' || tenantId === 'state')) {
      row = await get("SELECT value FROM kv WHERE key = 'state'");
    }
    if (!row) {
      row = await get('SELECT value FROM kv WHERE key = ?', [`state:${tenantId}`]);
    }
  } catch (err) {
    metrics.recordRepoRead({
      latencyMs: performance.now() - t0,
      success: false,
      cacheHit: false,
      tenantId,
      error: err.message
    });
    throw err;
  }

  if (!row || !row.value) {
    metrics.recordRepoRead({
      latencyMs: performance.now() - t0,
      success: true,
      cacheHit: false,
      tenantId
    });
    return null;
  }

  try {
    const parsed = JSON.parse(row.value);
    tenantStates.set(tenantId, parsed);
    tenantRevisionMemory.set(tenantId, parsed.versao || 0);
    metrics.recordRepoRead({
      latencyMs: performance.now() - t0,
      success: true,
      cacheHit: false,
      tenantId
    });
    return JSON.parse(JSON.stringify(parsed));
  } catch (e) {
    console.error(`[StateRepository] Erro ao parsear JSON do tenant ${tenantId}:`, e.message);
    metrics.recordRepoRead({
      latencyMs: performance.now() - t0,
      success: false,
      cacheHit: false,
      tenantId,
      error: 'json_parse_error'
    });
    return null;
  }
}

async function persistState(contextOrTenantId, incomingState, options = {}) {
  const t0 = performance.now();

  let context = contextOrTenantId;
  let enqueueWrite = options?.enqueueWrite || (async (fn) => await fn());

  if (typeof contextOrTenantId === 'string') {
    const ctxOverride = typeof options === 'object' && options !== null ? options : {};
    context = {
      tenantId: contextOrTenantId,
      role: ctxOverride.role || 'tenant_admin',
      permissions: ctxOverride.permissions || ['*'],
      channel: ctxOverride.channel || 'internal'
    };
    if (typeof ctxOverride.enqueueWrite === 'function') {
      enqueueWrite = ctxOverride.enqueueWrite;
    }
  }

  const { tenantId, permissions = [] } = context || {};
  if (!isValidTenantId(tenantId)) {
    throw new Error('TenantId inválido no contexto de segurança.');
  }

  const errVal = validateState(incomingState);
  if (errVal) {
    metrics.recordRepoWrite({
      latencyMs: performance.now() - t0,
      success: false,
      status: 400,
      tenantId,
      error: errVal
    });
    return { ok: false, status: 400, error: errVal };
  }

  return await enqueueWrite(async () => {
    const current = await getState(tenantId);
    const expectedVersao = incomingState.versao || 0;
    const currentVersao = current?.versao || 0;

    const isForced = options?.force === true;
    if (!isForced && current && expectedVersao !== currentVersao) {
      metrics.recordRepoWrite({
        latencyMs: performance.now() - t0,
        success: false,
        conflict: true,
        status: 409,
        tenantId,
        error: 'version_conflict_409'
      });
      return { ok: false, status: 409, conflict: true, versao: currentVersao, error: 'Conflito de versão detectado: o estado foi modificado concorrentemente.' };
    }

    const stateToSave = JSON.parse(JSON.stringify(incomingState));
    // A substituição HTTP do estado exige autorização por entidade. Mutações
    // dos serviços continuam usando suas próprias permissões e comandos.
    if (options.authorizeReplacement && !permissions.includes('*')) {
      const visible = filterStateByRole(current || getDefaultState(tenantId), context);
      const same = require('node:util').isDeepStrictEqual;
      for (const [field, permission] of [['os', 'os:write'], ['clientes', 'crm:write'], ['veiculos', 'crm:write']]) {
        let comparison = incomingState[field] || [];
        // Compatibilidade com o apontamento de andamento no painel do mecânico:
        // somente status de OS existentes, sem permitir criação ou exclusão.
        if (field === 'os' && context.role === 'mecanico' && permissions.includes('labor:write')) {
          const allowedStatus = ['fila', 'executando', 'peca', 'aprovacao', 'finalizada'];
          comparison = comparison.map(o => {
            const previous = (visible.os || []).find(x => x.id === o.id);
            if (!previous || !allowedStatus.includes(o.st)) return o;
            const normalized = { ...o };
            if (Object.hasOwn(previous, 'st')) normalized.st = previous.st;
            else delete normalized.st;
            return normalized;
          });
        }
        if (!permissions.includes(permission) && !same(comparison, visible[field] || [])) {
          return { ok: false, status: 403, error: `Permissão necessária: ${permission}.` };
        }
      }
      if (!permissions.includes('os:delete')) {
        const ids = new Set((incomingState.os || []).map(o => o.id));
        if ((current?.os || []).some(o => !ids.has(o.id))) {
          return { ok: false, status: 403, error: 'Permissão necessária: os:delete.' };
        }
      }
    }
    delete stateToSave._excluidos;
    delete stateToSave.user;
    delete stateToSave.perfil;
    if (stateToSave.ui) {
      delete stateToSave.ui.perfilAtivo;
    }


    // ── PROTEÇÃO DE CAMPOS ADMINISTRATIVOS & RBAC EFETIVO (DELEGADO) ──
    await sanitizeAndProtectState(stateToSave, current, context, permissions);

    const revision = nextRevision(tenantId, currentVersao);
    stateToSave.versao = revision;

    const key = storageKey(tenantId);
    const jsonStr = JSON.stringify(stateToSave);

    // Persistência Transacional: escreve no SQLite ANTES de atualizar a memória
    try {
      await run('INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)', [key, jsonStr]);
    } catch (dbErr) {
      metrics.recordRepoWrite({
        latencyMs: performance.now() - t0,
        success: false,
        status: 500,
        tenantId,
        error: dbErr.message
      });
      throw dbErr;
    }

    // Publica no cache em memória somente após commit bem-sucedido
    tenantStates.set(tenantId, stateToSave);

    // Snapshot atômico data/database.json para redundância e integridade estruturada
    try {
      const { salvarSnapshotDatabase } = require('../persistence/jsonDatabase');
      salvarSnapshotDatabase(stateToSave);
    } catch (_) {}

    metrics.recordRepoWrite({
      latencyMs: performance.now() - t0,
      success: true,
      status: 200,
      tenantId
    });

    return {
      ok: true,
      status: 200,
      versao: revision,
      state: JSON.parse(JSON.stringify(stateToSave))
    };
  });
}

/**
 * Executa uma mutação atômica no estado do tenant garantindo que a leitura,
 * a modificação e a persistência ocorram dentro da fila de escrita (enqueueWrite),
 * eliminando a condição de corrida de "lost update".
 *
 * @param {Object} context - Contexto de segurança (tenantId, actorId, permissions, etc.)
 * @param {Function} mutatorFn - Função: (stateDraft, currentState) => stateDraft | void
 * @param {Object} options - Opções (enqueueWrite, etc.)
 */
async function mutateState(context, mutatorFn, options = {}) {
  const tenantId = context?.tenantId || 'default';
  let enqueueWrite = options?.enqueueWrite;
  if (typeof options === 'function') {
    enqueueWrite = options;
  }
  if (typeof enqueueWrite !== 'function') {
    enqueueWrite = getTenantWriteQueue(tenantId);
  }

  return await enqueueWrite(async () => {
    const current = (await getState(tenantId)) || getDefaultState(tenantId);
    const draft = JSON.parse(JSON.stringify(current));
    const result = await mutatorFn(draft, current);
    if (result === false || (result && result.abort)) {
      return {
        ok: false,
        aborted: true,
        status: result?.status || result?.resultado?.status,
        error: result?.error || result?.resultado?.error || 'Mutação cancelada.',
        mutatorResult: result
      };
    }
    const stateToSave = (result && typeof result === 'object' && !Array.isArray(result) && (result.os || result.veiculos || result.clientes || result.boxes)) ? result : draft;
    stateToSave.versao = current?.versao || 0;
    const saveResult = await persistState(context, stateToSave, { ...options, force: true, enqueueWrite });
    return { ...saveResult, mutatorResult: result };
  });
}

function clearMemoryCache(tenantId = null) {
  if (tenantId) {
    tenantStates.delete(tenantId);
    tenantRevisionMemory.delete(tenantId);
    tenantWriteQueues.delete(tenantId);
  } else {
    tenantStates.clear();
    tenantRevisionMemory.clear();
    tenantWriteQueues.clear();
  }
}


module.exports = {
  PersistenceError,
  isValidTenantId,
  storageKey,
  getState,
  loadState: getState,
  getDefaultState,
  persistState,
  mutateState,
  getTenantWriteQueue,
  clearMemoryCache,
  nextRevision,
  filterStateByRole
};
