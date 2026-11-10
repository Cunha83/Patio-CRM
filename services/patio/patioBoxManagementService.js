'use strict';

/**
 * services/patio/patioBoxManagementService.js
 * 
 * Gestão de Boxes Físicos de Linha Pesada, Ocupação, Anti-Colisão,
 * Transferência Atômica entre Postos e Liberação com Gate de Qualidade.
 * 
 * Arquitetura: <= 350 linhas
 */

function criarErro(code, message) {
  const err = new Error(`${code}: ${message}`);
  err.code = code;
  return err;
}

function registrarAuditoria(state, tipo, dados) {
  if (Array.isArray(state.auditoria)) {
    state.auditoria.push({
      id: `aud_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      tipo,
      ...dados
    });
  }
}

function garantirColecoes(state) {
  if (!state) throw new Error('Estado é obrigatório');
  if (!Array.isArray(state.patioBoxes)) state.patioBoxes = [];
  if (!Array.isArray(state.boxAllocations)) state.boxAllocations = [];
  if (!Array.isArray(state.patioBottlenecks)) state.patioBottlenecks = [];
  if (!Array.isArray(state.os)) state.os = Array.isArray(state.serviceOrders) ? state.serviceOrders : [];
  if (!Array.isArray(state.auditoria)) state.auditoria = [];
}

function cadastrarBoxPatio(state, payload = {}) {
  garantirColecoes(state);
  const codigo = String(payload.codigo || '').trim().toUpperCase();
  if (!codigo) throw new Error('Código do box é obrigatório');

  const tenantId = payload.tenantId || 'default';
  if (state.patioBoxes.some(b => (!tenantId || !b.tenantId || b.tenantId === tenantId) && b.codigo === codigo)) {
    throw criarErro('BOX_CODE_ALREADY_EXISTS', `Box com código "${codigo}" já cadastrado para o tenant`);
  }

  const box = {
    id: `box_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    tenantId,
    codigo,
    nome: String(payload.nome || codigo).trim(),
    tipoBox: payload.tipoBox || 'pesado_mola',
    capacidadeToneladas: Number(payload.capacidadeToneladas) || 40,
    recursos: Array.isArray(payload.recursos) ? payload.recursos : [],
    status: 'livre',
    osAtualId: null,
    placaAtual: null,
    clienteNome: null,
    mecanicoResponsavelId: null,
    ocupadoDesde: null,
    gargaloAtivoId: null,
    criadoEm: payload.timestamp || new Date().toISOString()
  };

  state.patioBoxes.push(box);
  registrarAuditoria(state, 'cadastrar_box_patio', { boxId: box.id, codigo: box.codigo, timestamp: box.criadoEm });
  return { ok: true, box };
}

function alocarVeiculoBox(state, {
  tenantId = 'default',
  boxId,
  osId,
  mecanicoResponsavelId = null,
  timestamp = null
} = {}) {
  garantirColecoes(state);
  const box = state.patioBoxes.find(b => b.id === boxId || b.codigo === boxId);
  if (!box) throw criarErro('BOX_NOT_FOUND', `Box "${boxId}" não encontrado`);

  const os = state.os.find(o => o.id === osId || String(o.num) === String(osId));
  if (!os) throw criarErro('OS_NOT_FOUND', `OS "${osId}" não encontrada`);

  if (box.status !== 'livre') {
    throw criarErro('BOX_ALREADY_OCCUPIED', `O box "${box.codigo}" já está ocupado ou bloqueado (status: ${box.status})`);
  }

  const alocAtiva = state.boxAllocations.find(a => a.osId === os.id && a.status === 'ativa');
  if (os.boxAtualId || alocAtiva) {
    throw criarErro('OS_ALREADY_ALLOCATED_IN_BOX', `O veículo/OS já está alocado no box "${os.boxAtualId || alocAtiva.boxId}". Utilize transferirVeiculoBox.`);
  }

  const dataEntrada = timestamp || new Date().toISOString();
  box.status = 'ocupado';
  box.osAtualId = os.id;
  box.placaAtual = os.placa || os.veiculoPlaca || '';
  box.clienteNome = os.clienteNome || '';
  box.mecanicoResponsavelId = mecanicoResponsavelId;
  box.ocupadoDesde = dataEntrada;
  box.gargaloAtivoId = null;
  os.boxAtualId = box.id;

  const alocacao = {
    id: `aloc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    tenantId: tenantId || box.tenantId || 'default',
    boxId: box.id,
    boxCodigo: box.codigo,
    osId: os.id,
    osNum: os.num || os.id,
    placa: box.placaAtual,
    clienteNome: box.clienteNome,
    mecanicoResponsavelId,
    entradaEm: dataEntrada,
    saidaEm: null,
    tempoOcupacaoMinutos: 0,
    status: 'ativa',
    motivoTransferencia: null
  };
  state.boxAllocations.push(alocacao);
  registrarAuditoria(state, 'alocar_veiculo_box', { boxId: box.id, osId: os.id, placa: box.placaAtual, timestamp: dataEntrada });

  return { ok: true, box, alocacao };
}

function transferirVeiculoBox(state, {
  tenantId = 'default',
  osId,
  boxDestinoId,
  motivo = 'Transferência operacional de box',
  timestamp = null
} = {}) {
  garantirColecoes(state);
  const alocAtiva = state.boxAllocations.find(a => a.osId === osId && a.status === 'ativa');
  if (!alocAtiva) throw criarErro('ACTIVE_ALLOCATION_NOT_FOUND', `Nenhuma alocação ativa encontrada para a OS "${osId}"`);

  const boxOrigem = state.patioBoxes.find(b => b.id === alocAtiva.boxId);
  const boxDestino = state.patioBoxes.find(b => b.id === boxDestinoId || b.codigo === boxDestinoId);
  if (!boxDestino) throw criarErro('BOX_DESTINO_NOT_FOUND', `Box destino "${boxDestinoId}" não encontrado`);
  if (boxDestino.status !== 'livre') {
    throw criarErro('BOX_ALREADY_OCCUPIED', `Box destino "${boxDestino.codigo}" não está livre (status: ${boxDestino.status})`);
  }

  const dataMudanca = timestamp || new Date().toISOString();
  alocAtiva.saidaEm = dataMudanca;
  alocAtiva.tempoOcupacaoMinutos = Math.max(0, Math.round((new Date(dataMudanca) - new Date(alocAtiva.entradaEm)) / 60000));
  alocAtiva.status = 'finalizada';

  if (boxOrigem) {
    boxOrigem.status = 'livre';
    boxOrigem.osAtualId = null;
    boxOrigem.placaAtual = null;
    boxOrigem.clienteNome = null;
    boxOrigem.mecanicoResponsavelId = null;
    boxOrigem.ocupadoDesde = null;
    boxOrigem.gargaloAtivoId = null;
  }

  const os = state.os.find(o => o.id === osId);
  boxDestino.status = 'ocupado';
  boxDestino.osAtualId = osId;
  boxDestino.placaAtual = os ? (os.placa || os.veiculoPlaca) : alocAtiva.placa;
  boxDestino.clienteNome = os ? os.clienteNome : alocAtiva.clienteNome;
  boxDestino.mecanicoResponsavelId = alocAtiva.mecanicoResponsavelId;
  boxDestino.ocupadoDesde = dataMudanca;
  boxDestino.gargaloAtivoId = null;
  if (os) os.boxAtualId = boxDestino.id;

  const alocDestino = {
    id: `aloc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    tenantId: tenantId || boxDestino.tenantId || 'default',
    boxId: boxDestino.id,
    boxCodigo: boxDestino.codigo,
    osId,
    osNum: os ? (os.num || os.id) : alocAtiva.osNum,
    placa: boxDestino.placaAtual,
    clienteNome: boxDestino.clienteNome,
    mecanicoResponsavelId: boxDestino.mecanicoResponsavelId,
    entradaEm: dataMudanca,
    saidaEm: null,
    tempoOcupacaoMinutos: 0,
    status: 'ativa',
    motivoTransferencia: motivo
  };
  state.boxAllocations.push(alocDestino);
  registrarAuditoria(state, 'transferir_veiculo_box', { boxOrigemId: boxOrigem?.id, boxDestinoId: boxDestino.id, osId, motivo, timestamp: dataMudanca });

  return { ok: true, boxOrigem, boxDestino, alocacaoOrigem: alocAtiva, alocacaoDestino: alocDestino };
}

function liberarBoxPatio(state, {
  tenantId = 'default',
  boxId = null,
  osId = null,
  exigirInspecaoQualidade = false,
  timestamp = null
} = {}) {
  garantirColecoes(state);
  const box = state.patioBoxes.find(b => (boxId && (b.id === boxId || b.codigo === boxId)) || (osId && b.osAtualId === osId));
  if (!box) throw criarErro('BOX_NOT_FOUND', `Box não localizado para liberação`);

  const alvoOsId = osId || box.osAtualId;
  const os = alvoOsId ? state.os.find(o => o.id === alvoOsId || String(o.num) === String(alvoOsId)) : null;

  if (exigirInspecaoQualidade) {
    if (!os || !os.inspecaoQualidade || os.inspecaoQualidade.status !== 'aprovada' || !os.inspecaoQualidade.aprovado) {
      throw criarErro('QUALITY_INSPECTION_REQUIRED_OR_FAILED', 'inspeção de qualidade pré-entrega obrigatória não realizada ou não foi aprovada');
    }
  }

  const agora = timestamp || new Date().toISOString();
  let tempoOcupacaoMinutos = 0;
  const alocAtiva = state.boxAllocations.find(a => a.boxId === box.id && (alvoOsId ? a.osId === alvoOsId : true) && a.status === 'ativa');

  if (alocAtiva) {
    tempoOcupacaoMinutos = Math.max(0, Math.round((new Date(agora) - new Date(alocAtiva.entradaEm)) / 60000));
    alocAtiva.saidaEm = agora;
    alocAtiva.tempoOcupacaoMinutos = tempoOcupacaoMinutos;
    alocAtiva.status = 'finalizada';
  }

  // Encerrar eventuais gargalos ativos vinculados a este box/OS
  for (const g of state.patioBottlenecks) {
    if (g.status === 'aberto' && (g.boxId === box.id || (alvoOsId && g.osId === alvoOsId))) {
      g.status = 'encerrado';
      g.fimParadaEm = agora;
      g.tempoParadoMinutos = Math.max(0, Math.round((new Date(agora) - new Date(g.inicioParadaEm)) / 60000));
      g.estourouSla = g.tempoParadoMinutos > (Number(g.slaMaximoMinutos) || 60);
      g.resolucao = 'Encerrado por liberação de box';
    }
  }

  box.status = 'livre';
  box.osAtualId = null;
  box.placaAtual = null;
  box.clienteNome = null;
  box.mecanicoResponsavelId = null;
  box.ocupadoDesde = null;
  box.gargaloAtivoId = null;
  if (os) os.boxAtualId = null;

  registrarAuditoria(state, 'liberar_box_patio', { boxId: box.id, osId: alvoOsId, tempoOcupacaoMinutos, timestamp: agora });
  return { ok: true, box, tempoOcupacaoMinutos };
}

function listarMapaBoxesPatio(state, filtros = {}) {
  if (!state || !Array.isArray(state.patioBoxes)) return [];
  let boxes = [...state.patioBoxes];
  if (filtros.tenantId) boxes = boxes.filter(b => !b.tenantId || b.tenantId === filtros.tenantId);
  if (filtros.tipoBox) boxes = boxes.filter(b => b.tipoBox === filtros.tipoBox);
  if (filtros.status) boxes = boxes.filter(b => b.status === filtros.status);

  const agora = new Date(filtros.timestampReferencia || new Date().toISOString()).getTime();
  return boxes.map(b => {
    let tempoOcupadoAtualMinutos = 0;
    if (b.status !== 'livre' && b.ocupadoDesde) {
      tempoOcupadoAtualMinutos = Math.max(0, Math.round((agora - new Date(b.ocupadoDesde).getTime()) / 60000));
    }
    const gargaloAtivo = (b.gargaloAtivoId && Array.isArray(state.patioBottlenecks))
      ? state.patioBottlenecks.find(g => g.id === b.gargaloAtivoId && g.status === 'aberto') || null
      : null;

    return { ...b, tempoOcupadoAtualMinutos, gargaloAtivo };
  });
}

module.exports = {
  cadastrarBoxPatio,
  alocarVeiculoBox,
  transferirVeiculoBox,
  liberarBoxPatio,
  listarMapaBoxesPatio
};
