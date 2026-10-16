'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const net = require('node:net');

const financialAnalystService = require('../services/financialAnalystService');
const voiceActionEngine = require('../services/voiceActionEngine');

test('Verônica Analista Financeira & Assistente Gerencial: Motor, Voz, RBAC e Endpoints REST', { timeout: 60000 }, async (t) => {

  // ─────────────────────────────────────────────────────────────────
  // 1. TESTES UNITÁRIOS DO MOTOR (SERVICES/FINANCIALANALYSTSERVICE.JS)
  // ─────────────────────────────────────────────────────────────────

  await t.test('1. Ciclo Completo de Caixa Diário (Abertura, Lançamentos, Sangria, Bloqueio Duplo e Fechamento)', () => {
    const state = {
      caixas: [],
      movimentos: [],
      contas: [],
      os: [],
      cfg: { caixaMinimoSeguranca: 1500 }
    };

    // A. Abertura de Caixa
    const resAbertura = financialAnalystService.abrirCaixa(state, {
      saldoInicial: 200,
      operador: 'Carlos Caixa',
      observacoes: 'Turno Matutino'
    });

    assert.equal(resAbertura.ok, true);
    assert.equal(resAbertura.caixa.status, 'aberto');
    assert.equal(resAbertura.caixa.saldoInicial, 200);
    assert.equal(resAbertura.caixa.saldoAtual, 200);
    assert.equal(state.caixas.length, 1);

    // B. Bloqueio de Dupla Abertura
    const resDupla = financialAnalystService.abrirCaixa(state, {
      saldoInicial: 50,
      operador: 'Outro Operador'
    });
    assert.equal(resDupla.ok, false);
    assert.equal(resDupla.code, 'CAIXA_JA_ABERTO');
    assert.ok(resDupla.error.includes('Já existe um caixa aberto'));

    // C. Lançamento de Receita
    const resRec = financialAnalystService.registrarMovimentacao(state, {
      tipo: 'receita',
      valor: 850.50,
      formaPagamento: 'pix',
      categoria: 'Serviços',
      descricao: 'Pagamento de alinhamento e balanceamento',
      osId: 'os_100',
      clienteId: 'cli_50'
    });
    assert.equal(resRec.ok, true);
    assert.equal(resRec.movimento.tipo, 'entrada');
    assert.equal(resRec.movimento.formaPagamento, 'pix');
    assert.equal(resRec.caixa.saldoAtual, 1050.50);
    assert.equal(resRec.caixa.totalEntradas, 850.50);

    // D. Lançamento de Despesa
    const resDesp = financialAnalystService.registrarMovimentacao(state, {
      tipo: 'despesa',
      valor: 120.00,
      formaPagamento: 'dinheiro',
      categoria: 'Materiais',
      descricao: 'Compra de graxa e desengraxante'
    });
    assert.equal(resDesp.ok, true);
    assert.equal(resDesp.movimento.tipo, 'saida');
    assert.equal(resDesp.caixa.saldoAtual, 930.50);
    assert.equal(resDesp.caixa.totalSaidas, 120.00);

    // E. Lançamento de Sangria
    const resSangria = financialAnalystService.registrarMovimentacao(state, {
      tipo: 'sangria',
      valor: 300.00,
      formaPagamento: 'dinheiro',
      descricao: 'Sangria de segurança para o cofre'
    });
    assert.equal(resSangria.ok, true);
    assert.equal(resSangria.movimento.subtipo, 'sangria');
    assert.equal(resSangria.caixa.saldoAtual, 630.50);
    assert.equal(resSangria.caixa.totalSaidas, 420.00);

    // F. Fechamento de Caixa com Conferência Cega
    // Saldo esperado: 200 (inicial) + 850.50 (pix) - 120 (dinheiro) - 300 (dinheiro) = 630.50
    // Saldo em dinheiro esperado: 200 - 120 - 300 = -220? Inicial 200 din, saida 420 din -> -220
    const resFechamento = financialAnalystService.fecharCaixa(state, {
      conferenciaCega: {
        dinheiro: 0,
        pix: 850.50
      },
      observacoes: 'Fechamento turno matutino conferido com supervisor',
      operadorFechamento: 'Supervisor Marcos'
    });

    assert.equal(resFechamento.ok, true);
    assert.equal(resFechamento.fechamento.status, 'fechado');
    assert.equal(resFechamento.fechamento.saldoFinalSistema, 630.50);
    assert.equal(resFechamento.fechamento.saldoInformadoConferencia, 850.50);
    assert.ok(resFechamento.fechamento.diferencaApurada != null);
    assert.equal(financialAnalystService.obterCaixaAberto(state), null, 'Caixa agora deve estar fechado');

    // G. Tentar movimentar com caixa fechado deve falhar
    const resPosFechamento = financialAnalystService.registrarMovimentacao(state, {
      tipo: 'despesa',
      valor: 50,
      descricao: 'Tentativa sem caixa aberto'
    });
    assert.equal(resPosFechamento.ok, false);
    assert.equal(resPosFechamento.code, 'CAIXA_FECHADO');
  });

  await t.test('2. Previsão de Fluxo de Caixa (Forecast 7/15/30d), Potencial de Pátio e Detecção de Risco de Furo', () => {
    const hoje = new Date().toISOString().slice(0, 10);
    const somarDias = (dias) => {
      const d = new Date();
      d.setDate(d.getDate() + dias);
      return d.toISOString().slice(0, 10);
    };

    const state = {
      cfg: { caixaMinimoSeguranca: 3000 },
      caixas: [
        { id: 'cx_ativo', status: 'aberto', saldoAtual: 2500 }
      ],
      movimentos: [
        { id: 'm1', tipo: 'entrada', valor: 2500, data: hoje }
      ],
      contas: [
        // Recebimentos futuros
        { id: 'c_rec1', tipo: 'receber', valor: 4000, venc: somarDias(5), pago: false },
        { id: 'c_rec2', tipo: 'receber', valor: 3500, venc: somarDias(12), pago: false },
        // Pagamentos futuros que geram risco temporário no dia 20
        { id: 'c_pag1', tipo: 'pagar', valor: 1500, venc: somarDias(3), pago: false },
        { id: 'c_pag2', tipo: 'pagar', valor: 8000, venc: somarDias(20), pago: false }
      ],
      os: [
        // OS em execução no pátio (potencial de receita)
        { id: 'os1', num: 101, st: 'executando', total: 6000 },
        { id: 'os2', num: 102, st: 'aprovacao', total: 4000 },
        { id: 'os3', num: 103, st: 'finalizada', total: 3000 } // Não conta no potencial ativo
      ],
      quotations: [
        // Orçamento pendente
        { id: 'orc1', status: 'enviado', totalGeral: 5000 }
      ]
    };

    const prev = financialAnalystService.gerarPrevisaoFluxoCaixa(state, { horizonteDias: 30 });

    assert.equal(prev.horizonteDias, 30);
    assert.equal(prev.caixaMinimoSeguranca, 3000);
    assert.ok(prev.totaisPeriodo.aReceber >= 7500);
    assert.ok(prev.totaisPeriodo.aPagar >= 9500);

    // Valida marcos
    assert.ok(prev.marcos.em7Dias);
    assert.ok(prev.marcos.em15Dias);
    assert.ok(prev.marcos.em30Dias);

    // Valida Receita Potencial de Pátio
    // OS ativas: 6000 + 4000 = 10000. Orçamentos pendentes: 5000.
    // Provável: 10000*0.8 + 5000*0.4 = 8000 + 2000 = 10000
    // Conservador: 10000*0.5 + 5000*0.15 = 5000 + 750 = 5750
    assert.equal(prev.receitaPotencialPatio.totalOSAtivas, 10000);
    assert.equal(prev.receitaPotencialPatio.totalOrcamentosPendentes, 5000);
    assert.equal(prev.receitaPotencialPatio.cenarioProvavel, 10000);
    assert.equal(prev.receitaPotencialPatio.cenarioConservador, 5750);

    // Valida Diagnóstico de Furo (devido à despesa pesada de 8000 no dia 20)
    assert.equal(prev.diagnosticoFuro.furoDetectado, true, 'Deve identificar risco de saldo abaixo do limite de segurança');
    assert.ok(prev.diagnosticoFuro.dataPrimeiroFuro != null);
  });

  await t.test('3. Auditoria de Controles Internos: Vazamento de Receita em OS e Inadimplência Crítica', () => {
    const hoje = new Date().toISOString().slice(0, 10);
    const ontem = new Date(Date.now() - 86400000 * 5).toISOString().slice(0, 10);

    const state = {
      os: [
        // OS 201 finalizada sem nenhum título a receber ou movimento vinculado (vazamento!)
        { id: 'os_201', num: 201, st: 'finalizada', total: 4500 },
        // OS 202 finalizada com conta a receber vinculada (OK)
        { id: 'os_202', num: 202, st: 'finalizada', total: 1800 }
      ],
      contas: [
        { id: 'c_os202', osId: 'os_202', tipo: 'receber', valor: 1800, venc: hoje, pago: false },
        // Título vencido há 5 dias (inadimplência crítica)
        { id: 'c_vencida', tipo: 'receber', valor: 3200, venc: ontem, pago: false, parte: 'Transportes Expresso' }
      ],
      movimentos: [],
      caixas: []
    };

    const auditoria = financialAnalystService.avaliarControlesInternos(state);
    assert.ok(['alerta', 'critico'].includes(auditoria.statusGeral));
    assert.ok(auditoria.anomalias.length >= 2);

    const vazamento = auditoria.anomalias.find(a => a.tipo === 'os_sem_financeiro' || a.tipo === 'vazamento_receita');
    assert.ok(vazamento, 'Deve identificar OS finalizada sem registro financeiro');
    assert.equal(vazamento.severidade, 'critico');
    assert.ok(vazamento.descricao.includes('201'));

    const inadimplencia = auditoria.anomalias.find(a => a.tipo === 'inadimplencia_critica' || a.tipo === 'inadimplencia');
    assert.ok(inadimplencia, 'Deve identificar títulos vencidos');
    assert.ok(inadimplencia.descricao.includes('3.200') || inadimplencia.descricao.includes('3200'));

    // Teste de formatação do Parecer Executivo
    const parecer = financialAnalystService.formatarParecerExecutivoVerônica(state);
    assert.ok(parecer.includes('PARECER FINANCEIRO') || parecer.includes('PARECER EXECUTIVO'));
    assert.ok(parecer.includes('DISPONIBILIDADE E LIQUIDEZ'));
    assert.ok(parecer.includes('AUDITORIA & CONTROLES INTERNOS'));
    assert.ok(parecer.includes('Vazamento de Receita'));
  });

  await t.test('4. Comandos de Voz Financeiros via voiceActionEngine', async () => {
    const state = {
      caixas: [],
      movimentos: [],
      contas: [
        { id: 'c1', tipo: 'receber', valor: 1200, venc: new Date().toISOString().slice(0, 10), pago: false }
      ],
      os: [
        { id: 'os1', num: 55, st: 'executando', total: 2000 }
      ],
      cfg: { caixaMinimoSeguranca: 1000 }
    };

    const finAdminContext = {
      role: 'tenant_admin',
      permissions: ['*'],
      tenantId: 'test_voice'
    };

    // A. Abrir Caixa por voz
    const resVozAbrir = await voiceActionEngine.interpretarEExecutar({
      input: { text: 'abrir caixa com 150 reais' },
      context: finAdminContext,
      state
    });
    assert.equal(resVozAbrir.ok, true);
    assert.equal(resVozAbrir.acao, 'abrir_caixa');
    assert.ok(resVozAbrir.resposta.includes('Caixa aberto com sucesso'));
    assert.equal(state.caixas.length, 1);
    assert.equal(state.caixas[0].saldoInicial, 150);

    // B. Lançar despesa por voz
    const resVozDesp = await voiceActionEngine.interpretarEExecutar({
      input: { text: 'lancar despesa de 40 reais compra de fita adesiva' },
      context: finAdminContext,
      state
    });
    assert.equal(resVozDesp.ok, true);
    assert.equal(resVozDesp.acao, 'registrar_movimentacao_caixa');
    assert.ok(resVozDesp.resposta.includes('40'));
    assert.equal(state.caixas[0].saldoAtual, 110);

    // C. Consultar Previsão por voz
    const resVozPrev = await voiceActionEngine.interpretarEExecutar({
      input: { text: 'qual a previsao de fluxo de caixa' },
      context: finAdminContext,
      state
    });
    assert.equal(resVozPrev.ok, true);
    assert.equal(resVozPrev.acao, 'consultar_previsao_caixa');
    assert.ok(resVozPrev.resposta.includes('Previsão de Fluxo de Caixa'));

    // D. Consultar Auditoria por voz
    const resVozAudit = await voiceActionEngine.interpretarEExecutar({
      input: { text: 'auditoria de controles internos' },
      context: finAdminContext,
      state
    });
    assert.equal(resVozAudit.ok, true);
    assert.equal(resVozAudit.acao, 'consultar_auditoria_financeira');
    assert.ok(resVozAudit.resposta.includes('PARECER') || resVozAudit.resposta.includes('Verônica') || resVozAudit.resposta.includes('Auditoria'));

    // E. Fechar Caixa por voz
    const resVozFechar = await voiceActionEngine.interpretarEExecutar({
      input: { text: 'fechar o caixa' },
      context: finAdminContext,
      state
    });
    assert.equal(resVozFechar.ok, true);
    assert.equal(resVozFechar.acao, 'fechar_caixa');
    assert.ok(resVozFechar.resposta.includes('Caixa encerrado com sucesso'));
  });

  // ─────────────────────────────────────────────────────────────────
  // 2. TESTES DE INTEGRAÇÃO HTTP DAS ROTAS /API/FINANCEIRO/* E RBAC
  // ─────────────────────────────────────────────────────────────────

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'patio-fin-analyst-'));
  const dbPath = path.join(tempDir, 'fin_test.db');
  const uploadDir = path.join(tempDir, 'uploads');
  fs.mkdirSync(uploadDir, { recursive: true });

  process.env.TOKEN_SECRET = 'segredo-teste-hmac-fin-2026';
  process.env.DB_PATH = dbPath;

  const db = require('../db');
  await db.initDB();

  const userRepo = require('../lib/auth/userRepository');
  await userRepo.createUser({
    username: 'admin_fin',
    email: 'admin@fin.com',
    password: 'SenhaAdminFin#2026',
    role: 'admin',
    tenantId: 'tenant_fin',
    fullName: 'Diretor Financeiro'
  });

  await userRepo.createUser({
    username: 'mecanico_fin',
    email: 'mecanico@fin.com',
    password: 'SenhaMecanicoFin#2026',
    role: 'mecanico',
    tenantId: 'tenant_fin',
    fullName: 'Mecânico Box 1'
  });

  const hojeHttp = new Date().toISOString().slice(0, 10);
  const mockHttpState = {
    versao: 1,
    caixas: [],
    movimentos: [],
    contas: [
      { id: 'c_rec_http', tipo: 'receber', valor: 3500, venc: hojeHttp, pago: false, parte: 'Frotista Alfa' },
      { id: 'c_pag_http', tipo: 'pagar', valor: 1200, venc: hojeHttp, pago: false, parte: 'Auto Peças Express' }
    ],
    os: [
      { id: 'os_http_1', num: 701, st: 'executando', total: 5500 }
    ],
    quotations: [
      { id: 'orc_http_1', status: 'enviado', totalGeral: 2800 }
    ],
    cfg: {
      caixaMinimoSeguranca: 2000
    }
  };

  const { persistState } = require('../lib/repository/stateRepository');
  await persistState({ tenantId: 'tenant_fin', role: 'admin', permissions: ['*'], actorId: 'seed' }, mockHttpState);
  await db.closeDB();

  const probe = net.createServer();
  probe.listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const port = probe.address().port;
  await new Promise(r => probe.close(r));

  const child = spawn(process.execPath, ['server.js'], {
    cwd: path.resolve(__dirname, '..'),
    windowsHide: true,
    env: {
      ...process.env,
      PORT: String(port),
      HOST: '127.0.0.1',
      API_KEY: 'master-fin-test-key',
      DB_PATH: dbPath,
      UPLOAD_DIR: uploadDir,
      DISABLE_WHATSAPP: 'true',
      DISABLE_INTEGRATIONS: 'true',
      NODE_ENV: 'test'
    }
  });

  t.after(async () => {
    if (child.exitCode === null) {
      const exitDone = once(child, 'exit');
      child.kill();
      await exitDone.catch(() => {});
    }
    for (let i = 0; i < 5; i++) {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
        break;
      } catch (_) {
        await new Promise(r => setTimeout(r, 100));
      }
    }
  });

  const baseUrl = `http://127.0.0.1:${port}`;
  let online = false;
  for (let i = 0; i < 50; i++) {
    try {
      const res = await fetch(`${baseUrl}/health`);
      if (res.ok) { online = true; break; }
    } catch (_) {}
    await new Promise(r => setTimeout(r, 100));
  }
  assert.ok(online, 'Servidor deve inicializar e responder /health');

  const basicAuth = (user, pass) => 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64');
  const authAdmin = basicAuth('admin_fin', 'SenhaAdminFin#2026');
  const authMecanico = basicAuth('mecanico_fin', 'SenhaMecanicoFin#2026');

  await t.test('5. RBAC nas rotas /api/financeiro/* (401 sem auth, 403 mecânico, 200 admin)', async () => {
    // A. Não autenticado -> 401
    const resAnon = await fetch(`${baseUrl}/api/financeiro/resumo`, {
      headers: { 'x-tenant-id': 'tenant_fin' }
    });
    assert.equal(resAnon.status, 401, 'Requisição anônima deve ser rejeitada com 401');

    // B. Mecânico sem permissão -> 403
    const resMec = await fetch(`${baseUrl}/api/financeiro/resumo`, {
      headers: { Authorization: authMecanico, 'x-tenant-id': 'tenant_fin' }
    });
    assert.equal(resMec.status, 403, 'Mecânico sem financial:read deve receber 403 Forbidden');

    // C. Admin -> 200
    const resAdmin = await fetch(`${baseUrl}/api/financeiro/resumo`, {
      headers: { Authorization: authAdmin, 'x-tenant-id': 'tenant_fin' }
    });
    assert.equal(resAdmin.status, 200, 'Admin deve acessar com sucesso');
    const dataResumo = await resAdmin.json();
    assert.equal(dataResumo.success, true);
    assert.equal(dataResumo.statusCaixa, 'fechado');
    assert.ok(dataResumo.previsao);
    assert.ok(dataResumo.auditoria);
  });

  await t.test('6. POST /api/financeiro/caixa/abrir e bloqueio de dupla abertura', async () => {
    const res = await fetch(`${baseUrl}/api/financeiro/caixa/abrir`, {
      method: 'POST',
      headers: {
        Authorization: authAdmin,
        'Content-Type': 'application/json',
        'x-tenant-id': 'tenant_fin'
      },
      body: JSON.stringify({
        saldoInicial: 350.00,
        observacoes: 'Abertura de teste automatizado',
        operador: 'Operador Admin'
      })
    });
    assert.equal(res.status, 201);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.equal(data.caixa.status, 'aberto');
    assert.equal(data.caixa.saldoInicial, 350);

    // Tentar abrir novamente no mesmo tenant
    const resDupla = await fetch(`${baseUrl}/api/financeiro/caixa/abrir`, {
      method: 'POST',
      headers: {
        Authorization: authAdmin,
        'Content-Type': 'application/json',
        'x-tenant-id': 'tenant_fin'
      },
      body: JSON.stringify({ saldoInicial: 100 })
    });
    assert.equal(resDupla.status, 409);
    const dataDupla = await resDupla.json();
    assert.equal(dataDupla.code, 'CAIXA_JA_ABERTO');
  });

  await t.test('7. POST e GET /api/financeiro/movimentacoes', async () => {
    // Lançamento de Receita
    const resMov = await fetch(`${baseUrl}/api/financeiro/movimentacoes`, {
      method: 'POST',
      headers: {
        Authorization: authAdmin,
        'Content-Type': 'application/json',
        'x-tenant-id': 'tenant_fin'
      },
      body: JSON.stringify({
        tipo: 'receita',
        valor: 500.00,
        formaPagamento: 'pix',
        categoria: 'Serviços',
        descricao: 'Serviço de freio concluído'
      })
    });
    assert.equal(resMov.status, 201);
    const dataMov = await resMov.json();
    assert.equal(dataMov.success, true);
    assert.equal(dataMov.movimento.tipo, 'entrada');
    assert.equal(dataMov.caixa.saldoAtual, 850); // 350 inicial + 500

    // Listagem de movimentações
    const resList = await fetch(`${baseUrl}/api/financeiro/movimentacoes`, {
      headers: { Authorization: authAdmin, 'x-tenant-id': 'tenant_fin' }
    });
    assert.equal(resList.status, 200);
    const dataList = await resList.json();
    assert.ok(dataList.movimentacoes.length >= 1);
  });

  await t.test('8. GET /api/financeiro/fluxo-caixa (Realizado e Forecast)', async () => {
    const res = await fetch(`${baseUrl}/api/financeiro/fluxo-caixa?dias=30`, {
      headers: { Authorization: authAdmin, 'x-tenant-id': 'tenant_fin' }
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.ok(data.fluxoRealizado);
    assert.ok(data.previsao);
    assert.equal(data.previsao.horizonteDias, 30);
    assert.ok(data.previsao.receitaPotencialPatio.cenarioProvavel > 0);
  });

  await t.test('9. GET /api/financeiro/controles-internos e Parecer Executivo', async () => {
    const res = await fetch(`${baseUrl}/api/financeiro/controles-internos`, {
      headers: { Authorization: authAdmin, 'x-tenant-id': 'tenant_fin' }
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.ok(data.auditoria);
    assert.ok(data.parecerExecutivo);
    assert.ok(data.parecerExecutivo.includes('PARECER EXECUTIVO'));
  });

  await t.test('10. POST /api/financeiro/caixa/fechar com conciliação e conferência cega', async () => {
    const res = await fetch(`${baseUrl}/api/financeiro/caixa/fechar`, {
      method: 'POST',
      headers: {
        Authorization: authAdmin,
        'Content-Type': 'application/json',
        'x-tenant-id': 'tenant_fin'
      },
      body: JSON.stringify({
        conferenciaCega: {
          dinheiro: 350.00,
          pix: 500.00
        },
        observacoes: 'Fechamento final conferido com sucesso'
      })
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.equal(data.fechamento.status, 'fechado');
    assert.equal(data.fechamento.saldoFinalSistema, 850);
  });

  await t.test('11. Integração com Endpoint de Voz /api/comando-voz para ações financeiras', async () => {
    const resVoz = await fetch(`${baseUrl}/api/comando-voz`, {
      method: 'POST',
      headers: {
        Authorization: authAdmin,
        'Content-Type': 'application/json',
        'x-tenant-id': 'tenant_fin'
      },
      body: JSON.stringify({
        text: 'qual a previsao de fluxo de caixa'
      })
    });
    assert.equal(resVoz.status, 200);
    const dataVoz = await resVoz.json();
    assert.equal(dataVoz.ok, true);
    assert.equal(dataVoz.acao, 'consultar_previsao_caixa');
    assert.ok(dataVoz.resposta);
  });
});
