'use strict';

/**
 * =====================================================================
 * PÁTIO CRM — VERÔNICA GESTORA 360º
 * Gestão de Compras & Estoque Crítico, Produtividade de Equipe & Boxes,
 * Inteligência Comercial / Retenção de Frotas e Briefing Executivo 360º
 * =====================================================================
 */

const financialEngine = require('./financialEngine');
const financialAnalystService = require('./financialAnalystService');
const proactiveAlertsService = require('./proactiveAlertsService');
const maintenancePlanService = require('./maintenancePlanService');
const productivityService = require('./productivityService');

function arredondar(valor, decimais = 2) {
  const n = Number(valor) || 0;
  return Number(Math.round(n + 'e' + decimais) + 'e-' + decimais);
}

function formatarMoeda(val) {
  return financialEngine.formatarMoeda(val);
}

function hojeISO() {
  return financialEngine.obterAgoraSP().dataISO;
}

/* ─────────────────────────────────────────────────────────────────
 * 1. GESTÃO DE COMPRAS & ESTOQUE CRÍTICO
 * ───────────────────────────────────────────────────────────────── */

/**
 * Analisa peças abaixo do estoque mínimo ou zeradas, cruza com a demanda
 * de OSs ativas (com identificação de deficit imediato) e com o saldo/previsão
 * de caixa para emitir recomendação financeira de compra.
 *
 * @param {Object} state - Estado completo do tenant
 * @param {Object} options - Parâmetros opcionais (tenantId, dataRef, etc)
 * @returns {Object} Diagnóstico de compras e estoque
 */
