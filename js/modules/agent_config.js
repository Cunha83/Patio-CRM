/**
 * Módulo Orquestrador e Fachada de Configurações: agent_config.js
 * Pátio-CRM — Configurações Gerais da Oficina, Assistente IA e Usuários
 * Arquitetura Modular (< 350 linhas).
 *
 * Submódulos especializados em js/modules/:
 * - agent_config_modal.js: drawer de configuração do assistente
 * - agent_config_voice_tts.js: catálogo de vozes e síntese de fala
 * - agent_config_actions.js: sincronização de configurações e briefings
 * - agent_config_brand.js: identidade visual, motor camaleão e integrações
 * - agent_config_tabs.js: abas gerais (geral, plano de contas, caixas, fiscal)
 */

function renderAbaUsuarios() {
    const usuarios = (window.__PATIO_USUARIOS_CACHE__ && window.__PATIO_USUARIOS_CACHE__.length > 0)
      ? window.__PATIO_USUARIOS_CACHE__
      : [
          { id: 'usr_admin', username: 'admin', nome: 'Gerente Geral', role: 'admin', cargo: 'Gerente Geral', ativo: true },
          { id: 'usr_vendedor', username: 'vendedor', nome: 'Consultor de Vendas', role: 'vendedor', cargo: 'Consultor / Vendedor', ativo: true },
          { id: 'usr_caixa', username: 'caixa', nome: 'Operador Financeiro / Caixa', role: 'caixa', cargo: 'Financeiro / Caixa', ativo: true },
          { id: 'usr_mecanico', username: 'mecanico', nome: 'Mecânico de Pátio', role: 'mecanico', cargo: 'Mecânico / Operador de Box', ativo: true }
        ];

    // Carrega usuários reais em background
    if (!window.__PATIO_USUARIOS_CARREGANDO__) {
      window.__PATIO_USUARIOS_CARREGANDO__ = true;
      fetch('/api/usuarios', { headers: typeof obterHeadersRequisicao === 'function' ? obterHeadersRequisicao() : {} })
        .then(r => r.ok ? r.json() : null)
        .then(d => {
          window.__PATIO_USUARIOS_CARREGANDO__ = false;
          if (d && Array.isArray(d.usuarios)) {
            window.__PATIO_USUARIOS_CACHE__ = d.usuarios;
            const container = document.getElementById('tabela-usuarios-tbody');
            if (container) {
              container.innerHTML = renderLinhasUsuarios(d.usuarios);
            }
          }
        })
        .catch(() => { window.__PATIO_USUARIOS_CARREGANDO__ = false; });
    }

    // Carrega auditoria em background
    if (!window.__PATIO_AUDITORIA_CARREGANDO__) {
      window.__PATIO_AUDITORIA_CARREGANDO__ = true;
      fetch('/api/auditoria', { headers: typeof obterHeadersRequisicao === 'function' ? obterHeadersRequisicao() : {} })
        .then(r => r.ok ? r.json() : null)
        .then(d => {
          window.__PATIO_AUDITORIA_CARREGANDO__ = false;
          if (d && Array.isArray(d.auditoria)) {
            window.__PATIO_AUDITORIA_CACHE__ = d.auditoria;
            const audContainer = document.getElementById('tabela-auditoria-tbody');
            if (audContainer) {
              audContainer.innerHTML = renderLinhasAuditoria(d.auditoria);
            }
          }
        })
        .catch(() => { window.__PATIO_AUDITORIA_CARREGANDO__ = false; });
    }

    const auditLogs = window.__PATIO_AUDITORIA_CACHE__ || (Array.isArray(S.auditoria) ? S.auditoria : []);

    return `
    <div style="display:flex;flex-direction:column;gap:18px">
      <!-- Card Usuários & RBAC -->
      <div class="card" style="padding:20px;border:1px solid #cbd5e1;background:#ffffff;border-radius:10px">
        <div class="entre" style="margin-bottom:14px">
          <div>
            <h3 style="margin:0 0 4px 0;font-size:16px;font-weight:700;color:#0f172a">👥 Usuários & Controle de Acesso por Perfil (RBAC)</h3>
            <div style="font-size:12.5px;color:#64748b">Gerencie funcionários da oficina, senhas e perfis de permissão isolados</div>
          </div>
          <button class="btn btn-primario" onclick="abrirModalNovoUsuario()" style="display:inline-flex;align-items:center;gap:6px;font-weight:700">
            ${ico('mais', 14)} <span>+ Novo Funcionário</span>
          </button>
        </div>

        <table class="tabela-densa">
          <thead>
            <tr>
              <th>Nome do Funcionário</th>
              <th>Login / E-mail</th>
              <th>Perfil de Acesso</th>
              <th>Status</th>
              <th style="text-align:center">Ações</th>
            </tr>
          </thead>
          <tbody id="tabela-usuarios-tbody">
            ${renderLinhasUsuarios(usuarios)}
          </tbody>
        </table>
      </div>

      <!-- Card Trilha de Auditoria -->
      <div class="card" style="padding:20px;border:1px solid #cbd5e1;background:#ffffff;border-radius:10px">
        <div class="entre" style="margin-bottom:12px">
          <div>
            <h3 style="margin:0 0 4px 0;font-size:15px;font-weight:700;color:#0f172a">🛡️ Trilha de Auditoria & Segurança Operacional</h3>
            <div style="font-size:12px;color:#64748b">Registro imutável de ações críticas: exclusões, aprovações, baixas de estoque e login</div>
          </div>
          <button class="btn btn-neutro btn-pequeno" onclick="window.__PATIO_AUDITORIA_CARREGANDO__=false;render()">Atualizar Logs</button>
        </div>

        <table class="tabela-densa" style="font-size:12px">
          <thead>
            <tr style="background:#f8fafc">
              <th style="width:140px">Data/Hora</th>
              <th>Usuário</th>
              <th>Ação Executada</th>
              <th>Entidade</th>
              <th>Detalhes</th>
            </tr>
          </thead>
          <tbody id="tabela-auditoria-tbody">
            ${renderLinhasAuditoria(auditLogs)}
          </tbody>
        </table>
      </div>
    </div>`;
}

