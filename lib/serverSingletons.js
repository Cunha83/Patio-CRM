'use strict';

const crypto = require('crypto');

// Singletons / instâncias de integração e adapters
let aiClientInstance = null;
let wppClientInstance = null;
let browserRenderCacheInstance = null;
let passwordResetDeliveryAdapterInstance = null;
let patioSupportInstance = null;

function getAiClient() {
  return aiClientInstance;
}
function setAiClient(client) {
  aiClientInstance = client;
}

function getWppClient() {
  return wppClientInstance;
}
function setWppClient(client) {
  wppClientInstance = client;
}

function getBrowserRenderCache() {
  return browserRenderCacheInstance;
}
function setBrowserRenderCache(cache) {
  browserRenderCacheInstance = cache;
}

function getPasswordResetDeliveryAdapter() {
  return passwordResetDeliveryAdapterInstance;
}
function setPasswordResetDeliveryAdapter(adapter) {
  passwordResetDeliveryAdapterInstance = adapter;
}

function getPatioSupport() {
  return patioSupportInstance;
}
function setPatioSupport(support) {
  patioSupportInstance = support;
}

// Gerador de IDs únicos
function gerarId(prefix) {
  return `${prefix}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
}

// Helper para sanitizar HTML
function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Safe JSON parse
function safeJsonParse(text) {
  if (!text) return null;
  try {
    let cleaned = text.replace(/```json\s*/gi, '').replace(/```/g, '').trim();
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    const matchArr = cleaned.match(/\[[\s\S]*\]/);
    if (matchArr) return JSON.parse(matchArr[0]);
    return JSON.parse(cleaned);
  } catch (e) {
    console.warn('[safeJsonParse] Falha ao parsear JSON:', e.message);
    return null;
  }
}

module.exports = {
  getAiClient,
  setAiClient,
  getWppClient,
  setWppClient,
  getBrowserRenderCache,
  setBrowserRenderCache,
  getPasswordResetDeliveryAdapter,
  setPasswordResetDeliveryAdapter,
  getPatioSupport,
  setPatioSupport,
  gerarId,
  escapeHtml,
  safeJsonParse
};
