'use strict';

const financialEngine = require('../../financialEngine');
const financialAnalystService = require('../../financialAnalystService');
const { formatarMoeda, extrairValorMonetario, extrairFormaPagamentoHeuristica, extrairOsEPlacaHeuristica } = require('./whatsappHelpers');
const {
  confirmacoesPendentes,
  auditarComandoWhatsApp,
  obterPerfilNumeroWhatsApp,
  podeExecutarEscritaFinanceira
} = require('./whatsappSecurity');

const CONFIRMACAO_TTL_MS = 2 * 60 * 1000;

function isAdminPhone(phone, adminList) {
  if (!phone) return false;
  const clean = String(phone).replace(/\D/g, '');
  return adminList.some(admin => {
    const cleanAdmin = String(admin).replace(/\D/g, '');
    return clean === cleanAdmin || clean.endsWith(cleanAdmin) || cleanAdmin.endsWith(clean);
  });
}

function validarValorComando(resValor, limiteMax, acao) {
  if (resValor.status === 'ausente') {
    if (acao === 'abrir caixa') {
      return { ok: false, motivo: 'valor_ausente', msg: '⚠️ Não identifiquei o saldo inicial em dinheiro para a abertura do caixa. Por favor, informe o comando com o valor (ex: *Abrir caixa com R$ 100,00*).' };
    }
    if (acao === 'lançar entrada') {
      return { ok: false, motivo: 'valor_ausente', msg: '⚠️ Não identifiquei o valor exato para o lançamento de entrada. Por favor, envie o comando com valor e descrição (ex: *Lançar entrada de R$ 150,00 referente a adiantamento*).' };
    }
    if (acao === 'lançar saída') {
      return { ok: false, motivo: 'valor_ausente', msg: '⚠️ Não identifiquei o valor exato para o lançamento de saída. Por favor, envie o comando com valor e descrição (ex: *Lançar saída de R$ 80,00 referente a compra de óleo*).' };
    }
    return { ok: false, motivo: 'valor_ausente', msg: `⚠️ Não identifiquei o valor para ${acao}. Por favor, informe o comando com o valor (ex: *${acao} com R$ 100,00*).` };
  }
  if (resValor.status === 'ambiguo') {
    const ex = acao === 'abrir caixa' ? 'Abrir caixa com R$ 100,00' : (acao === 'lançar entrada' ? 'Lançar entrada de R$ 150,00 referente a adiantamento' : 'Lançar saída de R$ 80,00 referente a compra de óleo');
    return { ok: false, motivo: 'valor_ambiguo', msg: `⚠️ Identifiquei múltiplos valores no comando. Para evitar divergência no caixa, por favor informe o comando com um único valor (ex: *${ex}*).` };
  }
  if (resValor.valor > limiteMax) {
    return {
      ok: false,
      motivo: 'negado_limite',
      msg: `🚫 *Limite Excedido:* O valor informado (${financialEngine.formatarMoeda(resValor.valor)}) excede o limite máximo via WhatsApp (${financialEngine.formatarMoeda(limiteMax)}). Realize pelo Pátio CRM Web.`
    };
  }
  return { ok: true, valor: resValor.valor };
}

/**
 * Processa comandos de abertura/fechamento de caixa e lançamentos de entrada/saída
 */
