/* =====================================================================
   PÁTIO CRM — ANALISTA FINANCEIRA: CÁLCULOS & PROJEÇÕES
   Cálculo de Caixa Aberto, Previsão (Forecast), Controles Internos e DRE
   ===================================================================== */

function obterCaixaAbertoFrontend() {
  const caixas = Array.isArray(S.caixas) ? S.caixas : [];
  return caixas.find(c => c.status === 'aberto') || null;
}

function calcularPrevisaoFrontend(horizonteDias = 30) {
  const hojeRef = (typeof hoje === 'function' ? hoje() : new Date().toISOString().slice(0, 10));
  const saldoAtual = typeof saldoCaixa === 'function' ? saldoCaixa() : 0;
  const contas = Array.isArray(S.contas) ? S.contas : [];
  const osList = Array.isArray(S.os) ? S.os : [];
  const orcamentos = Array.isArray(S.quotations) ? S.quotations : (Array.isArray(S.orcamentos) ? S.orcamentos : []);
  const cfg = S.cfg || {};
  const caixaMinimo = Number(cfg.caixaMinimoSeguranca || 2000);

  const dataFim = typeof addDias === 'function' ? addDias(hojeRef, horizonteDias) : hojeRef;

  const recNoPeriodo = contas.filter(c => c.tipo === 'receber' && !c.pago && c.venc >= hojeRef && c.venc <= dataFim);
  const pagNoPeriodo = contas.filter(c => c.tipo === 'pagar' && !c.pago && c.venc >= hojeRef && c.venc <= dataFim);

  const totRec = recNoPeriodo.reduce((a, b) => a + (Number(b.valor) || 0), 0);
  const totPag = pagNoPeriodo.reduce((a, b) => a + (Number(b.valor) || 0), 0);

  // OS no Pátio (não finalizadas e não canceladas)
  const osAtivas = osList.filter(o => o.st !== 'finalizada' && o.st !== 'cancelada');
  const valorOSAtivas = osAtivas.reduce((a, b) => a + (Number(b.total || b.valorTotal) || 0), 0);

  const orcPendentes = orcamentos.filter(q => ['enviado', 'pendente', 'aguardando_aprovacao', 'rascunho'].includes(String(q.status || '').toLowerCase()));
  const valorOrcPendentes = orcPendentes.reduce((a, b) => a + (Number(b.totalGeral || b.valorTotal) || 0), 0);

  const potencialProvavel = (valorOSAtivas * 0.8) + (valorOrcPendentes * 0.4);
  const potencialConservador = (valorOSAtivas * 0.5) + (valorOrcPendentes * 0.15);

  // Projeção dia a dia para marcos e diagnóstico
  let saldoAcum = saldoAtual;
  let menorSaldo = saldoAtual;
  let dataPrimeiroFuro = null;
  let temFuro = false;

  const marcos = { '7d': saldoAtual, '15d': saldoAtual, '30d': saldoAtual };

  for (let d = 0; d <= horizonteDias; d++) {
    const dt = typeof addDias === 'function' ? addDias(hojeRef, d) : hojeRef;
    const recD = recNoPeriodo.filter(c => (c.venc || '').slice(0, 10) === dt).reduce((a, b) => a + (Number(b.valor) || 0), 0);
    const pagD = pagNoPeriodo.filter(c => (c.venc || '').slice(0, 10) === dt).reduce((a, b) => a + (Number(b.valor) || 0), 0);
    saldoAcum = saldoAcum + recD - pagD;

    if (saldoAcum < menorSaldo) menorSaldo = saldoAcum;
    if (saldoAcum < caixaMinimo && !dataPrimeiroFuro) {
      dataPrimeiroFuro = dt;
      temFuro = true;
    }
    if (d === 7) marcos['7d'] = saldoAcum;
    if (d === 15) marcos['15d'] = saldoAcum;
    if (d === 30) marcos['30d'] = saldoAcum;
  }

  return {
    hojeRef,
    saldoAtual,
    caixaMinimo,
    totRec,
    totPag,
    saldoPrevisto30d: saldoAcum,
    marcos,
    potencialProvavel,
    potencialConservador,
    valorOSAtivas,
    valorOrcPendentes,
    temFuro,
    menorSaldo,
    dataPrimeiroFuro
  };
}

