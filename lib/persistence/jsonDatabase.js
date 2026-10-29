'use strict';

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.resolve(__dirname, '../../data');
const DB_FILE = path.join(DATA_DIR, 'database.json');

let writeLock = Promise.resolve();

function garantirDiretorio() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
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
  garantirDiretorio();
  const colecoes = extrairColecoes(state);
  const jsonStr = JSON.stringify(colecoes, null, 2);

  writeLock = writeLock.then(() => {
    return new Promise((resolve) => {
      try {
        const tempFile = path.join(DATA_DIR, `database.${Date.now()}.${Math.random().toString(36).slice(2, 8)}.tmp`);
        fs.writeFileSync(tempFile, jsonStr, 'utf8');
        fs.renameSync(tempFile, DB_FILE);
      } catch (err) {
        console.warn('[JSON_DATABASE] Aviso ao persistir data/database.json:', err.message);
      }
      resolve();
    });
  });

  return writeLock;
}

function carregarSnapshotDatabase() {
  try {
    if (fs.existsSync(DB_FILE)) {
      const content = fs.readFileSync(DB_FILE, 'utf8');
      return JSON.parse(content);
    }
  } catch (err) {
    console.warn('[JSON_DATABASE] Aviso ao ler data/database.json:', err.message);
  }
  return null;
}

module.exports = {
  DATA_DIR,
  DB_FILE,
  salvarSnapshotDatabase,
  carregarSnapshotDatabase,
  extrairColecoes
};

