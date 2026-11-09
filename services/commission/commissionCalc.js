'use strict';

/**
 * Pátio CRM — Motor de Cálculo de Comissões de Mecânicos
 * Submódulo (< 250 linhas).
 */

function arredondar(val, decimais = 2) {
  const n = Number(val) || 0;
  return Number(Math.round(n + 'e' + decimais) + 'e-' + decimais);
}

function obterConfigComissoes(state) {
  const cfg = state?.cfg?.comissoes || {};
  return {
    percentualPadrao: Number(cfg.percentualPadrao != null ? cfg.percentualPadrao : 10),
    baseCalculo: cfg.baseCalculo || 'mao_de_obra_liquida', // 'mao_de_obra_liquida' | 'mao_de_obra_bruta'
    deduzRetrabalho: cfg.deduzRetrabalho !== false,
    rateioPadrao: cfg.rateioPadrao || 'proporcional_horas'
  };
}

function obterPercentualColaborador(worker, configGeral) {
  if (worker && worker.comissaoPercentual != null && !isNaN(Number(worker.comissaoPercentual))) {
    return Math.max(0, Number(worker.comissaoPercentual));
  }
  return configGeral.percentualPadrao;
}

/**
 * Calcula a proporção de desconto geral aplicável aos serviços da OS
 */
function calcularFatorDescontoServicos(os, configGeral) {
  if (configGeral.baseCalculo === 'mao_de_obra_bruta') {
    return 1.0;
  }

  const descGeral = Math.max(0, Number(os.desc) || 0);
  if (descGeral === 0) return 1.0;

  let totalBrutoServicos = 0;
  (os.servicos || []).forEach(s => {
    totalBrutoServicos += (Number(s.qtd) || 1) * (Number(s.valor || s.preco) || 0);
  });

  let totalBrutoPecas = 0;
  (os.pecas || []).forEach(p => {
    totalBrutoPecas += (Number(p.qtd) || 1) * (Number(p.valor || p.preco) || 0);
  });

  const totalBrutoGeral = totalBrutoServicos + totalBrutoPecas;
  if (totalBrutoGeral <= 0) return 1.0;

  // Proporção do desconto que incide sobre os serviços
  const descSobreServicos = descGeral * (totalBrutoServicos / totalBrutoGeral);
  const totalLiquidoServicos = Math.max(0, totalBrutoServicos - descSobreServicos);

  return totalBrutoServicos > 0 ? (totalLiquidoServicos / totalBrutoServicos) : 1.0;
}

/**
 * Localiza os apontamentos de labor vinculados a um serviço ou OS
 */
function obterApontamentosServico(laborEntries = [], osId, serviceItemId = null) {
  return laborEntries.filter(l => {
    if (l.osId !== osId) return false;
    if (serviceItemId && l.serviceItemId) {
      return l.serviceItemId === serviceItemId;
    }
    return true;
  });
}

/**
 * Calcula as comissões devidas em uma Ordem de Serviço
 */
