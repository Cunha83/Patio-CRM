'use strict';

/**
 * Fachada Modular do Motor de Inteligência Operacional de Pátio
 * Limite Modular: <= 350 linhas.
 */

const {
  calcularHorasPassadas
} = require('./intelligence/intelligenceHelpers');

const {
  avaliarOperacao,
  reconhecerEvento,
  listarEventos,
  obterEvento
} = require('./intelligence/intelligenceLifecycle');

module.exports = {
  avaliarOperacao,
  avaliarEventosOperacionais: avaliarOperacao,
  reconhecerEvento,
  listarEventos,
  obterEvento,
  calcularHorasPassadas
};
