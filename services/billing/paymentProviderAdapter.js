'use strict';

/**
 * PÁTIO CRM — PAYMENT PROVIDER ADAPTER
 * Camada de abstração para provedores de pagamento no Brasil.
 * Implementação completa para Asaas (produção) e Sandbox (apenas desenvolvimento/testes).
 */

const crypto = require('crypto');

class PaymentProviderAdapter {
  constructor(name, options = {}) {
    this.name = name;
    this.options = options;
  }

  async createCustomer(customerData) {
    throw new Error('createCustomer não implementado no adapter.');
  }

  async createSubscription(subscriptionData) {
    throw new Error('createSubscription não implementado no adapter.');
  }

  async createCheckout(checkoutData) {
    throw new Error('createCheckout não implementado no adapter.');
  }

  async cancelSubscription(cancelData) {
    throw new Error('cancelSubscription não implementado no adapter.');
  }

  async changePlan(changeData) {
    throw new Error('changePlan não implementado no adapter.');
  }

  async getSubscription(subscriptionId) {
    throw new Error('getSubscription não implementado no adapter.');
  }

  async handleWebhook(webhookData) {
    throw new Error('handleWebhook não implementado no adapter.');
  }

  async createPix(pixData) {
    throw new Error('createPix não implementado no adapter.');
  }

  async createBoleto(boletoData) {
    throw new Error('createBoleto não implementado no adapter.');
  }
}

