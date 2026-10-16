'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const net = require('node:net');

const proactiveAlertsService = require('../services/proactiveAlertsService');

test('Alertas Proativos da Verônica no WhatsApp: Detecção, Cooldown e APIs', { timeout: 60000 }, async (t) => {
  // ── TESTES UNITÁRIOS DO MOTOR DE AVALIAÇÃO ──
  await t.test('1. Detecção de orçamentos parados (acima do SLA vs dentro do SLA) e vínculo com box', () => {
    const agora = new Date('2026-10-16T15:00:00.000Z');

    const state = {
      cfg: {
        assistente: {
          alertasProativosAtivos: true,
          alertaOrcamentoParadoAtivo: true,
          slaOrcamentoParadoHoras: 4
        }
      },
      boxes: [
        { id: 'b1', nome: 'Box 01 - Pesados' },
        { id: 'b2', nome: 'Box 02 - Rápida' }
      ],
      clientes: [
        { id: 'cli1', nome: 'Transportes Rápido Ltda' }
      ],
      veiculos: [
        { id: 'vei1', placa: 'ABC1D23' },
        { id: 'vei2', placa: 'XYZ9K87' }
      ],
      os: [
        // OS 101 está no Box 1 com orçamento pendente há 5h
        { id: 'os101', num: 101, vei: 'vei1', cli: 'cli1', box: 'b1', st: 'aprovacao' },
        // OS 102 está no pátio (sem box) com orçamento recente (1h atrás)
        { id: 'os102', num: 102, vei: 'vei2', cli: 'cli1', box: null, st: 'aprovacao' }
      ],
      quotations: [
        {
          id: 'orc1',
          codigo: 'ORC-101-v1',
          osId: 'os101',
          veiculoId: 'vei1',
          clienteId: 'cli1',
          placa: 'ABC1D23',
          status: 'enviado',
          totalGeral: 4500,
          enviadoEm: new Date('2026-10-16T10:00:00.000Z').toISOString() // 5h atrás (> 4h SLA)
        },
        {
          id: 'orc2',
          codigo: 'ORC-102-v1',
          osId: 'os102',
          veiculoId: 'vei2',
          clienteId: 'cli1',
          placa: 'XYZ9K87',
          status: 'enviado',
          totalGeral: 1200,
          enviadoEm: new Date('2026-10-16T14:00:00.000Z').toISOString() // 1h atrás (< 4h SLA)
        }
      ]
    };

    const detectados = proactiveAlertsService.detectarOrcamentosParados({
      state,
      tenantId: 'tenant_teste',
      agoraDate: agora,
      slaHoras: 4
    });

    assert.equal(detectados.length, 1, 'Deve detectar apenas o orçamento que excedeu o SLA');
    const alerta = detectados[0];
    assert.equal(alerta.id, 'orc1');
    assert.equal(alerta.placa, 'ABC1D23');
    assert.equal(alerta.horasParado, 5);
    assert.equal(alerta.ocupaBox, true, 'Deve identificar que o veículo está ocupando box físico');
    assert.equal(alerta.boxId, 'b1');
    assert.equal(alerta.boxNome, 'Box 01 - Pesados');
    assert.ok(alerta.recomendacao.includes('Box 01 - Pesados'), 'Recomendação deve alertar sobre o box');

    // Validação da mensagem executiva formatada
    const msg = proactiveAlertsService.formatarMensagemOrcamentoParado({ alerta, nomeAssistente: 'Verônica' });
    assert.ok(msg.includes('Verônica — Alerta de SLA: Orçamento Parado'));
    assert.ok(msg.includes('ORC-101-v1'));
    assert.ok(msg.includes('ABC1D23'));
    assert.ok(msg.includes('R$'));
    assert.ok(msg.includes('5h'));
    assert.ok(msg.includes('Box 01 - Pesados'));
  });

  await t.test('2. Detecção de gargalos em boxes (tempo no box > SLA e falta de mecânico ativo)', () => {
    const agora = new Date('2026-10-16T16:00:00.000Z');

    const state = {
      cfg: {
        assistente: {
          alertasProativosAtivos: true,
          alertaGargaloBoxAtivo: true,
          slaGargaloBoxHoras: 6
        }
      },
      boxes: [
        { id: 'box_a', nome: 'Box A - Suspensão' },
        { id: 'box_b', nome: 'Box B - Alinhamento' },
        { id: 'box_c', nome: 'Box C - Livre' }
      ],
      veiculos: [
        { id: 'vei_a', placa: 'MOL1234' },
        { id: 'vei_b', placa: 'FOR5678' }
      ],
      clientes: [
        { id: 'cli_a', nome: 'Frota Molas Sul' }
      ],
      os: [
        // Box A: no box há 8h (> SLA 6h)
        {
          id: 'os_a',
          num: 501,
          box: 'box_a',
          vei: 'vei_a',
          cli: 'cli_a',
          st: 'executando',
          boxEntradaEm: new Date('2026-10-16T08:00:00.000Z').toISOString() // 8h atrás
        },
        // Box B: no box há 1h (< SLA 6h), com mecânico ativo
        {
          id: 'os_b',
          num: 502,
          box: 'box_b',
          vei: 'vei_b',
          cli: 'cli_a',
          st: 'executando',
          boxEntradaEm: new Date('2026-10-16T15:00:00.000Z').toISOString() // 1h atrás
        }
      ],
      laborEntries: [
        {
          id: 'lab1',
          osId: 'os_b',
          boxId: 'box_b',
          status: 'ativo',
          workerNome: 'Carlos Mecânico'
        }
      ]
    };

    const gargalos = proactiveAlertsService.detectarGargalosBox({
      state,
      tenantId: 'tenant_teste',
      agoraDate: agora,
      slaHoras: 6
    });

    assert.equal(gargalos.length, 1, 'Deve acusar gargalo apenas para o Box A');
    assert.equal(gargalos[0].boxId, 'box_a');
    assert.equal(gargalos[0].horasNoBox, 8);
    assert.equal(gargalos[0].temMecanicoAtivo, false);

    // Validação da mensagem de gargalo de box
    const msg = proactiveAlertsService.formatarMensagemGargaloBox({ alerta: gargalos[0], nomeAssistente: 'Verônica' });
    assert.ok(msg.includes('Gargalo no Box'));
    assert.ok(msg.includes('Box A - Suspensão'));
    assert.ok(msg.includes('MOL1234'));
    assert.ok(msg.includes('8h'));
  });

  await t.test('3. Mecanismo de Cooldown / Anti-spam e Idempotência', async () => {
    proactiveAlertsService.limparHistoricoCooldown();

    const chave = 'orcamento:tenant1:orc_99';
    const agora1 = new Date('2026-10-16T10:00:00.000Z');

    // 1º envio: permitido
    const podeEnviar1 = proactiveAlertsService.verificarCooldown({
      tipo: 'orcamento',
      chave,
      cooldownMinutos: 240,
      agora: agora1
    });
    assert.equal(podeEnviar1, true);

    proactiveAlertsService.registrarDisparo({
      tipo: 'orcamento',
      chave,
      agora: agora1
    });

    // 2º envio (1h depois = 60min < 240min): bloqueado
    const agora2 = new Date('2026-10-16T11:00:00.000Z');
    const podeEnviar2 = proactiveAlertsService.verificarCooldown({
      tipo: 'orcamento',
      chave,
      cooldownMinutos: 240,
      agora: agora2
    });
    assert.equal(podeEnviar2, false, 'Deve bloquear reenvio dentro da janela de cooldown');

    // 3º envio (5h depois = 300min > 240min): liberado novamente
    const agora3 = new Date('2026-10-16T15:00:00.000Z');
    const podeEnviar3 = proactiveAlertsService.verificarCooldown({
      tipo: 'orcamento',
      chave,
      cooldownMinutos: 240,
      agora: agora3
    });
    assert.equal(podeEnviar3, true, 'Deve liberar reenvio após o cooldown expirar');
  });

  // ── TESTES DE INTEGRAÇÃO HTTP DAS ROTAS E RBAC ──
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'patio-proactive-alerts-'));
  const dbPath = path.join(tempDir, 'alerts_test.db');
  const uploadDir = path.join(tempDir, 'uploads');
  fs.mkdirSync(uploadDir, { recursive: true });

  process.env.TOKEN_SECRET = 'segredo-teste-hmac-alerts-2026';
  process.env.DB_PATH = dbPath;

  const db = require('../db');
  await db.initDB();

  const userRepo = require('../lib/auth/userRepository');
  await userRepo.createUser({
    username: 'admin_alerts',
    email: 'admin@alertas.com',
    password: 'SenhaAdminAlerts#2026',
    role: 'admin',
    tenantId: 'tenant_alerts',
    fullName: 'Administrador Alertas'
  });

  await userRepo.createUser({
    username: 'mecanico_alerts',
    email: 'mecanico@alertas.com',
    password: 'SenhaMecanicoAlerts#2026',
    role: 'mecanico',
    tenantId: 'tenant_alerts',
    fullName: 'Mecânico Alertas'
  });

  const agoraTeste = new Date('2026-10-16T16:00:00.000Z');

  const mockState = {
    versao: 1,
    clientes: [
      { id: 'cli_exp', nome: 'Transportes Expresso Real' }
    ],
    veiculos: [
      { id: 'vei_exp', placa: 'EXP2026' }
    ],
    boxes: [
      { id: 'b_exp', nome: 'Box 01 - Manutenção Pesada' }
    ],
    os: [
      {
        id: 'os_exp',
        num: 901,
        box: 'b_exp',
        vei: 'vei_exp',
        cli: 'cli_exp',
        st: 'aprovacao',
        boxEntradaEm: new Date('2026-10-16T08:00:00.000Z').toISOString()
      }
    ],
    quotations: [
      {
        id: 'orc_exp',
        codigo: 'ORC-901-v1',
        osId: 'os_exp',
        veiculoId: 'vei_exp',
        clienteId: 'cli_exp',
        placa: 'EXP2026',
        status: 'enviado',
        totalGeral: 7800,
        enviadoEm: new Date('2026-10-16T08:00:00.000Z').toISOString() // 8h atrás
      }
    ],
    cfg: {
      empresa: 'Auto Molas Teste Alertas',
      grupoOperacaoId: '12036300000000001@g.us',
      assistente: {
        displayName: 'Verônica',
        voiceGender: 'female',
        enabled: true,
        alertasProativosAtivos: true,
        alertaOrcamentoParadoAtivo: true,
        slaOrcamentoParadoHoras: 4,
        alertaGargaloBoxAtivo: true,
        slaGargaloBoxHoras: 6,
        cooldownAlertasMinutos: 240
      }
    }
  };

  const { persistState } = require('../lib/repository/stateRepository');
  await persistState({ tenantId: 'tenant_alerts', role: 'admin', permissions: ['*'], actorId: 'seed' }, mockState);
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
      API_KEY: 'master-alerts-test-key',
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
  const authAdmin = basicAuth('admin_alerts', 'SenhaAdminAlerts#2026');
  const authMecanico = basicAuth('mecanico_alerts', 'SenhaMecanicoAlerts#2026');

  await t.test('4. GET /api/configuracoes/assistente: Retorna os parâmetros de SLA de alertas proativos', async () => {
    const res = await fetch(`${baseUrl}/api/configuracoes/assistente`, {
      headers: { Authorization: authAdmin, 'x-tenant-id': 'tenant_alerts' }
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.equal(data.assistente.alertasProativosAtivos, true);
    assert.equal(data.assistente.alertaOrcamentoParadoAtivo, true);
    assert.equal(data.assistente.slaOrcamentoParadoHoras, 4);
    assert.equal(data.assistente.alertaGargaloBoxAtivo, true);
    assert.equal(data.assistente.slaGargaloBoxHoras, 6);
    assert.equal(data.assistente.cooldownAlertasMinutos, 240);
  });

  await t.test('5. PUT /api/configuracoes/assistente: Atualiza limites de SLA e parâmetros de alertas', async () => {
    const res = await fetch(`${baseUrl}/api/configuracoes/assistente`, {
      method: 'PUT',
      headers: {
        Authorization: authAdmin,
        'Content-Type': 'application/json',
        'x-tenant-id': 'tenant_alerts'
      },
      body: JSON.stringify({
        slaOrcamentoParadoHoras: 2,
        slaGargaloBoxHoras: 4,
        cooldownAlertasMinutos: 180
      })
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.equal(data.assistente.slaOrcamentoParadoHoras, 2);
    assert.equal(data.assistente.slaGargaloBoxHoras, 4);
    assert.equal(data.assistente.cooldownAlertasMinutos, 180);

    // Confirma persistência via novo GET
    const resGet = await fetch(`${baseUrl}/api/configuracoes/assistente`, {
      headers: { Authorization: authAdmin, 'x-tenant-id': 'tenant_alerts' }
    });
    const dataGet = await resGet.json();
    assert.equal(dataGet.assistente.slaOrcamentoParadoHoras, 2);
    assert.equal(dataGet.assistente.slaGargaloBoxHoras, 4);
  });

  await t.test('6. GET /api/operacao/alertas-proativos: Consulta orçamentos parados e gargalos ativos', async () => {
    const res = await fetch(`${baseUrl}/api/operacao/alertas-proativos`, {
      headers: { Authorization: authAdmin, 'x-tenant-id': 'tenant_alerts' }
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.sucesso, true);
    assert.ok(data.resumo);
    assert.ok(data.orcamentosParados.length >= 1, 'Deve identificar o orçamento parado');
    assert.equal(data.orcamentosParados[0].placa, 'EXP2026');
    assert.equal(data.orcamentosParados[0].ocupaBox, true);
  });

  await t.test('7. POST /api/operacao/alertas-proativos/disparar: Disparo manual e controle de RBAC', async () => {
    // Mecânico sem permissão -> 403
    const resMec = await fetch(`${baseUrl}/api/operacao/alertas-proativos/disparar`, {
      method: 'POST',
      headers: { Authorization: authMecanico, 'x-tenant-id': 'tenant_alerts' }
    });
    assert.equal(resMec.status, 403, 'Mecânico não deve ter permissão para disparar alertas');

    // Admin com permissão -> 200 OK
    const resAdm = await fetch(`${baseUrl}/api/operacao/alertas-proativos/disparar`, {
      method: 'POST',
      headers: {
        Authorization: authAdmin,
        'Content-Type': 'application/json',
        'x-tenant-id': 'tenant_alerts'
      },
      body: JSON.stringify({ force: true })
    });
    assert.equal(resAdm.status, 200);
    const dataAdm = await resAdm.json();
    assert.equal(dataAdm.success, true);
    assert.ok(dataAdm.enviados.length >= 1, 'Deve disparar alerta mock com sucesso');
    assert.equal(dataAdm.enviados[0].mock, true);
  });
});
