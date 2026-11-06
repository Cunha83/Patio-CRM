'use strict';

const summaryMetrics = require('./operational/summaryMetrics');
const summaryFormatting = require('./operational/summaryFormatting');
const summaryPainelCompleto = require('./operational/summaryPainelCompleto');

module.exports = {
  // Parsing e Resumo Base
  parseDataHora: summaryMetrics.parseDataHora,
  gerarResumoOperacional: summaryMetrics.gerarResumoOperacional,

  // Painel Completo
  gerarPainelOperacionalCompleto: summaryPainelCompleto.gerarPainelOperacionalCompleto,

  // Snapshots e Histórico
  registrarSnapshotOperacional: summaryFormatting.registrarSnapshotOperacional,
  obterHistoricoSnapshots: summaryFormatting.obterHistoricoSnapshots,

  // Formatações Conversacionais / Voz
  formatarResumoConversacional: summaryFormatting.formatarResumoConversacional,
  formatarMaiorGargalo: summaryFormatting.formatarMaiorGargalo,
  formatarEntregasEmRisco: summaryFormatting.formatarEntregasEmRisco,
  formatarAlertasAtencao: summaryFormatting.formatarAlertasAtencao
};
