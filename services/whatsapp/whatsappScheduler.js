const { all, get, run } = require('../../db');
const { extractTenantId, safeJsonParse, mutateTenantState } = require('../../lib/serverContext');
const financialEngine = require('../financialEngine');
const { enviarRelatorioGrupo, enviarRelatorioAdministradores } = require('../reportGenerationService');
const proactiveAlertsService = require('../proactiveAlertsService');
const { getWppStatus, getWppClient } = require('./whatsappState');

// Cache em memória para evitar verificações repetitivas no mesmo minuto
const ultimoDiaEnvioPorTenant = new Map();
// Controle de tentativas quando offline/falha de envio: tenantKey -> { dia, tentativas, ultimaTentativa }
const tentativasFalhaPorTenant = new Map();

const MAX_TENTATIVAS_FALHA = 3;
const INTERVALO_MINIMO_RETRY_MS = 10 * 60 * 1000; // 10 minutos entre tentativas do mesmo dia

/**
 * Verifica se já houve envio registrado no dia para o tenant no SQLite (idempotência durável pós-restart)
 */
async function jaEnviouHoje(tenantKey, diaHoje) {
  // 1. Checa cache rápido em memória
  if (ultimoDiaEnvioPorTenant.get(tenantKey) === diaHoje) {
    return true;
  }

  // 2. Checa chave persistente no SQLite kv
  try {
    const key = `tenant:${tenantKey}:relatorio_diario_enviado:${diaHoje}`;
    const row = await get('SELECT value FROM kv WHERE key = ?', [key]);
    if (row && row.value) {
      ultimoDiaEnvioPorTenant.set(tenantKey, diaHoje);
      return true;
    }
  } catch (err) {
    console.warn(`[Agendador WhatsApp] Aviso ao checar idempotência no SQLite para ${tenantKey}:`, err.message);
  }

  return false;
}

/**
 * Grava o envio com sucesso de forma atômica e persistente no SQLite
 */
async function registrarEnvioSucesso(tenantKey, diaHoje, metadata = {}) {
  ultimoDiaEnvioPorTenant.set(tenantKey, diaHoje);
  tentativasFalhaPorTenant.delete(tenantKey);

  try {
    const key = `tenant:${tenantKey}:relatorio_diario_enviado:${diaHoje}`;
    const value = JSON.stringify({
      enviadoEm: new Date().toISOString(),
      diaISO: diaHoje,
      tenantKey,
      ...metadata
    });
    await run('INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)', [key, value]);
  } catch (err) {
    console.error(`[Agendador WhatsApp] Falha ao registrar persistência de envio para ${tenantKey}:`, err.message);
  }
}

/**
 * Ciclo determinístico de avaliação e disparo do relatório diário por tenant
 * Aceita options:
 * - dryRun: boolean (se true, calcula e simula sem disparar mensagens reais nem persistir)
 * - dataRef: string YYYY-MM-DD ou Date (para simulação ou testes com horário/data customizada)
 * - horaRef: string HH:mm (para forçar hora em testes)
 * - force: boolean (ignora checagem de horário para testes ou disparo manual)
 */
