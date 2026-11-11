const express = require('express');
const router = express.Router();
const {
  getOrLoadState,
  mutateTenantState,
  extractTenantId,
  requirePermission
} = require('../lib/serverContext');
const customerTimelineService = require('../services/customerTimelineService');
const maintenancePlanService = require('../services/maintenancePlanService');
const relationshipService = require('../services/relationshipService');
const appointmentService = require('../services/appointmentService');
const afterSalesService = require('../services/afterSalesService');
const consultaClienteService = require('../services/consultaClienteService');
const conversaoOportunidadesRouter = require('./crm_oportunidades_conversao.routes');

// Monta submódulo de conversão e follow-up de oportunidades
router.use(conversaoOportunidadesRouter);

// ── 1. PLANOS DE MANUTENÇÃO ──────────────────────────────────────
router.get('/api/manutencao/planos', requirePermission('maintenance:read'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const tenantId = extractTenantId(req);
    const { vehicleId, fleetId } = req.query || {};
    const planos = maintenancePlanService.listarPlanos({ tenantId, state, vehicleId, fleetId });
    res.json({ success: true, total: planos.length, planos });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/api/manutencao/planos', requirePermission('maintenance:write'), async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    const actorId = req.securityContext?.actorId || 'operador';
    let resultado;
    const saveRes = await mutateTenantState(req, (draft) => {
      resultado = maintenancePlanService.criarPlano({ tenantId, state: draft, actorId, ...req.body });
    });
    if (!saveRes?.ok) {
      return res.status(saveRes?.status || 500).json({ success: false, error: saveRes?.error || 'Falha ao persistir plano.' });
    }
    res.json({ success: true, ...resultado });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.get('/api/manutencao/vencimentos', requirePermission('maintenance:read'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const tenantId = extractTenantId(req);
    const { vehicleId, fleetId, data } = req.query || {};
    const resultado = maintenancePlanService.avaliarVencimentos({ tenantId, state, vehicleId, fleetId, dataReferencia: data });
    res.json({ success: true, ...resultado });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/api/manutencao/atualizar-km', requirePermission('maintenance:write'), async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    const actorId = req.securityContext?.actorId || 'operador';
    const { vehicleId, placa, km, fonte, permitirOverride } = req.body || {};

    let resultado;
    const saveRes = await mutateTenantState(req, (draft) => {
      resultado = maintenancePlanService.atualizarKmVeiculo({
        tenantId, state: draft, vehicleId, placa, kmInformado: km, fonte: fonte || 'web', ator: actorId, permitirOverride: Boolean(permitirOverride)
      });
      if (!resultado.ok) return { abort: true, error: resultado.erro || 'Atualização de KM inválida' };
    });

    if (!resultado?.ok) {
      return res.status(resultado?.incoerente ? 409 : 400).json({ success: false, ...resultado });
    }
    if (!saveRes?.ok) {
      return res.status(saveRes?.status || 500).json({ success: false, error: saveRes?.error || 'Falha ao persistir KM.' });
    }
    res.json({ success: true, ...resultado });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── 2. OPORTUNIDADES & CRM ──────────────────────────────────────
router.get('/api/crm/oportunidades', requirePermission('crm:read'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const tenantId = extractTenantId(req);
    relationshipService.avaliarOportunidades({ tenantId, state });
    const oportunidades = (state.opportunities || []).filter(o => o.tenantId === tenantId);
    res.json({ success: true, total: oportunidades.length, oportunidades });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/api/crm/oportunidades/:id/contatar', requirePermission('crm:contact'), async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    const { canal = 'whatsapp', mensagem = '' } = req.body || {};
    let opoRetornado, motivo403 = null, naoEncontrado = false;

    const saveRes = await mutateTenantState(req, (draft) => {
      const list = draft.opportunities || [];
      const opo = list.find(o => o.id === req.params.id && o.tenantId === tenantId);
      if (!opo) { naoEncontrado = true; return { abort: true, error: 'Oportunidade não encontrada.' }; }

      const cliente = (draft.clientes || []).find(c => c.id === opo.customerId);
      const val = relationshipService.validarEnvioNotificacao({ cliente, tipoMensagem: 'comercial', canal });
      if (!val.permitido) { motivo403 = val.motivo; return { abort: true, error: val.motivo }; }

      opo.status = 'contatado';
      opo.ultimoContato = new Date().toISOString();
      opo.canalContato = canal;
      opo.historicoContatos = opo.historicoContatos || [];
      opo.historicoContatos.push({ data: new Date().toISOString(), canal, mensagem });
      opoRetornado = opo;
    });

    if (naoEncontrado) return res.status(404).json({ success: false, error: 'Oportunidade não encontrada.' });
    if (motivo403) return res.status(403).json({ success: false, error: motivo403 });
    if (!saveRes?.ok) return res.status(saveRes?.status || 500).json({ success: false, error: saveRes?.error || 'Falha ao salvar oportunidade.' });

    res.json({ success: true, oportunidade: opoRetornado });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/api/crm/oportunidades/metricas', requirePermission('crm:read'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const tenantId = extractTenantId(req);
    const metricas = relationshipService.obterMetricas({ tenantId, state });
    res.json({ success: true, metricas });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});


// ── 4. PÓS-VENDA ────────────────────────────────────────────────
router.get('/api/pos-venda/pesquisas-pendentes', requirePermission('crm:read'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const tenantId = extractTenantId(req);
    const pendentes = afterSalesService.listarPesquisasPendentes({ tenantId, state });
    res.json({ success: true, total: pendentes.length, pesquisas: pendentes });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/api/pos-venda/registrar-resposta', requirePermission('crm:write'), async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    let resultado;
    const saveRes = await mutateTenantState(req, (draft) => {
      resultado = afterSalesService.registrarRespostaPesquisa({ tenantId, state: draft, ...req.body });
    });
    if (!saveRes?.ok) return res.status(saveRes?.status || 500).json({ success: false, error: saveRes?.error || 'Falha ao salvar pesquisa.' });
    res.json({ success: true, ...resultado });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.get('/api/pos-venda/metricas', requirePermission('crm:read'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const tenantId = extractTenantId(req);
    const metricas = afterSalesService.calcularMetricas({ tenantId, state });
    res.json({ success: true, metricas });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── 5. TIMELINE & CONSULTA INTEGRADA ────────────────────────────
router.get('/api/clientes/:id/timeline', requirePermission('customers:read'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const tenantId = extractTenantId(req);
    const timeline = customerTimelineService.obterTimelineCliente({ tenantId, state, clienteId: req.params.id });
    res.json({ success: true, timeline });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/api/clientes/:id/consulta-completa', requirePermission('customers:read'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const tenantId = extractTenantId(req);
    const dados = consultaClienteService.consultarClienteCompleto({ tenantId, state, clienteId: req.params.id });
    res.json({ success: true, dados });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
