'use strict';

const crypto = require('crypto');

function gerarId(prefix) {
  return prefix + '_' + Date.now() + '_' + crypto.randomBytes(3).toString('hex');
}

function garantirColecoesLotes(state) {
  state.pecas = Array.isArray(state.pecas) ? state.pecas : [];
  state.os = Array.isArray(state.os) ? state.os : [];
  state.inventoryBatches = Array.isArray(state.inventoryBatches) ? state.inventoryBatches : [];
  state.inventoryMovements = Array.isArray(state.inventoryMovements) ? state.inventoryMovements : [];
}

/**
 * Registra a entrada de um lote de peças com rastreabilidade de fornecedor e fabricante.
 */
function registrarEntradaLote({
  tenantId,
  state,
  partId,
  loteCodigo,
  fornecedorId = '',
  fabricante = '',
  quantidade,
  custoUnitario = 0,
  dataEntrada = null,
  dataValidade = null,
  notaFiscal = '',
  actorId = 'sistema'
}) {
  if (!tenantId) throw new Error('tenantId é obrigatório para registrar lote.');
  if (!state) throw new Error('Estado é obrigatório.');
  if (!partId) throw new Error('partId é obrigatório.');
  if (!loteCodigo) throw new Error('loteCodigo é obrigatório.');

  const qtd = Number(quantidade);
  if (!qtd || qtd <= 0) {
    throw new Error('Quantidade do lote deve ser maior que zero.');
  }

  garantirColecoesLotes(state);

  const peca = state.pecas.find(p => p.id === partId && (!p.tenantId || p.tenantId === tenantId));
  if (!peca) {
    throw new Error('Peça "' + partId + '" não encontrada no estoque.');
  }

  const custo = Number(custoUnitario) || 0;
  const data = dataEntrada || new Date().toISOString();

  const lote = {
    id: gerarId('lote'),
    tenantId,
    partId,
    loteCodigo: String(loteCodigo).trim(),
    fornecedorId: String(fornecedorId || '').trim(),
    fabricante: String(fabricante || '').trim(),
    quantidadeInicial: qtd,
    quantidadeAtual: qtd,
    custoUnitario: custo,
    dataEntrada: data,
    dataValidade: dataValidade || null,
    notaFiscal: String(notaFiscal || '').trim(),
    status: 'ativo',
    consumos: [],
    criadoEm: new Date().toISOString()
  };

  state.inventoryBatches.push(lote);

  // Incrementa saldo físico da peça no catálogo
  peca.qtd = (Number(peca.qtd) || 0) + qtd;
  if (custo > 0) {
    peca.custo = custo;
  }

  // Registra movimentação no ledger
  state.inventoryMovements.push({
    id: gerarId('mov'),
    tenantId,
    partId,
    type: 'entrada_compra',
    quantity: qtd,
    loteId: lote.id,
    loteCodigo: lote.loteCodigo,
    unitCost: custo,
    notaFiscal: lote.notaFiscal,
    reason: 'Entrada de lote ' + lote.loteCodigo + (fabricante ? ' (' + fabricante + ')' : ''),
    actorId,
    timestamp: new Date().toISOString()
  });

  return lote;
}

/**
 * Aloca consumo de peças a partir de lotes ativos (via FIFO ou lote explícito).
 */
