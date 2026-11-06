'use strict';

const {
  DEFAULT_PRECIFICACAO_CONFIG,
  arredondar,
  normalizarTexto,
  calcularMargemBruta,
  calcularMarkup,
  calcularPrecoAlvo,
  calcularPrecoMinimo,
  calcularDescontoSeguro,
  obterConfigPrecificacao
} = require('./pricingCore');

const {
  calcularCustoEsperadoServico
} = require('./pricingHistory');

/**
 * Gera recomendação completa de precificação, comparando preço atual,
 * margem esperada, preço alvo e preço mínimo.
 */
function gerarRecomendacaoPreco({
  tenantId,
  state,
  serviceId = null,
  serviceNome = null,
  categoria = null,
  pecasSolicitadas = [],
  precoAtual = null,
  desconto = 0,
  userPermissions = []
}) {
  if (!state) return null;
  const config = obterConfigPrecificacao(state);

  const apuracaoCusto = calcularCustoEsperadoServico({
    tenantId,
    state,
    serviceId,
    serviceNome,
    categoria,
    pecasSolicitadas
  });

  const catChave = String(categoria || apuracaoCusto?.historico?.categoria || '').toUpperCase().trim();
  const margemCat = config.margensPorCategoria[catChave];

  const margemAlvo = margemCat?.alvo != null ? Number(margemCat.alvo) : config.margemAlvoPadrao;
  const margemMinima = margemCat?.minima != null ? Number(margemCat.minima) : config.margemMinimaPadrao;
  const origemMargem = margemCat ? `categoria_${catChave}` : 'padrao_tenant';

  const custoTotal = apuracaoCusto ? apuracaoCusto.custoTotalEsperado : 0;
  const precoAlvo = calcularPrecoAlvo(custoTotal, margemAlvo);
  const precoMinimo = calcularPrecoMinimo(custoTotal, margemMinima);
  const markupAlvo = calcularMarkup(precoAlvo, custoTotal);
  const markupMinimo = calcularMarkup(precoMinimo, custoTotal);

  const amostra = apuracaoCusto?.historico?.quantidadeExecucoes || 0;
  const altaMin = config.confianca?.altaMinimo || 10;
  const mediaMin = config.confianca?.mediaMinimo || config.amostraMinimaHistorico || 5;
  let confianca = 'baixa';
  if (amostra >= altaMin) confianca = 'alta';
  else if (amostra >= mediaMin) confianca = 'media';

  let pAtual = precoAtual != null ? Number(precoAtual) : null;
  if (pAtual == null) {
    const srvCatalogo = (state.servicos || []).find(
      s => s.id === serviceId || (serviceNome && normalizarTexto(s.nome || '') === normalizarTexto(serviceNome))
    );
    if (srvCatalogo && (srvCatalogo.preco != null || srvCatalogo.valor != null)) {
      pAtual = Number(srvCatalogo.preco != null ? srvCatalogo.preco : srvCatalogo.valor);
    }
  }

  let analisePrecoAtual = null;
  if (pAtual != null && pAtual > 0) {
    const desc = Math.max(0, Number(desconto) || 0);
    const precoLiquido = arredondar(Math.max(0, pAtual - desc));
    const margemAtual = calcularMargemBruta(precoLiquido, custoTotal);
    const descontoMaximoSeguro = calcularDescontoSeguro(pAtual, precoMinimo);
    const abaixoMinimo = precoLiquido < precoMinimo;

    let statusMargem = 'adequada';
    let alerta = null;

    if (abaixoMinimo) {
      statusMargem = 'abaixo_minimo';
      alerta = `Preço líquido (R$ ${precoLiquido.toFixed(2)}) abaixo do preço mínimo recomendado (R$ ${precoMinimo.toFixed(2)}), gerando margem bruta de ${margemAtual}% (mínimo exigido: ${margemMinima}%).`;
    } else if (margemAtual < margemAlvo) {
      statusMargem = 'abaixo_alvo';
      alerta = `Margem bruta atual (${margemAtual}%) está abaixo da margem alvo configurada (${margemAlvo}%).`;
    }

    analisePrecoAtual = {
      precoAtual: arredondar(pAtual),
      desconto: arredondar(desc),
      precoLiquido,
      margemAtual,
      statusMargem,
      descontoMaximoSeguro,
      abaixoMinimo,
      alerta
    };
  }

  const tempoPrevFormatado = apuracaoCusto.tempoFormatado || 'catálogo';
  const explicacao = `Tempo previsto: ${tempoPrevFormatado}. Mão de obra: R$ ${apuracaoCusto.custoMOEsperado.toFixed(2)}. Peças: R$ ${apuracaoCusto.custoPecasEsperado.toFixed(2)}. Preço alvo recomendado: R$ ${precoAlvo.toFixed(2)} (margem ${margemAlvo}%). Piso mínimo de segurança: R$ ${precoMinimo.toFixed(2)} (margem mínima: ${margemMinima}%). Confiança: ${confianca}.`;

  const tempoHoras = apuracaoCusto.tempoEsperadoMinutos != null
    ? arredondar(apuracaoCusto.tempoEsperadoMinutos / 60, 1)
    : null;

  const recomendacao = {
    ok: true,
    tenantId,
    serviceId,
    servico: {
      id: serviceId,
      nome: serviceNome || apuracaoCusto?.historico?.serviceNome || 'Serviço',
      categoria: categoria || null
    },
    precoAlvoRecomendado: precoAlvo,
    precoMinimo,
    custoTotalEsperado: custoTotal,
    custoMaoObraEsperado: apuracaoCusto.custoMOEsperado,
    custoPecasEsperado: apuracaoCusto.custoPecasEsperado,
    margemAlvoAplicada: margemAlvo,
    margemMinimaPolitica: margemMinima,
    tempoEsperadoHoras: tempoHoras,
    custoEsperado: {
      maoDeObra: apuracaoCusto.custoMOEsperado,
      pecas: apuracaoCusto.custoPecasEsperado,
      total: custoTotal,
      tempoEstimadoMinutos: apuracaoCusto.tempoEsperadoMinutos,
      tempoFormatado: apuracaoCusto.tempoFormatado,
      fonteTempo: apuracaoCusto.fonteTempo
    },
    margens: {
      alvo: margemAlvo,
      minima: margemMinima,
      origemMargem
    },
    precosRecomendados: {
      precoAlvo,
      precoMinimo,
      markupEquivalenteAlvo: markupAlvo,
      markupEquivalenteMinimo: markupMinimo
    },
    analisePrecoAtual,
    confianca,
    amostraHistorica: {
      tamanhoAmostra: amostra,
      baseHistoricaInsuficiente: amostra < config.amostraMinimaHistorico
    },
    baseHistoricaInsuficiente: amostra < config.amostraMinimaHistorico,
    retrabalhoHistoricoPercentual: apuracaoCusto?.historico?.percentualRetrabalho || 0,
    variacaoCustoPecas: apuracaoCusto.variacaoCustoDetectada,
    explicacao
  };

  const podeVerCusto = userPermissions.includes('*') ||
    userPermissions.includes('pricing:read') ||
    userPermissions.includes('costing:read') ||
    userPermissions.includes('profitability:read');

  if (!podeVerCusto) {
    recomendacao.custoMaoObraEsperado = null;
    recomendacao.custoPecasEsperado = null;
    recomendacao.custoTotalEsperado = null;
    recomendacao.margemAlvoAplicada = null;
    recomendacao.amostraHistorica = null;
    delete recomendacao.custoEsperado;
    delete recomendacao.margens;
    if (recomendacao.analisePrecoAtual) {
      delete recomendacao.analisePrecoAtual.margemAtual;
    }
  }

  return recomendacao;
}

