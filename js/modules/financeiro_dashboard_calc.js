/* =====================================================================
   PÁTIO CRM — MOTOR FINANCEIRO & CÁLCULOS DE DASHBOARD
===================================================================== */

function calcularDashboardFin(filtro = '30d', customDe = null, customAte = null) {
  const ref = hoje();
  let de = addDias(ref, -29);
  let ate = ref;

  if (filtro === 'hoje') {
    de = ref; ate = ref;
  } else if (filtro === '7d') {
    de = addDias(ref, -6); ate = ref;
  } else if (filtro === '15d') {
    de = addDias(ref, -14); ate = ref;
  } else if (filtro === '30d') {
    de = addDias(ref, -29); ate = ref;
  } else if (filtro === 'mes') {
    const dObj = new Date(ref + 'T12:00:00');
    const ano = dObj.getFullYear();
    const mes = String(dObj.getMonth() + 1).padStart(2, '0');
    de = `${ano}-${mes}-01`;
    const ult = new Date(ano, dObj.getMonth() + 1, 0).getDate();
    ate = `${ano}-${mes}-${String(ult).padStart(2, '0')}`;
  } else if (filtro === 'mes_anterior') {
    const dObj = new Date(ref + 'T12:00:00');
    const ant = new Date(dObj.getFullYear(), dObj.getMonth() - 1, 1);
    const ano = ant.getFullYear();
    const mes = String(ant.getMonth() + 1).padStart(2, '0');
    de = `${ano}-${mes}-01`;
    const ult = new Date(ano, ant.getMonth() + 1, 0).getDate();
    ate = `${ano}-${mes}-${String(ult).padStart(2, '0')}`;
  } else if (filtro === 'custom' && customDe && customAte) {
    de = customDe; ate = customAte;
  }

  const ini = Number(S.cfg?.saldoInicial) || 0;
  const movs = S.movimentos || [];
  const contas = S.contas || [];

  // Saldo geral consolidado (Toda a história)
  const totalEnt = soma(movs.filter(m => m.tipo === 'entrada'), m => m.valor);
  const totalSai = soma(movs.filter(m => m.tipo === 'saida'), m => m.valor);
  const saldoConsolidado = +(ini + totalEnt - totalSai).toFixed(2);

  // No período selecionado
  const movsPeriodo = movs.filter(m => (m.data || '').slice(0, 10) >= de && (m.data || '').slice(0, 10) <= ate);
  const entPeriodo = soma(movsPeriodo.filter(m => m.tipo === 'entrada'), m => m.valor);
  const saiPeriodo = soma(movsPeriodo.filter(m => m.tipo === 'saida'), m => m.valor);
  const resultadoPeriodo = +(entPeriodo - saiPeriodo).toFixed(2);

  // Contas em aberto
  const emAb = contas.filter(c => !c.pago);
  const rec = emAb.filter(c => c.tipo === 'receber');
  const pag = emAb.filter(c => c.tipo === 'pagar');

  const totRec = soma(rec, c => c.valor);
  const totPag = soma(pag, c => c.valor);
  const recVenc = soma(rec.filter(c => c.venc < ref), c => c.valor);
  const pagVenc = soma(pag.filter(c => c.venc < ref), c => c.valor);
  const recHoje = soma(rec.filter(c => c.venc === ref), c => c.valor);
  const pagHoje = soma(pag.filter(c => c.venc === ref), c => c.valor);

  const taxaInad = totRec > 0 ? +((recVenc / totRec) * 100).toFixed(1) : 0;

  // Projeção 30 dias
  const d30 = addDias(ref, 30);
  const recFut = soma(rec.filter(c => c.venc >= ref && c.venc <= d30), c => c.valor);
  const pagFut = soma(pag.filter(c => c.venc >= ref && c.venc <= d30), c => c.valor);
  const saldoProjetado30d = +(saldoConsolidado + recFut - pagFut).toFixed(2);

  // Resumo de Origem (WhatsApp vs Web e Estornos)
  const movsWhatsapp = movsPeriodo.filter(m => m.origem === 'whatsapp');
  const movsWeb = movsPeriodo.filter(m => (m.origem || 'web') !== 'whatsapp');
  const movsEstornados = movsPeriodo.filter(m => Boolean(m.estornado));

  const totalWhatsapp = +soma(movsWhatsapp, m => m.valor).toFixed(2);
  const totalWeb = +soma(movsWeb, m => m.valor).toFixed(2);
  const totalEstornados = +soma(movsEstornados, m => m.valor).toFixed(2);

  const resumoOrigem = {
    totalWhatsapp,
    qtdWhatsapp: movsWhatsapp.length,
    totalWeb,
    qtdWeb: movsWeb.length,
    totalEstornados,
    qtdEstornados: movsEstornados.length
  };

  return {
    filtro, de, ate, ref,
    saldoConsolidado, saldoInicial: ini,
    entPeriodo, saiPeriodo, resultadoPeriodo,
    totRec, totPag, recVenc, pagVenc, recHoje, pagHoje,
    qtdRec: rec.length, qtdPag: pag.length,
    qtdRecVenc: rec.filter(c => c.venc < ref).length,
    qtdPagVenc: pag.filter(c => c.venc < ref).length,
    taxaInad, saldoProjetado30d,
    movsPeriodo,
    resumoOrigem
  };
}

function agingReceber() {
  const dH = hoje();
  const rec = emAberto('receber');
  let vencido = 0, ate7d = 0, ate30d = 0, mais30d = 0;

  rec.forEach(c => {
    const diff = diasEntre(dH, c.venc);
    if (diff < 0) vencido += c.valor;
    else if (diff <= 7) ate7d += c.valor;
    else if (diff <= 30) ate30d += c.valor;
    else mais30d += c.valor;
  });

  return { vencido, ate7d, ate30d, mais30d };
}

function categorizarContas(tipo) {
  const contas = emAberto(tipo);
  const mapa = {};
  contas.forEach(c => {
    const cat = c.cat || 'Outros';
    mapa[cat] = (mapa[cat] || 0) + c.valor;
  });
  return Object.entries(mapa).map(([cat, total]) => ({ cat, total })).sort((a, b) => b.total - a.total);
}

if (typeof window !== 'undefined') {
  window.calcularDashboardFin = calcularDashboardFin;
  window.agingReceber = agingReceber;
  window.categorizarContas = categorizarContas;
}
if (typeof globalThis !== 'undefined') {
  globalThis.calcularDashboardFin = calcularDashboardFin;
  globalThis.agingReceber = agingReceber;
  globalThis.categorizarContas = categorizarContas;
}

