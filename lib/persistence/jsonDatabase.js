'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const DEFAULT_DATA_DIR = path.resolve(__dirname, '../../data');

function getDataDir() {
  if (process.env.DATA_DIR) return process.env.DATA_DIR;
  if (process.env.NODE_ENV === 'test') {
    if (!global.__testDataDir) {
      global.__testDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'patio-test-data-'));
    }
    return global.__testDataDir;
  }
  return DEFAULT_DATA_DIR;
}

function getDataFile() {
  if (process.env.DATA_FILE) return process.env.DATA_FILE;
  return path.join(getDataDir(), 'database.json');
}

let writeLock = Promise.resolve();

function garantirDiretorio(dir = getDataDir()) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function extrairColecoes(state) {
  const s = state || {};
  return {
    _timestamp: new Date().toISOString(),
    _versao: s.versao || 1,
    tenant_config: s.cfg || {},
    boxes: Array.isArray(s.boxes) ? s.boxes : [],
    ordens_servico: Array.isArray(s.os) ? s.os : [],
    clientes: Array.isArray(s.clientes) ? s.clientes : [],
    fornecedores: Array.isArray(s.fornecedores) ? s.fornecedores : (Array.isArray(s.suppliers) ? s.suppliers : []),
    transportadores: Array.isArray(s.transportadores) ? s.transportadores : [],
    produtos_servicos: {
      pecas: Array.isArray(s.pecas) ? s.pecas : [],
      servicos: Array.isArray(s.servicos) ? s.servicos : []
    },
    kardex_movimentacoes: Array.isArray(s.kardex_movimentacoes) ? s.kardex_movimentacoes : (Array.isArray(s.inventoryMovements) ? s.inventoryMovements : []),
    financeiro_lancamentos: {
      contas: Array.isArray(s.contas) ? s.contas : [],
      movimentos: Array.isArray(s.movimentos) ? s.movimentos : [],
      pix_transacoes: Array.isArray(s.pix_transacoes) ? s.pix_transacoes : []
    },
    compras: Array.isArray(s.compras) ? s.compras : (Array.isArray(s.purchaseOrders) ? s.purchaseOrders : []),
    notas_fiscais: Array.isArray(s.notas_fiscais) ? s.notas_fiscais : [],
    usuarios: Array.isArray(s.usuarios) ? s.usuarios : [],
    auditoria: Array.isArray(s.auditoria) ? s.auditoria : []
  };
}

function salvarSnapshotDatabase(state) {
  const dataDir = getDataDir();
  const dbFile = getDataFile();
  garantirDiretorio(dataDir);
  const colecoes = extrairColecoes(state);
  const jsonStr = JSON.stringify(colecoes, null, 2);

  writeLock = writeLock.then(() => {
    return new Promise((resolve) => {
      try {
        const tempFile = path.join(dataDir, `database.${Date.now()}.${Math.random().toString(36).slice(2, 8)}.tmp`);
        fs.writeFileSync(tempFile, jsonStr, 'utf8');
        fs.renameSync(tempFile, dbFile);
      } catch (err) {
        console.warn(`[JSON_DATABASE] Aviso ao persistir ${dbFile}:`, err.message);
      }
      resolve();
    });
  });

  return writeLock;
}

function carregarSnapshotDatabase() {
  const dbFile = getDataFile();
  try {
    if (fs.existsSync(dbFile)) {
      const content = fs.readFileSync(dbFile, 'utf8');
      return JSON.parse(content);
    }
  } catch (err) {
    console.warn(`[JSON_DATABASE] Aviso ao ler ${dbFile}:`, err.message);
  }
  return null;
}

module.exports = {
  get DATA_DIR() { return getDataDir(); },
  get DB_FILE() { return getDataFile(); },
  getDataDir,
  getDataFile,
  salvarSnapshotDatabase,
  carregarSnapshotDatabase,
  extrairColecoes
};
