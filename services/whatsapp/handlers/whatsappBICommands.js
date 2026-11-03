'use strict';

const { auditarComandoWhatsApp } = require('./whatsappSecurity');
const { normalizePhone } = require('../../../lib/core');
const { salvarEstado, recordSecurityAudit } = require('../../../lib/serverContext');
const financialEngine = require('../../financialEngine');
const financialAnalystService = require('../../financialAnalystService');

async function processarComandosBI(msg, ctx) {
  const c = (ctx && ctx.textoLower !== undefined) ? ctx : (msg || {});
  const { textoMensagem, textoLower, tenantKey, tenantState, senderNorm, perfil } = c;
  if (!ctx && msg && msg.msg) msg = msg.msg;
  const matchGarantiaPlaca = textoLower.match(/^!?(?:garantia\s+placa|hist[oó]rico\s+placa|consultar\s+placa)\s+([a-zA-Z0-9_\-]+)$/i);
  const matchVinculoGarantiaOS = textoLower.match(/^!?garantia\s+os\s*#?\s*([a-zA-Z0-9_\-]+)\s+origem\s*#?\s*([a-zA-Z0-9_\-]+)(?:\s+(.+))?$/i);
  const isComandoRelatorioSemanal = /(?:^|\b)(?:!relat[oó]rio\s+semanal|relat[oó]rio\s+semanal|!produtividade\s+semana(?:l)?|produtividade\s+semana(?:l)?|boletim\s+semanal)\b/i.test(textoLower);
  const isComandoRelatorioMensal = /(?:^|\b)(?:!relat[oó]rio\s+mensal|relat[oó]rio\s+mensal|fechamento\s+m[eê]s|!fechamento\s+m[eê]s|!produtividade\s+m[eê]s(?:al)?|produtividade\s+m[eê]s(?:al)?|boletim\s+mensal)\b/i.test(textoLower);
  const isComandoComissoes = /(?:^|\b)(?:minhas?\s+comiss[oõ]es|!minha\s+comiss[aã]o|minha\s+comiss[aã]o|!comiss[oõ]es|comiss[oõ]es|comiss[aã]o|extrato\s+comiss[aã]o)\b/i.test(textoLower);

  // 1. Comando: garantia placa <placa> ou historico placa <placa>
  if (matchGarantiaPlaca) {
    const placaParam = matchGarantiaPlaca[1].trim();

    try {
      const dossie = financialAnalystService.obterHistoricoGarantiaPlaca(tenantState, placaParam);
      await msg.reply(dossie.dossieTextoWhatsapp);
      await auditarComandoWhatsApp({
        tenantId: tenantKey,
        numero: senderNorm,
        comando: textoMensagem,
        resultado: 'sucesso',
        detalhes: { placa: placaParam, emGarantiaAtiva: dossie.emGarantiaAtiva, totalOS: dossie.totalOS }
      });
      return true;
    } catch (err) {
      await msg.reply(`⚠️ *Não foi possível consultar o histórico da placa:* ${err.message}`);
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

  // 2. Comando: garantia os <osId> origem <osOrigemId> <motivo>
  if (matchVinculoGarantiaOS) {
    const osParam = matchVinculoGarantiaOS[1].trim();
    const origemParam = matchVinculoGarantiaOS[2].trim();
    const motivoParam = (matchVinculoGarantiaOS[3] || '').trim() || 'Retorno para reparo coberto por garantia';

    try {
      const resGarantia = financialAnalystService.registrarRetornoGarantiaOS(tenantState, {
        osId: osParam,
        osOrigemId: origemParam,
        motivoGarantia: motivoParam,
        isentarCobranca: true,
        operador: {
          actorId: `whatsapp:${senderNorm}`,
          nome: `WhatsApp (${senderNorm})`
        }
      });

      try {
        await salvarEstado(tenantKey, tenantState);
      } catch (errPersist) {
        console.warn('[WhatsApp Handlers] Falha ao persistir retorno em garantia:', errPersist.message);
      }

      try {
        await recordSecurityAudit({
          tenantId: tenantKey,
          actorId: `whatsapp:${senderNorm}`,
          actorType: 'whatsapp_sender',
          action: 'patio:os:retorno_garantia',
          entity: 'ordem_servico',
          entityId: String(resGarantia.osId),
          details: {
            osId: resGarantia.osId,
            osOrigemGarantiaId: resGarantia.osOrigemGarantiaId,
            motivoGarantia: resGarantia.motivoGarantia,
            origem: 'whatsapp'
          }
        });
      } catch (_) {}

      const msgSucesso = `🛡️ *RETORNO EM GARANTIA VINCULADO!* 🔄\n\n• *OS Atual:* #${resGarantia.num}\n• *OS Origem:* #${resGarantia.osOrigemGarantiaId}\n• *Placa:* ${resGarantia.placa}\n• *Motivo:* ${resGarantia.motivoGarantia}\n• *Status de Liberação:* 🛡️ Liberado (Garantia)\n• *Cobrança:* Isenta na Portaria`;
      await msg.reply(msgSucesso);
      await auditarComandoWhatsApp({
        tenantId: tenantKey,
        numero: senderNorm,
        comando: textoMensagem,
        resultado: 'sucesso',
        detalhes: { osId: resGarantia.osId, osOrigemId: resGarantia.osOrigemGarantiaId }
      });
      return true;
    } catch (err) {
      await msg.reply(`⚠️ *Falha ao vincular retorno em garantia:* ${err.message}`);
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

  // 3. Comando: relatorio semanal / produtividade semana
  if (isComandoRelatorioSemanal) {
    const agoraSP = financialEngine.obterAgoraSP();
    const biSemanal = financialAnalystService.calcularProdutividadeEComissoes(tenantState, {
      periodo: 'semanal',
      dataRef: agoraSP.dataISO
    });
    const textoBoletim = financialAnalystService.formatarBoletimProdutividadeWhatsapp(biSemanal);
    await msg.reply(textoBoletim);
    await auditarComandoWhatsApp({
      tenantId: tenantKey,
      numero: senderNorm,
      comando: textoMensagem,
      resultado: 'sucesso',
      detalhes: { tipo: 'bi_relatorio_semanal', totalOSConcluidas: biSemanal.resumo?.totalOSConcluidas, totalMaoDeObra: biSemanal.resumo?.totalMaoDeObra }
    });
    return true;
  }

  // 4. Comando: relatorio mensal / fechamento mes
  if (isComandoRelatorioMensal) {
    const agoraSP = financialEngine.obterAgoraSP();
    const biMensal = financialAnalystService.calcularProdutividadeEComissoes(tenantState, {
      periodo: 'mensal',
      dataRef: agoraSP.dataISO
    });
    const textoBoletim = financialAnalystService.formatarBoletimProdutividadeWhatsapp(biMensal);
    await msg.reply(textoBoletim);
    await auditarComandoWhatsApp({
      tenantId: tenantKey,
      numero: senderNorm,
      comando: textoMensagem,
      resultado: 'sucesso',
      detalhes: { tipo: 'bi_relatorio_mensal', totalOSConcluidas: biMensal.resumo?.totalOSConcluidas, totalMaoDeObra: biMensal.resumo?.totalMaoDeObra }
    });
    return true;
  }

  // 5. Comando: comissoes / minha comissao
  if (isComandoComissoes) {
    const agoraSP = financialEngine.obterAgoraSP();
    const bi = financialAnalystService.calcularProdutividadeEComissoes(tenantState, {
      periodo: 'mensal',
      dataRef: agoraSP.dataISO
    });

    const workersList = Array.isArray(tenantState?.workers) ? tenantState.workers : (Array.isArray(tenantState?.mecanicos) ? tenantState.mecanicos : []);
    const senderWorker = workersList.find(w => {
      const fone = normalizePhone(w.fone || w.telefone || w.phone || '');
      return fone === senderNorm;
    });

    const nomeAlvo = senderWorker ? (senderWorker.nome || senderWorker.name) : (perfil?.nome || perfil?.fullName || '');
    let mecDados = null;
    if (nomeAlvo) {
      mecDados = bi.produtividadeMecanicos.find(m =>
        m.mecanico.toLowerCase().includes(nomeAlvo.toLowerCase()) ||
        nomeAlvo.toLowerCase().includes(m.mecanico.toLowerCase())
      );
    }

    if (mecDados) {
      const textoExtrato = financialAnalystService.formatarExtratoComissaoWhatsapp(mecDados, bi.periodo);
      await msg.reply(textoExtrato);
    } else {
      let txtComissoes = `🤝 *EXTRATO DE COMISSÕES — FECHAMENTO MENSAL* 💰\n`;
      const deBR = financialEngine.formatarDataBR(bi.periodo.de);
      const ateBR = financialEngine.formatarDataBR(bi.periodo.ate);
      txtComissoes += `📅 *Período:* ${deBR} a ${ateBR}\n\n`;

      if (bi.produtividadeMecanicos.length === 0) {
        txtComissoes += `Nenhum mecânico com comissão apurada no período.`;
      } else {
        bi.produtividadeMecanicos.forEach((m, idx) => {
          txtComissoes += `${idx + 1}. *${m.mecanico}*: ${financialEngine.formatarMoeda(m.valorComissao)} (${m.percentualComissao}%)\n`;
          txtComissoes += `   └ Base: ${financialEngine.formatarMoeda(m.maoDeObraComissionavel)} em ${m.totalOSConcluidas} OS(s) finalizada(s)\n`;
        });
        txtComissoes += `\n💵 *Total de Comissões da Equipe:* ${financialEngine.formatarMoeda(bi.resumo.totalComissoes)}`;
      }
      await msg.reply(txtComissoes.trim());
    }

    await auditarComandoWhatsApp({
      tenantId: tenantKey,
      numero: senderNorm,
      comando: textoMensagem,
      resultado: 'sucesso',
      detalhes: { tipo: 'bi_consulta_comissoes', totalComissoes: bi.resumo.totalComissoes }
    });
    return true;
  }

  return false;
}

module.exports = {
  processarComandosBI
};
