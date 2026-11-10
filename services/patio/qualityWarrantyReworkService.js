'use strict';

/**
 * services/patio/qualityWarrantyReworkService.js
 * 
 * Gestão de Checklist Técnico de Qualidade Pré-Entrega e
 * Abertura/Rastreio de Ordens de Serviço de Garantia e Retrabalho.
 * 
 * Arquitetura: <= 350 linhas
 */

function validarLiberacaoQualidadeOS(state, osId) {
  if (!state || !Array.isArray(state.os)) {
    const err = new Error('QUALITY_INSPECTION_REQUIRED_OR_FAILED: estado ou lista de OS inválida');
    err.code = 'QUALITY_INSPECTION_REQUIRED_OR_FAILED';
    throw err;
  }

  const os = state.os.find(o => o.id === osId || String(o.num) === String(osId));
  if (!os) {
    const err = new Error(`OS não encontrada: ${osId}`);
    err.code = 'OS_NOT_FOUND';
    throw err;
  }

  const inspecao = os.inspecaoQualidade;
  if (!inspecao || inspecao.status !== 'aprovada' || !inspecao.aprovado) {
    const err = new Error('QUALITY_INSPECTION_REQUIRED_OR_FAILED: inspeção de qualidade pré-entrega obrigatória não realizada ou não foi aprovada');
    err.code = 'QUALITY_INSPECTION_REQUIRED_OR_FAILED';
    throw err;
  }

  return {
    ok: true,
    liberado: true,
    osId: os.id,
    inspecao
  };
}

function registrarInspecaoQualidadeOS(state, osId, payload = {}) {
  if (!state || !Array.isArray(state.os)) {
    throw new Error('Estado ou lista de OS inválida');
  }

  const os = state.os.find(o => o.id === osId || String(o.num) === String(osId));
  if (!os) {
    const err = new Error(`OS não encontrada: ${osId}`);
    err.code = 'OS_NOT_FOUND';
    throw err;
  }

  const torqueGramposOk = Boolean(payload.torqueGramposOk);
  const pinoCentroOk = Boolean(payload.pinoCentroOk);
  const embuchamentoOk = Boolean(payload.embuchamentoOk);
  const testeRodagemOk = Boolean(payload.testeRodagemOk);

  let itensOk = true;
  if (Array.isArray(payload.itensVerificados)) {
    for (const item of payload.itensVerificados) {
      if (item.ok === false || item.status === 'reprovado') {
        itensOk = false;
        break;
      }
    }
  }

  const aprovado = torqueGramposOk && pinoCentroOk && embuchamentoOk && testeRodagemOk && itensOk;
  const status = aprovado ? 'aprovada' : 'reprovada';

  const inspecao = {
    id: `insp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    osId: os.id,
    tenantId: payload.tenantId || os.tenantId || 'default',
    inspetorNome: payload.inspetorNome || 'Inspetor Técnico',
    torqueGramposOk,
    pinoCentroOk,
    embuchamentoOk,
    testeRodagemOk,
    aprovado,
    status,
    observacoes: payload.observacoes || '',
    itensVerificados: Array.isArray(payload.itensVerificados) ? payload.itensVerificados : [],
    timestamp: payload.timestamp || new Date().toISOString()
  };

  os.inspecaoQualidade = inspecao;

  if (!Array.isArray(state.qualityInspections)) {
    state.qualityInspections = [];
  }
  state.qualityInspections.push(inspecao);

  if (Array.isArray(state.auditoria)) {
    state.auditoria.push({
      id: `aud_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      tipo: 'inspecao_qualidade',
      osId: os.id,
      status,
      inspetorNome: inspecao.inspetorNome,
      timestamp: inspecao.timestamp
    });
  }

  return {
    ok: true,
    inspecao
  };
}

