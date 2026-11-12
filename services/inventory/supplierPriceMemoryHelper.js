'use strict';

/**
 * services/inventory/supplierPriceMemoryHelper.js
 *
 * Motor de Memória de Fornecedores e Auditoria de Preços das Últimas Compras:
 * - Consulta de histórico de fornecedores e últimos custos de compra
 * - Regra de validação de no mínimo 3 fornecedores com pergunta WhatsApp
 * - Auditoria comparativa de propostas contra compras anteriores
 *
 * Teto Modular: <= 220 linhas
 */

function round2(v) {
  return +(Math.round(Number(v || 0) + 'e+2') + 'e-2');
}

function normalizarNome(nome = '') {
  return String(nome || '').toLowerCase().trim().replace(/[^a-z0-9]/g, '');
}

function consultarMemoriaFornecedoresEPrecosItem(state, itemRef = {}) {
  if (!state) throw new Error('Estado da aplicação não informado');
  const pecaId = itemRef.pecaId || itemRef.id;
  const codigo = itemRef.codigo || '';
  const desc = itemRef.descricao || itemRef.nome || '';

  const estoque = Array.isArray(state.estoque) ? state.estoque : (Array.isArray(state.pecas) ? state.pecas : []);
  const peca = estoque.find(p => (pecaId && p.id === pecaId) || (codigo && p.codigo === codigo)) || {};

  const custoMedioCMPAtual = round2(peca.custoMedio ?? peca.custo ?? 0);
  let ultimoCustoCompraGeral = round2(peca.ultimoCustoCompra || 0);

  const purchaseOrders = Array.isArray(state.purchaseOrders) ? state.purchaseOrders : [];
  const fornecedoresMap = new Map();

  // 1. Varre histórico de Pedidos de Compra anteriores (mais recentes primeiro)
  const posOrdenados = [...purchaseOrders].sort((a, b) => new Date(b.criadoEm || 0) - new Date(a.criadoEm || 0));

  for (const po of posOrdenados) {
    for (const it of (po.itens || [])) {
      const match = (pecaId && it.pecaId === pecaId) ||
                    (codigo && it.codigo && it.codigo === codigo) ||
                    (desc && it.descricao && new RegExp(desc, 'i').test(it.descricao));

      if (match) {
        if (!ultimoCustoCompraGeral && it.custoUnitario) {
          ultimoCustoCompraGeral = round2(it.custoUnitario);
        }
        const nomeForn = po.fornecedorNome || 'Fornecedor';
        const key = normalizarNome(nomeForn);
        if (!fornecedoresMap.has(key)) {
          fornecedoresMap.set(key, {
            fornecedorNome: nomeForn,
            fornecedorDocumento: po.fornecedorDocumento || '',
            telefoneFornecedor: po.telefoneFornecedor || '',
            ultimoPrecoPraticado: round2(it.custoUnitario || 0),
            dataUltimaCompra: po.criadoEm || null,
            pedidoOrigemId: po.id
          });
        }
      }
    }
  }

  // Se não comprou ainda em POs, assume o CMP como referência de última compra
  if (!ultimoCustoCompraGeral) {
    ultimoCustoCompraGeral = custoMedioCMPAtual;
  }

  // 2. Consulta fornecedores cadastrados na base geral de fornecedores
  const suppliers = Array.isArray(state.suppliers) ? state.suppliers : [];
  for (const s of suppliers) {
    const key = normalizarNome(s.nome);
    if (!fornecedoresMap.has(key)) {
      const matchPeca = (s.pecasIds || []).includes(pecaId) || (s.categorias || []).includes(peca.categoria);
      if (matchPeca) {
        fornecedoresMap.set(key, {
          fornecedorId: s.id,
          fornecedorNome: s.nome,
          fornecedorDocumento: s.documento || '',
          telefoneFornecedor: s.telefone || '',
          ultimoPrecoPraticado: 0,
          dataUltimaCompra: null
        });
      }
    }
  }

  return {
    pecaId: peca.id || pecaId,
    codigo: peca.codigo || codigo,
    descricao: peca.descricao || desc,
    ultimoCustoCompraGeral,
    custoMedioCMPAtual,
    fornecedoresHistoricos: Array.from(fornecedoresMap.values())
  };
}

