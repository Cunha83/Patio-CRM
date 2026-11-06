/* =====================================================================
   PÁTIO CRM — RENDERIZADOR PRINCIPAL DO PÁTIO, CARDS E BOXES
   Módulo Modular (< 350 linhas)
   ===================================================================== */

function isPerfilMecanico() {
  const u = (typeof S !== 'undefined' && S && ((S.user && S.user.role) || S.perfil || (S.usuarioAtual && S.usuarioAtual.perfil))) || '';
  if (u === 'mecanico' || u === 'mecânico') return true;
  if (u && u !== 'mecanico') return false;
  const perfil = typeof S !== 'undefined' && S && S.ui && S.ui.perfilAtivo;
  return perfil === 'mecanico';
}

function renderBadgesOperacionaisPatio(o) {
  if (!o) return '';
  const badges = [];
  const safeEsc = typeof esc === 'function' ? esc : (s => String(s || ''));

  if (o.box || o.boxId) {
    const boxId = o.box || o.boxId;
    const b = (typeof S !== 'undefined' && Array.isArray(S.boxes)) ? S.boxes.find(x => x.id === boxId) : null;
    const boxNome = b ? b.nome.split('—')[0].trim() : String(boxId).toUpperCase();
    badges.push(`<span class="selo selo-box-badge" style="background:#f1f5f9;color:#334155;border:1px solid #cbd5e1;font-weight:700">🏗️ ${safeEsc(boxNome)}</span>`);
  }

  if (o.mecanico) {
    badges.push(`<span class="selo selo-mecanico-badge" style="background:#ecfdf5;color:#047857;border:1px solid #a7f3d0">👨‍🔧 ${safeEsc(o.mecanico)}</span>`);
  }

  if (o.etapaPatio === 'pausado_gargalo' || o.st === 'peca') {
    const motivo = o.motivoPausa ? `: ${safeEsc(o.motivoPausa)}` : '';
    badges.push(`<span class="selo selo-gargalo" style="background:#fee2e2;color:#991b1b;border:1px solid #fecaca;font-weight:700">⏸️ GARGALO${motivo}</span>`);
  }

  if (o.statusChecklist === 'aprovado' || (o.checklistTecnico && o.checklistTecnico.status === 'aprovado')) {
    badges.push(`<span class="selo selo-vistoria-ok" style="background:#dcfce7;color:#166534;border:1px solid #bbf7d0">🛡️ Vistoria OK</span>`);
  } else if (o.statusChecklist === 'reprovado_critico' || (o.checklistTecnico && o.checklistTecnico.status === 'reprovado_critico')) {
    badges.push(`<span class="selo selo-vistoria-falha" style="background:#fef2f2;color:#b91c1c;border:1px solid #fecaca">⚠️ Falha Vistoria</span>`);
  }

  if (o.isRetornoGarantia) {
    const osOrigemTxt = o.osOrigemGarantiaId ? ` (OS #${o.osOrigemGarantiaId})` : '';
    badges.push(`<span class="selo selo-garantia" style="background:#fffbeb;color:#b45309;border:1px solid #fde68a;font-weight:700">🔄 Garantia${osOrigemTxt}</span>`);
  }

  if (o.statusLiberacaoPatio === 'liberado_garantia') {
    badges.push(`<span class="selo selo-liberado-garantia" style="background:#f0fdf4;color:#15803d;border:1px solid #bbf7d0">🛡️ Liberado (Garantia)</span>`);
  }

  if (Array.isArray(o.pecasUtilizadas) && o.pecasUtilizadas.length > 0) {
    badges.push(`<span class="selo selo-pecas-badge" style="background:#f8fafc;color:#475569;border:1px solid #e2e8f0">🔩 ${o.pecasUtilizadas.length} peça(s)</span>`);
  }

  return badges.length > 0 ? `<div class="badges-operacionais-patio" style="display:inline-flex;gap:4px;flex-wrap:wrap;margin:3px 0">${badges.join('')}</div>` : '';
}

