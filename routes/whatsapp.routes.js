const express = require('express');
const router = express.Router();
const QRCode = require('qrcode');
const {
  getOrLoadState,
  mutateTenantState,
  extractTenantId,
  requirePermission,
  authMiddleware
} = require('../lib/serverContext');
const {
  getWppClient,
  getWppStatus,
  obterGruposWhatsApp,
  fecharModaisWhatsAppWeb
} = require('../services/whatsapp/whatsappState');
const {
  sincronizarGruposAutomaticamente
} = require('../services/whatsapp/whatsappClient');
const {
  gerarRelatorioExecutivo,
  gerarMensagensAdmin,
  gerarImagemIndicadoresJPG,
  enviarRelatorioGrupo,
  enviarRelatorioAdministradores
} = require('../services/reportGenerationService');
const { executarCicloDisparoRelatorioDiario } = require('../services/whatsapp/whatsappScheduler');

// Middleware local para injetar wppClient e wppStatus no escopo da rota
router.use((req, res, next) => {
  req.wppClient = getWppClient();
  req.wppStatus = getWppStatus();
  next();
});

const wppStatus = getWppStatus();
const wppClient = new Proxy({}, {
  get(target, prop) {
    const client = getWppClient();
    if (!client) return undefined;
    const val = client[prop];
    if (typeof val === 'function') {
      return val.bind(client);
    }
    return val;
  }
});


router.get('/api/whatsapp/status', async (req, res) => {
  let userWid = null;
  if (wppClient && wppClient.info && wppClient.info.wid) {
    userWid = wppClient.info.wid.user;
    if (wppStatus.status !== 'pronto') {
      wppStatus.status = 'pronto';
      wppStatus.user = userWid;
    }
  }
  res.json(wppStatus);
});

// Retorna o QR Code em PNG com alto contraste
router.get('/api/whatsapp/qr.png', async (req, res) => {
  if (wppStatus.qr) {
    try {
      const buffer = await QRCode.toBuffer(wppStatus.qr, {
        width: 400,
        margin: 2,
        color: { dark: '#000000', light: '#ffffff' }
      });
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      return res.send(buffer);
    } catch (e) {
      return res.status(500).send('Erro ao renderizar QR Code.');
    }
  }
  res.status(404).send('Nenhum QR Code pendente no momento.');
});

// Helper resiliente para listar grupos do WhatsApp contornando instabilidades do getChats()


// ── Rotas do Relatório Executivo e Grupos do WhatsApp ────────
router.get('/api/whatsapp/grupos', async (req, res) => {
  try {
    if (!wppClient) {
      return res.json({ grupos: [], error: 'WhatsApp não inicializado.' });
    }
    const grupos = await obterGruposWhatsApp();
    res.json({ grupos });
  } catch (err) {
    console.error('[API /api/whatsapp/grupos] Erro:', err);
    res.status(500).json({ error: err.message, grupos: [] });
  }
});

