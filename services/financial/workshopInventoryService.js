'use strict';

const { arredondar, agoraISO } = require('./financialHelpers');

/**
 * 6.1.1 listarEstoquePecas
 * Lista itens do catálogo de peças e calcula resumo operacional de estoque
 */
function listarEstoquePecas(state = {}, filtro = {}) {
  if (!Array.isArray(state.estoque) && !Array.isArray(state.pecas)) {
    state.estoque = [
      { id: 'pec_01', codigo: 'MOL-01', nome: 'Feixe de Mola Dianteiro', quantidade: 5, estoqueMinimo: 2, custoUnitario: 350.00, precoVenda: 580.00 },
      { id: 'pec_02', codigo: 'LON-02', nome: 'Jogo Lona de Freio Traseira', quantidade: 8, estoqueMinimo: 3, custoUnitario: 140.00, precoVenda: 260.00 },
      { id: 'pec_03', codigo: 'FIL-03', nome: 'Filtro de Óleo Diesel', quantidade: 12, estoqueMinimo: 4, custoUnitario: 65.00, precoVenda: 120.00 },
      { id: 'pec_04', codigo: 'TER-04', nome: 'Terminal de Direção', quantidade: 3, estoqueMinimo: 2, custoUnitario: 95.00, precoVenda: 180.00 },
      { id: 'pec_05', codigo: 'BUC-05', nome: 'Bucha Barra Estabilizadora', quantidade: 1, estoqueMinimo: 3, custoUnitario: 30.00, precoVenda: 65.00 }
    ];
  } else if (Array.isArray(state.estoque) && state.estoque.length === 0 && (!Array.isArray(state.pecas) || state.pecas.length === 0)) {
    state.estoque.push(
      { id: 'pec_01', codigo: 'MOL-01', nome: 'Feixe de Mola Dianteiro', quantidade: 5, estoqueMinimo: 2, custoUnitario: 350.00, precoVenda: 580.00 },
      { id: 'pec_02', codigo: 'LON-02', nome: 'Jogo Lona de Freio Traseira', quantidade: 8, estoqueMinimo: 3, custoUnitario: 140.00, precoVenda: 260.00 },
      { id: 'pec_03', codigo: 'FIL-03', nome: 'Filtro de Óleo Diesel', quantidade: 12, estoqueMinimo: 4, custoUnitario: 65.00, precoVenda: 120.00 },
      { id: 'pec_04', codigo: 'TER-04', nome: 'Terminal de Direção', quantidade: 3, estoqueMinimo: 2, custoUnitario: 95.00, precoVenda: 180.00 },
      { id: 'pec_05', codigo: 'BUC-05', nome: 'Bucha Barra Estabilizadora', quantidade: 1, estoqueMinimo: 3, custoUnitario: 30.00, precoVenda: 65.00 }
    );
  }

  const listaOriginal = Array.isArray(state.estoque) && state.estoque.length > 0 ? state.estoque : (Array.isArray(state.pecas) ? state.pecas : []);

  const pecasNormalizadas = listaOriginal.map((p, idx) => {
    const id = p.id || p.codigo || `pec_${idx + 1}`;
    const codigo = p.codigo || p.cod || id;
    const nome = p.nome || p.descricao || p.desc || 'Peça Sem Nome';
    const quantidade = Number(p.quantidade != null ? p.quantidade : (p.qtd != null ? p.qtd : (p.estoque != null ? p.estoque : 0)));
    const estoqueMinimo = Number(p.estoqueMinimo != null ? p.estoqueMinimo : (p.min != null ? p.min : (p.estoqueMin != null ? p.estoqueMin : 2)));
    const custoUnitario = Number(p.custoUnitario != null ? p.custoUnitario : (p.custo != null ? p.custo : (p.custoMedio != null ? p.custoMedio : 0)));
    const precoVenda = Number(p.precoVenda != null ? p.precoVenda : (p.preco != null ? p.preco : (p.valor != null ? p.valor : (custoUnitario ? custoUnitario * 1.5 : 0))));

    return {
      id,
      codigo,
      nome,
      quantidade,
      estoqueMinimo,
      custoUnitario: arredondar(custoUnitario),
      precoVenda: arredondar(precoVenda),
      statusEstoque: quantidade <= 0 ? 'zerado' : (quantidade <= estoqueMinimo ? 'critico' : 'normal')
    };
  });

  let itensFiltrados = pecasNormalizadas;
  const termo = (filtro.termo || '').trim().toLowerCase();
  if (termo) {
    itensFiltrados = itensFiltrados.filter(p =>
      p.nome.toLowerCase().includes(termo) ||
      p.codigo.toLowerCase().includes(termo) ||
      String(p.id).toLowerCase().includes(termo)
    );
  }

  if (filtro.apenasCriticos) {
    itensFiltrados = itensFiltrados.filter(p => p.quantidade <= p.estoqueMinimo);
  }

  const totalItens = pecasNormalizadas.length;
  const itensAbaixoMinimo = pecasNormalizadas.filter(p => p.quantidade <= p.estoqueMinimo).length;
  const valorTotalCusto = arredondar(pecasNormalizadas.reduce((acc, p) => acc + (p.quantidade * p.custoUnitario), 0));
  const saldoTotalPecas = pecasNormalizadas.reduce((acc, p) => acc + p.quantidade, 0);

  return {
    sucesso: true,
    pecas: itensFiltrados,
    resumoEstoque: {
      totalItens,
      itensAbaixoMinimo,
      valorTotalCusto,
      saldoTotalPecas
    }
  };
}

