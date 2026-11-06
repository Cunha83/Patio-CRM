'use strict';

const {
  gerarTokenAprovacaoOrcamento
} = require('../../lib/tokens/securityToken');
const {
  arredondar
} = require('./quotationCrud');
const {
  processarAprovacaoCliente
} = require('./quotationApproval');

/**
 * Formata mensagem clara e objetiva para envio do orçamento pelo WhatsApp
 */
function formatarMensagemWhatsAppOrcamento({ orcamento, state, baseUrl = '' }) {
  if (!orcamento) return '';
  const os = (state.os || []).find(o => o.id === orcamento.osId);
  const placa = orcamento.placa || (os ? os.placa : 'VEÍCULO');

  const cleanBase = String(baseUrl || '').replace(/\/+$/, '');
  const token = orcamento.token || (orcamento.activeTokenHash ? 'link' : '');
  const urlLink = token ? `${cleanBase}/aprovacao/${token}` : `${cleanBase}/aprovacao/orcamento-${orcamento.id}`;

  let texto = `🚚 *ORÇAMENTO TÉCNICO — PÁTIO CRM*\n`;
  texto += `📋 *Código:* ${orcamento.codigo} | *Placa:* ${placa}\n`;
  if (orcamento.adicional) {
    texto += `⚠️ *Escopo Adicional:* Detectado durante desmontagem/execução.\n`;
  }
  texto += `\n*ITENS PROPOSTOS:*\n`;

  orcamento.itens.forEach((it, idx) => {
    const tipoIcon = it.tipo === 'peca' ? '⚙️' : '🔧';
    const statusIcon = it.status === 'aprovado' ? '✅' : (it.status === 'recusado' ? '❌' : '⏳');
    texto += `${idx + 1}. ${tipoIcon} *${it.nome}* (${it.quantidade}x R$ ${it.valorUnitario.toFixed(2)}) = *R$ ${it.valorTotal.toFixed(2)}* ${statusIcon}\n`;
  });

  texto += `\n💵 *Subtotal Serviços:* R$ ${orcamento.subtotalServicos.toFixed(2)}\n`;
  texto += `📦 *Subtotal Peças:* R$ ${orcamento.subtotalPecas.toFixed(2)}\n`;
  if (orcamento.descontoGeral > 0) {
    texto += `🏷️ *Desconto:* -R$ ${orcamento.descontoGeral.toFixed(2)}\n`;
  }
  texto += `💰 *TOTAL GERAL:* *R$ ${orcamento.totalGeral.toFixed(2)}*\n`;
  if (orcamento.totalAprovado > 0 && orcamento.totalAprovado !== orcamento.totalGeral) {
    texto += `🟢 *TOTAL AUTORIZADO:* *R$ ${orcamento.totalAprovado.toFixed(2)}*\n`;
  }

  texto += `\n🔗 *Aprovação Digital com Fotos e Laudo Completo:*\n${urlLink}\n`;
  texto += `\nVocê pode aprovar ou recusar itens individualmente pelo link acima ou responder diretamente:\n`;
  texto += `👉 Digite *"APROVAR TUDO"* para autorizar o serviço completo.\n`;
  texto += `👉 Digite *"RECUSAR ORÇAMENTO"* caso queira declinar a proposta.\n`;

  return texto;
}

/**
 * Processa comandos textuais de orçamento via WhatsApp
 */
function processarComandoWhatsAppOrcamento({
  texto,
  fromNumber,
  state,
  tenantId = 'default',
  baseUrl = ''
}) {
  const t = String(texto || '').trim().toLowerCase();
  state.quotations = Array.isArray(state.quotations) ? state.quotations : [];

  const pendente = state.quotations.find(q =>
    q.tenantId === tenantId && (q.status === 'enviado' || q.status === 'rascunho')
  );

  if (!pendente) {
    return {
      reconhecido: false,
      resposta: 'Não encontrei nenhum orçamento aguardando sua aprovação no momento.'
    };
  }

  const token = gerarTokenAprovacaoOrcamento({
    tenantId,
    quotationId: pendente.id,
    version: pendente.versao
  });

  if (/^(aprovar tudo|aprovo tudo|aprova tudo|aprovado|pode fazer|autorizado)$/i.test(t)) {
    const resAprov = processarAprovacaoCliente({
      tenantId,
      state,
      tokenString: token,
      aprovarTudo: true,
      canalAprovacao: 'whatsapp',
      actorId: fromNumber || 'cliente_whatsapp'
    });

    return {
      reconhecido: true,
      acao: 'aprovar_tudo',
      sucesso: resAprov.ok,
      resposta: `✅ *Orçamento ${pendente.codigo} APROVADO com sucesso!* Valor autorizado: R$ ${pendente.totalAprovado.toFixed(2)}. Nossa equipe foi notificada e já iniciou a separação e execução.`
    };
  }

  if (/^(recusar tudo|recuso tudo|recusar orcamento|recusado|nao autorizo|não autorizo)$/i.test(t)) {
    const resRecusa = processarAprovacaoCliente({
      tenantId,
      state,
      tokenString: token,
      recusarTudo: true,
      motivoRecusa: 'Recusado pelo cliente via WhatsApp',
      canalAprovacao: 'whatsapp',
      actorId: fromNumber || 'cliente_whatsapp'
    });

    return {
      reconhecido: true,
      acao: 'recusar_tudo',
      sucesso: resRecusa.ok,
      resposta: `❌ *Orçamento ${pendente.codigo} RECUSADO.* Registramos sua decisão no sistema. Nenhum serviço será executado sem sua prévia autorização.`
    };
  }

  return {
    reconhecido: false,
    resposta: null
  };
}

/**
 * Resumo estatístico de orçamentos do tenant para o painel operacional
 */
function obterResumoOrcamentos({ tenantId, state }) {
  if (!tenantId || !state) {
    return {
      pendentesAprovacao: 0,
      valorPendente: 0,
      aprovados: 0,
      valorAprovado: 0,
      recusados: 0,
      adicionaisPendentes: 0
    };
  }

  const list = (state.quotations || []).filter(q => q.tenantId === tenantId);
  const pendentes = list.filter(q => q.status === 'enviado');
  const aprovados = list.filter(q => q.status === 'aprovado' || q.status === 'parcialmente_aprovado');
  const recusados = list.filter(q => q.status === 'recusado');
  const adicionais = list.filter(q => q.adicional && q.status === 'enviado');

  return {
    pendentesAprovacao: pendentes.length,
    valorPendente: arredondar(pendentes.reduce((acc, q) => acc + (q.totalGeral || 0), 0)),
    aprovados: aprovados.length,
    valorAprovado: arredondar(aprovados.reduce((acc, q) => acc + (q.totalAprovado || 0), 0)),
    recusados: recusados.length,
    adicionaisPendentes: adicionais.length
  };
}

module.exports = {
  formatarMensagemWhatsAppOrcamento,
  processarComandoWhatsAppOrcamento,
  obterResumoOrcamentos
};

