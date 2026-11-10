'use strict';

/**
 * Pátio CRM — Governança Orçamentária de Centros de Custo B2B
 * Submódulo de regras orçamentárias, limites mensais e apuração de consumo.
 */

const crypto = require('crypto');

function gerarId(prefix) {
  return prefix + '_' + Date.now() + '_' + crypto.randomBytes(3).toString('hex');
}

function garantirColecoes(state) {
  state.clientes = Array.isArray(state.clientes) ? state.clientes : [];
  state.veiculos = Array.isArray(state.veiculos) ? state.veiculos : [];
  state.os = Array.isArray(state.os) ? state.os : [];
  state.costCenters = Array.isArray(state.costCenters) ? state.costCenters : [];
  state.auditoria = Array.isArray(state.auditoria) ? state.auditoria : [];
}

function definirOrcamentoCentroCusto({
  tenantId,
  state,
  centroCustoId,
  limiteMensal,
  alertaPercentual = 80,
  bloquearEstouro = false,
  actorId = 'sistema'
}) {
  if (!state || !centroCustoId) {
    throw new Error('state e centroCustoId são obrigatórios.');
  }
  garantirColecoes(state);

  const ccGlobal = state.costCenters.find(c => c.id === centroCustoId && (!tenantId || !c.tenantId || c.tenantId === tenantId));
  let ccCliente = null;

  for (const cli of state.clientes) {
    if (Array.isArray(cli.centrosCusto)) {
      const found = cli.centrosCusto.find(c => c.id === centroCustoId);
      if (found) {
        ccCliente = found;
        break;
      }
    }
  }

  const cc = ccGlobal || ccCliente;
  if (!cc) {
    throw new Error(`Centro de Custo "${centroCustoId}" não encontrado.`);
  }

  const limite = Math.max(0, Number(limiteMensal) || 0);
  const alerta = Math.min(100, Math.max(1, Number(alertaPercentual) || 80));
  const bloquear = Boolean(bloquearEstouro);

  cc.limiteMensal = limite;
  cc.orcamentoMensal = limite;
  cc.alertaPercentual = alerta;
  cc.bloquearEstouro = bloquear;
  cc.atualizadoEm = new Date().toISOString();

  if (ccGlobal && ccCliente && ccGlobal !== ccCliente) {
    ccCliente.limiteMensal = limite;
    ccCliente.orcamentoMensal = limite;
    ccCliente.alertaPercentual = alerta;
    ccCliente.bloquearEstouro = bloquear;
    ccCliente.atualizadoEm = cc.atualizadoEm;
  }

  state.auditoria.push({
    id: gerarId('aud'),
    tenantId: tenantId || cc.tenantId || 'default',
    timestamp: new Date().toISOString(),
    actorId,
    acao: 'definir_orcamento_centro_custo',
    detalhes: {
      centroCustoId: cc.id,
      limiteMensal: limite,
      alertaPercentual: alerta,
      bloquearEstouro: bloquear
    }
  });

  return { ok: true, centroCusto: cc };
}

function calcularConsumoOrcamentoCentroCusto({
  state,
  tenantId = null,
  centroCustoId,
  competencia = null
}) {
  if (!state || !centroCustoId) {
    return { ok: false, error: 'state e centroCustoId são obrigatórios.' };
  }
  garantirColecoes(state);

  const comp = (competencia || new Date().toISOString()).slice(0, 7);

  let cc = state.costCenters.find(c => c.id === centroCustoId && (!tenantId || !c.tenantId || c.tenantId === tenantId));
  if (!cc) {
    for (const cli of state.clientes) {
      if (Array.isArray(cli.centrosCusto)) {
        const found = cli.centrosCusto.find(c => c.id === centroCustoId);
        if (found) { cc = found; break; }
      }
    }
  }

  if (!cc) {
    return { ok: false, error: `Centro de Custo "${centroCustoId}" não encontrado.` };
  }

  const limiteMensal = Number(cc.limiteMensal || cc.orcamentoMensal || 0);
  const alertaPercentual = Number(cc.alertaPercentual || 80);
  const bloquearEstouro = Boolean(cc.bloquearEstouro);

  let valorFaturado = 0;
  let valorComprometido = 0;
  const statusFaturado = ['finalizada', 'entregue', 'concluida', 'pronto'];

  for (const os of state.os) {
    if (tenantId && os.tenantId && os.tenantId !== tenantId) continue;
    if (os.centroCustoId !== centroCustoId) continue;

    const dataOS = String(os.fechamento || os.abertura || os.data || '').slice(0, 7);
    if (dataOS && dataOS !== comp) continue;

    const st = String(os.st || '').toLowerCase();
    if (st === 'cancelada') continue;

    const totalOS = Number(os.total != null ? os.total : (os.valorTotal || 0));

    if (statusFaturado.includes(st) || os.pago) {
      valorFaturado += totalOS;
    } else {
      valorComprometido += totalOS;
    }
  }

  valorFaturado = Math.round(valorFaturado * 100) / 100;
  valorComprometido = Math.round(valorComprometido * 100) / 100;
  const consumoTotal = Math.round((valorFaturado + valorComprometido) * 100) / 100;
  const saldoDisponivel = Math.max(0, Math.round((limiteMensal - consumoTotal) * 100) / 100);
  const percentualUtilizado = limiteMensal > 0 ? Math.round((consumoTotal / limiteMensal) * 10000) / 100 : 0;

  let statusOrcamento = 'normal';
  if (limiteMensal === 0) {
    statusOrcamento = 'sem_limite';
  } else if (consumoTotal > limiteMensal) {
    statusOrcamento = 'estourado';
  } else if (percentualUtilizado >= alertaPercentual) {
    statusOrcamento = 'alerta';
  }

  return {
    ok: true,
    centroCustoId: cc.id,
    nome: cc.nome,
    codigo: cc.codigo,
    competencia: comp,
    limiteMensal,
    alertaPercentual,
    bloquearEstouro,
    valorFaturado,
    valorComprometido,
    consumoTotal,
    saldoDisponivel,
    percentualUtilizado,
    statusOrcamento
  };
}

module.exports = {
  definirOrcamentoCentroCusto,
  calcularConsumoOrcamentoCentroCusto
};

