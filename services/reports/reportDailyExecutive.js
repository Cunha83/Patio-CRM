'use strict';

const financialEngine = require('../financialEngine');
const { getOrLoadState, mutateTenantState } = require('../../lib/serverContext');
const {
  getWppClient,
  getWppStatus,
  obterGruposWhatsApp,
  fecharModaisWhatsAppWeb,
  registrarIdMensagem,
  getWhatsAppModules
} = require('../whatsapp/whatsappState');

const { gerarImagemIndicadoresJPG } = require('./reportImageRender');

const {
  gerarRelatorioExecutivo,
  gerarMensagensAdmin,
  gerarMensagensOperacao
} = financialEngine;

async function enviarRelatorioGrupo(tipo = 'admin', context = {}) {
  const tenantKey = context.tenantKey || 'state';
  let state = context.state;
  if (!state) {
    state = await getOrLoadState(tenantKey);
  }
  if (!state) {
    return { success: false, error: `Estado não encontrado para o tenant ${tenantKey}.` };
  }

  if (process.env.DISABLE_INTEGRATIONS === 'true') {
    return { success: true, mock: true, tipo, totalMensagens: tipo === 'admin' ? 3 : 2, tenantKey };
  }

  const wppClient = getWppClient();
  const wppStatus = getWppStatus();

  if (!wppClient) {
    console.error('[WhatsApp] Falha no disparo: wppClient não inicializado.');
    return { success: false, error: 'WhatsApp Web não está inicializado no servidor.' };
  }

  if (wppStatus.status !== 'pronto') {
    const st = await wppClient.getState().catch(() => null);
    if (st === 'CONNECTED' || wppClient.info) {
      wppStatus.status = 'pronto';
      wppStatus.user = wppClient.info ? wppClient.info.wid.user : 'Conectado';
    } else {
      console.error(`[WhatsApp] Falha no disparo: status atual é "${wppStatus.status}".`);
      return { success: false, error: `WhatsApp Web não está pronto no servidor (status atual: ${wppStatus.status}).` };
    }
  }

  const cfg = state.cfg || {};
  let targetChatId = (tipo === 'admin'
    ? (cfg.grupoAdminId || process.env.WHATSAPP_GRUPO_ADMIN_ID)
    : (cfg.grupoOperacaoId || process.env.WHATSAPP_GRUPO_OPERACAO_ID)
  );

  // Blacklist estrita: Faturamento e Compras NUNCA podem ser usados para envio de relatórios da Administração
  if (tipo === 'admin') {
    if (targetChatId === '120363428179962435@g.us' || targetChatId === '120363428840376088@g.us') {
      console.warn(`[WhatsApp] Grupo proibido detectado para Administração (${targetChatId}). Desvinculando imediatamente.`);
      targetChatId = null;
      await mutateTenantState(tenantKey, (draft) => {
        if (!draft.cfg) draft.cfg = {};
        draft.cfg.grupoAdminId = '';
      });
    }
  }

  // Auto-descoberta se não configurado
  if (!targetChatId || targetChatId.startsWith('12036300000000000')) {
    console.log(`[WhatsApp] ID do grupo ${tipo} não configurado ou dummy. Buscando grupos disponíveis nos chats do WhatsApp...`);
    try {
      const grupos = await obterGruposWhatsApp();
      let achado = null;
      if (tipo === 'admin') {
        achado = grupos.find(g => {
          const n = (g.name || '').toLowerCase();
          if (n.includes('faturamento') || n.includes('compras')) return false;
          return n.includes('admin') || n.includes('administra') || n.includes('gestão') || n.includes('gerência');
        });
      } else {
        achado = grupos.find(g => {
          const n = (g.name || '').toLowerCase();
          return (n.includes('opera') || n.includes('patio') || n.includes('pátio') || n.includes('oficina')) && g.id !== cfg.grupoAdminId;
        });
      }
      if (achado) {
        targetChatId = achado.id;
        await mutateTenantState(tenantKey, (draft) => {
          if (!draft.cfg) draft.cfg = {};
          if (tipo === 'admin') draft.cfg.grupoAdminId = targetChatId;
          else draft.cfg.grupoOperacaoId = targetChatId;
        });
        console.log(`🎯 [WhatsApp] Grupo ${tipo} auto-descoberto com sucesso: "${achado.name}" (${targetChatId})`);
      }
    } catch (eBusca) {
      console.warn('[WhatsApp] Erro ao listar chats para auto-descoberta:', eBusca.message);
    }
  }

  if (!targetChatId || targetChatId.startsWith('12036300000000000')) {
    const errMsg = `Grupo de ${tipo === 'admin' ? 'Administração' : 'Operação'} não localizado no WhatsApp. Verifique se o número foi adicionado ao grupo.`;
    console.error(`❌ [WhatsApp] ${errMsg}`);
    return { success: false, error: errMsg };
  }

  try {
    const messageIds = [];
    await fecharModaisWhatsAppWeb();

    if (tipo === 'admin') {
      const msgs = gerarMensagensAdmin(state);
      console.log(`[WhatsApp] Disparando 3 mensagens + JPG para Grupo Admin (${targetChatId})...`);

      let sent1;
      try {
        console.log('[WhatsApp] Gerando imagem JPG de indicadores para Grupo Admin...');
        const jpgBuffer = await gerarImagemIndicadoresJPG(state, tenantKey);
        const { MessageMedia } = getWhatsAppModules();
        const media = new MessageMedia('image/jpeg', jpgBuffer.toString('base64'), 'painel_executivo.jpg');
        sent1 = await wppClient.sendMessage(targetChatId, media, { caption: msgs[0], waitUntilMsgSent: true });
      } catch (imgErr) {
        console.warn('[WhatsApp] Falha ao renderizar imagem JPG, enviando texto puro:', imgErr.message);
        sent1 = await wppClient.sendMessage(targetChatId, msgs[0], { waitUntilMsgSent: true });
      }
      await registrarIdMensagem(sent1, targetChatId, messageIds);

      await new Promise(r => setTimeout(r, 1200));
      const sent2 = await wppClient.sendMessage(targetChatId, msgs[1], { waitUntilMsgSent: true });
      await registrarIdMensagem(sent2, targetChatId, messageIds);

      await new Promise(r => setTimeout(r, 1200));
      const sent3 = await wppClient.sendMessage(targetChatId, msgs[2], { waitUntilMsgSent: true });
      await registrarIdMensagem(sent3, targetChatId, messageIds);

      console.log(`✅ [WhatsApp] Relatório completo (3 mensagens + JPG) enviado com sucesso para Grupo Admin (${targetChatId}):`, messageIds);
      return { success: true, tipo: 'admin', grupoId: targetChatId, totalMensagens: 3, messageIds };
    } else {
      const msgsOp = gerarMensagensOperacao(state);
      console.log(`[WhatsApp] Disparando 2 mensagens operacionais para Grupo Operação (${targetChatId})...`);

      const sent1 = await wppClient.sendMessage(targetChatId, msgsOp[0], { waitUntilMsgSent: true });
      await registrarIdMensagem(sent1, targetChatId, messageIds);

      await new Promise(r => setTimeout(r, 1200));
      const sent2 = await wppClient.sendMessage(targetChatId, msgsOp[1], { waitUntilMsgSent: true });
      await registrarIdMensagem(sent2, targetChatId, messageIds);

      console.log(`✅ [WhatsApp] Relatório operacional (2 mensagens sem finanças) enviado para Grupo Operação (${targetChatId}):`, messageIds);
      return { success: true, tipo: 'operacao', grupoId: targetChatId, totalMensagens: 2, messageIds };
    }
  } catch (err) {
    console.error(`❌ [WhatsApp] Erro ao disparar para grupo ${tipo}:`, err.message);
    return { success: false, error: err.message };
  }
}

