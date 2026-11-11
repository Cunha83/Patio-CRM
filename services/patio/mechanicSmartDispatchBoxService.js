'use strict';

/**
 * services/patio/mechanicSmartDispatchBoxService.js
 * 
 * Motor de Despacho Inteligente de Mecânicos por Especialidade,
 * Terminal Operacional de Chão de Oficina & Registro de Peça Condenada.
 * Arquitetura: <= 350 linhas
 */

const crypto = require('crypto');
const mechanicTimeTrackingService = require('./mechanicTimeTrackingService');
const patioBottleneckSlaService = require('./patioBottleneckSlaService');
const externalFleetApprovalService = require('../quotation/externalFleetApprovalService');

function criarErro(code, message) {
  const err = new Error(`${code}: ${message}`);
  err.code = code;
  return err;
}

function gerarId(prefix) {
  return `${prefix}_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
}

function garantirColecoes(state) {
  if (!state) throw criarErro('STATE_REQUIRED', 'Estado da aplicação é obrigatório.');
  ['mechanicProfiles', 'patioBoxes', 'patioBottlenecks', 'timeLogs', 'reworkRecords',
   'dispatchLogs', 'boxCondemnedPartEvidences', 'auditoria'].forEach(c => {
    if (!Array.isArray(state[c])) state[c] = [];
  });
  if (!Array.isArray(state.os)) state.os = Array.isArray(state.serviceOrders) ? state.serviceOrders : [];
}

function round2(val) {
  return Math.round((Number(val) || 0) * 100) / 100;
}

function configurarPerfilEspecialidadesMecanico(state, payload = {}) {
  garantirColecoes(state);
  const mecanicoId = payload.mecanicoId;
  if (!mecanicoId) throw criarErro('MECANICO_ID_REQUIRED', 'mecanicoId é obrigatório para configurar perfil.');

  let profile = state.mechanicProfiles.find(p => p.mecanicoId === mecanicoId);
  if (!profile) {
    profile = { mecanicoId };
    state.mechanicProfiles.push(profile);
  }

  profile.nome = payload.nome || profile.nome || 'Mecânico';
  profile.especialidades = Object.assign({}, profile.especialidades || {}, payload.especialidades || {});
  profile.ativo = payload.ativo !== undefined ? Boolean(payload.ativo) : (profile.ativo !== undefined ? profile.ativo : true);
  profile.turno = payload.turno || profile.turno || 'diurno';
  profile.boxPreferencialId = payload.boxPreferencialId || profile.boxPreferencialId || null;
  profile.tenantId = payload.tenantId || profile.tenantId || state.tenantId || 'tenant_default';
  profile.atualizadoEm = new Date().toISOString();

  return { sucesso: true, perfil: profile };
}

function recomendarMecanicoIdealParaServico(state, { especialidadeRequerida, competencia, tenantId } = {}) {
  garantirColecoes(state);
  const espReq = especialidadeRequerida || 'geral';

  let candidatos = state.mechanicProfiles.filter(p => p.ativo !== false && (!tenantId || !p.tenantId || p.tenantId === tenantId));
  if (candidatos.length === 0 && Array.isArray(state.team)) {
    candidatos = state.team.filter(m => m.funcao === 'mecanico' || m.cargo === 'mecanico').map(m => ({
      mecanicoId: m.id || m.mecanicoId,
      nome: m.nome,
      especialidades: m.especialidades || {},
      ativo: true
    }));
  }

  const ranking = candidatos.map(mec => {
    const timeLogAtivo = state.timeLogs.find(l =>
      l.mecanicoId === mec.mecanicoId && l.status === 'em_execucao' &&
      (!tenantId || !l.tenantId || l.tenantId === tenantId)
    );
    const disponivelImediato = !timeLogAtivo;
    const nivelEspecialidade = Math.min(3, Math.max(0, Number(mec.especialidades?.[espReq]) || 0));

    const logsConcluidos = state.timeLogs.filter(l => l.mecanicoId === mec.mecanicoId && l.status === 'concluido');
    let hVendidas = 0, hTrabalhadas = 0;
    for (const log of logsConcluidos) {
      hVendidas += Number(log.horasVendidas || log.horasPadrao || 0);
      hTrabalhadas += Number(log.horasTrabalhadas || log.duracaoHoras || 0);
    }
    const eficienciaHistorica = hTrabalhadas > 0 ? Math.round((hVendidas / hTrabalhadas) * 100) : 100;
    const retrabalhosCount = state.reworkRecords.filter(r => r.mecanicoId === mec.mecanicoId && r.status !== 'cancelado').length;

    const scoreDespacho = (disponivelImediato ? 50 : 0) + (nivelEspecialidade * 20) +
      Math.min(30, Math.round(eficienciaHistorica * 0.2)) - (retrabalhosCount * 15);

    const justificativa = `${disponivelImediato ? 'Disponível agora (+50)' : 'Ocupado em serviço (0)'}, ` +
      `Nível ${nivelEspecialidade} em ${espReq} (+${nivelEspecialidade * 20}), ` +
      `Eficiência ${eficienciaHistorica}% (+${Math.min(30, Math.round(eficienciaHistorica * 0.2))}), ` +
      `${retrabalhosCount} retrabalho(s) (-${retrabalhosCount * 15}).`;

    return { mecanicoId: mec.mecanicoId, nome: mec.nome, scoreDespacho, disponivelImediato, nivelEspecialidade, eficienciaHistorica, retrabalhosCount, justificativa };
  });

  ranking.sort((a, b) => b.scoreDespacho - a.scoreDespacho);

  return { especialidadeRequerida: espReq, ranking, melhorRecomendacao: ranking[0] || null };
}

function despacharServicoBoxInteligente(state, payload = {}) {
  garantirColecoes(state);
  const { osId, servicoId, especialidadeRequerida, boxId, horasPadrao, timestamp, autorId, autorNome } = payload;
  const tenantId = payload.tenantId || state.tenantId || 'tenant_default';

  if (!osId || !servicoId) {
    throw criarErro('DISPATCH_REQUIRED_FIELDS', 'osId e servicoId são obrigatórios para despacho.');
  }

  let mecanicoId = payload.mecanicoIdEscolhido;
  let mecanicoNome = payload.mecanicoNome;

  if (!mecanicoId) {
    const recomendacao = recomendarMecanicoIdealParaServico(state, { especialidadeRequerida, tenantId });
    if (!recomendacao.melhorRecomendacao) {
      throw criarErro('NO_MECHANIC_AVAILABLE', 'Nenhum mecânico disponível para despacho inteligente.');
    }
    mecanicoId = recomendacao.melhorRecomendacao.mecanicoId;
    mecanicoNome = recomendacao.melhorRecomendacao.nome;
  }

  if (!mecanicoNome) {
    const perfil = state.mechanicProfiles.find(p => p.mecanicoId === mecanicoId);
    mecanicoNome = perfil ? perfil.nome : 'Mecânico';
  }

  const apontamento = mechanicTimeTrackingService.iniciarApontamentoServico(state, {
    tenantId, osId, servicoId, mecanicoId, mecanicoNome,
    boxId: boxId || null, horasPadrao: Number(horasPadrao) || 1,
    timestamp: timestamp || null, actorId: autorNome || autorId || 'sistema_despacho'
  });

  if (boxId) {
    const box = state.patioBoxes.find(b => b.id === boxId || b.codigo === boxId);
    if (box) {
      box.status = 'ocupado';
      box.osId = osId;
      box.osAtualId = osId;
      box.mecanicoResponsavelId = mecanicoId;
      box.mecanicoResponsavelNome = mecanicoNome;
      box.atualizadoEm = new Date().toISOString();
    }
  }

  const dispatchLog = {
    id: gerarId('disp'), tenantId, osId, servicoId, mecanicoId, mecanicoNome,
    boxId: boxId || null, timestamp: timestamp || new Date().toISOString(),
    autor: autorNome || autorId || 'coordenador_patio'
  };
  state.dispatchLogs.push(dispatchLog);

  return {
    sucesso: true, osId, servicoId, mecanicoId, mecanicoNome,
    boxId: boxId || null, apontamentoId: apontamento.id, timestamp: dispatchLog.timestamp
  };
}

function registrarEvidenciaPecaCondenadaBox(state, payload = {}) {
  garantirColecoes(state);
  const { osId, pecaDescricao } = payload;
  if (!osId || !pecaDescricao) {
    throw criarErro('EVIDENCE_REQUIRED_FIELDS', 'osId e pecaDescricao são obrigatórios para registrar evidência.');
  }

  const os = state.os.find(o => o.id === osId || String(o.num) === String(osId));
  if (!os) throw criarErro('OS_NOT_FOUND', `Ordem de serviço "${osId}" não encontrada.`);

  const tenantId = payload.tenantId || os.tenantId || state.tenantId || 'tenant_default';
  const boxId = payload.boxId || os.boxAtualId || null;
  const qtd = Math.max(1, Number(payload.quantidade) || 1);
  const vlr = Math.max(0, Number(payload.valorUnitario) || 0);
  const total = round2(qtd * vlr);
  const timestamp = payload.timestamp || new Date().toISOString();
  const evidenciaId = gerarId('ev_box');
  const pecaId = payload.pecaId || gerarId('pec_cond');

  const evidencia = {
    id: evidenciaId, tenantId, osId: os.id, osNum: os.num || os.id, boxId,
    mecanicoId: payload.mecanicoId || 'mecanico_box', mecanicoNome: payload.mecanicoNome || 'Mecânico de Box',
    pecaId, pecaDescricao, codigoFabricante: payload.codigoFabricante || '',
    quantidade: qtd, valorUnitario: vlr, valorTotal: total,
    motivoCondenacao: payload.motivoCondenacao || 'desgaste_excessivo_desmontagem',
    fotos: Array.isArray(payload.fotos) ? payload.fotos : [], observacao: payload.observacao || '',
    tempoEstimadoSubstituicaoHoras: Number(payload.tempoEstimadoSubstituicaoHoras) || 1,
    status: 'aguardando_aprovacao_frotista', criadoEm: timestamp
  };

  state.boxCondemnedPartEvidences.push(evidencia);
  if (!Array.isArray(os.evidenciasDesmontagemBox)) os.evidenciasDesmontagemBox = [];
  os.evidenciasDesmontagemBox.push(evidencia);

  if (!Array.isArray(os.pecas)) os.pecas = [];
  os.pecas.push({
    id: pecaId, desc: pecaDescricao, cod: payload.codigoFabricante || '',
    qtd, preco: vlr, total, origemCondenacaoBox: true,
    statusAprovacao: 'pendente_frotista', evidenciaId
  });

  let somaTotalOS = 0;
  for (const s of (os.servicos || [])) somaTotalOS += Number(s.total || 0);
  for (const p of (os.pecas || [])) somaTotalOS += Number(p.total || 0);
  os.total = round2(somaTotalOS);
  os.valorTotal = os.total;

  if (boxId) {
    const box = state.patioBoxes.find(b => b.id === boxId || b.codigo === boxId);
    if (box) {
      box.osId = os.id;
      box.osAtualId = os.id;
    }
  }

  const gargaloRes = patioBottleneckSlaService.registrarGargaloParadaOS(state, {
    tenantId, osId: os.id, boxId, motivoParada: 'aguardando_aprovacao_frotista',
    observacao: `Peça condenada no box: ${pecaDescricao} (R$ ${total.toFixed(2)})`,
    responsavel: payload.mecanicoNome || 'Terminal Mecânico Box', timestamp
  });

  const linkRes = externalFleetApprovalService.gerarLinkTokenAprovacaoFrotista(state, {
    tenantId, osId: os.id, responsavel: os.clienteNome || 'Gestor de Frota',
    validadeHoras: 48, timestamp
  });

  const tokenStr = typeof linkRes.token === 'object' ? (linkRes.token.token || '') : String(linkRes.token || '');
  const linkUrl = linkRes.link || linkRes.linkAprovacao || `/aprovacao-frotista.html?token=${tokenStr}`;
  const gargaloId = gargaloRes.gargalo ? gargaloRes.gargalo.id : gargaloRes.id;

  return {
    sucesso: true, evidenciaId, osId: os.id, boxId,
    gargaloId, tokenAprovacao: tokenStr,
    linkAprovacao: linkUrl, valorTotalAdicional: total
  };
}

function listarFilaTerminalOperacionalBox(state, { boxId, mecanicoId } = {}) {
  garantirColecoes(state);
  const box = boxId ? state.patioBoxes.find(b => b.id === boxId || b.codigo === boxId) : null;
  const perfil = mecanicoId ? state.mechanicProfiles.find(p => p.mecanicoId === mecanicoId) : null;

  const targetOsId = box ? box.osId : null;
  const osAtiva = targetOsId ? state.os.find(o => o.id === targetOsId || String(o.num) === String(targetOsId)) : null;

  const apontamentoAtivo = state.timeLogs.find(l =>
    (mecanicoId && l.mecanicoId === mecanicoId && l.status === 'em_execucao') ||
    (boxId && l.boxId === boxId && l.status === 'em_execucao')
  ) || null;

  const evidenciasCondenadas = state.boxCondemnedPartEvidences.filter(e =>
    (boxId && e.boxId === boxId) ||
    (osAtiva && e.osId === osAtiva.id) ||
    (mecanicoId && e.mecanicoId === mecanicoId)
  );

  return {
    box: box || null,
    mecanico: perfil || (mecanicoId ? { mecanicoId, nome: 'Mecânico' } : null),
    osAtiva: osAtiva || null,
    apontamentoAtivo,
    evidenciasCondenadas
  };
}

module.exports = {
  configurarPerfilEspecialidadesMecanico,
  recomendarMecanicoIdealParaServico,
  despacharServicoBoxInteligente,
  registrarEvidenciaPecaCondenadaBox,
  listarFilaTerminalOperacionalBox
};
