'use strict';

const crypto = require('crypto');
const inventoryService = require('./inventoryService');
const supplierService = require('./supplierService');

/**
 * PÁTIO CRM — MOTOR DE SUPRIMENTOS E COMPRAS (PROCUREMENT)
 * Gerencia necessidades de peças, cotações, comparação de fornecedores,
 * pedidos de compra com alçada de aprovação, recebimento e reserva automática para OS.
 */

function arredondar(valor, decimais = 2) {
  const n = Number(valor) || 0;
  return Number(Math.round(n + 'e' + decimais) + 'e-' + decimais);
}

function gerarId(prefix) {
  return prefix + '_' + Date.now() + '_' + crypto.randomBytes(3).toString('hex');
}

function garantirColecoesCompras(state) {
  state.partRequirements = Array.isArray(state.partRequirements) ? state.partRequirements : [];
  state.purchaseQuotes = Array.isArray(state.purchaseQuotes) ? state.purchaseQuotes : [];
  state.purchaseOrders = Array.isArray(state.purchaseOrders) ? state.purchaseOrders : [];
  state.compras = Array.isArray(state.compras) ? state.compras : [];
  state.contas = Array.isArray(state.contas) ? state.contas : [];
  state.auditoria = Array.isArray(state.auditoria) ? state.auditoria : [];
  state.os = Array.isArray(state.os) ? state.os : [];
  state.pecas = Array.isArray(state.pecas) ? state.pecas : [];
}

/**
 * Lista necessidades de peças (partRequirements) com filtros
 */
function listarNecessidadesCompra({ tenantId, state, status = null, osId = null }) {
  garantirColecoesCompras(state);

  return state.partRequirements
    .filter(r => r.tenantId === tenantId)
    .filter(r => (status ? r.status === status : true))
    .filter(r => (osId ? r.osId === osId : true))
    .map(r => {
      const peca = state.pecas.find(p => p.id === r.partId && p.tenantId === tenantId);
      const os = state.os.find(o => o.id === r.osId);
      return {
        ...r,
        pecaNome: peca ? peca.descricao : 'Peça desconhecida',
        codigoInterno: peca ? peca.codigoInterno : '',
        osNum: os ? (os.num || os.id) : r.osId,
        veiculoPlaca: os ? os.placa : null
      };
    });
}

/**
 * Gera ou atualiza necessidade de compra para uma OS
 */
