'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const mechanicTimeTrackingService = require('../services/patio/mechanicTimeTrackingService');
const mechanicProductivityCommissionService = require('../services/patio/mechanicProductivityCommissionService');

function criarEstadoMock() {
  return {
    os: [
      {
        id: 'os_teste_61',
        num: 6101,
        tenantId: 'tenant_patio_61',
        st: 'em_andamento',
        servicos: [
          {
            id: 'srv_mola_1',
            desc: 'Troca de Mola Mestra',
            valor: 400.00,
            status: 'aprovado',
            statusItem: 'aprovado'
          },
          {
            id: 'srv_freio_2',
            desc: 'Revisão de Freios',
            valor: 300.00,
            status: 'aprovado',
            statusItem: 'aprovado'
          },
          {
            id: 'srv_recusado_3',
            desc: 'Alinhamento a Laser',
            valor: 200.00,
            status: 'recusado',
            statusItem: 'adiado'
          }
        ],
        pecas: []
      }
    ],
    timeLogs: [],
    mechanicCommissionRules: [],
    auditoria: []
  };
}

describe('Sprint 6.1 — Produtividade de Pátio, Apontamento de Horas & Comissionamento', () => {
  const tenantId = 'tenant_patio_61';

  test('1.1: Deve registrar ciclo completo de apontamento (iniciar -> pausar -> retomar -> concluir) com dedução precisa de pausas e cálculo de eficiência', () => {
    const state = criarEstadoMock();

    // 1. Iniciar apontamento (horas vendidas = 2.0h)
    const resInicio = mechanicTimeTrackingService.iniciarApontamentoServico(state, {
      tenantId,
      osId: 'os_teste_61',
      servicoId: 'srv_mola_1',
      mecanicoId: 'mec_joao_1',
      mecanicoNome: 'João Mecânico',
      boxId: 'box_01',
      horasPadrao: 2.0,
      timestamp: '2026-11-10T08:00:00.000Z'
    });

    assert.equal(resInicio.ok, true);
    assert.ok(resInicio.apontamento.id);
    assert.equal(resInicio.apontamento.status, 'em_execucao');
    assert.equal(resInicio.apontamento.horasVendidas, 2.0);
    assert.equal(resInicio.apontamento.valorServico, 400.00);

    const logId = resInicio.apontamento.id;

    // 2. Pausar apontamento após 1 hora (09:00)
    const resPausa = mechanicTimeTrackingService.pausarApontamentoServico(state, logId, {
      motivo: 'Aguardando liberação de peça no almoxarifado',
      timestamp: '2026-11-10T09:00:00.000Z'
    });

    assert.equal(resPausa.ok, true);
    assert.equal(resPausa.apontamento.status, 'pausado');
    assert.equal(resPausa.apontamento.pausas.length, 1);
    assert.equal(resPausa.apontamento.pausas[0].fimPausa, null);

    // 3. Retomar apontamento às 09:30 (30 minutos de pausa)
    const resRetomada = mechanicTimeTrackingService.retomarApontamentoServico(state, logId, {
      timestamp: '2026-11-10T09:30:00.000Z'
    });

    assert.equal(resRetomada.ok, true);
    assert.equal(resRetomada.apontamento.status, 'em_execucao');
    assert.equal(resRetomada.apontamento.pausas[0].duracaoMinutos, 30);

    // 4. Concluir apontamento às 10:30 (Total decorrido: 150m, Pausa: 30m, Tempo Líquido: 120m = 2.0 horas)
    const resConcluir = mechanicTimeTrackingService.concluirApontamentoServico(state, logId, {
      timestamp: '2026-11-10T10:30:00.000Z',
      observacao: 'Mola mestra substituída e alinhada com sucesso'
    });

    assert.equal(resConcluir.ok, true);
    assert.equal(resConcluir.apontamento.status, 'concluido');
    assert.equal(resConcluir.apontamento.tempoBrutoMinutos, 150);
    assert.equal(resConcluir.apontamento.tempoPausasMinutos, 30);
    assert.equal(resConcluir.apontamento.tempoLiquidoMinutos, 120);
    assert.equal(resConcluir.apontamento.horasTrabalhadas, 2.0);
    assert.equal(resConcluir.apontamento.indiceEficiencia, 100, '2.0h vendidas / 2.0h trabalhadas = 100% de eficiência');

    // Verifica atualização no item da OS
    const srv = state.os[0].servicos.find(s => s.id === 'srv_mola_1');
    assert.equal(srv.statusExecucao, 'concluido');
    assert.equal(srv.mecanicoId, 'mec_joao_1');
  });

  test('1.2: Deve bloquear início de segundo serviço com MECHANIC_ALREADY_ACTIVE_IN_ANOTHER_SERVICE se mecânico já estiver ativo', () => {
    const state = criarEstadoMock();

    // Inicia serviço 1
    mechanicTimeTrackingService.iniciarApontamentoServico(state, {
      tenantId,
      osId: 'os_teste_61',
      servicoId: 'srv_mola_1',
      mecanicoId: 'mec_carlos_2',
      mecanicoNome: 'Carlos Mecânico',
      boxId: 'box_02',
      timestamp: '2026-11-10T08:00:00.000Z'
    });

    // Tenta iniciar serviço 2 para o mesmo mecânico sem pausar/concluir o anterior
    assert.throws(() => {
      mechanicTimeTrackingService.iniciarApontamentoServico(state, {
        tenantId,
        osId: 'os_teste_61',
        servicoId: 'srv_freio_2',
        mecanicoId: 'mec_carlos_2',
        mecanicoNome: 'Carlos Mecânico',
        boxId: 'box_02',
        timestamp: '2026-11-10T08:15:00.000Z'
      });
    }, /MECHANIC_ALREADY_ACTIVE_IN_ANOTHER_SERVICE|já possui apontamento em execução/i);

    // Pausa serviço 1: agora deve permitir iniciar outro serviço de emergência
    const logAtivo = state.timeLogs.find(l => l.mecanicoId === 'mec_carlos_2');
    mechanicTimeTrackingService.pausarApontamentoServico(state, logAtivo.id, {
      motivo: 'Aguardando peça, alocado para outro reparo rápido',
      timestamp: '2026-11-10T08:20:00.000Z'
    });

    const resInicio2 = mechanicTimeTrackingService.iniciarApontamentoServico(state, {
      tenantId,
      osId: 'os_teste_61',
      servicoId: 'srv_freio_2',
      mecanicoId: 'mec_carlos_2',
      mecanicoNome: 'Carlos Mecânico',
      boxId: 'box_03',
      timestamp: '2026-11-10T08:25:00.000Z'
    });

    assert.equal(resInicio2.ok, true);
  });

  test('1.3: Deve validar estados do apontamento e rejeitar transições inválidas com INVALID_TIMELOG_STATE', () => {
    const state = criarEstadoMock();

    // Não deve permitir iniciar apontamento para serviço recusado/adiado
    assert.throws(() => {
      mechanicTimeTrackingService.iniciarApontamentoServico(state, {
        tenantId,
        osId: 'os_teste_61',
        servicoId: 'srv_recusado_3',
        mecanicoId: 'mec_joao_1'
      });
    }, /não está aprovado para execução/i);

    const inicio = mechanicTimeTrackingService.iniciarApontamentoServico(state, {
      tenantId,
      osId: 'os_teste_61',
      servicoId: 'srv_mola_1',
      mecanicoId: 'mec_joao_1',
      timestamp: '2026-11-10T08:00:00.000Z'
    });

    // Retomar quando já está em execução
    assert.throws(() => {
      mechanicTimeTrackingService.retomarApontamentoServico(state, inicio.apontamento.id, {});
    }, /INVALID_TIMELOG_STATE/i);

    // Pausa e depois pausa de novo
    mechanicTimeTrackingService.pausarApontamentoServico(state, inicio.apontamento.id, {
      timestamp: '2026-11-10T08:30:00.000Z'
    });

    assert.throws(() => {
      mechanicTimeTrackingService.pausarApontamentoServico(state, inicio.apontamento.id, {});
    }, /INVALID_TIMELOG_STATE/i);
  });

  test('2.1: Deve configurar regra de comissão com bônus de eficiência e calcular comissão liberada', () => {
    const state = criarEstadoMock();

    // 1. Configurar regra de comissão
    const resRegra = mechanicProductivityCommissionService.configurarRegraComissaoMecanico(state, 'mec_joao_1', {
      tenantId,
      percentualBase: 10,
      bonusEficienciaPercentual: 2,
      metaEficienciaMinima: 100,
      modalidadeGatilho: 'os_finalizada'
    });

    assert.equal(resRegra.ok, true);
    assert.equal(resRegra.regra.percentualBase, 10);
    assert.equal(resRegra.regra.bonusEficienciaPercentual, 2);

    // 2. Simular apontamento concluído na OS finalizada
    state.os[0].st = 'finalizada';
    state.timeLogs.push({
      id: 'log_concluido_1',
      tenantId,
      osId: 'os_teste_61',
      servicoId: 'srv_mola_1',
      mecanicoId: 'mec_joao_1',
      mecanicoNome: 'João Mecânico',
      status: 'concluido',
      valorServico: 500.00,
      horasVendidas: 2.0,
      horasTrabalhadas: 1.6, // Eficiência = 125% (>= 100%)
      indiceEficiencia: 125,
      concluidoEm: '2026-11-05T14:00:00.000Z'
    });

    const resCalc = mechanicProductivityCommissionService.calcularProdutividadeEComissaoMecanico(state, {
      tenantId,
      mecanicoId: 'mec_joao_1',
      competencia: '2026-11'
    });

    assert.equal(resCalc.ok, true);
    assert.equal(resCalc.totalServicosConcluidos, 1);
    assert.equal(resCalc.totalHorasVendidas, 2.0);
    assert.equal(resCalc.totalHorasTrabalhadas, 1.6);
    assert.equal(resCalc.eficienciaGlobalPercentual, 125);
    assert.equal(resCalc.atingiuMetaEficiencia, true);
    assert.equal(resCalc.percentualAplicado, 12, '10% base + 2% bônus');
    assert.equal(resCalc.baseComissionavelLiberada, 500.00);
    assert.equal(resCalc.valorComissaoBase, 50.00);
    assert.equal(resCalc.valorBonusEficiencia, 10.00);
    assert.equal(resCalc.valorComissaoTotalLiberada, 60.00);
    assert.equal(resCalc.valorComissaoRetida, 0);
  });

  test('2.2: Deve segregar baseComissionavelRetida de baseComissionavelLiberada conforme modalidadeGatilho (os_finalizada vs os_recebida)', () => {
    const state = criarEstadoMock();

    // Regra configurada com gatilho 'os_recebida'
    mechanicProductivityCommissionService.configurarRegraComissaoMecanico(state, 'mec_carlos_2', {
      tenantId,
      percentualBase: 10,
      bonusEficienciaPercentual: 0,
      metaEficienciaMinima: 100,
      modalidadeGatilho: 'os_recebida'
    });

    // OS 1: finalizada, mas ainda não recebida (pago: false)
    state.os = [
      {
        id: 'os_retida',
        tenantId,
        st: 'finalizada',
        pago: false
      },
      {
        id: 'os_paga',
        tenantId,
        st: 'finalizada',
        pago: true
      }
    ];

    state.timeLogs = [
      {
        id: 'log_retido',
        tenantId,
        osId: 'os_retida',
        servicoId: 'srv_1',
        mecanicoId: 'mec_carlos_2',
        status: 'concluido',
        valorServico: 600.00,
        horasVendidas: 2.0,
        horasTrabalhadas: 2.0,
        concluidoEm: '2026-11-06T10:00:00.000Z'
      },
      {
        id: 'log_liberado',
        tenantId,
        osId: 'os_paga',
        servicoId: 'srv_2',
        mecanicoId: 'mec_carlos_2',
        status: 'concluido',
        valorServico: 400.00,
        horasVendidas: 1.0,
        horasTrabalhadas: 1.0,
        concluidoEm: '2026-11-07T11:00:00.000Z'
      }
    ];

    const resCalc = mechanicProductivityCommissionService.calcularProdutividadeEComissaoMecanico(state, {
      tenantId,
      mecanicoId: 'mec_carlos_2',
      competencia: '2026-11'
    });

    assert.equal(resCalc.ok, true);
    assert.equal(resCalc.baseComissionavelLiberada, 400.00, 'Apenas a OS paga deve ser liberada');
    assert.equal(resCalc.valorComissaoTotalLiberada, 40.00);
    assert.equal(resCalc.baseComissionavelRetida, 600.00, 'OS finalizada não paga fica retida no gatilho os_recebida');
    assert.equal(resCalc.valorComissaoRetida, 60.00);
  });

  test('2.3: Deve ratear proporcionalmente base e horas vendidas quando múltiplos mecânicos atuam no mesmo serviço e gerar ranking da equipe', () => {
    const state = criarEstadoMock();

    state.os = [
      {
        id: 'os_compartilhada',
        tenantId,
        st: 'finalizada',
        pago: true
      }
    ];

    // Serviço único de R$ 800 e 4h vendidas executado em conjunto por João (3h) e Pedro (1h)
    state.timeLogs = [
      {
        id: 'log_part_joao',
        tenantId,
        osId: 'os_compartilhada',
        servicoId: 'srv_cambio_pesado',
        mecanicoId: 'mec_joao_1',
        mecanicoNome: 'João Mecânico',
        status: 'concluido',
        valorServico: 800.00,
        horasVendidas: 4.0,
        horasTrabalhadas: 3.0,
        concluidoEm: '2026-11-08T16:00:00.000Z'
      },
      {
        id: 'log_part_pedro',
        tenantId,
        osId: 'os_compartilhada',
        servicoId: 'srv_cambio_pesado',
        mecanicoId: 'mec_pedro_3',
        mecanicoNome: 'Pedro Auxiliar',
        status: 'concluido',
        valorServico: 800.00,
        horasVendidas: 4.0,
        horasTrabalhadas: 1.0,
        concluidoEm: '2026-11-08T16:00:00.000Z'
      }
    ];

    // João trabalhou 3h de 4h totais = 75% -> R$ 600 de base e 3h vendidas (eficiência = 3.0 / 3.0 = 100%)
    const resJoao = mechanicProductivityCommissionService.calcularProdutividadeEComissaoMecanico(state, {
      tenantId,
      mecanicoId: 'mec_joao_1',
      competencia: '2026-11'
    });

    assert.equal(resJoao.baseComissionavelLiberada, 600.00);
    assert.equal(resJoao.totalHorasVendidas, 3.0);
    assert.equal(resJoao.totalHorasTrabalhadas, 3.0);
    assert.equal(resJoao.eficienciaGlobalPercentual, 100);

    // Pedro trabalhou 1h de 4h totais = 25% -> R$ 200 de base e 1h vendida
    const resPedro = mechanicProductivityCommissionService.calcularProdutividadeEComissaoMecanico(state, {
      tenantId,
      mecanicoId: 'mec_pedro_3',
      competencia: '2026-11'
    });

    assert.equal(resPedro.baseComissionavelLiberada, 200.00);
    assert.equal(resPedro.totalHorasVendidas, 1.0);
    assert.equal(resPedro.totalHorasTrabalhadas, 1.0);

    // Resumo de produtividade da equipe
    const resumo = mechanicProductivityCommissionService.gerarResumoProdutividadeEquipe(state, {
      tenantId,
      competencia: '2026-11'
    });

    assert.equal(resumo.ok, true);
    assert.equal(resumo.equipe.length, 2);
    assert.equal(resumo.equipe[0].mecanicoId, 'mec_joao_1');
    assert.equal(resumo.equipe[1].mecanicoId, 'mec_pedro_3');
  });

  test('3.1: Endpoints REST (Apontamentos, Pausa, Conclusão, Regra de Comissão e Produtividade)', async () => {
    const { initDB } = require('../db');
    await initDB();

    const express = require('express');
    const http = require('http');
    const { mountRoutes } = require('../routes/index.js');
    const { getDefaultState, persistState } = require('../lib/repository/stateRepository');

    const app = express();
    app.use(express.json());

    const apiTenantId = 'tenant_http_sprint61';
    const mockState = {
      ...getDefaultState(apiTenantId),
      os: [
        {
          id: 'os_http_61',
          num: 6150,
          tenantId: apiTenantId,
          st: 'em_andamento',
          servicos: [
            {
              id: 'srv_http_1',
              desc: 'Embuxamento de Manga de Eixo',
              valor: 600.00,
              status: 'aprovado',
              statusItem: 'aprovado'
            }
          ],
          pecas: []
        }
      ],
      timeLogs: [],
      mechanicCommissionRules: []
    };

    await persistState(apiTenantId, mockState);

    app.use((req, res, next) => {
      req.securityContext = {
        tenantId: apiTenantId,
        actorId: 'encarregado_patio',
        role: 'admin',
        permissions: ['*'],
        channel: 'api'
      };
      next();
    });

    mountRoutes(app);

    const server = http.createServer(app);
    await new Promise(resolve => server.listen(0, resolve));
    const port = server.address().port;
    const baseUrl = `http://127.0.0.1:${port}`;

    try {
      // 1. POST /api/patio/apontamentos/iniciar
      const resIni = await fetch(`${baseUrl}/api/patio/apontamentos/iniciar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          osId: 'os_http_61',
          servicoId: 'srv_http_1',
          mecanicoId: 'mec_marcos_1',
          mecanicoNome: 'Marcos Eixo',
          boxId: 'box_04',
          horasPadrao: 3.0,
          timestamp: '2026-11-10T08:00:00.000Z'
        })
      });
      const dataIni = await resIni.json();
      assert.equal(resIni.status, 200);
      assert.equal(dataIni.success, true);
      const logId = dataIni.apontamento.id;

      // 2. POST /api/patio/apontamentos/:id/pausar
      const resPausa = await fetch(`${baseUrl}/api/patio/apontamentos/${logId}/pausar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          motivo: 'Almoço',
          timestamp: '2026-11-10T12:00:00.000Z'
        })
      });
      const dataPausa = await resPausa.json();
      assert.equal(resPausa.status, 200);
      assert.equal(dataPausa.apontamento.status, 'pausado');

      // 3. POST /api/patio/apontamentos/:id/retomar
      const resRetomar = await fetch(`${baseUrl}/api/patio/apontamentos/${logId}/retomar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          timestamp: '2026-11-10T13:00:00.000Z' // 60 min pausa
        })
      });
      const dataRetomar = await resRetomar.json();
      assert.equal(resRetomar.status, 200);
      assert.equal(dataRetomar.apontamento.status, 'em_execucao');

      // 4. POST /api/patio/apontamentos/:id/concluir
      const resConc = await fetch(`${baseUrl}/api/patio/apontamentos/${logId}/concluir`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          timestamp: '2026-11-10T15:00:00.000Z', // 7h total - 1h pausa = 6h trabalho
          observacao: 'Manga de eixo ajustada com precisão'
        })
      });
      const dataConc = await resConc.json();
      assert.equal(resConc.status, 200);
      assert.equal(dataConc.apontamento.status, 'concluido');

      // 5. GET /api/patio/apontamentos
      const resGetApt = await fetch(`${baseUrl}/api/patio/apontamentos?status=concluido`);
      const dataGetApt = await resGetApt.json();
      assert.equal(resGetApt.status, 200);
      assert.equal(dataGetApt.total, 1);

      // 6. PUT /api/patio/mecanicos/:mecanicoId/regra-comissao
      const resReg = await fetch(`${baseUrl}/api/patio/mecanicos/mec_marcos_1/regra-comissao`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          percentualBase: 12,
          bonusEficienciaPercentual: 3,
          metaEficienciaMinima: 90,
          modalidadeGatilho: 'os_finalizada'
        })
      });
      const dataReg = await resReg.json();
      assert.equal(resReg.status, 200);
      assert.equal(dataReg.regra.percentualBase, 12);

      // 7. GET /api/patio/produtividade-comissoes?mecanicoId=mec_marcos_1
      const resProd = await fetch(`${baseUrl}/api/patio/produtividade-comissoes?mecanicoId=mec_marcos_1&competencia=2026-11`);
      const dataProd = await resProd.json();
      assert.equal(resProd.status, 200);
      assert.equal(dataProd.success, true);
      assert.equal(dataProd.mecanicoId, 'mec_marcos_1');
      assert.equal(dataProd.totalServicosConcluidos, 1);
    } finally {
      await new Promise(resolve => server.close(resolve));
    }
  });

  test('4.1: Componentes visuais de UI de Produtividade e Apontamento (renderPainelProdutividadePatioHtml, modais e actions)', () => {
    const fs = require('fs');
    const vm = require('vm');
    const path = require('path');

    const uiPath = path.resolve(__dirname, '../js/modules/patio_produtividade_ui.js');
    const actionsPath = path.resolve(__dirname, '../js/modules/patio_produtividade_actions.js');
    assert.ok(fs.existsSync(uiPath), 'patio_produtividade_ui.js deve existir');
    assert.ok(fs.existsSync(actionsPath), 'patio_produtividade_actions.js deve existir');

    const ctx = {
      window: {},
      document: {
        querySelectorAll: () => [],
        getElementById: () => null
      },
      S: { os: [], timeLogs: [], equipe: [], boxes: [] },
      fecharModalGenerico: () => {},
      abrirModalGenerico: () => {},
      torrar: () => {},
      prompt: () => 'motivo teste',
      fetch: () => {}
    };
    ctx.globalThis = ctx;
    ctx.window = ctx;

    vm.runInNewContext(fs.readFileSync(uiPath, 'utf8'), ctx);
    vm.runInNewContext(fs.readFileSync(actionsPath, 'utf8'), ctx);

    // Valida exports
    assert.equal(typeof ctx.renderPainelProdutividadePatioHtml, 'function');
    assert.equal(typeof ctx.modalIniciarApontamentoHtml, 'function');
    assert.equal(typeof ctx.modalConfigurarComissaoMecanicoHtml, 'function');
    assert.equal(typeof ctx.abrirModalIniciarApontamento, 'function');
    assert.equal(typeof ctx.confirmarIniciarApontamento, 'function');
    assert.equal(typeof ctx.pausarApontamento, 'function');
    assert.equal(typeof ctx.retomarApontamento, 'function');
    assert.equal(typeof ctx.concluirApontamento, 'function');
    assert.equal(typeof ctx.abrirModalConfigurarComissaoMecanico, 'function');
    assert.equal(typeof ctx.salvarRegraComissaoMecanico, 'function');

    // 1. Renderiza painel de produtividade
    const htmlPainel = ctx.renderPainelProdutividadePatioHtml({
      apontamentos: [
        {
          id: 'apt_test_1',
          osNum: 6101,
          servicoNome: 'Troca Mola',
          mecanicoNome: 'João Mecânico',
          boxId: 'Box 01',
          status: 'em_execucao',
          horasVendidas: 2.0,
          horasTrabalhadas: 1.5
        }
      ],
      equipe: [
        {
          mecanicoId: 'mec_joao_1',
          valorComissaoTotalLiberada: 120.00,
          valorComissaoRetida: 40.00
        }
      ]
    });

    assert.ok(htmlPainel.includes('Troca Mola'));
    assert.ok(htmlPainel.includes('João Mecânico'));
    assert.ok(htmlPainel.includes('Em Execução'));
    assert.ok(htmlPainel.includes('data-act="pausar-apontamento-servico"'));
    assert.ok(htmlPainel.includes('data-act="concluir-apontamento-servico"'));

    // 2. Renderiza modal de início
    const mockOS = {
      id: 'os_100',
      num: 100,
      placa: 'TEST1234',
      servicos: [
        { id: 'srv_1', desc: 'Troca de Amortecedor', valor: 250, horasPadrao: 1.5, status: 'aprovado' }
      ]
    };
    const htmlModalIni = ctx.modalIniciarApontamentoHtml(mockOS, [{ id: 'm1', nome: 'Mecânico 1' }], ['Box 01']);
    assert.ok(htmlModalIni.includes('Troca de Amortecedor'));
    assert.ok(htmlModalIni.includes('Mecânico 1'));
    assert.ok(htmlModalIni.includes('data-act="iniciar-apontamento-servico"'));

    // 3. Renderiza modal de comissão
    const htmlModalCom = ctx.modalConfigurarComissaoMecanicoHtml({ id: 'm1', nome: 'Mecânico 1' }, { percentualBase: 15 });
    assert.ok(htmlModalCom.includes('Regra de Comissão Técnica'));
    assert.ok(htmlModalCom.includes('value="15"'));
    assert.ok(htmlModalCom.includes('data-act="salvar-regra-comissao-mecanico"'));
  });
});
