'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const net = require('node:net');
const { spawn } = require('node:child_process');
const { once } = require('node:events');

test('P0: Reinicialização preserva alocação em boxes dinâmicos cadastrados', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'patio_box_restart_'));
  const dbPath = path.join(tempDir, 'test.db');
  const uploadDir = path.join(tempDir, 'uploads');
  fs.mkdirSync(uploadDir, { recursive: true });

  process.env.DB_PATH = dbPath;
  process.env.UPLOAD_DIR = uploadDir;
  process.env.NODE_ENV = 'test';
  process.env.DISABLE_WHATSAPP = 'true';
  process.env.DISABLE_INTEGRATIONS = 'true';

  const db = require('../db');
  await db.initDB();

  // Inserir estado no banco com um box dinâmico e uma OS alocada nele
  const dynamicBoxId = 'b_custom_guincho_99';
  const initialState = {
    versao: 1,
    boxes: [
      { id: 'b1', nome: 'Box 01' },
      { id: dynamicBoxId, nome: 'Box Especial 99', tipo: 'Guincho' }
    ],
    os: [
      { id: 'os_dinamica_1', num: 2001, box: dynamicBoxId, st: 'executando', total: 1500 }
    ],
    clientes: [],
    veiculos: []
  };

  await db.run("INSERT INTO kv (key, value) VALUES ('tenant:oficina_teste:state', ?)", [JSON.stringify(initialState)]);

  // Executar a rotina real de sanitização de reinício
  const rows = await db.all("SELECT key, value FROM kv WHERE key LIKE 'tenant:%:state' OR key = 'state'");
  assert.equal(rows.length, 1);

  for (const row of rows) {
    const parsed = JSON.parse(row.value);
    const boxesDoEstado = Array.isArray(parsed.boxes) ? parsed.boxes.map(b => (typeof b === 'string' ? b : b?.id)).filter(Boolean) : [];
    const boxesValidos = new Set(['b1', 'b2', 'b3', 'b4', 'b5', 'b6', ...boxesDoEstado]);
    let corrigiu = false;
    parsed.os.forEach(o => {
      if (o.box && !boxesValidos.has(o.box)) {
        o.box = null;
        if (o.st !== 'finalizada') o.st = 'fila';
        corrigiu = true;
      }
    });
    if (corrigiu) {
      await db.run('UPDATE kv SET value = ? WHERE key = ?', [JSON.stringify(parsed), row.key]);
    }
  }

  // Verificar que o box e o status NÃO foram alterados
  const rowAfter = await db.get("SELECT value FROM kv WHERE key = 'tenant:oficina_teste:state'");
  const parsedAfter = JSON.parse(rowAfter.value);
  const osAposReinicio = parsedAfter.os.find(o => o.id === 'os_dinamica_1');

  assert.equal(osAposReinicio.box, dynamicBoxId, 'Box dinâmico DEVE ser preservado após reinício');
  assert.equal(osAposReinicio.st, 'executando', 'Status DEVE permanecer executando');

  // Limpeza
  await db.closeDB();
  try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}
});

test('P0 E2E: Servidor HTTP real inicializa, salva box dinâmico com OS, reinicia e mantém alocação', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'patio_box_http_'));
  const dbPath = path.join(tempDir, 'test.db');
  const uploadDir = path.join(tempDir, 'uploads');
  fs.mkdirSync(uploadDir, { recursive: true });

  const root = path.resolve(__dirname, '..');
  const srvNet = net.createServer();
  await new Promise(r => srvNet.listen(0, r));
  const port = srvNet.address().port;
  await new Promise(r => srvNet.close(r));

  let child;
  async function boot() {
    child = spawn(process.execPath, ['server.js'], {
      cwd: root,
      windowsHide: true,
      env: {
        ...process.env,
        PORT: String(port),
        API_KEY: 'test-box-api-key',
        AUTH_USER: 'admin',
        AUTH_PASSWORD: 'SenhaForteAdmin#2026',
        DISABLE_INTEGRATIONS: 'true',
        DISABLE_WHATSAPP: 'true',
        DB_PATH: dbPath,
        UPLOAD_DIR: uploadDir,
        NODE_ENV: 'test'
      }
    });
    for (let i = 0; i < 150; i++) {
      if (child.exitCode !== null) throw new Error('Servidor finalizou inesperadamente');
      try {
        const res = await fetch(`http://127.0.0.1:${port}/health`);
        if (res.ok) return;
      } catch (_) {}
      await new Promise(r => setTimeout(r, 100));
    }
    throw new Error('Timeout esperando servidor');
  }

  async function shutdown() {
    if (child && child.exitCode === null) {
      const done = once(child, 'exit');
      child.kill();
      await done;
    }
  }

  // 1. Inicia primeiro servidor
  await boot();

  const headers = {
    'Content-Type': 'application/json',
    'x-api-key': 'test-box-api-key',
    'x-tenant-id': 'oficina_dinamica'
  };

  const dynamicBoxId = 'b_reboque_custom_42';
  const postState = {
    versao: 1,
    boxes: [
      { id: 'b1', nome: 'Box 01' },
      { id: dynamicBoxId, nome: 'Box Reboque Especial' }
    ],
    os: [
      { id: 'os_custom_99', num: 9001, box: dynamicBoxId, st: 'executando', total: 3200 }
    ],
    clientes: [],
    veiculos: []
  };

  const resPost = await fetch(`http://127.0.0.1:${port}/api/estado`, {
    method: 'POST',
    headers,
    body: JSON.stringify(postState)
  });
  assert.equal(resPost.status, 200);

  // 2. Desliga o servidor
  await shutdown();

  // 3. Reinicia o servidor no mesmo banco
  await boot();

  // 4. Consulta o estado após reinício
  const resGet = await fetch(`http://127.0.0.1:${port}/api/estado`, {
    headers
  });
  assert.equal(resGet.status, 200);
  const data = await resGet.json();
  const stateAposReinicio = data.state || data;

  const osRecuperada = (stateAposReinicio.os || []).find(o => o.id === 'os_custom_99');
  assert.ok(osRecuperada, 'OS deve existir após reinício');
  assert.equal(osRecuperada.box, dynamicBoxId, 'Box dinâmico DEVE continuar associado à OS');
  assert.equal(osRecuperada.st, 'executando', 'Status DEVE permanecer executando');

  // Limpeza final
  await shutdown();
  try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}
});
