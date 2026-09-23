'use strict';

const { obterAgoraSP } = require('./financialEngine');

// Memória de cooldown em runtime: dedupeKey -> timestampMs
const cooldownRegistry = new Map();

/**
 * Avalia se um evento operacional deve disparar notificação externa (ex: WhatsApp)
 */
function deveNotificar({
  tenantId,
  evento,
  tenantCfg = {},
  agora = new Date(),
  registroEnvios = cooldownRegistry
}) {
  if (!tenantId || !evento) {
    return { enviar: false, motivo: 'dados_insuficientes' };
  }

  const notifCfg = tenantCfg.notificacoesOperacionais || {};

  // 1. Verifica se as notificações estão ativadas para este canal/tenant
  if (notifCfg.ativa === false || notifCfg.whatsapp === false) {
    return { enviar: false, motivo: 'notificacoes_desativadas' };
  }

  // 2. Verifica severidade mínima configurada
  const niveisPermitidos = Array.isArray(notifCfg.niveis)
    ? notifCfg.niveis
    : ['critico', 'alto'];

  if (!niveisPermitidos.includes(evento.severidade)) {
    return { enviar: false, motivo: 'severidade_nao_elegivel', severidade: evento.severidade };
  }

  // 3. Janela de Horário Operacional
  const horarioInicio = notifCfg.horarioInicio || '07:00';
  const horarioFim = notifCfg.horarioFim || '19:00';

  const agoraSP = obterAgoraSP(agora);
  const horaAtual = agoraSP.horaBR;

  if (horaAtual < horarioInicio || horaAtual > horarioFim) {
    return {
      enviar: false,
      motivo: 'fora_do_horario_operacional',
      horaAtual,
      janelaPermitida: `${horarioInicio} às ${horarioFim}`
    };
  }

  // 4. Cooldown anti-spam por dedupeKey
  const cooldownMinutos = Number(notifCfg.cooldownMinutos) || 60;
  const cooldownMs = cooldownMinutos * 60 * 1000;
  const agoraMs = agora instanceof Date ? agora.getTime() : new Date(agora).getTime();

  const chaveEnvio = `${tenantId}:${evento.dedupeKey || evento.id}`;
  const ultimoEnvioMs = registroEnvios.get(chaveEnvio) || 0;

  if (agoraMs - ultimoEnvioMs < cooldownMs) {
    const minutosRestantes = Math.ceil((cooldownMs - (agoraMs - ultimoEnvioMs)) / (60 * 1000));
    return {
      enviar: false,
      motivo: 'cooldown_ativo',
      minutosRestantes
    };
  }

  return {
    enviar: true,
    canal: 'whatsapp',
    motivo: 'severidade_e_horario_validos'
  };
}

/**
 * Registra o envio bem-sucedido de uma notificação para controle de cooldown
 */
function registrarEnvio({
  tenantId,
  evento,
  agora = new Date(),
  registroEnvios = cooldownRegistry
}) {
  const chaveEnvio = `${tenantId}:${evento.dedupeKey || evento.id}`;
  const agoraMs = agora instanceof Date ? agora.getTime() : new Date(agora).getTime();
  registroEnvios.set(chaveEnvio, agoraMs);
}

/**
 * Limpa o histórico de envios (útil para testes unitários e reinicializações)
 */
function limparHistoricoEnvios(registroEnvios = cooldownRegistry) {
  registroEnvios.clear();
}

module.exports = {
  deveNotificar,
  registrarEnvio,
  limparHistoricoEnvios,
  cooldownRegistry
};
