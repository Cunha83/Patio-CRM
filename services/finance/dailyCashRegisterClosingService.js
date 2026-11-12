'use strict';

/**
 * services/finance/dailyCashRegisterClosingService.js
 *
 * Motor de Fechamento de Caixa Diário e Auditoria de Divergências:
 * - Apuração de entradas por meio de pagamento (PIX, Boleto, Dinheiro, Cartão, Transferência)
 * - Apuração de saídas (contas a pagar baixadas no dia)
 * - Trava de auditoria: justificativa obrigatória para divergências
 * - Carimbo criptográfico imutável SHA-256 e prevenção de duplo fechamento
 *
 * Teto Modular: <= 270 linhas
 */

const crypto = require('crypto');

function gerarId(prefix) {
  return prefix + '_' + Date.now() + '_' + crypto.randomBytes(3).toString('hex');
}

function round2(num) {
  return +(Math.round(Number(num || 0) + 'e+2') + 'e-2');
}

function normalizarMeio(meio = '') {
  const m = String(meio || '').toUpperCase();
  if (/PIX/i.test(m)) return 'PIX';
  if (/BOL/i.test(m)) return 'BOLETO';
  if (/DINHEIR|ESP[EÉ]CIE/i.test(m)) return 'DINHEIRO';
  if (/CART[AÃ]O|CREDITO|DEBITO/i.test(m)) return 'CARTAO';
  return 'TRANSFERENCIA';
}

function extrairData(str) {
  if (!str) return '';
  return String(str).substring(0, 10);
}

function apurarPreviaFechamentoCaixaDiario(state, options = {}) {
  if (!state) throw new Error('Estado da aplicação não informado');
  const dataCaixa = options.dataCaixa || new Date().toISOString().substring(0, 10);
  const saldoInicial = round2(options.saldoInicialInformado || 0);

  const detalhamentoMeios = { PIX: 0, BOLETO: 0, TRANSFERENCIA: 0, CARTAO: 0, DINHEIRO: 0 };
  const itensEntradas = [];
  const idsOrigemProcessados = new Set();

  // 1. Cobranças recebidas (PIX / Boletos)
  const charges = Array.isArray(state.paymentCharges) ? state.paymentCharges : [];
  for (const chg of charges) {
    const dataRef = extrairData(chg.pagoEm || chg.liquidadoEm || chg.atualizadoEm);
    if (dataRef === dataCaixa && (chg.status === 'pago' || chg.status === 'liquidado')) {
      const v = round2(chg.valorPago || chg.valor);
      const meio = normalizarMeio(chg.meioPagamento);
      detalhamentoMeios[meio] = round2(detalhamentoMeios[meio] + v);
      itensEntradas.push({ origem: 'paymentCharges', id: chg.id, meio, valor: v });
      if (chg.borderoId) idsOrigemProcessados.add('bordero_' + chg.borderoId);
      if (chg.osId) idsOrigemProcessados.add('os_' + chg.osId);
    }
  }

  // 2. Liquidações diretas de Borderôs B2B
  const settlements = Array.isArray(state.borderoSettlements) ? state.borderoSettlements : [];
  for (const set of settlements) {
    const dataRef = extrairData(set.liquidadoEm || set.dataLiquidacao || set.criadoEm);
    if (dataRef === dataCaixa && !idsOrigemProcessados.has('settlement_' + set.id)) {
      if (set.borderoId && idsOrigemProcessados.has('bordero_' + set.borderoId)) continue;
      const v = round2(set.valorPago || set.valor);
      const meio = normalizarMeio(set.meioPagamento);
      detalhamentoMeios[meio] = round2(detalhamentoMeios[meio] + v);
      itensEntradas.push({ origem: 'borderoSettlements', id: set.id, meio, valor: v });
      idsOrigemProcessados.add('settlement_' + set.id);
    }
  }

  // 3. Contas a Receber quitadas diretamente
  const contas = Array.isArray(state.contas) ? state.contas : [];
  for (const c of contas) {
    if (c.tipo === 'receber' && c.status === 'pago') {
      const dataRef = extrairData(c.pagoEm || c.dataPagamento || c.liquidadoEm);
      if (dataRef === dataCaixa && !idsOrigemProcessados.has('conta_' + c.id)) {
        if (c.borderoId && idsOrigemProcessados.has('bordero_' + c.borderoId)) continue;
        const v = round2(c.valorPago || c.valor);
        const meio = normalizarMeio(c.formaPagamento || c.meioPagamento);
        detalhamentoMeios[meio] = round2(detalhamentoMeios[meio] + v);
        itensEntradas.push({ origem: 'contas', id: c.id, meio, valor: v });
        idsOrigemProcessados.add('conta_' + c.id);
      }
    }
  }

  // 4. Saídas: Contas a pagar quitadas no dia
  const itensSaidas = [];
  let totalSaidas = 0;
  for (const c of contas) {
    if (c.tipo === 'pagar' && c.status === 'pago') {
      const dataRef = extrairData(c.pagoEm || c.dataPagamento);
      if (dataRef === dataCaixa) {
        const v = round2(c.valorPago || c.valor);
        totalSaidas = round2(totalSaidas + v);
        itensSaidas.push({ id: c.id, descricao: c.descricao || 'Despesa Operacional', valor: v });
      }
    }
  }

  const totalEntradas = round2(Object.values(detalhamentoMeios).reduce((a, b) => a + b, 0));
  const saldoLiquidoDia = round2(totalEntradas - totalSaidas);
  const saldoFinalEsperado = round2(saldoInicial + saldoLiquidoDia);

  return {
    dataCaixa,
    saldoInicialInformado: saldoInicial,
    totalEntradasDia: totalEntradas,
    totalSaidasDia: totalSaidas,
    saldoLiquidoDia,
    saldoFinalEsperado,
    detalhamentoMeios,
    itensEntradas,
    itensSaidas
  };
}

