'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { initDB } = require('../db');
const { persistState, getState } = require('../lib/repository/stateRepository');

const borderoRoutes = require('../routes/financial_bordero.routes');

test('P0: Rotas de API e Controle de Acesso RBAC para Borderô de Frotas', async (t) => {
  await initDB();

  const tenantId = 'tenant_routes_test';

  const estadoInicial = {
    versao: 1,
    cfg: {
      oficina: {
        nome: 'Auto Molas Fort Diesel',
        cnpj: '12.345.678/0001-99',
        dadosBancarios: {
          banco: '237',
          agencia: '4321',
          conta: '98765',
          carteira: '09',
          chavePix: 'pix@molasfort.com.br'
        }
      }
    },
    clientes: [
      {
        id: 'cli_transp_beta',
        nome: 'Expresso Cearense de Cargas Ltda',
        doc: '22.333.444/0001-55'
      }
    ],
    os: [
      {
        id: 'os_301',
        num: '301',
        tenantId,
        cli: 'cli_transp_beta',
        st: 'finalizada',
        fechamento: '2026-11-06T14:00:00Z',
        veiculo: { placa: 'CEE1A11', modelo: 'Mercedes Actros 2651' },
        servicos: [{ id: 's1', desc: 'Troca de Pino de Centro', valor: 500.00 }],
        pecas: [{ id: 'p1', desc: 'Pino de Centro Forjado', valor: 250.00, total: 250.00 }],
        total: 750.00
      },
      {
        id: 'os_302',
        num: '302',
        tenantId,
        cli: 'cli_transp_beta',
        st: 'entregue',
        fechamento: '2026-11-07T18:00:00Z',
        veiculo: { placa: 'CEE2B22', modelo: 'DAF XF 530' },
        servicos: [{ id: 's2', desc: 'Reforço de Mola Traseira', valor: 900.00 }],
        pecas: [{ id: 'p2', desc: 'Lâmina Reforçada', valor: 600.00, total: 600.00 }],
        total: 1500.00
      }
    ],
    contas: [],
    borderos: []
  };

  await persistState(tenantId, estadoInicial);

  // App de testes com injeção dinâmica de permissões RBAC no securityContext
  let currentPermissions = [];
  let currentActor = 'operador_teste';

  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    req.securityContext = {
      tenantId,
      actorId: currentActor,
      permissions: currentPermissions
    };
    next();
  });
  app.use(borderoRoutes);

  // Helper de requisição Express in-memory usando supertest-like fetch ou server local
  let server;
  let baseUrl;

  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });

  t.after(() => {
    if (server) server.close();
  });

  await t.test('1. GET /api/financeiro/bordero/faturaveis: RBAC 403 e listagem 200', async () => {
    // Sem permissão -> 403
    currentPermissions = ['inventory:read'];
    const res403 = await fetch(`${baseUrl}/api/financeiro/bordero/faturaveis?clienteId=cli_transp_beta`);
    assert.equal(res403.status, 403);

    // Com permissão -> 200
    currentPermissions = ['financial:read'];
    const res200 = await fetch(`${baseUrl}/api/financeiro/bordero/faturaveis?clienteId=cli_transp_beta`);
    assert.equal(res200.status, 200);
    const body = await res200.json();
    assert.equal(body.ok, true);
    assert.equal(body.faturaveis.length, 2);
  });

  await t.test('2. POST /api/financeiro/bordero/previa: RBAC 403 e cálculo analítico 200', async () => {
    currentPermissions = [];
    const res403 = await fetch(`${baseUrl}/api/financeiro/bordero/previa`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clienteId: 'cli_transp_beta', osIds: ['os_301', 'os_302'] })
    });
    assert.equal(res403.status, 403);

    currentPermissions = ['financial:read'];
    const res200 = await fetch(`${baseUrl}/api/financeiro/bordero/previa`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clienteId: 'cli_transp_beta',
        osIds: ['os_301', 'os_302'],
        condicaoPagamento: '14/28',
        descontoGeral: 50.00
      })
    });
    assert.equal(res200.status, 200);
    const body = await res200.json();
    assert.equal(body.ok, true);
    assert.equal(body.resumoTotais.subtotalBruto, 2250.00); // 750 + 1500
    assert.equal(body.resumoTotais.totalLiquido, 2200.00); // 2250 - 50
    assert.equal(body.parcelas.length, 2);
  });

  let borderoCriadoId = null;

  await t.test('3. POST /api/financeiro/bordero/fechar: RBAC 403 e fechamento atômico 201', async () => {
    // Permissão apenas de leitura -> 403
    currentPermissions = ['financial:read'];
    const res403 = await fetch(`${baseUrl}/api/financeiro/bordero/fechar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clienteId: 'cli_transp_beta', osIds: ['os_301', 'os_302'] })
    });
    assert.equal(res403.status, 403);

    // Permissão de escrita/gestão financeira -> 201
    currentPermissions = ['financial:manage'];
    currentActor = 'gerente_frotas_joao';
    const res201 = await fetch(`${baseUrl}/api/financeiro/bordero/fechar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clienteId: 'cli_transp_beta',
        osIds: ['os_301', 'os_302'],
        condicaoPagamento: '30ddl',
        descontoGeral: 50.00
      })
    });

    assert.equal(res201.status, 201);
    const body = await res201.json();
    assert.equal(body.ok, true);
    assert.ok(body.bordero);
    borderoCriadoId = body.bordero.id;

    // Confere estado persistido
    const stAtual = await getState(tenantId);
    const bPersistido = stAtual.borderos.find(b => b.id === borderoCriadoId);
    assert.ok(bPersistido, 'Borderô deve existir no estado persistido');
    assert.equal(bPersistido.status, 'faturado');
    assert.equal(stAtual.contas.filter(c => c.borderoId === borderoCriadoId).length, 1);
  });

  await t.test('4. GET /api/financeiro/bordero/:id e espelho PDF data: 200', async () => {
    currentPermissions = ['financial:read'];
    const resGet = await fetch(`${baseUrl}/api/financeiro/bordero/${borderoCriadoId}`);
    assert.equal(resGet.status, 200);
    const bodyGet = await resGet.json();
    assert.equal(bodyGet.ok, true);
    assert.equal(bodyGet.bordero.id, borderoCriadoId);

    const resEspelho = await fetch(`${baseUrl}/api/financeiro/bordero/${borderoCriadoId}/espelho-pdf-data`);
    assert.equal(resEspelho.status, 200);
    const bodyEspelho = await resEspelho.json();
    assert.equal(bodyEspelho.ok, true);
    assert.ok(bodyEspelho.espelho);
    assert.equal(bodyEspelho.espelho.resumoOS.length, 2);
  });

  await t.test('5. POST /api/financeiro/bordero/:id/cancelar: RBAC restrito e cancelamento atômico', async () => {
    // Operador comum (financial:manage) não pode cancelar sem financial:admin -> 403
    currentPermissions = ['financial:manage'];
    const res403 = await fetch(`${baseUrl}/api/financeiro/bordero/${borderoCriadoId}/cancelar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ motivo: 'Erro na negociação' })
    });
    assert.equal(res403.status, 403);

    // Administrador financeiro (financial:admin) -> 200
    currentPermissions = ['financial:admin'];
    currentActor = 'diretor_carlos';
    const res200 = await fetch(`${baseUrl}/api/financeiro/bordero/${borderoCriadoId}/cancelar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ motivo: 'Ajuste de negociação' })
    });
    assert.equal(res200.status, 200);
    const bodyCancel = await res200.json();
    assert.equal(bodyCancel.ok, true);
    assert.equal(bodyCancel.bordero.status, 'cancelado');

    // Confere que OSs foram liberadas no estado
    const stAtual = await getState(tenantId);
    const os1 = stAtual.os.find(o => o.id === 'os_301');
    assert.equal(os1.borderoId, null);
    assert.equal(os1.statusBordero, 'aberto');
  });
});
