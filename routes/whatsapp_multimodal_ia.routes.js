'use strict';

/**
 * routes/whatsapp_multimodal_ia.routes.js
 *
 * Endpoints REST:
 * 1. POST /api/whatsapp/multimodal/configurar
 * 2. POST /api/whatsapp/multimodal/processar-audio
 * 3. POST /api/whatsapp/multimodal/processar-imagem-ocr
 * 4. GET  /api/whatsapp/multimodal/telemetria
 *
 * Teto Modular: <= 190 linhas
 */

const express = require('express');
const router = express.Router();
const {
  getOrLoadState,
  mutateTenantState,
  requirePermission
} = require('../lib/serverContext');

const {
  configurarProvedoresMultimodaisWhatsApp,
  transcreverAudioEExecutarSkillWhatsApp,
  processarImagemOcrWhatsApp,
  obterTelemetriaMultimodalWhatsApp
} = require('../services/whatsapp/whatsappMultimodalAudioVisionService');

// 1. Configurar provedores multimodais (Whisper ASR e Visão OCR)
router.post('/api/whatsapp/multimodal/configurar', requirePermission('whatsapp:admin'), async (req, res) => {
  try {
    let config = null;
    await mutateTenantState(req, draft => {
      config = configurarProvedoresMultimodaisWhatsApp(draft, req.body);
    });
    res.json({ success: true, config });
  } catch (err) {
    res.status(err.status || 400).json({ success: false, code: err.code || 'CONFIG_MULTIMODAL_ERROR', error: err.message });
  }
});

// 2. Processar Áudio/Voz: transcrição ASR e disparo do Motor NLU
router.post('/api/whatsapp/multimodal/processar-audio', async (req, res) => {
  try {
    let result = null;
    await mutateTenantState(req, draft => {
      const payload = {
        ...req.body,
        perfilRemetente: req.user?.role || req.body.perfilRemetente || 'cliente',
        telefoneRemetente: req.body.telefoneRemetente || req.body.remetente || '5585999990000'
      };
      result = transcreverAudioEExecutarSkillWhatsApp(draft, payload);
    });
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(err.status || 400).json({ success: false, code: err.code || 'AUDIO_PROCESS_ERROR', error: err.message });
  }
});

// 3. Processar Imagem/Foto OCR: PIX, DANFE, Portaria e Peça Condenada
router.post('/api/whatsapp/multimodal/processar-imagem-ocr', async (req, res) => {
  try {
    let result = null;
    await mutateTenantState(req, draft => {
      const payload = {
        ...req.body,
        perfilRemetente: req.user?.role || req.body.perfilRemetente || 'cliente',
        telefoneRemetente: req.body.telefoneRemetente || req.body.remetente || '5585999990000'
      };
      result = processarImagemOcrWhatsApp(draft, payload);
    });
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(err.status || 400).json({ success: false, code: err.code || 'OCR_PROCESS_ERROR', error: err.message });
  }
});

// 4. Telemetria e status operacional dos motores multimodais
router.get('/api/whatsapp/multimodal/telemetria', async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const telemetria = obterTelemetriaMultimodalWhatsApp(state);
    res.json({ success: true, telemetria });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, code: 'TELEMETRIA_MULTIMODAL_ERROR', error: err.message });
  }
});

module.exports = router;

