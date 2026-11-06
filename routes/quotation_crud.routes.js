const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const rateLimit = require('express-rate-limit');
const {
  getOrLoadState,
  salvarEstado,
  persistTenantState,
  mutateTenantState,
  extractTenantId,
  requirePermission,
  getWppClient
} = require('../lib/serverContext');
const quotationService = require('../services/quotationService');
const pricingEngine = require('../services/pricingEngine');
const {
  gerarTokenAprovacaoOrcamento,
  validarTokenAprovacaoOrcamento,
  consumirTokenAprovacaoOrcamento
} = require('../lib/tokens/securityToken');
const {
  getState,
  getDefaultState,
  PersistenceError
} = require('../lib/repository/stateRepository');

const ROOT_DIR = path.resolve(__dirname, '../');

const limiterAprovacaoPublica = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  message: { success: false, error: 'Muitas requisições para a aprovação digital. Tente novamente em alguns minutos.' },
  standardHeaders: true,
  legacyHeaders: false
});

router.get('/api/orcamentos', requirePermission('quotation:read'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const tenantId = extractTenantId(req);
    const { osId, status, placa } = req.query || {};
    const lista = quotationService.listarOrcamentos({ tenantId, state, osId, status, placa });
    res.json({
      success: true,
      total: lista.length,
      orcamentos: lista
    });
  } catch (err) {
    console.error('[API /api/orcamentos GET] Erro:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/api/orcamentos/:id', requirePermission('quotation:read'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const tenantId = extractTenantId(req);
    const orcamento = quotationService.obterOrcamento({ tenantId, state, quotationId: req.params.id });
    if (!orcamento) {
      return res.status(404).json({ error: 'Orçamento não encontrado.' });
    }
    res.json({
      success: true,
      orcamento
    });
  } catch (err) {
    console.error('[API /api/orcamentos/:id GET] Erro:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/orcamentos', requirePermission('quotation:write'), async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    const { osId, inspectionId, items, descontoGeral, validadeHoras, adicional, parentQuotationId, motivoAdicional } = req.body || {};
    let resultado = null;
    const saveRes = await mutateTenantState(req, (draft) => {
      resultado = quotationService.criarOrcamento({
        tenantId,
        state: draft,
        osId,
        inspectionId,
        items,
        descontoGeral,
        validadeHoras,
        adicional,
        parentQuotationId,
        motivoAdicional,
        actorId: req.securityContext?.actorId || 'operador'
      });
    });
    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({
        success: false,
        error: saveRes?.error || 'Falha ao criar orçamento.'
      });
    }
    res.json({
      success: true,
      ...resultado,
      novoEstado: { versao: saveRes.versao }
    });
  } catch (err) {
    console.error('[API /api/orcamentos POST] Erro:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/orcamentos/:id/nova-versao', requirePermission('quotation:write'), async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    const { novosItens, descontoGeral, motivo } = req.body || {};
    let resultado = null;
    const saveRes = await mutateTenantState(req, (draft) => {
      resultado = quotationService.criarNovaVersao({
        tenantId,
        state: draft,
        quotationId: req.params.id,
        novosItens,
        descontoGeral,
        motivo,
        actorId: req.securityContext?.actorId || 'operador'
      });
      if (!resultado.ok) {
        return { abort: true, resultado };
      }
    });
    if (saveRes?.aborted && saveRes?.mutatorResult?.resultado) {
      const r = saveRes.mutatorResult.resultado;
      return res.status(r.status || 400).json(r);
    }
    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({
        success: false,
        error: saveRes?.error || 'Falha ao criar nova versão de orçamento.'
      });
    }
    res.json({
      success: true,
      ...resultado,
      novoEstado: { versao: saveRes.versao }
    });
  } catch (err) {
    console.error('[API /api/orcamentos/:id/nova-versao] Erro:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/orcamentos/:id/adicional', requirePermission('quotation:write'), async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    const { items, motivo } = req.body || {};
    let resultado = null;
    const saveRes = await mutateTenantState(req, (draft) => {
      const orcAtual = quotationService.obterOrcamento({ tenantId, state: draft, quotationId: req.params.id });
      if (!orcAtual) {
        return { abort: true, notFound: true };
      }
      resultado = quotationService.criarAdicionalEscopo({
        tenantId,
        state: draft,
        osId: orcAtual.osId,
        parentQuotationId: orcAtual.id,
        items,
        motivo,
        actorId: req.securityContext?.actorId || 'operador'
      });
    });
    if (saveRes?.aborted && saveRes?.mutatorResult?.notFound) {
      return res.status(404).json({ error: 'Orçamento pai não encontrado.' });
    }
    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({
        success: false,
        error: saveRes?.error || 'Falha ao criar adicional de escopo.'
      });
    }
    res.json({
      success: true,
      ...resultado,
      novoEstado: { versao: saveRes.versao }
    });
  } catch (err) {
    console.error('[API /api/orcamentos/:id/adicional] Erro:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/orcamentos/:id/enviar', requirePermission('quotation:send'), async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    const { canal, validadeHoras } = req.body || {};
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    let resultado = null;
    const saveRes = await mutateTenantState(req, (draft) => {
      resultado = quotationService.enviarOrcamento({
        tenantId,
        state: draft,
        quotationId: req.params.id,
        canal: canal || 'link',
        validadeHoras,
        baseUrl,
        actorId: req.securityContext?.actorId || 'operador'
      });
      if (!resultado.ok) {
        return { abort: true, resultado };
      }
    });
    if (saveRes?.aborted && saveRes?.mutatorResult?.resultado) {
      const r = saveRes.mutatorResult.resultado;
      return res.status(r.status || 400).json(r);
    }
    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({
        success: false,
        error: saveRes?.error || 'Falha ao enviar orçamento.'
      });
    }
    res.json({
      success: true,
      ...resultado,
      novoEstado: { versao: saveRes.versao }
    });
  } catch (err) {
    console.error('[API /api/orcamentos/:id/enviar] Erro:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/api/orcamentos/:id/imprimir', requirePermission('quotation:read'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const tenantId = extractTenantId(req);
    const orcamento = quotationService.obterOrcamento({ tenantId, state, quotationId: req.params.id });
    if (!orcamento) {
      return res.status(404).json({ error: 'Orçamento não encontrado.' });
    }
    const os = (state.os || []).find(o => o.id === orcamento.osId);
    res.json({
      success: true,
      orcamento,
      os,
      empresa: state.cfg?.empresa || 'Oficina Mecânica'
    });
  } catch (err) {
    console.error('[API /api/orcamentos/:id/imprimir] Erro:', err);
    res.status(500).json({ error: err.message });
  }
});


/* ── Rotas de Peças, Almoxarifado e Estoque ─────────────────── */


module.exports = router;
