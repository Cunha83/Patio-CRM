/* =====================================================================
   PÁTIO CRM — NAVEGAÇÃO, TOPO & ONBOARDING (FRONTEND MODULE)
===================================================================== */

/* ---------------- Casca & Navegação ---------------- */
function renderNav() {
  const role = (S.user && S.user.role) || S.perfil || 'admin';
  const v = S.ui.view || 'patio';
  const perfil = (S.ui && S.ui.perfilAtivo) || role;

  // Mapa de permissões por perfil
  const viewsPermitidasPorRole = {
    mecanico: ['operacao', 'patio', 'estoque'],
    vendedor: ['operacao', 'patio', 'vendas', 'mensagens', 'estoque', 'cadastros'],
    caixa: ['painel', 'vendas', 'compras', 'financeiro', 'fiscal', 'cadastros'],
    admin: ['operacao', 'patio', 'painel', 'vendas', 'mensagens', 'estoque', 'compras', 'financeiro', 'fiscal', 'cadastros', 'relatorios', 'configuracoes']
  };

  const roleEfetiva = role === 'admin' && (perfil === 'mecanico' || perfil === 'vendedor' || perfil === 'caixa') ? perfil : role;
  const allowed = viewsPermitidasPorRole[roleEfetiva] || viewsPermitidasPorRole.admin;
  if (!allowed.includes(v)) {
    S.ui.view = allowed[0] || 'patio';
  }

  // Grupos semânticos
  const grupos = [
    {
      titulo: 'Operação',
      itens: [
        { id: 'operacao', label: 'Operação em Tempo Real', icone: 'relogio', roles: ['admin', 'mecanico', 'vendedor'] },
        { id: 'patio', label: 'Pátio & Boxes', icone: 'patio', roles: ['admin', 'mecanico', 'vendedor'] }
      ]
    },
    {
      titulo: 'Comercial & CRM',
      itens: [
        { id: 'vendas', label: 'Vendas (Balcão & OS)', icone: 'carrinho', roles: ['admin', 'vendedor', 'caixa'] },
        { id: 'mensagens', label: 'WhatsApp & CRM', icone: 'zap', roles: ['admin', 'vendedor'] },
        { id: 'painel', label: 'Painel & KPIs', icone: 'painel', roles: ['admin', 'caixa'] }
      ]
    },
    {
      titulo: 'Suprimentos',
      itens: [
        { id: 'estoque', label: 'Almoxarifado', icone: 'pecas', roles: ['admin', 'mecanico', 'vendedor'] },
        { id: 'compras', label: 'Compras & Entrada NF-e', icone: 'doc', roles: ['admin', 'caixa'] }
      ]
    },
    {
      titulo: 'Gestão',
      itens: [
        { id: 'financeiro', label: 'Financeiro', icone: 'fin', roles: ['admin', 'caixa'] },
        { id: 'fiscal', label: 'Notas fiscais', icone: 'relatorios', roles: ['admin', 'caixa'] },
        { id: 'relatorios', label: 'Relatórios & Backup', icone: 'relatorios', roles: ['admin'] }
      ]
    },
    {
      titulo: 'Configurações',
      itens: [
        { id: 'cadastros', label: 'Cadastros & Frotas', icone: 'cad', roles: ['admin', 'vendedor', 'caixa'] },
        { id: 'configuracoes', label: 'Configurações', icone: 'cfg', roles: ['admin'] }
      ]
    }
  ];

  const logoSrc = (S.cfg && S.cfg.identidadeVisual && (S.cfg.identidadeVisual.logoUrl || S.cfg.identidadeVisual.logo)) || (S.cfg && S.cfg.logoEmpresa);

  const seletorPerfilHtml = role === 'admin' ? `
  <div style="padding:10px 14px 6px 14px;border-bottom:1px solid rgba(255,255,255,0.06)">
    <div style="font-size:10px;text-transform:uppercase;letter-spacing:0.06em;color:var(--aco-400);font-weight:700;margin-bottom:4px">Perfil de Trabalho</div>
    <select class="campo" data-act="mudar-perfil" style="height:28px;font-size:11.5px;padding:2px 6px;background:var(--aco-800);color:#fff;border:1px solid var(--aco-600);border-radius:4px;width:100%;cursor:pointer">
      <option value="admin" ${perfil === 'admin' || perfil === 'todos' ? 'selected' : ''}>👑 Gerente Geral (Tudo)</option>
      <option value="vendedor" ${perfil === 'vendedor' ? 'selected' : ''}>💼 Consultor / Vendedor</option>
      <option value="caixa" ${perfil === 'caixa' ? 'selected' : ''}>💳 Financeiro / Caixa</option>
      <option value="mecanico" ${perfil === 'mecanico' ? 'selected' : ''}>🔧 Mecânico / Box</option>
    </select>
  </div>` : `
  <div style="padding:8px 14px;border-bottom:1px solid rgba(255,255,255,0.06);display:flex;align-items:center;gap:6px">
    <span style="font-size:14px">${role === 'mecanico' ? '🔧' : (role === 'vendedor' ? '💼' : '💳')}</span>
    <span style="font-size:11px;color:#94a3b8;font-weight:600">${role === 'mecanico' ? 'Mecânico de Pátio' : (role === 'vendedor' ? 'Consultor de Vendas' : 'Operador Caixa')}</span>
  </div>`;

  const html = `
  <div class="nav-marca">
    <div class="chapa" style="display:flex;align-items:center;justify-content:center;overflow:hidden">
      ${logoSrc ? `<img src="${esc(logoSrc)}" alt="Logo" style="max-height:24px;max-width:28px;object-fit:contain">` : ico('patio', 18)}
    </div>
    <div>
      <div style="font-weight:700;font-size:14px;color:#fff;line-height:1.2">${esc((S.cfg && S.cfg.empresa) || 'PÁTIO DIESEL')}</div>
      <div style="font-size:11px;color:var(--aco-400)">Gestão de Oficina Pesada</div>
    </div>
  </div>

  ${seletorPerfilHtml}

  <div class="nav-links">
    ${grupos.map(g => {
      const visiveis = g.itens.filter(item => (item.id !== 'fiscal' || window.patioFiscalAvailable) && (roleEfetiva === 'admin' || item.roles.includes(roleEfetiva)));
      if (visiveis.length === 0) return '';
      return `
        <div class="nav-grupo-titulo">${g.titulo}</div>
        ${visiveis.map(item => `
          <button class="nav-link ${v === item.id ? 'ativo' : ''}" data-act="${item.id === 'fiscal' ? 'fiscal-open' : 'ir'}" data-v="${item.id}">
            ${ico(item.icone, 16)}
            <span>${item.label}</span>
          </button>
        `).join('')}
      `;
    }).join('')}
  </div>

  <div class="nav-rodape">
    <div class="mini" style="color:var(--aco-400);font-size:11px">Pátio CRM v2.5</div>
    <div id="status-salvo" style="color:var(--verde);font-size:11px;font-weight:600;min-height:16px">● Salvo localmente</div>
  </div>`;

  const navEl = document.getElementById('nav');
  if (navEl) navEl.innerHTML = html;
}

