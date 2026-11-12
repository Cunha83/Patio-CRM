'use strict';

/**
 * tests/sprint102_whatsapp_autonomous_skills_bank_api.test.cjs
 *
 * Suíte de Testes TDD da Sprint 10.2:
 * 1. Decomposição Modular do Agente WhatsApp (<= 200 linhas) e Preservação de Exports
 * 2. Skill Recepção Interativa no WhatsApp: Triagem 360º, Fast Check-in e Link de Aprovação
 * 3. Skill Analista Financeiro: Cobrança PIX/Boleto, Baixa de Extrato PDF/CNAB e Desbloqueio de Comissão
 * 4. Conector Direto de API Bancária e Webhook de Liquidação Instantânea
 * 5. Integração REST e Componentes Visuais do Frontend
 *
 * Teto Modular: <= 350 linhas
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const whatsappAgentSkillsService = require('../services/whatsapp/whatsappAgentSkillsService');
const whatsappReceptionPatioSkill = require('../services/whatsapp/whatsappReceptionPatioSkill');
const whatsappFinancialAnalystSkill = require('../services/whatsapp/whatsappFinancialAnalystSkill');
const bankDirectApiConnectorService = require('../services/finance/bankDirectApiConnectorService');

function criarEstadoBase() {
  return {
    tenantId: 'tenant_sprint102',
    clientes: [
      { id: 'cli_alfa', nome: 'Transportes Alfa Ltda', doc: '11.111.111/0001-11', limiteCredito: 50000 },
      { id: 'cli_inadimplente', nome: 'Logística Devedora S/A', doc: '22.222.222/0001-22', limiteCredito: 10000 }
    ],
    veiculos: [
      { id: 'vei_1', placa: 'ALF1A10', cli: 'cli_alfa', modelo: 'Volvo FH 540' },
      { id: 'vei_inad', placa: 'DEV9D99', cli: 'cli_inadimplente', modelo: 'Scania R450' }
    ],
    patioBoxes: [
      { id: 'box_1', nome: 'Box Pesado 01', tipoBox: 'pesado_mola', status: 'livre', osAtualId: null },
      { id: 'box_2', nome: 'Box Pesado 02', tipoBox: 'pesado_mola', status: 'livre', osAtualId: null }
    ],
    opportunities: [
      {
        id: 'opp_alfa_1',
        tenantId: 'tenant_sprint102',
        clienteId: 'cli_alfa',
        placa: 'ALF1A10',
        origemOSNum: 900,
        status: 'pendente',
        valorTotalEstimado: 2500,
        servicos: [{ id: 'srv_dem_1', desc: 'Arqueamento de Feixe Traseiro', preco: 1500, total: 1500 }],
        pecas: [{ id: 'peca_dem_1', desc: 'Lâmina Mestra 90mm', preco: 1000, total: 1000 }]
      }
    ],
    predictiveAlerts: [
      {
        id: 'alt_alfa_1',
        tenantId: 'tenant_sprint102',
        placa: 'ALF1A10',
        sistemaTecnico: 'suspensao_traseira',
        statusPreventivo: 'vencida',
        valorEstimadoRevisao: 800,
        descricaoServico: 'Revisão Preventiva de Pinos e Buchas'
      }
    ],
    borderos: [
      {
        id: 'bord_alfa_10',
        num: 1010,
        tenantId: 'tenant_sprint102',
        clienteId: 'cli_alfa',
        clienteNome: 'Transportes Alfa Ltda',
        valorTotal: 6500.00,
        saldoDevedor: 6500.00,
        valorPagoAcumulado: 0,
        status: 'emitido',
        dataVencimento: '2026-12-30',
        osIds: ['os_101', 'os_102']
      },
      {
        id: 'bord_inad_99',
        num: 9999,
        tenantId: 'tenant_sprint102',
        clienteId: 'cli_inadimplente',
        clienteNome: 'Logística Devedora S/A',
        valorTotal: 15000.00,
        saldoDevedor: 15000.00,
        valorPagoAcumulado: 0,
        status: 'em_atraso',
        dataVencimento: '2026-01-10', // Vencido
        osIds: ['os_dev_1']
      }
    ],
    os: [
      {
        id: 'os_101',
        num: 101,
        tenantId: 'tenant_sprint102',
        clienteId: 'cli_alfa',
        placa: 'ALF1A10',
        mecanicoId: 'mec_carlos',
        total: 3500,
        comissaoMecanico: { mecanicoId: 'mec_carlos', valorComissao: 350, statusComissao: 'aguardando_liquidacao_bordero' },
        st: 'finalizada'
      },
      {
        id: 'os_102',
        num: 102,
        tenantId: 'tenant_sprint102',
        clienteId: 'cli_alfa',
        placa: 'ALF1A10',
        mecanicoId: 'mec_joao',
        total: 3000,
        comissaoMecanico: { mecanicoId: 'mec_joao', valorComissao: 300, statusComissao: 'aguardando_liquidacao_bordero' },
        st: 'finalizada'
      }
    ],
    contas: [
      {
        id: 'cta_pagar_1',
        tenantId: 'tenant_sprint102',
        tipo: 'pagar',
        descricao: 'Boleto Fornecedor Aço Molas',
        valor: 1200.00,
        status: 'aberto',
        vencimento: '2026-12-15'
      }
    ],
    paymentCharges: [],
    bankApiConnections: [],
    whatsappAgentLogs: []
  };
}

test('Sprint 10.2 — Task 1: Decomposição Modular do Agente WhatsApp e Contratos Públicos', () => {
  const fileSkills = path.resolve(__dirname, '../services/whatsapp/whatsappAgentSkillsService.js');
  const fileReception = path.resolve(__dirname, '../services/whatsapp/whatsappReceptionPatioSkill.js');
  const fileFinancial = path.resolve(__dirname, '../services/whatsapp/whatsappFinancialAnalystSkill.js');

  assert.ok(fs.existsSync(fileSkills), 'whatsappAgentSkillsService.js deve existir');
  assert.ok(fs.existsSync(fileReception), 'whatsappReceptionPatioSkill.js deve existir');
  assert.ok(fs.existsSync(fileFinancial), 'whatsappFinancialAnalystSkill.js deve existir');

  const linesSkills = fs.readFileSync(fileSkills, 'utf8').split('\n').length;
  const linesReception = fs.readFileSync(fileReception, 'utf8').split('\n').length;
  const linesFinancial = fs.readFileSync(fileFinancial, 'utf8').split('\n').length;

  assert.ok(linesSkills <= 210, `whatsappAgentSkillsService.js deve ter <= 210 linhas (atual: ${linesSkills})`);
  assert.ok(linesReception <= 265, `whatsappReceptionPatioSkill.js deve ter <= 265 linhas (atual: ${linesReception})`);
  assert.ok(linesFinancial <= 275, `whatsappFinancialAnalystSkill.js deve ter <= 275 linhas (atual: ${linesFinancial})`);

  // Preservação de contratos
  assert.equal(typeof whatsappAgentSkillsService.identificarIntencaoEPerfilWhatsApp, 'function');
  assert.equal(typeof whatsappAgentSkillsService.executarSkillRecepcaoPatio, 'function');
  assert.equal(typeof whatsappAgentSkillsService.executarSkillAnalistaFinanceiroGerencia, 'function');
  assert.equal(typeof whatsappAgentSkillsService.processarMensagemAgenteWhatsApp, 'function');
});

test('Sprint 10.2 — Task 2: Recepção Interativa no WhatsApp (Triagem 360º, Fast Check-in & Link de Aprovação)', () => {
  const state = criarEstadoBase();

  // 1. Triagem 360º por placa via WhatsApp
  const triagemRes = whatsappReceptionPatioSkill.executarSkillRecepcaoInterativaWhatsApp(state, {
    mensagem: 'Olá, solicitar triagem portaria placa ALF1A10',
    placa: 'ALF1A10',
    acaoRecepcao: 'triagem_360',
    kmEntrada: 154000
  });

  assert.equal(triagemRes.skill, 'SKILL_RECEPCAO_PATIO');
  assert.equal(triagemRes.acaoExecutada, 'triagem_360');
  assert.ok(triagemRes.respostaTextoWhatsApp.includes('ALF1A10'));
  assert.ok(triagemRes.respostaTextoWhatsApp.includes('Transportes Alfa'));
  assert.ok(triagemRes.respostaTextoWhatsApp.includes('Box Pesado 01'));
  assert.equal(triagemRes.dadosOperacionais.situacaoCreditoCliente.statusCredito, 'regular');

  // 2. Fast Check-in via WhatsApp abrindo OS e alocando Box
  const checkinRes = whatsappReceptionPatioSkill.executarSkillRecepcaoInterativaWhatsApp(state, {
    mensagem: 'Confirmar checkin e abrir os recepcao placa ALF1A10',
    placa: 'ALF1A10',
    acaoRecepcao: 'fast_checkin_whatsapp',
    kmEntrada: 154000,
    motoristaNome: 'Marcos Silva',
    incluirOportunidadesIds: ['opp_alfa_1'],
    incluirAlertasPreventivosIds: ['alt_alfa_1']
  });

  assert.equal(checkinRes.acaoExecutada, 'fast_checkin_whatsapp');
  assert.ok(checkinRes.respostaTextoWhatsApp.includes('OS'));
  assert.ok(checkinRes.respostaTextoWhatsApp.includes('Box Pesado 01'));
  const osCriada = state.os.find(o => o.id === checkinRes.dadosOperacionais.novaOS?.id);
  assert.ok(osCriada, 'OS deve ser criada no state');
  assert.equal(osCriada.placa, 'ALF1A10');
  assert.equal(osCriada.motoristaNome, 'Marcos Silva');
  assert.ok(osCriada.servicos.length >= 2, 'Deve incorporar preventiva e demanda reprimida');

  // 3. Fast Check-in de cliente com crédito bloqueado na portaria
  const checkinBloqRes = whatsappReceptionPatioSkill.executarSkillRecepcaoInterativaWhatsApp(state, {
    mensagem: 'fazer checkin DEV9D99',
    placa: 'DEV9D99',
    acaoRecepcao: 'fast_checkin_whatsapp'
  });
  assert.equal(checkinBloqRes.acaoExecutada, 'checkin_bloqueado_credito');
  assert.ok(checkinBloqRes.respostaTextoWhatsApp.includes('bloqueado') || checkinBloqRes.respostaTextoWhatsApp.includes('crédito'));

  // 4. Solicitação de link tokenizado de aprovação
  const linkRes = whatsappReceptionPatioSkill.executarSkillRecepcaoInterativaWhatsApp(state, {
    mensagem: 'solicitar link aprovacao orcamento placa ALF1A10',
    placa: 'ALF1A10',
    acaoRecepcao: 'solicitar_link_aprovacao'
  });
  assert.equal(linkRes.acaoExecutada, 'link_aprovacao_frotista');
  assert.ok(linkRes.respostaTextoWhatsApp.includes('token') || linkRes.respostaTextoWhatsApp.includes('aprovacao-externa'));
});

test('Sprint 10.2 — Task 3: Analista Financeiro, Cobrança PIX/Boleto e Baixa de Extrato', () => {
  const state = criarEstadoBase();

  // 1. Bloqueio RBAC para perfil não autorizado
  assert.throws(() => {
    whatsappFinancialAnalystSkill.executarSkillAnalistaFinanceiroAutonomo(state, {
      perfilRemetente: 'mecanico',
      mensagem: 'gerar cobranca pix'
    });
  }, { code: 'WHATSAPP_UNAUTHORIZED_MANAGEMENT_SKILL' });

  // 2. Gerar Cobrança PIX/Boleto para Borderô
  const cobrancaRes = whatsappFinancialAnalystSkill.gerarCobrancaPixBoletoWhatsApp(state, {
    clienteId: 'cli_alfa',
    borderoId: 'bord_alfa_10',
    formaCobranca: 'pix_brcode_e_boleto'
  });

  assert.equal(cobrancaRes.ok, true);
  assert.ok(cobrancaRes.cobranca.txid);
  assert.equal(cobrancaRes.cobranca.valorCobrar, 6500.00);
  assert.ok(cobrancaRes.cobranca.pixCopiaECola.startsWith('000201'));
  assert.ok(cobrancaRes.cobranca.linhaDigitavelBoleto);
  assert.ok(state.paymentCharges.some(c => c.txid === cobrancaRes.cobranca.txid));
  assert.ok(cobrancaRes.respostaTextoWhatsApp.includes('PIX Copia e Cola'));

  // 3. Conciliação e Baixa via Anexo CNAB no WhatsApp
  const cnabRetornoRaw = [
    '01/12/2026;CREDITO;6500,00;TXID_ALFA_10;LIQ BORDERO 1010 TRANSPORTES ALFA',
    '01/12/2026;DEBITO;1200,00;DOC_DEB_1;PAGTO BOLETO ACO MOLAS'
  ].join('\n');

  const baixaRes = whatsappFinancialAnalystSkill.executarSkillAnalistaFinanceiroAutonomo(state, {
    perfilRemetente: 'gerencia',
    anexoExtrato: {
      formato: 'cnab_240_400',
      conteudoRaw: cnabRetornoRaw
    }
  });

  assert.equal(baixaRes.skill, 'SKILL_CONCILIACAO_EXTRATO');
  const bordero = state.borderos.find(b => b.id === 'bord_alfa_10');
  assert.equal(bordero.status, 'liquidado');
  assert.equal(bordero.saldoDevedor, 0);

  // Valida comissões dos mecânicos destravadas
  const os1 = state.os.find(o => o.id === 'os_101');
  const os2 = state.os.find(o => o.id === 'os_102');
  assert.equal(os1.comissaoMecanico.statusComissao, 'os_recebida');
  assert.equal(os2.comissaoMecanico.statusComissao, 'os_recebida');

  // Valida conta a pagar baixada
  const cta = state.contas.find(c => c.id === 'cta_pagar_1');
  assert.equal(cta.status, 'pago');
});

test('Sprint 10.2 — Task 4: Conector Direto de API Bancária e Webhook de Liquidação Instantânea', () => {
  const state = criarEstadoBase();

  // 1. Configurar Conexão Direta API Bancária
  const cfgRes = bankDirectApiConnectorService.configurarCredenciaisApiBanco(state, {
    codigoBanco: '756',
    nomeBanco: 'Sicoob Open Banking API',
    clientId: 'cli_sicoob_987',
    clientSecret: 'secret_muito_seguro_123',
    webhookSecret: 'whsec_banco_pix_777',
    chavePixPadrao: 'financeiro@automolasfort.com.br',
    contaCorrente: '12345-6'
  });
  assert.equal(cfgRes.ok, true);
  assert.equal(cfgRes.conexao.codigoBanco, '756');
  assert.equal(cfgRes.conexao.clientSecret, undefined, 'Não deve expor secrets sensíveis');
  assert.ok(state.bankApiConnections.length === 1);

  // 2. Sincronização Direta de Extrato via API
  const syncRes = bankDirectApiConnectorService.sincronizarExtratoDiretoApiBanco(state, {
    conexaoId: cfgRes.conexao.id,
    transacoesRetornadasApi: [
      { idTransacaoBanco: 'TXB_01', data: '2026-12-05', tipo: 'CREDITO', valor: 6500.00, descricao: 'TED RECEBIDA BORDERO 1010' }
    ]
  });
  assert.equal(syncRes.ok, true);
  assert.equal(syncRes.conciliacao.borderosLiquidadosIds.length, 1);
  assert.equal(state.borderos[0].status, 'liquidado');

  // 3. Webhook de Liquidação Instantânea PIX/Boleto
  const stateWebhook = criarEstadoBase();
  // Cria cobrança ativa no state
  const cobranca = {
    id: 'chg_wh_1',
    txid: 'TXPIX889900',
    clienteId: 'cli_alfa',
    borderoId: 'bord_alfa_10',
    valorCobrar: 6500.00,
    status: 'ativa'
  };
  stateWebhook.paymentCharges.push(cobranca);

  const webhookRes = bankDirectApiConnectorService.processarWebhookLiquidacaoInstantaneaPixBoleto(stateWebhook, {
    txid: 'TXPIX889900',
    valorPago: 6500.00,
    dataPagamento: '2026-12-05T14:30:00Z',
    idTransacaoBanco: 'E9876543210'
  });

  assert.equal(webhookRes.ok, true);
  assert.equal(webhookRes.cobranca.status, 'liquidada_webhook');
  assert.equal(stateWebhook.borderos[0].status, 'liquidado');
  assert.equal(stateWebhook.os[0].comissaoMecanico.statusComissao, 'os_recebida');
});

test('Sprint 10.2 — Task 5: Componentes Visuais e Actions de UI do Agente WhatsApp e Banco', () => {
  const uiPath = path.resolve(__dirname, '../js/modules/whatsapp_agente_autonomo_ui.js');
  const actPath = path.resolve(__dirname, '../js/modules/whatsapp_agente_autonomo_actions.js');
  assert.ok(fs.existsSync(uiPath), 'whatsapp_agente_autonomo_ui.js deve existir');
  assert.ok(fs.existsSync(actPath), 'whatsapp_agente_autonomo_actions.js deve existir');

  const linesUi = fs.readFileSync(uiPath, 'utf8').split('\n').length;
  const linesAct = fs.readFileSync(actPath, 'utf8').split('\n').length;
  assert.ok(linesUi <= 280, `whatsapp_agente_autonomo_ui.js <= 280 linhas (atual: ${linesUi})`);
  assert.ok(linesAct <= 280, `whatsapp_agente_autonomo_actions.js <= 280 linhas (atual: ${linesAct})`);

  const mockGlobal = {};
  mockGlobal.window = mockGlobal;
  mockGlobal.globalThis = mockGlobal;
  const vm = require('node:vm');
  vm.runInNewContext(fs.readFileSync(uiPath, 'utf8'), mockGlobal);
  vm.runInNewContext(fs.readFileSync(actPath, 'utf8'), mockGlobal);

  assert.equal(typeof mockGlobal.renderPainelAgenteWhatsAppEBancoDiretoHtml, 'function');
  assert.equal(typeof mockGlobal.modalGerarCobrancaPixBoletoHtml, 'function');
  assert.equal(typeof mockGlobal.modalConfigurarApiBancoDiretoHtml, 'function');
  assert.equal(typeof mockGlobal.enviarMensagemRecepcaoWhatsAppAction, 'function');
  assert.equal(typeof mockGlobal.enviarComandoAnalistaFinanceiroAction, 'function');
  assert.equal(typeof mockGlobal.confirmarGerarCobrancaPixBoletoAction, 'function');
});
