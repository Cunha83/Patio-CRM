'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  round2,
  ratearValorSobreItens,
  calcularTributosItemMercadoria,
  calcularTributosItemServico,
  calcularDocumentoFiscal
} = require('../services/fiscal/fiscalCalculationEngine');

test('Motor de Cálculo e Rateio Tributário Fiscal (NF-e, NFS-e e IVA Dual 2026)', async (t) => {

  // 1. Arredondamento monetário preciso e ausência de dízima de ponto flutuante
  await t.test('1. round2 elimina dízimas de ponto flutuante em valores centesimais', () => {
    assert.equal(0.1 + 0.2 !== 0.3, true, 'Verifica fraqueza nativa do IEEE 754');
    assert.equal(round2(0.1 + 0.2), 0.3);
    assert.equal(round2(19.995), 20);
    assert.equal(round2(19.994), 19.99);
  });

  // 2. Rateio proporcional exato com conservação de centavos
  await t.test('2. ratearValorSobreItens preserva rigorosamente a soma total dos descontos', () => {
    const itens = [
      { valorBruto: 100 },
      { valorBruto: 200 },
      { valorBruto: 300 }
    ];
    // R$ 50 de desconto a ratear: 100/600 (8.33), 200/600 (16.67), 300/600 (25.00) -> soma = 50.00
    const rateios = ratearValorSobreItens(50.00, itens, 'valorBruto');
    assert.equal(rateios.length, 3);
    const somaRateada = round2(rateios.reduce((a, b) => a + b, 0));
    assert.equal(somaRateada, 50.00, 'A soma dos rateios deve ser exatamente 50.00');

    // Desconto com resíduo ímpar: R$ 10,00 sobre 3 itens de R$ 30,00 cada
    const itensIguais = [
      { valorBruto: 30 },
      { valorBruto: 30 },
      { valorBruto: 30 }
    ];
    const rateiosImpares = ratearValorSobreItens(10.00, itensIguais, 'valorBruto');
    const somaImpar = round2(rateiosImpares.reduce((a, b) => a + b, 0));
    assert.equal(somaImpar, 10.00, 'Resíduo de centavo deve ser resolvido sem perder ou criar centavos');
  });

  // 3. Tributação de Peça (NF-e 55) em Simples Nacional e Regime Normal
  await t.test('3. calcularTributosItemMercadoria apura ICMS, ST, PIS e COFINS com precisão', () => {
    const configSimples = { regimeTributario: 'simples_nacional' };
    const itemPecaSN = {
      descricao: 'Feixe de Mola Dianteiro Scania',
      quantidade: 2,
      valorUnitario: 850.00,
      desconto: 50.00,
      csosn: '500', // Substituição Tributária
      cfop: '5405',
      ncm: '73201000'
    };

    const calcSN = calcularTributosItemMercadoria(itemPecaSN, configSimples);
    assert.equal(calcSN.valorBruto, 1700.00);
    assert.equal(calcSN.desconto, 50.00);
    assert.equal(calcSN.valorTotal, 1650.00);
    assert.equal(calcSN.valorICMS, 0, 'CSOSN 500 não destaca ICMS próprio');

    // Regime Normal com ICMS-ST e MVA 40%
    const configNormal = { regimeTributario: 'lucro_presumido' };
    const itemPecaNormal = {
      descricao: 'Tambor de Freio Traseiro Volvo',
      quantidade: 1,
      valorUnitario: 600.00,
      desconto: 0,
      frete: 40.00,
      cstICMS: '00',
      aliquotaICMS: 18,
      mvaST: 40,
      aliquotaICMSST: 18,
      aliquotaPIS: 0.65,
      cstPIS: '01',
      aliquotaCOFINS: 3.00,
      cstCOFINS: '01'
    };

    const calcNormal = calcularTributosItemMercadoria(itemPecaNormal, configNormal);
    assert.equal(calcNormal.baseICMS, 640.00); // 600 + 40 frete
    assert.equal(calcNormal.valorICMS, 115.20); // 18% de 640
    // Base ST = 640 * 1.4 = 896.00 -> ICMS total = 896 * 0.18 = 161.28 -> ST = 161.28 - 115.20 = 46.08
    assert.equal(calcNormal.baseICMSST, 896.00);
    assert.equal(calcNormal.valorICMSST, 46.08);
    assert.equal(calcNormal.valorPIS, 3.90); // 0.65% de 600
    assert.equal(calcNormal.valorCOFINS, 18.00); // 3% de 600
    // Total = 600 + 40 (frete) + 46.08 (ST) = 686.08
    assert.equal(calcNormal.valorTotal, 686.08);
  });

  // 4. Tributação de Serviço (NFS-e) LC 116/2003 Subitem 14.01
  await t.test('4. calcularTributosItemServico apura ISS e retenção municipal', () => {
    const config = {
      cnaePrincipal: '4520-0/01',
      aliquotaPadraoISS: 5.0
    };

    const itemServicoSemRetencao = {
      descricao: 'Alinhamento de Eixos a Laser e Balanceamento',
      quantidade: 1,
      valorUnitario: 450.00,
      desconto: 0,
      issRetido: false
    };

    const calc1 = calcularTributosItemServico(itemServicoSemRetencao, config);
    assert.equal(calc1.valorBruto, 450.00);
    assert.equal(calc1.baseISS, 450.00);
    assert.equal(calc1.aliquotaISS, 5.0);
    assert.equal(calc1.valorISS, 22.50);
    assert.equal(calc1.valorISSRetido, 0);
    assert.equal(calc1.valorLiquido, 450.00);

    // Serviço com ISS retido pelo tomador (ex: frotista PJ)
    const itemServicoComRetencao = {
      descricao: 'Revisão Geral de Caixa de Câmbio ZF',
      quantidade: 1,
      valorUnitario: 1200.00,
      desconto: 100.00,
      aliquotaISS: 3.0,
      issRetido: true
    };

    const calc2 = calcularTributosItemServico(itemServicoComRetencao, config);
    assert.equal(calc2.valorBruto, 1200.00);
    assert.equal(calc2.baseISS, 1100.00);
    assert.equal(calc2.aliquotaISS, 3.0);
    assert.equal(calc2.valorISS, 33.00);
    assert.equal(calc2.valorISSRetido, 33.00);
    assert.equal(calc2.valorLiquido, 1067.00); // 1100 - 33
  });

  // 5. Reforma Tributária (IVA Dual: CBS 0,90% + IBS 0,10% teste 2026)
  await t.test('5. Reforma Tributária: campos de CBS e IBS apurados conforme EC 132/2023', () => {
    const config = {
      aliqPadraoCBS: 0.90,
      aliqPadraoIBSEst: 0.05,
      aliqPadraoIBSMun: 0.05,
      aliqPadraoIBS: 0.10,
      cClassTribPadrao: '010101'
    };

    const item = {
      descricao: 'Válvula Reguladora de Pressão Knorr',
      quantidade: 1,
      valorUnitario: 1000.00,
      desconto: 0
    };

    const calc = calcularTributosItemMercadoria(item, config);
    assert.ok(calc.reformaTributaria);
    assert.equal(calc.reformaTributaria.cClassTrib, '010101');
    assert.equal(calc.reformaTributaria.valorCBS, 9.00); // 0.9% de 1000
    assert.equal(calc.reformaTributaria.valorIBS, 1.00); // 0.1% de 1000
  });

  // 6. Consolidação completa de documento fiscal (NF-e mista de produtos com rateios)
  await t.test('6. calcularDocumentoFiscal consolida todos os itens e totais do documento', () => {
    const itens = [
      { id: '1', descricao: 'Grampo de Mola 3/4', quantidade: 4, valorUnitario: 50.00 }, // 200.00
      { id: '2', descricao: 'Pino de Centro M14', quantidade: 2, valorUnitario: 25.00 }, // 50.00
      { id: '3', descricao: 'Bucha de Bronze Traseira', quantidade: 2, valorUnitario: 125.00 } // 250.00
    ];

    const docCalculado = calcularDocumentoFiscal({
      modelo: '55',
      itens,
      descontoGeral: 20.00,
      freteGeral: 30.00,
      emitenteConfig: { regimeTributario: 'simples_nacional' }
    });

    assert.equal(docCalculado.totais.valorProdutos, 500.00);
    assert.equal(docCalculado.totais.desconto, 20.00);
    assert.equal(docCalculado.totais.frete, 30.00);
    assert.equal(docCalculado.totais.valorTotalDocumento, 510.00); // 500 - 20 + 30
    assert.equal(docCalculado.itens.length, 3);
  });
});
