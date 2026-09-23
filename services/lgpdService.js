'use strict';

const crypto = require('crypto');

/**
 * PÁTIO CRM — SERVIÇO DE CONFORMIDADE LGPD
 * Permite a exportação de dados do titular e anonimização de dados pessoais
 * sem comprometer a integridade fiscal, contábil e de auditoria exigida por lei.
 */

const { all } = require('../db');

function mascararDocumento(doc) {
  if (!doc) return null;
  const limpo = String(doc).replace(/\D/g, '');
  if (limpo.length === 11) {
    return `***.***.${limpo.slice(6, 9)}-**`;
  }
  if (limpo.length === 14) {
    return `${limpo.slice(0, 2)}.***.***/${limpo.slice(8, 12)}-**`;
  }
  return '***';
}

/**
 * Validação de contrato monetário estrito para campos fiscais.
 * Rejeita expressamente booleanos, arrays, objetos, símbolos e strings vazias/espaços.
 * Aceita números finitos e strings numéricas com formato decimal estrito (ex: "1250.00" ou "1250,00").
 *
 * @param {any} val - Valor a ser validado
 * @param {boolean} obrigatorio - Se true, null/undefined invalida o campo
 * @returns {{ valido: boolean, valor: number|null }}
 */
function validarCampoMonetario(val, obrigatorio = false) {
  if (val === undefined || val === null) {
    return obrigatorio ? { valido: false, valor: null } : { valido: true, valor: null };
  }
  // Rejeição estrita de tipos não monetários (evita que false, true, [], [12], {} virem números)
  if (typeof val === 'boolean' || Array.isArray(val) || typeof val === 'object' || typeof val === 'symbol') {
    return { valido: false, valor: null };
  }
  if (typeof val === 'number') {
    if (Number.isFinite(val)) {
      return { valido: true, valor: val };
    }
    return { valido: false, valor: null };
  }
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (!trimmed) {
      return { valido: false, valor: null };
    }
    // Formato numérico decimal estrito: opcional sinal negativo, dígitos inteiros, opcional separador . ou , seguido de dígitos
    if (!/^-?\d+(?:[.,]\d+)?$/.test(trimmed)) {
      return { valido: false, valor: null };
    }
    const normalizado = trimmed.replace(',', '.');
    const num = Number(normalizado);
    if (Number.isFinite(num)) {
      return { valido: true, valor: num };
    }
    return { valido: false, valor: null };
  }
  return { valido: false, valor: null };
}

function exportarDadosCliente({ tenantId, state, customerId }) {
  if (!tenantId || !state) throw new Error('tenantId e state são obrigatórios.');
  const cliente = (state.clientes || []).find(c => c.id === customerId);
  if (!cliente) return { ok: false, error: 'Cliente não encontrado.' };

  const veiculos = (state.veiculos || []).filter(v => v.clienteId === customerId || v.cli === customerId);
  const veiculosIds = new Set(veiculos.map(v => v.id));

  const ordens = (state.os || []).filter(o => o.cli === customerId || veiculosIds.has(o.vei));
  const orcamentos = (state.quotations || []).filter(q => q.customerId === customerId || veiculosIds.has(q.vehicleId));
  const agendamentos = (state.appointments || []).filter(a => a.customerId === customerId || veiculosIds.has(a.vehicleId));
  const posVendas = (state.afterSales || []).filter(pv => pv.customerId === customerId || veiculosIds.has(pv.vehicleId));

  // Levantamento de Documentos Fiscais associados ao titular (se presentes no estado ou preenchidos)
  const docLimpo = String(cliente.documento || cliente.doc || '').replace(/\D/g, '');
  const osIds = ordens.map(o => String(o.id));
  const docsFiscais = (state.fiscalDocuments || []).filter(r => {
    if (osIds.length > 0 && r.origem_id && osIds.includes(String(r.origem_id))) return true;
    if (docLimpo && r.destinatario_json && r.destinatario_json.includes(docLimpo)) return true;
    return false;
  });

  return {
    ok: true,
    dataExportacao: new Date().toISOString(),
    titular: {
      id: cliente.id,
      nome: cliente.nome,
      documento: cliente.documento || cliente.doc || null,
      fone: cliente.fone || null,
      email: cliente.email || null,
      endereco: cliente.endereco || null,
      contatos: cliente.contatos || [],
      preferenciasContato: cliente.preferenciasContato || {},
      consentimentos: cliente.consentimentos || {}
    },
    veiculos: veiculos.map(v => ({
      id: v.id,
      placa: v.placa,
      modelo: v.modelo,
      marca: v.marca,
      ano: v.ano,
      km: v.km
    })),
    ordensServico: ordens.map(o => ({
      id: o.id,
      numero: o.num,
      dataAbertura: o.abertura,
      dataFechamento: o.fechamento,
      status: o.st,
      total: o.total
    })),
    orcamentos: orcamentos.map(q => ({
      id: q.id,
      versao: q.versao,
      status: q.status,
      total: q.totalGeral
    })),
    agendamentos: agendamentos.map(a => ({
      id: a.id,
      data: a.scheduledDate,
      hora: a.scheduledTime,
      motivo: a.reason,
      status: a.status
    })),
    posVendas: posVendas.map(pv => ({
      id: pv.id,
      status: pv.status,
      feedback: pv.feedback,
      contatos: pv.contatos
    })),
    documentosFiscais: docsFiscais
  };
}

