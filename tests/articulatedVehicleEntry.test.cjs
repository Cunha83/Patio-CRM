'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { initDB, closeDB } = require('../db');
const { getState, persistState } = require('../lib/repository/stateRepository');

const {
  processarEntradaVeiculo,
  resolverConjuntoArticulado,
  segregarItensPorVeiculo
} = require('../services/vehicleEntryService');

test('P0: Conjuntos Articulados (Cavalo + Carreta) no Check-in e Ordem de Serviço', async (t) => {
  await initDB();
  const criarEstadoMock = () => ({
    versao: 1,
    os: [],
    veiculos: [],
    clientes: [
      { id: 'cli_frota_1', nome: 'Transportadora TransRodonaves', fone: '11988887777', doc: '12345678000199', tipo: 'frotista' }
    ],
    boxes: [
      { id: 'box_1', nome: 'Box 1 Pesados', tipo: 'Vala' },
      { id: 'box_2', nome: 'Box 2 Molas', tipo: 'Pátio' }
    ],
    auditoria: [],
    intakeSessions: [],
    preOS: []
  });

  await t.test('1. Entrada de conjunto articulado via parâmetros explícitos (Cavalo + Carreta)', async () => {
    const tid = 'tenant_articulado_1';
    const state = criarEstadoMock();
    await persistState(tid, state);
    const reqMock = { headers: { 'x-tenant-id': tid } };

    const resultado = await processarEntradaVeiculo({
      placa: 'BRA2E19',
      placaCarreta: 'PRT9F88',
      clienteNome: 'Transportadora TransRodonaves',
      clienteFone: '11988887777',
      textoOriginal: 'Entrada para revisão de suspensão do cavalo e troca de molas da carreta',
      servicos: [
        { id: 'srv_1', nome: 'Embuchamento manga de eixo dianteira', valor: 800, alvo: 'cavalo', placaAlvo: 'BRA2E19' },
        { id: 'srv_2', nome: 'Troca de mola mestra e contra-mestre 3º eixo', valor: 1200, alvo: 'carreta', placaAlvo: 'PRT9F88' }
      ],
      req: reqMock
    });

    assert.ok(resultado.novaOS, 'OS deve ser gerada');
    const os = resultado.novaOS;

    // Verifica vínculo do conjunto na OS
    assert.ok(os.conjunto, 'OS deve conter objeto conjunto');
    assert.equal(os.conjunto.isArticulado, true, 'isArticulado deve ser true');
    assert.equal(os.conjunto.cavalo.placa, 'BRA2E19', 'Placa do cavalo deve conferir');
    assert.equal(os.conjunto.implementos.length, 1, 'Deve ter 1 implemento');
    assert.equal(os.conjunto.implementos[0].placa, 'PRT9F88', 'Placa da carreta deve conferir');

    // Ambos os veículos devem ser cadastrados e vinculados ao mesmo cliente
    const stateAtualizado = await getState(tid);
    const vCavalo = stateAtualizado.veiculos.find(v => v.placa === 'BRA2E19');
    const vCarreta = stateAtualizado.veiculos.find(v => v.placa === 'PRT9F88');
    assert.ok(vCavalo, 'Cavalo deve estar cadastrado em state.veiculos');
    assert.ok(vCarreta, 'Carreta deve estar cadastrada em state.veiculos');
    assert.equal(vCavalo.cli, 'cli_frota_1', 'Cavalo vinculado ao cliente da frota');
    assert.equal(vCarreta.cli, 'cli_frota_1', 'Carreta vinculada ao cliente da frota');

    // Verifica segregação dos serviços
    assert.equal(os.servicos.length >= 2, true);
    const srvCavalo = os.servicos.find(s => s.id === 'srv_1');
    const srvCarreta = os.servicos.find(s => s.id === 'srv_2');
    assert.equal(srvCavalo.alvo, 'cavalo');
    assert.equal(srvCarreta.alvo, 'carreta');

    // Verifica que a mensagem de WhatsApp menciona ambos os veículos
    assert.ok(resultado.respostaWhatsApp.includes('BRA2E19'), 'WhatsApp deve citar placa do cavalo');
    assert.ok(resultado.respostaWhatsApp.includes('PRT9F88'), 'WhatsApp deve citar placa da carreta');
  });

  await t.test('2. Detecção automática de conjunto articulado em texto natural', async () => {
    const state = criarEstadoMock();
    const reqMock = { headers: { 'x-tenant-id': 'tenant_articulado_2' }, app: { locals: { state } } };

    const resultado = await processarEntradaVeiculo({
      placa: 'KMT3344',
      clienteNome: 'Expresso Cargas Pesadas',
      textoOriginal: 'Chegou o cavalo KMT3344 engatado com a carreta RTY8899 com quebra de grampos',
      servicos: [],
      req: reqMock
    });

    assert.ok(resultado.novaOS);
    const os = resultado.novaOS;
    assert.ok(os.conjunto);
    assert.equal(os.conjunto.isArticulado, true);
    assert.equal(os.conjunto.cavalo.placa, 'KMT3344');
    assert.equal(os.conjunto.implementos[0].placa, 'RTY8899');
  });

  await t.test('3. Função segregarItensPorVeiculo separa totais e listas de itens com precisão', () => {
    const osExemplo = {
      id: 'os_art_99',
      num: '1099',
      conjunto: {
        isArticulado: true,
        cavalo: { placa: 'ABC1234' },
        implementos: [{ placa: 'XYZ5678' }]
      },
      servicos: [
        { id: 's1', nome: 'Alinhamento de Eixo Dianteiro', valor: 300, alvo: 'cavalo' },
        { id: 's2', nome: 'Reaperto de Grampos de Carreta', valor: 150, alvo: 'carreta' }
      ],
      pecas: [
        { id: 'p1', nome: 'Bucha de Bronze Manga', valor: 200, alvo: 'cavalo' },
        { id: 'p2', nome: 'Grampo 3/4 x 3.1/4', valor: 180, alvo: 'carreta' }
      ]
    };

    const segregado = segregarItensPorVeiculo(osExemplo);
    assert.ok(segregado.cavalo, 'Deve ter grupo do cavalo');
    assert.ok(segregado.implementos['XYZ5678'], 'Deve ter grupo da carreta');

    assert.equal(segregado.cavalo.total, 500, 'Total do cavalo: 300 + 200 = 500');
    assert.equal(segregado.implementos['XYZ5678'].total, 330, 'Total da carreta: 150 + 180 = 330');
    assert.equal(segregado.totalGeral, 830, 'Total consolidado: 830');
  });

  await t.test('4. Retrocompatibilidade: Entrada de veículo simples (sem carreta) preserva formato padrão', async () => {
    const state = criarEstadoMock();
    const reqMock = { headers: { 'x-tenant-id': 'tenant_articulado_3' }, app: { locals: { state } } };

    const resultado = await processarEntradaVeiculo({
      placa: 'SIM1234',
      clienteNome: 'Auto Ônibus Central',
      textoOriginal: 'Troca de amortecedores',
      req: reqMock
    });

    assert.ok(resultado.novaOS);
    assert.equal(resultado.novaOS.conjunto?.isArticulado, false, 'Veículo simples não é articulado');
    assert.equal(resultado.veiculo.placa, 'SIM1234');
  });
});
