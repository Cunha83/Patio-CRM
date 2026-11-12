'use strict';

/**
 * services/whatsapp/whatsappTechnicalQuotationSkill.js
 *
 * Skill de Orçamentista Técnico IA no WhatsApp:
 * - Pré-orçamento rápido de suspensão pesada com consulta de estoque
 * - Proteção de margem pelo Custo Médio Ponderado (CMP)
 * - Trava de crédito e condição comercial centralizada no clienteId
 * - Conversão de pré-orçamento em OS com reserva de peças prontas
 *
 * Teto Modular: <= 270 linhas
 */

const crypto = require('crypto');
const fleetDelinquencyGuardService = require('../billing/fleetDelinquencyGuardService');
const externalFleetApprovalService = require('../quotation/externalFleetApprovalService');

function gerarId(prefix) {
  return prefix + '_' + Date.now() + '_' + crypto.randomBytes(3).toString('hex');
}

function parseQuantidadeETexto(mensagem = '') {
  const padroes = [
    { regex: /(\d+)\s*(?:feixe[s]?\s*(?:de\s*)?mola[s]?|mola[s]?)/i, termo: 'mola', tipo: 'peca' },
    { regex: /(\d+)\s*(?:pino[s]?\s*(?:de\s*)?centro|pino[s]?)/i, termo: 'pino', tipo: 'peca' },
    { regex: /(\d+)\s*(?:grampo[s]?\s*u?)/i, termo: 'grampo', tipo: 'peca' },
    { regex: /(\d+)\s*(?:bucha[s]?|embuchamento)/i, termo: 'bucha', tipo: 'peca' },
    { regex: /(\d+)\s*(?:alinhamento[s]?)/i, termo: 'alinhamento', tipo: 'servico' },
    { regex: /(\d+)\s*(?:troca[s]?\s*(?:de\s*)?feixe|troca\s*mola)/i, termo: 'troca', tipo: 'servico' }
  ];
  const itens = [];
  for (const p of padroes) {
    const m = mensagem.match(p.regex);
    if (m) itens.push({ termo: p.termo, qtd: parseInt(m[1], 10) || 1, tipo: p.tipo });
    else if (new RegExp(p.termo, 'i').test(mensagem)) itens.push({ termo: p.termo, qtd: 1, tipo: p.tipo });
  }
  return itens;
}

function buscarPecaOuServicoNoEstoque(state, termo, tipo) {
  const estoque = Array.isArray(state.estoque) ? state.estoque : (Array.isArray(state.pecas) ? state.pecas : []);
  const servicos = Array.isArray(state.servicos) ? state.servicos : [];
  if (tipo === 'peca') return estoque.find(p => new RegExp(termo, 'i').test(p.descricao || p.nome || '')) || null;
  return servicos.find(s => new RegExp(termo, 'i').test(s.nome || s.descricao || '')) || null;
}

