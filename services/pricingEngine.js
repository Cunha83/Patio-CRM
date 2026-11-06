'use strict';

/**
 * Fachada Modular do Motor de Precificação e Rentabilidade (Zero Quebra de Contratos)
 * Limite Modular: <= 350 linhas.
 */

const {
  DEFAULT_PRECIFICACAO_CONFIG,
  arredondar,
  calcularMargemBruta,
  calcularMarkup,
  calcularPrecoAlvo,
  calcularPrecoMinimo,
  calcularDescontoSeguro,
  calcularPrecoLiquidoEMargem,
  calcularMediana,
  obterConfigPrecificacao
} = require('./pricing/pricingCore');

const {
  consultarHistoricoServico,
  calcularCustoEsperadoServico
} = require('./pricing/pricingHistory');

const {
  gerarRecomendacaoPreco,
  simularPrecificacao
} = require('./pricing/pricingRecommendations');

const {
  validarPoliticaMargem,
  registrarOverridePreco
} = require('./pricing/pricingPolicy');

const {
  obterResumoRentabilidade,
  obterRentabilidadeServicos
} = require('./pricing/pricingProfitability');

const {
  obterRentabilidadeCategorias,
  obterRentabilidadeClientes,
  obterRentabilidadeVeiculos
} = require('./pricing/pricingSegmentation');

module.exports = {
  DEFAULT_PRECIFICACAO_CONFIG,
  arredondar,
  calcularMargemBruta,
  calcularMarkup,
  calcularPrecoAlvo,
  calcularPrecoMinimo,
  calcularDescontoSeguro,
  calcularPrecoLiquidoEMargem,
  calcularMediana,
  obterConfigPrecificacao,
  consultarHistoricoServico,
  calcularCustoEsperadoServico,
  gerarRecomendacaoPreco,
  simularPrecificacao,
  validarPoliticaMargem,
  registrarOverridePreco,
  obterResumoRentabilidade,
  obterRentabilidadeServicos,
  obterRentabilidadeCategorias,
  obterRentabilidadeClientes,
  obterRentabilidadeVeiculos
};
