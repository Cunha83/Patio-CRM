'use strict';

/**
 * PÁTIO CRM — TELEMETRIA SAAS & UNIT ECONOMICS
 * Monitoramento de funil, TTFV (Time to First Value), ativação,
 * canais de aquisição (UTM/CAC) e Custo de Servir (Cost-to-Serve) por Tenant.
 *
 * GARANTIA DE PRIVACIDADE: Nunca registra PII (nomes de motoristas, placas de caminhões,
 * fotos de notas fiscais ou textos de mensagens do WhatsApp).
 */

const { BILLING_CONFIG } = require('./billingConfig');

const telemetryEvents = []; // Array de eventos de telemetria sem PII
const tenantMilestones = new Map(); // tenantId -> { createdAt, firstOSAt, firstQuotationAt, firstApprovalAt, ... }
const tenantAttributions = new Map(); // tenantId -> { utmSource, utmMedium, utmCampaign, referralCode, ... }
const acquisitionSpends = []; // { date, channel, campaign, amount }
const tenantUsage = new Map(); // tenantId -> { whatsappCount, aiInputTokens, aiOutputTokens, storageBytes }

/**
 * Registra um evento de telemetria SaaS sem PII.
 */
function recordTelemetryEvent(type, { tenantId = null, metadata = {} } = {}) {
  // Higienização estrita: bloqueia campos suspeitos de conter PII
  const sanitizedMeta = {};
  const blockedKeys = new Set(['nome', 'motorista', 'placa', 'texto', 'mensagem', 'cpf', 'telefone', 'foto', 'imagem']);

  for (const [k, v] of Object.entries(metadata)) {
    if (!blockedKeys.has(k.toLowerCase())) {
      sanitizedMeta[k] = v;
    }
  }

  const evt = {
    id: `tel_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    type,
    tenantId,
    timestamp: new Date().toISOString(),
    metadata: sanitizedMeta
  };

  telemetryEvents.unshift(evt);
  if (telemetryEvents.length > 2000) telemetryEvents.pop();

  return evt;
}

/**
 * Registra a criação de um tenant e vincula a atribuição de marketing (UTM).
 */
function recordTenantSignup(tenantId, { utmSource = null, utmMedium = null, utmCampaign = null, utmContent = null, referralCode = null } = {}) {
  const now = new Date().toISOString();
  tenantMilestones.set(tenantId, {
    tenantId,
    createdAt: now,
    firstOSAt: null,
    firstQuotationAt: null,
    firstApprovalAt: null,
    onboardingCompletedAt: null,
    activatedAt: null
  });

  tenantAttributions.set(tenantId, {
    tenantId,
    utmSource: utmSource || 'organic',
    utmMedium: utmMedium || 'direct',
    utmCampaign: utmCampaign || 'none',
    utmContent: utmContent || 'none',
    referralCode: referralCode || null,
    capturedAt: now
  });

  recordTelemetryEvent('signup_completed', { tenantId, metadata: { utmSource, referralCode } });
  recordTelemetryEvent('trial_started', { tenantId });
}

/**
 * Registra marcos operacionais para cálculo de TTFV e Ativação.
 */
function recordMilestone(tenantId, milestoneName) {
  if (!tenantId) return;
  const m = tenantMilestones.get(tenantId) || { tenantId, createdAt: new Date().toISOString() };
  const now = new Date().toISOString();

  if (milestoneName === 'first_os' && !m.firstOSAt) {
    m.firstOSAt = now;
    recordTelemetryEvent('first_os_created', { tenantId });
  } else if (milestoneName === 'first_quotation' && !m.firstQuotationAt) {
    m.firstQuotationAt = now;
    recordTelemetryEvent('first_quote_sent', { tenantId });
  } else if (milestoneName === 'first_approval' && !m.firstApprovalAt) {
    m.firstApprovalAt = now;
    recordTelemetryEvent('first_quote_approved', { tenantId });
  } else if (milestoneName === 'onboarding_completed' && !m.onboardingCompletedAt) {
    m.onboardingCompletedAt = now;
    recordTelemetryEvent('onboarding_completed', { tenantId });
  }

  // Avaliação do Critério Oficial de Ativação:
  // Tenant ativado = Onboarding concluído (ou empresa configurada) + Primeira OS criada.
  if (m.firstOSAt && !m.activatedAt) {
    m.activatedAt = now;
    recordTelemetryEvent('tenant_activated', { tenantId });
  }

  tenantMilestones.set(tenantId, m);
}

/**
 * Calcula o Time To First Value (TTFV) para o tenant ou média geral.
 */
function getTTFV(tenantId = null) {
  if (tenantId) {
    const m = tenantMilestones.get(tenantId);
    if (!m) return null;
    const t0 = new Date(m.createdAt).getTime();
    return {
      tenantId,
      timeToFirstOSHouses: m.firstOSAt ? Math.round(((new Date(m.firstOSAt).getTime() - t0) / 3600000) * 100) / 100 : null,
      timeToFirstQuotationHours: m.firstQuotationAt ? Math.round(((new Date(m.firstQuotationAt).getTime() - t0) / 3600000) * 100) / 100 : null,
      timeToFirstApprovalHours: m.firstApprovalAt ? Math.round(((new Date(m.firstApprovalAt).getTime() - t0) / 3600000) * 100) / 100 : null,
      isActivated: Boolean(m.activatedAt)
    };
  }

  // Agregação global
  let countOS = 0, totalHoursOS = 0;
  let countQuote = 0, totalHoursQuote = 0;

  for (const m of tenantMilestones.values()) {
    const t0 = new Date(m.createdAt).getTime();
    if (m.firstOSAt) {
      countOS++;
      totalHoursOS += (new Date(m.firstOSAt).getTime() - t0) / 3600000;
    }
    if (m.firstQuotationAt) {
      countQuote++;
      totalHoursQuote += (new Date(m.firstQuotationAt).getTime() - t0) / 3600000;
    }
  }

  return {
    avgTimeToFirstOSHours: countOS > 0 ? Math.round((totalHoursOS / countOS) * 100) / 100 : 0,
    avgTimeToFirstQuotationHours: countQuote > 0 ? Math.round((totalHoursQuote / countQuote) * 100) / 100 : 0,
    totalTenantsEvaluated: tenantMilestones.size
  };
}

/**
 * Registro de gastos de aquisição para cálculo de CAC.
 */
function recordAcquisitionSpend({ date, channel, campaign = 'geral', amount }) {
  acquisitionSpends.push({
    date: date || new Date().toISOString().slice(0, 10),
    channel: channel || 'outro',
    campaign,
    amount: Number(amount) || 0
  });
}

function calculateCAC(channel = null) {
  const totalSpend = acquisitionSpends
    .filter(s => !channel || s.channel === channel)
    .reduce((acc, s) => acc + s.amount, 0);

  let newPayingCustomers = 0;
  for (const attr of tenantAttributions.values()) {
    if (!channel || attr.utmSource === channel) {
      newPayingCustomers++;
    }
  }

  return {
    channel: channel || 'all',
    totalSpend,
    customersAcquired: newPayingCustomers,
    cac: newPayingCustomers > 0 ? Math.round((totalSpend / newPayingCustomers) * 100) / 100 : totalSpend
  };
}

/**
 * Registro de Consumo e Custo de Servir (Cost to Serve)
 */
function recordWhatsAppUsage(tenantId, { count = 1, inbound = 0, outbound = 1 } = {}) {
  const usage = tenantUsage.get(tenantId) || { whatsappCount: 0, aiInputTokens: 0, aiOutputTokens: 0, storageBytes: 0 };
  usage.whatsappCount += Number(count || 1);
  tenantUsage.set(tenantId, usage);
}

function recordAiUsage(tenantId, { feature = 'voz', inputTokens = 0, outputTokens = 0 } = {}) {
  const usage = tenantUsage.get(tenantId) || { whatsappCount: 0, aiInputTokens: 0, aiOutputTokens: 0, storageBytes: 0 };
  usage.aiInputTokens += Number(inputTokens || 0);
  usage.aiOutputTokens += Number(outputTokens || 0);
  tenantUsage.set(tenantId, usage);
}

function recordStorageUsage(tenantId, { bytes = 0 } = {}) {
  const usage = tenantUsage.get(tenantId) || { whatsappCount: 0, aiInputTokens: 0, aiOutputTokens: 0, storageBytes: 0 };
  usage.storageBytes += Number(bytes || 0);
  tenantUsage.set(tenantId, usage);
}

/**
 * Calcula o custo unitário de servir o tenant e avalia a margem bruta.
 */
function getCostToServe(tenantId, monthlyRevenue = 299.00) {
  const usage = tenantUsage.get(tenantId) || { whatsappCount: 0, aiInputTokens: 0, aiOutputTokens: 0, storageBytes: 0 };
  const units = BILLING_CONFIG.costToServeUnits;

  const whatsappCost = usage.whatsappCount * units.whatsappMessageCost;
  const aiCost = (usage.aiInputTokens + usage.aiOutputTokens) * units.aiTokenCost;
  const storageCost = usage.storageBytes * units.storageByteCostMonthly;
  const totalVariableCost = Math.round((whatsappCost + aiCost + storageCost) * 100) / 100;

  const grossProfit = Math.round((monthlyRevenue - totalVariableCost) * 100) / 100;
  const grossMarginPercent = monthlyRevenue > 0 ? Math.round((grossProfit / monthlyRevenue) * 1000) / 10 : 0;
  const isAlertThresholdExceeded = totalVariableCost > monthlyRevenue * 0.5; // Alerta se custo de servir passar de 50% da receita

  return {
    tenantId,
    usage,
    costs: {
      whatsappCost: Math.round(whatsappCost * 100) / 100,
      aiCost: Math.round(aiCost * 100) / 100,
      storageCost: Math.round(storageCost * 100) / 100,
      totalVariableCost
    },
    monthlyRevenue,
    grossProfit,
    grossMarginPercent,
    isAlertThresholdExceeded
  };
}

function clearTelemetryData() {
  telemetryEvents.length = 0;
  tenantMilestones.clear();
  tenantAttributions.clear();
  acquisitionSpends.length = 0;
  tenantUsage.clear();
}

module.exports = {
  recordTelemetryEvent,
  recordTenantSignup,
  recordMilestone,
  getTTFV,
  recordAcquisitionSpend,
  calculateCAC,
  recordWhatsAppUsage,
  recordAiUsage,
  recordStorageUsage,
  getCostToServe,
  clearTelemetryData,
  telemetryEvents,
  tenantAttributions
};
