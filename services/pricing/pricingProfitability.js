'use strict';

const { obterAgoraSP } = require('../financialEngine');
const costingService = require('../costingService');
const {
  arredondar,
  normalizarTexto,
  obterConfigPrecificacao
} = require('./pricingCore');

function filtrarPorPeriodo(itens = [], periodo = '30d', dataInicio = null, dataFim = null) {
  const agoraSP = obterAgoraSP();
  const hoje = agoraSP.dataISO;
  const hojeDate = agoraSP.dataObj;

  let limiteData = null;
  if (periodo === 'hoje') {
    limiteData = hoje;
  } else if (periodo === '7d') {
    const d = new Date(hojeDate.getTime() - 7 * 86400000);
    limiteData = d.toISOString().slice(0, 10);
  } else if (periodo === '30d' || periodo === 'mes') {
    const d = new Date(hojeDate.getTime() - 30 * 86400000);
    limiteData = d.toISOString().slice(0, 10);
  } else if (periodo === 'mes_anterior') {
    const d = new Date(hojeDate.getTime() - 60 * 86400000);
    limiteData = d.toISOString().slice(0, 10);
  } else if (periodo === 'personalizado' && dataInicio) {
    limiteData = dataInicio;
  }

  return itens.filter(it => {
    const dt = String(it.abertura || it.criadoEm || it.timestamp || it.dataHora || '').slice(0, 10);
    if (!dt) return true;
    if (periodo === 'hoje') return dt === hoje;
    if (limiteData && dt < limiteData) return false;
    if (dataFim && dt > dataFim) return false;
    return true;
  });
}

/**
 * Resumo consolidado de rentabilidade da oficina
 */
function obterResumoRentabilidade({ tenantId, state, periodo = '30d', dataInicio = null, dataFim = null }) {
  if (!state) return null;
  const config = obterConfigPrecificacao(state);
  const osTenant = (state.os || []).filter(o => (o.tenantId === tenantId || !o.tenantId) && o.st !== 'cancelada');
  const osFiltradas = filtrarPorPeriodo(osTenant, periodo, dataInicio, dataFim);

  let receitaAutorizadaTotal = 0;
  let custoRealTotal = 0;
  let margemBrutaTotal = 0;
  let custoRetrabalhoTotal = 0;
  let horasRetrabalhoTotal = 0;
  let horasProdutivasTotal = 0;
  let totalOS = 0;
  let osAbaixoMargemMinima = 0;

  for (const os of osFiltradas) {
    try {
      const apuracao = costingService.calcularCustoRealOS({ tenantId, state, osId: os.id });
      if (apuracao) {
        totalOS++;
        let custoMO = apuracao.custoMaoObra;
        let horasMO = apuracao.horasHomemTotal;
        if (custoMO === 0 && Array.isArray(os.servicos)) {
          for (const s of os.servicos) {
            if (s.tempoRealMinutos || s.horasReais) {
              const min = Number(s.tempoRealMinutos) || (Number(s.horasReais || 0) * 60);
              const workers = (state.workers || []).filter(w => w.ativo !== false && w.custoHora > 0);
              const cHora = workers.length ? (workers.reduce((a, w) => a + Number(w.custoHora), 0) / workers.length) : 50;
              custoMO += (min / 60) * cHora;
              horasMO += min / 60;
            }
          }
        }
        const custoRealOS = arredondar(apuracao.custoPecasConsumidas + custoMO);
        const margemBrutaOS = arredondar(apuracao.receitaAutorizada - custoRealOS);
        const margemPct = apuracao.receitaAutorizada > 0 ? arredondar((margemBrutaOS / apuracao.receitaAutorizada) * 100, 1) : 0;

        receitaAutorizadaTotal += apuracao.receitaAutorizada;
        custoRealTotal += custoRealOS;
        margemBrutaTotal += margemBrutaOS;
        custoRetrabalhoTotal += apuracao.custoRetrabalho;
        horasRetrabalhoTotal += apuracao.horasRetrabalho;
        horasProdutivasTotal += horasMO;

        if (apuracao.receitaAutorizada > 0 && margemPct < config.margemMinimaPadrao) {
          osAbaixoMargemMinima++;
        }
      }
    } catch (_) {}
  }

  receitaAutorizadaTotal = arredondar(receitaAutorizadaTotal);
  custoRealTotal = arredondar(custoRealTotal);
  margemBrutaTotal = arredondar(margemBrutaTotal);
  custoRetrabalhoTotal = arredondar(custoRetrabalhoTotal);
  horasRetrabalhoTotal = arredondar(horasRetrabalhoTotal, 2);
  horasProdutivasTotal = arredondar(horasProdutivasTotal, 2);

  const margemMediaPercentual = receitaAutorizadaTotal > 0
    ? arredondar((margemBrutaTotal / receitaAutorizadaTotal) * 100, 2)
    : 0;

  const ticketMedio = totalOS > 0
    ? arredondar(receitaAutorizadaTotal / totalOS)
    : 0;

  return {
    tenantId,
    periodo,
    receitaAutorizada: receitaAutorizadaTotal,
    receitaTotal: receitaAutorizadaTotal,
    custoReal: custoRealTotal,
    custoRealTotal: custoRealTotal,
    margemBruta: margemBrutaTotal,
    margemBrutaTotal: margemBrutaTotal,
    margemMediaPercentual,
    margemPercentualGeral: margemMediaPercentual,
    totalOS,
    totalOrdensFinalizadas: totalOS,
    osAbaixoMargemMinima,
    ticketMedio,
    custoRetrabalho: custoRetrabalhoTotal,
    horasRetrabalho: horasRetrabalhoTotal,
    horasProdutivas: horasProdutivasTotal,
    margemAlvoPadrao: config.margemAlvoPadrao,
    margemMinimaPadrao: config.margemMinimaPadrao
  };
}

