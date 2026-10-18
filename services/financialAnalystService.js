'use strict';

/**
 * =====================================================================
 * PÁTIO CRM — VERÔNICA ANALISTA FINANCEIRA & ASSISTENTE GERENCIAL
 * Gestão de Caixa Diário (Tesouraria), Fluxo de Caixa Realizado,
 * Previsão (Forecast 7/15/30d) e Controles Internos / Auditoria
 * =====================================================================
 */

const crypto = require('crypto');
const financialEngine = require('./financialEngine');

function gerarId(prefix = 'cx') {
  return `${prefix}_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
}

function arredondar(valor) {
  return Math.round((Number(valor) || 0) * 100) / 100;
}

function hojeISO() {
  return financialEngine.obterAgoraSP().dataISO;
}

/**
 * Normaliza meio de pagamento para chaves canônicas
 */
function normalizarFormaPagamento(forma = 'dinheiro') {
  const f = String(forma || '').toLowerCase().trim();
  if (f.includes('pix')) return 'pix';
  if (f.includes('debito') || f.includes('débito')) return 'cartao_debito';
  if (f.includes('credito') || f.includes('crédito')) return 'cartao_credito';
  if (f.includes('cartao') || f.includes('cartão')) return 'cartao';
  if (f.includes('boleto')) return 'boleto';
  if (f.includes('transferencia') || f.includes('transferência') || f.includes('ted') || f.includes('doc')) return 'transferencia';
  if (f.includes('cheque')) return 'cheque';
  return 'dinheiro';
}

/**
 * Normaliza tipo base de movimentação (entrada vs saida)
 */
function normalizarTipoMovimentacao(tipoRaw = 'receita') {
  const t = String(tipoRaw || '').toLowerCase().trim();
  if (['entrada', 'receita', 'suprimento', 'aporte', 'recebimento'].includes(t)) {
    return { tipoBase: 'entrada', subtipo: t || 'receita' };
  }
  return { tipoBase: 'saida', subtipo: t || 'despesa' };
}

/* ─────────────────────────────────────────────────────────────────
 * 1. GESTÃO DE CAIXA DIÁRIO (TESOURARIA)
 * ───────────────────────────────────────────────────────────────── */

/**
 * Localiza o caixa atualmente aberto no estado do tenant
 */
function obterCaixaAberto(state = {}, tenantId = 'default') {
  if (!Array.isArray(state.caixas)) return null;
  return state.caixas.find(c =>
    (c.status === 'aberto' || c.aberto === true) &&
    (c.tenantId === tenantId || !c.tenantId)
  ) || null;
}

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

  // Se houver saldo inicial em dinheiro, opcionalmente reflete nas movimentações caso solicitado
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

  const { tipoBase, subtipo } = normalizarTipoMovimentacao(payload.tipo);
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

  // Validação de saldo em caso de sangria ou retirada
  if (subtipo === 'sangria' && caixaAberto && formaPagamento === 'dinheiro') {
    if (valor > caixaAberto.saldoAtual) {
      return {
        ok: false,
        error: `Sangria recusada: valor solicitado (${financialEngine.formatarMoeda(valor)}) excede o saldo em dinheiro disponível no caixa (${financialEngine.formatarMoeda(caixaAberto.saldoAtual)}).`
      };
    }
  }

  const idMov = gerarId('mov');
  const descricao = String(payload.descricao || payload.desc || `${subtipo.toUpperCase()} avulsa`).trim();
  const categoria = String(payload.categoria || payload.cat || (tipoBase === 'entrada' ? 'Receita Diversa' : 'Despesa Operacional')).trim();

  const novaMov = {
    id: idMov,
    tenantId,
    caixaId: caixaAberto ? caixaAberto.id : null,
    tipo: tipoBase,
    subtipo,
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

  // Atualiza saldo do turno de caixa atual
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
    return { ok: false, code: 'CAIXA_FECHADO', error: 'Não há nenhum turno de caixa aberto no momento para ser encerrado.' };
  }

  const movimentos = Array.isArray(state.movimentos) ? state.movimentos : [];
  const movsCaixa = movimentos.filter(m =>
    (m.caixaId === caixaAberto.id) ||
    (Array.isArray(caixaAberto.movimentacoesIds) && caixaAberto.movimentacoesIds.includes(m.id))
  );

  // Totais apurados por meio de pagamento
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

  for (const m of movsCaixa) {
    const val = Number(m.valor) || 0;
    const f = normalizarFormaPagamento(m.forma || m.formaPagamento);
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

  // Análise de conferência cega (se fornecida pelo operador)
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

  caixaAberto.fechamento = {
    status: 'fechado',
    saldoInicial,
    totalEntradas,
    totalSaidas,
    saldoEsperado,
    saldoFinal: saldoEsperado,
    saldoFinalSistema: saldoEsperado,
    saldoInformadoConferencia: totalInformado,
    diferencaApurada: diferenca,
    totaisPorForma,
    valoresInformados,
    diferenca,
    statusConferencia,
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

/* ─────────────────────────────────────────────────────────────────
 * 2. FLUXO DE CAIXA REALIZADO E PREVISÃO (FORECAST 7/15/30 DIAS)
 * ───────────────────────────────────────────────────────────────── */

/**
 * Consolida o DFC (Demonstrativo de Fluxo de Caixa) Realizado
 */
function gerarFluxoDeCaixa(state = {}, opcoes = {}) {
  const filtro = opcoes.filtro || '30d';
  const dataRef = opcoes.dataRef || hojeISO();
  const { de, ate } = financialEngine.obterIntervaloFiltro(filtro, dataRef, opcoes.customDe, opcoes.customAte);

  const kpis = financialEngine.calcularKPIsFinanceiros(state, {
    filtro,
    dataRef,
    customDe: de,
    customAte: ate
  });

  const movimentos = Array.isArray(state.movimentos) ? state.movimentos : [];
  const movsPeriodo = movimentos.filter(m => {
    const d = (m.data || '').slice(0, 10);
    return d >= de && d <= ate;
  });

  // Categorização das entradas e saídas
  const entradasPorCategoria = {};
  const saidasPorCategoria = {};
  const porFormaPagamento = {};

  for (const m of movsPeriodo) {
    const val = Number(m.valor) || 0;
    const cat = m.cat || m.categoria || (m.tipo === 'entrada' ? 'Receitas Diversas' : 'Despesas Gerais');
    const f = normalizarFormaPagamento(m.forma || m.formaPagamento);

    if (m.tipo === 'entrada') {
      entradasPorCategoria[cat] = arredondar((entradasPorCategoria[cat] || 0) + val);
    } else {
      saidasPorCategoria[cat] = arredondar((saidasPorCategoria[cat] || 0) + val);
    }

    if (!porFormaPagamento[f]) porFormaPagamento[f] = { entradas: 0, saidas: 0, liquido: 0 };
    if (m.tipo === 'entrada') {
      porFormaPagamento[f].entradas = arredondar(porFormaPagamento[f].entradas + val);
    } else {
      porFormaPagamento[f].saidas = arredondar(porFormaPagamento[f].saidas + val);
    }
    porFormaPagamento[f].liquido = arredondar(porFormaPagamento[f].entradas - porFormaPagamento[f].saidas);
  }

  return {
    periodo: { de, ate, filtro },
    saldoConsolidado: kpis.saldoConsolidado,
    entradasTotal: kpis.entradasPeriodo,
    saidasTotal: kpis.saidasPeriodo,
    resultadoLiquido: kpis.resultadoLiquidoPeriodo,
    entradasPorCategoria,
    saidasPorCategoria,
    porFormaPagamento,
    totalLancamentos: movsPeriodo.length,
    lancamentos: movsPeriodo.slice(0, 100)
  };
}

/**
 * Gera a Previsão (Forecast) de Fluxo de Caixa combinando:
 * - Saldo disponível
 * - Contas a pagar e a receber nos próximos dias
 * - Receita potencial das OS no pátio (cenário conservador vs provável)
 * - Risco de Furo de Caixa
 */
function gerarPrevisaoFluxoCaixa(state = {}, opcoes = {}) {
  const horizonteDias = Number(opcoes.dias || opcoes.horizonteDias) || 30;
  const dataHoje = opcoes.dataRef || hojeISO();
  const dataFim = financialEngine.addDias(dataHoje, horizonteDias);

  const kpisFin = financialEngine.calcularKPIsFinanceiros(state, { filtro: 'hoje', dataRef: dataHoje });
  const saldoAtual = Number(kpisFin.saldoConsolidado) || 0;

  const contas = Array.isArray(state.contas) ? state.contas : [];
  const osList = Array.isArray(state.os) ? state.os : [];
  const quotations = Array.isArray(state.quotations) ? state.quotations : (Array.isArray(state.orcamentos) ? state.orcamentos : []);

  // 1. Títulos no Período
  const recNoPeriodo = contas.filter(c =>
    c.tipo === 'receber' && !c.pago && (c.venc || '') >= dataHoje && (c.venc || '') <= dataFim
  );
  const pagNoPeriodo = contas.filter(c =>
    c.tipo === 'pagar' && !c.pago && (c.venc || '') >= dataHoje && (c.venc || '') <= dataFim
  );

  const totRecPeriodo = arredondar(recNoPeriodo.reduce((acc, c) => acc + (Number(c.valor) || 0), 0));
  const totPagPeriodo = arredondar(pagNoPeriodo.reduce((acc, c) => acc + (Number(c.valor) || 0), 0));

  // 2. Receita Potencial de Pátio (OS ativas & Orçamentos em aprovação)
  const osAtivas = osList.filter(o => o.st !== 'finalizada' && o.st !== 'cancelada');
  const valorTotalOSAtivas = osAtivas.reduce((acc, o) => acc + (Number(o.total || o.valorTotal) || 0), 0);

  const orcamentosPendentes = quotations.filter(q =>
    ['enviado', 'pendente', 'aguardando_aprovacao', 'rascunho'].includes(String(q.status || '').toLowerCase())
  );
  const valorTotalOrcPendentes = orcamentosPendentes.reduce((acc, q) => acc + (Number(q.totalGeral || q.valorTotal) || 0), 0);

  // Cenário Provável: 80% das OS ativas + 40% dos orçamentos
  const potencialPatioProvavel = arredondar((valorTotalOSAtivas * 0.8) + (valorTotalOrcPendentes * 0.4));
  // Cenário Conservador: 50% das OS ativas + 15% dos orçamentos
  const potencialPatioConservador = arredondar((valorTotalOSAtivas * 0.5) + (valorTotalOrcPendentes * 0.15));

  // 3. Projeção Dia a Dia & Identificação de Risco de Furo de Caixa
  const cfg = state.cfg || {};
  const caixaMinimoSeguranca = Number(cfg.caixaMinimoSeguranca || 2000);

  let saldoProjetadoAcum = saldoAtual;
  const diasProjecao = [];
  const diasComFuro = [];
  let menorSaldoProjetado = saldoAtual;
  let dataPrimeiroFuro = null;

  for (let i = 0; i <= horizonteDias; i++) {
    const dt = financialEngine.addDias(dataHoje, i);
    const recDoDia = recNoPeriodo
      .filter(c => (c.venc || '').slice(0, 10) === dt)
      .reduce((acc, c) => acc + (Number(c.valor) || 0), 0);
    const pagDoDia = pagNoPeriodo
      .filter(c => (c.venc || '').slice(0, 10) === dt)
      .reduce((acc, c) => acc + (Number(c.valor) || 0), 0);

    saldoProjetadoAcum = arredondar(saldoProjetadoAcum + recDoDia - pagDoDia);
    if (saldoProjetadoAcum < menorSaldoProjetado) {
      menorSaldoProjetado = saldoProjetadoAcum;
    }

    const riscoNegativo = saldoProjetadoAcum < 0;
    const riscoCaixaMinimo = saldoProjetadoAcum < caixaMinimoSeguranca;

    if ((riscoNegativo || riscoCaixaMinimo) && !dataPrimeiroFuro) {
      dataPrimeiroFuro = dt;
    }

    if (riscoNegativo || riscoCaixaMinimo) {
      diasComFuro.push({
        data: dt,
        saldoProjetado: saldoProjetadoAcum,
        deficit: arredondar(caixaMinimoSeguranca - saldoProjetadoAcum),
        negativo: riscoNegativo
      });
    }

    diasProjecao.push({
      data: dt,
      diaSemana: new Date(dt + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short' }),
      aReceber: arredondar(recDoDia),
      aPagar: arredondar(pagDoDia),
      saldoProjetado: saldoProjetadoAcum,
      risco: riscoNegativo ? 'critico' : (riscoCaixaMinimo ? 'alerta' : 'seguro')
    });
  }

  // Projeções para marcos de 7, 15 e 30 dias
  const saldo7d = diasProjecao[Math.min(7, diasProjecao.length - 1)]?.saldoProjetado ?? saldoAtual;
  const saldo15d = diasProjecao[Math.min(15, diasProjecao.length - 1)]?.saldoProjetado ?? saldoAtual;
  const saldo30d = diasProjecao[Math.min(30, diasProjecao.length - 1)]?.saldoProjetado ?? saldoAtual;

  return {
    horizonteDias,
    dataHoje,
    dataFim,
    saldoAtual,
    caixaMinimoSeguranca,
    totaisPeriodo: {
      aReceber: totRecPeriodo,
      aPagar: totPagPeriodo,
      saldoPrevistoFinanceiro: arredondar(saldoAtual + totRecPeriodo - totPagPeriodo)
    },
    marcos: {
      em7Dias: { saldo: saldo7d, seguro: saldo7d >= caixaMinimoSeguranca },
      em15Dias: { saldo: saldo15d, seguro: saldo15d >= caixaMinimoSeguranca },
      em30Dias: { saldo: saldo30d, seguro: saldo30d >= caixaMinimoSeguranca }
    },
    receitaPotencialPatio: {
      totalOSAtivas: arredondar(valorTotalOSAtivas),
      totalOrcamentosPendentes: arredondar(valorTotalOrcPendentes),
      cenarioProvavel: potencialPatioProvavel,
      cenarioConservador: potencialPatioConservador,
      saldoProvavel30dComPatio: arredondar(saldo30d + potencialPatioProvavel),
      saldoConservador30dComPatio: arredondar(saldo30d + potencialPatioConservador)
    },
    diagnosticoFuro: {
      furoDetectado: diasComFuro.length > 0,
      menorSaldoProjetado,
      dataPrimeiroFuro,
      diasEmRisco: diasComFuro.length,
      detalhesFuro: diasComFuro.slice(0, 10)
    },
    evolucaoDiaria: diasProjecao
  };
}

/* ─────────────────────────────────────────────────────────────────
 * 3. CONTROLES INTERNOS & AUDITORIA GERENCIAL
 * ───────────────────────────────────────────────────────────────── */

/**
 * Avalia controles internos e detecta anomalias de faturamento, caixa e inadimplência
 */
function avaliarControlesInternos(state = {}) {
  const dataHoje = hojeISO();
  const osList = Array.isArray(state.os) ? state.os : [];
  const contas = Array.isArray(state.contas) ? state.contas : [];
  const movimentos = Array.isArray(state.movimentos) ? state.movimentos : [];
  const caixas = Array.isArray(state.caixas) ? state.caixas : [];

  const anomalias = [];

  // 1. VAZAMENTO DE RECEITA: OS concluída sem lançamento financeiro ou título vinculado
  const osFinalizadas = osList.filter(o => o.st === 'finalizada');
  const osIdsComMovimento = new Set(movimentos.map(m => m.osId).filter(Boolean));
  const osIdsComConta = new Set(contas.filter(c => c.tipo === 'receber').map(c => c.osId).filter(Boolean));

  const osSemReceita = [];
  for (const o of osFinalizadas) {
    const valorOS = Number(o.total || o.valorTotal || 0);
    if (valorOS > 0 && !osIdsComMovimento.has(o.id) && !osIdsComConta.has(o.id)) {
      osSemReceita.push({
        osId: o.id,
        num: o.num || o.id,
        placa: o.placa || 'SEM-PLACA',
        valor: valorOS,
        dataFechamento: o.fechamento || o.atualizadoEm || o.abertura
      });
    }
  }

  if (osSemReceita.length > 0) {
    const totalVazamento = osSemReceita.reduce((acc, o) => acc + o.valor, 0);
    const listaOS = osSemReceita.slice(0, 5).map(o => `OS #${o.num}`).join(', ');
    anomalias.push({
      tipo: 'vazamento_receita',
      severidade: 'critico',
      titulo: 'Possível Vazamento de Receita: OS Finalizadas sem Faturamento',
      descricao: `Identificamos ${osSemReceita.length} ordem(ns) de serviço finalizada(s) (${listaOS}) totalizando ${financialEngine.formatarMoeda(totalVazamento)} sem nenhum lançamento em contas a receber ou recebimento no caixa.`,
      quantidade: osSemReceita.length,
      valorEnvolvido: totalVazamento,
      itens: osSemReceita,
      recomendacao: 'Verificar se as ordens de serviço foram faturadas e gerar os respectivos títulos a receber ou baixas de caixa.'
    });
  }

  // 2. INADIMPLÊNCIA CRÍTICA: Títulos a receber vencidos
  const titulosVencidos = contas.filter(c =>
    c.tipo === 'receber' && !c.pago && (c.venc || '').slice(0, 10) < dataHoje
  );
  if (titulosVencidos.length > 0) {
    const totalInadimplente = titulosVencidos.reduce((acc, c) => acc + (Number(c.valor) || 0), 0);
    anomalias.push({
      tipo: 'inadimplencia',
      severidade: totalInadimplente > 5000 ? 'critico' : 'alerta',
      titulo: 'Inadimplência de Clientes: Títulos Vencidos',
      descricao: `Há ${titulosVencidos.length} título(s) vencido(s) aguardando cobrança, totalizando ${financialEngine.formatarMoeda(totalInadimplente)}.`,
      quantidade: titulosVencidos.length,
      valorEnvolvido: totalInadimplente,
      itens: titulosVencidos.slice(0, 10).map(c => ({
        id: c.id,
        desc: c.desc || c.parte,
        valor: c.valor,
        vencimento: c.venc,
        diasAtraso: financialEngine.diasEntre(c.venc, dataHoje)
      })),
      recomendacao: 'Acionar os frotistas e clientes para renegociação ou envio do link de cobrança Pix.'
    });
  }

  // 3. TÍTULOS VENCENDO HOJE
  const vencendoHojePagar = contas.filter(c => c.tipo === 'pagar' && !c.pago && (c.venc || '').slice(0, 10) === dataHoje);
  const vencendoHojeReceber = contas.filter(c => c.tipo === 'receber' && !c.pago && (c.venc || '').slice(0, 10) === dataHoje);

  // 4. SANGRIA OU DESPESA ELEVADA
  const sangriasElevadas = movimentos.filter(m =>
    (m.subtipo === 'sangria' || (m.tipo === 'saida' && Number(m.valor) >= 1500)) &&
    (m.data || '').slice(0, 10) === dataHoje
  );
  if (sangriasElevadas.length > 0) {
    anomalias.push({
      tipo: 'sangria_elevada',
      severidade: 'alerta',
      titulo: 'Retiradas de Caixa Elevadas Hoje',
      descricao: `Identificamos ${sangriasElevadas.length} retirada(s) de caixa acima de R$ 1.500 no dia de hoje.`,
      quantidade: sangriasElevadas.length,
      itens: sangriasElevadas.map(m => ({ id: m.id, desc: m.desc, valor: m.valor, operador: m.operador })),
      recomendacao: 'Conferir os comprovantes físicos e autorizações gerenciais das saídas de caixa.'
    });
  }

  // 5. CAIXA SEM FECHAMENTO
  const caixasAbertosAntigos = caixas.filter(c => {
    if (c.status !== 'aberto') return false;
    const dAberta = (c.dataAbertura || c.abertoEm || '').slice(0, 10);
    return dAberta < dataHoje;
  });
  if (caixasAbertosAntigos.length > 0) {
    anomalias.push({
      tipo: 'caixa_pendente_fechamento',
      severidade: 'alerta',
      titulo: 'Turno de Caixa de Dias Anteriores Ainda Aberto',
      descricao: `Há ${caixasAbertosAntigos.length} caixa(s) aberto(s) em data anterior sem fechamento formal realizado.`,
      quantidade: caixasAbertosAntigos.length,
      itens: caixasAbertosAntigos.map(c => ({ id: c.id, dataAbertura: c.dataAbertura, operador: c.abertoPorNome })),
      recomendacao: 'Realizar o fechamento do caixa anterior para iniciar o turno de hoje com conciliação exata.'
    });
  }

  // GERAÇÃO DO PARECER EXECUTIVO DA VERÔNICA
  const kpis = financialEngine.calcularKPIsFinanceiros(state, { filtro: 'hoje' });
  const previsao = gerarPrevisaoFluxoCaixa(state, { dias: 30 });
  const parecerExecutivo = formatarParecerExecutivoVerônica({
    kpis,
    previsao,
    anomalias,
    vencendoHojePagar,
    vencendoHojeReceber,
    nomeAssistente: state.cfg?.assistente?.displayName || 'Verônica'
  });

  return {
    sucesso: true,
    dataReferencia: dataHoje,
    statusGeral: anomalias.some(a => a.severidade === 'critico') ? 'critico' : (anomalias.length > 0 ? 'alerta' : 'conforme'),
    totalAnomalias: anomalias.length,
    anomaliasCriticas: anomalias.filter(a => a.severidade === 'critico').length,
    anomalias,
    vencimentosHoje: {
      aPagar: { total: kpis.totalPagHoje, quantidade: vencendoHojePagar.length },
      aReceber: { total: kpis.totalRecHoje, quantidade: vencendoHojeReceber.length }
    },
    parecerExecutivo
  };
}

