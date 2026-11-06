'use strict';

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
    const isoUtc = new Date(Date.UTC(ano, mes - 1, dia, hora + 3, min, 0));
    return isNaN(isoUtc.getTime()) ? null : isoUtc;
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

module.exports = {
  parseDataHora
};
