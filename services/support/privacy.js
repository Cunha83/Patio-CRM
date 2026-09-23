'use strict';

// Redução de dados: não é uma garantia de anonimização de texto livre.
function sanitize(value) {
  return String(value)
    .replace(/\b(?:https?:\/\/|www\.)\S+/gi, '[link removido]')
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[e-mail removido]')
    .replace(/\b(?:senha|password|token|api[_ -]?key|chave de api)\s*[:=]\s*\S+/gi, '[credencial removida]')
    .replace(/\b(?:AIza[\w-]{20,}|sk-[\w-]{12,}|eyJ[\w-]+\.[\w-]+\.[\w-]+)\b/g, '[credencial removida]')
    .replace(/\b(?:\d[\s.()\/-]*){8,}\d\b/g, '[número pessoal removido]')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
}

function messageText(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 4000) {
    const error = new Error('Escreva uma mensagem de 1 a 4.000 caracteres.');
    error.status = 400;
    throw error;
  }
  return sanitize(value.trim());
}

module.exports = { sanitize, messageText };
