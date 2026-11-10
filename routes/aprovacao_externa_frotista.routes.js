'use strict';

/**
 * routes/aprovacao_externa_frotista.routes.js
 *
 * Endpoints REST para o Portal Tokenizado de Aprovação Externa B2B:
 * 1. POST /api/orcamentos/:osId/link-aprovacao-externa (Gera link e invalida anteriores)
 * 2. GET  /api/orcamentos/links-aprovacao-externa (Histórico e status de links emitidos)
 * 3. POST /api/orcamentos/tokens/:tokenId/revogar (Revogação administrativa de link)
 * 4. GET  /api/public/aprovacao-frotista/:token (Portal público para consulta do frotista)
 * 5. POST /api/public/aprovacao-frotista/:token/decidir (Decisão com trilha jurídica e destravamento de box)
 *
 * Teto Modular: <= 350 linhas
 */

const express = require('express');
const router = express.Router();

const {
  getOrLoadState,
  mutateTenantState,
  extractTenantId,
  requirePermission
} = require('../lib/serverContext');

const externalFleetApprovalService = require('../services/quotation/externalFleetApprovalService');

// 1. Gerar link tokenizado de aprovação externa
router.post('/api/orcamentos/:osId/link-aprovacao-externa', requirePermission('quotation:write', 'quotation:manage', 'os:write'), async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    let resultado = null;

    const saveRes = await mutateTenantState(req, (draft) => {
      resultado = externalFleetApprovalService.gerarLinkTokenAprovacaoFrotista(draft, {
        tenantId,
        osId: req.params.osId,
        responsavel: req.securityContext?.actorId || req.user?.username || 'consultor',
        ...req.body
      });
    });

    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({ success: false, error: saveRes?.error || 'Falha ao salvar link de aprovação.' });
    }

    res.json({ success: true, ...resultado });
  } catch (err) {
    res.status(400).json({ success: false, code: err.code || 'LINK_GENERATION_ERROR', error: err.message });
  }
});

// 2. Listar links e tokens de aprovação externa
router.get('/api/orcamentos/links-aprovacao-externa', requirePermission('quotation:read', 'quotation:manage'), async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    const state = await getOrLoadState(req);
    const resultado = externalFleetApprovalService.listarLinksAprovacaoExterna(state, {
      tenantId,
      osId: req.query.osId,
      status: req.query.status
    });

    res.json({ success: true, ...resultado });
  } catch (err) {
    res.status(400).json({ success: false, code: err.code || 'LIST_LINKS_ERROR', error: err.message });
  }
});

// 3. Revogar token de aprovação externa
router.post('/api/orcamentos/tokens/:tokenId/revogar', requirePermission('quotation:write', 'quotation:manage'), async (req, res) => {
  try {
    let resultado = null;

    const saveRes = await mutateTenantState(req, (draft) => {
      resultado = externalFleetApprovalService.revogarTokenAprovacaoFrotista(draft, req.params.tokenId, req.body);
    });

    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({ success: false, error: saveRes?.error || 'Falha ao revogar token.' });
    }

    res.json({ success: true, ...resultado });
  } catch (err) {
    res.status(400).json({ success: false, code: err.code || 'REVOKE_TOKEN_ERROR', error: err.message });
  }
});

// 4. Portal Público: Consultar orçamento via token
router.get('/api/public/aprovacao-frotista/:token', async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const resultado = externalFleetApprovalService.consultarOrcamentoPorTokenPublico(state, req.params.token, {
      dataReferencia: req.query.dataReferencia
    });

    res.json({ success: true, ...resultado });
  } catch (err) {
    const status = (err.code === 'APPROVAL_TOKEN_NOT_FOUND') ? 404 : 400;
    res.status(status).json({ success: false, code: err.code || 'PUBLIC_APPROVAL_CONSULT_ERROR', error: err.message });
  }
});

// 5. Portal Público: Submeter decisão com auditoria jurídica e destravamento
router.post('/api/public/aprovacao-frotista/:token/decidir', async (req, res) => {
  try {
    let resultado = null;
    const ipOrigem = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || req.ip || '127.0.0.1';
    const userAgent = req.headers['user-agent'] || 'Desconhecido';

    const saveRes = await mutateTenantState(req, (draft) => {
      resultado = externalFleetApprovalService.submeterDecisaoExternaFrotista(draft, req.params.token, {
        ...req.body,
        ipOrigem,
        userAgent
      });
    });

    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({ success: false, error: saveRes?.error || 'Falha ao registrar decisão externa.' });
    }

    res.json({ success: true, ...resultado });
  } catch (err) {
    res.status(400).json({ success: false, code: err.code || 'EXTERNAL_APPROVAL_DECISION_ERROR', error: err.message });
  }
});

module.exports = router;

