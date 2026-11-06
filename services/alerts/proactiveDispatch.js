'use strict';

const {
  obterConfigAlertas,
  detectarOrcamentosParados,
  detectarGargalosBox
} = require('./proactiveDetection');

const historicoDisparos = new Map();

function limparHistoricoCooldown() {
  historicoDisparos.clear();
}

function verificarCooldown({ tipo, chave, cooldownMinutos = 240, agora = null }) {
  const tsAgora = (agora instanceof Date ? agora.getTime() : (agora || Date.now()));
  const chaveCompleta = `${tipo}:${chave}`;
  const ultimoEnvio = historicoDisparos.get(chaveCompleta);

  if (!ultimoEnvio) {
    return true;
  }

  const janelaMs = Number(cooldownMinutos) * 60 * 1000;
  const tempoDecorridoMs = tsAgora - ultimoEnvio;

  return tempoDecorridoMs >= janelaMs;
}

function registrarDisparo({ tipo, chave, agora = null }) {
  const tsAgora = (agora instanceof Date ? agora.getTime() : (agora || Date.now()));
  const chaveCompleta = `${tipo}:${chave}`;
  historicoDisparos.set(chaveCompleta, tsAgora);
}

function formatarValorMoeda(num) {
  return Number(num || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatarMensagemOrcamentoParado({ alerta, nomeAssistente = 'Verônica' }) {
  const avisoBox = alerta.ocupaBox
    ? `🚨 *ATENÇÃO CRÍTICA:* O veículo está ocupando o *${alerta.boxNome || 'Box'}*!\n`
    : '';

  return `🤖 *${nomeAssistente} — Alerta de SLA: Orçamento Parado*\n` +
    `════════════════════════════\n` +
    `📋 *Orçamento:* ${alerta.codigo} (OS #${alerta.osNum || alerta.osId})\n` +
    `🚚 *Veículo / Placa:* ${alerta.placa}\n` +
    `🏢 *Cliente / Frota:* ${alerta.clienteNome}\n` +
    `💰 *Valor Total:* ${formatarValorMoeda(alerta.valorTotal)}\n` +
    `⏳ *Tempo de Espera:* *${alerta.horasParado}h* (SLA: ${alerta.slaHoras}h)\n` +
    avisoBox +
    `💡 *Ação Recomendada:* ${alerta.recomendacao}\n` +
    `════════════════════════════`;
}

function formatarMensagemGargaloBox({ alerta, nomeAssistente = 'Verônica' }) {
  const mecStatus = alerta.temMecanicoAtivo
    ? `👨‍🔧 *Mecânico Ativo:* ${alerta.mecanicoNome}`
    : `⚠️ *Mecânico:* Sem apontamento ativo há ${alerta.horasSemApontamento}h`;

  return `🤖 *${nomeAssistente} — Alerta Operacional: Gargalo no Box*\n` +
    `════════════════════════════\n` +
    `🔧 *Box:* *${alerta.boxNome}*\n` +
    `🚚 *Veículo / Placa:* ${alerta.placa}\n` +
    `📋 *Ordem de Serviço:* #${alerta.osNum || alerta.osId} (${alerta.clienteNome})\n` +
    `⏱️ *Tempo no Box:* *${alerta.horasNoBox}h* (SLA: ${alerta.slaHoras}h)\n` +
    `📊 *Estágio Atual:* ${alerta.statusOS}\n` +
    `${mecStatus}\n` +
    `⚠️ *Diagnóstico:* ${alerta.motivo}\n` +
    `💡 *Ação Recomendada:* ${alerta.recomendacao}\n` +
    `════════════════════════════`;
}

function avaliarAlertasProativos({ state = {}, tenantId = 'default', agoraDate = null }) {
  const cfg = obterConfigAlertas(state);
  const orcamentosParados = detectarOrcamentosParados({ state, tenantId, agoraDate });
  const gargalosBox = detectarGargalosBox({ state, tenantId, agoraDate });

  return {
    sucesso: true,
    tenantId,
    config: cfg,
    resumo: {
      totalOrcamentosParados: orcamentosParados.length,
      totalGargalosBox: gargalosBox.length,
      totalAlertas: orcamentosParados.length + gargalosBox.length
    },
    orcamentosParados,
    gargalosBox
  };
}

async function dispararAlertasProativos({
  state = {},
  tenantId = 'default',
  force = false,
  wppClientOverride = null,
  agoraDate = null
}) {
  const { getWppClient, getWppStatus } = require('../whatsapp/whatsappState');

  const cfg = state.cfg || state.config || {};
  const cfgAlertas = obterConfigAlertas(state);

  if (!cfgAlertas.alertasProativosAtivos && !force) {
    return {
      success: false,
      motivo: 'Alertas proativos desativados nas configurações.',
      enviados: []
    };
  }

  const avaliacao = avaliarAlertasProativos({ state, tenantId, agoraDate });
  const { orcamentosParados, gargalosBox } = avaliacao;

  const totalPendentes = orcamentosParados.length + gargalosBox.length;
  if (totalPendentes === 0) {
    return {
      success: true,
      mensagem: 'Nenhum orçamento parado ou gargalo de box detectado no momento.',
      totalDetectados: 0,
      enviados: []
    };
  }

  const targetChatId = cfg.grupoOperacaoId || cfg.grupoAdminId;
  const adminFones = Array.isArray(cfg.adminFones) ? cfg.adminFones : [];

  const isMockEnv = process.env.DISABLE_INTEGRATIONS === 'true' ||
                    process.env.DISABLE_WHATSAPP === 'true' ||
                    process.env.NODE_ENV === 'test';

  const wppClient = wppClientOverride || getWppClient();
  const wppStatus = getWppStatus ? getWppStatus() : { status: 'desconectado' };

  if (!isMockEnv && (!wppClient || wppStatus.status !== 'pronto')) {
    return {
      success: false,
      error: `WhatsApp não está conectado (status: ${wppStatus.status}). Conecte o WhatsApp no painel.`,
      avaliacao
    };
  }

  const enviados = [];
  const ignoradosCooldown = [];
  const falhas = [];

  for (const item of orcamentosParados) {
    const liberadoCooldown = force || verificarCooldown({
      tipo: 'orcamento',
      chave: item.chaveCooldown,
      cooldownMinutos: cfgAlertas.cooldownAlertasMinutos,
      agora: agoraDate
    });

    if (!liberadoCooldown) {
      ignoradosCooldown.push({ tipo: 'orcamento', id: item.id, chave: item.chaveCooldown });
      continue;
    }

    const mensagem = formatarMensagemOrcamentoParado({
      alerta: item,
      nomeAssistente: cfgAlertas.displayName
    });

    try {
      if (isMockEnv || !wppClient) {
        registrarDisparo({ tipo: 'orcamento', chave: item.chaveCooldown, agora: agoraDate });
        enviados.push({
          tipo: 'orcamento',
          id: item.id,
          codigo: item.codigo,
          mock: true,
          destinatario: targetChatId || 'admin_mock',
          texto: mensagem
        });
      } else {
        if (targetChatId) {
          await wppClient.sendMessage(targetChatId, mensagem, { waitUntilMsgSent: true });
        } else if (adminFones.length > 0) {
          for (const fone of adminFones) {
            const clean = String(fone).replace(/\D/g, '');
            if (clean) {
              const foneChat = `${clean.startsWith('55') ? clean : '55' + clean}@c.us`;
              await wppClient.sendMessage(foneChat, mensagem, { waitUntilMsgSent: true });
            }
          }
        }
        registrarDisparo({ tipo: 'orcamento', chave: item.chaveCooldown, agora: agoraDate });
        enviados.push({
          tipo: 'orcamento',
          id: item.id,
          codigo: item.codigo,
          destinatario: targetChatId || 'adminFones',
          texto: mensagem
        });
      }
    } catch (errEnvio) {
      console.error(`[Alertas Proativos] Falha ao enviar alerta de orçamento ${item.codigo}:`, errEnvio.message);
      falhas.push({ tipo: 'orcamento', id: item.id, erro: errEnvio.message });
    }
  }

  for (const item of gargalosBox) {
    const liberadoCooldown = force || verificarCooldown({
      tipo: 'box',
      chave: item.chaveCooldown,
      cooldownMinutos: cfgAlertas.cooldownAlertasMinutos,
      agora: agoraDate
    });

    if (!liberadoCooldown) {
      ignoradosCooldown.push({ tipo: 'box', boxId: item.boxId, chave: item.chaveCooldown });
      continue;
    }

    const mensagem = formatarMensagemGargaloBox({
      alerta: item,
      nomeAssistente: cfgAlertas.displayName
    });

    try {
      if (isMockEnv || !wppClient) {
        registrarDisparo({ tipo: 'box', chave: item.chaveCooldown, agora: agoraDate });
        enviados.push({
          tipo: 'gargalo_box',
          boxId: item.boxId,
          boxNome: item.boxNome,
          mock: true,
          destinatario: targetChatId || 'admin_mock',
          texto: mensagem
        });
      } else {
        if (targetChatId) {
          await wppClient.sendMessage(targetChatId, mensagem, { waitUntilMsgSent: true });
        } else if (adminFones.length > 0) {
          for (const fone of adminFones) {
            const clean = String(fone).replace(/\D/g, '');
            if (clean) {
              const foneChat = `${clean.startsWith('55') ? clean : '55' + clean}@c.us`;
              await wppClient.sendMessage(foneChat, mensagem, { waitUntilMsgSent: true });
            }
          }
        }
        registrarDisparo({ tipo: 'box', chave: item.chaveCooldown, agora: agoraDate });
        enviados.push({
          tipo: 'gargalo_box',
          boxId: item.boxId,
          boxNome: item.boxNome,
          destinatario: targetChatId || 'adminFones',
          texto: mensagem
        });
      }
    } catch (errEnvio) {
      console.error(`[Alertas Proativos] Falha ao enviar alerta do box ${item.boxNome}:`, errEnvio.message);
      falhas.push({ tipo: 'gargalo_box', boxId: item.boxId, erro: errEnvio.message });
    }
  }

  return {
    success: true,
    totalDetectados: totalPendentes,
    totalEnviados: enviados.length,
    totalIgnoradosCooldown: ignoradosCooldown.length,
    enviados,
    ignoradosCooldown,
    falhas
  };
}

module.exports = {
  historicoDisparos,
  limparHistoricoCooldown,
  verificarCooldown,
  registrarDisparo,
  formatarValorMoeda,
  formatarMensagemOrcamentoParado,
  formatarMensagemGargaloBox,
  avaliarAlertasProativos,
  dispararAlertasProativos
};

