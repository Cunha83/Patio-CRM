'use strict';

const { arredondar, agoraISO } = require('./financialHelpers');

/**
 * 7.1.1 estornarPecaOS
 * Devolve peça requisitada na OS de volta ao estoque físico do almoxarifado,
 * reduzindo o valor total de peças da OS e registrando auditoria/histórico.
 */
function estornarPecaOS(state = {}, payload = {}) {
  const { osId, itemIndexOuPecaId, motivo = 'Devolução ao almoxarifado', operador = 'Operador' } = payload;
  if (!osId) {
    const err = new Error('ID da Ordem de Serviço é obrigatório.');
    err.status = 400;
    err.statusCode = 400;
    throw err;
  }

  const osLista = Array.isArray(state.os) ? state.os : [];
  const osAlvo = osLista.find(o => String(o.id) === String(osId) || String(o.num) === String(osId));
  if (!osAlvo) {
    const err = new Error(`Ordem de serviço "${osId}" não encontrada.`);
    err.status = 404;
    err.statusCode = 404;
    err.code = 'OS_NAO_ENCONTRADA';
    throw err;
  }

  if (!Array.isArray(osAlvo.pecasUtilizadas) || osAlvo.pecasUtilizadas.length === 0) {
    const err = new Error(`A OS #${osAlvo.num || osAlvo.id} não possui peças requisitadas para devolução.`);
    err.status = 404;
    err.statusCode = 404;
    err.code = 'PECA_NAO_ENCONTRADA_NA_OS';
    throw err;
  }

  let indexItem = -1;
  if (typeof itemIndexOuPecaId === 'number') {
    indexItem = itemIndexOuPecaId;
  } else if (itemIndexOuPecaId != null) {
    const busca = String(itemIndexOuPecaId).trim().toLowerCase();
    indexItem = osAlvo.pecasUtilizadas.findIndex(p =>
      String(p.id || '').toLowerCase() === busca ||
      String(p.pecaId || '').toLowerCase() === busca ||
      String(p.codigo || '').toLowerCase() === busca ||
      String(p.nome || '').toLowerCase() === busca ||
      String(p.nome || '').toLowerCase().includes(busca)
    );
  } else {
    indexItem = osAlvo.pecasUtilizadas.length - 1;
  }

  if (indexItem < 0 || indexItem >= osAlvo.pecasUtilizadas.length) {
    const err = new Error(`Peça "${itemIndexOuPecaId}" não encontrada nas peças utilizadas da OS #${osAlvo.num || osAlvo.id}.`);
    err.status = 404;
    err.statusCode = 404;
    err.code = 'PECA_NAO_ENCONTRADA_NA_OS';
    throw err;
  }

  const [itemDevolvido] = osAlvo.pecasUtilizadas.splice(indexItem, 1);

  if (Array.isArray(osAlvo.pecas)) {
    const idxP = osAlvo.pecas.findIndex(p =>
      p.id === itemDevolvido.id ||
      p.cod === itemDevolvido.codigo ||
      p.nome === itemDevolvido.nome
    );
    if (idxP >= 0) osAlvo.pecas.splice(idxP, 1);
  }

  const catalogo = Array.isArray(state.estoque) && state.estoque.length > 0
    ? state.estoque
    : (Array.isArray(state.pecas) ? state.pecas : []);

  let pecaEstoque = catalogo.find(p =>
    (itemDevolvido.pecaId && String(p.id) === String(itemDevolvido.pecaId)) ||
    (itemDevolvido.id && String(p.id) === String(itemDevolvido.id)) ||
    (itemDevolvido.codigo && String(p.codigo || p.cod) === String(itemDevolvido.codigo)) ||
    (itemDevolvido.nome && String(p.nome || p.descricao || p.desc).toLowerCase() === String(itemDevolvido.nome).toLowerCase())
  );

  if (pecaEstoque) {
    const saldoAnterior = Number(pecaEstoque.quantidade != null ? pecaEstoque.quantidade : (pecaEstoque.qtd != null ? pecaEstoque.qtd : 0));
    const novoSaldo = saldoAnterior + Number(itemDevolvido.quantidade || 1);
    if (pecaEstoque.quantidade != null) pecaEstoque.quantidade = novoSaldo;
    if (pecaEstoque.qtd != null) pecaEstoque.qtd = novoSaldo;
    if (pecaEstoque.estoque != null) pecaEstoque.estoque = novoSaldo;
  }

  osAlvo.totalPecas = arredondar((osAlvo.pecasUtilizadas || []).reduce((acc, p) => acc + (p.subtotal || 0), 0));

  if (!Array.isArray(osAlvo.historicoPatio)) {
    osAlvo.historicoPatio = [];
  }
  const nomeOperador = typeof operador === 'object' ? (operador.nome || operador.actorId || 'Operador') : operador;
  osAlvo.historicoPatio.push({
    dataHora: agoraISO(),
    tipo: 'devolucao_peca',
    descricao: `Devolução de ${itemDevolvido.quantidade}x ${itemDevolvido.nome} ao estoque (Motivo: ${motivo})`,
    operador: nomeOperador
  });

  return {
    sucesso: true,
    osId: osAlvo.id,
    osNum: osAlvo.num || osAlvo.id,
    pecaDevolvida: itemDevolvido,
    saldoEstoqueAtual: pecaEstoque ? (pecaEstoque.quantidade != null ? pecaEstoque.quantidade : pecaEstoque.qtd) : null,
    totalPecasOS: osAlvo.totalPecas,
    pecasUtilizadas: osAlvo.pecasUtilizadas
  };
}

module.exports = {
  estornarPecaOS
};
