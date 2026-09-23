'use strict';

const crypto = require('crypto');
const { get, run, all, transaction } = require('../../db');
const { getFiscalConfig } = require('./fiscalConfigService');
const { calcularDocumentoFiscal } = require('./fiscalCalculationEngine');

/**
 * Cria um rascunho de documento fiscal com cálculo tributário preliminar
 */
async function criarRascunhoDocumentoFiscal({
  tenantId,
  modelo = '55',
  tipoOperacao = 'saida',
  origemTipo = 'avulso',
  origemId = null,
  destinatario = {},
  itens = [],
  descontoGeral = 0,
  freteGeral = 0,
  outrasDespesasGeral = 0,
  idempotencyKey = null
}) {
  if (!tenantId) throw new Error('TenantId é obrigatório.');
  if (!Array.isArray(itens) || itens.length === 0) {
    throw new Error('O documento fiscal deve conter pelo menos um item.');
  }

  if (!['55', 'NFS-e'].includes(modelo)) throw new Error('Modelo fiscal não suportado.');
  for (const item of itens) {
    if (!(Number(item.quantidade ?? 1) > 0) || !(Number(item.valorUnitario ?? item.valor) > 0)) throw new Error('Quantidade e valor devem ser positivos.');
    if (Number(item.desconto || 0) > Number(item.quantidade ?? 1) * Number(item.valorUnitario ?? item.valor)) throw new Error('Desconto superior ao item.');
  }
  const config = await getFiscalConfig(tenantId);
  const calculo = calcularDocumentoFiscal({
    modelo,
    itens,
    descontoGeral,
    freteGeral,
    outrasDespesasGeral,
    emitenteConfig: config
  });

  const docId = `fisc_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  const idempKey = crypto.createHash('sha256').update(JSON.stringify([tenantId,idempotencyKey || docId])).digest('hex');
  const now = new Date().toISOString();

  return transaction(async () => {
  // Verifica se já existe documento com essa chave de idempotência
  const existente = await get('SELECT * FROM fiscal_documents WHERE idempotency_key = ? AND tenant_id = ?', [idempKey, tenantId]);
  if (existente) {
    if (existente.modelo !== modelo || existente.destinatario_json !== JSON.stringify(destinatario || {}) || existente.itens_json !== JSON.stringify(calculo.itens)) throw new Error('Identificador já utilizado com outro conteúdo.');
    return formatarDocumento(existente);
  }

  const serie = modelo === 'NFS-e' ? String(config.nfseSerie || '1') : String(config.nfeSerie ?? '1');

  await run(
    `INSERT INTO fiscal_documents (
      id, tenant_id, modelo, tipo_operacao, serie, numero, ambiente, status,
      origem_tipo, origem_id, idempotency_key, destinatario_json, itens_json,
      totais_json, impostos_json, reforma_tributaria_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, 0, ?, 'rascunho', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      docId,
      tenantId,
      modelo,
      tipoOperacao,
      serie,
      config.ambiente || 'homologacao',
      origemTipo,
      origemId,
      idempKey,
      JSON.stringify(destinatario || {}),
      JSON.stringify(calculo.itens),
      JSON.stringify(calculo.totais),
      JSON.stringify({}),
      JSON.stringify(calculo.reformaTributaria || {}),
      now,
      now
    ]
  );

  const docSalvo = await get('SELECT * FROM fiscal_documents WHERE id = ?', [docId]);
  return formatarDocumento(docSalvo);
  });
}

/**
 * Gera automaticamente os documentos fiscais pertinentes a uma Ordem de Serviço
 * (Separa peças em NF-e 55 e serviços em NFS-e)
 */
