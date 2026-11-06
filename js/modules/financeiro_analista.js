/**
 * Módulo Orquestrador e Fachada: financeiro_analista.js
 * Pátio-CRM — Painel e Inteligência Financeira Veronica
 * Arquitetura Modular (< 120 linhas).
 *
 * Delegações para submódulos especializados:
 * - analista_calc.js: cálculos de caixa, projeções DRE e conformidade
 * - analista_kpi_cards.js: renderização dos cards KPI executivos
 * - analista_chat_ui.js: assistente e chat interativo com Veronica
 * - analista_caixa_modal.js: modais de abertura, fechamento e lançamentos
 * - analista_radar_oficina.js: radar de liberação financeira de OS e saída de veículos
 * - analista_actions.js: faturamento de OS, baixa de títulos e réguas de cobrança
 * - analista_bi_produtividade.js: cálculo de produtividade de mecânicos e BI
 * - analista_checkout_pix.js: checkout Pix dinâmico e integração com webhook
 */

// Garantia de integridade de contratos no escopo global
(function (global) {
  'use strict';

  // Sincroniza referências entre submódulos carregados
  const funcoesAnalista = [
    'obterCaixaAbertoFrontend',
    'calcularPrevisaoFrontend',
    'calcularControlesInternosFrontend',
    'calcularDREFrontend',
    'renderCardGestaoCaixaVeronica',
    'renderCardPrevisaoVeronica',
    'renderCardDREVeronica',
    'renderCardControlesVeronica',
    'blocoVeronicaAnalista',
    'folhaAbrirCaixaVeronica',
    'folhaLancamentoCaixaVeronica',
    'folhaFecharCaixaVeronica',
    'abrirCaixaApi',
    'lancarMovimentoApi',
    'fecharCaixaApi',
    'estornarMovimentoApi',
    'falarParecerVeronica',
    'calcularStatusLiberacaoOSFrontend',
    'renderBadgeLiberacaoPatio',
    'radarLiberacaoPatioHtml',
    'folhaFaturarOS',
    'faturarOSApi',
    'folhaBaixarTituloVeronica',
    'liquidarTituloApi',
    'folhaLiberarSaidaExcepcional',
    'liberarSaidaPatioExcepcionalApi',
    'gerarTextoCobrancaFrontend',
    'copiarAvisoCobranca',
    'calcularProdutividadeFrontend',
    'dashboardBiProdutividadeHtml',
    'abrirModalCheckoutPix'
  ];

  funcoesAnalista.forEach((nomeFn) => {
    if (typeof global[nomeFn] === 'function') {
      if (typeof window !== 'undefined') window[nomeFn] = global[nomeFn];
      if (typeof globalThis !== 'undefined') globalThis[nomeFn] = global[nomeFn];
    }
  });
})(typeof window !== 'undefined' ? window : globalThis);
