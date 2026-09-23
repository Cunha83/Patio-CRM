'use strict';

/**
 * PÁTIO CRM — SERVIÇO DE GESTÃO DE ASSINATURAS & BILLING SAAS
 * Gerencia o ciclo de vida comercial da Real Soluções (SaaS),
 * clientes de faturamento, ledger imutável de eventos e idempotência de webhooks.
 *
 * NOTA ARQUITETURAL: Este módulo é estritamente desacoplado do financeiro interno
 * das oficinas (financialEngine.js). Nenhuma cobrança do SaaS polui as contas do tenant.
 */

const crypto = require('crypto');
const { run, get, all, transaction } = require('../../db');
const { BILLING_CONFIG, getPlan, calculateSubscriptionPrice, lockTenantPrice, getTenantPriceLock } = require('./billingConfig');
const { getPaymentAdapter } = require('./paymentProviderAdapter');

// Armazenamento em memória com suporte a persistência
const billingCustomers = new Map();     // tenantId -> billingCustomer
const billingSubscriptions = new Map(); // tenantId -> subscription
const billingEventsLedger = new Map();  // providerEventId -> billingEvent
const billingInvoices = new Map();      // tenantId -> Array<invoice>

function hashPayload(payload) {
  const str = typeof payload === 'string' ? payload : JSON.stringify(payload || {});
  return crypto.createHash('sha256').update(str).digest('hex');
}

async function persistCustomer(customer) {
  if (!customer) return null;
  const { run } = require('../../db');
  return await run(`INSERT OR REPLACE INTO billing_customers (
    tenant_id, provider, provider_customer_id, legal_name, document, email, phone, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
    customer.tenantId, customer.provider || 'sandbox', customer.providerCustomerId || null,
    customer.legalName || '', customer.document || '', customer.email || '', customer.phone || '',
    customer.createdAt, customer.updatedAt
  ]);
}

async function persistSubscription(sub) {
  if (!sub) return null;
  const { run } = require('../../db');
  return await run(`INSERT OR REPLACE INTO billing_subscriptions (
    tenant_id, plan, status, billing_cycle, price, setup_fee, setup_fee_paid, setup_fee_exempt,
    provider, provider_subscription_id, started_at, trial_ends_at, current_period_start, current_period_end,
    cancel_at_period_end, cancelled_at, cancellation_reason, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
    sub.tenantId, sub.plan, sub.status, sub.billingCycle || 'mensal', sub.price, sub.setupFee || 0,
    sub.setupFeePaid ? 1 : 0, sub.setupFeeExempt ? 1 : 0, sub.provider || 'sandbox', sub.providerSubscriptionId || null,
    sub.startedAt, sub.trialEndsAt || null, sub.currentPeriodStart || null, sub.currentPeriodEnd || null,
    sub.cancelAtPeriodEnd ? 1 : 0, sub.cancelledAt || null, sub.cancellationReason || null,
    sub.createdAt, sub.updatedAt
  ]);
}

