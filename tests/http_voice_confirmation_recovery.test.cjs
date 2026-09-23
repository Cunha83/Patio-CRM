'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const net = require('node:net');

test('P1: Recuperação Pós-Falha de Persistência, Retentativa e Concorrência de Token em /api/comando-voz', { timeout: 120000 }, async (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'patio-voice-recovery-'));
  const dbPath = path.join(tempDir, 'test_recovery.db');
  const uploadDir = path.join(tempDir, 'uploads');
  const backupDir = path.join(tempDir, 'backups');
  const failFlag = path.join(tempDir, 'fail_sqlite.flag');
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
    const proc = spawn(process.execPath, [
      '-e',
      `
      const fs = require('fs');
      const db = require('./db');
      const origRun = db.run;
      const flag = process.env.FAIL_FLAG_PATH;
      db.run = function(sql, params) {
        if (flag && fs.existsSync(flag) && typeof sql === 'string' && (sql.includes('INSERT INTO kv') || sql.includes('UPDATE kv') || sql.includes('kv'))) {
          return Promise.reject(new Error('SQLITE_IOERR: falha de disco simulada'));
        }
        return origRun.call(this, sql, params);
      };
      require('./server');
      `
    ], {
      cwd: root,
      windowsHide: true,
      env: {
        ...process.env,
        PORT: String(port),
        API_KEY: 'test-recovery-key',
        AUTH_USER: 'test_admin',
        AUTH_PASSWORD: 'PasswordTestAdmin123#',
        DB_PATH: dbPath,
        UPLOAD_DIR: uploadDir,
        BACKUP_DIR: backupDir,
        FAIL_FLAG_PATH: failFlag,
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
    if (fs.existsSync(failFlag)) {
      try { fs.unlinkSync(failFlag); } catch (_) {}
    }
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
    'x-api-key': 'test-recovery-key',
    'Content-Type': 'application/json',
    'x-tenant-id': 'default'
  };

  await t.test('1. Falha de escrita na confirmação textual NÃO consome o token e permite repetição bem-sucedida', async () => {
    // 1.1 Criar uma OS diretamente no estado
    const initRes = await fetch(`http://127.0.0.1:${port}/api/estado`, {
      method: 'GET',
      headers: authHeaders
    });
    const initState = await initRes.json();
    initState.os = [{
      id: 'os_critica_101',
      num: '101',
      vei: 'v1',
      cli: 'c1',
      st: 'executando',
      queixa: 'Revisão geral',
      pecas: [],
      servicos: []
    }];
    initState.veiculos = [{ id: 'v1', cli: 'c1', placa: 'ABC1234', modelo: 'Constellation' }];
    initState.clientes = [{ id: 'c1', nome: 'Transportes Brasil' }];

    const putRes = await fetch(`http://127.0.0.1:${port}/api/estado`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify(initState)
    });
    assert.equal(putRes.status, 200);

    // 1.2 Solicitar exclusão da OS via /api/comando-voz (ação crítica -> exige confirmação)
    const voiceRes = await fetch(`http://127.0.0.1:${port}/api/comando-voz`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ texto: 'excluir a OS 101' })
    });
    assert.equal(voiceRes.status, 200);
    const voiceData = await voiceRes.json();
    assert.equal(voiceData.success, true);
    assert.equal(voiceData.pendenteConfirmacao, true, 'Deve exigir confirmação para exclusão de OS');
    assert.ok(voiceData.token, 'Deve retornar token criptográfico de confirmação');
    const token = voiceData.token;

    // 1.3 Injetar falha de escrita no SQLite
    fs.writeFileSync(failFlag, 'fail', 'utf8');

    // 1.4 Confirmar via comando textual { texto: "confirmar" } em /api/comando-voz
    const confirmFailRes = await fetch(`http://127.0.0.1:${port}/api/comando-voz`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ texto: 'confirmar', token })
    });

    // Deve falhar (500 ou 409 de PersistenceError)
    assert.ok([409, 500].includes(confirmFailRes.status), `Confirmação sob falha de disco deve retornar erro 409/500 (recebido: ${confirmFailRes.status})`);

    // 1.5 Verificar que a OS 101 NÃO foi excluída do SQLite
    const stateFailRes = await fetch(`http://127.0.0.1:${port}/api/estado`, {
      method: 'GET',
      headers: authHeaders
    });
    const stateFail = await stateFailRes.json();
    const osPresente = (stateFail.os || []).some(o => o.id === 'os_critica_101');
    assert.ok(osPresente, 'OS 101 não deve ter sido excluída devido à falha de escrita');

    // 1.6 Remover a falha de escrita
    fs.unlinkSync(failFlag);

    // 1.7 Repetir a confirmação utilizando o MESMO TOKEN no endpoint dedicado /api/comando-voz/confirmar
    const retryRes = await fetch(`http://127.0.0.1:${port}/api/comando-voz/confirmar`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ token })
    });

    assert.equal(retryRes.status, 200, `Retentativa com o mesmo token deve suceder após remoção da falha (recebido: ${retryRes.status})`);
    const retryData = await retryRes.json();
    assert.equal(retryData.success, true);

    // 1.8 Verificar que a OS 101 agora foi excluída com sucesso
    const stateFinalRes = await fetch(`http://127.0.0.1:${port}/api/estado`, {
      method: 'GET',
      headers: authHeaders
    });
    const stateFinal = await stateFinalRes.json();
    const osExcluida = !(stateFinal.os || []).some(o => o.id === 'os_critica_101');
    assert.ok(osExcluida, 'OS 101 deve ter sido excluída duravelmente após o sucesso da retentativa');

    // 1.9 Terceira tentativa com o mesmo token DEVE ser rejeitada com HTTP 400 (anti-replay)
    const thirdRes = await fetch(`http://127.0.0.1:${port}/api/comando-voz/confirmar`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ token })
    });
    assert.equal(thirdRes.status, 400, 'Terceira tentativa com token já utilizado deve retornar HTTP 400');
    const thirdData = await thirdRes.json();
    assert.equal(thirdData.ok, false);
    assert.ok(thirdData.resposta.includes('já utilizado') || thirdData.error.includes('já utilizado'));
  });

  await t.test('2. Confirmações concorrentes com o mesmo token resultam em exatamente 1 sucesso e 4 rejeições', async () => {
    // 2.1 Criar uma nova OS para testar concorrência
    const initRes = await fetch(`http://127.0.0.1:${port}/api/estado`, {
      method: 'GET',
      headers: authHeaders
    });
    const state = await initRes.json();
    state.os = [{
      id: 'os_concorrente_202',
      num: '202',
      vei: 'v1',
      cli: 'c1',
      st: 'executando',
      queixa: 'Teste concorrência',
      pecas: [],
      servicos: []
    }];
    await fetch(`http://127.0.0.1:${port}/api/estado`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify(state)
    });

    // 2.2 Solicitar exclusão para gerar token
    const voiceRes = await fetch(`http://127.0.0.1:${port}/api/comando-voz`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ texto: 'excluir a OS 202' })
    });
    const voiceData = await voiceRes.json();
    const token = voiceData.token;
    assert.ok(token);

    // 2.3 Disparar 5 confirmações simultâneas com o MESMO token
    const promessas = Array.from({ length: 5 }).map((_, i) => {
      // Alternar entre /api/comando-voz com texto e /api/comando-voz/confirmar
      const isDedicado = i % 2 === 0;
      if (isDedicado) {
        return fetch(`http://127.0.0.1:${port}/api/comando-voz/confirmar`, {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify({ token })
        }).then(async r => ({ status: r.status, data: await r.json() }));
      } else {
        return fetch(`http://127.0.0.1:${port}/api/comando-voz`, {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify({ texto: 'confirmar', token })
        }).then(async r => ({ status: r.status, data: await r.json() }));
      }
    });

    const resultados = await Promise.all(promessas);
    const sucessos = resultados.filter(r => r.status === 200 && r.data.success);
    const falhas = resultados.filter(r => r.status !== 200 || !r.data.success);

    assert.equal(sucessos.length, 1, `Exatamente 1 confirmação deve ter sucesso (encontrados: ${sucessos.length})`);
    assert.equal(falhas.length, 4, `Exatamente 4 confirmações devem ser rejeitadas (encontradas: ${falhas.length})`);

    // 2.4 Verificar que a OS 202 foi excluída do estado
    const checkRes = await fetch(`http://127.0.0.1:${port}/api/estado`, {
      method: 'GET',
      headers: authHeaders
    });
    const checkState = await checkRes.json();
    const osAindaExiste = (checkState.os || []).some(o => o.id === 'os_concorrente_202');
    assert.equal(osAindaExiste, false, 'OS 202 deve estar excluída');
  });

  await t.test('3. Isolamento: operador de outro tenant ou usuário divergente é bloqueado', async () => {
    // 3.1 Criar OS para gerar token no tenant default
    const voiceRes = await fetch(`http://127.0.0.1:${port}/api/comando-voz`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ texto: 'excluir a OS 999' })
    });
    const voiceData = await voiceRes.json();
    const token = voiceData.token;

    // 3.2 Tentativa de confirmação a partir de outro tenant
    const crossTenantHeaders = {
      ...authHeaders,
      'x-tenant-id': 'tenant_intruso'
    };
    const crossRes = await fetch(`http://127.0.0.1:${port}/api/comando-voz/confirmar`, {
      method: 'POST',
      headers: crossTenantHeaders,
      body: JSON.stringify({ token })
    });
    assert.ok([400, 403].includes(crossRes.status), 'Confirmação de outro tenant deve ser rejeitada');
    const crossData = await crossRes.json();
    assert.equal(crossData.ok, false);
  });
});