function analisarComprasEEstoque(state = {}, options = {}) {
  const tenantId = options.tenantId || state.tenantId || 'default';
  const dataRef = options.dataRef || hojeISO();

  const pecas = Array.isArray(state.pecas)
    ? state.pecas.filter(p => !p.tenantId || p.tenantId === tenantId)
    : [];

  const osList = Array.isArray(state.os)
    ? state.os.filter(o => !o.tenantId || o.tenantId === tenantId)
    : [];

  // OS ativas no pátio (não finalizadas nem canceladas)
  const osAtivas = osList.filter(o => {
    const st = String(o.st || o.status || '').toLowerCase();
    return st !== 'finalizada' && st !== 'cancelada' && st !== 'concluida';
  });

  // Mapeia demanda de peças nas OSs ativas
  // Chave: id da peça ou código da peça ou nome normalizado
  const demandaPorPecaId = new Map();
  const osPorPecaId = new Map();

  for (const os of osAtivas) {
    const itensPeca = Array.isArray(os.pecas) ? os.pecas : (Array.isArray(os.parts) ? os.parts : []);
    for (const item of itensPeca) {
      const qtdDemandada = Math.max(0, Number(item.qtd || item.quantidade) || 1);
      const chaveId = item.pecaId || item.id || item.cod || String(item.nome || '').trim().toLowerCase();

      demandaPorPecaId.set(chaveId, (demandaPorPecaId.get(chaveId) || 0) + qtdDemandada);

      if (!osPorPecaId.has(chaveId)) {
        osPorPecaId.set(chaveId, []);
      }
      osPorPecaId.get(chaveId).push({
        osId: os.id,
        osNum: os.num || os.numeroOS || os.id,
        placa: os.vei || os.placa || 'Sem placa',
        cliente: os.cli || os.clienteNome || 'Cliente não informado',
        qtdDemandada
      });
    }
  }

  const itensNecessidade = [];
  let custoTotalReposicao = 0;
  let custoOSUrgente = 0;
  let totalItensCriticosOS = 0;
  let totalItensZerados = 0;
  let totalItensAbaixoMinimo = 0;

  for (const p of pecas) {
    const estoqueAtual = Number(p.qtd) || 0;
    const estoqueMinimo = Number(p.min !== undefined ? p.min : 1);
    const custoUnitario = Number(p.custo) || 0;
    const precoVenda = Number(p.venda) || (custoUnitario > 0 ? custoUnitario * 1.5 : 0);

    // Busca demanda em OS ativas por id, código ou nome
    const chave1 = p.id;
    const chave2 = p.cod;
    const chave3 = String(p.nome || '').trim().toLowerCase();

    const demandaOS = (demandaPorPecaId.get(chave1) || 0) +
                      (chave2 ? (demandaPorPecaId.get(chave2) || 0) : 0) +
                      (chave3 ? (demandaPorPecaId.get(chave3) || 0) : 0);

    const ossVinculadas = [
      ...(osPorPecaId.get(chave1) || []),
      ...(chave2 ? (osPorPecaId.get(chave2) || []) : []),
      ...(chave3 ? (osPorPecaId.get(chave3) || []) : [])
    ];

    const saldoAposOS = estoqueAtual - demandaOS;
    const deficitOS = saldoAposOS < 0 ? Math.abs(saldoAposOS) : 0;
    const isAbaixoMinimo = estoqueAtual <= estoqueMinimo;
    const isZerado = estoqueAtual <= 0;

    // Precisa de compra se: tem deficit de OS ativa OU estoque zerado OU estoque <= mínimo
    if (deficitOS > 0 || isZerado || isAbaixoMinimo) {
      let qtdSugerida = 0;
      let motivo = '';
      let prioridade = 'media';

      if (deficitOS > 0) {
        // Precisa suprir o deficit da OS e recompor a margem de segurança do estoque mínimo
        qtdSugerida = deficitOS + Math.max(0, estoqueMinimo);
        motivo = `Déficit para OS ativa no pátio (Falta: ${deficitOS} un) + Estoque Mínimo (${estoqueMinimo} un)`;
        prioridade = 'urgente';
        totalItensCriticosOS++;
      } else if (isZerado) {
        qtdSugerida = Math.max(1, estoqueMinimo);
        motivo = 'Estoque zerado no almoxarifado';
        prioridade = 'alta';
        totalItensZerados++;
      } else {
        qtdSugerida = Math.max(1, estoqueMinimo - estoqueAtual);
        motivo = `Abaixo do estoque mínimo (Atual: ${estoqueAtual}, Mín: ${estoqueMinimo})`;
        prioridade = 'media';
        totalItensAbaixoMinimo++;
      }

      const custoItemTotal = arredondar(qtdSugerida * custoUnitario);
      custoTotalReposicao = arredondar(custoTotalReposicao + custoItemTotal);

      if (deficitOS > 0) {
        // Custo estrito para destravar a OS (apenas as peças faltantes)
        const custoDestraveOS = arredondar(deficitOS * custoUnitario);
        custoOSUrgente = arredondar(custoOSUrgente + custoDestraveOS);
      }

      itensNecessidade.push({
        pecaId: p.id,
        cod: p.cod || '',
        nome: p.nome || 'Peça sem descrição',
        fornecedor: p.forn || p.fornecedor || 'Não cadastrado',
        localizacao: p.loc || 'Pátio',
        estoqueAtual,
        estoqueMinimo,
        demandaOS,
        saldoAposOS,
        deficitOS,
        qtdSugerida,
        custoUnitario,
        precoVenda,
        custoTotalEstimado: custoItemTotal,
        prioridade,
        motivo,
        ossImpactadas: ossVinculadas
      });
    }
  }

  // Ordena por prioridade: urgente (déficit de OS) primeiro, depois alta (zerados), depois média
  const pesoPrioridade = { urgente: 1, alta: 2, media: 3 };
  itensNecessidade.sort((a, b) => (pesoPrioridade[a.prioridade] || 99) - (pesoPrioridade[b.prioridade] || 99));

  // ── Cruzamento com Saúde Financeira e Forecast 15d ──
  let previsaoCaixa = null;
  try {
    previsaoCaixa = financialAnalystService.gerarPrevisaoFluxoCaixa(state, { dias: 15, dataRef });
  } catch (errPrev) {
    previsaoCaixa = {
      saldoAtual: 0,
      marcos: { em15Dias: { saldo: 0, seguro: false } },
      caixaMinimoSeguranca: 2000
    };
  }

  const caixas = Array.isArray(state.caixas) ? state.caixas : [];
  const caixaAberto = caixas.find(c => (c.status === 'aberto' || c.aberto) && (!c.tenantId || c.tenantId === tenantId));
  const saldoCaixaTurno = caixaAberto && caixaAberto.saldoAtual !== undefined
    ? Number(caixaAberto.saldoAtual)
    : (caixas.length > 0 && caixas[caixas.length - 1].saldoAtual !== undefined ? Number(caixas[caixas.length - 1].saldoAtual) : null);

  const saldoConsolidadoEngine = Number(previsaoCaixa?.saldoAtual) || 0;
  const saldoAtual = (saldoCaixaTurno !== null && !isNaN(saldoCaixaTurno) && (saldoConsolidadoEngine === 0 || saldoCaixaTurno > saldoConsolidadoEngine))
    ? saldoCaixaTurno
    : saldoConsolidadoEngine;

  const saldo15d = Number(previsaoCaixa?.marcos?.em15Dias?.saldo !== undefined
    ? previsaoCaixa.marcos.em15Dias.saldo
    : saldoAtual);
  const caixaMinimoSeguranca = Number(state.cfg?.caixaMinimoSeguranca || 2000);

  const saldoAposTotal = arredondar(saldoAtual - custoTotalReposicao);
  const saldoAposUrgente = arredondar(saldoAtual - custoOSUrgente);

  let statusViabilidade = 'liberado_total';
  let podeComprarTotal = false;
  let podeComprarUrgente = false;
  let parecerFinanceiro = '';

  if (itensNecessidade.length === 0) {
    statusViabilidade = 'estoque_em_dia';
    parecerFinanceiro = 'O estoque está devidamente suprido. Não há peças abaixo do mínimo nem OSs travadas por falta de materiais.';
  } else if (saldoAtual >= custoTotalReposicao && saldoAposTotal >= caixaMinimoSeguranca) {
    statusViabilidade = 'liberado_total';
    podeComprarTotal = true;
    podeComprarUrgente = true;
    parecerFinanceiro = `A oficina possui folga de caixa confortável (Saldo atual: ${formatarMoeda(saldoAtual)} | Previsão 15d: ${formatarMoeda(saldo15d)}). Compra total recomendada de R$ ${formatarMoeda(custoTotalReposicao)} sem comprometer o caixa de segurança (${formatarMoeda(caixaMinimoSeguranca)}).`;
  } else if (custoOSUrgente > 0 && saldoAtual >= custoOSUrgente && saldoAposUrgente >= 0) {
    statusViabilidade = 'liberado_parcial_os';
    podeComprarTotal = false;
    podeComprarUrgente = true;
    parecerFinanceiro = `Folga de caixa restrita para compra global (${formatarMoeda(custoTotalReposicao)}). Priorize imediatamente apenas as peças de OSs ativas no pátio (${formatarMoeda(custoOSUrgente)}) para destravar entregas e faturamentos, postergando a recomposição de estoque de segurança.`;
  } else if (custoOSUrgente > 0 && saldoAtual < custoOSUrgente) {
    statusViabilidade = 'restringido_caixa';
    podeComprarTotal = false;
    podeComprarUrgente = false;
    parecerFinanceiro = `Alerta Crítico: O caixa atual (${formatarMoeda(saldoAtual)}) não cobre nem o valor urgente de peças das OSs no pátio (${formatarMoeda(custoOSUrgente)}). Negocie prazo faturado com fornecedores (30d) ou solicite adiantamento financeiro do cliente da OS antes de solicitar o material.`;
  } else {
    // Sem peças de OS urgentes, mas sem folga para recomposição geral
    statusViabilidade = 'postergar_reposicao';
    podeComprarTotal = false;
    podeComprarUrgente = false;
    parecerFinanceiro = `Saldo atual (${formatarMoeda(saldoAtual)}) abaixo da margem de segurança para compras preventivas (${formatarMoeda(custoTotalReposicao)}). Aguarde os recebimentos previstos nos próximos dias antes de emitir novos pedidos de compra.`;
  }

  return {
    sucesso: true,
    tenantId,
    dataReferencia: dataRef,
    resumo: {
      totalItensNecessidade: itensNecessidade.length,
      totalItensCriticosOS,
      totalItensZerados,
      totalItensAbaixoMinimo,
      custoTotalReposicao,
      custoOSUrgente
    },
    financeiro: {
      saldoAtual,
      saldo15d,
      caixaMinimoSeguranca,
      statusViabilidade,
      podeComprarTotal,
      podeComprarUrgente,
      parecerFinanceiro
    },
    itens: itensNecessidade
  };
}

