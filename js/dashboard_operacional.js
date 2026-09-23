/* =====================================================================
   PÁTIO CRM — DASHBOARD OPERACIONAL EM TEMPO REAL
   Visão Executiva, Chão de Oficina, Gargalos, Entregas & Alertas P1-P4
   ===================================================================== */

(function () {
  'use strict';

  // Estado interno do módulo
  let _painel = null;
  let _carregando = false;
  let _erro = null;
  let _ultimoSucesso = null;
  let _timerPolling = null;
  let _abortController = null;
  let _graficos = {};
  let _filtroEstagio = 'todos';
  let _filtroPrioridade = 'todas';
  let _buscaTexto = '';

  // Verifica se o perfil ativo de trabalho é Mecânico / Chão de Oficina
  function isPerfilMecanico() {
    const role = (typeof S !== 'undefined' && S && ((S.user && S.user.role) || S.perfil)) || '';
    if (role === 'mecanico') return true;
    if (role && role !== 'mecanico') return false;
    const perfil = typeof S !== 'undefined' && S && S.ui && S.ui.perfilAtivo;
    return perfil === 'mecanico';
  }

  // Formatação segura de tempo (NUNCA inventa zero quando null)
  function formatarTempoOp(minutos) {
    if (minutos === null || minutos === undefined || isNaN(minutos)) {
      return 'Sem dados suficientes';
    }
    if (minutos >= 60) {
      const h = Math.floor(minutos / 60);
      const m = Math.round(minutos % 60);
      return m > 0 ? `${h}h ${m}m` : `${h}h`;
    }
    return `${Math.round(minutos)} min`;
  }

  function formatarPercentualOp(val) {
    if (val === null || val === undefined || isNaN(val)) {
      return 'Sem dados suficientes';
    }
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

  // Destruição segura de gráficos Chart.js
  function destruirGraficos() {
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

  // Requisição assíncrona ao servidor
  async function carregarPainelOperacional({ silencioso = false } = {}) {
    if (_carregando) return;
    _carregando = true;

    if (!silencioso && !_painel) {
      renderDashboardOperacionalSeAtivo();
    }

    if (_abortController) {
      try { _abortController.abort(); } catch (e) {}
    }
    _abortController = new AbortController();

    try {
      const url = '/api/operacao/painel';
      const res = await fetch(url, {
        signal: _abortController.signal,
        headers: {
          'Accept': 'application/json',
          'X-Requested-With': 'XMLHttpRequest'
        }
      });

      if (!res.ok) {
        throw new Error(`Servidor respondeu com status ${res.status}`);
      }

      const json = await res.json();
      if (json && json.painel) {
        _painel = json.painel;
        _ultimoSucesso = new Date();
        _erro = null;
      }
    } catch (err) {
      if (err.name === 'AbortError') return;
      console.warn('[DashboardOp] Falha ao sincronizar painel operacional:', err.message);
      _erro = err.message || 'Falha de conexão com o servidor';
    } finally {
      _carregando = false;
      renderDashboardOperacionalSeAtivo();
      agendarProximoPolling();
    }
  }

  function agendarProximoPolling() {
    if (_timerPolling) clearTimeout(_timerPolling);
    if (typeof S !== 'undefined' && S.ui && S.ui.view === 'operacao' && document.visibilityState !== 'hidden') {
      _timerPolling = setTimeout(() => {
        carregarPainelOperacional({ silencioso: true });
      }, 20000); // 20 segundos
    }
  }

  function renderDashboardOperacionalSeAtivo() {
    if (typeof S !== 'undefined' && S.ui && S.ui.view === 'operacao') {
      const mainEl = document.querySelector('main.wrap');
      if (mainEl) {
        mainEl.innerHTML = viewDashboardOperacional();
        setTimeout(inicializarGraficosOperacionais, 80);
      }
    }
  }

  // Ação de Reconhecer Alerta (Ciente)
  async function reconhecerAlerta(alertaId) {
    if (!alertaId) return;
    try {
      if (typeof torrar === 'function') torrar('Registrando ciência...');
      const res = await fetch(`/api/operacao/alertas/${encodeURIComponent(alertaId)}/reconhecer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ motivo: 'Reconhecido no Dashboard Operacional' })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        if (typeof torrar === 'function') torrar('Alerta reconhecido com sucesso!');
        // Atualiza localmente o alerta para status 'reconhecido'
        if (_painel && Array.isArray(_painel.alertas)) {
          const al = _painel.alertas.find(a => a.id === alertaId);
          if (al) al.status = 'reconhecido';
        }
        renderDashboardOperacionalSeAtivo();
      } else {
        alert(data.error || 'Não foi possível reconhecer o alerta.');
      }
    } catch (err) {
      alert('Erro ao comunicar com o servidor: ' + err.message);
    }
  }

  // Toggle Modo Painel / TV
  function toggleModoTV() {
    const ativado = document.body.classList.toggle('modo-painel-tv');
    try {
      localStorage.setItem('patio_modo_tv', ativado ? '1' : '0');
    } catch (e) {}
    if (typeof torrar === 'function') {
      torrar(ativado ? 'Modo TV ativado (Pressione Esc para sair)' : 'Modo TV desativado');
    }
    renderDashboardOperacionalSeAtivo();
  }

  // Listener para tecla Esc sair do modo TV
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && document.body.classList.contains('modo-painel-tv')) {
      toggleModoTV();
    }
  });

  // Listener para pausar e retomar polling ao mudar aba
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && typeof S !== 'undefined' && S.ui && S.ui.view === 'operacao') {
      carregarPainelOperacional({ silencioso: true });
    }
  });

  // Inicialização de Gráficos com Chart.js
  function inicializarGraficosOperacionais() {
    if (typeof Chart === 'undefined') return;
    destruirGraficos();

    if (!_painel) return;

    // 1. Gráfico de Estágios (Barras Horizontais)
    const ctxEstagios = document.getElementById('chart-estagios-op');
    if (ctxEstagios && _painel.estagios) {
      const labels = ['Fila', 'Diagnóstico', 'Aprovação', 'Executando', 'Aguard. Peça', 'Finaliz. Hoje'];
      const dados = [
        _painel.estagios.fila || 0,
        _painel.estagios.diagnostico || 0,
        _painel.estagios.aprovacao || 0,
        _painel.estagios.executando || 0,
        _painel.estagios.peca || 0,
        _painel.estagios.finalizadaHoje || 0
      ];
      _graficos.estagios = new Chart(ctxEstagios, {
        type: 'bar',
        data: {
          labels,
          datasets: [{
            label: 'Veículos / OS',
            data: dados,
            backgroundColor: [
              '#94a3b8',
              '#3b82f6',
              '#f59e0b',
              '#10b981',
              '#ef4444',
              '#64748b'
            ],
            borderRadius: 6
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          indexAxis: 'y',
          plugins: {
            legend: { display: false },
            tooltip: { cornerRadius: 8 }
          },
          scales: {
            x: { beginAtZero: true, ticks: { precision: 0 } },
            y: { grid: { display: false } }
          }
        }
      });
    }

    // 2. Gráfico de Alertas por Prioridade (Doughnut)
    const ctxAlertas = document.getElementById('chart-alertas-op');
    if (ctxAlertas && _painel.alertas) {
      const p1 = _painel.alertas.filter(a => a.prioridade === 'P1').length;
      const p2 = _painel.alertas.filter(a => a.prioridade === 'P2').length;
      const p3 = _painel.alertas.filter(a => a.prioridade === 'P3').length;
      const p4 = _painel.alertas.filter(a => a.prioridade === 'P4').length;
      const total = p1 + p2 + p3 + p4;

      _graficos.alertas = new Chart(ctxAlertas, {
        type: 'doughnut',
        data: {
          labels: ['P1 Crítico', 'P2 Alto', 'P3 Médio', 'P4 Informativo'],
          datasets: [{
            data: total === 0 ? [0, 0, 0, 0] : [p1, p2, p3, p4],
            backgroundColor: ['#ef4444', '#f97316', '#eab308', '#3b82f6'],
            borderWidth: 2,
            borderColor: '#ffffff'
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: '70%',
          plugins: {
            legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } }
          }
        }
      });
    }

    // 3. Gráfico de Entregas Hoje (Doughnut)
    const ctxEntregas = document.getElementById('chart-entregas-op');
    if (ctxEntregas && _painel.entregas) {
      const noPrazo = _painel.entregas.filter(e => e.statusEntrega === 'no_prazo').length;
      const emRisco = _painel.entregas.filter(e => e.statusEntrega === 'em_risco').length;
      const atrasada = _painel.entregas.filter(e => e.statusEntrega === 'atrasada').length;
      const concluida = _painel.entregas.filter(e => e.statusEntrega === 'concluida').length;

      _graficos.entregas = new Chart(ctxEntregas, {
        type: 'doughnut',
        data: {
          labels: ['No Prazo', 'Em Risco', 'Atrasada', 'Concluída'],
          datasets: [{
            data: [noPrazo, emRisco, atrasada, concluida],
            backgroundColor: ['#10b981', '#f59e0b', '#ef4444', '#94a3b8'],
            borderWidth: 2,
            borderColor: '#ffffff'
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: '70%',
          plugins: {
            legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } }
          }
        }
      });
    }

    // 4. Gráfico de Ocupação de Boxes (Doughnut)
    const ctxBoxes = document.getElementById('chart-boxes-op');
    if (ctxBoxes && _painel.boxes) {
      const livres = _painel.boxes.filter(b => b.status === 'livre').length;
      const ocupados = _painel.boxes.filter(b => b.status === 'ocupado' || b.status === 'atencao').length;
      const bloqueados = _painel.boxes.filter(b => b.status === 'bloqueado_peca').length;

      _graficos.boxes = new Chart(ctxBoxes, {
        type: 'doughnut',
        data: {
          labels: ['Livres', 'Ocupados', 'Bloqueados por Peça'],
          datasets: [{
            data: [livres, ocupados, bloqueados],
            backgroundColor: ['#10b981', '#2563eb', '#ef4444'],
            borderWidth: 2,
            borderColor: '#ffffff'
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: '70%',
          plugins: {
            legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } }
          }
        }
      });
    }
  }

  // Drawer de Detalhe Rápido de Veículo / OS Operacional
  function folhaDetalheOperacional(item) {
    if (!item) return '<div class="card card-p">Nenhum item selecionado.</div>';
    const numOS = item.num || item.osNum || 'S/N';
    const osId = item.osId || item.id;
    const placa = item.placa || 'SEM-PLACA';
    const cliente = item.cliente || 'Não informado';
    const modelo = item.modelo || 'Caminhão';
    const boxNome = item.box || 'Pátio';
    const mecNome = item.mec || 'A definir';
    const stNome = item.st || 'fila';

    return `
    <div class="folha-conteudo">
      <div class="entre" style="border-bottom:1px solid var(--aco-200);padding-bottom:12px;margin-bottom:16px">
        <div>
          <div style="display:flex;align-items:center;gap:8px">
            <h2 style="font-size:18px;font-weight:700">OS #${esc(numOS)} — <span class="placa">${esc(placa)}</span></h2>
            <span class="selo selo-op-st" data-st="${esc(stNome)}">${esc(stNome.toUpperCase())}</span>
          </div>
          <div class="mini" style="margin-top:4px;color:var(--aco-600)">
            ${esc(modelo)} • Cliente: <b>${esc(cliente)}</b>
          </div>
        </div>
        <button class="btn-fechar" onclick="fecharFolha()">&times;</button>
      </div>

      <div class="grid-2" style="gap:14px;margin-bottom:16px">
        <div class="card card-p" style="background:var(--aco-050)">
          <div class="mini" style="color:var(--aco-500);font-weight:600">LOCALIZAÇÃO & MECÂNICO</div>
          <div style="font-size:16px;font-weight:700;margin-top:4px">${esc(boxNome)}</div>
          <div class="mini" style="color:var(--aco-600)">Mecânico: <b>${esc(mecNome)}</b></div>
        </div>
        <div class="card card-p" style="background:var(--aco-050)">
          <div class="mini" style="color:var(--aco-500);font-weight:600">PREVISÃO DE ENTREGA</div>
          <div style="font-size:16px;font-weight:700;margin-top:4px">${esc(item.prev || 'Não definida')} ${esc(item.horaPrev || '')}</div>
          <div class="mini" style="color:var(--aco-600)">Entrada: ${esc(item.abertura ? formatarHoraSimples(item.abertura) : '--:--')}</div>
        </div>
      </div>

      ${item.queixa ? `
      <div class="card card-p" style="margin-bottom:16px;background:var(--aco-050)">
        <div class="mini" style="color:var(--aco-500);font-weight:600">RECLAMAÇÃO / SINTOMA DO CLIENTE</div>
        <div style="margin-top:4px;font-size:13.5px;color:var(--aco-800)">${esc(item.queixa)}</div>
      </div>
      ` : ''}

      ${item.possivelGarantia ? `
      <div class="banner-alerta-garantia" style="background:#fffbeb;border:1px solid #fef3c7;padding:10px 14px;border-radius:8px;margin-bottom:16px;display:flex;align-items:center;gap:10px">
        <span style="font-size:18px">🛡️</span>
        <div>
          <div style="font-weight:700;font-size:13px;color:#b45309">Atenção: Possível Garantia Detectada</div>
          <div class="mini" style="color:#78350f">Veículo possui serviço correlato recente. ${isPerfilMecanico() ? 'Avalie as condições técnicas antes de iniciar a manutenção.' : 'Avalie antes de prosseguir com a cobrança.'}</div>
        </div>
      </div>
      ` : ''}

      <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:20px;border-top:1px solid var(--aco-200);padding-top:14px">
        <button class="btn btn-secundario" onclick="fecharFolha()">Fechar</button>
        <button class="btn btn-primario" data-act="ir-para-os" data-id="${esc(osId)}">
          Abrir Ordem de Serviço Completa
        </button>
      </div>
    </div>`;
  }

  // RENDERIZAÇÃO DA VIEW PRINCIPAL
  function viewDashboardOperacional() {
    // Se ainda não carregou dados, dispara o fetch e exibe esqueleto
    if (!_painel && !_erro) {
      setTimeout(() => carregarPainelOperacional(), 10);
      return `
      <div class="dashboard-op-carregando" style="text-align:center;padding:60px 20px">
        <div class="spinner" style="margin:0 auto 16px"></div>
        <h3 style="font-size:18px;color:var(--aco-700)">Sincronizando Operação do Pátio...</h3>
        <p class="mini" style="color:var(--aco-400)">Consultando boxes, tempos de permanência e alertas em tempo real.</p>
      </div>`;
    }

    const resumo = (_painel && _painel.resumo) || {};
    const boxes = (_painel && _painel.boxes) || [];
    const estagios = (_painel && _painel.estagios) || {};
    const entregas = (_painel && _painel.entregas) || [];
    const alertas = (_painel && _painel.alertas) || [];
    const gargalos = (_painel && _painel.gargalos) || {};
    const metricas = (_painel && _painel.metricas) || {};
    const veiculos = (_painel && _painel.veiculos) || [];

    const horaSinc = _ultimoSucesso ? _ultimoSucesso.toLocaleTimeString('pt-BR') : '--:--:--';
    const modoTVAtivo = document.body.classList.contains('modo-painel-tv');

    // Filtragem de Alertas
    let alertasFiltrados = [...alertas];
    if (_filtroPrioridade !== 'todas') {
      alertasFiltrados = alertasFiltrados.filter(a => a.prioridade === _filtroPrioridade);
    }

    // Filtragem de Veículos na Busca
    let veiculosFiltrados = [...veiculos];
    if (_filtroEstagio !== 'todos') {
      veiculosFiltrados = veiculosFiltrados.filter(v => v.st === _filtroEstagio);
    }
    if (_buscaTexto) {
      const b = _buscaTexto.toLowerCase();
      veiculosFiltrados = veiculosFiltrados.filter(v =>
        (v.placa && v.placa.toLowerCase().includes(b)) ||
        (v.modelo && v.modelo.toLowerCase().includes(b)) ||
        (v.cliente && v.cliente.toLowerCase().includes(b)) ||
        (v.mec && v.mec.toLowerCase().includes(b)) ||
        (String(v.num).includes(b))
      );
    }

    return `
    <div class="dashboard-op ${modoTVAtivo ? 'modo-tv' : ''}">
      <!-- Banner de Falha de Conexão com Fallback Resiliente -->
      ${_erro ? `
      <div class="alerta-banner-op" style="background:#fef2f2;border:1px solid #fee2e2;color:#991b1b;padding:10px 16px;border-radius:10px;margin-bottom:14px;display:flex;align-items:center;justify-content:space-between">
        <div style="display:flex;align-items:center;gap:8px">
          <span>⚠️</span>
          <span><b>Não foi possível atualizar agora.</b> Exibindo últimos dados registrados às ${esc(horaSinc)}.</span>
        </div>
        <button class="btn btn-pequeno btn-secundario" data-act="refresh-op" style="font-size:11px;background:#fff">Tentar Novamente</button>
      </div>
      ` : ''}

      <!-- Barra de Ações do Topo Operacional -->
      <div class="topo-operacao-bar" style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:10px">
        <div style="display:flex;align-items:center;gap:12px">
          <div class="live-indicator" style="display:flex;align-items:center;gap:6px;background:rgba(16,185,129,0.1);padding:4px 10px;border-radius:20px;border:1px solid rgba(16,185,129,0.25)">
            <span class="pulsing-dot" style="display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--verde)"></span>
            <span style="font-weight:700;font-size:11px;color:var(--verde);letter-spacing:0.04em">AO VIVO</span>
          </div>
          <span style="font-size:12.5px;color:var(--aco-500)">
            Atualizado às <b>${esc(horaSinc)}</b> (Intervalo: 20s)
          </span>
        </div>

        <div style="display:flex;align-items:center;gap:8px">
          <button class="btn btn-secundario btn-op-refresh" data-act="refresh-op" title="Atualizar agora" style="display:flex;align-items:center;gap:6px">
            <span class="ico-spin ${_carregando ? 'girando' : ''}">${ico('relogio', 14)}</span>
            <span>Atualizar</span>
          </button>
          <button class="btn ${modoTVAtivo ? 'btn-primario' : 'btn-secundario'}" data-act="toggle-modo-tv" title="Alternar Modo Monitor / TV de Oficina">
            📺 ${modoTVAtivo ? 'Sair do Modo TV' : 'Modo Painel / TV'}
          </button>
        </div>
      </div>

      <!-- 1. CARDS EXECUTIVOS PRINCIPAIS (6 KPIs) -->
      <div class="grid-kpi-op" style="display:grid;grid-template-columns:repeat(auto-fit, minmax(180px, 1fr));gap:12px;margin-bottom:20px">
        <!-- KPI 1: Veículos no Pátio -->
        <div class="card kpi-card-op">
          <div class="mini kpi-titulo">VEÍCULOS NO PÁTIO</div>
          <div class="kpi-valor num" style="color:var(--petroleo)">${resumo.veiculosPatio || 0}</div>
          <div class="mini kpi-sub">${(resumo.boxes && resumo.boxes.ocupados) || 0} em boxes • ${(resumo.boxes && resumo.boxes.livres) || 0} livres</div>
        </div>

        <!-- KPI 2: Boxes Ocupados / Livres -->
        <div class="card kpi-card-op">
          <div class="mini kpi-titulo">BOXES OCUPADOS</div>
          <div class="kpi-valor num" style="color:var(--aco-900)">
            ${(resumo.boxes && resumo.boxes.ocupados) || 0}<span style="font-size:16px;color:var(--aco-400)">/${(boxes.length) || 6}</span>
          </div>
          <div class="mini kpi-sub">${(resumo.boxes && resumo.boxes.bloqueadosPeca) || 0} aguardando peça</div>
        </div>

        <!-- KPI 3: Entregas Hoje -->
        <div class="card kpi-card-op">
          <div class="mini kpi-titulo">ENTREGAS HOJE</div>
          <div class="kpi-valor num" style="color:var(--aco-800)">${(resumo.entregas && resumo.entregas.hoje) || 0}</div>
          <div class="mini kpi-sub">
            <span style="color:var(--verde)">${entregas.filter(e => e.statusEntrega === 'concluida').length} concluídas</span>
          </div>
        </div>

        <!-- KPI 4: Entregas em Risco / Atrasadas -->
        <div class="card kpi-card-op ${((resumo.entregas && (resumo.entregas.emRisco + resumo.entregas.atrasadas)) > 0) ? 'kpi-alerta' : ''}">
          <div class="mini kpi-titulo">ENTREGAS EM RISCO</div>
          <div class="kpi-valor num" style="color:${((resumo.entregas && resumo.entregas.atrasadas) > 0) ? 'var(--tijolo)' : ((resumo.entregas && resumo.entregas.emRisco) > 0) ? 'var(--sinal)' : 'var(--verde)'}">
            ${((resumo.entregas && resumo.entregas.emRisco) || 0) + ((resumo.entregas && resumo.entregas.atrasadas) || 0)}
          </div>
          <div class="mini kpi-sub">
            ${(resumo.entregas && resumo.entregas.atrasadas) || 0} atrasadas • ${(resumo.entregas && resumo.entregas.emRisco) || 0} no limiar
          </div>
        </div>

        <!-- KPI 5: Alertas Críticos P1 -->
        <div class="card kpi-card-op ${((resumo.alertas && resumo.alertas.p1) > 0) ? 'kpi-critico' : ''}">
          <div class="mini kpi-titulo">ALERTAS CRÍTICOS (P1)</div>
          <div class="kpi-valor num" style="color:${((resumo.alertas && resumo.alertas.p1) > 0) ? 'var(--tijolo)' : 'var(--aco-700)'}">
            ${(resumo.alertas && resumo.alertas.p1) || 0}
          </div>
          <div class="mini kpi-sub">${(resumo.alertas && resumo.alertas.total) || 0} alertas totais ativos</div>
        </div>

        <!-- KPI 6: Maior Gargalo -->
        <div class="card kpi-card-op">
          <div class="mini kpi-titulo">MAIOR GARGALO</div>
          <div class="kpi-valor-texto" style="font-size:15px;font-weight:700;color:var(--aco-900);line-height:1.2;margin:6px 0">
            ${esc(resumo.maiorGargalo ? resumo.maiorGargalo.descricao : 'Fluxo Estável')}
          </div>
          <div class="mini kpi-sub" style="color:var(--aco-500)">
            ${resumo.maiorGargalo && resumo.maiorGargalo.quantidade ? `${resumo.maiorGargalo.quantidade} veículos parados` : 'Sem acúmulo excessivo'}
          </div>
        </div>
      </div>

      <!-- 2. PIPELINE DE ESTÁGIOS DA OFICINA -->
      <div class="card card-p" style="margin-bottom:20px">
        <div class="entre" style="margin-bottom:12px">
          <div>
            <h3 style="font-size:14px;font-weight:700">Fluxo Operacional por Estágio</h3>
            <div class="mini" style="color:var(--aco-500)">Distribuição em tempo real das ordens de serviço ativas</div>
          </div>
          <div class="mini" style="color:var(--aco-400)">Clique em um estágio para filtrar a lista</div>
        </div>

        <div class="grid-estagios-op" style="display:grid;grid-template-columns:repeat(auto-fit, minmax(130px, 1fr));gap:8px">
          ${[
            { id: 'todos', label: 'Todos', count: veiculos.length, cor: 'var(--aco-600)' },
            { id: 'fila', label: 'Fila / Entrada', count: estagios.fila || 0, cor: '#94a3b8' },
            { id: 'diagnostico', label: 'Diagnóstico', count: estagios.diagnostico || 0, cor: '#3b82f6' },
            { id: 'aprovacao', label: 'Aprovação', count: estagios.aprovacao || 0, cor: '#f59e0b' },
            { id: 'executando', label: 'Executando', count: estagios.executando || 0, cor: '#10b981' },
            { id: 'peca', label: 'Aguard. Peça', count: estagios.peca || 0, cor: '#ef4444' },
            { id: 'pronto', label: 'Finaliz. Hoje', count: estagios.finalizadaHoje || 0, cor: '#64748b' }
          ].map(est => `
            <div class="card-estagio-item ${_filtroEstagio === est.id ? 'ativo' : ''}" data-act="filtro-estagio-op" data-estagio="${est.id}" style="border:1px solid var(--aco-200);border-radius:8px;padding:10px;cursor:pointer;background:${_filtroEstagio === est.id ? 'var(--aco-150)' : 'var(--branco)'}">
              <div class="mini" style="color:${est.cor};font-weight:600">${esc(est.label)}</div>
              <div class="num" style="font-size:20px;font-weight:700;margin-top:2px">${est.count}</div>
            </div>
          `).join('')}
        </div>
      </div>

      <!-- 3. BOXES DO PÁTIO EM TEMPO REAL (CHÃO DE OFICINA) -->
      <div class="card card-p" style="margin-bottom:20px">
        <div class="entre" style="margin-bottom:14px">
          <div>
            <h3 style="font-size:15px;font-weight:700">Boxes de Manutenção (${boxes.filter(b => b.status !== 'livre').length} Ocupados / ${boxes.filter(b => b.status === 'livre').length} Livres)</h3>
            <div class="mini" style="color:var(--aco-500)">Status físico das baias, mecânicos alocados e tempo de ocupação</div>
          </div>
        </div>

        <div class="grid-boxes-op" style="display:grid;grid-template-columns:repeat(auto-fit, minmax(240px, 1fr));gap:12px">
          ${boxes.map(b => {
            const isLivre = b.status === 'livre';
            const isBloq = b.status === 'bloqueado_peca';
            const isAtencao = b.status === 'atencao';
            const tagClass = isLivre ? 'box-livre' : isBloq ? 'box-bloqueado' : isAtencao ? 'box-atencao' : 'box-ocupado';
            const tagCor = isLivre ? 'var(--verde)' : isBloq ? 'var(--tijolo)' : isAtencao ? 'var(--sinal)' : 'var(--petroleo)';
            const tagLabel = isLivre ? 'LIVRE' : isBloq ? 'AGUARDANDO PEÇA' : isAtencao ? 'TEMPO ELEVADO' : 'OCUPADO';

            return `
            <div class="card card-box-op ${tagClass}" style="border:1px solid var(--aco-200);border-radius:10px;padding:12px;background:var(--branco);position:relative;border-top:4px solid ${tagCor}">
              <div class="entre" style="margin-bottom:8px">
                <div style="font-weight:700;font-size:14px">${esc(b.nome || b.id)}</div>
                <span class="selo" style="font-size:10px;font-weight:700;color:${tagCor};background:rgba(0,0,0,0.03);border:1px solid ${tagCor}">${tagLabel}</span>
              </div>

              ${isLivre ? `
                <div style="padding:16px 0;text-align:center;color:var(--aco-400)">
                  <div style="font-size:22px;margin-bottom:4px">🟢</div>
                  <div style="font-size:12px;font-weight:600">Disponível para entrada</div>
                </div>
              ` : `
                <div class="box-ocupado-conteudo">
                  <div style="display:flex;align-items:center;justify-content:space-between">
                    <span class="placa" style="font-size:13px;color:#000000;font-weight:bold">${esc(b.placa || 'SEM-PLACA')}</span>
                    <button class="btn-link-os" data-act="abrir-os-op" data-os="${esc(b.osId)}" style="font-size:12px;font-weight:700;color:var(--petroleo)">
                      OS #${esc(b.osNum || '')}
                    </button>
                  </div>
                  <div class="mini" style="margin-top:4px;color:var(--aco-700);font-weight:600">
                    ${esc(b.modelo || 'Caminhão')} • ${esc(b.cliente || 'Cliente')}
                  </div>
                  <div class="mini" style="color:var(--aco-500);margin-top:2px">
                    Mecânico: <b>${esc(b.mecanico || 'Não atribuído')}</b>
                  </div>
                  <div class="entre" style="margin-top:10px;border-top:1px dashed var(--aco-200);padding-top:8px">
                    <span class="mini" style="color:var(--aco-500)">Permanência:</span>
                    <span class="num" style="font-weight:700;font-size:12.5px;color:${b.tempoNoBoxHoras >= 4 ? 'var(--tijolo)' : 'var(--aco-800)'}">
                      ${b.tempoNoBoxHoras ? `${b.tempoNoBoxHoras}h no box` : 'Recente'}
                    </span>
                  </div>
                  <div style="margin-top:8px">
                    <button class="btn btn-secundario btn-pequeno w-100" data-act="detalhe-item-op" data-os="${esc(b.osId)}" style="font-size:11px;padding:4px">
                      Ver Ficha Rápida
                    </button>
                  </div>
                </div>
              `}
            </div>`;
          }).join('')}
        </div>
      </div>

      <!-- 3.1 EQUIPE AGORA (CHÃO DE OFICINA & APONTAMENTOS EM TEMPO REAL) -->
      <div class="card card-p" style="margin-bottom:20px">
        <div class="entre" style="margin-bottom:14px">
          <div>
            <h3 style="font-size:15px;font-weight:700">Equipe Agora (${(resumo.equipe && resumo.equipe.totalMecanicos) || 0} Colaboradores Ativos)</h3>
            <div class="mini" style="color:var(--aco-500)">Alocação em tempo real: em serviço, em espera ou livres no pátio</div>
          </div>
          <div style="display:flex;gap:8px">
            <span class="selo" style="background:#ecfdf5;color:#065f46"><b>${(resumo.equipe && resumo.equipe.emServico) || 0}</b> Em Serviço</span>
            <span class="selo" style="background:#fffbeb;color:#92400e"><b>${(resumo.equipe && resumo.equipe.emEspera) || 0}</b> Em Espera</span>
            <span class="selo" style="background:#f1f5f9;color:#334155"><b>${(resumo.equipe && resumo.equipe.livres) || 0}</b> Livres</span>
          </div>
        </div>

        <div class="grid-equipe-agora" style="display:grid;grid-template-columns:repeat(auto-fit, minmax(240px, 1fr));gap:12px">
          ${((resumo.equipe && resumo.equipe.detalhes && resumo.equipe.detalhes.emServico) || []).map(m => `
            <div class="card-equipe-item" style="border-left:4px solid var(--verde);background:var(--aco-050);padding:10px 14px;border-radius:8px">
              <div class="entre">
                <b>${esc(m.nome)}</b>
                <span class="selo" style="background:#d1fae5;color:#065f46;font-size:11px">EM SERVIÇO</span>
              </div>
              <div class="mini" style="margin-top:4px;color:var(--aco-700)">
                OS #${esc(m.osNum || m.osId)} • ${esc(m.serviceNome || 'Serviço')}
              </div>
              <div class="mini" style="margin-top:2px;color:var(--aco-500)">
                Box: <b>${esc(m.boxId || '—')}</b> • Decorrido: <b>${esc(m.tempoDecorridoFormatado)}</b>
              </div>
            </div>
          `).join('')}

          ${((resumo.equipe && resumo.equipe.detalhes && resumo.equipe.detalhes.emEspera) || []).map(m => `
            <div class="card-equipe-item" style="border-left:4px solid var(--sinal);background:var(--aco-050);padding:10px 14px;border-radius:8px">
              <div class="entre">
                <b>${esc(m.nome)}</b>
                <span class="selo" style="background:#fef3c7;color:#92400e;font-size:11px">EM ESPERA</span>
              </div>
              <div class="mini" style="margin-top:4px;color:var(--aco-700)">
                OS #${esc(m.osNum || m.osId)} • Motivo: <b>${esc(m.motivoPausa || 'Pausa')}</b>
              </div>
              <div class="mini" style="margin-top:2px;color:var(--aco-500)">
                Box: <b>${esc(m.boxId || '—')}</b> • Pausado há: <b>${esc(m.tempoDecorridoFormatado)}</b>
              </div>
            </div>
          `).join('')}

          ${((resumo.equipe && resumo.equipe.detalhes && resumo.equipe.detalhes.livres) || []).map(m => `
            <div class="card-equipe-item" style="border-left:4px solid var(--aco-400);background:var(--aco-050);padding:10px 14px;border-radius:8px">
              <div class="entre">
                <b>${esc(m.nome)}</b>
                <span class="selo" style="background:#e2e8f0;color:#334155;font-size:11px">LIVRE</span>
              </div>
              <div class="mini" style="margin-top:4px;color:var(--aco-500)">
                Função: ${esc(m.funcao || 'Mecânico')} • Disponível no pátio
              </div>
            </div>
          `).join('')}

          ${(!resumo.equipe || resumo.equipe.totalMecanicos === 0) ? `
            <div class="mini" style="color:var(--aco-400);padding:10px">Nenhum colaborador registrado na equipe.</div>
          ` : ''}
        </div>
      </div>

      <!-- 4. ALERTAS OPERACIONAIS PRIORIZADOS & ENTREGAS DO DIA (GRID 2 COLUNAS) -->
      <div class="grid-2" style="display:grid;grid-template-columns:repeat(auto-fit, minmax(320px, 1fr));gap:16px;margin-bottom:20px">
        <!-- COLUNA ESQUERDA: ALERTAS PRIORIZADOS (O QUE PRECISA DE ATENÇÃO) -->
        <div class="card card-p">
          <div class="entre" style="margin-bottom:12px">
            <div>
              <h3 style="font-size:15px;font-weight:700">O que Precisa de Atenção Agora</h3>
              <div class="mini" style="color:var(--aco-500)">Alertas ordenados por severidade (P1 a P4)</div>
            </div>
            <div class="filtro-prioridades-pills" style="display:flex;gap:4px">
              ${['todas', 'P1', 'P2', 'P3'].map(p => `
                <button class="btn-pilula-op ${_filtroPrioridade === p ? 'ativo' : ''}" data-act="filtro-pri-op" data-p="${p}" style="font-size:10.5px;padding:2px 6px;border-radius:12px;border:1px solid var(--aco-200);background:${_filtroPrioridade === p ? 'var(--aco-800)' : 'transparent'};color:${_filtroPrioridade === p ? '#fff' : 'var(--aco-600)'}">
                  ${p.toUpperCase()}
                </button>
              `).join('')}
            </div>
          </div>

          <div class="lista-alertas-op" style="display:flex;flex-direction:column;gap:10px;max-height:420px;overflow-y:auto;padding-right:4px">
            ${alertasFiltrados.length === 0 ? `
              <div style="text-align:center;padding:30px 10px;color:var(--aco-400)">
                <div style="font-size:24px;margin-bottom:6px">✅</div>
                <div style="font-weight:600;font-size:13px">Nenhum alerta pendente</div>
                <div class="mini">Tudo operando dentro dos limiares normais.</div>
              </div>
            ` : alertasFiltrados.map(a => {
              const corBadge = a.prioridade === 'P1' ? 'var(--tijolo)' : a.prioridade === 'P2' ? '#f97316' : a.prioridade === 'P3' ? '#eab308' : '#3b82f6';
              const bgBadge = a.prioridade === 'P1' ? '#fef2f2' : a.prioridade === 'P2' ? '#fff7ed' : a.prioridade === 'P3' ? '#fefce8' : '#eff6ff';
              const jaReconhecido = a.status === 'reconhecido';

              return `
              <div class="alerta-card-op" style="border:1px solid var(--aco-200);border-left:4px solid ${corBadge};border-radius:8px;padding:10px 12px;background:var(--branco)">
                <div class="entre" style="margin-bottom:4px">
                  <span class="badge-prioridade-op" style="font-size:10px;font-weight:800;color:${corBadge};background:${bgBadge};padding:2px 6px;border-radius:4px">
                    ${esc(a.prioridade)} • ${esc(a.severidade ? a.severidade.toUpperCase() : 'ALERTA')}
                  </span>
                  <span class="mini" style="color:var(--aco-400)">
                    ${a.geradoEm ? formatarHoraSimples(a.geradoEm) : '--:--'}
                  </span>
                </div>
                <div style="font-size:13px;font-weight:600;color:var(--aco-900);line-height:1.3;margin-bottom:4px">
                  ${esc(a.mensagem)}
                </div>
                <div class="mini" style="color:var(--aco-600);margin-bottom:8px">
                  ${a.recurso && a.recurso.tipo ? `Alvo: <b>${esc(a.recurso.tipo)} ${esc(a.recurso.id || '')}</b>` : ''}
                  ${jaReconhecido ? ' • <span style="color:var(--verde);font-weight:600">✓ Reconhecido</span>' : ''}
                </div>
                <div class="acoes-alerta-op" style="display:flex;gap:6px;justify-content:flex-end">
                  ${!jaReconhecido ? `
                    <button class="btn btn-secundario btn-pequeno" data-act="reconhecer-alerta" data-id="${esc(a.id)}" style="font-size:11px;padding:3px 8px">
                      ✓ Ciente
                    </button>
                  ` : ''}
                  ${a.recurso && a.recurso.id ? `
                    <button class="btn btn-primario btn-pequeno" data-act="abrir-os-op" data-os="${esc(a.recurso.id)}" style="font-size:11px;padding:3px 8px">
                      Abrir OS
                    </button>
                  ` : ''}
                </div>
              </div>`;
            }).join('')}
          </div>
        </div>

        <!-- COLUNA DIREITA: ENTREGAS PROGRAMADAS PARA HOJE -->
        <div class="card card-p">
          <div class="entre" style="margin-bottom:12px">
            <div>
              <h3 style="font-size:15px;font-weight:700">Entregas do Dia (${entregas.length})</h3>
              <div class="mini" style="color:var(--aco-500)">Compromissos de entrega previstos para a jornada de hoje</div>
            </div>
          </div>

          <div class="lista-entregas-op" style="display:flex;flex-direction:column;gap:10px;max-height:420px;overflow-y:auto;padding-right:4px">
            ${entregas.length === 0 ? `
              <div style="text-align:center;padding:30px 10px;color:var(--aco-400)">
                <div style="font-size:24px;margin-bottom:6px">📅</div>
                <div style="font-weight:600;font-size:13px">Nenhuma entrega prometida para hoje</div>
                <div class="mini">As OSs em andamento têm prazos futuros ou não possuem data definida.</div>
              </div>
            ` : entregas.map(e => {
              const isAtrasada = e.statusEntrega === 'atrasada';
              const isRisco = e.statusEntrega === 'em_risco';
              const isConcluida = e.statusEntrega === 'concluida';
              const badgeCor = isAtrasada ? 'var(--tijolo)' : isRisco ? 'var(--sinal)' : isConcluida ? 'var(--aco-500)' : 'var(--verde)';
              const badgeBg = isAtrasada ? '#fef2f2' : isRisco ? '#fffbeb' : isConcluida ? 'var(--aco-150)' : '#ecfdf5';
              const badgeTexto = isAtrasada ? 'ATRASADA' : isRisco ? 'EM RISCO (< 60m)' : isConcluida ? 'CONCLUÍDA' : 'NO PRAZO';

              return `
              <div class="entrega-card-op" style="border:1px solid var(--aco-200);border-radius:8px;padding:10px 12px;background:var(--branco)">
                <div class="entre" style="margin-bottom:4px">
                  <div style="display:flex;align-items:center;gap:6px">
                    <span class="placa" style="font-size:12px;color:#000000;font-weight:bold">${esc(e.placa)}</span>
                    <button class="btn-link-os" data-act="abrir-os-op" data-os="${esc(e.osId)}" style="font-size:12px;font-weight:700;color:var(--petroleo)">
                      OS #${esc(e.num)}
                    </button>
                  </div>
                  <span class="selo" style="font-size:10px;font-weight:800;color:${badgeCor};background:${badgeBg};border:1px solid ${badgeCor}">
                    ${badgeTexto}
                  </span>
                </div>
                <div class="mini" style="color:var(--aco-800);font-weight:600">
                  ${esc(e.modelo)} • ${esc(e.cliente)}
                </div>
                <div class="entre" style="margin-top:6px;font-size:12px;color:var(--aco-600)">
                  <span>Prometido para: <b>${esc(e.horaPrometida || '18:00')}</b></span>
                  <span>Estágio: <b>${esc(e.st ? e.st.toUpperCase() : 'ANDAMENTO')}</b></span>
                </div>
              </div>`;
            }).join('')}
          </div>
        </div>
      </div>

      <!-- 5. DIAGNÓSTICO DE GARGALOS & MÉTRICAS DE FLUXO (SEM MÉTRICAS INVENTADAS) -->
      <div class="grid-2" style="display:grid;grid-template-columns:repeat(auto-fit, minmax(320px, 1fr));gap:16px;margin-bottom:20px">
        <!-- DIAGNÓSTICO DE GARGALO ATUAL -->
        <div class="card card-p">
          <h3 style="font-size:15px;font-weight:700;margin-bottom:4px">Diagnóstico de Gargalo</h3>
          <div class="mini" style="color:var(--aco-500);margin-bottom:12px">Análise heurística de bloqueios e concentração no fluxo</div>

          <div style="background:var(--aco-050);border:1px solid var(--aco-200);border-radius:10px;padding:14px">
            <div style="display:flex;align-items:flex-start;gap:12px">
              <span style="font-size:24px">⏱️</span>
              <div>
                <div style="font-weight:700;font-size:14px;color:var(--aco-900)">
                  ${esc(resumo.maiorGargalo ? resumo.maiorGargalo.descricao : 'Sem gargalos críticos')}
                </div>
                <div style="font-size:12.5px;color:var(--aco-600);margin-top:4px">
                  ${esc(resumo.maiorGargalo ? resumo.maiorGargalo.sugestaoAcao : 'O fluxo operacional está distribuído de forma homogênea.')}
                </div>
              </div>
            </div>
          </div>

          <div class="mini" style="color:var(--aco-400);margin-top:12px">
            💡 Dica: Verifique se as peças pendentes já foram cotadas ou autorizadas pelo cliente.
          </div>
        </div>

        <!-- MÉTRICAS DE EFICIÊNCIA OPERACIONAL (REAIS OU NULL) -->
        <div class="card card-p">
          <h3 style="font-size:15px;font-weight:700;margin-bottom:4px">Métricas de Eficiência Operacional</h3>
          <div class="mini" style="color:var(--aco-500);margin-bottom:12px">Métricas calculadas exclusivamente com base em dados reais registrados</div>

          <div class="grid-2" style="gap:10px">
            <div class="metrica-item-op" style="background:var(--aco-050);padding:10px;border-radius:8px;border:1px solid var(--aco-200)">
              <div class="mini" style="color:var(--aco-500)">Tempo Médio no Pátio</div>
              <div class="num" style="font-size:16px;font-weight:700;margin-top:2px;color:var(--aco-900)">
                ${formatarTempoOp(metricas.tempoMedioPatioMinutos)}
              </div>
            </div>

            <div class="metrica-item-op" style="background:var(--aco-050);padding:10px;border-radius:8px;border:1px solid var(--aco-200)">
              <div class="mini" style="color:var(--aco-500)">Espera por Peças</div>
              <div class="num" style="font-size:16px;font-weight:700;margin-top:2px;color:var(--aco-900)">
                ${formatarTempoOp(metricas.tempoMedioEsperaPecaMinutos)}
              </div>
            </div>

            <div class="metrica-item-op" style="background:var(--aco-050);padding:10px;border-radius:8px;border:1px solid var(--aco-200)">
              <div class="mini" style="color:var(--aco-500)">Tempo de Diagnóstico</div>
              <div class="num" style="font-size:16px;font-weight:700;margin-top:2px;color:var(--aco-900)">
                ${formatarTempoOp(metricas.tempoMedioDiagnosticoMinutos)}
              </div>
            </div>

            <div class="metrica-item-op" style="background:var(--aco-050);padding:10px;border-radius:8px;border:1px solid var(--aco-200)">
              <div class="mini" style="color:var(--aco-500)">Taxa de Ocupação</div>
              <div class="num" style="font-size:16px;font-weight:700;margin-top:2px;color:var(--aco-900)">
                ${formatarPercentualOp(metricas.taxaOcupacaoBoxesPercentual)}
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 6. GRÁFICOS VISUAIS CHART.JS (4 QUADRANTES) -->
      <div class="grid-graficos-op" style="display:grid;grid-template-columns:repeat(auto-fit, minmax(260px, 1fr));gap:14px;margin-bottom:20px">
        <div class="card card-p" style="height:220px">
          <div class="mini" style="color:var(--aco-500);font-weight:700;margin-bottom:8px">ESTÁGIOS OPERACIONAIS</div>
          <div style="position:relative;height:160px"><canvas id="chart-estagios-op"></canvas></div>
        </div>
        <div class="card card-p" style="height:220px">
          <div class="mini" style="color:var(--aco-500);font-weight:700;margin-bottom:8px">SEVERIDADE DE ALERTAS</div>
          <div style="position:relative;height:160px"><canvas id="chart-alertas-op"></canvas></div>
        </div>
        <div class="card card-p" style="height:220px">
          <div class="mini" style="color:var(--aco-500);font-weight:700;margin-bottom:8px">SITUAÇÃO DE ENTREGAS HOJE</div>
          <div style="position:relative;height:160px"><canvas id="chart-entregas-op"></canvas></div>
        </div>
        <div class="card card-p" style="height:220px">
          <div class="mini" style="color:var(--aco-500);font-weight:700;margin-bottom:8px">OCUPAÇÃO DAS BAIAS</div>
          <div style="position:relative;height:160px"><canvas id="chart-boxes-op"></canvas></div>
        </div>
      </div>

      <!-- 7. PROMPTS RÁPIDOS PARA ASSISTENTE VIRTUAL / VOZ IA -->
      <div class="card card-p" style="margin-bottom:20px;background:linear-gradient(135deg, #1e293b 0%, #0f172a 100%);color:#fff">
        <div class="entre" style="margin-bottom:10px">
          <div style="display:flex;align-items:center;gap:8px">
            <span style="font-size:20px">🎙️</span>
            <div>
              <h4 style="color:#fff;font-size:14px">Pergunte à ${esc(S?.cfg?.assistente?.displayName || S?.cfg?.assistant?.displayName || 'Verônica')} sobre a Operação</h4>
              <div class="mini" style="color:var(--aco-400)">Consultas por voz ou texto com resposta em segundos</div>
            </div>
          </div>
          <button type="button" class="btn btn-pequeno btn-neutro" style="background:rgba(255,255,255,0.15);color:#fff;border:1px solid rgba(255,255,255,0.25);cursor:pointer;display:flex;align-items:center;gap:6px" onclick="if(typeof PatioVoz !== 'undefined' && PatioVoz.abrirConfiguracao){ PatioVoz.abrirConfiguracao(); } else if(typeof abrirConfiguracoesAgente === 'function'){ abrirConfiguracoesAgente(); }">
            ⚙️ Configurar Agente
          </button>
        </div>
        <div class="pills-veronica-op" style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn-prompt-op" data-act="prompt-veronica" data-texto="Quais entregas estão em risco hoje?" style="background:rgba(255,255,255,0.1);color:#fff;border:1px solid rgba(255,255,255,0.15);padding:6px 12px;border-radius:16px;font-size:12px">
            "Quais entregas estão em risco hoje?"
          </button>
          <button class="btn-prompt-op" data-act="prompt-veronica" data-texto="Qual é o maior gargalo operacional agora?" style="background:rgba(255,255,255,0.1);color:#fff;border:1px solid rgba(255,255,255,0.15);padding:6px 12px;border-radius:16px;font-size:12px">
            "Qual é o maior gargalo operacional agora?"
          </button>
          <button class="btn-prompt-op" data-act="prompt-veronica" data-texto="Tem algum veículo com manutenção vencida?" style="background:rgba(255,255,255,0.1);color:#fff;border:1px solid rgba(255,255,255,0.15);padding:6px 12px;border-radius:16px;font-size:12px">
            "Manutenções vencidas na frota?"
          </button>
          <button class="btn-prompt-op" data-act="prompt-veronica" data-texto="Tem pós-venda pendente hoje?" style="background:rgba(255,255,255,0.1);color:#fff;border:1px solid rgba(255,255,255,0.15);padding:6px 12px;border-radius:16px;font-size:12px">
            "Pós-venda pendente hoje?"
          </button>
          ${!isPerfilMecanico() ? `
          <button class="btn-prompt-op" data-act="prompt-veronica" data-texto="Quanto posso dar de desconto sem furar a margem?" style="background:rgba(255,255,255,0.1);color:#fff;border:1px solid rgba(255,255,255,0.15);padding:6px 12px;border-radius:16px;font-size:12px">
            "Desconto seguro sem furar a margem?"
          </button>
          ` : ''}
        </div>
      </div>

      <!-- 7.2 CARD COMPACTO: CRM, AGENDAMENTOS E MANUTENÇÃO PREVENTIVA -->
      <div class="card card-p" style="margin-bottom:20px;border-left:4px solid #3b82f6">
        <div class="entre" style="margin-bottom:12px">
          <div>
            <h4 style="margin:0;font-size:14px;color:var(--aco-900);font-weight:700">Relacionamento, Frotas & Agendamentos</h4>
            <div class="mini" style="color:var(--aco-500)">Visão proativa de preventivas e pós-venda</div>
          </div>
          <span class="selo selo-azul">CRM Ativo</span>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(180px, 1fr));gap:12px">
          <div style="background:#f8fafc;padding:10px;border-radius:6px;border:1px solid var(--aco-200)">
            <div class="mini" style="color:var(--aco-500);font-weight:700">AGENDADOS HOJE</div>
            <div style="font-size:20px;font-weight:800;color:var(--aco-900)">
              ${(S.appointments || []).filter(a => a.scheduledDate === new Date().toISOString().slice(0, 10)).length}
            </div>
            <div class="mini" style="color:var(--aco-400)">Previsão de chegada</div>
          </div>
          <div style="background:#f8fafc;padding:10px;border-radius:6px;border:1px solid var(--aco-200)">
            <div class="mini" style="color:#dc2626;font-weight:700">MANUTENÇÕES VENCIDAS</div>
            <div style="font-size:20px;font-weight:800;color:#dc2626">
              ${(S.maintenancePlans || []).reduce((acc, p) => acc + (p.items || []).filter(i => i.status === 'vencido').length, 0)}
            </div>
            <div class="mini" style="color:var(--aco-400)">Exigem contato proativo</div>
          </div>
          <div style="background:#f8fafc;padding:10px;border-radius:6px;border:1px solid var(--aco-200)">
            <div class="mini" style="color:#d97706;font-weight:700">MANUTENÇÕES PRÓXIMAS</div>
            <div style="font-size:20px;font-weight:800;color:#d97706">
              ${(S.maintenancePlans || []).reduce((acc, p) => acc + (p.items || []).filter(i => i.status === 'proximo').length, 0)}
            </div>
            <div class="mini" style="color:var(--aco-400)">Próximos 15 dias / 10% km</div>
          </div>
          <div style="background:#f8fafc;padding:10px;border-radius:6px;border:1px solid var(--aco-200)">
            <div class="mini" style="color:#2563eb;font-weight:700">PÓS-VENDA PENDENTE</div>
            <div style="font-size:20px;font-weight:800;color:#2563eb">
              ${(S.afterSales || []).filter(a => a.status === 'pendente').length}
            </div>
            <div class="mini" style="color:var(--aco-400)">Follow-up pós-entrega</div>
          </div>
        </div>
      </div>

      <!-- 7.5 PAINEL DE RENTABILIDADE & PRECIFICAÇÃO ASSISTIDA (Oculto para perfil mecânico) -->
      ${!isPerfilMecanico() ? `
      <div class="card card-p" style="margin-bottom:20px;border-left:4px solid #10b981">
        <div class="entre" style="margin-bottom:12px;flex-wrap:wrap;gap:10px">
          <div>
            <div style="display:flex;align-items:center;gap:8px">
              <span style="font-size:18px">💰</span>
              <h3 style="font-size:15px;font-weight:700">Rentabilidade & Proteção de Margem</h3>
            </div>
            <div class="mini" style="color:var(--aco-500);margin-top:2px">Precificação assistida e proteção determinística contra vendas abaixo do custo</div>
          </div>
          <div style="display:flex;gap:8px">
            <button class="btn btn-pequeno btn-neutro" data-act="ver-rentabilidade-detalhes" style="font-size:12px">
              📊 Relatório de Rentabilidade
            </button>
          </div>
        </div>

        <div class="grid-4" style="display:grid;grid-template-columns:repeat(auto-fit, minmax(200px, 1fr));gap:12px;margin-bottom:12px">
          <div style="background:var(--aco-050);padding:12px;border-radius:8px;border:1px solid var(--aco-200)">
            <div class="mini" style="color:var(--aco-500)">Meta de Margem Padrão</div>
            <div style="font-size:18px;font-weight:700;color:#10b981;margin-top:4px">
              ${(window.S?.cfg?.precificacao?.margemAlvoPadrao || 35)}%
            </div>
            <div class="mini" style="color:var(--aco-400);margin-top:2px">Piso de segurança: ${(window.S?.cfg?.precificacao?.margemMinimaPadrao || 20)}%</div>
          </div>

          <div style="background:var(--aco-050);padding:12px;border-radius:8px;border:1px solid var(--aco-200)">
            <div class="mini" style="color:var(--aco-500)">Política de Margem</div>
            <div style="font-size:16px;font-weight:700;color:var(--aco-800);margin-top:4px;text-transform:uppercase">
              ${esc(window.S?.cfg?.precificacao?.modo || 'alertar')}
            </div>
            <div class="mini" style="color:var(--aco-400);margin-top:2px">Requer override para venda abaixo</div>
          </div>

          <div style="background:var(--aco-050);padding:12px;border-radius:8px;border:1px solid var(--aco-200)">
            <div class="mini" style="color:var(--aco-500)">Amostra Mínima Histórica</div>
            <div style="font-size:18px;font-weight:700;color:var(--aco-800);margin-top:4px">
              ${(window.S?.cfg?.precificacao?.amostraMinimaHistorico || 5)} OS
            </div>
            <div class="mini" style="color:var(--aco-400);margin-top:2px">Mediana real para corte de outliers</div>
          </div>

          <div style="background:var(--aco-050);padding:12px;border-radius:8px;border:1px solid var(--aco-200)">
            <div class="mini" style="color:var(--aco-500)">Simulador de Desconto</div>
            <div style="margin-top:6px">
              <span class="badge" style="background:#ecfdf5;color:#059669;font-weight:600;padding:4px 8px;border-radius:4px">
                Ativo & Protegido
              </span>
            </div>
            <div class="mini" style="color:var(--aco-400);margin-top:4px">Bloqueio automático de prejuízo</div>
          </div>
        </div>
      </div>
      ` : ''}

      <!-- 8. LISTA RÁPIDA DE VEÍCULOS NO PÁTIO (BUSCA E FILTRO) -->
      <div class="card card-p">
        <div class="entre" style="margin-bottom:14px;flex-wrap:wrap;gap:10px">
          <div>
            <h3 style="font-size:15px;font-weight:700">Veículos no Pátio (${veiculosFiltrados.length})</h3>
            <div class="mini" style="color:var(--aco-500)">Acesso rápido a todos os veículos com ordens de serviço ativas</div>
          </div>
          <div style="display:flex;align-items:center;gap:8px">
            <input type="text" class="campo-busca-op" placeholder="Buscar placa, modelo, cliente..." value="${esc(_buscaTexto)}" data-act="busca-op" style="padding:6px 12px;border-radius:6px;border:1px solid var(--aco-300);font-size:12.5px;width:240px">
          </div>
        </div>

        <div class="tabela-responsiva">
          <table class="tabela" style="width:100%">
            <thead>
              <tr>
                <th>Placa / OS</th>
                <th>Veículo & Cliente</th>
                <th>Box / Mecânico</th>
                <th>Estágio</th>
                <th>Previsão</th>
                <th>Avisos</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              ${veiculosFiltrados.length === 0 ? `
                <tr>
                  <td colspan="7" style="text-align:center;padding:24px;color:var(--aco-400)">
                    Nenhum veículo encontrado para os filtros selecionados.
                  </td>
                </tr>
              ` : veiculosFiltrados.map(v => `
                <tr>
                  <td>
                    <span class="placa" style="color:#000000;font-weight:bold">${esc(v.placa)}</span>
                    <div class="mini" style="color:var(--aco-500);margin-top:2px">OS #${esc(v.num)}</div>
                  </td>
                  <td>
                    <div style="font-weight:600">${esc(v.modelo)}</div>
                    <div class="mini" style="color:var(--aco-600)">${esc(v.cliente)}</div>
                  </td>
                  <td>
                    <div style="font-weight:600">${esc(v.box)}</div>
                    <div class="mini" style="color:var(--aco-500)">${esc(v.mec)}</div>
                  </td>
                  <td>
                    <span class="selo selo-op-st" data-st="${esc(v.st)}">${esc(String(v.st || '').toUpperCase())}</span>
                  </td>
                  <td>
                    <div class="mini"><b>${esc(v.prev || '--')}</b> ${esc(v.horaPrev || '')}</div>
                  </td>
                  <td>
                    ${v.possivelGarantia ? '<span class="selo" style="background:#fef3c7;color:#b45309;font-size:10px">🛡️ Garantia</span> ' : ''}
                    ${v.alertasQtd > 0 ? `<span class="selo" style="background:#fee2e2;color:#b91c1c;font-size:10px">${v.alertasQtd} alerta(s)</span>` : ''}
                  </td>
                  <td>
                    <div style="display:flex;gap:4px">
                      <button class="btn btn-secundario btn-pequeno" data-act="detalhe-item-op" data-os="${esc(v.osId)}" style="font-size:11px;padding:3px 6px">
                        Detalhes
                      </button>
                      <button class="btn btn-primario btn-pequeno" data-act="abrir-os-op" data-os="${esc(v.osId)}" style="font-size:11px;padding:3px 6px">
                        Abrir OS
                      </button>
                    </div>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>`;
  }

  // Delegação de Eventos Específicos do Dashboard Operacional
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const act = btn.dataset.act;

    if (act === 'refresh-op') {
      carregarPainelOperacional({ silencioso: false });
    } else if (act === 'toggle-modo-tv') {
      toggleModoTV();
    } else if (act === 'filtro-estagio-op') {
      _filtroEstagio = btn.dataset.estagio || 'todos';
      renderDashboardOperacionalSeAtivo();
    } else if (act === 'filtro-pri-op') {
      _filtroPrioridade = btn.dataset.p || 'todas';
      renderDashboardOperacionalSeAtivo();
    } else if (act === 'reconhecer-alerta') {
      const id = btn.dataset.id;
      reconhecerAlerta(id);
    } else if (act === 'abrir-os-op') {
      const osId = btn.dataset.os;
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
          abrirFolha(() => folhaDetalheOperacional(item));
        }
      }
    } else if (act === 'ir-para-os') {
      const osId = btn.dataset.id;
      if (typeof S !== 'undefined' && S.ui) {
        S.ui.osAberta = osId;
        S.ui.abaOS = 'servicos';
        if (typeof abrirFolha === 'function' && typeof folhaOS === 'function') {
          abrirFolha(folhaOS);
        }
      }
    } else if (act === 'prompt-veronica') {
      const texto = btn.dataset.texto;
      if (typeof PatioVoz !== 'undefined' && typeof PatioVoz.abrirDrawer === 'function' && typeof PatioVoz.enviarComandoTexto === 'function') {
        PatioVoz.abrirDrawer();
        PatioVoz.enviarComandoTexto(texto);
      } else {
        alert('Comando: "' + texto + '". Por favor, abra o assistente de voz.');
      }
    }
  });

  // Busca debounced
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

  // Expõe no escopo global para integração com js/app.js
  window.viewDashboardOperacional = viewDashboardOperacional;
  window.carregarPainelOperacional = carregarPainelOperacional;
  window.inicializarGraficosOperacionais = inicializarGraficosOperacionais;
  window.destruirGraficosOperacionais = destruirGraficos;
  window.reconhecerAlertaOperacional = reconhecerAlerta;
  window.toggleModoTV = toggleModoTV;
})();
