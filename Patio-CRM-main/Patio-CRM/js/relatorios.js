/* =====================================================================
   PÁTIO CRM — MÓDULO DE RELATÓRIOS EXECUTIVOS, BI, EXPORTAÇÕES & BACKUP
   Design corporativo de alta precisão para gestão de oficinas pesadas
===================================================================== */

// Estado interno dos filtros de relatório
let relState = {
  periodo: 'mes', // 'hoje', '7d', 'mes', 'mes_ant', 'ano', 'custom'
  dIni: hoje().slice(0, 7) + '-01',
  dFim: hoje(),
  tipo: 'executivo' // 'executivo', 'os', 'estoque', 'financeiro', 'mecanicos'
};

let chartEvolucaoInstance = null;
let chartComposicaoInstance = null;

/* ---------------- Utilitário de Filtro de Datas ---------------- */
function setPeriodoRelatorio(p) {
  relState.periodo = p;
  const dH = hoje();
  const ano = dH.slice(0, 4);
  const mes = parseInt(dH.slice(5, 7), 10);

  if (p === 'hoje') {
    relState.dIni = dH;
    relState.dFim = dH;
  } else if (p === '7d') {
    relState.dIni = addDias(dH, -7);
    relState.dFim = dH;
  } else if (p === 'mes') {
    relState.dIni = `${ano}-${String(mes).padStart(2, '0')}-01`;
    relState.dFim = dH;
  } else if (p === 'mes_ant') {
    const mesAnt = mes === 1 ? 12 : mes - 1;
    const anoAnt = mes === 1 ? parseInt(ano, 10) - 1 : ano;
    const ultimoDia = new Date(anoAnt, mesAnt, 0).getDate();
    relState.dIni = `${anoAnt}-${String(mesAnt).padStart(2, '0')}-01`;
    relState.dFim = `${anoAnt}-${String(mesAnt).padStart(2, '0')}-${String(ultimoDia).padStart(2, '0')}`;
  } else if (p === 'ano') {
    relState.dIni = `${ano}-01-01`;
    relState.dFim = dH;
  }
  render();
}

/* ---------------- Processamento de Dados & Métricas ---------------- */
function calcularMetricasRelatorio() {
  const dIni = relState.dIni;
  const dFim = relState.dFim;

  // Filtrar Ordens de Serviço do período
  const todasOS = S.os || [];
  const osPeriodo = todasOS.filter(o => {
    const dt = o.fechamento || o.abertura;
    return dt >= dIni && dt <= dFim;
  });

  const osFinalizadas = osPeriodo.filter(o => o.st === 'finalizada');

  let totFaturamento = 0;
  let totServicos = 0;
  let totPecas = 0;
  let totCustoPecas = 0;
  let totDescontos = 0;

  osPeriodo.forEach(o => {
    const srv = soma(o.servicos, i => (i.qtd || 1) * (i.valor || 0));
    const pec = soma(o.pecas, i => (i.qtd || 1) * (i.valor || 0));
    
    // Custo estimado das peças
    const custoPec = soma(o.pecas, i => {
      const pOrig = (S.pecas || []).find(p => p.id === i.id || p.cod === i.cod);
      return (i.qtd || 1) * (pOrig ? pOrig.custo : (i.valor || 0) * 0.55);
    });

    totServicos += srv;
    totPecas += pec;
    totCustoPecas += custoPec;
    totDescontos += (o.desc || 0);
    totFaturamento += Math.max(0, srv + pec - (o.desc || 0));
  });

  const lucroBruto = Math.max(0, totFaturamento - totCustoPecas);
  const margemLucro = totFaturamento > 0 ? (lucroBruto / totFaturamento) * 100 : 0;
  const ticketMedio = osPeriodo.length > 0 ? totFaturamento / osPeriodo.length : 0;

  // Filtrar Movimentações Financeiras
  const movsPeriodo = (S.movimentos || []).filter(m => m.data >= dIni && m.data <= dFim);
  const entradasFinanceiras = soma(movsPeriodo.filter(m => m.tipo === 'entrada'), m => m.valor);
  const saidasFinanceiras = soma(movsPeriodo.filter(m => m.tipo === 'saida'), m => m.valor);
  const resultadoFinanceiro = entradasFinanceiras - saidasFinanceiras;

  // Produtividade por Mecânico
  const mecanicosStats = {};
  (S.mecanicos || []).forEach(m => {
    mecanicosStats[m.nome] = { nome: m.nome, totalOS: 0, faturamento: 0, comissao: 0 };
  });

  osPeriodo.forEach(o => {
    if (o.mec) {
      if (!mecanicosStats[o.mec]) {
        mecanicosStats[o.mec] = { nome: o.mec, totalOS: 0, faturamento: 0, comissao: 0 };
      }
      const valorOS = totOS(o);
      const servOS = soma(o.servicos, i => (i.qtd || 1) * (i.valor || 0));
      mecanicosStats[o.mec].totalOS += 1;
      mecanicosStats[o.mec].faturamento += valorOS;
      mecanicosStats[o.mec].comissao += servOS * 0.10; // 10% de comissão padrão sobre MO
    }
  });

  return {
    osPeriodo,
    osFinalizadas,
    totFaturamento,
    totServicos,
    totPecas,
    totCustoPecas,
    lucroBruto,
    margemLucro,
    ticketMedio,
    totDescontos,
    entradasFinanceiras,
    saidasFinanceiras,
    resultadoFinanceiro,
    mecanicosStats: Object.values(mecanicosStats).sort((a, b) => b.faturamento - a.faturamento)
  };
}