async function gerarDocumentosFiscaisDeOS({ tenantId, os, cliente = {} }) {
  if (!tenantId || !os) throw new Error('TenantId e OS são obrigatórios.');

  const config = await getFiscalConfig(tenantId);
  const docsCriados = [];

  const destinatario = {
    nome: cliente.nome || cliente.razaoSocial || os.cliNome || os.clienteNome || 'Cliente Não Identificado',
    documento: cliente.doc || cliente.cnpj || cliente.cpf || os.cliDoc || '',
    endereco: cliente.endereco || '',
    cidade: cliente.cidade || '',
    uf: cliente.uf || '',
    cep: cliente.cep || '',
    email: cliente.email || '',
    telefone: cliente.fone || cliente.telefone || ''
  };

  // 1. Mercadorias / Peças -> NF-e (Modelo 55)
  const pecas = Array.isArray(os.pecas) ? os.pecas.filter(p => Number(p.qtd || p.quantidade || 0) > 0) : [];
  if (pecas.length > 0) {
    const idempKeyNFe = `os_fisc_nfe_${os.id}_${tenantId}`;
    const existenteNFe = await get('SELECT * FROM fiscal_documents WHERE idempotency_key = ? AND tenant_id = ?', [idempKeyNFe, tenantId]);

    if (existenteNFe) {
      docsCriados.push(formatarDocumento(existenteNFe));
    } else {
      const itensNFe = pecas.map((p, idx) => ({
        numeroItem: idx + 1,
        codigoInterno: p.cod || p.codigo || p.id || `PEC-${idx+1}`,
        descricao: p.nome || p.descricao || 'Peça Pesada Automotiva',
        quantidade: Number(p.qtd || p.quantidade || 1),
        valorUnitario: Number(p.preco || p.valorUnitario || p.unitario || 0),
        desconto: Number(p.desconto || 0),
        ncm: p.ncm || '',
        cfop: p.cfop || ''
      }));

      const docNFe = await criarRascunhoDocumentoFiscal({
        tenantId,
        modelo: '55',
        tipoOperacao: 'saida',
        origemTipo: 'os',
        origemId: String(os.id),
        destinatario,
        itens: itensNFe,
        idempotencyKey: idempKeyNFe
      });
      docsCriados.push(docNFe);
    }
  }

  // 2. Mão de Obra / Serviços -> NFS-e
  const servicos = Array.isArray(os.servicos) ? os.servicos.filter(s => Number(s.preco || s.valor || 0) > 0) : [];
  if (servicos.length > 0) {
    const idempKeyNFSe = `os_fisc_nfse_${os.id}_${tenantId}`;
    const existenteNFSe = await get('SELECT * FROM fiscal_documents WHERE idempotency_key = ? AND tenant_id = ?', [idempKeyNFSe, tenantId]);

    if (existenteNFSe) {
      docsCriados.push(formatarDocumento(existenteNFSe));
    } else {
      const itensNFSe = servicos.map((s, idx) => ({
        numeroItem: idx + 1,
        codigoInterno: s.cod || s.codigo || s.id || `SRV-${idx+1}`,
        descricao: s.nome || s.descricao || 'Serviço de Oficina Mecânica Linha Pesada',
        quantidade: Number(s.qtd || s.quantidade || 1),
        valorUnitario: Number(s.preco || s.valor || 0),
        desconto: Number(s.desconto || 0),
        itemListaServico: s.itemListaServico || '',
        cnae: config.cnaePrincipal || ''
      }));

      const docNFSe = await criarRascunhoDocumentoFiscal({
        tenantId,
        modelo: 'NFS-e',
        tipoOperacao: 'saida',
        origemTipo: 'os',
        origemId: String(os.id),
        destinatario,
        itens: itensNFSe,
        idempotencyKey: idempKeyNFSe
      });
      docsCriados.push(docNFSe);
    }
  }

  return docsCriados;
}

/**
 * Transmite um documento fiscal ao autorizador / provedor
 */
const { transmitirDocumentoFiscal, consultarSituacaoDocumentoFiscal } = require('./transmission');

/**
 * Lista documentos fiscais do tenant com filtros
 */
async function listarDocumentosFiscais({ tenantId, modelo, status, origemId, limit = 50, offset = 0 }) {
  if (!tenantId) throw new Error('TenantId é obrigatório.');

  let sql = 'SELECT * FROM fiscal_documents WHERE tenant_id = ?';
  const params = [tenantId];

  if (modelo) {
    sql += ' AND modelo = ?';
    params.push(modelo);
  }
  if (status) {
    sql += ' AND status = ?';
    params.push(status);
  }
  if (origemId) {
    sql += ' AND origem_id = ?';
    params.push(origemId);
  }

  sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  params.push(Number(limit) || 50, Number(offset) || 0);

  const rows = await all(sql, params);
  const countRow = await get(`SELECT COUNT(*) as total FROM fiscal_documents WHERE tenant_id = ?`, [tenantId]);

  return {
    documentos: rows.map(formatarDocumento),
    total: countRow?.total || 0,
    limit,
    offset
  };
}

