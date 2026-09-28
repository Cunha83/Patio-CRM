'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { calculateRoi } = require('./app.js');
const { createServer } = require('../../scripts/preview-jev.cjs');
const baseline = { calls: 1000, tokens: 2000, fx: 5, hour: 100, build: 24, maintenance: 2, minutes: 0, avoided: 0, extras: 0 };

test('ROI inclui engenharia e manutenção; token barato não implica retorno', () => {
  const r = calculateRoi(baseline);
  assert.equal(r.apiUSD, 0.084);
  assert.equal(r.apiBRL, 0.42000000000000004);
  assert.equal(r.initial, 2400);
  assert.equal(r.net, -200.42);
  assert.equal(r.payback, null);
  assert.ok(Math.abs(r.minutesForSixMonths - 360.252) < 1e-8);
});
test('ROI muda com ganho incremental, fallback e gasto evitado', () => {
  const r = calculateRoi({ ...baseline, minutes: 600, avoided: 20, extras: 100 });
  assert.ok(Math.abs(r.net - 719.58) < 1e-8);
  assert.ok(r.payback > 3 && r.payback < 4);
  assert.equal(calculateRoi({ ...baseline, calls: 0, build: 0, maintenance: 0 }).net, 0);
  assert.equal(calculateRoi({ ...baseline, build: 0, minutes: 600 }).payback, 0);
});
test('ROI recusa infinito, negativos, contexto excessivo e divisão por zero', () => {
  for (const patch of [{ hour: 0 }, { calls: -1 }, { fx: NaN }, { tokens: 64001 }, { extras: Infinity }]) {
    assert.throws(() => calculateRoi({ ...baseline, ...patch }));
  }
});
test('casos e prompts têm referências reais e critérios completos', () => {
  const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'analysis.json')));
  assert.equal(data.cases.length, 13);
  assert.equal(data.cases.filter(c => c.status === 'AGORA').length, 1);
  const root = path.resolve(__dirname, '../..');
  for (const c of data.cases) {
    for (const f of [...c.files, ...c.tests]) assert.ok(fs.existsSync(path.join(root, f)), f);
    for (const e of c.evidence) {
      const lines = fs.readFileSync(path.join(root, e.file), 'utf8').split(/\r?\n/);
      assert.ok(lines[e.line - 1].includes(e.needle), `${e.file}:${e.line}`);
    }
    for (const section of ['CRITÉRIOS DE ACEITE', 'OBSERVABILIDADE', 'FALLBACK E REVERSÃO']) assert.ok(c.prompt.includes(section), c.id);
    if (c.status === 'NÃO USAR') assert.ok(c.prompt.includes('não instale nem chame Jev'));
  }
});
test('preview serve somente assets declarados e não expõe arquivos do CRM', async t => {
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}`;
  const page = await fetch(url);
  assert.equal(page.status, 200);
  assert.ok(page.headers.get('content-security-policy').includes("frame-ancestors 'none'"));
  assert.ok((await page.text()).includes('Onde o Jev'));
  for (const file of ['/analysis.json', '/app.js', '/style.css', '/report.md', '/health']) {
    const response = await fetch(url + file);
    assert.equal(response.status, 200, file);
    await response.arrayBuffer();
  }
  for (const file of ['/.env', '/patio.db', '/server.js', '/analysis.cjs', '/%2e%2e%2fserver.js']) {
    const response = await fetch(url + file);
    assert.equal(response.status, 404, file); await response.text();
  }
  const rejected = await fetch(url, { method: 'POST' });
  assert.equal(rejected.status, 405); await rejected.text();
  const hostStatus = await new Promise((resolve, reject) => {
    http.get(url, { headers: { host: 'untrusted.example' } }, response => {
      response.resume(); response.on('end', () => resolve(response.statusCode));
    }).on('error', reject);
  });
  assert.equal(hostStatus, 403);
  const head = await fetch(url, { method: 'HEAD' });
  assert.equal(head.status, 200); assert.equal(await head.text(), '');
});
