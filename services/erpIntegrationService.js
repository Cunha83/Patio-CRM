'use strict';

/**
 * PÁTIO CRM — CAMADA DE INTEGRAÇÃO COM ERP EXTERNO (FISCAL & CONTÁBIL)
 * Padroniza contratos de exportação canônica, cursores de paginação, identificadores
 * estáveis e sincronização bidirecional com ERPs de mercado (Totvs, Omie, Sankhya, etc.).
 */

const crypto = require('crypto');
const { run, all, get } = require('../db');

const SCHEMA_VERSION = '1.0.0';

function limpaDoc(doc) {
  if (!doc) return null;
  return String(doc).replace(/\D/g, '');
}

function filtrarPorData(itens = [], campoData = 'createdAt', desde = null) {
  if (!desde) return itens;
  const tsDesde = new Date(desde).getTime();
  if (isNaN(tsDesde)) return itens;
  return itens.filter(item => {
    const val = item[campoData] || item.atualizadoEm || item.criadoEm || item.abertura || item.data;
    if (!val) return true;
    return new Date(val).getTime() >= tsDesde;
  });
}

function aplicarPaginacao(itens = [], limit = 50, cursor = null) {
  const lim = Math.max(1, Math.min(Number(limit) || 50, 200));
  let startIndex = 0;
  if (cursor) {
    const foundIdx = itens.findIndex(i => String(i.id) === String(cursor));
    if (foundIdx !== -1) startIndex = foundIdx + 1;
  }
  const paginados = itens.slice(startIndex, startIndex + lim);
  const nextCursor = paginados.length === lim && startIndex + lim < itens.length
    ? paginados[paginados.length - 1].id
    : null;

  return { items: paginados, count: paginados.length, total: itens.length, nextCursor };
}

function exportarClientes({ state, desde = null, limit = 50, cursor = null }) {
  const raw = filtrarPorData(state?.clientes || [], 'atualizadoEm', desde);
  const canonicos = raw.map(c => {
    const docLimpo = limpaDoc(c.doc || c.documento);
    return {
      id: c.id,
      erpSyncId: `cli_${c.id}`,
      schemaVersion: SCHEMA_VERSION,
      razaoSocial: c.nome,
      nomeFantasia: c.nomeFantasia || c.nome,
      tipoPessoa: docLimpo && docLimpo.length === 11 ? 'F' : 'J',
      cpfCnpj: docLimpo,
      inscricaoEstadual: c.ie || null,
      telefone: limpaDoc(c.fone),
      email: c.email || null,
      endereco: c.endereco || null,
      cidade: c.cidade || null,
      uf: c.uf || null,
      cep: limpaDoc(c.cep),
      ativo: !c.inativo && !c.anonimizado,
      atualizadoEm: c.atualizadoEm || c.criadoEm || new Date().toISOString()
    };
  });
  return aplicarPaginacao(canonicos, limit, cursor);
}

function exportarFornecedores({ state, desde = null, limit = 50, cursor = null }) {
  const raw = filtrarPorData(state?.suppliers || state?.fornecedores || [], 'updatedAt', desde);
  const canonicos = raw.map(f => ({
    id: f.id,
    erpSyncId: `forn_${f.id}`,
    schemaVersion: SCHEMA_VERSION,
    razaoSocial: f.name || f.nome,
    nomeFantasia: f.tradeName || f.nomeFantasia || f.name || f.nome,
    cnpj: limpaDoc(f.document || f.cnpj),
    inscricaoEstadual: f.stateRegistration || f.ie || null,
    telefone: limpaDoc(f.phone || f.fone),
    email: f.email || null,
    cidade: f.city || f.cidade || null,
    uf: f.state || f.uf || null,
    atualizadoEm: f.updatedAt || f.createdAt || new Date().toISOString()
  }));
  return aplicarPaginacao(canonicos, limit, cursor);
}

