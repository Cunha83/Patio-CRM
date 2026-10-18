'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const { initDB, run, closeDB, get, all } = require('../db');
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
  await t.test('4. WhatsApp offline vs desabilitado por flag: flag pula em silêncio; offline habilitado mantém retry', async () => {
    // A. WhatsApp desabilitado por flag -> pula em silêncio sem acumular tentativas de falha
    process.env.DISABLE_WHATSAPP = 'true';
    _tentativasFalhaPorTenant.clear();

    const resFlag = await executarCicloDisparoRelatorioDiario({
      horaRef: '07:30',
      dryRun: false,
      force: true
    });
    const rFlag = resFlag.find(r => r.tenantKey === tenantAlfa);
    assert.equal(rFlag.disparado, false);
    assert.equal(rFlag.motivo, 'whatsapp_desabilitado_por_flag');
    assert.equal(_tentativasFalhaPorTenant.get(tenantAlfa)?.tentativas || 0, 0, 'Não deve incrementar tentativas de erro quando desligado por flag');

    // B. WhatsApp habilitado (DISABLE_WHATSAPP removido/false) porém offline -> mantém tentativas e retry
    delete process.env.DISABLE_WHATSAPP;
    const oldDisableInt = process.env.DISABLE_INTEGRATIONS;
    delete process.env.DISABLE_INTEGRATIONS; // Permite simular WhatsApp ativo na config de ambiente

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

    // Restaura ambiente
    if (oldDisableInt !== undefined) process.env.DISABLE_INTEGRATIONS = oldDisableInt;
  });

  // 5. Teste de Idempotência Durável: com mock seguro (sem rede), envia uma vez e bloqueia na segunda mesmo após restart
  await t.test('5. Idempotência durável: nunca envia o mesmo relatório duas vezes no mesmo dia (inclusive pós-restart)', async () => {
    const diaHoje = '2026-10-17';
    delete process.env.DISABLE_INTEGRATIONS;
    delete process.env.DISABLE_WHATSAPP;

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

    // Simula mecanico (negativo -> 403)
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

    // Simula atendente (negativo -> 403)
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

    // Simula Dono (tenant_admin) e Financeiro executando o handler da rota com dryRun (positivo -> 200)
    const handler = async (req, res) => {
      const { dryRun, force, horaRef, dataRef } = req.body || {};
      const resultados = await executarCicloDisparoRelatorioDiario({
        dryRun: Boolean(dryRun),
        force: Boolean(force),
        horaRef,
        dataRef
      });
      res.status(200).json({ success: true, resultados });
    };

    // Dono (tenant_admin)
    let statusDono = null;
    let jsonDono = null;
    const reqDono = {
      securityContext: {
        role: 'tenant_admin',
        permissions: userRepository.ROLE_PERMISSIONS.tenant_admin
      },
      body: { dryRun: true, force: true }
    };
    const resDono = {
      statusCode: 200,
      status(c) { this.statusCode = c; statusDono = c; return this; },
      json(o) { jsonDono = o; return this; }
    };

    let mwDonoPassou = false;
    await new Promise((resolve) => {
      mw(reqDono, resDono, async () => {
        mwDonoPassou = true;
        await handler(reqDono, resDono);
        resolve();
      });
    });
    assert.equal(mwDonoPassou, true, 'Dono deve passar pelo middleware RBAC');
    assert.equal(statusDono || resDono.statusCode, 200, 'Dono deve receber HTTP 200');
    assert.equal(jsonDono?.success, true);

    // Financeiro
    let statusFin = null;
    let jsonFin = null;
    const reqFin = {
      securityContext: {
        role: 'financeiro',
        permissions: userRepository.ROLE_PERMISSIONS.financeiro
      },
      body: { dryRun: true, force: true }
    };
    const resFin = {
      statusCode: 200,
      status(c) { this.statusCode = c; statusFin = c; return this; },
      json(o) { jsonFin = o; return this; }
    };

    let mwFinPassou = false;
    await new Promise((resolve) => {
      mw(reqFin, resFin, async () => {
        mwFinPassou = true;
        await handler(reqFin, resFin);
        resolve();
      });
    });
    assert.equal(mwFinPassou, true, 'Financeiro deve passar pelo middleware RBAC');
    assert.equal(statusFin || resFin.statusCode, 200, 'Financeiro deve receber HTTP 200');
    assert.equal(jsonFin?.success, true);
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

  // 8. Teste de RBAC e Auditoria: Apenas Dono altera configurações sensíveis do WhatsApp
  await t.test('8. RBAC e Auditoria: Dono altera campos sensíveis com 200 e auditoria; financeiro, atendente e mecânico recebem 403', async () => {
    const whatsappRoutes = require('../routes/whatsapp.routes');
    const routePostConfig = whatsappRoutes.stack.find(
      layer => layer.route && layer.route.path === '/api/whatsapp/config-relatorio' && layer.route.methods.post
    );
    assert.ok(routePostConfig, 'Rota POST /api/whatsapp/config-relatorio deve existir');
    const handler = routePostConfig.route.stack[routePostConfig.route.stack.length - 1].handle;

    const payloadSensivel = {
      comandosFinanceirosEscrita: true,
      limiteValorLancamentoWhatsapp: 2500.00,
      adminFones: ['5511999990001', '5511999990002'],
      avisarCaixaWhatsapp: true
    };

    // A. Não-Donos (financeiro, atendente, mecanico) devem receber 403
    for (const nonOwnerRole of ['financeiro', 'atendente', 'mecanico']) {
      let statusCode = null;
      let jsonResponse = null;
      const req = {
        securityContext: { role: nonOwnerRole, actorId: `user_${nonOwnerRole}`, tenantId: tenantAlfa },
        headers: { 'x-tenant-id': tenantAlfa },
        body: payloadSensivel
      };
      const res = {
        status(c) { statusCode = c; return this; },
        json(j) { jsonResponse = j; return this; }
      };

      await handler(req, res);
      assert.equal(statusCode, 403, `Perfil ${nonOwnerRole} deve receber HTTP 403 ao tentar alterar campos sensíveis`);
      assert.match(jsonResponse.error, /restrita ao perfil dono/i);
    }

    // B. Dono (dono / tenant_admin) deve receber 200 OK e persistir com auditoria
    let statusDono = null;
    let jsonDono = null;
    const reqDono = {
      securityContext: { role: 'dono', actorId: 'dono_alfa', tenantId: tenantAlfa },
      headers: { 'x-tenant-id': tenantAlfa },
      body: payloadSensivel
    };
    const resDono = {
      status(c) { statusDono = c; return this; },
      json(j) { jsonDono = j; return this; }
    };

    await handler(reqDono, resDono);
    assert.equal(statusDono || 200, 200, 'Dono deve receber HTTP 200 ao alterar campos sensíveis');
    assert.equal(jsonDono?.success, true);
    assert.equal(jsonDono?.cfg?.comandosFinanceirosEscrita, true);
    assert.equal(jsonDono?.cfg?.limiteValorLancamentoWhatsapp, 2500);

    // C. Verifica que registrou auditoria de segurança no banco
    const auditRows = await all("SELECT * FROM security_audit_log WHERE action = 'whatsapp:config_update' AND entity_id = 'config-relatorio'");
    assert.ok(auditRows.length >= 1, 'Deve registrar log de auditoria ao atualizar configurações pelo Dono');
    const auditDetails = JSON.parse(auditRows[0].details_json || '{}');
    assert.equal(auditDetails.role, 'dono');
    assert.equal(auditDetails.changes?.limiteValorLancamentoWhatsapp, 2500);

    // D. Financeiro enviando o payload completo com valores IGUAIS aos atuais: passa com 200 OK sem 403
    let statusFinIgual = null;
    let jsonFinIgual = null;
    const reqFinIgual = {
      securityContext: { role: 'financeiro', actorId: 'user_fin', tenantId: tenantAlfa },
      headers: { 'x-tenant-id': tenantAlfa },
      body: {
        horaRelatorio: '08:00', // Campo permitido alterado
        comandosFinanceirosEscrita: true, // Mesmo valor já cadastrado
        limiteValorLancamentoWhatsapp: 2500.00, // Mesmo valor
        adminFones: ['5511999990001', '5511999990002'], // Mesmos fones
        avisarCaixaWhatsapp: true // Mesmo valor
      }
    };
    const resFinIgual = {
      status(c) { statusFinIgual = c; return this; },
      json(j) { jsonFinIgual = j; return this; }
    };
    await handler(reqFinIgual, resFinIgual);
    assert.equal(statusFinIgual || 200, 200, 'Financeiro enviando valores idênticos nos campos sensíveis deve receber HTTP 200');
    assert.equal(jsonFinIgual?.success, true);
    assert.equal(jsonFinIgual?.cfg?.horaRelatorioDiario, '08:00');

    // E. Porta dos fundos (/api/estado ou stateRepository): Não-dono tenta sobrescrever cfg diretamente
    const { persistState, getState } = require('../lib/repository/stateRepository');
    const currentState = await getState(tenantAlfa);
    assert.equal(currentState.cfg.limiteValorLancamentoWhatsapp, 2500);

    // Financeiro tenta injetar limite de R$ 99.999 via substituição de estado
    const maliciousPayload = JSON.parse(JSON.stringify(currentState));
    maliciousPayload.cfg.limiteValorLancamentoWhatsapp = 99999;
    maliciousPayload.cfg.comandosFinanceirosEscrita = false;

    const resPersist = await persistState({
      tenantId: tenantAlfa,
      actorId: 'user_financeiro_attacker',
      role: 'financeiro',
      permissions: ['financial:write', 'financial:read']
    }, maliciousPayload, { authorizeReplacement: true });

    assert.equal(resPersist.ok, true);
    const updatedState = await getState(tenantAlfa);
    assert.equal(updatedState.cfg.limiteValorLancamentoWhatsapp, 2500, 'Servidor deve preservar o limite atual ignorando a tentativa de mutação');
    assert.equal(updatedState.cfg.comandosFinanceirosEscrita, true, 'Servidor deve preservar o flag de escrita ignorando a tentativa de mutação');
  });

  // Limpeza
  await closeDB();
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch (_) {}
});

