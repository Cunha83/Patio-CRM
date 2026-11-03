'use strict';

const { normalizePhone, isAdminPhone } = require('../../../lib/core');
const {
  safeJsonParse,
  recordSecurityAudit,
  getOrLoadState
} = require('../../../lib/serverContext');
const financialEngine = require('../../financialEngine');

// Rate limit em memória por número remetente (máx 15 requisições por janela de 1 minuto)
const rateLimitMap = new Map();
const RATE_LIMIT_JANELA_MS = 60 * 1000;
const RATE_LIMIT_MAX_REQ = 15;

function verificarRateLimit(numero) {
  const norm = normalizePhone(numero) || String(numero || '');
  if (!norm) return { permitido: true };
  const agora = Date.now();
  let entrada = rateLimitMap.get(norm);
  if (!entrada || agora - entrada.inicioJanela > RATE_LIMIT_JANELA_MS) {
    entrada = { inicioJanela: agora, contagem: 1 };
    rateLimitMap.set(norm, entrada);
    return { permitido: true };
  }
  entrada.contagem += 1;
  if (entrada.contagem > RATE_LIMIT_MAX_REQ) {
    return { permitido: false, excedido: true, contagem: entrada.contagem };
  }
  return { permitido: true };
}

// Limpeza periódica do mapa de rate limit a cada 5 minutos
setInterval(() => {
  const agora = Date.now();
  for (const [num, ent] of rateLimitMap.entries()) {
    if (agora - ent.inicioJanela > RATE_LIMIT_JANELA_MS * 5) {
      rateLimitMap.delete(num);
    }
  }
}, 5 * 60 * 1000).unref();

// Idempotência por ID de mensagem do WhatsApp prefixada por Tenant (TTL 10 minutos, durável em SQLite KV)
const mensagensProcessadas = new Map();
const IDEMPOTENCIA_TTL_MS = 10 * 60 * 1000;

async function verificarIdempotencia(msgId, tenantKey = 'default') {
  if (!msgId) return { duplicada: false };
  const agora = Date.now();
  const idStr = String(msgId);
  const chaveTenant = `tenant:${tenantKey}:wpp_msg:${idStr}`;

  // 1. Cache em memória para resposta rápida
  const regMem = mensagensProcessadas.get(chaveTenant);
  if (regMem && agora - regMem.timestamp < IDEMPOTENCIA_TTL_MS) {
    return { duplicada: true, resposta: regMem.resposta };
  }

  // 2. Persistência durável no SQLite kv
  try {
    const { get } = require('../../../db');
    if (get && typeof get === 'function') {
      const row = await get('SELECT value FROM kv WHERE key = ?', [chaveTenant]);
      if (row && row.value) {
        const parsed = safeJsonParse(row.value);
        if (parsed && agora < (parsed.expiraEm || 0)) {
          mensagensProcessadas.set(chaveTenant, { timestamp: parsed.timestamp, resposta: parsed.resposta });
          return { duplicada: true, resposta: parsed.resposta };
        }
      }
    }
  } catch (err) {
    console.warn('[WhatsApp Idempotência] Falha tolerante ao verificar KV SQLite:', err.message);
  }

  return { duplicada: false };
}

async function registrarIdempotencia(msgId, resposta = null, tenantKey = 'default') {
  if (!msgId) return;
  const agora = Date.now();
  const idStr = String(msgId);
  const chaveTenant = `tenant:${tenantKey}:wpp_msg:${idStr}`;
  mensagensProcessadas.set(chaveTenant, { timestamp: agora, resposta });

  try {
    const { run } = require('../../../db');
    if (run && typeof run === 'function') {
      const value = JSON.stringify({
        timestamp: agora,
        resposta,
        tenantKey,
        expiraEm: agora + IDEMPOTENCIA_TTL_MS
      });
      await run('INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)', [chaveTenant, value]);
    }
  } catch (err) {
    console.warn('[WhatsApp Idempotência] Falha tolerante ao persistir KV SQLite:', err.message);
  }
}

setInterval(async () => {
  const agora = Date.now();
  for (const [id, reg] of mensagensProcessadas.entries()) {
    if (agora - reg.timestamp > IDEMPOTENCIA_TTL_MS) {
      mensagensProcessadas.delete(id);
    }
  }
  try {
    const { run } = require('../../../db');
    if (run && typeof run === 'function') {
      // Remove chaves antigas de mensagem expiradas do kv
      await run("DELETE FROM kv WHERE key LIKE '%:wpp_msg:%' AND json_extract(value, '$.expiraEm') < ?", [agora]);
    }
  } catch (_) {}
}, 5 * 60 * 1000).unref();

// Memória de operações financeiras de escrita aguardando confirmação explícita (TTL estrito de 2 minutos)
const confirmacoesPendentes = new Map();
const execucoesEmAndamento = new Set();
const CONFIRMACAO_TTL_MS = 2 * 60 * 1000;

setInterval(() => {
  const agora = Date.now();
  for (const [chave, item] of confirmacoesPendentes.entries()) {
    if (agora > item.expiraEm) {
      confirmacoesPendentes.delete(chave);
    }
  }
}, 30 * 1000).unref();

