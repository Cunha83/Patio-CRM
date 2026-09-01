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
  return Math.max(0, totServ + totPec - (Number(o.desc) || 0));
};

const emAberto = (tipo) => S.contas.filter((c) => c.tipo === tipo && !c.pago);
const saldoCaixa = () => {
  const ini = Number(S.cfg.saldoInicial) || 0;
  const ent = soma(S.movimentos.filter((m) => m.tipo === 'entrada'), (m) => m.valor);
  const sai = soma(S.movimentos.filter((m) => m.tipo === 'saida'), (m) => m.valor);
  return ini + ent - sai;
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
      { id: 'p1', cod: 'SCN-1875892', nome: 'Jogo de Pastilhas de Freio Scania Série R (WVA 29174)', un: 'jg', qtd: 8, min: 3, custo: 320.00, venda: 540.00, loc: 'Prat. A-02', forn: 'Fras-le Peças' },
      { id: 'p2', cod: 'VLV-2134567', nome: 'Filtro Separador Racor Volvo FH D13', un: 'un', qtd: 14, min: 5, custo: 85.00, venda: 165.00, loc: 'Prat. B-01', forn: 'Donaldson Filtros' },
      { id: 'p3', cod: 'MBZ-004420', nome: 'Cuíca de Freio Dupla Tipo 30/30 Tristop', un: 'un', qtd: 4, min: 2, custo: 420.00, venda: 730.00, loc: 'Prat. C-04', forn: 'Knorr-Bremse' },
      { id: 'p4', cod: 'LUB-15W40', nome: 'Óleo Motor Diesel 15W40 CI-4 Top Turbo (Galão 20L)', un: 'gl', qtd: 18, min: 6, custo: 290.00, venda: 480.00, loc: 'Depósito 01', forn: 'Lubrax Distribuidora' },
      { id: 'p5', cod: 'WBC-480104', nome: 'Válvula Moduladora EBS/ABS Wabco', un: 'un', qtd: 2, min: 1, custo: 1250.00, venda: 2100.00, loc: 'Prat. E-01', forn: 'ZF Wabco Brasil' },
      { id: 'p6', cod: 'SCN-2245890', nome: 'Kit Embreagem Cerâmica Scania 430mm Sachs', un: 'kt', qtd: 3, min: 1, custo: 2800.00, venda: 4450.00, loc: 'Pallet 03', forn: 'Sachs Embreagens' },
      { id: 'p7', cod: 'FLT-AR540', nome: 'Elemento Filtro de Ar Primário Volvo FH4/FH5', un: 'un', qtd: 6, min: 3, custo: 190.00, venda: 340.00, loc: 'Prat. B-03', forn: 'Mann Filter' }
    ],
    os: [
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
      { id: 'ct1', tipo: 'receber', desc: 'OS 1040 — Manutenção Preventiva Scania', parte: 'TransRodrigues Transportes Ltda', valor: 6850.00, venc: addDias(dHoje, -5), pago: false, cat: 'Serviços & Peças', doc: 'NF-1040', osId: 'os1040' },
      { id: 'ct2', tipo: 'receber', desc: 'OS 1041 — Troca de Cuícas Volvo FH', parte: 'Expresso Vale Logística & Cargas', valor: 4320.00, venc: addDias(dHoje, 7), pago: false, cat: 'Serviços & Peças', doc: 'NF-1041', osId: 'os1041' },
      { id: 'ct3', tipo: 'receber', desc: 'OS 1042 — Geometria e Freios Actros', parte: 'AgroLog Grãos & Fertilizantes S/A', valor: 3150.00, venc: addDias(dHoje, 14), pago: false, cat: 'Serviços & Peças', doc: 'NF-1042', osId: 'os1042' },
      { id: 'ct4', tipo: 'pagar', desc: 'Compra ZF Wabco Brasil (Válvulas & Moduladores)', parte: 'ZF Wabco Brasil', valor: 5400.00, venc: addDias(dHoje, -2), pago: false, cat: 'Fornecedores Peças', doc: 'NF-98412' },
      { id: 'ct5', tipo: 'pagar', desc: 'Lubrax Distribuidora (Tambores de Óleo 15W40)', parte: 'Lubrax Distribuidora', valor: 3890.00, venc: addDias(dHoje, 5), pago: false, cat: 'Óleos & Lubrificantes', doc: 'NF-44120' },
      { id: 'ct6', tipo: 'pagar', desc: 'Aluguel do Barracão e Pátio Operacional', parte: 'Imobiliária Anhanguera', valor: 6500.00, venc: addDias(dHoje, 10), pago: false, cat: 'Estrutura & Aluguel', doc: 'BOL-0926' },
      { id: 'ct7', tipo: 'pagar', desc: 'Folha de Pagamento Mecânicos e Apoio', parte: 'Equipe da Oficina', valor: 14200.00, venc: addDias(dHoje, 5), pago: false, cat: 'Pessoal & Salários', doc: 'FOLHA-09' }
    ],
    movimentos: [
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
