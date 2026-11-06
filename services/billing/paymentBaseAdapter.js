'use strict';

/**
 * PÁTIO CRM — PAYMENT PROVIDER ADAPTER BASE
 */

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

module.exports = {
  PaymentProviderAdapter
};

