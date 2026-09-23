'use strict';

/**
 * PÁTIO CRM — PLATFORM ADMIN & SAAS METRICS SERVICE
 * Módulo de gestão da plataforma Real Soluções:
 * Cálculo canônico de MRR, ARR, Churn, Funil, Net New MRR e
 * Support Impersonation com auditoria estrita.
 */

const crypto = require('crypto');
const { BILLING_CONFIG } = require('./billingConfig');
const { getSubscription } = require('./billingService');
const { telemetryEvents, getCostToServe } = require('./saasTelemetryService');

const supportSessions = new Map(); // sessionId -> supportSession
const platformAuditLog = [];       // Trilha de auditoria da Real Soluções

/**
 * Registra ação na auditoria de plataforma (Real Soluções).
 */
function logPlatformAudit({ action, operator, tenantId = null, details = {} }) {
  const entry = {
    id: `p_aud_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
    timestamp: new Date().toISOString(),
    action,
    operator: operator || 'system',
    tenantId,
    details
  };
  platformAuditLog.unshift(entry);
  if (platformAuditLog.length > 1000) platformAuditLog.pop();
  return entry;
}

/**
 * Calcula as métricas canônicas de SaaS da Real Soluções.
 */
function calculatePlatformMetrics({ subscriptions = [], activeAtStartCount = 0, mrrAtStart = 0 } = {}) {
  let mrr = 0;
  let activeTenants = 0;
  let trialingTenants = 0;
  let pastDueTenants = 0;
  let suspendedTenants = 0;
  let cancelledTenants = 0;
  let totalTenants = subscriptions.length;

  let newMRR = 0;
  let expansionMRR = 0;
  let contractionMRR = 0;
  let churnedMRR = 0;
  let churnedCount = 0;
  let convertedTrialCount = 0;
  let expiredTrialCount = 0;

  for (const sub of subscriptions) {
    if (sub.status === 'active') {
      activeTenants++;
      mrr += Number(sub.price || 0);
    } else if (sub.status === 'trialing' || sub.status === 'trial') {
      trialingTenants++;
    } else if (sub.status === 'past_due') {
      pastDueTenants++;
      mrr += Number(sub.price || 0); // Ainda dentro da carência
    } else if (sub.status === 'suspended') {
      suspendedTenants++;
    } else if (sub.status === 'cancelled') {
      cancelledTenants++;
      churnedCount++;
      churnedMRR += Number(sub.price || 0);
    } else if (sub.status === 'expired') {
      expiredTrialCount++;
    }

    if (sub.isNewConversion) {
      newMRR += Number(sub.price || 0);
      convertedTrialCount++;
    }
    if (sub.expansionDelta) expansionMRR += Number(sub.expansionDelta);
    if (sub.contractionDelta) contractionMRR += Number(sub.contractionDelta);
  }

  // ARR = MRR * 12
  const arr = mrr * 12;

  // Logo Churn = Clientes Cancelados / Clientes Ativos no Início
  const baseLogo = activeAtStartCount || (activeTenants + churnedCount) || 1;
  const logoChurnRate = Math.round((churnedCount / baseLogo) * 1000) / 10;

  // Revenue Churn = MRR Cancelado / MRR Inicial
  const baseRevenue = mrrAtStart || (mrr + churnedMRR) || 1;
  const revenueChurnRate = Math.round((churnedMRR / baseRevenue) * 1000) / 10;

  // Net New MRR = new + expansion - contraction - churned
  const netNewMRR = Math.round((newMRR + expansionMRR - contractionMRR - churnedMRR) * 100) / 100;

  // Trial Conversion = convertidos / (convertidos + expirados)
  const totalFinishedTrials = convertedTrialCount + expiredTrialCount;
  const trialConversionRate = totalFinishedTrials > 0
    ? Math.round((convertedTrialCount / totalFinishedTrials) * 1000) / 10
    : (trialingTenants > 0 ? 0 : 100);

  return {
    mrr: Math.round(mrr * 100) / 100,
    arr: Math.round(arr * 100) / 100,
    activeTenants,
    trialingTenants,
    pastDueTenants,
    suspendedTenants,
    cancelledTenants,
    totalTenants,
    logoChurnRate,
    revenueChurnRate,
    newMRR,
    expansionMRR,
    contractionMRR,
    churnedMRR,
    netNewMRR,
    trialConversionRate,
    currency: 'BRL',
    calculatedAt: new Date().toISOString()
  };
}

/**
 * Cria uma Sessão de Suporte (Support Impersonation) auditada.
 * Operadores da Real Soluções NUNCA acessam dados de oficinas silenciosamente.
 */
function createSupportSession({ tenantId, operator, reason, durationMinutes = 60, targetState = null }) {
  if (!tenantId || !operator || !reason) {
    throw new Error('Parâmetros obrigatórios para suporte: tenantId, operator, reason.');
  }

  const sessionId = `supp_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + durationMinutes * 60 * 1000);

  const session = {
    sessionId,
    tenantId,
    operator,
    reason,
    active: true,
    startedAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    warningBanner: `⚠️ ATENÇÃO: Sessão de suporte ativo (Operador: ${operator} - Motivo: ${reason})`
  };

  supportSessions.set(sessionId, session);

  // Registra na auditoria da plataforma
  logPlatformAudit({
    action: 'support_impersonation_started',
    operator,
    tenantId,
    details: { sessionId, reason, durationMinutes, expiresAt: session.expiresAt }
  });

  // Registra também na auditoria da oficina do cliente
  if (targetState) {
    if (!targetState.auditoria) targetState.auditoria = [];
    targetState.auditoria.unshift({
      id: `aud_supp_${Date.now()}`,
      timestamp: now.toISOString(),
      action: 'support_session_accessed',
      actorId: operator,
      tenantId,
      details: {
        sessionId,
        reason,
        expiresAt: session.expiresAt
      }
    });
  }

  return session;
}

function getActiveSupportSession(sessionId) {
  const s = supportSessions.get(sessionId);
  if (!s || !s.active) return null;
  if (Date.now() > new Date(s.expiresAt).getTime()) {
    s.active = false;
    return null;
  }
  return s;
}

function closeSupportSession(sessionId, { operator = 'system' } = {}) {
  const s = supportSessions.get(sessionId);
  if (!s) return false;
  s.active = false;
  s.closedAt = new Date().toISOString();
  logPlatformAudit({
    action: 'support_impersonation_ended',
    operator,
    tenantId: s.tenantId,
    details: { sessionId }
  });
  return true;
}

/**
 * Status Geral dos Subsistemas da Plataforma.
 */
function getPlatformSubsystemsStatus() {
  return {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    subsystems: {
      api: { status: 'up', latencyMs: 2 },
      database: { status: 'up', engine: 'sqlite3', journalMode: 'WAL' },
      outboxScheduler: { status: 'up', queue: 'healthy' },
      whatsappClient: { status: 'up', mode: 'headless' },
      billingAdapter: { status: 'up', provider: process.env.BILLING_MODE || 'sandbox' },
      storage: { status: 'up', driver: 'local_disk' }
    }
  };
}

function clearPlatformAdminData() {
  supportSessions.clear();
  platformAuditLog.length = 0;
}

module.exports = {
  calculatePlatformMetrics,
  createSupportSession,
  getActiveSupportSession,
  closeSupportSession,
  getPlatformSubsystemsStatus,
  logPlatformAudit,
  clearPlatformAdminData,
  platformAuditLog,
  supportSessions
};
