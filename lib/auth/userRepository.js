'use strict';

const crypto = require('crypto');
const { run, get, all, transaction } = require('../../db');

const INSECURE_PASSWORDS = new Set([
  'patio',
  'patio-password-test',
  'patio-api-secret-2026',
  'admin',
  'administrador',
  '123456',
  '12345678',
  'password',
  'senha123',
  'sua_chave_aqui',
  'your_api_key_here',
  'secret'
]);

const ROLE_PERMISSIONS = {
  platform_admin: ['platform:read', 'platform:manage', '*'],
  platform_support: ['platform:read', 'platform:support'],
  tenant_admin: [
    'os:read', 'os:write', 'os:delete', 'admin:settings', 'whatsapp:admin',
    'reports:read', 'financial:read', 'financial:write', 'operation:read', 'operation:manage',
    'inspection:read', 'inspection:write', 'quotation:read', 'quotation:write', 'quotation:send',
    'inventory:read', 'inventory:write', 'inventory:adjust', 'purchase:read', 'purchase:write', 'purchase:approve',
    'supplier:read', 'supplier:write', 'labor:read', 'labor:write', 'labor:adjust',
    'productivity:read', 'productivity:manage', 'costing:read', 'pricing:read', 'pricing:recommend', 'pricing:override',
    'profitability:read', 'crm:read', 'crm:write', 'crm:contact', 'maintenance:read', 'maintenance:write', 'maintenance:schedule',
    'appointments:read', 'appointments:write', 'company:settings', 'assistant:settings', 'backup:manage', 'erp:sync',
    'fiscal:read', 'fiscal:write', 'fiscal:cancel', 'fiscal:settings', '*'
  ],
  admin: [
    'os:read', 'os:write', 'os:delete', 'admin:settings', 'whatsapp:admin',
    'reports:read', 'financial:read', 'financial:write', 'operation:read', 'operation:manage',
    'inspection:read', 'inspection:write', 'quotation:read', 'quotation:write', 'quotation:send',
    'inventory:read', 'inventory:write', 'inventory:adjust', 'purchase:read', 'purchase:write', 'purchase:approve',
    'supplier:read', 'supplier:write', 'labor:read', 'labor:write', 'labor:adjust',
    'productivity:read', 'productivity:manage', 'costing:read', 'pricing:read', 'pricing:recommend', 'pricing:override',
    'profitability:read', 'crm:read', 'crm:write', 'crm:contact', 'maintenance:read', 'maintenance:write', 'maintenance:schedule',
    'appointments:read', 'appointments:write', 'company:settings', 'assistant:settings', 'backup:manage', 'erp:sync',
    'fiscal:read', 'fiscal:write', 'fiscal:cancel', 'fiscal:settings', '*'
  ],
  gerente: [
    'os:read', 'os:write', 'reports:read', 'operation:read', 'operation:manage',
    'inspection:read', 'inspection:write', 'quotation:read', 'quotation:write',
    'inventory:read', 'inventory:write', 'purchase:read', 'purchase:write',
    'supplier:read', 'labor:read', 'labor:write', 'productivity:read',
    'crm:read', 'crm:write', 'appointments:read', 'appointments:write',
    'fiscal:read', 'fiscal:write'
  ],
  atendente: [
    'os:read', 'os:write', 'operation:read', 'crm:read', 'crm:write', 'crm:contact',
    'appointments:read', 'appointments:write', 'quotation:read', 'quotation:write', 'quotation:send'
  ],
  consultor: [
    'os:read', 'os:write', 'operation:read', 'crm:read', 'crm:write', 'crm:contact',
    'appointments:read', 'appointments:write', 'quotation:read', 'quotation:write', 'quotation:send'
  ],
  mecanico: [
    'os:read', 'inspection:read', 'inspection:write', 'labor:read', 'labor:write', 'inventory:read'
  ],
  estoquista: [
    'inventory:read', 'inventory:write', 'inventory:adjust', 'purchase:read', 'purchase:write',
    'supplier:read', 'supplier:write'
  ],
  compras: [
    'inventory:read', 'purchase:read', 'purchase:write', 'supplier:read', 'supplier:write'
  ],
  financeiro: [
    'financial:read', 'financial:write', 'reports:read', 'profitability:read',
    'fiscal:read', 'fiscal:write', 'fiscal:cancel', 'fiscal:settings'
  ]
};

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

