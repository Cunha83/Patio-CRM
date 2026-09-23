'use strict';

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const { AsyncLocalStorage } = require('async_hooks');

const txStorage = new AsyncLocalStorage();
let _spCounter = 0;

let db = null;
let currentDbPath = null;
let opening = null;
let closing = false;
const activeTxConnections = new Set();

function getDbPath() {
  if (process.env.DB_PATH) return validateDbPath(process.env.DB_PATH);
  if (process.env.NODE_ENV === 'test' || process.env.NODE_TEST_CONTEXT) {
    throw new Error('[DB_GUARD] Tentativa de executar teste contra o banco real patio.db! Defina process.env.DB_PATH antes de inicializar o banco.');
  }
  return path.join(__dirname, 'patio.db');
}

function validateDbPath(value) {
  const resolved = path.resolve(value);
  if (process.env.NODE_ENV === 'test' || process.env.NODE_TEST_CONTEXT) {
    const canonical = p => fs.existsSync(p) ? fs.realpathSync(p).toLowerCase() : path.resolve(p).toLowerCase();
    const real = path.join(__dirname, 'patio.db');
    if (canonical(resolved) === canonical(real)) throw new Error('[DB_GUARD] Banco real proibido em testes.');
    if (fs.existsSync(real) && fs.existsSync(resolved)) {
      const a = fs.statSync(real), b = fs.statSync(resolved);
      if (a.ino && a.ino === b.ino && a.dev === b.dev) throw new Error('[DB_GUARD] Alias do banco real proibido em testes.');
    }
  }
  return require('./lib/security/testPaths').assertTestResourcePath(resolved,'banco');
}

function createConnection(targetPath) {
  return new Promise((resolve, reject) => {
    const conn = new sqlite3.Database(targetPath, (err) => {
      if (err) return reject(err);
      conn.run('PRAGMA journal_mode = WAL;', (err1) => {
        if (err1) return conn.close(() => reject(err1));
        conn.run('PRAGMA busy_timeout = 5000;', (err2) => {
          if (err2) return conn.close(() => reject(err2));
          conn.run('PRAGMA synchronous = FULL;', (err3) => {
            if (err3) return conn.close(() => reject(err3));
            resolve(conn);
          });
        });
      });
    });
  });
}

function closeConn(conn) {
  return new Promise((resolve) => {
    if (!conn) return resolve();
    conn.close(() => resolve());
  });
}

function execConn(conn, method, sql, params = []) {
  return new Promise((resolve, reject) => {
    if (method === 'run') {
      conn.run(sql, params, function (err) {
        if (err) reject(err);
        else resolve({ lastID: this.lastID, changes: this.changes });
      });
    } else if (method === 'get') {
      conn.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    } else if (method === 'all') {
      conn.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    } else {
      reject(new Error(`Método SQLite inválido: ${method}`));
    }
  });
}

async function openDB(customPath = null) {
  if (closing) throw new Error('Banco em desligamento.');
  const targetPath=validateDbPath(customPath || getDbPath());
  if(opening) await opening;
  if(db && currentDbPath===targetPath)return;
  if(db) await closeDB();
  opening=(async()=>{db=await createConnection(targetPath);currentDbPath=targetPath;})();
  try { await opening; } finally { opening=null; }
}

