'use strict';

const crypto = require('crypto');
const { obterAgoraSP } = require('./financialEngine');
const costingService = require('./costingService');

const DEFAULT_PRECIFICACAO_CONFIG = {
  margemAlvoPadrao: 35,       // 35%
  margemMinimaPadrao: 20,     // 20%
  amostraMinimaHistorico: 5,   // Mínimo de 5 ocorrências para considerar amostra suficiente
  confianca: {
    mediaMinimo: 5,
    altaMinimo: 10
  },
  protecaoMargem: {
    modo: 'alertar'           // 'desativado' | 'alertar' | 'exigir_confirmacao' | 'exigir_aprovacao'
  },
  margensPorCategoria: {
    SUSPENSAO: { minima: 25, alvo: 40 },
    FREIOS: { minima: 25, alvo: 38 },
    DIRECAO: { minima: 25, alvo: 40 },
    TRANSMISSAO: { minima: 25, alvo: 38 },
    MOTOR: { minima: 25, alvo: 35 },
    ELETRICA: { minima: 30, alvo: 45 },
    ESTRUTURAL: { minima: 25, alvo: 40 }
  }
};

function gerarId(prefix = 'prc') {
  return `${prefix}_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
}

function arredondar(val, decimais = 2) {
  const n = Number(val) || 0;
  return Number(Math.round(n + 'e' + decimais) + 'e-' + decimais);
}

function normalizarTexto(txt) {
  return String(txt || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function registrarAuditoria(state, entrada) {
  if (!state.auditoria) state.auditoria = [];
  state.auditoria.unshift({
    id: gerarId('aud'),
    timestamp: new Date().toISOString(),
    ...entrada
  });
  if (state.auditoria.length > 500) {
    state.auditoria = state.auditoria.slice(0, 500);
  }
}

function obterConfigPrecificacao(state) {
  const cfgTenant = state?.cfg?.precificacao || {};
  return {
    margemAlvoPadrao: Number(cfgTenant.margemAlvoPadrao) || DEFAULT_PRECIFICACAO_CONFIG.margemAlvoPadrao,
    margemMinimaPadrao: Number(cfgTenant.margemMinimaPadrao) || DEFAULT_PRECIFICACAO_CONFIG.margemMinimaPadrao,
    amostraMinimaHistorico: Number(cfgTenant.amostraMinimaHistorico) || DEFAULT_PRECIFICACAO_CONFIG.amostraMinimaHistorico,
    confianca: {
      mediaMinimo: Number(cfgTenant.confianca?.mediaMinimo) || (cfgTenant.amostraMinimaHistorico ? Number(cfgTenant.amostraMinimaHistorico) : DEFAULT_PRECIFICACAO_CONFIG.confianca.mediaMinimo),
      altaMinimo: Number(cfgTenant.confianca?.altaMinimo) || DEFAULT_PRECIFICACAO_CONFIG.confianca.altaMinimo
    },
    protecaoMargem: {
      modo: cfgTenant.protecaoMargem?.modo || DEFAULT_PRECIFICACAO_CONFIG.protecaoMargem.modo
    },
    margensPorCategoria: {
      ...DEFAULT_PRECIFICACAO_CONFIG.margensPorCategoria,
      ...(cfgTenant.margensPorCategoria || {})
    }
  };
}

// ── FÓRMULAS FUNDAMENTAIS DETERMINÍSTICAS ─────────────────────────────

/**
 * Margem Bruta = ((Preço - Custo) / Preço) * 100
 * Retorna estritamente percentual sobre a RECEITA/PREÇO DE VENDA.
 */
function calcularMargemBruta(preco, custo) {
  const p = Number(preco) || 0;
  const c = Number(custo) || 0;
  if (p <= 0) return 0;
  return arredondar(((p - c) / p) * 100, 2);
}

/**
 * Markup = ((Preço - Custo) / Custo) * 100
 * Retorna percentual aplicado SOBRE O CUSTO.
 */
function calcularMarkup(preco, custo) {
  const p = Number(preco) || 0;
  const c = Number(custo) || 0;
  if (c <= 0) return 0;
  return arredondar(((p - c) / c) * 100, 2);
}

/**
 * Preço Alvo = Custo / (1 - (margemAlvo / 100))
 * Exemplo: Custo 1200, Margem 40% -> 1200 / 0.6 = 2000.
 */
function calcularPrecoAlvo(custo, margemAlvoPercentual) {
  const c = Number(custo) || 0;
  const m = Number(margemAlvoPercentual);
  if (isNaN(m) || m >= 100 || m < 0) {
    throw new Error('Margem inválida: deve ser >= 0 e < 100');
  }
  if (c === 0 || m === 0) return arredondar(c);
  const divisor = 1 - (m / 100);
  return arredondar(c / divisor);
}

/**
 * Preço Mínimo = Custo / (1 - (margemMinima / 100))
 * Exemplo: Custo 1200, Margem 20% -> 1200 / 0.8 = 1500.
 */
function calcularPrecoMinimo(custo, margemMinimaPercentual) {
  const c = Number(custo) || 0;
  const m = Number(margemMinimaPercentual);
  if (isNaN(m) || m >= 100 || m < 0) {
    throw new Error('Margem inválida: deve ser >= 0 e < 100');
  }
  if (c === 0 || m === 0) return arredondar(c);
  const divisor = 1 - (m / 100);
  return arredondar(c / divisor);
}

/**
 * Desconto Máximo Seguro = max(0, Preço Atual - Preço Mínimo)
 */
function calcularDescontoSeguro(precoAtual, precoMinimo) {
  const p = Number(precoAtual) || 0;
  const min = Number(precoMinimo) || 0;
  const desc = arredondar(Math.max(0, p - min));
  const pct = p > 0 ? arredondar((desc / p) * 100, 2) : 0;
  return {
    descontoMaximoSeguro: desc,
    descontoMaximoPercentual: pct,
    jaAbaixoDoMinimo: p < min,
    valueOf() { return desc; },
    toString() { return String(desc); }
  };
}

/**
 * Preço Líquido e Margem Resultante após aplicação de desconto
 */
function calcularPrecoLiquidoEMargem(preco, desconto, custo) {
  const p = Number(preco) || 0;
  const d = Math.max(0, Number(desconto) || 0);
  const c = Number(custo) || 0;
  const precoLiquido = arredondar(Math.max(0, p - d));
  const margemResultante = calcularMargemBruta(precoLiquido, c);
  return {
    precoOriginal: arredondar(p),
    desconto: arredondar(d),
    precoLiquido,
    custo: arredondar(c),
    margemResultante
  };
}

/**
 * Calcula a Mediana de um array numérico
 */
function calcularMediana(valores = []) {
  if (!Array.isArray(valores) || valores.length === 0) return 0;
  const ordenados = [...valores].map(Number).filter(n => !isNaN(n)).sort((a, b) => a - b);
  if (!ordenados.length) return 0;
  const meio = Math.floor(ordenados.length / 2);
  if (ordenados.length % 2 === 0) {
    return arredondar((ordenados[meio - 1] + ordenados[meio]) / 2);
  }
  return arredondar(ordenados[meio]);
}

// ── 1. HISTÓRICO DETERMINÍSTICO DE EXECUÇÃO ───────────────────────────

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

        // Apontamentos específicos deste serviço nesta OS
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

        // Se não tiver apontamento mas tiver duração estimada na OS
        if (duracaoMinutos === 0 && s.tempoRealMinutos) {
          duracaoMinutos = Number(s.tempoRealMinutos);
        } else if (duracaoMinutos === 0 && (s.tempoEstimadoMinutos || s.horas)) {
          duracaoMinutos = Number(s.tempoEstimadoMinutos || (s.horas * 60));
        }

        // Custo de peças vinculadas
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

        // Preço comercial considerado apenas se NÃO for garantia nem cortesia
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

  // Detecção explícita de outliers (> 3x mediana) sem exclusão silenciosa
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

// ── 2. CUSTO ESPERADO DO SERVIÇO ──────────────────────────────────────

/**
 * Calcula o custo esperado de um serviço segundo a hierarquia das fontes:
 * Tempo: 1. Histórico real mediano -> 2. Histórico geral -> 3. Estimado catálogo -> 4. null
 * Peças: 1. Custo médio estoque -> 2. Último custo real -> 3. Custo cadastrado -> 4. null
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

  // 1. Apuração de Mão de Obra
  let tempoEsperadoMinutos = null;
  let fonteTempo = null;

  if (historico && historico.quantidadeExecucoes >= config.amostraMinimaHistorico && historico.tempoMediano > 0) {
    tempoEsperadoMinutos = historico.tempoMediano;
    fonteTempo = 'historico_real_mediana';
  } else if (historico && historico.quantidadeExecucoes > 0 && (historico.tempoMediano > 0 || historico.tempoMedio > 0)) {
    tempoEsperadoMinutos = historico.tempoMediano || historico.tempoMedio;
    fonteTempo = 'historico_real_amostra_baixa';
  } else {
    // 3. Fallback para catálogo
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

  // Custo por hora da equipe
  let custoHoraEquipe = horaCustoBase ? Number(horaCustoBase) : null;
  if (!custoHoraEquipe) {
    const workersAtivos = (state.workers || []).filter(w => (w.tenantId === tenantId || !w.tenantId) && w.ativo !== false && w.custoHora > 0);
    if (workersAtivos.length > 0) {
      custoHoraEquipe = arredondar(workersAtivos.reduce((a, w) => a + Number(w.custoHora), 0) / workersAtivos.length);
    } else {
      custoHoraEquipe = 40.0; // Fallback seguro da categoria pesada
    }
  }

  const custoMOEsperado = tempoEsperadoMinutos != null
    ? arredondar((tempoEsperadoMinutos / 60) * custoHoraEquipe)
    : (historico?.custoMedioMO || 0);

  // 2. Apuração de Peças
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

        // Verifica variação em relação ao histórico de compras da peça
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

// ── 3. RECOMENDAÇÃO ASSISTIDA E DETERMINÍSTICA DE PREÇO ───────────────

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

  // Confiança da recomendação
  const amostra = apuracaoCusto?.historico?.quantidadeExecucoes || 0;
  const altaMin = config.confianca?.altaMinimo || 10;
  const mediaMin = config.confianca?.mediaMinimo || config.amostraMinimaHistorico || 5;
  let confianca = 'baixa';
  if (amostra >= altaMin) confianca = 'alta';
  else if (amostra >= mediaMin) confianca = 'media';

  // Análise do Preço Atual (se informado ou se houver catálogo)
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

  // Texto explicativo da recomendação
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

  // RBAC: Usuários sem permissão não recebem custos e margens
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

// ── 4. POLÍTICAS DE PROTEÇÃO DE MARGEM & OVERRIDE ─────────────────────

/**
 * Valida a política configurada no tenant para preços propostos
 */
function validarPoliticaMargem({
  tenantId,
  state,
  modo,
  precoProposto,
  precoMinimo,
  margemMinima,
  confirmado = false,
  userPermissions = [],
  actorId = 'operador',
  motivo = null
}) {
  const config = state ? obterConfigPrecificacao(state) : DEFAULT_PRECIFICACAO_CONFIG;
  const modoPolitica = modo || config?.protecaoMargem?.modo || config?.modo || 'alertar';
  const prop = Number(precoProposto) || 0;
  const min = Number(precoMinimo) || 0;

  if (modoPolitica === 'desativado') {
    return { permitido: true, modo: 'desativado', severidade: 'info', aviso: null, bloqueado: false, abaixoMinimo: prop < min };
  }

  if (prop >= min) {
    return { permitido: true, modo: modoPolitica, severidade: 'info', aviso: null, bloqueado: false, abaixoMinimo: false };
  }

  // Abaixo do mínimo:
  if (modoPolitica === 'alertar') {
    const aviso = `Atenção: o preço proposto (R$ ${prop.toFixed(2)}) está abaixo do piso mínimo de segurança (R$ ${min.toFixed(2)}).`;
    return {
      permitido: true,
      modo: 'alertar',
      severidade: 'aviso',
      aviso,
      alerta: aviso,
      bloqueado: false,
      abaixoMinimo: true
    };
  }

  if (modoPolitica === 'exigir_confirmacao') {
    if (confirmado) {
      return { permitido: true, modo: 'exigir_confirmacao', severidade: 'info', aviso: null, bloqueado: false, abaixoMinimo: true };
    }
    const aviso = `O preço proposto (R$ ${prop.toFixed(2)}) está abaixo do piso mínimo (R$ ${min.toFixed(2)}). Confirme para prosseguir.`;
    return {
      permitido: false,
      requerConfirmacao: true,
      modo: 'exigir_confirmacao',
      severidade: 'alerta',
      aviso,
      alerta: aviso,
      bloqueado: true,
      abaixoMinimo: true
    };
  }

  if (modoPolitica === 'exigir_aprovacao') {
    const podeAprovar = userPermissions.includes('*') || userPermissions.includes('pricing:override');
    if (!podeAprovar) {
      const erro = `Operação bloqueada: o preço de venda (R$ ${prop.toFixed(2)}) está abaixo do preço mínimo exigido (R$ ${min.toFixed(2)}). Exige permissão pricing:override.`;
      return {
        permitido: false,
        bloqueado: true,
        requerOverride: true,
        requerAprovacao: true,
        modo: 'exigir_aprovacao',
        severidade: 'erro',
        aviso: erro,
        erro,
        abaixoMinimo: true
      };
    }
    return {
      permitido: true,
      bloqueado: false,
      requerOverride: false,
      requerAprovacao: false,
      aprovadoPorOverride: true,
      modo: 'exigir_aprovacao',
      severidade: 'info',
      aviso: null,
      abaixoMinimo: true
    };
  }

  return { permitido: true, modo: modoPolitica, severidade: 'info', aviso: null, bloqueado: false, abaixoMinimo: prop < min };
}

/**
 * Registra override de preço aprovado por gestor
 */
function registrarOverridePreco({
  tenantId,
  state,
  quotationId,
  serviceId,
  partId,
  itemIndex = 0,
  precoAutorizado,
  precoProposto,
  precoRecomendado,
  precoMinimo,
  margemResultante,
  motivo,
  actorId,
  autorizadoPor
}) {
  if (!state) throw new Error('Estado do tenant é obrigatório.');
  state.pricingOverrides = Array.isArray(state.pricingOverrides) ? state.pricingOverrides : [];

  const preco = precoAutorizado != null ? precoAutorizado : precoProposto;
  const autorizador = actorId || autorizadoPor || 'gestor';

  const override = {
    id: gerarId('pover'),
    tenantId,
    quotationId,
    serviceId: serviceId || null,
    partId: partId || null,
    itemIndex,
    precoAutorizado: arredondar(preco),
    precoProposto: arredondar(preco),
    precoRecomendado: arredondar(precoRecomendado || precoMinimo || 0),
    precoMinimo: arredondar(precoMinimo),
    margemResultante: arredondar(margemResultante || 0, 1),
    motivo: String(motivo || 'Autorização gerencial').trim(),
    quemAprovou: autorizador,
    autorizadoPor: autorizador,
    timestamp: new Date().toISOString()
  };

  state.pricingOverrides.unshift(override);

  if (!state.auditoria) state.auditoria = [];
  state.auditoria.unshift({
    id: gerarId('aud'),
    dataHora: override.timestamp,
    timestamp: override.timestamp,
    tenantId,
    tipo: 'pricing_override',
    usuario: autorizador,
    actorId: autorizador,
    intencao: 'pricing_override_approved',
    resumo: `Override de preço autorizado por "${autorizador}": R$ ${override.precoProposto} (mínimo: R$ ${override.precoMinimo}). Motivo: ${override.motivo}`,
    quotationId,
    overrideId: override.id
  });

  return { ok: true, override };
}

// ── 5. RELATÓRIOS E CONSULTAS DE RENTABILIDADE ────────────────────────

function filtrarPorPeriodo(itens = [], periodo = '30d', dataInicio = null, dataFim = null) {
  const agoraSP = obterAgoraSP();
  const hoje = agoraSP.dataISO;
  const hojeDate = agoraSP.dataObj;

  let limiteData = null;
  if (periodo === 'hoje') {
    limiteData = hoje;
  } else if (periodo === '7d') {
    const d = new Date(hojeDate.getTime() - 7 * 86400000);
    limiteData = d.toISOString().slice(0, 10);
  } else if (periodo === '30d' || periodo === 'mes') {
    const d = new Date(hojeDate.getTime() - 30 * 86400000);
    limiteData = d.toISOString().slice(0, 10);
  } else if (periodo === 'mes_anterior') {
    const d = new Date(hojeDate.getTime() - 60 * 86400000);
    limiteData = d.toISOString().slice(0, 10);
  } else if (periodo === 'personalizado' && dataInicio) {
    limiteData = dataInicio;
  }

  return itens.filter(it => {
    const dt = String(it.abertura || it.criadoEm || it.timestamp || it.dataHora || '').slice(0, 10);
    if (!dt) return true;
    if (periodo === 'hoje') return dt === hoje;
    if (limiteData && dt < limiteData) return false;
    if (dataFim && dt > dataFim) return false;
    return true;
  });
}

/**
 * Resumo consolidado de rentabilidade da oficina
 */
function obterResumoRentabilidade({ tenantId, state, periodo = '30d', dataInicio = null, dataFim = null }) {
  if (!state) return null;
  const config = obterConfigPrecificacao(state);
  const osTenant = (state.os || []).filter(o => (o.tenantId === tenantId || !o.tenantId) && o.st !== 'cancelada');
  const osFiltradas = filtrarPorPeriodo(osTenant, periodo, dataInicio, dataFim);

  let receitaAutorizadaTotal = 0;
  let custoRealTotal = 0;
  let margemBrutaTotal = 0;
  let custoRetrabalhoTotal = 0;
  let horasRetrabalhoTotal = 0;
  let horasProdutivasTotal = 0;
  let totalOS = 0;
  let osAbaixoMargemMinima = 0;

  for (const os of osFiltradas) {
    try {
      const apuracao = costingService.calcularCustoRealOS({ tenantId, state, osId: os.id });
      if (apuracao) {
        totalOS++;
        let custoMO = apuracao.custoMaoObra;
        let horasMO = apuracao.horasHomemTotal;
        if (custoMO === 0 && Array.isArray(os.servicos)) {
          for (const s of os.servicos) {
            if (s.tempoRealMinutos || s.horasReais) {
              const min = Number(s.tempoRealMinutos) || (Number(s.horasReais || 0) * 60);
              const workers = (state.workers || []).filter(w => w.ativo !== false && w.custoHora > 0);
              const cHora = workers.length ? (workers.reduce((a, w) => a + Number(w.custoHora), 0) / workers.length) : 50;
              custoMO += (min / 60) * cHora;
              horasMO += min / 60;
            }
          }
        }
        const custoRealOS = arredondar(apuracao.custoPecasConsumidas + custoMO);
        const margemBrutaOS = arredondar(apuracao.receitaAutorizada - custoRealOS);
        const margemPct = apuracao.receitaAutorizada > 0 ? arredondar((margemBrutaOS / apuracao.receitaAutorizada) * 100, 1) : 0;

        receitaAutorizadaTotal += apuracao.receitaAutorizada;
        custoRealTotal += custoRealOS;
        margemBrutaTotal += margemBrutaOS;
        custoRetrabalhoTotal += apuracao.custoRetrabalho;
        horasRetrabalhoTotal += apuracao.horasRetrabalho;
        horasProdutivasTotal += horasMO;

        if (apuracao.receitaAutorizada > 0 && margemPct < config.margemMinimaPadrao) {
          osAbaixoMargemMinima++;
        }
      }
    } catch (_) {}
  }

  receitaAutorizadaTotal = arredondar(receitaAutorizadaTotal);
  custoRealTotal = arredondar(custoRealTotal);
  margemBrutaTotal = arredondar(margemBrutaTotal);
  custoRetrabalhoTotal = arredondar(custoRetrabalhoTotal);
  horasRetrabalhoTotal = arredondar(horasRetrabalhoTotal, 2);
  horasProdutivasTotal = arredondar(horasProdutivasTotal, 2);

  const margemMediaPercentual = receitaAutorizadaTotal > 0
    ? arredondar((margemBrutaTotal / receitaAutorizadaTotal) * 100, 2)
    : 0;

  const ticketMedio = totalOS > 0
    ? arredondar(receitaAutorizadaTotal / totalOS)
    : 0;

  return {
    tenantId,
    periodo,
    receitaAutorizada: receitaAutorizadaTotal,
    receitaTotal: receitaAutorizadaTotal,
    custoReal: custoRealTotal,
    custoRealTotal: custoRealTotal,
    margemBruta: margemBrutaTotal,
    margemBrutaTotal: margemBrutaTotal,
    margemMediaPercentual,
    margemPercentualGeral: margemMediaPercentual,
    totalOS,
    totalOrdensFinalizadas: totalOS,
    osAbaixoMargemMinima,
    ticketMedio,
    custoRetrabalho: custoRetrabalhoTotal,
    horasRetrabalho: horasRetrabalhoTotal,
    horasProdutivas: horasProdutivasTotal,
    margemAlvoPadrao: config.margemAlvoPadrao,
    margemMinimaPadrao: config.margemMinimaPadrao
  };
}

/**
 * Rentabilidade detalhada agrupada por serviço
 */
function obterRentabilidadeServicos({ tenantId, state, periodo = '30d', ordenacao, ordenarPor, limite = 50 }) {
  if (!state) return [];
  const config = obterConfigPrecificacao(state);
  const ord = ordenarPor || ordenacao || 'margem_desc';
  const servicosMap = new Map();
  const osTenant = (state.os || []).filter(o => (o.tenantId === tenantId || !o.tenantId) && o.st !== 'cancelada');
  const osFiltradas = filtrarPorPeriodo(osTenant, periodo);
  const laborEntries = (state.laborEntries || []).filter(e => (e.tenantId === tenantId || !e.tenantId) && e.status !== 'cancelado');

  for (const os of osFiltradas) {
    for (const s of (os.servicos || [])) {
      if (s.autorizado === false || s.status === 'recusado') continue;
      const chave = s.serviceCatalogId || s.id || normalizarTexto(s.nome || 'servico');
      const nome = s.nome || s.desc || 'Serviço';
      const categoria = s.categoria || 'Geral';
      const preco = Number(s.preco != null ? s.preco : s.valor || 0);

      if (!servicosMap.has(chave)) {
        servicosMap.set(chave, {
          chave,
          nome,
          categoria,
          quantidade: 0,
          receita: 0,
          custoMO: 0,
          custoPecas: 0,
          custoTotal: 0,
          minutosProdutivos: 0,
          minutosRetrabalho: 0,
          execucoesRetrabalho: 0
        });
      }

      const item = servicosMap.get(chave);
      item.quantidade++;
      item.receita += preco;

      const apontamentos = laborEntries.filter(
        e => e.osId === os.id && (e.serviceItemId === s.id || normalizarTexto(e.serviceNome || '') === normalizarTexto(nome))
      );

      if (apontamentos.length > 0) {
        for (const e of apontamentos) {
          const worker = (state.workers || []).find(w => w.id === e.workerId);
          const cHora = Number(worker?.custoHora) || 0;
          const dur = Number(e.durationMinutes) || 0;
          item.minutosProdutivos += dur;
          item.custoMO += (dur / 60) * cHora;
          if (e.type === 'retrabalho') {
            item.minutosRetrabalho += dur;
            item.execucoesRetrabalho++;
          }
        }
      } else if (s.tempoRealMinutos || s.horasReais) {
        const dur = Number(s.tempoRealMinutos) || (Number(s.horasReais || 0) * 60);
        item.minutosProdutivos += dur;
        const workersAtivos = (state.workers || []).filter(w => w.ativo !== false && w.custoHora > 0);
        const custoHoraMedio = workersAtivos.length ? (workersAtivos.reduce((a, b) => a + Number(b.custoHora), 0) / workersAtivos.length) : 50;
        item.custoMO += (dur / 60) * custoHoraMedio;
      }

      if (s.retrabalho) {
        item.minutosRetrabalho += (Number(s.tempoRealMinutos) || 60);
        item.execucoesRetrabalho++;
      }
    }
  }

  const lista = Array.from(servicosMap.values()).map(it => {
    const receita = arredondar(it.receita);
    const custoMO = arredondar(it.custoMO);
    const custoPecas = arredondar(it.custoPecas);
    const custoTotal = arredondar(custoMO + custoPecas);
    const margemBruta = arredondar(receita - custoTotal);
    const margemPercentual = receita > 0 ? arredondar((margemBruta / receita) * 100, 1) : 0;
    const horasProdutivas = arredondar(it.minutosProdutivos / 60, 2);
    const taxaRetrabalho = it.quantidade > 0 ? arredondar((it.execucoesRetrabalho / it.quantidade) * 100, 1) : 0;

    return {
      chave: it.chave,
      serviceId: it.chave,
      nome: it.nome,
      serviceNome: it.nome,
      categoria: it.categoria,
      quantidadeExecucoes: it.quantidade,
      receita,
      receitaTotal: receita,
      custoMO,
      custoPecas,
      custoTotal,
      custoRealTotal: custoTotal,
      margemBruta,
      margemPercentual,
      horasProdutivas,
      percentualRetrabalho: taxaRetrabalho,
      taxaRetrabalho,
      execucoesRetrabalho: it.execucoesRetrabalho,
      abaixoDaMargemMinima: margemPercentual < config.margemMinimaPadrao,
      ticketMedio: it.quantidade > 0 ? arredondar(receita / it.quantidade) : 0
    };
  });

  if (ord === 'margem_desc') {
    lista.sort((a, b) => b.margemPercentual - a.margemPercentual);
  } else if (ord === 'margem_asc') {
    lista.sort((a, b) => a.margemPercentual - b.margemPercentual);
  } else if (ord === 'receita_desc') {
    lista.sort((a, b) => b.receita - a.receita);
  } else if (ord === 'custo_desc') {
    lista.sort((a, b) => b.custoTotal - a.custoTotal);
  } else if (ord === 'retrabalho_desc') {
    lista.sort((a, b) => b.taxaRetrabalho - a.taxaRetrabalho);
  } else if (ord === 'horas_desc') {
    lista.sort((a, b) => b.horasProdutivas - a.horasProdutivas);
  }

  return lista.slice(0, limite);
}

/**
 * Rentabilidade agrupada por Categoria de Serviço (suspensao, freios, etc.)
 */
function obterRentabilidadeCategorias({ tenantId, state, periodo = '30d' }) {
  const servicos = obterRentabilidadeServicos({ tenantId, state, periodo, limite: 1000 });
  const catMap = new Map();

  for (const s of servicos) {
    const cat = String(s.categoria || 'Geral').toUpperCase().trim();
    if (!catMap.has(cat)) {
      catMap.set(cat, {
        categoria: cat,
        totalServicos: 0,
        receita: 0,
        custoTotal: 0,
        horasProdutivas: 0
      });
    }
    const cItem = catMap.get(cat);
    cItem.totalServicos += s.quantidadeExecucoes;
    cItem.receita += s.receita;
    cItem.custoTotal += s.custoTotal;
    cItem.horasProdutivas += s.horasProdutivas;
  }

  return Array.from(catMap.values()).map(c => {
    const rec = arredondar(c.receita);
    const cus = arredondar(c.custoTotal);
    const margemBruta = arredondar(rec - cus);
    const margemPercentual = rec > 0 ? arredondar((margemBruta / rec) * 100, 1) : 0;
    const ticketMedio = c.totalServicos > 0 ? arredondar(rec / c.totalServicos) : 0;

    return {
      categoria: c.categoria,
      totalServicos: c.totalServicos,
      receita: rec,
      custoTotal: cus,
      margemBruta,
      margemPercentual,
      horasProdutivas: arredondar(c.horasProdutivas, 2),
      ticketMedio
    };
  }).sort((a, b) => b.receita - a.receita);
}

/**
 * Rentabilidade consolidada por Cliente / Frotista
 */
function obterRentabilidadeClientes({ tenantId, state, periodo = '30d', limite = 50 }) {
  if (!state) return [];
  const clientesMap = new Map();
  const osTenant = (state.os || []).filter(o => (o.tenantId === tenantId || !o.tenantId) && o.st !== 'cancelada');
  const osFiltradas = filtrarPorPeriodo(osTenant, periodo);

  for (const os of osFiltradas) {
    const cliId = os.cli || 'cli_geral';
    const cliObj = (state.clientes || []).find(c => c.id === cliId);
    const nome = cliObj?.nome || 'Cliente';

    if (!clientesMap.has(cliId)) {
      clientesMap.set(cliId, {
        clienteId: cliId,
        clienteNome: nome,
        totalOS: 0,
        receita: 0,
        custoReal: 0
      });
    }

    try {
      const apuracao = costingService.calcularCustoRealOS({ tenantId, state, osId: os.id });
      if (apuracao) {
        const item = clientesMap.get(cliId);
        item.totalOS++;
        item.receita += apuracao.receitaAutorizada;
        item.custoReal += apuracao.custoRealOS;
      }
    } catch (_) {}
  }

  return Array.from(clientesMap.values()).map(it => {
    const rec = arredondar(it.receita);
    const cus = arredondar(it.custoReal);
    const margemBruta = arredondar(rec - cus);
    const margemPercentual = rec > 0 ? arredondar((margemBruta / rec) * 100, 1) : 0;
    const ticketMedio = it.totalOS > 0 ? arredondar(rec / it.totalOS) : 0;

    return {
      clienteId: it.clienteId,
      clienteNome: it.clienteNome,
      totalOS: it.totalOS,
      receita: rec,
      custoReal: cus,
      margemBruta,
      margemPercentual,
      ticketMedio
    };
  }).sort((a, b) => b.receita - a.receita).slice(0, limite);
}

/**
 * Rentabilidade por Veículo / Frota
 */
function obterRentabilidadeVeiculos({ tenantId, state, periodo = '30d', limite = 50 }) {
  if (!state) return [];
  const veiculosMap = new Map();
  const osTenant = (state.os || []).filter(o => (o.tenantId === tenantId || !o.tenantId) && o.st !== 'cancelada');
  const osFiltradas = filtrarPorPeriodo(osTenant, periodo);

  for (const os of osFiltradas) {
    const veiId = os.vei || 'vei_geral';
    const veiObj = (state.veiculos || []).find(v => v.id === veiId);
    const placa = veiObj?.placa || os.placa || 'SEM PLACA';
    const cliObj = (state.clientes || []).find(c => c.id === (veiObj?.cli || os.cli));

    if (!veiculosMap.has(veiId)) {
      veiculosMap.set(veiId, {
        vehicleId: veiId,
        placa,
        modelo: veiObj?.modelo || 'Caminhão',
        clienteNome: cliObj?.nome || 'Cliente',
        totalOS: 0,
        receita: 0,
        custoReal: 0
      });
    }

    try {
      const apuracao = costingService.calcularCustoRealOS({ tenantId, state, osId: os.id });
      if (apuracao) {
        const item = veiculosMap.get(veiId);
        item.totalOS++;
        item.receita += apuracao.receitaAutorizada;
        item.custoReal += apuracao.custoRealOS;
      }
    } catch (_) {}
  }

  return Array.from(veiculosMap.values()).map(it => {
    const rec = arredondar(it.receita);
    const cus = arredondar(it.custoReal);
    const margemBruta = arredondar(rec - cus);
    const margemPercentual = rec > 0 ? arredondar((margemBruta / rec) * 100, 1) : 0;

    return {
      vehicleId: it.vehicleId,
      placa: it.placa,
      modelo: it.modelo,
      clienteNome: it.clienteNome,
      totalOS: it.totalOS,
      receita: rec,
      custoReal: cus,
      margemBruta,
      margemPercentual
    };
  }).sort((a, b) => b.receita - a.receita).slice(0, limite);
}

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