function radarGargalosPatioHtml() {
  if (typeof window !== 'undefined' && window.radarGargalosPatioHtml && window.radarGargalosPatioHtml !== radarGargalosPatioHtml) {
    return window.radarGargalosPatioHtml();
  }
  const osLista = (typeof S !== 'undefined' && Array.isArray(S.os)) ? S.os : [];
  const boxes = (typeof S !== 'undefined' && Array.isArray(S.boxes)) ? S.boxes : [];
  const safeEsc = typeof esc === 'function' ? esc : (s => String(s || ''));
  const ocupadosSet = new Set();
  const bloqueadosPecaSet = new Set();
  osLista.forEach(o => {
    const bId = o.box || o.boxId;
    if (bId && o.st !== 'finalizada') {
      ocupadosSet.add(bId);
      if (o.etapaPatio === 'pausado_gargalo' || o.st === 'peca') bloqueadosPecaSet.add(bId);
    }
  });
  const totalBoxes = boxes.length;
  const bloqueadosPeca = bloqueadosPecaSet.size;
  const ocupadosExec = ocupadosSet.size - bloqueadosPeca;
  const livres = Math.max(0, totalBoxes - ocupadosSet.size);

  return `
  <div class="card card-p" style="margin-bottom:14px;background:#f8fafc;border:1px solid var(--aco-200)">
    <div class="entre" style="border-bottom:1px solid var(--aco-150);padding-bottom:8px;margin-bottom:10px;flex-wrap:wrap;gap:8px">
      <div style="display:flex;align-items:center;gap:6px">
        <span style="font-size:16px">🚦</span>
        <span style="font-weight:700;font-size:14px;color:var(--aco-900)">Radar Operacional de Boxes & Gargalos de Pátio</span>
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        <span class="selo" style="background:#e0f2fe;color:#0369a1;border:1px solid #bae6fd;font-weight:700">Total: ${totalBoxes} boxes</span>
        <span class="selo" style="background:#dcfce7;color:#166534;border:1px solid #bbf7d0;font-weight:700">🟢 ${livres} Livre(s)</span>
        <span class="selo" style="background:#e0e7ff;color:#3730a3;border:1px solid #c7d2fe;font-weight:700">⚙️ ${ocupadosExec} Em Execução</span>
        <span class="selo" style="background:#fee2e2;color:#991b1b;border:1px solid #fecaca;font-weight:700">⏸️ ${bloqueadosPeca} Bloqueado(s) Peça</span>
      </div>
    </div>
    <div class="mini" style="color:var(--aco-600)">✅ Fluxo operacional equilibrado: nenhum gargalo crítico detectado nos boxes ativos.</div>
  </div>`;
}