/**
 * Obtém documento fiscal por ID e tenant
 */
async function obterDocumentoFiscalPorId(documentId, tenantId) {
  if (!documentId || !tenantId) return null;
  const row = await get('SELECT * FROM fiscal_documents WHERE id = ? AND tenant_id = ?', [documentId, tenantId]);
  if (!row) return null;
  return formatarDocumento(row);
}

async function atualizarRascunho({documentId,tenantId,destinatario,itens}) {
  return transaction(async()=>{
    const row=await get('SELECT * FROM fiscal_documents WHERE id=? AND tenant_id=?',[documentId,tenantId]);
    if(!row || !['rascunho','rejeitado'].includes(row.status) || row.operation_id) throw new Error('Somente rascunho ou rejeição definitiva permite correção.');
    if(!Array.isArray(itens)||!itens.length||itens.length>100||itens.some(x=>!(Number(x.quantidade)>0)||!(Number(x.valorUnitario)>0))) throw new Error('Itens inválidos.');
    const calc=calcularDocumentoFiscal({modelo:row.modelo,itens,emitenteConfig:await getFiscalConfig(tenantId)});
    await run("UPDATE fiscal_documents SET destinatario_json=?,itens_json=?,totais_json=?,status='rascunho',reviewed_at=NULL,reviewed_by=NULL,config_snapshot_json=NULL,provider_payload_json=NULL,updated_at=? WHERE id=? AND tenant_id=?",[JSON.stringify(destinatario||{}),JSON.stringify(calc.itens),JSON.stringify(calc.totais),new Date().toISOString(),documentId,tenantId]);
    return obterDocumentoFiscalPorId(documentId,tenantId);
  });
}

function formatarDocumento(row) {
  if (!row) return null;
  return {
    id: row.id,
    reviewedAt: row.reviewed_at,
    providerPayload: row.provider_payload_json ? JSON.parse(row.provider_payload_json) : null,
    xmlSha256: row.xml_sha256,
    evidencia: row.reviewed_at && row.xml_sha256 ? 'Documento recuperado; assinatura não verificada localmente.' : 'Autorização externa não comprovada (rascunho, simulação ou legado).',

    tenantId: row.tenant_id,
    modelo: row.modelo,
    tipoOperacao: row.tipo_operacao,
    serie: row.serie,
    numero: row.numero,
    numeroOficial: row.numero_oficial,
    ambiente: row.ambiente,
    status: row.status,
    origemTipo: row.origem_tipo,
    origemId: row.origem_id,
    idempotencyKey: row.idempotency_key,
    destinatario: JSON.parse(row.destinatario_json || '{}'),
    itens: JSON.parse(row.itens_json || '[]'),
    totais: JSON.parse(row.totais_json || '{}'),
    impostos: JSON.parse(row.impostos_json || '{}'),
    reformaTributaria: JSON.parse(row.reforma_tributaria_json || '{}'),
    chaveAcesso: row.chave_acesso,
    protocoloAutorizacao: row.protocolo_autorizacao,
    dataAutorizacao: row.data_autorizacao,
    xmlOficial: row.xml_oficial,
    danfeUrl: row.danfe_url,
    mensagemErro: row.mensagem_erro,
    codigoStatusSefaz: row.codigo_status_sefaz,
    motivoStatusSefaz: row.motivo_status_sefaz,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

module.exports = {
  criarRascunhoDocumentoFiscal,
  gerarDocumentosFiscaisDeOS,
  transmitirDocumentoFiscal,
  consultarSituacaoDocumentoFiscal,
  listarDocumentosFiscais,
  obterDocumentoFiscalPorId,
  formatarDocumento,
  atualizarRascunho
};
