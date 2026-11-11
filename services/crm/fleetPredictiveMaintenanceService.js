'use strict';

/**
 * services/crm/fleetPredictiveMaintenanceService.js
 *
 * Motor de Manutenção Preventiva Preditiva de Frotas Pesadas:
 * Cálculo por KM, tempo e severidade de rota; telemetria com trava de rollback;
 * radar semafórico de criticidade; régua ativa WhatsApp e conversão em OS.
 *
 * Teto Modular: <= 350 linhas
 */

function criarErro(code, message, status = 400) {
  const err = new Error(message);
  err.code = code;
  err.status = status;
  return err;
}

function gerarId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function garantirColecoes(state) {
  if (!state) throw criarErro('STATE_REQUIRED', 'Estado da aplicação não informado.');
  if (!Array.isArray(state.preventivePlans)) state.preventivePlans = [];
  if (!Array.isArray(state.fleetTelemetry)) state.fleetTelemetry = [];
  if (!Array.isArray(state.predictiveAlerts)) state.predictiveAlerts = [];
  if (!Array.isArray(state.os)) state.os = [];
  if (!Array.isArray(state.receptionQueue)) state.receptionQueue = [];
  if (!Array.isArray(state.whatsappAgentLogs)) state.whatsappAgentLogs = [];
}

const FATORES_SEVERIDADE = { rodoviaria: 1.0, mista: 0.85, severa_fora_estrada: 0.70 };

function calcularFatorSeveridade(sev) {
  return FATORES_SEVERIDADE[sev] || 1.0;
}

function configurarPlanoPreventivoVeiculo(state, payload = {}) {
  garantirColecoes(state);
  const placa = String(payload.placa || '').toUpperCase().trim();
  if (!placa) throw criarErro('PLACA_REQUIRED', 'Placa do veículo é obrigatória.');

  const severidade = payload.severidadeOperacao || 'rodoviaria';
  const fator = calcularFatorSeveridade(severidade);
  const kmPadrao = Number(payload.intervaloKmPadrao) || 20000;
  const diasPadrao = Number(payload.intervaloDiasPadrao) || 90;
  const intervaloKmAjustado = Math.round(kmPadrao * fator);
  const intervaloDiasAjustado = Math.round(diasPadrao * fator);
  const agora = payload.timestamp || new Date().toISOString();
  const sistema = payload.sistemaTecnico || 'geral_suspensao';

  let plano = state.preventivePlans.find(p => (payload.id && p.id === payload.id) || (p.placa === placa && p.sistemaTecnico === sistema));

  const dados = {
    clienteId: payload.clienteId || null,
    clienteNome: payload.clienteNome || 'Cliente Frotista',
    placa,
    modeloVeiculo: payload.modeloVeiculo || 'Caminhão Pesado',
    sistemaTecnico: sistema,
    descricaoServicoPadrao: payload.descricaoServicoPadrao || 'Revisão Preventiva Padrão',
    intervaloKmPadrao: kmPadrao,
    intervaloDiasPadrao: diasPadrao,
    severidadeOperacao: severidade,
    fatorSeveridade: fator,
    intervaloKmAjustado,
    intervaloDiasAjustado,
    kmUltimaRevisao: Number(payload.kmUltimaRevisao) || 0,
    dataUltimaRevisao: payload.dataUltimaRevisao || agora.slice(0, 10),
    kmMedioDiario: Number(payload.kmMedioDiario) || 350,
    valorEstimadoRevisao: Number(payload.valorEstimadoRevisao) || 0,
    itensPadrao: payload.itensPadrao || [],
    atualizadoEm: agora
  };

  if (plano) {
    Object.assign(plano, dados);
  } else {
    plano = { id: payload.id || gerarId('pln_prev'), tenantId: payload.tenantId || state.tenantId || 'default', ...dados, kmAtualConhecido: dados.kmUltimaRevisao, ativo: true, criadoEm: agora };
    state.preventivePlans.push(plano);
  }

  apurarRadarPreventivaPreditiva(state, { dataReferencia: agora });
  return { ok: true, plano };
}

