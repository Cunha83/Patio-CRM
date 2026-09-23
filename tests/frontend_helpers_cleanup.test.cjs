'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// Carrega js/state.js em contexto isolado para teste dos helpers do frontend
function loadStateSandbox() {
  const code = fs.readFileSync(path.resolve(__dirname, '../js/state.js'), 'utf8');
  const sandbox = {
    window: {
      addEventListener: () => {},
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
  vm.runInContext(code, sandbox);
  return sandbox;
}

test('Frontend Helpers: Validação e Formatação Monetária Canônica (brl, parseBRL, isValidMoney)', async (t) => {
  const ctx = loadStateSandbox();
  const { brl, brlCurto, parseBRL, isValidMoney } = ctx;

  await t.test('1. isValidMoney valida tipos e rejeita coerções implícitas perigosas', () => {
    assert.equal(typeof isValidMoney, 'function', 'isValidMoney deve ser função');
    // Válidos
    assert.equal(isValidMoney(0), true);
    assert.equal(isValidMoney(150.75), true);
    assert.equal(isValidMoney(-20), true);
    assert.equal(isValidMoney('150.75'), true);
    assert.equal(isValidMoney('1.250,50'), true);
    assert.equal(isValidMoney('R$ 99,90'), true);

    // Inválidos (coerções perigosas em JS puro)
    assert.equal(isValidMoney(false), false, 'Booleano não deve ser considerado moeda');
    assert.equal(isValidMoney(true), false, 'Booleano não deve ser considerado moeda');
    assert.equal(isValidMoney([]), false, 'Array vazio não é moeda');
    assert.equal(isValidMoney([10]), false, 'Array com número não é moeda');
    assert.equal(isValidMoney({}), false, 'Objeto não é moeda');
    assert.equal(isValidMoney(''), false, 'String vazia não é moeda');
    assert.equal(isValidMoney('   '), false, 'String com espaços não é moeda');
    assert.equal(isValidMoney(null), false, 'null não é moeda');
    assert.equal(isValidMoney(undefined), false, 'undefined não é moeda');
    assert.equal(isValidMoney(NaN), false, 'NaN não é moeda');
  });

  await t.test('2. parseBRL converte formatos com vírgula ou ponto para número float canônico', () => {
    assert.equal(typeof parseBRL, 'function', 'parseBRL deve ser função');
    assert.equal(parseBRL('1.250,50'), 1250.5);
    assert.equal(parseBRL('R$ 1.250,50'), 1250.5);
    assert.equal(parseBRL('1250,50'), 1250.5);
    assert.equal(parseBRL('1250.50'), 1250.5);
    assert.equal(parseBRL(1250.5), 1250.5);
    assert.equal(parseBRL(0), 0);
    assert.equal(parseBRL('0'), 0);
    assert.equal(parseBRL('0,00'), 0);
    assert.equal(parseBRL(null), 0);
    assert.equal(parseBRL(false), 0);
    assert.equal(parseBRL('invalido'), 0);
  });

  await t.test('3. brl formata moeda em pt-BR com segurança contra tipos espúrios', () => {
    assert.equal(typeof brl, 'function', 'brl deve ser função');
    const res1250 = brl(1250.5);
    assert.ok(res1250.includes('1.250,50') || res1250.includes('1250,50'));

    // Entradas falsy ou inválidas retornam R$ 0,00 de forma segura sem crash
    const resZero = brl(0);
    assert.ok(resZero.includes('0,00'));
    const resNull = brl(null);
    assert.ok(resNull.includes('0,00'));
    const resArray = brl([100]);
    assert.ok(resArray.includes('0,00'), 'Array [100] não deve converter para R$ 100,00');
  });
});
