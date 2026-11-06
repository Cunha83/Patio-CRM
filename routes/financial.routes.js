'use strict';

/**
 * Pátio CRM — Roteador Principal do Módulo Financeiro
 * Arquitetura Modular (< 40 linhas).
 *
 * Sub-roteadores especializados em routes/:
 * - financial_cash.routes.js: abertura, fechamento e resumo de caixa
 * - financial_treasury.routes.js: sangrias, suprimentos e estornos contábeis
 * - financial_os.routes.js: faturamento, liberação e cobrança de OS
 * - financial_patio.routes.js: boxes, alocação e gargalos operacionais
 * - financial_parts.routes.js: requisição e estorno de peças
 * - financial_checklist.routes.js: checklists de entrada e vistorias
 * - financial_dre.routes.js: DRE gerencial, produtividade, liquidação de títulos e exportações
 */

const express = require('express');
const router = express.Router();

router.use(require('./financial_cash.routes'));
router.use(require('./financial_treasury.routes'));
router.use(require('./financial_os.routes'));
router.use(require('./financial_patio.routes'));
router.use(require('./financial_parts.routes'));
router.use(require('./financial_checklist.routes'));
router.use(require('./financial_dre.routes'));


// Suporte a inspeção direta de router.stack para suítes de testes de regressão
const rawStack = router.stack;
Object.defineProperty(router, 'stack', {
  configurable: true,
  enumerable: true,
  get() {
    const flat = [];
    for (const layer of rawStack) {
      if (layer.route) {
        flat.push(layer);
      } else if (layer.handle && Array.isArray(layer.handle.stack)) {
        for (const sub of layer.handle.stack) {
          flat.push(sub);
        }
      } else {
        flat.push(layer);
      }
    }
    return flat;
  },
  set(val) {
    rawStack.length = 0;
    rawStack.push(...val);
  }
});

module.exports = router;
