/* =====================================================================
   PÁTIO CRM — DADOS DE SEMENTE: OPERACIONAL E FINANCEIRO
   Submódulo extraído de js/state.js (< 350 linhas)
   ===================================================================== */

function sementes() {
  const dHoje = (typeof hoje === 'function') ? hoje() : new Date().toISOString().slice(0, 10);
  const cadastros = (typeof sementesCadastros === 'function') ? sementesCadastros() : {
    boxes: [], fornecedores: [], mecanicos: [], clientes: [], veiculos: [], servicos: [], pecas: []
  };

  const normalizarPC = (typeof normalizarPlanoDeContas === 'function') ? normalizarPlanoDeContas() : [];

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
      planoDeContas: normalizarPC,
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
    boxes: cadastros.boxes,
    fornecedores: cadastros.fornecedores,
    mecanicos: cadastros.mecanicos,
    clientes: cadastros.clientes,
    veiculos: cadastros.veiculos,
    servicos: cadastros.servicos,
    pecas: cadastros.pecas,
    os: [
      {
        id: 'os_ago1',
        num: 1020,
        box: 'b1',
        vei: 'v1',
        cli: 'c1',
        st: 'faturado',
        dt: '2026-08-10',
        dtFim: '2026-08-11',
        prev: '2026-08-11',
        km: 279000,
        motivo: 'Revisão pesada de freios e suspensão',
        laudo: 'Trocadas pastilhas e amortecedores dianteiros.',
        itens: [
          { tipo: 'peca', id: 'p1', qtd: 2, valor: 540.00, custo: 320.00 },
          { tipo: 'peca', id: 'p11', qtd: 2, valor: 890.00, custo: 520.00 },
          { tipo: 'servico', id: 's2', qtd: 1, valor: 450.00, horas: 2.5 }
        ],
        servicos: []
      },
      {
        id: 'os_set1',
        num: 1032,
        box: 'b2',
        vei: 'v2',
        cli: 'c1',
        st: 'faturado',
        dt: '2026-09-15',
        dtFim: '2026-09-16',
        prev: '2026-09-16',
        km: 191000,
        motivo: 'Embreagem patinando na subida',
        laudo: 'Substituído kit de embreagem cerâmica completo.',
        itens: [
          { tipo: 'peca', id: 'p6', qtd: 1, valor: 4450.00, custo: 2800.00 },
          { tipo: 'servico', id: 's3', qtd: 1, valor: 1200.00, horas: 6.0 }
        ],
        servicos: []
      },
      {
        id: 'os1',
        num: 1045,
        box: 'b1',
        vei: 'v1',
        cli: 'c1',
        st: 'executando',
        dt: dHoje,
        dtFim: '',
        prev: dHoje,
        km: 284500,
        motivo: 'Barulho na suspensão dianteira e aviso de desgaste de freio no painel',
        laudo: 'Identificado feixe de mola quebrado no lado direito e pastilhas no fim da vida útil.',
        itens: [
          { tipo: 'peca', id: 'p8', qtd: 1, valor: 2390.00, custo: 1450.00 },
          { tipo: 'peca', id: 'p1', qtd: 1, valor: 540.00, custo: 320.00 },
          { tipo: 'servico', id: 's2', qtd: 1, valor: 450.00, horas: 2.5 }
        ],
        servicos: [
          { id: 'ap1', mec: 'm1', srv: 's2', inicio: '08:30', fim: '', st: 'andamento', obs: 'Iniciado desmontagem do conjunto' }
        ]
      },
      {
        id: 'os2',
        num: 1046,
        box: 'b3',
        vei: 'v3',
        cli: 'c2',
        st: 'diagnostico',
        dt: dHoje,
        dtFim: '',
        prev: dHoje,
        km: 340100,
        motivo: 'Fumaça preta em aceleração forte e perda de potência',
        laudo: 'Possível saturação de filtros de combustível ou sensor de pressão do rail.',
        itens: [
          { tipo: 'servico', id: 's7', qtd: 1, valor: 280.00, horas: 1.0 }
        ],
        servicos: []
      },
      {
        id: 'os3',
        num: 1047,
        box: 'b5',
        vei: 'v4',
        cli: 'c2',
        st: 'aprovado',
        dt: dHoje,
        dtFim: '',
        prev: dHoje,
        km: 89400,
        motivo: 'Revisão programada de 90.000 km e alinhamento',
        laudo: 'Preventiva periódica autorizada pelo frotista.',
        itens: [
          { tipo: 'peca', id: 'p4', qtd: 2, valor: 480.00, custo: 290.00 },
          { tipo: 'peca', id: 'p7', qtd: 1, valor: 340.00, custo: 190.00 },
          { tipo: 'servico', id: 's4', qtd: 1, valor: 220.00, horas: 1.5 },
          { tipo: 'servico', id: 's6', qtd: 1, valor: 520.00, horas: 2.0 }
        ],
        servicos: []
      },
      {
        id: 'os4',
        num: 1044,
        box: 'b2',
        vei: 'v2',
        cli: 'c1',
        st: 'faturado',
        dt: dHoje,
        dtFim: dHoje,
        prev: dHoje,
        km: 195200,
        motivo: 'Vazamento de ar na cuíca de freio traseira esquerda',
        laudo: 'Substituída cuíca 30/30 e mangueira pneumática. Sistema estancado com 10 bar.',
        desc: 50.00,
        itens: [
          { tipo: 'peca', id: 'p3', qtd: 1, valor: 730.00, custo: 420.00 },
          { tipo: 'servico', id: 's1', qtd: 1, valor: 380.00, horas: 2.0 }
        ],
        servicos: [
          { id: 'ap2', mec: 'm2', srv: 's1', inicio: '07:45', fim: '09:50', st: 'concluido', obs: 'Serviço finalizado e testado no manômetro' }
        ]
      }
    ],
    contas: [
      { id: 'ct1', tipo: 'receber', cli: 'c1', desc: 'OS #1044 — Volvo FH 540 (RIO9A88)', valor: 1060.00, venc: dHoje, pago: false, cat: 'Serviços', forma: 'Boleto' },
      { id: 'ct2', tipo: 'receber', cli: 'c2', desc: 'OS #1038 — DAF XF 530 (DAF7F55)', valor: 3200.00, venc: dHoje, pago: false, cat: 'Serviços', forma: 'Boleto' },
      { id: 'ct3', tipo: 'receber', cli: 'c4', desc: 'OS #1041 — Volvo FH 460 (AGR4D11)', valor: 4890.00, venc: dHoje, pago: true, dtPago: dHoje, cat: 'Serviços', forma: 'Pix' },
      { id: 'ct4', tipo: 'pagar', desc: 'Fras-le Peças — NF-e 184920 (Pastilhas de Freio)', valor: 2560.00, venc: dHoje, pago: false, cat: 'Peças', forma: 'Boleto' },
      { id: 'ct5', tipo: 'pagar', desc: 'CPFL Energia Elétrica — Oficina / Compressores', valor: 1850.00, venc: dHoje, pago: false, cat: 'Fixas', forma: 'Boleto' },
      { id: 'ct6', tipo: 'pagar', desc: 'Sachs Embreagens — NF-e 94820 (Kit Platô/Disco)', valor: 5600.00, venc: dHoje, pago: true, dtPago: dHoje, cat: 'Peças', forma: 'Transferência' }
    ],
    contasPagar: [],
    contasReceber: [],
    movimentos: [
      { id: 'mvt1', dt: dHoje, desc: 'Recebimento Pix — AgroSul Grãos (OS #1041)', valor: 4890.00, tipo: 'entrada', cat: 'Serviços', forma: 'Pix' },
      { id: 'mvt2', dt: dHoje, desc: 'Pagamento Sachs Embreagens (NF-e 94820)', valor: 5600.00, tipo: 'saida', cat: 'Peças', forma: 'Transferência' }
    ],
    extrato: [],
    nfsRecebidas: [],
    compras: [
      {
        id: 'cp1',
        num: 8492,
        forn: 'Fras-le Peças',
        cnpj: '11.222.333/0001-44',
        dt: dHoje,
        total: 2560.00,
        st: 'entregue',
        itens: [
          { peca: 'SCN-1875892', nome: 'Jogo de Pastilhas Scania', qtd: 8, custo: 320.00 }
        ]
      }
    ],
    vendas: [
      {
        id: 'vd1',
        num: 301,
        cli: 'c3',
        dt: dHoje,
        total: 480.00,
        st: 'faturada',
        forma: 'Pix',
        itens: [
          { peca: 'LUB-15W40', nome: 'Óleo Motor 15W40 (Galão 20L)', qtd: 1, preco: 480.00, custo: 290.00 }
        ]
      }
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

if (typeof window !== 'undefined') window.sementes = sementes;
if (typeof globalThis !== 'undefined') globalThis.sementes = sementes;
