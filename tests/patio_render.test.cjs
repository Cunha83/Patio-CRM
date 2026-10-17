const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const patioRenderPath = path.resolve(__dirname, '..', 'js', 'modules', 'patio_render.js');

test('js/modules/patio_render.js: sintaxe e exportações das funções de renderização do pátio', () => {
  assert.ok(fs.existsSync(patioRenderPath), 'Arquivo patio_render.js deve existir em js/modules/');
  const code = fs.readFileSync(patioRenderPath, 'utf8');

  // Validação de sintaxe
  assert.doesNotThrow(() => {
    new vm.Script(code, { filename: 'patio_render.js' });
  }, 'patio_render.js deve possuir sintaxe válida');

  // Contexto simulando o navegador
  const mockWindow = {};
  const mockGlobal = {
    window: mockWindow,
    globalThis: mockWindow,
    esc: (s) => String(s || ''),
    ico: (n, s) => `<svg class="${n}" width="${s}"></svg>`,
    brl: (n) => `R$ ${Number(n || 0).toFixed(2)}`,
    totOS: (o) => 1500,
    V: (id) => ({ id, placa: 'ABC1D23', modelo: 'FH 540', marca: 'Volvo' }),
    C: (id) => ({ id, nome: 'Transportadora Silva', fantasia: 'TransSilva' }),
    ST: {
      fila: { r: 'Na Fila', c: 'var(--aco-400)' },
      executando: { r: 'Em Execução', c: 'var(--verde)' },
      peca: { r: 'Parado p/ Peça', c: 'var(--tijolo)' },
      aprovacao: { r: 'Aguardando Aprovação', c: 'var(--sinal)' },
      finalizada: { r: 'Finalizada', c: 'var(--aco-700)' }
    },
    S: {
      boxes: [
        { id: 'b1', nome: 'Box 01 — Mecânica', tipo: 'Pesada' },
        { id: 'b2', nome: 'Box 02 — Elétrica', tipo: 'Rápida' }
      ],
      os: [
        { id: 'os1', num: 1001, box: 'b1', vei: 'v1', cli: 'c1', st: 'executando', servicos: [{}], pecas: [{}] }
      ],
      ui: { filtro: 'todos', buscaPlaca: '' }
    }
  };

  const context = vm.createContext(mockGlobal);
  vm.runInContext(code, context);

  // Valida que as funções essenciais foram devidamente expostas no window/global
  assert.strictEqual(typeof mockGlobal.isPerfilMecanico, 'function', 'isPerfilMecanico deve ser função');
  assert.strictEqual(typeof mockGlobal.viewPatio, 'function', 'viewPatio deve ser função');
  assert.strictEqual(typeof mockGlobal.cardOS, 'function', 'cardOS deve ser função');
  assert.strictEqual(typeof mockGlobal.cardLivre, 'function', 'cardLivre deve ser função');

  // Teste de renderização do cardOS
  const htmlCard = mockGlobal.cardOS(mockGlobal.S.os[0], mockGlobal.S.boxes[0]);
  assert.ok(htmlCard.includes('OS 1001'), 'Card deve renderizar o número da OS');
  assert.ok(htmlCard.includes('ABC1D23'), 'Card deve renderizar a placa do caminhão');
  assert.ok(htmlCard.includes('Box 01'), 'Card deve identificar o box associado');

  // Teste de renderização de Box Livre
  const htmlLivre = mockGlobal.cardLivre(mockGlobal.S.boxes[1]);
  assert.ok(htmlLivre.includes('Box Disponível'), 'Card deve indicar box disponível');
  assert.ok(htmlLivre.includes('Ocupar Box'), 'Card deve exibir ação para ocupar');

  // Teste de renderização da viewPatio
  const htmlView = mockGlobal.viewPatio();
  assert.ok(htmlView.includes('Boxes do Pátio'), 'viewPatio deve conter cabeçalho dos boxes');
  assert.ok(htmlView.includes('Em Atendimento'), 'viewPatio deve conter KPIs operacionais');
});
