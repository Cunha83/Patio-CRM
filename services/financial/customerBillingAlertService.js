'use strict';

const financialEngine = require('../financialEngine');
const { obterResumoFinanceiroOS } = require('./billingAndSettlementService');

function gerarTextoCobrancaOS(state = {}, osId, options = {}) {
  const osNorm = String(osId || '').replace(/^#/, '').trim();
  const resumoOS = obterResumoFinanceiroOS(state, osNorm, options);
  return financialEngine.gerarTextoCobrancaOS(state, osNorm, {
    totalOrcado: resumoOS.totalOrcado,
    saldoRestante: resumoOS.saldoRestante,
    clienteNome: resumoOS.cliente,
    resumoOS,
    ...options
  });
}

function gerarAvisoClienteOS(state = {}, osId) {
  const osNorm = String(osId || '').replace(/^#/, '').trim();
  const osLista = Array.isArray(state.os) ? state.os : [];
  const o = osLista.find(item => {
    const id = String(item.id || '').replace(/^#/, '').trim();
    const num = String(item.num || item.numero || '').replace(/^#/, '').trim();
    return id === osNorm || num === osNorm;
  });

  if (!o) {
    return {
      sucesso: false,
      ok: false,
      error: 'OS_NAO_ENCONTRADA',
      mensagem: `Não foi possível localizar a OS #${osNorm}.`
    };
  }

  const resFin = obterResumoFinanceiroOS(state, osNorm);

  const veiculos = Array.isArray(state.veiculos) ? state.veiculos : [];
  const clientes = Array.isArray(state.clientes) ? state.clientes : [];
  const v = veiculos.find(v => v.id === o.vei) || o.veiculo || {};
  const c = clientes.find(c => c.id === o.cli) || o.cliente || {};

  const placa = o.placa || v.placa || 'SEM-PLACA';
  const cliente = resFin.cliente || c.fantasia || c.nome || 'Cliente';
  const veiculoInfo = [v.marca, v.modelo].filter(Boolean).join(' ') || o.veiculo || 'Veículo';
  const totalOrcado = resFin.totalOrcado || Number(o.total || 0);
  const totalPago = resFin.totalPago || 0;
  const saldoRestante = resFin.saldoRestante || 0;
  const statusLiberacaoPatio = resFin.statusLiberacaoPatio || 'retido_pendente';
  const totalPecas = o.totalPecas || (Array.isArray(o.pecasUtilizadas) ? o.pecasUtilizadas.reduce((a, b) => a + (b.subtotal || 0), 0) : 0);

  const cfg = state.cfg || {};
  const nomeOficina = cfg.nomeOficina || cfg.empresa || cfg.nomeFantasia || 'Oficina Especializada';
  const chavePix = cfg.chavePix || cfg.pix || (cfg.financeiro && cfg.financeiro.chavePix) || 'financeiro@oficina.com.br';

  let statusMsg = '';
  if (statusLiberacaoPatio === 'liberado_garantia' || o.isRetornoGarantia) {
    statusMsg = '🛡️ *Status de Liberação:* Retorno em Garantia de Serviço — Veículo liberado sem cobrança!';
  } else if (saldoRestante <= 0.01 || statusLiberacaoPatio === 'liberado_quitado') {
    statusMsg = '✅ *Status de Liberação:* 100% Quitado — Veículo liberado para retirada imediata!';
  } else if (statusLiberacaoPatio === 'liberado_faturado') {
    statusMsg = '🔵 *Status de Liberação:* Faturamento a Prazo Formalizado — Veículo liberado para retirada!';
  } else if (statusLiberacaoPatio === 'liberado_excepcional') {
    statusMsg = '🟣 *Status de Liberação:* Liberação Autorizada por Exceção pela Diretoria.';
  } else {
    statusMsg = `🟡 *Status de Liberação:* Pendente de Quitação na Portaria.\n• *Chave Pix para Pagamento:* *${chavePix}*`;
  }

  const textoWhatsapp = `🚗 *COMUNICADO DE ORDEM DE SERVIÇO* 📋\n\n` +
    `Olá, *${cliente}*! Aqui é da *${nomeOficina}*.\n` +
    `Segue o status atualizado da sua OS *#${o.num || o.id || osNorm}* (*${veiculoInfo}* - Placa: *${placa}*):\n\n` +
    `• *Total Geral:* ${financialEngine.formatarMoeda(totalOrcado)}\n` +
    `• *Total de Peças Aplicadas:* ${financialEngine.formatarMoeda(totalPecas)}\n` +
    `• *Total Pago/Adiantado:* ${financialEngine.formatarMoeda(totalPago)}\n` +
    `• *Saldo Pendente:* ${financialEngine.formatarMoeda(saldoRestante)}\n\n` +
    `${statusMsg}\n\n` +
    `Qualquer dúvida estamos à disposição!`;

  return {
    sucesso: true,
    ok: true,
    osId: o.id || osNorm,
    num: o.num || o.id || osNorm,
    placa,
    cliente,
    veiculoInfo,
    statusLiberacaoPatio,
    totalOrcado,
    totalPago,
    saldoRestante,
    totalPecas,
    textoWhatsapp,
    textoCobranca: textoWhatsapp
  };
}

module.exports = {
  gerarTextoCobrancaOS,
  gerarAvisoClienteOS
};
