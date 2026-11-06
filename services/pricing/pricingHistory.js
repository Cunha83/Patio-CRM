'use strict';

const {
  arredondar,
  normalizarTexto,
  calcularMargemBruta,
  calcularMediana,
  obterConfigPrecificacao
} = require('./pricingCore');

/**
 * Extrai histórico de execuções de um serviço por catalogId, categoria ou texto normalizado
 */
function consultarHistoricoServico({ tenantId, state, serviceId = null, serviceNome = null, categoria = null }) {
  if (!state) return null;
  const config = obterConfigPrecificacao(state);
  const osLista = (state.os || []).filter(o => (o.tenantId === tenantId || !o.tenantId) && o.st !== 'cancelada');
  const laborEntries = (state.laborEntries || []).filter(e => (e.tenantId === tenantId || !e.tenantId) && e.status !== 'cancelado');
  const pecasCatalogo = state.pecas || [];

  const normBusca = normalizarTexto(serviceNome || '');
  const normCat = normalizarTexto(categoria || '');

  const execucoes = [];
  const tempos = [];
  const custosMO = [];
  const custosPecas = [];
  const precosVenda = [];
  let totalRetrabalhoMinutos = 0;
  let totalMinutos = 0;
  let totalGarantias = 0;
  let totalCortesias = 0;

  for (const os of osLista) {
    const isGarantiaOS = Boolean(os.possivelGarantia || os.garantia || os.tipo === 'garantia');
    const servicosOS = Array.isArray(os.servicos) ? os.servicos : [];

    for (const s of servicosOS) {
      const matchId = serviceId && (s.id === serviceId || s.codigo === serviceId || s.serviceCatalogId === serviceId);
      const nomeS = normalizarTexto(s.nome || s.desc || '');
      const matchNome = normBusca && (nomeS === normBusca || (normBusca.length >= 4 && nomeS.includes(normBusca)));
      const matchCat = normCat && (normalizarTexto(s.categoria || '') === normCat);

      if (matchId || matchNome || matchCat) {
        const isGarantia = isGarantiaOS || Boolean(s.garantia || s.tipo === 'garantia');
        const precoItem = Number(s.preco != null ? s.preco : s.valor || 0);
        const isCortesia = Boolean(s.cortesia || (precoItem === 0 && !isGarantia));

        if (isGarantia) totalGarantias++;
        if (isCortesia) totalCortesias++;

        const apontamentos = laborEntries.filter(
          e => e.osId === os.id && (e.serviceItemId === s.id || normalizarTexto(e.serviceNome || '') === nomeS)
        );

        let duracaoMinutos = 0;
        let custoMOServico = 0;
        let minutosRetrabalhoItem = 0;

        for (const e of apontamentos) {
          const worker = (state.workers || []).find(w => w.id === e.workerId);
          const cHora = Number(worker?.custoHora) || 0;
          const dur = Number(e.durationMinutes) || 0;
          duracaoMinutos += dur;
          custoMOServico += (dur / 60) * cHora;
          if (e.type === 'retrabalho') {
            minutosRetrabalhoItem += dur;
          }
        }

        if (duracaoMinutos === 0 && s.tempoRealMinutos) {
          duracaoMinutos = Number(s.tempoRealMinutos);
        } else if (duracaoMinutos === 0 && (s.tempoEstimadoMinutos || s.horas)) {
          duracaoMinutos = Number(s.tempoEstimadoMinutos || (s.horas * 60));
        }

        let custoPecasItem = 0;
        if (Array.isArray(s.pecasNecessarias)) {
          for (const pn of s.pecasNecessarias) {
            const pecaObj = pecasCatalogo.find(p => p.id === pn.partId || p.id === pn.pecaId);
            const cUnit = Number(pecaObj?.custoMedio != null ? pecaObj.custoMedio : pecaObj?.custo || 0);
            custoPecasItem += (Number(pn.qtd) || 1) * cUnit;
          }
        }

        totalMinutos += duracaoMinutos;
        totalRetrabalhoMinutos += minutosRetrabalhoItem;

        if (duracaoMinutos > 0) {
          tempos.push(duracaoMinutos);
          custosMO.push(arredondar(custoMOServico));
        }
        if (custoPecasItem > 0) {
          custosPecas.push(arredondar(custoPecasItem));
        }

        if (!isGarantia && !isCortesia && precoItem > 0) {
          precosVenda.push(arredondar(precoItem));
        }

        execucoes.push({
          osId: os.id,
          osNum: os.num || os.id,
          data: os.abertura || os.criadoEm,
          servicoNome: s.nome || s.desc,
          duracaoMinutos,
          custoMO: arredondar(custoMOServico),
          custoPecas: arredondar(custoPecasItem),
          custoTotal: arredondar(custoMOServico + custoPecasItem),
          precoVenda: precoItem,
          isGarantia,
          isCortesia,
          teveRetrabalho: minutosRetrabalhoItem > 0
        });
      }
    }
  }

  const quantidadeExecucoes = execucoes.length;
  const tempoMediano = tempos.length ? calcularMediana(tempos) : null;
  const tempoMedio = tempos.length ? arredondar(tempos.reduce((a, b) => a + b, 0) / tempos.length) : null;

  const limiteOutlier = tempoMediano > 0 ? tempoMediano * 3 : Infinity;
  const execucoesComOutlier = execucoes.map(ex => {
    const isOutlier = ex.duracaoMinutos > limiteOutlier;
    return {
      ...ex,
      tempoRealMinutos: ex.duracaoMinutos,
      outlier: isOutlier,
      flagOutlier: isOutlier,
      motivoOutlier: isOutlier ? `Tempo (${ex.duracaoMinutos}m) superior a 3x a mediana (${tempoMediano}m)` : null
    };
  });

  const custoMedioMO = custosMO.length ? arredondar(custosMO.reduce((a, b) => a + b, 0) / custosMO.length) : 0;
  const custoMedioPecas = custosPecas.length ? arredondar(custosPecas.reduce((a, b) => a + b, 0) / custosPecas.length) : 0;
  const custoMedioTotal = arredondar(custoMedioMO + custoMedioPecas);

  const precoMedioVenda = precosVenda.length ? arredondar(precosVenda.reduce((a, b) => a + b, 0) / precosVenda.length) : 0;
  const precoVendaMediano = precosVenda.length ? calcularMediana(precosVenda) : null;
  const precoVendaMedio = precoMedioVenda;
  const margemMedia = precoMedioVenda > 0 ? calcularMargemBruta(precoMedioVenda, custoMedioTotal) : 0;

  const percentualRetrabalho = totalMinutos > 0
    ? arredondar((totalRetrabalhoMinutos / totalMinutos) * 100, 1)
    : 0;

  return {
    tenantId,
    serviceId,
    serviceNome: serviceNome || (execucoes[0]?.servicoNome) || 'Serviço',
    categoria: categoria || null,
    quantidadeExecucoes,
    baseHistoricaInsuficiente: quantidadeExecucoes < config.amostraMinimaHistorico,
    amostraSuficiente: quantidadeExecucoes >= config.amostraMinimaHistorico,
    tempoMediano,
    tempoMedio,
    temposMinutos: tempos,
    custoMedioMO,
    custoMedioPecas,
    custoMedioTotal,
    precoMedioVenda,
    margemMedia,
    percentualRetrabalho,
    totalRetrabalhoMinutos,
    totalGarantias,
    totalCortesias,
    execucoesGarantia: totalGarantias,
    execucoesCortesia: totalCortesias,
    precoVendaMediano,
    precoVendaMedio,
    outliers: execucoesComOutlier.filter(e => e.outlier),
    limiteOutlier: limiteOutlier !== Infinity ? limiteOutlier : null,
    execucoes: execucoesComOutlier,
    execucoesValidas: execucoesComOutlier
  };
}