async function executarCicloDisparoRelatorioDiario(options = {}) {
  const { dryRun = false, dataRef = null, horaRef = null, force = false } = options;
  const agoraSP = financialEngine.obterAgoraSP(dataRef);
  const horaAtual = horaRef || agoraSP.horaBR;
  const diaHoje = agoraSP.dataISO;
  const isDiaUtil = agoraSP.diaSemana >= 1 && agoraSP.diaSemana <= 5;

  const resultados = [];

  try {
    // Coleta todos os tenants cadastrados no banco
    const rows = await all("SELECT key, value FROM kv WHERE key LIKE 'tenant:%:state' OR key = 'state'");
    const tenantEntries = (rows && rows.length > 0)
      ? rows.map(r => ({ key: extractTenantId(r.key), state: safeJsonParse(r.value) })).filter(e => e.state)
      : [];

    for (const entry of tenantEntries) {
      const tenantKey = entry.key;
      const tenantState = entry.state;
      if (!tenantState) continue;

      const cfg = tenantState.cfg || {};
      const horaConfig = (cfg.horaRelatorioDiario || process.env.HORA_RELATORIO_DIARIO || '07:30').trim();
      const autoAtivo = cfg.envioAutomaticoRelatorio !== false && process.env.ENVIO_AUTOMATICO_RELATORIO !== 'false';
      const apenasDiasUteis = cfg.relatorioApenasDiasUteis !== false && process.env.RELATORIO_APENAS_DIAS_UTEIS !== 'false';

      // 1. Respeito ao flag de envio automático
      if (!autoAtivo) {
        resultados.push({
          tenantKey,
          disparado: false,
          motivo: 'envio_automatico_desativado'
        });
        continue;
      }

      // 2. Respeito a dias úteis se configurado
      if (apenasDiasUteis && !isDiaUtil && !force) {
        resultados.push({
          tenantKey,
          disparado: false,
          motivo: 'fora_de_dia_util'
        });
        continue;
      }

      // 3. Checagem de horário configurado
      const horarioAtingido = force || (horaAtual === horaConfig);
      if (!horarioAtingido) {
        resultados.push({
          tenantKey,
          disparado: false,
          motivo: 'horario_nao_atingido',
          horaAtual,
          horaConfig
        });
        continue;
      }

      // 4. Idempotência durável: nunca enviar mais de uma vez no mesmo dia
      const enviado = await jaEnviouHoje(tenantKey, diaHoje);
      if (enviado && !force) {
        resultados.push({
          tenantKey,
          disparado: false,
          motivo: 'ja_enviado_hoje',
          diaHoje
        });
        continue;
      }

      // 5. Prevenção de concorrência no tenant
      if (tenantState._enviandoRelatorio) {
        resultados.push({
          tenantKey,
          disparado: false,
          motivo: 'em_processamento'
        });
        continue;
      }

      // 6. Modo Dry-Run (não faz disparos reais nem grava persistência)
      if (dryRun) {
        resultados.push({
          tenantKey,
          disparado: true,
          dryRun: true,
          horaConfig,
          diaHoje
        });
        continue;
      }

      // 7. Checagem de disponibilidade do WhatsApp sem derrubar o servidor
      const isWppDesligadoFlag = process.env.DISABLE_WHATSAPP === 'true' || process.env.DISABLE_INTEGRATIONS === 'true';
      if (isWppDesligadoFlag) {
        const infoSilencioso = tentativasFalhaPorTenant.get(tenantKey) || {};
        if (infoSilencioso.diaLogadoFlag !== diaHoje) {
          console.log(`[Agendador WhatsApp] Disparo diário ignorado para ${tenantKey}: WhatsApp desabilitado por variável de ambiente.`);
          tentativasFalhaPorTenant.set(tenantKey, { ...infoSilencioso, diaLogadoFlag: diaHoje });
        }
        resultados.push({
          tenantKey,
          disparado: false,
          motivo: 'whatsapp_desabilitado_por_flag'
        });
        continue;
      }

      const wppStatus = getWppStatus();
      const wppClient = getWppClient();
      const wppPronto = Boolean(wppClient && wppStatus && wppStatus.status === 'pronto');

      if (!wppPronto) {
        const infoFalha = tentativasFalhaPorTenant.get(tenantKey) || { dia: diaHoje, tentativas: 0, ultimaTentativa: 0 };
        if (infoFalha.dia !== diaHoje) {
          infoFalha.dia = diaHoje;
          infoFalha.tentativas = 0;
        }

        const agoraMs = Date.now();
        if (infoFalha.tentativas >= MAX_TENTATIVAS_FALHA) {
          console.warn(`[Agendador WhatsApp] WhatsApp desconectado. Limite de ${MAX_TENTATIVAS_FALHA} tentativas atingido para tenant ${tenantKey} hoje. Abortando.`);
          resultados.push({
            tenantKey,
            disparado: false,
            motivo: 'whatsapp_desconectado_limite_atingido',
            tentativas: infoFalha.tentativas
          });
          continue;
        }

        if (agoraMs - infoFalha.ultimaTentativa < INTERVALO_MINIMO_RETRY_MS && !force) {
          resultados.push({
            tenantKey,
            disparado: false,
            motivo: 'whatsapp_desconectado_aguardando_retry',
            tentativas: infoFalha.tentativas
          });
          continue;
        }

        infoFalha.tentativas += 1;
        infoFalha.ultimaTentativa = agoraMs;
        tentativasFalhaPorTenant.set(tenantKey, infoFalha);

        console.warn(`[Agendador WhatsApp] WhatsApp offline/não inicializado (status: ${wppStatus?.status || 'desconhecido'}). Tentativa ${infoFalha.tentativas}/${MAX_TENTATIVAS_FALHA} para ${tenantKey}.`);
        resultados.push({
          tenantKey,
          disparado: false,
          motivo: 'whatsapp_desconectado',
          status: wppStatus?.status,
          tentativa: infoFalha.tentativas
        });
        continue;
      }

      // 8. Execução do envio seguro
      tenantState._enviandoRelatorio = true;
      try {
        console.log(`⏰ [Agendador WhatsApp] Horário matinal (${horaConfig}) atingido. Disparando relatório para tenant ${tenantKey}...`);

        let resAdm = { success: false };
        let resOp = { success: false };

        try {
          resAdm = await enviarRelatorioGrupo('admin', { tenantKey, state: tenantState });
        } catch (eAdm) {
          console.warn(`[Agendador WhatsApp] Falha ao enviar para grupo admin de ${tenantKey}:`, eAdm.message);
        }

        try {
          resOp = await enviarRelatorioGrupo('operacao', { tenantKey, state: tenantState });
        } catch (eOp) {
          console.warn(`[Agendador WhatsApp] Falha ao enviar para grupo operacao de ${tenantKey}:`, eOp.message);
        }

        // Se ambos os grupos falharem ou não estiverem configurados, tenta o fallback para os administradores diretos
        let resFallback = null;
        if (!resAdm.success && !resOp.success) {
          console.log(`⏰ [${tenantKey}] Grupos não configurados ou com falha. Acionando fallback direto para administradores...`);
          try {
            resFallback = await enviarRelatorioAdministradores(null, { tenantKey, state: tenantState });
          } catch (eFallback) {
            console.warn(`[Agendador WhatsApp] Falha no envio fallback de ${tenantKey}:`, eFallback.message);
          }
        }

        const sucessoGeral = Boolean(resAdm.success || resOp.success || (resFallback && resFallback.success));

        if (sucessoGeral) {
          await registrarEnvioSucesso(tenantKey, diaHoje, {
            resAdmSuccess: resAdm.success,
            resOpSuccess: resOp.success,
            fallbackSuccess: resFallback?.success
          });
          resultados.push({
            tenantKey,
            disparado: true,
            sucesso: true,
            resAdm,
            resOp,
            resFallback
          });
        } else {
          console.warn(`[Agendador WhatsApp] Nenhuma mensagem enviada com sucesso para ${tenantKey}. Não registrando envio como concluído.`);
          resultados.push({
            tenantKey,
            disparado: true,
            sucesso: false,
            resAdm,
            resOp,
            resFallback
          });
        }
      } catch (errDisparo) {
        console.error(`[Agendador WhatsApp] Erro inesperado ao processar disparo de ${tenantKey}:`, errDisparo.message);
        resultados.push({
          tenantKey,
          disparado: false,
          motivo: 'erro_execucao',
          error: errDisparo.message
        });
      } finally {
        tenantState._enviandoRelatorio = false;
      }
    }
  } catch (err) {
    console.error('[Agendador WhatsApp] Erro no ciclo de avaliação geral:', err.message);
  }

  return resultados;
}

