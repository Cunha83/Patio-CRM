'use strict';

const crypto = require('crypto');

const TOKEN_SECRET = process.env.TOKEN_SECRET || crypto.randomBytes(32).toString('hex');
const consumedTokens = new Map(); // tokenId -> expiraEm
const inFlightTokens = new Map(); // tokenId -> expiraEm (reserva atômica de concorrência)

// Limpeza de tokens consumidos e em trânsito expirados (evita vazamento de memória)
setInterval(() => {
  const agora = Date.now();
  for (const [id, exp] of consumedTokens) {
    if (agora > exp) consumedTokens.delete(id);
  }
  for (const [id, exp] of inFlightTokens) {
    if (agora > exp) inFlightTokens.delete(id);
  }
}, 60 * 1000).unref();

function base64UrlEncode(str) {
  return Buffer.from(str, 'utf8').toString('base64url');
}

function base64UrlDecode(str) {
  return Buffer.from(str, 'base64url').toString('utf8');
}

function sign(payloadStr) {
  return crypto.createHmac('sha256', TOKEN_SECRET).update(payloadStr).digest('base64url');
}

function gerarTokenAcao({ tenantId, actorId, resourceId, action, version, ttlMs = 5 * 60 * 1000 }) {
  if (!tenantId || !actorId || !resourceId || !action) {
    throw new Error('Todos os parâmetros (tenantId, actorId, resourceId, action) são obrigatórios para gerar o token.');
  }

  const payload = {
    jti: 'tok_' + crypto.randomUUID(),
    tenantId: String(tenantId),
    actorId: String(actorId),
    resourceId: String(resourceId),
    action: String(action),
    version: Number(version || 0),
    exp: Date.now() + ttlMs
  };

  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = sign(encodedPayload);
  return `${encodedPayload}.${signature}`;
}

function validarTokenAcao(tokenString, expected = {}) {
  if (!tokenString || typeof tokenString !== 'string') {
    return { ok: false, error: 'Token de confirmação ausente ou malformado.' };
  }

  const parts = tokenString.split('.');
  if (parts.length !== 2) {
    return { ok: false, error: 'Formato de token inválido.' };
  }

  const [encodedPayload, signature] = parts;
  const expectedSig = sign(encodedPayload);
  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return { ok: false, error: 'Assinatura do token de confirmação inválida.' };
  }

  let payload;
  try {
    payload = JSON.parse(base64UrlDecode(encodedPayload));
  } catch (_) {
    return { ok: false, error: 'Payload do token corrompido.' };
  }

  // 1. Verificação de Expiração
  if (Date.now() > payload.exp) {
    return { ok: false, error: 'Token de confirmação expirado. Solicite uma nova confirmação.' };
  }

  // 2. Proteção Anti-Replay: uso estritamente único
  if (consumedTokens.has(payload.jti)) {
    return { ok: false, error: 'Token já utilizado anteriormente. Ação duplicada rejeitada.' };
  }

  // 3. Verificação de Tenant
  if (expected.tenantId && payload.tenantId !== expected.tenantId) {
    return { ok: false, error: 'Violação de isolamento: token pertence a outro tenant.' };
  }

  // 4. Verificação de Ator / Operador
  if (expected.actorId && payload.actorId !== expected.actorId) {
    return { ok: false, error: 'Ação só pode ser confirmada pelo mesmo operador que a solicitou.' };
  }

  // 5. Verificação de Recurso Alvo (ex.: osId)
  if (expected.resourceId && payload.resourceId !== expected.resourceId) {
    return { ok: false, error: 'Token não corresponde ao recurso informado na requisição.' };
  }

  // 6. Verificação de Ação Pretendida
  if (expected.action && payload.action !== expected.action) {
    return { ok: false, error: 'Ação do token diverge da operação solicitada.' };
  }

  // 7. Verificação de Versão / Concorrência
  if (expected.version !== undefined && payload.version !== Number(expected.version)) {
    return { ok: false, error: 'O estado do sistema mudou desde a geração do token. Operação abortada.' };
  }

  return {
    ok: true,
    payload
  };
}

function reservarTokenAcao(tokenString, expected = {}) {
  const v = validarTokenAcao(tokenString, expected);
  if (!v.ok) return v;

  const jti = v.payload.jti;
  if (inFlightTokens.has(jti)) {
    return {
      ok: false,
      concorrencia: true,
      error: 'Token já está em processamento concorrente por outra requisição.'
    };
  }

  inFlightTokens.set(jti, v.payload.exp);
  return { ok: true, payload: v.payload };
}

