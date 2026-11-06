'use strict';

/**
 * PÁTIO CRM — PAYMENT PROVIDER ADAPTER
 * Fachada Modular (< 50 linhas).
 *
 * Submódulos:
 * - services/billing/paymentBaseAdapter.js: Classe base abstrata
 * - services/billing/paymentSandboxAdapter.js: Adaptador sandbox/mock
 * - services/billing/paymentAsaasAdapter.js: Adaptador de produção Asaas
 */

const { PaymentProviderAdapter } = require('./paymentBaseAdapter');
const { SandboxProviderAdapter } = require('./paymentSandboxAdapter');
const { AsaasProviderAdapter } = require('./paymentAsaasAdapter');

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
