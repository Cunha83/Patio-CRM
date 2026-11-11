'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');

const controlTowerService = require('../services/executive/controlTowerService');
const whatsappAgentSkillsService = require('../services/whatsapp/whatsappAgentSkillsService');
const { initDB } = require('../db');
const { mutateTenantState } = require('../lib/serverContext');
const torreControleRoutes = require('../routes/torre_controle_executiva.routes');
require('../js/modules/torre_controle_executiva_ui');
require('../js/modules/torre_controle_executiva_actions');

function criarEstadoBase() {
  return {
    tenantId: 'tenant_sprint91',
    patioBoxes: [
      { id: 'box_1', codigo: 'BOX-01', nome: 'Box 01 Alinhamento', status: 'ocupado', osAtualId: 'os_101' },
      { id: 'box_2', codigo: 'BOX-02', nome: 'Box 02 Molas Pesadas', status: 'ocupado', osAtualId: 'os_102' },
      { id: 'box_3', codigo: 'BOX-03', nome: 'Box 03 Balança e Freio', status: 'bloqueado_gargalo', osAtualId: 'os_103' },
      { id: 'box_4', codigo: 'BOX-04', nome: 'Box 04 Rápido', status: 'livre', osAtualId: null },
      { id: 'box_5', codigo: 'BOX-05', nome: 'Box 05 Carreta', status: 'livre', osAtualId: null }
    ],
    patioBottlenecks: [
      {
        id: 'gar_1',
        osId: 'os_103',
        boxId: 'box_3',
        status: 'aberto',
        motivoParada: 'aguardando_peca',
        slaMaximoMinutos: 60,
        inicioParadaEm: '2026-11-11T08:00:00.000Z' // mais de 2 horas atrás
      }
    ],
    os: [
      { id: 'os_101', num: 101, placa: 'VOL1A11', total: 5000, st: 'em_andamento', fechamento: '2026-11-05' },
      { id: 'os_102', num: 102, placa: 'SCA2B22', total: 7000, st: 'em_andamento', fechamento: '2026-11-08' },
      { id: 'os_103', num: 103, placa: 'MB3C33', total: 4000, st: 'em_andamento', fechamento: '2026-11-10' },
      { id: 'os_104', num: 104, placa: 'DAF4D44', total: 10000, st: 'finalizada', fechamento: '2026-11-02', dataFinalizacao: '2026-11-02' }
    ],
    reworkRecords: [
      { id: 'rew_1', osOrigemId: 'os_104', status: 'aberto', motivoRetrabalho: 'trinca_reincidente', competencia: '2026-11' }
    ],
    externalApprovalTokens: [
      { id: 'tok_1', osId: 'os_101', status: 'pendente', linkUrl: 'https://exemplo.com/aprovacao/tok_1' }
    ],
    opportunities: [
      { id: 'opp_1', tipo: 'demanda_reprimida_orcamento', status: 'pendente', dataFollowUp: '2026-11-01', valorTotalEstimado: 3500 }
    ],
    preventivePlans: [
      {
        id: 'plan_1',
        placa: 'VOL1A11',
        sistemaTecnico: 'geral_suspensao',
        intervaloKmAjustado: 20000,
        intervaloDiasAjustado: 90,
        kmUltimaRevisao: 100000,
        dataUltimaRevisao: '2026-05-01',
        kmMedioDiario: 300,
        ativo: true
      }
    ],
    predictiveAlerts: [],
    fiscalClosings: [
      {
        id: 'fisc_1',
        status: 'notas_emitidas',
        baseCalculoPecasTotal: 6000,
        baseCalculoServicosTotal: 4000,
        valorLiquidoAReceber: 9500,
        dataEmissaoEspelho: '2026-11-05'
      }
    ],
    borderos: [
      {
        id: 'bor_1',
        num: 1,
        clienteId: 'cli_inadimplente',
        dataVencimento: '2026-10-01',
        valorTotal: 8000,
        saldoDevedor: 8000,
        status: 'emitido'
      }
    ],
    clientes: [
      {
        id: 'cli_inadimplente',
        nome: 'Transportadora Vencida Ltda',
        politicaCredito: { limiteCredito: 10000, diasToleranciaAtraso: 5, bloqueioAutomatico: true }
      }
    ],
    contas: [
      { tipo: 'pagar', cat: 'aluguel', valor: 3000, status: 'pago', valorPago: 3000, dataPagamento: '2026-11-05', competencia: '2026-11' }
    ],
    whatsappAgentLogs: [],
    executiveBriefingLogs: []
  };
}

