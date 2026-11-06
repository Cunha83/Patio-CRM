'use strict';

const { parseDataHora, calcularHorasPassadas } = require('./intelligenceHelpers');

/**
 * Avalia regras de estoque, compras, almoxarifado e produtividade de mão de obra (Regras 9 e 10)
 */
function detectarRegrasEstoqueEMaoDeObra({
  tenantId,
  state,
  agora,
  dataHojeISO,
  cfg,
  cfgOp,
  activeDetectedKeys,
  detectedEvents
}) {
  /* ─────────────────────────────────────────────────────────────────
   * 9. REGRA: PEÇAS, SUPRIMENTOS E ALMOXARIFADO
   * ───────────────────────────────────────────────────────────────── */
  state.partRequirements = Array.isArray(state.partRequirements) ? state.partRequirements : [];
  state.purchaseOrders = Array.isArray(state.purchaseOrders) ? state.purchaseOrders : [];
  state.purchaseQuotes = Array.isArray(state.purchaseQuotes) ? state.purchaseQuotes : [];
  state.pecas = Array.isArray(state.pecas) ? state.pecas : [];

  // 9.1 Necessidades de peças pendentes de compra
  for (const req of state.partRequirements) {
    if (req.tenantId === tenantId && (req.status === 'aguardando_compra' || req.missingQuantity > 0)) {
      const os = (state.os || []).find(o => o.id === req.osId);
      if (os && os.st !== 'finalizada' && os.st !== 'cancelada') {
        const peca = state.pecas.find(p => p.id === req.partId && p.tenantId === tenantId);
        const pecaNome = peca ? peca.descricao : 'Peça';
        const estaNoBox = Boolean(os.box);

        const ehP1 = estaNoBox && (req.urgencia === 'alta' || os.prioridade === 'alta');
        const tipoEvento = estaNoBox ? 'peca_bloqueando_box' : 'peca_aguardando_compra';
        const prioridade = ehP1 ? 'P1' : (estaNoBox ? 'P2' : 'P3');
        const severidade = ehP1 ? 'critico' : (estaNoBox ? 'alto' : 'atencao');
        const dedupeKey = `${tenantId}:${tipoEvento}:${req.id}`;

        activeDetectedKeys.add(dedupeKey);
        detectedEvents.push({
          tipo: tipoEvento,
          prioridade,
          severidade,
          dedupeKey,
          recurso: { tipo: 'part_requirement', id: req.id, osId: os.id, osNum: os.num, partId: req.partId },
          titulo: estaNoBox
            ? `Box ${os.box} bloqueado aguardando peça (OS #${os.num || os.id})`
            : `OS #${os.num || os.id} aguardando compra de peça`,
          descricao: `A OS #${os.num || os.id} (${os.placa || 'Sem placa'}) necessita de ${req.missingQuantity || req.quantidadeSolicitada || 1} un de "${pecaNome}" para prosseguir os serviços.`,
          detalhes: { requirementId: req.id, osId: os.id, partId: req.partId, missingQuantity: req.missingQuantity || req.quantidadeSolicitada || 1, box: os.box || null }
        });
      }
    }
  }

  // 9.2 Pedidos de compra em atraso
  for (const order of state.purchaseOrders) {
    if (order.tenantId === tenantId && ['pedido_realizado', 'aprovado', 'parcialmente_recebido', 'recebido_parcial'].includes(order.status)) {
      const dataPrev = order.expectedAt || order.previsaoEntrega;
      if (dataPrev) {
        const tsPrev = parseDataHora(dataPrev, '18:00');
        if (tsPrev && tsPrev < agora) {
          const dedupeKey = `${tenantId}:pedido_compra_atrasado:${order.id}`;
          activeDetectedKeys.add(dedupeKey);
          detectedEvents.push({
            tipo: 'pedido_compra_atrasado',
            prioridade: 'P2',
            severidade: 'alto',
            dedupeKey,
            recurso: { tipo: 'purchase_order', id: order.id, codigo: order.codigo, supplierId: order.supplierId },
            titulo: `Pedido de compra ${order.codigo} em atraso`,
            descricao: `O pedido ${order.codigo} (${order.supplierNome || 'Fornecedor'}) com entrega prometida para ${dataPrev} ainda não foi recebido no almoxarifado.`,
            detalhes: { orderId: order.id, codigo: order.codigo, expectedAt: dataPrev, status: order.status }
          });
        }
      }
    }
  }

  // 9.3 Cotações de compra sem resposta há mais de 4h
  for (const quote of state.purchaseQuotes) {
    if (quote.tenantId === tenantId && quote.status === 'aberta') {
      const tsCot = parseDataHora(quote.createdAt, '08:00');
      const horasAberta = tsCot ? calcularHorasPassadas(tsCot, agora) : 0;
      if (horasAberta >= 4) {
        const dedupeKey = `${tenantId}:cotacao_sem_resposta:${quote.id}`;
        activeDetectedKeys.add(dedupeKey);
        detectedEvents.push({
          tipo: 'cotacao_sem_resposta',
          prioridade: 'P3',
          severidade: 'atencao',
          dedupeKey,
          recurso: { tipo: 'purchase_quote', id: quote.id, codigo: quote.codigo },
          titulo: `Cotação ${quote.codigo} sem resposta (${horasAberta.toFixed(1)}h)`,
          descricao: `A cotação de compra ${quote.codigo} está aguardando retorno dos fornecedores há ${horasAberta.toFixed(1)} horas.`,
          detalhes: { quoteId: quote.id, horasAberta: Number(horasAberta.toFixed(1)) }
        });
      }
    }
  }

  // 9.4 Ruptura de estoque e estoque baixo
  for (const peca of state.pecas) {
    if (peca.tenantId === tenantId && peca.ativo !== false) {
      const qtdFisica = Math.max(0, Number(peca.qtd) || 0);
      const min = Math.max(0, Number(peca.estoqueMinimo != null ? peca.estoqueMinimo : peca.min) || 0);

      const reservado = state.partRequirements
        .filter(r => r.tenantId === tenantId && r.partId === peca.id && ['atendida', 'parcial', 'reservada'].includes(r.status))
        .reduce((acc, r) => acc + (Number(r.reservedQuantity) || 0), 0);
      const disponivel = Math.max(0, qtdFisica - reservado);

      const temDemanda = state.partRequirements.some(
        r => r.tenantId === tenantId && r.partId === peca.id && (r.status === 'aguardando_compra' || r.missingQuantity > 0)
      );

      if (disponivel === 0 && temDemanda) {
        const dedupeKey = `${tenantId}:ruptura_estoque:${peca.id}`;
        activeDetectedKeys.add(dedupeKey);
        detectedEvents.push({
          tipo: 'ruptura_estoque',
          prioridade: 'P2',
          severidade: 'alto',
          dedupeKey,
          recurso: { tipo: 'peca', id: peca.id, codigoInterno: peca.codigoInterno },
          titulo: `Ruptura de estoque: ${peca.descricao}`,
          descricao: `A peça "${peca.descricao}" (${peca.codigoInterno}) está com estoque disponível zerado e possui demandas ativas de ordens de serviço.`,
          detalhes: { partId: peca.id, estoqueFisico: qtdFisica, estoqueReservado: reservado, estoqueDisponivel: 0 }
        });
      } else if (min > 0 && disponivel <= min) {
        const dedupeKey = `${tenantId}:estoque_baixo:${peca.id}`;
        activeDetectedKeys.add(dedupeKey);
        detectedEvents.push({
          tipo: 'estoque_baixo',
          prioridade: 'P4',
          severidade: 'info',
          dedupeKey,
          recurso: { tipo: 'peca', id: peca.id, codigoInterno: peca.codigoInterno },
          titulo: `Estoque baixo: ${peca.descricao}`,
          descricao: `A peça "${peca.descricao}" está com saldo disponível (${disponivel} un) abaixo ou igual ao mínimo de segurança (${min} un).`,
          detalhes: { partId: peca.id, estoqueDisponivel: disponivel, estoqueMinimo: min }
        });
      }
    }
  }

  /* ─────────────────────────────────────────────────────────────────
   * 10. REGRA: INTELIGÊNCIA DE MÃO DE OBRA, EQUIPE E PRODUTIVIDADE
   * ───────────────────────────────────────────────────────────────── */
  state.laborEntries = Array.isArray(state.laborEntries) ? state.laborEntries : [];
  state.workers = Array.isArray(state.workers) ? state.workers : [];

  const jornadaPadraoHoras = Number(cfgOp?.jornadaPadraoHoras || cfg?.equipe?.jornadaPadraoHoras) || 8;

  // 10.1 Apontamento aberto esquecido (P2 se exceder jornada)
  for (const entry of state.laborEntries) {
    if (entry.tenantId === tenantId && entry.status === 'ativo') {
      const tsInicio = parseDataHora(entry.startedAt, '08:00');
      const horasAtivas = tsInicio ? calcularHorasPassadas(tsInicio, agora) : 0;
      const worker = state.workers.find(w => w.id === entry.workerId && w.tenantId === tenantId);
      const limiteJornada = Number(worker?.jornadaHorasDia) || jornadaPadraoHoras;

      if (horasAtivas >= limiteJornada) {
        const dedupeKey = `${tenantId}:apontamento_aberto_esquecido:${entry.id}`;
        activeDetectedKeys.add(dedupeKey);
        detectedEvents.push({
          tipo: 'apontamento_aberto_esquecido',
          prioridade: 'P2',
          severidade: 'alto',
          dedupeKey,
          recurso: { tipo: 'labor_entry', id: entry.id, workerId: entry.workerId, osId: entry.osId, osNum: entry.osNum },
          titulo: `Apontamento esquecido aberto: ${entry.workerNome} (${horasAtivas.toFixed(1)}h)`,
          descricao: `O colaborador ${entry.workerNome} está com apontamento ativo na OS #${entry.osNum || entry.osId} há ${horasAtivas.toFixed(1)} horas (excedendo a jornada de ${limiteJornada}h). Solicitar revisão manual sem encerrar automaticamente.`,
          detalhes: { entryId: entry.id, workerId: entry.workerId, horasAtivas: Number(horasAtivas.toFixed(1)), limiteJornada }
        });
      } else if (horasAtivas >= 6) {
        // 10.2 Apontamento excessivo contínuo no mesmo serviço (P3)
        const dedupeKey = `${tenantId}:mecanico_com_apontamento_excessivo:${entry.id}`;
        activeDetectedKeys.add(dedupeKey);
        detectedEvents.push({
          tipo: 'mecanico_com_apontamento_excessivo',
          prioridade: 'P3',
          severidade: 'atencao',
          dedupeKey,
          recurso: { tipo: 'labor_entry', id: entry.id, workerId: entry.workerId, osId: entry.osId },
          titulo: `Apontamento contínuo longo: ${entry.workerNome} (${horasAtivas.toFixed(1)}h)`,
          descricao: `O mecânico ${entry.workerNome} está trabalhando continuamente há ${horasAtivas.toFixed(1)}h no mesmo serviço (${entry.serviceNome}) sem intervalo registrado.`,
          detalhes: { entryId: entry.id, workerId: entry.workerId, horasAtivas: Number(horasAtivas.toFixed(1)) }
        });
      }
    }
  }

  // 10.3 Serviço autorizado sem mecânico apontado (OS em execução sem atividade)
  const temModuloLaborAtivo = (Array.isArray(state.workers) && state.workers.length > 0) ||
                              (Array.isArray(state.laborEntries) && state.laborEntries.length > 0);
  if (temModuloLaborAtivo) {
    for (const o of (state.os || [])) {
      if (o.tenantId === tenantId || !o.tenantId) {
        if (o.st === 'executando') {
          const temApontamentoAtivo = state.laborEntries.some(
            e => e.tenantId === tenantId && e.osId === o.id && e.status === 'ativo'
          );
          if (!temApontamentoAtivo) {
            const dedupeKey = `${tenantId}:servico_sem_apontamento:os_${o.id}`;
            activeDetectedKeys.add(dedupeKey);
            detectedEvents.push({
              tipo: 'servico_sem_apontamento',
              prioridade: 'P3',
              severidade: 'atencao',
              dedupeKey,
              recurso: { tipo: 'os', id: o.id, osNum: o.num, placa: o.placa },
              titulo: `OS #${o.num || o.id} em execução sem mecânico apontado`,
              descricao: `A OS #${o.num || o.id} (${o.placa || 'Sem placa'}) está marcada como executando no pátio, mas nenhum colaborador está com serviço ativo registrado nela.`,
              detalhes: { osId: o.id, box: o.box || null }
            });
          }
        }
      }
    }
  }

  // 10.4 Box ocupado sem atividade de mecânico
  for (const b of (state.boxes || [])) {
    const osNoBox = (state.os || []).find(o => o.box === b.id && (o.tenantId === tenantId || !o.tenantId) && o.st !== 'finalizada' && o.st !== 'cancelada');
    if (osNoBox && osNoBox.st !== 'peca') {
      const temMecNoBox = state.laborEntries.some(
        e => e.tenantId === tenantId && (e.boxId === b.id || e.osId === osNoBox.id) && e.status === 'ativo'
      );
      if (!temMecNoBox) {
        const dedupeKey = `${tenantId}:box_sem_atividade:${b.id}`;
        activeDetectedKeys.add(dedupeKey);
        detectedEvents.push({
          tipo: 'box_sem_atividade',
          prioridade: 'P3',
          severidade: 'atencao',
          dedupeKey,
          recurso: { tipo: 'box', id: b.id, nome: b.nome || b.id, osId: osNoBox.id },
          titulo: `Box ${b.nome || b.id} sem mecânico atuando`,
          descricao: `O box ${b.nome || b.id} está ocupado pelo veículo da OS #${osNoBox.num || osNoBox.id}, porém não há apontamento de mecânico ativo no momento.`,
          detalhes: { boxId: b.id, osId: osNoBox.id }
        });
      }
    }
  }

  // 10.5 Retrabalho elevado (horas de retrabalho acumuladas)
  const retrabalhosHoje = state.laborEntries.filter(
    e => e.tenantId === tenantId && e.type === 'retrabalho' && String(e.startedAt || '').startsWith(dataHojeISO)
  );
  const totalMinRetrabalho = retrabalhosHoje.reduce((acc, e) => acc + (Number(e.durationMinutes) || 0), 0);
  if (totalMinRetrabalho >= 120) {
    const dedupeKey = `${tenantId}:retrabalho_elevado:${dataHojeISO}`;
    activeDetectedKeys.add(dedupeKey);
    detectedEvents.push({
      tipo: 'retrabalho_elevado',
      prioridade: 'P2',
      severidade: 'alto',
      dedupeKey,
      recurso: { tipo: 'equipe', data: dataHojeISO },
      titulo: `Volume elevado de retrabalho hoje (${(totalMinRetrabalho / 60).toFixed(1)}h)`,
      descricao: `A oficina acumula ${(totalMinRetrabalho / 60).toFixed(1)} horas de retrabalho no dia de hoje em ${retrabalhosHoje.length} ocorrência(s). Recomenda-se analisar causas raiz e treinamentos.`,
      detalhes: { totalMinutos: totalMinRetrabalho, ocorrencias: retrabalhosHoje.length }
    });
  }

  // 10.6 Serviço acima do tempo estimado
  for (const entry of state.laborEntries) {
    if (entry.tenantId === tenantId && entry.status === 'ativo' && (entry.type === 'produtivo' || entry.type === 'diagnostico')) {
      const dur = Number(entry.durationMinutes) || 0;
      let durTotal = dur;
      if (entry.startedAt) {
        const sMs = new Date(entry.startedAt).getTime();
        durTotal += Math.max(0, (agora.getTime() - sMs) / (1000 * 60));
      }
      const servicoCatalog = (state.servicos || []).find(s => s.id === entry.serviceItemId || (s.nome && entry.serviceNome && s.nome.toLowerCase() === entry.serviceNome.toLowerCase()));
      const estimadoMin = servicoCatalog ? (Number(servicoCatalog.tempoEstimadoMinutos) || (Number(servicoCatalog.horas) * 60) || 60) : 60;
      if (durTotal > estimadoMin * 1.5 && durTotal >= estimadoMin + 45) {
        const dedupeKey = `${tenantId}:servico_acima_tempo_estimado:${entry.id}`;
        activeDetectedKeys.add(dedupeKey);
        detectedEvents.push({
          tipo: 'servico_acima_tempo_estimado',
          prioridade: 'P3',
          severidade: 'atencao',
          dedupeKey,
          recurso: { tipo: 'labor_entry', id: entry.id, osId: entry.osId, workerId: entry.workerId },
          titulo: `Serviço acima do tempo estimado: ${entry.serviceNome}`,
          descricao: `O serviço "${entry.serviceNome}" na OS #${entry.osNum || entry.osId} está com ${Math.round(durTotal)} min de execução (estimado: ${estimadoMin} min, desvio de +${Math.round(durTotal - estimadoMin)} min).`,
          detalhes: { entryId: entry.id, tempoEstimadoMinutos: estimadoMin, tempoRealMinutos: Math.round(durTotal) }
        });
      }
    }
  }
}

module.exports = {
  detectarRegrasEstoqueEMaoDeObra
};

