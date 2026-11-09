'use strict';

const { obterSaldosDetalhados } = require('./inventoryReservationService');

function garantirColecoesAbc(state) {
  state.pecas = Array.isArray(state.pecas) ? state.pecas : [];
  state.os = Array.isArray(state.os) ? state.os : [];
  state.inventoryMovements = Array.isArray(state.inventoryMovements) ? state.inventoryMovements : [];
}

/**
 * Motor de Curva ABC Dinâmica, Estoque de Segurança e Ponto de Pedido (Linha Pesada).
 */
function calcularCurvaABC({ tenantId, state, diasHistorico = 90 }) {
  if (!tenantId || !state) {
    throw new Error('tenantId e state são obrigatórios para calcular Curva ABC.');
  }

  garantirColecoesAbc(state);

  const dias = Math.max(1, Number(diasHistorico) || 90);
  const dataCorte = new Date(Date.now() - dias * 86400000).toISOString().slice(0, 10);

  const pecasTenant = state.pecas.filter(p => !p.tenantId || p.tenantId === tenantId);
  const consumoPorPeca = new Map();

  // Inicializa mapa de consumo
  for (const peca of pecasTenant) {
    consumoPorPeca.set(peca.id, {
      partId: peca.id,
      peca,
      totalConsumoQtd: 0,
      valorConsumoTotal: 0
    });
  }

  // Apura consumo a partir das Ordens de Serviço
  const osTenant = state.os.filter(o => !o.tenantId || o.tenantId === tenantId);
  for (const os of osTenant) {
    const dataOS = (os.finalizadoEm || os.concluidoEm || os.dataSaida || os.data || os.criadoEm || '').slice(0, 10);
    if (dataOS && dataOS < dataCorte) {
      continue; // Fora da janela de competência analisada
    }

    if (Array.isArray(os.pecas)) {
      for (const item of os.pecas) {
        const partId = item.partId || item.pecaId || item.id;
        const entry = consumoPorPeca.get(partId);
        if (entry) {
          const qtd = Number(item.qtd || item.quantity || 0);
          const vlrUnit = Number(item.valor || item.custo || entry.peca.custo || entry.peca.preco || 0);
          if (qtd > 0) {
            entry.totalConsumoQtd += qtd;
            entry.valorConsumoTotal += qtd * vlrUnit;
          }
        }
      }
    }
  }

  // Apura também movimentações avulsas de saída do estoque caso não contabilizadas na OS
  for (const mov of state.inventoryMovements) {
    if (mov.tenantId === tenantId && mov.type === 'saida_os' && !mov.osId) {
      const dataMov = (mov.timestamp || '').slice(0, 10);
      if (dataMov && dataMov < dataCorte) continue;

      const entry = consumoPorPeca.get(mov.partId);
      if (entry) {
        const qtd = Number(mov.quantity || 0);
        const vlrUnit = Number(mov.unitCost || entry.peca.custo || entry.peca.preco || 0);
        entry.totalConsumoQtd += qtd;
        entry.valorConsumoTotal += qtd * vlrUnit;
      }
    }
  }

  const itensOrdenados = Array.from(consumoPorPeca.values()).sort(
    (a, b) => b.valorConsumoTotal - a.valorConsumoTotal
  );

  const valorTotalConsumo = itensOrdenados.reduce((acc, it) => acc + it.valorConsumoTotal, 0);

  let acumulado = 0;
  let qtdA = 0;
  let qtdB = 0;
  let qtdC = 0;

  const resultadoItens = itensOrdenados.map((item, idx) => {
    const pctValor = valorTotalConsumo > 0 ? (item.valorConsumoTotal / valorTotalConsumo) * 100 : 0;
    acumulado += pctValor;

    let classe = 'C';
    if (item.valorConsumoTotal > 0) {
      if (idx === 0 || acumulado - pctValor < 80) {
        classe = 'A';
        qtdA++;
      } else if (acumulado - pctValor < 95) {
        classe = 'B';
        qtdB++;
      } else {
        classe = 'C';
        qtdC++;
      }
    } else {
      classe = 'C';
      qtdC++;
    }

    // Cálculos de Gestão de Estoque
    const cmd = item.totalConsumoQtd / dias; // Consumo Médio Diário
    const leadTimeDias = Number(item.peca.leadTimeDias) || 7;

    // Fator de segurança proporcional à criticidade da classe
    const fatorSeguranca = classe === 'A' ? 1.0 : (classe === 'B' ? 0.5 : 0.2);
    const estoqueSeguranca = Math.ceil(cmd * leadTimeDias * fatorSeguranca);
    const pontoDePedido = Math.ceil((cmd * leadTimeDias) + estoqueSeguranca);

    const saldos = obterSaldosDetalhados({
      tenantId,
      state,
      partId: item.partId
    });

    const necessitaReposicao = saldos.saldoDisponivel <= pontoDePedido;
    const sugestaoCompraQtd = necessitaReposicao
      ? Math.max(1, Math.ceil(pontoDePedido * 1.5 - saldos.saldoDisponivel))
      : 0;

    return {
      partId: item.partId,
      descricao: item.peca.descricao || item.peca.nome || 'Peça',
      classeABC: classe,
      totalConsumoQtd: item.totalConsumoQtd,
      valorConsumoTotal: Math.round(item.valorConsumoTotal * 100) / 100,
      percentualValor: Math.round(pctValor * 100) / 100,
      percentualAcumulado: Math.round(Math.min(100, acumulado) * 100) / 100,
      saldoFisico: saldos.saldoFisico,
      saldoReservado: saldos.saldoReservado,
      saldoDisponivel: saldos.saldoDisponivel,
      cmd: Math.round(cmd * 100) / 100,
      leadTimeDias,
      estoqueSeguranca,
      pontoDePedido,
      necessitaReposicao,
      sugestaoCompraQtd
    };
  });

  const sugestoesReposicaoCritica = resultadoItens.filter(
    i => i.necessitaReposicao && (i.classeABC === 'A' || i.classeABC === 'B')
  );

  return {
    periodoDias: dias,
    totais: {
      totalItens: resultadoItens.length,
      valorTotalConsumo: Math.round(valorTotalConsumo * 100) / 100,
      qtdClasseA: qtdA,
      qtdClasseB: qtdB,
      qtdClasseC: qtdC
    },
    itens: resultadoItens,
    sugestoesReposicaoCritica
  };
}

function obterSugestoesReposicao({ tenantId, state, diasHistorico = 90 }) {
  const analise = calcularCurvaABC({ tenantId, state, diasHistorico });
  return analise.sugestoesReposicaoCritica;
}

module.exports = {
  calcularCurvaABC,
  obterSugestoesReposicao
};

