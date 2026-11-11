// js/modules/torre_controle_executiva_ui.js
// Interface Visual da Torre de Controle Executiva 360º e Painel de Comando
// Teto Modular: <= 350 linhas

(function (root) {
  'use strict';

  function formatarMoeda(val) {
    const num = Number(val) || 0;
    return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  function badgeScore(score, status) {
    let cor = '#22c55e';
    let bg = '#14532d';
    let label = 'Excelência Operacional';

    if (score < 50 || status === 'intervencao_critica') {
      cor = '#ef4444';
      bg = '#7f1d1d';
      label = 'Intervenção Crítica';
    } else if (score < 70 || status === 'atencao_gerencial') {
      cor = '#f59e0b';
      bg = '#78350f';
      label = 'Atenção Gerencial';
    } else if (score < 85 || status === 'operacao_estavel') {
      cor = '#eab308';
      bg = '#713f12';
      label = 'Operação Estável';
    }

    return `
      <div style="background:${bg};border:1px solid ${cor};padding:12px 20px;border-radius:8px;text-align:center;">
        <span style="font-size:0.8rem;color:#f8fafc;text-transform:uppercase;letter-spacing:0.5px;">Score de Saúde Operacional</span>
        <div style="font-size:2.2rem;font-weight:900;color:${cor};line-height:1.1;">${score}<span style="font-size:1.1rem;color:#cbd5e1;">/100</span></div>
        <span style="font-size:0.85rem;font-weight:bold;color:${cor};">${label}</span>
      </div>
    `;
  }

  function badgeSeveridade(sev) {
    if (sev === 'critica') return '<span class="badge" style="background:#dc2626;color:#fff;padding:4px 8px;">🔴 CRÍTICA</span>';
    if (sev === 'alta') return '<span class="badge" style="background:#ea580c;color:#fff;padding:4px 8px;">🟠 ALTA</span>';
    return '<span class="badge" style="background:#ca8a04;color:#fff;padding:4px 8px;">🟡 MÉDIA</span>';
  }

  function renderPainelTorreControleExecutivaHtml(dados = {}) {
    const score = Number(dados.scoreSaudeOperacional ?? 100);
    const status = dados.statusSaudeGeral || 'excelencia_operacional';
    const comp = dados.competencia || '';
    const patio = dados.pilarPatioQualidade || {};
    const com = dados.pilarComercialB2B || {};
    const fin = dados.pilarFinanceiroDre || {};
    const pred = dados.pilarPreditivaFiscal || {};
    const alertas = Array.isArray(dados.alertasCriticos) ? dados.alertasCriticos : [];
    const resumo = dados.resumoContadoresAlertas || { critica: 0, alta: 0, media: 0, total: 0 };

    return `
      <div class="card p-3" style="background:var(--bg-card,#1e293b);border-radius:8px;border:1px solid #334155;color:#f8fafc;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:10px;">
          <div>
            <h4 style="margin:0;font-size:1.2rem;color:#38bdf8;">
              <i class="fas fa-satellite-dish"></i> Torre de Controle Executiva 360º
            </h4>
            <small style="color:#94a3b8;">Centro Integrado de Comando da Linha Pesada — Competência ${comp}</small>
          </div>
          <div style="display:flex;gap:8px;">
            <button class="btn btn-sm btn-outline-info" data-act="atualizar-torre-controle">
              <i class="fas fa-sync-alt"></i> Atualizar
            </button>
            <button class="btn btn-sm btn-success" data-act="abrir-modal-briefing-executivo">
              <i class="fab fa-whatsapp"></i> Disparar Briefing WhatsApp
            </button>
          </div>
        </div>

        <!-- Linha Superior: Velocímetro/Score e Resumo de Alertas -->
        <div style="display:grid;grid-template-columns:300px 1fr;gap:16px;margin-bottom:16px;">
          ${badgeScore(score, status)}
          <div style="background:#0f172a;padding:12px;border-radius:8px;border:1px solid #334155;display:flex;flex-direction:column;justify-content:space-between;">
            <span style="font-size:0.85rem;color:#94a3b8;font-weight:bold;">Status dos Alertas de Comando Ativos:</span>
            <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;text-align:center;">
              <div style="background:#1e293b;padding:8px;border-radius:6px;border-top:3px solid #dc2626;">
                <span style="font-size:0.75rem;color:#fca5a5;">Críticas</span>
                <div style="font-size:1.4rem;font-weight:bold;color:#ef4444;">${resumo.critica || 0}</div>
              </div>
              <div style="background:#1e293b;padding:8px;border-radius:6px;border-top:3px solid #ea580c;">
                <span style="font-size:0.75rem;color:#fdba74;">Altas</span>
                <div style="font-size:1.4rem;font-weight:bold;color:#f97316;">${resumo.alta || 0}</div>
              </div>
              <div style="background:#1e293b;padding:8px;border-radius:6px;border-top:3px solid #ca8a04;">
                <span style="font-size:0.75rem;color:#fef08a;">Médias</span>
                <div style="font-size:1.4rem;font-weight:bold;color:#eab308;">${resumo.media || 0}</div>
              </div>
              <div style="background:#1e293b;padding:8px;border-radius:6px;border-top:3px solid #38bdf8;">
                <span style="font-size:0.75rem;color:#bae6fd;">Total Alertas</span>
                <div style="font-size:1.4rem;font-weight:bold;color:#38bdf8;">${resumo.total || 0}</div>
              </div>
            </div>
          </div>
        </div>

        <!-- 4 Quadrantes Executivos -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px;">
          <!-- Quadrante 1: Pátio & Boxes -->
          <div style="background:#0f172a;padding:12px;border-radius:8px;border:1px solid #334155;">
            <h5 style="margin:0 0 10px 0;font-size:0.95rem;color:#38bdf8;"><i class="fas fa-warehouse"></i> 1. Pátio & Qualidade</h5>
            <div style="font-size:0.85rem;line-height:1.6;color:#cbd5e1;">
              <div>• <strong>Ocupação:</strong> ${patio.taxaOcupacaoPercentual || 0}% (${patio.boxesOcupadosProdutivos || 0}/${patio.totalBoxes || 0} boxes)</div>
              <div>• <strong>Gargalos Ativos:</strong> ${patio.boxesBloqueadosGargalo || 0} (${patio.gargalosEstouradosCount || 0} SLA estourado)</div>
              <div>• <strong>Retrabalhos no Mês:</strong> ${patio.totalRetrabalhosCompetencia || 0}</div>
              <div>• <strong>Eficiência da Equipe:</strong> ${patio.eficienciaMediaEquipePercentual || 100}%</div>
            </div>
          </div>

          <!-- Quadrante 2: Comercial B2B -->
          <div style="background:#0f172a;padding:12px;border-radius:8px;border:1px solid #334155;">
            <h5 style="margin:0 0 10px 0;font-size:0.95rem;color:#a855f7;"><i class="fas fa-briefcase"></i> 2. Comercial B2B</h5>
            <div style="font-size:0.85rem;line-height:1.6;color:#cbd5e1;">
              <div>• <strong>Links Pendentes Frotista:</strong> ${com.linksAprovacaoPendentesCount || 0}</div>
              <div>• <strong>Demandas Vencidas:</strong> ${com.demandasReprimidasVencidasCount || 0} (Hoje: ${com.demandasReprimidasHojeCount || 0})</div>
              <div>• <strong>Potencial Reprimido:</strong> ${formatarMoeda(com.valorTotalDemandaReprimida || 0)}</div>
              <div>• <strong>Compras Aguardando NF:</strong> ${com.pedidosCompraAguardandoNFCount || 0}</div>
            </div>
          </div>

          <!-- Quadrante 3: Financeiro & DRE -->
          <div style="background:#0f172a;padding:12px;border-radius:8px;border:1px solid #334155;">
            <h5 style="margin:0 0 10px 0;font-size:0.95rem;color:#22c55e;"><i class="fas fa-chart-line"></i> 3. Financeiro & DRE</h5>
            <div style="font-size:0.85rem;line-height:1.6;color:#cbd5e1;">
              <div>• <strong>Receita (Comp / Caixa):</strong> ${formatarMoeda(fin.receitaCompetencia || 0)} / ${formatarMoeda(fin.receitaCaixa || 0)}</div>
              <div>• <strong>Lucro Líquido Comp:</strong> ${formatarMoeda(fin.lucroLiquidoCompetencia || 0)}</div>
              <div>• <strong>Ponto de Equilíbrio:</strong> ${fin.percentualAtingimentoPE || 0}% (${(fin.statusEquilibrio || '').replace(/_/g, ' ')})</div>
              <div>• <strong>Inadimplência B2B:</strong> ${fin.frotasInadimplentesCount || 0} frotas (${formatarMoeda(fin.valorTotalVencidoB2B || 0)})</div>
            </div>
          </div>

          <!-- Quadrante 4: Preditiva & Fiscal -->
          <div style="background:#0f172a;padding:12px;border-radius:8px;border:1px solid #334155;">
            <h5 style="margin:0 0 10px 0;font-size:0.95rem;color:#f59e0b;"><i class="fas fa-shield-alt"></i> 4. Preditiva & Fiscal</h5>
            <div style="font-size:0.85rem;line-height:1.6;color:#cbd5e1;">
              <div>• <strong>Preventivas Vencidas:</strong> ${pred.preventivasVencidasCount || 0} (Críticas: ${pred.preventivasCriticasCount || 0})</div>
              <div>• <strong>Receita Preventiva Potencial:</strong> ${formatarMoeda(pred.receitaPreventivaPotencialTotal || 0)}</div>
              <div>• <strong>NF-e Peças / NFS-e Serviços:</strong> ${formatarMoeda(pred.totalNFePecasMes || 0)} / ${formatarMoeda(pred.totalNFSeServicosMes || 0)}</div>
              <div>• <strong>Líquido Faturado Fiscal:</strong> ${formatarMoeda(pred.totalLiquidoFaturadoFiscal || 0)}</div>
            </div>
          </div>
        </div>

        <!-- Tabela de Alertas de Comando -->
        <h5 style="margin:0 0 8px 0;font-size:0.95rem;color:#f8fafc;"><i class="fas fa-exclamation-triangle"></i> Central de Alertas Críticos de Comando</h5>
        <div class="table-responsive" style="max-height:260px;overflow-y:auto;">
          <table class="table table-dark table-hover table-sm" style="margin:0;font-size:0.85rem;">
            <thead>
              <tr style="background:#0f172a;color:#94a3b8;">
                <th>Severidade</th>
                <th>Categoria</th>
                <th>Alerta</th>
                <th>Descrição</th>
                <th>Ação Recomendada</th>
              </tr>
            </thead>
            <tbody>
              ${alertas.length === 0 ? '<tr><td colspan="5" class="text-center text-muted p-2">Nenhum alerta crítico ativo. Operação sob controle!</td></tr>' :
                alertas.map(a => `
                  <tr>
                    <td>${badgeSeveridade(a.severidade)}</td>
                    <td><span class="badge" style="background:#334155;color:#cbd5e1;">${(a.categoria || '').toUpperCase()}</span></td>
                    <td><strong>${a.titulo}</strong></td>
                    <td>${a.descricao}</td>
                    <td style="color:#38bdf8;">${a.acaoRecomendada}</td>
                  </tr>
                `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  function modalDispararBriefingExecutivoHtml(dados = {}) {
    const comp = dados.competencia || new Date().toISOString().slice(0, 7);
    return `
      <div style="background:#1e293b;padding:20px;border-radius:8px;color:#f8fafc;max-width:500px;margin:auto;">
        <h4 style="margin-top:0;margin-bottom:16px;color:#22c55e;font-size:1.15rem;">
          <i class="fab fa-whatsapp"></i> Disparar Briefing Executivo no WhatsApp
        </h4>

        <div class="form-group mb-2">
          <label style="font-size:0.85rem;color:#94a3b8;">Turno do Briefing:</label>
          <select id="briefing-turno" class="form-control form-control-sm" style="background:#0f172a;color:#fff;border-color:#334155;">
            <option value="matinal" selected>Matinal (Abertura do Pátio)</option>
            <option value="fechamento_diario">Fechamento de Turno Diário</option>
            <option value="fechamento_mensal">Fechamento Mensal / Diretoria</option>
          </select>
        </div>

        <div class="form-group mb-3">
          <label style="font-size:0.85rem;color:#94a3b8;">Competência:</label>
          <input type="text" id="briefing-competencia" class="form-control form-control-sm" value="${comp}" style="background:#0f172a;color:#fff;border-color:#334155;">
        </div>

        <div style="background:#0f172a;padding:10px;border-radius:6px;border:1px solid #334155;margin-bottom:16px;">
          <small style="color:#94a3b8;">O briefing será enviado para o canal oficial de WhatsApp da diretoria com Score de Saúde (${dados.scoreSaudeOperacional || 100}/100), KPIs dos 4 pilares e Top Alertas Críticos.</small>
        </div>

        <div style="display:flex;justify-content:flex-end;gap:8px;">
          <button class="btn btn-sm btn-secondary" data-act="fechar-modal-torre">Cancelar</button>
          <button class="btn btn-sm btn-success" data-act="confirmar-disparo-briefing-whatsapp">
            <i class="fas fa-paper-plane"></i> Confirmar e Disparar
          </button>
        </div>
      </div>
    `;
  }

  root.renderPainelTorreControleExecutivaHtml = renderPainelTorreControleExecutivaHtml;
  root.modalDispararBriefingExecutivoHtml = modalDispararBriefingExecutivoHtml;

})(typeof window !== 'undefined' ? window : globalThis);