/* =====================================================================
   RENDERIZAÇÃO DA VIEW PRINCIPAL DE RELATÓRIOS
===================================================================== */
function viewRelatorios() {
  const m = calcularMetricasRelatorio();

  return `
  <!-- Barra Superior de Controle & Filtros Executivos -->
  <div class="rel-toolbar">
    <div class="rel-periodos">
      <span style="font-weight:700;font-size:13px;color:var(--aco-800);margin-right:6px">Período:</span>
      <button class="rel-btn-periodo ${relState.periodo === 'hoje' ? 'ativo' : ''}" data-act="mudar-periodo-rel" data-p="hoje">Hoje</button>
      <button class="rel-btn-periodo ${relState.periodo === '7d' ? 'ativo' : ''}" data-act="mudar-periodo-rel" data-p="7d">Últimos 7 dias</button>
      <button class="rel-btn-periodo ${relState.periodo === 'mes' ? 'ativo' : ''}" data-act="mudar-periodo-rel" data-p="mes">Este Mês</button>
      <button class="rel-btn-periodo ${relState.periodo === 'mes_ant' ? 'ativo' : ''}" data-act="mudar-periodo-rel" data-p="mes_ant">Mês Anterior</button>
      <button class="rel-btn-periodo ${relState.periodo === 'ano' ? 'ativo' : ''}" data-act="mudar-periodo-rel" data-p="ano">Ano (${hoje().slice(0, 4)})</button>
      
      <div class="rel-datas-custom" style="margin-left:8px">
        <input type="date" id="rel-dt-ini" value="${relState.dIni}" onchange="relState.dIni=this.value;relState.periodo='custom';render();">
        <span style="color:var(--aco-400)">até</span>
        <input type="date" id="rel-dt-fim" value="${relState.dFim}" onchange="relState.dFim=this.value;relState.periodo='custom';render();">
      </div>
    </div>

    <div class="rel-acoes-topo">
      <button class="btn btn-primario" data-act="imprimir-relatorio-executivo" style="display:inline-flex;align-items:center;gap:6px;font-size:12.5px;padding:7px 14px;box-shadow:0 2px 6px rgba(37,99,235,0.3)">
        ${ico('imprimir', 15)} Imprimir / PDF Executivo
      </button>
      <button class="btn btn-secundario" data-act="exportar-relatorio-html" style="display:inline-flex;align-items:center;gap:6px;font-size:12.5px;padding:7px 14px">
        ${ico('download', 15)} Exportar HTML
      </button>
      <button class="btn btn-secundario" data-act="compartilhar-whatsapp-relatorio" style="display:inline-flex;align-items:center;gap:6px;font-size:12.5px;padding:7px 14px;color:#16a34a;border-color:#bbf7d0">
        ${ico('zap', 15)} Enviar p/ WhatsApp
      </button>
    </div>
  </div>

  <!-- Cards de KPIs Executivos com Formatação Premium -->
  <div class="kpi-exec-grid">
    <div class="kpi-exec-card">
      <div class="kpi-exec-header">
        <span class="kpi-exec-titulo">Faturamento Total</span>
        <div class="kpi-exec-ico">${ico('fin', 15)}</div>
      </div>
      <div class="kpi-exec-valor">${brl(m.totFaturamento)}</div>
      <div class="kpi-exec-sub">
        <span><b>${m.osPeriodo.length}</b> Ordens no período</span>
      </div>
    </div>

    <div class="kpi-exec-card verde">
      <div class="kpi-exec-header">
        <span class="kpi-exec-titulo">Lucro Bruto Estimado</span>
        <div class="kpi-exec-ico" style="color:var(--verde);background:var(--verde-fraco)">${ico('ok', 15)}</div>
      </div>
      <div class="kpi-exec-valor" style="color:var(--verde)">${brl(m.lucroBruto)}</div>
      <div class="kpi-exec-sub">
        <span>Margem Operacional: <b>${m.margemLucro.toFixed(1)}%</b></span>
      </div>
    </div>

    <div class="kpi-exec-card sinal">
      <div class="kpi-exec-header">
        <span class="kpi-exec-titulo">Ticket Médio por OS</span>
        <div class="kpi-exec-ico" style="color:var(--sinal);background:var(--sinal-fraco)">${ico('patio', 15)}</div>
      </div>
      <div class="kpi-exec-valor">${brl(m.ticketMedio)}</div>
      <div class="kpi-exec-sub">
        <span><b>${m.osFinalizadas.length}</b> OSs finalizadas</span>
      </div>
    </div>

    <div class="kpi-exec-card ardosia">
      <div class="kpi-exec-header">
        <span class="kpi-exec-titulo">Serviços x Peças</span>
        <div class="kpi-exec-ico" style="color:var(--ardosia);background:var(--ardosia-fraco)">${ico('pecas', 15)}</div>
      </div>
      <div class="kpi-exec-valor" style="font-size:17px">
        <span style="color:var(--petroleo)">${brl(m.totServicos)}</span> / <span style="color:var(--ardosia)">${brl(m.totPecas)}</span>
      </div>
      <div class="kpi-exec-sub">
        <span>M.O.: <b>${m.totFaturamento > 0 ? ((m.totServicos / m.totFaturamento) * 100).toFixed(0) : 0}%</b> | Peças: <b>${m.totFaturamento > 0 ? ((m.totPecas / m.totFaturamento) * 100).toFixed(0) : 0}%</b></span>
      </div>
    </div>
  </div>

  <!-- Painel de Gráficos BI Interativos (Chart.js) -->
  <div class="rel-grid-charts">
    <div class="rel-chart-card">
      <div class="rel-chart-header">
        <div class="rel-chart-title">Evolução do Faturamento & Serviços</div>
        <span class="mini" style="color:var(--aco-500)">Valores diários no intervalo</span>
      </div>
      <div class="rel-chart-container">
        <canvas id="relChartEvolucao"></canvas>
      </div>
    </div>

    <div class="rel-chart-card">
      <div class="rel-chart-header">
        <div class="rel-chart-title">Composição da Receita (Mão de Obra vs Peças)</div>
        <span class="mini" style="color:var(--aco-500)">Distribuição percentual</span>
      </div>
      <div class="rel-chart-container">
        <canvas id="relChartComposicao"></canvas>
      </div>
    </div>
  </div>

  <!-- Tabela Analítica Executiva de Ordens de Serviço -->
  <div class="rel-tabela-wrap">
    <div class="entre" style="margin-bottom:14px">
      <div>
        <div style="font-weight:700;font-size:16px;color:var(--aco-900)">Detalhamento Analítico de Ordens de Serviço</div>
        <div class="mini">Exibindo movimentações de ${dataBRfull(relState.dIni)} até ${dataBRfull(relState.dFim)}</div>
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-secundario" data-act="exportar-csv" data-tipo="os" style="font-size:12px;padding:6px 12px">
          ${ico('download', 14)} Exportar Planilha Excel (.CSV)
        </button>
      </div>
    </div>

    <div style="overflow-x:auto">
      <table class="tabela-executiva">
        <thead>
          <tr>
            <th>Nº OS</th>
            <th>Data</th>
            <th>Status</th>
            <th>Placa / Veículo</th>
            <th>Cliente</th>
            <th>Mecânico</th>
            <th style="text-align:right">Serviços</th>
            <th style="text-align:right">Peças</th>
            <th style="text-align:right">Desconto</th>
            <th style="text-align:right">Total Líquido</th>
          </tr>
        </thead>
        <tbody>
          ${m.osPeriodo.map(o => {
            const v = V(o.vei), c = C(o.cli);
            const totServ = soma(o.servicos, i => (i.qtd || 1) * (i.valor || 0));
            const totPec = soma(o.pecas, i => (i.qtd || 1) * (i.valor || 0));
            const total = totOS(o);
            return `
            <tr>
              <td><span class="tag-os">#${o.num}</span></td>
              <td class="mono" style="font-size:12px">${dataBR(o.fechamento || o.abertura)}</td>
              <td><span class="selo ${ST[o.st]?.badge || 'selo-fila'}">${ST[o.st]?.r || o.st}</span></td>
              <td><b>${v.placa}</b> <span class="mini" style="color:var(--aco-500)">${esc(v.modelo)}</span></td>
              <td>${esc(c.nome)}</td>
              <td><span style="font-size:12px;color:var(--aco-700)">${esc(o.mec || '—')}</span></td>
              <td class="mono" style="text-align:right">${brl(totServ)}</td>
              <td class="mono" style="text-align:right">${brl(totPec)}</td>
              <td class="mono" style="text-align:right;color:var(--tijolo)">${o.desc ? '-' + brl(o.desc) : '—'}</td>
              <td class="mono" style="text-align:right;font-weight:700;color:var(--aco-900)">${brl(total)}</td>
            </tr>`;
          }).join('') || `<tr><td colspan="10" style="text-align:center;padding:30px;color:var(--aco-400)">Nenhuma Ordem de Serviço encontrada no período selecionado.</td></tr>`}
        </tbody>
        ${m.osPeriodo.length > 0 ? `
        <tfoot>
          <tr>
            <td colspan="6">TOTAL CONSOLIDADO DO PERÍODO (${m.osPeriodo.length} OSs)</td>
            <td class="mono" style="text-align:right">${brl(m.totServicos)}</td>
            <td class="mono" style="text-align:right">${brl(m.totPecas)}</td>
            <td class="mono" style="text-align:right;color:var(--tijolo)">-${brl(m.totDescontos)}</td>
            <td class="mono" style="text-align:right;color:var(--petroleo);font-size:14.5px">${brl(m.totFaturamento)}</td>
          </tr>
        </tfoot>` : ''}
      </table>
    </div>
  </div>

  <!-- Bloco Inferior: Produtividade da Equipe & Exportações de Dados -->
  <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(320px, 1fr));gap:16px;margin-bottom:20px">
    <!-- Ranking de Mecânicos -->
    <div class="card card-p">
      <div style="font-weight:700;font-size:15px;color:var(--aco-900);margin-bottom:4px">Produtividade dos Mecânicos</div>
      <div class="mini" style="margin-bottom:12px">Faturamento gerado e comissão estimada (10% MO)</div>
      
      <table class="tabela" style="width:100%">
        <thead>
          <tr>
            <th>Mecânico</th>
            <th style="text-align:center">OSs</th>
            <th style="text-align:right">Faturamento</th>
            <th style="text-align:right">Comissão</th>
          </tr>
        </thead>
        <tbody>
          ${m.mecanicosStats.map(mec => `
            <tr>
              <td><b>${esc(mec.nome)}</b></td>
              <td style="text-align:center">${mec.totalOS}</td>
              <td class="mono" style="text-align:right;font-weight:600">${brl(mec.faturamento)}</td>
              <td class="mono" style="text-align:right;color:var(--verde);font-weight:600">${brl(mec.comissao)}</td>
            </tr>
          `).join('') || '<tr><td colspan="4" style="text-align:center">Nenhum mecânico registrado</td></tr>'}
        </tbody>
      </table>
    </div>

    <!-- Central de Backups & Exportações em Lote -->
    <div class="card card-p">
      <div style="font-weight:700;font-size:15px;color:var(--aco-900);margin-bottom:4px">Outras Exportações & Backups</div>
      <div class="mini" style="margin-bottom:14px">Download de planilhas e integridade de dados</div>

      <div style="display:flex;flex-direction:column;gap:8px">
        <div class="entre" style="padding:8px 12px;background:var(--aco-050);border-radius:8px">
          <div>
            <b>Posição Atual de Estoque</b>
            <div class="mini">${(S.pecas || []).length} itens no almoxarifado</div>
          </div>
          <button class="btn btn-secundario" data-act="exportar-csv" data-tipo="pecas" style="font-size:11.5px;padding:5px 10px">
            ${ico('download', 13)} CSV Peças
          </button>
        </div>

        <div class="entre" style="padding:8px 12px;background:var(--aco-050);border-radius:8px">
          <div>
            <b>Extrato Financeiro Completo</b>
            <div class="mini">${(S.movimentos || []).length} movimentações de caixa</div>
          </div>
          <button class="btn btn-secundario" data-act="exportar-csv" data-tipo="financeiro" style="font-size:11.5px;padding:5px 10px">
            ${ico('download', 13)} CSV Caixa
          </button>
        </div>

        <div class="entre" style="padding:8px 12px;background:var(--aco-050);border-radius:8px">
          <div>
            <b>Backup Geral do Sistema (.JSON)</b>
            <div class="mini">Cópia offline de todas as tabelas</div>
          </div>
          <button class="btn btn-secundario" data-act="exportar-backup-json" style="font-size:11.5px;padding:5px 10px">
            ${ico('download', 13)} Baixar Backup
          </button>
        </div>
      </div>
    </div>
  </div>`;
}

