'use strict';

const { garantirColecoesLabor } = require('./laborTrackingService');

function arredondar(val, decimais = 2) {
  const n = Number(val) || 0;
  return Number(Math.round(n + 'e' + decimais) + 'e-' + decimais);
}

/**
 * Calcula o custo real de mão de obra de uma OS com base nos apontamentos
 * e no custoHora individual de cada mecânico/colaborador.
 */
function calcularCustoMaoDeObraOS({ tenantId, state, osId }) {
  if (!state) return { custoMaoObra: 0, horasHomemTotal: 0, custoRetrabalho: 0, horasRetrabalho: 0, apontamentos: [] };
  garantirColecoesLabor(state);

  const entries = state.laborEntries.filter(
    e => e.tenantId === tenantId && e.osId === osId && e.status !== 'cancelado'
  );

  let custoMaoObra = 0;
  let minutosHomemTotal = 0;
  let custoRetrabalho = 0;
  let minutosRetrabalho = 0;
  const detalheItens = [];

  for (const e of entries) {
    const worker = state.workers.find(w => w.id === e.workerId && w.tenantId === tenantId);
    const custoHora = Number(worker?.custoHora) || 0;
    const durMin = Number(e.durationMinutes) || 0;
    const durHoras = durMin / 60;
    const custoItem = arredondar(durHoras * custoHora);

    minutosHomemTotal += durMin;
    custoMaoObra += custoItem;

    if (e.type === 'retrabalho') {
      minutosRetrabalho += durMin;
      custoRetrabalho += custoItem;
    }

    detalheItens.push({
      entryId: e.id,
      workerId: e.workerId,
      workerNome: e.workerNome || worker?.nome || 'Mecânico',
      serviceItemId: e.serviceItemId,
      serviceNome: e.serviceNome,
      type: e.type,
      duracaoMinutos: durMin,
      duracaoHoras: arredondar(durHoras, 2),
      custoHora,
      custoTotal: custoItem
    });
  }

  custoMaoObra = arredondar(custoMaoObra);
  custoRetrabalho = arredondar(custoRetrabalho);
  const horasHomemTotal = arredondar(minutosHomemTotal / 60, 2);
  const horasRetrabalho = arredondar(minutosRetrabalho / 60, 2);

  return {
    custoMaoObra,
    horasHomemTotal,
    custoRetrabalho,
    horasRetrabalho,
    apontamentos: detalheItens
  };
}

/**
 * Calcula o custo real das peças consumidas na OS a partir do custo médio ponderado
 * ou unitCost registrado no livro-razão de estoque (NÃO usa preço de venda).
 */
function calcularCustoPecasOS({ tenantId, state, osId }) {
  if (!state) return { custoPecasConsumidas: 0, totalItens: 0, pecas: [] };
  garantirColecoesLabor(state);

  const movements = Array.isArray(state.inventoryMovements)
    ? state.inventoryMovements.filter(m => m.tenantId === tenantId && m.osId === osId)
    : [];

  const pecasConsumidas = [];
  let custoTotalPecas = 0;

  // 1. Apuração via Livro-Razão de Movimentações de Estoque (saida_os menos devolucao_os)
  const movSaidas = movements.filter(m => m.type === 'saida_os');
  const movDevolucoes = movements.filter(m => m.type === 'devolucao_os');

  if (movSaidas.length > 0) {
    for (const saida of movSaidas) {
      const peca = (state.pecas || []).find(p => p.id === saida.partId);
      const custoUnitario = saida.unitCost != null
        ? Number(saida.unitCost)
        : Number(peca?.custoMedio != null ? peca.custoMedio : peca?.custo || 0);

      // Desconta eventuais devoluções da mesma peça nesta OS
      const qtdDevolvida = movDevolucoes
        .filter(d => d.partId === saida.partId)
        .reduce((acc, d) => acc + (Number(d.quantity) || 0), 0);

      const qtdEfetiva = Math.max(0, (Number(saida.quantity) || 0) - qtdDevolvida);
      const custoItem = arredondar(qtdEfetiva * custoUnitario);

      custoTotalPecas += custoItem;
      pecasConsumidas.push({
        partId: saida.partId,
        descricao: peca?.descricao || peca?.nome || 'Peça',
        quantidade: qtdEfetiva,
        custoUnitario: arredondar(custoUnitario),
        custoTotal: custoItem
      });
    }
  } else {
    // 2. Fallback via os.pecas consumidas caso movimentações diretas não estejam registradas
    const os = (state.os || []).find(o => o.id === osId);
    if (os && Array.isArray(os.pecas)) {
      for (const p of os.pecas) {
        if (p.consumida || p.status === 'consumida' || p.st === 'consumida') {
          const pecaEstoque = (state.pecas || []).find(it => it.id === p.partId || it.id === p.pecaId);
          const custoUnitario = Number(pecaEstoque?.custoMedio != null ? pecaEstoque.custoMedio : (pecaEstoque?.custo != null ? pecaEstoque.custo : p.custo || 0));
          const qtd = Number(p.qtd) || 1;
          const custoItem = arredondar(qtd * custoUnitario);

          custoTotalPecas += custoItem;
          pecasConsumidas.push({
            partId: p.partId || p.pecaId || p.id,
            descricao: p.desc || p.nome || 'Peça',
            quantidade: qtd,
            custoUnitario: arredondar(custoUnitario),
            custoTotal: custoItem
          });
        }
      }
    }
  }

  custoTotalPecas = arredondar(custoTotalPecas);

  return {
    custoPecasConsumidas: custoTotalPecas,
    totalItens: pecasConsumidas.length,
    pecas: pecasConsumidas
  };
}

