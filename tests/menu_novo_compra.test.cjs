const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('node:vm');

test('Menu Rápido + Novo - Opção Nova Compra e Fluxo de Entrada', (t) => {
  const root = path.resolve(__dirname, '..');

  // 1. Simulação de ambiente DOM e Globais mínimos do frontend
  const sandbox = {
    window: {
      addEventListener: () => {}
    },
    addEventListener: () => {},
    document: {
      addEventListener: () => {},
      createElement: () => ({
        style: {},
        appendChild: () => {},
        classList: { add: () => {}, remove: () => {} },
        setAttribute: () => {},
        getAttribute: () => null
      }),
      body: { appendChild: () => {} },
      getElementById: (id) => {
        if (id === 'dropdown-novo-menu') return sandbox.mockDropdownEl;
        return null;
      }
    },
    mockDropdownEl: {
      classList: {
        _classes: new Set(),
        add(c) { this._classes.add(c); },
        remove(c) { this._classes.delete(c); },
        contains(c) { return this._classes.has(c); },
        toggle(c) {
          if (this._classes.has(c)) { this._classes.delete(c); return false; }
          this._classes.add(c); return true;
        }
      },
      style: { display: 'none' }
    },
    console,
    Date,
    Number,
    String,
    Boolean,
    Array,
    Object,
    Math,
    setTimeout: (fn) => fn(),
    clearTimeout: () => {},
    torrar: () => {},
    pedirConfirmacao: (a, b, cb) => cb(),
    salvar: () => {},
    fecharFolha: () => {},
    renderFolha: () => {},
    render: () => {},
    hoje: () => '2026-10-29',
    dataBRfull: (d) => d,
    brl: (v) => 'R$ ' + Number(v || 0).toFixed(2),
    esc: (s) => (s ? String(s).replace(/</g, '&lt;') : ''),
    uid: (p = 'id') => p + '_' + Math.random().toString(36).substring(2, 9)
  };
  sandbox.window = sandbox;
  sandbox.window.addEventListener = () => {};
  sandbox.global = sandbox;

  const ctx = vm.createContext(sandbox);

  // Executa dependências do frontend no contexto
  const files = [
    'js/icons.js',
    'js/state.js',
    'js/modules/navigation_actions.js',
    'js/modules/navigation.js',
    'js/financeiro.js',
    'js/modules/compras_xml_import.js',
    'js/modules/compras_nova_modal.js',
    'js/compras.js'
  ];

  for (const f of files) {
    const code = fs.readFileSync(path.join(root, f), 'utf8');
    vm.runInContext(code, ctx, { filename: f });
  }

  // Inicializa S no contexto após state.js carregar
  vm.runInContext(`
    S = {
      cfg: {
        planoDeContas: [
          { id: '1', codigo: '1', nome: 'Receitas', classe: 'sintetica', tipo: 'receita' },
          { id: '2', codigo: '2', nome: 'Custos e Despesas', classe: 'sintetica', tipo: 'despesa' },
          { id: '2.01', codigo: '2.01', nome: 'Peças', classe: 'analitica', tipo: 'despesa', paiId: '2' },
          { id: '2.02', codigo: '2.02', nome: 'Fixas', classe: 'analitica', tipo: 'despesa', paiId: '2' }
        ]
      },
      ui: { view: 'patio' },
      fornecedores: [
        { id: 'forn_1', nome: 'Distribuidora Molas & Freios', doc: '12.345.678/0001-90' }
      ],
      pecas: [
        { id: 'peca_1', cod: 'MOL-01', nome: 'Mola Mestre Dianteira', qtd: 5, custo: 150.00 }
      ],
      compras: [],
      contasPagar: [],
      contas: []
    };
  `, ctx);

  // 2. Verifica se renderTopo gera o item "Nova Compra" no dropdown
  const htmlTopoAdmin = sandbox.renderTopo('admin');
  assert.ok(htmlTopoAdmin.includes('dropdown-novo-menu'), 'Topo deve renderizar o dropdown-novo-menu');
  assert.ok(htmlTopoAdmin.includes('abrirModalNovaCompra()'), 'Topo deve conter o botão chamando abrirModalNovaCompra() para admin');
  assert.ok(htmlTopoAdmin.includes('Nova Compra / Entrada de Peças'), 'Topo deve ter o texto "Nova Compra / Entrada de Peças"');

  const htmlTopoCaixa = sandbox.renderTopo('caixa');
  assert.ok(htmlTopoCaixa.includes('abrirModalNovaCompra()'), 'Topo deve conter o botão para caixa');

  // 3. Testa toggleDropdownNovo
  assert.equal(sandbox.mockDropdownEl.style.display, 'none');
  sandbox.toggleDropdownNovo();
  assert.equal(sandbox.mockDropdownEl.style.display, 'block');
  assert.ok(sandbox.mockDropdownEl.classList.contains('aberto'));
  sandbox.toggleDropdownNovo();
  assert.equal(sandbox.mockDropdownEl.style.display, 'none');
  assert.ok(!sandbox.mockDropdownEl.classList.contains('aberto'));

  // 4. Testa abrirModalNovaCompra
  let folhaAberta = null;
  sandbox.abrirFolha = (fn) => { folhaAberta = fn; };
  sandbox.abrirModalNovaCompra();

  const S = vm.runInContext('S', ctx);
  assert.ok(S.ui.rascCompra, 'Rascunho de compra deve ser criado');
  assert.equal(S.ui.rascCompra.cat, 'Peças', 'Categoria padrão deve ser Peças');
  assert.equal(S.ui.rascCompra.fornecedorId, 'forn_1', 'Fornecedor padrão deve ser selecionado');
  assert.ok(typeof folhaAberta === 'function', 'Folha modal deve ter sido aberta');

  // Renderiza a folha de Nova Compra
  const htmlFolha = folhaAberta();
  assert.ok(htmlFolha.includes('Plano de Contas / Categoria'), 'Folha deve exibir campo Plano de Contas / Categoria');
  assert.ok(htmlFolha.includes('Peças'), 'Folha deve conter a opção Peças no select');

  // 5. Simula adição de item e finalização da compra
  S.ui.rascCompra.itens.push({
    pecaId: 'peca_1',
    nome: 'Mola Mestre Dianteira',
    qtd: 3,
    custo: 160.00
  });
  S.ui.rascCompra.num = 'NF-998877';
  S.ui.rascCompra.cat = 'Peças';

  sandbox.salvarNovaCompraConfirmada();

  // 6. Valida atualizações no estado
  // A) Estoque da peça atualizado
  const pecaAtualizada = S.pecas.find(p => p.id === 'peca_1');
  assert.equal(pecaAtualizada.qtd, 8, 'Estoque deve ser somado de 5 para 8');
  assert.equal(pecaAtualizada.custo, 160.00, 'Custo unitário da peça deve ser atualizado para 160');

  // B) Compra registrada
  assert.equal(S.compras.length, 1, 'Deve registrar uma compra em S.compras');
  assert.equal(S.compras[0].num, 'NF-998877');
  assert.equal(S.compras[0].total, 480.00);
  assert.equal(S.compras[0].cat, 'Peças');

  // C) Título a pagar em S.contasPagar e S.contas com categoria vinculada
  assert.equal(S.contasPagar.length, 1, 'Deve gerar título em S.contasPagar');
  assert.equal(S.contasPagar[0].valor, 480.00);
  assert.equal(S.contasPagar[0].cat, 'Peças');
  assert.equal(S.contasPagar[0].tipo, 'pagar');
  assert.equal(S.contasPagar[0].parte, 'Distribuidora Molas & Freios');

  assert.equal(S.contas.length, 1, 'Deve sincronizar em S.contas');
  assert.equal(S.contas[0].id, S.contasPagar[0].id);
  assert.equal(S.contas[0].cat, 'Peças');
});