function viewPatio() {
  const osLista = (typeof S !== 'undefined' && S.os) || [];
  const visao = (typeof S !== 'undefined' && S.ui && S.ui.visaoPatio) || 'monday';
  const filtro = (typeof S !== 'undefined' && S.ui && S.ui.filtro) || 'todos';
  const buscaPlaca = (typeof S !== 'undefined' && S.ui && S.ui.buscaPlaca || '').trim().toUpperCase();

  let filtradas = osLista;
  if (filtro !== 'todos') {
    filtradas = filtradas.filter(o => o.st === filtro);
  }
  if (buscaPlaca) {
    filtradas = filtradas.filter(o => {
      const v = typeof V === 'function' ? V(o.vei) : (o.veiculo || {});
      const c = typeof C === 'function' ? C(o.cli) : (o.cliente || {});
      const p = (v && v.placa) || o.placa || '';
      const m = (v && v.modelo) || o.modelo || '';
      const n = (c && c.nome) || o.clienteNome || '';
      return p.toUpperCase().includes(buscaPlaca) || m.toUpperCase().includes(buscaPlaca) || n.toUpperCase().includes(buscaPlaca);
    });
  }

  if (visao === 'monday' && typeof renderPatioBoardView === 'function') {
    const boardHtml = renderPatioBoardView(filtradas, visao);
    if (boardHtml) {
      return `
        ${typeof radarGargalosPatioHtml === 'function' ? radarGargalosPatioHtml() : ''}
        ${boardHtml}
      `;
    }
  }

  const contagens = {
    todos: osLista.length,
    fila: osLista.filter(o => o.st === 'fila').length,
    aprovacao: osLista.filter(o => o.st === 'aprovacao').length,
    executando: osLista.filter(o => o.st === 'executando').length,
    peca: osLista.filter(o => o.st === 'peca').length,
    finalizada: osLista.filter(o => o.st === 'finalizada').length
  };

  const chips = [
    { id: 'todos', label: 'Todos' },
    { id: 'fila', label: 'Na Fila' },
    { id: 'aprovacao', label: 'Aguard. Aprovação' },
    { id: 'executando', label: 'Em Execução' },
    { id: 'peca', label: 'Parados p/ Peça' },
    { id: 'finalizada', label: 'Finalizadas' }
  ];

  const boxes = (typeof S !== 'undefined' && S.boxes) || [];
  const boxesComOS = boxes.map(b => ({
    box: b,
    os: osLista.filter(o => o.box === b.id && o.st !== 'finalizada')
  }));
  const semBox = osLista.filter(o => !o.box && o.st !== 'finalizada');

  return `
  ${typeof radarGargalosPatioHtml === 'function' ? radarGargalosPatioHtml() : ''}

  <div class="kpis">
    <div class="kpi bom">
      <div class="r">${ico('check', 14)} Em Atendimento</div>
      <div class="v">${contagens.executando}</div>
      <div class="d">Veículos em serviço nos boxes</div>
    </div>
    <div class="kpi ${contagens.peca > 0 ? 'alerta' : 'bom'}">
      <div class="r">${ico('pecas', 14)} Parados p/ Peça</div>
      <div class="v">${contagens.peca}</div>
      <div class="d">Aguardando peças do almoxarifado</div>
    </div>
    <div class="kpi neutro">
      <div class="r">${ico('relogio', 14)} Na Fila</div>
      <div class="v">${contagens.fila}</div>
      <div class="d">Aguardando alocação de baia</div>
    </div>
    <div class="kpi bom">
      <div class="r">${ico('os', 14)} Boxes Livres</div>
      <div class="v">${boxes.filter(b => !osLista.some(o => o.box === b.id && o.st !== 'finalizada')).length}</div>
      <div class="d">Prontos para novo atendimento</div>
    </div>
  </div>

  <div class="barra-filtros">
    <div class="chips">
      ${chips.map(c => `
        <button class="chip ${filtro === c.id ? 'ativo' : ''}" data-act="filtro-patio" data-filtro="${c.id}">
          ${c.label} (${contagens[c.id]})
        </button>
      `).join('')}
    </div>
    <button class="btn btn-primario" data-act="nova-os">
      ${ico('mais', 14)} Nova OS
    </button>
  </div>

  <div class="patio-grid">
    <div class="col-boxes">
      <h3 style="font-size:14px;font-weight:700;color:var(--aco-700);margin-bottom:12px">Boxes do Pátio</h3>
      <div class="grid-boxes">
        ${boxesComOS.map(item => {
          if (item.os.length === 0) return cardLivre(item.box);
          return item.os.map(o => cardOS(o, item.box)).join('');
        }).join('')}
      </div>
    </div>

    ${semBox.length > 0 ? `
    <div class="col-fila" style="margin-top:20px">
      <h3 style="font-size:14px;font-weight:700;color:var(--aco-700);margin-bottom:12px">Veículos Aguardando Box (${semBox.length})</h3>
      <div class="grid-boxes">
        ${semBox.map(o => cardOS(o, null)).join('')}
      </div>
    </div>` : ''}
  </div>`;
}

