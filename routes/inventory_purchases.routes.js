const express = require('express');
const router = express.Router();
const {
  getOrLoadState,
  salvarEstado,
  mutateTenantState,
  extractTenantId,
  requirePermission
} = require('../lib/serverContext');
const inventoryService = require('../services/inventoryService');
const procurementService = require('../services/procurementService');
const supplierService = require('../services/supplierService');

router.get('/api/compras/necessidades', requirePermission('purchase:read'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const tenantId = extractTenantId(req);
    const necessidades = procurementService.listarNecessidadesCompra({
      tenantId,
      state,
      status: req.query.status,
      osId: req.query.osId
    });
    res.json({ success: true, necessidades });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/compras/cotacoes', requirePermission('purchase:write'), async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    let resultado = null;
    const saveRes = await mutateTenantState(req, (draft) => {
      resultado = procurementService.criarCotacao({
        tenantId,
        state: draft,
        requirementIds: req.body.requirementIds,
        supplierIds: req.body.supplierIds,
        observacoes: req.body.observacoes,
        actorId: req.securityContext?.actorId || 'comprador'
      });
    });
    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({
        success: false,
        error: saveRes?.error || 'Falha ao persistir cotação.'
      });
    }
    res.json({ success: true, ...resultado });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/api/compras/cotacoes/:id/respostas', requirePermission('purchase:write'), async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    let resultado = null;
    const saveRes = await mutateTenantState(req, (draft) => {
      resultado = procurementService.registrarRespostaFornecedor({
        tenantId,
        state: draft,
        quoteId: req.params.id,
        supplierId: req.body.supplierId,
        items: req.body.items,
        freight: req.body.freight,
        paymentTerms: req.body.paymentTerms,
        validUntil: req.body.validUntil,
        actorId: req.securityContext?.actorId || 'comprador'
      });
    });
    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({
        success: false,
        error: saveRes?.error || 'Falha ao persistir resposta da cotação.'
      });
    }
    res.json({ success: true, ...resultado });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/api/compras/cotacoes/:id/comparar', requirePermission('purchase:read'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const tenantId = extractTenantId(req);
    const comparativo = procurementService.compararCotacoes({
      tenantId,
      state,
      quoteId: req.params.id,
      osId: req.query.osId
    });
    res.json({ success: true, ...comparativo });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/api/compras/pedidos', requirePermission('purchase:read'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const tenantId = extractTenantId(req);
    const pedidos = (state.purchaseOrders || []).filter(p => p.tenantId === tenantId);
    res.json({ success: true, pedidos });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/compras/pedidos', requirePermission('purchase:write'), async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    let resultado = null;
    const saveRes = await mutateTenantState(req, (draft) => {
      resultado = procurementService.criarPedidoCompra({
        tenantId,
        state: draft,
        supplierId: req.body.supplierId,
        items: req.body.items,
        quoteId: req.body.quoteId,
        freight: req.body.freight,
        paymentTerms: req.body.paymentTerms,
        expectedAt: req.body.expectedAt,
        observacoes: req.body.observacoes,
        actorId: req.securityContext?.actorId || 'comprador'
      });
    });
    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({
        success: false,
        error: saveRes?.error || 'Falha ao persistir pedido de compra.'
      });
    }
    res.json({ success: true, ...resultado });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/api/compras/pedidos/:id/aprovar', requirePermission('purchase:approve'), async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    let resultado = null;
    const saveRes = await mutateTenantState(req, (draft) => {
      resultado = procurementService.aprovarPedidoCompra({
        tenantId,
        state: draft,
        orderId: req.params.id,
        actorId: req.securityContext?.actorId || 'gerente',
        userPermissions: req.securityContext?.permissions || []
      });
    });
    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({
        success: false,
        error: saveRes?.error || 'Falha ao aprovar pedido de compra.'
      });
    }
    res.json({ success: true, ...resultado });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/api/compras/pedidos/:id/receber', requirePermission('purchase:write'), async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    let resultado = null;
    const saveRes = await mutateTenantState(req, (draft) => {
      resultado = procurementService.receberPedidoCompra({
        tenantId,
        state: draft,
        orderId: req.params.id,
        itensRecebidos: req.body.itensRecebidos,
        nfNumero: req.body.nfNumero,
        actorId: req.securityContext?.actorId || 'almoxarife'
      });
    });
    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({
        success: false,
        error: saveRes?.error || 'Falha ao receber pedido de compra.'
      });
    }
    res.json({ success: true, ...resultado });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/api/compras/pedidos/:id/cancelar', requirePermission('purchase:write'), async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    let resultado = null;
    const saveRes = await mutateTenantState(req, (draft) => {
      resultado = procurementService.cancelarPedidoCompra({
        tenantId,
        state: draft,
        orderId: req.params.id,
        reason: req.body.motivo,
        actorId: req.securityContext?.actorId || 'gerente'
      });
    });
    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({
        success: false,
        error: saveRes?.error || 'Falha ao cancelar pedido de compra.'
      });
    }
    res.json({ success: true, ...resultado });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/* ── Consumo e Devolução de Peça na OS pelo Mecânico ────────── */



module.exports = router;