function alocarLoteConsumo({
  tenantId,
  state,
  partId,
  quantity,
  osId = null,
  loteCodigo = null,
  actorId = 'sistema'
}) {
  if (!tenantId) throw new Error('tenantId é obrigatório.');
  if (!state) throw new Error('Estado é obrigatório.');
  if (!partId) throw new Error('partId é obrigatório.');

  const qtdNecessaria = Number(quantity);
  if (!qtdNecessaria || qtdNecessaria <= 0) {
    throw new Error('Quantidade de consumo deve ser maior que zero.');
  }

  garantirColecoesLotes(state);

  const peca = state.pecas.find(p => p.id === partId && (!p.tenantId || p.tenantId === tenantId));
  if (!peca) {
    throw new Error('Peça "' + partId + '" não encontrada.');
  }

  let lotesDisponiveis = state.inventoryBatches.filter(
    b => b.tenantId === tenantId && b.partId === partId && b.quantidadeAtual > 0 && b.status === 'ativo'
  );

  if (loteCodigo) {
    lotesDisponiveis = lotesDisponiveis.filter(b => b.loteCodigo === loteCodigo);
    if (lotesDisponiveis.length === 0) {
      throw new Error('Lote específico "' + loteCodigo + '" não possui saldo disponível.');
    }
  } else {
    // Ordenação FIFO (PEPS): lotes com data de entrada mais antiga primeiro
    lotesDisponiveis.sort((a, b) => new Date(a.dataEntrada).getTime() - new Date(b.dataEntrada).getTime());
  }

  const saldoTotalLotes = lotesDisponiveis.reduce((acc, b) => acc + b.quantidadeAtual, 0);
  if (saldoTotalLotes < qtdNecessaria) {
    throw new Error(
      'Saldo insuficiente nos lotes para alocação. Solicitado: ' + qtdNecessaria + ', Disponível em lotes: ' + saldoTotalLotes
    );
  }

  let qtdRestante = qtdNecessaria;
  const alocacoes = [];

  for (const lote of lotesDisponiveis) {
    if (qtdRestante <= 0) break;

    const qtdPegar = Math.min(qtdRestante, lote.quantidadeAtual);
    lote.quantidadeAtual -= qtdPegar;
    qtdRestante -= qtdPegar;

    if (lote.quantidadeAtual <= 0) {
      lote.status = 'esgotado';
    }

    const regConsumo = {
      osId: osId || null,
      quantidade: qtdPegar,
      data: new Date().toISOString(),
      actorId
    };
    lote.consumos.push(regConsumo);

    alocacoes.push({
      loteId: lote.id,
      loteCodigo: lote.loteCodigo,
      fabricante: lote.fabricante,
      fornecedorId: lote.fornecedorId,
      quantidade: qtdPegar,
      custoUnitario: lote.custoUnitario
    });

    state.inventoryMovements.push({
      id: gerarId('mov'),
      tenantId,
      partId,
      type: 'saida_os',
      quantity: qtdPegar,
      osId,
      loteId: lote.id,
      loteCodigo: lote.loteCodigo,
      unitCost: lote.custoUnitario,
      reason: 'Consumo na OS #' + (osId || '-') + ' do lote ' + lote.loteCodigo,
      actorId,
      timestamp: new Date().toISOString()
    });
  }

  // Abate estoque físico no catálogo
  peca.qtd = Math.max(0, (Number(peca.qtd) || 0) - qtdNecessaria);

  // Vincula lote no item da OS se aplicável
  if (osId) {
    const os = state.os.find(o => o.id === osId && (!o.tenantId || o.tenantId === tenantId));
    if (os && Array.isArray(os.pecas)) {
      const itemOS = os.pecas.find(p => p.partId === partId || p.pecaId === partId || p.id === partId);
      if (itemOS) {
        itemOS.lotesAlocados = alocacoes;
        itemOS.loteCodigo = alocacoes[0]?.loteCodigo || null;
      }
    }
  }

  return alocacoes;
}

/**
 * Rastreamento reverso de recall e garantia: localiza veículos, placas e OSs que utilizaram um lote.
 */
function rastrearLote({ tenantId, state, loteCodigo }) {
  if (!tenantId || !state || !loteCodigo) {
    throw new Error('tenantId, state e loteCodigo são obrigatórios para rastreamento.');
  }

  garantirColecoesLotes(state);

  const lote = state.inventoryBatches.find(b => b.tenantId === tenantId && b.loteCodigo === loteCodigo);
  if (!lote) {
    return null;
  }

  const peca = state.pecas.find(p => p.id === lote.partId && (!p.tenantId || p.tenantId === tenantId));
  const pecaNome = peca ? (peca.descricao || peca.nome) : 'Peça';

  const utilizacoes = [];
  const consumos = Array.isArray(lote.consumos) ? lote.consumos : [];

  for (const c of consumos) {
    let osInfo = {
      osId: c.osId,
      osNum: c.osId,
      placa: '-',
      veiculo: '-',
      cliente: 'Consumidor',
      dataConsumo: c.data,
      quantidadeConsumida: c.quantidade
    };

    if (c.osId) {
      const os = state.os.find(o => o.id === c.osId && (!o.tenantId || o.tenantId === tenantId));
      if (os) {
        osInfo.osNum = os.num || os.id;
        osInfo.placa = os.placa || '-';
        osInfo.veiculo = os.modelo || os.veiculo || '-';
        osInfo.cliente = os.cliente || 'Consumidor';
      }
    }

    utilizacoes.push(osInfo);
  }

  return {
    lote: {
      id: lote.id,
      loteCodigo: lote.loteCodigo,
      partId: lote.partId,
      pecaNome,
      fornecedorId: lote.fornecedorId,
      fabricante: lote.fabricante,
      quantidadeInicial: lote.quantidadeInicial,
      quantidadeAtual: lote.quantidadeAtual,
      custoUnitario: lote.custoUnitario,
      dataEntrada: lote.dataEntrada,
      status: lote.status
    },
    totalUtilizado: lote.quantidadeInicial - lote.quantidadeAtual,
    utilizacoes
  };
}

function listarLotesPorPeca({ tenantId, state, partId }) {
  garantirColecoesLotes(state);
  return state.inventoryBatches.filter(
    b => b.tenantId === tenantId && (!partId || b.partId === partId)
  );
}

module.exports = {
  registrarEntradaLote,
  alocarLoteConsumo,
  rastrearLote,
  listarLotesPorPeca
};

