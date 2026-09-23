'use strict';

const { get, run, all, transaction } = require('../../db');
const { validateState, createWriteQueue } = require('../core');
const { metrics } = require('../metrics');

class PersistenceError extends Error {
  constructor(message, { status = 500, conflict = false, versao = null, cause = null, result = null } = {}) {
    super(message || 'Falha na persistência de estado.');
    this.name = 'PersistenceError';
    this.status = status;
    this.conflict = conflict;
    this.versao = versao;
    this.cause = cause;
    this.result = result;
  }
}

const tenantStates = new Map();
const tenantRevisionMemory = new Map();
const tenantWriteQueues = new Map();

function getTenantWriteQueue(tenantId) {
  const tid = (tenantId || 'default').trim();
  if (!tenantWriteQueues.has(tid)) {
    tenantWriteQueues.set(tid, createWriteQueue());
  }
  return tenantWriteQueues.get(tid);
}

function isValidTenantId(id) {
  if (!id || typeof id !== 'string') return false;
  return /^[a-zA-Z0-9_-]{3,64}$/.test(id.trim());
}

function storageKey(tenantId) {
  if (!isValidTenantId(tenantId)) {
    throw new Error(`TenantId inválido: "${tenantId}". Identificadores devem conter apenas letras, números, hífens e underscores (3 a 64 caracteres).`);
  }
  return `tenant:${tenantId.trim()}:state`;
}

function nextRevision(tenantId, currentVersao = 0) {
  const lastRev = tenantRevisionMemory.get(tenantId) || 0;
  const next = Math.max(Date.now(), lastRev + 1, (currentVersao || 0) + 1);
  tenantRevisionMemory.set(tenantId, next);
  return next;
}

function getDefaultState(tenantId = 'default') {
  return {
    versao: 0,
    schemaVersion: 1,
    cfg: {
      empresa: 'Oficina Padrão',
      equipe: { jornadaPadraoHoras: 8 },
      precificacao: {
        margemAlvoPadrao: 35,
        margemMinimaPadrao: 20,
        amostraMinimaHistorico: 5,
        confianca: { mediaMinimo: 5, altaMinimo: 10 },
        protecaoMargem: { modo: 'alertar' },
        margensPorCategoria: {}
      },
      identidadeVisual: {
        logo: null,
        imagemInstitucional: null
      },
      assistente: {
        displayName: 'Verônica',
        voiceGender: 'female',
        enabled: true,
        briefingDiarioAtivo: false,
        briefingDiarioHorario: '07:30',
        briefingDiarioDias: ['segunda', 'terca', 'quarta', 'quinta', 'sexta'],
        briefingSemanalAtivo: false,
        briefingSemanalDia: 'segunda',
        briefingSemanalHorario: '08:00',
        briefingDestinatarios: 'gestores'
      },
      crm: {
        clienteInativoDias: 180,
        alertaKmPercentual: 10,
        alertaDias: 15
      },
      manutencaoPreventiva: {
        alertaDias: 15,
        alertaKm: 1000,
        alertaKmPercentual: 10
      },
      posVenda: {
        enabled: true,
        contatos: [
          { dias: 2, diasAposEntrega: 2, tipo: 'verificacao_servico' },
          { dias: 7, diasAposEntrega: 7, tipo: 'acompanhamento' },
          { dias: 30, diasAposEntrega: 30, tipo: 'relacionamento' }
        ]
      }
    },
    os: [],
    veiculos: [],
    clientes: [],
    boxes: [],
    contas: [],
    pecas: [],
    servicos: [],
    movimentos: [],
    auditoria: [],
    preOS: [],
    intakeSessions: [],
    operationalEvents: [],
    operationalSnapshots: [],
    inspections: [],
    quotations: [],
    inventoryMovements: [],
    partRequirements: [],
    purchaseQuotes: [],
    purchaseOrders: [],
    suppliers: [],
    workers: [],
    laborEntries: [],
    pricingOverrides: [],
    fleets: [],
    maintenancePlans: [],
    opportunities: [],
    appointments: [],
    afterSales: []
  };
}

