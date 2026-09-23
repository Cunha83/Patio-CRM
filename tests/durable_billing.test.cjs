'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'patio-billing-test-'));
const tempDbPath = path.join(tempDir, 'test.db');
process.env.DB_PATH = tempDbPath;

const { initDB, run, get, all, closeDB } = require('../db');
const billingService = require('../services/billing/billingService');
const { AsaasProviderAdapter, SandboxProviderAdapter } = require('../services/billing/paymentProviderAdapter');

test('Cobrança SaaS Durável (SQLite + Asaas v3)', async (t) => {
  await initDB();

  t.after(async () => {
    await closeDB().catch(() => {});
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (_) {}
  });

  await t.test('1. Persistência durável de Cliente de Faturamento no SQLite', async () => {
    const tenantId = `tenant_bill_${Date.now()}`;
    const customer = await billingService.getOrCreateBillingCustomer({
      tenantId,
      legalName: 'Oficina Molas & Suspensão LTDA',
      document: '12.345.678/0001-90',
      email: 'financeiro@molas.com.br',
      phone: '11988887777'
    });

    assert.ok(customer);
    assert.equal(customer.tenantId, tenantId);

    const row = await get('SELECT * FROM billing_customers WHERE tenant_id = ?', [tenantId]);
    assert.ok(row, 'Cliente deve ser persistido na tabela billing_customers');
    assert.equal(row.legal_name, 'Oficina Molas & Suspensão LTDA');
    assert.equal(row.email, 'financeiro@molas.com.br');
  });

  await t.test('2. Persistência durável de Assinatura no SQLite', async () => {
    const tenantId = `tenant_sub_${Date.now()}`;
    const sub = await billingService.initializeSubscription({
      tenantId,
      plan: 'pro',
      status: 'active',
      startedAt: new Date().toISOString()
    });

    assert.ok(sub);
    assert.equal(sub.plan, 'pro');
    assert.equal(sub.status, 'active');

    const row = await get('SELECT * FROM billing_subscriptions WHERE tenant_id = ?', [tenantId]);
    assert.ok(row, 'Assinatura deve ser persistida na tabela billing_subscriptions');
    assert.equal(row.plan, 'pro');
    assert.equal(row.status, 'active');
  });

  await t.test('3. Idempotência estrita no processamento de eventos de webhook', async () => {
    const tenantId = `tenant_idemp_${Date.now()}`;
    await billingService.initializeSubscription({
      tenantId,
      plan: 'pro',
      status: 'past_due'
    });

    const adapter = new SandboxProviderAdapter();
    const eventId = `evt_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const eventPayload = {
      id: eventId,
      event: 'PAYMENT_RECEIVED',
      tenantId,
      amount: 299,
      payment: {
        id: `pay_${Date.now()}`,
        customer: `cus_${Date.now()}`,
        value: 299,
        netValue: 297.01,
        billingType: 'PIX',
        status: 'RECEIVED',
        externalReference: tenantId
      }
    };
    const signature = adapter.signWebhookPayload(eventPayload);

    // 1º processamento
    const r1 = await billingService.processWebhookEvent({
      provider: 'sandbox',
      body: eventPayload,
      headers: { 'x-sandbox-signature': signature },
      adapter
    });

    assert.equal(r1.ok, true);
    assert.equal(r1.processed, true);
    assert.equal(r1.duplicate, false);

    // 2º processamento com o mesmo eventId (Webhook reenviado pelo Asaas)
    const r2 = await billingService.processWebhookEvent({
      provider: 'sandbox',
      body: eventPayload,
      headers: { 'x-sandbox-signature': signature },
      adapter
    });

    assert.equal(r2.ok, true);
    assert.equal(r2.duplicate, true);

    // Verifica que o evento foi registrado uma única vez no banco SQLite
    const countRow = await get('SELECT COUNT(*) as total FROM billing_events WHERE provider_event_id = ?', [eventId]);
    assert.equal(countRow.total, 1, 'Deve haver apenas 1 registro do evento no SQLite');
  });

  await t.test('4. AsaasProviderAdapter: Sandbox sinalizado e bloqueio em produção', async () => {
    // Modo Sandbox/Simulado em desenvolvimento
    const devAdapter = new AsaasProviderAdapter({ apiKey: null, isSandbox: true });
    assert.equal(devAdapter.isSandbox, true);

    const pixRes = await devAdapter.createPixQrCode({ invoiceId: 'inv_test_1', amount: 299 });
    assert.equal(pixRes.ok, true);
    assert.equal(pixRes.isSimulated, true, 'Transação de sandbox deve ser expressamente marcada como simulada');

    // Em produção sem API key: deve falhar rigorosamente
    const origEnv = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = 'production';
      const prodAdapterWithoutKey = new AsaasProviderAdapter({ apiKey: null, isSandbox: false });

      await assert.rejects(
        async () => {
          await prodAdapterWithoutKey.createSubscription({
            customerId: 'cus_prod_1',
            plan: 'pro',
            price: 299,
            billingCycle: 'mensal'
          });
        },
        /não configurada para ambiente de produção/
      );
    } finally {
      process.env.NODE_ENV = origEnv;
    }
  });

  await t.test('5. Faturas persistidas no banco SQLite', async () => {
    const tenantId = `tenant_inv_${Date.now()}`;
    const invoice = {
      id: `inv_${Date.now()}`,
      tenantId,
      providerInvoiceId: `asaas_inv_${Date.now()}`,
      amount: 299,
      status: 'paid',
      paymentMethod: 'pix',
      paidAt: new Date().toISOString(),
      createdAt: new Date().toISOString()
    };

    await billingService.recordInvoice(invoice);

    const row = await get('SELECT * FROM billing_invoices WHERE id = ?', [invoice.id]);
    assert.ok(row, 'Fatura deve ser persistida na tabela billing_invoices');
    assert.equal(row.amount, 299);
    assert.equal(row.status, 'paid');
    assert.equal(row.payment_method, 'pix');
  });
});