function gerarPreOrcamentoRapidoSuspensao(state, payload = {}) {
  if (!state) throw new Error('Estado da aplicação não informado');
  state.whatsappPreQuotations = Array.isArray(state.whatsappPreQuotations) ? state.whatsappPreQuotations : [];
  state.whatsappAgentLogs = Array.isArray(state.whatsappAgentLogs) ? state.whatsappAgentLogs : [];

  const clienteId = payload.clienteId || null;
  const cliente = (state.clientes || []).find(c => c.id === clienteId);
  const clienteNome = payload.clienteNome || cliente?.nome || 'Cliente Frotista';
  const placa = (payload.placa || '').toUpperCase().trim();
  const modeloVeiculo = payload.modeloVeiculo || 'Linha Pesada';
  const markupMin = Number(payload.markupMinimoPercentual ?? 35);
  const timestamp = payload.timestamp || new Date().toISOString();

  // Avaliação de crédito do cliente
  let condicaoPagamentoPermitida = 'faturado_bordero_ou_pix';
  if (clienteId) {
    try {
      const risco = fleetDelinquencyGuardService.avaliarRiscoInadimplenciaFrotista(state, clienteId, { dataReferencia: timestamp });
      if (risco.statusCredito === 'bloqueado_inadimplencia' || risco.statusRisco === 'bloqueado_inadimplencia') {
        condicaoPagamentoPermitida = 'somente_a_vista_pix';
      }
    } catch (_) {}
  }

  // Identificação e cálculo de itens
  const itensDetectados = (payload.itensSolicitados && payload.itensSolicitados.length > 0)
    ? payload.itensSolicitados
    : parseQuantidadeETexto(payload.mensagemItens || payload.mensagem || '');

  const itensCalculados = [];
  let subtotalPecas = 0, subtotalServicos = 0, custoTotalCMP = 0;

  for (const it of itensDetectados) {
    const itemDb = buscarPecaOuServicoNoEstoque(state, it.termo || it.nome, it.tipo || (it.partId ? 'peca' : 'servico'));
    const qtd = Number(it.qtd || it.quantidade || 1);

    if (it.tipo === 'servico' || (itemDb && !itemDb.custoMedio && itemDb.preco)) {
      const precoUnit = Number(itemDb?.preco || 150.00);
      const sub = +(precoUnit * qtd).toFixed(2);
      subtotalServicos = +(subtotalServicos + sub).toFixed(2);
      itensCalculados.push({ tipo: 'servico', servicoId: itemDb?.id || gerarId('srv'), descricao: itemDb?.nome || it.termo || 'Serviço de Suspensão', quantidade: qtd, precoUnitario: precoUnit, subtotal: sub });
    } else {
      const qtdFisica = Number(itemDb?.quantidade ?? itemDb?.qtd ?? 0);
      const custoCMP = Number(itemDb?.custoMedio ?? itemDb?.custo ?? 0);
      const precoTabela = Number(itemDb?.preco ?? itemDb?.precoVenda ?? 0);
      const precoMinimoCMP = +(custoCMP * (1 + markupMin / 100)).toFixed(2);
      const precoUnitarioOrcado = Math.max(precoTabela, precoMinimoCMP);
      const prontaEntrega = qtdFisica >= qtd;
      const sub = +(precoUnitarioOrcado * qtd).toFixed(2);

      subtotalPecas = +(subtotalPecas + sub).toFixed(2);
      custoTotalCMP = +(custoTotalCMP + (custoCMP * qtd)).toFixed(2);

      itensCalculados.push({
        tipo: 'peca',
        partId: itemDb?.id || gerarId('peca'),
        codigo: itemDb?.codigo || 'GEN-01',
        descricao: itemDb?.descricao || itemDb?.nome || it.termo || 'Peça Pesada',
        quantidade: qtd,
        precoUnitarioOrcado,
        custoMedioCMP: custoCMP,
        ajusteMargemCMPAtivado: precoUnitarioOrcado > precoTabela,
        statusEstoqueItem: prontaEntrega ? 'pronta_entrega' : 'encomenda_necessaria',
        disponivelProntaEntrega: prontaEntrega,
        subtotal: sub
      });
    }
  }

  const valorTotal = +(subtotalPecas + subtotalServicos).toFixed(2);
  const lucroBruto = +(valorTotal - custoTotalCMP).toFixed(2);
  const margemPercentual = valorTotal > 0 ? +((lucroBruto / valorTotal) * 100).toFixed(1) : 0;

  // Formatação de resposta humanizada para WhatsApp
  let msgWpp = `📋 *Pré-Orçamento Técnico Pátio-CRM*\n🚛 Veículo: *${placa || 'A Definir'}* (${modeloVeiculo})\n👤 Cliente: *${clienteNome}*\n\n*Itens Orçados:*\n`;
  for (const i of itensCalculados) {
    const statusDisp = i.tipo === 'peca' ? (i.disponivelProntaEntrega ? '✅ Em Estoque' : '⏳ Sob Encomenda') : '🔧 Mão de Obra';
    const precoUnitStr = i.precoUnitarioOrcado ? ` (R$ ${i.precoUnitarioOrcado.toFixed(2)}/un)` : '';
    msgWpp += `• ${i.quantidade}x ${i.descricao} — R$ ${i.subtotal.toFixed(2)}${precoUnitStr} (${statusDisp})\n`;
  }
  msgWpp += `\n💰 *Total Estimado: R$ ${valorTotal.toFixed(2)}*\n💳 Condição: *${condicaoPagamentoPermitida === 'somente_a_vista_pix' ? 'Somente à Vista (PIX)' : 'Faturado / Borderô'}*\n⏱️ Validade: 24h. Responda *APROVAR* para gerar a Ordem de Serviço.`;

  const preOrcamento = {
    id: gerarId('pre_orc'),
    tenantId: state.tenantId || 'default',
    clienteId,
    clienteNome,
    placa,
    modeloVeiculo,
    itens: itensCalculados,
    itensPecas: itensCalculados.filter(i => i.tipo === 'peca'),
    itensServicos: itensCalculados.filter(i => i.tipo === 'servico'),
    subtotalPecas,
    subtotalServicos,
    custoTotalCMPPecas: custoTotalCMP,
    margemBrutaEstimadaPercentual: margemPercentual,
    valorTotalPreOrcamento: valorTotal,
    condicaoPagamentoPermitida,
    markupMinimoPercentual: markupMin,
    status: 'enviado_whatsapp',
    criadoEm: timestamp,
    validadeAte: new Date(new Date(timestamp).getTime() + 24 * 3600000).toISOString(),
    respostaTextoWhatsApp: msgWpp,
    responsavel: payload.responsavel || 'Agente-Orcamentista-WhatsApp'
  };

  state.whatsappPreQuotations.unshift(preOrcamento);
  state.whatsappAgentLogs.push({
    id: gerarId('log_orc'), skill: 'SKILL_ORCAMENTISTA_TECNICO', preOrcamentoId: preOrcamento.id, clienteId, valorTotal, timestamp
  });
  return preOrcamento;
}

