'use strict';

const crypto = require('crypto');

class ImageRenderCache {
  constructor({ maxEntries = 50 } = {}) {
    this.maxEntries = maxEntries;
    this.cache = new Map(); // key -> { buffer, seq }
    this.seq = 0;
  }

  makeKey(tenantId, versao, dataRef = '', options = {}) {
    const optHash = crypto.createHash('sha256').update(JSON.stringify(options)).digest('hex').slice(0, 8);
    return `${tenantId}_v${versao}_${dataRef}_${optHash}`;
  }

  get(tenantId, versao, dataRef, options) {
    const key = this.makeKey(tenantId, versao, dataRef, options);
    const item = this.cache.get(key);
    if (item) {
      item.seq = ++this.seq;
      return item.buffer;
    }
    return null;
  }

  set(tenantId, versao, dataRef, options, buffer) {
    if (this.cache.size >= this.maxEntries && !this.cache.has(this.makeKey(tenantId, versao, dataRef, options))) {
      // Evicção LRU baseada no menor número de sequência
      let oldestKey = null;
      let oldestSeq = Infinity;
      for (const [k, v] of this.cache) {
        if (v.seq < oldestSeq) {
          oldestSeq = v.seq;
          oldestKey = k;
        }
      }
      if (oldestKey) this.cache.delete(oldestKey);
    }

    const key = this.makeKey(tenantId, versao, dataRef, options);
    this.cache.set(key, {
      buffer,
      seq: ++this.seq
    });
  }

  clear(tenantId = null) {
    if (!tenantId) {
      this.cache.clear();
      return;
    }
    for (const key of this.cache.keys()) {
      if (key.startsWith(`${tenantId}_`)) this.cache.delete(key);
    }
  }
}

module.exports = {
  ImageRenderCache
};
