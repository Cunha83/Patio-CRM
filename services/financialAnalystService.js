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

  // Validação de saldo em caso de sangria ou retirada
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
 * Executa o estorno contábil auditado de uma movimentação financeira
 * Regras:
 * 1. Não apaga o registro original (imutabilidade).
 * 2. Marca o original com estornado: true, estornadoEm, estornadoPor, motivoEstorno.
 * 3. Cria lançamento compensatório inverso (entrada <-> saida) referenciando estornoDeId.
 * 4. Compensa o saldo do caixa atual.
 * 5. Idempotência: impede reestorno (409) ou estorno de lançamento de estorno (400).
 */
function estornarMovimentacao(state = {}, { movimentoId, motivo, operador, operadorNome, tenantId = 'default', origem, canal, autorNumero } = {}) {
  if (!movimentoId) {
    return { ok: false, code: 'PARAMETRO_INVALIDO', status: 400, error: 'O ID da movimentação é obrigatório para estorno.' };
  }

  const motivoTrim = String(motivo || '').trim();
  if (motivoTrim.length < 3) {
    return { ok: false, code: 'MOTIVO_INVALIDO', status: 400, error: 'O motivo do estorno é obrigatório e deve conter ao menos 3 caracteres.' };
  }

  if (!Array.isArray(state.movimentos)) {
    state.movimentos = [];
  }

  const movOriginal = state.movimentos.find(m => m.id === movimentoId);
  if (!movOriginal) {
    return { ok: false, code: 'MOVIMENTO_NAO_ENCONTRADO', status: 404, error: 'Movimentação financeira não localizada.' };
  }

  // Trava de Imutabilidade: impede estorno em turno de caixa já encerrado
  if (Array.isArray(state.caixas)) {
    const cxVinculado = state.caixas.find(c =>
      c.id === movOriginal.caixaId ||
      (Array.isArray(c.movimentacoesIds) && c.movimentacoesIds.includes(movOriginal.id))
    );
    if (cxVinculado && (cxVinculado.status === 'fechado' || cxVinculado.aberto === false)) {
      return {
        ok: false,
        code: 'CAIXA_JA_FECHADO',
        status: 409,
        error: `Não é permitido estornar movimentações vinculadas a um turno de caixa já encerrado (#${cxVinculado.id}).`
      };
    }
  }

  if (movOriginal.estornado) {
    return {
      ok: false,
      code: 'MOVIMENTO_JA_ESTORNADO',
      status: 409,
      error: `Esta movimentação (#${movOriginal.id}) já foi estornada anteriormente por ${movOriginal.estornadoPor || 'outro operador'}.`
    };
  }

  if (movOriginal.estornoDeId) {
    return {
      ok: false,
      code: 'OPERACAO_INVALIDA_ESTORNO',
      status: 400,
      error: 'Não é permitido estornar um lançamento compensatório de estorno.'
    };
  }

  const agoraInfo = financialEngine.obterAgoraSP();
  const agoraIso = agoraInfo.dataObj.toISOString();
  const valor = arredondar(movOriginal.valor);

  // Marcação do registro original
  movOriginal.estornado = true;
  movOriginal.estornadoEm = agoraIso;
  movOriginal.estornadoPor = String(operador || 'operador');
  movOriginal.estornadoPorNome = String(operadorNome || operador || 'Operador');
  movOriginal.motivoEstorno = motivoTrim;

  // Criação do lançamento compensatório inverso
  const tipoCompensatorio = movOriginal.tipo === 'entrada' ? 'saida' : 'entrada';
  const idEstorno = gerarId('est');
  const caixaAberto = obterCaixaAberto(state, tenantId);

  const movCompensatorio = {
    id: idEstorno,
    tenantId,
    caixaId: caixaAberto ? caixaAberto.id : movOriginal.caixaId,
    tipo: tipoCompensatorio,
    subtipo: 'estorno',
    naturezaOperacao: 'estorno',
    valor,
    cat: 'Estorno Contábil',
    categoria: 'Estorno Contábil',
    forma: movOriginal.forma || movOriginal.formaPagamento || 'dinheiro',
    formaPagamento: movOriginal.forma || movOriginal.formaPagamento || 'dinheiro',
    desc: `Estorno de ${movOriginal.tipo === 'entrada' ? 'Entrada' : 'Saída'} (#${movOriginal.id}): ${motivoTrim}`,
    descricao: `Estorno de ${movOriginal.tipo === 'entrada' ? 'Entrada' : 'Saída'} (#${movOriginal.id}): ${motivoTrim}`,
    data: agoraInfo.dataISO,
    dataHora: agoraIso,
    osId: movOriginal.osId || null,
    clienteId: movOriginal.clienteId || null,
    fornecedorId: movOriginal.fornecedorId || null,
    operador: String(operador || 'operador'),
    origem: origem || movOriginal.origem || 'web',
    canal: canal || movOriginal.canal || 'painel',
    autorNumero: autorNumero || movOriginal.autorNumero || null,
    estornoDeId: movOriginal.id,
    motivoEstorno: motivoTrim,
    criadoEm: agoraIso
  };

  state.movimentos.unshift(movCompensatorio);

  // Atualização do saldo do caixa
  if (caixaAberto) {
    if (tipoCompensatorio === 'entrada') {
      caixaAberto.totalEntradas = arredondar(caixaAberto.totalEntradas + valor);
      caixaAberto.saldoAtual = arredondar(caixaAberto.saldoAtual + valor);
    } else {
      caixaAberto.totalSaidas = arredondar(caixaAberto.totalSaidas + valor);
      caixaAberto.saldoAtual = arredondar(caixaAberto.saldoAtual - valor);
    }
    caixaAberto.totalMovimentacoes = (caixaAberto.totalMovimentacoes || 0) + 1;
    if (!Array.isArray(caixaAberto.movimentacoesIds)) caixaAberto.movimentacoesIds = [];
    caixaAberto.movimentacoesIds.push(idEstorno);
  }

  // Sincronia Bidirecional: Reabertura automática de título liquidado vinculado
  let tituloReaberto = null;
  const contas = Array.isArray(state.contas) ? state.contas : [];
  const tituloVinculado = contas.find(c =>
    (c.movimentoId && String(c.movimentoId) === String(movOriginal.id)) ||
    (movOriginal.tituloId && String(c.id) === String(movOriginal.tituloId)) ||
    (c.ultimoMovimentoId && String(c.ultimoMovimentoId) === String(movOriginal.id))
  );

  if (tituloVinculado && (tituloVinculado.pago || tituloVinculado.status === 'liquidado')) {
    tituloVinculado.pago = false;
    tituloVinculado.status = 'aberto';
    tituloVinculado.reabertoPorEstornoEm = agoraIso;
    tituloVinculado.ultimoEstornoId = idEstorno;
    delete tituloVinculado.dataPagamento;
    delete tituloVinculado.dataPgto;
    tituloReaberto = tituloVinculado;
  }

  // Recalculo imediato do status financeiro da OS vinculada
  const osAlvoId = movOriginal.osId || tituloVinculado?.osId;
  let resumoOSAtualizado = null;
  if (osAlvoId) {
    resumoOSAtualizado = obterResumoFinanceiroOS(state, osAlvoId);
    if (Array.isArray(state.os)) {
      const osCad = state.os.find(o => String(o.id || o.numero || '').replace(/^#/, '').trim() === String(osAlvoId).replace(/^#/, '').trim());
      if (osCad) {
        osCad.statusLiberacaoPatio = resumoOSAtualizado.statusLiberacaoPatio;
      }
    }
  }

  return {
    ok: true,
    status: 200,
    mensagem: `Movimentação #${movOriginal.id} estornada com sucesso. Lançamento compensatório #${idEstorno} registrado.${tituloReaberto ? ` Título #${tituloReaberto.id} reaberto automaticamente.` : ''}`,
    movimentoOriginal: projetarMovimentacao(movOriginal),
    movimentoEstornado: projetarMovimentacao(movOriginal),
    movimentoCompensatorio: projetarMovimentacao(movCompensatorio),
    caixa: caixaAberto ? projetarCaixa(caixaAberto) : null,
    saldoCaixaAtual: caixaAberto ? caixaAberto.saldoAtual : null,
    saldoAtual: caixaAberto ? caixaAberto.saldoAtual : null,
    tituloReaberto,
    resumoOS: resumoOSAtualizado
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

  // Consolidação de contagem e volume por origem e estornos
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

/**
 * Normaliza e projeta uma movimentação preservando e expondo explicitamente os campos de auditoria
 */
function projetarMovimentacao(m = {}) {
  if (!m || typeof m !== 'object') return {};
  const origem = m.origem || 'web';
  const nat = m.naturezaOperacao || (m.subtipo === 'sangria' ? 'sangria' : (m.subtipo === 'suprimento' ? 'suprimento' : (m.subtipo === 'estorno' || m.estornoDeId ? 'estorno' : 'operacional')));
  return {
    ...m,
    naturezaOperacao: nat,
    origem,
    canal: m.canal || (origem === 'whatsapp' ? 'whatsapp' : 'web'),
    autorNumero: m.autorNumero || null,
    confirmadoEm: m.confirmadoEm || null,
    estornado: Boolean(m.estornado),
    estornadoEm: m.estornadoEm || null,
    estornadoPor: m.estornadoPor || null,
    motivoEstorno: m.motivoEstorno || null,
    estornoDeId: m.estornoDeId || null,
    tituloId: m.tituloId || null
  };
}

/**
 * Normaliza e projeta um turno de caixa com metadados de auditoria
 */
function projetarCaixa(c = {}) {
  if (!c || typeof c !== 'object') return null;
  const origem = c.origem || 'sistema';
  return {
    ...c,
    origem,
    canal: c.canal || (origem === 'whatsapp' ? 'whatsapp' : 'web'),
    autorNumero: c.autorNumero || null,
    confirmadoEm: c.confirmadoEm || null,
    resumoPorOS: c.resumoPorOS || {}
  };
}

/**
 * Lista movimentações financeiras com filtros de origem, estorno e paginação
 */
function listarMovimentacoes(state = {}, filtros = {}) {
  const movsRaw = Array.isArray(state.movimentos) ? state.movimentos : [];
  let lista = movsRaw.map(projetarMovimentacao);

  const {
    tipo,
    subtipo,
    de,
    ate,
    forma,
    caixaId,
    origem,
    estornado,
    apenasAtivos,
    limit
  } = filtros;

  if (tipo) {
    lista = lista.filter(m => m.tipo === tipo);
  }
  if (subtipo) {
    lista = lista.filter(m => m.subtipo === subtipo);
  }
  if (caixaId) {
    lista = lista.filter(m => m.caixaId === caixaId);
  }
  const formaFiltro = forma || filtros.meioPagamento;
  if (formaFiltro && formaFiltro !== 'todos') {
    const fNorm = String(formaFiltro).toLowerCase().trim();
    lista = lista.filter(m => {
      const f = String(m.forma || m.formaPagamento || '').toLowerCase().trim();
      return f === fNorm || f.includes(fNorm);
    });
  }
  if (de) {
    lista = lista.filter(m => (m.data || '').slice(0, 10) >= de);
  }
  if (ate) {
    lista = lista.filter(m => (m.data || '').slice(0, 10) <= ate);
  }
  if (origem && origem !== 'todos') {
    const origNorm = String(origem).toLowerCase().trim();
    if (origNorm === 'estornados') {
      lista = lista.filter(m => Boolean(m.estornado));
    } else if (origNorm === 'web') {
      lista = lista.filter(m => String(m.origem || 'web').toLowerCase() !== 'whatsapp');
    } else {
      lista = lista.filter(m => String(m.origem || '').toLowerCase() === origNorm);
    }
  }
  if (estornado !== undefined && estornado !== null && estornado !== '') {
    const estBool = String(estornado) === 'true' || estornado === true;
    lista = lista.filter(m => Boolean(m.estornado) === estBool);
  } else if (apenasAtivos) {
    lista = lista.filter(m => !m.estornado);
  }

  // Resumo de contagem e volume por origem no escopo filtrado
  const resumoOrigem = {
    totalWhatsapp: 0,
    qtdWhatsapp: 0,
    totalWeb: 0,
    qtdWeb: 0,
    totalEstornados: 0,
    qtdEstornados: 0
  };

  for (const m of lista) {
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

  // Consolidação por meio de pagamento no escopo filtrado
  const resumoMeiosPagamento = {};
  for (const m of lista) {
    const v = Number(m.valor) || 0;
    const f = normalizarFormaPagamento(m.forma || m.formaPagamento);
    if (!resumoMeiosPagamento[f]) {
      resumoMeiosPagamento[f] = { total: 0, qtd: 0 };
    }
    resumoMeiosPagamento[f].qtd++;
    resumoMeiosPagamento[f].total = arredondar(resumoMeiosPagamento[f].total + v);
  }

  // Consolidação por Ordem de Serviço (OS) no escopo filtrado
  const resumoPorOS = {};
  for (const m of lista) {
    if (m.osId && !m.estornado && !m.estornoDeId && m.subtipo !== 'estorno') {
      const osKey = String(m.osId).replace(/^#/, '').trim();
      if (!resumoPorOS[osKey]) {
        resumoPorOS[osKey] = {
          osId: osKey,
          totalEntradasOS: 0,
          totalSaidasOS: 0,
          saldoLiquidoOS: 0,
          qtdLancamentos: 0,
          placasVinculadas: []
        };
      }
      const v = Number(m.valor) || 0;
      if (m.tipo === 'entrada' || m.tipo === 'receita') {
        resumoPorOS[osKey].totalEntradasOS = arredondar(resumoPorOS[osKey].totalEntradasOS + v);
      } else {
        resumoPorOS[osKey].totalSaidasOS = arredondar(resumoPorOS[osKey].totalSaidasOS + v);
      }
      resumoPorOS[osKey].saldoLiquidoOS = arredondar(resumoPorOS[osKey].totalEntradasOS - resumoPorOS[osKey].totalSaidasOS);
      resumoPorOS[osKey].qtdLancamentos++;
      if (m.placa && !resumoPorOS[osKey].placasVinculadas.includes(String(m.placa).toUpperCase().trim())) {
        resumoPorOS[osKey].placasVinculadas.push(String(m.placa).toUpperCase().trim());
      }
    }
  }

  const max = Number(limit) > 0 ? Number(limit) : 200;
  return {
    total: lista.length,
    movimentacoes: lista.slice(0, max),
    resumoOrigem,
    resumoMeiosPagamento,
    resumoPorOS
  };
}

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

    // Apenas movimentações ativas (não estornadas e não compensatórias de estorno)
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

  // Consulta de dados cadastrais da OS (caso existam em state.os)
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

  // Consulta de Títulos a Receber faturados a prazo vinculados à OS
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

  // Status de liberação de pátio:
  // - 'liberado_quitado': 100% pago
  // - 'liberado_faturado': saldo restante está integralmente faturado a prazo com títulos emitidos
  // - 'liberado_excepcional': possui liberação excepcional assinada por superior com justificativa
  // - 'retido_pendente': ainda há saldo pendente sem cobertura de faturamento ou pagamento
  let statusLiberacaoPatio = 'retido_pendente';
  if (quitada || saldoRestante <= 0) {
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

  // Se a OS já estiver quitada ou já estiver integralmente faturada
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

/**
 * Realiza a liquidação (baixa) de um título a receber ou conta a pagar, gerando a movimentação de caixa integrada
 */
function liquidarTituloFinanceiro(state = {}, payload = {}) {
  const idBuscado = String(payload.id || payload.tituloId || payload.contaId || '').trim();
  if (!idBuscado) {
    return { ok: false, status: 400, code: 'ID_OBRIGATORIO', error: 'O ID do título financeiro é obrigatório.' };
  }

  const contas = Array.isArray(state.contas) ? state.contas : [];
  const idNorm = idBuscado.toLowerCase();
  const idSemPrefixo = idNorm.replace(/^(?:tit_|cnt_|mov_|cta_)/, '');

  const titulo = contas.find(c => {
    const cId = String(c.id || '').toLowerCase();
    if (cId === idNorm) return true;
    if (cId.replace(/^(?:tit_|cnt_|mov_|cta_)/, '') === idSemPrefixo) return true;
    return false;
  });

  if (!titulo) {
    return { ok: false, status: 404, code: 'TITULO_NAO_ENCONTRADO', error: `Título financeiro #${idBuscado} não foi encontrado.` };
  }

  if (titulo.pago || titulo.status === 'liquidado' || titulo.status === 'pago') {
    return {
      ok: false,
      status: 409,
      code: 'TITULO_JA_LIQUIDADO',
      error: `O título #${titulo.id} já foi liquidado anteriormente em ${titulo.dataPagamento || titulo.dataPgto || 'data anterior'}.`
    };
  }

  const tenantId = state.tenantId || payload.tenantId || 'default';
  const caixaAberto = obterCaixaAberto(state, tenantId);
  if (!caixaAberto) {
    return {
      ok: false,
      status: 409,
      code: 'CAIXA_FECHADO',
      error: 'Não há caixa aberto no momento para registrar a liquidação financeira.'
    };
  }

  const operador = payload.operador || payload.actorId || 'operador';
  const meioLiquidacao = normalizarFormaPagamento(payload.meioPagamento || payload.forma || titulo.forma || titulo.formaPagamento || 'dinheiro');
  const dataLiquidacao = payload.dataPagamento || payload.dataPgto || hojeISO();
  const valorTitulo = Number(titulo.valor) || 0;

  // Define se é entrada (recebimento de título) ou saída (pagamento de conta)
  const isReceber = titulo.tipo === 'receber';
  const tipoMov = isReceber ? 'entrada' : 'saida';
  const subtipoMov = isReceber ? 'recebimento_titulo' : 'pagamento_titulo';
  const descMov = `Baixa de Título: ${titulo.desc || (isReceber ? 'Recebimento' : 'Pagamento')} (${titulo.parte || 'Geral'})`;

  // Registra a movimentação financeira no caixa aberto
  const resMov = registrarMovimentacao(state, {
    tenantId,
    tipo: tipoMov,
    subtipo: subtipoMov,
    naturezaOperacao: subtipoMov,
    valor: valorTitulo,
    descricao: descMov,
    forma: meioLiquidacao,
    formaPagamento: meioLiquidacao,
    osId: titulo.osId || '',
    placa: titulo.placa || '',
    tituloId: titulo.id,
    categoria: isReceber ? 'Recebimento de Título' : 'Pagamento de Despesa',
    operador,
    origem: payload.origem || 'sistema',
    canal: payload.canal || payload.origem || 'sistema',
    autorNumero: payload.autorNumero || null,
    data: dataLiquidacao
  });

  if (!resMov.ok) {
    return {
      ok: false,
      status: resMov.status || 400,
      code: resMov.code || 'ERRO_MOVIMENTACAO',
      error: resMov.error || 'Falha ao registrar a movimentação financeira de caixa.'
    };
  }

  // Efetiva a baixa no título
  titulo.pago = true;
  titulo.status = 'liquidado';
  titulo.dataPagamento = dataLiquidacao;
  titulo.dataPgto = dataLiquidacao;
  titulo.liquidadoPor = operador;
  titulo.liquidadoEm = new Date().toISOString();
  titulo.meioLiquidacao = meioLiquidacao;
  titulo.movimentoId = resMov.movimentacao.id;

  return {
    ok: true,
    sucesso: true,
    mensagem: `Título #${titulo.id} baixado com sucesso no ${meioLiquidacao.toUpperCase()}.`,
    titulo,
    movimentacao: resMov.movimentacao,
    saldoCaixaAtual: resMov.saldoCaixaAtual
  };
}

/**
 * Valida financeiramente a liberação de saída de veículo/OS no pátio ou concede liberação excepcional auditada com RBAC
 */
function validarOuAutorizarSaidaPatioOS(state = {}, payload = {}) {
  const osId = payload.osId;
  if (!osId) {
    return {
      ok: false,
      autorizado: false,
      status: 400,
      code: 'OS_ID_OBRIGATORIO',
      error: 'OS_ID_OBRIGATORIO',
      message: 'O identificador da OS (osId) é obrigatório.'
    };
  }

  const osNorm = String(osId).replace(/^#/, '').trim();
  const resumoOS = obterResumoFinanceiroOS(state, osNorm, payload);
  const forcarLiberacao = Boolean(payload.forcarLiberacao);

  // Se a OS já estiver liberada (quitada, faturada a prazo ou liberação excepcional prévia)
  if (['liberado_quitado', 'liberado_faturado', 'liberado_excepcional'].includes(resumoOS.statusLiberacaoPatio)) {
    return {
      ok: true,
      autorizado: true,
      statusLiberacaoPatio: resumoOS.statusLiberacaoPatio,
      osId: osNorm,
      saldoRestante: resumoOS.saldoRestante,
      liberacaoExcepcional: resumoOS.liberacaoExcepcional || null,
      mensagem: `Saída do pátio autorizada com sucesso (${resumoOS.statusLiberacaoPatio}). Saldo pendente: R$ ${resumoOS.saldoRestante.toFixed(2)}.`
    };
  }

  // Se a OS está com status 'retido_pendente'
  if (!forcarLiberacao) {
    return {
      ok: false,
      autorizado: false,
      status: 409,
      code: 'OS_RETIDA_PENDENCIA_FINANCEIRA',
      error: 'OS_RETIDA_PENDENCIA_FINANCEIRA',
      saldoRestante: resumoOS.saldoRestante,
      statusLiberacaoPatio: 'retido_pendente',
      message: `Saída bloqueada: OS #${osNorm} possui pendência financeira de R$ ${resumoOS.saldoRestante.toFixed(2)} sem quitação ou faturamento a prazo.`
    };
  }

  // Se forcarLiberacao === true: Validação de RBAC
  const operador = payload.operador || {};
  const perfil = (operador.perfil || operador.role || payload.perfil || payload.role || '').toLowerCase();
  const perfisPermitidos = ['dono', 'tenant_admin', 'owner', 'platform_admin', 'admin'];
  if (!perfisPermitidos.includes(perfil)) {
    return {
      ok: false,
      autorizado: false,
      status: 403,
      code: 'PERFIL_NAO_AUTORIZADO',
      error: 'PERFIL_NAO_AUTORIZADO',
      statusLiberacaoPatio: 'retido_pendente',
      saldoRestante: resumoOS.saldoRestante,
      message: 'Apenas perfis superiores (Dono ou Administrador) podem conceder liberação excepcional de pátio.'
    };
  }

  // Validação da justificativa (mínimo 5 caracteres)
  const justificativa = String(payload.justificativa || '').trim();
  if (!justificativa || justificativa.length < 5) {
    return {
      ok: false,
      autorizado: false,
      status: 400,
      code: 'JUSTIFICATIVA_INVALIDA',
      error: 'JUSTIFICATIVA_INVALIDA',
      statusLiberacaoPatio: 'retido_pendente',
      saldoRestante: resumoOS.saldoRestante,
      message: 'A justificativa para liberação excepcional deve ter pelo menos 5 caracteres.'
    };
  }

  // Gravar liberação excepcional no cadastro da OS no state
  if (!Array.isArray(state.os)) {
    state.os = [];
  }
  let osCadastro = state.os.find(o => String(o.id || o.numero || '').replace(/^#/, '').trim() === osNorm);
  if (!osCadastro) {
    osCadastro = { id: osNorm, numero: osNorm };
    state.os.push(osCadastro);
  }

  const liberacaoExcepcional = {
    autorizadoPor: operador.nome || operador.autorizadoPor || operador.actorId || payload.autorizadoPor || 'Administrador',
    perfil,
    justificativa,
    dataHora: new Date().toISOString(),
    saldoPendenteNaSaida: resumoOS.saldoRestante
  };

  osCadastro.liberacaoExcepcional = liberacaoExcepcional;
  osCadastro.statusLiberacaoPatio = 'liberado_excepcional';

  return {
    ok: true,
    autorizado: true,
    statusLiberacaoPatio: 'liberado_excepcional',
    osId: osNorm,
    saldoRestante: resumoOS.saldoRestante,
    liberacaoExcepcional,
    mensagem: `Liberação excepcional de pátio concedida por ${liberacaoExcepcional.autorizadoPor} (${perfil}). Justificativa: "${justificativa}".`
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
 * Formata o Boletim de Fechamento Auditado em texto elegante para o WhatsApp
 */
function formatarBoletimFechamentoWhatsapp({
  caixaId,
  operadorNome,
  saldoInicial = 0,
  totalEntradas = 0,
  totalSaidas = 0,
  totalSangrias = 0,
  qtdSangrias = 0,
  totalSuprimentos = 0,
  qtdSuprimentos = 0,
  saldoEsperado = 0,
  diferenca = 0,
  statusConferencia = 'sem_conferencia_cega',
  resumoOrigem = {},
  totaisPorForma = {},
  dataFechamento,
  horaFechamento,
  isParcial = false
} = {}) {
  const agoraSP = financialEngine.obterAgoraSP();
  const d = dataFechamento || agoraSP.dataBR;
  const h = horaFechamento || agoraSP.horaBR;

  const titulo = isParcial ? 'FECHAMENTO PARCIAL DE CAIXA' : 'BOLETIM DE FECHAMENTO DE CAIXA';
  const iconeStatus = isParcial ? '⏳' : '🔒';

  let txt = `${iconeStatus} *${titulo}* ${iconeStatus}\n\n`;
  txt += `• *Turno:* #${caixaId || 'N/A'}\n`;
  txt += `• *Data/Hora:* ${d} às ${h}\n`;
  txt += `• *Operador:* ${operadorNome || 'Operador'}\n\n`;

  txt += `💰 *MOVIMENTAÇÃO FINANCEIRA:*\n`;
  txt += `• Fundo Inicial: ${financialEngine.formatarMoeda(saldoInicial)}\n`;
  txt += `• (+) Entradas: ${financialEngine.formatarMoeda(totalEntradas)}\n`;
  txt += `• (-) Saídas: ${financialEngine.formatarMoeda(totalSaidas)}\n`;
  txt += `• (=) Saldo Final: *${financialEngine.formatarMoeda(saldoEsperado)}*\n\n`;

  if (totalSuprimentos > 0 || totalSangrias > 0) {
    txt += `🏦 *TESOURARIA & MOVIMENTAÇÃO DE CAIXA:*\n`;
    if (totalSuprimentos > 0) {
      txt += `• 🪙 Suprimentos / Aportes: ${financialEngine.formatarMoeda(totalSuprimentos)} (${qtdSuprimentos || 1}x)\n`;
    }
    if (totalSangrias > 0) {
      txt += `• 🏦 Sangrias / Retiradas: ${financialEngine.formatarMoeda(totalSangrias)} (${qtdSangrias || 1}x)\n`;
    }
    txt += `\n`;
  }

  if (statusConferencia === 'quebra') {
    txt += `⚠️ *Conferência Cega:* Quebra de ${financialEngine.formatarMoeda(Math.abs(diferenca))}\n\n`;
  } else if (statusConferencia === 'sobra') {
    txt += `ℹ️ *Conferência Cega:* Sobra de ${financialEngine.formatarMoeda(diferenca)}\n\n`;
  } else if (statusConferencia === 'conferido') {
    txt += `✅ *Conferência Cega:* Valores 100% conciliados!\n\n`;
  }

  txt += `📊 *QUEBRA POR ORIGEM:*\n`;
  txt += `• 📱 *WhatsApp:* ${resumoOrigem.qtdWhatsapp || 0} lançamentos (${financialEngine.formatarMoeda(resumoOrigem.totalWhatsapp || 0)})\n`;
  txt += `• 💻 *Web / Balcão:* ${resumoOrigem.qtdWeb || 0} lançamentos (${financialEngine.formatarMoeda(resumoOrigem.totalWeb || 0)})\n`;
  if (resumoOrigem.qtdEstornados > 0) {
    txt += `• ↩️ *Estornos Realizados:* ${resumoOrigem.qtdEstornados} (${financialEngine.formatarMoeda(resumoOrigem.totalEstornados || 0)})\n`;
  }
  txt += `\n`;

  txt += `💳 *MEIOS DE PAGAMENTO:*\n`;
  const formasValidas = [
    { k: 'pix', l: 'Pix' },
    { k: 'dinheiro', l: 'Dinheiro' },
    { k: 'cartao_credito', l: 'Cartão de Crédito' },
    { k: 'cartao_debito', l: 'Cartão de Débito' },
    { k: 'boleto', l: 'Boleto' },
    { k: 'transferencia', l: 'Transferência' }
  ];

  let temForma = false;
  formasValidas.forEach(({ k, l }) => {
    const val = totaisPorForma[k];
    if (val !== undefined && Math.abs(val) > 0) {
      txt += `• ${l}: ${financialEngine.formatarMoeda(val)}\n`;
      temForma = true;
    }
  });
  if (!temForma) {
    txt += `• Em espécie / Saldo consolidado\n`;
  }

  txt += `─────────────────────────\n`;
  txt += isParcial ? `_Status: Caixa em operação._` : `_Status: Turno encerrado e imutável._`;

  return txt;
}

/**
 * Computa o resumo / fechamento parcial do turno de caixa atualmente aberto
 */
function obterResumoFechamentoParcial(state = {}, tenantId = 'default') {
  const caixaAberto = obterCaixaAberto(state, tenantId);
  if (!caixaAberto) {
    return { ok: false, code: 'CAIXA_FECHADO', error: 'Não há nenhum turno de caixa aberto no momento.' };
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
  const resumoOrigem = {
    totalWhatsapp: 0,
    qtdWhatsapp: 0,
    totalWeb: 0,
    qtdWeb: 0,
    totalEstornados: 0,
    qtdEstornados: 0
  };

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

    if (m.estornado) {
      resumoOrigem.qtdEstornados++;
      resumoOrigem.totalEstornados = arredondar(resumoOrigem.totalEstornados + val);
    }
    if (m.origem === 'whatsapp') {
      resumoOrigem.qtdWhatsapp++;
      resumoOrigem.totalWhatsapp = arredondar(resumoOrigem.totalWhatsapp + val);
    } else {
      resumoOrigem.qtdWeb++;
      resumoOrigem.totalWeb = arredondar(resumoOrigem.totalWeb + val);
    }
  }

  const saldoInicial = Number(caixaAberto.saldoInicial) || 0;
  const saldoEsperado = arredondar(saldoInicial + totalEntradas - totalSaidas);
  const agoraInfo = financialEngine.obterAgoraSP();

  const boletimTexto = formatarBoletimFechamentoWhatsapp({
    caixaId: caixaAberto.id,
    operadorNome: caixaAberto.abertoPorNome || caixaAberto.abertoPor || 'Operador',
    saldoInicial,
    totalEntradas,
    totalSaidas,
    totalSangrias,
    qtdSangrias,
    totalSuprimentos,
    qtdSuprimentos,
    saldoEsperado,
    diferenca: 0,
    statusConferencia: 'parcial',
    resumoOrigem,
    totaisPorForma,
    dataFechamento: agoraInfo.dataBR,
    horaFechamento: agoraInfo.horaBR,
    isParcial: true
  });

  return {
    ok: true,
    caixa: caixaAberto,
    saldoInicial,
    totalEntradas,
    totalSaidas,
    totalSangrias,
    qtdSangrias,
    totalSuprimentos,
    qtdSuprimentos,
    saldoAtual: saldoEsperado,
    resumoOrigem,
    totaisPorForma,
    resumoTextoWhatsapp: boletimTexto
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

/**
 * Exporta movimentações financeiras em formato CSV ou JSON com cálculo de hash SHA-256
 */
function exportarMovimentacoesContabeis(state = {}, opcoes = {}) {
  const formato = String(opcoes.formato || 'csv').toLowerCase();
  const crypto = require('crypto');

  // Utiliza listarMovimentacoes com filtros aplicados
  const resultado = listarMovimentacoes(state, {
    ...opcoes,
    limit: opcoes.limit || 5000
  });

  const movs = resultado.movimentacoes || [];

  if (formato === 'json') {
    const payloadJson = {
      exportadoEm: new Date().toISOString(),
      totalRegistros: movs.length,
      resumoOrigem: resultado.resumoOrigem,
      resumoMeiosPagamento: resultado.resumoMeiosPagamento,
      movimentacoes: movs
    };
    const jsonStr = JSON.stringify(payloadJson, null, 2);
    const sha256 = crypto.createHash('sha256').update(jsonStr, 'utf8').digest('hex');
    payloadJson.integridade = {
      algoritmo: 'sha256',
      sha256
    };
    return {
      formato: 'json',
      mimeType: 'application/json',
      conteudo: JSON.stringify(payloadJson, null, 2),
      sha256,
      totalRegistros: movs.length
    };
  }

  // Formato CSV com BOM UTF-8 (\uFEFF)
  // Cabeçalho: ID;DataHora;Tipo;Natureza;Valor;MeioPagamento;Origem;OS;Placa;Autor;StatusEstorno;Descricao
  const cabecalho = 'ID;DataHora;Tipo;Natureza;Valor;MeioPagamento;Origem;OS;Placa;Autor;StatusEstorno;Descricao';
  const linhas = [cabecalho];

  for (const m of movs) {
    const id = m.id || '';
    const dataHora = m.dataHora || m.criadoEm || (m.data ? `${m.data}T00:00:00Z` : '');
    const tipo = m.tipo || '';
    const natureza = m.naturezaOperacao || m.subtipo || 'operacional';
    const valor = Number(m.valor || 0).toFixed(2);
    const meio = m.forma || m.formaPagamento || 'dinheiro';
    const origem = m.origem || 'sistema';
    const os = m.osId || '';
    const placa = m.placa || '';
    const autor = m.autorNumero || m.operador || '';
    const statusEstorno = m.estornado ? 'ESTORNADO' : (m.estornoDeId || m.subtipo === 'estorno' ? 'COMPENSATORIO' : 'ATIVO');
    const desc = (m.desc || m.descricao || '').replace(/[;\r\n]/g, ' ').trim();

    linhas.push(`${id};${dataHora};${tipo};${natureza};${valor};${meio};${origem};${os};${placa};${autor};${statusEstorno};"${desc}"`);
  }

  const csvContent = '\uFEFF' + linhas.join('\r\n');
  const sha256 = crypto.createHash('sha256').update(csvContent, 'utf8').digest('hex');

  return {
    formato: 'csv',
    mimeType: 'text/csv; charset=utf-8',
    conteudo: csvContent,
    sha256,
    totalRegistros: movs.length
  };
}

/**
 * Consolida o DRE Operacional Simplificado delegando para o motor centralizado
 */
function calcularDRESimplificado(state = {}, options = {}) {
  return financialEngine.calcularDRESimplificado(state, options);
}

function gerarTextoCobrancaOS(state = {}, osId, options = {}) {
  const osNorm = String(osId || '').replace(/^#/, '').trim();
  const resumoOS = obterResumoFinanceiroOS(state, osNorm, options);
  return financialEngine.gerarTextoCobrancaOS(state, osNorm, {
    totalOrcado: resumoOS.totalOrcado,
    saldoRestante: resumoOS.saldoRestante,
    clienteNome: resumoOS.cliente,
    resumoOS,
    ...options
  });
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
  normalizarTipoMovimentacao,
  projetarMovimentacao,
  projetarCaixa,
  listarMovimentacoes,
  estornarMovimentacao,
  formatarBoletimFechamentoWhatsapp,
  obterResumoFechamentoParcial,
  obterResumoFinanceiroOS,
  exportarMovimentacoesContabeis,
  faturarSaldoOS,
  liquidarTituloFinanceiro,
  validarOuAutorizarSaidaPatioOS,
  calcularDRESimplificado,
  gerarTextoCobrancaOS
};

