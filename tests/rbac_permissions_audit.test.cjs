'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');

const rootDir = path.resolve(__dirname, '..');
const { getCredenciaisDefinitivas } = require('../scripts/provisionar_credenciais_finais.cjs');

test('P0: Auditoria Rigorosa de Credenciais e Permissões RBAC dos Operadores', async (t) => {
  const baseUrl = 'http://127.0.0.1:3000';
  const tenantId = 'oficina_piloto_01';
  const credenciais = getCredenciaisDefinitivas();

  // 1. Rejeição de senhas antigas de exemplo
  await t.test('1. Senhas de exemplo antigas são estritamente rejeitadas', async () => {
    const oldCredentials = [
      { user: 'gestor@oficina.com.br', pass: 'SenhaGestor#2026' },
      { user: 'atendente@oficina.com.br', pass: 'SenhaAtendente#2026' },
      { user: 'mecanico@oficina.com.br', pass: 'SenhaMecanico#2026' },
      { user: 'gestor@oficina.com.br', pass: 'Gst#P4t1o!9xM8v2' },
      { user: 'atendente@oficina.com.br', pass: 'Atd#P4t1o!7kR3w9' },
      { user: 'mecanico@oficina.com.br', pass: 'Mec#P4t1o!5zL2q4' }
    ];

    for (const cred of oldCredentials) {
      const auth = 'Basic ' + Buffer.from(`${cred.user}:${cred.pass}`).toString('base64');
      const res = await fetch(`${baseUrl}/api/estado`, {
        headers: {
          'Authorization': auth,
          'x-tenant-id': tenantId
        }
      });
      assert.equal(res.status, 401, `Senha antiga para ${cred.user} deve ser rejeitada com 401 Unauthorized`);
    }
  });

  // 2. Autenticação das credenciais definitivas
  await t.test('2. Todas as novas credenciais definitivas autenticam com sucesso (200 OK)', async () => {
    for (const cred of credenciais) {
      const auth = 'Basic ' + Buffer.from(`${cred.username}:${cred.password}`).toString('base64');
      const res = await fetch(`${baseUrl}/api/estado`, {
        headers: {
          'Authorization': auth,
          'x-tenant-id': tenantId
        }
      });
      assert.equal(res.status, 200, `Credencial definitiva para ${cred.username} deve responder 200 OK`);
    }
  });

  // 3. Auditoria do perfil Gestor (tenant_admin)
  await t.test('3. Gestor (tenant_admin) possui permissões administrativas e financeiras integrais', async () => {
    const gestor = credenciais.find(c => c.role === 'tenant_admin');
    const auth = 'Basic ' + Buffer.from(`${gestor.username}:${gestor.password}`).toString('base64');

    const res = await fetch(`${baseUrl}/api/estado`, {
      headers: { 'Authorization': auth, 'x-tenant-id': tenantId }
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(Array.isArray(data.os), 'Deve retornar array de OSs');
    // Gestor visualiza valores monetários
    if (data.os.length > 0) {
      assert.notEqual(data.os[0].total, undefined, 'Gestor deve ter visibilidade do total da OS');
    }
  });

  // 4. Auditoria do perfil Atendente
  await t.test('4. Atendente possui permissão de leitura/escrita de OS, mas bloqueio a gestão de backups', async () => {
    const atendente = credenciais.find(c => c.role === 'atendente');
    const auth = 'Basic ' + Buffer.from(`${atendente.username}:${atendente.password}`).toString('base64');

    const res = await fetch(`${baseUrl}/api/estado`, {
      headers: { 'Authorization': auth, 'x-tenant-id': tenantId }
    });
    assert.equal(res.status, 200, 'Atendente deve conseguir ler estado');

    // Tentativa de acessar endpoint restrito a admin/backup
    const resAdmin = await fetch(`${baseUrl}/api/backups/executar`, {
      method: 'POST',
      headers: { 'Authorization': auth, 'x-tenant-id': tenantId }
    });
    assert.ok([401, 403, 404].includes(resAdmin.status), `Atendente não pode executar backup administrativo (HTTP ${resAdmin.status})`);
  });

  // 5. Auditoria do perfil Mecânico (Blindagem Financeira)
  await t.test('5. Mecânico possui blindagem financeira ativa no payload', async () => {
    const mecanico = credenciais.find(c => c.role === 'mecanico');
    const auth = 'Basic ' + Buffer.from(`${mecanico.username}:${mecanico.password}`).toString('base64');

    const res = await fetch(`${baseUrl}/api/estado`, {
      headers: { 'Authorization': auth, 'x-tenant-id': tenantId }
    });
    assert.equal(res.status, 200, 'Mecânico deve conseguir ler estado');
    const data = await res.json();

    // Na blindagem financeira para mecânico, campos de lucro, margem ou faturamento de contas a pagar/receber são suprimidos
    if (data.contas) {
      assert.equal(data.contas.length, 0, 'Contas a pagar/receber financeiras não devem ser expostas ao mecânico');
    }
  });
});
