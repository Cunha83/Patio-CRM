'use strict';

const { registrarAuditoria } = require('./voiceSecurity');
const { normalizarKm, normalizarPlaca } = require('./voiceRulesHelpers');
const operationalSummaryService = require('../operationalSummaryService');
const operationalIntelligenceEngine = require('../operationalIntelligenceEngine');
const quotationService = require('../quotationService');
const inspectionService = require('../inspectionService');

async function handlePatioAction({ intencao, interpretado, input, context = {}, state = {} }) {
  // ── ADICIONAR RECLAMAÇÃO / SINTOMA A OS EXISTENTE ──
  if (intencao === 'adicionar_reclamacao') {
    let targetOs = null;

    if (context.activeOsId) {
      targetOs = state.os.find(o => o.id === context.activeOsId);
    }
    if (!targetOs && interpretado.os?.id_alvo) {
      targetOs = state.os.find(o => o.id === interpretado.os.id_alvo);
    }
    if (!targetOs && interpretado.os?.num) {
      targetOs = state.os.find(o => o.num === interpretado.os.num);
    }
    if (!targetOs) {
      targetOs = state.os.find(o => o.st !== 'finalizada' && o.st !== 'cancelada');
    }

    if (!targetOs) {
      return {
        ok: false,
        acao: 'adicionar_reclamacao',
        resposta: 'Não encontrei nenhuma Ordem de Serviço em aberto no momento para adicionar a queixa.'
      };
    }

    const novas = Array.isArray(interpretado.os?.reclamacoes) && interpretado.os.reclamacoes.length > 0
      ? interpretado.os.reclamacoes
      : [(input && (input.text || input.texto)) || 'Defeito adicional relatado pelo cliente.'];

    const novasFormatadas = novas.map(q => q.startsWith('•') ? q : `• ${q}`).join('\n');
    targetOs.queixa = targetOs.queixa ? `${targetOs.queixa}\n${novasFormatadas}` : novasFormatadas;

    registrarAuditoria(state, {
      canal: context.canal || 'voz',
      usuario: context.remetente || 'Operador',
      intencao: 'adicionar_reclamacao',
      comando: (input && (input.text || input.texto)) || '[Áudio ditado]',
      resumo: `Adicionada reclamação na OS #${targetOs.num}`,
      osId: targetOs.id
    });

    const respCurta = interpretado.resposta_falada ||
      `Certo, adicionei a queixa na OS #${targetOs.num}.`;

    return {
      ok: true,
      acao: 'adicionar_reclamacao',
      osId: targetOs.id,
      numOS: targetOs.num,
      resposta: respCurta
    };
  }

  // ── CORRIGIR CAMPO (KM, Placa, Cor, etc.) ────
  if (intencao === 'corrigir_campo') {
    let targetOs = null;
    if (context.activeOsId) targetOs = state.os.find(o => o.id === context.activeOsId);
    if (!targetOs) targetOs = state.os.find(o => o.st !== 'finalizada' && o.st !== 'cancelada');

    let targetVei = targetOs ? state.veiculos.find(v => v.id === targetOs.vei) : null;
    const correcoesFeitas = [];

    const correcoes = Array.isArray(interpretado.correcoes) ? interpretado.correcoes : [];

    for (const c of correcoes) {
      if (c.campo === 'km') {
        const valKm = normalizarKm(c.valor);
        if (valKm) {
          if (targetOs) targetOs.km = valKm;
          if (targetVei) targetVei.km = valKm;
          correcoesFeitas.push(`KM ajustado para ${valKm.toLocaleString('pt-BR')} km`);
        }
      }
      if (c.campo === 'placa' && targetVei) {
        const valPlaca = normalizarPlaca(c.valor);
        if (valPlaca) {
          targetVei.placa = valPlaca;
          correcoesFeitas.push(`Placa corrigida para ${valPlaca}`);
        }
      }
      if (c.campo === 'cor' && targetVei) {
        targetVei.cor = String(c.valor);
        correcoesFeitas.push(`Cor corrigida para ${c.valor}`);
      }
      if (c.campo === 'modelo' && targetVei) {
        targetVei.modelo = String(c.valor);
        correcoesFeitas.push(`Modelo corrigido para ${c.valor}`);
      }
    }

    if (correcoesFeitas.length === 0) {
      return {
        ok: false,
        acao: 'corrigir_campo',
        resposta: 'Não consegui identificar qual campo você deseja corrigir.'
      };
    }

    registrarAuditoria(state, {
      canal: context.canal || 'voz',
      usuario: context.remetente || 'Operador',
      intencao: 'corrigir_campo',
      comando: (input && (input.text || input.texto)) || '[Áudio ditado]',
      resumo: correcoesFeitas.join(', '),
      osId: targetOs?.id
    });

    const respCurta = interpretado.resposta_falada ||
      `Perfeito, ${correcoesFeitas.join(' e ')}.`;

    return {
      ok: true,
      acao: 'corrigir_campo',
      osId: targetOs?.id,
      numOS: targetOs?.num,
      resposta: respCurta
    };
  }

  // ── GESTÃO OPERACIONAL PROATIVA ──
  if (intencao === 'consultar_resumo_operacional') {
    const tenantId = context.tenantId || 'default';
    const resumo = operationalSummaryService.gerarResumoOperacional({
      tenantId,
      state,
      dataReferencia: context.dataReferencia,
      horaReferencia: context.horaReferencia
    });
    const resposta = operationalSummaryService.formatarResumoConversacional(resumo);
    return {
      ok: true,
      acao: 'consultar_resumo_operacional',
      resumo,
      resposta
    };
  }

  if (intencao === 'consultar_alertas_operacao') {
    const tenantId = context.tenantId || 'default';
    const aval = operationalIntelligenceEngine.avaliarOperacao({
      tenantId,
      state,
      dataReferencia: context.dataReferencia,
      horaReferencia: context.horaReferencia
    });
    const resposta = operationalSummaryService.formatarAlertasAtencao(aval.eventos);
    return {
      ok: true,
      acao: 'consultar_alertas_operacao',
      eventos: aval.eventos,
      resposta
    };
  }

  if (intencao === 'consultar_gargalo_operacao') {
    const tenantId = context.tenantId || 'default';
    const resumo = operationalSummaryService.gerarResumoOperacional({
      tenantId,
      state,
      dataReferencia: context.dataReferencia,
      horaReferencia: context.horaReferencia
    });
    const resposta = operationalSummaryService.formatarMaiorGargalo(resumo);
    return {
      ok: true,
      acao: 'consultar_gargalo_operacao',
      maiorGargalo: resumo.maiorGargalo,
      resposta
    };
  }

  if (intencao === 'consultar_entregas_risco') {
    const tenantId = context.tenantId || 'default';
    const resumo = operationalSummaryService.gerarResumoOperacional({
      tenantId,
      state,
      dataReferencia: context.dataReferencia,
      horaReferencia: context.horaReferencia
    });
    const aval = operationalIntelligenceEngine.avaliarOperacao({
      tenantId,
      state,
      dataReferencia: context.dataReferencia,
      horaReferencia: context.horaReferencia
    });
    const resposta = operationalSummaryService.formatarEntregasEmRisco(resumo, aval.eventos);
    return {
      ok: true,
      acao: 'consultar_entregas_risco',
      entregas: resumo.entregas,
      eventos: aval.eventos.filter(e => e.tipo === 'entrega_atrasada' || e.tipo === 'entrega_proxima'),
      resposta
    };
  }

  if (intencao === 'reconhecer_alerta') {
    const tenantId = context.tenantId || 'default';
    const actorId = context.remetente || context.actorId || 'operador';
    let targetAlertId = context.activeAlertId || null;
    if (!targetAlertId && Array.isArray(state.operationalEvents)) {
      const eventosAbertos = state.operationalEvents.filter(e => e.tenantId === tenantId && e.status === 'aberto');
      const ordemP = { P1: 1, P2: 2, P3: 3, P4: 4 };
      eventosAbertos.sort((a, b) => (ordemP[a.prioridade] || 5) - (ordemP[b.prioridade] || 5));
      if (eventosAbertos.length > 0) {
        targetAlertId = eventosAbertos[0].id;
      }
    }

    if (!targetAlertId) {
      return {
        ok: true,
        acao: 'reconhecer_alerta',
        resposta: 'Nenhum alerta pendente para reconhecimento no momento.'
      };
    }

    const rec = operationalIntelligenceEngine.reconhecerEvento({
      tenantId,
      eventId: targetAlertId,
      actorId,
      motivo: (input && (input.text || input.texto)) || 'ciente',
      state
    });

    return {
      ok: rec.ok,
      acao: 'reconhecer_alerta',
      evento: rec.evento || null,
      resposta: rec.ok
        ? `Alerta sobre "${rec.evento.titulo}" reconhecido com sucesso. O monitoramento continua ativo.`
        : 'Não foi possível reconhecer o alerta indicado.'
    };
  }

  // ── ORÇAMENTOS E INSPEÇÃO TÉCNICA ──
  if (intencao === 'consultar_orcamento') {
    const tenantId = context.tenantId || 'default';
    const resumo = quotationService.obterResumoOrcamentos({ tenantId, state });
    let resposta = `Temos ${resumo.pendentesAprovacao} orçamento(s) aguardando aprovação dos clientes, totalizando R$ ${resumo.valorPendente.toFixed(2)}.`;
    if (resumo.adicionaisPendentes > 0) {
      resposta += ` Destes, ${resumo.adicionaisPendentes} são adicionais de escopo gerados durante a execução.`;
    }
    return {
      ok: true,
      acao: 'consultar_orcamento',
      resumo,
      resposta
    };
  }

  if (intencao === 'registrar_inspecao_voz') {
    const tenantId = context.tenantId || 'default';
    const parsed = inspectionService.estruturarInspecaoPorVoz({ texto: input && (input.text || input.texto), state, tenantId });
    return {
      ok: true,
      acao: 'registrar_inspecao_voz',
      itensSugeridos: parsed.sugestoes,
      laudoSugerido: parsed.laudoSugerido,
      resposta: parsed.sugestoes.length > 0
        ? `Identifiquei as seguintes anomalias na fala: ${parsed.sugestoes.map(s => s.componente).join(', ')}. Deseja confirmar os laudos e adicionar à inspeção técnica?`
        : 'Não identifiquei anomalias técnicas claras na fala. Por favor, especifique o componente ou sistema avaliado.'
    };
  }

  if (intencao === 'adicionar_item_orcamento') {
    const targetOsId = context.activeOsId || (state.os && state.os[0] ? state.os[0].id : null);
    return {
      ok: true,
      acao: 'adicionar_item_orcamento',
      osId: targetOsId,
      resposta: 'Item adicionado ao orçamento após confirmação explícita do operador.'
    };
  }

  // ── CONSULTAR STATUS OU INFORMAÇÕES ──
  if (intencao === 'consultar_status') {
    const totalAbertas = state.os.filter(o => o.st !== 'finalizada' && o.st !== 'cancelada').length;
    const patioQtd = state.os.filter(o => o.box === 'patio' && o.st !== 'finalizada').length;

    let resp = `Temos ${totalAbertas} Ordens de Serviço em andamento, sendo ${patioQtd} no pátio aguardando box.`;

    if (context.activeOsId) {
      const o = state.os.find(x => x.id === context.activeOsId);
      if (o) {
        const v = state.veiculos.find(x => x.id === o.vei);
        resp = `A OS #${o.num} do veículo ${v ? v.modelo : 'em atendimento'} está com status "${o.st}".`;
      }
    }

    return {
      ok: true,
      acao: 'consultar_status',
      resposta: resp
    };
  }

  // ── EXCLUIR OS (Confirmada) ──
  if (intencao === 'excluir_os') {
    let targetOs = null;
    if (interpretado.os?.num) targetOs = state.os.find(o => o.num === interpretado.os.num || String(o.num) === String(interpretado.os.num) || o.id === String(interpretado.os.num));
    if (!targetOs && (context.activeOsId || interpretado.os?.id)) {
      const osIdAlvo = String(context.activeOsId || interpretado.os?.id);
      targetOs = state.os.find(o => String(o.id) === osIdAlvo || String(o.num) === osIdAlvo);
    }

    if (!targetOs) {
      return { ok: false, acao: 'excluir_os', resposta: 'Ordem de serviço não encontrada para exclusão.' };
    }

    const numExcluido = targetOs.num;
    state.os = state.os.filter(o => o.id !== targetOs.id);

    registrarAuditoria(state, {
      canal: context.canal || 'voz',
      usuario: context.remetente || 'Operador',
      intencao: 'excluir_os',
      comando: (input && (input.text || input.texto)) || '[Áudio ditado]',
      resumo: `OS #${numExcluido} excluída com autorização`,
      osId: targetOs.id
    });

    return {
      ok: true,
      acao: 'excluir_os',
      numOS: numExcluido,
      resposta: `A OS #${numExcluido} foi excluída com sucesso.`
    };
  }

  return null;
}

module.exports = {
  handlePatioAction
};

