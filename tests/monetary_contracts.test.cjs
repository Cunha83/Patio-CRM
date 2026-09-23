'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { isValidMoney, parseBRL, brl, formatBRL } = require('../js/state');

test('Contrato Monetário: pt-BR, numéricos de API e formatação canônica', async (t) => {
  await t.test('1. isValidMoney rejeita tipos espúrios e formatos corrompidos', () => {
    assert.equal(isValidMoney(null), false, 'null não é dinheiro válido');
    assert.equal(isValidMoney(undefined), false, 'undefined não é dinheiro válido');
    assert.equal(isValidMoney(false), false, 'false não é dinheiro');
    assert.equal(isValidMoney(true), false, 'true não é dinheiro');
    assert.equal(isValidMoney([]), false, 'array vazio não é dinheiro');
    assert.equal(isValidMoney([12]), false, 'array [12] não é dinheiro');
    assert.equal(isValidMoney({}), false, 'objeto não é dinheiro');
    assert.equal(isValidMoney(''), false, 'string vazia não é dinheiro');
    assert.equal(isValidMoney('   '), false, 'string de espaços não é dinheiro');
    assert.equal(isValidMoney('abc'), false, 'letras não são dinheiro');
    assert.equal(isValidMoney('1.250.000.00'), false, 'dois pontos finais com formato quebrado');
    assert.equal(isValidMoney('12,34,56'), false, 'múltiplas vírgulas');
  });

  await t.test('2. isValidMoney aceita números finitos e formatos pt-BR ou canônicos', () => {
    assert.equal(isValidMoney(1250), true);
    assert.equal(isValidMoney(1250.5), true);
    assert.equal(isValidMoney(0), true);
    assert.equal(isValidMoney('0'), true);
    assert.equal(isValidMoney('1.250.000'), true);
    assert.equal(isValidMoney('1.250.000,00'), true);
    assert.equal(isValidMoney('1.250,50'), true);
    assert.equal(isValidMoney('1250.50'), true);
    assert.equal(isValidMoney('1,250'), true);
    assert.equal(isValidMoney('R$ 1.250,50'), true);
    assert.equal(isValidMoney('R$1250.50'), true);
  });

  await t.test('3. parseBRL analisa corretamente milhares e decimais sem truncamento', () => {
    // Milhares com múltiplos pontos pt-BR
    assert.equal(parseBRL('1.250.000'), 1250000, '"1.250.000" deve resultar em 1250000 e NUNCA 1.25');
    assert.equal(parseBRL('1.250.000,00'), 1250000, '"1.250.000,00" deve resultar em 1250000');
    assert.equal(parseBRL('1.250.000,50'), 1250000.5, '"1.250.000,50" deve resultar em 1250000.5');

    // Padrão pt-BR milhar + centavos
    assert.equal(parseBRL('1.250,50'), 1250.5, '"1.250,50" deve resultar em 1250.50');
    assert.equal(parseBRL('R$ 1.250,50'), 1250.5);

    // Formato canônico da API float com ponto decimal
    assert.equal(parseBRL('1250.50'), 1250.5, '"1250.50" (float de API) deve resultar em 1250.5');
    assert.equal(parseBRL('1250.5'), 1250.5);
    assert.equal(parseBRL(1250.5), 1250.5);

    // Decimal com vírgula pt-BR
    assert.equal(parseBRL('1,250'), 1.25, '"1,250" deve resultar em 1.25');
    assert.equal(parseBRL('1,5'), 1.5);
    assert.equal(parseBRL('0,75'), 0.75);

    // Zero e vazios
    assert.equal(parseBRL(0), 0);
    assert.equal(parseBRL('0'), 0);
    assert.equal(parseBRL(''), 0);
    assert.equal(parseBRL('invalid'), 0);
  });

  await t.test('4. formatBRL formata valores para padrão moeda brasileiro', () => {
    const formatted = formatBRL(1250.5);
    // Deve conter R$ e 1.250,50 (espaço regular ou non-breaking)
    assert.ok(formatted.includes('1.250,50'), 'Formatação deve conter 1.250,50');
    assert.ok(formatted.includes('R$'), 'Formatação deve conter símbolo R$');
  });
});
