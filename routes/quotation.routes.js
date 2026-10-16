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

router.get('/api/orcamentos', requirePermission('quotation:read'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const tenantId = extractTenantId(req);
    const { osId, status, placa } = req.query || {};
    const lista = quotationService.listarOrcamentos({ tenantId, state, osId, status, placa });
    res.json({
      success: true,
      total: lista.length,
      orcamentos: lista
    });
  } catch (err) {
    console.error('[API /api/orcamentos GET] Erro:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/api/orcamentos/:id', requirePermission('quotation:read'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const tenantId = extractTenantId(req);
    const orcamento = quotationService.obterOrcamento({ tenantId, state, quotationId: req.params.id });
    if (!orcamento) {
      return res.status(404).json({ error: 'Orçamento não encontrado.' });
    }
    res.json({
      success: true,
      orcamento
    });
  } catch (err) {
    console.error('[API /api/orcamentos/:id GET] Erro:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/orcamentos', requirePermission('quotation:write'), async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    const { osId, inspectionId, items, descontoGeral, validadeHoras, adicional, parentQuotationId, motivoAdicional } = req.body || {};
    let resultado = null;
    const saveRes = await mutateTenantState(req, (draft) => {
      resultado = quotationService.criarOrcamento({
        tenantId,
        state: draft,
        osId,
        inspectionId,
        items,
        descontoGeral,
        validadeHoras,
        adicional,
        parentQuotationId,
        motivoAdicional,
        actorId: req.securityContext?.actorId || 'operador'
      });
    });
    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({
        success: false,
        error: saveRes?.error || 'Falha ao criar orçamento.'
      });
    }
    res.json({
      success: true,
      ...resultado,
      novoEstado: { versao: saveRes.versao }
    });
  } catch (err) {
    console.error('[API /api/orcamentos POST] Erro:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/orcamentos/:id/nova-versao', requirePermission('quotation:write'), async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    const { novosItens, descontoGeral, motivo } = req.body || {};
    let resultado = null;
    const saveRes = await mutateTenantState(req, (draft) => {
      resultado = quotationService.criarNovaVersao({
        tenantId,
        state: draft,
        quotationId: req.params.id,
        novosItens,
        descontoGeral,
        motivo,
        actorId: req.securityContext?.actorId || 'operador'
      });
      if (!resultado.ok) {
        return { abort: true, resultado };
      }
    });
    if (saveRes?.aborted && saveRes?.mutatorResult?.resultado) {
      const r = saveRes.mutatorResult.resultado;
      return res.status(r.status || 400).json(r);
    }
    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({
        success: false,
        error: saveRes?.error || 'Falha ao criar nova versão de orçamento.'
      });
    }
    res.json({
      success: true,
      ...resultado,
      novoEstado: { versao: saveRes.versao }
    });
  } catch (err) {
    console.error('[API /api/orcamentos/:id/nova-versao] Erro:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/orcamentos/:id/adicional', requirePermission('quotation:write'), async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    const { items, motivo } = req.body || {};
    let resultado = null;
    const saveRes = await mutateTenantState(req, (draft) => {
      const orcAtual = quotationService.obterOrcamento({ tenantId, state: draft, quotationId: req.params.id });
      if (!orcAtual) {
        return { abort: true, notFound: true };
      }
      resultado = quotationService.criarAdicionalEscopo({
        tenantId,
        state: draft,
        osId: orcAtual.osId,
        parentQuotationId: orcAtual.id,
        items,
        motivo,
        actorId: req.securityContext?.actorId || 'operador'
      });
    });
    if (saveRes?.aborted && saveRes?.mutatorResult?.notFound) {
      return res.status(404).json({ error: 'Orçamento pai não encontrado.' });
    }
    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({
        success: false,
        error: saveRes?.error || 'Falha ao criar adicional de escopo.'
      });
    }
    res.json({
      success: true,
      ...resultado,
      novoEstado: { versao: saveRes.versao }
    });
  } catch (err) {
    console.error('[API /api/orcamentos/:id/adicional] Erro:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/orcamentos/:id/enviar', requirePermission('quotation:send'), async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    const { canal, validadeHoras } = req.body || {};
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    let resultado = null;
    const saveRes = await mutateTenantState(req, (draft) => {
      resultado = quotationService.enviarOrcamento({
        tenantId,
        state: draft,
        quotationId: req.params.id,
        canal: canal || 'link',
        validadeHoras,
        baseUrl,
        actorId: req.securityContext?.actorId || 'operador'
      });
      if (!resultado.ok) {
        return { abort: true, resultado };
      }
    });
    if (saveRes?.aborted && saveRes?.mutatorResult?.resultado) {
      const r = saveRes.mutatorResult.resultado;
      return res.status(r.status || 400).json(r);
    }
    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({
        success: false,
        error: saveRes?.error || 'Falha ao enviar orçamento.'
      });
    }
    res.json({
      success: true,
      ...resultado,
      novoEstado: { versao: saveRes.versao }
    });
  } catch (err) {
    console.error('[API /api/orcamentos/:id/enviar] Erro:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/api/orcamentos/:id/imprimir', requirePermission('quotation:read'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const tenantId = extractTenantId(req);
    const orcamento = quotationService.obterOrcamento({ tenantId, state, quotationId: req.params.id });
    if (!orcamento) {
      return res.status(404).json({ error: 'Orçamento não encontrado.' });
    }
    const os = (state.os || []).find(o => o.id === orcamento.osId);
    res.json({
      success: true,
      orcamento,
      os,
      empresa: state.cfg?.empresa || 'Oficina Mecânica'
    });
  } catch (err) {
    console.error('[API /api/orcamentos/:id/imprimir] Erro:', err);
    res.status(500).json({ error: err.message });
  }
});


/* ── Rotas de Peças, Almoxarifado e Estoque ─────────────────── */

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

router.get('/aprovacao/:token', limiterAprovacaoPublica, (req, res) => {
  const publicDir = path.resolve(ROOT_DIR, 'public');
  const filePath = path.join(publicDir, 'aprovacao.html');
  if (fs.existsSync(filePath)) {
    return res.sendFile('aprovacao.html', { root: publicDir }, (err) => {
      if (err && !res.headersSent) {
        res.status(err.status || 500).send('Erro ao carregar página de aprovação.');
      }
    });
  }
  return res.status(404).send('Página de aprovação não encontrada.');
});

router.get('/api/aprovacao/:token', limiterAprovacaoPublica, async (req, res) => {
  try {
    const token = req.params.token;
    const validacao = validarTokenAprovacaoOrcamento(token);
    if (!validacao.ok) {
      return res.status(validacao.expirado ? 410 : 400).json({
        success: false,
        error: validacao.error,
        expirado: validacao.expirado
      });
    }

    const { tenantId } = validacao.payload;
    const state = (await getState(tenantId)) || getDefaultState(tenantId);
    const consulta = quotationService.consultarPorToken({ tokenString: token, state });
    if (!consulta.ok) {
      return res.status(consulta.status || 400).json({
        success: false,
        error: consulta.error,
        conflict: consulta.conflict
      });
    }

    res.json({
      success: true,
      quotation: consulta.quotation,
      fotosInspecao: consulta.fotosInspecao
    });
  } catch (err) {
    console.error('[API /api/aprovacao/:token GET] Erro:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/api/aprovacao/:token/decidir', limiterAprovacaoPublica, async (req, res) => {
  try {
    const token = req.params.token;
    const validacao = validarTokenAprovacaoOrcamento(token);
    if (!validacao.ok) {
      return res.status(validacao.expirado ? 410 : 400).json({
        success: false,
        error: validacao.error
      });
    }

    const { tenantId } = validacao.payload;
    const { aprovarTudo, recusarTudo, itensAprovadosIds, itensRecusadosIds, motivoRecusa } = req.body || {};

    let resultadoFinal = null;
    const mutateRes = await mutateTenantState(
      { securityContext: { tenantId, actorId: 'cliente_aprovacao', role: 'customer', permissions: ['*'], channel: 'internal' } },
      async (draft) => {
        const resultado = quotationService.processarAprovacaoCliente({
          tenantId,
          state: draft,
          tokenString: token,
          itensAprovadosIds,
          itensRecusadosIds,
          aprovarTudo: Boolean(aprovarTudo),
          recusarTudo: Boolean(recusarTudo),
          motivoRecusa,
          canalAprovacao: 'link_digital',
          ipOrigem: req.ip || (req.connection && req.connection.remoteAddress) || '127.0.0.1',
          userAgent: req.headers['user-agent'] || 'Browser',
          actorId: 'cliente_web'
        });
        resultadoFinal = resultado;

        if (!resultado.ok) {
          return {
            abort: true,
            status: resultado.status || 400,
            error: resultado.error || 'Falha ao processar aprovação do orçamento.'
          };
        }

        return draft;
      }
    );

    if (!mutateRes.ok) {
      return res.status(mutateRes.status || 400).json({
        success: false,
        error: mutateRes.error || resultadoFinal?.error || 'Falha ao persistir aprovação.',
        ...resultadoFinal
      });
    }

    res.json({
      success: true,
      ...resultadoFinal,
      novoEstado: { versao: mutateRes.versao }
    });
  } catch (err) {
    if (err instanceof PersistenceError || err.name === 'PersistenceError') {
      return res.status(err.status || 409).json({
        success: false,
        ok: false,
        error: err.message,
        conflict: err.conflict,
        versao: err.versao
      });
    }
    console.error('[API /api/aprovacao/:token/decidir POST] Erro:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/* ── 9. CONFORMIDADE LGPD (Exportação e Anonimização de Titulares) ── */

module.exports = router;
