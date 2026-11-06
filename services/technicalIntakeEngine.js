'use strict';

/**
 * Fachada Modular do Motor de Intake Técnico e Pré-OS (Zero quebra de contrato)
 * Limite Modular: <= 350 linhas.
 */

const {
  localizarSessaoAtiva,
  iniciarIntake
} = require('./intake/intakeSessionManager');

const {
  corrigirCampo,
  responderPergunta
} = require('./intake/intakeLifecycle');

const {
  confirmarIntake,
  cancelarIntake
} = require('./intake/intakeResolution');

const {
  processarMensagem
} = require('./intake/intakeMessageProcessor');

module.exports = {
  localizarSessaoAtiva,
  iniciarIntake,
  responderPergunta,
  corrigirCampo,
  confirmarIntake,
  cancelarIntake,
  processarMensagem
};
