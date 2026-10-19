/* =====================================================================
   PÁTIO CRM — RENDERIZAÇÃO VISUAL DE PÁTIO, BOXES & CARDS DE OS
   Módulo extraído na Fase 3 da Modularização do Frontend
   ===================================================================== */

function isPerfilMecanico() {
  const role = (typeof S !== 'undefined' && S && ((S.user && S.user.role) || S.perfil)) || '';
  if (role === 'mecanico') return true;
  if (role && role !== 'mecanico') return false;
  const perfil = typeof S !== 'undefined' && S && S.ui && S.ui.perfilAtivo;
  return perfil === 'mecanico';
}

function renderBadgesOperacionaisPatio(o) {
  if (!o) return '';
  const badges = [];
  const safeEsc = typeof esc === 'function' ? esc : (s => String(s || ''));

  // Box atual
  const boxId = o.boxId || o.box;
  if (boxId) {
    let nomeBox = boxId;
    if (typeof S !== 'undefined' && Array.isArray(S && S.boxes)) {
      const bObj = S.boxes.find(b => b.id === boxId);
      if (bObj && bObj.nome) nomeBox = bObj.nome.split('—')[0].split('-')[0].trim();
    }
    badges.push(`<span class="selo selo-box" style="background:#e0f2fe;color:#0369a1;border:1px solid #bae6fd;font-size:10px;font-weight:600" title="Box Alocado">🏗️ ${safeEsc(nomeBox)}</span>`);
  }

  // Mecânico
  if (o.mecanico) {
    badges.push(`<span class="selo selo-mecanico" style="background:#f3e8ff;color:#6b21a8;border:1px solid #e9d5ff;font-size:10px;font-weight:600" title="Mecânico Responsável">👨‍🔧 ${safeEsc(o.mecanico)}</span>`);
  }

  // Etapa / Gargalo
  if (o.etapaPatio === 'pausado_gargalo' || o.st === 'peca') {
    const mot = o.motivoPausa ? `: ${o.motivoPausa}` : '';
    badges.push(`<span class="selo selo-gargalo" style="background:#fee2e2;color:#b91c1c;border:1px solid #fecaca;font-size:10px;font-weight:700" title="${safeEsc(o.motivoPausa || 'Gargalo Operacional')}">⏸️ GARGALO${safeEsc(mot)}</span>`);
  } else if (o.etapaPatio === 'pronto_retirada' || o.st === 'finalizada') {
    badges.push(`<span class="selo selo-pronto" style="background:#dcfce7;color:#15803d;border:1px solid #bbf7d0;font-size:10px;font-weight:600" title="Veículo pronto para entrega">✅ Pronto p/ Retirada</span>`);
  } else if (o.etapaPatio === 'em_execucao' || o.st === 'executando') {
    badges.push(`<span class="selo selo-execucao" style="background:#e0e7ff;color:#3730a3;border:1px solid #c7d2fe;font-size:10px;font-weight:600" title="Em Execução Mecânica">⚙️ Em Execução</span>`);
  }

  return badges.join(' ');
}