async function processarComandosCaixa(msg, ctx) {
  const { textoMensagem, textoLower, tenantKey, tenantState, senderNorm, isGroupMsg, chavePendente, prefixoSubstituicao } = ctx;

  const isComandoAbrir = /(?:abrir|iniciar|abertura\s+de)\s*(?:o\s+)?caixa/i.test(textoLower);
  const isComandoFechar = /(?:fechar|encerrar|fechamento\s+de)\s*(?:o\s+)?caixa/i.test(textoLower);
  const isComandoEntrada = (textoLower.includes('lançar entrada') || textoLower.includes('lancar entrada') || textoLower.includes('registrar entrada') || textoLower.startsWith('!entrada') || textoLower.startsWith('entrada de')) && !textoLower.includes('saída') && !textoLower.includes('saida');
  const isComandoSaida = (textoLower.includes('lançar saída') || textoLower.includes('lancar saida') || textoLower.includes('lançar despesa') || textoLower.includes('lancar despesa') || textoLower.includes('registrar saída') || textoLower.includes('registrar saida') || textoLower.startsWith('!saida') || textoLower.startsWith('!saída') || textoLower.startsWith('saída de') || textoLower.startsWith('saida de')) && !textoLower.includes('entrada');

  if (!isComandoAbrir && !isComandoFechar && !isComandoEntrada && !isComandoSaida) return false;

  if (!tenantState?.cfg?.comandosFinanceirosEscrita) {
    await msg.reply('🔒 *Operações Financeiras Desativadas:* Os comandos de movimentação e escrita financeira via WhatsApp estão desativados nas configurações. Para ativá-los, acesse as Configurações do WhatsApp no Pátio CRM Web.');
    await auditarComandoWhatsApp({ tenantId: tenantKey, numero: senderNorm, comando: textoMensagem, resultado: 'desativado_configuracao', detalhes: { flag: 'comandosFinanceirosEscrita', ativo: false } });
    return true;
  }

  const adminList = (process.env.WHATSAPP_ADMIN_NUMBERS || '').split(',').map(s => s.trim().replace(/\D/g, '')).filter(Boolean);
  if (tenantState?.cfg?.adminFones && Array.isArray(tenantState.cfg.adminFones)) {
    tenantState.cfg.adminFones.forEach(f => {
      const clean = String(f).replace(/\D/g, '');
      if (clean && !adminList.includes(clean)) adminList.push(clean);
    });
  }

  if (isGroupMsg && !isAdminPhone(senderNorm, adminList)) {
    await msg.reply('🔒 *Acesso Negado:* Comandos de escrita financeira via grupo exigem que o remetente esteja cadastrado na lista autorizada (whitelist).');
    await auditarComandoWhatsApp({ tenantId: tenantKey, numero: senderNorm, comando: textoMensagem, resultado: 'negado_permissao', detalhes: { motivo: 'remetente_grupo_nao_whitelist' } });
    return true;
  }

  const perfil = await obterPerfilNumeroWhatsApp({ tenantKey, numero: senderNorm, tenantState });
  if (!podeExecutarEscritaFinanceira(perfil)) {
    await msg.reply(`🔒 *Acesso Negado:* Seu perfil de usuário (${perfil.role || 'desconhecido'}) não possui permissão para realizar operações de escrita no caixa. Esta operação é restrita a Donos e Financeiro.`);
    await auditarComandoWhatsApp({ tenantId: tenantKey, numero: senderNorm, comando: textoMensagem, resultado: 'negado_permissao', detalhes: { perfil: perfil.role } });
    return true;
  }

  const rawLimite = Number(tenantState?.cfg?.limiteValorLancamentoWhatsapp);
  const limiteMax = (!isNaN(rawLimite) && rawLimite > 0) ? rawLimite : 1000.00;
  const caixaAberto = financialAnalystService.obterCaixaAberto(tenantState, tenantKey);

  if (isComandoAbrir) {
    if (caixaAberto) {
      await msg.reply(`⚠️ Já existe um caixa aberto no momento (#${caixaAberto.id}). Feche o caixa atual antes de iniciar um novo turno.`);
      await auditarComandoWhatsApp({ tenantId: tenantKey, numero: senderNorm, comando: textoMensagem, resultado: 'recusado_caixa_ja_aberto' });
      return true;
    }
    const valCheck = validarValorComando(extrairValorMonetario(textoMensagem), limiteMax, 'abrir caixa');
    if (!valCheck.ok) {
      await msg.reply(valCheck.msg);
      await auditarComandoWhatsApp({ tenantId: tenantKey, numero: senderNorm, comando: textoMensagem, resultado: valCheck.motivo });
      return true;
    }
    confirmacoesPendentes.set(chavePendente, { acao: 'abrir_caixa', descricaoAcao: 'Abertura de Caixa', valor: valCheck.valor, descricao: 'Abertura de caixa com saldo inicial', expiraEm: Date.now() + CONFIRMACAO_TTL_MS, tenantKey, fromNumber: senderNorm, perfil });
    const msgConfirm = prefixoSubstituicao + `⚠️ *CONFIRMAÇÃO DE OPERAÇÃO FINANCEIRA* ⚠️\n\nPor favor, confira os dados da operação:\n• *Ação:* Abertura de Caixa\n• *Valor:* ${financialEngine.formatarMoeda(valCheck.valor)}\n• *Descrição:* Abertura de caixa com saldo inicial\n\nPara executar, responda exatamente *CONFIRMAR* ou *SIM* em até 2 minutos.\nQualquer outra resposta cancelará esta operação.`;
    await msg.reply(msgConfirm);
    await auditarComandoWhatsApp({ tenantId: tenantKey, numero: senderNorm, comando: textoMensagem, resultado: 'aguardando_confirmacao', detalhes: { acao: 'abrir_caixa', valor: valCheck.valor } });
    return true;
  }

  if (isComandoFechar) {
    if (!caixaAberto) {
      await msg.reply('⚠️ Não há nenhum turno de caixa aberto no momento para ser encerrado.');
      await auditarComandoWhatsApp({ tenantId: tenantKey, numero: senderNorm, comando: textoMensagem, resultado: 'recusado_sem_caixa_aberto' });
      return true;
    }
    const valorFinal = caixaAberto.saldoAtual || 0;
    confirmacoesPendentes.set(chavePendente, { acao: 'fechar_caixa', descricaoAcao: 'Fechamento de Caixa', valor: valorFinal, descricao: `Fechamento do Caixa #${caixaAberto.id}`, expiraEm: Date.now() + CONFIRMACAO_TTL_MS, tenantKey, fromNumber: senderNorm, perfil });
    const msgConfirm = prefixoSubstituicao + `⚠️ *CONFIRMAÇÃO DE OPERAÇÃO FINANCEIRA* ⚠️\n\nPor favor, confira os dados da operação:\n• *Ação:* Fechamento de Caixa\n• *Valor em Caixa:* ${financialEngine.formatarMoeda(valorFinal)}\n• *Descrição:* Fechamento do Caixa #${caixaAberto.id}\n\nPara executar, responda exatamente *CONFIRMAR* ou *SIM* em até 2 minutos.\nQualquer outra resposta cancelará esta operação.`;
    await msg.reply(msgConfirm);
    await auditarComandoWhatsApp({ tenantId: tenantKey, numero: senderNorm, comando: textoMensagem, resultado: 'aguardando_confirmacao', detalhes: { acao: 'fechar_caixa', valor: valorFinal } });
    return true;
  }

  if (isComandoEntrada || isComandoSaida) {
    const isEnt = isComandoEntrada;
    const nomeAcao = isEnt ? 'Lançar Entrada' : 'Lançar Saída';
    const acaoKey = isEnt ? 'lancar_entrada' : 'lancar_saida';

    if (!caixaAberto) {
      await msg.reply(`⚠️ Não há nenhum turno de caixa aberto no momento. Abra o caixa antes de registrar ${isEnt ? 'entradas' : 'saídas'}.`);
      await auditarComandoWhatsApp({ tenantId: tenantKey, numero: senderNorm, comando: textoMensagem, resultado: 'recusado_sem_caixa_aberto' });
      return true;
    }
    const valCheck = validarValorComando(extrairValorMonetario(textoMensagem), limiteMax, isEnt ? 'lançar entrada' : 'lançar saída');
    if (!valCheck.ok) {
      await msg.reply(valCheck.msg);
      await auditarComandoWhatsApp({ tenantId: tenantKey, numero: senderNorm, comando: textoMensagem, resultado: valCheck.motivo });
      return true;
    }

    const matchDesc = textoMensagem.match(/(?:referente\s+a|motivo|para|com|descrição|descricao)\s+(.+)$/i);
    const descricaoFinal = matchDesc ? matchDesc[1].trim() : (isEnt ? 'Entrada avulsa no caixa' : 'Saída avulsa do caixa');
    const formaPagamentoFinal = extrairFormaPagamentoHeuristica(textoMensagem);
    const { osId: osFinal, placa: placaFinal } = extrairOsEPlacaHeuristica(textoMensagem);

    confirmacoesPendentes.set(chavePendente, {
      acao: acaoKey,
      descricaoAcao: nomeAcao,
      valor: valCheck.valor,
      descricao: descricaoFinal,
      formaPagamento: formaPagamentoFinal,
      osId: osFinal,
      placa: placaFinal,
      expiraEm: Date.now() + CONFIRMACAO_TTL_MS,
      tenantKey,
      fromNumber: senderNorm,
      perfil
    });

    let detalhesExtras = `• *Meio de Pgto:* ${formaPagamentoFinal.toUpperCase()}\n`;
    if (osFinal) detalhesExtras += `• *OS Vinculada:* #${osFinal}\n`;
    if (placaFinal) detalhesExtras += `• *Veículo / Placa:* ${placaFinal}\n`;

    const msgConfirm = prefixoSubstituicao + `⚠️ *CONFIRMAÇÃO DE OPERAÇÃO FINANCEIRA* ⚠️\n\nPor favor, confira os dados da operação:\n• *Ação:* ${nomeAcao}\n• *Valor:* ${financialEngine.formatarMoeda(valCheck.valor)}\n${detalhesExtras}• *Descrição:* ${descricaoFinal}\n\nPara executar, responda exatamente *CONFIRMAR* ou *SIM* em até 2 minutos.\nQualquer outra resposta cancelará esta operação.`;
    await msg.reply(msgConfirm);
    await auditarComandoWhatsApp({ tenantId: tenantKey, numero: senderNorm, comando: textoMensagem, resultado: 'aguardando_confirmacao', detalhes: { acao: acaoKey, valor: valCheck.valor, descricao: descricaoFinal, formaPagamento: formaPagamentoFinal, osId: osFinal, placa: placaFinal } });
    return true;
  }

  return false;
}

module.exports = {
  processarComandosCaixa
};
