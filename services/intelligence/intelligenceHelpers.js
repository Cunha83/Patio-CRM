'use strict';

const crypto = require('crypto');

function gerarId(prefix = 'ope') {
  return `${prefix}_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
}

function parseDataHora(dataStr, horaStr = '08:00') {
  if (!dataStr) return null;
  if (dataStr instanceof Date) return dataStr;
  const s = String(dataStr).trim();
  if (s.includes('T')) {
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const h = horaStr && /^\d{1,2}:\d{2}$/.test(horaStr.trim()) ? horaStr.trim() : '08:00';
    const [ano, mes, dia] = s.split('-').map(Number);
    const [hora, min] = h.split(':').map(Number);
    // Cria em UTC-3 / São Paulo
    const isoUtc = new Date(Date.UTC(ano, mes - 1, dia, hora + 3, min, 0));
    return isNaN(isoUtc.getTime()) ? null : isoUtc;
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function calcularHorasPassadas(inicio, agora) {
  if (!inicio || !agora) return 0;
  const diffMs = agora.getTime() - inicio.getTime();
  return Math.max(0, diffMs / (1000 * 60 * 60));
}

function registrarAuditoria(state, entrada) {
  if (!state.auditoria) state.auditoria = [];
  state.auditoria.unshift({
    id: gerarId('aud'),
    timestamp: new Date().toISOString(),
    ...entrada
  });
  if (state.auditoria.length > 500) {
    state.auditoria = state.auditoria.slice(0, 500);
  }
}

module.exports = {
  gerarId,
  parseDataHora,
  calcularHorasPassadas,
  registrarAuditoria
};
