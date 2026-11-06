'use strict';

const crypto = require('crypto');

const DEFAULT_PRECIFICACAO_CONFIG = {
  margemAlvoPadrao: 35,       // 35%
  margemMinimaPadrao: 20,     // 20%
  amostraMinimaHistorico: 5,   // Mínimo de 5 ocorrências para considerar amostra suficiente
  confianca: {
    mediaMinimo: 5,
    altaMinimo: 10
  },
  protecaoMargem: {
    modo: 'alertar'           // 'desativado' | 'alertar' | 'exigir_confirmacao' | 'exigir_aprovacao'
  },
  margensPorCategoria: {
    SUSPENSAO: { minima: 25, alvo: 40 },
    FREIOS: { minima: 25, alvo: 38 },
    DIRECAO: { minima: 25, alvo: 40 },
    TRANSMISSAO: { minima: 25, alvo: 38 },
    MOTOR: { minima: 25, alvo: 35 },
    ELETRICA: { minima: 30, alvo: 45 },
    ESTRUTURAL: { minima: 25, alvo: 40 }
  }
};

function gerarId(prefix = 'prc') {
  return `${prefix}_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
}

function arredondar(val, decimais = 2) {
  const n = Number(val) || 0;
  return Number(Math.round(n + 'e' + decimais) + 'e-' + decimais);
}

function normalizarTexto(txt) {
  return String(txt || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
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

function obterConfigPrecificacao(state) {
  const cfgTenant = state?.cfg?.precificacao || {};
  return {
    margemAlvoPadrao: Number(cfgTenant.margemAlvoPadrao) || DEFAULT_PRECIFICACAO_CONFIG.margemAlvoPadrao,
    margemMinimaPadrao: Number(cfgTenant.margemMinimaPadrao) || DEFAULT_PRECIFICACAO_CONFIG.margemMinimaPadrao,
    amostraMinimaHistorico: Number(cfgTenant.amostraMinimaHistorico) || DEFAULT_PRECIFICACAO_CONFIG.amostraMinimaHistorico,
    confianca: {
      mediaMinimo: Number(cfgTenant.confianca?.mediaMinimo) || (cfgTenant.amostraMinimaHistorico ? Number(cfgTenant.amostraMinimaHistorico) : DEFAULT_PRECIFICACAO_CONFIG.confianca.mediaMinimo),
      altaMinimo: Number(cfgTenant.confianca?.altaMinimo) || DEFAULT_PRECIFICACAO_CONFIG.confianca.altaMinimo
    },
    protecaoMargem: {
      modo: cfgTenant.protecaoMargem?.modo || DEFAULT_PRECIFICACAO_CONFIG.protecaoMargem.modo
    },
    margensPorCategoria: {
      ...DEFAULT_PRECIFICACAO_CONFIG.margensPorCategoria,
      ...(cfgTenant.margensPorCategoria || {})
    }
  };
}

function calcularMargemBruta(preco, custo) {
  const p = Number(preco) || 0;
  const c = Number(custo) || 0;
  if (p <= 0) return 0;
  return arredondar(((p - c) / p) * 100, 2);
}

function calcularMarkup(preco, custo) {
  const p = Number(preco) || 0;
  const c = Number(custo) || 0;
  if (c <= 0) return 0;
  return arredondar(((p - c) / c) * 100, 2);
}

function calcularPrecoAlvo(custo, margemAlvoPercentual) {
  const c = Number(custo) || 0;
  const m = Number(margemAlvoPercentual);
  if (isNaN(m) || m >= 100 || m < 0) {
    throw new Error('Margem inválida: deve ser >= 0 e < 100');
  }
  if (c === 0 || m === 0) return arredondar(c);
  const divisor = 1 - (m / 100);
  return arredondar(c / divisor);
}

function calcularPrecoMinimo(custo, margemMinimaPercentual) {
  const c = Number(custo) || 0;
  const m = Number(margemMinimaPercentual);
  if (isNaN(m) || m >= 100 || m < 0) {
    throw new Error('Margem inválida: deve ser >= 0 e < 100');
  }
  if (c === 0 || m === 0) return arredondar(c);
  const divisor = 1 - (m / 100);
  return arredondar(c / divisor);
}

function calcularDescontoSeguro(precoAtual, precoMinimo) {
  const p = Number(precoAtual) || 0;
  const min = Number(precoMinimo) || 0;
  const desc = arredondar(Math.max(0, p - min));
  const pct = p > 0 ? arredondar((desc / p) * 100, 2) : 0;
  return {
    descontoMaximoSeguro: desc,
    descontoMaximoPercentual: pct,
    jaAbaixoDoMinimo: p < min,
    valueOf() { return desc; },
    toString() { return String(desc); }
  };
}

function calcularPrecoLiquidoEMargem(preco, desconto, custo) {
  const p = Number(preco) || 0;
  const d = Math.max(0, Number(desconto) || 0);
  const c = Number(custo) || 0;
  const precoLiquido = arredondar(Math.max(0, p - d));
  const margemResultante = calcularMargemBruta(precoLiquido, c);
  return {
    precoOriginal: arredondar(p),
    desconto: arredondar(d),
    precoLiquido,
    custo: arredondar(c),
    margemResultante
  };
}

function calcularMediana(valores = []) {
  if (!Array.isArray(valores) || valores.length === 0) return 0;
  const ordenados = [...valores].map(Number).filter(n => !isNaN(n)).sort((a, b) => a - b);
  if (!ordenados.length) return 0;
  const meio = Math.floor(ordenados.length / 2);
  if (ordenados.length % 2 === 0) {
    return arredondar((ordenados[meio - 1] + ordenados[meio]) / 2);
  }
  return arredondar(ordenados[meio]);
}

module.exports = {
  DEFAULT_PRECIFICACAO_CONFIG,
  gerarId,
  arredondar,
  normalizarTexto,
  registrarAuditoria,
  obterConfigPrecificacao,
  calcularMargemBruta,
  calcularMarkup,
  calcularPrecoAlvo,
  calcularPrecoMinimo,
  calcularDescontoSeguro,
  calcularPrecoLiquidoEMargem,
  calcularMediana
};

