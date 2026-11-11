'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');

const b2bFiscalClosingService = require('../services/fiscal/b2bFiscalClosingService');
const { conciliarExtratoBancarioAutomatico } = require('../services/finance/bankStatementReconciliationService');
const { initDB } = require('../db');
const { mutateTenantState } = require('../lib/serverContext');
const fiscalRoutes = require('../routes/fiscal_b2b_fechamento.routes');
require('../js/modules/fiscal_b2b_ui');
require('../js/modules/fiscal_b2b_actions');

function criarEstadoBase() {
  return {
    tenantId: 'tenant_sprint82',
    fiscalConfig: {},
    fiscalClosings: [],
    os: [],
    borderos: [],
    borderosFrotistas: [],
    contas: [],
    bankReconciliations: [],
    borderoSettlements: []
  };
}

test('Sprint 8.2 — Fechamento Fiscal B2B, Segregação NF-e/NFS-e e Retenções Tributárias', async (t) => {
  await t.test('1.1: Configuração de Perfil Tributário e Segregação NF-e (Peças) vs NFS-e (Serviços)', () => {
    const state = criarEstadoBase();

    // 1. Configurar perfil tributário
    const cfgRes = b2bFiscalClosingService.configurarPerfilTributarioOficina(state, {
      regimeTributario: 'simples_nacional',
      aliquotaISSPadrao: 5,
      aliquotaIRRFPadrao: 1.5,
      aliquotaCSRFPadrao: 4.65,
      cfopPecasPadrao: '5405',
      ncmSuspensaoPadrao: '8708.80.00',
      codigoServicoLC116: '14.01'
    });
    assert.equal(cfgRes.ok, true);
    assert.equal(state.fiscalConfig.cfopPecasPadrao, '5405');

    // 2. Criar OS com peças e serviços segregados
    state.os.push({
      id: 'os_fisc_101',
      num: 101,
      clienteId: 'cli_transp_alfa',
      clienteNome: 'Alfa Transportes',
      placa: 'ALF1A10',
      pecas: [
        { desc: 'Lâmina Mestra 90mm', valor: 800.00, qtd: 2, total: 1600.00 }
      ],
      servicos: [
        { desc: 'Troca de Mola e Arqueamento de Feixe', valor: 1000.00 }
      ],
      total: 2600.00,
      st: 'finalizada'
    });

    // 3. Gerar espelho fiscal da OS
    const espelhoRes = b2bFiscalClosingService.gerarEspelhoFiscalOSOuBordero(state, {
      osId: 'os_fisc_101'
    });

    assert.equal(espelhoRes.ok, true);
    const esp = espelhoRes.espelhoFiscal;
    assert.equal(esp.baseCalculoPecasTotal, 1600.00);
    assert.equal(esp.baseCalculoServicosTotal, 1000.00);
    assert.equal(esp.valorBrutoTotal, 2600.00);
    assert.equal(esp.espelhoNFePecas.modelo, '55');
    assert.equal(esp.espelhoNFePecas.cfopPadrao, '5405');
    assert.equal(esp.espelhoNFePecas.itens.length, 1);
    assert.equal(esp.espelhoNFePecas.itens[0].ncm, '8708.80.00');
    assert.equal(esp.espelhoNFSeServicos.codigoServicoLC116, '14.01');
    assert.equal(esp.espelhoNFSeServicos.itens.length, 1);
    assert.equal(esp.status, 'espelho_gerado');
  });

  await t.test('1.2: Retenções Tributárias na Fonte B2B (ISS / IRRF / CSRF) — Simples vs Lucro Presumido', () => {
    const state = criarEstadoBase();
    b2bFiscalClosingService.configurarPerfilTributarioOficina(state, {
      regimeTributario: 'simples_nacional',
      aliquotaISSPadrao: 5,
      aliquotaIRRFPadrao: 1.5,
      aliquotaCSRFPadrao: 4.65
    });

    state.os.push({
      id: 'os_fisc_102',
      clienteId: 'cli_transp_alfa',
      clienteNome: 'Alfa Transportes',
      pecas: [{ desc: 'Barra Tensora', valor: 1200.00, qtd: 1, total: 1200.00 }],
      servicos: [{ desc: 'Alinhamento Técnico a Laser', valor: 2000.00 }],
      total: 3200.00
    });

    // Cenário A: Simples Nacional com retenção municipal de ISS
    const espSimples = b2bFiscalClosingService.gerarEspelhoFiscalOSOuBordero(state, {
      osId: 'os_fisc_102',
      reterISS: true,
      reterIRRF: true,
      reterCSRF: true
    }).espelhoFiscal;

    assert.equal(espSimples.dispensaRetencaoFederalSimples, true);
    assert.equal(espSimples.retencoes.valorISSRetido, 100.00); // 5% de 2000
    assert.equal(espSimples.retencoes.valorIRRFRetido, 0); // dispensado no Simples
    assert.equal(espSimples.retencoes.valorCSRFRetido, 0); // dispensado no Simples
    assert.equal(espSimples.retencoes.totalRetencoesNaFonte, 100.00);
    assert.equal(espSimples.valorLiquidoAReceber, 3100.00); // 3200 - 100

    // Cenário B: Lucro Presumido com retenções federais e municipais completas
    const espPresumido = b2bFiscalClosingService.gerarEspelhoFiscalOSOuBordero(state, {
      osId: 'os_fisc_102',
      regimeTributario: 'lucro_presumido',
      reterISS: true,
      reterIRRF: true,
      reterCSRF: true
    }).espelhoFiscal;

    assert.equal(espPresumido.dispensaRetencaoFederalSimples, false);
    assert.equal(espPresumido.retencoes.valorISSRetido, 100.00); // 5% de 2000
    assert.equal(espPresumido.retencoes.valorIRRFRetido, 30.00); // 1.5% de 2000
    assert.equal(espPresumido.retencoes.valorCSRFRetido, 93.00); // 4.65% de 2000
    assert.equal(espPresumido.retencoes.totalRetencoesNaFonte, 223.00);
    assert.equal(espPresumido.valorLiquidoAReceber, 2977.00); // 3200 - 223
  });

  await t.test('1.3: Emissão de Notas, Ajuste Líquido do Borderô e Quitação via Conciliação Bancária', () => {
    const state = criarEstadoBase();
    b2bFiscalClosingService.configurarPerfilTributarioOficina(state, { regimeTributario: 'lucro_presumido' });

    const bordero = {
      id: 'bord_fisc_777',
      num: 'BORD-777',
      clienteId: 'cli_transp_alfa',
      clienteNome: 'Alfa Transportes',
      valorTotal: 5000.00,
      saldoDevedor: 5000.00,
      status: 'faturado',
      itensOS: [
        { totalPecas: 2000.00, totalMaoDeObra: 3000.00 }
      ]
    };
    state.borderos.push(bordero);

    // 1. Gera espelho fiscal com retenção de ISS (5% de 3000 = 150) e IRRF (1.5% de 3000 = 45) -> 195.00
    const espelho = b2bFiscalClosingService.gerarEspelhoFiscalOSOuBordero(state, {
      borderoId: 'bord_fisc_777',
      regimeTributario: 'lucro_presumido',
      reterISS: true,
      reterIRRF: true,
      reterCSRF: false
    }).espelhoFiscal;

    assert.equal(espelho.valorBrutoTotal, 5000.00);
    assert.equal(espelho.retencoes.totalRetencoesNaFonte, 195.00);
    assert.equal(espelho.valorLiquidoAReceber, 4805.00);

    // 2. Emite notas fiscais e sincroniza líquido no borderô
    const emissaoRes = b2bFiscalClosingService.emitirLoteNotasFiscaisB2B(state, espelho.id, {
      numeroNFePecas: '5501',
      serieNFePecas: '1',
      chaveAcessoNFe: '35261100000000000000550010000055011000055010',
      numeroNFSeServicos: '202601',
      codigoVerificacaoNFSe: 'ABC-789'
    });

    assert.equal(emissaoRes.ok, true);
    assert.equal(espelho.status, 'notas_emitidas');
    assert.equal(bordero.valorBrutoOriginal, 5000.00);
    assert.equal(bordero.totalRetencoesFiscais, 195.00);
    assert.equal(bordero.valorTotal, 4805.00);
    assert.equal(bordero.saldoDevedor, 4805.00);

    // 3. Bloqueio de dupla emissão
    assert.throws(
      () => b2bFiscalClosingService.emitirLoteNotasFiscaisB2B(state, espelho.id, { numeroNFePecas: '999' }),
      (err) => err.code === 'FISCAL_CLOSING_ALREADY_ISSUED'
    );

    // 4. Conciliação Bancária automatizada recebe exatamente o valor líquido depositado (R$ 4.805,00)
    const concilRes = conciliarExtratoBancarioAutomatico(state, {
      formato: 'api_json',
      lancamentos: [
        { data: '2026-11-11', tipo: 'CREDITO', valor: 4805.00, borderoRef: 'BORD-777' }
      ]
    });

    assert.equal(concilRes.valorTotalConciliadoCredito, 4805.00);
    assert.equal(bordero.status, 'pago');
    assert.equal(bordero.saldoDevedor, 0);
  });

  await t.test('1.4: Exportação de Lote Contábil da Competência e Formatação CSV', () => {
    const state = criarEstadoBase();
    state.fiscalClosings.push({
      id: 'fisc_1',
      status: 'notas_emitidas',
      dataEmissaoEspelho: '2026-11-05T10:00:00.000Z',
      baseCalculoPecasTotal: 4000.00,
      baseCalculoServicosTotal: 6000.00,
      valorBrutoTotal: 10000.00,
      retencoes: { valorISSRetido: 300.00, valorIRRFRetido: 90.00, valorCSRFRetido: 279.00, totalRetencoesNaFonte: 669.00 },
      valorLiquidoAReceber: 9331.00,
      notasEmitidas: { numeroNFePecas: '1001', numeroNFSeServicos: '5001' }
    });

    const exportacao = b2bFiscalClosingService.exportarLoteContabilFiscal(state, { competencia: '2026-11' });
    assert.equal(exportacao.ok, true);
    assert.equal(exportacao.quantidadeFechamentos, 1);
    assert.equal(exportacao.totalNFePecasEmitidas, 4000.00);
    assert.equal(exportacao.totalNFSeServicosEmitidas, 6000.00);
    assert.equal(exportacao.totalISSRetido, 300.00);
    assert.equal(exportacao.totalLiquidoFaturado, 9331.00);
    assert.ok(exportacao.csvExportString.includes('Competencia;Id_Fechamento;Cliente'));
    assert.ok(exportacao.csvExportString.includes('Valor_Liquido'));
    assert.ok(exportacao.csvExportString.includes('9331.00'));
  });

  await t.test('1.5: Endpoints REST e Componentes Visuais da Central Fiscal B2B', async () => {
    await initDB();
    const tenantId = 'tenant_sprint82_http';

    await mutateTenantState({ securityContext: { tenantId, actorId: 'admin_test', role: 'owner', permissions: ['*'] } }, (draft) => {
      draft.fiscalConfig = {};
      draft.fiscalClosings = [];
      draft.os = [{
        id: 'os_http_1',
        num: 888,
        clienteNome: 'Beta Log',
        pecas: [{ desc: 'Pino de Centro', valor: 500, qtd: 1, total: 500 }],
        servicos: [{ desc: 'Mão de obra embuchamento', valor: 1500 }],
        total: 2000
      }];
      draft.borderos = [];
      draft.contas = [];
    });

    const app = express();
    app.use(express.json());
    app.use((req, res, next) => {
      req.securityContext = { tenantId, actorId: 'admin_test', role: 'owner', permissions: ['*'] };
      next();
    });
    app.use(fiscalRoutes);

    const server = app.listen(0);
    const port = server.address().port;
    const base = `http://127.0.0.1:${port}`;

    try {
      // 1. PUT /perfil-tributario
      const putRes = await fetch(`${base}/api/fiscal/perfil-tributario`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ regimeTributario: 'lucro_presumido', aliquotaISSPadrao: 5 })
      });
      const putData = await putRes.json();
      assert.equal(putRes.status, 200);
      assert.equal(putData.success, true);

      // 2. POST /espelho-b2b/gerar
      const postEspRes = await fetch(`${base}/api/fiscal/espelho-b2b/gerar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ osId: 'os_http_1', reterISS: true })
      });
      const postEspData = await postEspRes.json();
      assert.equal(postEspRes.status, 200);
      assert.equal(postEspData.success, true);
      const espId = postEspData.espelhoFiscal.id;

      // 3. POST /espelho-b2b/:id/emitir-notas
      const postNotasRes = await fetch(`${base}/api/fiscal/espelho-b2b/${espId}/emitir-notas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ numeroNFePecas: '9001', numeroNFSeServicos: '9002' })
      });
      const postNotasData = await postNotasRes.json();
      assert.equal(postNotasRes.status, 200);
      assert.equal(postNotasData.success, true);

      // 4. GET /lote-contabil
      const getContabilRes = await fetch(`${base}/api/fiscal/lote-contabil`);
      const getContabilData = await getContabilRes.json();
      assert.equal(getContabilRes.status, 200);
      assert.equal(getContabilData.success, true);
      assert.equal(getContabilData.lote.quantidadeFechamentos, 1);

      // 5. Verificações de UI
      const painelHtml = globalThis.renderPainelFechamentoFiscalB2BHtml(getContabilData.lote);
      assert.ok(painelHtml.includes('Central de Fechamento Fiscal B2B'));

      const modalEspHtml = globalThis.modalGerarEspelhoFiscalB2BHtml();
      assert.ok(modalEspHtml.includes('Gerar Espelho Fiscal B2B'));

      const modalNotasHtml = globalThis.modalRegistrarEmissaoNotasHtml();
      assert.ok(modalNotasHtml.includes('Registrar Emissão de Notas'));

      assert.equal(typeof globalThis.abrirModalEspelhoFiscalB2B, 'function');
      assert.equal(typeof globalThis.gerarEspelhoFiscalB2BAction, 'function');
    } finally {
      server.close();
    }
  });
});
