/* =====================================================================
   PÁTIO CRM — RENDERIZAÇÃO DE GRÁFICOS FINANCEIROS (CHART.JS)
===================================================================== */

function renderGraficosFinanceiro() {
  if (typeof Chart === 'undefined') return;

  const filtro = S.ui.filtroFin || '30d';
  const customDe = S.ui.filtroFinDe || null;
  const customAte = S.ui.filtroFinAte || null;
  const fin = (typeof calcularDashboardFin === 'function')
    ? calcularDashboardFin(filtro, customDe, customAte)
    : { de: hoje(), ate: hoje(), movsPeriodo: [] };
  const ref = hoje();

  // 1. Gráfico de Fluxo de Caixa (Entradas vs Saídas)
  const ctxFluxo = document.getElementById('grafico-fin-fluxo');
  if (ctxFluxo) {
    if (window._chartFinFluxo) window._chartFinFluxo.destroy();

    const listaDias = [];
    let curr = fin.de;
    while (curr <= fin.ate && listaDias.length < 60) {
      listaDias.push(curr);
      curr = addDias(curr, 1);
    }

    const mapaE = {}, mapaS = {};
    (S.movimentos || []).forEach(m => {
      const d = (m.data || '').slice(0, 10);
      const v = Number(m.valor) || 0;
      if (m.tipo === 'entrada') mapaE[d] = (mapaE[d] || 0) + v;
      else if (m.tipo === 'saida') mapaS[d] = (mapaS[d] || 0) + v;
    });

    const labels = listaDias.map(d => dataBR(d));
    const entradas = listaDias.map(d => +(mapaE[d] || 0).toFixed(2));
    const saidas = listaDias.map(d => +(mapaS[d] || 0).toFixed(2));

    window._chartFinFluxo = new Chart(ctxFluxo, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: 'Entradas (R$)', data: entradas, backgroundColor: '#10b981', borderRadius: 4 },
          { label: 'Saídas (R$)', data: saidas, backgroundColor: '#ef4444', borderRadius: 4 }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'top', labels: { boxWidth: 12, font: { size: 11 } } },
          tooltip: {
            callbacks: {
              label: (ctx) => ` ${ctx.dataset.label}: ${brl(ctx.raw)}`
            }
          }
        },
        scales: {
          x: { grid: { display: false }, ticks: { maxTicksLimit: 12, font: { size: 10 } } },
          y: { beginAtZero: true, ticks: { callback: v => brlCurto(v), font: { size: 10 } } }
        }
      }
    });
  }

  // 2. Gráfico Receber x Pagar (Faixas de Aging)
  const ctxRxP = document.getElementById('grafico-fin-rxp');
  if (ctxRxP) {
    if (window._chartFinRxP) window._chartFinRxP.destroy();

    const emAb = (S.contas || []).filter(c => !c.pago);
    const faixas = [
      { l: 'Vencidos', min: -9999, max: -1 },
      { l: 'Hoje', min: 0, max: 0 },
      { l: 'Até 7d', min: 1, max: 7 },
      { l: '8 a 15d', min: 8, max: 15 },
      { l: '16 a 30d', min: 16, max: 30 },
      { l: '> 30d', min: 31, max: 9999 }
    ];

    const lRxP = faixas.map(f => f.l);
    const dRec = faixas.map(f => {
      return soma(emAb.filter(c => c.tipo === 'receber' && diasEntre(ref, c.venc) >= f.min && diasEntre(ref, c.venc) <= f.max), c => c.valor);
    });
    const dPag = faixas.map(f => {
      return soma(emAb.filter(c => c.tipo === 'pagar' && diasEntre(ref, c.venc) >= f.min && diasEntre(ref, c.venc) <= f.max), c => c.valor);
    });

    window._chartFinRxP = new Chart(ctxRxP, {
      type: 'bar',
      data: {
        labels: lRxP,
        datasets: [
          { label: 'A Receber', data: dRec, backgroundColor: '#34d399', borderRadius: 4 },
          { label: 'A Pagar', data: dPag, backgroundColor: '#f87171', borderRadius: 4 }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'top', labels: { boxWidth: 12, font: { size: 11 } } },
          tooltip: {
            callbacks: { label: ctx => ` ${ctx.dataset.label}: ${brl(ctx.raw)}` }
          }
        },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 10 } } },
          y: { beginAtZero: true, ticks: { callback: v => brlCurto(v), font: { size: 10 } } }
        }
      }
    });
  }

  // 3. Gráfico Evolução do Saldo
  const ctxSaldo = document.getElementById('grafico-fin-saldo');
  if (ctxSaldo) {
    if (window._chartFinSaldo) window._chartFinSaldo.destroy();

    const listaDias = [];
    let curr = fin.de;
    while (curr <= fin.ate && listaDias.length < 60) {
      listaDias.push(curr);
      curr = addDias(curr, 1);
    }

    const ini = Number(S.cfg?.saldoInicial) || 0;
    const movs = S.movimentos || [];
    const entAntes = soma(movs.filter(m => m.tipo === 'entrada' && (m.data || '').slice(0, 10) < fin.de), m => m.valor);
    const saiAntes = soma(movs.filter(m => m.tipo === 'saida' && (m.data || '').slice(0, 10) < fin.de), m => m.valor);
    let acumulado = ini + entAntes - saiAntes;

    const mapaE = {}, mapaS = {};
    movs.forEach(m => {
      const d = (m.data || '').slice(0, 10);
      const v = Number(m.valor) || 0;
      if (m.tipo === 'entrada') mapaE[d] = (mapaE[d] || 0) + v;
      else if (m.tipo === 'saida') mapaS[d] = (mapaS[d] || 0) + v;
    });

    const labels = listaDias.map(d => dataBR(d));
    const dadosSaldo = listaDias.map(d => {
      acumulado = +(acumulado + (mapaE[d] || 0) - (mapaS[d] || 0)).toFixed(2);
      return acumulado;
    });

    window._chartFinSaldo = new Chart(ctxSaldo, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'Saldo Acumulado (R$)',
          data: dadosSaldo,
          borderColor: '#2563eb',
          backgroundColor: 'rgba(37, 99, 235, 0.08)',
          fill: true,
          tension: 0.35,
          pointRadius: dadosSaldo.length > 15 ? 1 : 3,
          pointHoverRadius: 5
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: { label: ctx => ` Saldo: ${brl(ctx.raw)}` }
          }
        },
        scales: {
          x: { grid: { display: false }, ticks: { maxTicksLimit: 12, font: { size: 10 } } },
          y: { ticks: { callback: v => brlCurto(v), font: { size: 10 } } }
        }
      }
    });
  }

  // 4. Gráfico Projeção Financeira (Próximos 30 Dias)
  const ctxProj = document.getElementById('grafico-fin-projecao');
  if (ctxProj) {
    if (window._chartFinProj) window._chartFinProj.destroy();

    const saldoHoje = typeof saldoCaixa === 'function' ? saldoCaixa() : 0;
    const emAb = (S.contas || []).filter(c => !c.pago);
    const labels = [];
    const dados = [];

    for (let i = 0; i <= 30; i += 3) {
      const diaProj = addDias(ref, i);
      const recAte = soma(emAb.filter(c => c.tipo === 'receber' && c.venc >= ref && c.venc <= diaProj), c => c.valor);
      const pagAte = soma(emAb.filter(c => c.tipo === 'pagar' && c.venc >= ref && c.venc <= diaProj), c => c.valor);
      labels.push(i === 0 ? 'Hoje' : dataBR(diaProj));
      dados.push(+(saldoHoje + recAte - pagAte).toFixed(2));
    }

    window._chartFinProj = new Chart(ctxProj, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'Saldo Projetado (R$)',
          data: dados,
          borderColor: '#0284c7',
          backgroundColor: 'rgba(2, 132, 199, 0.08)',
          borderDash: [5, 5],
          fill: true,
          tension: 0.3,
          pointRadius: 4,
          pointHoverRadius: 6,
          pointBackgroundColor: '#0284c7'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: { label: ctx => ` Projeção: ${brl(ctx.raw)}` }
          }
        },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 10 } } },
          y: { ticks: { callback: v => brlCurto(v), font: { size: 10 } } }
        }
      }
    });
  }

  // 5. Gráfico Distribuição das Despesas por Categoria
  const ctxDesp = document.getElementById('grafico-fin-despesas');
  if (ctxDesp) {
    if (window._chartFinDesp) window._chartFinDesp.destroy();

    const mapaCat = {};
    (fin.movsPeriodo || [])
      .filter(m => m.tipo === 'saida')
      .forEach(m => {
        const cat = m.cat || 'Geral';
        mapaCat[cat] = (mapaCat[cat] || 0) + (Number(m.valor) || 0);
      });

    // Se sem saídas no período, usa contas a pagar
    if (Object.keys(mapaCat).length === 0) {
      (S.contas || [])
        .filter(c => c.tipo === 'pagar' && !c.pago)
        .forEach(c => {
          const cat = c.cat || 'Fornecedores Peças';
          mapaCat[cat] = (mapaCat[cat] || 0) + (Number(c.valor) || 0);
        });
    }

    const pares = Object.entries(mapaCat).sort((a, b) => b[1] - a[1]).slice(0, 6);
    const labels = pares.map(p => p[0]);
    const dados = pares.map(p => +p[1].toFixed(2));
    const cores = ['#2563eb', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#64748b'];

    window._chartFinDesp = new Chart(ctxDesp, {
      type: 'doughnut',
      data: {
        labels: labels.length ? labels : ['Sem despesas'],
        datasets: [{
          data: dados.length ? dados : [1],
          backgroundColor: dados.length ? cores.slice(0, labels.length) : ['#e2e8f0']
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 11 } } },
          tooltip: {
            callbacks: { label: ctx => ` ${ctx.label}: ${brl(ctx.raw)}` }
          }
        }
      }
    });
  }
}

if (typeof window !== 'undefined') {
  window.renderGraficosFinanceiro = renderGraficosFinanceiro;
}
if (typeof globalThis !== 'undefined') {
  globalThis.renderGraficosFinanceiro = renderGraficosFinanceiro;
}

