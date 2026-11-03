'use strict';

/**
 * Normaliza número de quilometragem a partir de texto
 * Ex: "82 mil", "82.000", "82000", "128 mil km" -> 82000 / 128000
 */
function normalizarKm(val) {
  if (typeof val === 'number') return Math.round(val);
  if (!val) return null;
  const str = String(val).toLowerCase().replace(/\s+/g, ' ').trim();
  const matchMil = str.match(/(\d+(?:[.,]\d+)?)\s*(?:mil|k)\b/i);
  if (matchMil) {
    const num = parseFloat(matchMil[1].replace(',', '.'));
    return Math.round(num * 1000);
  }
  const digits = str.replace(/\D/g, '');
  return digits ? parseInt(digits, 10) : null;
}

/**
 * Normaliza placa veicular brasileira (Mercosul ou Antiga)
 */
function normalizarPlaca(val) {
  if (!val) return null;
  const str = String(val).toUpperCase();
  const match = str.match(/\b([A-Z]{3}[- ]?[0-9][0-9A-Z][0-9]{2})\b/) ||
                str.match(/\b([A-Z]{3}[- ]?[0-9]{4})\b/);
  if (match) return match[1].replace(/[^A-Z0-9]/g, '');
  const limpa = str.replace(/[^A-Z0-9]/g, '');
  if (limpa.length >= 7 && limpa.length <= 8) {
    const m = limpa.match(/^([A-Z]{3}[0-9][0-9A-Z][0-9]{2}|[A-Z]{3}[0-9]{4})$/);
    return m ? m[1] : null;
  }
  return null;
}

module.exports = {
  normalizarKm,
  normalizarPlaca
};

