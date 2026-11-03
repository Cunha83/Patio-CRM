'use strict';

/**
 * PÁTIO CRM — WhatsApp Handlers (Fachada / Facade)
 *
 * Módulo refatorado para manter integridade contratual pública estrita (< 350 linhas).
 * Orquestra e reexporta os manipuladores especializados de:
 *   - handlers/whatsappHelpers.js
 *   - handlers/whatsappSecurity.js
 *   - handlers/whatsappDocumentParser.js
 *   - handlers/whatsappMessageProcessor.js
 *   - handlers/whatsappInboundHandler.js
 */

const {
  formatarMoeda,
  formatarDataBR,
  extrairValorMonetario,
  extrairTelefoneDeJid
} = require('./handlers/whatsappHelpers');

const {
  rateLimitMap,
  mensagensProcessadas,
  confirmacoesPendentes,
  execucoesEmAndamento,
  verificarRateLimit,
  auditarComandoWhatsApp,
  verificarIdempotencia,
  registrarIdempotencia,
  obterPerfilNumeroWhatsApp,
  podeExecutarEscritaFinanceira,
  podeExecutarEstorno
} = require('./handlers/whatsappSecurity');

const {
  extrairDadosDocumentoHeuristico,
  analisarDocumentoWhatsApp
} = require('./handlers/whatsappDocumentParser');

const {
  processarMensagemTexto
} = require('./handlers/whatsappMessageProcessor');

const {
  tratarMensagemWhatsApp
} = require('./handlers/whatsappInboundHandler');

module.exports = {
  formatarMoeda,
  formatarDataBR,
  extrairDadosDocumentoHeuristico,
  analisarDocumentoWhatsApp,
  processarMensagemTexto,
  tratarMensagemWhatsApp,
  verificarRateLimit,
  auditarComandoWhatsApp,
  rateLimitMap,
  mensagensProcessadas,
  confirmacoesPendentes,
  execucoesEmAndamento,
  verificarIdempotencia,
  registrarIdempotencia,
  extrairValorMonetario,
  extrairTelefoneDeJid,
  obterPerfilNumeroWhatsApp,
  podeExecutarEscritaFinanceira,
  podeExecutarEstorno
};