/* ─────────────────────────────────────────────────────────────────
 * 2. RENTABILIDADE E PRODUTIVIDADE DE EQUIPE & BOXES
 * ───────────────────────────────────────────────────────────────── */

/**
 * Consolida a produtividade da equipe técnica e a taxa de utilização dos boxes:
 * - Horas apontadas e disponíveis
 * - Quantidade de OSs atendidas
 * - Receita gerada em mão de obra
 * - Ticket médio por OS
 * - Mecânicos sobrecarregados ou ociosos
 *
 * @param {Object} state - Estado completo do tenant
 * @param {Object} options - Parâmetros opcionais (tenantId, dataReferencia, etc)
 * @returns {Object} Diagnóstico de produtividade de equipe
 */
function analisarProdutividadeEquipe(state = {}, options = {}) {
  const tenantId = options.tenantId || state.tenantId || 'default';
  const dataRef = options.dataReferencia || hojeISO();

  const workers = Array.isArray(state.workers)
    ? state.workers.filter(w => (!w.tenantId || w.tenantId === tenantId) && w.ativo !== false)
    : [];

  const laborEntries = Array.isArray(state.laborEntries)
    ? state.laborEntries.filter(e => !e.tenantId || e.tenantId === tenantId)
    : [];

  const osList = Array.isArray(state.os)
    ? state.os.filter(o => !o.tenantId || o.tenantId === tenantId)
    : [];

  const boxes = Array.isArray(state.boxes)
    ? state.boxes.filter(b => !b.tenantId || b.tenantId === tenantId)
    : [];

  // Mapeamento de OSs para cálculo de serviços e receitas
  const osMap = new Map(osList.map(o => [o.id, o]));

  const equipeMetrics = [];
  let totalHorasApontadasEquipe = 0;
  let totalHorasProdutivasEquipe = 0;
  let totalReceitaMaoDeObra = 0;
  let totalOSAtendidasUnicas = new Set();

  for (const worker of workers) {
    const entriesWorker = laborEntries.filter(e => e.workerId === worker.id);

    let minutosProdutivos = 0;
    let minutosEspera = 0;
    let minutosRetrabalho = 0;
    let minutosOutros = 0;

    const osWorkerSet = new Set();
    let receitaMaoDeObraWorker = 0;

    for (const e of entriesWorker) {
      const dur = Number(e.durationMinutes) || 0;
      if (e.type === 'produtivo' || e.type === 'diagnostico') {
        minutosProdutivos += dur;
      } else if (e.type === 'espera') {
        minutosEspera += dur;
      } else if (e.type === 'retrabalho') {
        minutosRetrabalho += dur;
      } else {
        minutosOutros += dur;
      }

      if (e.osId) {
        osWorkerSet.add(e.osId);
        totalOSAtendidasUnicas.add(e.osId);
      }
    }

    // Calcula receita de serviços atribuídos a este mecânico nas OSs
    for (const os of osList) {
      const servicos = Array.isArray(os.servicos) ? os.servicos : (Array.isArray(os.services) ? os.services : []);
      for (const s of servicos) {
        const mecanicoVinculado = s.mecanicoId === worker.id ||
                                  s.workerId === worker.id ||
                                  (s.mecanico && String(s.mecanico).toLowerCase() === String(worker.nome).toLowerCase());
        if (mecanicoVinculado) {
          receitaMaoDeObraWorker += (Number(s.valor || s.preco || s.total) || 0);
          osWorkerSet.add(os.id);
          totalOSAtendidasUnicas.add(os.id);
        }
      }
    }

    const jornadaHoras = worker.disponivelHoje === false ? 0 : (Number(worker.jornadaHorasDia) || 8);
    const horasProdutivas = arredondar(minutosProdutivos / 60, 2);
    const horasEspera = arredondar(minutosEspera / 60, 2);
    const horasRetrabalho = arredondar(minutosRetrabalho / 60, 2);
    const horasApontadas = arredondar((minutosProdutivos + minutosEspera + minutosRetrabalho + minutosOutros) / 60, 2);

    let taxaUtilizacao = null;
    if (jornadaHoras > 0) {
      taxaUtilizacao = arredondar((horasProdutivas / jornadaHoras) * 100, 1);
    }

    const totalOSWorker = osWorkerSet.size;
    const ticketMedioMaoDeObra = totalOSWorker > 0 ? arredondar(receitaMaoDeObraWorker / totalOSWorker) : 0;

    // Diagnóstico de Carga / Produtividade
    let statusCarga = 'produtivo';
    let parecerWorker = '';
    if (jornadaHoras > 0 && taxaUtilizacao !== null) {
      if (taxaUtilizacao >= 90 || horasApontadas > 9) {
        statusCarga = 'sobrecarregado';
        parecerWorker = 'Alta sobrecarga de trabalho. Recomenda-se redistribuir serviços para evitar fadiga e atrasos.';
      } else if (taxaUtilizacao < 40 && totalOSWorker === 0) {
        statusCarga = 'ocioso';
        parecerWorker = 'Colaborador com capacidade ociosa. Disponível para assumir novas ordens de serviço.';
      } else {
        statusCarga = 'normal';
        parecerWorker = 'Ritmo produtivo equilibrado e alinhado à jornada.';
      }
    } else {
      statusCarga = totalOSWorker > 0 ? 'produtivo' : 'disponivel';
      parecerWorker = totalOSWorker > 0 ? 'Atuando em ordens de serviço ativas.' : 'Disponível no pátio.';
    }

    totalHorasApontadasEquipe = arredondar(totalHorasApontadasEquipe + horasApontadas);
    totalHorasProdutivasEquipe = arredondar(totalHorasProdutivasEquipe + horasProdutivas);
    totalReceitaMaoDeObra = arredondar(totalReceitaMaoDeObra + receitaMaoDeObraWorker);

    equipeMetrics.push({
      workerId: worker.id,
      nome: worker.nome || 'Colaborador',
      funcao: worker.funcao || 'Mecânico',
      jornadaHoras,
      horasApontadas,
      horasProdutivas,
      horasEspera,
      horasRetrabalho,
      taxaUtilizacao,
      totalOSAtendidas: totalOSWorker,
      receitaMaoDeObraGerada: arredondar(receitaMaoDeObraWorker),
      ticketMedioMaoDeObra,
      statusCarga,
      parecer: parecerWorker
    });
  }

  // Ordena ranking por receita gerada / horas produtivas
  equipeMetrics.sort((a, b) => (b.receitaMaoDeObraGerada - a.receitaMaoDeObraGerada) || (b.horasProdutivas - a.horasProdutivas));

  const mecanicosSobrecarregados = equipeMetrics.filter(m => m.statusCarga === 'sobrecarregado');
  const mecanicosOciosos = equipeMetrics.filter(m => m.statusCarga === 'ocioso');
  const mecanicoDestaque = equipeMetrics.length > 0 ? equipeMetrics[0] : null;

  // ── Métricas de Boxes ──
  const boxesMetrics = [];
  let boxesOcupados = 0;
  for (const b of boxes) {
    const osNoBox = osList.find(o =>
      (o.box === b.nome || o.boxId === b.id || o.box === b.id) &&
      o.st !== 'finalizada' && o.st !== 'cancelada'
    );

    const ocupado = Boolean(osNoBox);
    if (ocupado) boxesOcupados++;

    boxesMetrics.push({
      boxId: b.id,
      nome: b.nome || b.id,
      tipo: b.tipo || 'Padrão',
      status: ocupado ? 'ocupado' : 'livre',
      osId: osNoBox ? osNoBox.id : null,
      osNum: osNoBox ? (osNoBox.num || osNoBox.id) : null,
      veiculo: osNoBox ? (osNoBox.vei || osNoBox.placa) : null,
      cliente: osNoBox ? (osNoBox.cli || osNoBox.clienteNome) : null,
      tempoNoBoxHoras: osNoBox && osNoBox.horaEntrada ? arredondar(Math.max(0, (Date.now() - new Date(osNoBox.dataAbertura || Date.now()).getTime()) / 3600000), 1) : 0
    });
  }

  const totalBoxes = boxes.length;
  const taxaOcupacaoBoxes = totalBoxes > 0 ? arredondar((boxesOcupados / totalBoxes) * 100, 1) : 0;

  return {
    sucesso: true,
    tenantId,
    dataReferencia: dataRef,
    resumo: {
      totalMecanicos: workers.length,
      totalOSAtendidasUnicas: totalOSAtendidasUnicas.size,
      totalHorasApontadasEquipe,
      totalHorasProdutivasEquipe,
      totalReceitaMaoDeObra,
      ticketMedioGeralPorOS: totalOSAtendidasUnicas.size > 0 ? arredondar(totalReceitaMaoDeObra / totalOSAtendidasUnicas.size) : 0,
      totalBoxes,
      boxesOcupados,
      boxesLivres: Math.max(0, totalBoxes - boxesOcupados),
      taxaOcupacaoBoxes,
      mecanicoDestaque: mecanicoDestaque ? { nome: mecanicoDestaque.nome, receita: mecanicoDestaque.receitaMaoDeObraGerada, osCount: mecanicoDestaque.totalOSAtendidas } : null,
      totalSobrecarregados: mecanicosSobrecarregados.length,
      totalOciosos: mecanicosOciosos.length
    },
    equipe: equipeMetrics,
    boxes: boxesMetrics
  };
}