let timerRelatorio = null;
let timerAlertasProativos = null;

function iniciarAgendadorAlertasProativos() {
  if (process.env.DISABLE_INTEGRATIONS === 'true' || process.env.DISABLE_WHATSAPP === 'true') {
    console.log('[Agendador Alertas Proativos] Desativado em modo de teste / variáveis de ambiente.');
    return;
  }

  if (timerAlertasProativos) return;
  console.log('[Agendador Alertas Proativos] Rotina periódica de SLA de orçamentos e boxes inicializada.');
  timerAlertasProativos = setInterval(async () => {
    try {
      const rows = await all("SELECT key, value FROM kv WHERE key LIKE 'tenant:%:state' OR key = 'state'");
      const tenantEntries = (rows && rows.length > 0)
        ? rows.map(r => ({ key: extractTenantId(r.key), state: safeJsonParse(r.value) })).filter(e => e.state)
        : [];

      for (const entry of tenantEntries) {
        const tenantKey = entry.key;
        const tenantState = entry.state;
        if (!tenantState) continue;

        try {
          await proactiveAlertsService.dispararAlertasProativos({
            state: tenantState,
            tenantId: tenantKey,
            force: false
          });
        } catch (errTenant) {
          console.warn(`[Agendador Alertas Proativos] Erro ao avaliar tenant ${tenantKey}:`, errTenant.message);
        }
      }
    } catch (err) {
      console.error('[Agendador Alertas Proativos] Erro no ciclo de avaliação:', err.message);
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

  // Inicializa também o agendador de alertas proativos de SLA
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


