/* =====================================================================
   PÁTIO CRM — DASHBOARD OPERACIONAL EM TEMPO REAL
   Visão Executiva, Chão de Oficina, Gargalos, Entregas & Alertas P1-P4
   Coordenador Modular (< 350 linhas)
   ===================================================================== */

(function () {
  'use strict';

  let _painel = null;
  let _carregando = false;
  let _erro = null;
  let _ultimoSucesso = null;
  let _timerPolling = null;
  let _abortController = null;
  let _filtroEstagio = 'todos';
  let _filtroPrioridade = 'todas';
  let _buscaTexto = '';

  async function carregarPainelOperacional({ silencioso = false } = {}) {
    if (!silencioso) {
      _carregando = true;
      _erro = null;
      renderDashboardOperacionalSeAtivo();
    }
    if (_abortController) {
      try { _abortController.abort(); } catch (_) {}
    }
    _abortController = new AbortController();
    try {
      const res = await fetch('/api/operacao/painel', {
        signal: _abortController.signal,
        headers: { 'Accept': 'application/json' }
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      if (data && data.ok) {
        _painel = data;
        _ultimoSucesso = new Date();
        _erro = null;
        if (typeof window !== 'undefined') window._painel = _painel;
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.warn('[DashboardOp] Erro ao carregar painel:', err);
        _erro = err.message || 'Falha na conexão com o servidor';
      }
    } finally {
      _carregando = false;
      renderDashboardOperacionalSeAtivo();
      agendarProximoPolling();
    }
  }

  function agendarProximoPolling() {
    clearTimeout(_timerPolling);
    const viewAtiva = (typeof S !== 'undefined' && S?.ui?.view) || '';
    if (viewAtiva === 'dashboard_operacional' || viewAtiva === 'dashboard') {
      _timerPolling = setTimeout(() => {
        carregarPainelOperacional({ silencioso: true });
      }, 15000);
    }
  }

  function renderDashboardOperacionalSeAtivo() {
    const viewAtiva = (typeof S !== 'undefined' && S?.ui?.view) || '';
    if (viewAtiva === 'dashboard_operacional') {
      const container = document.getElementById('view-conteudo');
      if (container) {
        container.innerHTML = viewDashboardOperacional();
        if (typeof inicializarGraficosOperacionais === 'function') {
          inicializarGraficosOperacionais(_painel);
        } else if (window.inicializarGraficosOperacionais) {
          window.inicializarGraficosOperacionais(_painel);
        }
      }
    }
  }

  async function reconhecerAlerta(alertaId) {
    if (!alertaId) return;
    try {
      const res = await fetch(`/api/operacao/alertas/${encodeURIComponent(alertaId)}/reconhecer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      if (res.ok) {
        if (_painel && Array.isArray(_painel.alertas)) {
          _painel.alertas = _painel.alertas.filter(a => a.id !== alertaId);
        }
        renderDashboardOperacionalSeAtivo();
        if (typeof torrar === 'function') torrar('Alerta reconhecido com sucesso.', 'sucesso');
      }
    } catch (e) {
      console.warn('[DashboardOp] Falha ao reconhecer alerta:', e);
    }
  }

  function viewDashboardOperacional() {
    if (_carregando && !_painel) {
      return `<div class="carregando" style="padding:40px;text-align:center"><div class="spinner"></div><div style="margin-top:12px;color:var(--aco-500)">Carregando Visão Executiva e Chão de Oficina em tempo real...</div></div>`;
    }
    if (_erro && !_painel) {
      return `<div class="card card-p" style="margin:20px 0;border-left:4px solid var(--tijolo)"><div style="font-weight:700;color:var(--tijolo);margin-bottom:6px">Não foi possível carregar o Dashboard Operacional</div><div style="font-size:13px;color:var(--aco-600)">${_erro}</div><button class="btn btn-secundario btn-pequeno" data-act="refresh-op" style="margin-top:12px">Tentar Novamente</button></div>`;
    }

    const p = _painel || {};
    const resumo = p.resumo || {};
    const estagios = p.estagios || {};
    const boxes = p.boxes || [];
    const entregas = p.entregas || {};
    const alertas = p.alertas || [];
    const metricas = p.metricas || {};
    const rentabilidade = p.rentabilidade || {};
    const veiculos = p.veiculos || [];

    let veiculosFiltrados = veiculos;
    if (_filtroEstagio && _filtroEstagio !== 'todos') {
      veiculosFiltrados = veiculosFiltrados.filter(v => (v.estagioId || v.st || '').toLowerCase() === _filtroEstagio.toLowerCase());
    }
    if (_buscaTexto) {
      const b = _buscaTexto.toLowerCase();
      veiculosFiltrados = veiculosFiltrados.filter(v =>
        (v.placa || '').toLowerCase().includes(b) ||
        (v.modelo || '').toLowerCase().includes(b) ||
        (v.cliente || '').toLowerCase().includes(b) ||
        String(v.num || '').includes(b)
      );
    }

    return `
    <div class="dashboard-operacional-wrap" style="padding-bottom:40px">
      <div class="entre" style="margin-bottom:16px;flex-wrap:wrap;gap:12px">
        <div>
          <h2 style="font-size:20px;font-weight:800;letter-spacing:-0.02em;margin:0">Dashboard Operacional & Boxes de Oficina</h2>
          <div class="mini" style="color:var(--aco-500);margin-top:2px">Visão Executiva, Chão de Oficina, Gargalos e Alertas em Tempo Real</div>
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <button class="btn btn-secundario" data-act="toggle-modo-tv" title="Alternar Modo TV Fullscreen">📺 Modo TV</button>
          <button class="btn btn-primario" data-act="refresh-op" title="Atualizar agora">🔄 Atualizar</button>
        </div>
      </div>

      <!-- 1. CARDS EXECUTIVOS PRINCIPAIS -->
      ${typeof renderCardsExecutivosOp === 'function' ? renderCardsExecutivosOp(resumo, boxes, entregas) : (window.DashboardMetrics && window.DashboardMetrics.renderCardsExecutivosOp ? window.DashboardMetrics.renderCardsExecutivosOp(resumo, boxes, entregas) : '')}

      <!-- 2. PIPELINE DE ESTÁGIOS DA OFICINA -->
      ${typeof renderPipelineEstagiosOp === 'function' ? renderPipelineEstagiosOp(estagios, veiculos, _filtroEstagio) : (window.DashboardMetrics && window.DashboardMetrics.renderPipelineEstagiosOp ? window.DashboardMetrics.renderPipelineEstagiosOp(estagios, veiculos, _filtroEstagio) : '')}

      <!-- 3. BOXES DO PÁTIO EM TEMPO REAL (CHÃO DE OFICINA) -->
      ${typeof renderBoxesOp === 'function' ? renderBoxesOp(boxes) : (window.renderBoxesOp ? window.renderBoxesOp(boxes) : '')}

      <!-- 4. ALERTAS OPERACIONAIS PRIORIZADOS & ENTREGAS DO DIA -->
      ${typeof renderAlertasEntregasOp === 'function' ? renderAlertasEntregasOp(alertas, entregas, _filtroPrioridade) : (window.renderAlertasEntregasOp ? window.renderAlertasEntregasOp(alertas, entregas, _filtroPrioridade) : '')}

      <!-- 5. DIAGNÓSTICO DE GARGALOS & MÉTRICAS DE FLUXO -->
      ${typeof renderMetricasFluxoOp === 'function' ? renderMetricasFluxoOp(resumo, metricas) : (window.DashboardMetrics && window.DashboardMetrics.renderMetricasFluxoOp ? window.DashboardMetrics.renderMetricasFluxoOp(resumo, metricas) : '')}

      <!-- 6. GRÁFICOS VISUAIS CHART.JS (4 QUADRANTES) -->
      ${typeof renderGridGraficosOp === 'function' ? renderGridGraficosOp() : (window.DashboardMetrics && window.DashboardMetrics.renderGridGraficosOp ? window.DashboardMetrics.renderGridGraficosOp() : '')}

      <!-- 7. RENTABILIDADE & PRECIFICAÇÃO ASSISTIDA -->
      ${typeof renderRentabilidadeAssistidaOp === 'function' ? renderRentabilidadeAssistidaOp(rentabilidade) : (window.renderRentabilidadeAssistidaOp ? window.renderRentabilidadeAssistidaOp(rentabilidade) : '')}

      <!-- 8. LISTA RÁPIDA DE VEÍCULOS NO PÁTIO -->
      ${typeof renderTabelaVeiculosPatioOp === 'function' ? renderTabelaVeiculosPatioOp(veiculosFiltrados, _buscaTexto) : (window.renderTabelaVeiculosPatioOp ? window.renderTabelaVeiculosPatioOp(veiculosFiltrados, _buscaTexto) : '')}
    </div>`;
  }

  // Delegação de Eventos
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const act = btn.dataset.act;
    if (act === 'refresh-op') {
      carregarPainelOperacional({ silencioso: false });
    } else if (act === 'toggle-modo-tv') {
      if (typeof toggleModoTV === 'function') toggleModoTV();
      else if (window.toggleModoTV) window.toggleModoTV();
    } else if (act === 'filtro-estagio-op' || act === 'filtro-estagio') {
      _filtroEstagio = btn.dataset.estagio || 'todos';
      renderDashboardOperacionalSeAtivo();
    } else if (act === 'filtro-pri-op') {
      _filtroPrioridade = btn.dataset.pri || 'todas';
      renderDashboardOperacionalSeAtivo();
    } else if (act === 'reconhecer-alerta-op') {
      reconhecerAlerta(btn.dataset.id);
    } else if (act === 'abrir-os-op' || act === 'abrir-os-completa') {
      const osId = btn.dataset.os || btn.dataset.id;
      if (typeof S !== 'undefined' && S.ui) {
        S.ui.osAberta = osId;
        S.ui.abaOS = 'servicos';
        if (typeof abrirFolha === 'function' && typeof folhaOS === 'function') {
          abrirFolha(folhaOS);
        }
      }
    } else if (act === 'detalhe-item-op') {
      const osId = btn.dataset.os;
      if (_painel && Array.isArray(_painel.veiculos)) {
        const item = _painel.veiculos.find(v => v.osId === osId);
        if (item && typeof abrirFolha === 'function') {
          const fn = window.folhaDetalheOperacional || function() { return ''; };
          abrirFolha(() => fn(item));
        }
      }
    }
  });

  let _timerBuscaOp = null;
  document.addEventListener('input', (e) => {
    if (e.target && e.target.dataset && e.target.dataset.act === 'busca-op') {
      clearTimeout(_timerBuscaOp);
      _buscaTexto = e.target.value;
      _timerBuscaOp = setTimeout(() => {
        renderDashboardOperacionalSeAtivo();
      }, 200);
    }
  });

  if (typeof window !== 'undefined') {
    window.viewDashboardOperacional = viewDashboardOperacional;
    window.carregarPainelOperacional = carregarPainelOperacional;
    window.reconhecerAlertaOperacional = reconhecerAlerta;
    window.renderDashboardOperacionalSeAtivo = renderDashboardOperacionalSeAtivo;
  }
  if (typeof globalThis !== 'undefined') {
    globalThis.viewDashboardOperacional = viewDashboardOperacional;
    globalThis.carregarPainelOperacional = carregarPainelOperacional;
  }
})();
