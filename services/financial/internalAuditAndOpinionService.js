'use strict';

const financialEngine = require('../financialEngine');
const { hojeISO } = require('./financialHelpers');
const { gerarPrevisaoFluxoCaixa } = require('./cashflowAndForecastService');

/**
 * Avalia controles internos e detecta anomalias de faturamento, caixa e inadimplência
 */
function avaliarControlesInternos(state = {}) {
  const dataHoje = hojeISO();
  const osList = Array.isArray(state.os) ? state.os : [];
  const contas = Array.isArray(state.contas) ? state.contas : [];
  const movimentos = Array.isArray(state.movimentos) ? state.movimentos : [];
  const caixas = Array.isArray(state.caixas) ? state.caixas : [];

  const anomalias = [];

  // 1. Vazamento de receita
  const osFinalizadas = osList.filter(o => o.st === 'finalizada');
  const osIdsComMovimento = new Set(movimentos.map(m => m.osId).filter(Boolean));
  const osIdsComConta = new Set(contas.filter(c => c.tipo === 'receber').map(c => c.osId).filter(Boolean));

  const osSemReceita = [];
  for (const o of osFinalizadas) {
    const valorOS = Number(o.total || o.valorTotal || 0);
    if (valorOS > 0 && !osIdsComMovimento.has(o.id) && !osIdsComConta.has(o.id)) {
      osSemReceita.push({
        osId: o.id,
        num: o.num || o.id,
        placa: o.placa || 'SEM-PLACA',
        valor: valorOS,
        dataFechamento: o.fechamento || o.atualizadoEm || o.abertura
      });
    }
  }

  if (osSemReceita.length > 0) {
    const totalVazamento = osSemReceita.reduce((acc, o) => acc + o.valor, 0);
    const listaOS = osSemReceita.slice(0, 5).map(o => `OS #${o.num}`).join(', ');
    anomalias.push({
      tipo: 'vazamento_receita',
      severidade: 'critico',
      titulo: 'Possível Vazamento de Receita: OS Finalizadas sem Faturamento',
      descricao: `Identificamos ${osSemReceita.length} ordem(ns) de serviço finalizada(s) (${listaOS}) totalizando ${financialEngine.formatarMoeda(totalVazamento)} sem nenhum lançamento em contas a receber ou recebimento no caixa.`,
      quantidade: osSemReceita.length,
      valorEnvolvido: totalVazamento,
      itens: osSemReceita,
      recomendacao: 'Verificar se as ordens de serviço foram faturadas e gerar os respectivos títulos a receber ou baixas de caixa.'
    });
  }

  // 2. Inadimplência crítica
  const titulosVencidos = contas.filter(c =>
    c.tipo === 'receber' && !c.pago && (c.venc || '').slice(0, 10) < dataHoje
  );
  if (titulosVencidos.length > 0) {
    const totalInadimplente = titulosVencidos.reduce((acc, c) => acc + (Number(c.valor) || 0), 0);
    anomalias.push({
      tipo: 'inadimplencia',
      severidade: totalInadimplente > 5000 ? 'critico' : 'alerta',
      titulo: 'Inadimplência de Clientes: Títulos Vencidos',
      descricao: `Há ${titulosVencidos.length} título(s) vencido(s) aguardando cobrança, totalizando ${financialEngine.formatarMoeda(totalInadimplente)}.`,
      quantidade: titulosVencidos.length,
      valorEnvolvido: totalInadimplente,
      itens: titulosVencidos.slice(0, 10).map(c => ({
        id: c.id,
        desc: c.desc || c.parte,
        valor: c.valor,
        vencimento: c.venc,
        diasAtraso: financialEngine.diasEntre(c.venc, dataHoje)
      })),
      recomendacao: 'Acionar os frotistas e clientes para renegociação ou envio do link de cobrança Pix.'
    });
  }

  // 3. Títulos vencendo hoje
  const vencendoHojePagar = contas.filter(c => c.tipo === 'pagar' && !c.pago && (c.venc || '').slice(0, 10) === dataHoje);
  const vencendoHojeReceber = contas.filter(c => c.tipo === 'receber' && !c.pago && (c.venc || '').slice(0, 10) === dataHoje);

  // 4. Sangria elevada
  const sangriasElevadas = movimentos.filter(m =>
    (m.subtipo === 'sangria' || (m.tipo === 'saida' && Number(m.valor) >= 1500)) &&
    (m.data || '').slice(0, 10) === dataHoje
  );
  if (sangriasElevadas.length > 0) {
    anomalias.push({
      tipo: 'sangria_elevada',
      severidade: 'alerta',
      titulo: 'Retiradas de Caixa Elevadas Hoje',
      descricao: `Identificamos ${sangriasElevadas.length} retirada(s) de caixa acima de R$ 1.500 no dia de hoje.`,
      quantidade: sangriasElevadas.length,
      itens: sangriasElevadas.map(m => ({ id: m.id, desc: m.desc, valor: m.valor, operador: m.operador })),
      recomendacao: 'Conferir os comprovantes físicos e autorizações gerenciais das saídas de caixa.'
    });
  }

  // 5. Caixa sem fechamento
  const caixasAbertosAntigos = caixas.filter(c => {
    if (c.status !== 'aberto') return false;
    const dAberta = (c.dataAbertura || c.abertoEm || '').slice(0, 10);
    return dAberta < dataHoje;
  });
  if (caixasAbertosAntigos.length > 0) {
    anomalias.push({
      tipo: 'caixa_pendente_fechamento',
      severidade: 'alerta',
      titulo: 'Turno de Caixa de Dias Anteriores Ainda Aberto',
      descricao: `Há ${caixasAbertosAntigos.length} caixa(s) aberto(s) em data anterior sem fechamento formal realizado.`,
      quantidade: caixasAbertosAntigos.length,
      itens: caixasAbertosAntigos.map(c => ({ id: c.id, dataAbertura: c.dataAbertura, operador: c.abertoPorNome })),
      recomendacao: 'Realizar o fechamento do caixa anterior para iniciar o turno de hoje com conciliação exata.'
    });
  }

  // Parecer Executivo
  const kpis = financialEngine.calcularKPIsFinanceiros(state, { filtro: 'hoje' });
  const previsao = gerarPrevisaoFluxoCaixa(state, { dias: 30 });
  const parecerExecutivo = formatarParecerExecutivoVerônica({
    kpis,
    previsao,
    anomalias,
    vencendoHojePagar,
    vencendoHojeReceber,
    nomeAssistente: state.cfg?.assistente?.displayName || 'Verônica'
  });

  return {
    sucesso: true,
    dataReferencia: dataHoje,
    statusGeral: anomalias.some(a => a.severidade === 'critico') ? 'critico' : (anomalias.length > 0 ? 'alerta' : 'conforme'),
    totalAnomalias: anomalias.length,
    anomaliasCriticas: anomalias.filter(a => a.severidade === 'critico').length,
    anomalias,
    vencimentosHoje: {
      aPagar: { total: kpis.totalPagHoje, quantidade: vencendoHojePagar.length },
      aReceber: { total: kpis.totalRecHoje, quantidade: vencendoHojeReceber.length }
    },
    parecerExecutivo
  };
}

