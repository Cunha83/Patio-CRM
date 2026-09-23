'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const net = require('node:net');

const { filterStateByRole, persistState, getState } = require('../lib/repository/stateRepository');
const { initDB, closeDB, run } = require('../db');
const userRepository = require('../lib/auth/userRepository');

test('RBAC: Blindagem Server-Side de Dados Financeiros e Preservação em Escrita Operacional', async (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'patio-rbac-proj-'));
  const dbPath = path.join(tempDir, 'test.db');
  process.env.DB_PATH = dbPath;
  process.env.NODE_ENV = 'test';

  await initDB();

  t.after(async () => {
    await closeDB().catch(() => {});
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}
  });

  const baseState = {
    versao: 1,
    os: [
      {
        id: 'os_sec_01',
        num: 5001,
        vei: 'v1',
        cli: 'c1',
        box: 'box_1',
        st: 'executando',
        queixa: 'Barulho na suspensão dianteira',
        total: 1850.00,
        desc: 50.00,
        orcamento: { total: 1850.00, status: 'aprovado' },
        servicos: [
          { id: 'srv_1', nome: 'Revisão Feixe de Molas', qtd: 1, valor: 850.00, custo: 300.00, concluido: false }
        ],
        pecas: [
          { id: 'pec_1', nome: 'Lâmina Mestra Scania', codigo: 'LAM-01', qtd: 2, valor: 500.00, custo: 250.00, venda: 500.00, margem: 50 }
        ]
      }
    ],
    servicos: [
      { id: 'srv_1', nome: 'Revisão Feixe de Molas', valor: 850.00, custo: 300.00, horas: 2 },
      { id: 'srv_2', nome: 'Alinhamento de Eixo', valor: 400.00, custo: 100.00, horas: 1 }
    ],
    pecas: [
      { id: 'pec_est_1', nome: 'Pastilha de Freio Wabco', codigo: 'WAB-10', qtd: 10, custo: 180.00, venda: 320.00, margem: 43.75 }
    ],
    quotations: [
      { id: 'quo_01', totalGeral: 2500.00, subtotal: 2500.00, itens: [{ id: 'it_1', valor: 1250.00, custo: 600.00 }] }
    ],
    partRequirements: [
      { id: 'req_1', pecaId: 'pec_est_1', qtd: 2, custoEstimado: 360.00, valorEstimado: 640.00 }
    ],
    laborEntries: [
      { id: 'lab_1', workerId: 'w1', horas: 3, valorHora: 80.00, custoHora: 35.00, total: 240.00 }
    ],
    financeiro: { faturamentoTotal: 50000.00, contas: [{ id: 'ct1', valor: 1850.00 }] }
  };

  await t.test('1. filterStateByRole: remove estritamente valores financeiros de OS, catálogo de serviços, quotations e apontamentos para mecânico', () => {
    const ctxMecanico = {
      tenantId: 'tenant_oficina',
      actorId: 'mecanico_joao',
      role: 'mecanico',
      permissions: ['os:read', 'os:write', 'inventory:read']
    };

    const filtrado = filterStateByRole(baseState, ctxMecanico);

    // Operacional preservado
    assert.equal(filtrado.os[0].id, 'os_sec_01');
    assert.equal(filtrado.os[0].num, 5001);
    assert.equal(filtrado.os[0].st, 'executando');
    assert.equal(filtrado.os[0].queixa, 'Barulho na suspensão dianteira');
    assert.equal(filtrado.os[0].servicos[0].nome, 'Revisão Feixe de Molas');
    assert.equal(filtrado.os[0].servicos[0].qtd, 1);
    assert.equal(filtrado.os[0].pecas[0].nome, 'Lâmina Mestra Scania');
    assert.equal(filtrado.os[0].pecas[0].qtd, 2);

    // Valores em OS estritamente omitidos
    assert.equal(filtrado.os[0].total, undefined, 'os[].total deve ser omitido para mecanico');
    assert.equal(filtrado.os[0].desc, undefined, 'os[].desc deve ser omitido para mecanico');
    assert.equal(filtrado.os[0].orcamento, undefined, 'os[].orcamento deve ser omitido para mecanico');
    assert.equal(filtrado.os[0].servicos[0].valor, undefined, 'os.servicos[].valor deve ser omitido');
    assert.equal(filtrado.os[0].servicos[0].custo, undefined, 'os.servicos[].custo deve ser omitido');
    assert.equal(filtrado.os[0].pecas[0].valor, undefined, 'os.pecas[].valor deve ser omitido');
    assert.equal(filtrado.os[0].pecas[0].custo, undefined, 'os.pecas[].custo deve ser omitido');
    assert.equal(filtrado.os[0].pecas[0].venda, undefined, 'os.pecas[].venda deve ser omitido');

    // Catálogo geral de serviços sem valores
    assert.equal(filtrado.servicos[0].nome, 'Revisão Feixe de Molas');
    assert.equal(filtrado.servicos[0].valor, undefined, 'catalogo servicos[].valor deve ser omitido');
    assert.equal(filtrado.servicos[0].custo, undefined, 'catalogo servicos[].custo deve ser omitido');

    // Orçamentos vazios para quem não tem permissão quotation:read
    assert.deepEqual(filtrado.quotations, [], 'quotations deve ser vazio para mecânico');

    // Peças do estoque sem preços/custos
    assert.equal(filtrado.pecas[0].custo, undefined, 'pecas do estoque[].custo deve ser omitido');
    assert.equal(filtrado.pecas[0].venda, undefined, 'pecas do estoque[].venda deve ser omitido');

    // Apontamentos e requisições sem valores monetários
    assert.equal(filtrado.partRequirements[0].custoEstimado, undefined);
    assert.equal(filtrado.partRequirements[0].valorEstimado, undefined);
    assert.equal(filtrado.laborEntries[0].valorHora, undefined);
    assert.equal(filtrado.laborEntries[0].total, undefined);
  });

  await t.test('2. filterStateByRole: preserva dados financeiros completos para gestor e financeiro', () => {
    const ctxGestor = {
      tenantId: 'tenant_oficina',
      actorId: 'gerente_maria',
      role: 'tenant_admin',
      permissions: ['*']
    };

    const filtradoGestor = filterStateByRole(baseState, ctxGestor);
    assert.equal(filtradoGestor.os[0].total, 1850.00);
    assert.equal(filtradoGestor.os[0].servicos[0].valor, 850.00);
    assert.equal(filtradoGestor.os[0].pecas[0].valor, 500.00);
    assert.equal(filtradoGestor.servicos[0].valor, 850.00);
    assert.equal(filtradoGestor.pecas[0].venda, 320.00);
    assert.equal(filtradoGestor.quotations[0].totalGeral, 2500.00);
  });

  await t.test('3. persistState: rejeita valores adversariais injetados em novos itens por operador sem permissão financeira', async () => {
    const tenantId = 'tenant_adversarial_test';
    const ctxAdmin = { tenantId, actorId: 'admin', role: 'admin', permissions: ['*'] };

    await persistState(ctxAdmin, { ...baseState, versao: 1 });

    const ctxMecanico = { tenantId, actorId: 'mec1', role: 'mecanico', permissions: ['os:read', 'os:write'] };
    const estadoLido = filterStateByRole(await getState(tenantId), ctxMecanico);

    // Mecânico tenta adicionar um serviço novo inventando valor: 99999 e custo: 88888
    const payloadAdversarial = {
      ...estadoLido,
      os: [
        {
          ...estadoLido.os[0],
          servicos: [
            ...estadoLido.os[0].servicos,
            {
              id: 'srv_hacked_novo',
              nome: 'Serviço Não Autorizado',
              qtd: 1,
              valor: 99999.00,
              custo: 88888.00
            }
          ],
          pecas: [
            ...estadoLido.os[0].pecas,
            {
              id: 'pec_hacked_nova',
              nome: 'Peça Injetada',
              codigo: 'HACK-01',
              qtd: 1,
              valor: 55555.00,
              custo: 44444.00,
              venda: 55555.00
            }
          ]
        },
        // Tentativa de injetar uma nova OS com total milionário
        {
          id: 'os_hacked_nova',
          num: 9999,
          vei: 'v1',
          cli: 'c1',
          box: 'box_1',
          st: 'fila',
          total: 1000000.00,
          orcamento: { total: 1000000.00 }
        }
      ]
    };

    const resPersist = await persistState(ctxMecanico, payloadAdversarial);
    assert.equal(resPersist.status, 200);

    const bancoAposAtaque = await getState(tenantId);
    const osOriginal = bancoAposAtaque.os.find(o => o.id === 'os_sec_01');
    const srvNovo = osOriginal.servicos.find(s => s.id === 'srv_hacked_novo');
    const pecNova = osOriginal.pecas.find(p => p.id === 'pec_hacked_nova');
    const osNova = bancoAposAtaque.os.find(o => o.id === 'os_hacked_nova');

    assert.equal(srvNovo.valor, undefined, 'Valor injetado em novo serviço NÃO pode ser aceito');
    assert.equal(srvNovo.custo, undefined, 'Custo injetado em novo serviço NÃO pode ser aceito');
    assert.equal(pecNova.valor, undefined, 'Valor injetado em nova peça NÃO pode ser aceito');
    assert.equal(pecNova.venda, undefined, 'Venda injetada em nova peça NÃO pode ser aceita');

    assert.equal(osNova.total, undefined, 'Total de nova OS injetada por mecânico deve ser omitido');
    assert.equal(osNova.orcamento, undefined, 'Orçamento de nova OS injetada por mecânico deve ser omitido');

    // E os valores originais da OS legítima permanecem 100% íntegros
    assert.equal(osOriginal.total, 1850.00);
    assert.equal(osOriginal.servicos[0].valor, 850.00);
  });

  await t.test('4. Requisições HTTP em servidor isolado: mecânico tem acesso bloqueado em rotas financeiras e POST /api/estado projeta resposta', async () => {
    const srvDir = fs.mkdtempSync(path.join(os.tmpdir(), 'patio-http-rbac-'));
    const srvDbPath = path.join(srvDir, 'server.db');
    const srvUploads = path.join(srvDir, 'uploads');
    fs.mkdirSync(srvUploads, { recursive: true });

    const prevDb = process.env.DB_PATH;
    process.env.DB_PATH = srvDbPath;
    await closeDB().catch(() => {});
    await initDB();

    const tenantId = 'oficina_http_proj';
    await userRepository.createUser({
      username: 'admin_test_http',
      password: 'AdminPassword123#',
      tenantId,
      role: 'tenant_admin',
      allowWeakInTest: true
    });

    await userRepository.createUser({
      username: 'mecanico_test_http',
      password: 'MecanicoPassword123#',
      tenantId,
      role: 'mecanico',
      allowWeakInTest: true
    });

    const ctxAdmin = { tenantId, actorId: 'admin_test_http', role: 'tenant_admin', permissions: ['*'] };
    await persistState(ctxAdmin, { ...baseState, versao: 1 });
    await closeDB().catch(() => {});

    const probe = net.createServer();
    probe.listen(0, '127.0.0.1');
    await once(probe, 'listening');
    const port = probe.address().port;
    await new Promise(r => probe.close(r));

    let childLogs = '';
    let spawnError = null;
    const child = spawn(process.execPath, ['server.js'], {
      cwd: path.resolve(__dirname, '..'),
      windowsHide: true,
      env: {
        ...process.env,
        PORT: String(port),
        DB_PATH: srvDbPath,
        UPLOAD_DIR: srvUploads,
        NODE_ENV: 'test',
        DISABLE_INTEGRATIONS: 'true'
      }
    });

    child.on('error', err => { spawnError = err; });
    child.stdout.on('data', d => { childLogs += d; });
    child.stderr.on('data', d => { childLogs += d; });

    try {
      let isReady = false;
      for (let i = 0; i < 150; i++) {
        if (child.exitCode !== null) throw new Error(`Servidor encerrou prematuramente (código ${child.exitCode}): ${childLogs}`);
        try {
          const r = await fetch(`http://127.0.0.1:${port}/ready`);
          if (r.status === 200) { isReady = true; break; }
        } catch (_) {}
        await new Promise(r => setTimeout(r, 100));
      }
      assert.ok(isReady, 'Servidor deve estar pronto em /ready');

      const adminAuth = 'Basic ' + Buffer.from('admin_test_http:AdminPassword123#').toString('base64');
      const mecAuth = 'Basic ' + Buffer.from('mecanico_test_http:MecanicoPassword123#').toString('base64');

      // 4.1 Mecânico chama /api/financeiro/dashboard -> HTTP 403
      const resDashMec = await fetch(`http://127.0.0.1:${port}/api/financeiro/dashboard`, {
        headers: { 'Authorization': mecAuth, 'x-tenant-id': tenantId }
      });
      assert.equal(resDashMec.status, 403, 'Mecanico deve receber 403 em /api/financeiro/dashboard');

      // 4.2 Mecânico chama /api/whatsapp/relatorio-preview -> HTTP 403
      const resRelMec = await fetch(`http://127.0.0.1:${port}/api/whatsapp/relatorio-preview`, {
        headers: { 'Authorization': mecAuth, 'x-tenant-id': tenantId }
      });
      assert.equal(resRelMec.status, 403, 'Mecanico deve receber 403 em /api/whatsapp/relatorio-preview');

      // 4.3 Mecânico consulta peças em /api/pecas -> sem custo ou valor de venda
      const resPecasMec = await fetch(`http://127.0.0.1:${port}/api/pecas`, {
        headers: { 'Authorization': mecAuth, 'x-tenant-id': tenantId }
      });
      assert.equal(resPecasMec.status, 200);
      const dataPecasMec = await resPecasMec.json();
      assert.ok(dataPecasMec.pecas.length > 0);
      assert.equal(dataPecasMec.pecas[0].custo, undefined, 'Custo da peça deve ser omitido para mecânico');
      assert.equal(dataPecasMec.pecas[0].venda, undefined, 'Venda da peça deve ser omitida para mecânico');

      // 4.4 Mecânico envia POST /api/estado -> resposta 200 com state projetado (sem vazamento do total reconciliado)
      const resGetMec = await fetch(`http://127.0.0.1:${port}/api/estado`, {
        headers: { 'Authorization': mecAuth, 'x-tenant-id': tenantId }
      });
      const dataMec = await resGetMec.json();
      dataMec.os[0].st = 'executando';

      const resPostMec = await fetch(`http://127.0.0.1:${port}/api/estado`, {
        method: 'POST',
        headers: { 'Authorization': mecAuth, 'x-tenant-id': tenantId, 'Content-Type': 'application/json' },
        body: JSON.stringify(dataMec)
      });
      assert.equal(resPostMec.status, 200);
      const resPostData = await resPostMec.json();

      // Confere que a resposta do POST NÃO vazou os valores reconciliados para o mecânico
      assert.equal(resPostData.state.os[0].total, undefined, 'Resposta do POST /api/estado não deve vazar total para mecânico');
      assert.equal(resPostData.state.os[0].servicos[0].valor, undefined, 'Resposta do POST /api/estado não deve vazar servicos[].valor');
    } finally {
      child.kill();
      await once(child, 'exit').catch(() => {});
      if (prevDb) process.env.DB_PATH = prevDb;
      try { fs.rmSync(srvDir, { recursive: true, force: true }); } catch (_) {}
    }
  });
});
