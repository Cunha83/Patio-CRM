'use strict';

const financialAnalystService = require('../financialAnalystService');
const { arredondar, formatarMoeda, hojeISO } = require('./executiveHelpers');

/**
 * 1. GESTÃO DE COMPRAS & ESTOQUE CRÍTICO
 */
function analisarComprasEEstoque(state = {}, options = {}) {
  const tenantId = options.tenantId || state.tenantId || 'default';
  const dataRef = options.dataRef || hojeISO();

  const pecas = Array.isArray(state.pecas)
    ? state.pecas.filter(p => !p.tenantId || p.tenantId === tenantId)
    : [];

  const osList = Array.isArray(state.os)
    ? state.os.filter(o => !o.tenantId || o.tenantId === tenantId)
    : [];

  const osAtivas = osList.filter(o => {
    const st = String(o.st || o.status || '').toLowerCase();
    return st !== 'finalizada' && st !== 'cancelada' && st !== 'concluida';
  });

  const demandaPorPecaId = new Map();
  const osPorPecaId = new Map();

  for (const os of osAtivas) {
    const itensPeca = Array.isArray(os.pecas) ? os.pecas : (Array.isArray(os.parts) ? os.parts : []);
    for (const item of itensPeca) {
      const qtdDemandada = Math.max(0, Number(item.qtd || item.quantidade) || 1);
      const chaveId = item.pecaId || item.id || item.cod || String(item.nome || '').trim().toLowerCase();

      demandaPorPecaId.set(chaveId, (demandaPorPecaId.get(chaveId) || 0) + qtdDemandada);

      if (!osPorPecaId.has(chaveId)) {
        osPorPecaId.set(chaveId, []);
      }
      osPorPecaId.get(chaveId).push({
        osId: os.id,
        osNum: os.num || os.numeroOS || os.id,
        placa: os.vei || os.placa || 'Sem placa',
        cliente: os.cli || os.clienteNome || 'Cliente não informado',
        qtdDemandada
      });
    }
  }

  const itensNecessidade = [];
  let custoTotalReposicao = 0;
  let custoOSUrgente = 0;
  let totalItensCriticosOS = 0;
  let totalItensZerados = 0;
  let totalItensAbaixoMinimo = 0;

  for (const p of pecas) {
    const estoqueAtual = Number(p.qtd) || 0;
    const estoqueMinimo = Number(p.min !== undefined ? p.min : 1);
    const custoUnitario = Number(p.custo) || 0;
    const precoVenda = Number(p.venda) || (custoUnitario > 0 ? custoUnitario * 1.5 : 0);

    const chave1 = p.id;
    const chave2 = p.cod;
    const chave3 = String(p.nome || '').trim().toLowerCase();

    const demandaOS = (demandaPorPecaId.get(chave1) || 0) +
                      (chave2 ? (demandaPorPecaId.get(chave2) || 0) : 0) +
                      (chave3 ? (demandaPorPecaId.get(chave3) || 0) : 0);

    const ossVinculadas = [
      ...(osPorPecaId.get(chave1) || []),
      ...(chave2 ? (osPorPecaId.get(chave2) || []) : []),
      ...(chave3 ? (osPorPecaId.get(chave3) || []) : [])
    ];

    const saldoAposOS = estoqueAtual - demandaOS;
    const deficitOS = saldoAposOS < 0 ? Math.abs(saldoAposOS) : 0;
    const isAbaixoMinimo = estoqueAtual <= estoqueMinimo;
    const isZerado = estoqueAtual <= 0;

    if (deficitOS > 0 || isZerado || isAbaixoMinimo) {
      let qtdSugerida = 0;
      let motivo = '';
      let prioridade = 'media';

      if (deficitOS > 0) {
        qtdSugerida = deficitOS + Math.max(0, estoqueMinimo);
        motivo = `Déficit para OS ativa no pátio (Falta: ${deficitOS} un) + Estoque Mínimo (${estoqueMinimo} un)`;
        prioridade = 'urgente';
        totalItensCriticosOS++;
      } else if (isZerado) {
        qtdSugerida = Math.max(1, estoqueMinimo);
        motivo = 'Estoque zerado no almoxarifado';
        prioridade = 'alta';
        totalItensZerados++;
      } else {
        qtdSugerida = Math.max(1, estoqueMinimo - estoqueAtual);
        motivo = `Abaixo do estoque mínimo (Atual: ${estoqueAtual}, Mín: ${estoqueMinimo})`;
        prioridade = 'media';
        totalItensAbaixoMinimo++;
      }

      const custoItemTotal = arredondar(qtdSugerida * custoUnitario);
      custoTotalReposicao = arredondar(custoTotalReposicao + custoItemTotal);

      if (deficitOS > 0) {
        const custoDestraveOS = arredondar(deficitOS * custoUnitario);
        custoOSUrgente = arredondar(custoOSUrgente + custoDestraveOS);
      }

      itensNecessidade.push({
        pecaId: p.id,
        cod: p.cod || '',
        nome: p.nome || 'Peça sem descrição',
        fornecedor: p.forn || p.fornecedor || 'Não cadastrado',
        localizacao: p.loc || 'Pátio',
        estoqueAtual,
        estoqueMinimo,
        demandaOS,
        saldoAposOS,
        deficitOS,
        qtdSugerida,
        custoUnitario,
        precoVenda,
        custoTotalEstimado: custoItemTotal,
        prioridade,
        motivo,
        ossImpactadas: ossVinculadas
      });
    }
  }

  const pesoPrioridade = { urgente: 1, alta: 2, media: 3 };
  itensNecessidade.sort((a, b) => (pesoPrioridade[a.prioridade] || 99) - (pesoPrioridade[b.prioridade] || 99));

  let previsaoCaixa = null;
  try {
    previsaoCaixa = financialAnalystService.gerarPrevisaoFluxoCaixa(state, { dias: 15, dataRef });
  } catch (errPrev) {
    previsaoCaixa = {
      saldoAtual: 0,
      marcos: { em15Dias: { saldo: 0, seguro: false } },
      caixaMinimoSeguranca: 2000
    };
  }

  const caixas = Array.isArray(state.caixas) ? state.caixas : [];
  const caixaAberto = caixas.find(c => (c.status === 'aberto' || c.aberto) && (!c.tenantId || c.tenantId === tenantId));
  const saldoCaixaTurno = caixaAberto && caixaAberto.saldoAtual !== undefined
    ? Number(caixaAberto.saldoAtual)
    : (caixas.length > 0 && caixas[caixas.length - 1].saldoAtual !== undefined ? Number(caixas[caixas.length - 1].saldoAtual) : null);

  const saldoConsolidadoEngine = Number(previsaoCaixa?.saldoAtual) || 0;
  const saldoAtual = (saldoCaixaTurno !== null && !isNaN(saldoCaixaTurno) && (saldoConsolidadoEngine === 0 || saldoCaixaTurno > saldoConsolidadoEngine))
    ? saldoCaixaTurno
    : saldoConsolidadoEngine;

  const saldo15d = Number(previsaoCaixa?.marcos?.em15Dias?.saldo !== undefined
    ? previsaoCaixa.marcos.em15Dias.saldo
    : saldoAtual);
  const caixaMinimoSeguranca = Number(state.cfg?.caixaMinimoSeguranca || 2000);

  const saldoAposTotal = arredondar(saldoAtual - custoTotalReposicao);
  const saldoAposUrgente = arredondar(saldoAtual - custoOSUrgente);

  let statusViabilidade = 'liberado_total';
  let podeComprarTotal = false;
  let podeComprarUrgente = false;
  let parecerFinanceiro = '';

  if (itensNecessidade.length === 0) {
    statusViabilidade = 'estoque_em_dia';
    parecerFinanceiro = 'O estoque está devidamente suprido. Não há peças abaixo do mínimo nem OSs travadas por falta de materiais.';
  } else if (saldoAtual >= custoTotalReposicao && saldoAposTotal >= caixaMinimoSeguranca) {
    statusViabilidade = 'liberado_total';
    podeComprarTotal = true;
    podeComprarUrgente = true;
    parecerFinanceiro = `A oficina possui folga de caixa confortável (Saldo atual: ${formatarMoeda(saldoAtual)} | Previsão 15d: ${formatarMoeda(saldo15d)}). Compra total recomendada de R$ ${formatarMoeda(custoTotalReposicao)} sem comprometer o caixa de segurança (${formatarMoeda(caixaMinimoSeguranca)}).`;
  } else if (custoOSUrgente > 0 && saldoAtual >= custoOSUrgente && saldoAposUrgente >= 0) {
    statusViabilidade = 'liberado_parcial_os';
    podeComprarTotal = false;
    podeComprarUrgente = true;
    parecerFinanceiro = `Folga de caixa restrita para compra global (${formatarMoeda(custoTotalReposicao)}). Priorize imediatamente apenas as peças de OSs ativas no pátio (${formatarMoeda(custoOSUrgente)}) para destravar entregas e faturamentos, postergando a recomposição de estoque de segurança.`;
  } else if (custoOSUrgente > 0 && saldoAtual < custoOSUrgente) {
    statusViabilidade = 'restringido_caixa';
    podeComprarTotal = false;
    podeComprarUrgente = false;
    parecerFinanceiro = `Alerta Crítico: O caixa atual (${formatarMoeda(saldoAtual)}) não cobre nem o valor urgente de peças das OSs no pátio (${formatarMoeda(custoOSUrgente)}). Negocie prazo faturado com fornecedores (30d) ou solicite adiantamento financeiro do cliente da OS antes de solicitar o material.`;
  } else {
    statusViabilidade = 'postergar_reposicao';
    podeComprarTotal = false;
    podeComprarUrgente = false;
    parecerFinanceiro = `Saldo atual (${formatarMoeda(saldoAtual)}) abaixo da margem de segurança para compras preventivas (${formatarMoeda(custoTotalReposicao)}). Aguarde os recebimentos previstos nos próximos dias antes de emitir novos pedidos de compra.`;
  }

  return {
    sucesso: true,
    tenantId,
    dataReferencia: dataRef,
    resumo: {
      totalItensNecessidade: itensNecessidade.length,
      totalItensCriticosOS,
      totalItensZerados,
      totalItensAbaixoMinimo,
      custoTotalReposicao,
      custoOSUrgente
    },
    financeiro: {
      saldoAtual,
      saldo15d,
      caixaMinimoSeguranca,
      statusViabilidade,
      podeComprarTotal,
      podeComprarUrgente,
      parecerFinanceiro
    },
    itens: itensNecessidade
  };
}

module.exports = {
  analisarComprasEEstoque
};

