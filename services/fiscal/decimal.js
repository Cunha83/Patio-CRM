'use strict';
function scaled(value, places = 2) {
  const text = String(value ?? 0);
  if (!/^\d{1,12}(?:\.\d{1,20})?$/.test(text)) throw new Error('Valor decimal inválido ou fora do limite.');
  const [whole, fraction = ''] = text.split('.');
  const digits = (fraction + '0'.repeat(places + 1));
  return BigInt(whole) * (10n ** BigInt(places)) + BigInt(digits.slice(0, places) || '0') + (Number(digits[places]) >= 5 ? 1n : 0n);
}
function round(value, places = 2) { const negative = String(value).startsWith('-'); return (negative ? -1 : 1) * Number(scaled(negative ? String(value).slice(1) : value, places)) / 10 ** places; }
function product(a, b) { return Number((scaled(a, 4) * scaled(b, 4) + 500000n) / 1000000n) / 100; }
function percentage(amount, rate) { return Number((scaled(amount, 2) * scaled(rate, 4) + 500000n) / 1000000n) / 100; }
function allocate(total, weights) {
  const cents = scaled(total); const w = weights.map(v => scaled(v, 4));
  if (!w.length) { if (cents) throw new Error('Rateio sem itens.'); return []; }
  let sum = w.reduce((a,b) => a+b, 0n); if (!sum) { w.fill(1n); sum = BigInt(w.length); }
  const parts = w.map((v,i) => ({i, value: cents*v/sum, rest:cents*v%sum}));
  let residue = cents-parts.reduce((a,b)=>a+b.value,0n);
  for (const p of [...parts].sort((a,b)=>a.rest===b.rest?a.i-b.i:a.rest>b.rest?-1:1)) { if (!residue) break; p.value++; residue--; }
  return parts.map(p=>Number(p.value)/100);
}
module.exports = { scaled, round, product, percentage, allocate };
