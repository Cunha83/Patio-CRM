/**
 * Módulo Orquestrador e Fachada: estoque.js
 * Pátio-CRM — Módulo de Estoque, Almoxarifado & Entrada de Notas
 * Arquitetura Modular (< 100 linhas).
 *
 * Submódulos especializados em js/modules/:
 * - estoque_catalogo_ui.js: catálogo de produtos e serviços, indicadores e KPIs
 * - estoque_movimentacoes.js: ajustes de estoque, cotações, necessidades e fichas de peças
 * - estoque_ocr_notas.js: importação de XML e leitor OCR inteligente de Danfe
 */

(function (global) {
  'use strict';

  const funcoesEstoque = [
    'calcularSaldosPeca',
    'viewEstoque',
    'abrirModalAjusteEstoque',
    'confirmarAjusteEstoque',
    'viewNecessidadesCompra',
    'viewCotacoesCompra',
    'viewPedidosCompra',
    'folhaPeca',
    'folhaNovaPeca',
    'folhaXML',
    'lerXML',
    'confirmarXML',
    'folhaSimulacaoOCR'
  ];

  funcoesEstoque.forEach((nomeFn) => {
    if (typeof global[nomeFn] === 'function') {
      if (typeof window !== 'undefined') window[nomeFn] = global[nomeFn];
      if (typeof globalThis !== 'undefined') globalThis[nomeFn] = global[nomeFn];
    }
  });

  // Exportação canônica da fachada
  if (typeof window !== 'undefined') {
    window.viewEstoque = global.viewEstoque || window.viewEstoque;
    window.calcularSaldosPeca = global.calcularSaldosPeca || window.calcularSaldosPeca;
  }
})(typeof window !== 'undefined' ? window : globalThis);
