'use strict';

const crypto = require('crypto');

function gerarId(prefix = 'insp') {
  return `${prefix}_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
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

function criarInspecao({
  tenantId,
  state,
  preOSId = null,
  osId = null,
  vehicleId = null,
  placa = null,
  clienteId = null,
  mechanicId = null,
  mecanico = null,
  reclamacaoCliente = '',
  actorId = 'operador'
}) {
  if (!tenantId || typeof tenantId !== 'string') {
    throw new Error('tenantId é obrigatório para criar inspeção.');
  }
  if (!state) {
    throw new Error('Estado do tenant é obrigatório.');
  }

  state.inspections = Array.isArray(state.inspections) ? state.inspections : [];
  state.os = Array.isArray(state.os) ? state.os : [];
  state.veiculos = Array.isArray(state.veiculos) ? state.veiculos : [];

  let osVinculada = null;
  if (osId) {
    osVinculada = state.os.find(o => o.id === osId);
  }

  let vId = vehicleId || (osVinculada ? osVinculada.vei : null);
  let vPlaca = placa || (osVinculada ? osVinculada.placa : null);
  let cId = clienteId || (osVinculada ? osVinculada.cli : null);

  if (!vPlaca && vId) {
    const v = state.veiculos.find(ve => ve.id === vId);
    if (v) vPlaca = v.placa;
  }

  const novaInspecao = {
    id: gerarId('insp'),
    tenantId,
    preOSId: preOSId || null,
    osId: osId || null,
    vehicleId: vId || null,
    placa: vPlaca ? String(vPlaca).toUpperCase().replace(/[^A-Z0-9]/g, '') : null,
    clienteId: cId || null,
    mechanicId: mechanicId || null,
    mecanico: mecanico || null,
    reclamacaoCliente: reclamacaoCliente || (osVinculada ? (osVinculada.motivo || osVinculada.desc || '') : ''),
    status: 'em_inspecao',
    items: [],
    laudoGeral: '',
    criadoEm: new Date().toISOString(),
    criadoPor: actorId,
    atualizadoEm: new Date().toISOString(),
    concluidoEm: null,
    concluidoPor: null
  };

  state.inspections.unshift(novaInspecao);

  if (osVinculada) {
    osVinculada.inspectionId = novaInspecao.id;
    if (osVinculada.st === 'fila') {
      osVinculada.st = 'diagnostico';
    }
  }

  registrarAuditoria(state, {
    tenantId,
    tipo: 'inspecao_criada',
    inspectionId: novaInspecao.id,
    osId: novaInspecao.osId,
    placa: novaInspecao.placa,
    autor: actorId,
    detalhes: { reclamacaoCliente: novaInspecao.reclamacaoCliente }
  });

  return { ok: true, inspection: novaInspecao };
}

function obterInspecao({ tenantId, state, inspectionId }) {
  if (!tenantId || !state || !inspectionId) return null;
  const inspections = Array.isArray(state.inspections) ? state.inspections : [];
  const inspecao = inspections.find(i => i.id === inspectionId && i.tenantId === tenantId);
  return inspecao || null;
}

function listarInspecoes({ tenantId, state, osId = null, vehicleId = null, placa = null, status = null }) {
  if (!tenantId || !state) return [];
  const inspections = Array.isArray(state.inspections) ? state.inspections : [];
  return inspections.filter(i => {
    if (i.tenantId !== tenantId) return false;
    if (osId && i.osId !== osId) return false;
    if (vehicleId && i.vehicleId !== vehicleId) return false;
    if (status && i.status !== status) return false;
    if (placa) {
      const pNorm = String(placa).toUpperCase().replace(/[^A-Z0-9]/g, '');
      const iPlaca = String(i.placa || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (iPlaca !== pNorm) return false;
    }
    return true;
  });
}

function concluirInspecao({
  tenantId,
  state,
  inspectionId,
  laudoGeral = '',
  actorId = 'operador'
}) {
  const inspecao = obterInspecao({ tenantId, state, inspectionId });
  if (!inspecao) {
    return { ok: false, error: 'Inspeção não encontrada.', status: 404 };
  }

  inspecao.status = 'concluida';
  inspecao.laudoGeral = String(laudoGeral || inspecao.laudoGeral || '').trim();
  inspecao.concluidoEm = new Date().toISOString();
  inspecao.concluidoPor = actorId;
  inspecao.atualizadoEm = new Date().toISOString();

  if (inspecao.osId) {
    const os = state.os.find(o => o.id === inspecao.osId);
    if (os && (os.st === 'diagnostico' || os.st === 'fila')) {
      os.st = 'aprovacao';
    }
  }

  registrarAuditoria(state, {
    tenantId,
    tipo: 'inspecao_concluida',
    inspectionId: inspecao.id,
    osId: inspecao.osId,
    totalItens: inspecao.items.length,
    autor: actorId
  });

  return { ok: true, inspection: inspecao };
}

function cancelarInspecao({
  tenantId,
  state,
  inspectionId,
  motivo = '',
  actorId = 'operador'
}) {
  const inspecao = obterInspecao({ tenantId, state, inspectionId });
  if (!inspecao) {
    return { ok: false, error: 'Inspeção não encontrada.', status: 404 };
  }

  inspecao.status = 'cancelada';
  inspecao.motivoCancelamento = String(motivo || 'Cancelada pelo operador').trim();
  inspecao.atualizadoEm = new Date().toISOString();

  registrarAuditoria(state, {
    tenantId,
    tipo: 'inspecao_cancelada',
    inspectionId: inspecao.id,
    motivo: inspecao.motivoCancelamento,
    autor: actorId
  });

  return { ok: true, inspection: inspecao };
}

module.exports = {
  gerarId,
  registrarAuditoria,
  criarInspecao,
  obterInspecao,
  listarInspecoes,
  concluirInspecao,
  cancelarInspecao
};
