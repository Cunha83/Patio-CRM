'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const express = require('express');

const rootDir = path.resolve(__dirname, '..');
const { initDB } = require(path.join(rootDir, 'db'));
const { mutateTenantState } = require(path.join(rootDir, 'lib', 'serverContext'));
const routes = require('../routes/financeiro_bordero_inadimplencia.routes');

function buildMockApp(tenantId) {
  const app = express();
  app.use(express.json());

  app.use((req, res, next) => {
    req.securityContext = {
      tenantId,
      actorId: 'admin_test',
      role: 'admin',
      permissions: ['*']
    };
    next();
  });

  app.use(routes);
  return app;
}

test('Sprint 7.1 — Endpoints REST de Conciliação e Governança de Risco', async (t) => {
  await initDB();
  const tenantId = 'tenant_sprint71';

  async function resetState() {
    await mutateTenantState({
      securityContext: {
        tenantId,
        actorId: 'admin_test',
        role: 'owner',
        permissions: ['*']
      }
    }, (draft) => {
      draft.os = [
        {
          id: 'os_b2b_10',
          num: 7110,
          tenantId,
          cli: 'cli_transp_beta',
          clienteId: 'cli_transp_beta',
          total: 2000.00,
          valorTotal: 2000.00,
          pago: false,
          statusPagamento: 'pendente'
        }
      ];
      draft.contas = [
        {
          id: 'cta_b2b_10',
          tenantId,
          tipo: 'receber',
          clienteId: 'cli_transp_beta',
          valor: 2000.00,
          status: 'aberto',
          borderoId: 'bord_beta_001'
        }
      ];
      draft.borderos = [
        {
          id: 'bord_beta_001',
          num: 'BORD-7110',
          tenantId,
          clienteId: 'cli_transp_beta',
          status: 'faturado',
          valorTotal: 2000.00,
          totais: { totalLiquido: 2000.00 },
          saldoDevedor: 2000.00,
          valorPagoAcumulado: 0,
          osIds: ['os_b2b_10'],
          contasIds: ['cta_b2b_10'],
          dataVencimento: '2026-11-15'
        }
      ];
      draft.clientes = [
        { id: 'cli_transp_beta', nome: 'Beta Transportes Rodoviários' }
      ];
      draft.creditPolicies = {};
      draft.creditOverrideLogs = [];
    });
  }

  await t.test('3.1: POST /api/financeiro/borderos/:id/liquidar e GET extrato-liquidacoes', async () => {
    await resetState();
    const app = buildMockApp(tenantId);
    const server = app.listen(0);
    const port = server.address().port;
    const baseUrl = `http://127.0.0.1:${port}`;

    try {
      // 1. Executa liquidação via HTTP POST
      const resLiq = await fetch(`${baseUrl}/api/financeiro/borderos/bord_beta_001/liquidar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          valorRecebido: 2000.00,
          formaPagamento: 'pix',
          dataLiquidacao: '2026-11-10T14:00:00Z'
        })
      });

      assert.equal(resLiq.status, 200);
      const jsonLiq = await resLiq.json();
      assert.equal(jsonLiq.success, true);
      assert.ok(jsonLiq.bordero.status === 'pago' || jsonLiq.bordero.status === 'liquidado');
      assert.equal(jsonLiq.bordero.saldoDevedor, 0);

      // 2. Consulta extrato via HTTP GET
      const resExt = await fetch(`${baseUrl}/api/financeiro/borderos/extrato-liquidacoes?clienteId=cli_transp_beta`);
      assert.equal(resExt.status, 200);
      const jsonExt = await resExt.json();
      assert.equal(jsonExt.success, true);
      assert.equal(jsonExt.extrato.length, 1);
      assert.equal(jsonExt.extrato[0].valorRecebido, 2000.00);
      assert.equal(jsonExt.totalizadores.totalLiquidado, 2000.00);
    } finally {
      server.close();
    }
  });

  await t.test('3.2: Rotas de Política de Crédito, Risco e Trava de Inadimplência', async () => {
    await resetState();
    const app = buildMockApp(tenantId);
    const server = app.listen(0);
    const port = server.address().port;
    const baseUrl = `http://127.0.0.1:${port}`;

    try {
      // 1. Configura política de crédito
      const resPol = await fetch(`${baseUrl}/api/financeiro/credito-frotistas/cli_transp_beta/politica`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          limiteCredito: 5000.00,
          diasToleranciaAtraso: 5,
          bloqueioAutomatico: true
        })
      });
      assert.equal(resPol.status, 200);
      const jsonPol = await resPol.json();
      assert.equal(jsonPol.success, true);
      assert.equal(jsonPol.politica.limiteCredito, 5000.00);

      // 2. Consulta risco (vencimento 2026-11-15, ref 2026-11-25 -> atraso 10 dias > 5)
      const resRisco = await fetch(`${baseUrl}/api/financeiro/credito-frotistas/cli_transp_beta/risco?dataReferencia=2026-11-25`);
      assert.equal(resRisco.status, 200);
      const jsonRisco = await resRisco.json();
      assert.equal(jsonRisco.success, true);
      assert.equal(jsonRisco.avaliacao.statusRisco, 'bloqueado_inadimplencia');
      assert.equal(jsonRisco.avaliacao.aprovadoParaNovosServicos, false);

      // 3. Tenta validar trava sem override -> Retorna 403
      const resTrava = await fetch(`${baseUrl}/api/financeiro/credito-frotistas/cli_transp_beta/validar-trava`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          valorNovoServico: 500.00,
          dataReferencia: '2026-11-25'
        })
      });
      assert.equal(resTrava.status, 403);
      const jsonTrava = await resTrava.json();
      assert.equal(jsonTrava.code, 'FLEET_DELINQUENCY_CREDIT_BLOCKED');

      // 4. Valida trava COM override gerencial -> Retorna 200 liberado
      const resOverride = await fetch(`${baseUrl}/api/financeiro/credito-frotistas/cli_transp_beta/validar-trava`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          valorNovoServico: 500.00,
          dataReferencia: '2026-11-25',
          permitirOverride: true,
          motivoLiberacao: 'Autorizado pela Diretoria Operacional',
          usuarioLiberacao: 'gerente_luiz'
        })
      });
      assert.equal(resOverride.status, 200);
      const jsonOverride = await resOverride.json();
      assert.equal(jsonOverride.success, true);
      assert.equal(jsonOverride.liberado, true);
      assert.equal(jsonOverride.override, true);
    } finally {
      server.close();
    }
  });

  await t.test('3.3: Renderização de componentes visuais e modais de conciliação e crédito frotista', () => {
    // Carrega módulos no contexto global
    require('../js/modules/financeiro_bordero_conciliacao_ui');
    require('../js/modules/financeiro_bordero_conciliacao_actions');

    const ui = globalThis;
    assert.equal(typeof ui.renderPainelConciliacaoBorderoHtml, 'function');
    assert.equal(typeof ui.modalLiquidarBorderoB2BHtml, 'function');
    assert.equal(typeof ui.modalPoliticaCreditoFrotistaHtml, 'function');
    assert.equal(typeof ui.abrirModalLiquidarBordero, 'function');
    assert.equal(typeof ui.liquidarBorderoAction, 'function');
    assert.equal(typeof ui.estornarLiquidacaoBorderoAction, 'function');
    assert.equal(typeof ui.abrirModalPoliticaCredito, 'function');
    assert.equal(typeof ui.salvarPoliticaCreditoAction, 'function');
    assert.equal(typeof ui.confirmarOverrideCreditoAction, 'function');

    const htmlPainel = ui.renderPainelConciliacaoBorderoHtml({
      borderos: [
        {
          id: 'bord_test_1',
          num: 'BORD-901',
          clienteNome: 'Fictícia Transportes',
          valorTotal: 5000.00,
          saldoDevedor: 5000.00,
          dataVencimento: '2026-11-01'
        }
      ]
    });
    assert.ok(htmlPainel.includes('Conciliação & Baixa em Cascata de Borderôs B2B'));
    assert.ok(htmlPainel.includes('BORD-901'));
    assert.ok(htmlPainel.includes('data-act="abrir-modal-liquidar-bordero"'));

    const htmlModalLiq = ui.modalLiquidarBorderoB2BHtml({
      id: 'bord_test_1',
      num: 'BORD-901',
      clienteNome: 'Fictícia Transportes',
      saldoDevedor: 5000.00
    });
    assert.ok(htmlModalLiq.includes('Baixa / Liquidação de Borderô B2B'));
    assert.ok(htmlModalLiq.includes('txt-liq-valor'));
    assert.ok(htmlModalLiq.includes('data-act="confirmar-liquidacao-bordero"'));

    const htmlModalPol = ui.modalPoliticaCreditoFrotistaHtml({
      id: 'cli_ficticia',
      nome: 'Fictícia Transportes'
    }, {
      limiteCredito: 10000.00,
      diasToleranciaAtraso: 5,
      bloqueioAutomatico: true
    }, {
      statusRisco: 'bloqueado_inadimplencia',
      aprovadoParaNovosServicos: false,
      motivoBloqueio: 'Atraso de 15 dias no borderô BORD-901'
    });
    assert.ok(htmlModalPol.includes('Governança de Crédito & Trava de Inadimplência'));
    assert.ok(htmlModalPol.includes('FROTISTA COM RESTRIÇÃO ATIVA'));
    assert.ok(htmlModalPol.includes('txt-pol-limite'));
    assert.ok(htmlModalPol.includes('data-act="confirmar-override-credito"'));
  });
});
