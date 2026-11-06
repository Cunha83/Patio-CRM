'use strict';

/**
 * Pátio CRM — Agendador de Relatório Matinal do WhatsApp e Alertas Proativos
 * Fachada Modular (< 120 linhas).
 *
 * Submódulo:
 * - services/whatsapp/whatsappSchedulerCycle.js: Ciclo de avaliação e envio diário
 */

const proactiveAlertsService = require('../proactiveAlertsService');
const {
  ultimoDiaEnvioPorTenant,
  tentativasFalhaPorTenant,
  jaEnviouHoje,
  registrarEnvioSucesso,
  executarCicloDisparoRelatorioDiario
} = require('./whatsappSchedulerCycle');

let timerRelatorio = null;
let timerAlertasProativos = null;

function iniciarAgendadorAlertasProativos() {
  if (process.env.DISABLE_INTEGRATIONS === 'true' || process.env.DISABLE_WHATSAPP === 'true') {
    return;
  }
  if (timerAlertasProativos) return;
  console.log('[Agendador Proativo] Monitor de SLA e gargalos de pátio inicializado (a cada 2 min).');
  timerAlertasProativos = setInterval(async () => {
    try {
      if (typeof proactiveAlertsService.verificarAlertasProativosGeral === 'function') {
        await proactiveAlertsService.verificarAlertasProativosGeral();
      }
    } catch (err) {
      console.warn('[Agendador Proativo] Falha no ciclo de alerta proativo:', err.message);
    }
  }, 120000);
  if (timerAlertasProativos.unref) timerAlertasProativos.unref();
}

function pararAgendadorAlertasProativos() {
  if (timerAlertasProativos) {
    clearInterval(timerAlertasProativos);
    timerAlertasProativos = null;
  }
}

function iniciarAgendadorRelatorioDiario() {
  if (process.env.DISABLE_INTEGRATIONS === 'true' || process.env.DISABLE_WHATSAPP === 'true') {
    console.log('[Agendador WhatsApp] DISABLE_INTEGRATIONS=true: Agendador inativo em modo de teste.');
    return;
  }

  iniciarAgendadorAlertasProativos();

  console.log('[Agendador WhatsApp] Rotina matinal diária multi-tenant inicializada.');
  if (timerRelatorio) return;
  timerRelatorio = setInterval(async () => {
    try {
      await executarCicloDisparoRelatorioDiario();
    } catch (err) {
      console.error('[Agendador WhatsApp] Erro na execução periódica:', err.message);
    }
  }, 30000);
  if (timerRelatorio.unref) timerRelatorio.unref();
}

function pararAgendadorRelatorioDiario() {
  if (timerRelatorio) {
    clearInterval(timerRelatorio);
    timerRelatorio = null;
  }
  pararAgendadorAlertasProativos();
}

module.exports = {
  iniciarAgendadorRelatorioDiario,
  pararAgendadorRelatorioDiario,
  iniciarAgendadorAlertasProativos,
  pararAgendadorAlertasProativos,
  executarCicloDisparoRelatorioDiario,
  jaEnviouHoje,
  registrarEnvioSucesso,
  _tentativasFalhaPorTenant: tentativasFalhaPorTenant,
  _ultimoDiaEnvioPorTenant: ultimoDiaEnvioPorTenant
};