function fecharCaixaDiarioComAuditoria(state, payload = {}) {
  if (!state) throw new Error('Estado da aplicação não informado');
  state.dailyCashClosings = Array.isArray(state.dailyCashClosings) ? state.dailyCashClosings : [];

  const dataCaixa = payload.dataCaixa || new Date().toISOString().substring(0, 10);
  const responsavel = payload.responsavel || 'Gerência Financeira';
  const timestamp = payload.timestamp || new Date().toISOString();

  const jaFechado = state.dailyCashClosings.find(c => c.dataCaixa === dataCaixa && c.status === 'fechado');
  if (jaFechado) {
    const err = new Error(`Caixa da data ${dataCaixa} já foi encerrado.`);
    err.code = 'CASH_REGISTER_ALREADY_CLOSED';
    err.status = 409;
    throw err;
  }

  const previa = apurarPreviaFechamentoCaixaDiario(state, {
    dataCaixa,
    saldoInicialInformado: payload.saldoInicialInformado
  });

  const confers = payload.valoresConferidosPorMeio;
  let totalConferidoFisico = previa.totalEntradasDia;
  let divergenciaValor = 0;

  if (confers && Object.keys(confers).length > 0) {
    totalConferidoFisico = round2(Object.values(confers).reduce((a, b) => a + Number(b || 0), 0));
    divergenciaValor = round2(totalConferidoFisico - previa.totalEntradasDia);
  }

  if (Math.abs(divergenciaValor) > 0.01 && !String(payload.justificativaDivergencia || '').trim()) {
    const err = new Error('Divergência detectada no fechamento de caixa sem justificativa formal.');
    err.code = 'CASH_DISCREPANCY_JUSTIFICATION_REQUIRED';
    err.status = 400;
    throw err;
  }

  const hashPayload = `${dataCaixa}|${previa.saldoFinalEsperado}|${divergenciaValor}|${responsavel}|${timestamp}`;
  const hashFechamentoCaixa = crypto.createHash('sha256').update(hashPayload).digest('hex');

  const registro = {
    id: gerarId('close'),
    tenantId: state.tenantId || 'default',
    dataCaixa,
    status: 'fechado',
    statusAuditoria: Math.abs(divergenciaValor) <= 0.01 ? 'fechado_conciliado_exato' : 'fechado_com_divergencia',
    saldoInicialInformado: previa.saldoInicialInformado,
    totalEntradasDia: previa.totalEntradasDia,
    totalSaidasDia: previa.totalSaidasDia,
    saldoLiquidoDia: previa.saldoLiquidoDia,
    saldoFinalEsperado: previa.saldoFinalEsperado,
    detalhamentoMeios: previa.detalhamentoMeios,
    valoresConferidosPorMeio: confers || previa.detalhamentoMeios,
    totalConferidoFisico,
    divergenciaValor,
    justificativaDivergencia: payload.justificativaDivergencia || null,
    hashFechamentoCaixa,
    responsavel,
    fechadoEm: timestamp
  };

  state.dailyCashClosings.unshift(registro);

  return { ok: true, registro };
}

