'use strict';

const decimal = require('./decimal');
function round2(n) { return decimal.round(n, 2); }
function round4(n) { return decimal.round(n, 4); }

/**
 * Calcula tributos para um item de mercadoria (Peça / NF-e 55)
 */
function calcularTributosItemMercadoria(item, emitenteConfig = {}, options = {}) {
  const qCom = round4(item.quantidade ?? 1);
  const vUnCom = round4(item.valorUnitario || 0);
  const vProd = decimal.product(qCom, vUnCom);
  const vDesc = round2(item.desconto || 0);
  const vFrete = round2(item.frete || 0);
  const vOutro = round2(item.outrasDespesas || 0);

  const regime = emitenteConfig.regimeTributario || '';
  const isSimples = regime === 'simples_nacional';

  const cfop = item.cfop || '';
  const ncm = String(item.ncm || '').replace(/\D/g, '');
  const cest = item.cest ? String(item.cest).replace(/\D/g, '') : null;
  const origem = String(item.origem !== undefined ? item.origem : '');

  // 1. ICMS / CSOSN
  let cstICMS = item.cstICMS || null;
  let csosn = item.csosn || null;
  let pICMS = Number(item.aliquotaICMS ?? 0);
  let redBC = Number(item.reducaoBaseICMS || 0);

  let vBC = 0;
  let vICMS = 0;
  let pCredSN = 0;
  let vCredICMSSN = 0;

  if (isSimples) {
    if (csosn === '101' || csosn === '201') {
      pCredSN = Number(emitenteConfig.aliquotaCreditoSN ?? 0);
      vBC = round2(vProd - vDesc + vFrete + vOutro);
      vCredICMSSN = decimal.percentage(vBC, pCredSN);
    } else if (csosn === '500') {
      vBC = 0;
      vICMS = 0;
    } else {
      vBC = 0;
      vICMS = 0;
    }
  } else {
    if (cstICMS === '00') {
      vBC = round2(vProd - vDesc + vFrete + vOutro);
      vICMS = decimal.percentage(vBC, pICMS);
    } else if (cstICMS === '20') {
      const baseIntegral = round2(vProd - vDesc + vFrete + vOutro);
      vBC = round2(baseIntegral * (1 - redBC / 100));
      vICMS = decimal.percentage(vBC, pICMS);
    } else if (cstICMS === '60') {
      vBC = 0;
      vICMS = 0;
    }
  }

  // 2. ICMS-ST
  let pMVA = Number(item.mvaST || 0);
  let pICMSST = Number(item.aliquotaICMSST || 0);
  let vBCST = 0;
  let vICMSST = 0;

  if (pMVA > 0 && pICMSST > 0) {
    const baseSTBruta = round2((vProd - vDesc + vFrete + vOutro) * (1 + pMVA / 100));
    vBCST = baseSTBruta;
    const icmsSTCalculado = decimal.percentage(vBCST, pICMSST);
    vICMSST = Math.max(0, round2(icmsSTCalculado - vICMS));
  }

  // 3. PIS e COFINS
  let cstPIS = item.cstPIS || null;
  let pPIS = Number(item.aliquotaPIS ?? 0);
  let cstCOFINS = item.cstCOFINS || null;
  let pCOFINS = Number(item.aliquotaCOFINS ?? 0);

  let vBCPIS = 0;
  let vPIS = 0;
  let vBCCOFINS = 0;
  let vCOFINS = 0;

  if (['01', '02'].includes(cstPIS)) {
    vBCPIS = round2(vProd - vDesc);
    vPIS = decimal.percentage(vBCPIS, pPIS);
  }
  if (['01', '02'].includes(cstCOFINS)) {
    vBCCOFINS = round2(vProd - vDesc);
    vCOFINS = decimal.percentage(vBCCOFINS, pCOFINS);
  }

  // 4. IPI
  let cstIPI = item.cstIPI || null;
  let pIPI = Number(item.aliquotaIPI || 0);
  let vBCIPI = 0;
  let vIPI = 0;
  if (['50'].includes(cstIPI) && pIPI > 0) {
    vBCIPI = round2(vProd - vDesc);
    vIPI = decimal.percentage(vBCIPI, pIPI);
  }

  // 5. Reforma Tributária (IVA Dual: CBS e IBS 2026)
  const cClassTrib = item.cClassTrib || emitenteConfig.cClassTribPadrao || '';
  const pCBS = Number(item.aliquotaCBS !== undefined ? item.aliquotaCBS : (emitenteConfig.aliqPadraoCBS ?? 0));
  const pIBSEst = Number(item.aliquotaIBSEst !== undefined ? item.aliquotaIBSEst : (emitenteConfig.aliqPadraoIBSEst ?? 0));
  const pIBSMun = Number(item.aliquotaIBSMun !== undefined ? item.aliquotaIBSMun : (emitenteConfig.aliqPadraoIBSMun ?? 0));
  const pIBS = round2(pIBSEst + pIBSMun);

  const baseIvaDual = round2(vProd - vDesc);
  const vCBS = decimal.percentage(baseIvaDual, pCBS);
  const vIBS = decimal.percentage(baseIvaDual, pIBS);

  const vTotalItem = round2(vProd - vDesc + vFrete + vOutro + vICMSST + vIPI);

  return {
    numeroItem: item.numeroItem || 1,
    codigoInterno: String(item.codigoInterno || item.id || 'ITEM-001'),
    unidade: item.unidade || '',
    camposProvedor: item.camposProvedor || {},
    descricao: String(item.descricao || item.nome || 'Peça Pesada'),
    ncm,
    cest,
    cfop,
    origem,
    quantidade: qCom,
    valorUnitario: vUnCom,
    valorBruto: vProd,
    desconto: vDesc,
    frete: vFrete,
    outrasDespesas: vOutro,
    valorTotal: vTotalItem,
    regime,
    cstICMS,
    csosn,
    baseICMS: vBC,
    aliquotaICMS: pICMS,
    valorICMS: vICMS,
    creditoSN: { aliquota: pCredSN, valor: vCredICMSSN },
    mvaST: pMVA,
    baseICMSST: vBCST,
    aliquotaICMSST: pICMSST,
    valorICMSST: vICMSST,
    cstPIS,
    basePIS: vBCPIS,
    aliquotaPIS: pPIS,
    valorPIS: vPIS,
    cstCOFINS,
    baseCOFINS: vBCCOFINS,
    aliquotaCOFINS: pCOFINS,
    valorCOFINS: vCOFINS,
    cstIPI,
    baseIPI: vBCIPI,
    aliquotaIPI: pIPI,
    valorIPI: vIPI,
    reformaTributaria: {
      cClassTrib,
      baseIvaDual,
      aliquotaCBS: pCBS,
      valorCBS: vCBS,
      aliquotaIBSEst: pIBSEst,
      aliquotaIBSMun: pIBSMun,
      aliquotaIBS: pIBS,
      valorIBS: vIBS
    }
  };
}

module.exports = {
  calcularTributosItemMercadoria
};

