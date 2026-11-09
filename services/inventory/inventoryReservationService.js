'use strict';

const crypto = require('crypto');
const inventoryBatchService = require('./inventoryBatchService');

function gerarId(prefix) {
  return prefix + '_' + Date.now() + '_' + crypto.randomBytes(3).toString('hex');
}

function garantirColecoesReservas(state) {
  state.pecas = Array.isArray(state.pecas) ? state.pecas : [];
  state.os = Array.isArray(state.os) ? state.os : [];
  state.partReservations = Array.isArray(state.partReservations) ? state.partReservations : [];
  state.inventoryMovements = Array.isArray(state.inventoryMovements) ? state.inventoryMovements : [];
  state.inventoryBatches = Array.isArray(state.inventoryBatches) ? state.inventoryBatches : [];
}

/**
 * Retorna saldos triplos (Físico, Reservado e Disponível) para uma peça.
 */
function obterSaldosDetalhados({ tenantId, state, partId }) {
  if (!tenantId || !state || !partId) {
    return { saldoFisico: 0, saldoReservado: 0, saldoDisponivel: 0 };
  }

  garantirColecoesReservas(state);

  const peca = state.pecas.find(p => p.id === partId && (!p.tenantId || p.tenantId === tenantId));
  if (!peca) {
    return { saldoFisico: 0, saldoReservado: 0, saldoDisponivel: 0 };
  }

  const saldoFisico = Math.max(0, Number(peca.qtd) || 0);

  // Soma reservas ativas vinculadas a esta peça
  const reservasAtivas = state.partReservations.filter(
    r => r.tenantId === tenantId && r.partId === partId && (r.status === 'ativa' || r.status === 'reservada')
  );

  const saldoReservado = reservasAtivas.reduce((acc, r) => acc + (Number(r.quantity) || 0), 0);
  const saldoDisponivel = Math.max(0, saldoFisico - saldoReservado);

  return {
    saldoFisico,
    saldoReservado,
    saldoDisponivel
  };
}

/**
 * Reserva peças para uma Ordem de Serviço com resolução atômica e proteção contra overbooking.
 */
function reservarPecasOS({
  tenantId,
  state,
  osId,
  itens = [],
  actorId = 'sistema',
  permitirParcial = false
}) {
  if (!tenantId) throw new Error('tenantId é obrigatório.');
  if (!state) throw new Error('Estado é obrigatório.');
  if (!osId) throw new Error('osId é obrigatório.');
  if (!Array.isArray(itens) || itens.length === 0) {
    throw new Error('Lista de itens para reserva é obrigatória.');
  }

  garantirColecoesReservas(state);

  const os = state.os.find(o => o.id === osId && (!o.tenantId || o.tenantId === tenantId));
  if (!os) {
    throw new Error('Ordem de serviço "' + osId + '" não encontrada.');
  }

  // 1. Validação prévia de disponibilidade de todos os itens (Atomic check)
  for (const item of itens) {
    const partId = item.partId || item.pecaId || item.id;
    const qtd = Number(item.quantity || item.qtd || 1);
    if (qtd <= 0) continue;

    const saldos = obterSaldosDetalhados({ tenantId, state, partId });
    if (saldos.saldoDisponivel < qtd && !permitirParcial) {
      throw new Error(
        'Saldo disponível insuficiente para a peça "' + partId + '". Disponível: ' +
        saldos.saldoDisponivel + ', Solicitado: ' + qtd
      );
    }
  }

  // 2. Efetivação das reservas
  const reservasCriadas = [];
  for (const item of itens) {
    const partId = item.partId || item.pecaId || item.id;
    const qtd = Number(item.quantity || item.qtd || 1);
    if (qtd <= 0) continue;

    const peca = state.pecas.find(p => p.id === partId && (!p.tenantId || p.tenantId === tenantId));
    const nomePeca = peca ? (peca.descricao || peca.nome) : 'Peça';

    const reserva = {
      id: gerarId('res'),
      tenantId,
      osId,
      partId,
      nomePeca,
      quantity: qtd,
      loteCodigo: item.loteCodigo || null,
      status: 'ativa',
      criadoEm: new Date().toISOString(),
      atualizadoEm: new Date().toISOString(),
      actorId
    };

    state.partReservations.push(reserva);
    reservasCriadas.push(reserva);

    // Registra movimentação de reserva no ledger
    state.inventoryMovements.push({
      id: gerarId('mov'),
      tenantId,
      partId,
      type: 'reserva',
      quantity: qtd,
      osId,
      loteCodigo: reserva.loteCodigo,
      reason: 'Reserva para OS #' + (os.num || os.id) + ' (' + nomePeca + ')',
      actorId,
      timestamp: new Date().toISOString()
    });

    // Vincula na OS
    os.pecas = Array.isArray(os.pecas) ? os.pecas : [];
    let itemOS = os.pecas.find(p => p.partId === partId || p.pecaId === partId || p.id === item.id);
    if (itemOS) {
      itemOS.reservaId = reserva.id;
      itemOS.status = 'reservada';
      itemOS.st = 'reservada';
      itemOS.qtdReservada = qtd;
    } else {
      os.pecas.push({
        id: gerarId('item'),
        partId,
        pecaId: partId,
        nome: nomePeca,
        qtd,
        status: 'reservada',
        st: 'reservada',
        reservaId: reserva.id,
        qtdReservada: qtd
      });
    }
  }

  return {
    ok: true,
    totalReservado: reservasCriadas.length,
    reservas: reservasCriadas
  };
}

