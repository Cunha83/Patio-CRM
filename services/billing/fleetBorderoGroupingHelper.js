'use strict';

/**
 * services/billing/fleetBorderoGroupingHelper.js
 *
 * Utilitários Auxiliares de Filtragem, Agrupamento e Notificação de Borderô de Frotas:
 * - Filtragem de ordens de serviço faturáveis por cliente e período
 * - Formatação de mensagem WhatsApp profissional para o financeiro da transportadora
 *
 * Teto Modular: <= 250 linhas
 */

/**
 * Lista ordens de serviço finalizadas e entregues aptas a faturamento em borderô.
 */
function listarOSFaturaveisPorCliente({ state, tenantId, clienteId, dataInicio, dataFim, centroCustoId }) {
  if (!state || !Array.isArray(state.os)) return [];

  return state.os.filter(os => {
    if (tenantId && os.tenantId && os.tenantId !== tenantId) return false;
    const cid = os.cli || os.clienteId;
    if (cid !== clienteId) return false;

    // Apenas finalizadas ou entregues
    const st = String(os.st || '').toLowerCase();
    if (!['finalizada', 'entregue', 'concluida', 'pronto'].includes(st)) return false;

    // Bloqueio anti-duplicidade: não pode estar em borderô ativo
    if (os.borderoId || os.statusBordero === 'faturado') return false;

    // Filtro por Centro de Custo
    if (centroCustoId) {
      const ccId = os.centroCustoId || (state.veiculos || []).find(v => v.id === os.vei || v.placa === os.placa)?.centroCustoId;
      if (ccId !== centroCustoId) return false;
    }

    // Filtro por janela de período
    const dataOS = String(os.fechamento || os.data || os.dataEntrada || '').split('T')[0];
    if (dataInicio && dataOS && dataOS < dataInicio) return false;
    if (dataFim && dataOS && dataOS > dataFim) return false;

    return true;
  });
}

/**
 * Formata notificação WhatsApp profissional para envio ao financeiro da transportadora.
 */
function formatarNotificacaoWhatsAppBordero({ state, bordero }) {
  if (!bordero) return '';
  const clienteNome = bordero.clienteNome || 'Cliente Frotista';
  const numBordero = bordero.num || bordero.id;
  const totais = bordero.totais || {};

  let msg = `🚛 *FECHAMENTO DE FROTA — BORDERÔ ${numBordero}*\n`;
  msg += `*Cliente:* ${clienteNome}\n`;
  msg += `*Veículos Faturados:* ${bordero.resumoOS?.length || bordero.osIds?.length || 0} veículos\n\n`;

  msg += `📋 *Resumo por Veículo/OS:*\n`;
  for (const item of (bordero.resumoOS || [])) {
    msg += `• Placa *${item.placa}* (OS #${item.num}): R$ ${item.totalOS?.toFixed(2) || '0.00'}\n`;
    if (Array.isArray(item.discriminacaoArticulado) && item.discriminacaoArticulado.length > 0) {
      for (const d of item.discriminacaoArticulado) {
        msg += `   └─ ${d.alvo === 'cavalo' ? 'Cavalo' : 'Carreta'} (${d.placa}): R$ ${d.total.toFixed(2)}\n`;
      }
    }
  }

  msg += `\n💰 *Totalização:*\n`;
  msg += `• Mão de Obra: R$ ${totais.totalMaoDeObra?.toFixed(2) || '0.00'}\n`;
  msg += `• Peças: R$ ${totais.totalPecas?.toFixed(2) || '0.00'}\n`;
  if (totais.descontoGeral > 0) msg += `• Desconto: -R$ ${totais.descontoGeral.toFixed(2)}\n`;
  if (totais.totalRetencoes > 0) msg += `• Retenções Contratuais: -R$ ${totais.totalRetencoes.toFixed(2)}\n`;
  msg += `• *TOTAL LÍQUIDO:* *R$ ${totais.totalLiquido?.toFixed(2) || '0.00'}*\n\n`;

  msg += `💳 *Parcelas & Pagamento:*\n`;
  for (const parc of (bordero.parcelas || [])) {
    msg += `*Parcela ${parc.numero || 1}:* R$ ${parc.valor?.toFixed(2)} — Venc: ${parc.vencimento}\n`;
    if (parc.linhaDigitavel) {
      msg += `Linha Digitável:\n\`${parc.linhaDigitavel}\`\n`;
    }
    if (parc.pixCopiaECola) {
      msg += `Pix Copia e Cola:\n\`${parc.pixCopiaECola}\`\n`;
    }
    msg += `\n`;
  }

  msg += `_Dúvidas sobre o faturamento? Entre em contato com nosso setor financeiro._`;
  return msg.trim();
}

module.exports = {
  listarOSFaturaveisPorCliente,
  formatarNotificacaoWhatsAppBordero
};

