'use strict';

const crypto = require('crypto');
const { get, run, all, transaction } = require('../../db');
const { metrics } = require('../metrics');
const {
  hashPassword,
  verifyPassword,
  validatePasswordPolicy,
  checkUserLockout,
  recordFailedAttempt,
  resetFailedAttempts
} = require('./passwordService');
const { ROLE_PERMISSIONS } = require('./roles');

async function createUser({
  username,
  password,
  email = '',
  fullName = '',
  name = '',
  phone = '',
  status = 'active',
  mustChangePassword = false,
  role = 'atendente',
  tenantId = null,
  memberships = [],
  allowWeakInTest = false
}) {
  if (!username || typeof username !== 'string') {
    throw new Error('Nome de usuário / e-mail é obrigatório.');
  }
  const cleanUsername = username.trim().toLowerCase();

  const policy = validatePasswordPolicy(password, { allowWeakInTest });
  if (!policy.valid) {
    throw new Error(policy.errors.join(' '));
  }

  const existing = await get('SELECT id FROM users WHERE username = ?', [cleanUsername]);
  if (existing) {
    throw new Error(`Usuário "${cleanUsername}" já cadastrado.`);
  }

  const salt = crypto.randomBytes(16).toString('hex');
  const passwordHash = hashPassword(password, salt);
  const userId = `usr_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  const now = new Date().toISOString();

  await run(`INSERT INTO users (
    id, username, password_hash, password_salt, password_algo,
    name, phone, status, failed_login_attempts, locked_until, must_change_password,
    created_at, updated_at
  ) VALUES (?, ?, ?, ?, 'scrypt', ?, ?, ?, 0, NULL, ?, ?, ?)`, [
    userId, cleanUsername, passwordHash, salt,
    name || cleanUsername, phone || '', status,
    mustChangePassword ? 1 : 0, now, now
  ]);

  const allMemberships = [...memberships];
  if (tenantId && !allMemberships.some(m => m.tenantId === tenantId)) {
    allMemberships.push({
      tenantId,
      role: role || 'tenant_admin',
      permissions: ROLE_PERMISSIONS[role] || ['*']
    });
  }

  for (const m of allMemberships) {
    const r = m.role || 'operador';
    const perms = m.permissions || ROLE_PERMISSIONS[r] || ['os:read'];
    const memId = `mem_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    await run(`INSERT INTO memberships (id, user_id, tenant_id, role, permissions_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?)`, [
      memId, userId, m.tenantId.trim(), r, JSON.stringify(perms), now
    ]);
  }

  return await getUserById(userId);
}

async function getUserById(id) {
  const row = await get('SELECT * FROM users WHERE id = ?', [id]);
  if (!row) return null;

  const memRows = await all('SELECT * FROM memberships WHERE user_id = ?', [id]);
  const memberships = (memRows || []).map(m => ({
    id: m.id,
    tenantId: m.tenant_id,
    role: m.role,
    permissions: JSON.parse(m.permissions_json || '[]'),
    createdAt: m.created_at
  }));

  return {
    id: row.id,
    username: row.username,
    name: row.name,
    phone: row.phone,
    status: row.status,
    role: memberships[0]?.role || 'operador',
    failedLoginAttempts: row.failed_login_attempts,
    lockedUntil: row.locked_until,
    mustChangePassword: !!row.must_change_password,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    memberships
  };
}

async function getUserByUsername(username) {
  if (!username) return null;
  const cleanUsername = String(username).trim().toLowerCase();
  let row = await get('SELECT id FROM users WHERE username = ?', [cleanUsername]);
  if (!row) {
    if (cleanUsername.includes('@')) {
      const prefix = cleanUsername.split('@')[0];
      row = await get('SELECT id FROM users WHERE username = ?', [prefix]);
    } else {
      row = await get('SELECT id FROM users WHERE username = ? OR username LIKE ?', [`${cleanUsername}@automolas.com.br`, `${cleanUsername}@%`]);
    }
  }
  if (!row) return null;
  return await getUserById(row.id);
}

