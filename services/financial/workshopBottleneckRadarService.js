'use strict';

const {
  alocarBoxOS,
  liberarBoxOS,
  listarOcupacaoBoxes
} = require('./workshopBoxAllocationService');
const { obterResumoFinanceiroOS } = require('./billingAndSettlementService');

function registrarApontamentoPatioOS(state = {}, payload = {}) {
  const osIdRaw = payload.osId;
  const acaoRaw = String(payload.acao || '').toLowerCase().trim();
  const motivo = payload.motivo ? String(payload.motivo).trim() : null;
  const boxId = payload.boxId ? String(payload.boxId).trim() : null;
  const mecanico = payload.mecanico ? String(payload.mecanico).trim() : null;
  const operador = payload.operador || 'operador';
  const operadorNome = (typeof operador === 'object' ? operador.nome || operador.actorId : operador) || 'operador';
  const agoraISO = payload.agora || new Date().toISOString();

  if (!osIdRaw) {
    const err = new Error('Identificador da OS (osId) é obrigatório.');
    err.status = 400;
    err.statusCode = 400;
    err.code = 'OS_ID_OBRIGATORIO';
    throw err;
  }

  const osNorm = String(osIdRaw).replace(/^#/, '').trim();
  if (!Array.isArray(state.os)) state.os = [];
  const osAlvo = state.os.find(o => String(o.id) === osNorm || String(o.num) === osNorm);
  if (!osAlvo) {
    const err = new Error(`Ordem de serviço #${osNorm} não encontrada.`);
    err.status = 404;
    err.statusCode = 404;
    err.code = 'OS_NAO_ENCONTRADA';
    throw err;
  }

  if (mecanico) osAlvo.mecanico = mecanico;

  if (acaoRaw === 'iniciar' || acaoRaw === 'inicio') {
    osAlvo.etapaPatio = 'em_execucao';
    osAlvo.st = 'executando';
    osAlvo.motivoPausa = null;
    osAlvo.iniciadoExecucaoEm = agoraISO;
    if (boxId) {
      alocarBoxOS(state, { osId: osAlvo.id, boxId, mecanico: osAlvo.mecanico, operador, agora: agoraISO });
    } else {
      const bId = osAlvo.boxId || osAlvo.box;
      if (bId && Array.isArray(state.boxes)) {
        const bObj = state.boxes.find(b => String(b.id).trim() === String(bId).trim());
        if (bObj) bObj.status = 'ocupado';
      }
    }
  } else if (acaoRaw === 'pausar' || acaoRaw === 'pausa') {
    osAlvo.etapaPatio = 'pausado_gargalo';
    osAlvo.st = 'peca';
    osAlvo.motivoPausa = motivo || 'Aguardando peças/instruções';
    osAlvo.pausadoEm = agoraISO;
    const bId = osAlvo.boxId || osAlvo.box;
    if (bId && Array.isArray(state.boxes)) {
      const bObj = state.boxes.find(b => String(b.id).trim() === String(bId).trim());
      if (bObj) bObj.status = 'bloqueado_peca';
    }
  } else if (acaoRaw === 'finalizar' || acaoRaw === 'pronto' || acaoRaw === 'concluir') {
    if (osAlvo.statusChecklist === 'reprovado_critico') {
      const err = new Error('Não é possível finalizar a OS: checklist técnico reprovado com falha crítica de segurança.');
      err.status = 409;
      err.statusCode = 409;
      err.code = 'CHECKLIST_TECNICO_REPROVADO';
      throw err;
    }
    osAlvo.etapaPatio = 'pronto_retirada';
    osAlvo.st = 'finalizada';
    osAlvo.motivoPausa = null;
    osAlvo.concluidoExecucaoEm = agoraISO;
    const bId = osAlvo.boxId || osAlvo.box;
    if (bId) {
      liberarBoxOS(state, { osId: osAlvo.id, boxId: bId, motivo: 'conclusao_execucao', operador, agora: agoraISO });
    }
  } else {
    const err = new Error(`Ação de apontamento inválida: "${acaoRaw}". Use iniciar, pausar ou finalizar.`);
    err.status = 400;
    err.statusCode = 400;
    err.code = 'ACAO_INVALIDA';
    throw err;
  }

  if (!Array.isArray(osAlvo.historicoPatio)) osAlvo.historicoPatio = [];
  osAlvo.historicoPatio.push({
    tipo: 'apontamento_patio',
    acao: acaoRaw,
    motivo: osAlvo.motivoPausa || motivo || null,
    boxId: osAlvo.boxId || null,
    mecanico: osAlvo.mecanico || null,
    operador: operadorNome,
    data: agoraISO
  });

  return {
    ok: true,
    sucesso: true,
    os: osAlvo,
    acao: acaoRaw,
    etapaPatio: osAlvo.etapaPatio,
    boxId: osAlvo.boxId || null,
    motivoPausa: osAlvo.motivoPausa || null
  };
}

function obterRadarGargalosPatio(state = {}, opcoes = {}) {
  const agora = opcoes?.agora ? new Date(opcoes.agora) : new Date();
  const ocupBoxes = listarOcupacaoBoxes(state, { agora: agora.toISOString() });
  const osLista = Array.isArray(state.os) ? state.os : [];
  const veiculos = Array.isArray(state.veiculos) ? state.veiculos : [];
  const clientes = Array.isArray(state.clientes) ? state.clientes : [];

  const osPausadasGargalo = [];
  for (const o of osLista) {
    if (o.etapaPatio === 'pausado_gargalo' || o.st === 'peca') {
      const v = veiculos.find(v => v.id === o.vei) || {};
      const c = clientes.find(c => c.id === o.cli) || {};
      let tempoPausaMinutos = 0;
      if (o.pausadoEm) {
        const diffMs = Math.max(0, agora.getTime() - new Date(o.pausadoEm).getTime());
        tempoPausaMinutos = Math.floor(diffMs / 60000);
      }
      osPausadasGargalo.push({
        id: o.id,
        num: o.num || o.id,
        placa: o.placa || v.placa || '-',
        veiculo: [v.marca, v.modelo].filter(Boolean).join(' ').trim() || o.veiculo || '-',
        cliente: c.nome || o.cliente || 'Geral',
        mecanico: o.mecanico || 'Não informado',
        boxId: o.boxId || o.box || 'Pátio',
        motivoPausa: o.motivoPausa || 'Aguardando peças/instruções',
        pausadoEm: o.pausadoEm || null,
        tempoPausaMinutos
      });
    }
  }

  const osProntasRetidasFinanceiro = [];
  for (const o of osLista) {
    if (o.etapaPatio === 'pronto_retirada' || o.st === 'finalizada') {
      const resFin = obterResumoFinanceiroOS(state, o.id);
      if (resFin && resFin.statusLiberacaoPatio === 'retido_pendente') {
        const v = veiculos.find(v => v.id === o.vei) || {};
        osProntasRetidasFinanceiro.push({
          id: o.id,
          num: o.num || o.id,
          placa: o.placa || v.placa || '-',
          veiculo: [v.marca, v.modelo].filter(Boolean).join(' ').trim() || o.veiculo || '-',
          cliente: resFin.cliente || 'Geral',
          saldoRestante: resFin.saldoRestante || 0,
          totalOrcado: resFin.totalOrcado || 0,
          statusLiberacaoPatio: 'retido_pendente'
        });
      }
    }
  }

  const produtividadeMecanicos = [];
  const equipeMap = new Map();

  if (Array.isArray(state.equipe)) {
    for (const eq of state.equipe) {
      const nome = eq.nome || eq.nomeCompleto;
      if (nome) {
        equipeMap.set(nome.toLowerCase(), {
          mecanico: nome,
          totalOSsAtivas: 0,
          totalOSsConcluidas: 0,
          totalOSsPausadas: 0
        });
      }
    }
  }

  for (const o of osLista) {
    const mecNome = (o.mecanico || '').trim();
    if (!mecNome) continue;
    const key = mecNome.toLowerCase();
    if (!equipeMap.has(key)) {
      equipeMap.set(key, {
        mecanico: mecNome,
        totalOSsAtivas: 0,
        totalOSsConcluidas: 0,
        totalOSsPausadas: 0
      });
    }
    const registro = equipeMap.get(key);
    if (o.st === 'finalizada' || o.etapaPatio === 'pronto_retirada') {
      registro.totalOSsConcluidas++;
    } else if (o.etapaPatio === 'pausado_gargalo' || o.st === 'peca') {
      registro.totalOSsPausadas++;
      registro.totalOSsAtivas++;
    } else {
      registro.totalOSsAtivas++;
    }
  }

  for (const reg of equipeMap.values()) {
    produtividadeMecanicos.push(reg);
  }

  return {
    sucesso: true,
    resumoBoxes: ocupBoxes.resumoBoxes,
    osPausadasGargalo,
    osProntasRetidasFinanceiro,
    produtividadeMecanicos
  };
}

module.exports = {
  registrarApontamentoPatioOS,
  obterRadarGargalosPatio
};
