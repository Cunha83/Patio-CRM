'use strict';

const { spawn } = require('child_process');
const assert = require('assert');
const path = require('path');

const PORT = 3888;

async function runE2E() {
  console.log('--- INICIANDO JORNADA DE VERIFICAÇÃO E2E (PÁTIO CRM) ---');

  const child = spawn(process.execPath, ['server.js'], {
    env: {
      ...process.env,
      PORT: String(PORT),
      NODE_ENV: 'test',
      BILLING_MODE: 'sandbox',
      DISABLE_INTEGRATIONS: 'true'
    }
  });

  let logs = '';
  child.stdout.on('data', d => logs += d);
  child.stderr.on('data', d => logs += d);

  try {
    // 1. Aguarda servidor ficar saudável
    let online = false;
    for (let i = 0; i < 60; i++) {
      try {
        const res = await fetch(`http://127.0.0.1:${PORT}/health`);
        if (res.status === 200) {
          online = true;
          break;
        }
      } catch (_) {}
      await new Promise(r => setTimeout(r, 200));
    }
    assert.ok(online, 'Servidor deve responder 200 em /health');
    console.log('✔ 1. Servidor operacional e saudável em /health');

    // 2. Verifica /ready
    const resReady = await fetch(`http://127.0.0.1:${PORT}/ready`);
    assert.equal(resReady.status, 200);
    const dataReady = await resReady.json();
    assert.equal(dataReady.status, 'ready');
    assert.equal(dataReady.checks.database, 'ok');
    assert.equal(dataReady.checks.storage, 'ok');
    console.log('✔ 2. Readiness check (/ready) aprovado:', dataReady.checks);

    // 3. Signup de nova oficina com senha forte e aceite LGPD
    const signupPayload = {
      nome: 'Carlos Mecânica Pesada',
      empresa: 'Auto Molas Progresso',
      whatsapp: '62988880000',
      email: `carlos_${Date.now()}@molasprogresso.com.br`,
      senha: 'Molas#Progresso2026@Forte',
      aceitouTermos: true,
      termsVersion: '1.0.0',
      privacyVersion: '1.0.0'
    };

    const resSignup = await fetch(`http://127.0.0.1:${PORT}/api/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(signupPayload)
    });
    assert.equal(resSignup.status, 201);
    const dataSignup = await resSignup.json();
    assert.equal(dataSignup.ok, true);
    const tenantId = dataSignup.tenantId;
    assert.ok(tenantId);
    console.log('✔ 3. Nova oficina cadastrada com sucesso. Tenant ID:', tenantId);

    // 4. Autenticação Basic com o usuário criado
    const basicHeader = 'Basic ' + Buffer.from(`${signupPayload.email}:${signupPayload.senha}`).toString('base64');
    const resAuth = await fetch(`http://127.0.0.1:${PORT}/api/estado`, {
      headers: {
        'authorization': basicHeader,
        'x-tenant-id': tenantId
      }
    });
    assert.equal(resAuth.status, 200);
    const stateAdmin = await resAuth.json();
    assert.equal(stateAdmin.cfg.empresa, 'Auto Molas Progresso');
    console.log('✔ 4. Login com Scrypt validado e /api/estado recuperado para tenant_admin');

    // 5. Execução de Backup WAL atômico via API
    const resBackup = await fetch(`http://127.0.0.1:${PORT}/api/backup/wal`, {
      method: 'POST',
      headers: {
        'authorization': basicHeader,
        'x-tenant-id': tenantId,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ includeUploads: false })
    });
    assert.equal(resBackup.status, 200);
    const dataBackup = await resBackup.json();
    assert.equal(dataBackup.ok, true);
    assert.ok(dataBackup.checksumSha256);
    console.log('✔ 5. Backup WAL atômico executado com sucesso. SHA-256:', dataBackup.checksumSha256.slice(0, 16) + '...');

    // 6. Listagem de Backups
    const resListBackup = await fetch(`http://127.0.0.1:${PORT}/api/backup/listar`, {
      headers: {
        'authorization': basicHeader,
        'x-tenant-id': tenantId
      }
    });
    assert.equal(resListBackup.status, 200);
    const dataList = await resListBackup.json();
    assert.ok(dataList.backups.length >= 1);
    console.log('✔ 6. Listagem de backups auditada com sucesso:', dataList.backups.length, 'backup(s)');

    // 7. Camada de Integração ERP - Exportação Canônica de Clientes
    const resErpCli = await fetch(`http://127.0.0.1:${PORT}/api/integracao/erp/exportar/clientes`, {
      headers: {
        'authorization': basicHeader,
        'x-tenant-id': tenantId
      }
    });
    assert.equal(resErpCli.status, 200);
    const dataErpCli = await resErpCli.json();
    assert.equal(dataErpCli.success, true);
    assert.equal(dataErpCli.schemaVersion, '1.0.0');
    console.log('✔ 7. Exportação canônica de ERP validada (schema 1.0.0)');

    // 8. Enfileiramento na Outbox do ERP
    const resEnq = await fetch(`http://127.0.0.1:${PORT}/api/integracao/erp/enfileirar`, {
      method: 'POST',
      headers: {
        'authorization': basicHeader,
        'x-tenant-id': tenantId,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        entityType: 'os',
        entityId: 'OS_1001',
        action: 'fechamento',
        payload: { valor: 3500 }
      })
    });
    assert.equal(resEnq.status, 200);
    const dataEnq = await resEnq.json();
    assert.equal(dataEnq.ok, true);
    console.log('✔ 8. Evento enfileirado com sucesso na Outbox do ERP:', dataEnq.outboxId);

    // 9. Status da Integração ERP
    const resErpStatus = await fetch(`http://127.0.0.1:${PORT}/api/integracao/erp/status`, {
      headers: {
        'authorization': basicHeader,
        'x-tenant-id': tenantId
      }
    });
    assert.equal(resErpStatus.status, 200);
    const dataErpStatus = await resErpStatus.json();
    assert.ok(dataErpStatus.outbox.pendentes >= 1);
    console.log('✔ 9. Status da Outbox do ERP auditado:', dataErpStatus.outbox);

    console.log('\n======================================================');
    console.log('🎉 TODAS AS VERIFICAÇÕES E2E FORAM CONCLUÍDAS COM SUCESSO!');
    console.log('======================================================\n');
  } finally {
    child.kill();
  }
}

runE2E().catch(err => {
  console.error('❌ Falha na verificação E2E:', err);
  process.exit(1);
});
