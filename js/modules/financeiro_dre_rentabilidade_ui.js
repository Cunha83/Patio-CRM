// js/modules/financeiro_dre_rentabilidade_ui.js
// Interface Visual do DRE Gerencial Dual, Ponto de Equilíbrio e Rentabilidade
// Teto Modular: <= 350 linhas

(function (root) {
  'use strict';

  function formatarMoeda(val) {
    const num = Number(val) || 0;
    return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  function formatarPercentual(val) {
    const num = Number(val) || 0;
    return `${num.toFixed(1)}%`;
  }

  function renderBadgeStatusPE(status) {
    const map = {
      superavit_acima_meta: '<span class="badge" style="background:#22c55e;color:#fff;">🟢 Superávit (Meta Atingida)</span>',
      superavit_operacional: '<span class="badge" style="background:#10b981;color:#fff;">🟢 Superávit Operacional</span>',
      zona_atencao: '<span class="badge" style="background:#f59e0b;color:#000;">🟡 Zona de Atenção</span>',
      deficit_abaixo_pe: '<span class="badge" style="background:#ef4444;color:#fff;">🔴 Déficit Operacional</span>'
    };
    return map[status] || `<span class="badge">${status || 'N/A'}</span>`;
  }

  function renderPainelDreERentabilidadeHtml(dados = {}) {
    const dre = dados.dre || {};
    const comp = dre.regimeCompetencia || {};
    const caixa = dre.regimeCaixa || {};
    const gap = dre.diferencaCompetenciaVsCaixa || {};
    const pe = dados.pontoEquilibrio || {};
    const frotas = Array.isArray(dados.rankingFrotas) ? dados.rankingFrotas : [];
    const boxes = Array.isArray(dados.rankingBoxes) ? dados.rankingBoxes : [];

    return `
      <div class="card p-3" style="background:var(--bg-card,#1e293b);border-radius:8px;border:1px solid #334155;color:#f8fafc;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
          <div>
            <h4 style="margin:0;font-size:1.15rem;color:#38bdf8;">
              <i class="fas fa-chart-line"></i> DRE Gerencial Dual & Ponto de Equilíbrio
            </h4>
            <small style="color:#94a3b8;">Competência: <strong>${dre.competencia || 'Mês Atual'}</strong> | Regime de Competência vs. Regime de Caixa</small>
          </div>
          <div style="display:flex;gap:8px;">
            <button class="btn btn-sm btn-outline-info" data-act="abrir-simulador-ponto-equilibrio">
              <i class="fas fa-balance-scale"></i> Simulador Break-Even
            </button>
            <button class="btn btn-sm btn-outline-success" data-act="enviar-briefing-dre-whatsapp">
              <i class="fab fa-whatsapp"></i> Briefing WhatsApp
            </button>
            <button class="btn btn-sm btn-primary" data-act="atualizar-dre-gerencial">
              <i class="fas fa-sync-alt"></i> Atualizar
            </button>
          </div>
        </div>

        <!-- Card Ponto de Equilíbrio -->
        <div style="background:#0f172a;border-radius:8px;padding:14px;border:1px solid #334155;margin-bottom:16px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
            <span style="font-weight:600;color:#cbd5e1;"><i class="fas fa-bullseye" style="color:#f59e0b;"></i> Ponto de Equilíbrio (Break-Even):</span>
            ${renderBadgeStatusPE(pe.statusEquilibrio)}
          </div>
          <div style="display:grid;grid-template-columns:repeat(4, 1fr);gap:12px;font-size:0.85rem;">
            <div>
              <span style="color:#94a3b8;">PE Contábil:</span>
              <div style="font-size:1.1rem;font-weight:bold;color:#38bdf8;">${formatarMoeda(pe.pontoEquilibrioContabil)}</div>
            </div>
            <div>
              <span style="color:#94a3b8;">PE Econômico (Meta):</span>
              <div style="font-size:1.1rem;font-weight:bold;color:#a855f7;">${formatarMoeda(pe.pontoEquilibrioEconomico)}</div>
            </div>
            <div>
              <span style="color:#94a3b8;">Atingimento do PE:</span>
              <div style="font-size:1.1rem;font-weight:bold;color:#22c55e;">${formatarPercentual(pe.percentualAtingimentoPE)}</div>
            </div>
            <div>
              <span style="color:#94a3b8;">Índice Margem Contr.:</span>
              <div style="font-size:1.1rem;font-weight:bold;color:#eab308;">${formatarPercentual(pe.indiceMargemContribuicaoPercentual)}</div>
            </div>
          </div>
        </div>

        <!-- Tabela DRE Comparativa Dual -->
        <div style="margin-bottom:20px;">
          <h5 style="margin:0 0 8px 0;font-size:0.95rem;color:#cbd5e1;">Comparativo de Regimes Contábil x Caixa:</h5>
          <div class="table-responsive">
            <table class="table table-dark table-sm table-bordered" style="margin:0;font-size:0.85rem;">
              <thead>
                <tr style="background:#0f172a;color:#94a3b8;">
                  <th>Indicador Gerencial</th>
                  <th style="text-align:right;">Regime Competência (Faturado)</th>
                  <th style="text-align:right;">Regime Caixa (Realizado)</th>
                  <th style="text-align:right;">Gap Financeiro</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><strong>(+) Receita Bruta Total</strong></td>
                  <td style="text-align:right;"><strong>${formatarMoeda(comp.receitaBrutaTotal)}</strong></td>
                  <td style="text-align:right;"><strong>${formatarMoeda(caixa.receitaBrutaTotal)}</strong></td>
                  <td style="text-align:right;color:#eab308;">${formatarMoeda(gap.gapReceita)}</td>
                </tr>
                <tr>
                  <td style="padding-left:20px;">• Serviços Prestados</td>
                  <td style="text-align:right;">${formatarMoeda(comp.receitaBrutaServicos)}</td>
                  <td style="text-align:right;">-</td>
                  <td style="text-align:right;">-</td>
                </tr>
                <tr>
                  <td style="padding-left:20px;">• Peças e Componentes</td>
                  <td style="text-align:right;">${formatarMoeda(comp.receitaBrutaPecas)}</td>
                  <td style="text-align:right;">-</td>
                  <td style="text-align:right;">-</td>
                </tr>
                <tr>
                  <td>(-) Impostos Deduzidos</td>
                  <td style="text-align:right;color:#ef4444;">${formatarMoeda(comp.impostosDeduzidos)}</td>
                  <td style="text-align:right;color:#ef4444;">${formatarMoeda(caixa.impostosDeduzidos)}</td>
                  <td style="text-align:right;">-</td>
                </tr>
                <tr style="background:#1e293b;">
                  <td><strong>(=) Receita Líquida</strong></td>
                  <td style="text-align:right;"><strong>${formatarMoeda(comp.receitaLiquida)}</strong></td>
                  <td style="text-align:right;"><strong>${formatarMoeda(caixa.receitaLiquida)}</strong></td>
                  <td style="text-align:right;">-</td>
                </tr>
                <tr>
                  <td>(-) CMV Peças (Custo Médio CMP)</td>
                  <td style="text-align:right;color:#ef4444;">${formatarMoeda(comp.cmvPecasCMP)}</td>
                  <td style="text-align:right;color:#ef4444;">${formatarMoeda(caixa.cmvPecasCMP)}</td>
                  <td style="text-align:right;">-</td>
                </tr>
                <tr>
                  <td>(-) Comissões Técnicas</td>
                  <td style="text-align:right;color:#ef4444;">${formatarMoeda(comp.custoComissoesTecnicas)}</td>
                  <td style="text-align:right;color:#ef4444;">${formatarMoeda(caixa.custoComissoesTecnicas)}</td>
                  <td style="text-align:right;">-</td>
                </tr>
                <tr style="background:#1e293b;">
                  <td><strong>(=) Margem de Contribuição</strong></td>
                  <td style="text-align:right;color:#38bdf8;"><strong>${formatarMoeda(comp.margemContribuicaoValor)} (${formatarPercentual(comp.indiceMargemContribuicaoPercentual)})</strong></td>
                  <td style="text-align:right;">-</td>
                  <td style="text-align:right;">-</td>
                </tr>
                <tr>
                  <td>(-) Despesas Fixas Operacionais</td>
                  <td style="text-align:right;color:#ef4444;">${formatarMoeda(comp.despesasFixasOperacionais)}</td>
                  <td style="text-align:right;color:#ef4444;">${formatarMoeda(caixa.despesasFixasOperacionais)}</td>
                  <td style="text-align:right;">-</td>
                </tr>
                <tr style="background:#0f172a;font-size:0.9rem;">
                  <td><strong>(=) Lucro Líquido Operacional</strong></td>
                  <td style="text-align:right;color:#22c55e;"><strong>${formatarMoeda(comp.lucroLiquidoOperacional)} (${formatarPercentual(comp.margemLiquidaPercentual)})</strong></td>
                  <td style="text-align:right;color:#22c55e;"><strong>${formatarMoeda(caixa.lucroLiquidoCaixa)}</strong></td>
                  <td style="text-align:right;color:#38bdf8;"><strong>${formatarMoeda(gap.gapLucro)}</strong></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Duas Colunas: Ranking Frotas e Ranking Boxes -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
          <div>
            <h5 style="margin:0 0 8px 0;font-size:0.9rem;color:#38bdf8;"><i class="fas fa-truck"></i> Rentabilidade por Frota B2B:</h5>
            <div style="max-height:220px;overflow-y:auto;border:1px solid #334155;border-radius:6px;">
              <table class="table table-dark table-sm" style="margin:0;font-size:0.8rem;">
                <thead>
                  <tr style="color:#94a3b8;">
                    <th>Frota / Cliente</th>
                    <th style="text-align:right;">Receita</th>
                    <th style="text-align:right;">CMP</th>
                    <th style="text-align:right;">Retrabalho</th>
                    <th style="text-align:right;">Lucro Bruto</th>
                  </tr>
                </thead>
                <tbody>
                  ${frotas.length === 0 ? '<tr><td colspan="5" style="text-align:center;color:#64748b;">Nenhuma frota no período</td></tr>' : frotas.map(f => `
                    <tr>
                      <td><strong>${f.clienteNome}</strong> (${f.quantidadeOS} OS)</td>
                      <td style="text-align:right;">${formatarMoeda(f.receitaTotal)}</td>
                      <td style="text-align:right;color:#ef4444;">${formatarMoeda(f.custoPecasCMP)}</td>
                      <td style="text-align:right;color:#eab308;">${formatarMoeda(f.custoRetrabalhoGarantia)}</td>
                      <td style="text-align:right;color:#22c55e;"><strong>${formatarMoeda(f.lucroBrutoFrota)}</strong></td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <h5 style="margin:0 0 8px 0;font-size:0.9rem;color:#38bdf8;"><i class="fas fa-warehouse"></i> Rentabilidade por Box Pesado:</h5>
            <div style="max-height:220px;overflow-y:auto;border:1px solid #334155;border-radius:6px;">
              <table class="table table-dark table-sm" style="margin:0;font-size:0.8rem;">
                <thead>
                  <tr style="color:#94a3b8;">
                    <th>Box</th>
                    <th style="text-align:right;">OSs</th>
                    <th style="text-align:right;">Receita</th>
                    <th style="text-align:right;">Ticket Médio</th>
                    <th style="text-align:right;">Lucro Bruto</th>
                  </tr>
                </thead>
                <tbody>
                  ${boxes.length === 0 ? '<tr><td colspan="5" style="text-align:center;color:#64748b;">Nenhum box no período</td></tr>' : boxes.map(b => `
                    <tr>
                      <td><strong>${b.boxId}</strong></td>
                      <td style="text-align:right;">${b.quantidadeOS}</td>
                      <td style="text-align:right;">${formatarMoeda(b.receitaGeradaBox)}</td>
                      <td style="text-align:right;">${formatarMoeda(b.ticketMedioBox)}</td>
                      <td style="text-align:right;color:#22c55e;"><strong>${formatarMoeda(b.lucroBrutoBox)}</strong></td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function modalSimuladorMetaPontoEquilibrioHtml(dados = {}) {
    const comp = dados.competencia || '';
    const pe = dados.pontoEquilibrio || {};
    const despFixas = Number(pe.despesasFixasOperacionais || 0);
    const imc = Number(pe.indiceMargemContribuicaoPercentual || 0);

    return `
      <div class="modal-dialog-b2b" style="max-width:440px;background:#1e293b;border-radius:10px;padding:20px;color:#f8fafc;box-shadow:0 10px 25px rgba(0,0,0,0.6);border:1px solid #334155;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
          <h4 style="margin:0;font-size:1.1rem;color:#38bdf8;">
            <i class="fas fa-balance-scale"></i> Simulador de Break-Even & Meta
          </h4>
          <button type="button" class="btn-close-modal" data-act="fechar-modal-simulador-pe" style="background:none;border:none;color:#94a3b8;font-size:1.2rem;cursor:pointer;">&times;</button>
        </div>

        <div style="background:#0f172a;padding:12px;border-radius:6px;margin-bottom:14px;border:1px solid #334155;font-size:0.85rem;">
          <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
            <span style="color:#94a3b8;">Despesas Fixas do Mês:</span>
            <strong>${formatarMoeda(despFixas)}</strong>
          </div>
          <div style="display:flex;justify-content:space-between;">
            <span style="color:#94a3b8;">Índice Margem Contribuição:</span>
            <strong style="color:#eab308;">${formatarPercentual(imc)}</strong>
          </div>
        </div>

        <input type="hidden" id="simulador-competencia" value="${comp}">

        <div class="form-group" style="margin-bottom:16px;">
          <label style="font-size:0.85rem;color:#cbd5e1;">Meta de Lucro Líquido Desejado (R$):</label>
          <input type="number" id="simulador-meta-lucro" class="form-control form-control-sm" placeholder="Ex: 5000" value="${pe.metaLucroDesejado || 0}" style="background:#0f172a;color:#fff;border:1px solid #475569;">
        </div>

        <div style="display:flex;justify-content:flex-end;gap:8px;">
          <button class="btn btn-sm btn-secondary" data-act="fechar-modal-simulador-pe">Fechar</button>
          <button class="btn btn-sm btn-primary" data-act="confirmar-simulacao-ponto-equilibrio">
            <i class="fas fa-calculator"></i> Calcular Break-Even
          </button>
        </div>
      </div>
    `;
  }

  root.formatarMoedaB2B = root.formatarMoedaB2B || formatarMoeda;
  root.renderPainelDreERentabilidadeHtml = renderPainelDreERentabilidadeHtml;
  root.modalSimuladorMetaPontoEquilibrioHtml = modalSimuladorMetaPontoEquilibrioHtml;

})(typeof window !== 'undefined' ? window : globalThis);

