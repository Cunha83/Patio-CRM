'use strict';

/**
 * Pátio CRM — Benchmark de Carga Sintética para Piloto
 * Simula 5 oficinas/tenants, requisições concorrentes, abertura de pátio,
 * leituras, gravações, e mede p50, p95, uso de memória e conflitos.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { performance } = require('perf_hooks');
const { initDB, closeDB } = require('../db');
const { createWriteQueue } = require('../lib/core');
const { getState, persistState, mutateState, getDefaultState } = require('../lib/repository/stateRepository');

function calculatePercentiles(latencies) {
  if (latencies.length === 0) return { p50: 0, p95: 0, min: 0, max: 0, avg: 0 };
  const sorted = [...latencies].sort((a, b) => a - b);
  const p50 = sorted[Math.floor(sorted.length * 0.5)];
  const p95 = sorted[Math.floor(sorted.length * 0.95)];
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const sum = sorted.reduce((acc, v) => acc + v, 0);
  const avg = sum / sorted.length;
  return {
    p50: Number(p50.toFixed(2)),
    p95: Number(p95.toFixed(2)),
    min: Number(min.toFixed(2)),
    max: Number(max.toFixed(2)),
    avg: Number(avg.toFixed(2))
  };
}

async function runBenchmark() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'patio-pilot-benchmark-'));
  const dbPath = path.join(tempDir, 'benchmark.db');
  process.env.DB_PATH = dbPath;
  await initDB(dbPath);

  const enqueueWrite = createWriteQueue();

  const NUM_TENANTS = 5;
  const TOTAL_OPERATIONS_PER_TENANT = 20; // 100 total operations
  const CONCURRENCY_BATCH = 10;

  const readLatencies = [];
  const writeLatencies = [];
  const payloadSizes = [];
  let conflicts = 0;
  let successes = 0;
  let errors = 0;

  const memBefore = process.memoryUsage();

  console.log('--- Iniciando Carga Sintética do Piloto ---');
  console.log(`Tenants: ${NUM_TENANTS} | Operações por Tenant: ${TOTAL_OPERATIONS_PER_TENANT} | Concorrência: ${CONCURRENCY_BATCH}`);

  // 1. Inicializar estados dos tenants
  for (let i = 1; i <= NUM_TENANTS; i++) {
    const tid = `oficina_piloto_${i}`;
    const ctx = { tenantId: tid, actorId: 'admin', role: 'admin', permissions: ['*'], channel: 'internal' };
    const st = getDefaultState(tid);
    st.clientes = [
      { id: `c_${i}_1`, nome: `Transportadora Rápida ${i}`, fone: `119999000${i}` }
    ];
    st.veiculos = [
      { id: `v_${i}_1`, placa: `PIL000${i}`, cli: `c_${i}_1`, modelo: 'Scania R 450' }
    ];
    st.os = [];
    st.boxes = [
      { id: 'b1', nome: 'Box 1 - Mecânica Pesada' },
      { id: 'b2', nome: 'Box 2 - Alinhamento' },
      { id: 'b3', nome: 'Box 3 - Molas e Suspensão' }
    ];
    await persistState(ctx, st, { enqueueWrite, force: true });
  }

  const tTotalStart = performance.now();

  // 2. Executar ciclo misto de leitura e escrita atômica com concorrência
  const tasks = [];
  for (let op = 0; op < TOTAL_OPERATIONS_PER_TENANT; op++) {
    for (let t = 1; t <= NUM_TENANTS; t++) {
      const tenantId = `oficina_piloto_${t}`;
      const context = {
        tenantId,
        actorId: `op_${op % 3}`,
        role: 'admin',
        permissions: ['*'],
        channel: 'internal'
      };

      tasks.push(async () => {
        // Leitura de estado
        const tRead0 = performance.now();
        const current = await getState(tenantId);
        const tReadMs = performance.now() - tRead0;
        readLatencies.push(tReadMs);

        // Mutação Atômica: inserção de OS ou item
        const tWrite0 = performance.now();
        const resMutate = await mutateState(context, async (draft) => {
          const osId = `os_${tenantId}_${op}`;
          draft.os.unshift({
            id: osId,
            num: String(1000 + draft.os.length + 1),
            cli: draft.clientes[0].id,
            vei: draft.veiculos[0].id,
            box: 'b1',
            st: 'executando',
            servicos: [{ id: 'srv_1', nome: 'Troca de Feixe de Molas', valor: 350, qtd: 1 }],
            pecas: [{ id: 'pec_1', nome: 'Lâmina Mestra 14mm', valor: 480, qtd: 2 }],
            total: 1310,
            criadoEm: Date.now()
          });
        }, { enqueueWrite });

        const tWriteMs = performance.now() - tWrite0;
        writeLatencies.push(tWriteMs);

        if (resMutate.ok) {
          successes++;
          const jsonStr = JSON.stringify(resMutate.state);
          payloadSizes.push(Buffer.byteLength(jsonStr, 'utf8'));
        } else if (resMutate.conflict) {
          conflicts++;
        } else {
          errors++;
        }
      });
    }
  }

  // Executar tarefas em lotes de concorrência
  for (let i = 0; i < tasks.length; i += CONCURRENCY_BATCH) {
    const batch = tasks.slice(i, i + CONCURRENCY_BATCH);
    await Promise.all(batch.map(fn => fn()));
  }

  const tTotalMs = performance.now() - tTotalStart;
  const memAfter = process.memoryUsage();

  await enqueueWrite(() => closeDB());
  fs.rmSync(tempDir, { recursive: true, force: true });

  const readMetrics = calculatePercentiles(readLatencies);
  const writeMetrics = calculatePercentiles(writeLatencies);
  const avgPayloadKb = (payloadSizes.reduce((a, b) => a + b, 0) / payloadSizes.length / 1024).toFixed(2);

  const report = {
    totalOperations: tasks.length,
    successes,
    conflicts,
    errors,
    totalDurationMs: Number(tTotalMs.toFixed(2)),
    throughputOpsPerSec: Number(((tasks.length / tTotalMs) * 1000).toFixed(2)),
    readMetricsMs: readMetrics,
    writeMetricsMs: writeMetrics,
    averagePayloadKb: Number(avgPayloadKb),
    memoryMb: {
      rssDeltaMb: Number(((memAfter.rss - memBefore.rss) / (1024 * 1024)).toFixed(2)),
      heapUsedDeltaMb: Number(((memAfter.heapUsed - memBefore.heapUsed) / (1024 * 1024)).toFixed(2)),
      finalHeapUsedMb: Number((memAfter.heapUsed / (1024 * 1024)).toFixed(2))
    }
  };

  console.log('\n=== RESULTADO DO BENCHMARK DE PILOTO ===');
  console.log(JSON.stringify(report, null, 2));

  // Salva evidência formal
  const evidenciasDir = path.resolve(__dirname, '..', 'docs', 'evidencias');
  if (!fs.existsSync(evidenciasDir)) fs.mkdirSync(evidenciasDir, { recursive: true });
  fs.writeFileSync(
    path.join(evidenciasDir, 'benchmark_piloto_2026-09-21.json'),
    JSON.stringify(report, null, 2),
    'utf8'
  );
  console.log('\nEvidência gravada em docs/evidencias/benchmark_piloto_2026-09-21.json');
}

runBenchmark().catch(err => {
  console.error('Erro no benchmark:', err);
  process.exit(1);
});
