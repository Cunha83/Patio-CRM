'use strict';

/**
 * services/executive/controlTowerService.js
 *
 * Torre de Controle Executiva 360º da Oficina Pesada:
 * - Orquestração unificada de Pátio, Comercial, Financeiro, Fiscal e Preditiva
 * - Motor de Alertas Críticos de Comando por severidade (crítica, alta, média)
 * - Score de Saúde Operacional (0 a 100) e Classificação de Status Geral
 * - Disparo e log de Briefing Diário da Diretoria via WhatsApp
 *
 * Teto Modular Estrito: <= 350 linhas
 */

const crypto = require('crypto');
const patioBottleneckSlaService = require('../patio/patioBottleneckSlaService');
const fleetDelinquencyGuardService = require('../billing/fleetDelinquencyGuardService');
const fleetPredictiveMaintenanceService = require('../crm/fleetPredictiveMaintenanceService');
const opportunityFollowUpQueue = require('../crm/opportunityFollowUpQueue');
const executiveDreBreakEvenService = require('../finance/executiveDreBreakEvenService');

const round2 = v => Math.round((Number(v) || 0) * 100) / 100;
const gerarId = prefix => `${prefix}_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;

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

/**
 * Consolida a Torre de Controle Executiva 360º com os 4 pilares e score.
 */
function consolidarTorreControleExecutiva360(state, { competencia = null, dataReferencia = null } = {}) {
  garantirColecoes(state);
  const comp = competencia || new Date().toISOString().slice(0, 7);
  const dataRef = dataReferencia ? new Date(dataReferencia) : new Date();

  // 1. Pilar Pátio & Qualidade
  const indBoxes = patioBottleneckSlaService.calcularIndicadoresOcupacaoEGargalos(state, { timestampReferencia: dataRef.toISOString() });
  const totalRetrabalhos = state.reworkRecords.filter(r => (r.competencia || (r.timestamp ? r.timestamp.slice(0, 7) : comp)) === comp).length;

  const pilarPatioQualidade = {
    totalBoxes: indBoxes.totalBoxes,
    boxesOcupadosProdutivos: indBoxes.boxesOcupadosProdutivos,
    boxesBloqueadosGargalo: indBoxes.boxesBloqueadosGargalo,
    taxaOcupacaoPercentual: indBoxes.taxaOcupacaoPercentual,
    gargalosEstouradosCount: indBoxes.gargalosEstouradosCount,
    totalRetrabalhosCompetencia: totalRetrabalhos,
    eficienciaMediaEquipePercentual: 100
  };

  // 2. Pilar Comercial B2B
  const filaDemandas = opportunityFollowUpQueue.listarFilaFollowUpDemandaReprimida({ state, dataReferencia: dataRef.toISOString() });
  const oppsPendentes = state.opportunities.filter(o => o.tipo === 'demanda_reprimida_orcamento' && o.status !== 'convertida' && o.status !== 'arquivada');
  const valorTotalDemanda = round2(oppsPendentes.reduce((s, o) => s + (Number(o.valorTotalEstimado) || 0), 0));
  const linksPendentesCount = state.externalApprovalTokens.filter(t => t.status === 'pendente').length;
  const pedidosCompraAguardandoNFCount = (state.purchaseOrders || []).filter(p => ['pendente', 'aguardando_nf', 'aguardando_entrega'].includes(p.status)).length;

  const pilarComercialB2B = {
    demandasReprimidasVencidasCount: filaDemandas.resumo?.vencidas || 0,
    demandasReprimidasHojeCount: filaDemandas.resumo?.hoje || 0,
    valorTotalDemandaReprimida: valorTotalDemanda,
    linksAprovacaoPendentesCount: linksPendentesCount,
    pedidosCompraAguardandoNFCount
  };

  // 3. Pilar Financeiro & DRE
  const dre = executiveDreBreakEvenService.apurarDreGerencialCompetenciaECaixa(state, { competencia: comp });
  const pe = executiveDreBreakEvenService.calcularPontoEquilibrioOficina(state, { competencia: comp });

  const clientesIds = new Set();
  [...state.borderos, ...state.borderosFrotistas].forEach(b => { if (b.clienteId) clientesIds.add(b.clienteId); });
  let frotasInadimplentesCount = 0;
  let valorTotalVencidoB2B = 0;

  for (const cId of clientesIds) {
    try {
      const risco = fleetDelinquencyGuardService.avaliarRiscoInadimplenciaFrotista(state, cId, { dataReferencia: dataRef });
      if (risco.statusRisco === 'bloqueado_inadimplencia') {
        frotasInadimplentesCount++;
        valorTotalVencidoB2B = round2(valorTotalVencidoB2B + risco.saldoDevedorTotal);
      }
    } catch (_) {}
  }

  const pilarFinanceiroDre = {
    receitaCompetencia: dre.regimeCompetencia.receitaBrutaTotal,
    receitaCaixa: dre.regimeCaixa.receitaBrutaTotal,
    lucroLiquidoCompetencia: dre.regimeCompetencia.lucroLiquidoOperacional,
    lucroLiquidoCaixa: dre.regimeCaixa.lucroLiquidoCaixa,
    pontoEquilibrioContabil: pe.peContabil,
    percentualAtingimentoPE: pe.percentualAtingimento,
    statusEquilibrio: pe.statusEquilibrio,
    frotasInadimplentesCount,
    valorTotalVencidoB2B
  };

  // 4. Pilar Preditiva & Fiscal
  const radar = fleetPredictiveMaintenanceService.apurarRadarPreventivaPreditiva(state, { dataReferencia: dataRef });
  const fechamentosMes = state.fiscalClosings.filter(f =>
    f.status === 'notas_emitidas' && String(f.dataEmissaoEspelho || f.criadoEm || '').startsWith(comp)
  );

  const prevVencidas = radar.kpis?.vencidasCount ?? (radar.alertas || []).filter(a => a.statusPreventivo === 'vencida').length;
  const prevCriticas = radar.kpis?.criticasCount ?? (radar.alertas || []).filter(a => a.statusPreventivo === 'critica_proxima').length;
  const recPrevPotencial = radar.kpis?.receitaPreventivaPotencialTotal || 0;

  const pilarPreditivaFiscal = {
    preventivasVencidasCount: prevVencidas,
    preventivasCriticasCount: prevCriticas,
    receitaPreventivaPotencialTotal: recPrevPotencial,
    totalNFePecasMes: round2(fechamentosMes.reduce((s, f) => s + (Number(f.baseCalculoPecasTotal) || 0), 0)),
    totalNFSeServicosMes: round2(fechamentosMes.reduce((s, f) => s + (Number(f.baseCalculoServicosTotal) || 0), 0)),
    totalLiquidoFaturadoFiscal: round2(fechamentosMes.reduce((s, f) => s + (Number(f.valorLiquidoAReceber) || 0), 0))
  };

  // Alertas Críticos de Comando e Score
  const alertasCriticos = gerarFilaAlertasCriticosComando(state, { competencia: comp, dataReferencia: dataRef });
  const resumoContadoresAlertas = {
    critica: alertasCriticos.filter(a => a.severidade === 'critica').length,
    alta: alertasCriticos.filter(a => a.severidade === 'alta').length,
    media: alertasCriticos.filter(a => a.severidade === 'media').length,
    total: alertasCriticos.length
  };

  let score = 100;
  score -= (pilarPatioQualidade.gargalosEstouradosCount * 12);
  score -= (pilarFinanceiroDre.frotasInadimplentesCount * 12);
  score -= (pilarPatioQualidade.totalRetrabalhosCompetencia * 8);
  score -= (pilarPreditivaFiscal.preventivasVencidasCount * 5);
  score -= (pilarComercialB2B.demandasReprimidasVencidasCount * 4);
  score -= (pilarComercialB2B.linksAprovacaoPendentesCount * 2);
  if (pilarFinanceiroDre.statusEquilibrio === 'deficit_abaixo_pe') score -= 10;

  const scoreSaudeOperacional = Math.max(0, Math.min(100, Math.round(score)));
  let statusSaudeGeral = 'excelencia_operacional';
  if (scoreSaudeOperacional < 50) statusSaudeGeral = 'intervencao_critica';
  else if (scoreSaudeOperacional < 70) statusSaudeGeral = 'atencao_gerencial';
  else if (scoreSaudeOperacional < 85) statusSaudeGeral = 'operacao_estavel';

  return {
    ok: true,
    competencia: comp,
    dataReferencia: dataRef.toISOString(),
    scoreSaudeOperacional,
    statusSaudeGeral,
    pilarPatioQualidade,
    pilarComercialB2B,
    pilarFinanceiroDre,
    pilarPreditivaFiscal,
    alertasCriticos,
    resumoContadoresAlertas
  };
}

/**
 * Formata e dispara o Briefing Diário da Diretoria no WhatsApp.
 */
function dispararBriefingDiarioDiretoriaWhatsApp(state, {
  turno = 'matinal',
  competencia = null,
  dataReferencia = null,
  responsavel = 'Torre-de-Controle',
  timestamp = null
} = {}) {
  const dados = consolidarTorreControleExecutiva360(state, { competencia, dataReferencia });
  const agora = timestamp || new Date().toISOString();
  const idBriefing = gerarId('briefing');

  const statusMap = {
    excelencia_operacional: '🟢 Excelência Operacional',
    operacao_estavel: '🟡 Operação Estável',
    atencao_gerencial: '🟠 Atenção Gerencial',
    intervencao_critica: '🔴 Intervenção Crítica'
  };

  const topAlertas = dados.alertasCriticos.slice(0, 3);
  const alertasTxt = topAlertas.length === 0
    ? '• Nenhum alerta impeditivo no momento.'
    : topAlertas.map(a => `• [${a.severidade.toUpperCase()}] ${a.titulo}: ${a.descricao}`).join('\n');

  const patio = dados.pilarPatioQualidade;
  const fin = dados.pilarFinanceiroDre;
  const pred = dados.pilarPreditivaFiscal;
  const com = dados.pilarComercialB2B;

  const msg = `🎯 *Torre de Controle Executiva 360º — Briefing ${turno.toUpperCase()}*\n` +
    `📅 ${agora.slice(0, 10)} | Competência: ${dados.competencia}\n\n` +
    `🏆 *Score de Saúde Operacional: ${dados.scoreSaudeOperacional}/100* (${statusMap[dados.statusSaudeGeral] || dados.statusSaudeGeral})\n\n` +
    `🚚 *Pátio & Boxes:* Ocupação ${patio.taxaOcupacaoPercentual}% (${patio.boxesOcupadosProdutivos}/${patio.totalBoxes} boxes) | Gargalos: ${patio.boxesBloqueadosGargalo} (${patio.gargalosEstouradosCount} estouraram SLA)\n` +
    `💰 *Financeiro & DRE:* Receita R$ ${fin.receitaCompetencia.toFixed(2)} | Lucro R$ ${fin.lucroLiquidoCompetencia.toFixed(2)} | PE: ${fin.percentualAtingimentoPE}% atingido | Inadimplência: ${fin.frotasInadimplentesCount} frota(s) (R$ ${fin.valorTotalVencidoB2B.toFixed(2)})\n` +
    `🔧 *Preditiva & Comercial:* ${pred.preventivasVencidasCount} preventiva(s) vencida(s) | ${com.linksAprovacaoPendentesCount} link(s) aguardando assinatura | ${com.demandasReprimidasVencidasCount} demanda(s) atrasada(s)\n\n` +
    `🚨 *Alertas Críticos de Comando:*\n${alertasTxt}`;

  const briefing = {
    id: idBriefing,
    turno,
    competencia: dados.competencia,
    scoreSaudeOperacional: dados.scoreSaudeOperacional,
    statusSaudeGeral: dados.statusSaudeGeral,
    respostaTextoWhatsApp: msg,
    responsavel,
    timestamp: agora,
    dadosConsolidados: dados
  };

  state.executiveBriefingLogs.push(briefing);
  state.whatsappAgentLogs.push({ id: gerarId('log_wpp_brief'), remetente: 'diretoria', tipo: 'briefing_diario_executivo', textoEnviado: msg, timestamp: agora });

  return { ok: true, briefing };
}

module.exports = {
  gerarFilaAlertasCriticosComando,
  consolidarTorreControleExecutiva360,
  dispararBriefingDiarioDiretoriaWhatsApp
};