/**
 * Simulação interativa de precificação e desconto
 */
function simularPrecificacao({
  tenantId,
  state,
  custo,
  tempoHoras,
  tempoMinutos,
  custoPecas,
  margemAlvo = null,
  margemMinima = null,
  precoAtual = null,
  desconto = 0
}) {
  const config = state ? obterConfigPrecificacao(state) : DEFAULT_PRECIFICACAO_CONFIG;
  let c = custo != null ? Math.max(0, Number(custo) || 0) : null;
  if (c == null) {
    let custoMO = 0;
    if (tempoHoras != null || tempoMinutos != null) {
      const minutos = tempoHoras != null ? Number(tempoHoras) * 60 : Number(tempoMinutos);
      const workers = (state?.workers || []).filter(w => (w.tenantId === tenantId || !w.tenantId) && w.ativo !== false && w.custoHora > 0);
      const custoHora = workers.length ? (workers.reduce((a, w) => a + Number(w.custoHora), 0) / workers.length) : 40.0;
      custoMO = (minutos / 60) * custoHora;
    }
    const cPecas = Number(custoPecas) || 0;
    c = arredondar(custoMO + cPecas);
  }
  const mAlvo = margemAlvo != null ? Number(margemAlvo) : config.margemAlvoPadrao;
  const mMin = margemMinima != null ? Number(margemMinima) : config.margemMinimaPadrao;

  const precoAlvo = calcularPrecoAlvo(c, mAlvo);
  const precoMinimo = calcularPrecoMinimo(c, mMin);
  const markupAlvo = calcularMarkup(precoAlvo, c);
  const markupMinimo = calcularMarkup(precoMinimo, c);

  let analiseAtual = null;
  if (precoAtual != null && Number(precoAtual) > 0) {
    const p = Number(precoAtual);
    const d = Math.max(0, Number(desconto) || 0);
    const pLiq = arredondar(Math.max(0, p - d));
    const margemAtual = calcularMargemBruta(pLiq, c);
    const descontoMaximoSeguro = calcularDescontoSeguro(p, precoMinimo);
    const abaixoMinimo = pLiq < precoMinimo;

    analiseAtual = {
      precoBruto: arredondar(p),
      desconto: arredondar(d),
      precoLiquido: pLiq,
      margemAtual,
      descontoMaximoSeguro,
      abaixoMinimo,
      alerta: abaixoMinimo
        ? `Preço com desconto (R$ ${pLiq.toFixed(2)}) rompe a margem mínima de ${mMin}%.`
        : null
    };
  }

  return {
    custo: arredondar(c),
    margemAlvo: mAlvo,
    margemMinima: mMin,
    precoAlvo,
    precoAlvoRecomendado: precoAlvo,
    precoMinimo,
    markupAlvo,
    markupMinimo,
    analiseAtual
  };
}

module.exports = {
  gerarRecomendacaoPreco,
  simularPrecificacao
};

