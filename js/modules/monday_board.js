/* =====================================================================
   PÁTIO CRM — MOTOR REUTILIZÁVEL DE TABELAS & BOARDS MONDAY.COM
   Renderiza grids de alta densidade, grupos expansíveis, células de status
   sólidas, chips relacionais, métricas e rodapés agregadores automáticos.
===================================================================== */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.MondayBoard = factory();
    root.renderMondayBoard = root.MondayBoard.renderMondayBoard;
    root.toggleMondayGroup = root.MondayBoard.toggleMondayGroup;
  }
}(typeof self !== 'undefined' ? self : this, function () {

  /**
   * Alterna a expansão de um grupo Monday e salva o estado na UI
   */
  function toggleMondayGroup(groupId) {
    if (typeof S !== 'undefined' && S && S.ui) {
      if (!S.ui.mondayGroupsCollapsed) S.ui.mondayGroupsCollapsed = {};
      S.ui.mondayGroupsCollapsed[groupId] = !S.ui.mondayGroupsCollapsed[groupId];
    }
    const el = document.getElementById('m-group-' + groupId);
    if (el) {
      el.classList.toggle('collapsed');
    }
  }

  /**
   * Renderiza célula tipada do Monday
   */
  function renderCell(col, item, groupColor) {
    const val = item[col.key];
    const type = col.type || 'text';

    if (type === 'status') {
      const label = val?.label || val || '—';
      const color = val?.color || col.colorMap?.[val] || groupColor || '#0086c0';
      return `
        <div class="monday-status-pill" style="background:${color}" title="${label}">
          ${label}
        </div>
      `;
    }

    if (type === 'chip') {
      if (!val) return '<span style="color:#94a3b8">—</span>';
      const chipLabel = val.label || val;
      const chipIcon = val.icon || col.icon || '🏷️';
      const chipClass = val.class || col.chipClass || 'monday-chip-blue';
      return `
        <span class="monday-chip ${chipClass}">
          <span>${chipIcon}</span>
          <span>${chipLabel}</span>
        </span>
      `;
    }

    if (type === 'money') {
      const num = Number(val) || 0;
      const formatted = num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
      return `<span style="font-weight:600;font-variant-numeric:tabular-nums">${formatted}</span>`;
    }

    if (type === 'progress') {
      const pct = Math.max(0, Math.min(100, Number(val) || 0));
      const fillCol = pct >= 80 ? 'var(--monday-green, #00c875)' : (pct >= 40 ? 'var(--monday-blue, #0086c0)' : 'var(--monday-amber, #fdab3d)');
      return `
        <div class="monday-progress-cell">
          <div class="monday-progress-track">
            <div class="monday-progress-fill" style="width:${pct}%;background:${fillCol}"></div>
          </div>
          <span style="font-size:11px;font-weight:600;min-width:32px">${pct}%</span>
        </div>
      `;
    }

    if (type === 'stars') {
      const count = Math.max(0, Math.min(5, Math.round(Number(val) || 0)));
      let stars = '';
      for (let i = 1; i <= 5; i++) {
        stars += i <= count ? '★' : '☆';
      }
      return `<span class="monday-stars" title="${count} de 5 estrelas">${stars} <span style="font-size:11px;color:#94a3b8;margin-left:4px">(${count})</span></span>`;
    }

    if (type === 'phone') {
      if (!val) return '<span style="color:#94a3b8">—</span>';
      const limpo = String(val).replace(/\D/g, '');
      const flag = col.flag || '🇧🇷';
      return `
        <a class="monday-phone-pill" href="https://wa.me/55${limpo}" target="_blank" rel="noopener" title="Chamar no WhatsApp">
          <span class="monday-flag">${flag}</span>
          <span>${val}</span>
          <span style="font-size:12px">💬</span>
        </a>
      `;
    }

    if (type === 'actions') {
      if (typeof col.render === 'function') {
        return col.render(item);
      }
      return '';
    }

    if (typeof col.render === 'function') {
      return col.render(item);
    }

    return `<span>${val !== undefined && val !== null ? val : '—'}</span>`;
  }

  /**
   * Calcula rodapé agregador do grupo (Soma, Média e Barras)
   */
  function renderFooter(columns, items, groupColor) {
    if (!items || items.length === 0) return '';
    const footerItems = [];

    columns.forEach(col => {
      if (col.aggregator === 'sum') {
        const total = items.reduce((acc, curr) => acc + (Number(curr[col.key]) || 0), 0);
        const formatted = col.type === 'money'
          ? total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
          : total.toLocaleString('pt-BR');
        footerItems.push(`
          <div class="monday-footer-item">
            <span>${col.label}:</span>
            <span class="monday-footer-value">${formatted}</span>
            <span style="font-size:10px;text-transform:uppercase;color:#94a3b8">Soma</span>
          </div>
        `);
      } else if (col.aggregator === 'avg') {
        const total = items.reduce((acc, curr) => acc + (Number(curr[col.key]) || 0), 0);
        const avg = items.length ? (total / items.length) : 0;
        const formatted = col.type === 'progress' ? avg.toFixed(1) + '%' : avg.toFixed(1);
        footerItems.push(`
          <div class="monday-footer-item">
            <span>${col.label}:</span>
            <span class="monday-footer-value">${formatted}</span>
            <span style="font-size:10px;text-transform:uppercase;color:#94a3b8">Média</span>
          </div>
        `);
      } else if (col.aggregator === 'distribution' && col.type === 'status') {
        const dist = {};
        items.forEach(it => {
          const st = it[col.key]?.label || it[col.key] || 'Indefinido';
          dist[st] = (dist[st] || 0) + 1;
        });
        const segments = Object.keys(dist).map(st => {
          const pct = ((dist[st] / items.length) * 100).toFixed(1);
          const color = col.colorMap?.[st] || groupColor || '#0086c0';
          return `<div style="width:${pct}%;background:${color}" title="${st}: ${dist[st]} (${pct}%)"></div>`;
        }).join('');

        footerItems.push(`
          <div class="monday-footer-item">
            <span style="margin-right:4px">${col.label}:</span>
            <div class="monday-distribution-bar">${segments}</div>
          </div>
        `);
      }
    });

    if (footerItems.length === 0) {
      footerItems.push(`
        <div class="monday-footer-item">
          <span>Total de itens:</span>
          <span class="monday-footer-value">${items.length}</span>
        </div>
      `);
    }

    return `
      <div class="monday-footer-row">
        ${footerItems.join('')}
      </div>
    `;
  }

  /**
   * Renderiza um grupo individual do Monday
   */
  function renderGroup(group, columns, isCollapsed) {
    const { id, title, color = '#00c875', items = [], addLabel = '+ Adicionar' } = group;
    const collapsedClass = isCollapsed ? 'collapsed' : '';

    return `
      <div class="monday-group ${collapsedClass}" id="m-group-${id}">
        <div class="monday-group-header" onclick="toggleMondayGroup('${id}')">
          <div class="monday-group-title">
            <span class="monday-chevron" style="color:${color}">▼</span>
            <span class="monday-group-name" style="color:${color}">${title}</span>
            <span class="monday-group-count">${items.length}</span>
          </div>
          <div style="font-size:12px;color:var(--monday-text-muted)">
            <span title="Opções do grupo">•••</span>
          </div>
        </div>

        <div class="monday-table-container">
          <table class="monday-table">
            <thead>
              <tr>
                <th class="monday-th monday-row-indicator" style="background:${color};width:6px"></th>
                <th class="monday-th" style="width:36px;text-align:center">
                  <input type="checkbox" style="cursor:pointer">
                </th>
                ${columns.map(c => `
                  <th class="monday-th" style="${c.width ? `width:${c.width};min-width:${c.width}` : ''}">
                    ${c.label}
                  </th>
                `).join('')}
              </tr>
            </thead>
            <tbody>
              ${items.length === 0 ? `
                <tr>
                  <td colspan="${columns.length + 2}" style="padding:18px;text-align:center;color:#94a3b8;font-size:13px">
                    Nenhum registro neste grupo.
                  </td>
                </tr>
              ` : items.map((item, idx) => `
                <tr class="monday-row" data-id="${item.id || idx}">
                  <td class="monday-row-indicator" style="background:${color}"></td>
                  <td class="monday-cell" style="text-align:center">
                    <input type="checkbox" style="cursor:pointer" data-check="${item.id || idx}">
                  </td>
                  ${columns.map(col => `
                    <td class="monday-cell" style="${col.align ? `text-align:${col.align};` : ''}${col.width ? `width:${col.width};` : ''}">
                      ${renderCell(col, item, color)}
                    </td>
                  `).join('')}
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>

        ${group.onAdd ? `
          <div class="monday-add-row" onclick="${group.onAdd}">
            <span style="font-size:14px;margin-right:6px">+</span>
            <span>${addLabel}</span>
          </div>
        ` : ''}

        ${renderFooter(columns, items, color)}
      </div>
    `;
  }

  /**
   * Renderiza o Board completo do Monday com Toolbar, Views e Grupos
   */
  function renderMondayBoard(options) {
    const {
      title = 'Board',
      badge = '',
      views = [{ id: 'table', label: 'Tabela Principal', icon: '📋' }],
      activeView = 'table',
      onViewChange = '',
      newButtonLabel = '+ Novo Item',
      onNewItem = '',
      onSearch = '',
      searchValue = '',
      onAutomationsClick = 'abrirCentroAutomacoes()',
      groups = [],
      columns = [],
      extraTools = ''
    } = options;

    const collapsedState = (typeof S !== 'undefined' && S && S.ui && S.ui.mondayGroupsCollapsed) || {};

    return `
      <div class="monday-board-wrapper">
        <!-- Topo do Board -->
        <div class="monday-board-header">
          <div class="monday-board-title">
            <h1>${title}</h1>
            ${badge ? `<span style="font-size:12px;padding:3px 10px;border-radius:12px;background:#e0f2fe;color:#0369a1;font-weight:600">${badge}</span>` : ''}
          </div>
          <div class="monday-board-meta">
            <button class="monday-btn-automations" onclick="${onAutomationsClick}">
              <span>⚡</span>
              <span>Automações</span>
            </button>
            ${extraTools}
          </div>
        </div>

        <!-- Abas de Visões (Main Table, Cards, etc.) -->
        <div class="monday-views-bar">
          ${views.map(v => `
            <button class="monday-view-tab ${v.id === activeView ? 'active' : ''}" 
                    onclick="${onViewChange ? `${onViewChange}('${v.id}')` : ''}">
              <span>${v.icon || '📄'}</span>
              <span>${v.label}</span>
            </button>
          `).join('')}
          <button class="monday-view-tab" style="color:#94a3b8" title="Nova visualização">+</button>
        </div>

        <!-- Toolbar de Ações & Filtros -->
        <div class="monday-toolbar">
          <div class="monday-toolbar-left">
            ${onNewItem ? `
              <button class="monday-btn-new" onclick="${onNewItem}">
                <span>${newButtonLabel}</span>
                <span style="font-size:10px">▼</span>
              </button>
            ` : ''}

            <div class="monday-search-box">
              <span>🔍</span>
              <input type="text" placeholder="Buscar no board..." value="${searchValue}" 
                     oninput="${onSearch ? `${onSearch}(this.value)` : ''}">
            </div>

            <button class="monday-tool-btn" title="Filtrar registros">
              <span>⚡</span>
              <span>Filtrar</span>
            </button>

            <button class="monday-tool-btn" title="Agrupar colunas">
              <span>🔀</span>
              <span>Agrupar</span>
            </button>
          </div>
        </div>

        <!-- Renderização dos Grupos do Board -->
        <div class="monday-groups-container">
          ${groups.map(g => renderGroup(g, columns, !!collapsedState[g.id])).join('')}
        </div>
      </div>
    `;
  }

  return {
    renderMondayBoard,
    toggleMondayGroup,
    renderCell,
    renderGroup,
    renderFooter
  };
}));

