'use strict';

/**
 * Pátio CRM — Motor de Conversão de Demanda Reprimida em Nova OS (Facade & Conversor)
 * Arquitetura Modular (< 250 linhas).
 */

const crypto = require('crypto');
const inventoryReservationService = require('../inventory/inventoryReservationService');
const followUpQueue = require('./opportunityFollowUpQueue');

function gerarId(prefix) {
  return prefix + '_' + Date.now() + '_' + crypto.randomBytes(3).toString('hex');
}

function garantirColecoes(state) {
  state.opportunities = Array.isArray(state.opportunities) ? state.opportunities : [];
  state.os = Array.isArray(state.os) ? state.os : [];
  state.pecas = Array.isArray(state.pecas) ? state.pecas : [];
  state.servicos = Array.isArray(state.servicos) ? state.servicos : [];
  state.partReservations = Array.isArray(state.partReservations) ? state.partReservations : [];
  state.inventoryMovements = Array.isArray(state.inventoryMovements) ? state.inventoryMovements : [];
  state.costCenters = Array.isArray(state.costCenters) ? state.costCenters : [];
  state.auditoria = Array.isArray(state.auditoria) ? state.auditoria : [];
}

function converterOportunidadeEmOS({
  tenantId,
  state,
  oportunidadeId,
  opcoes = {},
  actorId = 'sistema'
}) {
  if (!tenantId || !state || !oportunidadeId) {
    throw new Error('tenantId, state e oportunidadeId são obrigatórios.');
  }
  garantirColecoes(state);

  const opp = state.opportunities.find(o => o.id === oportunidadeId && (!o.tenantId || o.tenantId === tenantId));
  if (!opp) {
    throw new Error(`Oportunidade "${oportunidadeId}" não encontrada.`);
  }

  if (opp.status === 'convertida') {
    const err = new Error(`OPPORTUNITY_ALREADY_CONVERTED: A oportunidade "${oportunidadeId}" já foi convertida na OS #${opp.osGeradaNum || opp.osGeradaId}.`);
    err.code = 'OPPORTUNITY_ALREADY_CONVERTED';
    throw err;
  }

  const itensOriginais = Array.isArray(opp.itensAdiados) ? opp.itensAdiados : [];
  if (itensOriginais.length === 0) {
    throw new Error('A oportunidade não possui itens pendentes para conversão.');
  }

  let itensParaConverter = itensOriginais;
  let isParcial = false;
  if (Array.isArray(opcoes.itensSelecionadosIds) && opcoes.itensSelecionadosIds.length > 0) {
    const idsSet = new Set(opcoes.itensSelecionadosIds.map(String));
    itensParaConverter = itensOriginais.filter(it => idsSet.has(String(it.id)));
    if (itensParaConverter.length === 0) {
      throw new Error('Nenhum dos itens selecionados foi encontrado na oportunidade.');
    }
    isParcial = itensParaConverter.length < itensOriginais.length;
  }

  // 1. Validação atômica antecipada de estoque de peças
  const pecasItens = itensParaConverter.filter(it => it.tipo === 'peca');
  for (const it of pecasItens) {
    const partId = it.partId || it.pecaId || it.id;
    const qtdNecessaria = Number(it.qtd || 1);
    const saldos = inventoryReservationService.obterSaldosDetalhados({ tenantId, state, partId });
    if (saldos.saldoDisponivel < qtdNecessaria) {
      const err = new Error(
        `INSUFFICIENT_STOCK: Saldo disponível insuficiente para a peça "${it.nome || partId}". ` +
        `Disponível: ${saldos.saldoDisponivel}, Solicitado: ${qtdNecessaria}`
      );
      err.code = 'INSUFFICIENT_STOCK';
      throw err;
    }
  }

  // 2. Validação de Orçamento de Centro de Custo (se configurado)
  const centroCustoId = opcoes.centroCustoId || opp.centroCustoId || null;
  let alertaOrcamentoCentroCusto = null;

  if (centroCustoId) {
    const fleetCostCenterService = require('./fleetCostCenterService');
    if (typeof fleetCostCenterService.calcularConsumoOrcamentoCentroCusto === 'function') {
      const valorEstimadoNovaOS = itensParaConverter.reduce((acc, it) => acc + Number(it.valor || 0), 0);
      const consumoAtual = fleetCostCenterService.calcularConsumoOrcamentoCentroCusto({ state, centroCustoId });

      if (consumoAtual && consumoAtual.limiteMensal > 0) {
        const novoTotal = consumoAtual.consumoTotal + valorEstimadoNovaOS;
        if (novoTotal > consumoAtual.limiteMensal) {
          if (consumoAtual.bloquearEstouro && !opcoes.autorizarEstouroAlcada) {
            const err = new Error(
              `COST_CENTER_BUDGET_EXCEEDED: Limite mensal de R$ ${consumoAtual.limiteMensal.toFixed(2)} do Centro de Custo seria excedido (Total previsto: R$ ${novoTotal.toFixed(2)}). Requer autorização de alçada.`
            );
            err.code = 'COST_CENTER_BUDGET_EXCEEDED';
            throw err;
          }
          alertaOrcamentoCentroCusto = {
            status: 'estourado',
            mensagem: `Atenção: OS excede o orçamento mensal do Centro de Custo (Consumo: R$ ${novoTotal.toFixed(2)} / Limite: R$ ${consumoAtual.limiteMensal.toFixed(2)})`
          };
        } else if (novoTotal >= (consumoAtual.limiteMensal * (consumoAtual.alertaPercentual / 100))) {
          alertaOrcamentoCentroCusto = {
            status: 'alerta',
            mensagem: `Aviso: OS atinge ${Math.round((novoTotal / consumoAtual.limiteMensal) * 100)}% do orçamento mensal do Centro de Custo`
          };
        }
      }
    }
  }

  // 3. Monta e calcula a nova OS
  const maxNum = state.os.reduce((max, o) => Math.max(max, Number(o.num || o.numero) || 0), 2000);
  const novoNum = maxNum + 1;
  const osId = gerarId('os');

  const servicos = [];
  const pecas = [];
  let totalServicos = 0;
  let totalPecas = 0;

  for (const it of itensParaConverter) {
    if (it.tipo === 'servico') {
      const val = Number(it.valor || 0);
      totalServicos += val;
      servicos.push({
        id: gerarId('srv'),
        servicoId: it.servicoId || it.id,
        desc: it.nome || 'Serviço',
        valor: val,
        status: 'aprovado',
        statusItem: 'aprovado'
      });
    } else {
      const partId = it.partId || it.pecaId || it.id;
      const qtd = Number(it.qtd || 1);
      const valTotal = Number(it.valor || 0);
      const valUnit = qtd > 0 ? (valTotal / qtd) : valTotal;
      totalPecas += valTotal;
      pecas.push({
        id: gerarId('peca'),
        partId,
        pecaId: partId,
        nome: it.nome || 'Peça',
        qtd,
        valor: Math.round(valUnit * 100) / 100,
        preco: Math.round(valUnit * 100) / 100,
        total: Math.round(valTotal * 100) / 100,
        status: 'reservada',
        statusItem: 'aprovado',
        qtdReservada: qtd
      });
    }
  }

  const totalGeral = Math.round((totalServicos + totalPecas) * 100) / 100;

  const novaOS = {
    id: osId,
    num: novoNum,
    tenantId,
    cli: opcoes.clienteId || opp.clienteId || null,
    clienteId: opcoes.clienteId || opp.clienteId || null,
    vei: opcoes.veiculoId || opp.veiculoId || null,
    veiculoId: opcoes.veiculoId || opp.veiculoId || null,
    placa: opcoes.placa || opp.placa || 'SEM_PLACA',
    modelo: opcoes.modelo || opp.modelo || '',
    st: 'orcamento',
    centroCustoId,
    origemOportunidadeId: opp.id,
    abertura: new Date().toISOString(),
    servicos,
    pecas,
    totalServicos: Math.round(totalServicos * 100) / 100,
    totalPecas: Math.round(totalPecas * 100) / 100,
    total: totalGeral,
    valorTotal: totalGeral,
    desc: 0,
    obs: `OS gerada a partir da oportunidade de CRM #${opp.origemOSNum || opp.id}.`
  };

  state.os.unshift(novaOS);

  // Reserva atômica de peças
  if (pecas.length > 0) {
    inventoryReservationService.reservarPecasOS({
      tenantId,
      state,
      osId: novaOS.id,
      itens: pecas.map(p => ({
        partId: p.partId,
        quantity: p.qtd
      })),
      actorId
    });
  }

  // 4. Atualiza oportunidade (total ou parcial)
  if (!isParcial) {
    opp.status = 'convertida';
    opp.osGeradaId = novaOS.id;
    opp.osGeradaNum = novaOS.num;
    opp.dataConversao = new Date().toISOString();
  } else {
    const idsConvertidos = new Set(itensParaConverter.map(it => String(it.id)));
    const itensRestantes = itensOriginais.filter(it => !idsConvertidos.has(String(it.id)));
    opp.itensAdiados = itensRestantes;
    opp.valorTotalEstimado = Math.round(itensRestantes.reduce((acc, it) => acc + Number(it.valor || 0), 0) * 100) / 100;
    opp.conversoesParciais = Array.isArray(opp.conversoesParciais) ? opp.conversoesParciais : [];
    opp.conversoesParciais.push({
      osGeradaId: novaOS.id,
      osGeradaNum: novaOS.num,
      dataConversao: new Date().toISOString(),
      itensConvertidos: itensParaConverter
    });
  }

  opp.atualizadoEm = new Date().toISOString();

  state.auditoria.push({
    id: gerarId('aud'),
    tenantId,
    timestamp: new Date().toISOString(),
    actorId,
    acao: 'converter_oportunidade_os',
    detalhes: {
      oportunidadeId: opp.id,
      osGeradaId: novaOS.id,
      osGeradaNum: novaOS.num,
      isParcial,
      valorTotal: novaOS.total
    }
  });

  return {
    ok: true,
    novaOS,
    oportunidade: opp,
    itensConvertidos: itensParaConverter,
    alertaOrcamentoCentroCusto
  };
}

module.exports = {
  calcularStatusFollowUp: followUpQueue.calcularStatusFollowUp,
  listarFilaFollowUpDemandaReprimida: followUpQueue.listarFilaFollowUpDemandaReprimida,
  registrarFollowUpOportunidade: followUpQueue.registrarFollowUpOportunidade,
  converterOportunidadeEmOS
};
