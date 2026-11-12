'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const {
  gerarPreOrcamentoRapidoSuspensao,
  converterPreOrcamentoWhatsAppEmOS,
  executarSkillOrcamentistaTecnicoWhatsApp
} = require('../services/whatsapp/whatsappTechnicalQuotationSkill');

const {
  apurarPreviaFechamentoCaixaDiario,
  fecharCaixaDiarioComAuditoria,
  gerarRelatorioFechamentoCaixaWhatsApp
} = require('../services/finance/dailyCashRegisterClosingService');

function criarEstadoMock() {
  return {
    tenantId: 'tenant_test_103',
    clientes: [
      { id: 'cli_regular', nome: 'Transportadora Regular Ltda', limiteCredito: 50000 },
      { id: 'cli_inadimplente', nome: 'Logística Inadimplente S/A', limiteCredito: 20000 }
    ],
    borderosFrotistas: [
      {
        id: 'bord_vencido_1',
        clienteId: 'cli_inadimplente',
        status: 'pendente',
        valorTotal: 15000,
        saldoDevedor: 15000,
        dataVencimento: '2026-10-01'
      }
    ],
    estoque: [
      {
        id: 'peca_mola_1',
        codigo: 'MOL-001',
        descricao: 'Feixe de Molas Traseiro 8 Lâminas',
        quantidade: 4,
        custoMedio: 350.00,
        preco: 400.00,
        categoria: 'Suspensão'
      },
      {
        id: 'peca_pino_1',
        codigo: 'PIN-002',
        descricao: 'Pino de Centro 1/2 x 8',
        quantidade: 0,
        custoMedio: 20.00,
        preco: 50.00,
        categoria: 'Suspensão'
      }
    ],
    servicos: [
      { id: 'srv_alinhamento', nome: 'Alinhamento a Laser de Eixo', preco: 180.00 },
      { id: 'srv_troca_mola', nome: 'Troca de Feixe de Molas', preco: 250.00 }
    ],
    os: [],
    partReservations: [],
    dailyCashClosings: [],
    whatsappPreQuotations: [],
    whatsappAgentLogs: [],
    contas: [],
    borderoSettlements: [],
    paymentCharges: []
  };
}

test('Sprint 10.3 — Task 1: Skill Orçamentista Técnico IA com Proteção de Margem pelo CMP', () => {
  const state = criarEstadoMock();

  // Teste 1.1: Proteção de CMP ativa (Custo R$ 350 + Markup 35% = R$ 472,50 > Preço Tabela R$ 400)
  const quote1 = gerarPreOrcamentoRapidoSuspensao(state, {
    clienteId: 'cli_regular',
    placa: 'MOL-1020',
    modeloVeiculo: 'Volvo FH 540',
    mensagemItens: 'Preciso de 2 feixes de mola e 2 pinos de centro',
    markupMinimoPercentual: 35,
    timestamp: '2026-11-12T10:00:00.000Z'
  });

  assert.ok(quote1.id, 'Deve gerar ID do pré-orçamento');
  assert.equal(quote1.status, 'enviado_whatsapp');
  assert.equal(quote1.condicaoPagamentoPermitida, 'faturado_bordero_ou_pix');

  const itemMola = quote1.itens.find(i => i.partId === 'peca_mola_1');
  assert.ok(itemMola, 'Deve encontrar feixe de mola');
  assert.equal(itemMola.precoUnitarioOrcado, 472.50, 'Deve elevar preço de R$ 400 para o piso CMP R$ 472.50');
  assert.equal(itemMola.ajusteMargemCMPAtivado, true);
  assert.equal(itemMola.statusEstoqueItem, 'pronta_entrega');

  const itemPino = quote1.itens.find(i => i.partId === 'peca_pino_1');
  assert.ok(itemPino, 'Deve encontrar pino de centro');
  assert.equal(itemPino.precoUnitarioOrcado, 50.00, 'Preço tabela R$ 50 supera piso CMP R$ 27');
  assert.equal(itemPino.ajusteMargemCMPAtivado, false);
  assert.equal(itemPino.statusEstoqueItem, 'encomenda_necessaria');

  // Teste 1.2: Cliente com restrição de crédito recebe somente à vista PIX
  const quoteInadimplente = gerarPreOrcamentoRapidoSuspensao(state, {
    clienteId: 'cli_inadimplente',
    placa: 'INA-9999',
    mensagemItens: '1 feixe de mola',
    timestamp: '2026-11-12T10:05:00.000Z'
  });
  assert.equal(quoteInadimplente.condicaoPagamentoPermitida, 'somente_a_vista_pix');

  // Teste 1.3: Resposta de texto formatada para WhatsApp e log registrado
  assert.match(quote1.respostaTextoWhatsApp, /Pré-Orçamento/i);
  assert.match(quote1.respostaTextoWhatsApp, /R\$\s*472[,.]50/);
  assert.ok(state.whatsappAgentLogs.length > 0, 'Deve registrar log no agente');
});

