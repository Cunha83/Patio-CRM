'use strict';

const crypto = require('crypto');
const userRepository = require('./userRepository');

const DEFAULT_INSECURE_SECRETS = new Set([
  'patio',
  'patio-password-test',
  'patio-api-secret-2026',
  'sua_chave_aqui',
  'your_api_key_here',
  'secret',
  '123456',
  '12345678',
  'admin',
  'password'
]);

function digest(val) {
  return crypto.createHash('sha256').update(String(val ?? '')).digest();
}

function safeCompare(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = digest(a);
  const bufB = digest(b);
  return crypto.timingSafeEqual(bufA, bufB);
}

class IdentityRegistry {
  constructor(options = {}) {
    this.allowWeakInTest = !!options.allowWeakInTest;
    this.apiKeys = new Map(); // keyHash -> { keyHash, tenantId, name, scopes, permissions }
    this.users = new Map();   // username -> { id, username, passwordHash, salt, algo, memberships, mustChangePassword }
  }

  validateEntropy(secret, fieldName = 'Credencial') {
    if (this.allowWeakInTest) return;
    const s = String(secret || '').trim();
    if (!s || s.length < 12 || DEFAULT_INSECURE_SECRETS.has(s.toLowerCase())) {
      throw new Error(`${fieldName} rejeitada: credencial fraca ou padrão detectada. Forneça uma chave segura com no mínimo 12 caracteres.`);
    }
  }

  registerApiKey({ key, tenantId, name, scopes = ['*'] }) {
    this.validateEntropy(key, 'API Key');
    if (!tenantId || typeof tenantId !== 'string') {
      throw new Error('API Key deve ter um tenantId explícito vinculado.');
    }
    const hash = digest(key).toString('hex');
    const scopeList = Array.isArray(scopes) ? scopes : [scopes];
    this.apiKeys.set(hash, {
      keyHash: hash,
      tenantId: tenantId.trim(),
      name: name || `key_${tenantId}`,
      scopes: scopeList,
      permissions: scopeList.includes('*')
        ? userRepository.ROLE_PERMISSIONS.admin
        : scopeList
    });
  }

