'use strict';

const CONFIG_PADRAO_ALERTAS = {
  alertasProativosAtivos: true,
  alertaOrcamentoParadoAtivo: true,
  slaOrcamentoParadoHoras: 4,
  alertaGargaloBoxAtivo: true,
  slaGargaloBoxHoras: 6,
  cooldownAlertasMinutos: 240
};

function obterConfigAlertas(state = {}) {
  const cfg = state.cfg || state.config || {};
  const ass = cfg.assistente || cfg.assistant || {};
  const wpp = cfg.whatsapp || {};

  return {
    alertasProativosAtivos: ass.alertasProativosAtivos !== undefined
      ? Boolean(ass.alertasProativosAtivos)
      : (wpp.alertasProativosAtivos !== undefined ? Boolean(wpp.alertasProativosAtivos) : CONFIG_PADRAO_ALERTAS.alertasProativosAtivos),
    alertaOrcamentoParadoAtivo: ass.alertaOrcamentoParadoAtivo !== undefined
      ? Boolean(ass.alertaOrcamentoParadoAtivo)
      : (wpp.alertaOrcamentoParadoAtivo !== undefined ? Boolean(wpp.alertaOrcamentoParadoAtivo) : CONFIG_PADRAO_ALERTAS.alertaOrcamentoParadoAtivo),
    slaOrcamentoParadoHoras: Number(ass.slaOrcamentoParadoHoras) > 0
      ? Number(ass.slaOrcamentoParadoHoras)
      : (Number(wpp.slaOrcamentoParadoHoras) > 0 ? Number(wpp.slaOrcamentoParadoHoras) : CONFIG_PADRAO_ALERTAS.slaOrcamentoParadoHoras),
    alertaGargaloBoxAtivo: ass.alertaGargaloBoxAtivo !== undefined
      ? Boolean(ass.alertaGargaloBoxAtivo)
      : (wpp.alertaGargaloBoxAtivo !== undefined ? Boolean(wpp.alertaGargaloBoxAtivo) : CONFIG_PADRAO_ALERTAS.alertaGargaloBoxAtivo),
    slaGargaloBoxHoras: Number(ass.slaGargaloBoxHoras) > 0
      ? Number(ass.slaGargaloBoxHoras)
      : (Number(wpp.slaGargaloBoxHoras) > 0 ? Number(wpp.slaGargaloBoxHoras) : CONFIG_PADRAO_ALERTAS.slaGargaloBoxHoras),
    cooldownAlertasMinutos: Number(ass.cooldownAlertasMinutos) > 0
      ? Number(ass.cooldownAlertasMinutos)
      : (Number(wpp.cooldownAlertasMinutos) > 0 ? Number(wpp.cooldownAlertasMinutos) : CONFIG_PADRAO_ALERTAS.cooldownAlertasMinutos),
    displayName: ass.displayName || 'Verônica'
  };
}

function calcularHoras(inicio, fim) {
  if (!inicio || !fim) return 0;
  const dInicio = inicio instanceof Date ? inicio : new Date(inicio);
  const dFim = fim instanceof Date ? fim : new Date(fim);
  if (isNaN(dInicio.getTime()) || isNaN(dFim.getTime())) return 0;
  return Math.max(0, (dFim.getTime() - dInicio.getTime()) / (1000 * 60 * 60));
}

