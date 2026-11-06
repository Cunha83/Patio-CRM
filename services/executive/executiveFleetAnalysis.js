'use strict';

const maintenancePlanService = require('../maintenancePlanService');
const { arredondar, formatarMoeda, hojeISO } = require('./executiveHelpers');

/**
 * 3. INTELIGÊNCIA COMERCIAL E RETENÇÃO DE FROTAS
 */
function analisarRetencaoECobranca(state = {}, options = {}) {
  const tenantId = options.tenantId || state.tenantId || 'default';
  const dataHoje = options.dataReferencia || hojeISO();

  const clientes = Array.isArray(state.clientes)
    ? state.clientes.filter(c => !c.tenantId || c.tenantId === tenantId)
    : [];

  const veiculos = Array.isArray(state.veiculos)
    ? state.veiculos.filter(v => !v.tenantId || v.tenantId === tenantId)
    : [];

  const osList = Array.isArray(state.os)
    ? state.os.filter(o => !o.tenantId || o.tenantId === tenantId)
    : [];

  const contas = Array.isArray(state.contas)
    ? state.contas.filter(c => (!c.tenantId || c.tenantId === tenantId) && c.tipo === 'receber' && !c.pago)
    : [];

  const frotasMap = new Map();

  for (const os of osList) {
    const nomeCliente = String(os.cli || os.clienteNome || 'Cliente não identificado').trim();
    if (!frotasMap.has(nomeCliente)) {
      frotasMap.set(nomeCliente, {
        clienteNome: nomeCliente,
        clienteId: os.clienteId || null,
        totalOS: 0,
        osFinalizadas: 0,
        osAtivas: 0,
        faturamentoTotal: 0,
        veiculosSet: new Set(),
        ultimaOSData: null
      });
    }

    const reg = frotasMap.get(nomeCliente);
    reg.totalOS++;
    const valorOS = Number(os.total || os.valorTotal) || 0;
    reg.faturamentoTotal += valorOS;

    if (os.vei || os.placa) {
      reg.veiculosSet.add(os.vei || os.placa);
    }

    const st = String(os.st || os.status || '').toLowerCase();
    if (st === 'finalizada' || st === 'concluida') {
      reg.osFinalizadas++;
    } else if (st !== 'cancelada') {
      reg.osAtivas++;
    }

    const dataAbertura = String(os.dataAbertura || os.data || '').slice(0, 10);
    if (!reg.ultimaOSData || dataAbertura > reg.ultimaOSData) {
      reg.ultimaOSData = dataAbertura;
    }
  }

  let vencimentosPlanos = { vencidos: 0, proximos: 0, itens: [] };
  try {
    vencimentosPlanos = maintenancePlanService.avaliarVencimentos({ tenantId, state, dataReferencia: dataHoje });
  } catch (errPlano) {
    vencimentosPlanos = { vencidos: 0, proximos: 0, itens: [] };
  }

  const preventivasPorPlaca = new Map();
  for (const item of (vencimentosPlanos.itens || [])) {
    if (item.status === 'vencido' || item.status === 'proximo') {
      const placa = item.placa || 'Sem Placa';
      if (!preventivasPorPlaca.has(placa)) {
        preventivasPorPlaca.set(placa, []);
      }
      preventivasPorPlaca.get(placa).push(item);
    }
  }

  const contasPorCliente = new Map();
  for (const c of contas) {
    const nome = String(c.cli || c.cliente || c.parte || 'Outros').trim();
    if (!contasPorCliente.has(nome)) {
      contasPorCliente.set(nome, { totalAberto: 0, totalVencido: 0, titulos: [] });
    }
    const val = Number(c.valor) || 0;
    const isVencido = (c.venc || '') < dataHoje;
    const agrup = contasPorCliente.get(nome);
    agrup.totalAberto = arredondar(agrup.totalAberto + val);
    if (isVencido) {
      agrup.totalVencido = arredondar(agrup.totalVencido + val);
    }
    agrup.titulos.push(c);
  }

  const rankingClientes = [];
  const oportunidadesAcao = [];

  for (const [nomeCliente, dados] of frotasMap.entries()) {
    const totalVeiculos = dados.veiculosSet.size;
    const faturamentoTotal = arredondar(dados.faturamentoTotal);
    const ticketMedio = dados.totalOS > 0 ? arredondar(faturamentoTotal / dados.totalOS) : 0;

    const infoFinanceira = contasPorCliente.get(nomeCliente) || { totalAberto: 0, totalVencido: 0, titulos: [] };

    const preventivasCliente = [];
    for (const placa of dados.veiculosSet) {
      if (preventivasPorPlaca.has(placa)) {
        preventivasCliente.push(...preventivasPorPlaca.get(placa));
      }
    }

    const itemCliente = {
      clienteNome: nomeCliente,
      totalOS: dados.totalOS,
      osAtivas: dados.osAtivas,
      totalVeiculos,
      faturamentoTotal,
      ticketMedio,
      ultimaOSData: dados.ultimaOSData,
      totalReceberAberto: infoFinanceira.totalAberto,
      totalReceberVencido: infoFinanceira.totalVencido,
      totalPreventivasPendentes: preventivasCliente.length
    };

    rankingClientes.push(itemCliente);

    if (preventivasCliente.length > 0 && infoFinanceira.totalVencido === 0) {
      oportunidadesAcao.push({
        tipo: 'oportunidade_preventiva',
        cliente: nomeCliente,
        prioridade: 'alta',
        motivo: `${preventivasCliente.length} serviço(s) preventivo(s) vencido(s)/próximos e situação financeira regular.`,
        acaoSugerida: `Entrar em contato proativo com a transportadora para agendar a revisão dos veículos (${Array.from(new Set(preventivasCliente.map(p => p.placa))).join(', ')}).`,
        impactoEsperado: 'Retenção da frota e geração de receita programada.'
      });
    } else if (infoFinanceira.totalVencido > 0) {
      oportunidadesAcao.push({
        tipo: 'cobranca_preventiva',
        cliente: nomeCliente,
        prioridade: 'urgente',
        motivo: `Títulos vencidos totalizando ${formatarMoeda(infoFinanceira.totalVencido)}.`,
        acaoSugerida: preventivasCliente.length > 0
          ? `Alinhar regularização do saldo devedor (${formatarMoeda(infoFinanceira.totalVencido)}) ao agendar novas preventivas solicitadas.`
          : `Acionar régua amigável de cobrança antes de autorizar abertura de novos serviços a prazo no pátio.`,
        impactoEsperado: 'Recuperação imediata de liquidez de caixa e redução do risco de inadimplência.'
      });
    }
  }

  rankingClientes.sort((a, b) => b.faturamentoTotal - a.faturamentoTotal);

  return {
    sucesso: true,
    tenantId,
    dataReferencia: dataHoje,
    resumo: {
      totalClientesMapeados: rankingClientes.length,
      topClientesVolume: rankingClientes.slice(0, 5),
      totalPreventivasVencidas: vencimentosPlanos.vencidos || 0,
      totalPreventivasProximas: vencimentosPlanos.proximos || 0,
      totalTitulosVencidosReceber: contas.filter(c => (c.venc || '') < dataHoje).reduce((acc, c) => acc + (Number(c.valor) || 0), 0)
    },
    rankingClientes,
    oportunidadesAcao
  };
}

module.exports = {
  analisarRetencaoECobranca
};

