'use strict';

const procurementRequirements = require('./procurement/procurementRequirements');
const procurementQuotes = require('./procurement/procurementQuotes');
const procurementOrders = require('./procurement/procurementOrders');
const procurementReceiving = require('./procurement/procurementReceiving');

module.exports = {
  // Inicialização e Gestão de Necessidades
  garantirColecoesCompras: procurementRequirements.garantirColecoesCompras,
  listarNecessidadesCompra: procurementRequirements.listarNecessidadesCompra,
  gerarNecessidadeCompra: procurementRequirements.gerarNecessidadeCompra,

  // Cotações e Comparativo
  criarCotacao: procurementQuotes.criarCotacao,
  registrarRespostaFornecedor: procurementQuotes.registrarRespostaFornecedor,
  compararCotacoes: procurementQuotes.compararCotacoes,

  // Pedidos de Compra e Alçada
  criarPedidoCompra: procurementOrders.criarPedidoCompra,
  aprovarPedidoCompra: procurementOrders.aprovarPedidoCompra,
  cancelarPedidoCompra: procurementOrders.cancelarPedidoCompra,

  // Recebimento e Reserva Prioritária para OS
  receberPedidoCompra: procurementReceiving.receberPedidoCompra
};
