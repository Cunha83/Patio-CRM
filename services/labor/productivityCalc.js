'use strict';

const { obterAgoraSP } = require('../financialEngine');
const { garantirColecoesLabor } = require('../laborTrackingService');

function arredondar(val, decimais = 2) {
  const n = Number(val) || 0;
  return Number(Math.round(n + 'e' + decimais) + 'e-' + decimais);
}

function obterTempoEstimadoServico(state, serviceItemId, serviceNome) {
  if (!state) return 60;
  const servicos = Array.isArray(state.servicos) ? state.servicos : [];

  let match = null;
  if (serviceItemId) {
    match = servicos.find(s => s.id === serviceItemId);
  }
  if (!match && serviceNome) {
    const nomeNorm = String(serviceNome).toLowerCase();
    match = servicos.find(s => s.nome && s.nome.toLowerCase() === nomeNorm);
  }

  if (match) {
    if (match.tempoEstimadoMinutos != null) return Number(match.tempoEstimadoMinutos);
    if (match.horas != null) return Number(match.horas) * 60;
  }
  return 60;
}

function calcularProdutividadeColaborador({
  tenantId,
  state,
  workerId,
  dataReferencia = null,
  agora = new Date()
}) {
  if (!state) return null;
  garantirColecoesLabor(state);

  const worker = state.workers.find(w => w.id === workerId && w.tenantId === tenantId);
  if (!worker) return null;

  const dataHojeISO = dataReferencia || obterAgoraSP(agora).dataISO;
  const jornada = worker.disponivelHoje === false ? 0 : (Number(worker.jornadaHorasDia) || 8);
  const horasDisponiveis = jornada;

  const entriesDia = state.laborEntries.filter(e => {
    if (e.tenantId !== tenantId || e.workerId !== workerId) return false;
    const dt = String(e.startedAt || '').slice(0, 10);
    return dt === dataHojeISO;
  });

  const agoraMs = agora instanceof Date ? agora.getTime() : new Date(agora).getTime();

  let minutosProdutivos = 0;
  let minutosEspera = 0;
  let minutosRetrabalho = 0;
  let minutosOutros = 0;

  for (const e of entriesDia) {
    let dur = Number(e.durationMinutes) || 0;

    if (e.status === 'ativo' && Array.isArray(e.intervals) && e.intervals.length > 0) {
      const ult = e.intervals[e.intervals.length - 1];
      if (ult && !ult.endedAt && ult.startedAt) {
        const sMs = new Date(ult.startedAt).getTime();
        dur += Math.max(0, (agoraMs - sMs) / (1000 * 60));
      }
    }

    if (e.type === 'produtivo' || e.type === 'diagnostico') {
      minutosProdutivos += dur;
    } else if (e.type === 'espera' || e.motivoPausa === 'espera_peca') {
      minutosEspera += dur;
    } else if (e.type === 'retrabalho') {
      minutosRetrabalho += dur;
    } else {
      minutosOutros += dur;
    }
  }

  const horasProdutivas = arredondar(minutosProdutivos / 60, 2);
  const horasEspera = arredondar(minutosEspera / 60, 2);
  const horasRetrabalho = arredondar(minutosRetrabalho / 60, 2);
  const horasApontadas = arredondar((minutosProdutivos + minutosEspera + minutosRetrabalho + minutosOutros) / 60, 2);

  let utilizacao = null;
  if (horasDisponiveis > 0) {
    utilizacao = arredondar((horasProdutivas / horasDisponiveis) * 100, 1);
  }

  let somaEstimadoMin = 0;
  let somaRealMin = 0;
  let servicosConcluidos = 0;

  for (const e of entriesDia) {
    if (e.status === 'finalizado' && (e.type === 'produtivo' || e.type === 'diagnostico')) {
      servicosConcluidos++;
      const est = obterTempoEstimadoServico(state, e.serviceItemId, e.serviceNome);
      if (est > 0 && e.durationMinutes > 0) {
        somaEstimadoMin += est;
        somaRealMin += e.durationMinutes;
      }
    }
  }

  let eficiencia = null;
  if (somaRealMin > 0 && somaEstimadoMin > 0) {
    eficiencia = arredondar((somaEstimadoMin / somaRealMin) * 100, 1);
  }

  return {
    workerId: worker.id,
    nome: worker.nome,
    funcao: worker.funcao,
    dataReferencia: dataHojeISO,
    horasDisponiveis,
    horasApontadas,
    horasProdutivas,
    horasEspera,
    horasRetrabalho,
    utilizacao,
    eficiencia,
    servicosConcluidos
  };
}

