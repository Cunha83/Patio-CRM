'use strict';

const { BILLING_CONFIG, getPlan, calculateSubscriptionPrice } = require('./billingConfig');
const { getPaymentAdapter } = require('./paymentProviderAdapter');
const {
  billingSubscriptions,
  persistSubscription,
  getOrCreateBillingCustomer
} = require('./billingPersistence');
const { processWebhookEvent: rawProcessWebhook } = require('./billingWebhookProcessor');

async function initializeSubscription({ tenantId, plan = 'pro', status = 'trialing', startedAt = null, gracePeriodEndsAt = null }) {
  if (!tenantId) throw new Error('tenantId é obrigatório.');

  const now = startedAt ? new Date(startedAt) : new Date();
  const trialEnds = new Date(now.getTime() + BILLING_CONFIG.trial.durationDays * 24 * 60 * 60 * 1000);
  const planInfo = getPlan(plan === 'trial' ? 'pro' : plan);

  const sub = {
    id: `sub_${tenantId}`,
    tenantId,
    plan: plan === 'trial' ? 'pro' : plan,
    status,
    billingCycle: 'mensal',
    price: planInfo.monthlyPrice,
    setupFee: BILLING_CONFIG.setupFee.amount,
    setupFeePaid: false,
    setupFeeExempt: false,
    startedAt: now.toISOString(),
    trialStartedAt: now.toISOString(),
    trialEndsAt: trialEnds.toISOString(),
    currentPeriodStart: now.toISOString(),
    currentPeriodEnd: trialEnds.toISOString(),
    cancelAtPeriodEnd: false,
    cancellationReason: null,
    cancelledAt: null,
    gracePeriodEndsAt: gracePeriodEndsAt || null,
    provider: 'sandbox',
    providerSubscriptionId: `sub_sbx_${tenantId}`,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString()
  };

  await persistSubscription(sub);
  billingSubscriptions.set(tenantId, sub);
  return sub;
}

function getSubscription(tenantId) {
  let sub = billingSubscriptions.get(tenantId);
  if (!sub) {
    const now = new Date();
    const trialEnds = new Date(now.getTime() + BILLING_CONFIG.trial.durationDays * 24 * 60 * 60 * 1000);
    const planInfo = getPlan('pro');
    sub = {
      id: `sub_${tenantId}`,
      tenantId,
      plan: 'pro',
      status: 'trialing',
      billingCycle: 'mensal',
      price: planInfo.monthlyPrice,
      setupFee: BILLING_CONFIG.setupFee.amount,
      setupFeePaid: false,
      setupFeeExempt: false,
      startedAt: now.toISOString(),
      trialStartedAt: now.toISOString(),
      trialEndsAt: trialEnds.toISOString(),
      currentPeriodStart: now.toISOString(),
      currentPeriodEnd: trialEnds.toISOString(),
      cancelAtPeriodEnd: false,
      cancellationReason: null,
      cancelledAt: null,
      gracePeriodEndsAt: null,
      provider: 'sandbox',
      providerSubscriptionId: `sub_sbx_${tenantId}`,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString()
    };
    billingSubscriptions.set(tenantId, sub);
    persistSubscription(sub).catch(() => {});
  }

  if (sub.status === 'trialing' && sub.trialEndsAt) {
    const agora = Date.now();
    if (agora > new Date(sub.trialEndsAt).getTime()) {
      sub.status = 'expired';
      sub.updatedAt = new Date().toISOString();
    }
  }

  return { ...sub };
}

async function createCheckout({
  tenantId,
  plan = 'pro',
  paymentMethod = 'pix',
  couponCode = null,
  isSetupFeeExempt = false,
  setupExemptionReason = null,
  setupAuthorizedBy = null,
  customerData = {},
  adapter = null
}) {
  const currentSub = getSubscription(tenantId);
  const customer = await getOrCreateBillingCustomer({
    tenantId,
    legalName: customerData.legalName,
    document: customerData.document,
    email: customerData.email,
    phone: customerData.phone
  });

  const priceCalc = calculateSubscriptionPrice(plan, {
    tenantId,
    couponCode,
    isSetupFeeExempt,
    setupExemptionReason,
    setupAuthorizedBy
  });

  const billingAdapter = adapter || getPaymentAdapter();
  const checkoutResult = await billingAdapter.createCheckout({
    tenantId,
    plan,
    price: priceCalc.effectiveMonthlyPrice,
    setupFee: priceCalc.setupFee,
    paymentMethod,
    customer
  });

  return {
    ok: true,
    checkout: {
      ...checkoutResult,
      calculation: priceCalc
    }
  };
}

