'use strict';

/**
 * Pátio CRM — Motor de Aprovação Parcial de Orçamentos e CRM de Demanda Reprimida
 * Arquitetura Modular (< 300 linhas).
 */

const crypto = require('crypto');

function gerarId(prefix) {
  return prefix + '_' + Date.now() + '_' + crypto.randomBytes(3).toString('hex');
}

function garantirColecoes(state) {
  state.os = Array.isArray(state.os) ? state.os : [];
  state.pecas = Array.isArray(state.pecas) ? state.pecas : [];
  state.servicos = Array.isArray(state.servicos) ? state.servicos : [];
  state.partReservations = Array.isArray(state.partReservations) ? state.partReservations : [];
  state.inventoryMovements = Array.isArray(state.inventoryMovements) ? state.inventoryMovements : [];
  state.opportunities = Array.isArray(state.opportunities) ? state.opportunities : [];
  state.auditoria = Array.isArray(state.auditoria) ? state.auditoria : [];
}

function recalcularTotaisOS(os) {
  const servicos = Array.isArray(os.servicos) ? os.servicos : [];
  const pecas = Array.isArray(os.pecas) ? os.pecas : [];

  const servicosAprovados = servicos.filter(s =>
    s.statusItem === 'aprovado' || (!s.statusItem && s.status !== 'adiado' && s.status !== 'recusado')
  );
  const pecasAprovadas = pecas.filter(p =>
    p.statusItem === 'aprovado' || (!p.statusItem && p.status !== 'adiado' && p.status !== 'recusado')
  );

  const totalServicos = servicosAprovados.reduce((acc, s) =>
    acc + Number(s.valor || s.preco || s.total || 0), 0
  );
  const totalPecas = pecasAprovadas.reduce((acc, p) =>
    acc + Number(p.total != null ? p.total : ((p.valor || p.preco || 0) * (p.qtd || 1))), 0
  );

  const desc = Math.max(0, Number(os.desc) || 0);
  const subtotal = Math.round((totalServicos + totalPecas) * 100) / 100;
  const total = Math.max(0, Math.round((subtotal - desc) * 100) / 100);

  os.totalServicos = Math.round(totalServicos * 100) / 100;
  os.totalPecas = Math.round(totalPecas * 100) / 100;
  os.total = total;
  os.valorTotal = total;

  return {
    totalServicos: os.totalServicos,
    totalPecas: os.totalPecas,
    total: os.total,
    qtdServicosAprovados: servicosAprovados.length,
    qtdPecasAprovadas: pecasAprovadas.length
  };
}

function determinarCriticidadeMaxima(itens = []) {
  if (itens.some(it => it.criticidade === 'alta')) return 'alta';
  if (itens.some(it => it.criticidade === 'media')) return 'media';
  return 'baixa';
}

function calcularDataFollowUp(prazoDias, criticidade) {
  const dias = Number(prazoDias) || (criticidade === 'alta' ? 15 : (criticidade === 'media' ? 30 : 45));
  const data = new Date();
  data.setDate(data.getDate() + dias);
  return data.toISOString().slice(0, 10);
}

