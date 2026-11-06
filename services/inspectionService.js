'use strict';

/**
 * Pátio CRM — Serviço de Inspeção Técnica e Laudos de Pátio
 * Fachada Modular (< 50 lines).
 *
 * Submódulos:
 * - services/inspection/inspectionCrud.js: Criação, listagem, encerramento e auditoria de inspeções
 * - services/inspection/inspectionItems.js: Itens avaliados, fotos, laudos humanos e NLU de voz
 */

const {
  criarInspecao,
  obterInspecao,
  listarInspecoes,
  concluirInspecao,
  cancelarInspecao
} = require('./inspection/inspectionCrud');

const {
  adicionarItemInspecao,
  confirmarDiagnosticoHumano,
  adicionarFotoItem,
  adicionarServicoRecomendado,
  estruturarInspecaoPorVoz
} = require('./inspection/inspectionItems');

module.exports = {
  criarInspecao,
  obterInspecao,
  listarInspecoes,
  adicionarItemInspecao,
  confirmarDiagnosticoHumano,
  adicionarFotoItem,
  adicionarServicoRecomendado,
  concluirInspecao,
  cancelarInspecao,
  estruturarInspecaoPorVoz
};
