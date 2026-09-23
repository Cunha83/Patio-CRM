'use strict';

/**
 * PÁTIO CRM — MOTOR FINANCEIRO CENTRALIZADO
 * Unifica todos os cálculos financeiros do sistema para garantir que:
 * DASHBOARD WEB <-> RELATÓRIO WHATSAPP <-> IMAGEM EXECUTIVA
 * apresentem sempre os mesmos números e indicadores com máxima precisão.
 */

const FUSO_HORARIO_PADRAO = 'America/Sao_Paulo';

const formatadorISOSP = new Intl.DateTimeFormat('en-CA', {
  timeZone: FUSO_HORARIO_PADRAO,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
});

const formatadorBRSP = new Intl.DateTimeFormat('pt-BR', {
  timeZone: FUSO_HORARIO_PADRAO,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric'
});

const formatadorHoraSP = new Intl.DateTimeFormat('pt-BR', {
  timeZone: FUSO_HORARIO_PADRAO,
  hour: '2-digit',
  minute: '2-digit',
  hour12: false
});

function obterAgoraSP(date = new Date()) {
  let d = date;
  if (!d) d = new Date();
  else if (typeof d === 'string') {
    if (/^\d{4}-\d{2}-\d{2}$/.test(d.trim())) {
      const [ano, mes, dia] = d.trim().split('-').map(Number);
      d = new Date(Date.UTC(ano, mes - 1, dia, 12, 0, 0));
    } else {
      d = new Date(d);
    }
  } else if (typeof d === 'number') {
    d = new Date(d);
  }
  if (!(d instanceof Date) || isNaN(d.getTime())) d = new Date();

  return {
    dataISO: formatadorISOSP.format(d),
    dataBR: formatadorBRSP.format(d),
    horaBR: formatadorHoraSP.format(d),
    dataObj: d
  };
}

