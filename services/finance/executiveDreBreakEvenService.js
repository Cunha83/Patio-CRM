'use strict';

/**
 * services/finance/executiveDreBreakEvenService.js
 * Motor de DRE Gerencial Dual (Competência vs. Caixa), Ponto de Equilíbrio e Rentabilidade.
 * Teto Modular: <= 350 linhas
 */

function round2(v) {
  return Math.round((Number(v) || 0) * 100) / 100;
}

function garantirColecoes(state) {
  if (!state) throw new Error('Estado da aplicação não informado.');
  if (!Array.isArray(state.os)) state.os = [];
  if (!Array.isArray(state.contas)) state.contas = [];
  if (!Array.isArray(state.estoque)) state.estoque = Array.isArray(state.pecas) ? state.pecas : [];
  if (!Array.isArray(state.commissionPayrolls)) state.commissionPayrolls = [];
  if (!Array.isArray(state.reworkRecords)) state.reworkRecords = [];
  if (!Array.isArray(state.borderoSettlements)) state.borderoSettlements = [];
  if (!Array.isArray(state.whatsappAgentLogs)) state.whatsappAgentLogs = [];
}

function calcularCmvPecasOS(os, estoque = []) {
  let cmv = 0;
  if (!Array.isArray(os?.pecas)) return 0;
  for (const p of os.pecas) {
    if (p.statusItem === 'aprovado' || (!p.statusItem && p.status !== 'recusado' && p.status !== 'adiado')) {
      const qtd = Number(p.qtd || p.quantidade || 1);
      let cUnit = p.custoMedio != null ? Number(p.custoMedio) : (p.custoUnitario != null ? Number(p.custoUnitario) : Number(p.custo || 0));
      if (!cUnit) {
        const e = estoque.find(it => it.id === p.pecaId || it.codigo === p.codigo);
        cUnit = Number(e?.custoMedio || e?.custo || 0);
      }
      cmv += qtd * cUnit;
    }
  }
  return round2(cmv);
}

function extrairReceitasOS(os) {
  let srv = os.totalServicos != null ? Number(os.totalServicos) : 0;
  let pec = os.totalPecas != null ? Number(os.totalPecas) : 0;
  if (os.totalServicos == null && Array.isArray(os.servicos)) {
    for (const s of os.servicos) if (s.statusItem === 'aprovado' || (!s.statusItem && s.status !== 'recusado' && s.status !== 'adiado')) srv += Number(s.valor || s.preco || s.total || 0);
  }
  if (os.totalPecas == null && Array.isArray(os.pecas)) {
    for (const p of os.pecas) if (p.statusItem === 'aprovado' || (!p.statusItem && p.status !== 'recusado' && p.status !== 'adiado')) pec += Number(p.total != null ? p.total : ((p.valor || p.preco || 0) * (p.qtd || 1)));
  }
  let tot = round2(srv + pec);
  if (tot === 0 && (os.total != null || os.valorTotal != null)) tot = Number(os.total != null ? os.total : os.valorTotal);
  return { srv: round2(srv), pec: round2(pec), tot: round2(tot) };
}

