/**
 * Módulo Orquestrador e Fachada: cadastros_fiscal.js
 * Pátio-CRM — Configurações Fiscais, Cadastrais, Integrações e Plano de Contas
 * Arquitetura Modular (< 100 linhas).
 *
 * Delegações para submódulos especializados:
 * - cadastros_fiscal_regras.js: tributação, matriz fiscal e simulador IVA Dual
 * - cadastros_fiscal_nfe.js: central fiscal (NF-e, NFC-e, NFS-e, MDF-e) e SEFAZ
 * - cadastros_config_integracoes.js: boletos, réguas, formas pgto, usuários e APIs
 * - cadastros_plano_contas.js: plano de contas e visualização em árvore
 * - cadastros_plano_contas_actions.js: CRUD e ações do plano de contas
 */

(function (global) {
  'use strict';

  global.patioFiscalAvailable = true;

  const funcoesFiscal = [
    'viewTributario',
    'viewOperacoes',
    'viewRegrasTributarias',
    'viewSimuladorFiscal',
    'viewContabil',
    'viewFiscal',
    'viewCentralFiscal',
    'abrirModalNovaNFe',
    'transmitirNFe',
    'acaoFiscal',
    'acaoFiscalUtilitario',
    'imprimirDanfe',
    'enviarNfeWhatsApp',
    'viewBoletos',
    'viewCobrancas',
    'renderSimplesLista',
    'viewPlanoContas',
    'folhaPlanoConta',
    'abrirFolhaPlanoConta',
    'atualizarPaiRascPlanoConta',
    'salvarPlanoConta',
    'excluirPlanoConta',
    'toggleStatusPlanoConta',
    'restaurarPlanoContasPadrao',
    'viewFormasPgto',
    'viewContasCaixa',
    'viewUsuarios',
    'viewAPI'
  ];

  funcoesFiscal.forEach((nomeFn) => {
    if (typeof global[nomeFn] === 'function') {
      if (typeof window !== 'undefined') window[nomeFn] = global[nomeFn];
      if (typeof globalThis !== 'undefined') globalThis[nomeFn] = global[nomeFn];
    }
  });
})(typeof window !== 'undefined' ? window : globalThis);