function calcularControlesInternosFrontend() {
  const contas = Array.isArray(S.contas) ? S.contas : [];
  const osList = Array.isArray(S.os) ? S.os : [];
  const movimentos = Array.isArray(S.movimentos) ? S.movimentos : [];
  const hojeRef = (typeof hoje === 'function' ? hoje() : new Date().toISOString().slice(0, 10));

  const anomalias = [];

  // 1. OS Finalizada sem financeiro
  const osSemFin = osList.filter(o => {
    if (o.st !== 'finalizada') return false;
    const temConta = contas.some(c => c.osId === o.id || c.osNum === o.num || (c.desc && c.desc.includes(`OS #${o.num}`)));
    const temMov = movimentos.some(m => m.osId === o.id || m.osNum === o.num || (m.desc && m.desc.includes(`OS #${o.num}`)));
    return !temConta && !temMov;
  });

  if (osSemFin.length > 0) {
    const valTotal = osSemFin.reduce((a, b) => a + (Number(b.total || b.valorTotal) || 0), 0);
    anomalias.push({
      severidade: 'critico',
      titulo: 'Vazamento de Receita: OS Finalizada sem Registro Financeiro',
      descricao: `${osSemFin.length} OS finalizadas no pátio somando ${typeof brl === 'function' ? brl(valTotal) : valTotal} não possuem título a receber ou lançamento de caixa vinculado.`,
      recomendacao: 'Fature as ordens pendentes ou gere o recebimento imediato para conciliação contábil.',
      itens: osSemFin.slice(0, 5).map(o => `OS #${o.num} (${typeof brl === 'function' ? brl(o.total || 0) : o.total})`)
    });
  }

  // 2. Inadimplência Crítica
  const titulosVencidos = contas.filter(c => c.tipo === 'receber' && !c.pago && c.venc < hojeRef);
  if (titulosVencidos.length > 0) {
    const valVenc = titulosVencidos.reduce((a, b) => a + (Number(b.valor) || 0), 0);
    anomalias.push({
      severidade: 'alerta',
      titulo: 'Inadimplência de Clientes: Títulos Vencidos',
      descricao: `${titulosVencidos.length} títulos de clientes vencidos totalizando ${typeof brl === 'function' ? brl(valVenc) : valVenc}.`,
      recomendacao: 'Acione a régua de cobrança automática via WhatsApp da Verônica para os devedores prioritários.',
      itens: titulosVencidos.slice(0, 5).map(c => `${c.parte || 'Cliente'}: ${typeof brl === 'function' ? brl(c.valor) : c.valor}`)
    });
  }

  // 3. Contas a pagar em atraso
  const pagarVencidos = contas.filter(c => c.tipo === 'pagar' && !c.pago && c.venc < hojeRef);
  if (pagarVencidos.length > 0) {
    const valPagVenc = pagarVencidos.reduce((a, b) => a + (Number(b.valor) || 0), 0);
    anomalias.push({
      severidade: 'alerta',
      titulo: 'Compromissos Fornecedores em Atraso',
      descricao: `${pagarVencidos.length} contas a pagar com vencimento ultrapassado, totalizando ${typeof brl === 'function' ? brl(valPagVenc) : valPagVenc}.`,
      recomendacao: 'Renegocie prazos ou priorize a liquidação para evitar juros e suspensão de crédito com fornecedores de autopeças.'
    });
  }

  return anomalias;
}

function calcularDREFrontend() {
  const movs = Array.isArray(S.movimentos) ? S.movimentos : [];
  let recBruta = 0;
  let despOper = 0;
  let sup = 0;
  let sang = 0;
  let qtdRec = 0;
  let qtdDesp = 0;

  movs.forEach(m => {
    if (m.estornado) return;
    const v = Number(m.valor) || 0;
    const nat = m.naturezaOperacao || (m.subtipo === 'sangria' ? 'sangria' : (m.subtipo === 'suprimento' ? 'suprimento' : (m.subtipo === 'estorno' || m.estornoDeId ? 'estorno' : 'operacional')));
    if (nat === 'suprimento' || m.subtipo === 'suprimento') {
      sup += v;
    } else if (nat === 'sangria' || m.subtipo === 'sangria') {
      sang += v;
    } else if (nat === 'estorno' || m.estornoDeId || m.subtipo === 'estorno') {
      // neutro
    } else {
      if (m.tipo === 'entrada' || m.tipo === 'receita') {
        recBruta += v;
        qtdRec++;
      } else if (m.tipo === 'saida' || m.tipo === 'despesa') {
        despOper += v;
        qtdDesp++;
      }
    }
  });

  const lucro = +(recBruta - despOper).toFixed(2);
  const margem = recBruta > 0 ? +((lucro / recBruta) * 100).toFixed(2) : 0;

  let custoPecasAplicadasOS = 0;
  const osLista = Array.isArray(S.os) ? S.os : [];
  for (const o of osLista) {
    if (o.st !== 'cancelada') {
      const pecas = Array.isArray(o.pecasUtilizadas) ? o.pecasUtilizadas : [];
      for (const p of pecas) {
        custoPecasAplicadasOS = +(custoPecasAplicadasOS + Number(p.subtotal || (p.quantidade * (p.valorUnitario || 0)))).toFixed(2);
      }
    }
  }

  return {
    recBruta,
    despOper,
    custoPecasAplicadasOS,
    lucro,
    margem,
    sup,
    sang,
    saldoTesouraria: +(sup - sang).toFixed(2),
    qtdRec,
    qtdDesp
  };
}

if (typeof window !== 'undefined') {
  window.obterCaixaAbertoFrontend = obterCaixaAbertoFrontend;
  window.calcularPrevisaoFrontend = calcularPrevisaoFrontend;
  window.calcularControlesInternosFrontend = calcularControlesInternosFrontend;
  window.calcularDREFrontend = calcularDREFrontend;
}

