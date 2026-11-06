'use strict';

const crypto = require('crypto');
const { run, get, transaction } = require('../../db');
const { BILLING_CONFIG } = require('./billingConfig');
const { getPaymentAdapter } = require('./paymentProviderAdapter');
const {
  billingEventsLedger,
  billingInvoices,
  billingSubscriptions,
  hashPayload
} = require('./billingPersistence');

async function processWebhookEvent({ provider, rawBody, body, headers = {}, adapter = null, getSubscription }) {
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
    } else if (['PAYMENT_OVERDUE', 'payment_failed', 'OVERDUE'].includes(type)) {
      if (updatedSub.status !== 'suspended') {
        updatedSub.status = 'past_due';
        const graceEnd = new Date(Date.now() + BILLING_CONFIG.dunning.gracePeriodDays * 24 * 60 * 60 * 1000);
        updatedSub.gracePeriodEndsAt = graceEnd.toISOString();
        updatedSub.updatedAt = now;
      }
    } else if (['SUBSCRIPTION_CANCELLED', 'subscription_cancelled', 'CANCELLED'].includes(type)) {
      updatedSub.status = 'cancelled';
      updatedSub.cancelledAt = now;
      updatedSub.updatedAt = now;
    }
  }

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

module.exports = {
  processWebhookEvent
};
