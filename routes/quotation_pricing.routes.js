const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const rateLimit = require('express-rate-limit');
const {
  getOrLoadState,
  salvarEstado,
  persistTenantState,
  mutateTenantState,
  extractTenantId,
  requirePermission,
  getWppClient
} = require('../lib/serverContext');
const quotationService = require('../services/quotationService');
const pricingEngine = require('../services/pricingEngine');
const {
  gerarTokenAprovacaoOrcamento,
  validarTokenAprovacaoOrcamento,
  consumirTokenAprovacaoOrcamento
} = require('../lib/tokens/securityToken');
const {
  getState,
  getDefaultState,
  PersistenceError
} = require('../lib/repository/stateRepository');

const ROOT_DIR = path.resolve(__dirname, '../');

const limiterAprovacaoPublica = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  message: { success: false, error: 'Muitas requisições para a aprovação digital. Tente novamente em alguns minutos.' },
  standardHeaders: true,
  legacyHeaders: false
});

router.get('/api/orcamentos/:id/margem', requirePermission('pricing:read'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const tenantId = extractTenantId(req);
    const orcId = req.params.id;
    const orcamentos = [
      ...(Array.isArray(state.quotations) ? state.quotations : []),
      ...(Array.isArray(state.orcamentos) ? state.orcamentos : [])
    ];
    let orc = orcamentos.find(o => (o.id === orcId || o.osId === orcId || o.num === parseInt(orcId, 10) || o.numero === parseInt(orcId, 10)) && (o.tenantId === tenantId || !o.tenantId));
    if (!orc) {
      const os = (state.os || []).find(o => (o.id === orcId || o.num === parseInt(orcId, 10)) && (o.tenantId === tenantId || !o.tenantId));
      if (os) orc = os;
    }
    if (!orc) {
      return res.status(404).json({ success: false, error: 'Orçamento não encontrado.' });
    }

    let precoTotal = 0;
    let custoTotalEsperado = 0;
    const itensDetalhados = [];

    for (const s of (orc.servicos || orc.services || [])) {
      const qtd = Number(s.qtd || 1);
      const pUnit = Number(s.preco || s.valor || 0);
      const pTot = pUnit * qtd;
      precoTotal += pTot;
      const cEsp = pricingEngine.calcularCustoEsperadoServico({ tenantId, state, serviceId: s.id || s.serviceId, serviceNome: s.nome || s.desc });
      const cTot = (cEsp.custoTotalEsperado || 0) * qtd;
      custoTotalEsperado += cTot;
      itensDetalhados.push({
        tipo: 'servico',
        id: s.id || s.serviceId,
        nome: s.nome || s.desc,
        qtd,
        precoTotal: pTot,
        custoTotal: cTot,
        margemBruta: pTot - cTot,
        margemPercentual: pricingEngine.calcularMargemBruta(pTot, cTot)
      });
    }

    for (const p of (orc.pecas || orc.parts || [])) {
      const qtd = Number(p.qtd || p.quantidade || 1);
      const pUnit = Number(p.precoUnitario || p.preco || p.valor || 0);
      const pTot = pUnit * qtd;
      precoTotal += pTot;
      const pCad = (state.pecas || []).find(item => item.id === (p.id || p.partId));
      const cUnit = Number(pCad?.custoMedio || pCad?.ultimoCusto || p.custoUnitario || 0);
      const cTot = cUnit * qtd;
      custoTotalEsperado += cTot;
      itensDetalhados.push({
        tipo: 'peca',
        id: p.id || p.partId,
        nome: p.desc || p.nome || pCad?.descricao || 'Peça',
        qtd,
        precoTotal: pTot,
        custoTotal: cTot,
        margemBruta: pTot - cTot,
        margemPercentual: pricingEngine.calcularMargemBruta(pTot, cTot)
      });
    }

    const margemBrutaTotal = precoTotal - custoTotalEsperado;
    const margemPercentualTotal = pricingEngine.calcularMargemBruta(precoTotal, custoTotalEsperado);
    const margemMinima = state.cfg?.precificacao?.margemMinimaPadrao != null ? Number(state.cfg.precificacao.margemMinimaPadrao) : 20.0;
    const precoMinimoTotal = pricingEngine.calcularPrecoMinimo(custoTotalEsperado, margemMinima);
    const descontoSeguro = pricingEngine.calcularDescontoSeguro(precoTotal, precoMinimoTotal);

    res.json({
      success: true,
      orcamentoId: orc.id,
      precoTotal,
      custoTotalEsperado,
      margemBrutaTotal,
      margemPercentualTotal,
      margemMinimaPolitica: margemMinima,
      precoMinimoTotal,
      descontoMaximoSeguro: descontoSeguro.descontoMaximoSeguro,
      descontoMaximoPercentual: descontoSeguro.descontoMaximoPercentual,
      abaixoDaMargemMinima: margemPercentualTotal < margemMinima,
      itens: itensDetalhados
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/api/orcamentos/:id/override-preco', requirePermission('pricing:override'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const tenantId = extractTenantId(req);
    const secCtx = req.securityContext;
    const actorId = secCtx?.user?.id || secCtx?.user?.username || 'admin';
    const { serviceId, partId, precoProposto, motivo } = req.body;

    if (precoProposto == null || isNaN(precoProposto)) {
      return res.status(400).json({ success: false, error: 'Preço proposto é obrigatório e deve ser numérico.' });
    }
    if (!motivo || String(motivo).trim().length < 3) {
      return res.status(400).json({ success: false, error: 'Justificativa do override é obrigatória.' });
    }

    const orcamentos = [
      ...(Array.isArray(state.quotations) ? state.quotations : []),
      ...(Array.isArray(state.orcamentos) ? state.orcamentos : [])
    ];
    let orc = orcamentos.find(o => (o.id === req.params.id || o.osId === req.params.id || o.num === parseInt(req.params.id, 10)) && (o.tenantId === tenantId || !o.tenantId));
    if (!orc) {
      const os = (state.os || []).find(o => (o.id === req.params.id || o.num === parseInt(req.params.id, 10)) && (o.tenantId === tenantId || !o.tenantId));
      if (os) orc = os;
    }
    if (!orc) {
      return res.status(404).json({ success: false, error: 'Orçamento não encontrado.' });
    }

    let precoMinimo = 0;
    let custoEsperado = 0;
    let margemMinima = state.cfg?.precificacao?.margemMinimaPadrao != null ? Number(state.cfg.precificacao.margemMinimaPadrao) : 20.0;

    if (serviceId) {
      const c = pricingEngine.calcularCustoEsperadoServico({ tenantId, state, serviceId });
      custoEsperado = c.custoTotalEsperado;
      precoMinimo = pricingEngine.calcularPrecoMinimo(custoEsperado, margemMinima);
    } else if (partId) {
      const pCad = (state.pecas || []).find(p => p.id === partId);
      custoEsperado = Number(pCad?.custoMedio || pCad?.ultimoCusto || 0);
      precoMinimo = pricingEngine.calcularPrecoMinimo(custoEsperado, margemMinima);
    }

    const reg = pricingEngine.registrarOverridePreco({
      tenantId,
      state,
      quotationId: orc.id,
      serviceId,
      partId,
      precoProposto: Number(precoProposto),
      precoMinimo,
      motivo,
      autorizadoPor: actorId
    });

    const saveRes = await persistTenantState(req, state);
    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({ success: false, error: saveRes?.error || 'Falha ao persistir override de preço.' });
    }

    res.json({
      success: true,
      override: reg.override
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});



/* ── CRM, Frotistas, Manutenção Preventiva, Pós-Venda e Configurações ── */

// ── 1. CLIENTES E TIMELINE ──────────────────────────────────────


module.exports = router;
