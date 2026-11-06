/**
 * Módulo: analista_controles.js
 * Auditoria Gerencial e Controles Internos da Verônica.
 * Arquitetura Modular Pátio-CRM (< 350 linhas).
 */

function renderCardControlesVeronica(anomalias) {
  return `
    <div class="card card-p">
      <div class="entre" style="border-bottom:1px solid var(--aco-150);padding-bottom:10px;margin-bottom:14px">
        <div>
          <div style="font-weight:700;font-size:16px;color:var(--aco-900)">
            🔍 Auditoria Gerencial & Controles Internos da Verônica
          </div>
          <div class="mini">Prevenção ativa de vazamentos de receita, detecção de OS sem financeiro e acompanhamento de inadimplência.</div>
        </div>
        <span class="selo ${anomalias.length === 0 ? 'selo-bom' : 'selo-alerta'}" style="font-size:11px">
          ${anomalias.length === 0 ? '● Controles Reconciliados' : `${anomalias.length} Alertas Ativos`}
        </span>
      </div>

      ${anomalias.length > 0 ? `
        <div style="display:flex;flex-direction:column;gap:10px">
          ${anomalias.map(a => `
            <div style="background:${a.severidade === 'critico' ? 'rgba(239,68,68,0.06)' : 'rgba(245,158,11,0.06)'};border:1px solid ${a.severidade === 'critico' ? 'rgba(239,68,68,0.3)' : 'rgba(245,158,11,0.3)'};border-radius:8px;padding:14px">
              <div class="entre" style="margin-bottom:4px">
                <b style="font-size:14px;color:${a.severidade === 'critico' ? 'var(--tijolo)' : '#b45309'}">
                  ${a.severidade === 'critico' ? '🚨' : '⚠️'} ${esc(a.titulo)}
                </b>
                <span class="selo ${a.severidade === 'critico' ? 'selo-alerta' : 'selo-aviso'}" style="font-size:10px">
                  ${a.severidade.toUpperCase()}
                </span>
              </div>
              <div style="font-size:13px;color:var(--aco-700);margin-bottom:6px">${esc(a.descricao)}</div>
              ${a.itens ? `<div class="mini" style="margin-bottom:6px;color:var(--aco-600)"><b>Itens:</b> ${a.itens.map(esc).join(' · ')}</div>` : ''}
              <div style="font-size:12.5px;color:var(--aco-800);background:#fff;padding:6px 10px;border-radius:4px;border:1px solid var(--aco-200)">
                💡 <b>Ação Recomendada:</b> ${esc(a.recomendacao)}
              </div>
            </div>
          `).join('')}
        </div>
      ` : `
        <div style="padding:20px;text-align:center;color:var(--verde);background:rgba(16,185,129,0.04);border-radius:8px">
          <div style="font-size:28px;margin-bottom:6px">🛡️</div>
          <div style="font-weight:700;font-size:14.5px">Auditoria 100% Concluída — Nenhuma Anomalia Detectada</div>
          <div class="mini" style="color:var(--aco-600)">Todas as OS finalizadas possuem lançamento financeiro e a inadimplência está sob controle.</div>
        </div>
      `}
    </div>
  `;
}

if (typeof window !== 'undefined') {
  window.renderCardControlesVeronica = renderCardControlesVeronica;
}
if (typeof globalThis !== 'undefined') {
  globalThis.renderCardControlesVeronica = renderCardControlesVeronica;
}