function exportarPecas({ state, desde = null, limit = 50, cursor = null }) {
  const raw = filtrarPorData(state?.pecas || [], 'updatedAt', desde);
  const canonicos = raw.map(p => ({
    id: p.id,
    erpSyncId: `pec_${p.id}`,
    schemaVersion: SCHEMA_VERSION,
    codigo: p.codigo || p.cod || p.id,
    codigoInterno: p.codigo || p.cod || p.id,
    sku: p.sku || p.codigo || p.id,
    descricao: p.nome,
    categoria: p.categoria || 'Geral',
    ncm: p.ncm || '8708.29.99',
    unidadeMedida: p.un || 'UN',
    precoCustoMedio: Number(p.custoMedio || p.custo || 0),
    custoMedio: Number(p.custoMedio || p.custo || 0),
    precoVendaSugerido: Number(p.preco || p.precoVenda || p.valor || 0),
    precoVenda: Number(p.preco || p.precoVenda || p.valor || 0),
    estoqueAtual: Number(p.estoque || p.qtd || 0),
    estoqueMinimo: Number(p.estoqueMin || 0),
    localizacao: p.localizacao || p.prateleira || null,
    atualizadoEm: p.updatedAt || new Date().toISOString()
  }));
  return aplicarPaginacao(canonicos, limit, cursor);
}

function exportarOrdensServico({ state, desde = null, status = 'finalizada', limit = 50, cursor = null }) {
  let list = state?.os || [];
  if (status && status !== 'todas') {
    list = list.filter(o => o.st === status);
  }
  const raw = filtrarPorData(list, 'fechamento', desde);
  const veiculos = new Map((state?.veiculos || []).map(v => [v.id, v]));

  const canonicos = raw.map(o => {
    const vei = veiculos.get(o.vei) || {};
    const totServ = (o.servicos || []).reduce((acc, s) => acc + ((Number(s.qtd) || 1) * (Number(s.valor || s.preco) || 0)), 0);
    const totPec = (o.pecas || []).reduce((acc, p) => acc + ((Number(p.qtd) || 1) * (Number(p.valor || p.preco) || 0)), 0);

    return {
      id: o.id,
      erpSyncId: `os_${o.id}`,
      schemaVersion: SCHEMA_VERSION,
      numeroOS: o.num,
      clienteId: o.cli,
      veiculo: {
        id: o.vei,
        placa: vei.placa || o.placa || 'N/I',
        modelo: vei.modelo || null,
        kmEntrada: o.km || vei.km || null
      },
      status: o.st,
      dataAbertura: o.abertura,
      dataFechamento: o.fechamento || null,
      totalServicos: totServ,
      totalPecas: totPec,
      totalGeral: o.total || (totServ + totPec),
      formaPagamentoSugerida: o.formaPagamento || 'faturado_boleto',
      itensServico: (o.servicos || []).map(s => ({
        id: s.id,
        nome: s.nome,
        quantidade: Number(s.qtd) || 1,
        valorUnitario: Number(s.valor || s.preco) || 0,
        subtotal: (Number(s.qtd) || 1) * (Number(s.valor || s.preco) || 0)
      })),
      itensPeca: (o.pecas || []).map(p => ({
        id: p.id,
        nome: p.nome,
        codigo: p.cod || null,
        quantidade: Number(p.qtd) || 1,
        valorUnitario: Number(p.valor || p.preco) || 0,
        subtotal: (Number(p.qtd) || 1) * (Number(p.valor || p.preco) || 0)
      }))
    };
  });
  return aplicarPaginacao(canonicos, limit, cursor);
}