function formatarMoeda(val) {
  const n = Number(val) || 0;
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatarMoedaCurta(val) {
  const n = Number(val) || 0;
  if (Math.abs(n) >= 1000000) {
    return 'R$ ' + (n / 1000000).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + 'M';
  }
  if (Math.abs(n) >= 1000) {
    return 'R$ ' + (n / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + 'k';
  }
  return formatarMoeda(n);
}

function dataISO(d) {
  if (!d) return formatadorISOSP.format(new Date());
  if (typeof d === 'string') {
    const trimmed = d.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
    const parsed = new Date(trimmed);
    if (!isNaN(parsed.getTime())) return formatadorISOSP.format(parsed);
    return trimmed.slice(0, 10);
  }
  if (typeof d === 'number') {
    const dt = new Date(d);
    if (!isNaN(dt.getTime())) return formatadorISOSP.format(dt);
  }
  if (d instanceof Date && !isNaN(d.getTime())) return formatadorISOSP.format(d);
  return formatadorISOSP.format(new Date());
}

function addDias(dStr, dias) {
  const base = dataISO(dStr);
  const [ano, mes, dia] = base.split('-').map(Number);
  const d = new Date(Date.UTC(ano, mes - 1, dia + Number(dias), 12, 0, 0));
  return formatadorISOSP.format(d);
}

function diasEntre(d1, d2) {
  const iso1 = dataISO(d1);
  const iso2 = dataISO(d2);
  const [y1, m1, day1] = iso1.split('-').map(Number);
  const [y2, m2, day2] = iso2.split('-').map(Number);
  const t1 = Date.UTC(y1, m1 - 1, day1);
  const t2 = Date.UTC(y2, m2 - 1, day2);
  return Math.round((t2 - t1) / 864e5);
}

function formatarDataBR(dStr) {
  if (!dStr) return '';
  const iso = dataISO(dStr);
  const parts = iso.split('-');
  if (parts.length === 3) return `${parts[2]}/${parts[1]}`;
  return dStr;
}

function formatarDataBRFull(dStr) {
  if (!dStr) return '';
  const iso = dataISO(dStr);
  const parts = iso.split('-');
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return dStr;
}

/**
 * Retorna intervalo de datas [de, ate] para o filtro especificado.
 */
function obterIntervaloFiltro(filtro, dataRef = null, customDe = null, customAte = null) {
  const ref = dataISO(dataRef);
  const dataRefObj = new Date(ref + 'T12:00:00');

  let de = ref;
  let ate = ref;

  switch (filtro) {
    case 'hoje':
      de = ref;
      ate = ref;
      break;
    case '7d':
      de = addDias(ref, -6);
      ate = ref;
      break;
    case '15d':
      de = addDias(ref, -14);
      ate = ref;
      break;
    case '30d':
      de = addDias(ref, -29);
      ate = ref;
      break;
    case 'mes': {
      const ano = dataRefObj.getFullYear();
      const mes = String(dataRefObj.getMonth() + 1).padStart(2, '0');
      de = `${ano}-${mes}-01`;
      const ultimoDia = new Date(ano, dataRefObj.getMonth() + 1, 0).getDate();
      ate = `${ano}-${mes}-${String(ultimoDia).padStart(2, '0')}`;
      break;
    }
    case 'mes_anterior': {
      const dataAnt = new Date(dataRefObj.getFullYear(), dataRefObj.getMonth() - 1, 1);
      const ano = dataAnt.getFullYear();
      const mes = String(dataAnt.getMonth() + 1).padStart(2, '0');
      de = `${ano}-${mes}-01`;
      const ultimoDia = new Date(ano, dataAnt.getMonth() + 1, 0).getDate();
      ate = `${ano}-${mes}-${String(ultimoDia).padStart(2, '0')}`;
      break;
    }
    case 'personalizado':
    case 'custom':
      de = customDe ? dataISO(customDe) : addDias(ref, -29);
      ate = customAte ? dataISO(customAte) : ref;
      break;
    default:
      // Padrão: 30 dias
      de = addDias(ref, -29);
      ate = ref;
      break;
  }

  return { de, ate, ref, filtro };
}

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

  return {
    filtro,
    de,
    ate,
    ref,
    saldoConsolidado,
    saldoInicial,
    totalEntradasGeral,
    totalSaidasGeral,

    // Período selecionado
    entradasPeriodo,
    saidasPeriodo,
    resultadoLiquidoPeriodo,
    qtdMovimentosPeriodo: movsPeriodo.length,

    // Contas a Receber
    totalReceberAberto,
    qtdReceberAberto: recEmAberto.length,
    totalRecVencidos,
    qtdRecVencidos: recVencidos.length,
    totalRecHoje,
    qtdRecHoje: recHoje.length,
    totalRecEmDia,

    // Contas a Pagar
    totalPagarAberto,
    qtdPagarAberto: pagEmAberto.length,
    totalPagVencidos,
    qtdPagVencidos: pagVencidos.length,
    totalPagHoje,
    qtdPagHoje: pagHoje.length,
    totalPagEmDia,

    // Vencimentos de Hoje
    liquidoHoje,

    // Projeções
    totRec7d,
    totPag7d,
    saldoPrevisto7d,
    totRec30d,
    totPag30d,
    saldoPrevisto30d,

    // Inadimplência
    taxaInadimplencia,

    // Agenda
    agendaProximos
  };
}

/**
 * Gera as séries para os 5 Gráficos Executivos:
 * 1. Fluxo de Caixa (Entradas vs Saídas por dia no período)
 * 2. Receber x Pagar (Comparativo por faixa de vencimento)
 * 3. Evolução do Saldo de Caixa (Curva acumulada dia a dia)
 * 4. Projeção Financeira Futura (Próximos 30 dias)
 * 5. Distribuição de Despesas por Categoria
 */
function gerarSeriesGraficos(state = {}, options = {}) {
  const dataRef = options.dataRef || dataISO();
  const filtro = options.filtro || '30d';
  const { de, ate, ref } = obterIntervaloFiltro(filtro, dataRef, options.customDe, options.customAte);

  const cfg = state.cfg || {};
  const saldoInicial = Number(cfg.saldoInicial) || 0;
  const movimentos = state.movimentos || [];
  const contas = state.contas || [];

  /* -------------------------------------------------------------
     GRÁFICO 1 & 3: Fluxo de Caixa Diário & Evolução do Saldo
  ------------------------------------------------------------- */
  // Gera lista cronológica de todos os dias entre 'de' e 'ate'
  const listaDias = [];
  let curr = de;
  while (curr <= ate && listaDias.length < 120) {
    listaDias.push(curr);
    curr = addDias(curr, 1);
  }

  // Agrupa movimentações por dia
  const mapaEntradas = {};
  const mapaSaidas = {};
  movimentos.forEach(m => {
    const d = (m.data || '').slice(0, 10);
    const v = Number(m.valor) || 0;
    if (m.tipo === 'entrada') mapaEntradas[d] = (mapaEntradas[d] || 0) + v;
    else if (m.tipo === 'saida') mapaSaidas[d] = (mapaSaidas[d] || 0) + v;
  });

  // Saldo anterior ao início de 'de'
  const entradasAntes = movimentos
    .filter(m => m.tipo === 'entrada' && (m.data || '').slice(0, 10) < de)
    .reduce((acc, m) => acc + (Number(m.valor) || 0), 0);
  const saidasAntes = movimentos
    .filter(m => m.tipo === 'saida' && (m.data || '').slice(0, 10) < de)
    .reduce((acc, m) => acc + (Number(m.valor) || 0), 0);
  let saldoAcumulado = saldoInicial + entradasAntes - saidasAntes;

  const labelsFluxo = [];
  const dadosEntradas = [];
  const dadosSaidas = [];
  const dadosEvolucaoSaldo = [];

  listaDias.forEach(dia => {
    const ent = +(mapaEntradas[dia] || 0).toFixed(2);
    const sai = +(mapaSaidas[dia] || 0).toFixed(2);
    saldoAcumulado = +(saldoAcumulado + ent - sai).toFixed(2);

    labelsFluxo.push(formatarDataBR(dia));
    dadosEntradas.push(ent);
    dadosSaidas.push(sai);
    dadosEvolucaoSaldo.push(saldoAcumulado);
  });

  /* -------------------------------------------------------------
     GRÁFICO 2: Receber x Pagar (Comparativo por Faixas)
  ------------------------------------------------------------- */
  const emAberto = contas.filter(c => !c.pago);
  const faixas = [
    { label: 'Vencidos', min: -9999, max: -1 },
    { label: 'Hoje', min: 0, max: 0 },
    { label: 'Até 7d', min: 1, max: 7 },
    { label: '8 a 15d', min: 8, max: 15 },
    { label: '16 a 30d', min: 16, max: 30 },
    { label: '> 30d', min: 31, max: 9999 }
  ];

  const labelsRxP = faixas.map(f => f.label);
  const dadosRxPReceber = faixas.map(f => {
    return +emAberto
      .filter(c => c.tipo === 'receber' && diasEntre(ref, c.venc) >= f.min && diasEntre(ref, c.venc) <= f.max)
      .reduce((acc, c) => acc + (Number(c.valor) || 0), 0).toFixed(2);
  });
  const dadosRxPPagar = faixas.map(f => {
    return +emAberto
      .filter(c => c.tipo === 'pagar' && diasEntre(ref, c.venc) >= f.min && diasEntre(ref, c.venc) <= f.max)
      .reduce((acc, c) => acc + (Number(c.valor) || 0), 0).toFixed(2);
  });

  /* -------------------------------------------------------------
     GRÁFICO 4: Projeção Financeira (Próximos 30 Dias)
  ------------------------------------------------------------- */
  const totalEntradasGeral = movimentos
    .filter(m => m.tipo === 'entrada')
    .reduce((acc, m) => acc + (Number(m.valor) || 0), 0);
  const totalSaidasGeral = movimentos
    .filter(m => m.tipo === 'saida')
    .reduce((acc, m) => acc + (Number(m.valor) || 0), 0);
  const saldoAtualHoje = +(saldoInicial + totalEntradasGeral - totalSaidasGeral).toFixed(2);

  const labelsProjecao = [];
  const dadosProjecaoSaldo = [];
  let saldoProjetadoIter = saldoAtualHoje;

  // Próximos 30 dias em passos de 3 dias para visualização limpa
  for (let i = 0; i <= 30; i += 3) {
    const diaProj = addDias(ref, i);
    // Soma títulos vencendo até diaProj
    const recAte = emAberto
      .filter(c => c.tipo === 'receber' && c.venc >= ref && c.venc <= diaProj)
      .reduce((acc, c) => acc + (Number(c.valor) || 0), 0);
    const pagAte = emAberto
      .filter(c => c.tipo === 'pagar' && c.venc >= ref && c.venc <= diaProj)
      .reduce((acc, c) => acc + (Number(c.valor) || 0), 0);

    labelsProjecao.push(i === 0 ? 'Hoje' : formatarDataBR(diaProj));
    dadosProjecaoSaldo.push(+(saldoAtualHoje + recAte - pagAte).toFixed(2));
  }

  /* -------------------------------------------------------------
     GRÁFICO 5: Distribuição das Despesas por Categoria
  ------------------------------------------------------------- */
  const movsPeriodo = movimentos.filter(m => {
    const d = (m.data || '').slice(0, 10);
    return d >= de && d <= ate;
  });

  const mapaCategorias = {};
  // Despesas realizadas no período selecionado
  movsPeriodo
    .filter(m => m.tipo === 'saida')
    .forEach(m => {
      const cat = (m.cat || 'Outras Despesas').trim();
      mapaCategorias[cat] = (mapaCategorias[cat] || 0) + (Number(m.valor) || 0);
    });

  // Se não houver saídas no período, usa contas a pagar em aberto para não deixar vazio
  if (Object.keys(mapaCategorias).length === 0) {
    emAberto
      .filter(c => c.tipo === 'pagar')
      .forEach(c => {
        const cat = (c.cat || 'Fornecedores Peças').trim();
        mapaCategorias[cat] = (mapaCategorias[cat] || 0) + (Number(c.valor) || 0);
      });
  }

  const entradasCat = Object.entries(mapaCategorias)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6); // Top 6 categorias

  const labelsCategorias = entradasCat.map(e => e[0]);
  const dadosCategorias = entradasCat.map(e => +e[1].toFixed(2));
  const coresCategorias = [
    '#3b82f6', // azul
    '#f59e0b', // laranja
    '#10b981', // verde
    '#ef4444', // vermelho
    '#8b5cf6', // roxo
    '#64748b'  // cinza
  ];

  return {
    grafico1Fluxo: {
      labels: labelsFluxo,
      entradas: dadosEntradas,
      saidas: dadosSaidas,
      totalEntradas: dadosEntradas.reduce((a, b) => a + b, 0),
      totalSaidas: dadosSaidas.reduce((a, b) => a + b, 0)
    },
    grafico2ReceberXPagar: {
      labels: labelsRxP,
      receber: dadosRxPReceber,
      pagar: dadosRxPPagar
    },
    grafico3EvolucaoSaldo: {
      labels: labelsFluxo,
      saldo: dadosEvolucaoSaldo
    },
    grafico4Projecao: {
      labels: labelsProjecao,
      saldoProjetado: dadosProjecaoSaldo
    },
    grafico5Despesas: {
      labels: labelsCategorias,
      dados: dadosCategorias,
      cores: coresCategorias.slice(0, labelsCategorias.length)
    }
  };
}

