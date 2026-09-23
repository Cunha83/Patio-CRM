'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const net = require('node:net');

test('P0: Concorrência HTTP Real em Domínio (Peças, Apontamentos e Cruzada)', { timeout: 90000 }, async (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'patio-concurrency-domain-'));
  const dbPath = path.join(tempDir, 'test_domain.db');
  const uploadDir = path.join(tempDir, 'uploads');
  const backupDir = path.join(tempDir, 'backups');
  fs.mkdirSync(uploadDir, { recursive: true });
  fs.mkdirSync(backupDir, { recursive: true });

  const root = path.resolve(__dirname, '..');
  let child;
  let port;

  async function getFreePort() {
    const s = net.createServer();
    s.listen(0, '127.0.0.1');
    await once(s, 'listening');
    const p = s.address().port;
    await new Promise(r => s.close(r));
    return p;
  }

  async function spawnServer() {
    port = await getFreePort();
    let childLogs = '';
    const proc = spawn(process.execPath, ['server.js'], {
      cwd: root,
      windowsHide: true,
      env: {
        ...process.env,
        PORT: String(port),
        API_KEY: 'test-concurrency-key',
        AUTH_USER: 'test_admin',
        AUTH_PASSWORD: 'PasswordTestAdmin123#',
        DB_PATH: dbPath,
        UPLOAD_DIR: uploadDir,
        BACKUP_DIR: backupDir,
        DISABLE_INTEGRATIONS: 'true',
        DISABLE_WHATSAPP: 'true',
        NODE_ENV: 'test'
      }
    });

    proc.stdout.on('data', d => { childLogs += d; });
    proc.stderr.on('data', d => { childLogs += d; });

    const deadline = Date.now() + 30000;
    let ready = false;
    while (Date.now() < deadline) {
      if (proc.exitCode !== null) {
        throw new Error(`Servidor encerrou prematuramente (${proc.exitCode}): ${childLogs.slice(0, 500)}`);
      }
      try {
        const res = await fetch(`http://127.0.0.1:${port}/ready`);
        if (res.status === 200) {
          ready = true;
          break;
        }
      } catch (_) {}
      await new Promise(r => setTimeout(r, 100));
    }

    if (!ready) {
      proc.kill();
      throw new Error(`Timeout aguardando servidor na porta ${port}. Logs: ${childLogs.slice(0, 500)}`);
    }

    return proc;
  }

  async function killServer(proc) {
    if (proc && proc.exitCode === null) {
      const exitPromise = once(proc, 'exit');
      proc.kill();
      await exitPromise.catch(() => {});
    }
  }

  child = await spawnServer();

  t.after(async () => {
    await killServer(child);
    for (let i = 0; i < 5; i++) {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
        break;
      } catch (_) {
        await new Promise(r => setTimeout(r, 150));
      }
    }
  });

  const authHeaders = {
    'Authorization': 'Basic ' + Buffer.from('test_admin:PasswordTestAdmin123#').toString('base64'),
    'x-api-key': 'test-concurrency-key',
    'Content-Type': 'application/json',
    'x-tenant-id': 'default'
  };

  await t.test('1. 10 cadastros simultâneos de peças em /api/pecas persistem integralmente', async () => {
    const TOTAL = 10;
    const postPromises = Array.from({ length: TOTAL }).map((_, i) => {
      const idx = String(i + 1).padStart(2, '0');
      return fetch(`http://127.0.0.1:${port}/api/pecas`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          codigoInterno: `PEC-CONC-${idx}`,
          descricao: `Peça Concorrente ${idx}`,
          fabricante: 'Fabricante Teste',
          unidadeMedida: 'UN',
          estoqueMinimo: 5,
          estoqueMaximo: 50,
          localizacaoFisica: `Gaveta ${idx}`,
          precoVenda: 150.00
        })
      }).then(async res => ({
        status: res.status,
        data: await res.json()
      }));
    });

    const responses = await Promise.all(postPromises);
    for (let i = 0; i < TOTAL; i++) {
      const r = responses[i];
      assert.ok([200, 201].includes(r.status), `Peça ${i + 1} status deve ser 200/201 (recebido: ${r.status})`);
      assert.equal(r.data.success, true);
      assert.ok(r.data.part && r.data.part.id);
    }

    const getRes = await fetch(`http://127.0.0.1:${port}/api/pecas`, {
      method: 'GET',
      headers: authHeaders
    });
    assert.equal(getRes.status, 200);
    const getData = await getRes.json();
    assert.equal(getData.success, true);
    assert.equal(getData.pecas.length, TOTAL, `Exatamente ${TOTAL} peças devem estar presentes`);
  });

  await t.test('2. 10 colaboradores e 10 apontamentos simultâneos persistem sem perda', async () => {
    const TOTAL = 10;

    // 1. Seed de uma OS executando com serviço aprovado
    const estRes = await fetch(`http://127.0.0.1:${port}/api/estado`, { headers: authHeaders });
    const estData = await estRes.json();
    const currentState = estData.state || {};
    currentState.os = currentState.os || [];
    currentState.os.push({
      id: 'os_conc_100',
      tenantId: 'default',
      num: 1001,
      st: 'executando',
      servicos: [
        { id: 'srv_1', nome: 'Alinhamento Geral', autorizado: true, status: 'aprovado' }
      ]
    });
    const payload = {
      ...currentState,
      versao: estData.versao
    };
    const seedSaveRes = await fetch(`http://127.0.0.1:${port}/api/estado`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify(payload)
    });
    const seedSaveData = await seedSaveRes.json();
    assert.equal(seedSaveRes.status, 200, `Seed da OS deve retornar 200: ${JSON.stringify(seedSaveData)}`);

    // 2. Criação simultânea de 10 colaboradores
    const workerPromises = Array.from({ length: TOTAL }).map((_, i) => {
      const idx = String(i + 1).padStart(2, '0');
      return fetch(`http://127.0.0.1:${port}/api/equipe`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          id: `mec_conc_${idx}`,
          nome: `Mecânico Concorrente ${idx}`,
          funcao: 'Mecânico',
          jornadaHorasDia: 8
        })
      }).then(async res => ({
        status: res.status,
        data: await res.json()
      }));
    });

    const workerResponses = await Promise.all(workerPromises);
    for (let i = 0; i < TOTAL; i++) {
      const r = workerResponses[i];
      assert.ok([200, 201].includes(r.status), `Colaborador ${i + 1} status deve ser 200/201 (recebido: ${r.status})`);
      assert.equal(r.data.success, true);
    }

    const equipeGet = await fetch(`http://127.0.0.1:${port}/api/equipe`, { headers: authHeaders }).then(r => r.json());
    assert.equal(equipeGet.success, true);
    assert.ok(equipeGet.colaboradores.length >= TOTAL, `Deve conter pelo menos ${TOTAL} colaboradores`);

    // 3. 10 apontamentos de tempo simultâneos (um para cada mecânico)
    const postPromises = Array.from({ length: TOTAL }).map((_, i) => {
      const idx = String(i + 1).padStart(2, '0');
      return fetch(`http://127.0.0.1:${port}/api/apontamentos/iniciar`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          workerId: `mec_conc_${idx}`,
          osId: 'os_conc_100',
          serviceItemId: 'srv_1',
          boxId: 'box_01',
          type: 'produtivo',
          source: 'web'
        })
      }).then(async res => ({
        status: res.status,
        data: await res.json()
      }));
    });

    const responses = await Promise.all(postPromises);
    for (let i = 0; i < TOTAL; i++) {
      const r = responses[i];
      assert.ok([200, 201].includes(r.status), `Apontamento ${i + 1} status deve ser 200/201 (recebido: ${r.status} - ${JSON.stringify(r.data)})`);
      assert.equal(r.data.success, true);
      assert.ok(r.data.entry && r.data.entry.id);
    }

    const getRes = await fetch(`http://127.0.0.1:${port}/api/apontamentos`, {
      method: 'GET',
      headers: authHeaders
    });
    assert.equal(getRes.status, 200);
    const getData = await getRes.json();
    assert.equal(getData.success, true);
    assert.equal(getData.apontamentos.length, TOTAL, `Exatamente ${TOTAL} apontamentos devem estar presentes`);
  });

  await t.test('3. Operações concorrentes cruzadas no mesmo tenant (fornecedor + peça + colaborador)', async () => {
    const promises = [
      fetch(`http://127.0.0.1:${port}/api/fornecedores`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          razaoSocial: 'Fornecedor Cruzado 1',
          nome: 'Cruzado 1',
          documento: '99.888.777/0001-11'
        })
      }).then(async res => ({ type: 'fornecedor', status: res.status, data: await res.json() })),

      fetch(`http://127.0.0.1:${port}/api/pecas`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          codigoInterno: 'PEC-CRUZADA-1',
          descricao: 'Peça Cruzada 1',
          precoVenda: 250.00
        })
      }).then(async res => ({ type: 'peca', status: res.status, data: await res.json() })),

      fetch(`http://127.0.0.1:${port}/api/equipe`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          id: 'mec_cruzado_1',
          nome: 'Mecânico Cruzado 1',
          funcao: 'Eletricista'
        })
      }).then(async res => ({ type: 'colaborador', status: res.status, data: await res.json() }))
    ];

    const results = await Promise.all(promises);
    for (const r of results) {
      assert.ok([200, 201].includes(r.status), `${r.type} deve retornar 200/201 (recebido: ${r.status})`);
      assert.equal(r.data.success, true);
    }

    // Reinicia o servidor para conferir durabilidade de todas as entidades cruzadas
    await killServer(child);
    child = await spawnServer();

    const [fornCheck, pecaCheck, equipeCheck] = await Promise.all([
      fetch(`http://127.0.0.1:${port}/api/fornecedores`, { headers: authHeaders }).then(r => r.json()),
      fetch(`http://127.0.0.1:${port}/api/pecas`, { headers: authHeaders }).then(r => r.json()),
      fetch(`http://127.0.0.1:${port}/api/equipe`, { headers: authHeaders }).then(r => r.json())
    ]);

    assert.equal(fornCheck.success, true);
    assert.ok(fornCheck.fornecedores.some(f => f.nome === 'Cruzado 1'));

    assert.equal(pecaCheck.success, true);
    assert.ok(pecaCheck.pecas.some(p => p.codigoInterno === 'PEC-CRUZADA-1'));

    assert.equal(equipeCheck.success, true);
    assert.ok(equipeCheck.colaboradores.some(c => c.nome === 'Mecânico Cruzado 1'));
  });
});
