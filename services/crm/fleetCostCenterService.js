'use strict';

/**
 * Pátio CRM — Gestão de Centros de Custo B2B e Hierarquia Corporativa de Frotas
 * Arquitetura Modular (< 280 linhas).
 */

const crypto = require('crypto');

function gerarId(prefix) {
  return prefix + '_' + Date.now() + '_' + crypto.randomBytes(3).toString('hex');
}

function garantirColecoes(state) {
  state.clientes = Array.isArray(state.clientes) ? state.clientes : [];
  state.veiculos = Array.isArray(state.veiculos) ? state.veiculos : [];
  state.os = Array.isArray(state.os) ? state.os : [];
  state.costCenters = Array.isArray(state.costCenters) ? state.costCenters : [];
  state.auditoria = Array.isArray(state.auditoria) ? state.auditoria : [];
}

function cadastrarCentroCusto({
  tenantId,
  state,
  clienteId,
  nome,
  codigo = '',
  responsavel = '',
  descricao = '',
  orcamentoMensal = 0,
  status = 'ativo',
  actorId = 'sistema'
}) {
  if (!tenantId) throw new Error('tenantId é obrigatório.');
  if (!state) throw new Error('Estado é obrigatório.');
  if (!clienteId) throw new Error('clienteId é obrigatório.');
  if (!nome || !nome.trim()) throw new Error('Nome do Centro de Custo é obrigatório.');

  garantirColecoes(state);

  const cliente = state.clientes.find(c => c.id === clienteId && (!c.tenantId || c.tenantId === tenantId));
  if (!cliente) {
    throw new Error(`Cliente frotista "${clienteId}" não encontrado.`);
  }

  cliente.centrosCusto = Array.isArray(cliente.centrosCusto) ? cliente.centrosCusto : [];

  const codigoNorm = (codigo || '').trim() || nome.trim().slice(0, 6).toUpperCase();
  const centroCusto = {
    id: gerarId('cc'),
    tenantId,
    clienteId,
    nome: nome.trim(),
    codigo: codigoNorm,
    responsavel: (responsavel || '').trim(),
    descricao: (descricao || '').trim(),
    orcamentoMensal: Math.max(0, Number(orcamentoMensal) || 0),
    status: status || 'ativo',
    criadoEm: new Date().toISOString(),
    atualizadoEm: new Date().toISOString()
  };

  cliente.centrosCusto.push(centroCusto);
  state.costCenters.push(centroCusto);

  state.auditoria.push({
    id: gerarId('aud'),
    tenantId,
    timestamp: new Date().toISOString(),
    actorId,
    acao: 'cadastrar_centro_custo',
    detalhes: {
      clienteId,
      centroCustoId: centroCusto.id,
      nome: centroCusto.nome,
      codigo: centroCusto.codigo
    }
  });

  return {
    ok: true,
    centroCusto
  };
}

function listarCentrosCustoPorCliente({ tenantId, state, clienteId }) {
  if (!state || !clienteId) return [];
  garantirColecoes(state);

  const cliente = state.clientes.find(c => c.id === clienteId && (!c.tenantId || c.tenantId === tenantId));
  if (!cliente) return [];

  const ccs = Array.isArray(cliente.centrosCusto) ? cliente.centrosCusto : [];
  if (tenantId) {
    return ccs.filter(c => !c.tenantId || c.tenantId === tenantId);
  }
  return ccs;
}

function atualizarCentroCusto({
  tenantId,
  state,
  clienteId,
  centroCustoId,
  dados = {},
  actorId = 'sistema'
}) {
  if (!tenantId || !state || !clienteId || !centroCustoId) {
    throw new Error('Parâmetros obrigatórios ausentes.');
  }
  garantirColecoes(state);

  const cliente = state.clientes.find(c => c.id === clienteId && (!c.tenantId || c.tenantId === tenantId));
  if (!cliente || !Array.isArray(cliente.centrosCusto)) {
    throw new Error('Centro de Custo não encontrado.');
  }

  const cc = cliente.centrosCusto.find(c => c.id === centroCustoId);
  if (!cc) {
    throw new Error(`Centro de Custo "${centroCustoId}" não encontrado.`);
  }

  if (dados.nome) cc.nome = dados.nome.trim();
  if (dados.codigo) cc.codigo = dados.codigo.trim();
  if (dados.responsavel != null) cc.responsavel = String(dados.responsavel).trim();
  if (dados.descricao != null) cc.descricao = String(dados.descricao).trim();
  if (dados.orcamentoMensal != null) cc.orcamentoMensal = Math.max(0, Number(dados.orcamentoMensal) || 0);
  if (dados.status) cc.status = dados.status;
  cc.atualizadoEm = new Date().toISOString();

  // Atualiza no índice global se presente
  const globalCC = state.costCenters.find(c => c.id === centroCustoId);
  if (globalCC) {
    Object.assign(globalCC, cc);
  }

  return { ok: true, centroCusto: cc };
}

