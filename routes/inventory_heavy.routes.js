'use strict';

const express = require('express');
const router = express.Router();
const {
  getOrLoadState,
  mutateTenantState,
  extractTenantId,
  requirePermission
} = require('../lib/serverContext');
const inventoryService = require('../services/inventoryService');

/**
 * POST /api/estoque/lotes/entrada
 * Registra a entrada física de um lote rastreável de peças
 */
router.post('/api/estoque/lotes/entrada', requirePermission('inventory:write'), async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    const {
      partId,
      loteCodigo,
      fornecedorId,
      fabricante,
      quantidade,
      custoUnitario,
      dataEntrada,
      dataValidade,
      notaFiscal
    } = req.body || {};

    if (!partId || !loteCodigo || !quantidade) {
      return res.status(400).json({
        success: false,
        error: 'partId, loteCodigo e quantidade são campos obrigatórios.'
      });
    }

    let loteCriado = null;
    await mutateTenantState(req, (draft) => {
      loteCriado = inventoryService.registrarEntradaLote({
        tenantId,
        state: draft,
        partId,
        loteCodigo,
        fornecedorId,
        fabricante,
        quantidade,
        custoUnitario,
        dataEntrada,
        dataValidade,
        notaFiscal,
        actorId: req.securityContext?.actorId || 'operador'
      });
    });

    res.json({ success: true, lote: loteCriado });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/estoque/lotes/rastreio/:loteCodigo
 * Rastreamento reverso de Recall / Garantia por código de lote
 */
router.get('/api/estoque/lotes/rastreio/:loteCodigo', requirePermission('inventory:read'), async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    const loteCodigo = req.params.loteCodigo;
    const state = await getOrLoadState(req);

    const rastreio = inventoryService.rastrearLote({
      tenantId,
      state,
      loteCodigo
    });

    if (!rastreio) {
      return res.status(404).json({
        success: false,
        error: 'Lote "' + loteCodigo + '" não localizado no estoque.'
      });
    }

    res.json({ success: true, rastreio });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/estoque/curva-abc
 * Retorna matriz da Curva ABC e ponto de pedido com sugestões de reposição crítica
 */
router.get('/api/estoque/curva-abc', requirePermission('inventory:read'), async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    const dias = parseInt(req.query.dias, 10) || 90;
    const state = await getOrLoadState(req);

    const abc = inventoryService.calcularCurvaABC({
      tenantId,
      state,
      diasHistorico: dias
    });

    res.json({ success: true, abc });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/estoque/reservas/sincronizar
 * Sincroniza o ciclo de vida das reservas atômicas (reservar, baixar ou liberar)
 */
router.post('/api/estoque/reservas/sincronizar', requirePermission('inventory:write'), async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    const { osId, itens, acao = 'reservar', motivo = '' } = req.body || {};

    if (!osId) {
      return res.status(400).json({ success: false, error: 'osId é obrigatório.' });
    }

    let resultado = null;
    await mutateTenantState(req, (draft) => {
      const actorId = req.securityContext?.actorId || 'sistema';

      if (acao === 'reservar') {
        resultado = inventoryService.reservarPecasOS({
          tenantId,
          state: draft,
          osId,
          itens: Array.isArray(itens) ? itens : [],
          actorId
        });
      } else if (acao === 'baixar') {
        resultado = inventoryService.efetivarBaixaOS({
          tenantId,
          state: draft,
          osId,
          actorId
        });
      } else if (acao === 'liberar') {
        resultado = inventoryService.liberarReservaOS({
          tenantId,
          state: draft,
          osId,
          reason: motivo,
          actorId
        });
      } else {
        throw new Error('Ação de reserva inválida: ' + acao);
      }
    });

    res.json({ success: true, resultado });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, error: err.message });
  }
});

module.exports = router;

