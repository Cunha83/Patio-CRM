'use strict';

/**
 * Pátio CRM — Motor de Cálculo e Rateio Tributário de Alta Precisão
 * Suporte a NF-e (Modelo 55), NFS-e (Serviços Mecânicos LC 116/2003) e Reforma Tributária (IVA Dual 2026).
 */

const decimal = require('./decimal');
function round2(n) { return decimal.round(n, 2); }
function round4(n) { return decimal.round(n, 4); }

/**
 * Rateio proporcional exato de despesas (desconto, frete, seguro, outras despesas)
 * sobre itens, garantindo que a soma dos rateios seja aritmeticamente idêntica ao total informado.
 */
function ratearValorSobreItens(valorTotal, itens, campoValorBase = 'valorBruto') {
  if (!Array.isArray(itens)) throw new Error('Itens inválidos.');
  return decimal.allocate(valorTotal, itens.map(it => it[campoValorBase] ?? 0));
}

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

  // Regra padrão ou informada no item
  const cfop = item.cfop || '';
  const ncm = String(item.ncm || '').replace(/\D/g, '');
  const cest = item.cest ? String(item.cest).replace(/\D/g, '') : null;
  const origem = String(item.origem !== undefined ? item.origem : ''); // 0 = Nacional

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
    // Simples Nacional: CSOSN 101, 102, 500, etc.
    if (csosn === '101' || csosn === '201') {
      pCredSN = Number(emitenteConfig.aliquotaCreditoSN ?? 0);
      vBC = round2(vProd - vDesc + vFrete + vOutro);
      vCredICMSSN = decimal.percentage(vBC, pCredSN);
    } else if (csosn === '500') {
      // ICMS cobrado anteriormente por substituição tributária (ST)
      vBC = 0;
      vICMS = 0;
    } else {
      // 102, 103, 300, 400 - Sem permissão de crédito
      vBC = 0;
      vICMS = 0;
    }
  } else {
    // Regime Normal: CST 00, 20, 60, etc.
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
  let cstIPI = item.cstIPI || null; // 53 = Saída não-tributada
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

  // Valor total do item
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
    // ICMS
    regime,
    cstICMS,
    csosn,
    baseICMS: vBC,
    aliquotaICMS: pICMS,
    valorICMS: vICMS,
    creditoSN: { aliquota: pCredSN, valor: vCredICMSSN },
    // ICMS ST
    mvaST: pMVA,
    baseICMSST: vBCST,
    aliquotaICMSST: pICMSST,
    valorICMSST: vICMSST,
    // PIS & COFINS
    cstPIS,
    basePIS: vBCPIS,
    aliquotaPIS: pPIS,
    valorPIS: vPIS,
    cstCOFINS,
    baseCOFINS: vBCCOFINS,
    aliquotaCOFINS: pCOFINS,
    valorCOFINS: vCOFINS,
    // IPI
    cstIPI,
    baseIPI: vBCIPI,
    aliquotaIPI: pIPI,
    valorIPI: vIPI,
    // IVA Dual 2026
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

/**
 * Calcula tributos para um item de prestação de serviços mecânicos (NFS-e)
 */
function calcularTributosItemServico(item, emitenteConfig = {}, options = {}) {
  const quantidade = round4(item.quantidade ?? 1);
  const valorUnitario = round4(item.valorUnitario || item.valor || 0);
  const vServ = decimal.product(quantidade, valorUnitario);
  const vDesc = round2(item.desconto || 0);

  // Subitem LC 116/2003: 14.01 (Manutenção de veículos)
  const itemListaServico = item.itemListaServico || '';
  const cnae = item.cnae || emitenteConfig.cnaePrincipal || '';
  const codigoTributacaoMunicipio = item.codigoTributacaoMunicipio || '';

  const pISS = Number(item.aliquotaISS !== undefined ? item.aliquotaISS : (emitenteConfig.aliquotaPadraoISS ?? 0));
  const issRetido = Boolean(item.issRetido || false);

  const baseISS = round2(vServ - vDesc);
  const vISS = decimal.percentage(baseISS, pISS);
  const vISSRetido = issRetido ? vISS : 0;

  // Reforma Tributária IVA Dual 2026 sobre Serviços
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

/**
 * Consolida e calcula todos os itens e totais de um documento fiscal eletrônico
 */
function calcularDocumentoFiscal({ modelo = '55', itens = [], descontoGeral = 0, freteGeral = 0, outrasDespesasGeral = 0, emitenteConfig = {} }) {
  if (!Array.isArray(itens) || itens.length === 0) {
    throw new Error('Documento fiscal deve conter ao menos um item.');
  }

  const isServico = modelo === 'NFS-e';

  // 1. Rateio de desconto geral sobre os itens
  const itensComValorBruto = itens.map((it, idx) => {
    const q = round4(it.quantidade ?? 1);
    const vUn = round4(it.valorUnitario || it.valor || 0);
    return {
      ...it,
      numeroItem: idx + 1,
      quantidade: q,
      valorUnitario: vUn,
      valorBruto: decimal.product(q, vUn)
    };
  });

  const rateiosDesconto = ratearValorSobreItens(descontoGeral, itensComValorBruto, 'valorBruto');
  const rateiosFrete = ratearValorSobreItens(freteGeral, itensComValorBruto, 'valorBruto');
  const rateiosOutras = ratearValorSobreItens(outrasDespesasGeral, itensComValorBruto, 'valorBruto');

  // 2. Aplicação de tributos por item
  const itensCalculados = itensComValorBruto.map((it, idx) => {
    const itemComRateio = {
      ...it,
      desconto: round2(Number(it.desconto || 0) + rateiosDesconto[idx]),
      frete: round2(Number(it.frete || 0) + rateiosFrete[idx]),
      outrasDespesas: round2(Number(it.outrasDespesas || 0) + rateiosOutras[idx])
    };

    if (itemComRateio.desconto > it.valorBruto) throw new Error('Desconto rateado superior ao valor do item.');
    if (isServico && (itemComRateio.frete || itemComRateio.outrasDespesas)) throw new Error('Despesas acessórias em serviços fora da cobertura inicial.');
    if (isServico) {
      return { ...calcularTributosItemServico(itemComRateio, emitenteConfig), fiscalInput: it };
    }
    return { ...calcularTributosItemMercadoria(itemComRateio, emitenteConfig), fiscalInput: it };
  });

  // 3. Consolidação dos totais
  const totais = {
    valorProdutos: 0,
    valorServicos: 0,
    desconto: 0,
    frete: 0,
    outrasDespesas: 0,
    baseICMS: 0,
    valorICMS: 0,
    baseICMSST: 0,
    valorICMSST: 0,
    valorIPI: 0,
    valorPIS: 0,
    valorCOFINS: 0,
    baseISS: 0,
    valorISS: 0,
    valorISSRetido: 0,
    valorCBS: 0,
    valorIBS: 0,
    valorTotalDocumento: 0
  };

  itensCalculados.forEach(it => {
    if (isServico) {
      totais.valorServicos = round2(totais.valorServicos + it.valorBruto);
      totais.baseISS = round2(totais.baseISS + it.baseISS);
      totais.valorISS = round2(totais.valorISS + it.valorISS);
      totais.valorISSRetido = round2(totais.valorISSRetido + it.valorISSRetido);
    } else {
      totais.valorProdutos = round2(totais.valorProdutos + it.valorBruto);
      totais.baseICMS = round2(totais.baseICMS + it.baseICMS);
      totais.valorICMS = round2(totais.valorICMS + it.valorICMS);
      totais.baseICMSST = round2(totais.baseICMSST + it.baseICMSST);
      totais.valorICMSST = round2(totais.valorICMSST + it.valorICMSST);
      totais.valorIPI = round2(totais.valorIPI + it.valorIPI);
      totais.valorPIS = round2(totais.valorPIS + it.valorPIS);
      totais.valorCOFINS = round2(totais.valorCOFINS + it.valorCOFINS);
    }

    totais.desconto = round2(totais.desconto + it.desconto);
    totais.frete = round2(totais.frete + (it.frete || 0));
    totais.outrasDespesas = round2(totais.outrasDespesas + (it.outrasDespesas || 0));

    if (it.reformaTributaria) {
      totais.valorCBS = round2(totais.valorCBS + it.reformaTributaria.valorCBS);
      totais.valorIBS = round2(totais.valorIBS + it.reformaTributaria.valorIBS);
    }
  });

  if (isServico) {
    totais.valorTotalDocumento = round2(totais.valorServicos - totais.desconto);
  } else {
    totais.valorTotalDocumento = round2(
      totais.valorProdutos - totais.desconto + totais.frete + totais.outrasDespesas + totais.valorICMSST + totais.valorIPI
    );
  }

  return {
    modelo,
    itens: itensCalculados,
    totais,
    reformaTributaria: {
      valorCBS: totais.valorCBS,
      valorIBS: totais.valorIBS
    }
  };
}

module.exports = {
  round2,
  round4,
  ratearValorSobreItens,
  calcularTributosItemMercadoria,
  calcularTributosItemServico,
  calcularDocumentoFiscal
};
