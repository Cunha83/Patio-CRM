const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const {
  getOrLoadState,
  salvarEstado,
  persistTenantState,
  mutateTenantState,
  extractTenantId,
  requirePermission,
  getAiClient
} = require('../lib/serverContext');
const { salvarUpload, removerUpload } = require('../lib/file-storage');
const lgpdService = require('../services/lgpdService');
const demoDataService = require('../services/demoDataService');
const operationalSummaryService = require('../services/operationalSummaryService');
const financialEngine = require('../services/financialEngine');

const limiterUploads = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  message: { success: false, error: 'Limite de uploads temporariamente excedido.' },
  standardHeaders: true,
  legacyHeaders: false
});

router.get('/api/configuracoes/empresa', requirePermission('company:settings', 'admin:settings'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const cfg = state.cfg || {};
    res.json({
      success: true,
      empresa: cfg.empresa || '',
      cnpj: cfg.cnpj || '',
      endereco: cfg.endereco || '',
      fone: cfg.fone || '',
      identidadeVisual: cfg.identidadeVisual || { logo: null, imagemInstitucional: null }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.put('/api/configuracoes/empresa', requirePermission('company:settings', 'admin:settings'), async (req, res) => {
  try {
    const { empresa, cnpj, endereco, fone } = req.body || {};
    let cfgAtualizada;
    const saveRes = await mutateTenantState(req, (draft) => {
      if (!draft.cfg) draft.cfg = {};
      if (empresa !== undefined) draft.cfg.empresa = String(empresa).trim();
      if (cnpj !== undefined) draft.cfg.cnpj = String(cnpj).trim();
      if (endereco !== undefined) draft.cfg.endereco = String(endereco).trim();
      if (fone !== undefined) draft.cfg.fone = String(fone).trim();
      cfgAtualizada = draft.cfg;
    });

    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({ success: false, error: saveRes?.error || 'Falha ao persistir configurações.' });
    }

    res.json({ success: true, cfg: cfgAtualizada });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/api/configuracoes/empresa/logo', limiterUploads, requirePermission('company:settings', 'admin:settings'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const tenantId = extractTenantId(req);
    const body = req.body || {};
    const logoBase64 = body.logoBase64 || body.base64 || body.arquivoBase64 || body.logo || body.imagemBase64;
    const mimeType = body.mimeType || 'image/png';

    if (!logoBase64 || typeof logoBase64 !== 'string') {
      return res.status(400).json({ success: false, error: 'Arquivo de logotipo base64 é obrigatório.' });
    }

    // Validação de segurança: nunca aceitar executáveis ou formatos não-imagem
    const allowedMimes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/svg+xml'];
    const cleanMime = mimeType.toLowerCase().trim();
    if (!allowedMimes.includes(cleanMime)) {
      return res.status(400).json({ success: false, error: 'Formato de arquivo não permitido. Envie PNG, JPEG ou WEBP.' });
    }

    // Validação de tamanho: máximo 2MB
    const buffer = Buffer.from(logoBase64.replace(/^data:image\/[a-z+]+;base64,/, ''), 'base64');
    if (buffer.length > 2 * 1024 * 1024) {
      return res.status(400).json({ success: false, error: 'Logotipo excede o tamanho máximo de 2MB.' });
    }

    if (!state.cfg) state.cfg = {};
    if (!state.cfg.identidadeVisual) state.cfg.identidadeVisual = {};

    const uploadMeta = salvarUpload({ tenantId, tipo: 'logo', buffer, mimeType: cleanMime });
    state.cfg.identidadeVisual.logo = uploadMeta.url;
    state.cfg.identidadeVisual.logoMeta = uploadMeta;
    state.cfg.identidadeVisual.updatedAt = new Date().toISOString();

    const saveRes = await persistTenantState(req, state);
    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({ success: false, error: saveRes?.error || 'Falha ao salvar logotipo.' });
    }
    res.json({ success: true, mensagem: 'Logotipo atualizado com sucesso!', url: uploadMeta.url });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/api/configuracoes/empresa/logo', requirePermission('company:settings', 'admin:settings'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    if (!state.cfg) state.cfg = {};
    if (!state.cfg.identidadeVisual) state.cfg.identidadeVisual = {};

    if (state.cfg.identidadeVisual.logoMeta?.path) {
      removerUpload({ filePath: state.cfg.identidadeVisual.logoMeta.path });
    }
    state.cfg.identidadeVisual.logo = null;
    state.cfg.identidadeVisual.logoMeta = null;
    state.cfg.identidadeVisual.updatedAt = new Date().toISOString();

    const saveRes = await persistTenantState(req, state);
    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({ success: false, error: saveRes?.error || 'Falha ao remover logotipo.' });
    }
    res.json({ success: true, mensagem: 'Logotipo removido com sucesso!' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/api/configuracoes/empresa/imagem-institucional', limiterUploads, requirePermission('company:settings', 'admin:settings'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const tenantId = extractTenantId(req);
    const body = req.body || {};
    const imagemBase64 = body.imagemBase64 || body.base64 || body.arquivoBase64 || body.imagem || body.logoBase64;
    const mimeType = body.mimeType || 'image/png';

    if (!imagemBase64 || typeof imagemBase64 !== 'string') {
      return res.status(400).json({ success: false, error: 'Arquivo de imagem base64 é obrigatório.' });
    }

    const allowedMimes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
    const cleanMime = mimeType.toLowerCase().trim();
    if (!allowedMimes.includes(cleanMime)) {
      return res.status(400).json({ success: false, error: 'Formato de arquivo não permitido. Envie PNG, JPEG ou WEBP.' });
    }

    const buffer = Buffer.from(imagemBase64.replace(/^data:image\/[a-z+]+;base64,/, ''), 'base64');
    if (buffer.length > 2 * 1024 * 1024) {
      return res.status(400).json({ success: false, error: 'Imagem excede o tamanho máximo de 2MB.' });
    }

    if (!state.cfg) state.cfg = {};
    if (!state.cfg.identidadeVisual) state.cfg.identidadeVisual = {};

    const uploadMeta = salvarUpload({ tenantId, tipo: 'imagem_institucional', buffer, mimeType: cleanMime });
    state.cfg.identidadeVisual.imagemInstitucional = uploadMeta.url;
    state.cfg.identidadeVisual.imagemInstitucionalMeta = uploadMeta;
    state.cfg.identidadeVisual.updatedAt = new Date().toISOString();

    const saveRes = await persistTenantState(req, state);
    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({ success: false, error: saveRes?.error || 'Falha ao salvar imagem institucional.' });
    }
    res.json({ success: true, mensagem: 'Imagem institucional atualizada com sucesso!', url: uploadMeta.url });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/api/configuracoes/empresa/imagem-institucional', requirePermission('company:settings', 'admin:settings'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    if (!state.cfg) state.cfg = {};
    if (!state.cfg.identidadeVisual) state.cfg.identidadeVisual = {};

    if (state.cfg.identidadeVisual.imagemInstitucionalMeta?.path) {
      removerUpload({ filePath: state.cfg.identidadeVisual.imagemInstitucionalMeta.path });
    }
    state.cfg.identidadeVisual.imagemInstitucional = null;
    state.cfg.identidadeVisual.imagemInstitucionalMeta = null;
    state.cfg.identidadeVisual.updatedAt = new Date().toISOString();

    const saveRes = await persistTenantState(req, state);
    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({ success: false, error: saveRes?.error || 'Falha ao remover imagem institucional.' });
    }
    res.json({ success: true, mensagem: 'Imagem institucional removida com sucesso!' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── 8. CONFIGURAÇÕES: ASSISTENTE VIRTUAL E VOZ ───────────────────

module.exports = router;
