'use strict';

const {
  matchConfirmationAndCancel,
  matchTrainingHelp,
  matchCashRegister,
  matchFinancialForecastAndAudit,
  matchFinancialGeneral,
  matchInventoryCritical,
  matchExecutive360
} = require('./voiceRulesPatterns');

const {
  matchHighRiskOS,
  matchCorrection,
  matchInspection,
  matchAddComplaint,
  matchCheckinAndOpenOS,
  matchOperationalAlertsAndBottlenecks
} = require('./voiceRulesPatternsOS');

const {
  matchLaborTracking,
  matchPricingAndProfitability
} = require('./voiceRulesPatternsLaborPricing');

const {
  matchQuotationsAndPricing,
  matchInventoryProcurementActions,
  matchCRMAndFleet,
  matchGeneralStatus
} = require('./voiceRulesPatternsStockCRM');

/**
 * Heurística resiliente para fallback quando IA estiver offline ou em testes locais
 */
function interpretarPorRegras(texto, context = {}, state = {}) {
  const t = (texto || '').toLowerCase().trim();

  // 1 & 2. Confirmação / Cancelamento
  const conf = matchConfirmationAndCancel(t, context);
  if (conf) return conf;

  // 2.5 Treinamento e Dúvidas do Sistema
  const train = matchTrainingHelp(t);
  if (train) return train;

  // 2.6 Comandos de Caixa
  const cash = matchCashRegister(t);
  if (cash) return cash;

  // 2.6 Forecast e Auditoria
  const finAudit = matchFinancialForecastAndAudit(t);
  if (finAudit) return finAudit;

  // 2.7 Consultas Financeiras Gerais
  const finGen = matchFinancialGeneral(t);
  if (finGen) return finGen;

  // 2.7 Estoque Crítico
  const invCrit = matchInventoryCritical(t);
  if (invCrit) return invCrit;

  // 2.8 Gestão 360, Compras e Produtividade
  const exec360 = matchExecutive360(t);
  if (exec360) return exec360;

  // 3 & 4. Exclusão e Faturamento de OS
  const highRisk = matchHighRiskOS(t);
  if (highRisk) return highRisk;

  // 5. Correção de campo
  const corr = matchCorrection(t);
  if (corr) return corr;

  // 5.5 Inspeção Técnica
  const insp = matchInspection(t);
  if (insp) return insp;

  // 6. Adição de queixa
  const queixa = matchAddComplaint(t, context);
  if (queixa) return queixa;

  // 7. Abertura de OS / Check-in
  const checkin = matchCheckinAndOpenOS(t);
  if (checkin) return checkin;

  // 7.1 Gestão Operacional Proativa (Alertas, Gargalos, Resumo)
  const alerts = matchOperationalAlertsAndBottlenecks(t);
  if (alerts) return alerts;

  // 7.2 Orçamentos
  const orc = matchQuotationsAndPricing(t);
  if (orc) return orc;

  // 7.3 Peças, Estoque e Compras
  const stock = matchInventoryProcurementActions(t);
  if (stock) return stock;

  // 7.4 Apontamento de Mão de Obra e Equipe
  const labor = matchLaborTracking(t);
  if (labor) return labor;

  // 14. Precificação e Rentabilidade
  const pricing = matchPricingAndProfitability(t);
  if (pricing) return pricing;

  // 15. CRM, Frotas e Manutenção Preventiva
  const crm = matchCRMAndFleet(t);
  if (crm) return crm;

  // 8. Consulta de Status / Geral
  const status = matchGeneralStatus(t);
  if (status) return status;

  return {
    intencao: 'duvida_geral',
    risco: 'baixo',
    cliente: null,
    veiculo: null,
    os: null,
    correcoes: [],
    itens_solicitados: { servicos: [], pecas: [] },
    resposta_falada: ''
  };
}

module.exports = {
  interpretarPorRegras
};

