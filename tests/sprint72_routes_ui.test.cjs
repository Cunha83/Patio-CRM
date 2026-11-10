'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const express = require('express');

const rootDir = path.resolve(__dirname, '..');
const { initDB } = require(path.join(rootDir, 'db'));
const { mutateTenantState } = require(path.join(rootDir, 'lib', 'serverContext'));
const routes = require('../routes/suprimentos_whatsapp_conciliacao.routes');

function buildMockApp(tenantId) {
  const app = express();
  app.use(express.json());

  app.use((req, res, next) => {
    req.securityContext = {
      tenantId,
      actorId: 'admin_test',
      role: 'owner',
      permissions: ['*']
    };
    next();
  });

  app.use(routes);
  return app;
}

test('Sprint 7.2 — Endpoints REST de Suprimentos, Conciliação e Agente WhatsApp', async (t) => {
  await initDB();
  const tenantId = 'tenant_sprint72_http';

  async function resetState() {
    await mutateTenantState({
      securityContext: {
        tenantId,
        actorId: 'admin_test',
        role: 'owner',
        permissions: ['*']
      }
    }, (draft) => {
      draft.pecas = [
        { id: 'peca_10', codigo: 'MOL-10', descricao: 'Feixe de Mola Dianteiro', qtd: 2, custoMedio: 200, custo: 200, ultimoCustoCompra: 200 }
      ];
      draft.os = [
        {
          id: 'os_http_1',
          num: 7210,
          tenantId,
          st: 'em_andamento',
          placa: 'LOG4A20',
          boxAtualId: 'box_h1',
          pecas: [{ pecaId: 'peca_10', qtd: 2, valor: 400, custo: 200, total: 800 }]
        }
      ];
      draft.patioBoxes = [
        { id: 'box_h1', nome: 'Box 01', status: 'bloqueado_gargalo', osAtualId: 'os_http_1', gargaloAtivoId: 'gar_h1' }
      ];
      draft.patioBottlenecks = [
        { id: 'gar_h1', osId: 'os_http_1', boxId: 'box_h1', motivoParada: 'aguardando_peca', status: 'aberto', inicioParadaEm: '2026-11-10T10:00:00Z', slaMaximoMinutos: 60 }
      ];
      draft.borderos = [
        { id: 'bord_h1', num: 'BORD-7210', tenantId, status: 'faturado', valorTotal: 3000, saldoDevedor: 3000, osIds: ['os_http_1'], dataVencimento: '2026-11-30' }
      ];
      draft.contas = [];
      draft.purchaseOrders = [];
      draft.bankReconciliations = [];
      draft.receptionQueue = [];
      draft.whatsappAgentLogs = [];
    });
  }

  await t.test('4.1: POST pedidos-compra, receber-nf e GET margem-real', async () => {
    await resetState();
    const app = buildMockApp(tenantId);
    const server = app.listen(0);
    const port = server.address().port;
    const baseUrl = `http://127.0.0.1:${port}`;

    try {
      // 1. Criar pedido
      const resPedido = await fetch(`${baseUrl}/api/suprimentos/pedidos-compra`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fornecedorNome: 'Metalúrgica Suspensor',
          osVinculadaId: 'os_http_1',
          gargaloVinculadoId: 'gar_h1',
          itens: [{ pecaId: 'peca_10', codigo: 'MOL-10', quantidade: 2, custoUnitario: 300 }]
        })
      });
      assert.equal(resPedido.status, 200);
      const jsonPedido = await resPedido.json();
      assert.equal(jsonPedido.success, true);
      assert.equal(jsonPedido.pedido.valorTotalPedido, 600);

      // 2. Receber NF
      const resNF = await fetch(`${baseUrl}/api/suprimentos/pedidos-compra/${jsonPedido.pedido.id}/receber-nf`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ numeroNF: 'NF-72001' })
      });
      assert.equal(resNF.status, 200);
      const jsonNF = await resNF.json();
      assert.equal(jsonNF.success, true);
      assert.equal(jsonNF.pedido.status, 'recebido');

      // 3. Consultar Margem Real (Anterior 2x200 + Nova 2x300 = 1000/4 = CMP 250. Venda = 800. Custo = 2x250 = 500. Lucro = 300)
      const resMargem = await fetch(`${baseUrl}/api/suprimentos/os/os_http_1/margem-real`);
      assert.equal(resMargem.status, 200);
      const jsonMargem = await resMargem.json();
      assert.equal(jsonMargem.success, true);
      assert.equal(jsonMargem.receitaPecasTotal, 800);
      assert.equal(jsonMargem.custoPecasCMPTotal, 500);
      assert.equal(jsonMargem.lucroBrutoPecas, 300);
    } finally {
      server.close();
    }
  });

  await t.test('4.2: POST conciliação bancária (processar e webhook)', async () => {
    await resetState();
    const app = buildMockApp(tenantId);
    const server = app.listen(0);
    const port = server.address().port;
    const baseUrl = `http://127.0.0.1:${port}`;

    try {
      const resWeb = await fetch(`${baseUrl}/api/financeiro/conciliacao-bancaria/webhook-api`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify([
          {
            idTransacaoBanco: 'TX-WEBHOOK-99',
            data: '2026-11-10',
            tipo: 'CREDITO',
            valor: 3000.00,
            descricao: 'PIX BORD-7210 CLIENTE FROTA'
          }
        ])
      });
      assert.equal(resWeb.status, 200);
      const jsonWeb = await resWeb.json();
      assert.equal(jsonWeb.success, true);
      assert.equal(jsonWeb.borderosLiquidadosIds.length, 1);
      assert.equal(jsonWeb.borderosLiquidadosIds[0], 'bord_h1');
    } finally {
      server.close();
    }
  });

  await t.test('4.3: POST /api/whatsapp/agente/webhook (Recepção e Analista)', async () => {
    await resetState();
    const app = buildMockApp(tenantId);
    const server = app.listen(0);
    const port = server.address().port;
    const baseUrl = `http://127.0.0.1:${port}`;

    try {
      // 1. Mensagem de motorista na recepção
      const resWppRecep = await fetch(`${baseUrl}/api/whatsapp/agente/webhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          remetente: '5511999991111',
          perfilRemetente: 'cliente',
          mensagem: 'Bom dia, como está a manutenção do caminhão placa LOG4A20?'
        })
      });
      assert.equal(resWppRecep.status, 200);
      const jsonWppRecep = await resWppRecep.json();
      assert.equal(jsonWppRecep.success, true);
      assert.equal(jsonWppRecep.skill, 'SKILL_RECEPCAO_PATIO');
      assert.ok(jsonWppRecep.respostaTextoWhatsApp.includes('LOG4A20'));

      // 2. Mensagem gerencial de faturamento com bloqueio RBAC 403 para não-gerente
      const resWppNeg = await fetch(`${baseUrl}/api/whatsapp/agente/webhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          remetente: '5511999991111',
          perfilRemetente: 'cliente',
          mensagem: 'Quais os borderôs faturados e vencidos hoje?'
        })
      });
      assert.equal(resWppNeg.status, 403);
      const jsonWppNeg = await resWppNeg.json();
      assert.equal(jsonWppNeg.code, 'WHATSAPP_UNAUTHORIZED_MANAGEMENT_SKILL');
    } finally {
      server.close();
    }
  });

  await t.test('4.4: Renderização de componentes visuais e modais de Suprimentos/CMP e Conciliação', () => {
    require('../js/modules/suprimentos_whatsapp_conciliacao_ui');
    require('../js/modules/suprimentos_whatsapp_conciliacao_actions');

    const ui = globalThis;
    assert.equal(typeof ui.renderPainelSuprimentosEConciliacaoHtml, 'function');
    assert.equal(typeof ui.modalReceberNotaCompraHtml, 'function');
    assert.equal(typeof ui.modalImportarExtratoBancarioHtml, 'function');
    assert.equal(typeof ui.modalSimuladorAgenteWhatsAppHtml, 'function');
    assert.equal(typeof ui.abrirModalReceberNotaCompra, 'function');
    assert.equal(typeof ui.receberNotaCompraAction, 'function');
    assert.equal(typeof ui.abrirModalImportarExtrato, 'function');
    assert.equal(typeof ui.processarExtratoBancarioAction, 'function');
    assert.equal(typeof ui.abrirModalSimuladorAgenteWhatsApp, 'function');
    assert.equal(typeof ui.enviarComandoAgenteWhatsAppAction, 'function');

    const htmlPainel = ui.renderPainelSuprimentosEConciliacaoHtml({
      purchaseOrders: [{ id: 'po_test_1', fornecedorNome: 'Molas Brasil', valorTotalPedido: 1500, status: 'aguardando_entrega' }],
      bankReconciliations: [{ id: 'lote_1' }],
      receptionQueue: [{ id: 'rec_1', protocolo: 'REC-0001', placa: 'ABC1D23' }]
    });
    assert.ok(htmlPainel.includes('Suprimentos, Conciliação Bancária & Agente WhatsApp'));
    assert.ok(htmlPainel.includes('Molas Brasil'));
    assert.ok(htmlPainel.includes('data-act="abrir-receber-nf-compra"'));

    const htmlModalNF = ui.modalReceberNotaCompraHtml({ id: 'po_test_1', fornecedorNome: 'Molas Brasil', valorTotalPedido: 1500 });
    assert.ok(htmlModalNF.includes('Recebimento de NF de Compra & Recálculo de CMP'));
    assert.ok(htmlModalNF.includes('txt-rcv-nf'));
    assert.ok(htmlModalNF.includes('data-act="confirmar-receber-nf-compra"'));

    const htmlModalExtrato = ui.modalImportarExtratoBancarioHtml();
    assert.ok(htmlModalExtrato.includes('Importação & Conciliação Bancária Automatizada'));
    assert.ok(htmlModalExtrato.includes('sel-ext-formato'));
    assert.ok(htmlModalExtrato.includes('data-act="processar-extrato-bancario"'));

    const htmlModalWpp = ui.modalSimuladorAgenteWhatsAppHtml();
    assert.ok(htmlModalWpp.includes('Simulador de Conversa — Agente WhatsApp Multi-Skill'));
    assert.ok(htmlModalWpp.includes('sel-wpp-perfil'));
    assert.ok(htmlModalWpp.includes('data-act="enviar-comando-agente-whatsapp"'));
  });
});
