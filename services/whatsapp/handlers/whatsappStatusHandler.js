'use strict';

const {
  formatarMoeda,
  responderMensagem
} = require('./whatsappHelpers');
const {
  registrarIdempotencia
} = require('./whatsappSecurity');

async function tratarDocumentoIdentificado(msg, docAnalise, wppClient, targetChatId, msgId) {
  if (!docAnalise) return false;
  const dados = docAnalise.dados || {};

  if (docAnalise.tipo === 'pedido_compra') {
    await responderMensagem(msg,
      `📋 *Pedido de Compra / Cotação Identificado!*\n\n• *Fornecedor:* ${dados.fornecedor || 'Identificado'}\n• *Número do Pedido:* ${dados.numero_documento || 'S/N'}\n• *Valor Total:* ${formatarMoeda(dados.valor_total || 0)}\n\n_Documento recebido e provisionado para conferência no almoxarifado/compras._`,
      wppClient, targetChatId
    );
    await registrarIdempotencia(msgId);
    return true;
  }
  if (docAnalise.tipo === 'nota_fiscal') {
    await responderMensagem(msg,
      `🧾 *Nota Fiscal (NF-e / DANFE) Identificada!*\n\n• *Emitente:* ${dados.fornecedor || 'Fornecedor'}\n• *Número da NF:* ${dados.numero_documento || 'S/N'}\n• *Chave de Acesso:* ${dados.chave_acesso || 'Identificada na imagem'}\n• *Valor Total:* ${formatarMoeda(dados.valor_total || 0)}\n\n_Registrado para conferência de entrada no estoque e escrituração fiscal._`,
      wppClient, targetChatId
    );
    await registrarIdempotencia(msgId);
    return true;
  }
  if (docAnalise.tipo === 'comprovante_pagamento') {
    await responderMensagem(msg,
      `💸 *Comprovante de Pagamento Identificado!*\n\n• *Favorecido:* ${dados.favorecido || dados.fornecedor || 'Favorecido'}\n• *Forma de Pagamento:* ${dados.forma_pagamento || 'Pix'}\n• *Valor Pago:* ${formatarMoeda(dados.valor_total || 0)}\n• *Autenticação:* ${dados.autenticacao || 'Identificada'}\n\n_Comprovante recebido para conciliação financeira no Contas a Pagar/Caixa._`,
      wppClient, targetChatId
    );
    await registrarIdempotencia(msgId);
    return true;
  }
  return false;
}

async function tratarConsultaStatusOS(msg, { tenantState, placaAlvo, isContextOperacao, wppClient, targetChatId, msgId }) {
  const osLista = tenantState?.os || [];
  if (placaAlvo) {
    const veic = (tenantState?.veiculos || []).find(v => v.placa && v.placa.toUpperCase().replace(/[^A-Z0-9]/g, '') === placaAlvo);
    const osVeiculo = veic ? osLista.find(o => o.vei === veic.id && o.st !== 'finalizada') : null;
    if (osVeiculo) {
      const boxInfo = osVeiculo.box ? ((tenantState?.boxes || []).find(b => b.id === osVeiculo.box) || { nome: 'Box Pátio' }).nome : 'Fila de Espera no Pátio';
      let itensServ = (osVeiculo.servicos || []).map(s => isContextOperacao ? `• ${s.nome} (${s.qtd}x)` : `• ${s.nome} (${s.qtd}x) — R$ ${(s.valor * s.qtd).toFixed(2)}`).join('\n') || '• Vistoria de Entrada';
      let itensPec = (osVeiculo.pecas || []).map(p => isContextOperacao ? `• ${p.nome} (${p.qtd}x)` : `• ${p.nome} (${p.qtd}x) — R$ ${(p.valor * p.qtd).toFixed(2)}`).join('\n');
      let resposta = `📋 *Status da OS #${osVeiculo.num} — Placa ${veic.placa}*\n\n🚛 *Veículo:* ${veic.marca || ''} ${veic.modelo || 'Caminhão'}\n📍 *Localização:* ${boxInfo}\n⚙️ *Situação:* *${osVeiculo.st.toUpperCase()}*\n📅 *Previsão de Entrega:* ${osVeiculo.prev || 'Em andamento'}\n\n🔧 *Serviços Lançados:*\n${itensServ}\n${itensPec ? `\n📦 *Peças:* \n${itensPec}` : ''}`;
      if (!isContextOperacao) resposta += `\n\n💰 *Valor Atual da OS:* R$ ${(osVeiculo.total || 0).toFixed(2)}`;
      resposta += `\n\n_Para adicionar serviços à OS, digite: "Inclua [serviço]"_`;
      await responderMensagem(msg, resposta, wppClient, targetChatId);
      await registrarIdempotencia(msgId);
      return true;
    }
    await responderMensagem(msg, `Não localizei nenhuma OS em andamento para a placa *${placaAlvo}*. Para abrir uma nova OS, envie: *Abrir OS placa ${placaAlvo}*.`, wppClient, targetChatId);
    await registrarIdempotencia(msgId);
    return true;
  }
  if (osLista.length > 0) {
    const ultimas = osLista.slice(0, 4).map(o => {
      const v = (tenantState?.veiculos || []).find(x => x.id === o.vei) || { placa: 'N/I' };
      const b = o.box ? ((tenantState?.boxes || []).find(bx => bx.id === o.box) || {}).nome : 'Fila de Espera';
      return `• *OS #${o.num}* — Placa *${v.placa}*: ${o.st.toUpperCase()} (${b})`;
    }).join('\n');
    await responderMensagem(msg, `📋 *Painel Geral de Ordens de Serviço:*\n\n${ultimas}\n\nPara consultar o status de um veículo específico, envie: *Status placa ABC1234*.`, wppClient, targetChatId);
  } else {
    await responderMensagem(msg, 'Nenhuma Ordem de Serviço ativa no momento. Para abrir uma nova OS, digite: *Abrir OS placa ABC1234*.', wppClient, targetChatId);
  }
  await registrarIdempotencia(msgId);
  return true;
}

module.exports = {
  tratarDocumentoIdentificado,
  tratarConsultaStatusOS
};