function apurarDreGerencialCompetenciaECaixa(state, { competencia = null, aliquotaImpostoPadrao = 8 } = {}) {
  garantirColecoes(state);
  const comp = competencia || new Date().toISOString().slice(0, 7);
  const aliq = Number(aliquotaImpostoPadrao) || 8;

  const ossComp = state.os.filter(os => {
    if (os.tipoOS === 'garantia_retrabalho' || String(os.st || os.status || '').toLowerCase() === 'cancelada') return false;
    const dt = String(os.fechamento || os.dataFinalizacao || os.data || os.abertura || '').slice(0, 7);
    return !dt || dt === comp;
  });

  // Competência
  let recSrvComp = 0, recPecComp = 0, cmvComp = 0;
  for (const os of ossComp) {
    const r = extrairReceitasOS(os);
    recSrvComp += r.srv;
    recPecComp += r.pec;
    cmvComp += calcularCmvPecasOS(os, state.estoque);
  }
  recSrvComp = round2(recSrvComp);
  recPecComp = round2(recPecComp);
  cmvComp = round2(cmvComp);
  let recBrutaComp = round2(recSrvComp + recPecComp);
  if (recBrutaComp === 0 && ossComp.length > 0) {
    recBrutaComp = round2(ossComp.reduce((acc, o) => acc + Number(o.total != null ? o.total : (o.valorTotal || 0)), 0));
  }
  const impComp = round2(recBrutaComp * (aliq / 100));
  const recLiqComp = round2(recBrutaComp - impComp);

  let comissoesComp = 0;
  const folhas = state.commissionPayrolls.filter(f => f.competencia === comp);
  if (folhas.length > 0) {
    for (const f of folhas) comissoesComp += Number(f.resumo?.valorLiquidoPagar ?? f.resumo?.totalComissao ?? f.valorTotal ?? 0);
  } else {
    for (const c of state.contas) {
      const dt = String(c.competencia || c.vencimento || c.data || '').slice(0, 7);
      const cat = String(c.cat || c.categoria || '').toLowerCase();
      if ((!dt || dt === comp) && (cat === 'comissao_mecanico' || cat === 'comissao')) comissoesComp += Number(c.valor || 0);
    }
  }
  comissoesComp = round2(comissoesComp);
  const margemContrComp = round2(recLiqComp - cmvComp - comissoesComp);
  const indMargemContrComp = recBrutaComp > 0 ? round2((margemContrComp / recBrutaComp) * 100) : 0;

  let despFixasComp = 0;
  for (const c of state.contas) {
    if (c.tipo !== 'pagar') continue;
    const cat = String(c.cat || c.categoria || '').toLowerCase();
    if (cat === 'fornecedor_pecas' || cat === 'comissao_mecanico') continue;
    const dt = String(c.competencia || c.vencimento || c.dataVencimento || c.data || '').slice(0, 7);
    if (!dt || dt === comp) despFixasComp += Number(c.valor || 0);
  }
  despFixasComp = round2(despFixasComp);
  const lucroLiqComp = round2(margemContrComp - despFixasComp);
  const margemLiqComp = recBrutaComp > 0 ? round2((lucroLiqComp / recBrutaComp) * 100) : 0;

  // Caixa
  let recBrutaCaixa = 0, cmvCaixa = 0;
  for (const os of state.os) {
    if (os.tipoOS === 'garantia_retrabalho' || String(os.st || '').toLowerCase() === 'cancelada') continue;
    const dtPgto = String(os.dataPagamento || os.fechamento || os.data || '').slice(0, 7);
    if ((os.pago === true || os.statusPagamento === 'pago') && (!dtPgto || dtPgto === comp)) {
      recBrutaCaixa += Number(os.total != null ? os.total : (os.valorTotal || 0));
      cmvCaixa += calcularCmvPecasOS(os, state.estoque);
    }
  }
  for (const s of state.borderoSettlements) {
    const dtLiq = String(s.dataLiquidacao || s.data || s.timestamp || '').slice(0, 7);
    if (!dtLiq || dtLiq === comp) recBrutaCaixa += Number(s.valorLiquidado || s.valorPago || 0);
  }
  for (const c of state.contas) {
    if (c.tipo === 'receber' && (c.status === 'pago' || c.pago === true) && !c.osId && !c.borderoId) {
      const dt = String(c.dataPagamento || c.baixa || c.vencimento || c.data || '').slice(0, 7);
      if (!dt || dt === comp) recBrutaCaixa += Number(c.valorPago || c.valor || 0);
    }
  }
  recBrutaCaixa = round2(recBrutaCaixa);
  cmvCaixa = round2(cmvCaixa);
  const impCaixa = round2(recBrutaCaixa * (aliq / 100));
  const recLiqCaixa = round2(recBrutaCaixa - impCaixa);

  let despFixasCaixa = 0, comissoesCaixa = 0;
  for (const c of state.contas) {
    if (c.tipo !== 'pagar' || (c.status !== 'pago' && !c.pago)) continue;
    const cat = String(c.cat || c.categoria || '').toLowerCase();
    const dt = String(c.dataPagamento || c.competencia || c.vencimento || c.data || '').slice(0, 7);
    if (dt && dt !== comp) continue;
    if (cat === 'comissao_mecanico') comissoesCaixa += Number(c.valorPago || c.valor || 0);
    else if (cat !== 'fornecedor_pecas') despFixasCaixa += Number(c.valorPago || c.valor || 0);
  }
  despFixasCaixa = round2(despFixasCaixa);
  comissoesCaixa = round2(comissoesCaixa);
  const lucroLiqCaixa = round2(recLiqCaixa - cmvCaixa - comissoesCaixa - despFixasCaixa);

  return {
    ok: true,
    competencia: comp,
    regimeCompetencia: {
      receitaBrutaServicos: recSrvComp,
      receitaBrutaPecas: recPecComp,
      receitaBrutaTotal: recBrutaComp,
      impostosDeduzidos: impComp,
      receitaLiquida: recLiqComp,
      cmvPecasCMP: cmvComp,
      custoComissoesTecnicas: comissoesComp,
      margemContribuicaoValor: margemContrComp,
      indiceMargemContribuicaoPercentual: indMargemContrComp,
      despesasFixasOperacionais: despFixasComp,
      lucroLiquidoOperacional: lucroLiqComp,
      margemLiquidaPercentual: margemLiqComp
    },
    regimeCaixa: {
      receitaBrutaTotal: recBrutaCaixa,
      impostosDeduzidos: impCaixa,
      receitaLiquida: recLiqCaixa,
      cmvPecasCMP: cmvCaixa,
      custoComissoesTecnicas: comissoesCaixa,
      despesasFixasOperacionais: despFixasCaixa,
      lucroLiquidoCaixa: lucroLiqCaixa
    },
    diferencaCompetenciaVsCaixa: {
      gapReceita: round2(recBrutaComp - recBrutaCaixa),
      gapLucro: round2(lucroLiqComp - lucroLiqCaixa)
    }
  };
}