function renderTopo() {
  const v = S.ui.view || 'patio';
  const role = (S.user && S.user.role) || S.perfil || 'admin';
  const perfil = (S.ui && S.ui.perfilAtivo) || role;

  const perfilBadges = {
    admin: { label: '👑 Gerente Geral', cor: '#3b82f6' },
    vendedor: { label: '💼 Consultor', cor: '#10b981' },
    caixa: { label: '💳 Caixa', cor: '#f59e0b' },
    mecanico: { label: '🔧 Mecânico', cor: '#ef4444' }
  };
  const badgeAtual = perfilBadges[role] || { label: 'Operador', cor: '#64748b' };

  const titulos = {
    operacao: { tit: 'Dashboard Operacional em Tempo Real', icone: 'relogio', novo: 'nova-os', novoLabel: '+ Nova OS' },
    patio: { tit: 'Pátio Operacional & Boxes', icone: 'patio', novo: 'nova-os', novoLabel: '+ Nova OS' },
    painel: { tit: 'Painel Inicial Executivo & KPIs', icone: 'painel', novo: 'nova-os', novoLabel: '+ Nova OS' },
    estoque: { tit: 'Catálogo de Produtos & Almoxarifado', icone: 'pecas', novo: 'novo-produto', novoLabel: '+ Novo Produto' },
    vendas: { tit: 'Vendas & Ordens de Serviço', icone: 'carrinho', novo: 'nova-venda', novoLabel: '+ Nova Venda' },
    compras: { tit: 'Compras & Entrada de Notas (XML)', icone: 'doc', novo: 'nova-compra', novoLabel: '+ Nova Compra' },
    financeiro: { tit: 'Gestão Financeira & DRE Gerencial', icone: 'fin', novo: 'novo-lancamento', novoLabel: '+ Lançamento' },
    fiscal: { tit: 'Central Fiscal (NF-e, NFC-e, NFS-e, MDF-e)', icone: 'relatorios', novo: 'fiscal-novo', novoLabel: '+ Novo Documento' },
    mensagens: { tit: 'Comunicação WhatsApp & Régua de Cobrança', icone: 'zap', novo: 'novo-disparo', novoLabel: '+ Nova Mensagem' },
    cadastros: { tit: 'Cadastros Unificados & Frotas', icone: 'cad', novo: 'novo-cliente', novoLabel: '+ Novo Contato' },
    relatorios: { tit: 'Central de Relatórios & Exportações', icone: 'relatorios', novo: 'exportar-dados', novoLabel: 'Exportar Relatório' },
    configuracoes: { tit: 'Super-Menu de Configurações da Oficina', icone: 'cfg', novo: 'salvar-cfg', novoLabel: 'Salvar Configurações' }
  };

  const infoAtual = titulos[v] || { tit: 'Pátio CRM', icone: 'patio', novo: 'nova-os', novoLabel: '+ Nova OS' };
  const logoSrc = (S.cfg && S.cfg.identidadeVisual && (S.cfg.identidadeVisual.logoUrl || S.cfg.identidadeVisual.logo)) || (S.cfg && S.cfg.logoEmpresa);
  const empresaNome = (S.cfg && S.cfg.empresa) || 'PÁTIO DIESEL';
  const usuarioNome = (S.user && S.user.nome) || (S.user && S.user.name) || (S.cfg && S.cfg.usuarios && S.cfg.usuarios[0] && S.cfg.usuarios[0].nome) || 'Administrador';

  return `
  <!-- TOPBAR GLOBAL INTELIGENTE -->
  <header class="topbar-enterprise">
    <!-- Esquerda: Logo & Empresa -->
    <div style="display:flex;align-items:center;gap:12px">
      <div class="chapa" style="display:flex;align-items:center;justify-content:center;overflow:hidden;border-radius:6px;width:34px;height:34px">
        ${logoSrc ? `<img src="${esc(logoSrc)}" alt="Logo" style="max-height:24px;max-width:28px;object-fit:contain">` : ico('patio', 18)}
      </div>
      <div>
        <div style="font-weight:700;font-size:14px;color:#fff;line-height:1.2;display:flex;align-items:center;gap:6px">
          <span>${esc(empresaNome)}</span>
          ${(S._isDemo || (S.cfg && S.cfg.empresa && S.cfg.empresa.includes('Demonstração'))) ? '<span style="background:#eab308;color:#000;font-size:9.5px;font-weight:800;padding:1px 5px;border-radius:4px">DEMO</span>' : ''}
        </div>
        <div style="font-size:11px;color:#94a3b8">Sistema de Gestão de Veículos Pesados</div>
      </div>
    </div>

    <!-- Centro: Barra de Busca Global com Prefixos -->
    <div class="busca-global-wrap" style="position:relative">
      <span class="busca-global-ico">${ico('lupa', 15)}</span>
      <input type="text" id="campo-busca-global" class="busca-global-input" 
             placeholder="Busca global ou prefixos (em:vendas, em:compras, em:clientes, em:produtos)..." 
             oninput="aoDigitarBuscaGlobal(this.value)"
             onkeydown="if(event.key==='Enter'){executarBuscaGlobal(this.value)}"
             title="Use prefixos contextuais como em:vendas, em:compras, em:clientes, em:produtos, em:nfe ou em:patio">
      <span class="busca-global-atalho">Ctrl+K</span>
      <div id="busca-global-popover" style="display:none;position:absolute;top:100%;left:0;right:0;margin-top:4px;background:#ffffff;border:1px solid #cbd5e1;border-radius:8px;box-shadow:0 10px 25px rgba(0,0,0,0.15);max-height:360px;overflow-y:auto;z-index:99999;"></div>
    </div>

    <!-- Direita: Perfil do Usuário com Dropdown + Botão Rápido + Novo -->
    <div style="display:flex;align-items:center;gap:10px">
      <!-- Dropdown do Usuário -->
      <div class="user-dropdown-wrap" style="position:relative">
        <button type="button" onclick="toggleDropdownUsuario()" style="background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);border-radius:6px;padding:4px 10px;cursor:pointer;display:flex;align-items:center;gap:8px;text-align:right">
          <div style="width:26px;height:26px;border-radius:50%;background:var(--brand-primary, #0f766e);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:12px">
            ${esc(usuarioNome.charAt(0).toUpperCase())}
          </div>
          <div style="display:flex;flex-direction:column;align-items:flex-end">
            <span style="font-size:12px;font-weight:700;color:#fff">${esc(usuarioNome)}</span>
            <div style="display:inline-flex;align-items:center;gap:4px;font-size:10px;color:#94a3b8">
              <span style="width:6px;height:6px;border-radius:50%;background:${badgeAtual.cor}"></span>
              <span>${esc(badgeAtual.label)}</span>
            </div>
          </div>
          <span style="color:#94a3b8;font-size:10px">▾</span>
        </button>

        <div id="dropdown-usuario-menu" style="display:none;position:absolute;top:100%;right:0;margin-top:6px;background:#ffffff;border:1px solid #cbd5e1;border-radius:8px;box-shadow:0 10px 25px rgba(0,0,0,0.15);min-width:210px;z-index:99999;padding:6px 0">
          <div style="padding:8px 14px;border-bottom:1px solid #f1f5f9">
            <div style="font-size:12.5px;font-weight:700;color:#0f172a">${esc(usuarioNome)}</div>
            <div style="font-size:11px;color:#64748b">${esc(badgeAtual.label)} · ${esc(empresaNome)}</div>
          </div>
          <button class="dropdown-item" onclick="toggleDropdownUsuario();abrirModalLogin()" style="width:100%;text-align:left;padding:8px 14px;background:none;border:none;font-size:12.5px;cursor:pointer;display:flex;align-items:center;gap:8px;color:#0f172a">
            <span>🔄</span> <span>Trocar Usuário / Login</span>
          </button>
          <button class="dropdown-item" onclick="toggleDropdownUsuario();fazerLogout()" style="width:100%;text-align:left;padding:8px 14px;background:none;border:none;font-size:12.5px;cursor:pointer;display:flex;align-items:center;gap:8px;color:#dc2626">
            <span>🚪</span> <span>Sair da Sessão</span>
          </button>
        </div>
      </div>

      <!-- Dropdown Rápido + Novo -->
      <div class="dropdown-novo-wrap">
        <button class="btn btn-primario" type="button" onclick="toggleDropdownNovo()" style="height:34px;font-size:12.5px;padding:0 14px;font-weight:700;display:inline-flex;align-items:center;gap:6px;box-shadow:0 2px 6px rgba(0,0,0,0.2)">
          ${ico('mais', 14)} <span>+ Novo</span> <span style="font-size:10px">▾</span>
        </button>
        <div id="dropdown-novo-menu" class="dropdown-novo-menu">
          ${role === 'mecanico' ? `
            <button class="dropdown-item" onclick="toggleDropdownNovo();abrirModalNovaOS()">
              ${ico('patio', 16)} <span>Nova Ordem de Serviço (OS)</span>
            </button>
          ` : role === 'vendedor' ? `
            <button class="dropdown-item" onclick="toggleDropdownNovo();abrirModalNovaOS()">
              ${ico('patio', 16)} <span>Nova Ordem de Serviço (OS)</span>
            </button>
            <button class="dropdown-item" onclick="toggleDropdownNovo();abrirModalNovaVenda()">
              ${ico('carrinho', 16)} <span>Nova Venda / Pedido</span>
            </button>
            <button class="dropdown-item" onclick="toggleDropdownNovo();abrirModalNovoCliente()">
              ${ico('gente', 16)} <span>Novo Cliente / Frota</span>
            </button>
          ` : role === 'caixa' ? `
            <button class="dropdown-item" onclick="toggleDropdownNovo();abrirModalNovaVenda()">
              ${ico('carrinho', 16)} <span>Nova Venda / Pedido</span>
            </button>
            <button class="dropdown-item" onclick="toggleDropdownNovo();abrirModalNovoCliente()">
              ${ico('gente', 16)} <span>Novo Cliente / Frota</span>
            </button>
            <button class="dropdown-item" onclick="toggleDropdownNovo();abrirModalNovoLancamento('pagar')">
              ${ico('grana', 16)} <span>Nova Despesa / Conta a Pagar</span>
            </button>
          ` : `
            <button class="dropdown-item" onclick="toggleDropdownNovo();abrirModalNovaOS()">
              ${ico('patio', 16)} <span>Nova Ordem de Serviço (OS)</span>
            </button>
            <button class="dropdown-item" onclick="toggleDropdownNovo();abrirModalNovaVenda()">
              ${ico('carrinho', 16)} <span>Nova Venda / Pedido</span>
            </button>
            <button class="dropdown-item" onclick="toggleDropdownNovo();abrirModalNovoCliente()">
              ${ico('gente', 16)} <span>Novo Cliente / Frota</span>
            </button>
            <button class="dropdown-item" onclick="toggleDropdownNovo();abrirModalNovoLancamento('pagar')">
              ${ico('grana', 16)} <span>Nova Despesa / Conta a Pagar</span>
            </button>
          `}
        </div>
      </div>
    </div>
  </header>

  <!-- FAIXA SUB-HEADER CONTEXTUAL -->
  <div class="sub-header-contextual" style="margin: 12px 16px 14px 16px">
    <h2>
      ${ico(infoAtual.icone, 18)}
      <span>${esc(infoAtual.tit)}</span>
    </h2>
    <div class="sub-header-acoes">
      <button class="btn btn-neutro" onclick="abrirTutorialModulo('${v}')" style="background:rgba(255,255,255,0.12);color:#fff;border:1px solid rgba(255,255,255,0.2);font-size:12px;padding:6px 12px;display:inline-flex;align-items:center;gap:6px">
        ${ico('livro', 14)} <span>Tutoriais</span>
      </button>
      <button class="btn btn-primario" data-act="${infoAtual.novo}" style="font-size:12px;padding:6px 14px;display:inline-flex;align-items:center;gap:6px;font-weight:700">
        ${ico('mais', 14)} <span>${esc(infoAtual.novoLabel)}</span>
      </button>
    </div>
  </div>`;
}

