'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const qualityWarrantyReworkService = require('../services/patio/qualityWarrantyReworkService');
const commissionPayrollService = require('../services/patio/commissionPayrollService');
const mechanicProductivityCommissionService = require('../services/patio/mechanicProductivityCommissionService');

function criarEstadoMock() {
  return {
    os: [
      {
        id: 'os_origem_1',
        num: 6201,
        tenantId: 'tenant_qualidade_62',
        cli: 'cli_frota_1',
        clienteId: 'cli_frota_1',
        clienteNome: 'Transportes Brasilia',
        vei: 'vei_scania_1',
        veiculoId: 'vei_scania_1',
        placa: 'BRA2E19',
        modelo: 'Scania R450',
        st: 'em_andamento',
        servicos: [
          {
            id: 'srv_reparo_mola',
            desc: 'Substituição de Lâminas e Alinhamento de Mola Mestra',
            valor: 450.00,
            status: 'aprovado',
            statusItem: 'aprovado'
          }
        ],
        pecas: []
      }
    ],
    qualityInspections: [],
    reworkRecords: [],
    mechanicAdvances: [],
    commissionPayrolls: [],
    contas: [],
    auditoria: []
  };
}

describe('Sprint 6.2 — Checklist de Qualidade, Garantia/Retrabalho & Folha de Comissões', () => {
  const tenantId = 'tenant_qualidade_62';

  test('1.1: Deve registrar inspeção de qualidade (aprovada vs reprovada) e validar bloqueio de liberação com QUALITY_INSPECTION_REQUIRED_OR_FAILED', () => {
    const state = criarEstadoMock();

    // 1. Tentar liberar OS sem inspeção prévia deve ser bloqueado
    assert.throws(() => {
      qualityWarrantyReworkService.validarLiberacaoQualidadeOS(state, 'os_origem_1');
    }, /QUALITY_INSPECTION_REQUIRED_OR_FAILED|inspeção de qualidade pré-entrega obrigatória/i);

    // 2. Registrar inspeção reprovada (ex: torque dos grampos NOK)
    const resReprovada = qualityWarrantyReworkService.registrarInspecaoQualidadeOS(state, 'os_origem_1', {
      tenantId,
      inspetorNome: 'Engenheiro Chefe Mário',
      torqueGramposOk: false, // Reprovado no torque
      pinoCentroOk: true,
      embuchamentoOk: true,
      testeRodagemOk: true,
      observacoes: 'Torque de grampos abaixo de 600 Nm especificado no manual.',
      timestamp: '2026-11-10T09:00:00.000Z'
    });

    assert.equal(resReprovada.ok, true);
    assert.equal(resReprovada.inspecao.aprovado, false);
    assert.equal(state.os[0].inspecaoQualidade.status, 'reprovada');

    // Validação de liberação deve continuar bloqueando
    assert.throws(() => {
      qualityWarrantyReworkService.validarLiberacaoQualidadeOS(state, 'os_origem_1');
    }, /QUALITY_INSPECTION_REQUIRED_OR_FAILED|não foi aprovada/i);

    // 3. Re-inspeção após aperto e torque aferido: agora aprovada
    const resAprovada = qualityWarrantyReworkService.registrarInspecaoQualidadeOS(state, 'os_origem_1', {
      tenantId,
      inspetorNome: 'Engenheiro Chefe Mário',
      torqueGramposOk: true,
      pinoCentroOk: true,
      embuchamentoOk: true,
      testeRodagemOk: true,
      observacoes: 'Reaperto executado com torquímetro calibrado. Aprovado para entrega.',
      timestamp: '2026-11-10T10:00:00.000Z'
    });

    assert.equal(resAprovada.ok, true);
    assert.equal(resAprovada.inspecao.aprovado, true);
    assert.equal(state.os[0].inspecaoQualidade.status, 'aprovada');

    // Liberação autorizada com sucesso
    const resLib = qualityWarrantyReworkService.validarLiberacaoQualidadeOS(state, 'os_origem_1');
    assert.equal(resLib.ok, true);
    assert.equal(resLib.liberado, true);
  });

  test('1.2: Deve abrir OS de Garantia/Retrabalho isenta ao cliente vinculada à OS de origem e mecânico com flag de estorno', () => {
    const state = criarEstadoMock();

    const resRetrabalho = qualityWarrantyReworkService.abrirOSGarantiaRetrabalho(state, {
      tenantId,
      osOrigemId: 'os_origem_1',
      servicoOrigemId: 'srv_reparo_mola',
      mecanicoOrigemId: 'mec_carlos_1',
      mecanicoExecucaoId: 'mec_pedro_2',
      motivoRetrabalho: 'Lâmina apresentou desalinhamento após 3 dias de rodagem',
      causaRaiz: 'falha_execucao',
      valorMaoObraAfetada: 450.00,
      horasRetrabalhoEstimadas: 2.0,
      competencia: '2026-11',
      timestamp: '2026-11-10T14:00:00.000Z'
    });

    assert.equal(resRetrabalho.ok, true);
    assert.ok(resRetrabalho.novaOS);
    assert.equal(resRetrabalho.novaOS.tipoOS, 'garantia_retrabalho');
    assert.equal(resRetrabalho.novaOS.osOrigemId, 'os_origem_1');
    assert.equal(resRetrabalho.novaOS.custoCliente, 0, 'Cliente não paga por serviço de garantia');
    assert.equal(resRetrabalho.novaOS.placa, 'BRA2E19');

    // Registro de retrabalho com estorno de comissão
    assert.ok(resRetrabalho.ocorrencia);
    assert.equal(resRetrabalho.ocorrencia.mecanicoOrigemId, 'mec_carlos_1');
    assert.equal(resRetrabalho.ocorrencia.causaRaiz, 'falha_execucao');
    assert.equal(resRetrabalho.ocorrencia.estornarComissao, true);
    assert.equal(resRetrabalho.ocorrencia.valorMaoObraAfetada, 450.00);

    const lista = qualityWarrantyReworkService.listarOcorrenciasRetrabalho(state, {
      mecanicoOrigemId: 'mec_carlos_1',
      competencia: '2026-11'
    });
    assert.equal(lista.length, 1);
    assert.equal(lista[0].id, resRetrabalho.ocorrencia.id);
  });

  test('2.1: Deve registrar vales/adiantamentos de mecânico e bloquear lançamentos em competência fechada com PAYROLL_ALREADY_CLOSED', () => {
    const state = criarEstadoMock();

    const resVale = commissionPayrollService.registrarValeAdiantamentoMecanico(state, {
      tenantId,
      mecanicoId: 'mec_carlos_1',
      mecanicoNome: 'Carlos Mecânico',
      valor: 200.00,
      competencia: '2026-11',
      motivo: 'Adiantamento emergencial de peças',
      autorizadoPor: 'Gerente Roberto'
    });

    assert.equal(resVale.ok, true);
    assert.equal(resVale.vale.valor, 200.00);
    assert.equal(resVale.vale.status, 'pendente');

    const lista = commissionPayrollService.listarValesMecanico(state, {
      mecanicoId: 'mec_carlos_1',
      competencia: '2026-11'
    });
    assert.equal(lista.length, 1);
    assert.equal(lista[0].id, resVale.vale.id);

    // Simular folha já fechada para a mesma competência
    state.commissionPayrolls.push({
      id: 'folha_fechada_mock',
      tenantId,
      mecanicoId: 'mec_carlos_1',
      competencia: '2026-11',
      status: 'fechada'
    });

    assert.throws(() => {
      commissionPayrollService.registrarValeAdiantamentoMecanico(state, {
        tenantId,
        mecanicoId: 'mec_carlos_1',
        valor: 50.00,
        competencia: '2026-11'
      });
    }, /PAYROLL_ALREADY_CLOSED/i);
  });

  test('2.2: Deve calcular prévia da folha com estorno de comissão por retrabalho e anulação de bônus por falha de execução', () => {
    const state = criarEstadoMock();
    const mecanicoId = 'mec_carlos_1';
    const competencia = '2026-11';

    // Configurar regra com 10% base e 5% de bônus se eficiência >= 100%
    mechanicProductivityCommissionService.configurarRegraComissaoMecanico(state, mecanicoId, {
      tenantId,
      percentualBase: 10,
      bonusEficienciaPercentual: 5,
      metaEficienciaMinima: 100,
      modalidadeGatilho: 'os_finalizada'
    });

    // OS finalizada com 10h vendidas e 8h trabalhadas (eficiência 125% -> ganharia bônus)
    state.os[0].st = 'finalizada';
    state.timeLogs = [
      {
        id: 'log_1',
        tenantId,
        mecanicoId,
        osId: 'os_origem_1',
        servicoId: 'srv_reparo_mola',
        valorServico: 1000.00,
        horasVendidas: 10,
        horasTrabalhadas: 8,
        status: 'concluido',
        concluidoEm: '2026-11-05T12:00:00.000Z'
      }
    ];

    // Registrar retrabalho com falha de execução
    qualityWarrantyReworkService.abrirOSGarantiaRetrabalho(state, {
      tenantId,
      osOrigemId: 'os_origem_1',
      servicoOrigemId: 'srv_reparo_mola',
      mecanicoOrigemId: mecanicoId,
      causaRaiz: 'falha_execucao',
      valorMaoObraAfetada: 450.00, // 10% de 450 = 45.00 estorno
      competencia
    });

    // Lançar um adiantamento de 30.00
    commissionPayrollService.registrarValeAdiantamentoMecanico(state, {
      tenantId,
      mecanicoId,
      valor: 30.00,
      competencia
    });

    const previa = commissionPayrollService.calcularPreviaFolhaComissoes(state, {
      tenantId,
      mecanicoId,
      competencia
    });

    assert.equal(previa.ok, true);
    // Base: 10% de 1000 = 100.00
    assert.equal(previa.produtividade.valorComissaoBase, 100.00);
    // Eficiência seria 125%, mas por causa do retrabalho com falha_execucao, bônus deve ser anulado
    assert.equal(previa.perdeuBonusPorRetrabalho, true);
    assert.equal(previa.valorBonusEficiencia, 0.00);
    // Estorno de comissão: 10% de 450.00 = 45.00
    assert.equal(previa.valorEstornoComissaoRetrabalho, 45.00);
    // Comissão após estorno: 100 - 45 = 55.00
    assert.equal(previa.valorComissaoAposEstornos, 55.00);
    // Vales a descontar: 30.00
    assert.equal(previa.totalValesDescontar, 30.00);
    // Líquido a pagar: 55 - 30 = 25.00
    assert.equal(previa.valorLiquidoPagar, 25.00);
    assert.equal(previa.saldoDevedorProximoMes, 0.00);
  });

  test('2.3: Deve fechar a folha definitivamente, quitar vales, marcar ocorrências e gerar título a pagar no contas', () => {
    const state = criarEstadoMock();
    const mecanicoId = 'mec_carlos_1';
    const competencia = '2026-11';

    mechanicProductivityCommissionService.configurarRegraComissaoMecanico(state, mecanicoId, {
      tenantId,
      percentualBase: 10,
      bonusEficienciaPercentual: 0,
      modalidadeGatilho: 'os_finalizada'
    });

    state.os[0].st = 'finalizada';
    state.timeLogs = [
      {
        id: 'log_fechamento',
        tenantId,
        mecanicoId,
        osId: 'os_origem_1',
        valorServico: 800.00,
        horasVendidas: 5,
        horasTrabalhadas: 5,
        status: 'concluido',
        concluidoEm: '2026-11-08T10:00:00.000Z'
      }
    ];

    const resVale = commissionPayrollService.registrarValeAdiantamentoMecanico(state, {
      tenantId,
      mecanicoId,
      valor: 50.00,
      competencia
    });

    const resFechamento = commissionPayrollService.fecharFolhaComissoesCompetencia(state, {
      tenantId,
      mecanicoId,
      competencia,
      responsavel: 'Financeiro Central'
    });

    assert.equal(resFechamento.ok, true);
    assert.ok(resFechamento.folha);
    assert.equal(resFechamento.folha.status, 'fechada');
    // Base 80.00 - Vale 50.00 = 30.00 líquido
    assert.equal(resFechamento.folha.resumo.valorLiquidoPagar, 30.00);

    // Vale marcado como descontado_em_folha
    assert.equal(state.mechanicAdvances[0].status, 'descontado_em_folha');
    assert.equal(state.mechanicAdvances[0].folhaComissaoId, resFechamento.folha.id);

    // Título a pagar gerado em contas
    assert.ok(resFechamento.contaPagar);
    assert.equal(resFechamento.contaPagar.tipo, 'pagar');
    assert.equal(resFechamento.contaPagar.cat, 'comissao_mecanico');
    assert.equal(resFechamento.contaPagar.valor, 30.00);
    assert.equal(state.contas.length, 1);

    // Tentativa de fechar novamente deve ser bloqueada
    assert.throws(() => {
      commissionPayrollService.fecharFolhaComissoesCompetencia(state, {
        tenantId,
        mecanicoId,
        competencia
      });
    }, /PAYROLL_ALREADY_CLOSED/i);
  });

  test('3.1: Endpoints REST (Inspeção de Qualidade, Validação de Liberação, Retrabalho, Vales e Folha de Comissões)', async () => {
    const { initDB } = require('../db');
    await initDB();

    const express = require('express');
    const http = require('http');
    const { mountRoutes } = require('../routes/index.js');
    const { getDefaultState, persistState } = require('../lib/repository/stateRepository');

    const app = express();
    app.use(express.json());

    const apiTenantId = 'tenant_http_sprint62';
    const mockState = {
      ...getDefaultState(apiTenantId),
      os: [
        {
          id: 'os_http_62',
          num: 6250,
          tenantId: apiTenantId,
          cli: 'cli_frota_62',
          clienteNome: 'Transportes Rápido',
          placa: 'LOG4A20',
          st: 'finalizada',
          servicos: [
            {
              id: 'srv_http_suspensao',
              desc: 'Embuxamento e Troca de Lâmina',
              valor: 800.00,
              status: 'aprovado',
              statusItem: 'aprovado'
            }
          ],
          pecas: []
        }
      ],
      timeLogs: [
        {
          id: 'log_http_62',
          tenantId: apiTenantId,
          osId: 'os_http_62',
          servicoId: 'srv_http_suspensao',
          mecanicoId: 'mec_valter_1',
          mecanicoNome: 'Valter Molas',
          status: 'concluido',
          valorServico: 800.00,
          horasVendidas: 4.0,
          horasTrabalhadas: 4.0,
          concluidoEm: '2026-11-09T15:00:00.000Z'
        }
      ],
      qualityInspections: [],
      reworkRecords: [],
      mechanicAdvances: [],
      commissionPayrolls: [],
      contas: [],
      auditoria: []
    };

    await persistState(apiTenantId, mockState);

    app.use((req, res, next) => {
      req.securityContext = {
        tenantId: apiTenantId,
        actorId: 'gerente_qualidade',
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
      // 1. GET /api/patio/os/:id/validar-liberacao (deve retornar 412 pois ainda não há checklist)
      const resValidaInicial = await fetch(`${baseUrl}/api/patio/os/os_http_62/validar-liberacao`);
      assert.equal(resValidaInicial.status, 412);
      const dataValidaInicial = await resValidaInicial.json();
      assert.equal(dataValidaInicial.code, 'QUALITY_INSPECTION_REQUIRED_OR_FAILED');

      // 2. POST /api/patio/os/:id/inspecao-qualidade (checklist aprovado)
      const resInsp = await fetch(`${baseUrl}/api/patio/os/os_http_62/inspecao-qualidade`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inspetorNome: 'Engenheiro Chefe Mário',
          torqueGramposOk: true,
          pinoCentroOk: true,
          embuchamentoOk: true,
          testeRodagemOk: true,
          observacoes: 'Veículo aprovado nos testes dinâmicos de pátio.'
        })
      });
      assert.equal(resInsp.status, 200);
      const dataInsp = await resInsp.json();
      assert.equal(dataInsp.success, true);
      assert.equal(dataInsp.inspecao.aprovado, true);

      // 3. GET /api/patio/os/:id/validar-liberacao (agora deve aprovar liberação)
      const resValidaFinal = await fetch(`${baseUrl}/api/patio/os/os_http_62/validar-liberacao`);
      assert.equal(resValidaFinal.status, 200);
      const dataValidaFinal = await resValidaFinal.json();
      assert.equal(dataValidaFinal.liberado, true);

      // 4. POST /api/patio/rework/abrir (abertura de garantia)
      const resRetrabalho = await fetch(`${baseUrl}/api/patio/rework/abrir`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          osOrigemId: 'os_http_62',
          mecanicoOrigemId: 'mec_valter_1',
          motivoRetrabalho: 'Ruído no pino de centro',
          causaRaiz: 'falha_execucao',
          valorMaoObraAfetada: 200.00,
          competencia: '2026-11'
        })
      });
      assert.equal(resRetrabalho.status, 200);
      const dataRetrabalho = await resRetrabalho.json();
      assert.equal(dataRetrabalho.success, true);
      assert.equal(dataRetrabalho.novaOS.tipoOS, 'garantia_retrabalho');
      assert.equal(dataRetrabalho.novaOS.custoCliente, 0);

      // 5. GET /api/patio/rework/ocorrencias
      const resOcorrencias = await fetch(`${baseUrl}/api/patio/rework/ocorrencias?mecanicoOrigemId=mec_valter_1`);
      assert.equal(resOcorrencias.status, 200);
      const dataOcorrencias = await resOcorrencias.json();
      assert.equal(dataOcorrencias.total, 1);

      // 6. POST /api/patio/comissoes/vales
      const resVale = await fetch(`${baseUrl}/api/patio/comissoes/vales`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mecanicoId: 'mec_valter_1',
          valor: 20.00,
          competencia: '2026-11',
          motivo: 'Vale farmácia'
        })
      });
      assert.equal(resVale.status, 200);
      const dataVale = await resVale.json();
      assert.equal(dataVale.vale.valor, 20.00);

      // 7. GET /api/patio/comissoes/vales
      const resListaVales = await fetch(`${baseUrl}/api/patio/comissoes/vales?mecanicoId=mec_valter_1`);
      assert.equal(resListaVales.status, 200);
      const dataListaVales = await resListaVales.json();
      assert.equal(dataListaVales.total, 1);

      // 8. GET /api/patio/comissoes/folha/previa
      const resPrevia = await fetch(`${baseUrl}/api/patio/comissoes/folha/previa?mecanicoId=mec_valter_1&competencia=2026-11`);
      assert.equal(resPrevia.status, 200);
      const dataPrevia = await resPrevia.json();
      assert.equal(dataPrevia.success, true);
      // Base: 10% de 800 = 80.00. Estorno 10% de 200 = 20.00. Vales = 20.00. Líquido = 40.00
      assert.equal(dataPrevia.valorComissaoBase, undefined); // valorComissaoBase is inside dataPrevia.produtividade
      assert.equal(dataPrevia.produtividade.valorComissaoBase, 80.00);
      assert.equal(dataPrevia.valorEstornoComissaoRetrabalho, 20.00);
      assert.equal(dataPrevia.totalValesDescontar, 20.00);
      assert.equal(dataPrevia.valorLiquidoPagar, 40.00);

      // 9. POST /api/patio/comissoes/folha/fechar
      const resFechar = await fetch(`${baseUrl}/api/patio/comissoes/folha/fechar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mecanicoId: 'mec_valter_1',
          competencia: '2026-11'
        })
      });
      assert.equal(resFechar.status, 200);
      const dataFechar = await resFechar.json();
      assert.equal(dataFechar.folha.status, 'fechada');
      assert.equal(dataFechar.folha.resumo.valorLiquidoPagar, 40.00);
      assert.equal(dataFechar.contaPagar.valor, 40.00);

      // 10. POST duplo fechamento bloqueado com 409
      const resDuploFechar = await fetch(`${baseUrl}/api/patio/comissoes/folha/fechar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mecanicoId: 'mec_valter_1',
          competencia: '2026-11'
        })
      });
      assert.equal(resDuploFechar.status, 409);
    } finally {
      await new Promise(resolve => server.close(resolve));
    }
  });

  test('4.1: Componentes visuais de UI de Qualidade, Retrabalho e Folha de Comissões (templates e actions)', () => {
    const fs = require('fs');
    const vm = require('vm');
    const path = require('path');

    const uiPath = path.resolve(__dirname, '../js/modules/patio_qualidade_folha_ui.js');
    const actionsPath = path.resolve(__dirname, '../js/modules/patio_qualidade_folha_actions.js');
    assert.ok(fs.existsSync(uiPath), 'patio_qualidade_folha_ui.js deve existir');
    assert.ok(fs.existsSync(actionsPath), 'patio_qualidade_folha_actions.js deve existir');

    const ctx = {
      window: {},
      document: {
        querySelectorAll: () => [],
        getElementById: () => null,
        addEventListener: () => {}
      },
      S: { os: [], reworkRecords: [], qualityInspections: [], equipe: [], mechanicAdvances: [] },
      fecharModalGenerico: () => {},
      abrirModalGenerico: () => {},
      torrar: () => {},
      prompt: () => '100.00',
      fetch: () => {}
    };
    ctx.globalThis = ctx;
    ctx.window = ctx;

    vm.runInNewContext(fs.readFileSync(uiPath, 'utf8'), ctx);
    vm.runInNewContext(fs.readFileSync(actionsPath, 'utf8'), ctx);

    // Validação dos exports em window/globalThis
    assert.equal(typeof ctx.renderPainelQualidadeFolhaHtml, 'function');
    assert.equal(typeof ctx.modalInspecaoQualidadeOSHtml, 'function');
    assert.equal(typeof ctx.modalAbrirRetrabalhoHtml, 'function');
    assert.equal(typeof ctx.modalFechamentoFolhaComissoesHtml, 'function');
    assert.equal(typeof ctx.abrirModalInspecaoQualidade, 'function');
    assert.equal(typeof ctx.confirmarInspecaoQualidade, 'function');
    assert.equal(typeof ctx.validarELiberarOS, 'function');
    assert.equal(typeof ctx.abrirModalRetrabalho, 'function');
    assert.equal(typeof ctx.confirmarAbrirRetrabalho, 'function');
    assert.equal(typeof ctx.abrirModalLancarVale, 'function');
    assert.equal(typeof ctx.abrirModalFolhaComissoes, 'function');
    assert.equal(typeof ctx.confirmarFecharFolha, 'function');

    // 1. Renderiza painel de qualidade e folha
    const htmlPainel = ctx.renderPainelQualidadeFolhaHtml({
      inspecoes: [
        { id: 'insp_1', status: 'aprovada' },
        { id: 'insp_2', status: 'reprovada' }
      ],
      retrabalhos: [
        {
          id: 'ret_1',
          osRetrabalhoId: 'os_gar_1',
          osOrigemId: 'os_origem_1',
          mecanicoOrigemId: 'mec_carlos_1',
          causaRaiz: 'falha_execucao',
          valorMaoObraAfetada: 450.00,
          motivoRetrabalho: 'Desalinhamento de feixe',
          estornarComissao: true
        }
      ],
      vales: [
        { id: 'vale_1', valor: 150.00, status: 'pendente' }
      ]
    });

    assert.ok(htmlPainel.includes('Inspeções Aprovadas'));
    assert.ok(htmlPainel.includes('Garantia / Retrabalhos'));
    assert.ok(htmlPainel.includes('Vales em Aberto'));
    assert.ok(htmlPainel.includes('Falha Execução'));
    assert.ok(htmlPainel.includes('Desalinhamento de feixe'));

    // 2. Renderiza modal de checklist técnico pré-entrega
    const mockOS = {
      id: 'os_check_1',
      num: 6299,
      placa: 'VOL9X11',
      modelo: 'Volvo FH 540',
      inspecaoQualidade: { torqueGramposOk: true, pinoCentroOk: false }
    };
    const htmlChecklist = ctx.modalInspecaoQualidadeOSHtml(mockOS);
    assert.ok(htmlChecklist.includes('Checklist Técnico Pré-Entrega — OS #6299'));
    assert.ok(htmlChecklist.includes('VOL9X11'));
    assert.ok(htmlChecklist.includes('chk-insp-torque'));
    assert.ok(htmlChecklist.includes('chk-insp-pino'));
    assert.ok(htmlChecklist.includes('chk-insp-embuchamento'));
    assert.ok(htmlChecklist.includes('chk-insp-rodagem'));

    // 3. Renderiza modal de abertura de garantia/retrabalho
    const htmlRetrabalho = ctx.modalAbrirRetrabalhoHtml(mockOS, [{ id: 'mec_1', nome: 'Mecânico Teste' }]);
    assert.ok(htmlRetrabalho.includes('Abertura de OS de Garantia e Retrabalho'));
    assert.ok(htmlRetrabalho.includes('Mecânico Teste'));
    assert.ok(htmlRetrabalho.includes('falha_execucao'));
    assert.ok(htmlRetrabalho.includes('Custo Cliente: R$ 0,00'));

    // 4. Renderiza modal de fechamento de folha de comissões
    const mockPrevia = {
      mecanicoId: 'mec_carlos_1',
      competencia: '2026-11',
      perdeuBonusPorRetrabalho: true,
      ocorrenciasRetrabalho: [{ id: 'ret_1' }],
      produtividade: { valorComissaoBase: 500.00 },
      valorBonusEficiencia: 0.00,
      valorEstornoComissaoRetrabalho: 50.00,
      totalValesDescontar: 100.00,
      valorLiquidoPagar: 350.00,
      saldoDevedorProximoMes: 0.00
    };
    const htmlFolha = ctx.modalFechamentoFolhaComissoesHtml(mockPrevia);
    assert.ok(htmlFolha.includes('Fechamento de Folha de Comissões — Comp. 2026-11'));
    assert.ok(htmlFolha.includes('mec_carlos_1'));
    assert.ok(htmlFolha.includes('Bônus de eficiência anulado devido a 1 ocorrência(s) de retrabalho'));
    assert.ok(htmlFolha.includes('Líquido a Pagar'));
  });
});
