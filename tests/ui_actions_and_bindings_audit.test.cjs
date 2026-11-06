'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const rootDir = path.resolve(__dirname, '..');

// Utilitário para coletar todos os arquivos JS
function getJsFiles(dir) {
  const results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const ent of entries) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory() && ent.name !== 'node_modules') {
      results.push(...getJsFiles(full));
    } else if (ent.isFile() && ent.name.endsWith('.js')) {
      results.push(full);
    }
  }
  return results;
}

// Cria ambiente de sandbox do navegador completo
function createBrowserSandbox() {
  const mockStorage = {};
  const storageImpl = {
    getItem: (k) => (k in mockStorage ? mockStorage[k] : null),
    setItem: (k, v) => { mockStorage[k] = String(v); },
    removeItem: (k) => { delete mockStorage[k]; },
    clear: () => { for (const k in mockStorage) delete mockStorage[k]; }
  };

  const domListeners = new Map();
  const mockElement = () => ({
    style: { setProperty: () => {}, removeProperty: () => {} },
    classList: { add: () => {}, remove: () => {}, toggle: () => false, contains: () => false },
    value: '',
    innerHTML: '',
    textContent: '',
    appendChild: () => {},
    removeChild: () => {},
    append: () => {},
    prepend: () => {},
    querySelector: () => mockElement(),
    querySelectorAll: () => [],
    addEventListener: (evt, fn) => {
      if (!domListeners.has(evt)) domListeners.set(evt, []);
      domListeners.get(evt).push(fn);
    },
    removeEventListener: () => {},
    click: () => {},
    focus: () => {},
    blur: () => {},
    getAttribute: () => null,
    setAttribute: () => {},
    showModal: () => {},
    close: () => {},
    attachShadow: () => mockElement()
  });

  const mockDocElement = mockElement();

  const mockWindow = {
    location: { href: 'http://localhost:3000/', origin: 'http://localhost:3000', pathname: '/', reload: () => {} },
    navigator: { clipboard: { writeText: async () => {} }, userAgent: 'NodeTestRunner' },
    localStorage: storageImpl,
    sessionStorage: storageImpl,
    document: {
      documentElement: mockDocElement,
      getElementById: (id) => mockElement(),
      querySelector: (sel) => mockElement(),
      querySelectorAll: (sel) => [],
      createElement: (tag) => mockElement(),
      body: mockDocElement,
      addEventListener: (evt, fn) => {
        if (!domListeners.has(evt)) domListeners.set(evt, []);
        domListeners.get(evt).push(fn);
      },
      removeEventListener: () => {}
    },
    addEventListener: (evt, fn) => {
      if (!domListeners.has(evt)) domListeners.set(evt, []);
      domListeners.get(evt).push(fn);
    },
    removeEventListener: () => {},
    setTimeout: (fn, ms) => {},
    setInterval: (fn, ms) => {},
    clearTimeout: () => {},
    clearInterval: () => {},
    alert: () => {},
    confirm: () => true,
    prompt: () => '',
    print: () => {},
    fetch: async () => ({ ok: true, json: async () => ({}) }),
    Chart: class MockChart { constructor() {} destroy() {} update() {} },
    console: console
  };
  mockWindow.window = mockWindow;
  mockWindow.globalThis = mockWindow;
  mockWindow.self = mockWindow;

  return vm.createContext(mockWindow);
}

