/* =====================================================================
   PÁTIO CRM — NAVEGAÇÃO, TOPO & ONBOARDING (FRONTEND MODULE)
===================================================================== */

/* ---------------- Casca & Navegação ---------------- */
function renderNav() {
  const v = S.ui.view || 'patio';
  const perfil = (S.ui && S.ui.perfilAtivo) || 'todos';

  // Grupos semânticos
  const grupos = [
    {
      titulo: 'Operação',
      itens: [
        { id: 'operacao', label: 'Operação em Tempo Real', icone: 'relogio', perfis: ['mecanico', 'gestor', 'todos'] },
        { id: 'patio', label: 'Pátio & Boxes', icone: 'patio', perfis: ['mecanico', 'recepcao', 'gestor', 'todos'] }
      ]
    },
    {
      titulo: 'Comercial & CRM',
      itens: [
        { id: 'vendas', label: 'Vendas (Balcão & OS)', icone: 'carrinho', perfis: ['recepcao', 'gestor', 'todos'] },
        { id: 'mensagens', label: 'WhatsApp & CRM', icone: 'zap', perfis: ['recepcao', 'gestor', 'todos'] },
        { id: 'painel', label: 'Painel & KPIs', icone: 'painel', perfis: ['gestor', 'todos'] }
      ]
    },
    {
      titulo: 'Suprimentos',
      itens: [
        { id: 'estoque', label: 'Almoxarifado', icone: 'pecas', perfis: ['gestor', 'todos'] },
        { id: 'compras', label: 'Compras & Entrada NF-e', icone: 'doc', perfis: ['gestor', 'todos'] }
      ]
    },
    {
      titulo: 'Gestão',
      itens: [
        { id: 'financeiro', label: 'Financeiro', icone: 'fin', perfis: ['gestor', 'todos'] },
        { id: 'fiscal', label: 'Notas fiscais', icone: 'relatorios', perfis: ['gestor', 'todos'] },
        { id: 'relatorios', label: 'Relatórios & Backup', icone: 'relatorios', perfis: ['gestor', 'todos'] }
      ]
    },
    {
      titulo: 'Configurações',
      itens: [
        { id: 'cadastros', label: 'Cadastros & Frotas', icone: 'cad', perfis: ['recepcao', 'gestor', 'todos'] },
        { id: 'configuracoes', label: 'Configurações', icone: 'cfg', perfis: ['gestor', 'todos'] }
      ]
    }
  ];

  const logoSrc = (S.cfg && S.cfg.identidadeVisual && (S.cfg.identidadeVisual.logoUrl || S.cfg.identidadeVisual.logo)) || (S.cfg && S.cfg.logoEmpresa);

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

  <div style="padding:10px 14px 6px 14px;border-bottom:1px solid rgba(255,255,255,0.06)">
    <div style="font-size:10px;text-transform:uppercase;letter-spacing:0.06em;color:var(--aco-400);font-weight:700;margin-bottom:4px">Perfil de Trabalho</div>
    <select class="campo" data-act="mudar-perfil" style="height:28px;font-size:11.5px;padding:2px 6px;background:var(--aco-800);color:#fff;border:1px solid var(--aco-600);border-radius:4px;width:100%;cursor:pointer">
      <option value="todos" ${perfil === 'todos' ? 'selected' : ''}>Todos os Módulos</option>
      <option value="mecanico" ${perfil === 'mecanico' ? 'selected' : ''}>🔧 Mecânico / Box</option>
      <option value="recepcao" ${perfil === 'recepcao' ? 'selected' : ''}>📋 Recepção / Consultor</option>
      <option value="gestor" ${perfil === 'gestor' ? 'selected' : ''}>📊 Gestor / Oficina</option>
    </select>
  </div>

  <div class="nav-links">
    ${grupos.map(g => {
      const visiveis = g.itens.filter(item => (item.id !== 'fiscal' || window.patioFiscalAvailable) && (perfil === 'todos' || item.perfis.includes(perfil)));
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
  const perfil = (S.ui && S.ui.perfilAtivo) || 'todos';
  const perfilLabel = {
    mecanico: '🔧 Mecânico',
    recepcao: '📋 Recepção',
    gestor: '📊 Gestor',
    todos: 'Geral'
  }[perfil] || 'Geral';

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
  const usuarioNome = (S.user && S.user.name) || (S.cfg && S.cfg.usuarios && S.cfg.usuarios[0] && S.cfg.usuarios[0].nome) || 'Administrador';

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
    <div class="busca-global-wrap">
      <span class="busca-global-ico">${ico('lupa', 15)}</span>
      <input type="text" id="campo-busca-global" class="busca-global-input" 
             placeholder="Busca global ou prefixos (em:vendas, em:compras, em:clientes, em:produtos)..." 
             onkeydown="if(event.key==='Enter'){executarBuscaGlobal(this.value)}"
             title="Use prefixos contextuais como em:vendas, em:compras, em:clientes, em:produtos, em:nfe ou em:patio">
      <span class="busca-global-atalho">Ctrl+K</span>
    </div>

    <!-- Direita: Perfil + Botão Rápido + Novo -->
    <div style="display:flex;align-items:center;gap:10px">
      <div style="text-align:right;display:flex;flex-direction:column;align-items:flex-end">
        <span style="font-size:12px;font-weight:700;color:#fff">${esc(usuarioNome)}</span>
        <div style="display:inline-flex;align-items:center;gap:4px;font-size:10.5px;color:#94a3b8">
          <span style="width:6px;height:6px;border-radius:50%;background:var(--verde)"></span>
          <span>${esc(perfilLabel)}</span>
        </div>
      </div>

      <!-- Dropdown Rápido + Novo -->
      <div class="dropdown-novo-wrap">
        <button class="btn btn-primario" type="button" onclick="toggleDropdownNovo()" style="height:34px;font-size:12.5px;padding:0 14px;font-weight:700;display:inline-flex;align-items:center;gap:6px;box-shadow:0 2px 6px rgba(0,0,0,0.2)">
          ${ico('mais', 14)} <span>+ Novo</span> <span style="font-size:10px">▾</span>
        </button>
        <div id="dropdown-novo-menu" class="dropdown-novo-menu">
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

if (typeof window !== 'undefined') {
  window.renderNav = renderNav;
  window.renderTopo = renderTopo;
  window.renderOnboardingBanner = renderOnboardingBanner;
}
