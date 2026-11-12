'use strict';

/**
 * services/whatsapp/whatsappReceptionPatioSkill.js
 *
 * Skill de Recepção Interativa de Pátio no WhatsApp:
 * - Triagem 360º de Veículo por Placa na Portaria
 * - Fast Check-in via WhatsApp com Alocação de Box e Trava de Crédito por Cliente
 * - Solicitação de Link Tokenizado de Aprovação Frotista
 * - Consultas de Status de Box, Gargalos, Preventivas e Prontuário Técnico
 *
 * Teto Modular: <= 260 linhas
 */

const crypto = require('crypto');
const smartGatehouseCheckinService = require('../patio/smartGatehouseCheckinService');
const externalFleetApprovalService = require('../quotation/externalFleetApprovalService');

function gerarId(prefix) {
  return prefix + '_' + Date.now() + '_' + crypto.randomBytes(3).toString('hex');
}

function extrairPlaca(texto = '', placaParam = '') {
  if (placaParam) {
    return String(placaParam).replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  }
  const m = String(texto).match(/[A-Za-z]{3}[- ]?[0-9][A-Za-z0-9][0-9]{2}/i);
  return m ? m[0].replace(/[^A-Za-z0-9]/g, '').toUpperCase() : null;
}

function buscarOSAtivaPlaca(state, placa) {
  return (state.os || []).find(o =>
    o.placa && o.placa.replace(/[^A-Za-z0-9]/g, '').toUpperCase() === placa &&
    o.st !== 'finalizada' && o.st !== 'entregue'
  );
}

function montarTextoTriagem(triagem, placa) {
  const cred = triagem.situacaoCreditoCliente;
  const credTxt = cred.statusCredito === 'bloqueado'
    ? `🚨 *CRÉDITO BLOQUEADO* (${cred.motivoBloqueio})`
    : (cred.statusCredito === 'atencao' ? '⚠️ *ATENÇÃO*' : '🟢 *REGULAR*');
  const boxSugerido = triagem.boxLivreRecomendado ? `${triagem.boxLivreRecomendado.nome}` : 'Nenhum livre';
  return `🔍 *Triagem 360º Portaria — Placa ${placa}:*\n` +
    `• *Cliente:* ${triagem.clienteNome || 'Cliente Frotista'}\n• *Crédito:* ${credTxt}\n` +
    `• *Garantias Ativas:* ${triagem.garantiasAtivas.length} componente(s)\n` +
    `• *Preventivas Pendentes:* ${triagem.alertasPreventivosPlaca.length} alerta(s)\n` +
    `• *Demanda Reprimida:* ${triagem.oportunidadesDemandaReprimida.length} item(ns) (R$ ${triagem.receitaRecuperavelDemandaReprimida.toFixed(2)})\n` +
    `• *Box Sugerido:* ${boxSugerido}\nEnvie *fazer checkin* para confirmar entrada e alocação.`;
}