test('Sprint 10.3 — Task 2: Conversão em OS com Reserva de Peças e Trava de Inadimplência', () => {
  const state = criarEstadoMock();

  const quoteRegular = gerarPreOrcamentoRapidoSuspensao(state, {
    clienteId: 'cli_regular',
    placa: 'MOL-1020',
    mensagemItens: '2 feixes de mola e 1 troca de feixe de mola',
    timestamp: '2026-11-12T10:10:00.000Z'
  });

  const quoteInadimplente = gerarPreOrcamentoRapidoSuspensao(state, {
    clienteId: 'cli_inadimplente',
    placa: 'INA-9999',
    mensagemItens: '1 feixe de mola',
    timestamp: '2026-11-12T10:15:00.000Z'
  });

  // 2.1: Bloqueio de conversão a prazo para cliente inadimplente sem override
  assert.throws(() => {
    converterPreOrcamentoWhatsAppEmOS(state, quoteInadimplente.id, {
      modalidadePagamento: 'faturado_prazo',
      autorizarOverrideCreditoCliente: false
    });
  }, (err) => {
    assert.equal(err.code, 'CLIENT_CREDIT_BLOCKED_FOR_QUOTATION');
    return true;
  });

  // 2.2: Conversão permitida à vista / PIX mesmo com crédito bloqueado
  const quoteInad2 = gerarPreOrcamentoRapidoSuspensao(state, {
    clienteId: 'cli_inadimplente',
    placa: 'INA-8888',
    mensagemItens: '1 pino de centro',
    timestamp: '2026-11-12T10:16:00.000Z'
  });
  const convPix = converterPreOrcamentoWhatsAppEmOS(state, quoteInad2.id, {
    modalidadePagamento: 'a_vista_pix'
  });
  assert.equal(convPix.ok, true, 'Conversão à vista PIX deve ser autorizada');

  // 2.3: Conversão autorizada com override gerencial
  const convInad = converterPreOrcamentoWhatsAppEmOS(state, quoteInadimplente.id, {
    autorizarOverrideCreditoCliente: true,
    justificativaOverride: 'Autorizado pelo Diretor Comercial via WhatsApp'
  });
  assert.equal(convInad.ok, true);
  assert.ok(convInad.novaOS.id);
  assert.equal(convInad.preOrcamento.status, 'convertido_os');

  // 2.4: Conversão regular com criação de OS e reservas de peças prontas
  const convReg = converterPreOrcamentoWhatsAppEmOS(state, quoteRegular.id, {
    gerarLinkPortalB2B: true,
    timestamp: '2026-11-12T10:20:00.000Z'
  });
  assert.equal(convReg.ok, true);
  assert.equal(state.os.length, 3);
  assert.ok(state.partReservations.length >= 1, 'Deve reservar peças com estoque');

  // 2.5: Bloqueio de conversão duplicada
  assert.throws(() => {
    converterPreOrcamentoWhatsAppEmOS(state, quoteRegular.id);
  }, (err) => {
    assert.equal(err.code, 'PRE_QUOTATION_ALREADY_CONVERTED');
    return true;
  });
});

