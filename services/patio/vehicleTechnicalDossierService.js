'use strict';

/**
 * services/patio/vehicleTechnicalDossierService.js
 *
 * Prontuário Técnico 360º do Caminhão por Placa e Eixo:
 * - Rastreabilidade de intervenções por eixo e lado
 * - Avaliação de cobertura de garantia por KM e Dias
 * - Consolidação do histórico completo (OSs, Qualidade, Retrabalhos, Oportunidades e CPK)
 * - Emissão e assinatura digital (SHA-256) de Laudo Técnico de Suspensão Pesada
 *
 * Teto Modular Estrito: <= 350 linhas
 */

const crypto = require('crypto');

function round2(v) {
  return Math.round((Number(v) || 0) * 100) / 100;
}

function normalizarPlaca(placa = '') {
  return String(placa || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

function gerarId(prefix) {
  return `${prefix}_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
}

function garantirColecoes(state) {
  state.axleInterventions = Array.isArray(state.axleInterventions) ? state.axleInterventions : [];
  state.technicalReports = Array.isArray(state.technicalReports) ? state.technicalReports : [];
  state.os = Array.isArray(state.os) ? state.os : [];
  state.qualityInspections = Array.isArray(state.qualityInspections) ? state.qualityInspections : [];
  state.reworkRecords = Array.isArray(state.reworkRecords) ? state.reworkRecords : [];
  state.opportunities = Array.isArray(state.opportunities) ? state.opportunities : [];
}

/**
 * Registra intervenção específica por eixo e lado.
 */
function registrarIntervencaoPorEixoVeiculo(state, payload = {}) {
  garantirColecoes(state);
  const placa = normalizarPlaca(payload.placa);
  if (!placa) {
    throw new Error('Placa é obrigatória para registrar intervenção de eixo.');
  }

  const kmNaAplicacao = Number(payload.kmNaAplicacao) || 0;
  const garantiaKm = Number(payload.garantiaKm) || 20000;
  const garantiaDias = Number(payload.garantiaDias) || 90;
  const kmFimGarantia = kmNaAplicacao + garantiaKm;

  const dataAplicacao = payload.dataAplicacao || new Date().toISOString().split('T')[0];
  const dObj = new Date(dataAplicacao);
  dObj.setDate(dObj.getDate() + garantiaDias);
  const dataFimGarantia = dObj.toISOString().split('T')[0];

  const intervencao = {
    id: gerarId('axle_int'),
    osId: payload.osId || null,
    placa,
    clienteId: payload.clienteId || null,
    eixoPosicao: payload.eixoPosicao || 'eixo_1_direcional',
    lado: payload.lado || 'ambos_central',
    componenteSistema: payload.componenteSistema || 'feixe_de_molas',
    descricaoItem: payload.descricaoItem || 'Intervenção técnica',
    valorAplicado: round2(payload.valorAplicado || 0),
    kmNaAplicacao,
    garantiaDias,
    garantiaKm,
    dataAplicacao,
    kmFimGarantia,
    dataFimGarantia,
    responsavelTecnico: payload.responsavelTecnico || 'Mecânico Especialista',
    observacoes: payload.observacoes || '',
    criadoEm: new Date().toISOString()
  };

  state.axleInterventions.push(intervencao);
  return { ok: true, intervencao };
}

/**
 * Avalia cobertura de garantia para uma peça/serviço por KM e Dias.
 */
function avaliarCoberturaGarantiaPecaOuServico(state, {
  placa = '',
  eixoPosicao = null,
  lado = null,
  componenteSistema = null,
  kmAtual = 0,
  dataReferencia = null
} = {}) {
  garantirColecoes(state);
  const placaNorm = normalizarPlaca(placa);
  const refDate = dataReferencia ? new Date(dataReferencia) : new Date();
  const kmNum = Number(kmAtual) || 0;

  const candidatas = state.axleInterventions.filter(item => {
    if (normalizarPlaca(item.placa) !== placaNorm) return false;
    if (eixoPosicao && item.eixoPosicao !== eixoPosicao) return false;
    if (lado && item.lado !== 'ambos_central' && item.lado !== lado) return false;
    if (componenteSistema && item.componenteSistema !== componenteSistema) return false;
    return true;
  });

  const avaliadas = candidatas.map(item => {
    const itemDate = new Date(item.dataAplicacao);
    const diasDecorridos = Math.floor((refDate - itemDate) / (1000 * 60 * 60 * 24));
    const kmRodados = Math.max(0, kmNum - item.kmNaAplicacao);

    const expirouPorKm = item.garantiaKm > 0 && kmNum > item.kmFimGarantia;
    const expirouPorTempo = item.garantiaDias > 0 && diasDecorridos > item.garantiaDias;

    let statusGarantia = 'cobertura_ativa';
    if (expirouPorKm && expirouPorTempo) {
      statusGarantia = diasDecorridos > item.garantiaDias * 1.2 ? 'expirada_por_tempo' : 'expirada_por_km';
    } else if (expirouPorKm) {
      statusGarantia = 'expirada_por_km';
    } else if (expirouPorTempo) {
      statusGarantia = 'expirada_por_tempo';
    }

    return {
      ...item,
      diasDecorridos,
      kmRodados,
      statusGarantia,
      coberturaAtiva: statusGarantia === 'cobertura_ativa'
    };
  });

  const coberturaAtiva = avaliadas.some(a => a.statusGarantia === 'cobertura_ativa');

  return {
    ok: true,
    placa: placaNorm,
    coberturaAtiva,
    intervencoes: avaliadas
  };
}

/**
 * Consolida o Prontuário Técnico 360º de uma placa com histórico, KPIs e CPK.
 */
function consolidarProntuarioTecnicoPlaca(state, placaInput = '', {
  kmAtualConsulta = null,
  dataReferencia = null
} = {}) {
  garantirColecoes(state);
  const placa = normalizarPlaca(placaInput);

  const historicoOS = state.os.filter(o => normalizarPlaca(o.placa) === placa);
  const avaliacaoGarantia = avaliarCoberturaGarantiaPecaOuServico(state, {
    placa,
    kmAtual: kmAtualConsulta,
    dataReferencia
  });
  const intervencoesEixo = avaliacaoGarantia.intervencoes;

  const inspecoesQualidade = state.qualityInspections.filter(i => normalizarPlaca(i.placa) === placa);
  const ocorrenciasRetrabalho = state.reworkRecords.filter(r => normalizarPlaca(r.placa) === placa);
  const oportunidadesPendentes = state.opportunities.filter(op => normalizarPlaca(op.placa) === placa);
  const laudosTecnicos = state.technicalReports.filter(l => normalizarPlaca(l.placa) === placa);

  const totalOS = historicoOS.length;
  const totalInvestidoHistorico = round2(historicoOS.reduce((acc, o) => acc + (Number(o.total) || 0), 0));

  // Coleta KMs registrados para cálculo de monitoramento
  const kms = [];
  historicoOS.forEach(o => {
    if (Number(o.odometro) > 0) kms.push(Number(o.odometro));
  });
  intervencoesEixo.forEach(i => {
    if (Number(i.kmNaAplicacao) > 0) kms.push(Number(i.kmNaAplicacao));
  });
  if (Number(kmAtualConsulta) > 0) {
    kms.push(Number(kmAtualConsulta));
  }

  const kmMinimoRegistrado = kms.length > 0 ? Math.min(...kms) : 0;
  const kmMaximoRegistrado = kms.length > 0 ? Math.max(...kms) : 0;
  const kmTotalMonitorado = Math.max(0, kmMaximoRegistrado - kmMinimoRegistrado);
  const custoPorKmRodado = kmTotalMonitorado > 0 ? round2(totalInvestidoHistorico / kmTotalMonitorado) : 0;

  const totalGarantiasAtivasCount = intervencoesEixo.filter(i => i.statusGarantia === 'cobertura_ativa').length;

  return {
    ok: true,
    placa,
    indicadoresProntuario: {
      totalOS,
      totalInvestidoHistorico,
      kmTotalMonitorado,
      custoPorKmRodado,
      totalGarantiasAtivasCount,
      kmMinimoRegistrado,
      kmMaximoRegistrado
    },
    historicoOS,
    intervencoesEixo,
    inspecoesQualidade,
    ocorrenciasRetrabalho,
    oportunidadesPendentes,
    laudosTecnicos
  };
}

/**
 * Emite Laudo Técnico de Suspensão Pesada com hash criptográfico SHA-256.
 */
function emitirLaudoTecnicoSuspensaoPesada(state, payload = {}) {
  garantirColecoes(state);
  const placa = normalizarPlaca(payload.placa);
  if (!placa) {
    throw new Error('Placa é obrigatória para emissão de laudo técnico.');
  }

  const laudoId = gerarId('laudo');
  const timestamp = payload.timestamp || new Date().toISOString();

  const dadosHash = {
    id: laudoId,
    placa,
    osId: payload.osId || null,
    clienteId: payload.clienteId || null,
    kmInspecao: Number(payload.kmInspecao) || 0,
    responsavelTecnico: payload.responsavelTecnico || 'Engenheiro / Responsável Técnico',
    registroConselho: payload.registroConselho || '',
    avaliacaoSistemas: payload.avaliacaoSistemas || {},
    parecerFinal: payload.parecerFinal || 'apto_operacao_rodoviaria',
    recomendacoesTecnicas: payload.recomendacoesTecnicas || '',
    timestamp
  };

  const hashAutenticidadeLaudo = crypto
    .createHash('sha256')
    .update(JSON.stringify(dadosHash))
    .digest('hex');

  const laudo = {
    ...dadosHash,
    hashAutenticidadeLaudo
  };

  state.technicalReports.push(laudo);
  return { ok: true, laudo };
}

module.exports = {
  registrarIntervencaoPorEixoVeiculo,
  avaliarCoberturaGarantiaPecaOuServico,
  consolidarProntuarioTecnicoPlaca,
  emitirLaudoTecnicoSuspensaoPesada,
  normalizarPlaca
};
