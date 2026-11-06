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
