'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { initDB } = require('../db');
const { persistState, getState } = require('../lib/repository/stateRepository');

const commissionService = require('../services/commissionService');

test('P0: Motor de Comissionamento de Mecânicos e Relatório de Fechamento', async (t) => {
  await initDB();

  const criarEstadoMock = () => ({
    versao: 1,
    cfg: {
      comissoes: {
        percentualPadrao: 10, // 10% sobre mão de obra
        baseCalculo: 'mao_de_obra_liquida',
        deduzRetrabalho: true,
        rateioPadrao: 'proporcional_horas'
      }
    },
    workers: [
      {
        id: 'wrk_joao',
        tenantId: 'tenant_comissao_1',
        nome: 'João Mecânico Mestre',
        funcao: 'Mecânico Suspensão',
        custoHora: 80,
        comissaoPercentual: 12, // 12% customizado
        ativo: true
      },
      {
        id: 'wrk_pedro',
        tenantId: 'tenant_comissao_1',
        nome: 'Pedro Auxiliar',
        funcao: 'Ajudante',
        custoHora: 40,
        comissaoPercentual: 8, // 8% customizado
        ativo: true
      },
      {
        id: 'wrk_carlos',
        tenantId: 'tenant_comissao_1',
        nome: 'Carlos Alinhador',
        funcao: 'Alinhador',
        custoHora: 70,
        comissaoPercentual: null, // usa percentual padrão (10%)
        ativo: true
      }
    ],
    os: [
      {
        id: 'os_101',
        num: '101',
        tenantId: 'tenant_comissao_1',
        cli: 'cli_1',
        vei: 'vei_1',
        st: 'finalizada',
        fechamento: '2026-11-05',
        desc: 0,
        possivelGarantia: false,
        servicos: [
          {
            id: 'srv_1',
            nome: 'Troca de Feixe de Molas Traseiro',
            qtd: 1,
            valor: 1000,
            status: 'aprovado',
            workerId: 'wrk_joao' // Atribuição direta
          }
        ],
        pecas: [
          { id: 'peca_1', nome: 'Feixe de Mola Completo', qtd: 1, valor: 2500 }
        ]
      },
      {
        id: 'os_102',
        num: '102',
        tenantId: 'tenant_comissao_1',
        cli: 'cli_2',
        vei: 'vei_2',
        st: 'finalizada',
        fechamento: '2026-11-06',
        desc: 100, // Desconto geral de R$ 100
        servicos: [
          {
            id: 'srv_2',
            nome: 'Embuchamento de Manga de Eixo (Dupla Execução)',
            qtd: 1,
            valor: 1000,
            status: 'aprovado'
            // Rateio via laborEntries
          }
        ],
        pecas: []
      },
      {
        id: 'os_103',
        num: '103',
        tenantId: 'tenant_comissao_1',
        cli: 'cli_1',
        vei: 'vei_1',
        st: 'finalizada',
        fechamento: '2026-11-07',
        isRetrabalho: true, // OS de garantia/retrabalho
        servicos: [
          {
            id: 'srv_3',
            nome: 'Ajuste de Balancim em Garantia',
            qtd: 1,
            valor: 400,
            status: 'aprovado',
            workerId: 'wrk_joao'
          }
        ],
        pecas: []
      }
    ],
    laborEntries: [
      // OS 102 teve 3 horas de João e 1 hora de Pedro (Total 4h)
      {
        id: 'lab_1',
        tenantId: 'tenant_comissao_1',
        osId: 'os_102',
        serviceItemId: 'srv_2',
        workerId: 'wrk_joao',
        type: 'produtivo',
        status: 'concluido',
        totalSeconds: 3 * 3600 // 3 horas
      },
      {
        id: 'lab_2',
        tenantId: 'tenant_comissao_1',
        osId: 'os_102',
        serviceItemId: 'srv_2',
        workerId: 'wrk_pedro',
        type: 'produtivo',
        status: 'concluido',
        totalSeconds: 1 * 3600 // 1 hora
      }
    ],
    auditoria: []
  });

  await t.test('1. Cálculo de comissão com percentual customizado por mecânico (OS 101)', () => {
    const state = criarEstadoMock();
    const os = state.os.find(o => o.id === 'os_101');

    const comissaoOS = commissionService.calcularComissaoOS({
      os,
      state,
      tenantId: 'tenant_comissao_1'
    });

    assert.ok(comissaoOS);
    assert.equal(comissaoOS.totalMaoDeObra, 1000);
    assert.equal(comissaoOS.totalComissao, 120, '12% de R$ 1.000 = R$ 120 para João');

    assert.equal(comissaoOS.itens.length, 1);
    assert.equal(comissaoOS.itens[0].workerId, 'wrk_joao');
    assert.equal(comissaoOS.itens[0].valorComissao, 120);
    assert.equal(comissaoOS.itens[0].percentualAplicado, 12);
  });

  await t.test('2. Rateio proporcional de comissão entre 2 mecânicos na mesma OS (OS 102)', () => {
    const state = criarEstadoMock();
    const os = state.os.find(o => o.id === 'os_102');

    const comissaoOS = commissionService.calcularComissaoOS({
      os,
      state,
      tenantId: 'tenant_comissao_1'
    });

    assert.ok(comissaoOS);
    // Base líquida: R$ 1000 - R$ 100 desconto = R$ 900
    assert.equal(comissaoOS.totalMaoDeObra, 900);

    // João fez 3h de 4h (75%) -> Base João: R$ 675. Com 12%: 675 * 0.12 = R$ 81.00
    // Pedro fez 1h de 4h (25%) -> Base Pedro: R$ 225. Com 8%: 225 * 0.08 = R$ 18.00
    // Total comissão OS: 81.00 + 18.00 = R$ 99.00
    const itemJoao = comissaoOS.itens.find(i => i.workerId === 'wrk_joao');
    const itemPedro = comissaoOS.itens.find(i => i.workerId === 'wrk_pedro');

    assert.ok(itemJoao, 'Item de João deve existir no rateio');
    assert.ok(itemPedro, 'Item de Pedro deve existir no rateio');
    assert.equal(itemJoao.valorComissao, 81);
    assert.equal(itemPedro.valorComissao, 18);
    assert.equal(comissaoOS.totalComissao, 99);
  });

  await t.test('3. Tratamento de OS de garantia/retrabalho (OS 103 tem comissão zerada)', () => {
    const state = criarEstadoMock();
    const os = state.os.find(o => o.id === 'os_103');

    const comissaoOS = commissionService.calcularComissaoOS({
      os,
      state,
      tenantId: 'tenant_comissao_1'
    });

    assert.ok(comissaoOS);
    assert.equal(comissaoOS.isRetrabalho, true);
    assert.equal(comissaoOS.totalComissao, 0, 'OS de retrabalho com deduzRetrabalho=true tem comissão zero');
    assert.equal(comissaoOS.itens[0].motivoBloqueio, 'retrabalho_garantia');
  });

  await t.test('4. Relatório consolidado de fechamento quinzenal/mensal por colaborador', () => {
    const state = criarEstadoMock();

    const fechamento = commissionService.gerarFechamentoComissoes({
      state,
      tenantId: 'tenant_comissao_1',
      dataInicio: '2026-11-01',
      dataFim: '2026-11-15'
    });

    assert.ok(fechamento);
    assert.equal(fechamento.periodo.inicio, '2026-11-01');
    assert.equal(fechamento.periodo.fim, '2026-11-15');
    assert.equal(fechamento.resumoGeral.totalComissoes, 219, 'Total: 120 (OS 101) + 99 (OS 102) + 0 (OS 103) = 219');

    // Colaborador João
    const fJoao = fechamento.colaboradores.find(c => c.workerId === 'wrk_joao');
    assert.ok(fJoao);
    assert.equal(fJoao.totalComissao, 201, 'João deve receber 120 + 81 = 201');
    assert.equal(fJoao.totalServicos, 3);
    assert.equal(fJoao.detalhesOS.length, 3);

    // Colaborador Pedro
    const fPedro = fechamento.colaboradores.find(c => c.workerId === 'wrk_pedro');
    assert.ok(fPedro);
    assert.equal(fPedro.totalComissao, 18, 'Pedro deve receber 18');
  });

  await t.test('5. Consulta individual do colaborador via obterResumoComissoesColaborador', () => {
    const state = criarEstadoMock();

    const resumo = commissionService.obterResumoComissoesColaborador({
      state,
      tenantId: 'tenant_comissao_1',
      workerId: 'wrk_pedro',
      dataInicio: '2026-11-01',
      dataFim: '2026-11-15'
    });

    assert.ok(resumo);
    assert.equal(resumo.worker.nome, 'Pedro Auxiliar');
    assert.equal(resumo.totalComissao, 18);
    assert.equal(resumo.detalhesOS.length, 1);
    assert.equal(resumo.detalhesOS[0].osNum, '102');
  });
});

