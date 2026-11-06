'use strict';

const executiveStockAnalysis = require('./executive/executiveStockAnalysis');
const executiveTeamAnalysis = require('./executive/executiveTeamAnalysis');
const executiveFleetAnalysis = require('./executive/executiveFleetAnalysis');
const executiveBriefing360 = require('./executive/executiveBriefing360');

module.exports = {
  // Compras, Reposição e Análise Financeira
  analisarComprasEEstoque: executiveStockAnalysis.analisarComprasEEstoque,

  // Produtividade, Equipe e Boxes
  analisarProdutividadeEquipe: executiveTeamAnalysis.analisarProdutividadeEquipe,

  // Retenção, Frotas e Cobrança
  analisarRetencaoECobranca: executiveFleetAnalysis.analisarRetencaoECobranca,

  // Briefing Executivo 360º (WhatsApp e Voz)
  gerarRelatorioGerencial360: executiveBriefing360.gerarRelatorioGerencial360
};
