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
