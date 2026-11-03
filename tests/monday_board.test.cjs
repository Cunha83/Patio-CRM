const test = require('node:test');
const assert = require('node:assert');
const MondayBoard = require('../js/modules/monday_board.js');

test('MondayBoard module exports correct interface', () => {
  assert.strictEqual(typeof MondayBoard.renderMondayBoard, 'function');
  assert.strictEqual(typeof MondayBoard.renderGroup, 'function');
  assert.strictEqual(typeof MondayBoard.renderCell, 'function');
  assert.strictEqual(typeof MondayBoard.renderFooter, 'function');
});

test('renderCell correctly formats different Monday column types', () => {
  // Status cell
  const statusHtml = MondayBoard.renderCell({ key: 'st', type: 'status', colorMap: { 'Ativo': '#00c875' } }, { st: 'Ativo' }, '#00c875');
  assert.ok(statusHtml.includes('monday-status-pill'));
  assert.ok(statusHtml.includes('#00c875'));
  assert.ok(statusHtml.includes('Ativo'));

  // Money cell
  const moneyHtml = MondayBoard.renderCell({ key: 'valor', type: 'money' }, { valor: 1500.5 }, '#0086c0');
  assert.ok(moneyHtml.includes('1.500,50') || moneyHtml.includes('1500'));

  // Stars cell
  const starsHtml = MondayBoard.renderCell({ key: 'rating', type: 'stars' }, { rating: 4 }, '#0086c0');
  assert.ok(starsHtml.includes('★★★★☆'));
  assert.ok(starsHtml.includes('(4)'));

  // Phone cell
  const phoneHtml = MondayBoard.renderCell({ key: 'fone', type: 'phone', flag: '🇧🇷' }, { fone: '(62) 99999-8888' }, '#0086c0');
  assert.ok(phoneHtml.includes('https://wa.me/5562999998888'));
  assert.ok(phoneHtml.includes('🇧🇷'));
});

test('renderFooter correctly aggregates sums and averages', () => {
  const columns = [
    { key: 'total', label: 'Total', type: 'money', aggregator: 'sum' },
    { key: 'prob', label: 'Probabilidade', type: 'progress', aggregator: 'avg' },
    { key: 'st', label: 'Status', type: 'status', aggregator: 'distribution' }
  ];
  const items = [
    { total: 100, prob: 50, st: 'Ativo' },
    { total: 200, prob: 70, st: 'Ativo' },
    { total: 300, prob: 90, st: 'Inativo' }
  ];

  const footerHtml = MondayBoard.renderFooter(columns, items, '#00c875');
  assert.ok(footerHtml.includes('monday-footer-row'));
  assert.ok(footerHtml.includes('Soma'));
  assert.ok(footerHtml.includes('600'));
  assert.ok(footerHtml.includes('Média'));
  assert.ok(footerHtml.includes('70.0%'));
  assert.ok(footerHtml.includes('monday-distribution-bar'));
});

test('renderMondayBoard generates complete board markup', () => {
  const html = MondayBoard.renderMondayBoard({
    title: 'Processo de Vendas',
    badge: 'CRM 2026',
    groups: [
      { id: 'g1', title: 'Ativos', color: '#00c875', items: [{ id: 1, nome: 'Cliente 1', valor: 500 }] }
    ],
    columns: [
      { key: 'nome', label: 'Nome' },
      { key: 'valor', label: 'Valor', type: 'money', aggregator: 'sum' }
    ]
  });

  assert.ok(html.includes('monday-board-wrapper'));
  assert.ok(html.includes('Processo de Vendas'));
  assert.ok(html.includes('CRM 2026'));
  assert.ok(html.includes('m-group-g1'));
  assert.ok(html.includes('Cliente 1'));
});

