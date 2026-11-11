'use strict';

/**
 * tests/sprint92_box_terminal_evidence_smart_dispatch.test.cjs
 * 
 * Suíte de Testes da Sprint 9.2:
 * 1. Matriz de especialidades e motor de despacho inteligente de mecânicos.
 * 2. Registro de evidência técnica de peça condenada no box com inserção na OS.
 * 3. Bloqueio automático de box por gargalo e geração de token de aprovação frotista.
 * 4. Ciclo E2E: Aprovação externa do frotista liberando o gargalo e destravando o box.
 * 5. Painel do terminal operacional do box, rotas REST e UI.
 * Teto Modular: <= 350 linhas
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const express = require('express');

const dispatchService = require('../services/patio/mechanicSmartDispatchBoxService');
const externalApprovalService = require('../services/quotation/externalFleetApprovalService');
const terminalRouter = require('../routes/patio_terminal_box_despacho.routes');
const { initDB } = require('../db');
const { mutateTenantState } = require('../lib/serverContext');

require('../js/modules/patio_terminal_box_ui');
require('../js/modules/patio_terminal_box_actions');

function criarEstadoMock() {
  return {
    tenantId: 'tenant_teste',
    mechanicProfiles: [],
    patioBoxes: [
      { id: 'box_01', codigo: 'B01', nome: 'Box 01 - Suspensão', status: 'livre', tenantId: 'tenant_teste' },
      { id: 'box_02', codigo: 'B02', nome: 'Box 02 - Freios', status: 'livre', tenantId: 'tenant_teste' }
    ],
    patioBottlenecks: [], timeLogs: [], reworkRecords: [], externalApprovalTokens: [], boxCondemnedPartEvidences: [],
    os: [{
      id: 'os_1001', num: 1001, tenantId: 'tenant_teste', clienteId: 'cli_transp_sul',
      clienteNome: 'Transportadora Sulamericana Ltda', placa: 'BRA2E19', boxAtualId: 'box_01', status: 'em_andamento',
      servicos: [{ id: 'srv_mola_1', desc: 'Revisão Feixe de Molas', status: 'aprovado', horasPadrao: 2.5, total: 350.00 }],
      pecas: [{ id: 'pec_grampo_1', desc: 'Grampo 3/4', qtd: 4, preco: 85.00, total: 340.00, statusAprovacao: 'aprovado' }],
      total: 690.00
    }]
  };
}

test('Sprint 9.2 — Terminal Operacional de Box, Evidência Técnica & Despacho Inteligente', async (t) => {

  await t.test('1. Matriz de Especialidades & Recomendação de Mecânico Ideal para o Serviço', () => {
    const state = criarEstadoMock();

    dispatchService.configurarPerfilEspecialidadesMecanico(state, {
      mecanicoId: 'mec_carlos', nome: 'Carlos Mecânico Senior',
      especialidades: { suspensao_pesada: 3, freios_ar: 1 }, ativo: true
    });
    dispatchService.configurarPerfilEspecialidadesMecanico(state, {
      mecanicoId: 'mec_joao', nome: 'João Especialista',
      especialidades: { suspensao_pesada: 3, freios_ar: 3 }, ativo: true
    });
    dispatchService.configurarPerfilEspecialidadesMecanico(state, {
      mecanicoId: 'mec_andre', nome: 'André Aprendiz',
      especialidades: { suspensao_pesada: 1 }, ativo: true
    });

    state.timeLogs.push({ id: 'tl_ocupado', mecanicoId: 'mec_joao', status: 'em_execucao', dataInicio: new Date().toISOString() });
    state.reworkRecords.push({ id: 'rw_1', mecanicoId: 'mec_andre', status: 'aberto' }, { id: 'rw_2', mecanicoId: 'mec_andre', status: 'aberto' });

    const recomendacao = dispatchService.recomendarMecanicoIdealParaServico(state, { especialidadeRequerida: 'suspensao_pesada' });

    assert.ok(recomendacao);
    assert.strictEqual(recomendacao.ranking.length, 3);
    assert.strictEqual(recomendacao.melhorRecomendacao.mecanicoId, 'mec_carlos');
    assert.strictEqual(recomendacao.melhorRecomendacao.disponivelImediato, true);
    assert.strictEqual(recomendacao.melhorRecomendacao.nivelEspecialidade, 3);
    assert.ok(recomendacao.melhorRecomendacao.scoreDespacho > recomendacao.ranking[1].scoreDespacho);

    const despacho = dispatchService.despacharServicoBoxInteligente(state, {
      tenantId: 'tenant_teste', osId: 'os_1001', servicoId: 'srv_mola_1',
      especialidadeRequerida: 'suspensao_pesada', boxId: 'box_01', horasPadrao: 2.5
    });

    assert.strictEqual(despacho.sucesso, true);
    assert.strictEqual(despacho.mecanicoId, 'mec_carlos');
    assert.strictEqual(despacho.boxId, 'box_01');

    const box = state.patioBoxes.find(b => b.id === 'box_01');
    assert.strictEqual(box.status, 'ocupado');
    assert.ok(state.timeLogs.find(l => l.mecanicoId === 'mec_carlos' && l.status === 'em_execucao'));
  });

  await t.test('2. Registro de Evidência Técnica de Peça Condenada na Desmontagem & Parada de Box', () => {
    const state = criarEstadoMock();

    const resultadoEvidencia = dispatchService.registrarEvidenciaPecaCondenadaBox(state, {
      tenantId: 'tenant_teste', osId: 'os_1001', boxId: 'box_01',
      mecanicoId: 'mec_carlos', mecanicoNome: 'Carlos Mecânico Senior',
      pecaDescricao: 'Lâmina Mestra Feixe Trincada', codigoFabricante: 'MB-940325-TR',
      quantidade: 2, valorUnitario: 450.00, motivoCondenacao: 'fadiga_material_trinca_olhete',
      fotos: ['https://storage.oficina.com/evidencias/os1001_lamina_trinca.jpg'],
      observacao: 'Trinca estrutural detectada na desmontagem.'
    });

    assert.strictEqual(resultadoEvidencia.sucesso, true);
    assert.ok(resultadoEvidencia.evidenciaId);
    assert.ok(resultadoEvidencia.tokenAprovacao);
    assert.ok(resultadoEvidencia.linkAprovacao.includes(resultadoEvidencia.tokenAprovacao));
    assert.strictEqual(resultadoEvidencia.valorTotalAdicional, 900.00);

    const os = state.os.find(o => o.id === 'os_1001');
    const pecaCondenada = os.pecas.find(p => p.origemCondenacaoBox === true);
    assert.ok(pecaCondenada);
    assert.strictEqual(pecaCondenada.statusAprovacao, 'pendente_frotista');
    assert.strictEqual(pecaCondenada.total, 900.00);

    const box = state.patioBoxes.find(b => b.id === 'box_01');
    assert.strictEqual(box.status, 'bloqueado_gargalo');
    assert.strictEqual(box.gargaloAtivoId, resultadoEvidencia.gargaloId);

    const gargalo = state.patioBottlenecks.find(g => g.id === resultadoEvidencia.gargaloId);
    assert.ok(gargalo);
    assert.strictEqual(gargalo.status, 'aberto');
  });

  await t.test('3. Ciclo Ponta a Ponta: Desmontagem -> Bloqueio de Box -> Aprovação Frotista -> Destravamento', () => {
    const state = criarEstadoMock();

    const evRes = dispatchService.registrarEvidenciaPecaCondenadaBox(state, {
      tenantId: 'tenant_teste', osId: 'os_1001', boxId: 'box_01',
      mecanicoId: 'mec_carlos', mecanicoNome: 'Carlos Mecânico Senior',
      pecaDescricao: 'Grampos Deformados', codigoFabricante: 'GRP-M20-280',
      quantidade: 4, valorUnitario: 60.00, motivoCondenacao: 'rosca_espanada_alongamento'
    });

    let box = state.patioBoxes.find(b => b.id === 'box_01');
    assert.strictEqual(box.status, 'bloqueado_gargalo');

    const os = state.os.find(o => o.id === 'os_1001');
    const pecaPendente = os.pecas.find(p => p.origemCondenacaoBox);

    const aprovacaoRes = externalApprovalService.submeterDecisaoExternaFrotista(state, evRes.tokenAprovacao, {
      aprovadorNome: 'Marcos Frota Diretor', aprovadorDocumento: '123.456.789-00',
      decisoesItens: [{ id: pecaPendente.id, tipo: 'peca', statusItem: 'aprovado' }]
    });

    assert.strictEqual(aprovacaoRes.ok, true);

    const pecaAtualizada = os.pecas.find(p => p.id === pecaPendente.id);
    assert.strictEqual(pecaAtualizada.status, 'aprovado');
    assert.strictEqual(pecaAtualizada.statusAprovacao, 'aprovado');

    box = state.patioBoxes.find(b => b.id === 'box_01');
    assert.strictEqual(box.status, 'ocupado');
    assert.strictEqual(box.gargaloAtivoId, null);
  });

  await t.test('4. Painel Terminal Operacional de Box & Fila Consolidada', () => {
    const state = criarEstadoMock();

    dispatchService.configurarPerfilEspecialidadesMecanico(state, {
      mecanicoId: 'mec_carlos', nome: 'Carlos Mecânico Senior',
      especialidades: { suspensao_pesada: 3 }
    });

    dispatchService.despacharServicoBoxInteligente(state, {
      tenantId: 'tenant_teste', osId: 'os_1001', servicoId: 'srv_mola_1',
      mecanicoIdEscolhido: 'mec_carlos', boxId: 'box_01'
    });

    const terminalData = dispatchService.listarFilaTerminalOperacionalBox(state, {
      boxId: 'box_01', mecanicoId: 'mec_carlos'
    });

    assert.ok(terminalData.box);
    assert.strictEqual(terminalData.box.codigo, 'B01');
    assert.ok(terminalData.mecanico);
    assert.ok(terminalData.osAtiva);
    assert.strictEqual(terminalData.osAtiva.num, 1001);
    assert.ok(terminalData.apontamentoAtivo);
  });

  await t.test('5. Endpoints REST e Componentes Visuais do Terminal e Despacho', async () => {
    await initDB();
    const tenantId = 'tenant_e2e_box';

    await mutateTenantState({ securityContext: { tenantId, actorId: 'coord_1', role: 'owner', permissions: ['*'] } }, (draft) => {
      draft.tenantId = tenantId;
      draft.patioBoxes = [{ id: 'box_e2e_1', codigo: 'B01', nome: 'Box Teste E2E', status: 'livre', tenantId }];
      draft.os = [{
        id: 'os_e2e_1', num: 9001, tenantId, placa: 'TEST999', status: 'em_andamento',
        servicos: [{ id: 'srv_1', desc: 'Troca Mola', total: 200, status: 'aprovado' }], pecas: []
      }];
      draft.mechanicProfiles = []; draft.timeLogs = []; draft.patioBottlenecks = []; draft.boxCondemnedPartEvidences = [];
    });

    const app = express();
    app.use(express.json());
    app.use((req, res, next) => {
      req.headers['x-tenant-id'] = tenantId;
      req.securityContext = { tenantId, actorId: 'coord_1', role: 'owner', permissions: ['*'] };
      req.user = { id: 'coord_1', nome: 'Coordenador Teste' };
      next();
    });
    app.use(terminalRouter);

    const server = app.listen(0);
    const port = server.address().port;
    const base = `http://127.0.0.1:${port}`;

    try {
      // 1. PUT especialidades
      const resPut = await fetch(`${base}/api/patio/mecanicos/mec_test_1/especialidades`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome: 'Mecânico Teste', especialidades: { suspensao_pesada: 3 } })
      });
      const dataPut = await resPut.json();
      assert.strictEqual(resPut.status, 200);
      assert.strictEqual(dataPut.success, true);

      // 2. GET recomendar
      const resRec = await fetch(`${base}/api/patio/despacho-inteligente/recomendar?especialidadeRequerida=suspensao_pesada`);
      const dataRec = await resRec.json();
      assert.strictEqual(resRec.status, 200);
      assert.strictEqual(dataRec.success, true);
      assert.ok(dataRec.ranking.length >= 1);

      // 3. POST despachar
      const resDisp = await fetch(`${base}/api/patio/despacho-inteligente/alocar`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ osId: 'os_e2e_1', servicoId: 'srv_1', mecanicoIdEscolhido: 'mec_test_1', boxId: 'box_e2e_1' })
      });
      const dataDisp = await resDisp.json();
      assert.strictEqual(resDisp.status, 200);
      assert.strictEqual(dataDisp.success, true);

      // 4. POST evidencia
      const resEv = await fetch(`${base}/api/patio/terminal-box/evidencia-peca-condenada`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ osId: 'os_e2e_1', boxId: 'box_e2e_1', pecaDescricao: 'Pino Quebrado', valorUnitario: 80.00, quantidade: 1 })
      });
      const dataEv = await resEv.json();
      assert.strictEqual(resEv.status, 200);
      assert.strictEqual(dataEv.success, true);
      assert.ok(dataEv.tokenAprovacao);

      // 5. GET painel
      const resPainel = await fetch(`${base}/api/patio/terminal-box/painel?boxId=box_e2e_1`);
      const dataPainel = await resPainel.json();
      assert.strictEqual(resPainel.status, 200);
      assert.strictEqual(dataPainel.success, true);

      // 6. Componentes Visuais
      const htmlPainel = globalThis.renderPainelTerminalBoxEDespachoHtml(dataPainel.dados);
      assert.ok(htmlPainel.includes('Terminal Operacional'));
      assert.ok(htmlPainel.includes('Pino Quebrado'));

      const htmlEvModal = globalThis.modalRegistrarEvidenciaPecaCondenadaHtml({ osId: 'os_e2e_1' });
      assert.ok(htmlEvModal.includes('Condenação de Peça na Desmontagem'));

      const htmlMecModal = globalThis.modalConfigurarEspecialidadeMecanicoHtml({ mecanicoId: 'mec_test_1' });
      assert.ok(htmlMecModal.includes('Matriz de Especialidades'));
    } finally {
      server.close();
    }
  });
});
