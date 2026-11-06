'use strict';

const express = require('express');
const router = express.Router();
const {
  getOrLoadState,
  mutateTenantState,
  extractTenantId,
  requirePermission,
  recordSecurityAudit
} = require('../lib/serverContext');
const financialAnalystService = require('../services/financialAnalystService');
const financialEngine = require('../services/financialEngine');
const { notificarEventoCaixaWhatsApp } = require('../services/reportGenerationService');

/**
 * Pátio CRM — Rotas de Tesouraria, Sangria, Suprimento e Estornos
 * Sub-router extraído de routes/financial.routes.js (< 350 linhas)
 */

router.post('/api/financeiro/movimentacoes', requirePermission('financial:write', 'financial:manage'), async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    const payload = req.body || {};
    const operador = req.securityContext?.actorId || 'operador';

    let resultado = null;
    const saveRes = await mutateTenantState(req, (draft) => {
      resultado = financialAnalystService.registrarMovimentacao(draft, {
        ...payload,
        tenantId,
        operador
      });

      if (!resultado.ok) {
        return { abort: true, status: resultado.status || 400, code: resultado.code, error: resultado.error };
      }
    });

    if (saveRes?.aborted) {
      return res.status(saveRes.status || 400).json({
        success: false,
        code: saveRes.mutatorResult?.code || saveRes.code,
        error: saveRes.mutatorResult?.error || saveRes.error
      });
    }

    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({
        success: false,
        error: saveRes?.error || 'Falha ao persistir movimentação financeira.'
      });
    }

    if (resultado.movimentacao?.subtipo === 'sangria' || resultado.movimentacao?.naturezaOperacao === 'sangria') {
      try {
        await recordSecurityAudit({
          tenantId,
          actorId: req.securityContext?.actorId || req.user?.username || req.body?.operador || 'operador',
          action: 'financeiro:caixa:sangria',
          entity: 'caixa_diario',
          entityId: resultado.movimentacao?.caixaId,
          details: {
            movimentoId: resultado.movimentacao?.id,
            valor: resultado.movimentacao?.valor,
            motivo: resultado.movimentacao?.descricao,
            saldoAtual: resultado.saldoCaixaAtual
          }
        });
      } catch (_) {}
    } else if (resultado.movimentacao?.subtipo === 'suprimento' || resultado.movimentacao?.naturezaOperacao === 'suprimento') {
      try {
        await recordSecurityAudit({
          tenantId,
          actorId: req.securityContext?.actorId || req.user?.username || req.body?.operador || 'operador',
          action: 'financeiro:caixa:suprimento',
          entity: 'caixa_diario',
          entityId: resultado.movimentacao?.caixaId,
          details: {
            movimentoId: resultado.movimentacao?.id,
            valor: resultado.movimentacao?.valor,
            motivo: resultado.movimentacao?.descricao,
            saldoAtual: resultado.saldoCaixaAtual
          }
        });
      } catch (_) {}
    }

    res.status(201).json({
      success: true,
      mensagem: resultado.mensagem,
      movimento: resultado.movimentacao,
      movimentacao: resultado.movimentacao,
      saldoCaixaAtual: resultado.saldoCaixaAtual,
      caixa: { id: resultado.movimentacao?.caixaId, saldoAtual: resultado.saldoCaixaAtual }
    });
  } catch (err) {
    console.error('[API /api/financeiro/movimentacoes POST] Erro:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * 5.0.1 POST /api/financeiro/caixa/sangria
 * Realiza sangria (retirada de numerário) no caixa ativo com RBAC e auditoria
 */
router.post('/api/financeiro/caixa/sangria', requirePermission('financial:write', 'financial:manage'), async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    const { valor, motivo, descricao } = req.body || {};
    const operador = req.securityContext?.actorId || 'operador';

    let resultado = null;
    const saveRes = await mutateTenantState(req, (draft) => {
      resultado = financialAnalystService.registrarMovimentacao(draft, {
        tenantId,
        tipo: 'saida',
        subtipo: 'sangria',
        naturezaOperacao: 'sangria',
        formaPagamento: 'dinheiro',
        forma: 'dinheiro',
        valor: Number(valor),
        descricao: motivo || descricao || 'Sangria de Caixa',
        categoria: 'Sangria de Caixa',
        operador,
        origem: 'web'
      });

      if (!resultado.ok) {
        return { abort: true, status: 400, error: resultado.error };
      }
    });

    if (saveRes?.aborted) {
      return res.status(saveRes.status || 400).json({ success: false, error: saveRes.error });
    }

    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({ success: false, error: saveRes?.error || 'Falha ao realizar sangria.' });
    }

    try {
      await recordSecurityAudit({
        tenantId,
        actorId: operador,
        action: 'financeiro:caixa:sangria',
        entity: 'caixa_diario',
        entityId: resultado.movimentacao?.caixaId,
        details: {
          movimentoId: resultado.movimentacao?.id,
          valor: resultado.movimentacao?.valor,
          motivo: resultado.movimentacao?.descricao,
          saldoAtual: resultado.saldoCaixaAtual
        }
      });
    } catch (_) {}

    res.status(201).json({
      success: true,
      mensagem: 'Sangria de caixa realizada com sucesso.',
      movimentacao: resultado.movimentacao,
      saldoCaixaAtual: resultado.saldoCaixaAtual
    });
  } catch (err) {
    console.error('[API /api/financeiro/caixa/sangria POST] Erro:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * 5.0.2 POST /api/financeiro/caixa/suprimento
 * Realiza suprimento (aporte de troco) no caixa ativo com RBAC e auditoria
 */
router.post('/api/financeiro/caixa/suprimento', requirePermission('financial:write', 'financial:manage'), async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    const { valor, motivo, descricao } = req.body || {};
    const operador = req.securityContext?.actorId || 'operador';

    let resultado = null;
    const saveRes = await mutateTenantState(req, (draft) => {
      resultado = financialAnalystService.registrarMovimentacao(draft, {
        tenantId,
        tipo: 'entrada',
        subtipo: 'suprimento',
        naturezaOperacao: 'suprimento',
        formaPagamento: 'dinheiro',
        forma: 'dinheiro',
        valor: Number(valor),
        descricao: motivo || descricao || 'Suprimento de Caixa',
        categoria: 'Suprimento de Caixa',
        operador,
        origem: 'web'
      });

      if (!resultado.ok) {
        return { abort: true, status: 400, error: resultado.error };
      }
    });

    if (saveRes?.aborted) {
      return res.status(saveRes.status || 400).json({ success: false, error: saveRes.error });
    }

    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({ success: false, error: saveRes?.error || 'Falha ao registrar suprimento.' });
    }

    try {
      await recordSecurityAudit({
        tenantId,
        actorId: operador,
        action: 'financeiro:caixa:suprimento',
        entity: 'caixa_diario',
        entityId: resultado.movimentacao?.caixaId,
        details: {
          movimentoId: resultado.movimentacao?.id,
          valor: resultado.movimentacao?.valor,
          motivo: resultado.movimentacao?.descricao,
          saldoAtual: resultado.saldoCaixaAtual
        }
      });
    } catch (_) {}

    res.status(201).json({
      success: true,
      mensagem: 'Suprimento de caixa registrado com sucesso.',
      movimentacao: resultado.movimentacao,
      saldoCaixaAtual: resultado.saldoCaixaAtual
    });
  } catch (err) {
    console.error('[API /api/financeiro/caixa/suprimento POST] Erro:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * 5.1 POST /api/financeiro/movimentacoes/:id/estornar & /api/financeiro/movimentos/:id/estornar
 * Executa estorno contábil compensatório auditado com trava de perfil Dono/Owner
 */
const estornarMovimentacaoHandler = async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    const { id } = req.params;
    const { motivo } = req.body || {};
    const role = (req.securityContext?.role || '').toLowerCase();
    const isDono = ['dono', 'tenant_admin', 'owner', 'platform_admin', 'admin'].includes(role);

    // RBAC Estrito: Restrito a administradores superiores (Dono / Owner)
    if (!isDono) {
      await recordSecurityAudit({
        tenantId,
        actorId: req.securityContext?.actorId || 'operador',
        action: 'financeiro:movimento:estorno_negado',
        entity: 'financeiro_movimento',
        entityId: id,
        details: {
          motivo: 'perfil_sem_permissao',
          role,
          movimentoId: id
        }
      });
      return res.status(403).json({
        success: false,
        code: 'ACESSO_NEGADO',
        error: 'Acesso negado: o estorno de movimentações financeiras é restrito a administradores superiores (Dono/Owner).'
      });
    }

    const operador = req.securityContext?.actorId || 'operador';
    const operadorNome = req.securityContext?.fullName || req.securityContext?.actorId || 'Operador';

    let resultado = null;
    const saveRes = await mutateTenantState(req, (draft) => {
      resultado = financialAnalystService.estornarMovimentacao(draft, {
        movimentoId: id,
        motivo,
        operador,
        operadorNome,
        tenantId
      });

      if (!resultado.ok) {
        return {
          abort: true,
          status: resultado.status || 400,
          code: resultado.code,
          error: resultado.error
        };
      }
    });

    if (saveRes?.aborted) {
      return res.status(saveRes.status || 400).json({
        success: false,
        code: saveRes.mutatorResult?.code || saveRes.code,
        error: saveRes.error
      });
    }

    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({
        success: false,
        error: saveRes?.error || 'Falha ao persistir estorno de movimentação.'
      });
    }

    // Trilha de Auditoria de Segurança
    await recordSecurityAudit({
      tenantId,
      actorId: operador,
      action: 'financeiro:movimento:estornar',
      entity: 'financeiro_movimento',
      entityId: resultado.movimentoOriginal?.id,
      details: {
        movimentoId: resultado.movimentoOriginal?.id,
        valor: resultado.movimentoOriginal?.valor,
        origem: resultado.movimentoOriginal?.origem,
        motivo,
        idEstorno: resultado.movimentoCompensatorio?.id,
        saldoCaixaAtual: resultado.saldoCaixaAtual,
        role
      }
    });

    res.json({
      success: true,
      mensagem: resultado.mensagem,
      movimentoOriginal: resultado.movimentoOriginal,
      movimentoCompensatorio: resultado.movimentoCompensatorio,
      caixa: resultado.caixa,
      saldoCaixaAtual: resultado.saldoCaixaAtual
    });
  } catch (err) {
    console.error('[API estorno POST] Erro:', err);
    res.status(500).json({ success: false, error: err.message });
  }
};

router.post('/api/financeiro/movimentacoes/:id/estornar', requirePermission('financial:write', 'financial:manage'), estornarMovimentacaoHandler);
router.post('/api/financeiro/movimentos/:id/estornar', requirePermission('financial:write', 'financial:manage'), estornarMovimentacaoHandler);

module.exports = router;
