/* =====================================================================
   PÁTIO CRM — CENTRAL DE AUTOMAÇÕES DA OFICINA
   Gatilhos operacionais para oficina pesada (WhatsApp, alertas de
   gargalos nos boxes, vistorias técnicas e requisição de peças).
===================================================================== */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    const exports = factory();
    root.AutomationsModal = exports;
    root.abrirCentroAutomacoes = exports.abrirCentroAutomacoes;
    root.fecharCentroAutomacoes = exports.fecharCentroAutomacoes;
    root.filtrarCategoriaAutomacao = exports.filtrarCategoriaAutomacao;
    root.ativarReceitaAutomacao = exports.ativarReceitaAutomacao;
  }
}(typeof self !== 'undefined' ? self : this, function () {

  let categoriaAtiva = 'todas';

  const receitas = [
    {
      id: 'rec-1',
      categoria: 'whatsapp',
      titulo: 'Notificação de Conclusão',
      texto: 'Quando uma <span class="monday-param">OS mudar para Pronto</span>, enviar <span class="monday-param">WhatsApp automático</span> com o laudo de entrega para o <span class="monday-param">Cliente/Frotista</span>.',
      ativa: true
    },
    {
      id: 'rec-2',
      categoria: 'gargalos',
      titulo: 'Alerta de Gargalo no Box',
      texto: 'Quando um veículo permanecer em <span class="monday-param">Box por mais de 4 horas</span> sem apontamento mecânico, alterar status para <span class="monday-param">Pausado por Gargalo</span> e alertar o gestor.',
      ativa: true
    },
    {
      id: 'rec-3',
      categoria: 'pecas',
      titulo: 'Bloqueio de Peça em Falta',
      texto: 'Quando uma requisição de <span class="monday-param">peça pesada estiver sem saldo</span>, sinalizar <span class="monday-param">Almoxarifado Crítico</span> e notificar o encarregado de compras.',
      ativa: false
    },
    {
      id: 'rec-4',
      categoria: 'status',
      titulo: 'Aprovação de Vistoria Técnica',
      texto: 'Quando o <span class="monday-param">Checklist de Freios & Suspensão</span> for 100% aprovado, liberar automaticamente a <span class="monday-param">Trava de Portaria</span> para faturamento.',
      ativa: true
    },
    {
      id: 'rec-5',
      categoria: 'whatsapp',
      titulo: 'Abertura de OS & Triagem',
      texto: 'Quando uma nova <span class="monday-param">OS for aberta na portaria</span>, enviar <span class="monday-param">mensagem de boas-vindas</span> com previsão inicial de atendimento.',
      ativa: false
    },
    {
      id: 'rec-6',
      categoria: 'gargalos',
      titulo: 'Garantia Rastreável 90 Dias',
      texto: 'Quando um veículo com <span class="monday-param">retorno de garantia</span> der entrada em até 90 dias, expurgar comissão da OS anterior e sinalizar <span class="monday-param">Garantia Crítica</span>.',
      ativa: true
    }
  ];

  function abrirCentroAutomacoes() {
    let modalEl = document.getElementById('monday-automations-modal');
    if (!modalEl) {
      modalEl = document.createElement('div');
      modalEl.id = 'monday-automations-modal';
      document.body.appendChild(modalEl);
    }
    modalEl.innerHTML = renderModalHtml();
    modalEl.style.display = 'block';
  }

  function fecharCentroAutomacoes() {
    const modalEl = document.getElementById('monday-automations-modal');
    if (modalEl) modalEl.style.display = 'none';
  }

  function filtrarCategoriaAutomacao(cat) {
    categoriaAtiva = cat;
    const container = document.getElementById('monday-recipes-container');
    if (container) {
      container.innerHTML = renderRecipeCards();
    }
    const btns = document.querySelectorAll('.monday-cat-btn');
    btns.forEach(b => {
      if (b.getAttribute('data-cat') === cat) b.classList.add('active');
      else b.classList.remove('active');
    });
  }

  function ativarReceitaAutomacao(id) {
    const rec = receitas.find(r => r.id === id);
    if (rec) {
      rec.ativa = !rec.ativa;
      if (typeof torrada === 'function') {
        torrada(rec.ativa ? `⚡ Automação ativada: "${rec.titulo}"` : `Automação desativada: "${rec.titulo}"`);
      } else {
        alert(rec.ativa ? `⚡ Automação ativada: "${rec.titulo}"` : `Automação desativada: "${rec.titulo}"`);
      }
      filtrarCategoriaAutomacao(categoriaAtiva);
    }
  }

  function renderRecipeCards() {
    const filtradas = categoriaAtiva === 'todas'
      ? receitas
      : receitas.filter(r => r.categoria === categoriaAtiva);

    return filtradas.map(r => `
      <div class="monday-recipe-card">
        <div>
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
            <span style="font-size:11px;font-weight:700;text-transform:uppercase;color:var(--monday-text-muted)">${r.categoria}</span>
            <span style="font-size:11px;padding:2px 8px;border-radius:10px;font-weight:600;background:${r.ativa ? '#ecfdf5' : '#f1f5f9'};color:${r.ativa ? '#047857' : '#64748b'}">
              ${r.ativa ? '● Ativa' : '○ Pausada'}
            </span>
          </div>
          <h4 style="font-size:14px;margin:0 0 8px 0;color:var(--monday-text-dark)">${r.titulo}</h4>
          <div class="monday-recipe-text">${r.texto}</div>
        </div>
        <div class="monday-recipe-footer">
          <button class="monday-btn-recipe-add" onclick="ativarReceitaAutomacao('${r.id}')" style="${r.ativa ? 'background:#ecfdf5;color:#047857;border-color:#a7f3d0' : ''}">
            ${r.ativa ? '✓ Ativa no Pátio' : '+ Ativar no Pátio'}
          </button>
        </div>
      </div>
    `).join('');
  }

  function renderModalHtml() {
    return `
      <div class="monday-modal-backdrop" onclick="if(event.target===this)fecharCentroAutomacoes()">
        <div class="monday-modal-container">
          <div class="monday-modal-header">
            <div style="display:flex;align-items:center;gap:10px">
              <span style="font-size:20px">⚡</span>
              <div>
                <h2>Centro de Automações do Pátio</h2>
                <div style="font-size:12px;color:var(--monday-text-muted)">Configure gatilhos automáticos de chão de fábrica, WhatsApp e liberação técnica.</div>
              </div>
            </div>
            <button class="monday-modal-close" onclick="fecharCentroAutomacoes()">✕</button>
          </div>

          <div class="monday-modal-content">
            <!-- Sidebar de Categorias -->
            <div class="monday-modal-sidebar">
              <button class="monday-cat-btn ${categoriaAtiva === 'todas' ? 'active' : ''}" data-cat="todas" onclick="filtrarCategoriaAutomacao('todas')">
                <span>📋</span>
                <span>Todas as Regras</span>
              </button>
              <button class="monday-cat-btn ${categoriaAtiva === 'whatsapp' ? 'active' : ''}" data-cat="whatsapp" onclick="filtrarCategoriaAutomacao('whatsapp')">
                <span>💬</span>
                <span>Alertas WhatsApp</span>
              </button>
              <button class="monday-cat-btn ${categoriaAtiva === 'gargalos' ? 'active' : ''}" data-cat="gargalos" onclick="filtrarCategoriaAutomacao('gargalos')">
                <span>⏱️</span>
                <span>Prazos & Gargalos</span>
              </button>
              <button class="monday-cat-btn ${categoriaAtiva === 'status' ? 'active' : ''}" data-cat="status" onclick="filtrarCategoriaAutomacao('status')">
                <span>🔄</span>
                <span>Mudança de Situação</span>
              </button>
              <button class="monday-cat-btn ${categoriaAtiva === 'pecas' ? 'active' : ''}" data-cat="pecas" onclick="filtrarCategoriaAutomacao('pecas')">
                <span>🔩</span>
                <span>Almoxarifado & Peças</span>
              </button>
            </div>

            <!-- Grid de Regras -->
            <div class="monday-modal-recipes">
              <!-- Banner Destaque de Automação -->
              <div class="monday-featured-banner">
                <div style="display:flex;align-items:center;gap:12px">
                  <span style="font-size:26px">🔔</span>
                  <div>
                    <strong style="font-size:14px;color:#4338ca">Gatilho de Vistoria de Entrega</strong>
                    <div style="font-size:12.5px;color:#4b5563">Ao aprovar o checklist de freios e molas, gerar laudo e enviar instantaneamente ao WhatsApp do frotista.</div>
                  </div>
                </div>
                <button class="monday-btn-new" style="background:#4f46e5;font-size:12px;padding:6px 14px" onclick="if(typeof torrada==='function')torrada('⚡ Regra em destaque ativada!');">
                  Habilitar
                </button>
              </div>

              <div class="monday-recipe-grid" id="monday-recipes-container">
                ${renderRecipeCards()}
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  return {
    abrirCentroAutomacoes,
    fecharCentroAutomacoes,
    filtrarCategoriaAutomacao,
    ativarReceitaAutomacao,
    renderRecipeCards,
    renderModalHtml,
    receitas
  };
}));

