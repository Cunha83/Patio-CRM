'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadPatioSandbox(perfilAtivo = 'mecanico') {
  const stateCode = fs.readFileSync(path.resolve(__dirname, '../js/state.js'), 'utf8');
  const iconsCode = fs.readFileSync(path.resolve(__dirname, '../js/icons.js'), 'utf8');
  const patioCode = fs.readFileSync(path.resolve(__dirname, '../js/patio.js'), 'utf8');

  let windowPrintCalled = false;
  let writtenHtml = '';

  const sandbox = {
    window: {
      addEventListener: () => {},
      isPerfilMecanico: () => perfilAtivo === 'mecanico',
      open: () => ({
        document: {
          write: (h) => { writtenHtml += h; },
          close: () => {}
        }
      }),
      crypto: {
        getRandomValues: (arr) => {
          for (let i = 0; i < arr.length; i++) arr[i] = Math.floor(Math.random() * 256);
          return arr;
        }
      }
    },
    document: {
      getElementById: () => null
    },
    localStorage: {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {}
    },
    console,
    module: { exports: {} },
    exports: {}
  };

  vm.createContext(sandbox);
  vm.runInContext(stateCode, sandbox);
  vm.runInContext(iconsCode, sandbox);
  vm.runInContext(patioCode, sandbox);

  // Inicializa estado lexical no contexto da VM
  vm.runInContext(`
    S = sementes();
    S.ui = S.ui || {};
    S.ui.perfilAtivo = '${perfilAtivo}';
  `, sandbox);

  return { sandbox, getWrittenHtml: () => writtenHtml };
}

test('Patio Module: Blindagem de Dados Financeiros para Perfil Mecânico', async (t) => {
  await t.test('1. cardOS não exibe valores financeiros no perfil mecânico', () => {
    const { sandbox } = loadPatioSandbox('mecanico');
    const osExemplo = {
      id: 'os_teste_01',
      num: 9001,
      vei: 'v1',
      cli: 'c1',
      st: 'executando',
      box: 'box1',
      queixa: 'Vazamento de ar no freio',
      servicos: [{ id: 's1', nome: 'Revisão Válvula', qtd: 1, valor: 450.00 }],
      pecas: [{ id: 'p1', nome: 'Válvula Relé', qtd: 1, valor: 380.00 }]
    };

    const cardMecanico = sandbox.cardOS(osExemplo, { id: 'box1', nome: 'Box 01 — Pesados', tipo: 'Geral' });
    assert.ok(cardMecanico.includes('OS 9001'), 'Card deve exibir número da OS');
    assert.ok(cardMecanico.includes('Vazamento'), 'Card deve exibir informações operacionais');
    assert.ok(!cardMecanico.includes('830,00'), 'Card mecânico NÃO deve exibir total da OS');
    assert.ok(!cardMecanico.includes('class="val"'), 'Card mecânico NÃO deve ter bloco .val');
    assert.ok(!cardMecanico.includes('R$'), 'Card mecânico NÃO deve conter R$');
  });

  await t.test('2. cardOS exibe valores financeiros quando perfil é gestor ou consultor', () => {
    const { sandbox } = loadPatioSandbox('gestor');
    const osExemplo = {
      id: 'os_teste_02',
      num: 9002,
      vei: 'v1',
      cli: 'c1',
      st: 'executando',
      box: 'box1',
      servicos: [{ id: 's1', nome: 'Serviço', qtd: 1, valor: 500.00 }],
      pecas: [{ id: 'p1', nome: 'Peça', qtd: 1, valor: 500.00 }]
    };

    const cardGestor = sandbox.cardOS(osExemplo, { id: 'box1', nome: 'Box 01', tipo: 'Geral' });
    assert.ok(cardGestor.includes('class="val"'), 'Gestor deve visualizar classe .val');
    assert.ok(cardGestor.includes('1.000,00'), 'Gestor deve visualizar total monetário');
  });

  await t.test('3. folhaFaturarOS bloqueia acesso e não expõe valores para perfil mecânico', () => {
    const { sandbox } = loadPatioSandbox('mecanico');
    vm.runInContext(`
      S.os = [{
        id: 'os_fat_01',
        num: 9003,
        vei: 'v1',
        cli: 'c1',
        st: 'executando',
        servicos: [{ id: 's1', valor: 800 }],
        pecas: []
      }];
      S.ui.osAtiva = 'os_fat_01';
    `, sandbox);

    const html = sandbox.folhaFaturarOS();
    assert.ok(html.includes('Acesso Restrito') || html.includes('restrito'), 'folhaFaturarOS deve bloquear perfil mecânico');
    assert.ok(!html.includes('R$'), 'folhaFaturarOS não deve conter cifras monetárias');
    assert.ok(!html.includes('800,00'), 'folhaFaturarOS não deve expor total de 800,00 para mecânico');
  });

  await t.test('4. imprimirOS gera Via de Oficina sem colunas ou totais financeiros para perfil mecânico', () => {
    const { sandbox, getWrittenHtml } = loadPatioSandbox('mecanico');
    const osImpressao = {
      id: 'os_imp_01',
      num: 9004,
      vei: 'v1',
      cli: 'c1',
      abertura: '2026-09-17',
      prev: '2026-09-18',
      servicos: [{ id: 's1', nome: 'Regulagem Eletrônica', qtd: 1, valor: 650.00 }],
      pecas: [{ id: 'p1', nome: 'Sensor de Pressão', qtd: 1, valor: 420.00 }]
    };

    sandbox.imprimirOS(osImpressao);
    const html = getWrittenHtml();
    assert.ok(html.includes('VIA DE OFICINA') || html.includes('VIA MECÂNICA'), 'Título deve indicar via técnica');
    assert.ok(html.includes('Regulagem Eletrônica'), 'Deve conter descrição do serviço');
    assert.ok(html.includes('Sensor de Pressão'), 'Deve conter descrição da peça');
    assert.ok(!html.includes('650,00'), 'Não deve conter valor do serviço');
    assert.ok(!html.includes('420,00'), 'Não deve conter valor da peça');
    assert.ok(!html.includes('TOTAL GERAL'), 'Não deve conter bloco de TOTAL GERAL');
  });
});