// Extrai nomes de funções chamadas em código inline
function extractCalledFunctions(snippet) {
  const fns = new Set();
  const clean = snippet.replace(/'[^']*'/g, "''").replace(/"[^"]*"/g, '""');
  const callRegex = /([a-zA-Z0-9_$]+)\s*\(/g;
  let cm;
  const builtins = [
    'function', 'if', 'for', 'while', 'switch', 'catch', 'typeof', 'return',
    'Boolean', 'Number', 'String', 'Array', 'Object', 'alert', 'confirm', 'prompt',
    'parseInt', 'parseFloat', 'encodeURIComponent', 'decodeURIComponent', 'Date',
    'Math', 'JSON', 'Error', 'RegExp', 'isNaN', 'isFinite', 'escape', 'unescape'
  ];

  while ((cm = callRegex.exec(clean)) !== null) {
    const name = cm[1];
    const idx = cm.index;
    const prefix = clean.slice(Math.max(0, idx - 15), idx);
    if (prefix.endsWith('.')) continue; // método de objeto (ex: e.preventDefault, list.map)
    if (!builtins.includes(name)) {
      fns.add(name);
    }
  }
  return Array.from(fns);
}

test('P0: Auditoria Completa de Botões, Abas, Links e Ações de UI (Zero Cliques Mortos)', async (t) => {
  const indexHtml = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');

  // 1. Extração dos scripts na ordem do index.html
  const scriptRegex = /<script src="([^"]+)"><\/script>/g;
  const scriptFiles = [];
  let match;
  while ((match = scriptRegex.exec(indexHtml)) !== null) {
    if (!match[1].startsWith('http')) {
      scriptFiles.push(match[1]);
    }
  }
  assert.ok(scriptFiles.length >= 30, 'index.html deve referenciar todos os scripts do frontend');

  // 2. Execução sequencial dos scripts no sandbox
  const context = createBrowserSandbox();
  const scriptErrors = [];
  for (const sf of scriptFiles) {
    const filePath = path.join(rootDir, sf);
    const code = fs.readFileSync(filePath, 'utf8');
    try {
      vm.runInContext(code, context, { filename: sf });
    } catch (err) {
      scriptErrors.push({ script: sf, error: err.message });
    }
  }
  assert.deepEqual(scriptErrors, [], 'Nenhum script deve falhar ao carregar no frontend');

  // 3. Extração e validação de handlers inline (onclick, onchange, etc.)
  const allJs = getJsFiles(path.join(rootDir, 'js'));
  const handlerAttrRegex = /\bon(?:click|change|input|submit|keydown|keyup)=["']([^"']+)["']/gi;
  const inlineCalls = [];

  for (const file of allJs) {
    const code = fs.readFileSync(file, 'utf8');
    let m;
    while ((m = handlerAttrRegex.exec(code)) !== null) {
      inlineCalls.push({ file: path.relative(rootDir, file), snippet: m[1] });
    }
  }

  let im;
  while ((im = handlerAttrRegex.exec(indexHtml)) !== null) {
    inlineCalls.push({ file: 'index.html', snippet: im[1] });
  }

  const missingFunctions = new Map();
  for (const call of inlineCalls) {
    const fns = extractCalledFunctions(call.snippet);
    for (const fn of fns) {
      if (typeof context[fn] !== 'function') {
        if (!missingFunctions.has(fn)) missingFunctions.set(fn, []);
        missingFunctions.get(fn).push(call);
      }
    }
  }

  await t.test('1. 100% das funções chamadas em handlers inline devem existir no escopo global (window)', () => {
    if (missingFunctions.size > 0) {
      const details = Array.from(missingFunctions.entries())
        .map(([fn, locs]) => `Função "${fn}" ausente, chamada em ${locs[0].file} (${locs[0].snippet})`)
        .join('\n');
      assert.fail(`Funções chamadas em handlers inline não foram expostas no window:\n${details}`);
    }
  });

  await t.test('2. Funções críticas de modais, pátio e vendas devem estar disponíveis e ser executáveis', () => {
    const criticalFns = [
      'abrirModalGenerico',
      'fecharModalGenerico',
      'abrirFolha',
      'fecharFolha',
      'abrirCentroAutomacoes',
      'fecharCentroAutomacoes',
      'abrirModalNovaOS',
      'acaoEmLoteVendas',
      'enviarVendaWhatsApp',
      'acaoEmLoteCompras',
      'confirmarAjusteEstoque',
      'confirmarGeracaoPixRapido',
      'salvarConfiguracaoPix',
      'enviarPixWhatsApp',
      'renderMondayBoard',
      'toggleMondayGroup',
      'viewPatio',
      'viewFinanceiro',
      'viewVendas',
      'viewCompras',
      'viewEstoque',
      'viewCadastros'
    ];

    for (const fn of criticalFns) {
      assert.strictEqual(
        typeof context[fn],
        'function',
        `Função crítica ${fn} deve ser typeof function no escopo global window`
      );
    }
  });

  await t.test('3. Modais genéricos devem abrir e fechar folha sem lançar erros', () => {
    assert.doesNotThrow(() => {
      context.abrirModalGenerico('<div id="teste-modal">Conteúdo Teste</div>');
      context.fecharModalGenerico();
    }, 'abrirModalGenerico e fecharModalGenerico devem operar sem exceções');
  });

  await t.test('4. Todos os botões com data-act essenciais devem possuir handlers implementados', () => {
    const modulesDir = path.join(rootDir, 'js', 'modules');
    const eventsCode = fs.readdirSync(modulesDir)
      .filter(f => f === 'events.js' || (f.startsWith('events_') && f.endsWith('.js')))
      .map(f => fs.readFileSync(path.join(modulesDir, f), 'utf8'))
      .join('\n');
    const essentialActs = [
      'copiar-orc',
      'cobrar-titulo',
      'conciliar-avulso',
      'carregar-exemplo-ocr',
      'copiar-cob',
      'pular-cob',
      'enviar-cob',
      'liga-regra'
    ];

    for (const act of essentialActs) {
      const isHandled = eventsCode.includes(`'${act}'`) || eventsCode.includes(`"${act}"`);
      assert.ok(isHandled, `data-act="${act}" deve possuir branch ou listener em events.js ou submódulos events_*.js`);
    }
  });
});
