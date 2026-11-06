'use strict';

const crypto = require('crypto');
const {
  gerarTokenAprovacaoOrcamento,
  validarTokenAprovacaoOrcamento,
  consumirTokenAprovacaoOrcamento
} = require('../../lib/tokens/securityToken');
const inventoryService = require('../inventoryService');
const {
  calcularTotais,
  obterOrcamento,
  registrarAuditoria
} = require('./quotationCrud');

/**
 * Registra o envio do orçamento ao cliente e emite o token de aprovação digital
 */
function enviarOrcamento({
  tenantId,
  state,
  quotationId,
  canal = 'link',
  validadeHoras = 72,
  baseUrl = '',
  actorId = 'operador'
}) {
  const orc = obterOrcamento({ tenantId, state, quotationId });
  if (!orc) {
    return { ok: false, error: 'Orçamento não encontrado.', status: 404 };
  }

  const ttlMs = (Number(validadeHoras) || orc.validadeHoras || 72) * 60 * 60 * 1000;
  const token = gerarTokenAprovacaoOrcamento({
    tenantId,
    quotationId: orc.id,
    version: orc.versao,
    customerId: orc.clienteId,
    ttlMs
  });

  orc.status = 'enviado';
  orc.enviadoEm = new Date().toISOString();
  orc.canalEnvio = canal;
  orc.expiraEm = new Date(Date.now() + ttlMs).toISOString();
  orc.activeTokenHash = crypto.createHash('sha256').update(token).digest('hex');
  orc.atualizadoEm = new Date().toISOString();

  const cleanBase = String(baseUrl || '').replace(/\/+$/, '');
  const linkAprovacao = `${cleanBase}/aprovacao/${token}`;

  registrarAuditoria(state, {
    tenantId,
    tipo: 'orcamento_enviado',
    quotationId: orc.id,
    codigo: orc.codigo,
    canal,
    validadeHoras: Math.round(ttlMs / (60 * 60 * 1000)),
    autor: actorId
  });

  return {
    ok: true,
    quotation: orc,
    token,
    linkAprovacao
  };
}

/**
 * Valida o token de aprovação para exibição segura sem consumi-lo
 */
function consultarPorToken({ tokenString, state }) {
  const validacao = validarTokenAprovacaoOrcamento(tokenString);
  if (!validacao.ok) return validacao;

  const { tenantId, quotationId, version } = validacao.payload;
  const orc = obterOrcamento({ tenantId, state, quotationId });
  if (!orc) {
    return { ok: false, error: 'Orçamento não encontrado para este link.', status: 404 };
  }

  if (orc.versao !== version) {
    return {
      ok: false,
      error: 'Este orçamento foi atualizado pela oficina para uma versão mais recente. Solicite o novo link.',
      status: 409,
      conflict: true
    };
  }

  let fotosInspecao = [];
  if (orc.inspectionId && Array.isArray(state.inspections)) {
    const insp = state.inspections.find(i => i.id === orc.inspectionId && i.tenantId === tenantId);
    if (insp && Array.isArray(insp.items)) {
      for (const item of insp.items) {
        if (Array.isArray(item.fotos) && item.fotos.length > 0) {
          fotosInspecao.push({
            componente: item.componente,
            condicao: item.condicao,
            severidade: item.severidade,
            fotos: item.fotos
          });
        }
      }
    }
  }

  return {
    ok: true,
    quotation: orc,
    fotosInspecao,
    payload: validacao.payload
  };
}

/**
 * Processa a decisão do cliente (Aprovação Total, Parcial ou Recusa).
 */
