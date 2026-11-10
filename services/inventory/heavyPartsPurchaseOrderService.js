'use strict';

/**
 * services/inventory/heavyPartsPurchaseOrderService.js
 *
 * Motor de Compras Pesadas, Entrada de NF com Custo Médio Ponderado (CMP),
 * Geração de Contas a Pagar, Reserva Automática e Baixa de Gargalo de Pátio.
 *
 * Teto Modular: <= 350 linhas
 */

const crypto = require('crypto');

function round2(v) {
  return Math.round((Number(v) || 0) * 100) / 100;
}

function gerarId(prefix) {
  return prefix + '_' + Date.now() + '_' + crypto.randomBytes(3).toString('hex');
}

function garantirColecoes(state) {
  state.purchaseOrders = Array.isArray(state.purchaseOrders) ? state.purchaseOrders : [];
  state.pecas = Array.isArray(state.pecas) ? state.pecas : [];
  state.estoque = Array.isArray(state.estoque) ? state.estoque : [];
  state.partReservations = Array.isArray(state.partReservations) ? state.partReservations : [];
  state.inventoryMovements = Array.isArray(state.inventoryMovements) ? state.inventoryMovements : [];
  state.contas = Array.isArray(state.contas) ? state.contas : [];
  state.patioBoxes = Array.isArray(state.patioBoxes) ? state.patioBoxes : [];
  state.patioBottlenecks = Array.isArray(state.patioBottlenecks) ? state.patioBottlenecks : [];
  state.os = Array.isArray(state.os) ? state.os : [];
}

/**
 * Cria pedido de compra para peças pesadas.
 */
function criarPedidoCompraPecas(state, payload = {}) {
  if (!state) throw new Error('Estado da aplicação não informado');
  garantirColecoes(state);

  const itens = Array.isArray(payload.itens) ? payload.itens : [];
  if (itens.length === 0) {
    throw new Error('Pedido de compra deve conter ao menos 1 item');
  }

  let valorTotal = 0;
  const itensNormalizados = itens.map(i => {
    const qtd = Number(i.quantidade || i.qtd || 1);
    const custo = round2(i.custoUnitario || i.custo || 0);
    const subtotal = round2(qtd * custo);
    valorTotal = round2(valorTotal + subtotal);
    return {
      pecaId: i.pecaId || i.id || gerarId('peca'),
      codigo: i.codigo || '',
      descricao: i.descricao || i.nome || 'Peça pesada',
      quantidade: qtd,
      custoUnitario: custo,
      subtotal
    };
  });

  const pedido = {
    id: gerarId('po'),
    tenantId: payload.tenantId || 'default',
    fornecedorNome: payload.fornecedorNome || 'Fornecedor Diversos',
    fornecedorDocumento: payload.fornecedorDocumento || '',
    osVinculadaId: payload.osVinculadaId || null,
    gargaloVinculadoId: payload.gargaloVinculadoId || null,
    itens: itensNormalizados,
    valorTotalPedido: valorTotal,
    condicaoPagamentoParcelas: Math.max(1, Number(payload.condicaoPagamentoParcelas || 1)),
    primeiroVencimento: payload.primeiroVencimento || null,
    status: 'aguardando_entrega',
    criadoEm: payload.timestamp || new Date().toISOString(),
    responsavel: payload.responsavel || 'sistema'
  };

  state.purchaseOrders.push(pedido);
  return { ok: true, pedido };
}

/**
 * Registra o recebimento da Nota Fiscal, recalcula CMP, gera contas a pagar,
 * reserva itens para a OS e encerra automaticamente o gargalo 'aguardando_peca'.
 */
