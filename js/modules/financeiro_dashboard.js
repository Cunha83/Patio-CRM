/* =====================================================================
   PÁTIO CRM — DASHBOARD FINANCEIRO EXECUTIVO (BI)
===================================================================== */

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

  <!-- Faixa de Auditoria de Origem (WhatsApp vs Web e Estornos) -->
  <div class="card card-p" style="margin-bottom:14px;padding:10px 16px;background:var(--aco-050);border:1px solid var(--aco-200);display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px">
    <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;font-size:12.5px">
      <span style="font-weight:700;color:var(--aco-800);display:inline-flex;align-items:center;gap:6px">
        🔍 Auditoria de Origem:
      </span>
      <span class="selo" style="background:#dcfce7;color:#166534;border:1px solid #bbf7d0;font-size:11px;font-weight:700">
        📱 WhatsApp: ${fin.resumoOrigem ? fin.resumoOrigem.qtdWhatsapp : 0} (${brl((fin.resumoOrigem && fin.resumoOrigem.totalWhatsapp) || 0)})
      </span>
      <span class="selo" style="background:var(--aco-100);color:var(--aco-700);border:1px solid var(--aco-200);font-size:11px">
        💻 Painel Web: ${fin.resumoOrigem ? fin.resumoOrigem.qtdWeb : 0} (${brl((fin.resumoOrigem && fin.resumoOrigem.totalWeb) || 0)})
      </span>
      ${(fin.resumoOrigem && fin.resumoOrigem.qtdEstornados > 0) ? `
        <span class="selo selo-alerta" style="font-size:11px;font-weight:700">
          ⚠️ Estornos: ${fin.resumoOrigem.qtdEstornados} (${brl(fin.resumoOrigem.totalEstornados)})
        </span>
      ` : ''}
    </div>
    <div style="display:flex;gap:6px">
      <button class="btn btn-secundario btn-pequeno" onclick="S.ui.abaFin='caixa';S.ui.filtroOrigemMov='whatsapp';if(typeof render==='function')render();" style="font-size:11px;padding:3px 10px">
        📱 Ver Lançamentos WhatsApp
      </button>
      <button class="btn btn-secundario btn-pequeno" onclick="S.ui.abaFin='caixa';S.ui.filtroOrigemMov='todos';if(typeof render==='function')render();" style="font-size:11px;padding:3px 10px">
        Ver Todo o Caixa
      </button>
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
        <span class="badge-periodo-atual">Faixas de Vencimento</span>
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

if (typeof window !== 'undefined') {
  window.blocoDashboardFin = blocoDashboardFin;
}
if (typeof globalThis !== 'undefined') {
  globalThis.blocoDashboardFin = blocoDashboardFin;
}

