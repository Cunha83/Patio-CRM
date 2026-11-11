'use strict';

/**
 * routes/torre_controle_executiva.routes.js
 *
 * Endpoints REST da Torre de Controle Executiva 360º:
 * 1. GET  /api/executivo/torre-controle (Consolidação 360º dos 4 pilares operacionais)
 * 2. GET  /api/executivo/torre-controle/alertas-criticos (Fila priorizada de alertas de comando)
 * 3. POST /api/executivo/torre-controle/briefing-whatsapp (Disparo de Briefing Diário no WhatsApp)
 *
 * Teto Modular: <= 350 linhas
 */

const express = require('express');
const router = express.Router();

const {
  getOrLoadState,
  mutateTenantState,
  extractTenantId,
  requirePermission
} = require('../lib/serverContext');

const controlTowerService = require('../services/executive/controlTowerService');

// 1. Consolidação da Torre de Controle 360º
router.get('/api/executivo/torre-controle', requirePermission('financial:read', 'os:read', 'patio:read', 'executive:read'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const { competencia, dataReferencia } = req.query;

    const torreControle = controlTowerService.consolidarTorreControleExecutiva360(state, {
      competencia,
      dataReferencia
    });

    res.json({ success: true, torreControle });
  } catch (err) {
    res.status(err.status || 400).json({ success: false, code: 'CONTROL_TOWER_ERROR', error: err.message });
  }
});

// 2. Fila Priorizada de Alertas Críticos de Comando
router.get('/api/executivo/torre-controle/alertas-criticos', requirePermission('financial:read', 'os:read', 'patio:read', 'executive:read'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const { competencia, dataReferencia, categoria, severidade } = req.query;

    let alertas = controlTowerService.gerarFilaAlertasCriticosComando(state, {
      competencia,
      dataReferencia
    });

    if (categoria) {
      alertas = alertas.filter(a => a.categoria === categoria);
    }
    if (severidade) {
      alertas = alertas.filter(a => a.severidade === severidade);
    }

    res.json({ success: true, total: alertas.length, alertas });
  } catch (err) {
    res.status(err.status || 400).json({ success: false, code: 'ALERTS_TOWER_ERROR', error: err.message });
  }
});

// 3. Disparo do Briefing Diário no WhatsApp da Diretoria
router.post('/api/executivo/torre-controle/briefing-whatsapp', requirePermission('financial:write', 'executive:write', 'financial:manage'), async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    let resultado = null;

    const saveRes = await mutateTenantState(req, (draft) => {
      resultado = controlTowerService.dispararBriefingDiarioDiretoriaWhatsApp(draft, {
        tenantId,
        ...req.body
      });
    });

    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({ success: false, error: saveRes?.error || 'Falha ao disparar briefing diário.' });
    }

    res.json({ success: true, ...resultado });
  } catch (err) {
    res.status(err.status || 400).json({ success: false, code: 'BRIEFING_DISPATCH_ERROR', error: err.message });
  }
});

module.exports = router;
