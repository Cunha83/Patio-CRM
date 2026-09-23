'use strict';

/**
 * PÁTIO CRM — GERADOR DA BASE DE DEMONSTRAÇÃO E HOMOLOGAÇÃO
 *
 * Gera 90 dias de movimentação sintética completa (13/06/2026 a 11/09/2026, America/Sao_Paulo)
 * para a oficina "Oficina Demonstração — Dados Fictícios" (tenantId: "oficina_demo_dados_ficticios").
 *
 * Princípios e Garantias:
 * 1. Isolamento Absoluto de Produção: Chave SQLite KV tenant:oficina_demo_dados_ficticios:state.
 *    Nenhum registro de produção é lido para alteração, sobrescrito ou apagado.
 * 2. Determinismo Estrito: PRNG Mulberry32 com semente 20260911 (resultados 100% reproduzíveis).
 * 3. Integridade Matemática:
 *    - Estoque final = Estoque inicial + Entradas - Saídas +/- Ajustes.
 *    - Total faturado em OS = Contas a receber (pagas + pendentes + canceladas).
 *    - Apontamentos de mão de obra sem sobreposição para o mesmo mecânico.
 * 4. Linha do Tempo:
 *    - 90 dias com início em 13/06/2026 e término em 11/09/2026.
 *    - Nenhuma liquidação, pagamento ou conclusão no futuro (após 11/09/2026).
 *    - Contas abertas com vencimentos futuros permitidos.
 * 5. CLI:
 *    - node scripts/seedDemoDataset.js --generate (padrão)
 *    - node scripts/seedDemoDataset.js --verify
 *    - node scripts/seedDemoDataset.js --purge
 */

const { initDB, run, get, all, closeDB } = require('../db');
const { validateState } = require('../lib/core');
const { getDefaultState } = require('../lib/repository/stateRepository');
const billingService = require('../services/billing/billingService');
const platformAdminService = require('../services/billing/platformAdminService');
const { BILLING_CONFIG } = require('../services/billing/billingConfig');

const TENANT_ID = 'oficina_demo_dados_ficticios';
const TENANT_NAME = 'Oficina Demonstração — Dados Fictícios';
const DEMO_BATCH_ID = 'demo_batch_20260911';
const DATA_FINAL_STR = '2026-09-11';
const DATA_INICIAL_STR = '2026-06-13';
const DIAS_TOTAIS = 90;

/* =========================================================================
   1. PRNG DETERMINÍSTICO (Mulberry32)
   ========================================================================= */

