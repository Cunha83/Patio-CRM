'use strict';

const crypto = require('crypto');
const { run, all } = require('../../db');

const billingCustomers = new Map();
const billingSubscriptions = new Map();
const billingEventsLedger = new Map();
const billingInvoices = new Map();

function hashPayload(payload) {
  const str = typeof payload === 'string' ? payload : JSON.stringify(payload || {});
  return crypto.createHash('sha256').update(str).digest('hex');
}

async function persistCustomer(customer) {
  if (!customer) return null;
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
  return await run(`INSERT OR REPLACE INTO billing_invoices (
    id, tenant_id, provider_invoice_id, amount, status, payment_method, paid_at, created_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [
    invoice.id, tenantId, invoice.providerInvoiceId || null, invoice.amount,
    invoice.status || 'paid', invoice.paymentMethod || 'pix', invoice.paidAt || new Date().toISOString(),
    invoice.createdAt || new Date().toISOString()
  ]);
}

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

function getBillingHistory(tenantId) {
  return billingInvoices.get(tenantId) || [];
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

async function loadBillingFromDB() {
  try {
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

    const subs = await all('SELECT * FROM billing_subscriptions');
    for (const s of (subs || [])) {
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
        id: e.provider_event_id,
        tenantId: e.tenant_id,
        provider: e.provider,
        providerEventId: e.provider_event_id,
        type: e.event_type,
        amount: e.amount,
        status: e.status,
        processedAt: e.processed_at,
        payloadHash: e.payload_hash
      });
    }

    const invoices = await all('SELECT * FROM billing_invoices ORDER BY created_at DESC');
    for (const inv of (invoices || [])) {
      if (!billingInvoices.has(inv.tenant_id)) billingInvoices.set(inv.tenant_id, []);
      billingInvoices.get(inv.tenant_id).push({
        id: inv.id,
        tenantId: inv.tenant_id,
        providerInvoiceId: inv.provider_invoice_id,
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

module.exports = {
  billingCustomers,
  billingSubscriptions,
  billingEventsLedger,
  billingInvoices,
  hashPayload,
  persistCustomer,
  persistSubscription,
  persistEvent,
  persistInvoice,
  getOrCreateBillingCustomer,
  getBillingCustomer,
  getBillingHistory,
  recordInvoice,
  loadBillingFromDB,
  clearBillingData
};
