'use strict';

const financialEngine = require('../financialEngine');
const {
  gerarId,
  arredondar,
  normalizarFormaPagamento,
  normalizarTipoMovimentacao,
  obterCaixaAberto
} = require('./financialHelpers');
const { formatarBoletimFechamentoWhatsapp } = require('./cashRegisterBoletimService');

/**
 * Abre um novo turno de caixa diário
 */
function abrirCaixa(state = {}, payload = {}) {
  const tenantId = payload.tenantId || state.tenantId || 'default';
  if (!Array.isArray(state.caixas)) state.caixas = [];

  const caixaAbertoExistente = obterCaixaAberto(state, tenantId);
  if (caixaAbertoExistente) {
    return {
      ok: false,
      code: 'CAIXA_JA_ABERTO',
      error: `Já existe um caixa aberto no momento (#${caixaAbertoExistente.id} aberto por ${caixaAbertoExistente.abertoPorNome || caixaAbertoExistente.abertoPor}). Feche o caixa atual antes de iniciar um novo turno.`,
      caixa: caixaAbertoExistente
    };
  }

  const saldoInicial = arredondar(payload.saldoInicial !== undefined ? payload.saldoInicial : (payload.valor || 0));
  if (saldoInicial < 0) {
    return { ok: false, error: 'O saldo inicial de abertura não pode ser negativo.' };
  }

  const agoraInfo = financialEngine.obterAgoraSP();
  const novoCaixa = {
    id: gerarId('cx'),
    tenantId,
    status: 'aberto',
    aberto: true,
    abertoEm: agoraInfo.dataObj.toISOString(),
    dataAbertura: agoraInfo.dataISO,
    horaAbertura: agoraInfo.horaBR,
    abertoPor: String(payload.operador || payload.actorId || 'operador'),
    abertoPorNome: String(payload.operadorNome || payload.fullName || 'Operador do Caixa'),
    saldoInicial,
    saldoAtual: saldoInicial,
    totalEntradas: 0,
    totalSaidas: 0,
    totalMovimentacoes: 0,
    movimentacoesIds: [],
    observacoes: String(payload.observacoes || '').trim(),
    origem: payload.origem || 'sistema',
    canal: payload.canal || (payload.origem === 'whatsapp' ? 'whatsapp' : 'web'),
    autorNumero: payload.autorNumero || null,
    confirmadoEm: payload.confirmadoEm || null,
    fechamento: null
  };

  state.caixas.unshift(novoCaixa);

  if (saldoInicial > 0 && payload.registrarSuprimentoAbertura) {
    registrarMovimentacao(state, {
      tenantId,
      tipo: 'suprimento',
      valor: saldoInicial,
      categoria: 'Suprimento de Abertura',
      descricao: `Fundo de troco inicial - Caixa #${novoCaixa.id}`,
      formaPagamento: 'dinheiro',
      operador: novoCaixa.abertoPor
    });
  }

  return {
    ok: true,
    caixa: novoCaixa,
    mensagem: `Caixa aberto com sucesso! Saldo inicial em caixa: ${financialEngine.formatarMoeda(saldoInicial)}.`
  };
}

/**
 * Registra movimentação de entrada/saída (receita, despesa, sangria, suprimento)
 */
