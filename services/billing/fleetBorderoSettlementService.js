'use strict';

/**
 * services/billing/fleetBorderoSettlementService.js
 * 
 * Motor de Conciliação Financeira de Borderôs B2B, Baixa em Cascata
 * nas Ordens de Serviço / Comissões e Sincronização com Contas a Receber.
 * 
 * Arquitetura: <= 350 linhas
 */

function criarErro(code, message) {
  const err = new Error(`${code}: ${message}`);
  err.code = code;
  return err;
}

function garantirColecoes(state) {
  if (!state) throw new Error('Estado é obrigatório');
  if (!Array.isArray(state.borderos)) state.borderos = Array.isArray(state.fleetBorderos) ? state.fleetBorderos : [];
  if (!Array.isArray(state.borderoSettlements)) state.borderoSettlements = [];
  if (!Array.isArray(state.contas)) state.contas = [];
  if (!Array.isArray(state.os)) state.os = Array.isArray(state.serviceOrders) ? state.serviceOrders : [];
  if (!Array.isArray(state.auditoria)) state.auditoria = [];
}

function obterValorTotalOS(os) {
  if (!os) return 0;
  if (os.total != null) return Number(os.total) || 0;
  if (os.valorTotal != null) return Number(os.valorTotal) || 0;
  const srvTotal = Array.isArray(os.servicos) ? os.servicos.reduce((acc, s) => acc + (Number(s.valor || s.preco || 0)), 0) : 0;
  const pecTotal = Array.isArray(os.pecas) ? os.pecas.reduce((acc, p) => acc + (Number(p.total != null ? p.total : ((p.valor || 0) * (p.qtd || 1)))), 0) : 0;
  return Math.round((srvTotal + pecTotal) * 100) / 100;
}

function buscarBordero(state, borderoId) {
  if (!state) return null;
  const emFrotistas = (state.borderosFrotistas || []).find(b => b.id === borderoId || b.num === borderoId);
  if (emFrotistas) return emFrotistas;
  return (state.borderos || []).find(b => b.id === borderoId || b.num === borderoId) || null;
}

function listarTodosBorderos(state) {
  if (!state) return [];
  const todos = [
    ...(Array.isArray(state.borderosFrotistas) ? state.borderosFrotistas : []),
    ...(Array.isArray(state.borderos) ? state.borderos : [])
  ];
  const vistos = new Set();
  const unicos = [];
  for (const b of todos) {
    if (b && b.id && !vistos.has(b.id)) {
      vistos.add(b.id);
      unicos.push(b);
    }
  }
  return unicos;
}

function liquidarBorderoB2B(state, borderoId, payload = {}) {
  garantirColecoes(state);
  const bordero = buscarBordero(state, borderoId);
  if (!bordero) throw criarErro('BORDERO_NOT_FOUND', `Borderô "${borderoId}" não encontrado`);

  if (bordero.status === 'pago' || bordero.status === 'liquidado' || (bordero.saldoDevedor != null && bordero.saldoDevedor <= 0 && bordero.valorPagoAcumulado > 0)) {
    throw criarErro('BORDERO_ALREADY_SETTLED', `Borderô "${bordero.num || bordero.id}" já se encontra totalmente quitado`);
  }

  const valorRecebido = Math.round(Number(payload.valorRecebido || 0) * 100) / 100;
  if (valorRecebido <= 0) throw new Error('Valor recebido deve ser maior que zero');

  const jurosMulta = Math.round(Number(payload.jurosMulta || 0) * 100) / 100;
  const descontoConcedido = Math.round(Number(payload.descontoConcedido || 0) * 100) / 100;
  const valorLiquidoAmortizado = Math.round((valorRecebido - jurosMulta + descontoConcedido) * 100) / 100;

  const valorTotalBordero = Number(bordero.valorTotal || bordero.totais?.totalLiquido || bordero.totais?.subtotalBruto || 0);
  bordero.valorPagoAcumulado = Math.round(((bordero.valorPagoAcumulado || 0) + valorLiquidoAmortizado) * 100) / 100;
  bordero.saldoDevedor = Math.max(0, Math.round((valorTotalBordero - bordero.valorPagoAcumulado) * 100) / 100);

  const dataPagamento = payload.dataPagamento || payload.timestamp || new Date().toISOString();
  const quitado = bordero.saldoDevedor === 0;
  bordero.status = quitado ? 'pago' : 'parcialmente_pago';
  if (quitado) bordero.dataQuitacao = dataPagamento;

  const liquidacao = {
    id: `liq_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    tenantId: payload.tenantId || bordero.tenantId || 'default',
    borderoId: bordero.id,
    borderoNum: bordero.num,
    clienteId: bordero.clienteId,
    clienteNome: bordero.clienteNome,
    valorRecebido,
    jurosMulta,
    descontoConcedido,
    valorLiquidoAmortizado,
    formaPagamento: payload.formaPagamento || 'pix',
    dataPagamento,
    contaBancaria: payload.contaBancaria || 'Conta Principal',
    comprovanteRef: payload.comprovanteRef || null,
    responsavel: payload.responsavel || 'Financeiro B2B',
    saldoDevedorRemanescente: bordero.saldoDevedor,
    statusBorderoApos: bordero.status,
    timestamp: payload.timestamp || new Date().toISOString()
  };

  bordero.pagamentos = Array.isArray(bordero.pagamentos) ? bordero.pagamentos : [];
  bordero.pagamentos.push(liquidacao);
  state.borderoSettlements.push(liquidacao);

  // Baixa em cascata nas OSs filhas
  const osIds = Array.isArray(bordero.osIds) ? bordero.osIds : [];
  const oss = state.os.filter(o => osIds.includes(o.id));

  if (quitado) {
    for (const os of oss) {
      os.statusPagamento = 'pago';
      os.pago = true;
      os.liquidado = true;
      os.valorPago = obterValorTotalOS(os);
      os.dataPagamento = dataPagamento;
      os.borderoLiquidadoId = bordero.id;
    }
  } else {
    // Amortização parcial cronológica
    oss.sort((a, b) => String(a.fechamento || a.data || a.num || '').localeCompare(String(b.fechamento || b.data || b.num || '')));
    let saldoAmortizar = bordero.valorPagoAcumulado;

    for (const os of oss) {
      const vOS = obterValorTotalOS(os);
      if (saldoAmortizar >= vOS) {
        os.statusPagamento = 'pago';
        os.pago = true;
        os.liquidado = true;
        os.valorPago = vOS;
        os.dataPagamento = dataPagamento;
        os.borderoLiquidadoId = bordero.id;
        saldoAmortizar = Math.round((saldoAmortizar - vOS) * 100) / 100;
      } else if (saldoAmortizar > 0) {
        os.statusPagamento = 'parcialmente_pago';
        os.pago = false;
        os.liquidado = false;
        os.valorPagoParcial = saldoAmortizar;
        saldoAmortizar = 0;
      } else {
        os.statusPagamento = 'pendente';
        os.pago = false;
        os.liquidado = false;
      }
    }
  }

  // Sincronização com state.contas (Contas a Receber)
  const contas = state.contas.filter(c => c.borderoId === bordero.id || (Array.isArray(bordero.contasIds) && bordero.contasIds.includes(c.id)));
  for (const c of contas) {
    c.pago = quitado;
    c.status = quitado ? 'pago' : 'parcial';
    c.valorPago = bordero.valorPagoAcumulado;
    c.formaPagamento = payload.formaPagamento || c.forma;
    c.dataPagamento = dataPagamento;
  }

  if (Array.isArray(state.auditoria)) {
    state.auditoria.push({
      id: `aud_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      tipo: 'liquidacao_bordero_b2b',
      borderoId: bordero.id,
      valorRecebido,
      saldoDevedor: bordero.saldoDevedor,
      quitado,
      timestamp: dataPagamento
    });
  }

  return { ok: true, bordero, liquidacao };
}

