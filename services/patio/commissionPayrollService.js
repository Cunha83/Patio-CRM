'use strict';

/**
 * services/patio/commissionPayrollService.js
 * 
 * Gestão de Vales/Adiantamentos, Apuração de Folha de Comissões com Estorno
 * por Retrabalho, Anulação de Bônus de Qualidade e Fechamento com Contas a Pagar.
 * 
 * Arquitetura: <= 350 linhas
 */

const mechanicProductivityCommissionService = require('./mechanicProductivityCommissionService');
const qualityWarrantyReworkService = require('./qualityWarrantyReworkService');

function garantirColecoes(state) {
  if (!state) throw new Error('Estado é obrigatório');
  if (!Array.isArray(state.mechanicAdvances)) state.mechanicAdvances = [];
  if (!Array.isArray(state.commissionPayrolls)) state.commissionPayrolls = [];
  if (!Array.isArray(state.contas)) state.contas = [];
  if (!Array.isArray(state.auditoria)) state.auditoria = [];
}

function registrarValeAdiantamentoMecanico(state, payload = {}) {
  garantirColecoes(state);

  const mecanicoId = payload.mecanicoId;
  if (!mecanicoId) {
    throw new Error('mecanicoId é obrigatório para registrar adiantamento');
  }

  const valor = Math.round((Number(payload.valor) || 0) * 100) / 100;
  if (valor <= 0) {
    throw new Error('Valor do vale/adiantamento deve ser maior que zero');
  }

  const comp = String(payload.competencia || new Date().toISOString()).slice(0, 7);
  const tenantId = payload.tenantId || 'default';

  const folhaFechada = state.commissionPayrolls.some(p =>
    p.mecanicoId === mecanicoId &&
    p.competencia === comp &&
    p.status === 'fechada' &&
    (!tenantId || !p.tenantId || p.tenantId === tenantId)
  );

  if (folhaFechada) {
    const err = new Error(`PAYROLL_ALREADY_CLOSED: folha de comissões para ${mecanicoId} na competência ${comp} já está fechada`);
    err.code = 'PAYROLL_ALREADY_CLOSED';
    throw err;
  }

  const vale = {
    id: `vale_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    tenantId,
    mecanicoId,
    mecanicoNome: payload.mecanicoNome || '',
    valor,
    competencia: comp,
    motivo: payload.motivo || 'Adiantamento de comissão',
    autorizadoPor: payload.autorizadoPor || 'Gerência',
    status: 'pendente',
    timestamp: payload.timestamp || new Date().toISOString()
  };

  state.mechanicAdvances.push(vale);

  state.auditoria.push({
    id: `aud_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    tipo: 'vale_adiantamento_mecanico',
    mecanicoId,
    valor,
    competencia: comp,
    timestamp: vale.timestamp
  });

  return { ok: true, vale };
}

function listarValesMecanico(state, filtros = {}) {
  if (!state || !Array.isArray(state.mechanicAdvances)) {
    return [];
  }

  let lista = [...state.mechanicAdvances];

  if (filtros.tenantId) {
    lista = lista.filter(v => v.tenantId === filtros.tenantId);
  }
  if (filtros.mecanicoId) {
    lista = lista.filter(v => v.mecanicoId === filtros.mecanicoId);
  }
  if (filtros.competencia) {
    lista = lista.filter(v => v.competencia === filtros.competencia);
  }
  if (filtros.status) {
    lista = lista.filter(v => v.status === filtros.status);
  }

  return lista;
}

function calcularPreviaFolhaComissoes(state, {
  tenantId = null,
  mecanicoId,
  competencia = null
} = {}) {
  garantirColecoes(state);

  if (!mecanicoId) {
    throw new Error('mecanicoId é obrigatório para calcular prévia da folha');
  }

  const comp = String(competencia || new Date().toISOString()).slice(0, 7);

  const produtividade = mechanicProductivityCommissionService.calcularProdutividadeEComissaoMecanico(state, {
    tenantId,
    mecanicoId,
    competencia: comp
  });

  const ocorrenciasRetrabalho = qualityWarrantyReworkService.listarOcorrenciasRetrabalho(state, {
    tenantId,
    mecanicoOrigemId: mecanicoId,
    competencia: comp
  });

  const percentualBase = (produtividade.regra && typeof produtividade.regra.percentualBase === 'number')
    ? produtividade.regra.percentualBase
    : 10;

  const valorEstornoComissaoRetrabalho = Math.round(
    ocorrenciasRetrabalho
      .filter(r => r.estornarComissao)
      .reduce((acc, r) => acc + (Number(r.valorMaoObraAfetada) || 0) * (percentualBase / 100), 0) * 100
  ) / 100;

  const temFalhaExecucao = ocorrenciasRetrabalho.some(r => r.causaRaiz === 'falha_execucao');
  const perdeuBonusPorRetrabalho = temFalhaExecucao;
  const valorBonusEficiencia = perdeuBonusPorRetrabalho ? 0 : (produtividade.valorBonusEficiencia || 0);

  const valorComissaoBruta = Math.round(
    (produtividade.valorComissaoBase + valorBonusEficiencia) * 100
  ) / 100;

  const valorComissaoAposEstornos = Math.max(
    0,
    Math.round((produtividade.valorComissaoBase - valorEstornoComissaoRetrabalho + valorBonusEficiencia) * 100) / 100
  );

  const vales = listarValesMecanico(state, {
    tenantId,
    mecanicoId,
    competencia: comp,
    status: 'pendente'
  });

  const totalValesDescontar = Math.round(
    vales.reduce((acc, v) => acc + (Number(v.valor) || 0), 0) * 100
  ) / 100;

  const saldoCalculado = Math.round((valorComissaoAposEstornos - totalValesDescontar) * 100) / 100;
  const valorLiquidoPagar = saldoCalculado > 0 ? saldoCalculado : 0;
  const saldoDevedorProximoMes = saldoCalculado < 0 ? Math.abs(saldoCalculado) : 0;

  return {
    ok: true,
    tenantId: tenantId || 'default',
    mecanicoId,
    competencia: comp,
    produtividade,
    ocorrenciasRetrabalho,
    perdeuBonusPorRetrabalho,
    valorEstornoComissaoRetrabalho,
    valorBonusEficiencia,
    valorComissaoBruta,
    valorComissaoAposEstornos,
    vales,
    totalValesDescontar,
    valorLiquidoPagar,
    saldoDevedorProximoMes
  };
}

