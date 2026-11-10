'use strict';

/**
 * routes/patio_qualidade_folha.routes.js
 * 
 * Endpoints REST para Checklist de Qualidade Pré-Entrega, OS de Garantia/Retrabalho,
 * Adiantamentos/Vales e Fechamento de Folha de Comissões.
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

const qualityWarrantyReworkService = require('../services/patio/qualityWarrantyReworkService');
const commissionPayrollService = require('../services/patio/commissionPayrollService');

// 1. Registrar inspeção de qualidade pré-entrega na OS
router.post('/api/patio/os/:id/inspecao-qualidade', requirePermission('quality:write', 'patio:write', 'os:write'), async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    const osId = req.params.id;
    let operacao = null;

    const saveRes = await mutateTenantState(req, (draft) => {
      operacao = qualityWarrantyReworkService.registrarInspecaoQualidadeOS(draft, osId, {
        tenantId,
        ...req.body
      });
    });

    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({
        success: false,
        error: saveRes?.error || 'Falha ao salvar inspeção de qualidade.'
      });
    }

    res.json({ success: true, ...operacao });
  } catch (err) {
    const status = err.code === 'OS_NOT_FOUND' ? 404 : 400;
    res.status(status).json({ success: false, code: err.code || 'QUALITY_INSPECTION_ERROR', error: err.message });
  }
});

// 2. Validar liberação de qualidade da OS
router.get('/api/patio/os/:id/validar-liberacao', requirePermission('quality:read', 'patio:read', 'os:read'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const osId = req.params.id;

    const validacao = qualityWarrantyReworkService.validarLiberacaoQualidadeOS(state, osId);
    res.json({ success: true, ...validacao });
  } catch (err) {
    const code = err.code || 'QUALITY_VALIDATION_ERROR';
    const status = code === 'QUALITY_INSPECTION_REQUIRED_OR_FAILED' ? 412 : (code === 'OS_NOT_FOUND' ? 404 : 400);
    res.status(status).json({ success: false, code, error: err.message });
  }
});

// 3. Abertura de OS de Garantia/Retrabalho
router.post('/api/patio/rework/abrir', requirePermission('quality:write', 'patio:write', 'os:write'), async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    let operacao = null;

    const saveRes = await mutateTenantState(req, (draft) => {
      operacao = qualityWarrantyReworkService.abrirOSGarantiaRetrabalho(draft, {
        tenantId,
        ...req.body
      });
    });

    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({
        success: false,
        error: saveRes?.error || 'Falha ao abrir OS de garantia/retrabalho.'
      });
    }

    res.json({ success: true, ...operacao });
  } catch (err) {
    const status = err.code === 'OS_ORIGEM_NOT_FOUND' ? 404 : 400;
    res.status(status).json({ success: false, code: err.code || 'REWORK_OPEN_ERROR', error: err.message });
  }
});

// 4. Listar ocorrências de retrabalho
router.get('/api/patio/rework/ocorrencias', requirePermission('quality:read', 'patio:read', 'os:read'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const tenantId = extractTenantId(req);
    const filtros = {
      tenantId,
      ...req.query
    };

    const ocorrencias = qualityWarrantyReworkService.listarOcorrenciasRetrabalho(state, filtros);
    res.json({ success: true, total: ocorrencias.length, ocorrencias });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 5. Registrar vale/adiantamento para mecânico
router.post('/api/patio/comissoes/vales', requirePermission('payroll:manage', 'financial:write', 'productivity:manage'), async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    let operacao = null;

    const saveRes = await mutateTenantState(req, (draft) => {
      operacao = commissionPayrollService.registrarValeAdiantamentoMecanico(draft, {
        tenantId,
        ...req.body
      });
    });

    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({
        success: false,
        error: saveRes?.error || 'Falha ao registrar vale de mecânico.'
      });
    }

    res.json({ success: true, ...operacao });
  } catch (err) {
    const status = err.code === 'PAYROLL_ALREADY_CLOSED' ? 409 : 400;
    res.status(status).json({ success: false, code: err.code || 'ADVANCE_ERROR', error: err.message });
  }
});

// 6. Listar vales/adiantamentos de mecânicos
router.get('/api/patio/comissoes/vales', requirePermission('payroll:read', 'financial:read', 'productivity:read'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const tenantId = extractTenantId(req);
    const filtros = {
      tenantId,
      ...req.query
    };

    const vales = commissionPayrollService.listarValesMecanico(state, filtros);
    res.json({ success: true, total: vales.length, vales });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 7. Apuração prévia de folha de comissões
router.get('/api/patio/comissoes/folha/previa', requirePermission('payroll:read', 'financial:read', 'productivity:read'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const tenantId = extractTenantId(req);
    const { mecanicoId, competencia } = req.query || {};

    if (!mecanicoId) {
      return res.status(400).json({ success: false, error: 'Parâmetro mecanicoId é obrigatório' });
    }

    const previa = commissionPayrollService.calcularPreviaFolhaComissoes(state, {
      tenantId,
      mecanicoId,
      competencia
    });

    res.json({ success: true, ...previa });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// 8. Fechamento definitivo de folha de comissões
router.post('/api/patio/comissoes/folha/fechar', requirePermission('payroll:manage', 'financial:write', 'productivity:manage'), async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    const responsavel = req.securityContext?.actorId || req.body?.responsavel;
    let operacao = null;

    const saveRes = await mutateTenantState(req, (draft) => {
      operacao = commissionPayrollService.fecharFolhaComissoesCompetencia(draft, {
        tenantId,
        ...req.body,
        responsavel
      });
    });

    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({
        success: false,
        error: saveRes?.error || 'Falha ao fechar folha de comissões.'
      });
    }

    res.json({ success: true, ...operacao });
  } catch (err) {
    const status = err.code === 'PAYROLL_ALREADY_CLOSED' ? 409 : 400;
    res.status(status).json({ success: false, code: err.code || 'PAYROLL_ERROR', error: err.message });
  }
});

module.exports = router;