function receberNotaFiscalCompraPecas(state, pedidoId, options = {}) {
  if (!state) throw new Error('Estado da aplicação não informado');
  garantirColecoes(state);

  const pedido = state.purchaseOrders.find(p => p.id === pedidoId);
  if (!pedido) {
    throw new Error(`Pedido de compra "${pedidoId}" não encontrado`);
  }

  if (pedido.status === 'recebido') {
    const err = new Error('Pedido de compra já recebido anteriormente.');
    err.code = 'PURCHASE_ORDER_ALREADY_RECEIVED';
    err.status = 409;
    throw err;
  }

  const dataRecebimento = options.dataRecebimento || new Date().toISOString();

  // 1. Recálculo do CMP e entrada de saldo
  for (const item of pedido.itens) {
    let peca = state.pecas.find(p => p.id === item.pecaId || (p.codigo && p.codigo === item.codigo));
    if (!peca) {
      peca = state.estoque.find(p => p.id === item.pecaId || (p.codigo && p.codigo === item.codigo));
    }
    if (!peca) {
      peca = {
        id: item.pecaId,
        codigo: item.codigo,
        descricao: item.descricao,
        qtd: 0,
        custoMedio: item.custoUnitario,
        custo: item.custoUnitario,
        ultimoCustoCompra: item.custoUnitario
      };
      state.pecas.push(peca);
    }

    const qtdAnterior = Number(peca.qtd || peca.quantidade || 0);
    const custoAnterior = Number(peca.custoMedio ?? peca.custo ?? 0);
    const novaQtdTotal = qtdAnterior + item.quantidade;

    let novoCustoMedio = item.custoUnitario;
    if (novaQtdTotal > 0) {
      novoCustoMedio = +(((qtdAnterior * custoAnterior) + (item.quantidade * item.custoUnitario)) / novaQtdTotal).toFixed(2);
    }

    peca.qtd = novaQtdTotal;
    peca.custoMedio = novoCustoMedio;
    peca.custo = novoCustoMedio;
    peca.ultimoCustoCompra = item.custoUnitario;

    state.inventoryMovements.push({
      id: gerarId('mov'),
      tenantId: pedido.tenantId,
      pecaId: peca.id,
      tipo: 'entrada_nf_compra',
      numeroNF: options.numeroNF,
      chaveAcessoNF: options.chaveAcessoNF || '',
      quantidade: item.quantidade,
      custoUnitario: item.custoUnitario,
      novoCustoMedio,
      data: dataRecebimento
    });
  }

  // 2. Geração de Contas a Pagar ao Fornecedor
  const parcelasQtd = pedido.condicaoPagamentoParcelas || 1;
  const valorParcela = +((pedido.valorTotalPedido / parcelasQtd).toFixed(2));
  const contasCriadas = [];
  const baseDate = new Date(dataRecebimento);

  for (let i = 1; i <= parcelasQtd; i++) {
    const dtVenc = new Date(baseDate);
    dtVenc.setDate(dtVenc.getDate() + (i * 30));
    const vencimentoStr = (pedido.primeiroVencimento && i === 1)
      ? pedido.primeiroVencimento
      : dtVenc.toISOString().slice(0, 10);

    const valorReal = (i === parcelasQtd)
      ? +(pedido.valorTotalPedido - (valorParcela * (parcelasQtd - 1))).toFixed(2)
      : valorParcela;

    const cta = {
      id: gerarId('cta_pag'),
      tenantId: pedido.tenantId,
      tipo: 'pagar',
      cat: 'fornecedor_pecas',
      descricao: `NF ${options.numeroNF || ''} - ${pedido.fornecedorNome} (${i}/${parcelasQtd})`,
      fornecedor: pedido.fornecedorNome,
      numeroNF: options.numeroNF,
      pedidoCompraId: pedido.id,
      valor: valorReal,
      vencimento: vencimentoStr,
      status: 'pendente',
      criadoEm: dataRecebimento
    };
    state.contas.push(cta);
    contasCriadas.push(cta);
  }

  // 3. Reserva Automática na OS e Baixa do Gargalo
  const gargalosEncerrados = [];
  if (pedido.osVinculadaId && options.reservarAutomaticamenteParaOS !== false) {
    for (const item of pedido.itens) {
      state.partReservations.push({
        id: gerarId('res'),
        tenantId: pedido.tenantId,
        osId: pedido.osVinculadaId,
        partId: item.pecaId,
        nomePeca: item.descricao,
        quantity: item.quantidade,
        status: 'ativa',
        criadoEm: dataRecebimento
      });

      const os = state.os.find(o => o.id === pedido.osVinculadaId);
      if (os && Array.isArray(os.pecas)) {
        const osPeca = os.pecas.find(p => p.pecaId === item.pecaId || p.codigo === item.codigo);
        if (osPeca) {
          const pecaObj = state.pecas.find(p => p.id === item.pecaId);
          if (pecaObj) osPeca.custo = pecaObj.custoMedio;
        }
      }
    }

    const patioBottleneckSlaService = require('../patio/patioBottleneckSlaService');
    const gargalos = state.patioBottlenecks.filter(g =>
      (g.osId === pedido.osVinculadaId || g.id === pedido.gargaloVinculadoId) &&
      g.motivoParada === 'aguardando_peca' &&
      g.status !== 'encerrado'
    );

    for (const g of gargalos) {
      const enc = patioBottleneckSlaService.encerrarGargaloParadaOS(state, g.id, {
        resolucao: `Peças recebidas via NF ${options.numeroNF || ''}. Box liberado automaticamente.`,
        timestamp: dataRecebimento
      });
      gargalosEncerrados.push(enc);
    }
  }

  pedido.status = 'recebido';
  pedido.numeroNF = options.numeroNF;
  pedido.chaveAcessoNF = options.chaveAcessoNF || '';
  pedido.dataRecebimento = dataRecebimento;

  return { ok: true, pedido, contasCriadas, gargalosEncerrados };
}

