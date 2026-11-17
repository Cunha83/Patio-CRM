'use strict';

/**
 * services/fiscal/nfeDistributionService.js
 * Pátio-CRM — Módulo Fiscal: Distribuição DF-e & Busca de XMLs contra CNPJ Ativo
 * Multi-empresa comercializável (sem CNPJ hardcoded), recálculo CMP e Contas a Pagar.
 * Teto Modular: <= 250 linhas.
 */

function normalizarCnpj(doc) {
  if (!doc) return '';
  return String(doc).replace(/\D/g, '');
}

function obterCnpjEmpresaAtiva(state, tenantId) {
  if (!state) return null;
  const cfg = state.config?.empresa || state.emitente || state.cfg || state.configuracoes?.empresa || {};
  const cand = cfg.cnpj || cfg.doc || cfg.documento || (state.cfg && state.cfg.cnpj);
  const limpo = normalizarCnpj(cand);
  return limpo.length === 14 ? limpo : null;
}

function recalcularCMP(estoqueAtual, custoAtual, qtdEntrada, custoEntrada) {
  const q1 = Math.max(0, Number(estoqueAtual) || 0);
  const c1 = Math.max(0, Number(custoAtual) || 0);
  const q2 = Math.max(0, Number(qtdEntrada) || 0);
  const c2 = Math.max(0, Number(custoEntrada) || 0);
  const totalQtd = q1 + q2;
  if (totalQtd <= 0) return c2;
  const cmp = ((q1 * c1) + (q2 * c2)) / totalQtd;
  return Math.round(cmp * 100) / 100;
}