/**
 * Rentabilidade detalhada agrupada por serviço
 */
function obterRentabilidadeServicos({ tenantId, state, periodo = '30d', ordenacao, ordenarPor, limite = 50 }) {
  if (!state) return [];
  const config = obterConfigPrecificacao(state);
  const ord = ordenarPor || ordenacao || 'margem_desc';
  const servicosMap = new Map();
  const osTenant = (state.os || []).filter(o => (o.tenantId === tenantId || !o.tenantId) && o.st !== 'cancelada');
  const osFiltradas = filtrarPorPeriodo(osTenant, periodo);
  const laborEntries = (state.laborEntries || []).filter(e => (e.tenantId === tenantId || !e.tenantId) && e.status !== 'cancelado');

  for (const os of osFiltradas) {
    for (const s of (os.servicos || [])) {
      if (s.autorizado === false || s.status === 'recusado') continue;
      const chave = s.serviceCatalogId || s.id || normalizarTexto(s.nome || 'servico');
      const nome = s.nome || s.desc || 'Serviço';
      const categoria = s.categoria || 'Geral';
      const preco = Number(s.preco != null ? s.preco : s.valor || 0);

      if (!servicosMap.has(chave)) {
        servicosMap.set(chave, {
          chave,
          nome,
          categoria,
          quantidade: 0,
          receita: 0,
          custoMO: 0,
          custoPecas: 0,
          custoTotal: 0,
          minutosProdutivos: 0,
          minutosRetrabalho: 0,
          execucoesRetrabalho: 0
        });
      }

      const item = servicosMap.get(chave);
      item.quantidade++;
      item.receita += preco;

      const apontamentos = laborEntries.filter(
        e => e.osId === os.id && (e.serviceItemId === s.id || normalizarTexto(e.serviceNome || '') === normalizarTexto(nome))
      );

      if (apontamentos.length > 0) {
        for (const e of apontamentos) {
          const worker = (state.workers || []).find(w => w.id === e.workerId);
          const cHora = Number(worker?.custoHora) || 0;
          const dur = Number(e.durationMinutes) || 0;
          item.minutosProdutivos += dur;
          item.custoMO += (dur / 60) * cHora;
          if (e.type === 'retrabalho') {
            item.minutosRetrabalho += dur;
            item.execucoesRetrabalho++;
          }
        }
      } else if (s.tempoRealMinutos || s.horasReais) {
        const dur = Number(s.tempoRealMinutos) || (Number(s.horasReais || 0) * 60);
        item.minutosProdutivos += dur;
        const workersAtivos = (state.workers || []).filter(w => w.ativo !== false && w.custoHora > 0);
        const custoHoraMedio = workersAtivos.length ? (workersAtivos.reduce((a, b) => a + Number(b.custoHora), 0) / workersAtivos.length) : 50;
        item.custoMO += (dur / 60) * custoHoraMedio;
      }

      if (s.retrabalho) {
        item.minutosRetrabalho += (Number(s.tempoRealMinutos) || 60);
        item.execucoesRetrabalho++;
      }
    }
  }

  const lista = Array.from(servicosMap.values()).map(it => {
    const receita = arredondar(it.receita);
    const custoMO = arredondar(it.custoMO);
    const custoPecas = arredondar(it.custoPecas);
    const custoTotal = arredondar(custoMO + custoPecas);
    const margemBruta = arredondar(receita - custoTotal);
    const margemPercentual = receita > 0 ? arredondar((margemBruta / receita) * 100, 1) : 0;
    const horasProdutivas = arredondar(it.minutosProdutivos / 60, 2);
    const taxaRetrabalho = it.quantidade > 0 ? arredondar((it.execucoesRetrabalho / it.quantidade) * 100, 1) : 0;

    return {
      chave: it.chave,
      serviceId: it.chave,
      nome: it.nome,
      serviceNome: it.nome,
      categoria: it.categoria,
      quantidadeExecucoes: it.quantidade,
      receita,
      receitaTotal: receita,
      custoMO,
      custoPecas,
      custoTotal,
      custoRealTotal: custoTotal,
      margemBruta,
      margemPercentual,
      horasProdutivas,
      percentualRetrabalho: taxaRetrabalho,
      taxaRetrabalho,
      execucoesRetrabalho: it.execucoesRetrabalho,
      abaixoDaMargemMinima: margemPercentual < config.margemMinimaPadrao,
      ticketMedio: it.quantidade > 0 ? arredondar(receita / it.quantidade) : 0
    };
  });

  if (ord === 'margem_desc') {
    lista.sort((a, b) => b.margemPercentual - a.margemPercentual);
  } else if (ord === 'margem_asc') {
    lista.sort((a, b) => a.margemPercentual - b.margemPercentual);
  } else if (ord === 'receita_desc') {
    lista.sort((a, b) => b.receita - a.receita);
  } else if (ord === 'custo_desc') {
    lista.sort((a, b) => b.custoTotal - a.custoTotal);
  } else if (ord === 'retrabalho_desc') {
    lista.sort((a, b) => b.taxaRetrabalho - a.taxaRetrabalho);
  } else if (ord === 'horas_desc') {
    lista.sort((a, b) => b.horasProdutivas - a.horasProdutivas);
  }

  return lista.slice(0, limite);
}

module.exports = {
  filtrarPorPeriodo,
  obterResumoRentabilidade,
  obterRentabilidadeServicos
};
