'use strict';

const { parseDataHora } = require('./summaryTimeHelpers');
const { gerarResumoOperacional } = require('./summaryMetrics');

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

    let statusBox = 'ocupado';
    let statusTexto = 'Em Execução';
    if (osDoBox.st === 'peca') {
      statusBox = 'bloqueado_peca';
      statusTexto = 'Aguardando Peça';
    }

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

module.exports = {
  gerarPainelOperacionalCompleto
};
