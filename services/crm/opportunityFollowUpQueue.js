'use strict';

/**
 * Pátio CRM — Fila Ativa de Follow-up de Demanda Reprimida e Histórico
 * Arquitetura Modular (< 200 linhas).
 */

const crypto = require('crypto');

function gerarId(prefix) {
  return prefix + '_' + Date.now() + '_' + crypto.randomBytes(3).toString('hex');
}

function garantirColecoes(state) {
  state.opportunities = Array.isArray(state.opportunities) ? state.opportunities : [];
  state.auditoria = Array.isArray(state.auditoria) ? state.auditoria : [];
}

function calcularStatusFollowUp(dataFollowUp, hoje) {
  if (!dataFollowUp) return 'futura';
  const dataNorm = String(dataFollowUp).slice(0, 10);
  if (dataNorm < hoje) return 'vencida';
  if (dataNorm === hoje) return 'hoje';
  return 'futura';
}

const PESO_STATUS = { vencida: 3, hoje: 2, futura: 1 };
const PESO_CRIT = { alta: 3, media: 2, baixa: 1 };

function listarFilaFollowUpDemandaReprimida({
  tenantId,
  state,
  filtros = {},
  dataReferencia = null
}) {
  if (!state) return { ok: false, error: 'Estado não informado.' };
  garantirColecoes(state);

  const hoje = (dataReferencia || new Date().toISOString()).slice(0, 10);

  const oportunidades = state.opportunities.filter(op => {
    if (tenantId && op.tenantId && op.tenantId !== tenantId) return false;
    if (op.tipo !== 'demanda_reprimida_orcamento') return false;

    if (!filtros.incluirConvertidas && op.status === 'convertida') return false;
    if (!filtros.incluirArquivadas && op.status === 'arquivada') return false;
    if (filtros.status && op.status !== filtros.status) return false;

    if (filtros.clienteId && op.clienteId !== filtros.clienteId) return false;
    if (filtros.placa && op.placa !== filtros.placa) return false;
    if (filtros.criticidade && op.criticidadeMaxima !== filtros.criticidade) return false;
    if (filtros.centroCustoId && op.centroCustoId !== filtros.centroCustoId) return false;

    return true;
  });

  let vencidas = 0;
  let hojeQtd = 0;
  let futuras = 0;

  const fila = oportunidades.map(op => {
    const statusFollowUp = calcularStatusFollowUp(op.dataFollowUp, hoje);
    if (statusFollowUp === 'vencida') vencidas++;
    else if (statusFollowUp === 'hoje') hojeQtd++;
    else futuras++;

    return {
      ...op,
      statusFollowUp
    };
  });

  let filaFiltrada = fila;
  if (filtros.statusFollowUp) {
    filaFiltrada = fila.filter(it => it.statusFollowUp === filtros.statusFollowUp);
  }

  filaFiltrada.sort((a, b) => {
    const pStatA = PESO_STATUS[a.statusFollowUp] || 0;
    const pStatB = PESO_STATUS[b.statusFollowUp] || 0;
    if (pStatB !== pStatA) return pStatB - pStatA;

    const pCritA = PESO_CRIT[a.criticidadeMaxima] || 0;
    const pCritB = PESO_CRIT[b.criticidadeMaxima] || 0;
    if (pCritB !== pCritA) return pCritB - pCritA;

    return (b.valorTotalEstimado || 0) - (a.valorTotalEstimado || 0);
  });

  return {
    ok: true,
    total: filaFiltrada.length,
    resumo: {
      total: fila.length,
      vencidas,
      hoje: hojeQtd,
      futuras
    },
    fila: filaFiltrada
  };
}

function registrarFollowUpOportunidade({
  tenantId,
  state,
  oportunidadeId,
  responsavel = 'Consultor Comercial',
  canal = 'whatsapp',
  resultado = 'contatado',
  observacao = '',
  novaDataFollowUp = null,
  actorId = 'sistema'
}) {
  if (!tenantId || !state || !oportunidadeId) {
    throw new Error('tenantId, state e oportunidadeId são obrigatórios.');
  }
  garantirColecoes(state);

  const opp = state.opportunities.find(o => o.id === oportunidadeId && (!o.tenantId || o.tenantId === tenantId));
  if (!opp) {
    throw new Error(`Oportunidade "${oportunidadeId}" não encontrada.`);
  }

  opp.historicoFollowUp = Array.isArray(opp.historicoFollowUp) ? opp.historicoFollowUp : [];

  const registro = {
    id: gerarId('fol'),
    dataRegistro: new Date().toISOString(),
    responsavel: String(responsavel).trim(),
    canal: String(canal).trim(),
    resultado: String(resultado).trim(),
    observacao: String(observacao).trim(),
    novaDataFollowUp: novaDataFollowUp ? String(novaDataFollowUp).slice(0, 10) : null,
    actorId
  };

  opp.historicoFollowUp.push(registro);
  opp.ultimoContatoEm = registro.dataRegistro;

  if (novaDataFollowUp) {
    opp.dataFollowUp = String(novaDataFollowUp).slice(0, 10);
  }

  if (resultado === 'perdida') {
    opp.status = 'arquivada';
    opp.motivoPerda = observacao || 'Marcada como perdida no follow-up';
  } else if (opp.status === 'aberta') {
    opp.status = 'em_negociacao';
  }

  opp.atualizadoEm = new Date().toISOString();

  state.auditoria.push({
    id: gerarId('aud'),
    tenantId,
    timestamp: new Date().toISOString(),
    actorId,
    acao: 'follow_up_oportunidade',
    detalhes: {
      oportunidadeId: opp.id,
      resultado,
      canal,
      novaDataFollowUp: opp.dataFollowUp
    }
  });

  return {
    ok: true,
    oportunidade: opp,
    registro
  };
}

module.exports = {
  calcularStatusFollowUp,
  listarFilaFollowUpDemandaReprimida,
  registrarFollowUpOportunidade
};

