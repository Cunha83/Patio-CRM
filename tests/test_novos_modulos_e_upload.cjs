'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const net = require('node:net');
const vm = require('node:vm');

test('Validação Completa: Upload Logo/Institucional, Novos Módulos Compras e Vendas, e Telas Cadastros', { timeout: 60000 }, async (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'patio-modulos-test-'));
  const dbPath = path.join(tempDir, 'test.db');
  const uploadDir = path.join(tempDir, 'uploads');
  fs.mkdirSync(uploadDir, { recursive: true });

  const probe = net.createServer();
  probe.listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const port = probe.address().port;
  await new Promise(r => probe.close(r));

  const root = path.resolve(__dirname, '..');
  let childLogs = '';
  const child = spawn(process.execPath, ['server.js'], {
    cwd: root,
    windowsHide: true,
    env: {
      ...process.env,
      PORT: String(port),
      API_KEY: 'test-api-key-modulos',
      AUTH_USER: 'admin_test',
      AUTH_PASSWORD: 'PasswordTest123#',
      DB_PATH: dbPath,
      UPLOAD_DIR: uploadDir,
      DISABLE_INTEGRATIONS: 'true'
    }
  });

  child.stdout.on('data', d => { childLogs += d; });
  child.stderr.on('data', d => { childLogs += d; });

  t.after(async () => {
    if (child.exitCode === null) {
      try {
        if (process.platform === 'win32') {
          require('node:child_process').execSync(`taskkill /pid ${child.pid} /f /t 2>nul`);
        } else {
          child.kill('SIGKILL');
        }
      } catch (_) {
        child.kill();
      }
    }
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
        break;
      } catch (_) {
        await new Promise(r => setTimeout(r, 100));
      }
    }
  });

  // Aguarda servidor
  let isReady = false;
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Servidor encerrou com código ${child.exitCode}: ${childLogs}`);
    }
    try {
      const res = await fetch(`http://127.0.0.1:${port}/ready`);
      if (res.status === 200) {
        isReady = true;
        break;
      }
    } catch (_) {}
    await new Promise(r => setTimeout(r, 100));
  }
  assert.ok(isReady, 'Servidor deve estar pronto');

  const authHeaders = {
    'Authorization': 'Basic ' + Buffer.from('admin_test:PasswordTest123#').toString('base64'),
    'Content-Type': 'application/json',
    'x-tenant-id': 'default'
  };

  // 1. Upload Logo
  await t.test('1. Upload e remoção de Logo da Empresa via Base64 JSON', async () => {
    // 1x1 transparent PNG base64
    const fakeLogoBase64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const resUpload = await fetch(`http://127.0.0.1:${port}/api/configuracoes/empresa/logo`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        logoBase64: fakeLogoBase64,
        mimeType: 'image/png'
      })
    });
    assert.equal(resUpload.status, 200, 'Upload logo deve responder 200');
    const dataUpload = await resUpload.json();
    assert.equal(dataUpload.success, true);
    assert.ok(dataUpload.url, 'Deve retornar url do upload');

    // Remoção
    const resDel = await fetch(`http://127.0.0.1:${port}/api/configuracoes/empresa/logo`, {
      method: 'DELETE',
      headers: authHeaders
    });
    assert.equal(resDel.status, 200, 'Delete logo deve responder 200');
    const dataDel = await resDel.json();
    assert.equal(dataDel.success, true);
  });

  // 2. Upload Imagem Institucional
  await t.test('2. Upload e remoção de Imagem Institucional via Base64 JSON', async () => {
    const fakeInstBase64 = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';
    const resUpload = await fetch(`http://127.0.0.1:${port}/api/configuracoes/empresa/imagem-institucional`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        imagemBase64: fakeInstBase64,
        mimeType: 'image/jpeg'
      })
    });
    assert.equal(resUpload.status, 200, 'Upload institucional deve responder 200');
    const dataUpload = await resUpload.json();
    assert.equal(dataUpload.success, true);
    assert.ok(dataUpload.url, 'Deve retornar url da imagem institucional');

    // Remoção
    const resDel = await fetch(`http://127.0.0.1:${port}/api/configuracoes/empresa/imagem-institucional`, {
      method: 'DELETE',
      headers: authHeaders
    });
    assert.equal(resDel.status, 200, 'Delete institucional deve responder 200');
    const dataDel = await resDel.json();
    assert.equal(dataDel.success, true);
  });

  // 3. Simulação no Frontend VM
  await t.test('3. Execução dos scripts frontend e renderização das novas telas', async () => {
    class MockDOMParser {
      parseFromString(xml, mime) {
        const parse = (str) => {
          const tagRegex = /<([a-zA-Z0-9_:]+)(?:\s+[^>]*)?>([\s\S]*?)<\/\1>|<([a-zA-Z0-9_:]+)(?:\s+[^>]*)?\/>/g;
          const elements = [];
          let match;
          while ((match = tagRegex.exec(str)) !== null) {
            const tagName = match[1] || match[3];
            const content = match[2] || '';
            const childElements = parse(content);
            elements.push({
              tagName,
              textContent: childElements.length === 0 ? content.replace(/&amp;/g, '&') : '',
              getElementsByTagName(t) {
                const results = [];
                for (const child of childElements) {
                  if (child.tagName === t) results.push(child);
                  results.push(...child.getElementsByTagName(t));
                }
                return results;
              }
            });
          }
          return elements;
        };
        const roots = parse(xml);
        return {
          getElementsByTagName(t) {
            const res = [];
            for (const r of roots) {
              if (r.tagName === t) res.push(r);
              res.push(...r.getElementsByTagName(t));
            }
            return res;
          }
        };
      }
    }

    const mockEl = () => {
      const el = {
        id: '',
        style: {},
        innerHTML: '',
        classList: { add() {}, remove() {}, contains() { return false; }, toggle() {} },
        appendChild() {},
        append() {},
        prepend() {},
        replaceChildren() {},
        addEventListener() {},
        onclick: null,
        showModal() {},
        close() {},
        attachShadow: () => {
          const shadow = {
            innerHTML: '',
            querySelector: () => el,
            querySelectorAll: () => [],
            addEventListener: () => {},
            prepend: () => {}
          };
          return shadow;
        }
      };
      return el;
    };

    const context = {
      window: {},
      document: {
        createElement: mockEl,
        getElementById: (id) => mockEl(),
        querySelector: () => mockEl(),
        querySelectorAll: () => [],
        addEventListener: () => {},
        body: { classList: { add() {}, remove() {} }, append() {}, replaceChildren() {} }
      },
      addEventListener: () => {},
      removeEventListener: () => {},
      DOMParser: MockDOMParser,
      localStorage: {
        _data: {},
        getItem(k) { return this._data[k] || null; },
        setItem(k, v) { this._data[k] = String(v); },
        removeItem(k) { delete this._data[k]; }
      },
      fetch: async () => ({ ok: true, status: 200, json: async () => ({}) }),
      console: console,
      setTimeout: (fn, ms) => { const t = setTimeout(fn, ms); t.unref?.(); return t; },
      clearTimeout: clearTimeout,
      setInterval: (fn, ms) => { const t = setInterval(fn, ms); t.unref?.(); return t; },
      clearInterval: clearInterval,
      navigator: { onLine: true },
      Chart: function() {
        return { destroy() {}, update() {} };
      }
    };
    context.window = context;
    context.window.addEventListener = () => {};
    context.window.removeEventListener = () => {};
    context.window.DOMParser = MockDOMParser;
    context.global = context;

    vm.createContext(context);

    // Carrega scripts na ordem do index.html
    const scriptFiles = [
      'js/icons.js',
      'js/sync.js',
      'js/state.js',
      'js/modules/navigation.js',
      'js/modules/integrations.js',
      'js/modules/consulta_cliente.js',
      'js/modules/patio_render.js',
      'js/patio.js',
      'js/estoque.js',
      'js/compras.js',
      'js/vendas.js',
      'js/financeiro.js',
      'js/modules/financeiro_analista.js',
      'js/whatsapp.js',
      'js/modules/cadastros_fiscal.js',
      'js/cadastros.js',
      'js/modules/cadastros_forms.js',
      'js/relatorios.js',
      'js/modules/dashboard_metrics.js',
      'js/dashboard_operacional.js',
      'js/modules/agent_config.js',
      'js/app.js',
      'js/modules/events.js',
      'js/voz.js',
      'js/support-widget.js',
      'js/fiscal.js'
    ];

    try {
    for (const rel of scriptFiles) {
      const full = path.join(root, rel);
      const code = fs.readFileSync(full, 'utf8');
      vm.runInContext(code, context, { filename: rel });
    }

    // Valida inicialização do estado S
    await vm.runInContext(`
      boot();
    `, context);

    const state = vm.runInContext(`S`, context);
    assert.ok(state, 'Estado global S deve existir');
    assert.ok(Array.isArray(state.compras), 'S.compras deve ser um array');
    assert.ok(Array.isArray(state.vendas), 'S.vendas deve ser um array');
    assert.ok(Array.isArray(state.fornecedores), 'S.fornecedores deve ser um array');
    assert.ok(Array.isArray(state.pecas), 'S.pecas deve ser um array');
    assert.ok(Array.isArray(state.servicos), 'S.servicos deve ser um array');
    assert.ok(Array.isArray(state.contasPagar), 'S.contasPagar deve ser um array');
    assert.ok(Array.isArray(state.contasReceber), 'S.contasReceber deve ser um array');

    // Valida se as categorias pesadas foram incluídas nas peças
    const pecasComCat = state.pecas.filter(p => p.categoria && ['Suspensão', 'Molas', 'Freio', 'Cardan', 'Embreagem'].includes(p.categoria));
    assert.ok(pecasComCat.length >= 3, 'Deve haver peças com categorias pesadas cadastradas');

    // Testa geração de HTML para cada view
    const htmlPainel = vm.runInContext(`viewPainelInicial()`, context);
    assert.ok(typeof htmlPainel === 'string' && htmlPainel.includes('Contas a Receber'), 'Painel eGestor deve conter resumo de contas');
    assert.ok(htmlPainel.includes('grafico-vendas-categoria'), 'Painel deve conter container do gráfico de categoria');

    const htmlCadastrosHub = vm.runInContext(`viewCadastros()`, context);
    assert.ok(typeof htmlCadastrosHub === 'string' && htmlCadastrosHub.includes('Hub Geral de Cadastros'), 'Cadastros deve renderizar Hub e subnav');

    // Testa abas de cadastros
    for (const aba of ['clientes', 'veiculos', 'fornecedores', 'pecas', 'servicos', 'mecanicos', 'boxes', 'empresa']) {
      const htmlAba = vm.runInContext(`S.ui.abaCad = '${aba}'; viewCadastros()`, context);
      assert.ok(typeof htmlAba === 'string' && htmlAba.length > 50, `Aba ${aba} deve renderizar conteúdo`);
    }

    // Testa tela Compras
    const htmlCompras = vm.runInContext(`viewCompras()`, context);
    assert.ok(typeof htmlCompras === 'string' && htmlCompras.includes('Carregar XML (NF-e)'), 'Compras deve conter botão Carregar XML');

    // Testa tela Vendas
    const htmlVendas = vm.runInContext(`viewVendas()`, context);
    assert.ok(typeof htmlVendas === 'string' && htmlVendas.includes('Nova Venda'), 'Vendas deve conter botão Nova Venda');

    // Testa Parser de XML NF-e
    const sampleNfeXml = `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe">
  <NFe>
    <infNFe Id="NFe35261012345678000199550010000000011234567890">
      <ide>
        <nNF>12345</nNF>
        <dhEmi>2026-10-22T10:00:00-03:00</dhEmi>
      </ide>
      <emit>
        <CNPJ>12345678000199</CNPJ>
        <xNome>Molas &amp; Suspensao Brasil Ltda</xNome>
        <enderEmit>
          <xLgr>Av das Industrias</xLgr>
          <nro>1000</nro>
          <xBairro>Distrito Industrial</xBairro>
          <xMun>Fortaleza</xMun>
          <UF>CE</UF>
          <CEP>60000000</CEP>
          <fone>8533334444</fone>
        </enderEmit>
        <IE>123456789</IE>
      </emit>
      <det nItem="1">
        <prod>
          <cProd>MOL-001</cProd>
          <cEAN>7891234567890</cEAN>
          <xProd>Feixe de Molas Traseiro Scania R440</xProd>
          <NCM>73201000</NCM>
          <uCom>UN</uCom>
          <qCom>4.0000</qCom>
          <vUnCom>1200.0000</vUnCom>
          <vProd>4800.00</vProd>
        </prod>
      </det>
      <cobr>
        <fat>
          <nFat>12345</nFat>
          <vOrig>4800.00</vOrig>
          <vLiq>4800.00</vLiq>
        </fat>
        <dup>
          <nDup>001</nDup>
          <dVenc>2026-11-22</dVenc>
          <vDup>4800.00</vDup>
        </dup>
      </cobr>
    </infNFe>
  </NFe>
</nfeProc>`;

    await vm.runInContext(`
      processarXmlNfe(${JSON.stringify(sampleNfeXml)});
    `, context);

    const stateAposXml = vm.runInContext(`S`, context);
    // Verifica fornecedor cadastrado
    const forn = stateAposXml.fornecedores.find(f => f.doc === '12345678000199' || f.nome.includes('Molas & Suspensao'));
    assert.ok(forn, 'Fornecedor da NF-e deve ter sido cadastrado automaticamente');

    // Verifica item no estoque
    const pecaEstoque = stateAposXml.pecas.find(p => p.nome.includes('Feixe de Molas'));
    assert.ok(pecaEstoque, 'Peça importada deve estar presente no estoque');
    assert.ok(pecaEstoque.qtd >= 4, 'Estoque da peça deve ter aumentado');

    // Verifica compra registrada
    const compra = stateAposXml.compras.find(c => c.num === '12345');
    assert.ok(compra, 'Compra da NF-e deve ter sido registrada');
    assert.equal(compra.total, 4800, 'Valor da compra deve ser R$ 4.800,00');

    // Verifica conta a pagar gerada
    const conta = stateAposXml.contasPagar.find(cp => cp.desc && cp.desc.includes('NF-e 12345'));
    assert.ok(conta, 'Conta a pagar deve ter sido gerada automaticamente no Financeiro');
    assert.equal(conta.valor, 4800, 'Valor da conta a pagar deve ser R$ 4.800,00');
    } catch (err) {
      console.error('SUBTEST 3 CAPTURED ERROR:', err);
      throw err;
    }
  });
});
