'use strict';

/**
 * services/whatsapp/whatsappSupplierQuotationSkill.js
 *
 * Skill de Compras & Cotação B2B com Fornecedores via WhatsApp:
 * - Abertura de cotação com regra de no mínimo 3 fornecedores
 * - Pergunta interativa quando faltam fornecedores na memória
 * - Auditoria de propostas comparadas ao preço das últimas compras
 * - Mapa Comparativo Ponderado (Modo Urgência de Box vs Modo Econômico)
 * - Conversão automática em Pedido de Compra e destravamento de box
 *
 * Teto Modular: <= 265 linhas
 */

const crypto = require('crypto');
const {
  selecionarFornecedoresMinimoTresOuPerguntar,
  compararPropostaComHistoricoCompras
} = require('../inventory/supplierPriceMemoryHelper');
const { criarPedidoCompraPecas } = require('../inventory/heavyPartsPurchaseOrderService');

function gerarId(prefix) {
  return prefix + '_' + Date.now() + '_' + crypto.randomBytes(3).toString('hex');
}

function round2(v) {
  return +(Math.round(Number(v || 0) + 'e+2') + 'e-2');
}

function abrirCotacaoFornecedoresWhatsApp(state, payload = {}) {
  if (!state) throw new Error('Estado da aplicação não informado');
  state.supplierQuotations = Array.isArray(state.supplierQuotations) ? state.supplierQuotations : [];
  state.whatsappAgentLogs = Array.isArray(state.whatsappAgentLogs) ? state.whatsappAgentLogs : [];

  let itens = Array.isArray(payload.itens) ? [...payload.itens] : [];
  if (itens.length === 0 && payload.preOrcamentoId) {
    const pre = (state.whatsappPreQuotations || []).find(q => q.id === payload.preOrcamentoId);
    if (pre && Array.isArray(pre.itensPecas)) {
      itens = pre.itensPecas.filter(p => p.statusEstoqueItem === 'encomenda_necessaria' || !p.disponivelProntaEntrega);
      if (itens.length === 0) itens = pre.itensPecas;
    }
  }
  if (itens.length === 0) {
    const err = new Error('A cotação de compras requer ao menos um item.');
    err.code = 'QUOTATION_ITEMS_REQUIRED';
    err.status = 400;
    throw err;
  }

  const selecao = selecionarFornecedoresMinimoTresOuPerguntar(state, {
    itens,
    fornecedoresConvidadosManuais: payload.fornecedoresConvidados,
    minimoFornecedores: payload.minimoFornecedores ?? 3,
    forcarDisparoComMenosDeTres: payload.forcarDisparoComMenosDeTres
  });

  const timestamp = payload.timestamp || new Date().toISOString();
  const cotacao = {
    id: gerarId('cot'),
    tenantId: state.tenantId || 'default',
    tituloCotacao: payload.tituloCotacao || 'Cotação de Peças Pesadas',
    osVinculadaId: payload.osVinculadaId || null,
    gargaloVinculadoId: payload.gargaloVinculadoId || null,
    preOrcamentoId: payload.preOrcamentoId || null,
    prioridadeUrgenciaBox: Boolean(payload.prioridadeUrgenciaBox || payload.gargaloVinculadoId),
    itens,
    minimoFornecedores: payload.minimoFornecedores ?? 3,
    status: selecao.atingeMinimoTres ? 'aguardando_propostas' : 'aguardando_indicacao_fornecedores',
    faltamFornecedoresCount: selecao.faltamFornecedoresCount,
    perguntaFornecedorFaltante: selecao.perguntaWhatsAppFornecedorFaltante,
    fornecedoresConvidados: selecao.fornecedoresSelecionados,
    memoriaItens: selecao.memoriaItens,
    propostas: [],
    criadoEm: timestamp,
    responsavel: payload.responsavel || 'Comprador-IA-WhatsApp'
  };

  state.supplierQuotations.unshift(cotacao);
  state.whatsappAgentLogs.push({
    id: gerarId('wpp_log'), skill: 'SKILL_COMPRAS_FORNECEDORES', cotacaoId: cotacao.id, status: cotacao.status, fornecedoresConvidadosCount: cotacao.fornecedoresConvidados.length, timestamp
  });
  return cotacao;
}

