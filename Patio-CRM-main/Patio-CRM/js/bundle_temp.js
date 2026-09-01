
/* --- FILE: icons.js --- */
/* =====================================================================
   PÁTIO CRM — ÍCONES SVG
===================================================================== */
const ICONS = {
  patio: '<path d="M3 17V9a1 1 0 0 1 1-1h10v9M14 11h4l3 3v3h-7"/><circle cx="7" cy="17.5" r="2"/><circle cx="17" cy="17.5" r="2"/>',
  painel: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/>',
  caixa: '<path d="M3 8.5 12 4l9 4.5v7L12 20l-9-4.5z"/><path d="M3 8.5 12 13l9-4.5M12 13v7"/>',
  pecas: '<path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/><circle cx="12" cy="12" r="4"/>',
  fin: '<rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/>',
  zap: '<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>',
  cad: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  cfg: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  relatorios: '<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>',
  busca: '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
  mais: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
  check: '<polyline points="20 6 9 17 4 12"/>',
  x: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
  zap_send: '<line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>',
  edit: '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>',
  lixo: '<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  voltar: '<line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>',
  copiar: '<rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  imprimir: '<polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
  caminhao: '<path d="M1 3h15v13H1z"/><path d="M16 8h4l3 3v5h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>',
  grana: '<line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
  alerta: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>',
  relogio: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  historico: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 14 14"/><path d="M3.05 11a9 9 0 1 1 .5 4"/>',
  tag: '<path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/>',
  doc: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>',
  filtro: '<polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>',
  cartao: '<rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/>',
  qr: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><line x1="14" y1="14" x2="14" y2="14.01"/><line x1="17" y1="14" x2="21" y2="14"/><line x1="14" y1="17" x2="17" y2="17"/><line x1="14" y1="21" x2="21" y2="21"/>'
};

