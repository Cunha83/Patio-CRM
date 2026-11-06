'use strict';

const quotationCrud = require('./quotation/quotationCrud');
const quotationApproval = require('./quotation/quotationApproval');
const quotationWhatsApp = require('./quotation/quotationWhatsApp');

module.exports = {
  // CRUD, Totais e Versionamento
  gerarId: quotationCrud.gerarId,
  arredondar: quotationCrud.arredondar,
  registrarAuditoria: quotationCrud.registrarAuditoria,
  calcularTotais: quotationCrud.calcularTotais,
  criarOrcamento: quotationCrud.criarOrcamento,
  obterOrcamento: quotationCrud.obterOrcamento,
  listarOrcamentos: quotationCrud.listarOrcamentos,
  criarNovaVersao: quotationCrud.criarNovaVersao,
  criarAdicionalEscopo: quotationCrud.criarAdicionalEscopo,

  // Envio, Tokens e Aprovação do Cliente
  enviarOrcamento: quotationApproval.enviarOrcamento,
  consultarPorToken: quotationApproval.consultarPorToken,
  processarAprovacaoCliente: quotationApproval.processarAprovacaoCliente,

  // Integração com WhatsApp e Resumos
  formatarMensagemWhatsAppOrcamento: quotationWhatsApp.formatarMensagemWhatsAppOrcamento,
  processarComandoWhatsAppOrcamento: quotationWhatsApp.processarComandoWhatsAppOrcamento,
  obterResumoOrcamentos: quotationWhatsApp.obterResumoOrcamentos
};
