/* =====================================================================
   PÁTIO CRM — MÉTRICAS, CARDS EXECUTIVOS E PIPELINE DO DASHBOARD
   Submódulo modular (< 350 linhas)
   ===================================================================== */

(function () {
  'use strict';

  function _esc(str) {
    if (typeof esc === 'function') return esc(str);
    if (str === null || str === undefined) return '';
    return String(str).replace(/[&<>"']/g, m => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
    })[m]);
  }

  function isPerfilMecanico() {
    if (typeof window !== 'undefined' && typeof window.isPerfilMecanico === 'function') {
      return window.isPerfilMecanico();
    }
    try {
      const u = (typeof S !== 'undefined' && S?.usuarioAtual) || {};
      const perfil = (u.perfil || u.role || '').toLowerCase();
      return perfil === 'mecanico' || perfil === 'mecânico';
    } catch (_) {
      return false;
    }
  }

  // Formatador determinístico de minutos para horas e minutos
  function formatarTempoOp(minutos) {
    if (minutos === null || minutos === undefined || isNaN(minutos)) return 'Sem dados suficientes';
    if (minutos >= 60) {
      const h = Math.floor(minutos / 60);
      const m = Math.round(minutos % 60);
      return m > 0 ? `${h}h ${m}m` : `${h}h`;
    }
    return `${Math.round(minutos)} min`;
  }

  // Formatador determinístico de percentuais
  function formatarPercentualOp(val) {
    if (val === null || val === undefined || isNaN(val)) return 'Sem dados suficientes';
    return `${Math.round(val)}%`;
  }

  function formatarHoraSimples(dataOuIso) {
    if (!dataOuIso) return '--:--';
    try {
      const d = new Date(dataOuIso);
      return isNaN(d.getTime()) ? '--:--' : d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    } catch (e) {
      return '--:--';
    }
  }

  // 1. CARDS EXECUTIVOS PRINCIPAIS (6 KPIs)
  function renderCardsExecutivosOp(resumo = {}, boxes = [], entregas = []) {
    return `
    <div class="grid-kpi-op" style="display:grid;grid-template-columns:repeat(auto-fit, minmax(180px, 1fr));gap:12px;margin-bottom:20px">
      <!-- KPI 1: Veículos no Pátio -->
      <div class="card kpi-card-op">
        <div class="mini kpi-titulo">VEÍCULOS NO PÁTIO</div>
        <div class="kpi-valor num" style="color:var(--petroleo)">${resumo.veiculosPatio || 0}</div>
        <div class="mini kpi-sub">${(resumo.boxes && resumo.boxes.ocupados) || 0} em boxes • ${(resumo.boxes && resumo.boxes.livres) || 0} livres</div>
      </div>

      <!-- KPI 2: Boxes Ocupados / Taxa -->
      <div class="card kpi-card-op">
        <div class="mini kpi-titulo">BOXES OCUPADOS</div>
        <div class="kpi-valor num" style="color:var(--azul, #2563eb)">${(resumo.boxes && resumo.boxes.ocupados) || 0}</div>
        <div class="mini kpi-sub">${(resumo.boxes && resumo.boxes.bloqueadosPeca) ? `<span style="color:var(--tijolo)">${resumo.boxes.bloqueadosPeca} bloqueados por peça</span>` : 'Fluxo operacional livre'}</div>
      </div>

      <!-- KPI 3: Entregas Hoje -->
      <div class="card kpi-card-op">
        <div class="mini kpi-titulo">PREVISTAS HOJE</div>
        <div class="kpi-valor num" style="color:var(--verde, #16a34a)">${(resumo.entregas && resumo.entregas.hoje) || 0}</div>
        <div class="mini kpi-sub">${(resumo.entregas && resumo.entregas.emRisco) ? `<span style="color:var(--ouro)">⚠️ ${resumo.entregas.emRisco} em risco</span>` : 'No cronograma previsto'}</div>
      </div>

      <!-- KPI 4: Entregas em Risco / Atrasadas -->
      <div class="card kpi-card-op">
        <div class="mini kpi-titulo">EM RISCO / ATRASO</div>
        <div class="kpi-valor num" style="color:${((resumo.entregas && (resumo.entregas.atrasadas || resumo.entregas.emRisco)) ? 'var(--tijolo)' : 'var(--verde)')}">
          ${((resumo.entregas && resumo.entregas.atrasadas) || 0) + ((resumo.entregas && resumo.entregas.emRisco) || 0)}
        </div>
        <div class="mini kpi-sub">${((resumo.entregas && resumo.entregas.atrasadas) > 0) ? `${resumo.entregas.atrasadas} prazo estourado` : 'Sem atrasos críticos'}</div>
      </div>

      <!-- KPI 5: Alertas Críticos P1 -->
      <div class="card kpi-card-op">
        <div class="mini kpi-titulo">ALERTAS CRÍTICOS (P1)</div>
        <div class="kpi-valor num" style="color:${((resumo.alertas && resumo.alertas.p1 > 0) ? 'var(--tijolo)' : 'var(--aco-400)')}">
          ${(resumo.alertas && resumo.alertas.p1) || 0}
        </div>
        <div class="mini kpi-sub">${(resumo.alertas && resumo.alertas.total) || 0} alertas totais no pátio</div>
      </div>

      <!-- KPI 6: Maior Gargalo Ativo -->
      <div class="card kpi-card-op" style="background:#fefce8;border:1px solid #fef08a">
        <div class="mini kpi-titulo" style="color:#854d0e">MAIOR GARGALO</div>
        <div style="font-weight:700;font-size:13px;color:#a16207;margin-top:6px;line-height:1.3">
          ${(resumo.maiorGargalo && resumo.maiorGargalo.descricao) || 'Nenhum gargalo'}
        </div>
        <div class="mini" style="color:#ca8a04;margin-top:4px">
          ${(resumo.maiorGargalo && resumo.maiorGargalo.quantidade) ? `${resumo.maiorGargalo.quantidade} veículo(s) afetados` : 'Produção fluindo normalmente'}
        </div>
      </div>
    </div>`;
  }

  // 2. PIPELINE HORIZONTAL DE ESTÁGIOS
  function renderPipelineEstagiosOp(estagios = {}, veiculos = [], filtroEstagio = 'todos') {
    const lista = [
      { id: 'todos', label: 'Todos os Veículos', count: veiculos.length },
      { id: 'fila', label: 'Fila / Entrada', count: estagios.fila || 0 },
      { id: 'diagnostico', label: 'Diagnóstico', count: estagios.diagnostico || 0 },
      { id: 'aprovacao', label: 'Aguard. Aprovação', count: estagios.aprovacao || 0 },
      { id: 'executando', label: 'Executando', count: estagios.executando || 0 },
      { id: 'peca', label: 'Esperando Peça', count: estagios.peca || 0 },
      { id: 'finalizadaHoje', label: 'Entregues Hoje', count: estagios.finalizadaHoje || 0 }
    ];

    return `
    <div class="card card-p" style="margin-bottom:20px">
      <div class="entre" style="margin-bottom:12px">
        <div>
          <h3 style="font-size:15px;font-weight:700">Fluxo Operacional por Estágio</h3>
          <div class="mini" style="color:var(--aco-500)">Selecione um estágio para filtrar os veículos na tabela abaixo</div>
        </div>
      </div>

      <div class="pipeline-estagios-op" style="display:grid;grid-template-columns:repeat(auto-fit, minmax(130px, 1fr));gap:8px">
        ${lista.map(item => `
          <button class="etapa-pipeline-op ${filtroEstagio === item.id ? 'ativo' : ''}" data-act="filtro-estagio" data-estagio="${item.id}">
            <div class="mini etapa-label">${item.label}</div>
            <div class="etapa-count num">${item.count}</div>
          </button>
        `).join('')}
      </div>
    </div>`;
  }

  // 2.5 BARRA DE MÉTRICAS OPERACIONAIS
  function renderMetricasFluxoOp(resumo = {}, metricas = {}) {
    const tempoPatio = formatarTempoOp(metricas.tempoMedioPatioMinutos);
    const esperaPeca = formatarTempoOp(metricas.tempoMedioEsperaPecaMinutos);
    const diag = formatarTempoOp(metricas.tempoMedioDiagnosticoMinutos);
    const taxaOcupacao = formatarPercentualOp(metricas.taxaOcupacaoBoxesPercentual);

    return `
    <div class="card card-p" style="margin-bottom:20px;background:var(--aco-050);border:1px solid var(--aco-200)">
      <div class="grid-4" style="display:grid;grid-template-columns:repeat(auto-fit, minmax(160px, 1fr));gap:12px;text-align:center">
        <div>
          <div class="mini" style="color:var(--aco-500);font-weight:600">Tempo Médio no Pátio</div>
          <div style="font-size:16px;font-weight:800;color:var(--petroleo);margin-top:2px">${tempoPatio}</div>
        </div>
        <div>
          <div class="mini" style="color:var(--aco-500);font-weight:600">Tempo Espera por Peça</div>
          <div style="font-size:16px;font-weight:800;color:${esperaPeca !== 'Sem dados suficientes' ? 'var(--tijolo)' : 'var(--aco-500)'};margin-top:2px">${esperaPeca}</div>
        </div>
        <div>
          <div class="mini" style="color:var(--aco-500);font-weight:600">Tempo Médio Diagnóstico</div>
          <div style="font-size:16px;font-weight:800;color:var(--azul);margin-top:2px">${diag}</div>
        </div>
        <div>
          <div class="mini" style="color:var(--aco-500);font-weight:600">Taxa Ocupação dos Boxes</div>
          <div style="font-size:16px;font-weight:800;color:var(--verde);margin-top:2px">${taxaOcupacao}</div>
        </div>
      </div>
    </div>`;
  }

  // 6. GRÁFICOS VISUAIS CHART.JS (4 QUADRANTES)
  function renderGridGraficosOp() {
    return `
    <div class="grid-graficos-op" style="display:grid;grid-template-columns:repeat(auto-fit, minmax(280px, 1fr));gap:16px;margin-bottom:20px">
      <div class="card card-p">
        <h4 style="font-size:13px;font-weight:700;margin-bottom:10px">Ocupação de Boxes (Hoje)</h4>
        <div style="position:relative;height:180px"><canvas id="chart-boxes-op"></canvas></div>
      </div>
      <div class="card card-p">
        <h4 style="font-size:13px;font-weight:700;margin-bottom:10px">Veículos por Estágio</h4>
        <div style="position:relative;height:180px"><canvas id="chart-estagios-op"></canvas></div>
      </div>
      <div class="card card-p">
        <h4 style="font-size:13px;font-weight:700;margin-bottom:10px">Entregas da Semana</h4>
        <div style="position:relative;height:180px"><canvas id="chart-entregas-op"></canvas></div>
      </div>
      <div class="card card-p">
        <h4 style="font-size:13px;font-weight:700;margin-bottom:10px">Produtividade por Mecânico (h)</h4>
        <div style="position:relative;height:180px"><canvas id="chart-produtividade-op"></canvas></div>
      </div>
    </div>`;
  }

  const DashboardMetrics = {
    formatarTempoOp,
    formatarPercentualOp,
    formatarHoraSimples,
    destruirGraficosOperacionais: (typeof window !== 'undefined' && window.destruirGraficosOperacionais) || function () {},
    inicializarGraficosOperacionais: (typeof window !== 'undefined' && window.inicializarGraficosOperacionais) || function () {},
    folhaDetalheOperacional: (typeof window !== 'undefined' && window.folhaDetalheOperacional) || function () { return ''; },
    toggleModoTV: (typeof window !== 'undefined' && window.toggleModoTV) || function () {},
    renderCardsExecutivosOp,
    renderPipelineEstagiosOp,
    renderMetricasFluxoOp,
    renderGridGraficosOp
  };

  if (typeof window !== 'undefined') {
    window.DashboardMetrics = DashboardMetrics;
    window.formatarTempoOp = formatarTempoOp;
    window.formatarPercentualOp = formatarPercentualOp;
    window.formatarHoraSimples = formatarHoraSimples;
    window.renderCardsExecutivosOp = renderCardsExecutivosOp;
    window.renderPipelineEstagiosOp = renderPipelineEstagiosOp;
    window.renderMetricasFluxoOp = renderMetricasFluxoOp;
    window.renderGridGraficosOp = renderGridGraficosOp;
  }
  if (typeof globalThis !== 'undefined') {
    globalThis.DashboardMetrics = DashboardMetrics;
    globalThis.formatarTempoOp = formatarTempoOp;
    globalThis.formatarPercentualOp = formatarPercentualOp;
    globalThis.formatarHoraSimples = formatarHoraSimples;
    globalThis.renderCardsExecutivosOp = renderCardsExecutivosOp;
    globalThis.renderPipelineEstagiosOp = renderPipelineEstagiosOp;
    globalThis.renderMetricasFluxoOp = renderMetricasFluxoOp;
    globalThis.renderGridGraficosOp = renderGridGraficosOp;
  }
})();
