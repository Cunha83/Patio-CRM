'use strict';

/**
 * routes/patio_prontuario_laudo.routes.js
 *
 * Endpoints REST para Prontuário Técnico 360º por Placa/Eixo,
 * Avaliação de Garantia e Laudos Técnicos com SHA-256:
 * 1. POST /api/patio/veiculos/:placa/intervencoes-eixo (Registra intervenção técnica por eixo)
 * 2. GET  /api/patio/veiculos/:placa/prontuario (Consulta prontuário consolidado 360º)
 * 3. POST /api/patio/veiculos/:placa/avaliar-garantia (Avalia cobertura por KM e Tempo)
 * 4. POST /api/patio/veiculos/:placa/laudo-tecnico (Emite laudo de suspensão pesada com SHA-256)
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

const vehicleTechnicalDossierService = require('../services/patio/vehicleTechnicalDossierService');

// 1. Registrar intervenção técnica por eixo
router.post('/api/patio/veiculos/:placa/intervencoes-eixo', requirePermission('os:write', 'patio:write', 'patio:manage'), async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    const placa = req.params.placa;
    let resultado = null;

    const saveRes = await mutateTenantState(req, (draft) => {
      resultado = vehicleTechnicalDossierService.registrarIntervencaoPorEixoVeiculo(draft, {
        tenantId,
        placa,
        ...req.body
      });
    });

    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({ success: false, error: saveRes?.error || 'Falha ao registrar intervenção de eixo.' });
    }

    res.json({ success: true, ...resultado });
  } catch (err) {
    res.status(err.status || 400).json({ success: false, code: 'AXLE_INTERVENTION_ERROR', error: err.message });
  }
});

// 2. Consultar prontuário técnico 360º consolidado
router.get('/api/patio/veiculos/:placa/prontuario', requirePermission('os:read', 'patio:read', 'patio:view'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const placa = req.params.placa;
    const { kmAtualConsulta, dataReferencia } = req.query;

    const prontuario = vehicleTechnicalDossierService.consolidarProntuarioTecnicoPlaca(state, placa, {
      kmAtualConsulta: kmAtualConsulta ? Number(kmAtualConsulta) : null,
      dataReferencia
    });

    res.json({ success: true, prontuario });
  } catch (err) {
    res.status(err.status || 400).json({ success: false, code: 'PRONTUARIO_ERROR', error: err.message });
  }
});

// 3. Avaliar cobertura de garantia
router.post('/api/patio/veiculos/:placa/avaliar-garantia', requirePermission('os:read', 'os:write', 'patio:read', 'patio:view'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const placa = req.params.placa;

    const avaliacao = vehicleTechnicalDossierService.avaliarCoberturaGarantiaPecaOuServico(state, {
      placa,
      ...req.body
    });

    res.json({ success: true, avaliacao });
  } catch (err) {
    res.status(err.status || 400).json({ success: false, code: 'WARRANTY_EVAL_ERROR', error: err.message });
  }
});

// 4. Emitir laudo técnico de suspensão pesada com hash SHA-256
router.post('/api/patio/veiculos/:placa/laudo-tecnico', requirePermission('os:write', 'patio:write', 'patio:manage'), async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    const placa = req.params.placa;
    let resultado = null;

    const saveRes = await mutateTenantState(req, (draft) => {
      resultado = vehicleTechnicalDossierService.emitirLaudoTecnicoSuspensaoPesada(draft, {
        tenantId,
        placa,
        ...req.body
      });
    });

    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({ success: false, error: saveRes?.error || 'Falha ao emitir laudo técnico.' });
    }

    res.json({ success: true, ...resultado });
  } catch (err) {
    res.status(err.status || 400).json({ success: false, code: 'TECHNICAL_REPORT_ERROR', error: err.message });
  }
});

module.exports = router;
