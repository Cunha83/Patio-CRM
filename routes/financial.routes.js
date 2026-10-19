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
      dreOperacional: financialEngine.calcularDRESimplificado(state, { filtro: req.query?.filtro || '30d' }),
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
 * 4.1.1 POST /api/financeiro/os/:osId/liberar-saida
 * Valida a liberação de saída da OS no pátio ou concede liberação excepcional auditada com RBAC
 */
router.post('/api/financeiro/os/:osId/liberar-saida', requirePermission('os:read', 'os:write', 'financial:read', 'financial:write', 'operation:read'), async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    const osId = req.params.osId;
    const { forcarLiberacao, justificativa } = req.body || {};
    const role = (req.securityContext?.role || req.user?.role || '').toLowerCase();
    const operadorNome = req.securityContext?.fullName || req.securityContext?.actorId || req.user?.username || 'operador';

    let resultado = null;
    const saveRes = await mutateTenantState(req, (draft) => {
      resultado = financialAnalystService.validarOuAutorizarSaidaPatioOS(draft, {
        osId,
        forcarLiberacao: Boolean(forcarLiberacao),
        justificativa,
        operador: {
          perfil: role,
          nome: operadorNome,
          actorId: req.securityContext?.actorId
        }
      });

      if (!resultado.ok) {
        return {
          abort: true,
          status: resultado.status || 400,
          code: resultado.code,
          error: resultado.error || resultado.message,
          message: resultado.message,
          saldoRestante: resultado.saldoRestante
        };
      }
    });

    if (saveRes?.aborted) {
      const mutRes = saveRes.mutatorResult || saveRes;
      // Registro de auditoria quando liberação for negada (por retenção ou por falta de permissão RBAC)
      try {
        await recordSecurityAudit({
          tenantId,
          actorId: req.securityContext?.actorId || 'operador',
          action: 'financeiro:os:liberar_saida_negada',
          entity: 'ordem_servico',
          entityId: String(osId),
          details: {
            osId,
            motivo: mutRes.code || 'bloqueado',
            forcarLiberacao: Boolean(forcarLiberacao),
            role,
            saldoRestante: mutRes.saldoRestante
          }
        });
      } catch (_) {}

      return res.status(mutRes.status || saveRes.status || 400).json({
        success: false,
        code: mutRes.code,
        error: mutRes.error,
        message: mutRes.message,
        saldoRestante: mutRes.saldoRestante
      });
    }

    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({
        success: false,
        error: saveRes?.error || 'Falha ao processar liberação de saída de pátio.'
      });
    }

    // Registro de auditoria quando liberação excepcional for concedida
    if (resultado.statusLiberacaoPatio === 'liberado_excepcional') {
      try {
        await recordSecurityAudit({
          tenantId,
          actorId: req.securityContext?.actorId || 'operador',
          action: 'financeiro:os:liberar_saida_excepcional',
          entity: 'ordem_servico',
          entityId: String(osId),
          details: {
            osId,
            justificativa,
            saldoPendenteNaSaida: resultado.saldoRestante,
            autorizadoPor: operadorNome,
            role
          }
        });
      } catch (auditErr) {
        console.warn('[Financeiro Liberar Saida OS Audit] Falha não-bloqueante:', auditErr.message);
      }
    }

    res.status(200).json({
      success: true,
      ...resultado
    });
  } catch (err) {
    console.error('[API /api/financeiro/os/:osId/liberar-saida POST] Erro:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/financeiro/os/:osId/cobranca
 * Retorna mensagem de cobrança amigável formatada para envio ao cliente da OS via WhatsApp
 */
router.get('/api/financeiro/os/:osId/cobranca', requirePermission('financial:read'), async (req, res) => {
  try {
    const { osId } = req.params;
    const state = await getOrLoadState(req);
    const resultado = financialAnalystService.gerarTextoCobrancaOS(state, osId, req.query || {});
    res.status(200).json({
      success: true,
      ...resultado
    });
  } catch (err) {
    console.error('[API /api/financeiro/os/:osId/cobranca GET] Erro:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * 4.1.3 GET /api/financeiro/patio/boxes
 * Retorna o mapa de ocupação física de boxes/valetas e contadores de resumo
 */
router.get('/api/financeiro/patio/boxes', requirePermission('financial:read', 'os:read', 'operation:read', 'labor:read'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const resultado = financialAnalystService.listarOcupacaoBoxes(state, req.query || {});
    res.json({
      success: true,
      boxes: resultado.boxes || resultado,
      resumoBoxes: resultado.resumoBoxes
    });
  } catch (err) {
    console.error('[API /api/financeiro/patio/boxes GET] Erro:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * 4.1.4 POST /api/financeiro/os/:osId/alocar-box
 * Aloca a OS em um box com trava de colisão (409) e auditoria
 */
router.post('/api/financeiro/os/:osId/alocar-box', requirePermission('os:write', 'labor:write', 'financial:write', 'operation:manage'), async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    const osId = req.params.osId;
    const { boxId, mecanico } = req.body || {};
    const operador = req.securityContext?.fullName || req.securityContext?.actorId || 'operador';

    let resultado = null;
    const saveRes = await mutateTenantState(req, (draft) => {
      try {
        resultado = financialAnalystService.alocarBoxOS(draft, {
          osId,
          boxId,
          mecanico,
          operador: {
            actorId: req.securityContext?.actorId,
            nome: operador
          }
        });
      } catch (err) {
        return {
          abort: true,
          status: err.status || err.statusCode || 400,
          code: err.code || 'ERRO_ALOCACAO_BOX',
          error: err.message,
          message: err.message
        };
      }
    });

    if (saveRes?.aborted) {
      const mutRes = saveRes.mutatorResult || saveRes;
      return res.status(mutRes.status || saveRes.status || 400).json({
        success: false,
        code: mutRes.code,
        error: mutRes.error,
        message: mutRes.message
      });
    }

    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({
        success: false,
        error: saveRes?.error || 'Falha ao persistir alocação de box'
      });
    }

    try {
      await recordSecurityAudit({
        tenantId,
        actorId: req.securityContext?.actorId || 'operador',
        action: 'patio:os:alocar_box',
        entity: 'ordem_servico',
        entityId: String(osId),
        details: {
          osId,
          boxId: resultado?.box?.id || boxId,
          mecanico: resultado?.os?.mecanico,
          operador
        }
      });
    } catch (auditErr) {
      console.warn('[Alocar Box Audit] Falha não-bloqueante:', auditErr.message);
    }

    res.json({
      success: true,
      os: resultado.os,
      box: resultado.box,
      resumoBoxes: resultado.resumoBoxes
    });
  } catch (err) {
    console.error('[API /api/financeiro/os/:osId/alocar-box POST] Erro:', err);
    res.status(err.status || 500).json({ success: false, code: err.code, error: err.message });
  }
});

/**
 * 4.1.5 POST /api/financeiro/os/:osId/liberar-box
 * Libera o box ocupado pela OS calculando tempo de permanência e registrando auditoria
 */
router.post('/api/financeiro/os/:osId/liberar-box', requirePermission('os:write', 'labor:write', 'financial:write', 'operation:manage'), async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    const osId = req.params.osId;
    const { boxId, motivo } = req.body || {};
    const operador = req.securityContext?.fullName || req.securityContext?.actorId || 'operador';

    let resultado = null;
    const saveRes = await mutateTenantState(req, (draft) => {
      try {
        resultado = financialAnalystService.liberarBoxOS(draft, {
          osId,
          boxId,
          motivo,
          operador: {
            actorId: req.securityContext?.actorId,
            nome: operador
          }
        });
      } catch (err) {
        return {
          abort: true,
          status: err.status || err.statusCode || 400,
          code: err.code || 'ERRO_LIBERACAO_BOX',
          error: err.message,
          message: err.message
        };
      }
    });

    if (saveRes?.aborted) {
      const mutRes = saveRes.mutatorResult || saveRes;
      return res.status(mutRes.status || saveRes.status || 400).json({
        success: false,
        code: mutRes.code,
        error: mutRes.error,
        message: mutRes.message
      });
    }

    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({
        success: false,
        error: saveRes?.error || 'Falha ao persistir liberação de box'
      });
    }

    try {
      await recordSecurityAudit({
        tenantId,
        actorId: req.securityContext?.actorId || 'operador',
        action: 'patio:os:liberar_box',
        entity: 'ordem_servico',
        entityId: String(osId),
        details: {
          osId,
          boxId: resultado?.boxId,
          tempoPermanenciaMinutos: resultado?.tempoPermanenciaMinutos,
          motivo: motivo || 'liberacao_manual',
          operador
        }
      });
    } catch (auditErr) {
      console.warn('[Liberar Box Audit] Falha não-bloqueante:', auditErr.message);
    }

    res.json({
      success: true,
      os: resultado.os,
      boxId: resultado.boxId,
      tempoPermanenciaMinutos: resultado.tempoPermanenciaMinutos,
      resumoBoxes: resultado.resumoBoxes
    });
  } catch (err) {
    console.error('[API /api/financeiro/os/:osId/liberar-box POST] Erro:', err);
    res.status(err.status || 500).json({ success: false, code: err.code, error: err.message });
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