function renderConteudoAbaConfiguracoes(aba) {
  if (aba === 'geral' && typeof renderAbaGeral === 'function') return renderAbaGeral();
  if (aba === 'plano_contas' && typeof renderAbaPlanoContas === 'function') return renderAbaPlanoContas();
  if (aba === 'contas_caixa' && typeof renderAbaContasCaixa === 'function') return renderAbaContasCaixa();
  if (aba === 'operacoes' && typeof renderAbaOperacoes === 'function') return renderAbaOperacoes();
  if (aba === 'fiscal' && typeof renderAbaFiscalConfig === 'function') return renderAbaFiscalConfig();
  if (aba === 'usuarios') return renderAbaUsuarios();
  if (aba === 'api' && typeof renderAbaIntegracoesApi === 'function') return renderAbaIntegracoesApi();
  return '<div class="card card-p">Aba em desenvolvimento.</div>';
}

function viewSuperMenuConfiguracoes() {
  const abaAtiva = S.ui.abaCfg || 'geral';

  return `
  <!-- SUPER-MENU DE CONFIGURAÇÕES ENTERPRISE (12 ABAS) -->
  <div class="folder-tabs" style="margin-bottom:16px;overflow-x:auto;white-space:nowrap;padding-bottom:4px">
    ${ABAS_CONFIGURACOES.map(a => `
      <button class="folder-tab ${abaAtiva === a.id ? 'ativo' : ''}" onclick="setAbaConfiguracoes('${a.id}')" style="display:inline-flex;align-items:center;gap:6px">
        <span>${a.icon}</span>
        <span style="font-weight:700">${a.label}</span>
      </button>
    `).join('')}
  </div>

  <div id="conteudo_aba_configuracoes">
    ${renderConteudoAbaConfiguracoes(abaAtiva)}
  </div>`;
}

