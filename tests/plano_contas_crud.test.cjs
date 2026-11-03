'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizarPlanoDeContas } = require('../lib/core');
const financialEngine = require('../services/financialEngine');

test('Plano de Contas - Evolução do Schema, Normalização e Regras de Negócio', async (t) => {

  await t.test('1. normalizarPlanoDeContas com entrada vazia/nula gera árvore contábil padrão', () => {
    const res = normalizarPlanoDeContas([]);
    assert.equal(res.length, 8);
    assert.equal(res[0].codigo, '1');
    assert.equal(res[0].nome, 'Receitas Operacionais');
    assert.equal(res[0].classe, 'sintetica');
    assert.equal(res[0].tipo, 'receita');

    const servicos = res.find(c => c.codigo === '1.01');
    assert.ok(servicos);
    assert.equal(servicos.nome, 'Serviços');
    assert.equal(servicos.classe, 'analitica');
    assert.equal(servicos.paiId, 'pc_1');

    const despesas = res.find(c => c.codigo === '2');
    assert.ok(despesas);
    assert.equal(despesas.classe, 'sintetica');
    assert.equal(despesas.tipo, 'despesa');
  });

  await t.test('2. normalizarPlanoDeContas com array legado de strings mapeia padrão e preserva categorias extras', () => {
    const legado = ['Serviços', 'Peças', 'Pessoal', 'Fixas', 'Impostos', 'Outros', 'Marketing Digital', 'Combustível Frota'];
    const res = normalizarPlanoDeContas(legado);

    assert.equal(res.length, 10);
    const mkt = res.find(c => c.nome === 'Marketing Digital');
    assert.ok(mkt);
    assert.equal(mkt.codigo, '2.05');
    assert.equal(mkt.paiId, 'pc_2');
    assert.equal(mkt.classe, 'analitica');
    assert.equal(mkt.tipo, 'despesa');

    const comb = res.find(c => c.nome === 'Combustível Frota');
    assert.ok(comb);
    assert.equal(comb.codigo, '2.06');
    assert.equal(comb.paiId, 'pc_2');
  });

  await t.test('3. DRE integrado: calcularDRESimplificado aceita novo schema e computa entradas e saídas', () => {
    const state = {
      cfg: {
        planoDeContas: normalizarPlanoDeContas()
      },
      movimentos: [
        { id: 'm1', data: '2026-10-29', valor: 1500, tipo: 'entrada', cat: 'Serviços' },
        { id: 'm2', data: '2026-10-29', valor: 800, tipo: 'entrada', cat: 'Peças' },
        { id: 'm3', data: '2026-10-29', valor: 600, tipo: 'saida', cat: 'Pessoal' },
        { id: 'm4', data: '2026-10-29', valor: 200, tipo: 'saida', cat: 'Fixas' },
        { id: 'm5', data: '2026-10-29', valor: 100, subtipo: 'sangria' } // tesouraria neutra
      ]
    };

    const dre = financialEngine.calcularDRESimplificado(state, { filtro: 'hoje', dataRef: '2026-10-29' });
    assert.equal(dre.receitaOperacionalBruta, 2300);
    assert.equal(dre.despesasOperacionais, 800);
    assert.equal(dre.resultadoOperacionalLiquido, 1500);
    assert.equal(dre.movimentacaoTesourariaNeutra.totalSangrias, 100);
  });

  await t.test('4. DRE integrado: classifica por categoria do Plano de Contas caso tipo não esteja explícito', () => {
    const state = {
      cfg: {
        planoDeContas: normalizarPlanoDeContas()
      },
      movimentos: [
        { id: 'm1', data: '2026-10-29', valor: 1200, cat: 'Serviços' }, // deve classificar como receita
        { id: 'm2', data: '2026-10-29', valor: 450, cat: 'Fixas' }       // deve classificar como despesa
      ]
    };

    const dre = financialEngine.calcularDRESimplificado(state, { filtro: 'hoje', dataRef: '2026-10-29' });
    assert.equal(dre.receitaOperacionalBruta, 1200);
    assert.equal(dre.despesasOperacionais, 450);
    assert.equal(dre.resultadoOperacionalLiquido, 750);
  });
});

