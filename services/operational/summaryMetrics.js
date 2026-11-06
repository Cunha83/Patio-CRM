'use strict';

const { obterAgoraSP } = require('../financialEngine');
const productivityService = require('../productivityService');
const { parseDataHora } = require('./summaryTimeHelpers');

/**
 * Gera um snapshot executivo e métricas operacionais consolidadas do tenant
 */
function gerarResumoOperacional({
  tenantId,
  state,
  dataReferencia = null,
  horaReferencia = null,
  agoraIso = null,
  agoraDate = null
}) {
  if (!tenantId || typeof tenantId !== 'string') {
    throw new Error('tenantId é obrigatório para gerar resumo operacional.');
  }
  if (!state) {
    throw new Error('Estado do tenant é obrigatório.');
  }

  const osList = Array.isArray(state.os) ? state.os : [];
  const boxes = Array.isArray(state.boxes) ? state.boxes : [];
  const events = Array.isArray(state.operationalEvents) ? state.operationalEvents : [];

  let agora;
  if (agoraDate instanceof Date && !isNaN(agoraDate.getTime())) {
    agora = agoraDate;
  } else if (agoraIso) {
    agora = new Date(agoraIso);
  } else if (dataReferencia && horaReferencia) {
    agora = parseDataHora(dataReferencia, horaReferencia);
  } else if (dataReferencia) {
    agora = parseDataHora(dataReferencia, '12:00');
  } else {
    agora = new Date();
  }
  if (!agora || isNaN(agora.getTime())) agora = new Date();

  const infoAgoraSP = obterAgoraSP(agora);
  const dataHojeISO = dataReferencia || infoAgoraSP.dataISO;
  const horaAgora = horaReferencia || infoAgoraSP.horaBR;

  // 1. Veículos no Pátio (OS ativas)
  const osAtivas = osList.filter(o => o.st !== 'finalizada');
  const veiculosNoPatioIds = new Set(osAtivas.map(o => o.vei || o.placa || o.id).filter(Boolean));
  const veiculosPatioCount = veiculosNoPatioIds.size;

  // 2. Boxes
  const boxesOcupados = boxes.filter(b => osAtivas.some(o => o.box === b.id)).length;
  const boxesLivres = Math.max(0, boxes.length - boxesOcupados);
  const boxesBloqueadosPeca = boxes.filter(b => osAtivas.some(o => o.box === b.id && o.st === 'peca')).length;

  // 3. Estágios das OSs Ativas
  const contagemEstagios = {
    fila: osAtivas.filter(o => o.st === 'fila' || (!o.st && !o.box)).length,
    aprovacao: osAtivas.filter(o => o.st === 'aprovacao').length,
    executando: osAtivas.filter(o => o.st === 'executando').length,
    peca: osAtivas.filter(o => o.st === 'peca').length,
    finalizadaHoje: osList.filter(o => {
      if (o.st !== 'finalizada') return false;
      const dataFim = o.fechamento || o.concluidoEm || o.atualizadoEm || o.abertura;
      return String(dataFim || '').startsWith(dataHojeISO);
    }).length
  };

  // 4. Entregas (Hoje, Em Risco, Atrasadas)
  let entregasHoje = 0;
  let entregasEmRisco = 0;
  let entregasAtrasadas = 0;

  for (const o of osAtivas) {
    let dtPrometida = null;
    let hrPrometida = '18:00';
    if (o.promessaEntrega && o.promessaEntrega.data) {
      dtPrometida = o.promessaEntrega.data;
      if (o.promessaEntrega.hora) hrPrometida = o.promessaEntrega.hora;
    } else if (o.prev) {
      dtPrometida = o.prev;
      if (o.horaPrev) hrPrometida = o.horaPrev;
    }

    if (dtPrometida) {
      if (dtPrometida === dataHojeISO) {
        entregasHoje++;
      }
      const tsPromessa = parseDataHora(dtPrometida, hrPrometida);
      if (tsPromessa) {
        const diffMinutos = (tsPromessa.getTime() - agora.getTime()) / (1000 * 60);
        if (diffMinutos < 0) {
          entregasAtrasadas++;
          entregasEmRisco++;
        } else if (diffMinutos <= 60 && dtPrometida === dataHojeISO) {
          entregasEmRisco++;
        }
      }
    }
  }

  // 5. Alertas Operacionais Ativos do Tenant
  const eventosAtivos = events.filter(e =>
    e.tenantId === tenantId && (e.status === 'aberto' || e.status === 'reconhecido')
  );

  const contagemAlertas = {
    totalAtivos: eventosAtivos.length,
    critico: eventosAtivos.filter(e => e.severidade === 'critico').length,
    alto: eventosAtivos.filter(e => e.severidade === 'alto').length,
    atencao: eventosAtivos.filter(e => e.severidade === 'atencao').length,
    info: eventosAtivos.filter(e => e.severidade === 'info').length,
    porPrioridade: {
      P1: eventosAtivos.filter(e => e.prioridade === 'P1').length,
      P2: eventosAtivos.filter(e => e.prioridade === 'P2').length,
      P3: eventosAtivos.filter(e => e.prioridade === 'P3').length,
      P4: eventosAtivos.filter(e => e.prioridade === 'P4').length
    }
  };

  // 6. Maior Gargalo Operacional Atual
  let maiorGargalo = {
    tipo: 'nenhum',
    descricao: 'Operação fluindo dentro dos parâmetros normais.',
    quantidade: 0,
    severidade: 'info',
    sugestaoAcao: 'Manter monitoramento preventivo de fluxo.'
  };

  if (contagemEstagios.peca >= 3) {
    maiorGargalo = {
      tipo: 'peca',
      descricao: `Setor de peças: ${contagemEstagios.peca} veículos parados aguardando componentes.`,
      quantidade: contagemEstagios.peca,
      severidade: contagemEstagios.peca >= 5 ? 'critico' : 'alto',
      sugestaoAcao: 'Priorizar cotação e expedição de peças com distribuidores locais.'
    };
  } else if (contagemEstagios.aprovacao >= 3) {
    maiorGargalo = {
      tipo: 'aprovacao',
      descricao: `Aprovação de orçamentos: ${contagemEstagios.aprovacao} veículos aguardando cliente.`,
      quantidade: contagemEstagios.aprovacao,
      severidade: 'atencao',
      sugestaoAcao: 'Cobrar autorização e envio de orçamentos pendentes com frotistas via WhatsApp.'
    };
  } else if (contagemEstagios.fila >= 4) {
    maiorGargalo = {
      tipo: 'fila',
      descricao: `Fila de entrada: ${contagemEstagios.fila} veículos sem box disponível.`,
      quantidade: contagemEstagios.fila,
      severidade: 'atencao',
      sugestaoAcao: 'Agilizar liberação de boxes com manutenções preventivas rápidas.'
    };
  } else if (entregasAtrasadas > 0) {
    maiorGargalo = {
      tipo: 'entrega_atrasada',
      descricao: `Cumprimento de prazos: ${entregasAtrasadas} ordem(ns) de serviço em atraso.`,
      quantidade: entregasAtrasadas,
      severidade: 'critico',
      sugestaoAcao: 'Acionar equipe operacional para entrega prioritária das OSs vencidas.'
    };
  }

  // 7. Métricas Operacionais Estritamente Verídicas
  let tempoMedioPatioHoras = null;
  let tempoMedioEsperaPecaHoras = null;
  let tempoMedioExecucaoHoras = null;

  const osComTemposPatio = osList.filter(o => {
    if (o.st !== 'finalizada') return false;
    const inicio = parseDataHora(o.criadoEm || o.abertura, '08:00');
    const fim = parseDataHora(o.fechamento || o.concluidoEm, '18:00');
    return inicio && fim && fim >= inicio;
  });

  if (osComTemposPatio.length > 0) {
    const somaHoras = osComTemposPatio.reduce((acc, o) => {
      const inicio = parseDataHora(o.criadoEm || o.abertura, '08:00');
      const fim = parseDataHora(o.fechamento || o.concluidoEm, '18:00');
      return acc + (fim.getTime() - inicio.getTime()) / (1000 * 60 * 60);
    }, 0);
    tempoMedioPatioHoras = Number((somaHoras / osComTemposPatio.length).toFixed(1));
  }

  const osComTemposPecas = osList.filter(o => o.tempos && typeof o.tempos.esperaPecaHoras === 'number');
  if (osComTemposPecas.length > 0) {
    const soma = osComTemposPecas.reduce((acc, o) => acc + o.tempos.esperaPecaHoras, 0);
    tempoMedioEsperaPecaHoras = Number((soma / osComTemposPecas.length).toFixed(1));
  }

  const osComTemposExec = osList.filter(o => o.tempos && typeof o.tempos.execucaoHoras === 'number');
  if (osComTemposExec.length > 0) {
    const soma = osComTemposExec.reduce((acc, o) => acc + o.tempos.execucaoHoras, 0);
    tempoMedioExecucaoHoras = Number((soma / osComTemposExec.length).toFixed(1));
  }

  // 8. Orçamentos e Adicionais
  const quotationsList = Array.isArray(state.quotations) ? state.quotations.filter(q => q.tenantId === tenantId) : [];
  const orcamentosPendentes = quotationsList.filter(q => q.status === 'enviado' || q.status === 'rascunho');
  const valorPendente = Math.round(orcamentosPendentes.reduce((acc, q) => acc + (q.totalGeral || 0), 0) * 100) / 100;
  const adicionaisPendentes = orcamentosPendentes.filter(q => q.adicional).length;
  const orcamentosAprovados = quotationsList.filter(q => q.status === 'aprovado' || q.status === 'parcialmente_aprovado');
  const taxaOcupacaoBoxes = boxes.length > 0 ? Number(((boxesOcupados / boxes.length) * 100).toFixed(1)) : null;

  // 9. Peças, Estoque e Compras
  const reqsList = Array.isArray(state.partRequirements) ? state.partRequirements.filter(r => r.tenantId === tenantId) : [];
  const pecasList = Array.isArray(state.pecas) ? state.pecas.filter(p => p.tenantId === tenantId) : [];
  const ordersList = Array.isArray(state.purchaseOrders) ? state.purchaseOrders.filter(p => p.tenantId === tenantId) : [];

  const pecasAguardandoCompra = reqsList.filter(r => r.status === 'aguardando_compra' || r.missingQuantity > 0).length;
  const osAguardandoPecas = new Set(reqsList.filter(r => r.status === 'aguardando_compra' || r.missingQuantity > 0).map(r => r.osId)).size;
  const pedidosAbertos = ordersList.filter(o => o.status === 'pedido_realizado' || o.status === 'parcialmente_recebido' || o.status === 'aguardando_aprovacao').length;
  const pedidosAtrasados = ordersList.filter(o => {
    if (o.status !== 'pedido_realizado' && o.status !== 'parcialmente_recebido') return false;
    return o.expectedAt && new Date(o.expectedAt) < agora;
  }).length;

  let valorTotalEstoque = 0;
  let itensAbaixoMinimo = 0;
  let rupturasEstoque = 0;

  for (const p of pecasList) {
    if (p.ativo !== false) {
      const qtdFisica = Math.max(0, Number(p.qtd) || 0);
      const custo = Number(p.custoMedio != null ? p.custoMedio : p.custo) || 0;
      valorTotalEstoque += qtdFisica * custo;

      const min = Math.max(0, Number(p.estoqueMinimo != null ? p.estoqueMinimo : p.min) || 0);
      const reservado = reqsList
        .filter(r => r.partId === p.id && ['atendida', 'parcial', 'reservada'].includes(r.status))
        .reduce((acc, r) => acc + (Number(r.reservedQuantity) || 0), 0);
      const disponivel = Math.max(0, qtdFisica - reservado);

      if (min > 0 && disponivel <= min) itensAbaixoMinimo++;
      if (disponivel === 0 && reqsList.some(r => r.partId === p.id && (r.status === 'aguardando_compra' || r.missingQuantity > 0))) {
        rupturasEstoque++;
      }
    }
  }
  valorTotalEstoque = Math.round(valorTotalEstoque * 100) / 100;

  // 10. Equipe e Produtividade
  const equipeInfo = productivityService.obterEquipeAgora({ tenantId, state, agora }) || {
    totalMecanicosAtivos: 0,
    totalEmServico: 0,
    totalEmEspera: 0,
    totalLivres: 0,
    emServico: [],
    emEspera: [],
    livres: []
  };
  const capacidadeInfo = productivityService.calcularCapacidadeDiaria({ tenantId, state, dataReferencia: dataHojeISO, agora }) || {
    capacidadeDisponivelHoje: 0,
    capacidadeUtilizadaHoje: 0,
    capacidadeRestanteHoje: 0,
    taxaOcupacao: 0
  };
  const produtividadeOficina = productivityService.calcularProdutividadeOficina({ tenantId, state, dataReferencia: dataHojeISO, agora }) || {
    horasDisponiveis: 0,
    horasProdutivas: 0,
    utilizacao: null
  };

  return {
    tenantId,
    data: dataHojeISO,
    hora: horaAgora,
    veiculosPatio: veiculosPatioCount,
    boxes: {
      total: boxes.length,
      ocupados: boxesOcupados,
      livres: boxesLivres,
      bloqueadosPeca: boxesBloqueadosPeca
    },
    estagios: contagemEstagios,
    entregas: {
      hoje: entregasHoje,
      emRisco: entregasEmRisco,
      atrasadas: entregasAtrasadas
    },
    orcamentos: {
      pendentes: orcamentosPendentes.length,
      valorPendente,
      adicionaisPendentes,
      aprovados: orcamentosAprovados.length
    },
    suprimentos: {
      osAguardandoPecas,
      pecasAguardandoCompra,
      pedidosAbertos,
      pedidosAtrasados,
      itensAbaixoMinimo,
      rupturasEstoque,
      valorTotalEstoque
    },
    equipe: {
      totalMecanicos: equipeInfo.totalMecanicosAtivos,
      emServico: equipeInfo.totalEmServico,
      emEspera: equipeInfo.totalEmEspera,
      livres: equipeInfo.totalLivres,
      horasDisponiveis: produtividadeOficina.horasDisponiveis,
      horasProdutivas: produtividadeOficina.horasProdutivas,
      taxaUtilizacao: produtividadeOficina.utilizacao,
      capacidadeRestanteHoje: capacidadeInfo.capacidadeRestanteHoje,
      detalhes: equipeInfo
    },
    alertas: contagemAlertas,
    maiorGargalo,
    metricas: {
      tempoMedioPatioHoras,
      tempoMedioPatioMinutos: tempoMedioPatioHoras != null ? Math.round(tempoMedioPatioHoras * 60) : null,
      tempoMedioEsperaPecaHoras,
      tempoMedioEsperaPecaMinutos: tempoMedioEsperaPecaHoras != null ? Math.round(tempoMedioEsperaPecaHoras * 60) : null,
      tempoMedioExecucaoHoras,
      tempoMedioExecucaoMinutos: tempoMedioExecucaoHoras != null ? Math.round(tempoMedioExecucaoHoras * 60) : null,
      tempoMedioDiagnosticoMinutos: null,
      taxaOcupacaoBoxesPercentual: taxaOcupacaoBoxes
    }
  };
}

module.exports = {
  parseDataHora,
  gerarResumoOperacional
};
