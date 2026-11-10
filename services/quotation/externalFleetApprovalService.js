'use strict';

/**
 * services/quotation/externalFleetApprovalService.js
 * Motor de Link Tokenizado e Portal de Aprovação Externa B2B do Frotista.
 * Teto de Linhas: <= 350 linhas
 */

const crypto = require('crypto');
const partialApprovalService = require('./partialApprovalService');
const fleetCostCenterBudgetService = require('../crm/fleetCostCenterBudgetService');
const fleetDelinquencyGuardService = require('../billing/fleetDelinquencyGuardService');
const patioBottleneckSlaService = require('../patio/patioBottleneckSlaService');

function criarErro(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

function gerarId(prefix) {
  return `${prefix}_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
}

function garantirColecoes(state) {
  if (!state) throw criarErro('STATE_REQUIRED', 'Estado da aplicação não informado.');
  if (!Array.isArray(state.os)) state.os = [];
  if (!Array.isArray(state.externalApprovalTokens)) state.externalApprovalTokens = [];
  if (!Array.isArray(state.whatsappAgentLogs)) state.whatsappAgentLogs = [];
  if (!Array.isArray(state.patioBottlenecks)) state.patioBottlenecks = [];
  if (!Array.isArray(state.patioBoxes)) state.patioBoxes = [];
}

function round2(val) {
  return Math.round((Number(val) || 0) * 100) / 100;
}

function gerarLinkTokenAprovacaoFrotista(state, payload = {}) {
  garantirColecoes(state);
  const osId = payload.osId;
  if (!osId) throw criarErro('OS_REQUIRED', 'osId é obrigatório para gerar link.');

  const os = state.os.find(o => o.id === osId || String(o.num) === String(osId));
  if (!os) throw criarErro('OS_NOT_FOUND', `Ordem de serviço "${osId}" não encontrada.`);

  const tenantId = payload.tenantId || os.tenantId || state.tenantId || 'tenant_default';
  const agora = new Date();
  const validadeHoras = Number(payload.validadeHoras) || 48;
  const expiraEm = new Date(agora.getTime() + validadeHoras * 3600 * 1000).toISOString();

  // Invalida tokens pendentes anteriores para a mesma OS
  for (const t of state.externalApprovalTokens) {
    if ((t.osId === os.id || t.osId === osId) && t.status === 'pendente') {
      t.status = 'revogado';
      t.motivoRevogacao = 'substituido_por_novo_link';
      t.atualizadoEm = agora.toISOString();
    }
  }

  const tokenStr = crypto.randomBytes(24).toString('hex');
  const valorOrcamentoOriginal = round2(os.total != null ? os.total : (os.valorTotal != null ? os.valorTotal : 0));

  const tokenObj = {
    id: gerarId('tok_apr'),
    tenantId,
    osId: os.id,
    osNum: os.num || os.id,
    token: tokenStr,
    status: 'pendente',
    valorOrcamentoOriginal,
    telefoneDestino: payload.telefoneDestino || null,
    responsavel: payload.responsavel || null,
    criadoEm: agora.toISOString(),
    expiraEm,
    atualizadoEm: agora.toISOString(),
    decisao: null
  };

  state.externalApprovalTokens.push(tokenObj);

  if (payload.telefoneDestino) {
    state.whatsappAgentLogs.push({
      id: gerarId('log_wpp'),
      tenantId,
      tipo: 'envio_link_aprovacao_frotista',
      telefone: payload.telefoneDestino,
      osId: os.id,
      token: tokenStr,
      timestamp: agora.toISOString()
    });
  }

  return { ok: true, token: tokenObj, link: `/aprovacao-frotista.html?token=${tokenStr}` };
}

function consultarOrcamentoPorTokenPublico(state, tokenStr, options = {}) {
  garantirColecoes(state);
  if (!tokenStr) throw criarErro('TOKEN_REQUIRED', 'Token de aprovação não fornecido.');

  const tokenObj = state.externalApprovalTokens.find(t => t.token === tokenStr);
  if (!tokenObj) throw criarErro('APPROVAL_TOKEN_NOT_FOUND', 'Link de aprovação não encontrado.');
  if (tokenObj.status === 'revogado') throw criarErro('APPROVAL_TOKEN_REVOKED', 'Este link de aprovação foi revogado ou substituído.');
  if (tokenObj.status === 'utilizado') throw criarErro('APPROVAL_TOKEN_ALREADY_USED', 'Este orçamento já foi respondido e processado.');

  const agora = options.dataReferencia ? new Date(options.dataReferencia).getTime() : Date.now();
  if (new Date(tokenObj.expiraEm).getTime() < agora) {
    tokenObj.status = 'expirado';
    tokenObj.atualizadoEm = new Date().toISOString();
    throw criarErro('APPROVAL_TOKEN_EXPIRED', 'Este link de aprovação expirou.');
  }

  const os = state.os.find(o => o.id === tokenObj.osId || String(o.num) === String(tokenObj.osId));
  if (!os) throw criarErro('OS_NOT_FOUND', 'Ordem de serviço associada não foi encontrada.');

  const cliente = (state.clientes || []).find(c => c.id === os.clienteId || c.id === os.cli) || null;
  const ccId = os.centroCustoId;
  let centroCusto = null;

  if (ccId) {
    centroCusto = (state.costCenters || []).find(c => c.id === ccId) || null;
    if (!centroCusto && cliente && Array.isArray(cliente.centrosCusto)) {
      centroCusto = cliente.centrosCusto.find(c => c.id === ccId) || null;
    }
  }

  return {
    ok: true,
    token: tokenObj,
    os: {
      id: os.id,
      num: os.num,
      placa: os.placa || os.veiculoPlaca || '',
      veiculo: os.veiculo || os.modelo || '',
      total: round2(os.total != null ? os.total : os.valorTotal),
      servicos: Array.isArray(os.servicos) ? os.servicos : [],
      pecas: Array.isArray(os.pecas) ? os.pecas : [],
      centroCustoId: os.centroCustoId || null
    },
    cliente: cliente ? { id: cliente.id, nome: cliente.nome } : null,
    centroCusto
  };
}

function mapearItensDecisao(lista, tipo, decisoesMap) {
  let valorAprovado = 0;
  const mapped = [];
  for (const item of lista) {
    const d = decisoesMap.get(String(item.id));
    const statusItem = d ? (d.statusItem || 'aprovado') : 'aprovado';
    const valor = round2(item.total != null ? item.total : ((item.valor || item.preco || 0) * (item.qtd || 1)));
    if (statusItem === 'aprovado') valorAprovado += valor;
    mapped.push({
      id: item.id,
      tipo,
      statusItem,
      motivo: d ? (d.motivo || '') : '',
      criticidade: d ? (d.criticidade || 'media') : 'media',
      prazoDias: d ? (d.prazoDias || null) : null
    });
  }
  return { mapped, valorAprovado: round2(valorAprovado) };
}

function submeterDecisaoExternaFrotista(state, tokenStr, payload = {}) {
  const consulta = consultarOrcamentoPorTokenPublico(state, tokenStr, payload);
  const tokenObj = consulta.token;
  const os = state.os.find(o => o.id === tokenObj.osId || String(o.num) === String(tokenObj.osId));

  if (!payload.aprovadorNome || !payload.aprovadorDocumento) {
    throw criarErro('APPROVER_IDENTITY_REQUIRED', 'Nome e documento do aprovador são obrigatórios.');
  }

  const decisoesMap = new Map();
  for (const d of (Array.isArray(payload.decisoesItens) ? payload.decisoesItens : [])) {
    if (d && d.id) decisoesMap.set(String(d.id), d);
  }

  const srvRes = mapearItensDecisao(Array.isArray(os.servicos) ? os.servicos : [], 'servico', decisoesMap);
  const pecRes = mapearItensDecisao(Array.isArray(os.pecas) ? os.pecas : [], 'peca', decisoesMap);
  const mappedItens = [...srvRes.mapped, ...pecRes.mapped];
  const valorAprovado = round2(srvRes.valorAprovado + pecRes.valorAprovado);
  const clienteId = os.clienteId || os.cli;

  // 1º Guardião: Trava de Inadimplência Frotista
  if (clienteId && fleetDelinquencyGuardService) {
    fleetDelinquencyGuardService.validarTravaInadimplenciaFrotista(state, clienteId, {
      valorNovoServico: valorAprovado,
      permitirOverride: Boolean(payload.autorizarOverrideInadimplencia || payload.permitirOverride),
      motivoLiberacao: payload.motivoLiberacao,
      usuarioLiberacao: payload.aprovadorNome,
      dataReferencia: payload.dataReferencia
    });
  }

  // 2º Guardião: Governança Orçamentária por Centro de Custo
  const centroCustoId = payload.centroCustoId || os.centroCustoId;
  if (centroCustoId && fleetCostCenterBudgetService) {
    const orcamentoCC = fleetCostCenterBudgetService.calcularConsumoOrcamentoCentroCusto({
      state,
      tenantId: os.tenantId || state.tenantId,
      centroCustoId,
      competencia: payload.competencia
    });

    if (orcamentoCC && orcamentoCC.ok && orcamentoCC.bloquearEstouro) {
      let consumoOutrasOS = 0;
      for (const o of state.os) {
        if (o.id === os.id || o.centroCustoId !== centroCustoId) continue;
        consumoOutrasOS += Number(o.total != null ? o.total : (o.valorTotal || 0));
      }
      consumoOutrasOS = round2(consumoOutrasOS);
      const saldoDisponivel = Math.max(0, round2(orcamentoCC.limiteMensal - consumoOutrasOS));

      if (valorAprovado > saldoDisponivel) {
        throw criarErro(
          'COST_CENTER_BUDGET_EXCEEDED',
          `Orçamento estourado para o Centro de Custo (${centroCustoId}). Limite: R$ ${orcamentoCC.limiteMensal.toFixed(2)}, Solicitado: R$ ${valorAprovado.toFixed(2)}.`
        );
      }
    }
  }

  // Processa aprovação parcial e reflete CRM
  partialApprovalService.processarAprovacaoParcial({
    tenantId: os.tenantId || state.tenantId || 'tenant_default',
    state,
    osId: os.id,
    itens: mappedItens,
    actorId: payload.aprovadorNome,
    observacoes: payload.observacoes || 'Aprovação externa via portal tokenizado B2B'
  });

  if (Array.isArray(state.opportunities)) {
    for (const opp of state.opportunities) {
      if (opp.valorTotalEstimado != null && opp.valorEstimado == null) {
        opp.valorEstimado = opp.valorTotalEstimado;
      }
    }
  }

  const agoraDecisao = new Date().toISOString();
  const canonicalAuditData = JSON.stringify({
    tokenId: tokenObj.id,
    token: tokenObj.token,
    osId: os.id,
    aprovadorNome: payload.aprovadorNome,
    aprovadorDocumento: payload.aprovadorDocumento,
    valorAprovado,
    itens: mappedItens,
    dataDecisao: agoraDecisao
  });
  const hashIntegridadeDecisao = crypto.createHash('sha256').update(canonicalAuditData).digest('hex');

  const decisaoAuditada = {
    aprovadorNome: payload.aprovadorNome,
    aprovadorDocumento: payload.aprovadorDocumento,
    aprovadorCargo: payload.aprovadorCargo || null,
    ipOrigem: payload.ipOrigem || '127.0.0.1',
    userAgent: payload.userAgent || 'Unknown',
    valorAprovado,
    hashIntegridadeDecisao,
    dataDecisao: agoraDecisao,
    observacoes: payload.observacoes || ''
  };

  tokenObj.status = 'utilizado';
  tokenObj.decisao = decisaoAuditada;
  tokenObj.atualizadoEm = agoraDecisao;
  os.aceiteExternoB2B = decisaoAuditada;

  // Destravamento Automático de Box / Encerramento do Gargalo 'aguardando_aprovacao_frotista'
  const gargalosAtivos = (state.patioBottlenecks || []).filter(
    g => g.osId === os.id && g.status === 'aberto' &&
         (g.motivoParada === 'aguardando_aprovacao_frotista' || g.motivoParada === 'aguardando_aprovacao')
  );
  for (const g of gargalosAtivos) {
    patioBottleneckSlaService.encerrarGargaloParadaOS(state, g.id, {
      resolucao: `Orçamento aprovado externamente por ${payload.aprovadorNome}`,
      timestamp: agoraDecisao
    });
  }

  return { ok: true, token: tokenObj, decisaoAuditada, osId: os.id };
}

function revogarTokenAprovacaoFrotista(state, tokenId, options = {}) {
  garantirColecoes(state);
  const tokenObj = state.externalApprovalTokens.find(t => t.id === tokenId || t.token === tokenId);
  if (!tokenObj) throw criarErro('APPROVAL_TOKEN_NOT_FOUND', 'Token de aprovação não encontrado.');

  tokenObj.status = 'revogado';
  tokenObj.motivoRevogacao = options.motivo || 'Revogado manualmente';
  tokenObj.atualizadoEm = new Date().toISOString();

  return { ok: true, token: tokenObj };
}

function listarLinksAprovacaoExterna(state, query = {}) {
  garantirColecoes(state);
  let lista = [...state.externalApprovalTokens];
  if (query.tenantId) lista = lista.filter(t => t.tenantId === query.tenantId);
  if (query.osId) lista = lista.filter(t => t.osId === query.osId);
  if (query.status) lista = lista.filter(t => t.status === query.status);
  return { ok: true, total: lista.length, tokens: lista };
}

module.exports = {
  gerarLinkTokenAprovacaoFrotista,
  consultarOrcamentoPorTokenPublico,
  submeterDecisaoExternaFrotista,
  revogarTokenAprovacaoFrotista,
  listarLinksAprovacaoExterna
};
