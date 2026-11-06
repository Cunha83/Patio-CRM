'use strict';

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

  let statusFinal = 'em_dia';
  const mode = item.mode || 'or';

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

function avaliarVencimentos({ tenantId, state, vehicleId = null, fleetId = null, dataReferencia = null }) {
  if (!tenantId || !state) throw new Error('Parâmetros tenantId e state são obrigatórios.');

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

module.exports = {
  normalizarData,
  adicionarDias,
  calcularDiferencaDias,
  calcularStatusItem,
  avaliarVencimentos
};

