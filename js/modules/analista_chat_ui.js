/* =====================================================================
   PÁTIO CRM — ANALISTA FINANCEIRA: UI DO PAINEL EXECUTIVO
   Bloco Principal da Analista Verônica e Orquestração Visual
   ===================================================================== */

function blocoVeronicaAnalista() {
  const caixaAberto = typeof obterCaixaAbertoFrontend === 'function' ? obterCaixaAbertoFrontend() : null;
  const prev = typeof calcularPrevisaoFrontend === 'function' ? calcularPrevisaoFrontend(30) : { saldoAtual: 0, marcos: { '30d': 0 }, potencialProvavel: 0, temFuro: false };
  const anomalias = typeof calcularControlesInternosFrontend === 'function' ? calcularControlesInternosFrontend() : [];
  const dre = typeof calcularDREFrontend === 'function' ? calcularDREFrontend() : { lucro: 0, recBruta: 0, despOper: 0, custoPecasAplicadasOS: 0, margem: 0, sup: 0, sang: 0, saldoTesouraria: 0, qtdRec: 0, qtdDesp: 0 };
  const movimentosCaixa = Array.isArray(S.movimentos) ? S.movimentos.slice(-8).reverse() : [];

  // Texto do Parecer para TTS
  const textoParecer = `Olá, gestor! Sou a Verônica, sua analista financeira. ` +
    `No momento temos ${typeof brl === 'function' ? brl(prev.saldoAtual) : prev.saldoAtual} em caixa disponível. ` +
    `Para os próximos 30 dias, projetamos ${typeof brl === 'function' ? brl(prev.marcos['30d']) : prev.marcos['30d']} considerando títulos, e potencial de mais ${typeof brl === 'function' ? brl(prev.potencialProvavel) : prev.potencialProvavel} das ordens em execução no pátio. ` +
    (prev.temFuro ? `Atenção: identifiquei risco de saldo abaixo da margem de segurança a partir de ${prev.dataPrimeiroFuro}. ` : `A liquidez está estável acima do caixa mínimo. `) +
    (anomalias.length > 0 ? `Identifiquei ${anomalias.length} alertas nos controles internos que requerem sua atenção.` : `Todos os controles operacionais e financeiros estão reconciliados.`);

  return `
  <div style="display:flex;flex-direction:column;gap:18px">
    
    <!-- BANNER EXECUTIVO VERÔNICA -->
    <div style="background:linear-gradient(135deg, #0f172a 0%, #1e293b 60%, #1e3a8a 100%);color:#fff;border-radius:12px;padding:22px;box-shadow:0 10px 25px -5px rgba(0,0,0,0.15);position:relative;overflow:hidden">
      <div style="position:absolute;right:-20px;bottom:-20px;font-size:120px;opacity:0.07;user-select:none">🤖</div>
      
      <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:12px;margin-bottom:14px">
        <div>
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
            <span style="background:#2563eb;color:#fff;font-size:11px;font-weight:700;padding:3px 10px;border-radius:20px;letter-spacing:0.5px">VERÔNICA AI</span>
            <span style="background:rgba(255,255,255,0.15);font-size:11px;padding:3px 8px;border-radius:20px">ANALISTA FINANCEIRA & GERENCIAL</span>
          </div>
          <h2 style="margin:0;font-size:22px;font-weight:800;letter-spacing:-0.5px">Parecer Executivo & Inteligência de Caixa</h2>
        </div>
        
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn btn-primario" onclick="falarParecerVeronica('${esc(textoParecer)}')" style="background:#2563eb;border-color:#3b82f6;font-size:13px;display:inline-flex;align-items:center;gap:6px">
            🔊 Ouvir Parecer
          </button>
          <button class="btn btn-secundario" onclick="render()" style="background:rgba(255,255,255,0.1);color:#fff;border-color:rgba(255,255,255,0.2);font-size:13px">
            🔄 Atualizar
          </button>
        </div>
      </div>

      <div style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);border-radius:8px;padding:14px 18px;font-size:13.5px;line-height:1.6;color:#e2e8f0">
        💬 <b>Diagnóstico da Verônica:</b> Saldo disponível de <b>${brl(prev.saldoAtual)}</b>. Projeção financeira líquida para 30 dias em <b>${brl(prev.marcos['30d'])}</b>, reforçada por <b>${brl(prev.potencialProvavel)}</b> de receita potencial nas OSs em atendimento na oficina.
        ${prev.temFuro ? `<div style="margin-top:6px;color:#fca5a5">⚠️ <b>Alerta de Fluxo:</b> Risco de saldo abaixo do limite de segurança (${brl(prev.caixaMinimo)}) detectado a partir de ${dataBR(prev.dataPrimeiroFuro)}. Menor saldo previsto: <b>${brl(prev.menorSaldo)}</b>.</div>` : `<div style="margin-top:6px;color:#86efac">✅ <b>Saúde Financeira:</b> Sem risco de furo projetado nos próximos 30 dias. Reserva operacional mantida.</div>`}
      </div>
    </div>

    <!-- 1. GESTÃO DE CAIXA DIÁRIO (TESOURARIA) -->
    ${typeof renderCardGestaoCaixaVeronica === 'function' ? renderCardGestaoCaixaVeronica(caixaAberto, movimentosCaixa) : ''}

    <!-- 2. FLUXO DE CAIXA & FORECAST 7/15/30 DIAS COM POTENCIAL DE PÁTIO -->
    ${typeof renderCardPrevisaoVeronica === 'function' ? renderCardPrevisaoVeronica(prev) : ''}

    <!-- 3. DRE OPERACIONAL (VISÃO GERENCIAL) -->
    ${typeof renderCardDREVeronica === 'function' ? renderCardDREVeronica(dre) : ''}

    <!-- 4. CONTROLES INTERNOS & AUDITORIA GERENCIAL -->
    ${typeof renderCardControlesVeronica === 'function' ? renderCardControlesVeronica(anomalias) : ''}

    <!-- 5. RADAR DE PENDÊNCIAS DE OS & LIBERAÇÃO FINANCEIRA DE PÁTIO -->
    ${typeof radarLiberacaoPatioHtml === 'function' ? radarLiberacaoPatioHtml() : ''}

    <!-- 6. DASHBOARD BI, PRODUTIVIDADE & COMISSÕES (Frente 10C) -->
    ${typeof dashboardBiProdutividadeHtml === 'function' ? dashboardBiProdutividadeHtml() : ''}

  </div>`;
}

if (typeof window !== 'undefined') {
  window.blocoVeronicaAnalista = blocoVeronicaAnalista;
}