async function exportarDadosClienteAsync({ tenantId, state, customerId }) {
  const exportado = exportarDadosCliente({ tenantId, state, customerId });
  if (!exportado.ok) return exportado;

  const cliente = (state.clientes || []).find(c => c.id === customerId);
  const docLimpo = String(cliente?.documento || cliente?.doc || '').replace(/\D/g, '');
  const osIds = new Set((exportado.ordensServico || []).map(o => String(o.id)));

  let rows;
  try {
    rows = await all(
      'SELECT id, modelo, serie, numero, status, chave_acesso, totais_json, data_autorizacao, created_at, origem_tipo, origem_id, destinatario_json FROM fiscal_documents WHERE tenant_id = ?',
      [tenantId]
    );
  } catch (dbErr) {
    // Não mascara falha silenciosamente: reporta erro e incompletude
    return {
      ...exportado,
      ok: false,
      status: 500,
      incompleto: true,
      error: `Falha ao consultar documentos fiscais vinculados: ${dbErr.message}`,
      documentosFiscais: []
    };
  }

  const docsFiscais = [];
  let temJsonInvalido = false;

  for (const r of rows || []) {
    let pertenceAoTitular = false;
    let destinatarioInvalido = false;
    let docDest = null;

    // Validação estruturada de destinatario_json se presente
    if (r.destinatario_json) {
      try {
        const dest = JSON.parse(r.destinatario_json);
        if (!dest || typeof dest !== 'object' || Array.isArray(dest)) {
          destinatarioInvalido = true;
          temJsonInvalido = true;
        } else {
          docDest = String(dest.documento || dest.cpf || dest.cnpj || dest.cpf_destinatario || dest.cnpj_destinatario || '').replace(/\D/g, '');
          if (!docDest) {
            destinatarioInvalido = true;
            temJsonInvalido = true;
          }
        }
      } catch (jsonErr) {
        destinatarioInvalido = true;
        temJsonInvalido = true;
      }
    }

    // 1. Valida vinculo estruturado de origem: origem_tipo deve ser 'os' e origem_id deve pertencer a uma OS do titular
    if (r.origem_tipo === 'os' && r.origem_id && osIds.has(String(r.origem_id))) {
      pertenceAoTitular = true;
    }

    // 2. Parse estruturado de destinatario_json e comparacao de CPF/CNPJ normalizado
    if (!pertenceAoTitular && docLimpo && docDest && docDest === docLimpo) {
      pertenceAoTitular = true;
    }

    if (pertenceAoTitular) {
      let totaisObj = null;
      let totaisIncompletos = false;

      if (r.totais_json) {
        try {
          const parsed = JSON.parse(r.totais_json);
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            totaisObj = parsed;
          } else {
            totaisIncompletos = true;
            temJsonInvalido = true;
          }
        } catch (_) {
          totaisIncompletos = true;
          temJsonInvalido = true;
        }
      } else {
        totaisIncompletos = true;
      }

      let totaisFormatados = null;
      if (!totaisIncompletos && totaisObj) {
        const vTotal = totaisObj.valorTotalDocumento ?? totaisObj.valorTotal;
        const vServ = totaisObj.valorServicos;
        const vProd = totaisObj.valorProdutos;
        const vDesc = totaisObj.desconto;

        // Validação de contrato monetário estrito. Rejeita booleanos, arrays, objetos, vazios.
        const checkTotal = validarCampoMonetario(vTotal, true);
        const checkServ = validarCampoMonetario(vServ, false);
        const checkProd = validarCampoMonetario(vProd, false);
        const checkDesc = validarCampoMonetario(vDesc, false);

        if (!checkTotal.valido || !checkServ.valido || !checkProd.valido || !checkDesc.valido) {
          totaisIncompletos = true;
          temJsonInvalido = true;
        } else {
          totaisFormatados = {
            valorTotal: checkTotal.valor,
            valorServicos: checkServ.valor,
            valorProdutos: checkProd.valor,
            desconto: checkDesc.valor
          };
        }
      }

      const docIncompleto = totaisIncompletos || destinatarioInvalido;

      // Definição explícita dos campos exportáveis autorizados
      docsFiscais.push({
        id: String(r.id),
        modelo: String(r.modelo),
        serie: String(r.serie),
        numero: Number.isFinite(Number(r.numero)) ? Number(r.numero) : null,
        status: String(r.status),
        chaveAcesso: r.chave_acesso ? String(r.chave_acesso) : null,
        dataAutorizacao: r.data_autorizacao ? String(r.data_autorizacao) : null,
        emitidoEm: String(r.created_at),
        origemTipo: r.origem_tipo ? String(r.origem_tipo) : null,
        origemId: r.origem_id ? String(r.origem_id) : null,
        totais: totaisFormatados,
        incompleto: docIncompleto ? true : undefined
      });
    }
  }

  exportado.documentosFiscais = docsFiscais;
  if (temJsonInvalido || docsFiscais.some(d => d.incompleto)) {
    exportado.incompleto = true;
    exportado.advertencia = 'Um ou mais registros fiscais vinculados continham dados incompletos ou JSON com formatação corrompida.';
  }

  return exportado;
}

