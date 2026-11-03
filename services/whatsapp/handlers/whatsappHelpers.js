'use strict';

/**
 * Funções auxiliares de formatação, extração e mensagens para os handlers do WhatsApp
 */

async function responderMensagem(msg, texto, wppClient, targetChatId) {
  if (!texto) return null;
  try {
    return await msg.reply(texto);
  } catch (errReply) {
    if (wppClient && targetChatId) {
      return await wppClient.sendMessage(targetChatId, texto);
    }
    throw errReply;
  }
}

function isBotPrefix(texto) {
  if (!texto || typeof texto !== 'string') return false;
  const t = texto.trim();
  return (
    t.startsWith('✅ *Ordem de Serviço') ||
    t.startsWith('📋 *Status') ||
    t.startsWith('📋 *Painel Geral') ||
    t.startsWith('📋 *Veículo já presente') ||
    t.startsWith('📸 *Foto') ||
    t.startsWith('🎙️ *Áudio') ||
    t.startsWith('💸 *Comprovante') ||
    t.startsWith('🧾 *Nota Fiscal') ||
    t.startsWith('⚠️ *Atenção') ||
    t.startsWith('⚠️ Muitas mensagens') ||
    t.startsWith('🔒 *Acesso Restrito') ||
    t.startsWith('Olá! Sou o assistente virtual do *Pátio CRM*') ||
    t.startsWith('Não localizei nenhuma OS') ||
    t.startsWith('Nenhuma Ordem de Serviço ativa') ||
    t.startsWith('Para abrir a Ordem de Serviço') ||
    t.startsWith('Áudio processado pelo Pátio CRM') ||
    t.startsWith('*Relatório Executivo*') ||
    t.startsWith('*Resumo de Caixa*') ||
    t.startsWith('*Ocupação do Pátio*') ||
    t.startsWith('🤖') ||
    t.startsWith('❌')
  );
}

function formatarMoeda(val) {
  return (Number(val) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatarDataBR(d) {
  if (!d) return new Date().toLocaleDateString('pt-BR');
  if (typeof d === 'string' && d.includes('-')) {
    const parts = d.split('-');
    if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return d;
}

function formatarHoraSimples(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso).slice(11, 16);
    return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  } catch (e) {
    return String(iso).slice(11, 16);
  }
}

function extrairValorMonetario(texto) {
  const t = String(texto || '').trim();

  // Padrões monetários explícitos
  const regexExplicit = /(?:r\$\s*)(\d{1,3}(?:\.\d{3})*,\d{2}|\d+(?:[.,]\d{1,2})?)|\b(\d{1,3}(?:\.\d{3})*,\d{2}|\d+(?:[.,]\d{1,2})?)\s*(?:reais|real)\b|(?:com|de|saldo\s+de|valor\s+de)\s*(?:r\$\s*)?(\d{1,3}(?:\.\d{3})*,\d{2}|\d+(?:[.,]\d{1,2})?)/gi;
  
  const matches = [];
  let m;
  while ((m = regexExplicit.exec(t)) !== null) {
    const rawVal = m[1] || m[2] || m[3];
    if (rawVal) {
      const num = parseFloat(rawVal.replace(/\./g, '').replace(',', '.'));
      if (!isNaN(num) && num > 0) matches.push(num);
    }
  }

  // Padrões de números soltos quando não houver moeda explícita
  if (matches.length === 0) {
    const regexNumeros = /\b(\d+(?:[.,]\d{1,2})?)\b/g;
    while ((m = regexNumeros.exec(t)) !== null) {
      const raw = m[1];
      if (['2024', '2025', '2026', '2027'].includes(raw)) continue;
      const num = parseFloat(raw.replace(',', '.'));
      if (!isNaN(num) && num > 0) matches.push(num);
    }
  }

  if (matches.length === 0) {
    return { status: 'ausente' };
  }

  const unicos = [...new Set(matches)];
  if (unicos.length > 1) {
    return { status: 'ambiguo', valores: unicos };
  }

  return { status: 'valido', valor: unicos[0] };
}

function extrairFormaPagamentoHeuristica(texto) {
  const t = String(texto || '').toLowerCase();
  if (t.includes('pix')) return 'pix';
  if (t.includes('cartao de debito') || t.includes('cartão de débito') || t.includes('debito') || t.includes('débito')) return 'cartao_debito';
  if (t.includes('cartao de credito') || t.includes('cartão de crédito') || t.includes('credito') || t.includes('crédito')) return 'cartao_credito';
  if (t.includes('cartao') || t.includes('cartão')) return 'cartao_credito';
  if (t.includes('boleto')) return 'boleto';
  if (t.includes('transferencia') || t.includes('transferência') || t.includes('ted') || t.includes('doc')) return 'transferencia';
  if (t.includes('dinheiro') || t.includes('especie') || t.includes('espécie')) return 'dinheiro';
  return 'dinheiro';
}

function extrairOsEPlacaHeuristica(texto) {
  const t = String(texto || '');
  let osId = null;
  let placa = null;

  const matchOs = t.match(/\b(?:os|o\.s\.|ordem|ordem\s+de\s+serviço|ordem\s+de\s+servico)\s*#?\s*([a-zA-Z0-9_\-]+)\b/i);
  if (matchOs) {
    osId = matchOs[1].trim();
  }

  const matchPlaca = t.match(/\b([a-zA-Z]{3}[0-9][0-9a-zA-Z][0-9]{2}|[a-zA-Z]{3}[- ]?[0-9]{4})\b/i);
  if (matchPlaca) {
    placa = matchPlaca[1].toUpperCase().replace(/[- ]/g, '');
  }

  return { osId, placa };
}

function extrairTelefoneDeJid(msg, explicitNumber = null) {
  if (explicitNumber !== null && explicitNumber !== undefined) {
    const str = String(explicitNumber).trim();
    if (str.includes('@lid')) return '';
    const clean = str.replace(/[@:].*$/, '').replace(/\D/g, '');
    if (clean) return clean;
  }

  if (!msg || typeof msg !== 'object') return '';

  const candidates = [
    msg.author,
    msg.from,
    msg._data?.author,
    msg._data?.from,
    msg.sender?.id?._serialized,
    msg.sender?.id?.user,
    msg.sender?.number,
    msg._data?.senderNumber,
    msg._data?.participant
  ];

  for (const cand of candidates) {
    if (!cand || typeof cand !== 'string') continue;
    if (cand.includes('@lid')) continue;
    const clean = cand.split('@')[0].split(':')[0].replace(/\D/g, '');
    if (clean && clean.length >= 8 && clean.length <= 15) {
      return clean;
    }
  }

  const isLid = Boolean(
    (typeof msg.from === 'string' && msg.from.includes('@lid')) ||
    (typeof msg.author === 'string' && msg.author.includes('@lid'))
  );
  if (isLid) {
    return ''; // Fail-closed para LID não resolvível
  }

  const fallback = msg.author || msg.from || '';
  return fallback.split('@')[0].split(':')[0].replace(/\D/g, '');
}

module.exports = {
  responderMensagem,
  isBotPrefix,
  formatarMoeda,
  formatarDataBR,
  formatarHoraSimples,
  extrairValorMonetario,
  extrairFormaPagamentoHeuristica,
  extrairOsEPlacaHeuristica,
  extrairTelefoneDeJid
};
