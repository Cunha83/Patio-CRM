const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.join(__dirname, 'patio.db');

let db;

function openDB() {
  return new Promise((resolve, reject) => {
    db = new sqlite3.Database(dbPath, (err) => {
      if (err) return reject(err);
      db.run('PRAGMA journal_mode = WAL;');
      db.run('PRAGMA busy_timeout = 5000;');
      db.run('PRAGMA synchronous = NORMAL;');
      resolve();
    });
  });
}

function initDB() {
  return new Promise(async (resolve, reject) => {
    try {
      if (!db) await openDB();
      db.run(`CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT)`, (err) => {
        if (err) return reject(err);
        resolve();
      });
    } catch (e) {
      reject(e);
    }
  });
}

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
}

function closeDB() {
  return new Promise((resolve, reject) => {
    if (!db) return resolve();
    db.close((err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('[DB] Fechando banco de dados...');
  await closeDB().catch(e => console.error('[DB] Erro ao fechar:', e));
  process.exit(0);
});
process.on('SIGTERM', async () => {
  await closeDB().catch(e => console.error('[DB] Erro ao fechar:', e));
  process.exit(0);
});

module.exports = { initDB, run, get, all, closeDB };
