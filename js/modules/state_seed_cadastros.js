/* =====================================================================
   PÁTIO CRM — DADOS DE SEMENTE: CADASTROS (BOXES, FORNECEDORES, VEÍCULOS, PEÇAS)
   Submódulo extraído de js/state.js (< 350 linhas)
   ===================================================================== */

function sementesCadastros() {
  return {
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
      { id: 'm3', nome: 'Tiago (Suspensão e Molas)', especialidade: 'Suspensão', fone: '19999990003' },
      { id: 'm4', nome: 'Cláudio (Motor e Câmbio)', especialidade: 'Motor', fone: '19999990004' }
    ],
    clientes: [
      {
        id: 'c1',
        nome: 'Transportadora TransRodoviário Ltda',
        doc: '12.345.678/0001-90',
        fone: '11987654321',
        email: 'financeiro@transrodoviario.com.br',
        contato: 'Carlos Mendes',
        condicaoPadrao: 28,
        cidade: 'Paulínia',
        uf: 'SP',
        bairro: 'Distrito Industrial',
        cep: '13140-000',
        logradouro: 'Av. dos Transportes, 1500',
        tipoPessoa: 'PJ',
        limiteCredito: 35000.00,
        saldoEmAberto: 8200.00,
        bloqueadoPorInadimplencia: false,
        regimeTributario: 'Lucro Presumido'
      },
      {
        id: 'c2',
        nome: 'Expresso Logística Bandeirantes',
        doc: '98.765.432/0001-10',
        fone: '19976543210',
        email: 'manutencao@expressolog.com.br',
        contato: 'Juliana Costa',
        condicaoPadrao: 21,
        cidade: 'Campinas',
        uf: 'SP',
        bairro: 'Jardim Garcia',
        cep: '13061-000',
        logradouro: 'Rua das Carretas, 420',
        tipoPessoa: 'PJ',
        limiteCredito: 25000.00,
        saldoEmAberto: 4500.00,
        bloqueadoPorInadimplencia: false,
        regimeTributario: 'Simples Nacional'
      },
      {
        id: 'c3',
        nome: 'Marcos Vinícius Silveira (Autônomo)',
        doc: '123.456.789-00',
        fone: '19965432109',
        email: 'marcos.caminhoneiro@gmail.com',
        contato: 'Marcos',
        condicaoPadrao: 0,
        cidade: 'Sumaré',
        uf: 'SP',
        bairro: 'Nova Veneza',
        cep: '13170-000',
        logradouro: 'Rua dos Eucaliptos, 88',
        tipoPessoa: 'PF',
        limiteCredito: 5000.00,
        saldoEmAberto: 0.00,
        bloqueadoPorInadimplencia: false,
        regimeTributario: ''
      },
      {
        id: 'c4',
        nome: 'AgroSul Grãos & Cargas Pesadas',
        doc: '45.678.901/0001-22',
        fone: '19954321098',
        email: 'frota@agrosulgraos.com.br',
        contato: 'Fernanda Leite',
        condicaoPadrao: 30,
        cidade: 'Hortolândia',
        uf: 'SP',
        bairro: 'Parque Industrial',
        cep: '13180-000',
        logradouro: 'Rodovia SP-101, km 14',
        tipoPessoa: 'PJ',
        limiteCredito: 50000.00,
        saldoEmAberto: 12400.00,
        bloqueadoPorInadimplencia: false,
        regimeTributario: 'Lucro Real'
      }
    ],
    veiculos: [
      { id: 'v1', placa: 'BRA2E19', frota: 'TR-102', modelo: 'Scania R450 6x2 Highline', ano: 2021, cor: 'Azul Metálico', km: 284500, motorista: 'Antônio Ferreira', foneMotorista: '11988881111', cli: 'c1' },
      { id: 'v2', placa: 'RIO9A88', frota: 'TR-108', modelo: 'Volvo FH 540 6x4 Globetrotter', ano: 2022, cor: 'Branco', km: 195200, motorista: 'Geraldo Nunes', foneMotorista: '11988882222', cli: 'c1' },
      { id: 'v3', placa: 'SPK3C44', frota: 'EXP-42', modelo: 'Mercedes-Benz Actros 2651', ano: 2020, cor: 'Prata', km: 340100, motorista: 'Rodrigo Lima', foneMotorista: '19988883333', cli: 'c2' },
      { id: 'v4', placa: 'DAF7F55', frota: 'EXP-55', modelo: 'DAF XF 530 Super Space', ano: 2023, cor: 'Vermelho', km: 89400, motorista: 'Fábio Santos', foneMotorista: '19988884444', cli: 'c2' },
      { id: 'v5', placa: 'BWX5521', frota: '01', modelo: 'Scania 113H 360 Topline (Toco)', ano: 1996, cor: 'Azul Escuro', km: 1420500, motorista: 'Marcos Vinícius', foneMotorista: '19965432109', cli: 'c3' },
      { id: 'v6', placa: 'AGR4D11', frota: 'AG-09', modelo: 'Volvo FH 460 6x2', ano: 2019, cor: 'Verde', km: 412000, motorista: 'Claudinei Ribeiro', foneMotorista: '19988885555', cli: 'c4' }
    ],
    servicos: [
      { id: 's1', nome: 'Revisão e Troca de Lonas de Freio (Por Eixo)', valor: 380.00, horas: 2.0, iss_cod: '14.01', iss_aliq: 5.0, cnae: '4520-0/01' },
      { id: 's2', nome: 'Retífica e Troca de Discos / Pastilhas de Freio', valor: 450.00, horas: 2.5, iss_cod: '14.01', iss_aliq: 5.0, cnae: '4520-0/01' },
      { id: 's3', nome: 'Substituição de Kit Embreagem Pesada (Platô/Disco)', valor: 1200.00, horas: 6.0, iss_cod: '14.01', iss_aliq: 5.0, cnae: '4520-0/01' },
      { id: 's4', nome: 'Troca de Óleo de Motor e Conjunto de Filtros', valor: 220.00, horas: 1.5, iss_cod: '14.01', iss_aliq: 5.0, cnae: '4520-0/01' },
      { id: 's5', nome: 'Embuchamento Completo de Eixo Dianteiro (Manga)', valor: 980.00, horas: 5.0, iss_cod: '14.01', iss_aliq: 5.0, cnae: '4520-0/01' },
      { id: 's6', nome: 'Alinhamento a Laser e Geometria de Chassi 6x2/6x4', valor: 520.00, horas: 2.0, iss_cod: '14.01', iss_aliq: 5.0, cnae: '4520-0/01' },
      { id: 's7', nome: 'Diagnóstico Computadorizado com Scanner Diesel', valor: 280.00, horas: 1.0, iss_cod: '14.01', iss_aliq: 5.0, cnae: '4520-0/01' },
      { id: 's8', nome: 'Revisão e Regulagem de Válvulas de Motor', valor: 750.00, horas: 3.5, iss_cod: '14.01', iss_aliq: 5.0, cnae: '4520-0/01' }
    ],
    pecas: [
      { id: 'p1', cod: 'SCN-1875892', nome: 'Jogo de Pastilhas de Freio Scania Série R (WVA 29174)', categoria: 'Freio', un: 'jg', qtd: 8, min: 3, custo: 320.00, venda: 540.00, loc: 'Prat. A-02', forn: 'Fras-le Peças', ncm: '87083019', cfop: '5102', cest: '01.053.00', origem: '0 - Nacional' },
      { id: 'p2', cod: 'VLV-2134567', nome: 'Filtro Separador Racor Volvo FH D13', categoria: 'Motor', un: 'un', qtd: 14, min: 5, custo: 85.00, venda: 165.00, loc: 'Prat. B-01', forn: 'Donaldson Filtros', ncm: '84212300', cfop: '5102', cest: '01.062.00', origem: '0 - Nacional' },
      { id: 'p3', cod: 'MBZ-004420', nome: 'Cuíca de Freio Dupla Tipo 30/30 Tristop', categoria: 'Freio', un: 'un', qtd: 4, min: 2, custo: 420.00, venda: 730.00, loc: 'Prat. C-04', forn: 'Knorr-Bremse', ncm: '87083090', cfop: '5102', cest: '01.053.00', origem: '1 - Estrangeira' },
      { id: 'p4', cod: 'LUB-15W40', nome: 'Óleo Motor Diesel 15W40 CI-4 Top Turbo (Galão 20L)', categoria: 'Motor', un: 'gl', qtd: 18, min: 6, custo: 290.00, venda: 480.00, loc: 'Depósito 01', forn: 'Lubrax Distribuidora', ncm: '27101932', cfop: '5405', cest: '06.002.00', origem: '0 - Nacional' },
      { id: 'p5', cod: 'WBC-480104', nome: 'Válvula Moduladora EBS/ABS Wabco', categoria: 'Freio', un: 'un', qtd: 2, min: 1, custo: 1250.00, venda: 2100.00, loc: 'Prat. E-01', forn: 'ZF Wabco Brasil', ncm: '87083090', cfop: '5102', cest: '01.053.00', origem: '1 - Estrangeira' },
      { id: 'p6', cod: 'SCN-2245890', nome: 'Kit Embreagem Cerâmica Scania 430mm Sachs', categoria: 'Embreagem', un: 'kt', qtd: 3, min: 1, custo: 2800.00, venda: 4450.00, loc: 'Pallet 03', forn: 'Sachs Embreagens', ncm: '87089300', cfop: '5102', cest: '01.045.00', origem: '0 - Nacional' },
      { id: 'p7', cod: 'FLT-AR540', nome: 'Elemento Filtro de Ar Primário Volvo FH4/FH5', categoria: 'Motor', un: 'un', qtd: 6, min: 3, custo: 190.00, venda: 340.00, loc: 'Prat. B-03', forn: 'Mann Filter', ncm: '84213100', cfop: '5102', cest: '01.062.00', origem: '0 - Nacional' },
      { id: 'p8', cod: 'MOL-VLVFH', nome: 'Feixe de Molas Dianteiro Parabólico Volvo FH', categoria: 'Molas', un: 'un', qtd: 5, min: 2, custo: 1450.00, venda: 2390.00, loc: 'Rack M-01', forn: 'Cofap Molas', ncm: '73201000', cfop: '5102', cest: '01.070.00', origem: '0 - Nacional' },
      { id: 'p9', cod: 'BUC-PIN28', nome: 'Jogo de Buchas de Bronze com Pino de Centro do Eixo', categoria: 'Embuchamento de Eixo', un: 'jg', qtd: 7, min: 2, custo: 380.00, venda: 690.00, loc: 'Prat. D-02', forn: 'Suporte Rei', ncm: '87088000', cfop: '5102', cest: '01.080.00', origem: '0 - Nacional' },
      { id: 'p10', cod: 'CRZ-SPC250', nome: 'Cruzeta de Transmissão Cardan Reforçada Spicer', categoria: 'Cardan', un: 'un', qtd: 6, min: 2, custo: 260.00, venda: 490.00, loc: 'Prat. C-01', forn: 'Dana Spicer', ncm: '87089990', cfop: '5102', cest: '01.085.00', origem: '0 - Nacional' },
      { id: 'p11', cod: 'AMT-SCH100', nome: 'Amortecedor Dianteiro Turbogás Pesado Sachs', categoria: 'Suspensão', un: 'un', qtd: 4, min: 2, custo: 520.00, venda: 890.00, loc: 'Prat. A-05', forn: 'Sachs', ncm: '87088000', cfop: '5102', cest: '01.075.00', origem: '0 - Nacional' }
    ]
  };
}

if (typeof window !== 'undefined') window.sementesCadastros = sementesCadastros;
if (typeof globalThis !== 'undefined') globalThis.sementesCadastros = sementesCadastros;