/**
 * Calcula o resumo operacional do pátio e boxes.
 * REGRA RIGOROSA DE "AMANHECIDOS":
 * Considera única e exclusivamente veículos cuja OS ativa foi criada/aberta em data anterior
 * à data de referência no fuso America/Sao_Paulo.
 * Se nenhuma OS atender a essa condição, o total é rigorosamente 0 e a lista é vazia (sem qualquer fallback para osAtivas).
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

  // Apenas OS ativas cuja abertura ou criação ocorreu estritamente antes de hoje em America/Sao_Paulo
  const amanheceram = osAtivas.filter(o => {
    const rawData = o.abertura || o.criadoEm;
    if (!rawData) return false;
    const dataAbertura = dataISO(rawData);
    return dataAbertura < hoje;
  });

  const totalCapacidadeBoxes = boxes.length || 6;
  const percOcupacao = Math.round((boxesOcupados.length / totalCapacidadeBoxes) * 100);

  // Se ninguém amanheceu, é estritamente vazio e zero. NUNCA fazer fallback para osAtivas!
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

/**
 * Retorna o pacote completo consolidado para alimentar o Dashboard Web,
 * API JSON, e gerador de imagem.
 */
function obterDashboardFinanceiro(state = {}, options = {}) {
  const agoraSP = obterAgoraSP(options.dataRef);
  const kpis = calcularKPIsFinanceiros(state, { ...options, dataRef: agoraSP.dataISO });
  const graficos = gerarSeriesGraficos(state, { ...options, dataRef: agoraSP.dataISO });
  const operacional = calcularResumoOperacional(state, { ...options, dataRef: agoraSP.dataISO });
  const cfg = state.cfg || {};

  return {
    empresa: cfg.empresa || 'Pátio Diesel & Hidráulica',
    cnpj: cfg.cnpj || '',
    kpis,
    graficos,
    operacional,
    meta: {
      geradoEm: new Date().toISOString(),
      fuso: FUSO_HORARIO_PADRAO,
      dataRef: agoraSP.dataISO,
      versao: state.versao || 1
    }
  };
}

