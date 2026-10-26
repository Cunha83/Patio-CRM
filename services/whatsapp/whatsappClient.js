const path = require('path');
const QRCode = require('qrcode');
const qrcodeTerminal = require('qrcode-terminal');
const { all } = require('../../db');
const { extractTenantId, mutateTenantState } = require('../../lib/serverContext');
const { closeRenderBrowser } = require('../reportGenerationService');
const {
  getWhatsAppModules,
  setWppClient,
  getWppStatus,
  obterGruposWhatsApp
} = require('./whatsappState');
const { tratarMensagemWhatsApp } = require('./whatsappHandlers');

const ROOT_DIR = path.resolve(__dirname, '../../');
const PORT = parseInt(process.env.PORT, 10) || 3000;

async function sincronizarGruposAutomaticamente(wppClient) {
  try {
    if (!wppClient) return;
    console.log('[WhatsApp] Sincronizando e auto-detectando grupos no WhatsApp...');
    const grupos = await obterGruposWhatsApp();
    console.log(`[WhatsApp] Total de grupos encontrados na conta: ${grupos.length}`);
    grupos.forEach(g => {
      console.log(`   📁 Grupo: "${g.name}" | ID: ${g.id}`);
    });

    const rows = await all("SELECT key, value FROM kv WHERE key LIKE 'tenant:%:state' OR key = 'state'");
    for (const r of (rows || [])) {
      try {
        const parsed = JSON.parse(r.value);
        if (!parsed.cfg) parsed.cfg = {};
        let atualizou = false;
        if (parsed.cfg.grupoAdminId === '120363428179962435@g.us' || parsed.cfg.grupoAdminId === '120363428840376088@g.us') {
          parsed.cfg.grupoAdminId = '';
          atualizou = true;
        }
        if (atualizou) {
          const tenantId = extractTenantId(r.key);
          await mutateTenantState(tenantId, (draft) => {
            if (!draft.cfg) draft.cfg = {};
            if (draft.cfg.grupoAdminId === '120363428179962435@g.us' || draft.cfg.grupoAdminId === '120363428840376088@g.us') {
              draft.cfg.grupoAdminId = '';
            }
          });
        }
      } catch (_) {}
    }
  } catch (err) {
    console.warn('[WhatsApp] Erro na auto-sincronização de grupos:', err.message);
  }
}

let activeClient = null;

function iniciarWhatsApp() {
  console.log('[WhatsApp] Iniciando cliente WhatsApp Web...');
  const { Client, LocalAuth } = getWhatsAppModules();
  const authPath = path.resolve(ROOT_DIR, '.wwebjs_auth');

  const wppClient = new Client({
    authStrategy: new LocalAuth({ dataPath: authPath }),
    puppeteer: {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-first-run'
      ]
    }
  });

  activeClient = wppClient;
  setWppClient(wppClient);
  const wppStatus = getWppStatus();

  wppClient.on('qr', async (qr) => {
    wppStatus.status = 'aguardando_qr';
    wppStatus.qr = qr;
    try {
      wppStatus.qrImage = await QRCode.toDataURL(qr, { width: 340, margin: 2 });
    } catch (e) {
      wppStatus.qrImage = null;
    }
    wppStatus.ultimoUpdate = new Date().toISOString();

    console.log('\n======================================================');
    console.log('📱 NOVO QR CODE GERADO NO SERVIDOR');
    console.log(`🔗 Ver Imagem Direta no Navegador: http://localhost:${PORT}/api/whatsapp/qr.png`);
    console.log('======================================================\n');
    qrcodeTerminal.generate(qr, { small: true });
  });

  wppClient.on('authenticated', () => {
    wppStatus.status = 'autenticado';
    wppStatus.ultimoUpdate = new Date().toISOString();
    console.log('🔒 [WhatsApp] Autenticado com sucesso!');

    let tentativasReady = 0;
    const monitorPronto = setInterval(async () => {
      tentativasReady++;
      try {
        if (wppStatus.status === 'pronto') {
          clearInterval(monitorPronto);
          return;
        }
        const state = await wppClient.getState().catch(() => null);
        if (state === 'CONNECTED' || wppClient.info) {
          wppStatus.status = 'pronto';
          wppStatus.qr = null;
          wppStatus.user = wppClient.info ? wppClient.info.wid.user : 'Conectado';
          wppStatus.ultimoUpdate = new Date().toISOString();
          console.log(`✅ [WhatsApp] Agente Virtual Conectado e Pronto! (${wppStatus.user})`);
          clearInterval(monitorPronto);
          await sincronizarGruposAutomaticamente(wppClient);
        }
      } catch (e) {}
      if (tentativasReady > 30) clearInterval(monitorPronto);
    }, 2000);
  });

  wppClient.on('ready', async () => {
    wppStatus.status = 'pronto';
    wppStatus.qr = null;
    wppStatus.user = wppClient.info ? wppClient.info.wid.user : 'Conectado';
    wppStatus.ultimoUpdate = new Date().toISOString();
    console.log(`✅ [WhatsApp] Agente Virtual Conectado e Pronto! (${wppStatus.user})`);
    await sincronizarGruposAutomaticamente(wppClient);
  });

  wppClient.on('auth_failure', (msg) => {
    wppStatus.status = 'erro';
    wppStatus.ultimoUpdate = new Date().toISOString();
    console.error('❌ [WhatsApp] Falha de autenticação:', msg);
  });

  wppClient.on('disconnected', (reason) => {
    wppStatus.status = 'desconectado';
    wppStatus.ultimoUpdate = new Date().toISOString();
    console.warn('⚠️ [WhatsApp] Desconectado:', reason);
  });

  wppClient.on('message', async (msg) => {
    await tratarMensagemWhatsApp(msg, wppClient);
  });

  wppClient.on('message_create', async (msg) => {
    // Processa mensagens enviadas pelo próprio usuário cadastrado / conectado
    if (msg.fromMe) {
      await tratarMensagemWhatsApp(msg, wppClient);
    }
  });

  try {
    wppClient.initialize();
  } catch (err) {
    console.error('[WhatsApp] Erro ao chamar wppClient.initialize():', err);
  }

  return wppClient;
}

async function finalizarProcessosFilhos(sinal) {
  console.log(`\n[Servidor] Recebido sinal ${sinal}. Limpando recursos e processos em segundo plano...`);
  try {
    await closeRenderBrowser();
  } catch (_) {}
  try {
    if (activeClient) {
      console.log('[WhatsApp] Desconectando sessão com segurança...');
      await activeClient.destroy().catch(() => {});
      activeClient = null;
      setWppClient(null);
    }
  } catch (_) {}
}

module.exports = {
  iniciarWhatsApp,
  finalizarProcessosFilhos,
  sincronizarGruposAutomaticamente
};