function detectarOrcamentosParados({ state = {}, tenantId = 'default', agoraDate = null, slaHoras = null }) {
  const cfgAlertas = obterConfigAlertas(state);
  if (!cfgAlertas.alertasProativosAtivos || !cfgAlertas.alertaOrcamentoParadoAtivo) {
    return [];
  }

  const slaLimite = Number(slaHoras) > 0 ? Number(slaHoras) : cfgAlertas.slaOrcamentoParadoHoras;
  const agora = (agoraDate instanceof Date && !isNaN(agoraDate.getTime())) ? agoraDate : new Date();

  const quotations = Array.isArray(state.quotations) ? state.quotations : [];
  const orcamentosLegados = Array.isArray(state.orcamentos) ? state.orcamentos : [];
  const osList = Array.isArray(state.os) ? state.os : [];
  const boxes = Array.isArray(state.boxes) ? state.boxes : [];
  const clientes = Array.isArray(state.clientes) ? state.clientes : [];
  const veiculos = Array.isArray(state.veiculos) ? state.veiculos : [];

  const clienteMap = new Map(clientes.map(c => [c.id, c.nome || c.razaoSocial || c.id]));
  const veiculoMap = new Map(veiculos.map(v => [v.id, v]));
  const boxMap = new Map(boxes.map(b => [b.id, b.nome || b.id]));

  const statusPendentes = new Set([
    'aguardando_aprovacao',
    'pendente',
    'enviado',
    'rascunho_aguardando',
    'aberto'
  ]);

  const listaAlertas = [];

  const osEmBoxPorVeiculo = new Map();
  const osEmBoxPorId = new Map();
  for (const o of osList) {
    if (o.st !== 'finalizada' && o.st !== 'cancelada' && o.box) {
      if (o.vei) osEmBoxPorVeiculo.set(o.vei, o);
      if (o.placa) osEmBoxPorVeiculo.set(o.placa, o);
      osEmBoxPorId.set(o.id, o);
    }
  }

  const todosOrcamentos = [...quotations, ...orcamentosLegados];
  const orcamentosProcessados = new Set();

  for (const orc of todosOrcamentos) {
    if (!orc || !orc.id || orcamentosProcessados.has(orc.id)) continue;
    orcamentosProcessados.add(orc.id);

    const st = String(orc.status || '').toLowerCase().trim();
    if (!statusPendentes.has(st)) continue;

    const dataRef = orc.enviadoEm || orc.atualizadoEm || orc.criadoEm || orc.data;
    const tsInicio = dataRef ? new Date(dataRef) : null;
    if (!tsInicio || isNaN(tsInicio.getTime())) continue;

    const horasParado = calcularHoras(tsInicio, agora);
    if (horasParado >= slaLimite) {
      const veiculoId = orc.veiculoId || (orc.veiculo && orc.veiculo.id);
      let placa = orc.placa;
      if (!placa && veiculoId && veiculoMap.has(veiculoId)) {
        placa = veiculoMap.get(veiculoId).placa;
      }

      const osVinculada = (orc.osId && osEmBoxPorId.get(orc.osId)) ||
                          (veiculoId && osEmBoxPorVeiculo.get(veiculoId)) ||
                          (placa && osEmBoxPorVeiculo.get(placa));

      const ocupaBox = Boolean(osVinculada && osVinculada.box);
      const boxId = ocupaBox ? osVinculada.box : null;
      const boxNome = boxId ? (boxMap.get(boxId) || boxId) : null;

      const clienteId = orc.clienteId || (osVinculada && osVinculada.cli);
      const clienteNome = (clienteId && clienteMap.get(clienteId)) || orc.clienteNome || 'Cliente não identificado';

      const valorTotal = Number(orc.totalGeral || orc.valorTotal || orc.total || 0);

      listaAlertas.push({
        tipo: 'orcamento_parado',
        id: orc.id,
        codigo: orc.codigo || `ORC-${orc.id}`,
        osId: orc.osId || (osVinculada ? osVinculada.id : null),
        osNum: osVinculada ? (osVinculada.num || osVinculada.id) : (orc.osNum || null),
        placa: placa || 'SEM-PLACA',
        clienteNome,
        valorTotal,
        statusOrcamento: st,
        horasParado: Number(horasParado.toFixed(1)),
        slaHoras: slaLimite,
        ocupaBox,
        boxId,
        boxNome,
        enviadoEm: dataRef,
        chaveCooldown: `orcamento:${tenantId}:${orc.id}`,
        recomendacao: ocupaBox
          ? `Prioridade Alta: Veículo ocupa o ${boxNome}. Cobrar autorização urgente ou remanejar veículo para liberar o box.`
          : 'Contatar cliente para aprovação comercial ou verificar se há dúvidas na cotação.'
      });
    }
  }

  for (const o of osList) {
    if (o.st === 'aprovacao') {
      const orcExistente = listaAlertas.find(a => a.osId === o.id);
      if (orcExistente) continue;

      const dataRef = o.atualizadoEm || o.criadoEm || o.abertura;
      const tsInicio = dataRef ? new Date(dataRef) : null;
      if (!tsInicio || isNaN(tsInicio.getTime())) continue;

      const horasParado = calcularHoras(tsInicio, agora);
      if (horasParado >= slaLimite) {
        const v = veiculoMap.get(o.vei) || {};
        const placa = v.placa || o.placa || 'SEM-PLACA';
        const clienteNome = (o.cli && clienteMap.get(o.cli)) || 'Cliente não identificado';
        const ocupaBox = Boolean(o.box);
        const boxNome = ocupaBox ? (boxMap.get(o.box) || o.box) : null;
        const valorTotal = Number(o.total || o.valorTotal || 0);

        listaAlertas.push({
          tipo: 'orcamento_parado',
          id: `os_aprovacao_${o.id}`,
          codigo: `OS-#${o.num || o.id}`,
          osId: o.id,
          osNum: o.num || o.id,
          placa,
          clienteNome,
          valorTotal,
          statusOrcamento: 'aprovacao',
          horasParado: Number(horasParado.toFixed(1)),
          slaHoras: slaLimite,
          ocupaBox,
          boxId: o.box || null,
          boxNome,
          enviadoEm: dataRef,
          chaveCooldown: `orcamento:${tenantId}:os_${o.id}`,
          recomendacao: ocupaBox
            ? `Veículo ocupa o ${boxNome} em aprovação de orçamento. Contatar cliente com urgência.`
            : 'Cobrar retorno do orçamento da OS com o cliente.'
        });
      }
    }
  }

  return listaAlertas.sort((a, b) => b.horasParado - a.horasParado);
}