  registerUser({ username, password, passwordHash = null, salt = null, memberships = [], id = null, mustChangePassword = false }) {
    if (!username || typeof username !== 'string') {
      throw new Error('Usuário deve ter um username válido.');
    }
    const cleanUsername = username.trim().toLowerCase();

    let finalHash = passwordHash;
    let finalSalt = salt;

    if (!finalHash) {
      this.validateEntropy(password, 'Senha de usuário');
      finalSalt = crypto.randomBytes(16).toString('hex');
      finalHash = userRepository.hashPassword(password, finalSalt);
    }

    const formattedMemberships = memberships.map(m => {
      const role = m.role || 'operador';
      return {
        tenantId: m.tenantId.trim(),
        role,
        permissions: m.permissions || userRepository.ROLE_PERMISSIONS[role] || ['os:read']
      };
    });

    this.users.set(cleanUsername, {
      id: id || `usr_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
      username: cleanUsername,
      passwordHash: finalHash,
      salt: finalSalt,
      algo: 'scrypt',
      mustChangePassword: !!mustChangePassword,
      memberships: formattedMemberships
    });
  }

  async loadFromDB() {
    this.initializationPromise = (async () => {
      try {
        const { all } = require('../../db');
        const userRows = await all('SELECT * FROM users');
        if (!userRows || userRows.length === 0) return 0;

        for (const u of userRows) {
          const memRows = await all('SELECT * FROM memberships WHERE user_id = ?', [u.id]);
          const memberships = (memRows || []).map(m => ({
            tenantId: m.tenant_id,
            role: m.role,
            permissions: JSON.parse(m.permissions_json || '[]')
          }));

          this.users.set(u.username.toLowerCase(), {
            id: u.id,
            username: u.username.toLowerCase(),
            passwordHash: u.password_hash,
            salt: u.password_salt,
            algo: u.password_algo || 'scrypt',
            mustChangePassword: !!u.must_change_password,
            status: u.status || 'active',
            failedAttempts: u.failed_login_attempts || 0,
            lockedUntil: u.locked_until || null,
            memberships
          });
        }
        return userRows.length;
      } catch (err) {
        console.warn('[IdentityRegistry] Aviso ao carregar usuários do SQLite:', err.message);
        return 0;
      }
    })();
    return this.initializationPromise;
  }

  async syncUser(username) {
    if (!username) return null;
    try {
      const cleanUsername = String(username).trim().toLowerCase();
      const { get, all } = require('../../db');
      const u = await get('SELECT * FROM users WHERE lower(username) = ?', [cleanUsername]);
      if (!u) {
        this.users.delete(cleanUsername);
        return null;
      }
      const memRows = await all('SELECT * FROM memberships WHERE user_id = ?', [u.id]);
      const memberships = (memRows || []).map(m => ({
        tenantId: m.tenant_id,
        role: m.role,
        permissions: JSON.parse(m.permissions_json || '[]')
      }));
      const userMeta = {
        id: u.id,
        username: cleanUsername,
        passwordHash: u.password_hash,
        salt: u.password_salt,
        algo: u.password_algo || 'scrypt',
        mustChangePassword: !!u.must_change_password,
        status: u.status || 'active',
        failedAttempts: u.failed_login_attempts || 0,
        lockedUntil: u.locked_until || null,
        memberships
      };
      this.users.set(cleanUsername, userMeta);
      return userMeta;
    } catch (err) {
      console.warn('[IdentityRegistry] Erro ao sincronizar usuário:', err.message);
      return null;
    }
  }

  invalidateUser(username) {
    if (!username) return;
    this.users.delete(String(username).trim().toLowerCase());
  }

  authenticate(req) {
    // 1. Verificação de Header x-api-key (Máquina / Integração)
    const reqApiKey = req.headers ? req.headers['x-api-key'] : null;
    if (typeof reqApiKey === 'string' && reqApiKey.length > 0) {
      const hash = digest(reqApiKey).toString('hex');
      for (const [registeredHash, keyMeta] of this.apiKeys) {
        if (crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(registeredHash))) {
          return {
            actorType: 'api_key',
            actorId: keyMeta.name,
            tenantId: keyMeta.tenantId,
            scopes: keyMeta.scopes,
            permissions: keyMeta.permissions,
            memberships: [{ tenantId: keyMeta.tenantId, role: 'service_admin', permissions: keyMeta.permissions }]
          };
        }
      }
    }

    // 2. Verificação de Basic Auth (Usuário Humano)
    const authHeader = req.headers ? (req.headers.authorization || '') : '';
    const matchBasic = /^Basic\s+(.+)$/i.exec(authHeader);
    if (matchBasic) {
      try {
        const credentials = Buffer.from(matchBasic[1], 'base64').toString('utf8');
        const sepIdx = credentials.indexOf(':');
        if (sepIdx !== -1) {
          const u = credentials.slice(0, sepIdx).trim().toLowerCase();
          const p = credentials.slice(sepIdx + 1);
          const userMeta = this.users.get(u);
          if (userMeta) {
            const now = new Date();
            if (userMeta.lockedUntil && new Date(userMeta.lockedUntil) > now) {
              const minRestantes = Math.ceil((new Date(userMeta.lockedUntil) - now) / 60000);
              return {
                blocked: true,
                locked: true,
                error: 'account_locked',
                message: `Conta bloqueada temporariamente por 15 minutos após 5 tentativas consecutivas incorretas. Tente novamente em ${minRestantes} minuto(s).`
              };
            }

            if (userMeta.status === 'suspended') {
              return {
                blocked: true,
                suspended: true,
                error: 'user_suspended',
                message: 'Conta de usuário suspensa pelo administrador.'
              };
            }

            let passwordMatches = false;

            if (userMeta.algo === 'scrypt' && userMeta.salt) {
              passwordMatches = userRepository.verifyPassword(p, userMeta.passwordHash, userMeta.salt);
            } else {
              try {
                const legacyBuf = Buffer.from(userMeta.passwordHash, 'hex');
                const testBuf = digest(p);
                if (legacyBuf.length === testBuf.length) {
                  passwordMatches = crypto.timingSafeEqual(testBuf, legacyBuf);
                }
              } catch (_) {}
            }

            if (!passwordMatches) {
              userMeta.failedAttempts = (userMeta.failedAttempts || 0) + 1;
              if (userMeta.failedAttempts >= 5) {
                userMeta.lockedUntil = new Date(Date.now() + 15 * 60 * 1000).toISOString();
                userRepository.recordFailedAttempt(u).catch(() => {});
                return {
                  blocked: true,
                  locked: true,
                  error: 'account_locked',
                  message: 'Conta bloqueada temporariamente por 15 minutos após 5 tentativas consecutivas incorretas.'
                };
              }
              userRepository.recordFailedAttempt(u).catch(() => {});
              return null;
            }

            // Sucesso: reseta tentativas
            if (userMeta.failedAttempts > 0 || userMeta.lockedUntil) {
              userMeta.failedAttempts = 0;
              userMeta.lockedUntil = null;
              userRepository.resetFailedAttempts(userMeta.id).catch(() => {});
            }

            return {
              actorType: 'user',
              actorId: userMeta.username,
              userId: userMeta.id,
              mustChangePassword: !!userMeta.mustChangePassword,
              memberships: userMeta.memberships,
              scopes: ['user']
            };
          }
        }
      } catch (_) {}
    }

    return null;
  }
}

module.exports = {
  IdentityRegistry,
  safeCompare,
  digest
};
