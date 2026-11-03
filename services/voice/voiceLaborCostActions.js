'use strict';

const costingService = require('../costingService');

async function handleLaborCostAction({ intencao, input, context = {}, state = {} }) {
  const rawText = (input && typeof input.text === 'string') ? input.text :
                  (input && typeof input.texto === 'string') ? input.texto :
                  (typeof input === 'string' ? input : '');
  const t = rawText.trim();
  const tenantId = context.tenantId || 'default';

  if (intencao === 'consultar_custo_mao_obra_os') {
    const podeVerCusto = context.isSenderAdmin ||
      (context.permissions && (context.permissions.includes('*') || context.permissions.includes('costing:read') || context.permissions.includes('productivity:manage')));

    if (!podeVerCusto) {
      return { ok: false, acao: intencao, resposta: 'Acesso restrito: consultas financeiras de custo real exigem perfil administrativo ou gerencial.' };
    }

    const matchOS = t.match(/(?:os|ordem)\s*(?:#|número|numero)?\s*(\d+)/i) || t.match(/\b(\d{3,6})\b/);
    const numOS = matchOS ? parseInt(matchOS[1], 10) : null;
    const osAlvo = (state.os || []).find(o => (!numOS || o.num === numOS || o.id === String(numOS)) && (o.tenantId === tenantId || !o.tenantId));
    if (!osAlvo) {
      return { ok: false, acao: intencao, resposta: 'Não identifiquei a ordem de serviço informada.' };
    }

    const apuracao = costingService.calcularCustoMaoDeObraOS({ tenantId, state, osId: osAlvo.id });
    return {
      ok: true,
      acao: intencao,
      custoMaoObra: apuracao.custoMaoObra,
      resposta: `O custo real de mão de obra da OS #${osAlvo.num || osAlvo.id} é de R$ ${apuracao.custoMaoObra.toFixed(2).replace('.', ',')} para um total de ${apuracao.horasHomemTotal} horas-homem trabalhadas.`
    };
  }

  if (intencao === 'consultar_custo_real_os') {
    const podeVerCusto = context.isSenderAdmin ||
      (context.permissions && (context.permissions.includes('*') || context.permissions.includes('costing:read') || context.permissions.includes('productivity:manage')));

    if (!podeVerCusto) {
      return { ok: false, acao: intencao, resposta: 'Acesso restrito: apuração de custo real e margem da OS exige perfil administrativo ou gerencial.' };
    }

    const matchOS = t.match(/(?:os|ordem)\s*(?:#|número|numero)?\s*(\d+)/i) || t.match(/\b(\d{3,6})\b/);
    const numOS = matchOS ? parseInt(matchOS[1], 10) : null;
    const osAlvo = (state.os || []).find(o => (!numOS || o.num === numOS || o.id === String(numOS)) && (o.tenantId === tenantId || !o.tenantId));
    if (!osAlvo) {
      return { ok: false, acao: intencao, resposta: 'Não identifiquei a ordem de serviço informada.' };
    }

    const custoConsolidado = costingService.calcularCustoRealOS({ tenantId, state, osId: osAlvo.id });
    return {
      ok: true,
      acao: intencao,
      custos: custoConsolidado,
      resposta: `OS #${osAlvo.num || osAlvo.id}: Peças consumidas: R$ ${custoConsolidado.custoPecasConsumidas.toFixed(2).replace('.', ',')}, Mão de obra: R$ ${custoConsolidado.custoMaoObra.toFixed(2).replace('.', ',')}. Custo real total: R$ ${custoConsolidado.custoRealOS.toFixed(2).replace('.', ',')}. Valor autorizado: R$ ${custoConsolidado.receitaAutorizada.toFixed(2).replace('.', ',')}. Margem bruta operacional: R$ ${custoConsolidado.margemBrutaOS.toFixed(2).replace('.', ',')} (${custoConsolidado.margemPercentual}%).`
    };
  }

  return null;
}

module.exports = {
  handleLaborCostAction
};

