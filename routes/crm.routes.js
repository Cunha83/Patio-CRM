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
