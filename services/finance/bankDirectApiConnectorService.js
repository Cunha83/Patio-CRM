'use strict';

/**
 * services/finance/bankDirectApiConnectorService.js
 *
 * Conector Direto de API Bancária & Webhook de Liquidação Instantânea:
 * - Configuração de Credenciais com Mascaramento de Segredos Sensíveis
 * - Sincronização Direta de Extrato e Conciliação via API (Open Finance / Inter / Sicoob)
 * - Processamento de Webhook de Liquidação PIX e Boleto em Tempo Real
 *
 * Teto Modular: <= 260 linhas
 */

const crypto = require('crypto');
const bankStatementReconciliationService = require('./bankStatementReconciliationService');
const fleetBorderoSettlementService = require('../billing/fleetBorderoSettlementService');

function gerarId(prefix) {
  return prefix + '_' + Date.now() + '_' + crypto.randomBytes(3).toString('hex');
}

function criarErro(code, message, status = 400) {
  const err = new Error(message);
  err.code = code;
  err.status = status;
  return err;
}

function garantirColecoes(state) {
  state.bankApiConnections = Array.isArray(state.bankApiConnections) ? state.bankApiConnections : [];
  state.paymentCharges = Array.isArray(state.paymentCharges) ? state.paymentCharges : [];
  state.whatsappAgentLogs = Array.isArray(state.whatsappAgentLogs) ? state.whatsappAgentLogs : [];
  state.borderos = Array.isArray(state.borderos) ? state.borderos : [];
  state.borderosFrotistas = Array.isArray(state.borderosFrotistas) ? state.borderosFrotistas : [];
  state.os = Array.isArray(state.os) ? state.os : [];
  state.contas = Array.isArray(state.contas) ? state.contas : [];
}

function sanitizarConexao(con) {
  const c = { ...con };
  delete c.clientSecret;
  delete c.webhookSecret;
  return c;
}

function configurarCredenciaisApiBanco(state, payload = {}) {
  garantirColecoes(state);
  const { codigoBanco = '756', nomeBanco = 'Sicoob / Inter API', clientId } = payload;
  if (!clientId) throw criarErro('CLIENT_ID_REQUIRED', 'Client ID da API bancária é obrigatório.', 400);

  const agora = payload.timestamp || new Date().toISOString();
  const conexao = {
    id: gerarId('bapi'),
    codigoBanco: String(codigoBanco),
    nomeBanco: String(nomeBanco),
    clientId: String(clientId),
    clientSecret: payload.clientSecret || null,
    certificadoMtlsAtivo: payload.certificadoMtlsAtivo !== false,
    webhookSecret: payload.webhookSecret || null,
    chavePixPadrao: payload.chavePixPadrao || 'financeiro@automolasfort.com.br',
    contaCorrente: payload.contaCorrente || null,
    ambiente: payload.ambiente || 'producao',
    status: 'ativa',
    criadoEm: agora,
    ultimaSincronizacaoEm: null
  };

  state.bankApiConnections.push(conexao);
  return { ok: true, conexao: sanitizarConexao(conexao) };
}

