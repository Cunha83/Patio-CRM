const express = require('express');
const router = express.Router();
const {
  getOrLoadState,
  extractTenantId,
  requirePermission
} = require('../lib/serverContext');
const pricingEngine = require('../services/pricingEngine');

router.get('/api/precificacao/servicos/:id', requirePermission('pricing:read'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const tenantId = extractTenantId(req);
    const secCtx = req.securityContext;
    const userPermissions = secCtx ? secCtx.permissions : [];
    const recomendacao = pricingEngine.gerarRecomendacaoPreco({
      tenantId,
      state,
      serviceId: req.params.id,
      userPermissions
    });
    if (!recomendacao.ok) {
      return res.status(404).json({ success: false, error: recomendacao.error });
    }
    res.json({ success: true, ...recomendacao });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/api/precificacao/simular', requirePermission('pricing:recommend'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const tenantId = extractTenantId(req);
    const simulacao = pricingEngine.simularPrecificacao({
      tenantId,
      state,
      ...req.body
    });
    res.json({ success: true, ...simulacao });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.get('/api/precificacao/historico/:serviceId', requirePermission('pricing:read'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const tenantId = extractTenantId(req);
    const historico = pricingEngine.consultarHistoricoServico({
      tenantId,
      state,
      serviceId: req.params.serviceId,
      periodo: req.query.periodo,
      veiculoModelo: req.query.veiculoModelo,
      categoria: req.query.categoria
    });
    res.json({ success: true, historico });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/api/rentabilidade/resumo', requirePermission('profitability:read'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const tenantId = extractTenantId(req);
    const resumo = pricingEngine.obterResumoRentabilidade({
      tenantId,
      state,
      periodo: req.query.periodo
    });
    res.json({ success: true, resumo });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/api/rentabilidade/servicos', requirePermission('profitability:read'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const tenantId = extractTenantId(req);
    const servicos = pricingEngine.obterRentabilidadeServicos({
      tenantId,
      state,
      periodo: req.query.periodo,
      ordenarPor: req.query.ordenarPor,
      limite: req.query.limite ? parseInt(req.query.limite, 10) : undefined
    });
    res.json({ success: true, servicos });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/api/rentabilidade/categorias', requirePermission('profitability:read'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const tenantId = extractTenantId(req);
    const categorias = pricingEngine.obterRentabilidadeCategorias({
      tenantId,
      state,
      periodo: req.query.periodo
    });
    res.json({ success: true, categorias });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/api/rentabilidade/clientes', requirePermission('profitability:read'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const tenantId = extractTenantId(req);
    const clientes = pricingEngine.obterRentabilidadeClientes({
      tenantId,
      state,
      periodo: req.query.periodo,
      limite: req.query.limite ? parseInt(req.query.limite, 10) : undefined
    });
    res.json({ success: true, clientes });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});


module.exports = router;
