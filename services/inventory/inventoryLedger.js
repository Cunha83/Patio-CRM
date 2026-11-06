'use strict';

const crypto = require('crypto');

function arredondar(valor, decimais = 2) {
  const n = Number(valor) || 0;
  return Number(Math.round(n + 'e' + decimais) + 'e-' + decimais);
}

function gerarId(prefix) {
  return prefix + '_' + Date.now() + '_' + crypto.randomBytes(3).toString('hex');
}

/**
 * Inicializa coleções de estoque no estado caso ausentes
 */
function garantirColecoesEstoque(state) {
  state.pecas = Array.isArray(state.pecas) ? state.pecas : [];
  state.inventoryMovements = Array.isArray(state.inventoryMovements) ? state.inventoryMovements : [];
  state.partRequirements = Array.isArray(state.partRequirements) ? state.partRequirements : [];
  state.auditoria = Array.isArray(state.auditoria) ? state.auditoria : [];
  state.os = Array.isArray(state.os) ? state.os : [];
}

/**
 * Registra movimentação no ledger imutável de estoque
 */
function registrarMovimentacao({
  tenantId,
  state,
  partId,
  type,
  quantity,
  osId = null,
  purchaseOrderId = null,
  reason = '',
  actorId = 'sistema',
  mechanicId = null,
  unitCost = null
}) {
  garantirColecoesEstoque(state);

  const peca = state.pecas.find(p => p.id === partId && p.tenantId === tenantId);
  if (!peca) {
    throw new Error('Peça "' + partId + '" não encontrada no tenant para movimentação.');
  }

  const qtdMov = Number(quantity);
  if (!qtdMov || qtdMov <= 0) {
    throw new Error('Quantidade para movimentação deve ser maior que zero.');
  }

  const tiposValidos = [
    'entrada_compra',
    'saida_os',
    'reserva',
    'liberacao_reserva',
    'devolucao_os',
    'ajuste_positivo',
    'ajuste_negativo',
    'transferencia'
  ];

  if (!tiposValidos.includes(type)) {
    throw new Error('Tipo de movimentação inválido: "' + type + '".');
  }

  const qtdFisicaAnterior = Math.max(0, Number(peca.qtd) || 0);
  let novaQtdFisica = qtdFisicaAnterior;

  // Atualização de saldo físico conforme o tipo
  if (['entrada_compra', 'ajuste_positivo', 'devolucao_os'].includes(type)) {
    novaQtdFisica = qtdFisicaAnterior + qtdMov;

    // Recálculo do custo médio ponderado por entrada de compra ou ajuste com valor
    if ((type === 'entrada_compra' || type === 'ajuste_positivo') && unitCost != null && Number(unitCost) >= 0) {
      const custoAtual = Number(peca.custoMedio != null ? peca.custoMedio : peca.custo) || 0;
      const novoCustoEntrada = arredondar(unitCost);

      if (novaQtdFisica > 0) {
        const valorTotalExistente = qtdFisicaAnterior * custoAtual;
        const valorTotalEntrada = qtdMov * novoCustoEntrada;
        const novoCustoMedio = arredondar((valorTotalExistente + valorTotalEntrada) / novaQtdFisica);
        peca.custoMedio = novoCustoMedio;
        peca.custo = novoCustoMedio;
      } else {
        peca.custoMedio = novoCustoEntrada;
        peca.custo = novoCustoEntrada;
      }
    }
  } else if (['saida_os', 'ajuste_negativo'].includes(type)) {
    if (qtdFisicaAnterior < qtdMov) {
      throw new Error('Saldo físico insuficiente no almoxarifado. Atual: ' + qtdFisicaAnterior + ', Solicitado: ' + qtdMov + '.');
    }
    novaQtdFisica = Math.max(0, qtdFisicaAnterior - qtdMov);
  }

  peca.qtd = novaQtdFisica;
  peca.updatedAt = new Date().toISOString();

  const movement = {
    id: gerarId('mov'),
    tenantId,
    partId,
    type,
    quantity: qtdMov,
    osId,
    purchaseOrderId,
    reason: String(reason || '').trim(),
    actorId,
    mechanicId,
    unitCost: unitCost != null ? arredondar(unitCost) : null,
    saldoAnterior: qtdFisicaAnterior,
    saldoNovo: novaQtdFisica,
    saldoFisicoApos: novaQtdFisica,
    createdAt: new Date().toISOString()
  };

  state.inventoryMovements.unshift(movement);

  state.auditoria.unshift({
    id: gerarId('aud'),
    tenantId,
    dataHora: new Date().toISOString(),
    usuario: actorId,
    intencao: 'estoque_' + type,
    resumo: 'Movimentação de estoque [' + type + '] da peça "' + peca.descricao + '" (' + qtdMov + ' un). Saldo físico: ' + novaQtdFisica + '.',
    osId
  });

  return movement;
}

/**
 * Devolução de peça não utilizada na OS ao almoxarifado
 */
function devolverPecaOS({ tenantId, state, osId, partId, quantity, reason = '', actorId = 'mecanico', calcularSaldosFn }) {
  garantirColecoesEstoque(state);

  const qtdDev = Math.max(1, Number(quantity) || 1);

  const mov = registrarMovimentacao({
    tenantId,
    state,
    partId,
    type: 'devolucao_os',
    quantity: qtdDev,
    osId,
    reason: reason || 'Devolução de peça sobressalente da OS #' + osId,
    actorId
  });

  return {
    ok: true,
    movement: mov,
    saldos: calcularSaldosFn ? calcularSaldosFn({ tenantId, state, partId }) : null
  };
}

/**
 * Ajuste manual de estoque (Ação de Alto Risco sujeita a permissão e auditoria)
 */
function ajustarEstoque({ tenantId, state, partId, novaQuantidade, reason = '', actorId = 'gerente', calcularSaldosFn }) {
  garantirColecoesEstoque(state);

  const peca = state.pecas.find(p => p.id === partId && p.tenantId === tenantId);
  if (!peca) {
    throw new Error('Peça não encontrada para ajuste.');
  }

  const novaQtd = Math.max(0, Number(novaQuantidade));
  const atual = Math.max(0, Number(peca.qtd) || 0);
  const diff = novaQtd - atual;

  if (diff === 0) {
    return { ok: true, diferenca: 0, novaQuantidade: atual, mensagem: 'Saldo já está correto.' };
  }

  const type = diff > 0 ? 'ajuste_positivo' : 'ajuste_negativo';
  const mov = registrarMovimentacao({
    tenantId,
    state,
    partId,
    type,
    quantity: Math.abs(diff),
    reason: reason || 'Ajuste manual de inventário realizado por ' + actorId,
    actorId
  });

  return {
    ok: true,
    diferenca: diff,
    novaQuantidade: novaQtd,
    movement: mov,
    saldos: calcularSaldosFn ? calcularSaldosFn({ tenantId, state, partId }) : null
  };
}

module.exports = {
  arredondar,
  gerarId,
  garantirColecoesEstoque,
  registrarMovimentacao,
  devolverPecaOS,
  ajustarEstoque
};