// Mecanismo de Busca Global com Suporte a Prefixos Contextuais
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
function toggleDropdownNovo() {
  const el = document.getElementById('dropdown-novo-menu');
  if (el) el.classList.toggle('aberto');
}

// Fecha dropdowns se clicar fora
if (typeof document !== 'undefined') {
  document.addEventListener('click', (e) => {
    const wrap = e.target.closest('.dropdown-novo-wrap');
    if (!wrap) {
      const el = document.getElementById('dropdown-novo-menu');
      if (el && el.classList.contains('aberto')) el.classList.remove('aberto');
    }
    const buscaWrap = e.target.closest('.busca-global-wrap');
    if (!buscaWrap) {
      const popover = document.getElementById('busca-global-popover');
      if (popover) popover.style.display = 'none';
    }
  });

  // Atalho global Ctrl+K para busca
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      const input = document.getElementById('campo-busca-global');
      if (input) {
        input.focus();
        input.select();
      }
    }
  });
}

// Modal / Toast de Tutoriais do Módulo
function abrirTutorialModulo(view) {
  const dicas = {
    patio: 'Dica do Pátio: Arraste os cards entre as colunas para atualizar o status do box. Clique sobre o veículo para editar serviços e peças.',
    vendas: 'Dica de Vendas: Utilize as abas de Vendas e Devoluções para separar faturamento e devoluções de balcão. O botão WhatsApp envia o link direto ao cliente.',
    compras: 'Dica de Compras: Arraste um arquivo XML da SEFAZ para importar o cabeçalho, duplicatas e dar entrada automática no estoque.',
    estoque: 'Dica de Almoxarifado: Controle estoque mínimo de molas e peças críticas. Itens com estoque zerado são sinalizados em vermelho.',
    financeiro: 'Dica Financeira: Acompanhe o DRE gerencial do mês e concilie boletos e Pix diretamente pela régua automatizada.',
    fiscal: 'Dica Fiscal: Emita NF-e de peças ou NFS-e de mão de obra a partir de qualquer Ordem de Serviço concluída com um clique.',
    cadastros: 'Dica de Cadastros: Cadastre transportadores e fornecedores vinculando tags de segmento para acelerar emissões e orçamentos.'
  };
  const msg = dicas[view] || 'Pátio CRM: Tecnologia inovadora para gestão completa e alta lucratividade em oficinas mecânicas pesadas.';
  if (typeof torrar === 'function') torrar(msg);
  else alert(msg);
}

