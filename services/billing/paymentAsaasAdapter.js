'use strict';

const { PaymentProviderAdapter } = require('./paymentBaseAdapter');

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

    const eventType = body.event;
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

module.exports = {
  AsaasProviderAdapter
};

