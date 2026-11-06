'use strict';

const crypto = require('crypto');
const { PaymentProviderAdapter } = require('./paymentBaseAdapter');

class SandboxProviderAdapter extends PaymentProviderAdapter {
  constructor(options = {}) {
    super('sandbox', options);
    this.webhookSecret = options.webhookSecret || process.env.BILLING_WEBHOOK_SECRET || 'sandbox_secret_2026';
    this.customers = new Map();
    this.subscriptions = new Map();
    this.payments = new Map();
  }

  assertNotProduction() {
    if (process.env.NODE_ENV === 'production' && !this.options.allowInTest) {
      throw new Error('Ambiente de produção não permite o provedor simulado (Sandbox). Configure as credenciais oficiais do Asaas (ASAAS_API_KEY).');
    }
  }

  async createCustomer({ tenantId, legalName, document, email, phone }) {
    this.assertNotProduction();
    if (!tenantId || !email) {
      throw new Error('tenantId e email são obrigatórios.');
    }
    const customerId = `cus_sbx_${crypto.randomBytes(6).toString('hex')}`;
    const customer = {
      id: customerId,
      tenantId,
      legalName: legalName || 'Cliente Teste',
      document: document || '00.000.000/0001-91',
      email,
      phone: phone || '(11) 99999-9999',
      createdAt: new Date().toISOString()
    };
    this.customers.set(customerId, customer);
    return { ok: true, provider: 'sandbox', customerId, tenantId, customer };
  }

  async createSubscription({ customerId, plan, billingCycle = 'mensal', price, setupFee = 0 }) {
    this.assertNotProduction();
    if (!customerId || !plan || price == null) {
      throw new Error('customerId, plan e price são obrigatórios.');
    }
    const subscriptionId = `sub_sbx_${crypto.randomBytes(6).toString('hex')}`;
    const now = new Date();
    const nextDueDate = new Date(now.getTime() + (billingCycle === 'anual' ? 365 : 30) * 24 * 3600 * 1000).toISOString().slice(0, 10);

    const subscription = {
      id: subscriptionId,
      customerId,
      plan,
      billingCycle,
      price: Number(price),
      setupFee: Number(setupFee),
      status: 'active',
      currentPeriodStart: now.toISOString(),
      currentPeriodEnd: nextDueDate,
      nextDueDate,
      cancelAtPeriodEnd: false,
      createdAt: now.toISOString()
    };
    this.subscriptions.set(subscriptionId, subscription);

    return {
      ok: true,
      provider: 'sandbox',
      subscriptionId,
      customerId,
      plan,
      price: Number(price),
      subscription
    };
  }

  async createCheckout({ tenantId, plan, billingCycle = 'mensal', price, setupFee = 0, paymentMethod = 'pix', customer = {} }) {
    this.assertNotProduction();
    const checkoutId = `chk_sbx_${crypto.randomBytes(6).toString('hex')}`;
    const totalAmount = Math.round(((Number(price) || 0) + (Number(setupFee) || 0)) * 100) / 100;
    const dueDate = new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString().slice(0, 10);

    let paymentDetails = {};
    if (paymentMethod === 'pix') {
      paymentDetails = {
        pixCopiaECola: `00020126580014br.gov.bcb.pix0136mock${crypto.randomUUID()}520400005303986540${totalAmount}5802BR5916REAL SOLUCOES6008GOIANIA62070503***6304ABCD`,
        qrCodeBase64: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        expiresAt: new Date(Date.now() + 24 * 3600 * 1000).toISOString()
      };
    } else if (paymentMethod === 'boleto') {
      paymentDetails = {
        linhaDigitavel: '23793.38128 60000.123456 78000.654321 1 950000000' + Math.floor(totalAmount * 100),
        codigoBarras: '23791950000000' + Math.floor(totalAmount * 100) + '3381286000012345678000654321',
        boletoUrl: `https://sandbox.patio-crm.com.br/boletos/${checkoutId}.pdf`,
        dueDate
      };
    } else {
      paymentDetails = {
        requiresTokenization: true,
        invoiceUrl: `https://sandbox.patio-crm.com.br/fatura/${checkoutId}`
      };
    }

    return {
      ok: true,
      provider: 'sandbox',
      checkoutId,
      tenantId,
      plan,
      totalAmount,
      currency: 'BRL',
      paymentMethod,
      paymentDetails,
      expiresAt: dueDate,
      isSimulated: true
    };
  }