/**
 * Formata o Parecer Executivo da Verônica para leitura, TTS e WhatsApp
 */
function formatarParecerExecutivoVerônica(optionsOrState = {}) {
  let kpis = optionsOrState.kpis;
  let previsao = optionsOrState.previsao;
  let anomalias = optionsOrState.anomalias || [];
  let vencendoHojePagar = optionsOrState.vencendoHojePagar || [];
  let vencendoHojeReceber = optionsOrState.vencendoHojeReceber || [];
  let nomeAssistente = optionsOrState.nomeAssistente;

  if (!kpis) {
    const state = optionsOrState;
    const dataHoje = hojeISO();
    kpis = financialEngine.calcularKPIsFinanceiros(state, { filtro: 'hoje' });
    previsao = gerarPrevisaoFluxoCaixa(state, { dias: 30 });
    const contas = Array.isArray(state.contas) ? state.contas : [];
    vencendoHojePagar = contas.filter(c => c.tipo === 'pagar' && !c.pago && (c.venc || '').slice(0, 10) === dataHoje);
    vencendoHojeReceber = contas.filter(c => c.tipo === 'receber' && !c.pago && (c.venc || '').slice(0, 10) === dataHoje);
    const auditoria = avaliarControlesInternos(state);
    anomalias = auditoria.anomalias;
    nomeAssistente = state.cfg?.assistente?.displayName || 'Verônica';
  }
  if (!nomeAssistente) nomeAssistente = 'Verônica';
  const agoraSP = financialEngine.obterAgoraSP();
  const saldoDisp = financialEngine.formatarMoeda(kpis.saldoConsolidado);
  const recHoje = financialEngine.formatarMoeda(kpis.totalRecHoje);
  const pagHoje = financialEngine.formatarMoeda(kpis.totalPagHoje);
  const prev30d = financialEngine.formatarMoeda(previsao.marcos.em30Dias.saldo);

  let texto = `🤖 *PARECER EXECUTIVO FINANCEIRO DA ${nomeAssistente.toUpperCase()}*\n`;
  texto += `📅 *Posição:* ${agoraSP.dataBR} às ${agoraSP.horaBR}\n`;
  texto += `════════════════════════════\n\n`;

  texto += `💰 *1. DISPONIBILIDADE E LIQUIDEZ*\n`;
  texto += `• Saldo Disponível em Caixa: *${saldoDisp}*\n`;
  texto += `• Contas a Receber Hoje: ${recHoje} (${vencendoHojeReceber.length} títulos)\n`;
  texto += `• Contas a Pagar Hoje: ${pagHoje} (${vencendoHojePagar.length} despesas)\n`;
  texto += `• Previsão de Saldo em 30 Dias: *${prev30d}*\n\n`;

  texto += `📈 *2. PROJEÇÃO DE FLUXO & PÁTIO*\n`;
  if (previsao.diagnosticoFuro.furoDetectado) {
    texto += `⚠️ *ALERTA DE FLUXO:* Risco de déficit projetado a partir de ${financialEngine.formatarDataBRFull(previsao.diagnosticoFuro.dataPrimeiroFuro)} (menor saldo: ${financialEngine.formatarMoeda(previsao.diagnosticoFuro.menorSaldoProjetado)}).\n`;
  } else {
    texto += `✅ *FLUXO ESTÁVEL:* Saldo permanece acima da margem de segurança de ${financialEngine.formatarMoeda(previsao.caixaMinimoSeguranca)} nos próximos 30 dias.\n`;
  }
  texto += `• Receita Potencial das OS no Pátio: *${financialEngine.formatarMoeda(previsao.receitaPotencialPatio.cenarioProvavel)}* (Cenário provável)\n\n`;

  texto += `🔍 *3. AUDITORIA & CONTROLES INTERNOS*\n`;
  if (anomalias.length === 0) {
    texto += `✅ Nenhuma anomalia crítica identificada. Operação e financeiro reconciliados.\n`;
  } else {
    for (const a of anomalias) {
      const icone = a.severidade === 'critico' ? '🚨' : '⚠️';
      texto += `${icone} *${a.titulo}*\n   ${a.descricao}\n   💡 _Ação:_ ${a.recomendacao}\n`;
    }
  }

  return texto;
}

module.exports = {
  avaliarControlesInternos,
  formatarParecerExecutivoVerônica
};