test('Sprint 10.3 — Task 3: Motor de Fechamento de Caixa Diário — Prévia Analítica', () => {
  const state = criarEstadoMock();
  const dataHoje = '2026-11-12';

  // Lançamentos de entrada
  state.paymentCharges.push({
    id: 'chg_pix_1',
    valor: 450.00,
    meioPagamento: 'PIX',
    status: 'pago',
    pagoEm: '2026-11-12T11:00:00.000Z'
  });
  state.borderoSettlements.push({
    id: 'set_bol_1',
    valorPago: 3200.00,
    meioPagamento: 'BOLETO',
    liquidadoEm: '2026-11-12T14:30:00.000Z'
  });
  state.contas.push({
    id: 'rec_din_1',
    tipo: 'receber',
    valor: 350.00,
    formaPagamento: 'DINHEIRO',
    status: 'pago',
    pagoEm: '2026-11-12T15:00:00.000Z'
  });

  // Lançamentos de saída
  state.contas.push({
    id: 'pag_despesa_1',
    tipo: 'pagar',
    valor: 800.00,
    status: 'pago',
    pagoEm: '2026-11-12T16:00:00.000Z'
  });

  const previa = apurarPreviaFechamentoCaixaDiario(state, {
    dataCaixa: dataHoje,
    saldoInicialInformado: 1000.00
  });

  assert.equal(previa.totalEntradasDia, 4000.00, '450 + 3200 + 350');
  assert.equal(previa.totalSaidasDia, 800.00);
  assert.equal(previa.saldoLiquidoDia, 3200.00);
  assert.equal(previa.saldoFinalEsperado, 4200.00, '1000 + 3200');
  assert.equal(previa.detalhamentoMeios.PIX, 450.00);
  assert.equal(previa.detalhamentoMeios.BOLETO, 3200.00);
  assert.equal(previa.detalhamentoMeios.DINHEIRO, 350.00);
});

test('Sprint 10.3 — Task 4: Fechamento de Caixa Auditado, Hash SHA-256 e Bloqueio de Duplicidade', () => {
  const state = criarEstadoMock();
  const dataHoje = '2026-11-12';

  state.paymentCharges.push({
    id: 'chg_pix_1',
    valor: 1000.00,
    meioPagamento: 'PIX',
    status: 'pago',
    pagoEm: '2026-11-12T11:00:00.000Z'
  });

  // 4.1: Rejeição se houver divergência sem justificativa
  assert.throws(() => {
    fecharCaixaDiarioComAuditoria(state, {
      dataCaixa: dataHoje,
      saldoInicialInformado: 500.00,
      valoresConferidosPorMeio: { PIX: 950.00 }, // divergência de -50.00
      justificativaDivergencia: ''
    });
  }, (err) => {
    assert.equal(err.code, 'CASH_DISCREPANCY_JUSTIFICATION_REQUIRED');
    return true;
  });

  // 4.2: Fechamento auditado com justificativa e hash SHA-256
  const fechamento = fecharCaixaDiarioComAuditoria(state, {
    dataCaixa: dataHoje,
    saldoInicialInformado: 500.00,
    valoresConferidosPorMeio: { PIX: 950.00 },
    justificativaDivergencia: 'Taxa de compensação bancária descontada no terminal',
    responsavel: 'Gerente Carlos',
    timestamp: '2026-11-12T18:00:00.000Z'
  });

  assert.equal(fechamento.ok, true);
  assert.equal(fechamento.registro.status, 'fechado');
  assert.equal(fechamento.registro.statusAuditoria, 'fechado_com_divergencia');
  assert.ok(fechamento.registro.hashFechamentoCaixa, 'Deve conter hash SHA-256');
  assert.equal(fechamento.registro.hashFechamentoCaixa.length, 64);

  // 4.3: Bloqueio de duplo fechamento
  assert.throws(() => {
    fecharCaixaDiarioComAuditoria(state, { dataCaixa: dataHoje });
  }, (err) => {
    assert.equal(err.code, 'CASH_REGISTER_ALREADY_CLOSED');
    return true;
  });

  // 4.4: Envio do boletim/relatório no WhatsApp
  const relatorioWpp = gerarRelatorioFechamentoCaixaWhatsApp(state, { dataCaixa: dataHoje });
  assert.ok(relatorioWpp.ok);
  assert.match(relatorioWpp.respostaTextoWhatsApp, /Fechamento de Caixa/i);
});

