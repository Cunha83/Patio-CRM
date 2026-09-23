(function (root) {
  'use strict';
  const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  function merge(base, local, remote) {
    const conflicts = [];
    function visit(b, l, r, path) {
      if (equal(l, b)) return clone(r);
      if (equal(r, b) || equal(l, r)) return clone(l);
      if (object(b) && object(l) && object(r)) {
        const result = {};
        for (const key of new Set([...Object.keys(b), ...Object.keys(l), ...Object.keys(r)])) {
          if (!path && ['versao', 'ui', '_excluidos'].includes(key)) continue;
          const value = visit(b[key], l[key], r[key], path ? `${path}.${key}` : key);
          if (value !== undefined) result[key] = value;
        }
        return result;
      }
      const records = a => Array.isArray(a) && a.every(v => object(v) && typeof v.id === 'string') && new Set(a.map(v => v.id)).size === a.length;
      if (records(b) && records(l) && records(r)) {
        const maps = [b, l, r].map(a => new Map(a.map(v => [v.id, v])));
        return [...new Set([...r.map(v => v.id), ...l.map(v => v.id), ...b.map(v => v.id)])]
          .map(id => visit(...maps.map(m => m.get(id)), `${path}[${id}]`)).filter(v => v !== undefined);
      }
      conflicts.push(path);
      return clone(l);
    }
    const state = visit(base, local, remote, '');
    if (state && typeof state === 'object') {
      state.versao = remote?.versao || 0;
      if (local?.ui) state.ui = clone(local.ui);
      delete state._excluidos;
    }
    return { state, conflicts };
  }
  const api = { merge, clone };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PatioSync = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
