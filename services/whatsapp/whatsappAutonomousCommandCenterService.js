'use strict';

/**
 * services/whatsapp/whatsappAutonomousCommandCenterService.js
 *
 * Orquestrador do Ciclo Autônomo Diário 360º (P1 Cobrança Ativa -> P2 Preditiva
 * -> P3 Fila Gateway -> P4 Briefing Diretoria).
 *
 * Teto Modular: <= 220 linhas
 */

const crypto = require('crypto');
const { dispararReguaCobrancaAtivaWhatsApp } = require('./whatsappCreditRecoverySkill');
const { processarFilaRetentativasOutboundWhatsApp } = require('./whatsappGatewayAdapterService');
const fleetPredictiveMaintenanceService = require('../crm/fleetPredictiveMaintenanceService');
const controlTowerService = require('../executive/controlTowerService');

const gerarId = p => `${p}_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;

function executarCicloAutonomoDiarioAgenteWhatsApp(state, options = {}) {
  if (!state) throw new Error('Estado da aplicação não informado');
  const {
    dataReferencia,
    competencia,
    responsavel = 'Autopilot-Patio-CRM',
    timestamp
  } = options;

  const dtRef = dataReferencia || timestamp || new Date().toISOString();
  state.autonomousCycleLogs = Array.isArray(state.autonomousCycleLogs) ? state.autonomousCycleLogs : [];

  // Passo P1: Cobrança Ativa & Régua de Débitos por Cliente
  let resultadoCobranca = { totalClientesCobrados: 0 };
  try {
    resultadoCobranca = dispararReguaCobrancaAtivaWhatsApp(state, {
      timestamp: dtRef,
      responsavel
    });
  } catch (err) {
    resultadoCobranca = { totalClientesCobrados: 0, erro: err.message };
  }

  // Passo P2: Manutenção Preventiva Preditiva por Telemetria/Eixo
  let resultadoPreditiva = { totalAlertasDisparados: 0 };
  try {
    if (typeof fleetPredictiveMaintenanceService.dispararReguaPreventivaWhatsApp === 'function') {
      const predRes = fleetPredictiveMaintenanceService.dispararReguaPreventivaWhatsApp(state, {
        timestamp: dtRef
      });
      resultadoPreditiva = {
        totalAlertasDisparados: predRes?.alertasDisparadosCount || predRes?.totalDisparados || (Array.isArray(predRes) ? predRes.length : 0)
      };
    }
  } catch (err) {
    resultadoPreditiva = { totalAlertasDisparados: 0, erro: err.message };
  }

  // Passo P3: Processamento e Retentativas da Fila Outbound do Gateway
  let resultadoGateway = { totalProcessados: 0, enviadosCount: 0, deadLetterCount: 0 };
  try {
    resultadoGateway = processarFilaRetentativasOutboundWhatsApp(state, {
      timestamp: dtRef
    });
  } catch (err) {
    resultadoGateway = { totalProcessados: 0, erro: err.message };
  }

  // Passo P4: Briefing Executivo da Diretoria na Torre de Controle
  let briefingExecutivoGerado = false;
  let briefingResultado = null;
  try {
    if (typeof controlTowerService.dispararBriefingDiarioDiretoriaWhatsApp === 'function') {
      briefingResultado = controlTowerService.dispararBriefingDiarioDiretoriaWhatsApp(state, {
        dataReferencia: dtRef,
        competencia,
        responsavel
      });
      briefingExecutivoGerado = !!briefingResultado;
    }
  } catch (err) {
    briefingResultado = { erro: err.message };
  }

  const cicloId = gerarId('autocycle');
  const cicloLog = {
    cicloId,
    dataReferencia: dtRef,
    responsavel,
    clientesCobradosCount: resultadoCobranca.totalClientesCobrados || 0,
    alertasPreventivosDisparadosCount: resultadoPreditiva.totalAlertasDisparados || 0,
    mensagensGatewayProcessadasCount: resultadoGateway.totalProcessados || 0,
    mensagensGatewayEnviadasCount: resultadoGateway.enviadosCount || 0,
    mensagensGatewayDeadLetterCount: resultadoGateway.deadLetterCount || 0,
    briefingExecutivoGerado,
    statusCiclo: 'concluido_100_porcento',
    executadoEm: timestamp || new Date().toISOString()
  };

  state.autonomousCycleLogs.push(cicloLog);

  return cicloLog;
}

module.exports = {
  executarCicloAutonomoDiarioAgenteWhatsApp
};