function renderOnboardingBanner() {
  if (S.cfg && S.cfg.onboardingConcluido) return '';

  const dadosOficinaOk = Boolean(S.cfg && S.cfg.empresa && (S.cfg.cnpj || S.cfg.fone));
  const veiculoOuClienteOk = Boolean((S.veiculos && S.veiculos.length > 0) || (S.clientes && S.clientes.length > 0));
  const osOk = Boolean(S.os && S.os.length > 0);
  const pecasOk = Boolean((S.pecas && S.pecas.length > 0) || (S.servicos && S.servicos.length > 0));

  const totalPassos = 4;
  const concluidos = [dadosOficinaOk, veiculoOuClienteOk, osOk, pecasOk].filter(Boolean).length;
  const pct = Math.round((concluidos / totalPassos) * 100);

  const temDemo = Boolean(
    (S.clientes && S.clientes.some(c => c._isDemo)) ||
    (S.veiculos && S.veiculos.some(v => v._isDemo)) ||
    (S.os && S.os.some(o => o._isDemo))
  );

  return `
  <div class="onboarding-banner" style="margin-bottom:16px">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:12px">
      <div style="flex:1;min-width:280px">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
          <span style="background:var(--azul, #2563eb);color:#fff;font-weight:700;font-size:11px;padding:2px 8px;border-radius:10px">Guia de Implantação</span>
          <strong style="color:#fff;font-size:14px">Bem-vindo ao Pátio CRM!</strong>
        </div>
        <div class="mini" style="color:var(--aco-300);margin-bottom:10px">
          Complete os passos essenciais para ativar sua oficina ou explore o sistema com dados de teste.
        </div>

        <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(180px, 1fr));gap:8px;margin-bottom:12px">
          <div class="checklist-item">
            <span style="color:${dadosOficinaOk ? 'var(--verde)' : 'var(--aco-400)'};font-weight:bold">${dadosOficinaOk ? '✔' : '○'}</span>
            <span style="color:${dadosOficinaOk ? '#fff' : 'var(--aco-300)'}">1. Dados da Oficina</span>
          </div>
          <div class="checklist-item">
            <span style="color:${veiculoOuClienteOk ? 'var(--verde)' : 'var(--aco-400)'};font-weight:bold">${veiculoOuClienteOk ? '✔' : '○'}</span>
            <span style="color:${veiculoOuClienteOk ? '#fff' : 'var(--aco-300)'}">2. Primeiro Cliente/Frota</span>
          </div>
          <div class="checklist-item">
            <span style="color:${osOk ? 'var(--verde)' : 'var(--aco-400)'};font-weight:bold">${osOk ? '✔' : '○'}</span>
            <span style="color:${osOk ? '#fff' : 'var(--aco-300)'}">3. Primeira Ordem de Serviço</span>
          </div>
          <div class="checklist-item">
            <span style="color:${pecasOk ? 'var(--verde)' : 'var(--aco-400)'};font-weight:bold">${pecasOk ? '✔' : '○'}</span>
            <span style="color:${pecasOk ? '#fff' : 'var(--aco-300)'}">4. Tabela Peças/Serviços</span>
          </div>
        </div>

        <div style="background:rgba(255,255,255,0.1);height:6px;border-radius:3px;overflow:hidden;max-width:320px;margin-bottom:8px">
          <div style="background:var(--verde);width:${pct}%;height:100%;transition:width 0.3s"></div>
        </div>
        <div class="mini" style="color:var(--aco-300)">Progresso: ${pct}% concluído</div>
      </div>

      <div style="display:flex;flex-direction:column;gap:6px;align-self:center">
        ${!temDemo ? `
          <button class="btn btn-neutro btn-pequeno" data-act="carregar-demo" style="white-space:nowrap">
            ${ico('pecas', 14)} Carregar Dados Demo
          </button>
        ` : `
          <button class="btn btn-perigo btn-pequeno" data-act="remover-demo" style="white-space:nowrap">
            Remover Dados Demo
          </button>
        `}
        <button class="btn btn-primario btn-pequeno" data-act="concluir-onboarding" style="white-space:nowrap">
          Concluir Onboarding
        </button>
      </div>
    </div>
  </div>`;
}