function verifyPassword(password, storedHash, salt) {
  try {
    const derived = crypto.scryptSync(password, salt, 64);
    const storedBuf = Buffer.from(storedHash, 'hex');
    if (derived.length !== storedBuf.length) return false;
    return crypto.timingSafeEqual(derived, storedBuf);
  } catch (_) {
    return false;
  }
}

function validatePasswordPolicy(password, { allowWeakInTest = (process.env.NODE_ENV !== 'production') } = {}) {
  const p = String(password || '').trim();
  const errors = [];

  if (allowWeakInTest) {
    if (p.length < 6) errors.push('A senha deve ter pelo menos 6 caracteres em ambiente de teste.');
  } else {
    if (p.length < 12) {
      errors.push('A senha deve conter no mínimo 12 caracteres.');
    }
    if (INSECURE_PASSWORDS.has(p.toLowerCase())) {
      errors.push('Senha fraca ou padrão detectada. Escolha uma senha segura e exclusiva.');
    }

    const hasUpper = /[A-Z]/.test(p);
    const hasLower = /[a-z]/.test(p);
    const hasDigit = /[0-9]/.test(p);
    const hasSpecial = /[^A-Za-z0-9]/.test(p);

    const missing = [];
    if (!hasUpper) missing.push('letra maiúscula');
    if (!hasLower) missing.push('letra minúscula');
    if (!hasDigit) missing.push('número');
    if (!hasSpecial) missing.push('caractere especial');

    if (missing.length > 0) {
      errors.push(`A senha deve conter pelo menos uma: ${missing.join(', ')}.`);
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }
  return { valid: true, errors: [] };
}

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
  const row = await get('SELECT id FROM users WHERE username = ?', [cleanUsername]);
  if (!row) return null;
  return await getUserById(row.id);
}