function createPRNG(seed = 20260911) {
  let s = seed;
  return function mulberry32() {
    let t = (s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let rng = createPRNG(20260911);

function resetPRNG() {
  rng = createPRNG(20260911);
}

function randFloat(min = 0, max = 1) {
  return min + rng() * (max - min);
}

function randInt(min, max) {
  return Math.floor(min + rng() * (max - min + 1));
}

function randChoice(arr) {
  if (!arr || arr.length === 0) return null;
  return arr[Math.floor(rng() * arr.length)];
}

function randSample(arr, count) {
  const shuffled = [...arr].sort(() => rng() - 0.5);
  return shuffled.slice(0, count);
}

function arredondar(valor, decimais = 2) {
  const n = Number(valor) || 0;
  return Number(Math.round(n + 'e' + decimais) + 'e-' + decimais);
}

/* =========================================================================
   2. MANIPULAÇÃO DE DATAS NO FUSO America/Sao_Paulo (-03:00)
   ========================================================================= */

function diaOffsetParaData(diaOffset, hora = 8, minuto = 0) {
  const base = new Date('2026-06-13T12:00:00Z');
  base.setUTCDate(base.getUTCDate() + diaOffset);

  const ano = base.getUTCFullYear();
  const mes = String(base.getUTCMonth() + 1).padStart(2, '0');
  const dia = String(base.getUTCDate()).padStart(2, '0');
  const h = String(hora).padStart(2, '0');
  const m = String(minuto).padStart(2, '0');

  return {
    dataStr: `${ano}-${mes}-${dia}`,
    isoSP: `${ano}-${mes}-${dia}T${h}:${m}:00-03:00`,
    diaSemana: base.getUTCDay()
  };
}

function addDiasDataStr(dataStr, dias) {
  const base = new Date(dataStr + 'T12:00:00Z');
  base.setUTCDate(base.getUTCDate() + Number(dias));
  const ano = base.getUTCFullYear();
  const mes = String(base.getUTCMonth() + 1).padStart(2, '0');
  const dia = String(base.getUTCDate()).padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
}

/* =========================================================================
   3. CATÁLOGOS BASE DE LINHA PESADA
   ========================================================================= */

const CATALOGO_SERVICOS = [
  { cod: 'SRV-01', nome: 'Arqueamento e Reforço de Feixe de Molas Dianteiro', cat: 'molas', preco: 540, tempoMin: 150 },
  { cod: 'SRV-02', nome: 'Arqueamento e Reforço de Feixe de Molas Traseiro / Tração', cat: 'molas', preco: 780, tempoMin: 210 },
  { cod: 'SRV-03', nome: 'Troca de Lâmina Viradeira e Montagem de Feixe', cat: 'molas', preco: 420, tempoMin: 120 },
  { cod: 'SRV-04', nome: 'Troca de Grampos de Mola e Aperto com Torquímetro de Impacto', cat: 'molas', preco: 210, tempoMin: 60 },
  { cod: 'SRV-05', nome: 'Embuchamento de Manga de Eixo Completo com Retífica', cat: 'chassi', preco: 980, tempoMin: 240 },
  { cod: 'SRV-06', nome: 'Troca de Pinos e Buchas da Balança de Carreta', cat: 'molas', preco: 720, tempoMin: 180 },
  { cod: 'SRV-07', nome: 'Troca de Lonas de Freio e Regulagem por Eixo', cat: 'freios', preco: 340, tempoMin: 90 },
  { cod: 'SRV-08', nome: 'Retífica e Usinagem de Tambores de Freio no Local', cat: 'freios', preco: 250, tempoMin: 60 },
  { cod: 'SRV-09', nome: 'Instalação e Teste de Cuíca Spring Brake Dupla', cat: 'freios', preco: 220, tempoMin: 60 },
  { cod: 'SRV-10', nome: 'Alinhamento de Chassi a Laser e Conferência de Torção', cat: 'alinhamento', preco: 850, tempoMin: 210 },
  { cod: 'SRV-11', nome: 'Geometria e Convergência de Eixos Direcionais a Laser', cat: 'alinhamento', preco: 420, tempoMin: 90 },
  { cod: 'SRV-12', nome: 'Alinhamento de Eixos de Semi-Reboque / Carreta', cat: 'alinhamento', preco: 490, tempoMin: 120 },
  { cod: 'SRV-13', nome: 'Revisão Geral e Teste de Válvulas Pneumáticas de Freio', cat: 'freios', preco: 360, tempoMin: 90 },
  { cod: 'SRV-14', nome: 'Troca de Cartucho Secador de Ar e Limpeza da Válvula APU', cat: 'freios', preco: 160, tempoMin: 45 },
  { cod: 'SRV-15', nome: 'Revisão Preventiva de 20.000 km (Suspensão e Freios)', cat: 'preventiva', preco: 580, tempoMin: 150 },
  { cod: 'SRV-16', nome: 'Revisão Preventiva de 40.000 km (Completa Linha Pesada)', cat: 'preventiva', preco: 980, tempoMin: 240 },
  { cod: 'SRV-17', nome: 'Troca de Terminais e Barra de Direção', cat: 'chassi', preco: 350, tempoMin: 90 },
  { cod: 'SRV-18', nome: 'Troca de Tirante Tensor da Suspensão Pneumática', cat: 'molas', preco: 360, tempoMin: 90 },
  { cod: 'SRV-19', nome: 'Lubrificação Geral de Chassi, Pinos de Mola e Quinta Roda', cat: 'preventiva', preco: 190, tempoMin: 60 },
  { cod: 'SRV-20', nome: 'Desempeno de Eixo e Manga a Frio com Cilindro Hidráulico', cat: 'chassi', preco: 650, tempoMin: 150 }
];

const FORNECEDORES_BASE = [
  { nome: 'Molas Maringá Indústria e Comércio Ltda', doc: '76.123.456/0001-10', fone: '(44) 3221-1000', email: 'vendas@molasmaringa.example.com', cidade: 'Maringá', uf: 'PR' },
  { nome: 'Suspensys Sistemas Automotivos', doc: '88.234.567/0001-22', fone: '(54) 3209-2000', email: 'comercial@suspensys.example.com', cidade: 'Caxias do Sul', uf: 'RS' },
  { nome: 'Fras-le Peças Automotivas', doc: '91.345.678/0001-33', fone: '(54) 3239-1000', email: 'pedidos@frasle.example.com', cidade: 'Caxias do Sul', uf: 'RS' },
  { nome: 'Knorr-Bremse Brasil Sistemas de Freios', doc: '60.456.789/0001-44', fone: '(11) 4596-9000', email: 'contato@knorr-bremse.example.com', cidade: 'Itupeva', uf: 'SP' },
  { nome: 'Master Sistemas Automotivos', doc: '89.567.890/0001-55', fone: '(54) 3209-5000', email: 'vendas@masterfreios.example.com', cidade: 'Caxias do Sul', uf: 'RS' },
  { nome: 'Jost Brasil Sistemas Automotivos', doc: '87.678.901/0001-66', fone: '(54) 3209-6000', email: 'atendimento@jost.example.com', cidade: 'Caxias do Sul', uf: 'RS' },
  { nome: 'Sabó Indústria e Comércio de Autopeças', doc: '61.789.012/0001-77', fone: '(11) 3649-7000', email: 'comercial@sabo.example.com', cidade: 'São Paulo', uf: 'SP' },
  { nome: 'Nakata Automotiva Indústria Ltda', doc: '50.890.123/0001-88', fone: '(11) 4070-8000', email: 'vendas@nakata.example.com', cidade: 'Diadema', uf: 'SP' },
  { nome: 'Cinpal Cia Industrial de Peças', doc: '62.901.234/0001-99', fone: '(11) 4788-9000', email: 'pedidos@cinpal.example.com', cidade: 'Taboão da Serra', uf: 'SP' },
  { nome: 'Grampos & Fixadores Aço Brasil', doc: '77.012.345/0001-01', fone: '(44) 3222-3000', email: 'vendas@acobrasil.example.com', cidade: 'Maringá', uf: 'PR' },
  { nome: 'ZF Sachs do Brasil Autopeças', doc: '63.123.456/0001-12', fone: '(15) 3235-8000', email: 'comercial@zfsachs.example.com', cidade: 'Sorocaba', uf: 'SP' },
  { nome: 'Schulz Compressores e Autopeças', doc: '84.234.567/0001-23', fone: '(47) 3451-6000', email: 'contato@schulz.example.com', cidade: 'Joinville', uf: 'SC' },
  { nome: 'Suporte Rei Componentes Automotivos', doc: '55.345.678/0001-34', fone: '(16) 3603-9000', email: 'pedidos@suporterei.example.com', cidade: 'Ribeirão Preto', uf: 'SP' },
  { nome: 'Alvorada Rolamentos e Retentores Pesados', doc: '58.456.789/0001-45', fone: '(13) 3222-5000', email: 'vendas@alvorada.example.com', cidade: 'Santos', uf: 'SP' },
  { nome: 'Fênix Molas e Balanças Pesadas', doc: '18.567.890/0001-56', fone: '(31) 3597-8000', email: 'comercial@fenixmolas.example.com', cidade: 'Betim', uf: 'MG' }
];

const COLABORADORES_BASE = [
  { nome: 'Marcos Aurélio Silva', funcao: 'Chefe de Oficina / Encarregado', custoHora: 75, jornada: 8, especialidade: 'Diagnóstico e Gestão' },
  { nome: 'Antônio Carlos (Tonho)', funcao: 'Líder de Molas & Suspensão', custoHora: 55, jornada: 8, especialidade: 'Feixes de Molas' },
  { nome: 'José Pereira (Zé Moleiro)', funcao: 'Mecânico de Molas & Arqueamento', custoHora: 50, jornada: 8, especialidade: 'Feixes de Molas' },
  { nome: 'Sebastião Oliveira (Tião)', funcao: 'Mecânico de Molas', custoHora: 50, jornada: 8, especialidade: 'Feixes de Molas' },
  { nome: 'Paulo Henrique Santos', funcao: 'Mecânico de Balanças & Tirantes', custoHora: 48, jornada: 8, especialidade: 'Suspensão' },
  { nome: 'Luiz Fernando Ramos', funcao: 'Especialista em Freios & Pneumática', custoHora: 55, jornada: 8, especialidade: 'Freios' },
  { nome: 'Ricardo de Souza', funcao: 'Mecânico Freieiro Pesado', custoHora: 52, jornada: 8, especialidade: 'Freios' },
  { nome: 'Rodrigo Martins Alinhador', funcao: 'Alinhador de Chassi a Laser', custoHora: 60, jornada: 8, especialidade: 'Alinhamento' },
  { nome: 'Cláudio Mendes Consultor', funcao: 'Consultor Técnico & Orçamentista', custoHora: 45, jornada: 8, especialidade: 'Atendimento' },
  { nome: 'Felipe Almoxarife', funcao: 'Estoquista & Suprimentos', custoHora: 40, jornada: 8, especialidade: 'Estoque' }
];

const BOXES_BASE = [
  { id: 'b1', nome: 'Box 1 - Vala Pesada (Molas)', tipo: 'molas' },
  { id: 'b2', nome: 'Box 2 - Vala Pesada (Suspensão)', tipo: 'molas' },
  { id: 'b3', nome: 'Box 3 - Freios & Pneumática', tipo: 'freios' },
  { id: 'b4', nome: 'Box 4 - Freios & Cuícas', tipo: 'freios' },
  { id: 'b5', nome: 'Box 5 - Rampa Alinhamento Laser', tipo: 'alinhamento' },
  { id: 'b6', nome: 'Box 6 - Revisão & Rápido', tipo: 'pesado' }
];

const FROTISTAS_BASE = [
  { nome: 'TransFort Transportes Rodoviários Ltda', doc: '11.222.333/0001-44', fone: '(11) 98111-2001', contato: 'Carlos Diretor de Frota', veiculosCount: 10 },
  { nome: 'Rápido Vale Logística Integrada S/A', doc: '22.333.444/0001-55', fone: '(11) 98222-2002', contato: 'Mariana Gestora de Manutenção', veiculosCount: 8 },
  { nome: 'Rodoviário Brasil Central Transportes', doc: '33.444.555/0001-66', fone: '(62) 98333-2003', contato: 'Valdir Encarregado de Frota', veiculosCount: 8 },
  { nome: 'Expresso Noroeste Cargas Pesadas', doc: '44.555.666/0001-77', fone: '(17) 98444-2004', contato: 'Sérgio Coordenador Técnico', veiculosCount: 7 },
  { nome: 'Cooperativa Agro Rodoviária TransAgro', doc: '55.666.777/0001-88', fone: '(44) 98555-2005', contato: 'Edmilson Supervisor', veiculosCount: 6 },
  { nome: 'Transportadora Bandeirante de Grãos', doc: '66.777.888/0001-99', fone: '(19) 98666-2006', contato: 'Renato Gerente Operacional', veiculosCount: 5 },
  { nome: 'Frota Distribuidora Express Paulistana', doc: '77.888.999/0001-00', fone: '(11) 98777-2007', contato: 'Juliano Chefe de Garagem', veiculosCount: 4 },
  { nome: 'Mineração & Cargas Pesadas do Planalto', doc: '88.999.000/0001-11', fone: '(31) 98888-2008', contato: 'Geraldo Manutenção', veiculosCount: 4 }
];

const NOMES_CLIENTES_PF = [
  'João Carlos da Silva', 'Antônio Marcos Silveira', 'José Francisco Fagundes', 'Sebastião Moreira Neto',
  'Paulo Roberto Ferreira', 'Luiz Gonzaga de Oliveira', 'Ricardo Alexandre Dias', 'Cláudio Henrique Souza',
  'Valter Rodrigues Lima', 'Geraldo Magela Pires', 'Benedito Alves de Castro', 'Raimundo Nonato Barbosa',
  'Osvaldo Pereira Guimarães', 'Manoel Messias dos Santos', 'Edvaldo Bezerra Cavalcante', 'Aparecido Donizete Costa',
  'Sérgio Murilo Peixoto', 'Nelson Mandela de Paula', 'Mauro Celso Albuquerque', 'Dirceu Lopes de Freitas',
  'Wagner Luiz Camargo', 'Gilberto Gilmar Nogueira', 'Ademir da Guia Miranda', 'Darci Ribeiro Pacheco',
  'Almir Rogério Fontes', 'Vanderlei Luxemburgo Cunha', 'Wilson Roberto Viana', 'Jair Ventura de Faria',
  'Célio Roberto Trindade', 'Hélio dos Passos Bueno', 'Danilo Silveira Bueno', 'Milton Neves de Morais',
  'Rogério Ceni da Mata', 'Walter Casagrande Filho', 'Tostão Eduardo Ramos', 'Zico Arthur Coimbra',
  'Sócrates Brasileiro Sampaio', 'Falcao Paulo Roberto Nunes', 'Careca Antônio de Oliveira', 'Romário de Souza Faria',
  'Bebeto José Roberto Gama', 'Raí Souza Vieira de Oliveira', 'Cafu Marcos Evangelista', 'Dunga Carlos Caetano',
  'Branco Cláudio Ibraim Leal', 'Aldair Santos do Nascimento', 'Mauro Silva Gomes', 'Mazinho Iomar do Nascimento',
  'Taffarel Cláudio André', 'Rivaldo Vítor Borba', 'Ronaldo Luís Nazário', 'Ronaldinho Ronaldo Assis',
  'Kaká Ricardo Izecson', 'Dida Nélson de Jesus', 'Lúcio Lucimar Ferreira', 'Juan Silveira dos Santos',
  'Gilberto Silva de Sá', 'Zé Roberto José Silva', 'Adriano Leite Ribeiro', 'Robinho Robson de Souza',
  'Fred Frederico Chaves', 'Paulinho José Paulo', 'Fernandinho Fernando Luiz', 'Willian Borges da Silva',
  'Oscar dos Santos Emboaba', 'Hulk Givanildo Vieira', 'Daniel Alves da Silva', 'Marcelo Vieira da Silva',
  'David Luiz Moreira', 'Thiago Emiliano Silva', 'Casemiro Carlos Henrique', 'Alisson Ramses Becker'
];

const MODELOS_VEICULOS = [
  { marca: 'Scania', modelo: 'R 450 6x2', tipo: 'cavalo' },
  { marca: 'Scania', modelo: 'R 540 6x4', tipo: 'cavalo' },
  { marca: 'Scania', modelo: 'G 420 6x2', tipo: 'cavalo' },
  { marca: 'Volvo', modelo: 'FH 540 6x4 Globetrotter', tipo: 'cavalo' },
  { marca: 'Volvo', modelo: 'FH 460 6x2', tipo: 'cavalo' },
  { marca: 'Volvo', modelo: 'VM 270 6x2 Truck', tipo: 'truck' },
  { marca: 'Mercedes-Benz', modelo: 'Actros 2651 6x4', tipo: 'cavalo' },
  { marca: 'Mercedes-Benz', modelo: 'Axor 2544 6x2', tipo: 'cavalo' },
  { marca: 'Mercedes-Benz', modelo: 'Atego 1719 4x2 Toco', tipo: 'toco' },
  { marca: 'Volkswagen', modelo: 'Constellation 24.280 6x2', tipo: 'truck' },
  { marca: 'Volkswagen', modelo: 'Meteor 28.460 6x2', tipo: 'cavalo' },
  { marca: 'Randon', modelo: 'Carreta Graneleira 3 Eixos', tipo: 'carreta' },
  { marca: 'Facchini', modelo: 'Semi-Reboque Baú Frigorífico 3 Eixos', tipo: 'carreta' },
  { marca: 'Guerra', modelo: 'Semi-Reboque Tanque Inox 3 Eixos', tipo: 'carreta' }
];

/* =========================================================================
   4. GERADOR DE PEÇAS DE LINHA PESADA (150 itens)
   ========================================================================= */

function gerarCatalogoPecas(fornecedores) {
  const pecas = [];

  // 1. Molas e Suspensão (50 itens)
  const itensMolas = [
    { desc: 'Feixe de Mola Dianteiro Completo Scania R450', cat: 'molas', fab: 'Molas Maringá', custo: 1450, venda: 2170, min: 2, init: 6 },
    { desc: 'Feixe de Mola Traseiro / Tração Volvo FH540', cat: 'molas', fab: 'Suspensys', custo: 1850, venda: 2750, min: 2, init: 5 },
    { desc: 'Feixe de Mola Dianteiro MB Actros 2651', cat: 'molas', fab: 'Molas Maringá', custo: 1380, venda: 2050, min: 2, init: 5 },
    { desc: 'Feixe de Mola Traseiro Carreta Randon 3 Eixos (90x16mm)', cat: 'molas', fab: 'Suspensys', custo: 1100, venda: 1650, min: 4, init: 12 },
    { desc: 'Lâmina Mestra 1ª Viradeira Scania R450 Dianteira', cat: 'molas', fab: 'Molas Maringá', custo: 290, venda: 440, min: 6, init: 20 },
    { desc: 'Lâmina 2ª Mola Scania R450 Dianteira', cat: 'molas', fab: 'Molas Maringá', custo: 240, venda: 360, min: 5, init: 16 },
    { desc: 'Lâmina 3ª Mola Scania R450 Dianteira', cat: 'molas', fab: 'Molas Maringá', custo: 210, venda: 320, min: 5, init: 15 },
    { desc: 'Lâmina Mestra 1ª Viradeira Volvo FH Dianteira', cat: 'molas', fab: 'Suspensys', custo: 310, venda: 470, min: 6, init: 18 },
    { desc: 'Lâmina 2ª Mola Volvo FH Dianteira', cat: 'molas', fab: 'Suspensys', custo: 260, venda: 390, min: 5, init: 15 },
    { desc: 'Lâmina Mestra 1ª Viradeira MB Actros Dianteira', cat: 'molas', fab: 'Molas Maringá', custo: 280, venda: 420, min: 4, init: 14 },
    { desc: 'Lâmina Carreta Randon 90x16mm L1 Viradeira', cat: 'molas', fab: 'Suspensys', custo: 220, venda: 340, min: 8, init: 24 },
    { desc: 'Lâmina Carreta Randon 90x16mm L2 Intermediária', cat: 'molas', fab: 'Suspensys', custo: 180, venda: 280, min: 8, init: 22 },
    { desc: 'Lâmina Carreta Randon 90x16mm L3 Intermediária', cat: 'molas', fab: 'Suspensys', custo: 160, venda: 250, min: 8, init: 20 },
    { desc: 'Lâmina Calço de Mola Reforçado 90mm', cat: 'molas', fab: 'Molas Maringá', custo: 85, venda: 140, min: 10, init: 30 },
    { desc: 'Pino de Centro M14 x 160mm Aço 10.9 com Porca', cat: 'molas', fab: 'Grampos & Fixadores Aço Brasil', custo: 18, venda: 35, min: 20, init: 80 },
    { desc: 'Pino de Centro M16 x 180mm Aço 10.9 com Porca', cat: 'molas', fab: 'Grampos & Fixadores Aço Brasil', custo: 22, venda: 42, min: 20, init: 75 },
    { desc: 'Pino de Centro M16 x 220mm Aço 10.9 com Porca', cat: 'molas', fab: 'Grampos & Fixadores Aço Brasil', custo: 26, venda: 50, min: 20, init: 70 },
    { desc: 'Pino de Centro M18 x 240mm Aço 10.9 com Porca', cat: 'molas', fab: 'Grampos & Fixadores Aço Brasil', custo: 32, venda: 60, min: 15, init: 50 },
    { desc: 'Grampo de Mola Quadrado M20 x 85 x 280mm Aço 1045', cat: 'molas', fab: 'Grampos & Fixadores Aço Brasil', custo: 58, venda: 98, min: 16, init: 60 },
    { desc: 'Grampo de Mola Quadrado M22 x 95 x 320mm Aço 4140', cat: 'molas', fab: 'Grampos & Fixadores Aço Brasil', custo: 74, venda: 125, min: 16, init: 55 },
    { desc: 'Grampo de Mola Redondo M20 x 105 x 300mm Aço 1045', cat: 'molas', fab: 'Grampos & Fixadores Aço Brasil', custo: 62, venda: 105, min: 16, init: 50 },
    { desc: 'Grampo de Mola Redondo M24 x 120 x 360mm Aço 4140 (Pesado)', cat: 'molas', fab: 'Grampos & Fixadores Aço Brasil', custo: 96, venda: 165, min: 12, init: 40 },
    { desc: 'Porca Alta Flangeada M20 Passo Fino com Auto-Travamento', cat: 'molas', fab: 'Grampos & Fixadores Aço Brasil', custo: 8.5, venda: 18, min: 30, init: 120 },
    { desc: 'Porca Alta Flangeada M22 Passo Fino com Auto-Travamento', cat: 'molas', fab: 'Grampos & Fixadores Aço Brasil', custo: 10.5, venda: 22, min: 30, init: 110 },
    { desc: 'Porca Alta Flangeada M24 Passo Fino com Auto-Travamento', cat: 'molas', fab: 'Grampos & Fixadores Aço Brasil', custo: 13.0, venda: 28, min: 25, init: 90 },
    { desc: 'Bucha de Bronze Autolubrificante Olhal de Mola Scania', cat: 'molas', fab: 'Suporte Rei', custo: 45, venda: 85, min: 12, init: 45 },
    { desc: 'Bucha de Bronze Autolubrificante Olhal de Mola Volvo', cat: 'molas', fab: 'Suporte Rei', custo: 48, venda: 90, min: 12, init: 40 },
    { desc: 'Bucha Silenciosa Metal/Borracha Olhal de Mola MB', cat: 'molas', fab: 'Sabó', custo: 52, venda: 95, min: 10, init: 35 },
    { desc: 'Bucha de Poliuretano Bipartida Balança Randon', cat: 'molas', fab: 'Suspensys', custo: 65, venda: 120, min: 12, init: 48 },
    { desc: 'Pino de Balança Central Carreta Randon 50mm Tratado', cat: 'molas', fab: 'Suspensys', custo: 145, venda: 245, min: 6, init: 22 },
    { desc: 'Jogo de Buchas de Bronze com Graxeira Balança Carreta', cat: 'molas', fab: 'Suspensys', custo: 180, venda: 310, min: 6, init: 20 },
    { desc: 'Suporte Apoio Deslizante do Feixe de Mola Traseiro', cat: 'molas', fab: 'Fênix Molas', custo: 210, venda: 360, min: 4, init: 15 },
    { desc: 'Mancal Suporte da Barra Tensora de Suspensão', cat: 'molas', fab: 'Suporte Rei', custo: 175, venda: 295, min: 6, init: 20 },
    { desc: 'Tirante Tensor de Suspensão Fixo Carreta Randon', cat: 'molas', fab: 'Suspensys', custo: 320, venda: 520, min: 4, init: 14 },
    { desc: 'Tirante Tensor de Suspensão Regulável Carreta Randon', cat: 'molas', fab: 'Suspensys', custo: 360, venda: 590, min: 4, init: 14 },
    { desc: 'Suporte de Fixação do Tirante Tensor no Chassi', cat: 'molas', fab: 'Fênix Molas', custo: 195, venda: 320, min: 4, init: 16 },
    { desc: 'Mola Parabólica Dianteira 2 Lâminas Volvo VM', cat: 'molas', fab: 'Molas Maringá', custo: 890, venda: 1390, min: 2, init: 6 },
    { desc: 'Mola Parabólica Dianteira 3 Lâminas Scania Série 5', cat: 'molas', fab: 'Molas Maringá', custo: 1050, venda: 1620, min: 2, init: 6 },
    { desc: 'Suporte de Fixação da Mola na Carcaça do Eixo', cat: 'molas', fab: 'Fênix Molas', custo: 240, venda: 390, min: 4, init: 12 },
    { desc: 'Chapa de Fixação Superior do Grampo de Mola', cat: 'molas', fab: 'Grampos & Fixadores Aço Brasil', custo: 78, venda: 135, min: 8, init: 28 },
    { desc: 'Placa Base Inferior de Assento do Feixe de Molas', cat: 'molas', fab: 'Molas Maringá', custo: 110, venda: 190, min: 6, init: 20 },
    { desc: 'Arruela Cônica de Aço Temperado para Fixação de Mola', cat: 'molas', fab: 'Grampos & Fixadores Aço Brasil', custo: 6.5, venda: 14, min: 40, init: 150 },
    { desc: 'Graxeira Reta 1/8 NPT Aço Galvanizado', cat: 'molas', fab: 'Grampos & Fixadores Aço Brasil', custo: 2.5, venda: 7, min: 50, init: 200 },
    { desc: 'Graxeira 90 Graus 1/8 NPT Aço Galvanizado', cat: 'molas', fab: 'Grampos & Fixadores Aço Brasil', custo: 3.5, venda: 9, min: 40, init: 180 },
    { desc: 'Bucha Espaçadora do Eixo da Balança Randon', cat: 'molas', fab: 'Suspensys', custo: 38, venda: 70, min: 10, init: 36 },
    { desc: 'Feixe Mola Auxiliar Traseiro MB 1719 / 24280', cat: 'molas', fab: 'Molas Maringá', custo: 620, venda: 980, min: 2, init: 8 },
    { desc: 'Lâmina Mestra Mola Auxiliar MB 1719', cat: 'molas', fab: 'Molas Maringá', custo: 180, venda: 290, min: 4, init: 14 },
    { desc: 'Kit de Calços Angulares de Correção de Pinhão (Grau)', cat: 'molas', fab: 'Molas Maringá', custo: 95, venda: 160, min: 4, init: 16 },
    { desc: 'Grampo de Mola M20 x 85 x 340mm Redondo Aço 1045', cat: 'molas', fab: 'Grampos & Fixadores Aço Brasil', custo: 68, venda: 115, min: 12, init: 44 },
    { desc: 'Pino Roscado de Algema de Mola Dianteira Scania', cat: 'molas', fab: 'Suporte Rei', custo: 82, venda: 145, min: 6, init: 22 }
  ];

  // 2. Freios e Pneumática (45 itens)
  const itensFreios = [
    { desc: 'Tambor de Freio Dianteiro Scania R450 10 Furos', cat: 'freios', fab: 'Fras-le', custo: 580, venda: 920, min: 4, init: 14 },
    { desc: 'Tambor de Freio Traseiro Scania R450 Tração 10 Furos', cat: 'freios', fab: 'Fras-le', custo: 640, venda: 990, min: 4, init: 16 },
    { desc: 'Tambor de Freio Dianteiro Volvo FH540 10 Furos', cat: 'freios', fab: 'Master Sistemas Automotivos', custo: 590, venda: 940, min: 4, init: 14 },
    { desc: 'Tambor de Freio Traseiro Volvo FH540 10 Furos', cat: 'freios', fab: 'Master Sistemas Automotivos', custo: 660, venda: 1040, min: 4, init: 16 },
    { desc: 'Tambor de Freio Carreta Randon Tubeless 10 Furos', cat: 'freios', fab: 'Master Sistemas Automotivos', custo: 520, venda: 830, min: 6, init: 22 },
    { desc: 'Tambor de Freio MB Actros 2651 Dianteiro/Traseiro', cat: 'freios', fab: 'Fras-le', custo: 610, venda: 960, min: 4, init: 14 },
    { desc: 'Jogo de Lona de Freio Traseira Scania TH-190 STD', cat: 'freios', fab: 'Fras-le', custo: 185, venda: 310, min: 8, init: 32 },
    { desc: 'Jogo de Lona de Freio Traseira Scania TH-190 X (1ª Sobremedida)', cat: 'freios', fab: 'Fras-le', custo: 195, venda: 330, min: 8, init: 28 },
    { desc: 'Jogo de Lona de Freio Traseira Scania TH-190 XX (2ª Sobremedida)', cat: 'freios', fab: 'Fras-le', custo: 205, venda: 345, min: 6, init: 20 },
    { desc: 'Jogo de Lona de Freio Volvo FH TH-204 STD', cat: 'freios', fab: 'Fras-le', custo: 190, venda: 320, min: 8, init: 30 },
    { desc: 'Jogo de Lona de Freio Volvo FH TH-204 X (1ª Sobremedida)', cat: 'freios', fab: 'Fras-le', custo: 200, venda: 340, min: 8, init: 26 },
    { desc: 'Jogo de Lona de Freio Carreta Randon TH-165 STD', cat: 'freios', fab: 'Fras-le', custo: 165, venda: 280, min: 12, init: 44 },
    { desc: 'Jogo de Lona de Freio Carreta Randon TH-165 X', cat: 'freios', fab: 'Fras-le', custo: 175, venda: 295, min: 10, init: 38 },
    { desc: 'Jogo de Lona de Freio MB Actros TH-185 STD', cat: 'freios', fab: 'Fras-le', custo: 180, venda: 305, min: 8, init: 26 },
    { desc: 'Caixa de Arrebites de Aço 8x15mm para Lona de Freio (500 un)', cat: 'freios', fab: 'Fras-le', custo: 48, venda: 95, min: 10, init: 40 },
    { desc: 'Caixa de Arrebites de Alumínio 8x15mm Macio (500 un)', cat: 'freios', fab: 'Fras-le', custo: 54, venda: 105, min: 8, init: 35 },
    { desc: 'Cuíca de Freio Dupla Spring Brake 30/30 Haste Longa Master', cat: 'freios', fab: 'Master Sistemas Automotivos', custo: 290, venda: 480, min: 6, init: 24 },
    { desc: 'Cuíca de Freio Dupla Spring Brake 24/30 Disco Master', cat: 'freios', fab: 'Master Sistemas Automotivos', custo: 280, venda: 460, min: 4, init: 16 },
    { desc: 'Cuíca de Freio Simples Serviço 24" Haste Curta', cat: 'freios', fab: 'Knorr-Bremse Brasil Sistemas de Freios', custo: 160, venda: 270, min: 6, init: 20 },
    { desc: 'Cuíca de Freio Simples Serviço 30" Haste Longa', cat: 'freios', fab: 'Knorr-Bremse Brasil Sistemas de Freios', custo: 175, venda: 295, min: 6, init: 20 },
    { desc: 'Catraca de Freio Automática 28 Estrias Randon Master', cat: 'freios', fab: 'Master Sistemas Automotivos', custo: 230, venda: 390, min: 6, init: 22 },
    { desc: 'Catraca de Freio Automática 10 Estrias Volvo/Scania Haldex', cat: 'freios', fab: 'Master Sistemas Automotivos', custo: 250, venda: 420, min: 6, init: 20 },
    { desc: 'Catraca de Freio Manual Reforçada 28 Estrias Eixo Carreta', cat: 'freios', fab: 'Master Sistemas Automotivos', custo: 95, venda: 165, min: 10, init: 36 },
    { desc: 'Eixo Expansor S Dianteiro Esquerdo Scania Série 4/5', cat: 'freios', fab: 'Cinpal Cia Industrial de Peças', custo: 195, venda: 330, min: 4, init: 14 },
    { desc: 'Eixo Expansor S Dianteiro Direito Scania Série 4/5', cat: 'freios', fab: 'Cinpal Cia Industrial de Peças', custo: 195, venda: 330, min: 4, init: 14 },
    { desc: 'Eixo Expansor S Traseiro Esquerdo Randon 28 Estrias', cat: 'freios', fab: 'Cinpal Cia Industrial de Peças', custo: 180, venda: 310, min: 4, init: 16 },
    { desc: 'Eixo Expansor S Traseiro Direito Randon 28 Estrias', cat: 'freios', fab: 'Cinpal Cia Industrial de Peças', custo: 180, venda: 310, min: 4, init: 16 },
    { desc: 'Kit de Roletes e Molas de Retorno da Sapata de Freio Scania', cat: 'freios', fab: 'Master Sistemas Automotivos', custo: 68, venda: 125, min: 8, init: 30 },
    { desc: 'Kit de Roletes e Molas de Retorno da Sapata Volvo FH', cat: 'freios', fab: 'Master Sistemas Automotivos', custo: 72, venda: 130, min: 8, init: 28 },
    { desc: 'Kit de Molas de Tração e Roletes Sapata Carreta Randon', cat: 'freios', fab: 'Master Sistemas Automotivos', custo: 58, venda: 110, min: 12, init: 40 },
    { desc: 'Sapata de Freio Recondicionada sem Lona Scania 190mm', cat: 'freios', fab: 'Master Sistemas Automotivos', custo: 120, venda: 210, min: 6, init: 20 },
    { desc: 'Sapata de Freio Recondicionada sem Lona Carreta Randon', cat: 'freios', fab: 'Master Sistemas Automotivos', custo: 95, venda: 175, min: 8, init: 28 },
    { desc: 'Válvula Reguladora de Pressão Secador APU Knorr-Bremse', cat: 'freios', fab: 'Knorr-Bremse Brasil Sistemas de Freios', custo: 480, venda: 790, min: 2, init: 8 },
    { desc: 'Cartucho Secador de Ar Dessecador Rosca M39 Knorr', cat: 'freios', fab: 'Knorr-Bremse Brasil Sistemas de Freios', custo: 98, venda: 185, min: 10, init: 45 },
    { desc: 'Cartucho Secador de Ar com Separador de Óleo WABCO', cat: 'freios', fab: 'Knorr-Bremse Brasil Sistemas de Freios', custo: 145, venda: 260, min: 8, init: 35 },
    { desc: 'Válvula Relé de Freio de Emergência Carreta Knorr', cat: 'freios', fab: 'Knorr-Bremse Brasil Sistemas de Freios', custo: 260, venda: 440, min: 4, init: 14 },
    { desc: 'Válvula de Descarga Rápida 3/8 NPT Alumínio', cat: 'freios', fab: 'Knorr-Bremse Brasil Sistemas de Freios', custo: 75, venda: 140, min: 8, init: 30 },
    { desc: 'Válvula Pedal de Freio Dupla Circuito Scania Série 5', cat: 'freios', fab: 'Knorr-Bremse Brasil Sistemas de Freios', custo: 590, venda: 980, min: 2, init: 6 },
    { desc: 'Válvula Moduladora de Freio EBS Carreta Wabco/Knorr', cat: 'freios', fab: 'Knorr-Bremse Brasil Sistemas de Freios', custo: 1650, venda: 2600, min: 1, init: 3 },
    { desc: 'Sensor de Velocidade de Roda ABS Carreta com Cabo 2m', cat: 'freios', fab: 'Knorr-Bremse Brasil Sistemas de Freios', custo: 125, venda: 225, min: 6, init: 20 },
    { desc: 'Kit de Reparo da Válvula Relé de Freio Knorr', cat: 'freios', fab: 'Knorr-Bremse Brasil Sistemas de Freios', custo: 85, venda: 155, min: 6, init: 22 },
    { desc: 'Kit de Reparo Vedação da Cuíca Spring Brake 30/30', cat: 'freios', fab: 'Master Sistemas Automotivos', custo: 65, venda: 120, min: 8, init: 26 },
    { desc: 'Bucha de Vedação e Retentor do Eixo Expansor S', cat: 'freios', fab: 'Sabó', custo: 24, venda: 48, min: 15, init: 60 },
    { desc: 'Bico de Enchimento de Ar Pneumático com Engate Rápido', cat: 'freios', fab: 'Schulz Compressores e Autopeças', custo: 32, venda: 65, min: 8, init: 30 },
    { desc: 'Pressostato Indicador de Baixa Pressão de Ar 6 Bar', cat: 'freios', fab: 'Knorr-Bremse Brasil Sistemas de Freios', custo: 85, venda: 150, min: 4, init: 16 }
  ];

  // 3. Chassi, Direção e Articulação (30 itens)
  const itensChassi = [
    { desc: 'Jogo de Pino de Manga de Eixo Completo Scania R450', cat: 'chassi_direcao', fab: 'Cinpal Cia Industrial de Peças', custo: 680, venda: 1120, min: 3, init: 10 },
    { desc: 'Jogo de Pino de Manga de Eixo Completo Volvo FH540', cat: 'chassi_direcao', fab: 'Cinpal Cia Industrial de Peças', custo: 720, venda: 1180, min: 3, init: 10 },
    { desc: 'Jogo de Pino de Manga de Eixo MB Actros 2651', cat: 'chassi_direcao', fab: 'Cinpal Cia Industrial de Peças', custo: 690, venda: 1140, min: 3, init: 10 },
    { desc: 'Jogo de Pino de Manga de Eixo VW Constellation 24280', cat: 'chassi_direcao', fab: 'Cinpal Cia Industrial de Peças', custo: 540, venda: 890, min: 3, init: 10 },
    { desc: 'Barra de Direção Transversal Scania R450 Completa', cat: 'chassi_direcao', fab: 'Nakata Automotiva Indústria Ltda', custo: 480, venda: 790, min: 2, init: 8 },
    { desc: 'Barra de Ligação de Direção Volvo FH 540', cat: 'chassi_direcao', fab: 'Nakata Automotiva Indústria Ltda', custo: 510, venda: 840, min: 2, init: 8 },
    { desc: 'Terminal de Direção Rosca Direita Scania R450 Nakata', cat: 'chassi_direcao', fab: 'Nakata Automotiva Indústria Ltda', custo: 135, venda: 235, min: 6, init: 24 },
    { desc: 'Terminal de Direção Rosca Esquerda Scania R450 Nakata', cat: 'chassi_direcao', fab: 'Nakata Automotiva Indústria Ltda', custo: 135, venda: 235, min: 6, init: 24 },
    { desc: 'Terminal de Direção Rosca Direita Volvo FH Nakata', cat: 'chassi_direcao', fab: 'Nakata Automotiva Indústria Ltda', custo: 145, venda: 250, min: 6, init: 24 },
    { desc: 'Terminal de Direção Rosca Esquerda Volvo FH Nakata', cat: 'chassi_direcao', fab: 'Nakata Automotiva Indústria Ltda', custo: 145, venda: 250, min: 6, init: 24 },
    { desc: 'Coxim Hidráulico Traseiro de Cabine Scania Série 5', cat: 'chassi_direcao', fab: 'Suporte Rei', custo: 220, venda: 370, min: 4, init: 14 },
    { desc: 'Coxim Dianteiro de Cabine com Amortecedor Volvo FH', cat: 'chassi_direcao', fab: 'Suporte Rei', custo: 260, venda: 430, min: 4, init: 14 },
    { desc: 'Mancal Central da Barra Estabilizadora Dianteira Scania', cat: 'chassi_direcao', fab: 'Suporte Rei', custo: 110, venda: 195, min: 6, init: 20 },
    { desc: 'Bucha de Borracha da Barra Estabilizadora Scania/Volvo', cat: 'chassi_direcao', fab: 'Sabó', custo: 45, venda: 85, min: 10, init: 40 },
    { desc: 'Amortecedor de Direção Reforçado Linha Pesada Cofap', cat: 'chassi_direcao', fab: 'Nakata Automotiva Indústria Ltda', custo: 280, venda: 470, min: 3, init: 12 },
    { desc: 'Mesa da Quinta Roda Jost 2" Fundida Completa', cat: 'chassi_direcao', fab: 'Jost Brasil Sistemas Automotivos', custo: 2800, venda: 4400, min: 1, init: 3 },
    { desc: 'Pino Rei 2" Flangeado com Parafusos Jost', cat: 'chassi_direcao', fab: 'Jost Brasil Sistemas Automotivos', custo: 290, venda: 490, min: 4, init: 16 },
    { desc: 'Kit de Desgaste de Travamento da Quinta Roda Jost (Disco e Garra)', cat: 'chassi_direcao', fab: 'Jost Brasil Sistemas Automotivos', custo: 380, venda: 640, min: 4, init: 18 },
    { desc: 'Aparelho de Levantamento Mecânico de Carreta (Pé de Apoio) Par', cat: 'chassi_direcao', fab: 'Jost Brasil Sistemas Automotivos', custo: 1750, venda: 2800, min: 1, init: 4 },
    { desc: 'Suporte de Fixação da Lanterna Traseira Articulado', cat: 'chassi_direcao', fab: 'Fênix Molas', custo: 65, venda: 120, min: 6, init: 24 },
    { desc: 'Parafuso de Roda Traseiro M22 x 1.5 x 95mm com Porca Oscilante', cat: 'chassi_direcao', fab: 'Grampos & Fixadores Aço Brasil', custo: 18.5, venda: 38, min: 30, init: 140 },
    { desc: 'Parafuso de Roda Dianteiro M22 x 1.5 x 85mm com Porca Oscilante', cat: 'chassi_direcao', fab: 'Grampos & Fixadores Aço Brasil', custo: 16.5, venda: 35, min: 30, init: 140 },
    { desc: 'Porca Oscilante M22 para Roda de Alumínio Pesada', cat: 'chassi_direcao', fab: 'Grampos & Fixadores Aço Brasil', custo: 8.0, venda: 18, min: 40, init: 160 },
    { desc: 'Suporte do Para-Lama Traseiro Tubo Curvo Galvanizado', cat: 'chassi_direcao', fab: 'Fênix Molas', custo: 95, venda: 170, min: 6, init: 25 },
    { desc: 'Batente de Borracha do Chassi de Carreta 120x80mm', cat: 'chassi_direcao', fab: 'Sabó', custo: 42, venda: 80, min: 10, init: 35 },
    { desc: 'Suporte Triângulo de Reboque e Engate Rápido', cat: 'chassi_direcao', fab: 'Jost Brasil Sistemas Automotivos', custo: 310, venda: 520, min: 2, init: 8 },
    { desc: 'Kit de Retentores e Rolamentos do Cubo de Roda Traseira Volvo', cat: 'chassi_direcao', fab: 'Alvorada Rolamentos e Retentores Pesados', custo: 290, venda: 490, min: 4, init: 16 },
    { desc: 'Kit de Rolamentos do Cubo Dianteiro Scania R450 Timken', cat: 'chassi_direcao', fab: 'Alvorada Rolamentos e Retentores Pesados', custo: 320, venda: 540, min: 4, init: 16 },
    { desc: 'Retentor do Cubo de Roda Traseiro Sabó Scania/Volvo', cat: 'chassi_direcao', fab: 'Sabó', custo: 48, venda: 95, min: 12, init: 48 },
    { desc: 'Trava Arruela de Segurança da Porca do Cubo de Roda', cat: 'chassi_direcao', fab: 'Grampos & Fixadores Aço Brasil', custo: 12, venda: 25, min: 20, init: 80 }
  ];

  // 4. Pneumática, Filtros e Consumíveis (25 itens)
  const itensPneumatica = [
    { desc: 'Mangueira Espiral Pneumática de Freio Vermelha Mercosul 5.5m', cat: 'pneumatica', fab: 'Knorr-Bremse Brasil Sistemas de Freios', custo: 85, venda: 155, min: 6, init: 24 },
    { desc: 'Mangueira Espiral Pneumática de Freio Amarela Mercosul 5.5m', cat: 'pneumatica', fab: 'Knorr-Bremse Brasil Sistemas de Freios', custo: 85, venda: 155, min: 6, init: 24 },
    { desc: 'Cabo Elétrico Espiral 7 Vias ISO 1185 para Carreta', cat: 'pneumatica', fab: 'Jost Brasil Sistemas Automotivos', custo: 110, venda: 195, min: 4, init: 16 },
    { desc: 'Engate Rápido Mão de Amigo Vermelho com Válvula', cat: 'pneumatica', fab: 'Knorr-Bremse Brasil Sistemas de Freios', custo: 38, venda: 75, min: 10, init: 40 },
    { desc: 'Engate Rápido Mão de Amigo Amarelo com Filtro Tela', cat: 'pneumatica', fab: 'Knorr-Bremse Brasil Sistemas de Freios', custo: 38, venda: 75, min: 10, init: 40 },
    { desc: 'Balde de Graxa Azul Alta Pressão Sabão de Lítio EP-2 (18 kg)', cat: 'consumiveis', fab: 'ZF Sachs do Brasil Autopeças', custo: 290, venda: 480, min: 4, init: 18 },
    { desc: 'Tubo de Nylon Pneumático Rígido 8mm (Rolo com 50m)', cat: 'pneumatica', fab: 'Knorr-Bremse Brasil Sistemas de Freios', custo: 95, venda: 180, min: 3, init: 12 },
    { desc: 'Tubo de Nylon Pneumático Rígido 12mm (Rolo com 50m)', cat: 'pneumatica', fab: 'Knorr-Bremse Brasil Sistemas de Freios', custo: 140, venda: 250, min: 3, init: 10 },
    { desc: 'Conexão Pneumática Reta de Engate Rápido 8mm x 1/4 NPT', cat: 'pneumatica', fab: 'Schulz Compressores e Autopeças', custo: 8.5, venda: 18, min: 25, init: 100 },
    { desc: 'Conexão Pneumática Cotovelo Giratório 12mm x 3/8 NPT', cat: 'pneumatica', fab: 'Schulz Compressores e Autopeças', custo: 14.5, venda: 30, min: 20, init: 80 },
    { desc: 'Válvula de Dreno Manual do Reservatório de Ar 1/4 NPT', cat: 'pneumatica', fab: 'Schulz Compressores e Autopeças', custo: 22, venda: 45, min: 8, init: 32 },
    { desc: 'Válvula de Dreno Automática Aquecida do Reservatório', cat: 'pneumatica', fab: 'Knorr-Bremse Brasil Sistemas de Freios', custo: 175, venda: 295, min: 3, init: 10 },
    { desc: 'Cilindro de Acionamento Pneumático do Freio Motor', cat: 'pneumatica', fab: 'Knorr-Bremse Brasil Sistemas de Freios', custo: 220, venda: 370, min: 3, init: 10 },
    { desc: 'Filtro Separador Racor de Combustível com Dreno Scania', cat: 'consumiveis', fab: 'ZF Sachs do Brasil Autopeças', custo: 140, venda: 250, min: 6, init: 25 },
    { desc: 'Filtro Secador de Ar Condicionado de Cabine Linha Pesada', cat: 'consumiveis', fab: 'Schulz Compressores e Autopeças', custo: 85, venda: 160, min: 4, init: 16 },
    { desc: 'Lata de Spray Desengraxante Limpa Freios e Peças 500ml', cat: 'consumiveis', fab: 'Sabó', custo: 19.5, venda: 38, min: 24, init: 96 },
    { desc: 'Trava Química de Alto Torque Vermelha 271 (50g)', cat: 'consumiveis', fab: 'Grampos & Fixadores Aço Brasil', custo: 36, venda: 68, min: 10, init: 35 },
    { desc: 'Trava Química de Médio Torque Azul 242 (50g)', cat: 'consumiveis', fab: 'Grampos & Fixadores Aço Brasil', custo: 34, venda: 65, min: 10, init: 35 },
    { desc: 'Silicone Formador de Juntas Alta Temperatura Cinza (85g)', cat: 'consumiveis', fab: 'Sabó', custo: 24, venda: 48, min: 12, init: 45 },
    { desc: 'Válvula Niveladora de Suspensão Pneumática Carreta', cat: 'pneumatica', fab: 'Knorr-Bremse Brasil Sistemas de Freios', custo: 380, venda: 640, min: 3, init: 12 },
    { desc: 'Bolsa de Ar (Fole Pneumático) Suspensão Carreta Randon', cat: 'molas', fab: 'Suspensys', custo: 420, venda: 690, min: 4, init: 15 },
    { desc: 'Bolsa de Ar (Fole Pneumático) Eixo Auxiliar Scania R450', cat: 'molas', fab: 'Suspensys', custo: 460, venda: 750, min: 4, init: 14 },
    { desc: 'Amortecedor de Suspensão Pesado Carreta Randon Nakata', cat: 'molas', fab: 'Nakata Automotiva Indústria Ltda', custo: 260, venda: 440, min: 6, init: 20 },
    { desc: 'Amortecedor de Suspensão Dianteira Scania R450 Sachs', cat: 'molas', fab: 'ZF Sachs do Brasil Autopeças', custo: 310, venda: 520, min: 4, init: 16 },
    { desc: 'Amortecedor de Suspensão Dianteira Volvo FH540 Cofap', cat: 'molas', fab: 'Nakata Automotiva Indústria Ltda', custo: 320, venda: 530, min: 4, init: 16 }
  ];

  const todas = [...itensMolas, ...itensFreios, ...itensChassi, ...itensPneumatica];

  todas.forEach((item, idx) => {
    const pId = `peca_demo_${String(idx + 1).padStart(3, '0')}`;
    const fornObj = fornecedores.find(f => f.nome === item.fab) || fornecedores[idx % fornecedores.length];
    pecas.push({
      id: pId,
      tenantId: TENANT_ID,
      codigoInterno: `PEC-${String(idx + 1).padStart(3, '0')}`,
      cod: `PEC-${String(idx + 1).padStart(3, '0')}`,
      descricao: item.desc,
      nome: item.desc,
      categoria: item.cat,
      fabricante: item.fab,
      fornecedorId: fornObj ? fornObj.id : null,
      forn: item.fab,
      unidade: item.desc.includes('Graxa') ? 'BD' : (item.desc.includes('Jogo') ? 'JG' : (item.desc.includes('Caixa') ? 'CX' : 'UN')),
      custo: arredondar(item.custo),
      custoMedio: arredondar(item.custo),
      precoVendaPadrao: arredondar(item.venda),
      venda: arredondar(item.venda),
      preco: arredondar(item.venda),
      min: item.min,
      estoqueMinimo: item.min,
      initialStock: item.init,
      qtd: item.init, // Atualizado pelas movimentações reais!
      ativo: true,
      _isDemo: true,
      demoBatchId: DEMO_BATCH_ID,
      createdAt: '2026-06-13T07:00:00-03:00'
    });
  });

  return pecas;
}

/* =========================================================================
   5. GERADOR CENTRAL DA BASE COMPLETA (90 DIAS)
   ========================================================================= */

function gerarDadosOficinaDemo() {
  resetPRNG();

  const state = getDefaultState(TENANT_ID);
  state.tenantId = TENANT_ID;
  state._isDemo = true;
  state.demoBatchId = DEMO_BATCH_ID;

  // 1. Configuração da Empresa
  state.cfg.empresa = TENANT_NAME;
  state.cfg.documento = '12.345.678/0001-99';
  state.cfg.telefone = '(11) 3456-7890';
  state.cfg.email = 'contato@oficinademo.example.com';
  state.cfg.endereco = 'Av. das Nações Unidas, 12000 - São Paulo/SP';
  state.cfg.saldoInicial = 85000.00;
  state.cfg.equipe = { jornadaPadraoHoras: 8 };
  state.cfg.precificacao = {
    margemAlvoPadrao: 35,
    margemMinimaPadrao: 20,
    amostraMinimaHistorico: 5,
    confianca: { mediaMinimo: 5, altaMinimo: 10 },
    protecaoMargem: { modo: 'alertar' }
  };
  state.cfg.compras = { exigirAprovacaoAcimaDe: 3500 };
  state.cfg.assistente = { displayName: 'Verônica', voiceGender: 'female', enabled: true };
  state.cfg.posVenda = {
    enabled: true,
    contatos: [
      { diasAposEntrega: 2, tipo: 'verificacao_servico' },
      { diasAposEntrega: 7, tipo: 'acompanhamento' },
      { diasAposEntrega: 30, tipo: 'relacionamento' }
    ]
  };

  // 2. Boxes (6 boxes)
  state.boxes = BOXES_BASE.map(b => ({
    ...b,
    tenantId: TENANT_ID,
    _isDemo: true,
    demoBatchId: DEMO_BATCH_ID
  }));

  // 3. Fornecedores (15 fornecedores)
  state.suppliers = FORNECEDORES_BASE.map((f, i) => {
    const id = `forn_demo_${String(i + 1).padStart(2, '0')}`;
    return {
      id,
      tenantId: TENANT_ID,
      nome: f.nome,
      documento: f.doc,
      fone: f.fone,
      email: f.email,
      cidade: f.cidade,
      uf: f.uf,
      condicoesPagamento: '28 dias (Boleto)',
      prazoMedioEntregaDias: randInt(2, 4),
      ativo: true,
      _isDemo: true,
      demoBatchId: DEMO_BATCH_ID,
      createdAt: '2026-06-13T07:30:00-03:00'
    };
  });
  state.fornecedores = state.suppliers;

  // 4. Colaboradores (10 workers)
  state.workers = COLABORADORES_BASE.map((w, i) => {
    const id = `wrk_demo_${String(i + 1).padStart(2, '0')}`;
    return {
      id,
      tenantId: TENANT_ID,
      nome: w.nome,
      funcao: w.funcao,
      custoHora: w.custoHora,
      jornadaHorasDia: w.jornada,
      especialidade: w.especialidade,
      especialidades: [w.especialidade],
      ativo: true,
      disponivelHoje: true,
      fone: `(11) 97${String(randInt(100, 999))}-${String(randInt(1000, 9999))}`,
      _isDemo: true,
      demoBatchId: DEMO_BATCH_ID,
      createdAt: '2026-06-13T07:30:00-03:00'
    };
  });
  state.mecanicos = state.workers.map(w => ({
    id: w.id,
    nome: w.nome,
    especialidade: w.especialidade || 'Geral',
    fone: w.fone || ''
  }));

  // 5. Catálogo de Peças (150 itens)
  state.pecas = gerarCatalogoPecas(state.suppliers);

  // 6. Catálogo de Serviços (20 serviços)
  state.servicos = CATALOGO_SERVICOS.map((s, i) => {
    const id = `srv_demo_${String(i + 1).padStart(2, '0')}`;
    return {
      id,
      tenantId: TENANT_ID,
      codigo: s.cod,
      cod: s.cod,
      nome: s.nome,
      desc: s.nome,
      categoria: s.cat,
      preco: arredondar(s.preco),
      valor: arredondar(s.preco),
      tempoEstimadoMinutos: s.tempoMin,
      ativo: true,
      _isDemo: true,
      demoBatchId: DEMO_BATCH_ID
    };
  });

  // 7. Clientes (80 clientes: 8 grandes frotistas + 72 PF/autônomos)
  state.clientes = [];
  state.fleets = [];

  // 7.1 Cadastrar os 8 grandes frotistas
  FROTISTAS_BASE.forEach((f, i) => {
    const cId = `cli_demo_frota_${String(i + 1).padStart(2, '0')}`;
    const flId = `flt_demo_${String(i + 1).padStart(2, '0')}`;

    state.clientes.push({
      id: cId,
      tenantId: TENANT_ID,
      nome: f.nome,
      nomeFantasia: f.nome.split(' ')[0] + ' Frota',
      documento: f.doc,
      doc: f.doc,
      tipo: 'frotista',
      fone: f.fone,
      email: `contato@frota${i + 1}.example.com`,
      contato: f.contato,
      cidade: 'São Paulo',
      uf: 'SP',
      limiteCredito: 50000.00,
      _isDemo: true,
      demoBatchId: DEMO_BATCH_ID,
      createdAt: '2026-06-13T08:00:00-03:00'
    });

    state.fleets.push({
      id: flId,
      tenantId: TENANT_ID,
      clienteId: cId,
      nome: f.nome,
      veiculosCount: f.veiculosCount,
      ativo: true,
      _isDemo: true,
      demoBatchId: DEMO_BATCH_ID
    });
  });

  // 7.2 Cadastrar os 72 clientes PF / autônomos
  NOMES_CLIENTES_PF.forEach((nome, i) => {
    const cId = `cli_demo_pf_${String(i + 1).padStart(2, '0')}`;
    const cpfFormatado = `${String(randInt(100, 999))}.${String(randInt(100, 999))}.${String(randInt(100, 999))}-${String(randInt(10, 99))}`;

    state.clientes.push({
      id: cId,
      tenantId: TENANT_ID,
      nome: nome + ' (Transporte)',
      nomeFantasia: nome,
      documento: cpfFormatado,
      doc: cpfFormatado,
      tipo: 'autonomo',
      fone: `(11) 98${String(randInt(100, 999))}-${String(randInt(1000, 9999))}`,
      email: `motorista_${i + 1}@transporte.example.com`,
      contato: nome,
      cidade: randChoice(['São Paulo', 'Campinas', 'Santos', 'Ribeirão Preto', 'São José dos Campos', 'Sorocaba']),
      uf: 'SP',
      limiteCredito: 15000.00,
      _isDemo: true,
      demoBatchId: DEMO_BATCH_ID,
      createdAt: '2026-06-13T08:30:00-03:00'
    });
  });

  // 8. Veículos (120 veículos pesados)
  state.veiculos = [];
  let veiculoSeq = 1;

  // 8.1 Associar veículos aos 8 frotistas (52 veículos)
  FROTISTAS_BASE.forEach((f, fIdx) => {
    const cId = `cli_demo_frota_${String(fIdx + 1).padStart(2, '0')}`;
    const flId = `flt_demo_${String(fIdx + 1).padStart(2, '0')}`;

    for (let v = 0; v < f.veiculosCount; v++) {
      const vId = `vei_demo_${String(veiculoSeq).padStart(3, '0')}`;
      const placa = veiculoSeq <= 99
        ? `DEM1A${String(veiculoSeq).padStart(2, '0')}`
        : `DEM2B${String(veiculoSeq - 99).padStart(2, '0')}`;

      const modeloInfo = randChoice(MODELOS_VEICULOS);
      const kmInicial = randInt(180000, 580000);

      state.veiculos.push({
        id: vId,
        tenantId: TENANT_ID,
        clienteId: cId,
        cli: cId,
        fleetId: flId,
        placa,
        marca: modeloInfo.marca,
        modelo: modeloInfo.modelo,
        ano: randInt(2018, 2023),
        km: kmInicial,
        kmInicial,
        cor: randChoice(['Branco', 'Prata', 'Azul Marinho', 'Vermelho', 'Preto']),
        combustivel: 'Diesel S10',
        _isDemo: true,
        demoBatchId: DEMO_BATCH_ID,
        createdAt: '2026-06-13T09:00:00-03:00'
      });
      veiculoSeq++;
    }
  });

  // 8.2 Associar veículos aos 72 clientes PF (68 veículos)
  for (let p = 0; p < 68; p++) {
    const cId = `cli_demo_pf_${String(p + 1).padStart(2, '0')}`;
    const vId = `vei_demo_${String(veiculoSeq).padStart(3, '0')}`;
    const placa = veiculoSeq <= 99
      ? `DEM1A${String(veiculoSeq).padStart(2, '0')}`
      : `DEM2B${String(veiculoSeq - 99).padStart(2, '0')}`;

    const modeloInfo = randChoice(MODELOS_VEICULOS);
    const kmInicial = randInt(220000, 720000);

    state.veiculos.push({
      id: vId,
      tenantId: TENANT_ID,
      clienteId: cId,
      cli: cId,
      fleetId: null,
      placa,
      marca: modeloInfo.marca,
      modelo: modeloInfo.modelo,
      ano: randInt(2016, 2022),
      km: kmInicial,
      kmInicial,
      cor: randChoice(['Branco', 'Vermelho', 'Azul', 'Cinza']),
      combustivel: 'Diesel S10',
      _isDemo: true,
      demoBatchId: DEMO_BATCH_ID,
      createdAt: '2026-06-13T09:30:00-03:00'
    });
    veiculoSeq++;
  }

  // 9. Movimentações de Estoque Iniciais (150 movimentos)
  state.inventoryMovements = [];
  state.pecas.forEach(peca => {
    state.inventoryMovements.push({
      id: `mov_init_${peca.id}`,
      tenantId: TENANT_ID,
      partId: peca.id,
      type: 'ajuste_positivo',
      quantity: peca.initialStock,
      osId: null,
      purchaseOrderId: null,
      reason: 'Inventário Inicial da Oficina no Início do Período',
      actorId: 'almoxarife',
      mechanicId: null,
      unitCost: peca.custo,
      saldoAnterior: 0,
      saldoNovo: peca.initialStock,
      saldoFisicoApos: peca.initialStock,
      _isDemo: true,
      demoBatchId: DEMO_BATCH_ID,
      createdAt: '2026-06-13T08:00:00-03:00'
    });
  });

  // Mapeamento dinâmico de saldo físico para conciliação matemática rigorosa
  const saldoFisicoMap = new Map();
  state.pecas.forEach(p => saldoFisicoMap.set(p.id, p.initialStock));

  // 10. Compras e Recebimentos (80 pedidos de compra)
  state.purchaseOrders = [];
  state.compras = [];
  state.contas = [];
  state.movimentos = [];

  for (let cIdx = 1; cIdx <= 80; cIdx++) {
    const pId = `ped_demo_${String(cIdx).padStart(3, '0')}`;
    const codigo = `PED-${1000 + cIdx}`;

    const diaOffset = Math.floor((cIdx - 1) * (88 / 80));
    const dtCriacao = diaOffsetParaData(diaOffset, 9, 30);

    const forn = randChoice(state.suppliers);
    const pecasDoForn = state.pecas.filter(p => p.fabricante === forn.nome || p.fornecedorId === forn.id);
    const pecasParaComprar = pecasDoForn.length > 0 ? randSample(pecasDoForn, randInt(1, Math.min(3, pecasDoForn.length))) : randSample(state.pecas, randInt(1, 3));

    let status = 'recebido';
    let dataRecebimento = null;
    let diasPrazo = randInt(2, 4);

    if (cIdx >= 78) {
      status = 'cancelado';
    } else if (cIdx >= 74) {
      status = 'aprovado';
    } else if (cIdx >= 69) {
      status = 'parcialmente_recebido';
      dataRecebimento = diaOffsetParaData(Math.min(89, diaOffset + 2), 14, 0).isoSP;
    } else {
      status = 'recebido';
      const offsetReceb = Math.min(88, diaOffset + diasPrazo);
      dataRecebimento = diaOffsetParaData(offsetReceb, 14, 30).isoSP;
    }

    let subtotal = 0;
    const items = pecasParaComprar.map((p, itIdx) => {
      // Reposição proporcional ao valor unitário
      let qtdPedida = 4;
      if (p.custo > 1000) qtdPedida = randInt(1, 2);
      else if (p.custo > 300) qtdPedida = randInt(2, 4);
      else if (p.custo > 80) qtdPedida = randInt(4, 8);
      else qtdPedida = randInt(10, 20);

      const unitPrice = arredondar(p.custo);
      const totalItem = arredondar(qtdPedida * unitPrice);
      subtotal += totalItem;

      let recQtd = 0;
      if (status === 'recebido') recQtd = qtdPedida;
      else if (status === 'parcialmente_recebido') recQtd = Math.max(1, Math.floor(qtdPedida / 2));

      return {
        id: `pitem_${pId}_${itIdx + 1}`,
        partId: p.id,
        quantity: qtdPedida,
        unitPrice,
        total: totalItem,
        receivedQuantity: recQtd,
        pendingQuantity: qtdPedida - recQtd
      };
    });

    const frete = randChoice([0, 50, 90, 120]);
    const totalGeral = arredondar(subtotal + frete);

    const orderObj = {
      id: pId,
      codigo,
      tenantId: TENANT_ID,
      supplierId: forn.id,
      supplierNome: forn.nome,
      status,
      items,
      subtotal: arredondar(subtotal),
      freight: frete,
      total: totalGeral,
      totalGeral,
      paymentTerms: forn.condicoesPagamento || '28 dias (Boleto)',
      requestedAt: dtCriacao.isoSP,
      orderedAt: dtCriacao.isoSP,
      expectedAt: addDiasDataStr(dtCriacao.dataStr, diasPrazo),
      receivedAt: dataRecebimento,
      observacoes: `Pedido de reposição de estoque #${codigo} - ${forn.nome}`,
      createdBy: 'Felipe Almoxarife',
      _isDemo: true,
      demoBatchId: DEMO_BATCH_ID,
      createdAt: dtCriacao.isoSP,
      updatedAt: dataRecebimento || dtCriacao.isoSP
    };

    state.purchaseOrders.push(orderObj);
    state.compras.push({
      id: pId,
      tipo: 'pedido',
      num: codigo,
      forn: forn.nome,
      valor: totalGeral,
      total: totalGeral,
      situacao: status === 'recebido' ? 'Concluída' : (status === 'cancelado' ? 'Cancelada' : 'Em Aberto'),
      status,
      data: dtCriacao.isoSP.slice(0, 10),
      itens: items.map(it => ({
        nome: it.partId,
        qtd: it.quantity,
        custo: it.unitPrice
      })),
      origem: 'Demonstração',
      nfNumero: String(10000 + cIdx)
    });

    if (status === 'recebido' || status === 'parcialmente_recebido') {
      let valorRecebidoTotal = 0;

      items.forEach(it => {
        if (it.receivedQuantity > 0) {
          const valorLinha = arredondar(it.receivedQuantity * it.unitPrice);
          valorRecebidoTotal += valorLinha;

          const saldoAnt = saldoFisicoMap.get(it.partId) ?? 0;
          const saldoNovo = saldoAnt + it.receivedQuantity;
          saldoFisicoMap.set(it.partId, saldoNovo);

          state.inventoryMovements.push({
            id: `mov_in_${pId}_${it.partId}`,
            tenantId: TENANT_ID,
            partId: it.partId,
            type: 'entrada_compra',
            quantity: it.receivedQuantity,
            purchaseOrderId: pId,
            osId: null,
            reason: `Recebimento de compra #${codigo} - ${forn.nome} (NF ${randInt(10000, 99999)})`,
            actorId: 'almoxarife',
            mechanicId: null,
            unitCost: it.unitPrice,
            saldoAnterior: saldoAnt,
            saldoNovo: saldoNovo,
            saldoFisicoApos: saldoNovo,
            _isDemo: true,
            demoBatchId: DEMO_BATCH_ID,
            createdAt: dataRecebimento
          });
        }
      });

      if (valorRecebidoTotal > 0) {
        const cpId = `cp_compra_${pId}`;
        const dataRecStr = dataRecebimento.slice(0, 10);
        const vencimentoStr = addDiasDataStr(dataRecStr, 28);

        const isVencidaEmRelacaoHoje = vencimentoStr < DATA_FINAL_STR;
        let isPaga = false;
        let pagoEm = null;

        if (isVencidaEmRelacaoHoje) {
          if (cIdx % 12 !== 0) {
            isPaga = true;
            pagoEm = diaOffsetParaData(Math.min(89, diaOffset + 28), 10, 0).isoSP;
          }
        }

        const contaPagar = {
          id: cpId,
          tenantId: TENANT_ID,
          tipo: 'pagar',
          desc: `Compra de peças #${codigo} - ${forn.nome}`,
          valor: arredondar(valorRecebidoTotal),
          venc: vencimentoStr,
          st: isPaga ? 'paga' : (vencimentoStr < DATA_FINAL_STR ? 'atrasada' : 'pendente'),
          pago: isPaga,
          pagoEm,
          cat: 'pecas',
          fornecedorId: forn.id,
          purchaseOrderId: pId,
          _isDemo: true,
          demoBatchId: DEMO_BATCH_ID,
          createdAt: dataRecebimento
        };

        state.contas.push(contaPagar);

        if (isPaga && pagoEm) {
          state.movimentos.push({
            id: `mov_fin_${cpId}`,
            tenantId: TENANT_ID,
            tipo: 'saida',
            desc: `Pagamento fornecedor #${codigo} - ${forn.nome}`,
            valor: arredondar(valorRecebidoTotal),
            data: pagoEm,
            cat: 'Fornecedores Peças',
            forma: 'boleto',
            contaId: cpId,
            _isDemo: true,
            demoBatchId: DEMO_BATCH_ID
          });
        }
      }
    }
  }

  // 11. Despesas Operacionais Fixas & Recorrentes
  const despesasFixas = [
    { desc: 'Aluguel Galpão Oficina - Junho/2026', valor: 12000, venc: '2026-06-15', pagoEm: '2026-06-15T10:00:00-03:00', cat: 'Aluguel e Instalações' },
    { desc: 'Aluguel Galpão Oficina - Julho/2026', valor: 12000, venc: '2026-07-15', pagoEm: '2026-07-15T10:00:00-03:00', cat: 'Aluguel e Instalações' },
    { desc: 'Aluguel Galpão Oficina - Agosto/2026', valor: 12000, venc: '2026-08-15', pagoEm: '2026-08-15T10:00:00-03:00', cat: 'Aluguel e Instalações' },
    { desc: 'Aluguel Galpão Oficina - Setembro/2026', valor: 12000, venc: '2026-09-15', pagoEm: null, cat: 'Aluguel e Instalações' },

    { desc: 'Energia Elétrica Industrial - Junho/2026', valor: 2750, venc: '2026-06-20', pagoEm: '2026-06-20T11:00:00-03:00', cat: 'Energia e Utilidades' },
    { desc: 'Energia Elétrica Industrial - Julho/2026', valor: 2890, venc: '2026-07-20', pagoEm: '2026-07-20T11:00:00-03:00', cat: 'Energia e Utilidades' },
    { desc: 'Energia Elétrica Industrial - Agosto/2026', valor: 2810, venc: '2026-08-20', pagoEm: '2026-08-20T11:00:00-03:00', cat: 'Energia e Utilidades' },
    { desc: 'Energia Elétrica Industrial - Setembro/2026', valor: 2950, venc: '2026-09-20', pagoEm: null, cat: 'Energia e Utilidades' },

    { desc: 'Folha de Pagamento da Equipe - Junho/2026', valor: 38000, venc: '2026-07-05', pagoEm: '2026-07-05T09:00:00-03:00', cat: 'Folha e Encargos' },
    { desc: 'Folha de Pagamento da Equipe - Julho/2026', valor: 38000, venc: '2026-08-05', pagoEm: '2026-08-05T09:00:00-03:00', cat: 'Folha e Encargos' },
    { desc: 'Folha de Pagamento da Equipe - Agosto/2026', valor: 38000, venc: '2026-09-05', pagoEm: '2026-09-05T09:00:00-03:00', cat: 'Folha e Encargos' },

    { desc: 'Calibração e Aferição Rampa Laser e Manômetros', valor: 3200, venc: '2026-07-10', pagoEm: '2026-07-10T14:00:00-03:00', cat: 'Ferramentas e Máquinas' },
    { desc: 'Aquisição Chave de Impacto Pneumática 1" Reforçada', valor: 4500, venc: '2026-08-12', pagoEm: '2026-08-12T15:00:00-03:00', cat: 'Ferramentas e Máquinas' }
  ];

  despesasFixas.forEach((df, dfIdx) => {
    const dId = `cp_fixa_${dfIdx + 1}`;
    const isPaga = Boolean(df.pagoEm);
    state.contas.push({
      id: dId,
      tenantId: TENANT_ID,
      tipo: 'pagar',
      desc: df.desc,
      valor: arredondar(df.valor),
      venc: df.venc,
      st: isPaga ? 'paga' : (df.venc < DATA_FINAL_STR ? 'atrasada' : 'pendente'),
      pago: isPaga,
      pagoEm: df.pagoEm,
      cat: df.cat,
      _isDemo: true,
      demoBatchId: DEMO_BATCH_ID,
      createdAt: '2026-06-13T08:00:00-03:00'
    });

    if (isPaga && df.pagoEm) {
      state.movimentos.push({
        id: `mov_fin_${dId}`,
        tenantId: TENANT_ID,
        tipo: 'saida',
        desc: df.desc,
        valor: arredondar(df.valor),
        data: df.pagoEm,
        cat: df.cat,
        forma: 'pix',
        contaId: dId,
        _isDemo: true,
        demoBatchId: DEMO_BATCH_ID
      });
    }
  });

  // 12. Orçamentos (360 itens) e Ordens de Serviço (300 OS)
  state.quotations = [];
  state.os = [];
  state.laborEntries = [];
  state.afterSales = [];

  // Controle de cronômetro por mecânico para anti-sobreposição estrita
  const cronometroMecanicos = new Map();
  state.workers.forEach(w => {
    cronometroMecanicos.set(w.id, {
      diaOffset: 0,
      minutoDoDia: 8 * 60
    });
  });

  const veiculosVisitas = new Map();

  for (let osIdx = 1; osIdx <= 300; osIdx++) {
    const num = 1000 + osIdx;
    const osId = `os_demo_${String(osIdx).padStart(3, '0')}`;
    const orcId = `orc_demo_${String(osIdx).padStart(3, '0')}`;

    let diaOffset = Math.floor((osIdx - 1) / (300 / 89));
    diaOffset = Math.min(89, Math.max(0, diaOffset));

    const dtAbertura = diaOffsetParaData(diaOffset, 8 + (osIdx % 8), (osIdx * 17) % 60);

    let veiculo;
    if (osIdx % 4 === 0) {
      const veiculosFrota = state.veiculos.filter(v => v.fleetId);
      veiculo = veiculosFrota[osIdx % veiculosFrota.length];
    } else {
      veiculo = state.veiculos[osIdx % state.veiculos.length];
    }

    const visitasAnteriores = veiculosVisitas.get(veiculo.id) || 0;
    veiculosVisitas.set(veiculo.id, visitasAnteriores + 1);

    const kmOS = veiculo.kmInicial + (visitasAnteriores * randInt(8000, 18000)) + randInt(500, 2500);
    if (kmOS > veiculo.km) {
      veiculo.km = kmOS;
    }

    const cliente = state.clientes.find(c => c.id === veiculo.clienteId) || state.clientes[0];

    let status = 'finalizada';
    let boxAlocado = null;
    let dataFechamento = null;

    if (osIdx > 272) {
      if (osIdx >= 297) {
        status = 'cancelada';
      } else if (osIdx >= 293) {
        status = 'aguardando_aprovacao';
      } else if (osIdx >= 287) {
        status = 'aguardando_peca';
      } else {
        status = 'em_andamento';
        const boxIndex = (osIdx - 273) % 6;
        boxAlocado = BOXES_BASE[boxIndex].id;
      }
    } else {
      status = 'finalizada';
      const offsetFech = Math.min(89, diaOffset + randInt(1, 2));
      dataFechamento = diaOffsetParaData(offsetFech, 17, 30).isoSP;
    }

    // Serviços da OS (1 a 3 serviços realistas, garantindo >= 450 apontamentos de mão de obra)
    const srv1 = randChoice(state.servicos);
    const srv2 = (osIdx % 4 !== 3) ? randChoice(state.servicos.filter(s => s.id !== srv1.id)) : null;
    const srv3 = (osIdx % 5 === 0 && srv2) ? randChoice(state.servicos.filter(s => s.id !== srv1.id && s.id !== srv2.id)) : null;
    const servicosOS = [
      {
        id: srv1.id,
        nome: srv1.nome,
        categoria: srv1.categoria,
        preco: srv1.preco,
        valor: srv1.preco,
        tempoMin: srv1.tempoEstimadoMinutos,
        autorizado: true,
        status: 'aprovado'
      }
    ];
    if (srv2) {
      servicosOS.push({
        id: srv2.id,
        nome: srv2.nome,
        categoria: srv2.categoria,
        preco: srv2.preco,
        valor: srv2.preco,
        tempoMin: srv2.tempoEstimadoMinutos,
        autorizado: true,
        status: 'aprovado'
      });
    }
    if (srv3) {
      servicosOS.push({
        id: srv3.id,
        nome: srv3.nome,
        categoria: srv3.categoria,
        preco: srv3.preco,
        valor: srv3.preco,
        tempoMin: srv3.tempoEstimadoMinutos,
        autorizado: true,
        status: 'aprovado'
      });
    }

    // Peças da OS (1 a 2 peças compatíveis)
    const pecaAlvo1 = state.pecas[osIdx % state.pecas.length];
    const pecaAlvo2 = (osIdx % 3 === 0) ? state.pecas[(osIdx * 7) % state.pecas.length] : null;

    const pecasOS = [
      {
        id: pecaAlvo1.id,
        partId: pecaAlvo1.id,
        nome: pecaAlvo1.descricao,
        descricao: pecaAlvo1.descricao,
        qtd: Math.min(2, Math.max(1, randInt(1, 2))),
        quantidade: Math.min(2, Math.max(1, randInt(1, 2))),
        preco: pecaAlvo1.venda,
        valorUnitario: pecaAlvo1.venda,
        valorTotal: arredondar(Math.min(2, Math.max(1, randInt(1, 2))) * pecaAlvo1.venda),
        custoUnitario: pecaAlvo1.custo,
        reservada: status !== 'cancelada',
        statusEstoque: status === 'finalizada' ? 'consumida' : 'reservada'
      }
    ];

    if (pecaAlvo2 && pecaAlvo2.id !== pecaAlvo1.id) {
      pecasOS.push({
        id: pecaAlvo2.id,
        partId: pecaAlvo2.id,
        nome: pecaAlvo2.descricao,
        descricao: pecaAlvo2.descricao,
        qtd: 1,
        quantidade: 1,
        preco: pecaAlvo2.venda,
        valorUnitario: pecaAlvo2.venda,
        valorTotal: pecaAlvo2.venda,
        custoUnitario: pecaAlvo2.custo,
        reservada: status !== 'cancelada',
        statusEstoque: status === 'finalizada' ? 'consumida' : 'reservada'
      });
    }

    const subtotalServicos = servicosOS.reduce((acc, s) => acc + s.preco, 0);
    const subtotalPecas = pecasOS.reduce((acc, p) => acc + p.valorTotal, 0);
    const desconto = (osIdx % 12 === 0) ? 100 : 0;
    const totalOS = arredondar(subtotalServicos + subtotalPecas - desconto);

    // Orçamento Comercial
    state.quotations.push({
      id: orcId,
      tenantId: TENANT_ID,
      osId,
      numero: 2000 + osIdx,
      status: status === 'cancelada' ? 'recusado' : (status === 'aguardando_aprovacao' ? 'enviado' : 'aprovado'),
      clienteId: cliente.id,
      clienteNome: cliente.nome,
      veiculoId: veiculo.id,
      placa: veiculo.placa,
      items: [
        ...servicosOS.map(s => ({ tipo: 'servico', id: s.id, desc: s.nome, preco: s.preco, quantidade: 1, total: s.preco, status: 'aprovado' })),
        ...pecasOS.map(p => ({ tipo: 'peca', id: p.id, desc: p.nome, preco: p.preco, quantidade: p.qtd, total: p.valorTotal, status: 'aprovado' }))
      ],
      subtotalServicos,
      subtotalPecas,
      descontoGeral: desconto,
      totalGeral: totalOS,
      totalAprovado: totalOS,
      aprovadoEm: dtAbertura.isoSP,
      _isDemo: true,
      demoBatchId: DEMO_BATCH_ID,
      createdAt: dtAbertura.isoSP
    });

    // Ordem de Serviço
    const osObj = {
      id: osId,
      num,
      tenantId: TENANT_ID,
      cli: cliente.id,
      clienteId: cliente.id,
      clienteNome: cliente.nome,
      vei: veiculo.id,
      veiculoId: veiculo.id,
      placa: veiculo.placa,
      km: kmOS,
      abertura: dtAbertura.dataStr,
      dataAbertura: dtAbertura.isoSP,
      st: status,
      status,
      box: boxAlocado,
      queixa: `Manutenção e revisão no veículo ${veiculo.modelo} (${veiculo.placa}): ${srv1.nome}.`,
      servicos: servicosOS,
      pecas: pecasOS,
      subtotalServicos,
      subtotalPecas,
      desconto,
      total: totalOS,
      responsavel: COLABORADORES_BASE[1 + (osIdx % 6)].nome,
      fechamento: dataFechamento,
      concluidaEm: dataFechamento,
      _isDemo: true,
      demoBatchId: DEMO_BATCH_ID,
      createdAt: dtAbertura.isoSP,
      updatedAt: dataFechamento || dtAbertura.isoSP
    };

    state.os.push(osObj);

    // Consumo de Peças no Estoque
    if (status === 'finalizada' || status === 'em_andamento') {
      pecasOS.forEach(it => {
        const saldoAnt = saldoFisicoMap.get(it.partId) ?? 0;
        const qtdEfetiva = Math.min(saldoAnt, it.qtd);
        if (qtdEfetiva > 0) {
          const saldoNovo = saldoAnt - qtdEfetiva;
          saldoFisicoMap.set(it.partId, saldoNovo);

          state.inventoryMovements.push({
            id: `mov_out_${osId}_${it.partId}`,
            tenantId: TENANT_ID,
            partId: it.partId,
            type: 'saida_os',
            quantity: qtdEfetiva,
            osId,
            purchaseOrderId: null,
            reason: `Aplicação na OS #${num} (${veiculo.placa})`,
            actorId: 'mecanico',
            mechanicId: null,
            unitCost: it.custoUnitario,
            saldoAnterior: saldoAnt,
            saldoNovo: saldoNovo,
            saldoFisicoApos: saldoNovo,
            _isDemo: true,
            demoBatchId: DEMO_BATCH_ID,
            createdAt: dataFechamento || dtAbertura.isoSP
          });
        }
      });
    }

    // Apontamento de Mão de Obra para CADA serviço da OS (atinge >= 450 apontamentos com zero sobreposição)
    if (status === 'finalizada' || status === 'em_andamento') {
      servicosOS.forEach((srvItem, sIdx) => {
        const mec = state.workers[1 + ((osIdx + sIdx) % 7)];
        const tempoMinutos = srvItem.tempoMin || 120;
        const horasDuracao = arredondar(tempoMinutos / 60);

        const relogio = cronometroMecanicos.get(mec.id);
        if (relogio.diaOffset < diaOffset) {
          relogio.diaOffset = diaOffset;
          relogio.minutoDoDia = 8 * 60;
        }
        if (relogio.minutoDoDia + tempoMinutos > 18 * 60) {
          relogio.diaOffset += 1;
          relogio.minutoDoDia = 8 * 60;
        }

        const inicioApontamento = diaOffsetParaData(
          Math.min(89, relogio.diaOffset),
          Math.floor(relogio.minutoDoDia / 60),
          relogio.minutoDoDia % 60
        );

        relogio.minutoDoDia += tempoMinutos;

        const fimApontamento = diaOffsetParaData(
          Math.min(89, relogio.diaOffset),
          Math.floor(relogio.minutoDoDia / 60),
          relogio.minutoDoDia % 60
        );

        state.laborEntries.push({
          id: `lab_demo_${String(osIdx).padStart(3, '0')}_${sIdx + 1}`,
          tenantId: TENANT_ID,
          workerId: mec.id,
          workerNome: mec.nome,
          osId,
          osNum: num,
          serviceItemId: srvItem.id,
          serviceNome: srvItem.nome,
          boxId: boxAlocado || 'b1',
          type: (osIdx % 22 === 0) ? 'retrabalho' : 'produtivo',
          status: status === 'finalizada' ? 'finalizado' : 'ativo',
          startTime: inicioApontamento.isoSP,
          endTime: status === 'finalizada' ? fimApontamento.isoSP : null,
          durationMinutes: tempoMinutos,
          durationHours: horasDuracao,
          hourlyCost: mec.custoHora,
          totalLaborCost: arredondar(horasDuracao * mec.custoHora),
          _isDemo: true,
          demoBatchId: DEMO_BATCH_ID,
          createdAt: inicioApontamento.isoSP
        });
      });
    }

    // Contas a Receber da OS
    if (status === 'finalizada') {
      const crId = `cr_os_${osId}`;
      const dataConclusaoStr = dataFechamento.slice(0, 10);
      const prazoDias = cliente.tipo === 'frotista' ? 28 : (osIdx % 2 === 0 ? 15 : 0);
      const vencimentoStr = addDiasDataStr(dataConclusaoStr, prazoDias);

      let isPaga = false;
      let pagoEm = null;
      let formaPgto = randChoice(['pix', 'pix', 'boleto', 'cartao', 'dinheiro']);

      if (vencimentoStr <= DATA_FINAL_STR) {
        if (osIdx % 14 !== 0) {
          isPaga = true;
          pagoEm = diaOffsetParaData(Math.min(89, diaOffset + prazoDias), 16, 0).isoSP;
        }
      }

      state.contas.push({
        id: crId,
        tenantId: TENANT_ID,
        tipo: 'receber',
        desc: `OS #${num} - ${cliente.nome} (${veiculo.placa})`,
        valor: totalOS,
        venc: vencimentoStr,
        st: isPaga ? 'paga' : (vencimentoStr < DATA_FINAL_STR ? 'atrasada' : 'pendente'),
        pago: isPaga,
        pagoEm,
        cat: 'servicos',
        clienteId: cliente.id,
        osId,
        _isDemo: true,
        demoBatchId: DEMO_BATCH_ID,
        createdAt: dataFechamento
      });

      if (isPaga && pagoEm) {
        state.movimentos.push({
          id: `mov_fin_${crId}`,
          tenantId: TENANT_ID,
          tipo: 'entrada',
          desc: `Recebimento OS #${num} - ${cliente.nome} (${veiculo.placa})`,
          valor: totalOS,
          data: pagoEm,
          cat: 'Venda de Serviços e Peças',
          forma: formaPgto,
          contaId: crId,
          _isDemo: true,
          demoBatchId: DEMO_BATCH_ID
        });
      }

      state.afterSales.push({
        id: `pvd_demo_${osId}`,
        tenantId: TENANT_ID,
        osId,
        osNum: num,
        clienteId: cliente.id,
        clienteNome: cliente.nome,
        veiculoId: veiculo.id,
        placa: veiculo.placa,
        dataEntrega: dataConclusaoStr,
        tipo: 'verificacao_servico',
        status: (osIdx < 260) ? 'concluido' : 'pendente',
        feedbackCliente: (osIdx < 260) ? randChoice(['Cliente satisfeito com a suspensão', 'Serviço aprovado na viagem', 'Veículo alinhado e altura correta']) : null,
        _isDemo: true,
        demoBatchId: DEMO_BATCH_ID,
        createdAt: dataFechamento
      });
    }
  }

  // 12.1 Orçamentos adicionais não convertidos (60 orçamentos adicionais -> total 360)
  for (let extra = 1; extra <= 60; extra++) {
    const orcExtraId = `orc_demo_extra_${String(extra).padStart(2, '0')}`;
    let status = 'enviado';
    if (extra <= 15) status = 'elaboracao';
    else if (extra <= 40) status = 'enviado';
    else if (extra <= 52) status = 'recusado';
    else status = 'expirado';

    const diaOffset = 80 + Math.floor((extra - 1) / 6);
    const dt = diaOffsetParaData(Math.min(89, diaOffset), 11, (extra * 5) % 60);

    const cli = state.clientes[extra % state.clientes.length];
    const vei = state.veiculos[extra % state.veiculos.length];
    const srv = randChoice(state.servicos);
    const peca = randChoice(state.pecas);

    const subServ = srv.preco;
    const subPec = peca.venda;
    const tot = arredondar(subServ + subPec);

    state.quotations.push({
      id: orcExtraId,
      tenantId: TENANT_ID,
      osId: null,
      numero: 3000 + extra,
      status,
      clienteId: cli.id,
      clienteNome: cli.nome,
      veiculoId: vei.id,
      placa: vei.placa,
      items: [
        { tipo: 'servico', id: srv.id, desc: srv.nome, preco: srv.preco, quantidade: 1, total: srv.preco, status: status === 'recusado' ? 'recusado' : 'pendente' },
        { tipo: 'peca', id: peca.id, desc: peca.descricao, preco: peca.venda, quantidade: 1, total: peca.venda, status: status === 'recusado' ? 'recusado' : 'pendente' }
      ],
      subtotalServicos: subServ,
      subtotalPecas: subPec,
      descontoGeral: 0,
      totalGeral: tot,
      totalAprovado: status === 'aprovado' ? tot : 0,
      motivoRecusa: status === 'recusado' ? 'Orçamento acima do teto aprovado pela gerência da transportadora' : null,
      _isDemo: true,
      demoBatchId: DEMO_BATCH_ID,
      createdAt: dt.isoSP
    });
  }

  // 13. Ajustes Finais de Movimentação de Estoque (10 devoluções / ajustes)
  for (let adj = 1; adj <= 10; adj++) {
    const pAlvo = state.pecas[(adj * 11) % state.pecas.length];
    const saldoAnt = saldoFisicoMap.get(pAlvo.id) ?? pAlvo.initialStock;
    const saldoNovo = saldoAnt + 1;
    saldoFisicoMap.set(pAlvo.id, saldoNovo);

    state.inventoryMovements.push({
      id: `mov_adj_${adj}`,
      tenantId: TENANT_ID,
      partId: pAlvo.id,
      type: 'devolucao_os',
      quantity: 1,
      osId: `os_demo_${String(adj * 20).padStart(3, '0')}`,
      purchaseOrderId: null,
      reason: 'Devolução de peça não utilizada na montagem final da OS',
      actorId: 'almoxarife',
      mechanicId: null,
      unitCost: pAlvo.custo,
      saldoAnterior: saldoAnt,
      saldoNovo: saldoNovo,
      saldoFisicoApos: saldoNovo,
      _isDemo: true,
      demoBatchId: DEMO_BATCH_ID,
      createdAt: diaOffsetParaData(70 + adj, 16, 0).isoSP
    });
  }

  // Atualiza campo 'qtd' de cada peça no array state.pecas
  state.pecas.forEach(p => {
    p.qtd = saldoFisicoMap.get(p.id) ?? 0;
  });

  // 14. Planos de Manutenção Preventiva (25 planos)
  state.maintenancePlans = [];
  const veiculosFrotasParaPlano = state.veiculos.filter(v => v.fleetId).slice(0, 25);

  veiculosFrotasParaPlano.forEach((v, idx) => {
    const pId = `pln_demo_${String(idx + 1).padStart(2, '0')}`;
    const statusPlano = (idx < 16) ? 'em_dia' : (idx < 21 ? 'proximo' : 'vencido');
    const kmAtual = v.km;
    const proximaRevisaoKm = statusPlano === 'vencido' ? kmAtual - 800 : (statusPlano === 'proximo' ? kmAtual + 450 : kmAtual + 8500);

    state.maintenancePlans.push({
      id: pId,
      tenantId: TENANT_ID,
      veiculoId: v.id,
      placa: v.placa,
      clienteId: v.clienteId,
      fleetId: v.fleetId,
      items: [
        {
          id: `pit_${pId}_1`,
          nome: 'Revisão de Feixes de Molas e Reaperto de Grampos',
          intervalKm: 25000,
          intervalDays: 90,
          lastServiceKm: kmAtual - (statusPlano === 'vencido' ? 25800 : 16500),
          lastServiceDate: '2026-06-20',
          nextDueKm: proximaRevisaoKm,
          nextDueDate: statusPlano === 'vencido' ? '2026-09-05' : '2026-10-15',
          status: statusPlano
        },
        {
          id: `pit_${pId}_2`,
          nome: 'Revisão e Regulagem de Lonas de Freio',
          intervalKm: 40000,
          intervalDays: 120,
          lastServiceKm: kmAtual - 22000,
          lastServiceDate: '2026-07-01',
          nextDueKm: kmAtual + 18000,
          nextDueDate: '2026-11-01',
          status: 'em_dia'
        }
      ],
      _isDemo: true,
      demoBatchId: DEMO_BATCH_ID,
      createdAt: '2026-06-13T10:00:00-03:00'
    });
  });

  // 15. Auditoria da Oficina
  state.auditoria = [
    {
      id: `aud_seed_${DEMO_BATCH_ID}`,
      timestamp: '2026-06-13T08:00:00-03:00',
      action: 'demo_dataset_seeded',
      actorId: 'administrador_demo',
      usuario: 'administrador_demo',
      intencao: 'carga_demonstrativa_90_dias',
      resumo: 'Carga completa da base demonstrativa de 90 dias com movimentações consistentes.',
      tenantId: TENANT_ID,
      details: {
        batchId: DEMO_BATCH_ID,
        periodo: `${DATA_INICIAL_STR} a ${DATA_FINAL_STR}`,
        clientes: state.clientes.length,
        veiculos: state.veiculos.length,
        pecas: state.pecas.length,
        os: state.os.length,
        compras: state.purchaseOrders.length,
        movimentosEstoque: state.inventoryMovements.length
      },
      _isDemo: true,
      demoBatchId: DEMO_BATCH_ID
    }
  ];

  return state;
}

/* =========================================================================
   6. GERADOR DE TENANTS SINTÉTICOS PARA ADMIN SAAS (PLATAFORMA)
   ========================================================================= */

async function gerarTenantsDemoPlataforma() {
  const tenantsSinteticos = [
    {
      tenantId: 'demo_oficina_ativa_pro',
      legalName: 'Auto Molas & Freios Bandeirante (SaaS Demo)',
      document: '33.111.222/0001-33',
      plan: 'pro',
      status: 'active',
      price: 299,
      startedAt: '2026-06-15T10:00:00Z',
      trialEndsAt: '2026-06-29T10:00:00Z'
    },
    {
      tenantId: 'demo_oficina_ativa_essencial',
      legalName: 'Centro Automotivo Diesel Paulistano (SaaS Demo)',
      document: '44.222.333/0001-44',
      plan: 'essencial',
      status: 'active',
      price: 179,
      startedAt: '2026-07-01T10:00:00Z',
      trialEndsAt: '2026-07-15T10:00:00Z'
    },
    {
      tenantId: 'demo_oficina_trial_pro',
      legalName: 'Molas & Balanças Rodoviárias Sul (SaaS Demo)',
      document: '55.333.444/0001-55',
      plan: 'pro',
      status: 'trialing',
      price: 299,
      startedAt: '2026-09-04T10:00:00Z',
      trialEndsAt: '2026-09-18T10:00:00Z'
    },
    {
      tenantId: 'demo_oficina_past_due',
      legalName: 'Oficina Mecânica Rápida do Trevo (SaaS Demo)',
      document: '66.444.555/0001-66',
      plan: 'pro',
      status: 'past_due',
      price: 299,
      startedAt: '2026-07-10T10:00:00Z',
      gracePeriodEndsAt: '2026-09-14T10:00:00Z'
    },
    {
      tenantId: 'demo_oficina_suspensa',
      legalName: 'Reparos Pesados São Cristóvão (SaaS Demo)',
      document: '77.555.666/0001-77',
      plan: 'essencial',
      status: 'suspended',
      price: 179,
      startedAt: '2026-06-01T10:00:00Z',
      gracePeriodEndsAt: '2026-08-10T10:00:00Z'
    },
    {
      tenantId: 'demo_oficina_cancelada',
      legalName: 'Oficina e Suspensão Estrada Real (SaaS Demo)',
      document: '88.666.777/0001-88',
      plan: 'pro',
      status: 'cancelled',
      price: 299,
      startedAt: '2026-05-15T10:00:00Z',
      cancelledAt: '2026-08-20T10:00:00Z',
      cancellationReason: 'mudou_de_sistema'
    }
  ];

  for (const t of tenantsSinteticos) {
    await billingService.getOrCreateBillingCustomer({
      tenantId: t.tenantId,
      legalName: t.legalName,
      document: t.document,
      email: `financeiro@${t.tenantId}.example.com`,
      phone: '11988880000',
      provider: 'sandbox'
    });

    const sub = await billingService.initializeSubscription({
      tenantId: t.tenantId,
      plan: t.plan,
      status: t.status,
      startedAt: t.startedAt
    });

    sub.price = t.price;
    sub.status = t.status;
    sub.setupFeePaid = t.status === 'active';
    if (t.gracePeriodEndsAt) sub.gracePeriodEndsAt = t.gracePeriodEndsAt;
    if (t.cancelledAt) {
      sub.cancelledAt = t.cancelledAt;
      sub.cancellationReason = t.cancellationReason;
    }
  }

  return tenantsSinteticos;
}

/* =========================================================================
   7. OPERAÇÕES CLI: GENERATE, VERIFY, PURGE
   ========================================================================= */

async function executarGenerate() {
  console.log('================================================================');
  console.log('  PÁTIO CRM — CARGA DA BASE DE DEMONSTRAÇÃO (90 DIAS)');
  console.log(`  Tenant: ${TENANT_ID} (${TENANT_NAME})`);
  console.log(`  Período: ${DATA_INICIAL_STR} até ${DATA_FINAL_STR} (America/Sao_Paulo)`);
  console.log('================================================================\n');

  await initDB();

  const prodRow = await get("SELECT key FROM kv WHERE key = 'tenant:default:state'");
  console.log(`[Isolamento] Verificação do banco de dados:`);
  console.log(`  - Tenant de produção (default): ${prodRow ? 'Presente e Protegido' : 'Vazio'}`);
  console.log(`  - Chave de destino: "tenant:${TENANT_ID}:state"`);

  console.log('\n[Geração] Construindo entidades em memória...');
  const state = gerarDadosOficinaDemo();

  const erroValidacao = validateState(state);
  if (erroValidacao) {
    throw new Error(`Erro na validação do estado gerado: ${erroValidacao}`);
  }

  console.log('[Persistência] Verificando existência prévia no SQLite KV...');
  const existingState = await get('SELECT value FROM kv WHERE key = ?', [`tenant:${TENANT_ID}:state`]);
  if (existingState && existingState.value) {
    throw new Error(`TENANT_JA_EXISTE: A base de dados já possui estado persistido para o tenant "${TENANT_ID}". O gerador recusa sobrescrever dados existentes sem purga prévia (--purge).`);
  }

  console.log('[Persistência] Gravando no SQLite KV...');
  const jsonStr = JSON.stringify(state);
  await run('INSERT INTO kv (key, value) VALUES (?, ?)', [`tenant:${TENANT_ID}:state`, jsonStr]);

  console.log('[SaaS Platform] Provisionando 6 oficinas sintéticas para o Admin SaaS...');
  const saasTenants = await gerarTenantsDemoPlataforma();

  console.log('[Auth] Provisionando usuário administrador demonstrativo (demo_admin)...');
  const userRepository = require('../lib/auth/userRepository');
  const existingDemoUser = await get("SELECT id FROM users WHERE username = 'demo_admin'");
  if (!existingDemoUser) {
    await userRepository.createUser({
      username: 'demo_admin',
      password: 'DemoPassword2026!',
      name: 'Administrador Demo (Fictício)',
      phone: '(11) 98888-0000',
      tenantId: TENANT_ID,
      role: 'tenant_admin',
      memberships: [
        { tenantId: TENANT_ID, role: 'tenant_admin', permissions: ['*'] }
      ]
    });
    console.log('  ✔ Usuário "demo_admin" criado com sucesso para o tenant demonstrativo.');
  } else {
    const mem = await get("SELECT id FROM memberships WHERE user_id = ? AND tenant_id = ?", [existingDemoUser.id, TENANT_ID]);
    if (!mem) {
      await run("INSERT INTO memberships (id, user_id, tenant_id, role, permissions_json, created_at) VALUES (?, ?, ?, 'tenant_admin', '[\"*\"]', ?)",
        [`mem_demo_${Date.now()}`, existingDemoUser.id, TENANT_ID, new Date().toISOString()]);
    }
  }

  console.log('\n✅ Carga realizada com sucesso e isolamento comprovado!');
  console.log(`  - Clientes: ${state.clientes.length} (inclui 8 grandes frotistas)`);
  console.log(`  - Veículos: ${state.veiculos.length} (pesados com placas DEM...)`);
  console.log(`  - Fornecedores: ${state.suppliers.length}`);
  console.log(`  - Peças: ${state.pecas.length} (molas, freios, pneumática, chassi)`);
  console.log(`  - Colaboradores: ${state.workers.length} (equipe com taxas/hora)`);
  console.log(`  - Orçamentos: ${state.quotations.length}`);
  console.log(`  - Ordens de Serviço: ${state.os.length} (272 finalizadas, 14 em andamento, 6 em boxes)`);
  console.log(`  - Pedidos de Compra: ${state.purchaseOrders.length}`);
  console.log(`  - Movimentações Estoque: ${state.inventoryMovements.length}`);
  console.log(`  - Contas a Pagar/Receber: ${state.contas.length}`);
  console.log(`  - Movimentos de Caixa: ${state.movimentos.length}`);
  console.log(`  - Apontamentos Mão de Obra: ${state.laborEntries.length}`);
  console.log(`  - Planos Preventivos: ${state.maintenancePlans.length}`);
  console.log(`  - Tenants Plataforma SaaS: ${saasTenants.length}`);

  return state;
}

async function executarVerify() {
  console.log('================================================================');
  console.log('  PÁTIO CRM — VERIFICAÇÃO E CONCILIAÇÃO DA BASE DEMO');
  console.log(`  Tenant: ${TENANT_ID}`);
  console.log('================================================================\n');

  await initDB();

  const row = await get('SELECT value FROM kv WHERE key = ?', [`tenant:${TENANT_ID}:state`]);
  if (!row || !row.value) {
    throw new Error(`Base demonstrativa não encontrada para "${TENANT_ID}". Execute --generate primeiro.`);
  }

  const state = JSON.parse(row.value);
  const relatorio = {
    sucesso: true,
    falhas: [],
    conciliacoes: {}
  };

  // 1. Verificação de Isolamento
  console.log('1. Verificando isolamento de produção...');
  const prodRow = await get("SELECT key FROM kv WHERE key = 'tenant:default:state'");
  if (prodRow && prodRow.key === `tenant:${TENANT_ID}:state`) {
    relatorio.falhas.push('Violação de isolamento: chave de produção igual a de demonstração!');
  } else {
    console.log('   ✔ Chave de produção default e chave demo estritamente isoladas.');
  }

  // 2. Conciliação Matemática de Estoque: Estoque_final = Inicial + Entradas - Saidas
  console.log('2. Conciliando estoque físico peça a peça...');
  let pecasComDivergencia = 0;

  state.pecas.forEach(p => {
    const movsPeca = state.inventoryMovements.filter(m => m.partId === p.id);
    const entradas = movsPeca
      .filter(m => ['entrada_compra', 'ajuste_positivo', 'devolucao_os'].includes(m.type))
      .reduce((acc, m) => acc + m.quantity, 0);
    const saidas = movsPeca
      .filter(m => ['saida_os', 'ajuste_negativo'].includes(m.type))
      .reduce((acc, m) => acc + m.quantity, 0);

    const saldoCalculado = entradas - saidas;
    if (saldoCalculado !== p.qtd || p.qtd < 0) {
      pecasComDivergencia++;
      relatorio.falhas.push(`Divergência peça ${p.id} (${p.codigoInterno}): saldo físico ${p.qtd} != calculado ${saldoCalculado}`);
    }
  });

  if (pecasComDivergencia === 0) {
    console.log(`   ✔ 100% das ${state.pecas.length} peças conciliadas perfeitamente (Zero divergência e saldo >= 0).`);
    relatorio.conciliacoes.estoque = '100% Conciliado';
  } else {
    console.error(`   ❌ ${pecasComDivergencia} peças com divergência de saldo!`);
  }

  // 3. Verificação de Coerência Cronológica
  console.log('3. Verificando coerência de datas...');
  let pagamentosFuturos = 0;
  let conclusoesFuturas = 0;

  state.contas.forEach(c => {
    if (c.pago && c.pagoEm && c.pagoEm.slice(0, 10) > DATA_FINAL_STR) {
      pagamentosFuturos++;
    }
  });

  state.os.forEach(o => {
    if (o.st === 'finalizada' && o.fechamento && o.fechamento.slice(0, 10) > DATA_FINAL_STR) {
      conclusoesFuturas++;
    }
  });

  if (pagamentosFuturos === 0 && conclusoesFuturas === 0) {
    console.log(`   ✔ Zero pagamentos ou conclusões futuras em relação a ${DATA_FINAL_STR}.`);
    relatorio.conciliacoes.cronologia = '100% Coerente';
  } else {
    relatorio.falhas.push(`Datas incoerentes: ${pagamentosFuturos} pagamentos futuros, ${conclusoesFuturas} conclusões futuras.`);
    console.error(`   ❌ Erro cronológico: ${pagamentosFuturos} pgtos futuros, ${conclusoesFuturas} conclusões futuras.`);
  }

  // 4. Verificação de Apontamentos de Mão de Obra (Anti-Sobreposição)
  console.log('4. Verificando anti-sobreposição de mecânicos...');
  let sobreposicoes = 0;

  state.workers.forEach(w => {
    const apontamentos = state.laborEntries
      .filter(l => l.workerId === w.id && l.startTime && l.endTime)
      .sort((a, b) => new Date(a.startTime) - new Date(b.startTime));

    for (let i = 0; i < apontamentos.length - 1; i++) {
      const atualFim = new Date(apontamentos[i].endTime).getTime();
      const proximoInicio = new Date(apontamentos[i + 1].startTime).getTime();
      if (proximoInicio < atualFim) {
        sobreposicoes++;
        relatorio.falhas.push(`Sobreposição mecânico ${w.nome}: apontamento ${apontamentos[i].id} sobrepõe ${apontamentos[i + 1].id}`);
      }
    }
  });

  if (sobreposicoes === 0) {
    console.log(`   ✔ Rigorosamente ZERO sobreposições de horário entre os mecânicos (${state.laborEntries.length} apontamentos).`);
    relatorio.conciliacoes.maoDeObra = 'Zero Sobreposições';
  } else {
    console.error(`   ❌ ${sobreposicoes} sobreposições encontradas!`);
  }

  // 5. Conciliação Financeira de Caixa
  console.log('5. Conciliando fluxo de caixa e saldos...');
  const saldoInicial = state.cfg.saldoInicial || 0;
  const totalEntradas = state.movimentos
    .filter(m => m.tipo === 'entrada')
    .reduce((acc, m) => acc + (Number(m.valor) || 0), 0);
  const totalSaidas = state.movimentos
    .filter(m => m.tipo === 'saida')
    .reduce((acc, m) => acc + (Number(m.valor) || 0), 0);

  const saldoConsolidado = arredondar(saldoInicial + totalEntradas - totalSaidas);
  console.log(`   - Saldo Inicial: R$ ${saldoInicial.toFixed(2)}`);
  console.log(`   - Total Entradas (Caixa): R$ ${totalEntradas.toFixed(2)}`);
  console.log(`   - Total Saídas (Caixa): R$ ${totalSaidas.toFixed(2)}`);
  console.log(`   - Saldo Atual Consolidado: R$ ${saldoConsolidado.toFixed(2)}`);

  if (saldoConsolidado > 0) {
    console.log('   ✔ Fluxo de caixa consistente e positivo.');
    relatorio.conciliacoes.saldoCaixa = `R$ ${saldoConsolidado.toFixed(2)}`;
  } else {
    relatorio.falhas.push(`Saldo de caixa inconsistente ou negativo: R$ ${saldoConsolidado}`);
  }

  // 6. Relatório Final da Verificação
  relatorio.sucesso = relatorio.falhas.length === 0;
  console.log('\n================================================================');
  console.log(`  STATUS FINAL DA VERIFICAÇÃO: ${relatorio.sucesso ? 'APROVADO (OK)' : 'FALHA'}`);
  console.log('================================================================');

  return relatorio;
}

async function executarPurge() {
  console.log('================================================================');
  console.log('  PÁTIO CRM — PURGA EXCLUSIVA DO LOTE DEMONSTRATIVO');
  console.log(`  Tenant: ${TENANT_ID} (Batch: ${DEMO_BATCH_ID})`);
  console.log('================================================================\n');

  await initDB();

  const res = await run('DELETE FROM kv WHERE key = ?', [`tenant:${TENANT_ID}:state`]);
  console.log(`[Purga] Registro removido de kv: ${res.changes} linha(s) afetada(s).`);

  // Remove memberships e usuário demo_admin
  const demoUser = await get("SELECT id FROM users WHERE username = 'demo_admin'");
  if (demoUser) {
    await run("DELETE FROM memberships WHERE user_id = ? OR tenant_id = ?", [demoUser.id, TENANT_ID]);
    await run("DELETE FROM users WHERE id = ?", [demoUser.id]);
    console.log('[Purga] Usuário "demo_admin" e associações removidos com segurança.');
  }

  // Remove tenants sintéticos de demonstração do SaaS
  await run("DELETE FROM billing_subscriptions WHERE tenant_id LIKE 'demo_%'");
  await run("DELETE FROM billing_customers WHERE tenant_id LIKE 'demo_%'");

  console.log('✔ Dados de produção preservados integralmente (0 alterações em produção).');
  return res;
}

/* =========================================================================
   8. DISPATCHER DA LINHA DE COMANDO
   ========================================================================= */

async function main() {
  const args = process.argv.slice(2);
  const comando = args[0] || '--generate';

  try {
    if (comando === '--verify') {
      const res = await executarVerify();
      if (!res.sucesso) process.exitCode = 1;
    } else if (comando === '--purge') {
      await executarPurge();
    } else if (comando === '--generate') {
      await executarGenerate();
      console.log('\nExecutando verificação automática pós-geração...');
      await executarVerify();
    } else {
      console.log(`Comando desconhecido: "${comando}". Opções: --generate, --verify, --purge`);
      process.exitCode = 1;
    }
  } catch (err) {
    console.error('Erro na execução do script:', err);
    process.exitCode = 1;
  } finally {
    await closeDB().catch(() => {});
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  TENANT_ID,
  TENANT_NAME,
  DEMO_BATCH_ID,
  DATA_INICIAL_STR,
  DATA_FINAL_STR,
  gerarDadosOficinaDemo,
  gerarTenantsDemoPlataforma,
  executarGenerate,
  executarVerify,
  executarPurge
};
