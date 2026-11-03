/**
 * services/financial/workshopProductivityService.js
 * BI & Produtividade operacional, comissões de mecânicos e giros de boxes.
 * Modularizado sob teto de 350 linhas conforme regras de engenharia.
 */

const financialEngine = require('../financialEngine');
const { arredondar } = require('./financialHelpers');

function formatarTempoHorasMinutos(minutos) {
  if (minutos == null || isNaN(minutos) || minutos <= 0) return '0 min';
  const m = Math.round(minutos);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem > 0 ? `${h}h ${rem}m` : `${h}h`;
}

/**
 * Apura o desempenho operacional e financeiro de mecânicos e boxes com filtros semanal/mensal e comissões
 */
function calcularProdutividadeEComissoes(state = {}, opcoes = {}) {
  const agoraSP = financialEngine.obterAgoraSP();
  const ref = opcoes.dataRef ? financialEngine.dataISO(opcoes.dataRef) : agoraSP.dataISO;
  let periodo = String(opcoes.periodo || 'mensal').toLowerCase();
  if (periodo === 'semana') periodo = 'semanal';
  if (periodo === 'mes') periodo = 'mensal';

  let de = ref;
  let ate = ref;

  if (opcoes.customDe && opcoes.customAte) {
    de = financialEngine.dataISO(opcoes.customDe);
    ate = financialEngine.dataISO(opcoes.customAte);
    periodo = 'custom';
  } else if (periodo === 'semanal') {
    de = financialEngine.addDias(ref, -6);
    ate = ref;
  } else if (periodo === 'todos') {
    de = '1970-01-01';
    ate = '2099-12-31';
  } else {
    // mensal por padrão
    periodo = 'mensal';
    const dObj = new Date(ref + 'T12:00:00');
    const ano = dObj.getFullYear();
    const mes = String(dObj.getMonth() + 1).padStart(2, '0');
    de = `${ano}-${mes}-01`;
    const ultDia = new Date(ano, dObj.getMonth() + 1, 0).getDate();
    ate = `${ano}-${mes}-${String(ultDia).padStart(2, '0')}`;
  }

  const percentualComissao = (opcoes.percentualComissao != null)
    ? (Number(opcoes.percentualComissao) > 1 ? Number(opcoes.percentualComissao) / 100 : Number(opcoes.percentualComissao))
    : 0.20;

  const todasOS = Array.isArray(state.os) ? state.os : [];
  const boxes = (Array.isArray(state.boxes) && state.boxes.length > 0)
    ? state.boxes
    : [
        { id: 'BOX-01', nome: 'Box 01 — Linha Pesada' },
        { id: 'BOX-02', nome: 'Box 02 — Freios & Suspensão' },
        { id: 'BOX-03', nome: 'Box 03 — Molas & Eixos' },
        { id: 'BOX-04', nome: 'Box 04 — Rápido / Vistoria' }
      ];

  // Filtra as OSs dentro do período selecionado
  const osNoPeriodo = todasOS.filter(o => {
    if (periodo === 'todos') return true;
    const d = (o.concluidoEm || o.finalizadoEm || o.dataSaida || o.data || o.criadoEm || o.createdAt || '').slice(0, 10);
    if (!d) return true;
    return d >= de && d <= ate;
  });

  // 1. Produtividade por Mecânico
  const mecanicosCadastrados = Array.isArray(state.mecanicos)
    ? state.mecanicos
    : (Array.isArray(state.workers) ? state.workers.filter(w => w.ativo !== false) : []);

  const nomesMecanicosSet = new Set();
  mecanicosCadastrados.forEach(m => {
    const nome = (m.nome || m.name || '').trim();
    if (nome) nomesMecanicosSet.add(nome);
  });
  osNoPeriodo.forEach(o => {
    if (o.mecanico && String(o.mecanico).trim()) {
      nomesMecanicosSet.add(String(o.mecanico).trim());
    }
  });

  const produtividadeMecanicos = [];
  let totalComissoesGeral = 0;
  let totalMaoDeObraGeral = 0;
  let totalPecasGeral = 0;
  let totalOSConcluidasGeral = 0;
  let totalGarantiasGeral = 0;

  nomesMecanicosSet.forEach(nomeMec => {
    const osDoMec = osNoPeriodo.filter(o => o.mecanico && String(o.mecanico).trim().toLowerCase() === nomeMec.toLowerCase());
    const totalOS = osDoMec.length;
    const concluidas = osDoMec.filter(o => o.st === 'finalizada' || o.etapaPatio === 'pronto_retirada' || o.concluidoEm || o.status === 'concluida');
    const totalOSConcluidas = concluidas.length;

    let maoDeObraTotal = 0;
    let maoDeObraComissionavel = 0;
    let totalPecasMec = 0;
    let totalMinutosBox = 0;
    let qtdOSComTempo = 0;
    let totalGarantias = 0;

    osDoMec.forEach(o => {
      let mobDaOS = 0;
      if (Array.isArray(o.servicos) && o.servicos.length > 0) {
        mobDaOS = o.servicos.reduce((acc, s) => acc + (Number(s.valor || s.preco || s.total) || 0), 0);
      } else if (Array.isArray(o.services) && o.services.length > 0) {
        mobDaOS = o.services.reduce((acc, s) => acc + (Number(s.valor || s.preco || s.total) || 0), 0);
      } else if (o.totalServicos != null) {
        mobDaOS = Number(o.totalServicos) || 0;
      } else if (o.maoDeObra != null) {
        mobDaOS = Number(o.maoDeObra) || 0;
      } else {
        const tot = Number(o.total || o.valorTotal) || 0;
        const pec = Number(o.totalPecas) || 0;
        mobDaOS = Math.max(0, tot - pec);
      }

      const pecasDaOS = Number(o.totalPecas) || (Array.isArray(o.pecasUtilizadas) ? o.pecasUtilizadas.reduce((a, b) => a + (Number(b.precoVenda || b.valorUnitario || 0) * (Number(b.quantidade) || 1)), 0) : 0);
      totalPecasMec += pecasDaOS;
      maoDeObraTotal += mobDaOS;

      const isGarantia = Boolean(o.isRetornoGarantia || o.isentoGarantia);
      if (isGarantia) {
        totalGarantias++;
      } else {
        maoDeObraComissionavel += mobDaOS;
      }

      const minBox = Number(o.tempoOcupacaoMinutos || o.tempoBoxMinutos || o.duracaoMinutos) || (
        o.alocadoEm && o.concluidoEm ? Math.max(1, Math.round((new Date(o.concluidoEm) - new Date(o.alocadoEm)) / 60000)) : 0
      );
      if (minBox > 0) {
        totalMinutosBox += minBox;
        qtdOSComTempo++;
      }
    });

    const tempoMedioBoxMinutos = qtdOSComTempo > 0 ? arredondar(totalMinutosBox / qtdOSComTempo) : 0;
    const valorComissao = arredondar(maoDeObraComissionavel * percentualComissao);
    const taxaRetrabalho = totalOS > 0 ? arredondar((totalGarantias / totalOS) * 100) : 0;

    totalComissoesGeral += valorComissao;
    totalMaoDeObraGeral += maoDeObraTotal;
    totalPecasGeral += totalPecasMec;
    totalOSConcluidasGeral += totalOSConcluidas;
    totalGarantiasGeral += totalGarantias;

    produtividadeMecanicos.push({
      mecanico: nomeMec,
      totalOS,
      totalOSConcluidas,
      totalMaoDeObra: arredondar(maoDeObraTotal),
      maoDeObraComissionavel: arredondar(maoDeObraComissionavel),
      percentualComissao: arredondar(percentualComissao * 100),
      valorComissao,
      totalGarantias,
      taxaRetrabalhoGarantia: taxaRetrabalho,
      tempoMedioBoxMinutos,
      tempoMedioBoxFormatado: formatarTempoHorasMinutos(tempoMedioBoxMinutos)
    });
  });

  produtividadeMecanicos.sort((a, b) => b.totalMaoDeObra - a.totalMaoDeObra);

  // 2. Produtividade por Box
  const produtividadeBoxes = boxes.map(b => {
    const bId = b.id;
    const osDoBox = osNoPeriodo.filter(o => o.box === bId || o.boxId === bId);
    const totalAtendimentos = osDoBox.length;

    let somaMinutosGiro = 0;
    let qtdComGiro = 0;

    osDoBox.forEach(o => {
      const minGiro = Number(o.tempoOcupacaoMinutos || o.tempoBoxMinutos || o.duracaoMinutos) || (
        o.alocadoEm && o.concluidoEm ? Math.max(1, Math.round((new Date(o.concluidoEm) - new Date(o.alocadoEm)) / 60000)) : 0
      );
      if (minGiro > 0) {
        somaMinutosGiro += minGiro;
        qtdComGiro++;
      }
    });

    const tempoMedioGiroMinutos = qtdComGiro > 0 ? arredondar(somaMinutosGiro / qtdComGiro) : 0;
    const isOcupado = osDoBox.some(o => o.st !== 'finalizada');
    const isGargalo = osDoBox.some(o => o.st === 'peca' || o.etapaPatio === 'pausado_gargalo');
    const statusBox = b.status || (isGargalo ? 'bloqueado_peca' : (isOcupado ? 'ocupado' : 'livre'));

    const taxaOcupacao = totalAtendimentos > 0 ? Math.min(100, arredondar(totalAtendimentos * 20)) : (isOcupado ? 50 : 0);

    return {
      boxId: bId,
      nome: b.nome || bId,
      status: statusBox,
      totalAtendimentos,
      tempoMedioGiroMinutos,
      tempoMedioGiroFormatado: formatarTempoHorasMinutos(tempoMedioGiroMinutos),
      taxaOcupacao
    };
  });

  produtividadeBoxes.sort((a, b) => b.totalAtendimentos - a.totalAtendimentos);

  const boxMaisProdutivo = produtividadeBoxes.length > 0 && produtividadeBoxes[0].totalAtendimentos > 0
    ? { id: produtividadeBoxes[0].boxId, nome: produtividadeBoxes[0].nome, totalAtendimentos: produtividadeBoxes[0].totalAtendimentos }
    : null;

  const mecanicoDestaque = produtividadeMecanicos.length > 0 && produtividadeMecanicos[0].totalMaoDeObra > 0
    ? {
        nome: produtividadeMecanicos[0].mecanico,
        totalOS: produtividadeMecanicos[0].totalOS,
        totalOSConcluidas: produtividadeMecanicos[0].totalOSConcluidas,
        totalMaoDeObra: produtividadeMecanicos[0].totalMaoDeObra,
        valorComissao: produtividadeMecanicos[0].valorComissao
      }
    : null;

  const totalOSTodas = osNoPeriodo.length;
  const taxaRetrabalhoGeral = totalOSTodas > 0 ? arredondar((totalGarantiasGeral / totalOSTodas) * 100) : 0;

  const boxesComGiro = produtividadeBoxes.filter(b => b.tempoMedioGiroMinutos > 0);
  const tempoMedioGiroGeralMinutos = boxesComGiro.length > 0
    ? arredondar(boxesComGiro.reduce((a, b) => a + b.tempoMedioGiroMinutos, 0) / boxesComGiro.length)
    : 0;

  const faturamentoTotal = arredondar(totalMaoDeObraGeral + totalPecasGeral);

  return {
    periodo: {
      tipo: periodo,
      de,
      ate
    },
    resumo: {
      periodo: { tipo: periodo, de, ate },
      totalOSConcluidas: totalOSConcluidasGeral,
      totalOSTodas,
      totalMaoDeObra: arredondar(totalMaoDeObraGeral),
      totalPecas: arredondar(totalPecasGeral),
      faturamentoTotal,
      totalComissoes: arredondar(totalComissoesGeral),
      percentualComissaoPadrao: arredondar(percentualComissao * 100),
      tempoMedioGiroGeralMinutos,
      tempoMedioGiroGeralFormatado: formatarTempoHorasMinutos(tempoMedioGiroGeralMinutos),
      taxaRetrabalhoGeral,
      boxMaisProdutivo,
      mecanicoDestaque
    },
    produtividadeMecanicos,
    produtividadeBoxes
  };
}