async function authenticateUser(username, password) {
  if (!username || !password) {
    return { success: false, locked: false, error: 'Credenciais ausentes.' };
  }
  const cleanUsername = String(username).trim().toLowerCase();
  let row = await get('SELECT * FROM users WHERE username = ?', [cleanUsername]);
  if (!row) {
    if (cleanUsername.includes('@')) {
      const prefix = cleanUsername.split('@')[0];
      row = await get('SELECT * FROM users WHERE username = ?', [prefix]);
    } else {
      row = await get('SELECT * FROM users WHERE username = ? OR username LIKE ?', [`${cleanUsername}@automolas.com.br`, `${cleanUsername}@%`]);
    }
  }
  if (!row) {
    return { success: false, locked: false, error: 'Usuário não encontrado.' };
  }

  const now = new Date();
  if (row.locked_until && new Date(row.locked_until) > now) {
    const minRestantes = Math.ceil((new Date(row.locked_until) - now) / 60000);
    return {
      success: false,
      locked: true,
      error: `Conta bloqueada temporariamente por múltiplas tentativas. Tente novamente em ${minRestantes} minuto(s).`
    };
  }

  if (row.status === 'suspended') {
    return { success: false, locked: false, error: 'Conta de usuário suspensa pelo administrador.' };
  }

  const isValid = verifyPassword(password, row.password_hash, row.password_salt);
  if (!isValid) {
    const attempts = (row.failed_login_attempts || 0) + 1;
    let lockTime = null;
    const isLocked = attempts >= 5;
    if (isLocked) {
      lockTime = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    }
    await run('UPDATE users SET failed_login_attempts = ?, locked_until = ?, updated_at = ? WHERE id = ?', [
      attempts, lockTime, new Date().toISOString(), row.id
    ]);
    return {
      success: false,
      locked: isLocked,
      attempts,
      error: isLocked
        ? 'Conta bloqueada temporariamente por 15 minutos após 5 tentativas consecutivas incorretas.'
        : 'Credenciais inválidas.'
    };
  }

  // Sucesso: reseta tentativas
  if (row.failed_login_attempts > 0 || row.locked_until) {
    await run('UPDATE users SET failed_login_attempts = 0, locked_until = NULL, updated_at = ? WHERE id = ?', [
      new Date().toISOString(), row.id
    ]);
  }

  const user = await getUserById(row.id);
  return { success: true, locked: false, user };
}

async function addMembership({ userId, tenantId, role = 'operador', permissions = null }) {
  if (!userId || !tenantId) throw new Error('userId e tenantId são obrigatórios.');
  const perms = permissions || ROLE_PERMISSIONS[role] || ['os:read'];
  const now = new Date().toISOString();
  const memId = `mem_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;

  await run(`INSERT OR REPLACE INTO memberships (id, user_id, tenant_id, role, permissions_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?)`, [
    memId, userId, tenantId.trim(), role, JSON.stringify(perms), now
  ]);
}


async function countUsers() {
  const row = await get('SELECT COUNT(*) as total FROM users');
  return row ? row.total : 0;
}

async function recordTermsConsent({ userId = null, tenantId = null, termsVersion = '1.0.0', privacyVersion = '1.0.0', ipAddress = '', userAgent = '' }) {
  const id = `tc_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  const now = new Date().toISOString();
  await run(`INSERT INTO terms_consents (id, user_id, tenant_id, terms_version, privacy_version, ip_address, user_agent, accepted_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [
    id, userId, tenantId, termsVersion, privacyVersion, ipAddress || '', userAgent || '', now
  ]);
  return { id, acceptedAt: now };
}


async function listUsers(tenantId = null) {
  const rows = await all('SELECT id, username, name, phone, status, failed_login_attempts, locked_until, must_change_password, created_at, updated_at FROM users ORDER BY created_at ASC');
  const result = [];
  for (const r of (rows || [])) {
    const memRows = await all('SELECT * FROM memberships WHERE user_id = ?', [r.id]);
    const memberships = (memRows || []).map(m => ({
      tenantId: m.tenant_id,
      role: m.role,
      permissions: JSON.parse(m.permissions_json || '[]')
    }));
    const role = memberships[0]?.role || 'vendedor';
    result.push({
      id: r.id,
      username: r.username,
      nome: r.name || r.username,
      cargo: role === 'admin' ? 'Gerente Geral' : (role === 'vendedor' ? 'Consultor / Vendedor' : (role === 'caixa' ? 'Financeiro / Caixa' : (role === 'mecanico' ? 'Mecânico / Operador de Box' : role))),
      role,
      status: r.status || 'active',
      ativo: r.status === 'active',
      phone: r.phone || '',
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      memberships
    });
  }
  return result;
}

async function updateUser(id, { name, role, status, phone, password, tenantId = 'automolas_fort' } = {}) {
  const user = await getUserById(id);
  if (!user) throw new Error('Usuário não encontrado.');

  const now = new Date().toISOString();
  if (name !== undefined || phone !== undefined || status !== undefined) {
    await run(`UPDATE users SET 
      name = COALESCE(?, name),
      phone = COALESCE(?, phone),
      status = COALESCE(?, status),
      updated_at = ?
      WHERE id = ?`,
      [name !== undefined ? name : null, phone !== undefined ? phone : null, status !== undefined ? status : null, now, id]
    );
  }

  if (password) {
    await updatePassword(id, password, { allowWeakInTest: true });
  }

  if (role) {
    const perms = ROLE_PERMISSIONS[role] || ['os:read'];
    await run('DELETE FROM memberships WHERE user_id = ?', [id]);
    const memId = `mem_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    await run(`INSERT INTO memberships (id, user_id, tenant_id, role, permissions_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?)`, [
      memId, id, tenantId, role, JSON.stringify(perms), now
    ]);
  }

  return await getUserById(id);
}

async function deleteUser(id) {
  const user = await getUserById(id);
  if (!user) throw new Error('Usuário não encontrado.');
  await run('UPDATE users SET status = ?, updated_at = ? WHERE id = ?', ['inactive', new Date().toISOString(), id]);
  return { success: true, id };
}


module.exports = {
  createUser,
  getUserById,
  getUserByUsername,
  authenticateUser,
  addMembership,
  countUsers,
  recordTermsConsent,
  listUsers,
  updateUser,
  deleteUser
};
