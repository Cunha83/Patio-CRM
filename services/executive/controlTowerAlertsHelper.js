'use strict';

/**
 * services/executive/controlTowerAlertsHelper.js
 *
 * Motor de Alertas Críticos de Comando da Torre de Controle Executiva:
 * - Varre gargalos de pátio e estouramento de SLA
 * - Inadimplência crítica e frotistas bloqueados
 * - Retrabalhos abertos em garantia
 * - Orçamentos externos pendentes de aprovação
 * - Preventivas vencidas por telemetria e KM
 * - Follow-ups vencidos de demanda reprimida
 *
 * Teto Modular: <= 280 linhas
 */

const patioBottleneckSlaService = require('../patio/patioBottleneckSlaService');
const fleetDelinquencyGuardService = require('../billing/fleetDelinquencyGuardService');
const fleetPredictiveMaintenanceService = require('../crm/fleetPredictiveMaintenanceService');
const opportunityFollowUpQueue = require('../crm/opportunityFollowUpQueue');

function garantirColecoes(state) {
  if (!state) throw new Error('Estado da aplicação não informado.');
  ['patioBoxes', 'patioBottlenecks', 'os', 'reworkRecords', 'externalApprovalTokens',
   'opportunities', 'preventivePlans', 'fiscalClosings', 'borderos', 'borderosFrotistas',
   'whatsappAgentLogs', 'executiveBriefingLogs'].forEach(k => {
    if (!Array.isArray(state[k])) state[k] = [];
  });
}

/**
 * Varre o estado operacional e gera a fila priorizada de alertas de comando.
 */
