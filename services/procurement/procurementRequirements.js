'use strict';

const crypto = require('crypto');

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

module.exports = {
  arredondar,
  gerarId,
  garantirColecoesCompras,
  listarNecessidadesCompra,
  gerarNecessidadeCompra
};
