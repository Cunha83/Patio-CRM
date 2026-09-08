const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'patio.db');
const db = new sqlite3.Database(dbPath);

function initDB() {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      // Tabelas principais para a IA (Estoque e Financeiro)
      db.run(`CREATE TABLE IF NOT EXISTS pecas (
        id TEXT PRIMARY KEY,
        cod TEXT,
        nome TEXT,
        un TEXT,
        qtd INTEGER,
        custo REAL,
        venda REAL,
        forn TEXT
      )`);

      db.run(`CREATE TABLE IF NOT EXISTS contas (
        id TEXT PRIMARY KEY,
        tipo TEXT,
        desc TEXT,
        parte TEXT,
        valor REAL,
        venc TEXT,
        pago BOOLEAN
      )`);
      
      resolve();
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

module.exports = { db, initDB, all, run };
