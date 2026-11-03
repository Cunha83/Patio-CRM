'use strict';

const financialEngine = require('../financialEngine');
const financialAnalystService = require('../financialAnalystService');
const { canReadFinancial, canWriteFinancial } = require('./voiceSecurity');

async function handleFinancialAction({ intencao, interpretado, input, context = {}, state = {} }) {
  const rawText = (input && typeof input.text === 'string') ? input.text :
                  (input && typeof input.texto === 'string') ? input.texto :
                  (typeof input === 'string' ? input : '');
  const tLower = rawText.trim().toLowerCase();

  if (intencao === 'consultar_financeiro') {
    if (!canReadFinancial(context)) {
      return {
        ok: false,
        acao: 'consultar_financeiro',
        negado: true,
        resposta: 'Acesso negado: seu perfil não possui permissão para consultar dados financeiros da oficina.'
      };
    }

    const kpis = financialEngine.calcularKPIsFinanceiros(state);
    const subtipo = interpretado.subtipo || (
      (tLower.includes('pagar') || tLower.includes('vencimento')) ? 'pagar' :
      (tLower.includes('receber')) ? 'receber' :
      (tLower.includes('saldo') || tLower.includes('caixa')) ? 'saldo' :
      (tLower.includes('faturamento') || tLower.includes('faturamos')) ? 'faturamento' : 'geral'
    );

    let resp = '';
    if (subtipo === 'pagar') {
      const contas = Array.isArray(state.contas) ? state.contas : [];
      const aPagarAbertas = contas
        .filter(c => c.tipo === 'pagar' && !c.pago)
        .sort((a, b) => (a.venc || '').localeCompare(b.venc || ''));

      if (aPagarAbertas.length === 0) {
        resp = 'Não há contas a pagar pendentes no momento. Todas estão em dia.';
      } else {
        const listaStr = aPagarAbertas.slice(0, 3).map(c => {
          const desc = c.desc || c.parte || 'Fornecedor';
          const val = financialEngine.formatarMoeda(c.valor);
          const dataVenc = c.venc ? (financialEngine.formatarDataBRFull(c.venc) || c.venc) : 'sem data';
          return `${desc} (${val} com vencimento em ${dataVenc})`;
        }).join(', ');
        resp = `Temos ${aPagarAbertas.length} conta(s) a pagar pendente(s), totalizando ${financialEngine.formatarMoeda(kpis.totalPagarAberto)}. Próximos vencimentos: ${listaStr}.`;
      }
    } else if (subtipo === 'receber') {
      const contas = Array.isArray(state.contas) ? state.contas : [];
      const aReceberAbertas = contas.filter(c => c.tipo === 'receber' && !c.pago);
      if (aReceberAbertas.length === 0) {
        resp = 'Não há títulos a receber em aberto no momento.';
      } else {
        resp = `Temos ${aReceberAbertas.length} título(s) a receber em aberto, totalizando ${financialEngine.formatarMoeda(kpis.totalReceberAberto)}. Vencidos: ${financialEngine.formatarMoeda(kpis.totalRecVencidos)}, a receber hoje: ${financialEngine.formatarMoeda(kpis.totalRecHoje)}.`;
      }
    } else if (subtipo === 'saldo') {
      resp = `O saldo atual consolidado do caixa é de ${financialEngine.formatarMoeda(kpis.saldoConsolidado)}. Total de entradas registradas: ${financialEngine.formatarMoeda(kpis.totalEntradasGeral)} e saídas: ${financialEngine.formatarMoeda(kpis.totalSaidasGeral)}.`;
    } else if (subtipo === 'faturamento') {
      const fatTotal = state.financeiro?.faturamentoTotal || kpis.totalEntradasGeral;
      resp = `O faturamento registrado no sistema é de ${financialEngine.formatarMoeda(fatTotal)}.`;
    } else {
      resp = `Posição financeira da oficina: Saldo em caixa ${financialEngine.formatarMoeda(kpis.saldoConsolidado)}, a pagar ${financialEngine.formatarMoeda(kpis.totalPagarAberto)} e a receber ${financialEngine.formatarMoeda(kpis.totalReceberAberto)}.`;
    }

    return {
      ok: true,
      acao: 'consultar_financeiro',
      subtipo,
      kpis,
      resposta: resp
    };
  }

  if (intencao === 'abrir_caixa') {
    if (!canWriteFinancial(context)) {
      return {
        ok: false,
        acao: 'abrir_caixa',
        negado: true,
        resposta: 'Acesso negado: seu perfil não possui permissão para abrir o caixa.'
      };
    }
    const tenantId = context.tenantId || 'default';
    const resAbertura = financialAnalystService.abrirCaixa(state, {
      tenantId,
      saldoInicial: interpretado.saldoInicial || 0,
      operador: context.actorId || 'operador',
      operadorNome: context.fullName || context.actorId || 'Operador'
    });

    return {
      ok: resAbertura.ok,
      acao: 'abrir_caixa',
      caixa: resAbertura.caixa,
      resposta: resAbertura.mensagem || resAbertura.error
    };
  }

  if (intencao === 'fechar_caixa') {
    if (!canWriteFinancial(context)) {
      return {
        ok: false,
        acao: 'fechar_caixa',
        negado: true,
        resposta: 'Acesso negado: seu perfil não possui permissão para fechar o caixa.'
      };
    }
    const tenantId = context.tenantId || 'default';
    const resFechamento = financialAnalystService.fecharCaixa(state, {
      tenantId,
      operador: context.actorId || 'operador',
      operadorNome: context.fullName || context.actorId || 'Operador'
    });

    return {
      ok: resFechamento.ok,
      acao: 'fechar_caixa',
      caixa: resFechamento.caixaFechado,
      fechamento: resFechamento.resumoFechamento,
      resposta: resFechamento.mensagem || resFechamento.error
    };
  }

  if (intencao === 'registrar_movimentacao_caixa') {
    if (!canWriteFinancial(context)) {
      return {
        ok: false,
        acao: 'registrar_movimentacao_caixa',
        negado: true,
        resposta: 'Acesso negado: seu perfil não possui permissão para lançar movimentações no caixa.'
      };
    }
    const tenantId = context.tenantId || 'default';
    const resMov = financialAnalystService.registrarMovimentacao(state, {
      tenantId,
      tipo: interpretado.tipo || 'despesa',
      valor: interpretado.valor || 0,
      descricao: interpretado.descricao || 'Movimentação por voz',
      operador: context.actorId || 'operador',
      formaPagamento: 'dinheiro'
    });

    return {
      ok: resMov.ok,
      acao: 'registrar_movimentacao_caixa',
      movimentacao: resMov.movimentacao,
      saldoAtual: resMov.saldoCaixaAtual,
      resposta: resMov.mensagem || resMov.error
    };
  }

  if (intencao === 'consultar_previsao_caixa') {
    if (!canReadFinancial(context)) {
      return {
        ok: false,
        acao: 'consultar_previsao_caixa',
        negado: true,
        resposta: 'Acesso negado: seu perfil não possui permissão para consultar previsão financeira.'
      };
    }
    const prev = financialAnalystService.gerarPrevisaoFluxoCaixa(state, { dias: 30 });
    const saldoAt = financialEngine.formatarMoeda(prev.saldoAtual);
    const s7 = financialEngine.formatarMoeda(prev.marcos.em7Dias.saldo);
    const s30 = financialEngine.formatarMoeda(prev.marcos.em30Dias.saldo);
    const patioProv = financialEngine.formatarMoeda(prev.receitaPotencialPatio.cenarioProvavel);

    let textoResp = `Previsão de Fluxo de Caixa: Saldo atual de ${saldoAt}, projetado para 7 dias em ${s7} e para 30 dias em ${s30}. Receita potencial estimada das OS no pátio: ${patioProv}.`;
    if (prev.diagnosticoFuro.furoDetectado) {
      textoResp += ` Atenção: Risco de furo de caixa detectado em ${financialEngine.formatarDataBRFull(prev.diagnosticoFuro.dataPrimeiroFuro)}.`;
    } else {
      textoResp += ' O fluxo projetado permanece saudável e acima do caixa mínimo de segurança.';
    }

    return {
      ok: true,
      acao: 'consultar_previsao_caixa',
      previsao: prev,
      resposta: textoResp
    };
  }

  if (intencao === 'consultar_auditoria_financeira') {
    if (!canReadFinancial(context)) {
      return {
        ok: false,
        acao: 'consultar_auditoria_financeira',
        negado: true,
        resposta: 'Acesso negado: seu perfil não possui permissão para consultar auditoria financeira.'
      };
    }
    const controles = financialAnalystService.avaliarControlesInternos(state);
    return {
      ok: true,
      acao: 'consultar_auditoria_financeira',
      controles,
      resposta: controles.parecerExecutivo
    };
  }

  return null;
}

module.exports = {
  handleFinancialAction
};

