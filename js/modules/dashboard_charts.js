/* =====================================================================
   PÁTIO CRM — DASHBOARD OPERACIONAL: GRÁFICOS CHART.JS E DETALHES
   Submódulo extraído de dashboard_metrics.js (< 350 linhas)
   ===================================================================== */

(function () {
  'use strict';

  let _graficos = {};

  function _esc(str) {
    if (typeof esc === 'function') return esc(str);
    if (str === null || str === undefined) return '';
    return String(str).replace(/[&<>"']/g, m => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
    })[m]);
  }

  function formatarHoraSimples(dataOuIso) {
    if (typeof window !== 'undefined' && window.formatarHoraSimples) {
      return window.formatarHoraSimples(dataOuIso);
    }
    if (!dataOuIso) return '--:--';
    try {
      const d = new Date(dataOuIso);
      return isNaN(d.getTime()) ? '--:--' : d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    } catch (e) {
      return '--:--';
    }
  }

  // Destruição segura de gráficos Chart.js
  function destruirGraficosOperacionais() {
    for (const k in _graficos) {
      if (_graficos[k] && typeof _graficos[k].destroy === 'function') {
        try {
          _graficos[k].destroy();
        } catch (e) {
          console.warn('[DashboardOp] Erro ao destruir gráfico:', e);
        }
      }
    }
    _graficos = {};
  }

  // Modo TV (Fullscreen)
  function toggleModoTV() {
    if (typeof document === 'undefined') return;
    const body = document.body;
    const ativo = body.classList.toggle('modo-tv-ativo');
    if (ativo) {
      if (document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen().catch(() => {});
      }
    } else {
      if (document.exitFullscreen && document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
    }
    if (typeof window !== 'undefined' && typeof window.renderDashboardOperacionalSeAtivo === 'function') {
      window.renderDashboardOperacionalSeAtivo();
    }
  }

  // Inicialização dos 4 quadrantes de gráficos
  function inicializarGraficosOperacionais(painelParam) {
    if (typeof Chart === 'undefined') return;
    destruirGraficosOperacionais();

    const painel = painelParam || (typeof window !== 'undefined' && window._painel) || {};
    const graf = painel.graficos || {};

    // 1. Rosca: Ocupação de Boxes
    const canvasBoxes = document.getElementById('chart-boxes-op');
    if (canvasBoxes && graf.ocupacaoBoxes) {
      const dados = graf.ocupacaoBoxes;
      _graficos.boxes = new Chart(canvasBoxes.getContext('2d'), {
        type: 'doughnut',
        data: {
          labels: dados.labels || ['Ocupados', 'Livres', 'Bloqueados por Peça'],
          datasets: [{
            data: dados.data || [0, 0, 0],
            backgroundColor: dados.cores || ['#2563eb', '#10b981', '#f59e0b'],
            borderWidth: 2,
            borderColor: '#ffffff'
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } } },
          cutout: '70%'
        }
      });
    }

    // 2. Barra Horizontal: Estágios de Produção
    const canvasEstagios = document.getElementById('chart-estagios-op');
    if (canvasEstagios && graf.gargalosEstagio) {
      const dados = graf.gargalosEstagio;
      _graficos.estagios = new Chart(canvasEstagios.getContext('2d'), {
        type: 'bar',
        data: {
          labels: dados.labels || [],
          datasets: [{
            label: 'Veículos',
            data: dados.data || [],
            backgroundColor: dados.cores || '#3b82f6',
            borderRadius: 4
          }]
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { beginAtZero: true, ticks: { precision: 0 } },
            y: { ticks: { font: { size: 11 } } }
          }
        }
      });
    }

    // 3. Linha / Área: Entregas da Semana
    const canvasEntregas = document.getElementById('chart-entregas-op');
    if (canvasEntregas && graf.entregasSemana) {
      const dados = graf.entregasSemana;
      _graficos.entregas = new Chart(canvasEntregas.getContext('2d'), {
        type: 'line',
        data: {
          labels: dados.labels || [],
          datasets: [
            {
              label: 'Previstas',
              data: dados.previstas || [],
              borderColor: '#94a3b8',
              backgroundColor: 'rgba(148, 163, 184, 0.1)',
              fill: true,
              tension: 0.3
            },
            {
              label: 'Realizadas',
              data: dados.realizadas || [],
              borderColor: '#10b981',
              backgroundColor: 'rgba(16, 185, 129, 0.2)',
              fill: true,
              tension: 0.3
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } } },
          scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }
        }
      });
    }

    // 4. Barra: Produtividade por Mecânico
    const canvasProd = document.getElementById('chart-produtividade-op');
    if (canvasProd && graf.produtividadeMecanicos) {
      const dados = graf.produtividadeMecanicos;
      _graficos.prod = new Chart(canvasProd.getContext('2d'), {
        type: 'bar',
        data: {
          labels: dados.labels || [],
          datasets: [{
            label: 'Horas Apontadas Hoje',
            data: dados.horas || [],
            backgroundColor: '#059669',
            borderRadius: 4
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            y: { beginAtZero: true, title: { display: true, text: 'Horas' } },
            x: { ticks: { font: { size: 10 } } }
          }
        }
      });
    }
  }

  // Folha Lateral (Sheet) para Detalhes Rápidos de Veículo/OS no Dashboard
  function folhaDetalheOperacional(item) {
    if (!item) return '';
    return `
    <div class="card card-p" style="max-width:680px;margin:0 auto">
      <div class="entre" style="border-bottom:1px solid var(--aco-150);padding-bottom:12px;margin-bottom:16px">
        <div>
          <h3 style="font-size:17px;font-weight:700;margin:0">OS #${item.numeroOS || item.osId} — ${item.placa || 'Sem Placa'}</h3>
          <div class="mini" style="color:var(--aco-500)">${_esc(item.modelo || '')} • ${_esc(item.cliente || '')}</div>
        </div>
        <button class="btn-fechar" data-act="fechar">✕</button>
      </div>

      <div class="grid-2" style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px">
        <div class="card" style="padding:10px;background:var(--aco-050)">
          <div class="mini" style="font-weight:700">BOX / LOCALIZAÇÃO</div>
          <div style="font-size:14px;font-weight:600;margin-top:4px">${_esc(item.boxNome || 'Pátio Geral')}</div>
          <div class="mini" style="color:var(--aco-500)">Entrada: ${formatarHoraSimples(item.dataEntrada)}</div>
        </div>
        <div class="card" style="padding:10px;background:var(--aco-050)">
          <div class="mini" style="font-weight:700">MECÂNICO RESPONSÁVEL</div>
          <div style="font-size:14px;font-weight:600;margin-top:4px">${_esc(item.mecanico || 'Não atribuído')}</div>
          <div class="mini" style="color:var(--aco-500)">Estágio: <b>${_esc(item.estagio || 'Entrada')}</b></div>
        </div>
      </div>

      <div style="margin-bottom:16px">
        <div class="mini" style="font-weight:700;margin-bottom:6px">SERVIÇO / RECLAMAÇÃO</div>
        <div style="padding:10px;background:#f8fafc;border-radius:6px;border:1px solid #e2e8f0;font-size:13px">
          ${_esc(item.servico || item.reclamacao || 'Revisão periódica de veículos pesados')}
        </div>
      </div>

      ${item.gargalo ? `
        <div style="margin-bottom:16px;padding:12px;background:#fef2f2;border:1px solid #fecaca;border-radius:6px">
          <div style="color:#b91c1c;font-weight:700;font-size:12px;display:flex;align-items:center;gap:6px">
            <span>⚠️</span> GARGALO ATIVO
          </div>
          <div style="color:#7f1d1d;font-size:13px;margin-top:4px">${_esc(item.gargalo)}</div>
        </div>
      ` : ''}

      <div class="entre" style="border-top:1px solid var(--aco-150);padding-top:14px">
        <button class="btn btn-secundario" data-act="fechar">Fechar</button>
        <button class="btn btn-primario" data-act="abrir-os-completa" data-id="${item.osId}">
          Abrir Ordem de Serviço Completa
        </button>
      </div>
    </div>`;
  }

  if (typeof window !== 'undefined') {
    window.destruirGraficosOperacionais = destruirGraficosOperacionais;
    window.toggleModoTV = toggleModoTV;
    window.inicializarGraficosOperacionais = inicializarGraficosOperacionais;
    window.folhaDetalheOperacional = folhaDetalheOperacional;
  }
  if (typeof globalThis !== 'undefined') {
    globalThis.destruirGraficosOperacionais = destruirGraficosOperacionais;
    globalThis.toggleModoTV = toggleModoTV;
    globalThis.inicializarGraficosOperacionais = inicializarGraficosOperacionais;
    globalThis.folhaDetalheOperacional = folhaDetalheOperacional;
  }
})();

