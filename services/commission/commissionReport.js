'use strict';

/**
 * Pátio CRM — Relatório e Fechamento de Comissões por Período
 * Submódulo (< 250 linhas).
 */

const { arredondar, calcularComissaoOS } = require('./commissionCalc');

function normalizarData(dt) {
  if (!dt) return null;
  if (dt instanceof Date) return dt.toISOString().slice(0, 10);
  const s = String(dt).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return s.slice(0, 10);
}

/**
 * Gera o relatório consolidado de comissões por período (quinzenal, mensal ou customizado)
 */
function gerarFechamentoComissoes({
  state,
  tenantId,
  dataInicio = null,
  dataFim = null,
  workerId = null
}) {
  if (!state) return null;

  const workers = (state.workers || []).filter(w => !tenantId || w.tenantId === tenantId);
  const ordens = (state.os || []).filter(o => {
    if (tenantId && o.tenantId && o.tenantId !== tenantId) return false;
    if (o.st !== 'finalizada') return false;

    const dataOS = normalizarData(o.fechamento || o.concluidaEm || o.abertura);
    if (!dataOS) return false;

    if (dataInicio && dataOS < normalizarData(dataInicio)) return false;
    if (dataFim && dataOS > normalizarData(dataFim)) return false;

    return true;
  });

  // Mapeia colaboradores
  const mapaColaboradores = new Map();

  workers.forEach(w => {
    if (workerId && w.id !== workerId) return;
    mapaColaboradores.set(w.id, {
      workerId: w.id,
      nome: w.nome,
      funcao: w.funcao || 'Mecânico',
      percentualPadrao: w.comissaoPercentual != null ? Number(w.comissaoPercentual) : null,
      totalServicos: 0,
      totalMaoDeObra: 0,
      totalComissao: 0,
      detalhesOS: []
    });
  });

  let totalGeralMaoDeObra = 0;
  let totalGeralComissoes = 0;
  let totalGeralServicos = 0;

  for (const os of ordens) {
    const calcOS = calcularComissaoOS({ os, state, tenantId });
    if (!calcOS || !Array.isArray(calcOS.itens)) continue;

    for (const item of calcOS.itens) {
      if (!item.workerId) continue;
      if (workerId && item.workerId !== workerId) continue;

      let registro = mapaColaboradores.get(item.workerId);
      if (!registro) {
        const wInfo = workers.find(w => w.id === item.workerId);
        registro = {
          workerId: item.workerId,
          nome: wInfo?.nome || item.workerNome || 'Colaborador',
          funcao: wInfo?.funcao || 'Mecânico',
          percentualPadrao: wInfo?.comissaoPercentual != null ? Number(wInfo.comissaoPercentual) : null,
          totalServicos: 0,
          totalMaoDeObra: 0,
          totalComissao: 0,
          detalhesOS: []
        };
        mapaColaboradores.set(item.workerId, registro);
      }

      registro.totalServicos += 1;
      registro.totalMaoDeObra = arredondar(registro.totalMaoDeObra + item.valorMaoDeObra);
      registro.totalComissao = arredondar(registro.totalComissao + item.valorComissao);

      registro.detalhesOS.push({
        osId: calcOS.osId,
        osNum: calcOS.osNum,
        data: calcOS.dataFechamento,
        placa: calcOS.placa,
        serviceNome: item.serviceNome,
        valorMaoDeObra: item.valorMaoDeObra,
        percentualAplicado: item.percentualAplicado,
        valorComissao: item.valorComissao,
        bloqueada: item.bloqueada,
        motivoBloqueio: item.motivoBloqueio
      });

      totalGeralMaoDeObra = arredondar(totalGeralMaoDeObra + item.valorMaoDeObra);
      totalGeralComissoes = arredondar(totalGeralComissoes + item.valorComissao);
      totalGeralServicos += 1;
    }
  }

  const listaColaboradores = Array.from(mapaColaboradores.values())
    .sort((a, b) => b.totalComissao - a.totalComissao);

  return {
    periodo: {
      inicio: normalizarData(dataInicio),
      fim: normalizarData(dataFim)
    },
    resumoGeral: {
      totalMaoDeObra: totalGeralMaoDeObra,
      totalComissoes: totalGeralComissoes,
      totalServicos: totalGeralServicos,
      totalColaboradores: listaColaboradores.length
    },
    colaboradores: listaColaboradores
  };
}

/**
 * Consulta o extrato analítico de comissões para um único colaborador
 */
function obterResumoComissoesColaborador({
  state,
  tenantId,
  workerId,
  dataInicio = null,
  dataFim = null
}) {
  if (!state || !workerId) return null;

  const fechamento = gerarFechamentoComissoes({
    state,
    tenantId,
    dataInicio,
    dataFim,
    workerId
  });

  const worker = (state.workers || []).find(w => w.id === workerId);
  const dados = fechamento?.colaboradores?.find(c => c.workerId === workerId) || {
    workerId,
    nome: worker?.nome || 'Colaborador',
    funcao: worker?.funcao || 'Mecânico',
    percentualPadrao: worker?.comissaoPercentual || null,
    totalServicos: 0,
    totalMaoDeObra: 0,
    totalComissao: 0,
    detalhesOS: []
  };

  return {
    worker: {
      id: workerId,
      nome: worker?.nome || dados.nome,
      funcao: worker?.funcao || dados.funcao,
      custoHora: worker?.custoHora || 0,
      comissaoPercentual: worker?.comissaoPercentual != null ? Number(worker.comissaoPercentual) : null
    },
    periodo: fechamento.periodo,
    totalServicos: dados.totalServicos,
    totalMaoDeObra: dados.totalMaoDeObra,
    totalComissao: dados.totalComissao,
    detalhesOS: dados.detalhesOS
  };
}

module.exports = {
  normalizarData,
  gerarFechamentoComissoes,
  obterResumoComissoesColaborador
};