function gerarRelatorioFechamentoCaixaWhatsApp(state, options = {}) {
  const dataCaixa = options.dataCaixa || new Date().toISOString().substring(0, 10);
  const fechamento = (state.dailyCashClosings || []).find(c => c.dataCaixa === dataCaixa && c.status === 'fechado')
    || apurarPreviaFechamentoCaixaDiario(state, options);

  let msg = `📊 *Boletim de Fechamento de Caixa — ${dataCaixa}*\n`;
  msg += `🏢 Pátio-CRM Gestão Financeira\n\n`;
  msg += `💵 Saldo Inicial: R$ ${(fechamento.saldoInicialInformado || 0).toFixed(2)}\n`;
  msg += `🟢 Entradas no Dia: R$ ${(fechamento.totalEntradasDia || 0).toFixed(2)}\n`;
  msg += `   • PIX: R$ ${(fechamento.detalhamentoMeios?.PIX || 0).toFixed(2)}\n`;
  msg += `   • Boleto: R$ ${(fechamento.detalhamentoMeios?.BOLETO || 0).toFixed(2)}\n`;
  msg += `   • Dinheiro: R$ ${(fechamento.detalhamentoMeios?.DINHEIRO || 0).toFixed(2)}\n`;
  msg += `🔴 Saídas no Dia: R$ ${(fechamento.totalSaidasDia || 0).toFixed(2)}\n`;
  msg += `📈 Saldo Líquido: R$ ${(fechamento.saldoLiquidoDia || 0).toFixed(2)}\n`;
  msg += `💰 *Saldo Final em Caixa: R$ ${(fechamento.saldoFinalEsperado || 0).toFixed(2)}*\n\n`;

  if (fechamento.hashFechamentoCaixa) {
    msg += `🔒 *Hash Criptográfico (SHA-256):*\n\`${fechamento.hashFechamentoCaixa.substring(0, 32)}...\`\n`;
    msg += `✅ Status: *${fechamento.statusAuditoria}*\n`;
  } else {
    msg += `⏳ *Status:* Prévia em Aberto (Aguardando Fechamento Formal)\n`;
  }

  state.whatsappAgentLogs = Array.isArray(state.whatsappAgentLogs) ? state.whatsappAgentLogs : [];
  state.whatsappAgentLogs.push({
    id: gerarId('log_caixa'),
    skill: 'SKILL_FECHAMENTO_CAIXA',
    dataCaixa,
    timestamp: new Date().toISOString()
  });

  return { ok: true, respostaTextoWhatsApp: msg, fechamento };
}

module.exports = {
  apurarPreviaFechamentoCaixaDiario,
  fecharCaixaDiarioComAuditoria,
  gerarRelatorioFechamentoCaixaWhatsApp
};