/* ---------------- Gestão de Sessão, RBAC & Login White-Label ---------------- */
function toggleDropdownNovo() {
  const el = document.getElementById('dropdown-novo-menu');
  if (el) {
    el.style.display = el.style.display === 'none' || !el.style.display ? 'block' : 'none';
  }
}

function toggleDropdownUsuario() {
  const el = document.getElementById('dropdown-usuario-menu');
  if (el) {
    el.style.display = el.style.display === 'none' || !el.style.display ? 'block' : 'none';
  }
}

if (typeof document !== 'undefined') {
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.dropdown-novo-wrap')) {
      const el = document.getElementById('dropdown-novo-menu');
      if (el) el.style.display = 'none';
    }
    if (!e.target.closest('.user-dropdown-wrap')) {
      const el = document.getElementById('dropdown-usuario-menu');
      if (el) el.style.display = 'none';
    }
  });
}

function abrirModalLogin() {
  const empresa = (S && S.cfg && S.cfg.empresa) || 'PÁTIO CRM';
  const logoSrc = (S && S.cfg && S.cfg.identidadeVisual && (S.cfg.identidadeVisual.logoUrl || S.cfg.identidadeVisual.logo)) || '';

  const html = `
  <div class="login-modal-overlay" id="patio-login-overlay" style="position:fixed;inset:0;background:rgba(15,23,42,0.85);backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;z-index:999999;padding:16px">
    <div class="login-modal-card" style="background:#ffffff;border-radius:14px;box-shadow:0 25px 50px -12px rgba(0,0,0,0.25);width:100%;max-width:460px;overflow:hidden;border:1px solid #e2e8f0">
      
      <!-- Topo com Identidade White-Label -->
      <div style="background:linear-gradient(135deg, var(--brand-primary, #0f766e), #042f2e);padding:24px;text-align:center;color:#ffffff">
        <div style="width:56px;height:56px;border-radius:12px;background:#ffffff;display:inline-flex;align-items:center;justify-content:center;margin-bottom:10px;box-shadow:0 4px 10px rgba(0,0,0,0.15);overflow:hidden">
          ${logoSrc ? `<img src="${logoSrc}" style="max-width:85%;max-height:85%;object-fit:contain">` : '<span style="font-size:28px">🚛</span>'}
        </div>
        <h2 style="margin:0 0 4px 0;font-size:19px;font-weight:800;letter-spacing:-0.02em">${esc(empresa)}</h2>
        <div style="font-size:12px;color:rgba(255,255,255,0.8);font-weight:500">Gestão de Oficina Pesada · Autenticação Segura</div>
      </div>

      <div style="padding:22px 24px">
        <!-- Formulário de Login -->
        <form id="form-login-patio" onsubmit="event.preventDefault();submeterFormLogin()" style="display:flex;flex-direction:column;gap:12px">
          <div id="login-alerta-erro" style="display:none;background:#fef2f2;border:1px solid #fecaca;color:#991b1b;padding:8px 12px;border-radius:6px;font-size:12.5px;font-weight:600"></div>

          <div>
            <label style="display:block;font-size:12px;font-weight:700;color:#334155;margin-bottom:4px">Usuário ou E-mail:</label>
            <input type="text" id="login-campo-user" class="campo-texto" placeholder="admin, vendedor, caixa, mecanico" style="width:100%;height:38px;font-size:13.5px;padding:0 12px;border:1px solid #cbd5e1;border-radius:6px" required autofocus>
          </div>

          <div>
            <label style="display:block;font-size:12px;font-weight:700;color:#334155;margin-bottom:4px">Senha de Acesso:</label>
            <input type="password" id="login-campo-pass" class="campo-texto" placeholder="••••••••" style="width:100%;height:38px;font-size:13.5px;padding:0 12px;border:1px solid #cbd5e1;border-radius:6px" required>
          </div>

          <button type="submit" id="btn-login-entrar" class="btn btn-primario" style="height:40px;font-size:14px;font-weight:700;margin-top:4px;display:flex;align-items:center;justify-content:center;gap:6px">
            <span>Entrar no Sistema</span> <span>➔</span>
          </button>
        </form>

        <!-- Divisor 1-Click Teste -->
        <div style="display:flex;align-items:center;margin:18px 0 14px 0">
          <div style="flex:1;height:1px;background:#e2e8f0"></div>
          <span style="padding:0 10px;font-size:10.5px;text-transform:uppercase;letter-spacing:0.05em;color:#64748b;font-weight:700">Acesso Rápido de Teste (1-Click)</span>
          <div style="flex:1;height:1px;background:#e2e8f0"></div>
        </div>

        <!-- 4 Botões de Teste Rápido -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
          <button type="button" onclick="loginRapido('admin', 'admin123')" class="btn-login-rapido" style="padding:8px 10px;border:1px solid #cbd5e1;border-radius:8px;background:#f8fafc;cursor:pointer;text-align:left;display:flex;align-items:center;gap:8px">
            <span style="font-size:18px">👑</span>
            <div>
              <div style="font-size:12px;font-weight:700;color:#0f172a">Gerente Geral</div>
              <div style="font-size:10px;color:#64748b">admin (tudo liberado)</div>
            </div>
          </button>

          <button type="button" onclick="loginRapido('vendedor', 'vendedor123')" class="btn-login-rapido" style="padding:8px 10px;border:1px solid #cbd5e1;border-radius:8px;background:#f8fafc;cursor:pointer;text-align:left;display:flex;align-items:center;gap:8px">
            <span style="font-size:18px">💼</span>
            <div>
              <div style="font-size:12px;font-weight:700;color:#0f172a">Consultor Vendas</div>
              <div style="font-size:10px;color:#64748b">vendedor (comercial)</div>
            </div>
          </button>

          <button type="button" onclick="loginRapido('caixa', 'caixa123')" class="btn-login-rapido" style="padding:8px 10px;border:1px solid #cbd5e1;border-radius:8px;background:#f8fafc;cursor:pointer;text-align:left;display:flex;align-items:center;gap:8px">
            <span style="font-size:18px">💳</span>
            <div>
              <div style="font-size:12px;font-weight:700;color:#0f172a">Caixa / Fin.</div>
              <div style="font-size:10px;color:#64748b">caixa (pagar/receber)</div>
            </div>
          </button>

          <button type="button" onclick="loginRapido('mecanico', 'mecanico123')" class="btn-login-rapido" style="padding:8px 10px;border:1px solid #cbd5e1;border-radius:8px;background:#f8fafc;cursor:pointer;text-align:left;display:flex;align-items:center;gap:8px">
            <span style="font-size:18px">🔧</span>
            <div>
              <div style="font-size:12px;font-weight:700;color:#0f172a">Mecânico Box</div>
              <div style="font-size:10px;color:#64748b">mecanico (pátio/peças)</div>
            </div>
          </button>
        </div>

      </div>
    </div>
  </div>
  `;

  let container = document.getElementById('modal-login-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'modal-login-container';
    document.body.appendChild(container);
  }
  container.innerHTML = html;
}

