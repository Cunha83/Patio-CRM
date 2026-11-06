/**
 * Módulo Orquestrador e Fachada de Navegação: navigation.js
 * Pátio-CRM — Menu Lateral, Barra Superior e Roteamento Visual
 * Arquitetura Modular (< 350 linhas).
 *
 * Submódulos especializados em js/modules/:
 * - navigation_busca.js: Omnibox e busca global
 * - navigation_actions.js: menu rápido (+ Novo) e modais rápidos
 * - navigation_auth_ui.js: banner de onboarding e modal de login
 */

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
    operacao: { tit: 'Painel Operacional em Tempo Real', icone: 'relogio', novo: 'nova-os', novoLabel: '+ Nova OS' },
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
          ${(S._isDemo || (S.cfg && S.cfg.empresa && S.cfg.empresa.includes('Demonstração'))) ? '<span style="background:#eab308;color:#000;font-size:9.5px;font-weight:800;padding:1px 5px;border-radius:4px">EXEMPLO</span>' : ''}
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
      <!-- Botão Central de Automações -->
      <button type="button" class="monday-btn-automations" onclick="abrirCentroAutomacoes()" style="height:32px;padding:4px 12px;font-size:12px;background:#ffffff;border:1px solid #d8b4fe;border-radius:6px;box-shadow:0 1px 2px rgba(0,0,0,0.1);display:inline-flex;align-items:center;gap:6px;cursor:pointer">
        <span>⚡</span>
        <span style="font-weight:700;color:var(--monday-purple, #a25ddc)">Automações</span>
      </button>
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
            <button class="dropdown-item" onclick="toggleDropdownNovo();abrirModalNovaCompra()">
              ${ico('box', 16)} <span>Nova Compra / Entrada de Peças</span>
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
            <button class="dropdown-item" onclick="toggleDropdownNovo();abrirModalNovaCompra()">
              ${ico('box', 16)} <span>Nova Compra / Entrada de Peças</span>
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

if (typeof window !== 'undefined') {
  window.renderNav = renderNav;
  window.renderTopo = renderTopo;
}
if (typeof globalThis !== 'undefined') {
  globalThis.renderNav = renderNav;
  globalThis.renderTopo = renderTopo;
}
