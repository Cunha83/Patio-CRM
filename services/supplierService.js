'use strict';

const crypto = require('crypto');

/**
 * PÁTIO CRM — SERVIÇO DE GESTÃO DE FORNECEDORES E DESEMPENHO REAL
 * Responsável pelo cadastro, contatos, condições comerciais, histórico e prazo médio real.
 */

function gerarId(prefix) {
  return prefix + '_' + Date.now() + '_' + crypto.randomBytes(3).toString('hex');
}

function arredondar(valor, decimais = 2) {
  const n = Number(valor) || 0;
  return Number(Math.round(n + 'e' + decimais) + 'e-' + decimais);
}

function garantirColecoesFornecedores(state) {
  state.suppliers = Array.isArray(state.suppliers) ? state.suppliers : [];
  state.fornecedores = Array.isArray(state.fornecedores) ? state.fornecedores : [];
  state.auditoria = Array.isArray(state.auditoria) ? state.auditoria : [];
}

/**
 * Cadastra um novo fornecedor com dados comerciais e contatos
 */
function cadastrarFornecedor({ tenantId, state, supplierData = {}, actorId = 'sistema' }) {
  if (!tenantId || typeof tenantId !== 'string') {
    throw new Error('tenantId é obrigatório para cadastrar fornecedor.');
  }
  if (!state) {
    throw new Error('Estado do tenant é obrigatório.');
  }

  garantirColecoesFornecedores(state);

  const nome = String(supplierData.nome || supplierData.razaoSocial || '').trim();
  if (!nome) {
    throw new Error('Nome ou Razão Social do fornecedor é obrigatório.');
  }

  const id = supplierData.id || gerarId('forn');
  const documento = String(supplierData.documento || supplierData.cnpj || '').trim();

  // Se documento informado, valida se já não existe no mesmo tenant
  if (documento) {
    const duplicado = state.suppliers.find(
      s => s.tenantId === tenantId && s.documento && s.documento.replace(/\D/g, '') === documento.replace(/\D/g, '')
    );
    if (duplicado) {
      throw new Error('Já existe fornecedor cadastrado com este documento (' + documento + ') neste tenant.');
    }
  }

  const contatos = Array.isArray(supplierData.contatos)
    ? supplierData.contatos
    : (supplierData.fone || supplierData.telefone ? [{ nome: 'Principal', fone: supplierData.fone || supplierData.telefone, email: supplierData.email || '' }] : []);

  const novoFornecedor = {
    id,
    tenantId,
    nome,
    razaoSocial: supplierData.razaoSocial || nome,
    documento,
    cnpj: documento,
    contatos,
    cidade: supplierData.cidade || '',
    estado: supplierData.estado ? String(supplierData.estado).toUpperCase().slice(0, 2) : '',
    prazoMedioDias: Math.max(0, Number(supplierData.prazoMedioDias) || 1),
    marcasAtendidas: Array.isArray(supplierData.marcasAtendidas) ? supplierData.marcasAtendidas : [],
    categorias: Array.isArray(supplierData.categorias) ? supplierData.categorias : [],
    condicoesPagamento: supplierData.condicoesPagamento || 'A combinar',
    historicoCompras: [],
    ativo: supplierData.ativo !== false,
    observacoes: String(supplierData.observacoes || '').trim(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  state.suppliers.push(novoFornecedor);

  // Sincroniza fornecedores legado para manter compatibilidade com relatórios/antigo
  const idxLeg = state.fornecedores.findIndex(f => f.id === id);
  if (idxLeg === -1) {
    state.fornecedores.push({
      id,
      nome,
      cnpj: documento,
      fone: contatos[0]?.fone || '',
      email: contatos[0]?.email || '',
      prazo: novoFornecedor.prazoMedioDias
    });
  }

  state.auditoria.unshift({
    id: gerarId('aud'),
    tenantId,
    dataHora: new Date().toISOString(),
    usuario: actorId,
    intencao: 'fornecedor_cadastrado',
    resumo: 'Fornecedor "' + nome + '" cadastrado com sucesso.'
  });

  return {
    ok: true,
    supplier: novoFornecedor
  };
}

/**
 * Atualiza campos de cadastro de um fornecedor
 */
function atualizarFornecedor({ tenantId, state, supplierId, supplierData = {}, actorId = 'sistema' }) {
  garantirColecoesFornecedores(state);

  const sup = state.suppliers.find(s => s.id === supplierId && s.tenantId === tenantId);
  if (!sup) {
    throw new Error('Fornecedor não encontrado.');
  }

  if (supplierData.nome) sup.nome = String(supplierData.nome).trim();
  if (supplierData.razaoSocial) sup.razaoSocial = String(supplierData.razaoSocial).trim();
  if (supplierData.documento !== undefined) sup.documento = String(supplierData.documento).trim();
  if (supplierData.cidade !== undefined) sup.cidade = supplierData.cidade;
  if (supplierData.estado !== undefined) sup.estado = String(supplierData.estado).toUpperCase().slice(0, 2);
  if (supplierData.prazoMedioDias != null) sup.prazoMedioDias = Math.max(0, Number(supplierData.prazoMedioDias));
  if (supplierData.condicoesPagamento !== undefined) sup.condicoesPagamento = supplierData.condicoesPagamento;
  if (supplierData.observacoes !== undefined) sup.observacoes = supplierData.observacoes;
  if (supplierData.ativo !== undefined) sup.ativo = Boolean(supplierData.ativo);

  if (Array.isArray(supplierData.contatos)) sup.contatos = supplierData.contatos;
  if (Array.isArray(supplierData.marcasAtendidas)) sup.marcasAtendidas = supplierData.marcasAtendidas;
  if (Array.isArray(supplierData.categorias)) sup.categorias = supplierData.categorias;

  sup.updatedAt = new Date().toISOString();

  // Sincroniza com legado
  const leg = state.fornecedores.find(f => f.id === supplierId);
  if (leg) {
    leg.nome = sup.nome;
    leg.cnpj = sup.documento;
    leg.fone = sup.contatos[0]?.fone || leg.fone;
    leg.prazo = sup.prazoMedioDias;
  }

  return {
    ok: true,
    supplier: sup
  };
}

/**
 * Obtém fornecedor por ID
 */
function obterFornecedor({ tenantId, state, supplierId }) {
  garantirColecoesFornecedores(state);
  return state.suppliers.find(s => s.id === supplierId && s.tenantId === tenantId) || null;
}

/**
 * Lista fornecedores com filtro opcional
 */
function listarFornecedores({ tenantId, state, query = '', ativoApenas = false }) {
  garantirColecoesFornecedores(state);

  const q = String(query || '').toLowerCase().trim();
  return state.suppliers
    .filter(s => s.tenantId === tenantId)
    .filter(s => (ativoApenas ? s.ativo : true))
    .filter(s => {
      if (!q) return true;
      const matchNome = (s.nome || '').toLowerCase().includes(q);
      const matchDoc = (s.documento || '').replace(/\D/g, '').includes(q.replace(/\D/g, ''));
      const matchCidade = (s.cidade || '').toLowerCase().includes(q);
      return matchNome || matchDoc || matchCidade;
    });
}

/**
 * Registra compra concluída no histórico para calibrar o prazo médio real e confiabilidade
 */
function registrarHistoricoCompra({
  tenantId,
  state,
  supplierId,
  orderId,
  valor,
  diasPrometidos = 1,
  diasRealizados = 1,
  itens = []
}) {
  garantirColecoesFornecedores(state);

  const sup = state.suppliers.find(s => s.id === supplierId && s.tenantId === tenantId);
  if (!sup) return null;

  sup.historicoCompras = Array.isArray(sup.historicoCompras) ? sup.historicoCompras : [];

  const pontual = Number(diasRealizados) <= Number(diasPrometidos);
  const entradaHistorico = {
    orderId,
    data: new Date().toISOString(),
    valor: arredondar(valor),
    diasPrometidos: Number(diasPrometidos),
    diasRealizados: Number(diasRealizados),
    pontual,
    itens: Array.isArray(itens) ? itens.map(i => ({ partId: i.partId, valorUnitario: i.valorUnitario, qtd: i.quantidade })) : []
  };

  sup.historicoCompras.push(entradaHistorico);

  // Recalcula o prazo médio real ponderado pelo histórico realizado
  const totalDias = sup.historicoCompras.reduce((acc, h) => acc + (Number(h.diasRealizados) || 0), 0);
  sup.prazoMedioDias = arredondar(totalDias / sup.historicoCompras.length, 1);
  sup.updatedAt = new Date().toISOString();

  return entradaHistorico;
}

/**
 * Calcula métricas de desempenho e confiabilidade do fornecedor
 */
function calcularDesempenhoFornecedor({ tenantId, state, supplierId }) {
  garantirColecoesFornecedores(state);

  const sup = state.suppliers.find(s => s.id === supplierId && s.tenantId === tenantId);
  if (!sup) return null;

  const hist = Array.isArray(sup.historicoCompras) ? sup.historicoCompras : [];
  if (hist.length === 0) {
    return {
      totalCompras: 0,
      valorTotalComprado: 0,
      prazoMedioRealDias: sup.prazoMedioDias || 1,
      taxaPontualidadePercentual: null, // Sem dados suficientes
      historicoPrecosPorPeca: {}
    };
  }

  const valorTotal = hist.reduce((acc, h) => acc + (Number(h.valor) || 0), 0);
  const pontuais = hist.filter(h => h.pontual).length;
  const taxaPontualidade = arredondar((pontuais / hist.length) * 100, 1);

  // Mapeia histórico de preços praticados por peça
  const historicoPrecos = {};
  for (const h of hist) {
    if (Array.isArray(h.itens)) {
      for (const it of h.itens) {
        if (!it.partId) continue;
        if (!historicoPrecos[it.partId]) {
          historicoPrecos[it.partId] = [];
        }
        historicoPrecos[it.partId].push({
          data: h.data,
          valorUnitario: it.valorUnitario,
          orderId: h.orderId
        });
      }
    }
  }

  return {
    totalCompras: hist.length,
    valorTotalComprado: arredondar(valorTotal),
    prazoMedioRealDias: sup.prazoMedioDias,
    taxaPontualidadePercentual: taxaPontualidade,
    historicoPrecosPorPeca: historicoPrecos
  };
}

module.exports = {
  garantirColecoesFornecedores,
  cadastrarFornecedor,
  atualizarFornecedor,
  obterFornecedor,
  listarFornecedores,
  registrarHistoricoCompra,
  calcularDesempenhoFornecedor
};
