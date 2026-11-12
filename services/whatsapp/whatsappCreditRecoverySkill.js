'use strict';

/**
 * services/whatsapp/whatsappCreditRecoverySkill.js
 *
 * Skill de Cobrança Ativa, Acordo de Dívida e Desbloqueio Condicional por Cliente.
 * Teto Modular: <= 250 linhas
 */

const crypto = require('crypto');
const round2 = n => Math.round((Number(n) || 0) * 100) / 100;
const gerarId = p => `${p}_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
const toYmd = d => (!d ? new Date().toISOString().slice(0, 10) : (d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10)));
const diffDias = (v, r) => Math.floor((new Date(toYmd(r) + 'T00:00:00Z') - new Date(toYmd(v) + 'T00:00:00Z')) / 86400000);

function extrairBorderosUnicos(state) {
  const lista = [...(state.borderosFrotistas || []), ...(state.borderos || []), ...(state.fleetBorderos || [])];
  const vistos = new Set(), res = [];
  for (const b of lista) {
    if (b?.id && !vistos.has(b.id)) { vistos.add(b.id); res.push(b); }
  }
  return res;
}

function apurarFilaReguaCobrancaPorCliente(state, { clienteId, dataReferencia } = {}) {
  if (!state) throw new Error('Estado da aplicação não informado');
  const refYmd = toYmd(dataReferencia);
  const mapa = new Map();

  const getCli = (cId, fallbackNome) => {
    if (!mapa.has(cId)) {
      const cObj = (state.clientes || []).find(c => c.id === cId) || {};
      mapa.set(cId, {
        clienteId: cId,
        clienteNome: cObj.nome || fallbackNome || cId,
        telefone: cObj.telefone || cObj.whatsapp || '5585999990000',
        itensVencidos: [],
        itensAVencer: [],
        valorTotalExposicaoVencidaCliente: 0,
        valorTotalExposicaoAbertaCliente: 0,
        diasAtrasoMaximo: 0,
        diasParaVencerMinimo: 9999,
        estagio: 'em_dia'
      });
    }
    return mapa.get(cId);
  };

  for (const b of extrairBorderosUnicos(state)) {
    if (['liquidado', 'cancelado', 'renegociado_acordo'].includes(b.status)) continue;
    const saldo = b.saldoDevedor !== undefined ? Number(b.saldoDevedor) : round2(Number(b.totais?.totalLiquido || b.valorTotal || 0) - Number(b.valorPagoAcumulado || 0));
    if (saldo <= 0.01 || !b.clienteId || (clienteId && b.clienteId !== clienteId)) continue;

    const reg = getCli(b.clienteId, b.clienteNome || b.frotistaNome);
    reg.valorTotalExposicaoAbertaCliente = round2(reg.valorTotalExposicaoAbertaCliente + saldo);
    const d = diffDias(b.dataVencimento, refYmd);
    if (d > 0) {
      reg.itensVencidos.push({ tipo: 'bordero', id: b.id, num: b.num, saldo, vencimento: b.dataVencimento, diasAtraso: d });
      reg.valorTotalExposicaoVencidaCliente = round2(reg.valorTotalExposicaoVencidaCliente + saldo);
      if (d > reg.diasAtrasoMaximo) reg.diasAtrasoMaximo = d;
    } else {
      const dpv = Math.abs(d);
      reg.itensAVencer.push({ tipo: 'bordero', id: b.id, num: b.num, saldo, vencimento: b.dataVencimento, diasParaVencer: dpv });
      if (dpv < reg.diasParaVencerMinimo) reg.diasParaVencerMinimo = dpv;
    }
  }

  for (const c of (state.contas || [])) {
    if (c.tipo !== 'receber' || ['pago', 'cancelado', 'renegociado_acordo'].includes(c.status)) continue;
    const v = round2(Number(c.valor || c.valorLiquido || 0));
    const cId = c.clienteId || c.cli;
    if (v <= 0.01 || !cId || (clienteId && cId !== clienteId)) continue;

    const reg = getCli(cId, c.clienteNome || c.cliente);
    reg.valorTotalExposicaoAbertaCliente = round2(reg.valorTotalExposicaoAbertaCliente + v);
    const d = diffDias(c.vencimento, refYmd);
    if (d > 0) {
      reg.itensVencidos.push({ tipo: 'conta', id: c.id, descricao: c.descricao, saldo: v, vencimento: c.vencimento, diasAtraso: d });
      reg.valorTotalExposicaoVencidaCliente = round2(reg.valorTotalExposicaoVencidaCliente + v);
      if (d > reg.diasAtrasoMaximo) reg.diasAtrasoMaximo = d;
    } else {
      const dpv = Math.abs(d);
      reg.itensAVencer.push({ tipo: 'conta', id: c.id, descricao: c.descricao, saldo: v, vencimento: c.vencimento, diasParaVencer: dpv });
      if (dpv < reg.diasParaVencerMinimo) reg.diasParaVencerMinimo = dpv;
    }
  }

  const fila = Array.from(mapa.values()).map(r => {
    if (r.diasAtrasoMaximo >= 15) r.estagio = 'acordo_renegociacao_d_mais_15';
    else if (r.diasAtrasoMaximo >= 5) r.estagio = 'bloqueio_credito_d_mais_5';
    else if (r.diasAtrasoMaximo >= 1) r.estagio = 'atraso_d_mais_1';
    else if (r.diasAtrasoMaximo <= 0 && r.diasParaVencerMinimo <= 2) r.estagio = 'preventivo_d_menos_2';
    else r.estagio = 'em_dia';
    return r;
  });

  return fila.sort((a, b) => b.diasAtrasoMaximo - a.diasAtrasoMaximo || b.valorTotalExposicaoVencidaCliente - a.valorTotalExposicaoVencidaCliente);
}

function dispararReguaCobrancaAtivaWhatsApp(state, {
  clienteId,
  estagiosIncluir = ['preventivo_d_menos_2', 'atraso_d_mais_1', 'bloqueio_credito_d_mais_5', 'acordo_renegociacao_d_mais_15'],
  responsavel = 'Agente-Cobranca-WhatsApp',
  timestamp
} = {}) {
  const fila = apurarFilaReguaCobrancaPorCliente(state, { clienteId, dataReferencia: timestamp });
  const disparos = [];
  state.creditCollectionLogs = Array.isArray(state.creditCollectionLogs) ? state.creditCollectionLogs : [];
  state.whatsappAgentLogs = Array.isArray(state.whatsappAgentLogs) ? state.whatsappAgentLogs : [];

  for (const c of fila) {
    if (!estagiosIncluir.includes(c.estagio)) continue;
    const totalVal = c.valorTotalExposicaoVencidaCliente || c.valorTotalExposicaoAbertaCliente;
    let msg = `Prezado(a) ${c.clienteNome}, consta pendência vencida há ${c.diasAtrasoMaximo} dia(s) (R$ ${totalVal.toFixed(2)}). Regularize para evitar bloqueios.`;
    if (c.estagio === 'preventivo_d_menos_2') msg = `Olá, ${c.clienteNome}. Títulos/borderôs a vencer em 2 dias (R$ ${totalVal.toFixed(2)}). Chave PIX disponível.`;
    else if (c.estagio === 'bloqueio_credito_d_mais_5') msg = `AVISO DE BLOQUEIO: ${c.clienteNome}, crédito suspenso por atraso de ${c.diasAtrasoMaximo} dias (R$ ${totalVal.toFixed(2)}).`;
    else if (c.estagio === 'acordo_renegociacao_d_mais_15') msg = `PROPOSTA DE ACORDO: ${c.clienteNome}, débito vencido há ${c.diasAtrasoMaximo} dias (R$ ${totalVal.toFixed(2)}). Entrada 30% e parcelamento.`;

    const log = {
      id: gerarId('cobranca_log'),
      clienteId: c.clienteId,
      clienteNome: c.clienteNome,
      telefone: c.telefone,
      estagio: c.estagio,
      diasAtraso: c.diasAtrasoMaximo,
      valorCobrado: totalVal,
      mensagem: msg,
      responsavel,
      disparadoEm: timestamp || new Date().toISOString()
    };
    state.creditCollectionLogs.push(log);
    state.whatsappAgentLogs.push({ ...log, skill: 'SKILL_RECUPERACAO_CREDITO', sucesso: true });
    disparos.push(log);
  }
  return { totalClientesCobrados: disparos.length, disparos };
}

function formalizarAcordoRenegociacaoDividaCliente(state, payload = {}) {
  if (!state) throw new Error('Estado da aplicação não informado');
  const { clienteId, clienteNome, percentualEntradaMinima = 30, valorEntradaAcordado, quantidadeParcelasRestantes = 3,
    descontoJurosMultaPercentual = 0, jurosAcordoPercentual = 2, primeiroVencimentoParcelas, responsavel = 'Agente-Cobranca-WhatsApp', timestamp } = payload;
  if (!clienteId) throw new Error('clienteId é obrigatório para formalizar acordo');

  state.debtSettlementAgreements = state.debtSettlementAgreements || [];
  state.paymentCharges = state.paymentCharges || [];

  const fila = apurarFilaReguaCobrancaPorCliente(state, { clienteId, dataReferencia: timestamp });
  const dadosCli = fila.find(f => f.clienteId === clienteId);
  const dividaOrig = dadosCli ? dadosCli.valorTotalExposicaoVencidaCliente : 0;
  if (dividaOrig <= 0.01) {
    const err = new Error('Cliente não possui dívida vencida para renegociação');
    err.status = 400; err.code = 'NO_OVERDUE_DEBT_FOR_CLIENT'; throw err;
  }

  const desc = round2(dividaOrig * (Number(descontoJurosMultaPercentual || 0) / 100));
  const juros = round2((dividaOrig - desc) * (Number(jurosAcordoPercentual || 0) / 100));
  const valorTotalAcordo = round2(dividaOrig - desc + juros);
  const valorEntrada = valorEntradaAcordado !== undefined ? Number(valorEntradaAcordado) : round2(valorTotalAcordo * (Number(percentualEntradaMinima) / 100));
  const qtdParc = Math.max(1, Number(quantidadeParcelasRestantes || 1));
  const valorParcela = round2((valorTotalAcordo - valorEntrada) / qtdParc);

  const cobrancaEntradaId = gerarId('chg_acordo_entrada');
  state.paymentCharges.push({
    id: cobrancaEntradaId,
    clienteId,
    valor: valorEntrada,
    tipo: 'pix_boleto',
    status: 'pendente',
    pixCopiaECola: `00020126580014br.gov.bcb.pix0136entrada-${clienteId}520400005303986540${valorEntrada.toFixed(2)}5802BR5915OFICINA PATIO CRM6009FORTALEZA62070503***6304ABCD`,
    criadoEm: timestamp || new Date().toISOString()
  });

  const acordo = {
    id: gerarId('acordo'),
    clienteId,
    clienteNome: clienteNome || dadosCli.clienteNome,
    valorTotalDividaOriginal: dividaOrig,
    valorTotalAcordo,
    valorEntrada,
    quantidadeParcelasRestantes: qtdParc,
    valorParcela,
    primeiroVencimentoParcelas: primeiroVencimentoParcelas || new Date(Date.now() + 2592000000).toISOString().slice(0, 10),
    borderosOriginaisIds: dadosCli.itensVencidos.filter(i => i.tipo === 'bordero').map(i => i.id),
    contasOriginaisIds: dadosCli.itensVencidos.filter(i => i.tipo === 'conta').map(i => i.id),
    cobrancaEntradaId,
    status: 'aguardando_pagamento_entrada',
    creditoClienteDesbloqueado: false,
    responsavel,
    criadoEm: timestamp || new Date().toISOString()
  };
  state.debtSettlementAgreements.push(acordo);
  return { acordo, pixCopiaEColaEntrada: state.paymentCharges.find(p => p.id === cobrancaEntradaId)?.pixCopiaECola };
}

function liquidarEntradaAcordoEDesbloquearCreditoCliente(state, acordoId, { valorPagoEntrada, meioPagamento = 'PIX', idTransacaoBanco, timestamp } = {}) {
  if (!state) throw new Error('Estado da aplicação não informado');
  state.debtSettlementAgreements = state.debtSettlementAgreements || [];
  state.contas = state.contas || [];

  const acordo = state.debtSettlementAgreements.find(a => a.id === acordoId);
  if (!acordo) {
    const err = new Error('Termo de acordo não encontrado');
    err.status = 404; err.code = 'AGREEMENT_NOT_FOUND'; throw err;
  }
  if (acordo.status === 'ativo_em_dia') {
    const err = new Error('Acordo já está ativo e com crédito desbloqueado');
    err.status = 409; err.code = 'AGREEMENT_ALREADY_ACTIVE'; throw err;
  }
  const vPago = Number(valorPagoEntrada);
  if (vPago < round2(acordo.valorEntrada - 0.05)) {
    const err = new Error(`Valor pago insuficiente (esperado R$ ${acordo.valorEntrada.toFixed(2)}, recebido R$ ${vPago.toFixed(2)})`);
    err.status = 400; err.code = 'INSUFFICIENT_DOWN_PAYMENT'; throw err;
  }

  for (const b of extrairBorderosUnicos(state)) {
    if (acordo.borderosOriginaisIds?.includes(b.id)) {
      b.status = 'renegociado_acordo';
      b.saldoDevedor = 0;
      b.valorRenegociadoEmAcordoId = acordo.id;
    }
  }
  for (const c of state.contas) {
    if (acordo.contasOriginaisIds?.includes(c.id)) {
      c.status = 'renegociado_acordo';
    }
  }

  const parcelasCriadas = [];
  const dtBase = new Date(acordo.primeiroVencimentoParcelas + 'T00:00:00Z').getTime();
  for (let i = 0; i < acordo.quantidadeParcelasRestantes; i++) {
    const vcto = new Date(dtBase + i * 2592000000).toISOString().slice(0, 10);
    const pConta = {
      id: gerarId('cta_parc_acordo'),
      tipo: 'receber',
      clienteId: acordo.clienteId,
      clienteNome: acordo.clienteNome,
      descricao: `Acordo ${acordo.id} - Parcela ${i + 1}/${acordo.quantidadeParcelasRestantes}`,
      valor: acordo.valorParcela,
      vencimento: vcto,
      status: 'pendente',
      acordoId: acordo.id,
      criadoEm: timestamp || new Date().toISOString()
    };
    state.contas.push(pConta);
    parcelasCriadas.push(pConta);
  }

  const chg = (state.paymentCharges || []).find(p => p.id === acordo.cobrancaEntradaId);
  if (chg) {
    chg.status = 'paga';
    chg.meioPagamento = meioPagamento;
    chg.idTransacaoBanco = idTransacaoBanco;
    chg.pagoEm = timestamp || new Date().toISOString();
  }

  acordo.status = 'ativo_em_dia';
  acordo.creditoClienteDesbloqueado = true;
  acordo.liquidadoEntradaEm = timestamp || new Date().toISOString();
  return { sucesso: true, acordoId: acordo.id, clienteId: acordo.clienteId, creditoClienteDesbloqueado: true, parcelasCriadas };
}

function executarSkillRecuperacaoCreditoWhatsApp(state, payload = {}) {
  const msg = String(payload.mensagem || '').toLowerCase();
  if (/proposta|termo|formaliz|novo acordo/i.test(msg)) return formalizarAcordoRenegociacaoDividaCliente(state, payload);
  if (/liquidar entrada|pagar entrada|pagamento entrada/i.test(msg)) return liquidarEntradaAcordoEDesbloquearCreditoCliente(state, payload.acordoId, payload);
  return dispararReguaCobrancaAtivaWhatsApp(state, payload);
}

module.exports = {
  apurarFilaReguaCobrancaPorCliente,
  dispararReguaCobrancaAtivaWhatsApp,
  formalizarAcordoRenegociacaoDividaCliente,
  liquidarEntradaAcordoEDesbloquearCreditoCliente,
  executarSkillRecuperacaoCreditoWhatsApp
};
