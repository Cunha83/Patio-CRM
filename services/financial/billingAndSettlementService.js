'use strict';

const financialEngine = require('../financialEngine');
const {
  arredondar,
  hojeISO,
  normalizarFormaPagamento,
  projetarMovimentacao
} = require('./financialHelpers');

/**
 * Obtém a conciliação financeira de uma Ordem de Serviço (OS), calculando entradas, saídas, saldo e histórico
 */
function obterResumoFinanceiroOS(stateOrOsId, osIdOrOptions, optionsArg) {
  let state = {};
  let osId = null;
  let options = {};

  if (typeof stateOrOsId === 'object' && stateOrOsId !== null && !('osId' in stateOrOsId) && ('movimentos' in stateOrOsId || 'caixas' in stateOrOsId || 'contas' in stateOrOsId)) {
    state = stateOrOsId;
    osId = osIdOrOptions;
    options = optionsArg || {};
  } else if (typeof stateOrOsId === 'string' || typeof stateOrOsId === 'number') {
    osId = stateOrOsId;
    if (typeof osIdOrOptions === 'object' && osIdOrOptions !== null) {
      if ('movimentos' in osIdOrOptions || 'caixas' in osIdOrOptions || 'contas' in osIdOrOptions) {
        state = osIdOrOptions;
        options = optionsArg || {};
      } else {
        options = osIdOrOptions;
      }
    }
  } else if (typeof stateOrOsId === 'object' && stateOrOsId !== null) {
    state = stateOrOsId;
    osId = osIdOrOptions;
    options = optionsArg || {};
  }

  const osNorm = String(osId || '').replace(/^#/, '').trim();
  const todosMovs = Array.isArray(state.movimentos) ? state.movimentos : [];

  const movsOS = todosMovs.filter(m => {
    if (!m.osId) return false;
    const mOs = String(m.osId).replace(/^#/, '').trim();
    return mOs === osNorm;
  });

  let totalEntradasOS = 0;
  let totalSaidasOS = 0;
  let qtdLancamentos = 0;
  const placasSet = new Set();
  const resumoMeiosPagamento = {};

  for (const m of movsOS) {
    if (m.placa) {
      placasSet.add(String(m.placa).toUpperCase().trim());
    }

    const isEstornado = Boolean(m.estornado);
    const isCompensatorio = Boolean(m.estornoDeId || m.subtipo === 'estorno');

    if (!isEstornado && !isCompensatorio) {
      qtdLancamentos++;
      const val = Number(m.valor) || 0;
      const isEnt = m.tipo === 'entrada' || m.tipo === 'receita';
      if (isEnt) {
        totalEntradasOS = arredondar(totalEntradasOS + val);
      } else {
        totalSaidasOS = arredondar(totalSaidasOS + val);
      }

      const forma = normalizarFormaPagamento(m.forma || m.formaPagamento);
      if (!resumoMeiosPagamento[forma]) {
        resumoMeiosPagamento[forma] = { total: 0, qtd: 0 };
      }
      resumoMeiosPagamento[forma].qtd++;
      resumoMeiosPagamento[forma].total = arredondar(resumoMeiosPagamento[forma].total + val);
    }
  }

  const saldoLiquidoOS = arredondar(totalEntradasOS - totalSaidasOS);
  const historico = movsOS.map(projetarMovimentacao);

  const osList = Array.isArray(state.os) ? state.os : [];
  const dadosOS = osList.find(o => {
    const id = String(o.id || '').replace(/^#/, '').trim();
    const num = String(o.num || o.numero || '').replace(/^#/, '').trim();
    return id === osNorm || num === osNorm;
  });
  if (dadosOS && dadosOS.placa) {
    placasSet.add(String(dadosOS.placa).toUpperCase().trim());
  }

  const totalOrcado = Number(
    (dadosOS && (dadosOS.total || dadosOS.valorTotal || dadosOS.totalGeral)) ||
    options.totalOrcado ||
    options.valorTotal ||
    options.totalGeral ||
    totalEntradasOS
  );

  const totalPago = totalEntradasOS;
  const saldoRestante = arredondar(Math.max(0, totalOrcado - totalPago));
  const quitada = totalOrcado > 0 ? (totalPago >= totalOrcado) : (totalEntradasOS > 0);

  const contas = Array.isArray(state.contas) ? state.contas : [];
  const titulosVinculados = contas.filter(c => {
    if (!c.osId) return false;
    return String(c.osId).replace(/^#/, '').trim() === osNorm;
  });

  const totalFaturadoPrazo = arredondar(
    titulosVinculados
      .filter(c => c.tipo === 'receber' && !c.pago)
      .reduce((acc, c) => acc + (Number(c.valor) || 0), 0)
  );

  let statusLiberacaoPatio = 'retido_pendente';
  if (dadosOS && dadosOS.isRetornoGarantia && (dadosOS.isentoGarantia || saldoRestante <= 0)) {
    statusLiberacaoPatio = 'liberado_garantia';
  } else if (quitada || saldoRestante <= 0) {
    statusLiberacaoPatio = 'liberado_quitado';
  } else if (totalFaturadoPrazo >= saldoRestante && saldoRestante > 0) {
    statusLiberacaoPatio = 'liberado_faturado';
  } else if (dadosOS && dadosOS.liberacaoExcepcional) {
    statusLiberacaoPatio = 'liberado_excepcional';
  } else {
    statusLiberacaoPatio = 'retido_pendente';
  }

  const clientesList = Array.isArray(state.clientes) ? state.clientes : [];
  const cliObj = dadosOS && clientesList.find(c => c && (c.id === dadosOS.cli || c.nome === dadosOS.cliente));
  const resolvedCliente = (cliObj && (cliObj.fantasia || cliObj.nome)) || (dadosOS && (dadosOS.cliente || dadosOS.clienteNome)) || options.cliente || '';

  return {
    osId: osNorm,
    cliente: resolvedCliente,
    totalOrcado,
    totalPago,
    saldoRestante,
    quitada,
    totalFaturadoPrazo,
    statusLiberacaoPatio,
    liberacaoExcepcional: (dadosOS && dadosOS.liberacaoExcepcional) || null,
    titulosVinculados,
    totalEntradasOS,
    totalSaidasOS,
    saldoLiquidoOS,
    qtdLancamentos,
    placasVinculadas: Array.from(placasSet),
    historico,
    resumoMeiosPagamento
  };
}

/**
 * Fatura a prazo o saldo devedor restante de uma Ordem de Serviço (OS), gerando título(s) a receber
 */
function faturarSaldoOS(state, payload = {}) {
  const osId = payload.osId;
  if (!osId) {
    return { ok: false, status: 400, code: 'OS_ID_OBRIGATORIO', error: 'O identificador da OS (osId) é obrigatório.' };
  }

  const osNorm = String(osId).replace(/^#/, '').trim();
  const resumoOS = obterResumoFinanceiroOS(state, osNorm, payload);

  if (resumoOS.quitada || resumoOS.saldoRestante <= 0 || resumoOS.statusLiberacaoPatio === 'liberado_faturado') {
    return {
      ok: false,
      status: 409,
      code: 'OS_JA_QUITADA_OU_FATURADA',
      error: 'Ordem de serviço já quitada ou integralmente faturada a prazo.'
    };
  }

  const saldoNaoFaturado = arredondar(resumoOS.saldoRestante - (resumoOS.totalFaturadoPrazo || 0));
  if (saldoNaoFaturado <= 0) {
    return {
      ok: false,
      status: 409,
      code: 'OS_JA_QUITADA_OU_FATURADA',
      error: 'O saldo restante desta OS já foi integralmente faturado a prazo.'
    };
  }

  const valorTotalFaturar = Number(payload.valorFaturar || payload.valor || saldoNaoFaturado);
  if (valorTotalFaturar <= 0) {
    return { ok: false, status: 400, code: 'VALOR_INVALIDO', error: 'Valor a faturar inválido.' };
  }

  if (valorTotalFaturar > saldoNaoFaturado) {
    return {
      ok: false,
      status: 400,
      code: 'VALOR_EXCEDE_SALDO',
      error: `Valor a faturar (R$ ${valorTotalFaturar.toFixed(2)}) excede o saldo pendente (R$ ${saldoNaoFaturado.toFixed(2)}).`
    };
  }

  const parcelas = Math.max(1, parseInt(payload.parcelas, 10) || 1);
  const meioPagamento = String(payload.meioPagamento || payload.forma || 'boleto').toLowerCase().trim();
  const dataHoje = hojeISO();
  const vencimentoBase = payload.vencimento || financialEngine.addDias(dataHoje, 30);
  const operador = payload.operador || payload.actorId || 'operador';
  const obs = payload.observacao || payload.obs || payload.descricao || '';
  const placa = (resumoOS.placasVinculadas && resumoOS.placasVinculadas[0]) || payload.placa || '';
  const parte = payload.cliente || payload.parte || resumoOS.cliente || `Cliente OS #${osNorm}`;

  if (!Array.isArray(state.contas)) {
    state.contas = [];
  }

  const valorBaseParcela = Math.floor((valorTotalFaturar / parcelas) * 100) / 100;
  let somaParcelas = 0;
  const titulosGerados = [];

  for (let i = 1; i <= parcelas; i++) {
    const valorParcela = (i === parcelas)
      ? arredondar(valorTotalFaturar - somaParcelas)
      : valorBaseParcela;
    somaParcelas = arredondar(somaParcelas + valorParcela);

    const vencimentoParcela = (i === 1)
      ? vencimentoBase
      : financialEngine.addDias(vencimentoBase, (i - 1) * 30);

    const tituloId = `tit_${Date.now()}_${osNorm}_${i}_${Math.random().toString(36).slice(2, 6)}`;
    const descricaoTitulo = parcelas > 1
      ? `Faturamento OS #${osNorm} - Parcela ${i}/${parcelas}${obs ? ` (${obs})` : ''}`
      : `Faturamento OS #${osNorm}${obs ? ` (${obs})` : ''}`;

    const novoTitulo = {
      id: tituloId,
      tipo: 'receber',
      osId: osNorm,
      placa: placa ? String(placa).toUpperCase().trim() : '',
      parte,
      desc: descricaoTitulo,
      valor: valorParcela,
      venc: vencimentoParcela,
      forma: meioPagamento,
      formaPagamento: meioPagamento,
      pago: false,
      status: 'pendente',
      parcela: i,
      totalParcelas: parcelas,
      criadoEm: new Date().toISOString(),
      faturadoPor: operador,
      origem: payload.origem || 'sistema'
    };

    state.contas.push(novoTitulo);
    titulosGerados.push(novoTitulo);
  }

  const resumoAtualizado = obterResumoFinanceiroOS(state, osNorm, payload);

  return {
    ok: true,
    sucesso: true,
    mensagem: `Faturamento a prazo da OS #${osNorm} concluído em ${parcelas}x no ${meioPagamento.toUpperCase()}.`,
    osId: osNorm,
    valorFaturado: valorTotalFaturar,
    parcelas,
    titulos: titulosGerados,
    resumoOS: resumoAtualizado
  };
}

module.exports = {
  obterResumoFinanceiroOS,
  faturarSaldoOS
};
