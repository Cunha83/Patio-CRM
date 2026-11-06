'use strict';

/**
 * Pátio CRM — Motor de Cálculo e Rateio Tributário de Alta Precisão
 * Suporte a NF-e (Modelo 55), NFS-e (Serviços Mecânicos LC 116/2003) e Reforma Tributária (IVA Dual 2026).
 *
 * Fachada Modular (< 150 linhas).
 * Submódulos:
 * - services/fiscal/fiscalMercadoria.js: Tributos de itens de peças / mercadorias
 * - services/fiscal/fiscalServico.js: Tributos de itens de serviços mecânicos
 */

const decimal = require('./decimal');
const { calcularTributosItemMercadoria } = require('./fiscalMercadoria');
const { calcularTributosItemServico } = require('./fiscalServico');

function round2(n) { return decimal.round(n, 2); }
function round4(n) { return decimal.round(n, 4); }

/**
 * Rateio proporcional exato de despesas sobre itens
 */
function ratearValorSobreItens(valorTotal, itens, campoValorBase = 'valorBruto') {
  if (!Array.isArray(itens)) throw new Error('Itens inválidos.');
  return decimal.allocate(valorTotal, itens.map(it => it[campoValorBase] ?? 0));
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

  // 3. Totalização do documento
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
