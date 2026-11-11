'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const express = require('express');

const fleetPredictiveMaintenanceService = require('../services/crm/fleetPredictiveMaintenanceService');
const whatsappAgentSkillsService = require('../services/whatsapp/whatsappAgentSkillsService');
const { initDB } = require('../db');
const { mutateTenantState } = require('../lib/serverContext');
const crmPreventivaRoutes = require('../routes/crm_preventiva_preditiva.routes');
require('../js/modules/crm_preventiva_preditiva_ui');
require('../js/modules/crm_preventiva_preditiva_actions');

function criarEstadoBase() {
  return {
    tenantId: 'tenant_sprint81',
    clientes: [
      { id: 'cli_transp_alfa', nome: 'Alfa Transportes Rodoviários' },
      { id: 'cli_mineracao_beta', nome: 'Beta Mineração & Britagem' }
    ],
    preventivePlans: [],
    fleetTelemetry: [],
    predictiveAlerts: [],
    os: [],
    receptionQueue: [],
    whatsappAgentLogs: []
  };
}

test('Sprint 8.1 — Motor de Manutenção Preventiva Preditiva de Frotas & Régua WhatsApp', async (t) => {
  await t.test('1.1: Configuração de Plano com Severidade e Proteção contra Rollback de Hodômetro', () => {
    const state = criarEstadoBase();

    // 1. Configurar plano rodoviário normal (fator 1.0)
    const res1 = fleetPredictiveMaintenanceService.configurarPlanoPreventivoVeiculo(state, {
      clienteId: 'cli_transp_alfa',
      clienteNome: 'Alfa Transportes Rodoviários',
      placa: 'ALF1A10',
      modeloVeiculo: 'Scania R450',
      sistemaTecnico: 'suspensao_traseira',
      descricaoServicoPadrao: 'Reaperto de grampos e troca de buchas',
      intervaloKmPadrao: 20000,
      intervaloDiasPadrao: 90,
      severidadeOperacao: 'rodoviaria',
      kmUltimaRevisao: 100000,
      dataUltimaRevisao: '2026-10-01',
      kmMedioDiario: 400,
      valorEstimadoRevisao: 1800.00
    });
    assert.equal(res1.ok, true);
    assert.equal(res1.plano.fatorSeveridade, 1.0);
    assert.equal(res1.plano.intervaloKmAjustado, 20000);
    assert.equal(res1.plano.intervaloDiasAjustado, 90);

    // 2. Configurar plano com severidade severa_fora_estrada (fator 0.70)
    const res2 = fleetPredictiveMaintenanceService.configurarPlanoPreventivoVeiculo(state, {
      clienteId: 'cli_mineracao_beta',
      clienteNome: 'Beta Mineração & Britagem',
      placa: 'BET2B20',
      modeloVeiculo: 'Volvo FMX 8x4',
      sistemaTecnico: 'feixe_de_molas',
      descricaoServicoPadrao: 'Troca de lâminas mestras reforçadas',
      intervaloKmPadrao: 10000,
      intervaloDiasPadrao: 60,
      severidadeOperacao: 'severa_fora_estrada',
      kmUltimaRevisao: 50000,
      dataUltimaRevisao: '2026-10-15',
      kmMedioDiario: 150,
      valorEstimadoRevisao: 3500.00
    });
    assert.equal(res2.ok, true);
    assert.equal(res2.plano.fatorSeveridade, 0.70);
    assert.equal(res2.plano.intervaloKmAjustado, 7000);
    assert.equal(res2.plano.intervaloDiasAjustado, 42);

    // 3. Atualizar telemetria normal de hodômetro
    const telem1 = fleetPredictiveMaintenanceService.atualizarTelemetriaKmFrota(state, {
      placa: 'ALF1A10',
      kmAtual: 105000,
      kmMedioDiarioEstimado: 420
    });
    assert.equal(telem1.ok, true);
    assert.equal(telem1.telemetria.kmAtual, 105000);

    // 4. Bloqueio de rollback indevido de hodômetro
    assert.throws(
      () => fleetPredictiveMaintenanceService.atualizarTelemetriaKmFrota(state, {
        placa: 'ALF1A10',
        kmAtual: 90000
      }),
      (err) => err.code === 'INVALID_ODOMETER_ROLLBACK'
    );

    // 5. Ajuste com forçar hodômetro
    const telemForcado = fleetPredictiveMaintenanceService.atualizarTelemetriaKmFrota(state, {
      placa: 'ALF1A10',
      kmAtual: 90000,
      forcarAjusteHodometro: true,
      motivoAjuste: 'Substituição de painel de instrumentos por defeito elétrico'
    });
    assert.equal(telemForcado.ok, true);
    assert.equal(telemForcado.telemetria.kmAtual, 90000);
  });

  await t.test('1.2: Apuração do Radar Semafórico e Projeção de Parada Preventiva', () => {
    const state = criarEstadoBase();

    // Veículo 1: VENCIDO por KM
    fleetPredictiveMaintenanceService.configurarPlanoPreventivoVeiculo(state, {
      clienteId: 'cli_transp_alfa',
      clienteNome: 'Alfa Transportes',
      placa: 'VENC100',
      sistemaTecnico: 'suspensao_traseira',
      intervaloKmPadrao: 20000,
      kmUltimaRevisao: 100000,
      dataUltimaRevisao: '2026-09-01',
      kmMedioDiario: 300,
      valorEstimadoRevisao: 2000.00
    });
    fleetPredictiveMaintenanceService.atualizarTelemetriaKmFrota(state, { placa: 'VENC100', kmAtual: 122000 });

    // Veículo 2: CRÍTICA PRÓXIMA (<= 1.500 km ou <= 7 dias)
    fleetPredictiveMaintenanceService.configurarPlanoPreventivoVeiculo(state, {
      clienteId: 'cli_transp_alfa',
      clienteNome: 'Alfa Transportes',
      placa: 'CRIT200',
      sistemaTecnico: 'freios_e_cuicas',
      intervaloKmPadrao: 15000,
      kmUltimaRevisao: 80000,
      dataUltimaRevisao: '2026-10-01',
      kmMedioDiario: 200,
      valorEstimadoRevisao: 1500.00
    });
    fleetPredictiveMaintenanceService.atualizarTelemetriaKmFrota(state, { placa: 'CRIT200', kmAtual: 94000 });

    // Veículo 3: EM DIA (> 5.000 km)
    fleetPredictiveMaintenanceService.configurarPlanoPreventivoVeiculo(state, {
      clienteId: 'cli_mineracao_beta',
      clienteNome: 'Beta Mineração',
      placa: 'DIA300',
      sistemaTecnico: 'revisao_geral_chassi',
      intervaloKmPadrao: 25000,
      kmUltimaRevisao: 200000,
      dataUltimaRevisao: '2026-11-01',
      kmMedioDiario: 100,
      valorEstimadoRevisao: 4000.00
    });
    fleetPredictiveMaintenanceService.atualizarTelemetriaKmFrota(state, { placa: 'DIA300', kmAtual: 205000 });

    const radar = fleetPredictiveMaintenanceService.apurarRadarPreventivaPreditiva(state, {
      dataReferencia: '2026-11-11'
    });

    assert.equal(radar.ok, true);
    assert.equal(radar.kpis.vencidasCount, 1);
    assert.equal(radar.kpis.criticasCount, 1);
    assert.equal(radar.kpis.emDiaCount, 1);
    assert.equal(radar.kpis.receitaPreventivaPotencialTotal, 7500.00);

    // Ordenação: primeiro vencidas, depois críticas
    assert.equal(radar.alertas[0].placa, 'VENC100');
    assert.equal(radar.alertas[0].statusPreventivo, 'vencida');
    assert.equal(radar.alertas[1].placa, 'CRIT200');
    assert.equal(radar.alertas[1].statusPreventivo, 'critica_proxima');
  });

  await t.test('1.3: Régua Automática no WhatsApp e Consulta de Preventiva pelo Motorista', () => {
    const state = criarEstadoBase();

    fleetPredictiveMaintenanceService.configurarPlanoPreventivoVeiculo(state, {
      clienteId: 'cli_transp_alfa',
      clienteNome: 'Alfa Transportes',
      placa: 'ALF1A10',
      sistemaTecnico: 'feixe_de_molas',
      intervaloKmPadrao: 20000,
      kmUltimaRevisao: 100000,
      dataUltimaRevisao: '2026-08-01',
      kmMedioDiario: 300,
      valorEstimadoRevisao: 2500.00
    });
    fleetPredictiveMaintenanceService.atualizarTelemetriaKmFrota(state, { placa: 'ALF1A10', kmAtual: 122000 });

    // Disparo da régua
    const disparoRes = fleetPredictiveMaintenanceService.dispararReguaPreventivaWhatsApp(state, {
      incluirStatus: ['vencida', 'critica_proxima']
    });
    assert.equal(disparoRes.ok, true);
    assert.equal(disparoRes.disparosRealizados, 1);
    assert.equal(state.whatsappAgentLogs.length, 1);
    assert.equal(state.predictiveAlerts[0].statusContato, 'notificado_whatsapp');

    // Motorista pergunta no WhatsApp sobre a próxima revisão preventiva
    const respWpp = whatsappAgentSkillsService.processarMensagemAgenteWhatsApp(state, {
      remetente: '5511999991111',
      perfilRemetente: 'motorista',
      mensagem: 'Olá, qual a proxima revisao preventiva da placa ALF1A10?',
      placa: 'ALF1A10'
    });
    assert.equal(respWpp.skill, 'SKILL_RECEPCAO_PATIO');
    assert.ok(respWpp.respostaTextoWhatsApp.includes('Radar de Manutenção Preventiva'));
    assert.ok(respWpp.respostaTextoWhatsApp.includes('VENCIDA'));
  });

  await t.test('1.4: Conversão Direta de Alerta Preventivo em Agendamento de OS e Fila de Pátio', () => {
    const state = criarEstadoBase();

    fleetPredictiveMaintenanceService.configurarPlanoPreventivoVeiculo(state, {
      clienteId: 'cli_mineracao_beta',
      clienteNome: 'Beta Mineração',
      placa: 'BET2B20',
      modeloVeiculo: 'Volvo FMX',
      sistemaTecnico: 'manga_de_eixo',
      intervaloKmPadrao: 10000,
      kmUltimaRevisao: 40000,
      dataUltimaRevisao: '2026-09-01',
      kmMedioDiario: 200,
      valorEstimadoRevisao: 3200.00
    });
    fleetPredictiveMaintenanceService.atualizarTelemetriaKmFrota(state, { placa: 'BET2B20', kmAtual: 51000 });
    fleetPredictiveMaintenanceService.apurarRadarPreventivaPreditiva(state);

    const alertaId = state.predictiveAlerts[0].id;

    // Conversão em OS
    const convRes = fleetPredictiveMaintenanceService.converterAlertaPreventivoEmAgendamentoOS(state, alertaId, {
      boxPreferencialId: 'box_pesado_2',
      criarPreCheckinRecepcao: true
    });

    assert.equal(convRes.ok, true);
    assert.ok(convRes.os.id);
    assert.equal(convRes.os.tipoOS, 'preventiva_programada');
    assert.equal(convRes.os.total, 3200.00);
    assert.equal(convRes.alerta.statusContato, 'convertido_os');

    // Registrado na recepção rápida de pátio
    assert.equal(state.receptionQueue.length, 1);
    assert.equal(state.receptionQueue[0].placa, 'BET2B20');

    // Tentativa de converter novamente deve falhar com ALERT_ALREADY_CONVERTED
    assert.throws(
      () => fleetPredictiveMaintenanceService.converterAlertaPreventivoEmAgendamentoOS(state, alertaId),
      (err) => err.code === 'ALERT_ALREADY_CONVERTED'
    );
  });

  await t.test('1.5: Endpoints REST e Componentes Visuais da Preventiva Preditiva', async () => {
    await initDB();
    const tenantId = 'tenant_sprint81_http';

    await mutateTenantState({ securityContext: { tenantId, actorId: 'usr_test', role: 'owner', permissions: ['*'] } }, (draft) => {
      draft.clientes = [{ id: 'cli_gama', nome: 'Gama Logística' }];
      draft.preventivePlans = [];
      draft.fleetTelemetry = [];
      draft.predictiveAlerts = [];
      draft.os = [];
      draft.receptionQueue = [];
      draft.whatsappAgentLogs = [];
    });

    const app = express();
    app.use(express.json());
    app.use((req, res, next) => {
      req.securityContext = { tenantId, actorId: 'usr_test', role: 'owner', permissions: ['*'] };
      next();
    });
    app.use(crmPreventivaRoutes);

    const server = app.listen(0);
    const port = server.address().port;
    const base = `http://127.0.0.1:${port}`;

    try {
      // 1. POST /planos
      const resPlano = await fetch(`${base}/api/crm/preventiva-preditiva/planos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          placa: 'GAM3G30',
          clienteId: 'cli_gama',
          clienteNome: 'Gama Logística',
          sistemaTecnico: 'suspensao_traseira',
          intervaloKmPadrao: 20000,
          kmUltimaRevisao: 80000,
          kmMedioDiario: 250,
          valorEstimadoRevisao: 2000.00
        })
      });
      const dataPlano = await resPlano.json();
      assert.equal(resPlano.status, 200);
      assert.equal(dataPlano.success, true);
      assert.equal(dataPlano.plano.placa, 'GAM3G30');

      // 2. POST /telemetria-km
      const resTelem = await fetch(`${base}/api/crm/preventiva-preditiva/telemetria-km`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ placa: 'GAM3G30', kmAtual: 102000 })
      });
      const dataTelem = await resTelem.json();
      assert.equal(resTelem.status, 200);
      assert.equal(dataTelem.success, true);
      assert.equal(dataTelem.telemetria.kmAtual, 102000);

      // 3. GET /radar
      const resRadar = await fetch(`${base}/api/crm/preventiva-preditiva/radar`);
      const dataRadar = await resRadar.json();
      assert.equal(resRadar.status, 200);
      assert.equal(dataRadar.success, true);
      assert.equal(dataRadar.alertas.length, 1);
      assert.equal(dataRadar.alertas[0].statusPreventivo, 'vencida');
      const alertaId = dataRadar.alertas[0].id;

      // 4. POST /disparar-whatsapp
      const resWpp = await fetch(`${base}/api/crm/preventiva-preditiva/disparar-whatsapp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      const dataWpp = await resWpp.json();
      assert.equal(resWpp.status, 200);
      assert.equal(dataWpp.totalNotificados, 1);

      // 5. POST /:alertaId/converter-os
      const resConv = await fetch(`${base}/api/crm/preventiva-preditiva/${alertaId}/converter-os`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ boxPreferencialId: 'box_1' })
      });
      const dataConv = await resConv.json();
      assert.equal(resConv.status, 200);
      assert.equal(dataConv.success, true);
      assert.ok(dataConv.os.id);

      // 6. Testes visuais (UI components)
      const htmlPainel = globalThis.renderPainelPreventivaPreditivaHtml(dataRadar);
      assert.ok(htmlPainel.includes('Radar de Manutenção Preventiva Preditiva'));
      assert.ok(htmlPainel.includes('GAM3G30'));

      const htmlPlano = globalThis.modalConfigurarPlanoPreventivoHtml();
      assert.ok(htmlPlano.includes('Configurar Plano Preventivo por Veículo'));

      const htmlTelem = globalThis.modalAtualizarKmTelemetriaHtml();
      assert.ok(htmlTelem.includes('Atualizar Telemetria / Hodômetro'));

      assert.equal(typeof globalThis.abrirModalPlanoPreventivo, 'function');
      assert.equal(typeof globalThis.salvarPlanoPreventivoAction, 'function');
    } finally {
      server.close();
    }
  });
});
