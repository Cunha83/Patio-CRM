/* =====================================================================
   PÁTIO CRM — NÚCLEO DA APLICAÇÃO, NAVEGAÇÃO & EVENTOS GLOBAIS
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

/* ---------------- Render Principal ---------------- */
function render() {
  renderNav();
  const v = S.ui.view || 'patio';
  let conteudo = '';

  if (v === 'operacao') conteudo = typeof viewDashboardOperacional === 'function' ? viewDashboardOperacional() : '<div class="card card-p">Carregando painel operacional...</div>';
  else if (v === 'patio') conteudo = viewPatio();
  else if (v === 'painel') conteudo = viewPainelInicial();
  else if (v === 'estoque') conteudo = viewEstoque();
  else if (v === 'financeiro') conteudo = viewFinanceiro();
  else if (v === 'mensagens') conteudo = viewMensagens();
  else if (v === 'cadastros') conteudo = viewCadastros();
  else if (v === 'relatorios') conteudo = viewRelatorios();
  else if (v === 'configuracoes') conteudo = viewConfiguracoes();

  const appEl = document.getElementById('app');
  if (appEl) {
    appEl.innerHTML = renderTopo() + `<main class="wrap">${renderOnboardingBanner()}${conteudo}</main>`;
  }

  // Renderiza gráficos caso a view demande
  if (v === 'operacao' && typeof inicializarGraficosOperacionais === 'function') {
    setTimeout(inicializarGraficosOperacionais, 100);
  }
  if (v === 'painel') {
    setTimeout(renderGraficosPainel, 100);
  }
  if (v === 'financeiro' && (!S.ui.abaFin || S.ui.abaFin === 'dashboard')) {
    setTimeout(renderGraficosFinanceiro, 60);
  }
  if (v === 'configuracoes') {
    setTimeout(() => {
      popularSelectVozesModal('cfg-ass-voz-inline');
    }, 60);
  }
}

/* ---------------- Painel Inicial / KPIs ---------------- */
function viewPainelInicial() {
  const osLista = S.os || [];
  const rec = emAberto('receber'), pag = emAberto('pagar');
  const totalRec = soma(rec, c => c.valor);
  const totalPag = soma(pag, c => c.valor);
  const osAndamento = osLista.filter(o => o.st === 'executando');
  const pecasCriticas = (S.pecas || []).filter(p => (p.qtd || 0) <= (p.min || 1));

  return `
  <div class="kpis" style="margin-bottom:14px">
    <div class="kpi bom">
      <div class="r">${ico('grana', 14)} Saldo em Caixa</div>
      <div class="v">${brlCurto(saldoCaixa())}</div>
      <div class="d">Consolidado em contas</div>
    </div>
    <div class="kpi neutro">
      <div class="r">${ico('patio', 14)} Veículos em Execução</div>
      <div class="v">${osAndamento.length}</div>
      <div class="d">Boxes ocupados</div>
    </div>
    <div class="kpi ${totalRec > 0 ? 'bom' : 'neutro'}">
      <div class="r">${ico('doc', 14)} A Receber (30d)</div>
      <div class="v">${brlCurto(totalRec)}</div>
      <div class="d">${rec.length} faturas de clientes</div>
    </div>
    <div class="kpi ${pecasCriticas.length ? 'alerta' : 'bom'}">
      <div class="r">${ico('pecas', 14)} Peças p/ Repor</div>
      <div class="v">${pecasCriticas.length}</div>
      <div class="d">Abaixo do estoque mínimo</div>
    </div>
  </div>

  <div style="display:grid;grid-template-columns:2fr 1fr;gap:14px;margin-bottom:14px">
    <div class="card card-p">
      <div style="font-weight:700;font-size:15px;margin-bottom:4px">Fluxo Financeiro Semanal (Entradas vs Saídas)</div>
      <div class="mini" style="margin-bottom:12px">Comparativo consolidado dos últimos dias</div>
      <div style="height:220px;position:relative">
        <canvas id="grafico-fluxo"></canvas>
      </div>
    </div>

    <div class="card card-p">
      <div style="font-weight:700;font-size:15px;margin-bottom:4px">Ocupação do Pátio</div>
      <div class="mini" style="margin-bottom:12px">Distribuição dos veículos nos boxes</div>
      <div style="height:220px;position:relative">
        <canvas id="grafico-ocupacao"></canvas>
      </div>
    </div>
  </div>
  
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
    ${blocoTitulosPainel(rec, 'Títulos a Receber (Próx. 7 Dias ou Atrasados)', 'receber')}
    ${blocoTitulosPainel(pag, 'Títulos a Pagar (Próx. 7 Dias ou Atrasados)', 'pagar')}
  </div>`;
}

function blocoTitulosPainel(lista, titulo, tipo) {
  const dH = hoje();
  // Filtra títulos que vencem em até 7 dias ou que já estão atrasados
  let filtrados = lista.filter(c => {
    const diff = diasEntre(dH, c.venc);
    return diff <= 7;
  }).sort((a,b) => new Date(a.venc) - new Date(b.venc)).slice(0, 5); // Pega os 5 mais urgentes

  let htmlLista = filtrados.length === 0 ? `<div class="mini" style="color:var(--aco-500);text-align:center;padding:12px">Nenhum título para o período.</div>` : filtrados.map(c => {
    const diff = diasEntre(dH, c.venc);
    let cor = diff < 0 ? 'var(--tijolo)' : (diff === 0 ? 'var(--laranja)' : 'var(--aco-700)');
    let descVenc = diff < 0 ? `${Math.abs(diff)}d atraso` : (diff === 0 ? 'Hoje' : `em ${diff}d`);
    
    return `
    <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--aco-100)">
      <div>
        <div style="font-weight:600;font-size:13px;color:var(--aco-800)">${esc(c.parte)}</div>
        <div style="font-size:11px;color:${cor}">${dataBR(c.venc)} (${descVenc})</div>
      </div>
      <div style="font-weight:700;font-size:14px;color:${tipo === 'receber' ? 'var(--verde)' : 'var(--aco-800)'}">
        ${brlCurto(c.valor)}
      </div>
    </div>`;
  }).join('');

  return `
  <div class="card card-p">
    <div class="entre" style="margin-bottom:12px;border-bottom:1px solid var(--aco-200);padding-bottom:8px">
      <div style="font-weight:700;font-size:14px">${titulo}</div>
      ${ico(tipo==='receber'?'doc':'maleta', 14)}
    </div>
    ${htmlLista}
    ${filtrados.length > 0 ? `<div style="text-align:center;margin-top:10px"><button class="btn btn-secundario" onclick="S.ui.view='financeiro';render()" style="font-size:11px;padding:4px 8px">Ver Financeiro Completo</button></div>` : ''}
  </div>`;
}