function converterPreOrcamentoWhatsAppEmOS(state, preOrcamentoId, options = {}) {
  if (!state) throw new Error('Estado da aplicação não informado');
  state.os = Array.isArray(state.os) ? state.os : [];
  state.partReservations = Array.isArray(state.partReservations) ? state.partReservations : [];

  const pre = (state.whatsappPreQuotations || []).find(q => q.id === preOrcamentoId);
  if (!pre) {
    const err = new Error(`Pré-orçamento #${preOrcamentoId} não encontrado.`);
    err.code = 'PRE_QUOTATION_NOT_FOUND';
    err.status = 404;
    throw err;
  }
  if (pre.status === 'convertido_os') {
    const err = new Error(`Pré-orçamento #${preOrcamentoId} já foi convertido na OS #${pre.osGeradaId}.`);
    err.code = 'PRE_QUOTATION_ALREADY_CONVERTED';
    err.status = 409;
    throw err;
  }
  if (pre.condicaoPagamentoPermitida === 'somente_a_vista_pix' && !options.autorizarOverrideCreditoCliente) {
    const err = new Error('Cliente com crédito bloqueado por inadimplência. Conversão exige pagamento à vista ou autorização com justificativa.');
    err.code = 'CLIENT_CREDIT_BLOCKED_FOR_QUOTATION';
    err.status = 422;
    throw err;
  }

  const timestamp = options.timestamp || new Date().toISOString();
  const novaOS = {
    id: gerarId('os'),
    tenantId: pre.tenantId,
    num: state.os.length + 101,
    clienteId: pre.clienteId,
    clienteNome: pre.clienteNome,
    cliente: pre.clienteNome,
    placa: pre.placa,
    modeloVeiculo: pre.modeloVeiculo,
    itens: pre.itens,
    pecas: pre.itensPecas,
    servicos: pre.itensServicos,
    valorTotal: pre.valorTotalPreOrcamento,
    total: pre.valorTotalPreOrcamento,
    status: 'aberta',
    origem: 'whatsapp_pre_orcamento',
    preOrcamentoId: pre.id,
    dataAbertura: timestamp,
    overrideCredito: options.autorizarOverrideCreditoCliente ? {
      autorizado: true,
      justificativa: options.justificativaOverride || 'Autorização gerencial',
      em: timestamp
    } : null
  };

  const reservasCriadas = [];
  if (options.reservarPecasDisponiveis !== false) {
    for (const p of pre.itensPecas) {
      if (p.statusEstoqueItem === 'pronta_entrega' && p.partId) {
        const res = {
          id: gerarId('res'),
          tenantId: pre.tenantId,
          osId: novaOS.id,
          partId: p.partId,
          nomePeca: p.descricao,
          quantity: p.quantidade,
          status: 'ativa',
          criadoEm: timestamp
        };
        state.partReservations.push(res);
        reservasCriadas.push(res);
      }
    }
  }

  pre.status = 'convertido_os';
  pre.osGeradaId = novaOS.id;
  pre.convertidoEm = timestamp;
  state.os.unshift(novaOS);

  let linkPortalB2B = null;
  if (options.gerarLinkPortalB2B) {
    try {
      linkPortalB2B = externalFleetApprovalService.gerarLinkTokenAprovacaoFrotista(state, {
        osId: novaOS.id,
        timestamp
      });
    } catch (_) {}
  }

  return { ok: true, novaOS, preOrcamento: pre, linkPortalB2B, reservasCriadas };
}

function executarSkillOrcamentistaTecnicoWhatsApp(state, payload = {}) {
  const pre = gerarPreOrcamentoRapidoSuspensao(state, payload);
  return {
    ok: true,
    skill: 'SKILL_ORCAMENTISTA_TECNICO',
    respostaTextoWhatsApp: pre.respostaTextoWhatsApp,
    preOrcamento: pre
  };
}

module.exports = {
  gerarPreOrcamentoRapidoSuspensao,
  converterPreOrcamentoWhatsAppEmOS,
  executarSkillOrcamentistaTecnicoWhatsApp
};
