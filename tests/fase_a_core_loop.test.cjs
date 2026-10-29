'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');

test('Fase A: Validação do Core Loop, White-Label e Persistência Real', { timeout: 120000 }, async t => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'patio-fase-a-'));
  const probe = net.createServer();
  probe.listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const port = probe.address().port;
  await new Promise(r => probe.close(r));
  const root = path.resolve(__dirname, '..');

  let logs = '';
  let child;

  async function start() {
    child = spawn(process.execPath, ['server.js'], {
      cwd: root,
      windowsHide: true,
      env: {
        ...process.env,
        PORT: String(port),
        API_KEY: 'test-fase-a-key',
        GEMINI_API_KEY: '',
        DISABLE_INTEGRATIONS: 'true',
        DB_PATH: path.join(temp, 'test.db')
      }
    });

    child.stdout.on('data', d => { logs += d; });
    child.stderr.on('data', d => { logs += d; });

    for (let i = 0; i < 500; i++) {
      if (child.exitCode !== null) throw Error('Processo terminou prematuramente: ' + logs);
      try {
        const res = await fetch(`http://127.0.0.1:${port}/ready`);
        if (res.status === 200 || res.status === 401) return;
      } catch (_) {}
      await new Promise(r => setTimeout(r, 100));
    }
    throw Error('Servidor não iniciou: ' + logs);
  }

  async function stop() {
    if (child && child.exitCode === null) {
      const done = once(child, 'exit');
      child.kill();
      await done;
    }
  }

  t.after(async () => {
    await stop();
    fs.rmSync(temp, { recursive: true, force: true });
  });

  await start();

  const api = (url, options = {}) => fetch(`http://127.0.0.1:${port}${url}`, {
    ...options,
    headers: {
      'x-api-key': 'test-fase-a-key',
      'authorization': 'Basic ' + Buffer.from('patio:patio').toString('base64'),
      ...options.headers
    }
  });

  const post = (url, body, options = {}) => api(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...options.headers },
    body: JSON.stringify(body),
    ...options
  });

  // 1. Inicializa Estado com Dados de Teste
  const estadoInicial = {
    versao: 0,
    cfg: {
      empresa: 'Oficina Auto Molas Fort Test',
      chavePix: 'financeiro@automolas.com.br'
    },
    boxes: [{ id: 'b1', nome: 'Box 01 — Molas', status: 'livre', veiculo: null, osId: null }],
    os: [{
      id: 'os_101',
      num: 101,
      placa: 'BRA2E19',
      cliente: 'Transportadora Fort Ltda',
      st: 'fila',
      etapaPatio: 'na_fila',
      total: 1250.00,
      tokenAprovacao: 'tok_teste_123',
      pecas: [{ id: 'p_mola1', nome: 'Feixe de Mola Dianteiro', qtd: 2, valor: 450.00 }],
      servicos: [{ id: 's_troca', nome: 'Troca de Mola', qtd: 1, valor: 350.00 }]
    }],
    clientes: [{ id: 'cli_01', nome: 'Transportadora Fort Ltda', doc: '12.345.678/0001-90' }],
    pecas: [{ id: 'p_mola1', codigo: 'MOLA-001', nome: 'Feixe de Mola Dianteiro', qtd: 5, custo: 280.00, venda: 450.00 }],
    contas: [],
    movimentos: []
  };

  const initRes = await post('/api/estado', estadoInicial);
  assert.equal(initRes.status, 200, 'Inicialização do estado deve retornar 200');

  // 2. Teste White-Label Theme (POST & GET /api/tenant/theme)
  const themePayload = {
    primary: '#059669',
    primaryHover: '#047857',
    primaryLight: '#ecfdf5',
    accent: '#d97706'
  };
  const themePost = await post('/api/tenant/theme', themePayload);
  assert.equal(themePost.status, 200);
  const themeData = await themePost.json();
  assert.equal(themeData.theme.primary, '#059669');

  const themeGet = await (await api('/api/tenant/theme')).json();
  assert.equal(themeGet.theme.primary, '#059669');
  assert.equal(themeGet.theme.accent, '#d97706');

  // 3. Teste Busca Global Indexada (GET /api/search)
  const searchPlaca = await (await api('/api/search?q=BRA2E19')).json();
  assert.ok(searchPlaca.resultados.length >= 1);
  assert.ok(searchPlaca.resultados.some(r => r.titulo.includes('BRA2E19')));

  const searchPrefixo = await (await api('/api/search?q=em:produtos%20MOLA-001')).json();
  assert.ok(searchPrefixo.resultados.length >= 1);
  assert.equal(searchPrefixo.resultados[0].tipo, 'produto');

  // 4. Elo 1: Vínculo Real Box ➔ Orçamento/OS (/api/patio/box-update)
  const boxUpdate = await post('/api/patio/box-update', {
    boxId: 'b1',
    osId: 'os_101',
    placa: 'BRA2E19',
    status: 'executando'
  });
  assert.equal(boxUpdate.status, 200);
  const boxData = await boxUpdate.json();
  assert.equal(boxData.box.osId, 'os_101');
  assert.equal(boxData.os.st, 'executando');

  // 5. Elo 2: Movimentação Atômica de Estoque (/api/estoque/movimentar)
  // Tentativa com saldo insuficiente (saldo atual 5, tentando 10)
  const movEstoqueFail = await post('/api/estoque/movimentar', {
    tipo: 'SAIDA_OS',
    osId: 'os_101',
    produtoId: 'p_mola1',
    qtd: 10
  });
  assert.equal(movEstoqueFail.status, 400);

  // Baixa com sucesso de 2 unidades -> Saldo deve ir para 3
  const movEstoqueOk = await post('/api/estoque/movimentar', {
    tipo: 'SAIDA_OS',
    osId: 'os_101',
    produtoId: 'p_mola1',
    qtd: 2
  });
  assert.equal(movEstoqueOk.status, 200);
  const movData = await movEstoqueOk.json();
  assert.equal(movData.peca.qtd, 3);
  assert.equal(movData.kardex.saldoAtual, 3);

  // 6. Elo 2: Entrada de Compra (/api/compras) -> incrementa 4 unidades -> saldo vai para 7
  const compraRes = await post('/api/compras', {
    fornecedorId: 'forn_1',
    fornecedorNome: 'Molas Fabril',
    itens: [{ produtoId: 'p_mola1', qtd: 4, valorUnitario: 290.00 }]
  });
  assert.equal(compraRes.status, 200);
  const compraData = await compraRes.json();
  assert.equal(compraData.compra.total, 1160.00);

  // 7. Elo 3: Orçamento Digital Público (GET /orcamento/:token & POST /api/orcamento/:token/aprovar)
  // Acesso sem header de autorização (público)
  const orcamentoHtml = await fetch(`http://127.0.0.1:${port}/orcamento/tok_teste_123`);
  assert.equal(orcamentoHtml.status, 200);
  const htmlText = await orcamentoHtml.text();
  assert.ok(htmlText.includes('Orçamento OS #101'));
  assert.ok(htmlText.includes('BRA2E19'));
  assert.ok(htmlText.includes('Aprovar Orçamento Digitalmente'));

  // Aprovação digital pelo cliente sem autenticação
  const aprovarRes = await fetch(`http://127.0.0.1:${port}/api/orcamento/tok_teste_123/aprovar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  });
  assert.equal(aprovarRes.status, 200);
  const aprovarData = await aprovarRes.json();
  assert.ok(aprovarData.success);
  assert.equal(aprovarData.os.st, 'executando');
  assert.ok(aprovarData.os.aprovacaoDigital.aprovado);

  // 8. Elo 4: Checkout Financeiro & Pix com Webhook
  const pixGerar = await post('/api/financeiro/pix/gerar', {
    osId: 'os_101',
    valor: 1250.00
  });
  assert.equal(pixGerar.status, 200);
  const pixData = await pixGerar.json();
  assert.ok(pixData.txid.startsWith('OS'));
  assert.ok(pixData.pixCopiaECola.startsWith('000201'));

  // Confirmação externa do banco via webhook público
  const webhookPix = await fetch(`http://127.0.0.1:${port}/api/webhooks/pix`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ txid: pixData.txid, status: 'PAGO', valor: 1250.00 })
  });
  assert.equal(webhookPix.status, 200);
  const webhookData = await webhookPix.json();
  assert.ok(webhookData.success);

  // 9. Elo 5: Duplicar e Ações em Lote
  const dupRes = await post('/api/os/duplicar', { id: 'os_101' });
  assert.equal(dupRes.status, 200);
  const dupData = await dupRes.json();
  const novaOSId = dupData.item.id;
  assert.notEqual(novaOSId, 'os_101');

  const delLote = await api('/api/os/lote', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids: [novaOSId] })
  });
  assert.equal(delLote.status, 200);
  const delData = await delLote.json();
  assert.equal(delData.count, 1);

  // 10. Persistência Snapshot data/database.json
  const dataFile = path.resolve(root, 'data/database.json');
  assert.ok(fs.existsSync(dataFile), 'Arquivo data/database.json deve ter sido criado');
  const snap = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
  assert.ok(snap.tenant_config);
  assert.ok(Array.isArray(snap.ordens_servico));
});