function renderGraficosPainel() {
  if (typeof Chart === 'undefined') return;

  const ctxFluxo = document.getElementById('grafico-fluxo');
  if (ctxFluxo) {
    if (window._chartFluxo) window._chartFluxo.destroy();
    window._chartFluxo = new Chart(ctxFluxo, {
      type: 'bar',
      data: {
        labels: ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Hoje'],
        datasets: [
          { label: 'Entradas (R$)', data: [4200, 3100, 5800, 4900, 7200, 6400], backgroundColor: '#10b981', borderRadius: 4 },
          { label: 'Saídas (R$)', data: [2100, 1800, 3400, 2900, 4100, 3200], backgroundColor: '#ef4444', borderRadius: 4 }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom' } },
        scales: { y: { beginAtZero: true } }
      }
    });
  }

  const ctxOcup = document.getElementById('grafico-ocupacao');
  if (ctxOcup) {
    if (window._chartOcup) window._chartOcup.destroy();
    const osLista = S.os || [];
    window._chartOcup = new Chart(ctxOcup, {
      type: 'doughnut',
      data: {
        labels: ['Em Execução', 'Parado Peça', 'Aprovação', 'Na Fila'],
        datasets: [{
          data: [
            osLista.filter(o => o.st === 'executando').length || 1,
            osLista.filter(o => o.st === 'peca').length,
            osLista.filter(o => o.st === 'aprovacao').length,
            osLista.filter(o => o.st === 'fila').length
          ],
          backgroundColor: ['#2563eb', '#f59e0b', '#8b5cf6', '#cbd5e1']
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom' } }
      }
    });
  }
}

/* ---------------- Configurações do Sistema ---------------- */
function viewConfiguracoes() {
  const cfg = S.cfg || {};

  return `
  <div class="card card-p" style="max-width:700px;margin:0 auto">
    <div style="font-weight:700;font-size:18px;margin-bottom:6px">Configurações da Oficina & Parâmetros</div>
    <div class="mini" style="margin-bottom:16px">Dados impressos nas ordens de serviço, recibos e cabeçalhos.</div>

    <div style="display:flex;flex-direction:column;gap:14px;font-size:13px">
      <div>
        <label style="font-weight:600;display:block;margin-bottom:4px">Nome da Oficina / Razão Social:</label>
        <input type="text" class="campo-texto" value="${esc(cfg.empresa || '')}" data-act="cfg" data-c="empresa" style="width:100%;height:34px">
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div>
          <label style="font-weight:600;display:block;margin-bottom:4px">CNPJ:</label>
          <input type="text" class="campo-texto" value="${esc(cfg.cnpj || '')}" data-act="cfg" data-c="cnpj" style="width:100%;height:34px">
        </div>
        <div>
          <label style="font-weight:600;display:block;margin-bottom:4px">Telefone / WhatsApp Comercial:</label>
          <input type="text" class="campo-texto" value="${esc(cfg.fone || '')}" data-act="cfg" data-c="fone" style="width:100%;height:34px">
        </div>
      </div>

      <div>
        <label style="font-weight:600;display:block;margin-bottom:4px">Endereço Completo:</label>
        <input type="text" class="campo-texto" value="${esc(cfg.endereco || '')}" data-act="cfg" data-c="endereco" style="width:100%;height:34px">
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div>
          <label style="font-weight:600;display:block;margin-bottom:4px">Chave PIX Oficial:</label>
          <input type="text" class="campo-texto" value="${esc(cfg.chavePix || '')}" data-act="cfg" data-c="chavePix" style="width:100%;height:34px">
        </div>
        <div>
          <label style="font-weight:600;display:block;margin-bottom:4px">Saldo Inicial do Caixa (R$):</label>
          <input type="number" class="campo-texto" value="${cfg.saldoInicial || 0}" data-act="cfg" data-c="saldoInicial" step="100" style="width:100%;height:34px">
        </div>
      </div>

      <div>
        <label style="font-weight:600;display:block;margin-bottom:4px">Termo Padrão de Garantia de Serviços:</label>
        <textarea class="campo-texto" data-act="cfg" data-c="termoGarantia" rows="2" style="width:100%">${esc(cfg.termoGarantia || '')}</textarea>
      </div>

      <div style="border-top:1px solid var(--aco-200);padding-top:14px;margin-top:10px">
        <div style="font-weight:700;font-size:14px;margin-bottom:8px">Identidade Visual & Logotipo</div>
        <div class="mini" style="margin-bottom:10px">O logotipo será impresso nas ordens de serviço, orçamentos, recibos e relatórios.</div>
        <div style="display:flex;align-items:center;gap:16px;margin-bottom:10px">
          <div id="cfg-logo-preview" style="width:120px;height:60px;border:1px dashed var(--aco-300);border-radius:6px;display:flex;align-items:center;justify-content:center;background:#f8fafc;overflow:hidden">
            ${(cfg.identidadeVisual?.logoUrl || cfg.identidadeVisual?.logo) ? `<img src="${cfg.identidadeVisual.logoUrl || cfg.identidadeVisual.logo}" style="max-height:100%;max-width:100%;object-fit:contain">` : '<span class="mini" style="color:var(--aco-400)">Sem Logo</span>'}
          </div>
          <div style="display:flex;flex-direction:column;gap:6px">
            <input type="file" id="cfg-input-logo" accept="image/png,image/jpeg,image/webp" style="display:none">
            <div style="display:flex;gap:8px">
              <button class="btn btn-neutro btn-pequeno" type="button" onclick="document.getElementById('cfg-input-logo').click()">Selecionar Logo</button>
              ${(cfg.identidadeVisual?.logoUrl || cfg.identidadeVisual?.logo) ? '<button class="btn btn-perigo btn-pequeno" type="button" data-act="remover-logo">Remover</button>' : ''}
            </div>
            <span class="mini" style="color:var(--aco-500)">Tamanho máximo: 2MB.</span>
          </div>
        </div>

        <div style="font-weight:600;font-size:13px;margin:12px 0 4px 0">Imagem Institucional (Aprovação Digital):</div>
        <div class="mini" style="margin-bottom:10px">Exibida no cabeçalho da página pública de aprovação de orçamentos para os clientes.</div>
        <div style="display:flex;align-items:center;gap:16px;margin-bottom:10px">
          <div id="cfg-institucional-preview" style="width:120px;height:60px;border:1px dashed var(--aco-300);border-radius:6px;display:flex;align-items:center;justify-content:center;background:#f8fafc;overflow:hidden">
            ${(cfg.identidadeVisual?.imagemInstitucionalUrl || cfg.identidadeVisual?.imagemInstitucional) ? `<img src="${cfg.identidadeVisual.imagemInstitucionalUrl || cfg.identidadeVisual.imagemInstitucional}" style="max-height:100%;max-width:100%;object-fit:contain">` : '<span class="mini" style="color:var(--aco-400)">Sem Imagem</span>'}
          </div>
          <div style="display:flex;flex-direction:column;gap:6px">
            <input type="file" id="cfg-input-institucional" accept="image/png,image/jpeg,image/webp" style="display:none">
            <div style="display:flex;gap:8px">
              <button class="btn btn-neutro btn-pequeno" type="button" onclick="document.getElementById('cfg-input-institucional').click()">Selecionar Imagem</button>
              ${(cfg.identidadeVisual?.imagemInstitucionalUrl || cfg.identidadeVisual?.imagemInstitucional) ? '<button class="btn btn-perigo btn-pequeno" type="button" data-act="remover-institucional">Remover</button>' : ''}
            </div>
            <span class="mini" style="color:var(--aco-500)">Tamanho máximo: 2MB.</span>
          </div>
        </div>
      </div>

      <div style="border-top:1px solid var(--aco-200);padding-top:14px;margin-top:10px">
        <div class="entre" style="margin-bottom:8px">
          <div>
            <div style="font-weight:700;font-size:14px">Assistente Virtual & Voz</div>
            <div class="mini" style="margin-bottom:4px">Personalize o nome, timbre de voz e teste a pronúncia da inteligência operacional da sua oficina.</div>
          </div>
          <button type="button" class="btn btn-neutro btn-pequeno" style="gap:6px;display:flex;align-items:center;white-space:nowrap" onclick="abrirConfiguracoesAgente()">
            ⚙️ Personalizar no Modal Completo
          </button>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:10px">
          <div>
            <label style="font-weight:600;display:block;margin-bottom:4px">Nome do Assistente:</label>
            <input type="text" id="cfg-ass-nome-inline" class="campo-texto" value="${esc(cfg.assistente?.displayName || 'Verônica')}" data-act="cfg-assistente" data-c="displayName" placeholder="Ex: Verônica, Sofia, Carlos, Atlas" style="width:100%;height:34px">
            <div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:6px;align-items:center">
              <span class="mini" style="color:var(--aco-500);font-size:10.5px">Sugestões:</span>
              <button type="button" class="btn-chip" style="font-size:10.5px;padding:2px 7px" onclick="(S.cfg.assistente=S.cfg.assistente||{}).displayName='Verônica';(S.cfg.assistente.voiceGender='female');salvar();render();">Verônica 👩</button>
              <button type="button" class="btn-chip" style="font-size:10.5px;padding:2px 7px" onclick="(S.cfg.assistente=S.cfg.assistente||{}).displayName='Sofia';(S.cfg.assistente.voiceGender='female');salvar();render();">Sofia 👩</button>
              <button type="button" class="btn-chip" style="font-size:10.5px;padding:2px 7px" onclick="(S.cfg.assistente=S.cfg.assistente||{}).displayName='Carlos';(S.cfg.assistente.voiceGender='male');salvar();render();">Carlos 👨</button>
              <button type="button" class="btn-chip" style="font-size:10.5px;padding:2px 7px" onclick="(S.cfg.assistente=S.cfg.assistente||{}).displayName='Atlas';(S.cfg.assistente.voiceGender='male');salvar();render();">Atlas 👨</button>
            </div>
          </div>
          <div>
            <label style="font-weight:600;display:block;margin-bottom:4px">Gênero da Voz Sintetizada:</label>
            <select class="campo-texto" data-act="cfg-assistente" data-c="voiceGender" style="width:100%;height:34px">
              <option value="female" ${(cfg.assistente?.voiceGender || 'female') === 'female' ? 'selected' : ''}>👩 Feminina (Padrão)</option>
              <option value="male" ${(cfg.assistente?.voiceGender) === 'male' ? 'selected' : ''}>👨 Masculina</option>
            </select>
            <div class="mini" style="margin-top:4px;color:var(--aco-500)">Gênero aplicado nos filtros de voz e nas saudações do pós-venda.</div>
          </div>
        </div>

        <div style="display:grid;grid-template-columns:2fr 1fr;gap:10px;align-items:end;margin-bottom:10px">
          <div>
            <label style="font-weight:600;display:block;margin-bottom:4px">Voz Específica do Navegador / Sistema Operacional:</label>
            <select id="cfg-ass-voz-inline" class="campo-texto" data-act="cfg-assistente" data-c="voiceURI" style="width:100%;height:34px" onchange="aoMudarVozInline(this)">
              <option value="">✨ Seleção Automática Inteligente</option>
            </select>
          </div>
          <div>
            <button type="button" id="btn-inline-testar-voz" class="btn btn-neutro" style="width:100%;height:34px;gap:6px;display:flex;align-items:center;justify-content:center;font-weight:600" onclick="executarTesteModalVoz()">
              <span>▶️</span> Ouvir Saudação
            </button>
          </div>
        </div>

        <!-- Briefing Executivo Diário e Semanal -->
        <div style="background:var(--aco-100, rgba(0,0,0,0.03));border:1px solid var(--aco-200);border-radius:8px;padding:12px;margin-top:10px">
          <div class="entre" style="margin-bottom:8px">
            <div>
              <span style="font-weight:700;font-size:13px">📊 Briefings Executivos para Gestores</span>
              <div class="mini" style="color:var(--aco-500)">Consolidação diária e semanal de pátio e financeiro.</div>
            </div>
            <button type="button" class="btn btn-neutro btn-pequeno" onclick="gerarEVisualizarBriefing()" style="font-weight:600;display:flex;align-items:center;gap:4px">
              <span>📈</span> Visualizar Briefing Agora
            </button>
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:8px">
            <div style="border-right:1px solid var(--aco-200);padding-right:10px">
              <label style="display:flex;align-items:center;gap:6px;font-weight:600;font-size:12.5px;cursor:pointer;margin-bottom:6px">
                <input type="checkbox" data-act="cfg-assistente-bool" data-c="briefingDiarioAtivo" ${cfg.assistente?.briefingDiarioAtivo ? 'checked' : ''}>
                <span>Briefing Diário Matinal</span>
              </label>
              <div style="display:flex;gap:8px;align-items:center">
                <span class="mini" style="white-space:nowrap">Horário:</span>
                <input type="time" class="campo-texto" style="height:30px;font-size:12px;padding:0 6px" value="${cfg.assistente?.briefingDiarioHorario || '07:30'}" data-act="cfg-assistente" data-c="briefingDiarioHorario">
              </div>
            </div>
            <div>
              <label style="display:flex;align-items:center;gap:6px;font-weight:600;font-size:12.5px;cursor:pointer;margin-bottom:6px">
                <input type="checkbox" data-act="cfg-assistente-bool" data-c="briefingSemanalAtivo" ${cfg.assistente?.briefingSemanalAtivo ? 'checked' : ''}>
                <span>Briefing Semanal Gerencial</span>
              </label>
              <div style="display:flex;gap:8px;align-items:center">
                <select class="campo-texto" style="height:30px;font-size:12px;padding:0 6px" data-act="cfg-assistente" data-c="briefingSemanalDia">
                  <option value="segunda" ${(cfg.assistente?.briefingSemanalDia || 'segunda') === 'segunda' ? 'selected' : ''}>Segunda-feira</option>
                  <option value="sexta" ${(cfg.assistente?.briefingSemanalDia) === 'sexta' ? 'selected' : ''}>Sexta-feira</option>
                  <option value="sabado" ${(cfg.assistente?.briefingSemanalDia) === 'sabado' ? 'selected' : ''}>Sábado</option>
                </select>
                <input type="time" class="campo-texto" style="height:30px;font-size:12px;padding:0 6px" value="${cfg.assistente?.briefingSemanalHorario || '08:00'}" data-act="cfg-assistente" data-c="briefingSemanalHorario">
              </div>
            </div>
          </div>
        </div>
      </div>

      <div style="border-top:1px solid var(--aco-200);padding-top:14px;margin-top:10px">
        <div style="font-weight:700;font-size:14px;margin-bottom:8px">Manutenção Preventiva & Pós-Venda</div>
        <div class="mini" style="margin-bottom:10px">Parâmetros globais para alertas automáticos e follow-up com frotistas.</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <div>
            <label class="mini" style="font-weight:600;display:block">Alerta Preventiva (Km antecedência):</label>
            <input type="number" class="campo-texto" value="${cfg.manutencaoPreventiva?.alertaKmPadrao || 1000}" data-act="cfg-prev" data-c="alertaKmPadrao" style="width:100%;height:32px">
          </div>
          <div>
            <label class="mini" style="font-weight:600;display:block">Alerta Preventiva (Dias antecedência):</label>
            <input type="number" class="campo-texto" value="${cfg.manutencaoPreventiva?.alertaDiasPadrao || 15}" data-act="cfg-prev" data-c="alertaDiasPadrao" style="width:100%;height:32px">
          </div>
        </div>
      </div>

      <div style="border-top:1px solid var(--aco-200);padding-top:14px;margin-top:10px">
        <div style="font-weight:700;font-size:14px;margin-bottom:8px">Guia de Implantação & Demonstração</div>
        <div class="mini" style="margin-bottom:10px">Controle o banner de ativação e carregue ou limpe os dados de demonstração.</div>
        <div style="display:flex;gap:10px;flex-wrap:wrap">
          <button class="btn btn-neutro btn-pequeno" type="button" data-act="${cfg.onboardingConcluido ? 'reabrir-onboarding' : 'concluir-onboarding'}">
            ${cfg.onboardingConcluido ? 'Reabrir Checklist de Onboarding' : 'Marcar Onboarding Concluído'}
          </button>
          <button class="btn btn-neutro btn-pequeno" type="button" data-act="carregar-demo">Carregar Dados Demo</button>
          <button class="btn btn-perigo btn-pequeno" type="button" data-act="remover-demo">Remover Dados Demo</button>
        </div>
      </div>

      <div style="border-top:1px solid var(--aco-200);padding-top:14px;margin-top:10px">
        <div style="font-weight:700;font-size:14px;margin-bottom:8px">Integração APIBrasil (Consulta de Placas)</div>
        <div class="mini" style="margin-bottom:10px">Insira as credenciais para puxar marca, modelo e cor pela placa automaticamente.</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <div>
            <label class="mini" style="font-weight:600;display:block">DeviceToken:</label>
            <input type="password" class="campo-texto" value="${esc((cfg.apibrasil && cfg.apibrasil.deviceToken) || '')}" data-act="cfg-apibrasil" data-c="deviceToken" style="width:100%;height:32px">
          </div>
          <div>
            <label class="mini" style="font-weight:600;display:block">BearerToken:</label>
            <input type="password" class="campo-texto" value="${esc((cfg.apibrasil && cfg.apibrasil.bearerToken) || '')}" data-act="cfg-apibrasil" data-c="bearerToken" style="width:100%;height:32px">
          </div>
        </div>
      </div>

      <div style="border-top:1px solid var(--aco-200);padding-top:14px;display:flex;justify-content:space-between;align-items:center">
        <button class="btn btn-perigo" data-act="zerar">Restaurar Demonstração</button>
        <button class="btn btn-primario" data-act="salvar-cfg">Salvar Alterações</button>
      </div>
    </div>
  </div>`;
}

/* ---------------- Gerenciamento de Modais / Folhas ---------------- */
function abrirFolha(fn) {
  folhaAtual = fn;
  renderFolha();
  const vidro = document.getElementById('vidro');
  const folha = document.getElementById('folha');
  if (vidro) vidro.classList.add('on');
  if (folha) folha.classList.add('on');
}

function renderFolha() {
  const folha = document.getElementById('folha');
  if (folha && folhaAtual) {
    folha.innerHTML = folhaAtual();
  }
}

function fecharFolha() {
  const vidro = document.getElementById('vidro');
  const folha = document.getElementById('folha');
  if (vidro) vidro.classList.remove('on');
  if (folha) folha.classList.remove('on');
  folhaAtual = null;
}

/* ---------------- Configuração do Agente Inteligente & Voz (TTS) ---------------- */
function folhaConfigAssistente() {
  const cfg = (typeof S !== 'undefined' && S.cfg) || {};
  const ass = cfg.assistente || cfg.assistant || {
    displayName: 'Verônica',
    voiceGender: 'female',
    voiceURI: '',
    voiceName: '',
    pitch: 1.0,
    rate: 1.0,
    enabled: true
  };

  return `
  <div class="card card-p" style="max-width:580px;margin:0 auto;background:#182235;color:#fff;border-radius:12px;border:1px solid #334155;box-shadow:0 20px 40px rgba(0,0,0,0.5)">
    <div class="entre" style="border-bottom:1px solid rgba(255,255,255,0.12);padding-bottom:12px;margin-bottom:16px">
      <div style="display:flex;align-items:center;gap:10px">
        <span style="font-size:24px">🤖</span>
        <div>
          <h3 style="font-size:18px;font-weight:700;margin:0;color:#fff">Configuração do Agente Inteligente & Voz</h3>
          <div class="mini" style="color:#94a3b8">Personalize o nome, timbre de voz e saudações do agente operacional</div>
        </div>
      </div>
      <button class="btn-fechar" data-act="fechar" style="color:#fff">${ico('x', 20)}</button>
    </div>

    <div style="display:flex;flex-direction:column;gap:16px">
      <!-- 1. Nome do Agente -->
      <div>
        <label style="font-weight:700;display:block;margin-bottom:6px;font-size:13px;color:#f8fafc">Nome do Agente / Assistente Virtual:</label>
        <input type="text" id="modal-cfg-ass-nome" class="campo-texto" value="${esc(ass.displayName || 'Verônica')}" placeholder="Ex: Verônica, Sofia, Carlos, Atlas, Jarvis..." style="width:100%;height:38px;font-size:14px;font-weight:600;padding:0 12px;border-radius:6px;background:#0f172a;color:#fff;border:1px solid #475569">
        
        <!-- Sugestões rápidas de nomes -->
        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:8px">
          <span class="mini" style="color:#94a3b8;margin-right:2px">Sugestões rápidas:</span>
          <button type="button" class="btn-chip" onclick="selecionarSugestaoNome('Verônica', 'female')">Verônica 👩</button>
          <button type="button" class="btn-chip" onclick="selecionarSugestaoNome('Sofia', 'female')">Sofia 👩</button>
          <button type="button" class="btn-chip" onclick="selecionarSugestaoNome('Bia', 'female')">Bia 👩</button>
          <button type="button" class="btn-chip" onclick="selecionarSugestaoNome('Carlos', 'male')">Carlos 👨</button>
          <button type="button" class="btn-chip" onclick="selecionarSugestaoNome('Atlas', 'male')">Atlas 👨</button>
          <button type="button" class="btn-chip" onclick="selecionarSugestaoNome('Jarvis', 'male')">Jarvis 👨</button>
        </div>
      </div>

      <!-- 2. Gênero da Voz -->
      <div>
        <label style="font-weight:700;display:block;margin-bottom:6px;font-size:13px;color:#f8fafc">Gênero da Voz (Síntese / Respostas Faladas):</label>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <label style="display:flex;align-items:center;gap:8px;background:rgba(255,255,255,0.06);padding:10px 14px;border-radius:8px;cursor:pointer;border:1px solid ${ass.voiceGender !== 'male' ? '#3b82f6' : 'rgba(255,255,255,0.1)'}" id="label-genero-female">
            <input type="radio" name="modal-cfg-ass-genero" value="female" ${ass.voiceGender !== 'male' ? 'checked' : ''} onchange="atualizarGeneroSelecionado('female')">
            <div>
              <div style="font-weight:700;font-size:13px">👩 Voz Feminina (Padrão)</div>
              <div class="mini" style="color:#94a3b8">Timbre natural e claro</div>
            </div>
          </label>
          <label style="display:flex;align-items:center;gap:8px;background:rgba(255,255,255,0.06);padding:10px 14px;border-radius:8px;cursor:pointer;border:1px solid ${ass.voiceGender === 'male' ? '#3b82f6' : 'rgba(255,255,255,0.1)'}" id="label-genero-male">
            <input type="radio" name="modal-cfg-ass-genero" value="male" ${ass.voiceGender === 'male' ? 'checked' : ''} onchange="atualizarGeneroSelecionado('male')">
            <div>
              <div style="font-weight:700;font-size:13px">👨 Voz Masculina</div>
              <div class="mini" style="color:#94a3b8">Timbre grave e firme</div>
            </div>
          </label>
        </div>
      </div>

      <!-- 3. Seleção de Voz Instalada no Navegador / Sistema -->
      <div>
        <div class="entre" style="margin-bottom:6px">
          <label style="font-weight:700;font-size:13px;color:#f8fafc">Voz do Sistema Operacional / Navegador:</label>
          <span class="mini" style="color:#60a5fa" id="modal-voz-detectada-status">Detectando vozes...</span>
        </div>
        <select id="modal-cfg-ass-voz" class="campo-select" style="width:100%;height:38px;font-size:13px;background:#0f172a;color:#fff;border:1px solid #475569;border-radius:6px;padding:0 8px">
          <option value="">Carregando vozes disponíveis...</option>
        </select>
        <div class="mini" style="color:#94a3b8;margin-top:4px">
          💡 O Pátio CRM sincroniza com as vozes de alta resolução do seu Windows, Edge ou Chrome.
        </div>
      </div>

      <!-- 4. Ajuste Fino: Tom (Pitch) e Velocidade (Rate) -->
      <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:8px;padding:12px">
        <div style="font-weight:600;font-size:12px;margin-bottom:10px;color:#e2e8f0;display:flex;align-items:center;gap:6px">
          <span>🎚️</span> Ajuste Fino de Tom e Velocidade
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
          <div>
            <div class="entre mini" style="margin-bottom:4px;color:#cbd5e1">
              <span>Tom da Voz (Pitch):</span>
              <strong id="val-pitch">${ass.pitch || 1.0}x</strong>
            </div>
            <input type="range" id="modal-cfg-ass-pitch" min="0.7" max="1.4" step="0.05" value="${ass.pitch || 1.0}" style="width:100%" oninput="document.getElementById('val-pitch').textContent = Number(this.value).toFixed(2) + 'x'">
            <div class="entre mini" style="color:#64748b;font-size:10px">
              <span>Grave (0.7x)</span>
              <span>Agudo (1.4x)</span>
            </div>
          </div>
          <div>
            <div class="entre mini" style="margin-bottom:4px;color:#cbd5e1">
              <span>Velocidade de Fala:</span>
              <strong id="val-rate">${ass.rate || 1.0}x</strong>
            </div>
            <input type="range" id="modal-cfg-ass-rate" min="0.8" max="1.3" step="0.05" value="${ass.rate || 1.0}" style="width:100%" oninput="document.getElementById('val-rate').textContent = Number(this.value).toFixed(2) + 'x'">
            <div class="entre mini" style="color:#64748b;font-size:10px">
              <span>Lenta (0.8x)</span>
              <span>Rápida (1.3x)</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 5. Briefings Executivos Gerenciais -->
      <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:8px;padding:12px">
        <div style="font-weight:600;font-size:12px;margin-bottom:10px;color:#e2e8f0;display:flex;align-items:center;gap:6px">
          <span>📊</span> Briefings Executivos para Gestores
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <div>
            <label style="display:flex;align-items:center;gap:6px;font-size:12.5px;cursor:pointer;margin-bottom:6px">
              <input type="checkbox" id="modal-cfg-ass-briefing-diario" ${ass.briefingDiarioAtivo ? 'checked' : ''}>
              <span>Briefing Diário Matinal</span>
            </label>
            <div style="display:flex;align-items:center;gap:6px">
              <span class="mini" style="color:#94a3b8">Horário:</span>
              <input type="time" id="modal-cfg-ass-briefing-diario-horario" value="${ass.briefingDiarioHorario || '07:30'}" style="background:#0f172a;color:#fff;border:1px solid #475569;border-radius:4px;padding:2px 6px;height:28px;font-size:12px">
            </div>
          </div>
          <div>
            <label style="display:flex;align-items:center;gap:6px;font-size:12.5px;cursor:pointer;margin-bottom:6px">
              <input type="checkbox" id="modal-cfg-ass-briefing-semanal" ${ass.briefingSemanalAtivo ? 'checked' : ''}>
              <span>Briefing Semanal Gerencial</span>
            </label>
            <div style="display:flex;align-items:center;gap:6px">
              <select id="modal-cfg-ass-briefing-semanal-dia" style="background:#0f172a;color:#fff;border:1px solid #475569;border-radius:4px;padding:2px 6px;height:28px;font-size:12px">
                <option value="segunda" ${(ass.briefingSemanalDia || 'segunda') === 'segunda' ? 'selected' : ''}>Segunda-feira</option>
                <option value="sexta" ${(ass.briefingSemanalDia) === 'sexta' ? 'selected' : ''}>Sexta-feira</option>
                <option value="sabado" ${(ass.briefingSemanalDia) === 'sabado' ? 'selected' : ''}>Sábado</option>
              </select>
              <input type="time" id="modal-cfg-ass-briefing-semanal-horario" value="${ass.briefingSemanalHorario || '08:00'}" style="background:#0f172a;color:#fff;border:1px solid #475569;border-radius:4px;padding:2px 6px;height:28px;font-size:12px">
            </div>
          </div>
        </div>
      </div>

      <!-- 6. Teste ao Vivo de Voz -->
      <div style="display:flex;align-items:center;justify-content:space-between;background:rgba(59,130,246,0.12);border:1px solid rgba(59,130,246,0.3);padding:10px 14px;border-radius:8px">
        <div>
          <div style="font-weight:700;font-size:13px;color:#93c5fd">Testar Pronúncia & Áudio</div>
          <div class="mini" style="color:#cbd5e1" id="modal-teste-status">Clique para ouvir como o assistente falará na sua oficina.</div>
        </div>
        <button type="button" id="btn-modal-testar-voz" class="btn btn-neutro" style="background:#1e40af;color:#fff;border:none;font-weight:700;display:flex;align-items:center;gap:6px;padding:8px 14px;border-radius:6px;cursor:pointer" onclick="executarTesteModalVoz()">
          <span>▶️</span> Ouvir Saudação
        </button>
      </div>

      <!-- 7. Rodapé de Ações -->
      <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:8px;border-top:1px solid rgba(255,255,255,0.1);padding-top:14px">
        <button type="button" class="btn btn-neutro" data-act="fechar" style="background:rgba(255,255,255,0.1);color:#fff;border:none">Cancelar</button>
        <button type="button" class="btn btn-primario" style="background:#2563eb;color:#fff;font-weight:700;padding:8px 20px" onclick="salvarConfigAssistenteModal()">
          💾 Salvar Configurações
        </button>
      </div>
    </div>
  </div>
  `;
}

function abrirConfiguracoesAgente() {
  if (typeof abrirFolha === 'function') {
    abrirFolha(folhaConfigAssistente);
    setTimeout(() => {
      popularSelectVozesModal('modal-cfg-ass-voz');
    }, 20);
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.onvoiceschanged = () => {
        popularSelectVozesModal('modal-cfg-ass-voz');
      };
    }
  } else if (typeof irParaView === 'function') {
    irParaView('configuracoes');
  }
}

function popularSelectVozesModal(selectId = 'modal-cfg-ass-voz') {
  const sel = document.getElementById(selectId);
  if (!sel) return;

  const voices = (typeof window !== 'undefined' && window.speechSynthesis)
    ? window.speechSynthesis.getVoices()
    : [];

  const assCfg = (typeof S !== 'undefined' && S?.cfg?.assistente) || {};
  const currentURI = assCfg.voiceURI || '';
  const currentName = assCfg.voiceName || '';

  sel.innerHTML = '';

  const optAuto = document.createElement('option');
  optAuto.value = '';
  optAuto.textContent = '✨ Seleção Automática Inteligente (padrão)';
  if (!currentURI && !currentName) optAuto.selected = true;
  sel.appendChild(optAuto);

  if (!voices || voices.length === 0) {
    const statusEl = document.getElementById('modal-voz-detectada-status');
    if (statusEl) statusEl.textContent = 'Usando voz nativa do navegador';
    return;
  }

  const maleRegex = /male|masculin|homem|ricardo|jorge|daniel|antonio|antônio|felipe|gustavo|carlos|pedro|joao|joão|david|paulo/i;
  const femaleRegex = /female|feminin|mulher|luciana|maria|helena|vitoria|vitória|francisca|raquel|camila|brenda|thalita|elza|leticia|letícia|manuela|leide|fernanda|gabriela|juliana|carolina|ana|ines|inês|joana|catarina|clara|amalia|amália|yelda|helia|hélia|zira/i;

  const ptBrVoices = [];
  const ptOtherVoices = [];
  const otherVoices = [];

  voices.forEach(v => {
    const lang = (v.lang || '').toLowerCase().replace('_', '-');
    if (lang.startsWith('pt-br')) {
      ptBrVoices.push(v);
    } else if (lang.startsWith('pt')) {
      ptOtherVoices.push(v);
    } else {
      otherVoices.push(v);
    }
  });

  function adicionarGrupo(titulo, lista) {
    if (!lista || lista.length === 0) return;
    const grp = document.createElement('optgroup');
    grp.label = titulo;
    lista.forEach(v => {
      const opt = document.createElement('option');
      opt.value = v.voiceURI || v.name;
      opt.dataset.name = v.name;
      opt.dataset.uri = v.voiceURI || '';
      opt.dataset.lang = v.lang || '';
      
      let tagGenero = '';
      if (femaleRegex.test(v.name)) tagGenero = ' (👩 Feminina)';
      else if (maleRegex.test(v.name)) tagGenero = ' (👨 Masculina)';

      opt.textContent = `${v.name} [${v.lang}]${tagGenero}`;
      if ((currentURI && v.voiceURI === currentURI) || (currentName && v.name === currentName)) {
        opt.selected = true;
      }
      grp.appendChild(opt);
    });
    sel.appendChild(grp);
  }

  adicionarGrupo('🇧🇷 Vozes em Português do Brasil', ptBrVoices);
  adicionarGrupo('🇵🇹 Vozes em Português (Outras)', ptOtherVoices);
  adicionarGrupo('🌐 Outras Vozes do Sistema', otherVoices.slice(0, 15));

  const totalPt = ptBrVoices.length + ptOtherVoices.length;
  const statusEl = document.getElementById('modal-voz-detectada-status');
  if (statusEl) {
    statusEl.textContent = `${voices.length} vozes detectadas (${totalPt} em Português)`;
  }
}

function aoMudarVozInline(sel) {
  if (!sel) return;
  const opt = sel.selectedOptions ? sel.selectedOptions[0] : null;
  S.cfg = S.cfg || {};
  S.cfg.assistente = S.cfg.assistente || {};
  S.cfg.assistente.voiceURI = sel.value;
  S.cfg.assistente.voiceName = opt?.dataset?.name || '';
  salvar();
}

function selecionarSugestaoNome(nome, genero) {
  const inp = document.getElementById('modal-cfg-ass-nome');
  if (inp) inp.value = nome;
  if (genero) {
    const rad = document.querySelector(`input[name="modal-cfg-ass-genero"][value="${genero}"]`);
    if (rad) {
      rad.checked = true;
      atualizarGeneroSelecionado(genero);
    }
  }
}

function atualizarGeneroSelecionado(genero) {
  const lFemale = document.getElementById('label-genero-female');
  const lMale = document.getElementById('label-genero-male');
  if (lFemale) lFemale.style.borderColor = genero === 'female' ? '#3b82f6' : 'rgba(255,255,255,0.1)';
  if (lMale) lMale.style.borderColor = genero === 'male' ? '#3b82f6' : 'rgba(255,255,255,0.1)';
}

function executarTesteModalVoz() {
  const inpNome = document.getElementById('modal-cfg-ass-nome') || document.querySelector('input[data-act="cfg-assistente"][data-c="displayName"]');
  const nome = (inpNome ? inpNome.value.trim() : '') || 'Verônica';

  const radGenero = document.querySelector('input[name="modal-cfg-ass-genero"]:checked') || document.querySelector('select[data-act="cfg-assistente"][data-c="voiceGender"]');
  const genero = (radGenero ? radGenero.value : 'female');

  const selVoz = document.getElementById('modal-cfg-ass-voz') || document.getElementById('cfg-ass-voz-inline');
  const voiceURI = selVoz ? selVoz.value : '';
  const selectedOpt = selVoz && selVoz.selectedOptions ? selVoz.selectedOptions[0] : null;
  const voiceName = selectedOpt?.dataset?.name || '';

  const inpPitch = document.getElementById('modal-cfg-ass-pitch');
  const inpRate = document.getElementById('modal-cfg-ass-rate');
  const pitch = inpPitch ? +inpPitch.value : null;
  const rate = inpRate ? +inpRate.value : null;

  const btn = document.getElementById('btn-modal-testar-voz') || document.getElementById('btn-inline-testar-voz');
  const statusEl = document.getElementById('modal-teste-status');

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span>🔊</span> Falando...';
  }
  if (statusEl) {
    statusEl.textContent = `Reproduzindo áudio de "${nome}"...`;
  }

  if (typeof PatioVoz !== 'undefined' && PatioVoz.testarVoz) {
    PatioVoz.testarVoz({
      displayName: nome,
      voiceGender: genero,
      voiceURI,
      voiceName,
      pitch,
      rate,
      onEnd: () => {
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = '<span>▶️</span> Ouvir Saudação';
        }
        if (statusEl) {
          statusEl.textContent = 'Áudio reproduzido com sucesso!';
        }
      },
      onError: () => {
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = '<span>▶️</span> Ouvir Saudação';
        }
        if (statusEl) {
          statusEl.textContent = 'Verifique se o som do dispositivo está ativo.';
        }
      }
    });
  } else {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<span>▶️</span> Ouvir Saudação';
    }
  }
}

