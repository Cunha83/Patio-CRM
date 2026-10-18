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
 * 1. GET /api/financeiro/resumo
 * Retorna status do caixa ativo, KPIs do dia, fluxo resumido e parecer dos controles internos
 */
router.get('/api/financeiro/resumo', requirePermission('financial:read'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const tenantId = extractTenantId(req);

    const caixaAberto = financialAnalystService.obterCaixaAberto(state, tenantId);
    const kpis = financialEngine.calcularKPIsFinanceiros(state, { filtro: 'hoje' });
    const controles = financialAnalystService.avaliarControlesInternos(state);
    const previsao30d = financialAnalystService.gerarPrevisaoFluxoCaixa(state, { dias: 30 });

    res.json({
      success: true,
      statusCaixa: caixaAberto ? 'aberto' : 'fechado',
      caixa: {
        aberto: Boolean(caixaAberto),
        dados: financialAnalystService.projetarCaixa(caixaAberto)
      },
      indicadores: kpis,
      resumoOrigem: kpis.resumoOrigem || null,
      previsao: {
        saldoAtual: previsao30d.saldoAtual,
        em7Dias: previsao30d.marcos.em7Dias,
        em15Dias: previsao30d.marcos.em15Dias,
        em30Dias: previsao30d.marcos.em30Dias,
        receitaPotencialPatio: previsao30d.receitaPotencialPatio.cenarioProvavel,
        furoDetectado: previsao30d.diagnosticoFuro.furoDetectado,
        dataPrimeiroFuro: previsao30d.diagnosticoFuro.dataPrimeiroFuro
      },
      controlesInternos: {
        totalAnomalias: controles.totalAnomalias,
        criticas: controles.anomaliasCriticas,
        anomalias: controles.anomalias
      },
      auditoria: controles,
      parecerVerônica: controles.parecerExecutivo
    });
  } catch (err) {
    console.error('[API /api/financeiro/resumo GET] Erro:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * 2. POST /api/financeiro/caixa/abrir
 * Abre o turno de caixa diário (bloqueia se já houver caixa aberto)
 */
router.post('/api/financeiro/caixa/abrir', requirePermission('financial:write', 'financial:manage'), async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    const { saldoInicial, observacoes, registrarSuprimentoAbertura } = req.body || {};
    const operador = req.securityContext?.actorId || 'operador';
    const operadorNome = req.securityContext?.fullName || req.securityContext?.actorId || 'Operador';

    let resultado = null;
    const saveRes = await mutateTenantState(req, (draft) => {
      resultado = financialAnalystService.abrirCaixa(draft, {
        tenantId,
        saldoInicial,
        observacoes,
        operador,
        operadorNome,
        registrarSuprimentoAbertura
      });

      if (!resultado.ok) {
        return { abort: true, status: resultado.code === 'CAIXA_JA_ABERTO' ? 409 : 400, code: resultado.code, error: resultado.error, caixa: resultado.caixa };
      }
    });

    if (saveRes?.aborted) {
      return res.status(saveRes.status || 400).json({
        success: false,
        code: saveRes.mutatorResult?.code || saveRes.code,
        error: saveRes.error,
        caixa: saveRes.mutatorResult?.caixa || saveRes.caixa
      });
    }

    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({
        success: false,
        error: saveRes?.error || 'Falha ao persistir abertura de caixa.'
      });
    }

    // Disparo orientado a eventos para WhatsApp (não bloqueia nem quebra o caixa em caso de falha)
    try {
      const dryRun = Boolean(req.body?.dryRun);
      notificarEventoCaixaWhatsApp({
        tipo: 'abertura',
        operadorNome,
        saldoInicial: resultado.caixa?.saldoInicial,
        tenantKey: tenantId,
        dryRun
      }).catch(errWpp => console.warn('[Caixa WhatsApp] Aviso ao enviar notificação de abertura:', errWpp.message));
    } catch (eWpp) {
      console.warn('[Caixa WhatsApp] Falha silenciosa no disparo de abertura:', eWpp.message);
    }

    res.status(201).json({
      success: true,
      mensagem: resultado.mensagem,
      caixa: resultado.caixa
    });
  } catch (err) {
    console.error('[API /api/financeiro/caixa/abrir POST] Erro:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * 3. POST /api/financeiro/caixa/fechar
 * Encerra o caixa aberto, consolida movimentações e apura diferenças
 */
router.post('/api/financeiro/caixa/fechar', requirePermission('financial:write', 'financial:manage'), async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    const { valoresInformados, conferenciaCega, observacoes } = req.body || {};
    const operador = req.securityContext?.actorId || 'operador';
    const operadorNome = req.securityContext?.fullName || req.securityContext?.actorId || 'Operador';

    let resultado = null;
    const saveRes = await mutateTenantState(req, (draft) => {
      resultado = financialAnalystService.fecharCaixa(draft, {
        tenantId,
        valoresInformados: valoresInformados || conferenciaCega,
        observacoes,
        operador,
        operadorNome
      });

      if (!resultado.ok) {
        return { abort: true, status: 400, error: resultado.error };
      }
    });

    if (saveRes?.aborted) {
      return res.status(saveRes.status || 400).json({
        success: false,
        error: saveRes.error
      });
    }

    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({
        success: false,
        error: saveRes?.error || 'Falha ao persistir fechamento de caixa.'
      });
    }

    // Auditoria de fechamento de caixa
    try {
      await recordSecurityAudit({
        tenantId,
        actorId: operador,
        action: 'financeiro:caixa:fechar',
        entity: 'caixa_turno',
        entityId: resultado.caixaFechado?.id,
        details: {
          caixaId: resultado.caixaFechado?.id,
          saldoFinal: resultado.caixaFechado?.saldoFinal,
          totalEntradas: resultado.resumoFechamento?.totalEntradas,
          totalSaidas: resultado.resumoFechamento?.totalSaidas,
          diferenca: resultado.resumoFechamento?.diferenca,
          statusConferencia: resultado.resumoFechamento?.statusConferencia,
          resumoOrigem: resultado.resumoFechamento?.resumoOrigem,
          operador
        }
      });
    } catch (auditErr) {
      console.warn('[Caixa Fechar Audit] Falha não-bloqueante:', auditErr.message);
    }

    // Disparo orientado a eventos para WhatsApp (não bloqueia nem quebra o caixa em caso de falha)
    try {
      const dryRun = Boolean(req.body?.dryRun);
      notificarEventoCaixaWhatsApp({
        tipo: 'fechamento',
        operadorNome,
        saldoFinal: resultado.caixaFechado?.saldoFinal,
        diferenca: resultado.resumoFechamento?.diferenca,
        tenantKey: tenantId,
        dryRun
      }).catch(errWpp => console.warn('[Caixa WhatsApp] Aviso ao enviar notificação de fechamento:', errWpp.message));
    } catch (eWpp) {
      console.warn('[Caixa WhatsApp] Falha silenciosa no disparo de fechamento:', eWpp.message);
    }

    res.json({
      success: true,
      mensagem: resultado.mensagem,
      caixa: resultado.caixaFechado,
      fechamento: {
        ...resultado.resumoFechamento,
        status: resultado.caixaFechado?.status || 'fechado',
        saldoFinalSistema: resultado.caixaFechado?.saldoFinal
      }
    });
  } catch (err) {
    console.error('[API /api/financeiro/caixa/fechar POST] Erro:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * 4. GET /api/financeiro/movimentacoes
 * Lista as movimentações do caixa e histórico financeiro
 */
router.get('/api/financeiro/movimentacoes', requirePermission('financial:read'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const resultado = financialAnalystService.listarMovimentacoes(state, req.query || {});

    res.json({
      success: true,
      total: resultado.total,
      movimentacoes: resultado.movimentacoes,
      resumoOrigem: resultado.resumoOrigem,
      resumoMeiosPagamento: resultado.resumoMeiosPagamento,
      resumoPorOS: resultado.resumoPorOS
    });
  } catch (err) {
    console.error('[API /api/financeiro/movimentacoes GET] Erro:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * 4.1 GET /api/financeiro/os/:osId/resumo
 * Retorna o extrato e a posição financeira consolidada de uma Ordem de Serviço (OS)
 */
router.get('/api/financeiro/os/:osId/resumo', requirePermission('financial:read'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const osId = req.params.osId;
    const resumoOS = financialAnalystService.obterResumoFinanceiroOS(state, osId, req.query || {});

    res.json({
      success: true,
      ...resumoOS
    });
  } catch (err) {
    console.error('[API /api/financeiro/os/:osId/resumo GET] Erro:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * 4.1.1 POST /api/financeiro/os/:osId/faturar
 * Fatura a prazo o saldo devedor restante de uma OS em Contas a Receber (com RBAC e auditoria)
 */
router.post('/api/financeiro/os/:osId/faturar', requirePermission('financial:write', 'financial:manage'), async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    const osId = req.params.osId;
    const operador = req.securityContext?.actorId || req.user?.username || 'operador_financeiro';

    let resultado = null;
    const saveRes = await mutateTenantState(req, (draft) => {
      resultado = financialAnalystService.faturarSaldoOS(draft, {
        ...req.body,
        osId,
        operador,
        origem: 'web'
      });

      if (!resultado.ok) {
        return { abort: true, status: resultado.status || 400, error: resultado.error, code: resultado.code };
      }
    });

    if (saveRes?.aborted) {
      return res.status(saveRes.status || 400).json({
        success: false,
        code: saveRes.code,
        error: saveRes.error
      });
    }

    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({
        success: false,
        error: saveRes?.error || 'Falha ao persistir faturamento de OS.'
      });
    }

    // Auditoria de faturamento de OS
    try {
      await recordSecurityAudit({
        tenantId,
        actorId: operador,
        action: 'financeiro:os:faturar',
        entity: 'ordem_servico',
        entityId: osId,
        details: {
          osId,
          valorFaturado: resultado.valorFaturado,
          parcelas: resultado.parcelas,
          titulosIds: resultado.titulos?.map(t => t.id),
          statusLiberacaoPatio: resultado.resumoOS?.statusLiberacaoPatio
        }
      });
    } catch (auditErr) {
      console.warn('[Financeiro Faturar OS Audit] Falha não-bloqueante:', auditErr.message);
    }

    res.status(201).json({
      success: true,
      ...resultado
    });
  } catch (err) {
    console.error('[API /api/financeiro/os/:osId/faturar POST] Erro:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * 4.1.2 POST /api/financeiro/titulos/:id/liquidar
 * Realiza a liquidação (baixa) de um título a receber ou conta a pagar com geração de movimento no caixa e auditoria
 */
router.post('/api/financeiro/titulos/:id/liquidar', requirePermission('financial:write', 'financial:manage'), async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    const tituloId = req.params.id;
    const operador = req.securityContext?.actorId || req.user?.username || 'operador_financeiro';

    let resultado = null;
    const saveRes = await mutateTenantState(req, (draft) => {
      resultado = financialAnalystService.liquidarTituloFinanceiro(draft, {
        ...req.body,
        id: tituloId,
        operador,
        origem: 'web'
      });

      if (!resultado.ok) {
        return { abort: true, status: resultado.status || 400, error: resultado.error, code: resultado.code };
      }
    });

    if (saveRes?.aborted) {
      return res.status(saveRes.status || 400).json({
        success: false,
        code: saveRes.code,
        error: saveRes.error
      });
    }

    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({
        success: false,
        error: saveRes?.error || 'Falha ao persistir liquidação de título.'
      });
    }

    // Auditoria de liquidação de título
    try {
      await recordSecurityAudit({
        tenantId,
        actorId: operador,
        action: 'financeiro:titulo:liquidar',
        entity: 'titulo_financeiro',
        entityId: tituloId,
        details: {
          tituloId,
          tipo: resultado.titulo?.tipo,
          valor: resultado.titulo?.valor,
          meioLiquidacao: resultado.titulo?.meioLiquidacao,
          movimentoId: resultado.movimentacao?.id,
          saldoCaixaAtual: resultado.saldoCaixaAtual
        }
      });
    } catch (auditErr) {
      console.warn('[Financeiro Liquidar Titulo Audit] Falha não-bloqueante:', auditErr.message);
    }

    res.status(200).json({
      success: true,
      ...resultado
    });
  } catch (err) {
    console.error('[API /api/financeiro/titulos/:id/liquidar POST] Erro:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * 4.2 GET /api/financeiro/exportar
 * Exporta lote de movimentações contábeis em formato CSV ou JSON com assinatura SHA-256 e auditoria
 */
router.get('/api/financeiro/exportar', requirePermission('financial:read'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const formato = String(req.query.formato || 'csv').toLowerCase();
    const exportResult = financialAnalystService.exportarMovimentacoesContabeis(state, req.query || {});

    // Auditoria de exportação contábil
    try {
      await recordSecurityAudit({
        tenantId: extractTenantId(req),
        actorId: req.securityContext?.actorId || req.user?.username || 'usuario_web',
        action: 'financeiro:relatorio:exportar',
        entity: 'relatorio_financeiro',
        entityId: null,
        details: {
          formato: exportResult.formato,
          sha256: exportResult.sha256,
          totalRegistros: exportResult.totalRegistros,
          filtros: req.query
        }
      });
    } catch (auditErr) {
      console.warn('[Financeiro Exportar Audit] Falha não-bloqueante:', auditErr.message);
    }

    res.setHeader('X-Export-SHA256', exportResult.sha256);

    if (formato === 'json') {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return res.send(exportResult.conteudo);
    }

    const filename = `extrato_financeiro_${new Date().toISOString().slice(0, 10)}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(exportResult.conteudo);
  } catch (err) {
    console.error('[API /api/financeiro/exportar GET] Erro:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * 5. POST /api/financeiro/movimentacoes
 * Registra lançamento no caixa (receita, despesa, sangria, suprimento)
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
        return { abort: true, status: 400, error: resultado.error };
      }
    });

    if (saveRes?.aborted) {
      return res.status(saveRes.status || 400).json({
        success: false,
        error: saveRes.error
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

/**
 * 6. GET /api/financeiro/fluxo-caixa
 * Retorna DFC realizado e a projeção de forecast (7, 15 ou 30 dias)
 */
router.get('/api/financeiro/fluxo-caixa', requirePermission('financial:read'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const { filtro, dias, de, ate, dataRef } = req.query || {};

    const realizado = financialAnalystService.gerarFluxoDeCaixa(state, {
      filtro: filtro || '30d',
      dataRef,
      customDe: de,
      customAte: ate
    });

    const previsao = financialAnalystService.gerarPrevisaoFluxoCaixa(state, {
      dias: dias || 30,
      dataRef
    });

    res.json({
      success: true,
      fluxoRealizado: realizado,
      realizado,
      previsao
    });
  } catch (err) {
    console.error('[API /api/financeiro/fluxo-caixa GET] Erro:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * 7. GET /api/financeiro/controles-internos
 * Retorna auditoria gerencial, anomalias e o Parecer Executivo da Verônica
 */
router.get('/api/financeiro/controles-internos', requirePermission('financial:read'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const controles = financialAnalystService.avaliarControlesInternos(state);
    res.json({
      success: true,
      ...controles,
      auditoria: controles
    });
  } catch (err) {
    console.error('[API /api/financeiro/controles-internos GET] Erro:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
