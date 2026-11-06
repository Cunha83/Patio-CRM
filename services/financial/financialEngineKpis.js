'use strict';

const {
  dataISO,
  addDias,
  diasEntre,
  formatarDataBR,
  formatarDataBRFull,
  obterAgoraSP,
  obterIntervaloFiltro
} = require('./engineHelpers');

/**
 * Calcula todos os KPIs consolidados a partir do estado real.
 */
function calcularKPIsFinanceiros(state = {}, options = {}) {
  const dataRef = options.dataRef || dataISO();
  const filtro = options.filtro || '30d';
  const { de, ate, ref } = obterIntervaloFiltro(filtro, dataRef, options.customDe, options.customAte);

  const cfg = state.cfg || {};
  const saldoInicial = Number(cfg.saldoInicial) || 0;
  const movimentos = state.movimentos || [];
  const contas = state.contas || [];

  // 1. Saldo em Caixa Consolidado (Toda a história até hoje)
  const totalEntradasGeral = movimentos
    .filter(m => m.tipo === 'entrada')
    .reduce((acc, m) => acc + (Number(m.valor) || 0), 0);
  const totalSaidasGeral = movimentos
    .filter(m => m.tipo === 'saida')
    .reduce((acc, m) => acc + (Number(m.valor) || 0), 0);
  const saldoConsolidado = +(saldoInicial + totalEntradasGeral - totalSaidasGeral).toFixed(2);

  // 2. Movimentações no Período Selecionado
  const movsPeriodo = movimentos.filter(m => {
    const d = (m.data || '').slice(0, 10);
    return d >= de && d <= ate;
  });

  const entradasPeriodo = +movsPeriodo
    .filter(m => m.tipo === 'entrada')
    .reduce((acc, m) => acc + (Number(m.valor) || 0), 0).toFixed(2);
  const saidasPeriodo = +movsPeriodo
    .filter(m => m.tipo === 'saida')
    .reduce((acc, m) => acc + (Number(m.valor) || 0), 0).toFixed(2);
  const resultadoLiquidoPeriodo = +(entradasPeriodo - saidasPeriodo).toFixed(2);

  // 3. Contas a Receber e Contas a Pagar em Aberto
  const emAberto = contas.filter(c => !c.pago);

  // A Receber
  const recEmAberto = emAberto.filter(c => c.tipo === 'receber');
  const totalReceberAberto = +recEmAberto.reduce((acc, c) => acc + (Number(c.valor) || 0), 0).toFixed(2);

  const recVencidos = recEmAberto.filter(c => (c.venc || '') < ref);
  const totalRecVencidos = +recVencidos.reduce((acc, c) => acc + (Number(c.valor) || 0), 0).toFixed(2);

  const recHoje = recEmAberto.filter(c => (c.venc || '').slice(0, 10) === ref);
  const totalRecHoje = +recHoje.reduce((acc, c) => acc + (Number(c.valor) || 0), 0).toFixed(2);

  const recEmDia = recEmAberto.filter(c => (c.venc || '').slice(0, 10) >= ref);
  const totalRecEmDia = +recEmDia.reduce((acc, c) => acc + (Number(c.valor) || 0), 0).toFixed(2);

  // A Pagar
  const pagEmAberto = emAberto.filter(c => c.tipo === 'pagar');
  const totalPagarAberto = +pagEmAberto.reduce((acc, c) => acc + (Number(c.valor) || 0), 0).toFixed(2);

  const pagVencidos = pagEmAberto.filter(c => (c.venc || '') < ref);
  const totalPagVencidos = +pagVencidos.reduce((acc, c) => acc + (Number(c.valor) || 0), 0).toFixed(2);

  const pagHoje = pagEmAberto.filter(c => (c.venc || '').slice(0, 10) === ref);
  const totalPagHoje = +pagHoje.reduce((acc, c) => acc + (Number(c.valor) || 0), 0).toFixed(2);

  const pagEmDia = pagEmAberto.filter(c => (c.venc || '').slice(0, 10) >= ref);
  const totalPagEmDia = +pagEmDia.reduce((acc, c) => acc + (Number(c.valor) || 0), 0).toFixed(2);

  // Resultado de Hoje
  const liquidoHoje = +(totalRecHoje - totalPagHoje).toFixed(2);

  // 4. Projeções Futuras (Próximos 7d e 30d)
  const dMais7 = addDias(ref, 7);
  const dMais30 = addDias(ref, 30);

  const rec7d = recEmAberto.filter(c => c.venc >= ref && c.venc <= dMais7);
  const pag7d = pagEmAberto.filter(c => c.venc >= ref && c.venc <= dMais7);
  const totRec7d = +rec7d.reduce((acc, c) => acc + (Number(c.valor) || 0), 0).toFixed(2);
  const totPag7d = +pag7d.reduce((acc, c) => acc + (Number(c.valor) || 0), 0).toFixed(2);
  const saldoPrevisto7d = +(saldoConsolidado + totRec7d - totPag7d).toFixed(2);

  const rec30d = recEmAberto.filter(c => c.venc >= ref && c.venc <= dMais30);
  const pag30d = pagEmAberto.filter(c => c.venc >= ref && c.venc <= dMais30);
  const totRec30d = +rec30d.reduce((acc, c) => acc + (Number(c.valor) || 0), 0).toFixed(2);
  const totPag30d = +pag30d.reduce((acc, c) => acc + (Number(c.valor) || 0), 0).toFixed(2);
  const saldoPrevisto30d = +(saldoConsolidado + totRec30d - totPag30d).toFixed(2);

  // 5. Inadimplência
  const taxaInadimplencia = totalReceberAberto > 0
    ? +((totalRecVencidos / totalReceberAberto) * 100).toFixed(1)
    : 0;

  // 6. Próximos Vencimentos Ordenados (Agenda de Compromissos)
  const agendaProximos = emAberto
    .slice()
    .sort((a, b) => (a.venc || '').localeCompare(b.venc || ''))
    .slice(0, 10)
    .map(c => ({
      id: c.id,
      tipo: c.tipo,
      desc: c.desc || '—',
      parte: c.parte || '—',
      valor: Number(c.valor) || 0,
      venc: c.venc,
      vencBR: formatarDataBRFull(c.venc),
      diasAteVenc: diasEntre(ref, c.venc),
      atrasado: (c.venc || '') < ref
    }));

  // 7. Resumo por Origem (WhatsApp vs Web / Sistema e Estornos)
  const movsWhatsappPeriodo = movsPeriodo.filter(m => m.origem === 'whatsapp');
  const movsWebPeriodo = movsPeriodo.filter(m => (m.origem || 'web') !== 'whatsapp');
  const movsEstornadosPeriodo = movsPeriodo.filter(m => Boolean(m.estornado));

  const totalWhatsappPeriodo = +movsWhatsappPeriodo.reduce((acc, m) => acc + (Number(m.valor) || 0), 0).toFixed(2);
  const totalWebPeriodo = +movsWebPeriodo.reduce((acc, m) => acc + (Number(m.valor) || 0), 0).toFixed(2);
  const totalEstornadosPeriodo = +movsEstornadosPeriodo.reduce((acc, m) => acc + (Number(m.valor) || 0), 0).toFixed(2);

  const resumoOrigem = {
    totalWhatsapp: totalWhatsappPeriodo,
    qtdWhatsapp: movsWhatsappPeriodo.length,
    totalWeb: totalWebPeriodo,
    qtdWeb: movsWebPeriodo.length,
    totalEstornados: totalEstornadosPeriodo,
    qtdEstornados: movsEstornadosPeriodo.length
  };

  // 8. Tesouraria (Sangrias e Suprimentos)
  const movsSangriaPeriodo = movsPeriodo.filter(m => (m.naturezaOperacao === 'sangria' || m.subtipo === 'sangria') && !m.estornado);
  const movsSuprimentoPeriodo = movsPeriodo.filter(m => (m.naturezaOperacao === 'suprimento' || m.subtipo === 'suprimento') && !m.estornado);
  const totalSangrias = +movsSangriaPeriodo.reduce((acc, m) => acc + (Number(m.valor) || 0), 0).toFixed(2);
  const totalSuprimentos = +movsSuprimentoPeriodo.reduce((acc, m) => acc + (Number(m.valor) || 0), 0).toFixed(2);

  return {
    filtro,
    de,
    ate,
    ref,
    saldoConsolidado,
    saldoInicial,
    totalEntradasGeral,
    totalSaidasGeral,
    entradasPeriodo,
    saidasPeriodo,
    resultadoLiquidoPeriodo,
    qtdMovimentosPeriodo: movsPeriodo.length,
    totalSangrias,
    qtdSangrias: movsSangriaPeriodo.length,
    totalSuprimentos,
    qtdSuprimentos: movsSuprimentoPeriodo.length,
    totalReceberAberto,
    qtdReceberAberto: recEmAberto.length,
    totalRecVencidos,
    qtdRecVencidos: recVencidos.length,
    totalRecHoje,
    qtdRecHoje: recHoje.length,
    totalRecEmDia,
    totalPagarAberto,
    qtdPagarAberto: pagEmAberto.length,
    totalPagVencidos,
    qtdPagVencidos: pagVencidos.length,
    totalPagHoje,
    qtdPagHoje: pagHoje.length,
    totalPagEmDia,
    liquidoHoje,
    totRec7d,
    totPag7d,
    saldoPrevisto7d,
    totRec30d,
    totPag30d,
    saldoPrevisto30d,
    taxaInadimplencia,
    agendaProximos,
    resumoOrigem
  };
}