function registrarMovimentacao(state = {}, payload = {}) {
  const tenantId = payload.tenantId || state.tenantId || 'default';
  if (!Array.isArray(state.movimentos)) state.movimentos = [];

  const valor = arredondar(payload.valor);
  if (isNaN(valor) || valor <= 0) {
    return { ok: false, error: 'O valor da movimentação financeira deve ser maior que zero.' };
  }

  const tipoNorm = normalizarTipoMovimentacao(payload.tipo || payload.subtipo || payload.naturezaOperacao);
  const subtipo = payload.subtipo || payload.naturezaOperacao || tipoNorm.subtipo;
  const tipoBase = (subtipo === 'sangria' ? 'saida' : (subtipo === 'suprimento' ? 'entrada' : tipoNorm.tipoBase));
  const formaPagamento = normalizarFormaPagamento(payload.formaPagamento || payload.forma);
  const agoraInfo = financialEngine.obterAgoraSP();

  const caixaAberto = obterCaixaAberto(state, tenantId);
  if (!caixaAberto && !payload.permitirSemCaixa) {
    return {
      ok: false,
      code: 'CAIXA_FECHADO',
      error: 'Não há nenhum turno de caixa aberto no momento. Abra o caixa antes de lançar movimentações.'
    };
  }

  let naturezaOperacao = payload.naturezaOperacao;
  if (!naturezaOperacao) {
    if (subtipo === 'sangria') naturezaOperacao = 'sangria';
    else if (subtipo === 'suprimento') naturezaOperacao = 'suprimento';
    else if (subtipo === 'estorno' || payload.estornoDeId) naturezaOperacao = 'estorno';
    else naturezaOperacao = 'operacional';
  }

  if ((subtipo === 'sangria' || naturezaOperacao === 'sangria') && caixaAberto && formaPagamento === 'dinheiro') {
    if (valor > caixaAberto.saldoAtual) {
      return {
        ok: false,
        error: `Sangria recusada: valor solicitado (${financialEngine.formatarMoeda(valor)}) excede o saldo em dinheiro disponível no caixa (${financialEngine.formatarMoeda(caixaAberto.saldoAtual)}).`
      };
    }
  }

  const idMov = gerarId('mov');
  const descricao = String(payload.descricao || payload.desc || `${subtipo.toUpperCase()} avulsa`).trim();
  const categoria = String(payload.categoria || payload.cat || (subtipo === 'sangria' ? 'Sangria de Caixa' : (subtipo === 'suprimento' ? 'Suprimento de Caixa' : (tipoBase === 'entrada' ? 'Receita Diversa' : 'Despesa Operacional')))).trim();

  const novaMov = {
    id: idMov,
    tenantId,
    caixaId: caixaAberto ? caixaAberto.id : null,
    tipo: tipoBase,
    subtipo,
    naturezaOperacao,
    valor,
    cat: categoria,
    categoria,
    forma: formaPagamento,
    formaPagamento,
    desc: descricao,
    descricao,
    data: payload.data || agoraInfo.dataISO,
    dataHora: agoraInfo.dataObj.toISOString(),
    osId: payload.osId || null,
    placa: payload.placa || null,
    tituloId: payload.tituloId || null,
    clienteId: payload.clienteId || null,
    fornecedorId: payload.fornecedorId || null,
    operador: String(payload.operador || payload.actorId || 'operador'),
    origem: payload.origem || 'sistema',
    canal: payload.canal || (payload.origem === 'whatsapp' ? 'whatsapp' : 'web'),
    autorNumero: payload.autorNumero || null,
    confirmadoEm: payload.confirmadoEm || null,
    criadoEm: agoraInfo.dataObj.toISOString()
  };

  state.movimentos.unshift(novaMov);

  if (caixaAberto) {
    if (tipoBase === 'entrada') {
      caixaAberto.totalEntradas = arredondar(caixaAberto.totalEntradas + valor);
      caixaAberto.saldoAtual = arredondar(caixaAberto.saldoAtual + valor);
    } else {
      caixaAberto.totalSaidas = arredondar(caixaAberto.totalSaidas + valor);
      caixaAberto.saldoAtual = arredondar(caixaAberto.saldoAtual - valor);
    }
    caixaAberto.totalMovimentacoes = (caixaAberto.totalMovimentacoes || 0) + 1;
    if (!Array.isArray(caixaAberto.movimentacoesIds)) caixaAberto.movimentacoesIds = [];
    caixaAberto.movimentacoesIds.push(idMov);
  }

  return {
    ok: true,
    movimento: novaMov,
    movimentacao: novaMov,
    caixa: caixaAberto,
    saldoCaixaAtual: caixaAberto ? caixaAberto.saldoAtual : null,
    mensagem: `Lançamento de ${subtipo} no valor de ${financialEngine.formatarMoeda(valor)} registrado com sucesso.`
  };
}

