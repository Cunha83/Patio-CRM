'use strict';

const pricingEngine = require('../pricingEngine');
const { registrarAuditoria, gerarTokenAcao, acoesPendentes } = require('./voiceSecurity');
const { handleProfitabilityAction } = require('./voiceProfitabilityActions');

async function handlePricingAction({ intencao, interpretado, input, context = {}, state = {} }) {
  const rawText = (input && typeof input.text === 'string') ? input.text :
                  (input && typeof input.texto === 'string') ? input.texto :
                  (typeof input === 'string' ? input : '');
  const t = rawText.trim();
  const tenantId = context.tenantId || 'default';

  function encontrarServicoAlvo(termo) {
    if (!Array.isArray(state.servicos)) return null;
    if (context.serviceId || context.servicoId) {
      const s = state.servicos.find(srv => (srv.id === (context.serviceId || context.servicoId)) && (srv.tenantId === tenantId || !srv.tenantId));
      if (s) return s;
    }
    const termoLimpo = (termo || '').toLowerCase();
    for (const s of state.servicos) {
      if (s.tenantId && s.tenantId !== tenantId) continue;
      const sNome = (s.nome || s.desc || '').toLowerCase();
      if (sNome && termoLimpo.includes(sNome)) return s;
    }
    for (const s of state.servicos) {
      if (s.tenantId && s.tenantId !== tenantId) continue;
      const palavras = (s.nome || s.desc || '').toLowerCase().split(/[\s-]+/).filter(w => w.length >= 4);
      if (palavras.length > 0 && palavras.every(p => termoLimpo.includes(p))) return s;
    }
    for (const s of state.servicos) {
      if (s.tenantId && s.tenantId !== tenantId) continue;
      const palavras = (s.nome || s.desc || '').toLowerCase().split(/[\s-]+/).filter(w => w.length >= 4);
      if (palavras.some(p => termoLimpo.includes(p))) return s;
    }
    return state.servicos.find(s => s.tenantId === tenantId || !s.tenantId) || null;
  }

  function encontrarOrcamentoAlvo() {
    const orcamentos = Array.isArray(state.quotations) ? state.quotations : (Array.isArray(state.orcamentos) ? state.orcamentos : []);
    const matchNum = t.match(/(?:orçamento|orcamento|os|ordem)\s*(?:#|número|numero)?\s*(\d+)/i) || t.match(/\b(\d{1,6})\b/);
    const num = matchNum ? parseInt(matchNum[1], 10) : null;
    if (num) {
      const orc = orcamentos.find(o => (o.numero === num || o.num === num || o.id === String(num)) && (o.tenantId === tenantId || !o.tenantId));
      if (orc) return orc;
    }
    if (context.quotationId || context.activeQuotationId) {
      const id = context.quotationId || context.activeQuotationId;
      const orc = orcamentos.find(o => o.id === id && (o.tenantId === tenantId || !o.tenantId));
      if (orc) return orc;
    }
    if (context.activeOsId || context.osId) {
      const osId = context.activeOsId || context.osId;
      const orc = orcamentos.find(o => (o.osId === osId || o.id === osId) && (o.tenantId === tenantId || !o.tenantId));
      if (orc) return orc;
    }
    return orcamentos.find(o => o.tenantId === tenantId || !o.tenantId) || null;
  }

  if (intencao === 'consultar_sugestao_preco') {
    const podeVer = context.isSenderAdmin ||
      (context.permissions && (context.permissions.includes('*') || context.permissions.includes('pricing:read') || context.permissions.includes('pricing:recommend')));
    if (!podeVer) {
      return { ok: false, acao: intencao, resposta: 'Acesso restrito: consultas de recomendação de preço e margem exigem perfil autorizado.' };
    }

    const servicoAlvo = encontrarServicoAlvo(t);
    if (!servicoAlvo) {
      return { ok: false, acao: intencao, resposta: 'Não encontrei o serviço especificado para sugerir o preço.' };
    }

    const rec = pricingEngine.gerarRecomendacaoPreco({
      tenantId,
      state,
      serviceId: servicoAlvo.id,
      serviceNome: servicoAlvo.nome,
      userPermissions: context.permissions || ['pricing:read', 'pricing:recommend']
    });

    if (!rec.ok) {
      return { ok: false, acao: intencao, resposta: rec.error || 'Não foi possível gerar recomendação de preço.' };
    }

    const confMsg = rec.confianca === 'alta' ? 'Alta confiança (base estatística robusta)' : (rec.confianca === 'media' ? 'Média confiança' : 'Baixa confiança (amostra reduzida ou estimativa)');
    const resposta = `Sugestão para "${servicoAlvo.nome}": Preço alvo recomendado de R$ ${rec.precoAlvoRecomendado.toFixed(2).replace('.', ',')} (margem de ${rec.margemAlvoAplicada}%). Piso mínimo de segurança: R$ ${rec.precoMinimo.toFixed(2).replace('.', ',')} (${rec.margemMinimaPolitica}%). Custo esperado: R$ ${rec.custoTotalEsperado.toFixed(2).replace('.', ',')} (${rec.tempoEsperadoHoras}h MO: R$ ${rec.custoMaoObraEsperado.toFixed(2).replace('.', ',')}, Peças: R$ ${rec.custoPecasEsperado.toFixed(2).replace('.', ',')}, baseado em ${rec.amostraHistorica.tamanhoAmostra} execuções reais). Nível: ${confMsg}.`;

    return {
      ok: true,
      acao: intencao,
      servicoId: servicoAlvo.id,
      recomendacao: rec,
      resposta
    };
  }

  if (intencao === 'consultar_margem_orcamento') {
    const podeVer = context.isSenderAdmin ||
      (context.permissions && (context.permissions.includes('*') || context.permissions.includes('pricing:read')));
    if (!podeVer) {
      return { ok: false, acao: intencao, resposta: 'Acesso restrito: apuração de margem de orçamento exige perfil autorizado.' };
    }

    const orcAlvo = encontrarOrcamentoAlvo();
    if (!orcAlvo) {
      return { ok: false, acao: intencao, resposta: 'Não localizei o orçamento para apurar a margem.' };
    }

    let receita = 0;
    let custoTotal = 0;

    const servicosOrc = Array.isArray(orcAlvo.servicos) ? orcAlvo.servicos : (Array.isArray(orcAlvo.services) ? orcAlvo.services : []);
    for (const s of servicosOrc) {
      const preco = Number(s.preco || s.valor || 0) * (Number(s.qtd || 1));
      receita += preco;
      const c = pricingEngine.calcularCustoEsperadoServico({ tenantId, state, serviceId: s.id || s.serviceId, serviceNome: s.nome || s.desc });
      custoTotal += c.custoTotalEsperado || 0;
    }

    const pecasOrc = Array.isArray(orcAlvo.pecas) ? orcAlvo.pecas : (Array.isArray(orcAlvo.parts) ? orcAlvo.parts : []);
    for (const p of pecasOrc) {
      const preco = Number(p.precoUnitario || p.preco || p.valor || 0) * (Number(p.qtd || p.quantidade || 1));
      receita += preco;
      const pCad = (state.pecas || []).find(item => item.id === (p.id || p.partId));
      const custoUnit = Number(pCad?.custoMedio || pCad?.ultimoCusto || p.custoUnitario || 0);
      custoTotal += custoUnit * (Number(p.qtd || p.quantidade || 1));
    }

    const margemBruta = receita - custoTotal;
    const margemPercentual = pricingEngine.calcularMargemBruta(receita, custoTotal);

    return {
      ok: true,
      acao: intencao,
      orcamentoId: orcAlvo.id,
      receita,
      custoTotal,
      margemBruta,
      margemPercentual,
      resposta: `Orçamento #${orcAlvo.numero || orcAlvo.num || orcAlvo.id}: Receita de R$ ${receita.toFixed(2).replace('.', ',')}, Custo previsto de R$ ${custoTotal.toFixed(2).replace('.', ',')}. Margem bruta estimada de R$ ${margemBruta.toFixed(2).replace('.', ',')} (${margemPercentual}%).`
    };
  }

  if (intencao === 'consultar_desconto_seguro') {
    const podeVer = context.isSenderAdmin ||
      (context.permissions && (context.permissions.includes('*') || context.permissions.includes('pricing:read')));
    if (!podeVer) {
      return { ok: false, acao: intencao, resposta: 'Acesso restrito: cálculo de desconto seguro exige perfil autorizado.' };
    }

    const orcAlvo = encontrarOrcamentoAlvo();
    if (orcAlvo) {
      let precoAtual = 0;
      let custoTotal = 0;
      for (const s of (orcAlvo.servicos || [])) {
        precoAtual += Number(s.preco || s.valor || 0) * Number(s.qtd || 1);
        const c = pricingEngine.calcularCustoEsperadoServico({ tenantId, state, serviceId: s.id, serviceNome: s.nome });
        custoTotal += c.custoTotalEsperado || 0;
      }
      for (const p of (orcAlvo.pecas || [])) {
        precoAtual += Number(p.precoUnitario || p.preco || p.valor || 0) * Number(p.qtd || 1);
        const pCad = (state.pecas || []).find(item => item.id === (p.id || p.partId));
        custoTotal += Number(pCad?.custoMedio || pCad?.ultimoCusto || p.custoUnitario || 0) * Number(p.qtd || 1);
      }
      const margemMinima = state.cfg?.precificacao?.margemMinimaPadrao != null ? Number(state.cfg.precificacao.margemMinimaPadrao) : 20.0;
      const precoMinimo = pricingEngine.calcularPrecoMinimo(custoTotal, margemMinima);
      const descSeguro = pricingEngine.calcularDescontoSeguro(precoAtual, precoMinimo);

      return {
        ok: true,
        acao: intencao,
        orcamentoId: orcAlvo.id,
        precoAtual,
        precoMinimo,
        descontoMaximoSeguro: descSeguro.descontoMaximoSeguro,
        resposta: `No orçamento #${orcAlvo.numero || orcAlvo.num || orcAlvo.id}, com valor atual de R$ ${precoAtual.toFixed(2).replace('.', ',')}, o piso de segurança é R$ ${precoMinimo.toFixed(2).replace('.', ',')} (margem mínima de ${margemMinima}%). O desconto máximo seguro é de R$ ${descSeguro.descontoMaximoSeguro.toFixed(2).replace('.', ',')} (${descSeguro.descontoMaximoPercentual}%).`
      };
    }

    const servicoAlvo = encontrarServicoAlvo(t);
    if (servicoAlvo) {
      const rec = pricingEngine.gerarRecomendacaoPreco({ tenantId, state, serviceId: servicoAlvo.id, userPermissions: ['pricing:read'] });
      const precoAtual = Number(servicoAlvo.preco || servicoAlvo.valor || rec.precoAlvoRecomendado || 0);
      const desc = pricingEngine.calcularDescontoSeguro(precoAtual, rec.precoMinimo);
      return {
        ok: true,
        acao: intencao,
        servicoId: servicoAlvo.id,
        precoAtual,
        precoMinimo: rec.precoMinimo,
        descontoMaximoSeguro: desc.descontoMaximoSeguro,
        resposta: `Para o serviço "${servicoAlvo.nome}", com preço atual de R$ ${precoAtual.toFixed(2).replace('.', ',')}, o piso mínimo é R$ ${rec.precoMinimo.toFixed(2).replace('.', ',')}. Você pode conceder no máximo R$ ${desc.descontoMaximoSeguro.toFixed(2).replace('.', ',')} de desconto seguro.`
      };
    }

    return { ok: false, acao: intencao, resposta: 'Não identifiquei o orçamento ou serviço para calcular o desconto seguro.' };
  }

  const profRes = await handleProfitabilityAction({ intencao, input, context, state, encontrarServicoAlvo });
  if (profRes) return profRes;

  if (intencao === 'alterar_preco_servico') {
    const servicoAlvo = (context.servicoId ? (state.servicos || []).find(s => s.id === context.servicoId) : null) || encontrarServicoAlvo(t);
    if (!servicoAlvo) {
      return { ok: false, acao: intencao, resposta: 'Não identifiquei qual serviço deve ter o preço alterado.' };
    }

    const matchValor = t.match(/r\$\s*(\d+(?:[.,]\d+)?)/i) || t.match(/(?:para|coloca|muda|por)\s*(\d+(?:[.,]\d+)?)/i) || t.match(/\b(\d{3,5})\b/);
    const novoPreco = context.novoPreco || (matchValor ? parseFloat(matchValor[1].replace(',', '.')) : null);
    if (!novoPreco || isNaN(novoPreco) || novoPreco <= 0) {
      return { ok: false, acao: intencao, resposta: 'O valor informado para o serviço é inválido.' };
    }

    const rec = pricingEngine.gerarRecomendacaoPreco({ tenantId, state, serviceId: servicoAlvo.id, userPermissions: ['pricing:read'] });
    const precoMinimo = rec.precoMinimo;

    if (novoPreco < precoMinimo && !context._confirmadoInternamente) {
      const podeOverride = context.isSenderAdmin ||
        (context.permissions && (context.permissions.includes('*') || context.permissions.includes('pricing:override')));

      if (!podeOverride) {
        return {
          ok: false,
          acao: intencao,
          abaixoDoMinimo: true,
          resposta: `Ação bloqueada: o preço de R$ ${novoPreco.toFixed(2).replace('.', ',')} fica abaixo do piso mínimo de segurança (R$ ${precoMinimo.toFixed(2).replace('.', ',')}) e você não possui permissão de override de margem.`
        };
      }

      const token = gerarTokenAcao({ acao: 'alterar_preco_servico', tenantId, actorId: context.actorId || 'operador' });
      acoesPendentes.set(token, {
        interpretado,
        input,
        context: { ...context, novoPreco, servicoId: servicoAlvo.id },
        expiraEm: Date.now() + 5 * 60 * 1000
      });

      return {
        ok: false,
        requerConfirmacao: true,
        confirmToken: token,
        acao: intencao,
        resposta: `Atenção: o preço de R$ ${novoPreco.toFixed(2).replace('.', ',')} fica abaixo do piso de segurança de R$ ${precoMinimo.toFixed(2).replace('.', ',')} (margem mínima de ${rec.margemMinimaPolitica}%). Para confirmar essa exceção com autorização de override, responda "confirmar".`
      };
    }

    const precoAnterior = Number(servicoAlvo.preco || servicoAlvo.valor || 0);
    servicoAlvo.preco = novoPreco;
    servicoAlvo.valor = novoPreco;

    if (context._confirmadoInternamente && novoPreco < precoMinimo) {
      pricingEngine.registrarOverridePreco({
        tenantId,
        state,
        serviceId: servicoAlvo.id,
        precoProposto: novoPreco,
        precoMinimo,
        motivo: `Override autorizado via comando de voz ${state?.cfg?.assistente?.displayName || 'Verônica'}`,
        autorizadoPor: context.actorId || 'operador'
      });
    }

    registrarAuditoria(state, {
      canal: context.canal || 'voz',
      usuario: context.actorId || 'Operador',
      intencao,
      comando: input,
      resumo: `Preço do serviço "${servicoAlvo.nome}" alterado de R$ ${precoAnterior.toFixed(2)} para R$ ${novoPreco.toFixed(2)}.`
    });

    return {
      ok: true,
      acao: intencao,
      servicoId: servicoAlvo.id,
      precoAnterior,
      novoPreco,
      resposta: `Preço do serviço "${servicoAlvo.nome}" atualizado com sucesso para R$ ${novoPreco.toFixed(2).replace('.', ',')}.`
    };
  }

  return null;
}

module.exports = {
  handlePricingAction
};