/**
 * Formata o Parecer Executivo da Verônica para leitura, TTS e WhatsApp
 */
function formatarParecerExecutivoVerônica(optionsOrState = {}) {
  let kpis = optionsOrState.kpis;
  let previsao = optionsOrState.previsao;
  let anomalias = optionsOrState.anomalias || [];
  let vencendoHojePagar = optionsOrState.vencendoHojePagar || [];
  let vencendoHojeReceber = optionsOrState.vencendoHojeReceber || [];
  let nomeAssistente = optionsOrState.nomeAssistente;

  if (!kpis) {
    const state = optionsOrState;
    const dataHoje = hojeISO();
    kpis = financialEngine.calcularKPIsFinanceiros(state, { filtro: 'hoje' });
    previsao = gerarPrevisaoFluxoCaixa(state, { dias: 30 });
    const contas = Array.isArray(state.contas) ? state.contas : [];
    vencendoHojePagar = contas.filter(c => c.tipo === 'pagar' && !c.pago && (c.venc || '').slice(0, 10) === dataHoje);
    vencendoHojeReceber = contas.filter(c => c.tipo === 'receber' && !c.pago && (c.venc || '').slice(0, 10) === dataHoje);
    const auditoria = avaliarControlesInternos(state);
    anomalias = auditoria.anomalias;
    nomeAssistente = state.cfg?.assistente?.displayName || 'Verônica';
  }
  if (!nomeAssistente) nomeAssistente = 'Verônica';
  const agoraSP = financialEngine.obterAgoraSP();
  const saldoDisp = financialEngine.formatarMoeda(kpis.saldoConsolidado);
  const recHoje = financialEngine.formatarMoeda(kpis.totalRecHoje);
  const pagHoje = financialEngine.formatarMoeda(kpis.totalPagHoje);
  const prev30d = financialEngine.formatarMoeda(previsao.marcos.em30Dias.saldo);

  let texto = `🤖 *PARECER EXECUTIVO FINANCEIRO DA ${nomeAssistente.toUpperCase()}*\n`;
  texto += `📅 *Posição:* ${agoraSP.dataBR} às ${agoraSP.horaBR}\n`;
  texto += `════════════════════════════\n\n`;

  // 1. Diagnóstico de Liquidez
  texto += `💰 *1. DISPONIBILIDADE E LIQUIDEZ*\n`;
  texto += `• Saldo Disponível em Caixa: *${saldoDisp}*\n`;
  texto += `• Contas a Receber Hoje: ${recHoje} (${vencendoHojeReceber.length} títulos)\n`;
  texto += `• Contas a Pagar Hoje: ${pagHoje} (${vencendoHojePagar.length} despesas)\n`;
  texto += `• Previsão de Saldo em 30 Dias: *${prev30d}*\n\n`;

  // 2. Previsão e Risco de Caixa
  texto += `📈 *2. PROJEÇÃO DE FLUXO & PÁTIO*\n`;
  if (previsao.diagnosticoFuro.furoDetectado) {
    texto += `⚠️ *ALERTA DE FLUXO:* Risco de déficit projetado a partir de ${financialEngine.formatarDataBRFull(previsao.diagnosticoFuro.dataPrimeiroFuro)} (menor saldo: ${financialEngine.formatarMoeda(previsao.diagnosticoFuro.menorSaldoProjetado)}).\n`;
  } else {
    texto += `✅ *FLUXO ESTÁVEL:* Saldo permanece acima da margem de segurança de ${financialEngine.formatarMoeda(previsao.caixaMinimoSeguranca)} nos próximos 30 dias.\n`;
  }
  texto += `• Receita Potencial das OS no Pátio: *${financialEngine.formatarMoeda(previsao.receitaPotencialPatio.cenarioProvavel)}* (Cenário provável)\n\n`;

  // 3. Controles Internos e Auditoria
  texto += `🔍 *3. AUDITORIA & CONTROLES INTERNOS*\n`;
  if (anomalias.length === 0) {
    texto += `✅ Nenhuma anomalia crítica identificada. Operação e financeiro reconciliados.\n`;
  } else {
    for (const a of anomalias) {
      const icone = a.severidade === 'critico' ? '🚨' : '⚠️';
      texto += `${icone} *${a.titulo}*\n   ${a.descricao}\n   💡 _Ação:_ ${a.recomendacao}\n`;
    }
  }

  return texto;
}

module.exports = {
  obterCaixaAberto,
  abrirCaixa,
  registrarMovimentacao,
  fecharCaixa,
  gerarFluxoDeCaixa,
  gerarPrevisaoFluxoCaixa,
  avaliarControlesInternos,
  formatarParecerExecutivoVerônica,
  normalizarFormaPagamento,
  normalizarTipoMovimentacao
};