/* =====================================================================
   INICIALIZAÇÃO & CICLO DE VIDA DOS GRÁFICOS (Chart.js)
===================================================================== */
function initRelatoriosCharts() {
  if (typeof Chart === 'undefined') return;

  const ctxEvolucao = document.getElementById('relChartEvolucao');
  const ctxComposicao = document.getElementById('relChartComposicao');

  if (!ctxEvolucao || !ctxComposicao) return;

  // Destruir instâncias antigas para evitar sobreposição
  if (chartEvolucaoInstance) { chartEvolucaoInstance.destroy(); chartEvolucaoInstance = null; }
  if (chartComposicaoInstance) { chartComposicaoInstance.destroy(); chartComposicaoInstance = null; }

  const m = calcularMetricasRelatorio();

  // 1. Agrupar faturamento por dia no período
  const diasMap = {};
  m.osPeriodo.forEach(o => {
    const dt = dataBR(o.fechamento || o.abertura);
    if (!diasMap[dt]) diasMap[dt] = { servicos: 0, pecas: 0, total: 0 };
    const totServ = soma(o.servicos, i => (i.qtd || 1) * (i.valor || 0));
    const totPec = soma(o.pecas, i => (i.qtd || 1) * (i.valor || 0));
    diasMap[dt].servicos += totServ;
    diasMap[dt].pecas += totPec;
    diasMap[dt].total += totOS(o);
  });

  const labelsDias = Object.keys(diasMap);
  const dataTotal = labelsDias.map(d => diasMap[d].total);
  const dataServicos = labelsDias.map(d => diasMap[d].servicos);

  // Criar Gráfico de Evolução (Linha com preenchimento suave)
  chartEvolucaoInstance = new Chart(ctxEvolucao, {
    type: 'bar',
    data: {
      labels: labelsDias.length > 0 ? labelsDias : ['Sem dados'],
      datasets: [
        {
          label: 'Faturamento Total (R$)',
          data: dataTotal.length > 0 ? dataTotal : [0],
          backgroundColor: 'rgba(37, 99, 235, 0.85)',
          borderRadius: 6
        },
        {
          label: 'Mão de Obra / Serviços (R$)',
          data: dataServicos.length > 0 ? dataServicos : [0],
          backgroundColor: 'rgba(16, 185, 129, 0.85)',
          borderRadius: 6
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11.5, family: 'system-ui' } } }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            callback: (val) => 'R$ ' + (val >= 1000 ? (val / 1000).toFixed(0) + 'k' : val),
            font: { size: 10.5 }
          },
          grid: { color: 'rgba(226, 232, 240, 0.6)' }
        },
        x: { grid: { display: false }, ticks: { font: { size: 10.5 } } }
      }
    }
  });

  // Criar Gráfico de Composição (Doughnut)
  chartComposicaoInstance = new Chart(ctxComposicao, {
    type: 'doughnut',
    data: {
      labels: ['Mão de Obra (Serviços)', 'Peças / Materiais'],
      datasets: [{
        data: [m.totServicos || 1, m.totPecas || 1],
        backgroundColor: ['#2563eb', '#8b5cf6'],
        borderWidth: 2,
        borderColor: '#ffffff',
        hoverOffset: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11.5, family: 'system-ui' } } },
        tooltip: {
          callbacks: {
            label: (item) => ` ${item.label}: ${brl(item.raw)}`
          }
        }
      },
      cutout: '68%'
    }
  });
}

