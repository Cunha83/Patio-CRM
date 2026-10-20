'use strict';

/**
 * tests/security_rbac_hardening.test.cjs
 * Frente 11A — Auditoria e Blindagem de Rotas Críticas com RBAC Estrito
 *
 * Valida que o sistema de permissões (requirePermission) funciona corretamente:
 * - Rotas EXCLUSIVAMENTE financeiras (financial:write ou financial:manage) bloqueiam
 *   mecânicos e atendentes que não possuem tais permissões.
 * - Rotas de pátio (os:write | labor:write | financial:write | operation:manage) são
 *   acessíveis a mecânicos (labor:write) e atendentes (os:write), conforme o design.
 * - Usuários sem nenhuma permissão (contexto nulo) sempre recebem 403.
 * - O operador com permissão '*' (dono) nunca recebe 403.
 * - SQL injection no body não bypassa o RBAC (bloqueio ocorre ANTES do body ser lido).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('fs');
const os = require('os');
const http = require('http');

// Banco temporário isolado antes de qualquer require do sistema
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'patio_rbac_'));
const testDb = path.join(tempDir, 'test_rbac.db');
process.env.DB_PATH = testDb;

const express = require('express');
const { initDB, closeDB, all } = require('../db');
const financialRouter = require('../routes/financial.routes');
const { salvarEstado } = require('../lib/serverContext');

/* ─────────────────────────────────────────────
   Contextos de segurança por papel
   ───────────────────────────────────────────── */
const CTX_MECANICO = {
  tenantId: 'default',
  actorId: 'mecanico_001',
  role: 'mecanico',
  permissions: ['os:read', 'labor:read', 'labor:write'],
  fullName: 'Mecânico Teste'
};

const CTX_ATENDENTE = {
  tenantId: 'default',
  actorId: 'atendente_001',
  role: 'atendente',
  permissions: ['os:read', 'os:write', 'crm:read'],
  fullName: 'Atendente Teste'
};

const CTX_SEM_PERMISSAO = {
  tenantId: 'default',
  actorId: 'unknown_001',
  role: 'externo',
  permissions: [],
  fullName: 'Externo Sem Permissão'
};

const CTX_DONO = {
  tenantId: 'default',
  actorId: 'dono_001',
  role: 'dono',
  permissions: ['*'],
  fullName: 'Dono Teste'
};

/* ─────────────────────────────────────────────
   Rotas EXCLUSIVAMENTE financeiras (requirePermission('financial:write', 'financial:manage'))
   Mecânico e Atendente NÃO possuem financial:write nem financial:manage → 403
   ───────────────────────────────────────────── */
const ROTAS_FINANCEIRAS_EXCLUSIVAS = [
  { method: 'POST', path: '/api/financeiro/caixa/sangria',               desc: 'sangria de caixa' },
  { method: 'POST', path: '/api/financeiro/caixa/suprimento',            desc: 'suprimento de caixa' },
  { method: 'POST', path: '/api/financeiro/os/OS-001/faturar',           desc: 'faturar OS' },
  { method: 'POST', path: '/api/financeiro/movimentacoes/m1/estornar',   desc: 'estornar movimentação' },
  { method: 'POST', path: '/api/financeiro/titulos/t1/liquidar',         desc: 'liquidar título' },
  { method: 'POST', path: '/api/financeiro/movimentacoes',               desc: 'registrar movimentação' },
];

/* ─────────────────────────────────────────────
   Rotas de pátio que aceitam QUALQUER de:
   os:write | labor:write | financial:write | operation:manage
   Mecânico (labor:write) e Atendente (os:write) TÊM acesso — design intencional
   ───────────────────────────────────────────── */
const ROTAS_PATIO_MULTIPERMS = [
  { method: 'POST', path: '/api/financeiro/os/OS-001/alocar-box',       desc: 'alocar box (pátio)' },
  { method: 'POST', path: '/api/financeiro/os/OS-001/apontamento',      desc: 'apontamento mecânico' },
  { method: 'POST', path: '/api/financeiro/os/OS-001/requisitar-peca',  desc: 'requisitar peça' },
  { method: 'POST', path: '/api/financeiro/os/OS-001/checklist',        desc: 'aprovar checklist técnico' },
];

/* ─────────────────────────────────────────────
   Helpers de teste HTTP in-process
   ───────────────────────────────────────────── */
function buildApp(securityContext) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.securityContext = securityContext;
    next();
  });
  app.use(financialRouter);
  return app;
}

async function httpRequest(app, method, routePath, body = {}) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(app);
    server.listen(0, '127.0.0.1', async () => {
      const port = server.address().port;
      try {
        const res = await fetch(`http://127.0.0.1:${port}${routePath}`, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: method !== 'GET' ? JSON.stringify(body) : undefined
        });
        resolve({ status: res.status });
      } catch (err) {
        reject(err);
      } finally {
        server.close();
      }
    });
    server.on('error', reject);
  });
}