async function getState(tenantId) {
  const t0 = performance.now();
  if (!isValidTenantId(tenantId)) return null;
  const key = storageKey(tenantId);
  if (tenantStates.has(tenantId)) {
    const result = JSON.parse(JSON.stringify(tenantStates.get(tenantId)));
    metrics.recordRepoRead({
      latencyMs: performance.now() - t0,
      success: true,
      cacheHit: true,
      tenantId
    });
    return result;
  }

  let row;
  try {
    row = await get('SELECT value FROM kv WHERE key = ?', [key]);
    if (!row && (tenantId === 'default' || tenantId === 'state')) {
      row = await get("SELECT value FROM kv WHERE key = 'state'");
    }
    if (!row) {
      row = await get('SELECT value FROM kv WHERE key = ?', [`state:${tenantId}`]);
    }
  } catch (err) {
    metrics.recordRepoRead({
      latencyMs: performance.now() - t0,
      success: false,
      cacheHit: false,
      tenantId,
      error: err.message
    });
    throw err;
  }

  if (!row || !row.value) {
    metrics.recordRepoRead({
      latencyMs: performance.now() - t0,
      success: true,
      cacheHit: false,
      tenantId
    });
    return null;
  }

  try {
    const parsed = JSON.parse(row.value);
    tenantStates.set(tenantId, parsed);
    tenantRevisionMemory.set(tenantId, parsed.versao || 0);
    metrics.recordRepoRead({
      latencyMs: performance.now() - t0,
      success: true,
      cacheHit: false,
      tenantId
    });
    return JSON.parse(JSON.stringify(parsed));
  } catch (e) {
    console.error(`[StateRepository] Erro ao parsear JSON do tenant ${tenantId}:`, e.message);
    metrics.recordRepoRead({
      latencyMs: performance.now() - t0,
      success: false,
      cacheHit: false,
      tenantId,
      error: 'json_parse_error'
    });
    return null;
  }
}