function gerarFilaAlertasCriticosComando(state, { competencia = null, dataReferencia = null } = {}) {
  garantirColecoes(state);
  const comp = competencia || new Date().toISOString().slice(0, 7);
  const dataRef = dataReferencia ? new Date(dataReferencia) : new Date();
  const alertas = [];

  // 1. Boxes com SLA Estourado (CRÍTICA, PÁTIO)
  const indBoxes = patioBottleneckSlaService.calcularIndicadoresOcupacaoEGargalos(state, {
    timestampReferencia: dataRef.toISOString()
  });
  for (const g of indBoxes.gargalosAtivos || []) {
    if (g.statusSla === 'sla_estourado') {
      alertas.push({
        id: `alerta_sla_${g.id}`,
        codigoTipo: 'SLA_BOX_ESTOURADO',
        categoria: 'patio',
        severidade: 'critica',
        titulo: 'SLA de Box Estourado',
        descricao: `Box ${g.boxCodigo || g.boxId || 'Pesado'} parado há ${g.tempoParadoMinutos} min (${(g.motivoParada || '').replace(/_/g, ' ')})`,
        referenciaId: g.osId,
        acaoRecomendada: 'Destravar box imediatamente ou transferir OS.'
      });
    }
  }

  // 2. Frotistas Bloqueados por Inadimplência (CRÍTICA, FINANCEIRO)
  const clientesIds = new Set();
  [...state.borderos, ...state.borderosFrotistas].forEach(b => { if (b.clienteId) clientesIds.add(b.clienteId); });
  if (Array.isArray(state.clientes)) state.clientes.forEach(c => { if (c.id) clientesIds.add(c.id); });

  for (const cliId of clientesIds) {
    try {
      const risco = fleetDelinquencyGuardService.avaliarRiscoInadimplenciaFrotista(state, cliId, { dataReferencia: dataRef });
      if (risco.statusRisco === 'bloqueado_inadimplencia') {
        alertas.push({
          id: `alerta_inad_${cliId}`,
          codigoTipo: 'INADIMPLENCIA_FROTISTA_BLOQUEIO',
          categoria: 'financeiro',
          severidade: 'critica',
          titulo: 'Frotista Bloqueado por Inadimplência',
          descricao: `Frotista ${cliId} com borderôs vencidos há ${risco.diasMaiorAtraso} dias (Saldo: R$ ${risco.saldoDevedorTotal.toFixed(2)})`,
          referenciaId: cliId,
          acaoRecomendada: 'Exigir liquidação imediata ou autorizar override formal.'
        });
      }
    } catch (_) {}
  }

  // 3. Retrabalhos em Garantia Abertos (ALTA, PÁTIO)
  for (const r of state.reworkRecords) {
    const rComp = r.competencia || (r.timestamp ? r.timestamp.slice(0, 7) : comp);
    if (rComp === comp && (r.status === 'aberto' || !r.status || r.statusEstorno === 'pendente')) {
      alertas.push({
        id: `alerta_ret_${r.id}`,
        codigoTipo: 'RETRABALHO_GARANTIA_ATIVO',
        categoria: 'patio',
        severidade: 'alta',
        titulo: 'Retrabalho de Garantia em Aberto',
        descricao: `OS de garantia aberta para OS #${r.osOrigemId || r.osRetrabalhoId}: ${(r.motivoRetrabalho || 'falha')}`,
        referenciaId: r.osRetrabalhoId || r.osOrigemId,
        acaoRecomendada: 'Auditar causa raiz e apurar estorno de comissão.'
      });
    }
  }

  // 4. Orçamentos B2B Aguardando Assinatura Externa (ALTA, COMERCIAL)
  for (const t of state.externalApprovalTokens) {
    if (t.status === 'pendente') {
      alertas.push({
        id: `alerta_ext_${t.id}`,
        codigoTipo: 'ORCAMENTO_EXTERNO_PENDENTE',
        categoria: 'comercial',
        severidade: 'alta',
        titulo: 'Orçamento Pendente de Assinatura Externa',
        descricao: `Link externo pendente de aprovação frotista para OS #${t.osId}`,
        referenciaId: t.osId,
        acaoRecomendada: 'Reenviar link ou acionar gestor da frota por WhatsApp.'
      });
    }
  }

  // 5. Manutenções Preventivas Vencidas (ALTA, PREDITIVA)
  try {
    const radar = fleetPredictiveMaintenanceService.apurarRadarPreventivaPreditiva(state, { dataReferencia: dataRef });
    for (const a of radar.alertas || []) {
      if (a.statusPreventivo === 'vencida') {
        alertas.push({
          id: `alerta_prev_${a.id || a.placa}`,
          codigoTipo: 'PREVENTIVA_FROTA_VENCIDA',
          categoria: 'preditiva',
          severidade: 'alta',
          titulo: 'Manutenção Preventiva Vencida',
          descricao: `Veículo placa ${a.placa} com revisão de ${a.sistemaTecnico || 'suspensão'} vencida`,
          referenciaId: a.placa,
          acaoRecomendada: 'Agendar parada preventiva imediata no pátio.'
        });
      }
    }
  } catch (_) {}

  // 6. Follow-ups de Demanda Reprimida Vencidos (MÉDIA, COMERCIAL)
  try {
    const demandas = opportunityFollowUpQueue.listarFilaFollowUpDemandaReprimida({ state, dataReferencia: dataRef.toISOString() });
    for (const op of demandas.fila || []) {
      if (op.statusFollowUp === 'vencida') {
        alertas.push({
          id: `alerta_foll_${op.id}`,
          codigoTipo: 'FOLLOWUP_DEMANDA_VENCIDO',
          categoria: 'comercial',
          severidade: 'media',
          titulo: 'Follow-up de Demanda Reprimida Vencido',
          descricao: `Oportunidade de ${op.placa || 'frotista'} vencida em ${op.dataFollowUp || 'data passada'}`,
          referenciaId: op.id,
          acaoRecomendada: 'Contatar frotista para recuperar conversão.'
        });
      }
    }
  } catch (_) {}

  const pesoSev = { critica: 3, alta: 2, media: 1 };
  return alertas.sort((a, b) => (pesoSev[b.severidade] || 0) - (pesoSev[a.severidade] || 0));
}

module.exports = {
  garantirColecoes,
  gerarFilaAlertasCriticosComando
};