async function initDB(customPath = null) {
  await openDB(customPath);
  await run('CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT)');

  // 1. Autenticação Persistente & RBAC
  await run(`CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    password_salt TEXT NOT NULL,
    password_algo TEXT DEFAULT 'scrypt',
    name TEXT,
    phone TEXT,
    status TEXT DEFAULT 'active',
    failed_login_attempts INTEGER DEFAULT 0,
    locked_until TEXT,
    must_change_password INTEGER DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`);

  await run(`CREATE TABLE IF NOT EXISTS memberships (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    tenant_id TEXT NOT NULL,
    role TEXT NOT NULL,
    permissions_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(user_id, tenant_id)
  )`);

  await run(`CREATE TABLE IF NOT EXISTS user_sessions (
    token_id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    tenant_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    revoked_at TEXT
  )`);

  await run(`CREATE TABLE IF NOT EXISTS password_resets (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    used_at TEXT
  )`);

  // 2. Termos de Uso e LGPD
  await run(`CREATE TABLE IF NOT EXISTS terms_consents (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    tenant_id TEXT,
    terms_version TEXT NOT NULL,
    privacy_version TEXT NOT NULL,
    ip_address TEXT,
    user_agent TEXT,
    accepted_at TEXT NOT NULL
  )`);

  // 3. Billing & Cobrança Durável
  await run(`CREATE TABLE IF NOT EXISTS billing_customers (
    tenant_id TEXT PRIMARY KEY,
    provider TEXT NOT NULL,
    provider_customer_id TEXT,
    legal_name TEXT,
    document TEXT,
    email TEXT,
    phone TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`);

  await run(`CREATE TABLE IF NOT EXISTS billing_subscriptions (
    tenant_id TEXT PRIMARY KEY,
    plan TEXT NOT NULL,
    status TEXT NOT NULL,
    billing_cycle TEXT DEFAULT 'mensal',
    price REAL NOT NULL,
    setup_fee REAL DEFAULT 0,
    setup_fee_paid INTEGER DEFAULT 0,
    setup_fee_exempt INTEGER DEFAULT 0,
    provider TEXT NOT NULL,
    provider_subscription_id TEXT,
    started_at TEXT NOT NULL,
    trial_ends_at TEXT,
    current_period_start TEXT,
    current_period_end TEXT,
    cancel_at_period_end INTEGER DEFAULT 0,
    cancelled_at TEXT,
    cancellation_reason TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`);

  await run(`CREATE TABLE IF NOT EXISTS billing_events (
    provider_event_id TEXT PRIMARY KEY,
    provider TEXT NOT NULL,
    event_type TEXT NOT NULL,
    tenant_id TEXT,
    amount REAL,
    status TEXT,
    payload_hash TEXT NOT NULL,
    raw_payload TEXT,
    processed_at TEXT NOT NULL
  )`);

  await run(`CREATE TABLE IF NOT EXISTS billing_invoices (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    provider_invoice_id TEXT,
    amount REAL NOT NULL,
    status TEXT NOT NULL,
    payment_method TEXT,
    paid_at TEXT,
    created_at TEXT NOT NULL
  )`);

  // 4. Backups SQLite WAL
  await run(`CREATE TABLE IF NOT EXISTS backups (
    id TEXT PRIMARY KEY,
    tenant_id TEXT,
    type TEXT NOT NULL,
    filepath TEXT NOT NULL,
    size_bytes INTEGER,
    checksum_sha256 TEXT NOT NULL,
    status TEXT NOT NULL,
    executed_by TEXT,
    created_at TEXT NOT NULL,
    details_json TEXT
  )`);

  // 5. Camada de Integração ERP Outbox
  await run(`CREATE TABLE IF NOT EXISTS erp_outbox (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    action TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    attempts INTEGER DEFAULT 0,
    last_error TEXT,
    locked_by TEXT,
    locked_at TEXT,
    locked_until TEXT,
    idempotency_key TEXT,
    synced_at TEXT,
    created_at TEXT NOT NULL
  )`);
  try { await run('ALTER TABLE erp_outbox ADD COLUMN locked_by TEXT'); } catch (_) {}
  try { await run('ALTER TABLE erp_outbox ADD COLUMN locked_at TEXT'); } catch (_) {}
  try { await run('ALTER TABLE erp_outbox ADD COLUMN locked_until TEXT'); } catch (_) {}
  try { await run('ALTER TABLE erp_outbox ADD COLUMN idempotency_key TEXT'); } catch (_) {}

  // 6. Trilha de Auditoria de Segurança Imutável
  await run(`CREATE TABLE IF NOT EXISTS security_audit_log (
    id TEXT PRIMARY KEY,
    tenant_id TEXT,
    actor_id TEXT,
    actor_type TEXT,
    action TEXT NOT NULL,
    entity TEXT,
    entity_id TEXT,
    ip_address TEXT,
    details_json TEXT,
    created_at TEXT NOT NULL
  )`);

  // 7. Módulo Fiscal Autônomo (NF-e, NFS-e, NFC-e)
  await run(`CREATE TABLE IF NOT EXISTS fiscal_settings (
    tenant_id TEXT PRIMARY KEY,
    ambiente TEXT DEFAULT 'homologacao',
    provider TEXT DEFAULT 'mock_homologacao',
    provider_token_encrypted TEXT,
    cert_a1_encrypted TEXT,
    cert_password_encrypted TEXT,
    cnpj TEXT,
    razao_social TEXT,
    nome_fantasia TEXT,
    inscricao_estadual TEXT,
    inscricao_municipal TEXT,
    regime_tributario TEXT DEFAULT 'simples_nacional',
    cnae_principal TEXT,
    codigo_municipio_ibge TEXT,
    uf TEXT,
    nfe_serie INTEGER DEFAULT 1,
    nfe_proximo_numero INTEGER DEFAULT 1,
    nfse_serie TEXT DEFAULT '1',
    nfse_proximo_numero INTEGER DEFAULT 1,
    nfce_serie INTEGER DEFAULT 1,
    nfce_proximo_numero INTEGER DEFAULT 1,
    regras_tributarias_json TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`);

  await run(`CREATE TABLE IF NOT EXISTS fiscal_documents (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    modelo TEXT NOT NULL,
    tipo_operacao TEXT NOT NULL DEFAULT 'saida',
    serie TEXT NOT NULL,
    numero INTEGER DEFAULT 0,
    ambiente TEXT NOT NULL,
    status TEXT NOT NULL,
    origem_tipo TEXT,
    origem_id TEXT,
    idempotency_key TEXT UNIQUE NOT NULL,
    destinatario_json TEXT NOT NULL,
    itens_json TEXT NOT NULL,
    totais_json TEXT NOT NULL,
    impostos_json TEXT NOT NULL,
    chave_acesso TEXT,
    protocolo_autorizacao TEXT,
    data_autorizacao TEXT,
    xml_oficial TEXT,
    danfe_url TEXT,
    mensagem_erro TEXT,
    codigo_status_sefaz TEXT,
    motivo_status_sefaz TEXT,
    reforma_tributaria_json TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`);

  await run(`CREATE TABLE IF NOT EXISTS fiscal_events (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    fiscal_document_id TEXT NOT NULL,
    tipo_evento TEXT NOT NULL,
    sequencial INTEGER DEFAULT 1,
    protocolo TEXT,
    justificativa TEXT,
    detalhes_json TEXT,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY(fiscal_document_id) REFERENCES fiscal_documents(id)
  )`);

  await run(`CREATE TABLE IF NOT EXISTS fiscal_numbering_ledger (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    modelo TEXT NOT NULL,
    serie TEXT NOT NULL,
    ambiente TEXT NOT NULL,
    ultimo_numero INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL,
    UNIQUE(tenant_id, modelo, serie, ambiente)
  )`);

  await run(`CREATE INDEX IF NOT EXISTS idx_fisc_doc_tenant_status ON fiscal_documents(tenant_id, status)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_fisc_doc_origem ON fiscal_documents(tenant_id, origem_tipo, origem_id)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_fisc_events_doc ON fiscal_events(fiscal_document_id)`);
  await run(`CREATE UNIQUE INDEX IF NOT EXISTS uq_fisc_doc_num ON fiscal_documents(tenant_id, modelo, serie, numero, ambiente) WHERE numero > 0`);
  await run(`CREATE TABLE IF NOT EXISTS fiscal_attempts (
    id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, document_id TEXT NOT NULL,
    operation TEXT NOT NULL, status TEXT NOT NULL, started_at TEXT NOT NULL,
    finished_at TEXT, result_json TEXT
  )`);
  await transaction(async () => {
  await run('CREATE TABLE IF NOT EXISTS fiscal_migrations(version TEXT PRIMARY KEY, applied_at TEXT NOT NULL)');
  const fiscalColumns = new Set((await all('PRAGMA table_info(fiscal_documents)')).map(c => c.name));
  for (const [name, type] of Object.entries({ pdf_auxiliar: 'BLOB', pdf_sha256: 'TEXT', numero_oficial: 'TEXT', config_snapshot_json: 'TEXT', provider_payload_json: 'TEXT', reviewed_at: 'TEXT', reviewed_by: 'TEXT', xml_sha256: 'TEXT', xml_path: 'TEXT', operation_id: 'TEXT', operation_started_at: 'TEXT' })) {
    if (!fiscalColumns.has(name)) await run(`ALTER TABLE fiscal_documents ADD COLUMN ${name} ${type}`);
  }
  await run('INSERT OR IGNORE INTO fiscal_migrations(version,applied_at) VALUES(?,?)',['2026-09-fiscal-safety-v1',new Date().toISOString()]);
  });
}