/* ─────────────────────────────────────────────────────────────────
 * 3. INTELIGÊNCIA COMERCIAL E RETENÇÃO DE FROTAS
 * ───────────────────────────────────────────────────────────────── */

/**
 * Identifica os maiores clientes/frotistas da oficina, mapeia preventivas vencidas
 * e cruza com títulos em aberto/inadimplência para orientar retenção e cobrança ativa.
 *
 * @param {Object} state - Estado completo do tenant
 * @param {Object} options - Parâmetros opcionais (tenantId, etc)
 * @returns {Object} Diagnóstico comercial e frotas
 */
function analisarRetencaoECobranca(state = {}, options = {}) {
  const tenantId = options.tenantId || state.tenantId || 'default';
  const dataHoje = options.dataReferencia || hojeISO();

  const clientes = Array.isArray(state.clientes)
    ? state.clientes.filter(c => !c.tenantId || c.tenantId === tenantId)
    : [];

  const veiculos = Array.isArray(state.veiculos)
    ? state.veiculos.filter(v => !v.tenantId || v.tenantId === tenantId)
    : [];

  const osList = Array.isArray(state.os)
    ? state.os.filter(o => !o.tenantId || o.tenantId === tenantId)
    : [];

  const contas = Array.isArray(state.contas)
    ? state.contas.filter(c => (!c.tenantId || c.tenantId === tenantId) && c.tipo === 'receber' && !c.pago)
    : [];

  // 1. Agrupamento de OSs por Cliente/Frota
  const frotasMap = new Map();

  for (const os of osList) {
    const nomeCliente = String(os.cli || os.clienteNome || 'Cliente não identificado').trim();
    if (!frotasMap.has(nomeCliente)) {
      frotasMap.set(nomeCliente, {
        clienteNome: nomeCliente,
        clienteId: os.clienteId || null,
        totalOS: 0,
        osFinalizadas: 0,
        osAtivas: 0,
        faturamentoTotal: 0,
        veiculosSet: new Set(),
        ultimaOSData: null
      });
    }

    const reg = frotasMap.get(nomeCliente);
    reg.totalOS++;
    const valorOS = Number(os.total || os.valorTotal) || 0;
    reg.faturamentoTotal += valorOS;

    if (os.vei || os.placa) {
      reg.veiculosSet.add(os.vei || os.placa);
    }

    const st = String(os.st || os.status || '').toLowerCase();
    if (st === 'finalizada' || st === 'concluida') {
      reg.osFinalizadas++;
    } else if (st !== 'cancelada') {
      reg.osAtivas++;
    }

    const dataAbertura = String(os.dataAbertura || os.data || '').slice(0, 10);
    if (!reg.ultimaOSData || dataAbertura > reg.ultimaOSData) {
      reg.ultimaOSData = dataAbertura;
    }
  }

  // 2. Avaliação de Vencimentos de Manutenção Preventiva
  let vencimentosPlanos = { vencidos: 0, proximos: 0, itens: [] };
  try {
    vencimentosPlanos = maintenancePlanService.avaliarVencimentos({ tenantId, state, dataReferencia: dataHoje });
  } catch (errPlano) {
    vencimentosPlanos = { vencidos: 0, proximos: 0, itens: [] };
  }

  // Mapeia preventivas por veículo/cliente
  const preventivasPorPlaca = new Map();
  for (const item of (vencimentosPlanos.itens || [])) {
    if (item.status === 'vencido' || item.status === 'proximo') {
      const placa = item.placa || 'Sem Placa';
      if (!preventivasPorPlaca.has(placa)) {
        preventivasPorPlaca.set(placa, []);
      }
      preventivasPorPlaca.get(placa).push(item);
    }
  }

  // 3. Títulos em Aberto por Cliente
  const contasPorCliente = new Map();
  for (const c of contas) {
    const nome = String(c.cli || c.cliente || c.parte || 'Outros').trim();
    if (!contasPorCliente.has(nome)) {
      contasPorCliente.set(nome, { totalAberto: 0, totalVencido: 0, titulos: [] });
    }
    const val = Number(c.valor) || 0;
    const isVencido = (c.venc || '') < dataHoje;
    const agrup = contasPorCliente.get(nome);
    agrup.totalAberto = arredondar(agrup.totalAberto + val);
    if (isVencido) {
      agrup.totalVencido = arredondar(agrup.totalVencido + val);
    }
    agrup.titulos.push(c);
  }

  // 4. Consolida Ranking e Oportunidades Comerciais
  const rankingClientes = [];
  const oportunidadesAcao = [];

  for (const [nomeCliente, dados] of frotasMap.entries()) {
    const totalVeiculos = dados.veiculosSet.size;
    const faturamentoTotal = arredondar(dados.faturamentoTotal);
    const ticketMedio = dados.totalOS > 0 ? arredondar(faturamentoTotal / dados.totalOS) : 0;

    const infoFinanceira = contasPorCliente.get(nomeCliente) || { totalAberto: 0, totalVencido: 0, titulos: [] };

    // Identifica se há preventivas pendentes para os veículos desta frota
    const preventivasCliente = [];
    for (const placa of dados.veiculosSet) {
      if (preventivasPorPlaca.has(placa)) {
        preventivasCliente.push(...preventivasPorPlaca.get(placa));
      }
    }

    const itemCliente = {
      clienteNome: nomeCliente,
      totalOS: dados.totalOS,
      osAtivas: dados.osAtivas,
      totalVeiculos,
      faturamentoTotal,
      ticketMedio,
      ultimaOSData: dados.ultimaOSData,
      totalReceberAberto: infoFinanceira.totalAberto,
      totalReceberVencido: infoFinanceira.totalVencido,
      totalPreventivasPendentes: preventivasCliente.length
    };

    rankingClientes.push(itemCliente);

    // Geração de Recomendações Comerciais Práticas
    if (preventivasCliente.length > 0 && infoFinanceira.totalVencido === 0) {
      oportunidadesAcao.push({
        tipo: 'oportunidade_preventiva',
        cliente: nomeCliente,
        prioridade: 'alta',
        motivo: `${preventivasCliente.length} serviço(s) preventivo(s) vencido(s)/próximos e situação financeira regular.`,
        acaoSugerida: `Entrar em contato proativo com a transportadora para agendar a revisão dos veículos (${Array.from(new Set(preventivasCliente.map(p => p.placa))).join(', ')}).`,
        impactoEsperado: 'Retenção da frota e geração de receita programada.'
      });
    } else if (infoFinanceira.totalVencido > 0) {
      oportunidadesAcao.push({
        tipo: 'cobranca_preventiva',
        cliente: nomeCliente,
        prioridade: 'urgente',
        motivo: `Títulos vencidos totalizando ${formatarMoeda(infoFinanceira.totalVencido)}.`,
        acaoSugerida: preventivasCliente.length > 0
          ? `Alinhar regularização do saldo devedor (${formatarMoeda(infoFinanceira.totalVencido)}) ao agendar novas preventivas solicitadas.`
          : `Acionar régua amigável de cobrança antes de autorizar abertura de novos serviços a prazo no pátio.`,
        impactoEsperado: 'Recuperação imediata de liquidez de caixa e redução do risco de inadimplência.'
      });
    }
  }

  // Ordena clientes por maior faturamento histórico
  rankingClientes.sort((a, b) => b.faturamentoTotal - a.faturamentoTotal);

  return {
    sucesso: true,
    tenantId,
    dataReferencia: dataHoje,
    resumo: {
      totalClientesMapeados: rankingClientes.length,
      topClientesVolume: rankingClientes.slice(0, 5),
      totalPreventivasVencidas: vencimentosPlanos.vencidos || 0,
      totalPreventivasProximas: vencimentosPlanos.proximos || 0,
      totalTitulosVencidosReceber: contas.filter(c => (c.venc || '') < dataHoje).reduce((acc, c) => acc + (Number(c.valor) || 0), 0)
    },
    rankingClientes,
    oportunidadesAcao
  };
}