function exportarContas({ state, desde = null, tipo = null, limit = 50, cursor = null }) {
  let list = state?.contas || [];
  if (tipo) {
    list = list.filter(c => c.tipo === tipo);
  }
  const raw = filtrarPorData(list, 'data', desde);
  const canonicos = raw.map(c => ({
    id: c.id,
    erpSyncId: `cta_${c.id}`,
    schemaVersion: SCHEMA_VERSION,
    tipo: c.tipo || 'pagar',
    natureza: (c.tipo === 'receber') ? 'RECEITA' : 'DESPESA',
    regime: 'CAIXA_GERENCIAL',
    descricao: c.desc || c.descricao || 'Título Financeiro',
    favorecidoOuPagador: c.favorecido || c.pagador || 'N/I',
    categoria: c.cat || 'Geral',
    valor: Number(c.valor || 0),
    dataEmissao: c.data || new Date().toISOString().slice(0, 10),
    dataVencimento: c.vencimento || c.data,
    dataLiquidacao: c.liquidacao || c.pagamento || null,
    status: c.status || c.st || (c.liquidacao || c.pagamento ? 'liquidado' : 'aberto'),
    documentoOrigem: c.osNum ? `OS #${c.osNum}` : (c.pedidoNum ? `Pedido #${c.pedidoNum}` : null)
  }));
  return aplicarPaginacao(canonicos, limit, cursor);
}

function exportarPedidosCompra({ state, desde = null, limit = 50, cursor = null }) {
  const list = state?.purchaseOrders || [];
  const raw = filtrarPorData(list, 'createdAt', desde);
  const canonicos = raw.map(po => ({
    id: po.id,
    erpSyncId: `ped_${po.id}`,
    schemaVersion: SCHEMA_VERSION,
    numeroPedido: po.orderNumber || po.id,
    fornecedorId: po.supplierId,
    status: po.status,
    valorTotal: Number(po.totalAmount || 0),
    chaveNfeEntrada: po.nfeKey || null,
    dataPedido: po.createdAt,
    dataRecebimento: po.receivedAt || null,
    itens: (po.items || []).map(i => ({
      partId: i.partId,
      descricao: i.name,
      quantidade: Number(i.quantity) || 1,
      precoUnitario: Number(i.unitCost || i.unitPrice) || 0,
      subtotal: (Number(i.quantity) || 1) * (Number(i.unitCost || i.unitPrice) || 0)
    }))
  }));
  return aplicarPaginacao(canonicos, limit, cursor);
}