function sincronizarExtratoDiretoApiBanco(state, options = {}) {
  garantirColecoes(state);
  const { conexaoId, transacoesRetornadasApi = [], responsavel = 'API-Banco-Direta', timestamp } = options;
  const agora = timestamp || new Date().toISOString();

  const conexao = state.bankApiConnections.find(c => c.id === conexaoId);
  if (!conexao) {
    throw criarErro('BANK_API_CONNECTION_NOT_FOUND', `Conexão bancária "${conexaoId}" não encontrada.`, 404);
  }

  const transacoesNormalizadas = transacoesRetornadasApi.map((t, idx) => ({
    idTransacaoBanco: t.idTransacaoBanco || `tx_api_${idx}_${Date.now()}`,
    data: t.data || agora.slice(0, 10),
    tipo: t.tipo || (Number(t.valor) >= 0 ? 'CREDITO' : 'DEBITO'),
    valor: Math.abs(Number(t.valor || 0)),
    descricao: t.descricao || 'Transação API Bancária',
    documentoRef: t.documentoRef || null
  }));

  const resConciliacao = bankStatementReconciliationService.conciliarExtratoBancarioAutomatico(state, {
    formato: 'api_json',
    lancamentos: transacoesNormalizadas,
    origemCanal: 'conexao_direta_api_banco',
    responsavel,
    timestamp: agora
  });

  conexao.ultimaSincronizacaoEm = agora;

  // Baixa cobranças em paymentCharges correspondentes aos borderôs quitados
  const borderosTodos = [...(state.borderosFrotistas || []), ...(state.borderos || [])];
  for (const bId of resConciliacao.borderosLiquidadosIds) {
    const b = borderosTodos.find(item => item.id === bId);
    if (b) {
      b.status = 'liquidado';
      b.saldoDevedor = 0;
      for (const osId of (b.osIds || [])) {
        const os = (state.os || []).find(o => o.id === osId);
        if (os && os.comissaoMecanico) os.comissaoMecanico.statusComissao = 'os_recebida';
      }
    }
    for (const chg of state.paymentCharges) {
      if (chg.borderoId === bId && chg.status === 'ativa') chg.status = 'liquidada';
    }
  }

  state.whatsappAgentLogs.push({
    id: gerarId('wpp_log'),
    tipo: 'sincronizacao_api_banco',
    conexaoId,
    banco: conexao.nomeBanco,
    transacoesBaixadas: resConciliacao.conciliadasAutomaticamenteCount,
    timestamp: agora
  });

  return { ok: true, conciliacao: resConciliacao, conexao: sanitizarConexao(conexao) };
}

function processarWebhookLiquidacaoInstantaneaPixBoleto(state, payload = {}) {
  garantirColecoes(state);
  const { txid, nossoNumero, valorPago, dataPagamento, idTransacaoBanco, timestamp } = payload;
  const agora = timestamp || new Date().toISOString();

  let cobranca = null;
  if (txid) {
    cobranca = state.paymentCharges.find(c => c.txid === txid);
  }
  if (!cobranca && nossoNumero) {
    cobranca = state.paymentCharges.find(c => c.nossoNumero === nossoNumero);
  }

  const borderoId = payload.borderoId || cobranca?.borderoId;
  const osId = payload.osId || cobranca?.osId;
  const valEfetivo = Number(valorPago || cobranca?.valorCobrar || 0);

  let borderoQuitado = null;
  if (borderoId) {
    const borderos = [...state.borderosFrotistas, ...state.borderos];
    const b = borderos.find(item => item.id === borderoId || String(item.num) === String(borderoId));
    if (b) {
      fleetBorderoSettlementService.liquidarBorderoB2B(state, b.id, {
        valorRecebido: valEfetivo,
        formaPagamento: 'webhook_pix_instantaneo',
        dataLiquidacao: dataPagamento || agora,
        responsavel: 'Webhook-Liquidacao-Banco'
      });
      b.status = 'liquidado';
      b.saldoDevedor = 0;
      for (const osId of (b.osIds || [])) {
        const os = (state.os || []).find(o => o.id === osId);
        if (os && os.comissaoMecanico) os.comissaoMecanico.statusComissao = 'os_recebida';
      }
      borderoQuitado = b;
    }
  }

  if (osId) {
    const os = state.os.find(o => o.id === osId || String(o.num) === String(osId));
    if (os) {
      os.pago = true;
      os.statusPagamento = 'pago';
      if (os.comissaoMecanico) os.comissaoMecanico.statusComissao = 'os_recebida';
    }
  }

  if (cobranca) {
    cobranca.status = 'liquidada_webhook';
    cobranca.valorPago = valEfetivo;
    cobranca.liquidadoEm = agora;
    cobranca.idTransacaoBanco = idTransacaoBanco || null;
  }

  state.whatsappAgentLogs.push({
    id: gerarId('wpp_log'),
    tipo: 'webhook_liquidacao_instantanea',
    txid: txid || cobranca?.txid,
    valorPago: valEfetivo,
    borderoId: borderoQuitado?.id || borderoId,
    timestamp: agora
  });

  return {
    ok: true,
    cobranca: cobranca || null,
    bordero: borderoQuitado || null,
    mensagem: 'Liquidação instantânea via webhook processada com sucesso.'
  };
}

module.exports = {
  configurarCredenciaisApiBanco,
  sincronizarExtratoDiretoApiBanco,
  processarWebhookLiquidacaoInstantaneaPixBoleto
};