function complementarFornecedoresCotacaoWhatsApp(state, cotacaoId, options = {}) {
  const cotacao = (state.supplierQuotations || []).find(c => c.id === cotacaoId);
  if (!cotacao) {
    const err = new Error(`Cotação #${cotacaoId} não encontrada.`);
    err.code = 'QUOTATION_NOT_FOUND';
    err.status = 404;
    throw err;
  }

  state.suppliers = Array.isArray(state.suppliers) ? state.suppliers : [];
  const novos = Array.isArray(options.novosFornecedores) ? options.novosFornecedores : [];

  for (const n of novos) {
    const nome = n.nome || n.fornecedorNome;
    if (!nome) continue;
    const sExistente = state.suppliers.find(s => s.nome.toLowerCase() === nome.toLowerCase());
    if (!sExistente) {
      state.suppliers.push({
        id: gerarId('forn'),
        nome,
        telefone: n.telefone || '',
        criadoEm: new Date().toISOString()
      });
    }
    const jaConvidado = cotacao.fornecedoresConvidados.some(c => c.fornecedorNome.toLowerCase() === nome.toLowerCase());
    if (!jaConvidado) {
      cotacao.fornecedoresConvidados.push({ fornecedorNome: nome, telefoneFornecedor: n.telefone || '', origem: 'complementacao_whatsapp' });
    }
  }

  const minimo = cotacao.minimoFornecedores || 3;
  if (cotacao.fornecedoresConvidados.length >= minimo) {
    cotacao.status = 'aguardando_propostas';
    cotacao.faltamFornecedoresCount = 0;
    cotacao.perguntaFornecedorFaltante = null;
    state.whatsappAgentLogs.push({
      id: gerarId('wpp_log'), skill: 'SKILL_COMPRAS_FORNECEDORES', acao: 'disparo_convites_cotacao_whatsapp', cotacaoId: cotacao.id, fornecedoresTotal: cotacao.fornecedoresConvidados.length, timestamp: new Date().toISOString()
    });
  } else {
    cotacao.faltamFornecedoresCount = minimo - cotacao.fornecedoresConvidados.length;
  }
  return { ok: true, cotacao };
}

function registrarPropostaFornecedorWhatsApp(state, cotacaoId, payload = {}) {
  const cotacao = (state.supplierQuotations || []).find(c => c.id === cotacaoId);
  if (!cotacao) throw new Error(`Cotação #${cotacaoId} não encontrada.`);

  const valorTotalProposta = round2(payload.valorTotalOfertado || payload.valorTotal || 0);
  const analiseHistorico = compararPropostaComHistoricoCompras({ valorTotalProposta }, cotacao.memoriaItens || []);

  const proposta = {
    id: gerarId('prop'),
    fornecedorId: payload.fornecedorId || null,
    fornecedorNome: payload.fornecedorNome || 'Fornecedor',
    fornecedorDocumento: payload.fornecedorDocumento || '',
    telefoneFornecedor: payload.telefoneFornecedor || '',
    valorTotalProposta,
    prazoEntregaHoras: Number(payload.prazoEntregaHoras || 24),
    prazoMedioDias: Number(payload.prazoMedioDias || 30),
    condicaoPagamentoParcelas: Number(payload.condicaoPagamentoParcelas || 1),
    analiseHistoricoCompras: analiseHistorico,
    mensagemRespostaWhatsApp: payload.mensagemRespostaWhatsApp || '',
    criadoEm: payload.timestamp || new Date().toISOString()
  };

  cotacao.propostas = Array.isArray(cotacao.propostas) ? cotacao.propostas : [];
  cotacao.propostas.push(proposta);
  cotacao.status = 'em_analise_comparativa';

  return { ok: true, proposta, cotacao };
}