function calcularProdutividadeOficina({
  tenantId,
  state,
  dataReferencia = null,
  agora = new Date()
}) {
  if (!state) return null;
  garantirColecoesLabor(state);

  const workers = state.workers.filter(w => w.tenantId === tenantId && w.ativo !== false);
  const metricsWorkers = workers.map(w =>
    calcularProdutividadeColaborador({ tenantId, state, workerId: w.id, dataReferencia, agora })
  ).filter(Boolean);

  let horasDisponiveisTotal = 0;
  let horasApontadasTotal = 0;
  let horasProdutivasTotal = 0;
  let horasEsperaTotal = 0;
  let horasRetrabalhoTotal = 0;
  let totalServicosConcluidos = 0;

  for (const m of metricsWorkers) {
    horasDisponiveisTotal += m.horasDisponiveis || 0;
    horasApontadasTotal += m.horasApontadas || 0;
    horasProdutivasTotal += m.horasProdutivas || 0;
    horasEsperaTotal += m.horasEspera || 0;
    horasRetrabalhoTotal += m.horasRetrabalho || 0;
    totalServicosConcluidos += m.servicosConcluidos || 0;
  }

  horasDisponiveisTotal = arredondar(horasDisponiveisTotal, 2);
  horasApontadasTotal = arredondar(horasApontadasTotal, 2);
  horasProdutivasTotal = arredondar(horasProdutivasTotal, 2);
  horasEsperaTotal = arredondar(horasEsperaTotal, 2);
  horasRetrabalhoTotal = arredondar(horasRetrabalhoTotal, 2);

  let utilizacaoMedia = null;
  if (horasDisponiveisTotal > 0) {
    utilizacaoMedia = arredondar((horasProdutivasTotal / horasDisponiveisTotal) * 100, 1);
  }

  return {
    dataReferencia: dataReferencia || obterAgoraSP(agora).dataISO,
    totalMecanicos: workers.length,
    horasDisponiveis: horasDisponiveisTotal,
    horasApontadas: horasApontadasTotal,
    horasProdutivas: horasProdutivasTotal,
    horasEspera: horasEsperaTotal,
    horasRetrabalho: horasRetrabalhoTotal,
    utilizacao: utilizacaoMedia,
    servicosConcluidos: totalServicosConcluidos,
    mecanicos: metricsWorkers
  };
}

function calcularCapacidadeDiaria({
  tenantId,
  state,
  dataReferencia = null,
  agora = new Date()
}) {
  if (!state) return null;
  garantirColecoesLabor(state);

  const dataHojeISO = dataReferencia || obterAgoraSP(agora).dataISO;
  const workers = state.workers.filter(w => w.tenantId === tenantId && w.ativo !== false);

  const capacidadeDisponivelHoje = arredondar(
    workers
      .filter(w => w.disponivelHoje !== false)
      .reduce((acc, w) => acc + (Number(w.jornadaHorasDia) || 8), 0),
    1
  );

  const prodOficina = calcularProdutividadeOficina({ tenantId, state, dataReferencia: dataHojeISO, agora });
  const capacidadeUtilizadaHoje = prodOficina.horasProdutivas || 0;
  const capacidadeRestanteHoje = arredondar(Math.max(0, capacidadeDisponivelHoje - capacidadeUtilizadaHoje), 1);
  const taxaOcupacao = capacidadeDisponivelHoje > 0 ? arredondar((capacidadeUtilizadaHoje / capacidadeDisponivelHoje) * 100, 1) : 0;

  return {
    data: dataHojeISO,
    capacidadeDisponivelHoje,
    capacidadeUtilizadaHoje,
    capacidadeRestanteHoje,
    taxaOcupacao
  };
}

function compararEstimadoVsReal({
  tenantId,
  state,
  osId,
  serviceItemId
}) {
  if (!state) return null;
  garantirColecoesLabor(state);

  const entries = state.laborEntries.filter(
    e => e.tenantId === tenantId && e.osId === osId && e.serviceItemId === serviceItemId
  );

  const tempoRealMinutos = arredondar(
    entries.reduce((acc, e) => acc + (Number(e.durationMinutes) || 0), 0),
    1
  );

  const os = state.os.find(o => o.id === osId);
  const itemOS = os?.servicos?.find(s => s.id === serviceItemId);
  const tempoEstimadoMinutos = obterTempoEstimadoServico(state, serviceItemId, itemOS?.nome);

  const desvioMinutos = arredondar(tempoRealMinutos - tempoEstimadoMinutos, 1);
  let percentualDesvio = null;
  if (tempoEstimadoMinutos > 0) {
    percentualDesvio = arredondar(((tempoRealMinutos - tempoEstimadoMinutos) / tempoEstimadoMinutos) * 100, 1);
  }

  return {
    osId,
    serviceItemId,
    serviceNome: itemOS?.nome || entries[0]?.serviceNome || 'Serviço',
    tempoEstimadoMinutos,
    tempoRealMinutos,
    desvioMinutos,
    percentualDesvio
  };
}

module.exports = {
  arredondar,
  obterTempoEstimadoServico,
  calcularProdutividadeColaborador,
  calcularProdutividadeOficina,
  calcularCapacidadeDiaria,
  compararEstimadoVsReal
};

