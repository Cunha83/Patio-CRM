'use strict';

const inventoryService = require('../inventoryService');
const supplierService = require('../supplierService');
const {
  arredondar,
  gerarId,
  garantirColecoesCompras
} = require('./procurementRequirements');

/**
 * Recebimento de mercadorias (Total ou Parcial)
 * Atualiza estoque físico via movimentação 'entrada_compra',
 * E ESTRITAMENTE reserva de forma prioritária as peças para a OS solicitante de origem!
 */
function receberPedidoCompra({
  tenantId,
  state,
  orderId,
  itensRecebidos = [],
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

  const todosRecebidos = order.items.every(it => it.pendingQuantity === 0);
  order.status = todosRecebidos ? 'recebido' : 'parcialmente_recebido';
  if (todosRecebidos) {
    order.receivedAt = new Date().toISOString();
  }
  order.updatedAt = new Date().toISOString();

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

  if (valorRecebidoTotal > 0) {
    const contaId = gerarId('cp');
    state.contas.push({
      id: contaId,
      tenantId,
      tipo: 'pagar',
      desc: 'Compra de peças #' + order.codigo + ' - ' + order.supplierNome + (nfNumero ? ' (NF ' + nfNumero + ')' : ''),
      valor: arredondar(valorRecebidoTotal),
      venc: new Date(Date.now() + 28 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      st: 'pendente',
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
  receberPedidoCompra
};