/**
 * Calcula o resumo operacional de pátio e boxes.
 */
function calcularResumoOperacional(state = {}, options = {}) {
  const agoraSP = obterAgoraSP(options.dataRef);
  const hoje = agoraSP.dataISO;

  const osLista = Array.isArray(state.os) ? state.os : [];
  const veiculos = Array.isArray(state.veiculos) ? state.veiculos : [];
  const clientes = Array.isArray(state.clientes) ? state.clientes : [];
  const boxes = Array.isArray(state.boxes) ? state.boxes : [];

  const osAtivas = osLista.filter(o => o && o.st !== 'finalizada');
  const boxesOcupados = osAtivas.filter(o => o.box);
  const naFila = osAtivas.filter(o => !o.box || o.st === 'fila');

  const amanheceram = osAtivas.filter(o => {
    const rawData = o.abertura || o.criadoEm;
    if (!rawData) return false;
    const dataAbertura = dataISO(rawData);
    return dataAbertura < hoje;
  });

  const totalCapacidadeBoxes = boxes.length || 6;
  const percOcupacao = Math.round((boxesOcupados.length / totalCapacidadeBoxes) * 100);

  const listaAmanhecidos = amanheceram.map((o, idx) => {
    const v = veiculos.find(x => x && x.id === o.vei) || {};
    const c = clientes.find(x => x && x.id === o.cli) || {};
    const b = boxes.find(x => x && x.id === o.box) || {};

    const rawData = o.abertura || o.criadoEm;
    let diasNoPatio = 1;
    if (rawData) {
      const dtAbertura = dataISO(rawData);
      diasNoPatio = Math.max(1, diasEntre(dtAbertura, hoje));
    }

    const primeiroServico = (o.servicos && o.servicos[0] && o.servicos[0].nome)
      ? o.servicos[0].nome
      : (o.queixa || 'Manutenção Geral');

    const boxNome = b.nome || (o.box ? `Box ${o.box}` : 'Pátio');

    return {
      idx: idx + 1,
      osId: o.id,
      placa: v.placa || 'SEM PLACA',
      modelo: v.modelo || 'Caminhão',
      clienteNome: c.nome || 'Cliente',
      boxNome,
      mecanico: o.mec || 'Equipe',
      diasNoPatio,
      servico: primeiroServico,
      status: o.st || 'executando',
      obsPeca: (o.st === 'peca' && o.obs) ? o.obs : null,
      previsao: o.prev ? formatarDataBR(o.prev) : null
    };
  });

  return {
    hojeRef: hoje,
    dataFormatada: agoraSP.dataBR,
    horaFormatada: agoraSP.horaBR,
    totalOSAtivas: osAtivas.length,
    boxesOcupados: boxesOcupados.length,
    totalBoxes: totalCapacidadeBoxes,
    percOcupacao,
    naFila: naFila.length,
    totalAmanhecidos: amanheceram.length,
    listaAmanhecidos
  };
}

module.exports = {
  calcularKPIsFinanceiros,
  calcularResumoOperacional
};

