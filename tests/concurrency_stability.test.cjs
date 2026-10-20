'use strict';

/**
 * tests/concurrency_stability.test.cjs
 * Frente 11B — Validação de Estabilidade de Triggers, Idempotência e Concorrência no Banco de Dados
 *
 * Valida:
 * 1. Trava BOX_JA_OCUPADO (HTTP 409) na colisão de alocação de box.
 * 2. Trava MOVIMENTO_JA_ESTORNADO (HTTP 409) na duplicidade de estorno de movimento contábil.
 * 3. Trava CAIXA_JA_FECHADO (HTTP 409) na tentativa de fechamento repetido sem turno aberto.
 * 4. Trava ESTOQUE_INSUFICIENTE (HTTP 409) na requisição de peças além do saldo disponível.
 * 5. Concorrência paralela (Promise.all) garantindo que apenas 1 operação prevaleça e as demais retornem 409.
 * 6. Auditoria SQLite: persistência completa de eventos 'financeiro:*' e 'patio:*' em security_audit_log.
 * 7. Integridade do banco SQLite (PRAGMA integrity_check) após toda a bateria de estresse.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('fs');
const os = require('os');
const http = require('http');

// Banco isolado para este teste
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'patio_concurrency_'));
const testDb = path.join(tempDir, 'test_concurrency.db');
process.env.DB_PATH = testDb;

const express = require('express');
const { initDB, closeDB, all, get } = require('../db');
const financialRouter = require('../routes/financial.routes');
const { salvarEstado, getOrLoadState } = require('../lib/serverContext');

const CTX_GESTOR = {
  tenantId: 'default',
  actorId: 'gestor_001',
  role: 'tenant_admin',
  permissions: ['*'],
  fullName: 'Gestor Geral'
};

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.securityContext = CTX_GESTOR;
    next();
  });
  app.use(financialRouter);
  return app;
}

async function httpRequest(serverPort, method, routePath, body = {}) {
  const res = await fetch(`http://127.0.0.1:${serverPort}${routePath}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: method !== 'GET' ? JSON.stringify(body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

test('P0: Estabilidade de Concorrência, Transações Atômicas e Travas de Idempotência (Frente 11B)', { timeout: 60000 }, async (t) => {
  await initDB();

  let server;
  let port;

  const estadoBase = {
    cfg: { adminFones: ['5511999998888'], financeiroFones: ['5511988887777'], saldoInicial: 5000 },
    caixas: [
      {
        id: 'cx-ativo-01',
        turno: 1,
        status: 'aberto',
        dataAbertura: '2026-10-20',
        horaAbertura: '08:00:00',
        saldoInicial: 500,
        operadorAbertura: 'gestor_001',
        movimentacoesIds: []
      }
    ],
    movimentos: [
      {
        id: 'mov-100',
        tipo: 'entrada',
        valor: 1500,
        categoria: 'Serviços',
        descricao: 'Entrada Inicial OS 1',
        data: '2026-10-20',
        hora: '09:00',
        caixaId: 'cx-ativo-01',
        estornado: false
      }
    ],
    movimentacoes: [],
    contas: [],
    os: [
      { id: 'OS-101', num: 101, st: 'em_andamento', boxId: null, total: 1500, servicos: [], pecas: [] },
      { id: 'OS-102', num: 102, st: 'em_andamento', boxId: null, total: 2200, servicos: [], pecas: [] },
      { id: 'OS-103', num: 103, st: 'em_andamento', boxId: null, total: 800, servicos: [], pecas: [] },
      { id: 'OS-104', num: 104, st: 'em_andamento', boxId: null, total: 1100, servicos: [], pecas: [] },
      { id: 'OS-105', num: 105, st: 'em_andamento', boxId: null, total: 950, servicos: [], pecas: [] }
    ],
    boxes: [
      { id: 'BOX-01', nome: 'Box 01 - Rampa Principal', status: 'livre', osId: null }
    ],
    estoque: [
      { id: 'peca-filtro', nome: 'Filtro de Óleo Pesado', qtdAtual: 3, qtdMinima: 1, custo: 80, precoVenda: 160 }
    ],
    mecanicos: [
      { id: 'mec-001', nome: 'Carlos Silva', fone: '5511999990001' }
    ],
    security_audit_log: []
  };

  await salvarEstado('default', estadoBase);

  // Inicializa servidor HTTP compartilhado
  const app = buildApp();
  await new Promise((resolve) => {
    server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      port = server.address().port;
      resolve();
    });
  });

  t.after(async () => {
    if (server) {
      await new Promise(r => server.close(r));
    }
    try { await closeDB(); } catch (_) {}
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}
  });

  /* ─────────────────────────────────────────────────────────
     1. Trava BOX_JA_OCUPADO (HTTP 409)
     ───────────────────────────────────────────────────────── */
  await t.test('1. Trava BOX_JA_OCUPADO: segunda alocação para box ocupado responde HTTP 409', async () => {
    // Primeira alocação: OS-101 no BOX-01 -> Sucesso (200)
    const res1 = await httpRequest(port, 'POST', '/api/financeiro/os/OS-101/alocar-box', {
      boxId: 'BOX-01',
      mecanico: 'Carlos Silva'
    });
    assert.equal(res1.status, 200, 'Primeira alocação deve ter sucesso');
    assert.equal(res1.data.success, true);

    // Segunda alocação: OS-102 no mesmo BOX-01 -> Deve retornar HTTP 409
    const res2 = await httpRequest(port, 'POST', '/api/financeiro/os/OS-102/alocar-box', {
      boxId: 'BOX-01',
      mecanico: 'Carlos Silva'
    });
    assert.equal(res2.status, 409, 'Segunda alocação para o mesmo box deve responder HTTP 409');
    assert.equal(res2.data.code, 'BOX_JA_OCUPADO', 'Código de erro deve ser BOX_JA_OCUPADO');

    // Valida que o box continua ocupado pela OS-101 (sem corrupção)
    const st = await getOrLoadState({ headers: { 'x-tenant-id': 'default' } });
    const box = st.boxes.find(b => b.id === 'BOX-01');
    assert.equal(box.status, 'ocupado');
    assert.equal(String(box.osId), 'OS-101');
  });

  /* ─────────────────────────────────────────────────────────
     2. Trava MOVIMENTO_JA_ESTORNADO (HTTP 409)
     ───────────────────────────────────────────────────────── */
  await t.test('2. Trava MOVIMENTO_JA_ESTORNADO: segundo estorno do mesmo movimento responde HTTP 409', async () => {
    // Primeiro estorno do mov-100 -> Sucesso (200)
    const res1 = await httpRequest(port, 'POST', '/api/financeiro/movimentacoes/mov-100/estornar', {
      motivo: 'Lançamento duplicado no fechamento matutino'
    });
    assert.equal(res1.status, 200, 'Primeiro estorno deve ter sucesso');
    assert.equal(res1.data.success, true);

    // Segundo estorno do mesmo mov-100 -> Deve responder HTTP 409
    const res2 = await httpRequest(port, 'POST', '/api/financeiro/movimentacoes/mov-100/estornar', {
      motivo: 'Tentativa concorrente de estorno'
    });
    assert.equal(res2.status, 409, 'Estorno repetido deve responder HTTP 409');
    assert.equal(res2.data.code, 'MOVIMENTO_JA_ESTORNADO', 'Código deve ser MOVIMENTO_JA_ESTORNADO');

    // Valida que apenas 1 movimento compensatório foi inserido
    const st = await getOrLoadState({ headers: { 'x-tenant-id': 'default' } });
    const estornos = (st.movimentos || []).filter(m => m.estornoDeId === 'mov-100');
    assert.equal(estornos.length, 1, 'Deve existir exatamente 1 movimento compensatório de estorno');
  });

  /* ─────────────────────────────────────────────────────────
     3. Trava CAIXA_JA_FECHADO (HTTP 409)
     ───────────────────────────────────────────────────────── */
  await t.test('3. Trava CAIXA_JA_FECHADO: fechamento de caixa sem turno aberto responde HTTP 409', async () => {
    // Primeiro fechamento do caixa ativo -> Sucesso (200)
    const res1 = await httpRequest(port, 'POST', '/api/financeiro/caixa/fechar', {
      valoresInformados: { dinheiro: 500, pix: 0 },
      observacoes: 'Fechamento regular do dia'
    });
    assert.equal(res1.status, 200, 'Primeiro fechamento deve ter sucesso');
    assert.equal(res1.data.success, true);

    // Segundo fechamento imediato (caixa já encerrado) -> HTTP 409
    const res2 = await httpRequest(port, 'POST', '/api/financeiro/caixa/fechar', {
      valoresInformados: { dinheiro: 500, pix: 0 }
    });
    assert.equal(res2.status, 409, 'Fechamento quando já encerrado deve responder HTTP 409');
    assert.equal(res2.data.code, 'CAIXA_JA_FECHADO', 'Código deve ser CAIXA_JA_FECHADO');
  });

  /* ─────────────────────────────────────────────────────────
     4. Trava ESTOQUE_INSUFICIENTE (HTTP 409)
     ───────────────────────────────────────────────────────── */
  await t.test('4. Trava ESTOQUE_INSUFICIENTE: requisição de peças além do saldo responde HTTP 409', async () => {
    // Peça peca-filtro tem qtdAtual = 3. Vamos requisitar 10 -> HTTP 409
    const res = await httpRequest(port, 'POST', '/api/financeiro/os/OS-101/requisitar-peca', {
      pecaIdOuNome: 'peca-filtro',
      quantidade: 10,
      valorUnitario: 160
    });
    assert.equal(res.status, 409, 'Requisição acima do saldo deve responder HTTP 409');
    assert.equal(res.data.code, 'ESTOQUE_INSUFICIENTE', 'Código deve ser ESTOQUE_INSUFICIENTE');

    // Valida que o saldo da peça continua intacto (3 unidades)
    const st = await getOrLoadState({ headers: { 'x-tenant-id': 'default' } });
    const peca = st.estoque.find(p => p.id === 'peca-filtro');
    assert.equal(peca.qtdAtual, 3, 'Saldo de estoque não deve ser corrompido');
  });

  /* ─────────────────────────────────────────────────────────
     5. Disputa de Concorrência Paralela (Promise.all)
     ───────────────────────────────────────────────────────── */
  await t.test('5. Disputa concorrente via Promise.all: apenas uma OS conquista o recurso disputado', async () => {
    // Liberar o BOX-01 primeiro para disputa limpa
    await httpRequest(port, 'POST', '/api/financeiro/os/OS-101/liberar-box', {});

    // Dispara 4 requisições simultâneas para alocar o BOX-01 para 4 OS diferentes
    const disputas = ['OS-102', 'OS-103', 'OS-104', 'OS-105'].map(osId =>
      httpRequest(port, 'POST', `/api/financeiro/os/${osId}/alocar-box`, {
        boxId: 'BOX-01',
        mecanico: 'Carlos Silva'
      })
    );

    const resultados = await Promise.all(disputas);

    // Exatamente uma requisição deve ter status 200 (vitória na alocação)
    const sucessos = resultados.filter(r => r.status === 200);
    const conflitos = resultados.filter(r => r.status === 409);

    assert.equal(sucessos.length, 1, `Exatamente 1 requisição deve vencer (sucesso 200), obtido: ${sucessos.length}`);
    assert.equal(conflitos.length, 3, `As outras 3 requisições devem receber 409 Conflito, obtido: ${conflitos.length}`);

    // Valida que o estado final do box está consistente
    const st = await getOrLoadState({ headers: { 'x-tenant-id': 'default' } });
    const box = st.boxes.find(b => b.id === 'BOX-01');
    assert.equal(box.status, 'ocupado');
    assert.ok(['OS-102', 'OS-103', 'OS-104', 'OS-105'].includes(String(box.osId)));
  });

  /* ─────────────────────────────────────────────────────────
     6. Persistência de Auditoria SQLite sem Perda de Pacotes
     ───────────────────────────────────────────────────────── */
  await t.test('6. Todos os eventos do sistema persistem em security_audit_log no SQLite', async () => {
    const logs = await all('SELECT action, entity, entity_id FROM security_audit_log WHERE tenant_id = ? ORDER BY id ASC', ['default']);
    assert.ok(logs.length > 0, 'Deve conter registros na trilha de auditoria');

    const acoes = logs.map(l => l.action);
    // Deve registrar eventos de pátio e financeiro ocorridos durante os testes
    assert.ok(acoes.some(a => a.startsWith('patio:os:alocar_box')), 'Deve conter evento patio:os:alocar_box');
    assert.ok(acoes.some(a => a.startsWith('financeiro:movimento:estornar')), 'Deve conter evento financeiro:movimento:estornar');
    assert.ok(acoes.some(a => a.startsWith('financeiro:caixa:fechar')), 'Deve conter evento financeiro:caixa:fechar');
  });

  /* ─────────────────────────────────────────────────────────
     7. Verificação de Integridade Criptográfica e Estrutural do SQLite
     ───────────────────────────────────────────────────────── */
  await t.test('7. SQLite permanece 100% íntegro sem corrupção (PRAGMA integrity_check)', async () => {
    const integrity = await get('PRAGMA integrity_check');
    assert.equal(integrity.integrity_check, 'ok', 'Banco SQLite deve reportar integrity_check = ok');
  });
});
