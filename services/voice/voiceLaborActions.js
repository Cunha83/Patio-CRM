'use strict';

const laborTrackingService = require('../laborTrackingService');
const productivityService = require('../productivityService');
const costingService = require('../costingService');
const { handleLaborCostAction } = require('./voiceLaborCostActions');

async function handleLaborAction({ intencao, input, context = {}, state = {} }) {
  const rawText = (input && typeof input.text === 'string') ? input.text :
                  (input && typeof input.texto === 'string') ? input.texto :
                  (typeof input === 'string' ? input : '');
  const t = rawText.trim();
  const tLower = t.toLowerCase();
  const tenantId = context.tenantId || 'default';

  if (intencao === 'iniciar_servico') {
    state.workers = Array.isArray(state.workers) ? state.workers : [];
    state.os = Array.isArray(state.os) ? state.os : [];

    // Localiza OS
    const matchOS = t.match(/(?:os|ordem)\s*(?:#|número|numero)?\s*(\d+)/i) || t.match(/\b(\d{3,6})\b/);
    const numOS = matchOS ? parseInt(matchOS[1], 10) : null;
    let osAlvo = null;
    if (numOS) {
      osAlvo = state.os.find(o => (o.num === numOS || o.id === String(numOS)) && (o.tenantId === tenantId || !o.tenantId));
    }
    if (!osAlvo && context.activeOsId) {
      osAlvo = state.os.find(o => o.id === context.activeOsId && (o.tenantId === tenantId || !o.tenantId));
    }
    if (!osAlvo) {
      osAlvo = state.os.find(o => o.st === 'executando' || o.st === 'fila' || o.st === 'aguardando');
    }
    if (!osAlvo) {
      return { ok: false, acao: intencao, resposta: 'Não identifiquei qual é a ordem de serviço para iniciar o trabalho.' };
    }

    // Localiza Colaborador/Mecânico
    let worker = null;
    for (const w of state.workers) {
      if (w.tenantId === tenantId && tLower.includes(w.nome.toLowerCase())) {
        worker = w;
        break;
      }
    }
    if (!worker && context.workerId) {
      worker = state.workers.find(w => w.id === context.workerId && w.tenantId === tenantId);
    }
    if (!worker && context.remetente) {
      worker = state.workers.find(w => w.tenantId === tenantId && (w.nome.toLowerCase() === context.remetente.toLowerCase() || w.userId === context.remetente));
    }
    if (!worker) {
      worker = state.workers.find(w => w.tenantId === tenantId && w.ativo !== false);
    }
    if (!worker) {
      const resW = laborTrackingService.cadastrarColaborador({
        tenantId,
        state,
        workerData: { nome: context.remetente || 'Mecânico', funcao: 'Mecânico' },
        actorId: 'voz'
      });
      worker = resW.worker;
    }

    // Localiza Serviço na OS
    let serviceItemId = null;
    let serviceNome = 'Serviço';
    if (Array.isArray(osAlvo.servicos) && osAlvo.servicos.length > 0) {
      const matchServ = osAlvo.servicos.find(s => {
        const n = (s.nome || s.desc || '').toLowerCase();
        return n.split(/\s+/).some(p => p.length >= 4 && tLower.includes(p));
      });
      if (matchServ) {
        serviceItemId = matchServ.id;
        serviceNome = matchServ.nome || matchServ.desc;
      } else {
        const primeiroAut = osAlvo.servicos.find(s => s.autorizado !== false && s.status !== 'recusado');
        if (primeiroAut) {
          serviceItemId = primeiroAut.id;
          serviceNome = primeiroAut.nome || primeiroAut.desc;
        }
      }
    }

    try {
      const resApont = laborTrackingService.iniciarApontamento({
        tenantId,
        state,
        workerId: worker.id,
        osId: osAlvo.id,
        serviceItemId,
        boxId: osAlvo.box || 'Box',
        type: 'produtivo',
        source: 'voz',
        actorId: worker.nome
      });

      return {
        ok: true,
        acao: intencao,
        entry: resApont.entry,
        resposta: `Serviço iniciado na OS #${osAlvo.num || osAlvo.id} (${serviceNome}) para ${worker.nome} no box ${osAlvo.box || 'Box'}.`
      };
    } catch (err) {
      return {
        ok: false,
        acao: intencao,
        resposta: `Não foi possível iniciar o serviço: ${err.message}`
      };
    }
  }

  if (intencao === 'pausar_servico') {
    state.laborEntries = Array.isArray(state.laborEntries) ? state.laborEntries : [];
    let entry = state.laborEntries.find(e => e.tenantId === tenantId && e.status === 'ativo');
    if (!entry) {
      return { ok: false, acao: intencao, resposta: 'Não há nenhum apontamento de serviço ativo no momento para pausar.' };
    }

    const motivo = (t.includes('esperando peça') || t.includes('esperando peca') || t.includes('aguardando peça') || t.includes('aguardando peca') || t.includes('falta peça'))
      ? 'espera_peca'
      : 'pausa';

    try {
      const resPausa = laborTrackingService.pausarApontamento({
        tenantId,
        state,
        entryId: entry.id,
        motivo,
        actorId: context.remetente || 'operador_voz'
      });

      return {
        ok: true,
        acao: intencao,
        entry: resPausa.entry,
        resposta: `Serviço pausado para ${entry.workerNome} na OS #${entry.osNum || entry.osId}. Motivo: ${motivo === 'espera_peca' ? 'Aguardando peça' : 'Pausa'}. Tempo produtivo até agora: ${entry.durationMinutes} minutos.`
      };
    } catch (err) {
      return { ok: false, acao: intencao, resposta: `Erro ao pausar serviço: ${err.message}` };
    }
  }

  if (intencao === 'retomar_servico') {
    state.laborEntries = Array.isArray(state.laborEntries) ? state.laborEntries : [];
    const entry = state.laborEntries.find(e => e.tenantId === tenantId && e.status === 'pausado');
    if (!entry) {
      return { ok: false, acao: intencao, resposta: 'Não encontrei nenhum serviço pausado aguardando retomada.' };
    }

    try {
      const resRetomada = laborTrackingService.retomarApontamento({
        tenantId,
        state,
        entryId: entry.id,
        actorId: context.remetente || 'operador_voz'
      });

      return {
        ok: true,
        acao: intencao,
        entry: resRetomada.entry,
        resposta: `Serviço retomado por ${entry.workerNome} na OS #${entry.osNum || entry.osId} (${entry.serviceNome}).`
      };
    } catch (err) {
      return { ok: false, acao: intencao, resposta: `Erro ao retomar serviço: ${err.message}` };
    }
  }

  if (intencao === 'encerrar_servico') {
    state.laborEntries = Array.isArray(state.laborEntries) ? state.laborEntries : [];
    const entry = state.laborEntries.find(e => e.tenantId === tenantId && (e.status === 'ativo' || e.status === 'pausado'));
    if (!entry) {
      return { ok: false, acao: intencao, resposta: 'Não identifiquei nenhum serviço em andamento para finalizar.' };
    }

    try {
      const resFim = laborTrackingService.encerrarApontamento({
        tenantId,
        state,
        entryId: entry.id,
        actorId: context.remetente || 'operador_voz'
      });

      return {
        ok: true,
        acao: intencao,
        entry: resFim.entry,
        resposta: `Serviço concluído por ${entry.workerNome} na OS #${entry.osNum || entry.osId}. Tempo total registrado: ${resFim.entry.durationMinutes} minutos.`
      };
    } catch (err) {
      return { ok: false, acao: intencao, resposta: `Erro ao concluir serviço: ${err.message}` };
    }
  }

  if (intencao === 'consultar_equipe_livre') {
    const equipeAgora = productivityService.obterEquipeAgora({ tenantId, state });
    if (!equipeAgora || equipeAgora.totalMecanicosAtivos === 0) {
      return { ok: true, acao: intencao, resposta: 'Não há colaboradores cadastrados na equipe da oficina.' };
    }
    if (equipeAgora.livres.length === 0) {
      return { ok: true, acao: intencao, resposta: 'Nenhum mecânico está livre no momento. Toda a equipe está em serviço ou em espera.' };
    }
    const nomes = equipeAgora.livres.map(w => w.nome).join(', ');
    return {
      ok: true,
      acao: intencao,
      livres: equipeAgora.livres,
      resposta: `Estão livres no momento: ${nomes}.`
    };
  }

  if (intencao === 'consultar_mecanico_trabalho') {
    const equipeAgora = productivityService.obterEquipeAgora({ tenantId, state });
    if (!equipeAgora) return { ok: false, acao: intencao, resposta: 'Dados de equipe indisponíveis.' };

    let alvo = null;
    for (const item of [...equipeAgora.emServico, ...equipeAgora.emEspera, ...equipeAgora.livres]) {
      if (tLower.includes(item.nome.toLowerCase())) {
        alvo = item;
        break;
      }
    }
    if (!alvo) {
      alvo = equipeAgora.emServico[0] || equipeAgora.emEspera[0] || equipeAgora.livres[0];
    }
    if (!alvo) {
      return { ok: true, acao: intencao, resposta: 'Não encontrei o colaborador mencionado.' };
    }

    if (alvo.status === 'em_servico') {
      return {
        ok: true,
        acao: intencao,
        resposta: `${alvo.nome} está trabalhando na OS #${alvo.osNum || alvo.osId} (${alvo.serviceNome || 'Serviço'}) há ${alvo.tempoDecorridoFormatado}.`
      };
    } else if (alvo.status === 'em_espera') {
      return {
        ok: true,
        acao: intencao,
        resposta: `${alvo.nome} está na OS #${alvo.osNum || alvo.osId}, porém pausado (${alvo.motivoPausa || 'aguardando'}) há ${alvo.tempoDecorridoFormatado}.`
      };
    } else {
      return {
        ok: true,
        acao: intencao,
        resposta: `${alvo.nome} está livre sem nenhum serviço em andamento no momento.`
      };
    }
  }

  if (intencao === 'consultar_box_mecanico') {
    const matchBox = t.match(/box\s*(\d+|[a-zA-Z0-9_-]+)/i);
    const boxId = matchBox ? matchBox[1] : null;

    const entries = (state.laborEntries || []).filter(
      e => e.tenantId === tenantId && e.status === 'ativo' && (!boxId || String(e.boxId).toLowerCase() === String(boxId).toLowerCase())
    );

    if (entries.length === 0) {
      return { ok: true, acao: intencao, resposta: boxId ? `Não há nenhum mecânico atuando no box ${boxId} no momento.` : 'Nenhum box possui mecânicos trabalhando no momento.' };
    }

    const item = entries[0];
    return {
      ok: true,
      acao: intencao,
      resposta: `No box ${item.boxId} está o mecânico ${item.workerNome} atuando na OS #${item.osNum || item.osId} (${item.serviceNome}).`
    };
  }

  if (intencao === 'consultar_tempo_os') {
    const matchOS = t.match(/(?:os|ordem)\s*(?:#|número|numero)?\s*(\d+)/i) || t.match(/\b(\d{3,6})\b/);
    const numOS = matchOS ? parseInt(matchOS[1], 10) : null;
    let osAlvo = null;
    if (numOS) {
      osAlvo = (state.os || []).find(o => (o.num === numOS || o.id === String(numOS)) && (o.tenantId === tenantId || !o.tenantId));
    }
    if (!osAlvo && context.activeOsId) {
      osAlvo = (state.os || []).find(o => o.id === context.activeOsId && (o.tenantId === tenantId || !o.tenantId));
    }
    if (!osAlvo) {
      return { ok: false, acao: intencao, resposta: 'Não identifiquei qual é a ordem de serviço para calcular o tempo.' };
    }

    const apuracao = costingService.calcularCustoMaoDeObraOS({ tenantId, state, osId: osAlvo.id });
    return {
      ok: true,
      acao: intencao,
      osId: osAlvo.id,
      horasHomemTotal: apuracao.horasHomemTotal,
      resposta: `Na OS #${osAlvo.num || osAlvo.id} foram acumuladas ${apuracao.horasHomemTotal} horas-homem de trabalho em ${apuracao.apontamentos.length} apontamento(s).`
    };
  }

  if (intencao === 'consultar_mecanico_mais_produtivo') {
    const prod = productivityService.calcularProdutividadeOficina({ tenantId, state });
    if (!prod || prod.mecanicos.length === 0) {
      return { ok: true, acao: intencao, resposta: 'Não há dados suficientes de produtividade para a equipe hoje.' };
    }
    const ordenados = [...prod.mecanicos].sort((a, b) => (b.horasProdutivas || 0) - (a.horasProdutivas || 0));
    const top = ordenados[0];
    return {
      ok: true,
      acao: intencao,
      topMecanico: top,
      resposta: `O colaborador com maior volume produtivo hoje é ${top.nome}, com ${top.horasProdutivas}h produtivas (utilização de ${top.utilizacao || 0}%).`
    };
  }

  if (intencao === 'consultar_retrabalho') {
    const prod = productivityService.calcularProdutividadeOficina({ tenantId, state });
    return {
      ok: true,
      acao: intencao,
      horasRetrabalho: prod?.horasRetrabalho || 0,
      resposta: `Tivemos ${prod?.horasRetrabalho || 0} hora(s) de retrabalho registradas hoje na oficina.`
    };
  }

  const costRes = await handleLaborCostAction({ intencao, input, context, state });
  if (costRes) return costRes;

  return null;
}

module.exports = {
  handleLaborAction
};
