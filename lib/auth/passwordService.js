'use strict';

const crypto = require('crypto');
const { get, run, all, transaction } = require('../../db');
const { metrics } = require('../metrics');

const LOCKOUT_MAX_ATTEMPTS = 5;
const LOCKOUT_DURATION_MINUTES = 15;
const PASSWORD_RESET_EXPIRY_MINUTES = 60;


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


async function updatePassword(userId, newPassword, { allowWeakInTest = false } = {}) {
  validatePasswordPolicy(newPassword, { allowWeakInTest });
  const salt = crypto.randomBytes(16).toString('hex');
  const passwordHash = hashPassword(newPassword, salt);
  const now = new Date().toISOString();

  await run('UPDATE users SET password_hash = ?, password_salt = ?, must_change_password = 0, updated_at = ? WHERE id = ?', [
    passwordHash, salt, now, userId
  ]);
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

  const user = await get('SELECT id, username, status FROM users WHERE id = ?', [row.user_id]);
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

    const user = await get('SELECT id, username, status FROM users WHERE id = ?', [row.user_id]);
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
  INSECURE_PASSWORDS,
  LOCKOUT_MAX_ATTEMPTS,
  LOCKOUT_DURATION_MINUTES,
  PASSWORD_RESET_EXPIRY_MINUTES,
  hashPassword,
  verifyPassword,
  validatePasswordPolicy,
  updatePassword,
  checkUserLockout,
  recordFailedAttempt,
  resetFailedAttempts,
  createPasswordResetToken,
  verifyPasswordResetToken,
  resetPasswordWithToken
};
