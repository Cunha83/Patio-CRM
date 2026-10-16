const { all } = require('../../db');
const { extractTenantId, safeJsonParse } = require('../../lib/serverContext');
const financialEngine = require('../financialEngine');
const { enviarRelatorioGrupo, enviarRelatorioAdministradores } = require('../reportGenerationService');

const ultimoDiaEnvioPorTenant = new Map();

function iniciarAgendadorRelatorioDiario() {
  if (process.env.DISABLE_INTEGRATIONS === 'true') {
    console.log('[Agendador WhatsApp] DISABLE_INTEGRATIONS=true: Agendador inativo em modo de teste.');
    return;
  }

  console.log('[Agendador WhatsApp] Rotina matinal diária multi-tenant inicializada.');
  setInterval(async () => {
    try {
      const agoraSP = financialEngine.obterAgoraSP();
      const horaAtual = agoraSP.horaBR;
      const diaHoje = agoraSP.dataISO;
      const isDiaUtil = agoraSP.diaSemana >= 1 && agoraSP.diaSemana <= 5;

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

        if (!autoAtivo) continue;
        if (apenasDiasUteis && !isDiaUtil) continue;
        if (tenantState._enviandoRelatorio) continue;

        const ultimoEnvio = ultimoDiaEnvioPorTenant.get(tenantKey);
        if (horaAtual === horaConfig && ultimoEnvio !== diaHoje) {
          tenantState._enviandoRelatorio = true;
          ultimoDiaEnvioPorTenant.set(tenantKey, diaHoje);
          try {
            console.log(`⏰ [Agendador WhatsApp] Horário de disparo matinal (${horaConfig}) atingido para tenant ${tenantKey}.`);

            const resAdm = await enviarRelatorioGrupo('admin', { tenantKey, state: tenantState });
            console.log(`⏰ [${tenantKey}] Resultado disparo admin:`, JSON.stringify(resAdm));

            const resOp = await enviarRelatorioGrupo('operacao', { tenantKey, state: tenantState });
            console.log(`⏰ [${tenantKey}] Resultado disparo operacao:`, JSON.stringify(resOp));

            if (!resAdm.success && !resOp.success) {
              console.log(`⏰ [${tenantKey}] Grupos não configurados ou com falha. Acionando fallback direto para administradores...`);
              await enviarRelatorioAdministradores(null, { tenantKey, state: tenantState });
            }
          } finally {
            tenantState._enviandoRelatorio = false;
          }
        }
      }
    } catch (err) {
      console.error('[Agendador WhatsApp] Erro no agendador:', err);
    }
  }, 30000).unref();
}

module.exports = {
  iniciarAgendadorRelatorioDiario
};
