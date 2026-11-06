'use strict';

const {
  gerarId,
  garantirColecoesEstoque,
  registrarMovimentacao
} = require('./inventoryLedger');

const {
  calcularSaldos
} = require('./inventoryCatalog');

/**
 * Reserva peças para uma Ordem de Serviço com resolução atômica de concorrência.
 * Se o estoque disponível for parcial ou nulo, registra a necessidade de compra do saldo restante.
 */
function reservarParaOS({
  tenantId,
  state,
  osId,
  quotationId = null,
  quotationItemId = null,
  partId,
  quantity,
  permitirParcial = true,
  actorId = 'sistema'
}) {
  garantirColecoesEstoque(state);

  const peca = state.pecas.find(p => p.id === partId && p.tenantId === tenantId);
  if (!peca) {
    throw new Error('Peça "' + partId + '" não encontrada para reserva.');
  }

  const qtdNecessaria = Math.max(1, Number(quantity) || 1);
  const saldos = calcularSaldos({ tenantId, state, partId });
  const disponivel = saldos.estoqueDisponivel;

  if (permitirParcial === false && disponivel < qtdNecessaria) {
    throw new Error('Saldo em estoque disponível insuficiente para reserva total. Disponível: ' + disponivel + ', Solicitado: ' + qtdNecessaria);
  }

  let qtdReservada = 0;
  let qtdFaltante = 0;
  let status = 'aguardando_compra';

  if (disponivel >= qtdNecessaria) {
    qtdReservada = qtdNecessaria;
    qtdFaltante = 0;
    status = 'atendida';
  } else if (disponivel > 0) {
    qtdReservada = disponivel;
    qtdFaltante = qtdNecessaria - disponivel;
    status = 'parcial';
  } else {
    qtdReservada = 0;
    qtdFaltante = qtdNecessaria;
    status = 'aguardando_compra';
  }

  if (qtdReservada > 0) {
    registrarMovimentacao({
      tenantId,
      state,
      partId,
      type: 'reserva',
      quantity: qtdReservada,
      osId,
      reason: 'Reserva para OS #' + osId + ' (Item: ' + peca.descricao + ')',
      actorId
    });
  }

  const requirement = {
    id: gerarId('req'),
    tenantId,
    osId,
    quotationId,
    quotationItemId,
    partId,
    requiredQuantity: qtdNecessaria,
    reservedQuantity: qtdReservada,
    missingQuantity: qtdFaltante,
    status,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  state.partRequirements.push(requirement);

  const os = state.os.find(o => o.id === osId && (o.tenantId === tenantId || !o.tenantId));
  if (os && Array.isArray(os.pecas)) {
    let itemOS = os.pecas.find(p => p.id === quotationItemId || p.partId === partId || p.pecaId === partId || p.desc === peca.descricao);
    if (itemOS) {
      itemOS.partId = partId;
      itemOS.pecaId = partId;
      itemOS.requirementId = requirement.id;
      itemOS.statusEstoque = status;
      itemOS.status = status === 'atendida' ? 'reservada' : status;
      itemOS.st = itemOS.status;
      itemOS.qtdReservada = qtdReservada;
      itemOS.qtdFaltante = qtdFaltante;
    } else {
      itemOS = {
        id: quotationItemId || gerarId('item'),
        partId,
        pecaId: partId,
        nome: peca.descricao,
        desc: peca.descricao,
        qtd: qtdNecessaria,
        status: status === 'atendida' ? 'reservada' : status,
        st: status === 'atendida' ? 'reservada' : status,
        statusEstoque: status,
        qtdReservada,
        qtdFaltante
      };
      os.pecas.push(itemOS);
    }
  }

  return {
    ok: true,
    reservedQuantity: qtdReservada,
    quantidadeReservada: qtdReservada,
    missingQuantity: qtdFaltante,
    requirement,
    saldos: calcularSaldos({ tenantId, state, partId }),
    resumo: 'OS #' + osId + ': ' + qtdReservada + ' reservada(s), ' + qtdFaltante + ' aguardando compra.'
  };
}

/**
 * Libera reserva previamente associada a uma OS
 */
function liberarReserva({ tenantId, state, osId, partId, quantity = null, reason = '', actorId = 'sistema' }) {
  garantirColecoesEstoque(state);

  const reqs = state.partRequirements.filter(
    r => r.tenantId === tenantId && r.osId === osId && (partId ? r.partId === partId : true) && r.reservedQuantity > 0
  );

  if (reqs.length === 0) {
    return { ok: false, error: 'Nenhuma reserva ativa encontrada para esta OS/peça.' };
  }

  let totalLiberado = 0;
  for (const req of reqs) {
    const qtdALiberar = quantity != null ? Math.min(Number(quantity), req.reservedQuantity) : req.reservedQuantity;
    if (qtdALiberar <= 0) continue;

    req.reservedQuantity -= qtdALiberar;
    req.missingQuantity += qtdALiberar;
    req.status = req.reservedQuantity > 0 ? 'parcial' : 'cancelada';
    req.updatedAt = new Date().toISOString();

    registrarMovimentacao({
      tenantId,
      state,
      partId: req.partId,
      type: 'liberacao_reserva',
      quantity: qtdALiberar,
      osId,
      reason: reason || 'Cancelamento ou liberação de reserva operacional',
      actorId
    });

    totalLiberado += qtdALiberar;
    if (quantity != null && totalLiberado >= quantity) break;
  }

  return {
    ok: true,
    totalLiberado,
    saldos: partId ? calcularSaldos({ tenantId, state, partId }) : null
  };
}

/**
 * Registra o consumo de uma peça pelo mecânico na OS
 */
function consumirPecaOS({ tenantId, state, osId, partId, quantity, mechanicId = null, actorId = 'mecanico' }) {
  garantirColecoesEstoque(state);

  const peca = state.pecas.find(p => p.id === partId && p.tenantId === tenantId);
  if (!peca) {
    throw new Error('Peça não encontrada para consumo.');
  }

  const os = state.os.find(o => o.id === osId && (o.tenantId === tenantId || !o.tenantId));
  if (!os) {
    throw new Error('Ordem de serviço não encontrada.');
  }

  const qtdConsumo = Math.max(1, Number(quantity) || 1);

  const req = state.partRequirements.find(
    r => r.tenantId === tenantId && r.osId === osId && r.partId === partId && ['atendida', 'parcial', 'reservada'].includes(r.status)
  );

  const mov = registrarMovimentacao({
    tenantId,
    state,
    partId,
    type: 'saida_os',
    quantity: qtdConsumo,
    osId,
    mechanicId: mechanicId || os.mecanico || null,
    reason: 'Consumo aplicado pelo mecânico na OS #' + (os.num || os.id),
    actorId
  });

  if (req) {
    req.reservedQuantity = Math.max(0, req.reservedQuantity - qtdConsumo);
    if (req.reservedQuantity === 0 && req.missingQuantity === 0) {
      req.status = 'consumida';
    }
    req.updatedAt = new Date().toISOString();
  }

  if (Array.isArray(os.pecas)) {
    const itemOS = os.pecas.find(p => p.partId === partId || p.pecaId === partId || p.id === req?.quotationItemId);
    if (itemOS) {
      itemOS.status = 'consumida';
      itemOS.st = 'consumida';
      itemOS.consumida = true;
      itemOS.consumidaPor = mechanicId || actorId;
      itemOS.consumidaEm = new Date().toISOString();
    }
  }

  return {
    ok: true,
    movement: mov,
    saldos: calcularSaldos({ tenantId, state, partId })
  };
}

module.exports = {
  reservarParaOS,
  liberarReserva,
  consumirPecaOS
};

