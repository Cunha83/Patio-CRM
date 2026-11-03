'use strict';

const { auditarComandoWhatsApp } = require('./whatsappSecurity');
const { salvarEstado, recordSecurityAudit } = require('../../../lib/serverContext');
const financialAnalystService = require('../../financialAnalystService');

async function processarComandosChecklist(msg, ctx) {
  const c = (ctx && ctx.textoLower !== undefined) ? ctx : (msg || {});
  const { textoMensagem, textoLower, tenantKey, tenantState, senderNorm } = c;
  if (!ctx && msg && msg.msg) msg = msg.msg;
  const matchChecklistOk = textoLower.match(/^!?(?:checklist|vistoria)\s+os\s*#?\s*([a-zA-Z0-9_\-]+)\s+ok(?:\s+(.+))?$/i);
  const matchChecklistFalha = textoLower.match(/^!?(?:checklist|vistoria)\s+os\s*#?\s*([a-zA-Z0-9_\-]+)\s+(?:falha|reprovar|reprovado)(?:\s+(.+))?$/i);
  const matchConsultaLaudo = textoLower.match(/^!?(?:laudo\s+os|laudo|checklist\s+os|vistoria\s+os)\s*#?\s*([a-zA-Z0-9_\-]+)$/i);
  const isComandoConsultaLaudo = !matchChecklistOk && !matchChecklistFalha && Boolean(matchConsultaLaudo);

  // 1. Comando: checklist os <osId> ok [obs] ou vistoria os <osId> ok
  if (matchChecklistOk) {
    const osParam = matchChecklistOk[1].trim();
    const obsParam = (matchChecklistOk[2] || '').trim();

    try {
      const resChk = financialAnalystService.registrarChecklistTecnicoOS(tenantState, {
        osId: osParam,
        modo: 'aprovar_todos',
        observacao: obsParam || 'Vistoria aprovada via WhatsApp',
        operador: {
          actorId: `whatsapp:${senderNorm}`,
          nome: `WhatsApp (${senderNorm})`
        }
      });

      try {
        await salvarEstado(tenantKey, tenantState);
      } catch (errPersist) {
        console.warn('[WhatsApp Handlers] Falha ao persistir aprovação de checklist:', errPersist.message);
      }

      try {
        await recordSecurityAudit({
          tenantId: tenantKey,
          actorId: `whatsapp:${senderNorm}`,
          actorType: 'whatsapp_sender',
          action: 'patio:os:checklist_tecnico',
          entity: 'ordem_servico',
          entityId: String(resChk.osId),
          details: {
            osId: resChk.osId,
            statusChecklist: 'aprovado',
            modo: 'aprovar_todos',
            origem: 'whatsapp'
          }
        });
      } catch (_) {}

      const msgSucesso = `🛡️ *VISTORIA TÉCNICA APROVADA!* ✅\n\n• *OS:* #${resChk.num}\n• *Placa:* ${resChk.placa}\n• *Status:* 100% Aprovado nos 5 itens de suspensão e freios\n• *Avaliador:* WhatsApp (${senderNorm})\n\n_Veículo liberado nos padrões técnicos para conclusão e rodagem._`;
      await msg.reply(msgSucesso);
      await auditarComandoWhatsApp({
        tenantId: tenantKey,
        numero: senderNorm,
        comando: textoMensagem,
        resultado: 'sucesso',
        detalhes: { osId: resChk.osId, status: 'aprovado' }
      });
      return true;
    } catch (err) {
      await msg.reply(`⚠️ *Falha ao aprovar checklist da OS:* ${err.message}`);
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

  // 2. Comando: checklist os <osId> falha <motivo>
  if (matchChecklistFalha) {
    const osParam = matchChecklistFalha[1].trim();
    const motivoFalha = (matchChecklistFalha[2] || '').trim() || 'Falha de segurança apontada via WhatsApp';

    try {
      const resChk = financialAnalystService.registrarChecklistTecnicoOS(tenantState, {
        osId: osParam,
        modo: 'reprovar',
        itemFalha: motivoFalha,
        observacao: motivoFalha,
        operador: {
          actorId: `whatsapp:${senderNorm}`,
          nome: `WhatsApp (${senderNorm})`
        }
      });

      try {
        await salvarEstado(tenantKey, tenantState);
      } catch (errPersist) {
        console.warn('[WhatsApp Handlers] Falha ao persistir reprovação de checklist:', errPersist.message);
      }

      try {
        await recordSecurityAudit({
          tenantId: tenantKey,
          actorId: `whatsapp:${senderNorm}`,
          actorType: 'whatsapp_sender',
          action: 'patio:os:checklist_tecnico',
          entity: 'ordem_servico',
          entityId: String(resChk.osId),
          details: {
            osId: resChk.osId,
            statusChecklist: 'reprovado_critico',
            modo: 'reprovar',
            motivoFalha,
            origem: 'whatsapp'
          }
        });
      } catch (_) {}

      const msgFalha = `⚠️ *VISTORIA TÉCNICA REPROVADA!* ❌\n\n• *OS:* #${resChk.num}\n• *Placa:* ${resChk.placa}\n• *Status:* REPROVADO CRÍTICO\n• *Motivo/Item:* ${motivoFalha}\n• *Avaliador:* WhatsApp (${senderNorm})\n\n🚨 *Atenção:* A finalização mecânica desta OS está bloqueada até a correção dos itens e nova aprovação técnica.`;
      await msg.reply(msgFalha);
      await auditarComandoWhatsApp({
        tenantId: tenantKey,
        numero: senderNorm,
        comando: textoMensagem,
        resultado: 'sucesso_reprovado',
        detalhes: { osId: resChk.osId, status: 'reprovado_critico', motivoFalha }
      });
      return true;
    } catch (err) {
      await msg.reply(`⚠️ *Falha ao reprovar checklist da OS:* ${err.message}`);
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

  // 3. Comando: laudo os <osId> ou checklist os <osId>
  if (isComandoConsultaLaudo && matchConsultaLaudo) {
    const osParam = matchConsultaLaudo[1].trim();

    try {
      const resChk = financialAnalystService.obterChecklistTecnicoOS(tenantState, osParam);
      await msg.reply(resChk.laudoTextoWhatsapp);
      await auditarComandoWhatsApp({
        tenantId: tenantKey,
        numero: senderNorm,
        comando: textoMensagem,
        resultado: 'sucesso',
        detalhes: { osId: resChk.osId, status: resChk.statusChecklist }
      });
      return true;
    } catch (err) {
      await msg.reply(`⚠️ *Não foi possível consultar o laudo da OS:* ${err.message}`);
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
  processarComandosChecklist
};