async function persistState(contextOrTenantId, incomingState, options = {}) {
  const t0 = performance.now();

  let context = contextOrTenantId;
  let enqueueWrite = options?.enqueueWrite || (async (fn) => await fn());

  if (typeof contextOrTenantId === 'string') {
    const ctxOverride = typeof options === 'object' && options !== null ? options : {};
    context = {
      tenantId: contextOrTenantId,
      role: ctxOverride.role || 'tenant_admin',
      permissions: ctxOverride.permissions || ['*'],
      channel: ctxOverride.channel || 'internal'
    };
    if (typeof ctxOverride.enqueueWrite === 'function') {
      enqueueWrite = ctxOverride.enqueueWrite;
    }
  }

  const { tenantId, permissions = [] } = context || {};
  if (!isValidTenantId(tenantId)) {
    throw new Error('TenantId inválido no contexto de segurança.');
  }

  const errVal = validateState(incomingState);
  if (errVal) {
    metrics.recordRepoWrite({
      latencyMs: performance.now() - t0,
      success: false,
      status: 400,
      tenantId,
      error: errVal
    });
    return { ok: false, status: 400, error: errVal };
  }

  return await enqueueWrite(async () => {
    const current = await getState(tenantId);
    const expectedVersao = incomingState.versao || 0;
    const currentVersao = current?.versao || 0;

    const isForced = options?.force === true;
    if (!isForced && current && expectedVersao !== currentVersao) {
      metrics.recordRepoWrite({
        latencyMs: performance.now() - t0,
        success: false,
        conflict: true,
        status: 409,
        tenantId,
        error: 'version_conflict_409'
      });
      return { ok: false, status: 409, conflict: true, versao: currentVersao, error: 'Conflito de versão detectado: o estado foi modificado concorrentemente.' };
    }

    const stateToSave = JSON.parse(JSON.stringify(incomingState));
    // A substituição HTTP do estado exige autorização por entidade. Mutações
    // dos serviços continuam usando suas próprias permissões e comandos.
    if (options.authorizeReplacement && !permissions.includes('*')) {
      const visible = filterStateByRole(current || getDefaultState(tenantId), context);
      const same = require('node:util').isDeepStrictEqual;
      for (const [field, permission] of [['os', 'os:write'], ['clientes', 'crm:write'], ['veiculos', 'crm:write']]) {
        let comparison = incomingState[field] || [];
        // Compatibilidade com o apontamento de andamento no painel do mecânico:
        // somente status de OS existentes, sem permitir criação ou exclusão.
        if (field === 'os' && context.role === 'mecanico' && permissions.includes('labor:write')) {
          const allowedStatus = ['fila', 'executando', 'peca', 'aprovacao', 'finalizada'];
          comparison = comparison.map(o => {
            const previous = (visible.os || []).find(x => x.id === o.id);
            if (!previous || !allowedStatus.includes(o.st)) return o;
            const normalized = { ...o };
            if (Object.hasOwn(previous, 'st')) normalized.st = previous.st;
            else delete normalized.st;
            return normalized;
          });
        }
        if (!permissions.includes(permission) && !same(comparison, visible[field] || [])) {
          return { ok: false, status: 403, error: `Permissão necessária: ${permission}.` };
        }
      }
      if (!permissions.includes('os:delete')) {
        const ids = new Set((incomingState.os || []).map(o => o.id));
        if ((current?.os || []).some(o => !ids.has(o.id))) {
          return { ok: false, status: 403, error: 'Permissão necessária: os:delete.' };
        }
      }
    }
    delete stateToSave._excluidos;
    delete stateToSave.user;
    delete stateToSave.perfil;
    if (stateToSave.ui) {
      delete stateToSave.ui.perfilAtivo;
    }

    // ── PROTEÇÃO DE CAMPOS ADMINISTRATIVOS & RBAC EFETIVO ──
    const isAdmin = permissions.includes('admin:settings') || permissions.includes('*') || context.role === 'admin' || context.role === 'tenant_admin';
    const canWriteFinancial = permissions.includes('financial:write') || permissions.includes('*') || isAdmin || context.role === 'financeiro';

    // 1. Configurações da empresa (somente admin pode alterar)
    if (!isAdmin) {
      if (current && current.cfg) {
        stateToSave.cfg = JSON.parse(JSON.stringify(current.cfg));
      } else {
        delete stateToSave.cfg;
      }
    }

    // 1.1 Assinatura SaaS da Plataforma (inquilino não pode alterar seu próprio plano via POST de estado)
    const isPlatformAdmin = context.role === 'platform_admin' || context.role === 'system';
    if (!isPlatformAdmin) {
      if (current && current.subscription) {
        stateToSave.subscription = JSON.parse(JSON.stringify(current.subscription));
      } else {
        delete stateToSave.subscription;
      }
    }

    // 2. Dados Financeiros Sensíveis (apenas financeiro ou admin podem alterar)
    if (!canWriteFinancial && current) {
      if (current.financeiro) stateToSave.financeiro = JSON.parse(JSON.stringify(current.financeiro));
      if (current.contas) stateToSave.contas = JSON.parse(JSON.stringify(current.contas));
      if (current.movimentos) stateToSave.movimentos = JSON.parse(JSON.stringify(current.movimentos));
      if (current.pricingOverrides) stateToSave.pricingOverrides = JSON.parse(JSON.stringify(current.pricingOverrides));
      if (current.caixa) stateToSave.caixa = JSON.parse(JSON.stringify(current.caixa));
      if (current.quotations) stateToSave.quotations = JSON.parse(JSON.stringify(current.quotations));

      // Reconciliação não-destrutiva de campos financeiros em OS
      if (Array.isArray(stateToSave.os)) {
        for (const o of stateToSave.os) {
          if (!o || typeof o !== 'object') continue;
          const orig = Array.isArray(current.os) ? current.os.find(x => x && x.id === o.id) : null;
          if (orig) {
            if (orig.total !== undefined) o.total = orig.total;
            if (orig.desc !== undefined) o.desc = orig.desc;
            if (orig.desconto !== undefined) o.desconto = orig.desconto;
            if (orig.orcamento !== undefined) o.orcamento = JSON.parse(JSON.stringify(orig.orcamento));
            if (orig.faturamento !== undefined) o.faturamento = orig.faturamento;
            if (orig.contasReceber !== undefined) o.contasReceber = orig.contasReceber;

            // Reconciliação estrita de serviços por ID
            if (Array.isArray(o.servicos)) {
              for (const s of o.servicos) {
                if (!s || typeof s !== 'object') continue;
                let origS = null;
                if (s.id && Array.isArray(orig.servicos)) {
                  origS = orig.servicos.find(x => x && x.id === s.id);
                } else if (!s.id && s.nome && Array.isArray(orig.servicos)) {
                  // Fallback somente quando nenhum dos dois lados possui ID estável
                  const matches = orig.servicos.filter(x => x && !x.id && x.nome === s.nome);
                  if (matches.length === 1) origS = matches[0];
                }

                if (origS) {
                  o.servicos = o.servicos;
                  if (origS.valor !== undefined) s.valor = origS.valor;
                  if (origS.custo !== undefined) s.custo = origS.custo;
                  if (origS.subtotal !== undefined) s.subtotal = origS.subtotal;
                } else {
                  // Item novo adicionado por operador sem permissão financeira:
                  // NÃO aceitar valores financeiros injetados no payload
                  delete s.valor;
                  delete s.custo;
                  delete s.subtotal;
                  // Se existir no catálogo autorizado de serviços, preenche a partir dele
                  const catS = Array.isArray(current.servicos) ? current.servicos.find(x => x && (x.id === s.id || x.nome === s.nome)) : null;
                  if (catS) {
                    s.valor = catS.valor || 0;
                    s.custo = catS.custo || 0;
                    s.subtotal = (Number(s.qtd) || 1) * (catS.valor || 0);
                  }
                }
              }
            }

            // Reconciliação estrita de peças por ID
            if (Array.isArray(o.pecas)) {
              for (const p of o.pecas) {
                if (!p || typeof p !== 'object') continue;
                let origP = null;
                if (p.id && Array.isArray(orig.pecas)) {
                  origP = orig.pecas.find(x => x && x.id === p.id);
                } else if (!p.id && p.codigo && Array.isArray(orig.pecas)) {
                  const matches = orig.pecas.filter(x => x && !x.id && x.codigo === p.codigo);
                  if (matches.length === 1) origP = matches[0];
                }

                if (origP) {
                  if (origP.valor !== undefined) p.valor = origP.valor;
                  if (origP.custo !== undefined) p.custo = origP.custo;
                  if (origP.venda !== undefined) p.venda = origP.venda;
                  if (origP.margem !== undefined) p.margem = origP.margem;
                  if (origP.subtotal !== undefined) p.subtotal = origP.subtotal;
                } else {
                  // Peça nova injetada por operador sem permissão financeira:
                  delete p.valor;
                  delete p.custo;
                  delete p.venda;
                  delete p.margem;
                  delete p.subtotal;
                  const catP = Array.isArray(current.pecas) ? current.pecas.find(x => x && (x.id === p.id || (p.codigo && x.codigo === p.codigo))) : null;
                  if (catP) {
                    p.valor = catP.venda || 0;
                    p.custo = catP.custo || 0;
                    p.venda = catP.venda || 0;
                    p.subtotal = (Number(p.qtd) || 1) * (catP.venda || 0);
                  }
                }
              }
            }
          } else {
            // Nova OS inserida por operador sem permissão financeira:
            // Não aceita valores totais injetados
            delete o.total;
            delete o.desc;
            delete o.desconto;
            delete o.orcamento;
            delete o.faturamento;
            delete o.contasReceber;
            if (Array.isArray(o.servicos)) {
              for (const s of o.servicos) {
                if (s && typeof s === 'object') {
                  delete s.valor;
                  delete s.custo;
                  delete s.subtotal;
                  const catS = Array.isArray(current.servicos) ? current.servicos.find(x => x && (x.id === s.id || x.nome === s.nome)) : null;
                  if (catS) {
                    s.valor = catS.valor || 0;
                    s.custo = catS.custo || 0;
                    s.subtotal = (Number(s.qtd) || 1) * (catS.valor || 0);
                  }
                }
              }
            }
            if (Array.isArray(o.pecas)) {
              for (const p of o.pecas) {
                if (p && typeof p === 'object') {
                  delete p.valor;
                  delete p.custo;
                  delete p.venda;
                  delete p.margem;
                  delete p.subtotal;
                  const catP = Array.isArray(current.pecas) ? current.pecas.find(x => x && (x.id === p.id || (p.codigo && x.codigo === p.codigo))) : null;
                  if (catP) {
                    p.valor = catP.venda || 0;
                    p.custo = catP.custo || 0;
                    p.venda = catP.venda || 0;
                    p.subtotal = (Number(p.qtd) || 1) * (catP.venda || 0);
                  }
                }
              }
            }
          }
        }
      }

      // Reconciliação não-destrutiva de peças de estoque
      if (Array.isArray(stateToSave.pecas) && Array.isArray(current.pecas)) {
        for (const p of stateToSave.pecas) {
          if (!p || typeof p !== 'object') continue;
          const origP = current.pecas.find(x => x && ((p.id && x.id === p.id) || (x.codigo && p.codigo && x.codigo === p.codigo)));
          if (origP) {
            if (origP.custo !== undefined) p.custo = origP.custo;
            if (origP.venda !== undefined) p.venda = origP.venda;
            if (origP.margem !== undefined) p.margem = origP.margem;
          } else {
            delete p.custo;
            delete p.venda;
            delete p.margem;
          }
        }
      }

      // Catálogo de serviços: operador sem permissão não altera valores
      if (Array.isArray(stateToSave.servicos) && Array.isArray(current.servicos)) {
        for (const s of stateToSave.servicos) {
          if (!s || typeof s !== 'object') continue;
          const origS = current.servicos.find(x => x && ((s.id && x.id === s.id) || (x.nome && s.nome && x.nome === s.nome)));
          if (origS) {
            if (origS.valor !== undefined) s.valor = origS.valor;
            if (origS.custo !== undefined) s.custo = origS.custo;
          } else {
            delete s.valor;
            delete s.custo;
          }
        }
      }
    }

    // 3. Catálogo de Compras & Fornecedores (mecânico não pode limpar ou sobrescrever compras internas)
    if (context.role === 'mecanico' && current) {
      if (current.suppliers) stateToSave.suppliers = JSON.parse(JSON.stringify(current.suppliers));
      if (current.purchaseQuotes) stateToSave.purchaseQuotes = JSON.parse(JSON.stringify(current.purchaseQuotes));
      if (current.purchaseOrders) stateToSave.purchaseOrders = JSON.parse(JSON.stringify(current.purchaseOrders));
    }

    // 4. Trilha de Auditoria Imutável (estritamente append-only para TODOS, incluindo admin)
    if (Array.isArray(stateToSave.auditoria)) {
      const auditAtual = Array.isArray(current?.auditoria) ? current.auditoria : [];
      const auditNovos = stateToSave.auditoria.filter(a => a && a.id && !auditAtual.some(existing => existing.id === a.id));
      const allAudit = [...auditNovos, ...auditAtual];
      if (allAudit.length > 1000) {
        const overflow = allAudit.slice(1000);
        // Arquiva no security_audit_log dentro de transação para garantir persistência antes do corte
        await transaction(async () => {
          for (const item of overflow) {
            if (item && item.id) {
              const archId = `arch_${tenantId}_${item.id}`;
              await run(`INSERT OR IGNORE INTO security_audit_log (
                id, tenant_id, actor_id, actor_type, action, entity, entity_id, ip_address, details_json, created_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
                archId,
                tenantId,
                String(item.usuario || item.actorId || 'operador'),
                'client_operational',
                String(item.acao || item.action || 'STATE_AUDIT_ARCHIVE'),
                String(item.entidade || item.entity || 'state'),
                item.entidadeId || item.entityId ? String(item.entidadeId || item.entityId) : null,
                item.ip || null,
                JSON.stringify(item.detalhes || item.details || item),
                item.data || item.createdAt || new Date().toISOString()
              ]);
            }
          }
        });
        stateToSave.auditoria = allAudit.slice(0, 1000);
      } else {
        stateToSave.auditoria = allAudit;
      }
    }

    const revision = nextRevision(tenantId, currentVersao);
    stateToSave.versao = revision;

    const key = storageKey(tenantId);
    const jsonStr = JSON.stringify(stateToSave);

    // Persistência Transacional: escreve no SQLite ANTES de atualizar a memória
    try {
      await run('INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)', [key, jsonStr]);
    } catch (dbErr) {
      metrics.recordRepoWrite({
        latencyMs: performance.now() - t0,
        success: false,
        status: 500,
        tenantId,
        error: dbErr.message
      });
      throw dbErr;
    }

    // Publica no cache em memória somente após commit bem-sucedido
    tenantStates.set(tenantId, stateToSave);

    metrics.recordRepoWrite({
      latencyMs: performance.now() - t0,
      success: true,
      status: 200,
      tenantId
    });

    return {
      ok: true,
      status: 200,
      versao: revision,
      state: JSON.parse(JSON.stringify(stateToSave))
    };
  });
}

/**
 * Executa uma mutação atômica no estado do tenant garantindo que a leitura,
 * a modificação e a persistência ocorram dentro da fila de escrita (enqueueWrite),
 * eliminando a condição de corrida de "lost update".
 *
 * @param {Object} context - Contexto de segurança (tenantId, actorId, permissions, etc.)
 * @param {Function} mutatorFn - Função: (stateDraft, currentState) => stateDraft | void
 * @param {Object} options - Opções (enqueueWrite, etc.)
 */
async function mutateState(context, mutatorFn, options = {}) {
  const tenantId = context?.tenantId || 'default';
  let enqueueWrite = options?.enqueueWrite;
  if (typeof options === 'function') {
    enqueueWrite = options;
  }
  if (typeof enqueueWrite !== 'function') {
    enqueueWrite = getTenantWriteQueue(tenantId);
  }

  return await enqueueWrite(async () => {
    const current = (await getState(tenantId)) || getDefaultState(tenantId);
    const draft = JSON.parse(JSON.stringify(current));
    const result = await mutatorFn(draft, current);
    if (result === false || (result && result.abort)) {
      return {
        ok: false,
        aborted: true,
        status: result?.status || result?.resultado?.status,
        error: result?.error || result?.resultado?.error || 'Mutação cancelada.',
        mutatorResult: result
      };
    }
    const stateToSave = (result && typeof result === 'object' && !Array.isArray(result) && (result.os || result.veiculos || result.clientes || result.boxes)) ? result : draft;
    stateToSave.versao = current?.versao || 0;
    const saveResult = await persistState(context, stateToSave, { ...options, force: true, enqueueWrite });
    return { ...saveResult, mutatorResult: result };
  });
}

function clearMemoryCache(tenantId = null) {
  if (tenantId) {
    tenantStates.delete(tenantId);
    tenantRevisionMemory.delete(tenantId);
    tenantWriteQueues.delete(tenantId);
  } else {
    tenantStates.clear();
    tenantRevisionMemory.clear();
    tenantWriteQueues.clear();
  }
}

function filterStateByRole(state, context = null) {
  if (!state || typeof state !== 'object') return state;
  if (!context) return state;

  const perms = context.permissions || [];
  const role = context.role;
  const isPrivileged = perms.includes('*') || ['admin', 'tenant_admin', 'service_admin', 'platform_admin', 'platform_support'].includes(role);
  if (isPrivileged) {
    return state;
  }

  const filtered = JSON.parse(JSON.stringify(state));

  // 1. Financeiro: quem não tem financial:read não recebe movimentações, contas ou saldos
  if (!perms.includes('financial:read') && role !== 'financeiro') {
    filtered.financeiro = { faturamentoTotal: 0, custosTotal: 0, margemOperacional: 0, movimentos: [], contas: [], resumo: {} };
    filtered.contas = [];
    filtered.movimentos = [];
    filtered.pricingOverrides = [];
    if (filtered.caixa) {
      filtered.caixa = { saldo: 0, entradas: 0, saidas: 0 };
    }

    // Oculta estritamente valores financeiros de OS para perfis operacionais
    if (Array.isArray(filtered.os)) {
      filtered.os = filtered.os.map(o => {
        if (!o || typeof o !== 'object') return o;
        const safe = { ...o };
        delete safe.total;
        delete safe.desc;
        delete safe.desconto;
        delete safe.orcamento;
        delete safe.faturamento;
        delete safe.contasReceber;
        if (Array.isArray(safe.servicos)) {
          safe.servicos = safe.servicos.map(s => {
            if (!s || typeof s !== 'object') return s;
            const cs = { ...s };
            delete cs.valor;
            delete cs.custo;
            delete cs.subtotal;
            return cs;
          });
        }
        if (Array.isArray(safe.pecas)) {
          safe.pecas = safe.pecas.map(p => {
            if (!p || typeof p !== 'object') return p;
            const cp = { ...p };
            delete cp.valor;
            delete cp.custo;
            delete cp.venda;
            delete cp.margem;
            delete cp.subtotal;
            return cp;
          });
        }
        return safe;
      });
    }

    // Oculta custos e preços de venda do catálogo de peças no estoque
    if (Array.isArray(filtered.pecas)) {
      filtered.pecas = filtered.pecas.map(p => {
        if (!p || typeof p !== 'object') return p;
        const cp = { ...p };
        delete cp.custo;
        delete cp.venda;
        delete cp.margem;
        delete cp.preco;
        delete cp.valor;
        delete cp.precoVenda;
        delete cp.custoMedio;
        delete cp.subtotal;
        return cp;
      });
    }

    // Oculta valores e custos do catálogo de serviços geral
    if (Array.isArray(filtered.servicos)) {
      filtered.servicos = filtered.servicos.map(s => {
        if (!s || typeof s !== 'object') return s;
        const cs = { ...s };
        delete cs.valor;
        delete cs.custo;
        delete cs.subtotal;
        return cs;
      });
    }

    // Oculta orçamentos comerciais e seus subtotais/valores
    if (!perms.includes('quotation:read')) {
      filtered.quotations = [];
    } else if (Array.isArray(filtered.quotations)) {
      filtered.quotations = filtered.quotations.map(q => {
        if (!q || typeof q !== 'object') return q;
        const cq = { ...q };
        delete cq.totalGeral;
        delete cq.descontoGeral;
        delete cq.subtotal;
        delete cq.valor;
        delete cq.margemLucro;
        const itensKey = Array.isArray(cq.itens) ? 'itens' : (Array.isArray(cq.items) ? 'items' : null);
        if (itensKey) {
          cq[itensKey] = cq[itensKey].map(it => {
            if (!it || typeof it !== 'object') return it;
            const cit = { ...it };
            delete cit.valor;
            delete cit.custo;
            delete cit.subtotal;
            delete cit.total;
            return cit;
          });
        }
        return cq;
      });
    }

    // Oculta valores em apontamentos e requisições de peças
    if (Array.isArray(filtered.partRequirements)) {
      filtered.partRequirements = filtered.partRequirements.map(pr => {
        if (!pr || typeof pr !== 'object') return pr;
        const cpr = { ...pr };
        delete cpr.custoEstimado;
        delete cpr.valorEstimado;
        delete cpr.custo;
        delete cpr.valor;
        delete cpr.subtotal;
        return cpr;
      });
    }

    if (Array.isArray(filtered.laborEntries)) {
      filtered.laborEntries = filtered.laborEntries.map(le => {
        if (!le || typeof le !== 'object') return le;
        const cle = { ...le };
        delete cle.valorHora;
        delete cle.custoHora;
        delete cle.total;
        delete cle.custo;
        return cle;
      });
    }
  }

  // 2. Configurações da Empresa: remover dados bancários e segredos de API para operadores sem admin:settings
  if (!perms.includes('admin:settings') && role !== 'gerente') {
    if (filtered.cfg && typeof filtered.cfg === 'object') {
      delete filtered.cfg.apiKeyExterna;
      delete filtered.cfg.apiKey;
      delete filtered.cfg.asaasApiKey;
      delete filtered.cfg.geminiApiKey;
      delete filtered.cfg.token;
      if (filtered.cfg.empresa && typeof filtered.cfg.empresa === 'object') {
        delete filtered.cfg.empresa.chavePix;
        delete filtered.cfg.empresa.banco;
        delete filtered.cfg.empresa.agencia;
        delete filtered.cfg.empresa.conta;
      }
    }
  }

  // 3. Trilha de auditoria: restrita a administradores
  if (!perms.includes('admin:settings') && !perms.includes('audit:read')) {
    filtered.auditoria = [];
  }

  // 4. Mecânico: restringe dados de fornecedores e compras internas
  if (role === 'mecanico') {
    filtered.suppliers = [];
    filtered.purchaseQuotes = [];
    filtered.purchaseOrders = [];
  }

  return filtered;
}

module.exports = {
  PersistenceError,
  isValidTenantId,
  storageKey,
  getState,
  loadState: getState,
  getDefaultState,
  persistState,
  mutateState,
  getTenantWriteQueue,
  clearMemoryCache,
  nextRevision,
  filterStateByRole
};
