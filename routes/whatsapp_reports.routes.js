const express = require('express');
const router = express.Router();
const QRCode = require('qrcode');
const {
  getOrLoadState,
  mutateTenantState,
  extractTenantId,
  getTenantKey,
  requirePermission,
  authMiddleware,
  recordSecurityAudit
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
  gerarMensagensOperacao,
  gerarImagemIndicadoresJPG,
  enviarRelatorioGrupo,
  enviarRelatorioAdministradores
} = require('../services/reportGenerationService');
const { executarCicloDisparoRelatorioDiario } = require('../services/whatsapp/whatsappScheduler');
const financialEngine = require('../services/financialEngine');

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


module.exports = router;
