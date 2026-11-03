'use strict';

const {
  confirmacoesPendentes,
  execucoesEmAndamento,
  auditarComandoWhatsApp
} = require('./whatsappSecurity');
const {
  salvarEstado,
  recordSecurityAudit
} = require('../../../lib/serverContext');
const financialEngine = require('../../financialEngine');
const financialAnalystService = require('../../financialAnalystService');

/**
 * Trata resolução (confirmação ou cancelamento) de ação financeira pendente de confirmação em 2 etapas
 */
async function resolverConfirmacaoPendente(msg, ctx) {
  const c = (ctx && (ctx.tenantKey !== undefined || ctx.chavePendente !== undefined)) ? ctx : (msg || {});
  const { textoMensagem, tenantKey, tenantState, senderNorm, chavePendente, isComandoEscrita } = c;
  if (!ctx && msg && msg.msg) msg = msg.msg;
  if (isComandoEscrita || !confirmacoesPendentes.has(chavePendente)) {
    return false;
  }

  const pendente = confirmacoesPendentes.get(chavePendente);
  const agora = Date.now();

  if (agora > pendente.expiraEm) {
    confirmacoesPendentes.delete(chavePendente);
    const respExp = '⏳ *Operação Cancelada:* O prazo de 2 minutos para confirmação expirou. Por favor, envie o comando novamente se desejar realizar a operação.';
    await msg.reply(respExp);
    await auditarComandoWhatsApp({
      tenantId: tenantKey,
      numero: senderNorm,
      comando: textoMensagem,
      resultado: 'confirmacao_expirada',
      detalhes: { acao: pendente.acao, valor: pendente.valor }
    });
    return true;
  }

  const textoUpper = textoMensagem.toUpperCase().trim();
  const isConfirmacao = textoUpper === 'CONFIRMAR' || textoUpper === 'SIM';

  if (isConfirmacao) {
    if (execucoesEmAndamento.has(chavePendente)) {
      console.warn(`[WhatsApp Confirmação] Execução concorrente ignorada para ${chavePendente}`);
      return true;
    }
    execucoesEmAndamento.add(chavePendente);
    confirmacoesPendentes.delete(chavePendente);

    let resOp = null;
    let msgSucesso = '';
    const agoraIso = new Date().toISOString();

    try {
      if (pendente.acao === 'abrir_caixa') {
        resOp = financialAnalystService.abrirCaixa(tenantState, {
          tenantId: tenantKey,
          saldoInicial: pendente.valor,
          operador: senderNorm,
          operadorNome: pendente.perfil?.role || 'Operador',
          origem: 'whatsapp',
          canal: 'whatsapp',
          autorNumero: senderNorm,
          confirmadoEm: agoraIso
        });
        msgSucesso = resOp.ok
          ? `✅ *Caixa Aberto com Sucesso!*\n\n• Saldo Inicial: ${financialEngine.formatarMoeda(pendente.valor)}\n• Responsável: ${senderNorm}\n• Turno: #${resOp.caixa.id}`
          : `⚠️ Não foi possível abrir o caixa: ${resOp.error}`;
      } else if (pendente.acao === 'fechar_caixa') {
        resOp = financialAnalystService.fecharCaixa(tenantState, {
          tenantId: tenantKey,
          operador: senderNorm,
          operadorNome: pendente.perfil?.role || 'Operador',
          origem: 'whatsapp',
          canal: 'whatsapp',
          autorNumero: senderNorm,
          confirmadoEm: agoraIso
        });
        if (resOp.ok) {
          const rf = resOp.resumoFechamento || {};
          msgSucesso = `🔒 *Caixa Fechado com Sucesso!*\n\n• Saldo Final: ${financialEngine.formatarMoeda(rf.saldoFinalCalculado || resOp.caixaFechado?.saldoAtual || 0)}\n• Entradas: ${financialEngine.formatarMoeda(rf.totalEntradas || 0)}\n• Saídas: ${financialEngine.formatarMoeda(rf.totalSaidas || 0)}\n• Responsável: ${senderNorm}`;
        } else {
          msgSucesso = `⚠️ Não foi possível fechar o caixa: ${resOp.error}`;
        }
      } else if (pendente.acao === 'lancar_entrada') {
        resOp = financialAnalystService.registrarMovimentacao(tenantState, {
          tenantId: tenantKey,
          tipo: 'entrada',
          valor: pendente.valor,
          descricao: pendente.descricao,
          formaPagamento: pendente.formaPagamento,
          forma: pendente.formaPagamento,
          osId: pendente.osId,
          placa: pendente.placa,
          operador: senderNorm,
          origem: 'whatsapp',
          canal: 'whatsapp',
          autorNumero: senderNorm,
          confirmadoEm: agoraIso
        });
        msgSucesso = resOp.ok
          ? `✅ *Entrada Registrada com Sucesso!*\n\n• Valor: ${financialEngine.formatarMoeda(pendente.valor)}\n• Descrição: ${pendente.descricao}\n• Saldo Atual do Caixa: ${financialEngine.formatarMoeda(resOp.saldoCaixaAtual || 0)}`
          : `⚠️ Não foi possível registrar a entrada: ${resOp.error}`;
      } else if (pendente.acao === 'lancar_saida') {
        resOp = financialAnalystService.registrarMovimentacao(tenantState, {
          tenantId: tenantKey,
          tipo: 'saida',
          valor: pendente.valor,
          descricao: pendente.descricao,
          formaPagamento: pendente.formaPagamento,
          forma: pendente.formaPagamento,
          osId: pendente.osId,
          placa: pendente.placa,
          operador: senderNorm,
          origem: 'whatsapp',
          canal: 'whatsapp',
          autorNumero: senderNorm,
          confirmadoEm: agoraIso
        });
        msgSucesso = resOp.ok
          ? `🔴 *Saída Registrada com Sucesso!*\n\n• Valor: ${financialEngine.formatarMoeda(pendente.valor)}\n• Descrição: ${pendente.descricao}\n• Saldo Atual do Caixa: ${financialEngine.formatarMoeda(resOp.saldoCaixaAtual || 0)}`
          : `⚠️ Não foi possível registrar a saída: ${resOp.error}`;
      } else if (pendente.acao === 'estornar_movimento') {
        resOp = financialAnalystService.estornarMovimentacao(tenantState, {
          movimentoId: pendente.movimentoId,
          motivo: pendente.descricao,
          operador: senderNorm,
          operadorNome: `WhatsApp (${senderNorm})`,
          tenantId: tenantKey,
          origem: 'whatsapp',
          canal: 'whatsapp',
          autorNumero: senderNorm
        });
        if (resOp.ok) {
          msgSucesso = `↩️ *Estorno Realizado com Sucesso!*\n\n• Movimento Original: #${resOp.movimentoEstornado?.id} (Estornado)\n• Compensatório: #${resOp.movimentoCompensatorio?.id} (${financialEngine.formatarMoeda(resOp.movimentoCompensatorio?.valor)})\n• Saldo Atual do Caixa: ${financialEngine.formatarMoeda(resOp.saldoAtual != null ? resOp.saldoAtual : 0)}\n• Motivo: ${pendente.descricao}`;
          try {
            await recordSecurityAudit({
              tenantId: tenantKey,
              actorId: `whatsapp:${senderNorm}`,
              actorType: 'whatsapp_sender',
              action: 'financeiro:movimento:estornar',
              entity: 'movimento_financeiro',
              entityId: pendente.movimentoId,
              details: {
                movimentoId: pendente.movimentoId,
                compensatorioId: resOp.movimentoCompensatorio?.id,
                valor: resOp.movimentoCompensatorio?.valor,
                motivo: pendente.descricao,
                origemOriginal: resOp.movimentoEstornado?.origem || 'web',
                operador: senderNorm
              }
            });
          } catch (_) {}
        } else {
          msgSucesso = `⚠️ Não foi possível realizar o estorno: ${resOp.error}`;
        }
      } else if (pendente.acao === 'sangria_caixa') {
        resOp = financialAnalystService.registrarMovimentacao(tenantState, {
          tenantId: tenantKey,
          tipo: 'saida',
          subtipo: 'sangria',
          naturezaOperacao: 'sangria',
          valor: pendente.valor,
          descricao: pendente.descricao,
          formaPagamento: 'dinheiro',
          forma: 'dinheiro',
          categoria: 'Sangria de Caixa',
          operador: senderNorm,
          origem: 'whatsapp',
          canal: 'whatsapp',
          autorNumero: senderNorm,
          confirmadoEm: agoraIso
        });
        if (resOp.ok) {
          msgSucesso = `🏦 *Sangria de Caixa Realizada com Sucesso!*\n\n• Valor Retirado: ${financialEngine.formatarMoeda(pendente.valor)}\n• Motivo: ${pendente.descricao}\n• Saldo Atual do Caixa: ${financialEngine.formatarMoeda(resOp.saldoCaixaAtual || 0)}`;
          try {
            await recordSecurityAudit({
              tenantId: tenantKey,
              actorId: `whatsapp:${senderNorm}`,
              actorType: 'whatsapp_sender',
              action: 'financeiro:caixa:sangria',
              entity: 'caixa_diario',
              entityId: resOp.caixa?.id || null,
              details: {
                movimentoId: resOp.movimentacao?.id,
                valor: pendente.valor,
                motivo: pendente.descricao,
                saldoRestante: resOp.saldoCaixaAtual,
                operador: senderNorm
              }
            });
          } catch (_) {}
        } else {
          msgSucesso = `⚠️ Não foi possível realizar a sangria: ${resOp.error}`;
        }
      } else if (pendente.acao === 'suprimento_caixa') {
        resOp = financialAnalystService.registrarMovimentacao(tenantState, {
          tenantId: tenantKey,
          tipo: 'entrada',
          subtipo: 'suprimento',
          naturezaOperacao: 'suprimento',
          valor: pendente.valor,
          descricao: pendente.descricao,
          formaPagamento: 'dinheiro',
          forma: 'dinheiro',
          categoria: 'Suprimento de Caixa',
          operador: senderNorm,
          origem: 'whatsapp',
          canal: 'whatsapp',
          autorNumero: senderNorm,
          confirmadoEm: agoraIso
        });
        if (resOp.ok) {
          msgSucesso = `🪙 *Suprimento de Caixa Realizado com Sucesso!*\n\n• Valor Aportado: ${financialEngine.formatarMoeda(pendente.valor)}\n• Motivo: ${pendente.descricao}\n• Saldo Atual do Caixa: ${financialEngine.formatarMoeda(resOp.saldoCaixaAtual || 0)}`;
          try {
            await recordSecurityAudit({
              tenantId: tenantKey,
              actorId: `whatsapp:${senderNorm}`,
              actorType: 'whatsapp_sender',
              action: 'financeiro:caixa:suprimento',
              entity: 'caixa_diario',
              entityId: resOp.caixa?.id || null,
              details: {
                movimentoId: resOp.movimentacao?.id,
                valor: pendente.valor,
                motivo: pendente.descricao,
                saldoAtual: resOp.saldoCaixaAtual,
                operador: senderNorm
              }
            });
          } catch (_) {}
        } else {
          msgSucesso = `⚠️ Não foi possível registrar o suprimento: ${resOp.error}`;
        }
      } else if (pendente.acao === 'liquidar_titulo') {
        resOp = financialAnalystService.liquidarTituloFinanceiro(tenantState, {
          tenantId: tenantKey,
          id: pendente.tituloId,
          meioPagamento: pendente.formaPagamento,
          operador: senderNorm,
          origem: 'whatsapp',
          canal: 'whatsapp',
          autorNumero: senderNorm,
          confirmadoEm: agoraIso
        });
        if (resOp.ok) {
          const tit = resOp.titulo;
          const isReceber = tit.tipo === 'receber';
          msgSucesso = `✅ *Título Liquidado com Sucesso!*\n\n• Título: #${tit.id} (${isReceber ? 'Recebimento' : 'Pagamento'})\n• Descrição: ${tit.desc || tit.descricao || '-'}\n• Valor: ${financialEngine.formatarMoeda(tit.valor)}\n• Forma: ${String(tit.meioLiquidacao || pendente.formaPagamento).toUpperCase()}\n• Saldo Atual do Caixa: ${financialEngine.formatarMoeda(resOp.saldoCaixaAtual || 0)}`;
          try {
            await recordSecurityAudit({
              tenantId: tenantKey,
              actorId: `whatsapp:${senderNorm}`,
              actorType: 'whatsapp_sender',
              action: 'financeiro:titulo:liquidar',
              entity: 'contas_financeiras',
              entityId: tit.id,
              details: {
                tituloId: tit.id,
                tipo: tit.tipo,
                valor: tit.valor,
                meioPagamento: tit.meioLiquidacao,
                movimentoId: resOp.movimentacao?.id,
                saldoCaixaAtual: resOp.saldoCaixaAtual,
                operador: senderNorm,
                origem: 'whatsapp'
              }
            });
          } catch (_) {}
        } else {
          msgSucesso = `⚠️ Não foi possível liquidar o título: ${resOp.error}`;
        }
      } else if (pendente.acao === 'liberar_saida_os') {
        resOp = financialAnalystService.validarOuAutorizarSaidaPatioOS(tenantState, {
          osId: pendente.osId,
          forcarLiberacao: true,
          justificativa: pendente.justificativa,
          operador: {
            perfil: pendente.perfil?.role || 'dono',
            nome: `WhatsApp (${senderNorm})`,
            numero: senderNorm
          }
        });
        if (resOp.ok && resOp.autorizado) {
          msgSucesso = `🔓 *Liberação Excepcional de Pátio Concedida!*\n\n• OS: #${resOp.osId}\n• Status: Liberado em Exceção\n• Saldo Pendente: ${financialEngine.formatarMoeda(resOp.saldoRestante || 0)}\n• Justificativa: ${pendente.justificativa}\n• Autorizado por: ${resOp.liberacaoExcepcional?.autorizadoPor}`;
          try {
            await recordSecurityAudit({
              tenantId: tenantKey,
              actorId: `whatsapp:${senderNorm}`,
              actorType: 'whatsapp_sender',
              action: 'financeiro:os:liberar_saida_excepcional',
              entity: 'ordem_servico',
              entityId: String(resOp.osId),
              details: {
                osId: resOp.osId,
                saldoPendenteNaSaida: resOp.saldoRestante,
                justificativa: pendente.justificativa,
                perfil: pendente.perfil?.role || 'dono',
                autorizadoPor: `WhatsApp (${senderNorm})`,
                origem: 'whatsapp'
              }
            });
          } catch (_) {}
        } else {
          msgSucesso = `⚠️ Não foi possível autorizar a liberação da OS: ${resOp.error || resOp.message}`;
        }
      }

      try {
        await salvarEstado(tenantKey, tenantState);
      } catch (errPersist) {
        console.warn('[WhatsApp Handlers] Falha tolerante ao persistir estado:', errPersist.message);
      }
      await msg.reply(msgSucesso);
      await auditarComandoWhatsApp({
        tenantId: tenantKey,
        numero: senderNorm,
        comando: textoMensagem,
        resultado: resOp && resOp.ok ? 'sucesso' : 'falha_execucao',
        detalhes: {
          acao: pendente.acao,
          valor: pendente.valor,
          descricao: pendente.descricao,
          origem: 'whatsapp',
          confirmadoEm: agoraIso
        }
      });
    } finally {
      execucoesEmAndamento.delete(chavePendente);
    }
    return true;
  } else {
    // Qualquer outra resposta cancela imediatamente
    confirmacoesPendentes.delete(chavePendente);
    const respCancel = `❌ *Operação Cancelada:* A operação de ${pendente.descricaoAcao || pendente.acao} no valor de ${financialEngine.formatarMoeda(pendente.valor)} foi cancelada.`;
    await msg.reply(respCancel);
    await auditarComandoWhatsApp({
      tenantId: tenantKey,
      numero: senderNorm,
      comando: textoMensagem,
      resultado: 'cancelado',
      detalhes: { acao: pendente.acao, valor: pendente.valor, respostaRecebida: textoMensagem }
    });
    return true;
  }
}

module.exports = {
  resolverConfirmacaoPendente
};