async function enviarRelatorioAdministradores(destinatarioEspecifico = null, context = {}) {
  const tenantKey = context.tenantKey || 'state';
  let state = context.state;
  if (!state) {
    state = await getOrLoadState(tenantKey);
  }
  if (!state) {
    return { success: false, error: `Estado não encontrado para o tenant ${tenantKey}.` };
  }

  if (process.env.DISABLE_INTEGRATIONS === 'true') {
    return { success: true, mock: true, totalEnviados: 1, enviados: ['mock_admin'], tenantKey };
  }

  if (destinatarioEspecifico && destinatarioEspecifico.includes('@g.us')) {
    return await enviarRelatorioGrupo('admin', context);
  }

  const rel = gerarRelatorioExecutivo(state);
  let lista = [];
  if (destinatarioEspecifico) {
    lista = [destinatarioEspecifico];
  } else {
    const envAdmins = (process.env.WHATSAPP_ADMIN_NUMBERS || '')
      .split(',')
      .map(s => s.trim().replace(/\D/g, ''))
      .filter(Boolean);
    const cfgAdmins = (state.cfg?.adminFones || [])
      .map(s => String(s).trim().replace(/\D/g, ''))
      .filter(Boolean);
    lista = [...new Set([...envAdmins, ...cfgAdmins])];
  }

  if (lista.length === 0) {
    return { success: false, error: 'Nenhum telefone de administrador cadastrado no sistema (.env ou Configurações).' };
  }

  const wppClient = getWppClient();
  const wppStatus = getWppStatus();

  if (!wppClient || wppStatus.status !== 'pronto') {
    return {
      success: false,
      error: `WhatsApp Web não está pronto no servidor (status atual: ${wppStatus.status}). Conecte pelo painel primeiro.`,
      textoPreview: rel.texto,
      destinatarios: lista
    };
  }

  const enviados = [];
  const falhas = [];
  const messageIds = [];

  await fecharModaisWhatsAppWeb();
  for (const fone of lista) {
    try {
      let foneFormatado = fone.replace(/\D/g, '');
      if (!foneFormatado.startsWith('55') && foneFormatado.length >= 10 && foneFormatado.length <= 11) {
        foneFormatado = '55' + foneFormatado;
      }
      const chatId = `${foneFormatado}@c.us`;
      const sent = await wppClient.sendMessage(chatId, rel.texto, { waitUntilMsgSent: true });
      await registrarIdMensagem(sent, chatId, messageIds);
      enviados.push(fone);
      console.log(`[WhatsApp] Relatório executivo enviado com sucesso para ${fone}`);
    } catch (err) {
      console.error(`[WhatsApp] Falha ao enviar para ${fone}:`, err.message);
      falhas.push({ fone, erro: err.message });
    }
  }

  return {
    success: enviados.length > 0,
    totalEnviados: enviados.length,
    enviados,
    falhas,
    messageIds,
    textoRelatorio: rel.texto
  };
}