function estornarLiquidacaoBorderoB2B(state, borderoId, {
  tenantId = 'default',
  motivo = 'Estorno de liquidação de borderô',
  responsavel = 'Financeiro B2B',
  timestamp = null
} = {}) {
  garantirColecoes(state);
  const bordero = buscarBordero(state, borderoId);
  if (!bordero) throw criarErro('BORDERO_NOT_FOUND', `Borderô "${borderoId}" não encontrado`);

  const valorTotalBordero = Number(bordero.valorTotal || bordero.totais?.totalLiquido || bordero.totais?.subtotalBruto || 0);
  bordero.status = 'faturado';
  bordero.valorPagoAcumulado = 0;
  bordero.saldoDevedor = valorTotalBordero;
  bordero.dataQuitacao = null;

  const osIds = Array.isArray(bordero.osIds) ? bordero.osIds : [];
  const oss = state.os.filter(o => osIds.includes(o.id));
  for (const os of oss) {
    os.statusPagamento = 'pendente';
    os.pago = false;
    os.liquidado = false;
    os.valorPago = 0;
    os.valorPagoParcial = 0;
    os.borderoLiquidadoId = null;
  }

  const contas = state.contas.filter(c => c.borderoId === bordero.id || (Array.isArray(bordero.contasIds) && bordero.contasIds.includes(c.id)));
  for (const c of contas) {
    c.pago = false;
    c.status = 'aberto';
    c.valorPago = 0;
    c.dataPagamento = null;
  }

  const dataEstorno = timestamp || new Date().toISOString();
  if (Array.isArray(state.auditoria)) {
    state.auditoria.push({
      id: `aud_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      tipo: 'estorno_liquidacao_bordero_b2b',
      borderoId: bordero.id,
      motivo,
      responsavel,
      timestamp: dataEstorno
    });
  }

  return { ok: true, bordero };
}

function listarExtratoLiquidacoesBordero(state, filtros = {}) {
  if (!state || !Array.isArray(state.borderoSettlements)) {
    return { extrato: [], totalizadores: { totalLiquidado: 0, quantidade: 0 } };
  }
  let lista = [...state.borderoSettlements];

  if (filtros.tenantId) lista = lista.filter(l => !l.tenantId || l.tenantId === filtros.tenantId);
  if (filtros.clienteId) lista = lista.filter(l => l.clienteId === filtros.clienteId);
  if (filtros.borderoId) lista = lista.filter(l => l.borderoId === filtros.borderoId);
  if (filtros.formaPagamento) lista = lista.filter(l => l.formaPagamento === filtros.formaPagamento);
  if (filtros.competencia) {
    lista = lista.filter(l => String(l.dataPagamento || l.timestamp).slice(0, 7) === filtros.competencia);
  }

  const totalLiquidado = lista.reduce((acc, l) => acc + (Number(l.valorRecebido) || 0), 0);
  return {
    extrato: lista,
    totalizadores: {
      totalLiquidado: Math.round(totalLiquidado * 100) / 100,
      quantidade: lista.length
    }
  };
}

module.exports = {
  liquidarBorderoB2B,
  estornarLiquidacaoBorderoB2B,
  listarExtratoLiquidacoesBordero
};
