'use strict';

/**
 * routes/patio_boxes_gargalos.routes.js
 * 
 * Endpoints REST para Gestão Visual de Boxes Pesados, Alocação,
 * Transferência Atômica, Liberação e Monitoramento de SLA de Gargalos.
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

const patioBoxManagementService = require('../services/patio/patioBoxManagementService');
const patioBottleneckSlaService = require('../services/patio/patioBottleneckSlaService');

// 1. Cadastrar novo box físico
router.post('/api/patio/boxes', requirePermission('patio:write', 'boxes:manage'), async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    let operacao = null;

    const saveRes = await mutateTenantState(req, (draft) => {
      operacao = patioBoxManagementService.cadastrarBoxPatio(draft, {
        tenantId,
        ...req.body
      });
    });

    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({ success: false, error: saveRes?.error || 'Falha ao salvar box.' });
    }
    res.json({ success: true, ...operacao });
  } catch (err) {
    const status = err.code === 'BOX_CODE_ALREADY_EXISTS' ? 409 : 400;
    res.status(status).json({ success: false, code: err.code || 'BOX_CREATE_ERROR', error: err.message });
  }
});

// 2. Obter mapa de boxes e KPIs de ocupação
router.get('/api/patio/boxes/mapa', requirePermission('patio:read', 'boxes:read'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const tenantId = extractTenantId(req);
    const filtros = { tenantId, ...req.query };

    const boxes = patioBoxManagementService.listarMapaBoxesPatio(state, filtros);
    const indicadores = patioBottleneckSlaService.calcularIndicadoresOcupacaoEGargalos(state, filtros);

    res.json({ success: true, total: boxes.length, boxes, indicadores });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3. Alocar veículo/OS no box
router.post('/api/patio/boxes/alocar', requirePermission('patio:write', 'boxes:manage', 'os:write'), async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    let operacao = null;

    const saveRes = await mutateTenantState(req, (draft) => {
      operacao = patioBoxManagementService.alocarVeiculoBox(draft, {
        tenantId,
        ...req.body
      });
    });

    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({ success: false, error: saveRes?.error || 'Falha ao alocar veículo.' });
    }
    res.json({ success: true, ...operacao });
  } catch (err) {
    const status = (err.code === 'BOX_ALREADY_OCCUPIED' || err.code === 'OS_ALREADY_ALLOCATED_IN_BOX') ? 409 : 400;
    res.status(status).json({ success: false, code: err.code || 'BOX_ALLOCATE_ERROR', error: err.message });
  }
});

// 4. Transferir veículo/OS entre boxes
router.post('/api/patio/boxes/transferir', requirePermission('patio:write', 'boxes:manage', 'os:write'), async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    let operacao = null;

    const saveRes = await mutateTenantState(req, (draft) => {
      operacao = patioBoxManagementService.transferirVeiculoBox(draft, {
        tenantId,
        ...req.body
      });
    });

    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({ success: false, error: saveRes?.error || 'Falha ao transferir veículo.' });
    }
    res.json({ success: true, ...operacao });
  } catch (err) {
    const status = err.code === 'BOX_ALREADY_OCCUPIED' ? 409 : 400;
    res.status(status).json({ success: false, code: err.code || 'BOX_TRANSFER_ERROR', error: err.message });
  }
});

// 5. Liberar box
router.post('/api/patio/boxes/liberar', requirePermission('patio:write', 'boxes:manage', 'os:write'), async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    let operacao = null;

    const saveRes = await mutateTenantState(req, (draft) => {
      operacao = patioBoxManagementService.liberarBoxPatio(draft, {
        tenantId,
        ...req.body
      });
    });

    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({ success: false, error: saveRes?.error || 'Falha ao liberar box.' });
    }
    res.json({ success: true, ...operacao });
  } catch (err) {
    const status = err.code === 'QUALITY_INSPECTION_REQUIRED_OR_FAILED' ? 412 : 400;
    res.status(status).json({ success: false, code: err.code || 'BOX_RELEASE_ERROR', error: err.message });
  }
});

// 6. Registrar gargalo de parada com SLA
router.post('/api/patio/gargalos/registrar', requirePermission('patio:write', 'bottleneck:manage'), async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    let operacao = null;

    const saveRes = await mutateTenantState(req, (draft) => {
      operacao = patioBottleneckSlaService.registrarGargaloParadaOS(draft, {
        tenantId,
        ...req.body
      });
    });

    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({ success: false, error: saveRes?.error || 'Falha ao registrar gargalo.' });
    }
    res.json({ success: true, ...operacao });
  } catch (err) {
    res.status(400).json({ success: false, code: err.code || 'BOTTLENECK_REGISTER_ERROR', error: err.message });
  }
});

// 7. Encerrar gargalo de parada
router.post('/api/patio/gargalos/:id/encerrar', requirePermission('patio:write', 'bottleneck:manage'), async (req, res) => {
  try {
    let operacao = null;

    const saveRes = await mutateTenantState(req, (draft) => {
      operacao = patioBottleneckSlaService.encerrarGargaloParadaOS(draft, req.params.id, req.body);
    });

    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({ success: false, error: saveRes?.error || 'Falha ao encerrar gargalo.' });
    }
    res.json({ success: true, ...operacao });
  } catch (err) {
    const status = err.code === 'BOTTLENECK_NOT_FOUND' ? 404 : 400;
    res.status(status).json({ success: false, code: err.code || 'BOTTLENECK_CLOSE_ERROR', error: err.message });
  }
});

// 8. Obter indicadores analíticos de gargalos e ocupação
router.get('/api/patio/gargalos/indicadores', requirePermission('patio:read', 'bottleneck:read'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const tenantId = extractTenantId(req);
    const indicadores = patioBottleneckSlaService.calcularIndicadoresOcupacaoEGargalos(state, {
      tenantId,
      ...req.query
    });
    res.json({ success: true, ...indicadores });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;

