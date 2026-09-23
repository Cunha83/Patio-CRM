/* =====================================================================
   PÁTIO CRM — MÓDULO FINANCEIRO COMPLETO (CONTAS, FLUXO, DRE & BANCO)
===================================================================== */

function viewFinanceiro() {
  const rec = emAberto('receber'), pag = emAberto('pagar');
  const vencidasR = rec.filter(c => c.venc < hoje());
  const vencidasP = pag.filter(c => c.venc < hoje());
  const mes = mesRef(hoje());
  const entradaMes = soma(S.movimentos.filter(m => m.tipo === 'entrada' && mesRef(m.data) === mes), m => m.valor);
  const saidaMes = soma(S.movimentos.filter(m => m.tipo === 'saida' && mesRef(m.data) === mes), m => m.valor);
  const totalRec = soma(rec, c => c.valor);
  const totalPag = soma(pag, c => c.valor);
  const abas = [
    ['dashboard', 'Dashboard Executivo 📊'],
    ['receber', 'A Receber (' + rec.length + ')'],
    ['pagar', 'A Pagar (' + pag.length + ')'],
    ['caixa', 'Fluxo de Caixa'],
    ['dre', 'Resultado Gerencial de Caixa'],
    ['banco', 'Conciliação Bancária']
  ];
  const a = S.ui.abaFin || 'dashboard';

  let corpo = '';
  if (a === 'dashboard') corpo = blocoDashboardFin();
  else if (a === 'receber') corpo = blocoContasReceber();
  else if (a === 'pagar') corpo = blocoContasPagar();
  else if (a === 'caixa') corpo = blocoFluxoCaixa();
  else if (a === 'dre') corpo = blocoDRE();
  else corpo = blocoBanco();

  return `
  ${a !== 'dashboard' ? `
  <div class="kpis" style="margin-bottom:14px">
    <div class="kpi bom">
      <div class="r">${ico('grana', 14)} Saldo em Caixa</div>
      <div class="v">${brlCurto(saldoCaixa())}</div>
      <div class="d">Saldo atual consolidado</div>
    </div>
    <div class="kpi ${vencidasR.length ? 'alerta' : 'neutro'}">
      <div class="r">${ico('doc', 14)} Total A Receber</div>
      <div class="v">${brlCurto(totalRec)}</div>
      <div class="d">${rec.length} títulos${vencidasR.length ? ' · <b style="color:var(--tijolo)">' + vencidasR.length + ' vencidos</b>' : ''}</div>
    </div>
    <div class="kpi ${vencidasP.length ? 'alerta' : 'aviso'}">
      <div class="r">${ico('caixa', 14)} Total A Pagar</div>
      <div class="v">${brlCurto(totalPag)}</div>
      <div class="d">${pag.length} contas${vencidasP.length ? ' · <b style="color:var(--tijolo)">' + vencidasP.length + ' vencidas</b>' : ''}</div>
    </div>
    <div class="kpi ${entradaMes - saidaMes >= 0 ? 'bom' : 'alerta'}">
      <div class="r">${ico('relatorios', 14)} Resultado do Mês</div>
      <div class="v">${brlCurto(entradaMes - saidaMes)}</div>
      <div class="d">Entradas: ${brlCurto(entradaMes)} | Saídas: ${brlCurto(saidaMes)}</div>
    </div>
  </div>` : ''}

  <div class="abas" style="margin-bottom:14px">
    ${abas.map(([k, r]) => `<button data-act="aba-fin" data-k="${k}" aria-selected="${a === k}">${r}</button>`).join('')}
  </div>

  ${corpo}`;
}

/* ===== MOTOR FINANCEIRO CLIENTE (CONSISTENTE COM SERVER) ===== */
function calcularDashboardFin(filtro = '30d', customDe = null, customAte = null) {
  const ref = hoje();
  let de = addDias(ref, -29);
  let ate = ref;

  if (filtro === 'hoje') {
    de = ref; ate = ref;
  } else if (filtro === '7d') {
    de = addDias(ref, -6); ate = ref;
  } else if (filtro === '15d') {
    de = addDias(ref, -14); ate = ref;
  } else if (filtro === '30d') {
    de = addDias(ref, -29); ate = ref;
  } else if (filtro === 'mes') {
    const dObj = new Date(ref + 'T12:00:00');
    const ano = dObj.getFullYear();
    const mes = String(dObj.getMonth() + 1).padStart(2, '0');
    de = `${ano}-${mes}-01`;
    const ult = new Date(ano, dObj.getMonth() + 1, 0).getDate();
    ate = `${ano}-${mes}-${String(ult).padStart(2, '0')}`;
  } else if (filtro === 'mes_anterior') {
    const dObj = new Date(ref + 'T12:00:00');
    const ant = new Date(dObj.getFullYear(), dObj.getMonth() - 1, 1);
    const ano = ant.getFullYear();
    const mes = String(ant.getMonth() + 1).padStart(2, '0');
    de = `${ano}-${mes}-01`;
    const ult = new Date(ano, ant.getMonth() + 1, 0).getDate();
    ate = `${ano}-${mes}-${String(ult).padStart(2, '0')}`;
  } else if (filtro === 'custom' && customDe && customAte) {
    de = customDe; ate = customAte;
  }

  const ini = Number(S.cfg?.saldoInicial) || 0;
  const movs = S.movimentos || [];
  const contas = S.contas || [];

  // Saldo geral consolidado (Toda a história)
  const totalEnt = soma(movs.filter(m => m.tipo === 'entrada'), m => m.valor);
  const totalSai = soma(movs.filter(m => m.tipo === 'saida'), m => m.valor);
  const saldoConsolidado = +(ini + totalEnt - totalSai).toFixed(2);

  // No período selecionado
  const movsPeriodo = movs.filter(m => (m.data || '').slice(0, 10) >= de && (m.data || '').slice(0, 10) <= ate);
  const entPeriodo = soma(movsPeriodo.filter(m => m.tipo === 'entrada'), m => m.valor);
  const saiPeriodo = soma(movsPeriodo.filter(m => m.tipo === 'saida'), m => m.valor);
  const resultadoPeriodo = +(entPeriodo - saiPeriodo).toFixed(2);

  // Contas em aberto
  const emAb = contas.filter(c => !c.pago);
  const rec = emAb.filter(c => c.tipo === 'receber');
  const pag = emAb.filter(c => c.tipo === 'pagar');

  const totRec = soma(rec, c => c.valor);
  const totPag = soma(pag, c => c.valor);
  const recVenc = soma(rec.filter(c => c.venc < ref), c => c.valor);
  const pagVenc = soma(pag.filter(c => c.venc < ref), c => c.valor);
  const recHoje = soma(rec.filter(c => c.venc === ref), c => c.valor);
  const pagHoje = soma(pag.filter(c => c.venc === ref), c => c.valor);

  const taxaInad = totRec > 0 ? +((recVenc / totRec) * 100).toFixed(1) : 0;

  // Projeção 30 dias
  const d30 = addDias(ref, 30);
  const recFut = soma(rec.filter(c => c.venc >= ref && c.venc <= d30), c => c.valor);
  const pagFut = soma(pag.filter(c => c.venc >= ref && c.venc <= d30), c => c.valor);
  const saldoProjetado30d = +(saldoConsolidado + recFut - pagFut).toFixed(2);

  return {
    filtro, de, ate, ref,
    saldoConsolidado, saldoInicial: ini,
    entPeriodo, saiPeriodo, resultadoPeriodo,
    totRec, totPag, recVenc, pagVenc, recHoje, pagHoje,
    qtdRec: rec.length, qtdPag: pag.length,
    qtdRecVenc: rec.filter(c => c.venc < ref).length,
    qtdPagVenc: pag.filter(c => c.venc < ref).length,
    taxaInad, saldoProjetado30d,
    movsPeriodo
  };
}

