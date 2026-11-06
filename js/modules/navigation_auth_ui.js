/* Submódulo de Autenticação, Onboarding e Sessão na UI: navigation_auth_ui.js */
/* Pátio-CRM — Submódulo extraído de js/modules/navigation.js (< 350 linhas) */

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
            ${ico('pecas', 14)} Carregar Dados de Exemplo
          </button>
        ` : `
          <button class="btn btn-perigo btn-pequeno" data-act="remover-demo" style="white-space:nowrap">
            Remover Dados de Exemplo
          </button>
        `}
        <button class="btn btn-primario btn-pequeno" data-act="concluir-onboarding" style="white-space:nowrap">
          Concluir Guia Inicial
        </button>
      </div>
    </div>
  </div>`;
}

/* ---------------- Gestão de Sessão, RBAC & Login White-Label ---------------- */
function toggleDropdownUsuario() {
  const el = document.getElementById('dropdown-usuario-menu');
  if (el) {
    el.style.display = el.style.display === 'none' || !el.style.display ? 'block' : 'none';
  }
}

if (typeof document !== 'undefined') {
  document.addEventListener('click', (e) => {
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
  window.renderOnboardingBanner = renderOnboardingBanner;
  window.toggleDropdownUsuario = toggleDropdownUsuario;
  window.abrirModalLogin = abrirModalLogin;
  window.fecharModalLogin = fecharModalLogin;
  window.submeterFormLogin = typeof submeterFormLogin === 'function' ? submeterFormLogin : undefined;
  window.loginRapido = loginRapido;
  window.fazerLogin = typeof fazerLogin === 'function' ? fazerLogin : undefined;
  window.fazerLogout = fazerLogout;
}
if (typeof globalThis !== 'undefined') {
  globalThis.renderOnboardingBanner = renderOnboardingBanner;
  globalThis.toggleDropdownUsuario = toggleDropdownUsuario;
  globalThis.abrirModalLogin = abrirModalLogin;
  globalThis.fecharModalLogin = fecharModalLogin;
  globalThis.submeterFormLogin = typeof submeterFormLogin === 'function' ? submeterFormLogin : undefined;
  globalThis.loginRapido = loginRapido;
  globalThis.fazerLogin = typeof fazerLogin === 'function' ? fazerLogin : undefined;
  globalThis.fazerLogout = fazerLogout;
}