function renderLinhasUsuarios(lista) {
  if (!Array.isArray(lista) || lista.length === 0) {
    return '<tr><td colspan="5" style="text-align:center;padding:16px;color:#94a3b8">Nenhum usuário cadastrado.</td></tr>';
  }
  const roleBadges = {
    admin: '<span class="badge-vivid badge-sucesso" style="background:#dbeafe;color:#1e40af">👑 Gerente Geral</span>',
    vendedor: '<span class="badge-vivid badge-alerta" style="background:#dcfce7;color:#166534">💼 Consultor / Vendedor</span>',
    caixa: '<span class="badge-vivid badge-finalizada" style="background:#fef3c7;color:#92400e">💳 Financeiro / Caixa</span>',
    mecanico: '<span class="badge-vivid" style="background:#fee2e2;color:#991b1b">🔧 Mecânico / Box</span>'
  };

  return lista.map(u => {
    const roleKey = u.role || 'vendedor';
    const isAtivo = u.status === 'active' || u.ativo !== false;
    return `
    <tr>
      <td><b>${esc(u.nome || u.name || u.username)}</b></td>
      <td>${esc(u.username || u.email || '—')}</td>
      <td>${roleBadges[roleKey] || `<span class="badge-vivid">${esc(roleKey)}</span>`}</td>
      <td>
        <span style="display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:700;color:${isAtivo ? 'var(--verde)' : '#ef4444'}">
          <span style="width:6px;height:6px;border-radius:50%;background:${isAtivo ? 'var(--verde)' : '#ef4444'}"></span>
          <span>${isAtivo ? 'Ativo' : 'Inativo'}</span>
        </span>
      </td>
      <td style="text-align:center">
        <button class="btn btn-neutro btn-pequeno" onclick="alternarStatusUsuario('${esc(u.id)}', '${isAtivo ? 'inactive' : 'active'}')">
          ${isAtivo ? 'Desativar' : 'Ativar'}
        </button>
      </td>
    </tr>`;
  }).join('');
}

function renderLinhasAuditoria(logs) {
  if (!Array.isArray(logs) || logs.length === 0) {
    return '<tr><td colspan="5" style="text-align:center;padding:16px;color:#94a3b8">Nenhum evento registrado ainda.</td></tr>';
  }
  return logs.slice(0, 15).map(l => {
    const dataHora = (l.timestamp || l.data || '').replace('T', ' ').slice(0, 19) || '—';
    const detStr = typeof l.detalhes === 'object' ? JSON.stringify(l.detalhes) : (l.detalhes || l.obs || '—');
    return `
    <tr>
      <td style="font-family:monospace;font-size:11px;color:#64748b">${esc(dataHora)}</td>
      <td><b>${esc(l.usuario || l.actor_id || 'sistema')}</b></td>
      <td><span class="badge-vivid badge-sucesso" style="font-size:10.5px">${esc(l.acao || l.tipo || 'AÇÃO')}</span></td>
      <td>${esc(l.entidade || '—')}</td>
      <td style="font-size:11px;color:#475569;max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(detStr)}">
        ${esc(detStr)}
      </td>
    </tr>`;
  }).join('');
}

function abrirModalNovoUsuario() {
  const modalHtml = `
  <div class="folha-card" style="max-width:520px;margin:20px auto;background:#fff;border-radius:12px;padding:24px;border:1px solid #cbd5e1;box-shadow:0 20px 25px -5px rgba(0,0,0,0.1)">
    <div class="entre" style="margin-bottom:16px;border-bottom:1px solid #e2e8f0;padding-bottom:12px">
      <h3 style="margin:0;font-size:17px;font-weight:700;color:#0f172a">👥 Cadastrar Novo Funcionário</h3>
      <button class="btn-fechar" onclick="fecharFolha()" style="background:none;border:none;font-size:18px;cursor:pointer">✕</button>
    </div>

    <form onsubmit="event.preventDefault();salvarNovoUsuarioForm()" style="display:flex;flex-direction:column;gap:12px">
      <div>
        <label style="display:block;font-size:12px;font-weight:700;color:#334155;margin-bottom:4px">Nome Completo:</label>
        <input type="text" id="novo-usr-nome" class="campo-texto" placeholder="Ex: Lucas Mendes" style="width:100%;height:36px;font-size:13px" required>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div>
          <label style="display:block;font-size:12px;font-weight:700;color:#334155;margin-bottom:4px">Nome de Usuário (Login):</label>
          <input type="text" id="novo-usr-login" class="campo-texto" placeholder="Ex: lucas" style="width:100%;height:36px;font-size:13px" required>
        </div>
        <div>
          <label style="display:block;font-size:12px;font-weight:700;color:#334155;margin-bottom:4px">Perfil de Acesso (RBAC):</label>
          <select id="novo-usr-role" class="campo-select" style="width:100%;height:36px;font-size:13px" required>
            <option value="vendedor">💼 Consultor / Vendedor</option>
            <option value="caixa">💳 Financeiro / Caixa</option>
            <option value="mecanico">🔧 Mecânico / Box</option>
            <option value="admin">👑 Gerente Geral (Admin)</option>
          </select>
        </div>
      </div>

      <div>
        <label style="display:block;font-size:12px;font-weight:700;color:#334155;margin-bottom:4px">Senha Inicial:</label>
        <input type="password" id="novo-usr-pass" class="campo-texto" placeholder="Mínimo 6 caracteres" style="width:100%;height:36px;font-size:13px" required>
      </div>

      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:12px">
        <button type="button" class="btn btn-neutro" onclick="fecharFolha()">Cancelar</button>
        <button type="submit" id="btn-salvar-novo-usr" class="btn btn-primario" style="font-weight:700">Salvar Funcionário</button>
      </div>
    </form>
  </div>`;

  if (typeof abrirFolha === 'function') {
    abrirFolha(modalHtml);
  }
}

