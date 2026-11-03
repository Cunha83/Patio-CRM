'use strict';

const maintenancePlanService = require('../maintenancePlanService');
const relationshipService = require('../relationshipService');
const vehicleHistoryService = require('../vehicleHistoryService');
const afterSalesService = require('../afterSalesService');
const appointmentService = require('../appointmentService');
const { normalizarPlaca } = require('./voiceRulesHelpers');

async function handleCRMAction({ intencao, interpretado, input, context = {}, state = {} }) {
  const rawText = (input && typeof input.text === 'string') ? input.text :
                  (input && typeof input.texto === 'string') ? input.texto :
                  (typeof input === 'string' ? input : '');
  const tLower = rawText.trim().toLowerCase();
  const tenantId = context.tenantId || state.tenantId || 'default';

  if (intencao === 'consultar_frota_cliente') {
    const clientes = Array.isArray(state.clientes) ? state.clientes : [];
    const veiculos = Array.isArray(state.veiculos) ? state.veiculos : [];
    const ordens = (state.os || []).filter(o => o.st !== 'finalizada');

    let cliAlvo = null;
    for (const c of clientes) {
      if (c.nome && tLower.includes(c.nome.toLowerCase())) {
        cliAlvo = c;
        break;
      }
    }

    if (!cliAlvo && (state.fleets || state.frotas)) {
      const frotas = state.fleets || state.frotas || [];
      for (const f of frotas) {
        if (f.nome && tLower.includes(f.nome.toLowerCase())) {
          cliAlvo = clientes.find(c => c.id === f.customerId) || { nome: f.nome, id: f.customerId };
          break;
        }
      }
    }

    if (!cliAlvo) {
      cliAlvo = clientes.find(c => c.tipo === 'frotista') || clientes[0];
    }

    if (!cliAlvo) {
      return { ok: true, acao: intencao, resposta: 'Não há frotistas cadastrados no sistema no momento.' };
    }

    const veicsCli = veiculos.filter(v => v.cli === cliAlvo.id);
    const veicsNaOficina = veicsCli.filter(v => ordens.some(o => o.vei === v.id));

    let resp = `A ${cliAlvo.nome} possui ${veicsCli.length} veículo(s) cadastrado(s).`;
    if (veicsNaOficina.length > 0) {
      resp += ` No momento, ${veicsNaOficina.length} está(ão) na oficina: ${veicsNaOficina.map(v => v.placa).join(', ')}.`;
    } else {
      resp += ' Nenhum veículo dessa frota está na oficina no momento.';
    }

    return {
      ok: true,
      acao: intencao,
      cliente: cliAlvo.nome,
      totalVeiculos: veicsCli.length,
      veiculosNaOficina: veicsNaOficina.length,
      resposta: resp
    };
  }

  if (intencao === 'consultar_preventiva_frota') {
    const prev = maintenancePlanService.avaliarVencimentos({ tenantId, state });
    const clientes = Array.isArray(state.clientes) ? state.clientes : [];

    let cliAlvo = null;
    for (const c of clientes) {
      if (c.nome && tLower.includes(c.nome.toLowerCase())) {
        cliAlvo = c;
        break;
      }
    }

    let itens = prev.itens || [];
    if (cliAlvo) {
      const veiculosIds = new Set((state.veiculos || []).filter(v => v.cli === cliAlvo.id).map(v => v.id));
      itens = itens.filter(it => veiculosIds.has(it.vehicleId));
    }

    const vencidos = itens.filter(i => i.status === 'vencido');
    const proximos = itens.filter(i => i.status === 'proximo');
    const aguardandoKm = itens.filter(i => i.status === 'aguardando_km');

    let resp = '';
    if (cliAlvo) {
      resp += `Para a frota de ${cliAlvo.nome}: `;
    }

    if (vencidos.length === 0 && proximos.length === 0 && aguardandoKm.length === 0) {
      resp += 'Todas as manutenções preventivas estão rigorosamente em dia!';
    } else {
      const partes = [];
      if (vencidos.length > 0) {
        partes.push(`${vencidos.length} com manutenção vencida (${vencidos.map(v => v.placa + ' - ' + v.descricao).slice(0, 3).join(', ')})`);
      }
      if (proximos.length > 0) {
        partes.push(`${proximos.length} com revisão próxima (${proximos.map(v => v.placa + ' - ' + v.descricao).slice(0, 3).join(', ')})`);
      }
      if (aguardandoKm.length > 0) {
        partes.push(`${aguardandoKm.length} aguardando atualização de KM (${aguardandoKm.map(v => v.placa).slice(0, 3).join(', ')})`);
      }
      resp += `Temos ${partes.join('; ')}.`;
    }

    return {
      ok: true,
      acao: intencao,
      vencidos: vencidos.length,
      proximos: proximos.length,
      aguardandoKm: aguardandoKm.length,
      resposta: resp
    };
  }

  if (intencao === 'consultar_contatos_crm') {
    relationshipService.avaliarOportunidades({ tenantId, state });
    const opTotal = (state.opportunities || []).filter(o => ['aberta', 'contato_programado'].includes(o.status));

    if (opTotal.length === 0) {
      return {
        ok: true,
        acao: intencao,
        resposta: 'Não há contatos proativos pendentes na fila do CRM hoje.'
      };
    }

    const inativos = opTotal.filter(o => o.tipo === 'cliente_inativo');
    const prevs = opTotal.filter(o => o.tipo === 'manutencao_proxima' || o.tipo === 'manutencao_vencida');

    return {
      ok: true,
      acao: intencao,
      totalOportunidades: opTotal.length,
      resposta: `Há ${opTotal.length} oportunidade(s) de contato hoje: ${prevs.length} para manutenções preventivas e ${inativos.length} cliente(s) inativo(s) aguardando relacionamento.`
    };
  }

  if (intencao === 'consultar_manutencao_veiculo') {
    const placa = interpretado.veiculo || normalizarPlaca(tLower);
    const veiculos = Array.isArray(state.veiculos) ? state.veiculos : [];
    const veic = placa ? veiculos.find(v => v.placa && v.placa.toUpperCase().replace(/[^A-Z0-9]/g, '') === placa) : veiculos[0];

    if (!veic) {
      return { ok: true, acao: intencao, resposta: 'Veículo não localizado para consulta de manutenção.' };
    }

    const prev = maintenancePlanService.avaliarVencimentos({ tenantId, state, vehicleId: veic.id });
    const hist = vehicleHistoryService.obterHistoricoVeiculo({ tenantId, vehicleId: veic.id, state });

    const ultimaOS = hist?.ultimaOS;
    let resp = `Veículo ${veic.placa}: `;
    if (ultimaOS) {
      resp += `Última manutenção realizada em ${ultimaOS.dataFechamento || ultimaOS.dataAbertura} (OS #${ultimaOS.num}). `;
    } else {
      resp += 'Sem histórico anterior de serviços concluídos. ';
    }

    const itensPrev = prev.itens || [];
    if (itensPrev.length > 0) {
      const prox = itensPrev[0];
      resp += `Próxima revisão prevista: "${prox.descricao}" (${prox.status.toUpperCase()})`;
      if (prox.kmRestante != null) resp += ` em aproximadamente ${Math.abs(prox.kmRestante).toLocaleString('pt-BR')} km`;
      if (prox.diasRestantes != null) resp += ` ou em ${Math.abs(prox.diasRestantes)} dia(s)`;
      resp += '.';
    } else {
      resp += 'Nenhum plano de preventiva cadastrado para este veículo.';
    }

    return {
      ok: true,
      acao: intencao,
      placa: veic.placa,
      resposta: resp
    };
  }

  if (intencao === 'consultar_pos_venda') {
    const pv = afterSalesService.avaliarPosVenda({ tenantId, state });
    const pendentes = pv.pendentesHoje || [];

    if (pendentes.length === 0) {
      return { ok: true, acao: intencao, resposta: 'Não há nenhum acompanhamento de pós-venda pendente para envio hoje.' };
    }

    return {
      ok: true,
      acao: intencao,
      totalPendentes: pendentes.length,
      resposta: `Temos ${pendentes.length} pós-venda(s) pendente(s) hoje para acompanhamento pós-entrega.`
    };
  }

  if (intencao === 'agendar_veiculo') {
    const placa = interpretado.veiculo || normalizarPlaca(tLower);
    const veiculos = Array.isArray(state.veiculos) ? state.veiculos : [];
    const veic = placa ? veiculos.find(v => v.placa && v.placa.toUpperCase().replace(/[^A-Z0-9]/g, '') === placa) : null;

    const hoje = new Date();
    const dataAlvo = new Date(hoje);
    if (tLower.includes('amanhã') || tLower.includes('amanha')) {
      dataAlvo.setDate(dataAlvo.getDate() + 1);
    } else if (tLower.includes('terça') || tLower.includes('terca')) {
      const diaSemana = dataAlvo.getDay();
      const diff = (2 + 7 - diaSemana) % 7 || 7;
      dataAlvo.setDate(dataAlvo.getDate() + diff);
    } else {
      dataAlvo.setDate(dataAlvo.getDate() + 2);
    }

    const dataISO = dataAlvo.toISOString().slice(0, 10);
    const hora = (tLower.includes('tarde')) ? '14:00' : '08:30';

    const agd = appointmentService.criarAgendamento({
      tenantId,
      state,
      vehicleId: veic ? veic.id : null,
      scheduledDate: dataISO,
      scheduledTime: hora,
      reason: 'Revisão preventiva agendada por voz',
      createdBy: context.actorId || 'voz'
    });

    const placaExib = veic ? veic.placa : (placa || 'Veículo');
    return {
      ok: true,
      acao: intencao,
      agendamento: agd.agendamento,
      resposta: `Agendamento confirmado para o veículo ${placaExib} na ${dataISO} às ${hora}.`
    };
  }

  return null;
}

module.exports = {
  handleCRMAction
};