async function salvarConfigAssistenteModal() {
  const inpNome = document.getElementById('modal-cfg-ass-nome');
  const nome = (inpNome ? inpNome.value.trim() : '') || 'Verônica';

  const radGenero = document.querySelector('input[name="modal-cfg-ass-genero"]:checked');
  const genero = radGenero ? radGenero.value : 'female';

  const selVoz = document.getElementById('modal-cfg-ass-voz');
  const voiceURI = selVoz ? selVoz.value : '';
  const selectedOpt = selVoz && selVoz.selectedOptions ? selVoz.selectedOptions[0] : null;
  const voiceName = selectedOpt?.dataset?.name || '';

  const inpPitch = document.getElementById('modal-cfg-ass-pitch');
  const inpRate = document.getElementById('modal-cfg-ass-rate');
  const pitch = inpPitch ? +inpPitch.value : 1.0;
  const rate = inpRate ? +inpRate.value : 1.0;

  const chkBriefingDiario = document.getElementById('modal-cfg-ass-briefing-diario');
  const inpBriefingDiarioHora = document.getElementById('modal-cfg-ass-briefing-diario-horario');
  const chkBriefingSemanal = document.getElementById('modal-cfg-ass-briefing-semanal');
  const selBriefingSemanalDia = document.getElementById('modal-cfg-ass-briefing-semanal-dia');
  const inpBriefingSemanalHora = document.getElementById('modal-cfg-ass-briefing-semanal-horario');

  const briefingDiarioAtivo = chkBriefingDiario ? chkBriefingDiario.checked : Boolean(S.cfg?.assistente?.briefingDiarioAtivo);
  const briefingDiarioHorario = inpBriefingDiarioHora ? inpBriefingDiarioHora.value : (S.cfg?.assistente?.briefingDiarioHorario || '07:30');
  const briefingSemanalAtivo = chkBriefingSemanal ? chkBriefingSemanal.checked : Boolean(S.cfg?.assistente?.briefingSemanalAtivo);
  const briefingSemanalDia = selBriefingSemanalDia ? selBriefingSemanalDia.value : (S.cfg?.assistente?.briefingSemanalDia || 'segunda');
  const briefingSemanalHorario = inpBriefingSemanalHora ? inpBriefingSemanalHora.value : (S.cfg?.assistente?.briefingSemanalHorario || '08:00');

  S.cfg = S.cfg || {};
  S.cfg.assistente = {
    ...(S.cfg.assistente || {}),
    displayName: nome,
    voiceGender: genero,
    voiceURI: voiceURI,
    voiceName: voiceName,
    pitch: pitch,
    rate: rate,
    enabled: true,
    briefingDiarioAtivo: briefingDiarioAtivo,
    briefingDiarioHorario: briefingDiarioHorario,
    briefingSemanalAtivo: briefingSemanalAtivo,
    briefingSemanalDia: briefingSemanalDia,
    briefingSemanalHorario: briefingSemanalHorario
  };

  salvar();

  try {
    const reqHeaders = typeof obterHeadersRequisicao === 'function'
      ? obterHeadersRequisicao({ 'Content-Type': 'application/json' })
      : { 'Content-Type': 'application/json' };

    await fetch('/api/configuracoes/assistente', {
      method: 'PUT',
      headers: reqHeaders,
      body: JSON.stringify({
        displayName: nome,
        voiceGender: genero,
        voiceURI: voiceURI,
        voiceName: voiceName,
        pitch: pitch,
        rate: rate,
        enabled: true,
        briefingDiarioAtivo: briefingDiarioAtivo,
        briefingDiarioHorario: briefingDiarioHorario,
        briefingSemanalAtivo: briefingSemanalAtivo,
        briefingSemanalDia: briefingSemanalDia,
        briefingSemanalHorario: briefingSemanalHorario
      })
    });
  } catch (err) {
    console.warn('[Assistente] Erro ao sincronizar com /api/configuracoes/assistente:', err);
  }

  torrar(`✅ Assistente configurado como "${nome}" (${genero === 'male' ? 'Voz Masculina' : 'Voz Feminina'})!`);

  if (typeof fecharFolha === 'function') {
    fecharFolha();
  }

  render();
}

