'use strict';

/**
 * PÁTIO CRM — CONFIGURAÇÃO CENTRAL DE BILLING & PLANOS SAAS
 * Define catálogo oficial de planos, Founder Pricing inicial,
 * taxas de implantação, regras de dunning, matriz de features e custos unitários.
 */

const BILLING_CONFIG = {
  // Planos Comerciais Iniciais (Founder Pricing)
  plans: {
    essencial: {
      id: 'essencial',
      name: 'Essencial',
      description: 'Gestão completa e sem complexidade para a rotina diária da oficina de linha pesada.',
      monthlyPrice: 179.00,
      annualMonthlyPrice: 149.00, // Preparado para futuro ciclo anual
      currency: 'BRL',
      features: [
        'os',
        'clientes',
        'veiculos',
        'patio',
        'boxes',
        'orcamento',
        'aprovacao_digital',
        'financeiro_basico',
        'estoque_basico',
        'compras_basicas',
        'equipe',
        'apontamento',
        'whatsapp_operacional',
        'agendamentos',
        'relatorios_padrao',
        'dashboard_operacional',
        'crm_basico'
      ]
    },
    pro: {
      id: 'pro',
      name: 'Pro',
      description: 'Inteligência avançada, proteção de margem, frotas, manutenção preventiva e automação completa.',
      monthlyPrice: 299.00,
      annualMonthlyPrice: 249.00,
      currency: 'BRL',
      features: [
        'os',
        'clientes',
        'veiculos',
        'patio',
        'boxes',
        'orcamento',
        'aprovacao_digital',
        'financeiro_basico',
        'estoque_basico',
        'compras_basicas',
        'equipe',
        'apontamento',
        'whatsapp_operacional',
        'agendamentos',
        'relatorios_padrao',
        'dashboard_operacional',
        'crm_basico',
        // Diferenciais Pro
        'precificacao_assistida',
        'protecao_margem',
        'rentabilidade_avancada',
        'dashboard_executivo_avancado',
        'frotas_avancadas',
        'manutencao_preventiva_frota',
        'pos_venda_automatico',
        'inteligencia_operacional_proativa',
        'voz_inteligente',
        'relatorios_avancados',
        'insights',
        'identidade_visual_personalizada'
      ]
    }
  },

  // Taxa de Implantação Assistida
  setupFee: {
    enabled: true,
    amount: 390.00,
    description: 'Implantação assistida com parametrização de estoque, cadastro de equipe e treinamento da equipe.',
    exemptionsAllowed: true
  },

  // Período de Trial Gratuito
  trial: {
    durationDays: 14,
    planGranted: 'pro',
    noticeDays: [7, 3, 1, 0] // Avisos em D-7, D-3, D-1 e D0
  },

  // Política de Inadimplência e Régua de Cobrança (Dunning)
  dunning: {
    gracePeriodDays: 5,
    scheduleDays: [0, 2, 4, 5], // D0 (falha), D+2 (lembrete), D+4 (último aviso), D+5 (suspensão)
    suspensionPolicy: {
      blockWrites: true,
      blockAutomations: true,
      blockWhatsAppProactive: true,
      allowRead: true,
      allowExport: true,
      allowBilling: true,
      allowSupport: true
    }
  },

  // Custos Unitários de Servir (Unit Economics para margem bruta da Real Soluções)
  costToServeUnits: {
    whatsappMessageCost: 0.05,       // R$ 0,05 por mensagem enviada/recebida
    aiTokenCost: 0.00001,            // R$ 0,00001 por token (~R$ 10 / 1M tokens)
    storageByteCostMonthly: 0.0000001 // R$ 0,0000001 por byte (~R$ 0,10 / GB / mês)
  },

  // Produtos no Gateway
  products: {
    essencial: process.env.BILLING_PRODUCT_ESSENCIAL || 'prod_patio_essencial',
    pro: process.env.BILLING_PRODUCT_PRO || 'prod_patio_pro'
  },

  // Status Canônicos de Assinatura
  canonicalStatuses: [
    'trialing',
    'active',
    'past_due',
    'suspended',
    'cancelled',
    'expired'
  ]
};

