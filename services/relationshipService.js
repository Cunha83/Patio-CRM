'use strict';

const crypto = require('crypto');
const maintenancePlanService = require('./maintenancePlanService');

function gerarId(prefix = 'opo') {
  return `${prefix}_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
}

function normalizarData(dt) {
  if (!dt) return null;
  if (dt instanceof Date) return dt.toISOString().slice(0, 10);
  const s = String(dt).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return s.slice(0, 10);
}

function registrarAuditoria(state, entrada) {
  if (!state.auditoria) state.auditoria = [];
  state.auditoria.unshift({
    id: gerarId('aud'),
    timestamp: new Date().toISOString(),
    ...entrada
  });
  if (state.auditoria.length > 500) {
    state.auditoria = state.auditoria.slice(0, 500);
  }
}

/**
 * Avalia a base e gera Oportunidades de Relacionamento determinísticas e deduplicadas.
 */
function avaliarOportunidades({ tenantId, state, dataReferencia = null }) {
  if (!tenantId || !state) return [];
  if (!state.opportunities) state.opportunities = [];

  const hoje = normalizarData(dataReferencia) || new Date().toISOString().slice(0, 10);
  const config = state.cfg?.crm || {};
  const inativoDias = Number(config.clienteInativoDias) || 180;

  const oportunidadesNovas = [];

  // 1. Manutenções Preventivas (Próximas e Vencidas)
  const relatorioPrev = maintenancePlanService.avaliarVencimentos({ tenantId, state, dataReferencia: hoje });
  for (const item of (relatorioPrev.itens || [])) {
    if (item.status === 'proximo' || item.status === 'vencido') {
      const tipoOpo = item.status === 'vencido' ? 'manutencao_vencida' : 'manutencao_proxima';

      // Deduplicação: verifica se já existe oportunidade aberta para o mesmo plano/item
      const existeAtiva = state.opportunities.some(o =>
        o.tenantId === tenantId &&
        o.tipo === tipoOpo &&
        o.metadata?.itemId === item.itemId &&
        ['aberta', 'contato_programado', 'contatado', 'aguardando_resposta'].includes(o.status)
      );

      if (!existeAtiva) {
        const opo = {
          id: gerarId('opo'),
          tenantId,
          customerId: null,
          vehicleId: item.vehicleId,
          fleetId: item.fleetId,
          tipo: tipoOpo,
          status: 'aberta',
          prioridade: item.status === 'vencido' ? 'alta' : 'media',
          motivo: item.status === 'vencido'
            ? `Manutenção de "${item.descricao}" vencida para a placa ${item.placa || 'N/I'}`
            : `Manutenção de "${item.descricao}" próxima para a placa ${item.placa || 'N/I'}`,
          metadata: {
            planoId: item.planoId,
            itemId: item.itemId,
            placa: item.placa,
            nextDueKm: item.nextDueKm,
            nextDueDate: item.nextDueDate
          },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };

        // Identifica cliente do veículo
        if (item.vehicleId) {
          const veic = (state.veiculos || []).find(v => v.id === item.vehicleId);
          if (veic) opo.customerId = veic.cli || null;
        }

        state.opportunities.push(opo);
        oportunidadesNovas.push(opo);

        registrarAuditoria(state, {
          action: 'opportunity_created',
          actorId: 'scheduler',
          resourceId: opo.id,
          tenantId,
          details: { tipo: opo.tipo, placa: item.placa, motivo: opo.motivo }
        });
      }
    }
  }

  // 2. Clientes Inativos
  const clientes = Array.isArray(state.clientes) ? state.clientes : [];
  const ordens = Array.isArray(state.os) ? state.os : [];

  for (const cli of clientes) {
    if (cli.bloqueado) continue;
    // Respeita consentimento de relacionamento comercial
    if (cli.preferenciasContato && cli.preferenciasContato.commercial === false) continue;
    if (cli.consentimentos && cli.consentimentos.optOut === true) continue;

    const osDoCliente = ordens.filter(o => o.cli === cli.id);
    let ultimaDataOS = '1970-01-01';
    for (const o of osDoCliente) {
      const dt = normalizarData(o.fechamento || o.concluidaEm || o.abertura);
      if (dt && dt > ultimaDataOS) ultimaDataOS = dt;
    }

    const diffDias = Math.round((new Date(hoje).getTime() - new Date(ultimaDataOS).getTime()) / (1000 * 60 * 60 * 24));
    if (diffDias >= inativoDias) {
      const existeAtiva = state.opportunities.some(o =>
        o.tenantId === tenantId &&
        o.tipo === 'cliente_inativo' &&
        o.customerId === cli.id &&
        ['aberta', 'contato_programado', 'contatado', 'aguardando_resposta'].includes(o.status)
      );

      if (!existeAtiva) {
        const opo = {
          id: gerarId('opo'),
          tenantId,
          customerId: cli.id,
          vehicleId: null,
          fleetId: null,
          tipo: 'cliente_inativo',
          status: 'aberta',
          prioridade: 'baixa',
          motivo: `Cliente ${cli.nome} sem movimentação há ${diffDias} dias (limite: ${inativoDias}d).`,
          metadata: {
            diasInativo: diffDias,
            ultimaOSData: ultimaDataOS
          },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        state.opportunities.push(opo);
        oportunidadesNovas.push(opo);

        registrarAuditoria(state, {
          action: 'opportunity_created',
          actorId: 'scheduler',
          resourceId: opo.id,
          tenantId,
          details: { tipo: opo.tipo, customerId: cli.id, diasInativo: diffDias }
        });
      }
    }
  }

  return oportunidadesNovas;
}

/**
 * Política Anti-Spam e Validador de Notificação de Relacionamento.
 */
function validarEnvioNotificacao({ cliente, tipoMensagem = 'comercial', canal = 'whatsapp' }) {
  if (!cliente) return { permitido: false, motivo: 'Cliente inexistente.' };

  // 1. Opt-out Geral
  if (cliente.consentimentos && cliente.consentimentos.optOut === true) {
    if (tipoMensagem !== 'transacional_obrigatoria') {
      return { permitido: false, motivo: 'Cliente realizou opt-out de comunicações proativas.' };
    }
  }

  // 2. Preferências por Categoria
  const prefs = cliente.preferenciasContato || {};
  if (canal === 'whatsapp' && prefs.whatsapp === false) {
    return { permitido: false, motivo: 'Cliente desativou contato via WhatsApp.' };
  }
  if (tipoMensagem === 'preventiva' && prefs.preventiveMaintenance === false) {
    return { permitido: false, motivo: 'Cliente desativou lembretes de manutenção preventiva.' };
  }
  if (tipoMensagem === 'pos_venda' && prefs.afterSales === false) {
    return { permitido: false, motivo: 'Cliente desativou mensagens de pós-venda.' };
  }
  if (tipoMensagem === 'comercial' && prefs.commercial === false) {
    return { permitido: false, motivo: 'Cliente desativou mensagens comerciais.' };
  }

  // 3. Cooldown de envio
  if (cliente.ultimoContatoRelacionamento) {
    const horasDesdeUltimo = (Date.now() - new Date(cliente.ultimoContatoRelacionamento).getTime()) / (1000 * 60 * 60);
    if (horasDesdeUltimo < 24 && tipoMensagem !== 'transacional_obrigatoria') {
      return { permitido: false, motivo: 'Cooldown ativo: contato de relacionamento realizado há menos de 24h.' };
    }
  }

  return { permitido: true };
}

/**
 * Registra opt-out a pedido do cliente.
 */
function registrarOptOut({ tenantId, state, customerId, motivo = 'solicitacao_cliente', ator = 'cliente' }) {
  const cliente = (state.clientes || []).find(c => c.id === customerId);
  if (!cliente) return { ok: false, error: 'Cliente não encontrado.' };

  if (!cliente.consentimentos) cliente.consentimentos = {};
  cliente.consentimentos.optOut = true;
  cliente.consentimentos.optOutEm = new Date().toISOString();
  cliente.consentimentos.motivoOptOut = motivo;

  if (!cliente.preferenciasContato) cliente.preferenciasContato = {};
  cliente.preferenciasContato.commercial = false;
  cliente.preferenciasContato.preventiveMaintenance = false;

  // Cancela oportunidades ativas deste cliente
  const canceladas = [];
  for (const op of (state.opportunities || [])) {
    if (op.customerId === customerId && ['aberta', 'contato_programado'].includes(op.status)) {
      op.status = 'cancelada';
      op.motivoCancelamento = 'Opt-out do cliente';
      canceladas.push(op.id);
    }
  }

  registrarAuditoria(state, {
    action: 'customer_opt_out',
    actorId: ator,
    resourceId: customerId,
    tenantId,
    details: { motivo, oportunidadesCanceladas: canceladas.length }
  });

  return { ok: true, customerId, optOut: true, canceladas };
}

/**
 * Métricas consolidadas de CRM para a oficina.
 */
function obterMetricasCRM({ tenantId, state }) {
  const clientes = (state.clientes || []).filter(c => !c.tenantId || c.tenantId === tenantId);
  const veiculos = (state.veiculos || []).filter(v => !v.tenantId || v.tenantId === tenantId);
  const frotas = (state.fleets || state.frotas || []).filter(f => !f.tenantId || f.tenantId === tenantId);
  const ordens = (state.os || []).filter(o => !o.tenantId || o.tenantId === tenantId);
  const agendamentos = (state.appointments || state.agendamentos || []).filter(a => a.tenantId === tenantId);

  const agora = Date.now();
  const limiteInativoMs = 180 * 24 * 60 * 60 * 1000;

  let ativos = 0;
  let inativos = 0;

  for (const c of clientes) {
    const osCli = ordens.filter(o => o.cli === c.id);
    if (osCli.length === 0) {
      inativos++;
      continue;
    }
    const maisRecente = Math.max(...osCli.map(o => new Date(o.fechamento || o.abertura || 0).getTime()));
    if (agora - maisRecente <= limiteInativoMs) {
      ativos++;
    } else {
      inativos++;
    }
  }

  const prev = maintenancePlanService.avaliarVencimentos({ tenantId, state });

  const agdTotal = agendamentos.length;
  const agdCompareceu = agendamentos.filter(a => a.status === 'chegou' || a.status === 'convertido_pre_os').length;
  const taxaComparecimento = agdTotal > 0 ? Math.round((agdCompareceu / agdTotal) * 100) : 100;

  return {
    clientesTotal: clientes.length,
    clientesAtivos: ativos,
    clientesInativos: inativos,
    frotistasTotal: frotas.length,
    veiculosTotal: veiculos.length,
    manutencoesProximas: prev.proximos,
    manutencoesVencidas: prev.vencidos,
    agendamentosTotal: agdTotal,
    agendamentosCompareceu: agdCompareceu,
    taxaComparecimentoPercentual: taxaComparecimento
  };
}

module.exports = {
  avaliarOportunidades,
  validarEnvioNotificacao,
  registrarOptOut,
  obterMetricasCRM
};
