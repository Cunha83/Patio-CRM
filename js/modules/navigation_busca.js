/* Submódulo de Busca Global Omnibox: navigation_busca.js */
/* Pátio-CRM — Submódulo extraído de js/modules/navigation.js (< 350 linhas) */

function executarBuscaGlobal(termo) {
  if (!termo || !termo.trim()) return;
  const t = termo.trim();

  // Prefixos contextuais
  if (t.startsWith('em:vendas')) {
    const q = t.replace('em:vendas', '').trim();
    S.ui.view = 'vendas';
    S.ui.buscaVendas = q;
    render();
    if (typeof torrar === 'function') torrar(`Filtrando Vendas: "${q || 'todas'}"`);
    return;
  }
  if (t.startsWith('em:compras')) {
    const q = t.replace('em:compras', '').trim();
    S.ui.view = 'compras';
    S.ui.buscaCompras = q;
    render();
    if (typeof torrar === 'function') torrar(`Filtrando Compras: "${q || 'todas'}"`);
    return;
  }
  if (t.startsWith('em:clientes')) {
    const q = t.replace('em:clientes', '').trim();
    S.ui.view = 'cadastros';
    S.ui.abaCad = 'clientes';
    S.ui.buscaCad = q;
    render();
    if (typeof torrar === 'function') torrar(`Filtrando Clientes: "${q || 'todos'}"`);
    return;
  }
  if (t.startsWith('em:produtos')) {
    const q = t.replace('em:produtos', '').trim();
    S.ui.view = 'estoque';
    S.ui.buscaPeca = q;
    render();
    if (typeof torrar === 'function') torrar(`Filtrando Almoxarifado: "${q || 'todos'}"`);
    return;
  }
  if (t.startsWith('em:nfe') || t.startsWith('em:fiscal')) {
    if (typeof abrirCentralFiscal === 'function') abrirCentralFiscal();
    else if (document.getElementById('patio-fiscal')) {
      const b = document.getElementById('patio-fiscal').shadowRoot?.querySelector('.launcher');
      if (b) b.click();
    }
    return;
  }
  if (t.startsWith('em:patio')) {
    const q = t.replace('em:patio', '').trim();
    S.ui.view = 'patio';
    S.ui.busca = q;
    render();
    if (typeof torrar === 'function') torrar(`Buscando no Pátio: "${q || 'todos'}"`);
    return;
  }

  // Busca geral heurística inteligente
  const qLower = t.toLowerCase();
  const achouCliente = (S.clientes || []).some(c => (c.nome || '').toLowerCase().includes(qLower) || (c.doc || '').includes(qLower));
  if (achouCliente) {
    S.ui.view = 'cadastros';
    S.ui.abaCad = 'clientes';
    S.ui.buscaCad = t;
    render();
    if (typeof torrar === 'function') torrar(`Buscando cliente "${t}" em Cadastros`);
    return;
  }

  const achouPeca = (S.pecas || []).some(p => (p.nome || '').toLowerCase().includes(qLower) || (p.cod || '').toLowerCase().includes(qLower));
  if (achouPeca) {
    S.ui.view = 'estoque';
    S.ui.buscaPeca = t;
    render();
    if (typeof torrar === 'function') torrar(`Buscando peça "${t}" no Almoxarifado`);
    return;
  }

  const achouVenda = (S.vendas || []).some(v => (v.codigo || '').toLowerCase().includes(qLower) || (v.clienteNome || '').toLowerCase().includes(qLower));
  if (achouVenda) {
    S.ui.view = 'vendas';
    S.ui.buscaVendas = t;
    render();
    if (typeof torrar === 'function') torrar(`Buscando venda "${t}"`);
    return;
  }

  // Fallback: Busca geral na tela de Pátio
  S.ui.view = 'patio';
  S.ui.busca = t;
  render();
  if (typeof torrar === 'function') torrar(`Buscando "${t}" no Pátio`);
}

let buscaGlobalTimer = null;
function aoDigitarBuscaGlobal(val) {
  clearTimeout(buscaGlobalTimer);
  const q = String(val || '').trim();
  const popover = document.getElementById('busca-global-popover');
  if (!q) {
    if (popover) popover.style.display = 'none';
    return;
  }
  buscaGlobalTimer = setTimeout(async () => {
    try {
      const resp = await fetch('/api/search?q=' + encodeURIComponent(q));
      const dados = await resp.json();
      if (!dados || !dados.success || !Array.isArray(dados.resultados)) return;
      renderPopoverBusca(dados.resultados, q);
    } catch (_) {}
  }, 220);
}

function renderPopoverBusca(resultados, termo) {
  let popover = document.getElementById('busca-global-popover');
  if (!popover) return;

  if (resultados.length === 0) {
    popover.innerHTML = '<div style="padding:12px;font-size:12px;color:#64748b;text-align:center">Nenhum resultado para "' + esc(termo) + '"</div>';
    popover.style.display = 'block';
    return;
  }

  popover.innerHTML = resultados.map(r => `
    <div onclick="selecionarItemBuscaGlobal('${r.rota}', '${r.id}')" style="padding:10px 14px;border-bottom:1px solid #f1f5f9;cursor:pointer;display:flex;align-items:center;justify-content:space-between;gap:8px" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='white'">
      <div style="min-width:0;flex:1">
        <div style="font-weight:700;font-size:13px;color:#0f172a">${esc(r.titulo)}</div>
        <div style="font-size:11.5px;color:#64748b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(r.subtitulo)}</div>
      </div>
      <span class="selo" style="font-size:10px;font-weight:700;background:#e0f2fe;color:#0369a1">${esc(r.badge)}</span>
    </div>
  `).join('');
  popover.style.display = 'block';
}

function selecionarItemBuscaGlobal(rota, id) {
  const popover = document.getElementById('busca-global-popover');
  if (popover) popover.style.display = 'none';
  if (rota === 'vendas' || rota === 'os') {
    S.ui.view = 'vendas';
    if (id) S.ui.osAberta = id;
  } else if (rota === 'patio') {
    S.ui.view = 'patio';
    if (id) S.ui.buscaPlaca = id;
  } else if (rota === 'cadastros') {
    S.ui.view = 'cadastros';
  } else if (rota === 'compras') {
    S.ui.view = 'compras';
  } else if (rota === 'fiscal') {
    if (typeof abrirCentralFiscal === 'function') abrirCentralFiscal();
    else S.ui.view = 'fiscal';
  } else {
    S.ui.view = rota;
  }
  if (typeof render === 'function') render();
}

// Toggle Dropdown + Novo

if (typeof window !== 'undefined') {
  window.executarBuscaGlobal = executarBuscaGlobal;
  window.aoDigitarBuscaGlobal = aoDigitarBuscaGlobal;
  window.renderPopoverBusca = renderPopoverBusca;
  window.selecionarItemBuscaGlobal = selecionarItemBuscaGlobal;
}
if (typeof globalThis !== 'undefined') {
  globalThis.executarBuscaGlobal = executarBuscaGlobal;
  globalThis.aoDigitarBuscaGlobal = aoDigitarBuscaGlobal;
  globalThis.renderPopoverBusca = renderPopoverBusca;
  globalThis.selecionarItemBuscaGlobal = selecionarItemBuscaGlobal;
}
