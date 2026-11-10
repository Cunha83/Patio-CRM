'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const executiveDreBreakEvenService = require('../services/finance/executiveDreBreakEvenService');
const whatsappAgentSkillsService = require('../services/whatsapp/whatsappAgentSkillsService');

function criarEstadoBase() {
  return {
    tenantId: 'tenant_sprint74',
    clientes: [
      { id: 'cli_gama', nome: 'Transportadora Gama Express' },
      { id: 'cli_delta', nome: 'Delta Cargas Pesadas' }
    ],
    estoque: [
      { id: 'p_feixe_1', codigo: 'MOL-01', custoMedio: 1500.00, custo: 1500.00 },
      { id: 'p_grampo_1', codigo: 'GRA-01', custoMedio: 1000.00, custo: 1000.00 }
    ],
    os: [
      {
        id: 'os_gama_10',
        num: 7401,
        tenantId: 'tenant_sprint74',
        clienteId: 'cli_gama',
        clienteNome: 'Transportadora Gama Express',
        st: 'finalizada',
        fechamento: '2026-11-05T14:00:00Z',
        pago: true,
        dataPagamento: '2026-11-06T10:00:00Z',
        boxAtualId: 'box_pesado_1',
        totalServicos: 4000.00,
        totalPecas: 8000.00,
        total: 12000.00,
        servicos: [{ id: 'srv_1', desc: 'Arqueamento e Troca', valor: 4000.00, statusItem: 'aprovado' }],
        pecas: [{ id: 'pec_1', pecaId: 'p_feixe_1', desc: 'Feixe de Mola', qtd: 2, custoMedio: 1500.00, total: 8000.00, statusItem: 'aprovado' }] // CMP = 2 * 1500 = 3000
      },
      {
        id: 'os_delta_20',
        num: 7402,
        tenantId: 'tenant_sprint74',
        clienteId: 'cli_delta',
        clienteNome: 'Delta Cargas Pesadas',
        st: 'faturada',
        fechamento: '2026-11-08T16:00:00Z',
        pago: false,
        boxAtualId: 'box_pesado_2',
        totalServicos: 3000.00,
        totalPecas: 5000.00,
        total: 8000.00,
        servicos: [{ id: 'srv_2', desc: 'Alinhamento a Laser', valor: 3000.00, statusItem: 'aprovado' }],
        pecas: [{ id: 'pec_2', pecaId: 'p_grampo_1', desc: 'Kit Grampos', qtd: 2, custoMedio: 1000.00, total: 5000.00, statusItem: 'aprovado' }] // CMP = 2 * 1000 = 2000
      },
      {
        id: 'os_garantia_30',
        num: 7403,
        tenantId: 'tenant_sprint74',
        clienteId: 'cli_gama',
        tipoOS: 'garantia_retrabalho',
        st: 'finalizada',
        fechamento: '2026-11-09T10:00:00Z',
        total: 1500.00
      }
    ],
    reworkRecords: [
      {
        id: 'rew_1',
        tenantId: 'tenant_sprint74',
        clienteId: 'cli_gama',
        osOrigemId: 'os_gama_10',
        competencia: '2026-11',
        custoRetrabalho: 500.00
      }
    ],
    commissionPayrolls: [
      {
        id: 'folha_nov',
        tenantId: 'tenant_sprint74',
        competencia: '2026-11',
        status: 'fechada',
        resumo: { valorLiquidoPagar: 700.00, totalComissao: 700.00 }
      }
    ],
    contas: [
      { id: 'c_aluguel', tipo: 'pagar', cat: 'aluguel_galpao', valor: 1500.00, status: 'pago', vencimento: '2026-11-10' },
      { id: 'c_energia', tipo: 'pagar', cat: 'energia_eletrica', valor: 1000.00, status: 'pendente', vencimento: '2026-11-20' },
      { id: 'c_fornecedor', tipo: 'pagar', cat: 'fornecedor_pecas', valor: 4000.00, status: 'pago', vencimento: '2026-11-15' },
      { id: 'c_comissao', tipo: 'pagar', cat: 'comissao_mecanico', valor: 700.00, status: 'pago', vencimento: '2026-11-10' }
    ],
    borderoSettlements: [],
    borderos: [],
    whatsappAgentLogs: []
  };
}

