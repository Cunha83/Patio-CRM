'use strict';

const { recordSecurityAudit } = require('../../../lib/serverContext');
const financialEngine = require('../../financialEngine');
const financialAnalystService = require('../../financialAnalystService');
const { formatarMoeda, extrairValorMonetario } = require('./whatsappHelpers');
const {
  confirmacoesPendentes,
  auditarComandoWhatsApp,
  obterPerfilNumeroWhatsApp,
  podeExecutarEstorno
} = require('./whatsappSecurity');

const CONFIRMACAO_TTL_MS = 2 * 60 * 1000;

function validarValorComando(resValor, limiteMax, acao) {
  if (resValor.status === 'ausente') {
    return { ok: false, motivo: 'valor_ausente', msg: `⚠️ Não identifiquei o valor para ${acao}. Por favor, envie o comando com valor e motivo (ex: *${acao} 200 motivo*).` };
  }
  if (resValor.status === 'ambiguo') {
    return { ok: false, motivo: 'valor_ambiguo', msg: `⚠️ Identifiquei múltiplos valores no comando. Por favor, envie com um único valor (ex: *${acao} 200 motivo*).` };
  }
  if (resValor.valor > limiteMax) {
    return {
      ok: false,
      motivo: 'negado_limite',
      msg: `🚫 *Limite Excedido:* O valor informado (${financialEngine.formatarMoeda(resValor.valor)}) excede o limite máximo permitido via WhatsApp (${financialEngine.formatarMoeda(limiteMax)}). Realize pelo Pátio CRM Web.`
    };
  }
  return { ok: true, valor: resValor.valor };
}

/**
 * Processa comandos de sangria, suprimento, estorno, baixa/liquidação e liberação de OS
 */