function atualizarTelemetriaKmFrota(state, payload = {}) {
  garantirColecoes(state);
  const placa = String(payload.placa || '').toUpperCase().trim();
  const kmAtual = Number(payload.kmAtual);
  if (!placa || Number.isNaN(kmAtual)) throw criarErro('INVALID_TELEMETRY', 'Placa e kmAtual numérico são obrigatórios.');

  const maiorKm = state.fleetTelemetry.filter(t => t.placa === placa).reduce((max, t) => Math.max(max, Number(t.kmAtual || 0)), 0);
  if (maiorKm > 0 && kmAtual < maiorKm && !payload.forcarAjusteHodometro) {
    throw criarErro('INVALID_ODOMETER_ROLLBACK', `Leitura de hodômetro (${kmAtual} km) menor que a última registrada (${maiorKm} km) para o veículo ${placa}.`);
  }

  const agora = payload.timestamp || new Date().toISOString();
  const entry = { id: gerarId('tel'), tenantId: payload.tenantId || state.tenantId || 'default', placa, clienteId: payload.clienteId || null, kmAtual, kmMedioDiario: payload.kmMedioDiario ? Number(payload.kmMedioDiario) : null, severidadeOperacao: payload.severidadeOperacao || null, origem: payload.origem || 'manual_ou_checkin', timestamp: agora };
  state.fleetTelemetry.push(entry);

  for (const plano of state.preventivePlans) {
    if (plano.placa === placa) {
      plano.kmAtualConhecido = kmAtual;
      if (payload.kmMedioDiario) plano.kmMedioDiario = Number(payload.kmMedioDiario);
      if (payload.severidadeOperacao) {
        plano.severidadeOperacao = payload.severidadeOperacao;
        const fator = calcularFatorSeveridade(payload.severidadeOperacao);
        plano.intervaloKmAjustado = Math.round((plano.intervaloKmPadrao || 20000) * fator);
        plano.intervaloDiasAjustado = Math.round((plano.intervaloDiasPadrao || 90) * fator);
      }
      plano.atualizadoEm = agora;
    }
  }

  apurarRadarPreventivaPreditiva(state, { dataReferencia: agora });
  return { ok: true, telemetria: entry };
}

function calcularStatusPreventivo(kmRestante, diasRestantes) {
  if (kmRestante <= 0 || diasRestantes <= 0) return 'vencida';
  if (kmRestante <= 1500 || diasRestantes <= 7) return 'critica_proxima';
  if (kmRestante <= 3500 || diasRestantes <= 15) return 'atencao_programar';
  return 'em_dia';
}