const ico = (nome, tam = 20, classe = '') => {
  const path = ICONS[nome] || ICONS.doc;
  return `<svg class="ico ${classe}" width="${tam}" height="${tam}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;
};

/* --- FILE: state.js --- */
/* =====================================================================
   PÁTIO CRM — ESTADO CENTRAL, PERSISTÊNCIA & UTILITÁRIOS
===================================================================== */
const CHAVE = 'patio_oficina_v1';
let S = null;
let salvarTimer = null;
let folhaAtual = null;
let confirmando = null;

// Sistema de Armazenamento Local Robusto (LocalStorage + window.storage)
const armazem = {
  async ler() {
    try {
      if (window.storage && typeof window.storage.get === 'function') {
        const r = await window.storage.get(CHAVE);
        if (r && r.value) return JSON.parse(r.value);
      }
    } catch (e) {
      console.warn('Erro ao ler do storage da janela:', e);
    }
    try {
      const local = localStorage.getItem(CHAVE);
      if (local) return JSON.parse(local);
    } catch (e) {
      console.warn('Erro ao ler do localStorage:', e);
    }
    return null;
  },
  async gravar(obj) {
    try {
      localStorage.setItem(CHAVE, JSON.stringify(obj));
    } catch (e) {
      console.warn('Erro ao gravar no localStorage:', e);
    }
    try {
      if (window.storage && typeof window.storage.set === 'function') {
        await window.storage.set(CHAVE, JSON.stringify(obj));
      }
    } catch (e) {
      console.warn('Erro ao gravar no storage da janela:', e);
    }
  }
};

function salvar() {
  clearTimeout(salvarTimer);
  const statusEl = document.getElementById('status-salvo');
  if (statusEl) statusEl.textContent = 'Salvando...';
  salvarTimer = setTimeout(() => {
    armazem.gravar(S);
    if (statusEl) {
      statusEl.textContent = '● Salvo';
      setTimeout(() => { if (statusEl) statusEl.textContent = ''; }, 2000);
    }
  }, 300);
}

/* ---------------- Utilitários Gerais ---------------- */
const uid = (p = 'id') => p + '_' + Math.random().toString(36).slice(2, 9);
const brl = (n) => (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const brlCurto = (n) => {
  n = Number(n) || 0;
  return Math.abs(n) >= 1000
    ? 'R$ ' + (n / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + 'k'
    : brl(n);
};
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
const C = (id) => (S.clientes || []).find((c) => c.id === id) || { nome: 'Cliente não encontrado', doc: '', fone: '' };
const V = (id) => (S.veiculos || []).find((v) => v.id === id) || { placa: 'SEM PLACA', modelo: '', marca: '' };
const P = (id) => (S.pecas || []).find((p) => p.id === id) || { nome: 'Peça não encontrada', custo: 0, venda: 0 };
const Serv = (id) => (S.servicos || []).find((s) => s.id === id) || { nome: 'Serviço', valor: 0 };
const B = (id) => (S.boxes || []).find((b) => b.id === id) || { nome: 'Pátio Geral' };
const OSatual = () => (S.os || []).find((o) => o.id === S.ui.osAberta);

const soma = (arr, fn) => (arr || []).reduce((acc, it) => acc + (fn ? fn(it) : Number(it) || 0), 0);
const totOS = (o) => {
  if (!o) return 0;
  const totServ = soma(o.servicos, (i) => (i.qtd || 1) * (i.valor || 0));
  const totPec = soma(o.pecas, (i) => (i.qtd || 1) * (i.valor || 0));
  return Math.max(0, totServ + totPec - (Number(o.desc) || 0));
};

const emAberto = (tipo) => (S.contas || []).filter((c) => c.tipo === tipo && !c.pago);
const saldoCaixa = () => {
  const ini = Number(S.cfg.saldoInicial) || 0;
  const ent = soma((S.movimentos || []).filter((m) => m.tipo === 'entrada'), (m) => m.valor);
  const sai = soma((S.movimentos || []).filter((m) => m.tipo === 'saida'), (m) => m.valor);
  return ini + ent - sai;
};

/* ---------------- Dados Iniciais Demonstrativos (Oficina Pesada) ---------------- */
function sementes() {
  const dHoje = hoje();
  return {
    v2_financeiro: true,
    v_agosto: true, // Flag da simulação mensal completa
    proxNum: 1048,
    cfg: {
      empresa: 'Pátio Diesel & Hidráulica',
      cnpj: '12.345.678/0001-90',
      fone: '(11) 99876-5432',
      endereco: 'Rodovia Anhanguera, km 108 — Campinas/SP',
      saldoInicial: 25400.00,
      prazoPadrao: 28,
      chavePix: 'financeiro@patiodiesel.com.br',
      bancoNome: 'Banco do Brasil (Ag: 1234-5 / CC: 56789-0)',
      garantiaMeses: 3,
      termoGarantia: 'Garantia de 90 dias para serviços mecânicos e peças aplicadas com defeito de fabricação.',
      apibrasil: { deviceToken: '', bearerToken: '' }
    },
    ui: {
      view: 'patio',
      filtro: 'todos',
      abaFin: 'dashboard',
      filtroFin: 'tudo',
      abaOS: 'servicos',
      abaCad: 'clientes',
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
    mecanicos: [
      { id: 'm1', nome: 'Valdir (Mecânico Chefe)', esp: 'Motor & Câmbio' },
      { id: 'm2', nome: 'Jonas (Especialista Freios)', esp: 'Pneumática & Freios' },
      { id: 'm3', nome: 'Renato (Diagnóstico)', esp: 'Injeção & Eletrônica' },
      { id: 'm4', nome: 'Clodoaldo (Geometria)', esp: 'Alinhamento & Suspensão' }
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
      },
      {
        id: 'c5',
        nome: 'RodoCargas Brasil Express Ltda',
        fantasia: 'RodoCargas Express',
        doc: '56.789.012/0001-45',
        fone: '19971122334',
        email: 'oficina@rodocargas.com.br',
        contato: 'Roberto Meireles',
        prazo: 28,
        ie: '456.789.012.333',
        endereco: 'Via Anhanguera, km 112',
        cidade: 'Campinas',
        uf: 'SP',
        cep: '13060-000',
        optin: true,
        bloqueado: false
      },
      {
        id: 'c6',
        nome: 'Transportadora Sul-Sudeste S/A',
        fantasia: 'Sul-Sudeste Cargas',
        doc: '67.890.123/0001-56',
        fone: '11988997766',
        email: 'frotas@sulsudeste.com.br',
        contato: 'Juliana Prado',
        prazo: 30,
        ie: '567.890.123.444',
        endereco: 'Av. Brasil, 4500',
        cidade: 'Vinhedo',
        uf: 'SP',
        cep: '13280-000',
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
      { id: 'v6', cli: 'c4', placa: 'CXP7719', marca: 'Volkswagen', modelo: 'Constellation 24.280', ano: '2018', km: 610000, tipo: 'Truck Baú' },
      { id: 'v7', cli: 'c5', placa: 'SUL9A55', marca: 'Scania', modelo: 'R 500 V8 6x4', ano: '2022', km: 310500, tipo: 'Cavalo Mecânico' },
      { id: 'v8', cli: 'c6', placa: 'BRS4F10', marca: 'Volvo', modelo: 'FH 500 I-Shift', ano: '2021', km: 395000, tipo: 'Cavalo Mecânico' },
      { id: 'v9', cli: 'c3', placa: 'GRS1E33', marca: 'Mercedes-Benz', modelo: 'Axor 2544 6x2', ano: '2020', km: 480000, tipo: 'Cavalo Mecânico' }
    ],
    servicos: [
      { id: 's1', nome: 'Revisão Completa de Freio (Eixo Traseiro e Dianteiro)', valor: 850.00, horas: 4.5 },
      { id: 's2', nome: 'Troca de Kit de Embreagem com Retífica de Volante', valor: 1600.00, horas: 8.0 },
      { id: 's3', nome: 'Troca de Óleo de Motor, Filtro de Óleo e Combustível', valor: 380.00, horas: 1.5 },
      { id: 's4', nome: 'Diagnóstico Eletrônico & Calibração de Unidades Injetoras', valor: 650.00, horas: 3.0 },
      { id: 's5', nome: 'Revisão do Sistema de Arla 32 & Bomba Dosadora', valor: 920.00, horas: 4.0 },
      { id: 's6', nome: 'Geometria Completa de Direção & Alinhamento a Laser', valor: 480.00, horas: 2.0 },
      { id: 's7', nome: 'Reparo e Vedação de Cuíca de Freio Dupla Spring Brake', valor: 290.00, horas: 1.5 },
      { id: 's8', nome: 'Revisão e Regulagem de Válvulas de Motor', valor: 750.00, horas: 3.5 }
    ],
    pecas: [
      { id: 'p1', cod: 'SCN-1875892', nome: 'Jogo de Pastilhas de Freio Scania Série R (WVA 29174)', un: 'jg', qtd: 12, min: 4, custo: 320.00, venda: 540.00, loc: 'Prat. A-02', forn: 'Fras-le Peças' },
      { id: 'p2', cod: 'VLV-2134567', nome: 'Filtro Separador Racor Volvo FH D13', un: 'un', qtd: 18, min: 5, custo: 85.00, venda: 165.00, loc: 'Prat. B-01', forn: 'Donaldson Filtros' },
      { id: 'p3', cod: 'MBZ-004420', nome: 'Cuíca de Freio Dupla Tipo 30/30 Tristop', un: 'un', qtd: 8, min: 2, custo: 420.00, venda: 730.00, loc: 'Prat. C-04', forn: 'Knorr-Bremse' },
      { id: 'p4', cod: 'LUB-15W40', nome: 'Óleo Motor Diesel 15W40 CI-4 Top Turbo (Galão 20L)', un: 'gl', qtd: 24, min: 6, custo: 290.00, venda: 480.00, loc: 'Depósito 01', forn: 'Lubrax Distribuidora' },
      { id: 'p5', cod: 'WBC-480104', nome: 'Válvula Moduladora EBS/ABS Wabco', un: 'un', qtd: 4, min: 1, custo: 1250.00, venda: 2100.00, loc: 'Prat. E-01', forn: 'ZF Wabco Brasil' },
      { id: 'p6', cod: 'SCN-2245890', nome: 'Kit Embreagem Cerâmica Scania 430mm Sachs', un: 'kt', qtd: 5, min: 2, custo: 2800.00, venda: 4450.00, loc: 'Pallet 03', forn: 'Sachs Embreagens' },
      { id: 'p7', cod: 'FLT-AR540', nome: 'Elemento Filtro de Ar Primário Volvo FH4/FH5', un: 'un', qtd: 10, min: 3, custo: 190.00, venda: 340.00, loc: 'Prat. B-03', forn: 'Mann Filter' },
      { id: 'p8', cod: 'KNR-430V', nome: 'Disco de Freio Ventilado 430mm Knorr Scania/Volvo', un: 'un', qtd: 6, min: 2, custo: 580.00, venda: 990.00, loc: 'Prat. A-05', forn: 'Knorr-Bremse' },
      { id: 'p9', cod: 'BSH-CR0445', nome: 'Bico Injetor Common Rail Bosch Euro 5', un: 'un', qtd: 6, min: 2, custo: 1100.00, venda: 1850.00, loc: 'Armário Seguro 01', forn: 'Bosch Diesel Center' },
      { id: 'p10', cod: 'KNR-APU90', nome: 'Válvula Reguladora de Pressão Secadora de Ar APU', un: 'un', qtd: 3, min: 1, custo: 750.00, venda: 1280.00, loc: 'Prat. D-02', forn: 'Knorr-Bremse' }
    ],
    os: [
      /* ===== ORDENS DE SERVIÇO CONCLUÍDAS NO MÊS DE AGOSTO (2026-08) ===== */
      {
        id: 'os1020',
        num: 1020,
        box: 'b1',
        vei: 'v1',
        cli: 'c1',
        mec: 'Valdir (Mecânico Chefe)',
        st: 'finalizada',
        abertura: '2026-08-02',
        fechamento: '2026-08-03',
        prev: '2026-08-03',
        km: 378000,
        queixa: 'Embreagem patinando em aclives acentuados e troca de óleo preventiva.',
        servicos: [
          { id: 's2', nome: 'Troca de Kit de Embreagem com Retífica de Volante', qtd: 1, valor: 1600.00 },
          { id: 's3', nome: 'Troca de Óleo de Motor, Filtro de Óleo e Combustível', qtd: 1, valor: 380.00 }
        ],
        pecas: [
          { id: 'p6', nome: 'Kit Embreagem Cerâmica Scania 430mm Sachs', qtd: 1, valor: 4450.00 },
          { id: 'p4', nome: 'Óleo Motor Diesel 15W40 CI-4 Top Turbo (Galão 20L)', qtd: 2, valor: 480.00 }
        ],
        desc: 150.00,
        pago: true,
        formaPgto: 'Pix'
      },
      {
        id: 'os1021',
        num: 1021,
        box: 'b2',
        vei: 'v3',
        cli: 'c2',
        mec: 'Jonas (Especialista Freios)',
        st: 'finalizada',
        abertura: '2026-08-04',
        fechamento: '2026-08-05',
        prev: '2026-08-05',
        km: 415000,
        queixa: 'Ruído de atrito e baixa pressão no circuito de freio do eixo traseiro.',
        servicos: [
          { id: 's1', nome: 'Revisão Completa de Freio (Eixo Traseiro e Dianteiro)', qtd: 1, valor: 850.00 },
          { id: 's7', nome: 'Reparo e Vedação de Cuíca de Freio Dupla Spring Brake', qtd: 1, valor: 290.00 }
        ],
        pecas: [
          { id: 'p1', nome: 'Jogo de Pastilhas de Freio Scania Série R (WVA 29174)', qtd: 2, valor: 540.00 },
          { id: 'p3', nome: 'Cuíca de Freio Dupla Tipo 30/30 Tristop', qtd: 2, valor: 730.00 }
        ],
        desc: 0,
        pago: true,
        formaPgto: 'Boleto 28d'
      },
      {
        id: 'os1022',
        num: 1022,
        box: 'b5',
        vei: 'v5',
        cli: 'c3',
        mec: 'Clodoaldo (Geometria)',
        st: 'finalizada',
        abertura: '2026-08-06',
        fechamento: '2026-08-07',
        prev: '2026-08-07',
        km: 552000,
        queixa: 'Caminhão puxando fortemente para a direita e vibração no volante a 80 km/h.',
        servicos: [
          { id: 's6', nome: 'Geometria Completa de Direção & Alinhamento a Laser', qtd: 1, valor: 480.00 },
          { id: 's7', nome: 'Reparo e Vedação de Cuíca de Freio Dupla Spring Brake', qtd: 1, valor: 290.00 }
        ],
        pecas: [
          { id: 'p2', nome: 'Filtro Separador Racor Volvo FH D13', qtd: 2, valor: 165.00 },
          { id: 'p7', nome: 'Elemento Filtro de Ar Primário Volvo FH4/FH5', qtd: 1, valor: 340.00 }
        ],
        desc: 50.00,
        pago: true,
        formaPgto: 'Pix'
      },
      {
        id: 'os1023',
        num: 1023,
        box: 'b3',
        vei: 'v2',
        cli: 'c1',
        mec: 'Renato (Diagnóstico)',
        st: 'finalizada',
        abertura: '2026-08-08',
        fechamento: '2026-08-10',
        prev: '2026-08-10',
        km: 291000,
        queixa: 'Falha intermitente no sistema de dosagem de Arla 32 com alerta no painel.',
        servicos: [
          { id: 's5', nome: 'Revisão do Sistema de Arla 32 & Bomba Dosadora', qtd: 1, valor: 920.00 },
          { id: 's3', nome: 'Troca de Óleo de Motor, Filtro de Óleo e Combustível', qtd: 1, valor: 380.00 }
        ],
        pecas: [
          { id: 'p2', nome: 'Filtro Separador Racor Volvo FH D13', qtd: 2, valor: 165.00 },
          { id: 'p7', nome: 'Elemento Filtro de Ar Primário Volvo FH4/FH5', qtd: 2, valor: 340.00 }
        ],
        desc: 50.00,
        pago: true,
        formaPgto: 'Boleto 30d'
      },
      {
        id: 'os1024',
        num: 1024,
        box: 'b1',
        vei: 'v6',
        cli: 'c4',
        mec: 'Valdir (Mecânico Chefe)',
        st: 'finalizada',
        abertura: '2026-08-11',
        fechamento: '2026-08-12',
        prev: '2026-08-12',
        km: 604000,
        queixa: 'Revisão geral de 600 mil km, troca de lubrificantes e regulagem de válvulas.',
        servicos: [
          { id: 's3', nome: 'Troca de Óleo de Motor, Filtro de Óleo e Combustível', qtd: 1, valor: 380.00 },
          { id: 's8', nome: 'Revisão e Regulagem de Válvulas de Motor', qtd: 1, valor: 750.00 }
        ],
        pecas: [
          { id: 'p4', nome: 'Óleo Motor Diesel 15W40 CI-4 Top Turbo (Galão 20L)', qtd: 2, valor: 480.00 },
          { id: 'p2', nome: 'Filtro Separador Racor Volvo FH D13', qtd: 1, valor: 165.00 }
        ],
        desc: 35.00,
        pago: true,
        formaPgto: 'Cartão de Débito'
      },
      {
        id: 'os1025',
        num: 1025,
        box: 'b2',
        vei: 'v7',
        cli: 'c5',
        mec: 'Jonas (Especialista Freios)',
        st: 'finalizada',
        abertura: '2026-08-13',
        fechamento: '2026-08-14',
        prev: '2026-08-14',
        km: 305000,
        queixa: 'Luz de falha do ABS acesa e travamento parcial de roda no cavalo.',
        servicos: [
          { id: 's1', nome: 'Revisão Completa de Freio (Eixo Traseiro e Dianteiro)', qtd: 1, valor: 850.00 },
          { id: 's4', nome: 'Diagnóstico Eletrônico & Calibração de Unidades Injetoras', qtd: 1, valor: 650.00 }
        ],
        pecas: [
          { id: 'p5', nome: 'Válvula Moduladora EBS/ABS Wabco', qtd: 1, valor: 2100.00 },
          { id: 'p1', nome: 'Jogo de Pastilhas de Freio Scania Série R (WVA 29174)', qtd: 2, valor: 540.00 }
        ],
        desc: 100.00,
        pago: true,
        formaPgto: 'Boleto 28d'
      },
      {
        id: 'os1026',
        num: 1026,
        box: 'b3',
        vei: 'v8',
        cli: 'c6',
        mec: 'Renato (Diagnóstico)',
        st: 'finalizada',
        abertura: '2026-08-15',
        fechamento: '2026-08-17',
        prev: '2026-08-17',
        km: 388000,
        queixa: 'Fumaça preta excessiva na aceleração e falha de combustão no cilindro 4.',
        servicos: [
          { id: 's4', nome: 'Diagnóstico Eletrônico & Calibração de Unidades Injetoras', qtd: 2, valor: 650.00 },
          { id: 's8', nome: 'Revisão e Regulagem de Válvulas de Motor', qtd: 1, valor: 750.00 }
        ],
        pecas: [
          { id: 'p9', nome: 'Bico Injetor Common Rail Bosch Euro 5', qtd: 4, valor: 1850.00 }
        ],
        desc: 200.00,
        pago: true,
        formaPgto: 'TED'
      },
      {
        id: 'os1027',
        num: 1027,
        box: 'b5',
        vei: 'v4',
        cli: 'c2',
        mec: 'Clodoaldo (Geometria)',
        st: 'finalizada',
        abertura: '2026-08-18',
        fechamento: '2026-08-19',
        prev: '2026-08-19',
        km: 141000,
        queixa: 'Alinhamento completo após troca de pneus na transportadora.',
        servicos: [
          { id: 's6', nome: 'Geometria Completa de Direção & Alinhamento a Laser', qtd: 2, valor: 480.00 }
        ],
        pecas: [
          { id: 'p7', nome: 'Elemento Filtro de Ar Primário Volvo FH4/FH5', qtd: 1, valor: 340.00 },
          { id: 'p2', nome: 'Filtro Separador Racor Volvo FH D13', qtd: 1, valor: 165.00 }
        ],
        desc: 0,
        pago: true,
        formaPgto: 'Boleto 28d'
      },
      {
        id: 'os1028',
        num: 1028,
        box: 'b2',
        vei: 'v9',
        cli: 'c3',
        mec: 'Jonas (Especialista Freios)',
        st: 'finalizada',
        abertura: '2026-08-20',
        fechamento: '2026-08-21',
        prev: '2026-08-21',
        km: 474000,
        queixa: 'Perda constante de pressão no manômetro de ar e descarga na válvula secadora.',
        servicos: [
          { id: 's1', nome: 'Revisão Completa de Freio (Eixo Traseiro e Dianteiro)', qtd: 1, valor: 850.00 },
          { id: 's7', nome: 'Reparo e Vedação de Cuíca de Freio Dupla Spring Brake', qtd: 2, valor: 290.00 }
        ],
        pecas: [
          { id: 'p10', nome: 'Válvula Reguladora de Pressão Secadora de Ar APU', qtd: 1, valor: 1280.00 },
          { id: 'p3', nome: 'Cuíca de Freio Dupla Tipo 30/30 Tristop', qtd: 2, valor: 730.00 }
        ],
        desc: 120.00,
        pago: true,
        formaPgto: 'Pix'
      },
      {
        id: 'os1029',
        num: 1029,
        box: 'b1',
        vei: 'v1',
        cli: 'c1',
        mec: 'Valdir (Mecânico Chefe)',
        st: 'finalizada',
        abertura: '2026-08-22',
        fechamento: '2026-08-24',
        prev: '2026-08-24',
        km: 381000,
        queixa: 'Troca preventiva de discos e pastilhas de freio antes de viagem para o Sul.',
        servicos: [
          { id: 's1', nome: 'Revisão Completa de Freio (Eixo Traseiro e Dianteiro)', qtd: 2, valor: 850.00 }
        ],
        pecas: [
          { id: 'p8', nome: 'Disco de Freio Ventilado 430mm Knorr Scania/Volvo', qtd: 2, valor: 990.00 },
          { id: 'p1', nome: 'Jogo de Pastilhas de Freio Scania Série R (WVA 29174)', qtd: 2, valor: 540.00 }
        ],
        desc: 100.00,
        pago: true,
        formaPgto: 'Boleto 30d'
      },
      {
        id: 'os1030',
        num: 1030,
        box: 'b3',
        vei: 'v7',
        cli: 'c5',
        mec: 'Renato (Diagnóstico)',
        st: 'finalizada',
        abertura: '2026-08-25',
        fechamento: '2026-08-26',
        prev: '2026-08-26',
        km: 308000,
        queixa: 'Troca de lubrificantes e calibração de sensores de rotação do motor.',
        servicos: [
          { id: 's3', nome: 'Troca de Óleo de Motor, Filtro de Óleo e Combustível', qtd: 1, valor: 380.00 },
          { id: 's4', nome: 'Diagnóstico Eletrônico & Calibração de Unidades Injetoras', qtd: 1, valor: 650.00 }
        ],
        pecas: [
          { id: 'p4', nome: 'Óleo Motor Diesel 15W40 CI-4 Top Turbo (Galão 20L)', qtd: 2, valor: 480.00 },
          { id: 'p7', nome: 'Elemento Filtro de Ar Primário Volvo FH4/FH5', qtd: 2, valor: 340.00 }
        ],
        desc: 60.00,
        pago: true,
        formaPgto: 'Boleto 28d'
      },
      {
        id: 'os1031',
        num: 1031,
        box: 'b2',
        vei: 'v3',
        cli: 'c2',
        mec: 'Jonas (Especialista Freios)',
        st: 'finalizada',
        abertura: '2026-08-27',
        fechamento: '2026-08-28',
        prev: '2026-08-28',
        km: 418000,
        queixa: 'Substituição de válvula moduladora de freio e teste no dinamômetro.',
        servicos: [
          { id: 's1', nome: 'Revisão Completa de Freio (Eixo Traseiro e Dianteiro)', qtd: 1, valor: 850.00 },
          { id: 's7', nome: 'Reparo e Vedação de Cuíca de Freio Dupla Spring Brake', qtd: 1, valor: 290.00 }
        ],
        pecas: [
          { id: 'p5', nome: 'Válvula Moduladora EBS/ABS Wabco', qtd: 1, valor: 2100.00 }
        ],
        desc: 40.00,
        pago: true,
        formaPgto: 'Pix'
      },
      {
        id: 'os1032',
        num: 1032,
        box: 'b1',
        vei: 'v5',
        cli: 'c3',
        mec: 'Valdir (Mecânico Chefe)',
        st: 'finalizada',
        abertura: '2026-08-28',
        fechamento: '2026-08-29',
        prev: '2026-08-29',
        km: 557000,
        queixa: 'Quebra de platô de embreagem e retífica do volante.',
        servicos: [
          { id: 's2', nome: 'Troca de Kit de Embreagem com Retífica de Volante', qtd: 1, valor: 1600.00 },
          { id: 's8', nome: 'Revisão e Regulagem de Válvulas de Motor', qtd: 1, valor: 750.00 }
        ],
        pecas: [
          { id: 'p6', nome: 'Kit Embreagem Cerâmica Scania 430mm Sachs', qtd: 1, valor: 4450.00 }
        ],
        desc: 0,
        pago: true,
        formaPgto: 'Pix'
      },
      {
        id: 'os1033',
        num: 1033,
        box: 'b5',
        vei: 'v8',
        cli: 'c6',
        mec: 'Clodoaldo (Geometria)',
        st: 'finalizada',
        abertura: '2026-08-29',
        fechamento: '2026-08-31',
        prev: '2026-08-31',
        km: 393000,
        queixa: 'Alinhamento computadorizado 3D de bitrem e revisão de freio dianteiro.',
        servicos: [
          { id: 's6', nome: 'Geometria Completa de Direção & Alinhamento a Laser', qtd: 1, valor: 480.00 },
          { id: 's1', nome: 'Revisão Completa de Freio (Eixo Traseiro e Dianteiro)', qtd: 1, valor: 850.00 }
        ],
        pecas: [
          { id: 'p1', nome: 'Jogo de Pastilhas de Freio Scania Série R (WVA 29174)', qtd: 2, valor: 540.00 }
        ],
        desc: 0,
        pago: true,
        formaPgto: 'Pix'
      },

      /* ===== ORDENS ATUAIS DE SETEMBRO (PÁTIO EM ANDAMENTO) ===== */
      {
        id: 'os1044',
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
        formaPgto: ''
      },
      {
        id: 'os1045',
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
        formaPgto: ''
      },
      {
        id: 'os1046',
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
        formaPgto: ''
      },
      {
        id: 'os1047',
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
        formaPgto: ''
      }
    ],
    nfsRecebidas: [
      {
        chave: '352608044891000190550010000448911182736451',
        num: '44891',
        serie: '1',
        data: '2026-08-03',
        emit: 'Sachs Embreagens Ltda',
        cnpjEmit: '43.210.987/0001-55',
        total: 11200.00,
        itens: [
          { cod: 'SCN-2245890', nome: 'Kit Embreagem Cerâmica Scania 430mm Sachs', qtd: 4, unit: 2800.00, total: 11200.00 }
        ]
      },
      {
        chave: '352608088204000190550010000882041234567890',
        num: '88204',
        serie: '1',
        data: '2026-08-08',
        emit: 'Knorr-Bremse Brasil Sistemas',
        cnpjEmit: '54.321.098/0001-66',
        total: 8940.00,
        itens: [
          { cod: 'MBZ-004420', nome: 'Cuíca de Freio Dupla Tipo 30/30 Tristop', qtd: 6, unit: 420.00, total: 2520.00 },
          { cod: 'KNR-430V', nome: 'Disco de Freio Ventilado 430mm Knorr', qtd: 8, unit: 580.00, total: 4640.00 },
          { cod: 'SCN-1875892', nome: 'Jogo de Pastilhas de Freio Scania', qtd: 5, unit: 320.00, total: 1600.00 }
        ]
      },
      {
        chave: '352608031950000190550010000319501345678901',
        num: '31950',
        serie: '2',
        data: '2026-08-14',
        emit: 'Lubrax Distribuidora Petrobras',
        cnpjEmit: '65.432.109/0001-77',
        total: 7420.00,
        itens: [
          { cod: 'LUB-15W40', nome: 'Óleo Motor Diesel 15W40 CI-4 Top Turbo (Galão 20L)', qtd: 20, unit: 290.00, total: 5800.00 },
          { cod: 'VLV-2134567', nome: 'Filtro Separador Racor Volvo FH D13', qtd: 19, unit: 85.00, total: 1615.00 }
        ]
      },
      {
        chave: '352608055102000190550010000551021456789012',
        num: '55102',
        serie: '1',
        data: '2026-08-21',
        emit: 'Bosch Diesel Center Peças',
        cnpjEmit: '76.543.210/0001-88',
        total: 9850.00,
        itens: [
          { cod: 'BSH-CR0445', nome: 'Bico Injetor Common Rail Bosch Euro 5', qtd: 8, unit: 1100.00, total: 8800.00 },
          { cod: 'FLT-AR540', nome: 'Elemento Filtro de Ar Primário Volvo', qtd: 5, unit: 190.00, total: 950.00 }
        ]
      },
      {
        chave: '352608072190000190550010000721901567890123',
        num: '72190',
        serie: '1',
        data: '2026-08-28',
        emit: 'ZF Wabco Soluções Comerciais',
        cnpjEmit: '87.654.321/0001-99',
        total: 6300.00,
        itens: [
          { cod: 'WBC-480104', nome: 'Válvula Moduladora EBS/ABS Wabco', qtd: 4, unit: 1250.00, total: 5000.00 },
          { cod: 'KNR-APU90', nome: 'Válvula Reguladora de Pressão Secadora de Ar APU', qtd: 1, unit: 750.00, total: 750.00 }
        ]
      }
    ],
    compras: [
      { id: 'cmp1', data: '2026-08-03', forn: 'Sachs Embreagens', total: 11200.00, nf: '44891', itens: 4 },
      { id: 'cmp2', data: '2026-08-08', forn: 'Knorr-Bremse Brasil', total: 8940.00, nf: '88204', itens: 19 },
      { id: 'cmp3', data: '2026-08-14', forn: 'Lubrax Distribuidora', total: 7420.00, nf: '31950', itens: 39 },
      { id: 'cmp4', data: '2026-08-21', forn: 'Bosch Diesel Center', total: 9850.00, nf: '55102', itens: 13 },
      { id: 'cmp5', data: '2026-08-28', forn: 'ZF Wabco Brasil', total: 6300.00, nf: '72190', itens: 5 }
    ],
    contas: [
      /* Contas a Receber Faturadas */
      { id: 'ct1', tipo: 'receber', desc: 'OS 1021 — Revisão Freios Actros', parte: 'Expresso Vale Logística & Cargas', valor: 3680.00, venc: '2026-09-02', pago: false, cat: 'Serviços & Peças', doc: 'NF-1021', osId: 'os1021' },
      { id: 'ct2', tipo: 'receber', desc: 'OS 1023 — Sistema Arla Volvo FH', parte: 'TransRodrigues Transportes Ltda', valor: 2260.00, venc: '2026-09-08', pago: false, cat: 'Serviços & Peças', doc: 'NF-1023', osId: 'os1023' },
      { id: 'ct3', tipo: 'receber', desc: 'OS 1025 — Válvula EBS Scania RodoCargas', parte: 'RodoCargas Brasil Express Ltda', valor: 5370.00, venc: '2026-09-11', pago: false, cat: 'Serviços & Peças', doc: 'NF-1025', osId: 'os1025' },
      { id: 'ct4', tipo: 'receber', desc: 'OS 1027 — Geometria e Filtros DAF', parte: 'Expresso Vale Logística & Cargas', valor: 1580.00, venc: '2026-09-16', pago: false, cat: 'Serviços & Peças', doc: 'NF-1027', osId: 'os1027' },
      { id: 'ct5', tipo: 'receber', desc: 'OS 1029 — Discos e Pastilhas Scania', parte: 'TransRodrigues Transportes Ltda', valor: 4660.00, venc: '2026-09-22', pago: false, cat: 'Serviços & Peças', doc: 'NF-1029', osId: 'os1029' },
      { id: 'ct6', tipo: 'receber', desc: 'OS 1030 — Troca de Óleo e Sensores', parte: 'RodoCargas Brasil Express Ltda', valor: 2400.00, venc: '2026-09-24', pago: false, cat: 'Serviços & Peças', doc: 'NF-1030', osId: 'os1030' },
      
      /* Contas a Pagar Operacionais de Setembro */
      { id: 'ct10', tipo: 'pagar', desc: 'Folha de Pagamento Mecânicos e Equipe Pátio', parte: 'Equipe da Oficina', valor: 18500.00, venc: '2026-09-05', pago: false, cat: 'Pessoal & Salários', doc: 'FOLHA-09' },
      { id: 'ct11', tipo: 'pagar', desc: 'Aluguel do Barracão e Pátio Operacional', parte: 'Imobiliária Anhanguera', valor: 6500.00, venc: '2026-09-06', pago: false, cat: 'Estrutura & Aluguel', doc: 'BOL-0926' },
      { id: 'ct12', tipo: 'pagar', desc: 'Conta de Energia Elétrica CPFL', parte: 'CPFL Energia', valor: 1720.00, venc: '2026-09-08', pago: false, cat: 'Água / Luz / Internet', doc: 'FAT-CPFL-09' },
      { id: 'ct13', tipo: 'pagar', desc: 'Compra ZF Wabco Brasil (Válvulas & Moduladores)', parte: 'ZF Wabco Brasil', valor: 6300.00, venc: '2026-09-25', pago: false, cat: 'Fornecedores Peças', doc: 'NF-72190' }
    ],
    movimentos: [
      /* ===== MOVIMENTAÇÕES DE AGOSTO (FLUXO DE CAIXA REALIZADO) ===== */
      { id: 'mv01', data: '2026-08-03', tipo: 'entrada', desc: 'Recebimento Pix OS 1020 — TransRodrigues', valor: 7240.00, cat: 'Serviços & Peças', conc: true, forma: 'Pix' },
      { id: 'mv02', data: '2026-08-05', tipo: 'saida', desc: 'Folha de Pagamento Mecânicos e Equipe Pátio', valor: 18500.00, cat: 'Pessoal & Salários', conc: true, forma: 'TED' },
      { id: 'mv03', data: '2026-08-06', tipo: 'saida', desc: 'Aluguel do Barracão e Pátio Anhanguera', valor: 6500.00, cat: 'Estrutura & Aluguel', conc: true, forma: 'Boleto' },
      { id: 'mv04', data: '2026-08-07', tipo: 'entrada', desc: 'Recebimento Pix OS 1022 — AgroLog Fertilizantes', valor: 2010.00, cat: 'Serviços & Peças', conc: true, forma: 'Pix' },
      { id: 'mv05', data: '2026-08-08', tipo: 'saida', desc: 'Conta de Energia Elétrica CPFL', valor: 1680.00, cat: 'Água / Luz / Internet', conc: true, forma: 'Débito Automático' },
      { id: 'mv06', data: '2026-08-10', tipo: 'saida', desc: 'Pagamento Boleto Sachs Embreagens (NF 44891)', valor: 11200.00, cat: 'Fornecedores Peças', conc: true, forma: 'Boleto' },
      { id: 'mv07', data: '2026-08-12', tipo: 'entrada', desc: 'Recebimento Cartão Débito OS 1024 — Geraldo Antunes', valor: 2290.00, cat: 'Serviços & Peças', conc: true, forma: 'Cartão de Débito' },
      { id: 'mv08', data: '2026-08-15', tipo: 'saida', desc: 'Pagamento Boleto Knorr-Bremse Brasil (NF 88204)', valor: 8940.00, cat: 'Fornecedores Peças', conc: true, forma: 'Boleto' },
      { id: 'mv09', data: '2026-08-17', tipo: 'entrada', desc: 'Recebimento TED OS 1026 — Sul-Sudeste S/A', valor: 9450.00, cat: 'Serviços & Peças', conc: true, forma: 'TED' },
      { id: 'mv10', data: '2026-08-20', tipo: 'saida', desc: 'Guia DAS Simples Nacional (Tributos Mensais)', valor: 8910.00, cat: 'Impostos & Taxas', conc: true, forma: 'Boleto' },
      { id: 'mv11', data: '2026-08-20', tipo: 'saida', desc: 'Adiantamento & Comissões dos Mecânicos', valor: 5420.00, cat: 'Pessoal & Salários', conc: true, forma: 'Pix' },
      { id: 'mv12', data: '2026-08-21', tipo: 'entrada', desc: 'Recebimento Pix OS 1028 — AgroLog Grãos', valor: 4170.00, cat: 'Serviços & Peças', conc: true, forma: 'Pix' },
      { id: 'mv13', data: '2026-08-22', tipo: 'saida', desc: 'Pagamento Boleto Lubrax Distribuidora (NF 31950)', valor: 7420.00, cat: 'Óleos & Lubrificantes', conc: true, forma: 'Boleto' },
      { id: 'mv14', data: '2026-08-25', tipo: 'saida', desc: 'Pagamento Boleto Bosch Diesel Center (NF 55102)', valor: 9850.00, cat: 'Fornecedores Peças', conc: true, forma: 'Boleto' },
      { id: 'mv15', data: '2026-08-28', tipo: 'entrada', desc: 'Recebimento Pix OS 1031 — Expresso Vale', valor: 3200.00, cat: 'Serviços & Peças', conc: true, forma: 'Pix' },
      { id: 'mv16', data: '2026-08-29', tipo: 'entrada', desc: 'Recebimento Pix OS 1032 — AgroLog Grãos', valor: 6800.00, cat: 'Serviços & Peças', conc: true, forma: 'Pix' },
      { id: 'mv17', data: '2026-08-30', tipo: 'saida', desc: 'Internet Fibra Óptica Dedicada + Telefonia', valor: 650.00, cat: 'Água / Luz / Internet', conc: true, forma: 'Boleto' },
      { id: 'mv18', data: '2026-08-31', tipo: 'entrada', desc: 'Recebimento Pix OS 1033 — Sul-Sudeste S/A', valor: 2410.00, cat: 'Serviços & Peças', conc: true, forma: 'Pix' }
    ],
    extrato: [
      { data: '2026-08-03', valor: 7240.00, doc: 'PIX-1020', desc: 'PIX RECEBIDO TRANSRODRIGUES', conc: true },
      { data: '2026-08-05', valor: -18500.00, doc: 'FOLHA-08', desc: 'PAGTO FOLHA SALARIAL', conc: true },
      { data: '2026-08-06', valor: -6500.00, doc: 'BOL-0826', desc: 'IMOB ANHANGUERA ALUGUEL', conc: true },
      { data: '2026-08-07', valor: 2010.00, doc: 'PIX-1022', desc: 'PIX RECEBIDO AGROLOG', conc: true },
      { data: '2026-08-08', valor: -1680.00, doc: 'CPFL-08', desc: 'DEB AUT CPFL ENERGIA', conc: true },
      { data: '2026-08-10', valor: -11200.00, doc: 'BOL-44891', desc: 'PAGTO SACHS EMBREAGENS', conc: true },
      { data: '2026-08-12', valor: 2290.00, doc: 'POS-1024', desc: 'REDE CARTOES DEB GERALDO', conc: true },
      { data: '2026-08-15', valor: -8940.00, doc: 'BOL-88204', desc: 'PAGTO KNORR-BREMSE BRASIL', conc: true },
      { data: '2026-08-17', valor: 9450.00, doc: 'TED-1026', desc: 'TED RECEB SUL-SUDESTE', conc: true },
      { data: '2026-08-20', valor: -8910.00, doc: 'DAS-0826', desc: 'PGTO SIMPLES NACIONAL', conc: true },
      { data: '2026-08-20', valor: -5420.00, doc: 'PIX-MEC', desc: 'PIX COMISSOES MECANICOS', conc: true },
      { data: '2026-08-21', valor: 4170.00, doc: 'PIX-1028', desc: 'PIX RECEBIDO AGROLOG', conc: true },
      { data: '2026-08-22', valor: -7420.00, doc: 'BOL-31950', desc: 'PAGTO LUBRAX DISTRIB', conc: true },
      { data: '2026-08-25', valor: -9850.00, doc: 'BOL-55102', desc: 'PAGTO BOSCH DIESEL CENTER', conc: true },
      { data: '2026-08-28', valor: 3200.00, doc: 'PIX-1031', desc: 'PIX RECEBIDO EXPRESSO VALE', conc: true },
      { data: '2026-08-29', valor: 6800.00, doc: 'PIX-1032', desc: 'PIX RECEBIDO AGROLOG', conc: true },
      { data: '2026-08-30', valor: -650.00, doc: 'BOL-NET', desc: 'PAGTO FIBRA TELEFONIA', conc: true },
      { data: '2026-08-31', valor: 2410.00, doc: 'PIX-1033', desc: 'PIX RECEB SUL SUDESTE', conc: true }
    ],
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

/* --- FILE: patio.js --- */
/* =====================================================================
   PÁTIO CRM — MÓDULO DE PÁTIO, BOXES & ORDENS DE SERVIÇO (OS)
===================================================================== */

function viewPatio() {
  const osLista = S.os || [];
  const filtro = S.ui.filtro || 'todos';
  const buscaPlaca = (S.ui.buscaPlaca || '').trim().toUpperCase();

  // Filtragem
  let filtradas = osLista;
  if (filtro !== 'todos') {
    filtradas = filtradas.filter(o => o.st === filtro);
  }
  if (buscaPlaca) {
    filtradas = filtradas.filter(o => {
      const v = V(o.vei), c = C(o.cli);
      return v.placa.includes(buscaPlaca) || v.modelo.toUpperCase().includes(buscaPlaca) || c.nome.toUpperCase().includes(buscaPlaca);
    });
  }

  // Contagens por status para os chips
  const contagens = {
    todos: osLista.length,
    fila: osLista.filter(o => o.st === 'fila').length,
    aprovacao: osLista.filter(o => o.st === 'aprovacao').length,
    executando: osLista.filter(o => o.st === 'executando').length,
    peca: osLista.filter(o => o.st === 'peca').length,
    finalizada: osLista.filter(o => o.st === 'finalizada').length
  };

  const chips = [
    ['todos', 'Todos os Boxes', contagens.todos],
    ['executando', 'Em Execução', contagens.executando],
    ['peca', 'Parado por Peça', contagens.peca],
    ['aprovacao', 'Aguardando Aprovação', contagens.aprovacao],
    ['fila', 'Na Fila', contagens.fila],
    ['finalizada', 'Finalizadas', contagens.finalizada]
  ];

  // Grade de Boxes do Pátio
  const cardsHtml = S.boxes.map(box => {
    // Procura OS ativa no box
    const osDoBox = filtradas.find(o => o.box === box.id && o.st !== 'finalizada');
    if (osDoBox) return cardOS(osDoBox, box);
    // Se o filtro estiver em finalizada ou não for 'todos', e não houver OS correspondente
    if (filtro === 'finalizada') {
      const fin = filtradas.find(o => o.box === box.id && o.st === 'finalizada');
      return fin ? cardOS(fin, box) : '';
    }
    return filtro === 'todos' ? cardLivre(box) : '';
  }).filter(Boolean).join('');

  return `
  <div class="kpis" style="margin-bottom:14px">
    <div class="kpi bom">
      <div class="r">${ico('patio', 14)} Em Atendimento</div>
      <div class="v">${contagens.executando}</div>
      <div class="d">${contagens.executando} veículos nos boxes</div>
    </div>
    <div class="kpi ${contagens.peca ? 'aviso' : 'neutro'}">
      <div class="r">${ico('pecas', 14)} Parados p/ Peça</div>
      <div class="v">${contagens.peca}</div>
      <div class="d">Aguardando almoxarifado/fornecedor</div>
    </div>
    <div class="kpi neutro">
      <div class="r">${ico('doc', 14)} Aguardando Aprovação</div>
      <div class="v">${contagens.aprovacao}</div>
      <div class="d">Orçamentos enviados</div>
    </div>
    <div class="kpi bom">
      <div class="r">${ico('check', 14)} Finalizadas no Mês</div>
      <div class="v">${contagens.finalizada}</div>
      <div class="d">Veículos liberados</div>
    </div>
  </div>

  <div class="entre" style="margin-bottom:12px;flex-wrap:wrap;gap:8px">
    <div class="trilho" style="padding:0;margin:0">
      ${chips.map(([k, label, total]) => `
        <button class="chip" data-act="filtro" data-f="${k}" aria-pressed="${filtro === k}">
          ${label} <span class="n">${total}</span>
        </button>
      `).join('')}
    </div>
    <div style="display:flex;gap:8px;align-items:center">
      <div class="campo-busca" style="position:relative">
        <input type="text" class="campo-texto" placeholder="Buscar placa, cliente ou modelo..." data-act="busca-placa-patio" value="${esc(S.ui.buscaPlaca || '')}" style="width:230px;padding-left:30px;height:34px;font-size:13px;border-radius:20px;background:var(--branco);border:1px solid var(--aco-150)">
        <span style="position:absolute;left:10px;top:8px;color:var(--aco-400);pointer-events:none">${ico('busca', 14)}</span>
      </div>
      <button class="btn btn-primario" data-act="nova-os" style="height:34px;font-size:13px;padding:0 14px;border-radius:20px">
        ${ico('mais', 14)} Nova OS
      </button>
    </div>
  </div>

  <div class="patio">
    ${cardsHtml || '<div class="card card-p vazia" style="grid-column:1/-1;text-align:center;padding:40px"><b>Nenhum veículo encontrado</b>Nenhuma Ordem de Serviço com os critérios selecionados.</div>'}
  </div>`;
}

function cardOS(o, b) {
  const v = V(o.vei), c = C(o.cli);
  const total = totOS(o);
  const stInfo = ST[o.st] || ST.fila;
  const qtdItens = (o.servicos ? o.servicos.length : 0) + (o.pecas ? o.pecas.length : 0);

  return `
  <div class="box card" data-act="abrir-os" data-id="${o.id}" data-st="${o.st}">
    <div class="box-topo">
      <div class="tag-box">
        ${esc(b ? b.nome.split('—')[0].trim() : 'PÁTIO')}
        <small>${esc(b ? (b.tipo || 'Geral') : 'Livre')}</small>
      </div>
      <div style="min-width:0;flex:1">
        <div style="display:flex;align-items:center;gap:6px">
          <span class="placa">${esc(v.placa)}</span>
          <span class="selo" data-st="${o.st}">${stInfo.r}</span>
        </div>
        <div class="modelo">${esc(v.marca ? v.marca + ' ' : '')}${esc(v.modelo)}</div>
        <div class="cliente" title="${esc(c.nome)}">${esc(c.fantasia || c.nome)}</div>
      </div>
    </div>

    ${o.queixa ? `<div class="mini" style="margin-top:10px;color:var(--aco-600);line-height:1.3;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden"><b>Queixa:</b> ${esc(o.queixa)}</div>` : ''}

    <div class="box-rodape">
      <span class="mini" style="display:flex;align-items:center;gap:4px">
        ${ico('relogio', 12)} OS ${o.num} · ${qtdItens} itens
      </span>
      <div class="val">${brl(total)}</div>
    </div>
  </div>`;
}

function cardLivre(b) {
  return `
  <div class="box card" data-st="livre" style="border:2px dashed var(--aco-200);background:rgba(255,255,255,0.6)">
    <div class="box-topo">
      <div class="tag-box" style="background:var(--aco-400)">
        ${esc(b.nome.split('—')[0].trim())}
        <small>${esc(b.tipo || 'Geral')}</small>
      </div>
      <div style="min-width:0;flex:1">
        <div style="font-weight:600;color:var(--aco-500);font-size:14px;margin-top:2px">Box Disponível</div>
        <div class="mini" style="color:var(--aco-400)">Pronto para receber caminhão</div>
      </div>
    </div>
    <div style="margin-top:16px;text-align:right">
      <button class="btn btn-secundario" data-act="nova-os" data-box="${b.id}" style="font-size:12px;padding:6px 12px;border-radius:14px">
        ${ico('mais', 12)} Ocupar Box
      </button>
    </div>
  </div>`;
}

/* =====================================================================
   MODAL / FOLHA DE ORDEM DE SERVIÇO DETALHADA
   OSatual() já está definida em state.js
===================================================================== */

function folhaOS() {
  const o = OSatual();
  if (!o) return '<div class="card card-p">Ordem de Serviço não encontrada.</div>';

  const v = V(o.vei), c = C(o.cli), b = B(o.box);
  const total = totOS(o);
  const totServ = soma(o.servicos, i => (i.qtd || 1) * (i.valor || 0));
  const totPec = soma(o.pecas, i => (i.qtd || 1) * (i.valor || 0));
  const aba = S.ui.abaOS || 'servicos';

  const cabecalho = `
  <div class="entre" style="border-bottom:1px solid var(--aco-150);padding-bottom:12px;margin-bottom:14px">
    <div>
      <div style="display:flex;align-items:center;gap:8px">
        <h2 style="font-size:18px;font-weight:700">OS ${o.num} — <span class="placa">${esc(v.placa)}</span></h2>
        <span class="selo" data-st="${o.st}">${ST[o.st].r}</span>
      </div>
      <div class="mini" style="margin-top:4px">
        ${esc(v.marca ? v.marca + ' ' : '')}${esc(v.modelo)} · Cliente: <b>${esc(c.nome)}</b> · ${esc(b.nome)}
      </div>
    </div>
    <div style="display:flex;gap:6px">
      <button class="btn btn-secundario" data-act="imprimir-os" title="Imprimir Ordem de Serviço">${ico('imprimir', 14)} Imprimir</button>
      <button class="btn btn-secundario" data-act="copiar-orc" title="Copiar orçamento para WhatsApp">${ico('copiar', 14)} WhatsApp</button>
      <button class="btn btn-perigo" data-act="excluir-os" title="Excluir OS">${ico('lixo', 14)}</button>
      <button class="btn-fechar" data-act="fechar">${ico('x', 18)}</button>
    </div>
  </div>`;

  const tabs = [
    ['servicos', 'Serviços & Mão de Obra (' + (o.servicos ? o.servicos.length : 0) + ')'],
    ['pecas', 'Peças Aplicadas (' + (o.pecas ? o.pecas.length : 0) + ')'],
    ['ficha', 'Ficha & Diagnóstico'],
    ['historico', 'Histórico do Veículo']
  ];

  const abasHtml = `
  <div class="abas" style="margin-bottom:14px">
    ${tabs.map(([k, label]) => `
      <button data-act="aba-os" data-k="${k}" aria-selected="${aba === k}">${label}</button>
    `).join('')}
  </div>`;

  let conteudoAba = '';
  if (aba === 'servicos') conteudoAba = abaItens(o, 'servicos');
  else if (aba === 'pecas') conteudoAba = abaItens(o, 'pecas');
  else if (aba === 'ficha') conteudoAba = abaFicha(o, v, c, b);
  else conteudoAba = abaHistoricoVeiculo(v);

  // Barra Inferior de Ações e Totais
  const rodapeHtml = `
  <div class="os-rodape-fixo" style="margin-top:18px;padding-top:14px;border-top:1px solid var(--aco-150);background:var(--branco);display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px">
    <div style="display:flex;gap:12px;align-items:center">
      <div>
        <div class="mini">Mão de Obra: <b>${brl(totServ)}</b> · Peças: <b>${brl(totPec)}</b></div>
        <div style="font-size:18px;font-weight:700;color:var(--aco-900)">Total: ${brl(total)}</div>
      </div>
      <div style="display:flex;align-items:center;gap:6px">
        <label class="mini" style="font-weight:600">Desconto (R$):</label>
        <input type="number" class="campo-texto" style="width:90px;height:30px;font-size:13px" value="${o.desc || 0}" data-act="campo-os" data-c="desc" min="0" step="10">
      </div>
    </div>

    <div style="display:flex;gap:8px;align-items:center">
      <select class="campo-select" data-act="mudar-status-os" style="height:34px;font-size:13px;border-radius:8px;font-weight:600">
        <option value="fila" ${o.st === 'fila' ? 'selected' : ''}>Na Fila</option>
        <option value="executando" ${o.st === 'executando' ? 'selected' : ''}>Em Execução</option>
        <option value="peca" ${o.st === 'peca' ? 'selected' : ''}>Parado p/ Peça</option>
        <option value="aprovacao" ${o.st === 'aprovacao' ? 'selected' : ''}>Aguardando Aprovação</option>
        <option value="finalizada" ${o.st === 'finalizada' ? 'selected' : ''}>Finalizada</option>
      </select>

      ${o.st !== 'finalizada' ? `
        <button class="btn btn-sucesso" data-act="faturar-os-modal" style="height:34px;padding:0 16px;font-weight:600">
          ${ico('check', 14)} Faturar & Entregar
        </button>
      ` : `
        <span class="selo selo-finalizada" style="font-size:13px;padding:6px 12px">OS Faturada / Finalizada</span>
      `}
    </div>
  </div>`;

  return `<div class="folha-os-container">${cabecalho}${abasHtml}${conteudoAba}${rodapeHtml}</div>`;
}

function abaItens(o, tipo) {
  const itens = o[tipo] || [];
  const isPeca = tipo === 'pecas';

  return `
  <div style="margin-bottom:12px;display:flex;justify-content:space-between;align-items:center">
    <div style="font-size:13px;font-weight:600;color:var(--aco-600)">
      ${isPeca ? 'Peças e Insumos Utilizados' : 'Serviços e Mão de Obra Lançada'}
    </div>
    <button class="btn btn-secundario" data-act="picker" data-p="${tipo}" style="font-size:12.5px;padding:5px 12px">
      ${ico('mais', 13)} Adicionar ${isPeca ? 'Peça do Almoxarifado' : 'Serviço da Tabela'}
    </button>
  </div>

  ${S.ui.picker === tipo ? painelPicker(o, tipo) : ''}

  <div class="tabela-responsiva">
    <table class="tabela">
      <thead>
        <tr>
          <th>Descrição</th>
          <th style="width:90px;text-align:center">Qtd</th>
          <th style="width:120px;text-align:right">Valor Unit.</th>
          <th style="width:120px;text-align:right">Subtotal</th>
          <th style="width:50px"></th>
        </tr>
      </thead>
      <tbody>
        ${itens.length ? itens.map(item => `
          <tr>
            <td>
              <div style="font-weight:600;color:var(--aco-900)">${esc(item.nome)}</div>
              ${item.cod ? `<div class="mini">Cód: ${esc(item.cod)}</div>` : ''}
            </td>
            <td style="text-align:center">
              <div style="display:inline-flex;align-items:center;gap:4px">
                <button class="btn-micro" data-act="qtd" data-t="${tipo}" data-i="${item.id}" data-d="-1">−</button>
                <span class="num" style="min-width:24px;display:inline-block">${item.qtd}</span>
                <button class="btn-micro" data-act="qtd" data-t="${tipo}" data-i="${item.id}" data-d="1">+</button>
              </div>
            </td>
            <td style="text-align:right">
              <input type="number" class="campo-texto" style="width:95px;text-align:right;height:28px;font-size:13px" value="${item.valor}" data-act="val-item" data-t="${tipo}" data-i="${item.id}" step="0.50">
            </td>
            <td style="text-align:right;font-weight:600" class="num">
              ${brl(item.qtd * item.valor)}
            </td>
            <td style="text-align:center">
              <button class="btn-icone-perigo" data-act="rm-item" data-t="${tipo}" data-i="${item.id}" title="Remover item">${ico('lixo', 14)}</button>
            </td>
          </tr>
        `).join('') : `
          <tr>
            <td colspan="5" style="text-align:center;color:var(--aco-400);padding:24px">
              Nenhum ${isPeca ? 'peça lançada' : 'serviço lançado'} nesta OS.
            </td>
          </tr>
        `}
      </tbody>
    </table>
  </div>`;
}

function painelPicker(o, tipo) {
  const isPeca = tipo === 'pecas';
  const catalogo = isPeca ? S.pecas : S.servicos;
  const busca = (S.ui.busca || '').toLowerCase().trim();

  const filtrados = catalogo.filter(item => {
    return (item.nome || '').toLowerCase().includes(busca) ||
           (item.cod && item.cod.toLowerCase().includes(busca)) ||
           (item.forn && item.forn.toLowerCase().includes(busca));
  });

  return `
  <div class="card card-p" style="margin-bottom:14px;background:var(--aco-100);border:1px solid var(--aco-200)">
    <div class="entre" style="margin-bottom:10px">
      <div style="font-weight:600;font-size:13px">${isPeca ? 'Selecionar Peça do Almoxarifado' : 'Selecionar Serviço'}</div>
      <button class="btn-fechar" data-act="fechar-picker">${ico('x', 14)}</button>
    </div>
    <div style="margin-bottom:10px">
      <input type="text" class="campo-texto" placeholder="Digitar para buscar..." data-act="busca-picker" value="${esc(S.ui.busca || '')}" autofocus style="height:32px;font-size:13px;width:100%">
    </div>
    <div style="max-height:180px;overflow-y:auto;display:flex;flex-direction:column;gap:4px">
      ${filtrados.map(item => `
        <div class="entre item-picker" style="padding:6px 10px;background:var(--branco);border-radius:6px;font-size:13px">
          <div>
            <div style="font-weight:600">${esc(item.nome)}</div>
            <div class="mini">${isPeca ? `Cód: ${esc(item.cod)} · Estoque: <b>${item.qtd} ${item.un}</b> · ${esc(item.loc || '—')}` : `Tempo est.: ${item.horas}h`}</div>
          </div>
          <div style="display:flex;align-items:center;gap:8px">
            <span class="num" style="font-weight:600">${brl(isPeca ? item.venda : item.valor)}</span>
            <button class="btn btn-primario" data-act="add-item" data-t="${tipo}" data-r="${item.id}" style="padding:3px 10px;font-size:12px">
              ${ico('mais', 12)} Inserir
            </button>
          </div>
        </div>
      `).join('')}
    </div>
  </div>`;
}

function abaFicha(o, v, c, b) {
  return `
  <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:14px">
    <div class="card card-p">
      <div style="font-weight:600;font-size:13px;margin-bottom:10px;color:var(--aco-600)">Dados do Veículo & Cliente</div>
      <div style="display:flex;flex-direction:column;gap:8px;font-size:13px">
        <div><b>Placa:</b> <span class="placa">${esc(v.placa)}</span></div>
        <div><b>Modelo/Marca:</b> ${esc(v.marca ? v.marca + ' ' : '')}${esc(v.modelo)} (${esc(v.ano || '—')})</div>
        <div><b>Cliente:</b> ${esc(c.nome)}</div>
        <div><b>Telefone:</b> ${esc(c.fone || '—')}</div>
        <div><b>Mecânico Responsável:</b> ${esc(o.mec || 'Não atribuído')}</div>
        <div><b>Box Designado:</b> ${esc(b.nome)}</div>
      </div>
    </div>

    <div class="card card-p">
      <div style="font-weight:600;font-size:13px;margin-bottom:10px;color:var(--aco-600)">Prazos & Quilometragem</div>
      <div style="display:flex;flex-direction:column;gap:10px;font-size:13px">
        <div>
          <label class="mini" style="font-weight:600;display:block">KM Atual do Veículo:</label>
          <input type="number" class="campo-texto" value="${o.km || 0}" data-act="campo-os" data-c="km" style="width:100%;height:32px">
        </div>
        <div>
          <label class="mini" style="font-weight:600;display:block">Previsão de Conclusão / Entrega:</label>
          <input type="date" class="campo-texto" value="${o.prev || hoje()}" data-act="campo-os" data-c="prev" style="width:100%;height:32px">
        </div>
      </div>
    </div>
  </div>

  <div class="card card-p" style="margin-top:14px">
    <div style="font-weight:600;font-size:13px;margin-bottom:8px;color:var(--aco-600)">Queixa do Motorista / Diagnóstico de Entrada</div>
    <textarea class="campo-texto" data-act="campo-os" data-c="queixa" rows="2" style="width:100%;resize:vertical">${esc(o.queixa || '')}</textarea>

    <div style="font-weight:600;font-size:13px;margin-top:12px;margin-bottom:8px;color:var(--aco-600)">Observações Técnicas / Laudo</div>
    <textarea class="campo-texto" data-act="campo-os" data-c="obs" rows="2" style="width:100%;resize:vertical">${esc(o.obs || '')}</textarea>
  </div>`;
}

function abaHistoricoVeiculo(v) {
  const osPassadas = (S.os || []).filter(o => o.vei === v.id);

  return `
  <div class="card card-p">
    <div class="entre" style="margin-bottom:12px">
      <div>
        <div style="font-weight:700;font-size:15px">Histórico de Manutenções — Placa ${esc(v.placa)}</div>
        <div class="mini">Total de ${osPassadas.length} passagens registradas na oficina</div>
      </div>
    </div>

    <div class="timeline" style="display:flex;flex-direction:column;gap:12px">
      ${osPassadas.map(pass => `
        <div class="item-timeline" style="border-left:3px solid var(--petroleo);padding-left:12px;position:relative">
          <div class="entre">
            <span style="font-weight:600;font-size:13.5px">OS ${pass.num} · ${dataBRfull(pass.abertura)}</span>
            <span class="selo" data-st="${pass.st}">${ST[pass.st].r}</span>
          </div>
          <div class="mini" style="margin-top:2px">KM: <b>${(pass.km || 0).toLocaleString('pt-BR')} km</b> · Mecânico: ${esc(pass.mec || '—')}</div>
          ${pass.queixa ? `<div style="font-size:12.5px;color:var(--aco-700);margin-top:4px"><b>Queixa:</b> ${esc(pass.queixa)}</div>` : ''}
          <div class="mini" style="margin-top:4px;color:var(--aco-500)">
            Serviços: ${(pass.servicos || []).map(s => s.nome).join(', ') || 'Nenhum'} | 
            Peças: ${(pass.pecas || []).map(p => p.nome).join(', ') || 'Nenhuma'}
          </div>
          <div class="num" style="font-weight:700;font-size:13px;margin-top:4px;color:var(--aco-900)">
            Valor Total: ${brl(totOS(pass))}
          </div>
        </div>
      `).join('')}
    </div>
  </div>`;
}

/* =====================================================================
   MODAL DE FATURAMENTO / CHECKOUT DA OS COM BAIXA DE ESTOQUE
===================================================================== */
function folhaFaturarOS() {
  const o = OSatual();
  if (!o) return '<div class="card card-p">Nenhuma OS selecionada.</div>';

  const v = V(o.vei), c = C(o.cli);
  const total = totOS(o);
  const rasc = S.ui.rascFaturar = S.ui.rascFaturar || {
    forma: 'pix',
    parcelas: 1,
    vencimento: hoje(),
    baixarEstoque: true,
    emitirRecibo: true
  };

  return `
  <div class="card card-p" style="max-width:550px;margin:0 auto">
    <div class="entre" style="border-bottom:1px solid var(--aco-150);padding-bottom:10px;margin-bottom:14px">
      <div>
        <h3 style="font-size:17px;font-weight:700">Faturar e Entregar OS ${o.num}</h3>
        <div class="mini">Veículo: <span class="placa">${esc(v.placa)}</span> · Cliente: ${esc(c.nome)}</div>
      </div>
      <button class="btn-fechar" data-act="fechar">${ico('x', 18)}</button>
    </div>

    <div class="kpi bom" style="text-align:center;padding:14px;margin-bottom:14px">
      <div class="r" style="justify-content:center">Valor a Faturar</div>
      <div class="v" style="font-size:30px">${brl(total)}</div>
      <div class="d">${o.servicos.length} serviços · ${o.pecas.length} peças aplicadas</div>
    </div>

    <div style="display:flex;flex-direction:column;gap:12px;font-size:13px">
      <div>
        <label style="font-weight:600;display:block;margin-bottom:4px">Condição de Pagamento:</label>
        <select class="campo-select" data-act="rasc-fat" data-c="forma" style="width:100%;height:36px;font-weight:600">
          <option value="pix" ${rasc.forma === 'pix' ? 'selected' : ''}>À Vista — PIX Instantâneo</option>
          <option value="dinheiro" ${rasc.forma === 'dinheiro' ? 'selected' : ''}>À Vista — Dinheiro em Espécie</option>
          <option value="cartao_debito" ${rasc.forma === 'cartao_debito' ? 'selected' : ''}>Cartão de Débito</option>
          <option value="cartao_credito" ${rasc.forma === 'cartao_credito' ? 'selected' : ''}>Cartão de Crédito</option>
          <option value="boleto_28d" ${rasc.forma === 'boleto_28d' ? 'selected' : ''}>Faturado — Boleto 28 Dias</option>
          <option value="boleto_15_30_45" ${rasc.forma === 'boleto_15_30_45' ? 'selected' : ''}>Faturado — 3 Parcelas (15/30/45 dias)</option>
        </select>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div>
          <label style="font-weight:600;display:block;margin-bottom:4px">1º Vencimento:</label>
          <input type="date" class="campo-texto" value="${rasc.vencimento || hoje()}" data-act="rasc-fat" data-c="vencimento" style="width:100%;height:34px">
        </div>
        <div>
          <label style="font-weight:600;display:block;margin-bottom:4px">Nº de Parcelas:</label>
          <input type="number" class="campo-texto" value="${rasc.parcelas || 1}" data-act="rasc-fat" data-c="parcelas" min="1" max="12" style="width:100%;height:34px">
        </div>
      </div>

      <div style="background:var(--aco-050);border:1px solid var(--aco-150);border-radius:8px;padding:10px">
        <label style="display:flex;align-items:center;gap:8px;font-weight:600;cursor:pointer">
          <input type="checkbox" checked disabled>
          Baixar automaticamente as peças utilizadas do almoxarifado
        </label>
        <div class="mini" style="margin-left:24px;margin-top:2px">Atualiza o saldo físico no módulo de estoque.</div>
      </div>
    </div>

    <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:18px;border-top:1px solid var(--aco-150);padding-top:12px">
      <button class="btn btn-secundario" data-act="fechar">Cancelar</button>
      <button class="btn btn-sucesso" data-act="confirmar-faturamento" style="font-weight:600;padding:0 18px">
        ${ico('check', 14)} Concluir Faturamento
      </button>
    </div>
  </div>`;
}

function processarFaturamentoOS(o) {
  const rasc = S.ui.rascFaturar || {};
  const v = V(o.vei), c = C(o.cli);
  const total = totOS(o);
  const forma = rasc.forma || 'pix';
  const parcelas = Number(rasc.parcelas) || 1;
  const valorParc = total / parcelas;

  // 1. Baixar peças do estoque
  if (o.pecas && o.pecas.length) {
    o.pecas.forEach(item => {
      const pecaEstoque = S.pecas.find(p => p.id === item.id || p.nome === item.nome);
      if (pecaEstoque) {
        pecaEstoque.qtd = Math.max(0, (pecaEstoque.qtd || 0) - (Number(item.qtd) || 1));
      }
    });
  }

  // 2. Gerar Lançamento Financeiro (Recebimento Imediato ou Contas a Receber)
  const isImediato = ['pix', 'dinheiro', 'cartao_debito'].includes(forma);

  if (isImediato) {
    // Entrada direta no caixa
    S.movimentos.push({
      id: uid('mv'),
      data: hoje(),
      tipo: 'entrada',
      desc: `Recebimento OS ${o.num} (${esc(v.placa)}) — ${esc(c.nome)}`,
      valor: total,
      cat: 'Serviços & Peças',
      conc: true,
      forma: forma.toUpperCase()
    });
    o.pago = true;
  } else {
    // Títulos a receber parcelados
    for (let p = 1; p <= parcelas; p++) {
      const diasVenc = forma === 'boleto_15_30_45' ? p * 15 : (forma === 'boleto_28d' ? 28 : (p - 1) * 30);
      const dataVenc = addDias(rasc.vencimento || hoje(), diasVenc);
      S.contas.push({
        id: uid('ct'),
        tipo: 'receber',
        desc: `OS ${o.num} (Parc. ${p}/${parcelas}) — ${esc(v.placa)}`,
        parte: c.nome,
        valor: valorParc,
        venc: dataVenc,
        pago: false,
        cat: 'Serviços & Peças',
        doc: `NF-${o.num}/${p}`,
        osId: o.id
      });
    }
  }

  // 3. Atualizar status da OS
  o.st = 'finalizada';
  o.formaPgto = forma;
  salvar();
}

/* =====================================================================
   IMPRESSÃO PROFISSIONAL DE OS / ORÇAMENTO
===================================================================== */
function imprimirOS(o) {
  if (!o) o = OSatual();
  if (!o) return;

  const v = V(o.vei), c = C(o.cli);
  const cfg = S.cfg;
  const total = totOS(o);
  const totServ = soma(o.servicos, i => (i.qtd || 1) * (i.valor || 0));
  const totPec = soma(o.pecas, i => (i.qtd || 1) * (i.valor || 0));

  const janela = window.open('', '_blank');
  if (!janela) {
    torrar('Por favor, permita popups para imprimir o comprovante.');
    return;
  }

  janela.document.write(`
  <!DOCTYPE html>
  <html lang="pt-BR">
  <head>
    <meta charset="utf-8">
    <title>OS ${o.num} — ${cfg.empresa}</title>
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; font-size: 13px; color: #1e293b; padding: 20px; max-width: 800px; margin: 0 auto; line-height: 1.4; }
      .topo { display: flex; justify-content: space-between; border-bottom: 2px solid #0f172a; padding-bottom: 12px; margin-bottom: 16px; }
      .empresa { font-size: 20px; font-weight: bold; color: #0f172a; }
      .num-os { font-size: 22px; font-weight: bold; color: #2563eb; text-align: right; }
      .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px; background: #f8fafc; padding: 12px; border-radius: 6px; border: 1px solid #e2e8f0; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 14px; }
      th { background: #f1f5f9; text-align: left; padding: 8px; font-size: 12px; border-bottom: 1px solid #cbd5e1; }
      td { padding: 8px; border-bottom: 1px solid #e2e8f0; }
      .totais { margin-left: auto; width: 300px; border: 1px solid #cbd5e1; padding: 10px; border-radius: 6px; margin-bottom: 20px; }
      .tot-linha { display: flex; justify-content: space-between; margin-bottom: 4px; }
      .tot-final { font-size: 16px; font-weight: bold; border-top: 1px solid #94a3b8; padding-top: 6px; margin-top: 6px; }
      .assinaturas { display: flex; justify-content: space-between; margin-top: 40px; }
      .campo-ass { width: 45%; text-align: center; border-top: 1px solid #000; padding-top: 6px; font-size: 12px; }
      @media print { body { padding: 0; } }
    </style>
  </head>
  <body>
    <div class="topo">
      <div>
        <div class="empresa">${esc(cfg.empresa)}</div>
        <div>CNPJ: ${esc(cfg.cnpj)} · Tel: ${esc(cfg.fone)}</div>
        <div>${esc(cfg.endereco)}</div>
      </div>
      <div>
        <div class="num-os">ORDEM DE SERVIÇO Nº ${o.num}</div>
        <div>Emissão: ${dataBRfull(o.abertura)} ${horaBR()}</div>
        <div>Previsão: ${dataBRfull(o.prev)}</div>
      </div>
    </div>

    <div class="grid">
      <div>
        <div><b>CLIENTE:</b> ${esc(c.nome)}</div>
        <div><b>CNPJ/CPF:</b> ${esc(c.doc || '—')}</div>
        <div><b>CONTATO / FONE:</b> ${esc(c.contato || '—')} (${esc(c.fone || '—')})</div>
      </div>
      <div>
        <div><b>VEÍCULO:</b> ${esc(v.marca || '')} ${esc(v.modelo || '')}</div>
        <div><b>PLACA:</b> <span style="font-family:monospace;font-weight:bold;font-size:14px">${esc(v.placa)}</span></div>
        <div><b>KM REGISTRADO:</b> ${(o.km || 0).toLocaleString('pt-BR')} km</div>
      </div>
    </div>

    ${o.queixa ? `<div style="margin-bottom:14px;background:#fff;padding:8px;border-left:3px solid #f59e0b"><b>Diagnóstico / Queixa do Cliente:</b> ${esc(o.queixa)}</div>` : ''}

    <div style="font-weight:bold;margin-bottom:6px">1. SERVIÇOS EXECUTADOS / MÃO DE OBRA</div>
    <table>
      <thead>
        <tr><th>Descrição do Serviço</th><th style="width:60px;text-align:center">Qtd</th><th style="width:100px;text-align:right">Valor Unit.</th><th style="width:100px;text-align:right">Subtotal</th></tr>
      </thead>
      <tbody>
        ${(o.servicos || []).map(s => `<tr><td>${esc(s.nome)}</td><td style="text-align:center">${s.qtd}</td><td style="text-align:right">${brl(s.valor)}</td><td style="text-align:right">${brl(s.qtd * s.valor)}</td></tr>`).join('')}
      </tbody>
    </table>

    <div style="font-weight:bold;margin-bottom:6px">2. PEÇAS E MATERIAIS APLICADOS</div>
    <table>
      <thead>
        <tr><th>Descrição da Peça / Código</th><th style="width:60px;text-align:center">Qtd</th><th style="width:100px;text-align:right">Valor Unit.</th><th style="width:100px;text-align:right">Subtotal</th></tr>
      </thead>
      <tbody>
        ${(o.pecas || []).map(p => `<tr><td>${esc(p.nome)}</td><td style="text-align:center">${p.qtd}</td><td style="text-align:right">${brl(p.valor)}</td><td style="text-align:right">${brl(p.qtd * p.valor)}</td></tr>`).join('')}
      </tbody>
    </table>

    <div class="totais">
      <div class="tot-linha"><span>Total de Serviços:</span><span>${brl(totServ)}</span></div>
      <div class="tot-linha"><span>Total de Peças:</span><span>${brl(totPec)}</span></div>
      ${o.desc ? `<div class="tot-linha" style="color:#ef4444"><span>Desconto Concedido:</span><span>−${brl(o.desc)}</span></div>` : ''}
      <div class="tot-linha tot-final"><span>TOTAL GERAL:</span><span>${brl(total)}</span></div>
    </div>

    <div style="font-size:11px;color:#64748b;margin-bottom:30px">
      <b>Termo de Garantia:</b> ${esc(cfg.termoGarantia || 'Garantia legal de 90 dias conforme CDC.')}
    </div>

    <div class="assinaturas">
      <div class="campo-ass">${esc(cfg.empresa)}<br><small>Responsável Técnico</small></div>
      <div class="campo-ass">${esc(c.nome)}<br><small>Assinatura do Cliente / Motorista</small></div>
    </div>

    <script>window.onload = () => window.print();<\/script>
  </body>
  </html>`);
  janela.document.close();
}

function novaOSFolha(boxId) {
  const rasc = S.ui.rascunho = S.ui.rascunho || { box: boxId || (S.boxes[0] ? S.boxes[0].id : 'b1') };
  const veiculos = S.veiculos || [];
  const clientes = S.clientes || [];

  return `
  <div class="card card-p" style="max-width:550px;margin:0 auto">
    <div class="entre" style="border-bottom:1px solid var(--aco-150);padding-bottom:10px;margin-bottom:14px">
      <h3 style="font-size:17px;font-weight:700">Abertura de Ordem de Serviço</h3>
      <button class="btn-fechar" data-act="fechar">${ico('x', 18)}</button>
    </div>

    <div style="display:flex;flex-direction:column;gap:12px;font-size:13px">
      <div>
        <label style="font-weight:600;display:block;margin-bottom:4px">Selecione o Veículo / Placa:</label>
        <select class="campo-select" data-act="rasc" data-c="vei" style="width:100%;height:36px;font-weight:600">
          <option value="">-- Escolha pela placa --</option>
          ${veiculos.map(v => {
            const cl = C(v.cli);
            return `<option value="${v.id}" ${rasc.vei === v.id ? 'selected' : ''}>${esc(v.placa)} — ${esc(v.modelo)} (${esc(cl.nome)})</option>`;
          }).join('')}
          <option value="novo">+ Cadastrar Novo Caminhão / Placa...</option>
        </select>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div>
          <label style="font-weight:600;display:block;margin-bottom:4px">Box de Destino:</label>
          <select class="campo-select" data-act="rasc" data-c="box" style="width:100%;height:34px">
            ${S.boxes.map(b => `<option value="${b.id}" ${rasc.box === b.id ? 'selected' : ''}>${esc(b.nome)}</option>`).join('')}
          </select>
        </div>
        <div>
          <label style="font-weight:600;display:block;margin-bottom:4px">KM Atual do Painel:</label>
          <input type="number" class="campo-texto" placeholder="Ex: 350000" data-act="rasc" data-c="km" value="${rasc.km || ''}" style="width:100%;height:34px">
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div>
          <label style="font-weight:600;display:block;margin-bottom:4px">Mecânico Responsável:</label>
          <input type="text" class="campo-texto" placeholder="Nome do mecânico" data-act="rasc" data-c="mec" value="${esc(rasc.mec || '')}" style="width:100%;height:34px">
        </div>
        <div>
          <label style="font-weight:600;display:block;margin-bottom:4px">Previsão de Entrega:</label>
          <input type="date" class="campo-texto" data-act="rasc" data-c="prev" value="${rasc.prev || addDias(hoje(), 1)}" style="width:100%;height:34px">
        </div>
      </div>

      <div>
        <label style="font-weight:600;display:block;margin-bottom:4px">Queixa do Motorista / Problema Relatado:</label>
        <textarea class="campo-texto" placeholder="Ex: Falha na aceleração, vazamento de ar na cuíca traseira..." data-act="rasc" data-c="queixa" rows="3" style="width:100%">${esc(rasc.queixa || '')}</textarea>
      </div>
    </div>

    <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:18px;border-top:1px solid var(--aco-150);padding-top:12px">
      <button class="btn btn-secundario" data-act="fechar">Cancelar</button>
      <button class="btn btn-primario" data-act="criar-os" style="font-weight:600;padding:0 18px">
        ${ico('check', 14)} Abrir Ordem de Serviço
      </button>
    </div>
  </div>`;
}

function folhaNovoVeiculo(cliId) {
  const r = S.ui.rascVeiculo = S.ui.rascVeiculo || { cli: cliId || (S.clientes[0] ? S.clientes[0].id : '') };

  return `
  <div class="card card-p" style="max-width:500px;margin:0 auto">
    <div class="entre" style="border-bottom:1px solid var(--aco-150);padding-bottom:10px;margin-bottom:14px">
      <h3 style="font-size:16px;font-weight:700">Cadastrar Novo Veículo</h3>
      <button class="btn-fechar" data-act="voltar-os">${ico('voltar', 16)}</button>
    </div>

    <div style="display:flex;flex-direction:column;gap:12px;font-size:13px">
      <div>
        <label style="font-weight:600;display:block;margin-bottom:4px">Proprietário / Cliente:</label>
        <select class="campo-select" data-act="rasc-vei" data-c="cli" style="width:100%;height:34px">
          ${S.clientes.map(c => `<option value="${c.id}" ${r.cli === c.id ? 'selected' : ''}>${esc(c.nome)}</option>`).join('')}
        </select>
      </div>

      <div>
        <label style="font-weight:600;display:block;margin-bottom:4px">Placa do Veículo:</label>
        <div style="display:flex;gap:6px">
          <input type="text" class="campo-texto" placeholder="ABC1D23" data-act="rasc-vei" data-c="placa" value="${esc(r.placa || '')}" style="font-family:var(--mono);text-transform:uppercase;height:34px;flex:1">
          <button class="btn btn-secundario" data-act="buscar-placa-veiculo" title="Consultar dados via APIBrasil">${ico('busca', 14)} Consultar</button>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div>
          <label style="font-weight:600;display:block;margin-bottom:4px">Marca / Montadora:</label>
          <input type="text" class="campo-texto" placeholder="Ex: Scania" data-act="rasc-vei" data-c="marca" value="${esc(r.marca || '')}" style="height:34px;width:100%">
        </div>
        <div>
          <label style="font-weight:600;display:block;margin-bottom:4px">Modelo:</label>
          <input type="text" class="campo-texto" placeholder="Ex: R 450 6x2" data-act="rasc-vei" data-c="modelo" value="${esc(r.modelo || '')}" style="height:34px;width:100%">
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div>
          <label style="font-weight:600;display:block;margin-bottom:4px">Ano de Fabricação:</label>
          <input type="text" class="campo-texto" placeholder="2021" data-act="rasc-vei" data-c="ano" value="${esc(r.ano || '')}" style="height:34px;width:100%">
        </div>
        <div>
          <label style="font-weight:600;display:block;margin-bottom:4px">Cor Predominante:</label>
          <input type="text" class="campo-texto" placeholder="Branco" data-act="rasc-vei" data-c="cor" value="${esc(r.cor || '')}" style="height:34px;width:100%">
        </div>
      </div>
    </div>

    <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:18px;border-top:1px solid var(--aco-150);padding-top:12px">
      <button class="btn btn-secundario" data-act="voltar-os">Voltar</button>
      <button class="btn btn-primario" data-act="salvar-veiculo">Salvar e Prosseguir</button>
    </div>
  </div>`;
}

/* --- FILE: estoque.js --- */
/* =====================================================================
   PÁTIO CRM — MÓDULO DE ESTOQUE, ALMOXARIFADO & ENTRADA DE NOTAS
===================================================================== */

function viewEstoque() {
  const pecas = S.pecas || [];
  const filtro = S.ui.filtroEstoque || 'todos';
  const busca = (S.ui.buscaEstoque || '').toLowerCase().trim();

  // Cálculos de KPIs de Estoque
  const totalItensFisicos = soma(pecas, p => p.qtd);
  const valorTotalCusto = soma(pecas, p => (p.qtd || 0) * (p.custo || 0));
  const valorTotalVenda = soma(pecas, p => (p.qtd || 0) * (p.venda || 0));
  const pecasCriticas = pecas.filter(p => (p.qtd || 0) <= (p.min || 1));

  // Filtragem
  let filtradas = pecas;
  if (filtro === 'critico') {
    filtradas = pecasCriticas;
  }
  if (busca) {
    filtradas = filtradas.filter(p => {
      return (p.nome || '').toLowerCase().includes(busca) ||
             (p.cod || '').toLowerCase().includes(busca) ||
             (p.forn || '').toLowerCase().includes(busca) ||
             (p.loc || '').toLowerCase().includes(busca);
    });
  }

  return `
  <div class="kpis" style="margin-bottom:14px">
    <div class="kpi bom">
      <div class="r">${ico('pecas', 14)} Variedade de Peças</div>
      <div class="v">${pecas.length}</div>
      <div class="d">${totalItensFisicos} unidades em almoxarifado</div>
    </div>
    <div class="kpi neutro">
      <div class="r">${ico('caixa', 14)} Capital Imobilizado (Custo)</div>
      <div class="v">${brlCurto(valorTotalCusto)}</div>
      <div class="d">Projetado Venda: ${brlCurto(valorTotalVenda)}</div>
    </div>
    <div class="kpi ${pecasCriticas.length ? 'alerta' : 'bom'}">
      <div class="r">${ico('alerta', 14)} Estoque Crítico</div>
      <div class="v">${pecasCriticas.length}</div>
      <div class="d">Itens abaixo do estoque mínimo</div>
    </div>
    <div class="kpi bom">
      <div class="r">${ico('grana', 14)} Margem Média</div>
      <div class="v">${valorTotalCusto > 0 ? (((valorTotalVenda - valorTotalCusto) / valorTotalCusto) * 100).toFixed(0) + '%' : '—'}</div>
      <div class="d">Markup global praticado</div>
    </div>
  </div>

  <div class="entre" style="margin-bottom:12px;flex-wrap:wrap;gap:8px">
    <div style="display:flex;gap:8px;align-items:center">
      <button class="chip" data-act="filtro-estoque" data-f="todos" aria-pressed="${filtro === 'todos'}">
        Todas as Peças <span class="n">${pecas.length}</span>
      </button>
      <button class="chip" data-act="filtro-estoque" data-f="critico" aria-pressed="${filtro === 'critico'}" style="${pecasCriticas.length ? 'color:var(--tijolo)' : ''}">
        Estoque Crítico <span class="n">${pecasCriticas.length}</span>
      </button>
    </div>

    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
      <div class="campo-busca" style="position:relative">
        <input type="text" class="campo-texto" placeholder="Buscar código, peça ou local..." data-act="busca-estoque" value="${esc(S.ui.buscaEstoque || '')}" style="width:220px;padding-left:30px;height:34px;font-size:13px;border-radius:20px">
        <span style="position:absolute;left:10px;top:8px;color:var(--aco-400);pointer-events:none">${ico('busca', 14)}</span>
      </div>

      <button class="btn btn-secundario" data-act="importar-xml" style="height:34px;font-size:13px;border-radius:20px">
        ${ico('upload', 14)} Importar XML NF-e
      </button>
      <button class="btn btn-secundario" data-act="ocr-entrada" style="height:34px;font-size:13px;border-radius:20px">
        ${ico('doc', 14)} Leitura OCR / Danfe
      </button>
      <button class="btn btn-primario" data-act="nova-peca" style="height:34px;font-size:13px;border-radius:20px">
        ${ico('mais', 14)} Nova Peça
      </button>
    </div>
  </div>

  <div class="card">
    <div class="tabela-responsiva">
      <table class="tabela">
        <thead>
          <tr>
            <th>Código / Peça</th>
            <th>Localização</th>
            <th>Fornecedor</th>
            <th style="width:110px;text-align:center">Estoque / Mín.</th>
            <th style="width:110px;text-align:right">Custo</th>
            <th style="width:110px;text-align:right">Venda</th>
            <th style="width:80px;text-align:center">Margem</th>
            <th style="width:100px;text-align:center">Ações</th>
          </tr>
        </thead>
        <tbody>
          ${filtradas.length ? filtradas.map(p => {
            const isCritico = (p.qtd || 0) <= (p.min || 1);
            const margem = p.custo > 0 ? (((p.venda - p.custo) / p.custo) * 100).toFixed(0) : 0;

            return `
            <tr style="${isCritico ? 'background:rgba(239, 68, 68, 0.04)' : ''}">
              <td>
                <div style="font-weight:600;color:var(--aco-900)">${esc(p.nome)}</div>
                <div class="mini"><span class="mono">${esc(p.cod || 'S/CÓD')}</span> · Unidade: ${esc(p.un || 'un')}</div>
              </td>
              <td><span class="selo" style="background:var(--aco-100)">${esc(p.loc || '—')}</span></td>
              <td style="font-size:13px;color:var(--aco-600)">${esc(p.forn || '—')}</td>
              <td style="text-align:center">
                <div style="display:inline-flex;align-items:center;gap:4px">
                  <button class="btn-micro" data-act="mov-peca-grid" data-id="${p.id}" data-d="-1">−</button>
                  <span class="num ${isCritico ? 'texto-alerta' : ''}" style="font-weight:700;min-width:26px">
                    ${p.qtd}
                  </span>
                  <button class="btn-micro" data-act="mov-peca-grid" data-id="${p.id}" data-d="1">+</button>
                </div>
                <div class="mini">mín: ${p.min || 1}</div>
              </td>
              <td style="text-align:right" class="num">${brl(p.custo)}</td>
              <td style="text-align:right;font-weight:600" class="num">${brl(p.venda)}</td>
              <td style="text-align:center">
                <span class="selo ${margem >= 50 ? 'selo-finalizada' : 'selo-aprovacao'}" style="font-size:11px">
                  +${margem}%
                </span>
              </td>
              <td style="text-align:center">
                <div style="display:inline-flex;gap:4px">
                  <button class="btn-icone" data-act="ver-peca" data-id="${p.id}" title="Editar Peça">${ico('edit', 14)}</button>
                  <button class="btn-icone-perigo" data-act="excluir-peca-id" data-id="${p.id}" title="Excluir Peça">${ico('lixo', 14)}</button>
                </div>
              </td>
            </tr>`;
          }).join('') : `
            <tr>
              <td colspan="8" style="text-align:center;padding:36px;color:var(--aco-400)">
                Nenhuma peça cadastrada ou encontrada com esses filtros.
              </td>
            </tr>
          `}
        </tbody>
      </table>
    </div>
  </div>`;
}

function folhaPeca() {
  const p = P(S.ui.pecaAberta);
  if (!p) return '<div class="card card-p">Peça não encontrada.</div>';

  const margem = p.custo > 0 ? (((p.venda - p.custo) / p.custo) * 100).toFixed(1) : 0;

  return `
  <div class="card card-p" style="max-width:550px;margin:0 auto">
    <div class="entre" style="border-bottom:1px solid var(--aco-150);padding-bottom:10px;margin-bottom:14px">
      <div>
        <h3 style="font-size:17px;font-weight:700">${esc(p.nome)}</h3>
        <div class="mini">Código Fabricante: <span class="mono">${esc(p.cod)}</span></div>
      </div>
      <div style="display:flex;gap:6px">
        <button class="btn btn-perigo" data-act="excluir-peca">${ico('lixo', 14)} Excluir</button>
        <button class="btn-fechar" data-act="fechar">${ico('x', 18)}</button>
      </div>
    </div>

    <div style="display:flex;flex-direction:column;gap:12px;font-size:13px">
      <div>
        <label style="font-weight:600;display:block;margin-bottom:4px">Descrição Completa da Peça:</label>
        <input type="text" class="campo-texto" value="${esc(p.nome)}" data-act="campo-peca" data-c="nome" style="width:100%;height:34px">
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px">
        <div>
          <label style="font-weight:600;display:block;margin-bottom:4px">Código / Ref:</label>
          <input type="text" class="campo-texto" value="${esc(p.cod)}" data-act="campo-peca" data-c="cod" style="width:100%;height:34px">
        </div>
        <div>
          <label style="font-weight:600;display:block;margin-bottom:4px">Unidade:</label>
          <input type="text" class="campo-texto" value="${esc(p.un || 'un')}" data-act="campo-peca" data-c="un" style="width:100%;height:34px">
        </div>
        <div>
          <label style="font-weight:600;display:block;margin-bottom:4px">Localização:</label>
          <input type="text" class="campo-texto" placeholder="Ex: Prat. A-01" value="${esc(p.loc || '')}" data-act="campo-peca" data-c="loc" style="width:100%;height:34px">
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div>
          <label style="font-weight:600;display:block;margin-bottom:4px">Saldo Atual em Estoque:</label>
          <div style="display:flex;gap:4px">
            <button class="btn btn-secundario" data-act="mov-peca" data-d="-1" style="height:34px;padding:0 12px">−</button>
            <input type="number" class="campo-texto" value="${p.qtd}" data-act="campo-peca" data-c="qtd" style="width:100%;height:34px;text-align:center;font-weight:700">
            <button class="btn btn-secundario" data-act="mov-peca" data-d="1" style="height:34px;padding:0 12px">+</button>
          </div>
        </div>
        <div>
          <label style="font-weight:600;display:block;margin-bottom:4px">Estoque Mínimo de Alerta:</label>
          <input type="number" class="campo-texto" value="${p.min || 1}" data-act="campo-peca" data-c="min" style="width:100%;height:34px">
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div>
          <label style="font-weight:600;display:block;margin-bottom:4px">Preço de Custo (R$):</label>
          <input type="number" class="campo-texto" value="${p.custo}" data-act="campo-peca" data-c="custo" step="0.50" style="width:100%;height:34px">
        </div>
        <div>
          <label style="font-weight:600;display:block;margin-bottom:4px">Preço de Venda (R$):</label>
          <input type="number" class="campo-texto" value="${p.venda}" data-act="campo-peca" data-c="venda" step="0.50" style="width:100%;height:34px;font-weight:700">
        </div>
      </div>

      <div class="kpi bom" style="padding:10px;display:flex;justify-content:space-between;align-items:center">
        <span class="mini">Margem de Lucro Bruta (Markup):</span>
        <span class="num" style="font-size:16px;font-weight:700;color:var(--verde)">+${margem}%</span>
      </div>

      <div>
        <label style="font-weight:600;display:block;margin-bottom:4px">Fornecedor Principal:</label>
        <input type="text" class="campo-texto" value="${esc(p.forn || '')}" data-act="campo-peca" data-c="forn" style="width:100%;height:34px">
      </div>
    </div>

    <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:18px;border-top:1px solid var(--aco-150);padding-top:12px">
      <button class="btn btn-primario" data-act="fechar">Salvar e Fechar</button>
    </div>
  </div>`;
}

function folhaNovaPeca() {
  const r = S.ui.rascPeca = S.ui.rascPeca || { un: 'un', qtd: 0, min: 1, custo: 0, venda: 0 };

  return `
  <div class="card card-p" style="max-width:550px;margin:0 auto">
    <div class="entre" style="border-bottom:1px solid var(--aco-150);padding-bottom:10px;margin-bottom:14px">
      <h3 style="font-size:17px;font-weight:700">Cadastrar Nova Peça no Almoxarifado</h3>
      <button class="btn-fechar" data-act="fechar">${ico('x', 18)}</button>
    </div>

    <div style="display:flex;flex-direction:column;gap:12px;font-size:13px">
      <div>
        <label style="font-weight:600;display:block;margin-bottom:4px">Descrição da Peça / Insumo:</label>
        <input type="text" class="campo-texto" placeholder="Ex: Filtro de Combustível Scania DC13" data-act="rp" data-c="nome" value="${esc(r.nome || '')}" style="width:100%;height:34px">
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px">
        <div>
          <label style="font-weight:600;display:block;margin-bottom:4px">Código Original / Ref:</label>
          <input type="text" class="campo-texto" placeholder="Ex: SCN-20412" data-act="rp" data-c="cod" value="${esc(r.cod || '')}" style="width:100%;height:34px">
        </div>
        <div>
          <label style="font-weight:600;display:block;margin-bottom:4px">Unidade:</label>
          <input type="text" class="campo-texto" placeholder="un, jg, lt, pc" data-act="rp" data-c="un" value="${esc(r.un || 'un')}" style="width:100%;height:34px">
        </div>
        <div>
          <label style="font-weight:600;display:block;margin-bottom:4px">Localização Física:</label>
          <input type="text" class="campo-texto" placeholder="Prat. B-02" data-act="rp" data-c="loc" value="${esc(r.loc || '')}" style="width:100%;height:34px">
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div>
          <label style="font-weight:600;display:block;margin-bottom:4px">Quantidade Inicial:</label>
          <input type="number" class="campo-texto" placeholder="0" data-act="rp" data-c="qtd" value="${r.qtd || ''}" style="width:100%;height:34px">
        </div>
        <div>
          <label style="font-weight:600;display:block;margin-bottom:4px">Estoque Mínimo:</label>
          <input type="number" class="campo-texto" placeholder="2" data-act="rp" data-c="min" value="${r.min || 1}" style="width:100%;height:34px">
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div>
          <label style="font-weight:600;display:block;margin-bottom:4px">Preço de Custo (R$):</label>
          <input type="number" class="campo-texto" placeholder="0.00" data-act="rp" data-c="custo" value="${r.custo || ''}" step="0.50" style="width:100%;height:34px">
        </div>
        <div>
          <label style="font-weight:600;display:block;margin-bottom:4px">Preço de Venda (R$):</label>
          <input type="number" class="campo-texto" placeholder="0.00" data-act="rp" data-c="venda" value="${r.venda || ''}" step="0.50" style="width:100%;height:34px">
        </div>
      </div>

      <div>
        <label style="font-weight:600;display:block;margin-bottom:4px">Fornecedor Principal:</label>
        <input type="text" class="campo-texto" placeholder="Ex: Fras-le / ZF do Brasil" data-act="rp" data-c="forn" value="${esc(r.forn || '')}" style="width:100%;height:34px">
      </div>
    </div>

    <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:18px;border-top:1px solid var(--aco-150);padding-top:12px">
      <button class="btn btn-secundario" data-act="fechar">Cancelar</button>
      <button class="btn btn-primario" data-act="salvar-peca" style="font-weight:600;padding:0 18px">
        ${ico('check', 14)} Salvar Peça
      </button>
    </div>
  </div>`;
}

/* =====================================================================
   IMPORTAÇÃO DE NOTA FISCAL ELETRÔNICA (XML)
===================================================================== */
function folhaXML() {
  const nota = S.ui.nota;

  return `
  <div class="card card-p" style="max-width:650px;margin:0 auto">
    <div class="entre" style="border-bottom:1px solid var(--aco-150);padding-bottom:10px;margin-bottom:14px">
      <div>
        <h3 style="font-size:17px;font-weight:700">Importação de NF-e via XML</h3>
        <div class="mini">Entrada automática de peças e geração de Contas a Pagar</div>
      </div>
      <button class="btn-fechar" data-act="fechar">${ico('x', 18)}</button>
    </div>

    ${!nota ? `
      <div style="border:2px dashed var(--aco-300);padding:30px 20px;border-radius:10px;text-align:center;background:var(--aco-050)">
        <div style="margin-bottom:10px;color:var(--petroleo)">${ico('upload', 36)}</div>
        <div style="font-weight:600;font-size:14px;margin-bottom:4px">Selecione o arquivo .XML da Nota Fiscal</div>
        <div class="mini" style="margin-bottom:16px">Você pode selecionar um ou vários arquivos de fornecedores de autopeças.</div>
        <label class="btn btn-primario" style="cursor:pointer;display:inline-flex;align-items:center;gap:6px">
          ${ico('doc', 14)} Escolher Arquivo XML
          <input type="file" accept=".xml" data-act="arquivo-xml" multiple style="display:none">
        </label>
      </div>
    ` : `
      <div style="background:var(--aco-050);padding:12px;border-radius:8px;margin-bottom:14px;border:1px solid var(--aco-150)">
        <div class="entre">
          <div><b>NF-e Nº:</b> ${esc(nota.num)} · <b>Série:</b> ${esc(nota.serie || '1')}</div>
          <div class="num" style="font-weight:700;font-size:15px;color:var(--verde)">${brl(nota.total)}</div>
        </div>
        <div class="mini" style="margin-top:4px">
          <b>Fornecedor:</b> ${esc(nota.forn)} · CNPJ: ${esc(nota.cnpj || '—')} · Emissão: ${dataBRfull(nota.data)}
        </div>
      </div>

      <div style="font-weight:600;font-size:13px;margin-bottom:8px">Itens Identificados na Nota Fiscal (${nota.itens.length}):</div>
      <div style="max-height:220px;overflow-y:auto;border:1px solid var(--aco-150);border-radius:6px;margin-bottom:14px">
        <table class="tabela" style="font-size:12.5px">
          <thead>
            <tr>
              <th>Cód. / Descrição</th>
              <th style="width:60px;text-align:center">Qtd</th>
              <th style="width:90px;text-align:right">Custo Unit.</th>
              <th style="width:90px;text-align:right">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            ${nota.itens.map(it => `
              <tr>
                <td><b>${esc(it.nome)}</b><div class="mini mono">${esc(it.cod)}</div></td>
                <td style="text-align:center">${it.qtd} ${esc(it.un)}</td>
                <td style="text-align:right">${brl(it.custo)}</td>
                <td style="text-align:right;font-weight:600">${brl(it.qtd * it.custo)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>

      <div style="display:flex;justify-content:flex-end;gap:8px">
        <button class="btn btn-secundario" data-act="fechar">Cancelar</button>
        <button class="btn btn-sucesso" data-act="confirmar-xml" style="font-weight:600;padding:0 18px">
          ${ico('check', 14)} Confirmar Entrada no Estoque & Contas a Pagar
        </button>
      </div>
    `}
  </div>`;
}

function lerXML(texto) {
  const parser = new DOMParser();
  const xml = parser.parseFromString(texto, 'text/xml');
  const txt = (no, tag) => {
    const el = no ? no.getElementsByTagName(tag)[0] : null;
    return el ? el.textContent.trim() : '';
  };

  const infNFe = xml.getElementsByTagName('infNFe')[0];
  if (!infNFe) throw new Error('Estrutura de NF-e não reconhecida.');

  const ide = infNFe.getElementsByTagName('ide')[0];
  const emit = infNFe.getElementsByTagName('emit')[0];
  const totalNo = infNFe.getElementsByTagName('ICMSTot')[0] || infNFe.getElementsByTagName('total')[0];

  const num = txt(ide, 'nNF');
  const serie = txt(ide, 'serie');
  const data = (txt(ide, 'dhEmi') || txt(ide, 'dEmi') || hoje()).slice(0, 10);
  const forn = txt(emit, 'xNome') || txt(emit, 'xFant') || 'Fornecedor';
  const cnpj = txt(emit, 'CNPJ') || txt(emit, 'CPF');
  const total = parseFloat(txt(totalNo, 'vNF') || '0');

  const detList = infNFe.getElementsByTagName('det');
  const itens = [];

  for (let i = 0; i < detList.length; i++) {
    const prod = detList[i].getElementsByTagName('prod')[0];
    if (!prod) continue;
    itens.push({
      cod: txt(prod, 'cProd'),
      nome: txt(prod, 'xProd'),
      un: txt(prod, 'uCom') || 'un',
      qtd: parseFloat(txt(prod, 'qCom') || '1'),
      custo: parseFloat(txt(prod, 'vUnCom') || '0')
    });
  }

  return { num, serie, data, forn, cnpj, total, itens };
}

function confirmarXML() {
  const n = S.ui.nota;
  if (!n) return;

  // 1. Atualizar ou criar peças no almoxarifado
  n.itens.forEach(it => {
    let p = S.pecas.find(x => x.cod === it.cod || x.nome.toLowerCase() === it.nome.toLowerCase());
    if (p) {
      p.qtd = (p.qtd || 0) + it.qtd;
      p.custo = it.custo;
      if (p.venda <= it.custo) p.venda = Math.round(it.custo * 1.6);
    } else {
      S.pecas.push({
        id: uid('p'),
        cod: it.cod,
        nome: it.nome,
        un: it.un,
        qtd: it.qtd,
        min: 2,
        custo: it.custo,
        venda: Math.round(it.custo * 1.6),
        loc: 'Almoxarifado',
        forn: n.forn
      });
    }
  });

  // 2. Registrar no Contas a Pagar
  S.contas.push({
    id: uid('ct'),
    tipo: 'pagar',
    desc: `NF-e ${n.num} — ${n.forn}`,
    parte: n.forn,
    valor: n.total,
    venc: addDias(hoje(), 28),
    pago: false,
    cat: 'Fornecedores Peças',
    doc: `NF-${n.num}`
  });

  // 3. Salvar registro de NF recebida
  S.nfsRecebidas = S.nfsRecebidas || [];
  S.nfsRecebidas.unshift(n);

  S.ui.nota = null;
  fecharFolha();
  render();
  torrar(`NF ${n.num} importada: ${n.itens.length} itens lançados no estoque!`);
}

/* =====================================================================
   LEITURA OCR & DANFE INTELIGENTE
===================================================================== */
function folhaSimulacaoOCR() {
  return `
  <div class="card card-p" style="max-width:650px;margin:0 auto">
    <div class="entre" style="border-bottom:1px solid var(--aco-150);padding-bottom:10px;margin-bottom:14px">
      <div>
        <h3 style="font-size:17px;font-weight:700">Leitor OCR de Notas & Danfe</h3>
        <div class="mini">Reconhecimento visual automático para notas em PDF ou foto</div>
      </div>
      <button class="btn-fechar" data-act="fechar">${ico('x', 18)}</button>
    </div>

    <div style="border:2px dashed var(--aco-300);padding:24px;border-radius:10px;text-align:center;background:var(--aco-050);margin-bottom:16px">
      <div style="margin-bottom:8px;color:var(--ardosia)">${ico('qr', 36)}</div>
      <div style="font-weight:600;font-size:14px;margin-bottom:4px">Envie a Foto ou PDF da Nota Fiscal / Danfe</div>
      <div class="mini" style="margin-bottom:14px">O sistema fará o escaneamento inteligente de itens, valores e fornecedor.</div>
      <label class="btn btn-primario" style="cursor:pointer;display:inline-flex;align-items:center;gap:6px">
        ${ico('upload', 14)} Selecionar Arquivo para OCR
        <input type="file" accept="image/*,application/pdf" data-act="arquivo-ocr" style="display:none">
      </label>
    </div>

    <div class="card card-p" style="background:var(--branco);border:1px solid var(--aco-150)">
      <div class="entre" style="margin-bottom:10px">
        <span style="font-weight:600;font-size:13px">Simulação de Nota Escaneada (Exemplo):</span>
        <button class="btn btn-secundario" data-act="carregar-exemplo-ocr" style="font-size:12px;padding:4px 10px">Carregar Exemplo Real</button>
      </div>
      <div style="font-size:12.5px;color:var(--aco-700);line-height:1.5">
        <b>Fornecedor:</b> ZF do Brasil Sistemas Automotivos Ltda<br>
        <b>CNPJ:</b> 61.088.883/0001-08 · <b>NF Nº:</b> 784102 · <b>Total:</b> R$ 3.840,00<br>
        <b>Itens Detectados:</b> 4x Jogo de Lonas de Freio Heavy Duty (R$ 480,00 un) + 2x Cilindro Mestre de Embreagem (R$ 960,00 un).
      </div>
    </div>

    <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:18px;border-top:1px solid var(--aco-150);padding-top:12px">
      <button class="btn btn-secundario" data-act="fechar">Fechar</button>
      <button class="btn btn-sucesso" data-act="importar-exemplo-ocr" style="font-weight:600;padding:0 16px">
        ${ico('check', 14)} Lançar Dados Reconhecidos
      </button>
    </div>
  </div>`;
}

/* --- FILE: financeiro.js --- */
/* =====================================================================
   PÁTIO CRM — MÓDULO FINANCEIRO COMPLETO (CONTAS, FLUXO, DRE & BANCO)
===================================================================== */

function viewFinanceiro() {
  const rec = emAberto('receber'), pag = emAberto('pagar');
  const vencidasR = rec.filter(c => c.venc < hoje());
  const vencidasP = pag.filter(c => c.venc < hoje());
  const mes = mesRef(hoje());
  const entradaMes = soma(S.movimentos.filter(m => m.tipo === 'entrada' && mesRef(m.data) === mes), m => m.valor);
  const saidaMes = soma(S.movimentos.filter(m => m.tipo === 'saida' && mesRef(m.data) === mes), m => m.valor);
  const totalRec = soma(rec, c => c.valor);
  const totalPag = soma(pag, c => c.valor);
  const abas = [
    ['dashboard', 'Dashboard'],
    ['receber', 'A Receber (' + rec.length + ')'],
    ['pagar', 'A Pagar (' + pag.length + ')'],
    ['caixa', 'Fluxo de Caixa'],
    ['dre', 'DRE Gerencial'],
    ['banco', 'Conciliação Bancária']
  ];
  const a = S.ui.abaFin || 'dashboard';

  let corpo = '';
  if (a === 'dashboard') corpo = blocoDashboardFin();
  else if (a === 'receber') corpo = blocoContasReceber();
  else if (a === 'pagar') corpo = blocoContasPagar();
  else if (a === 'caixa') corpo = blocoFluxoCaixa();
  else if (a === 'dre') corpo = blocoDRE();
  else corpo = blocoBanco();

  return `
  <div class="kpis" style="margin-bottom:14px">
    <div class="kpi bom">
      <div class="r">${ico('grana', 14)} Saldo em Caixa</div>
      <div class="v">${brlCurto(saldoCaixa())}</div>
      <div class="d">Saldo atual consolidado</div>
    </div>
    <div class="kpi ${vencidasR.length ? 'alerta' : 'neutro'}">
      <div class="r">${ico('doc', 14)} Total A Receber</div>
      <div class="v">${brlCurto(totalRec)}</div>
      <div class="d">${rec.length} títulos${vencidasR.length ? ' · <b style="color:var(--tijolo)">' + vencidasR.length + ' vencidos</b>' : ''}</div>
    </div>
    <div class="kpi ${vencidasP.length ? 'alerta' : 'aviso'}">
      <div class="r">${ico('caixa', 14)} Total A Pagar</div>
      <div class="v">${brlCurto(totalPag)}</div>
      <div class="d">${pag.length} contas${vencidasP.length ? ' · <b style="color:var(--tijolo)">' + vencidasP.length + ' vencidas</b>' : ''}</div>
    </div>
    <div class="kpi ${entradaMes - saidaMes >= 0 ? 'bom' : 'alerta'}">
      <div class="r">${ico('relatorios', 14)} Resultado do Mês</div>
      <div class="v">${brlCurto(entradaMes - saidaMes)}</div>
      <div class="d">Entradas: ${brlCurto(entradaMes)} | Saídas: ${brlCurto(saidaMes)}</div>
    </div>
  </div>

  <div class="abas" style="margin-bottom:14px">
    ${abas.map(([k, r]) => `<button data-act="aba-fin" data-k="${k}" aria-selected="${a === k}">${r}</button>`).join('')}
  </div>

  ${corpo}`;
}

/* ===== DASHBOARD FINANCEIRO ===== */
function blocoDashboardFin() {
  const rec = emAberto('receber'), pag = emAberto('pagar');
  const totalRec = soma(rec, c => c.valor), totalPag = soma(pag, c => c.valor);
  const vencidasR = rec.filter(c => c.venc < hoje()), vencidasP = pag.filter(c => c.venc < hoje());
  const previsto = saldoCaixa() + totalRec - totalPag;
  const aging = agingReceber();
  const catPagar = categorizarContas('pagar');

  return `
  <div class="kpis" style="grid-template-columns:repeat(3,1fr);margin-bottom:14px">
    <div class="card card-p" style="text-align:center">
      <div class="mini" style="font-weight:600">Saldo Projetado (30 Dias)</div>
      <div class="num" style="font-size:26px;font-weight:700;margin-top:6px;color:${previsto >= 0 ? 'var(--verde)' : 'var(--tijolo)'}">${brl(previsto)}</div>
      <div class="mini" style="margin-top:4px">Caixa + A Receber − A Pagar</div>
    </div>
    <div class="card card-p" style="text-align:center">
      <div class="mini" style="font-weight:600">Total Inadimplente</div>
      <div class="num" style="font-size:26px;font-weight:700;margin-top:6px;color:var(--tijolo)">${brl(soma(vencidasR, c => c.valor))}</div>
      <div class="mini" style="margin-top:4px">${vencidasR.length} títulos vencidos aguardando cobrança</div>
    </div>
    <div class="card card-p" style="text-align:center">
      <div class="mini" style="font-weight:600">A Pagar em Atraso</div>
      <div class="num" style="font-size:26px;font-weight:700;margin-top:6px;color:var(--sinal)">${brl(soma(vencidasP, c => c.valor))}</div>
      <div class="mini" style="margin-top:4px">${vencidasP.length} contas vencidas</div>
    </div>
  </div>

  <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px">
    <div class="card card-p">
      <div style="font-weight:700;font-size:14px;margin-bottom:8px">Aging de Contas a Receber (Vencimentos)</div>
      <div class="mini" style="margin-bottom:12px">Distribuição dos títulos a receber por prazo</div>
      <div style="display:flex;flex-direction:column;gap:8px">
        <div class="entre" style="font-size:13px">
          <span style="color:var(--tijolo);font-weight:600">Vencidas / Em Atraso:</span>
          <b class="num" style="color:var(--tijolo)">${brl(aging.vencido)}</b>
        </div>
        <div class="entre" style="font-size:13px">
          <span>A Vencer (Próximos 7 dias):</span>
          <b class="num">${brl(aging.ate7d)}</b>
        </div>
        <div class="entre" style="font-size:13px">
          <span>A Vencer (8 a 30 dias):</span>
          <b class="num">${brl(aging.ate30d)}</b>
        </div>
        <div class="entre" style="font-size:13px">
          <span>A Vencer (> 30 dias):</span>
          <b class="num">${brl(aging.mais30d)}</b>
        </div>
      </div>
    </div>

    <div class="card card-p">
      <div style="font-weight:700;font-size:14px;margin-bottom:8px">Categorias de Despesas A Pagar</div>
      <div class="mini" style="margin-bottom:12px">Compromissos agrupados por centro de custo</div>
      <div style="display:flex;flex-direction:column;gap:8px">
        ${catPagar.map(c => `
          <div class="entre" style="font-size:13px">
            <span>${esc(c.cat)}:</span>
            <b class="num">${brl(c.total)}</b>
          </div>
        `).join('')}
      </div>
    </div>
  </div>`;
}

function agingReceber() {
  const dH = hoje();
  const rec = emAberto('receber');
  let vencido = 0, ate7d = 0, ate30d = 0, mais30d = 0;

  rec.forEach(c => {
    const diff = diasEntre(dH, c.venc);
    if (diff < 0) vencido += c.valor;
    else if (diff <= 7) ate7d += c.valor;
    else if (diff <= 30) ate30d += c.valor;
    else mais30d += c.valor;
  });

  return { vencido, ate7d, ate30d, mais30d };
}

function categorizarContas(tipo) {
  const contas = emAberto(tipo);
  const mapa = {};
  contas.forEach(c => {
    const cat = c.cat || 'Outros';
    mapa[cat] = (mapa[cat] || 0) + c.valor;
  });
  return Object.entries(mapa).map(([cat, total]) => ({ cat, total })).sort((a, b) => b.total - a.total);
}

/* ===== CONTAS A RECEBER ===== */
function blocoContasReceber() {
  const contas = S.contas.filter(c => c.tipo === 'receber');
  const dH = hoje();

  return `
  <div class="entre" style="margin-bottom:12px">
    <div style="font-weight:600;font-size:14px">Controle de Títulos a Receber (${contas.length})</div>
    <button class="btn btn-primario" data-act="nova-conta" data-t="receber" style="font-size:13px;padding:6px 14px">
      ${ico('mais', 14)} Lançar Novo Título
    </button>
  </div>

  <div class="card">
    <div class="tabela-responsiva">
      <table class="tabela">
        <thead>
          <tr>
            <th>Descrição / Documento</th>
            <th>Cliente / Sacado</th>
            <th style="width:110px;text-align:center">Vencimento</th>
            <th style="width:120px;text-align:right">Valor</th>
            <th style="width:120px;text-align:center">Status</th>
            <th style="width:160px;text-align:center">Ações</th>
          </tr>
        </thead>
        <tbody>
          ${contas.length ? contas.map(c => {
            const vencida = !c.pago && c.venc < dH;
            const venceHoje = !c.pago && c.venc === dH;

            return `
            <tr style="${vencida ? 'background:rgba(239, 68, 68, 0.04)' : ''}">
              <td>
                <div style="font-weight:600;color:var(--aco-900)">${esc(c.desc)}</div>
                <div class="mini">Doc: ${esc(c.doc || '—')} · Cat: ${esc(c.cat || 'Serviços')}</div>
              </td>
              <td><b>${esc(c.parte)}</b></td>
              <td style="text-align:center">
                <span class="mono">${dataBRfull(c.venc)}</span>
                ${vencida ? `<div class="mini" style="color:var(--tijolo)">${Math.abs(diasEntre(dH, c.venc))}d em atraso</div>` : ''}
              </td>
              <td style="text-align:right;font-weight:700" class="num">${brl(c.valor)}</td>
              <td style="text-align:center">
                ${c.pago ? `
                  <span class="selo selo-finalizada">Recebido (${dataBR(c.dataPgto)})</span>
                ` : vencida ? `
                  <span class="selo selo-peca" style="background:var(--tijolo-fraco);color:var(--tijolo)">Vencido</span>
                ` : venceHoje ? `
                  <span class="selo selo-aprovacao">Vence Hoje</span>
                ` : `
                  <span class="selo selo-fila">Em Aberto</span>
                `}
              </td>
              <td style="text-align:center">
                <div style="display:inline-flex;gap:4px">
                  ${!c.pago ? `
                    <button class="btn btn-sucesso" data-act="baixar" data-id="${c.id}" style="padding:4px 8px;font-size:12px" title="Dar Baixa / Receber">
                      ${ico('check', 12)} Receber
                    </button>
                    <button class="btn btn-secundario" data-act="cobrar-titulo" data-id="${c.id}" style="padding:4px 8px;font-size:12px" title="Cobrar no WhatsApp">
                      ${ico('zap', 12)}
                    </button>
                  ` : `
                    <button class="btn btn-secundario" data-act="imprimir-recibo" data-id="${c.id}" style="padding:4px 8px;font-size:12px" title="Imprimir Recibo">
                      ${ico('imprimir', 12)} Recibo
                    </button>
                  `}
                </div>
              </td>
            </tr>`;
          }).join('') : `
            <tr><td colspan="6" style="text-align:center;padding:30px;color:var(--aco-400)">Nenhum título a receber registrado.</td></tr>
          `}
        </tbody>
      </table>
    </div>
  </div>`;
}

/* ===== CONTAS A PAGAR ===== */
function blocoContasPagar() {
  const contas = S.contas.filter(c => c.tipo === 'pagar');
  const dH = hoje();

  return `
  <div class="entre" style="margin-bottom:12px">
    <div style="font-weight:600;font-size:14px">Controle de Contas a Pagar (${contas.length})</div>
    <button class="btn btn-primario" data-act="nova-conta" data-t="pagar" style="font-size:13px;padding:6px 14px">
      ${ico('mais', 14)} Lançar Nova Conta
    </button>
  </div>

  <div class="card">
    <div class="tabela-responsiva">
      <table class="tabela">
        <thead>
          <tr>
            <th>Descrição / Documento</th>
            <th>Fornecedor / Favorecido</th>
            <th style="width:110px;text-align:center">Vencimento</th>
            <th style="width:120px;text-align:right">Valor</th>
            <th style="width:120px;text-align:center">Status</th>
            <th style="width:140px;text-align:center">Ações</th>
          </tr>
        </thead>
        <tbody>
          ${contas.length ? contas.map(c => {
            const vencida = !c.pago && c.venc < dH;

            return `
            <tr style="${vencida ? 'background:rgba(239, 68, 68, 0.04)' : ''}">
              <td>
                <div style="font-weight:600;color:var(--aco-900)">${esc(c.desc)}</div>
                <div class="mini">Doc: ${esc(c.doc || '—')} · Cat: ${esc(c.cat || 'Geral')}</div>
              </td>
              <td><b>${esc(c.parte)}</b></td>
              <td style="text-align:center">
                <span class="mono">${dataBRfull(c.venc)}</span>
                ${vencida ? `<div class="mini" style="color:var(--tijolo)">${Math.abs(diasEntre(dH, c.venc))}d em atraso</div>` : ''}
              </td>
              <td style="text-align:right;font-weight:700" class="num">${brl(c.valor)}</td>
              <td style="text-align:center">
                ${c.pago ? `
                  <span class="selo selo-finalizada">Pago (${dataBR(c.dataPgto)})</span>
                ` : vencida ? `
                  <span class="selo" style="background:var(--tijolo-fraco);color:var(--tijolo)">Vencido</span>
                ` : `
                  <span class="selo selo-fila">Em Aberto</span>
                `}
              </td>
              <td style="text-align:center">
                ${!c.pago ? `
                  <button class="btn btn-sucesso" data-act="baixar" data-id="${c.id}" style="padding:4px 10px;font-size:12px">
                    ${ico('check', 12)} Baixar Pagamento
                  </button>
                ` : `
                  <span class="mini" style="color:var(--verde)">Quitado</span>
                `}
              </td>
            </tr>`;
          }).join('') : `
            <tr><td colspan="6" style="text-align:center;padding:30px;color:var(--aco-400)">Nenhuma conta a pagar cadastrada.</td></tr>
          `}
        </tbody>
      </table>
    </div>
  </div>`;
}

/* ===== FLUXO DE CAIXA ===== */
function blocoFluxoCaixa() {
  const movs = (S.movimentos || []).slice().reverse();

  return `
  <div class="entre" style="margin-bottom:12px">
    <div>
      <div style="font-weight:700;font-size:15px">Extrato e Movimentação de Caixa</div>
      <div class="mini">Saldo Atual: <b style="color:var(--verde)">${brl(saldoCaixa())}</b></div>
    </div>
    <button class="btn btn-primario" data-act="novo-mov" style="font-size:13px;padding:6px 14px">
      ${ico('mais', 14)} Lançar Movimento Avulso
    </button>
  </div>

  <div class="card">
    <div class="tabela-responsiva">
      <table class="tabela">
        <thead>
          <tr>
            <th style="width:100px">Data</th>
            <th>Descrição do Lançamento</th>
            <th>Categoria</th>
            <th>Forma</th>
            <th style="width:130px;text-align:right">Valor</th>
            <th style="width:80px;text-align:center">Status</th>
          </tr>
        </thead>
        <tbody>
          ${movs.length ? movs.map(m => {
            const isEntrada = m.tipo === 'entrada';
            return `
            <tr>
              <td class="mono">${dataBRfull(m.data)}</td>
              <td><b>${esc(m.desc)}</b></td>
              <td><span class="selo">${esc(m.cat || 'Geral')}</span></td>
              <td class="mini">${esc(m.forma || 'Pix/Conta')}</td>
              <td style="text-align:right;font-weight:700;color:${isEntrada ? 'var(--verde)' : 'var(--tijolo)'}" class="num">
                ${isEntrada ? '+' : '−'} ${brl(m.valor)}
              </td>
              <td style="text-align:center">
                <span class="selo ${m.conc ? 'selo-finalizada' : 'selo-fila'}" style="font-size:10px">
                  ${m.conc ? 'Conciliado' : 'Manual'}
                </span>
              </td>
            </tr>`;
          }).join('') : `
            <tr><td colspan="6" style="text-align:center;padding:30px;color:var(--aco-400)">Nenhuma movimentação de caixa recente.</td></tr>
          `}
        </tbody>
      </table>
    </div>
  </div>`;
}

/* ===== DRE GERENCIAL SIMPLIFICADO ===== */
function blocoDRE() {
  const mes = mesRef(hoje());
  const movsMes = S.movimentos.filter(m => mesRef(m.data) === mes);
  const recMes = soma(movsMes.filter(m => m.tipo === 'entrada'), m => m.valor);
  const despesasPecas = soma(movsMes.filter(m => m.tipo === 'saida' && m.cat === 'Fornecedores Peças'), m => m.valor);
  const despesasPessoal = soma(movsMes.filter(m => m.tipo === 'saida' && m.cat === 'Pessoal & Salários'), m => m.valor);
  const despesasFixas = soma(movsMes.filter(m => m.tipo === 'saida' && ['Estrutura & Aluguel', 'Água / Luz / Internet'].includes(m.cat)), m => m.valor);
  const outrasDesp = soma(movsMes.filter(m => m.tipo === 'saida' && !['Fornecedores Peças', 'Pessoal & Salários', 'Estrutura & Aluguel', 'Água / Luz / Internet'].includes(m.cat)), m => m.valor);
  const totalDesp = despesasPecas + despesasPessoal + despesasFixas + outrasDesp;
  const lucroLiq = recMes - totalDesp;
  const margemLiq = recMes > 0 ? ((lucroLiq / recMes) * 100).toFixed(1) : 0;

  return `
  <div class="card card-p" style="max-width:700px;margin:0 auto">
    <div class="entre" style="border-bottom:2px solid var(--aco-900);padding-bottom:10px;margin-bottom:16px">
      <div>
        <h3 style="font-size:18px;font-weight:700">DRE — Demonstrativo de Resultado Gerencial</h3>
        <div class="mini">Competência: <b>Mês Atual (${dataBR(hoje())})</b></div>
      </div>
      <div class="num" style="font-size:22px;font-weight:700;color:${lucroLiq >= 0 ? 'var(--verde)' : 'var(--tijolo)'}">
        ${brl(lucroLiq)} <span style="font-size:13px">(${margemLiq}%)</span>
      </div>
    </div>

    <div style="display:flex;flex-direction:column;gap:10px;font-size:13.5px">
      <div class="entre" style="font-weight:700;font-size:14.5px;color:var(--aco-900);background:var(--aco-050);padding:8px">
        <span>(+) RECEITA BRUTA OPERACIONAL</span>
        <span class="num">${brl(recMes)}</span>
      </div>

      <div class="entre" style="padding-left:14px;color:var(--aco-700)">
        <span>(−) Custos de Peças e Insumos Aplicados (CMV)</span>
        <span class="num">${brl(despesasPecas)}</span>
      </div>

      <div class="entre" style="padding-left:14px;color:var(--aco-700)">
        <span>(−) Despesas com Folha de Pagamento / Mecânicos</span>
        <span class="num">${brl(despesasPessoal)}</span>
      </div>

      <div class="entre" style="padding-left:14px;color:var(--aco-700)">
        <span>(−) Despesas Fixas (Aluguel, Luz, Água, Internet)</span>
        <span class="num">${brl(despesasFixas)}</span>
      </div>

      <div class="entre" style="padding-left:14px;color:var(--aco-700)">
        <span>(−) Outras Despesas Operacionais e Administrativas</span>
        <span class="num">${brl(outrasDesp)}</span>
      </div>

      <div class="entre" style="font-weight:700;font-size:15px;border-top:2px solid var(--aco-300);padding-top:12px;margin-top:8px">
        <span>(=) RESULTADO LÍQUIDO DO EXERCÍCIO</span>
        <span class="num" style="color:${lucroLiq >= 0 ? 'var(--verde)' : 'var(--tijolo)'}">${brl(lucroLiq)}</span>
      </div>
    </div>
  </div>`;
}

/* ===== CONCILIAÇÃO BANCÁRIA ===== */
function blocoBanco() {
  const extrato = S.extrato || [];

  return `
  <div class="entre" style="margin-bottom:12px">
    <div>
      <div style="font-weight:700;font-size:15px">Conciliação Bancária com Extrato OFX / CSV</div>
      <div class="mini">Importe o arquivo do seu banco para cruzar lançamentos automaticamente</div>
    </div>
    <div style="display:flex;gap:8px">
      ${extrato.length ? `<button class="btn btn-secundario" data-act="limpar-extrato">Limpar Extrato</button>` : ''}
      <label class="btn btn-primario" style="cursor:pointer;display:inline-flex;align-items:center;gap:6px;font-size:13px;padding:6px 14px">
        ${ico('upload', 14)} Importar Arquivo OFX/CSV
        <input type="file" accept=".ofx,.csv,.txt" data-act="arquivo-extrato" multiple style="display:none">
      </label>
    </div>
  </div>

  <div class="card card-p">
    ${extrato.length ? `
      <div class="tabela-responsiva">
        <table class="tabela">
          <thead>
            <tr><th>Data</th><th>Descrição no Extrato</th><th style="width:120px;text-align:right">Valor</th><th style="width:180px;text-align:center">Ação</th></tr>
          </thead>
          <tbody>
            ${extrato.map(l => `
              <tr style="${l.ok ? 'opacity:0.5' : ''}">
                <td class="mono">${dataBR(l.data)}</td>
                <td><b>${esc(l.desc)}</b></td>
                <td style="text-align:right;font-weight:700;color:${l.valor >= 0 ? 'var(--verde)' : 'var(--tijolo)'}" class="num">
                  ${brl(l.valor)}
                </td>
                <td style="text-align:center">
                  ${l.ok ? `<span class="selo selo-finalizada">Conciliado</span>` : `
                    <button class="btn btn-secundario" data-act="conciliar-avulso" data-id="${l.id}" style="font-size:12px;padding:4px 8px">
                      Lançar no Caixa
                    </button>
                  `}
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    ` : `
      <div style="text-align:center;padding:40px;color:var(--aco-400)">
        <div style="margin-bottom:10px">${ico('fin', 32)}</div>
        <b>Nenhum extrato importado</b><br>
        Envie o arquivo OFX exportado pelo Internet Banking da oficina para conciliar saldos.
      </div>
    `}
  </div>`;
}

function baixarConta(c, dataPgto) {
  if (!c || c.pago) return;
  c.pago = true;
  c.dataPgto = dataPgto || hoje();

  S.movimentos.push({
    id: uid('mv'),
    data: c.dataPgto,
    tipo: c.tipo === 'receber' ? 'entrada' : 'saida',
    desc: `Baixa: ${c.desc} (${c.parte})`,
    valor: c.valor,
    cat: c.cat || 'Geral',
    conc: true,
    forma: 'Baixa Financeira'
  });

  salvar();
}

function imprimirRecibo(contaId) {
  const c = S.contas.find(x => x.id === contaId);
  if (!c) return;

  const cfg = S.cfg;
  const janela = window.open('', '_blank');
  if (!janela) return;

  janela.document.write(`
  <!DOCTYPE html>
  <html lang="pt-BR">
  <head>
    <meta charset="utf-8">
    <title>Recibo de Pagamento — ${cfg.empresa}</title>
    <style>
      body { font-family: sans-serif; font-size: 13px; max-width: 600px; margin: 20px auto; padding: 20px; border: 2px solid #334155; border-radius: 8px; }
      .topo { text-align: center; border-bottom: 2px solid #cbd5e1; padding-bottom: 12px; margin-bottom: 16px; }
      .valor { font-size: 24px; font-weight: bold; color: #10b981; margin: 14px 0; text-align: right; }
      .corpo { line-height: 1.6; margin-bottom: 24px; }
      .ass { margin-top: 40px; text-align: center; border-top: 1px solid #000; width: 60%; margin-left: auto; margin-right: auto; padding-top: 6px; }
    </style>
  </head>
  <body>
    <div class="topo">
      <h2>${esc(cfg.empresa)}</h2>
      <div>CNPJ: ${esc(cfg.cnpj)} · ${esc(cfg.endereco)}</div>
    </div>
    <div class="valor">RECIBO: ${brl(c.valor)}</div>
    <div class="corpo">
      Recebemos de <b>${esc(c.parte)}</b> a quantia de <b>${brl(c.valor)}</b> referente a <b>${esc(c.desc)}</b> (${esc(c.doc || 'Doc S/N')}).<br>
      Para clareza e fins de direito, firmamos o presente recibo dando plena e geral quitação.
    </div>
    <div style="text-align:right">Campinas, ${dataBRfull(c.dataPgto || hoje())}.</div>
    <div class="ass">${esc(cfg.empresa)}<br><small>Assinatura Autorizada</small></div>
    <script>window.onload = () => window.print();<\/script>
  </body>
  </html>`);
  janela.document.close();
}

function folhaConta() {
  const tipo = S.ui.contaTipo || 'receber';
  const r = S.ui.rascConta = S.ui.rascConta || { venc: hoje(), valor: '' };

  return `
  <div class="card card-p" style="max-width:500px;margin:0 auto">
    <div class="entre" style="border-bottom:1px solid var(--aco-150);padding-bottom:10px;margin-bottom:14px">
      <h3 style="font-size:17px;font-weight:700">Lançar Título — Contas a ${tipo === 'receber' ? 'Receber' : 'Pagar'}</h3>
      <button class="btn-fechar" data-act="fechar">${ico('x', 18)}</button>
    </div>

    <div style="display:flex;flex-direction:column;gap:12px;font-size:13px">
      <div>
        <label style="font-weight:600;display:block;margin-bottom:4px">Descrição do Título:</label>
        <input type="text" class="campo-texto" placeholder="Ex: Manutenção Preventiva / Compra de Peças" data-act="rct" data-c="desc" value="${esc(r.desc || '')}" style="width:100%;height:34px">
      </div>

      <div>
        <label style="font-weight:600;display:block;margin-bottom:4px">${tipo === 'receber' ? 'Cliente / Devedor' : 'Fornecedor / Favorecido'}:</label>
        <input type="text" class="campo-texto" placeholder="Nome da empresa ou pessoa" data-act="rct" data-c="parte" value="${esc(r.parte || '')}" style="width:100%;height:34px">
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div>
          <label style="font-weight:600;display:block;margin-bottom:4px">Valor (R$):</label>
          <input type="number" class="campo-texto" placeholder="0.00" data-act="rct" data-c="valor" value="${r.valor || ''}" step="0.50" style="width:100%;height:34px;font-weight:700">
        </div>
        <div>
          <label style="font-weight:600;display:block;margin-bottom:4px">Data de Vencimento:</label>
          <input type="date" class="campo-texto" data-act="rct" data-c="venc" value="${r.venc || hoje()}" style="width:100%;height:34px">
        </div>
      </div>

      <div>
        <label style="font-weight:600;display:block;margin-bottom:4px">Categoria de Centro de Custo:</label>
        <input type="text" class="campo-texto" placeholder="Ex: Serviços & Peças, Fornecedores Peças, Aluguel" data-act="rct" data-c="cat" value="${esc(r.cat || '')}" style="width:100%;height:34px">
      </div>
    </div>

    <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:18px;border-top:1px solid var(--aco-150);padding-top:12px">
      <button class="btn btn-secundario" data-act="fechar">Cancelar</button>
      <button class="btn btn-primario" data-act="salvar-conta" style="font-weight:600;padding:0 18px">
        ${ico('check', 14)} Lançar Conta
      </button>
    </div>
  </div>`;
}

function folhaMov() {
  const r = S.ui.rascMov = S.ui.rascMov || { data: hoje(), tipo: 'entrada', valor: '' };

  return `
  <div class="card card-p" style="max-width:500px;margin:0 auto">
    <div class="entre" style="border-bottom:1px solid var(--aco-150);padding-bottom:10px;margin-bottom:14px">
      <h3 style="font-size:17px;font-weight:700">Lançamento Avulso no Caixa</h3>
      <button class="btn-fechar" data-act="fechar">${ico('x', 18)}</button>
    </div>

    <div style="display:flex;flex-direction:column;gap:12px;font-size:13px">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div>
          <label style="font-weight:600;display:block;margin-bottom:4px">Tipo de Movimento:</label>
          <select class="campo-select" data-act="rmv" data-c="tipo" style="width:100%;height:34px;font-weight:600">
            <option value="entrada" ${r.tipo === 'entrada' ? 'selected' : ''}>Entrada (+) Receita</option>
            <option value="saida" ${r.tipo === 'saida' ? 'selected' : ''}>Saída (−) Despesa</option>
          </select>
        </div>
        <div>
          <label style="font-weight:600;display:block;margin-bottom:4px">Data:</label>
          <input type="date" class="campo-texto" data-act="rmv" data-c="data" value="${r.data || hoje()}" style="width:100%;height:34px">
        </div>
      </div>

      <div>
        <label style="font-weight:600;display:block;margin-bottom:4px">Descrição do Lançamento:</label>
        <input type="text" class="campo-texto" placeholder="Ex: Pagamento de Frete / Compra de Material de Limpeza" data-act="rmv" data-c="desc" value="${esc(r.desc || '')}" style="width:100%;height:34px">
      </div>

      <div>
        <label style="font-weight:600;display:block;margin-bottom:4px">Valor (R$):</label>
        <input type="number" class="campo-texto" placeholder="0.00" data-act="rmv" data-c="valor" value="${r.valor || ''}" step="0.50" style="width:100%;height:34px;font-weight:700">
      </div>
    </div>

    <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:18px;border-top:1px solid var(--aco-150);padding-top:12px">
      <button class="btn btn-secundario" data-act="fechar">Cancelar</button>
      <button class="btn btn-primario" data-act="salvar-mov" style="font-weight:600;padding:0 18px">
        ${ico('check', 14)} Salvar Movimento
      </button>
    </div>
  </div>`;
}

/* =====================================================================
   IMPRESSÃO DE FECHAMENTO DE CAIXA
===================================================================== */
function imprimirFechamentoCaixa() {
  const h = hoje();
  const movHoje = (S.movimentos || []).filter(m => m.data === h);
  const ent = soma(movHoje.filter(m => m.tipo === 'entrada'), m => m.valor);
  const sai = soma(movHoje.filter(m => m.tipo === 'saida'), m => m.valor);
  const linhas = movHoje.map(m =>
    `<tr><td>${m.desc || '—'}</td><td>${m.tipo === 'entrada' ? 'Entrada' : 'Saída'}</td><td style="text-align:right;font-weight:600;color:${m.tipo === 'entrada' ? 'var(--verde)' : 'var(--tijolo)'}">${brl(m.valor)}</td></tr>`
  ).join('');

  const html = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
      <h2 style="text-align:center;margin-bottom:4px">Fechamento de Caixa</h2>
      <p style="text-align:center;color:#64748b;font-size:13px;margin-bottom:16px">${new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
      <div style="display:flex;gap:12px;margin-bottom:16px">
        <div style="flex:1;background:#ecfdf5;padding:12px;border-radius:8px;text-align:center">
          <div style="font-size:11px;color:#64748b">Total Entradas</div>
          <div style="font-size:18px;font-weight:700;color:#059669">${brl(ent)}</div>
        </div>
        <div style="flex:1;background:#fef2f2;padding:12px;border-radius:8px;text-align:center">
          <div style="font-size:11px;color:#64748b">Total Saídas</div>
          <div style="font-size:18px;font-weight:700;color:#dc2626">${brl(sai)}</div>
        </div>
        <div style="flex:1;background:#eff6ff;padding:12px;border-radius:8px;text-align:center">
          <div style="font-size:11px;color:#64748b">Saldo do Dia</div>
          <div style="font-size:18px;font-weight:700;color:#2563eb">${brl(ent - sai)}</div>
        </div>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead><tr style="background:#f1f5f9"><th style="text-align:left;padding:8px">Descrição</th><th style="text-align:left;padding:8px">Tipo</th><th style="text-align:right;padding:8px">Valor</th></tr></thead>
        <tbody>${linhas || '<tr><td colspan="3" style="text-align:center;padding:20px;color:#94a3b8">Nenhum movimento hoje</td></tr>'}</tbody>
      </table>
      <p style="text-align:center;font-size:11px;color:#94a3b8;margin-top:20px">Saldo em caixa: ${brl(saldoCaixa())} · Gerado em ${new Date().toLocaleTimeString('pt-BR')}</p>
    </div>`;

  const win = window.open('', '_blank', 'width=700,height=600');
  win.document.write(html);
  win.document.close();
  win.print();
}

/* --- FILE: whatsapp.js --- */
/* =====================================================================
   PÁTIO CRM — MÓDULO DE COMUNICAÇÃO & RÉGUA DE COBRANÇA WHATSAPP
===================================================================== */

function viewMensagens() {
  const zap = S.zap || zapPadrao();
  const abas = [
    ['cobranca', 'Fila de Cobrança'],
    ['campanhas', 'Campanhas & Pós-Venda'],
    ['regua', 'Régua Automática'],
    ['historico', 'Histórico de Envios (' + (zap.envios ? zap.envios.length : 0) + ')']
  ];
  const a = S.ui.abaZap || 'cobranca';

  let corpo = '';
  if (a === 'cobranca') corpo = blocoCobranca();
  else if (a === 'campanhas') corpo = blocoCampanhas();
  else if (a === 'regua') corpo = blocoRegua();
  else corpo = blocoHistoricoZap();

  return `
  <div class="kpis" style="margin-bottom:14px">
    <div class="kpi bom">
      <div class="r">${ico('zap', 14)} Módulo WhatsApp</div>
      <div class="v" style="font-size:20px;color:${zap.ativo ? 'var(--verde)' : 'var(--aco-400)'}">
        ${zap.ativo ? '● Ativo' : '○ Pausado'}
      </div>
      <div class="d">Régua e disparos habilitados</div>
    </div>
    <div class="kpi neutro">
      <div class="r">${ico('doc', 14)} Títulos em Régua</div>
      <div class="v">${filaCobranca().length}</div>
      <div class="d">Clientes na fila de cobrança</div>
    </div>
    <div class="kpi bom">
      <div class="r">${ico('check', 14)} Mensagens Enviadas</div>
      <div class="v">${(zap.envios || []).length}</div>
      <div class="d">Registros no histórico</div>
    </div>
    <div class="kpi aviso">
      <div class="r">${ico('cfg', 14)} Etapas da Régua</div>
      <div class="v">${(zap.regua || []).filter(r => r.ativo).length}</div>
      <div class="d">Gatilhos automáticos configurados</div>
    </div>
  </div>

  <div class="entre" style="margin-bottom:14px;flex-wrap:wrap;gap:8px">
    <div class="abas" style="margin:0">
      ${abas.map(([k, r]) => `<button data-act="aba-zap" data-k="${k}" aria-selected="${a === k}">${r}</button>`).join('')}
    </div>
    <div style="display:flex;gap:8px">
      <button class="btn ${zap.ativo ? 'btn-secundario' : 'btn-sucesso'}" data-act="liga-zap" style="font-size:13px;padding:6px 14px">
        ${zap.ativo ? 'Pausar Régua' : 'Ativar Régua'}
      </button>
      <button class="btn btn-secundario" data-act="ver-api" style="font-size:13px;padding:6px 14px">
        ${ico('cfg', 14)} Configurar API WhatsApp
      </button>
    </div>
  </div>

  ${corpo}`;
}

function zapPadrao() {
  return {
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
  };
}

function foneZap(f) {
  let d = soDigitos(f);
  if (!d) return '';
  if (d.length <= 11) d = '55' + d;
  return d;
}

function linkZap(fone, texto) {
  return 'https://wa.me/' + foneZap(fone) + '?text=' + encodeURIComponent(texto || '');
}

function preencher(txt, ctx) {
  return String(txt || '').replace(/\{(\w+)\}/g, (m, k) => (ctx && ctx[k] !== undefined ? ctx[k] : m));
}

function ctxCobranca(c, cli) {
  return {
    nome: cli ? (cli.contato || cli.fantasia || cli.nome) : c.parte,
    contato: cli ? (cli.contato || cli.nome) : c.parte,
    empresa: S.cfg.empresa,
    desc: c.desc,
    valor: brl(c.valor),
    venc: dataBRfull(c.venc),
    pix: S.cfg.chavePix || ''
  };
}

function filaCobranca() {
  const rec = emAberto('receber');
  const dH = hoje();
  const regua = (S.zap && S.zap.regua) ? S.zap.regua.filter(r => r.ativo) : [];
  const fila = [];

  rec.forEach(c => {
    const diff = diasEntre(dH, c.venc);
    const cli = S.clientes.find(x => x.nome === c.parte || x.id === c.cli);

    regua.forEach(regra => {
      // Regra de quando: se diff === regra.quando
      if (diff === regra.quando || (regra.quando > 0 && diff >= regra.quando && diff < regra.quando + 3)) {
        const chave = `${c.id}_${regra.id}`;
        const jaEnviado = (S.zap.envios || []).some(e => e.chave === chave);
        if (!jaEnviado) {
          fila.push({
            chave,
            conta: c,
            cli,
            regra,
            diff,
            texto: preencher(regra.texto, ctxCobranca(c, cli))
          });
        }
      }
    });
  });

  return fila;
}

function blocoCobranca() {
  const fila = filaCobranca();

  return `
  <div class="entre" style="margin-bottom:12px">
    <div>
      <div style="font-weight:700;font-size:15px">Fila de Mensagens Automáticas de Cobrança (${fila.length})</div>
      <div class="mini">Títulos em vencimento ou atraso mapeados pelas etapas da régua</div>
    </div>
  </div>

  <div class="card">
    <div class="tabela-responsiva">
      <table class="tabela">
        <thead>
          <tr>
            <th>Etapa / Regra</th>
            <th>Cliente / Sacado</th>
            <th>Documento / Vencimento</th>
            <th style="width:110px;text-align:right">Valor</th>
            <th style="width:160px;text-align:center">Ações WhatsApp</th>
          </tr>
        </thead>
        <tbody>
          ${fila.length ? fila.map(item => `
            <tr>
              <td>
                <span class="selo selo-aprovacao">${esc(item.regra.nome)}</span>
                <div class="mini" style="margin-top:4px">Gatilho: ${item.diff} dias do vencimento</div>
              </td>
              <td>
                <b>${esc(item.cli ? (item.cli.fantasia || item.cli.nome) : item.conta.parte)}</b>
                <div class="mini">Tel: ${esc(item.cli ? item.cli.fone : '—')}</div>
              </td>
              <td>
                <div>${esc(item.conta.desc)}</div>
                <div class="mini mono">Vencimento: ${dataBRfull(item.conta.venc)}</div>
              </td>
              <td style="text-align:right;font-weight:700" class="num">${brl(item.conta.valor)}</td>
              <td style="text-align:center">
                <div style="display:inline-flex;gap:4px">
                  <a href="${linkZap(item.cli ? item.cli.fone : '', item.texto)}" target="_blank" class="btn btn-sucesso" data-act="enviar-cob" data-k="${item.chave}" style="padding:4px 8px;font-size:12px;text-decoration:none">
                    ${ico('zap', 12)} Enviar
                  </a>
                  <button class="btn btn-secundario" data-act="copiar-cob" data-k="${item.chave}" style="padding:4px 8px;font-size:12px" title="Copiar texto">
                    ${ico('copiar', 12)}
                  </button>
                  <button class="btn btn-secundario" data-act="pular-cob" data-k="${item.chave}" style="padding:4px 8px;font-size:12px" title="Pular">
                    ${ico('x', 12)}
                  </button>
                </div>
              </td>
            </tr>
          `).join('') : `
            <tr>
              <td colspan="5" style="text-align:center;padding:36px;color:var(--aco-400)">
                <div style="margin-bottom:8px">${ico('check', 28)}</div>
                <b>Fila de cobrança zerada!</b><br>
                Nenhum cliente necessitando de contato no dia de hoje.
              </td>
            </tr>
          `}
        </tbody>
      </table>
    </div>
  </div>`;
}

function blocoCampanhas() {
  const camp = S.ui.camp = S.ui.camp || { seg: 'todos', texto: '', nome: 'Campanha de Revisão' };
  const modelos = S.zap.modelos || [];

  return `
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
    <div class="card card-p">
      <div style="font-weight:700;font-size:15px;margin-bottom:10px">Disparo de Campanhas & Pós-Venda</div>

      <div style="display:flex;flex-direction:column;gap:12px;font-size:13px">
        <div>
          <label style="font-weight:600;display:block;margin-bottom:4px">Modelo Pré-Pronto:</label>
          <select class="campo-select" data-act="camp-modelo" style="width:100%;height:34px">
            <option value="">-- Escolha um modelo --</option>
            ${modelos.map((m, idx) => `<option value="${idx}">${esc(m.nome)}</option>`).join('')}
          </select>
        </div>

        <div>
          <label style="font-weight:600;display:block;margin-bottom:4px">Segmento de Destinatários:</label>
          <select class="campo-select" data-act="camp" data-c="seg" style="width:100%;height:34px">
            <option value="todos" ${camp.seg === 'todos' ? 'selected' : ''}>Todos os Clientes Cadastrados (${S.clientes.length})</option>
            <option value="frotistas" ${camp.seg === 'frotistas' ? 'selected' : ''}>Transportadoras & Frotistas</option>
            <option value="inativos" ${camp.seg === 'inativos' ? 'selected' : ''}>Sem Manutenção há mais de 60 Dias</option>
          </select>
        </div>

        <div>
          <label style="font-weight:600;display:block;margin-bottom:4px">Texto da Mensagem:</label>
          <textarea class="campo-texto" data-act="camp" data-c="texto" rows="5" placeholder="Digite a mensagem ou use marcadores como {nome}, {placa}, {empresa}..." style="width:100%">${esc(camp.texto || '')}</textarea>
        </div>

        <div style="display:flex;gap:6px;flex-wrap:wrap">
          <span class="selo" style="cursor:pointer" data-act="copiar-var" data-v="{nome}">{nome}</span>
          <span class="selo" style="cursor:pointer" data-act="copiar-var" data-v="{placa}">{placa}</span>
          <span class="selo" style="cursor:pointer" data-act="copiar-var" data-v="{empresa}">{empresa}</span>
          <span class="selo" style="cursor:pointer" data-act="copiar-var" data-v="{valor}">{valor}</span>
        </div>

        <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:10px">
          <button class="btn btn-secundario" data-act="copiar-camp">${ico('copiar', 14)} Copiar Mensagem</button>
          <button class="btn btn-primario" data-act="disparar-camp">${ico('zap_send', 14)} Iniciar Disparos</button>
        </div>
      </div>
    </div>

    <div class="card card-p">
      <div style="font-weight:700;font-size:15px;margin-bottom:10px">Histórico de Campanhas Realizadas</div>
      <div style="display:flex;flex-direction:column;gap:8px">
        ${(S.zap.campanhas || []).length ? S.zap.campanhas.map(cp => `
          <div class="entre" style="padding:8px;background:var(--aco-050);border-radius:6px;font-size:13px">
            <div>
              <b>${esc(cp.nome)}</b>
              <div class="mini">Data: ${dataBRfull(cp.data)} · Segmento: ${esc(cp.seg)}</div>
            </div>
            <span class="selo selo-finalizada">${cp.enviados} disparos</span>
          </div>
        `).join('') : `
          <div style="text-align:center;padding:30px;color:var(--aco-400)">Nenhuma campanha disparada ainda.</div>
        `}
      </div>
    </div>
  </div>`;
}

function blocoRegua() {
  const regua = (S.zap && S.zap.regua) || [];

  return `
  <div class="entre" style="margin-bottom:12px">
    <div>
      <div style="font-weight:700;font-size:15px">Configuração dos Gatilhos da Régua</div>
      <div class="mini">Defina quando cada notificação será gerada em relação ao vencimento do título</div>
    </div>
    <button class="btn btn-primario" data-act="add-regra" style="font-size:13px;padding:6px 14px">
      ${ico('mais', 14)} Nova Etapa
    </button>
  </div>

  <div style="display:flex;flex-direction:column;gap:12px">
    ${regua.map(r => `
      <div class="card card-p" style="border-left:4px solid ${r.ativo ? 'var(--petroleo)' : 'var(--aco-300)'}">
        <div class="entre" style="margin-bottom:8px">
          <div style="display:flex;align-items:center;gap:8px">
            <input type="checkbox" ${r.ativo ? 'checked' : ''} data-act="liga-regra" data-i="${r.id}">
            <b style="font-size:14px">${esc(r.nome)}</b>
          </div>
          <div style="display:flex;gap:6px">
            <button class="btn-icone-perigo" data-act="rm-regra" data-i="${r.id}">${ico('lixo', 14)}</button>
          </div>
        </div>

        <div style="display:grid;grid-template-columns:140px 1fr;gap:12px;align-items:center">
          <div>
            <label class="mini" style="font-weight:600;display:block">Disparar no dia:</label>
            <input type="number" class="campo-texto" value="${r.quando}" data-act="regra" data-c="quando" data-i="${r.id}" style="width:100%;height:32px;text-align:center">
            <div class="mini" style="font-size:10.5px;color:var(--aco-500);margin-top:2px">negativo = antes<br>positivo = após venc.</div>
          </div>
          <div>
            <label class="mini" style="font-weight:600;display:block">Mensagem Padrão:</label>
            <textarea class="campo-texto" data-act="regra" data-c="texto" data-i="${r.id}" rows="2" style="width:100%">${esc(r.texto)}</textarea>
          </div>
        </div>
      </div>
    `).join('')}
  </div>`;
}

function blocoHistoricoZap() {
  const envios = (S.zap && S.zap.envios) || [];

  return `
  <div class="entre" style="margin-bottom:12px">
    <div style="font-weight:700;font-size:15px">Registro Geral de Envios WhatsApp (${envios.length})</div>
    ${envios.length ? `<button class="btn btn-perigo" data-act="limpar-hist" style="font-size:12px;padding:4px 10px">Limpar Histórico</button>` : ''}
  </div>

  <div class="card">
    <div class="tabela-responsiva">
      <table class="tabela">
        <thead>
          <tr><th>Data / Hora</th><th>Destinatário</th><th>Tipo / Campanha</th><th>Mensagem Registrada</th><th style="width:90px;text-align:center">Status</th></tr>
        </thead>
        <tbody>
          ${envios.length ? envios.map(e => `
            <tr>
              <td class="mono">${dataBRfull(e.data || hoje())}</td>
              <td><b>${esc(e.cliente || '—')}</b><div class="mini">${esc(e.fone || '')}</div></td>
              <td><span class="selo">${esc(e.rotulo || e.tipo)}</span></td>
              <td style="font-size:12.5px;color:var(--aco-700)">${esc(e.texto)}</td>
              <td style="text-align:center"><span class="selo ${e.status === 'enviado' ? 'selo-finalizada' : 'selo-fila'}">${esc(e.status)}</span></td>
            </tr>
          `).join('') : `
            <tr><td colspan="5" style="text-align:center;padding:30px;color:var(--aco-400)">Nenhum envio registrado até o momento.</td></tr>
          `}
        </tbody>
      </table>
    </div>
  </div>`;
}

function folhaAPI() {
  const api = (S.zap && S.zap.api) || {};

  return `
  <div class="card card-p" style="max-width:550px;margin:0 auto">
    <div class="entre" style="border-bottom:1px solid var(--aco-150);padding-bottom:10px;margin-bottom:14px">
      <h3 style="font-size:17px;font-weight:700">Configuração de Gateway WhatsApp API</h3>
      <button class="btn-fechar" data-act="fechar">${ico('x', 18)}</button>
    </div>

    <div style="display:flex;flex-direction:column;gap:12px;font-size:13px">
      <div class="mini">
        Integre seu gateway (Evolution API, Z-API, Baileys ou Z-Stack) para permitir disparos de mensagens 100% automáticos sem abrir o navegador.
      </div>

      <div>
        <label style="font-weight:600;display:block;margin-bottom:4px">Endpoint / URL da API:</label>
        <input type="text" class="campo-texto" placeholder="https://api.seugateway.com/message/sendText" data-act="api-cfg" data-c="url" value="${esc(api.url || '')}" style="width:100%;height:34px">
      </div>

      <div>
        <label style="font-weight:600;display:block;margin-bottom:4px">Token de Autenticação / Bearer:</label>
        <input type="password" class="campo-texto" placeholder="Bearer eyJhbGciOi..." data-act="api-cfg" data-c="token" value="${esc(api.token || '')}" style="width:100%;height:34px">
      </div>
    </div>

    <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:18px;border-top:1px solid var(--aco-150);padding-top:12px">
      <button class="btn btn-primario" data-act="fechar">Salvar Configurações</button>
    </div>
  </div>`;
}

function folhaDisparo() {
  const d = S.ui.disparo;
  if (!d || !d.lista || d.ix >= d.lista.length) {
    return `<div class="card card-p">Disparo concluído! ${d ? d.enviados : 0} mensagens registradas.<br><br><button class="btn btn-primario" data-act="fechar-disparo">Concluir</button></div>`;
  }

  const cli = d.lista[d.ix];
  const textoPronto = preencher(d.texto, ctxCliente(cli));

  return `
  <div class="card card-p" style="max-width:550px;margin:0 auto">
    <div class="entre" style="border-bottom:1px solid var(--aco-150);padding-bottom:10px;margin-bottom:14px">
      <div>
        <h3 style="font-size:17px;font-weight:700">Disparo de Campanha (${d.ix + 1}/${d.lista.length})</h3>
        <div class="mini">Campanha: <b>${esc(d.nome)}</b></div>
      </div>
      <button class="btn-fechar" data-act="fechar-disparo">${ico('x', 18)}</button>
    </div>

    <div style="background:var(--aco-050);padding:12px;border-radius:8px;margin-bottom:14px;border:1px solid var(--aco-150)">
      <div><b>Destinatário:</b> ${esc(cli.nome)}</div>
      <div class="mini">Telefone: <b>${esc(cli.fone || 'Sem número')}</b></div>
    </div>

    <div style="font-weight:600;font-size:13px;margin-bottom:6px">Mensagem Personalizada:</div>
    <div style="background:var(--branco);border:1px solid var(--aco-200);padding:12px;border-radius:8px;font-size:13px;line-height:1.4;margin-bottom:16px;white-space:pre-wrap">
      ${esc(textoPronto)}
    </div>

    <div style="display:flex;justify-content:space-between;align-items:center">
      <button class="btn btn-secundario" data-act="disparo-pular">Pular Contato</button>
      <div style="display:flex;gap:8px">
        <a href="${linkZap(cli.fone, textoPronto)}" target="_blank" class="btn btn-sucesso" data-act="disparo-enviar" style="text-decoration:none;font-weight:600;padding:0 16px">
          ${ico('zap', 14)} Abrir e Enviar
        </a>
      </div>
    </div>
  </div>`;
}

function destinatarios(seg) {
  const lista = S.clientes || [];
  if (seg === 'frotistas') return lista.filter(c => c.doc && c.doc.length > 14);
  return lista;
}

function ctxCliente(cli) {
  return {
    nome: cli.contato || cli.fantasia || cli.nome,
    contato: cli.contato || cli.nome,
    empresa: S.cfg.empresa,
    placa: 'Veículo da Frota'
  };
}

function registrarEnvio(reg) {
  S.zap = S.zap || zapPadrao();
  S.zap.envios = S.zap.envios || [];
  S.zap.envios.unshift(Object.assign({ id: uid('en'), data: hoje() }, reg));
  salvar();
}

/* --- FILE: cadastros.js --- */
/* =====================================================================
   PÁTIO CRM — MÓDULO DE CADASTROS (CLIENTES, VEÍCULOS, SERVIÇOS & BOXES)
===================================================================== */

function viewCadastros() {
  const abas = [
    ['clientes', 'Clientes & Frotas (' + (S.clientes ? S.clientes.length : 0) + ')'],
    ['veiculos', 'Veículos / Caminhões (' + (S.veiculos ? S.veiculos.length : 0) + ')'],
    ['servicos', 'Tabela de Serviços (' + (S.servicos ? S.servicos.length : 0) + ')'],
    ['boxes', 'Boxes do Pátio (' + (S.boxes ? S.boxes.length : 0) + ')']
  ];
  const a = S.ui.abaCad || 'clientes';

  let corpo = '';
  if (a === 'clientes') corpo = tabelaClientes();
  else if (a === 'veiculos') corpo = tabelaVeiculos();
  else if (a === 'servicos') corpo = tabelaServicos();
  else corpo = tabelaBoxes();

  return `
  <div class="entre" style="margin-bottom:14px;flex-wrap:wrap;gap:8px">
    <div class="abas" style="margin:0">
      ${abas.map(([k, r]) => `<button data-act="aba-cad" data-k="${k}" aria-selected="${a === k}">${r}</button>`).join('')}
    </div>
    <div style="display:flex;gap:8px">
      ${a === 'clientes' ? `<button class="btn btn-primario" data-act="novo-cad" data-t="cliente">${ico('mais', 14)} Novo Cliente</button>` : ''}
      ${a === 'veiculos' ? `<button class="btn btn-primario" data-act="novo-cad" data-t="veiculo">${ico('mais', 14)} Novo Veículo</button>` : ''}
      ${a === 'servicos' ? `<button class="btn btn-primario" data-act="novo-cad" data-t="servico">${ico('mais', 14)} Novo Serviço</button>` : ''}
      ${a === 'boxes' ? `<button class="btn btn-primario" data-act="novo-cad" data-t="box">${ico('mais', 14)} Novo Box</button>` : ''}
    </div>
  </div>

  ${corpo}`;
}

/* ===== TABELA CLIENTES ===== */
function tabelaClientes() {
  const lista = S.clientes || [];

  return `
  <div class="card">
    <div class="tabela-responsiva">
      <table class="tabela">
        <thead>
          <tr>
            <th>Razão Social / Nome Fantasia</th>
            <th>CNPJ / CPF</th>
            <th>Contato & WhatsApp</th>
            <th>Cidade / UF</th>
            <th style="width:90px;text-align:center">Prazo</th>
            <th style="width:140px;text-align:center">Ações</th>
          </tr>
        </thead>
        <tbody>
          ${lista.map(c => `
            <tr style="${c.bloqueado ? 'background:rgba(239, 68, 68, 0.04)' : ''}">
              <td>
                <div style="font-weight:600;color:var(--aco-900)">${esc(c.nome)}</div>
                ${c.fantasia ? `<div class="mini">${esc(c.fantasia)}</div>` : ''}
              </td>
              <td class="mono">${esc(c.doc || '—')}</td>
              <td>
                <div>${esc(c.contato || '—')}</div>
                <div class="mini mono">${esc(c.fone || '—')}</div>
              </td>
              <td>${esc(c.cidade || '—')}${c.uf ? '/' + esc(c.uf) : ''}</td>
              <td style="text-align:center"><span class="selo">${c.prazo ? c.prazo + 'd' : 'À vista'}</span></td>
              <td style="text-align:center">
                <div style="display:inline-flex;gap:4px">
                  <button class="btn-icone" data-act="ver-cliente" data-id="${c.id}" title="Ficha do Cliente">${ico('doc', 14)}</button>
                  <button class="btn-icone" data-act="editar-cliente" data-id="${c.id}" title="Editar Dados">${ico('edit', 14)}</button>
                  <button class="btn-icone-perigo" data-act="excluir-cliente" data-id="${c.id}" title="Excluir">${ico('lixo', 14)}</button>
                </div>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  </div>`;
}

/* ===== TABELA VEÍCULOS ===== */
function tabelaVeiculos() {
  const lista = S.veiculos || [];

  return `
  <div class="card">
    <div class="tabela-responsiva">
      <table class="tabela">
        <thead>
          <tr>
            <th>Placa</th>
            <th>Marca & Modelo</th>
            <th>Proprietário / Cliente</th>
            <th>Tipo</th>
            <th style="width:110px;text-align:right">KM Registrado</th>
            <th style="width:110px;text-align:center">Ações</th>
          </tr>
        </thead>
        <tbody>
          ${lista.map(v => {
            const cl = C(v.cli);
            return `
            <tr>
              <td><span class="placa">${esc(v.placa)}</span></td>
              <td><b>${esc(v.marca ? v.marca + ' ' : '')}${esc(v.modelo)}</b><div class="mini">Ano: ${esc(v.ano || '—')}</div></td>
              <td>${esc(cl.nome)}</td>
              <td><span class="selo">${esc(v.tipo || 'Cavalo')}</span></td>
              <td style="text-align:right" class="num">${(v.km || 0).toLocaleString('pt-BR')} km</td>
              <td style="text-align:center">
                <button class="btn btn-secundario" data-act="ver-historico-veiculo" data-id="${v.id}" style="padding:4px 8px;font-size:12px">
                  ${ico('historico', 12)} Histórico
                </button>
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
  </div>`;
}

/* ===== TABELA SERVIÇOS ===== */
function tabelaServicos() {
  const lista = S.servicos || [];

  return `
  <div class="card">
    <div class="tabela-responsiva">
      <table class="tabela">
        <thead>
          <tr>
            <th>Descrição do Serviço</th>
            <th style="width:120px;text-align:center">Tempo Estimado</th>
            <th style="width:140px;text-align:right">Valor Tabelado</th>
          </tr>
        </thead>
        <tbody>
          ${lista.map(s => `
            <tr>
              <td><b>${esc(s.nome)}</b></td>
              <td style="text-align:center"><span class="selo">${s.horas || 1} horas</span></td>
              <td style="text-align:right;font-weight:700" class="num">${brl(s.valor)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  </div>`;
}

/* ===== TABELA BOXES ===== */
function tabelaBoxes() {
  const lista = S.boxes || [];

  return `
  <div class="card">
    <div class="tabela-responsiva">
      <table class="tabela">
        <thead>
          <tr>
            <th>Identificação do Box</th>
            <th>Especialidade</th>
            <th style="width:120px;text-align:center">Status Atual</th>
          </tr>
        </thead>
        <tbody>
          ${lista.map(b => {
            const osNoBox = (S.os || []).find(o => o.box === b.id && o.st !== 'finalizada');
            return `
            <tr>
              <td><b>${esc(b.nome)}</b></td>
              <td><span class="selo">${esc(b.tipo || 'Geral')}</span></td>
              <td style="text-align:center">
                <span class="selo ${osNoBox ? 'selo-executando' : 'selo-fila'}">
                  ${osNoBox ? `Ocupado (OS ${osNoBox.num})` : 'Livre'}
                </span>
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
  </div>`;
}

function folhaCliente() {
  const c = C(S.ui.cliAberto);
  if (!c) return '<div class="card card-p">Cliente não encontrado.</div>';

  const veiculosCli = (S.veiculos || []).filter(v => v.cli === c.id);
  const osCli = (S.os || []).filter(o => o.cli === c.id);
  const contasCli = (S.contas || []).filter(ct => ct.parte === c.nome);

  return `
  <div class="card card-p" style="max-width:650px;margin:0 auto">
    <div class="entre" style="border-bottom:1px solid var(--aco-150);padding-bottom:10px;margin-bottom:14px">
      <div>
        <h3 style="font-size:18px;font-weight:700">${esc(c.nome)}</h3>
        <div class="mini">CNPJ/CPF: <span class="mono">${esc(c.doc || '—')}</span> · Tel: <b>${esc(c.fone || '—')}</b></div>
      </div>
      <div style="display:flex;gap:6px">
        <button class="btn ${c.bloqueado ? 'btn-sucesso' : 'btn-perigo'}" data-act="bloquear-cliente" data-id="${c.id}" style="font-size:12px;padding:4px 10px">
          ${c.bloqueado ? 'Desbloquear' : 'Bloquear Crédito'}
        </button>
        <button class="btn-fechar" data-act="fechar">${ico('x', 18)}</button>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:14px">
      <div class="kpi bom" style="padding:10px;text-align:center">
        <div class="mini">Veículos Cadastrados</div>
        <div class="num" style="font-size:20px;font-weight:700;margin-top:4px">${veiculosCli.length}</div>
      </div>
      <div class="kpi neutro" style="padding:10px;text-align:center">
        <div class="mini">Total de OSs</div>
        <div class="num" style="font-size:20px;font-weight:700;margin-top:4px">${osCli.length}</div>
      </div>
      <div class="kpi aviso" style="padding:10px;text-align:center">
        <div class="mini">Prazo de Pagamento</div>
        <div class="num" style="font-size:20px;font-weight:700;margin-top:4px">${c.prazo ? c.prazo + ' dias' : 'À Vista'}</div>
      </div>
    </div>

    <div style="font-weight:700;font-size:14px;margin-bottom:8px">Veículos / Frota (${veiculosCli.length}):</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px">
      ${veiculosCli.map(v => `
        <span class="placa" style="padding:4px 10px;font-size:13px">${esc(v.placa)} — ${esc(v.modelo)}</span>
      `).join('') || '<div class="mini">Nenhum veículo vinculado.</div>'}
    </div>

    <div style="font-weight:700;font-size:14px;margin-bottom:8px">Endereço & Localização:</div>
    <div class="mini" style="font-size:13px;color:var(--aco-700);line-height:1.5">
      ${esc(c.endereco || '—')}${c.numero ? ', ' + esc(c.numero) : ''} · ${esc(c.bairro || '')}<br>
      ${esc(c.cidade || '—')}/${esc(c.uf || '')} · CEP: ${esc(c.cep || '—')}
    </div>
  </div>`;
}

function folhaCadastro() {
  const tipo = S.ui.cadTipo || 'cliente';
  const r = S.ui.rascCad = S.ui.rascCad || {};

  if (tipo === 'cliente') {
    return `
    <div class="card card-p" style="max-width:600px;margin:0 auto">
      <div class="entre" style="border-bottom:1px solid var(--aco-150);padding-bottom:10px;margin-bottom:14px">
        <h3 style="font-size:17px;font-weight:700">${r.id ? 'Editar Cliente' : 'Novo Cliente / Transportadora'}</h3>
        <button class="btn-fechar" data-act="fechar">${ico('x', 18)}</button>
      </div>

      <div style="display:flex;flex-direction:column;gap:12px;font-size:13px">
        <div>
          <label style="font-weight:600;display:block;margin-bottom:4px">Razão Social / Nome Completo:</label>
          <input type="text" class="campo-texto" placeholder="Ex: Transportes Rodoviários Silva Ltda" data-act="rc" data-c="nome" value="${esc(r.nome || '')}" style="width:100%;height:34px">
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <div>
            <label style="font-weight:600;display:block;margin-bottom:4px">Nome Fantasia:</label>
            <input type="text" class="campo-texto" placeholder="Ex: Silva Transportes" data-act="rc" data-c="fantasia" value="${esc(r.fantasia || '')}" style="width:100%;height:34px">
          </div>
          <div>
            <label style="font-weight:600;display:block;margin-bottom:4px">CNPJ / CPF:</label>
            <input type="text" class="campo-texto" placeholder="00.000.000/0000-00" data-act="rc" data-c="doc" value="${esc(r.doc || '')}" style="width:100%;height:34px">
          </div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px">
          <div>
            <label style="font-weight:600;display:block;margin-bottom:4px">WhatsApp / Telefone:</label>
            <input type="text" class="campo-texto" placeholder="(11) 98888-7777" data-act="rc" data-c="fone" value="${esc(r.fone || '')}" style="width:100%;height:34px">
          </div>
          <div>
            <label style="font-weight:600;display:block;margin-bottom:4px">Contato Responsável:</label>
            <input type="text" class="campo-texto" placeholder="Ex: Carlos (Gerente Frota)" data-act="rc" data-c="contato" value="${esc(r.contato || '')}" style="width:100%;height:34px">
          </div>
          <div>
            <label style="font-weight:600;display:block;margin-bottom:4px">Prazo Padrão (Dias):</label>
            <input type="number" class="campo-texto" placeholder="28" data-act="rc" data-c="prazo" value="${r.prazo || 0}" style="width:100%;height:34px">
          </div>
        </div>

        <div style="display:grid;grid-template-columns:140px 1fr;gap:10px">
          <div>
            <label style="font-weight:600;display:block;margin-bottom:4px">CEP:</label>
            <input type="text" class="campo-texto" placeholder="00000-000" data-act="rc" data-c="cep" value="${esc(r.cep || '')}" style="width:100%;height:34px">
          </div>
          <div>
            <label style="font-weight:600;display:block;margin-bottom:4px">Logradouro / Endereço:</label>
            <input type="text" class="campo-texto" placeholder="Av. Principal, 1000" data-act="rc" data-c="endereco" value="${esc(r.endereco || '')}" style="width:100%;height:34px">
          </div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <div>
            <label style="font-weight:600;display:block;margin-bottom:4px">Cidade:</label>
            <input type="text" class="campo-texto" placeholder="Campinas" data-act="rc" data-c="cidade" value="${esc(r.cidade || '')}" style="width:100%;height:34px">
          </div>
          <div>
            <label style="font-weight:600;display:block;margin-bottom:4px">UF:</label>
            <input type="text" class="campo-texto" placeholder="SP" data-act="rc" data-c="uf" value="${esc(r.uf || '')}" style="width:100%;height:34px;text-transform:uppercase">
          </div>
        </div>
      </div>

      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:18px;border-top:1px solid var(--aco-150);padding-top:12px">
        <button class="btn btn-secundario" data-act="fechar">Cancelar</button>
        <button class="btn btn-primario" data-act="salvar-cad" style="font-weight:600;padding:0 18px">
          ${ico('check', 14)} Salvar Cliente
        </button>
      </div>
    </div>`;
  }

  if (tipo === 'servico') {
    return `
    <div class="card card-p" style="max-width:480px;margin:0 auto">
      <div class="entre" style="border-bottom:1px solid var(--aco-150);padding-bottom:10px;margin-bottom:14px">
        <h3 style="font-size:17px;font-weight:700">Novo Serviço na Tabela</h3>
        <button class="btn-fechar" data-act="fechar">${ico('x', 18)}</button>
      </div>

      <div style="display:flex;flex-direction:column;gap:12px;font-size:13px">
        <div>
          <label style="font-weight:600;display:block;margin-bottom:4px">Descrição do Serviço:</label>
          <input type="text" class="campo-texto" placeholder="Ex: Troca de Tambor e Lona de Freio" data-act="rc" data-c="nome" value="${esc(r.nome || '')}" style="width:100%;height:34px">
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <div>
            <label style="font-weight:600;display:block;margin-bottom:4px">Valor Mão de Obra (R$):</label>
            <input type="number" class="campo-texto" placeholder="0.00" data-act="rc" data-c="valor" value="${r.valor || ''}" step="0.50" style="width:100%;height:34px;font-weight:700">
          </div>
          <div>
            <label style="font-weight:600;display:block;margin-bottom:4px">Horas Estimadas:</label>
            <input type="number" class="campo-texto" placeholder="2.0" data-act="rc" data-c="horas" value="${r.horas || 1}" step="0.5" style="width:100%;height:34px">
          </div>
        </div>
      </div>

      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:18px;border-top:1px solid var(--aco-150);padding-top:12px">
        <button class="btn btn-secundario" data-act="fechar">Cancelar</button>
        <button class="btn btn-primario" data-act="salvar-cad">Salvar Serviço</button>
      </div>
    </div>`;
  }

  if (tipo === 'box') {
    return `
    <div class="card card-p" style="max-width:450px;margin:0 auto">
      <div class="entre" style="border-bottom:1px solid var(--aco-150);padding-bottom:10px;margin-bottom:14px">
        <h3 style="font-size:17px;font-weight:700">Novo Box de Atendimento</h3>
        <button class="btn-fechar" data-act="fechar">${ico('x', 18)}</button>
      </div>

      <div style="display:flex;flex-direction:column;gap:12px;font-size:13px">
        <div>
          <label style="font-weight:600;display:block;margin-bottom:4px">Nome / Identificação:</label>
          <input type="text" class="campo-texto" placeholder="Ex: Box 07 — Lavador / Lubrificação" data-act="rc" data-c="nome" value="${esc(r.nome || '')}" style="width:100%;height:34px">
        </div>
        <div>
          <label style="font-weight:600;display:block;margin-bottom:4px">Especialidade:</label>
          <input type="text" class="campo-texto" placeholder="Ex: Mecânica Geral / Freios" data-act="rc" data-c="tipo" value="${esc(r.tipo || '')}" style="width:100%;height:34px">
        </div>
      </div>

      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:18px;border-top:1px solid var(--aco-150);padding-top:12px">
        <button class="btn btn-secundario" data-act="fechar">Cancelar</button>
        <button class="btn btn-primario" data-act="salvar-cad">Salvar Box</button>
      </div>
    </div>`;
  }

  return '';
}

/* --- FILE: relatorios.js --- */
/* =====================================================================
   PÁTIO CRM — MÓDULO DE RELATÓRIOS EXECUTIVOS, BI, EXPORTAÇÕES & BACKUP
   Design corporativo de alta precisão para gestão de oficinas pesadas
===================================================================== */

// Estado interno dos filtros de relatório
let relState = {
  periodo: 'mes', // 'hoje', '7d', 'mes', 'mes_ant', 'ano', 'custom'
  dIni: hoje().slice(0, 7) + '-01',
  dFim: hoje(),
  tipo: 'executivo' // 'executivo', 'os', 'estoque', 'financeiro', 'mecanicos'
};

let chartEvolucaoInstance = null;
let chartComposicaoInstance = null;

/* ---------------- Utilitário de Filtro de Datas ---------------- */
function setPeriodoRelatorio(p) {
  relState.periodo = p;
  const dH = hoje();
  const ano = dH.slice(0, 4);
  const mes = parseInt(dH.slice(5, 7), 10);

  if (p === 'hoje') {
    relState.dIni = dH;
    relState.dFim = dH;
  } else if (p === '7d') {
    relState.dIni = addDias(dH, -7);
    relState.dFim = dH;
  } else if (p === 'mes') {
    relState.dIni = `${ano}-${String(mes).padStart(2, '0')}-01`;
    relState.dFim = dH;
  } else if (p === 'mes_ant') {
    const mesAnt = mes === 1 ? 12 : mes - 1;
    const anoAnt = mes === 1 ? parseInt(ano, 10) - 1 : ano;
    const ultimoDia = new Date(anoAnt, mesAnt, 0).getDate();
    relState.dIni = `${anoAnt}-${String(mesAnt).padStart(2, '0')}-01`;
    relState.dFim = `${anoAnt}-${String(mesAnt).padStart(2, '0')}-${String(ultimoDia).padStart(2, '0')}`;
  } else if (p === 'ano') {
    relState.dIni = `${ano}-01-01`;
    relState.dFim = dH;
  }
  render();
}

/* ---------------- Processamento de Dados & Métricas ---------------- */
function calcularMetricasRelatorio() {
  const dIni = relState.dIni;
  const dFim = relState.dFim;

  // Filtrar Ordens de Serviço do período
  const todasOS = S.os || [];
  const osPeriodo = todasOS.filter(o => {
    const dt = o.fechamento || o.abertura;
    return dt >= dIni && dt <= dFim;
  });

  const osFinalizadas = osPeriodo.filter(o => o.st === 'finalizada');

  let totFaturamento = 0;
  let totServicos = 0;
  let totPecas = 0;
  let totCustoPecas = 0;
  let totDescontos = 0;

  osPeriodo.forEach(o => {
    const srv = soma(o.servicos, i => (i.qtd || 1) * (i.valor || 0));
    const pec = soma(o.pecas, i => (i.qtd || 1) * (i.valor || 0));
    
    // Custo estimado das peças
    const custoPec = soma(o.pecas, i => {
      const pOrig = (S.pecas || []).find(p => p.id === i.id || p.cod === i.cod);
      return (i.qtd || 1) * (pOrig ? pOrig.custo : (i.valor || 0) * 0.55);
    });

    totServicos += srv;
    totPecas += pec;
    totCustoPecas += custoPec;
    totDescontos += (o.desc || 0);
    totFaturamento += Math.max(0, srv + pec - (o.desc || 0));
  });

  const lucroBruto = Math.max(0, totFaturamento - totCustoPecas);
  const margemLucro = totFaturamento > 0 ? (lucroBruto / totFaturamento) * 100 : 0;
  const ticketMedio = osPeriodo.length > 0 ? totFaturamento / osPeriodo.length : 0;

  // Filtrar Movimentações Financeiras
  const movsPeriodo = (S.movimentos || []).filter(m => m.data >= dIni && m.data <= dFim);
  const entradasFinanceiras = soma(movsPeriodo.filter(m => m.tipo === 'entrada'), m => m.valor);
  const saidasFinanceiras = soma(movsPeriodo.filter(m => m.tipo === 'saida'), m => m.valor);
  const resultadoFinanceiro = entradasFinanceiras - saidasFinanceiras;

  // Produtividade por Mecânico
  const mecanicosStats = {};
  (S.mecanicos || []).forEach(m => {
    mecanicosStats[m.nome] = { nome: m.nome, totalOS: 0, faturamento: 0, comissao: 0 };
  });

  osPeriodo.forEach(o => {
    if (o.mec) {
      if (!mecanicosStats[o.mec]) {
        mecanicosStats[o.mec] = { nome: o.mec, totalOS: 0, faturamento: 0, comissao: 0 };
      }
      const valorOS = totOS(o);
      const servOS = soma(o.servicos, i => (i.qtd || 1) * (i.valor || 0));
      mecanicosStats[o.mec].totalOS += 1;
      mecanicosStats[o.mec].faturamento += valorOS;
      mecanicosStats[o.mec].comissao += servOS * 0.10; // 10% de comissão padrão sobre MO
    }
  });

  return {
    osPeriodo,
    osFinalizadas,
    totFaturamento,
    totServicos,
    totPecas,
    totCustoPecas,
    lucroBruto,
    margemLucro,
    ticketMedio,
    totDescontos,
    entradasFinanceiras,
    saidasFinanceiras,
    resultadoFinanceiro,
    mecanicosStats: Object.values(mecanicosStats).sort((a, b) => b.faturamento - a.faturamento)
  };
}

/* =====================================================================
   RENDERIZAÇÃO DA VIEW PRINCIPAL DE RELATÓRIOS
===================================================================== */
function viewRelatorios() {
  const m = calcularMetricasRelatorio();

  return `
  <!-- Barra Superior de Controle & Filtros Executivos -->
  <div class="rel-toolbar">
    <div class="rel-periodos">
      <span style="font-weight:700;font-size:13px;color:var(--aco-800);margin-right:6px">Período:</span>
      <button class="rel-btn-periodo ${relState.periodo === 'hoje' ? 'ativo' : ''}" data-act="mudar-periodo-rel" data-p="hoje">Hoje</button>
      <button class="rel-btn-periodo ${relState.periodo === '7d' ? 'ativo' : ''}" data-act="mudar-periodo-rel" data-p="7d">Últimos 7 dias</button>
      <button class="rel-btn-periodo ${relState.periodo === 'mes' ? 'ativo' : ''}" data-act="mudar-periodo-rel" data-p="mes">Este Mês</button>
      <button class="rel-btn-periodo ${relState.periodo === 'mes_ant' ? 'ativo' : ''}" data-act="mudar-periodo-rel" data-p="mes_ant">Mês Anterior</button>
      <button class="rel-btn-periodo ${relState.periodo === 'ano' ? 'ativo' : ''}" data-act="mudar-periodo-rel" data-p="ano">Ano (${hoje().slice(0, 4)})</button>
      
      <div class="rel-datas-custom" style="margin-left:8px">
        <input type="date" id="rel-dt-ini" value="${relState.dIni}" onchange="relState.dIni=this.value;relState.periodo='custom';render();">
        <span style="color:var(--aco-400)">até</span>
        <input type="date" id="rel-dt-fim" value="${relState.dFim}" onchange="relState.dFim=this.value;relState.periodo='custom';render();">
      </div>
    </div>

    <div class="rel-acoes-topo">
      <button class="btn btn-primario" data-act="imprimir-relatorio-executivo" style="display:inline-flex;align-items:center;gap:6px;font-size:12.5px;padding:7px 14px;box-shadow:0 2px 6px rgba(37,99,235,0.3)">
        ${ico('imprimir', 15)} Imprimir / PDF Executivo
      </button>
      <button class="btn btn-secundario" data-act="exportar-relatorio-html" style="display:inline-flex;align-items:center;gap:6px;font-size:12.5px;padding:7px 14px">
        ${ico('download', 15)} Exportar HTML
      </button>
      <button class="btn btn-secundario" data-act="compartilhar-whatsapp-relatorio" style="display:inline-flex;align-items:center;gap:6px;font-size:12.5px;padding:7px 14px;color:#16a34a;border-color:#bbf7d0">
        ${ico('zap', 15)} Enviar p/ WhatsApp
      </button>
    </div>
  </div>

  <!-- Cards de KPIs Executivos com Formatação Premium -->
  <div class="kpi-exec-grid">
    <div class="kpi-exec-card">
      <div class="kpi-exec-header">
        <span class="kpi-exec-titulo">Faturamento Total</span>
        <div class="kpi-exec-ico">${ico('fin', 15)}</div>
      </div>
      <div class="kpi-exec-valor">${brl(m.totFaturamento)}</div>
      <div class="kpi-exec-sub">
        <span><b>${m.osPeriodo.length}</b> Ordens no período</span>
      </div>
    </div>

    <div class="kpi-exec-card verde">
      <div class="kpi-exec-header">
        <span class="kpi-exec-titulo">Lucro Bruto Estimado</span>
        <div class="kpi-exec-ico" style="color:var(--verde);background:var(--verde-fraco)">${ico('ok', 15)}</div>
      </div>
      <div class="kpi-exec-valor" style="color:var(--verde)">${brl(m.lucroBruto)}</div>
      <div class="kpi-exec-sub">
        <span>Margem Operacional: <b>${m.margemLucro.toFixed(1)}%</b></span>
      </div>
    </div>

    <div class="kpi-exec-card sinal">
      <div class="kpi-exec-header">
        <span class="kpi-exec-titulo">Ticket Médio por OS</span>
        <div class="kpi-exec-ico" style="color:var(--sinal);background:var(--sinal-fraco)">${ico('patio', 15)}</div>
      </div>
      <div class="kpi-exec-valor">${brl(m.ticketMedio)}</div>
      <div class="kpi-exec-sub">
        <span><b>${m.osFinalizadas.length}</b> OSs finalizadas</span>
      </div>
    </div>

    <div class="kpi-exec-card ardosia">
      <div class="kpi-exec-header">
        <span class="kpi-exec-titulo">Serviços x Peças</span>
        <div class="kpi-exec-ico" style="color:var(--ardosia);background:var(--ardosia-fraco)">${ico('pecas', 15)}</div>
      </div>
      <div class="kpi-exec-valor" style="font-size:17px">
        <span style="color:var(--petroleo)">${brl(m.totServicos)}</span> / <span style="color:var(--ardosia)">${brl(m.totPecas)}</span>
      </div>
      <div class="kpi-exec-sub">
        <span>M.O.: <b>${m.totFaturamento > 0 ? ((m.totServicos / m.totFaturamento) * 100).toFixed(0) : 0}%</b> | Peças: <b>${m.totFaturamento > 0 ? ((m.totPecas / m.totFaturamento) * 100).toFixed(0) : 0}%</b></span>
      </div>
    </div>
  </div>

  <!-- Painel de Gráficos BI Interativos (Chart.js) -->
  <div class="rel-grid-charts">
    <div class="rel-chart-card">
      <div class="rel-chart-header">
        <div class="rel-chart-title">Evolução do Faturamento & Serviços</div>
        <span class="mini" style="color:var(--aco-500)">Valores diários no intervalo</span>
      </div>
      <div class="rel-chart-container">
        <canvas id="relChartEvolucao"></canvas>
      </div>
    </div>

    <div class="rel-chart-card">
      <div class="rel-chart-header">
        <div class="rel-chart-title">Composição da Receita (Mão de Obra vs Peças)</div>
        <span class="mini" style="color:var(--aco-500)">Distribuição percentual</span>
      </div>
      <div class="rel-chart-container">
        <canvas id="relChartComposicao"></canvas>
      </div>
    </div>
  </div>

  <!-- Tabela Analítica Executiva de Ordens de Serviço -->
  <div class="rel-tabela-wrap">
    <div class="entre" style="margin-bottom:14px">
      <div>
        <div style="font-weight:700;font-size:16px;color:var(--aco-900)">Detalhamento Analítico de Ordens de Serviço</div>
        <div class="mini">Exibindo movimentações de ${dataBRfull(relState.dIni)} até ${dataBRfull(relState.dFim)}</div>
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-secundario" data-act="exportar-csv" data-tipo="os" style="font-size:12px;padding:6px 12px">
          ${ico('download', 14)} Exportar Planilha Excel (.CSV)
        </button>
      </div>
    </div>

    <div style="overflow-x:auto">
      <table class="tabela-executiva">
        <thead>
          <tr>
            <th>Nº OS</th>
            <th>Data</th>
            <th>Status</th>
            <th>Placa / Veículo</th>
            <th>Cliente</th>
            <th>Mecânico</th>
            <th style="text-align:right">Serviços</th>
            <th style="text-align:right">Peças</th>
            <th style="text-align:right">Desconto</th>
            <th style="text-align:right">Total Líquido</th>
          </tr>
        </thead>
        <tbody>
          ${m.osPeriodo.map(o => {
            const v = V(o.vei), c = C(o.cli);
            const totServ = soma(o.servicos, i => (i.qtd || 1) * (i.valor || 0));
            const totPec = soma(o.pecas, i => (i.qtd || 1) * (i.valor || 0));
            const total = totOS(o);
            return `
            <tr>
              <td><span class="tag-os">#${o.num}</span></td>
              <td class="mono" style="font-size:12px">${dataBR(o.fechamento || o.abertura)}</td>
              <td><span class="selo ${ST[o.st]?.badge || 'selo-fila'}">${ST[o.st]?.r || o.st}</span></td>
              <td><b>${v.placa}</b> <span class="mini" style="color:var(--aco-500)">${esc(v.modelo)}</span></td>
              <td>${esc(c.nome)}</td>
              <td><span style="font-size:12px;color:var(--aco-700)">${esc(o.mec || '—')}</span></td>
              <td class="mono" style="text-align:right">${brl(totServ)}</td>
              <td class="mono" style="text-align:right">${brl(totPec)}</td>
              <td class="mono" style="text-align:right;color:var(--tijolo)">${o.desc ? '-' + brl(o.desc) : '—'}</td>
              <td class="mono" style="text-align:right;font-weight:700;color:var(--aco-900)">${brl(total)}</td>
            </tr>`;
          }).join('') || `<tr><td colspan="10" style="text-align:center;padding:30px;color:var(--aco-400)">Nenhuma Ordem de Serviço encontrada no período selecionado.</td></tr>`}
        </tbody>
        ${m.osPeriodo.length > 0 ? `
        <tfoot>
          <tr>
            <td colspan="6">TOTAL CONSOLIDADO DO PERÍODO (${m.osPeriodo.length} OSs)</td>
            <td class="mono" style="text-align:right">${brl(m.totServicos)}</td>
            <td class="mono" style="text-align:right">${brl(m.totPecas)}</td>
            <td class="mono" style="text-align:right;color:var(--tijolo)">-${brl(m.totDescontos)}</td>
            <td class="mono" style="text-align:right;color:var(--petroleo);font-size:14.5px">${brl(m.totFaturamento)}</td>
          </tr>
        </tfoot>` : ''}
      </table>
    </div>
  </div>

  <!-- Bloco Inferior: Produtividade da Equipe & Exportações de Dados -->
  <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(320px, 1fr));gap:16px;margin-bottom:20px">
    <!-- Ranking de Mecânicos -->
    <div class="card card-p">
      <div style="font-weight:700;font-size:15px;color:var(--aco-900);margin-bottom:4px">Produtividade dos Mecânicos</div>
      <div class="mini" style="margin-bottom:12px">Faturamento gerado e comissão estimada (10% MO)</div>
      
      <table class="tabela" style="width:100%">
        <thead>
          <tr>
            <th>Mecânico</th>
            <th style="text-align:center">OSs</th>
            <th style="text-align:right">Faturamento</th>
            <th style="text-align:right">Comissão</th>
          </tr>
        </thead>
        <tbody>
          ${m.mecanicosStats.map(mec => `
            <tr>
              <td><b>${esc(mec.nome)}</b></td>
              <td style="text-align:center">${mec.totalOS}</td>
              <td class="mono" style="text-align:right;font-weight:600">${brl(mec.faturamento)}</td>
              <td class="mono" style="text-align:right;color:var(--verde);font-weight:600">${brl(mec.comissao)}</td>
            </tr>
          `).join('') || '<tr><td colspan="4" style="text-align:center">Nenhum mecânico registrado</td></tr>'}
        </tbody>
      </table>
    </div>

    <!-- Central de Backups & Exportações em Lote -->
    <div class="card card-p">
      <div style="font-weight:700;font-size:15px;color:var(--aco-900);margin-bottom:4px">Outras Exportações & Backups</div>
      <div class="mini" style="margin-bottom:14px">Download de planilhas e integridade de dados</div>

      <div style="display:flex;flex-direction:column;gap:8px">
        <div class="entre" style="padding:8px 12px;background:var(--aco-050);border-radius:8px">
          <div>
            <b>Posição Atual de Estoque</b>
            <div class="mini">${(S.pecas || []).length} itens no almoxarifado</div>
          </div>
          <button class="btn btn-secundario" data-act="exportar-csv" data-tipo="pecas" style="font-size:11.5px;padding:5px 10px">
            ${ico('download', 13)} CSV Peças
          </button>
        </div>

        <div class="entre" style="padding:8px 12px;background:var(--aco-050);border-radius:8px">
          <div>
            <b>Extrato Financeiro Completo</b>
            <div class="mini">${(S.movimentos || []).length} movimentações de caixa</div>
          </div>
          <button class="btn btn-secundario" data-act="exportar-csv" data-tipo="financeiro" style="font-size:11.5px;padding:5px 10px">
            ${ico('download', 13)} CSV Caixa
          </button>
        </div>

        <div class="entre" style="padding:8px 12px;background:var(--aco-050);border-radius:8px">
          <div>
            <b>Backup Geral do Sistema (.JSON)</b>
            <div class="mini">Cópia offline de todas as tabelas</div>
          </div>
          <button class="btn btn-secundario" data-act="exportar-backup-json" style="font-size:11.5px;padding:5px 10px">
            ${ico('download', 13)} Baixar Backup
          </button>
        </div>
      </div>
    </div>
  </div>`;
}

/* =====================================================================
   INICIALIZAÇÃO & CICLO DE VIDA DOS GRÁFICOS (Chart.js)
===================================================================== */
function initRelatoriosCharts() {
  if (typeof Chart === 'undefined') return;

  const ctxEvolucao = document.getElementById('relChartEvolucao');
  const ctxComposicao = document.getElementById('relChartComposicao');

  if (!ctxEvolucao || !ctxComposicao) return;

  // Destruir instâncias antigas para evitar sobreposição
  if (chartEvolucaoInstance) { chartEvolucaoInstance.destroy(); chartEvolucaoInstance = null; }
  if (chartComposicaoInstance) { chartComposicaoInstance.destroy(); chartComposicaoInstance = null; }

  const m = calcularMetricasRelatorio();

  // 1. Agrupar faturamento por dia no período
  const diasMap = {};
  m.osPeriodo.forEach(o => {
    const dt = dataBR(o.fechamento || o.abertura);
    if (!diasMap[dt]) diasMap[dt] = { servicos: 0, pecas: 0, total: 0 };
    const totServ = soma(o.servicos, i => (i.qtd || 1) * (i.valor || 0));
    const totPec = soma(o.pecas, i => (i.qtd || 1) * (i.valor || 0));
    diasMap[dt].servicos += totServ;
    diasMap[dt].pecas += totPec;
    diasMap[dt].total += totOS(o);
  });

  const labelsDias = Object.keys(diasMap);
  const dataTotal = labelsDias.map(d => diasMap[d].total);
  const dataServicos = labelsDias.map(d => diasMap[d].servicos);

  // Criar Gráfico de Evolução (Linha com preenchimento suave)
  chartEvolucaoInstance = new Chart(ctxEvolucao, {
    type: 'bar',
    data: {
      labels: labelsDias.length > 0 ? labelsDias : ['Sem dados'],
      datasets: [
        {
          label: 'Faturamento Total (R$)',
          data: dataTotal.length > 0 ? dataTotal : [0],
          backgroundColor: 'rgba(37, 99, 235, 0.85)',
          borderRadius: 6
        },
        {
          label: 'Mão de Obra / Serviços (R$)',
          data: dataServicos.length > 0 ? dataServicos : [0],
          backgroundColor: 'rgba(16, 185, 129, 0.85)',
          borderRadius: 6
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11.5, family: 'system-ui' } } }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            callback: (val) => 'R$ ' + (val >= 1000 ? (val / 1000).toFixed(0) + 'k' : val),
            font: { size: 10.5 }
          },
          grid: { color: 'rgba(226, 232, 240, 0.6)' }
        },
        x: { grid: { display: false }, ticks: { font: { size: 10.5 } } }
      }
    }
  });

  // Criar Gráfico de Composição (Doughnut)
  chartComposicaoInstance = new Chart(ctxComposicao, {
    type: 'doughnut',
    data: {
      labels: ['Mão de Obra (Serviços)', 'Peças / Materiais'],
      datasets: [{
        data: [m.totServicos || 1, m.totPecas || 1],
        backgroundColor: ['#2563eb', '#8b5cf6'],
        borderWidth: 2,
        borderColor: '#ffffff',
        hoverOffset: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11.5, family: 'system-ui' } } },
        tooltip: {
          callbacks: {
            label: (item) => ` ${item.label}: ${brl(item.raw)}`
          }
        }
      },
      cutout: '68%'
    }
  });
}

/* =====================================================================
   IMPRESSÃO & GERAÇÃO DE RELATÓRIO PDF EXECUTIVO (A4 PROFISSIONAL)
===================================================================== */
function imprimirRelatorioExecutivo() {
  const m = calcularMetricasRelatorio();
  const dH = hoje();
  
  // Obter imagem base64 do gráfico se disponível
  let imgChartEvolucao = '';
  let imgChartComposicao = '';
  try {
    if (chartEvolucaoInstance) imgChartEvolucao = chartEvolucaoInstance.toBase64Image();
    if (chartComposicaoInstance) imgChartComposicao = chartComposicaoInstance.toBase64Image();
  } catch (e) {
    console.warn('Erro ao converter gráficos para imagem:', e);
  }

  const janela = window.open('', '_blank');
  if (!janela) {
    torrar('Por favor, permita pop-ups no seu navegador para imprimir.');
    return;
  }

  janela.document.write(`
  <!DOCTYPE html>
  <html lang="pt-BR">
  <head>
    <meta charset="utf-8">
    <title>Relatório Executivo — ${esc(S.cfg.empresa)}</title>
    <style>
      @page { size: A4; margin: 1.2cm; }
      body {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        color: #0f172a; background: #fff; font-size: 11.5px; line-height: 1.4; margin: 0; padding: 0;
      }
      .cabecalho {
        display: flex; justify-content: space-between; align-items: flex-start;
        border-bottom: 2px solid #0f172a; padding-bottom: 12px; margin-bottom: 16px;
      }
      .marca-titulo { font-size: 20px; font-weight: 800; color: #0f172a; letter-spacing: -0.02em; }
      .marca-sub { font-size: 11px; color: #64748b; font-weight: 500; margin-top: 2px; }
      .meta-doc { text-align: right; font-size: 11px; color: #334155; }
      
      .grid-kpis {
        display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 16px;
      }
      .kpi-box {
        background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; padding: 10px; text-align: center;
      }
      .kpi-tit { font-size: 10px; font-weight: 700; text-transform: uppercase; color: #64748b; margin-bottom: 4px; }
      .kpi-val { font-size: 16px; font-weight: 800; color: #0f172a; }

      .secao-titulo {
        font-size: 13px; font-weight: 700; color: #0f172a; text-transform: uppercase;
        border-left: 4px solid #2563eb; padding-left: 6px; margin: 16px 0 8px;
      }
      
      .graficos-box {
        display: flex; gap: 14px; margin-bottom: 16px; page-break-inside: avoid;
      }
      .grafico-item {
        flex: 1; border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px; text-align: center;
      }
      .grafico-item img { max-width: 100%; height: 160px; object-fit: contain; }

      table { width: 100%; border-collapse: collapse; margin-bottom: 16px; font-size: 10.5px; }
      th { background: #f1f5f9; text-align: left; padding: 6px 8px; border-bottom: 2px solid #cbd5e1; font-weight: 700; }
      td { padding: 5px 8px; border-bottom: 1px solid #e2e8f0; }
      tfoot td { font-weight: 700; background: #f8fafc; border-top: 2px solid #94a3b8; font-size: 11px; }

      .assinaturas {
        margin-top: 35px; display: flex; justify-content: space-between; page-break-inside: avoid;
      }
      .campo-ass {
        width: 45%; text-align: center; border-top: 1px solid #475569; padding-top: 4px; font-size: 10.5px;
      }
      .rodape-doc {
        text-align: center; font-size: 9.5px; color: #94a3b8; margin-top: 25px; border-top: 1px solid #e2e8f0; padding-top: 8px;
      }
    </style>
  </head>
  <body>
    <div class="cabecalho">
      <div>
        <div class="marca-titulo">${esc(S.cfg.empresa)}</div>
        <div class="marca-sub">SISTEMA PÁTIO CRM — RELATÓRIO EXECUTIVO GERENCIAL</div>
        <div style="font-size:10.5px;color:#475569;margin-top:4px">CNPJ: ${esc(S.cfg.cnpj || 'Não informado')} | Tel: ${esc(S.cfg.fone || 'Não informado')}</div>
      </div>
      <div class="meta-doc">
        <div><b>Período:</b> ${dataBRfull(relState.dIni)} a ${dataBRfull(relState.dFim)}</div>
        <div><b>Emissão:</b> ${dataBRfull(dH)} às ${horaBR()}</div>
        <div><b>Responsável:</b> Gestão Operacional</div>
      </div>
    </div>

    <!-- Indicadores Principais -->
    <div class="grid-kpis">
      <div class="kpi-box">
        <div class="kpi-tit">Faturamento Bruto</div>
        <div class="kpi-val" style="color:#2563eb">${brl(m.totFaturamento)}</div>
      </div>
      <div class="kpi-box">
        <div class="kpi-tit">Lucro Bruto Estimado</div>
        <div class="kpi-val" style="color:#10b981">${brl(m.lucroBruto)}</div>
      </div>
      <div class="kpi-box">
        <div class="kpi-tit">Margem Operacional</div>
        <div class="kpi-val">${m.margemLucro.toFixed(1)}%</div>
      </div>
      <div class="kpi-box">
        <div class="kpi-tit">Total de OSs</div>
        <div class="kpi-val">${m.osPeriodo.length}</div>
      </div>
    </div>

    <!-- Gráficos no PDF -->
    ${imgChartEvolucao || imgChartComposicao ? `
    <div class="secao-titulo">Análise Gráfica & Desempenho</div>
    <div class="graficos-box">
      ${imgChartEvolucao ? `<div class="grafico-item"><div style="font-weight:bold;margin-bottom:4px;font-size:10px">Evolução de Faturamento</div><img src="${imgChartEvolucao}"></div>` : ''}
      ${imgChartComposicao ? `<div class="grafico-item"><div style="font-weight:bold;margin-bottom:4px;font-size:10px">Composição (MO x Peças)</div><img src="${imgChartComposicao}"></div>` : ''}
    </div>` : ''}

    <!-- Tabela Analítica de Ordens de Serviço -->
    <div class="secao-titulo">Detalhamento de Ordens de Serviço (${m.osPeriodo.length})</div>
    <table>
      <thead>
        <tr>
          <th>OS</th>
          <th>Data</th>
          <th>Status</th>
          <th>Placa / Veículo</th>
          <th>Cliente</th>
          <th>Mecânico</th>
          <th style="text-align:right">Serviços</th>
          <th style="text-align:right">Peças</th>
          <th style="text-align:right">Total</th>
        </tr>
      </thead>
      <tbody>
        ${m.osPeriodo.map(o => {
          const v = V(o.vei), c = C(o.cli);
          const totServ = soma(o.servicos, i => (i.qtd || 1) * (i.valor || 0));
          const totPec = soma(o.pecas, i => (i.qtd || 1) * (i.valor || 0));
          return `
          <tr>
            <td>#${o.num}</td>
            <td>${dataBR(o.fechamento || o.abertura)}</td>
            <td>${ST[o.st]?.r || o.st}</td>
            <td><b>${v.placa}</b> ${esc(v.modelo)}</td>
            <td>${esc(c.nome)}</td>
            <td>${esc(o.mec || '—')}</td>
            <td style="text-align:right">${brl(totServ)}</td>
            <td style="text-align:right">${brl(totPec)}</td>
            <td style="text-align:right;font-weight:bold">${brl(totOS(o))}</td>
          </tr>`;
        }).join('') || '<tr><td colspan="9" style="text-align:center">Nenhuma OS encontrada no período</td></tr>'}
      </tbody>
      <tfoot>
        <tr>
          <td colspan="6">TOTAL CONSOLIDADO</td>
          <td style="text-align:right">${brl(m.totServicos)}</td>
          <td style="text-align:right">${brl(m.totPecas)}</td>
          <td style="text-align:right">${brl(m.totFaturamento)}</td>
        </tr>
      </tfoot>
    </table>

    <!-- Assinaturas de Conferência -->
    <div class="assinaturas">
      <div class="campo-ass">
        <b>${esc(S.cfg.empresa)}</b><br>
        Gerência / Diretoria Operacional
      </div>
      <div class="campo-ass">
        <b>Responsável Financeiro</b><br>
        Conferência e Fechamento
      </div>
    </div>

    <div class="rodape-doc">
      Documento gerado automaticamente pelo Sistema Pátio CRM em ${dataBRfull(dH)} às ${horaBR()}. Autenticidade garantida pela base local.
    </div>

    <script>
      window.onload = function() {
        setTimeout(function() { window.print(); }, 400);
      };
    </script>
  </body>
  </html>`);

  janela.document.close();
}

/* =====================================================================
   EXPORTAÇÃO EM FORMATO HTML STANDALONE (RELATÓRIO PORTÁTIL)
===================================================================== */
function exportarRelatorioHTML() {
  const m = calcularMetricasRelatorio();
  const dH = hoje();
  const nomeArquivo = `relatorio_executivo_${relState.dIni}_a_${relState.dFim}.html`;

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <title>Relatório Executivo — ${esc(S.cfg.empresa)}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; background: #f8fafc; color: #0f172a; margin: 0; padding: 24px; }
    .wrap { max-width: 1000px; margin: 0 auto; background: #fff; border-radius: 12px; padding: 24px; box-shadow: 0 4px 12px rgba(0,0,0,0.08); }
    .topo { border-bottom: 2px solid #2563eb; padding-bottom: 14px; margin-bottom: 20px; display: flex; justify-content: space-between; }
    .kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; margin-bottom: 24px; }
    .kpi-card { background: #f1f5f9; padding: 14px; border-radius: 8px; border-left: 4px solid #2563eb; }
    .kpi-card.verde { border-left-color: #10b981; }
    .kpi-card.sinal { border-left-color: #f59e0b; }
    .kpi-card.ardosia { border-left-color: #8b5cf6; }
    table { width: 100%; border-collapse: collapse; margin-top: 14px; font-size: 13px; }
    th { background: #e2e8f0; padding: 8px 10px; text-align: left; }
    td { padding: 8px 10px; border-bottom: 1px solid #e2e8f0; }
    tfoot td { font-weight: bold; background: #f8fafc; border-top: 2px solid #cbd5e1; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="topo">
      <div>
        <h2 style="margin:0">${esc(S.cfg.empresa)}</h2>
        <div style="color:#64748b;font-size:13px">Relatório Executivo Gerencial & BI</div>
      </div>
      <div style="text-align:right;font-size:12px;color:#475569">
        <div><b>Período:</b> ${dataBRfull(relState.dIni)} até ${dataBRfull(relState.dFim)}</div>
        <div><b>Gerado em:</b> ${dataBRfull(dH)} às ${horaBR()}</div>
      </div>
    </div>

    <div class="kpi-grid">
      <div class="kpi-card">
        <div style="font-size:11px;color:#64748b;text-transform:uppercase;font-weight:bold">Faturamento Total</div>
        <div style="font-size:20px;font-weight:bold;color:#2563eb;margin-top:4px">${brl(m.totFaturamento)}</div>
      </div>
      <div class="kpi-card verde">
        <div style="font-size:11px;color:#64748b;text-transform:uppercase;font-weight:bold">Lucro Bruto Estimado</div>
        <div style="font-size:20px;font-weight:bold;color:#10b981;margin-top:4px">${brl(m.lucroBruto)}</div>
      </div>
      <div class="kpi-card sinal">
        <div style="font-size:11px;color:#64748b;text-transform:uppercase;font-weight:bold">Ticket Médio</div>
        <div style="font-size:20px;font-weight:bold;margin-top:4px">${brl(m.ticketMedio)}</div>
      </div>
      <div class="kpi-card ardosia">
        <div style="font-size:11px;color:#64748b;text-transform:uppercase;font-weight:bold">Total de OSs</div>
        <div style="font-size:20px;font-weight:bold;margin-top:4px">${m.osPeriodo.length}</div>
      </div>
    </div>

    <h3 style="margin-top:24px;border-bottom:1px solid #cbd5e1;padding-bottom:6px">Ordens de Serviço do Período</h3>
    <table>
      <thead>
        <tr>
          <th>OS</th>
          <th>Data</th>
          <th>Placa</th>
          <th>Cliente</th>
          <th>Mecânico</th>
          <th style="text-align:right">Serviços</th>
          <th style="text-align:right">Peças</th>
          <th style="text-align:right">Total</th>
        </tr>
      </thead>
      <tbody>
        ${m.osPeriodo.map(o => {
          const v = V(o.vei), c = C(o.cli);
          const totServ = soma(o.servicos, i => (i.qtd || 1) * (i.valor || 0));
          const totPec = soma(o.pecas, i => (i.qtd || 1) * (i.valor || 0));
          return `<tr>
            <td>#${o.num}</td>
            <td>${dataBR(o.fechamento || o.abertura)}</td>
            <td><b>${v.placa}</b></td>
            <td>${esc(c.nome)}</td>
            <td>${esc(o.mec || '—')}</td>
            <td style="text-align:right">${brl(totServ)}</td>
            <td style="text-align:right">${brl(totPec)}</td>
            <td style="text-align:right;font-weight:bold">${brl(totOS(o))}</td>
          </tr>`;
        }).join('')}
      </tbody>
      <tfoot>
        <tr>
          <td colspan="5">TOTAL</td>
          <td style="text-align:right">${brl(m.totServicos)}</td>
          <td style="text-align:right">${brl(m.totPecas)}</td>
          <td style="text-align:right">${brl(m.totFaturamento)}</td>
        </tr>
      </tfoot>
    </table>
  </div>
</body>
</html>`;

  baixarArquivo(html, nomeArquivo, 'text/html;charset=utf-8;');
  torrar(`Relatório HTML exportado: ${nomeArquivo}`);
}

/* =====================================================================
   COMPARTILHAR RESUMO EXECUTIVO VIA WHATSAPP
===================================================================== */
function compartilharResumoWhatsApp() {
  const m = calcularMetricasRelatorio();
  const dH = hoje();

  const texto = 
`📊 *RELATÓRIO EXECUTIVO — ${S.cfg.empresa.toUpperCase()}*
📅 *Período:* ${dataBRfull(relState.dIni)} a ${dataBRfull(relState.dFim)}
⏰ *Emissão:* ${dataBRfull(dH)} às ${horaBR()}

💰 *Faturamento Total:* ${brl(m.totFaturamento)}
📈 *Lucro Bruto Estimado:* ${brl(m.lucroBruto)} (${m.margemLucro.toFixed(1)}%)
🎯 *Ticket Médio por OS:* ${brl(m.ticketMedio)}
🔧 *Total de OSs:* ${m.osPeriodo.length} (${m.osFinalizadas.length} finalizadas)

🔹 *Mão de Obra (Serviços):* ${brl(m.totServicos)}
🔹 *Peças / Almoxarifado:* ${brl(m.totPecas)}
${m.totDescontos > 0 ? `🔻 *Descontos Concedidos:* ${brl(m.totDescontos)}\n` : ''}
_Gerado automaticamente pelo Sistema Pátio CRM._`;

  const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(texto)}`;
  window.open(url, '_blank');
}

/* =====================================================================
   EXPORTAÇÃO CSV COMPATÍVEL COM EXCEL (UTF-8 COM BOM)
===================================================================== */
function exportarCSV(tipo) {
  let csv = '', nomeArquivo = '';

  if (tipo === 'os') {
    nomeArquivo = `patio_ordens_servico_${relState.dIni}_a_${relState.dFim}.csv`;
    csv = 'Numero;Data Abertura;Data Fechamento;Status;Placa;Modelo;Cliente;Mecanico;Servicos (R$);Pecas (R$);Desconto (R$);Total Liquido (R$)\n';
    
    const m = calcularMetricasRelatorio();
    m.osPeriodo.forEach(o => {
      const v = V(o.vei), c = C(o.cli);
      const totServ = soma(o.servicos, i => (i.qtd || 1) * (i.valor || 0));
      const totPec = soma(o.pecas, i => (i.qtd || 1) * (i.valor || 0));
      const total = totOS(o);
      csv += `${o.num};"${o.abertura}";"${o.fechamento || ''}";"${ST[o.st]?.r || o.st}";"${v.placa}";"${v.modelo}";"${c.nome}";"${o.mec || ''}";${totServ.toFixed(2).replace('.', ',')};${totPec.toFixed(2).replace('.', ',')};${(o.desc || 0).toFixed(2).replace('.', ',')};${total.toFixed(2).replace('.', ',')}\n`;
    });
    csv += `\nTOTAL CONSOLIDADO;;;;;;;${m.totServicos.toFixed(2).replace('.', ',')};${m.totPecas.toFixed(2).replace('.', ',')};${m.totDescontos.toFixed(2).replace('.', ',')};${m.totFaturamento.toFixed(2).replace('.', ',')}\n`;
  } else if (tipo === 'pecas') {
    nomeArquivo = `patio_estoque_pecas_${hoje()}.csv`;
    csv = 'Codigo;Descricao;Unidade;Estoque Atual;Estoque Minimo;Preco Custo;Preco Venda;Total Custo;Total Venda;Localizacao;Fornecedor\n';
    let totEstoqueCusto = 0, totEstoqueVenda = 0;
    (S.pecas || []).forEach(p => {
      const totC = (p.qtd || 0) * (p.custo || 0);
      const totV = (p.qtd || 0) * (p.venda || 0);
      totEstoqueCusto += totC;
      totEstoqueVenda += totV;
      csv += `"${p.cod}";"${p.nome}";"${p.un || 'un'}";${p.qtd};${p.min};${p.custo.toFixed(2).replace('.', ',')};${p.venda.toFixed(2).replace('.', ',')};${totC.toFixed(2).replace('.', ',')};${totV.toFixed(2).replace('.', ',')};"${p.loc || ''}";"${p.forn || ''}"\n`;
    });
    csv += `\nTOTAL EM ESTOQUE;;;;;;;${totEstoqueCusto.toFixed(2).replace('.', ',')};${totEstoqueVenda.toFixed(2).replace('.', ',')};;\n`;
  } else if (tipo === 'financeiro') {
    nomeArquivo = `patio_movimentacoes_caixa_${hoje()}.csv`;
    csv = 'Data;Tipo;Descricao;Categoria;Forma de Pagamento;Valor (R$);Conciliado\n';
    (S.movimentos || []).forEach(m => {
      csv += `"${m.data}";"${m.tipo.toUpperCase()}";"${m.desc}";"${m.cat || 'Geral'}";"${m.forma || ''}";${m.valor.toFixed(2).replace('.', ',')};"${m.conc ? 'Sim' : 'Não'}"\n`;
    });
  } else if (tipo === 'clientes') {
    nomeArquivo = `patio_clientes_${hoje()}.csv`;
    csv = 'Razao Social;Nome Fantasia;CNPJ / CPF;Telefone;Contato;Cidade;UF;Prazo (dias)\n';
    (S.clientes || []).forEach(c => {
      csv += `"${c.nome}";"${c.fantasia || ''}";"${c.doc || ''}";"${c.fone || ''}";"${c.contato || ''}";"${c.cidade || ''}";"${c.uf || ''}";${c.prazo || 0}\n`;
    });
  }

  // Adicionar UTF-8 BOM (\uFEFF) para garantir abertura sem erros de acentuação no Excel
  baixarArquivo('\uFEFF' + csv, nomeArquivo, 'text/csv;charset=utf-8;');
  torrar(`Planilha Excel exportada: ${nomeArquivo}`);
}

function exportarBackupJSON() {
  const dados = JSON.stringify(S, null, 2);
  const nome = `backup_patio_crm_${hoje()}_${Date.now()}.json`;
  baixarArquivo(dados, nome, 'application/json');
  torrar('Backup completo baixado com sucesso!');
}

function restaurarBackupJSON(arquivo) {
  const fr = new FileReader();
  fr.onload = () => {
    try {
      const obj = JSON.parse(fr.result);
      if (obj && obj.os && obj.clientes && obj.pecas) {
        S = obj;
        salvar();
        render();
        torrar('Backup restaurado com sucesso!');
      } else {
        torrar('Arquivo de backup inválido ou incompatível.');
      }
    } catch (e) {
      torrar('Erro ao processar arquivo JSON de backup.');
    }
  };
  fr.readAsText(arquivo);
}

function baixarArquivo(conteudo, nome, tipoMime) {
  const blob = new Blob([conteudo], { type: tipoMime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/* --- FILE: app.js --- */
/* =====================================================================
   PÁTIO CRM — NÚCLEO DA APLICAÇÃO, NAVEGAÇÃO & EVENTOS GLOBAIS
===================================================================== */

/* ---------------- Casca & Navegação ---------------- */
function renderNav() {
  const v = S.ui.view || 'patio';
  const itens = [
    ['patio', 'Pátio & Boxes', 'patio'],
    ['painel', 'Painel & KPIs', 'painel'],
    ['estoque', 'Almoxarifado', 'pecas'],
    ['financeiro', 'Financeiro', 'fin'],
    ['mensagens', 'WhatsApp CRM', 'zap'],
    ['cadastros', 'Cadastros', 'cad'],
    ['relatorios', 'Relatórios & Backup', 'relatorios'],
    ['configuracoes', 'Configurações', 'cfg']
  ];

  const html = `
  <div class="nav-marca">
    <div class="chapa">${ico('patio', 18)}</div>
    <div>
      <div style="font-weight:700;font-size:15px;color:#fff;line-height:1.2">PÁTIO DIESEL</div>
      <div style="font-size:11px;color:var(--aco-400)">Gestão de Oficina Pesada</div>
    </div>
  </div>
  <div class="nav-links">
    ${itens.map(([k, label, iconName]) => `
      <button class="nav-link ${v === k ? 'ativo' : ''}" data-act="ir" data-v="${k}">
        ${ico(iconName, 18)}
        <span>${label}</span>
      </button>
    `).join('')}
  </div>
  <div class="nav-rodape">
    <div class="mini" style="color:var(--aco-400);font-size:11px">Versão 2.4 Modular</div>
    <div id="status-salvo" style="color:var(--verde);font-size:11px;font-weight:600;min-height:16px">● Salvo localmente</div>
  </div>`;

  const navEl = document.getElementById('nav');
  if (navEl) navEl.innerHTML = html;
}

function renderTopo() {
  const v = S.ui.view || 'patio';
  const titulos = {
    patio: 'Pátio Operacional & Boxes',
    painel: 'Painel Geral de Desempenho',
    estoque: 'Almoxarifado & Peças',
    financeiro: 'Gestão Financeira & DRE',
    mensagens: 'Comunicação & Cobrança WhatsApp',
    cadastros: 'Cadastros & Frotas',
    relatorios: 'Relatórios & Exportações',
    configuracoes: 'Configurações da Oficina'
  };

  return `
  <header class="topo">
    <div class="marca">
      <div class="chapa">${ico('patio', 18)}</div>
      <div>
        <h1>PÁTIO DIESEL</h1>
        <div class="sub">${titulos[v] || 'CRM'}</div>
      </div>
    </div>
    <div class="topo-titulo-desktop" style="font-weight:700;font-size:16px;color:#fff">
      ${titulos[v] || 'Oficina'}
    </div>
    <div class="dir">
      <div class="pill-topo">
        <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--verde)"></span>
        <span>${esc(S.cfg.empresa)}</span>
      </div>
      <button class="btn btn-primario" data-act="nova-os" style="height:32px;font-size:12.5px;padding:0 12px;border-radius:16px">
        ${ico('mais', 14)} Nova OS
      </button>
    </div>
  </header>`;
}

/* ---------------- Render Principal ---------------- */
function render() {
  renderNav();
  const v = S.ui.view || 'patio';
  let conteudo = '';

  if (v === 'patio') conteudo = viewPatio();
  else if (v === 'painel') conteudo = viewPainelInicial();
  else if (v === 'estoque') conteudo = viewEstoque();
  else if (v === 'financeiro') conteudo = viewFinanceiro();
  else if (v === 'mensagens') conteudo = viewMensagens();
  else if (v === 'cadastros') conteudo = viewCadastros();
  else if (v === 'relatorios') conteudo = viewRelatorios();
  else if (v === 'configuracoes') conteudo = viewConfiguracoes();

  const appEl = document.getElementById('app');
  if (appEl) {
    appEl.innerHTML = renderTopo() + `<main class="wrap">${conteudo}</main>`;
  }

  // Renderiza gráficos caso a view demande
  if (v === 'painel') {
    setTimeout(renderGraficosPainel, 100);
  } else if (v === 'relatorios') {
    setTimeout(initRelatoriosCharts, 100);
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
    case 'ir': S.ui.view = b.dataset.v; S.ui.busca = ''; render(); break;
    case 'filtro': S.ui.filtro = b.dataset.f; render(); break;
    case 'filtro-fin': S.ui.filtroFin = b.dataset.f; render(); break;
    case 'filtro-estoque': S.ui.filtroEstoque = b.dataset.f; render(); break;
    case 'fechar': fecharFolha(); break;

    /* --- OS --- */
    case 'abrir-os': S.ui.osAberta = b.dataset.id; S.ui.abaOS = 'servicos'; S.ui.picker = null; S.ui.busca = ''; abrirFolha(folhaOS); break;
    case 'nova-os': S.ui.rascunho = null; abrirFolha(() => novaOSFolha(b.dataset.box)); break;
    case 'voltar-os': S.ui.rascVeiculo = null; abrirFolha(novaOSFolha); break;
    case 'imprimir-os': imprimirOS(o); break;
    case 'copiar-orc': copiar(textoOrcamento(o)); torrar('Orçamento copiado para o WhatsApp!'); break;
    case 'excluir-os': pedirConfirmacao('os' + o.id, 'Toque de novo para excluir a OS permanentemente', () => { S.os = S.os.filter(x => x.id !== o.id); fecharFolha(); render(); torrar('OS excluída'); }); break;
    case 'aba-os': S.ui.abaOS = b.dataset.k; S.ui.picker = null; renderFolha(); break;
    case 'picker': S.ui.picker = b.dataset.p; S.ui.busca = ''; renderFolha(); break;
    case 'fechar-picker': S.ui.picker = null; S.ui.busca = ''; renderFolha(); break;
    case 'add-item': {
      const tipo = b.dataset.t, refId = b.dataset.r;
      const isPeca = tipo === 'pecas';
      const ref = isPeca ? P(refId) : Serv(refId);
      o[tipo] = o[tipo] || [];
      o[tipo].push({ id: uid('item'), nome: ref.nome, cod: ref.cod || '', qtd: 1, valor: isPeca ? ref.venda : ref.valor });
      salvar(); renderFolha(); render(); torrar('Item adicionado à OS'); break;
    }
    case 'qtd': {
      const lista = o[b.dataset.t], item = lista.find(x => x.id === b.dataset.i);
      if (item) { item.qtd = Math.max(1, item.qtd + Number(b.dataset.d)); salvar(); renderFolha(); render(); }
      break;
    }
    case 'rm-item': o[b.dataset.t] = o[b.dataset.t].filter(x => x.id !== b.dataset.i); salvar(); renderFolha(); render(); break;
    case 'faturar-os-modal': abrirFolha(folhaFaturarOS); break;
    case 'confirmar-faturamento': processarFaturamentoOS(o); fecharFolha(); render(); torrar(`OS ${o.num} faturada e entregue com sucesso!`); break;

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

    /* --- Cadastros --- */
    case 'aba-cad': S.ui.abaCad = b.dataset.k; render(); break;
    case 'ver-cliente': S.ui.cliAberto = b.dataset.id; abrirFolha(folhaCliente); break;
    case 'novo-cad': S.ui.cadTipo = b.dataset.t; S.ui.rascCad = {}; abrirFolha(folhaCadastro); break;
    case 'editar-cliente': S.ui.cadTipo = 'cliente'; S.ui.rascCad = JSON.parse(JSON.stringify(S.clientes.find(x => x.id === b.dataset.id))); abrirFolha(folhaCadastro); break;
    case 'bloquear-cliente': {
      const cl = S.clientes.find(x => x.id === b.dataset.id);
      if (cl) { cl.bloqueado = !cl.bloqueado; salvar(); renderFolha(); render(); torrar(cl.bloqueado ? 'Cliente bloqueado para faturamento' : 'Cliente desbloqueado'); }
      break;
    }
    case 'excluir-cliente': pedirConfirmacao('excli' + b.dataset.id, 'Toque de novo para excluir o cliente', () => { S.clientes = S.clientes.filter(x => x.id !== b.dataset.id); salvar(); render(); torrar('Cliente excluído'); }); break;
    case 'salvar-cad': {
      const r = S.ui.rascCad || {}, t = S.ui.cadTipo;
      if (t === 'cliente') {
        if (!r.nome) { torrar('Razão Social / Nome é obrigatório'); break; }
        if (r.id) {
          const idx = S.clientes.findIndex(x => x.id === r.id);
          if (idx >= 0) S.clientes[idx] = { ...S.clientes[idx], ...r };
        } else {
          S.clientes.push({ id: uid('cli'), nome: r.nome, fantasia: r.fantasia || '', doc: r.doc || '', fone: r.fone || '', email: r.email || '', contato: r.contato || '', prazo: +r.prazo || 0, ie: r.ie || '', endereco: r.endereco || '', cidade: r.cidade || '', uf: r.uf || '', cep: r.cep || '', optin: true, bloqueado: false });
        }
      }
      if (t === 'servico') {
        if (!r.nome) { torrar('Descrição do serviço é obrigatória'); break; }
        S.servicos.push({ id: uid('s'), nome: r.nome, valor: +r.valor || 0, horas: +r.horas || 1 });
      }
      if (t === 'box') {
        if (!r.nome) { torrar('Nome do box é obrigatório'); break; }
        S.boxes.push({ id: uid('b'), nome: r.nome, tipo: r.tipo || 'Geral' });
      }
      salvar(); S.ui.rascCad = null; fecharFolha(); render(); torrar('Cadastro realizado com sucesso!'); break;
    }

    /* --- Relatórios & Backup --- */
    case 'mudar-periodo-rel': setPeriodoRelatorio(b.dataset.p); break;
    case 'imprimir-relatorio-executivo': imprimirRelatorioExecutivo(); break;
    case 'exportar-relatorio-html': exportarRelatorioHTML(); break;
    case 'compartilhar-whatsapp-relatorio': compartilharResumoWhatsApp(); break;
    case 'exportar-csv': exportarCSV(b.dataset.tipo); break;
    case 'exportar-backup-json': exportarBackupJSON(); break;
    case 'imprimir-fechamento-caixa': imprimirFechamentoCaixa(); break;

    /* --- Config & Reset --- */
    case 'salvar-cfg': salvar(); torrar('Configurações salvas!'); break;
    case 'zerar': pedirConfirmacao('zerar', 'Toque de novo para restaurar a demonstração inicial', () => { S = sementes(); salvar(); render(); torrar('Dados de demonstração restaurados!'); }); break;
  }
});

/* ---------------- Inputs Reativos ---------------- */
document.addEventListener('input', e => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const a = el.dataset.act, c = el.dataset.c, v = el.value, o = OSatual();
  const guarda = (obj) => { obj[c] = v; };

  if (a === 'busca-placa-patio') { S.ui.buscaPlaca = v; render(); return; }
  if (a === 'busca-estoque') { S.ui.buscaEstoque = v; render(); return; }
  if (a === 'busca-picker') { S.ui.busca = v; renderFolha(); return; }

  if (a === 'rasc') { guarda(S.ui.rascunho = S.ui.rascunho || {}); if (c === 'vei' && v === 'novo') { abrirFolha(() => folhaNovoVeiculo(S.ui.rascunho.cli)); } }
  if (a === 'rasc-vei') guarda(S.ui.rascVeiculo = S.ui.rascVeiculo || {});
  if (a === 'rasc-fat') guarda(S.ui.rascFaturar = S.ui.rascFaturar || {});
  if (a === 'rp') guarda(S.ui.rascPeca = S.ui.rascPeca || {});
  if (a === 'rc') guarda(S.ui.rascCad = S.ui.rascCad || {});
  if (a === 'rct') guarda(S.ui.rascConta = S.ui.rascConta || {});
  if (a === 'rmv') guarda(S.ui.rascMov = S.ui.rascMov || {});
  if (a === 'cfg') { S.cfg[c] = c === 'saldoInicial' ? (+v || 0) : v; salvar(); }
  if (a === 'cfg-apibrasil') { (S.cfg.apibrasil = S.cfg.apibrasil || {})[c] = v; salvar(); }
  if (a === 'camp') { (S.ui.camp = S.ui.camp || {})[c] = v; salvar(); }
  if (a === 'api-cfg') { S.zap.api = S.zap.api || {}; S.zap.api[c] = v; salvar(); }
  if (a === 'regra') { const r = S.zap.regua.find(x => x.id === el.dataset.i); if (r) r[c] = c === 'quando' ? (+v || 0) : v; salvar(); }
  if (a === 'campo-peca') { const p = P(S.ui.pecaAberta); p[c] = ['min', 'custo', 'venda', 'qtd'].includes(c) ? (+v || 0) : v; salvar(); }
  if (a === 'campo-os' && o) { o[c] = ['km', 'desc'].includes(c) ? (+v || 0) : v; salvar(); }
  if (a === 'val-item' && o) { const i = o[el.dataset.t].find(x => x.id === el.dataset.i); if (i) i.valor = +v || 0; salvar(); }
});

document.addEventListener('change', e => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const a = el.dataset.act, o = OSatual();

  if (a === 'mudar-status-os' && o) { o.st = el.value; salvar(); renderFolha(); render(); torrar(`OS ${o.num}: ${ST[o.st].r}`); }
  if (a === 'campo-os' && o) { renderFolha(); render(); }
  if (a === 'val-item' && o) { renderFolha(); render(); }
  if (a === 'campo-peca') { renderFolha(); render(); }
  if (a === 'camp-modelo') {
    const m = S.zap.modelos[+el.value];
    if (m) { S.ui.camp = S.ui.camp || {}; S.ui.camp.texto = m.texto; S.ui.camp.nome = m.nome; render(); }
  }
  if (a === 'arquivo-xml') { lerArquivosXML(el.files); }
  if (a === 'restaurar-backup-json') { if (el.files && el.files[0]) restaurarBackupJSON(el.files[0]); }
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
  const precisaAtualizar = !salvo || !salvo.os || !salvo.v_agosto;
  S = precisaAtualizar ? sementes() : salvo;
  if (precisaAtualizar) {
    await armazem.gravar(S);
  }

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

  S.extrato = S.extrato || [];
  S.nfsRecebidas = S.nfsRecebidas || [];
  S.compras = S.compras || [];
  if (!S.zap || !S.zap.regua) S.zap = zapPadrao();

  render();
})();