function gerarNecessidadeCompra({
  tenantId,
  state,
  osId,
  partId,
  requiredQuantity,
  reservedQuantity = 0,
  quotationId = null,
  quotationItemId = null
}) {
  garantirColecoesCompras(state);

  const qtdReq = Math.max(1, Number(requiredQuantity) || 1);
  const qtdRes = Math.max(0, Number(reservedQuantity) || 0);
  const faltante = Math.max(0, qtdReq - qtdRes);

  let status = 'aguardando_compra';
  if (faltante === 0) status = 'atendida';
  else if (qtdRes > 0) status = 'parcial';

  let req = state.partRequirements.find(
    r => r.tenantId === tenantId && r.osId === osId && r.partId === partId && (quotationItemId ? r.quotationItemId === quotationItemId : true)
  );

  if (req) {
    req.requiredQuantity = qtdReq;
    req.reservedQuantity = qtdRes;
    req.missingQuantity = faltante;
    req.status = status;
    req.updatedAt = new Date().toISOString();
  } else {
    req = {
      id: gerarId('req'),
      tenantId,
      osId,
      quotationId,
      quotationItemId,
      partId,
      requiredQuantity: qtdReq,
      reservedQuantity: qtdRes,
      missingQuantity: faltante,
      status,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    state.partRequirements.push(req);
  }

  return req;
}

/**
 * Cria uma solicitação de cotação de compra para fornecedores
 */
function criarCotacao({
  tenantId,
  state,
  requirementIds = [],
  supplierIds = [],
  observacoes = '',
  actorId = 'comprador'
}) {
  garantirColecoesCompras(state);

  if (!tenantId) throw new Error('tenantId é obrigatório.');
  if (!Array.isArray(requirementIds) || requirementIds.length === 0) {
    throw new Error('Ao menos uma necessidade de peça deve ser selecionada para cotar.');
  }

  const id = gerarId('cot');
  const seq = state.purchaseQuotes.filter(q => q.tenantId === tenantId).length + 1;
  const codigo = 'COT-' + (1000 + seq);

  const cotacao = {
    id,
    codigo,
    tenantId,
    requirementIds,
    supplierIds: Array.isArray(supplierIds) ? supplierIds : [],
    status: 'aberta', // aberta | respondida | finalizada | cancelada
    observacoes: String(observacoes || '').trim(),
    suppliers: [], // respostas dos fornecedores
    createdAt: new Date().toISOString(),
    createdBy: actorId,
    updatedAt: new Date().toISOString()
  };

  state.purchaseQuotes.push(cotacao);

  // Atualiza status das necessidades selecionadas para 'em_cotacao'
  for (const rId of requirementIds) {
    const req = state.partRequirements.find(r => r.id === rId && r.tenantId === tenantId);
    if (req && req.status === 'aguardando_compra') {
      req.status = 'em_cotacao';
      req.quoteId = id;
      req.updatedAt = new Date().toISOString();
    }
  }

  state.auditoria.unshift({
    id: gerarId('aud'),
    tenantId,
    dataHora: new Date().toISOString(),
    usuario: actorId,
    intencao: 'cotacao_criada',
    resumo: 'Cotação de compra #' + codigo + ' criada com ' + requirementIds.length + ' item(ns).'
  });

  return {
    ok: true,
    quote: cotacao
  };
}

/**
 * Registra a resposta de preço, frete e prazo de um fornecedor para a cotação
 */
function registrarRespostaFornecedor({
  tenantId,
  state,
  quoteId,
  supplierId,
  items = [],
  freight = 0,
  paymentTerms = 'A combinar',
  validUntil = null,
  actorId = 'comprador'
}) {
  garantirColecoesCompras(state);

  const cotacao = state.purchaseQuotes.find(q => q.id === quoteId && q.tenantId === tenantId);
  if (!cotacao) {
    throw new Error('Cotação não encontrada.');
  }

  const fornecedor = supplierService.obterFornecedor({ tenantId, state, supplierId });
  if (!fornecedor) {
    throw new Error('Fornecedor não encontrado no tenant.');
  }

  let subtotal = 0;
  const itensFormatados = items.map(it => {
    const unitPrice = arredondar(it.unitPrice || it.precoUnitario || 0);
    const qtd = Math.max(1, Number(it.quantity || it.qtd) || 1);
    const total = arredondar(unitPrice * qtd);
    subtotal += total;

    return {
      partId: it.partId,
      quantity: qtd,
      unitPrice,
      total,
      availability: it.availability || 'imediata', // imediata | encomenda
      diasEntrega: it.diasEntrega != null ? Number(it.diasEntrega) : (it.leadTimeDays != null ? Number(it.leadTimeDays) : (it.prazoDias != null ? Number(it.prazoDias) : (fornecedor.prazoMedioDias || 1)))
    };
  });

  subtotal = arredondar(subtotal);
  const frete = arredondar(freight);
  const totalGeral = arredondar(subtotal + frete);

  const respostaFornecedor = {
    supplierId,
    supplierNome: fornecedor.nome,
    items: itensFormatados,
    subtotal,
    freight: frete,
    total: totalGeral,
    paymentTerms: paymentTerms || fornecedor.condicoesPagamento || 'A combinar',
    validUntil: validUntil || null,
    respondidoEm: new Date().toISOString(),
    respondidoPor: actorId
  };

  cotacao.suppliers = Array.isArray(cotacao.suppliers) ? cotacao.suppliers : [];
  const idxExistente = cotacao.suppliers.findIndex(s => s.supplierId === supplierId);
  if (idxExistente !== -1) {
    cotacao.suppliers[idxExistente] = respostaFornecedor;
  } else {
    cotacao.suppliers.push(respostaFornecedor);
  }

  cotacao.status = 'respondida';
  cotacao.updatedAt = new Date().toISOString();

  return {
    ok: true,
    quote: cotacao,
    resposta: respostaFornecedor
  };
}

/**
 * Compara respostas de fornecedores com ordenação por preço e avaliação determinística
 * de impacto operacional sobre a data/hora prometida de entrega da OS.
 */
function compararCotacoes({ tenantId, state, quoteId, osId = null }) {
  garantirColecoesCompras(state);

  const cotacao = state.purchaseQuotes.find(q => q.id === quoteId && q.tenantId === tenantId);
  if (!cotacao) {
    throw new Error('Cotação não encontrada.');
  }

  const respostas = Array.isArray(cotacao.suppliers) ? [...cotacao.suppliers] : [];
  if (respostas.length === 0) {
    return {
      quote: cotacao,
      respostas: [],
      melhorPreco: null,
      melhorPrazo: null,
      alertasImpacto: []
    };
  }

  // Identifica a OS associada para verificar a promessa de entrega
  let osAlvo = null;
  if (osId) {
    osAlvo = state.os.find(o => o.id === osId);
  } else if (Array.isArray(cotacao.requirementIds) && cotacao.requirementIds.length > 0) {
    const primeiroReq = state.partRequirements.find(r => r.id === cotacao.requirementIds[0]);
    if (primeiroReq && primeiroReq.osId) {
      osAlvo = state.os.find(o => o.id === primeiroReq.osId);
    }
  }

  let dataHoraPrometidaOS = null;
  if (osAlvo) {
    if (osAlvo.promessaEntrega && osAlvo.promessaEntrega.data) {
      dataHoraPrometidaOS = osAlvo.promessaEntrega.data + ' ' + (osAlvo.promessaEntrega.hora || '18:00');
    } else if (osAlvo.prev) {
      dataHoraPrometidaOS = osAlvo.prev + ' ' + (osAlvo.horaPrev || '18:00');
    } else if (osAlvo.previsaoEntrega) {
      dataHoraPrometidaOS = osAlvo.previsaoEntrega;
    }
  }

  const alertasImpacto = [];

  const comparativo = respostas.map(r => {
    let prazoEmDias = 999;
    let dataEstimadaEntrega = null;

    if (r.items && r.items.length > 0) {
      prazoEmDias = Math.max(...r.items.map(it => Number(it.diasEntrega) || 1));
      const estimadas = r.items.map(it => it.estimatedDelivery).filter(Boolean);
      if (estimadas.length > 0) {
        dataEstimadaEntrega = estimadas.sort()[estimadas.length - 1];
      }
    }

    // Avaliação de impacto na OS
    let impactoOS = { atrasaEntrega: false, alerta: null };
    if (dataHoraPrometidaOS && (dataEstimadaEntrega || prazoEmDias != null)) {
      const agora = new Date();
      let dtEntregaEstimada = dataEstimadaEntrega ? new Date(dataEstimadaEntrega) : new Date(agora.getTime() + prazoEmDias * 24 * 60 * 60 * 1000);
      const dtPromessa = new Date(dataHoraPrometidaOS);

      if (!isNaN(dtEntregaEstimada.getTime()) && !isNaN(dtPromessa.getTime())) {
        if (dtEntregaEstimada > dtPromessa) {
          const diffHoras = Math.round((dtEntregaEstimada - dtPromessa) / (1000 * 60 * 60));
          const msg = 'Atenção: A entrega das peças pelo fornecedor "' + r.supplierNome + '" ocorre após a promessa atual da OS #' + (osAlvo?.num || osAlvo?.id) + ' (atraso estimado de ~' + diffHoras + 'h). Recomenda-se revisar a promessa com o cliente.';
          impactoOS = {
            atrasaEntrega: true,
            diasAtraso: arredondar(diffHoras / 24, 1),
            alerta: msg
          };
          alertasImpacto.push({
            supplierId: r.supplierId,
            supplierNome: r.supplierNome,
            alerta: msg
          });
        }
      }
    }

    return {
      ...r,
      prazoEmDias,
      dataEstimadaEntrega,
      impactoOS
    };
  });

  // Ordenações determinísticas
  const ordenadoPreco = [...comparativo].sort((a, b) => a.total - b.total);
  const ordenadoPrazo = [...comparativo].sort((a, b) => a.prazoEmDias - b.prazoEmDias);

  return {
    quote: cotacao,
    comparativo,
    melhorPreco: ordenadoPreco[0] || null,
    melhorPrazo: ordenadoPrazo[0] || null,
    alertasImpacto,
    osAlvo: osAlvo ? { id: osAlvo.id, num: osAlvo.num, promessaEntrega: dataHoraPrometidaOS } : null
  };
}

/**
 * Cria um pedido de compra para um fornecedor selecionado.
 * Avalia o teto de alçada: compras acima do valor limite entram como 'aguardando_aprovacao'.
 */
function criarPedidoCompra({
  tenantId,
  state,
  supplierId,
  items = [],
  quoteId = null,
  freight = 0,
  paymentTerms = 'A combinar',
  expectedAt = null,
  observacoes = '',
  actorId = 'comprador'
}) {
  garantirColecoesCompras(state);

  if (!tenantId) throw new Error('tenantId é obrigatório.');
  const fornecedor = supplierService.obterFornecedor({ tenantId, state, supplierId });
  if (!fornecedor) throw new Error('Fornecedor não encontrado.');
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('Ao menos um item deve ser adicionado ao pedido.');
  }

  let subtotal = 0;
  const itensFormatados = items.map((it, idx) => {
    const unitPrice = arredondar(it.unitPrice || it.preco || 0);
    const qtd = Math.max(1, Number(it.quantity || it.qtd) || 1);
    const total = arredondar(unitPrice * qtd);
    subtotal += total;

    return {
      id: it.id || ('pitem_' + Date.now() + '_' + idx),
      partId: it.partId,
      requirementId: it.requirementId || null,
      osId: it.osId || null,
      quantity: qtd,
      unitPrice,
      total,
      receivedQuantity: 0,
      pendingQuantity: qtd
    };
  });

  subtotal = arredondar(subtotal);
  const frete = arredondar(freight);
  const totalGeral = arredondar(subtotal + frete);

  // Alçada de compras configurada por tenant (padrão: R$ 2.000,00)
  const limiteAprovacao = Number(state.cfg?.compras?.exigirAprovacaoAcimaDe) || 2000;
  const exigeAprovacao = totalGeral > limiteAprovacao;

  const id = gerarId('ped');
  const seq = state.purchaseOrders.filter(p => p.tenantId === tenantId).length + 1;
  const codigo = 'PED-' + (1000 + seq);

  const statusInicial = exigeAprovacao ? 'aguardando_aprovacao' : 'pedido_realizado';

  const order = {
    id,
    codigo,
    tenantId,
    supplierId,
    supplierNome: fornecedor.nome,
    quoteId: quoteId || null,
    status: statusInicial, // rascunho | aguardando_aprovacao | pedido_realizado | parcialmente_recebido | recebido | cancelado
    items: itensFormatados,
    subtotal,
    freight: frete,
    total: totalGeral,
    totalGeral,
    valorTotal: totalGeral,
    paymentTerms: paymentTerms || fornecedor.condicoesPagamento || 'A combinar',
    requestedAt: new Date().toISOString(),
    orderedAt: !exigeAprovacao ? new Date().toISOString() : null,
    expectedAt: expectedAt || null,
    receivedAt: null,
    observacoes: String(observacoes || '').trim(),
    createdBy: actorId,
    approvedBy: null,
    approvedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  state.purchaseOrders.push(order);

  // Mantém coleção legado 'compras' em sincronia
  state.compras.push({
    id,
    forn: fornecedor.nome,
    total: totalGeral,
    status: statusInicial,
    data: order.requestedAt
  });

  // Atualiza as necessidades associadas
  for (const it of itensFormatados) {
    if (it.requirementId) {
      const req = state.partRequirements.find(r => r.id === it.requirementId && r.tenantId === tenantId);
      if (req) {
        req.status = exigeAprovacao ? 'aguardando_aprovacao_compra' : 'aguardando_recebimento';
        req.purchaseOrderId = id;
        req.updatedAt = new Date().toISOString();
      }
    }
  }

  state.auditoria.unshift({
    id: gerarId('aud'),
    tenantId,
    dataHora: new Date().toISOString(),
    usuario: actorId,
    intencao: 'pedido_compra_criado',
    resumo: 'Pedido de compra #' + codigo + ' (' + fornecedor.nome + ') criado no valor de R$ ' + totalGeral + '. Status: ' + statusInicial + '.'
  });

  return {
    ok: true,
    order,
    exigeAprovacao,
    limiteAprovacao
  };
}

/**
 * Aprovação de pedido de compra acima do limite de alçada
 */
function aprovarPedidoCompra({ tenantId, state, orderId, actorId = 'gerente', userPermissions = [] }) {
  garantirColecoesCompras(state);

  const order = state.purchaseOrders.find(p => p.id === orderId && p.tenantId === tenantId);
  if (!order) throw new Error('Pedido de compra não encontrado.');

  if (order.status !== 'aguardando_aprovacao') {
    return { ok: true, repetido: true, order, mensagem: 'Pedido já se encontra com status ' + order.status + '.' };
  }

  const limite = Number(state.cfg?.compras?.exigirAprovacaoAcimaDe) || 2000;
  if (order.total > limite) {
    const podeAprovar = userPermissions.includes('*') || userPermissions.includes('purchase:approve');
    if (!podeAprovar) {
      throw new Error('Acesso negado: aprovação de compras acima de R$ ' + limite + ' exige permissão "purchase:approve".');
    }
  }

  order.status = 'aprovado';
  order.approvedBy = actorId;
  order.approvedAt = new Date().toISOString();
  order.orderedAt = new Date().toISOString();
  order.updatedAt = new Date().toISOString();

  // Atualiza necessidades associadas
  for (const it of order.items) {
    if (it.requirementId) {
      const req = state.partRequirements.find(r => r.id === it.requirementId && r.tenantId === tenantId);
      if (req) {
        req.status = 'aguardando_recebimento';
        req.updatedAt = new Date().toISOString();
      }
    }
  }

  state.auditoria.unshift({
    id: gerarId('aud'),
    tenantId,
    dataHora: new Date().toISOString(),
    usuario: actorId,
    intencao: 'pedido_compra_aprovado',
    resumo: 'Pedido de compra #' + order.codigo + ' (R$ ' + order.total + ') aprovado por ' + actorId + '.'
  });

  return {
    ok: true,
    order
  };
}

/**
 * Cancelamento de pedido de compra (Alto Risco)
 */
function cancelarPedidoCompra({ tenantId, state, orderId, reason = '', actorId = 'gerente' }) {
  garantirColecoesCompras(state);

  const order = state.purchaseOrders.find(p => p.id === orderId && p.tenantId === tenantId);
  if (!order) throw new Error('Pedido de compra não encontrado.');

  if (order.status === 'recebido') {
    throw new Error('Não é possível cancelar um pedido de compra já integralmente recebido.');
  }

  order.status = 'cancelado';
  order.motivoCancelamento = String(reason || '').trim();
  order.updatedAt = new Date().toISOString();

  // Reverte as necessidades de volta para 'aguardando_compra'
  for (const it of order.items) {
    if (it.requirementId) {
      const req = state.partRequirements.find(r => r.id === it.requirementId && r.tenantId === tenantId);
      if (req && req.status !== 'consumida' && req.status !== 'atendida') {
        req.status = 'aguardando_compra';
        req.purchaseOrderId = null;
        req.updatedAt = new Date().toISOString();
      }
    }
  }

  state.auditoria.unshift({
    id: gerarId('aud'),
    tenantId,
    dataHora: new Date().toISOString(),
    usuario: actorId,
    intencao: 'pedido_compra_cancelado',
    resumo: 'Pedido de compra #' + order.codigo + ' cancelado. Motivo: ' + reason
  });

  return {
    ok: true,
    order
  };
}

/**
 * Recebimento de mercadorias (Total ou Parcial)
 * Atualiza estoque físico via movimentação 'entrada_compra',
 * E ESTRITAMENTE reserva de forma prioritária as peças para a OS solicitante de origem!
 */
function receberPedidoCompra({
  tenantId,
  state,
  orderId,
  itensRecebidos = [], // [{ partId, quantity }]
  nfNumero = null,
  actorId = 'almoxarife'
}) {
  garantirColecoesCompras(state);

  const order = state.purchaseOrders.find(p => p.id === orderId && p.tenantId === tenantId);
  if (!order) throw new Error('Pedido de compra não encontrado.');

  if (order.status === 'recebido') {
    return { ok: true, repetido: true, order, mensagem: 'Pedido já estava totalmente recebido.' };
  }

  const itensAlocadosOS = [];
  let valorRecebidoTotal = 0;

  // Se itensRecebidos não foi detalhado, assume recebimento total do saldo pendente
  const mapaEntregas = new Map();
  if (Array.isArray(itensRecebidos) && itensRecebidos.length > 0) {
    for (const it of itensRecebidos) {
      mapaEntregas.set(it.partId, Number(it.quantity || it.qtd) || 0);
    }
  } else {
    for (const it of order.items) {
      mapaEntregas.set(it.partId, it.pendingQuantity);
    }
  }

  for (const it of order.items) {
    const qtdParaReceber = mapaEntregas.has(it.partId) ? Math.min(it.pendingQuantity, mapaEntregas.get(it.partId)) : 0;
    if (qtdParaReceber <= 0) continue;

    it.receivedQuantity += qtdParaReceber;
    it.pendingQuantity = Math.max(0, it.quantity - it.receivedQuantity);

    const valorParcial = arredondar(qtdParaReceber * it.unitPrice);
    valorRecebidoTotal += valorParcial;

    // 1. Entrada física no almoxarifado via Ledger Imutável com recálculo de custo médio ponderado
    inventoryService.registrarMovimentacao({
      tenantId,
      state,
      partId: it.partId,
      type: 'entrada_compra',
      quantity: qtdParaReceber,
      purchaseOrderId: order.id,
      unitCost: it.unitPrice,
      reason: 'Recebimento de compra #' + order.codigo + (nfNumero ? ' (NF: ' + nfNumero + ')' : ''),
      actorId
    });

    // 2. Vinculação e Reserva Automática e Prioritária para a OS de Origem
    if (it.osId) {
      let req = state.partRequirements.find(
        r => r.tenantId === tenantId && r.osId === it.osId && r.partId === it.partId && (it.requirementId ? r.id === it.requirementId : true)
      );

      if (req) {
        req.reservedQuantity += qtdParaReceber;
        req.missingQuantity = Math.max(0, req.missingQuantity - qtdParaReceber);
        req.status = req.missingQuantity === 0 ? 'atendida' : 'parcial';
        req.updatedAt = new Date().toISOString();
      }

      // Grava movimento de reserva no ledger
      inventoryService.registrarMovimentacao({
        tenantId,
        state,
        partId: it.partId,
        type: 'reserva',
        quantity: qtdParaReceber,
        osId: it.osId,
        reason: 'Reserva prioritária automática para OS #' + it.osId + ' decorrente do pedido #' + order.codigo,
        actorId
      });

      // Sincroniza OS
      const os = state.os.find(o => o.id === it.osId && (o.tenantId === tenantId || !o.tenantId));
      if (os && Array.isArray(os.pecas)) {
        const itemOS = os.pecas.find(p => p.partId === it.partId || (req && p.id === req.quotationItemId));
        if (itemOS) {
          itemOS.statusEstoque = req ? req.status : 'atendida';
          itemOS.qtdReservada = req ? req.reservedQuantity : qtdParaReceber;
        }
      }

      itensAlocadosOS.push({
        osId: it.osId,
        partId: it.partId,
        quantity: qtdParaReceber
      });
    }
  }

  // Verifica se todos os itens foram integralmente recebidos
  const todosRecebidos = order.items.every(it => it.pendingQuantity === 0);
  order.status = todosRecebidos ? 'recebido' : 'parcialmente_recebido';
  if (todosRecebidos) {
    order.receivedAt = new Date().toISOString();
  }
  order.updatedAt = new Date().toISOString();

  // 3. Atualiza histórico do fornecedor para aferir prazo prometido vs real
  const diasPrometidos = order.expectedAt
    ? Math.max(1, Math.round((new Date(order.expectedAt) - new Date(order.orderedAt || order.requestedAt)) / (1000 * 60 * 60 * 24)))
    : 1;
  const diasRealizados = Math.max(1, Math.round((new Date() - new Date(order.orderedAt || order.requestedAt)) / (1000 * 60 * 60 * 24)));

  supplierService.registrarHistoricoCompra({
    tenantId,
    state,
    supplierId: order.supplierId,
    orderId: order.id,
    valor: valorRecebidoTotal,
    diasPrometidos,
    diasRealizados,
    itens: order.items
  });

  // 4. Integração Financeira: gera Conta a Pagar Pendente (NUNCA automaticamente paga)
  if (valorRecebidoTotal > 0) {
    const contaId = gerarId('cp');
    state.contas.push({
      id: contaId,
      tenantId,
      tipo: 'pagar',
      desc: 'Compra de peças #' + order.codigo + ' - ' + order.supplierNome + (nfNumero ? ' (NF ' + nfNumero + ')' : ''),
      valor: arredondar(valorRecebidoTotal),
      venc: new Date(Date.now() + 28 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10), // Prazo padrão 28 dias
      st: 'pendente', // NUNCA paga automaticamente
      cat: 'pecas',
      fornecedorId: order.supplierId,
      pedidoCompraId: order.id,
      criadoEm: new Date().toISOString()
    });
  }

  state.auditoria.unshift({
    id: gerarId('aud'),
    tenantId,
    dataHora: new Date().toISOString(),
    usuario: actorId,
    intencao: 'pedido_compra_recebido',
    resumo: 'Recebimento do pedido #' + order.codigo + ' (' + order.status + '). Valor: R$ ' + valorRecebidoTotal + '. ' + itensAlocadosOS.length + ' item(ns) alocados para OS.'
  });

  return {
    ok: true,
    order,
    status: order.status,
    valorRecebido: valorRecebidoTotal,
    itensAlocadosOS
  };
}

module.exports = {
  garantirColecoesCompras,
  listarNecessidadesCompra,
  gerarNecessidadeCompra,
  criarCotacao,
  registrarRespostaFornecedor,
  compararCotacoes,
  criarPedidoCompra,
  aprovarPedidoCompra,
  cancelarPedidoCompra,
  receberPedidoCompra
};
