'use strict';

/**
 * services/fiscal/b2bFiscalAccountingExportHelper.js
 *
 * Utilitário de Exportação Contábil e Geração de Arquivos Fiscais B2B:
 * - Consolidação de NF-e (Peças) e NFS-e (Serviços) emitidas no período
 * - Totalização de retenções de ISS, IRRF e CSRF na fonte
 * - Geração de CSV estruturado para contabilidade externa
 *
 * Teto Modular: <= 250 linhas
 */

function garantirColecoes(state) {
  if (!state.fiscalConfig || typeof state.fiscalConfig !== 'object') state.fiscalConfig = {};
  if (!Array.isArray(state.fiscalClosings)) state.fiscalClosings = [];
  if (!Array.isArray(state.os)) state.os = [];
  if (!Array.isArray(state.borderos)) state.borderos = [];
  if (!Array.isArray(state.borderosFrotistas)) state.borderosFrotistas = [];
  if (!Array.isArray(state.contas)) state.contas = [];
}

/**
 * Exporta lote contábil consolidado com totais e string CSV delimitada por ponto-e-vírgula.
 */
function exportarLoteContabilFiscal(state, { competencia } = {}) {
  garantirColecoes(state);
  const comp = competencia || new Date().toISOString().slice(0, 7);

  const fechamentos = state.fiscalClosings.filter(f =>
    f.status === 'notas_emitidas' && String(f.dataEmissaoEspelho || f.criadoEm || '').startsWith(comp)
  );

  const totalNFePecasEmitidas = Math.round(fechamentos.reduce((sum, f) => sum + (f.baseCalculoPecasTotal || 0), 0) * 100) / 100;
  const totalNFSeServicosEmitidas = Math.round(fechamentos.reduce((sum, f) => sum + (f.baseCalculoServicosTotal || 0), 0) * 100) / 100;
  const totalISSRetido = Math.round(fechamentos.reduce((sum, f) => sum + (f.retencoes?.valorISSRetido || 0), 0) * 100) / 100;
  const totalIRRFRetido = Math.round(fechamentos.reduce((sum, f) => sum + (f.retencoes?.valorIRRFRetido || 0), 0) * 100) / 100;
  const totalCSRFRetido = Math.round(fechamentos.reduce((sum, f) => sum + (f.retencoes?.valorCSRFRetido || 0), 0) * 100) / 100;
  const totalLiquidoFaturado = Math.round(fechamentos.reduce((sum, f) => sum + (f.valorLiquidoAReceber || 0), 0) * 100) / 100;

  const header = 'Competencia;Id_Fechamento;Cliente;NFe_Pecas;NFSe_Servicos;Base_Pecas;Base_Servicos;ISS_Retido;IRRF_Retido;CSRF_Retido;Total_Retencoes;Valor_Liquido;Data';
  const rows = fechamentos.map(f => {
    const data = String(f.dataEmissaoEspelho || f.criadoEm || '').slice(0, 10);
    const nfe = f.notasEmitidas?.numeroNFePecas || '-';
    const nfse = f.notasEmitidas?.numeroNFSeServicos || '-';
    const ret = f.retencoes || {};
    return `${comp};${f.id};${f.clienteNome || ''};${nfe};${nfse};${f.baseCalculoPecasTotal.toFixed(2)};${f.baseCalculoServicosTotal.toFixed(2)};${(ret.valorISSRetido || 0).toFixed(2)};${(ret.valorIRRFRetido || 0).toFixed(2)};${(ret.valorCSRFRetido || 0).toFixed(2)};${(ret.totalRetencoesNaFonte || 0).toFixed(2)};${f.valorLiquidoAReceber.toFixed(2)};${data}`;
  });

  const csvExportString = [header, ...rows].join('\n');

  return {
    ok: true,
    competencia: comp,
    quantidadeFechamentos: fechamentos.length,
    totalNFePecasEmitidas,
    totalNFSeServicosEmitidas,
    totalISSRetido,
    totalIRRFRetido,
    totalCSRFRetido,
    totalLiquidoFaturado,
    registrosContabeis: fechamentos,
    csvExportString
  };
}

module.exports = {
  garantirColecoes,
  exportarLoteContabilFiscal
};

