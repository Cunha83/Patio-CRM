'use strict';

const { auditarComandoWhatsApp } = require('./whatsappSecurity');
const { salvarEstado, recordSecurityAudit } = require('../../../lib/serverContext');
const financialEngine = require('../../financialEngine');
const financialAnalystService = require('../../financialAnalystService');

async function processarComandosPatio(msg, ctx) {
  const c = (ctx && ctx.textoLower !== undefined) ? ctx : (msg || {});
  const { textoMensagem, textoLower, tenantKey, tenantState, senderNorm } = c;
  if (!ctx && msg && msg.msg) msg = msg.msg;
  const matchBoxOS = textoLower.match(/^!?box\s+([a-zA-Z0-9_\-]+)\s+os\s*#?\s*([a-zA-Z0-9_\-]+)(?:\s+(.+))?$/i);
  const matchIniciarOS = textoLower.match(/^!?iniciar\s+os\s*#?\s*([a-zA-Z0-9_\-]+)(?:\s+box\s+([a-zA-Z0-9_\-]+))?$/i);
  const matchPausarOS = textoLower.match(/^!?pausar\s+os\s*#?\s*([a-zA-Z0-9_\-]+)(?:\s+(.+))?$/i);
  const matchFinalizarOS = textoLower.match(/^!?(?:finalizar|pronto)\s+os\s*#?\s*([a-zA-Z0-9_\-]+)$/i);
  const isComandoRadarGargalos = (
    textoLower === '!gargalos' || textoLower === 'gargalos' ||
    textoLower === '!radar patio' || textoLower === 'radar patio' ||
    textoLower === '!radar pátio' || textoLower === 'radar pátio' ||
    textoLower === '!status boxes' || textoLower === 'status boxes' ||
    textoLower === '!boxes' || textoLower === 'boxes'
  );

  // 1. Comando: box <num_box> os <id> [mecanico]
  if (matchBoxOS) {
    const boxParam = matchBoxOS[1].trim();
    const osParam = matchBoxOS[2].trim();
    const mecParam = (matchBoxOS[3] || '').trim() || null;

    try {
      const resAloc = financialAnalystService.alocarBoxOS(tenantState, {
        osId: osParam,
        boxId: boxParam,
        mecanico: mecParam,
        operador: {
          actorId: `whatsapp:${senderNorm}`,
          nome: `WhatsApp (${senderNorm})`
        }
      });

      try {
        await salvarEstado(tenantKey, tenantState);
      } catch (errPersist) {
        console.warn('[WhatsApp Handlers] Falha ao persistir alocação de box:', errPersist.message);
      }

      try {
        await recordSecurityAudit({
          tenantId: tenantKey,
          actorId: `whatsapp:${senderNorm}`,
          actorType: 'whatsapp_sender',
          action: 'patio:os:alocar_box',
          entity: 'ordem_servico',
          entityId: String(resAloc.os.id),
          details: {
            osId: resAloc.os.id,
            boxId: resAloc.box.id,
            mecanico: resAloc.os.mecanico,
            origem: 'whatsapp'
          }
        });
      } catch (_) {}

      const msgSucesso = `✅ *Alocação de Box Confirmada!* 🏗️\n\n• *OS:* #${resAloc.os.num || resAloc.os.id}\n• *Box:* ${resAloc.box.nome || resAloc.box.id}\n${resAloc.os.mecanico ? `• *Mecânico:* ${resAloc.os.mecanico}\n` : ''}• *Status Pátio:* ${resAloc.resumoBoxes.ocupados}/${resAloc.resumoBoxes.total} boxes ocupados (${resAloc.resumoBoxes.livres} livres)`;
      await msg.reply(msgSucesso);
      await auditarComandoWhatsApp({
        tenantId: tenantKey,
        numero: senderNorm,
        comando: textoMensagem,
        resultado: 'sucesso',
        detalhes: { osId: resAloc.os.id, boxId: resAloc.box.id }
      });
      return true;
    } catch (err) {
      const msgErro = err.code === 'BOX_JA_OCUPADO'
        ? `⚠️ *Box Ocupado:* ${err.message}`
        : `⚠️ *Não foi possível alocar no box:* ${err.message}`;
      await msg.reply(msgErro);
      await auditarComandoWhatsApp({
        tenantId: tenantKey,
        numero: senderNorm,
        comando: textoMensagem,
        resultado: err.code === 'BOX_JA_OCUPADO' ? 'conflito_box_ocupado' : 'falha',
        detalhes: { erro: err.message, code: err.code }
      });
      return true;
    }
  }

  // 2. Comando: iniciar os <id> [box <n>]
  if (matchIniciarOS) {
    const osParam = matchIniciarOS[1].trim();
    const boxParam = (matchIniciarOS[2] || '').trim() || null;

    try {
      const resApont = financialAnalystService.registrarApontamentoPatioOS(tenantState, {
        osId: osParam,
        acao: 'iniciar',
        boxId: boxParam,
        operador: {
          actorId: `whatsapp:${senderNorm}`,
          nome: `WhatsApp (${senderNorm})`
        }
      });

      try {
        await salvarEstado(tenantKey, tenantState);
      } catch (errPersist) {
        console.warn('[WhatsApp Handlers] Falha ao persistir apontamento iniciar:', errPersist.message);
      }

      try {
        await recordSecurityAudit({
          tenantId: tenantKey,
          actorId: `whatsapp:${senderNorm}`,
          actorType: 'whatsapp_sender',
          action: 'patio:os:apontamento',
          entity: 'ordem_servico',
          entityId: String(resApont.os.id),
          details: { osId: resApont.os.id, acao: 'iniciar', boxId: resApont.os.boxId, origem: 'whatsapp' }
        });
      } catch (_) {}

      const agoraSP = financialEngine.obterAgoraSP();
      const msgSucesso = `⚙️ *Execução Iniciada!* 🔧\n\n• *OS:* #${resApont.os.num || resApont.os.id}\n• *Etapa:* Em Execução\n${resApont.os.boxId ? `• *Box:* ${resApont.os.boxId}\n` : ''}${resApont.os.mecanico ? `• *Mecânico:* ${resApont.os.mecanico}\n` : ''}• *Horário:* ${agoraSP.horaBR}`;
      await msg.reply(msgSucesso);
      await auditarComandoWhatsApp({
        tenantId: tenantKey,
        numero: senderNorm,
        comando: textoMensagem,
        resultado: 'sucesso',
        detalhes: { osId: resApont.os.id, acao: 'iniciar' }
      });
      return true;
    } catch (err) {
      await msg.reply(`⚠️ *Falha ao iniciar OS:* ${err.message}`);
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

  // 3. Comando: pausar os <id> <motivo>
  if (matchPausarOS) {
    const osParam = matchPausarOS[1].trim();
    const motivoParam = (matchPausarOS[2] || '').trim();

    if (!motivoParam || motivoParam.length < 3) {
      await msg.reply('⚠️ Formato inválido. Use: *pausar os <id> <motivo>* (ex: *pausar os 101 aguardando feixe de mola*).');
      await auditarComandoWhatsApp({
        tenantId: tenantKey,
        numero: senderNorm,
        comando: textoMensagem,
        resultado: 'formato_invalido'
      });
      return true;
    }

    try {
      const resApont = financialAnalystService.registrarApontamentoPatioOS(tenantState, {
        osId: osParam,
        acao: 'pausar',
        motivo: motivoParam,
        operador: {
          actorId: `whatsapp:${senderNorm}`,
          nome: `WhatsApp (${senderNorm})`
        }
      });

      try {
        await salvarEstado(tenantKey, tenantState);
      } catch (errPersist) {
        console.warn('[WhatsApp Handlers] Falha ao persistir pausa de OS:', errPersist.message);
      }

      try {
        await recordSecurityAudit({
          tenantId: tenantKey,
          actorId: `whatsapp:${senderNorm}`,
          actorType: 'whatsapp_sender',
          action: 'patio:os:apontamento',
          entity: 'ordem_servico',
          entityId: String(resApont.os.id),
          details: { osId: resApont.os.id, acao: 'pausar', motivo: motivoParam, origem: 'whatsapp' }
        });
      } catch (_) {}

      const agoraSP = financialEngine.obterAgoraSP();
      const msgSucesso = `⏸️ *OS Pausada (Gargalo Registrado)* ⚠️\n\n• *OS:* #${resApont.os.num || resApont.os.id}\n• *Motivo:* ${resApont.motivoPausa}\n• *Status do Box:* Bloqueado por Peça/Gargalo\n• *Horário:* ${agoraSP.horaBR}`;
      await msg.reply(msgSucesso);
      await auditarComandoWhatsApp({
        tenantId: tenantKey,
        numero: senderNorm,
        comando: textoMensagem,
        resultado: 'sucesso',
        detalhes: { osId: resApont.os.id, acao: 'pausar', motivo: motivoParam }
      });
      return true;
    } catch (err) {
      await msg.reply(`⚠️ *Falha ao pausar OS:* ${err.message}`);
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

  // 4. Comando: finalizar os <id> ou pronto os <id>
  if (matchFinalizarOS) {
    const osParam = matchFinalizarOS[1].trim();

    try {
      const resApont = financialAnalystService.registrarApontamentoPatioOS(tenantState, {
        osId: osParam,
        acao: 'finalizar',
        operador: {
          actorId: `whatsapp:${senderNorm}`,
          nome: `WhatsApp (${senderNorm})`
        }
      });

      try {
        await salvarEstado(tenantKey, tenantState);
      } catch (errPersist) {
        console.warn('[WhatsApp Handlers] Falha ao persistir finalização de OS:', errPersist.message);
      }

      try {
        await recordSecurityAudit({
          tenantId: tenantKey,
          actorId: `whatsapp:${senderNorm}`,
          actorType: 'whatsapp_sender',
          action: 'patio:os:apontamento',
          entity: 'ordem_servico',
          entityId: String(resApont.os.id),
          details: { osId: resApont.os.id, acao: 'finalizar', origem: 'whatsapp' }
        });
      } catch (_) {}

      const agoraSP = financialEngine.obterAgoraSP();
      const msgSucesso = `✅ *OS Concluída no Pátio!* 🚗\n\n• *OS:* #${resApont.os.num || resApont.os.id}\n• *Etapa:* Pronto p/ Retirada\n• *Box:* Liberado no Pátio\n• *Horário:* ${agoraSP.horaBR}`;
      await msg.reply(msgSucesso);
      await auditarComandoWhatsApp({
        tenantId: tenantKey,
        numero: senderNorm,
        comando: textoMensagem,
        resultado: 'sucesso',
        detalhes: { osId: resApont.os.id, acao: 'finalizar' }
      });
      return true;
    } catch (err) {
      await msg.reply(`⚠️ *Falha ao finalizar OS:* ${err.message}`);
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

  // 5. Consulta: gargalos / radar patio / status boxes
  if (isComandoRadarGargalos) {
    const radar = financialAnalystService.obterRadarGargalosPatio(tenantState);
    let respGargalos = `🚨 *RADAR OPERACIONAL DE GARGALOS & PÁTIO* 🏗️\n\n`;
    respGargalos += `📊 *Ocupação de Boxes:*\n`;
    respGargalos += `• Total: ${radar.resumoBoxes.total} | Livres: ${radar.resumoBoxes.livres} | Ocupados: ${radar.resumoBoxes.ocupados} | Bloqueados: ${radar.resumoBoxes.bloqueados}\n\n`;

    if (radar.osPausadasGargalo.length > 0) {
      respGargalos += `⏸️ *OSs Paradas em Gargalo (${radar.osPausadasGargalo.length}):*\n`;
      for (const g of radar.osPausadasGargalo) {
        respGargalos += `• *OS #${g.num}* (${g.placa}) - Box: ${g.boxId}\n`;
        respGargalos += `  _Motivo:_ ${g.motivoPausa} (${g.tempoPausaMinutos} min)\n`;
      }
      respGargalos += `\n`;
    } else {
      respGargalos += `✅ *Nenhuma OS travada por gargalo no momento!*\n\n`;
    }

    if (radar.osProntasRetidasFinanceiro.length > 0) {
      respGargalos += `🔒 *OSs Prontas Retidas no Financeiro (${radar.osProntasRetidasFinanceiro.length}):*\n`;
      for (const r of radar.osProntasRetidasFinanceiro) {
        respGargalos += `• *OS #${r.num}* (${r.placa}) - ${r.cliente}\n`;
        respGargalos += `  _Saldo Pendente:_ ${financialEngine.formatarMoeda(r.saldoRestante)}\n`;
      }
      respGargalos += `\n`;
    } else {
      respGargalos += `✅ *Nenhum veículo pronto retido por pendência financeira!*\n\n`;
    }

    await msg.reply(respGargalos.trim());
    await auditarComandoWhatsApp({
      tenantId: tenantKey,
      numero: senderNorm,
      comando: textoMensagem,
      resultado: 'sucesso',
      detalhes: {
        boxesTotal: radar.resumoBoxes.total,
        gargalosTotal: radar.osPausadasGargalo.length,
        retidasTotal: radar.osProntasRetidasFinanceiro.length
      }
    });
    return true;
  }

  return false;
}

module.exports = {
  processarComandosPatio
};
