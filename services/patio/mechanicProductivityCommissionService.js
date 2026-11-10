'use strict';

/**
 * Pátio CRM — Motor de Produtividade e Comissionamento Técnico de Mecânicos
 * Módulo de apuração de eficiência, bônus de produtividade e comissões liberadas/retidas (< 300 linhas).
 */

const crypto = require('crypto');

function gerarId(prefix) {
  return prefix + '_' + Date.now() + '_' + crypto.randomBytes(3).toString('hex');
}

function garantirColecoes(state) {
  state.os = Array.isArray(state.os) ? state.os : (Array.isArray(state.serviceOrders) ? state.serviceOrders : []);
  state.timeLogs = Array.isArray(state.timeLogs) ? state.timeLogs : [];
  state.mechanicCommissionRules = Array.isArray(state.mechanicCommissionRules) ? state.mechanicCommissionRules : [];
  state.auditoria = Array.isArray(state.auditoria) ? state.auditoria : [];
}

function configurarRegraComissaoMecanico(state, mecanicoId, {
  tenantId = 'default',
  percentualBase = 10,
  bonusEficienciaPercentual = 0,
  metaEficienciaMinima = 100,
  modalidadeGatilho = 'os_finalizada',
  actorId = 'sistema'
} = {}) {
  if (!state || !mecanicoId) {
    throw new Error('state e mecanicoId são obrigatórios.');
  }
  garantirColecoes(state);

  let regra = state.mechanicCommissionRules.find(r =>
    r.mecanicoId === mecanicoId && (!tenantId || !r.tenantId || r.tenantId === tenantId)
  );

  const base = Math.max(0, Number(percentualBase) || 0);
  const bonus = Math.max(0, Number(bonusEficienciaPercentual) || 0);
  const meta = Math.max(1, Number(metaEficienciaMinima) || 100);
  const gatilho = modalidadeGatilho === 'os_recebida' ? 'os_recebida' : 'os_finalizada';

  if (!regra) {
    regra = {
      id: gerarId('com_reg'),
      tenantId,
      mecanicoId,
      percentualBase: base,
      bonusEficienciaPercentual: bonus,
      metaEficienciaMinima: meta,
      modalidadeGatilho: gatilho,
      criadoEm: new Date().toISOString(),
      atualizadoEm: new Date().toISOString()
    };
    state.mechanicCommissionRules.push(regra);
  } else {
    regra.percentualBase = base;
    regra.bonusEficienciaPercentual = bonus;
    regra.metaEficienciaMinima = meta;
    regra.modalidadeGatilho = gatilho;
    regra.atualizadoEm = new Date().toISOString();
  }

  state.auditoria.push({
    id: gerarId('aud'),
    tenantId,
    timestamp: new Date().toISOString(),
    actorId,
    acao: 'configurar_regra_comissao_mecanico',
    detalhes: { mecanicoId, regra }
  });

  return { ok: true, regra };
}

