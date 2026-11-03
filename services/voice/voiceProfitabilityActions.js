'use strict';

const pricingEngine = require('../pricingEngine');

async function handleProfitabilityAction({ intencao, input, context = {}, state = {}, encontrarServicoAlvo }) {
  const rawText = (input && typeof input.text === 'string') ? input.text :
                  (input && typeof input.texto === 'string') ? input.texto :
                  (typeof input === 'string' ? input : '');
  const t = rawText.trim();
  const tenantId = context.tenantId || 'default';

  if (intencao === 'consultar_servicos_pouca_margem') {
    const podeVer = context.isSenderAdmin ||
      (context.permissions && (context.permissions.includes('*') || context.permissions.includes('profitability:read')));
    if (!podeVer) {
      return { ok: false, acao: intencao, resposta: 'Acesso restrito: análise de rentabilidade exige perfil autorizado.' };
    }

    const lista = pricingEngine.obterRentabilidadeServicos({ tenantId, state, ordenarPor: 'margem_asc', limite: 5 });
    if (lista.length === 0) {
      return { ok: true, acao: intencao, resposta: 'Ainda não há dados suficientes de ordens finalizadas para analisar a margem dos serviços.' };
    }

    const itens = lista.slice(0, 3).map(s => `"${s.serviceNome}": margem ${s.margemPercentual}% (Custo: R$ ${s.custoRealTotal.toFixed(2).replace('.', ',')}, Receita: R$ ${s.receitaTotal.toFixed(2).replace('.', ',')})`).join('; ');
    return {
      ok: true,
      acao: intencao,
      servicos: lista,
      resposta: `Os serviços com menor margem recente são: ${itens}.`
    };
  }

  if (intencao === 'consultar_servico_mais_retrabalho') {
    const podeVer = context.isSenderAdmin ||
      (context.permissions && (context.permissions.includes('*') || context.permissions.includes('profitability:read') || context.permissions.includes('productivity:manage')));
    if (!podeVer) {
      return { ok: false, acao: intencao, resposta: 'Acesso restrito: análise de retrabalho exige perfil autorizado.' };
    }

    const lista = pricingEngine.obterRentabilidadeServicos({ tenantId, state, ordenarPor: 'retrabalho_desc', limite: 5 });
    const comRetrabalho = lista.filter(s => s.taxaRetrabalho > 0);
    if (comRetrabalho.length === 0) {
      return { ok: true, acao: intencao, resposta: 'Excelente! Não há registros de retrabalho associados aos serviços executados no período.' };
    }

    const top = comRetrabalho[0];
    return {
      ok: true,
      acao: intencao,
      servicos: comRetrabalho,
      resposta: `O serviço com maior índice de retrabalho é "${top.serviceNome}", com taxa de retrabalho de ${top.taxaRetrabalho}% (${top.execucoesRetrabalho} retorno(s) em ${top.quantidadeExecucoes} execuções).`
    };
  }

  if (intencao === 'consultar_custo_medio_servico') {
    const podeVer = context.isSenderAdmin ||
      (context.permissions && (context.permissions.includes('*') || context.permissions.includes('pricing:read')));
    if (!podeVer) {
      return { ok: false, acao: intencao, resposta: 'Acesso restrito: custo médio de serviços exige perfil autorizado.' };
    }

    const servicoAlvo = encontrarServicoAlvo(t);
    if (!servicoAlvo) {
      return { ok: false, acao: intencao, resposta: 'Não identifiquei o serviço desejado para calcular o custo médio.' };
    }

    const custo = pricingEngine.calcularCustoEsperadoServico({ tenantId, state, serviceId: servicoAlvo.id, serviceNome: servicoAlvo.nome });
    return {
      ok: true,
      acao: intencao,
      servicoId: servicoAlvo.id,
      custo,
      resposta: `O custo médio estimado para "${servicoAlvo.nome}" é de R$ ${custo.custoTotalEsperado.toFixed(2).replace('.', ',')}, sendo R$ ${custo.custoMaoObraEsperado.toFixed(2).replace('.', ',')} de mão de obra (${(custo.tempoEsperadoMinutos / 60).toFixed(1)}h) e R$ ${custo.custoPecasEsperado.toFixed(2).replace('.', ',')} em peças.`
    };
  }

  if (intencao === 'consultar_adequacao_preco_servico') {
    const podeVer = context.isSenderAdmin ||
      (context.permissions && (context.permissions.includes('*') || context.permissions.includes('pricing:read')));
    if (!podeVer) {
      return { ok: false, acao: intencao, resposta: 'Acesso restrito: avaliação de preço exige perfil autorizado.' };
    }

    const servicoAlvo = encontrarServicoAlvo(t);
    if (!servicoAlvo) {
      return { ok: false, acao: intencao, resposta: 'Não identifiquei qual serviço analisar.' };
    }

    const rec = pricingEngine.gerarRecomendacaoPreco({ tenantId, state, serviceId: servicoAlvo.id, userPermissions: ['pricing:read'] });
    const precoAtual = Number(servicoAlvo.preco || servicoAlvo.valor || 0);

    let avaliacao = '';
    if (precoAtual === 0) {
      avaliacao = `O serviço "${servicoAlvo.nome}" está sem preço definido. A recomendação é cobrar R$ ${rec.precoAlvoRecomendado.toFixed(2).replace('.', ',')}.`;
    } else if (precoAtual < rec.precoMinimo) {
      avaliacao = `Atenção: o preço atual de R$ ${precoAtual.toFixed(2).replace('.', ',')} está abaixo do piso mínimo de segurança de R$ ${rec.precoMinimo.toFixed(2).replace('.', ',')}. A margem atual é prejudicial à oficina. Recomenda-se ajustar para R$ ${rec.precoAlvoRecomendado.toFixed(2).replace('.', ',')}.`;
    } else if (precoAtual < rec.precoAlvoRecomendado) {
      avaliacao = `O preço atual de R$ ${precoAtual.toFixed(2).replace('.', ',')} cobre o piso mínimo (R$ ${rec.precoMinimo.toFixed(2).replace('.', ',')}), mas está abaixo da meta ideal de R$ ${rec.precoAlvoRecomendado.toFixed(2).replace('.', ',')}.`;
    } else {
      avaliacao = `O preço atual de R$ ${precoAtual.toFixed(2).replace('.', ',')} é saudável e está alinhado com a meta de rentabilidade da oficina (alvo sugerido: R$ ${rec.precoAlvoRecomendado.toFixed(2).replace('.', ',')}).`;
    }

    return {
      ok: true,
      acao: intencao,
      servicoId: servicoAlvo.id,
      precoAtual,
      precoAlvo: rec.precoAlvoRecomendado,
      precoMinimo: rec.precoMinimo,
      resposta: avaliacao
    };
  }

  return null;
}

module.exports = {
  handleProfitabilityAction
};

