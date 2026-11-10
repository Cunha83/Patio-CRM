'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const patioBoxManagementService = require('../services/patio/patioBoxManagementService');
const patioBottleneckSlaService = require('../services/patio/patioBottleneckSlaService');

function criarEstadoMock() {
  return {
    os: [
      { id: 'os_pesada_101', num: 6301, tenantId: 'tenant_patio_63', placa: 'MOL4S20', clienteNome: 'Expresso Linha Pesada', st: 'em_andamento', servicos: [{ id: 's1', valor: 800 }], pecas: [] },
      { id: 'os_pesada_102', num: 6302, tenantId: 'tenant_patio_63', placa: 'TRU9K99', clienteNome: 'Logística Rodoviária', st: 'em_andamento', servicos: [{ id: 's2', valor: 1200 }], pecas: [] }
    ],
    patioBoxes: [], boxAllocations: [], patioBottlenecks: [], auditoria: []
  };
}

describe('Sprint 6.3 — Gestão Visual de Boxes Pesados, Ocupação & SLA de Gargalos', () => {
  const tenantId = 'tenant_patio_63';

  test('1.1: Cadastro de boxes e bloqueio de duplicidade BOX_CODE_ALREADY_EXISTS', () => {
    const state = criarEstadoMock();
    const box1 = patioBoxManagementService.cadastrarBoxPatio(state, { tenantId, codigo: 'BOX-MOLAS-01', nome: 'Box 01 Molas' });
    assert.equal(box1.ok, true);
    assert.equal(box1.box.status, 'livre');
    assert.throws(() => patioBoxManagementService.cadastrarBoxPatio(state, { tenantId, codigo: 'BOX-MOLAS-01' }), /BOX_CODE_ALREADY_EXISTS/i);
  });

  test('1.2: Alocação em box e bloqueios BOX_ALREADY_OCCUPIED e OS_ALREADY_ALLOCATED_IN_BOX', () => {
    const state = criarEstadoMock();
    const b1 = patioBoxManagementService.cadastrarBoxPatio(state, { tenantId, codigo: 'B1' }).box.id;
    const b2 = patioBoxManagementService.cadastrarBoxPatio(state, { tenantId, codigo: 'B2' }).box.id;

    const aloc1 = patioBoxManagementService.alocarVeiculoBox(state, { tenantId, boxId: b1, osId: 'os_pesada_101', timestamp: '2026-11-10T08:00:00.000Z' });
    assert.equal(aloc1.ok, true);
    assert.equal(state.patioBoxes.find(b => b.id === b1).status, 'ocupado');

    assert.throws(() => patioBoxManagementService.alocarVeiculoBox(state, { tenantId, boxId: b1, osId: 'os_pesada_102' }), /BOX_ALREADY_OCCUPIED/i);
    assert.throws(() => patioBoxManagementService.alocarVeiculoBox(state, { tenantId, boxId: b2, osId: 'os_pesada_101' }), /OS_ALREADY_ALLOCATED_IN_BOX/i);
  });

  test('1.3: Transferência atômica entre boxes com cômputo de permanência', () => {
    const state = criarEstadoMock();
    const b1 = patioBoxManagementService.cadastrarBoxPatio(state, { tenantId, codigo: 'B1' }).box.id;
    const b2 = patioBoxManagementService.cadastrarBoxPatio(state, { tenantId, codigo: 'B2' }).box.id;

    patioBoxManagementService.alocarVeiculoBox(state, { tenantId, boxId: b1, osId: 'os_pesada_101', timestamp: '2026-11-10T08:00:00.000Z' });
    const res = patioBoxManagementService.transferirVeiculoBox(state, { tenantId, osId: 'os_pesada_101', boxDestinoId: b2, timestamp: '2026-11-10T10:00:00.000Z' });

    assert.equal(res.ok, true);
    assert.equal(state.patioBoxes.find(b => b.id === b1).status, 'livre');
    assert.equal(state.patioBoxes.find(b => b.id === b2).status, 'ocupado');
    assert.equal(state.boxAllocations.find(a => a.boxId === b1).tempoOcupacaoMinutos, 120);
  });

  test('1.4: Liberação de box com validação opcional de checklist de qualidade', () => {
    const state = criarEstadoMock();
    const b = patioBoxManagementService.cadastrarBoxPatio(state, { tenantId, codigo: 'B1' }).box.id;
    patioBoxManagementService.alocarVeiculoBox(state, { tenantId, boxId: b, osId: 'os_pesada_101', timestamp: '2026-11-10T09:00:00.000Z' });

    assert.throws(() => patioBoxManagementService.liberarBoxPatio(state, { tenantId, boxId: b, exigirInspecaoQualidade: true }), /QUALITY_INSPECTION_REQUIRED_OR_FAILED/i);
    state.os[0].inspecaoQualidade = { status: 'aprovada', aprovado: true };

    const resLib = patioBoxManagementService.liberarBoxPatio(state, { tenantId, boxId: b, exigirInspecaoQualidade: true, timestamp: '2026-11-10T11:00:00.000Z' });
    assert.equal(resLib.ok, true);
    assert.equal(resLib.tempoOcupacaoMinutos, 120);
    assert.equal(state.patioBoxes.find(x => x.id === b).status, 'livre');
  });

  test('2.1: Registro de gargalo de parada e encerramento com SLA', () => {
    const state = criarEstadoMock();
    const box = patioBoxManagementService.cadastrarBoxPatio(state, { tenantId, codigo: 'B1' }).box;
    patioBoxManagementService.alocarVeiculoBox(state, { tenantId, boxId: box.id, osId: 'os_pesada_101', timestamp: '2026-11-10T08:00:00.000Z' });

    const g = patioBottleneckSlaService.registrarGargaloParadaOS(state, { tenantId, osId: 'os_pesada_101', motivoParada: 'aguardando_peca', timestamp: '2026-11-10T09:00:00.000Z' });
    assert.equal(g.box.status, 'bloqueado_gargalo');
    assert.equal(g.gargalo.slaMaximoMinutos, 120);

    const enc = patioBottleneckSlaService.encerrarGargaloParadaOS(state, g.gargalo.id, { timestamp: '2026-11-10T11:30:00.000Z' });
    assert.equal(enc.gargalo.estourouSla, true);
    assert.equal(enc.box.status, 'ocupado');
  });

  test('2.2: Semáforo de SLA dinâmico e consolidação de KPIs de ocupação e ofensores', () => {
    const state = criarEstadoMock();
    patioBoxManagementService.cadastrarBoxPatio(state, { tenantId, codigo: 'B1' });
    const b2 = patioBoxManagementService.cadastrarBoxPatio(state, { tenantId, codigo: 'B2' }).box;
    patioBoxManagementService.alocarVeiculoBox(state, { tenantId, boxId: b2.id, osId: 'os_pesada_102', timestamp: '2026-11-10T08:00:00.000Z' });

    patioBottleneckSlaService.registrarGargaloParadaOS(state, { tenantId, osId: 'os_pesada_102', motivoParada: 'aguardando_aprovacao_frotista', timestamp: '2026-11-10T08:30:00.000Z' });
    const kpis = patioBottleneckSlaService.calcularIndicadoresOcupacaoEGargalos(state, { tenantId, timestampReferencia: '2026-11-10T10:30:00.000Z' });

    assert.equal(kpis.taxaOcupacaoPercentual, 50);
    assert.equal(kpis.boxesBloqueadosGargalo, 1);
    assert.equal(kpis.gargalosEstouradosCount, 1);
    assert.equal(kpis.gargalosAtivos[0].statusSla, 'sla_estourado');
    assert.equal(kpis.tempoMedioParadaPorMotivo.aguardando_aprovacao_frotista.count, 1);
  });

  test('3.1: Endpoints REST (Cadastro, Alocação, Transferência, Liberação e Gargalos)', async () => {
    const { initDB } = require('../db');
    await initDB();
    const express = require('express');
    const http = require('http');
    const { mountRoutes } = require('../routes/index.js');
    const { getDefaultState, persistState } = require('../lib/repository/stateRepository');

    const app = express();
    app.use(express.json());
    const apiTenantId = 'tenant_http_sprint63';
    await persistState(apiTenantId, {
      ...getDefaultState(apiTenantId),
      os: [{ id: 'os_http_63', num: 6380, tenantId: apiTenantId, placa: 'BOX3E80', st: 'em_andamento', inspecaoQualidade: { status: 'aprovada', aprovado: true } }],
      patioBoxes: [], boxAllocations: [], patioBottlenecks: [], auditoria: []
    });

    app.use((req, res, next) => {
      req.securityContext = { tenantId: apiTenantId, actorId: 'admin_patio', role: 'admin', permissions: ['*'], channel: 'api' };
      next();
    });
    mountRoutes(app);

    const server = http.createServer(app);
    await new Promise(resolve => server.listen(0, resolve));
    const baseUrl = `http://127.0.0.1:${server.address().port}`;

    try {
      const resB1 = await (await fetch(`${baseUrl}/api/patio/boxes`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ codigo: 'B-HTTP-1' }) })).json();
      const resB2 = await (await fetch(`${baseUrl}/api/patio/boxes`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ codigo: 'B-HTTP-2' }) })).json();
      assert.equal((await (await fetch(`${baseUrl}/api/patio/boxes/mapa`)).json()).total, 2);

      await fetch(`${baseUrl}/api/patio/boxes/alocar`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ boxId: resB1.box.id, osId: 'os_http_63' }) });
      const resGarg = await (await fetch(`${baseUrl}/api/patio/gargalos/registrar`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ osId: 'os_http_63', motivoParada: 'aguardando_peca' }) })).json();
      assert.equal((await (await fetch(`${baseUrl}/api/patio/gargalos/indicadores`)).json()).boxesBloqueadosGargalo, 1);

      await fetch(`${baseUrl}/api/patio/gargalos/${resGarg.gargalo.id}/encerrar`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ resolucao: 'Resolvido' }) });
      await fetch(`${baseUrl}/api/patio/boxes/transferir`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ osId: 'os_http_63', boxDestinoId: resB2.box.id }) });
      const resLib = await fetch(`${baseUrl}/api/patio/boxes/liberar`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ boxId: resB2.box.id, exigirInspecaoQualidade: true }) });
      assert.equal(resLib.status, 200);
    } finally {
      await new Promise(resolve => server.close(resolve));
    }
  });

  test('4.1: Componentes visuais de UI e actions de Boxes e Gargalos', () => {
    const uiPath = path.resolve(__dirname, '../js/modules/patio_boxes_gargalos_ui.js');
    const actionsPath = path.resolve(__dirname, '../js/modules/patio_boxes_gargalos_actions.js');
    assert.ok(fs.existsSync(uiPath) && fs.existsSync(actionsPath));

    const ctx = {
      window: {},
      document: { querySelectorAll: () => [], getElementById: () => null, addEventListener: () => {} },
      S: { os: [{ id: 'os_1', num: 1, placa: 'AAA', st: 'em_andamento' }], patioBoxes: [{ id: 'b1', codigo: 'B01', status: 'livre' }] },
      fecharModalGenerico: () => {}, abrirModalGenerico: () => {}, torrar: () => {}, prompt: () => 'ok', confirm: () => true, fetch: () => {}
    };
    ctx.globalThis = ctx; ctx.window = ctx;

    vm.runInNewContext(fs.readFileSync(uiPath, 'utf8'), ctx);
    vm.runInNewContext(fs.readFileSync(actionsPath, 'utf8'), ctx);

    assert.equal(typeof ctx.renderMapaBoxesEGargalosHtml, 'function');
    assert.equal(typeof ctx.modalAlocarTransferirBoxHtml, 'function');
    assert.equal(typeof ctx.modalRegistrarGargaloParadaHtml, 'function');
    assert.equal(typeof ctx.abrirModalAlocarBox, 'function');
    assert.equal(typeof ctx.alocarVeiculoBoxAction, 'function');
    assert.equal(typeof ctx.transferirVeiculoBoxAction, 'function');
    assert.equal(typeof ctx.liberarBoxPatioAction, 'function');
    assert.equal(typeof ctx.abrirModalGargaloParada, 'function');
    assert.equal(typeof ctx.registrarGargaloParadaAction, 'function');
    assert.equal(typeof ctx.encerrarGargaloParadaAction, 'function');

    const htmlMapa = ctx.renderMapaBoxesEGargalosHtml({
      boxes: [{ id: 'b1', codigo: 'BOX-MOLAS-01', nome: 'Molas', status: 'bloqueado_gargalo', gargaloAtivo: { motivoParada: 'aguardando_peca', statusSla: 'sla_estourado' } }],
      indicadores: { totalBoxes: 1, boxesBloqueadosGargalo: 1, taxaOcupacaoPercentual: 100, tempoMedioParadaPorMotivo: { aguardando_peca: { count: 1, tempoMedioMinutos: 90 } } }
    });
    assert.ok(htmlMapa.includes('BOX-MOLAS-01'));
    assert.ok(htmlMapa.includes('Parada / Gargalo'));
    assert.ok(htmlMapa.includes('SLA Estourado'));

    const htmlModalAloc = ctx.modalAlocarTransferirBoxHtml({ box: { id: 'b1' }, osList: [{ id: 'os_1', num: 1, placa: 'AAA' }] });
    assert.ok(htmlModalAloc.includes('Alocar Veículo no Box'));

    const htmlModalGarg = ctx.modalRegistrarGargaloParadaHtml({ osId: 'os_1', boxId: 'b1' });
    assert.ok(htmlModalGarg.includes('Registrar Parada / Gargalo no Box'));
    assert.ok(htmlModalGarg.includes('aguardando_peca'));
  });
});