function processarAprovacaoParcial({
  tenantId,
  state,
  osId,
  itens = [],
  actorId = 'sistema',
  observacoes = '',
  prazoFollowUpDias = null
}) {
  if (!tenantId) throw new Error('tenantId é obrigatório.');
  if (!state) throw new Error('Estado é obrigatório.');
  if (!osId) throw new Error('osId é obrigatório.');
  if (!Array.isArray(itens) || itens.length === 0) {
    throw new Error('Lista de itens para aprovação é obrigatória.');
  }

  garantirColecoes(state);

  const os = state.os.find(o => o.id === osId && (!o.tenantId || o.tenantId === tenantId));
  if (!os) {
    throw new Error(`Ordem de serviço "${osId}" não encontrada.`);
  }

  const itensMap = new Map();
  for (const it of itens) {
    if (it && it.id) {
      itensMap.set(String(it.id), it);
    }
  }

  const itensAdiadosERecusados = [];
  let totalItensAprovados = 0;
  let totalItensAdiadosOuRecusados = 0;

  // 1. Processa Serviços
  if (Array.isArray(os.servicos)) {
    for (const s of os.servicos) {
      const param = itensMap.get(String(s.id));
      if (param) {
        s.statusItem = param.statusItem || 'aprovado';
        s.status = s.statusItem;
        s.motivo = param.motivo || '';
        s.criticidade = param.criticidade || 'media';
        if (s.statusItem === 'aprovado') {
          totalItensAprovados++;
        } else {
          totalItensAdiadosOuRecusados++;
          itensAdiadosERecusados.push({
            id: s.id,
            tipo: 'servico',
            nome: s.desc || s.nome || 'Serviço',
            valor: Number(s.valor || s.preco || s.total || 0),
            motivo: s.motivo,
            criticidade: s.criticidade,
            statusItem: s.statusItem,
            prazoDias: param.prazoDias || null
          });
        }
      }
    }
  }

  // 2. Processa Peças e Ajusta Reservas de Estoque
  if (Array.isArray(os.pecas)) {
    for (const p of os.pecas) {
      const param = itensMap.get(String(p.id));
      if (param) {
        p.statusItem = param.statusItem || 'aprovado';
        p.motivo = param.motivo || '';
        p.criticidade = param.criticidade || 'media';

        if (p.statusItem === 'aprovado') {
          p.status = 'aprovado';
          totalItensAprovados++;
        } else {
          // Peça adiada ou recusada: libera reserva atômica de estoque
          totalItensAdiadosOuRecusados++;
          const partId = p.partId || p.pecaId || p.id;
          const reservasDoItem = state.partReservations.filter(r =>
            r.tenantId === tenantId &&
            r.osId === os.id &&
            (r.partId === partId || r.id === p.reservaId) &&
            (r.status === 'ativa' || r.status === 'reservada')
          );

          for (const res of reservasDoItem) {
            res.status = 'cancelada';
            res.atualizadoEm = new Date().toISOString();

            state.inventoryMovements.push({
              id: gerarId('mov'),
              tenantId,
              partId: res.partId,
              type: 'liberacao_reserva',
              quantity: res.quantity,
              osId: os.id,
              reason: `Item ${p.statusItem} na aprovação parcial da OS #${os.num || os.id}`,
              actorId,
              timestamp: new Date().toISOString()
            });
          }

          p.status = p.statusItem;
          p.st = p.statusItem;
          p.qtdReservada = 0;
          p.reservaId = null;

          itensAdiadosERecusados.push({
            id: p.id,
            tipo: 'peca',
            nome: p.nome || p.descricao || 'Peça',
            valor: Number(p.total != null ? p.total : ((p.valor || p.preco || 0) * (p.qtd || 1))),
            motivo: p.motivo,
            criticidade: p.criticidade,
            statusItem: p.statusItem,
            prazoDias: param.prazoDias || null
          });
        }
      }
    }
  }

  // 3. Recalcula totais financeiros da OS
  const totais = recalcularTotaisOS(os);

  let statusAprovacao = 'parcialmente_aprovada';
  if (totalItensAprovados > 0 && totalItensAdiadosOuRecusados === 0) {
    statusAprovacao = 'aprovada';
  } else if (totalItensAprovados === 0 && totalItensAdiadosOuRecusados > 0) {
    statusAprovacao = 'recusada';
  }
  os.statusAprovacao = statusAprovacao;
  os.aprovadoParcialmenteEm = new Date().toISOString();
  os.aprovadoPor = actorId;

  // 4. Criação Automática de Oportunidade no CRM para itens adiados/recusados
  let oportunidade = null;
  if (itensAdiadosERecusados.length > 0) {
    const criticidadeMaxima = determinarCriticidadeMaxima(itensAdiadosERecusados);
    const dataFollowUp = calcularDataFollowUp(prazoFollowUpDias, criticidadeMaxima);
    const valorTotalEstimado = itensAdiadosERecusados.reduce((acc, it) => acc + (it.valor || 0), 0);

    const cliente = (state.clientes || []).find(c => c.id === os.cli || c.id === os.clienteId);
    const veiculo = (state.veiculos || []).find(v => v.id === os.vei || v.id === os.veiculoId);
    const placa = os.placa || veiculo?.placa || 'SEM_PLACA';

    oportunidade = {
      id: gerarId('opp'),
      tenantId,
      tipo: 'demanda_reprimida_orcamento',
      origemOSId: os.id,
      origemOSNum: os.num || os.numero,
      clienteId: os.cli || os.clienteId || null,
      clienteNome: cliente?.nome || cliente?.razaoSocial || 'Cliente',
      veiculoId: os.vei || os.veiculoId || null,
      placa,
      modelo: veiculo?.modelo || os.modelo || '',
      itensAdiados: itensAdiadosERecusados,
      valorTotalEstimado: Math.round(valorTotalEstimado * 100) / 100,
      criticidadeMaxima,
      dataFollowUp,
      observacoes: observacoes || 'Oportunidade gerada por itens não aprovados na OS',
      status: 'aberta',
      criadoEm: new Date().toISOString(),
      actorId
    };

    state.opportunities.unshift(oportunidade);
  }

  // 5. Auditoria Append-Only
  state.auditoria.push({
    id: gerarId('aud'),
    tenantId,
    timestamp: new Date().toISOString(),
    actorId,
    acao: 'aprovacao_parcial_os',
    detalhes: {
      osId: os.id,
      statusAprovacao,
      totalAprovado: totais.total,
      oportunidadeId: oportunidade?.id || null,
      qtdItensAprovados: totalItensAprovados,
      qtdItensAdiados: totalItensAdiadosOuRecusados
    }
  });

  return {
    ok: true,
    statusAprovacao,
    os,
    oportunidade,
    totais
  };
}

function listarOportunidadesAdiadas({
  tenantId,
  state,
  clienteId = null,
  placa = null,
  criticidade = null
}) {
  if (!state || !Array.isArray(state.opportunities)) return [];

  return state.opportunities.filter(op => {
    if (tenantId && op.tenantId && op.tenantId !== tenantId) return false;
    if (op.tipo !== 'demanda_reprimida_orcamento') return false;
    if (clienteId && op.clienteId !== clienteId) return false;
    if (placa && op.placa !== placa) return false;
    if (criticidade && op.criticidadeMaxima !== criticidade) return false;
    return true;
  });
}

module.exports = {
  recalcularTotaisOS,
  processarAprovacaoParcial,
  listarOportunidadesAdiadas,
  determinarCriticidadeMaxima,
  calcularDataFollowUp
};