test('Sprint 10.3 — Task 5: Roteamento no Agente WhatsApp, Rotas REST e UI Frontend', () => {
  const state = criarEstadoMock();

  // Teste 5.1: Orquestrador WhatsApp reconhece intenção de orçamento
  const respSkill = executarSkillOrcamentistaTecnicoWhatsApp(state, {
    mensagem: 'Qual o valor do feixe de mola para o caminhão?',
    clienteId: 'cli_regular',
    placa: 'MOL-1020',
    timestamp: '2026-11-12T11:30:00.000Z'
  });
  assert.equal(respSkill.ok, true);
  assert.equal(respSkill.skill, 'SKILL_ORCAMENTISTA_TECNICO');

  // Teste 5.2: Validação de rotas registradas
  const routesPath = path.resolve(__dirname, '../routes/whatsapp_orcamentista_caixa.routes.js');
  assert.ok(fs.existsSync(routesPath), 'routes/whatsapp_orcamentista_caixa.routes.js deve existir');

  // Teste 5.3: UI e Actions exportados no global/window
  const uiPath = path.resolve(__dirname, '../js/modules/whatsapp_orcamentista_caixa_ui.js');
  const actionsPath = path.resolve(__dirname, '../js/modules/whatsapp_orcamentista_caixa_actions.js');
  assert.ok(fs.existsSync(uiPath), 'whatsapp_orcamentista_caixa_ui.js deve existir');
  assert.ok(fs.existsSync(actionsPath), 'whatsapp_orcamentista_caixa_actions.js deve existir');

  const mockGlobal = {
    document: {
      addEventListener: () => {},
      getElementById: () => null,
      querySelector: () => null
    },
    app: { toast: () => {} }
  };
  mockGlobal.window = mockGlobal;
  mockGlobal.globalThis = mockGlobal;

  vm.runInNewContext(fs.readFileSync(uiPath, 'utf8'), mockGlobal);
  vm.runInNewContext(fs.readFileSync(actionsPath, 'utf8'), mockGlobal);

  assert.equal(typeof mockGlobal.renderPainelOrcamentistaECaixaDiarioHtml, 'function');
  assert.equal(typeof mockGlobal.modalGerarPreOrcamentoWhatsAppHtml, 'function');
  assert.equal(typeof mockGlobal.modalFecharCaixaDiarioHtml, 'function');
  assert.equal(typeof mockGlobal.abrirModalPreOrcamentoWhatsApp, 'function');
  assert.equal(typeof mockGlobal.abrirModalFecharCaixaDiario, 'function');

  // Teste 5.4: Comando de fechamento de caixa recebido pelo Analista Financeiro
  const { executarSkillAnalistaFinanceiroAutonomo } = require('../services/whatsapp/whatsappFinancialAnalystSkill');
  const resCxGerencia = executarSkillAnalistaFinanceiroAutonomo(state, {
    mensagem: 'Verônica, por favor faça o fechamento de caixa de hoje',
    perfilRemetente: 'gerente',
    dataCaixa: '2026-11-12'
  });
  assert.equal(resCxGerencia.subtipo, 'fechamento_caixa_diario');
  assert.match(resCxGerencia.respostaTextoWhatsApp, /Boletim de Fechamento de Caixa/i);
});

