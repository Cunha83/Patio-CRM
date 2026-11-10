'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const express = require('express');

const rootDir = path.resolve(__dirname, '..');
const { initDB } = require(path.join(rootDir, 'db'));
const { mutateTenantState } = require(path.join(rootDir, 'lib', 'serverContext'));
const routes = require('../routes/aprovacao_externa_frotista.routes');

function buildMockApp(tenantId) {
  const app = express();
  app.use(express.json());

  app.use((req, res, next) => {
    req.securityContext = {
      tenantId,
      actorId: 'consultor_test',
      role: 'owner',
      permissions: ['*']
    };
    next();
  });

  app.use(routes);
  return app;
}

test('Sprint 7.3 — Endpoints REST do Portal de Aprovação Externa Frotista', async (t) => {
  await initDB();
  const tenantId = 'tenant_sprint73_http';

  async function resetState() {
    await mutateTenantState({
      securityContext: {
        tenantId,
        actorId: 'consultor_test',
        role: 'owner',
        permissions: ['*']
      }
    }, (draft) => {
      draft.clientes = [
        {
          id: 'cli_transp_rota',
          nome: 'Transportadora Rota Certa',
          centrosCusto: [{ id: 'cc_cargas_sul', nome: 'Linha Sul', limiteMensal: 8000, bloquearEstouro: true }]
        }
      ];
      draft.costCenters = [
        { id: 'cc_cargas_sul', tenantId, nome: 'Linha Sul', limiteMensal: 8000, bloquearEstouro: true }
      ];
      draft.os = [
        {
          id: 'os_ext_730',
          num: 7350,
          tenantId,
          clienteId: 'cli_transp_rota',
          cli: 'cli_transp_rota',
          placa: 'ROT4A80',
          veiculo: 'Scania R500',
          st: 'em_andamento',
          boxAtualId: 'box_rot_1',
          centroCustoId: 'cc_cargas_sul',
          total: 2500.00,
          servicos: [{ id: 'srv_1', desc: 'Revisão Eixo Traseiro', valor: 1000.00, status: 'pendente' }],
          pecas: [{ id: 'pec_1', pecaId: 'p_1', desc: 'Grampo de Mola Reforçado', valor: 1500.00, qtd: 1, status: 'pendente' }]
        }
      ];
      draft.patioBoxes = [
        { id: 'box_rot_1', nome: 'Box 01', status: 'bloqueado_gargalo', osAtualId: 'os_ext_730', gargaloAtivoId: 'gar_rot_1' }
      ];
      draft.patioBottlenecks = [
        { id: 'gar_rot_1', osId: 'os_ext_730', boxId: 'box_rot_1', motivoParada: 'aguardando_aprovacao_frotista', status: 'aberto', inicioParadaEm: '2026-11-10T11:00:00Z', slaMaximoMinutos: 90 }
      ];
      draft.borderos = [];
      draft.creditPolicies = {
        cli_transp_rota: { clienteId: 'cli_transp_rota', limiteCredito: 15000, diasToleranciaAtraso: 5, bloqueioAutomatico: true }
      };
      draft.externalApprovalTokens = [];
      draft.whatsappAgentLogs = [];
      draft.opportunities = [];
    });
  }

  await t.test('2.1: Fluxo Completo: Geração de link, consulta pública, decisão com destravamento e listagem', async () => {
    await resetState();
    const app = buildMockApp(tenantId);
    const server = app.listen(0);
    const port = server.address().port;
    const baseUrl = `http://127.0.0.1:${port}`;

    try {
      // 1. Gera link tokenizado
      const postLinkRes = await fetch(`${baseUrl}/api/orcamentos/os_ext_730/link-aprovacao-externa`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          validadeHoras: 48,
          telefoneDestino: '5511988887777',
          responsavel: 'consultor_pedro'
        })
      });
      const postLinkData = await postLinkRes.json();
      assert.equal(postLinkRes.status, 200);
      assert.equal(postLinkData.success, true);
      assert.ok(postLinkData.token.token);
      const tokenStr = postLinkData.token.token;
      const tokenId = postLinkData.token.id;

      // 2. Consulta pública via token
      const getPublicRes = await fetch(`${baseUrl}/api/public/aprovacao-frotista/${tokenStr}`);
      const getPublicData = await getPublicRes.json();
      assert.equal(getPublicRes.status, 200);
      assert.equal(getPublicData.success, true);
      assert.equal(getPublicData.os.placa, 'ROT4A80');
      assert.equal(getPublicData.os.total, 2500.00);

      // 3. Submissão de decisão externa pelo frotista
      const postDecisaoRes = await fetch(`${baseUrl}/api/public/aprovacao-frotista/${tokenStr}/decidir`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 FleetPortal/1.0'
        },
        body: JSON.stringify({
          aprovadorNome: 'Diretor Carlos Mendes',
          aprovadorDocumento: '987.654.321-00',
          aprovadorCargo: 'Diretor de Operações',
          decisoesItens: [
            { id: 'srv_1', statusItem: 'aprovado' },
            { id: 'pec_1', statusItem: 'aprovado' }
          ]
        })
      });
      const postDecisaoData = await postDecisaoRes.json();
      assert.equal(postDecisaoRes.status, 200);
      assert.equal(postDecisaoData.success, true);
      assert.equal(postDecisaoData.decisaoAuditada.valorAprovado, 2500.00);
      assert.ok(postDecisaoData.decisaoAuditada.hashIntegridadeDecisao);

      // 4. Listar links e verificar status 'utilizado'
      const getListRes = await fetch(`${baseUrl}/api/orcamentos/links-aprovacao-externa`);
      const getListData = await getListRes.json();
      assert.equal(getListRes.status, 200);
      assert.equal(getListData.success, true);
      assert.equal(getListData.tokens.length, 1);
      assert.equal(getListData.tokens[0].status, 'utilizado');

      // 5. Revogação de token
      const postRevokeRes = await fetch(`${baseUrl}/api/orcamentos/tokens/${tokenId}/revogar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ motivo: 'Ajuste manual da gerência' })
      });
      const postRevokeData = await postRevokeRes.json();
      assert.equal(postRevokeRes.status, 200);
      assert.equal(postRevokeData.token.status, 'revogado');
    } finally {
      server.close();
    }
  });

  await t.test('2.2: Renderização dos Componentes UI e Modais de Aprovação Externa', () => {
    require('../js/modules/aprovacao_externa_frotista_ui');

    const tokens = [
      {
        id: 'tok_1',
        token: 'abcdef123456',
        osId: 'os_ext_730',
        osNum: 7350,
        status: 'pendente',
        valorOrcamentoOriginal: 2500.00,
        telefoneDestino: '5511988887777',
        criadoEm: '2026-11-10T11:00:00Z',
        expiraEm: '2026-11-12T11:00:00Z'
      }
    ];
    const osList = [{ id: 'os_ext_730', num: 7350, placa: 'ROT4A80', total: 2500.00 }];

    // 1. Painel de links
    const htmlPainel = global.renderPainelLinksAprovacaoExternaHtml(tokens, osList);
    assert.ok(htmlPainel.includes('ROT4A80'));
    assert.ok(htmlPainel.includes('OS #7350'));
    assert.ok(htmlPainel.includes('data-act="abrir-modal-gerar-link-aprovacao"'));
    assert.ok(htmlPainel.includes('data-act="copiar-link-aprovacao"'));

    // 2. Modal Gerar Link
    const htmlModalGerar = global.modalGerarLinkAprovacaoFrotistaHtml(osList[0], { telefone: '5511988887777' });
    assert.ok(htmlModalGerar.includes('modal-link-os-id'));
    assert.ok(htmlModalGerar.includes('data-act="confirmar-gerar-link-aprovacao"'));
    assert.ok(htmlModalGerar.includes('ROT4A80'));

    // 3. Modal Portal Público Preview
    const consultaMock = {
      os: { id: 'os_ext_730', placa: 'ROT4A80', servicos: [{ id: 'srv_1', desc: 'Revisão', valor: 1000 }], pecas: [] },
      token: { token: 'abcdef123456' },
      cliente: { nome: 'Transportadora Rota Certa' }
    };
    const htmlPortal = global.modalPortalPublicoAprovacaoFrotistaHtml(consultaMock);
    assert.ok(htmlPortal.includes('portal-aprovador-nome'));
    assert.ok(htmlPortal.includes('portal-aprovador-doc'));
    assert.ok(htmlPortal.includes('data-act="submeter-decisao-portal-publico"'));
  });
});
