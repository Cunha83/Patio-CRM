'use strict';

const financialEngine = require('../../financialEngine');
const financialAnalystService = require('../../financialAnalystService');
const executiveManagerService = require('../../executiveManagerService');
const { formatarMoeda, formatarDataBR } = require('./whatsappHelpers');
const { auditarComandoWhatsApp } = require('./whatsappSecurity');
const {
  gerarMensagensAdmin,
  gerarMensagensOperacao,
  gerarResumoPatio,
  gerarImagemIndicadoresJPG
} = require('../../reportGenerationService');
const { getWhatsAppModules } = require('../whatsappState');

/**
 * Processa comandos executivos e de gestão (!previsao, !auditoria, !gestao360, !compras, !equipe, !relatorio, !patio, !ajuda)
 */
async function processarComandosExecutivos(msg, ctx) {
  const { textoMensagem, textoLower, tenantKey, tenantState, senderNorm, isContextAdmin, isContextOperacao, wppClient } = ctx;

  // 1. Previsão de Fluxo de Caixa
  if (textoLower === '!previsao' || textoLower === 'previsao' || textoLower === 'previsão' || textoLower === '!forecast') {
    if (isContextOperacao || !isContextAdmin) {
      await msg.reply('🔒 *Acesso Restrito:* A projeção de fluxo de caixa é disponibilizada exclusivamente no Grupo da Administração.');
      await auditarComandoWhatsApp({ tenantId: tenantKey, numero: senderNorm, comando: textoMensagem, resultado: 'negado_permissao' });
      return true;
    }
    const prev = financialAnalystService.gerarPrevisaoFluxoCaixa(tenantState, { horizonteDias: 30 });
    let msgPrev = `📈 *PREVISÃO DE FLUXO DE CAIXA (VERÔNICA ANALISTA)* 🤖\n\n`;
    msgPrev += `💰 *Saldo Disponível Hoje:* ${formatarMoeda(prev.saldoAtual)}\n\n`;
    msgPrev += `🗓️ *Projeções por Período:*\n`;
    msgPrev += `• *7 Dias:* ${formatarMoeda(prev.marcos?.em7Dias?.saldo)} (Seguro: ${prev.marcos?.em7Dias?.seguro ? 'Sim' : 'Abaixo da Margem'})\n`;
    msgPrev += `• *15 Dias:* ${formatarMoeda(prev.marcos?.em15Dias?.saldo)} (Seguro: ${prev.marcos?.em15Dias?.seguro ? 'Sim' : 'Abaixo da Margem'})\n`;
    msgPrev += `• *30 Dias:* ${formatarMoeda(prev.marcos?.em30Dias?.saldo)} (Seguro: ${prev.marcos?.em30Dias?.seguro ? 'Sim' : 'Abaixo da Margem'})\n\n`;
    msgPrev += `📊 *Totais Projetados (30 Dias):*\n`;
    msgPrev += `• Contas a Receber: ${formatarMoeda(prev.totaisPeriodo?.aReceber)}\n`;
    msgPrev += `• Contas a Pagar: ${formatarMoeda(prev.totaisPeriodo?.aPagar)}\n`;
    msgPrev += `• Saldo Previsto por Títulos: ${formatarMoeda(prev.totaisPeriodo?.saldoPrevistoFinanceiro)}\n\n`;
    msgPrev += `🚛 *Potencial de Pátio (OS em andamento & orçamentos):*\n`;
    msgPrev += `• Cenário Provável: ${formatarMoeda(prev.receitaPotencialPatio?.cenarioProvavel)} (Saldo Proj: ${formatarMoeda(prev.receitaPotencialPatio?.saldoProvavel30dComPatio)})\n`;
    msgPrev += `• Cenário Conservador: ${formatarMoeda(prev.receitaPotencialPatio?.cenarioConservador)} (Saldo Proj: ${formatarMoeda(prev.receitaPotencialPatio?.saldoConservador30dComPatio)})\n`;

    if (prev.diagnosticoFuro?.furoDetectado) {
      msgPrev += `\n⚠️ *Alerta de Furo de Caixa:* Risco a partir de ${formatarDataBR(prev.diagnosticoFuro.dataPrimeiroFuro)} (menor saldo: ${formatarMoeda(prev.diagnosticoFuro.menorSaldoProjetado)}). Caixa mínimo: ${formatarMoeda(prev.caixaMinimoSeguranca)}.`;
    } else {
      msgPrev += `\n✅ *Saúde do Caixa:* Nenhum furo de caixa projetado nos próximos 30 dias (caixa mínimo de ${formatarMoeda(prev.caixaMinimoSeguranca)} mantido).`;
    }
    await msg.reply(msgPrev);
    return true;
  }

  // 2. Auditoria e Controles Internos
  if (textoLower === '!auditoria' || textoLower === 'auditoria' || textoLower === '!controles' || textoLower === 'controles') {
    if (isContextOperacao) {
      await msg.reply('🔒 *Acesso Restrito:* A auditoria de controles internos é disponibilizada exclusivamente no Grupo da Administração.');
      return true;
    }
    const parecer = financialAnalystService.formatarParecerExecutivoVerônica(tenantState);
    await msg.reply(parecer);
    return true;
  }

  // 3. Gestão 360
  if (textoLower === '!gestao360' || textoLower === 'gestao360' || textoLower === '!gestão360' || textoLower === '!raiox' || textoLower === 'raiox' || textoLower === '!gestao' || textoLower === 'gestao' || textoLower === '!gestão') {
    if (isContextOperacao) {
      await msg.reply('🔒 *Acesso Restrito:* O relatório de gestão 360º é disponibilizado exclusivamente no Grupo da Administração.');
      return true;
    }
    const relatorio = executiveManagerService.gerarRelatorioGerencial360(tenantState, { tenantId: tenantKey });
    await msg.reply(relatorio.textoWhatsApp);
    return true;
  }

  // 4. Compras & Estoque Crítico
  if (textoLower === '!compras' || textoLower === 'compras' || textoLower === '!suprimentos' || textoLower === 'suprimentos') {
    if (isContextOperacao) {
      await msg.reply('🔒 *Acesso Restrito:* A análise de compras sugeridas e viabilidade financeira é disponibilizada exclusivamente no Grupo da Administração.');
      return true;
    }
    const analise = executiveManagerService.analisarComprasEEstoque(tenantState, { tenantId: tenantKey });
    let msgCompras = `📦 *SUGESTÃO DE COMPRAS & ESTOQUE CRÍTICO (VERÔNICA)* 🤖\n\n• Total de Itens: ${analise.resumo.totalItensNecessidade}\n• Urgentes para OSs: ${analise.resumo.totalItensCriticosOS}\n• Estoque Zerado: ${analise.resumo.totalItensZerados}\n• Custo Reposição: ${formatarMoeda(analise.resumo.custoTotalReposicao)}\n`;
    if (analise.resumo.custoOSUrgente > 0) msgCompras += `• Custo Urgente OS: ${formatarMoeda(analise.resumo.custoOSUrgente)}\n`;
    msgCompras += `\n💡 *Parecer Financeiro:*\n${analise.financeiro.parecerFinanceiro}\n`;

    if (analise.itens.length > 0) {
      msgCompras += `\n📋 *Principais Itens Sugeridos:*\n`;
      const topItens = analise.itens.slice(0, 6);
      for (const it of topItens) {
        const tagPrio = it.prioridade === 'urgente' ? '🚨' : (it.prioridade === 'alta' ? '⚠️' : '📦');
        msgCompras += `${tagPrio} *${it.nome}* (${it.cod || 'S/C'})\n   • Sugestão: ${it.qtdSugerida} un | Custo: ${formatarMoeda(it.custoTotalEstimado)} | Forn: ${it.fornecedor}\n`;
        if (it.deficitOS > 0) msgCompras += `   • *Déficit em OS:* Faltam ${it.deficitOS} un para atendimento no pátio\n`;
      }
      if (analise.itens.length > 6) msgCompras += `\n_... e mais ${analise.itens.length - 6} item(ns) detalhados no painel web._\n`;
    }
    await msg.reply(msgCompras);
    return true;
  }

  // 5. Equipe & Produtividade
  if (textoLower === '!equipe' || textoLower === 'equipe' || textoLower === '!produtividade' || textoLower === 'produtividade') {
    if (isContextOperacao) {
      await msg.reply('🔒 *Acesso Restrito:* O relatório de produtividade da equipe e mecânicos é disponibilizado exclusivamente no Grupo da Administração.');
      return true;
    }
    const prod = executiveManagerService.analisarProdutividadeEquipe(tenantState, { tenantId: tenantKey });
    let msgEq = `👨‍🔧 *PRODUTIVIDADE DA EQUIPE & BOXES (VERÔNICA)* 🤖\n\n• Mecânicos no Time: ${prod.resumo.totalMecanicos}\n• Horas Produtivas: ${prod.resumo.totalHorasProdutivasEquipe}h (de ${prod.resumo.totalHorasApontadasEquipe}h)\n• Receita Mão de Obra: ${formatarMoeda(prod.resumo.totalReceitaMaoDeObra)}\n• Ticket Médio M.O./OS: ${formatarMoeda(prod.resumo.ticketMedioGeralPorOS)}\n• Ocupação Boxes: ${prod.resumo.boxesOcupados}/${prod.resumo.totalBoxes} (${prod.resumo.taxaOcupacaoBoxes}%)\n\n`;
    if (prod.resumo.mecanicoDestaque) {
      msgEq += `🏆 *Colaborador Destaque:* ${prod.resumo.mecanicoDestaque.nome} (${formatarMoeda(prod.resumo.mecanicoDestaque.receita)} em ${prod.resumo.mecanicoDestaque.osCount} OSs)\n\n`;
    }
    if (prod.equipe.length > 0) {
      msgEq += `👨‍🏭 *Ranking Individual:*\n`;
      for (const m of prod.equipe) {
        const utilStr = m.taxaUtilizacao !== null ? `${m.taxaUtilizacao}%` : 'N/D';
        msgEq += `• *${m.nome}*: ${m.totalOSAtendidas} OS(s) | ${m.horasProdutivas}h prod. (Util: ${utilStr}) | ${formatarMoeda(m.receitaMaoDeObraGerada)}\n`;
      }
    }
    if (prod.resumo.totalSobrecarregados > 0) msgEq += `\n⚠️ *Atenção:* ${prod.resumo.totalSobrecarregados} colaborador(es) com sobrecarga.`;
    if (prod.resumo.totalOciosos > 0) msgEq += `\n💡 *Capacidade:* ${prod.resumo.totalOciosos} colaborador(es) disponíveis/ociosos.`;
    await msg.reply(msgEq);
    return true;
  }

  // 6. Relatório Executivo
  if (
    textoLower === '!relatorio' || textoLower === 'relatorio' || textoLower === 'relatório' ||
    textoLower === '!posicao' || textoLower === 'posicao' || textoLower === 'posiçao' ||
    textoLower.includes('relatório executivo') || textoLower.includes('relatorio executivo') ||
    textoLower.includes('pedir relatório') || textoLower.includes('pedir relatorio')
  ) {
    if (isContextOperacao) {
      const msgsOp = gerarMensagensOperacao(tenantState);
      await msg.reply(msgsOp[0]);
      await new Promise(r => setTimeout(r, 800));
      if (wppClient) await wppClient.sendMessage(msg.from, msgsOp[1]);
      await auditarComandoWhatsApp({ tenantId: tenantKey, numero: senderNorm, comando: textoMensagem, resultado: 'sucesso' });
      return true;
    } else {
      if (!isContextAdmin) {
        await msg.reply('🔒 *Acesso Restrito:* O relatório executivo é disponibilizado exclusivamente para administradores autorizados.');
        await auditarComandoWhatsApp({ tenantId: tenantKey, numero: senderNorm, comando: textoMensagem, resultado: 'negado_permissao' });
        return true;
      }
      const msgs = gerarMensagensAdmin(tenantState);
      try {
        const jpgBuffer = await gerarImagemIndicadoresJPG(tenantState, tenantKey);
        const { MessageMedia } = getWhatsAppModules();
        const media = new MessageMedia('image/jpeg', jpgBuffer.toString('base64'), 'painel_executivo.jpg');
        if (wppClient) await wppClient.sendMessage(msg.from, media, { caption: msgs[0] });
        else await msg.reply(msgs[0]);
      } catch (imgErr) {
        console.warn('[WhatsApp] Falha ao enviar imagem JPG no comando !relatorio, enviando texto:', imgErr.message);
        await msg.reply(msgs[0]);
      }
      await new Promise(r => setTimeout(r, 800));
      if (wppClient) await wppClient.sendMessage(msg.from, msgs[1]);
      await new Promise(r => setTimeout(r, 800));
      if (wppClient) await wppClient.sendMessage(msg.from, msgs[2]);
      await auditarComandoWhatsApp({ tenantId: tenantKey, numero: senderNorm, comando: textoMensagem, resultado: 'sucesso' });
      return true;
    }
  }

  // 7. Pátio e Boxes
  if (textoLower === '!patio' || textoLower === 'patio' || textoLower === 'pátio' || textoLower === 'boxes') {
    const resPatio = gerarResumoPatio(tenantState);
    await msg.reply(resPatio);
    return true;
  }

  // 8. Ajuda e Menu de Comandos
  if (textoLower === '!ajuda' || textoLower === 'ajuda' || textoLower === 'menu' || textoLower === '!comandos' || textoLower === 'comandos') {
    if (isContextOperacao) {
      const menuOp =
`🛠️ *COMANDOS OPERACIONAIS — PÁTIO CRM* 🚛

Olá, equipe de pátio e compras! Comandos e ações disponíveis:

📦 *Entradas & Documentos (Envie a Foto ou Texto):*
• 📋 *Foto de Pedido de Compra / Orçamento* ➔ Provisiona no Contas a Pagar
• 🧾 *Foto de Nota Fiscal (NF-e / DANFE)* ➔ Entrada de peças no almoxarifado
• 💸 *Foto de Comprovante de Pagamento (Pix / Boleto / TED)* ➔ Baixa em conta a pagar

🚛 *Pátio & Ordens de Serviço:*
• 📸 *Foto da Placa ou Caminhão* ➔ Check-in e abertura automática de OS
• 🚛 *!patio* ➔ Ocupação dos boxes em tempo real
• 📋 *!relatorio* ➔ Veículos amanhecidos na oficina
• 🔍 *Status [placa]* ➔ Andamento e serviços (ex: *Status ABC1234*)
• ➕ *Abrir OS [placa]* ➔ Nova OS por texto (ex: *Abrir OS ABC1234*)
• 📝 *Inclua [serviço]* ➔ Adicionar item à OS (ex: *Inclua troca de mola*)

_Pátio CRM — Operação de Pátio e Oficina_`;
      await msg.reply(menuOp);
      return true;
    } else {
      const menuAdmin =
`🛠️ *COMANDOS DE ADMINISTRADOR — PÁTIO CRM* 🚛

Olá! Você tem acesso aos comandos executivos do sistema:

🌐 *!gestao360* — Relatório executivo 360º (Pátio, Caixa, Compras, Equipe e Frotas)
📦 *!compras* — Sugestão de compras cruzada com saldo de caixa e déficit de OS
👨‍🔧 *!equipe* — Produtividade dos mecânicos, ocupação de boxes e receita de M.O.
📊 *!relatorio* — Relatório executivo completo (3 mensagens + Gráfico JPG)
💰 *!caixa* — Posição financeira consolidada e títulos do dia
📈 *!previsao* — Previsão de fluxo de caixa (7, 15, 30 dias) e potencial de pátio
🔍 *!auditoria* — Auditoria de controles internos e parecer executivo da Verônica
🚛 *!patio* — Ocupação dos boxes e pátio em tempo real
📦 *Fotos de Pedidos, Notas Fiscais e Comprovantes* — Lançamento, provisionamento e conciliação automáticos
🔍 *Status [placa]* — Consultar OS de um veículo (ex: *Status ABC1234*)
➕ *Abrir OS [placa]* — Abrir nova OS com placa ou foto do caminhão
📝 *Inclua [serviço]* — Adicionar item à OS em andamento

_Pátio CRM — Gestão de Oficina Pesada_`;
      await msg.reply(menuAdmin);
      return true;
    }
  }

  return false;
}

module.exports = {
  processarComandosExecutivos
};
