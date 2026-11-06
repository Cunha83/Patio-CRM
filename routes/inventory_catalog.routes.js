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

module.exports = router;
