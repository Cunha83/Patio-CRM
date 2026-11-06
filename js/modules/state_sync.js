/* =====================================================================
   PÁTIO CRM — SINCRONIZAÇÃO DE ESTADO, ARMAZÉM E MULTI-TENANT
   Submódulo extraído de js/state.js (< 350 linhas)
   ===================================================================== */

function obterContextoIdentidade() {
  let tenantId = 'oficina';
  let userId = 'v1';
  if (typeof window !== 'undefined') {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const paramTenant = urlParams.get('tenant') || urlParams.get('tenantId');
      if (paramTenant) {
        window.sessionStorage?.setItem('patio_tenant', paramTenant);
      }
    } catch (_) {}
    tenantId = window.__PATIO_TENANT_ID || window.sessionStorage?.getItem('patio_tenant') || 'oficina';
    userId = window.__PATIO_USER_ID || window.sessionStorage?.getItem('patio_user') || 'v1';
  }
  return { tenantId, userId };
}

const { tenantId: _initTenant, userId: _initUser } = obterContextoIdentidade();
let CHAVE = (_initTenant === 'oficina' && _initUser === 'v1') ? 'patio_oficina_v1' : `patio_${_initTenant}_${_initUser}_v1`;
let CHAVE_RASCUNHO = CHAVE + '_pendente';

function atualizarChaveStorage(tenantId = 'oficina', userId = 'v1') {
  CHAVE = `patio_${tenantId}_${userId}_v1`;
  CHAVE_RASCUNHO = CHAVE + '_pendente';
  if (typeof window !== 'undefined') {
    window.CHAVE = CHAVE;
    window.CHAVE_RASCUNHO = CHAVE_RASCUNHO;
  }
}

function obterHeadersRequisicao(customHeaders = {}) {
  const headers = { ...customHeaders };
  if (typeof window !== 'undefined') {
    const tid = window.__PATIO_TENANT_ID || window.sessionStorage?.getItem('patio_tenant');
    if (tid && !headers['x-tenant-id']) {
      headers['x-tenant-id'] = tid;
    }
    const token = window.localStorage?.getItem('patio_auth_token') || window.sessionStorage?.getItem('patio_auth_token');
    if (token && !headers['authorization'] && !headers['Authorization']) {
      headers['authorization'] = `Bearer ${token}`;
    }
    if (window.__PATIO_TEST_CONSULTA_ADAPTER && !headers['x-test-consulta-adapter']) {
      headers['x-test-consulta-adapter'] = window.__PATIO_TEST_CONSULTA_ADAPTER;
    }
  }
  return headers;
}

let salvarTimer = null;
let folhaAtual = null;
let confirmando = null;
let pendingLocalSave = false;
let localGeneration = 0;
let saving = false;

function cacheRascunho(obj) {
  try {
    localStorage.setItem(CHAVE_RASCUNHO, JSON.stringify({ state: obj, base: armazem.base }));
    return true;
  } catch (error) {
    mostrarFalhaSync('Sem espaço para o rascunho local. Mantenha esta página aberta e exporte suas alterações.');
    return false;
  }
}

