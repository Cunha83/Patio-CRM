/* Estado central e sincronização com controle de versão multi-tenant. */
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
}

function obterHeadersRequisicao(customHeaders = {}) {
  const headers = { ...customHeaders };
  if (typeof window !== 'undefined') {
    const tid = window.__PATIO_TENANT_ID || window.sessionStorage?.getItem('patio_tenant');
    if (tid && !headers['x-tenant-id']) {
      headers['x-tenant-id'] = tid;
    }
    if (window.__PATIO_TEST_CONSULTA_ADAPTER && !headers['x-test-consulta-adapter']) {
      headers['x-test-consulta-adapter'] = window.__PATIO_TEST_CONSULTA_ADAPTER;
    }
  }
  return headers;
}

let S = null;
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'S', {
    get() { return S; },
    set(v) { S = v; },
    configurable: true
  });
}
let salvarTimer = null;
let folhaAtual = null;
let confirmando = null;
let pendingLocalSave = false;
let localGeneration = 0;
let saving = false;

function isPerfilMecanico() {
  const role = (typeof S !== 'undefined' && S && ((S.user && S.user.role) || S.perfil)) || '';
  if (role === 'mecanico') return true;
  if (role && role !== 'mecanico') return false;
  const perfil = typeof S !== 'undefined' && S && S.ui && S.ui.perfilAtivo;
  return perfil === 'mecanico';
}
if (typeof window !== 'undefined') {
  window.isPerfilMecanico = isPerfilMecanico;
}

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
  banner.replaceChildren();
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
      armazem.base = PatioSync.clone(data);
      localGeneration++;
      pendingLocalSave = false;
      localStorage.setItem(CHAVE, JSON.stringify(S));
      localStorage.removeItem(CHAVE_RASCUNHO);
      banner.remove();
      if (typeof fecharFolha === 'function') fecharFolha();
      render();
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
      this.base = PatioSync.clone(data);
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
        this.base = PatioSync.clone(local || {});
        return local;
      } catch (_) { return null; }
    }
  },
  async gravar(obj) {
    const original = PatioSync.clone(obj);
    let candidate = PatioSync.clone(obj);
    let base = PatioSync.clone(this.base);
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
        const merged = PatioSync.merge(base, candidate, remote);
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
      this.base = PatioSync.clone(candidate);
      // Preserva digitação ocorrida enquanto a requisição estava em andamento.
      const updated = PatioSync.merge(original, obj, candidate);
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
}

/* ---------------- Utilitários Gerais ---------------- */
// Crypto-safe unique ID generator (replaces Math.random)
const uid = (p = 'id') => {
  if (typeof window !== 'undefined' && window.crypto && window.crypto.getRandomValues) {
    const arr = new Uint8Array(7);
    window.crypto.getRandomValues(arr);
    return p + '_' + Array.from(arr, b => b.toString(36).padStart(2, '0')).join('').slice(0, 9);
  }
  if (typeof globalThis !== 'undefined' && globalThis.crypto && globalThis.crypto.getRandomValues) {
    const arr = new Uint8Array(7);
    globalThis.crypto.getRandomValues(arr);
    return p + '_' + Array.from(arr, b => b.toString(36).padStart(2, '0')).join('').slice(0, 9);
  }
  // Fallback (should never hit in modern environments)
  return p + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
};

// Sanitize plain-text string: strip control chars, limit length
const sanitizeStr = (s, maxLen = 500) => {
  return String(s ?? '').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '').slice(0, maxLen);
};

// Rate limiter for external API calls
const _apiThrottles = {};
function apiThrottle(key, cooldownMs = 2000) {
  const now = Date.now();
  if (_apiThrottles[key] && (now - _apiThrottles[key]) < cooldownMs) {
    torrar('Aguarde antes de consultar novamente.');
    return false;
  }
  _apiThrottles[key] = now;
  return true;
}
function isValidMoney(val) {
  if (val === null || val === undefined) return false;
  if (typeof val === 'boolean') return false;
  if (Array.isArray(val)) return false;
  if (typeof val === 'object') return false;
  if (typeof val === 'number') return Number.isFinite(val);
  if (typeof val === 'string') {
    const s = val.trim();
    if (!s) return false;
    const limpo = s.replace(/^R\$\s*/i, '').replace(/\s+/g, '');
    if (!limpo) return false;
    const isPtBrWithThousands = /^[-+]?\d{1,3}(\.\d{3})+(,\d+)?$/.test(limpo);
    const isPtBrDecimal = /^[-+]?\d+,\d+$/.test(limpo);
    const isCanonicalNumber = /^[-+]?\d+(\.\d+)?$/.test(limpo);
    return isPtBrWithThousands || isPtBrDecimal || isCanonicalNumber;
  }
  return false;
}

