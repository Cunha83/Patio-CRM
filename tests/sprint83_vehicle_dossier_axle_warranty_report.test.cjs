'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');

const vehicleTechnicalDossierService = require('../services/patio/vehicleTechnicalDossierService');
const whatsappAgentSkillsService = require('../services/whatsapp/whatsappAgentSkillsService');
const { initDB } = require('../db');
const { mutateTenantState } = require('../lib/serverContext');
const prontuarioRoutes = require('../routes/patio_prontuario_laudo.routes');
require('../js/modules/patio_prontuario_laudo_ui');
require('../js/modules/patio_prontuario_laudo_actions');

function criarEstadoBase() {
  return {
    tenantId: 'tenant_sprint83',
    axleInterventions: [],
    technicalReports: [],
    os: [],
    qualityInspections: [],
    reworkRecords: [],
    opportunities: [],
    whatsappAgentLogs: []
  };
}

test('Sprint 8.3 — Prontuário Técnico 360º por Placa/Eixo, Rastreabilidade de Garantia e Laudo SHA-256', async (t) => {
  await t.test('1.1: Registro de Intervenção por Eixo/Lado e Avaliação Precisa de Cobertura de Garantia', () => {
    const state = criarEstadoBase();

    // 1. Intervenção 1: Eixo 2 Tração, Lado Direito (Passageiro) em 01/10/2026 com 100.000 km
    const int1 = vehicleTechnicalDossierService.registrarIntervencaoPorEixoVeiculo(state, {
      osId: 'os_201',
      placa: 'VOL2B40',
      clienteId: 'cli_alfa',
      eixoPosicao: 'eixo_2_tracao',
      lado: 'direito_passageiro',
      componenteSistema: 'feixe_de_molas',
      descricaoItem: 'Lâmina mestra 90mm reforçada',
      valorAplicado: 1200.00,
      kmNaAplicacao: 100000,
      garantiaDias: 90,
      garantiaKm: 20000,
      dataAplicacao: '2026-10-01'
    });
    assert.equal(int1.ok, true);
    assert.equal(int1.intervencao.kmFimGarantia, 120000);
    assert.equal(state.axleInterventions.length, 1);

    // 2. Intervenção 2: Eixo 3 Truck, Lado Esquerdo (Motorista) em 01/07/2026 com 100.000 km
    vehicleTechnicalDossierService.registrarIntervencaoPorEixoVeiculo(state, {
      osId: 'os_202',
      placa: 'VOL2B40',
      clienteId: 'cli_alfa',
      eixoPosicao: 'eixo_3_truck_apoio',
      lado: 'esquerdo_motorista',
      componenteSistema: 'balanca_suspensao',
      descricaoItem: 'Bucha de bronze da balança',
      valorAplicado: 800.00,
      kmNaAplicacao: 100000,
      garantiaDias: 90,
      garantiaKm: 20000,
      dataAplicacao: '2026-07-01'
    });

    // Cenário A: Eixo 2 Lado Direito em 01/11/2026 (31 dias) com 110.000 km (10.000 km rodados) -> VIGENTE
    const avA = vehicleTechnicalDossierService.avaliarCoberturaGarantiaPecaOuServico(state, {
      placa: 'VOL2B40',
      eixoPosicao: 'eixo_2_tracao',
      lado: 'direito_passageiro',
      kmAtual: 110000,
      dataReferencia: '2026-11-01'
    });
    assert.equal(avA.coberturaAtiva, true);
    assert.equal(avA.intervencoes[0].statusGarantia, 'cobertura_ativa');

    // Cenário B: Eixo 2 Lado Direito em 01/11/2026 (31 dias) mas com 125.000 km (25.000 km rodados) -> EXPIRADA POR KM
    const avB = vehicleTechnicalDossierService.avaliarCoberturaGarantiaPecaOuServico(state, {
      placa: 'VOL2B40',
      eixoPosicao: 'eixo_2_tracao',
      lado: 'direito_passageiro',
      kmAtual: 125000,
      dataReferencia: '2026-11-01'
    });
    assert.equal(avB.coberturaAtiva, false);
    assert.equal(avB.intervencoes[0].statusGarantia, 'expirada_por_km');

    // Cenário C: Eixo 3 Lado Esquerdo em 01/11/2026 (123 dias > 90) com 105.000 km -> EXPIRADA POR TEMPO
    const avC = vehicleTechnicalDossierService.avaliarCoberturaGarantiaPecaOuServico(state, {
      placa: 'VOL2B40',
      eixoPosicao: 'eixo_3_truck_apoio',
      lado: 'esquerdo_motorista',
      kmAtual: 105000,
      dataReferencia: '2026-11-01'
    });
    assert.equal(avC.coberturaAtiva, false);
    assert.equal(avC.intervencoes[0].statusGarantia, 'expirada_por_tempo');

    // Cenário D: Lado oposto (esquerdo do Eixo 2) -> Nenhuma intervenção prévia registrada
    const avD = vehicleTechnicalDossierService.avaliarCoberturaGarantiaPecaOuServico(state, {
      placa: 'VOL2B40',
      eixoPosicao: 'eixo_2_tracao',
      lado: 'esquerdo_motorista',
      kmAtual: 110000
    });
    assert.equal(avD.coberturaAtiva, false);
    assert.equal(avD.intervencoes.length, 0);
  });

  await t.test('1.2: Prontuário Técnico 360º Consolidado por Placa e Cálculo de CPK', () => {
    const state = criarEstadoBase();

    state.os.push(
      { id: 'os_301', num: 301, placa: 'VOL2B40', total: 4000.00, odometro: 90000, fechamento: '2026-08-01', st: 'finalizada' },
      { id: 'os_302', num: 302, placa: 'VOL2B40', total: 6000.00, odometro: 110000, fechamento: '2026-10-15', st: 'finalizada' }
    );
    state.qualityInspections.push({ id: 'insp_1', osId: 'os_301', placa: 'VOL2B40', statusInspecao: 'aprovado' });
    state.reworkRecords.push({ id: 'rew_1', osId: 'os_302', placa: 'VOL2B40', motivoRework: 'reaperto_grampos' });
    state.opportunities.push({ id: 'opp_1', osOrigemId: 'os_301', placa: 'VOL2B40', status: 'adiado_pelo_frotista' });

    vehicleTechnicalDossierService.registrarIntervencaoPorEixoVeiculo(state, {
      osId: 'os_302',
      placa: 'VOL2B40',
      eixoPosicao: 'eixo_2_tracao',
      lado: 'ambos_central',
      componenteSistema: 'feixe_de_molas',
      descricaoItem: 'Troca de lâminas',
      kmNaAplicacao: 110000,
      garantiaDias: 90,
      garantiaKm: 20000,
      dataAplicacao: '2026-10-15'
    });

    const prontuario = vehicleTechnicalDossierService.consolidarProntuarioTecnicoPlaca(state, 'vol-2b40', {
      kmAtualConsulta: 110000,
      dataReferencia: '2026-11-11'
    });

    assert.equal(prontuario.ok, true);
    assert.equal(prontuario.placa, 'VOL2B40');
    assert.equal(prontuario.indicadoresProntuario.totalOS, 2);
    assert.equal(prontuario.indicadoresProntuario.totalInvestidoHistorico, 10000.00);
    assert.equal(prontuario.indicadoresProntuario.kmTotalMonitorado, 20000); // 110.000 - 90.000
    assert.equal(prontuario.indicadoresProntuario.custoPorKmRodado, 0.50); // 10.000 / 20.000
    assert.equal(prontuario.indicadoresProntuario.totalGarantiasAtivasCount, 1);
    assert.equal(prontuario.inspecoesQualidade.length, 1);
    assert.equal(prontuario.ocorrenciasRetrabalho.length, 1);
    assert.equal(prontuario.oportunidadesPendentes.length, 1);
  });

  await t.test('1.3: Emissão de Laudo Técnico de Suspensão com SHA-256 e Consulta WhatsApp', () => {
    const state = criarEstadoBase();

    const laudoRes = vehicleTechnicalDossierService.emitirLaudoTecnicoSuspensaoPesada(state, {
      placa: 'VOL2B40',
      osId: 'os_302',
      clienteId: 'cli_alfa',
      clienteNome: 'Alfa Transportes',
      kmInspecao: 110000,
      responsavelTecnico: 'Eng. Roberto Silva',
      registroConselho: 'CREA-SP 123456',
      avaliacaoSistemas: {
        feixeMolasGrampos: 'conforme',
        embuchamentoPinoCentro: 'conforme',
        balancaTensores: 'conforme',
        freiosTamboresLonas: 'conforme',
        alinhamentoGeometria: 'conforme'
      },
      parecerFinal: 'apto_operacao_rodoviaria',
      recomendacoesTecnicas: 'Reaperto preventivo de grampos após 5.000 km',
      timestamp: '2026-11-11T12:00:00.000Z'
    });

    assert.equal(laudoRes.ok, true);
    const laudo = laudoRes.laudo;
    assert.equal(laudo.placa, 'VOL2B40');
    assert.equal(laudo.parecerFinal, 'apto_operacao_rodoviaria');
    assert.equal(typeof laudo.hashAutenticidadeLaudo, 'string');
    assert.equal(laudo.hashAutenticidadeLaudo.length, 64); // SHA-256 hex length
    assert.equal(state.technicalReports.length, 1);

    // Consulta do prontuário / laudo via Agente de WhatsApp
    const respWpp = whatsappAgentSkillsService.processarMensagemAgenteWhatsApp(state, {
      remetente: '5511999992222',
      perfilRemetente: 'frotista',
      mensagem: 'Por favor, consultar o prontuario da placa VOL2B40',
      placa: 'VOL2B40'
    });

    assert.equal(respWpp.skill, 'SKILL_RECEPCAO_PATIO');
    assert.ok(respWpp.respostaTextoWhatsApp.includes('Prontuário Técnico 360º'));
    assert.ok(respWpp.respostaTextoWhatsApp.includes('VOL2B40'));
    assert.ok(respWpp.respostaTextoWhatsApp.includes('Laudo Técnico'));
  });

  await t.test('1.4: Endpoints REST e Componentes Visuais do Prontuário Técnico', async () => {
    await initDB();
    const tenantId = 'tenant_sprint83_http';

    await mutateTenantState({ securityContext: { tenantId, actorId: 'admin_test', role: 'owner', permissions: ['*'] } }, (draft) => {
      draft.axleInterventions = [];
      draft.technicalReports = [];
      draft.os = [{ id: 'os_h1', num: 901, placa: 'SCA1E10', total: 5000, odometro: 150000, st: 'finalizada' }];
    });

    const app = express();
    app.use(express.json());
    app.use((req, res, next) => {
      req.securityContext = { tenantId, actorId: 'admin_test', role: 'owner', permissions: ['*'] };
      next();
    });
    app.use(prontuarioRoutes);

    const server = app.listen(0);
    const port = server.address().port;
    const base = `http://127.0.0.1:${port}`;

    try {
      // 1. POST /intervencoes-eixo
      const resInt = await fetch(`${base}/api/patio/veiculos/SCA1E10/intervencoes-eixo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eixoPosicao: 'eixo_2_tracao',
          lado: 'direito_passageiro',
          componenteSistema: 'feixe_de_molas',
          descricaoItem: 'Mola Mestra',
          kmNaAplicacao: 150000,
          garantiaDias: 90,
          garantiaKm: 20000
        })
      });
      const dataInt = await resInt.json();
      assert.equal(resInt.status, 200);
      assert.equal(dataInt.success, true);
      assert.equal(dataInt.intervencao.placa, 'SCA1E10');

      // 2. GET /prontuario
      const resPront = await fetch(`${base}/api/patio/veiculos/SCA1E10/prontuario?kmAtualConsulta=155000`);
      const dataPront = await resPront.json();
      assert.equal(resPront.status, 200);
      assert.equal(dataPront.success, true);
      assert.equal(dataPront.prontuario.indicadoresProntuario.totalOS, 1);

      // 3. POST /avaliar-garantia
      const resGar = await fetch(`${base}/api/patio/veiculos/SCA1E10/avaliar-garantia`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eixoPosicao: 'eixo_2_tracao',
          lado: 'direito_passageiro',
          kmAtual: 155000
        })
      });
      const dataGar = await resGar.json();
      assert.equal(resGar.status, 200);
      assert.equal(dataGar.success, true);
      assert.equal(dataGar.avaliacao.coberturaAtiva, true);

      // 4. POST /laudo-tecnico
      const resLaudo = await fetch(`${base}/api/patio/veiculos/SCA1E10/laudo-tecnico`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kmInspecao: 155000,
          responsavelTecnico: 'Eng. Carlos',
          parecerFinal: 'apto_operacao_rodoviaria'
        })
      });
      const dataLaudo = await resLaudo.json();
      assert.equal(resLaudo.status, 200);
      assert.equal(dataLaudo.success, true);
      assert.ok(dataLaudo.laudo.hashAutenticidadeLaudo);

      // 5. Testes Visuais de UI
      const painelHtml = globalThis.renderPainelProntuarioTecnicoPlacaHtml(dataPront.prontuario);
      assert.ok(painelHtml.includes('Prontuário Técnico 360º'));
      assert.ok(painelHtml.includes('SCA1E10'));

      const modalIntHtml = globalThis.modalRegistrarIntervencaoEixoHtml({ placa: 'SCA1E10' });
      assert.ok(modalIntHtml.includes('Registrar Intervenção Técnica por Eixo'));

      const modalLaudoHtml = globalThis.modalEmitirLaudoTecnicoHtml({ placa: 'SCA1E10' });
      assert.ok(modalLaudoHtml.includes('Emitir Laudo Técnico de Suspensão'));

      assert.equal(typeof globalThis.consultarProntuarioPlacaAction, 'function');
      assert.equal(typeof globalThis.salvarIntervencaoEixoAction, 'function');
    } finally {
      server.close();
    }
  });
});