/* ===== DASHBOARD FINANCEIRO EXECUTIVO (BI) ===== */
function blocoDashboardFin() {
  const filtro = S.ui.filtroFin || '30d';
  const customDe = S.ui.filtroFinDe || null;
  const customAte = S.ui.filtroFinAte || null;
  const fin = calcularDashboardFin(filtro, customDe, customAte);

  const filtros = [
    ['hoje', 'Hoje'],
    ['7d', '7 Dias'],
    ['15d', '15 Dias'],
    ['30d', '30 Dias'],
    ['mes', 'Este Mês'],
    ['mes_anterior', 'Mês Anterior'],
    ['custom', 'Personalizado']
  ];

  // Agenda de próximos vencimentos (top 6)
  const proximos = (S.contas || [])
    .filter(c => !c.pago)
    .sort((a, b) => (a.venc || '').localeCompare(b.venc || ''))
    .slice(0, 6);

  return `
  <!-- Barra de Filtros & Ações Rápidas Executivas -->
  <div class="barra-filtros-fin">
    <div class="grupo-chips-filtro">
      <span class="mini" style="font-weight:700;color:var(--aco-600);margin-right:4px">Período:</span>
      ${filtros.map(([k, r]) => `
        <button class="chip-filtro ${filtro === k ? 'ativo' : ''}" data-act="filtro-fin" data-f="${k}">
          ${r}
        </button>
      `).join('')}
      ${filtro === 'custom' ? `
        <div style="display:inline-flex;gap:4px;align-items:center;margin-left:6px">
          <input type="date" class="campo-texto" id="fin_filtro_de" value="${fin.de}" style="height:28px;font-size:11px;padding:2px 6px">
          <span class="mini">até</span>
          <input type="date" class="campo-texto" id="fin_filtro_ate" value="${fin.ate}" style="height:28px;font-size:11px;padding:2px 6px">
          <button class="btn btn-primario btn-pequeno" data-act="aplicar-filtro-fin-custom">OK</button>
        </div>
      ` : ''}
    </div>

    <div class="acoes-topo-fin">
      <button class="btn btn-secundario" data-act="ver-imagem-preview" style="font-size:12px;padding:5px 12px">
        🖼️ Imagem WhatsApp (JPG)
      </button>
      <button class="btn btn-primario" data-act="disparar-grupo-admin" style="font-size:12px;padding:5px 12px;font-weight:600">
        🚀 Disparar para Admin
      </button>
    </div>
  </div>

  <!-- Cards Superiores de KPIs Financeiros (6 Cards Executivos) -->
  <div class="kpis-fin-grid">
    <div class="card-fin-kpi" style="--cor:#2563eb">
      <div class="kpi-topo-rotulo">
        <span>💵 Saldo em Caixa</span>
        <span class="mini" style="color:var(--verde)">● Conciliado</span>
      </div>
      <div class="kpi-valor-grande num" style="color:${fin.saldoConsolidado >= 0 ? 'var(--verde)' : 'var(--tijolo)'}">
        ${brl(fin.saldoConsolidado)}
      </div>
      <div class="kpi-sub-desc">Saldo consolidado disponível</div>
    </div>

    <div class="card-fin-kpi" style="--cor:#10b981">
      <div class="kpi-topo-rotulo">
        <span>🟢 A Receber</span>
        <span class="mini">${fin.qtdRec} títulos</span>
      </div>
      <div class="kpi-valor-grande num" style="color:var(--verde)">
        ${brl(fin.totRec)}
      </div>
      <div class="kpi-sub-desc">${fin.qtdRecVenc > 0 ? `<b style="color:var(--tijolo)">${brl(fin.recVenc)} vencidos</b>` : 'Nenhum título vencido'}</div>
    </div>

    <div class="card-fin-kpi" style="--cor:#ef4444">
      <div class="kpi-topo-rotulo">
        <span>🔴 A Pagar</span>
        <span class="mini">${fin.qtdPag} contas</span>
      </div>
      <div class="kpi-valor-grande num" style="color:var(--tijolo)">
        ${brl(fin.totPag)}
      </div>
      <div class="kpi-sub-desc">${fin.qtdPagVenc > 0 ? `<b style="color:var(--tijolo)">${brl(fin.pagVenc)} em atraso</b>` : 'Compromissos em dia'}</div>
    </div>

    <div class="card-fin-kpi" style="--cor:${fin.resultadoPeriodo >= 0 ? 'var(--verde)' : 'var(--sinal)'}">
      <div class="kpi-topo-rotulo">
        <span>⚖️ Resultado (${filtro.toUpperCase()})</span>
      </div>
      <div class="kpi-valor-grande num" style="color:${fin.resultadoPeriodo >= 0 ? 'var(--verde)' : 'var(--tijolo)'}">
        ${fin.resultadoPeriodo >= 0 ? '+' : ''}${brl(fin.resultadoPeriodo)}
      </div>
      <div class="kpi-sub-desc">+${brlCurto(fin.entPeriodo)} ent | -${brlCurto(fin.saiPeriodo)} saí</div>
    </div>

    <div class="card-fin-kpi" style="--cor:#38bdf8">
      <div class="kpi-topo-rotulo">
        <span>📈 Projeção (30d)</span>
      </div>
      <div class="kpi-valor-grande num" style="color:var(--petroleo)">
        ${brl(fin.saldoProjetado30d)}
      </div>
      <div class="kpi-sub-desc">Caixa + A Receber − A Pagar</div>
    </div>

    <div class="card-fin-kpi" style="--cor:${fin.taxaInad > 0 ? 'var(--sinal)' : 'var(--verde)'}">
      <div class="kpi-topo-rotulo">
        <span>⚠️ Inadimplência</span>
      </div>
      <div class="kpi-valor-grande num" style="color:${fin.taxaInad > 0 ? 'var(--sinal)' : 'var(--verde)'}">
        ${fin.taxaInad}%
      </div>
      <div class="kpi-sub-desc">${fin.qtdRecVenc} títulos em cobrança</div>
    </div>
  </div>

  <!-- Linha 1 de Gráficos: Fluxo de Caixa (1) & Receber x Pagar (2) -->
  <div class="grid-graficos-duplo">
    <div class="card card-p">
      <div class="entre" style="margin-bottom:12px;border-bottom:1px solid var(--aco-200);padding-bottom:8px">
        <div>
          <div style="font-weight:700;font-size:14px;color:var(--aco-900)">📊 Gráfico 1 — Fluxo de Caixa (Entradas vs Saídas)</div>
          <div class="mini">Movimentações financeiras realizadas no período selecionado</div>
        </div>
        <span class="badge-periodo-atual">${dataBR(fin.de)} a ${dataBR(fin.ate)}</span>
      </div>
      <div class="chart-box-container">
        <canvas id="grafico-fin-fluxo"></canvas>
      </div>
    </div>

    <div class="card card-p">
      <div class="entre" style="margin-bottom:12px;border-bottom:1px solid var(--aco-200);padding-bottom:8px">
        <div>
          <div style="font-weight:700;font-size:14px;color:var(--aco-900)">⚖️ Gráfico 2 — Comparativo Receber x Pagar</div>
          <div class="mini">Títulos em aberto agrupados por prazo de vencimento</div>
        </div>
        <span class="badge-periodo-atual">Aging de Contas</span>
      </div>
      <div class="chart-box-container">
        <canvas id="grafico-fin-rxp"></canvas>
      </div>
    </div>
  </div>

  <!-- Linha 2 de Gráficos: Evolução do Saldo (3) & Projeção Financeira (4) -->
  <div class="grid-graficos-duplo">
    <div class="card card-p">
      <div class="entre" style="margin-bottom:12px;border-bottom:1px solid var(--aco-200);padding-bottom:8px">
        <div>
          <div style="font-weight:700;font-size:14px;color:var(--aco-900)">📈 Gráfico 3 — Evolução do Saldo de Caixa</div>
          <div class="mini">Curva acumulada de disponibilidade de caixa ao longo do período</div>
        </div>
        <span class="badge-periodo-atual">Histórico de Liquidez</span>
      </div>
      <div class="chart-box-container">
        <canvas id="grafico-fin-saldo"></canvas>
      </div>
    </div>

    <div class="card card-p">
      <div class="entre" style="margin-bottom:12px;border-bottom:1px solid var(--aco-200);padding-bottom:8px">
        <div>
          <div style="font-weight:700;font-size:14px;color:var(--aco-900)">🎯 Gráfico 4 — Projeção Financeira (Próximos 30 Dias)</div>
          <div class="mini">Estimativa de saldo considerando vencimentos futuros cadastrados</div>
        </div>
        <span class="badge-periodo-atual">Projeção Futura</span>
      </div>
      <div class="chart-box-container">
        <canvas id="grafico-fin-projecao"></canvas>
      </div>
    </div>
  </div>

  <!-- Linha 3: Distribuição das Despesas (5) & Próximos Vencimentos -->
  <div class="grid-graficos-duplo">
    <div class="card card-p">
      <div class="entre" style="margin-bottom:12px;border-bottom:1px solid var(--aco-200);padding-bottom:8px">
        <div>
          <div style="font-weight:700;font-size:14px;color:var(--aco-900)">🍩 Gráfico 5 — Distribuição das Despesas</div>
          <div class="mini">Gastos e contas a pagar agrupados por centro de custo</div>
        </div>
        <span class="badge-periodo-atual">Categorias</span>
      </div>
      <div class="chart-box-container">
        <canvas id="grafico-fin-despesas"></canvas>
      </div>
    </div>

    <div class="card card-p">
      <div class="entre" style="margin-bottom:12px;border-bottom:1px solid var(--aco-200);padding-bottom:8px">
        <div>
          <div style="font-weight:700;font-size:14px;color:var(--aco-900)">📅 Próximos Vencimentos Prioritários</div>
          <div class="mini">Compromissos e recebimentos mais urgentes da oficina</div>
        </div>
        <button class="btn btn-secundario btn-pequeno" onclick="S.ui.abaFin='pagar';render()">Ver Todas</button>
      </div>
      <div class="tabela-responsiva">
        <table class="tabela">
          <thead>
            <tr>
              <th>Tipo</th>
              <th>Descrição / Parceiro</th>
              <th style="text-align:center">Vencimento</th>
              <th style="text-align:right">Valor</th>
              <th style="text-align:center">Ação</th>
            </tr>
          </thead>
          <tbody>
            ${proximos.length ? proximos.map(c => {
              const vencida = c.venc < hoje();
              const hojeVenc = c.venc === hoje();
              const isRec = c.tipo === 'receber';
              return `
              <tr style="${vencida ? 'background:rgba(239, 68, 68, 0.04)' : ''}">
                <td>
                  <span class="selo ${isRec ? 'selo-finalizada' : 'selo-peca'}" style="font-size:10px">
                    ${isRec ? 'Receber' : 'Pagar'}
                  </span>
                </td>
                <td>
                  <b>${esc(c.parte)}</b>
                  <div class="mini">${esc(c.desc)}</div>
                </td>
                <td style="text-align:center">
                  <span class="mono">${dataBR(c.venc)}</span>
                  ${vencida ? `<div class="mini" style="color:var(--tijolo);font-weight:700">Atrasado</div>` : hojeVenc ? `<div class="mini" style="color:var(--sinal);font-weight:700">Hoje</div>` : ''}
                </td>
                <td style="text-align:right;font-weight:700" class="num">${brl(c.valor)}</td>
                <td style="text-align:center">
                  <button class="btn btn-sucesso btn-pequeno" data-act="baixar" data-id="${c.id}" title="Baixar">
                    ${ico('check', 11)}
                  </button>
                </td>
              </tr>`;
            }).join('') : `
              <tr><td colspan="5" style="text-align:center;padding:24px;color:var(--aco-400)">Nenhum vencimento pendente registrado.</td></tr>
            `}
          </tbody>
        </table>
      </div>
    </div>
  </div>`;
}

