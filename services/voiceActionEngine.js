'use strict';

/**
 * services/voiceActionEngine.js - Fachada Central do Motor de Voz
 * Padrão Facade / Re-export (< 100 linhas).
 * Conserva rigorosamente todos os contratos e assinaturas públicas.
 */

const {
  consumirAcaoPendente,
  abortarConfirmacaoAcao,
  buscarTokenPendente
} = require('./voice/voiceSecurity');

const {
  normalizarKm,
  normalizarPlaca
} = require('./voice/voiceRulesHelpers');

const {
  interpretarPorRegras
} = require('./voice/voiceRulesInterpreter');

const {
  interpretarComando
} = require('./voice/voiceAIInterpreter');

const {
  executarAcao
} = require('./voice/voiceActionDispatcher');

/**
 * Função principal pública: recebe entrada, processa e executa
 */
async function interpretarEExecutar({ input, context = {}, state = {}, aiClient = null }) {
  const interpretado = await interpretarComando({ input, context, state, aiClient });
  const resultadoExecucao = await executarAcao({ interpretado, input, context, state });

  return {
    ...resultadoExecucao,
    interpretado
  };
}

module.exports = {
  interpretarEExecutar,
  processarComandoVoz: async ({ texto, input, context, state, tenantId }) =>
    interpretarEExecutar({ input: texto || input, context: { ...(context || {}), tenantId }, state }),
  interpretarComando,
  interpretarPorRegras,
  executarAcao,
  consumirAcaoPendente,
  abortarConfirmacaoAcao,
  buscarTokenPendente,
  normalizarKm,
  normalizarPlaca
};