function detectarGargalosBox({ state = {}, tenantId = 'default', agoraDate = null, slaHoras = null }) {
  const cfgAlertas = obterConfigAlertas(state);
  if (!cfgAlertas.alertasProativosAtivos || !cfgAlertas.alertaGargaloBoxAtivo) {
    return [];
  }

  const slaLimite = Number(slaHoras) > 0 ? Number(slaHoras) : cfgAlertas.slaGargaloBoxHoras;
  const agora = (agoraDate instanceof Date && !isNaN(agoraDate.getTime())) ? agoraDate : new Date();

  const boxes = Array.isArray(state.boxes) ? state.boxes : [];
  const osList = Array.isArray(state.os) ? state.os : [];
  const veiculos = Array.isArray(state.veiculos) ? state.veiculos : [];
  const clientes = Array.isArray(state.clientes) ? state.clientes : [];
  const laborEntries = Array.isArray(state.laborEntries) ? state.laborEntries : [];

  const veiculoMap = new Map(veiculos.map(v => [v.id, v]));
  const clienteMap = new Map(clientes.map(c => [c.id, c.nome || c.razaoSocial || c.id]));

  const gargalos = [];

  for (const box of boxes) {
    if (!box || !box.id) continue;

    const osNoBox = osList.find(o =>
      o.box === box.id &&
      (o.tenantId === tenantId || !o.tenantId) &&
      o.st !== 'finalizada' &&
      o.st !== 'cancelada'
    );

    if (!osNoBox) continue;

    const v = veiculoMap.get(osNoBox.vei) || {};
    const placa = v.placa || osNoBox.placa || 'SEM-PLACA';
    const clienteNome = (osNoBox.cli && clienteMap.get(osNoBox.cli)) || 'Cliente não informado';

    const dataEntradaBox = osNoBox.boxEntradaEm ||
      osNoBox.emExecucaoDesde ||
      osNoBox.criadoEm ||
      osNoBox.abertura ||
      osNoBox.atualizadoEm;

    const tsEntrada = dataEntradaBox ? new Date(dataEntradaBox) : null;
    const horasNoBox = tsEntrada && !isNaN(tsEntrada.getTime())
      ? calcularHoras(tsEntrada, agora)
      : 0;

    const apontamentoAtivo = laborEntries.find(e =>
      e.status === 'ativo' &&
      (e.boxId === box.id || e.osId === osNoBox.id)
    );

    const apontamentosDaOS = laborEntries.filter(e =>
      e.osId === osNoBox.id || e.boxId === box.id
    );

    let horasSemApontamento = 0;
    if (!apontamentoAtivo) {
      if (apontamentosDaOS.length > 0) {
        const datasFim = apontamentosDaOS
          .map(e => e.endedAt || e.pausedAt || e.startedAt)
          .filter(Boolean)
          .map(d => new Date(d))
          .filter(d => !isNaN(d.getTime()));
        if (datasFim.length > 0) {
          const maisRecente = new Date(Math.max(...datasFim.map(d => d.getTime())));
          horasSemApontamento = calcularHoras(maisRecente, agora);
        } else {
          horasSemApontamento = horasNoBox;
        }
      } else {
        horasSemApontamento = horasNoBox;
      }
    }

    const ultrapassouSlaTempo = horasNoBox >= slaLimite;
    const estagioBloqueado = osNoBox.st === 'peca' || osNoBox.st === 'aprovacao';
    const ociosoSemMecanico = !apontamentoAtivo && horasSemApontamento >= 2 && horasNoBox >= 2;

    if (ultrapassouSlaTempo || (estagioBloqueado && horasNoBox >= 3) || ociosoSemMecanico) {
      let motivo = '';
      let recomendacao = '';

      if (osNoBox.st === 'peca') {
        motivo = `Box bloqueado aguardando peças (${horasNoBox.toFixed(1)}h no box).`;
        recomendacao = 'Cobrar expedição das peças com distribuidor ou avaliar remoção do veículo para vaga de espera.';
      } else if (osNoBox.st === 'aprovacao') {
        motivo = `Box bloqueado aguardando aprovação de orçamento (${horasNoBox.toFixed(1)}h).`;
        recomendacao = 'Cobrar autorização comercial do cliente imediatamente para liberar o posto de trabalho.';
      } else if (ociosoSemMecanico) {
        motivo = `Box ocupado sem mecânico ativo apontando serviço há ${horasSemApontamento.toFixed(1)}h.`;
        recomendacao = 'Alinhar com a liderança de oficina a atribuição de mecânico ou conferir se o serviço foi concluído.';
      } else {
        motivo = `Tempo de execução no box (${horasNoBox.toFixed(1)}h) excedeu o SLA de ${slaLimite}h.`;
        recomendacao = 'Verificar se houve imprevistos mecânicos ou complexidade técnica no serviço.';
      }

      gargalos.push({
        tipo: 'gargalo_box',
        boxId: box.id,
        boxNome: box.nome || box.id,
        osId: osNoBox.id,
        osNum: osNoBox.num || osNoBox.id,
        placa,
        clienteNome,
        statusOS: osNoBox.st || 'executando',
        horasNoBox: Number(horasNoBox.toFixed(1)),
        slaHoras: slaLimite,
        temMecanicoAtivo: Boolean(apontamentoAtivo),
        mecanicoNome: apontamentoAtivo ? (apontamentoAtivo.workerNome || 'Mecânico') : null,
        horasSemApontamento: Number(horasSemApontamento.toFixed(1)),
        motivo,
        recomendacao,
        chaveCooldown: `box:${tenantId}:${box.id}:${placa}`
      });
    }
  }

  return gargalos.sort((a, b) => b.horasNoBox - a.horasNoBox);
}

module.exports = {
  CONFIG_PADRAO_ALERTAS,
  obterConfigAlertas,
  calcularHoras,
  detectarOrcamentosParados,
  detectarGargalosBox
};
