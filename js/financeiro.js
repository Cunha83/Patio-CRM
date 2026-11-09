/* =====================================================================
   PÁTIO CRM — MÓDULO FINANCEIRO (FACHADA & ORQUESTRADOR CENTRAL)
   Módulos especializados em js/modules/financeiro_*.js
===================================================================== */

function viewFinanceiro() {
  const rec = (typeof emAberto === 'function') ? emAberto('receber') : [];
  const pag = (typeof emAberto === 'function') ? emAberto('pagar') : [];
  const dH = (typeof hoje === 'function') ? hoje() : new Date().toISOString().slice(0, 10);
  const vencidasR = rec.filter(c => c.venc < dH);
  const vencidasP = pag.filter(c => c.venc < dH);
  const mes = (typeof mesRef === 'function') ? mesRef(dH) : dH.slice(0, 7);
  const movs = typeof obterMovimentosUnificados === 'function' ? obterMovimentosUnificados() : (Array.isArray(S.movimentos) ? S.movimentos : (Array.isArray(S.lancamentosCaixa) ? S.lancamentosCaixa : []));
  const fMes = (typeof mesRef === 'function') ? mesRef : (d => (d || '').slice(0, 7));
  const fSoma = (typeof soma === 'function') ? soma : ((arr, fn) => arr.reduce((acc, x) => acc + (fn(x) || 0), 0));
  const entradaMes = fSoma(movs.filter(m => (m.tipo === 'entrada' || m.tipo === 'credito') && fMes(m.data) === mes), m => m.valor);
  const saidaMes = fSoma(movs.filter(m => (m.tipo === 'saida' || m.tipo === 'debito') && fMes(m.data) === mes), m => m.valor);
  const totalRec = fSoma(rec, c => c.valor);
  const totalPag = fSoma(pag, c => c.valor);
  const abas = [
    ['dashboard', 'Painel Geral 📊'],
    ['analista', 'Verônica Analista 🤖'],
    ['receber', 'A Receber (' + rec.length + ')'],
    ['pagar', 'A Pagar (' + pag.length + ')'],
    ['caixa', 'Fluxo de Caixa'],
    ['dre', 'Resultado Gerencial de Caixa'],
    ['banco', 'Conciliação Bancária'],
    ['recebimentos', 'Cobrança Pix, Boletos & Cartão 💳'],
    ['bordero', 'Faturamento de Frotas 🚛']
  ];
  const a = S.ui?.abaFin || 'dashboard';

  let corpo = '';
  if (a === 'dashboard' && typeof blocoDashboardFin === 'function') corpo = blocoDashboardFin();
  else if (a === 'analista' && typeof blocoVeronicaAnalista === 'function') corpo = blocoVeronicaAnalista();
  else if (a === 'receber' && typeof blocoContasReceber === 'function') corpo = blocoContasReceber();
  else if (a === 'pagar' && typeof blocoContasPagar === 'function') corpo = blocoContasPagar();
  else if (a === 'caixa' && typeof blocoFluxoCaixa === 'function') corpo = blocoFluxoCaixa();
  else if (a === 'dre' && typeof blocoDRE === 'function') corpo = blocoDRE();
  else if (a === 'recebimentos' && typeof blocoHubRecebimentos === 'function') corpo = blocoHubRecebimentos();
  else if (a === 'bordero' && typeof blocoBorderoFrotas === 'function') corpo = blocoBorderoFrotas();
  else if (typeof blocoBanco === 'function') corpo = blocoBanco();

  const fnBrlCurto = (typeof brlCurto === 'function') ? brlCurto : (v => 'R$ ' + Number(v || 0).toFixed(2));
  const fnSaldo = (typeof saldoCaixa === 'function') ? saldoCaixa() : 0;
  const fnIco = (typeof ico === 'function') ? ico : (() => '');

  return `
  ${a !== 'dashboard' ? `
  <div class="kpis" style="margin-bottom:14px">
    <div class="kpi bom">
      <div class="r">${fnIco('grana', 14)} Saldo em Caixa</div>
      <div class="v">${fnBrlCurto(fnSaldo)}</div>
      <div class="d">Saldo atual consolidado</div>
    </div>
    <div class="kpi ${vencidasR.length ? 'alerta' : 'neutro'}">
      <div class="r">${fnIco('doc', 14)} Total A Receber</div>
      <div class="v">${fnBrlCurto(totalRec)}</div>
      <div class="d">${rec.length} títulos${vencidasR.length ? ' · <b style="color:var(--tijolo)">' + vencidasR.length + ' vencidos</b>' : ''}</div>
    </div>
    <div class="kpi ${vencidasP.length ? 'alerta' : 'aviso'}">
      <div class="r">${fnIco('caixa', 14)} Total A Pagar</div>
      <div class="v">${fnBrlCurto(totalPag)}</div>
      <div class="d">${pag.length} contas${vencidasP.length ? ' · <b style="color:var(--tijolo)">' + vencidasP.length + ' vencidas</b>' : ''}</div>
    </div>
    <div class="kpi ${entradaMes - saidaMes >= 0 ? 'bom' : 'alerta'}">
      <div class="r">${fnIco('relatorios', 14)} Resultado do Mês</div>
      <div class="v">${fnBrlCurto(entradaMes - saidaMes)}</div>
      <div class="d">Entradas: ${fnBrlCurto(entradaMes)} | Saídas: ${fnBrlCurto(saidaMes)}</div>
    </div>
  </div>` : ''}

  <div class="abas" style="margin-bottom:14px">
    ${abas.map(([k, r]) => `<button data-act="aba-fin" data-k="${k}" aria-selected="${a === k}">${r}</button>`).join('')}
  </div>

  ${corpo}`;
}

