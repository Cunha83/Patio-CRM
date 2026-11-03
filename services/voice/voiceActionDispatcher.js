'use strict';

const {
  acoesPendentes,
  gerarTokenAcao,
  canReadFinancial,
  canWriteFinancial,
  canDeleteOS,
  canWriteOS,
  canAdjustInventory
} = require('./voiceSecurity');

const { handleConfirmationAction, handleCancellationAction } = require('./voiceConfirmationActions');
const { handleOpenOS } = require('./voiceOpenOSAction');
const { handlePatioAction } = require('./voicePatioActions');
const { handleInventoryAction } = require('./voiceInventoryActions');
const { handleLaborAction } = require('./voiceLaborActions');
const { handlePricingAction } = require('./voicePricingActions');
const { handleFinancialAction } = require('./voiceFinancialActions');
const { handleCRMAction } = require('./voiceCRMActions');
const { handleExecutiveAction } = require('./voiceExecutiveActions');

async function executarAcao({ interpretado, input, context = {}, state = {} }) {
  if (!state.os) state.os = [];
  if (!state.veiculos) state.veiculos = [];
  if (!state.clientes) state.clientes = [];
  if (!state.boxes) state.boxes = [];
  if (!state.auditoria) state.auditoria = [];

  const rawText = (input && typeof input.text === 'string') ? input.text :
                  (input && typeof input.texto === 'string') ? input.texto :
                  (typeof input === 'string' ? input : '');
  const dataHoje = new Date().toISOString().slice(0, 10);
  const intencao = interpretado.intencao || 'duvida_geral';

  if (intencao === 'falha_transcricao_audio') {
    return {
      ok: true,
      acao: 'falha_transcricao_audio',
      resposta: interpretado.resposta_falada
    };
  }

  // ── 1. CONFIRMAÇÃO / CANCELAMENTO DE AÇÃO PENDENTE ───────
  if (intencao === 'confirmar_acao') {
    return await handleConfirmationAction({ context, state, executarAcaoFn: executarAcao });
  }

  if (intencao === 'cancelar_acao_pendente') {
    return handleCancellationAction({ context, state });
  }

  // ── 1.9 AUTORIZAÇÃO PRÉVIA POR INTENÇÃO E AÇÃO (DEFAULT-DENY) ──
  if (intencao === 'faturar_os') {
    if (!canWriteFinancial(context) || !canWriteOS(context)) {
      return {
        ok: false,
        acao: 'faturar_os',
        negado: true,
        resposta: 'Acesso negado: seu perfil não possui permissão para faturar ordens de serviço.'
      };
    }
  }

  if (intencao === 'excluir_os') {
    if (!canDeleteOS(context)) {
      return {
        ok: false,
        acao: 'excluir_os',
        negado: true,
        resposta: 'Acesso negado: seu perfil não possui permissão para excluir ordens de serviço.'
      };
    }
  }

  if (intencao === 'abrir_os') {
    if (!canWriteOS(context)) {
      return {
        ok: false,
        acao: 'abrir_os',
        negado: true,
        resposta: 'Acesso negado: seu perfil possui permissão apenas de leitura para ordens de serviço.'
      };
    }
  }

  if (intencao === 'solicitar_ajuste_estoque' || intencao === 'ajustar_estoque') {
    if (!canAdjustInventory(context)) {
      return {
        ok: false,
        acao: intencao,
        negado: true,
        resposta: 'Acesso negado: seu perfil não possui permissão para ajustar o estoque físico de peças.'
      };
    }
  }

  if (['consultar_financeiro', 'consultar_previsao_caixa', 'consultar_auditoria_financeira'].includes(intencao)) {
    if (!canReadFinancial(context)) {
      return {
        ok: false,
        acao: intencao,
        negado: true,
        resposta: 'Acesso negado: seu perfil não possui permissão para consultar dados financeiros da oficina.'
      };
    }
  }

  if (['abrir_caixa', 'fechar_caixa', 'registrar_movimentacao_caixa'].includes(intencao)) {
    if (!canWriteFinancial(context)) {
      return {
        ok: false,
        acao: intencao,
        negado: true,
        resposta: 'Acesso negado: seu perfil não possui permissão para movimentar ou alterar o caixa da oficina.'
      };
    }
  }

  // ── 2. PROTEÇÃO DE ALTO RISCO ─────────────────────────────
  const foiConfirmadoInternamente = context._confirmadoInternamente === true;
  if (interpretado.risco === 'alto' && !foiConfirmadoInternamente) {
    const resourceId = interpretado.os?.id || interpretado.os?.num || context.activeOsId || 'os_global';
    const token = gerarTokenAcao({
      tenantId: context.tenantId || 'default',
      actorId: context.actorId || 'operador',
      resourceId: String(resourceId),
      action: intencao,
      version: state.versao || 0,
      ttlMs: 5 * 60 * 1000
    });

    acoesPendentes.set(token, {
      interpretado: { ...interpretado, risco: 'baixo' },
      input,
      context,
      expiraEm: Date.now() + 5 * 60 * 1000
    });

    return {
      ok: true,
      pendenteConfirmacao: true,
      token,
      acao: intencao,
      risco: 'alto',
      resposta: interpretado.resposta_falada || 'Atenção: Esta é uma ação crítica. Deseja realmente confirmar a execução?'
    };
  }

  if (['ajustar_estoque', 'cancelar_pedido_compra', 'aprovar_compra'].includes(intencao)) {
    const token = gerarTokenAcao({
      tenantId: context.tenantId,
      actorId: context.actorId,
      intencao,
      dados: { ...interpretado, texto: rawText }
    });
    acoesPendentes.set(token, {
      intencao,
      interpretado,
      context,
      expiraEm: Date.now() + 5 * 60 * 1000
    });
    let msgAlerta = 'Atenção: Ação de alto risco de estoque/compras identificada.';
    if (intencao === 'ajustar_estoque') {
      msgAlerta = 'Atenção: O ajuste manual de estoque altera o inventário físico e exige confirmação explícita.';
    } else if (intencao === 'cancelar_pedido_compra') {
      msgAlerta = 'Atenção: Cancelar pedido de compra é uma operação de alto impacto e exige confirmação.';
    } else if (intencao === 'aprovar_compra') {
      msgAlerta = 'Atenção: Aprovação de compra de valor elevado exige confirmação por token de segurança.';
    }
    return {
      ok: true,
      acao: intencao,
      risco: 'alto',
      pendenteConfirmacao: true,
      token,
      resposta: `${msgAlerta} Deseja prosseguir com a confirmação?`
    };
  }

  // ── 3. DISPATCH PARA SUBMÓDULOS DE AÇÃO ───────────────────
  if (intencao === 'abrir_os') {
    return await handleOpenOS({ interpretado, input, context, state, dataHoje });
  }

  // Ações de Pátio / Inspeção / Orçamento / Status / Exclusão
  const resPatio = await handlePatioAction({ intencao, interpretado, input, context, state });
  if (resPatio) return resPatio;

  // Ações de Estoque / Almoxarifado
  const resInv = await handleInventoryAction({ intencao, interpretado, input, context, state });
  if (resInv) return resInv;

  // Ações de Apontamento / Mão de Obra / Equipe
  const resLabor = await handleLaborAction({ intencao, input, context, state });
  if (resLabor) return resLabor;

  // Ações de Precificação e Rentabilidade
  const resPricing = await handlePricingAction({ intencao, interpretado, input, context, state });
  if (resPricing) return resPricing;

  // Ações de CRM, Frotas e Agendamentos
  const resCRM = await handleCRMAction({ intencao, interpretado, input, context, state });
  if (resCRM) return resCRM;

  // Ações Financeiras
  const resFin = await handleFinancialAction({ intencao, interpretado, input, context, state });
  if (resFin) return resFin;

  // Ações Executivas e Treinamento
  const resExec = await handleExecutiveAction({ intencao, interpretado, input, context, state });
  if (resExec) return resExec;

  return {
    ok: true,
    acao: 'duvida_geral',
    resposta: interpretado.resposta_falada || 'Entendido. Como posso ajudar com a oficina?'
  };
}

module.exports = {
  executarAcao
};

