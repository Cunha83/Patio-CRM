'use strict';

const crypto = require('crypto');
const { mascararDocumento } = require('./lgpdExport');

function anonimizarDadosCliente({ tenantId, state, customerId, motivo = 'solicitacao_titular_lgpd', ator = 'dpo' }) {
  if (!tenantId || !state) throw new Error('tenantId e state são obrigatórios.');
  const cliente = (state.clientes || []).find(c => c.id === customerId);
  if (!cliente) return { ok: false, error: 'Cliente não encontrado.' };

  const hashId = crypto.createHash('sha256').update(customerId + Date.now()).digest('hex').slice(0, 8);
  const nomeOriginal = cliente.nome;

  cliente.nome = `Titular Anonimizado #${hashId}`;
  cliente.nomeFantasia = null;
  cliente.fone = null;
  cliente.email = null;
  cliente.endereco = null;
  cliente.contato = null;
  cliente.contatos = [];
  cliente.obs = 'Dados pessoais anonimizados conforme LGPD.';
  cliente.documento = mascararDocumento(cliente.documento || cliente.doc);
  if (cliente.doc) cliente.doc = cliente.documento;

  cliente.anonimizado = true;
  cliente.anonimizadoEm = new Date().toISOString();
  cliente.motivoAnonimizacao = motivo;

  if (!cliente.preferenciasContato) cliente.preferenciasContato = {};
  cliente.preferenciasContato.commercial = false;
  cliente.preferenciasContato.preventiveMaintenance = false;
  cliente.preferenciasContato.afterSales = false;
  cliente.preferenciasContato.whatsapp = false;

  if (Array.isArray(state.opportunities)) {
    for (const op of state.opportunities) {
      if (op.customerId === customerId && ['aberta', 'contato_programado'].includes(op.status)) {
        op.status = 'cancelada';
        op.motivoCancelamento = 'Anonimização de dados LGPD';
      }
    }
  }

  if (!state.auditoria) state.auditoria = [];
  state.auditoria.unshift({
    id: `aud_lgpd_${Date.now()}`,
    timestamp: new Date().toISOString(),
    action: 'lgpd_customer_anonymized',
    actorId: ator,
    tenantId,
    details: {
      customerId,
      hashId,
      motivo,
      nomeAnteriorMascarado: nomeOriginal.slice(0, 3) + '***'
    }
  });

  return {
    ok: true,
    customerId,
    anonimizado: true,
    nomeAnonimizado: cliente.nome
  };
}

module.exports = {
  anonimizarDadosCliente
};