/**
 * 6.1.2 requisitarPecaOS
 * Requisita peça para a OS, com validação de saldo no estoque (409 se insuficiente),
 * dedução de estoque, inclusão em os.pecasUtilizadas e recálculo de totais.
 */
function requisitarPecaOS(state = {}, payload = {}) {
  const { osId, pecaIdOuNome, quantidade = 1, valorUnitario, operador = 'Operador' } = payload;
  if (!osId) {
    const err = new Error('ID da Ordem de Serviço é obrigatório.');
    err.status = 400;
    err.statusCode = 400;
    throw err;
  }

  const qtdSolicitada = Number(quantidade) || 1;
  if (qtdSolicitada <= 0) {
    const err = new Error('Quantidade solicitada deve ser maior que zero.');
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

  listarEstoquePecas(state);
  const catalogo = Array.isArray(state.estoque) && state.estoque.length > 0 ? state.estoque : (Array.isArray(state.pecas) ? state.pecas : []);

  const busca = String(pecaIdOuNome || '').trim().toLowerCase();
  let pecaEncontrada = catalogo.find(p =>
    String(p.id || '').toLowerCase() === busca ||
    String(p.codigo || p.cod || '').toLowerCase() === busca ||
    String(p.nome || p.descricao || p.desc || '').toLowerCase() === busca ||
    String(p.nome || p.descricao || p.desc || '').toLowerCase().includes(busca)
  );

  let precoUnit = valorUnitario != null ? Number(valorUnitario) : null;

  if (pecaEncontrada) {
    const saldoAtual = Number(pecaEncontrada.quantidade != null ? pecaEncontrada.quantidade : (pecaEncontrada.qtd != null ? pecaEncontrada.qtd : (pecaEncontrada.qtdAtual != null ? pecaEncontrada.qtdAtual : 0)));
    if (saldoAtual < qtdSolicitada) {
      const nomePeca = pecaEncontrada.nome || pecaEncontrada.descricao || pecaEncontrada.id;
      const err = new Error(`Estoque insuficiente para a peça "${nomePeca}". Solicitado: ${qtdSolicitada}, Disponível: ${saldoAtual}.`);
      err.status = 409;
      err.statusCode = 409;
      err.code = 'ESTOQUE_INSUFICIENTE';
      throw err;
    }

    const novoSaldo = saldoAtual - qtdSolicitada;
    if (pecaEncontrada.quantidade != null) pecaEncontrada.quantidade = novoSaldo;
    if (pecaEncontrada.qtd != null) pecaEncontrada.qtd = novoSaldo;
    if (pecaEncontrada.qtdAtual != null) pecaEncontrada.qtdAtual = novoSaldo;
    if (pecaEncontrada.estoque != null) pecaEncontrada.estoque = novoSaldo;

    if (precoUnit == null) {
      precoUnit = Number(pecaEncontrada.precoVenda != null ? pecaEncontrada.precoVenda : (pecaEncontrada.preco != null ? pecaEncontrada.preco : (pecaEncontrada.valor != null ? pecaEncontrada.valor : (pecaEncontrada.custoUnitario || 0))));
    }
  } else {
    if (precoUnit == null) precoUnit = 0;
  }

  const subtotal = arredondar(qtdSolicitada * precoUnit);
  const itemRequisitado = {
    id: pecaEncontrada ? (pecaEncontrada.id || pecaEncontrada.codigo) : `pec_avulsa_${Date.now()}`,
    pecaId: pecaEncontrada ? pecaEncontrada.id : null,
    codigo: pecaEncontrada ? (pecaEncontrada.codigo || pecaEncontrada.cod || pecaEncontrada.id) : 'AVULSO',
    nome: pecaEncontrada ? (pecaEncontrada.nome || pecaEncontrada.descricao || pecaEncontrada.desc) : String(pecaIdOuNome || 'Peça Avulsa').trim(),
    quantidade: qtdSolicitada,
    valorUnitario: arredondar(precoUnit),
    subtotal,
    requisicaoEm: agoraISO(),
    operador: typeof operador === 'object' ? (operador.nome || operador.actorId || 'Operador') : operador
  };

  if (!Array.isArray(osAlvo.pecasUtilizadas)) {
    osAlvo.pecasUtilizadas = [];
  }
  osAlvo.pecasUtilizadas.push(itemRequisitado);

  if (Array.isArray(osAlvo.pecas)) {
    osAlvo.pecas.push({
      id: itemRequisitado.id,
      cod: itemRequisitado.codigo,
      nome: itemRequisitado.nome,
      qtd: itemRequisitado.quantidade,
      valor: itemRequisitado.valorUnitario,
      total: itemRequisitado.subtotal
    });
  }

  osAlvo.totalPecas = arredondar((osAlvo.pecasUtilizadas || []).reduce((acc, p) => acc + (p.subtotal || 0), 0));

  if (!Array.isArray(osAlvo.historicoPatio)) {
    osAlvo.historicoPatio = [];
  }
  osAlvo.historicoPatio.push({
    dataHora: agoraISO(),
    tipo: 'requisicao_peca',
    descricao: `Requisição de ${qtdSolicitada}x ${itemRequisitado.nome} (Subtotal: R$ ${subtotal.toFixed(2)})`,
    operador: itemRequisitado.operador
  });

  return {
    sucesso: true,
    osId: osAlvo.id,
    osNum: osAlvo.num || osAlvo.id,
    peca: itemRequisitado,
    saldoEstoqueRestante: pecaEncontrada ? (pecaEncontrada.quantidade != null ? pecaEncontrada.quantidade : pecaEncontrada.qtd) : null,
    totalPecasOS: osAlvo.totalPecas,
    pecasUtilizadas: osAlvo.pecasUtilizadas
  };
}

/**
 * 6.1.3 liberarGargaloPecaOS
 * Desbloqueia gargalo quando a peça chega para uma OS pausada:
 * restaura etapaPatio = 'em_execucao', limpa motivoPausa e restaura status do box para 'ocupado'.
 */
function liberarGargaloPecaOS(state = {}, payload = {}) {
  const { osId, observacao, operador = 'Operador' } = payload;
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

  osAlvo.etapaPatio = 'em_execucao';
  if (osAlvo.st === 'peca') {
    osAlvo.st = 'executando';
  }
  const motivoAnterior = osAlvo.motivoPausa;
  osAlvo.motivoPausa = null;
  osAlvo.desbloqueadoEm = agoraISO();

  let boxAlvo = null;
  const boxId = osAlvo.boxId || osAlvo.box;
  if (boxId && Array.isArray(state.boxes)) {
    boxAlvo = state.boxes.find(b => b.id === boxId);
    if (boxAlvo && (boxAlvo.status === 'bloqueado_peca' || boxAlvo.status === 'livre')) {
      boxAlvo.status = 'ocupado';
      boxAlvo.osId = osAlvo.id;
    }
  }

  if (!Array.isArray(osAlvo.historicoPatio)) {
    osAlvo.historicoPatio = [];
  }
  const nomeOperador = typeof operador === 'object' ? (operador.nome || operador.actorId || 'Operador') : operador;
  osAlvo.historicoPatio.push({
    dataHora: agoraISO(),
    tipo: 'liberacao_gargalo_peca',
    descricao: observacao || `Peça recebida / gargalo liberado (motivo anterior: ${motivoAnterior || 'Aguardando peças'})`,
    operador: nomeOperador
  });

  return {
    sucesso: true,
    osId: osAlvo.id,
    osNum: osAlvo.num || osAlvo.id,
    etapaPatio: osAlvo.etapaPatio,
    st: osAlvo.st,
    boxId: boxAlvo ? boxAlvo.id : (boxId || null),
    boxStatus: boxAlvo ? boxAlvo.status : null,
    mensagem: `Gargalo da OS #${osAlvo.num || osAlvo.id} liberado! Box ${boxAlvo ? boxAlvo.nome || boxAlvo.id : 'N/A'} ativo em execução.`
  };
}

module.exports = {
  listarEstoquePecas,
  requisitarPecaOS,
  liberarGargaloPecaOS
};