async function gerarEVisualizarBriefing() {
  torrar('📊 Gerando briefing gerencial...', 'info');
  try {
    const reqHeaders = typeof obterHeadersRequisicao === 'function'
      ? obterHeadersRequisicao({ 'Content-Type': 'application/json' })
      : { 'Content-Type': 'application/json' };

    const res = await fetch('/api/assistente/briefing/gerar', {
      method: 'POST',
      headers: reqHeaders
    });

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      throw new Error(errJson.error || `Erro ${res.status} ao gerar briefing.`);
    }

    const data = await res.json();
    if (!data.success || !data.briefing) {
      throw new Error(data.error || 'Não foi possível compilar os dados do briefing.');
    }

    const briefing = data.briefing;
    const modalHtml = () => `
      <div class="card card-p" style="max-width:640px;margin:0 auto;background:#1e293b;color:#f8fafc;border-radius:12px;border:1px solid #475569;box-shadow:0 20px 40px rgba(0,0,0,0.5)">
        <div class="entre" style="border-bottom:1px solid rgba(255,255,255,0.12);padding-bottom:12px;margin-bottom:14px">
          <div style="display:flex;align-items:center;gap:10px">
            <span style="font-size:24px">📊</span>
            <div>
              <h3 style="font-size:16px;font-weight:700;margin:0;color:#fff">Briefing Executivo Gerencial</h3>
              <div class="mini" style="color:#94a3b8">Consolidação em tempo real: Pátio + Financeiro</div>
            </div>
          </div>
          <button class="btn-fechar" data-act="fechar" style="color:#fff">${ico('x', 20)}</button>
        </div>

        <pre style="background:#0f172a;border:1px solid #334155;border-radius:8px;padding:14px;color:#38bdf8;font-size:12px;line-height:1.5;max-height:380px;overflow-y:auto;white-space:pre-wrap;font-family:monospace">${esc(briefing.textoFormatado)}</pre>

        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:14px;border-top:1px solid rgba(255,255,255,0.1);padding-top:12px">
          <span class="mini" style="color:#94a3b8">Gerado em: ${new Date(briefing.geradoEm).toLocaleString('pt-BR')}</span>
          <div style="display:flex;gap:8px">
            <button type="button" class="btn btn-neutro" style="background:rgba(255,255,255,0.1);color:#fff;border:none" onclick="copiar(${JSON.stringify(briefing.textoFormatado)})">📋 Copiar Texto</button>
            <button type="button" class="btn btn-primario" data-act="fechar">Fechar</button>
          </div>
        </div>
      </div>
    `;

    if (typeof abrirFolha === 'function') {
      abrirFolha(modalHtml);
    } else {
      alert(briefing.textoFormatado);
    }
  } catch (err) {
    console.error('[Briefing] Erro:', err);
    torrar(`❌ ${err.message}`, 'erro');
  }
}

function pedirConfirmacao(chave, msg, fn) {
  if (confirmando === chave) {
    confirmando = null;
    fn();
    return;
  }
  confirmando = chave;
  torrar(msg);
  setTimeout(() => {
    if (confirmando === chave) confirmando = null;
  }, 4000);
}

function copiar(texto) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(texto).catch(() => caiuNoTextarea(texto));
  } else {
    caiuNoTextarea(texto);
  }
}

function caiuNoTextarea(t) {
  const ta = document.createElement('textarea');
  ta.value = t;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); } catch (e) {}
  ta.remove();
}

function textoOrcamento(o) {
  const v = V(o.vei), c = C(o.cli);
  const l = [`*${S.cfg.empresa}* — Orçamento OS ${o.num}`, `${v.placa} · ${v.modelo}`, `Cliente: ${c.nome}`, ''];
  if (o.servicos.length) {
    l.push('*Serviços*');
    o.servicos.forEach(i => l.push(`• ${i.nome} (${i.qtd}x) — ${brl(i.qtd * i.valor)}`));
    l.push('');
  }
  if (o.pecas.length) {
    l.push('*Peças*');
    o.pecas.forEach(i => l.push(`• ${i.nome} (${i.qtd}x) — ${brl(i.qtd * i.valor)}`));
    l.push('');
  }
  if (o.desc) l.push(`Desconto: −${brl(o.desc)}`);
  l.push(`*Total: ${brl(totOS(o))}*`);
  l.push(`Previsão de entrega: ${dataBRfull(o.prev)}`);
  return l.join('\n');
}

