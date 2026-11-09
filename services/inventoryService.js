'use strict';

const inventoryLedger = require('./inventory/inventoryLedger');
const inventoryCatalog = require('./inventory/inventoryCatalog');
const inventoryReservations = require('./inventory/inventoryReservations');
const inventoryBatchService = require('./inventory/inventoryBatchService');
const inventoryReservationService = require('./inventory/inventoryReservationService');
const inventoryAbcEngine = require('./inventory/inventoryAbcEngine');

module.exports = {
  // Helpers & Ledger
  arredondar: inventoryLedger.arredondar,
  garantirColecoesEstoque: inventoryLedger.garantirColecoesEstoque,
  registrarMovimentacao: inventoryLedger.registrarMovimentacao,
  devolverPecaOS: (params) => inventoryLedger.devolverPecaOS({ ...params, calcularSaldosFn: inventoryCatalog.calcularSaldos }),
  ajustarEstoque: (params) => inventoryLedger.ajustarEstoque({ ...params, calcularSaldosFn: inventoryCatalog.calcularSaldos }),

  // Catálogo & Saldos
  calcularSaldos: inventoryCatalog.calcularSaldos,
  cadastrarPeca: inventoryCatalog.cadastrarPeca,
  atualizarPeca: inventoryCatalog.atualizarPeca,
  obterPeca: inventoryCatalog.obterPeca,
  buscarPecas: inventoryCatalog.buscarPecas,

  // Lotes & Rastreabilidade de Recall
  registrarEntradaLote: inventoryBatchService.registrarEntradaLote,
  alocarLoteConsumo: inventoryBatchService.alocarLoteConsumo,
  rastrearLote: inventoryBatchService.rastrearLote,
  listarLotesPorPeca: inventoryBatchService.listarLotesPorPeca,

  // Reservas Atômicas por OS & Saldos Detalhados (Físico vs. Reservado vs. Disponível)
  obterSaldosDetalhados: inventoryReservationService.obterSaldosDetalhados,
  reservarPecasOS: inventoryReservationService.reservarPecasOS,
  efetivarBaixaOS: inventoryReservationService.efetivarBaixaOS,
  liberarReservaOS: inventoryReservationService.liberarReservaOS,

  // Curva ABC Dinâmica & Ponto de Pedido
  calcularCurvaABC: inventoryAbcEngine.calcularCurvaABC,
  obterSugestoesReposicao: inventoryAbcEngine.obterSugestoesReposicao,

  // Reservas & Consumo Legados
  reservarParaOS: inventoryReservations.reservarParaOS,
  liberarReserva: inventoryReservations.liberarReserva,
  consumirPecaOS: inventoryReservations.consumirPecaOS
};