function renderOptionsPlanoDeContas(selecionado, tipoSugerido = null) {
  const lista = (typeof normalizarPlanoDeContas === 'function')
    ? normalizarPlanoDeContas(S.cfg?.planoDeContas)
    : (S.cfg?.planoDeContas || []);

  if (!lista.length) return '<option value="Outros">Outros</option>';

  const fnEsc = (typeof esc === 'function') ? esc : (x => String(x || ''));

  if (typeof lista[0] === 'string') {
    return lista.map(x => `<option value="${fnEsc(x)}" ${selecionado === x ? 'selected' : ''}>${fnEsc(x)}</option>`).join('');
  }

  const baseLista = (tipoSugerido && lista.some(c => c.tipo === tipoSugerido))
    ? lista.filter(c => c.tipo === tipoSugerido || c.nome === selecionado)
    : lista;
  const sinteticas = baseLista.filter(c => c.classe === 'sintetica');
  const analiticas = baseLista.filter(c => c.classe === 'analitica' && (c.ativo !== false || c.nome === selecionado));

  let html = '';

  if (sinteticas.length) {
    sinteticas.forEach(s => {
      const filhas = analiticas.filter(a => a.paiId === s.id || (a.codigo && s.codigo && a.codigo.startsWith(s.codigo + '.')));
      if (filhas.length) {
        html += `<optgroup label="${fnEsc(s.codigo)} - ${fnEsc(s.nome)}">`;
        filhas.forEach(f => {
          const sel = (selecionado === f.nome || selecionado === f.id) ? 'selected' : '';
          html += `<option value="${fnEsc(f.nome)}" data-id="${fnEsc(f.id)}" ${sel}>${fnEsc(f.codigo)} - ${fnEsc(f.nome)}</option>`;
        });
        html += '</optgroup>';
      }
    });

    const filhasSemPai = analiticas.filter(a => !sinteticas.some(s => a.paiId === s.id || (a.codigo && s.codigo && a.codigo.startsWith(s.codigo + '.'))));
    if (filhasSemPai.length) {
      html += '<optgroup label="Outras Contas">';
      filhasSemPai.forEach(f => {
        const sel = (selecionado === f.nome || selecionado === f.id) ? 'selected' : '';
        html += `<option value="${fnEsc(f.nome)}" data-id="${fnEsc(f.id)}" ${sel}>${fnEsc(f.codigo)} - ${fnEsc(f.nome)}</option>`;
      });
      html += '</optgroup>';
    }
  } else {
    analiticas.forEach(f => {
      const sel = (selecionado === f.nome || selecionado === f.id) ? 'selected' : '';
      html += `<option value="${fnEsc(f.nome)}" data-id="${fnEsc(f.id)}" ${sel}>${fnEsc(f.codigo)} - ${fnEsc(f.nome)}</option>`;
    });
  }

  return html;
}

// Binds no escopo global para compatibilidade com browser e sandboxes Node VM
if (typeof window !== 'undefined') {
  window.viewFinanceiro = viewFinanceiro;
  window.renderOptionsPlanoDeContas = renderOptionsPlanoDeContas;
}
if (typeof globalThis !== 'undefined') {
  globalThis.viewFinanceiro = viewFinanceiro;
  globalThis.renderOptionsPlanoDeContas = renderOptionsPlanoDeContas;
}
