'use strict';

/**
 * routes/crm_preventiva_preditiva.routes.js
 *
 * Endpoints REST para Manutenção Preventiva Preditiva de Frotas:
 * 1. POST /api/crm/preventiva-preditiva/planos (Cadastra/atualiza plano preventivo)
 * 2. POST /api/crm/preventiva-preditiva/telemetria-km (Registra leitura de hodômetro)
 * 3. GET  /api/crm/preventiva-preditiva/radar (Consulta radar semafórico e KPIs)
 * 4. POST /api/crm/preventiva-preditiva/disparar-whatsapp (Dispara régua ativa de WhatsApp)
 * 5. POST /api/crm/preventiva-preditiva/:alertaId/converter-os (Converte alerta em OS preventiva)
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

const fleetPredictiveMaintenanceService = require('../services/crm/fleetPredictiveMaintenanceService');

// 1. Cadastrar/atualizar plano preventivo
router.post('/api/crm/preventiva-preditiva/planos', requirePermission('crm:write', 'crm:manage', 'os:write'), async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    let resultado = null;

    const saveRes = await mutateTenantState(req, (draft) => {
      resultado = fleetPredictiveMaintenanceService.configurarPlanoPreventivoVeiculo(draft, {
        tenantId,
        ...req.body
      });
    });

    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({ success: false, error: saveRes?.error || 'Falha ao salvar plano preventivo.' });
    }

    res.json({ success: true, ...resultado });
  } catch (err) {
    res.status(err.status || 400).json({ success: false, code: err.code || 'PREVENTIVE_PLAN_ERROR', error: err.message });
  }
});

// 2. Registrar leitura de telemetria/hodômetro
router.post('/api/crm/preventiva-preditiva/telemetria-km', requirePermission('crm:write', 'crm:manage', 'os:write'), async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    let resultado = null;

    const saveRes = await mutateTenantState(req, (draft) => {
      resultado = fleetPredictiveMaintenanceService.atualizarTelemetriaKmFrota(draft, {
        tenantId,
        ...req.body
      });
    });

    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({ success: false, error: saveRes?.error || 'Falha ao registrar telemetria.' });
    }

    res.json({ success: true, ...resultado });
  } catch (err) {
    res.status(err.status || 400).json({ success: false, code: err.code || 'TELEMETRY_ERROR', error: err.message });
  }
});

// 3. Consultar radar preventivo preditivo
router.get('/api/crm/preventiva-preditiva/radar', requirePermission('crm:read', 'crm:manage', 'os:read'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const resultado = fleetPredictiveMaintenanceService.apurarRadarPreventivaPreditiva(state, {
      clienteId: req.query.clienteId,
      placa: req.query.placa,
      statusPreventivo: req.query.statusPreventivo,
      dataReferencia: req.query.dataReferencia
    });

    res.json({ success: true, ...resultado });
  } catch (err) {
    res.status(err.status || 400).json({ success: false, code: err.code || 'RADAR_ERROR', error: err.message });
  }
});

// 4. Disparar régua preventiva no WhatsApp
router.post('/api/crm/preventiva-preditiva/disparar-whatsapp', requirePermission('crm:write', 'crm:manage', 'whatsapp:write'), async (req, res) => {
  try {
    let resultado = null;

    const saveRes = await mutateTenantState(req, (draft) => {
      resultado = fleetPredictiveMaintenanceService.dispararReguaPreventivaWhatsApp(draft, {
        alertaIds: req.body.alertaIds,
        incluirStatus: req.body.incluirStatus,
        responsavel: req.securityContext?.actorId || req.user?.username || 'Agente-Preditivo',
        timestamp: req.body.timestamp
      });
    });

    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({ success: false, error: saveRes?.error || 'Falha ao disparar régua WhatsApp.' });
    }

    res.json({ success: true, ...resultado });
  } catch (err) {
    res.status(err.status || 400).json({ success: false, code: err.code || 'DISPATCH_WHATSAPP_ERROR', error: err.message });
  }
});

// 5. Converter alerta em agendamento / OS preventiva
router.post('/api/crm/preventiva-preditiva/:alertaId/converter-os', requirePermission('crm:write', 'crm:manage', 'os:write'), async (req, res) => {
  try {
    let resultado = null;

    const saveRes = await mutateTenantState(req, (draft) => {
      resultado = fleetPredictiveMaintenanceService.converterAlertaPreventivoEmAgendamentoOS(draft, req.params.alertaId, {
        boxPreferencialId: req.body.boxPreferencialId,
        centroCustoId: req.body.centroCustoId,
        criarPreCheckinRecepcao: req.body.criarPreCheckinRecepcao !== false,
        responsavel: req.securityContext?.actorId || req.user?.username || 'Consultor-CRM',
        timestamp: req.body.timestamp
      });
    });

    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({ success: false, error: saveRes?.error || 'Falha ao converter alerta em OS.' });
    }

    res.json({ success: true, ...resultado });
  } catch (err) {
    res.status(err.status || 400).json({ success: false, code: err.code || 'CONVERT_ALERT_ERROR', error: err.message });
  }
});

module.exports = router;