async function enfileirarParaERP({ tenantId, entityType, entityId, action = 'created', payload = {} }) {
  if (!tenantId || !entityType || !entityId) {
    throw new Error('Parâmetros obrigatórios: tenantId, entityType, entityId.');
  }
  const outboxId = `out_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
  const now = new Date().toISOString();
  const idempotencyKey = payload.idempotencyKey || `${tenantId}:${entityType}:${entityId}:${action}:${Date.now()}`;

  await run(`INSERT INTO erp_outbox (
    id, tenant_id, entity_type, entity_id, action, payload_json, status, attempts, idempotency_key, created_at
  ) VALUES (?, ?, ?, ?, ?, ?, 'pending', 0, ?, ?)`, [
    outboxId, tenantId, entityType, entityId, action, JSON.stringify(payload), idempotencyKey, now
  ]);

  return { ok: true, outboxId, idempotencyKey };
}

async function registrarSincronizacao({ tenantId, entityType, entityId, erpExternalId = null, status = 'synced', errorMessage = null }) {
  const now = new Date().toISOString();
  await run(`UPDATE erp_outbox 
    SET status = ?, last_error = ?, synced_at = ?, attempts = attempts + 1,
        locked_by = NULL, locked_at = NULL, locked_until = NULL
    WHERE tenant_id = ? AND entity_type = ? AND entity_id = ?`, [
    status, errorMessage, now, tenantId, entityType, entityId
  ]);
  return { ok: true, syncedAt: now };
}

async function obterStatusIntegracao({ tenantId }) {
  const pendentesRow = await get(`SELECT COUNT(*) as total FROM erp_outbox WHERE tenant_id = ? AND status = 'pending'`, [tenantId]);
  const sincronizadosRow = await get(`SELECT COUNT(*) as total FROM erp_outbox WHERE tenant_id = ? AND status = 'synced'`, [tenantId]);
  const errosRow = await get(`SELECT COUNT(*) as total FROM erp_outbox WHERE tenant_id = ? AND status = 'failed'`, [tenantId]);
  const processandoRow = await get(`SELECT COUNT(*) as total FROM erp_outbox WHERE tenant_id = ? AND status = 'processing'`, [tenantId]);
  const ultimoSync = await get(`SELECT synced_at FROM erp_outbox WHERE tenant_id = ? AND status = 'synced' ORDER BY synced_at DESC LIMIT 1`, [tenantId]);

  return {
    tenantId,
    schemaVersion: SCHEMA_VERSION,
    outbox: {
      pendentes: pendentesRow ? pendentesRow.total : 0,
      sincronizados: sincronizadosRow ? sincronizadosRow.total : 0,
      erros: errosRow ? errosRow.total : 0,
      processando: processandoRow ? processandoRow.total : 0,
      ultimoSincronismo: ultimoSync ? ultimoSync.synced_at : null
    }
  };
}

async function listarItensOutbox({ tenantId, status = null, limit = 50, offset = 0 }) {
  const lim = Math.max(1, Math.min(Number(limit) || 50, 200));
  const off = Math.max(0, Number(offset) || 0);
  let sql = 'SELECT * FROM erp_outbox WHERE tenant_id = ?';
  const params = [tenantId];

  if (status) {
    sql += ' AND status = ?';
    params.push(status);
  }

  sql += ' ORDER BY created_at ASC LIMIT ? OFFSET ?';
  params.push(lim, off);

  const rows = await all(sql, params);
  return (rows || []).map(r => ({
    id: r.id,
    tenantId: r.tenant_id,
    entityType: r.entity_type,
    entityId: r.entity_id,
    action: r.action,
    payload: JSON.parse(r.payload_json || '{}'),
    status: r.status,
    attempts: r.attempts,
    lastError: r.last_error,
    lockedBy: r.locked_by,
    lockedAt: r.locked_at,
    lockedUntil: r.locked_until,
    idempotencyKey: r.idempotency_key,
    syncedAt: r.synced_at,
    createdAt: r.created_at
  }));
}

async function reprocessarItemOutbox({ outboxId }) {
  if (!outboxId) throw new Error('outboxId é obrigatório.');
  await run(`UPDATE erp_outbox SET status = 'pending', last_error = NULL, locked_by = NULL, locked_at = NULL, locked_until = NULL WHERE id = ?`, [outboxId]);
  return { ok: true, outboxId };
}

async function adquirirProximoItemOutbox({ workerId = `worker_${crypto.randomBytes(4).toString('hex')}`, leaseSeconds = 60, tenantId = null, maxAttempts = 5, excludeIds = [] } = {}) {
  let sql = `SELECT id, tenant_id, entity_type, entity_id, action, payload_json, status, attempts, last_error, locked_by, locked_at, locked_until, idempotency_key, created_at 
             FROM erp_outbox 
             WHERE attempts < ? 
               AND (status IN ('pending', 'failed') OR (status = 'processing' AND (locked_until IS NULL OR datetime(locked_until) <= datetime('now'))))`;
  const params = [maxAttempts];

  if (tenantId && tenantId !== '_all_') {
    sql += ' AND tenant_id = ?';
    params.push(tenantId);
  }

  if (Array.isArray(excludeIds) && excludeIds.length > 0) {
    sql += ` AND id NOT IN (${excludeIds.map(() => '?').join(',')})`;
    params.push(...excludeIds);
  }

  sql += ' ORDER BY created_at ASC LIMIT 10';

  const candidates = await all(sql, params);
  for (const cand of candidates) {
    const lockRes = await run(
      `UPDATE erp_outbox 
       SET status = 'processing', 
           locked_by = ?, 
           locked_at = datetime('now'), 
           locked_until = datetime('now', '+' || ? || ' seconds')
       WHERE id = ? 
         AND (status IN ('pending', 'failed') OR (status = 'processing' AND (locked_until IS NULL OR datetime(locked_until) <= datetime('now'))))`,
      [workerId, leaseSeconds, cand.id]
    );

    if (lockRes.changes === 1) {
      return {
        id: cand.id,
        tenantId: cand.tenant_id,
        entityType: cand.entity_type,
        entityId: cand.entity_id,
        action: cand.action,
        payload: JSON.parse(cand.payload_json || '{}'),
        status: 'processing',
        attempts: cand.attempts,
        lastError: cand.last_error,
        lockedBy: workerId,
        leaseSeconds,
        idempotencyKey: cand.idempotency_key,
        createdAt: cand.created_at
      };
    }
  }

  return null;
}

async function finalizarItemOutbox({ outboxId, workerId, status = 'synced', errorMessage = null, incrementAttempts = true } = {}) {
  if (!outboxId || !workerId) {
    throw new Error('Parâmetros obrigatórios: outboxId, workerId.');
  }
  const now = new Date().toISOString();

  const attemptsClause = incrementAttempts ? 'attempts = attempts + 1,' : '';

  const updateRes = await run(
    `UPDATE erp_outbox 
     SET status = ?, 
         last_error = ?, 
         ${attemptsClause}
         synced_at = CASE WHEN ? = 'synced' THEN ? ELSE synced_at END, 
         locked_by = NULL, 
         locked_at = NULL, 
         locked_until = NULL 
     WHERE id = ? 
       AND locked_by = ? 
       AND datetime(locked_until) >= datetime('now')`,
    [status, errorMessage, status, now, outboxId, workerId]
  );

  if (updateRes.changes === 0) {
    throw new Error(`CONCURRENCY_ERROR: O lease do item ${outboxId} expirou ou foi assumido por outro worker.`);
  }

  return { ok: true, outboxId, status, syncedAt: status === 'synced' ? now : null };
}

async function processarFilaOutbox({ tenantId = null, maxAttempts = 5, dispatcherFn = null, workerId = null, leaseSeconds = 60, batchLimit = 100 } = {}) {
  const currentWorkerId = workerId || `worker_${crypto.randomBytes(4).toString('hex')}`;
  let processados = 0;
  let falhas = 0;
  let total = 0;
  const seenIds = [];

  while (seenIds.length < batchLimit) {
    const item = await adquirirProximoItemOutbox({
      workerId: currentWorkerId,
      leaseSeconds,
      tenantId,
      maxAttempts,
      excludeIds: seenIds
    });

    if (!item) {
      break;
    }

    seenIds.push(item.id);
    total++;

    if (typeof dispatcherFn !== 'function') {
      await run(
        `UPDATE erp_outbox 
         SET status = 'failed', 
             last_error = 'CONFIG_MISSING: Nenhum despachante/integrador ERP configurado', 
             locked_by = NULL, 
             locked_at = NULL, 
             locked_until = NULL 
         WHERE id = ? AND locked_by = ?`,
        [item.id, currentWorkerId]
      );
      falhas++;
      continue;
    }

    try {
      await dispatcherFn({
        id: item.id,
        tenantId: item.tenantId,
        entityType: item.entityType,
        entityId: item.entityId,
        action: item.action,
        payload: item.payload,
        idempotencyKey: item.idempotencyKey || `idemp_${item.id}`
      });

      await finalizarItemOutbox({
        outboxId: item.id,
        workerId: currentWorkerId,
        status: 'synced',
        errorMessage: null,
        incrementAttempts: true
      });
      processados++;
    } catch (err) {
      falhas++;
      try {
        await finalizarItemOutbox({
          outboxId: item.id,
          workerId: currentWorkerId,
          status: 'failed',
          errorMessage: err.message || 'Erro no envio ao ERP',
          incrementAttempts: true
        });
      } catch (finErr) {
        console.warn(`[ERP Outbox] Falha ao finalizar item ${item.id}: ${finErr.message}`);
      }
    }
  }

  return { total, processados, falhas };
}

module.exports = {
  SCHEMA_VERSION,
  exportarClientes,
  exportarFornecedores,
  exportarPecas,
  exportarOrdensServico,
  exportarContas,
  exportarPedidosCompra,
  enfileirarParaERP,
  registrarSincronizacao,
  obterStatusIntegracao,
  listarItensOutbox,
  reprocessarItemOutbox,
  adquirirProximoItemOutbox,
  finalizarItemOutbox,
  processarFilaOutbox
};
