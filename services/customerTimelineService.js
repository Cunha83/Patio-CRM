'use strict';

const crypto = require('crypto');

function normalizarData(dt) {
  if (!dt) return null;
  if (dt instanceof Date) return dt.toISOString().slice(0, 10);
  const s = String(dt).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  if (/^\d{2}\/\d{2}\/\d{4}/.test(s)) {
    const [d, m, y] = s.slice(0, 10).split('/');
    return `${y}-${m}-${d}`;
  }
  return s.slice(0, 10);
}

function obterTimelineCliente({ tenantId, customerId, state }) {
  if (!tenantId || typeof tenantId !== 'string') {
    throw new Error('tenantId é obrigatório para consultar a timeline do cliente.');
  }
  if (!customerId || typeof customerId !== 'string') {
    return { ok: false, error: 'customerId é obrigatório.' };
  }

  const clientes = Array.isArray(state?.clientes) ? state.clientes : [];
  const cliente = clientes.find(c => c.id === customerId);
  if (!cliente) {
    return { ok: false, error: 'Cliente não encontrado no tenant informado.' };
  }

  const veiculos = Array.isArray(state?.veiculos) ? state.veiculos : [];
  const veiculosDoCliente = veiculos.filter(v => v.cli === customerId);
  const veiculosIds = new Set(veiculosDoCliente.map(v => v.id));

  const timeline = [];

  // 1. Ordens de Serviço (OS)
  const ordens = Array.isArray(state?.os) ? state.os : [];
  for (const o of ordens) {
    if (o.cli === customerId || veiculosIds.has(o.vei)) {
      const veic = veiculos.find(v => v.id === o.vei);
      const placa = veic ? veic.placa : (o.placa || 'N/I');
      const dataAbertura = normalizarData(o.abertura || o.criadoEm || o.dataAbertura) || '1970-01-01';

      timeline.push({
        id: `tl_os_ab_${o.id}`,
        data: dataAbertura,
        tipo: 'os_aberta',
        titulo: `Abertura de OS #${o.num}`,
        descricao: `OS #${o.num} aberta para o veículo ${placa}. Queixa: "${o.queixa || o.obs || 'Serviços de rotina'}"`,
        entidadeOrigem: 'os',
        idOrigem: o.id,
        metadata: {
          osNum: o.num,
          status: o.st,
          veiculoId: o.vei,
          placa,
          total: o.total || 0,
          km: o.km || 0
        }
      });

      if (o.st === 'finalizada' && (o.fechamento || o.concluidaEm)) {
        timeline.push({
          id: `tl_os_fc_${o.id}`,
          data: normalizarData(o.fechamento || o.concluidaEm),
          tipo: 'os_concluida',
          titulo: `Conclusão de OS #${o.num}`,
          descricao: `OS #${o.num} concluída e entregue para o veículo ${placa}. Total: R$ ${Number(o.total || 0).toFixed(2)}`,
          entidadeOrigem: 'os',
          idOrigem: o.id,
          metadata: {
            osNum: o.num,
            status: 'finalizada',
            veiculoId: o.vei,
            placa,
            total: o.total || 0
          }
        });
      }
    }
  }

  // 2. Pré-OS
  const preOSs = Array.isArray(state?.preOS) ? state.preOS : [];
  for (const pos of preOSs) {
    if (pos.clienteId === customerId || veiculosIds.has(pos.vehicleId)) {
      timeline.push({
        id: `tl_preos_${pos.id}`,
        data: normalizarData(pos.criadoEm || pos.createdAt) || '1970-01-01',
        tipo: pos.status === 'convertida' ? 'pre_os_convertida' : 'pre_os_entrada',
        titulo: `Pré-OS (${pos.placa || 'Veículo'})`,
        descricao: `Triagem de entrada: "${pos.reclamacao || 'Entrada'}" — Status: ${pos.status}`,
        entidadeOrigem: 'preOS',
        idOrigem: pos.id,
        metadata: {
          preOSId: pos.id,
          status: pos.status,
          placa: pos.placa,
          possivelGarantia: Boolean(pos.possivelGarantia)
        }
      });
    }
  }

  // 3. Orçamentos (Quotations)
  const orcamentos = Array.isArray(state?.quotations) ? state.quotations : [];
  for (const orc of orcamentos) {
    if (orc.customerId === customerId || veiculosIds.has(orc.vehicleId)) {
      timeline.push({
        id: `tl_orc_${orc.id}`,
        data: normalizarData(orc.createdAt || orc.criadoEm) || '1970-01-01',
        tipo: `orcamento_${orc.status}`,
        titulo: `Orçamento v${orc.versao || 1} (${orc.status})`,
        descricao: `Orçamento de R$ ${Number(orc.totalGeral || orc.totalAprovado || 0).toFixed(2)} — Situação: ${orc.status}`,
        entidadeOrigem: 'quotations',
        idOrigem: orc.id,
        metadata: {
          quotationId: orc.id,
          versao: orc.versao,
          status: orc.status,
          totalGeral: orc.totalGeral
        }
      });
    }
  }

  // 4. Agendamentos
  const agendamentos = Array.isArray(state?.appointments) ? state.appointments : (Array.isArray(state?.agendamentos) ? state.agendamentos : []);
  for (const ag of agendamentos) {
    if (ag.customerId === customerId || veiculosIds.has(ag.vehicleId)) {
      timeline.push({
        id: `tl_agd_${ag.id}`,
        data: normalizarData(ag.scheduledDate || ag.data) || '1970-01-01',
        tipo: `agendamento_${ag.status || 'agendado'}`,
        titulo: `Agendamento de Oficina`,
        descricao: `Agendado para ${ag.scheduledDate} ${ag.scheduledTime || ''}: "${ag.reason || 'Manutenção'}" (${ag.status})`,
        entidadeOrigem: 'appointments',
        idOrigem: ag.id,
        metadata: {
          appointmentId: ag.id,
          status: ag.status,
          scheduledDate: ag.scheduledDate,
          scheduledTime: ag.scheduledTime,
          vehicleId: ag.vehicleId
        }
      });
    }
  }

  // 5. Pós-Venda
  const posVendas = Array.isArray(state?.afterSales) ? state.afterSales : (Array.isArray(state?.posVenda) ? state.posVenda : []);
  for (const pv of posVendas) {
    if (pv.customerId === customerId || veiculosIds.has(pv.vehicleId)) {
      const contatos = Array.isArray(pv.contatos) ? pv.contatos : [];
      for (const c of contatos) {
        timeline.push({
          id: `tl_pv_${pv.id}_${c.data || Math.random()}`,
          data: normalizarData(c.data || pv.createdAt) || '1970-01-01',
          tipo: 'pos_venda_contato',
          titulo: `Acompanhamento de Pós-Venda`,
          descricao: `Follow-up realizado (${c.tipo}): "${c.resposta || c.status || 'Sem resposta'}"`,
          entidadeOrigem: 'afterSales',
          idOrigem: pv.id,
          metadata: {
            afterSalesId: pv.id,
            tipo: c.tipo,
            status: c.status,
            resposta: c.resposta,
            teveReclamacao: Boolean(pv.followUpIssue)
          }
        });
      }
    }
  }

  // 6. Oportunidades de Relacionamento
  const oportunidades = Array.isArray(state?.opportunities) ? state.opportunities : (Array.isArray(state?.oportunidades) ? state.oportunidades : []);
  for (const op of oportunidades) {
    if (op.customerId === customerId || veiculosIds.has(op.vehicleId)) {
      timeline.push({
        id: `tl_op_${op.id}`,
        data: normalizarData(op.createdAt || op.updatedAt) || '1970-01-01',
        tipo: `oportunidade_${op.tipo}`,
        titulo: `Oportunidade: ${op.tipo.replace(/_/g, ' ')}`,
        descricao: op.motivo || `Oportunidade gerada com status ${op.status}`,
        entidadeOrigem: 'opportunities',
        idOrigem: op.id,
        metadata: {
          opportunityId: op.id,
          tipo: op.tipo,
          status: op.status,
          vehicleId: op.vehicleId
        }
      });
    }
  }

  timeline.sort((a, b) => {
    const dataA = a.data || '1970-01-01';
    const dataB = b.data || '1970-01-01';
    if (dataA !== dataB) return dataB.localeCompare(dataA);
    return String(b.id).localeCompare(String(a.id));
  });

  // Cálculo de métricas financeiras históricas do cliente
  let receitaHistorica = 0;
  let totalOrdensFinalizadas = 0;
  for (const o of ordens) {
    if (o.cli === customerId || veiculosIds.has(o.vei)) {
      if (o.st === 'finalizada') {
        totalOrdensFinalizadas++;
        receitaHistorica += Number(o.total || o.valorTotal || 0);
      }
    }
  }
  const ticketMedio = totalOrdensFinalizadas > 0 ? (receitaHistorica / totalOrdensFinalizadas) : 0;

  return {
    ok: true,
    customer: {
      id: cliente.id,
      nome: cliente.nome,
      nomeFantasia: cliente.nomeFantasia || cliente.fantasia || null,
      documento: cliente.documento || cliente.doc || null,
      tipo: cliente.tipo || 'frotista',
      fone: cliente.fone || null,
      email: cliente.email || null,
      contatos: Array.isArray(cliente.contatos) ? cliente.contatos : [],
      preferenciasContato: cliente.preferenciasContato || {},
      veiculosTotal: veiculosDoCliente.length,
      ativo: cliente.ativo !== undefined ? cliente.ativo : !cliente.bloqueado
    },
    metrics: {
      receitaHistoricaCliente: Number(receitaHistorica.toFixed(2)),
      valorHistoricoCliente: Number(receitaHistorica.toFixed(2)),
      ltv: Number(receitaHistorica.toFixed(2)),
      totalOrdensFinalizadas,
      ticketMedio: Number(ticketMedio.toFixed(2)),
      notaMetrica: 'Valor histórico realizado em OSs finalizadas. Não representa projeção preditiva futura.'
    },
    totalEventos: timeline.length,
    timeline
  };
}

module.exports = {
  obterTimelineCliente,
  normalizarData
};