// Catálogo em memória de cupons de desconto
const activeCoupons = new Map([
  ['FOUNDER2026', { code: 'FOUNDER2026', type: 'percentage', value: 20, active: true, maxUses: 100, usedCount: 0 }],
  ['FROTA50', { code: 'FROTA50', type: 'fixed', value: 50, active: true, maxUses: 50, usedCount: 0 }],
  ['ISENCAOSETUP', { code: 'ISENCAOSETUP', type: 'setup_free', value: 390, active: true, maxUses: 200, usedCount: 0 }]
]);

// Trava de Preços por Tenant (Founder Price Lock)
const tenantPriceLocks = new Map();

function getPlan(planId) {
  const p = BILLING_CONFIG.plans[planId];
  if (!p) throw new Error(`Plano "${planId}" não encontrado no catálogo.`);
  return { ...p };
}

function calculateSubscriptionPrice(planId, { tenantId = null, couponCode = null, isSetupFeeExempt = false, setupExemptionReason = null, setupAuthorizedBy = null } = {}) {
  const plan = getPlan(planId);
  let monthlyPrice = plan.monthlyPrice;

  // 1. Verifica se há trava de preço ativa para este tenant
  if (tenantId && tenantPriceLocks.has(tenantId)) {
    const lock = tenantPriceLocks.get(tenantId);
    if (lock.planId === planId && typeof lock.amount === 'number') {
      monthlyPrice = lock.amount;
    }
  }

  // 2. Aplicação de Cupom de Desconto
  let discountAmount = 0;
  let appliedCoupon = null;
  if (couponCode) {
    const cp = activeCoupons.get(couponCode.toUpperCase().trim());
    if (cp && cp.active && (!cp.expiresAt || new Date(cp.expiresAt) > new Date())) {
      if (cp.type === 'percentage') {
        discountAmount = Math.round((monthlyPrice * (cp.value / 100)) * 100) / 100;
      } else if (cp.type === 'fixed') {
        discountAmount = Math.min(monthlyPrice, cp.value);
      }
      appliedCoupon = { code: cp.code, type: cp.type, value: cp.value, discountAmount };
    }
  }

  const effectiveMonthlyPrice = Math.max(0, Math.round((monthlyPrice - discountAmount) * 100) / 100);

  // 3. Taxa de Implantação Assistida
  let effectiveSetupFee = BILLING_CONFIG.setupFee.enabled ? BILLING_CONFIG.setupFee.amount : 0;
  let setupExemptionAudit = null;

  if (couponCode && couponCode.toUpperCase().trim() === 'ISENCAOSETUP') {
    effectiveSetupFee = 0;
    setupExemptionAudit = { isento: true, reason: 'Cupom de Isenção Promocional ISENCAOSETUP', authorizedBy: 'campanha_marketing' };
  } else if (isSetupFeeExempt) {
    effectiveSetupFee = 0;
    setupExemptionAudit = {
      isento: true,
      reason: setupExemptionReason || 'Isenção comercial concedida pela diretoria',
      authorizedBy: setupAuthorizedBy || 'diretoria_comercial',
      timestamp: new Date().toISOString()
    };
  }

  const initialPaymentTotal = Math.round((effectiveMonthlyPrice + effectiveSetupFee) * 100) / 100;

  return {
    planId: plan.id,
    planName: plan.name,
    baseMonthlyPrice: plan.monthlyPrice,
    discountAmount,
    effectiveMonthlyPrice,
    appliedCoupon,
    setupFee: effectiveSetupFee,
    setupExemptionAudit,
    initialPaymentTotal,
    nextMonthlyPayment: effectiveMonthlyPrice,
    currency: plan.currency
  };
}

function lockTenantPrice(tenantId, planId, amount, reason = 'founder_plan') {
  if (!tenantId) throw new Error('tenantId é obrigatório para registrar trava de preço.');
  tenantPriceLocks.set(tenantId, {
    tenantId,
    planId,
    amount,
    reason,
    lockedAt: new Date().toISOString()
  });
}

function getTenantPriceLock(tenantId) {
  return tenantPriceLocks.get(tenantId) || null;
}

module.exports = {
  BILLING_CONFIG,
  activeCoupons,
  getPlan,
  calculateSubscriptionPrice,
  lockTenantPrice,
  getTenantPriceLock
};
