'use strict';

const { isValidTenantId, storageKey } = require('./stateRepository');

/**
 * Migração idempotente para chaves legadas na tabela kv do SQLite
 */
async function migrarBancoLegado({ db, dryRun = true }) {
  const relatorio = {
    dryRun,
    totalChavesAnalisadas: 0,
    chavesIdentificadas: [],
    migracoesPlanejadas: [],
    ambiguidades: [],
    concluido: false
  };

  const rows = await new Promise((resolve, reject) => {
    db.all('SELECT key, length(value) as len FROM kv', [], (err, res) => {
      if (err) return reject(err);
      resolve(res || []);
    });
  });

  relatorio.totalChavesAnalisadas = rows.length;

  for (const row of rows) {
    const k = row.key;
    relatorio.chavesIdentificadas.push({ key: k, length: row.len });

    // Caso 1: Chave já migrada canonicamente
    if (k.startsWith('tenant:') && k.endsWith(':state')) {
      continue;
    }

    // Caso 2: Chave 'state' legada da instalação single-tenant
    if (k === 'state') {
      relatorio.migracoesPlanejadas.push({
        origem: 'state',
        destino: 'tenant:default:state',
        acao: 'renomear',
        nota: 'Migração de tenant padrão único para namespace canônico tenant:default:state'
      });
      continue;
    }

    // Caso 3: Chave corrompida com duplicação de prefixo 'state:state' ou 'state:state...'
    if (k.startsWith('state:state')) {
      const resto = k.replace(/^state:state/, '');
      const tenantTarget = resto ? resto : 'default';
      relatorio.ambiguidades.push({
        chave: k,
        tipo: 'PREFIXO_CORROMPIDO',
        detalhes: `Chave legada com prefixo duplicado "${k}". Requer decisão manual para não colidir.`
      });
      continue;
    }

    // Caso 4: Chaves legadas com prefixo 'state:<slug>'
    if (k.startsWith('state:')) {
      const slug = k.slice(6);
      if (isValidTenantId(slug)) {
        relatorio.migracoesPlanejadas.push({
          origem: k,
          destino: storageKey(slug),
          acao: 'renomear',
          nota: `Migração de chave legada prefixada para ${storageKey(slug)}`
        });
      } else {
        relatorio.ambiguidades.push({
          chave: k,
          tipo: 'SLUG_INVALIDO',
          detalhes: `Identificador "${slug}" contém caracteres não permitidos.`
        });
      }
    }
  }

  // Executa apenas se não for dry-run e não houver ambiguidades críticas
  if (!dryRun) {
    if (relatorio.ambiguidades.length > 0) {
      throw new Error(`Migração abortada: foram encontradas ${relatorio.ambiguidades.length} ambiguidades de chaves. Resolva-as antes de prosseguir.`);
    }

    await new Promise((resolve, reject) => {
      db.serialize(async () => {
        db.run('BEGIN TRANSACTION');
        try {
          for (const m of relatorio.migracoesPlanejadas) {
            db.run(
              'INSERT OR REPLACE INTO kv (key, value) SELECT ?, value FROM kv WHERE key = ?',
              [m.destino, m.origem]
            );
            db.run('DELETE FROM kv WHERE key = ?', [m.origem]);
          }
          db.run('COMMIT', (err) => {
            if (err) reject(err);
            else resolve();
          });
        } catch (e) {
          db.run('ROLLBACK');
          reject(e);
        }
      });
    });
  }

  relatorio.concluido = true;
  return relatorio;
}

/**
 * Migração estrutural idempotente de esquema do estado na memória / repositório
 */
function migrarSchemaEstado(state) {
  if (!state || typeof state !== 'object') return { migrado: false, erro: 'Estado inválido' };

  let migrado = false;
  const versaoInicial = state.schemaVersion || 0;

  if (versaoInicial < 1) {
    if (!state.cfg) state.cfg = {};
    if (!state.cfg.identidadeVisual) {
      state.cfg.identidadeVisual = { logo: null, imagemInstitucional: null };
    }
    if (!state.cfg.assistente) {
      state.cfg.assistente = { displayName: 'Verônica', voiceGender: 'female', voiceURI: '', voiceName: '', pitch: 1.0, rate: 1.0, enabled: true };
    }
    if (!state.cfg.manutencaoPreventiva) {
      state.cfg.manutencaoPreventiva = { alertaDias: 15, alertaKm: 1000, alertaKmPercentual: 10 };
    }
    if (!state.cfg.posVenda) {
      state.cfg.posVenda = {
        enabled: true,
        contatos: [
          { dias: 2, diasAposEntrega: 2, tipo: 'verificacao_servico' },
          { dias: 7, diasAposEntrega: 7, tipo: 'acompanhamento' },
          { dias: 30, diasAposEntrega: 30, tipo: 'relacionamento' }
        ]
      };
    }

    const canonicalCollections = [
      'os', 'veiculos', 'clientes', 'pecas', 'servicos', 'fornecedores', 'contas',
      'movimentos', 'boxes', 'auditoria', 'preOS', 'intakeSessions', 'operationalEvents',
      'operationalSnapshots', 'inspections', 'quotations', 'inventoryMovements',
      'partRequirements', 'purchaseQuotes', 'purchaseOrders', 'suppliers', 'workers',
      'laborEntries', 'pricingOverrides', 'fleets', 'maintenancePlans', 'opportunities',
      'appointments', 'afterSales'
    ];

    for (const col of canonicalCollections) {
      if (!Array.isArray(state[col])) {
        state[col] = [];
      }
    }

    state.schemaVersion = 1;
    migrado = true;
  }

  return {
    migrado,
    versaoAnterior: versaoInicial,
    schemaVersion: state.schemaVersion
  };
}

module.exports = {
  migrarBancoLegado,
  migrarSchemaEstado
};
