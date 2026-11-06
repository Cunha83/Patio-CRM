'use strict';

const SCHEMA_VERSION = '1.0.0';

function limpaDoc(doc) {
  if (!doc) return null;
  return String(doc).replace(/\D/g, '');
}

function filtrarPorData(itens = [], campoData = 'createdAt', desde = null) {
  if (!desde) return itens;
  const tsDesde = new Date(desde).getTime();
  if (isNaN(tsDesde)) return itens;
  return itens.filter(item => {
    const val = item[campoData] || item.atualizadoEm || item.criadoEm || item.abertura || item.data;
    if (!val) return true;
    return new Date(val).getTime() >= tsDesde;
  });
}

function aplicarPaginacao(itens = [], limit = 50, cursor = null) {
  const lim = Math.max(1, Math.min(Number(limit) || 50, 200));
  let startIndex = 0;
  if (cursor) {
    const foundIdx = itens.findIndex(i => String(i.id) === String(cursor));
    if (foundIdx !== -1) startIndex = foundIdx + 1;
  }
  const paginados = itens.slice(startIndex, startIndex + lim);
  const nextCursor = paginados.length === lim && startIndex + lim < itens.length
    ? paginados[paginados.length - 1].id
    : null;

  return { items: paginados, count: paginados.length, total: itens.length, nextCursor };
}

function exportarClientes({ state, desde = null, limit = 50, cursor = null }) {
  const raw = filtrarPorData(state?.clientes || [], 'atualizadoEm', desde);
  const canonicos = raw.map(c => {
    const docLimpo = limpaDoc(c.doc || c.documento);
    return {
      id: c.id,
      erpSyncId: `cli_${c.id}`,
      schemaVersion: SCHEMA_VERSION,
      razaoSocial: c.nome,
      nomeFantasia: c.nomeFantasia || c.nome,
      tipoPessoa: docLimpo && docLimpo.length === 11 ? 'F' : 'J',
      cpfCnpj: docLimpo,
      inscricaoEstadual: c.ie || null,
      telefone: limpaDoc(c.fone),
      email: c.email || null,
      endereco: c.endereco || null,
      cidade: c.cidade || null,
      uf: c.uf || null,
      cep: limpaDoc(c.cep),
      ativo: !c.inativo && !c.anonimizado,
      atualizadoEm: c.atualizadoEm || c.criadoEm || new Date().toISOString()
    };
  });
  return aplicarPaginacao(canonicos, limit, cursor);
}

function exportarFornecedores({ state, desde = null, limit = 50, cursor = null }) {
  const raw = filtrarPorData(state?.suppliers || state?.fornecedores || [], 'updatedAt', desde);
  const canonicos = raw.map(f => ({
    id: f.id,
    erpSyncId: `forn_${f.id}`,
    schemaVersion: SCHEMA_VERSION,
    razaoSocial: f.name || f.nome,
    nomeFantasia: f.tradeName || f.nomeFantasia || f.name || f.nome,
    cnpj: limpaDoc(f.document || f.cnpj),
    inscricaoEstadual: f.stateRegistration || f.ie || null,
    telefone: limpaDoc(f.phone || f.fone),
    email: f.email || null,
    cidade: f.city || f.cidade || null,
    uf: f.state || f.uf || null,
    atualizadoEm: f.updatedAt || f.createdAt || new Date().toISOString()
  }));
  return aplicarPaginacao(canonicos, limit, cursor);
}

function exportarPecas({ state, desde = null, limit = 50, cursor = null }) {
  const raw = filtrarPorData(state?.pecas || [], 'updatedAt', desde);
  const canonicos = raw.map(p => ({
    id: p.id,
    erpSyncId: `pec_${p.id}`,
    schemaVersion: SCHEMA_VERSION,
    codigo: p.codigo || p.cod || p.id,
    codigoInterno: p.codigo || p.cod || p.id,
    sku: p.sku || p.codigo || p.id,
    descricao: p.nome,
    categoria: p.categoria || 'Geral',
    ncm: p.ncm || '8708.29.99',
    unidadeMedida: p.un || 'UN',
    precoCustoMedio: Number(p.custoMedio || p.custo || 0),
    custoMedio: Number(p.custoMedio || p.custo || 0),
    precoVendaSugerido: Number(p.preco || p.precoVenda || p.valor || 0),
    precoVenda: Number(p.preco || p.precoVenda || p.valor || 0),
    estoqueAtual: Number(p.estoque || p.qtd || 0),
    estoqueMinimo: Number(p.estoqueMin || 0),
    localizacao: p.localizacao || p.prateleira || null,
    atualizadoEm: p.updatedAt || new Date().toISOString()
  }));
  return aplicarPaginacao(canonicos, limit, cursor);
}