  async cancelSubscription({ subscriptionId, immediate = false, reason = 'outro' }) {
    this.assertNotProduction();
    const sub = this.subscriptions.get(subscriptionId);
    if (!sub) {
      return { ok: false, error: 'Assinatura não localizada no sandbox.' };
    }
    if (immediate) {
      sub.status = 'cancelled';
      sub.cancelledAt = new Date().toISOString();
    } else {
      sub.cancelAtPeriodEnd = true;
    }
    sub.cancellationReason = reason;

    return {
      ok: true,
      provider: 'sandbox',
      subscriptionId,
      cancelled: true,
      immediate,
      cancellationReason: reason,
      subscription: sub
    };
  }

  async changePlan({ subscriptionId, newPlan, price }) {
    this.assertNotProduction();
    const sub = this.subscriptions.get(subscriptionId);
    if (!sub) {
      return { ok: false, error: 'Assinatura não localizada no sandbox.' };
    }
    sub.previousPlan = sub.plan;
    sub.plan = newPlan;
    sub.price = Number(price);
    sub.updatedAt = new Date().toISOString();

    return {
      ok: true,
      provider: 'sandbox',
      subscriptionId,
      plan: newPlan,
      price: Number(price),
      subscription: sub
    };
  }

  async getSubscription(subscriptionId) {
    this.assertNotProduction();
    const sub = this.subscriptions.get(subscriptionId);
    if (!sub) return null;
    return {
      providerSubscriptionId: sub.id,
      customerId: sub.customerId,
      status: sub.status,
      price: sub.price,
      cycle: sub.billingCycle,
      currentPeriodEnd: sub.currentPeriodEnd,
      cancelAtPeriodEnd: sub.cancelAtPeriodEnd
    };
  }

  async createPix({ customerId, amount, description = 'Mensalidade Pátio CRM' }) {
    this.assertNotProduction();
    const pixId = `pix_sbx_${crypto.randomBytes(4).toString('hex')}`;
    return {
      ok: true,
      pixId,
      amount: Number(amount),
      copiaECola: `00020126580014br.gov.bcb.pix0136${crypto.randomUUID()}520400005303986540${amount}5802BR5916REAL SOLUCOES6008GOIANIA62070503***6304ABCD`,
      expiresAt: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
      isSimulated: true
    };
  }

  async createBoleto({ customerId, amount, dueDate, description = 'Mensalidade Pátio CRM' }) {
    this.assertNotProduction();
    const boletoId = `bol_sbx_${crypto.randomBytes(4).toString('hex')}`;
    return {
      ok: true,
      boletoId,
      amount: Number(amount),
      dueDate: dueDate || new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString().slice(0, 10),
      linhaDigitavel: '23793.38128 60000.123456 78000.654321 1 950000000' + Math.floor(amount * 100),
      pdfUrl: `https://sandbox.patio-crm.com.br/boletos/${boletoId}.pdf`,
      isSimulated: true
    };
  }

  verifyWebhookSignature({ headers = {}, rawBody = '', body = null }) {
    const receivedSig = headers['x-sandbox-signature'] || headers['asaas-access-token'] || headers['x-provider-signature'];
    if (!receivedSig) return false;

    if (receivedSig === this.webhookSecret) return true;

    try {
      const payloadString = typeof rawBody === 'string' && rawBody.length > 0
        ? rawBody
        : JSON.stringify(body || {});
      const expected = crypto.createHmac('sha256', this.webhookSecret).update(payloadString).digest('hex');
      return crypto.timingSafeEqual(Buffer.from(receivedSig), Buffer.from(expected));
    } catch (_) {
      return false;
    }
  }

  signWebhookPayload(payload) {
    const jsonStr = typeof payload === 'string' ? payload : JSON.stringify(payload);
    return crypto.createHmac('sha256', this.webhookSecret).update(jsonStr).digest('hex');
  }

  async handleWebhook({ headers = {}, rawBody = '', body = null }) {
    const isValid = this.verifyWebhookSignature({ headers, rawBody, body });
    if (!isValid) {
      return { ok: false, status: 401, error: 'Assinatura de webhook inválida.' };
    }

    const event = body || (rawBody ? JSON.parse(rawBody) : {});
    const eventType = event.event || event.type;
    const providerEventId = event.id || event.providerEventId || `evt_sbx_${crypto.randomBytes(4).toString('hex')}`;

    return {
      ok: true,
      provider: 'sandbox',
      providerEventId,
      type: eventType,
      tenantId: event.tenantId || (event.subscription ? event.subscription.tenantId : null),
      subscriptionId: event.subscriptionId || (event.payment ? event.payment.subscriptionId : null),
      amount: event.payment ? event.payment.value : (event.amount || 0),
      status: event.payment ? event.payment.status : 'RECEIVED',
      isSimulated: true,
      rawPayload: event
    };
  }
}

module.exports = {
  SandboxProviderAdapter
};
