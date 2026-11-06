'use strict';

const supplierService = require('../supplierService');
const {
  arredondar,
  gerarId,
  garantirColecoesCompras
} = require('./procurementRequirements');

/**
 * Cria um pedido de compra para um fornecedor selecionado.
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
    status: statusInicial,
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

  state.compras.push({
    id,
    forn: fornecedor.nome,
    total: totalGeral,
    status: statusInicial,
    data: order.requestedAt
  });

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

module.exports = {
  criarPedidoCompra,
  aprovarPedidoCompra,
  cancelarPedidoCompra
};