/* =====================================================================
   IMPRESSÃO & GERAÇÃO DE RELATÓRIO PDF EXECUTIVO (A4 PROFISSIONAL)
===================================================================== */
function imprimirRelatorioExecutivo() {
  const m = calcularMetricasRelatorio();
  const dH = hoje();
  
  // Obter imagem base64 do gráfico se disponível
  let imgChartEvolucao = '';
  let imgChartComposicao = '';
  try {
    if (chartEvolucaoInstance) imgChartEvolucao = chartEvolucaoInstance.toBase64Image();
    if (chartComposicaoInstance) imgChartComposicao = chartComposicaoInstance.toBase64Image();
  } catch (e) {
    console.warn('Erro ao converter gráficos para imagem:', e);
  }

  const janela = window.open('', '_blank');
  if (!janela) {
    torrar('Por favor, permita pop-ups no seu navegador para imprimir.');
    return;
  }

  janela.document.write(`
  <!DOCTYPE html>
  <html lang="pt-BR">
  <head>
    <meta charset="utf-8">
    <title>Relatório Executivo — ${esc(S.cfg.empresa)}</title>
    <style>
      @page { size: A4; margin: 1.2cm; }
      body {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        color: #0f172a; background: #fff; font-size: 11.5px; line-height: 1.4; margin: 0; padding: 0;
      }
      .cabecalho {
        display: flex; justify-content: space-between; align-items: flex-start;
        border-bottom: 2px solid #0f172a; padding-bottom: 12px; margin-bottom: 16px;
      }
      .marca-titulo { font-size: 20px; font-weight: 800; color: #0f172a; letter-spacing: -0.02em; }
      .marca-sub { font-size: 11px; color: #64748b; font-weight: 500; margin-top: 2px; }
      .meta-doc { text-align: right; font-size: 11px; color: #334155; }
      
      .grid-kpis {
        display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 16px;
      }
      .kpi-box {
        background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; padding: 10px; text-align: center;
      }
      .kpi-tit { font-size: 10px; font-weight: 700; text-transform: uppercase; color: #64748b; margin-bottom: 4px; }
      .kpi-val { font-size: 16px; font-weight: 800; color: #0f172a; }

      .secao-titulo {
        font-size: 13px; font-weight: 700; color: #0f172a; text-transform: uppercase;
        border-left: 4px solid #2563eb; padding-left: 6px; margin: 16px 0 8px;
      }
      
      .graficos-box {
        display: flex; gap: 14px; margin-bottom: 16px; page-break-inside: avoid;
      }
      .grafico-item {
        flex: 1; border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px; text-align: center;
      }
      .grafico-item img { max-width: 100%; height: 160px; object-fit: contain; }

      table { width: 100%; border-collapse: collapse; margin-bottom: 16px; font-size: 10.5px; }
      th { background: #f1f5f9; text-align: left; padding: 6px 8px; border-bottom: 2px solid #cbd5e1; font-weight: 700; }
      td { padding: 5px 8px; border-bottom: 1px solid #e2e8f0; }
      tfoot td { font-weight: 700; background: #f8fafc; border-top: 2px solid #94a3b8; font-size: 11px; }

      .assinaturas {
        margin-top: 35px; display: flex; justify-content: space-between; page-break-inside: avoid;
      }
      .campo-ass {
        width: 45%; text-align: center; border-top: 1px solid #475569; padding-top: 4px; font-size: 10.5px;
      }
      .rodape-doc {
        text-align: center; font-size: 9.5px; color: #94a3b8; margin-top: 25px; border-top: 1px solid #e2e8f0; padding-top: 8px;
      }
    </style>
  </head>
  <body>
    <div class="cabecalho">
      <div>
        <div class="marca-titulo">${esc(S.cfg.empresa)}</div>
        <div class="marca-sub">SISTEMA PÁTIO CRM — RELATÓRIO EXECUTIVO GERENCIAL</div>
        <div style="font-size:10.5px;color:#475569;margin-top:4px">CNPJ: ${esc(S.cfg.cnpj || 'Não informado')} | Tel: ${esc(S.cfg.fone || 'Não informado')}</div>
      </div>
      <div class="meta-doc">
        <div><b>Período:</b> ${dataBRfull(relState.dIni)} a ${dataBRfull(relState.dFim)}</div>
        <div><b>Emissão:</b> ${dataBRfull(dH)} às ${horaBR()}</div>
        <div><b>Responsável:</b> Gestão Operacional</div>
      </div>
    </div>

    <!-- Indicadores Principais -->
    <div class="grid-kpis">
      <div class="kpi-box">
        <div class="kpi-tit">Faturamento Bruto</div>
        <div class="kpi-val" style="color:#2563eb">${brl(m.totFaturamento)}</div>
      </div>
      <div class="kpi-box">
        <div class="kpi-tit">Lucro Bruto Estimado</div>
        <div class="kpi-val" style="color:#10b981">${brl(m.lucroBruto)}</div>
      </div>
      <div class="kpi-box">
        <div class="kpi-tit">Margem Operacional</div>
        <div class="kpi-val">${m.margemLucro.toFixed(1)}%</div>
      </div>
      <div class="kpi-box">
        <div class="kpi-tit">Total de OSs</div>
        <div class="kpi-val">${m.osPeriodo.length}</div>
      </div>
    </div>

    <!-- Gráficos no PDF -->
    ${imgChartEvolucao || imgChartComposicao ? `
    <div class="secao-titulo">Análise Gráfica & Desempenho</div>
    <div class="graficos-box">
      ${imgChartEvolucao ? `<div class="grafico-item"><div style="font-weight:bold;margin-bottom:4px;font-size:10px">Evolução de Faturamento</div><img src="${imgChartEvolucao}"></div>` : ''}
      ${imgChartComposicao ? `<div class="grafico-item"><div style="font-weight:bold;margin-bottom:4px;font-size:10px">Composição (MO x Peças)</div><img src="${imgChartComposicao}"></div>` : ''}
    </div>` : ''}

    <!-- Tabela Analítica de Ordens de Serviço -->
    <div class="secao-titulo">Detalhamento de Ordens de Serviço (${m.osPeriodo.length})</div>
    <table>
      <thead>
        <tr>
          <th>OS</th>
          <th>Data</th>
          <th>Status</th>
          <th>Placa / Veículo</th>
          <th>Cliente</th>
          <th>Mecânico</th>
          <th style="text-align:right">Serviços</th>
          <th style="text-align:right">Peças</th>
          <th style="text-align:right">Total</th>
        </tr>
      </thead>
      <tbody>
        ${m.osPeriodo.map(o => {
          const v = V(o.vei), c = C(o.cli);
          const totServ = soma(o.servicos, i => (i.qtd || 1) * (i.valor || 0));
          const totPec = soma(o.pecas, i => (i.qtd || 1) * (i.valor || 0));
          return `
          <tr>
            <td>#${o.num}</td>
            <td>${dataBR(o.fechamento || o.abertura)}</td>
            <td>${ST[o.st]?.r || o.st}</td>
            <td><b>${v.placa}</b> ${esc(v.modelo)}</td>
            <td>${esc(c.nome)}</td>
            <td>${esc(o.mec || '—')}</td>
            <td style="text-align:right">${brl(totServ)}</td>
            <td style="text-align:right">${brl(totPec)}</td>
            <td style="text-align:right;font-weight:bold">${brl(totOS(o))}</td>
          </tr>`;
        }).join('') || '<tr><td colspan="9" style="text-align:center">Nenhuma OS encontrada no período</td></tr>'}
      </tbody>
      <tfoot>
        <tr>
          <td colspan="6">TOTAL CONSOLIDADO</td>
          <td style="text-align:right">${brl(m.totServicos)}</td>
          <td style="text-align:right">${brl(m.totPecas)}</td>
          <td style="text-align:right">${brl(m.totFaturamento)}</td>
        </tr>
      </tfoot>
    </table>

    <!-- Assinaturas de Conferência -->
    <div class="assinaturas">
      <div class="campo-ass">
        <b>${esc(S.cfg.empresa)}</b><br>
        Gerência / Diretoria Operacional
      </div>
      <div class="campo-ass">
        <b>Responsável Financeiro</b><br>
        Conferência e Fechamento
      </div>
    </div>

    <div class="rodape-doc">
      Documento gerado automaticamente pelo Sistema Pátio CRM em ${dataBRfull(dH)} às ${horaBR()}. Autenticidade garantida pela base local.
    </div>

    <script>
      window.onload = function() {
        setTimeout(function() { window.print(); }, 400);
      };
    </script>
  </body>
  </html>`);

  janela.document.close();
}