/**
 * Consolida o Custo Real da OS e calcula a Margem Bruta Operacional.
 *
 * custoRealOS = custoPecasConsumidas + custoMaoObra + custosAdicionaisPermitidos
 * margemBrutaOS = receitaAutorizada - custoRealOS
 * margemPercentual = (margemBrutaOS / receitaAutorizada) * 100
 */
function calcularCustoRealOS({ tenantId, state, osId }) {
  if (!state) return null;
  garantirColecoesLabor(state);

  const os = (state.os || []).find(o => o.id === osId && (o.tenantId === tenantId || !o.tenantId));
  if (!os) {
    throw new Error(`Ordem de serviço "${osId}" não encontrada.`);
  }

  const apuracaoMaoObra = calcularCustoMaoDeObraOS({ tenantId, state, osId });
  const apuracaoPecas = calcularCustoPecasOS({ tenantId, state, osId });
  const custosAdicionais = arredondar(Math.max(0, Number(os.custosAdicionais) || 0));

  const custoRealOS = arredondar(
    apuracaoPecas.custoPecasConsumidas + apuracaoMaoObra.custoMaoObra + custosAdicionais
  );

  // Valores de Venda / Faturamento Autorizado
  const receitaServicos = arredondar(
    (os.servicos || [])
      .filter(s => s.autorizado !== false && s.status !== 'recusado')
      .reduce((acc, s) => acc + (Number(s.preco || s.valorTotal || s.valor || 0)), 0)
  );

  const receitaPecas = arredondar(
    (os.pecas || [])
      .filter(p => p.autorizado !== false && p.status !== 'recusado')
      .reduce((acc, p) => acc + (Number(p.preco || p.valorTotal || p.valor || 0)), 0)
  );

  const descontoGeral = arredondar(Math.max(0, Number(os.desc) || 0));
  const receitaAutorizada = arredondar(Math.max(0, receitaServicos + receitaPecas - descontoGeral));

  // Margens Brutas
  const margemBrutaOS = arredondar(receitaAutorizada - custoRealOS);
  const margemPercentual = receitaAutorizada > 0
    ? arredondar((margemBrutaOS / receitaAutorizada) * 100, 1)
    : 0;

  const margemBrutaMaoObra = arredondar(receitaServicos - apuracaoMaoObra.custoMaoObra);
  const margemBrutaPecas = arredondar(receitaPecas - apuracaoPecas.custoPecasConsumidas);

  return {
    osId: os.id,
    osNum: os.num || os.id,
    placa: os.placa || 'Sem placa',
    status: os.st,
    // Custos Reais
    custoPecasConsumidas: apuracaoPecas.custoPecasConsumidas,
    custoMaoObra: apuracaoMaoObra.custoMaoObra,
    custosAdicionais,
    custoRealOS,
    // Faturamento / Venda
    receitaServicos,
    receitaPecas,
    descontoGeral,
    receitaAutorizada,
    // Margens Operacionais Brutas
    margemBrutaOS,
    margemPercentual, // %
    margemBrutaMaoObra,
    margemBrutaPecas,
    // Retrabalho
    custoRetrabalho: apuracaoMaoObra.custoRetrabalho,
    horasRetrabalho: apuracaoMaoObra.horasRetrabalho,
    horasHomemTotal: apuracaoMaoObra.horasHomemTotal,
    // Detalhamento
    detalheMaoObra: apuracaoMaoObra.apontamentos,
    detalhePecas: apuracaoPecas.pecas
  };
}

module.exports = {
  calcularCustoMaoDeObraOS,
  calcularCustoPecasOS,
  calcularCustoRealOS,
  calcularMargemOS: calcularCustoRealOS
};