function processarAprovacaoCliente({
  tenantId,
  state,
  tokenString,
  itensAprovadosIds = [],
  itensRecusadosIds = [],
  aprovarTudo = false,
  recusarTudo = false,
  motivoRecusa = null,
  canalAprovacao = 'link_digital',
  ipOrigem = null,
  userAgent = null,
  actorId = 'cliente'
}) {
  const consulta = consultarPorToken({ tokenString, state });
  if (!consulta.ok) return consulta;

  const orc = consulta.quotation;

  const statusFinais = ['aprovado', 'parcialmente_aprovado', 'recusado'];
  if (statusFinais.includes(orc.status)) {
    return {
      ok: true,
      quotation: orc,
      idempotente: true,
      mensagem: `A decisão sobre este orçamento já foi registrada anteriormente como "${orc.status}".`
    };
  }

  const consumo = consumirTokenAprovacaoOrcamento(tokenString, {
    tenantId,
    quotationId: orc.id,
    version: orc.versao
  });
  if (!consumo.ok && !consumo.jaConsumido) {
    return consumo;
  }

  const aprovadosSet = new Set(Array.isArray(itensAprovadosIds) ? itensAprovadosIds : []);
  const recusadosSet = new Set(Array.isArray(itensRecusadosIds) ? itensRecusadosIds : []);

  let qtdAprovados = 0;
  let qtdRecusados = 0;

  for (const item of orc.itens) {
    if (aprovarTudo) {
      item.status = 'aprovado';
      item.motivoRecusa = null;
      qtdAprovados++;
    } else if (recusarTudo) {
      item.status = 'recusado';
      item.motivoRecusa = motivoRecusa || 'Recusado integralmente pelo cliente';
      qtdRecusados++;
    } else {
      if (aprovadosSet.has(item.id)) {
        item.status = 'aprovado';
        item.motivoRecusa = null;
        qtdAprovados++;
      } else if (recusadosSet.has(item.id)) {
        item.status = 'recusado';
        item.motivoRecusa = motivoRecusa || 'Item dispensado pelo cliente';
        qtdRecusados++;
      } else {
        item.status = 'recusado';
        item.motivoRecusa = 'Item não selecionado para execução';
        qtdRecusados++;
      }
    }
  }

  const totais = calcularTotais(orc.itens, orc.descontoGeral);
  Object.assign(orc, totais);

  if (qtdAprovados > 0 && qtdRecusados === 0) {
    orc.status = 'aprovado';
  } else if (qtdAprovados > 0 && qtdRecusados > 0) {
    orc.status = 'parcialmente_aprovado';
  } else {
    orc.status = 'recusado';
  }

  orc.decisaoCliente = {
    decididoEm: new Date().toISOString(),
    canal: canalAprovacao,
    itensAprovadosIds: orc.itens.filter(i => i.status === 'aprovado').map(i => i.id),
    itensRecusadosIds: orc.itens.filter(i => i.status === 'recusado').map(i => i.id),
    motivoRecusaGeral: motivoRecusa || null,
    ipOrigem: ipOrigem || null,
    userAgent: userAgent || null
  };
  orc.atualizadoEm = new Date().toISOString();

  state.os = Array.isArray(state.os) ? state.os : [];
  const os = state.os.find(o => o.id === orc.osId);
  if (os) {
    os.servicos = Array.isArray(os.servicos) ? os.servicos : [];
    os.pecas = Array.isArray(os.pecas) ? os.pecas : [];
    os.itensRecusados = Array.isArray(os.itensRecusados) ? os.itensRecusados : [];

    for (const item of orc.itens) {
      if (item.status === 'aprovado') {
        const itemExecucao = {
          id: item.id,
          desc: item.nome,
          nome: item.nome,
          preco: item.valorTotal,
          qtd: item.quantidade,
          valorUnitario: item.valorUnitario,
          autorizado: true,
          orcamentoId: orc.id,
          codigoOrcamento: orc.codigo
        };

        if (item.tipo === 'peca') {
          let partId = item.partId || item.pecaId || null;
          if (!partId && Array.isArray(state.pecas)) {
            const matchPeca = state.pecas.find(p => p.tenantId === tenantId && (
              (p.descricao && p.descricao.toLowerCase() === item.nome.toLowerCase()) ||
              (p.nome && p.nome.toLowerCase() === item.nome.toLowerCase()) ||
              (p.codigoInterno && p.codigoInterno.toLowerCase() === item.nome.toLowerCase()) ||
              (p.id === item.id)
            ));
            if (matchPeca) partId = matchPeca.id;
          }

          if (partId) {
            itemExecucao.partId = partId;
            try {
              const resReserva = inventoryService.reservarParaOS({
                tenantId,
                state,
                osId: orc.osId,
                quotationId: orc.id,
                quotationItemId: item.id,
                partId,
                quantity: item.quantidade,
                actorId: 'aprovacao_cliente'
              });
              itemExecucao.statusEstoque = resReserva.status;
              itemExecucao.qtdReservada = resReserva.reservedQuantity;
              itemExecucao.qtdFaltante = resReserva.missingQuantity;
              itemExecucao.requirementId = resReserva.requirement?.id;
            } catch (errReserva) {
              console.warn('[QuotationService] Aviso ao reservar peça:', errReserva.message);
            }
          }

          const idx = os.pecas.findIndex(p => p.id === item.id);
          if (idx >= 0) os.pecas[idx] = itemExecucao;
          else os.pecas.push(itemExecucao);
        } else {
          const idx = os.servicos.findIndex(s => s.id === item.id);
          if (idx >= 0) os.servicos[idx] = itemExecucao;
          else os.servicos.push(itemExecucao);
        }
      } else {
        if (item.tipo === 'peca' && (item.partId || item.id)) {
          try {
            inventoryService.liberarReserva({
              tenantId,
              state,
              osId: orc.osId,
              partId: item.partId,
              quantity: item.quantidade,
              reason: 'Item de orçamento recusado pelo cliente',
              actorId: 'aprovacao_cliente'
            });
          } catch (_) {}
        }

        os.itensRecusados.push({
          id: item.id,
          nome: item.nome,
          tipo: item.tipo,
          quantidade: item.quantidade,
          valorTotal: item.valorTotal,
          motivoRecusa: item.motivoRecusa,
          autorizado: false,
          recusado: true,
          orcamentoId: orc.id
        });
      }
    }

    os.totalAutorizado = orc.totalAprovado;

    if (qtdAprovados > 0) {
      if (os.st === 'aprovacao' || os.st === 'fila' || os.st === 'diagnostico') {
        os.st = 'executando';
      }
    } else {
      if (os.st === 'aprovacao') {
        os.st = 'fila';
      }
    }
  }

  registrarAuditoria(state, {
    tenantId,
    tipo: 'orcamento_decidido_cliente',
    quotationId: orc.id,
    codigo: orc.codigo,
    status: orc.status,
    canalAprovacao,
    totalAprovado: orc.totalAprovado,
    qtdAprovados,
    qtdRecusados,
    autor: actorId
  });

  return {
    ok: true,
    quotation: orc,
    totalAprovado: orc.totalAprovado,
    status: orc.status,
    qtdAprovados,
    qtdRecusados
  };
}

module.exports = {
  enviarOrcamento,
  consultarPorToken,
  processarAprovacaoCliente
};

