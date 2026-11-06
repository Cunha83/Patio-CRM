const express = require('express');
const router = express.Router();
const {
  getOrLoadState,
  salvarEstado,
  mutateTenantState,
  extractTenantId,
  requirePermission,
  avaliarManutencoes,
  avaliarPosVenda,
  avaliarRelacionamento,
  gerarId
} = require('../lib/serverContext');
const customerTimelineService = require('../services/customerTimelineService');
const maintenancePlanService = require('../services/maintenancePlanService');
const relationshipService = require('../services/relationshipService');
const appointmentService = require('../services/appointmentService');
const afterSalesService = require('../services/afterSalesService');
const consultaClienteService = require('../services/consultaClienteService');

router.get('/api/agendamentos', requirePermission('appointments:read'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const tenantId = extractTenantId(req);
    const agendamentos = (state.appointments || []).filter(a => a.tenantId === tenantId);
    res.json({ success: true, total: agendamentos.length, agendamentos });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/api/agendamentos', requirePermission('appointments:write'), async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    const secCtx = req.securityContext;
    const actorId = secCtx?.actorId || 'operador';

    let resultado;
    const saveRes = await mutateTenantState(req, (draft) => {
      resultado = appointmentService.criarAgendamento({
        tenantId,
        state: draft,
        createdBy: actorId,
        ...req.body
      });
    });

    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({ success: false, error: saveRes?.error || 'Falha ao persistir agendamento.' });
    }
    res.json({ success: true, ...resultado });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.post('/api/agendamentos/:id/cancelar', requirePermission('appointments:write'), async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    const secCtx = req.securityContext;
    const actorId = secCtx?.actorId || 'operador';
    const { motivo } = req.body || {};

    let resultado;
    const saveRes = await mutateTenantState(req, (draft) => {
      resultado = appointmentService.cancelarAgendamento({
        tenantId,
        state: draft,
        appointmentId: req.params.id,
        motivo,
        actorId
      });
      if (!resultado.ok) {
        return { abort: true, error: resultado.error };
      }
    });

    if (!resultado?.ok) return res.status(404).json({ success: false, error: resultado?.error });
    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({ success: false, error: saveRes?.error || 'Falha ao persistir cancelamento.' });
    }

    res.json({ success: true, ...resultado });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/api/agendamentos/:id/converter-pre-os', requirePermission('appointments:write', 'os:write'), async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    const secCtx = req.securityContext;
    const actorId = secCtx?.actorId || 'recepcao';

    let resultado;
    const saveRes = await mutateTenantState(req, (draft) => {
      resultado = appointmentService.converterParaPreOS({
        tenantId,
        state: draft,
        appointmentId: req.params.id,
        actorId
      });
      if (!resultado.ok) {
        return { abort: true, error: resultado.error };
      }
    });

    if (!resultado?.ok) return res.status(400).json({ success: false, error: resultado?.error });
    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({ success: false, error: saveRes?.error || 'Falha ao persistir conversão para pré-OS.' });
    }

    res.json({ success: true, ...resultado });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── 6. PÓS-VENDA ────────────────────────────────────────────────
router.get('/api/pos-venda', requirePermission('crm:read'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const tenantId = extractTenantId(req);
    afterSalesService.avaliarPosVenda({ tenantId, state });
    const registros = (state.afterSales || []).filter(a => a.tenantId === tenantId);
    res.json({ success: true, total: registros.length, registros });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/api/pos-venda/:id/contatar', requirePermission('crm:contact'), async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    const { tipo = 'verificacao_servico', canal = 'whatsapp' } = req.body || {};

    let regRetornado, msg;
    const saveRes = await mutateTenantState(req, (draft) => {
      const reg = (draft.afterSales || []).find(a => a.id === req.params.id && a.tenantId === tenantId);
      if (!reg) return { abort: true, error: 'Registro de pós-venda não encontrado.' };

      msg = afterSalesService.gerarMensagemFollowUp({ tenantId, state: draft, osId: reg.osId });
      if (!Array.isArray(reg.contatos)) reg.contatos = [];
      reg.contatos.push({
        data: new Date().toISOString(),
        tipo,
        canal,
        status: 'enviado'
      });
      reg.status = 'contatado';
      regRetornado = reg;
    });

    if (!regRetornado) return res.status(404).json({ success: false, error: 'Registro de pós-venda não encontrado.' });
    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({ success: false, error: saveRes?.error || 'Falha ao persistir contato de pós-venda.' });
    }

    res.json({ success: true, registro: regRetornado, mensagem: msg });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/api/pos-venda/:id/responder', async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    const { resposta, canal = 'whatsapp' } = req.body || {};

    let resultado;
    const saveRes = await mutateTenantState(req, (draft) => {
      resultado = afterSalesService.processarRespostaCliente({
        tenantId,
        state: draft,
        afterSalesId: req.params.id,
        respostaTexto: resposta,
        canal
      });
      if (!resultado.ok) {
        return { abort: true, error: resultado.error || 'Resposta de pós-venda inválida' };
      }
    });

    if (!resultado?.ok) return res.status(400).json(resultado);
    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({ success: false, error: saveRes?.error || 'Falha ao persistir resposta de pós-venda.' });
    }

    res.json({ success: true, ...resultado });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── 7. CONFIGURAÇÕES: EMPRESA E IDENTIDADE VISUAL ───────────────



module.exports = router;
