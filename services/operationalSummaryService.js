'use strict';

const { obterAgoraSP } = require('./financialEngine');
const productivityService = require('./productivityService');

function parseDataHora(dataStr, horaStr = '08:00') {
  if (!dataStr) return null;
  if (dataStr instanceof Date) return dataStr;
  const s = String(dataStr).trim();
  if (s.includes('T')) {
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const h = horaStr && /^\d{1,2}:\d{2}$/.test(horaStr.trim()) ? horaStr.trim() : '08:00';
    const [ano, mes, dia] = s.split('-').map(Number);
    const [hora, min] = h.split(':').map(Number);
    const isoUtc = new Date(Date.UTC(ano, mes - 1, dia, hora + 3, min, 0));
    return isNaN(isoUtc.getTime()) ? null : isoUtc;
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

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

  // 7. Métricas Operacionais Estritamente Verídicas (sem estimativas inventadas)
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

  // Espera por Peças
  const osComTemposPecas = osList.filter(o => {
    return o.tempos && typeof o.tempos.esperaPecaHoras === 'number';
  });
  if (osComTemposPecas.length > 0) {
    const soma = osComTemposPecas.reduce((acc, o) => acc + o.tempos.esperaPecaHoras, 0);
    tempoMedioEsperaPecaHoras = Number((soma / osComTemposPecas.length).toFixed(1));
  }

  // Tempo de Execução Real
  const osComTemposExec = osList.filter(o => {
    return o.tempos && typeof o.tempos.execucaoHoras === 'number';
  });
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

/**
 * Formata o resumo executivo para síntese de voz e resposta conversacional
 */
function formatarResumoConversacional(resumo) {
  if (!resumo) return 'Não foi possível obter o resumo operacional no momento.';

  const partes = [];
  partes.push(`O pátio está com ${resumo.veiculosPatio} veículo(s) no total.`);
  partes.push(`Temos ${resumo.estagios.executando} em execução, ${resumo.estagios.peca} aguardando peças e ${resumo.estagios.fila} na fila.`);

  if (resumo.entregas.atrasadas > 0) {
    partes.push(`Atenção: há ${resumo.entregas.atrasadas} entrega(s) com horário atrasado.`);
  } else if (resumo.entregas.emRisco > 0) {
    partes.push(`Temos ${resumo.entregas.emRisco} entrega(s) em risco para hoje.`);
  }

  if (resumo.alertas.critico > 0 || resumo.alertas.alto > 0) {
    partes.push(`Existem ${resumo.alertas.critico + resumo.alertas.alto} alerta(s) de alta prioridade que precisam de atenção.`);
  }

  return partes.join(' ');
}

/**
 * Formata a resposta para a pergunta "qual é o maior gargalo hoje?"
 */
function formatarMaiorGargalo(resumo) {
  if (!resumo || !resumo.maiorGargalo || resumo.maiorGargalo.tipo === 'nenhum') {
    return 'Não temos gargalos críticos identificados hoje. A operação está fluindo dentro do previsto.';
  }
  return `O maior gargalo hoje está em: ${resumo.maiorGargalo.descricao}`;
}

/**
 * Formata as entregas em risco para voz / WhatsApp
 */
function formatarEntregasEmRisco(resumo, eventos = []) {
  if (!resumo) return 'Sem dados de entregas.';
  const eventosEntrega = (eventos || []).filter(e =>
    (e.tipo === 'entrega_atrasada' || e.tipo === 'entrega_proxima') &&
    (e.status === 'aberto' || e.status === 'reconhecido')
  );

  if (eventosEntrega.length === 0 && resumo.entregas.emRisco === 0) {
    return 'Não há nenhuma entrega em risco ou atrasada para hoje. Todas estão no prazo.';
  }

  const listaDesc = eventosEntrega.map(e => e.titulo || e.descricao).join('; ');
  return `Temos ${eventosEntrega.length || resumo.entregas.emRisco} entrega(s) em situação de alerta: ${listaDesc}`;
}

/**
 * Formata lista de alertas que precisam de atenção imediata
 */
function formatarAlertasAtencao(eventos = []) {
  const criticosEAltos = (eventos || []).filter(e =>
    (e.severidade === 'critico' || e.severidade === 'alto' || e.prioridade === 'P1' || e.prioridade === 'P2') &&
    (e.status === 'aberto' || e.status === 'reconhecido')
  );

  if (criticosEAltos.length === 0) {
    return 'Nenhum alerta crítico ou de alta prioridade pendente no momento.';
  }

  const linhas = criticosEAltos.slice(0, 3).map(e => `[${e.prioridade}] ${e.titulo}`);
  return `Atenção prioritária necessária:\n` + linhas.join('\n');
}

/**
 * Gera o payload completo do dashboard operacional para consumo pelo frontend em uma única chamada
 */
function gerarPainelOperacionalCompleto({
  tenantId,
  state,
  dataReferencia = null,
  horaReferencia = null,
  agoraIso = null,
  agoraDate = null
}) {
  const resumo = gerarResumoOperacional({
    tenantId,
    state,
    dataReferencia,
    horaReferencia,
    agoraIso,
    agoraDate
  });

  const osList = Array.isArray(state.os) ? state.os : [];
  const veiculos = Array.isArray(state.veiculos) ? state.veiculos : [];
  const clientes = Array.isArray(state.clientes) ? state.clientes : [];
  const boxes = Array.isArray(state.boxes) ? state.boxes : [];
  const eventos = Array.isArray(state.operationalEvents) ? state.operationalEvents : [];

  const veiculoMap = new Map(veiculos.map(v => [v.id, v]));
  const clienteMap = new Map(clientes.map(c => [c.id, c]));

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

  const dataHojeISO = resumo.data;

  // 1. Alertas ativos ordenados por prioridade (P1 > P2 > P3 > P4)
  const ordemP = { P1: 1, P2: 2, P3: 3, P4: 4 };
  const alertasAtivos = eventos
    .filter(e => (!e.tenantId || e.tenantId === tenantId) && (e.status === 'aberto' || e.status === 'reconhecido'))
    .sort((a, b) => {
      const pDiff = (ordemP[a.prioridade] || 5) - (ordemP[b.prioridade] || 5);
      if (pDiff !== 0) return pDiff;
      return new Date(b.geradoEm || b.atualizadoEm || b.criadoEm || 0).getTime() - new Date(a.geradoEm || a.atualizadoEm || a.criadoEm || 0).getTime();
    });

  // 2. Mapa detalhado de Boxes
  const boxesDetalhes = boxes.map(b => {
    const osDoBox = osList.find(o => o.box === b.id && o.st !== 'finalizada');
    if (!osDoBox) {
      return {
        id: b.id,
        nome: b.nome || `Box ${b.id}`,
        status: 'livre',
        statusTexto: 'Livre',
        os: null,
        veiculo: null,
        cliente: null,
        mecanico: null,
        tempoFormatado: null,
        alertaCritico: false
      };
    }

    const vei = veiculoMap.get(osDoBox.vei) || {};
    const cli = clienteMap.get(osDoBox.cli || vei.cli) || {};
    const tsInicio = parseDataHora(osDoBox.criadoEm || osDoBox.abertura, '08:00');
    const horasEmBox = tsInicio ? Math.max(0, (agora.getTime() - tsInicio.getTime()) / (1000 * 60 * 60)) : 0;
    const h = Math.floor(horasEmBox);
    const m = Math.floor((horasEmBox - h) * 60);
    const tempoFormatado = `${h}h${String(m).padStart(2, '0')}`;

    // Status do box baseado em backend state
    let statusBox = 'ocupado';
    let statusTexto = 'Em Execução';
    if (osDoBox.st === 'peca') {
      statusBox = 'bloqueado_peca';
      statusTexto = 'Aguardando Peça';
    }

    // Verifica se há alerta ativo para esta OS ou Box
    const alertaBox = alertasAtivos.find(e =>
      (e.recurso?.id === osDoBox.id || e.recurso?.osId === osDoBox.id || e.recurso?.id === b.id)
    );

    if (alertaBox && (alertaBox.severidade === 'critico' || alertaBox.prioridade === 'P1')) {
      statusBox = 'atencao';
      statusTexto = alertaBox.titulo || 'Atenção Crítica';
    }

    const placaVei = vei.placa || osDoBox.placa || 'SEM-PLACA';
    const modeloVei = vei.modelo || 'Caminhão';
    const clienteNome = cli.nome || 'Cliente não informado';
    const tempoNoBoxHoras = Number(horasEmBox.toFixed(1));

    return {
      id: b.id,
      nome: b.nome || `Box ${b.id}`,
      status: statusBox,
      statusTexto,
      placa: placaVei,
      modelo: modeloVei,
      cliente: clienteNome,
      mecanico: osDoBox.mec || 'A definir',
      osId: osDoBox.id,
      osNum: osDoBox.num,
      tempoNoBoxHoras,
      os: {
        id: osDoBox.id,
        num: osDoBox.num,
        st: osDoBox.st,
        prev: osDoBox.prev,
        horaPrev: osDoBox.horaPrev || osDoBox.promessaEntrega?.hora || '18:00',
        possivelGarantia: Boolean(osDoBox.possivelGarantia)
      },
      veiculo: {
        id: vei.id || osDoBox.vei,
        placa: placaVei,
        modelo: modeloVei
      },
      clienteObj: {
        id: cli.id || osDoBox.cli,
        nome: clienteNome
      },
      tempoHoras: tempoNoBoxHoras,
      tempoFormatado,
      alertaCritico: Boolean(alertaBox)
    };
  });

  // 3. Estágios com itens
  const osAtivas = osList.filter(o => o.st !== 'finalizada');
  const listaEstagios = [
    {
      id: 'fila',
      nome: 'Fila de Espera',
      contagem: resumo.estagios.fila,
      itens: osAtivas.filter(o => o.st === 'fila' || (!o.st && !o.box))
    },
    {
      id: 'diagnostico',
      nome: 'Diagnóstico',
      contagem: osAtivas.filter(o => o.st === 'diagnostico' || o.st === 'aguardando_diagnostico').length,
      itens: osAtivas.filter(o => o.st === 'diagnostico' || o.st === 'aguardando_diagnostico')
    },
    {
      id: 'aprovacao',
      nome: 'Aprovação',
      contagem: resumo.estagios.aprovacao,
      itens: osAtivas.filter(o => o.st === 'aprovacao')
    },
    {
      id: 'executando',
      nome: 'Em Execução',
      contagem: resumo.estagios.executando,
      itens: osAtivas.filter(o => o.st === 'executando')
    },
    {
      id: 'peca',
      nome: 'Aguardando Peça',
      contagem: resumo.estagios.peca,
      itens: osAtivas.filter(o => o.st === 'peca')
    },
    {
      id: 'finalizadaHoje',
      nome: 'Prontos Hoje',
      contagem: resumo.estagios.finalizadaHoje,
      itens: osList.filter(o => {
        if (o.st !== 'finalizada') return false;
        const dataFim = o.fechamento || o.concluidoEm || o.atualizadoEm || o.abertura;
        return String(dataFim || '').startsWith(dataHojeISO);
      })
    }
  ].map(est => ({
    ...est,
    itens: est.itens.map(o => {
      const v = veiculoMap.get(o.vei) || {};
      const c = clienteMap.get(o.cli || v.cli) || {};
      return {
        id: o.id,
        num: o.num,
        placa: v.placa || o.placa || 'SEM-PLACA',
        modelo: v.modelo || 'Caminhão',
        cliente: c.nome || 'Cliente',
        box: o.box || 'Pátio',
        mec: o.mec || 'A definir',
        st: o.st,
        prev: o.prev || o.promessaEntrega?.data || '',
        horaPrev: o.horaPrev || o.promessaEntrega?.hora || '18:00',
        possivelGarantia: Boolean(o.possivelGarantia)
      };
    })
  }));

  const estagios = {
    fila: resumo.estagios.fila,
    diagnostico: osAtivas.filter(o => o.st === 'diagnostico' || o.st === 'aguardando_diagnostico').length,
    aprovacao: resumo.estagios.aprovacao,
    executando: resumo.estagios.executando,
    peca: resumo.estagios.peca,
    finalizadaHoje: resumo.estagios.finalizadaHoje,
    lista: listaEstagios
  };

  // 4. Entregas de Hoje
  const entregasHoje = [];
  for (const o of osList) {
    let dtPrometida = o.promessaEntrega?.data || o.prev;
    let hrPrometida = o.promessaEntrega?.hora || o.horaPrev || '18:00';

    if (dtPrometida === dataHojeISO || (o.st !== 'finalizada' && dtPrometida && dtPrometida < dataHojeISO)) {
      const v = veiculoMap.get(o.vei) || {};
      const c = clienteMap.get(o.cli || v.cli) || {};
      let statusEntrega = 'no_prazo';
      let statusTexto = 'No Prazo';

      if (o.st === 'finalizada') {
        statusEntrega = 'concluida';
        statusTexto = 'Concluída';
      } else {
        const tsPromessa = parseDataHora(dtPrometida, hrPrometida);
        if (tsPromessa) {
          const diffMinutos = (tsPromessa.getTime() - agora.getTime()) / (1000 * 60);
          if (diffMinutos < 0) {
            statusEntrega = 'atrasada';
            statusTexto = 'ATRASADA';
          } else if (diffMinutos <= 60) {
            statusEntrega = 'em_risco';
            statusTexto = 'EM RISCO';
          }
        }
      }

      entregasHoje.push({
        id: o.id,
        num: o.num,
        placa: v.placa || o.placa || 'SEM-PLACA',
        modelo: v.modelo || 'Caminhão',
        cliente: c.nome || 'Cliente',
        mecanico: o.mec || 'A definir',
        dataPrometida: dtPrometida,
        horaPrometida: hrPrometida,
        statusEntrega,
        statusTexto,
        st: o.st,
        box: o.box || 'Pátio'
      });
    }
  }

  // Ordena entregas por horário e status (atrasada > em_risco > no_prazo > concluida)
  const ordemEntrega = { atrasada: 1, em_risco: 2, no_prazo: 3, concluida: 4 };
  entregasHoje.sort((a, b) => {
    const sDiff = (ordemEntrega[a.statusEntrega] || 5) - (ordemEntrega[b.statusEntrega] || 5);
    if (sDiff !== 0) return sDiff;
    return String(a.horaPrometida).localeCompare(String(b.horaPrometida));
  });

  // 5. Veículos para busca rápida no frontend
  const veiculosAtivos = osAtivas.map(o => {
    const v = veiculoMap.get(o.vei) || {};
    const c = clienteMap.get(o.cli || v.cli) || {};
    const alertCount = alertasAtivos.filter(e => e.recurso?.id === o.id || e.recurso?.id === v.id).length;
    return {
      osId: o.id,
      num: o.num,
      veiculoId: v.id || o.vei,
      placa: v.placa || o.placa || 'SEM-PLACA',
      modelo: v.modelo || 'Caminhão',
      marca: v.marca || '',
      ano: v.ano || '',
      cliente: c.nome || 'Cliente',
      box: o.box || 'Pátio',
      mec: o.mec || 'A definir',
      st: o.st,
      abertura: o.abertura || o.criadoEm || '',
      prev: o.prev || o.promessaEntrega?.data || '',
      horaPrev: o.horaPrev || o.promessaEntrega?.hora || '18:00',
      queixa: o.queixa || '',
      possivelGarantia: Boolean(o.possivelGarantia),
      alertasQtd: alertCount
    };
  });

  return {
    success: true,
    tenantId,
    timestamp: agora.toISOString(),
    resumo,
    boxes: boxesDetalhes,
    estagios,
    entregas: entregasHoje,
    alertas: alertasAtivos,
    gargalos: {
      maiorGargalo: resumo.maiorGargalo,
      distribuicao: resumo.estagios
    },
    metricas: resumo.metricas,
    veiculos: veiculosAtivos
  };
}

/**
 * Registra snapshot periódico para histórico temporal operacional
 */
function registrarSnapshotOperacional({
  tenantId,
  state,
  agoraIso = null,
  agoraDate = null
}) {
  if (!state) return null;
  state.operationalSnapshots = Array.isArray(state.operationalSnapshots) ? state.operationalSnapshots : [];

  const resumo = gerarResumoOperacional({
    tenantId,
    state,
    agoraIso,
    agoraDate
  });

  const timestamp = agoraIso || (agoraDate instanceof Date ? agoraDate.toISOString() : new Date().toISOString());

  const snapshot = {
    id: `snp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    tenantId,
    timestamp,
    veiculosPatio: resumo.veiculosPatio,
    boxes: resumo.boxes,
    estagios: resumo.estagios,
    entregas: resumo.entregas,
    alertas: resumo.alertas,
    maiorGargalo: resumo.maiorGargalo?.tipo || 'nenhum',
    metricas: resumo.metricas
  };

  state.operationalSnapshots.unshift(snapshot);

  // Retenção: máximo 1000 snapshots (aprox 90 dias)
  if (state.operationalSnapshots.length > 1000) {
    state.operationalSnapshots = state.operationalSnapshots.slice(0, 1000);
  }

  return snapshot;
}

/**
 * Consulta snapshots históricos por período (24h, 7d, 30d)
 */
function obterHistoricoSnapshots({
  tenantId,
  state,
  periodo = '24h',
  agora = new Date()
}) {
  if (!state || !Array.isArray(state.operationalSnapshots)) return [];

  const msPorPeriodo = {
    '24h': 24 * 3600 * 1000,
    '7d': 7 * 24 * 3600 * 1000,
    '30d': 30 * 24 * 3600 * 1000
  };

  const limiteMs = msPorPeriodo[periodo] || msPorPeriodo['24h'];
  const agoraMs = agora instanceof Date ? agora.getTime() : new Date(agora).getTime();

  return state.operationalSnapshots
    .filter(s => s.tenantId === tenantId && (agoraMs - new Date(s.timestamp).getTime()) <= limiteMs)
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
}

module.exports = {
  gerarResumoOperacional,
  gerarPainelOperacionalCompleto,
  registrarSnapshotOperacional,
  obterHistoricoSnapshots,
  formatarResumoConversacional,
  formatarMaiorGargalo,
  formatarEntregasEmRisco,
  formatarAlertasAtencao
};
