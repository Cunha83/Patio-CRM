const { all } = require('../../db');
const { extractTenantId, getOrLoadState } = require('../../lib/serverContext');

// Lazy loading de módulos opcionais pesados
let _wweb = null;
function getWhatsAppModules() {
  if (!_wweb) {
    _wweb = require('whatsapp-web.js');
  }
  return _wweb;
}

let _puppeteer = null;
function getPuppeteer() {
  if (!_puppeteer) {
    _puppeteer = require('puppeteer');
  }
  return _puppeteer;
}

let wppClient = null;

const wppStatus = {
  status: 'inicializando',
  qr: null,
  qrImage: null,
  user: null,
  ultimoUpdate: new Date().toISOString()
};

function getWppClient() {
  return wppClient;
}

function setWppClient(client) {
  wppClient = client;
}

function getWppStatus() {
  return wppStatus;
}

// Helper resiliente para listar grupos do WhatsApp contornando instabilidades do getChats()
async function obterGruposWhatsApp() {
  if (!wppClient) return [];

  // Tentativa 1: Extração direta resiliente via evaluate no Puppeteer
  if (wppClient.pupPage) {
    try {
      const grupos = await wppClient.pupPage.evaluate(() => {
        try {
          let chatModels = [];
          if (typeof window.require === 'function') {
            try {
              const coll = window.require('WAWebCollections');
              if (coll && coll.Chat) {
                chatModels = typeof coll.Chat.getModelsArray === 'function' ? coll.Chat.getModelsArray() : (coll.Chat.models || []);
              }
            } catch (eColl) {}
          }
          if (!chatModels || chatModels.length === 0) {
            if (window.Store && window.Store.Chat) {
              chatModels = typeof window.Store.Chat.getModelsArray === 'function'
                ? window.Store.Chat.getModelsArray()
                : (window.Store.Chat.models || []);
            }
          }

          const resultado = [];
          const jaInseridos = new Set();

          for (const c of (chatModels || [])) {
            try {
              const rawId = c.id ? (c.id._serialized || c.id) : null;
              let idStr = '';
              if (typeof rawId === 'string') idStr = rawId;
              else if (rawId && rawId.user && rawId.server) idStr = `${rawId.user}@${rawId.server}`;
              else if (rawId && rawId._serialized) idStr = rawId._serialized;

              if (idStr && idStr.endsWith('@g.us') && !jaInseridos.has(idStr)) {
                jaInseridos.add(idStr);
                const name = c.formattedTitle || c.name || (c.contact ? (c.contact.formattedName || c.contact.name) : '') || 'Grupo';
                resultado.push({ id: idStr, name: String(name) });
              }
            } catch (errItem) {}
          }
          return resultado;
        } catch (errEval) {
          return [];
        }
      });

      if (Array.isArray(grupos) && grupos.length > 0) {
        console.log(`[WhatsApp] Extração resiliente no Puppeteer encontrou ${grupos.length} grupos.`);
        return grupos;
      }
    } catch (e2) {
      console.warn('[WhatsApp] evaluate() resiliente no Puppeteer falhou:', e2.message);
    }
  }

  // Tentativa 2: getChats() padrão
  try {
    const chats = await wppClient.getChats();
    if (Array.isArray(chats) && chats.length > 0) {
      return chats.filter(c => c.isGroup).map(c => ({
        id: c.id ? (c.id._serialized || c.id) : '',
        name: c.name || 'Grupo sem nome'
      })).filter(g => g.id && String(g.id).endsWith('@g.us'));
    }
  } catch (e1) {
    console.warn('[WhatsApp] getChats() padrão retornou erro (esperado no WhatsApp Web atual):', e1.message);
  }

  return [];
}

async function fecharModaisWhatsAppWeb() {
  if (!wppClient || !wppClient.pupPage) return;
  try {
    for (let i = 0; i < 3; i++) {
      await wppClient.pupPage.keyboard.press('Escape').catch(() => {});
      await new Promise(r => setTimeout(r, 200));
      const closed = await wppClient.pupPage.evaluate(() => {
        let clicked = false;
        const all = Array.from(document.querySelectorAll('button, div[role="button"], span[data-icon="x"], span[data-icon="x-alt"]'));
        for (const el of all) {
          const aria = (el.getAttribute('aria-label') || '').toLowerCase();
          const text = (el.innerText || el.textContent || '').toLowerCase().trim();
          const title = (el.getAttribute('title') || '').toLowerCase();
          if (aria.includes('fechar') || aria.includes('close') ||
              title.includes('fechar') || title.includes('close') ||
              text === 'ok' || text === 'entendi' || text === 'fechar' || text === 'continuar' || text.includes('continuar')) {
            try { el.click(); clicked = true; } catch (_) {}
            break;
          }
        }
        return clicked;
      }).catch(() => false);
      if (!closed) break;
      await new Promise(r => setTimeout(r, 300));
    }
  } catch (err) {
    console.warn('[WhatsApp] Aviso ao fechar modal:', err.message);
  }
}