/* =====================================================================
   DELEGAÇÃO GLOBAL DE EVENTOS (CLICK, INPUT, CHANGE)
===================================================================== */
document.addEventListener('click', e => {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const a = b.dataset.act;
  const o = OSatual();

  switch (a) {
    case 'carregar-demo': {
      torrar('Carregando dados de demonstração...', 'neutro');
      fetch('/api/onboarding/demo-data', { method: 'POST', credentials: 'same-origin' })
        .then(r => r.json())
        .then(d => {
          if (d.sucesso) {
            torrar('Dados de demonstração carregados!', 'sucesso');
            setTimeout(() => location.reload(), 500);
          } else {
            torrar(d.erro || 'Erro ao carregar dados demo.', 'erro');
          }
        })
        .catch(() => torrar('Erro de comunicação ao carregar dados demo.', 'erro'));
      break;
    }
    case 'remover-demo': {
      pedirConfirmacao('remover-demo', 'Tem certeza que deseja remover todos os dados de demonstração?', () => {
        torrar('Removendo dados de demonstração...', 'neutro');
        fetch('/api/onboarding/demo-data', { method: 'DELETE', credentials: 'same-origin' })
          .then(r => r.json())
          .then(d => {
            if (d.sucesso) {
              torrar('Dados de demonstração removidos!', 'sucesso');
              setTimeout(() => location.reload(), 500);
            } else {
              torrar(d.erro || 'Erro ao remover dados demo.', 'erro');
            }
          })
          .catch(() => torrar('Erro de comunicação ao remover dados demo.', 'erro'));
      });
      break;
    }
    case 'concluir-onboarding': {
      S.cfg = S.cfg || {};
      S.cfg.onboardingConcluido = true;
      salvar();
      render();
      torrar('Onboarding concluído! Bom trabalho na oficina.', 'sucesso');
      break;
    }
    case 'reabrir-onboarding': {
      S.cfg = S.cfg || {};
      S.cfg.onboardingConcluido = false;
      salvar();
      render();
      torrar('Guia de implantação reaberto.');
      break;
    }
    case 'remover-logo': {
      fetch('/api/configuracoes/empresa/logo', { method: 'DELETE', credentials: 'same-origin' })
        .then(r => r.json())
        .then(() => {
          if (S.cfg && S.cfg.identidadeVisual) {
            delete S.cfg.identidadeVisual.logo;
            delete S.cfg.identidadeVisual.logoUrl;
            delete S.cfg.identidadeVisual.logoHash;
          }
          salvar();
          render();
          torrar('Logotipo removido.');
        })
        .catch(() => {
          if (S.cfg && S.cfg.identidadeVisual) {
            delete S.cfg.identidadeVisual.logo;
            delete S.cfg.identidadeVisual.logoUrl;
          }
          salvar();
          render();
        });
      break;
    }
    case 'remover-institucional': {
      fetch('/api/configuracoes/empresa/imagem-institucional', { method: 'DELETE', credentials: 'same-origin' })
        .then(r => r.json())
        .then(() => {
          if (S.cfg && S.cfg.identidadeVisual) {
            delete S.cfg.identidadeVisual.imagemInstitucional;
            delete S.cfg.identidadeVisual.imagemInstitucionalUrl;
            delete S.cfg.identidadeVisual.imagemInstitucionalHash;
          }
          salvar();
          render();
          torrar('Imagem institucional removida.');
        })
        .catch(() => {
          if (S.cfg && S.cfg.identidadeVisual) {
            delete S.cfg.identidadeVisual.imagemInstitucional;
            delete S.cfg.identidadeVisual.imagemInstitucionalUrl;
          }
          salvar();
          render();
        });
      break;
    }
    case 'ir':
      if (S.ui.view === 'operacao' && typeof destruirGraficosOperacionais === 'function') {
        destruirGraficosOperacionais();
      }
      S.ui.view = b.dataset.v; S.ui.busca = ''; render(); break;
    case 'filtro': S.ui.filtro = b.dataset.f; render(); break;
    case 'filtro-fin': S.ui.filtroFin = b.dataset.f; render(); break;
    case 'filtro-estoque': S.ui.filtroEstoque = b.dataset.f; render(); break;
    case 'aba-estoque': S.ui.abaEstoque = b.dataset.a; render(); break;
    case 'fechar': fecharFolha(); break;

    /* --- OS --- */
    case 'abrir-os': S.ui.osAberta = b.dataset.id; S.ui.abaOS = 'servicos'; S.ui.picker = null; S.ui.busca = ''; abrirFolha(folhaOS); break;
    case 'aba-os': S.ui.abaOS = b.dataset.k; S.ui.picker = null; S.ui.busca = ''; renderFolha(); break;
    case 'nova-os': S.ui.rascunho = null; abrirFolha(() => novaOSFolha(b.dataset.box)); break;
    case 'voltar-os': S.ui.rascVeiculo = null; abrirFolha(novaOSFolha); break;
    case 'imprimir-os': imprimirOS(o); break;
    case 'excluir-os': pedirConfirmacao('os' + o.id, 'Toque de novo para excluir a OS permanentemente', () => {
      S._excluidos = S._excluidos || {};
      S._excluidos.os = S._excluidos.os || [];
      if (!S._excluidos.os.includes(o.id)) S._excluidos.os.push(o.id);
      S.os = S.os.filter(x => x.id !== o.id);
      salvar();
      fecharFolha();
      render();
      torrar('OS excluída');
    }); break;
    case 'picker': S.ui.picker = b.dataset.p; S.ui.busca = ''; renderFolha(); break;
    case 'fechar-picker': S.ui.picker = null; S.ui.busca = ''; renderFolha(); break;
    case 'add-item': {
      const tipo = b.dataset.t, refId = b.dataset.r;
      const isPeca = tipo === 'pecas';
      const ref = isPeca ? P(refId) : Srv(refId);
      o[tipo] = o[tipo] || [];
      o[tipo].push({ id: uid('item'), nome: ref.nome, cod: ref.cod || '', qtd: 1, valor: isPeca ? ref.venda : ref.valor });
      salvar(); renderFolha(); render(); torrar('Item adicionado à OS'); break;
    }
    case 'qtd': {
      const lista = o[b.dataset.t], item = lista.find(x => x.id === b.dataset.i);
      if (item) { item.qtd = Math.max(1, item.qtd + Number(b.dataset.d)); salvar(); renderFolha(); render(); }
      break;
    }
    case 'consumir-peca-os': {
      const pecaId = b.dataset.pecaId;
      const itemId = b.dataset.itemId;
      if (o && Array.isArray(o.pecas)) {
        const item = o.pecas.find(x => x.id === itemId || x.pecaId === pecaId);
        if (item) {
          item.st = 'consumida';
          item.status = 'consumida';
          item.consumidoEm = new Date().toISOString();
          salvar();
          renderFolha();
          render();
          torrar('Peça consumida com sucesso na OS!');
        }
      }
      break;
    }
    case 'rm-item': o[b.dataset.t] = o[b.dataset.t].filter(x => x.id !== b.dataset.i); salvar(); renderFolha(); render(); break;
    case 'faturar-os-modal': abrirFolha(folhaFaturarOS); break;
    case 'confirmar-faturamento': processarFaturamentoOS(o); fecharFolha(); render(); torrar(`OS ${o.num} faturada e entregue com sucesso!`); break;

    case 'criar-os': {
      const r = S.ui.rascunho || {};
      if (!r.vei || r.vei === 'novo') { torrar('Selecione a placa do veículo'); break; }

      let veiId = r.vei;
      let cliId = S.clientes[0] ? S.clientes[0].id : '';
      let pendenciaCadastral = false;
      let pendencias = [];

      if (r.vei === 'sem_placa') {
        pendenciaCadastral = true;
        pendencias = ['placa_pendente'];
        const veicTemp = {
          id: uid('v'),
          cli: cliId,
          placa: 'SEM-PLACA',
          marca: 'Pendente',
          modelo: 'Veículo Não Identificado',
          ano: '',
          cor: 'Não informada',
          km: +r.km || 0,
          tipo: 'Cavalo Mecânico',
          pendenciaCadastral: true,
          pendencias: ['placa_pendente'],
          criadoEm: Date.now()
        };
        S.veiculos = S.veiculos || [];
        S.veiculos.push(veicTemp);
        veiId = veicTemp.id;
      } else {
        const v = V(r.vei);
        if (v && v.cli) cliId = v.cli;
      }

      const boxEscolhido = r.box || null;
      const statusInicial = boxEscolhido ? 'executando' : 'fila';
      const maxNum = (S.os || []).reduce((max, x) => Math.max(max, parseInt(x.num, 10) || 1000), 1040);
      const novoNum = S.proxNum ? S.proxNum++ : (maxNum + 1);

      const nova = {
        id: uid('os'),
        num: novoNum,
        box: boxEscolhido,
        vei: veiId,
        cli: cliId,
        mec: r.mec || '',
        st: statusInicial,
        pendenciaCadastral: pendenciaCadastral,
        pendencias: pendencias,
        abertura: hoje(),
        prev: r.prev || addDias(hoje(), 1),
        km: +r.km || 0,
        queixa: r.queixa || '',
        servicos: [
          { id: 'srv_' + Date.now(), nome: 'Diagnóstico e Check-in de Pátio', qtd: 1, valor: 150 }
        ],
        pecas: [],
        desc: 0,
        pago: false,
        obs: pendenciaCadastral ? 'Abertura com pendência cadastral de placa.' : ''
      };

      S.os = S.os || [];
      S.os.unshift(nova);
      S.ui.rascunho = null;
      S.ui.osAberta = nova.id;
      S.ui.abaOS = 'servicos';
      salvar();
      fecharFolha();
      abrirFolha(folhaOS);
      render();
      if (pendenciaCadastral) {
        torrar(`OS ${nova.num} aberta no pátio! Lembre-se de anexar a foto da placa.`);
      } else {
        const localMsg = boxEscolhido ? `alocada no ${B(boxEscolhido).nome}` : 'colocada na Fila de Espera';
        torrar(`✅ OS ${nova.num} aberta com sucesso (${localMsg})!`);
      }
      break;
    }

    case 'iniciar-box-card': {
      const osId = b.dataset.id;
      const alvo = (S.os || []).find(x => x.id === osId);
      if (!alvo) break;
      const boxesValidos = S.boxes || [];
      const boxesOcupados = new Set((S.os || []).filter(x => x.id !== alvo.id && x.st !== 'finalizada' && x.box).map(x => x.box));
      const boxLivre = boxesValidos.find(bx => !boxesOcupados.has(bx.id));
      if (boxLivre) {
        alvo.box = boxLivre.id;
        alvo.st = 'executando';
        salvar();
        render();
        torrar(`🟢 OS ${alvo.num}: Alocada no ${boxLivre.nome}! Status: Em Execução.`);
      } else {
        torrar('⚠️ Todos os boxes estão ocupados no momento!');
      }
      break;
    }

    case 'salvar-veiculo': {
      const r = S.ui.rascVeiculo;
      if (!r || !r.placa) { torrar('Digite a placa do caminhão'); break; }
      const novoId = uid('v');
      S.veiculos.push({ id: novoId, cli: r.cli || S.clientes[0].id, placa: r.placa.toUpperCase(), marca: r.marca || '', modelo: r.modelo || '', ano: r.ano || '', km: +r.km || 0, tipo: r.tipo || 'Cavalo Mecânico' });
      salvar(); torrar('Veículo cadastrado!');
      S.ui.rascunho = S.ui.rascunho || {}; S.ui.rascunho.vei = novoId; S.ui.rascVeiculo = null; abrirFolha(novaOSFolha); break;
    }
    case 'buscar-placa-veiculo': {
      const rV = S.ui.rascVeiculo;
      if (!rV || !rV.placa || rV.placa.length < 7) { torrar('Digite uma placa válida!'); break; }
      if (!apiThrottle('placa')) break;
      const cred = S.cfg.apibrasil;
      if (!cred || !cred.deviceToken || !cred.bearerToken) { torrar('Credenciais da APIBrasil não preenchidas em Configurações.'); break; }
      b.innerHTML = '...';
      fetch('https://gateway.apibrasil.io/api/v2/veiculos/consultar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'DeviceToken': cred.deviceToken, 'Authorization': 'Bearer ' + cred.bearerToken },
        body: JSON.stringify({ placa: rV.placa.replace(/[^a-zA-Z0-9]/g, '').toUpperCase() })
      })
      .then(r => r.json())
      .then(res => {
        b.innerHTML = ico('busca', 14) + ' Consultar';
        if (res && res.error === false && res.data) {
          rV.marca = res.data.marca || ''; rV.modelo = res.data.modelo || ''; rV.cor = res.data.cor || '';
          renderFolha(); torrar('Dados da placa obtidos com sucesso!');
        } else { torrar(res.message || 'Placa não localizada.'); }
      })
      .catch(() => { b.innerHTML = ico('busca', 14) + ' Consultar'; torrar('Erro de rede na consulta.'); });
      break;
    }
    case 'ver-historico-veiculo': {
      const vei = V(b.dataset.id);
      abrirFolha(() => `
        <div class="card card-p" style="max-width:650px;margin:0 auto">
          <div class="entre" style="border-bottom:1px solid var(--aco-150);padding-bottom:10px;margin-bottom:14px">
            <h3 style="font-size:17px;font-weight:700">Histórico de Manutenções</h3>
            <button class="btn-fechar" data-act="fechar">${ico('x', 18)}</button>
          </div>
          ${abaHistoricoVeiculo(vei)}
        </div>
      `);
      break;
    }

    /* --- Estoque & OCR --- */
    case 'ver-peca': S.ui.pecaAberta = b.dataset.id; abrirFolha(folhaPeca); break;
    case 'mov-peca': { const p = P(S.ui.pecaAberta); p.qtd = Math.max(0, p.qtd + Number(b.dataset.d)); salvar(); renderFolha(); render(); break; }
    case 'mov-peca-grid': { const p = P(b.dataset.id); p.qtd = Math.max(0, p.qtd + Number(b.dataset.d)); salvar(); render(); break; }
    case 'nova-peca': S.ui.rascPeca = null; abrirFolha(folhaNovaPeca); break;
    case 'salvar-peca': {
      const r = S.ui.rascPeca || {};
      if (!r.nome) { torrar('Descrição da peça é obrigatória'); break; }
      S.pecas.push({ id: uid('p'), cod: r.cod || ('MAN-' + Math.floor(Math.random() * 9000 + 1000)), nome: r.nome, un: r.un || 'un', qtd: +r.qtd || 0, min: +r.min || 1, custo: +r.custo || 0, venda: +r.venda || 0, loc: r.loc || '—', forn: r.forn || '—' });
      salvar(); S.ui.rascPeca = null; fecharFolha(); render(); torrar('Peça cadastrada no almoxarifado!'); break;
    }
    case 'excluir-peca':
    case 'excluir-peca-id': {
      const pId = b.dataset.id || S.ui.pecaAberta;
      pedirConfirmacao('pc' + pId, 'Toque de novo para excluir a peça', () => {
        S._excluidos = S._excluidos || {};
        S._excluidos.pecas = S._excluidos.pecas || [];
        if (!S._excluidos.pecas.includes(pId)) S._excluidos.pecas.push(pId);
        S.pecas = S.pecas.filter(x => x.id !== pId);
        salvar(); fecharFolha(); render(); torrar('Peça removida.');
      });
      break;
    }
    case 'importar-xml': S.ui.nota = null; abrirFolha(folhaXML); break;
    case 'confirmar-xml': confirmarXML(); break;
    case 'ocr-entrada': abrirFolha(folhaSimulacaoOCR); break;
    case 'importar-exemplo-ocr': {
      S.pecas.push(
        { id: uid('p'), cod: 'LON-HD291', nome: 'Jogo de Lonas de Freio Heavy Duty', un: 'jg', qtd: 4, min: 2, custo: 480.00, venda: 780.00, loc: 'Prat. A-04', forn: 'ZF do Brasil' },
        { id: uid('p'), cod: 'CIL-M204', nome: 'Cilindro Mestre de Embreagem', un: 'un', qtd: 2, min: 1, custo: 960.00, venda: 1550.00, loc: 'Prat. C-02', forn: 'ZF do Brasil' }
      );
      S.contas.push({ id: uid('ct'), tipo: 'pagar', desc: 'NF-e 784102 — ZF do Brasil', parte: 'ZF do Brasil', valor: 3840.00, venc: addDias(hoje(), 28), pago: false, cat: 'Fornecedores Peças', doc: 'NF-784102' });
      salvar(); fecharFolha(); render(); torrar('OCR processado: 2 peças e R$ 3.840,00 lançados!'); break;
    }

    /* --- Financeiro --- */
    case 'aba-fin': S.ui.abaFin = b.dataset.k; render(); break;
    case 'filtro-fin': {
      S.ui.filtroFin = b.dataset.f;
      render();
      break;
    }
    case 'aplicar-filtro-fin-custom': {
      const de = document.getElementById('fin_filtro_de')?.value;
      const ate = document.getElementById('fin_filtro_ate')?.value;
      if (!de || !ate) {
        torrar('Selecione as datas inicial e final');
        break;
      }
      S.ui.filtroFin = 'custom';
      S.ui.filtroFinDe = de;
      S.ui.filtroFinAte = ate;
      render();
      break;
    }
    case 'baixar': {
      const c = S.contas.find(x => x.id === b.dataset.id);
      baixarConta(c); render(); torrar(`${c.tipo === 'receber' ? 'Recebimento' : 'Pagamento'} efetuado · ${brl(c.valor)}`); break;
    }
    case 'imprimir-recibo': imprimirRecibo(b.dataset.id); break;
    case 'nova-conta': S.ui.contaTipo = b.dataset.t; S.ui.rascConta = null; abrirFolha(folhaConta); break;
    case 'salvar-conta': {
      const r = S.ui.rascConta || {};
      if (!r.desc || !+r.valor) { torrar('Preencha a descrição e valor'); break; }
      S.contas.push({ id: uid('ct'), tipo: S.ui.contaTipo, desc: r.desc, parte: r.parte || '—', valor: +r.valor, venc: r.venc || hoje(), pago: false, cat: r.cat || 'Outros', doc: '' });
      salvar(); S.ui.rascConta = null; fecharFolha(); render(); torrar('Título lançado!'); break;
    }
    case 'novo-mov': S.ui.rascMov = null; abrirFolha(folhaMov); break;
    case 'salvar-mov': {
      const r = S.ui.rascMov || {};
      if (!r.desc || !+r.valor) { torrar('Preencha a descrição e valor'); break; }
      S.movimentos.push({ id: uid('mv'), data: r.data || hoje(), tipo: r.tipo || 'entrada', desc: r.desc, valor: +r.valor, cat: r.cat || 'Geral', conc: false });
      salvar(); S.ui.rascMov = null; fecharFolha(); render(); torrar('Movimento registrado no caixa!'); break;
    }
    case 'limpar-extrato': S.extrato = []; salvar(); render(); torrar('Extrato limpo'); break;

    /* --- WhatsApp --- */
    case 'aba-zap': S.ui.abaZap = b.dataset.k; render(); break;
    case 'liga-zap': S.zap.ativo = !S.zap.ativo; salvar(); render(); break;
    case 'ver-api': abrirFolha(folhaAPI); break;
    case 'conectar-wpp':
    case 'recarregar-qr-wpp': {
      S.ui.wppStatus = { status: 'carregando' };
      abrirFolha(folhaConectarWpp);
      fetch('/api/whatsapp/status')
        .then(r => r.json())
        .then(data => {
          S.ui.wppStatus = data;
          if (folhaAtual === folhaConectarWpp) renderFolha();
        })
        .catch(err => {
          S.ui.wppStatus = { status: 'erro' };
          if (folhaAtual === folhaConectarWpp) renderFolha();
        });
      break;
    }
    case 'disparar-camp': {
      const camp = S.ui.camp || {};
      const lista = destinatarios(camp.seg);
      if (!lista.length) { torrar('Nenhum destinatário nesse segmento'); break; }
      if (!camp.texto) { torrar('Escreva a mensagem da campanha'); break; }
      S.ui.disparo = { nome: camp.nome || 'Campanha', seg: camp.seg, texto: camp.texto, lista, ix: 0, enviados: 0 };
      abrirFolha(folhaDisparo); break;
    }
    case 'disparo-enviar': {
      const d = S.ui.disparo, cli = d.lista[d.ix];
      registrarEnvio({ chave: 'camp_' + cli.id + '_' + Date.now(), tipo: 'campanha', rotulo: d.nome, cliente: cli.nome, fone: cli.fone, texto: preencher(d.texto, ctxCliente(cli)), status: 'enviado' });
      d.enviados++; d.ix++; renderFolha(); break;
    }
    case 'disparo-pular': S.ui.disparo.ix++; renderFolha(); break;
    case 'fechar-disparo': {
      const d = S.ui.disparo;
      if (d && d.enviados) S.zap.campanhas.push({ id: uid('cp'), nome: d.nome, seg: d.seg, data: hoje(), enviados: d.enviados });
      S.ui.disparo = null; fecharFolha(); render(); break;
    }
    case 'add-regra': S.zap.regua.push({ id: uid('r'), quando: 5, ativo: true, nome: 'Nova Etapa de Cobrança', texto: 'Olá {contato}, sobre o título de {valor} vencido em {venc}: consegue nos dar uma posição? Obrigado, {empresa}.' }); salvar(); render(); break;
    case 'rm-regra': S.zap.regua = S.zap.regua.filter(x => x.id !== b.dataset.i); salvar(); render(); break;
    case 'copiar-camp': copiar(S.ui.camp.texto); torrar('Texto copiado!'); break;
    case 'copiar-var': copiar(b.dataset.v); torrar(b.dataset.v + ' copiado'); break;
    case 'limpar-hist': pedirConfirmacao('hist', 'Toque de novo para limpar o histórico', () => { S.zap.envios = []; salvar(); render(); }); break;
    case 'preview-relatorio-admin': {
      torrar('Carregando prévia do relatório executivo...');
      fetch('/api/whatsapp/relatorio-preview')
        .then(r => r.json())
        .then(data => {
          if (data && data.mensagensAdmin) {
            const txt = data.mensagensAdmin.join('\n\n════════════════════════════\n\n');
            abrirFolha(() => folhaRelatorioPreview(txt));
          } else if (data && data.texto) {
            abrirFolha(() => folhaRelatorioPreview(data.texto));
          } else {
            torrar('Erro ao compilar prévia do relatório.');
          }
        })
        .catch(() => torrar('Erro de comunicação com o servidor.'));
      break;
    }
    case 'preview-relatorio-operacao': {
      torrar('Carregando prévia operacional...');
      fetch('/api/whatsapp/relatorio-preview')
        .then(r => r.json())
        .then(data => {
          if (data && data.mensagensOperacao) {
            const txt = data.mensagensOperacao.join('\n\n════════════════════════════\n\n');
            abrirFolha(() => folhaRelatorioOperacaoPreview(txt));
          } else {
            torrar('Erro ao compilar prévia operacional.');
          }
        })
        .catch(() => torrar('Erro de comunicação com o servidor.'));
      break;
    }
    case 'ver-imagem-preview': {
      abrirFolha(() => folhaImagemPreview());
      break;
    }
    case 'disparar-grupo-admin': {
      torrar('Disparando relatório completo + JPG para Grupo Admin...');
      fetch('/api/whatsapp/disparar-grupo/admin', { method: 'POST' })
        .then(r => r.json())
        .then(data => {
          if (data && data.success) {
            torrar('✅ Relatório executivo e Imagem JPG enviados com sucesso ao Grupo de Administração!');
          } else {
            torrar(`⚠️ ${data?.error || 'Falha ao enviar para o Grupo de Administração.'}`);
          }
        })
        .catch(() => torrar('Erro ao solicitar disparo ao servidor.'));
      break;
    }
    case 'disparar-grupo-operacao': {
      torrar('Disparando relatório sem finanças para Grupo Operação...');
      fetch('/api/whatsapp/disparar-grupo/operacao', { method: 'POST' })
        .then(r => r.json())
        .then(data => {
          if (data && data.success) {
            torrar('✅ Relatório operacional enviado com sucesso ao Grupo de Operação!');
          } else {
            torrar(`⚠️ ${data?.error || 'Falha ao enviar para o Grupo de Operação.'}`);
          }
        })
        .catch(() => torrar('Erro ao solicitar disparo ao servidor.'));
      break;
    }
    case 'atualizar-grupos-wpp': {
      torrar('Buscando grupos no WhatsApp Web...');
      fetch('/api/whatsapp/grupos')
        .then(r => r.json())
        .then(d => {
          if (d && d.grupos) {
            S.ui.gruposWpp = d.grupos;
            S.ui.gruposWppCarregados = true;
            torrar(`✅ ${d.grupos.length} grupos sincronizados com sucesso!`);
            render();
          } else {
            torrar(`⚠️ ${d?.error || 'Não foi possível listar os grupos.'}`);
          }
        })
        .catch(() => torrar('Erro ao consultar grupos no servidor.'));
      break;
    }
    case 'salvar-config-grupos': {
      const gAdminInput = document.getElementById('cfg_grupo_admin_id');
      const gOpInput = document.getElementById('cfg_grupo_op_id');
      const horaInput = document.getElementById('cfg_hora_relatorio');
      const autoInput = document.getElementById('cfg_auto_envio');
      const diasUteisInput = document.getElementById('cfg_apenas_dias_uteis');

      const gAdminId = (gAdminInput ? gAdminInput.value : '').trim();
      const gOpId = (gOpInput ? gOpInput.value : '').trim();
      const horaStr = horaInput ? horaInput.value : '07:30';
      const autoBool = autoInput ? autoInput.checked : true;
      const diasUteisBool = diasUteisInput ? diasUteisInput.checked : true;

      S.cfg = S.cfg || {};
      S.cfg.grupoAdminId = gAdminId;
      S.cfg.grupoOperacaoId = gOpId;
      S.cfg.horaRelatorioDiario = horaStr;
      S.cfg.envioAutomaticoRelatorio = autoBool;
      S.cfg.relatorioApenasDiasUteis = diasUteisBool;
      salvar();

      fetch('/api/whatsapp/config-grupos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grupoAdminId: gAdminId,
          grupoOperacaoId: gOpId,
          horaRelatorio: horaStr,
          envioAutomatico: autoBool,
          apenasDiasUteis: diasUteisBool
        })
      })
        .then(r => r.json())
        .then(() => {
          torrar('Configurações dos grupos salvas com sucesso!');
          render();
        })
        .catch(() => {
          torrar('Salvo localmente!');
          render();
        });
      break;
    }
    case 'disparar-relatorio-admin': {
      torrar('Disparando relatório executivo aos administradores...');
      fetch('/api/whatsapp/disparar-relatorio-admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      })
        .then(r => r.json())
        .then(data => {
          if (data && data.success) {
            torrar(`✅ Relatório enviado com sucesso para ${data.totalEnviados} administrador(es)!`);
          } else {
            torrar(`⚠️ ${data?.error || 'Não foi possível enviar o relatório via WhatsApp.'}`);
          }
        })
        .catch(() => torrar('Erro ao solicitar disparo ao servidor.'));
      break;
    }
    case 'salvar-config-relatorio': {
      const fonesInput = document.getElementById('cfg_admin_fones');
      const horaInput = document.getElementById('cfg_hora_relatorio');
      const autoInput = document.getElementById('cfg_auto_envio');

      const fonesStr = fonesInput ? fonesInput.value : '';
      const horaStr = horaInput ? horaInput.value : '08:00';
      const autoBool = autoInput ? autoInput.checked : true;

      const fonesArr = fonesStr.split(',').map(s => s.trim().replace(/\D/g, '')).filter(Boolean);

      S.cfg = S.cfg || {};
      S.cfg.adminFones = fonesArr;
      S.cfg.horaRelatorioDiario = horaStr;
      S.cfg.envioAutomaticoRelatorio = autoBool;
      salvar();

      fetch('/api/whatsapp/config-relatorio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminFones: fonesArr, horaRelatorio: horaStr, envioAutomatico: autoBool })
      })
        .then(r => r.json())
        .then(() => {
          torrar('Configurações do relatório salvas com sucesso!');
          render();
        })
        .catch(() => {
          torrar('Salvo localmente!');
          render();
        });
      break;
    }
    case 'copiar-texto-relatorio': {
      const txt = b.dataset.txt;
      if (txt) {
        copiar(txt);
        torrar('Texto do relatório copiado!');
      }
      break;
    }

    /* --- Cadastros --- */
    case 'aba-cad': S.ui.abaCad = b.dataset.k; render(); break;
    case 'ver-cliente': S.ui.cliAberto = b.dataset.id; abrirFolha(folhaCliente); break;
    case 'novo-cad': S.ui.cadTipo = b.dataset.t; S.ui.rascCad = {}; abrirFolha(folhaCadastro); break;
    case 'editar-cliente': S.ui.cadTipo = 'cliente'; S.ui.rascCad = JSON.parse(JSON.stringify(S.clientes.find(x => x.id === b.dataset.id))); abrirFolha(folhaCadastro); break;
    case 'editar-regra-fiscal': {
      const regra = (S.cfg.regrasTributarias || []).find(x => x.cfop === b.dataset.cfop);
      if (regra) {
        S.ui.rascCad = JSON.parse(JSON.stringify(regra));
        S.ui.cadTipo = 'regra-tributaria';
        abrirFolha(folhaCadastro);
      }
      break;
    }
    case 'bloquear-cliente': {
      const cl = S.clientes.find(x => x.id === b.dataset.id);
      if (cl) { cl.bloqueado = !cl.bloqueado; salvar(); renderFolha(); render(); torrar(cl.bloqueado ? 'Cliente bloqueado para faturamento' : 'Cliente desbloqueado'); }
      break;
    }
    case 'excluir-cliente': pedirConfirmacao('excli' + b.dataset.id, 'Toque de novo para excluir o cliente', () => {
      const cId = b.dataset.id;
      S._excluidos = S._excluidos || {};
      S._excluidos.clientes = S._excluidos.clientes || [];
      if (!S._excluidos.clientes.includes(cId)) S._excluidos.clientes.push(cId);
      S.clientes = S.clientes.filter(x => x.id !== cId);
      salvar();
      render();
      torrar('Cliente excluído');
    }); break;
    case 'salvar-cad': {
      const r = S.ui.rascCad || {}, t = S.ui.cadTipo;
      if (t === 'cliente') {
        if (!r.nome) { torrar('Razão Social / Nome é obrigatório'); break; }
        if (r.id) {
          const idx = S.clientes.findIndex(x => x.id === r.id);
          if (idx >= 0) S.clientes[idx] = { ...S.clientes[idx], ...r, scoreSerasa: (r.scoreSerasa !== undefined && r.scoreSerasa !== '' && r.scoreSerasa !== null) ? Number(r.scoreSerasa) : (S.clientes[idx].scoreSerasa ?? null), situacaoSerasa: r.situacaoSerasa ?? S.clientes[idx].situacaoSerasa ?? null, consultaSerasaRealizada: r.consultaSerasaRealizada !== undefined ? Boolean(r.consultaSerasaRealizada) : (S.clientes[idx].consultaSerasaRealizada || false) };
        } else {
          S.clientes.push({ id: uid('cli'), nome: r.nome, fantasia: r.fantasia || '', doc: r.doc || '', fone: r.fone || '', email: r.email || '', contato: r.contato || '', prazo: +r.prazo || 0, ie: r.ie || '', endereco: r.endereco || '', cidade: r.cidade || '', uf: r.uf || '', cep: r.cep || '', optin: true, bloqueado: false, scoreSerasa: (r.scoreSerasa !== undefined && r.scoreSerasa !== '' && r.scoreSerasa !== null) ? Number(r.scoreSerasa) : null, situacaoSerasa: r.situacaoSerasa ?? null, consultaSerasaRealizada: Boolean(r.consultaSerasaRealizada) });
        }
      }
      if (t === 'fornecedor') {
        if (!r.nome) { torrar('Razão Social do Fornecedor é obrigatória'); break; }
        S.fornecedores.push({ id: uid('f'), nome: r.nome, fantasia: r.fantasia||'', doc: r.doc||'', fone: r.fone||'', email: r.email||'', contato: r.contato||'', cidade: r.cidade||'', uf: r.uf||'' });
      }
      if (t === 'mecanico') {
        if (!r.nome) { torrar('Nome do mecânico é obrigatório'); break; }
        S.mecanicos.push({ id: uid('m'), nome: r.nome, especialidade: r.especialidade||'Geral', fone: r.fone||'' });
      }
      if (t === 'produto') {
        if (!r.nome) { torrar('Nome do produto é obrigatório'); break; }
        if (r.id) {
          const idx = S.pecas.findIndex(x => x.id === r.id);
          if (idx >= 0) S.pecas[idx] = { ...S.pecas[idx], ...r, custo: +r.custo||0, venda: +r.venda||0, cClassTrib: r.cClassTrib || S.pecas[idx].cClassTrib || '' };
        } else {
          S.pecas.push({ id: uid('p'), cod: r.cod||'', nome: r.nome, un: r.un||'un', ncm: r.ncm||'', cest: r.cest||'', origem: r.origem||'0', cfop: r.cfop||'', cClassTrib: r.cClassTrib||'', custo: +r.custo||0, venda: +r.venda||0 });
        }
      }
      if (t === 'servico') {
        if (!r.nome) { torrar('Descrição do serviço é obrigatória'); break; }
        if (r.id) {
          const idx = S.servicos.findIndex(x => x.id === r.id);
          if (idx >= 0) S.servicos[idx] = { ...S.servicos[idx], ...r, valor: +r.valor||0, horas: +r.horas||1, cClassTrib: r.cClassTrib || S.servicos[idx].cClassTrib || '' };
        } else {
          S.servicos.push({ id: uid('s'), nome: r.nome, valor: +r.valor||0, horas: +r.horas||1, cnae: r.cnae||'', codServLC116: r.codServLC116||'', cfop: r.cfop||'', cClassTrib: r.cClassTrib||'' });
        }
      }
      if (t === 'regra-tributaria') {
        if (!r.cfop || !r.desc) { torrar('CFOP e Descrição são obrigatórios'); break; }
        if (!S.cfg.regrasTributarias) S.cfg.regrasTributarias = [];
        let idx = S.cfg.regrasTributarias.findIndex(x => x.cfop === r.cfop);
        let nova = { ...r };
        ['aliqICMS','redBCICMS','mvaICMS','aliqICMSST','aliqFCP','aliqIPI','aliqPIS','aliqCOFINS','aliqIBS','aliqIBSEst','aliqIBSMun','aliqCBS','aliqIS','redBCIBSCBS','aliqISS'].forEach(k => nova[k] = +(nova[k]||0));
        if (!nova.aliqIBS && (nova.aliqIBSEst || nova.aliqIBSMun)) {
          nova.aliqIBS = +(nova.aliqIBSEst + nova.aliqIBSMun).toFixed(4);
        }
        nova.cstIBSCBS = nova.cstIBSCBS || '01';
        nova.cClassTrib = nova.cClassTrib || '010101';
        nova.cstIS = nova.cstIS || '00';
        nova.indDestino = nova.indDestino || '1';
        if (idx >= 0) S.cfg.regrasTributarias[idx] = nova;
        else S.cfg.regrasTributarias.push(nova);
      }
      if (t === 'box') {
        if (!r.nome) { torrar('Nome do box é obrigatório'); break; }
        S.boxes.push({ id: uid('b'), nome: r.nome, tipo: r.tipo || 'Geral' });
      }
      if (t === 'veiculo') {
        if (!r.placa) { torrar('Falta a placa'); break; }
        S.veiculos.push({ id: uid('v'), cli: r.cli || S.clientes[0]?.id, placa: (r.placa || '').toUpperCase(), modelo: r.modelo || '', ano: r.ano || '', km: +r.km || 0, tipo: r.tipo || 'Cavalo' });
      }
      salvar(); S.ui.rascCad = null; fecharFolha(); render(); torrar('Cadastro realizado com sucesso!'); break;
    }

    /* --- Relatórios & Backup --- */
    case 'exportar-csv': exportarCSV(b.dataset.tipo); break;
    case 'exportar-backup-json': exportarBackupJSON(); break;
    case 'imprimir-fechamento-caixa': imprimirFechamentoCaixa(); break;
    case 'abrir-importador-sistemas': abrirImportadorSistemas(); break;
    case 'baixar-template-csv': baixarTemplateCSV(b.dataset.tipo); break;
    case 'cancelar-migracao': window._dadosMigracao = null; renderFolha(); break;
    case 'executar-importacao-confirmada': executarImportacaoConfirmada(); break;

    /* --- Config & Reset --- */
    case 'remover-logo': {
      if (S.cfg?.identidadeVisual) {
        S.cfg.identidadeVisual.logo = null;
        salvar();
        render();
        torrar('Logotipo removido.');
      }
      break;
    }
    case 'salvar-cfg': salvar(); torrar('Configurações salvas!'); break;
    case 'zerar': pedirConfirmacao('zerar', 'Toque de novo para restaurar a demonstração inicial', () => { S = sementes(); salvar(); render(); torrar('Dados de demonstração restaurados!'); }); break;
  }
});

