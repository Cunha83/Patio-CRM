'use strict';

const supplierService = require('../supplierService');
const {
  arredondar,
  gerarId,
  garantirColecoesCompras
} = require('./procurementRequirements');

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
    status: 'aberta',
    observacoes: String(observacoes || '').trim(),
    suppliers: [],
    createdAt: new Date().toISOString(),
    createdBy: actorId,
    updatedAt: new Date().toISOString()
  };

  state.purchaseQuotes.push(cotacao);

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
      availability: it.availability || 'imediata',
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

module.exports = {
  criarCotacao,
  registrarRespostaFornecedor,
  compararCotacoes
};