function anonimizarDadosCliente({ tenantId, state, customerId, motivo = 'solicitacao_titular_lgpd', ator = 'dpo' }) {
  if (!tenantId || !state) throw new Error('tenantId e state são obrigatórios.');
  const cliente = (state.clientes || []).find(c => c.id === customerId);
  if (!cliente) return { ok: false, error: 'Cliente não encontrado.' };

  const hashId = crypto.createHash('sha256').update(customerId + Date.now()).digest('hex').slice(0, 8);
  const nomeOriginal = cliente.nome;

  // Anonimiza dados pessoais no cadastro
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

  // Desativa comunicações futuras
  if (!cliente.preferenciasContato) cliente.preferenciasContato = {};
  cliente.preferenciasContato.commercial = false;
  cliente.preferenciasContato.preventiveMaintenance = false;
  cliente.preferenciasContato.afterSales = false;
  cliente.preferenciasContato.whatsapp = false;

  // Cancela oportunidades ativas
  if (Array.isArray(state.opportunities)) {
    for (const op of state.opportunities) {
      if (op.customerId === customerId && ['aberta', 'contato_programado'].includes(op.status)) {
        op.status = 'cancelada';
        op.motivoCancelamento = 'Anonimização de dados LGPD';
      }
    }
  }

  // Registra trilha de auditoria
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
  exportarDadosCliente,
  exportarDadosClienteAsync,
  anonimizarDadosCliente,
  mascararDocumento
};