async function run(sql, params = []) {
  const tx = txStorage.getStore();
  if (tx) {
    return tx.run(sql, params);
  }
  if (closing) throw new Error('Banco em desligamento.');
  if (!db) await openDB();
  return execConn(db, 'run', sql, params);
}

async function get(sql, params = []) {
  const tx = txStorage.getStore();
  if (tx) {
    return tx.get(sql, params);
  }
  if (closing) throw new Error('Banco em desligamento.');
  if (!db) await openDB();
  return execConn(db, 'get', sql, params);
}

async function all(sql, params = []) {
  const tx = txStorage.getStore();
  if (tx) {
    return tx.all(sql, params);
  }
  if (closing) throw new Error('Banco em desligamento.');
  if (!db) await openDB();
  return execConn(db, 'all', sql, params);
}

async function closeDB() {
  if (txStorage.getStore()) throw new Error('Não feche o banco dentro de uma transação.');
  closing = true;
  try {
  if (opening) await opening;
  await _txLock;
  for (const conn of activeTxConnections) {
    await closeConn(conn);
  }
  activeTxConnections.clear();

  if (db) {
    const cur = db;
    db = null;
    currentDbPath = null;
    await closeConn(cur);
  } else {
    currentDbPath = null;
  }
  } finally { closing = false; }
}