function parseBRL(val) {
  if (typeof val === 'number') return Number.isFinite(val) ? val : 0;
  if (!isValidMoney(val)) return 0;
  const s = String(val).trim().replace(/^R\$\s*/i, '').replace(/\s+/g, '');
  if (s.includes(',')) {
    const numStr = s.replace(/\./g, '').replace(',', '.');
    const n = parseFloat(numStr);
    return Number.isFinite(n) ? n : 0;
  }
  const dotCount = (s.match(/\./g) || []).length;
  if (dotCount > 1) {
    const n = parseFloat(s.replace(/\./g, ''));
    return Number.isFinite(n) ? n : 0;
  }
  if (dotCount === 1) {
    if (/^[-+]?\d{1,3}\.\d{3}$/.test(s)) {
      const n = parseFloat(s.replace(/\./g, ''));
      return Number.isFinite(n) ? n : 0;
    }
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : 0;
  }
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

function brl(n) {
  const num = parseBRL(n);
  return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function brlCurto(n) {
  const num = parseBRL(n);
  return Math.abs(num) >= 1000
    ? 'R$ ' + (num / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + 'k'
    : brl(num);
}

if (typeof window !== 'undefined') {
  window.isValidMoney = isValidMoney;
  window.parseBRL = parseBRL;
  window.brl = brl;
  window.brlCurto = brlCurto;
  window.formatBRL = brl;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports.isValidMoney = isValidMoney;
  module.exports.parseBRL = parseBRL;
  module.exports.brl = brl;
  module.exports.brlCurto = brlCurto;
  module.exports.formatBRL = brl;
}
const hoje = () => new Date().toISOString().slice(0, 10);
const dataBR = (d) => (d ? d.slice(8, 10) + '/' + d.slice(5, 7) : '');
const dataBRfull = (d) => (d ? d.slice(8, 10) + '/' + d.slice(5, 7) + '/' + d.slice(0, 4) : '');
const horaBR = () => new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
const diasEntre = (a, b) => Math.round((new Date(b) - new Date(a)) / 864e5);
function addDias(d, n) {
  const x = new Date(d + 'T12:00');
  x.setDate(x.getDate() + n);
  return x.toISOString().slice(0, 10);
}
function mesRef(d) { return (d || '').slice(0, 7); }
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const soDigitos = (s) => String(s || '').replace(/\D/g, '');

function torrar(msg, tempo = 2800) {
  const t = document.getElementById('torrada');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('on');
  clearTimeout(t._x);
  t._x = setTimeout(() => t.classList.remove('on'), tempo);
}

/* ---------------- Tabela de Status de OS ---------------- */
const ST = {
  fila: { r: 'Na fila', c: 'var(--aco-300)', badge: 'selo-fila' },
  aprovacao: { r: 'Aguardando aprovação', c: 'var(--ardosia)', badge: 'selo-aprovacao' },
  executando: { r: 'Em execução', c: 'var(--petroleo)', badge: 'selo-executando' },
  peca: { r: 'Parado por peça', c: 'var(--sinal)', badge: 'selo-peca' },
  finalizada: { r: 'Finalizada', c: 'var(--verde)', badge: 'selo-finalizada' }
};

/* ---------------- Seletores e Helpers de Entidades ---------------- */
const V = (id) => S.veiculos.find((v) => v.id === id) || { placa: '—', modelo: '—', cli: '', ano: '—', km: 0 };
const C = (id) => S.clientes.find((c) => c.id === id) || { nome: '—', fone: '', contato: '—', prazo: 0, doc: '—' };
const B = (id) => S.boxes.find((b) => b.id === id) || { nome: 'Pátio Livre', tipo: 'Geral' };
const P = (id) => S.pecas.find((p) => p.id === id) || { nome: 'Peça não encontrada', custo: 0, venda: 0, qtd: 0, un: 'un' };
const Srv = (id) => S.servicos.find((s) => s.id === id) || { nome: 'Serviço', valor: 0 };

const soma = (arr, fn) => (arr || []).reduce((acc, item) => acc + (Number(fn(item)) || 0), 0);
const totOS = (o) => {
  if (!o) return 0;
  const totServ = soma(o.servicos, (i) => (i.qtd || 1) * (i.valor || 0));
  const totPec = soma(o.pecas, (i) => (i.qtd || 1) * (i.valor || 0));
  return +Math.max(0, totServ + totPec - (Number(o.desc) || 0)).toFixed(2);
};

const emAberto = (tipo) => S.contas.filter((c) => c.tipo === tipo && !c.pago);
const saldoCaixa = () => {
  const ini = Number(S.cfg.saldoInicial) || 0;
  const ent = soma(S.movimentos.filter((m) => m.tipo === 'entrada'), (m) => m.valor);
  const sai = soma(S.movimentos.filter((m) => m.tipo === 'saida'), (m) => m.valor);
  return +(ini + ent - sai).toFixed(2);
};

/* ---------------- Dados Iniciais Demonstrativos (Oficina Pesada) ---------------- */
function sementes() {
  const dHoje = hoje();
  return {
    v2_financeiro: true,
    proxNum: 1048,
    cfg: {
      empresa: 'Pátio Diesel & Hidráulica',
      cnpj: '12.345.678/0001-90',
      fone: '(11) 99876-5432',
      endereco: 'Rodovia Anhanguera, km 108 — Campinas/SP',
      saldoInicial: 18450.00,
      prazoPadrao: 28,
      chavePix: 'financeiro@patiodiesel.com.br',
      bancoNome: 'Banco do Brasil (Ag: 1234-5 / CC: 56789-0)',
      garantiaMeses: 3,
      termoGarantia: 'Garantia de 90 dias para serviços mecânicos e peças aplicadas com defeito de fabricação.',
      assistente: {
        displayName: 'Verônica',
        voiceGender: 'female',
        voiceURI: '',
        voiceName: '',
        pitch: 1.0,
        rate: 1.0,
        enabled: true,
        briefingDiarioAtivo: false,
        briefingDiarioHorario: '07:30',
        briefingDiarioDias: ['segunda', 'terca', 'quarta', 'quinta', 'sexta'],
        briefingSemanalAtivo: false,
        briefingSemanalDia: 'segunda',
        briefingSemanalHorario: '08:00',
        briefingDestinatarios: 'gestores'
      },
      apibrasil: { deviceToken: '', bearerToken: '' },
      regimeTributario: 'Simples Nacional',
      ie: '123.456.789.000',
      im: '98765-4',
      cnae: '4520-0/01',
      planoDeContas: ['Serviços', 'Peças', 'Pessoal', 'Fixas', 'Impostos', 'Outros'],
      formasPgto: ['Dinheiro', 'Pix', 'Cartão de Crédito', 'Cartão de Débito', 'Boleto', 'Transferência'],
      contasCaixa: [{id: 'cx1', nome: 'Caixa Interno (Dinheiro)'}, {id: 'cx2', nome: 'Banco do Brasil'}],
      usuarios: [{id: 'u1', nome: 'Administrador Principal', login: 'admin', papel: 'Gerente'}],
      contabil: { escritorio: 'Contabilidade Confiança', crc: '123456/SP', fone: '(19) 3000-1111', email: 'contato@confianca.com.br' },
      integracoes: { whatsapp: {}, serasa: {}, placas: {}, fiscal: {} },
      reguaCobranca: [{dias: -3, msg: 'Lembrete: seu boleto vence em 3 dias'}, {dias: 0, msg: 'Seu boleto vence hoje!'}, {dias: 3, msg: 'Aviso de atraso — regularize sua situação'}],
      aliqPIS: 0.65,
      aliqCOFINS: 3.00,
      aliqCSLL: 1.08,
      ambienteNfe: 'Homologação (Teste)',
      serieNfe: '1',
      numeroNfe: 1,
      cfopPadrao: '5102',
      senhaCertificado: '',
      // Configurações da Nova Reforma Tributária (EC 132/2023 - IVA Dual)
      faseReforma: 'teste_2026',
      opcaoSimplesIBSCBS: 'simples_hibrido',
      aliqPadraoCBS: 0.90,
      aliqPadraoIBSEst: 0.05,
      aliqPadraoIBSMun: 0.05,
      aliqPadraoIBS: 0.10,
      aliqPadraoIS: 0.00,
      ibgeMunicipio: '3509502',
      cClassTribPadrao: '010101',
      regrasTributarias: [
        { cfop: '5102', desc: 'Venda de Mercadoria (Dentro do Estado)', tipo: 'produto', cstICMS: '00', aliqICMS: 18, redBCICMS: 0, mvaICMS: 0, aliqICMSST: 0, aliqFCP: 0, cstIPI: '50', aliqIPI: 0, cstPIS: '01', aliqPIS: 0.65, cstCOFINS: '01', aliqCOFINS: 3.00, cstIBSCBS: '01', cClassTrib: '010101', aliqCBS: 0.90, aliqIBSEst: 0.05, aliqIBSMun: 0.05, aliqIBS: 0.10, redBCIBSCBS: 0, cstIS: '00', aliqIS: 0, indDestino: '1' },
        { cfop: '6102', desc: 'Venda de Mercadoria (Fora do Estado)', tipo: 'produto', cstICMS: '00', aliqICMS: 12, redBCICMS: 0, mvaICMS: 0, aliqICMSST: 0, aliqFCP: 0, cstIPI: '50', aliqIPI: 0, cstPIS: '01', aliqPIS: 0.65, cstCOFINS: '01', aliqCOFINS: 3.00, cstIBSCBS: '01', cClassTrib: '010101', aliqCBS: 0.90, aliqIBSEst: 0.05, aliqIBSMun: 0.05, aliqIBS: 0.10, redBCIBSCBS: 0, cstIS: '00', aliqIS: 0, indDestino: '1' },
        { cfop: '5405', desc: 'Venda de Mercadoria ST (Dentro do Estado)', tipo: 'produto', cstICMS: '60', aliqICMS: 0, redBCICMS: 0, mvaICMS: 0, aliqICMSST: 0, aliqFCP: 0, cstIPI: '53', aliqIPI: 0, cstPIS: '06', aliqPIS: 0, cstCOFINS: '06', aliqCOFINS: 0, cstIBSCBS: '01', cClassTrib: '010101', aliqCBS: 0.90, aliqIBSEst: 0.05, aliqIBSMun: 0.05, aliqIBS: 0.10, redBCIBSCBS: 0, cstIS: '00', aliqIS: 0, indDestino: '1' },
        { cfop: '5933', desc: 'Prestação de Serviço Tributado pelo ISS', tipo: 'servico', cstPIS: '01', aliqPIS: 0.65, cstCOFINS: '01', aliqCOFINS: 3.00, aliqISS: 5, issRetido: 'N', cstIBSCBS: '01', cClassTrib: '010101', aliqCBS: 0.90, aliqIBSEst: 0.05, aliqIBSMun: 0.05, aliqIBS: 0.10, redBCIBSCBS: 0, cstIS: '00', aliqIS: 0, indDestino: '1' },
        { cfop: '1102', desc: 'Compra de Mercadoria (Dentro do Estado)', tipo: 'entrada', cstICMS: '00', aliqICMS: 18, redBCICMS: 0, mvaICMS: 0, aliqICMSST: 0, aliqFCP: 0, cstIPI: '00', aliqIPI: 0, cstPIS: '01', aliqPIS: 0.65, cstCOFINS: '01', aliqCOFINS: 3.00, cstIBSCBS: '01', cClassTrib: '010101', aliqCBS: 0.90, aliqIBSEst: 0.05, aliqIBSMun: 0.05, aliqIBS: 0.10, redBCIBSCBS: 0, cstIS: '00', aliqIS: 0, indDestino: '1' },
        { cfop: '2102', desc: 'Compra de Mercadoria (Fora do Estado)', tipo: 'entrada', cstICMS: '00', aliqICMS: 12, redBCICMS: 0, mvaICMS: 0, aliqICMSST: 0, aliqFCP: 0, cstIPI: '00', aliqIPI: 0, cstPIS: '01', aliqPIS: 0.65, cstCOFINS: '01', aliqCOFINS: 3.00, cstIBSCBS: '01', cClassTrib: '010101', aliqCBS: 0.90, aliqIBSEst: 0.05, aliqIBSMun: 0.05, aliqIBS: 0.10, redBCIBSCBS: 0, cstIS: '00', aliqIS: 0, indDestino: '1' }
      ]
    },
    ui: {
      view: 'patio',
      filtro: 'todos',
      abaFin: 'dashboard',
      filtroFin: 'tudo',
      abaOS: 'servicos',
      abaCad: 'hub',
      abaZap: 'cobranca',
      busca: '',
      buscaPlaca: ''
    },
    boxes: [
      { id: 'b1', nome: 'Box 01 — Valeta Pesada', tipo: 'Mecânica' },
      { id: 'b2', nome: 'Box 02 — Rápido / Freio', tipo: 'Freios e Suspensão' },
      { id: 'b3', nome: 'Box 03 — Injeção & Motor', tipo: 'Motor' },
      { id: 'b4', nome: 'Box 04 — Câmbio & Diferencial', tipo: 'Transmissão' },
      { id: 'b5', nome: 'Box 05 — Alinhamento / Geometria', tipo: 'Geometria' },
      { id: 'b6', nome: 'Box 06 — Socorro / Elétrica', tipo: 'Elétrica' }
    ],
    fornecedores: [
      { id: 'f1', nome: 'Fras-le Peças', fantasia: 'Fras-le', doc: '11.222.333/0001-44', fone: '11999998888', email: 'vendas@frasle.com.br', contato: 'Roberto', cidade: 'São Paulo', uf: 'SP' },
      { id: 'f2', nome: 'Sachs Embreagens', fantasia: 'Sachs', doc: '22.333.444/0001-55', fone: '19988887777', email: 'vendas@sachs.com.br', contato: 'Mário', cidade: 'Campinas', uf: 'SP' },
      { id: 'f3', nome: 'ZF Wabco Brasil', fantasia: 'Wabco', doc: '33.444.555/0001-66', fone: '19977776666', email: 'pedidos@wabco.com.br', contato: 'Júlia', cidade: 'Sumaré', uf: 'SP' }
    ],
    mecanicos: [
      { id: 'm1', nome: 'Valdir (Mecânico Chefe)', especialidade: 'Geral', fone: '19999990001' },
      { id: 'm2', nome: 'Jonas (Especialista Freios)', especialidade: 'Freios', fone: '19999990002' },
      { id: 'm3', nome: 'Renato (Diagnóstico)', especialidade: 'Diagnóstico', fone: '19999990003' },
      { id: 'm4', nome: 'Clodoaldo (Geometria)', especialidade: 'Geometria', fone: '19999990004' }
    ],
    clientes: [
      {
        id: 'c1',
        nome: 'TransRodrigues Transportes Ltda',
        fantasia: 'TransRodrigues',
        doc: '23.456.789/0001-12',
        fone: '11987654321',
        email: 'manutencao@transrodrigues.com.br',
        contato: 'Carlos Rodrigues',
        prazo: 30,
        ie: '123.456.789.000',
        endereco: 'Av. das Indústrias, 1500',
        cidade: 'Campinas',
        uf: 'SP',
        cep: '13050-000',
        optin: true,
        bloqueado: false
      },
      {
        id: 'c2',
        nome: 'Expresso Vale Logística & Cargas',
        fantasia: 'Expresso Vale',
        doc: '34.567.890/0001-23',
        fone: '19981234567',
        email: 'frota@expressovale.com.br',
        contato: 'Marcos Silveira',
        prazo: 28,
        ie: '234.567.890.111',
        endereco: 'Rua dos Galpões, 340',
        cidade: 'Sumaré',
        uf: 'SP',
        cep: '13170-000',
        optin: true,
        bloqueado: false
      },
      {
        id: 'c3',
        nome: 'AgroLog Grãos & Fertilizantes S/A',
        fantasia: 'AgroLog',
        doc: '45.678.901/0001-34',
        fone: '19992345678',
        email: 'oficina@agrolog.com.br',
        contato: 'Fernanda Leite',
        prazo: 15,
        ie: '345.678.901.222',
        endereco: 'Rodovia SP-304, km 42',
        cidade: 'Paulínia',
        uf: 'SP',
        cep: '13140-000',
        optin: true,
        bloqueado: false
      },
      {
        id: 'c4',
        nome: 'Geraldo Antunes (Autônomo)',
        fantasia: 'Geraldo Antunes',
        doc: '123.456.789-00',
        fone: '19973456789',
        email: 'geraldo.antunes@gmail.com',
        contato: 'Geraldo',
        prazo: 0,
        ie: '',
        endereco: 'Rua das Palmeiras, 88',
        cidade: 'Hortolândia',
        uf: 'SP',
        cep: '13180-000',
        optin: true,
        bloqueado: false
      }
    ],
    veiculos: [
      { id: 'v1', cli: 'c1', placa: 'BRA2E19', marca: 'Scania', modelo: 'R 450 6x2 Highline', ano: '2021', km: 382400, tipo: 'Cavalo Mecânico' },
      { id: 'v2', cli: 'c1', placa: 'QRF8J44', marca: 'Volvo', modelo: 'FH 540 6x4 Globetrotter', ano: '2022', km: 295100, tipo: 'Cavalo Mecânico' },
      { id: 'v3', cli: 'c2', placa: 'RTA3B88', marca: 'Mercedes-Benz', modelo: 'Actros 2651 StreamSpace', ano: '2020', km: 420800, tipo: 'Cavalo Mecânico' },
      { id: 'v4', cli: 'c2', placa: 'PXT9C12', marca: 'DAF', modelo: 'XF 480 Super Space', ano: '2023', km: 145000, tipo: 'Cavalo Mecânico' },
      { id: 'v5', cli: 'c3', placa: 'KLE4421', marca: 'Iveco', modelo: 'Hi-Way 480', ano: '2019', km: 560000, tipo: 'Bitrem Graneleiro' },
      { id: 'v6', cli: 'c4', placa: 'CXP7719', marca: 'Volkswagen', modelo: 'Constellation 24.280', ano: '2018', km: 610000, tipo: 'Truck Baú' }
    ],
    servicos: [
      { id: 's1', nome: 'Revisão Completa de Freio (Eixo Traseiro e Dianteiro)', valor: 850.00, horas: 4.5, iss_cod: '14.01', iss_aliq: 5.0, cnae: '4520-0/01' },
      { id: 's2', nome: 'Troca de Kit de Embreagem com Retífica de Volante', valor: 1600.00, horas: 8.0, iss_cod: '14.01', iss_aliq: 5.0, cnae: '4520-0/01' },
      { id: 's3', nome: 'Troca de Óleo de Motor, Filtro de Óleo e Combustível', valor: 380.00, horas: 1.5, iss_cod: '14.01', iss_aliq: 5.0, cnae: '4520-0/01' },
      { id: 's4', nome: 'Diagnóstico Eletrônico & Calibração de Unidades Injetoras', valor: 650.00, horas: 3.0, iss_cod: '14.01', iss_aliq: 5.0, cnae: '4520-0/01' },
      { id: 's5', nome: 'Revisão do Sistema de Arla 32 & Bomba Dosadora', valor: 920.00, horas: 4.0, iss_cod: '14.01', iss_aliq: 5.0, cnae: '4520-0/01' },
      { id: 's6', nome: 'Geometria Completa de Direção & Alinhamento a Laser', valor: 480.00, horas: 2.0, iss_cod: '14.01', iss_aliq: 5.0, cnae: '4520-0/01' },
      { id: 's7', nome: 'Reparo e Vedação de Cuíca de Freio Dupla Spring Brake', valor: 290.00, horas: 1.5, iss_cod: '14.01', iss_aliq: 5.0, cnae: '4520-0/01' },
      { id: 's8', nome: 'Revisão e Regulagem de Válvulas de Motor', valor: 750.00, horas: 3.5, iss_cod: '14.01', iss_aliq: 5.0, cnae: '4520-0/01' }
    ],
    pecas: [
      { id: 'p1', cod: 'SCN-1875892', nome: 'Jogo de Pastilhas de Freio Scania Série R (WVA 29174)', un: 'jg', qtd: 8, min: 3, custo: 320.00, venda: 540.00, loc: 'Prat. A-02', forn: 'Fras-le Peças', ncm: '87083019', cfop: '5102', cest: '01.053.00', origem: '0 - Nacional' },
      { id: 'p2', cod: 'VLV-2134567', nome: 'Filtro Separador Racor Volvo FH D13', un: 'un', qtd: 14, min: 5, custo: 85.00, venda: 165.00, loc: 'Prat. B-01', forn: 'Donaldson Filtros', ncm: '84212300', cfop: '5102', cest: '01.062.00', origem: '0 - Nacional' },
      { id: 'p3', cod: 'MBZ-004420', nome: 'Cuíca de Freio Dupla Tipo 30/30 Tristop', un: 'un', qtd: 4, min: 2, custo: 420.00, venda: 730.00, loc: 'Prat. C-04', forn: 'Knorr-Bremse', ncm: '87083090', cfop: '5102', cest: '01.053.00', origem: '1 - Estrangeira' },
      { id: 'p4', cod: 'LUB-15W40', nome: 'Óleo Motor Diesel 15W40 CI-4 Top Turbo (Galão 20L)', un: 'gl', qtd: 18, min: 6, custo: 290.00, venda: 480.00, loc: 'Depósito 01', forn: 'Lubrax Distribuidora', ncm: '27101932', cfop: '5405', cest: '06.002.00', origem: '0 - Nacional' },
      { id: 'p5', cod: 'WBC-480104', nome: 'Válvula Moduladora EBS/ABS Wabco', un: 'un', qtd: 2, min: 1, custo: 1250.00, venda: 2100.00, loc: 'Prat. E-01', forn: 'ZF Wabco Brasil', ncm: '87083090', cfop: '5102', cest: '01.053.00', origem: '1 - Estrangeira' },
      { id: 'p6', cod: 'SCN-2245890', nome: 'Kit Embreagem Cerâmica Scania 430mm Sachs', un: 'kt', qtd: 3, min: 1, custo: 2800.00, venda: 4450.00, loc: 'Pallet 03', forn: 'Sachs Embreagens', ncm: '87089300', cfop: '5102', cest: '01.045.00', origem: '0 - Nacional' },
      { id: 'p7', cod: 'FLT-AR540', nome: 'Elemento Filtro de Ar Primário Volvo FH4/FH5', un: 'un', qtd: 6, min: 3, custo: 190.00, venda: 340.00, loc: 'Prat. B-03', forn: 'Mann Filter', ncm: '84213100', cfop: '5102', cest: '01.062.00', origem: '0 - Nacional' }
    ],
    os: [
      {
        id: 'os_ago1',
        num: 1020,
        box: 'b1',
        vei: 'v1',
        cli: 'c1',
        mec: 'Valdir (Mecânico Chefe)',
        st: 'finalizada',
        abertura: '2026-08-05',
        prev: '2026-08-08',
        km: 380100,
        queixa: 'Revisão preventiva - Agosto',
        servicos: [{ id: 's3', nome: 'Troca de Óleo', qtd: 1, valor: 380.00 }],
        pecas: [{ id: 'p4', nome: 'Óleo Motor Diesel', qtd: 2, valor: 480.00 }],
        desc: 0,
        pago: true,
        formaPgto: 'Pix',
        obs: 'Finalizada em agosto.'
      },
      {
        id: 'os_ago2',
        num: 1021,
        box: 'b2',
        vei: 'v3',
        cli: 'c2',
        mec: 'Jonas (Especialista Freios)',
        st: 'finalizada',
        abertura: '2026-08-12',
        prev: '2026-08-14',
        km: 418000,
        queixa: 'Freio falhando.',
        servicos: [{ id: 's1', nome: 'Revisão Freio', qtd: 1, valor: 850.00 }],
        pecas: [{ id: 'p1', nome: 'Pastilhas de Freio', qtd: 4, valor: 540.00 }],
        desc: 100,
        pago: true,
        formaPgto: 'Boleto',
        obs: 'Finalizada em agosto.'
      },
      {
        id: 'os1',
        num: 1044,
        box: 'b1',
        vei: 'v1',
        cli: 'c1',
        mec: 'Valdir (Mecânico Chefe)',
        st: 'executando',
        abertura: addDias(dHoje, -2),
        prev: addDias(dHoje, 1),
        km: 382400,
        queixa: 'Pedal de embreagem pesado e trepidação ao arrancar em subida carregado.',
        servicos: [{ id: 's2', nome: 'Troca de Kit de Embreagem com Retífica de Volante', qtd: 1, valor: 1600.00 }],
        pecas: [{ id: 'p6', nome: 'Kit Embreagem Cerâmica Scania 430mm Sachs', qtd: 1, valor: 4450.00 }],
        desc: 150.00,
        pago: false,
        formaPgto: '',
        obs: 'Verificar também o retentor do volante antes de fechar a caixa de câmbio.'
      },
      {
        id: 'os2',
        num: 1045,
        box: 'b2',
        vei: 'v3',
        cli: 'c2',
        mec: 'Jonas (Especialista Freios)',
        st: 'peca',
        abertura: addDias(dHoje, -1),
        prev: addDias(dHoje, 2),
        km: 420800,
        queixa: 'Ruído metálico na roda traseira direita ao acionar o freio de serviço.',
        servicos: [{ id: 's1', nome: 'Revisão Completa de Freio (Eixo Traseiro e Dianteiro)', qtd: 1, valor: 850.00 }],
        pecas: [{ id: 'p1', nome: 'Jogo de Pastilhas de Freio Scania Série R (WVA 29174)', qtd: 2, valor: 540.00 }],
        desc: 0,
        pago: false,
        formaPgto: '',
        obs: 'Aguardando entrega de 2 discos de freio ventilados da Knorr.'
      },
      {
        id: 'os3',
        num: 1046,
        box: 'b3',
        vei: 'v2',
        cli: 'c1',
        mec: 'Renato (Diagnóstico)',
        st: 'aprovacao',
        abertura: dHoje,
        prev: addDias(dHoje, 1),
        km: 295100,
        queixa: 'Luz de falha do sistema de emissões/Arla 32 acesa no painel com perda de potência.',
        servicos: [{ id: 's5', nome: 'Revisão do Sistema de Arla 32 & Bomba Dosadora', qtd: 1, valor: 920.00 }],
        pecas: [{ id: 'p2', nome: 'Filtro Separador Racor Volvo FH D13', qtd: 2, valor: 165.00 }],
        desc: 50.00,
        pago: false,
        formaPgto: '',
        obs: 'Orçamento enviado por WhatsApp para Carlos Rodrigues.'
      },
      {
        id: 'os4',
        num: 1047,
        box: 'b5',
        vei: 'v4',
        cli: 'c2',
        mec: 'Clodoaldo (Geometria)',
        st: 'fila',
        abertura: dHoje,
        prev: addDias(dHoje, 1),
        km: 145000,
        queixa: 'Desgaste irregular no ombro externo dos pneus dianteiros direcionais.',
        servicos: [{ id: 's6', nome: 'Geometria Completa de Direção & Alinhamento a Laser', qtd: 1, valor: 480.00 }],
        pecas: [],
        desc: 0,
        pago: false,
        formaPgto: '',
        obs: 'Aguardando desocupar o box 05.'
      }
    ],
    contas: [
      { id: 'ct_ago1', tipo: 'receber', desc: 'OS 1020 — TransRodrigues', parte: 'TransRodrigues Transportes Ltda', valor: 1340.00, venc: '2026-08-08', pago: true, cat: 'Serviços & Peças', doc: 'NF-1020', osId: 'os_ago1' },
      { id: 'ct_ago2', tipo: 'receber', desc: 'OS 1021 — Expresso Vale', parte: 'Expresso Vale Logística & Cargas', valor: 2910.00, venc: '2026-08-14', pago: true, cat: 'Serviços & Peças', doc: 'NF-1021', osId: 'os_ago2' },
      { id: 'ct_ago3', tipo: 'pagar', desc: 'Aluguel do Barracão - Agosto', parte: 'Imobiliária Anhanguera', valor: 6500.00, venc: '2026-08-10', pago: true, cat: 'Estrutura & Aluguel', doc: 'BOL-0826' },
      { id: 'ct_ago4', tipo: 'pagar', desc: 'Conta de Energia - Agosto', parte: 'CPFL', valor: 1200.00, venc: '2026-08-15', pago: true, cat: 'Água / Luz / Internet', doc: 'FAT-08' },
      { id: 'ct1', tipo: 'receber', desc: 'OS 1040 — Manutenção Preventiva Scania', parte: 'TransRodrigues Transportes Ltda', valor: 6850.00, venc: addDias(dHoje, -5), pago: false, cat: 'Serviços & Peças', doc: 'NF-1040', osId: 'os1040' },
      { id: 'ct2', tipo: 'receber', desc: 'OS 1041 — Troca de Cuícas Volvo FH', parte: 'Expresso Vale Logística & Cargas', valor: 4320.00, venc: addDias(dHoje, 7), pago: false, cat: 'Serviços & Peças', doc: 'NF-1041', osId: 'os1041' },
      { id: 'ct3', tipo: 'receber', desc: 'OS 1042 — Geometria e Freios Actros', parte: 'AgroLog Grãos & Fertilizantes S/A', valor: 3150.00, venc: addDias(dHoje, 14), pago: false, cat: 'Serviços & Peças', doc: 'NF-1042', osId: 'os1042' },
      { id: 'ct4', tipo: 'pagar', desc: 'Compra ZF Wabco Brasil (Válvulas & Moduladores)', parte: 'ZF Wabco Brasil', valor: 5400.00, venc: addDias(dHoje, -2), pago: false, cat: 'Fornecedores Peças', doc: 'NF-98412' },
      { id: 'ct5', tipo: 'pagar', desc: 'Lubrax Distribuidora (Tambores de Óleo 15W40)', parte: 'Lubrax Distribuidora', valor: 3890.00, venc: addDias(dHoje, 5), pago: false, cat: 'Óleos & Lubrificantes', doc: 'NF-44120' },
      { id: 'ct6', tipo: 'pagar', desc: 'Aluguel do Barracão e Pátio Operacional', parte: 'Imobiliária Anhanguera', valor: 6500.00, venc: addDias(dHoje, 10), pago: false, cat: 'Estrutura & Aluguel', doc: 'BOL-0926' },
      { id: 'ct7', tipo: 'pagar', desc: 'Folha de Pagamento Mecânicos e Apoio', parte: 'Equipe da Oficina', valor: 14200.00, venc: addDias(dHoje, 5), pago: false, cat: 'Pessoal & Salários', doc: 'FOLHA-09' }
    ],
    movimentos: [
      { id: 'mv_ago1', data: '2026-08-08', tipo: 'entrada', desc: 'Recebimento OS 1020', valor: 1340.00, cat: 'Serviços & Peças', conc: true, forma: 'Pix' },
      { id: 'mv_ago2', data: '2026-08-14', tipo: 'entrada', desc: 'Recebimento OS 1021', valor: 2910.00, cat: 'Serviços & Peças', conc: true, forma: 'Boleto' },
      { id: 'mv_ago3', data: '2026-08-10', tipo: 'saida', desc: 'Pagamento Aluguel - Agosto', valor: 6500.00, cat: 'Estrutura & Aluguel', conc: true, forma: 'Transferência' },
      { id: 'mv_ago4', data: '2026-08-15', tipo: 'saida', desc: 'Pagamento Energia - Agosto', valor: 1200.00, cat: 'Água / Luz / Internet', conc: true, forma: 'Débito' },
      { id: 'mv_ago5', data: '2026-08-20', tipo: 'saida', desc: 'Folha de Pagamento - Adiantamento', valor: 5000.00, cat: 'Pessoal & Salários', conc: true, forma: 'Transferência' },
      { id: 'mv_ago6', data: '2026-08-25', tipo: 'entrada', desc: 'Adiantamento de Contrato - AgroLog', valor: 8000.00, cat: 'Serviços & Peças', conc: true, forma: 'Transferência' },
      { id: 'mv1', data: addDias(dHoje, -6), tipo: 'entrada', desc: 'Recebimento OS 1038 — TransRodrigues', valor: 7400.00, cat: 'Serviços & Peças', conc: true, forma: 'Pix' },
      { id: 'mv2', data: addDias(dHoje, -4), tipo: 'saida', desc: 'Pagamento Fornecedor Sachs Embreagens', valor: 5600.00, cat: 'Fornecedores Peças', conc: true, forma: 'Boleto' },
      { id: 'mv3', data: addDias(dHoje, -2), tipo: 'entrada', desc: 'Recebimento OS 1039 — Expresso Vale', valor: 3950.00, cat: 'Serviços & Peças', conc: true, forma: 'Transferência' },
      { id: 'mv4', data: addDias(dHoje, -1), tipo: 'saida', desc: 'Conta de Energia Elétrica CPFL', valor: 1420.00, cat: 'Água / Luz / Internet', conc: true, forma: 'Débito' }
    ],
    extrato: [],
    nfsRecebidas: [],
    compras: [],
    zap: {
      ativo: true,
      soUteis: true,
      regua: [
        { id: 'r1', quando: -2, ativo: true, nome: 'Lembrete de Vencimento (2 dias antes)', texto: 'Olá {nome}, tudo bem? Passando para lembrar do título de {valor} com vencimento em {venc}. Caso precise do boleto ou chave Pix, estamos à disposição! 🚛 {empresa}' },
        { id: 'r2', quando: 1, ativo: true, nome: 'Aviso de Vencimento Hoje / D+1', texto: 'Olá {nome}! Identificamos que o título referente à {desc} no valor de {valor} venceu em {venc}. Podemos confirmar o pagamento ou reenviar a chave Pix? Obrigado! {empresa}' },
        { id: 'r3', quando: 7, ativo: true, nome: 'Cobrança Preventiva (7 dias em atraso)', texto: 'Olá {contato}, tudo bem? Não localizamos o pagamento da {desc} no valor de {valor} (vencida em {venc}). Poderia nos enviar o comprovante ou nos dar uma previsão para regularização? Obrigado, {empresa}.' }
      ],
      campanhas: [],
      envios: [],
      modelos: [
        { nome: 'OS Pronta para Retirada', texto: 'Olá {nome}! Informamos que a OS do caminhão placa *{placa}* foi concluída com sucesso! 🚛 O veículo já está testado e liberado para retirada no pátio da {empresa}.' },
        { nome: 'Orçamento para Aprovação', texto: 'Olá {nome}! O orçamento da OS do veículo *{placa}* ficou em *{valor}* com previsão de entrega para {prev}. Podemos dar início aos serviços? {empresa}' },
        { nome: 'Revisão Preventiva de 10.000 km', texto: 'Olá {nome}! Constatamos que já faz algum tempo desde a última revisão do seu caminhão placa *{placa}*. A manutenção preventiva evita paradas não programadas na rodovia! Agende seu horário: {empresa}.' }
      ],
      api: { url: '', token: '' }
    }
  };
}
