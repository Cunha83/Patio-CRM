'use strict';

const decimal = require('./decimal');
function round2(n) { return decimal.round(n, 2); }
function round4(n) { return decimal.round(n, 4); }

/**
 * Calcula tributos para um item de prestação de serviços mecânicos (NFS-e)
 */
function calcularTributosItemServico(item, emitenteConfig = {}, options = {}) {
  const quantidade = round4(item.quantidade ?? 1);
  const valorUnitario = round4(item.valorUnitario || item.valor || 0);
  const vServ = decimal.product(quantidade, valorUnitario);
  const vDesc = round2(item.desconto || 0);

  const itemListaServico = item.itemListaServico || '';
  const cnae = item.cnae || emitenteConfig.cnaePrincipal || '';
  const codigoTributacaoMunicipio = item.codigoTributacaoMunicipio || '';

  const pISS = Number(item.aliquotaISS !== undefined ? item.aliquotaISS : (emitenteConfig.aliquotaPadraoISS ?? 0));
  const issRetido = Boolean(item.issRetido || false);

  const baseISS = round2(vServ - vDesc);
  const vISS = decimal.percentage(baseISS, pISS);
  const vISSRetido = issRetido ? vISS : 0;

  const cClassTrib = item.cClassTrib || emitenteConfig.cClassTribPadrao || '';
  const pCBS = Number(item.aliquotaCBS !== undefined ? item.aliquotaCBS : (emitenteConfig.aliqPadraoCBS ?? 0));
  const pIBS = Number(item.aliquotaIBS !== undefined ? item.aliquotaIBS : (emitenteConfig.aliqPadraoIBS ?? 0));
  const vCBS = decimal.percentage(baseISS, pCBS);
  const vIBS = decimal.percentage(baseISS, pIBS);

  const valorLiquido = round2(vServ - vDesc - vISSRetido);

  return {
    numeroItem: item.numeroItem || 1,
    codigoInterno: String(item.codigoInterno || item.id || 'SRV-001'),
    descricao: String(item.descricao || item.nome || 'Serviço de Oficina Mecânica'),
    itemListaServico,
    cnae,
    codigoTributacaoMunicipio,
    quantidade,
    valorUnitario,
    valorBruto: vServ,
    desconto: vDesc,
    valorLiquido,
    baseISS,
    aliquotaISS: pISS,
    valorISS: vISS,
    issRetido,
    valorISSRetido: vISSRetido,
    reformaTributaria: {
      cClassTrib,
      baseIvaDual: baseISS,
      aliquotaCBS: pCBS,
      valorCBS: vCBS,
      aliquotaIBS: pIBS,
      valorIBS: vIBS
    }
  };
}

module.exports = {
  calcularTributosItemServico
};

