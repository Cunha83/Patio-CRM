'use strict';

/**
 * routes/patio_terminal_box_despacho.routes.js
 * 
 * Endpoints REST para Terminal Operacional de Box, Registro de Peça Condenada
 * na Desmontagem & Motor de Despacho Inteligente de Mecânicos.
 * 
 * Arquitetura: <= 350 linhas
 */

const express = require('express');
const router = express.Router();
const {
  getOrLoadState,
  mutateTenantState,
  extractTenantId,
  requirePermission
} = require('../lib/serverContext');

const dispatchService = require('../services/patio/mechanicSmartDispatchBoxService');

// 1. Configurar perfil e especialidades do mecânico
router.put('/api/patio/mecanicos/:mecanicoId/especialidades', requirePermission('patio:write', 'boxes:manage'), async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    const mecanicoId = req.params.mecanicoId;
    let operacao = null;

    const saveRes = await mutateTenantState(req, (draft) => {
      operacao = dispatchService.configurarPerfilEspecialidadesMecanico(draft, {
        tenantId,
        mecanicoId,
        ...req.body
      });
    });

    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({ success: false, error: saveRes?.error || 'Falha ao salvar perfil.' });
    }
    res.json({ success: true, ...operacao });
  } catch (err) {
    res.status(400).json({ success: false, code: err.code || 'PROFILE_ERROR', error: err.message });
  }
});

// 2. Recomendar mecânico ideal para serviço por score ponderado
router.get('/api/patio/despacho-inteligente/recomendar', requirePermission('patio:read'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const tenantId = extractTenantId(req);
    const recomendacao = dispatchService.recomendarMecanicoIdealParaServico(state, {
      tenantId,
      especialidadeRequerida: req.query.especialidadeRequerida,
      competencia: req.query.competencia
    });

    res.json({ success: true, ...recomendacao });
  } catch (err) {
    res.status(500).json({ success: false, code: err.code || 'RECOMMEND_ERROR', error: err.message });
  }
});

// 3. Despachar serviço e alocar apontamento de box inteligente
router.post('/api/patio/despacho-inteligente/alocar', requirePermission('patio:write', 'boxes:manage'), async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    let operacao = null;

    const saveRes = await mutateTenantState(req, (draft) => {
      operacao = dispatchService.despacharServicoBoxInteligente(draft, {
        tenantId,
        ...req.body,
        autorId: req.user?.id || 'coordenador_patio',
        autorNome: req.user?.nome || 'Coordenador Pátio'
      });
    });

    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({ success: false, error: saveRes?.error || 'Falha ao despachar serviço.' });
    }
    res.json({ success: true, ...operacao });
  } catch (err) {
    res.status(400).json({ success: false, code: err.code || 'DISPATCH_ERROR', error: err.message });
  }
});

// 4. Registrar evidência técnica de peça condenada no box
router.post('/api/patio/terminal-box/evidencia-peca-condenada', requirePermission('patio:write'), async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    let operacao = null;

    const saveRes = await mutateTenantState(req, (draft) => {
      operacao = dispatchService.registrarEvidenciaPecaCondenadaBox(draft, {
        tenantId,
        ...req.body,
        mecanicoId: req.body.mecanicoId || req.user?.id,
        mecanicoNome: req.body.mecanicoNome || req.user?.nome
      });
    });

    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({ success: false, error: saveRes?.error || 'Falha ao registrar evidência.' });
    }
    res.json({ success: true, ...operacao });
  } catch (err) {
    res.status(400).json({ success: false, code: err.code || 'EVIDENCE_ERROR', error: err.message });
  }
});

// 5. Obter dados consolidados do painel do terminal operacional do box
router.get('/api/patio/terminal-box/painel', requirePermission('patio:read'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const dados = dispatchService.listarFilaTerminalOperacionalBox(state, {
      boxId: req.query.boxId,
      mecanicoId: req.query.mecanicoId
    });

    res.json({ success: true, dados });
  } catch (err) {
    res.status(500).json({ success: false, code: err.code || 'TERMINAL_ERROR', error: err.message });
  }
});

module.exports = router;
