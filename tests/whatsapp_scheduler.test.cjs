'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const { initDB, run, closeDB, get } = require('../db');
const {
  executarCicloDisparoRelatorioDiario,
  jaEnviouHoje,
  registrarEnvioSucesso,
  _tentativasFalhaPorTenant,
  _ultimoDiaEnvioPorTenant
} = require('../services/whatsapp/whatsappScheduler');
const { setWppClient, getWppStatus } = require('../services/whatsapp/whatsappState');

test('Agendador de Relatório Diário do WhatsApp: Horário, Idempotência, Flags e Tolerância Offline', async (t) => {
  // Prepara banco temporário isolado para os testes
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'patio_wpp_sched_'));
  const testDb = path.join(tempDir, 'test_sched.db');
  process.env.DB_PATH = testDb;

  await initDB();

  // Limpa estados de controle em memória
  _tentativasFalhaPorTenant.clear();
  _ultimoDiaEnvioPorTenant.clear();

  const tenantAlfa = 'oficina_alfa_sched';
  const tenantBeta = 'oficina_beta_sched';

  // Seed do estado de dois tenants
  // Tenant Alfa: Envio automático ativado, horário 07:30, admin cadastrado
  const stateAlfa = {
    cfg: {
      horaRelatorioDiario: '07:30',
      envioAutomaticoRelatorio: true,
      relatorioApenasDiasUteis: false,
      adminFones: ['5511999990001']
    },
    os: [],
    clientes: []
  };

  // Tenant Beta: Envio automático expressamente desligado
  const stateBeta = {
    cfg: {
      horaRelatorioDiario: '07:30',
      envioAutomaticoRelatorio: false,
      relatorioApenasDiasUteis: false,
      adminFones: ['5511999990002']
    },
    os: [],
    clientes: []
  };

  await run('INSERT INTO kv (key, value) VALUES (?, ?)', [`tenant:${tenantAlfa}:state`, JSON.stringify(stateAlfa)]);
  await run('INSERT INTO kv (key, value) VALUES (?, ?)', [`tenant:${tenantBeta}:state`, JSON.stringify(stateBeta)]);

  // Garante que o cliente WhatsApp não seja mockado com envio de mensagens reais pela rede
  const wppStatus = getWppStatus();
  setWppClient(null);
  wppStatus.status = 'desconectado';

  // 1. Teste de Horário: Se horaAtual != horaConfigurada, não deve disparar
  await t.test('1. Horário configurado: ignora disparo se o horário não foi atingido', async () => {
    const res = await executarCicloDisparoRelatorioDiario({
      horaRef: '06:15',
      dryRun: false
    });

    const alfaResult = res.find(r => r.tenantKey === tenantAlfa);
    assert.ok(alfaResult, 'Deve avaliar tenant alfa');
    assert.equal(alfaResult.disparado, false);
    assert.equal(alfaResult.motivo, 'horario_nao_atingido');
    assert.equal(alfaResult.horaAtual, '06:15');
    assert.equal(alfaResult.horaConfig, '07:30');
  });

  // 2. Teste do Flag desligado: Se envioAutomaticoRelatorio === false, não envia
  await t.test('2. Flag envioAutomaticoRelatorio = false: respeita configuração e bloqueia disparo', async () => {
    const res = await executarCicloDisparoRelatorioDiario({
      horaRef: '07:30',
      dryRun: false
    });

    const betaResult = res.find(r => r.tenantKey === tenantBeta);
    assert.ok(betaResult, 'Deve avaliar tenant beta');
    assert.equal(betaResult.disparado, false);
    assert.equal(betaResult.motivo, 'envio_automatico_desativado');
  });

  // 3. Teste Modo Dry-Run: simula envio no horário sem disparar e sem persistir envio definitivo
  await t.test('3. Modo dry-run: simula aprovação do ciclo no horário sem disparos e sem registrar idempotência', async () => {
    const res = await executarCicloDisparoRelatorioDiario({
      horaRef: '07:30',
      dryRun: true
    });

    const alfaResult = res.find(r => r.tenantKey === tenantAlfa);
    assert.ok(alfaResult);
    assert.equal(alfaResult.disparado, true);
    assert.equal(alfaResult.dryRun, true);

    // Confirma que não gravou no banco de dados como enviado
    const enviado = await jaEnviouHoje(tenantAlfa, alfaResult.diaHoje);
    assert.equal(enviado, false, 'Dry-run não deve marcar relatório como já enviado');
  });

  // 4. Teste de Tolerância a WhatsApp Desconectado: registra no log e limita tentativas sem quebrar
  await t.test('4. WhatsApp offline: registra falha de conexão, respeita limite de tentativas e não lança exceção', async () => {
    // Garante que está offline
    setWppClient(null);
    wppStatus.status = 'desconectado';
    _tentativasFalhaPorTenant.clear();

    // 1ª tentativa
    const res1 = await executarCicloDisparoRelatorioDiario({
      horaRef: '07:30',
      dryRun: false,
      force: true
    });
    const r1 = res1.find(r => r.tenantKey === tenantAlfa);
    assert.equal(r1.disparado, false);
    assert.equal(r1.motivo, 'whatsapp_desconectado');
    assert.equal(r1.tentativa, 1);

    // 2ª tentativa (forçando retry)
    const res2 = await executarCicloDisparoRelatorioDiario({
      horaRef: '07:30',
      dryRun: false,
      force: true
    });
    const r2 = res2.find(r => r.tenantKey === tenantAlfa);
    assert.equal(r2.tentativa, 2);

    // 3ª tentativa
    const res3 = await executarCicloDisparoRelatorioDiario({
      horaRef: '07:30',
      dryRun: false,
      force: true
    });
    const r3 = res3.find(r => r.tenantKey === tenantAlfa);
    assert.equal(r3.tentativa, 3);

    // 4ª tentativa: deve atingir o limite e abortar sem tentar reenviar
    const res4 = await executarCicloDisparoRelatorioDiario({
      horaRef: '07:30',
      dryRun: false,
      force: true
    });
    const r4 = res4.find(r => r.tenantKey === tenantAlfa);
    assert.equal(r4.disparado, false);
    assert.equal(r4.motivo, 'whatsapp_desconectado_limite_atingido');
    assert.equal(r4.tentativas, 3);
  });

  // 5. Teste de Idempotência Durável: com mock seguro (sem rede), envia uma vez e bloqueia na segunda mesmo após restart
  await t.test('5. Idempotência durável: nunca envia o mesmo relatório duas vezes no mesmo dia (inclusive pós-restart)', async () => {
    const diaHoje = '2026-10-17';

    // Mock seguro do WhatsApp em memória (apenas registra chamadas, nunca dispara socket ou requisição)
    let mensagensEnviadas = [];
    const mockWppClient = {
      sendMessage: async (chatId, content) => {
        mensagensEnviadas.push({ chatId, content });
        return { id: { _serialized: `msg_mock_${Date.now()}` } };
      }
    };

    setWppClient(mockWppClient);
    wppStatus.status = 'pronto';

    // 1º Envio
    const resEnvio1 = await executarCicloDisparoRelatorioDiario({
      horaRef: '07:30',
      dataRef: diaHoje,
      force: true
    });

    const rAlfa1 = resEnvio1.find(r => r.tenantKey === tenantAlfa);
    assert.equal(rAlfa1.disparado, true);
    assert.equal(rAlfa1.sucesso, true);

    // Confirma gravação durável no SQLite
    const rowKv = await get(
      'SELECT value FROM kv WHERE key = ?',
      [`tenant:${tenantAlfa}:relatorio_diario_enviado:${diaHoje}`]
    );
    assert.ok(rowKv && rowKv.value, 'Registro de envio diário deve persistir no banco SQLite');
    const parsedKv = JSON.parse(rowKv.value);
    assert.equal(parsedKv.diaISO, diaHoje);
    assert.equal(parsedKv.tenantKey, tenantAlfa);

    // 2º Envio no mesmo horário e dia: deve ser rejeitado por idempotência
    const resEnvio2 = await executarCicloDisparoRelatorioDiario({
      horaRef: '07:30',
      dataRef: diaHoje
    });

    const rAlfa2 = resEnvio2.find(r => r.tenantKey === tenantAlfa);
    assert.equal(rAlfa2.disparado, false);
    assert.equal(rAlfa2.motivo, 'ja_enviado_hoje');

    // 3º Simula Restart do Servidor: limpamos o cache em memória
    _ultimoDiaEnvioPorTenant.clear();

    const resEnvioAposRestart = await executarCicloDisparoRelatorioDiario({
      horaRef: '07:30',
      dataRef: diaHoje
    });

    const rAlfaRestart = resEnvioAposRestart.find(r => r.tenantKey === tenantAlfa);
    assert.equal(rAlfaRestart.disparado, false, 'Mesmo após restart e cache limpo, deve consultar SQLite e bloquear');
    assert.equal(rAlfaRestart.motivo, 'ja_enviado_hoje');
  });

  // 6. Teste de RBAC na rota /api/whatsapp/agendador-relatorio/executar
  await t.test('6. RBAC: mecanico e atendente recebem 403 ao tentar executar agendador de relatório', async () => {
    const { requirePermission } = require('../lib/serverContext');
    const userRepository = require('../lib/auth/userRepository');

    const mw = requirePermission('whatsapp:admin', 'financial:write');

    // Simula atendente
    let statusAtendente = null;
    let jsonAtendente = null;
    const reqAtendente = {
      securityContext: {
        role: 'atendente',
        permissions: userRepository.ROLE_PERMISSIONS.atendente
      }
    };
    const resAtendente = {
      status(code) { statusAtendente = code; return this; },
      json(obj) { jsonAtendente = obj; return this; }
    };
    mw(reqAtendente, resAtendente, () => {
      assert.fail('Atendente não deveria ter permissão');
    });
    assert.equal(statusAtendente, 403, 'Atendente deve receber status 403');
    assert.ok(jsonAtendente && jsonAtendente.error.includes('Acesso negado'));

    // Simula mecanico
    let statusMecanico = null;
    let jsonMecanico = null;
    const reqMecanico = {
      securityContext: {
        role: 'mecanico',
        permissions: userRepository.ROLE_PERMISSIONS.mecanico
      }
    };
    const resMecanico = {
      status(code) { statusMecanico = code; return this; },
      json(obj) { jsonMecanico = obj; return this; }
    };
    mw(reqMecanico, resMecanico, () => {
      assert.fail('Mecanico não deveria ter permissão');
    });
    assert.equal(statusMecanico, 403, 'Mecanico deve receber status 403');
    assert.ok(jsonMecanico && jsonMecanico.error.includes('Acesso negado'));

    // Simula financeiro ou admin (permissão concedida)
    let nextChamado = false;
    const reqFinanceiro = {
      securityContext: {
        role: 'financeiro',
        permissions: userRepository.ROLE_PERMISSIONS.financeiro
      }
    };
    mw(reqFinanceiro, {}, () => {
      nextChamado = true;
    });
    assert.equal(nextChamado, true, 'Financeiro deve ter acesso concedido');
  });

  // 7. Teste de Notificação de Caixa via WhatsApp (Abertura e Fechamento)
  await t.test('7. Aviso de Caixa WhatsApp: flag ligado, desligado, WhatsApp offline tolerante e formato da mensagem', async () => {
    const { notificarEventoCaixaWhatsApp } = require('../services/reportGenerationService');

    const stateComFlagLigado = {
      cfg: {
        avisarCaixaWhatsapp: true,
        grupoAdminId: '120363000000000001@g.us'
      }
    };

    const stateComFlagDesligado = {
      cfg: {
        avisarCaixaWhatsapp: false,
        grupoAdminId: '120363000000000001@g.us'
      }
    };

    // A. Flag desligado -> não dispara
    const resDesligado = await notificarEventoCaixaWhatsApp({
      tipo: 'abertura',
      operadorNome: 'Carlos Atendente',
      saldoInicial: 250,
      state: stateComFlagDesligado,
      dryRun: false
    });
    assert.equal(resDesligado.disparado, false);
    assert.equal(resDesligado.motivo, 'flag_desligado');

    // B. Flag ligado e modo dryRun -> formata mensagem e valida dados
    const resAberturaDry = await notificarEventoCaixaWhatsApp({
      tipo: 'abertura',
      operadorNome: 'Carlos Atendente',
      saldoInicial: 300,
      state: stateComFlagLigado,
      dryRun: true
    });
    assert.equal(resAberturaDry.disparado, true);
    assert.equal(resAberturaDry.dryRun, true);
    assert.ok(resAberturaDry.mensagem.includes('Aviso de Abertura de Caixa'));
    assert.ok(resAberturaDry.mensagem.includes('Carlos Atendente'));
    assert.ok(resAberturaDry.mensagem.includes('R$ 300,00') || resAberturaDry.mensagem.includes('300,00'));

    const resFechamentoDry = await notificarEventoCaixaWhatsApp({
      tipo: 'fechamento',
      operadorNome: 'Ana Gerente',
      saldoFinal: 1850.50,
      diferenca: -15.00,
      state: stateComFlagLigado,
      dryRun: true
    });
    assert.equal(resFechamentoDry.disparado, true);
    assert.ok(resFechamentoDry.mensagem.includes('Aviso de Fechamento de Caixa'));
    assert.ok(resFechamentoDry.mensagem.includes('Ana Gerente'));
    assert.ok(resFechamentoDry.mensagem.includes('1.850,50'));
    assert.ok(resFechamentoDry.mensagem.includes('Quebra de -'));

    // C. WhatsApp offline -> não lança exceção e retorna motivo sem quebrar operação
    setWppClient(null);
    wppStatus.status = 'desconectado';

    const resOffline = await notificarEventoCaixaWhatsApp({
      tipo: 'abertura',
      operadorNome: 'Carlos Atendente',
      saldoInicial: 100,
      state: stateComFlagLigado,
      dryRun: false
    });
    assert.equal(resOffline.disparado, false);
    assert.equal(resOffline.motivo, 'whatsapp_desconectado');

    // D. WhatsApp conectado com Mock -> envia mensagem com sucesso
    let msgsEnviadas = [];
    const mockClientCaixa = {
      sendMessage: async (chatId, msg) => {
        msgsEnviadas.push({ chatId, msg });
        return { id: { _serialized: `msg_cx_${Date.now()}` } };
      }
    };
    setWppClient(mockClientCaixa);
    wppStatus.status = 'pronto';

    const resEnvioOk = await notificarEventoCaixaWhatsApp({
      tipo: 'fechamento',
      operadorNome: 'Ana Gerente',
      saldoFinal: 2000,
      diferenca: 0,
      state: stateComFlagLigado,
      dryRun: false
    });
    assert.equal(resEnvioOk.disparado, true);
    assert.equal(resEnvioOk.sucesso, true);
    assert.equal(msgsEnviadas.length, 1);
    assert.equal(msgsEnviadas[0].chatId, '120363000000000001@g.us');
    assert.ok(msgsEnviadas[0].msg.includes('Aviso de Fechamento de Caixa'));
  });

  // Limpeza
  await closeDB();
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch (_) {}
});

