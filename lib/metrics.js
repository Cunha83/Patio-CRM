'use strict';

/**
 * Módulo de Telemetria e Coleta de Métricas
 * Coleta latência, contadores de sucesso e erros no middleware de contexto e no repositório.
 */

const MAX_RECENT_EVENTS = 200;
const MAX_LATENCY_SAMPLES = 1000;

class MetricsCollector {
  constructor(options = {}) {
    this.enableConsoleLog = options.enableConsoleLog !== false;
    this.recentEvents = [];
    this.reset();
  }

  reset() {
    this.recentEvents = [];
    this.auth = {
      totalRequests: 0,
      successCount: 0,
      errorCount: 0,
      errorsByType: {},
      latencies: [],
      byTenant: {}
    };
    this.repository = {
      reads: {
        total: 0,
        cacheHits: 0,
        dbReads: 0,
        errors: 0,
        latencies: [],
        byTenant: {}
      },
      writes: {
        total: 0,
        successCount: 0,
        conflicts409: 0,
        validationErrors: 0,
        dbErrors: 0,
        latencies: [],
        byTenant: {}
      }
    };
  }

  _addSample(arr, val) {
    if (typeof val === 'number' && !Number.isNaN(val)) {
      if (arr.length >= MAX_LATENCY_SAMPLES) {
        arr.shift();
      }
      arr.push(Math.round(val * 100) / 100);
    }
  }

  _addRecentEvent(event) {
    if (this.recentEvents.length >= MAX_RECENT_EVENTS) {
      this.recentEvents.shift();
    }
    this.recentEvents.push(event);
  }

  logStructured(entry) {
    if (process.env.METRICS_LOG_SILENT === 'true') return;
    if (this.enableConsoleLog) {
      try {
        console.log(JSON.stringify(entry));
      } catch (_) {
        // Ignora erro de serialização
      }
    }
  }

  _calcStats(samples) {
    if (!samples || samples.length === 0) {
      return { count: 0, avgMs: 0, minMs: 0, maxMs: 0, p95Ms: 0, p99Ms: 0 };
    }
    const sorted = [...samples].sort((a, b) => a - b);
    const count = sorted.length;
    const sum = sorted.reduce((acc, v) => acc + v, 0);
    const avgMs = Math.round((sum / count) * 100) / 100;
    const minMs = sorted[0];
    const maxMs = sorted[count - 1];
    const p95Idx = Math.min(count - 1, Math.floor(count * 0.95));
    const p99Idx = Math.min(count - 1, Math.floor(count * 0.99));
    const p95Ms = sorted[p95Idx];
    const p99Ms = sorted[p99Idx];

    return { count, avgMs, minMs, maxMs, p95Ms, p99Ms };
  }

  /**
   * Registra métrica do middleware de contexto / autenticação
   */
  recordAuth({ latencyMs, success, errorType = null, tenantId = 'unresolved', actorId = null, role = null }) {
    const lat = typeof latencyMs === 'number' ? latencyMs : 0;
    this.auth.totalRequests++;
    this._addSample(this.auth.latencies, lat);

    const tid = tenantId || 'unresolved';
    if (!this.auth.byTenant[tid]) {
      this.auth.byTenant[tid] = { totalRequests: 0, successCount: 0, errorCount: 0 };
    }
    this.auth.byTenant[tid].totalRequests++;

    if (success) {
      this.auth.successCount++;
      this.auth.byTenant[tid].successCount++;
    } else {
      this.auth.errorCount++;
      this.auth.byTenant[tid].errorCount++;
      const et = errorType || 'unknown_error';
      this.auth.errorsByType[et] = (this.auth.errorsByType[et] || 0) + 1;
    }

    const event = {
      timestamp: new Date().toISOString(),
      type: 'metric',
      subsystem: 'auth',
      op: 'authenticate',
      latencyMs: Math.round(lat * 100) / 100,
      success: Boolean(success),
      tenantId: tid,
      actorId: actorId || null,
      role: role || null,
      errorType: errorType || null
    };

    this._addRecentEvent(event);
    this.logStructured(event);
    return event;
  }

