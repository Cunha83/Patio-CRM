'use strict';

/**
 * PÁTIO CRM — SERVIÇO DE GESTÃO DE ASSINATURAS & BILLING SAAS
 * Fachada Modular (< 60 linhas).
 *
 * Submódulos:
 * - services/billing/billingPersistence.js: Maps, persistência SQLite e ledger de faturas
 * - services/billing/billingLifecycle.js: Checkout, webhooks, dunning, upgrades e cancelamento
 */

const {
  billingCustomers,
  billingSubscriptions,
  billingEventsLedger,
  billingInvoices,
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
} = require('./billingPersistence');

const {
  initializeSubscription,
  getSubscription,
  createCheckout,
  processWebhookEvent,
  checkDunningStatus,
  reactivateSubscription,
  changeSubscriptionPlan,
  cancelSubscription,
  reconcileSubscriptions
} = require('./billingLifecycle');

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
