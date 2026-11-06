'use strict';

const costingService = require('../costingService');
const { arredondar } = require('./pricingCore');
const {
  filtrarPorPeriodo,
  obterRentabilidadeServicos
} = require('./pricingProfitability');

/**
 * Rentabilidade agrupada por Categoria de Serviço (suspensao, freios, etc.)
 */
function obterRentabilidadeCategorias({ tenantId, state, periodo = '30d' }) {
  const servicos = obterRentabilidadeServicos({ tenantId, state, periodo, limite: 1000 });
  const catMap = new Map();

  for (const s of servicos) {
    const cat = String(s.categoria || 'Geral').toUpperCase().trim();
    if (!catMap.has(cat)) {
      catMap.set(cat, {
        categoria: cat,
        totalServicos: 0,
        receita: 0,
        custoTotal: 0,
        horasProdutivas: 0
      });
    }
    const cItem = catMap.get(cat);
    cItem.totalServicos += s.quantidadeExecucoes;
    cItem.receita += s.receita;
    cItem.custoTotal += s.custoTotal;
    cItem.horasProdutivas += s.horasProdutivas;
  }

  return Array.from(catMap.values()).map(c => {
    const rec = arredondar(c.receita);
    const cus = arredondar(c.custoTotal);
    const margemBruta = arredondar(rec - cus);
    const margemPercentual = rec > 0 ? arredondar((margemBruta / rec) * 100, 1) : 0;
    const ticketMedio = c.totalServicos > 0 ? arredondar(rec / c.totalServicos) : 0;

    return {
      categoria: c.categoria,
      totalServicos: c.totalServicos,
      receita: rec,
      custoTotal: cus,
      margemBruta,
      margemPercentual,
      horasProdutivas: arredondar(c.horasProdutivas, 2),
      ticketMedio
    };
  }).sort((a, b) => b.receita - a.receita);
}

/**
 * Rentabilidade consolidada por Cliente / Frotista
 */
function obterRentabilidadeClientes({ tenantId, state, periodo = '30d', limite = 50 }) {
  if (!state) return [];
  const clientesMap = new Map();
  const osTenant = (state.os || []).filter(o => (o.tenantId === tenantId || !o.tenantId) && o.st !== 'cancelada');
  const osFiltradas = filtrarPorPeriodo(osTenant, periodo);

  for (const os of osFiltradas) {
    const cliId = os.cli || 'cli_geral';
    const cliObj = (state.clientes || []).find(c => c.id === cliId);
    const nome = cliObj?.nome || 'Cliente';

    if (!clientesMap.has(cliId)) {
      clientesMap.set(cliId, {
        clienteId: cliId,
        clienteNome: nome,
        totalOS: 0,
        receita: 0,
        custoReal: 0
      });
    }

    try {
      const apuracao = costingService.calcularCustoRealOS({ tenantId, state, osId: os.id });
      if (apuracao) {
        const item = clientesMap.get(cliId);
        item.totalOS++;
        item.receita += apuracao.receitaAutorizada;
        item.custoReal += apuracao.custoRealOS;
      }
    } catch (_) {}
  }

  return Array.from(clientesMap.values()).map(it => {
    const rec = arredondar(it.receita);
    const cus = arredondar(it.custoReal);
    const margemBruta = arredondar(rec - cus);
    const margemPercentual = rec > 0 ? arredondar((margemBruta / rec) * 100, 1) : 0;
    const ticketMedio = it.totalOS > 0 ? arredondar(rec / it.totalOS) : 0;

    return {
      clienteId: it.clienteId,
      clienteNome: it.clienteNome,
      totalOS: it.totalOS,
      receita: rec,
      custoReal: cus,
      margemBruta,
      margemPercentual,
      ticketMedio
    };
  }).sort((a, b) => b.receita - a.receita).slice(0, limite);
}

/**
 * Rentabilidade por Veículo / Frota
 */
function obterRentabilidadeVeiculos({ tenantId, state, periodo = '30d', limite = 50 }) {
  if (!state) return [];
  const veiculosMap = new Map();
  const osTenant = (state.os || []).filter(o => (o.tenantId === tenantId || !o.tenantId) && o.st !== 'cancelada');
  const osFiltradas = filtrarPorPeriodo(osTenant, periodo);

  for (const os of osFiltradas) {
    const veiId = os.vei || 'vei_geral';
    const veiObj = (state.veiculos || []).find(v => v.id === veiId);
    const placa = veiObj?.placa || os.placa || 'SEM PLACA';
    const cliObj = (state.clientes || []).find(c => c.id === (veiObj?.cli || os.cli));

    if (!veiculosMap.has(veiId)) {
      veiculosMap.set(veiId, {
        vehicleId: veiId,
        placa,
        modelo: veiObj?.modelo || 'Caminhão',
        clienteNome: cliObj?.nome || 'Cliente',
        totalOS: 0,
        receita: 0,
        custoReal: 0
      });
    }

    try {
      const apuracao = costingService.calcularCustoRealOS({ tenantId, state, osId: os.id });
      if (apuracao) {
        const item = veiculosMap.get(veiId);
        item.totalOS++;
        item.receita += apuracao.receitaAutorizada;
        item.custoReal += apuracao.custoRealOS;
      }
    } catch (_) {}
  }

  return Array.from(veiculosMap.values()).map(it => {
    const rec = arredondar(it.receita);
    const cus = arredondar(it.custoReal);
    const margemBruta = arredondar(rec - cus);
    const margemPercentual = rec > 0 ? arredondar((margemBruta / rec) * 100, 1) : 0;

    return {
      vehicleId: it.vehicleId,
      placa: it.placa,
      modelo: it.modelo,
      clienteNome: it.clienteNome,
      totalOS: it.totalOS,
      receita: rec,
      custoReal: cus,
      margemBruta,
      margemPercentual
    };
  }).sort((a, b) => b.receita - a.receita).slice(0, limite);
}

module.exports = {
  obterRentabilidadeCategorias,
  obterRentabilidadeClientes,
  obterRentabilidadeVeiculos
};

