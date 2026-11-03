'use strict';

const financialEngine = require('../financialEngine');
const {
  gerarId,
  arredondar,
  obterCaixaAberto,
  projetarMovimentacao,
  projetarCaixa
} = require('./financialHelpers');

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
    tituloVinculado.status = 'pendente';
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
    const { obterResumoFinanceiroOS } = require('./billingAndSettlementService');
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

module.exports = {
  estornarMovimentacao
};