function calcularComissaoOS({ os, state, tenantId, options = {} }) {
  if (!os || !state) return null;

  const config = obterConfigComissoes(state);
  const workers = Array.isArray(state.workers) ? state.workers : [];
  const laborEntries = Array.isArray(state.laborEntries) ? state.laborEntries : [];

  const isRetrabalho = Boolean(
    os.isRetrabalho ||
    os.possivelGarantia ||
    os.tipo === 'garantia' ||
    os.tipo === 'retrabalho'
  );

  const fatorDesconto = calcularFatorDescontoServicos(os, config);
  const servicos = (os.servicos || []).filter(s => s.status === 'aprovado' || s.autorizado !== false);

  const itensCalculados = [];
  let totalMaoDeObra = 0;
  let totalComissao = 0;

  for (const srv of servicos) {
    const valorBruto = (Number(srv.qtd) || 1) * (Number(srv.valor || srv.preco) || 0);
    const valorLiquido = arredondar(valorBruto * fatorDesconto);
    totalMaoDeObra = arredondar(totalMaoDeObra + valorLiquido);

    if (isRetrabalho && config.deduzRetrabalho) {
      itensCalculados.push({
        serviceItemId: srv.id,
        serviceNome: srv.nome,
        valorMaoDeObra: valorLiquido,
        workerId: srv.workerId || null,
        workerNome: workers.find(w => w.id === srv.workerId)?.nome || 'Não atribuído',
        percentualAplicado: 0,
        valorComissao: 0,
        bloqueada: true,
        motivoBloqueio: 'retrabalho_garantia'
      });
      continue;
    }

    // 1. Caso haja workerId diretamente no serviço
    if (srv.workerId) {
      const worker = workers.find(w => w.id === srv.workerId);
      const pct = obterPercentualColaborador(worker, config);
      const vlrComissao = arredondar(valorLiquido * (pct / 100));
      totalComissao = arredondar(totalComissao + vlrComissao);

      itensCalculados.push({
        serviceItemId: srv.id,
        serviceNome: srv.nome,
        valorMaoDeObra: valorLiquido,
        workerId: srv.workerId,
        workerNome: worker?.nome || 'Mecânico',
        percentualAplicado: pct,
        valorComissao: vlrComissao,
        bloqueada: false,
        motivoBloqueio: null
      });
      continue;
    }

    // 2. Caso haja rateio por apontamentos (laborEntries)
    const apontamentos = obterApontamentosServico(laborEntries, os.id, srv.id);
    const apontamentosValidos = apontamentos.filter(a => a.workerId && (Number(a.totalSeconds) || 0) > 0);

    if (apontamentosValidos.length > 0) {
      const totalSegundos = apontamentosValidos.reduce((acc, a) => acc + (Number(a.totalSeconds) || 0), 0);

      // Agrupa por colaborador
      const segundosPorWorker = new Map();
      apontamentosValidos.forEach(a => {
        const atual = segundosPorWorker.get(a.workerId) || 0;
        segundosPorWorker.set(a.workerId, atual + (Number(a.totalSeconds) || 0));
      });

      for (const [wId, segs] of segundosPorWorker.entries()) {
        const proporcao = totalSegundos > 0 ? (segs / totalSegundos) : (1 / segundosPorWorker.size);
        const baseMaoDeObraWorker = arredondar(valorLiquido * proporcao);
        const worker = workers.find(w => w.id === wId);
        const pct = obterPercentualColaborador(worker, config);
        const vlrComissao = arredondar(baseMaoDeObraWorker * (pct / 100));
        totalComissao = arredondar(totalComissao + vlrComissao);

        itensCalculados.push({
          serviceItemId: srv.id,
          serviceNome: srv.nome,
          valorMaoDeObra: baseMaoDeObraWorker,
          proporcaoRateio: arredondar(proporcao * 100, 1),
          segundosApontados: segs,
          workerId: wId,
          workerNome: worker?.nome || 'Mecânico',
          percentualAplicado: pct,
          valorComissao: vlrComissao,
          bloqueada: false,
          motivoBloqueio: null
        });
      }
      continue;
    }

    // 3. Serviço sem atribuição e sem apontamento
    itensCalculados.push({
      serviceItemId: srv.id,
      serviceNome: srv.nome,
      valorMaoDeObra: valorLiquido,
      workerId: null,
      workerNome: 'Pendente de Atribuição',
      percentualAplicado: 0,
      valorComissao: 0,
      bloqueada: true,
      motivoBloqueio: 'sem_colaborador_atribuido'
    });
  }

  return {
    osId: os.id,
    osNum: os.num,
    dataFechamento: os.fechamento || os.concluidaEm || os.abertura,
    placa: os.conjunto?.cavalo?.placa || os.placa || '',
    isRetrabalho,
    totalMaoDeObra,
    totalComissao,
    itens: itensCalculados
  };
}

module.exports = {
  arredondar,
  obterConfigComissoes,
  obterPercentualColaborador,
  calcularComissaoOS
};

