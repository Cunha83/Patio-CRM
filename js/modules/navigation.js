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
        { id: 'mensagens', label: 'WhatsApp & CRM', icone: 'zap', perfis: ['recepcao', 'gestor', 'todos'] },
        { id: 'painel', label: 'Painel & KPIs', icone: 'painel', perfis: ['gestor', 'todos'] }
      ]
    },
    {
      titulo: 'Suprimentos',
      itens: [
        { id: 'estoque', label: 'Almoxarifado', icone: 'pecas', perfis: ['gestor', 'todos'] }
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
    operacao: 'Dashboard Operacional em Tempo Real',
    patio: 'Pátio Operacional & Boxes',
    painel: 'Painel Geral de Desempenho',
    estoque: 'Almoxarifado & Peças',
    financeiro: 'Gestão Financeira & DRE',
    mensagens: 'Comunicação & WhatsApp CRM',
    cadastros: 'Cadastros & Frotas',
    relatorios: 'Relatórios & Exportações',
    configuracoes: 'Configurações da Oficina'
  };

  const logoSrc = (S.cfg && S.cfg.identidadeVisual && (S.cfg.identidadeVisual.logoUrl || S.cfg.identidadeVisual.logo)) || (S.cfg && S.cfg.logoEmpresa);

  return `
  <header class="topo">
    <div class="marca">
      <div class="chapa" style="display:flex;align-items:center;justify-content:center;overflow:hidden">
        ${logoSrc ? `<img src="${esc(logoSrc)}" alt="Logo" style="max-height:22px;max-width:24px;object-fit:contain">` : ico('patio', 18)}
      </div>
      <div>
        <div style="display:flex;align-items:center">
          <h1 style="margin:0">${esc((S.cfg && S.cfg.empresa) || 'PÁTIO DIESEL')}</h1>
          ${(S._isDemo || (S.cfg && S.cfg.empresa && S.cfg.empresa.includes('Demonstração'))) ? '<span style="display:inline-block;background:#eab308;color:#000;font-size:10px;font-weight:700;padding:1px 6px;border-radius:4px;margin-left:6px" title="Ambiente de Demonstração com dados fictícios">DEMO 90D</span>' : ''}
        </div>
        <div class="sub">${titulos[v] || 'CRM'}</div>
      </div>
    </div>
    <div class="topo-titulo-desktop" style="font-weight:700;font-size:16px;color:#fff">
      ${titulos[v] || 'Oficina'}
    </div>
    <div class="dir">
      ${(S._isDemo || (S.cfg && S.cfg.empresa && S.cfg.empresa.includes('Demonstração')))
        ? `<a href="/" style="text-decoration:none;font-size:11px;padding:4px 8px;border-radius:12px;background:rgba(255,255,255,0.12);color:#e2e8f0;display:inline-flex;align-items:center;gap:4px" onclick="sessionStorage.removeItem('patio_tenant')">Voltar à Produção</a>`
        : `<a href="/?tenant=oficina_demo_dados_ficticios" style="text-decoration:none;font-size:11px;padding:4px 8px;border-radius:12px;background:#eab308;color:#000;font-weight:600;display:inline-flex;align-items:center;gap:4px">🧪 Base Demo (90d)</a>`}
      <div class="pill-topo" title="Perfil ativo: ${perfilLabel}">
        <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--verde)"></span>
        <span>${esc(perfilLabel)}</span>
      </div>
      <button class="btn btn-primario" data-act="nova-os" style="height:32px;font-size:12.5px;padding:0 12px;border-radius:16px">
        ${ico('mais', 14)} Nova OS
      </button>
    </div>
  </header>`;
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
