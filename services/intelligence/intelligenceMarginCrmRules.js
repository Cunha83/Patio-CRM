'use strict';

/**
 * Avalia regras de precificação, margem, rentabilidade, CRM, manutenção preventiva e pós-venda (Regras 11 e 12)
 */
function detectarRegrasMargemECRM({
  tenantId,
  state,
  dataHojeISO,
  activeDetectedKeys,
  detectedEvents
}) {
  // 11. REGRAS DE PRECIFICAÇÃO E RENTABILIDADE
  const cfgPrecificacao = state.cfg?.precificacao || {};
  const margemMinPadrao = Number(cfgPrecificacao.margemMinimaPadrao) || 20;

  // 11.1 Orçamento abaixo da margem mínima
  if (Array.isArray(state.quotations) && state.quotations.length > 0) {
    for (const q of state.quotations) {
      if ((q.tenantId === tenantId || !q.tenantId) && (q.status === 'rascunho' || q.status === 'enviado' || q.status === 'pendente')) {
        const total = Number(q.totalGeral || q.total || 0);
        const custoEst = Number(q.custoEstimadoTotal || q.custoTotal || 0);
        if (total > 0 && custoEst > 0) {
          const margemOrc = ((total - custoEst) / total) * 100;
          if (margemOrc < margemMinPadrao) {
            const dedupeKey = `${tenantId}:orcamento_abaixo_margem:${q.id}`;
            activeDetectedKeys.add(dedupeKey);
            detectedEvents.push({
              tipo: 'orcamento_abaixo_margem',
              prioridade: 'P2',
              severidade: 'alto',
              dedupeKey,
              recurso: { tipo: 'quotation', id: q.id, osId: q.osId },
              titulo: `Orçamento #${q.id.slice(-6)} com margem abaixo do mínimo`,
              descricao: `O orçamento #${q.id.slice(-6)} está com margem estimada de ${margemOrc.toFixed(1)}%, inferior à margem mínima configurada (${margemMinPadrao}%).`,
              detalhes: { quotationId: q.id, margemPercentual: Number(margemOrc.toFixed(1)), margemMinimaExigida: margemMinPadrao }
            });
          }
        }
      }
    }
  }

  // 11.2 Desconto rompendo margem da OS
  for (const o of (state.os || [])) {
    if ((o.tenantId === tenantId || !o.tenantId) && o.st !== 'finalizada' && o.st !== 'cancelada') {
      const desc = Number(o.desc || 0);
      if (desc > 0) {
        try {
          const costingService = require('../costingService');
          const ap = costingService.calcularCustoRealOS({ tenantId, state, osId: o.id });
          if (ap && ap.receitaAutorizada > 0 && ap.margemPercentual < margemMinPadrao) {
            const dedupeKey = `${tenantId}:desconto_acima_limite:os_${o.id}`;
            activeDetectedKeys.add(dedupeKey);
            detectedEvents.push({
              tipo: 'desconto_acima_limite',
              prioridade: 'P2',
              severidade: 'alto',
              dedupeKey,
              recurso: { tipo: 'os', id: o.id, osNum: o.num },
              titulo: `Desconto na OS #${o.num || o.id} rompeu a margem mínima`,
              descricao: `O desconto de R$ ${desc.toFixed(2)} concedido na OS #${o.num || o.id} reduziu a margem para ${ap.margemPercentual}%, abaixo do mínimo (${margemMinPadrao}%).`,
              detalhes: { osId: o.id, desconto: desc, margemPercentual: ap.margemPercentual, margemMinima: margemMinPadrao }
            });
          }
        } catch (_) {}
      }
    }
  }

  // 11.3 Custo de peça com aumento significativo (> 20% sobre custo anterior)
  if (Array.isArray(state.pecas) && state.pecas.length > 0) {
    for (const p of state.pecas) {
      if (p.tenantId === tenantId || !p.tenantId) {
        const cAnterior = Number(p.custoAnterior || p.custoHistorico || (p.ultimoCusto && p.custoMedio && p.ultimoCusto > p.custoMedio ? p.custoMedio : 0));
        const cAtual = Number(p.ultimoCusto || p.custoMedio || p.custo || 0);
        if (cAnterior > 0 && cAtual > cAnterior) {
          const varPerc = ((cAtual - cAnterior) / cAnterior) * 100;
          if (varPerc >= 20) {
            const dedupeKey = `${tenantId}:custo_peca_acima_historico:${p.id}`;
            activeDetectedKeys.add(dedupeKey);
            detectedEvents.push({
              tipo: 'custo_peca_acima_historico',
              referenciaId: p.id,
              prioridade: 'P3',
              severidade: 'aviso',
              dedupeKey,
              recurso: { tipo: 'peca', id: p.id, descricao: p.descricao || p.nome },
              titulo: `Aumento no custo da peça: ${p.descricao || p.nome}`,
              descricao: `O custo da peça "${p.descricao || p.nome}" subiu de R$ ${cAnterior.toFixed(2)} para R$ ${cAtual.toFixed(2)} (+${varPerc.toFixed(1)}%). É recomendável revisar preços de venda.`,
              detalhes: { partId: p.id, custoAnterior: cAnterior, custoAtual: cAtual, variacaoPercentual: Number(varPerc.toFixed(1)) }
            });
          }
        }
      }
    }
  }

  /* ─────────────────────────────────────────────────────────────────
   * 12. REGRAS DE CRM, MANUTENÇÃO PREVENTIVA E PÓS-VENDA
   * ───────────────────────────────────────────────────────────────── */
  // 12.1 Manutenção preventiva próxima e vencida
  try {
    const maintenancePlanService = require('../maintenancePlanService');
    const prevRel = maintenancePlanService.avaliarVencimentos({ tenantId, state, dataReferencia: dataHojeISO });
    for (const it of (prevRel.itens || [])) {
      if (it.status === 'vencido') {
        const dedupeKey = `${tenantId}:manutencao_preventiva_vencida:${it.planoId}_${it.itemId}`;
        activeDetectedKeys.add(dedupeKey);
        detectedEvents.push({
          tipo: 'manutencao_preventiva_vencida',
          prioridade: 'P2',
          severidade: 'alto',
          dedupeKey,
          recurso: { tipo: 'maintenance_item', id: it.itemId, planoId: it.planoId, placa: it.placa },
          titulo: `Manutenção preventiva vencida (${it.placa || 'Veículo'})`,
          descricao: `A manutenção de "${it.descricao}" para o veículo ${it.placa || 'N/I'} está vencida.`,
          detalhes: { planoId: it.planoId, itemId: it.itemId, placa: it.placa, nextDueDate: it.nextDueDate, nextDueKm: it.nextDueKm }
        });
      } else if (it.status === 'proximo') {
        const dedupeKey = `${tenantId}:manutencao_preventiva_proxima:${it.planoId}_${it.itemId}`;
        activeDetectedKeys.add(dedupeKey);
        detectedEvents.push({
          tipo: 'manutencao_preventiva_proxima',
          prioridade: 'P3',
          severidade: 'aviso',
          dedupeKey,
          recurso: { tipo: 'maintenance_item', id: it.itemId, planoId: it.planoId, placa: it.placa },
          titulo: `Manutenção preventiva próxima (${it.placa || 'Veículo'})`,
          descricao: `A manutenção de "${it.descricao}" para o veículo ${it.placa || 'N/I'} está próxima do vencimento.`,
          detalhes: { planoId: it.planoId, itemId: it.itemId, placa: it.placa, nextDueDate: it.nextDueDate, nextDueKm: it.nextDueKm }
        });
      }
    }
  } catch (errPrev) {
    console.warn('[OperationalIntelligence] Erro ao avaliar manutenções preventivas:', errPrev.message);
  }

  // 12.2 Pós-venda pendente
  const afterSalesList = Array.isArray(state.afterSales) ? state.afterSales : (Array.isArray(state.posVenda) ? state.posVenda : []);
  for (const pv of afterSalesList) {
    if (pv.tenantId === tenantId && (pv.status === 'pendente' || pv.status === 'contato_programado')) {
      const dedupeKey = `${tenantId}:pos_venda_pendente:${pv.id}`;
      activeDetectedKeys.add(dedupeKey);
      detectedEvents.push({
        tipo: 'pos_venda_pendente',
        prioridade: 'P3',
        severidade: 'aviso',
        dedupeKey,
        recurso: { tipo: 'after_sales', id: pv.id, osId: pv.osId },
        titulo: `Acompanhamento de pós-venda pendente`,
        descricao: `Há contato de pós-venda pendente para a OS #${pv.osId || pv.id}.`,
        detalhes: { afterSalesId: pv.id, osId: pv.osId }
      });
    }

    // 12.3 Cliente respondeu com reclamação
    if (pv.tenantId === tenantId && pv.status === 'reclamacao_registrada' && pv.followUpIssue && pv.followUpIssue.status !== 'resolvido') {
      const dedupeKey = `${tenantId}:cliente_respondeu_com_reclamacao:${pv.id}`;
      activeDetectedKeys.add(dedupeKey);
      detectedEvents.push({
        tipo: 'cliente_respondeu_com_reclamacao',
        prioridade: 'P1',
        severidade: 'critico',
        dedupeKey,
        recurso: { tipo: 'after_sales_complaint', id: pv.id, osId: pv.osId },
        titulo: `Reclamação de cliente no pós-venda`,
        descricao: `Cliente registrou insatisfação no pós-venda: "${pv.followUpIssue.textoReclamacao || 'Queixa'}"`,
        detalhes: { afterSalesId: pv.id, osId: pv.osId, queixa: pv.followUpIssue.textoReclamacao }
      });
    }
  }

  // 12.4 Agendamento não compareceu
  const agendamentosList = Array.isArray(state.appointments) ? state.appointments : (Array.isArray(state.agendamentos) ? state.agendamentos : []);
  for (const ag of agendamentosList) {
    if (ag.tenantId === tenantId && ag.status === 'agendado') {
      const dataAg = ag.scheduledDate || ag.data;
      if (dataAg && dataAg < dataHojeISO) {
        ag.status = 'nao_compareceu';
        const dedupeKey = `${tenantId}:agendamento_nao_compareceu:${ag.id}`;
        activeDetectedKeys.add(dedupeKey);
        detectedEvents.push({
          tipo: 'agendamento_nao_compareceu',
          prioridade: 'P3',
          severidade: 'atencao',
          dedupeKey,
          recurso: { tipo: 'appointment', id: ag.id, vehicleId: ag.vehicleId },
          titulo: `Agendamento não compareceu (${ag.scheduledDate})`,
          descricao: `O veículo agendado para ${ag.scheduledDate} não compareceu à oficina.`,
          detalhes: { appointmentId: ag.id, scheduledDate: ag.scheduledDate }
        });
      }
    }
  }
}

module.exports = {
  detectarRegrasMargemECRM
};