function selecionarFornecedoresMinimoTresOuPerguntar(state, options = {}) {
  const itens = Array.isArray(options.itens) ? options.itens : [];
  const manuais = Array.isArray(options.fornecedoresConvidadosManuais) ? options.fornecedoresConvidadosManuais : [];
  const minimo = Number(options.minimoFornecedores ?? 3);
  const forcar = Boolean(options.forcarDisparoComMenosDeTres);

  const memoriaItens = [];
  const fornecedoresMap = new Map();

  for (const it of itens) {
    const mem = consultarMemoriaFornecedoresEPrecosItem(state, it);
    memoriaItens.push({ ...mem, quantidade: Number(it.quantidade || 1) });
    for (const f of mem.fornecedoresHistoricos) {
      const key = normalizarNome(f.fornecedorNome);
      if (!fornecedoresMap.has(key)) fornecedoresMap.set(key, f);
    }
  }

  for (const m of manuais) {
    const nome = typeof m === 'string' ? m : m.nome || m.fornecedorNome;
    const key = normalizarNome(nome);
    if (!fornecedoresMap.has(key)) {
      fornecedoresMap.set(key, {
        fornecedorNome: nome,
        telefoneFornecedor: m.telefone || m.telefoneFornecedor || '',
        origem: 'manual'
      });
    }
  }

  const selecionados = Array.from(fornecedoresMap.values());
  const atingeMinimo = selecionados.length >= minimo || forcar;
  const faltam = Math.max(0, minimo - selecionados.length);

  let perguntaWhatsApp = null;
  if (!atingeMinimo) {
    const nomesConhecidos = selecionados.map(s => s.fornecedorNome).join(', ') || 'Nenhum';
    const descItens = memoriaItens.map(m => m.descricao).join(', ') || 'peças pesadas';
    perguntaWhatsApp = `⚠️ *Atenção Compras:* Para cotar *${descItens}*, temos apenas ${selecionados.length} fornecedor(es) no histórico (${nomesConhecidos}).\n` +
      `Faltam ${faltam} fornecedores para cumprir a regra de no mínimo ${minimo} cotações.\n` +
      `Por favor, responda com o *Nome e WhatsApp* de ${faltam} novo(s) fornecedor(es) para prosseguirmos!`;
  }

  return {
    atingeMinimoTres: atingeMinimo,
    statusSelecao: atingeMinimo ? 'aguardando_propostas' : 'aguardando_indicacao_fornecedores',
    fornecedoresSelecionados: selecionados,
    faltamFornecedoresCount: faltam,
    memoriaItens,
    perguntaWhatsAppFornecedorFaltante: perguntaWhatsApp
  };
}

function compararPropostaComHistoricoCompras(proposta = {}, memoriaItens = []) {
  let somaReferencia = 0;
  for (const mem of memoriaItens) {
    const precoRef = mem.ultimoCustoCompraGeral || mem.custoMedioCMPAtual || 0;
    somaReferencia = round2(somaReferencia + (precoRef * (mem.quantidade || 1)));
  }

  const valorTotal = round2(proposta.valorTotalOfertado || proposta.valorTotalProposta || 0);
  if (somaReferencia === 0) {
    somaReferencia = valorTotal; // Fallback se não há referência
  }

  const diferenca = round2(valorTotal - somaReferencia);
  const variacaoPercentual = somaReferencia > 0 ? round2(((valorTotal - somaReferencia) / somaReferencia) * 100) : 0;

  let statusComparativo = 'sem_historico_anterior';
  if (somaReferencia > 0) {
    if (variacaoPercentual < -0.5) {
      statusComparativo = 'economia_abaixo_ultima_compra';
    } else if (variacaoPercentual <= 5.0) {
      statusComparativo = 'estavel_compativel_historico';
    } else {
      statusComparativo = 'alerta_aumento_acima_historico';
    }
  }

  return {
    somaUltimaCompraReferencia: somaReferencia,
    diferencaValorVsUltimaCompra: diferenca,
    variacaoPercentualVsUltimaCompra: variacaoPercentual,
    statusComparativoHistorico: statusComparativo
  };
}

module.exports = {
  consultarMemoriaFornecedoresEPrecosItem,
  selecionarFornecedoresMinimoTresOuPerguntar,
  compararPropostaComHistoricoCompras
};
