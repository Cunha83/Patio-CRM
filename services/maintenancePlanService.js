'use strict';

const crypto = require('crypto');

function gerarId(prefix = 'pln') {
  return `${prefix}_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
}

function normalizarData(dt) {
  if (!dt) return null;
  if (dt instanceof Date) return dt.toISOString().slice(0, 10);
  const s = String(dt).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  if (/^\d{2}\/\d{2}\/\d{4}/.test(s)) {
    const [d, m, y] = s.slice(0, 10).split('/');
    return `${y}-${m}-${d}`;
  }
  return s.slice(0, 10);
}

function adicionarDias(dataISO, dias) {
  const d = new Date(dataISO + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

function calcularDiferencaDias(data1ISO, data2ISO) {
  const d1 = new Date(data1ISO + 'T12:00:00Z');
  const d2 = new Date(data2ISO + 'T12:00:00Z');
  return Math.round((d1.getTime() - d2.getTime()) / (1000 * 60 * 60 * 24));
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
 * Avalia o status determinístico de um item de manutenção.
 */
function calcularStatusItem({ item, kmAtual, dataReferencia, config = {} }) {
  const alertaKmPercentual = (item.alertaKmPercentual != null)
    ? Number(item.alertaKmPercentual)
    : (config.alertaKmPercentual != null ? Number(config.alertaKmPercentual) : 10);

  const alertaDias = (item.alertaDias != null)
    ? Number(item.alertaDias)
    : (config.alertaDias != null ? Number(config.alertaDias) : 15);

  const alertaKmFixo = (item.alertaKm != null)
    ? Number(item.alertaKm)
    : (config.alertaKm != null ? Number(config.alertaKm) : null);

  const hoje = normalizarData(dataReferencia) || new Date().toISOString().slice(0, 10);

  const temKm = item.intervalKm != null && item.intervalKm > 0;
  const temTempo = item.intervalDays != null && item.intervalDays > 0;

  let statusKm = null;
  let kmRestante = null;

  if (temKm) {
    const lastKm = Number(item.lastServiceKm) || 0;
    const nextKm = item.nextDueKm != null ? Number(item.nextDueKm) : lastKm + Number(item.intervalKm);
    item.nextDueKm = nextKm;

    if (kmAtual == null || kmAtual === 0) {
      statusKm = 'aguardando_km';
    } else {
      kmRestante = nextKm - Number(kmAtual);
      const margemAlertaKm = (alertaKmFixo != null)
        ? alertaKmFixo
        : Number(item.intervalKm) * (alertaKmPercentual / 100);

      if (kmRestante <= 0) {
        statusKm = 'vencido';
      } else if (kmRestante <= margemAlertaKm) {
        statusKm = 'proximo';
      } else {
        statusKm = 'em_dia';
      }
    }
  }

  let statusTempo = null;
  let diasRestantes = null;

  if (temTempo) {
    const lastDate = normalizarData(item.lastServiceDate) || hoje;
    const nextDate = item.nextDueDate ? normalizarData(item.nextDueDate) : adicionarDias(lastDate, Number(item.intervalDays));
    item.nextDueDate = nextDate;

    diasRestantes = calcularDiferencaDias(nextDate, hoje);

    if (diasRestantes <= 0) {
      statusTempo = 'vencido';
    } else if (diasRestantes <= alertaDias) {
      statusTempo = 'proximo';
    } else {
      statusTempo = 'em_dia';
    }
  }

  // Determinação consolidada
  let statusFinal = 'em_dia';
  const mode = item.mode || 'or'; // 'or' | 'and' | 'km' | 'days'

  if (mode === 'km') {
    statusFinal = statusKm || 'em_dia';
  } else if (mode === 'days') {
    statusFinal = statusTempo || 'em_dia';
  } else if (mode === 'and') {
    if (statusKm === 'vencido' && statusTempo === 'vencido') statusFinal = 'vencido';
    else if (statusKm === 'proximo' || statusTempo === 'proximo') statusFinal = 'proximo';
    else if (statusKm === 'aguardando_km') statusFinal = 'aguardando_km';
    else statusFinal = 'em_dia';
  } else {
    // Modo padrão 'or' (vence pelo que chegar primeiro)
    if (statusKm === 'vencido' || statusTempo === 'vencido') {
      statusFinal = 'vencido';
    } else if (statusKm === 'proximo' || statusTempo === 'proximo') {
      statusFinal = 'proximo';
    } else if (statusKm === 'aguardando_km') {
      statusFinal = 'aguardando_km';
    } else {
      statusFinal = 'em_dia';
    }
  }

  // Preserva estados manuais/externos se já definidos
  if (['agendado', 'realizado', 'ignorado'].includes(item.status)) {
    statusFinal = item.status;
  }

  return {
    status: statusFinal,
    statusKm,
    statusTempo,
    kmRestante,
    diasRestantes,
    nextDueKm: item.nextDueKm,
    nextDueDate: item.nextDueDate
  };
}

function criarPlano({ tenantId, state, name, vehicleId, fleetId, items = [], origin = 'manual', active = true, actorId = 'sistema' }) {
  if (!tenantId) throw new Error('tenantId é obrigatório para criar plano de manutenção.');
  if (!name || String(name).trim().length < 2) throw new Error('Nome do plano é obrigatório.');
  if (!vehicleId && !fleetId) throw new Error('O plano deve estar vinculado a um veículo ou a uma frota.');

  if (!state.maintenancePlans) state.maintenancePlans = [];

  const planoId = gerarId('pln');
  const agora = new Date().toISOString();

  const veiculo = vehicleId ? (state.veiculos || []).find(v => v.id === vehicleId) : null;
  const kmAtual = veiculo ? Number(veiculo.km) || 0 : 0;

  const itensFormatados = items.map(it => {
    const lastDate = normalizarData(it.lastServiceDate) || agora.slice(0, 10);
    const lastKm = Number(it.lastServiceKm) != null ? Number(it.lastServiceKm) : kmAtual;
    const intervalDays = it.intervalDays != null ? Number(it.intervalDays) : null;
    const intervalKm = it.intervalKm != null ? Number(it.intervalKm) : null;

    const nextDueDate = intervalDays ? adicionarDias(lastDate, intervalDays) : (it.nextDueDate || null);
    const nextDueKm = intervalKm ? lastKm + intervalKm : (it.nextDueKm || null);

    const itemObj = {
      id: it.id || gerarId('item'),
      serviceCatalogId: it.serviceCatalogId || null,
      description: it.description || it.nome || 'Item de Manutenção',
      intervalKm,
      intervalDays,
      mode: it.mode || 'or',
      lastServiceDate: lastDate,
      lastServiceKm: lastKm,
      nextDueDate,
      nextDueKm,
      status: it.status || 'em_dia'
    };

    const st = calcularStatusItem({ item: itemObj, kmAtual, dataReferencia: agora.slice(0, 10), config: state?.cfg?.crm });
    itemObj.status = st.status;
    return itemObj;
  });

  const novoPlano = {
    id: planoId,
    tenantId,
    name: String(name).trim(),
    vehicleId: vehicleId || null,
    fleetId: fleetId || null,
    items: itensFormatados,
    origin,
    active: Boolean(active),
    createdAt: agora,
    updatedAt: agora
  };

  state.maintenancePlans.push(novoPlano);

  registrarAuditoria(state, {
    action: 'maintenance_plan_created',
    actorId,
    resourceId: planoId,
    tenantId,
    details: { name: novoPlano.name, vehicleId, fleetId, totalItens: itensFormatados.length }
  });

  return { ok: true, plano: novoPlano };
}

function listarPlanos({ tenantId, state, vehicleId, fleetId }) {
  if (!tenantId) return [];
  const planos = (state.maintenancePlans || []).filter(p => p.tenantId === tenantId);
  if (vehicleId) return planos.filter(p => p.vehicleId === vehicleId);
  if (fleetId) return planos.filter(p => p.fleetId === fleetId);
  return planos;
}

function obterPlano({ tenantId, state, planId }) {
  if (!tenantId || !planId) return null;
  return (state.maintenancePlans || []).find(p => p.tenantId === tenantId && p.id === planId) || null;
}

/**
 * Avalia vencimentos em lote para o tenant, veículo ou frota.
 */
function avaliarVencimentos({ tenantId, state, vehicleId = null, fleetId = null, dataReferencia = null }) {
  if (!tenantId || !state) {
    return { totalPlanos: 0, totalItens: 0, emDia: 0, proximos: 0, vencidos: 0, aguardandoKm: 0, itens: [] };
  }

  const veiculos = Array.isArray(state.veiculos) ? state.veiculos : [];
  const frotas = Array.isArray(state.fleets) ? state.fleets : (Array.isArray(state.frotas) ? state.frotas : []);
  const planos = (state.maintenancePlans || []).filter(p => p.tenantId === tenantId && p.active !== false);

  const planosFiltrados = planos.filter(p => {
    if (vehicleId && p.vehicleId !== vehicleId) return false;
    if (fleetId && p.fleetId !== fleetId) return false;
    return true;
  });

  const config = {
    ...(state?.cfg?.crm || {}),
    ...(state?.cfg?.manutencaoPreventiva || {})
  };
  const hoje = normalizarData(dataReferencia) || new Date().toISOString().slice(0, 10);

  const itensConsolidados = [];
  let emDiaCount = 0;
  let proximoCount = 0;
  let vencidoCount = 0;
  let aguardandoKmCount = 0;

  for (const plano of planosFiltrados) {
    let veic = null;
    if (plano.vehicleId) {
      veic = veiculos.find(v => v.id === plano.vehicleId);
    }

    const kmAtual = veic ? (Number(veic.km) || 0) : null;

    for (const item of (plano.items || [])) {
      const calculo = calcularStatusItem({ item, kmAtual, dataReferencia: hoje, config });
      item.status = calculo.status;
      item.nextDueKm = calculo.nextDueKm;
      item.nextDueDate = calculo.nextDueDate;

      if (calculo.status === 'vencido') vencidoCount++;
      else if (calculo.status === 'proximo') proximoCount++;
      else if (calculo.status === 'aguardando_km') aguardandoKmCount++;
      else emDiaCount++;

      itensConsolidados.push({
        planoId: plano.id,
        planoNome: plano.name,
        itemId: item.id,
        serviceCatalogId: item.serviceCatalogId,
        descricao: item.description,
        vehicleId: plano.vehicleId,
        fleetId: plano.fleetId,
        placa: veic ? veic.placa : null,
        modelo: veic ? veic.modelo : null,
        kmAtual,
        intervalKm: item.intervalKm,
        intervalDays: item.intervalDays,
        lastServiceDate: item.lastServiceDate,
        lastServiceKm: item.lastServiceKm,
        nextDueKm: calculo.nextDueKm,
        nextDueDate: calculo.nextDueDate,
        kmRestante: calculo.kmRestante,
        diasRestantes: calculo.diasRestantes,
        status: calculo.status
      });
    }
  }

  return {
    totalPlanos: planosFiltrados.length,
    totalItens: itensConsolidados.length,
    emDia: emDiaCount,
    proximos: proximoCount,
    vencidos: vencidoCount,
    aguardandoKm: aguardandoKmCount,
    itens: itensConsolidados
  };
}

/**
 * Atualização conversacional de quilometragem com validação anti-inconsistência.
 */
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

  // Validação de coerência: se km informado for menor que o anterior
  // ou se houver queda brusca (ex: 428.000 para 42.000)
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

  // Atualização confirmada
  veiculo.km = km;
  if (!veiculo.historicoKm) veiculo.historicoKm = [];
  veiculo.historicoKm.unshift({
    data: new Date().toISOString(),
    km,
    kmAnterior,
    fonte,
    ator
  });

  // Reavalia planos vinculados ao veículo
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
