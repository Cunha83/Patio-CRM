'use strict';

/**
 * PÁTIO CRM — CAMADA DE INTEGRAÇÃO COM ERP EXTERNO (FISCAL & CONTÁBIL)
 * Fachada Modular (< 70 linhas).
 *
 * Submódulos:
 * - services/erp/erpExportCanonical.js: Exportação canônica (clientes, fornecedores, peças, OS, contas, pedidos)
 * - services/erp/erpOutboxQueue.js: Fila Outbox, concorrência atômica, lease e reprocessamento
 */

const {
  SCHEMA_VERSION,
  exportarClientes,
  exportarFornecedores,
  exportarPecas,
  exportarOrdensServico,
  exportarContas,
  exportarPedidosCompra
} = require('./erp/erpExportCanonical');

const {
  enfileirarParaERP,
  registrarSincronizacao,
  obterStatusIntegracao,
  listarItensOutbox,
  reprocessarItemOutbox,
  adquirirProximoItemOutbox,
  finalizarItemOutbox,
  processarFilaOutbox
} = require('./erp/erpOutboxQueue');

module.exports = {
  SCHEMA_VERSION,
  exportarClientes,
  exportarFornecedores,
  exportarPecas,
  exportarOrdensServico,
  exportarContas,
  exportarPedidosCompra,
  enfileirarParaERP,
  registrarSincronizacao,
  obterStatusIntegracao,
  listarItensOutbox,
  reprocessarItemOutbox,
  adquirirProximoItemOutbox,
  finalizarItemOutbox,
  processarFilaOutbox
};
