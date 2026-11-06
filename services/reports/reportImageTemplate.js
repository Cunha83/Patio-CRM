'use strict';

const financialEngine = require('../financialEngine');

function gerarHTMLPainelIndicadores(state, options = {}) {
  const agoraSP = financialEngine.obterAgoraSP(options.dataRef);
  const dHoje = agoraSP.dataISO;
  const dataFormatada = agoraSP.dataBR;
  const horaFormatada = agoraSP.horaBR;

  const cfg = state.cfg || {};
  const fin = financialEngine.calcularKPIsFinanceiros(state, { ...options, dataRef: dHoje, filtro: '30d' });
  const series = financialEngine.gerarSeriesGraficos(state, { ...options, dataRef: dHoje, filtro: '15d' });
  const op = financialEngine.calcularResumoOperacional(state, { ...options, dataRef: dHoje });

  const svgFluxo = financialEngine.gerarSVGBarrasFluxo(series.grafico1Fluxo, 990, 200);
  const svgProjecao = financialEngine.gerarSVGProjecao(series.grafico4Projecao, 990, 180);

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
  body { background: #070b14; color: #f8fafc; width: 1080px; height: 1350px; overflow: hidden; padding: 38px 44px; display: flex; flex-direction: column; justify-content: space-between; }
  .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #1e293b; padding-bottom: 18px; }
  .brand-title { font-size: 34px; font-weight: 900; color: #38bdf8; letter-spacing: -0.8px; display: flex; align-items: center; gap: 10px; }
  .brand-sub { font-size: 13px; color: #94a3b8; font-weight: 600; letter-spacing: 0.5px; margin-top: 4px; }
  .header-badge { background: #111827; border: 1px solid #334155; padding: 8px 16px; border-radius: 12px; text-align: right; }
  .header-empresa { font-size: 14px; font-weight: 800; color: #f1f5f9; }
  .header-data { font-size: 12px; color: #38bdf8; font-weight: 600; margin-top: 2px; }
  .hero-card { background: linear-gradient(135deg, #0f172a 0%, #131c2e 100%); border: 1.5px solid #2563eb; border-radius: 16px; padding: 22px 28px; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5); display: flex; justify-content: space-between; align-items: center; position: relative; overflow: hidden; }
  .hero-card::after {
    content: '';
    position: absolute;
    top: 0; right: 0; width: 140px; height: 100%;
    background: radial-gradient(circle, rgba(37, 99, 235, 0.25) 0%, transparent 70%);
  }
  .hero-label { font-size: 13px; text-transform: uppercase; font-weight: 800; letter-spacing: 1px; color: #94a3b8; margin-bottom: 4px; }
  .hero-val { font-size: 42px; font-weight: 900; color: #38bdf8; letter-spacing: -1px; }
  .hero-sub { font-size: 13px; color: #64748b; margin-top: 4px; }
  .hero-metrics { display: flex; gap: 20px; z-index: 1; }
  .hero-stat { text-align: right; background: rgba(15, 23, 42, 0.6); border: 1px solid #1e293b; padding: 10px 16px; border-radius: 10px; }
  .hero-stat-label { font-size: 11px; font-weight: 700; color: #94a3b8; text-transform: uppercase; }
  .hero-stat-val { font-size: 18px; font-weight: 800; margin-top: 2px; }
  .grid-kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; }
  .kpi-card { background: #0f172a; border: 1px solid #1e293b; border-radius: 12px; padding: 14px 16px; position: relative; }
  .kpi-title { font-size: 11px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px; }
  .kpi-val { font-size: 22px; font-weight: 800; letter-spacing: -0.5px; }
  .kpi-sub { font-size: 11px; color: #64748b; margin-top: 4px; }
  .section-chart { background: #0f172a; border: 1px solid #1e293b; border-radius: 14px; padding: 18px 22px; }
  .section-title { font-size: 14px; font-weight: 800; color: #f1f5f9; letter-spacing: 0.5px; margin-bottom: 14px; display: flex; justify-content: space-between; align-items: center; }
  .section-badge { font-size: 11px; font-weight: 600; background: #1e293b; color: #94a3b8; padding: 3px 8px; border-radius: 6px; }
  .radar-bar { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; background: #0b1120; border: 1px solid #1e293b; border-radius: 12px; padding: 12px 18px; }
  .radar-box { display: flex; align-items: center; gap: 10px; }
  .radar-icon { font-size: 24px; }
  .radar-info-title { font-size: 11px; font-weight: 700; color: #94a3b8; text-transform: uppercase; }
  .radar-info-val { font-size: 16px; font-weight: 800; color: #f8fafc; }
  .footer { border-top: 1px solid #1e293b; padding-top: 12px; display: flex; justify-content: space-between; font-size: 11px; color: #64748b; font-weight: 500; }
</style>
</head>
<body>
  <div class="header">
    <div>
      <div class="brand-title">🚛 PÁTIO CRM</div>
      <div class="brand-sub">PAINEL DIÁRIO DE INDICADORES & PERFORMANCE</div>
    </div>
    <div class="header-badge">
      <div class="header-empresa">${cfg.empresa || 'Oficina Mecânica Pesada'}</div>
      <div class="header-data">${dataFormatada} • ${horaFormatada}</div>
    </div>
  </div>

  <div class="hero-card">
    <div>
      <div class="hero-label">Saldo Líquido em Caixa</div>
      <div class="hero-val">${fin.saldoAtualFormatado}</div>
      <div class="hero-sub">Posição consolidada das contas ativas hoje</div>
    </div>
    <div class="hero-metrics">
      <div class="hero-stat">
        <div class="hero-stat-label">A Receber (30d)</div>
        <div class="hero-stat-val" style="color:#10b981">${fin.aReceberTotalFormatado}</div>
      </div>
      <div class="hero-stat">
        <div class="hero-stat-label">A Pagar (30d)</div>
        <div class="hero-stat-val" style="color:#ef4444">${fin.aPagarTotalFormatado}</div>
      </div>
    </div>
  </div>

  <div class="grid-kpis">
    <div class="kpi-card" style="border-left:4px solid #10b981">
      <div class="kpi-title">Receita do Mês</div>
      <div class="kpi-val" style="color:#10b981">${fin.receitaTotalFormatado}</div>
      <div class="kpi-sub">Faturamento realizado</div>
    </div>
    <div class="kpi-card" style="border-left:4px solid #38bdf8">
      <div class="kpi-title">Resultado Líquido</div>
      <div class="kpi-val" style="color:${fin.resultadoLiquido >= 0 ? '#38bdf8' : '#ef4444'}">${fin.resultadoLiquidoFormatado}</div>
      <div class="kpi-sub">Margem estimada de 30d</div>
    </div>
    <div class="kpi-card" style="border-left:4px solid #f59e0b">
      <div class="kpi-title">Ticket Médio</div>
      <div class="kpi-val" style="color:#f59e0b">${fin.ticketMedioFormatado}</div>
      <div class="kpi-sub">Por caminhão finalizado</div>
    </div>
    <div class="kpi-card" style="border-left:4px solid #818cf8">
      <div class="kpi-title">Veículos no Pátio</div>
      <div class="kpi-val" style="color:#818cf8">${op.veiculosNoPatio}</div>
      <div class="kpi-sub">${op.boxesOcupados} boxes em execução</div>
    </div>
  </div>

  <div class="section-chart">
    <div class="section-title">
      <span>📊 FLUXO DE CAIXA: REALIZADO & PREVISTO (15 DIAS)</span>
      <span class="section-badge">🟢 Entradas vs 🔴 Saídas</span>
    </div>
    <div style="width:100%; height:200px; display:flex; justify-content:center; align-items:center;">
      ${svgFluxo}
    </div>
  </div>

  <div class="section-chart">
    <div class="section-title">
      <span>📈 PROJEÇÃO DE LIQUIDEZ E SALDO EM CONTA</span>
      <span class="section-badge">Trajetória Futura (R$)</span>
    </div>
    <div style="width:100%; height:180px; display:flex; justify-content:center; align-items:center;">
      ${svgProjecao}
    </div>
  </div>

  <div class="radar-bar">
    <div class="radar-box">
      <span class="radar-icon">🚛</span>
      <div>
        <div class="radar-info-title">Taxa de Ocupação</div>
        <div class="radar-info-val">${op.taxaOcupacaoBoxes}% dos Boxes</div>
      </div>
    </div>
    <div class="radar-box">
      <span class="radar-icon">🔧</span>
      <div>
        <div class="radar-info-title">Boxes Ocupados</div>
        <div class="radar-info-val">${op.boxesOcupados} de ${op.totalBoxes}</div>
      </div>
    </div>
    <div class="radar-box">
      <span class="radar-icon">⏳</span>
      <div>
        <div class="radar-info-title">Fila de Triagem</div>
        <div class="radar-info-val">${op.naFila} na espera</div>
      </div>
    </div>
    <div class="radar-box">
      <span class="radar-icon">⚠️</span>
      <div>
        <div class="radar-info-title">Inadimplência</div>
        <div class="radar-info-val" style="color:${fin.taxaInadimplencia > 0 ? '#f59e0b' : '#10b981'}">${fin.taxaInadimplencia}%</div>
      </div>
    </div>
  </div>

  <div class="footer">
    <div>Pátio CRM • Módulo de Gestão Especializado para Oficinas Pesadas & Diesel</div>
    <div>Relatório Gerencial Confidencial • Emitido via Servidor WhatsApp Web</div>
  </div>
</body>
</html>`;
}

module.exports = {
  gerarHTMLPainelIndicadores
};
