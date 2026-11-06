'use strict';

const { arredondar, hojeISO } = require('./executiveHelpers');

/**
 * 2. RENTABILIDADE E PRODUTIVIDADE DE EQUIPE & BOXES
 */
function analisarProdutividadeEquipe(state = {}, options = {}) {
  const tenantId = options.tenantId || state.tenantId || 'default';
  const dataRef = options.dataReferencia || hojeISO();

  const workers = Array.isArray(state.workers)
    ? state.workers.filter(w => (!w.tenantId || w.tenantId === tenantId) && w.ativo !== false)
    : [];

  const laborEntries = Array.isArray(state.laborEntries)
    ? state.laborEntries.filter(e => !e.tenantId || e.tenantId === tenantId)
    : [];

  const osList = Array.isArray(state.os)
    ? state.os.filter(o => !o.tenantId || o.tenantId === tenantId)
    : [];

  const boxes = Array.isArray(state.boxes)
    ? state.boxes.filter(b => !b.tenantId || b.tenantId === tenantId)
    : [];

  const equipeMetrics = [];
  let totalHorasApontadasEquipe = 0;
  let totalHorasProdutivasEquipe = 0;
  let totalReceitaMaoDeObra = 0;
  let totalOSAtendidasUnicas = new Set();

  for (const worker of workers) {
    const entriesWorker = laborEntries.filter(e => e.workerId === worker.id);

    let minutosProdutivos = 0;
    let minutosEspera = 0;
    let minutosRetrabalho = 0;
    let minutosOutros = 0;

    const osWorkerSet = new Set();
    let receitaMaoDeObraWorker = 0;

    for (const e of entriesWorker) {
      const dur = Number(e.durationMinutes) || 0;
      if (e.type === 'produtivo' || e.type === 'diagnostico') {
        minutosProdutivos += dur;
      } else if (e.type === 'espera') {
        minutosEspera += dur;
      } else if (e.type === 'retrabalho') {
        minutosRetrabalho += dur;
      } else {
        minutosOutros += dur;
      }

      if (e.osId) {
        osWorkerSet.add(e.osId);
        totalOSAtendidasUnicas.add(e.osId);
      }
    }

    for (const os of osList) {
      const servicos = Array.isArray(os.servicos) ? os.servicos : (Array.isArray(os.services) ? os.services : []);
      for (const s of servicos) {
        const mecanicoVinculado = s.mecanicoId === worker.id ||
                                  s.workerId === worker.id ||
                                  (s.mecanico && String(s.mecanico).toLowerCase() === String(worker.nome).toLowerCase());
        if (mecanicoVinculado) {
          receitaMaoDeObraWorker += (Number(s.valor || s.preco || s.total) || 0);
          osWorkerSet.add(os.id);
          totalOSAtendidasUnicas.add(os.id);
        }
      }
    }

    const jornadaHoras = worker.disponivelHoje === false ? 0 : (Number(worker.jornadaHorasDia) || 8);
    const horasProdutivas = arredondar(minutosProdutivos / 60, 2);
    const horasEspera = arredondar(minutosEspera / 60, 2);
    const horasRetrabalho = arredondar(minutosRetrabalho / 60, 2);
    const horasApontadas = arredondar((minutosProdutivos + minutosEspera + minutosRetrabalho + minutosOutros) / 60, 2);

    let taxaUtilizacao = null;
    if (jornadaHoras > 0) {
      taxaUtilizacao = arredondar((horasProdutivas / jornadaHoras) * 100, 1);
    }

    const totalOSWorker = osWorkerSet.size;
    const ticketMedioMaoDeObra = totalOSWorker > 0 ? arredondar(receitaMaoDeObraWorker / totalOSWorker) : 0;

    let statusCarga = 'produtivo';
    let parecerWorker = '';
    if (jornadaHoras > 0 && taxaUtilizacao !== null) {
      if (taxaUtilizacao >= 90 || horasApontadas > 9) {
        statusCarga = 'sobrecarregado';
        parecerWorker = 'Alta sobrecarga de trabalho. Recomenda-se redistribuir serviços para evitar fadiga e atrasos.';
      } else if (taxaUtilizacao < 40 && totalOSWorker === 0) {
        statusCarga = 'ocioso';
        parecerWorker = 'Colaborador com capacidade ociosa. Disponível para assumir novas ordens de serviço.';
      } else {
        statusCarga = 'normal';
        parecerWorker = 'Ritmo produtivo equilibrado e alinhado à jornada.';
      }
    } else {
      statusCarga = totalOSWorker > 0 ? 'produtivo' : 'disponivel';
      parecerWorker = totalOSWorker > 0 ? 'Atuando em ordens de serviço ativas.' : 'Disponível no pátio.';
    }

    totalHorasApontadasEquipe = arredondar(totalHorasApontadasEquipe + horasApontadas);
    totalHorasProdutivasEquipe = arredondar(totalHorasProdutivasEquipe + horasProdutivas);
    totalReceitaMaoDeObra = arredondar(totalReceitaMaoDeObra + receitaMaoDeObraWorker);

    equipeMetrics.push({
      workerId: worker.id,
      nome: worker.nome || 'Colaborador',
      funcao: worker.funcao || 'Mecânico',
      jornadaHoras,
      horasApontadas,
      horasProdutivas,
      horasEspera,
      horasRetrabalho,
      taxaUtilizacao,
      totalOSAtendidas: totalOSWorker,
      receitaMaoDeObraGerada: arredondar(receitaMaoDeObraWorker),
      ticketMedioMaoDeObra,
      statusCarga,
      parecer: parecerWorker
    });
  }

  equipeMetrics.sort((a, b) => (b.receitaMaoDeObraGerada - a.receitaMaoDeObraGerada) || (b.horasProdutivas - a.horasProdutivas));

  const mecanicosSobrecarregados = equipeMetrics.filter(m => m.statusCarga === 'sobrecarregado');
  const mecanicosOciosos = equipeMetrics.filter(m => m.statusCarga === 'ocioso');
  const mecanicoDestaque = equipeMetrics.length > 0 ? equipeMetrics[0] : null;

  const boxesMetrics = [];
  let boxesOcupados = 0;
  for (const b of boxes) {
    const osNoBox = osList.find(o =>
      (o.box === b.nome || o.boxId === b.id || o.box === b.id) &&
      o.st !== 'finalizada' && o.st !== 'cancelada'
    );

    const ocupado = Boolean(osNoBox);
    if (ocupado) boxesOcupados++;

    boxesMetrics.push({
      boxId: b.id,
      nome: b.nome || b.id,
      tipo: b.tipo || 'Padrão',
      status: ocupado ? 'ocupado' : 'livre',
      osId: osNoBox ? osNoBox.id : null,
      osNum: osNoBox ? (osNoBox.num || osNoBox.id) : null,
      veiculo: osNoBox ? (osNoBox.vei || osNoBox.placa) : null,
      cliente: osNoBox ? (osNoBox.cli || osNoBox.clienteNome) : null,
      tempoNoBoxHoras: osNoBox && osNoBox.horaEntrada ? arredondar(Math.max(0, (Date.now() - new Date(osNoBox.dataAbertura || Date.now()).getTime()) / 3600000), 1) : 0
    });
  }

  const totalBoxes = boxes.length;
  const taxaOcupacaoBoxes = totalBoxes > 0 ? arredondar((boxesOcupados / totalBoxes) * 100, 1) : 0;

  return {
    sucesso: true,
    tenantId,
    dataReferencia: dataRef,
    resumo: {
      totalMecanicos: workers.length,
      totalOSAtendidasUnicas: totalOSAtendidasUnicas.size,
      totalHorasApontadasEquipe,
      totalHorasProdutivasEquipe,
      totalReceitaMaoDeObra,
      ticketMedioGeralPorOS: totalOSAtendidasUnicas.size > 0 ? arredondar(totalReceitaMaoDeObra / totalOSAtendidasUnicas.size) : 0,
      totalBoxes,
      boxesOcupados,
      boxesLivres: Math.max(0, totalBoxes - boxesOcupados),
      taxaOcupacaoBoxes,
      mecanicoDestaque: mecanicoDestaque ? { nome: mecanicoDestaque.nome, receita: mecanicoDestaque.receitaMaoDeObraGerada, osCount: mecanicoDestaque.totalOSAtendidas } : null,
      totalSobrecarregados: mecanicosSobrecarregados.length,
      totalOciosos: mecanicosOciosos.length
    },
    equipe: equipeMetrics,
    boxes: boxesMetrics
  };
}

module.exports = {
  analisarProdutividadeEquipe
};

