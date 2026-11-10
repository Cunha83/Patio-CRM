'use strict';

/**
 * services/patio/patioBottleneckSlaService.js
 * 
 * Monitoramento de Gargalos de Parada, Gestão de SLA Parametrizado,
 * Semáforo Dinâmico de Boxes e Consolidação de Indicadores Operacionais.
 * 
 * Arquitetura: <= 350 linhas
 */

const DEFAULT_SLA_MINUTOS = {
  aguardando_peca: 120,
  aguardando_aprovacao_frotista: 90,
  aguardando_prensa_usinagem: 60,
  aguardando_ferramenta_especial: 45,
  outros: 60
};

function criarErro(code, message) {
  const err = new Error(`${code}: ${message}`);
  err.code = code;
  return err;
}

function garantirColecoes(state) {
  if (!state) throw new Error('Estado é obrigatório');
  if (!Array.isArray(state.patioBoxes)) state.patioBoxes = [];
  if (!Array.isArray(state.patioBottlenecks)) state.patioBottlenecks = [];
  if (!Array.isArray(state.os)) state.os = Array.isArray(state.serviceOrders) ? state.serviceOrders : [];
  if (!Array.isArray(state.auditoria)) state.auditoria = [];
}

function registrarGargaloParadaOS(state, payload = {}) {
  garantirColecoes(state);
  const osId = payload.osId;
  if (!osId) throw criarErro('OS_REQUIRED', 'osId é obrigatório para registrar gargalo');

  const os = state.os.find(o => o.id === osId || String(o.num) === String(osId));
  if (!os) throw criarErro('OS_NOT_FOUND', `OS "${osId}" não encontrada`);

  const boxId = payload.boxId || os.boxAtualId;
  const box = boxId ? state.patioBoxes.find(b => b.id === boxId || b.codigo === boxId) : null;

  const motivo = payload.motivoParada || 'outros';
  const slaMaximoMinutos = Number(payload.slaMaximoMinutos) || DEFAULT_SLA_MINUTOS[motivo] || 60;
  const dataInicio = payload.timestamp || new Date().toISOString();

  const gargalo = {
    id: `gar_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    tenantId: payload.tenantId || (box ? box.tenantId : 'default'),
    osId: os.id,
    osNum: os.num || os.id,
    placa: os.placa || os.veiculoPlaca || '',
    boxId: box ? box.id : null,
    boxCodigo: box ? box.codigo : null,
    motivoParada: motivo,
    slaMaximoMinutos,
    observacao: payload.observacao || '',
    responsavel: payload.responsavel || 'Operador Pátio',
    inicioParadaEm: dataInicio,
    fimParadaEm: null,
    tempoParadoMinutos: 0,
    status: 'aberto',
    estourouSla: false,
    resolucao: null
  };

  state.patioBottlenecks.push(gargalo);

  if (box) {
    box.status = 'bloqueado_gargalo';
    box.gargaloAtivoId = gargalo.id;
  }

  if (Array.isArray(state.auditoria)) {
    state.auditoria.push({
      id: `aud_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      tipo: 'registrar_gargalo_parada',
      gargaloId: gargalo.id,
      osId: os.id,
      motivoParada: motivo,
      boxId: box ? box.id : null,
      timestamp: dataInicio
    });
  }

  return { ok: true, gargalo, box };
}

