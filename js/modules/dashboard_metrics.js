/* =====================================================================
   PÁTIO CRM — MÉTRICAS OPERACIONAIS, KPIS & GRÁFICOS DO PÁTIO
   Módulo extraído na Fase 3 da Modularização do Frontend
   ===================================================================== */

(function () {
  'use strict';

  let _graficos = {};

  // Utilitário de escape seguro contra XSS
  function _esc(str) {
    if (typeof esc === 'function') return esc(str);
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // Verifica se o perfil ativo de trabalho é Mecânico / Chão de Oficina
  function isPerfilMecanico() {
    if (typeof window !== 'undefined' && typeof window.isPerfilMecanico === 'function') {
      return window.isPerfilMecanico();
    }
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

  // Toggle Modo Painel / TV
  function toggleModoTV() {
    if (typeof document === 'undefined' || !document.body) return false;
    const ativado = document.body.classList.toggle('modo-painel-tv');
    try {
      localStorage.setItem('patio_modo_tv', ativado ? '1' : '0');
    } catch (e) {}
    if (typeof torrar === 'function') {
      torrar(ativado ? 'Modo TV ativado (Pressione Esc para sair)' : 'Modo TV desativado');
    }
    if (typeof window !== 'undefined' && typeof window.renderDashboardOperacionalSeAtivo === 'function') {
      window.renderDashboardOperacionalSeAtivo();
    }
    return ativado;
  }

  // Inicialização de Gráficos com Chart.js
  function inicializarGraficosOperacionais(painelParam) {
    const painel = painelParam || (typeof window !== 'undefined' && window._painelOperacional) || null;
    if (typeof Chart === 'undefined') return;
    destruirGraficosOperacionais();

    if (!painel) return;

    // 1. Gráfico de Estágios (Barras Horizontais)
    const ctxEstagios = document.getElementById('chart-estagios-op');
    if (ctxEstagios && painel.estagios) {
      const labels = ['Fila', 'Diagnóstico', 'Aprovação', 'Executando', 'Aguard. Peça', 'Finaliz. Hoje'];
      const dados = [
        painel.estagios.fila || 0,
        painel.estagios.diagnostico || 0,
        painel.estagios.aprovacao || 0,
        painel.estagios.executando || 0,
        painel.estagios.peca || 0,
        painel.estagios.finalizadaHoje || 0
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
    if (ctxAlertas && painel.alertas) {
      const p1 = painel.alertas.filter(a => a.prioridade === 'P1').length;
      const p2 = painel.alertas.filter(a => a.prioridade === 'P2').length;
      const p3 = painel.alertas.filter(a => a.prioridade === 'P3').length;
      const p4 = painel.alertas.filter(a => a.prioridade === 'P4').length;
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
    if (ctxEntregas && painel.entregas) {
      const noPrazo = painel.entregas.filter(e => e.statusEntrega === 'no_prazo').length;
      const emRisco = painel.entregas.filter(e => e.statusEntrega === 'em_risco').length;
      const atrasada = painel.entregas.filter(e => e.statusEntrega === 'atrasada').length;
      const concluida = painel.entregas.filter(e => e.statusEntrega === 'concluida').length;

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
    if (ctxBoxes && painel.boxes) {
      const livres = painel.boxes.filter(b => b.status === 'livre').length;
      const ocupados = painel.boxes.filter(b => b.status === 'ocupado' || b.status === 'atencao').length;
      const bloqueados = painel.boxes.filter(b => b.status === 'bloqueado_peca').length;

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
            <h2 style="font-size:18px;font-weight:700">OS #${_esc(numOS)} — <span class="placa">${_esc(placa)}</span></h2>
            <span class="selo selo-op-st" data-st="${_esc(stNome)}">${_esc(stNome.toUpperCase())}</span>
          </div>
          <div class="mini" style="margin-top:4px;color:var(--aco-600)">
            ${_esc(modelo)} • Cliente: <b>${_esc(cliente)}</b>
          </div>
        </div>
        <button class="btn-fechar" onclick="fecharFolha()">&times;</button>
      </div>

      <div class="grid-2" style="gap:14px;margin-bottom:16px">
        <div class="card card-p" style="background:var(--aco-050)">
          <div class="mini" style="color:var(--aco-500);font-weight:600">LOCALIZAÇÃO & MECÂNICO</div>
          <div style="font-size:16px;font-weight:700;margin-top:4px">${_esc(boxNome)}</div>
          <div class="mini" style="color:var(--aco-600)">Mecânico: <b>${_esc(mecNome)}</b></div>
        </div>
        <div class="card card-p" style="background:var(--aco-050)">
          <div class="mini" style="color:var(--aco-500);font-weight:600">PREVISÃO DE ENTREGA</div>
          <div style="font-size:16px;font-weight:700;margin-top:4px">${_esc(item.prev || 'Não definida')} ${_esc(item.horaPrev || '')}</div>
          <div class="mini" style="color:var(--aco-600)">Entrada: ${_esc(item.abertura ? formatarHoraSimples(item.abertura) : '--:--')}</div>
        </div>
      </div>

      ${item.queixa ? `
      <div class="card card-p" style="margin-bottom:16px;background:var(--aco-050)">
        <div class="mini" style="color:var(--aco-500);font-weight:600">RECLAMAÇÃO / SINTOMA DO CLIENTE</div>
        <div style="margin-top:4px;font-size:13.5px;color:var(--aco-800)">${_esc(item.queixa)}</div>
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
        <button class="btn btn-primario" data-act="ir-para-os" data-id="${_esc(osId)}">
          Abrir Ordem de Serviço Completa
        </button>
      </div>
    </div>`;
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
          ${_esc(resumo.maiorGargalo ? resumo.maiorGargalo.descricao : 'Fluxo Estável')}
        </div>
        <div class="mini kpi-sub" style="color:var(--aco-500)">
          ${resumo.maiorGargalo && resumo.maiorGargalo.quantidade ? `${resumo.maiorGargalo.quantidade} veículos parados` : 'Sem acúmulo excessivo'}
        </div>
      </div>
    </div>`;
  }

  // 2. PIPELINE DE ESTÁGIOS DA OFICINA
  function renderPipelineEstagiosOp(estagios = {}, veiculos = [], filtroEstagio = 'todos') {
    return `
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
          <div class="card-estagio-item ${filtroEstagio === est.id ? 'ativo' : ''}" data-act="filtro-estagio-op" data-estagio="${est.id}" style="border:1px solid var(--aco-200);border-radius:8px;padding:10px;cursor:pointer;background:${filtroEstagio === est.id ? 'var(--aco-150)' : 'var(--branco)'}">
            <div class="mini" style="color:${est.cor};font-weight:600">${_esc(est.label)}</div>
            <div class="num" style="font-size:20px;font-weight:700;margin-top:2px">${est.count}</div>
          </div>
        `).join('')}
      </div>
    </div>`;
  }

  // 5. DIAGNÓSTICO DE GARGALOS & MÉTRICAS DE FLUXO
  function renderMetricasFluxoOp(resumo = {}, metricas = {}) {
    return `
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
                ${_esc(resumo.maiorGargalo ? resumo.maiorGargalo.descricao : 'Sem gargalos críticos')}
              </div>
              <div style="font-size:12.5px;color:var(--aco-600);margin-top:4px">
                ${_esc(resumo.maiorGargalo ? resumo.maiorGargalo.sugestaoAcao : 'O fluxo operacional está distribuído de forma homogênea.')}
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
    </div>`;
  }

  // 6. GRÁFICOS VISUAIS CHART.JS (4 QUADRANTES)
  function renderGridGraficosOp() {
    return `
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
    </div>`;
  }

  // Namespace canônico de métricas
  const DashboardMetrics = {
    formatarTempoOp,
    formatarPercentualOp,
    formatarHoraSimples,
    destruirGraficosOperacionais,
    inicializarGraficosOperacionais,
    folhaDetalheOperacional,
    toggleModoTV,
    renderCardsExecutivosOp,
    renderPipelineEstagiosOp,
    renderMetricasFluxoOp,
    renderGridGraficosOp
  };

  // Exportações explícitas no escopo global
  if (typeof window !== 'undefined') {
    window.DashboardMetrics = DashboardMetrics;
    window.formatarTempoOp = formatarTempoOp;
    window.formatarPercentualOp = formatarPercentualOp;
    window.formatarHoraSimples = formatarHoraSimples;
    window.destruirGraficosOperacionais = destruirGraficosOperacionais;
    window.inicializarGraficosOperacionais = inicializarGraficosOperacionais;
    window.folhaDetalheOperacional = folhaDetalheOperacional;
    window.toggleModoTV = toggleModoTV;
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
    globalThis.destruirGraficosOperacionais = destruirGraficosOperacionais;
    globalThis.inicializarGraficosOperacionais = inicializarGraficosOperacionais;
    globalThis.folhaDetalheOperacional = folhaDetalheOperacional;
    globalThis.toggleModoTV = toggleModoTV;
    globalThis.renderCardsExecutivosOp = renderCardsExecutivosOp;
    globalThis.renderPipelineEstagiosOp = renderPipelineEstagiosOp;
    globalThis.renderMetricasFluxoOp = renderMetricasFluxoOp;
    globalThis.renderGridGraficosOp = renderGridGraficosOp;
  }
})();
