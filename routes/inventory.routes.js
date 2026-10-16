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

router.get('/api/pecas', requirePermission('inventory:read'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const tenantId = extractTenantId(req);
    let pecas = inventoryService.buscarPecas({ tenantId, state, query: req.query.q || '' });
    const canReadFinancial = req.securityContext?.permissions?.includes('financial:read') || ['admin', 'tenant_admin', 'financeiro'].includes(req.securityContext?.role);
    if (!canReadFinancial && Array.isArray(pecas)) {
      pecas = pecas.map(p => {
        const cp = { ...p };
        delete cp.custo;
        delete cp.venda;
        delete cp.margem;
        delete cp.preco;
        delete cp.valor;
        delete cp.precoVenda;
        delete cp.custoMedio;
        return cp;
      });
    }
    res.json({ success: true, pecas });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/pecas', requirePermission('inventory:write'), async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    let resultado = null;
    const saveRes = await mutateTenantState(req, (draft) => {
      resultado = inventoryService.cadastrarPeca({
        tenantId,
        state: draft,
        partData: req.body,
        actorId: req.securityContext?.actorId || 'operador'
      });
    });
    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({
        success: false,
        error: saveRes?.error || 'Falha ao persistir peça.'
      });
    }
    res.json({ success: true, ...resultado });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/api/pecas/:id', requirePermission('inventory:read'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const tenantId = extractTenantId(req);
    let peca = inventoryService.obterPeca({ tenantId, state, partId: req.params.id });
    if (!peca) return res.status(404).json({ error: 'Peça não encontrada.' });
    const canReadFinancial = req.securityContext?.permissions?.includes('financial:read') || ['admin', 'tenant_admin', 'financeiro'].includes(req.securityContext?.role);
    if (!canReadFinancial && peca && typeof peca === 'object') {
      peca = { ...peca };
      delete peca.custo;
      delete peca.venda;
      delete peca.margem;
      delete peca.preco;
      delete peca.valor;
      delete peca.precoVenda;
      delete peca.custoMedio;
    }
    res.json({ success: true, peca });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/api/pecas/:id/saldos', requirePermission('inventory:read'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const tenantId = extractTenantId(req);
    const peca = inventoryService.obterPeca({ tenantId, state, partId: req.params.id });
    if (!peca) return res.status(404).json({ error: 'Peça não encontrada.' });
    const saldos = inventoryService.calcularSaldos({ tenantId, state, partId: req.params.id });
    res.json({ success: true, saldos, peca });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/api/pecas/:id', requirePermission('inventory:write'), async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    let resultado = null;
    const saveRes = await mutateTenantState(req, (draft) => {
      resultado = inventoryService.atualizarPeca({
        tenantId,
        state: draft,
        partId: req.params.id,
        partData: req.body,
        actorId: req.securityContext?.actorId || 'operador'
      });
    });
    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({
        success: false,
        error: saveRes?.error || 'Falha ao persistir atualização da peça.'
      });
    }
    res.json({ success: true, ...resultado });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/api/pecas/:id/movimentacoes', requirePermission('inventory:read'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const tenantId = extractTenantId(req);
    const movs = (state.inventoryMovements || []).filter(m => m.tenantId === tenantId && m.partId === req.params.id);
    res.json({ success: true, movements: movs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/pecas/:id/ajustar', requirePermission('inventory:adjust'), async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    let resultado = null;
    const saveRes = await mutateTenantState(req, (draft) => {
      resultado = inventoryService.ajustarEstoque({
        tenantId,
        state: draft,
        partId: req.params.id,
        novaQuantidade: req.body.novaQuantidade,
        reason: req.body.motivo,
        actorId: req.securityContext?.actorId || 'gerente'
      });
    });
    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({
        success: false,
        error: saveRes?.error || 'Falha ao persistir ajuste de estoque.'
      });
    }
    res.json({ success: true, ...resultado });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/* ── Rotas de Fornecedores ─────────────────────────────────── */
router.get('/api/fornecedores', requirePermission('supplier:read'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const tenantId = extractTenantId(req);
    const fornecedores = supplierService.listarFornecedores({ tenantId, state, query: req.query.q || '' });
    res.json({ success: true, fornecedores });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/fornecedores', requirePermission('supplier:write'), async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    let resultado = null;
    const saveRes = await mutateTenantState(req, (draft) => {
      resultado = supplierService.cadastrarFornecedor({
        tenantId,
        state: draft,
        supplierData: req.body,
        actorId: req.securityContext?.actorId || 'operador'
      });
    });
    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({
        success: false,
        error: saveRes?.error || 'Falha ao persistir fornecedor.'
      });
    }
    res.json({ success: true, ...resultado });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/api/fornecedores/:id', requirePermission('supplier:read'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const tenantId = extractTenantId(req);
    const fornecedor = supplierService.obterFornecedor({ tenantId, state, supplierId: req.params.id });
    if (!fornecedor) return res.status(404).json({ error: 'Fornecedor não encontrado.' });
    const desempenho = supplierService.calcularDesempenhoFornecedor({ tenantId, state, supplierId: req.params.id });
    res.json({ success: true, fornecedor, desempenho });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/api/fornecedores/:id', requirePermission('supplier:write'), async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    let resultado = null;
    const saveRes = await mutateTenantState(req, (draft) => {
      resultado = supplierService.atualizarFornecedor({
        tenantId,
        state: draft,
        supplierId: req.params.id,
        supplierData: req.body,
        actorId: req.securityContext?.actorId || 'operador'
      });
    });
    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({
        success: false,
        error: saveRes?.error || 'Falha ao persistir alteração do fornecedor.'
      });
    }
    res.json({ success: true, ...resultado });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/* ── Rotas de Compras, Cotações e Pedidos (Procurement) ─────── */
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