  /**
   * Registra métrica de leitura no repositório de estado
   */
  recordRepoRead({ latencyMs, success, cacheHit = false, tenantId = 'unknown', error = null }) {
    const lat = typeof latencyMs === 'number' ? latencyMs : 0;
    const reads = this.repository.reads;
    reads.total++;
    this._addSample(reads.latencies, lat);

    const tid = tenantId || 'unknown';
    if (!reads.byTenant[tid]) {
      reads.byTenant[tid] = { total: 0, cacheHits: 0, dbReads: 0, errors: 0 };
    }
    reads.byTenant[tid].total++;

    if (cacheHit) {
      reads.cacheHits++;
      reads.byTenant[tid].cacheHits++;
    } else {
      reads.dbReads++;
      reads.byTenant[tid].dbReads++;
    }

    if (!success) {
      reads.errors++;
      reads.byTenant[tid].errors++;
    }

    const event = {
      timestamp: new Date().toISOString(),
      type: 'metric',
      subsystem: 'repository',
      op: 'read',
      latencyMs: Math.round(lat * 100) / 100,
      success: Boolean(success),
      cacheHit: Boolean(cacheHit),
      tenantId: tid,
      error: error || null
    };

    this._addRecentEvent(event);
    this.logStructured(event);
    return event;
  }

  /**
   * Registra métrica de escrita no repositório de estado
   */
  recordRepoWrite({ latencyMs, success, conflict = false, status = 200, tenantId = 'unknown', error = null }) {
    const lat = typeof latencyMs === 'number' ? latencyMs : 0;
    const writes = this.repository.writes;
    writes.total++;
    this._addSample(writes.latencies, lat);

    const tid = tenantId || 'unknown';
    if (!writes.byTenant[tid]) {
      writes.byTenant[tid] = { total: 0, successCount: 0, conflicts409: 0, validationErrors: 0, dbErrors: 0 };
    }
    writes.byTenant[tid].total++;

    if (success) {
      writes.successCount++;
      writes.byTenant[tid].successCount++;
    } else {
      if (conflict || status === 409) {
        writes.conflicts409++;
        writes.byTenant[tid].conflicts409++;
      } else if (status === 400) {
        writes.validationErrors++;
        writes.byTenant[tid].validationErrors++;
      } else {
        writes.dbErrors++;
        writes.byTenant[tid].dbErrors++;
      }
    }

    const event = {
      timestamp: new Date().toISOString(),
      type: 'metric',
      subsystem: 'repository',
      op: 'write',
      latencyMs: Math.round(lat * 100) / 100,
      success: Boolean(success),
      conflict: Boolean(conflict),
      status: Number(status || 200),
      tenantId: tid,
      error: error || null
    };

    this._addRecentEvent(event);
    this.logStructured(event);
    return event;
  }

  /**
   * Retorna sumário de métricas agregadas
   */
  getMetrics({ tenantId = null, detail = false } = {}) {
    const authStats = this._calcStats(this.auth.latencies);
    const readStats = this._calcStats(this.repository.reads.latencies);
    const writeStats = this._calcStats(this.repository.writes.latencies);

    const snapshot = {
      timestamp: new Date().toISOString(),
      auth: {
        totalRequests: this.auth.totalRequests,
        successCount: this.auth.successCount,
        errorCount: this.auth.errorCount,
        errorsByType: { ...this.auth.errorsByType },
        latency: authStats,
        byTenant: tenantId ? (this.auth.byTenant[tenantId] || null) : { ...this.auth.byTenant }
      },
      repository: {
        reads: {
          total: this.repository.reads.total,
          cacheHits: this.repository.reads.cacheHits,
          dbReads: this.repository.reads.dbReads,
          errors: this.repository.reads.errors,
          latency: readStats,
          byTenant: tenantId ? (this.repository.reads.byTenant[tenantId] || null) : { ...this.repository.reads.byTenant }
        },
        writes: {
          total: this.repository.writes.total,
          successCount: this.repository.writes.successCount,
          conflicts409: this.repository.writes.conflicts409,
          validationErrors: this.repository.writes.validationErrors,
          dbErrors: this.repository.writes.dbErrors,
          latency: writeStats,
          byTenant: tenantId ? (this.repository.writes.byTenant[tenantId] || null) : { ...this.repository.writes.byTenant }
        }
      }
    };

    if (detail) {
      snapshot.recentEvents = tenantId
        ? this.recentEvents.filter(e => e.tenantId === tenantId)
        : [...this.recentEvents];
    }

    return snapshot;
  }
}

// Instância singleton padrão do coletor de métricas
const globalMetrics = new MetricsCollector({
  enableConsoleLog: process.env.ENABLE_METRICS_LOG !== 'false'
});

module.exports = {
  MetricsCollector,
  metrics: globalMetrics
};