/**
 * Gera string SVG limpa e autossuficiente para o gráfico de barras de Fluxo de Caixa (Entradas x Saídas).
 */
function gerarSVGBarrasFluxo(fluxo = {}, width = 960, height = 200) {
  const labels = fluxo.labels || [];
  const entradas = fluxo.entradas || [];
  const saidas = fluxo.saidas || [];

  if (labels.length === 0) {
    return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <text x="${width / 2}" y="${height / 2}" fill="#64748b" font-size="16" text-anchor="middle">Nenhuma movimentação no período</text>
    </svg>`;
  }

  // Limita aos últimos 14 pontos para caber perfeitamente no card de 1080px
  const count = Math.min(labels.length, 14);
  const startIdx = labels.length - count;
  const lSlice = labels.slice(startIdx);
  const eSlice = entradas.slice(startIdx);
  const sSlice = saidas.slice(startIdx);

  const maxVal = Math.max(...eSlice, ...sSlice, 100);
  const padLeft = 70;
  const padRight = 20;
  const padTop = 20;
  const padBottom = 35;
  const chartW = width - padLeft - padRight;
  const chartH = height - padTop - padBottom;

  const groupW = chartW / count;
  const barW = Math.max(8, Math.min(22, (groupW - 10) / 2));

  let barsSvg = '';
  for (let i = 0; i < count; i++) {
    const eVal = eSlice[i] || 0;
    const sVal = sSlice[i] || 0;
    const eH = (eVal / maxVal) * chartH;
    const sH = (sVal / maxVal) * chartH;

    const groupX = padLeft + (i * groupW) + (groupW / 2);
    const eX = groupX - barW - 2;
    const sX = groupX + 2;

    const eY = padTop + chartH - eH;
    const sY = padTop + chartH - sH;

    if (eH > 0) {
      barsSvg += `<rect x="${eX}" y="${eY}" width="${barW}" height="${eH}" rx="3" fill="#10b981" opacity="0.9"/>`;
    }
    if (sH > 0) {
      barsSvg += `<rect x="${sX}" y="${sY}" width="${barW}" height="${sH}" rx="3" fill="#ef4444" opacity="0.9"/>`;
    }

    // Label do dia no eixo X
    barsSvg += `<text x="${groupX}" y="${height - 10}" fill="#94a3b8" font-size="11" font-weight="600" text-anchor="middle">${lSlice[i]}</text>`;
  }

  // Linhas guia de grade
  let gridSvg = '';
  for (let g = 0; g <= 3; g++) {
    const yVal = padTop + (chartH / 3) * g;
    const valorGuia = maxVal * (1 - g / 3);
    gridSvg += `<line x1="${padLeft}" y1="${yVal}" x2="${width - padRight}" y2="${yVal}" stroke="#1e293b" stroke-dasharray="4,4" stroke-width="1"/>`;
    gridSvg += `<text x="${padLeft - 10}" y="${yVal + 4}" fill="#64748b" font-size="10" font-family="monospace" text-anchor="end">${formatarMoedaCurta(valorGuia)}</text>`;
  }

  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
    ${gridSvg}
    ${barsSvg}
  </svg>`;
}

/**
 * Gera string SVG limpa para o gráfico de Projeção de Saldo / Liquidez (Área / Linha).
 */
function gerarSVGProjecao(projecao = {}, width = 960, height = 180) {
  const labels = projecao.labels || [];
  const dados = projecao.saldoProjetado || [];

  if (labels.length === 0) {
    return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <text x="${width / 2}" y="${height / 2}" fill="#64748b" font-size="16" text-anchor="middle">Sem projeção disponível</text>
    </svg>`;
  }

  const padLeft = 70;
  const padRight = 30;
  const padTop = 20;
  const padBottom = 35;
  const chartW = width - padLeft - padRight;
  const chartH = height - padTop - padBottom;

  const minVal = Math.min(...dados, 0);
  const maxVal = Math.max(...dados, 1000);
  const range = maxVal - minVal || 1;

  const points = dados.map((v, i) => {
    const x = padLeft + (i / (dados.length - 1 || 1)) * chartW;
    const y = padTop + chartH - ((v - minVal) / range) * chartH;
    return { x, y, val: v, label: labels[i] };
  });

  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const areaD = `${pathD} L ${points[points.length - 1].x.toFixed(1)} ${padTop + chartH} L ${points[0].x.toFixed(1)} ${padTop + chartH} Z`;

  // Grid e eixo
  let gridSvg = '';
  for (let g = 0; g <= 2; g++) {
    const yVal = padTop + (chartH / 2) * g;
    const valorGuia = maxVal - (range / 2) * g;
    gridSvg += `<line x1="${padLeft}" y1="${yVal}" x2="${width - padRight}" y2="${yVal}" stroke="#1e293b" stroke-dasharray="4,4" stroke-width="1"/>`;
    gridSvg += `<text x="${padLeft - 10}" y="${yVal + 4}" fill="#64748b" font-size="10" font-family="monospace" text-anchor="end">${formatarMoedaCurta(valorGuia)}</text>`;
  }

  // Pontos de destaque e labels
  let circlesSvg = '';
  points.forEach((p, idx) => {
    circlesSvg += `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="4" fill="#38bdf8" stroke="#0b0f19" stroke-width="2"/>`;
    if (idx % 2 === 0 || idx === points.length - 1) {
      circlesSvg += `<text x="${p.x.toFixed(1)}" y="${height - 10}" fill="#94a3b8" font-size="10" font-weight="600" text-anchor="middle">${p.label}</text>`;
    }
  });

  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="projGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#38bdf8" stop-opacity="0.3"/>
        <stop offset="100%" stop-color="#38bdf8" stop-opacity="0.0"/>
      </linearGradient>
    </defs>
    ${gridSvg}
    <path d="${areaD}" fill="url(#projGrad)"/>
    <path d="${pathD}" fill="none" stroke="#38bdf8" stroke-width="3" stroke-linecap="round"/>
    ${circlesSvg}
  </svg>`;
}

/**
 * Gera o texto e indicadores do Relatório Executivo Matinal (Admin)
 */
function gerarRelatorioExecutivo(state = {}, options = {}) {
  const agoraSP = obterAgoraSP(options.dataRef);
  const dHoje = agoraSP.dataISO;
  const dataFormatada = agoraSP.dataBR;
  const horaFormatada = agoraSP.horaBR;

  const cfg = state.cfg || {};
  const fin = calcularKPIsFinanceiros(state, { ...options, dataRef: dHoje, filtro: 'hoje' });
  const op = calcularResumoOperacional(state, { ...options, dataRef: dHoje });

  const statusEmojis = {
    executando: '⚙️ Em Execução',
    peca: '🛑 PARADO POR PEÇA',
    aprovacao: '⏳ Aguardando Aprovação',
    fila: '📋 Na Fila de Espera',
    finalizada: '✅ Finalizada'
  };

  let texto =
`📊 *PÁTIO CRM — RELATÓRIO EXECUTIVO MATINAL* 🚛⚙️
📅 *Data:* ${dataFormatada} às ${horaFormatada}
🏢 *Oficina:* ${cfg.empresa || 'Auto Molas Fort'}

════════════════════════════
💰 *1. POSIÇÃO DE CAIXA & FLUXO*
════════════════════════════
💵 *Saldo Consolidado:* *${formatarMoeda(fin.saldoConsolidado)}*

📅 *Vencimentos de Hoje (${dataFormatada.slice(0, 5)}):*
• 🟢 *A Receber:* ${formatarMoeda(fin.totalRecHoje)} (${fin.qtdRecHoje} títulos)
• 🔴 *A Pagar:* ${formatarMoeda(fin.totalPagHoje)} (${fin.qtdPagHoje} contas)
• ⚖️ *Resultado Líquido do Dia:* ${fin.liquidoHoje >= 0 ? '+' : ''}${formatarMoeda(fin.liquidoHoje)}

🗓️ *Projeção dos Próximos 7 Dias (Semana):*
• 📈 *A Receber na Semana:* ${formatarMoeda(fin.totRec7d)} (${fin.totRec7d > 0 ? 'em aberto' : '0 títulos'})
• 📉 *A Pagar na Semana:* ${formatarMoeda(fin.totPag7d)} (${fin.totPag7d > 0 ? 'em aberto' : '0 contas'})
• 🏦 *Saldo Previsto ao Fim da Semana:* *${formatarMoeda(fin.saldoPrevisto7d)}*
`;

  if (fin.qtdRecVencidos > 0) {
    texto += `⚠️ *Atenção Cobrança:* ${fin.qtdRecVencidos} título(s) de clientes vencidos em aberto (${formatarMoeda(fin.totalRecVencidos)}).\n`;
  }

  texto +=
`\n════════════════════════════
🚛 *2. OCUPAÇÃO DO PÁTIO & BOXES*
════════════════════════════
• 🚚 *Total de Caminhões no Pátio:* ${op.totalOSAtivas}
• 🔧 *Boxes Ocupados:* ${op.boxesOcupados} de ${op.totalBoxes} (${op.percOcupacao}% capacidade)
• ⏳ *Aguardando na Fila de Triagem:* ${op.naFila}

════════════════════════════
🌅 *3. VEÍCULOS QUE AMANHECERAM NA OFICINA*
════════════════════════════
`;

  if (op.listaAmanhecidos.length === 0) {
    if (op.boxesOcupados === 0) {
      texto += `_Nenhum veículo amanheceu no pátio hoje. Capacidade 100% livre para novos atendimentos!_\n`;
    } else {
      texto += `_Nenhum veículo amanheceu no pátio nesta data. Ocupação atual: ${op.boxesOcupados} de ${op.totalBoxes} boxes ocupados (${op.percOcupacao}%)._\n`;
    }
  } else {
    op.listaAmanhecidos.forEach(item => {
      texto += `${item.idx}️⃣ *${item.placa}* — ${item.modelo} (${item.clienteNome})\n`;
      texto += `   📍 *Local:* ${item.boxNome} | 👨‍🔧 ${item.mecanico} | ⏳ *No pátio há:* ${item.diasNoPatio} dia(s)\n`;
      texto += `   🔧 *Serviço:* ${item.servico}\n`;
      texto += `   📌 *Status:* *${statusEmojis[item.status] || item.status}*\n`;
      if (item.obsPeca) {
        texto += `   🚨 *Atenção Fornecedor:* _${item.obsPeca}_\n`;
      }
      if (item.previsao) {
        texto += `   🎯 _Previsão de Entrega: ${item.previsao}_\n`;
      }
      texto += `\n`;
    });
  }

  texto +=
`════════════════════════════
_📱 Relatório gerado automaticamente pelo Pátio CRM._
_💡 Comandos rápidos para admin: *!relatorio*, *!caixa* ou *!patio*_`;

  return {
    texto,
    financeiro: fin,
    operacional: op,
    indicadores: {
      data: dHoje,
      saldoCaixa: fin.saldoConsolidado,
      totRecHoje: fin.totalRecHoje,
      totPagHoje: fin.totalPagHoje,
      liquidoHoje: fin.liquidoHoje,
      totRecSemana: fin.totRec7d,
      totPagSemana: fin.totPag7d,
      saldoPrevistoSemana: fin.saldoPrevisto7d,
      totVencidosRec: fin.totalRecVencidos,
      totalOSAtivas: op.totalOSAtivas,
      boxesOcupados: op.boxesOcupados,
      totalBoxes: op.totalBoxes,
      naFila: op.naFila,
      totalAmanhecidos: op.totalAmanhecidos
    }
  };
}

/**
 * Gera as 3 mensagens temáticas para o Grupo da Administração
 */
function gerarMensagensAdmin(state = {}, options = {}) {
  const agoraSP = obterAgoraSP(options.dataRef);
  const dHoje = agoraSP.dataISO;
  const dataFormatada = agoraSP.dataBR;
  const horaFormatada = agoraSP.horaBR;

  const rel = gerarRelatorioExecutivo(state, { ...options, dataRef: dHoje });
  const fin = rel.financeiro;
  const op = rel.operacional;
  const cfg = state.cfg || {};

  const statusEmojis = {
    executando: '⚙️ Em Execução',
    peca: '🛑 PARADO POR PEÇA',
    aprovacao: '⏳ Aguardando Aprovação',
    fila: '📋 Na Fila de Espera',
    finalizada: '✅ Finalizada'
  };

  // MSG 1: Finanças & Fluxo
  let msg1 = `📊 *[1/3] PÁTIO CRM — POSIÇÃO DE CAIXA & FLUXO* 💰\n` +
    `🏢 *Oficina:* ${cfg.empresa || 'Auto Molas Fort'} | 📅 *${dataFormatada}* às *${horaFormatada}*\n\n` +
    `💵 *Saldo Consolidado em Caixa:* *${formatarMoeda(fin.saldoConsolidado)}*\n\n` +
    `📅 *Vencimentos de Hoje (${dataFormatada.slice(0, 5)}):*\n` +
    `• 🟢 *A Receber:* ${formatarMoeda(fin.totalRecHoje)} (${fin.qtdRecHoje} títulos)\n` +
    `• 🔴 *A Pagar:* ${formatarMoeda(fin.totalPagHoje)} (${fin.qtdPagHoje} contas)\n` +
    `• ⚖️ *Resultado Líquido do Dia:* ${fin.liquidoHoje >= 0 ? '+' : ''}${formatarMoeda(fin.liquidoHoje)}\n\n` +
    `🗓️ *Projeção dos Próximos 7 Dias (Semana):*\n` +
    `• 📈 *A Receber na Semana:* ${formatarMoeda(fin.totRec7d)}\n` +
    `• 📉 *A Pagar na Semana:* ${formatarMoeda(fin.totPag7d)}\n` +
    `• 🏦 *Saldo Previsto ao Fim da Semana:* *${formatarMoeda(fin.saldoPrevisto7d)}*\n`;
  if (fin.qtdRecVencidos > 0) {
    msg1 += `⚠️ *Atenção Cobrança:* Títulos de clientes vencidos em aberto: *${formatarMoeda(fin.totalRecVencidos)}*.\n`;
  }

  // MSG 2: Pátio & Boxes
  let msg2 = `🚛 *[2/3] PÁTIO CRM — OCUPAÇÃO DO PÁTIO & BOXES* ⚙️\n\n` +
    `• 🚚 *Total de Caminhões no Pátio:* ${op.totalOSAtivas}\n` +
    `• 🔧 *Boxes Ocupados:* ${op.boxesOcupados} de ${op.totalBoxes} (${op.percOcupacao}% da capacidade)\n` +
    `• ⏳ *Aguardando na Fila de Triagem:* ${op.naFila} caminhões\n`;

  // MSG 3: Caminhões Amanhecidos
  let msg3 = `🌅 *[3/3] PÁTIO CRM — CAMINHÕES QUE AMANHECERAM* 🚛\n` +
    `Prioridades de atendimento para o dia de hoje:\n\n`;

  if (op.listaAmanhecidos.length === 0) {
    if (op.boxesOcupados === 0) {
      msg3 += `_Nenhum veículo amanheceu no pátio. Todos os boxes livres para novos atendimentos!_\n`;
    } else {
      msg3 += `_Nenhum veículo amanheceu no pátio. Ocupação atual: ${op.boxesOcupados} de ${op.totalBoxes} boxes ocupados (${op.percOcupacao}%)._\n`;
    }
  } else {
    op.listaAmanhecidos.forEach((item) => {
      msg3 += `${item.idx}️⃣ *${item.placa}* — ${item.modelo} (${item.clienteNome})\n` +
        `   📍 *Local:* ${item.boxNome} | 👨‍🔧 ${item.mecanico} | ⏳ *No pátio há:* ${item.diasNoPatio} dia(s)\n` +
        `   🔧 *Serviço:* ${item.servico}\n` +
        `   📌 *Status:* *${statusEmojis[item.status] || item.status}*\n`;

      if (item.obsPeca) {
        msg3 += `   🚨 *Atenção Fornecedor:* _${item.obsPeca}_\n`;
      }
      if (item.previsao) {
        msg3 += `   🎯 _Previsão de Entrega: ${item.previsao}_\n`;
      }
      msg3 += `\n`;
    });
  }
  msg3 += `════════════════════════════\n_💡 Comandos para Admin: *!relatorio*, *!caixa*, *!patio* ou *!ajuda*_`;

  return [msg1, msg2, msg3];
}

/**
 * Gera as 2 mensagens temáticas para o Grupo da Operação (Zero dados financeiros)
 */
function gerarMensagensOperacao(state = {}, options = {}) {
  const agoraSP = obterAgoraSP(options.dataRef);
  const dHoje = agoraSP.dataISO;
  const dataFormatada = agoraSP.dataBR;
  const horaFormatada = agoraSP.horaBR;

  const op = calcularResumoOperacional(state, { ...options, dataRef: dHoje });
  const cfg = state.cfg || {};

  const statusEmojis = {
    executando: '⚙️ Em Execução',
    peca: '🛑 PARADO POR PEÇA',
    aprovacao: '⏳ Aguardando Aprovação',
    fila: '📋 Na Fila de Espera',
    finalizada: '✅ Finalizada'
  };

  // MSG 1: Posição do Pátio Operacional
  let msg1 = `🚛 *[1/2] PÁTIO OPERACIONAL — OCUPAÇÃO DOS BOXES* ⚙️\n` +
    `🏢 *Oficina:* ${cfg.empresa || 'Auto Molas Fort'} | 📅 *${dataFormatada}* às *${horaFormatada}*\n\n` +
    `• 🚚 *Total de Caminhões em Atendimento:* ${op.totalOSAtivas}\n` +
    `• 🔧 *Boxes Ocupados:* ${op.boxesOcupados} de ${op.totalBoxes} (${op.percOcupacao}% da capacidade produtiva)\n` +
    `• ⏳ *Aguardando na Fila de Triagem:* ${op.naFila} caminhões\n\n` +
    `_Lembrete equipe: mantenham os status dos boxes atualizados ao liberar veículos!_`;

  // MSG 2: Caminhões que Amanheceram
  let msg2 = `🌅 *[2/2] PÁTIO OPERACIONAL — VEÍCULOS QUE AMANHECERAM* 🚛\n` +
    `Relação de veículos que passaram a noite na oficina para priorização do dia:\n\n`;

  if (op.listaAmanhecidos.length === 0) {
    if (op.boxesOcupados === 0) {
      msg2 += `_Nenhum veículo amanheceu no pátio. Todos os boxes livres para novas entradas!_\n`;
    } else {
      msg2 += `_Nenhum veículo amanheceu no pátio. Pátio operando com ${op.boxesOcupados} de ${op.totalBoxes} boxes ocupados (${op.percOcupacao}%)._\n`;
    }
  } else {
    op.listaAmanhecidos.forEach((item) => {
      msg2 += `${item.idx}️⃣ *${item.placa}* — ${item.modelo} (${item.clienteNome})\n` +
        `   📍 *Local:* ${item.boxNome} | 👨‍🔧 ${item.mecanico}\n` +
        `   ⏳ *No pátio há:* ${item.diasNoPatio} dia(s)\n` +
        `   🔧 *Serviço:* ${item.servico}\n` +
        `   📌 *Status:* *${statusEmojis[item.status] || item.status}*\n`;

      if (item.obsPeca) {
        msg2 += `   ⚠️ *Peça Pendente:* _${item.obsPeca}_\n`;
      }
      if (item.previsao) {
        msg2 += `   🎯 _Previsão de Entrega: ${item.previsao}_\n`;
      }
      msg2 += `\n`;
    });
  }

  msg2 += `════════════════════════════\n` +
    `_💡 Comandos no grupo: *!patio*, *Status [placa]*, *Abrir OS [placa]* ou envie foto da placa_`;

  return [msg1, msg2];
}

function gerarResumoCaixa(state = {}, options = {}) {
  const agoraSP = obterAgoraSP(options.dataRef);
  const rel = gerarRelatorioExecutivo(state, options);
  const fin = rel.financeiro;
  const d = agoraSP.dataBR;
  return `💰 *POSIÇÃO FINANCEIRA RÁPIDA (${d})* 🚛\n\n` +
    `💵 *Saldo em Caixa:* *${formatarMoeda(fin.saldoConsolidado)}*\n\n` +
    `📅 *Hoje:* A Receber ${formatarMoeda(fin.totalRecHoje)} | A Pagar ${formatarMoeda(fin.totalPagHoje)}\n` +
    `🗓️ *Semana (7d):* A Receber ${formatarMoeda(fin.totRec7d)} | A Pagar ${formatarMoeda(fin.totPag7d)}\n` +
    `🏦 *Saldo Projetado ao Fim da Semana:* *${formatarMoeda(fin.saldoPrevisto7d)}*\n\n` +
    `_Digite *!relatorio* para a visão executiva completa._`;
}

function gerarResumoPatio(state = {}, options = {}) {
  const rel = gerarRelatorioExecutivo(state, options);
  const op = rel.operacional;
  return `🚛 *OCUPAÇÃO ATUAL DO PÁTIO* ⚙️\n\n` +
    `• Total de Caminhões na Oficina: *${op.totalOSAtivas}*\n` +
    `• Boxes Ocupados: *${op.boxesOcupados} de ${op.totalBoxes}*\n` +
    `• Caminhões na Fila de Espera: *${op.naFila}*\n` +
    `• Amanheceram na Oficina: *${op.totalAmanhecidos}*\n\n` +
    `_Digite *!relatorio* para ver os detalhes de cada caminhão e serviços._`;
}

module.exports = {
  FUSO_HORARIO_PADRAO,
  obterAgoraSP,
  formatarMoeda,
  formatarMoedaCurta,
  dataISO,
  addDias,
  diasEntre,
  formatarDataBR,
  formatarDataBRFull,
  obterIntervaloFiltro,
  calcularKPIsFinanceiros,
  calcularResumoOperacional,
  gerarSeriesGraficos,
  obterDashboardFinanceiro,
  gerarSVGBarrasFluxo,
  gerarSVGProjecao,
  gerarRelatorioExecutivo,
  gerarMensagensAdmin,
  gerarMensagensOperacao,
  gerarResumoCaixa,
  gerarResumoPatio
};