/**
 * Formata o Boletim de Produtividade & BI em texto para o WhatsApp
 */
function formatarBoletimProdutividadeWhatsapp(dados) {
  if (!dados || !dados.resumo) return 'Nenhum dado analítico disponível para o período.';
  const r = dados.resumo;
  const p = dados.periodo || {};
  const deBR = financialEngine.formatarDataBR(p.de);
  const ateBR = financialEngine.formatarDataBR(p.ate);
  const tipoTitulo = (p.tipo === 'semanal') ? 'SEMANAL' : ((p.tipo === 'mensal') ? 'MENSAL' : 'CONSOLIDADO');

  let txt = `📊 *BOLETIM DE PRODUTIVIDADE & BI (${tipoTitulo})* 📈\n`;
  txt += `📅 *Período:* ${deBR} a ${ateBR}\n\n`;

  txt += `💰 *Faturamento Mão de Obra:* ${financialEngine.formatarMoeda(r.totalMaoDeObra)}\n`;
  txt += `🔩 *Faturamento Peças:* ${financialEngine.formatarMoeda(r.totalPecas)}\n`;
  txt += `💵 *Faturamento Total:* ${financialEngine.formatarMoeda(r.faturamentoTotal)}\n`;
  txt += `🤝 *Total de Comissões (${r.percentualComissaoPadrao}%):* ${financialEngine.formatarMoeda(r.totalComissoes)}\n`;
  txt += `✅ *OSs Concluídas:* ${r.totalOSConcluidas} | *Taxa Retrabalho:* ${r.taxaRetrabalhoGeral}%\n\n`;

  if (r.mecanicoDestaque) {
    txt += `🏆 *Mecânico Destaque:* ${r.mecanicoDestaque.nome}\n`;
    txt += `   └ Mão de Obra: ${financialEngine.formatarMoeda(r.mecanicoDestaque.totalMaoDeObra)} (${r.mecanicoDestaque.totalOSConcluidas} OSs) | Comissão: ${financialEngine.formatarMoeda(r.mecanicoDestaque.valorComissao)}\n\n`;
  }

  if (r.boxMaisProdutivo) {
    txt += `🏗️ *Box Mais Produtivo:* ${r.boxMaisProdutivo.nome} (${r.boxMaisProdutivo.totalAtendimentos} atendimentos)\n\n`;
  }

  if (Array.isArray(dados.produtividadeMecanicos) && dados.produtividadeMecanicos.length > 0) {
    txt += `👨‍🔧 *Desempenho da Equipe:*\n`;
    dados.produtividadeMecanicos.slice(0, 5).forEach((m, idx) => {
      txt += `${idx + 1}. *${m.mecanico}*: ${financialEngine.formatarMoeda(m.totalMaoDeObra)} (Comissão: ${financialEngine.formatarMoeda(m.valorComissao)})\n`;
    });
  }

  return txt.trim();
}

