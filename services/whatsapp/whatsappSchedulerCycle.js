const { all, get, run } = require('../../db');
const { extractTenantId, safeJsonParse } = require('../../lib/serverContext');
const financialEngine = require('../financialEngine');
const { enviarRelatorioGrupo, enviarRelatorioAdministradores } = require('../reportGenerationService');
const { getWppStatus, getWppClient } = require('./whatsappState');

// Cache em memória para evitar verificações repetitivas no mesmo minuto
const ultimoDiaEnvioPorTenant = new Map();
// Controle de tentativas quando offline/falha de envio: tenantKey -> { dia, tentativas, ultimaTentativa }
const tentativasFalhaPorTenant = new Map();

const MAX_TENTATIVAS_FALHA = 3;
const INTERVALO_MINIMO_RETRY_MS = 10 * 60 * 1000;

async function jaEnviouHoje(tenantKey, diaHoje) {
  if (ultimoDiaEnvioPorTenant.get(tenantKey) === diaHoje) {
    return true;
  }

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

async function executarCicloDisparoRelatorioDiario(options = {}) {
  const { dryRun = false, dataRef = null, horaRef = null, force = false } = options;
  const agoraSP = financialEngine.obterAgoraSP(dataRef);
  const horaAtual = horaRef || agoraSP.horaBR;
  const diaHoje = agoraSP.dataISO;
  const isDiaUtil = agoraSP.diaSemana >= 1 && agoraSP.diaSemana <= 5;

  const resultados = [];

  try {
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

      if (!autoAtivo) {
        resultados.push({
          tenantKey,
          disparado: false,
          motivo: 'envio_automatico_desativado'
        });
        continue;
      }

      if (apenasDiasUteis && !isDiaUtil && !force) {
        resultados.push({
          tenantKey,
          disparado: false,
          motivo: 'fora_de_dia_util'
        });
        continue;
      }

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

      if (tenantState._enviandoRelatorio) {
        resultados.push({
          tenantKey,
          disparado: false,
          motivo: 'em_processamento'
        });
        continue;
      }

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

module.exports = {
  ultimoDiaEnvioPorTenant,
  tentativasFalhaPorTenant,
  jaEnviouHoje,
  registrarEnvioSucesso,
  executarCicloDisparoRelatorioDiario
};