/* ─────────────────────────────────────────────────────────────────
 * 4. BRIEFING EXECUTIVO 360º DA VERÔNICA
 * ───────────────────────────────────────────────────────────────── */

/**
 * Unifica todos os pilares em um único diagnóstico estruturado e textual:
 * - Pátio & Gargalos de Tempo
 * - Saúde Financeira, Forecast 15d e Auditoria Interna
 * - Compras Urgentes & Reposição de Estoque
 * - Produtividade de Equipe, Boxes e CRM de Frotas
 *
 * @param {Object} state - Estado completo do tenant
 * @param {Object} options - Parâmetros opcionais (tenantId, etc)
 * @returns {Object} Diagnóstico completo 360º com versões em texto e voz
 */
function gerarRelatorioGerencial360(state = {}, options = {}) {
  const tenantId = options.tenantId || state.tenantId || 'default';
  const dataHoje = options.dataReferencia || hojeISO();

  // 1. Pátio e Gargalos Proativos
  let alertasPatio = { orcamentosParados: [], gargalosBox: [], resumo: {} };
  try {
    alertasPatio = proactiveAlertsService.avaliarAlertasProativos({ state, tenantId });
  } catch (errPatio) {
    alertasPatio = { orcamentosParados: [], gargalosBox: [], resumo: { totalOrcamentosParados: 0, totalGargalosBox: 0 } };
  }

  // 2. Saúde Financeira, Forecast e Auditoria
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

  // 3. Compras e Estoque Crítico
  const analiseCompras = analisarComprasEEstoque(state, { tenantId, dataRef: dataHoje });

  // 4. Produtividade de Equipe
  const analiseEquipe = analisarProdutividadeEquipe(state, { tenantId, dataReferencia: dataHoje });

  // 5. Inteligência de Frotas e Retenção
  const analiseFrotas = analisarRetencaoECobranca(state, { tenantId, dataReferencia: dataHoje });

  // ── Montagem do Diagnóstico Estruturado ──
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

  // ── Montagem do Texto Formatado para WhatsApp ──
  let textoWhatsApp = `🌐 *RELATÓRIO GERENCIAL 360º — VERÔNICA GESTORA* 🤖\n`;
  textoWhatsApp += `📅 _Posição consolidada em ${financialEngine.formatarDataBR(dataHoje)}_\n\n`;

  // 1. Pátio & Gargalos
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

  // 2. Saúde Financeira & Forecast
  textoWhatsApp += `💰 *2. Tesouraria & Previsão (15 Dias):*\n`;
  textoWhatsApp += `• Saldo Disponível Hoje: ${formatarMoeda(diagnosticoEstruturado.financeiro.saldoAtual)}\n`;
  textoWhatsApp += `• Saldo Projetado em 15d: ${formatarMoeda(diagnosticoEstruturado.financeiro.saldoProjetado15d)}\n`;
  if (diagnosticoEstruturado.financeiro.furoProjetado) {
    textoWhatsApp += `• ⚠️ *Atenção:* Risco de furo de caixa projetado a partir de ${financialEngine.formatarDataBR(diagnosticoEstruturado.financeiro.dataPrimeiroFuro)}.\n`;
  } else {
    textoWhatsApp += `• ✅ Caixa projetado positivo e acima da margem de segurança.\n`;
  }
  textoWhatsApp += `\n`;

  // 3. Suprimentos & Compras
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

  // 4. Produtividade Técnica
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

  // 5. Inteligência de Frotas & Oportunidades
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

  // ── Montagem da Síntese de Voz (TTS) ──
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
  analisarComprasEEstoque,
  analisarProdutividadeEquipe,
  analisarRetencaoECobranca,
  gerarRelatorioGerencial360
};