test('Sprint 7.4 — Motor de DRE Gerencial Dual, Ponto de Equilíbrio e Rentabilidade', async (t) => {
  await t.test('1.1: DRE Dual (Regime de Competência vs. Regime de Caixa) e Gaps Financeiros', () => {
    const state = criarEstadoBase();
    const res = executiveDreBreakEvenService.apurarDreGerencialCompetenciaECaixa(state, {
      competencia: '2026-11',
      aliquotaImpostoPadrao: 8
    });

    assert.equal(res.ok, true);

    // 1. Regime de Competência (OS 10: 12.000 + OS 20: 8.000 = 20.000; OS Garantia é ignorada)
    const comp = res.regimeCompetencia;
    assert.equal(comp.receitaBrutaTotal, 20000.00);
    assert.equal(comp.receitaBrutaServicos, 7000.00);
    assert.equal(comp.receitaBrutaPecas, 13000.00);
    assert.equal(comp.impostosDeduzidos, 1600.00); // 8% de 20.000
    assert.equal(comp.receitaLiquida, 18400.00);
    assert.equal(comp.cmvPecasCMP, 5000.00); // 3000 + 2000
    assert.equal(comp.custoComissoesTecnicas, 700.00);
    assert.equal(comp.margemContribuicaoValor, 12700.00); // 18400 - 5000 - 700
    assert.equal(comp.indiceMargemContribuicaoPercentual, 63.50);
    assert.equal(comp.despesasFixasOperacionais, 2500.00); // 1500 aluguel + 1000 energia (ignora fornecedor_pecas e comissao)
    assert.equal(comp.lucroLiquidoOperacional, 10200.00); // 12700 - 2500
    assert.equal(comp.margemLiquidaPercentual, 51.00);

    // 2. Regime de Caixa (Apenas OS 10 paga = 12.000; despesa fixa paga = 1500 aluguel)
    const caixa = res.regimeCaixa;
    assert.equal(caixa.receitaBrutaTotal, 12000.00);
    assert.equal(caixa.impostosDeduzidos, 960.00); // 8% de 12.000
    assert.equal(caixa.receitaLiquida, 11040.00);
    assert.equal(caixa.cmvPecasCMP, 3000.00); // Peças da OS paga
    assert.equal(caixa.despesasFixasOperacionais, 1500.00); // Apenas contas pagas

    // 3. Diferença Competência vs. Caixa
    assert.equal(res.diferencaCompetenciaVsCaixa.gapReceita, 8000.00); // 20.000 - 12.000
    assert.ok(res.diferencaCompetenciaVsCaixa.gapLucro > 0);
  });

  await t.test('1.2: Ponto de Equilíbrio Contábil, Econômico e Classificação de Status', () => {
    const state = criarEstadoBase();

    // Cenário Superávit com meta de lucro R$ 5.000
    const pe1 = executiveDreBreakEvenService.calcularPontoEquilibrioOficina(state, {
      competencia: '2026-11',
      metaLucroDesejado: 5000.00
    });
    assert.equal(pe1.ok, true);
    // PE Contábil = 2500 / 0.635 = 3937.01
    assert.equal(pe1.pontoEquilibrioContabil, 3937.01);
    // PE Econômico = (2500 + 5000) / 0.635 = 11811.02
    assert.equal(pe1.pontoEquilibrioEconomico, 11811.02);
    // Receita de 20.000 supera PE econômico de 11.811,02
    assert.equal(pe1.statusEquilibrio, 'superavit_acima_meta');
    assert.ok(pe1.percentualAtingimentoPE > 100);

    // Cenário Déficit com receita bruta baixa
    state.os = [{ id: 'os_baixa', num: 7499, st: 'finalizada', fechamento: '2026-11-01', total: 2000.00, totalServicos: 2000.00, totalPecas: 0 }];
    const pe2 = executiveDreBreakEvenService.calcularPontoEquilibrioOficina(state, { competencia: '2026-11' });
    assert.equal(pe2.statusEquilibrio, 'deficit_abaixo_pe');
  });

  await t.test('1.3: Ranking de Rentabilidade por Frota B2B e por Box Pesado com dedução de retrabalho', () => {
    const state = criarEstadoBase();
    const rank = executiveDreBreakEvenService.apurarRankingRentabilidadeFrotasEBoxes(state, { competencia: '2026-11' });

    assert.equal(rank.ok, true);
    assert.equal(rank.rankingFrotas.length, 2);

    // Frota Gama: Receita 12.000 - CMP 3.000 - Retrabalho 500 = Lucro 8.500
    const frotaGama = rank.rankingFrotas.find(f => f.clienteId === 'cli_gama');
    assert.equal(frotaGama.receitaTotal, 12000.00);
    assert.equal(frotaGama.custoPecasCMP, 3000.00);
    assert.equal(frotaGama.custoRetrabalhoGarantia, 500.00);
    assert.equal(frotaGama.lucroBrutoFrota, 8500.00);

    // Frota Delta: Receita 8.000 - CMP 2.000 - Retrabalho 0 = Lucro 6.000
    const frotaDelta = rank.rankingFrotas.find(f => f.clienteId === 'cli_delta');
    assert.equal(frotaDelta.receitaTotal, 8000.00);
    assert.equal(frotaDelta.lucroBrutoFrota, 6000.00);

    // Ordenação decrescente: Gama primeiro (8.500 > 6.000)
    assert.equal(rank.rankingFrotas[0].clienteId, 'cli_gama');

    // Boxes: Box 1 (12.000) e Box 2 (8.000)
    assert.equal(rank.rankingBoxes.length, 2);
    assert.equal(rank.rankingBoxes[0].boxId, 'box_pesado_1');
    assert.equal(rank.rankingBoxes[0].receitaGeradaBox, 12000.00);
  });

  await t.test('1.4: Extensão da Skill de Analista Financeiro no WhatsApp com Guarda RBAC', () => {
    const state = criarEstadoBase();

    // Gerência solicita DRE
    const respGerente = whatsappAgentSkillsService.processarMensagemAgenteWhatsApp(state, {
      remetente: '5511999990000',
      perfilRemetente: 'gerencia',
      mensagem: 'Verônica, me passa o DRE e ponto de equilibrio do mês'
    });
    assert.equal(respGerente.skill, 'SKILL_ANALISTA_FINANCEIRO');
    assert.ok(respGerente.respostaTextoWhatsApp.includes('Regime de Competência'));
    assert.ok(respGerente.respostaTextoWhatsApp.includes('Ponto de Equilíbrio'));

    // Mecânico comum tentando acessar DRE deve ser bloqueado com 403
    assert.throws(() => {
      whatsappAgentSkillsService.processarMensagemAgenteWhatsApp(state, {
        remetente: '5511988881111',
        perfilRemetente: 'mecanico',
        mensagem: 'Qual o lucro do DRE da oficina?'
      });
    }, (err) => err.code === 'WHATSAPP_UNAUTHORIZED_MANAGEMENT_SKILL');
  });

  await t.test('1.5: Endpoints REST e Componentes Visuais do DRE & Break-Even', async () => {
    const express = require('express');
    const path = require('node:path');
    const rootDir = path.resolve(__dirname, '..');
    const { initDB } = require(path.join(rootDir, 'db'));
    const { mutateTenantState } = require(path.join(rootDir, 'lib', 'serverContext'));
    const routes = require('../routes/financeiro_dre_rentabilidade.routes');

    await initDB();
    const tenantId = 'tenant_sprint74_http';

    await mutateTenantState({
      securityContext: { tenantId, actorId: 'admin_dre', role: 'owner', permissions: ['*'] }
    }, (draft) => {
      const base = criarEstadoBase();
      Object.assign(draft, base);
      draft.tenantId = tenantId;
    });

    const app = express();
    app.use(express.json());
    app.use((req, res, next) => {
      req.securityContext = { tenantId, actorId: 'admin_dre', role: 'owner', permissions: ['*'] };
      next();
    });
    app.use(routes);

    const server = app.listen(0);
    const port = server.address().port;
    const baseUrl = `http://127.0.0.1:${port}`;

    try {
      // 1. GET dre-gerencial
      const resDre = await fetch(`${baseUrl}/api/financeiro/dre-gerencial?competencia=2026-11`);
      const dataDre = await resDre.json();
      assert.equal(resDre.status, 200);
      assert.equal(dataDre.success, true);
      assert.equal(dataDre.regimeCompetencia.receitaBrutaTotal, 20000.00);

      // 2. GET ponto-equilibrio
      const resPe = await fetch(`${baseUrl}/api/financeiro/ponto-equilibrio?competencia=2026-11&metaLucroDesejado=5000`);
      const dataPe = await resPe.json();
      assert.equal(resPe.status, 200);
      assert.equal(dataPe.pontoEquilibrioEconomico, 11811.02);

      // 3. GET rentabilidade-frotas-boxes
      const resRank = await fetch(`${baseUrl}/api/financeiro/rentabilidade-frotas-boxes?competencia=2026-11`);
      const dataRank = await resRank.json();
      assert.equal(resRank.status, 200);
      assert.equal(dataRank.rankingFrotas[0].clienteId, 'cli_gama');

      // 4. POST briefing-whatsapp
      const resBriefing = await fetch(`${baseUrl}/api/financeiro/dre-gerencial/briefing-whatsapp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ competencia: '2026-11' })
      });
      const dataBriefing = await resBriefing.json();
      assert.equal(resBriefing.status, 200);
      assert.ok(dataBriefing.respostaTextoWhatsApp.includes('DRE Gerencial'));

      // 5. Teste de renderização UI
      require('../js/modules/financeiro_dre_rentabilidade_ui');
      const htmlPainel = global.renderPainelDreERentabilidadeHtml({
        dre: dataDre,
        pontoEquilibrio: dataPe,
        rankingFrotas: dataRank.rankingFrotas,
        rankingBoxes: dataRank.rankingBoxes
      });
      assert.ok(htmlPainel.includes('DRE Gerencial Dual & Ponto de Equilíbrio'));
      assert.ok(htmlPainel.includes('data-act="abrir-simulador-ponto-equilibrio"'));

      const htmlModal = global.modalSimuladorMetaPontoEquilibrioHtml({ competencia: '2026-11', pontoEquilibrio: dataPe });
      assert.ok(htmlModal.includes('simulador-meta-lucro'));
      assert.ok(htmlModal.includes('data-act="confirmar-simulacao-ponto-equilibrio"'));
    } finally {
      server.close();
    }
  });
});