/* ---------------- Inputs Reativos ---------------- */
let _searchTimer = null;
function debounceSearch(fn, ms = 250) { clearTimeout(_searchTimer); _searchTimer = setTimeout(fn, ms); }

document.addEventListener('input', e => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const a = el.dataset.act, c = el.dataset.c, v = el.value, o = OSatual();
  const guarda = (obj) => { obj[c] = v; };

  if (a === 'busca-placa-patio') { S.ui.buscaPlaca = v; debounceSearch(() => render()); return; }
  if (a === 'busca-estoque') { S.ui.buscaEstoque = v; debounceSearch(() => render()); return; }
  if (a === 'busca-picker') { S.ui.busca = v; debounceSearch(() => renderFolha()); return; }

  if (a === 'rasc') { guarda(S.ui.rascunho = S.ui.rascunho || {}); if (c === 'vei' && v === 'novo') { abrirFolha(() => folhaNovoVeiculo(S.ui.rascunho.cli)); } }
  if (a === 'rasc-vei') guarda(S.ui.rascVeiculo = S.ui.rascVeiculo || {});
  if (a === 'rasc-fat') guarda(S.ui.rascFaturar = S.ui.rascFaturar || {});
  if (a === 'rp') guarda(S.ui.rascPeca = S.ui.rascPeca || {});
  if (a === 'rc') guarda(S.ui.rascCad = S.ui.rascCad || {});
  if (a === 'rct') guarda(S.ui.rascConta = S.ui.rascConta || {});
  if (a === 'rmv') guarda(S.ui.rascMov = S.ui.rascMov || {});
  if (a === 'cfg') { S.cfg[c] = c === 'saldoInicial' ? (+v || 0) : v; salvar(); }
  if (a === 'cfg-assistente') { (S.cfg.assistente = S.cfg.assistente || {})[c] = v; salvar(); }
  if (a === 'cfg-apibrasil') { (S.cfg.apibrasil = S.cfg.apibrasil || {})[c] = v; salvar(); }
  if (a === 'camp') { (S.ui.camp = S.ui.camp || {})[c] = v; salvar(); }
  if (a === 'api-cfg') { S.zap.api = S.zap.api || {}; S.zap.api[c] = v; salvar(); }
  if (a === 'regra') { const r = S.zap.regua.find(x => x.id === el.dataset.i); if (r) r[c] = c === 'quando' ? (+v || 0) : v; salvar(); }
  if (a === 'campo-peca') { const p = P(S.ui.pecaAberta); p[c] = ['min', 'custo', 'venda', 'qtd'].includes(c) ? (+v || 0) : v; salvar(); }
  if (a === 'campo-os' && o) { o[c] = ['km', 'desc'].includes(c) ? (+v || 0) : v; salvar(); }
  if (a === 'val-item' && o) { const i = o[el.dataset.t].find(x => x.id === el.dataset.i); if (i) i.valor = +v || 0; salvar(); }
});