/**
 * Notificação via WhatsApp para evento de Abertura ou Fechamento de Caixa
 */
async function notificarEventoCaixaWhatsApp({
  tipo,
  operadorNome,
  saldoInicial,
  saldoFinal,
  diferenca,
  dataHoraSP,
  tenantKey = 'default',
  state = null,
  dryRun = false
}) {
  try {
    const currentState = state || (await getOrLoadState({ headers: { 'x-tenant-id': tenantKey } }));
    const cfg = currentState?.cfg || {};

    if (!cfg.avisarCaixaWhatsapp) {
      return { disparado: false, motivo: 'flag_desligado' };
    }

    const targetChatId = (cfg.grupoAdminId || process.env.WHATSAPP_GRUPO_ADMIN_ID || '').trim();
    if (!targetChatId) {
      console.warn(`[WhatsApp Caixa] Tenant ${tenantKey}: avisarCaixaWhatsapp ativo, mas grupoAdminId não configurado.`);
      return { disparado: false, motivo: 'grupo_admin_nao_configurado' };
    }

    const agoraSP = dataHoraSP || financialEngine.obterAgoraSP();
    const hora = agoraSP.horaBR;
    const data = agoraSP.dataBR;
    const nome = operadorNome || 'Operador';

    let mensagem = '';
    if (tipo === 'abertura') {
      const saldoIniFmt = financialEngine.formatarMoeda(saldoInicial || 0);
      mensagem = `🔓 *Aviso de Abertura de Caixa*\n\n` +
                 `👤 *Operador:* ${nome}\n` +
                 `🕒 *Horário:* ${data} às ${hora} (SP)\n` +
                 `💵 *Saldo Inicial:* ${saldoIniFmt}`;
    } else {
      const saldoFimFmt = financialEngine.formatarMoeda(saldoFinal || 0);
      const difNum = Number(diferenca) || 0;
      let linhaDif = '';
      if (Math.abs(difNum) >= 0.01) {
        const difFmt = financialEngine.formatarMoeda(Math.abs(difNum));
        linhaDif = `\n⚖️ *Diferença:* ${difNum < 0 ? 'Quebra de -' : 'Sobra de +'}${difFmt}`;
      } else {
        linhaDif = `\n⚖️ *Diferença:* R$ 0,00 (Caixa 100% conferido)`;
      }
      mensagem = `🔒 *Aviso de Fechamento de Caixa*\n\n` +
                 `👤 *Operador:* ${nome}\n` +
                 `🕒 *Horário:* ${data} às ${hora} (SP)\n` +
                 `💰 *Saldo Final:* ${saldoFimFmt}` +
                 linhaDif;
    }

    if (dryRun) {
      return { disparado: true, dryRun: true, targetChatId, mensagem };
    }

    const wppClient = getWppClient();
    const wppStatus = getWppStatus();
    if (!wppClient || wppStatus?.status !== 'pronto') {
      console.warn(`[WhatsApp Caixa] WhatsApp desconectado ou não pronto (status: ${wppStatus?.status || 'desconhecido'}). Mensagem de caixa não enviada.`);
      return { disparado: false, motivo: 'whatsapp_desconectado', wppStatus: wppStatus?.status };
    }

    await fecharModaisWhatsAppWeb();
    const sent = await wppClient.sendMessage(targetChatId, mensagem, { waitUntilMsgSent: true });
    return {
      disparado: true,
      sucesso: true,
      targetChatId,
      messageId: sent?.id?._serialized || null,
      mensagem
    };
  } catch (err) {
    console.error(`[WhatsApp Caixa] Falha não-bloqueante ao enviar notificação de ${tipo} de caixa:`, err.message);
    return { disparado: false, erro: err.message };
  }
}

module.exports = {
  enviarRelatorioGrupo,
  enviarRelatorioAdministradores,
  notificarEventoCaixaWhatsApp
};