function apurarRadarPreventivaPreditiva(state, { clienteId = null, placa = null, statusPreventivo = null, dataReferencia = null } = {}) {
  garantirColecoes(state);
  const agora = dataReferencia ? new Date(dataReferencia) : new Date();

  const planos = state.preventivePlans.filter(p => {
    if (p.ativo === false) return false;
    if (clienteId && p.clienteId !== clienteId) return false;
    if (placa && p.placa !== String(placa).toUpperCase().trim()) return false;
    return true;
  });

  const prioridadeStatus = { vencida: 1, critica_proxima: 2, atencao_programar: 3, em_dia: 4 };
  const alertasApurados = [];

  for (const plano of planos) {
    const ultimasOS = state.os.filter(o => (o.placa === plano.placa || o.veiculoPlaca === plano.placa) && ['finalizada', 'concluida', 'entregue'].includes(String(o.st || o.status || '').toLowerCase()));
    if (ultimasOS.length > 0) {
      const maisRecente = ultimasOS.sort((a, b) => new Date(b.fechamento || b.dataFinalizacao || b.data || 0) - new Date(a.fechamento || a.dataFinalizacao || a.data || 0))[0];
      const dataOS = String(maisRecente.fechamento || maisRecente.dataFinalizacao || maisRecente.data || '').slice(0, 10);
      if (dataOS && (!plano.dataUltimaRevisao || dataOS > plano.dataUltimaRevisao)) {
        plano.dataUltimaRevisao = dataOS;
        if (maisRecente.km || maisRecente.odometro) plano.kmUltimaRevisao = Number(maisRecente.km || maisRecente.odometro);
      }
    }

    const dataRev = new Date(plano.dataUltimaRevisao || agora.toISOString().slice(0, 10));
    const diasDecorridos = Math.max(0, Math.round((agora.getTime() - dataRev.getTime()) / (24 * 3600 * 1000)));
    const kmMedio = Number(plano.kmMedioDiario) || 300;
    const kmEstimadoAtual = Math.max(Number(plano.kmAtualConhecido || 0), Number(plano.kmUltimaRevisao || 0) + (diasDecorridos * kmMedio));
    const kmProximaRevisao = Number(plano.kmUltimaRevisao || 0) + plano.intervaloKmAjustado;
    const kmRestante = kmProximaRevisao - kmEstimadoAtual;
    const diasRestantes = Math.min(plano.intervaloDiasAjustado - diasDecorridos, Math.round(kmRestante / Math.max(1, kmMedio)));
    const statusCalc = calcularStatusPreventivo(kmRestante, diasRestantes);

    let alerta = state.predictiveAlerts.find(a => a.planoId === plano.id || (a.placa === plano.placa && a.sistemaTecnico === plano.sistemaTecnico));
    const dadosAlerta = { kmEstimadoAtual, kmProximaRevisao, kmRestante, diasRestantes, statusPreventivo: statusCalc, severidadeOperacao: plano.severidadeOperacao, valorEstimadoRevisao: Number(plano.valorEstimadoRevisao) || 0, atualizadoEm: agora.toISOString() };

    if (alerta) {
      Object.assign(alerta, dadosAlerta);
    } else {
      alerta = { id: gerarId('alt_pred'), planoId: plano.id, tenantId: plano.tenantId || state.tenantId || 'default', clienteId: plano.clienteId, clienteNome: plano.clienteNome, placa: plano.placa, modeloVeiculo: plano.modeloVeiculo, sistemaTecnico: plano.sistemaTecnico, descricaoServico: plano.descricaoServicoPadrao, itensPadrao: plano.itensPadrao || [], ultimoDisparoWhatsAppEm: null, statusContato: 'pendente_contato', ...dadosAlerta };
      state.predictiveAlerts.push(alerta);
    }

    if (!statusPreventivo || alerta.statusPreventivo === statusPreventivo) alertasApurados.push(alerta);
  }

  alertasApurados.sort((a, b) => {
    const diff = (prioridadeStatus[a.statusPreventivo] || 9) - (prioridadeStatus[b.statusPreventivo] || 9);
    return diff !== 0 ? diff : a.kmRestante - b.kmRestante;
  });

  const kpis = {
    vencidasCount: alertasApurados.filter(a => a.statusPreventivo === 'vencida').length,
    criticasCount: alertasApurados.filter(a => a.statusPreventivo === 'critica_proxima').length,
    atencaoCount: alertasApurados.filter(a => a.statusPreventivo === 'atencao_programar').length,
    emDiaCount: alertasApurados.filter(a => a.statusPreventivo === 'em_dia').length,
    receitaPreventivaPotencialTotal: alertasApurados.filter(a => a.statusContato !== 'convertido_os').reduce((sum, a) => sum + Number(a.valorEstimadoRevisao || 0), 0)
  };

  return { ok: true, dataReferencia: agora.toISOString(), totalAlertas: alertasApurados.length, kpis, alertas: alertasApurados };
}

function dispararReguaPreventivaWhatsApp(state, { alertaIds = [], incluirStatus = ['vencida', 'critica_proxima'], responsavel = 'Agente-Preditivo', timestamp = null } = {}) {
  garantirColecoes(state);
  const radar = apurarRadarPreventivaPreditiva(state, { dataReferencia: timestamp });
  const agora = timestamp || new Date().toISOString();

  const alertasAlvo = radar.alertas.filter(a => {
    if (alertaIds.length > 0) return alertaIds.includes(a.id);
    return incluirStatus.includes(a.statusPreventivo) && a.statusContato !== 'convertido_os';
  });

  for (const alerta of alertasAlvo) {
    const statusTxt = alerta.statusPreventivo === 'vencida' ? 'VENCIDA' : 'CRÍTICA';
    const msg = `🔧 *Pátio CRM — Alerta Preventivo de Frota:*\nOlá, ${alerta.clienteNome}! O veículo ${alerta.modeloVeiculo} (${alerta.placa}) atingiu o ponto de revisão do sistema de *${alerta.sistemaTecnico}*.\n• KM Estimado: ${alerta.kmEstimadoAtual} km (${alerta.kmRestante <= 0 ? 'REVISÃO VENCIDA' : `Restam ${alerta.kmRestante} km`})\n• Status: *${statusTxt}*\nEvite paradas na rodovia. Deseja agendar um box exclusivo?`;

    state.whatsappAgentLogs.push({ id: gerarId('log_wpp_prev'), tenantId: alerta.tenantId || state.tenantId || 'default', tipo: 'regua_preventiva_preditiva', alertaId: alerta.id, placa: alerta.placa, clienteId: alerta.clienteId, mensagem: msg, responsavel, timestamp: agora });
    alerta.ultimoDisparoWhatsAppEm = agora;
    alerta.statusContato = 'notificado_whatsapp';
  }

  return { ok: true, disparosRealizados: alertasAlvo.length, totalNotificados: alertasAlvo.length, alertas: alertasAlvo };
}