function encerrarGargaloParadaOS(state, gargaloId, {
  resolucao = 'Gargalo solucionado',
  timestamp = null
} = {}) {
  garantirColecoes(state);
  const gargalo = state.patioBottlenecks.find(g => g.id === gargaloId);
  if (!gargalo) throw criarErro('BOTTLENECK_NOT_FOUND', `Gargalo "${gargaloId}" não encontrado`);

  const fim = timestamp || new Date().toISOString();
  gargalo.fimParadaEm = fim;
  gargalo.tempoParadoMinutos = Math.max(0, Math.round((new Date(fim) - new Date(gargalo.inicioParadaEm)) / 60000));
  gargalo.estourouSla = gargalo.tempoParadoMinutos > (Number(gargalo.slaMaximoMinutos) || 60);
  gargalo.status = 'encerrado';
  gargalo.resolucao = resolucao;

  const box = gargalo.boxId ? state.patioBoxes.find(b => b.id === gargalo.boxId) : null;
  if (box && box.gargaloAtivoId === gargalo.id) {
    box.gargaloAtivoId = null;
    box.status = box.osAtualId ? 'ocupado' : 'livre';
  }

  if (Array.isArray(state.auditoria)) {
    state.auditoria.push({
      id: `aud_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      tipo: 'encerrar_gargalo_parada',
      gargaloId: gargalo.id,
      tempoParadoMinutos: gargalo.tempoParadoMinutos,
      estourouSla: gargalo.estourouSla,
      timestamp: fim
    });
  }

  return { ok: true, gargalo, box };
}

function calcularIndicadoresOcupacaoEGargalos(state, {
  tenantId = null,
  timestampReferencia = null
} = {}) {
  garantirColecoes(state);

  let boxes = [...state.patioBoxes];
  let gargalos = [...state.patioBottlenecks];

  if (tenantId) {
    boxes = boxes.filter(b => !b.tenantId || b.tenantId === tenantId);
    gargalos = gargalos.filter(g => !g.tenantId || g.tenantId === tenantId);
  }

  const agoraMs = new Date(timestampReferencia || new Date().toISOString()).getTime();
  const totalBoxes = boxes.length;
  const boxesLivres = boxes.filter(b => b.status === 'livre').length;
  const boxesOcupadosProdutivos = boxes.filter(b => b.status === 'ocupado').length;
  const boxesBloqueadosGargalo = boxes.filter(b => b.status === 'bloqueado_gargalo').length;

  const taxaOcupacaoPercentual = totalBoxes > 0
    ? Math.round(((boxesOcupadosProdutivos + boxesBloqueadosGargalo) / totalBoxes) * 100)
    : 0;
  const taxaBoxesTravadosGargaloPercentual = totalBoxes > 0
    ? Math.round((boxesBloqueadosGargalo / totalBoxes) * 100)
    : 0;

  const gargalosAtivos = [];
  const tempoMedioParadaPorMotivo = {};

  for (const g of gargalos) {
    const motivo = g.motivoParada || 'outros';
    if (!tempoMedioParadaPorMotivo[motivo]) {
      tempoMedioParadaPorMotivo[motivo] = { count: 0, tempoTotalMinutos: 0, tempoMedioMinutos: 0 };
    }

    if (g.status === 'aberto') {
      const decorrido = Math.max(0, Math.round((agoraMs - new Date(g.inicioParadaEm).getTime()) / 60000));
      const slaMax = Number(g.slaMaximoMinutos) || 60;
      const pct = Math.round((decorrido / slaMax) * 100);
      const statusSla = pct > 100 ? 'sla_estourado' : (pct >= 80 ? 'alerta_sla' : 'no_prazo');

      const gAtivo = {
        ...g,
        tempoParadoMinutos: decorrido,
        percentualSla: pct,
        statusSla
      };
      gargalosAtivos.push(gAtivo);

      tempoMedioParadaPorMotivo[motivo].count += 1;
      tempoMedioParadaPorMotivo[motivo].tempoTotalMinutos += decorrido;
    } else {
      tempoMedioParadaPorMotivo[motivo].count += 1;
      tempoMedioParadaPorMotivo[motivo].tempoTotalMinutos += (g.tempoParadoMinutos || 0);
    }
  }

  for (const k in tempoMedioParadaPorMotivo) {
    const item = tempoMedioParadaPorMotivo[k];
    item.tempoMedioMinutos = item.count > 0 ? Math.round(item.tempoTotalMinutos / item.count) : 0;
  }

  const gargalosAtivosCount = gargalosAtivos.length;
  const gargalosEstouradosCount = gargalosAtivos.filter(g => g.statusSla === 'sla_estourado').length;

  return {
    ok: true,
    totalBoxes,
    boxesLivres,
    boxesOcupadosProdutivos,
    boxesBloqueadosGargalo,
    taxaOcupacaoPercentual,
    taxaBoxesTravadosGargaloPercentual,
    gargalosAtivosCount,
    gargalosEstouradosCount,
    gargalosAtivos,
    tempoMedioParadaPorMotivo
  };
}

module.exports = {
  DEFAULT_SLA_MINUTOS,
  registrarGargaloParadaOS,
  encerrarGargaloParadaOS,
  calcularIndicadoresOcupacaoEGargalos
};