function vincularCentroCustoVeiculo({
  tenantId,
  state,
  veiculoId,
  centroCustoId,
  actorId = 'sistema'
}) {
  if (!tenantId || !state || !veiculoId) {
    throw new Error('tenantId, state e veiculoId são obrigatórios.');
  }
  garantirColecoes(state);

  const veiculo = state.veiculos.find(v => (v.id === veiculoId || v.placa === veiculoId) && (!v.tenantId || v.tenantId === tenantId));
  if (!veiculo) {
    throw new Error(`Veículo "${veiculoId}" não encontrado.`);
  }

  veiculo.centroCustoId = centroCustoId || null;
  veiculo.atualizadoEm = new Date().toISOString();

  return { ok: true, veiculo };
}

function vincularCentroCustoOS({
  tenantId,
  state,
  osId,
  centroCustoId,
  actorId = 'sistema'
}) {
  if (!tenantId || !state || !osId) {
    throw new Error('tenantId, state e osId são obrigatórios.');
  }
  garantirColecoes(state);

  const os = state.os.find(o => o.id === osId && (!o.tenantId || o.tenantId === tenantId));
  if (!os) {
    throw new Error(`Ordem de serviço "${osId}" não encontrada.`);
  }

  os.centroCustoId = centroCustoId || null;
  os.atualizadoEm = new Date().toISOString();

  return { ok: true, os };
}

function agruparBorderoPorCentroCusto({ itensOS = [], centrosCusto = [] }) {
  if (!Array.isArray(itensOS)) return [];

  const ccMap = new Map();
  for (const cc of centrosCusto) {
    if (cc && cc.id) ccMap.set(cc.id, cc);
  }

  const grupos = new Map();

  for (const it of itensOS) {
    const ccId = it.centroCustoId || 'nao_categorizado';
    const cc = ccMap.get(ccId);
    const nome = cc ? cc.nome : (ccId === 'nao_categorizado' ? 'Sem Centro de Custo' : ccId);
    const codigo = cc ? cc.codigo : 'GERAL';

    if (!grupos.has(ccId)) {
      grupos.set(ccId, {
        centroCustoId: ccId,
        nome,
        codigo,
        totalMaoDeObra: 0,
        totalPecas: 0,
        totalGeral: 0,
        qtdOS: 0,
        ordens: []
      });
    }

    const g = grupos.get(ccId);
    g.totalMaoDeObra = Math.round((g.totalMaoDeObra + (it.totalMaoDeObra || 0)) * 100) / 100;
    g.totalPecas = Math.round((g.totalPecas + (it.totalPecas || 0)) * 100) / 100;
    g.totalGeral = Math.round((g.totalGeral + (it.totalOS || 0)) * 100) / 100;
    g.qtdOS += 1;
    g.ordens.push({
      osId: it.osId,
      num: it.num,
      placa: it.placa,
      modelo: it.modelo,
      totalOS: it.totalOS
    });
  }

  return Array.from(grupos.values());
}

const {
  definirOrcamentoCentroCusto,
  calcularConsumoOrcamentoCentroCusto
} = require('./fleetCostCenterBudgetService');

module.exports = {
  cadastrarCentroCusto,
  listarCentrosCustoPorCliente,
  atualizarCentroCusto,
  vincularCentroCustoVeiculo,
  vincularCentroCustoOS,
  agruparBorderoPorCentroCusto,
  definirOrcamentoCentroCusto,
  calcularConsumoOrcamentoCentroCusto
};