/**
 * Calcula o custo esperado de um serviço segundo a hierarquia das fontes
 */
function calcularCustoEsperadoServico({
  tenantId,
  state,
  serviceId = null,
  serviceNome = null,
  categoria = null,
  pecasSolicitadas = [],
  pecasEspecificadas = [],
  horaCustoBase = null
}) {
  if (!pecasSolicitadas?.length && pecasEspecificadas?.length) {
    pecasSolicitadas = pecasEspecificadas;
  }
  if (!state) return null;
  const config = obterConfigPrecificacao(state);
  const historico = consultarHistoricoServico({ tenantId, state, serviceId, serviceNome, categoria });

  let tempoEsperadoMinutos = null;
  let fonteTempo = null;

  if (historico && historico.quantidadeExecucoes >= config.amostraMinimaHistorico && historico.tempoMediano > 0) {
    tempoEsperadoMinutos = historico.tempoMediano;
    fonteTempo = 'historico_real_mediana';
  } else if (historico && historico.quantidadeExecucoes > 0 && (historico.tempoMediano > 0 || historico.tempoMedio > 0)) {
    tempoEsperadoMinutos = historico.tempoMediano || historico.tempoMedio;
    fonteTempo = 'historico_real_amostra_baixa';
  } else {
    const srvCatalogo = (state.servicos || []).find(
      s => s.id === serviceId || (serviceNome && normalizarTexto(s.nome || '') === normalizarTexto(serviceNome))
    );
    if (srvCatalogo?.tempoEstimadoMinutos) {
      tempoEsperadoMinutos = Number(srvCatalogo.tempoEstimadoMinutos);
      fonteTempo = 'catalogo';
    } else if (srvCatalogo?.horas) {
      tempoEsperadoMinutos = Number(srvCatalogo.horas) * 60;
      fonteTempo = 'catalogo';
    }
  }

  let custoHoraEquipe = horaCustoBase ? Number(horaCustoBase) : null;
  if (!custoHoraEquipe) {
    const workersAtivos = (state.workers || []).filter(w => (w.tenantId === tenantId || !w.tenantId) && w.ativo !== false && w.custoHora > 0);
    if (workersAtivos.length > 0) {
      custoHoraEquipe = arredondar(workersAtivos.reduce((a, w) => a + Number(w.custoHora), 0) / workersAtivos.length);
    } else {
      custoHoraEquipe = 40.0;
    }
  }

  const custoMOEsperado = tempoEsperadoMinutos != null
    ? arredondar((tempoEsperadoMinutos / 60) * custoHoraEquipe)
    : (historico?.custoMedioMO || 0);

  let custoPecasEsperado = 0;
  let variacaoCustoDetectada = null;
  const detalhePecas = [];

  if (Array.isArray(pecasSolicitadas) && pecasSolicitadas.length > 0) {
    for (const pReq of pecasSolicitadas) {
      const pecaEstoque = (state.pecas || []).find(p => p.id === pReq.partId || p.id === pReq.id || p.id === pReq.pecaId);
      const qtd = Math.max(1, Number(pReq.quantidade || pReq.qtd) || 1);

      let custoUnit = null;
      let fontePeca = null;

      if (pecaEstoque?.custoMedio != null && Number(pecaEstoque.custoMedio) > 0) {
        custoUnit = Number(pecaEstoque.custoMedio);
        fontePeca = 'custo_medio_estoque';
      } else if (pecaEstoque?.ultimoCusto != null && Number(pecaEstoque.ultimoCusto) > 0) {
        custoUnit = Number(pecaEstoque.ultimoCusto);
        fontePeca = 'ultimo_custo_compra';
      } else if (pecaEstoque?.custo != null && Number(pecaEstoque.custo) > 0) {
        custoUnit = Number(pecaEstoque.custo);
        fontePeca = 'custo_cadastrado';
      } else if (pReq.custoUnitario != null) {
        custoUnit = Number(pReq.custoUnitario);
        fontePeca = 'custo_informado';
      }

      if (custoUnit != null) {
        const subtotal = arredondar(qtd * custoUnit);
        custoPecasEsperado += subtotal;

        if (pecaEstoque?.custoAnterior && pecaEstoque.custoAnterior > 0) {
          const varPerc = arredondar(((custoUnit - pecaEstoque.custoAnterior) / pecaEstoque.custoAnterior) * 100, 1);
          if (varPerc > 20) {
            variacaoCustoDetectada = {
              partId: pecaEstoque.id,
              descricao: pecaEstoque.descricao || pecaEstoque.nome,
              custoHistorico: pecaEstoque.custoAnterior,
              custoAtual: custoUnit,
              variacaoPercentual: varPerc,
              alerta: `Custo da peça "${pecaEstoque.descricao || pecaEstoque.nome}" acima do histórico (+${varPerc}%). Revisar preço antes de enviar orçamento.`
            };
          }
        }

        detalhePecas.push({
          partId: pecaEstoque?.id || pReq.partId || pReq.id,
          descricao: pecaEstoque?.descricao || pecaEstoque?.nome || pReq.nome || 'Peça',
          quantidade: qtd,
          custoUnitario: arredondar(custoUnit),
          custoTotal: subtotal,
          fonte: fontePeca,
          fonteCusto: fontePeca
        });
      }
    }
  } else if (historico && historico.custoMedioPecas > 0) {
    custoPecasEsperado = historico.custoMedioPecas;
  }

  custoPecasEsperado = arredondar(custoPecasEsperado);
  const custoTotalEsperado = arredondar(custoMOEsperado + custoPecasEsperado);

  return {
    tempoEsperadoMinutos,
    tempoFormatado: tempoEsperadoMinutos != null
      ? `${Math.floor(tempoEsperadoMinutos / 60)}h${tempoEsperadoMinutos % 60 ? ' ' + String(Math.round(tempoEsperadoMinutos % 60)).padStart(2, '0') + 'm' : ''}`
      : 'Não estimado',
    fonteTempo: fonteTempo || 'indisponivel',
    custoHoraEquipe,
    custoMOEsperado,
    custoMaoObraEsperado: custoMOEsperado,
    custoPecasEsperado,
    custoTotalEsperado,
    detalhePecas,
    itensPecasDetalhados: detalhePecas,
    variacaoCustoDetectada,
    historico
  };
}

module.exports = {
  consultarHistoricoServico,
  calcularCustoEsperadoServico
};