async function registrarIdMensagem(sent, targetChatId, messageIds) {
  let id = null;
  if (sent) {
    if (typeof sent === 'string') id = sent;
    else if (sent.id) {
      if (typeof sent.id === 'string') id = sent.id;
      else if (sent.id._serialized) id = sent.id._serialized;
      else if (sent.id.id) id = `${sent.id.fromMe ? 'true' : 'false'}_${sent.id.remote || targetChatId}_${sent.id.id}`;
    } else if (sent._serialized) {
      id = sent._serialized;
    }
  }

  if (!id && wppClient && wppClient.pupPage) {
    try {
      await new Promise(r => setTimeout(r, 600));
      id = await wppClient.pupPage.evaluate((chatId, currentIds) => {
        try {
          const coll = window.require ? window.require('WAWebCollections') : null;
          if (!coll) return null;
          let chat = coll.Chat ? coll.Chat.get(chatId) : null;
          if (chat && chat.msgs) {
            const arr = typeof chat.msgs.getModelsArray === 'function' ? chat.msgs.getModelsArray() : (chat.msgs.models || []);
            const match = arr.slice().reverse().find(m => m && m.id && (m.id.fromMe === true || m.fromMe === true) && !currentIds.includes(m.id._serialized || m.id));
            if (match) return match.id._serialized || (typeof match.id === 'string' ? match.id : match.id.id);
          }
          if (coll.Msg) {
            const allMsgs = typeof coll.Msg.getModelsArray === 'function' ? coll.Msg.getModelsArray() : (coll.Msg.models || []);
            const cleanTarget = String(chatId).replace(/@.*$/, '');
            const match = allMsgs.slice().reverse().find(m => m && m.id && (m.id.fromMe === true || m.fromMe === true) && String(m.id.remote || '').includes(cleanTarget) && !currentIds.includes(m.id._serialized || m.id));
            if (match) return match.id._serialized || (typeof match.id === 'string' ? match.id : match.id.id);
          }
        } catch (_) {}
        return null;
      }, targetChatId, messageIds);
    } catch (ePup) {
      console.warn('[WhatsApp] Aviso ao buscar mensagem recente no Puppeteer:', ePup.message);
    }
  }

  if (id) {
    messageIds.push(id);
    return id;
  }
  return null;
}

async function resolverTenantPorChatId(chatId, senderPhone = '') {
  try {
    const rows = await all("SELECT key, value FROM kv WHERE key LIKE 'tenant:%:state' OR key = 'state'");
    for (const r of (rows || [])) {
      try {
        const parsed = JSON.parse(r.value);
        if (parsed && parsed.cfg) {
          const tenantId = extractTenantId(r.key);
          if (parsed.cfg.grupoAdminId === chatId || parsed.cfg.grupoOperacaoId === chatId) {
            return { tenantKey: tenantId, state: parsed };
          }
          if (senderPhone && Array.isArray(parsed.cfg.adminFones)) {
            const match = parsed.cfg.adminFones.some(f => {
              const clean = String(f).replace(/\D/g, '');
              return clean && (clean.endsWith(senderPhone) || senderPhone.endsWith(clean));
            });
            if (match) {
              return { tenantKey: tenantId, state: parsed };
            }
          }
        }
      } catch (_) {}
    }
  } catch (err) {
    console.warn('[resolverTenantPorChatId] Erro ao consultar kv:', err.message);
  }

  const defState = await getOrLoadState('default');
  return { tenantKey: 'default', state: defState };
}

module.exports = {
  getWhatsAppModules,
  getPuppeteer,
  getWppClient,
  setWppClient,
  getWppStatus,
  obterGruposWhatsApp,
  fecharModaisWhatsAppWeb,
  registrarIdMensagem,
  resolverTenantPorChatId
};