function cardOS(o, b) {
  const v = (typeof V === 'function') ? V(o.vei) : { placa: '—', modelo: '—' };
  const c = (typeof C === 'function') ? C(o.cli) : { nome: '—' };
  const total = (typeof totOS === 'function') ? totOS(o) : 0;
  const stInfo = (typeof ST !== 'undefined' && ST[o.st]) ? ST[o.st] : { r: 'Na Fila', c: 'var(--aco-300)' };
  const qtdItens = (o.servicos ? o.servicos.length : 0) + (o.pecas ? o.pecas.length : 0);
  const safeEsc = typeof esc === 'function' ? esc : (s => String(s || ''));
  const safeBrl = typeof brl === 'function' ? brl : (n => 'R$ ' + Number(n || 0).toFixed(2));
  const safeIco = typeof ico === 'function' ? ico : () => '';

  return `
  <div class="box card" data-act="abrir-os" data-id="${o.id}" data-st="${o.st}">
    <div class="box-topo">
      <div class="tag-box">
        ${safeEsc(b ? b.nome.split('—')[0].trim() : 'PÁTIO')}
        <small>${safeEsc(b ? (b.tipo || 'Geral') : 'Livre')}</small>
      </div>
      <div style="min-width:0;flex:1">
        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
          <span class="placa" style="color:#000000;font-weight:bold">${safeEsc(v.placa)}</span>
          <span class="selo" data-st="${o.st}">${stInfo.r}</span>
          ${renderBadgesOperacionaisPatio(o)}
        </div>
        <div class="modelo">${safeEsc(v.marca ? v.marca + ' ' : '')}${safeEsc(v.modelo)}</div>
        <div class="cliente" title="${safeEsc(c.nome)}">${safeEsc(c.fantasia || c.nome)}</div>
      </div>
    </div>

    ${o.queixa ? `<div class="mini" style="margin-top:10px;color:var(--aco-600);line-height:1.3;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden"><b>Queixa:</b> ${safeEsc(o.queixa)}</div>` : ''}

    <div class="box-rodape" style="flex-wrap:wrap;gap:6px">
      <span class="mini" style="display:flex;align-items:center;gap:4px">
        ${safeIco('relogio', 12)} OS ${o.num} · ${qtdItens} itens
      </span>
      ${!isPerfilMecanico() ? `<div class="val">${safeBrl(total)}</div>` : ''}
    </div>

    <div style="margin-top:8px;padding-top:8px;border-top:1px dashed var(--aco-150);display:flex;align-items:center;justify-content:space-between;gap:6px;flex-wrap:wrap" onclick="event.stopPropagation()">
      <div style="display:flex;align-items:center;gap:4px;flex-wrap:wrap">
        ${(o.etapaPatio === 'pausado_gargalo' || o.st === 'peca') ? `
          <button class="btn btn-sucesso" data-act="retomar-os-gargalo" data-id="${o.id}" style="font-size:11px;padding:3px 8px;border-radius:6px;height:26px;font-weight:600" title="Peça chegou: retomar">
            ▶️ Retomar / Peça Chegou
          </button>
        ` : ''}
        <button class="btn btn-secundario" data-act="copiar-aviso-os" data-id="${o.id}" style="font-size:11px;padding:3px 8px;border-radius:6px;height:26px;font-weight:600">
          📲 Copiar Aviso
        </button>
        <button type="button" class="btn btn-sm btn-outline-info" data-act="historico-placa-os" data-os-id="${safeEsc(o.id)}" data-placa="${safeEsc(v.placa)}" style="font-size:11px;padding:3px 8px;border-radius:6px;height:26px;font-weight:600">
          🔍 Histórico Placa
        </button>
        ${o.statusChecklist !== 'aprovado' && o.st !== 'finalizada' ? `
          <button class="btn btn-sucesso" data-act="aprovar-checklist-os" data-id="${o.id}" style="font-size:11px;padding:3px 8px;border-radius:6px;height:26px;font-weight:600">
            🛡️ Checklist OK
          </button>
        ` : ''}
      </div>
    </div>
  </div>`;
}

function cardLivre(b) {
  const safeEsc = typeof esc === 'function' ? esc : (s => String(s || ''));
  const safeIco = typeof ico === 'function' ? ico : () => '';
  return `
  <div class="box card" data-st="livre" style="border:2px dashed var(--aco-200);background:rgba(255,255,255,0.6)">
    <div class="box-topo">
      <div class="tag-box" style="background:var(--aco-400)">
        ${safeEsc(b.nome.split('—')[0].trim())}
        <small>${safeEsc(b.tipo || 'Geral')}</small>
      </div>
      <div style="min-width:0;flex:1">
        <div style="font-weight:600;color:var(--aco-500);font-size:14px;margin-top:2px">Box Disponível</div>
        <div class="mini" style="color:var(--aco-400)">Pronto para receber caminhão</div>
      </div>
    </div>
    <div style="margin-top:16px;text-align:right">
      <button class="btn btn-secundario" data-act="nova-os" data-box="${b.id}" style="font-size:12px;padding:6px 12px;border-radius:14px">
        ${safeIco('mais', 12)} Ocupar Box
      </button>
    </div>
  </div>`;
}

if (typeof window !== 'undefined') {
  window.isPerfilMecanico = isPerfilMecanico;
  window.renderBadgesOperacionaisPatio = renderBadgesOperacionaisPatio;
  window.radarGargalosPatioHtml = radarGargalosPatioHtml;
  window.viewPatio = viewPatio;
  window.cardOS = cardOS;
  window.cardLivre = cardLivre;
}
if (typeof globalThis !== 'undefined') {
  globalThis.isPerfilMecanico = isPerfilMecanico;
  globalThis.renderBadgesOperacionaisPatio = renderBadgesOperacionaisPatio;
  globalThis.radarGargalosPatioHtml = radarGargalosPatioHtml;
  globalThis.viewPatio = viewPatio;
  globalThis.cardOS = cardOS;
  globalThis.cardLivre = cardLivre;
}
