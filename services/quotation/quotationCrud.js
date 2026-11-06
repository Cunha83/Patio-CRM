'use strict';

const crypto = require('crypto');

function gerarId(prefix = 'orc') {
  return `${prefix}_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
}

function arredondar(valor) {
  return Math.round((Number(valor) || 0) * 100) / 100;
}

function registrarAuditoria(state, entrada) {
  if (!state.auditoria) state.auditoria = [];
  state.auditoria.unshift({
    id: gerarId('aud'),
    timestamp: new Date().toISOString(),
    ...entrada
  });
  if (state.auditoria.length > 500) {
    state.auditoria = state.auditoria.slice(0, 500);
  }
}

/**
 * Calcula subtotais e totais de um orçamento de forma determinística
 */
function calcularTotais(itens = [], descontoGeral = 0) {
  let subtotalServicos = 0;
  let subtotalPecas = 0;
  let totalAprovado = 0;

  for (const item of itens) {
    const unit = arredondar(item.valorUnitario || item.preco || 0);
    const qtd = Math.max(1, Number(item.quantidade) || 1);
    const totalItem = arredondar(unit * qtd);
    item.valorUnitario = unit;
    item.quantidade = qtd;
    item.valorTotal = totalItem;

    if (item.tipo === 'peca') {
      subtotalPecas += totalItem;
    } else {
      subtotalServicos += totalItem;
    }

    if (item.status === 'aprovado') {
      totalAprovado += totalItem;
    }
  }

  subtotalServicos = arredondar(subtotalServicos);
  subtotalPecas = arredondar(subtotalPecas);
  const desc = arredondar(Math.max(0, Number(descontoGeral) || 0));
  const totalGeral = arredondar(Math.max(0, subtotalServicos + subtotalPecas - desc));
  totalAprovado = arredondar(totalAprovado);

  return {
    subtotalServicos,
    subtotalPecas,
    descontoGeral: desc,
    totalGeral,
    totalAprovado
  };
}

/**
 * Cria um novo orçamento comercial vinculado a uma OS (e opcionalmente a uma Inspeção)
 */
function criarOrcamento({
  tenantId,
  state,
  osId,
  inspectionId = null,
  items = [],
  descontoGeral = 0,
  validadeHoras = 72,
  adicional = false,
  parentQuotationId = null,
  motivoAdicional = null,
  actorId = 'operador'
}) {
  if (!tenantId || typeof tenantId !== 'string') {
    throw new Error('tenantId é obrigatório para criar orçamento.');
  }
  if (!state) {
    throw new Error('Estado do tenant é obrigatório.');
  }
  if (!osId) {
    throw new Error('osId é obrigatório para criar orçamento.');
  }

  state.quotations = Array.isArray(state.quotations) ? state.quotations : [];
  state.os = Array.isArray(state.os) ? state.os : [];
  state.veiculos = Array.isArray(state.veiculos) ? state.veiculos : [];

  const os = state.os.find(o => o.id === osId);
  const osNum = os ? (os.num || os.id) : osId;
  const veiculoId = os ? os.vei : null;
  const clienteId = os ? os.cli : null;
  const placa = os ? os.placa : null;

  const itensFormatados = items.map((it, idx) => ({
    id: it.id || `item_${Date.now()}_${idx}_${crypto.randomBytes(2).toString('hex')}`,
    tipo: it.tipo === 'peca' ? 'peca' : 'servico',
    nome: String(it.nome || 'Item sem descrição').trim(),
    descricao: String(it.descricao || '').trim(),
    quantidade: Math.max(1, Number(it.quantidade) || 1),
    valorUnitario: arredondar(it.valorUnitario || it.preco || 0),
    valorTotal: arredondar((Number(it.valorUnitario || it.preco || 0)) * (Math.max(1, Number(it.quantidade) || 1))),
    prioridade: it.prioridade || 'obrigatorio',
    status: it.status || 'pendente',
    motivoRecusa: null,
    garantiaEstimada: it.garantiaEstimada || null,
    possivelGarantia: Boolean(it.possivelGarantia)
  }));

  const totais = calcularTotais(itensFormatados, descontoGeral);

  const versaoInicial = 1;
  const codigo = adicional
    ? `ORC-${osNum}-ADIC-${state.quotations.filter(q => q.osId === osId && q.adicional).length + 1}`
    : `ORC-${osNum}-v${versaoInicial}`;

  const novoOrcamento = {
    id: gerarId('orc'),
    codigo,
    tenantId,
    osId,
    inspectionId: inspectionId || null,
    veiculoId: veiculoId || null,
    clienteId: clienteId || null,
    placa: placa ? String(placa).toUpperCase().replace(/[^A-Z0-9]/g, '') : null,
    versao: versaoInicial,
    adicional: Boolean(adicional),
    parentQuotationId: parentQuotationId || null,
    motivoAdicional: motivoAdicional ? String(motivoAdicional).trim() : null,
    status: 'rascunho',
    itens: itensFormatados,
    ...totais,
    validadeHoras: Number(validadeHoras) || 72,
    expiraEm: new Date(Date.now() + (Number(validadeHoras) || 72) * 60 * 60 * 1000).toISOString(),
    enviadoEm: null,
    canalEnvio: null,
    activeTokenHash: null,
    historicoVersoes: [],
    decisaoCliente: {
      decididoEm: null,
      canal: null,
      itensAprovadosIds: [],
      itensRecusadosIds: [],
      motivoRecusaGeral: null,
      ipOrigem: null,
      userAgent: null
    },
    criadoEm: new Date().toISOString(),
    criadoPor: actorId,
    atualizadoEm: new Date().toISOString()
  };

  state.quotations.unshift(novoOrcamento);

  if (os) {
    if (!adicional) {
      os.quotationId = novoOrcamento.id;
      if (os.st === 'fila' || os.st === 'diagnostico') {
        os.st = 'aprovacao';
      }
    }
  }

  registrarAuditoria(state, {
    tenantId,
    tipo: adicional ? 'orcamento_adicional_criado' : 'orcamento_criado',
    quotationId: novoOrcamento.id,
    codigo: novoOrcamento.codigo,
    osId: novoOrcamento.osId,
    totalGeral: novoOrcamento.totalGeral,
    totalItens: novoOrcamento.itens.length,
    autor: actorId
  });

  return { ok: true, quotation: novoOrcamento };
}

/**
 * Obtém um orçamento pelo ID com isolamento estrito de tenant
 */
function obterOrcamento({ tenantId, state, quotationId }) {
  if (!tenantId || !state || !quotationId) return null;
  const list = Array.isArray(state.quotations) ? state.quotations : [];
  const orc = list.find(q => q.id === quotationId && q.tenantId === tenantId);
  return orc || null;
}

/**
 * Lista orçamentos de um tenant com filtros opcionais
 */
function listarOrcamentos({ tenantId, state, osId = null, status = null, placa = null }) {
  if (!tenantId || !state) return [];
  const list = Array.isArray(state.quotations) ? state.quotations : [];
  return list.filter(q => {
    if (q.tenantId !== tenantId) return false;
    if (osId && q.osId !== osId) return false;
    if (status && q.status !== status) return false;
    if (placa) {
      const pNorm = String(placa).toUpperCase().replace(/[^A-Z0-9]/g, '');
      const qPlaca = String(q.placa || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (qPlaca !== pNorm) return false;
    }
    return true;
  });
}

/**
 * Cria uma nova versão de um orçamento existente (ex: v1 -> v2)
 */
function criarNovaVersao({
  tenantId,
  state,
  quotationId,
  novosItens = null,
  descontoGeral = null,
  motivo = 'Ajuste de escopo e valores',
  actorId = 'operador'
}) {
  const orc = obterOrcamento({ tenantId, state, quotationId });
  if (!orc) {
    return { ok: false, error: 'Orçamento não encontrado.', status: 404 };
  }

  if (orc.status === 'cancelado') {
    return { ok: false, error: 'Não é possível versionar um orçamento cancelado.', status: 400 };
  }

  orc.historicoVersoes = Array.isArray(orc.historicoVersoes) ? orc.historicoVersoes : [];
  orc.historicoVersoes.push({
    versao: orc.versao,
    codigo: orc.codigo,
    status: orc.status,
    itens: JSON.parse(JSON.stringify(orc.itens)),
    subtotalServicos: orc.subtotalServicos,
    subtotalPecas: orc.subtotalPecas,
    descontoGeral: orc.descontoGeral,
    totalGeral: orc.totalGeral,
    totalAprovado: orc.totalAprovado,
    enviadoEm: orc.enviadoEm,
    arquivadoEm: new Date().toISOString(),
    motivo: String(motivo || '').trim(),
    arquivadoPor: actorId
  });

  orc.versao += 1;
  const os = (state.os || []).find(o => o.id === orc.osId);
  const osNum = os ? (os.num || os.id) : orc.osId;
  orc.codigo = orc.adicional ? `${orc.codigo}-v${orc.versao}` : `ORC-${osNum}-v${orc.versao}`;
  orc.activeTokenHash = null;
  orc.status = 'rascunho';

  if (Array.isArray(novosItens)) {
    orc.itens = novosItens.map((it, idx) => ({
      id: it.id || `item_${Date.now()}_${idx}_${crypto.randomBytes(2).toString('hex')}`,
      tipo: it.tipo === 'peca' ? 'peca' : 'servico',
      nome: String(it.nome || 'Item sem descrição').trim(),
      descricao: String(it.descricao || '').trim(),
      quantidade: Math.max(1, Number(it.quantidade) || 1),
      valorUnitario: arredondar(it.valorUnitario || it.preco || 0),
      valorTotal: arredondar((Number(it.valorUnitario || it.preco || 0)) * (Math.max(1, Number(it.quantidade) || 1))),
      prioridade: it.prioridade || 'obrigatorio',
      status: 'pendente',
      motivoRecusa: null,
      garantiaEstimada: it.garantiaEstimada || null,
      possivelGarantia: Boolean(it.possivelGarantia)
    }));
  }

  if (descontoGeral !== null && descontoGeral !== undefined) {
    orc.descontoGeral = arredondar(descontoGeral);
  }

  const totais = calcularTotais(orc.itens, orc.descontoGeral);
  Object.assign(orc, totais);
  orc.atualizadoEm = new Date().toISOString();

  registrarAuditoria(state, {
    tenantId,
    tipo: 'orcamento_nova_versao',
    quotationId: orc.id,
    codigo: orc.codigo,
    versao: orc.versao,
    totalGeral: orc.totalGeral,
    motivo,
    autor: actorId
  });

  return { ok: true, quotation: orc };
}

/**
 * Cria um adicional de escopo descoberto durante a execução da OS
 */
function criarAdicionalEscopo({
  tenantId,
  state,
  osId,
  parentQuotationId = null,
  items = [],
  motivo = 'Anomalia detectada durante a desmontagem',
  actorId = 'operador'
}) {
  return criarOrcamento({
    tenantId,
    state,
    osId,
    items,
    adicional: true,
    parentQuotationId,
    motivoAdicional: motivo,
    actorId
  });
}

module.exports = {
  gerarId,
  arredondar,
  registrarAuditoria,
  calcularTotais,
  criarOrcamento,
  obterOrcamento,
  listarOrcamentos,
  criarNovaVersao,
  criarAdicionalEscopo
};

