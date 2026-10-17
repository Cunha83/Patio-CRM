const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const dashboardMetricsPath = path.resolve(__dirname, '..', 'js', 'modules', 'dashboard_metrics.js');

test('js/modules/dashboard_metrics.js: sintaxe, helpers de formatação e renderização de métricas', () => {
  assert.ok(fs.existsSync(dashboardMetricsPath), 'Arquivo dashboard_metrics.js deve existir em js/modules/');
  const code = fs.readFileSync(dashboardMetricsPath, 'utf8');

  // Validação de sintaxe
  assert.doesNotThrow(() => {
    new vm.Script(code, { filename: 'dashboard_metrics.js' });
  }, 'dashboard_metrics.js deve possuir sintaxe válida');

  const mockWindow = {};
  const mockGlobal = {
    window: mockWindow,
    globalThis: mockWindow,
    esc: (s) => String(s || ''),
    ico: (n, s) => `<svg class="${n}" width="${s}"></svg>`,
    document: {
      body: {
        classList: {
          contains: () => false,
          toggle: () => true
        }
      }
    }
  };

  const context = vm.createContext(mockGlobal);
  vm.runInContext(code, context);

  // Valida que o namespace e helpers foram exportados no window/global
  assert.ok(mockWindow.DashboardMetrics || context.DashboardMetrics, 'DashboardMetrics deve estar definido');
  assert.strictEqual(typeof (mockWindow.formatarTempoOp || context.formatarTempoOp), 'function', 'formatarTempoOp deve ser função');
  assert.strictEqual(typeof (mockWindow.formatarPercentualOp || context.formatarPercentualOp), 'function', 'formatarPercentualOp deve ser função');
  assert.strictEqual(typeof (mockWindow.formatarHoraSimples || context.formatarHoraSimples), 'function', 'formatarHoraSimples deve ser função');
  assert.strictEqual(typeof (mockWindow.renderCardsExecutivosOp || context.renderCardsExecutivosOp), 'function', 'renderCardsExecutivosOp deve ser função');
  assert.strictEqual(typeof (mockWindow.renderPipelineEstagiosOp || context.renderPipelineEstagiosOp), 'function', 'renderPipelineEstagiosOp deve ser função');
  assert.strictEqual(typeof (mockWindow.renderMetricasFluxoOp || context.renderMetricasFluxoOp), 'function', 'renderMetricasFluxoOp deve ser função');

  const D = mockWindow.DashboardMetrics || context.DashboardMetrics;

  // Testes dos formatadores determinísticos (sem inventar métricas para null)
  assert.strictEqual(D.formatarTempoOp(null), 'Sem dados suficientes');
  assert.strictEqual(D.formatarTempoOp(undefined), 'Sem dados suficientes');
  assert.strictEqual(D.formatarTempoOp(45), '45 min');
  assert.strictEqual(D.formatarTempoOp(125), '2h 5m');
  assert.strictEqual(D.formatarTempoOp(120), '2h');

  assert.strictEqual(D.formatarPercentualOp(null), 'Sem dados suficientes');
  assert.strictEqual(D.formatarPercentualOp(78.4), '78%');

  // Teste de renderização dos cards executivos
  const resumoMock = {
    veiculosPatio: 8,
    boxes: { ocupados: 5, livres: 1, bloqueadosPeca: 2 },
    entregas: { hoje: 4, emRisco: 1, atrasadas: 0 },
    alertas: { p1: 1, total: 3 },
    maiorGargalo: { descricao: 'Aguardando Peça Externa', quantidade: 2 }
  };
  const htmlCards = D.renderCardsExecutivosOp(resumoMock, [{ id: 'b1' }], []);
  assert.ok(htmlCards.includes('VEÍCULOS NO PÁTIO'), 'Cards executivos devem conter título');
  assert.ok(htmlCards.includes('Aguardando Peça Externa'), 'Cards executivos devem conter o maior gargalo');
  assert.ok(htmlCards.includes('ALERTAS CRÍTICOS (P1)'), 'Cards executivos devem conter Alertas P1');

  // Teste de renderização do pipeline de estágios
  const estagiosMock = { fila: 2, diagnostico: 1, aprovacao: 2, executando: 3, peca: 1, finalizadaHoje: 4 };
  const htmlPipeline = D.renderPipelineEstagiosOp(estagiosMock, [{}, {}], 'todos');
  assert.ok(htmlPipeline.includes('Fluxo Operacional por Estágio'), 'Pipeline deve conter título');
  assert.ok(htmlPipeline.includes('Fila / Entrada'), 'Pipeline deve conter estágio fila');
  assert.ok(htmlPipeline.includes('Executando'), 'Pipeline deve conter estágio executando');

  // Teste de renderização de métricas de fluxo
  const metricasMock = {
    tempoMedioPatioMinutos: 180,
    tempoMedioEsperaPecaMinutos: null,
    tempoMedioDiagnosticoMinutos: 40,
    taxaOcupacaoBoxesPercentual: 83.3
  };
  const htmlFluxo = D.renderMetricasFluxoOp(resumoMock, metricasMock);
  assert.ok(htmlFluxo.includes('Tempo Médio no Pátio'), 'Métricas de fluxo devem conter tempo no pátio');
  assert.ok(htmlFluxo.includes('3h'), '180 min deve formatar como 3h');
  assert.ok(htmlFluxo.includes('Sem dados suficientes'), 'Valor null de espera por peça deve exibir fallback sem inventar zero');
  assert.ok(htmlFluxo.includes('83%'), 'Taxa de ocupação de 83.3% deve exibir 83%');
});