function executarSkillRecepcaoInterativaWhatsApp(state, payload = {}) {
  state.receptionQueue = Array.isArray(state.receptionQueue) ? state.receptionQueue : [];
  state.os = Array.isArray(state.os) ? state.os : [];
  state.patioBoxes = Array.isArray(state.patioBoxes) ? state.patioBoxes : [];
  state.patioBottlenecks = Array.isArray(state.patioBottlenecks) ? state.patioBottlenecks : [];

  const placa = extrairPlaca(payload.mensagem, payload.placa);
  const msg = String(payload.mensagem || '').toLowerCase();
  const acao = payload.acaoRecepcao || '';

  // 1. Triagem 360º de Portaria
  if (acao === 'triagem_360' || /triagem portaria|chegada placa|triagem 360/i.test(msg)) {
    if (!placa) return { skill: 'SKILL_RECEPCAO_PATIO', acaoExecutada: 'solicitar_placa', respostaTextoWhatsApp: 'Por favor, informe a placa do veículo para a Triagem 360º.', dadosOperacionais: null };
    const triagem = smartGatehouseCheckinService.realizarTriagemPortariaPorPlaca(state, {
      placa, clienteId: payload.clienteId, clienteNome: payload.clienteNome,
      kmEntrada: payload.kmEntrada, pesagemEixosKg: payload.pesagemEixosKg, dataReferencia: payload.timestamp
    });

    if (triagem.clienteId && (!triagem.clienteNome || triagem.clienteNome === 'Cliente Frotista')) {
      const cli = (state.clientes || []).find(c => c.id === triagem.clienteId);
      if (cli) triagem.clienteNome = cli.nome || cli.razaoSocial || triagem.clienteNome;
    }
    if (!triagem.clienteId) {
      const veic = (state.veiculos || []).find(v => v.placa && v.placa.replace(/[^A-Za-z0-9]/g, '').toUpperCase() === placa);
      if (veic) {
        const cli = (state.clientes || []).find(c => c.id === (veic.clienteId || veic.cli));
        if (cli) {
          triagem.clienteId = cli.id;
          triagem.clienteNome = cli.nome || cli.razaoSocial || triagem.clienteNome;
        }
      }
    }

    return { skill: 'SKILL_RECEPCAO_PATIO', acaoExecutada: 'triagem_360', respostaTextoWhatsApp: montarTextoTriagem(triagem, placa), dadosOperacionais: triagem };
  }

  // 2. Fast Check-in Direto no WhatsApp
  if (acao === 'fast_checkin_whatsapp' || /fazer check-?in|abrir os recep[cç][aã]o|confirmar check-?in/i.test(msg)) {
    if (!placa) return { skill: 'SKILL_RECEPCAO_PATIO', acaoExecutada: 'solicitar_placa', respostaTextoWhatsApp: 'Por favor, informe a placa do veículo para o Fast Check-in.', dadosOperacionais: null };
    try {
      let clienteId = payload.clienteId || null;
      let clienteNome = payload.clienteNome || null;
      if (!clienteId) {
        const veic = (state.veiculos || []).find(v => v.placa && v.placa.replace(/[^A-Za-z0-9]/g, '').toUpperCase() === placa);
        if (veic) {
          clienteId = veic.clienteId || veic.cli;
          const cli = (state.clientes || []).find(c => c.id === clienteId);
          clienteNome = cli ? (cli.nome || cli.razaoSocial) : null;
        }
      }

      const checkin = smartGatehouseCheckinService.registrarFastCheckinPortaria360(state, {
        placa, clienteId, clienteNome, motoristaNome: payload.motoristaNome,
        kmEntrada: payload.kmEntrada, incluirOportunidadesIds: payload.incluirOportunidadesIds || [],
        incluirAlertasPreventivosIds: payload.incluirAlertasPreventivosIds || [],
        autorizarOverrideCreditoCliente: payload.autorizarOverrideCreditoCliente,
        justificativaOverrideCredito: payload.justificativaOverrideCredito, timestamp: payload.timestamp
      });
      const boxNome = checkin.boxAlocado ? checkin.boxAlocado.nome : 'Pátio de Espera';
      const osNum = checkin.osGerada?.num || checkin.novaOS?.num || 'N/A';
      const prot = checkin.checkInLog?.id || checkin.protocoloPortaria || 'REC-PORT';
      const txt = `✅ *Fast Check-in Realizado com Sucesso!*\n• *Protocolo:* ${prot}\n• *Veículo:* Placa ${placa}\n• *OS Aberta:* #${osNum}\n• *Box Alocado:* ${boxNome}\n• *Motorista:* ${payload.motoristaNome || 'Condutor'}\nO veículo já pode manobrar diretamente para o box designado.`;
      const dadosOp = { ...checkin, novaOS: checkin.osGerada || checkin.novaOS, protocoloPortaria: prot };
      return { skill: 'SKILL_RECEPCAO_PATIO', acaoExecutada: 'fast_checkin_whatsapp', respostaTextoWhatsApp: txt, dadosOperacionais: dadosOp };
    } catch (err) {
      if (err.code === 'CLIENT_CREDIT_BLOCKED_AT_GATEHOUSE') {
        const txt = `⛔ *Check-in Bloqueado na Portaria:* O crédito do cliente encontra-se bloqueado para novas ordens de serviço. Motivo: ${err.message}. Favor contatar a gerência financeira para liberação.`;
        return { skill: 'SKILL_RECEPCAO_PATIO', acaoExecutada: 'checkin_bloqueado_credito', respostaTextoWhatsApp: txt, dadosOperacionais: { erro: err.message, code: err.code } };
      }
      throw err;
    }
  }

  // 3. Solicitar Link de Aprovação Externa Frotista
  if (acao === 'solicitar_link_aprovacao' || /link aprova[cç][aã]o|aprovar or[cç]amento/i.test(msg)) {
    if (!placa) return { skill: 'SKILL_RECEPCAO_PATIO', acaoExecutada: 'solicitar_placa', respostaTextoWhatsApp: 'Por favor, informe a placa do veículo para o link de aprovação.', dadosOperacionais: null };
    const osAtiva = buscarOSAtivaPlaca(state, placa) || (state.os || []).slice(-1)[0];
    if (!osAtiva) return { skill: 'SKILL_RECEPCAO_PATIO', acaoExecutada: 'link_aprovacao_frotista', respostaTextoWhatsApp: `Não encontramos OS ativa para gerar link de aprovação para a placa ${placa}.`, dadosOperacionais: null };
    const linkData = externalFleetApprovalService.gerarLinkTokenAprovacaoFrotista(state, { osId: osAtiva.id, timestamp: payload.timestamp });
    const txt = `📲 *Link de Aprovação Externa do Orçamento — Placa ${placa}:*\n• *OS:* #${osAtiva.num || osAtiva.id}\n• *Total:* R$ ${Number(osAtiva.total || 0).toFixed(2)}\n• *Acesse para aprovar:* ${linkData.linkAprovacaoPublica}\nEste link possui validade tokenizada até ${new Date(linkData.dataExpiracao).toLocaleDateString('pt-BR')}.`;
    return { skill: 'SKILL_RECEPCAO_PATIO', acaoExecutada: 'link_aprovacao_frotista', respostaTextoWhatsApp: txt, dadosOperacionais: linkData };
  }

  // 4. Pré-check-in Simples / Chegada
  if (acao === 'pre_checkin' || /cheg|check-?in|entrada|fila|recep[cç][aã]o/i.test(msg)) {
    const protocolo = 'REC-' + Date.now().toString().slice(-4);
    const itemFila = { id: gerarId('rec'), protocolo, placa: placa || 'NÃO_INFORMADA', clienteNome: payload.clienteNome || 'Motorista Frotista', dataChegada: payload.timestamp || new Date().toISOString(), status: 'aguardando_triagem' };
    state.receptionQueue.push(itemFila);
    return { skill: 'SKILL_RECEPCAO_PATIO', acaoExecutada: 'pre_checkin', protocolo, respostaTextoWhatsApp: `Olá! Seu pré-check-in foi registrado sob protocolo *${protocolo}* (Placa ${placa || ''}). Dirija-se ao Box de Triagem.`, dadosOperacionais: { itemFila, filaRecepcao: state.receptionQueue } };
  }

  if (!placa) return { skill: 'SKILL_RECEPCAO_PATIO', acaoExecutada: 'solicitar_placa', respostaTextoWhatsApp: 'Por favor, informe a placa do veículo (ex: ABC1D23) para consultarmos o pátio.', dadosOperacionais: null };

  // 5. Consulta Preventiva Preditiva
  if (/revis[aã]o preventiva|pr[oó]xima revis[aã]o|agendar preventiva/i.test(msg)) {
    const fleetPredictiveMaintenanceService = require('../crm/fleetPredictiveMaintenanceService');
    const radar = fleetPredictiveMaintenanceService.apurarRadarPreventivaPreditiva(state, { placa });
    const alertaPlaca = (radar.alertas || []).find(a => a.placa === placa);
    if (alertaPlaca) {
      const statusTxt = alertaPlaca.statusPreventivo === 'vencida' ? 'VENCIDA' : alertaPlaca.statusPreventivo.toUpperCase();
      const txt = `🔧 *Radar de Manutenção Preventiva — Placa ${placa}:*\n• Sistema: ${alertaPlaca.sistemaTecnico}\n• KM Estimado: ${alertaPlaca.kmEstimadoAtual} km (${alertaPlaca.kmRestante <= 0 ? 'VENCIDA' : `Restam ${alertaPlaca.kmRestante} km`})\n• Status: *${statusTxt}*\nDeseja agendar o box de pátio para esta preventiva?`;
      return { skill: 'SKILL_RECEPCAO_PATIO', acaoExecutada: 'consulta_preventiva_preditiva', respostaTextoWhatsApp: txt, dadosOperacionais: { alerta: alertaPlaca } };
    }
  }

  // 6. Consulta de Prontuário Técnico
  if (/prontu[aá]rio|hist[oó]rico da placa|garantia eixo|laudo t[eé]cnico/i.test(msg)) {
    const vehicleTechnicalDossierService = require('../patio/vehicleTechnicalDossierService');
    const pront = vehicleTechnicalDossierService.consolidarProntuarioTecnicoPlaca(state, placa);
    const ind = pront.indicadoresProntuario;
    const ultimoLaudo = (pront.laudosTecnicos || []).slice(-1)[0];
    const txt = `📋 *Prontuário Técnico 360º — Placa ${placa}:*\n• OSs Históricas: ${ind.totalOS} (Total: R$ ${ind.totalInvestidoHistorico.toFixed(2)})\n• Monitoramento: ${ind.kmTotalMonitorado} km (CPK: R$ ${ind.custoPorKmRodado.toFixed(2)}/km)\n• Garantias Ativas: ${ind.totalGarantiasAtivasCount} componente(s)\n• Laudo Técnico: ${ultimoLaudo ? `Emitido (${ultimoLaudo.parecerFinal}) [SHA-256: ${ultimoLaudo.hashAutenticidadeLaudo.slice(0, 10)}...]` : 'Nenhum'}`;
    return { skill: 'SKILL_RECEPCAO_PATIO', acaoExecutada: 'consulta_prontuario_tecnico', respostaTextoWhatsApp: txt, dadosOperacionais: { prontuario: pront } };
  }

  // 7. Consulta de Situação da OS / Box / Gargalo
  const os = buscarOSAtivaPlaca(state, placa);
  if (os) {
    const box = state.patioBoxes.find(b => b.osAtualId === os.id || b.id === os.boxAtualId);
    const gargalo = state.patioBottlenecks.find(g => g.osId === os.id && g.status !== 'encerrado');
    const txt = `🚚 *Situação Operacional (${placa}):*\n• OS: #${os.num || os.id} (${os.st || 'em andamento'})\n• Localização: ${box?.nome || 'Box Pesado'}\n• Situação: ${gargalo ? `⚠️ Gargalo Ativo (${gargalo.motivoParada})` : '🟢 Em execução regular no box'}`;
    return { skill: 'SKILL_RECEPCAO_PATIO', acaoExecutada: 'consulta_status', respostaTextoWhatsApp: txt, dadosOperacionais: { os, box, gargalo } };
  }

  return { skill: 'SKILL_RECEPCAO_PATIO', acaoExecutada: 'consulta_status', respostaTextoWhatsApp: `Não encontramos ordem de serviço ativa no pátio para o veículo placa ${placa}.`, dadosOperacionais: null };
}

module.exports = {
  executarSkillRecepcaoInterativaWhatsApp,
  executarSkillRecepcaoPatio: executarSkillRecepcaoInterativaWhatsApp,
  extrairPlaca
};