/**
 * Calcula a margem bruta real das peças aplicadas em uma OS baseando-se no CMP.
 */
function calcularMargemRealOSPecas(state, osId) {
  if (!state) throw new Error('Estado da aplicação não informado');
  garantirColecoes(state);

  const os = state.os.find(o => o.id === osId || o.num === osId);
  if (!os) {
    throw new Error(`Ordem de serviço "${osId}" não encontrada`);
  }

  let receitaPecasTotal = 0;
  let custoPecasCMPTotal = 0;

  const pecasOS = Array.isArray(os.pecas) ? os.pecas : [];
  for (const item of pecasOS) {
    const qtd = Number(item.qtd || item.quantidade || 1);
    const precoVenda = Number(item.total != null ? item.total : (Number(item.valor || item.preco || 0) * qtd));
    receitaPecasTotal = round2(receitaPecasTotal + precoVenda);

    let pecaCadastrada = state.pecas.find(p => p.id === item.pecaId || (p.codigo && p.codigo === item.codigo));
    if (!pecaCadastrada) {
      pecaCadastrada = state.estoque.find(p => p.id === item.pecaId || (p.codigo && p.codigo === item.codigo));
    }

    const custoUnit = Number(pecaCadastrada?.custoMedio ?? item.custo ?? pecaCadastrada?.custo ?? 0);
    custoPecasCMPTotal = round2(custoPecasCMPTotal + (custoUnit * qtd));
  }

  const lucroBrutoPecas = round2(receitaPecasTotal - custoPecasCMPTotal);
  const margemBrutaPercentual = receitaPecasTotal > 0
    ? round2((lucroBrutoPecas / receitaPecasTotal) * 100)
    : 0;

  return {
    osId: os.id,
    receitaPecasTotal,
    custoPecasCMPTotal,
    lucroBrutoPecas,
    margemBrutaPercentual
  };
}

module.exports = {
  criarPedidoCompraPecas,
  receberNotaFiscalCompraPecas,
  calcularMargemRealOSPecas
};

