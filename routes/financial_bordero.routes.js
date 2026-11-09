'use strict';

/**
 * Pátio CRM — Rotas Especializadas de Faturamento de Frotas e Borderô
 * Sub-roteador financeiro modular (< 200 linhas).
 */

const express = require('express');
const router = express.Router();
const {
  getOrLoadState,
  mutateTenantState,
  requirePermission,
  extractTenantId,
  recordSecurityAudit
} = require('../lib/serverContext');
const fleetBorderoService = require('../services/billing/fleetBorderoService');

// Lista OSs faturáveis de um cliente frotista
router.get('/api/financeiro/bordero/faturaveis', requirePermission('financial:read'), async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    const state = await getOrLoadState(req);
    const { clienteId, dataInicio, dataFim } = req.query;

    const faturaveis = fleetBorderoService.listarOSFaturaveisPorCliente({
      state,
      tenantId,
      clienteId,
      dataInicio,
      dataFim
    });

    res.json({ ok: true, faturaveis });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Simula prévia analítica do borderô
router.post('/api/financeiro/bordero/previa', requirePermission('financial:read'), async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    const state = await getOrLoadState(req);
    const { clienteId, osIds, descontoGeral, retencoes, condicaoPagamento, dataBase } = req.body || {};

    const previa = fleetBorderoService.simularPreviaBordero({
      state,
      tenantId,
      clienteId,
      osIds,
      descontoGeral,
      retencoes,
      condicaoPagamento,
      dataBase
    });

    if (!previa.ok) {
      return res.status(400).json(previa);
    }

    res.json(previa);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Fecha borderô com bloqueio de OSs e geração de contas a receber com boleto Febraban
router.post('/api/financeiro/bordero/fechar', requirePermission('financial:manage'), async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    const operador = req.securityContext?.actorId || req.user?.username || 'operador_frotas';
    const { clienteId, osIds, descontoGeral, retencoes, condicaoPagamento, dadosBancarios } = req.body || {};

    let resultado = null;
    const saveRes = await mutateTenantState(req, (draft) => {
      resultado = fleetBorderoService.fecharBordero({
        state: draft,
        tenantId,
        clienteId,
        osIds,
        descontoGeral,
        retencoes,
        condicaoPagamento,
        dadosBancarios,
        operador
      });

      if (!resultado.ok) {
        return { abort: true, status: 400, error: resultado.error };
      }
    });

    if (saveRes?.aborted) {
      return res.status(saveRes.status || 400).json({
        ok: false,
        error: saveRes.mutatorResult?.error || saveRes.error
      });
    }

    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({
        ok: false,
        error: saveRes?.error || 'Falha ao persistir fechamento de borderô.'
      });
    }

    // Trilha de auditoria
    try {
      await recordSecurityAudit({
        tenantId,
        actorId: operador,
        action: 'financeiro:bordero:fechar',
        entity: 'bordero',
        entityId: resultado.bordero.id,
        details: {
          num: resultado.bordero.num,
          clienteId,
          totalLiquido: resultado.bordero.totais?.totalLiquido,
          qtdOS: resultado.bordero.osIds?.length,
          parcelas: resultado.bordero.parcelas?.length
        }
      });
    } catch (auditErr) {
      console.warn('[Audit Bordero Fechar] Falha não-bloqueante:', auditErr.message);
    }

    res.status(201).json(resultado);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Consulta borderô por ID
router.get('/api/financeiro/bordero/:id', requirePermission('financial:read'), async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    const state = await getOrLoadState(req);
    const { id } = req.params;

    const bordero = (state.borderos || []).find(b => {
      if (tenantId && b.tenantId && b.tenantId !== tenantId) return false;
      return b.id === id || b.num === id;
    });

    if (!bordero) {
      return res.status(404).json({ ok: false, error: 'Borderô não encontrado.' });
    }

    res.json({ ok: true, bordero });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Obtém dados estruturados do espelho para impressão e PDF
router.get('/api/financeiro/bordero/:id/espelho-pdf-data', requirePermission('financial:read'), async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    const state = await getOrLoadState(req);
    const { id } = req.params;

    const bordero = (state.borderos || []).find(b => {
      if (tenantId && b.tenantId && b.tenantId !== tenantId) return false;
      return b.id === id || b.num === id;
    });

    if (!bordero) {
      return res.status(404).json({ ok: false, error: 'Borderô não encontrado.' });
    }

    res.json({
      ok: true,
      espelho: {
        id: bordero.id,
        num: bordero.num,
        clienteNome: bordero.clienteNome,
        clienteDoc: bordero.clienteDoc,
        status: bordero.status,
        criadoEm: bordero.criadoEm,
        totais: bordero.totais,
        parcelas: bordero.parcelas,
        resumoOS: bordero.resumoOS
      }
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Cancelamento de borderô com liberação de OSs e cancelamento de títulos
router.post('/api/financeiro/bordero/:id/cancelar', requirePermission('financial:admin'), async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    const operador = req.securityContext?.actorId || req.user?.username || 'admin_frotas';
    const borderoId = req.params.id;
    const { motivo } = req.body || {};

    let resultado = null;
    const saveRes = await mutateTenantState(req, (draft) => {
      resultado = fleetBorderoService.cancelarBordero({
        state: draft,
        tenantId,
        borderoId,
        motivo,
        operador
      });

      if (!resultado.ok) {
        return { abort: true, status: 400, error: resultado.error };
      }
    });

    if (saveRes?.aborted) {
      return res.status(saveRes.status || 400).json({
        ok: false,
        error: saveRes.mutatorResult?.error || saveRes.error
      });
    }

    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({
        ok: false,
        error: saveRes?.error || 'Falha ao persistir cancelamento do borderô.'
      });
    }

    try {
      await recordSecurityAudit({
        tenantId,
        actorId: operador,
        action: 'financeiro:bordero:cancelar',
        entity: 'bordero',
        entityId: borderoId,
        details: { motivo }
      });
    } catch (auditErr) {
      console.warn('[Audit Bordero Cancelar] Falha não-bloqueante:', auditErr.message);
    }

    res.json(resultado);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;