async function salvarNovoUsuarioForm() {
  const nome = document.getElementById('novo-usr-nome')?.value;
  const username = document.getElementById('novo-usr-login')?.value;
  const role = document.getElementById('novo-usr-role')?.value;
  const senha = document.getElementById('novo-usr-pass')?.value;
  const btn = document.getElementById('btn-salvar-novo-usr');
  if (btn) btn.disabled = true;

  try {
    const res = await fetch('/api/usuarios', {
      method: 'POST',
      headers: typeof obterHeadersRequisicao === 'function' ? obterHeadersRequisicao({ 'Content-Type': 'application/json' }) : { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome, username, role, senha })
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Erro ao criar funcionário.');
    }

    if (typeof torrar === 'function') torrar(`Funcionário ${nome} cadastrado com sucesso!`, 'sucesso');
    if (typeof fecharFolha === 'function') fecharFolha();

    window.__PATIO_USUARIOS_CARREGANDO__ = false;
    render();
  } catch (err) {
    alert(err.message);
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function alternarStatusUsuario(id, novoStatus) {
  try {
    const res = await fetch(`/api/usuarios/${id}`, {
      method: 'PUT',
      headers: typeof obterHeadersRequisicao === 'function' ? obterHeadersRequisicao({ 'Content-Type': 'application/json' }) : { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: novoStatus })
    });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.error || 'Erro ao alterar status.');
    if (typeof torrar === 'function') torrar('Status do funcionário atualizado!', 'sucesso');
    window.__PATIO_USUARIOS_CARREGANDO__ = false;
    render();
  } catch (err) {
    alert(err.message);
  }
}

if (typeof window !== 'undefined') {
  window.folhaConfigAssistente = folhaConfigAssistente;
  window.abrirConfiguracoesAgente = abrirConfiguracoesAgente;
  window.popularSelectVozesModal = popularSelectVozesModal;
  window.aoMudarVozInline = aoMudarVozInline;
  window.selecionarSugestaoNome = selecionarSugestaoNome;
  window.atualizarGeneroSelecionado = atualizarGeneroSelecionado;
  window.executarTesteModalVoz = executarTesteModalVoz;
  window.salvarConfigAssistenteModal = salvarConfigAssistenteModal;
  window.gerarEVisualizarBriefing = gerarEVisualizarBriefing;
  window.viewSuperMenuConfiguracoes = viewSuperMenuConfiguracoes;
  window.setAbaConfiguracoes = setAbaConfiguracoes;
  window.processarUploadLogoCamaleao = processarUploadLogoCamaleao;
  window.atualizarCorManual = atualizarCorManual;
  window.restaurarCoresPadrao = restaurarCoresPadrao;
  window.salvarConfigGeralForm = salvarConfigGeralForm;
  window.renderLinhasUsuarios = renderLinhasUsuarios;
  window.renderLinhasAuditoria = renderLinhasAuditoria;
  window.abrirModalNovoUsuario = abrirModalNovoUsuario;
  window.salvarNovoUsuarioForm = salvarNovoUsuarioForm;
  window.alternarStatusUsuario = alternarStatusUsuario;
}