router.post('/api/whatsapp/sincronizar-grupos', async (req, res) => {
  try {
    if (!wppClient) return res.json({ success: false, error: 'WhatsApp não inicializado.' });
    await sincronizarGruposAutomaticamente();
    const targetState = await getOrLoadState(req);
    const grupos = await obterGruposWhatsApp();
    res.json({ success: true, grupos, cfg: targetState?.cfg });
  } catch (err) {
    console.error('[API /api/whatsapp/sincronizar-grupos] Erro:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/api/whatsapp/entrar-grupo', async (req, res) => {
  try {
    const { inviteCode, url } = req.body || {};
    let code = inviteCode;
    if (!code && url) {
      const m = url.match(/chat\.whatsapp\.com\/([a-zA-Z0-9_-]+)/);
      if (m) code = m[1];
    }
    if (!code) return res.status(400).json({ success: false, error: 'Código ou URL do convite não fornecido.' });
    if (!wppClient) return res.status(500).json({ success: false, error: 'WhatsApp não inicializado.' });

    const groupId = await wppClient.acceptInvite(code);
    await sincronizarGruposAutomaticamente();
    const targetState = await getOrLoadState(req);
    res.json({ success: true, groupId, cfg: targetState?.cfg });
  } catch (err) {
    console.error('[API /api/whatsapp/entrar-grupo] Erro:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/api/whatsapp/diagnostico', requirePermission('whatsapp:admin'), async (req, res) => {
  try {
    if (!wppClient || !wppClient.pupPage) {
      return res.json({ error: 'WhatsApp Web ou pupPage indisponível.' });
    }
    const info = await wppClient.pupPage.evaluate(async () => {
      const titles = [];
      document.querySelectorAll('span[title]').forEach(el => {
        const t = el.getAttribute('title');
        if (t && t.length > 1 && !titles.includes(t)) titles.push(t);
      });

      let storeChats = [];
      try {
        const coll = window.require ? window.require('WAWebCollections') : null;
        if (coll && coll.Chat) {
          const arr = typeof coll.Chat.getModelsArray === 'function' ? coll.Chat.getModelsArray() : (coll.Chat.models || []);
          storeChats = arr.map(c => ({
            id: c.id ? (c.id._serialized || c.id) : null,
            name: c.formattedTitle || c.name || (c.contact ? (c.contact.formattedName || c.contact.name) : '') || '',
            isGroup: Boolean(c.isGroup || (c.id && String(c.id._serialized || c.id).endsWith('@g.us'))),
            unreadCount: c.unreadCount || 0
          }));
        }
      } catch (e) {}

      return { titles, storeChats };
    });

    res.json({ success: true, ...info });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/api/whatsapp/screenshot', authMiddleware, requirePermission('whatsapp:admin'), async (req, res) => {
  try {
    if (!wppClient || !wppClient.pupPage) return res.status(400).json({ error: 'Puppeteer não disponível.' });
    const buffer = await wppClient.pupPage.screenshot({ type: 'png' });
    res.set('Content-Type', 'image/png');
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/api/whatsapp/pesquisar-termo/:termo', authMiddleware, requirePermission('whatsapp:admin'), async (req, res) => {
  try {
    if (!wppClient || !wppClient.pupPage) return res.json({ error: 'pupPage indisponível' });
    const termo = req.params.termo;
    const resultado = await wppClient.pupPage.evaluate(async (busca) => {
      const searchBox = document.querySelector('div[contenteditable="true"][data-tab="3"]') ||
                        document.querySelector('div[role="textbox"]');
      if (!searchBox) return { erro: 'Caixa de busca não encontrada no DOM' };

      searchBox.focus();
      document.execCommand('selectAll', false, null);
      document.execCommand('insertText', false, busca);

      await new Promise(r => setTimeout(r, 2500));

      const items = [];
      document.querySelectorAll('span[title]').forEach(el => {
        const t = el.getAttribute('title');
        if (t && !items.includes(t)) items.push(t);
      });

      let chatsEncontrados = [];
      try {
        const coll = window.require ? window.require('WAWebCollections') : null;
        if (coll && coll.Chat) {
          const arr = typeof coll.Chat.getModelsArray === 'function' ? coll.Chat.getModelsArray() : (coll.Chat.models || []);
          chatsEncontrados = arr.map(c => ({
            id: c.id ? (c.id._serialized || c.id) : null,
            name: c.formattedTitle || c.name || (c.contact ? (c.contact.formattedName || c.contact.name) : '') || '',
            isGroup: Boolean(c.isGroup || (c.id && String(c.id._serialized || c.id).endsWith('@g.us')))
          })).filter(c => c.name.toLowerCase().includes(busca.toLowerCase()) || c.isGroup);
        }
      } catch (eColl) {}

      return { titlesAposBusca: items, chatsEncontrados };
    }, termo);

    res.json(resultado);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/api/whatsapp/imagem-preview.jpg', async (req, res) => {
  try {
    const targetState = await getOrLoadState(req);
    const tenantKey = getTenantKey(req);
    const dataRef = req.query.dataRef || null;
    const buffer = await gerarImagemIndicadoresJPG(targetState, tenantKey, { dataRef });
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.send(buffer);
  } catch (err) {
    console.error('[API /api/whatsapp/imagem-preview.jpg] Erro:', err);
    res.status(500).send('Erro ao renderizar imagem preview.');
  }
});

router.get('/api/financeiro/dashboard', requirePermission('financial:read'), async (req, res) => {
  try {
    const targetState = await getOrLoadState(req);
    const filtro = req.query.filtro || '30d';
    const dataRef = req.query.dataRef || null;
    const customDe = req.query.de || null;
    const customAte = req.query.ate || null;
    const dash = financialEngine.obterDashboardFinanceiro(targetState, { filtro, dataRef, customDe, customAte });
    res.json(dash);
  } catch (err) {
    console.error('[API /api/financeiro/dashboard] Erro:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/api/whatsapp/relatorio-preview', requirePermission('financial:read', 'reports:read'), async (req, res) => {
  try {
    const targetState = await getOrLoadState(req);
    const dataRef = req.query.dataRef || null;
    const options = { dataRef };
    const msgsAdmin = gerarMensagensAdmin(targetState, options);
    const msgsOp = gerarMensagensOperacao(targetState, options);
    const rel = gerarRelatorioExecutivo(targetState, options);
    res.json({
      success: true,
      texto: rel.texto,
      mensagensAdmin: msgsAdmin,
      mensagensOperacao: msgsOp,
      indicadores: rel.indicadores
    });
  } catch (err) {
    console.error('[API /api/whatsapp/relatorio-preview] Erro:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/whatsapp/disparar-grupo/:tipo', authMiddleware, async (req, res) => {
  try {
    const targetState = await getOrLoadState(req);
    const tenantKey = getTenantKey(req);
    const tipo = req.params.tipo === 'operacao' ? 'operacao' : 'admin';
    const resultado = await enviarRelatorioGrupo(tipo, { tenantKey, state: targetState });
    res.json(resultado);
  } catch (err) {
    console.error(`[API /api/whatsapp/disparar-grupo/${req.params.tipo}] Erro:`, err);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/api/whatsapp/disparar-relatorio-admin', authMiddleware, async (req, res) => {
  try {
    const targetState = await getOrLoadState(req);
    const tenantKey = getTenantKey(req);
    const resultado = await enviarRelatorioAdministradores(null, { tenantKey, state: targetState });
    res.json(resultado);
  } catch (err) {
    console.error('[API /api/whatsapp/disparar-relatorio-admin] Erro:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/api/whatsapp/agendador-relatorio/executar', authMiddleware, requirePermission('whatsapp:admin', 'financial:write'), async (req, res) => {
  try {
    const { dryRun, force, horaRef, dataRef } = req.body || {};
    const resultados = await executarCicloDisparoRelatorioDiario({
      dryRun: Boolean(dryRun),
      force: Boolean(force),
      horaRef,
      dataRef
    });
    res.json({ success: true, resultados });
  } catch (err) {
    console.error('[API /api/whatsapp/agendador-relatorio/executar] Erro:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/api/whatsapp/config-grupos', async (req, res) => {
  try {
    const targetState = (await getOrLoadState(req)) || {};
    const cfg = targetState.cfg || {};
    res.json({
      grupoAdminId: cfg.grupoAdminId || process.env.WHATSAPP_GRUPO_ADMIN_ID || '',
      grupoOperacaoId: cfg.grupoOperacaoId || process.env.WHATSAPP_GRUPO_OPERACAO_ID || '',
      horaRelatorio: cfg.horaRelatorioDiario || process.env.HORA_RELATORIO_DIARIO || '07:30',
      envioAutomatico: cfg.envioAutomaticoRelatorio !== false && process.env.ENVIO_AUTOMATICO_RELATORIO !== 'false',
      apenasDiasUteis: cfg.relatorioApenasDiasUteis !== false && process.env.RELATORIO_APENAS_DIAS_UTEIS !== 'false',
      avisarCaixaWhatsapp: Boolean(cfg.avisarCaixaWhatsapp),
      wppStatus: wppStatus.status
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/whatsapp/config-grupos', authMiddleware, async (req, res) => {
  try {
    const targetState = await getOrLoadState(req);
    if (!targetState) return res.status(404).json({ error: 'Tenant não encontrado.' });
    if (!targetState.cfg) targetState.cfg = {};

    const { grupoAdminId, grupoOperacaoId, horaRelatorio, envioAutomatico, apenasDiasUteis, avisarCaixaWhatsapp } = req.body || {};

    let cfgAtualizada = null;
    const mutateRes = await mutateTenantState(req, async (draft) => {
      if (!draft.cfg) draft.cfg = {};
      if (grupoAdminId !== undefined) {
        if (grupoAdminId === '120363428179962435@g.us' || grupoAdminId === '120363428840376088@g.us') {
          draft.cfg.grupoAdminId = '';
        } else {
          draft.cfg.grupoAdminId = grupoAdminId;
        }
      }
      if (grupoOperacaoId !== undefined) draft.cfg.grupoOperacaoId = grupoOperacaoId;
      if (horaRelatorio) draft.cfg.horaRelatorioDiario = horaRelatorio;
      if (typeof envioAutomatico === 'boolean') draft.cfg.envioAutomaticoRelatorio = envioAutomatico;
      if (typeof apenasDiasUteis === 'boolean') draft.cfg.relatorioApenasDiasUteis = apenasDiasUteis;
      if (typeof avisarCaixaWhatsapp === 'boolean') draft.cfg.avisarCaixaWhatsapp = avisarCaixaWhatsapp;
      cfgAtualizada = draft.cfg;
      return draft;
    });

    if (!mutateRes.ok) {
      return res.status(mutateRes.status || 500).json({ error: mutateRes.error || 'Falha ao salvar configurações de grupo.' });
    }
    res.json({ success: true, cfg: cfgAtualizada });
  } catch (err) {
    console.error('[API /api/whatsapp/config-grupos POST] Erro:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/api/whatsapp/config-relatorio', async (req, res) => {
  try {
    const targetState = (await getOrLoadState(req)) || {};
    const envAdmins = (process.env.WHATSAPP_ADMIN_NUMBERS || '').split(',').map(s => s.trim()).filter(Boolean);
    const cfgAdmins = targetState.cfg?.adminFones || [];
    const adminFones = [...new Set([...envAdmins, ...cfgAdmins])];
    const cfg = targetState.cfg || {};
    const horaRelatorio = cfg.horaRelatorioDiario || process.env.HORA_RELATORIO_DIARIO || '07:30';
    const envioAutomatico = cfg.envioAutomaticoRelatorio !== false && process.env.ENVIO_AUTOMATICO_RELATORIO !== 'false';
    const apenasDiasUteis = cfg.relatorioApenasDiasUteis !== false && process.env.RELATORIO_APENAS_DIAS_UTEIS !== 'false';
    const avisarCaixaWhatsapp = Boolean(cfg.avisarCaixaWhatsapp);
    const comandosFinanceirosEscrita = Boolean(cfg.comandosFinanceirosEscrita);
    const rawLimite = Number(cfg.limiteValorLancamentoWhatsapp);
    const limiteValorLancamentoWhatsapp = (!isNaN(rawLimite) && rawLimite > 0) ? rawLimite : 1000.00;

    res.json({
      adminFones,
      horaRelatorio,
      envioAutomatico,
      apenasDiasUteis,
      avisarCaixaWhatsapp,
      comandosFinanceirosEscrita,
      limiteValorLancamentoWhatsapp,
      wppStatus: wppStatus.status
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/whatsapp/config-relatorio', authMiddleware, async (req, res) => {
  try {
    const {
      adminFones,
      horaRelatorio,
      envioAutomatico,
      apenasDiasUteis,
      avisarCaixaWhatsapp,
      comandosFinanceirosEscrita,
      limiteValorLancamentoWhatsapp
    } = req.body || {};

    let cfgAtualizada = null;
    const mutateRes = await mutateTenantState(req, async (draft) => {
      if (!draft.cfg) draft.cfg = {};
      if (Array.isArray(adminFones)) draft.cfg.adminFones = adminFones;
      if (horaRelatorio) draft.cfg.horaRelatorioDiario = horaRelatorio;
      if (typeof envioAutomatico === 'boolean') draft.cfg.envioAutomaticoRelatorio = envioAutomatico;
      if (typeof apenasDiasUteis === 'boolean') draft.cfg.relatorioApenasDiasUteis = apenasDiasUteis;
      if (typeof avisarCaixaWhatsapp === 'boolean') draft.cfg.avisarCaixaWhatsapp = avisarCaixaWhatsapp;
      if (typeof comandosFinanceirosEscrita === 'boolean') draft.cfg.comandosFinanceirosEscrita = comandosFinanceirosEscrita;

      if (limiteValorLancamentoWhatsapp !== undefined) {
        const limNum = Number(limiteValorLancamentoWhatsapp);
        draft.cfg.limiteValorLancamentoWhatsapp = (!isNaN(limNum) && limNum > 0) ? limNum : 1000.00;
      }

      cfgAtualizada = draft.cfg;
      return draft;
    });

    if (!mutateRes.ok) {
      return res.status(mutateRes.status || 500).json({ error: mutateRes.error || 'Falha ao salvar configuração de relatório.' });
    }
    res.json({ success: true, cfg: cfgAtualizada });
  } catch (err) {
    console.error('[API /api/whatsapp/config-relatorio POST] Erro:', err);
    res.status(500).json({ error: err.message });
  }
});

/* ── Integração IA: Upload e Leitura de Nota Fiscal ──────── */

module.exports = router;
