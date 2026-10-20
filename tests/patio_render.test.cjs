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
  assert.strictEqual(typeof mockGlobal.renderBadgesOperacionaisPatio, 'function', 'renderBadgesOperacionaisPatio deve ser função');
  assert.strictEqual(typeof mockGlobal.radarGargalosPatioHtml, 'function', 'radarGargalosPatioHtml deve ser função');

  // Teste de badges operacionais
  const osComGargalo = {
    id: 'os2',
    num: 1002,
    box: 'b1',
    mecanico: 'Carlos',
    etapaPatio: 'pausado_gargalo',
    motivoPausa: 'Aguardando feixe de mola',
    pecasUtilizadas: [{ id: 'p1', nome: 'Feixe de Mola' }],
    totalPecas: 580
  };
  const badgesHtml = mockGlobal.renderBadgesOperacionaisPatio(osComGargalo);
  assert.ok(badgesHtml.includes('Box 01'), 'Badge deve conter o Box associado');
  assert.ok(badgesHtml.includes('Carlos'), 'Badge deve conter o mecânico responsável');
  assert.ok(badgesHtml.includes('GARGALO: Aguardando feixe de mola'), 'Badge deve conter o gargalo e motivo');
  assert.ok(badgesHtml.includes('1 peça(s)'), 'Badge deve conter o contador de peças');

  // Testes de badges de vistoria / checklist técnico (Frente 8C)
  const osAprovada = { ...osComGargalo, statusChecklist: 'aprovado' };
  const badgesAprovada = mockGlobal.renderBadgesOperacionaisPatio(osAprovada);
  assert.ok(badgesAprovada.includes('🛡️ Vistoria OK'), 'Badge deve conter selo de vistoria aprovada');

  const osReprovada = { ...osComGargalo, statusChecklist: 'reprovado_critico' };
  const badgesReprovada = mockGlobal.renderBadgesOperacionaisPatio(osReprovada);
  assert.ok(badgesReprovada.includes('⚠️ Falha Vistoria'), 'Badge deve conter selo de falha na vistoria');

  // Testes de badges de retorno de garantia e liberação (Frente 9C)
  const osGarantia = {
    ...osComGargalo,
    isRetornoGarantia: true,
    osOrigemGarantiaId: 990,
    statusLiberacaoPatio: 'liberado_garantia'
  };
  const badgesGarantia = mockGlobal.renderBadgesOperacionaisPatio(osGarantia);
  assert.ok(badgesGarantia.includes('🔄 Garantia (OS #990)'), 'Badge deve conter selo de retorno de garantia com OS de origem');
  assert.ok(badgesGarantia.includes('selo-garantia'), 'Badge de garantia deve ter a classe selo-garantia');
  assert.ok(badgesGarantia.includes('🛡️ Liberado (Garantia)'), 'Badge deve conter selo de liberado garantia');
  assert.ok(badgesGarantia.includes('selo-liberado-garantia'), 'Badge de liberado garantia deve ter a classe selo-liberado-garantia');

  // Teste de renderização do cardOS
  const htmlCard = mockGlobal.cardOS(mockGlobal.S.os[0], mockGlobal.S.boxes[0]);
  assert.ok(htmlCard.includes('OS 1001'), 'Card deve renderizar o número da OS');
  assert.ok(htmlCard.includes('ABC1D23'), 'Card deve renderizar a placa do caminhão');
  assert.ok(htmlCard.includes('Box 01'), 'Card deve identificar o box associado');
  assert.ok(htmlCard.includes('data-act="copiar-aviso-os"'), 'Card deve exibir ação rápida copiar aviso OS');
  assert.ok(htmlCard.includes('Copiar Aviso'), 'Texto de copiar aviso deve estar presente');
  assert.ok(htmlCard.includes('data-act="historico-placa-os"'), 'Card deve exibir ação rápida consultar histórico da placa');
  assert.ok(htmlCard.includes('Histórico Placa'), 'Texto do botão de histórico da placa deve estar presente');
  assert.ok(htmlCard.includes('data-placa="ABC1D23"'), 'Botão de histórico deve conter atributo data-placa');
  assert.ok(htmlCard.includes('data-act="aprovar-checklist-os"'), 'Card deve exibir ação rápida aprovar checklist');
  assert.ok(htmlCard.includes('Checklist OK'), 'Texto de aprovar checklist deve estar presente');

  // Teste de card com botão de retomada de gargalo
  const htmlCardGargalo = mockGlobal.cardOS(osComGargalo, mockGlobal.S.boxes[0]);
  assert.ok(htmlCardGargalo.includes('data-act="retomar-os-gargalo"'), 'Card com gargalo deve exibir botão de retomada');
  assert.ok(htmlCardGargalo.includes('Retomar / Peça Chegou'), 'Texto do botão de retomada deve ser exibido');

  // Teste de renderização de Box Livre
  const htmlLivre = mockGlobal.cardLivre(mockGlobal.S.boxes[1]);
  assert.ok(htmlLivre.includes('Box Disponível'), 'Card deve indicar box disponível');
  assert.ok(htmlLivre.includes('Ocupar Box'), 'Card deve exibir ação para ocupar');

  // Teste de renderização da viewPatio
  const htmlView = mockGlobal.viewPatio();
  assert.ok(htmlView.includes('Boxes do Pátio'), 'viewPatio deve conter cabeçalho dos boxes');
  assert.ok(htmlView.includes('Em Atendimento'), 'viewPatio deve conter KPIs operacionais');
  assert.ok(htmlView.includes('Radar Operacional de Boxes & Gargalos de Pátio'), 'viewPatio deve conter o Radar Operacional de Pátio');
});
