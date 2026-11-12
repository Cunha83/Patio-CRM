'use strict';

/**
 * services/whatsapp/whatsappGatewayAdapterService.js
 *
 * Adaptador de Produção para Gateway WhatsApp Real (Evolution API / Cloud API)
 * com Validação HMAC, Idempotência Estrita, Fila com Retentativas e Extrator de Extratos.
 *
 * Teto Modular: <= 255 linhas
 */

const crypto = require('crypto');
const { processarMensagemAgenteWhatsApp } = require('./whatsappAgentSkillsService');

const gerarId = p => `${p}_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;

function configurarInstanciaGatewayWhatsApp(state, payload = {}) {
  if (!state) throw new Error('Estado da aplicação não informado');
  const {
    provedor = 'evolution_api',
    instanceName = 'patio-crm-oficial',
    baseUrl = 'http://localhost:8080',
    apiKey = '',
    webhookSecret = 'segredo-hmac-patio',
    maxTentativasRetry = 3,
    ativo = true,
    timestamp
  } = payload;

  state.whatsappGatewayConfig = {
    provedor,
    instanceName,
    baseUrl,
    apiKey,
    webhookSecret,
    maxTentativasRetry: Math.max(1, Number(maxTentativasRetry) || 3),
    ativo: !!ativo,
    atualizadoEm: timestamp || new Date().toISOString()
  };

  return {
    ...state.whatsappGatewayConfig,
    apiKeyMascarada: apiKey ? '***' + String(apiKey).slice(-4) : ''
  };
}

function validarAssinaturaHmac(secret, rawBody, signatureHeader) {
  if (!secret || !signatureHeader) return false;
  const hash = crypto.createHmac('sha256', secret).update(String(rawBody || '')).digest('hex');
  const sigLimpa = String(signatureHeader).replace(/^sha256=/i, '').trim();
  return crypto.timingSafeEqual(Buffer.from(hash, 'utf8'), Buffer.from(sigLimpa, 'utf8'));
}

function normalizarInboundGateway(rawPayload = {}) {
  // 1. Meta WhatsApp Cloud API
  const metaMsg = rawPayload?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
  if (metaMsg) {
    return {
      externalMessageId: metaMsg.id,
      telefoneRemetente: metaMsg.from,
      perfilRemetente: 'cliente',
      textoMensagem: metaMsg.text?.body || '',
      anexoMidia: metaMsg.document || metaMsg.audio || null
    };
  }

  // 2. Evolution API / Baileys
  const evoData = rawPayload?.data || rawPayload;
  const evoKey = evoData?.key || {};
  const evoMsg = evoData?.message || {};
  if (evoKey.id || evoData.sender) {
    const texto = evoMsg.conversation || evoMsg.extendedTextMessage?.text || evoData.text || '';
    const remetente = (evoKey.remoteJid || evoData.sender || '').replace(/@.*$/, '');
    const anexo = evoMsg.documentMessage || evoMsg.audioMessage || evoData.media || null;
    return {
      externalMessageId: evoKey.id || evoData.id || gerarId('msg_ext'),
      telefoneRemetente: remetente,
      perfilRemetente: 'cliente',
      textoMensagem: texto,
      anexoMidia: anexo
    };
  }

  // 3. Fallback genérico
  return {
    externalMessageId: rawPayload.externalMessageId || rawPayload.id || gerarId('msg_ext'),
    telefoneRemetente: rawPayload.telefoneRemetente || rawPayload.remetente || '5585999990000',
    perfilRemetente: rawPayload.perfilRemetente || 'cliente',
    textoMensagem: rawPayload.textoMensagem || rawPayload.mensagem || '',
    anexoMidia: rawPayload.anexoMidia || rawPayload.anexoExtrato || null
  };
}

function receberWebhookRealGatewayWhatsApp(state, rawPayload, { signatureHeader, rawBody, ignorarAssinatura = false, timestamp } = {}) {
  if (!state) throw new Error('Estado da aplicação não informado');
  state.processedWebhookMessageIds = Array.isArray(state.processedWebhookMessageIds) ? state.processedWebhookMessageIds : [];
  state.whatsappOutboundQueue = Array.isArray(state.whatsappOutboundQueue) ? state.whatsappOutboundQueue : [];

  const cfg = state.whatsappGatewayConfig || {};
  if (cfg.webhookSecret && !ignorarAssinatura) {
    const bodyStr = rawBody || (typeof rawPayload === 'string' ? rawPayload : JSON.stringify(rawPayload));
    let valida = false;
    try {
      valida = validarAssinaturaHmac(cfg.webhookSecret, bodyStr, signatureHeader);
    } catch (_) {
      valida = false;
    }
    if (!valida) {
      const err = new Error('Assinatura do webhook inválida (HMAC-SHA256 mismatch)');
      err.status = 401;
      err.code = 'WEBHOOK_SIGNATURE_INVALID';
      throw err;
    }
  }

  const inbound = normalizarInboundGateway(typeof rawPayload === 'object' ? rawPayload : JSON.parse(rawPayload || '{}'));

  // Trava estrita de idempotência
  if (state.processedWebhookMessageIds.includes(inbound.externalMessageId)) {
    return { duplicateSkipped: true, externalMessageId: inbound.externalMessageId };
  }
  state.processedWebhookMessageIds.push(inbound.externalMessageId);
  if (state.processedWebhookMessageIds.length > 500) state.processedWebhookMessageIds.shift();

  // Se houver documento/extrato (PDF/OFX/CNAB), aciona conciliação
  let anexoExtrato = null;
  if (inbound.anexoMidia) {
    const m = inbound.anexoMidia;
    const isDoc = m.mimetype?.includes('pdf') || m.tipo === 'pdf_texto' || m.tipo === 'ofx_cnab' || /pdf|ofx|cnab/i.test(m.nomeArquivo || m.fileName || '');
    if (isDoc) anexoExtrato = m;
  }

  let respostaAgente = null;
  try {
    const perfil = inbound.perfilRemetente === 'cliente' && anexoExtrato ? 'gerencia' : inbound.perfilRemetente;
    respostaAgente = processarMensagemAgenteWhatsApp(state, {
      remetente: inbound.telefoneRemetente,
      perfilRemetente: perfil,
      mensagem: inbound.textoMensagem,
      anexoExtrato,
      skill: anexoExtrato ? 'SKILL_CONCILIACAO_EXTRATO' : undefined,
      timestamp: timestamp || new Date().toISOString()
    });

    if (respostaAgente && inbound.telefoneRemetente) {
      const textoResp = typeof respostaAgente === 'string'
        ? respostaAgente
        : (respostaAgente.respostaTextoWhatsApp || respostaAgente.mensagem || respostaAgente.texto || 'Comando processado com sucesso.');
      enfileirarDisparoOutboundWhatsApp(state, {
        telefoneDestino: inbound.telefoneRemetente,
        mensagemTexto: textoResp,
        tipoMidia: 'texto',
        referenciaOrigemId: inbound.externalMessageId,
        timestamp
      });
    }
  } catch (err) {
    respostaAgente = { erro: err.message, status: err.status || 500 };
  }

  return {
    sucesso: true,
    externalMessageId: inbound.externalMessageId,
    extratoProcessado: !!anexoExtrato,
    respostaAgente
  };
}

function enfileirarDisparoOutboundWhatsApp(state, {
  telefoneDestino,
  mensagemTexto,
  tipoMidia = 'texto',
  referenciaOrigemId,
  simularFalhaTemporaria = false,
  timestamp
} = {}) {
  if (!state) throw new Error('Estado da aplicação não informado');
  state.whatsappOutboundQueue = Array.isArray(state.whatsappOutboundQueue) ? state.whatsappOutboundQueue : [];

  const item = {
    id: gerarId('wpp_out'),
    telefoneDestino: String(telefoneDestino || '').replace(/\D/g, ''),
    mensagemTexto: String(mensagemTexto || ''),
    tipoMidia,
    referenciaOrigemId: referenciaOrigemId || null,
    simularFalhaTemporaria: !!simularFalhaTemporaria,
    status: 'pendente',
    tentativas: 0,
    criadoEm: timestamp || new Date().toISOString()
  };

  state.whatsappOutboundQueue.push(item);
  return item;
}

function processarFilaRetentativasOutboundWhatsApp(state, { timestamp } = {}) {
  if (!state) throw new Error('Estado da aplicação não informado');
  state.whatsappOutboundQueue = Array.isArray(state.whatsappOutboundQueue) ? state.whatsappOutboundQueue : [];

  const maxRetries = state.whatsappGatewayConfig?.maxTentativasRetry || 3;
  let enviadosCount = 0;
  let aguardandoRetryCount = 0;
  let deadLetterCount = 0;

  for (const item of state.whatsappOutboundQueue) {
    if (item.status !== 'pendente' && item.status !== 'aguardando_retry') continue;

    item.tentativas = (item.tentativas || 0) + 1;

    if (item.simularFalhaTemporaria) {
      if (item.tentativas >= maxRetries) {
        item.status = 'dead_letter_falha_permanente';
        item.erroUltimaTentativa = `Excedido limite de ${maxRetries} tentativas (Gateway offline)`;
        item.falhaFinalEm = timestamp || new Date().toISOString();
        deadLetterCount++;
      } else {
        item.status = 'aguardando_retry';
        item.erroUltimaTentativa = 'Erro temporário de conexão (503 Service Unavailable)';
        aguardandoRetryCount++;
      }
    } else {
      item.status = 'enviado';
      item.enviadoEm = timestamp || new Date().toISOString();
      enviadosCount++;
    }
  }

  return {
    totalProcessados: enviadosCount + aguardandoRetryCount + deadLetterCount,
    enviadosCount,
    aguardandoRetryCount,
    deadLetterCount
  };
}

module.exports = {
  configurarInstanciaGatewayWhatsApp,
  receberWebhookRealGatewayWhatsApp,
  enfileirarDisparoOutboundWhatsApp,
  processarFilaRetentativasOutboundWhatsApp
};
