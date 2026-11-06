'use strict';

/**
 * Fachada Modular do Motor Financeiro Centralizado (Zero Quebra de Contratos)
 * Limite Modular: <= 350 linhas.
 */

const {
  FUSO_HORARIO_PADRAO,
  obterAgoraSP,
  formatarMoeda,
  formatarMoedaCurta,
  dataISO,
  addDias,
  diasEntre,
  formatarDataBR,
  formatarDataBRFull,
  obterIntervaloFiltro
} = require('./financial/engineHelpers');

const {
  calcularKPIsFinanceiros,
  calcularResumoOperacional
} = require('./financial/financialEngineKpis');

const {
  gerarSeriesGraficos,
  gerarSVGBarrasFluxo,
  gerarSVGProjecao
} = require('./financial/financialEngineCharts');

const {
  obterDashboardFinanceiro,
  gerarRelatorioExecutivo,
  gerarMensagensAdmin,
  gerarMensagensOperacao,
  gerarResumoCaixa,
  gerarResumoPatio
} = require('./financial/financialEngineReports');

const {
  calcularDRESimplificado,
  formatarDREWhatsapp,
  gerarTextoCobrancaOS
} = require('./financial/financialEngineDRE');

module.exports = {
  FUSO_HORARIO_PADRAO,
  obterAgoraSP,
  formatarMoeda,
  formatarMoedaCurta,
  dataISO,
  addDias,
  diasEntre,
  formatarDataBR,
  formatarDataBRFull,
  obterIntervaloFiltro,
  calcularKPIsFinanceiros,
  calcularResumoOperacional,
  gerarSeriesGraficos,
  obterDashboardFinanceiro,
  gerarSVGBarrasFluxo,
  gerarSVGProjecao,
  gerarRelatorioExecutivo,
  gerarMensagensAdmin,
  gerarMensagensOperacao,
  gerarResumoCaixa,
  gerarResumoPatio,
  calcularDRESimplificado,
  formatarDREWhatsapp,
  gerarTextoCobrancaOS
};