function converterAlertaPreventivoEmAgendamentoOS(state, alertaId, { boxPreferencialId = null, centroCustoId = null, criarPreCheckinRecepcao = true, responsavel = 'Agente-Preditivo', timestamp = null } = {}) {
  garantirColecoes(state);
  let alerta = state.predictiveAlerts.find(a => a.id === alertaId);
  if (!alerta) {
    apurarRadarPreventivaPreditiva(state, { dataReferencia: timestamp });
    alerta = state.predictiveAlerts.find(a => a.id === alertaId);
  }
  if (!alerta) throw criarErro('ALERT_NOT_FOUND', `Alerta preventivo "${alertaId}" não encontrado.`, 404);
  if (alerta.statusContato === 'convertido_os') throw criarErro('ALERT_ALREADY_CONVERTED', `Alerta "${alertaId}" já foi convertido na OS "${alerta.osGeradaId}".`, 409);

  const agora = timestamp || new Date().toISOString();
  const proximoNum = state.os.reduce((max, o) => Math.max(max, Number(o.num || 0)), 8100) + 1;
  const valorTotal = Number(alerta.valorEstimadoRevisao || 0);

  const novaOS = {
    id: gerarId('os_prev'),
    num: proximoNum,
    tenantId: alerta.tenantId || state.tenantId || 'default',
    clienteId: alerta.clienteId,
    clienteNome: alerta.clienteNome,
    cli: alerta.clienteId,
    placa: alerta.placa,
    veiculo: alerta.modeloVeiculo,
    modelo: alerta.modeloVeiculo,
    tipoOS: 'preventiva_programada',
    st: 'aberta',
    status: 'Aberta',
    boxAtualId: boxPreferencialId || null,
    centroCustoId: centroCustoId || null,
    total: valorTotal,
    valorTotal,
    servicos: [{ id: gerarId('srv_prev'), desc: `Revisão Preventiva Preditiva - ${alerta.sistemaTecnico}: ${alerta.descricaoServico}`, valor: valorTotal, statusItem: 'aprovado' }],
    pecas: Array.isArray(alerta.itensPadrao) ? [...alerta.itensPadrao] : [],
    alertaOrigemId: alerta.id,
    responsavel,
    dataAbertura: agora
  };
  state.os.push(novaOS);

  let filaItem = null;
  if (criarPreCheckinRecepcao) {
    filaItem = { id: gerarId('rec'), protocolo: 'REC-PREV-' + Date.now().toString().slice(-4), placa: alerta.placa, clienteNome: alerta.clienteNome, dataChegada: agora, status: 'aguardando_triagem', tipo: 'preventiva_programada', osId: novaOS.id };
    state.receptionQueue.push(filaItem);
  }

  alerta.statusContato = 'convertido_os';
  alerta.osGeradaId = novaOS.id;
  alerta.convertidoEm = agora;

  return { ok: true, os: novaOS, filaRecepcao: filaItem, alerta };
}

module.exports = {
  configurarPlanoPreventivoVeiculo,
  atualizarTelemetriaKmFrota,
  apurarRadarPreventivaPreditiva,
  dispararReguaPreventivaWhatsApp,
  converterAlertaPreventivoEmAgendamentoOS
};
