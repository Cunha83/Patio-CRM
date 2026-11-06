'use strict';

/**
 * Pátio CRM — Serviço de Produtividade, Capacidade e Eficiência Operacional
 * Fachada Modular (< 120 linhas).
 *
 * Submódulo:
 * - services/labor/productivityCalc.js: Cálculos de produtividade, capacidade e desvios
 */

const { garantirColecoesLabor } = require('./laborTrackingService');
const {
  arredondar,
  obterTempoEstimadoServico,
  calcularProdutividadeColaborador,
  calcularProdutividadeOficina,
  calcularCapacidadeDiaria,
  compararEstimadoVsReal
} = require('./labor/productivityCalc');

function parseDataIso(dataStr) {
  if (!dataStr) return null;
  const d = new Date(dataStr);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Retorna a visão instantânea da equipe: quem está em serviço, em espera e quem está livre.
 */
function obterEquipeAgora({ tenantId, state, agora = new Date() }) {
  if (!state) return null;
  garantirColecoesLabor(state);

  const agoraMs = agora instanceof Date ? agora.getTime() : new Date(agora).getTime();
  const workers = state.workers.filter(w => w.tenantId === tenantId && w.ativo !== false);
  const activeEntries = state.laborEntries.filter(e => e.tenantId === tenantId && (e.status === 'ativo' || e.status === 'pausado'));

  const emServico = [];
  const emEspera = [];
  const livres = [];

  for (const w of workers) {
    const entry = activeEntries.find(e => e.workerId === w.id);

    if (!entry) {
      livres.push({
        workerId: w.id,
        nome: w.nome,
        funcao: w.funcao,
        status: 'livre',
        disponivelHoje: w.disponivelHoje !== false
      });
      continue;
    }

    let minutosDecorrido = entry.durationMinutes || 0;
    if (entry.status === 'ativo' && Array.isArray(entry.intervals) && entry.intervals.length > 0) {
      const ultimo = entry.intervals[entry.intervals.length - 1];
      if (ultimo && !ultimo.endedAt && ultimo.startedAt) {
        const sMs = new Date(ultimo.startedAt).getTime();
        const diffMin = Math.max(0, (agoraMs - sMs) / (1000 * 60));
        minutosDecorrido += diffMin;
      }
    }
    minutosDecorrido = arredondar(minutosDecorrido, 1);

    const infoItem = {
      workerId: w.id,
      nome: w.nome,
      funcao: w.funcao,
      entryId: entry.id,
      osId: entry.osId,
      osNum: entry.osNum,
      serviceNome: entry.serviceNome,
      boxId: entry.boxId,
      type: entry.type,
      tempoDecorridoMinutos: minutosDecorrido,
      tempoDecorridoFormatado: formatarMinutos(minutosDecorrido)
    };

    if (entry.status === 'pausado' || entry.type === 'espera') {
      infoItem.status = 'em_espera';
      infoItem.motivoPausa = entry.motivoPausa || 'Aguardando';
      emEspera.push(infoItem);
    } else {
      infoItem.status = 'em_servico';
      infoItem.push ? emServico.push(infoItem) : emServico.push(infoItem);
    }
  }

  return {
    totalMecanicosAtivos: workers.length,
    totalEmServico: emServico.length,
    totalEmEspera: emEspera.length,
    totalLivres: livres.length,
    emServico,
    emEspera,
    livres
  };
}

function formatarMinutos(minutos) {
  if (minutos == null || isNaN(minutos)) return '--';
  const m = Math.round(minutos);
  if (m < 60) return `${m}min`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem > 0 ? `${h}h${rem}min` : `${h}h`;
}

module.exports = {
  obterEquipeAgora,
  calcularProdutividadeColaborador,
  calcularProdutividadeOficina,
  calcularCapacidadeDiaria,
  compararEstimadoVsReal,
  obterTempoEstimadoServico,
  formatarMinutos
};
