/* =====================================================================
   PÁTIO CRM — VISÃO DE QUADRO DE SERVIÇOS (MONDAY BOARD)
   Submódulo extraído de js/modules/patio_render.js (< 350 linhas)
   ===================================================================== */

function renderPatioBoardView(filtradas = [], visao = 'monday') {
  if (typeof renderMondayBoard !== 'function' && (typeof MondayBoard === 'undefined' || !MondayBoard.renderMondayBoard)) {
    return '';
  }
  const fnBoard = typeof renderMondayBoard === 'function' ? renderMondayBoard : MondayBoard.renderMondayBoard;

  const mapOSToMonday = (o) => {
    const v = typeof V === 'function' ? V(o.vei) : (o.veiculo || {});
    const c = typeof C === 'function' ? C(o.cli) : (o.cliente || {});
    const b = typeof B === 'function' ? B(o.box) : (o.boxObj || {});
    const total = typeof totOS === 'function' ? totOS(o) : (Number(o.total) || 0);

    let stLabel = 'Na Fila';
    let stColor = '#0086c0';
    if (o.etapaPatio === 'pausado_gargalo' || o.st === 'peca') {
      stLabel = 'Pausado / Peça';
      stColor = '#e2445c';
    } else if (o.etapaPatio === 'em_execucao' || o.st === 'executando') {
      stLabel = 'Em Execução';
      stColor = '#00c875';
    } else if (o.etapaPatio === 'pronto_retirada' || o.st === 'finalizada') {
      stLabel = 'Pronto / Concluído';
      stColor = '#00a35c';
    } else if (o.st === 'aprovacao') {
      stLabel = 'Orçamento / Aprovação';
      stColor = '#fdab3d';
    }

    const stChk = o.statusChecklist || (o.checklistTecnico && o.checklistTecnico.status);
    const vistoriaTxt = stChk === 'aprovado' ? '🛡️ Vistoria OK' : (stChk === 'reprovado_critico' ? '⚠️ Falha' : '○ Pendente');
    const vistoriaCor = stChk === 'aprovado' ? '#047857' : (stChk === 'reprovado_critico' ? '#b91c1c' : '#64748b');

    return {
      id: o.id,
      raw: o,
      osInfo: `
        <div style="display:flex;align-items:center;gap:8px">
          <span class="placa" style="background:#e0f2fe;color:#0369a1;padding:2px 8px;border-radius:4px;font-weight:700">
            ${(v && v.placa) || o.placa || 'SEM-PLACA'}
          </span>
          <div>
            <div style="font-weight:700;color:var(--monday-text-dark,#323338)">OS #${o.num || o.id}</div>
            <div class="mini" style="color:#64748b">${(v && v.modelo) || 'Linha Pesada'}</div>
          </div>
        </div>
      `,
      cliente: `
        <span class="monday-chip monday-chip-blue" title="${(c && c.nome) || 'Cliente'}">
          <span>🏢</span>
          <span>${(c && (c.fantasia || c.nome)) || 'Cliente Particular'}</span>
        </span>
      `,
      box: (b && b.nome) ? `
        <span class="monday-chip monday-chip-purple">
          <span>🏗️</span>
          <span>${b.nome.split('—')[0].trim()}</span>
        </span>
      ` : '<span style="color:#94a3b8">Pátio Livre</span>',
      mecanico: o.mecanico ? `
        <span class="monday-chip monday-chip-amber">
          <span>👨‍🔧</span>
          <span>${o.mecanico}</span>
        </span>
      ` : '<span style="color:#94a3b8">—</span>',
      status: { label: stLabel, color: stColor },
      checklist: `
        <span style="font-size:11.5px;font-weight:600;color:${vistoriaCor}">
          ${vistoriaTxt}
        </span>
      `,
      total: total,
      whatsapp: (c && c.fone) || '',
      acoes: `
        <div style="display:inline-flex;gap:4px">
          <button class="btn btn-primario" data-act="abrir-os" data-id="${o.id}" style="font-size:11px;padding:3px 8px;height:26px" title="Abrir Folha da OS">
            Abrir OS
          </button>
          ${(o.etapaPatio === 'pausado_gargalo' || o.st === 'peca') ? `
            <button class="btn btn-sucesso" data-act="retomar-os-gargalo" data-id="${o.id}" style="font-size:11px;padding:3px 8px;height:26px" title="Retomar">▶️</button>
          ` : `
            <button class="btn btn-secundario" data-act="pausar-os-gargalo" data-id="${o.id}" style="font-size:11px;padding:3px 8px;height:26px;color:#b91c1c" title="Pausar por Gargalo">⏸</button>
          `}
          <button class="btn btn-secundario" data-act="copiar-aviso-os" data-id="${o.id}" style="font-size:11px;padding:3px 8px;height:26px" title="Copiar Aviso WhatsApp">📲</button>
        </div>
      `
    };
  };

  const osEntrada = filtradas.filter(o => o.st === 'fila' || o.st === 'aprovacao' || (!o.box && o.st !== 'finalizada'));
  const osExecucao = filtradas.filter(o => (o.st === 'executando' || o.etapaPatio === 'em_execucao') && o.etapaPatio !== 'pausado_gargalo');
  const osGargalo = filtradas.filter(o => o.st === 'peca' || o.etapaPatio === 'pausado_gargalo');
  const osFinalizadas = filtradas.filter(o => o.st === 'finalizada' || o.etapaPatio === 'pronto_retirada');

  const columns = [
    { key: 'osInfo', label: 'Veículo & OS', width: '210px' },
    { key: 'cliente', label: 'Cliente / Frota', width: '180px' },
    { key: 'box', label: 'Box Alocado', width: '140px' },
    { key: 'mecanico', label: 'Mecânico', width: '140px' },
    { key: 'status', label: 'Situação da OS', type: 'status', width: '160px', aggregator: 'distribution' },
    { key: 'checklist', label: 'Vistoria Técnica', width: '130px' },
    { key: 'total', label: 'Total Estimado', type: 'money', width: '130px', aggregator: 'sum' },
    { key: 'whatsapp', label: 'Contato Frotista', type: 'phone', width: '160px', flag: '🇧🇷' },
    { key: 'acoes', label: 'Ações Chão', type: 'actions', width: '160px', align: 'center' }
  ];

  const groups = [
    {
      id: 'execucao',
      title: 'Em Atendimento nos Boxes (Chão de Fábrica)',
      color: '#00c875',
      items: osExecucao.map(mapOSToMonday),
      addLabel: '+ Nova OS no Box',
      onAdd: "document.querySelector('[data-act=nova-os]')?.click() || (typeof abrirModalNovaOS==='function'&&abrirModalNovaOS())"
    },
    {
      id: 'gargalos',
      title: 'Atenção Operacional & Parados por Peça',
      color: '#e2445c',
      items: osGargalo.map(mapOSToMonday),
      addLabel: '+ Sinalizar Gargalo',
      onAdd: "torrada('Utilize o botão pausar na OS em atendimento para sinalizar gargalo.');"
    },
    {
      id: 'entrada',
      title: 'Triagem, Fila & Aguardando Aprovação',
      color: '#0086c0',
      items: osEntrada.map(mapOSToMonday),
      addLabel: '+ Nova Entrada de Veículo',
      onAdd: "document.querySelector('[data-act=nova-os]')?.click() || (typeof abrirModalNovaOS==='function'&&abrirModalNovaOS())"
    },
    {
      id: 'prontos',
      title: 'Vistoria Concluída & Prontos para Entrega',
      color: '#00a35c',
      items: osFinalizadas.map(mapOSToMonday),
      addLabel: '+ Consultar Histórico'
    }
  ];

  const safeEsc = typeof esc === 'function' ? esc : (s => String(s || ''));

  return fnBoard({
    title: 'Pátio Operacional & Boxes de Oficina',
    badge: `${filtradas.length} Veículos no Pátio`,
    views: [
      { id: 'monday', label: 'Quadro de Serviços', icon: '📋' },
      { id: 'boxes', label: 'Boxes Físicos', icon: '🏗️' }
    ],
    activeView: visao,
    onViewChange: `(function(v){if(!S.ui)S.ui={};S.ui.visaoPatio=v;if(typeof render==='function')render();})`,
    newButtonLabel: '+ Nova OS',
    onNewItem: "document.querySelector('[data-act=nova-os]')?.click() || (typeof abrirModalNovaOS==='function'&&abrirModalNovaOS())",
    onSearch: `(function(v){if(!S.ui)S.ui={};S.ui.buscaPlaca=v;if(typeof render==='function')render();})`,
    searchValue: safeEsc((typeof S !== 'undefined' && S?.ui?.buscaPlaca) || ''),
    groups: groups,
    columns: columns
  });
}

if (typeof window !== 'undefined') window.renderPatioBoardView = renderPatioBoardView;
if (typeof globalThis !== 'undefined') globalThis.renderPatioBoardView = renderPatioBoardView;