async function processarComandosAjuste(msg, ctx) {
  const { textoMensagem, textoLower, tenantKey, tenantState, senderNorm, chavePendente, prefixoSubstituicao } = ctx;

  const isComandoSangria = textoLower.startsWith('!sangria') || textoLower.startsWith('sangria');
  const isComandoSuprimento = textoLower.startsWith('!suprimento') || textoLower.startsWith('suprimento');
  const isComandoEstorno = textoLower.startsWith('!estornar') || textoLower.startsWith('estornar');
  const isComandoBaixa = textoLower.startsWith('!baixar') || textoLower.startsWith('baixar') || textoLower.startsWith('pagar conta') || textoLower.startsWith('receber titulo') || textoLower.startsWith('receber título');
  const isComandoLiberarOS = textoLower.startsWith('!liberar os') || textoLower.startsWith('liberar os') || textoLower.startsWith('liberar o.s.');

  if (!isComandoSangria && !isComandoSuprimento && !isComandoEstorno && !isComandoBaixa && !isComandoLiberarOS) {
    return false;
  }

  const perfil = await obterPerfilNumeroWhatsApp({ tenantKey, numero: senderNorm, tenantState });
  const rawLimite = Number(tenantState?.cfg?.limiteValorLancamentoWhatsapp);
  const limiteMax = (!isNaN(rawLimite) && rawLimite > 0) ? rawLimite : 1000.00;

  // Sangria
  if (isComandoSangria) {
    const caixaAberto = financialAnalystService.obterCaixaAberto(tenantState, tenantKey);
    if (!caixaAberto) {
      await msg.reply('⚠️ Não há nenhum turno de caixa aberto no momento. Abra o caixa antes de realizar sangrias.');
      await auditarComandoWhatsApp({ tenantId: tenantKey, numero: senderNorm, comando: textoMensagem, resultado: 'recusado_sem_caixa_aberto' });
      return true;
    }
    const valCheck = validarValorComando(extrairValorMonetario(textoMensagem), limiteMax, 'sangria');
    if (!valCheck.ok) {
      await msg.reply(valCheck.msg);
      await auditarComandoWhatsApp({ tenantId: tenantKey, numero: senderNorm, comando: textoMensagem, resultado: valCheck.motivo });
      return true;
    }
    const valorFinal = valCheck.valor;
    if (valorFinal > (caixaAberto.saldoAtual || 0)) {
      await msg.reply(`🚫 *Saldo Insuficiente:* O valor solicitado para sangria (${financialEngine.formatarMoeda(valorFinal)}) excede o saldo disponível no caixa (${financialEngine.formatarMoeda(caixaAberto.saldoAtual || 0)}).`);
      await auditarComandoWhatsApp({ tenantId: tenantKey, numero: senderNorm, comando: textoMensagem, resultado: 'recusado_saldo_insuficiente', detalhes: { acao: 'sangria', valor: valorFinal, saldoAtual: caixaAberto.saldoAtual } });
      return true;
    }
    const matchDesc = textoMensagem.match(/(?:motivo|para|referente\s+a|descrição|descricao)\s+(.+)$/i);
    const motivoFinal = matchDesc ? matchDesc[1].trim() : (textoMensagem.replace(/^!?sangria\s*(?:de\s+)?(?:r\$\s*)?[\d.,]+/i, '').trim() || 'Retirada de numerário para cofre/banco');

    confirmacoesPendentes.set(chavePendente, { acao: 'sangria_caixa', descricaoAcao: 'Sangria de Caixa', valor: valorFinal, descricao: motivoFinal, naturezaOperacao: 'sangria', formaPagamento: 'dinheiro', expiraEm: Date.now() + CONFIRMACAO_TTL_MS, tenantKey, fromNumber: senderNorm, perfil });
    const msgConfirm = prefixoSubstituicao + `⚠️ *CONFIRMAÇÃO DE SANGRIA DE CAIXA* ⚠️\n\nPor favor, confira os dados da retirada:\n• *Ação:* Sangria de Caixa (Saída de Espécie)\n• *Valor da Retirada:* ${financialEngine.formatarMoeda(valorFinal)}\n• *Saldo Atual:* ${financialEngine.formatarMoeda(caixaAberto.saldoAtual || 0)}\n• *Saldo Previsto Após Sangria:* ${financialEngine.formatarMoeda((caixaAberto.saldoAtual || 0) - valorFinal)}\n• *Destino / Motivo:* ${motivoFinal}\n\nPara executar, responda exatamente *CONFIRMAR* ou *SIM* em até 2 minutos.\nQualquer outra resposta cancelará esta operação.`;
    await msg.reply(msgConfirm);
    await auditarComandoWhatsApp({ tenantId: tenantKey, numero: senderNorm, comando: textoMensagem, resultado: 'aguardando_confirmacao', detalhes: { acao: 'sangria_caixa', valor: valorFinal, motivo: motivoFinal } });
    return true;
  }

  // Suprimento
  if (isComandoSuprimento) {
    const caixaAberto = financialAnalystService.obterCaixaAberto(tenantState, tenantKey);
    if (!caixaAberto) {
      await msg.reply('⚠️ Não há nenhum turno de caixa aberto no momento. Abra o caixa antes de realizar suprimentos.');
      await auditarComandoWhatsApp({ tenantId: tenantKey, numero: senderNorm, comando: textoMensagem, resultado: 'recusado_sem_caixa_aberto' });
      return true;
    }
    const valCheck = validarValorComando(extrairValorMonetario(textoMensagem), limiteMax, 'suprimento');
    if (!valCheck.ok) {
      await msg.reply(valCheck.msg);
      await auditarComandoWhatsApp({ tenantId: tenantKey, numero: senderNorm, comando: textoMensagem, resultado: valCheck.motivo });
      return true;
    }
    const valorFinal = valCheck.valor;
    const matchDesc = textoMensagem.match(/(?:motivo|para|referente\s+a|descrição|descricao)\s+(.+)$/i);
    const motivoFinal = matchDesc ? matchDesc[1].trim() : (textoMensagem.replace(/^!?suprimento\s*(?:de\s+)?(?:r\$\s*)?[\d.,]+/i, '').trim() || 'Aporte de troco no caixa');

    confirmacoesPendentes.set(chavePendente, { acao: 'suprimento_caixa', descricaoAcao: 'Suprimento de Caixa', valor: valorFinal, descricao: motivoFinal, naturezaOperacao: 'suprimento', formaPagamento: 'dinheiro', expiraEm: Date.now() + CONFIRMACAO_TTL_MS, tenantKey, fromNumber: senderNorm, perfil });
    const msgConfirm = prefixoSubstituicao + `⚠️ *CONFIRMAÇÃO DE SUPRIMENTO DE CAIXA* ⚠️\n\nPor favor, confira os dados do aporte:\n• *Ação:* Suprimento de Caixa (Fundo de Troco)\n• *Valor do Aporte:* ${financialEngine.formatarMoeda(valorFinal)}\n• *Saldo Atual:* ${financialEngine.formatarMoeda(caixaAberto.saldoAtual || 0)}\n• *Saldo Previsto Após Suprimento:* ${financialEngine.formatarMoeda((caixaAberto.saldoAtual || 0) + valorFinal)}\n• *Origem / Motivo:* ${motivoFinal}\n\nPara executar, responda exatamente *CONFIRMAR* ou *SIM* em até 2 minutos.\nQualquer outra resposta cancelará esta operação.`;
    await msg.reply(msgConfirm);
    await auditarComandoWhatsApp({ tenantId: tenantKey, numero: senderNorm, comando: textoMensagem, resultado: 'aguardando_confirmacao', detalhes: { acao: 'suprimento_caixa', valor: valorFinal, motivo: motivoFinal } });
    return true;
  }

  // Estorno
  if (isComandoEstorno) {
    if (!podeExecutarEstorno(perfil)) {
      await msg.reply(`🔒 *Acesso Negado:* Seu perfil de usuário (${perfil.role || 'desconhecido'}) não possui permissão para realizar estorno de movimentações financeiras. O estorno é restrito exclusivamente ao Dono/Administrador.`);
      try {
        await recordSecurityAudit({ tenantId: tenantKey, actorId: `whatsapp:${senderNorm}`, actorType: 'whatsapp_sender', action: 'financeiro:movimento:estorno_negado', entity: 'movimento_financeiro', details: { motivo: 'perfil_nao_autorizado', perfil: perfil.role, comando: textoMensagem } });
      } catch (_) {}
      await auditarComandoWhatsApp({ tenantId: tenantKey, numero: senderNorm, comando: textoMensagem, resultado: 'negado_permissao', detalhes: { perfil: perfil.role, acao: 'estornar' } });
      return true;
    }

    const matchEstorno = textoMensagem.match(/^!?estornar\s+(\S+)(?:\s+(.+))?$/i);
    if (!matchEstorno) {
      await msg.reply('⚠️ Formato inválido. Use: *estornar ultimo <motivo>* ou *estornar <ID> <motivo>* (ex: *estornar ultimo lançamento em duplicidade*).');
      await auditarComandoWhatsApp({ tenantId: tenantKey, numero: senderNorm, comando: textoMensagem, resultado: 'solicitado_esclarecimento_estorno', detalhes: { motivo: 'formato_invalido' } });
      return true;
    }

    const paramAlvo = matchEstorno[1].trim();
    const motivoEstorno = (matchEstorno[2] || '').trim();
    if (!motivoEstorno || motivoEstorno.length < 3) {
      await msg.reply('⚠️ O motivo do estorno é obrigatório e deve conter ao menos 3 caracteres (ex: *estornar ultimo valor digitado incorreto*).');
      await auditarComandoWhatsApp({ tenantId: tenantKey, numero: senderNorm, comando: textoMensagem, resultado: 'solicitado_esclarecimento_estorno', detalhes: { motivo: 'motivo_invalido' } });
      return true;
    }

    const caixaAberto = financialAnalystService.obterCaixaAberto(tenantState, tenantKey);
    const todosMovs = Array.isArray(tenantState.movimentos) ? tenantState.movimentos : [];
    let movAlvo = null;

    if (paramAlvo.toLowerCase() === 'ultimo' || paramAlvo.toLowerCase() === 'último') {
      const movsCandidatos = caixaAberto ? todosMovs.filter(m => (m.caixaId === caixaAberto.id) || (Array.isArray(caixaAberto.movimentacoesIds) && caixaAberto.movimentacoesIds.includes(m.id))) : todosMovs;
      movAlvo = movsCandidatos.find(m => !m.estornado && !m.estornoDeId && m.subtipo !== 'estorno');
      if (!movAlvo) {
        await msg.reply('⚠️ Não foi encontrada nenhuma movimentação ativa recente elegível para estorno no turno atual.');
        await auditarComandoWhatsApp({ tenantId: tenantKey, numero: senderNorm, comando: textoMensagem, resultado: 'recusado_movimento_nao_encontrado' });
        return true;
      }
    } else {
      movAlvo = todosMovs.find(m => m.id === paramAlvo || m.id.toLowerCase() === paramAlvo.toLowerCase() || m.id.endsWith(paramAlvo));
      if (!movAlvo) {
        await msg.reply(`⚠️ Movimentação com identificador "${paramAlvo}" não foi localizada.`);
        await auditarComandoWhatsApp({ tenantId: tenantKey, numero: senderNorm, comando: textoMensagem, resultado: 'recusado_movimento_nao_encontrado', detalhes: { paramAlvo } });
        return true;
      }
      if (movAlvo.estornado) {
        await msg.reply(`⚠️ A movimentação #${movAlvo.id} já foi estornada anteriormente por ${movAlvo.estornadoPor || 'outro operador'}.`);
        await auditarComandoWhatsApp({ tenantId: tenantKey, numero: senderNorm, comando: textoMensagem, resultado: 'recusado_ja_estornado', detalhes: { movimentoId: movAlvo.id } });
        return true;
      }
      if (movAlvo.estornoDeId || movAlvo.subtipo === 'estorno') {
        await msg.reply('⚠️ Não é permitido estornar um lançamento compensatório de estorno.');
        await auditarComandoWhatsApp({ tenantId: tenantKey, numero: senderNorm, comando: textoMensagem, resultado: 'recusado_estorno_compensatorio', detalhes: { movimentoId: movAlvo.id } });
        return true;
      }
    }

    confirmacoesPendentes.set(chavePendente, { acao: 'estornar_movimento', descricaoAcao: 'Estorno Contábil', movimentoId: movAlvo.id, movimentoOriginal: movAlvo, valor: Number(movAlvo.valor) || 0, descricao: motivoEstorno, expiraEm: Date.now() + CONFIRMACAO_TTL_MS, tenantKey, fromNumber: senderNorm, perfil });
    const isEntradaOriginal = movAlvo.tipo === 'entrada' || movAlvo.tipo === 'receita';
    const impactoSaldo = isEntradaOriginal ? `Débito de ${financialEngine.formatarMoeda(movAlvo.valor)} (reduz o saldo)` : `Crédito de ${financialEngine.formatarMoeda(movAlvo.valor)} (restaura o saldo)`;
    const msgConfirm = prefixoSubstituicao + `⚠️ *CONFIRMAÇÃO DE ESTORNO CONTÁBIL* ⚠️\n\nPor favor, confira os dados do estorno:\n• *Lançamento Alvo:* #${movAlvo.id} (${movAlvo.desc || movAlvo.descricao || 'Movimento'})\n• *Tipo Original:* ${isEntradaOriginal ? 'Entrada (+)' : 'Saída (−)'} de ${financialEngine.formatarMoeda(movAlvo.valor)}\n• *Impacto no Caixa:* ${impactoSaldo}\n• *Motivo do Estorno:* ${motivoEstorno}\n\nPara executar, responda exatamente *CONFIRMAR* ou *SIM* em até 2 minutos.\nQualquer outra resposta cancelará esta operação.`;
    await msg.reply(msgConfirm);
    await auditarComandoWhatsApp({ tenantId: tenantKey, numero: senderNorm, comando: textoMensagem, resultado: 'aguardando_confirmacao', detalhes: { acao: 'estornar_movimento', movimentoId: movAlvo.id, valor: movAlvo.valor, motivo: motivoEstorno } });
    return true;
  }

  // Baixa / Liquidação
  if (isComandoBaixa) {
    const matchBaixa = textoMensagem.match(/^(?:!baixar|baixar|pagar\s+conta|receber\s+t[ií]tulo)\s+([a-zA-Z0-9_\-]+)(?:\s+([a-zA-Z0-9_\-]+))?/i);
    if (!matchBaixa || !matchBaixa[1]) {
      await msg.reply('⚠️ Por favor, informe o identificador do título ou conta a ser baixado (ex: *baixar tit_123 pix* ou *baixar 101 dinheiro*).');
      await auditarComandoWhatsApp({ tenantId: tenantKey, numero: senderNorm, comando: textoMensagem, resultado: 'solicitado_esclarecimento_id', detalhes: { motivo: 'id_ausente' } });
      return true;
    }

    const idAlvo = matchBaixa[1].trim();
    const formaInformada = matchBaixa[2] ? matchBaixa[2].trim() : '';
    const contas = Array.isArray(tenantState.contas) ? tenantState.contas : [];
    const idNorm = idAlvo.toLowerCase();
    const idSemPrefixo = idNorm.replace(/^(?:tit_|cnt_|mov_|cta_)/, '');

    const tituloAlvo = contas.find(c => {
      const cId = String(c.id || '').toLowerCase();
      return cId === idNorm || cId.replace(/^(?:tit_|cnt_|mov_|cta_)/, '') === idSemPrefixo;
    });

    if (!tituloAlvo) {
      await msg.reply(`⚠️ Título ou conta #${idAlvo} não foi encontrado(a).`);
      await auditarComandoWhatsApp({ tenantId: tenantKey, numero: senderNorm, comando: textoMensagem, resultado: 'recusado_titulo_nao_encontrado', detalhes: { idAlvo } });
      return true;
    }
    if (tituloAlvo.pago || tituloAlvo.status === 'liquidado' || tituloAlvo.status === 'pago') {
      await msg.reply(`⚠️ O título #${tituloAlvo.id} já foi liquidado anteriormente em ${tituloAlvo.dataPagamento || tituloAlvo.dataPgto || 'data anterior'}.`);
      await auditarComandoWhatsApp({ tenantId: tenantKey, numero: senderNorm, comando: textoMensagem, resultado: 'recusado_titulo_ja_liquidado', detalhes: { tituloId: tituloAlvo.id } });
      return true;
    }

    const caixaAberto = financialAnalystService.obterCaixaAberto(tenantState, tenantKey);
    if (!caixaAberto) {
      await msg.reply('⚠️ Não há caixa aberto no momento para registrar a liquidação deste título. Abra o caixa primeiro para poder realizar baixas integradas.');
      await auditarComandoWhatsApp({ tenantId: tenantKey, numero: senderNorm, comando: textoMensagem, resultado: 'recusado_caixa_fechado', detalhes: { tituloId: tituloAlvo.id } });
      return true;
    }

    const valorFinal = Number(tituloAlvo.valor) || 0;
    if (valorFinal > limiteMax) {
      await msg.reply(`🚫 *Limite Excedido:* O valor do título #${tituloAlvo.id} (${financialEngine.formatarMoeda(valorFinal)}) excede o limite máximo permitido via WhatsApp (${financialEngine.formatarMoeda(limiteMax)}). Realize pelo painel Web.`);
      await auditarComandoWhatsApp({ tenantId: tenantKey, numero: senderNorm, comando: textoMensagem, resultado: 'negado_limite', detalhes: { acao: 'liquidar_titulo', tituloId: tituloAlvo.id, valor: valorFinal, limite: limiteMax } });
      return true;
    }

    const meioLiquidacao = formaInformada ? financialAnalystService.normalizarFormaPagamento(formaInformada) : (tituloAlvo.forma ? financialAnalystService.normalizarFormaPagamento(tituloAlvo.forma) : 'dinheiro');
    confirmacoesPendentes.set(chavePendente, { acao: 'liquidar_titulo', descricaoAcao: 'Liquidação de Título', tituloId: tituloAlvo.id, tituloOriginal: tituloAlvo, valor: valorFinal, formaPagamento: meioLiquidacao, descricao: tituloAlvo.desc || tituloAlvo.descricao || (tituloAlvo.tipo === 'receber' ? 'Recebimento' : 'Pagamento'), expiraEm: Date.now() + CONFIRMACAO_TTL_MS, tenantKey, fromNumber: senderNorm, perfil });
    const isReceber = tituloAlvo.tipo === 'receber';
    const impactoCaixa = isReceber ? `Crédito de ${financialEngine.formatarMoeda(valorFinal)} (entrada no caixa)` : `Débito de ${financialEngine.formatarMoeda(valorFinal)} (saída do caixa)`;
    const msgConfirm = prefixoSubstituicao + `⚠️ *CONFIRMAÇÃO DE LIQUIDAÇÃO FINANCEIRA* ⚠️\n\nPor favor, confira os dados da operação:\n• *Título / Conta:* #${tituloAlvo.id} (${isReceber ? 'Recebimento' : 'Pagamento'})\n• *Descrição / Parte:* ${tituloAlvo.desc || tituloAlvo.parte || 'Geral'}\n• *Valor:* ${financialEngine.formatarMoeda(valorFinal)}\n• *Meio de Pagamento:* ${meioLiquidacao.toUpperCase()}\n• *Impacto no Caixa:* ${impactoCaixa}\n\nPara executar, responda exatamente *CONFIRMAR* ou *SIM* em até 2 minutos.\nQualquer outra resposta cancelará esta operação.`;
    await msg.reply(msgConfirm);
    await auditarComandoWhatsApp({ tenantId: tenantKey, numero: senderNorm, comando: textoMensagem, resultado: 'aguardando_confirmacao', detalhes: { acao: 'liquidar_titulo', tituloId: tituloAlvo.id, valor: valorFinal, meio: meioLiquidacao } });
    return true;
  }

  // Liberar OS
  if (isComandoLiberarOS) {
    if (!podeExecutarEstorno(perfil)) {
      await msg.reply(`🔒 *Acesso Negado:* Seu perfil de usuário (${perfil.role || 'desconhecido'}) não possui permissão para conceder liberação excepcional de pátio. Esta ação é restrita exclusivamente ao Dono/Administrador.`);
      try {
        await recordSecurityAudit({ tenantId: tenantKey, actorId: `whatsapp:${senderNorm}`, actorType: 'whatsapp_sender', action: 'financeiro:os:liberar_saida_negada', entity: 'ordem_servico', details: { motivo: 'perfil_nao_autorizado', perfil: perfil.role, comando: textoMensagem } });
      } catch (_) {}
      await auditarComandoWhatsApp({ tenantId: tenantKey, numero: senderNorm, comando: textoMensagem, resultado: 'negado_permissao', detalhes: { perfil: perfil.role, acao: 'liberar_os' } });
      return true;
    }

    const matchLiberar = textoMensagem.match(/^!?liberar\s+os\s*#?\s*([a-zA-Z0-9_\-]+)(?:\s+(.+))?$/i);
    if (!matchLiberar || !matchLiberar[1]) {
      await msg.reply('⚠️ Formato inválido. Use: *liberar os <número> <justificativa>* (ex: *liberar os 101 Cliente VIP liberado com promissória assinada*).');
      await auditarComandoWhatsApp({ tenantId: tenantKey, numero: senderNorm, comando: textoMensagem, resultado: 'solicitado_esclarecimento_liberar_os', detalhes: { motivo: 'formato_invalido' } });
      return true;
    }

    const osAlvo = matchLiberar[1].trim();
    const justificativa = (matchLiberar[2] || '').trim();
    if (!justificativa || justificativa.length < 5) {
      await msg.reply('⚠️ A justificativa para liberação excepcional é obrigatória e deve ter pelo menos 5 caracteres (ex: *liberar os 101 Cliente VIP aprovado pelo dono*).');
      await auditarComandoWhatsApp({ tenantId: tenantKey, numero: senderNorm, comando: textoMensagem, resultado: 'solicitado_esclarecimento_justificativa', detalhes: { motivo: 'justificativa_invalida' } });
      return true;
    }

    const resumoOS = financialAnalystService.obterResumoFinanceiroOS(tenantState, osAlvo);
    if (['liberado_quitado', 'liberado_faturado', 'liberado_excepcional'].includes(resumoOS.statusLiberacaoPatio)) {
      const descStatus = resumoOS.statusLiberacaoPatio === 'liberado_quitado' ? 'Totalmente Quitada' : (resumoOS.statusLiberacaoPatio === 'liberado_faturado' ? 'Faturada a Prazo' : 'Exceção Auditada');
      await msg.reply(`ℹ️ A OS #${osAlvo} já se encontra liberada (${descStatus}). Não é necessária nova liberação.`);
      await auditarComandoWhatsApp({ tenantId: tenantKey, numero: senderNorm, comando: textoMensagem, resultado: 'recusado_os_ja_liberada', detalhes: { osId: osAlvo, status: resumoOS.statusLiberacaoPatio } });
      return true;
    }

    confirmacoesPendentes.set(chavePendente, { acao: 'liberar_saida_os', descricaoAcao: 'Liberação Excepcional de Pátio', osId: osAlvo, justificativa, valor: resumoOS.saldoRestante || 0, expiraEm: Date.now() + CONFIRMACAO_TTL_MS, tenantKey, fromNumber: senderNorm, perfil });
    const msgConfirm = prefixoSubstituicao + `⚠️ *CONFIRMAÇÃO DE LIBERAÇÃO EXCEPCIONAL DE PÁTIO* ⚠️\n\nPor favor, confira os dados da autorização:\n• *OS Alvo:* #${osAlvo} (${resumoOS.cliente || 'Geral'})\n• *Saldo Pendente em Aberto:* ${financialEngine.formatarMoeda(resumoOS.saldoRestante || 0)}\n• *Justificativa Auditada:* ${justificativa}\n• *Autorizador:* WhatsApp (${senderNorm}) [${perfil.role || 'dono'}]\n\nPara autorizar a saída deste veículo do pátio, responda exatamente *CONFIRMAR* ou *SIM* em até 2 minutos.\nQualquer outra resposta cancelará esta operação.`;
    await msg.reply(msgConfirm);
    await auditarComandoWhatsApp({ tenantId: tenantKey, numero: senderNorm, comando: textoMensagem, resultado: 'aguardando_confirmacao', detalhes: { acao: 'liberar_saida_os', osId: osAlvo, justificativa, saldoPendente: resumoOS.saldoRestante } });
    return true;
  }

  return false;
}

module.exports = {
  processarComandosAjuste
};
