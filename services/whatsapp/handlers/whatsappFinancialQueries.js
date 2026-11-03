'use strict';

const financialEngine = require('../../financialEngine');
const financialAnalystService = require('../../financialAnalystService');
const { formatarMoeda, formatarHoraSimples } = require('./whatsappHelpers');
const { auditarComandoWhatsApp } = require('./whatsappSecurity');
const { gerarResumoCaixa } = require('../../reportGenerationService');

/**
 * Processa consultas de leitura financeira (Extrato de OS, Extrato de Caixa, Resumo Parcial, Saldo, Contas do Dia, DRE, Avisos/Cobranças de OS)
 */
async function processarConsultasFinanceiras(msg, ctx) {
  const { textoMensagem, textoLower, tenantKey, tenantState, senderNorm, isContextAdmin, isContextOperacao } = ctx;

  const matchComandoOS = textoMensagem.match(/(?:extrato|financeiro|posicao|posição)\s+(?:da\s+)?os\s*#?\s*([a-zA-Z0-9_\-]+)/i);
  const isComandoExtratoOS = Boolean(matchComandoOS && matchComandoOS[1]);

  const isComandoExtrato =
    (textoLower === '!extrato' || textoLower === 'extrato' ||
     textoLower.startsWith('!extrato ') || textoLower.startsWith('extrato ') ||
     textoLower.includes('últimos lançamentos') || textoLower.includes('ultimos lancamentos') ||
     textoLower.includes('últimas movimentações') || textoLower.includes('ultimas movimentacoes')) &&
    !isComandoExtratoOS;

  const isComandoResumoCaixa =
    textoLower === '!resumo caixa' || textoLower === 'resumo caixa' ||
    textoLower === '!fechamento parcial' || textoLower === 'fechamento parcial' ||
    textoLower === 'parcial do caixa' || textoLower === 'parcial caixa' ||
    textoLower === '!parcial';

  const isComandoSaldo =
    textoLower === '!caixa' || textoLower === 'caixa' ||
    textoLower === '!saldo' || textoLower === 'saldo' ||
    textoLower === 'saldo do caixa' || textoLower === 'saldo de caixa' ||
    textoLower === '!financeiro' || textoLower === 'financeiro';

  const isComandoMovimentosDia =
    textoLower.includes('entradas e saídas') || textoLower.includes('entradas e saidas') ||
    textoLower.includes('movimentações do dia') || textoLower.includes('movimentacoes do dia') ||
    textoLower.includes('movimentação do dia') || textoLower.includes('movimentacao do dia') ||
    textoLower.includes('entradas do dia') || textoLower.includes('saídas do dia') || textoLower.includes('saidas do dia') ||
    textoLower === '!movimentacoes' || textoLower === '!movimentos' ||
    (textoLower.includes('entradas') && textoLower.includes('saídas')) ||
    (textoLower.includes('entradas') && textoLower.includes('saidas'));

  const isComandoContasDia =
    textoLower.includes('contas a pagar e a receber') ||
    textoLower.includes('pagar e receber do dia') ||
    textoLower.includes('contas do dia') ||
    textoLower.includes('títulos do dia') || textoLower.includes('titulos do dia') ||
    textoLower.includes('vencimentos do dia') || textoLower.includes('vencimentos de hoje') ||
    textoLower.includes('contas a pagar do dia') || textoLower.includes('contas a receber do dia') ||
    textoLower.includes('contas a pagar') || textoLower.includes('contas a receber') ||
    textoLower === '!contas' || textoLower === '!vencimentos' || textoLower === 'vencimentos' ||
    textoLower === 'contas hoje' || textoLower === '!contas hoje' ||
    textoLower === 'agenda financeira' || textoLower === 'compromissos hoje';

  const isComandoDRE =
    textoLower === '!dre' || textoLower === 'dre' ||
    textoLower.includes('demonstrativo de resultado') ||
    textoLower.includes('dre operacional') ||
    textoLower.includes('resultado operacional');

  const matchAvisoRetiradaOS = textoLower.match(/^!?(?:aviso\s+retirada|aviso\s+cliente)(?:\s+os)?\s+([#a-zA-Z0-9_\-]+)$/i) ||
    textoMensagem.match(/(?:aviso|comunicado|notificar|retirada)\s+(?:da\s+)?os\s*#?\s*([a-zA-Z0-9_\-]+)/i);
  const isComandoAvisoRetiradaOS = Boolean(matchAvisoRetiradaOS && matchAvisoRetiradaOS[1]);

  const matchCobrancaOS = textoLower.match(/^(?:!cobranca|!cobrança|cobranca|cobrança|aviso\s+vencimento|lembrete\s+cobranca|lembrete\s+cobrança)(?:\s+os)?\s+([#a-zA-Z0-9_\-]+)$/i) ||
    textoMensagem.match(/(?:cobran[cç]a|cobrar|lembrete)\s+(?:da\s+)?os\s*#?\s*([a-zA-Z0-9_\-]+)/i);
  const isComandoCobrancaOS = Boolean(matchCobrancaOS && matchCobrancaOS[1]);

  if (!isComandoExtratoOS && !isComandoExtrato && !isComandoResumoCaixa && !isComandoSaldo &&
      !isComandoMovimentosDia && !isComandoContasDia && !isComandoDRE && !isComandoAvisoRetiradaOS && !isComandoCobrancaOS) {
    return false;
  }

  // 1. Extrato de OS
  if (isComandoExtratoOS) {
    if (isContextOperacao || !isContextAdmin) {
      await msg.reply('🔒 *Acesso Restrito:* A consulta financeira de Ordens de Serviço é disponibilizada exclusivamente para administradores autorizados.');
      await auditarComandoWhatsApp({ tenantId: tenantKey, numero: senderNorm, comando: textoMensagem, resultado: 'negado_permissao' });
      return true;
    }
    const osIdAlvo = matchComandoOS[1].trim();
    const resOS = financialAnalystService.obterResumoFinanceiroOS(tenantState, osIdAlvo);
    if (!resOS || !resOS.historico || resOS.historico.length === 0) {
      await msg.reply(`⚠️ Nenhuma movimentação financeira vinculada à OS #${osIdAlvo} foi localizada.`);
      await auditarComandoWhatsApp({ tenantId: tenantKey, numero: senderNorm, comando: textoMensagem, resultado: 'recusado_os_sem_movimentacoes', detalhes: { osId: osIdAlvo } });
      return true;
    }
    let respOS = `📋 *POSIÇÃO FINANCEIRA - OS #${osIdAlvo}* 🚗\n\n`;
    if (resOS.placasVinculadas && resOS.placasVinculadas.length > 0) respOS += `• *Veículo / Placa:* ${resOS.placasVinculadas.join(', ')}\n`;
    respOS += `• *Total Recebido (Entradas):* ${financialEngine.formatarMoeda(resOS.totalEntradasOS)}\n`;
    respOS += `• *Despesas Vinculadas (Saídas):* ${financialEngine.formatarMoeda(resOS.totalSaidasOS)}\n`;
    respOS += `• *Saldo Líquido da OS:* ${financialEngine.formatarMoeda(resOS.saldoLiquidoOS)}\n`;
    respOS += `• *Total de Lançamentos:* ${resOS.historico.length} (${resOS.qtdLancamentos} ativo(s))\n\n`;

    const meiosKeys = Object.keys(resOS.resumoMeiosPagamento || {});
    if (meiosKeys.length > 0) {
      respOS += `💳 *Meios de Pagamento Utilizados:*\n`;
      meiosKeys.forEach(m => {
        const item = resOS.resumoMeiosPagamento[m];
        respOS += `• ${m.toUpperCase()}: ${financialEngine.formatarMoeda(item.total)} (${item.qtd}x)\n`;
      });
      respOS += `\n`;
    }
    respOS += `📜 *Histórico de Movimentações:*\n`;
    resOS.historico.slice(0, 10).forEach((mov, idx) => {
      const isEstornado = Boolean(mov.estornado);
      const isComp = Boolean(mov.estornoDeId || mov.subtipo === 'estorno');
      const isEnt = mov.tipo === 'entrada' || mov.tipo === 'receita';
      const tagTipo = isEstornado ? '⚠️ Estornado' : isComp ? '↩️ Compensatório' : isEnt ? '🟢 Entrada' : '🔴 Saída';
      const formaStr = (mov.forma || mov.formaPagamento || 'dinheiro').toUpperCase();
      const idCurto = mov.id ? (mov.id.length > 8 ? mov.id.slice(-6) : mov.id) : `${idx + 1}`;
      respOS += `• [${idCurto}] ${tagTipo} ${financialEngine.formatarMoeda(mov.valor)} (${formaStr}) - ${mov.desc || mov.descricao || 'Movimento'}\n`;
    });
    if (resOS.historico.length > 10) respOS += `_... e mais ${resOS.historico.length - 10} movimentação(ões)._\n`;

    await msg.reply(respOS.trim());
    await auditarComandoWhatsApp({ tenantId: tenantKey, numero: senderNorm, comando: textoMensagem, resultado: 'sucesso', detalhes: { osId: osIdAlvo, totalEntradas: resOS.totalEntradasOS, totalSaidas: resOS.totalSaidasOS, saldoLiquido: resOS.saldoLiquidoOS } });
    return true;
  }

  // 2. Extrato do Caixa
  if (isComandoExtrato) {
    if (isContextOperacao || !isContextAdmin) {
      await msg.reply('🔒 *Acesso Restrito:* O extrato financeiro de caixa é disponibilizado exclusivamente para administradores autorizados.');
      await auditarComandoWhatsApp({ tenantId: tenantKey, numero: senderNorm, comando: textoMensagem, resultado: 'negado_permissao' });
      return true;
    }
    let qtd = 5;
    const matchNum = textoLower.match(/\b([1-9]|10)\b/);
    if (matchNum) qtd = parseInt(matchNum[1], 10);
    const apenasWhatsapp = textoLower.includes('whatsapp') || textoLower.includes('wpp');

    const caixaAberto = financialAnalystService.obterCaixaAberto(tenantState, tenantKey);
    const todosMovs = Array.isArray(tenantState.movimentos) ? tenantState.movimentos : [];
    let movs = caixaAberto ? todosMovs.filter(m => (m.caixaId === caixaAberto.id) || (Array.isArray(caixaAberto.movimentacoesIds) && caixaAberto.movimentacoesIds.includes(m.id))) : todosMovs.slice(0, 20);
    if (apenasWhatsapp) movs = movs.filter(m => m.origem === 'whatsapp');

    const ultimos = movs.slice(0, qtd);
    const saldoAtual = caixaAberto ? (caixaAberto.saldoAtual || 0) : financialAnalystService.calcularSaldoConsolidado(tenantState, tenantKey);

    let resposta = `📜 *EXTRATO RECENTE DE MOVIMENTAÇÕES* 📜\n\n• *Turno:* ${caixaAberto ? `#${caixaAberto.id} (Aberto)` : 'Nenhum Caixa Aberto'}\n• *Saldo Atual:* ${financialEngine.formatarMoeda(saldoAtual)}\n• *Exibindo:* ${ultimos.length} lançamento(s)${apenasWhatsapp ? ' (Apenas WhatsApp)' : ''}\n─────────────────────────\n`;
    if (ultimos.length === 0) {
      resposta += `Nenhuma movimentação registrada no turno atual.\n`;
    } else {
      ultimos.forEach((m, idx) => {
        const isEstornado = Boolean(m.estornado);
        const isComp = Boolean(m.estornoDeId || m.subtipo === 'estorno');
        const isEnt = m.tipo === 'entrada' || m.tipo === 'receita';
        const tagTipo = isEstornado ? '⚠️ Estornado' : isComp ? '↩️ Compensatório' : isEnt ? '🟢 Entrada' : '🔴 Saída';
        const tagOrigem = m.origem === 'whatsapp' ? '📱 WPP' : '💻 WEB';
        const horaStr = m.confirmadoEm ? formatarHoraSimples(m.confirmadoEm) : (m.hora ? m.hora : (m.data || 'Hoje'));
        const idCurto = m.id ? (m.id.length > 8 ? m.id.slice(-6) : m.id) : `${idx + 1}`;
        resposta += `*[${idCurto}]* ${tagTipo} • ${financialEngine.formatarMoeda(m.valor)}\n• *Desc:* ${m.desc || m.descricao || 'Movimento'}\n• *Canal:* ${tagOrigem} | *Horário:* ${horaStr}\n`;
        if (isEstornado && m.motivoEstorno) resposta += `• *Motivo Estorno:* ${m.motivoEstorno}\n`;
        resposta += `─────────────────────────\n`;
      });
    }
    await msg.reply(resposta.trim());
    await auditarComandoWhatsApp({ tenantId: tenantKey, numero: senderNorm, comando: textoMensagem, resultado: 'sucesso', detalhes: { qtdRetornada: ultimos.length, turnoId: caixaAberto ? caixaAberto.id : null } });
    return true;
  }

  // 3. Resumo Caixa / Fechamento Parcial
  if (isComandoResumoCaixa) {
    if (isContextOperacao || !isContextAdmin) {
      await msg.reply('🔒 *Acesso Restrito:* Informações de resumo e fechamento de caixa são disponibilizadas exclusivamente para administradores autorizados.');
      await auditarComandoWhatsApp({ tenantId: tenantKey, numero: senderNorm, comando: textoMensagem, resultado: 'negado_permissao' });
      return true;
    }
    const resParcial = financialAnalystService.obterResumoFechamentoParcial(tenantState, tenantKey);
    if (!resParcial.ok) {
      await msg.reply('⚠️ Não há nenhum turno de caixa aberto no momento para visualização de resumo.');
      await auditarComandoWhatsApp({ tenantId: tenantKey, numero: senderNorm, comando: textoMensagem, resultado: 'recusado_sem_caixa_aberto' });
      return true;
    }
    await msg.reply(resParcial.resumoTextoWhatsapp);
    await auditarComandoWhatsApp({ tenantId: tenantKey, numero: senderNorm, comando: textoMensagem, resultado: 'sucesso', detalhes: { acao: 'resumo_caixa', caixaId: resParcial.caixa?.id } });
    return true;
  }

  // 4. Saldo Caixa
  if (isComandoSaldo) {
    if (isContextOperacao || !isContextAdmin) {
      await msg.reply('🔒 *Acesso Restrito:* Informações financeiras de caixa e valores são disponibilizadas exclusivamente para administradores autorizados.');
      await auditarComandoWhatsApp({ tenantId: tenantKey, numero: senderNorm, comando: textoMensagem, resultado: 'negado_permissao' });
      return true;
    }
    const resCaixa = gerarResumoCaixa(tenantState);
    await msg.reply(resCaixa);
    await auditarComandoWhatsApp({ tenantId: tenantKey, numero: senderNorm, comando: textoMensagem, resultado: 'sucesso' });
    return true;
  }

  // 5. Entradas e Saídas do Dia
  if (isComandoMovimentosDia) {
    if (isContextOperacao || !isContextAdmin) {
      await msg.reply('🔒 *Acesso Restrito:* As movimentações financeiras do dia são disponibilizadas exclusivamente para administradores autorizados.');
      await auditarComandoWhatsApp({ tenantId: tenantKey, numero: senderNorm, comando: textoMensagem, resultado: 'negado_permissao' });
      return true;
    }
    const agoraSP = financialEngine.obterAgoraSP();
    const dHoje = agoraSP.dataISO;
    const movimentos = Array.isArray(tenantState.movimentos) ? tenantState.movimentos : [];
    const movsHoje = movimentos.filter(m => (m.data || '').slice(0, 10) === dHoje);

    let totEntradas = 0;
    let totSaidas = 0;
    movsHoje.forEach(m => {
      const v = Number(m.valor) || 0;
      if (m.tipo === 'entrada') totEntradas += v;
      else totSaidas += v;
    });

    const saldoDia = totEntradas - totSaidas;
    let txtMov = `📊 *ENTRADAS E SAÍDAS DE HOJE (${agoraSP.dataBR})* 💵\n\n• 🟢 *Total de Entradas:* ${financialEngine.formatarMoeda(totEntradas)}\n• 🔴 *Total de Saídas:* ${financialEngine.formatarMoeda(totSaidas)}\n• ⚖️ *Resultado do Dia:* ${saldoDia >= 0 ? '+' : ''}${financialEngine.formatarMoeda(saldoDia)}\n\n`;

    if (movsHoje.length === 0) {
      txtMov += `_Nenhuma movimentação avulsa registrada no caixa hoje até o momento._`;
    } else {
      txtMov += `📋 *Últimos Lançamentos:*\n`;
      const ultimos = movsHoje.slice(0, 6);
      ultimos.forEach(m => {
        const icone = m.tipo === 'entrada' ? '🟢' : '🔴';
        const horaFmt = m.hora || (m.criadoEm ? (m.criadoEm.slice(11, 16)) : '');
        txtMov += `${icone} ${financialEngine.formatarMoeda(m.valor)} — ${m.descricao || m.categoria || 'Lançamento'}${horaFmt ? ` (${horaFmt})` : ''}\n`;
      });
      if (movsHoje.length > 6) txtMov += `_... e mais ${movsHoje.length - 6} lançamento(s) registrados._\n`;
    }
    await msg.reply(txtMov);
    await auditarComandoWhatsApp({ tenantId: tenantKey, numero: senderNorm, comando: textoMensagem, resultado: 'sucesso' });
    return true;
  }

  // 6. Contas do Dia
  if (isComandoContasDia) {
    if (isContextOperacao || !isContextAdmin) {
      await msg.reply('🔒 *Acesso Restrito:* Contas a pagar e a receber são disponibilizadas exclusivamente para administradores autorizados.');
      await auditarComandoWhatsApp({ tenantId: tenantKey, numero: senderNorm, comando: textoMensagem, resultado: 'negado_permissao' });
      return true;
    }
    const agoraSP = financialEngine.obterAgoraSP();
    const dHoje = agoraSP.dataISO;
    const contas = Array.isArray(tenantState.contas) ? tenantState.contas : [];
    const aPagarHoje = contas.filter(c => c.tipo === 'pagar' && !c.pago && (c.venc || '').slice(0, 10) === dHoje);
    const aReceberHoje = contas.filter(c => c.tipo === 'receber' && !c.pago && (c.venc || '').slice(0, 10) === dHoje);
    const totPagarHoje = aPagarHoje.reduce((acc, c) => acc + (Number(c.valor) || 0), 0);
    const totReceberHoje = aReceberHoje.reduce((acc, c) => acc + (Number(c.valor) || 0), 0);
    const liquido = totReceberHoje - totPagarHoje;

    let txtContas = `📅 *TÍTULOS E VENCIMENTOS DE HOJE (${agoraSP.dataBR})* 🏢\n\n🟢 *A Receber:* ${financialEngine.formatarMoeda(totReceberHoje)} (${aReceberHoje.length} título(s))\n🔴 *A Pagar:* ${financialEngine.formatarMoeda(totPagarHoje)} (${aPagarHoje.length} conta(s))\n⚖️ *Previsão Líquida:* ${liquido >= 0 ? '+' : ''}${financialEngine.formatarMoeda(liquido)}\n\n`;
    if (aPagarHoje.length > 0) {
      txtContas += `🔴 *Contas a Pagar Hoje:*\n`;
      aPagarHoje.slice(0, 4).forEach(c => { txtContas += `• #${c.id} - ${c.desc || c.parte || 'Fornecedor'}: ${financialEngine.formatarMoeda(c.valor)}\n`; });
      if (aPagarHoje.length > 4) txtContas += `_... e mais ${aPagarHoje.length - 4} conta(s)._\n`;
      txtContas += `\n`;
    }
    if (aReceberHoje.length > 0) {
      txtContas += `🟢 *Títulos a Receber Hoje:*\n`;
      aReceberHoje.slice(0, 4).forEach(c => { txtContas += `• #${c.id} - ${c.desc || c.parte || 'Cliente'}: ${financialEngine.formatarMoeda(c.valor)}\n`; });
      if (aReceberHoje.length > 4) txtContas += `_... e mais ${aReceberHoje.length - 4} título(s)._\n`;
      txtContas += `\n`;
    }
    if (aPagarHoje.length === 0 && aReceberHoje.length === 0) {
      txtContas += `_Nenhum vencimento de contas a pagar ou a receber agendado para hoje._`;
    } else {
      txtContas += `💡 *Para liquidar pelo WhatsApp:* envie *baixar <id> [forma]*\n`;
    }
    await msg.reply(txtContas);
    await auditarComandoWhatsApp({ tenantId: tenantKey, numero: senderNorm, comando: textoMensagem, resultado: 'sucesso' });
    return true;
  }

  // 7. DRE Operacional
  if (isComandoDRE) {
    if (isContextOperacao || !isContextAdmin) {
      await msg.reply('🔒 *Acesso Restrito:* O Demonstrativo de Resultado Operacional (DRE) é disponibilizado exclusivamente para administradores autorizados.');
      await auditarComandoWhatsApp({ tenantId: tenantKey, numero: senderNorm, comando: textoMensagem, resultado: 'negado_permissao' });
      return true;
    }
    const dre = financialAnalystService.calcularDREOperacional(tenantState, { filtro: '30d' });
    const msgDRE = financialEngine.formatarDREWhatsapp(dre, tenantState);
    await msg.reply(msgDRE);
    await auditarComandoWhatsApp({
      tenantId: tenantKey,
      numero: senderNorm,
      comando: textoMensagem,
      resultado: 'sucesso',
      detalhes: { receitaOperacionalBruta: dre.receitaOperacionalBruta, despesasOperacionais: dre.despesasOperacionais, custoPecasAplicadasOS: dre.custoPecasAplicadasOS, resultadoOperacionalLiquido: dre.resultadoOperacionalLiquido }
    });
    return true;
  }

  // 8. Aviso Retirada OS
  if (isComandoAvisoRetiradaOS && matchAvisoRetiradaOS) {
    const osIdParam = String(matchAvisoRetiradaOS[1]).replace(/^#/, '').trim();
    const avisoResult = financialAnalystService.gerarAvisoClienteOS(tenantState, osIdParam);
    if (!avisoResult.sucesso && !avisoResult.ok) {
      await msg.reply(`⚠️ *Falha ao gerar aviso:* Não foi possível localizar a OS #${osIdParam}.`);
      await auditarComandoWhatsApp({ tenantId: tenantKey, numero: senderNorm, comando: textoMensagem, resultado: 'falha_nao_encontrado' });
      return true;
    }
    await msg.reply(avisoResult.textoWhatsapp);
    await auditarComandoWhatsApp({ tenantId: tenantKey, numero: senderNorm, comando: textoMensagem, resultado: 'sucesso', detalhes: { osId: osIdParam, cliente: avisoResult.cliente, saldoRestante: avisoResult.saldoRestante, statusLiberacaoPatio: avisoResult.statusLiberacaoPatio } });
    return true;
  }

  // 9. Cobrança OS
  if (isComandoCobrancaOS && matchCobrancaOS) {
    const osIdParam = String(matchCobrancaOS[1]).replace(/^#/, '').trim();
    const cobrancaResult = financialAnalystService.gerarTextoCobrancaOS(tenantState, osIdParam);
    if (!cobrancaResult.ok) {
      await msg.reply(`⚠️ *Falha ao gerar cobrança:* Não foi possível localizar a OS #${osIdParam}.`);
      await auditarComandoWhatsApp({ tenantId: tenantKey, numero: senderNorm, comando: textoMensagem, resultado: 'falha_nao_encontrado' });
      return true;
    }
    if (cobrancaResult.saldoRestante <= 0) {
      await msg.reply(`✅ *OS #${osIdParam} já está quitada!*\nNão há pendência financeira ativa para este veículo/cliente. Saldo devedor: R$ 0,00.`);
      await auditarComandoWhatsApp({ tenantId: tenantKey, numero: senderNorm, comando: textoMensagem, resultado: 'sucesso_quitada' });
      return true;
    }
    await msg.reply(cobrancaResult.textoCobranca);
    await auditarComandoWhatsApp({ tenantId: tenantKey, numero: senderNorm, comando: textoMensagem, resultado: 'sucesso', detalhes: { osId: osIdParam, cliente: cobrancaResult.clienteNome, saldoPendente: cobrancaResult.saldoRestante } });
    return true;
  }

  return false;
}

module.exports = {
  processarConsultasFinanceiras
};