function liberarTokenAcao(tokenString) {
  if (!tokenString || typeof tokenString !== 'string') return;
  const parts = tokenString.split('.');
  if (parts.length !== 2) return;
  try {
    const payload = JSON.parse(base64UrlDecode(parts[0]));
    if (payload && payload.jti) {
      inFlightTokens.delete(payload.jti);
    }
  } catch (_) {}
}

function confirmarConsumoTokenAcao(tokenString, expected = {}) {
  const v = validarTokenAcao(tokenString, expected);
  if (!v.ok) return v;
  inFlightTokens.delete(v.payload.jti);
  consumedTokens.set(v.payload.jti, v.payload.exp);
  return { ok: true, payload: v.payload };
}

function consumirTokenAcao(tokenString, expected = {}) {
  return confirmarConsumoTokenAcao(tokenString, expected);
}

function gerarTokenAprovacaoOrcamento({ tenantId, quotationId, version = 1, customerId = null, ttlMs = 72 * 60 * 60 * 1000 }) {
  if (!tenantId || !quotationId) {
    throw new Error('tenantId e quotationId são obrigatórios para gerar token de aprovação de orçamento.');
  }

  const payload = {
    jti: 'orc_tok_' + crypto.randomUUID(),
    tenantId: String(tenantId),
    quotationId: String(quotationId),
    version: Number(version || 1),
    customerId: customerId ? String(customerId) : null,
    action: 'quotation_approval',
    exp: Date.now() + ttlMs
  };

  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = sign(encodedPayload);
  return `${encodedPayload}.${signature}`;
}

function validarTokenAprovacaoOrcamento(tokenString) {
  if (!tokenString || typeof tokenString !== 'string') {
    return { ok: false, error: 'Token de aprovação ausente ou malformado.' };
  }

  const parts = tokenString.split('.');
  if (parts.length !== 2) {
    return { ok: false, error: 'Formato de token de aprovação inválido.' };
  }

  const [encodedPayload, signature] = parts;
  const expectedSig = sign(encodedPayload);
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig))) {
    return { ok: false, error: 'Assinatura do token de aprovação inválida.' };
  }

  let payload;
  try {
    payload = JSON.parse(base64UrlDecode(encodedPayload));
  } catch (_) {
    return { ok: false, error: 'Payload do token corrompido.' };
  }

  if (Date.now() > payload.exp) {
    return { ok: false, error: 'Este link de orçamento expirou. Solicite um novo link à oficina.', expirado: true };
  }

  if (payload.action !== 'quotation_approval') {
    return { ok: false, error: 'Finalidade do token inválida.' };
  }

  return {
    ok: true,
    payload
  };
}

function consumirTokenAprovacaoOrcamento(tokenString, expected = {}) {
  const validacao = validarTokenAprovacaoOrcamento(tokenString);
  if (!validacao.ok) return validacao;

  const payload = validacao.payload;

  if (consumedTokens.has(payload.jti)) {
    return { ok: false, error: 'Este link de aprovação já foi utilizado anteriormente.', jaConsumido: true };
  }

  if (expected.tenantId && payload.tenantId !== expected.tenantId) {
    return { ok: false, error: 'Violação de isolamento: token pertence a outro tenant.' };
  }

  if (expected.quotationId && payload.quotationId !== expected.quotationId) {
    return { ok: false, error: 'Token não corresponde ao orçamento informado.' };
  }

  if (expected.version !== undefined && payload.version !== Number(expected.version)) {
    return { ok: false, error: 'O orçamento foi alterado para uma nova versão. Utilize o link mais recente.', versaoDivergente: true };
  }

  consumedTokens.set(payload.jti, payload.exp);

  return {
    ok: true,
    payload
  };
}

module.exports = {
  gerarTokenAcao,
  validarTokenAcao,
  reservarTokenAcao,
  liberarTokenAcao,
  confirmarConsumoTokenAcao,
  consumirTokenAcao,
  gerarTokenAprovacaoOrcamento,
  validarTokenAprovacaoOrcamento,
  consumirTokenAprovacaoOrcamento,
  base64UrlEncode,
  base64UrlDecode,
  sign
};