function calcularPontoEquilibrioOficina(state, { competencia = null, metaLucroDesejado = 0, aliquotaImpostoPadrao = 8 } = {}) {
  const dre = apurarDreGerencialCompetenciaECaixa(state, { competencia, aliquotaImpostoPadrao });
  const comp = dre.regimeCompetencia;
  const despFixas = comp.despesasFixasOperacionais;
  const imcDecimal = comp.indiceMargemContribuicaoPercentual / 100;
  const recAtual = comp.receitaBrutaTotal;
  const metaLucro = Math.max(0, Number(metaLucroDesejado) || 0);

  const peContabil = imcDecimal > 0 ? round2(despFixas / imcDecimal) : 0;
  const peEconomico = imcDecimal > 0 ? round2((despFixas + metaLucro) / imcDecimal) : 0;
  const percentualAtingimento = peContabil > 0 ? round2((recAtual / peContabil) * 100) : (recAtual > 0 ? 100 : 0);

  let statusEquilibrio = 'deficit_abaixo_pe';
  if (peEconomico > 0 && recAtual >= peEconomico) statusEquilibrio = 'superavit_acima_meta';
  else if (peContabil > 0 && recAtual >= peContabil) statusEquilibrio = 'superavit_operacional';
  else if (percentualAtingimento >= 80) statusEquilibrio = 'zona_atencao';

  return {
    ok: true,
    competencia: dre.competencia,
    receitaBrutaAtual: recAtual,
    despesasFixasOperacionais: despFixas,
    indiceMargemContribuicaoPercentual: comp.indiceMargemContribuicaoPercentual,
    pontoEquilibrioContabil: peContabil,
    pontoEquilibrioEconomico: peEconomico,
    metaLucroDesejado: metaLucro,
    percentualAtingimentoPE: percentualAtingimento,
    statusEquilibrio,
    dre
  };
}

function apurarRankingRentabilidadeFrotasEBoxes(state, { competencia = null } = {}) {
  garantirColecoes(state);
  const comp = competencia || new Date().toISOString().slice(0, 7);

  const ossComp = state.os.filter(os => {
    if (os.tipoOS === 'garantia_retrabalho' || String(os.st || '').toLowerCase() === 'cancelada') return false;
    const dt = String(os.fechamento || os.dataFinalizacao || os.data || os.abertura || '').slice(0, 7);
    return !dt || dt === comp;
  });

  const frotasMap = new Map();
  const boxesMap = new Map();

  for (const os of ossComp) {
    const cliId = os.clienteId || os.cli || 'cli_avulso';
    const cliNome = os.clienteNome || os.cliente || cliId;
    const boxId = os.boxAtualId || 'box_sem_alocacao';
    const totalOS = Number(os.total != null ? os.total : (os.valorTotal || 0));
    const cmpOS = calcularCmvPecasOS(os, state.estoque);

    if (!frotasMap.has(cliId)) frotasMap.set(cliId, { clienteId: cliId, clienteNome: cliNome, quantidadeOS: 0, receitaTotal: 0, custoPecasCMP: 0, osIds: [] });
    const f = frotasMap.get(cliId);
    f.quantidadeOS++;
    f.receitaTotal += totalOS;
    f.custoPecasCMP += cmpOS;
    f.osIds.push(os.id);

    if (!boxesMap.has(boxId)) boxesMap.set(boxId, { boxId, quantidadeOS: 0, receitaGeradaBox: 0, custoPecasCMP: 0 });
    const b = boxesMap.get(boxId);
    b.quantidadeOS++;
    b.receitaGeradaBox += totalOS;
    b.custoPecasCMP += cmpOS;
  }

  const reworks = state.reworkRecords.filter(r => String(r.competencia || r.data || '').slice(0, 7) === comp);
  const rankingFrotas = Array.from(frotasMap.values()).map(f => {
    let custoRet = 0;
    for (const r of reworks) {
      if (r.clienteId === f.clienteId || f.osIds.includes(r.osOrigemId)) custoRet += Number(r.custoRetrabalho || r.valorTotalRetrabalho || 0);
    }
    const rec = round2(f.receitaTotal), cmp = round2(f.custoPecasCMP), ret = round2(custoRet);
    const lucro = round2(rec - cmp - ret);
    const margem = rec > 0 ? round2((lucro / rec) * 100) : 0;
    return { clienteId: f.clienteId, clienteNome: f.clienteNome, quantidadeOS: f.quantidadeOS, receitaTotal: rec, custoPecasCMP: cmp, custoRetrabalhoGarantia: ret, lucroBrutoFrota: lucro, margemBrutaPercentual: margem };
  }).sort((a, b) => b.lucroBrutoFrota - a.lucroBrutoFrota);

  const rankingBoxes = Array.from(boxesMap.values()).map(b => {
    const rec = round2(b.receitaGeradaBox), cmp = round2(b.custoPecasCMP), lucro = round2(rec - cmp);
    const ticket = b.quantidadeOS > 0 ? round2(rec / b.quantidadeOS) : 0;
    return { boxId: b.boxId, quantidadeOS: b.quantidadeOS, receitaGeradaBox: rec, custoPecasCMP: cmp, lucroBrutoBox: lucro, ticketMedioBox: ticket };
  }).sort((a, b) => b.lucroBrutoBox - a.lucroBrutoBox);

  return { ok: true, competencia: comp, rankingFrotas, rankingBoxes };
}

