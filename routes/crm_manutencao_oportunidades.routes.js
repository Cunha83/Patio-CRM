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
    const secCtx = req.securityContext;
    const actorId = secCtx?.actorId || 'operador';

    let resultado;
    const saveRes = await mutateTenantState(req, (draft) => {
      resultado = maintenancePlanService.criarPlano({
        tenantId,
        state: draft,
        actorId,
        ...req.body
      });
    });

    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({ success: false, error: saveRes?.error || 'Falha ao persistir plano de manutenção.' });
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
    const resultado = maintenancePlanService.avaliarVencimentos({
      tenantId,
      state,
      vehicleId,
      fleetId,
      dataReferencia: data
    });
    res.json({ success: true, ...resultado });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/api/manutencao/atualizar-km', requirePermission('maintenance:write'), async (req, res) => {
  try {
    const tenantId = extractTenantId(req);
    const secCtx = req.securityContext;
    const actorId = secCtx?.actorId || 'operador';
    const { vehicleId, placa, km, fonte, permitirOverride } = req.body || {};

    let resultado;
    const saveRes = await mutateTenantState(req, (draft) => {
      resultado = maintenancePlanService.atualizarKmVeiculo({
        tenantId,
        state: draft,
        vehicleId,
        placa,
        kmInformado: km,
        fonte: fonte || 'web',
        ator: actorId,
        permitirOverride: Boolean(permitirOverride)
      });
      if (!resultado.ok) {
        return { abort: true, error: resultado.erro || 'Atualização de KM inválida' };
      }
    });

    if (!resultado?.ok) {
      return res.status(resultado?.incoerente ? 409 : 400).json({ success: false, ...resultado });
    }

    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({ success: false, error: saveRes?.error || 'Falha ao persistir KM.' });
    }

    res.json({ success: true, ...resultado });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── 4. CRM & OPORTUNIDADES ──────────────────────────────────────
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
      if (!opo) {
        naoEncontrado = true;
        return { abort: true, error: 'Oportunidade não encontrada.' };
      }

      const cliente = (draft.clientes || []).find(c => c.id === opo.customerId);
      const val = relationshipService.validarEnvioNotificacao({ cliente, tipoMensagem: 'comercial', canal });
      if (!val.permitido) {
        motivo403 = val.motivo;
        return { abort: true, error: val.motivo };
      }

      opo.status = 'contatado';
      opo.contatadoEm = new Date().toISOString();
      opo.ultimoCanal = canal;
      if (cliente) cliente.ultimoContatoRelacionamento = new Date().toISOString();
      opoRetornado = opo;
    });

    if (naoEncontrado) return res.status(404).json({ success: false, error: 'Oportunidade não encontrada.' });
    if (motivo403) return res.status(403).json({ success: false, error: motivo403 });
    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({ success: false, error: saveRes?.error || 'Falha ao persistir oportunidade.' });
    }

    res.json({ success: true, oportunidade: opoRetornado, mensagemEnviada: mensagem });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/api/crm/metricas', requirePermission('crm:read'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const tenantId = extractTenantId(req);
    const metricas = relationshipService.obterMetricasCRM({ tenantId, state });
    res.json({ success: true, metricas });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/api/crm/frotistas', requirePermission('crm:read'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const tenantId = extractTenantId(req);
    const secCtx = req.securityContext;
    const temPermissaoFinanceira = (secCtx?.permissions || []).includes('financial:read') || (secCtx?.permissions || []).includes('*');

    const clientes = state.clientes || [];
    const veiculos = state.veiculos || [];
    const ordens = state.os || [];
    const frotas = state.fleets || state.frotas || [];
    const quotations = state.quotations || [];

    const frotistas = clientes.filter(c => c.tipo === 'frotista' || frotas.some(f => f.customerId === c.id));
    const prev = maintenancePlanService.avaliarVencimentos({ tenantId, state });

    const painel = frotistas.map(f => {
      const veics = veiculos.filter(v => v.cli === f.id);
      const veicsIds = new Set(veics.map(v => v.id));
      const osAtivas = ordens.filter(o => o.st !== 'finalizada' && (o.cli === f.id || veicsIds.has(o.vei)));
      const osFinalizadas = ordens.filter(o => o.st === 'finalizada' && (o.cli === f.id || veicsIds.has(o.vei)));
      const orcamentosPendentes = quotations.filter(q => q.customerId === f.id && q.status === 'enviado');

      const itensPrev = (prev.itens || []).filter(i => veicsIds.has(i.vehicleId));
      const prox = itensPrev.filter(i => i.status === 'proximo').length;
      const venc = itensPrev.filter(i => i.status === 'vencido').length;

      const valorMovimentado = osFinalizadas.reduce((acc, o) => acc + (Number(o.total) || 0), 0);

      return {
        id: f.id,
        nome: f.nome,
        nomeFantasia: f.nomeFantasia || f.fantasia,
        doc: f.doc || f.documento,
        contatoPrincipal: (f.contatos && f.contatos.find(c => c.principal)) || f.contato,
        veiculosTotal: veics.length,
        veiculosNaOficina: osAtivas.length,
        manutencoesProximas: prox,
        manutencoesVencidas: venc,
        orçamentosPendentes: orcamentosPendentes.length,
        valorMovimentado: temPermissaoFinanceira ? valorMovimentado : null,
        ultimoContato: f.ultimoContatoRelacionamento || null
      };
    });

    res.json({ success: true, total: painel.length, frotistas: painel });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── 5. AGENDAMENTOS ─────────────────────────────────────────────

module.exports = router;
