'use strict';

const { gerarResumoOperacional } = require('./summaryMetrics');

/**
 * Formata o resumo executivo para síntese de voz e resposta conversacional
 */
function formatarResumoConversacional(resumo) {
  if (!resumo) return 'Não foi possível obter o resumo operacional no momento.';

  const partes = [];
  partes.push(`O pátio está com ${resumo.veiculosPatio} veículo(s) no total.`);
  partes.push(`Temos ${resumo.estagios.executando} em execução, ${resumo.estagios.peca} aguardando peças e ${resumo.estagios.fila} na fila.`);

  if (resumo.entregas.atrasadas > 0) {
    partes.push(`Atenção: há ${resumo.entregas.atrasadas} entrega(s) com horário atrasado.`);
  } else if (resumo.entregas.emRisco > 0) {
    partes.push(`Temos ${resumo.entregas.emRisco} entrega(s) em risco para hoje.`);
  }

  if (resumo.alertas.critico > 0 || resumo.alertas.alto > 0) {
    partes.push(`Existem ${resumo.alertas.critico + resumo.alertas.alto} alerta(s) de alta prioridade que precisam de atenção.`);
  }

  return partes.join(' ');
}

/**
 * Formata a resposta para a pergunta "qual é o maior gargalo hoje?"
 */
function formatarMaiorGargalo(resumo) {
  if (!resumo || !resumo.maiorGargalo || resumo.maiorGargalo.tipo === 'nenhum') {
    return 'Não temos gargalos críticos identificados hoje. A operação está fluindo dentro do previsto.';
  }
  return `O maior gargalo hoje está em: ${resumo.maiorGargalo.descricao}`;
}

/**
 * Formata as entregas em risco para voz / WhatsApp
 */
function formatarEntregasEmRisco(resumo, eventos = []) {
  if (!resumo) return 'Sem dados de entregas.';
  const eventosEntrega = (eventos || []).filter(e =>
    (e.tipo === 'entrega_atrasada' || e.tipo === 'entrega_proxima') &&
    (e.status === 'aberto' || e.status === 'reconhecido')
  );

  if (eventosEntrega.length === 0 && resumo.entregas.emRisco === 0) {
    return 'Não há nenhuma entrega em risco ou atrasada para hoje. Todas estão no prazo.';
  }

  const listaDesc = eventosEntrega.map(e => e.titulo || e.descricao).join('; ');
  return `Temos ${eventosEntrega.length || resumo.entregas.emRisco} entrega(s) em situação de alerta: ${listaDesc}`;
}

/**
 * Formata lista de alertas que precisam de atenção imediata
 */
function formatarAlertasAtencao(eventos = []) {
  const criticosEAltos = (eventos || []).filter(e =>
    (e.severidade === 'critico' || e.severidade === 'alto' || e.prioridade === 'P1' || e.prioridade === 'P2') &&
    (e.status === 'aberto' || e.status === 'reconhecido')
  );

  if (criticosEAltos.length === 0) {
    return 'Nenhum alerta crítico ou de alta prioridade pendente no momento.';
  }

  const linhas = criticosEAltos.slice(0, 3).map(e => `[${e.prioridade}] ${e.titulo}`);
  return `Atenção prioritária necessária:\n` + linhas.join('\n');
}

/**
 * Registra snapshot periódico para histórico temporal operacional
 */
function registrarSnapshotOperacional({
  tenantId,
  state,
  agoraIso = null,
  agoraDate = null
}) {
  if (!state) return null;
  state.operationalSnapshots = Array.isArray(state.operationalSnapshots) ? state.operationalSnapshots : [];

  const resumo = gerarResumoOperacional({
    tenantId,
    state,
    agoraIso,
    agoraDate
  });

  const timestamp = agoraIso || (agoraDate instanceof Date ? agoraDate.toISOString() : new Date().toISOString());

  const snapshot = {
    id: `snp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    tenantId,
    timestamp,
    veiculosPatio: resumo.veiculosPatio,
    boxes: resumo.boxes,
    estagios: resumo.estagios,
    entregas: resumo.entregas,
    alertas: resumo.alertas,
    maiorGargalo: resumo.maiorGargalo?.tipo || 'nenhum',
    metricas: resumo.metricas
  };

  state.operationalSnapshots.unshift(snapshot);

  if (state.operationalSnapshots.length > 1000) {
    state.operationalSnapshots = state.operationalSnapshots.slice(0, 1000);
  }

  return snapshot;
}

/**
 * Consulta snapshots históricos por período (24h, 7d, 30d)
 */
function obterHistoricoSnapshots({
  tenantId,
  state,
  periodo = '24h',
  agora = new Date()
}) {
  if (!state || !Array.isArray(state.operationalSnapshots)) return [];

  const msPorPeriodo = {
    '24h': 24 * 3600 * 1000,
    '7d': 7 * 24 * 3600 * 1000,
    '30d': 30 * 24 * 3600 * 1000
  };

  const limiteMs = msPorPeriodo[periodo] || msPorPeriodo['24h'];
  const agoraMs = agora instanceof Date ? agora.getTime() : new Date(agora).getTime();

  return state.operationalSnapshots
    .filter(s => s.tenantId === tenantId && (agoraMs - new Date(s.timestamp).getTime()) <= limiteMs)
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
}

module.exports = {
  formatarResumoConversacional,
  formatarMaiorGargalo,
  formatarEntregasEmRisco,
  formatarAlertasAtencao,
  registrarSnapshotOperacional,
  obterHistoricoSnapshots
};
