'use strict';

/**
 * tests/sprint105_credit_recovery_gateway_autonomous.test.cjs
 *
 * Suíte de Testes TDD da Sprint 10.5:
 * 1. [P1] Régua de Cobrança por Cliente, Acordo de Renegociação e Desbloqueio Condicional na Portaria
 * 2. [P2] Gateway WhatsApp Real (Evolution API / Cloud API), HMAC, Idempotência e Extrator de Extrato PDF
 * 3. [P3] Orquestrador do Ciclo Autônomo Diário 360º (Autopilot P1 -> P2 -> P3 -> P4)
 * 4. [P4] Rotas REST e Componentes de UI/Actions
 *
 * Teto Modular: <= 350 linhas
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');

const {
  apurarFilaReguaCobrancaPorCliente,
  dispararReguaCobrancaAtivaWhatsApp,
  formalizarAcordoRenegociacaoDividaCliente,
  liquidarEntradaAcordoEDesbloquearCreditoCliente
} = require('../services/whatsapp/whatsappCreditRecoverySkill');

const {
  configurarInstanciaGatewayWhatsApp,
  receberWebhookRealGatewayWhatsApp,
  enfileirarDisparoOutboundWhatsApp,
  processarFilaRetentativasOutboundWhatsApp
} = require('../services/whatsapp/whatsappGatewayAdapterService');

const {
  executarCicloAutonomoDiarioAgenteWhatsApp
} = require('../services/whatsapp/whatsappAutonomousCommandCenterService');

const { realizarTriagemPortariaPorPlaca } = require('../services/patio/smartGatehouseCheckinService');

function criarEstadoMock() {
  return {
    clientes: [
      { id: 'cli_transp_ceara', nome: 'Transportadora Ceará Express', telefone: '5585988881111', politicaCredito: { limiteCredito: 10000, diasToleranciaAtraso: 5, bloqueioAutomatico: true } },
      { id: 'cli_agro_norte', nome: 'Agro Norte Grãos', telefone: '5585977772222', politicaCredito: { limiteCredito: 15000, diasToleranciaAtraso: 5, bloqueioAutomatico: true } }
    ],
    veiculos: [
      { placa: 'CEE1A23', clienteId: 'cli_transp_ceara', modelo: 'Volvo FH 540', ano: 2022 }
    ],
    borderos: [],
    contas: [],
    paymentCharges: [],
    debtSettlementAgreements: [],
    creditCollectionLogs: [],
    whatsappAgentLogs: [],
    whatsappOutboundQueue: [],
    processedWebhookMessageIds: [],
    autonomousCycleLogs: [],
    patioBoxes: [{ id: 'box_1', numero: '01', status: 'livre' }],
    os: [],
    purchases: []
  };
}

test('Sprint 10.5 — Task 1: [P1] Régua de Cobrança por Cliente, Acordo e Desbloqueio Condicional na Portaria', async (t) => {
  const state = criarEstadoMock();
  const hoje = '2026-11-12';
  const vencimentoAtrasado = '2026-10-23'; // 20 dias de atraso

  state.borderos.push({
    id: 'bor_vencido_01',
    num: 'BORD-001',
    clienteId: 'cli_transp_ceara',
    clienteNome: 'Transportadora Ceará Express',
    dataVencimento: vencimentoAtrasado,
    status: 'fechado',
    saldoDevedor: 5000.00,
    totais: { totalLiquido: 5000.00 }
  });

  // 1. Apuração da fila por cliente
  const fila = apurarFilaReguaCobrancaPorCliente(state, { dataReferencia: hoje });
  assert.equal(fila.length, 1);
  assert.equal(fila[0].clienteId, 'cli_transp_ceara');
  assert.equal(fila[0].estagio, 'acordo_renegociacao_d_mais_15');
  assert.equal(fila[0].diasAtrasoMaximo, 20);
  assert.equal(fila[0].valorTotalExposicaoVencidaCliente, 5000.00);

  // 2. Disparo da régua de cobrança
  const reguaRes = dispararReguaCobrancaAtivaWhatsApp(state, { timestamp: hoje });
  assert.equal(reguaRes.totalClientesCobrados, 1);
  assert.ok(state.creditCollectionLogs.length > 0);
  assert.match(state.creditCollectionLogs[0].mensagem, /PROPOSTA DE ACORDO/);

  // 3. Verificação de trava na Portaria Inteligente
  const triagemAntes = realizarTriagemPortariaPorPlaca(state, { placa: 'CEE1A23', dataReferencia: hoje });
  assert.equal(triagemAntes.situacaoCreditoCliente.bloqueadoPorInadimplencia, true, 'Cliente deve estar com crédito bloqueado na Portaria');

  // 4. Formalização de acordo
  const acordoRes = formalizarAcordoRenegociacaoDividaCliente(state, {
    clienteId: 'cli_transp_ceara',
    percentualEntradaMinima: 30,
    quantidadeParcelasRestantes: 3,
    descontoJurosMultaPercentual: 0,
    jurosAcordoPercentual: 0,
    primeiroVencimentoParcelas: '2026-12-12',
    timestamp: hoje
  });
  assert.ok(acordoRes.acordo);
  assert.equal(acordoRes.acordo.valorTotalDividaOriginal, 5000.00);
  assert.equal(acordoRes.acordo.valorEntrada, 1500.00);
  assert.equal(acordoRes.acordo.valorParcela, 1166.67);
  assert.equal(acordoRes.acordo.status, 'aguardando_pagamento_entrada');
  assert.equal(acordoRes.acordo.creditoClienteDesbloqueado, false);

  // Antes de pagar a entrada, continua bloqueado
  const triagemDurante = realizarTriagemPortariaPorPlaca(state, { placa: 'CEE1A23', dataReferencia: hoje });
  assert.equal(triagemDurante.situacaoCreditoCliente.bloqueadoPorInadimplencia, true);

  // 5. Liquidação da entrada do acordo
  const liquidaRes = liquidarEntradaAcordoEDesbloquearCreditoCliente(state, acordoRes.acordo.id, {
    valorPagoEntrada: 1500.00,
    meioPagamento: 'PIX',
    timestamp: hoje
  });
  assert.equal(liquidaRes.sucesso, true);
  assert.equal(liquidaRes.creditoClienteDesbloqueado, true);

  // Borderô original deve estar renegociado e com saldo zero
  const borModificado = state.borderos.find(b => b.id === 'bor_vencido_01');
  assert.equal(borModificado.status, 'renegociado_acordo');
  assert.equal(borModificado.saldoDevedor, 0);

  // Três novas parcelas criadas com vencimentos futuros
  const novasParcelas = state.contas.filter(c => c.acordoId === acordoRes.acordo.id);
  assert.equal(novasParcelas.length, 3);
  assert.equal(novasParcelas[0].status, 'pendente');

  // 6. CLIENTE AGORA TEM CRÉDITO DESBLOQUEADO NA PORTARIA!
  const triagemDepois = realizarTriagemPortariaPorPlaca(state, { placa: 'CEE1A23', dataReferencia: hoje });
  assert.equal(triagemDepois.situacaoCreditoCliente.bloqueadoPorInadimplencia, false, 'Cliente deve ser reabilitado na Portaria após pagar entrada');
  assert.equal(triagemDepois.situacaoCreditoCliente.statusCredito, 'regular');
});

test('Sprint 10.5 — Task 2: [P2] Gateway WhatsApp Real, Validação HMAC, Idempotência e Extrator de Extrato PDF', async (t) => {
  const state = criarEstadoMock();
  const secret = 'chave-hmac-ultra-segura-2026';

  // 1. Configuração do Gateway
  const config = configurarInstanciaGatewayWhatsApp(state, {
    provedor: 'evolution_api',
    instanceName: 'patio-evolution-01',
    baseUrl: 'http://localhost:8080',
    apiKey: 'secret_token_12345',
    webhookSecret: secret,
    maxTentativasRetry: 2
  });
  assert.equal(config.provedor, 'evolution_api');
  assert.equal(config.apiKeyMascarada, '***2345');

  // 2. Rejeição de Webhook por HMAC inválido
  const rawBodyInvalido = JSON.stringify({ mensagem: 'teste sem assinatura' });
  assert.throws(() => {
    receberWebhookRealGatewayWhatsApp(state, JSON.parse(rawBodyInvalido), {
      signatureHeader: 'sha256=invalido',
      rawBody: rawBodyInvalido
    });
  }, { code: 'WEBHOOK_SIGNATURE_INVALID' });

  // 3. Webhook válido da Evolution API com anexo de extrato PDF
  const payloadEvolution = {
    data: {
      key: { id: 'EVO_MSG_1001', remoteJid: '5585999991234@s.whatsapp.net' },
      message: {
        conversation: 'Segue o extrato bancário para conciliação',
        documentMessage: {
          mimetype: 'application/pdf',
          nomeArquivo: 'extrato_itau_novembro.pdf',
          tipo: 'pdf_texto',
          textoExtraido: '05/11/2026 PIX RECEBIDO CLIENTE 1500.00'
        }
      }
    }
  };
  const rawBodyValido = JSON.stringify(payloadEvolution);
  const signatureValida = crypto.createHmac('sha256', secret).update(rawBodyValido).digest('hex');

  const webhookRes = receberWebhookRealGatewayWhatsApp(state, payloadEvolution, {
    signatureHeader: `sha256=${signatureValida}`,
    rawBody: rawBodyValido
  });
  assert.equal(webhookRes.sucesso, true);
  assert.equal(webhookRes.externalMessageId, 'EVO_MSG_1001');
  assert.equal(webhookRes.extratoProcessado, true);

  // Uma mensagem de resposta outbound deve ter sido enfileirada automaticamente
  assert.ok(state.whatsappOutboundQueue.length > 0);
  assert.equal(state.whatsappOutboundQueue[0].telefoneDestino, '5585999991234');

  // 4. Trava Estrita de Idempotência: reenvio do mesmo webhook é ignorado
  const webhookDuplicado = receberWebhookRealGatewayWhatsApp(state, payloadEvolution, {
    signatureHeader: `sha256=${signatureValida}`,
    rawBody: rawBodyValido
  });
  assert.equal(webhookDuplicado.duplicateSkipped, true);
  assert.equal(webhookDuplicado.externalMessageId, 'EVO_MSG_1001');

  // 5. Teste de Fila Outbound com Retentativas e Dead Letter Queue (DLQ)
  enfileirarDisparoOutboundWhatsApp(state, {
    telefoneDestino: '5585988880000',
    mensagemTexto: 'Alerta de falha temporária',
    simularFalhaTemporaria: true
  });
  enfileirarDisparoOutboundWhatsApp(state, {
    telefoneDestino: '5585988887777',
    mensagemTexto: 'Mensagem enviada com sucesso',
    simularFalhaTemporaria: false
  });

  // Primeira tentativa
  const proc1 = processarFilaRetentativasOutboundWhatsApp(state);
  assert.ok(proc1.enviadosCount >= 1);
  assert.ok(proc1.aguardandoRetryCount >= 1);

  // Segunda tentativa (limite maxTentativasRetry = 2) -> move para Dead Letter
  const proc2 = processarFilaRetentativasOutboundWhatsApp(state);
  assert.ok(proc2.deadLetterCount >= 1);

  const itemDlq = state.whatsappOutboundQueue.find(i => i.telefoneDestino === '5585988880000');
  assert.equal(itemDlq.status, 'dead_letter_falha_permanente');
});

test('Sprint 10.5 — Task 3: [P3] Orquestrador do Ciclo Autônomo Diário 360º (Autopilot)', async (t) => {
  const state = criarEstadoMock();
  const hoje = '2026-11-12';

  state.borderos.push({
    id: 'bor_autopilot_01',
    clienteId: 'cli_transp_ceara',
    clienteNome: 'Transportadora Ceará Express',
    dataVencimento: '2026-11-01',
    status: 'fechado',
    saldoDevedor: 2000.00
  });

  enfileirarDisparoOutboundWhatsApp(state, {
    telefoneDestino: '5585988889999',
    mensagemTexto: 'Mensagem na fila antes do ciclo',
    simularFalhaTemporaria: false
  });

  const ciclo = executarCicloAutonomoDiarioAgenteWhatsApp(state, {
    dataReferencia: hoje,
    competencia: '2026-11'
  });

  assert.ok(ciclo.cicloId);
  assert.equal(ciclo.statusCiclo, 'concluido_100_porcento');
  assert.ok(ciclo.clientesCobradosCount >= 1);
  assert.ok(ciclo.mensagensGatewayProcessadasCount >= 1);
  assert.equal(state.autonomousCycleLogs.length, 1);
});

test('Sprint 10.5 — Task 4: [P4] Componentes de UI e Ações do Gateway e Cobrança', async (t) => {
  const uiModule = require('../js/modules/whatsapp_cobranca_gateway_ui');
  const actionsModule = require('../js/modules/whatsapp_cobranca_gateway_actions');

  const html = globalThis.renderPainelCobrancaGatewayAutonomoHtml({
    filaCobranca: [{ clienteId: 'cli_01', clienteNome: 'Cliente Teste', valorTotalExposicaoVencidaCliente: 1000, diasAtrasoMaximo: 7, estagio: 'bloqueio_credito_d_mais_5' }],
    acordos: [{ id: 'acordo_01', clienteNome: 'Cliente Teste', valorEntrada: 300, status: 'aguardando_pagamento_entrada' }],
    gatewayConfig: { provedor: 'evolution_api', baseUrl: 'http://localhost:8080' },
    filaOutbound: [{ telefoneDestino: '558599999999', mensagemTexto: 'Olá', status: 'enviado' }],
    ciclosLogs: [{ cicloId: 'c1', dataReferencia: '2026-11-12', statusCiclo: 'concluido_100_porcento' }]
  });

  assert.match(html, /Cobrança Ativa, Gateway WhatsApp Real & Ciclo Autônomo 360º/);
  assert.match(html, /data-act="disparar-regua-cobranca-lote"/);
  assert.match(html, /data-act="propor-acordo-renegociacao"/);
  assert.match(html, /data-act="liquidar-entrada-acordo-btn"/);
  assert.match(html, /data-act="executar-ciclo-autonomo-360"/);

  const modalAcordo = globalThis.modalFormalizarAcordoClienteHtml({ clienteId: 'cli_01', nome: 'Cliente Teste' });
  assert.match(modalAcordo, /modalFormalizarAcordoCliente/);

  const modalGw = globalThis.modalConfigurarGatewayWhatsAppHtml({ provedor: 'evolution_api' });
  assert.match(modalGw, /modalConfigurarGatewayWhatsApp/);

  assert.equal(typeof globalThis.dispararReguaCobrancaClientesAction, 'function');
  assert.equal(typeof globalThis.confirmarAcordoRenegociacaoAction, 'function');
  assert.equal(typeof globalThis.liquidarEntradaAcordoAction, 'function');
  assert.equal(typeof globalThis.executarCicloAutonomoDiarioAction, 'function');
});
