'use strict';

/**
 * Pátio CRM — Serviço Central de Comissionamento de Mecânicos
 * Fachada Modular (< 60 linhas).
 *
 * Submódulos:
 * - services/commission/commissionCalc.js: Cálculo determinístico por OS, regras de rateio e deduções
 * - services/commission/commissionReport.js: Fechamento de período e extrato individual
 */

const {
  arredondar,
  obterConfigComissoes,
  obterPercentualColaborador,
  calcularComissaoOS
} = require('./commission/commissionCalc');

const {
  normalizarData,
  gerarFechamentoComissoes,
  obterResumoComissoesColaborador
} = require('./commission/commissionReport');

module.exports = {
  arredondar,
  obterConfigComissoes,
  obterPercentualColaborador,
  calcularComissaoOS,
  normalizarData,
  gerarFechamentoComissoes,
  obterResumoComissoesColaborador
};