function fecharFolhaComissoesCompetencia(state, {
  tenantId = null,
  mecanicoId,
  competencia = null,
  responsavel = 'Financeiro / RH'
} = {}) {
  garantirColecoes(state);

  if (!mecanicoId) {
    throw new Error('mecanicoId é obrigatório para fechar folha de comissões');
  }

  const comp = String(competencia || new Date().toISOString()).slice(0, 7);

  const folhaFechada = state.commissionPayrolls.some(p =>
    p.mecanicoId === mecanicoId &&
    p.competencia === comp &&
    p.status === 'fechada' &&
    (!tenantId || !p.tenantId || p.tenantId === tenantId)
  );

  if (folhaFechada) {
    const err = new Error(`PAYROLL_ALREADY_CLOSED: folha de comissões para ${mecanicoId} na competência ${comp} já está fechada`);
    err.code = 'PAYROLL_ALREADY_CLOSED';
    throw err;
  }

  const previa = calcularPreviaFolhaComissoes(state, {
    tenantId,
    mecanicoId,
    competencia: comp
  });

  const folhaId = `folha_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  const folha = {
    id: folhaId,
    tenantId: tenantId || 'default',
    mecanicoId,
    competencia: comp,
    fechadoEm: new Date().toISOString(),
    responsavel,
    resumo: {
      totalHorasVendidas: previa.produtividade.totalHorasVendidas,
      totalHorasTrabalhadas: previa.produtividade.totalHorasTrabalhadas,
      eficienciaGlobalPercentual: previa.produtividade.eficienciaGlobalPercentual,
      perdeuBonusPorRetrabalho: previa.perdeuBonusPorRetrabalho,
      valorComissaoBase: previa.produtividade.valorComissaoBase,
      valorBonusEficiencia: previa.valorBonusEficiencia,
      valorEstornoComissaoRetrabalho: previa.valorEstornoComissaoRetrabalho,
      valorComissaoAposEstornos: previa.valorComissaoAposEstornos,
      totalValesDescontados: previa.totalValesDescontar,
      valorLiquidoPagar: previa.valorLiquidoPagar,
      saldoDevedorProximoMes: previa.saldoDevedorProximoMes
    },
    status: 'fechada'
  };

  state.commissionPayrolls.push(folha);

  for (const v of previa.vales) {
    v.status = 'descontado_em_folha';
    v.folhaComissaoId = folhaId;
  }

  for (const r of previa.ocorrenciasRetrabalho) {
    if (r.estornarComissao) {
      r.statusEstorno = 'descontado_em_folha';
      r.folhaComissaoId = folhaId;
    }
  }

  let contaPagar = null;
  if (previa.valorLiquidoPagar > 0) {
    const vencto = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    contaPagar = {
      id: `cnt_com_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      tenantId: tenantId || 'default',
      tipo: 'pagar',
      cat: 'comissao_mecanico',
      categoria: 'Comissão de Mecânico',
      desc: `Folha de Comissão - ${mecanicoId} - Comp ${comp}`,
      valor: previa.valorLiquidoPagar,
      mecanicoId,
      competencia: comp,
      folhaComissaoId: folhaId,
      vencimento: vencto,
      status: 'aberto',
      createdAt: new Date().toISOString()
    };
    state.contas.push(contaPagar);
  }

  state.auditoria.push({
    id: `aud_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    tipo: 'fechamento_folha_comissao',
    folhaId,
    mecanicoId,
    competencia: comp,
    valorLiquidoPagar: previa.valorLiquidoPagar,
    timestamp: folha.fechadoEm
  });

  return {
    ok: true,
    folha,
    contaPagar
  };
}

module.exports = {
  registrarValeAdiantamentoMecanico,
  listarValesMecanico,
  calcularPreviaFolhaComissoes,
  fecharFolhaComissoesCompetencia
};