function abrirOSGarantiaRetrabalho(state, payload = {}) {
  if (!state || !Array.isArray(state.os)) {
    throw new Error('Estado ou lista de OS inválida');
  }

  const osOrigem = state.os.find(o => o.id === payload.osOrigemId || String(o.num) === String(payload.osOrigemId));
  if (!osOrigem) {
    const err = new Error(`OS de origem não encontrada: ${payload.osOrigemId}`);
    err.code = 'OS_ORIGEM_NOT_FOUND';
    throw err;
  }

  const tenantId = payload.tenantId || osOrigem.tenantId || 'default';
  const proximoNum = Math.max(0, ...(state.os.map(o => Number(o.num) || 0))) + 1;
  const osId = `os_gar_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const causaRaiz = payload.causaRaiz || 'falha_execucao';
  const valorMaoObraAfetada = Number(payload.valorMaoObraAfetada) || 0;
  const horasRetrabalho = Number(payload.horasRetrabalhoEstimadas) || 0;

  const novaOS = {
    id: osId,
    num: proximoNum,
    tenantId,
    tipoOS: 'garantia_retrabalho',
    osOrigemId: osOrigem.id,
    cli: osOrigem.cli || osOrigem.clienteId,
    clienteId: osOrigem.clienteId || osOrigem.cli,
    clienteNome: osOrigem.clienteNome || '',
    vei: osOrigem.vei || osOrigem.veiculoId,
    veiculoId: osOrigem.veiculoId || osOrigem.vei,
    placa: osOrigem.placa || '',
    modelo: osOrigem.modelo || '',
    custoCliente: 0,
    st: 'em_andamento',
    motivoRetrabalho: payload.motivoRetrabalho || 'Garantia e retrabalho de suspensão',
    causaRaiz,
    mecanicoOrigemId: payload.mecanicoOrigemId || null,
    mecanicoExecucaoId: payload.mecanicoExecucaoId || payload.mecanicoOrigemId || null,
    horasRetrabalhoEstimadas: horasRetrabalho,
    servicos: [
      {
        id: `srv_gar_${Date.now()}`,
        desc: `Garantia: ${payload.motivoRetrabalho || 'Retrabalho técnico'}`,
        valor: 0,
        status: 'aprovado',
        statusItem: 'aprovado'
      }
    ],
    pecas: [],
    createdAt: payload.timestamp || new Date().toISOString()
  };

  state.os.push(novaOS);

  const estornarComissao = (causaRaiz === 'falha_execucao' || payload.estornarComissao === true);
  const competencia = payload.competencia || (payload.timestamp ? payload.timestamp.substring(0, 7) : new Date().toISOString().substring(0, 7));

  const ocorrencia = {
    id: `ret_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    tenantId,
    osOrigemId: osOrigem.id,
    osRetrabalhoId: novaOS.id,
    servicoOrigemId: payload.servicoOrigoId || payload.servicoOrigemId || null,
    mecanicoOrigemId: payload.mecanicoOrigemId || null,
    mecanicoExecucaoId: payload.mecanicoExecucaoId || payload.mecanicoOrigemId || null,
    motivoRetrabalho: payload.motivoRetrabalho || '',
    causaRaiz,
    estornarComissao,
    valorMaoObraAfetada,
    horasRetrabalhoEstimadas: horasRetrabalho,
    competencia,
    statusEstorno: 'pendente',
    timestamp: payload.timestamp || new Date().toISOString()
  };

  if (!Array.isArray(state.reworkRecords)) {
    state.reworkRecords = [];
  }
  state.reworkRecords.push(ocorrencia);

  if (Array.isArray(state.auditoria)) {
    state.auditoria.push({
      id: `aud_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      tipo: 'abertura_garantia_retrabalho',
      osOrigemId: osOrigem.id,
      osRetrabalhoId: novaOS.id,
      mecanicoOrigemId: ocorrencia.mecanicoOrigemId,
      estornarComissao,
      timestamp: ocorrencia.timestamp
    });
  }

  return {
    ok: true,
    novaOS,
    ocorrencia
  };
}

function listarOcorrenciasRetrabalho(state, filtros = {}) {
  if (!state || !Array.isArray(state.reworkRecords)) {
    return [];
  }

  let lista = [...state.reworkRecords];

  if (filtros.tenantId) {
    lista = lista.filter(r => r.tenantId === filtros.tenantId);
  }
  if (filtros.mecanicoOrigemId) {
    lista = lista.filter(r => r.mecanicoOrigemId === filtros.mecanicoOrigemId);
  }
  if (filtros.competencia) {
    lista = lista.filter(r => r.competencia === filtros.competencia);
  }
  if (filtros.statusEstorno) {
    lista = lista.filter(r => r.statusEstorno === filtros.statusEstorno);
  }
  if (filtros.osOrigemId) {
    lista = lista.filter(r => r.osOrigemId === filtros.osOrigemId);
  }

  return lista;
}

module.exports = {
  validarLiberacaoQualidadeOS,
  registrarInspecaoQualidadeOS,
  abrirOSGarantiaRetrabalho,
  listarOcorrenciasRetrabalho
};

