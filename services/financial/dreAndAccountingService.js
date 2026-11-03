'use strict';

const crypto = require('crypto');
const financialEngine = require('../financialEngine');
const { listarMovimentacoes } = require('./financialHelpers');

/**
 * Exporta movimentações financeiras em formato CSV ou JSON com cálculo de hash SHA-256
 */
function exportarMovimentacoesContabeis(state = {}, opcoes = {}) {
  const formato = String(opcoes.formato || 'csv').toLowerCase();

  const resultado = listarMovimentacoes(state, {
    ...opcoes,
    limit: opcoes.limit || 5000
  });

  const movs = resultado.movimentacoes || [];

  if (formato === 'json') {
    const payloadJson = {
      exportadoEm: new Date().toISOString(),
      totalRegistros: movs.length,
      resumoOrigem: resultado.resumoOrigem,
      resumoMeiosPagamento: resultado.resumoMeiosPagamento,
      movimentacoes: movs
    };
    const jsonStr = JSON.stringify(payloadJson, null, 2);
    const sha256 = crypto.createHash('sha256').update(jsonStr, 'utf8').digest('hex');
    payloadJson.integridade = {
      algoritmo: 'sha256',
      sha256
    };
    return {
      formato: 'json',
      mimeType: 'application/json',
      conteudo: JSON.stringify(payloadJson, null, 2),
      sha256,
      totalRegistros: movs.length
    };
  }

  // Formato CSV com BOM UTF-8 (\uFEFF)
  const cabecalho = 'ID;DataHora;Tipo;Natureza;Valor;MeioPagamento;Origem;OS;Placa;Autor;StatusEstorno;Descricao';
  const linhas = [cabecalho];

  for (const m of movs) {
    const id = m.id || '';
    const dataHora = m.dataHora || m.criadoEm || (m.data ? `${m.data}T00:00:00Z` : '');
    const tipo = m.tipo || '';
    const natureza = m.naturezaOperacao || m.subtipo || 'operacional';
    const valor = Number(m.valor || 0).toFixed(2);
    const meio = m.forma || m.formaPagamento || 'dinheiro';
    const origem = m.origem || 'sistema';
    const os = m.osId || '';
    const placa = m.placa || '';
    const autor = m.autorNumero || m.operador || '';
    const statusEstorno = m.estornado ? 'ESTORNADO' : (m.estornoDeId || m.subtipo === 'estorno' ? 'COMPENSATORIO' : 'ATIVO');
    const desc = (m.desc || m.descricao || '').replace(/[;\r\n]/g, ' ').trim();

    linhas.push(`${id};${dataHora};${tipo};${natureza};${valor};${meio};${origem};${os};${placa};${autor};${statusEstorno};"${desc}"`);
  }

  const csvContent = '\uFEFF' + linhas.join('\r\n');
  const sha256 = crypto.createHash('sha256').update(csvContent, 'utf8').digest('hex');

  return {
    formato: 'csv',
    mimeType: 'text/csv; charset=utf-8',
    conteudo: csvContent,
    sha256,
    totalRegistros: movs.length
  };
}

/**
 * Consolida o DRE Operacional Simplificado delegando para o motor centralizado
 */
function calcularDRESimplificado(state = {}, options = {}) {
  return financialEngine.calcularDRESimplificado(state, options);
}

/**
 * Consolida o DRE Operacional com custos de peças e neutralidade de tesouraria
 */
function calcularDREOperacional(state = {}, opcoes = {}) {
  const baseDRE = financialEngine.calcularDRESimplificado(state, opcoes);

  let custoPecasAplicadasOS = 0;
  const osLista = Array.isArray(state.os) ? state.os : [];
  for (const o of osLista) {
    if (o.st !== 'cancelada') {
      const pecas = Array.isArray(o.pecasUtilizadas) ? o.pecasUtilizadas : [];
      for (const p of pecas) {
        custoPecasAplicadasOS = +(custoPecasAplicadasOS + Number(p.subtotal || (p.quantidade * (p.valorUnitario || 0)))).toFixed(2);
      }
    }
  }

  const tesourariaNeutra = {
    totalSangrias: baseDRE.movimentacaoTesourariaNeutra?.totalSangrias || 0,
    totalSuprimentos: baseDRE.movimentacaoTesourariaNeutra?.totalSuprimentos || 0,
    saldoTesouraria: baseDRE.movimentacaoTesourariaNeutra?.saldoTesouraria || 0
  };

  return {
    sucesso: true,
    periodo: baseDRE.periodo,
    receitaOperacionalBruta: baseDRE.receitaOperacionalBruta,
    despesasOperacionais: baseDRE.despesasOperacionais,
    custoPecasAplicadasOS,
    resultadoOperacionalLiquido: baseDRE.resultadoOperacionalLiquido,
    margemOperacionalPercentual: baseDRE.margemOperacionalPercentual,
    lucro: baseDRE.lucro,
    qtdReceitas: baseDRE.qtdReceitas || 0,
    qtdDespesas: baseDRE.qtdDespesas || 0,
    tesourariaNeutra,
    movimentacaoTesourariaNeutra: tesourariaNeutra
  };
}

module.exports = {
  exportarMovimentacoesContabeis,
  calcularDRESimplificado,
  calcularDREOperacional
};
