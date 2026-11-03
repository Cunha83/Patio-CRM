'use strict';

const Tesseract = require('tesseract.js');
const { getAiClient, ultimasPlacas } = require('../../../lib/serverContext');
const voiceActionEngine = require('../../voiceActionEngine');
const quotationService = require('../../quotationService');
const { processarEntradaVeiculo } = require('../../vehicleEntryService');
const { resolverTenantPorChatId, isMensagemEnviadaPeloBot } = require('../whatsappState');
const {
  formatarMoeda,
  extrairTelefoneDeJid,
  isBotPrefix,
  responderMensagem
} = require('./whatsappHelpers');
const {
  confirmacoesPendentes,
  verificarRateLimit,
  auditarComandoWhatsApp,
  verificarIdempotencia,
  registrarIdempotencia
} = require('./whatsappSecurity');
const { analisarDocumentoWhatsApp } = require('./whatsappDocumentParser');
const { processarMensagemTexto, normalizePhone, isAdminPhone } = require('./whatsappMessageProcessor');
const { tratarDocumentoIdentificado, tratarConsultaStatusOS } = require('./whatsappStatusHandler');

const placaRegex = /\b([A-Z]{3}[0-9][0-9A-Z][0-9]{2}|[A-Z]{3}[- ]?[0-9]{4})\b/i;

/**
 * Trata o evento 'message' do cliente WhatsApp Web
 */
