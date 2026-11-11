'use strict';

/**
 * tests/sprint93_smart_gatehouse_triage_checkin.test.cjs
 * 
 * Suíte de Testes da Sprint 9.3:
 * 1. Triagem 360º de Portaria por Placa (Garantias, Preventivas, Demanda Reprimida, Crédito do Cliente e Box).
 * 2. Validação da Trava de Crédito do Cliente vs. Exceção de Garantia Isenta e Override Gerencial.
 * 3. Fast Check-in 360º com Alocação Automática de Box e Trava de Saída Segura (Checklist de Qualidade).
 * 4. Endpoints REST e Componentes Visuais de UI.
 * 
 * Teto Modular: <= 350 linhas
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');

const gatehouseService = require('../services/patio/smartGatehouseCheckinService');
const qualityService = require('../services/patio/qualityWarrantyReworkService');
const gatehouseRouter = require('../routes/patio_portaria_inteligente.routes');
const { initDB } = require('../db');
const { mutateTenantState } = require('../lib/serverContext');

// Carrega UI e Actions no escopo global
require('../js/modules/patio_portaria_inteligente_ui');
require('../js/modules/patio_portaria_inteligente_actions');

function criarEstadoMock() {
  return {
    tenantId: 'tenant_portaria',
    gatehouseLogs: [],
    creditOverrideLogs: [],
    patioBoxes: [
      { id: 'box_01', codigo: 'B01', nome: 'Box 01 - Pesado', status: 'livre', tipoBox: 'pesado_mola', tenantId: 'tenant_portaria' }
    ],
    boxAllocations: [],
    os: [],
    preventivePlans: [
      {
        id: 'pln_prev_1', tenantId: 'tenant_portaria', placa: 'BRA2E19', clienteId: 'cli_transp_sul',
        clienteNome: 'Transportadora Sulamericana Ltda', sistemaTecnico: 'alinhamento_laser',
        descricaoServicoPadrao: 'Alinhamento a Laser e Geometria', intervaloKmPadrao: 10000,
        intervaloDiasPadrao: 60, intervaloKmAjustado: 10000, intervaloDiasAjustado: 60,
        kmUltimaRevisao: 80000, dataUltimaRevisao: '2026-08-01', kmAtualConhecido: 95000, ativo: true
      }
    ],
    predictiveAlerts: [
      {
        id: 'alt_prev_1', planoId: 'pln_prev_1', tenantId: 'tenant_portaria', placa: 'BRA2E19',
        clienteId: 'cli_transp_sul', sistemaTecnico: 'alinhamento_laser', descricaoServico: 'Alinhamento a Laser',
        statusPreventivo: 'vencida', valorEstimadoRevisao: 450.00, statusContato: 'pendente_contato'
      }
    ],
    axleInterventions: [
      {
        id: 'axle_int_1', placa: 'BRA2E19', clienteId: 'cli_transp_sul', eixoPosicao: 'eixo_2_tracao',
        lado: 'ambos_central', componenteSistema: 'feixe_de_molas', descricaoItem: 'Troca Feixe Traseiro',
        kmNaAplicacao: 90000, kmFimGarantia: 110000, garantiaKm: 20000, garantiaDias: 90,
        dataAplicacao: '2026-10-15'
      }
    ],
    opportunities: [
      {
        id: 'opp_reprimida_1', placa: 'BRA2E19', clienteId: 'cli_transp_sul',
        titulo: 'Revisão de Buchas Adiada', status: 'em_aberto', valorTotalEstimado: 800.00,
        servicos: [{ id: 'srv_bucha_1', desc: 'Troca de Buchas de Bronze', preco: 300.00, total: 300.00 }],
        pecas: [{ id: 'pec_bucha_1', desc: 'Jogo Buchas Bronze', qtd: 2, preco: 250.00, total: 500.00 }]
      }
    ],
    creditPolicies: {
      cli_transp_sul: { clienteId: 'cli_transp_sul', limiteCredito: 50000, diasToleranciaAtraso: 5, bloqueioAutomatico: true }
    },
    borderos: [],
    contas: [],
    fleetTelemetry: []
  };
}

test('Sprint 9.3 — Portaria Inteligente, Triagem 360º & Fast Check-in de Linha Pesada', async (t) => {

  await t.test('1. Triagem 360º na Chegada por Placa (Garantias, Preventivas, Oportunidades, Crédito e Box)', () => {
    const state = criarEstadoMock();

    const triagem = gatehouseService.realizarTriagemPortariaPorPlaca(state, {
      placa: 'BRA2E19',
      kmEntrada: 92000,
      tipoServicoDesejado: 'pesado_mola',
      dataReferencia: '2026-11-11T10:00:00Z'
    });

    assert.ok(triagem);
    assert.strictEqual(triagem.placa, 'BRA2E19');
    assert.strictEqual(triagem.clienteId, 'cli_transp_sul');
    assert.strictEqual(triagem.garantiasAtivas.length, 1, 'Deve identificar 1 garantia ativa no 2º eixo tração');
    assert.strictEqual(triagem.garantiasAtivas[0].componenteSistema, 'feixe_de_molas');
    assert.strictEqual(triagem.alertasPreventivosPlaca.length, 1, 'Deve identificar preventiva vencida de alinhamento');
    assert.strictEqual(triagem.oportunidadesDemandaReprimida.length, 1, 'Deve identificar 1 oportunidade de demanda reprimida');
    assert.strictEqual(triagem.receitaRecuperavelDemandaReprimida, 800.00);
    assert.strictEqual(triagem.situacaoCreditoCliente.statusCredito, 'regular');
    assert.strictEqual(triagem.situacaoCreditoCliente.bloqueadoPorInadimplencia, false);
    assert.ok(triagem.boxLivreRecomendado);
    assert.strictEqual(triagem.boxLivreRecomendado.codigo, 'B01');
  });

  await t.test('2. Bloqueio de Crédito do Cliente no Check-in vs. Exceção de Garantia Isenta e Override', () => {
    const state = criarEstadoMock();

    // Cliente com título a receber vencido
    state.contas.push({
      id: 'rec_vencido_1',
      clienteId: 'cli_transp_sul',
      tipo: 'receber',
      status: 'aberto',
      valor: 12500.00,
      vencimento: '2026-11-01'
    });

    // 1. Check-in normal deve ser BLOQUEADO pelo crédito do cliente
    assert.throws(() => {
      gatehouseService.registrarFastCheckinPortaria360(state, {
        placa: 'BRA2E19',
        kmEntrada: 92000,
        timestamp: '2026-11-11T10:00:00Z'
      });
    }, (err) => {
      assert.strictEqual(err.code, 'CLIENT_CREDIT_BLOCKED_AT_GATEHOUSE');
      return true;
    });

    // 2. Override sem justificativa é recusado
    assert.throws(() => {
      gatehouseService.registrarFastCheckinPortaria360(state, {
        placa: 'BRA2E19',
        kmEntrada: 92000,
        autorizarOverrideCreditoCliente: true,
        justificativaOverrideCredito: '',
        timestamp: '2026-11-11T10:00:00Z'
      });
    }, (err) => {
      assert.strictEqual(err.code, 'OVERRIDE_JUSTIFICATION_REQUIRED');
      return true;
    });

    // 3. Atendimento de Garantia Isento é PERMITIDO mesmo com crédito bloqueado
    const checkinGarantia = gatehouseService.registrarFastCheckinPortaria360(state, {
      placa: 'BRA2E19',
      kmEntrada: 92000,
      atendimentoGarantiaIsento: true,
      timestamp: '2026-11-11T10:00:00Z'
    });

    assert.ok(checkinGarantia.checkInLog);
    assert.strictEqual(checkinGarantia.osGerada.total, 0);
    assert.strictEqual(checkinGarantia.checkInLog.statusPortaria, 'no_patio');
  });

  await t.test('3. Fast Check-in Incorporando Demanda Reprimida, Alocação de Box & Trava de Saída Segura', () => {
    const state = criarEstadoMock();

    const checkin = gatehouseService.registrarFastCheckinPortaria360(state, {
      placa: 'BRA2E19',
      kmEntrada: 92000,
      abrirOSAutomatica: true,
      alocarBoxAutomaticamente: true,
      incluirOportunidadesIds: ['opp_reprimida_1'],
      incluirAlertasPreventivosIds: ['alt_prev_1'],
      timestamp: '2026-11-11T10:00:00Z'
    });

    assert.ok(checkin.osGerada);
    assert.strictEqual(checkin.osGerada.placa, 'BRA2E19');
    assert.strictEqual(checkin.osGerada.boxAtualId, 'box_01');
    assert.ok(checkin.osGerada.total >= 800.00);

    const box = state.patioBoxes.find(b => b.id === 'box_01');
    assert.strictEqual(box.status, 'ocupado');

    const opp = state.opportunities.find(o => o.id === 'opp_reprimida_1');
    assert.strictEqual(opp.status, 'convertida');

    // Tenta sair sem inspeção de qualidade aprovada -> BLOQUEADO na cancela
    assert.throws(() => {
      gatehouseService.registrarSaidaPortariaVeiculo(state, checkin.checkInLog.id, {
        kmSaida: 92005,
        exigirInspecaoQualidade: true,
        timestamp: '2026-11-11T16:00:00Z'
      });
    }, (err) => {
      assert.strictEqual(err.code, 'QUALITY_INSPECTION_REQUIRED_OR_FAILED');
      return true;
    });

    // Realiza a inspeção de qualidade com aprovação
    qualityService.registrarInspecaoQualidadeOS(state, checkin.osGerada.id, {
      torqueGramposOk: true,
      pinoCentroOk: true,
      embuchamentoOk: true,
      testeRodagemOk: true,
      aprovado: true,
      inspetor: 'Mestre Oficina'
    });

    // Saída com sucesso na cancela
    const saida = gatehouseService.registrarSaidaPortariaVeiculo(state, checkin.checkInLog.id, {
      kmSaida: 92005,
      exigirInspecaoQualidade: true,
      timestamp: '2026-11-11T16:00:00Z'
    });

    assert.strictEqual(saida.ok, true);
    assert.strictEqual(saida.log.statusPortaria, 'liberado_saida');
    assert.strictEqual(box.status, 'livre', 'Box deve ser desocupado na liberação de saída');
  });

  await t.test('4. Endpoints REST e Componentes Visuais do Painel de Portaria', async () => {
    await initDB();
    const tenantId = 'tenant_e2e_gatehouse';

    await mutateTenantState({ securityContext: { tenantId, actorId: 'portaria_1', role: 'owner', permissions: ['*'] } }, (draft) => {
      draft.tenantId = tenantId;
      draft.gatehouseLogs = [];
      draft.patioBoxes = [{ id: 'box_e2e_gate', codigo: 'B-G1', nome: 'Box Portaria', status: 'livre', tenantId }];
      draft.os = [];
      draft.preventivePlans = [];
      draft.axleInterventions = [];
      draft.opportunities = [];
      draft.contas = [];
      draft.borderos = [];
      draft.creditPolicies = {};
      draft.fleetTelemetry = [];
    });

    const app = express();
    app.use(express.json());
    app.use((req, res, next) => {
      req.headers['x-tenant-id'] = tenantId;
      req.securityContext = { tenantId, actorId: 'portaria_1', role: 'owner', permissions: ['*'] };
      req.user = { id: 'portaria_1', nome: 'Operador Portaria' };
      next();
    });
    app.use(gatehouseRouter);

    const server = app.listen(0);
    const port = server.address().port;
    const base = `http://127.0.0.1:${port}`;

    try {
      // 1. POST triagem
      const resTriagem = await fetch(`${base}/api/patio/portaria/triagem-placa`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ placa: 'XYZ9876', kmEntrada: 50000 })
      });
      const dataTriagem = await resTriagem.json();
      assert.strictEqual(resTriagem.status, 200);
      assert.strictEqual(dataTriagem.success, true);
      assert.strictEqual(dataTriagem.triagem.placa, 'XYZ9876');

      // 2. POST fast-checkin
      const resCheckin = await fetch(`${base}/api/patio/portaria/fast-checkin`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          placa: 'XYZ9876', kmEntrada: 50000, clienteNome: 'Cliente E2E Portaria',
          abrirOSAutomatica: true, alocarBoxAutomaticamente: true
        })
      });
      const dataCheckin = await resCheckin.json();
      assert.strictEqual(resCheckin.status, 200);
      assert.strictEqual(dataCheckin.success, true);
      assert.ok(dataCheckin.checkInLog.id);

      // 3. GET movimentações
      const resMov = await fetch(`${base}/api/patio/portaria/movimentacoes`);
      const dataMov = await resMov.json();
      assert.strictEqual(resMov.status, 200);
      assert.strictEqual(dataMov.success, true);
      assert.strictEqual(dataMov.veiculosNoPatioCount, 1);

      // 4. POST saída
      const resSaida = await fetch(`${base}/api/patio/portaria/${dataCheckin.checkInLog.id}/saida`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kmSaida: 50010, exigirInspecaoQualidade: false })
      });
      const dataSaida = await resSaida.json();
      assert.strictEqual(resSaida.status, 200);
      assert.strictEqual(dataSaida.success, true);

      // 5. Componentes Visuais
      const htmlPainel = globalThis.renderPainelPortariaInteligenteHtml({ logs: dataMov.movimentacoes, kpis: dataMov });
      assert.ok(htmlPainel.includes('Portaria Inteligente'));

      const htmlCheckinModal = globalThis.modalFastCheckinPortaria360Html(dataTriagem.triagem);
      assert.ok(htmlCheckinModal.includes('Fast Check-in 360º'));

      const htmlSaidaModal = globalThis.modalRegistrarSaidaPortariaHtml(dataCheckin.checkInLog);
      assert.ok(htmlSaidaModal.includes('Saída de Veículo'));
    } finally {
      server.close();
    }
  });
});
