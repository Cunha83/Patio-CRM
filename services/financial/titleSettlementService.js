'use strict';

const { hojeISO, normalizarFormaPagamento, obterCaixaAberto } = require('./financialHelpers');
const { registrarMovimentacao } = require('./cashRegisterService');

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

  const isReceber = titulo.tipo === 'receber';
  const tipoMov = isReceber ? 'entrada' : 'saida';
  const subtipoMov = isReceber ? 'recebimento_titulo' : 'pagamento_titulo';
  const descMov = `Baixa de Título: ${titulo.desc || (isReceber ? 'Recebimento' : 'Pagamento')} (${titulo.parte || 'Geral'})`;

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

module.exports = {
  liquidarTituloFinanceiro
};
