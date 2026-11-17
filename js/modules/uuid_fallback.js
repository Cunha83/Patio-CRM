/**
 * Módulo: uuid_fallback.js
 * Pátio-CRM — Fallback Criptográfico Universal para UUID RFC-4122 v4
 * Suporte a ambientes HTTP, LAN (rede local) e navegadores legados.
 * Arquitetura Modular (< 100 linhas).
 */

(function () {
  'use strict';

  function gerarUuidSeguro() {
    try {
      if (typeof window !== 'undefined' && window.isSecureContext && window.crypto && typeof window.crypto.randomUUID === 'function') {
        return window.crypto.randomUUID();
      }
    } catch (_) {}

    // Fallback 1: crypto.getRandomValues (RFC-4122 v4)
    try {
      const cryptoObj = (typeof window !== 'undefined' && window.crypto) || (typeof globalThis !== 'undefined' && globalThis.crypto);
      if (cryptoObj && typeof cryptoObj.getRandomValues === 'function') {
        const buf = new Uint8Array(16);
        cryptoObj.getRandomValues(buf);
        buf[6] = (buf[6] & 0x0f) | 0x40; // Versão 4
        buf[8] = (buf[8] & 0x3f) | 0x80; // Variante 10
        const hex = Array.from(buf, b => b.toString(16).padStart(2, '0')).join('');
        return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
      }
    } catch (_) {}

    // Fallback 2: Gerador pseudoaleatório baseado em Math.random e timestamp
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : ((r & 0x3) | 0x8);
      return v.toString(16);
    });
  }

  // Patching defensivo no escopo global e em window.crypto.randomUUID
  if (typeof globalThis !== 'undefined') {
    globalThis.gerarUuidSeguro = gerarUuidSeguro;
    try {
      if (!globalThis.crypto) globalThis.crypto = {};
      if (typeof globalThis.crypto.randomUUID !== 'function') {
        globalThis.crypto.randomUUID = gerarUuidSeguro;
      }
    } catch (_) {}
  }

  if (typeof window !== 'undefined') {
    window.gerarUuidSeguro = gerarUuidSeguro;
    try {
      if (!window.crypto) window.crypto = {};
      if (typeof window.crypto.randomUUID !== 'function') {
        window.crypto.randomUUID = gerarUuidSeguro;
      }
    } catch (_) {}
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { gerarUuidSeguro };
  }
})();