/* =====================================================================
   EXPORTAÇÃO EM FORMATO HTML STANDALONE (RELATÓRIO PORTÁTIL)
===================================================================== */
function exportarRelatorioHTML() {
  const m = calcularMetricasRelatorio();
  const dH = hoje();
  const nomeArquivo = `relatorio_executivo_${relState.dIni}_a_${relState.dFim}.html`;

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <title>Relatório Executivo — ${esc(S.cfg.empresa)}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; background: #f8fafc; color: #0f172a; margin: 0; padding: 24px; }
    .wrap { max-width: 1000px; margin: 0 auto; background: #fff; border-radius: 12px; padding: 24px; box-shadow: 0 4px 12px rgba(0,0,0,0.08); }
    .topo { border-bottom: 2px solid #2563eb; padding-bottom: 14px; margin-bottom: 20px; display: flex; justify-content: space-between; }
    .kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; margin-bottom: 24px; }
    .kpi-card { background: #f1f5f9; padding: 14px; border-radius: 8px; border-left: 4px solid #2563eb; }
    .kpi-card.verde { border-left-color: #10b981; }
    .kpi-card.sinal { border-left-color: #f59e0b; }
    .kpi-card.ardosia { border-left-color: #8b5cf6; }
    table { width: 100%; border-collapse: collapse; margin-top: 14px; font-size: 13px; }
    th { background: #e2e8f0; padding: 8px 10px; text-align: left; }
    td { padding: 8px 10px; border-bottom: 1px solid #e2e8f0; }
    tfoot td { font-weight: bold; background: #f8fafc; border-top: 2px solid #cbd5e1; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="topo">
      <div>
        <h2 style="margin:0">${esc(S.cfg.empresa)}</h2>
        <div style="color:#64748b;font-size:13px">Relatório Executivo Gerencial & BI</div>
      </div>
      <div style="text-align:right;font-size:12px;color:#475569">
        <div><b>Período:</b> ${dataBRfull(relState.dIni)} até ${dataBRfull(relState.dFim)}</div>
        <div><b>Gerado em:</b> ${dataBRfull(dH)} às ${horaBR()}</div>
      </div>
    </div>

    <div class="kpi-grid">
      <div class="kpi-card">
        <div style="font-size:11px;color:#64748b;text-transform:uppercase;font-weight:bold">Faturamento Total</div>
        <div style="font-size:20px;font-weight:bold;color:#2563eb;margin-top:4px">${brl(m.totFaturamento)}</div>
      </div>
      <div class="kpi-card verde">
        <div style="font-size:11px;color:#64748b;text-transform:uppercase;font-weight:bold">Lucro Bruto Estimado</div>
        <div style="font-size:20px;font-weight:bold;color:#10b981;margin-top:4px">${brl(m.lucroBruto)}</div>
      </div>
      <div class="kpi-card sinal">
        <div style="font-size:11px;color:#64748b;text-transform:uppercase;font-weight:bold">Ticket Médio</div>
        <div style="font-size:20px;font-weight:bold;margin-top:4px">${brl(m.ticketMedio)}</div>
      </div>
      <div class="kpi-card ardosia">
        <div style="font-size:11px;color:#64748b;text-transform:uppercase;font-weight:bold">Total de OSs</div>
        <div style="font-size:20px;font-weight:bold;margin-top:4px">${m.osPeriodo.length}</div>
      </div>
    </div>

    <h3 style="margin-top:24px;border-bottom:1px solid #cbd5e1;padding-bottom:6px">Ordens de Serviço do Período</h3>
    <table>
      <thead>
        <tr>
          <th>OS</th>
          <th>Data</th>
          <th>Placa</th>
          <th>Cliente</th>
          <th>Mecânico</th>
          <th style="text-align:right">Serviços</th>
          <th style="text-align:right">Peças</th>
          <th style="text-align:right">Total</th>
        </tr>
      </thead>
      <tbody>
        ${m.osPeriodo.map(o => {
          const v = V(o.vei), c = C(o.cli);
          const totServ = soma(o.servicos, i => (i.qtd || 1) * (i.valor || 0));
          const totPec = soma(o.pecas, i => (i.qtd || 1) * (i.valor || 0));
          return `<tr>
            <td>#${o.num}</td>
            <td>${dataBR(o.fechamento || o.abertura)}</td>
            <td><b>${v.placa}</b></td>
            <td>${esc(c.nome)}</td>
            <td>${esc(o.mec || '—')}</td>
            <td style="text-align:right">${brl(totServ)}</td>
            <td style="text-align:right">${brl(totPec)}</td>
            <td style="text-align:right;font-weight:bold">${brl(totOS(o))}</td>
          </tr>`;
        }).join('')}
      </tbody>
      <tfoot>
        <tr>
          <td colspan="5">TOTAL</td>
          <td style="text-align:right">${brl(m.totServicos)}</td>
          <td style="text-align:right">${brl(m.totPecas)}</td>
          <td style="text-align:right">${brl(m.totFaturamento)}</td>
        </tr>
      </tfoot>
    </table>
  </div>
</body>
</html>`;

  baixarArquivo(html, nomeArquivo, 'text/html;charset=utf-8;');
  torrar(`Relatório HTML exportado: ${nomeArquivo}`);
}

/* =====================================================================
   COMPARTILHAR RESUMO EXECUTIVO VIA WHATSAPP
===================================================================== */
function compartilharResumoWhatsApp() {
  const m = calcularMetricasRelatorio();
  const dH = hoje();

  const texto = 
`📊 *RELATÓRIO EXECUTIVO — ${S.cfg.empresa.toUpperCase()}*
📅 *Período:* ${dataBRfull(relState.dIni)} a ${dataBRfull(relState.dFim)}
⏰ *Emissão:* ${dataBRfull(dH)} às ${horaBR()}

💰 *Faturamento Total:* ${brl(m.totFaturamento)}
📈 *Lucro Bruto Estimado:* ${brl(m.lucroBruto)} (${m.margemLucro.toFixed(1)}%)
🎯 *Ticket Médio por OS:* ${brl(m.ticketMedio)}
🔧 *Total de OSs:* ${m.osPeriodo.length} (${m.osFinalizadas.length} finalizadas)

🔹 *Mão de Obra (Serviços):* ${brl(m.totServicos)}
🔹 *Peças / Almoxarifado:* ${brl(m.totPecas)}
${m.totDescontos > 0 ? `🔻 *Descontos Concedidos:* ${brl(m.totDescontos)}\n` : ''}
_Gerado automaticamente pelo Sistema Pátio CRM._`;

  const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(texto)}`;
  window.open(url, '_blank');
}

/* =====================================================================
   EXPORTAÇÃO CSV COMPATÍVEL COM EXCEL (UTF-8 COM BOM)
===================================================================== */
function exportarCSV(tipo) {
  let csv = '', nomeArquivo = '';

  if (tipo === 'os') {
    nomeArquivo = `patio_ordens_servico_${relState.dIni}_a_${relState.dFim}.csv`;
    csv = 'Numero;Data Abertura;Data Fechamento;Status;Placa;Modelo;Cliente;Mecanico;Servicos (R$);Pecas (R$);Desconto (R$);Total Liquido (R$)\n';
    
    const m = calcularMetricasRelatorio();
    m.osPeriodo.forEach(o => {
      const v = V(o.vei), c = C(o.cli);
      const totServ = soma(o.servicos, i => (i.qtd || 1) * (i.valor || 0));
      const totPec = soma(o.pecas, i => (i.qtd || 1) * (i.valor || 0));
      const total = totOS(o);
      csv += `${o.num};"${o.abertura}";"${o.fechamento || ''}";"${ST[o.st]?.r || o.st}";"${v.placa}";"${v.modelo}";"${c.nome}";"${o.mec || ''}";${totServ.toFixed(2).replace('.', ',')};${totPec.toFixed(2).replace('.', ',')};${(o.desc || 0).toFixed(2).replace('.', ',')};${total.toFixed(2).replace('.', ',')}\n`;
    });
    csv += `\nTOTAL CONSOLIDADO;;;;;;;${m.totServicos.toFixed(2).replace('.', ',')};${m.totPecas.toFixed(2).replace('.', ',')};${m.totDescontos.toFixed(2).replace('.', ',')};${m.totFaturamento.toFixed(2).replace('.', ',')}\n`;
  } else if (tipo === 'pecas') {
    nomeArquivo = `patio_estoque_pecas_${hoje()}.csv`;
    csv = 'Codigo;Descricao;Unidade;Estoque Atual;Estoque Minimo;Preco Custo;Preco Venda;Total Custo;Total Venda;Localizacao;Fornecedor\n';
    let totEstoqueCusto = 0, totEstoqueVenda = 0;
    (S.pecas || []).forEach(p => {
      const totC = (p.qtd || 0) * (p.custo || 0);
      const totV = (p.qtd || 0) * (p.venda || 0);
      totEstoqueCusto += totC;
      totEstoqueVenda += totV;
      csv += `"${p.cod}";"${p.nome}";"${p.un || 'un'}";${p.qtd};${p.min};${p.custo.toFixed(2).replace('.', ',')};${p.venda.toFixed(2).replace('.', ',')};${totC.toFixed(2).replace('.', ',')};${totV.toFixed(2).replace('.', ',')};"${p.loc || ''}";"${p.forn || ''}"\n`;
    });
    csv += `\nTOTAL EM ESTOQUE;;;;;;;${totEstoqueCusto.toFixed(2).replace('.', ',')};${totEstoqueVenda.toFixed(2).replace('.', ',')};;\n`;
  } else if (tipo === 'financeiro') {
    nomeArquivo = `patio_movimentacoes_caixa_${hoje()}.csv`;
    csv = 'Data;Tipo;Descricao;Categoria;Forma de Pagamento;Valor (R$);Conciliado\n';
    (S.movimentos || []).forEach(m => {
      csv += `"${m.data}";"${m.tipo.toUpperCase()}";"${m.desc}";"${m.cat || 'Geral'}";"${m.forma || ''}";${m.valor.toFixed(2).replace('.', ',')};"${m.conc ? 'Sim' : 'Não'}"\n`;
    });
  } else if (tipo === 'clientes') {
    nomeArquivo = `patio_clientes_${hoje()}.csv`;
    csv = 'Razao Social;Nome Fantasia;CNPJ / CPF;Telefone;Contato;Cidade;UF;Prazo (dias)\n';
    (S.clientes || []).forEach(c => {
      csv += `"${c.nome}";"${c.fantasia || ''}";"${c.doc || ''}";"${c.fone || ''}";"${c.contato || ''}";"${c.cidade || ''}";"${c.uf || ''}";${c.prazo || 0}\n`;
    });
  }

  // Adicionar UTF-8 BOM (\uFEFF) para garantir abertura sem erros de acentuação no Excel
  baixarArquivo('\uFEFF' + csv, nomeArquivo, 'text/csv;charset=utf-8;');
  torrar(`Planilha Excel exportada: ${nomeArquivo}`);
}

function exportarBackupJSON() {
  const dados = JSON.stringify(S, null, 2);
  const nome = `backup_patio_crm_${hoje()}_${Date.now()}.json`;
  baixarArquivo(dados, nome, 'application/json');
  torrar('Backup completo baixado com sucesso!');
}

function restaurarBackupJSON(arquivo) {
  const fr = new FileReader();
  fr.onload = () => {
    try {
      const obj = JSON.parse(fr.result);
      if (obj && obj.os && obj.clientes && obj.pecas) {
        S = obj;
        salvar();
        render();
        torrar('Backup restaurado com sucesso!');
      } else {
        torrar('Arquivo de backup inválido ou incompatível.');
      }
    } catch (e) {
      torrar('Erro ao processar arquivo JSON de backup.');
    }
  };
  fr.readAsText(arquivo);
}

function baixarArquivo(conteudo, nome, tipoMime) {
  const blob = new Blob([conteudo], { type: tipoMime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
