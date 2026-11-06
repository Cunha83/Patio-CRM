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

router.get('/api/clientes', requirePermission('crm:read', 'os:read'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const clientes = state.clientes || [];
    res.json({ success: true, total: clientes.length, clientes });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/api/clientes/:id', requirePermission('crm:read', 'os:read'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const cliente = (state.clientes || []).find(c => c.id === req.params.id);
    if (!cliente) return res.status(404).json({ success: false, error: 'Cliente não encontrado.' });
    res.json({ success: true, cliente });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/api/clientes/:id/timeline', requirePermission('crm:read'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const tenantId = extractTenantId(req);
    const resultado = customerTimelineService.obterTimelineCliente({
      tenantId,
      customerId: req.params.id,
      state
    });
    if (!resultado.ok) {
      return res.status(404).json({ success: false, error: resultado.error });
    }
    res.json({ success: true, ...resultado });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post(['/api/integracoes/consulta-cliente', '/api/clientes/consultar'], requirePermission('crm:read', 'crm:write', 'os:read', 'os:write'), async (req, res) => {
  try {
    const { doc, incluirSerasa = false } = req.body || {};
    const tenantId = extractTenantId(req);
    const state = await getOrLoadState(req);
    const testAdapterHeader = req.headers['x-test-consulta-adapter'];

    const resultado = await consultaClienteService.consultarCliente({
      doc,
      incluirSerasa,
      state,
      tenantId,
      testAdapterHeader
    });

    return res.status(resultado.status || (resultado.success ? 200 : 400)).json(resultado);
  } catch (err) {
    console.error('[API /api/integracoes/consulta-cliente] Erro:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── 2. FROTAS ───────────────────────────────────────────────────
router.get('/api/frotas', requirePermission('crm:read'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const tenantId = extractTenantId(req);
    const frotas = (state.fleets || state.frotas || []).filter(f => !f.tenantId || f.tenantId === tenantId);
    res.json({ success: true, total: frotas.length, frotas });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/api/frotas', requirePermission('crm:write'), async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    const { customerId, nome, vehicles = [], responsavelId, ativo = true } = req.body || {};

    if (!nome || String(nome).trim().length < 2) {
      return res.status(400).json({ success: false, error: 'Nome da frota é obrigatório.' });
    }

    const id = gerarId('flt');
    const agora = new Date().toISOString();

    const novaFrota = {
      id,
      tenantId,
      customerId: customerId || null,
      nome: String(nome).trim(),
      vehicles: Array.isArray(vehicles) ? vehicles : [],
      responsavelId: responsavelId || null,
      ativo: Boolean(ativo),
      createdAt: agora,
      updatedAt: agora
    };

    const saveRes = await mutateTenantState(req, (draft) => {
      if (!draft.fleets) draft.fleets = [];
      draft.fleets.push(novaFrota);
    });

    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({
        success: false,
        error: saveRes?.error || 'Falha ao persistir frota.'
      });
    }

    res.json({ success: true, frota: novaFrota });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/api/frotas/:id', requirePermission('crm:read'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const tenantId = extractTenantId(req);
    const frotas = state.fleets || state.frotas || [];
    const frota = frotas.find(f => f.id === req.params.id && (!f.tenantId || f.tenantId === tenantId));
    if (!frota) return res.status(404).json({ success: false, error: 'Frota não encontrada.' });
    res.json({ success: true, frota });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/api/frotas/:id/veiculos', requirePermission('crm:read'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const tenantId = extractTenantId(req);
    const frotas = state.fleets || state.frotas || [];
    const frota = frotas.find(f => f.id === req.params.id && (!f.tenantId || f.tenantId === tenantId));
    if (!frota) return res.status(404).json({ success: false, error: 'Frota não encontrada.' });

    const veiculos = state.veiculos || [];
    const veiculosIds = new Set(frota.vehicles || []);
    const veiculosDaFrota = veiculos.filter(v => veiculosIds.has(v.id) || v.fleetId === frota.id);

    const prev = maintenancePlanService.avaliarVencimentos({ tenantId, state, fleetId: frota.id });
    const ordens = (state.os || []).filter(o => o.st !== 'finalizada');

    const lista = veiculosDaFrota.map(v => {
      const osAtiva = ordens.find(o => o.vei === v.id);
      const prevVeic = (prev.itens || []).filter(it => it.vehicleId === v.id);
      return {
        id: v.id,
        placa: v.placa,
        modelo: v.modelo,
        marca: v.marca,
        ano: v.ano,
        km: v.km || 0,
        naOficina: Boolean(osAtiva),
        osNumero: osAtiva ? osAtiva.num : null,
        osStatus: osAtiva ? osAtiva.st : null,
        manutencoes: prevVeic
      };
    });

    res.json({ success: true, frotaNome: frota.nome, total: lista.length, veiculos: lista });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── 3. PLANOS DE MANUTENÇÃO PREVENTIVA ──────────────────────────

module.exports = router;
