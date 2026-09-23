const { test } = require('node:test');
const assert = require('node:assert/strict');
const voiceActionEngine = require('../services/voiceActionEngine');

test('voiceActionEngine: abertura de OS, contexto contínuo, correção de km, alto risco e auditoria', async () => {
  const state = {
    os: [
      { id: 'os_base', num: 1040, box: 'b1', vei: 'v_base', cli: 'c_base', st: 'executando', abertura: '2026-09-01', km: 200000, queixa: 'Revisão preventiva' }
    ],
    veiculos: [
      { id: 'v_base', cli: 'c_base', placa: 'ABC1234', marca: 'Scania', modelo: 'R 450', ano: '2020', km: 200000, cor: 'Branco', tipo: 'Cavalo Mecânico' }
    ],
    clientes: [
      { id: 'c_base', nome: 'Transportadora Padrão', fone: '11999990000' }
    ],
    boxes: [
      { id: 'b1', nome: 'Box 01' }
    ],
    servicos: [],
    pecas: [],
    auditoria: []
  };

  const voiceContext = { canal: 'web', remetente: 'Valdir (Mecânico Chefe)', role: 'tenant_admin', permissions: ['*'], tenantId: 'default' };

  // 1. Check-in de entrada informal por fala natural
  const falaCheckIn = "João, chegou aqui um Onix branco 2021 do Carlos. Tá com 82 mil quilômetros. Cliente falou que quando freia, faz um barulho na roda dianteira direita e o volante tá vibrando";
  const res1 = await voiceActionEngine.interpretarEExecutar({
    input: { text: falaCheckIn },
    context: voiceContext,
    state
  });

  assert.equal(res1.ok, true);
  assert.equal(res1.acao, 'abrir_os');
  assert.equal(res1.numOS, 1041);

  const osAberta = state.os.find(o => o.id === res1.osId);
  assert.ok(osAberta);
  assert.equal(osAberta.km, 82000);
  assert.equal(osAberta.servicos.length, 0, 'Sintoma não pode virar serviço cobrado');
  assert.equal(osAberta.pecas.length, 0, 'Sintoma não pode virar peça cobrada');

  const veiculo = state.veiculos.find(v => v.id === osAberta.vei);
  assert.equal(veiculo.modelo, 'Onix');
  assert.equal(veiculo.cor, 'Branco');
  assert.equal(veiculo.ano, '2021');

  // 2. Continuidade de contexto sem repetir placa
  const res2 = await voiceActionEngine.interpretarEExecutar({
    input: { text: 'coloca também que o ar não tá gelando' },
    context: { ...voiceContext, activeOsId: osAberta.id },
    state
  });
  assert.equal(res2.ok, true);
  assert.equal(res2.acao, 'adicionar_reclamacao');
  assert.equal(res2.osId, osAberta.id);
  assert.match(osAberta.queixa, /gelando|ar/i);

  // 3. Correção por voz
  const res3 = await voiceActionEngine.interpretarEExecutar({
    input: { text: 'não, a quilometragem é 128 mil, não 120' },
    context: { ...voiceContext, activeOsId: osAberta.id },
    state
  });
  assert.equal(res3.ok, true);
  assert.equal(res3.acao, 'corrigir_campo');
  assert.equal(osAberta.km, 128000);
  assert.equal(veiculo.km, 128000);

  // 4. Ação de alto risco
  const res4 = await voiceActionEngine.interpretarEExecutar({
    input: { text: `excluir a os #${osAberta.num}` },
    context: { ...voiceContext, activeOsId: osAberta.id },
    state
  });
  assert.equal(res4.pendenteConfirmacao, true);
  assert.equal(res4.risco, 'alto');
  assert.ok(res4.token);

  // Confirmação
  const res5 = await voiceActionEngine.interpretarEExecutar({
    input: { text: 'confirmar' },
    context: { ...voiceContext, confirmToken: res4.token, confirmadoPeloUsuario: true },
    state
  });
  assert.equal(res5.ok, true);
  assert.equal(res5.acao, 'excluir_os');
  assert.equal(state.os.some(o => o.id === osAberta.id), false);

  // 5. Auditoria
  assert.ok(state.auditoria.length >= 4);
  assert.ok(state.auditoria.some(a => a.intencao === 'abrir_os'));
});
