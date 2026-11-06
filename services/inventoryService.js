'use strict';

const inventoryLedger = require('./inventory/inventoryLedger');
const inventoryCatalog = require('./inventory/inventoryCatalog');
const inventoryReservations = require('./inventory/inventoryReservations');

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

  // Reservas & Consumo
  reservarParaOS: inventoryReservations.reservarParaOS,
  liberarReserva: inventoryReservations.liberarReserva,
  consumirPecaOS: inventoryReservations.consumirPecaOS
};
