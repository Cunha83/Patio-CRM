'use strict';

/**
 * Pátio CRM — Serviço de Planos de Manutenção Preventiva
 * Fachada Modular (< 180 linhas).
 *
 * Submódulo:
 * - services/maintenance/maintenanceEvaluator.js: Cálculo determinístico de status e vencimentos
 */

const crypto = require('crypto');
const {
  normalizarData,
  adicionarDias,
  calcularDiferencaDias,
  calcularStatusItem,
  avaliarVencimentos
} = require('./maintenance/maintenanceEvaluator');

function gerarId(prefix = 'pln') {
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

function criarPlano({ tenantId, state, name, vehicleId, fleetId, items = [], origin = 'manual', active = true, actorId = 'sistema' }) {
  if (!tenantId) throw new Error('tenantId é obrigatório para criar plano de manutenção.');
  if (!name || String(name).trim().length < 2) throw new Error('Nome do plano é obrigatório.');
  if (!vehicleId && !fleetId) throw new Error('O plano deve estar vinculado a um veículo ou a uma frota.');

  if (!state.maintenancePlans) state.maintenancePlans = [];

  const planoId = gerarId('pln');
  const now = new Date().toISOString();

  const itensFormatados = (items || []).map(it => {
    const lastDate = normalizarData(it.lastServiceDate) || now.slice(0, 10);
    const lastKm = Number(it.lastServiceKm) || 0;
    const intervalKm = it.intervalKm ? Number(it.intervalKm) : null;
    const intervalDays = it.intervalDays ? Number(it.intervalDays) : null;

    let nextDueKm = it.nextDueKm ? Number(it.nextDueKm) : (intervalKm ? lastKm + intervalKm : null);
    let nextDueDate = it.nextDueDate ? normalizarData(it.nextDueDate) : (intervalDays ? adicionarDias(lastDate, intervalDays) : null);

    return {
      id: it.id || gerarId('item'),
      serviceCatalogId: it.serviceCatalogId || null,
      description: String(it.description || it.descricao || 'Item de Manutenção').trim(),
      intervalKm,
      intervalDays,
      lastServiceKm: lastKm,
      lastServiceDate: lastDate,
      nextDueKm,
      nextDueDate,
      mode: it.mode || 'or',
      alertaKmPercentual: it.alertaKmPercentual != null ? Number(it.alertaKmPercentual) : null,
      alertaKm: it.alertaKm != null ? Number(it.alertaKm) : null,
      alertaDias: it.alertaDias != null ? Number(it.alertaDias) : null,
      status: 'em_dia'
    };
  });

  const novoPlano = {
    id: planoId,
    tenantId,
    name: String(name).trim(),
    vehicleId: vehicleId || null,
    fleetId: fleetId || null,
    origin,
    active: active !== false,
    createdAt: now,
    updatedAt: now,
    items: itensFormatados
  };

  state.maintenancePlans.push(novoPlano);

  registrarAuditoria(state, {
    action: 'maintenance_plan_created',
    actorId,
    resourceId: planoId,
    tenantId,
    details: { name: novoPlano.name, vehicleId, fleetId, itemsCount: itensFormatados.length }
  });

  return novoPlano;
}

function listarPlanos({ tenantId, state, vehicleId = null, fleetId = null, activeOnly = true }) {
  if (!state || !state.maintenancePlans) return [];
  return state.maintenancePlans.filter(p => {
    if (p.tenantId !== tenantId) return false;
    if (activeOnly && p.active === false) return false;
    if (vehicleId && p.vehicleId !== vehicleId) return false;
    if (fleetId && p.fleetId !== fleetId) return false;
    return true;
  });
}

function obterPlano({ tenantId, state, planId }) {
  if (!state || !state.maintenancePlans) return null;
  return state.maintenancePlans.find(p => p.id === planId && p.tenantId === tenantId) || null;
}

function atualizarKmVeiculo({ tenantId, state, vehicleId, placa, kmInformado, fonte = 'whatsapp_cliente', ator = 'cliente', permitirOverride = false }) {
  if (!tenantId || !state) throw new Error('Parâmetros tenantId e state são obrigatórios.');

  const km = Number(kmInformado);
  if (isNaN(km) || km < 0) {
    return { ok: false, error: 'Quilometragem informada inválida.' };
  }

  const veiculos = Array.isArray(state.veiculos) ? state.veiculos : [];
  let veiculo = null;
  if (vehicleId) {
    veiculo = veiculos.find(v => v.id === vehicleId);
  } else if (placa) {
    const limpa = String(placa).toUpperCase().replace(/[^A-Z0-9]/g, '');
    veiculo = veiculos.find(v => v.placa && v.placa.toUpperCase().replace(/[^A-Z0-9]/g, '') === limpa);
  }

  if (!veiculo) {
    return { ok: false, error: 'Veículo não localizado para atualização de quilometragem.' };
  }

  const kmAnterior = Number(veiculo.km) || 0;

  if (!permitirOverride && kmAnterior > 0 && km < kmAnterior) {
    const variacaoQueda = ((kmAnterior - km) / kmAnterior) * 100;
    return {
      ok: false,
      requerConfirmacao: true,
      incoerente: true,
      kmAnterior,
      kmInformado: km,
      motivo: `Quilometragem informada (${km.toLocaleString('pt-BR')} km) é inferior à registrada anteriormente (${kmAnterior.toLocaleString('pt-BR')} km). Queda de ${variacaoQueda.toFixed(1)}% detectada.`,
      solicitacaoConfirmacao: `A quilometragem informada (${km.toLocaleString('pt-BR')} km) é menor que a anterior (${kmAnterior.toLocaleString('pt-BR')} km). Por favor, confirme se o valor está correto.`
    };
  }

  veiculo.km = km;
  if (!veiculo.historicoKm) veiculo.historicoKm = [];
  veiculo.historicoKm.unshift({
    data: new Date().toISOString(),
    km,
    kmAnterior,
    fonte,
    ator
  });

  avaliarVencimentos({ tenantId, state, vehicleId: veiculo.id });

  registrarAuditoria(state, {
    action: 'vehicle_km_updated',
    actorId: ator,
    resourceId: veiculo.id,
    tenantId,
    details: { placa: veiculo.placa, kmAnterior, novoKm: km, fonte }
  });

  return {
    ok: true,
    vehicleId: veiculo.id,
    placa: veiculo.placa,
    kmAnterior,
    kmAtual: km,
    fonte,
    timestamp: new Date().toISOString()
  };
}

module.exports = {
  criarPlano,
  listarPlanos,
  obterPlano,
  calcularStatusItem,
  avaliarVencimentos,
  atualizarKmVeiculo,
  normalizarData
};