async function processWebhookEvent(opts) {
  return await rawProcessWebhook({ ...opts, getSubscription });
}

async function checkDunningStatus(tenantId) {
  const sub = getSubscription(tenantId);
  if (sub.status !== 'past_due') return { status: sub.status, actionTaken: 'none' };

  const agora = Date.now();
  const graceEnd = sub.gracePeriodEndsAt ? new Date(sub.gracePeriodEndsAt).getTime() : 0;

  if (agora > graceEnd) {
    const updatedSub = {
      ...sub,
      status: 'suspended',
      updatedAt: new Date().toISOString()
    };
    await persistSubscription(updatedSub);
    billingSubscriptions.set(tenantId, updatedSub);
    return { status: 'suspended', actionTaken: 'tenant_suspended' };
  }

  return { status: 'past_due', actionTaken: 'grace_period_active', expiresAt: sub.gracePeriodEndsAt };
}

async function reactivateSubscription(tenantId, { actor = 'system' } = {}) {
  const sub = getSubscription(tenantId);
  const updatedSub = {
    ...sub,
    status: 'active',
    gracePeriodEndsAt: null,
    updatedAt: new Date().toISOString()
  };
  await persistSubscription(updatedSub);
  billingSubscriptions.set(tenantId, updatedSub);
  return { ok: true, subscription: { ...updatedSub } };
}

async function changeSubscriptionPlan({ tenantId, newPlan, immediate = null, actor = 'administrador' }) {
  const planInfo = getPlan(newPlan);
  const sub = getSubscription(tenantId);
  const isUpgrade = (sub.plan === 'essencial' && newPlan === 'pro');
  const shouldApplyImmediate = immediate !== null ? immediate : isUpgrade;

  const now = new Date().toISOString();
  const updatedSub = { ...sub };

  if (shouldApplyImmediate) {
    updatedSub.plan = newPlan;
    updatedSub.price = planInfo.monthlyPrice;
    updatedSub.updatedAt = now;
  } else {
    updatedSub.pendingDowngrade = {
      targetPlan: newPlan,
      effectiveAt: sub.currentPeriodEnd
    };
    updatedSub.updatedAt = now;
  }

  await persistSubscription(updatedSub);
  billingSubscriptions.set(tenantId, updatedSub);

  return {
    ok: true,
    subscription: { ...updatedSub },
    mode: shouldApplyImmediate ? 'applied_immediately' : 'scheduled_at_period_end'
  };
}

async function cancelSubscription({ tenantId, reason = 'outro', immediate = false, actor = 'usuario' }) {
  const validReasons = ['preco', 'nao_usa', 'dificil', 'mudou_de_sistema', 'fechou_a_empresa', 'suporte', 'outro'];
  const sanitizedReason = validReasons.includes(reason) ? reason : 'outro';

  const sub = getSubscription(tenantId);
  const now = new Date().toISOString();
  const updatedSub = {
    ...sub,
    cancellationReason: sanitizedReason,
    requestedAt: now
  };

  if (immediate) {
    updatedSub.status = 'cancelled';
    updatedSub.cancelledAt = now;
  } else {
    updatedSub.cancelAtPeriodEnd = true;
  }
  updatedSub.updatedAt = now;

  await persistSubscription(updatedSub);
  billingSubscriptions.set(tenantId, updatedSub);

  return { ok: true, subscription: { ...updatedSub } };
}

async function reconcileSubscriptions({ adapter = null } = {}) {
  const billingAdapter = adapter || getPaymentAdapter();
  const results = { reconciledCount: 0, discrepanciesFixed: 0 };

  for (const [tenantId, sub] of billingSubscriptions.entries()) {
    if (sub.providerSubscriptionId) {
      try {
        const remote = await billingAdapter.getSubscription(sub.providerSubscriptionId);
        if (remote && remote.status && remote.status !== sub.status) {
          sub.status = remote.status;
          sub.updatedAt = new Date().toISOString();
          persistSubscription(sub);
          results.discrepanciesFixed++;
        }
        results.reconciledCount++;
      } catch (_) {}
    }
  }

  return results;
}

module.exports = {
  initializeSubscription,
  getSubscription,
  createCheckout,
  processWebhookEvent,
  checkDunningStatus,
  reactivateSubscription,
  changeSubscriptionPlan,
  cancelSubscription,
  reconcileSubscriptions
};
