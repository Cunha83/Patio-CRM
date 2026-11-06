'use strict';

const { run, get } = require('../../db');
const { ROLE_PERMISSIONS } = require('./roles');
const { createUser } = require('./userCrud');

async function seedBaseUsers(tenantId = 'automolas_fort') {
  const baseUsers = [
    {
      username: 'admin',
      email: 'admin@automolas.com.br',
      name: 'Gerente Geral',
      cargo: 'Gerente Geral',
      role: 'admin',
      password: process.env.ADMIN_PASSWORD || 'admin123',
      permissions: ['*']
    },
    {
      username: 'vendedor',
      email: 'vendedor@automolas.com.br',
      name: 'Consultor de Vendas',
      cargo: 'Consultor / Vendedor',
      role: 'vendedor',
      password: process.env.VENDEDOR_PASSWORD || 'vendedor123',
      permissions: ROLE_PERMISSIONS.vendedor || ['os:read', 'os:write', 'patio:read']
    },
    {
      username: 'caixa',
      email: 'caixa@automolas.com.br',
      name: 'Operador Financeiro / Caixa',
      cargo: 'Financeiro / Caixa',
      role: 'caixa',
      password: process.env.CAIXA_PASSWORD || 'caixa123',
      permissions: ROLE_PERMISSIONS.caixa || ['dashboard:read', 'financial:read']
    },
    {
      username: 'mecanico',
      email: 'mecanico@automolas.com.br',
      name: 'Mecânico de Pátio',
      cargo: 'Mecânico / Operador de Box',
      role: 'mecanico',
      password: process.env.MECANICO_PASSWORD || 'mecanico123',
      permissions: ROLE_PERMISSIONS.mecanico || ['patio:read', 'os:read']
    }
  ];

  for (const bu of baseUsers) {
    try {
      const existing = await get('SELECT id FROM users WHERE username = ? OR username = ?', [bu.username, bu.email]);
      if (!existing) {
        await createUser({
          username: bu.username,
          email: bu.email,
          name: bu.name,
          phone: '',
          password: bu.password,
          role: bu.role,
          tenantId,
          allowWeakInTest: true,
          memberships: [
            { tenantId, role: bu.role, permissions: bu.permissions }
          ]
        });
      }
    } catch (_) {}
  }
}


module.exports = {
  seedBaseUsers
};