function mostrarFalhaSync(message) {
  let banner = document.getElementById('sync-error');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'sync-error';
    banner.setAttribute('role', 'alert');
    banner.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99999;background:#fff1d6;color:#582600;padding:12px;box-shadow:0 2px 8px #0003';
    document.body.appendChild(banner);
  }
  if (typeof banner.replaceChildren === 'function') banner.replaceChildren();
  else banner.innerHTML = '';
  const text = document.createElement('span');
  text.textContent = message + ' ';
  banner.appendChild(text);
  const button = (label, action) => {
    const b = document.createElement('button');
    b.textContent = label;
    b.style.margin = '4px';
    b.onclick = action;
    banner.appendChild(b);
  };
  button('Tentar salvar', () => salvar());
  button('Exportar minhas alterações', () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(S, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url; a.download = 'patio-rascunho-pendente.json'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  button('Usar dados do servidor', async () => {
    if (!window.confirm('Descartar as alterações locais pendentes? Exporte o rascunho antes se precisar mantê-las.')) return;
    try {
      const res = await fetch('/api/estado', { headers: obterHeadersRequisicao() });
      if (!res.ok) throw new Error('Servidor indisponível.');
      const data = await res.json();
      if (!data.os) throw new Error('Estado inválido.');
      clearTimeout(salvarTimer);
      if (saving) throw new Error('Aguarde a gravação atual terminar.');
      S = { ...data, ui: S.ui };
      armazem.base = (typeof PatioSync !== 'undefined') ? PatioSync.clone(data) : JSON.parse(JSON.stringify(data));
      localGeneration++;
      pendingLocalSave = false;
      localStorage.setItem(CHAVE, JSON.stringify(S));
      localStorage.removeItem(CHAVE_RASCUNHO);
      banner.remove();
      if (typeof fecharFolha === 'function') fecharFolha();
      if (typeof render === 'function') render();
    } catch (error) { mostrarFalhaSync(error.message); }
  });
}

const armazem = {
  base: {},
  async ler() {
    let draft;
    try { draft = JSON.parse(localStorage.getItem(CHAVE_RASCUNHO) || 'null'); } catch (_) {}
    if (draft?.state) {
      this.base = draft.base || {};
      pendingLocalSave = true;
      mostrarFalhaSync('Há alterações pendentes recuperadas deste navegador.');
      return draft.state;
    }
    try {
      const reqHeaders = obterHeadersRequisicao();
      const res = Object.keys(reqHeaders).length > 0
        ? await fetch('/api/estado', { headers: reqHeaders })
        : await fetch('/api/estado');
      if (res.status === 401 || res.status === 403) {
        if (typeof window !== 'undefined' && window.sessionStorage) {
          window.sessionStorage.removeItem('patio_tenant');
          window.sessionStorage.removeItem('patio_user');
        }
        throw new Error('Sessão expirada ou acesso não autorizado (HTTP ' + res.status + ').');
      }
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      this.base = (typeof PatioSync !== 'undefined') ? PatioSync.clone(data) : JSON.parse(JSON.stringify(data));
      if (Object.keys(data).length) {
        try { localStorage.setItem(CHAVE, JSON.stringify(data)); } catch (_) {}
        return data;
      }
      return null;
    } catch (error) {
      if (error.message.includes('401') || error.message.includes('403') || error.message.includes('não autorizado')) {
        return null;
      }
      try {
        const local = JSON.parse(localStorage.getItem(CHAVE) || 'null');
        this.base = (typeof PatioSync !== 'undefined') ? PatioSync.clone(local || {}) : JSON.parse(JSON.stringify(local || {}));
        return local;
      } catch (_) { return null; }
    }
  },
  async gravar(obj) {
    const cloneFn = (o) => (typeof PatioSync !== 'undefined' ? PatioSync.clone(o) : JSON.parse(JSON.stringify(o)));
    const original = cloneFn(obj);
    let candidate = cloneFn(obj);
    let base = cloneFn(this.base);
    cacheRascunho(obj);
    for (let attempt = 0; attempt < 3; attempt++) {
      const res = await fetch('/api/estado', {
        method: 'POST',
        headers: obterHeadersRequisicao({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(candidate)
      });
      if (res.status === 401 || res.status === 403) {
        if (typeof window !== 'undefined' && window.sessionStorage) {
          window.sessionStorage.removeItem('patio_tenant');
          window.sessionStorage.removeItem('patio_user');
        }
        throw new Error('Sessão expirada ou acesso negado (HTTP ' + res.status + ').');
      }
      if (res.status === 409) {
        const reqHeaders = obterHeadersRequisicao();
        const fresh = Object.keys(reqHeaders).length > 0
          ? await fetch('/api/estado', { headers: reqHeaders })
          : await fetch('/api/estado');
        if (!fresh.ok) throw new Error('Não foi possível atualizar os dados do servidor.');
        const remote = await fresh.json();
        const merged = (typeof PatioSync !== 'undefined') ? PatioSync.merge(base, candidate, remote) : { state: remote, conflicts: [] };
        if (merged.conflicts.length) {
          throw new Error('Conflito de edição em: ' + merged.conflicts.slice(0, 5).join(', ') + '. Seu rascunho foi mantido.');
        }
        candidate = merged.state;
        base = remote;
        continue;
      }
      if (!res.ok) throw new Error('Falha ao salvar (HTTP ' + res.status + '). Suas alterações continuam pendentes.');
      const result = await res.json();
      candidate.versao = result.versao;
      this.base = cloneFn(candidate);
      const updated = (typeof PatioSync !== 'undefined') ? PatioSync.merge(original, obj, candidate) : { state: candidate, conflicts: [] };
      for (const key of Object.keys(obj)) delete obj[key];
      Object.assign(obj, updated.state);
      try { localStorage.setItem(CHAVE, JSON.stringify(candidate)); } catch (_) {}
      if (updated.conflicts.length) throw new Error('Há novas edições sobre dados conciliados. Confira o rascunho antes de tentar salvar.');
      return result;
    }
    throw new Error('Outros operadores estão atualizando os dados. Tente salvar novamente.');
  }
};

function salvar() {
  localGeneration++;
  pendingLocalSave = true;
  cacheRascunho(S);
  clearTimeout(salvarTimer);
  const status = document.getElementById('status-salvo');
  if (status) status.textContent = 'Salvando...';
  salvarTimer = setTimeout(flushSave, 300);
}

async function flushSave() {
  if (saving || !pendingLocalSave) return;
  saving = true;
  try {
    while (pendingLocalSave) {
      const generation = localGeneration;
      await armazem.gravar(S);
      if (generation !== localGeneration) { cacheRascunho(S); continue; }
      pendingLocalSave = false;
      localStorage.removeItem(CHAVE_RASCUNHO);
      document.getElementById('sync-error')?.remove();
      const status = document.getElementById('status-salvo');
      if (status) status.textContent = '● Salvo';
    }
  } catch (error) {
    pendingLocalSave = true;
    cacheRascunho(S);
    mostrarFalhaSync(error.message);
  } finally { saving = false; }
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => { if (pendingLocalSave) flushSave(); });
  window.addEventListener('beforeunload', event => {
    if (!pendingLocalSave) return;
    cacheRascunho(S);
    event.preventDefault(); event.returnValue = '';
  });
  window.armazem = armazem;
  window.salvar = salvar;
  window.flushSave = flushSave;
  window.obterHeadersRequisicao = obterHeadersRequisicao;
  window.obterContextoIdentidade = obterContextoIdentidade;
  window.atualizarChaveStorage = atualizarChaveStorage;
  window.CHAVE = CHAVE;
  window.CHAVE_RASCUNHO = CHAVE_RASCUNHO;
}