function radarGargalosPatioHtml() {
  const osLista = (typeof S !== 'undefined' && Array.isArray(S.os)) ? S.os : [];
  const boxes = (typeof S !== 'undefined' && Array.isArray(S.boxes)) ? S.boxes : [];
  const safeEsc = typeof esc === 'function' ? esc : (s => String(s || ''));

  const ocupadosSet = new Set();
  const bloqueadosPecaSet = new Set();

  osLista.forEach(o => {
    const bId = o.box || o.boxId;
    if (bId && o.st !== 'finalizada') {
      ocupadosSet.add(bId);
      if (o.etapaPatio === 'pausado_gargalo' || o.st === 'peca') {
        bloqueadosPecaSet.add(bId);
      }
    }
  });

  const totalBoxes = boxes.length;
  const bloqueadosPeca = bloqueadosPecaSet.size;
  const ocupadosExec = ocupadosSet.size - bloqueadosPeca;
  const livres = Math.max(0, totalBoxes - ocupadosSet.size);

  const osGargalos = osLista.filter(o => o.st !== 'finalizada' && (o.etapaPatio === 'pausado_gargalo' || o.st === 'peca'));
  const osProntasRetidas = osLista.filter(o => (o.etapaPatio === 'pronto_retirada' || o.st === 'finalizada') && o.statusLiberacaoPatio === 'retido_pendente');

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
    ${(osGargalos.length > 0 || osProntasRetidas.length > 0) ? `
      <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(260px, 1fr));gap:10px">
        ${osGargalos.length > 0 ? `
          <div style="background:#fff1f2;border:1px solid #fecdd3;border-radius:6px;padding:8px 12px">
            <div style="font-weight:700;font-size:12px;color:#9f1239;margin-bottom:4px">⚠️ Gargalos de Peça (${osGargalos.length})</div>
            <div class="mini" style="color:#881337">
              ${osGargalos.slice(0, 3).map(o => `OS #${o.num || o.id} (${safeEsc(o.motivoPausa || 'Aguardando Peças')})`).join(' · ')}
              ${osGargalos.length > 3 ? ` e mais ${osGargalos.length - 3}...` : ''}
            </div>
          </div>
        ` : ''}
        ${osProntasRetidas.length > 0 ? `
          <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:6px;padding:8px 12px">
            <div style="font-weight:700;font-size:12px;color:#92400e;margin-bottom:4px">🟡 Mecânica Pronta / Retida no Financeiro (${osProntasRetidas.length})</div>
            <div class="mini" style="color:#78350f">
              ${osProntasRetidas.slice(0, 3).map(o => `OS #${o.num || o.id}`).join(' · ')}
              ${osProntasRetidas.length > 3 ? ` e mais ${osProntasRetidas.length - 3}...` : ''}
            </div>
          </div>
        ` : ''}
      </div>
    ` : `
      <div class="mini" style="color:var(--aco-600)">✅ Fluxo operacional equilibrado: nenhum gargalo crítico detectado nos boxes ativos.</div>
    `}
  </div>`;
}

function viewPatio() {
  const osLista = S.os || [];
  const filtro = S.ui.filtro || 'todos';
  const buscaPlaca = (S.ui.buscaPlaca || '').trim().toUpperCase();

  // Filtragem
  let filtradas = osLista;
  if (filtro !== 'todos') {
    filtradas = filtradas.filter(o => o.st === filtro);
  }
  if (buscaPlaca) {
    filtradas = filtradas.filter(o => {
      const v = V(o.vei), c = C(o.cli);
      return v.placa.includes(buscaPlaca) || v.modelo.toUpperCase().includes(buscaPlaca) || c.nome.toUpperCase().includes(buscaPlaca);
    });
  }

  // Contagens por status para os chips
  const contagens = {
    todos: osLista.length,
    fila: osLista.filter(o => o.st === 'fila').length,
    aprovacao: osLista.filter(o => o.st === 'aprovacao').length,
    executando: osLista.filter(o => o.st === 'executando').length,
    peca: osLista.filter(o => o.st === 'peca').length,
    finalizada: osLista.filter(o => o.st === 'finalizada').length
  };

  const chips = [
    ['todos', 'Todos os Boxes', contagens.todos],
    ['executando', 'Em Execução', contagens.executando],
    ['peca', 'Parado por Peça', contagens.peca],
    ['aprovacao', 'Aguardando Aprovação', contagens.aprovacao],
    ['fila', 'Na Fila', contagens.fila],
    ['finalizada', 'Finalizadas', contagens.finalizada]
  ];

  // Grade de Boxes do Pátio
  const cardsHtml = S.boxes.map(box => {
    // Procura OS ativa no box
    const osDoBox = filtradas.find(o => o.box === box.id && o.st !== 'finalizada');
    if (osDoBox) return cardOS(osDoBox, box);
    // Se o filtro estiver em finalizada ou não for 'todos', e não houver OS correspondente
    if (filtro === 'finalizada') {
      const fin = filtradas.find(o => o.box === box.id && o.st === 'finalizada');
      return fin ? cardOS(fin, box) : '';
    }
    return filtro === 'todos' ? cardLivre(box) : '';
  }).filter(Boolean).join('');

  // Veículos na Fila de Espera (sem box alocado)
  const filaSemBox = filtradas.filter(o => !o.box && o.st !== 'finalizada');
  let filaHtml = '';
  if (filaSemBox.length > 0) {
    filaHtml = `
    <div style="margin-top:22px">
      <div style="font-weight:700;font-size:15px;color:var(--aco-800);margin-bottom:10px;display:flex;align-items:center;gap:6px">
        ${ico('relogio', 16)} <b>Fila de Espera no Pátio</b> <span class="selo" data-st="fila">${filaSemBox.length} aguardando liberação de box</span>
      </div>
      <div class="patio" style="grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));">
        ${filaSemBox.map(o => cardOS(o, null)).join('')}
      </div>
    </div>`;
  }

  return `
  <div class="kpis" style="margin-bottom:14px">
    <div class="kpi bom">
      <div class="r">${ico('patio', 14)} Em Atendimento</div>
      <div class="v">${contagens.executando}</div>
      <div class="d">${contagens.executando} veículos nos boxes</div>
    </div>
    <div class="kpi ${contagens.peca ? 'aviso' : 'neutro'}">
      <div class="r">${ico('pecas', 14)} Parados p/ Peça</div>
      <div class="v">${contagens.peca}</div>
      <div class="d">Aguardando almoxarifado/fornecedor</div>
    </div>
    <div class="kpi neutro">
      <div class="r">${ico('doc', 14)} Aguardando Aprovação</div>
      <div class="v">${contagens.aprovacao}</div>
      <div class="d">Orçamentos enviados</div>
    </div>
    <div class="kpi bom">
      <div class="r">${ico('check', 14)} Finalizadas no Mês</div>
      <div class="v">${contagens.finalizada}</div>
      <div class="d">Veículos liberados</div>
    </div>
  </div>

  <div class="entre" style="margin-bottom:12px;flex-wrap:wrap;gap:8px">
    <div class="trilho" style="padding:0;margin:0">
      ${chips.map(([k, label, total]) => `
        <button class="chip" data-act="filtro" data-f="${k}" aria-pressed="${filtro === k}">
          ${label} <span class="n">${total}</span>
        </button>
      `).join('')}
    </div>
    <div style="display:flex;gap:8px;align-items:center">
      <div class="campo-busca" style="position:relative">
        <input type="text" class="campo-texto" placeholder="Buscar placa, cliente ou modelo..." data-act="busca-placa-patio" value="${esc(S.ui.buscaPlaca || '')}" style="width:230px;padding-left:30px;height:34px;font-size:13px;border-radius:20px;background:var(--branco);border:1px solid var(--aco-150)">
        <span style="position:absolute;left:10px;top:8px;color:var(--aco-400);pointer-events:none">${ico('busca', 14)}</span>
      </div>
      <button class="btn btn-primario" data-act="nova-os" style="height:34px;font-size:13px;padding:0 14px;border-radius:20px">
        ${ico('mais', 14)} Nova OS
      </button>
    </div>
  </div>

  ${typeof radarGargalosPatioHtml === 'function' ? radarGargalosPatioHtml() : ''}

  <div style="font-weight:700;font-size:15px;color:var(--aco-800);margin-bottom:10px;display:flex;align-items:center;gap:6px">
    ${ico('patio', 16)} <b>Boxes do Pátio</b>
  </div>
  <div class="patio">
    ${cardsHtml || '<div class="card card-p vazia" style="grid-column:1/-1;text-align:center;padding:40px"><b>Nenhum veículo encontrado</b>Nenhuma Ordem de Serviço com os critérios selecionados.</div>'}
  </div>
  ${filaHtml}`;
}

function cardOS(o, b) {
  const v = V(o.vei), c = C(o.cli);
  const total = totOS(o);
  const stInfo = ST[o.st] || ST.fila;
  const qtdItens = (o.servicos ? o.servicos.length : 0) + (o.pecas ? o.pecas.length : 0);

  return `
  <div class="box card" data-act="abrir-os" data-id="${o.id}" data-st="${o.st}">
    <div class="box-topo">
      <div class="tag-box">
        ${esc(b ? b.nome.split('—')[0].trim() : 'PÁTIO')}
        <small>${esc(b ? (b.tipo || 'Geral') : 'Livre')}</small>
      </div>
      <div style="min-width:0;flex:1">
        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
          <span class="placa" style="color:#000000;font-weight:bold">${esc(v.placa)}</span>
          <span class="selo" data-st="${o.st}">${stInfo.r}</span>
          ${(o.pendenciaCadastral || v.pendenciaCadastral || v.placa === 'SEM-PLACA') ? '<span class="selo" style="background:#fff3cd;color:#856404;border:1px solid #ffeeba;font-size:10px" title="Pendência Cadastral: Placa não confirmada">⚠️ Placa Pendente</span>' : ''}
          ${renderBadgesOperacionaisPatio(o)}
          ${!isPerfilMecanico() && typeof renderBadgeLiberacaoPatio === 'function' ? renderBadgeLiberacaoPatio(o) : ''}
        </div>
        <div class="modelo">${esc(v.marca ? v.marca + ' ' : '')}${esc(v.modelo)}</div>
        <div class="cliente" title="${esc(c.nome)}">${esc(c.fantasia || c.nome)}</div>
      </div>
    </div>

    ${o.queixa ? `<div class="mini" style="margin-top:10px;color:var(--aco-600);line-height:1.3;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden"><b>Queixa:</b> ${esc(o.queixa)}</div>` : ''}

    <div class="box-rodape" style="flex-wrap:wrap;gap:6px">
      <span class="mini" style="display:flex;align-items:center;gap:4px">
        ${ico('relogio', 12)} OS ${o.num} · ${qtdItens} itens
      </span>
      ${!isPerfilMecanico() ? `<div class="val">${brl(total)}</div>` : ''}
    </div>

    <!-- Controle Rápido de Status e Alocação de Box -->
    <div style="margin-top:8px;padding-top:8px;border-top:1px dashed var(--aco-150);display:flex;align-items:center;justify-content:space-between;gap:6px;flex-wrap:wrap" onclick="event.stopPropagation()">
      <div style="display:flex;align-items:center;gap:4px;flex:1;min-width:140px">
        <label class="mini" style="font-size:10px;font-weight:600;color:var(--aco-500)">Status:</label>
        <select class="campo-select" data-act="mudar-status-card" data-id="${o.id}" style="height:26px;font-size:11.5px;padding:0 6px;border-radius:6px;font-weight:600;background:var(--aco-050);flex:1;min-width:0">
          <option value="fila" ${o.st === 'fila' ? 'selected' : ''}>Na Fila</option>
          <option value="executando" ${o.st === 'executando' ? 'selected' : ''}>Em Execução</option>
          <option value="peca" ${o.st === 'peca' ? 'selected' : ''}>Parado p/ Peça</option>
          <option value="aprovacao" ${o.st === 'aprovacao' ? 'selected' : ''}>Aguardando Aprovação</option>
          <option value="finalizada" ${o.st === 'finalizada' ? 'selected' : ''}>Finalizada</option>
        </select>
      </div>
      <div style="display:flex;align-items:center;gap:4px;flex-wrap:wrap">
        ${(o.box || o.boxId) && o.st !== 'finalizada' ? `
          ${(o.etapaPatio === 'pausado_gargalo' || o.st === 'peca') ? `
            <button class="btn btn-sucesso" data-act="iniciar-box-card" data-id="${o.id}" style="font-size:11px;padding:3px 8px;border-radius:6px;height:26px;font-weight:600" title="Retomar execução mecânica">
              ▶ Retomar
            </button>
          ` : `
            <button class="btn btn-secundario" data-act="pausar-os-gargalo" data-id="${o.id}" style="font-size:11px;padding:3px 8px;border-radius:6px;height:26px;font-weight:600;color:#b91c1c" title="Pausar por falta de peça ou gargalo operacional">
              ⏸ Pausar
            </button>
          `}
          <button class="btn btn-secundario" data-act="liberar-box-os" data-id="${o.id}" style="font-size:11px;padding:3px 8px;border-radius:6px;height:26px;font-weight:600" title="Liberar este box de oficina">
            🔓 Desocupar
          </button>
        ` : (!o.box && o.st !== 'finalizada' ? `
          <button class="btn btn-sucesso" data-act="alocar-box-os" data-id="${o.id}" style="font-size:11px;padding:3px 8px;border-radius:6px;height:26px;font-weight:600;white-space:nowrap" title="Alocar box físico para esta OS">
            🏗️ Alocar Box
          </button>
        ` : '')}
      </div>
    </div>
  </div>`;
}

function cardLivre(b) {
  return `
  <div class="box card" data-st="livre" style="border:2px dashed var(--aco-200);background:rgba(255,255,255,0.6)">
    <div class="box-topo">
      <div class="tag-box" style="background:var(--aco-400)">
        ${esc(b.nome.split('—')[0].trim())}
        <small>${esc(b.tipo || 'Geral')}</small>
      </div>
      <div style="min-width:0;flex:1">
        <div style="font-weight:600;color:var(--aco-500);font-size:14px;margin-top:2px">Box Disponível</div>
        <div class="mini" style="color:var(--aco-400)">Pronto para receber caminhão</div>
      </div>
    </div>
    <div style="margin-top:16px;text-align:right">
      <button class="btn btn-secundario" data-act="nova-os" data-box="${b.id}" style="font-size:12px;padding:6px 12px;border-radius:14px">
        ${ico('mais', 12)} Ocupar Box
      </button>
    </div>
  </div>`;
}

// Exportações explícitas no escopo global (window e globalThis)
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
