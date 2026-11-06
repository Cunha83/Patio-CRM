'use strict';

/**
 * PÁTIO CRM — SERVIÇO DE CONFORMIDADE LGPD
 * Fachada Modular (< 50 linhas).
 *
 * Submódulos:
 * - services/lgpd/lgpdExport.js: Exportação de dados e consulta fiscal vinculada
 * - services/lgpd/lgpdAnonymize.js: Anonimização de dados do titular
 */

const {
  mascararDocumento,
  validarCampoMonetario,
  exportarDadosCliente,
  exportarDadosClienteAsync
} = require('./lgpd/lgpdExport');

const { anonimizarDadosCliente } = require('./lgpd/lgpdAnonymize');

module.exports = {
  exportarDadosCliente,
  exportarDadosClienteAsync,
  anonimizarDadosCliente,
  mascararDocumento,
  validarCampoMonetario
};