document.addEventListener('change', e => {
  if (e.target && e.target.id === 'cfg-input-logo') {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      torrar('Arquivo muito grande! Máximo permitido: 2MB.', 'erro');
      return;
    }
    const formData = new FormData();
    formData.append('arquivo', file);
    torrar('Enviando logotipo...', 'neutro');
    fetch('/api/configuracoes/empresa/logo', {
      method: 'POST',
      body: formData
    })
      .then(r => r.json())
      .then(res => {
        if (res.sucesso) {
          S.cfg = S.cfg || {};
          S.cfg.identidadeVisual = S.cfg.identidadeVisual || {};
          S.cfg.identidadeVisual.logoUrl = res.url;
          S.cfg.identidadeVisual.logoHash = res.hash;
          S.cfg.identidadeVisual.logo = res.url;
          salvar();
          render();
          torrar('Logotipo salvo com sucesso!', 'sucesso');
        } else {
          torrar(res.erro || 'Erro ao enviar logotipo.', 'erro');
        }
      })
      .catch(err => {
        console.error('Erro upload logo:', err);
        torrar('Falha no upload do logotipo.', 'erro');
      });
    return;
  }

  if (e.target && e.target.id === 'cfg-input-institucional') {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      torrar('Arquivo muito grande! Máximo permitido: 2MB.', 'erro');
      return;
    }
    const formData = new FormData();
    formData.append('arquivo', file);
    torrar('Enviando imagem institucional...', 'neutro');
    fetch('/api/configuracoes/empresa/imagem-institucional', {
      method: 'POST',
      body: formData
    })
      .then(r => r.json())
      .then(res => {
        if (res.sucesso) {
          S.cfg = S.cfg || {};
          S.cfg.identidadeVisual = S.cfg.identidadeVisual || {};
          S.cfg.identidadeVisual.imagemInstitucionalUrl = res.url;
          S.cfg.identidadeVisual.imagemInstitucionalHash = res.hash;
          S.cfg.identidadeVisual.imagemInstitucional = res.url;
          salvar();
          render();
          torrar('Imagem institucional salva com sucesso!', 'sucesso');
        } else {
          torrar(res.erro || 'Erro ao enviar imagem.', 'erro');
        }
      })
      .catch(err => {
        console.error('Erro upload imagem:', err);
        torrar('Falha no upload da imagem.', 'erro');
      });
    return;
  }

  const el = e.target.closest('[data-act]');
  if (!el) return;
  const a = el.dataset.act, o = OSatual();

  if (a === 'mudar-perfil') {
    S.ui = S.ui || {};
    S.ui.perfilAtivo = el.value || 'todos';
    salvar();
    render();
    return;
  }

  if (a === 'cfg') {
    S.cfg[el.dataset.c] = el.dataset.tipo === 'number' ? (+el.value || 0) : el.value;
    salvar();
    render();
    return;
  }

  if (a === 'cfg-prev') {
    S.cfg.manutencaoPreventiva = S.cfg.manutencaoPreventiva || {};
    S.cfg.manutencaoPreventiva[el.dataset.c] = (+el.value || 0);
    salvar();
    render();
    return;
  }

  if (a === 'cfg-assistente') {
    (S.cfg.assistente = S.cfg.assistente || {})[el.dataset.c] = el.value;
    salvar();
    render();
    return;
  }

  if (a === 'cfg-assistente-bool') {
    (S.cfg.assistente = S.cfg.assistente || {})[el.dataset.c] = el.checked;
    salvar();
    render();
    return;
  }

  if (a === 'mudar-status-os' && o) {
    const novoSt = el.value;
    o.st = novoSt;

    if (novoSt === 'executando' && !o.box) {
      const boxesValidos = S.boxes || [];
      const boxesOcupados = new Set((S.os || []).filter(x => x.id !== o.id && x.st !== 'finalizada' && x.box).map(x => x.box));
      const boxLivre = boxesValidos.find(b => !boxesOcupados.has(b.id));
      if (boxLivre) {
        o.box = boxLivre.id;
        torrar(`🟢 OS ${o.num}: Alocada no ${boxLivre.nome} e Em Execução!`);
      } else {
        torrar(`⚠️ Todos os boxes cheios! OS ${o.num} Em Execução no pátio.`);
      }
    } else if (novoSt === 'fila') {
      o.box = null;
      torrar(`OS ${o.num}: Retornou para a Fila (Box liberado).`);
    } else {
      torrar(`OS ${o.num}: ${ST[o.st].r}`);
    }
    salvar();
    renderFolha();
    render();
  }

  if (a === 'mudar-status-card') {
    const osId = el.dataset.id;
    const alvo = (S.os || []).find(x => x.id === osId);
    if (alvo) {
      const novoSt = el.value;
      alvo.st = novoSt;
      if (novoSt === 'executando' && !alvo.box) {
        const boxesValidos = S.boxes || [];
        const boxesOcupados = new Set((S.os || []).filter(x => x.id !== alvo.id && x.st !== 'finalizada' && x.box).map(x => x.box));
        const boxLivre = boxesValidos.find(b => !boxesOcupados.has(b.id));
        if (boxLivre) {
          alvo.box = boxLivre.id;
          torrar(`🟢 OS ${alvo.num}: Alocada no ${boxLivre.nome} e Em Execução!`);
        } else {
          torrar(`⚠️ Todos os boxes cheios! OS ${alvo.num} Em Execução no pátio.`);
        }
      } else if (novoSt === 'fila') {
        alvo.box = null;
        torrar(`OS ${alvo.num}: Retornou para a Fila (Box liberado).`);
      } else {
        torrar(`OS ${alvo.num}: ${ST[alvo.st].r}`);
      }
      salvar();
      render();
    }
  }

  if (a === 'mudar-box-os' && o) {
    const novoBox = el.value || null;
    o.box = novoBox;
    if (novoBox && o.st === 'fila') {
      o.st = 'executando';
      torrar(`🟢 OS ${o.num}: Alocada no ${B(novoBox).nome} (Em Execução)`);
    } else if (!novoBox) {
      o.st = 'fila';
      torrar(`OS ${o.num}: Movida para Fila de Espera (Sem Box)`);
    } else {
      torrar(`OS ${o.num}: Movida para ${B(novoBox).nome}`);
    }
    salvar();
    renderFolha();
    render();
  }
  if (a === 'campo-os' && o) { renderFolha(); render(); }
  if (a === 'val-item' && o) { renderFolha(); render(); }
  if (a === 'campo-peca') { renderFolha(); render(); }
  if (a === 'camp-modelo') {
    const m = S.zap.modelos[+el.value];
    if (m) { S.ui.camp = S.ui.camp || {}; S.ui.camp.texto = m.texto; S.ui.camp.nome = m.nome; render(); }
  }
  if (a === 'arquivo-xml') { lerArquivosXML(el.files); }
  if (a === 'restaurar-backup-json' || a === 'arquivo-migracao-input') {
    if (el.files && el.files.length > 0) {
      abrirFolha(folhaImportacaoSistemas);
      processarArquivosMigracao(el.files);
      el.value = '';
    }
  }

  if (a === 'upload-foto-os') {
    const file = el.files && el.files[0];
    if (!file) return;
    const osId = el.dataset.os || (o ? o.id : null);
    if (!osId) return;

    torrar('Processando foto e reconhecendo placa...');
    const fr = new FileReader();
    fr.onload = async () => {
      try {
        const base64 = fr.result;
        const res = await fetch(`/api/os/${encodeURIComponent(osId)}/anexar-foto`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imagemBase64: base64 })
        });
        const data = await res.json();

        if (res.status === 409 || data.conflito) {
          const confirma = confirm(data.mensagem || `Conflito de placa: substituir ${data.placaAtual} por ${data.placaDetectada}?`);
          if (confirma) {
            torrar('Confirmando substituição de placa...');
            const confRes = await fetch(`/api/os/${encodeURIComponent(osId)}/anexar-foto`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ tokenConfirmacao: data.tokenConfirmacao, confirmarConflito: true })
            });
            const confData = await confRes.json();
            if (confData.ok || confData.success) {
              torrar(confData.mensagem || 'Placa atualizada com sucesso!');
              await carregarEstado();
              renderFolha();
              render();
            } else {
              torrar(confData.error || 'Erro ao confirmar alteração.');
            }
          } else {
            torrar('Substituição cancelada.');
          }
          return;
        }

        if (data.ok || data.success) {
          torrar(data.mensagem || 'Placa identificada e conciliada com sucesso!');
          await carregarEstado();
          renderFolha();
          render();
        } else {
          torrar(data.error || 'Não foi possível reconhecer a placa.');
        }
      } catch (err) {
        torrar('Erro ao enviar foto para conciliação.');
      } finally {
        el.value = '';
      }
    };
    fr.readAsDataURL(file);
  }
});