function exportarOrdensServico({ state, desde = null, status = 'finalizada', limit = 50, cursor = null }) {
  let list = state?.os || [];
  if (status && status !== 'todas') {
    list = list.filter(o => o.st === status);
  }
  const raw = filtrarPorData(list, 'fechamento', desde);
  const veiculos = new Map((state?.veiculos || []).map(v => [v.id, v]));

  const canonicos = raw.map(o => {
    const vei = veiculos.get(o.vei) || {};
    const totServ = (o.servicos || []).reduce((acc, s) => acc + ((Number(s.qtd) || 1) * (Number(s.valor || s.preco) || 0)), 0);
    const totPec = (o.pecas || []).reduce((acc, p) => acc + ((Number(p.qtd) || 1) * (Number(p.valor || p.preco) || 0)), 0);

    return {
      id: o.id,
      erpSyncId: `os_${o.id}`,
      schemaVersion: SCHEMA_VERSION,
      numeroOS: o.num,
      clienteId: o.cli,
      veiculo: {
        id: o.vei,
        placa: vei.placa || o.placa || 'N/I',
        modelo: vei.modelo || null,
        kmEntrada: o.km || vei.km || null
      },
      status: o.st,
      dataAbertura: o.abertura,
      dataFechamento: o.fechamento || null,
      totalServicos: totServ,
      totalPecas: totPec,
      totalGeral: o.total || (totServ + totPec),
      formaPagamentoSugerida: o.formaPagamento || 'faturado_boleto',
      itensServico: (o.servicos || []).map(s => ({
        id: s.id,
        nome: s.nome,
        quantidade: Number(s.qtd) || 1,
        valorUnitario: Number(s.valor || s.preco) || 0,
        subtotal: (Number(s.qtd) || 1) * (Number(s.valor || s.preco) || 0)
      })),
      itensPeca: (o.pecas || []).map(p => ({
        id: p.id,
        nome: p.nome,
        codigo: p.cod || null,
        quantidade: Number(p.qtd) || 1,
        valorUnitario: Number(p.valor || p.preco) || 0,
        subtotal: (Number(p.qtd) || 1) * (Number(p.valor || p.preco) || 0)
      }))
    };
  });
  return aplicarPaginacao(canonicos, limit, cursor);
}

function exportarContas({ state, desde = null, tipo = null, limit = 50, cursor = null }) {
  let list = state?.contas || [];
  if (tipo) {
    list = list.filter(c => c.tipo === tipo);
  }
  const raw = filtrarPorData(list, 'data', desde);
  const canonicos = raw.map(c => ({
    id: c.id,
    erpSyncId: `cta_${c.id}`,
    schemaVersion: SCHEMA_VERSION,
    tipo: c.tipo || 'pagar',
    natureza: (c.tipo === 'receber') ? 'RECEITA' : 'DESPESA',
    regime: 'CAIXA_GERENCIAL',
    descricao: c.desc || c.descricao || 'Título Financeiro',
    favorecidoOuPagador: c.favorecido || c.pagador || 'N/I',
    categoria: c.cat || 'Geral',
    valor: Number(c.valor || 0),
    dataEmissao: c.data || new Date().toISOString().slice(0, 10),
    dataVencimento: c.vencimento || c.data,
    dataLiquidacao: c.liquidacao || c.pagamento || null,
    status: c.status || c.st || (c.liquidacao || c.pagamento ? 'liquidado' : 'aberto'),
    documentoOrigem: c.osNum ? `OS #${c.osNum}` : (c.pedidoNum ? `Pedido #${c.pedidoNum}` : null)
  }));
  return aplicarPaginacao(canonicos, limit, cursor);
}

function exportarPedidosCompra({ state, desde = null, limit = 50, cursor = null }) {
  const list = state?.purchaseOrders || [];
  const raw = filtrarPorData(list, 'createdAt', desde);
  const canonicos = raw.map(po => ({
    id: po.id,
    erpSyncId: `ped_${po.id}`,
    schemaVersion: SCHEMA_VERSION,
    numeroPedido: po.orderNumber || po.id,
    fornecedorId: po.supplierId,
    status: po.status,
    valorTotal: Number(po.totalAmount || 0),
    chaveNfeEntrada: po.nfeKey || null,
    dataPedido: po.createdAt,
    dataRecebimento: po.receivedAt || null,
    itens: (po.items || []).map(i => ({
      partId: i.partId,
      descricao: i.name,
      quantidade: Number(i.quantity) || 1,
      precoUnitario: Number(i.unitCost || i.unitPrice) || 0,
      subtotal: (Number(i.quantity) || 1) * (Number(i.unitCost || i.unitPrice) || 0)
    }))
  }));
  return aplicarPaginacao(canonicos, limit, cursor);
}

module.exports = {
  SCHEMA_VERSION,
  limpaDoc,
  filtrarPorData,
  aplicarPaginacao,
  exportarClientes,
  exportarFornecedores,
  exportarPecas,
  exportarOrdensServico,
  exportarContas,
  exportarPedidosCompra
};

