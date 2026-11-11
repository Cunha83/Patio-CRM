'use strict';

/**
 * services/patio/smartGatehouseCheckinService.js
 * 
 * Motor de Portaria Inteligente, Triagem 360º na Chegada & Fast Check-in:
 * - Cruzamento de hodômetro, garantias por eixo, preventivas e demanda reprimida
 * - Validação de política e trava de crédito vinculada ao Cliente (clienteId)
 * - Alocação automática de Box Pesado livre e controle de saída segura
 * Arquitetura: <= 350 linhas
 */

const crypto = require('crypto');
const fleetPredictiveMaintenanceService = require('../crm/fleetPredictiveMaintenanceService');
const fleetDelinquencyGuardService = require('../billing/fleetDelinquencyGuardService');
const vehicleTechnicalDossierService = require('./vehicleTechnicalDossierService');
const qualityWarrantyReworkService = require('./qualityWarrantyReworkService');
const patioBoxManagementService = require('./patioBoxManagementService');

function criarErro(code, message, status = 400) {
  const err = new Error(message);
  err.code = code;
  err.status = status;
  return err;
}

function gerarId(prefix) {
  return `${prefix}_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
}

function round2(v) {
  return Math.round((Number(v) || 0) * 100) / 100;
}

function normalizarPlaca(placa = '') {
  return String(placa || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase().trim();
}

function toDateYmd(val) {
  if (!val) return '';
  return (val instanceof Date ? val.toISOString() : String(val)).slice(0, 10);
}

function garantirColecoes(state) {
  if (!state) throw criarErro('STATE_REQUIRED', 'Estado da aplicação é obrigatório.');
  ['gatehouseLogs', 'creditOverrideLogs', 'patioBoxes', 'boxAllocations', 'os',
   'preventivePlans', 'predictiveAlerts', 'axleInterventions', 'opportunities',
   'contas', 'borderos', 'creditPolicies', 'fleetTelemetry'].forEach(c => {
    if (!Array.isArray(state[c]) && typeof state[c] !== 'object') state[c] = [];
  });
  if (!Array.isArray(state.gatehouseLogs)) state.gatehouseLogs = [];
  if (!Array.isArray(state.creditOverrideLogs)) state.creditOverrideLogs = [];
  if (!Array.isArray(state.os)) state.os = [];
}

function identificarClientePorPlaca(state, placaNorm) {
  const pln = (state.preventivePlans || []).find(p => normalizarPlaca(p.placa) === placaNorm && p.clienteId);
  if (pln) return { clienteId: pln.clienteId, clienteNome: pln.clienteNome };

  const osList = (state.os || []).filter(o => normalizarPlaca(o.placa || o.veiculoPlaca) === placaNorm && o.clienteId);
  if (osList.length > 0) {
    const maisRecente = osList.sort((a, b) => new Date(b.data || b.dataAbertura || 0) - new Date(a.data || a.dataAbertura || 0))[0];
    return { clienteId: maisRecente.clienteId, clienteNome: maisRecente.clienteNome };
  }

  const opp = (state.opportunities || []).find(o => normalizarPlaca(o.placa) === placaNorm && o.clienteId);
  if (opp) return { clienteId: opp.clienteId, clienteNome: opp.clienteNome };

  const ax = (state.axleInterventions || []).find(a => normalizarPlaca(a.placa) === placaNorm && a.clienteId);
  if (ax) return { clienteId: ax.clienteId, clienteNome: null };

  return { clienteId: null, clienteNome: null };
}

function avaliarSituacaoCreditoCliente(state, clienteId, dataReferencia) {
  if (!clienteId) {
    return { clienteId: null, statusCredito: 'regular', limiteCreditoGlobal: 0, exposicaoTotalCredito: 0, totalVencidoCliente: 0, bloqueadoPorInadimplencia: false };
  }

  const risco = fleetDelinquencyGuardService.avaliarRiscoInadimplenciaFrotista(state, clienteId, { dataReferencia });
  const refYmd = toDateYmd(dataReferencia || new Date());
  let valorVencidoContas = 0, totalReceber = 0;

  for (const c of (state.contas || [])) {
    if (c.tipo === 'receber' && c.status !== 'pago' && c.status !== 'cancelado' && (c.clienteId === clienteId || c.cli === clienteId)) {
      const v = Number(c.valor || c.valorLiquido || 0);
      totalReceber = round2(totalReceber + v);
      if (c.vencimento && toDateYmd(c.vencimento) < refYmd) valorVencidoContas = round2(valorVencidoContas + v);
    }
  }

  const borderosAtrasoSum = (risco.borderosEmAtraso || []).reduce((acc, b) => acc + Number(b.saldoDevedor || 0), 0);
  const totalVencidoCliente = round2(borderosAtrasoSum + valorVencidoContas);
  const exposicaoTotalCredito = round2(Number(risco.saldoDevedorTotal || 0) + totalReceber);

  const bloqueadoPorInadimplencia = risco.statusRisco === 'bloqueado_inadimplencia' ||
    risco.statusRisco === 'bloqueado_limite_credito' ||
    totalVencidoCliente > 0.01 ||
    (risco.limiteCredito > 0 && exposicaoTotalCredito >= risco.limiteCredito);

  const statusCredito = bloqueadoPorInadimplencia ? 'bloqueado' : (risco.statusRisco === 'atencao_atraso_tolerancia' ? 'atencao' : 'regular');

  return {
    clienteId, statusCredito, limiteCreditoGlobal: Number(risco.limiteCredito || 0),
    exposicaoTotalCredito, totalVencidoCliente, bloqueadoPorInadimplencia,
    motivoBloqueio: risco.motivoBloqueio || (totalVencidoCliente > 0 ? `Títulos a receber vencidos somando R$ ${totalVencidoCliente.toFixed(2)}` : '')
  };
}

function realizarTriagemPortariaPorPlaca(state, payload = {}) {
  garantirColecoes(state);
  const placaNorm = normalizarPlaca(payload.placa);
  if (!placaNorm) throw criarErro('PLATE_REQUIRED', 'Placa do veículo é obrigatória para triagem.', 400);

  const kmEntrada = Number(payload.kmEntrada) || 0;
  const dataRef = payload.dataReferencia || new Date().toISOString();

  if (kmEntrada > 0) {
    try {
      fleetPredictiveMaintenanceService.atualizarTelemetriaKmFrota(state, {
        placa: placaNorm, kmAtual: kmEntrada, forcarAjusteHodometro: true, timestamp: dataRef
      });
    } catch (_) {}
  }

  const infoCliente = identificarClientePorPlaca(state, placaNorm);
  const clienteId = payload.clienteId || infoCliente.clienteId || null;
  const clienteNome = payload.clienteNome || infoCliente.clienteNome || 'Cliente Frotista';
  const situacaoCreditoCliente = avaliarSituacaoCreditoCliente(state, clienteId, dataRef);

  const garantiaRes = vehicleTechnicalDossierService.avaliarCoberturaGarantiaPecaOuServico(state, {
    placa: placaNorm, kmAtual: kmEntrada, dataReferencia: dataRef
  });
  const garantiasAtivas = (garantiaRes.intervencoes || []).filter(i => i.coberturaAtiva === true);

  const radarPrev = fleetPredictiveMaintenanceService.apurarRadarPreventivaPreditiva(state, {
    placa: placaNorm, dataReferencia: dataRef
  });
  const alertasPreventivosPlaca = (radarPrev.alertas || []).filter(a =>
    ['vencida', 'critica_proxima', 'atencao_programar'].includes(a.statusPreventivo)
  );

  const oportunidades = (state.opportunities || []).filter(o =>
    normalizarPlaca(o.placa) === placaNorm && o.status !== 'convertida' && o.status !== 'arquivada'
  );
  let receitaRecuperavel = 0;
  for (const opp of oportunidades) receitaRecuperavel = round2(receitaRecuperavel + Number(opp.valorTotalEstimado || opp.valorEstimado || 0));

  const tipoDesejado = payload.tipoServicoDesejado || 'pesado_mola';
  const boxesLivres = (state.patioBoxes || []).filter(b => b.status === 'livre');
  const boxLivreRecomendado = boxesLivres.find(b => b.tipoBox === tipoDesejado) || boxesLivres[0] || null;

  return {
    placa: placaNorm, clienteId, clienteNome, kmEntrada,
    pesagemEixosKg: payload.pesagemEixosKg || {},
    situacaoCreditoCliente, garantiasAtivas, alertasPreventivosPlaca,
    oportunidadesDemandaReprimida: oportunidades,
    receitaRecuperavelDemandaReprimida: receitaRecuperavel,
    boxLivreRecomendado, dataTriagem: dataRef
  };
}

function registrarFastCheckinPortaria360(state, payload = {}) {
  garantirColecoes(state);
  const timestamp = payload.timestamp || new Date().toISOString();
  const triagem = realizarTriagemPortariaPorPlaca(state, {
    placa: payload.placa, clienteId: payload.clienteId, clienteNome: payload.clienteNome,
    kmEntrada: payload.kmEntrada, pesagemEixosKg: payload.pesagemEixosKg, dataReferencia: timestamp
  });

  const isentoGarantia = Boolean(payload.atendimentoGarantiaIsento);
  if (triagem.situacaoCreditoCliente.bloqueadoPorInadimplencia && !isentoGarantia) {
    if (!payload.autorizarOverrideCreditoCliente) {
      throw criarErro('CLIENT_CREDIT_BLOCKED_AT_GATEHOUSE', `Check-in bloqueado para ${triagem.clienteNome || triagem.clienteId}. ${triagem.situacaoCreditoCliente.motivoBloqueio}`, 422);
    }
    if (!payload.justificativaOverrideCredito || !String(payload.justificativaOverrideCredito).trim()) {
      throw criarErro('OVERRIDE_JUSTIFICATION_REQUIRED', 'Justificativa obrigatória para autorizar override de crédito na portaria.', 400);
    }
    state.creditOverrideLogs.push({
      id: gerarId('ovr_cred'), clienteId: triagem.clienteId, placa: triagem.placa,
      justificativa: String(payload.justificativaOverrideCredito).trim(),
      autor: payload.responsavel || 'Portaria', timestamp
    });
  }

  let novaOS = null;
  if (payload.abrirOSAutomatica !== false) {
    const numOS = (state.os.length > 0 ? Math.max(...state.os.map(o => Number(o.num) || 0)) : 1000) + 1;
    novaOS = {
      id: gerarId('os'), num: numOS, tenantId: payload.tenantId || state.tenantId || 'tenant_default',
      clienteId: triagem.clienteId, clienteNome: payload.clienteNome || triagem.clienteNome,
      placa: triagem.placa, motoristaNome: payload.motoristaNome || '',
      km: Number(payload.kmEntrada) || triagem.kmEntrada,
      status: 'em_andamento', st: 'em_andamento', servicos: [], pecas: [],
      data: timestamp.slice(0, 10), dataAbertura: timestamp, origemPortaria: true
    };

    for (const oppId of (payload.incluirOportunidadesIds || [])) {
      const opp = (state.opportunities || []).find(o => o.id === oppId);
      if (opp) {
        if (Array.isArray(opp.servicos)) novaOS.servicos.push(...opp.servicos.map(s => ({ ...s, status: 'aprovado' })));
        if (Array.isArray(opp.pecas)) novaOS.pecas.push(...opp.pecas.map(p => ({ ...p, statusAprovacao: 'aprovado' })));
        opp.status = 'convertida'; opp.osGeradaId = novaOS.id; opp.atualizadoEm = timestamp;
      }
    }

    for (const altId of (payload.incluirAlertasPreventivosIds || [])) {
      const alt = (state.predictiveAlerts || []).find(a => a.id === altId);
      if (alt) {
        const val = Number(alt.valorEstimadoRevisao) || 0;
        novaOS.servicos.push({ id: gerarId('srv_prev'), desc: alt.descricaoServico || 'Manutenção Preventiva', preco: val, total: val, status: 'aprovado' });
        alt.statusContato = 'convertido_os'; alt.osGeradaId = novaOS.id; alt.atualizadoEm = timestamp;
      }
    }

    if (isentoGarantia) {
      novaOS.total = 0; novaOS.valorTotal = 0; novaOS.tipoAtendimento = 'garantia_isenta';
    } else {
      let soma = 0;
      for (const s of novaOS.servicos) soma += Number(s.total || s.preco || 0);
      for (const p of novaOS.pecas) soma += Number(p.total || ((p.preco || 0) * (p.qtd || 1)));
      novaOS.total = round2(soma); novaOS.valorTotal = novaOS.total;
    }
    state.os.push(novaOS);
  }

  let boxAlocado = null;
  if (payload.alocarBoxAutomaticamente !== false && novaOS) {
    const boxDestinoId = payload.boxEscolhidoId || triagem.boxLivreRecomendado?.id;
    if (boxDestinoId) {
      const resBox = patioBoxManagementService.alocarVeiculoBox(state, { boxId: boxDestinoId, osId: novaOS.id, timestamp });
      boxAlocado = resBox.box;
    }
  }

  const checkInLog = {
    id: gerarId('gate'), tenantId: payload.tenantId || state.tenantId || 'tenant_default',
    placa: triagem.placa, clienteId: triagem.clienteId, clienteNome: payload.clienteNome || triagem.clienteNome,
    motoristaNome: payload.motoristaNome || '', kmEntrada: triagem.kmEntrada,
    pesagemEixosKg: payload.pesagemEixosKg || {}, entradaEm: timestamp, saidaEm: null,
    statusPortaria: 'no_patio', osGeradaId: novaOS ? novaOS.id : null,
    boxAlocadoId: boxAlocado ? boxAlocado.id : null, resumoTriagem360: triagem,
    atendimentoGarantiaIsento: isentoGarantia, responsavel: payload.responsavel || 'Portaria'
  };
  state.gatehouseLogs.push(checkInLog);

  return { ok: true, checkInLog, osGerada: novaOS, boxAlocado, triagem };
}

function registrarSaidaPortariaVeiculo(state, portariaLogId, payload = {}) {
  garantirColecoes(state);
  const log = state.gatehouseLogs.find(l => l.id === portariaLogId);
  if (!log) throw criarErro('GATEHOUSE_LOG_NOT_FOUND', 'Registro de portaria não encontrado.', 404);
  if (log.statusPortaria === 'liberado_saida') throw criarErro('VEHICLE_ALREADY_EXITED', 'Veículo já liberado da portaria.', 409);

  const timestamp = payload.timestamp || new Date().toISOString();
  if (log.osGeradaId && payload.exigirInspecaoQualidade !== false) {
    qualityWarrantyReworkService.validarLiberacaoQualidadeOS(state, log.osGeradaId);
  }

  if (log.boxAlocadoId) {
    try {
      patioBoxManagementService.liberarBoxPatio(state, { boxId: log.boxAlocadoId, exigirInspecaoQualidade: false, timestamp });
    } catch (_) {}
  }

  const msPermanencia = new Date(timestamp).getTime() - new Date(log.entradaEm).getTime();
  log.statusPortaria = 'liberado_saida';
  log.saidaEm = timestamp;
  log.kmSaida = Number(payload.kmSaida) || log.kmEntrada;
  log.tempoTotalPermanenciaPatioMinutos = Math.max(0, Math.round(msPermanencia / 60000));
  log.observacaoSaida = payload.observacaoSaida || '';
  log.liberadoPor = payload.responsavel || 'Portaria';

  return { ok: true, log };
}

function listarMovimentacaoPortariaPatio(state, { statusPortaria, placa, clienteId } = {}) {
  garantirColecoes(state);
  let lista = [...state.gatehouseLogs];
  if (statusPortaria) lista = lista.filter(l => l.statusPortaria === statusPortaria);
  if (placa) lista = lista.filter(l => normalizarPlaca(l.placa) === normalizarPlaca(placa));
  if (clienteId) lista = lista.filter(l => l.clienteId === clienteId);
  lista.sort((a, b) => new Date(b.entradaEm) - new Date(a.entradaEm));

  return {
    ok: true, movimentacoes: lista,
    veiculosNoPatioCount: state.gatehouseLogs.filter(l => l.statusPortaria === 'no_patio').length,
    saidasLiberadasCount: state.gatehouseLogs.filter(l => l.statusPortaria === 'liberado_saida').length,
    totalRegistros: lista.length
  };
}

module.exports = {
  realizarTriagemPortariaPorPlaca,
  registrarFastCheckinPortaria360,
  registrarSaidaPortariaVeiculo,
  listarMovimentacaoPortariaPatio
};