function renderGraficosFinanceiro() {
  if (typeof Chart === 'undefined') return;

  const filtro = S.ui.filtroFin || '30d';
  const customDe = S.ui.filtroFinDe || null;
  const customAte = S.ui.filtroFinAte || null;
  const fin = calcularDashboardFin(filtro, customDe, customAte);
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

    const saldoHoje = saldoCaixa();
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

function agingReceber() {
  const dH = hoje();
  const rec = emAberto('receber');
  let vencido = 0, ate7d = 0, ate30d = 0, mais30d = 0;

  rec.forEach(c => {
    const diff = diasEntre(dH, c.venc);
    if (diff < 0) vencido += c.valor;
    else if (diff <= 7) ate7d += c.valor;
    else if (diff <= 30) ate30d += c.valor;
    else mais30d += c.valor;
  });

  return { vencido, ate7d, ate30d, mais30d };
}

function categorizarContas(tipo) {
  const contas = emAberto(tipo);
  const mapa = {};
  contas.forEach(c => {
    const cat = c.cat || 'Outros';
    mapa[cat] = (mapa[cat] || 0) + c.valor;
  });
  return Object.entries(mapa).map(([cat, total]) => ({ cat, total })).sort((a, b) => b.total - a.total);
}

/* ===== CONTAS A RECEBER ===== */
function blocoContasReceber() {
  const contas = S.contas.filter(c => c.tipo === 'receber');
  const dH = hoje();

  return `
  <div class="entre" style="margin-bottom:12px">
    <div style="font-weight:600;font-size:14px">Controle de Títulos a Receber (${contas.length})</div>
    <button class="btn btn-primario" data-act="nova-conta" data-t="receber" style="font-size:13px;padding:6px 14px">
      ${ico('mais', 14)} Lançar Novo Título
    </button>
  </div>

  <div class="card">
    <div class="tabela-responsiva">
      <table class="tabela">
        <thead>
          <tr>
            <th>Descrição / Documento</th>
            <th>Cliente / Sacado</th>
            <th style="width:110px;text-align:center">Vencimento</th>
            <th style="width:120px;text-align:right">Valor</th>
            <th style="width:120px;text-align:center">Status</th>
            <th style="width:160px;text-align:center">Ações</th>
          </tr>
        </thead>
        <tbody>
          ${contas.length ? contas.map(c => {
            const vencida = !c.pago && c.venc < dH;
            const venceHoje = !c.pago && c.venc === dH;

            return `
            <tr style="${vencida ? 'background:rgba(239, 68, 68, 0.04)' : ''}">
              <td>
                <div style="font-weight:600;color:var(--aco-900)">${esc(c.desc)}</div>
                <div class="mini">Doc: ${esc(c.doc || '—')} · Cat: ${esc(c.cat || 'Serviços')}</div>
              </td>
              <td><b>${esc(c.parte)}</b></td>
              <td style="text-align:center">
                <span class="mono">${dataBRfull(c.venc)}</span>
                ${vencida ? `<div class="mini" style="color:var(--tijolo)">${Math.abs(diasEntre(dH, c.venc))}d em atraso</div>` : ''}
              </td>
              <td style="text-align:right;font-weight:700" class="num">${brl(c.valor)}</td>
              <td style="text-align:center">
                ${c.pago ? `
                  <span class="selo selo-finalizada">Recebido (${dataBR(c.dataPgto)})</span>
                ` : vencida ? `
                  <span class="selo selo-peca" style="background:var(--tijolo-fraco);color:var(--tijolo)">Vencido</span>
                ` : venceHoje ? `
                  <span class="selo selo-aprovacao">Vence Hoje</span>
                ` : `
                  <span class="selo selo-fila">Em Aberto</span>
                `}
              </td>
              <td style="text-align:center">
                <div style="display:inline-flex;gap:4px">
                  ${!c.pago ? `
                    <button class="btn btn-sucesso" data-act="baixar" data-id="${c.id}" style="padding:4px 8px;font-size:12px" title="Dar Baixa / Receber">
                      ${ico('check', 12)} Receber
                    </button>
                    <button class="btn btn-secundario" data-act="cobrar-titulo" data-id="${c.id}" style="padding:4px 8px;font-size:12px" title="Cobrar no WhatsApp">
                      ${ico('zap', 12)}
                    </button>
                  ` : `
                    <button class="btn btn-secundario" data-act="imprimir-recibo" data-id="${c.id}" style="padding:4px 8px;font-size:12px" title="Imprimir Recibo">
                      ${ico('imprimir', 12)} Recibo
                    </button>
                  `}
                </div>
              </td>
            </tr>`;
          }).join('') : `
            <tr><td colspan="6" style="text-align:center;padding:30px;color:var(--aco-400)">Nenhum título a receber registrado.</td></tr>
          `}
        </tbody>
      </table>
    </div>
  </div>`;
}

/* ===== CONTAS A PAGAR ===== */
function blocoContasPagar() {
  const contas = S.contas.filter(c => c.tipo === 'pagar');
  const dH = hoje();

  return `
  <div class="entre" style="margin-bottom:12px">
    <div style="font-weight:600;font-size:14px">Controle de Contas a Pagar (${contas.length})</div>
    <button class="btn btn-primario" data-act="nova-conta" data-t="pagar" style="font-size:13px;padding:6px 14px">
      ${ico('mais', 14)} Lançar Nova Conta
    </button>
  </div>

  <div class="card">
    <div class="tabela-responsiva">
      <table class="tabela">
        <thead>
          <tr>
            <th>Descrição / Documento</th>
            <th>Fornecedor / Favorecido</th>
            <th style="width:110px;text-align:center">Vencimento</th>
            <th style="width:120px;text-align:right">Valor</th>
            <th style="width:120px;text-align:center">Status</th>
            <th style="width:140px;text-align:center">Ações</th>
          </tr>
        </thead>
        <tbody>
          ${contas.length ? contas.map(c => {
            const vencida = !c.pago && c.venc < dH;

            return `
            <tr style="${vencida ? 'background:rgba(239, 68, 68, 0.04)' : (c.provisionado ? 'background:rgba(245, 158, 11, 0.04)' : '')}">
              <td>
                <div style="font-weight:600;color:var(--aco-900)">${esc(c.desc)}</div>
                <div class="mini">Doc: ${esc(c.doc || '—')} · Cat: ${esc(c.cat || 'Geral')}${c.provisionado ? ' · <b style="color:#b45309">⏳ Aguardando NF</b>' : ''}</div>
              </td>
              <td><b>${esc(c.parte)}</b></td>
              <td style="text-align:center">
                <span class="mono">${dataBRfull(c.venc)}</span>
                ${vencida ? `<div class="mini" style="color:var(--tijolo)">${Math.abs(diasEntre(dH, c.venc))}d em atraso</div>` : ''}
              </td>
              <td style="text-align:right;font-weight:700" class="num">${brl(c.valor)}</td>
              <td style="text-align:center">
                ${c.pago ? `
                  <span class="selo selo-finalizada">Pago (${dataBR(c.dataPgto)})</span>
                ` : c.provisionado ? `
                  <span class="selo" style="background:#fef3c7;color:#b45309;border:1px solid #fde68a" title="Provisionamento: Aguardando NF do Fornecedor">Provisionado</span>
                ` : vencida ? `
                  <span class="selo" style="background:var(--tijolo-fraco);color:var(--tijolo)">Vencido</span>
                ` : `
                  <span class="selo selo-fila">Em Aberto</span>
                `}
              </td>
              <td style="text-align:center">
                ${!c.pago ? `
                  <button class="btn ${c.provisionado ? 'btn-secundario' : 'btn-sucesso'}" data-act="baixar" data-id="${c.id}" style="padding:4px 10px;font-size:12px">
                    ${ico('check', 12)} ${c.provisionado ? 'Baixar / Liquidar' : 'Baixar Pagamento'}
                  </button>
                ` : `
                  <span class="mini" style="color:var(--verde)">Quitado</span>
                `}
              </td>
            </tr>`;
          }).join('') : `
            <tr><td colspan="6" style="text-align:center;padding:30px;color:var(--aco-400)">Nenhuma conta a pagar cadastrada.</td></tr>
          `}
        </tbody>
      </table>
    </div>
  </div>`;
}

/* ===== FLUXO DE CAIXA ===== */
function blocoFluxoCaixa() {
  const movs = (S.movimentos || []).slice().reverse();

  return `
  <div class="entre" style="margin-bottom:12px">
    <div>
      <div style="font-weight:700;font-size:15px">Extrato e Movimentação de Caixa</div>
      <div class="mini">Saldo Atual: <b style="color:var(--verde)">${brl(saldoCaixa())}</b></div>
    </div>
    <button class="btn btn-primario" data-act="novo-mov" style="font-size:13px;padding:6px 14px">
      ${ico('mais', 14)} Lançar Movimento Avulso
    </button>
  </div>

  <div class="card">
    <div class="tabela-responsiva">
      <table class="tabela">
        <thead>
          <tr>
            <th style="width:100px">Data</th>
            <th>Descrição do Lançamento</th>
            <th>Categoria</th>
            <th>Forma</th>
            <th style="width:130px;text-align:right">Valor</th>
            <th style="width:80px;text-align:center">Status</th>
          </tr>
        </thead>
        <tbody>
          ${movs.length ? movs.map(m => {
            const isEntrada = m.tipo === 'entrada';
            return `
            <tr>
              <td class="mono">${dataBRfull(m.data)}</td>
              <td><b>${esc(m.desc)}</b></td>
              <td><span class="selo">${esc(m.cat || 'Geral')}</span></td>
              <td class="mini">${esc(m.forma || 'Pix/Conta')}</td>
              <td style="text-align:right;font-weight:700;color:${isEntrada ? 'var(--verde)' : 'var(--tijolo)'}" class="num">
                ${isEntrada ? '+' : '−'} ${brl(m.valor)}
              </td>
              <td style="text-align:center">
                <span class="selo ${m.conc ? 'selo-finalizada' : 'selo-fila'}" style="font-size:10px">
                  ${m.conc ? 'Conciliado' : 'Manual'}
                </span>
              </td>
            </tr>`;
          }).join('') : `
            <tr><td colspan="6" style="text-align:center;padding:30px;color:var(--aco-400)">Nenhuma movimentação de caixa recente.</td></tr>
          `}
        </tbody>
      </table>
    </div>
  </div>`;
}

/* ===== DRE GERENCIAL SIMPLIFICADO ===== */
function blocoDRE() {
  const mes = mesRef(hoje());
  const movsMes = S.movimentos.filter(m => mesRef(m.data) === mes);
  const recMes = soma(movsMes.filter(m => m.tipo === 'entrada'), m => m.valor);
  const despesasPecas = soma(movsMes.filter(m => m.tipo === 'saida' && m.cat === 'Fornecedores Peças'), m => m.valor);
  const despesasPessoal = soma(movsMes.filter(m => m.tipo === 'saida' && m.cat === 'Pessoal & Salários'), m => m.valor);
  const despesasFixas = soma(movsMes.filter(m => m.tipo === 'saida' && ['Estrutura & Aluguel', 'Água / Luz / Internet'].includes(m.cat)), m => m.valor);
  const outrasDesp = soma(movsMes.filter(m => m.tipo === 'saida' && !['Fornecedores Peças', 'Pessoal & Salários', 'Estrutura & Aluguel', 'Água / Luz / Internet'].includes(m.cat)), m => m.valor);
  const totalDesp = despesasPecas + despesasPessoal + despesasFixas + outrasDesp;
  const lucroLiq = recMes - totalDesp;
  const margemLiq = recMes > 0 ? ((lucroLiq / recMes) * 100).toFixed(1) : 0;

  return `
  <div class="card card-p" style="max-width:700px;margin:0 auto">
    <div class="entre" style="border-bottom:2px solid var(--aco-900);padding-bottom:10px;margin-bottom:14px">
      <div>
        <h3 style="font-size:17px;font-weight:700">Demonstrativo Gerencial de Resultados (Regime de Caixa)</h3>
        <div class="mini">Apurado a partir de movimentações financeiras de caixa realizadas (${dataBR(hoje())})</div>
      </div>
      <div class="num" style="font-size:22px;font-weight:700;color:${lucroLiq >= 0 ? 'var(--verde)' : 'var(--tijolo)'}">
        ${brl(lucroLiq)} <span style="font-size:13px">(${margemLiq}%)</span>
      </div>
    </div>

    <div style="background:var(--aco-050);border-left:4px solid var(--primario);padding:10px 14px;border-radius:6px;font-size:12px;color:var(--aco-700);margin-bottom:16px;line-height:1.4">
      📊 <b>Critério Gerencial Operacional:</b> Este demonstrativo é apurado exclusivamente a partir de movimentações financeiras de caixa realizadas (entradas e saídas efetivas) para acompanhamento da saúde operacional da oficina mecânica. Não se confunde com DRE Contábil societária ou escrituração fiscal oficial, que devem ser emitidas através do ERP fiscal-contábil externo integrado da empresa.
    </div>

    <div style="display:flex;flex-direction:column;gap:10px;font-size:13.5px">
      <div class="entre" style="font-weight:700;font-size:14.5px;color:var(--aco-900);background:var(--aco-050);padding:8px">
        <span>(+) RECEITA BRUTA OPERACIONAL REALIZADA</span>
        <span class="num">${brl(recMes)}</span>
      </div>

      <div class="entre" style="padding-left:14px;color:var(--aco-700)">
        <span>(−) Custos de Peças e Insumos Pagos (CMV Caixa)</span>
        <span class="num">${brl(despesasPecas)}</span>
      </div>

      <div class="entre" style="padding-left:14px;color:var(--aco-700)">
        <span>(−) Despesas com Folha de Pagamento / Mecânicos Pagas</span>
        <span class="num">${brl(despesasPessoal)}</span>
      </div>

      <div class="entre" style="padding-left:14px;color:var(--aco-700)">
        <span>(−) Despesas Fixas Pagas (Aluguel, Luz, Água, Internet)</span>
        <span class="num">${brl(despesasFixas)}</span>
      </div>

      <div class="entre" style="padding-left:14px;color:var(--aco-700)">
        <span>(−) Outras Despesas Operacionais e Administrativas</span>
        <span class="num">${brl(outrasDesp)}</span>
      </div>

      <div class="entre" style="font-weight:700;font-size:15px;border-top:2px solid var(--aco-300);padding-top:12px;margin-top:8px">
        <span>(=) RESULTADO OPERACIONAL GERENCIAL DE CAIXA</span>
        <span class="num" style="color:${lucroLiq >= 0 ? 'var(--verde)' : 'var(--tijolo)'}">${brl(lucroLiq)}</span>
      </div>
    </div>
  </div>`;
}

/* ===== CONCILIAÇÃO BANCÁRIA ===== */
function blocoBanco() {
  const extrato = S.extrato || [];

  return `
  <div class="entre" style="margin-bottom:12px">
    <div>
      <div style="font-weight:700;font-size:15px">Conciliação Bancária com Extrato OFX / CSV</div>
      <div class="mini">Importe o arquivo do seu banco para cruzar lançamentos automaticamente</div>
    </div>
    <div style="display:flex;gap:8px">
      ${extrato.length ? `<button class="btn btn-secundario" data-act="limpar-extrato">Limpar Extrato</button>` : ''}
      <label class="btn btn-primario" style="cursor:pointer;display:inline-flex;align-items:center;gap:6px;font-size:13px;padding:6px 14px">
        ${ico('upload', 14)} Importar Arquivo OFX/CSV
        <input type="file" accept=".ofx,.csv,.txt" data-act="arquivo-extrato" multiple style="display:none">
      </label>
    </div>
  </div>

  <div class="card card-p">
    ${extrato.length ? `
      <div class="tabela-responsiva">
        <table class="tabela">
          <thead>
            <tr><th>Data</th><th>Descrição no Extrato</th><th style="width:120px;text-align:right">Valor</th><th style="width:180px;text-align:center">Ação</th></tr>
          </thead>
          <tbody>
            ${extrato.map(l => `
              <tr style="${l.ok ? 'opacity:0.5' : ''}">
                <td class="mono">${dataBR(l.data)}</td>
                <td><b>${esc(l.desc)}</b></td>
                <td style="text-align:right;font-weight:700;color:${l.valor >= 0 ? 'var(--verde)' : 'var(--tijolo)'}" class="num">
                  ${brl(l.valor)}
                </td>
                <td style="text-align:center">
                  ${l.ok ? `<span class="selo selo-finalizada">Conciliado</span>` : `
                    <button class="btn btn-secundario" data-act="conciliar-avulso" data-id="${l.id}" style="font-size:12px;padding:4px 8px">
                      Lançar no Caixa
                    </button>
                  `}
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    ` : `
      <div style="text-align:center;padding:40px;color:var(--aco-400)">
        <div style="margin-bottom:10px">${ico('fin', 32)}</div>
        <b>Nenhum extrato importado</b><br>
        Envie o arquivo OFX exportado pelo Internet Banking da oficina para conciliar saldos.
      </div>
    `}
  </div>`;
}

function baixarConta(c, dataPgto) {
  if (!c || c.pago) return;
  c.pago = true;
  c.dataPgto = dataPgto || hoje();

  S.movimentos.push({
    id: uid('mv'),
    data: c.dataPgto,
    tipo: c.tipo === 'receber' ? 'entrada' : 'saida',
    desc: `Baixa: ${c.desc} (${c.parte})`,
    valor: c.valor,
    cat: c.cat || 'Geral',
    conc: true,
    forma: 'Baixa Financeira'
  });

  salvar();
}

function imprimirRecibo(contaId) {
  const c = S.contas.find(x => x.id === contaId);
  if (!c) return;

  const cfg = S.cfg;
  const janela = window.open('', '_blank');
  if (!janela) return;

    const logoRaw = cfg.identidadeVisual?.logo || cfg.identidadeVisual?.imagemInstitucional;
    const logoUrl = (typeof logoRaw === 'string') ? logoRaw : (logoRaw?.url || null);
    const logoHtml = logoUrl ? `<img src="${logoUrl}" style="max-height:50px;max-width:160px;object-fit:contain;margin-bottom:8px" alt="Logo"><br>` : '';

    janela.document.write(`
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="utf-8">
      <title>Recibo de Pagamento — ${cfg.empresa}</title>
      <style>
        body { font-family: sans-serif; font-size: 13px; max-width: 600px; margin: 20px auto; padding: 20px; border: 2px solid #334155; border-radius: 8px; }
        .topo { text-align: center; border-bottom: 2px solid #cbd5e1; padding-bottom: 12px; margin-bottom: 16px; }
        .valor { font-size: 24px; font-weight: bold; color: #10b981; margin: 14px 0; text-align: right; }
        .corpo { line-height: 1.6; margin-bottom: 24px; }
        .ass { margin-top: 40px; text-align: center; border-top: 1px solid #000; width: 60%; margin-left: auto; margin-right: auto; padding-top: 6px; }
      </style>
    </head>
    <body>
      <div class="topo">
        ${logoHtml}
        <h2>${esc(cfg.empresa)}</h2>
        <div>CNPJ: ${esc(cfg.cnpj)} · ${esc(cfg.endereco)}</div>
      </div>
    <div class="valor">RECIBO: ${brl(c.valor)}</div>
    <div class="corpo">
      Recebemos de <b>${esc(c.parte)}</b> a quantia de <b>${brl(c.valor)}</b> referente a <b>${esc(c.desc)}</b> (${esc(c.doc || 'Doc S/N')}).<br>
      Para clareza e fins de direito, firmamos o presente recibo dando plena e geral quitação.
    </div>
    <div style="text-align:right">Campinas, ${dataBRfull(c.dataPgto || hoje())}.</div>
    <div class="ass">${esc(cfg.empresa)}<br><small>Assinatura Autorizada</small></div>
    <script>window.onload = () => window.print();<\/script>
  </body>
  </html>`);
  janela.document.close();
}

function folhaConta() {
  const tipo = S.ui.contaTipo || 'receber';
  const r = S.ui.rascConta = S.ui.rascConta || { venc: hoje(), valor: '' };

  return `
  <div class="card card-p" style="max-width:500px;margin:0 auto">
    <div class="entre" style="border-bottom:1px solid var(--aco-150);padding-bottom:10px;margin-bottom:14px">
      <h3 style="font-size:17px;font-weight:700">Lançar Título — Contas a ${tipo === 'receber' ? 'Receber' : 'Pagar'}</h3>
      <button class="btn-fechar" data-act="fechar">${ico('x', 18)}</button>
    </div>

    <div style="display:flex;flex-direction:column;gap:12px;font-size:13px">
      <div>
        <label style="font-weight:600;display:block;margin-bottom:4px">Descrição do Título:</label>
        <input type="text" class="campo-texto" placeholder="Ex: Manutenção Preventiva / Compra de Peças" data-act="rct" data-c="desc" value="${esc(r.desc || '')}" style="width:100%;height:34px">
      </div>

      <div>
        <label style="font-weight:600;display:block;margin-bottom:4px">${tipo === 'receber' ? 'Cliente / Devedor' : 'Fornecedor / Favorecido'}:</label>
        <input type="text" class="campo-texto" placeholder="Nome da empresa ou pessoa" data-act="rct" data-c="parte" value="${esc(r.parte || '')}" style="width:100%;height:34px">
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div>
          <label style="font-weight:600;display:block;margin-bottom:4px">Valor (R$):</label>
          <input type="number" class="campo-texto" placeholder="0.00" data-act="rct" data-c="valor" value="${r.valor || ''}" step="0.50" style="width:100%;height:34px;font-weight:700">
        </div>
        <div>
          <label style="font-weight:600;display:block;margin-bottom:4px">Data de Vencimento:</label>
          <input type="date" class="campo-texto" data-act="rct" data-c="venc" value="${r.venc || hoje()}" style="width:100%;height:34px">
        </div>
      </div>

      <div>
        <label style="font-weight:600;display:block;margin-bottom:4px">Categoria de Centro de Custo:</label>
        <select class="campo-select" data-act="rct" data-c="cat" style="width:100%;height:34px">
          ${(S.cfg.planoDeContas || []).map(x => `<option value="${esc(x)}" ${r.cat===x?'selected':''}>${esc(x)}</option>`).join('')}
        </select>
      </div>
    </div>

    <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:18px;border-top:1px solid var(--aco-150);padding-top:12px">
      <button class="btn btn-secundario" data-act="fechar">Cancelar</button>
      <button class="btn btn-primario" data-act="salvar-conta" style="font-weight:600;padding:0 18px">
        ${ico('check', 14)} Lançar Conta
      </button>
    </div>
  </div>`;
}

function folhaMov() {
  const r = S.ui.rascMov = S.ui.rascMov || { data: hoje(), tipo: 'entrada', valor: '' };

  return `
  <div class="card card-p" style="max-width:500px;margin:0 auto">
    <div class="entre" style="border-bottom:1px solid var(--aco-150);padding-bottom:10px;margin-bottom:14px">
      <h3 style="font-size:17px;font-weight:700">Lançamento Avulso no Caixa</h3>
      <button class="btn-fechar" data-act="fechar">${ico('x', 18)}</button>
    </div>

    <div style="display:flex;flex-direction:column;gap:12px;font-size:13px">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div>
          <label style="font-weight:600;display:block;margin-bottom:4px">Tipo de Movimento:</label>
          <select class="campo-select" data-act="rmv" data-c="tipo" style="width:100%;height:34px;font-weight:600">
            <option value="entrada" ${r.tipo === 'entrada' ? 'selected' : ''}>Entrada (+) Receita</option>
            <option value="saida" ${r.tipo === 'saida' ? 'selected' : ''}>Saída (−) Despesa</option>
          </select>
        </div>
        <div>
          <label style="font-weight:600;display:block;margin-bottom:4px">Data:</label>
          <input type="date" class="campo-texto" data-act="rmv" data-c="data" value="${r.data || hoje()}" style="width:100%;height:34px">
        </div>
      </div>

      <div>
        <label style="font-weight:600;display:block;margin-bottom:4px">Descrição do Lançamento:</label>
        <input type="text" class="campo-texto" placeholder="Ex: Pagamento de Frete / Compra de Material de Limpeza" data-act="rmv" data-c="desc" value="${esc(r.desc || '')}" style="width:100%;height:34px">
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div>
          <label style="font-weight:600;display:block;margin-bottom:4px">Categoria / Centro de Custo:</label>
          <select class="campo-select" data-act="rmv" data-c="cat" style="width:100%;height:34px">
            ${(S.cfg.planoDeContas || []).map(x => `<option value="${esc(x)}" ${r.cat===x?'selected':''}>${esc(x)}</option>`).join('')}
          </select>
        </div>
        <div>
          <label style="font-weight:600;display:block;margin-bottom:4px">Valor (R$):</label>
          <input type="number" class="campo-texto" placeholder="0.00" data-act="rmv" data-c="valor" value="${r.valor || ''}" step="0.50" style="width:100%;height:34px;font-weight:700">
        </div>
      </div>
    </div>

    <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:18px;border-top:1px solid var(--aco-150);padding-top:12px">
      <button class="btn btn-secundario" data-act="fechar">Cancelar</button>
      <button class="btn btn-primario" data-act="salvar-mov" style="font-weight:600;padding:0 18px">
        ${ico('check', 14)} Salvar Movimento
      </button>
    </div>
  </div>`;
}