async function persistEvent(event) {
  if (!event) return null;
  const { run } = require('../../db');
  return await run(`INSERT OR REPLACE INTO billing_events (
    provider_event_id, provider, event_type, tenant_id, amount, status, payload_hash, raw_payload, processed_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
    event.providerEventId, event.provider || 'sandbox', event.type, event.tenantId,
    event.amount || 0, event.status || 'RECEIVED', event.payloadHash,
    JSON.stringify(event.rawPayload || {}), event.processedAt
  ]);
}

async function persistInvoice(tenantId, invoice) {
  if (!invoice) return null;
  const { run } = require('../../db');
  return await run(`INSERT OR REPLACE INTO billing_invoices (
    id, tenant_id, provider_invoice_id, amount, status, payment_method, paid_at, created_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [
    invoice.id, tenantId, invoice.providerInvoiceId || null, invoice.amount,
    invoice.status || 'paid', invoice.paymentMethod || 'pix', invoice.paidAt || new Date().toISOString(),
    invoice.createdAt || new Date().toISOString()
  ]);
}

/**
 * Registra ou atualiza o cliente de billing da oficina.
 */
async function getOrCreateBillingCustomer({ tenantId, legalName, document, email, phone, provider = 'sandbox' }) {
  if (!tenantId) throw new Error('tenantId é obrigatório para registrar billing customer.');

  if (billingCustomers.has(tenantId)) {
    const existing = billingCustomers.get(tenantId);
    const updated = {
      ...existing,
      legalName: legalName !== undefined ? legalName : existing.legalName,
      document: document !== undefined ? document : existing.document,
      email: email !== undefined ? email : existing.email,
      phone: phone !== undefined ? phone : existing.phone,
      updatedAt: new Date().toISOString()
    };
    await persistCustomer(updated);
    billingCustomers.set(tenantId, updated);
    return updated;
  }

  const now = new Date().toISOString();
  const customer = {
    id: `bc_${tenantId}`,
    tenantId,
    provider,
    providerCustomerId: `cus_${provider}_${tenantId}`,
    legalName: legalName || 'Oficina Mecânica',
    document: document || '',
    email: email || '',
    phone: phone || '',
    createdAt: now,
    updatedAt: now
  };

  await persistCustomer(customer);
  billingCustomers.set(tenantId, customer);
  return customer;
}

function getBillingCustomer(tenantId) {
  return billingCustomers.get(tenantId) || null;
}

/**
 * Cria ou inicializa uma nova assinatura SaaS para um tenant.
 * Por padrão, inicia em Trial Pro de 14 dias.
 */
async function initializeSubscription({ tenantId, plan = 'pro', status = 'trialing', startedAt = null, gracePeriodEndsAt = null }) {
  if (!tenantId) throw new Error('tenantId é obrigatório.');

  const now = startedAt ? new Date(startedAt) : new Date();
  const trialEnds = new Date(now.getTime() + BILLING_CONFIG.trial.durationDays * 24 * 60 * 60 * 1000);
  const planInfo = getPlan(plan === 'trial' ? 'pro' : plan);

  const sub = {
    id: `sub_${tenantId}`,
    tenantId,
    plan: plan === 'trial' ? 'pro' : plan,
    status, // 'trialing' | 'active' | 'past_due' | 'suspended' | 'cancelled' | 'expired'
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

  // Avaliação automática de expiração de trial
  if (sub.status === 'trialing' && sub.trialEndsAt) {
    const agora = Date.now();
    if (agora > new Date(sub.trialEndsAt).getTime()) {
      sub.status = 'expired';
      sub.updatedAt = new Date().toISOString();
    }
  }

  return { ...sub };
}

/**
 * Cria checkout de conversão ou contratação de plano.
 */
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

/**
 * Processamento de Webhooks com IDEMPOTÊNCIA ESTRITA e TRANSAÇÃO ATÔMICA.
 */
async function processWebhookEvent({ provider, rawBody, body, headers = {}, adapter = null }) {
  const billingAdapter = adapter || getPaymentAdapter(provider);
  const verification = await billingAdapter.handleWebhook({ headers, rawBody, body });

  if (!verification || !verification.ok) {
    return {
      ok: false,
      status: verification?.status || 401,
      error: verification?.error || 'Webhook inválido ou assinatura rejeitada.'
    };
  }

  const { providerEventId, type, tenantId, amount, status, rawPayload } = verification;
  const { run, get } = require('../../db');

  // 1. CHECAGEM DE IDEMPOTÊNCIA DURÁVEL (Memória e Banco de Dados)
  if (billingEventsLedger.has(providerEventId)) {
    const previous = billingEventsLedger.get(providerEventId);
    return {
      ok: true,
      duplicate: true,
      providerEventId,
      message: 'Evento duplicado já processado com sucesso pelo Billing Ledger.',
      processedAt: previous.processedAt
    };
  }

  const existingDbEvent = await get('SELECT * FROM billing_events WHERE provider_event_id = ?', [providerEventId]);
  if (existingDbEvent) {
    billingEventsLedger.set(providerEventId, {
      id: existingDbEvent.provider_event_id,
      tenantId: existingDbEvent.tenant_id,
      provider: existingDbEvent.provider,
      providerEventId: existingDbEvent.provider_event_id,
      type: existingDbEvent.event_type,
      amount: existingDbEvent.amount,
      status: existingDbEvent.status,
      processedAt: existingDbEvent.processed_at,
      payloadHash: existingDbEvent.payload_hash
    });
    return {
      ok: true,
      duplicate: true,
      providerEventId,
      message: 'Evento duplicado já registrado no SQLite.',
      processedAt: existingDbEvent.processed_at
    };
  }

  // 2. Preparação do evento e entidades
  const eventId = `blevt_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  const now = new Date().toISOString();
  const payloadHash = hashPayload(rawBody || body);

  const ledgerEntry = {
    id: eventId,
    tenantId,
    provider: provider || 'sandbox',
    providerEventId,
    type,
    amount: Number(amount) || 0,
    currency: 'BRL',
    status,
    occurredAt: rawPayload?.occurredAt || now,
    processedAt: now,
    payloadHash
  };

  let updatedSub = null;
  let newInvoice = null;

  if (tenantId) {
    const currentSub = getSubscription(tenantId);
    updatedSub = { ...currentSub };

    // PAGAMENTO CONFIRMADO
    if (['PAYMENT_RECEIVED', 'payment_succeeded', 'CONFIRMED', 'RECEIVED'].includes(type) ||
        (type === 'PAYMENT_UPDATED' && status === 'CONFIRMED')) {
      updatedSub.status = 'active';
      updatedSub.setupFeePaid = true;
      updatedSub.gracePeriodEndsAt = null;

      const pStart = new Date();
      const pEnd = new Date(pStart.getTime() + 30 * 24 * 60 * 60 * 1000);
      updatedSub.currentPeriodStart = pStart.toISOString();
      updatedSub.currentPeriodEnd = pEnd.toISOString();
      updatedSub.updatedAt = now;

      newInvoice = {
        id: `inv_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
        tenantId,
        amount: Number(amount) || updatedSub.price,
        status: 'paid',
        paymentMethod: 'pix',
        paidAt: now,
        periodEnd: updatedSub.currentPeriodEnd,
        receiptUrl: `/api/billing/receipts/inv_${Date.now()}.pdf`,
        createdAt: now
      };
    }
    // FALHA DE PAGAMENTO / ATRASO (Dunning)
    else if (['PAYMENT_OVERDUE', 'payment_failed', 'OVERDUE'].includes(type)) {
      if (updatedSub.status !== 'suspended') {
        updatedSub.status = 'past_due';
        const graceEnd = new Date(Date.now() + BILLING_CONFIG.dunning.gracePeriodDays * 24 * 60 * 60 * 1000);
        updatedSub.gracePeriodEndsAt = graceEnd.toISOString();
        updatedSub.updatedAt = now;
      }
    }
    // CANCELAMENTO DE ASSINATURA
    else if (['SUBSCRIPTION_CANCELLED', 'subscription_cancelled', 'CANCELLED'].includes(type)) {
      updatedSub.status = 'cancelled';
      updatedSub.cancelledAt = now;
      updatedSub.updatedAt = now;
    }
  }

  // 3. TRANSAÇÃO ATÔMICA NO BANCO: evento, fatura e assinatura gravados em bloco
  try {
    await transaction(async () => {
      await run(`INSERT INTO billing_events (
        provider_event_id, provider, event_type, tenant_id, amount, status, payload_hash, raw_payload, processed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
        ledgerEntry.providerEventId, ledgerEntry.provider, ledgerEntry.type, ledgerEntry.tenantId,
        ledgerEntry.amount, ledgerEntry.status, ledgerEntry.payloadHash,
        JSON.stringify(rawPayload || {}), ledgerEntry.processedAt
      ]);

      if (newInvoice) {
        await run(`INSERT INTO billing_invoices (
          id, tenant_id, provider_invoice_id, amount, status, payment_method, paid_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [
          newInvoice.id, tenantId, newInvoice.providerInvoiceId || null, newInvoice.amount,
          newInvoice.status, newInvoice.paymentMethod, newInvoice.paidAt, newInvoice.createdAt
        ]);
      }

      if (updatedSub) {
        await run(`INSERT OR REPLACE INTO billing_subscriptions (
          tenant_id, plan, status, billing_cycle, price, setup_fee, setup_fee_paid, setup_fee_exempt,
          provider, provider_subscription_id, started_at, trial_ends_at, current_period_start, current_period_end,
          cancel_at_period_end, cancelled_at, cancellation_reason, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
          updatedSub.tenantId, updatedSub.plan, updatedSub.status, updatedSub.billingCycle || 'mensal',
          updatedSub.price, updatedSub.setupFee || 0,
          updatedSub.setupFeePaid ? 1 : 0, updatedSub.setupFeeExempt ? 1 : 0,
          updatedSub.provider || 'sandbox', updatedSub.providerSubscriptionId || null,
          updatedSub.startedAt, updatedSub.trialEndsAt || null, updatedSub.currentPeriodStart || null, updatedSub.currentPeriodEnd || null,
          updatedSub.cancelAtPeriodEnd ? 1 : 0, updatedSub.cancelledAt || null, updatedSub.cancellationReason || null,
          updatedSub.createdAt, updatedSub.updatedAt
        ]);
      }
    });
  } catch (err) {
    if (err.message && err.message.includes('UNIQUE constraint failed')) {
      return {
        ok: true,
        processed: true,
        duplicate: true,
        providerEventId,
        message: 'Evento duplicado concorrente descartado por restrição transacional.'
      };
    }
    throw err;
  }

  // 4. ATUALIZA MEMÓRIA SOMENTE APÓS COMMIT COM SUCESSO
  billingEventsLedger.set(providerEventId, ledgerEntry);
  if (newInvoice) {
    if (!billingInvoices.has(tenantId)) billingInvoices.set(tenantId, []);
    billingInvoices.get(tenantId).unshift(newInvoice);
  }
  if (updatedSub) {
    billingSubscriptions.set(tenantId, updatedSub);
  }

  return {
    ok: true,
    processed: true,
    duplicate: false,
    eventId,
    providerEventId,
    type,
    tenantId,
    amount,
    subscriptionStatus: updatedSub?.status || null
  };
}

/**
 * Avaliação e execução da régua de dunning.
 */
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

/**
 * Reativação de assinatura suspensa ou past_due
 */
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

/**
 * Alteração de plano (Upgrade imediato / Downgrade ao fim do ciclo).
 */
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

/**
 * Cancelamento de assinatura (com motivo auditado).
 */
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

/**
 * Reconciliação periódica de assinaturas com o gateway.
 */
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

function getBillingHistory(tenantId) {
  return billingInvoices.get(tenantId) || [];
}

async function loadBillingFromDB() {
  try {
    const { all } = require('../../db');
    const customers = await all('SELECT * FROM billing_customers');
    for (const c of (customers || [])) {
      billingCustomers.set(c.tenant_id, {
        id: `bc_${c.tenant_id}`,
        tenantId: c.tenant_id,
        provider: c.provider,
        providerCustomerId: c.provider_customer_id,
        legalName: c.legal_name,
        document: c.document,
        email: c.email,
        phone: c.phone,
        createdAt: c.created_at,
        updatedAt: c.updated_at
      });
    }

    const subscriptions = await all('SELECT * FROM billing_subscriptions');
    for (const s of (subscriptions || [])) {
      billingSubscriptions.set(s.tenant_id, {
        id: `sub_${s.tenant_id}`,
        tenantId: s.tenant_id,
        plan: s.plan,
        status: s.status,
        billingCycle: s.billing_cycle,
        price: s.price,
        setupFee: s.setup_fee,
        setupFeePaid: !!s.setup_fee_paid,
        setupFeeExempt: !!s.setup_fee_exempt,
        provider: s.provider,
        providerSubscriptionId: s.provider_subscription_id,
        startedAt: s.started_at,
        trialEndsAt: s.trial_ends_at,
        currentPeriodStart: s.current_period_start,
        currentPeriodEnd: s.current_period_end,
        cancelAtPeriodEnd: !!s.cancel_at_period_end,
        cancelledAt: s.cancelled_at,
        cancellationReason: s.cancellation_reason,
        createdAt: s.created_at,
        updatedAt: s.updated_at
      });
    }

    const events = await all('SELECT * FROM billing_events');
    for (const e of (events || [])) {
      billingEventsLedger.set(e.provider_event_id, {
        id: `blevt_${e.provider_event_id}`,
        providerEventId: e.provider_event_id,
        provider: e.provider,
        type: e.event_type,
        tenantId: e.tenant_id,
        amount: e.amount,
        status: e.status,
        payloadHash: e.payload_hash,
        processedAt: e.processed_at
      });
    }

    const invoices = await all('SELECT * FROM billing_invoices ORDER BY created_at DESC');
    for (const inv of (invoices || [])) {
      if (!billingInvoices.has(inv.tenant_id)) billingInvoices.set(inv.tenant_id, []);
      billingInvoices.get(inv.tenant_id).push({
        id: inv.id,
        amount: inv.amount,
        status: inv.status,
        paymentMethod: inv.payment_method,
        paidAt: inv.paid_at,
        receiptUrl: `/api/billing/receipts/${inv.id}.pdf`
      });
    }
  } catch (err) {
    console.warn('[Billing] Aviso ao carregar dados do SQLite:', err.message);
  }
}

function clearBillingData() {
  billingCustomers.clear();
  billingSubscriptions.clear();
  billingEventsLedger.clear();
  billingInvoices.clear();
}

async function recordInvoice(invoice) {
  if (!invoice) return null;
  const tid = invoice.tenantId || 'default';
  const id = invoice.id || `inv_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
  const now = invoice.createdAt || new Date().toISOString();

  await run(`INSERT OR REPLACE INTO billing_invoices (
    id, tenant_id, provider_invoice_id, amount, status, payment_method, paid_at, created_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [
    id,
    tid,
    invoice.providerInvoiceId || null,
    Number(invoice.amount) || 0,
    invoice.status || 'pending',
    invoice.paymentMethod || null,
    invoice.paidAt || null,
    now
  ]);

  if (!billingInvoices.has(tid)) billingInvoices.set(tid, []);
  const recorded = {
    id,
    tenantId: tid,
    providerInvoiceId: invoice.providerInvoiceId || null,
    amount: Number(invoice.amount) || 0,
    status: invoice.status || 'pending',
    paymentMethod: invoice.paymentMethod || null,
    paidAt: invoice.paidAt || null,
    receiptUrl: `/api/billing/receipts/${id}.pdf`,
    createdAt: now
  };
  billingInvoices.get(tid).unshift(recorded);
  return recorded;
}

module.exports = {
  getOrCreateBillingCustomer,
  getBillingCustomer,
  initializeSubscription,
  getSubscription,
  createCheckout,
  processWebhookEvent,
  checkDunningStatus,
  reactivateSubscription,
  changeSubscriptionPlan,
  cancelSubscription,
  reconcileSubscriptions,
  getBillingHistory,
  clearBillingData,
  loadBillingFromDB,
  recordInvoice,
  billingEventsLedger,
  persistCustomer,
  persistSubscription
};
