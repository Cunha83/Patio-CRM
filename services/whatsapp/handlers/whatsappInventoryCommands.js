'use strict';

const { auditarComandoWhatsApp } = require('./whatsappSecurity');
const { salvarEstado, recordSecurityAudit } = require('../../../lib/serverContext');
const financialEngine = require('../../financialEngine');
const financialAnalystService = require('../../financialAnalystService');

async function processarComandosEstoque(msg, ctx) {
  const c = (ctx && ctx.textoLower !== undefined) ? ctx : (msg || {});
  const { textoMensagem, textoLower, tenantKey, tenantState, senderNorm } = c;
  if (!ctx && msg && msg.msg) msg = msg.msg;
  const matchEstoque = textoLower.match(/^!?(?:consultar\s+pe[çc]a|estoque)(?:\s+(.+))?$/i);
  const matchRequisitarPeca = textoLower.match(/^!?pe[çc]a\s+os\s*#?\s*([a-zA-Z0-9_\-]+)\s+(\d+(?:[.,]\d+)?)\s+(.+)$/i);
  const matchLiberarGargalo = textoLower.match(/^!?(?:chegou\s+pe[çc]a\s+os|retomar\s+os)\s*#?\s*([a-zA-Z0-9_\-]+)(?:\s+(.+))?$/i);
  const matchDevolverPeca = textoLower.match(/^!?devolver\s+pe[çc]a\s+os\s*#?\s*([a-zA-Z0-9_\-]+)\s+(.+)$/i);

  // 1. Comando: estoque [termo] ou consultar peca <termo>
  if (matchEstoque) {
    const termoParam = (matchEstoque[1] || '').trim();
    const resultadoEst = financialAnalystService.listarEstoquePecas(tenantState, { termo: termoParam });

    let respEst = `📦 *Catálogo de Estoque & Peças* 🔩\n`;
    if (termoParam) respEst += `_Filtro aplicado:_ "${termoParam}"\n`;
    respEst += `\n`;

    if (resultadoEst.pecas.length === 0) {
      respEst += `Nenhum item localizado no estoque para o filtro informado.\n`;
    } else {
      for (const p of resultadoEst.pecas.slice(0, 8)) {
        const alertaCritico = p.quantidade <= p.estoqueMinimo ? ` ⚠️ *CRÍTICO*` : '';
        respEst += `• *[${p.codigo}]* ${p.nome}\n`;
        respEst += `  Saldo: *${p.quantidade} un* (Mín: ${p.estoqueMinimo})${alertaCritico} | Preço: ${financialEngine.formatarMoeda(p.precoVenda)}\n`;
      }
      if (resultadoEst.pecas.length > 8) {
        respEst += `_... e mais ${resultadoEst.pecas.length - 8} item(ns) cadastrados._\n`;
      }
    }

    respEst += `\n📊 *Resumo Geral:* ${resultadoEst.resumoEstoque.totalItens} itens únicos | ${resultadoEst.resumoEstoque.itensAbaixoMinimo} abaixo do mínimo | Custo total: ${financialEngine.formatarMoeda(resultadoEst.resumoEstoque.valorTotalCusto)}`;

    await msg.reply(respEst.trim());
    await auditarComandoWhatsApp({
      tenantId: tenantKey,
      numero: senderNorm,
      comando: textoMensagem,
      resultado: 'sucesso',
      detalhes: { termo: termoParam, totalEncontrado: resultadoEst.pecas.length }
    });
    return true;
  }

  // 2. Comando: peca os <osId> <qtd> <nome_ou_codigo>
  if (matchRequisitarPeca) {
    const osParam = matchRequisitarPeca[1].trim();
    const qtdParam = parseFloat(matchRequisitarPeca[2].replace(',', '.'));
    const pecaParam = matchRequisitarPeca[3].trim();

    try {
      const resReq = financialAnalystService.requisitarPecaOS(tenantState, {
        osId: osParam,
        pecaIdOuNome: pecaParam,
        quantidade: qtdParam,
        operador: {
          actorId: `whatsapp:${senderNorm}`,
          nome: `WhatsApp (${senderNorm})`
        }
      });

      try {
        await salvarEstado(tenantKey, tenantState);
      } catch (errPersist) {
        console.warn('[WhatsApp Handlers] Falha ao persistir requisição de peça:', errPersist.message);
      }

      try {
        await recordSecurityAudit({
          tenantId: tenantKey,
          actorId: `whatsapp:${senderNorm}`,
          actorType: 'whatsapp_sender',
          action: 'patio:os:requisitar_peca',
          entity: 'ordem_servico',
          entityId: String(resReq.osId),
          details: {
            osId: resReq.osId,
            peca: resReq.peca,
            origem: 'whatsapp'
          }
        });
      } catch (_) {}

      const msgSucesso = `🔩 *Peça Requisitada na OS!* 📦\n\n• *OS:* #${resReq.osNum}\n• *Peça:* ${resReq.peca.quantidade}x ${resReq.peca.nome}\n• *Subtotal:* ${financialEngine.formatarMoeda(resReq.peca.subtotal)}\n• *Saldo em Estoque:* ${resReq.saldoEstoqueRestante != null ? `${resReq.saldoEstoqueRestante} un` : 'Avulso'}\n• *Total Peças da OS:* ${financialEngine.formatarMoeda(resReq.totalPecasOS)}`;
      await msg.reply(msgSucesso);
      await auditarComandoWhatsApp({
        tenantId: tenantKey,
        numero: senderNorm,
        comando: textoMensagem,
        resultado: 'sucesso',
        detalhes: { osId: resReq.osId, peca: resReq.peca.nome, quantidade: qtdParam }
      });
      return true;
    } catch (err) {
      const msgErro = err.code === 'ESTOQUE_INSUFICIENTE'
        ? `⚠️ *Estoque Insuficiente:* ${err.message}`
        : `⚠️ *Não foi possível requisitar a peça:* ${err.message}`;
      await msg.reply(msgErro);
      await auditarComandoWhatsApp({
        tenantId: tenantKey,
        numero: senderNorm,
        comando: textoMensagem,
        resultado: err.code === 'ESTOQUE_INSUFICIENTE' ? 'estoque_insuficiente' : 'falha',
        detalhes: { erro: err.message, code: err.code }
      });
      return true;
    }
  }

  // 3. Comando: chegou peca os <osId> [obs] ou retomar os <osId>
  if (matchLiberarGargalo) {
    const osParam = matchLiberarGargalo[1].trim();
    const obsParam = (matchLiberarGargalo[2] || '').trim();

    try {
      const resLib = financialAnalystService.liberarGargaloPecaOS(tenantState, {
        osId: osParam,
        observacao: obsParam || 'Peça chegou via WhatsApp',
        operador: {
          actorId: `whatsapp:${senderNorm}`,
          nome: `WhatsApp (${senderNorm})`
        }
      });

      try {
        await salvarEstado(tenantKey, tenantState);
      } catch (errPersist) {
        console.warn('[WhatsApp Handlers] Falha ao persistir liberação de gargalo:', errPersist.message);
      }

      try {
        await recordSecurityAudit({
          tenantId: tenantKey,
          actorId: `whatsapp:${senderNorm}`,
          actorType: 'whatsapp_sender',
          action: 'patio:os:liberar_gargalo_peca',
          entity: 'ordem_servico',
          entityId: String(resLib.osId),
          details: {
            osId: resLib.osId,
            boxId: resLib.boxId,
            boxStatus: resLib.boxStatus,
            origem: 'whatsapp'
          }
        });
      } catch (_) {}

      const msgSucesso = `🚀 *Gargalo Desbloqueado! OS Retomada* ⚙️\n\n• *OS:* #${resLib.osNum}\n• *Etapa:* Em Execução\n• *Box:* ${resLib.boxId || 'N/A'} (Status: ${resLib.boxStatus || 'ocupado'})\n• *Aviso:* Veículo liberado para avanço mecânico no pátio.`;
      await msg.reply(msgSucesso);
      await auditarComandoWhatsApp({
        tenantId: tenantKey,
        numero: senderNorm,
        comando: textoMensagem,
        resultado: 'sucesso',
        detalhes: { osId: resLib.osId, boxId: resLib.boxId }
      });
      return true;
    } catch (err) {
      await msg.reply(`⚠️ *Falha ao liberar gargalo da OS:* ${err.message}`);
      await auditarComandoWhatsApp({
        tenantId: tenantKey,
        numero: senderNorm,
        comando: textoMensagem,
        resultado: 'falha',
        detalhes: { erro: err.message }
      });
      return true;
    }
  }

  // 4. Comando: devolver peca os <osId> <nome_ou_codigo>
  if (matchDevolverPeca) {
    const osParam = matchDevolverPeca[1].trim();
    const pecaParam = matchDevolverPeca[2].trim();

    try {
      const resEstorno = financialAnalystService.estornarPecaOS(tenantState, {
        osId: osParam,
        itemIndexOuPecaId: pecaParam,
        motivo: 'Devolução solicitada via WhatsApp',
        operador: {
          actorId: `whatsapp:${senderNorm}`,
          nome: `WhatsApp (${senderNorm})`
        }
      });

      try {
        await salvarEstado(tenantKey, tenantState);
      } catch (errPersist) {
        console.warn('[WhatsApp Handlers] Falha ao persistir estorno de peça:', errPersist.message);
      }

      try {
        await recordSecurityAudit({
          tenantId: tenantKey,
          actorId: `whatsapp:${senderNorm}`,
          actorType: 'whatsapp_sender',
          action: 'patio:os:estornar_peca',
          entity: 'ordem_servico',
          entityId: String(resEstorno.osId),
          details: {
            osId: resEstorno.osId,
            pecaDevolvida: resEstorno.pecaDevolvida,
            origem: 'whatsapp'
          }
        });
      } catch (_) {}

      const msgSucesso = `↩️ *Peça Devolvida ao Estoque!* 📦\n\n• *OS:* #${resEstorno.osNum}\n• *Item:* ${resEstorno.pecaDevolvida?.nome || pecaParam} (${resEstorno.pecaDevolvida?.quantidade || 1} un)\n• *Saldo Estoque Atual:* ${resEstorno.saldoEstoqueRestante != null ? `${resEstorno.saldoEstoqueRestante} un` : 'N/A'}\n• *Novo Total Peças da OS:* ${financialEngine.formatarMoeda(resEstorno.totalPecasOS)}`;
      await msg.reply(msgSucesso);
      await auditarComandoWhatsApp({
        tenantId: tenantKey,
        numero: senderNorm,
        comando: textoMensagem,
        resultado: 'sucesso',
        detalhes: { osId: resEstorno.osId, item: pecaParam }
      });
      return true;
    } catch (err) {
      await msg.reply(`⚠️ *Falha ao devolver peça:* ${err.message}`);
      await auditarComandoWhatsApp({
        tenantId: tenantKey,
        numero: senderNorm,
        comando: textoMensagem,
        resultado: 'falha',
        detalhes: { erro: err.message }
      });
      return true;
    }
  }

  return false;
}

module.exports = {
  processarComandosEstoque
};