test('Sprint 9.1 — Torre de Controle Executiva 360º, Fila de Alertas e Briefing Diário WhatsApp', async (t) => {
  await t.test('1.1: Consolidação 360º dos 4 Pilares Operacionais', () => {
    const state = criarEstadoBase();

    const consolidado = controlTowerService.consolidarTorreControleExecutiva360(state, {
      competencia: '2026-11',
      dataReferencia: '2026-11-11T12:00:00.000Z'
    });

    assert.equal(consolidado.ok, true);
    assert.equal(consolidado.competencia, '2026-11');

    // 1. Pilar Pátio & Qualidade
    const patio = consolidado.pilarPatioQualidade;
    assert.equal(patio.totalBoxes, 5);
    assert.equal(patio.boxesOcupadosProdutivos, 2);
    assert.equal(patio.boxesBloqueadosGargalo, 1);
    assert.equal(patio.gargalosEstouradosCount, 1); // gar_1 tem mais de 4h para SLA de 60min
    assert.equal(patio.totalRetrabalhosCompetencia, 1);

    // 2. Pilar Comercial B2B
    const comercial = consolidado.pilarComercialB2B;
    assert.equal(comercial.linksAprovacaoPendentesCount, 1);
    assert.equal(comercial.demandasReprimidasVencidasCount, 1);
    assert.equal(comercial.valorTotalDemandaReprimida, 3500);

    // 3. Pilar Financeiro & DRE
    const financeiro = consolidado.pilarFinanceiroDre;
    assert.ok(financeiro.receitaCompetencia > 0);
    assert.equal(financeiro.frotasInadimplentesCount, 1);
    assert.equal(financeiro.valorTotalVencidoB2B, 8000);

    // 4. Pilar Preditiva & Fiscal
    const preditiva = consolidado.pilarPreditivaFiscal;
    assert.ok(preditiva.preventivasVencidasCount >= 1);
    assert.equal(preditiva.totalNFePecasMes, 6000);
    assert.equal(preditiva.totalNFSeServicosMes, 4000);
    assert.equal(preditiva.totalLiquidoFaturadoFiscal, 9500);
  });

  await t.test('1.2: Score de Saúde Operacional (0-100) e Fila Priorizada de Alertas Críticos de Comando', () => {
    // Cenário Crítico: múltiplos alertas de parada, inadimplência e retrabalho
    const stateCritico = criarEstadoBase();
    const alertas = controlTowerService.gerarFilaAlertasCriticosComando(stateCritico, {
      competencia: '2026-11',
      dataReferencia: '2026-11-11T12:00:00.000Z'
    });

    assert.ok(alertas.length >= 4);
    assert.equal(alertas[0].severidade, 'critica');
    const codigos = alertas.map(a => a.codigoTipo);
    assert.ok(codigos.includes('SLA_BOX_ESTOURADO'));
    assert.ok(codigos.includes('INADIMPLENCIA_FROTISTA_BLOQUEIO'));
    assert.ok(codigos.includes('RETRABALHO_GARANTIA_ATIVO'));

    const consolidadoCritico = controlTowerService.consolidarTorreControleExecutiva360(stateCritico, {
      competencia: '2026-11',
      dataReferencia: '2026-11-11T12:00:00.000Z'
    });
    assert.ok(consolidadoCritico.scoreSaudeOperacional < 70);
    assert.ok(['atencao_gerencial', 'intervencao_critica'].includes(consolidadoCritico.statusSaudeGeral));

    // Cenário Saudável: sem gargalos, sem inadimplência, sem retrabalhos
    const stateSaudavel = {
      tenantId: 'tenant_saudavel',
      patioBoxes: [{ id: 'b1', codigo: 'B-01', status: 'ocupado' }, { id: 'b2', codigo: 'B-02', status: 'livre' }],
      patioBottlenecks: [],
      os: [{ id: 'os_ok', total: 20000, st: 'finalizada', fechamento: '2026-11-05' }],
      contas: [{ tipo: 'pagar', valor: 2000, status: 'pago', dataPagamento: '2026-11-05', competencia: '2026-11' }],
      reworkRecords: [],
      externalApprovalTokens: [],
      opportunities: [],
      preventivePlans: [],
      borderos: [],
      fiscalClosings: []
    };

    const consolidadoSaudavel = controlTowerService.consolidarTorreControleExecutiva360(stateSaudavel, {
      competencia: '2026-11',
      dataReferencia: '2026-11-11T12:00:00.000Z'
    });
    assert.ok(consolidadoSaudavel.scoreSaudeOperacional >= 85);
    assert.equal(consolidadoSaudavel.statusSaudeGeral, 'excelencia_operacional');
  });

  await t.test('1.3: Disparo de Briefing Diário da Diretoria e Integração com Agente WhatsApp', () => {
    const state = criarEstadoBase();

    const briefingRes = controlTowerService.dispararBriefingDiarioDiretoriaWhatsApp(state, {
      turno: 'matinal',
      competencia: '2026-11',
      dataReferencia: '2026-11-11T08:00:00.000Z'
    });

    assert.equal(briefingRes.ok, true);
    const briefing = briefingRes.briefing;
    assert.ok(briefing.respostaTextoWhatsApp.includes('Torre de Controle Executiva'));
    assert.ok(briefing.respostaTextoWhatsApp.includes('Score de Saúde Operacional'));
    assert.ok(briefing.respostaTextoWhatsApp.includes('Pátio & Boxes'));
    assert.ok(briefing.respostaTextoWhatsApp.includes('Alertas Críticos de Comando'));
    assert.equal(state.executiveBriefingLogs.length, 1);
    assert.equal(state.whatsappAgentLogs.length, 1);

    // Consulta de Torre de Controle / Briefing no WhatsApp pela gerência
    const respWpp = whatsappAgentSkillsService.processarMensagemAgenteWhatsApp(state, {
      remetente: '5511999991111',
      perfilRemetente: 'gerente',
      mensagem: 'Verônica, envie o briefing diario da torre de controle de hoje'
    });

    assert.equal(respWpp.skill, 'SKILL_ANALISTA_FINANCEIRO');
    assert.ok(respWpp.respostaTextoWhatsApp.includes('Torre de Controle Executiva'));
    assert.ok(respWpp.respostaTextoWhatsApp.includes('Score de Saúde Operacional'));
  });

  await t.test('1.4: Endpoints REST e Componentes Visuais de UI', async () => {
    await initDB();
    const tenantId = 'tenant_sprint91_http';

    await mutateTenantState({ securityContext: { tenantId, actorId: 'admin_test', role: 'owner', permissions: ['*'] } }, (draft) => {
      draft.patioBoxes = [{ id: 'b_http', codigo: 'B-H1', status: 'livre' }];
      draft.patioBottlenecks = [];
      draft.os = [{ id: 'os_h1', num: 901, total: 10000, st: 'finalizada', fechamento: '2026-11-05' }];
      draft.contas = [{ tipo: 'pagar', valor: 2000, status: 'pago', dataPagamento: '2026-11-05', competencia: '2026-11' }];
      draft.borderos = [];
      draft.fiscalClosings = [];
    });

    const app = express();
    app.use(express.json());
    app.use((req, res, next) => {
      req.securityContext = { tenantId, actorId: 'admin_test', role: 'owner', permissions: ['*'] };
      next();
    });
    app.use(torreControleRoutes);

    const server = app.listen(0);
    const port = server.address().port;
    const base = `http://127.0.0.1:${port}`;

    try {
      // 1. GET /api/executivo/torre-controle
      const resTorre = await fetch(`${base}/api/executivo/torre-controle?competencia=2026-11`);
      const dataTorre = await resTorre.json();
      assert.equal(resTorre.status, 200);
      assert.equal(dataTorre.success, true);
      assert.ok(dataTorre.torreControle.scoreSaudeOperacional >= 85);

      // 2. GET /api/executivo/torre-controle/alertas-criticos
      const resAlertas = await fetch(`${base}/api/executivo/torre-controle/alertas-criticos`);
      const dataAlertas = await resAlertas.json();
      assert.equal(resAlertas.status, 200);
      assert.equal(dataAlertas.success, true);
      assert.ok(Array.isArray(dataAlertas.alertas));

      // 3. POST /api/executivo/torre-controle/briefing-whatsapp
      const resBriefing = await fetch(`${base}/api/executivo/torre-controle/briefing-whatsapp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ turno: 'fechamento_diario', competencia: '2026-11' })
      });
      const dataBriefing = await resBriefing.json();
      assert.equal(resBriefing.status, 200);
      assert.equal(dataBriefing.success, true);
      assert.ok(dataBriefing.briefing.respostaTextoWhatsApp.includes('Torre de Controle'));

      // 4. Verificação de Componentes Visuais
      const htmlPainel = globalThis.renderPainelTorreControleExecutivaHtml(dataTorre.torreControle);
      assert.ok(htmlPainel.includes('Torre de Controle Executiva 360º'));
      assert.ok(htmlPainel.includes('Score de Saúde Operacional'));

      const htmlModal = globalThis.modalDispararBriefingExecutivoHtml(dataTorre.torreControle);
      assert.ok(htmlModal.includes('Disparar Briefing Executivo'));

      assert.equal(typeof globalThis.atualizarTorreControleAction, 'function');
      assert.equal(typeof globalThis.confirmarDisparoBriefingWhatsAppAction, 'function');
    } finally {
      server.close();
    }
  });
});