function fecharModalLogin() {
  const el = document.getElementById('modal-login-container');
  if (el) el.innerHTML = '';
}

async function submeterFormLogin() {
  const u = document.getElementById('login-campo-user')?.value || '';
  const p = document.getElementById('login-campo-pass')?.value || '';
  await fazerLogin(u, p);
}

function loginRapido(user, pass) {
  const userInput = document.getElementById('login-campo-user');
  const passInput = document.getElementById('login-campo-pass');
  if (userInput) userInput.value = user;
  if (passInput) passInput.value = pass;
  fazerLogin(user, pass);
}

async function fazerLogin(username, password) {
  const alerta = document.getElementById('login-alerta-erro');
  const btn = document.getElementById('btn-login-entrar');
  if (alerta) alerta.style.display = 'none';
  if (btn) { btn.disabled = true; btn.textContent = 'Autenticando...'; }

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || data.message || 'Credenciais inválidas.');
    }

    if (typeof localStorage !== 'undefined') localStorage.setItem('patio_auth_token', data.token);
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem('patio_auth_token', data.token);
      if (data.user?.tenantId) sessionStorage.setItem('patio_tenant', data.user.tenantId);
    }

    S.user = data.user;
    S.perfil = data.user.role;
    S.ui = S.ui || {};
    S.ui.perfilAtivo = data.user.role;

    fecharModalLogin();

    if (typeof torrar === 'function') {
      torrar(`Conectado como ${data.user.nome} (${data.user.cargo || data.user.role})`, 'sucesso');
    }

    // Recarrega estado sincronizado
    if (typeof armazem !== 'undefined' && armazem.ler) {
      const fresh = await armazem.ler();
      if (fresh) {
        const ui = S.ui;
        S = fresh;
        S.ui = ui;
        S.user = data.user;
        S.perfil = data.user.role;
      }
    }
    render();
  } catch (err) {
    if (alerta) {
      alerta.textContent = err.message;
      alerta.style.display = 'block';
    } else {
      alert(err.message);
    }
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Entrar no Sistema ➔'; }
  }
}

function fazerLogout() {
  if (typeof localStorage !== 'undefined') localStorage.removeItem('patio_auth_token');
  if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem('patio_auth_token');
  fetch('/api/auth/logout', { method: 'POST', headers: typeof obterHeadersRequisicao === 'function' ? obterHeadersRequisicao() : {} }).catch(() => {});
  if (typeof torrar === 'function') torrar('Sessão encerrada com sucesso.', 'neutro');
  abrirModalLogin();
}

if (typeof window !== 'undefined') {
  window.renderNav = renderNav;
  window.renderTopo = renderTopo;
  window.renderOnboardingBanner = renderOnboardingBanner;
  window.toggleDropdownNovo = toggleDropdownNovo;
  window.toggleDropdownUsuario = toggleDropdownUsuario;
  window.abrirModalLogin = abrirModalLogin;
  window.fecharModalLogin = fecharModalLogin;
  window.submeterFormLogin = submeterFormLogin;
  window.loginRapido = loginRapido;
  window.fazerLogin = fazerLogin;
  window.fazerLogout = fazerLogout;
}