/* ─────────────────────────────────────────────
   Suite principal
   ───────────────────────────────────────────── */
test('P0: Blindagem RBAC de Rotas Críticas — Auditoria de Intrusão (Frente 11A)', { timeout: 60000 }, async (t) => {
  // Setup do banco isolado
  await initDB();

  // Estado mínimo para o tenant 'default' existir
  const estadoBase = {
    cfg: { adminFones: [], financeiroFones: [], saldoInicial: 0 },
    caixas: [],
    movimentos: [],
    movimentacoes: [],
    contas: [],
    os: [{ id: 'OS-001', num: 1, st: 'em_andamento', servicos: [], pecas: [] }],
    boxes: [{ id: 'BOX-01', nome: 'Box 01', status: 'livre' }],
    estoque: [{ id: 'peca-001', nome: 'Óleo', qtdAtual: 10, qtdMinima: 2, custo: 50 }],
    mecanicos: [{ id: 'mec-001', nome: 'João', fone: '5511900000000' }],
    security_audit_log: []
  };
  await salvarEstado('default', estadoBase);

  t.after(async () => {
    try { await closeDB(); } catch (_) {}
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}
  });

  /* ─────────────────────────────────────────────────
     1. Mecânico é BLOQUEADO em rotas exclusivamente financeiras
     ───────────────────────────────────────────────── */
  await t.test('1. Mecânico (labor:write) recebe 403 em rotas exclusivamente financeiras', async () => {
    const app = buildApp(CTX_MECANICO);
    for (const rota of ROTAS_FINANCEIRAS_EXCLUSIVAS) {
      const { status } = await httpRequest(app, rota.method, rota.path, { valor: 10 });
      assert.equal(
        status, 403,
        `Mecânico deve receber 403 em ${rota.method} ${rota.path} (${rota.desc}), mas recebeu ${status}`
      );
    }
  });

  /* ─────────────────────────────────────────────────
     2. Atendente é BLOQUEADO em rotas exclusivamente financeiras
     ───────────────────────────────────────────────── */
  await t.test('2. Atendente (os:write) recebe 403 em rotas exclusivamente financeiras', async () => {
    const app = buildApp(CTX_ATENDENTE);
    for (const rota of ROTAS_FINANCEIRAS_EXCLUSIVAS) {
      const { status } = await httpRequest(app, rota.method, rota.path, { valor: 10 });
      assert.equal(
        status, 403,
        `Atendente deve receber 403 em ${rota.method} ${rota.path} (${rota.desc}), mas recebeu ${status}`
      );
    }
  });

  /* ─────────────────────────────────────────────────
     3. Usuário sem permissão alguma é BLOQUEADO em todas as rotas
     ───────────────────────────────────────────────── */
  await t.test('3. Usuário sem permissão recebe 403 em rotas financeiras E de pátio', async () => {
    const app = buildApp(CTX_SEM_PERMISSAO);
    const todasRotas = [...ROTAS_FINANCEIRAS_EXCLUSIVAS, ...ROTAS_PATIO_MULTIPERMS];
    for (const rota of todasRotas) {
      const { status } = await httpRequest(app, rota.method, rota.path, { valor: 10 });
      assert.equal(
        status, 403,
        `Usuário sem permissão deve receber 403 em ${rota.method} ${rota.path} (${rota.desc}), mas recebeu ${status}`
      );
    }
  });

  /* ─────────────────────────────────────────────────
     4. Dono (permissions: ['*']) nunca recebe 403
     ───────────────────────────────────────────────── */
  await t.test('4. Dono (permissions: [\'*\']) nunca recebe 403 em nenhuma rota', async () => {
    const app = buildApp(CTX_DONO);
    const todasRotas = [...ROTAS_FINANCEIRAS_EXCLUSIVAS, ...ROTAS_PATIO_MULTIPERMS];
    for (const rota of todasRotas) {
      const { status } = await httpRequest(app, rota.method, rota.path, { valor: 10, mecanicoId: 'mec-001', boxId: 'BOX-01', tipo: 'entrada' });
      assert.notEqual(
        status, 403,
        `Dono NÃO deve receber 403 em ${rota.method} ${rota.path} (${rota.desc}), mas recebeu ${status}`
      );
    }
  });

  /* ─────────────────────────────────────────────────
     5. Mecânico PODE acessar rotas de pátio multi-permissão (labor:write é aceito)
     ───────────────────────────────────────────────── */
  await t.test('5. Mecânico (labor:write) passa pelo RBAC nas rotas de pátio com multi-permissão', async () => {
    const app = buildApp(CTX_MECANICO);
    for (const rota of ROTAS_PATIO_MULTIPERMS) {
      const { status } = await httpRequest(app, rota.method, rota.path, { valor: 10, mecanicoId: 'mec-001', boxId: 'BOX-01' });
      assert.notEqual(
        status, 403,
        `Mecânico não deve receber 403 em ${rota.method} ${rota.path} (${rota.desc}) — labor:write é aceito, mas recebeu ${status}`
      );
    }
  });

  /* ─────────────────────────────────────────────────
     6. RBAC é determinístico: segunda chamada idêntica retorna mesmo 403
     ───────────────────────────────────────────────── */
  await t.test('6. RBAC é determinístico: chamadas repetidas retornam o mesmo status', async () => {
    const app = buildApp(CTX_MECANICO);
    const rota = ROTAS_FINANCEIRAS_EXCLUSIVAS[0]; // sangria
    const res1 = await httpRequest(app, rota.method, rota.path, { valor: 1 });
    const res2 = await httpRequest(app, rota.method, rota.path, { valor: 1 });
    assert.equal(res1.status, 403, `1ª chamada deve retornar 403`);
    assert.equal(res2.status, 403, `2ª chamada deve retornar 403`);
    assert.equal(res1.status, res2.status, 'Resultado deve ser idêntico em chamadas repetidas');
  });

  /* ─────────────────────────────────────────────────
     7. SQL Injection no body não bypassa o RBAC para usuário sem permissão
     ───────────────────────────────────────────────── */
  await t.test('7. SQL Injection no body não bypassa RBAC (bloqueado antes de processar o body)', async () => {
    const app = buildApp(CTX_SEM_PERMISSAO);
    const payloadMalicioso = {
      valor: "1'; DROP TABLE security_audit_log; --",
      boxId: "' OR '1'='1",
      mecanicoId: '; SELECT * FROM users; --'
    };
    for (const rota of ROTAS_FINANCEIRAS_EXCLUSIVAS) {
      const { status } = await httpRequest(app, rota.method, rota.path, payloadMalicioso);
      assert.equal(
        status, 403,
        `SQL Injection não deve bypassar RBAC em ${rota.method} ${rota.path}, esperado 403 mas recebeu ${status}`
      );
    }
    // Confirma que a tabela security_audit_log ainda existe e é consultável
    const rows = await all('SELECT id FROM security_audit_log LIMIT 1');
    assert.ok(Array.isArray(rows), 'security_audit_log deve estar íntegra após tentativas de SQL Injection');
  });

  /* ─────────────────────────────────────────────────
     8. Requisição sem securityContext (null) → 403 (falha segura)
     ───────────────────────────────────────────────── */
  await t.test('8. Requisição sem securityContext retorna 403 (comportamento seguro por default)', async () => {
    const appSemCtx = buildApp(null);
    for (const rota of ROTAS_FINANCEIRAS_EXCLUSIVAS) {
      const { status } = await httpRequest(appSemCtx, rota.method, rota.path, { valor: 1 });
      assert.equal(status, 403, `Sem securityContext deve retornar 403 em ${rota.path}, mas recebeu ${status}`);
    }
  });

  /* ─────────────────────────────────────────────────
     9. Rotas de leitura simples (financial:read) são bloqueadas para mecânico/atendente
        (que não têm financial:read)
     ───────────────────────────────────────────────── */
  await t.test('9. Mecânico e Atendente (sem financial:read) recebem 403 em rotas de DRE e resumo financeiro', async () => {
    const rotasLeituraFinanceira = [
      '/api/financeiro/resumo',
      '/api/financeiro/dre',
      '/api/financeiro/movimentacoes'
    ];
    for (const ctx of [CTX_MECANICO, CTX_ATENDENTE]) {
      const app = buildApp(ctx);
      for (const p of rotasLeituraFinanceira) {
        const { status } = await httpRequest(app, 'GET', p);
        assert.equal(
          status, 403,
          `${ctx.role} deve receber 403 em GET ${p} (sem financial:read), mas recebeu ${status}`
        );
      }
    }
  });

  /* ─────────────────────────────────────────────────
     10. Rotas de pátio (leitura) são acessíveis ao mecânico (labor:read é aceito)
     ───────────────────────────────────────────────── */
  await t.test('10. Mecânico (labor:read) tem acesso a rotas de leitura de pátio', async () => {
    const rotasLeituraPatio = [
      '/api/financeiro/patio/boxes',
      '/api/financeiro/patio/gargalos',
      '/api/financeiro/patio/estoque'
    ];
    const app = buildApp(CTX_MECANICO);
    for (const p of rotasLeituraPatio) {
      const { status } = await httpRequest(app, 'GET', p);
      assert.notEqual(status, 403, `Mecânico não deve receber 403 em GET ${p} (labor:read é aceito), mas recebeu ${status}`);
    }
  });
});