function calcularProdutividadeEComissaoMecanico(state, {
  tenantId = null,
  mecanicoId,
  competencia = null
}) {
  if (!state || !mecanicoId) {
    throw new Error('state e mecanicoId são obrigatórios.');
  }
  garantirColecoes(state);

  const comp = (competencia || new Date().toISOString()).slice(0, 7);

  const regra = state.mechanicCommissionRules.find(r =>
    r.mecanicoId === mecanicoId && (!tenantId || !r.tenantId || r.tenantId === tenantId)
  ) || {
    percentualBase: 10,
    bonusEficienciaPercentual: 0,
    metaEficienciaMinima: 100,
    modalidadeGatilho: 'os_finalizada'
  };

  const apontamentos = state.timeLogs.filter(l => {
    if (tenantId && l.tenantId && l.tenantId !== tenantId) return false;
    if (l.mecanicoId !== mecanicoId) return false;
    if (l.status !== 'concluido') return false;

    const dataRef = String(l.concluidoEm || l.inicioEm || '').slice(0, 7);
    if (dataRef && dataRef !== comp) return false;

    return true;
  });

  let totalHorasVendidas = 0;
  let totalHorasTrabalhadas = 0;
  let baseComissionavelLiberada = 0;
  let baseComissionavelRetida = 0;

  for (const log of apontamentos) {
    // Tratamento de múltiplos mecânicos no mesmo serviço da OS (Rateio Proporcional)
    const sharedLogs = state.timeLogs.filter(l =>
      l.osId === log.osId &&
      l.servicoId === log.servicoId &&
      l.status === 'concluido' &&
      (!tenantId || !l.tenantId || l.tenantId === tenantId)
    );

    let valServico = Number(log.valorServico) || 0;
    let horasVend = Number(log.horasVendidas) || 0;

    if (sharedLogs.length > 1) {
      const somaHorasServico = sharedLogs.reduce((acc, l) => acc + (Number(l.horasTrabalhadas) || 0), 0);
      const ratio = somaHorasServico > 0 ? ((Number(log.horasTrabalhadas) || 0) / somaHorasServico) : (1 / sharedLogs.length);
      valServico = Math.round((valServico * ratio) * 100) / 100;
      horasVend = +(horasVend * ratio).toFixed(2);
    }

    const horasTrab = Number(log.horasTrabalhadas) || 0;
    totalHorasVendidas += horasVend;
    totalHorasTrabalhadas += horasTrab;

    // Avaliação do gatilho de liberação da comissão
    const os = state.os.find(o => o.id === log.osId);
    let isLiberado = false;

    if (os) {
      const st = String(os.st || '').toLowerCase();
      const isPago = Boolean(os.pago || os.liquidado || st === 'pago');

      if (regra.modalidadeGatilho === 'os_recebida') {
        isLiberado = isPago;
      } else {
        // 'os_finalizada'
        const isFinalizada = ['finalizada', 'entregue', 'concluida', 'pronto'].includes(st) || os.statusFaturamento === 'faturado';
        isLiberado = isFinalizada || isPago;
      }
    }

    if (isLiberado) {
      baseComissionavelLiberada += valServico;
    } else {
      baseComissionavelRetida += valServico;
    }
  }

  baseComissionavelLiberada = Math.round(baseComissionavelLiberada * 100) / 100;
  baseComissionavelRetida = Math.round(baseComissionavelRetida * 100) / 100;
  totalHorasVendidas = +totalHorasVendidas.toFixed(2);
  totalHorasTrabalhadas = +totalHorasTrabalhadas.toFixed(2);

  const eficienciaGlobalPercentual = Math.round((totalHorasVendidas / Math.max(totalHorasTrabalhadas, 0.01)) * 100);
  const atingiuMetaEficiencia = totalHorasTrabalhadas > 0 && (eficienciaGlobalPercentual >= regra.metaEficienciaMinima);
  const percentualAplicado = regra.percentualBase + (atingiuMetaEficiencia ? (regra.bonusEficienciaPercentual || 0) : 0);

  const valorComissaoBase = Math.round((baseComissionavelLiberada * (regra.percentualBase / 100)) * 100) / 100;
  const valorBonusEficiencia = atingiuMetaEficiencia
    ? Math.round((baseComissionavelLiberada * ((regra.bonusEficienciaPercentual || 0) / 100)) * 100) / 100
    : 0;

  const valorComissaoTotalLiberada = Math.round((valorComissaoBase + valorBonusEficiencia) * 100) / 100;
  const valorComissaoRetida = Math.round((baseComissionavelRetida * (percentualAplicado / 100)) * 100) / 100;

  return {
    ok: true,
    mecanicoId,
    competencia: comp,
    regra: {
      percentualBase: regra.percentualBase,
      bonusEficienciaPercentual: regra.bonusEficienciaPercentual,
      metaEficienciaMinima: regra.metaEficienciaMinima,
      modalidadeGatilho: regra.modalidadeGatilho
    },
    totalServicosConcluidos: apontamentos.length,
    totalHorasVendidas,
    totalHorasTrabalhadas,
    eficienciaGlobalPercentual,
    atingiuMetaEficiencia,
    percentualAplicado,
    baseComissionavelLiberada,
    baseComissionavelRetida,
    valorComissaoBase,
    valorBonusEficiencia,
    valorComissaoTotalLiberada,
    valorComissaoRetida
  };
}

function gerarResumoProdutividadeEquipe(state, {
  tenantId = null,
  competencia = null
} = {}) {
  if (!state) return { ok: false, error: 'Estado é obrigatório.' };
  garantirColecoes(state);

  const comp = (competencia || new Date().toISOString()).slice(0, 7);
  const mecanicosIds = new Set();

  for (const l of state.timeLogs) {
    if (tenantId && l.tenantId && l.tenantId !== tenantId) continue;
    if (l.mecanicoId) mecanicosIds.add(l.mecanicoId);
  }

  for (const r of state.mechanicCommissionRules) {
    if (tenantId && r.tenantId && r.tenantId !== tenantId) continue;
    if (r.mecanicoId) mecanicosIds.add(r.mecanicoId);
  }

  const equipe = [];
  for (const mId of mecanicosIds) {
    const dados = calcularProdutividadeEComissaoMecanico(state, {
      tenantId,
      mecanicoId: mId,
      competencia: comp
    });
    equipe.push(dados);
  }

  // Ordena por eficiência global (desc) e comissão liberada (desc)
  equipe.sort((a, b) => {
    if (b.eficienciaGlobalPercentual !== a.eficienciaGlobalPercentual) {
      return b.eficienciaGlobalPercentual - a.eficienciaGlobalPercentual;
    }
    return b.valorComissaoTotalLiberada - a.valorComissaoTotalLiberada;
  });

  return {
    ok: true,
    competencia: comp,
    totalMecanicos: equipe.length,
    equipe
  };
}

module.exports = {
  configurarRegraComissaoMecanico,
  calcularProdutividadeEComissaoMecanico,
  gerarResumoProdutividadeEquipe
};