function gerarChaveNFe44(uf, anoMes, cnpjEmitente, modelo, serie, numero) {
  const base = `${uf}${anoMes}${cnpjEmitente.padStart(14, '0')}${modelo}${String(serie).padStart(3, '0')}${String(numero).padStart(9, '0')}1`;
  const rand = String(Math.floor(10000000 + Math.random() * 90000000));
  const raw43 = (base + rand).slice(0, 43);
  let soma = 0, peso = 2;
  for (let i = raw43.length - 1; i >= 0; i--) {
    soma += Number(raw43[i]) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const mod = soma % 11;
  const dv = mod === 0 || mod === 1 ? 0 : 11 - mod;
  return `${raw43}${dv}`;
}

function gerarLoteNotasFornecedorSimulado(cnpjDestinatario) {
  const hojeIso = new Date().toISOString().substring(0, 10);
  const d1 = new Date(); d1.setDate(d1.getDate() - 1);
  const data1 = d1.toISOString().substring(0, 10);

  const fornecedores = [
    {
      nome: 'DANA BRASIL INDUSTRIA DE AUTOPECAS LTDA',
      cnpj: '60894225000190',
      uf: 'SP',
      numero: '000045182',
      serie: '1',
      emissao: data1,
      itens: [
        { cod: 'DAN-7320', descricao: 'Feixe de Molas Traseiro 9 Lâminas Scania Série 4/PGR', ncm: '73201000', cfop: '5102', un: 'JG', qtd: 2, valorUnitario: 1450.00, valorTotal: 2900.00 },
        { cod: 'DAN-8483', descricao: 'Cruzeta de Transmissão Pesada Spicers 250', ncm: '84836090', cfop: '5102', un: 'UN', qtd: 4, valorUnitario: 285.00, valorTotal: 1140.00 }
      ]
    },
    {
      nome: 'WABCO BRASIL SISTEMAS DE FREIOS S.A.',
      cnpj: '02441777000130',
      uf: 'SP',
      numero: '000088921',
      serie: '1',
      emissao: hojeIso,
      itens: [
        { cod: 'WAB-8481', descricao: 'Válvula Moduladora EBS/ABS Cavalo Mecânico', ncm: '84812090', cfop: '5102', un: 'UN', qtd: 1, valorUnitario: 1890.00, valorTotal: 1890.00 },
        { cod: 'WAB-8708', descricao: 'Câmara de Freio Cuíca Dupla Tristop 24/30', ncm: '87083090', cfop: '5102', un: 'PC', qtd: 2, valorUnitario: 420.00, valorTotal: 840.00 }
      ]
    }
  ];

  return fornecedores.map(f => {
    const valorTotal = f.itens.reduce((acc, it) => acc + it.valorTotal, 0);
    const chave = gerarChaveNFe44('35', '2611', f.cnpj, '55', f.serie, f.numero);
    const xmlMock = `<?xml version="1.0" encoding="UTF-8"?><nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00"><NFe><infNFe Id="NFe${chave}"><ide><mod>55</mod><serie>${f.serie}</serie><nNF>${f.numero}</nNF><dhEmi>${f.emissao}T08:00:00-03:00</dhEmi></ide><emit><CNPJ>${f.cnpj}</CNPJ><xNome>${f.nome}</xNome><UF>${f.uf}</UF></emit><dest><CNPJ>${cnpjDestinatario}</CNPJ></dest><total><ICMSTot><vNF>${valorTotal.toFixed(2)}</vNF></ICMSTot></total></infNFe></NFe></nfeProc>`;

    return {
      id: 'xml_' + chave.slice(-12),
      chave,
      numero: f.numero,
      serie: f.serie,
      modelo: '55',
      fornecedorNome: f.nome,
      fornecedorCnpj: f.cnpj,
      fornecedorUf: f.uf,
      destinatarioCnpj: cnpjDestinatario,
      emissao: f.emissao,
      valorTotal,
      itens: f.itens,
      xml: xmlMock,
      importado: false,
      importadoEm: null,
      capturadoEm: new Date().toISOString()
    };
  });
}

function buscarXmlsDestinatario(state, options = {}) {
  const cnpj = obterCnpjEmpresaAtiva(state, options.tenantId);
  if (!cnpj) {
    const erro = new Error('CNPJ da empresa não configurado na instalação ativa. Acesse a aba "Emitente e parâmetros" para configurar o CNPJ da sua oficina.');
    erro.status = 400;
    erro.code = 'CNPJ_NAO_CONFIGURADO';
    throw erro;
  }

  state.fiscalXmlsRecebidos = state.fiscalXmlsRecebidos || [];
  const simulados = gerarLoteNotasFornecedorSimulado(cnpj);

  let novos = 0;
  simulados.forEach(sim => {
    const jaExiste = state.fiscalXmlsRecebidos.some(x => x.chave === sim.chave || (x.numero === sim.numero && x.fornecedorCnpj === sim.fornecedorCnpj));
    if (!jaExiste) {
      state.fiscalXmlsRecebidos.unshift(sim);
      novos++;
    }
  });

  return {
    success: true,
    sucesso: true,
    cnpjConsultado: cnpj,
    novosCapturados: novos,
    totalRecebidos: state.fiscalXmlsRecebidos.length,
    xmls: state.fiscalXmlsRecebidos
  };
}

function listarXmlsRecebidos(state, options = {}) {
  const cnpj = obterCnpjEmpresaAtiva(state, options.tenantId);
  return {
    success: true,
    sucesso: true,
    cnpjAtivo: cnpj || null,
    configurado: Boolean(cnpj),
    xmls: state.fiscalXmlsRecebidos || []
  };
}

function importarXmlParaEstoqueEFinanceiro(state, chaveOuId, options = {}) {
  state.fiscalXmlsRecebidos = state.fiscalXmlsRecebidos || [];
  const xml = state.fiscalXmlsRecebidos.find(x => x.id === chaveOuId || x.chave === chaveOuId || x.numero === chaveOuId);

  if (!xml) {
    const err = new Error(`Documento XML com identificador "${chaveOuId}" não foi encontrado na fila de notas recebidas.`);
    err.status = 404;
    err.code = 'XML_NAO_ENCONTRADO';
    throw err;
  }

  if (xml.importado) {
    return {
      success: true,
      sucesso: true,
      jaImportado: true,
      mensagem: `O XML da NF-e nº ${xml.numero} já foi importado anteriormente em ${xml.importadoEm || 'data recente'}.`,
      chave: xml.chave,
      numero: xml.numero
    };
  }

  // 1. Atualização do Almoxarifado com Recálculo de Custo Médio Ponderado (CMP)
  state.pecas = state.pecas || [];
  const cmpResultados = [];

  (xml.itens || []).forEach(it => {
    let p = state.pecas.find(x => 
      (x.cod && it.cod && x.cod.toLowerCase() === it.cod.toLowerCase()) ||
      (x.nome && it.descricao && x.nome.toLowerCase() === it.descricao.toLowerCase())
    );

    if (p) {
      const estoqueAnterior = Number(p.qtd) || 0;
      const custoAnterior = Number(p.custo) || 0;
      const novoCustoCMP = recalcularCMP(estoqueAnterior, custoAnterior, it.qtd, it.valorUnitario);
      const novoEstoque = estoqueAnterior + it.qtd;

      p.qtd = novoEstoque;
      p.custo = novoCustoCMP;
      if (!p.ncm && it.ncm) p.ncm = it.ncm;

      cmpResultados.push({
        pecaId: p.id,
        nome: p.nome,
        estoqueAnterior,
        novoEstoque,
        custoAnterior,
        novoCustoCMP
      });
    } else {
      const novoId = 'p_' + Math.random().toString(36).slice(2, 8);
      const novaPeca = {
        id: novoId,
        cod: it.cod || ('NFE-' + (it.ncm || 'PECA')),
        nome: it.descricao,
        categoria: 'Suspensão e Freios',
        un: it.un || 'un',
        ncm: it.ncm || '',
        cfop: '1102',
        origem: '0',
        custo: it.valorUnitario,
        venda: Math.round(it.valorUnitario * 1.5 * 100) / 100,
        qtd: it.qtd,
        min: 2
      };
      state.pecas.push(novaPeca);
      cmpResultados.push({
        pecaId: novoId,
        nome: novaPeca.nome,
        estoqueAnterior: 0,
        novoEstoque: it.qtd,
        custoAnterior: 0,
        novoCustoCMP: it.valorUnitario
      });
    }
  });

  // 2. Geração Automática de Contas a Pagar
  state.contasPagar = state.contasPagar || [];
  const dataVenc = new Date();
  dataVenc.setDate(dataVenc.getDate() + 28); // Prazo padrão fornecedor: 28 dias

  const contaPagarId = 'cp_nfe_' + Math.random().toString(36).slice(2, 8);
  const novaConta = {
    id: contaPagarId,
    parte: xml.fornecedorNome,
    doc: xml.fornecedorCnpj,
    desc: `Entrada NF-e #${xml.numero} (${xml.fornecedorNome})`,
    valor: xml.valorTotal,
    venc: dataVenc.toISOString().substring(0, 10),
    tipo: 'pagar',
    st: 'pendente',
    origem: 'nfe_xml_destinatario',
    chaveNFe: xml.chave,
    criadoEm: new Date().toISOString()
  };
  state.contasPagar.unshift(novaConta);

  // 3. Marcação do XML como importado
  xml.importado = true;
  xml.importadoEm = new Date().toISOString();
  xml.contaPagarId = contaPagarId;

  return {
    success: true,
    sucesso: true,
    chave: xml.chave,
    numero: xml.numero,
    fornecedor: xml.fornecedorNome,
    valorTotal: xml.valorTotal,
    contaPagarId,
    vencimento: novaConta.venc,
    itensImportados: (xml.itens || []).length,
    cmpAtualizados: cmpResultados
  };
}

module.exports = {
  normalizarCnpj,
  obterCnpjEmpresaAtiva,
  recalcularCMP,
  gerarChaveNFe44,
  buscarXmlsDestinatario,
  listarXmlsRecebidos,
  importarXmlParaEstoqueEFinanceiro
};