/**
 * SANDBOX PROVIDER ADAPTER
 * Emulador exclusivo para desenvolvimento local e testes offline.
 * NUNCA permitido em produção.
 */
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
    if (!tenantId || !email) throw new Error('Parâmetros obrigatórios: tenantId, email.');
    const customerId = `cus_sbx_${crypto.randomBytes(6).toString('hex')}`;
    const customer = {
      providerCustomerId: customerId,
      tenantId,
      legalName: legalName || 'Oficina Teste',
      document: document || '00.000.000/0001-91',
      email,
      phone: phone || '62999999999',
      provider: 'sandbox',
      isSimulated: true,
      simulationNotice: 'SIMULAÇÃO - AMBIENTE DE TESTES',
      createdAt: new Date().toISOString()
    };
    this.customers.set(customerId, customer);
    return { ok: true, customerId, customer, isSimulated: true };
  }

  async createSubscription({ customerId, plan, billingCycle = 'mensal', price, creditCardToken = null, setupFee = 0 }) {
    this.assertNotProduction();
    if (!customerId || !plan || price == null) {
      throw new Error('Parâmetros obrigatórios: customerId, plan, price.');
    }
    const subscriptionId = `sub_sbx_${crypto.randomBytes(6).toString('hex')}`;
    const now = new Date();
    const nextMonth = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const subscription = {
      providerSubscriptionId: subscriptionId,
      customerId,
      plan,
      billingCycle,
      price: Number(price),
      setupFee: Number(setupFee || 0),
      status: 'active',
      creditCardToken: creditCardToken || 'tok_sbx_card_mock',
      currentPeriodStart: now.toISOString(),
      currentPeriodEnd: nextMonth.toISOString(),
      cancelAtPeriodEnd: false,
      isSimulated: true,
      createdAt: now.toISOString()
    };

    this.subscriptions.set(subscriptionId, subscription);
    return { ok: true, subscriptionId, subscription, isSimulated: true };
  }

  async createCheckout({ tenantId, plan, billingCycle = 'mensal', price, setupFee = 0, paymentMethod = 'pix', customer = {} }) {
    this.assertNotProduction();
    const checkoutId = `chk_sbx_${crypto.randomBytes(6).toString('hex')}`;
    const totalAmount = Math.round(((Number(price) || 0) + (Number(setupFee) || 0)) * 100) / 100;

    let paymentDetails = {};
    if (paymentMethod === 'pix') {
      paymentDetails = {
        pixCopiaECola: `00020101021226840014br.gov.bcb.pix2562qrcodes.patio-crm.com.br/pix/${checkoutId}520400005303986540${totalAmount}5802BR5916REAL SOLUCOES6008GOIANIA62070503***6304${crypto.randomBytes(2).toString('hex')}`,
        qrCodeUrl: `/api/billing/pix/qr/${checkoutId}.png`,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        isSimulated: true,
        simulationNotice: 'TESTE: PIX simulado. Não efetue pagamento real.'
      };
    } else if (paymentMethod === 'boleto') {
      paymentDetails = {
        linhaDigitavel: '23793.38128 60000.123456 78000.654321 1 950000000' + Math.floor(totalAmount * 100),
        codigoBarras: '23791950000000' + Math.floor(totalAmount * 100) + '3381286000012345678000654321',
        boletoUrl: `https://sandbox.patio-crm.com.br/boleto/${checkoutId}.pdf`,
        dueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
        isSimulated: true,
        simulationNotice: 'TESTE: Boleto simulado. Não pague em rede bancária.'
      };
    } else {
      paymentDetails = {
        requiresTokenization: true,
        providerHostedUrl: `https://sandbox.patio-crm.com.br/checkout/${checkoutId}`,
        isSimulated: true
      };
    }

    return {
      ok: true,
      checkoutId,
      tenantId,
      plan,
      totalAmount,
      currency: 'BRL',
      paymentMethod,
      paymentDetails,
      isSimulated: true,
      simulationBanner: '⚠️ MODO DE SIMULAÇÃO (SANDBOX) — PAGAMENTOS NÃO SÃO REAIS',
      expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString()
    };
  }

  async cancelSubscription({ subscriptionId, immediate = false, reason = 'outro' }) {
    this.assertNotProduction();
    const sub = this.subscriptions.get(subscriptionId);
    if (!sub) throw new Error(`Assinatura ${subscriptionId} não encontrada no Sandbox.`);

    if (immediate) {
      sub.status = 'cancelled';
      sub.cancelledAt = new Date().toISOString();
    } else {
      sub.cancelAtPeriodEnd = true;
    }
    sub.cancellationReason = reason;
    return { ok: true, subscription: sub, isSimulated: true };
  }

  async changePlan({ subscriptionId, newPlan, price }) {
    this.assertNotProduction();
    const sub = this.subscriptions.get(subscriptionId);
    if (!sub) throw new Error(`Assinatura ${subscriptionId} não encontrada no Sandbox.`);

    sub.plan = newPlan;
    if (price != null) sub.price = Number(price);
    sub.updatedAt = new Date().toISOString();
    return { ok: true, subscription: sub, isSimulated: true };
  }

  async getSubscription(subscriptionId) {
    const sub = this.subscriptions.get(subscriptionId);
    if (!sub) return null;
    return { ...sub };
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

/**
 * ASAAS PROVIDER ADAPTER (PRODUÇÃO & SANDBOX OFICIAL ASAAS)
 * Adaptador oficial para cobranças e assinaturas recorrentes via Asaas API v3.
 */
class AsaasProviderAdapter extends PaymentProviderAdapter {
  constructor(options = {}) {
    super('asaas', options);
    this.apiKey = options.apiKey || process.env.ASAAS_API_KEY || '';
    this.webhookAccessToken = options.webhookAccessToken || process.env.ASAAS_WEBHOOK_TOKEN || '';
    this.isSandbox = options.isSandbox !== undefined ? options.isSandbox : (process.env.ASAAS_ENV !== 'production');
    this.apiUrl = options.apiUrl || (this.isSandbox ? 'https://sandbox.asaas.com/api/v3' : 'https://api.asaas.com/v3');
    this.fetchImpl = options.fetchImpl || globalThis.fetch;
  }

  checkCredentials() {
    if (process.env.NODE_ENV === 'production' && (!this.apiKey || this.apiKey === 'sua_chave_asaas_aqui')) {
      throw new Error('Chave de API do Asaas não configurada para ambiente de produção.');
    }
    if (!this.apiKey || this.apiKey === 'sua_chave_asaas_aqui') {
      throw new Error('Gateway Asaas não configurado: ASAAS_API_KEY ausente ou inválida. Configure a credencial no arquivo .env.');
    }
  }

  async createPixQrCode({ invoiceId, amount = 0 }) {
    if (this.isSandbox && (!this.apiKey || this.apiKey === 'sua_chave_asaas_aqui')) {
      return {
        ok: true,
        isSimulated: true,
        pixCopiaECola: '00020126580014br.gov.bcb.pix0136mock',
        qrCodeBase64: 'data:image/png;base64,mock'
      };
    }
    this.checkCredentials();
    return await this.apiRequest(`/payments/${invoiceId}/pixQrCode`, { method: 'GET' });
  }

  async apiRequest(endpoint, { method = 'GET', body = null } = {}) {
    this.checkCredentials();
    const url = `${this.apiUrl}${endpoint}`;
    const headers = {
      'access_token': this.apiKey,
      'Content-Type': 'application/json',
      'User-Agent': 'PatioCRM-SaaS/1.0'
    };

    const config = { method, headers };
    if (body) config.body = JSON.stringify(body);

    const res = await this.fetchImpl(url, config);
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      const errorMsg = Array.isArray(data.errors) && data.errors.length > 0
        ? data.errors.map(e => e.description || e.message).join(' | ')
        : (data.message || `Erro HTTP ${res.status} na API Asaas.`);
      const err = new Error(`[Asaas API] ${errorMsg}`);
      err.status = res.status;
      err.details = data;
      throw err;
    }

    return data;
  }

  verifyWebhookSignature({ headers = {} }) {
    const tokenHeader = headers['asaas-access-token'];
    if (!tokenHeader || !this.webhookAccessToken) return false;
    return tokenHeader === this.webhookAccessToken;
  }

  async handleWebhook({ headers = {}, body = {} }) {
    const isValid = this.verifyWebhookSignature({ headers });
    if (!isValid) {
      return { ok: false, status: 401, error: 'Token de webhook Asaas ausente ou inválido.' };
    }

    const eventType = body.event; // PAYMENT_RECEIVED, PAYMENT_OVERDUE, PAYMENT_DELETED, etc.
    const payment = body.payment || {};
    const providerEventId = body.id || `evt_asaas_${payment.id || Date.now()}_${eventType}`;

    return {
      ok: true,
      provider: 'asaas',
      providerEventId,
      type: eventType,
      tenantId: payment.externalReference || null,
      subscriptionId: payment.subscription || null,
      amount: payment.value || 0,
      status: payment.status || 'CONFIRMED',
      rawPayload: body
    };
  }

  async createCustomer({ tenantId, legalName, document, email, phone }) {
    if (!tenantId || !email) throw new Error('Campos obrigatórios: tenantId, email.');

    const payload = {
      name: legalName || 'Oficina Mecânica',
      email,
      cpfCnpj: document ? String(document).replace(/\D/g, '') : undefined,
      mobilePhone: phone ? String(phone).replace(/\D/g, '') : undefined,
      externalReference: tenantId
    };

    const res = await this.apiRequest('/customers', { method: 'POST', body: payload });
    return {
      ok: true,
      provider: 'asaas',
      customerId: res.id,
      tenantId,
      customer: res
    };
  }

  async createSubscription({ customerId, plan, billingCycle = 'mensal', price, creditCardToken = null, setupFee = 0 }) {
    if (!customerId || !plan || price == null) {
      throw new Error('Campos obrigatórios: customerId, plan, price.');
    }

    const nextDueDate = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    const payload = {
      customer: customerId,
      billingType: creditCardToken ? 'CREDIT_CARD' : 'UNDEFINED',
      value: Number(price),
      nextDueDate,
      cycle: billingCycle === 'anual' ? 'ANNUALLY' : 'MONTHLY',
      description: `Assinatura Pátio CRM — Plano ${String(plan).toUpperCase()}`,
      externalReference: customerId
    };

    if (creditCardToken) {
      payload.creditCardToken = creditCardToken;
    }

    const res = await this.apiRequest('/subscriptions', { method: 'POST', body: payload });
    return {
      ok: true,
      provider: 'asaas',
      subscriptionId: res.id,
      customerId,
      plan,
      price: Number(price),
      subscription: res
    };
  }

  async createCheckout({ tenantId, plan, billingCycle = 'mensal', price, setupFee = 0, paymentMethod = 'pix', customer = {} }) {
    const totalAmount = Math.round(((Number(price) || 0) + (Number(setupFee) || 0)) * 100) / 100;
    const dueDate = new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString().slice(0, 10);

    let asaasCustomer = customer.providerCustomerId;
    if (!asaasCustomer) {
      const created = await this.createCustomer({
        tenantId,
        legalName: customer.legalName,
        document: customer.document,
        email: customer.email,
        phone: customer.phone
      });
      asaasCustomer = created.customerId;
    }

    const paymentPayload = {
      customer: asaasCustomer,
      billingType: paymentMethod === 'boleto' ? 'BOLETO' : (paymentMethod === 'pix' ? 'PIX' : 'CREDIT_CARD'),
      value: totalAmount,
      dueDate,
      description: `Ativação Pátio CRM — Plano ${String(plan).toUpperCase()} (${tenantId})`,
      externalReference: tenantId
    };

    const paymentRes = await this.apiRequest('/payments', { method: 'POST', body: paymentPayload });

    let paymentDetails = {};
    if (paymentMethod === 'pix') {
      const pixQr = await this.apiRequest(`/payments/${paymentRes.id}/pixQrCode`, { method: 'GET' });
      paymentDetails = {
        pixCopiaECola: pixQr.payload,
        qrCodeBase64: pixQr.encodedImage,
        expiresAt: pixQr.expirationDate
      };
    } else if (paymentMethod === 'boleto') {
      paymentDetails = {
        linhaDigitavel: paymentRes.identificationField,
        codigoBarras: paymentRes.barCode,
        boletoUrl: paymentRes.bankSlipUrl,
        dueDate: paymentRes.dueDate
      };
    } else {
      paymentDetails = {
        requiresTokenization: true,
        invoiceUrl: paymentRes.invoiceUrl
      };
    }

    return {
      ok: true,
      provider: 'asaas',
      checkoutId: paymentRes.id,
      tenantId,
      plan,
      totalAmount,
      currency: 'BRL',
      paymentMethod,
      paymentDetails,
      expiresAt: paymentRes.dueDate
    };
  }

  async cancelSubscription({ subscriptionId, immediate = false, reason = 'outro' }) {
    if (!subscriptionId) throw new Error('subscriptionId é obrigatório.');
    const res = await this.apiRequest(`/subscriptions/${subscriptionId}`, { method: 'DELETE' });
    return {
      ok: true,
      provider: 'asaas',
      subscriptionId,
      cancelled: true,
      immediate,
      cancellationReason: reason,
      res
    };
  }

  async changePlan({ subscriptionId, newPlan, price }) {
    if (!subscriptionId || price == null) {
      throw new Error('subscriptionId e price são obrigatórios.');
    }
    const res = await this.apiRequest(`/subscriptions/${subscriptionId}`, {
      method: 'PUT',
      body: {
        value: Number(price),
        description: `Assinatura Pátio CRM — Plano ${String(newPlan).toUpperCase()}`
      }
    });
    return {
      ok: true,
      provider: 'asaas',
      subscriptionId,
      plan: newPlan,
      price: Number(price),
      res
    };
  }

  async getSubscription(subscriptionId) {
    if (!subscriptionId) return null;
    try {
      const res = await this.apiRequest(`/subscriptions/${subscriptionId}`, { method: 'GET' });
      return {
        providerSubscriptionId: res.id,
        customerId: res.customer,
        status: res.status === 'ACTIVE' ? 'active' : (res.status === 'OVERDUE' ? 'past_due' : 'cancelled'),
        price: res.value,
        cycle: res.cycle,
        currentPeriodEnd: res.nextDueDate,
        raw: res
      };
    } catch (_) {
      return null;
    }
  }
}

function getPaymentAdapter(providerName = null) {
  const mode = (providerName || process.env.BILLING_MODE || 'sandbox').toLowerCase().trim();
  if (mode === 'asaas') {
    return new AsaasProviderAdapter();
  }
  return new SandboxProviderAdapter();
}

module.exports = {
  PaymentProviderAdapter,
  SandboxProviderAdapter,
  AsaasProviderAdapter,
  getPaymentAdapter
};