/**
 * Converte reservas ativas em baixa definitiva de estoque (Commit) na conclusão da OS.
 */
function efetivarBaixaOS({ tenantId, state, osId, actorId = 'sistema' }) {
  if (!tenantId || !state || !osId) {
    throw new Error('tenantId, state e osId são obrigatórios para efetivar baixa.');
  }

  garantirColecoesReservas(state);

  const reservasAtivas = state.partReservations.filter(
    r => r.tenantId === tenantId && r.osId === osId && (r.status === 'ativa' || r.status === 'reservada')
  );

  let totalItensBaixados = 0;
  for (const res of reservasAtivas) {
    res.status = 'baixada';
    res.atualizadoEm = new Date().toISOString();

    const peca = state.pecas.find(p => p.id === res.partId && (!p.tenantId || p.tenantId === tenantId));
    const temLotes = state.inventoryBatches.some(
      b => b.tenantId === tenantId && b.partId === res.partId && b.quantidadeAtual > 0
    );

    if (temLotes) {
      // Aloca consumo de lotes (respeitando FIFO ou lote explícito da reserva)
      inventoryBatchService.alocarLoteConsumo({
        tenantId,
        state,
        partId: res.partId,
        quantity: res.quantity,
        osId,
        loteCodigo: res.loteCodigo,
        actorId
      });
    } else {
      // Abate direto do saldo físico da peça se não houver lotes cadastrados
      if (peca) {
        peca.qtd = Math.max(0, (Number(peca.qtd) || 0) - res.quantity);
      }
      state.inventoryMovements.push({
        id: gerarId('mov'),
        tenantId,
        partId: res.partId,
        type: 'saida_os',
        quantity: res.quantity,
        osId,
        reason: 'Baixa definitiva por conclusão da OS #' + osId,
        actorId,
        timestamp: new Date().toISOString()
      });
    }

    totalItensBaixados++;
  }

  // Atualiza itens na OS
  const os = state.os.find(o => o.id === osId && (!o.tenantId || o.tenantId === tenantId));
  if (os && Array.isArray(os.pecas)) {
    os.pecas.forEach(p => {
      p.status = 'baixada';
      p.st = 'baixada';
      p.baixadaEm = new Date().toISOString();
    });
  }

  return {
    ok: true,
    totalItensBaixados
  };
}

/**
 * Libera/estorna reservas associadas a uma OS cancelada ou reaberta (Release).
 */
function liberarReservaOS({ tenantId, state, osId, reason = '', actorId = 'sistema' }) {
  if (!tenantId || !state || !osId) {
    throw new Error('tenantId, state e osId são obrigatórios para liberar reserva.');
  }

  garantirColecoesReservas(state);

  const reservasAtivas = state.partReservations.filter(
    r => r.tenantId === tenantId && r.osId === osId && (r.status === 'ativa' || r.status === 'reservada')
  );

  let totalItensLiberados = 0;
  for (const res of reservasAtivas) {
    res.status = 'cancelada';
    res.atualizadoEm = new Date().toISOString();

    state.inventoryMovements.push({
      id: gerarId('mov'),
      tenantId,
      partId: res.partId,
      type: 'liberacao_reserva',
      quantity: res.quantity,
      osId,
      reason: reason || 'Liberação/Estorno de reserva da OS #' + osId,
      actorId,
      timestamp: new Date().toISOString()
    });

    totalItensLiberados++;
  }

  const os = state.os.find(o => o.id === osId && (!o.tenantId || o.tenantId === tenantId));
  if (os && Array.isArray(os.pecas)) {
    os.pecas.forEach(p => {
      if (p.status === 'reservada') {
        p.status = 'liberada';
        p.st = 'liberada';
        p.qtdReservada = 0;
      }
    });
  }

  return {
    ok: true,
    totalItensLiberados
  };
}

module.exports = {
  obterSaldosDetalhados,
  reservarPecasOS,
  efetivarBaixaOS,
  liberarReservaOS
};