/**
 * Fecha o turno de caixa ativo com apuração e conferência
 */
function fecharCaixa(state = {}, payload = {}) {
  const tenantId = payload.tenantId || state.tenantId || 'default';
  const caixaAberto = obterCaixaAberto(state, tenantId);

  if (!caixaAberto) {
    return { ok: false, code: 'CAIXA_JA_FECHADO', status: 409, error: 'Não há nenhum turno de caixa aberto no momento para ser encerrado.' };
  }

  const movimentos = Array.isArray(state.movimentos) ? state.movimentos : [];
  const movsCaixa = movimentos.filter(m =>
    (m.caixaId === caixaAberto.id) ||
    (Array.isArray(caixaAberto.movimentacoesIds) && caixaAberto.movimentacoesIds.includes(m.id))
  );

  const totaisPorForma = {
    dinheiro: 0,
    pix: 0,
    cartao: 0,
    cartao_credito: 0,
    cartao_debito: 0,
    boleto: 0,
    transferencia: 0,
    outros: 0
  };

  let totalEntradas = 0;
  let totalSaidas = 0;
  let totalSangrias = 0;
  let qtdSangrias = 0;
  let totalSuprimentos = 0;
  let qtdSuprimentos = 0;

  for (const m of movsCaixa) {
    const val = Number(m.valor) || 0;
    const f = normalizarFormaPagamento(m.forma || m.formaPagamento);
    const nat = m.naturezaOperacao || (m.subtipo === 'sangria' ? 'sangria' : (m.subtipo === 'suprimento' ? 'suprimento' : (m.subtipo === 'estorno' || m.estornoDeId ? 'estorno' : 'operacional')));

    if (!m.estornado) {
      if (nat === 'sangria' || m.subtipo === 'sangria') {
        qtdSangrias++;
        totalSangrias = arredondar(totalSangrias + val);
      } else if (nat === 'suprimento' || m.subtipo === 'suprimento') {
        qtdSuprimentos++;
        totalSuprimentos = arredondar(totalSuprimentos + val);
      }
    }

    if (m.tipo === 'entrada') {
      totalEntradas = arredondar(totalEntradas + val);
      totaisPorForma[f] = arredondar((totaisPorForma[f] || 0) + val);
    } else {
      totalSaidas = arredondar(totalSaidas + val);
      totaisPorForma[f] = arredondar((totaisPorForma[f] || 0) - val);
    }
  }

  const saldoInicial = Number(caixaAberto.saldoInicial) || 0;
  const saldoEsperado = arredondar(saldoInicial + totalEntradas - totalSaidas);

  let diferenca = 0;
  let statusConferencia = 'sem_conferencia_cega';
  const valoresInformados = payload.valoresInformados || payload.conferenciaCega || null;

  if (valoresInformados && typeof valoresInformados === 'object') {
    const totalInformado = Object.values(valoresInformados)
      .reduce((acc, v) => acc + (Number(v) || 0), 0);
    diferenca = arredondar(totalInformado - saldoEsperado);
    if (Math.abs(diferenca) < 0.05) {
      statusConferencia = 'conferido';
    } else if (diferenca < 0) {
      statusConferencia = 'quebra';
    } else {
      statusConferencia = 'sobra';
    }
  }

  const agoraInfo = financialEngine.obterAgoraSP();

  caixaAberto.status = 'fechado';
  caixaAberto.aberto = false;
  caixaAberto.fechadoEm = agoraInfo.dataObj.toISOString();
  caixaAberto.dataFechamento = agoraInfo.dataISO;
  caixaAberto.horaFechamento = agoraInfo.horaBR;
  caixaAberto.fechadoPor = String(payload.operador || payload.actorId || 'operador');
  caixaAberto.fechadoPorNome = String(payload.operadorNome || payload.fullName || 'Operador');
  caixaAberto.saldoFinal = saldoEsperado;

  const totalInformado = (valoresInformados && typeof valoresInformados === 'object')
    ? Object.values(valoresInformados).reduce((acc, v) => acc + (Number(v) || 0), 0)
    : saldoEsperado;

  const resumoOrigem = {
    totalWhatsapp: 0,
    qtdWhatsapp: 0,
    totalWeb: 0,
    qtdWeb: 0,
    totalEstornados: 0,
    qtdEstornados: 0
  };

  for (const m of movsCaixa) {
    const v = Number(m.valor) || 0;
    if (m.estornado) {
      resumoOrigem.qtdEstornados++;
      resumoOrigem.totalEstornados = arredondar(resumoOrigem.totalEstornados + v);
    }
    if (m.origem === 'whatsapp') {
      resumoOrigem.qtdWhatsapp++;
      resumoOrigem.totalWhatsapp = arredondar(resumoOrigem.totalWhatsapp + v);
    } else {
      resumoOrigem.qtdWeb++;
      resumoOrigem.totalWeb = arredondar(resumoOrigem.totalWeb + v);
    }
  }

  const boletimWhatsappTexto = formatarBoletimFechamentoWhatsapp({
    caixaId: caixaAberto.id,
    operadorNome: payload.operadorNome || payload.fullName || 'Operador',
    saldoInicial,
    totalEntradas,
    totalSaidas,
    totalSangrias,
    qtdSangrias,
    totalSuprimentos,
    qtdSuprimentos,
    saldoEsperado,
    diferenca,
    statusConferencia,
    resumoOrigem,
    totaisPorForma,
    dataFechamento: agoraInfo.dataBR,
    horaFechamento: agoraInfo.horaBR
  });

  caixaAberto.fechamento = {
    status: 'fechado',
    saldoInicial,
    totalEntradas,
    totalSaidas,
    totalSangrias,
    qtdSangrias,
    totalSuprimentos,
    qtdSuprimentos,
    saldoEsperado,
    saldoFinal: saldoEsperado,
    saldoFinalSistema: saldoEsperado,
    saldoInformadoConferencia: totalInformado,
    diferencaApurada: diferenca,
    totaisPorForma,
    valoresInformados,
    diferenca,
    statusConferencia,
    resumoOrigem,
    resumoTextoWhatsapp: boletimWhatsappTexto,
    origemFechamento: payload.origem || 'sistema',
    canalFechamento: payload.canal || (payload.origem === 'whatsapp' ? 'whatsapp' : 'web'),
    autorNumero: payload.autorNumero || null,
    confirmadoEm: payload.confirmadoEm || null,
    observacoes: String(payload.observacoes || '').trim()
  };

  let resumoTexto = `Caixa encerrado com sucesso. Saldo apurado: ${financialEngine.formatarMoeda(saldoEsperado)} (Entradas: ${financialEngine.formatarMoeda(totalEntradas)} | Saídas: ${financialEngine.formatarMoeda(totalSaidas)}).`;
  if (statusConferencia === 'quebra') {
    resumoTexto += ` ⚠️ Atenção: Detectada quebra de caixa de ${financialEngine.formatarMoeda(Math.abs(diferenca))}.`;
  } else if (statusConferencia === 'sobra') {
    resumoTexto += ` ℹ️ Sobra de caixa apurada de ${financialEngine.formatarMoeda(diferenca)}.`;
  }

  return {
    ok: true,
    caixaFechado: caixaAberto,
    caixa: caixaAberto,
    fechamento: caixaAberto.fechamento,
    resumoFechamento: caixaAberto.fechamento,
    mensagem: resumoTexto
  };
}

module.exports = {
  abrirCaixa,
  registrarMovimentacao,
  fecharCaixa
};