let _txLock = Promise.resolve();

async function transaction(fn) {
  const parentTx = txStorage.getStore();
  if (parentTx) {
    if (parentTx.nestedActive) throw new Error('Transações aninhadas concorrentes não são permitidas.');
    parentTx.nestedActive = true;
    const spName = `sp_${++_spCounter}`;
    try {
      await parentTx.run(`SAVEPOINT ${spName}`);
      const childTx = {...parentTx,nestedActive:false};
      const res = await txStorage.run(childTx,()=>fn(childTx));
      await parentTx.run(`RELEASE ${spName}`);
      return res;
    } catch (err) {
      await parentTx.run(`ROLLBACK TO ${spName}`).catch(() => {});
      await parentTx.run(`RELEASE ${spName}`).catch(() => {});
      throw err;
    } finally { parentTx.nestedActive = false; }
  }
  if(closing) throw new Error('Banco em desligamento.');

  const runRootTx = async () => {
    const targetPath = currentDbPath || getDbPath();
    const txConn = await createConnection(targetPath);
    activeTxConnections.add(txConn);

    const txObj = {
      conn: txConn,
      run: (sql, params = []) => execConn(txConn, 'run', sql, params),
      get: (sql, params = []) => execConn(txConn, 'get', sql, params),
      all: (sql, params = []) => execConn(txConn, 'all', sql, params)
    };

    return txStorage.run(txObj, async () => {
      try {
        await txObj.run('BEGIN IMMEDIATE');
        const res = await fn(txObj);
        await txObj.run('COMMIT');
        return res;
      } catch (err) {
        await txObj.run('ROLLBACK').catch(() => {});
        throw err;
      } finally {
        activeTxConnections.delete(txConn);
        await closeConn(txConn);
      }
    });
  };

  const next = _txLock.then(runRootTx, runRootTx);
  _txLock = next.catch(() => {});
  return next;
}

function withIndependentContext(fn) {
  return txStorage.run(null, fn);
}

function runIndependent(sql, params = []) {
  return withIndependentContext(() => run(sql, params));
}

function getIndependent(sql, params = []) {
  return withIndependentContext(() => get(sql, params));
}

function allIndependent(sql, params = []) {
  return withIndependentContext(() => all(sql, params));
}

module.exports = {
  initDB,
  run,
  get,
  all,
  transaction,
  withIndependentContext,
  runIndependent,
  getIndependent,
  allIndependent,
  txStorage,
  closeDB,
  getDbPath,
  openDB
};
