'use strict';

const financialEngine = require('../financialEngine');

function arredondar(valor, decimais = 2) {
  const n = Number(valor) || 0;
  return Number(Math.round(n + 'e' + decimais) + 'e-' + decimais);
}

function formatarMoeda(val) {
  return financialEngine.formatarMoeda(val);
}

function hojeISO() {
  return financialEngine.obterAgoraSP().dataISO;
}

module.exports = {
  arredondar,
  formatarMoeda,
  hojeISO
};