async function tratarMensagemWhatsApp(msg, wppClient) {
  const msgId = (msg.id && (msg.id._serialized || msg.id.id)) || msg.id || null;
  if (msg.fromMe && (isMensagemEnviadaPeloBot(msgId) || isBotPrefix(msg.body))) return;

  const targetChatId = (msg.fromMe ? msg.to : msg.from) || msg.from;
  if (!targetChatId || targetChatId.includes('status') || targetChatId.includes('@broadcast')) return;

  const isGroup = Boolean(targetChatId && targetChatId.includes('@g.us'));
  const fromNumber = msg.fromMe ? (wppClient?.info?.wid?.user || extrairTelefoneDeJid(msg)) : extrairTelefoneDeJid(msg);

  const { tenantKey, state: tenantState } = await resolverTenantPorChatId(targetChatId, fromNumber);
  const idemCheck = await verificarIdempotencia(msgId, tenantKey);
  if (idemCheck.duplicada) {
    if (idemCheck.resposta) {
      try { await responderMensagem(msg, idemCheck.resposta, wppClient, targetChatId); } catch (_) {}
    }
    return;
  }

  const cfg = tenantState?.cfg || {};
  const responderApenasGrupos = cfg.responderApenasGrupos !== false;

  const grupoAdminIds = [
    ...(Array.isArray(cfg.grupoAdminId) ? cfg.grupoAdminId : [cfg.grupoAdminId]),
    ...(Array.isArray(cfg.gruposAdmin) ? cfg.gruposAdmin : []),
    ...(process.env.WHATSAPP_GRUPO_ADMIN_ID ? process.env.WHATSAPP_GRUPO_ADMIN_ID.split(',') : [])
  ].map(s => String(s || '').trim()).filter(Boolean);

  const grupoOperacaoIds = [
    ...(Array.isArray(cfg.grupoOperacaoId) ? cfg.grupoOperacaoId : [cfg.grupoOperacaoId]),
    ...(Array.isArray(cfg.gruposOperacao) ? cfg.gruposOperacao : []),
    ...(process.env.WHATSAPP_GRUPO_OPERACAO_ID ? process.env.WHATSAPP_GRUPO_OPERACAO_ID.split(',') : [])
  ].map(s => String(s || '').trim()).filter(Boolean);

  const isGrupoAdmin = isGroup && grupoAdminIds.includes(targetChatId);
  const isGrupoOperacao = isGroup && grupoOperacaoIds.includes(targetChatId);

  const adminList = (process.env.WHATSAPP_ADMIN_NUMBERS || '').split(',').map(s => s.trim().replace(/\D/g, '')).filter(Boolean);
  if (cfg.adminFones && Array.isArray(cfg.adminFones)) {
    cfg.adminFones.forEach(f => {
      const clean = String(f).replace(/\D/g, '');
      if (clean && !adminList.includes(clean)) adminList.push(clean);
    });
  }
  const isSenderAdmin = msg.fromMe ? true : isAdminPhone(fromNumber, adminList);

  if (!msg.fromMe) {
    const rateCheck = verificarRateLimit(fromNumber);
    if (!rateCheck.permitido) {
      try { await responderMensagem(msg, '⚠️ Muitas mensagens recebidas em sequência. Por favor, aguarde um momento antes de tentar novamente.', wppClient, targetChatId); } catch (_) {}
      await auditarComandoWhatsApp({ tenantId: tenantKey, numero: normalizePhone(fromNumber) || fromNumber, comando: msg.body || (msg.hasMedia ? '[midia]' : ''), resultado: 'rate_limit_excedido', detalhes: { contagem: rateCheck.contagem } });
      return;
    }
  }

  if (isGroup) {
    if (targetChatId === '120363428179962435@g.us' || targetChatId === '120363428840376088@g.us') return;
    if (!isGrupoAdmin && !isGrupoOperacao) return;
  } else {
    const linkInviteMatch = (msg.body || '').match(/chat\.whatsapp\.com\/([a-zA-Z0-9_-]{20,30})/);
    if (linkInviteMatch && linkInviteMatch[1] && isSenderAdmin) {
      try { await wppClient.acceptInvite(linkInviteMatch[1]); } catch (_) {}
      return;
    }
    if (responderApenasGrupos) return;
    if (!isSenderAdmin) {
      await responderMensagem(msg, 'Olá! Sou o assistente do Pátio CRM. No momento, o atendimento automatizado está disponível apenas para motoristas e clientes com veículos em serviço ou administradores autorizados. Para mais informações, entre em contato diretamente com a nossa recepção.', wppClient, targetChatId);
      await auditarComandoWhatsApp({ tenantId: tenantKey, numero: normalizePhone(fromNumber) || fromNumber, comando: msg.body || (msg.hasMedia ? '[midia]' : ''), resultado: 'recusado_nao_autorizado', detalhes: { motivo: 'numero_desconhecido' } });
      return;
    }
  }

  const isContextAdmin = isGrupoAdmin || (!isGroup && isSenderAdmin);
  const isContextOperacao = isGrupoOperacao;

  let base64Image = null;
  let imageMime = 'image/jpeg';
  let base64Audio = null;
  let audioMime = null;

  if (msg.hasMedia) {
    for (let tentativa = 1; tentativa <= 4; tentativa++) {
      try {
        await new Promise(r => setTimeout(r, 400 * tentativa));
        const media = await msg.downloadMedia();
        if (media && media.data) {
          const mime = (media.mimetype || '').toLowerCase();
          if (mime.startsWith('audio/') || msg.type === 'ptt' || msg.type === 'audio') {
            base64Audio = media.data;
            audioMime = media.mimetype || 'audio/ogg';
          } else {
            base64Image = media.data;
            imageMime = media.mimetype || 'image/jpeg';
          }
          break;
        }
      } catch (_) {}
    }
  }

  const ai = getAiClient();
  if (base64Audio) {
    const chavePendente = `${tenantKey}:${normalizePhone(fromNumber) || fromNumber}`;
    if (confirmacoesPendentes.has(chavePendente)) {
      await responderMensagem(msg, '⚠️ *Operação Financeira Pendente:* Para confirmar ou cancelar lançamentos financeiros, por favor envie o comando em texto digitado (*CONFIRMAR* ou *CANCELAR*). Comandos de áudio não são aceitos para confirmação.', wppClient, targetChatId);
      return;
    }
    try {
      const resVoz = await voiceActionEngine.interpretarEExecutar({
        input: { audioBase64: base64Audio, mimeType: audioMime },
        context: { canal: 'whatsapp', tenantId: tenantKey, remetente: fromNumber, actorId: fromNumber, role: isSenderAdmin ? 'tenant_admin' : (isContextOperacao ? 'atendente' : 'cliente'), permissions: isSenderAdmin ? ['*'] : (isContextOperacao ? ['os:read', 'os:write'] : []), isSenderAdmin: !!isSenderAdmin, isContextOperacao: !!isContextOperacao, isContextAdmin: !!isContextAdmin },
        state: tenantState,
        aiClient: ai
      });
      await responderMensagem(msg, resVoz.resposta || 'Áudio processado pelo Pátio CRM.', wppClient, targetChatId);
      await registrarIdempotencia(msgId);
      return;
    } catch (_) {
      await responderMensagem(msg, '🎙️ *Áudio recebido no Pátio CRM!*\n\nNão consegui transcrever a gravação de voz com clareza no momento. Você pode repetir ou enviar o comando por texto (ex: *Abrir OS placa ABC1234*)?', wppClient, targetChatId);
      return;
    }
  }

  const textoMensagem = (msg.body || '').trim();
  const textoLower = textoMensagem.toLowerCase().trim();

  // Orçamento (aprovação/recusa)
  if (textoLower.includes('aprovar') || textoLower.includes('recusar') || (textoLower.includes('orcamento') && (textoLower.includes('sim') || textoLower.includes('não') || textoLower.includes('nao')))) {
    const resOrcWpp = quotationService.processarComandoWhatsAppOrcamento({ texto: textoMensagem, fromNumber, state: tenantState, tenantId: tenantKey });
    if (resOrcWpp.reconhecido && resOrcWpp.resposta) {
      await responderMensagem(msg, resOrcWpp.resposta, wppClient, targetChatId);
      await registrarIdempotencia(msgId);
      return;
    }
  }

  // Documentos OCR / Imagem
  let docAnalise = null;
  const isDocTextual = textoLower.includes('pedido') || textoLower.includes('orçamento') || textoLower.includes('orcamento') || textoLower.includes('nota fiscal') || textoLower.includes('danfe') || textoLower.includes('nf-e') || textoLower.includes('nfe') || textoLower.includes('comprovante') || textoLower.includes('pagamento pix') || textoLower.includes('pago ');
  if (base64Image || isDocTextual) {
    try { docAnalise = await analisarDocumentoWhatsApp(base64Image, textoMensagem); } catch (_) {}
  }
  if (await tratarDocumentoIdentificado(msg, docAnalise, wppClient, targetChatId, msgId)) return;

  let matchPlaca = textoMensagem.match(placaRegex);
  let placaDaFoto = docAnalise?.dados?.placa || null;
  if (base64Image && !placaDaFoto) {
    try {
      const buffer = Buffer.from(base64Image, 'base64');
      const resOcr = await Tesseract.recognize(buffer, 'por');
      const textOcr = (resOcr?.data?.text || '').toUpperCase();
      const m = textOcr.match(placaRegex);
      if (m) placaDaFoto = m[1].replace(/[- ]/g, '');
    } catch (_) {}
  }

  const placaIdentificada = matchPlaca ? matchPlaca[1].toUpperCase().replace(/[- ]/g, '') : placaDaFoto;
  if (placaIdentificada) ultimasPlacas.set(fromNumber, { placa: placaIdentificada, timestamp: Date.now() });

  const infoRecente = ultimasPlacas.get(fromNumber);
  const placaContexto = (infoRecente && (Date.now() - infoRecente.timestamp < 15 * 60 * 1000)) ? infoRecente.placa : null;

  const isComandoExplicito = textoLower.startsWith('!') || confirmacoesPendentes.has(`${tenantKey}:${normalizePhone(fromNumber) || fromNumber}`) || textoLower === 'confirmar' || textoLower === 'cancelar' || textoLower.includes('abrir caixa') || textoLower.includes('fechar caixa') || textoLower.includes('lançar entrada') || textoLower.includes('lancar entrada') || textoLower.includes('lançar saída') || textoLower.includes('lancar saida') || ['relatorio', 'relatório', 'caixa', 'saldo', 'patio', 'pátio', 'boxes', 'ajuda', 'menu', 'comandos', 'previsao', 'previsão', 'forecast', 'auditoria', 'controles'].includes(textoLower);
  const isConsultaStatus = textoLower.includes('status') || textoLower.includes('como está') || textoLower.includes('consultar') || textoLower.includes('andamento');
  const isAberturaOS = textoLower.includes('abrir os') || textoLower.startsWith('abrir ') || textoLower === 'abrir';
  const isLancamentoItem = textoLower.includes('inclua') || textoLower.includes('incluir') || textoLower.includes('adicione') || textoLower.includes('adicionar') || textoLower.includes('lance') || textoLower.includes('lancar') || textoLower.includes('lançar');
  const isSaudacao = textoLower === 'oi' || textoLower === 'ola' || textoLower === 'olá' || textoLower === 'bom dia' || textoLower === 'boa tarde' || textoLower === 'boa noite' || textoLower.startsWith('bot') || textoLower.startsWith('agente');

  if (isGroup && !isComandoExplicito && !isConsultaStatus && !isAberturaOS && !isLancamentoItem && !base64Image && !matchPlaca) return;

  try {
    const tratado = await processarMensagemTexto(msg, { texto: textoMensagem, tenantKey, tenantState, isContextAdmin, isContextOperacao, isGroup, fromNumber, isSenderAdmin, wppClient });
    if (tratado) {
      await registrarIdempotencia(msgId);
      return;
    }

    if (isConsultaStatus) {
      return await tratarConsultaStatusOS(msg, { tenantState, placaAlvo: placaIdentificada || placaContexto, isContextOperacao, wppClient, targetChatId, msgId });
    }

    // Abertura de OS / Entrada de veículo
    const isFotoPlaca = Boolean(base64Image && placaIdentificada);
    const isComandoAbrirComPlaca = Boolean(isAberturaOS && (placaIdentificada || placaContexto));
    const isEnvioPlacaDiretoOperacao = Boolean(isGrupoOperacao && placaIdentificada && (textoLower.length <= 15 || base64Image));

    if (isFotoPlaca || isComandoAbrirComPlaca || isEnvioPlacaDiretoOperacao) {
      const placaFinal = placaIdentificada || placaContexto;
      if (!isAberturaOS && !base64Image && placaFinal) {
        const veicExistente = (tenantState?.veiculos || []).find(v => v.placa && v.placa.toUpperCase().replace(/[^A-Z0-9]/g, '') === placaFinal);
        const osAtiva = veicExistente ? (tenantState?.os || []).find(o => o.vei === veicExistente.id && o.st !== 'finalizada') : null;
        if (osAtiva) {
          const boxInfo = osAtiva.box ? ((tenantState?.boxes || []).find(b => b.id === osAtiva.box) || { nome: 'Box Pátio' }).nome : 'Fila de Espera no Pátio';
          let resposta = `📋 *Veículo já presente no pátio:* OS #${osAtiva.num} — Placa *${veicExistente.placa}*\n\n📍 *Localização:* ${boxInfo}\n⚙️ *Situação:* *${osAtiva.st.toUpperCase()}*\n\nPara consultar detalhes completos, envie: *Status placa ${placaFinal}*`;
          await responderMensagem(msg, resposta, wppClient, targetChatId);
          await registrarIdempotencia(msgId);
          return;
        }
      }

      try {
        const resultadoOS = await processarEntradaVeiculo({
          placa: placaFinal,
          clienteNome: `Cliente WhatsApp (${placaFinal})`,
          clienteFone: fromNumber,
          textoOriginal: textoMensagem || (base64Image ? 'Check-in via foto da placa no WhatsApp' : `Entrada ${placaFinal}`),
          req: { tenantId: tenantKey }
        });
        if (resultadoOS?.respostaWhatsApp) {
          await responderMensagem(msg, resultadoOS.respostaWhatsApp, wppClient, targetChatId);
          await registrarIdempotencia(msgId);
          return;
        }
      } catch (errOS) {
        await responderMensagem(msg, `❌ Não foi possível abrir a OS para a placa *${placaFinal}* no momento. Detalhe: ${errOS.message}`, wppClient, targetChatId);
        return;
      }
    }

    if (isAberturaOS && !placaIdentificada && !placaContexto) {
      await responderMensagem(msg, 'Para abrir a Ordem de Serviço, por favor informe a placa do veículo (ex: *Abrir OS placa ABC1234*) ou envie uma foto do caminhão/placa.', wppClient, targetChatId);
      await registrarIdempotencia(msgId);
      return;
    }

    const isRedirecionamentoBox = (textoLower.includes('direcionar') || textoLower.includes('mover') || textoLower.includes('mudar box') || textoLower.includes('trocar box') || textoLower.includes('colocar no box') || textoLower.includes('passar para o box')) && !textoLower.includes('abrir os') && !textoLower.includes('abrir nova os');
    const isFalaNatural = textoLower.includes('favor') || textoLower.includes('preciso') || textoLower.includes('pode ') || textoLower.includes('trocar') || textoLower.includes('consertar') || textoLower.includes('revisar');

    if (isRedirecionamentoBox || isLancamentoItem || isFalaNatural || (!isGroup && textoMensagem.length > 5)) {
      const resNat = await voiceActionEngine.interpretarEExecutar({
        input: { text: textoMensagem },
        context: { canal: 'whatsapp', tenantId: tenantKey, remetente: fromNumber, actorId: fromNumber, role: isSenderAdmin ? 'tenant_admin' : (isContextOperacao ? 'atendente' : 'cliente'), permissions: isSenderAdmin ? ['*'] : (isContextOperacao ? ['os:read', 'os:write'] : []), isSenderAdmin: !!isSenderAdmin, isContextOperacao: !!isContextOperacao, isContextAdmin: !!isContextAdmin },
        state: tenantState,
        aiClient: ai
      });
      if (resNat.ok && resNat.resposta) {
        await responderMensagem(msg, resNat.resposta, wppClient, targetChatId);
        await registrarIdempotencia(msgId);
        return;
      }
    }

    if (base64Image) {
      const resposta = `📸 *Foto recebida no Pátio CRM!*\n\nNão consegui identificar o documento ou a placa do caminhão com nitidez.\n\nVocê pode enviar:\n• 📋 *Foto de Pedido de Compra / Orçamento*\n• 🧾 *Foto ou DANFE de Nota Fiscal (NF-e)*\n• 💸 *Comprovante de Pagamento (Pix / Boleto / TED)*\n• 🚛 *Foto da Placa do Caminhão (Ex: ABC1D23)*`;
      await responderMensagem(msg, resposta, wppClient, targetChatId);
      await registrarIdempotencia(msgId);
      return;
    }

    if (isSaudacao) {
      const saudacao = `Olá! Sou o assistente virtual do *Pátio CRM* 🚛⚙️\n\nComo posso ajudar você hoje?\n1️⃣ *Para abrir uma OS:* Digite *Abrir OS placa ABC1234* ou envie a foto da placa.\n2️⃣ *Para consultar status:* Digite *Status placa ABC1234*.\n3️⃣ *Para incluir serviços:* Digite *Inclua [serviço]*.\n4️⃣ *Para ver a ocupação:* Digite *!patio*`;
      await responderMensagem(msg, saudacao, wppClient, targetChatId);
      await registrarIdempotencia(msgId);
      return;
    }

    if (!isGroup && !responderApenasGrupos) {
      await responderMensagem(msg, `Mensagem recebida no *Pátio CRM*! 🚛\n\n• Digite *!ajuda* para ver todos os comandos disponíveis.\n• Digite *!relatorio* para o relatório executivo matinal.\n• Digite *!caixa* para a posição financeira.`, wppClient, targetChatId);
      await registrarIdempotencia(msgId);
    }
  } catch (localErr) {
    console.error('[WhatsApp] Erro no processamento de mensagem:', localErr);
    if (isGroup || !responderApenasGrupos) {
      try { await responderMensagem(msg, 'Recebemos sua mensagem! Nossa equipe já está verificando no sistema.', wppClient, targetChatId); } catch (_) {}
    }
  }
}

module.exports = {
  tratarMensagemWhatsApp
};
