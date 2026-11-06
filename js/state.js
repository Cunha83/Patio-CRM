/* =====================================================================
   PÁTIO CRM — ESTADO CENTRAL, HELPERS CANÔNICOS E FORMATAÇÃO
   Módulo Principal / Fachada de Estado (< 350 linhas)
   ===================================================================== */

let S = null;
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'S', {
    get() { return S; },
    set(v) { S = v; },
    configurable: true
  });
}

function isPerfilMecanico() {
  const role = (typeof S !== 'undefined' && S && ((S.user && S.user.role) || S.perfil)) || '';
  if (role === 'mecanico') return true;
  if (role && role !== 'mecanico') return false;
  const perfil = typeof S !== 'undefined' && S && S.ui && S.ui.perfilAtivo;
  return perfil === 'mecanico';
}

/* ---------------- Utilitários Gerais ---------------- */
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
  return p + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
};

const sanitizeStr = (s, maxLen = 500) => {
  return String(s ?? '').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '').slice(0, maxLen);
};

const _apiThrottles = {};
function apiThrottle(key, cooldownMs = 2000) {
  const now = Date.now();
  if (_apiThrottles[key] && (now - _apiThrottles[key]) < cooldownMs) {
    if (typeof torrar === 'function') torrar('Aguarde antes de consultar novamente.');
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

const hoje = () => new Date().toISOString().slice(0, 10);
const agora = hoje;
const dataBR = (d) => (d ? d.slice(8, 10) + '/' + d.slice(5, 7) : '');
const dataBRfull = (d) => (d ? d.slice(8, 10) + '/' + d.slice(5, 7) + '/' + d.slice(0, 4) : '');
const formatarData = dataBRfull;
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
  if (typeof document === 'undefined') return;
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
const V = (id) => (S?.veiculos || []).find((v) => v.id === id) || { placa: '—', modelo: '—', cli: '', ano: '—', km: 0 };
const C = (id) => (S?.clientes || []).find((c) => c.id === id) || { nome: '—', fone: '', contato: '—', prazo: 0, doc: '—' };
const B = (id) => (S?.boxes || []).find((b) => b.id === id) || { nome: 'Pátio Livre', tipo: 'Geral' };
const P = (id) => (S?.pecas || []).find((p) => p.id === id) || { nome: 'Peça não encontrada', custo: 0, venda: 0, qtd: 0, un: 'un' };
const Srv = (id) => (S?.servicos || []).find((s) => s.id === id) || { nome: 'Serviço', valor: 0 };

const soma = (arr, fn) => (arr || []).reduce((acc, item) => acc + (Number(fn ? fn(item) : item) || 0), 0);

const totOS = (o) => {
  if (!o) return 0;
  const totServ = soma(o.servicos, (i) => (i.qtd || 1) * (i.valor || 0));
  const totPec = soma(o.pecas, (i) => (i.qtd || 1) * (i.valor || 0));
  return +Math.max(0, totServ + totPec - (Number(o.desc) || 0)).toFixed(2);
};

const obterContasUnificadas = () => {
  if (!S) return [];
  const list = [];
  if (Array.isArray(S.contas)) {
    for (const c of S.contas) list.push(c);
  }
  if (Array.isArray(S.contasReceber)) {
    for (const c of S.contasReceber) {
      if (!list.some(x => x.id === c.id)) list.push({ ...c, tipo: 'receber' });
    }
  }
  if (Array.isArray(S.contasPagar)) {
    for (const c of S.contasPagar) {
      if (!list.some(x => x.id === c.id)) list.push({ ...c, tipo: 'pagar' });
    }
  }
  return list;
};

const obterMovimentosUnificados = () => {
  if (!S) return [];
  if (Array.isArray(S.movimentos) && S.movimentos.length > 0) return S.movimentos;
  if (Array.isArray(S.lancamentosCaixa) && S.lancamentosCaixa.length > 0) return S.lancamentosCaixa;
  if (Array.isArray(S.historicoCaixa) && S.historicoCaixa.length > 0) return S.historicoCaixa;
  return Array.isArray(S.movimentos) ? S.movimentos : [];
};

const emAberto = (tipo) => {
  const todas = obterContasUnificadas();
  return todas.filter((c) => (c.tipo === tipo || (!c.tipo && tipo === 'receber')) && !c.pago && c.st !== 'pago' && c.status !== 'pago');
};

const saldoCaixa = () => {
  const ini = Number(S?.cfg?.saldoInicial) || 0;
  const movs = obterMovimentosUnificados();
  const ent = soma(movs.filter((m) => m.tipo === 'entrada' || m.tipo === 'credito'), (m) => m.valor);
  const sai = soma(movs.filter((m) => m.tipo === 'saida' || m.tipo === 'debito'), (m) => m.valor);
  return +(ini + ent - sai).toFixed(2);
};

function normalizarPlanoDeContas(lista) {
  const padraoClonado = () => [
    { id: 'pc_1', codigo: '1', nome: 'Receitas Operacionais', tipo: 'receita', classe: 'sintetica', paiId: null, ativo: true, padrao: true },
    { id: 'pc_1_01', codigo: '1.01', nome: 'Serviços', tipo: 'receita', classe: 'analitica', paiId: 'pc_1', ativo: true, padrao: true },
    { id: 'pc_1_02', codigo: '1.02', nome: 'Peças', tipo: 'receita', classe: 'analitica', paiId: 'pc_1', ativo: true, padrao: true },
    { id: 'pc_2', codigo: '2', nome: 'Custos e Despesas', tipo: 'despesa', classe: 'sintetica', paiId: null, ativo: true, padrao: true },
    { id: 'pc_2_01', codigo: '2.01', nome: 'Pessoal', tipo: 'despesa', classe: 'analitica', paiId: 'pc_2', ativo: true, padrao: true },
    { id: 'pc_2_02', codigo: '2.02', nome: 'Fixas', tipo: 'despesa', classe: 'analitica', paiId: 'pc_2', ativo: true, padrao: true },
    { id: 'pc_2_03', codigo: '2.03', nome: 'Impostos', tipo: 'despesa', classe: 'analitica', paiId: 'pc_2', ativo: true, padrao: true },
    { id: 'pc_2_04', codigo: '2.04', nome: 'Outros', tipo: 'despesa', classe: 'analitica', paiId: 'pc_2', ativo: true, padrao: true }
  ];
  if (!Array.isArray(lista) || lista.length === 0) {
    return padraoClonado();
  }
  return lista.map((c, idx) => {
    const id = c.id || ('pc_' + (idx + 1) + '_' + Date.now());
    const codigo = String(c.codigo || (idx + 1)).trim();
    const nome = String(c.nome || c.descricao || ('Conta ' + codigo)).trim();
    const tipo = (c.tipo === 'receita' || c.tipo === 'entrada') ? 'receita' : 'despesa';
    const classe = (c.classe === 'sintetica' || c.sintetica) ? 'sintetica' : 'analitica';
    const paiId = c.paiId || null;
    const ativo = c.ativo !== false && c.status !== 'inativo';
    const padrao = !!c.padrao;
    return { id, codigo, nome, tipo, classe, paiId, ativo, padrao };
  });
}

function sementes() {
  return {
    os: [
      { id: 'os1', num: 1001, box: 'b1', vei: 'v1', cli: 'c1', st: 'executando', servicos: [{ valor: 250 }], pecas: [{ valor: 450, custo: 200 }] }
    ],
    boxes: [{ id: 'b1', nome: 'Box 01' }],
    veiculos: [{ id: 'v1', placa: 'ABC1D23', modelo: 'Volvo FH' }],
    clientes: [{ id: 'c1', nome: 'TransSilva' }],
    pecas: [{ id: 'p1', nome: 'Filtro', valor: 450, custo: 200 }],
    servicos: [{ id: 's1', nome: 'Revisão', valor: 250 }],
    ui: { filtro: 'todos', buscaPlaca: '' },
    cfg: { empresa: 'Oficina Pátio' }
  };
}

if (typeof window !== 'undefined') {
  window.sementes = sementes;
  window.obterContasUnificadas = obterContasUnificadas;
  window.obterMovimentosUnificados = obterMovimentosUnificados;
  window.emAberto = emAberto;
  window.saldoCaixa = saldoCaixa;
  window.soma = soma;
  window.totOS = totOS;
  window.hoje = hoje;
  window.agora = agora;
  window.dataBR = dataBR;
  window.dataBRfull = dataBRfull;
  window.formatarData = formatarData;
  window.horaBR = horaBR;
  window.diasEntre = diasEntre;
  window.addDias = addDias;
  window.mesRef = mesRef;
  window.esc = esc;
  window.soDigitos = soDigitos;
  window.torrar = torrar;
  window.V = V;
  window.C = C;
  window.B = B;
  window.P = P;
  window.Srv = Srv;
  window.ST = ST;
  window.uid = uid;
  window.sanitizeStr = sanitizeStr;
  window.apiThrottle = apiThrottle;
  window.isValidMoney = isValidMoney;
  window.parseBRL = parseBRL;
  window.brl = brl;
  window.brlCurto = brlCurto;
  window.formatBRL = brl;
  window.normalizarPlanoDeContas = normalizarPlanoDeContas;
  window.isPerfilMecanico = isPerfilMecanico;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports.isValidMoney = isValidMoney;
  module.exports.parseBRL = parseBRL;
  module.exports.brl = brl;
  module.exports.brlCurto = brlCurto;
  module.exports.formatBRL = brl;
  module.exports.esc = esc;
  module.exports.hoje = hoje;
  module.exports.uid = uid;
}