function apurarMapaComparativoCotacao(state, cotacaoId, options = {}) {
  const cotacao = (state.supplierQuotations || []).find(c => c.id === cotacaoId);
  if (!cotacao) throw new Error(`Cotação #${cotacaoId} não encontrada.`);

  const propostas = cotacao.propostas || [];
  if (propostas.length === 0) {
    return { cotacaoId, modoUrgenciaAtivo: false, propostaRecomendada: null, rankingPropostas: [] };
  }

  const modoUrgencia = options.prioridadeUrgenciaBoxOverride !== undefined
    ? Boolean(options.prioridadeUrgenciaBoxOverride)
    : Boolean(cotacao.prioridadeUrgenciaBox || cotacao.gargaloVinculadoId);

  const menorPreco = Math.min(...propostas.map(p => p.valorTotalProposta));
  const maiorPreco = Math.max(...propostas.map(p => p.valorTotalProposta));
  const menorPrazo = Math.min(...propostas.map(p => p.prazoEntregaHoras));

  const ranking = propostas.map(p => {
    let scorePreco = menorPreco > 0 ? (menorPreco / p.valorTotalProposta) * 100 : 100;
    const bonusHistorico = p.analiseHistoricoCompras?.statusComparativoHistorico === 'economia_abaixo_ultima_compra' ? 10 : (p.analiseHistoricoCompras?.statusComparativoHistorico === 'alerta_aumento_acima_historico' ? -10 : 0);
    scorePreco = Math.max(0, scorePreco + bonusHistorico);

    const scorePrazo = menorPrazo > 0 ? (menorPrazo / p.prazoEntregaHoras) * 100 : 100;
    const scoreCondicao = Math.min(100, (p.prazoMedioDias / 30) * 100);
    const scoreFinal = modoUrgencia
      ? round2((scorePrazo * 0.55) + (scorePreco * 0.35) + (scoreCondicao * 0.10))
      : round2((scorePreco * 0.65) + (scorePrazo * 0.20) + (scoreCondicao * 0.15));

    return { ...p, scorePreco: round2(scorePreco), scorePrazo: round2(scorePrazo), scoreCondicao: round2(scoreCondicao), scoreFinal };
  });

  ranking.sort((a, b) => b.scoreFinal - a.scoreFinal);

  return {
    cotacaoId,
    modoUrgenciaAtivo: modoUrgencia,
    propostaRecomendada: ranking[0],
    rankingPropostas: ranking,
    economiaGeradaVsMaiorProposta: round2(maiorPreco - menorPreco)
  };
}

function aprovarPropostaEGerarPedidoCompra(state, cotacaoId, options = {}) {
  const cotacao = (state.supplierQuotations || []).find(c => c.id === cotacaoId);
  if (!cotacao) throw new Error(`Cotação #${cotacaoId} não encontrada.`);

  if (cotacao.status === 'aprovada_pedido_gerado') {
    const err = new Error(`Cotação #${cotacaoId} já foi aprovada anteriormente.`);
    err.code = 'QUOTATION_ALREADY_APPROVED';
    err.status = 409;
    throw err;
  }

  const mapa = apurarMapaComparativoCotacao(state, cotacaoId);
  const vencedora = options.propostaId
    ? (cotacao.propostas || []).find(p => p.id === options.propostaId)
    : mapa.propostaRecomendada;

  if (!vencedora) throw new Error('Nenhuma proposta válida para aprovação.');

  const itensPO = (cotacao.itens || []).map(it => ({
    pecaId: it.pecaId || it.id,
    codigo: it.codigo || '',
    descricao: it.descricao || 'Peça pesada',
    quantidade: Number(it.quantidade || 1),
    custoUnitario: round2(vencedora.valorTotalProposta / Math.max(1, (cotacao.itens || []).length))
  }));

  const resPO = criarPedidoCompraPecas(state, {
    tenantId: cotacao.tenantId,
    fornecedorNome: vencedora.fornecedorNome,
    fornecedorDocumento: vencedora.fornecedorDocumento,
    osVinculadaId: cotacao.osVinculadaId,
    gargaloVinculadoId: cotacao.gargaloVinculadoId,
    itens: itensPO,
    condicaoPagamentoParcelas: vencedora.condicaoPagamentoParcelas || 1,
    primeiroVencimento: options.primeiroVencimento,
    timestamp: options.timestamp,
    responsavel: options.responsavel || 'Gerência-Suprimentos'
  });

  cotacao.status = 'aprovada_pedido_gerado';
  cotacao.pedidoCompraId = resPO.pedido.id;
  cotacao.fornecedorVencedorNome = vencedora.fornecedorNome;

  return { ok: true, cotacao, pedidoCompra: resPO.pedido };
}

function executarSkillComprasFornecedoresWhatsApp(state, payload = {}) {
  const msg = String(payload.mensagem || '').toLowerCase();
  if (/cotar|cota[cç][aã]o fornecedor|comprar pe[cç]a/i.test(msg)) {
    const c = abrirCotacaoFornecedoresWhatsApp(state, payload);
    return { ok: true, skill: 'SKILL_COMPRAS_FORNECEDORES', cotacao: c };
  }
  return { ok: true, skill: 'SKILL_COMPRAS_FORNECEDORES' };
}

module.exports = {
  abrirCotacaoFornecedoresWhatsApp,
  complementarFornecedoresCotacaoWhatsApp,
  registrarPropostaFornecedorWhatsApp,
  apurarMapaComparativoCotacao,
  aprovarPropostaEGerarPedidoCompra,
  executarSkillComprasFornecedoresWhatsApp
};