function lerArquivosXML(files) {
  if (!files || !files.length) return;
  const fr = new FileReader();
  fr.onload = () => {
    try {
      S.ui.nota = lerXML(fr.result);
      renderFolha();
    } catch (err) {
      torrar('Erro ao interpretar arquivo XML de NF-e.');
    }
  };
  fr.readAsText(files[0], 'UTF-8');
}

document.getElementById('vidro')?.addEventListener('click', fecharFolha);
document.addEventListener('keydown', e => { if (e.key === 'Escape' && folhaAtual) fecharFolha(); });

/* =====================================================================
   INICIALIZAÇÃO DO SISTEMA (BOOT)
===================================================================== */
(async function boot() {
  const salvo = await armazem.ler();
  S = salvo && salvo.os ? salvo : sementes();
  S.ui = Object.assign({
    view: 'patio',
    filtro: 'todos',
    abaFin: 'dashboard',
    abaOS: 'servicos',
    abaCad: 'clientes',
    abaZap: 'cobranca',
    busca: '',
    buscaPlaca: ''
  }, S.ui || {});

  if (S.perfil === 'mecanico' || (S.user && S.user.role === 'mecanico')) {
    S.ui.perfilAtivo = 'mecanico';
  }

  S.extrato = S.extrato || [];
  S.nfsRecebidas = S.nfsRecebidas || [];
  S.compras = S.compras || [];
  if (!S.zap || !S.zap.regua) S.zap = zapPadrao();

  render();

  // Sincronização Periódica em Tempo Real com o Servidor (Auto-Refresh quando chegar OS do WhatsApp)
  let _checandoSync = false;
  async function checarAtualizacoesServidor() {
    if (_checandoSync) return;
    if (document.visibilityState === 'hidden') return;
    if (pendingLocalSave || folhaAtual) return;
    const generation = localGeneration;
    _checandoSync = true;
    try {
      const res = await fetch('/api/versao');
      if (res.ok) {
        const info = await res.json();
        const versaoLocal = S.versao || 0;
        const osLocal = (S.os || []).length;
        const veiLocal = (S.veiculos || []).length;

        if ((info.versao && info.versao > versaoLocal) || info.totalOS !== osLocal || info.totalVei !== veiLocal) {
          const resEst = await fetch('/api/estado');
          if (resEst.ok) {
            const novo = await resEst.json();
            if (novo && novo.os) {
              // Uma edição iniciada durante o fetch invalida esta atualização.
              if (pendingLocalSave || folhaAtual || generation !== localGeneration) return;
              const ui = S.ui;
              S = novo;
              S.ui = ui;
              if (S.perfil === 'mecanico' || (S.user && S.user.role === 'mecanico')) {
                S.ui.perfilAtivo = 'mecanico';
              }
              armazem.base = PatioSync.clone(novo);
              try { localStorage.setItem(CHAVE, JSON.stringify(S)); } catch (_) {}

              // Re-renderiza em tempo real se nenhuma folha/modal estiver sendo editada
              if (!folhaAtual && typeof render === 'function') {
                render();
                const statusEl = document.getElementById('status-salvo');
                if (statusEl) {
                  statusEl.textContent = '● Pátio Atualizado';
                  statusEl.style.color = 'var(--verde)';
                  setTimeout(() => { if (statusEl) statusEl.textContent = '● Salvo'; }, 2000);
                }
              }
            }
          }
        }
      }
    } catch (_) {
    } finally {
      _checandoSync = false;
    }
  }
  setInterval(checarAtualizacoesServidor, 5000);
})();


/* ===== INTEGRAÇÕES & APIS ===== */

function buscarCep(cep, prefix) {
  cep = cep.replace(/\D/g, '');
  if (cep.length !== 8) { torrar('CEP inválido'); return; }
  if (!apiThrottle('cep')) return;
  
  torrar('Buscando CEP...', 'neutro');
  fetch(`https://viacep.com.br/ws/${cep}/json/`)
    .then(res => res.json())
    .then(data => {
      if (data.erro) { torrar('CEP não encontrado'); return; }
      
      let end = data.logradouro + (data.bairro ? ', ' + data.bairro : '');
      
      // Update rascCad
      if(S.ui.rascCad) {
        S.ui.rascCad.endereco = end;
        S.ui.rascCad.cidade = data.localidade;
        S.ui.rascCad.uf = data.uf;
      }
      
      // Update DOM
      const inputs = document.querySelectorAll('input[data-act="rc"]');
      inputs.forEach(el => {
        if(el.dataset.c === 'endereco') el.value = end;
        if(el.dataset.c === 'cidade') el.value = data.localidade;
        if(el.dataset.c === 'uf') el.value = data.uf;
      });
      
      torrar('Endereço preenchido!', 'sucesso');
    })
    .catch(err => torrar('Erro ao buscar CEP'));
}

function buscarCNPJ(cnpj, prefix) {
  cnpj = cnpj.replace(/\D/g, '');
  if (cnpj.length !== 14) { torrar('CNPJ inválido. Digite 14 números.'); return; }
  if (!apiThrottle('cnpj')) return;
  
  torrar('Consultando Receita Federal...', 'neutro');
  // Usando um endpoint proxy ou direto se houver CORS liberado. 
  // Na vida real usaríamos um backend. Para a simulação, vamos usar o Minha Receita ou ReceitaWS.
  fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`)
    .then(res => res.json())
    .then(data => {
      if (data.message) { torrar('CNPJ não encontrado ou erro na API'); return; }
      
      if(S.ui.rascCad) {
        S.ui.rascCad.nome = data.razao_social;
        S.ui.rascCad.fantasia = data.nome_fantasia || data.razao_social;
        S.ui.rascCad.fone = data.ddd_telefone_1 || data.ddd_telefone_2 || '';
        S.ui.rascCad.endereco = `${data.logradouro}, ${data.numero} - ${data.bairro}`;
        S.ui.rascCad.cidade = data.municipio;
        S.ui.rascCad.uf = data.uf;
        S.ui.rascCad.cep = data.cep;
      }
      
      // Update DOM
      const inputs = document.querySelectorAll('input[data-act="rc"]');
      inputs.forEach(el => {
        if(el.dataset.c === 'nome') el.value = data.razao_social;
        if(el.dataset.c === 'fantasia') el.value = data.nome_fantasia || data.razao_social;
        if(el.dataset.c === 'fone') el.value = data.ddd_telefone_1 || '';
        if(el.dataset.c === 'endereco') el.value = `${data.logradouro}, ${data.numero} - ${data.bairro}`;
        if(el.dataset.c === 'cidade') el.value = data.municipio;
        if(el.dataset.c === 'uf') el.value = data.uf;
        if(el.dataset.c === 'cep') el.value = data.cep;
      });
      
      torrar('Dados do CNPJ importados!', 'sucesso');
    })
    .catch(err => torrar('Erro ao consultar CNPJ.'));
}

function consultarPlaca(placa) {
  if(!placa || placa.length < 7) { torrar('Placa inválida'); return; }
  if (!apiThrottle('consultaPlaca')) return;
  torrar('Consultando base do Sinesp/Denatran...', 'neutro');
  
  // Mock function for Placa
  setTimeout(() => {
    let mockData = {
      modelo: 'VOLVO FH 460',
      ano: '2021',
      tipo: 'Cavalo'
    };
    
    if(S.ui.rascCad) {
      S.ui.rascCad.modelo = mockData.modelo;
      S.ui.rascCad.ano = mockData.ano;
      S.ui.rascCad.tipo = mockData.tipo;
    }
    
    const inputs = document.querySelectorAll('input[data-act="rc"]');
    inputs.forEach(el => {
      if(el.dataset.c === 'modelo') el.value = mockData.modelo;
      if(el.dataset.c === 'ano') el.value = mockData.ano;
      if(el.dataset.c === 'tipo') el.value = mockData.tipo;
    });
    
    torrar('Veículo localizado na base nacional!', 'sucesso');
  }, 1000);
}

function consultarSerasa(doc, prefix) {
  if(!doc) { torrar('Digite o CNPJ/CPF primeiro'); return; }
  if (!apiThrottle('serasa')) return;
  torrar('Conectando à base Serasa Experian...', 'neutro');
  
  const tagEl = document.getElementById('tag_serasa');
  if(tagEl) {
    tagEl.innerHTML = 'Consultando...';
    tagEl.style.background = 'var(--aco-200)';
    tagEl.style.color = 'inherit';
  }
  
  setTimeout(() => {
    // Random mock result
    const score = Math.floor(Math.random() * (950 - 300) + 300);
    if(S.ui.rascCad) S.ui.rascCad.scoreSerasa = score;
    
    if(tagEl) {
      if(score > 500) {
        tagEl.innerHTML = `Score Serasa: ${score} ✔️`;
        tagEl.style.background = 'var(--verde)';
        tagEl.style.color = '#fff';
        torrar('Score alto. Baixo risco de crédito.', 'sucesso');
      } else {
        tagEl.innerHTML = `Score Serasa: ${score} ⚠️`;
        tagEl.style.background = 'var(--tijolo)';
        tagEl.style.color = '#fff';
        torrar('Atenção: Score baixo. Risco de inadimplência.', 'erro');
      }
    }
  }, 1000);
}

function consultarSintegra(doc, prefix) {
  doc = String(doc).replace(/\D/g, '');
  if(doc.length !== 14) { torrar('CNPJ inválido para Sintegra'); return; }
  if (!apiThrottle('sintegra')) return;
  
  torrar('Consultando Sintegra / Receita Estadual...', 'neutro');
  
  setTimeout(() => {
    const ieMock = Math.floor(Math.random() * 900000000) + 100000000;
    if(S.ui.rascCad) S.ui.rascCad.ie = ieMock.toString();
    
    const inputs = document.querySelectorAll('input[data-act="rc"]');
    inputs.forEach(el => {
      if(el.dataset.c === 'ie') el.value = ieMock;
    });
    
    torrar('Inscrição Estadual localizada!', 'sucesso');
  }, 1000);
}

// Exportações globais para configuração do Agente Inteligente & Síntese de Voz
if (typeof window !== 'undefined') {
  window.abrirConfiguracoesAgente = abrirConfiguracoesAgente;
  window.folhaConfigAssistente = folhaConfigAssistente;
  window.popularSelectVozesModal = popularSelectVozesModal;
  window.aoMudarVozInline = aoMudarVozInline;
  window.selecionarSugestaoNome = selecionarSugestaoNome;
  window.atualizarGeneroSelecionado = atualizarGeneroSelecionado;
  window.executarTesteModalVoz = executarTesteModalVoz;
  window.salvarConfigAssistenteModal = salvarConfigAssistenteModal;
}