async function authenticateUser(username, password) {
  if (!username || !password) {
    return { success: false, locked: false, error: 'Credenciais ausentes.' };
  }
  const cleanUsername = String(username).trim().toLowerCase();
  const row = await get('SELECT * FROM users WHERE username = ?', [cleanUsername]);
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

async function updatePassword(userId, newPassword, { allowWeakInTest = false } = {}) {
  validatePasswordPolicy(newPassword, { allowWeakInTest });
  const salt = crypto.randomBytes(16).toString('hex');
  const passwordHash = hashPassword(newPassword, salt);
  const now = new Date().toISOString();

  await run('UPDATE users SET password_hash = ?, password_salt = ?, must_change_password = 0, updated_at = ? WHERE id = ?', [
    passwordHash, salt, now, userId
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

async function checkUserLockout(username) {
  if (!username) return null;
  const cleanUsername = String(username).trim().toLowerCase();
  const row = await get('SELECT id, username, status, failed_login_attempts, locked_until, must_change_password FROM users WHERE username = ?', [cleanUsername]);
  if (!row) return null;

  const now = new Date();
  const isLocked = Boolean(row.locked_until && new Date(row.locked_until) > now);
  return {
    id: row.id,
    username: row.username,
    status: row.status,
    isSuspended: row.status === 'suspended',
    isLocked,
    lockedUntil: row.locked_until,
    failedAttempts: row.failed_login_attempts || 0,
    mustChangePassword: !!row.must_change_password
  };
}

async function recordFailedAttempt(username) {
  if (!username) return null;
  const cleanUsername = String(username).trim().toLowerCase();
  const row = await get('SELECT id, failed_login_attempts FROM users WHERE username = ?', [cleanUsername]);
  if (!row) return null;

  const attempts = (row.failed_login_attempts || 0) + 1;
  const isLocked = attempts >= 5;
  const lockTime = isLocked ? new Date(Date.now() + 15 * 60 * 1000).toISOString() : null;
  const now = new Date().toISOString();

  await run('UPDATE users SET failed_login_attempts = ?, locked_until = ?, updated_at = ? WHERE id = ?', [
    attempts, lockTime, now, row.id
  ]);

  return { attempts, isLocked, lockTime };
}

async function resetFailedAttempts(userId) {
  if (!userId) return;
  await run('UPDATE users SET failed_login_attempts = 0, locked_until = NULL, updated_at = ? WHERE id = ?', [
    new Date().toISOString(), userId
  ]);
}

async function createPasswordResetToken(usernameOrEmail) {
  if (!usernameOrEmail) throw new Error('Usuário ou e-mail é obrigatório.');
  const clean = String(usernameOrEmail).trim().toLowerCase();
  const user = await get('SELECT id, username, status FROM users WHERE username = ?', [clean]);
  if (!user) {
    return null;
  }
  if (user.status === 'suspended') {
    throw new Error('Conta de usuário suspensa. Entre em contato com o administrador.');
  }

  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const expiresAt = new Date(Date.now() + 3600 * 1000).toISOString(); // 1 hora de validade

  // Invalida tokens anteriores do mesmo usuário
  await run('DELETE FROM password_resets WHERE user_id = ?', [user.id]);

  await run(`INSERT INTO password_resets (token_hash, user_id, expires_at, used_at)
    VALUES (?, ?, ?, NULL)`, [
    tokenHash, user.id, expiresAt
  ]);

  return { token, tokenHash, userId: user.id, expiresAt };
}

async function verifyPasswordResetToken(token) {
  if (!token) return null;
  const tokenHash = crypto.createHash('sha256').update(String(token).trim()).digest('hex');
  const row = await get('SELECT * FROM password_resets WHERE token_hash = ?', [tokenHash]);
  if (!row) return null;

  if (row.used_at) return { valid: false, reason: 'token_already_used' };
  if (new Date(row.expires_at) <= new Date()) return { valid: false, reason: 'token_expired' };

  const user = await getUserById(row.user_id);
  if (!user || user.status === 'suspended') return { valid: false, reason: 'user_unavailable' };

  return { valid: true, row, user };
}

async function resetPasswordWithToken(token, newPassword, { allowWeakInTest = false } = {}) {
  if (!token) throw new Error('Token de redefinição inválido.');
  const tokenHash = crypto.createHash('sha256').update(String(token).trim()).digest('hex');

  validatePasswordPolicy(newPassword, { allowWeakInTest });

  return await transaction(async () => {
    const row = await get('SELECT * FROM password_resets WHERE token_hash = ?', [tokenHash]);
    if (!row) {
      throw new Error('Token de redefinição inválido.');
    }
    if (row.used_at) {
      throw new Error('Link de redefinição já utilizado.');
    }
    if (new Date(row.expires_at) <= new Date()) {
      throw new Error('Link de redefinição expirado.');
    }

    const user = await getUserById(row.user_id);
    if (!user || user.status === 'suspended') {
      throw new Error('Conta de usuário indisponível ou suspensa.');
    }

    const now = new Date().toISOString();
    const consumeRes = await run(
      `UPDATE password_resets 
       SET used_at = ? 
       WHERE token_hash = ? AND used_at IS NULL AND datetime(expires_at) > datetime('now')`,
      [now, tokenHash]
    );

    if (!consumeRes || consumeRes.changes !== 1) {
      throw new Error('Link de redefinição já utilizado ou concorrentemente consumido.');
    }

    const salt = crypto.randomBytes(16).toString('hex');
    const passwordHash = hashPassword(newPassword, salt);
    await run(
      `UPDATE users 
       SET password_hash = ?, password_salt = ?, must_change_password = 0, failed_login_attempts = 0, locked_until = NULL, updated_at = ? 
       WHERE id = ?`,
      [passwordHash, salt, now, user.id]
    );

    return { success: true, userId: user.id, username: user.username };
  });
}

module.exports = {
  hashPassword,
  verifyPassword,
  validatePasswordPolicy,
  createUser,
  getUserById,
  getUserByUsername,
  authenticateUser,
  addMembership,
  updatePassword,
  countUsers,
  recordTermsConsent,
  checkUserLockout,
  recordFailedAttempt,
  resetFailedAttempts,
  createPasswordResetToken,
  verifyPasswordResetToken,
  resetPasswordWithToken,
  ROLE_PERMISSIONS,
  INSECURE_PASSWORDS
};