function gerarRelatorioExecutivoDreWhatsApp(state, { competencia = null, metaLucroDesejado = 0 } = {}) {
  const dre = apurarDreGerencialCompetenciaECaixa(state, { competencia });
  const pe = calcularPontoEquilibrioOficina(state, { competencia, metaLucroDesejado });
  const rank = apurarRankingRentabilidadeFrotasEBoxes(state, { competencia });
  const topFrota = rank.rankingFrotas[0] || null;

  const statusStr = pe.statusEquilibrio === 'superavit_acima_meta' ? '🟢 Superávit (Acima da Meta)' :
                    pe.statusEquilibrio === 'superavit_operacional' ? '🟢 Superávit Operacional' :
                    pe.statusEquilibrio === 'zona_atencao' ? '🟡 Zona de Atenção' : '🔴 Déficit Operacional';

  const txt = `📊 *DRE Gerencial & Break-Even Executivo — ${dre.competencia}*\n\n` +
    `📈 *Regime de Competência (Faturado):*\n` +
    `• Receita Bruta: R$ ${dre.regimeCompetencia.receitaBrutaTotal.toFixed(2)}\n` +
    `• Margem Contribuição: R$ ${dre.regimeCompetencia.margemContribuicaoValor.toFixed(2)} (${dre.regimeCompetencia.indiceMargemContribuicaoPercentual}%)\n` +
    `• Despesas Fixas: R$ ${dre.regimeCompetencia.despesasFixasOperacionais.toFixed(2)}\n` +
    `• Lucro Líquido: R$ ${dre.regimeCompetencia.lucroLiquidoOperacional.toFixed(2)} (${dre.regimeCompetencia.margemLiquidaPercentual}%)\n\n` +
    `💵 *Regime de Caixa (Realizado):*\n` +
    `• Receita Entrou: R$ ${dre.regimeCaixa.receitaBrutaTotal.toFixed(2)}\n` +
    `• Lucro Caixa: R$ ${dre.regimeCaixa.lucroLiquidoCaixa.toFixed(2)}\n` +
    `• Gap a Receber: R$ ${dre.diferencaCompetenciaVsCaixa.gapReceita.toFixed(2)}\n\n` +
    `⚖️ *Ponto de Equilíbrio:* R$ ${pe.pontoEquilibrioContabil.toFixed(2)} (${pe.percentualAtingimentoPE}% atingido)\n` +
    `• Status: *${statusStr}*\n\n` +
    `🏆 *Top Frota Rentável:* ${topFrota ? `${topFrota.clienteNome} (R$ ${topFrota.lucroBrutoFrota.toFixed(2)})` : 'Nenhuma'}`;

  return { ok: true, dre, pontoEquilibrio: pe, rankingFrotas: rank.rankingFrotas, rankingBoxes: rank.rankingBoxes, respostaTextoWhatsApp: txt };
}

module.exports = {
  apurarDreGerencialCompetenciaECaixa,
  calcularPontoEquilibrioOficina,
  apurarRankingRentabilidadeFrotasEBoxes,
  gerarRelatorioExecutivoDreWhatsApp
};