/**
 * Formata o Extrato Individual de Comissão em texto para o WhatsApp
 */
function formatarExtratoComissaoWhatsapp(mecanicoDados, periodoInfo = {}) {
  if (!mecanicoDados) return 'Nenhum registro de comissão localizado para este colaborador.';
  const deBR = periodoInfo.de ? financialEngine.formatarDataBR(periodoInfo.de) : '';
  const ateBR = periodoInfo.ate ? financialEngine.formatarDataBR(periodoInfo.ate) : '';
  const periodoStr = deBR && ateBR ? ` (${deBR} a ${ateBR})` : '';

  let txt = `🤝 *EXTRATO DE COMISSÃO — ${mecanicoDados.mecanico.toUpperCase()}* 💰${periodoStr}\n\n`;
  txt += `• *Mão de Obra Gerada:* ${financialEngine.formatarMoeda(mecanicoDados.totalMaoDeObra)}\n`;
  txt += `• *Base Comissionável:* ${financialEngine.formatarMoeda(mecanicoDados.maoDeObraComissionavel)} (exclui garantias)\n`;
  txt += `• *Alíquota de Comissão:* ${mecanicoDados.percentualComissao}%\n`;
  txt += `• *Valor a Receber:* *${financialEngine.formatarMoeda(mecanicoDados.valorComissao)}*\n\n`;
  txt += `• *OSs Atendidas:* ${mecanicoDados.totalOS} (${mecanicoDados.totalOSConcluidas} finalizadas)\n`;
  txt += `• *Retornos em Garantia:* ${mecanicoDados.totalGarantias} (Taxa: ${mecanicoDados.taxaRetrabalhoGarantia}%)\n`;
  txt += `• *Tempo Médio em Box:* ${mecanicoDados.tempoMedioBoxFormatado}`;

  return txt;
}

module.exports = {
  formatarTempoHorasMinutos,
  calcularProdutividadeEComissoes,
  formatarBoletimProdutividadeWhatsapp,
  formatarExtratoComissaoWhatsapp
};