async function obterPerfilNumeroWhatsApp({ tenantKey = 'default', numero, tenantState = {} }) {
  const norm = normalizePhone(numero);
  if (!norm) return { role: 'desconhecido', permissions: [] };

  // 1. Mecânicos cadastrados no estado
  const mecanicos = Array.isArray(tenantState?.mecanicos) ? tenantState.mecanicos : (Array.isArray(tenantState?.workers) ? tenantState.workers : []);
  const isMec = mecanicos.some(m => normalizePhone(m.fone || m.telefone || m.phone) === norm);
  if (isMec) {
    return { role: 'mecanico', permissions: ['os:read', 'labor:read', 'labor:write'] };
  }

  // 2. Atendentes cadastrados no estado
  const atendentes = Array.isArray(tenantState?.atendentes) ? tenantState.atendentes : [];
  const isAtend = atendentes.some(a => normalizePhone(a.fone || a.telefone || a.phone) === norm);
  if (isAtend) {
    return { role: 'atendente', permissions: ['os:read', 'os:write', 'crm:read'] };
  }

  // 3. Verificação no banco de dados persistente (users / memberships)
  try {
    const db = require('../../../db');
    if (db && typeof db.get === 'function') {
      const userRow = await db.get('SELECT id FROM users WHERE phone = ?', [norm]);
      if (userRow) {
        const memRows = await db.all('SELECT role, permissions_json FROM memberships WHERE user_id = ?', [userRow.id]);
        const mem = memRows.find(m => m.tenant_id === tenantKey) || memRows[0];
        if (mem) {
          const perms = JSON.parse(mem.permissions_json || '[]');
          return { role: mem.role, permissions: perms };
        }
      }
    }
  } catch (_) {}

  // 4. Se estiver em financeiroFones no cfg do tenant
  const finFones = Array.isArray(tenantState?.cfg?.financeiroFones) ? tenantState.cfg.financeiroFones : [];
  if (finFones.some(f => normalizePhone(f) === norm)) {
    return { role: 'financeiro', permissions: ['financial:read', 'financial:write'] };
  }

  // 5. Se estiver em adminFones / WHATSAPP_ADMIN_NUMBERS (Dono / Administrador do Tenant)
  const adminList = (process.env.WHATSAPP_ADMIN_NUMBERS || '')
    .split(',')
    .map(s => s.trim().replace(/\D/g, ''))
    .filter(Boolean);
  if (tenantState?.cfg?.adminFones && Array.isArray(tenantState.cfg.adminFones)) {
    tenantState.cfg.adminFones.forEach(f => {
      const clean = String(f).replace(/\D/g, '');
      if (clean && !adminList.includes(clean)) adminList.push(clean);
    });
  }

  if (isAdminPhone(norm, adminList)) {
    return { role: 'tenant_admin', permissions: ['*'] };
  }

  return { role: 'desconhecido', permissions: [] };
}

function podeExecutarEscritaFinanceira(perfil) {
  if (!perfil) return false;
  if (perfil.role === 'mecanico' || perfil.role === 'atendente') return false;
  if (['tenant_admin', 'admin', 'financeiro', 'platform_admin'].includes(perfil.role)) return true;
  const perms = Array.isArray(perfil.permissions) ? perfil.permissions : [];
  return perms.includes('*') || perms.includes('financial:write');
}

function podeExecutarEstorno(perfil) {
  if (!perfil) return false;
  if (perfil.role === 'mecanico' || perfil.role === 'atendente' || perfil.role === 'financeiro') return false;
  if (['tenant_admin', 'dono', 'owner', 'platform_admin', 'admin'].includes(perfil.role)) return true;
  const perms = Array.isArray(perfil.permissions) ? perfil.permissions : [];
  return perms.includes('*');
}

async function auditarComandoWhatsApp({ tenantId, numero, comando, resultado, detalhes = {} }) {
  try {
    const agoraSP = financialEngine.obterAgoraSP();
    const entry = {
      tenantId: tenantId || 'default',
      actorId: `whatsapp:${numero || 'desconhecido'}`,
      actorType: 'whatsapp_sender',
      action: 'whatsapp_command',
      entity: 'financial_agent',
      entityId: comando || 'desconhecido',
      details: {
        numeroNormalizado: numero,
        comando,
        resultado,
        horarioSP: `${agoraSP.dataBR} ${agoraSP.horaBR}`,
        dataISO: agoraSP.dataISO,
        ...detalhes
      }
    };
    await recordSecurityAudit(entry);
    try {
      const st = await getOrLoadState(tenantId || 'default');
      if (st) {
        if (!Array.isArray(st.security_audit_log)) st.security_audit_log = [];
        st.security_audit_log.unshift(entry);
      }
    } catch (_) {}
  } catch (err) {
    console.warn('[WhatsApp Audit] Falha não-bloqueante ao gravar auditoria:', err.message);
  }
}

module.exports = {
  rateLimitMap,
  RATE_LIMIT_JANELA_MS,
  RATE_LIMIT_MAX_REQ,
  mensagensProcessadas,
  confirmacoesPendentes,
  execucoesEmAndamento,
  verificarRateLimit,
  verificarIdempotencia,
  registrarIdempotencia,
  obterPerfilNumeroWhatsApp,
  podeExecutarEscritaFinanceira,
  podeExecutarEstorno,
  auditarComandoWhatsApp
};
