const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const {
  salvarEstado,
  identityRegistry,
  recordSecurityAudit
} = require('../lib/serverContext');
const { getDefaultState } = require('../lib/repository/stateRepository');
const userRepository = require('../lib/auth/userRepository');
const subscriptionService = require('../services/subscriptionService');
const billingService = require('../services/billing/billingService');
const saasTelemetry = require('../services/billing/saasTelemetryService');
const { BILLING_CONFIG } = require('../services/billing/billingConfig');
const tokenService = require('../lib/auth/tokenService');

router.get('/api/usuarios', async (req, res) => {
  if (!req.securityContext || (req.securityContext.role !== 'admin' && !req.securityContext.permissions.includes('*') && !req.securityContext.permissions.includes('admin:settings'))) {
    return res.status(403).json({ success: false, error: 'Acesso negado: requer privilégios de Administrador.' });
  }
  try {
    const usuarios = await userRepository.listUsers(req.securityContext.tenantId);
    return res.json({ success: true, usuarios });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/api/usuarios', async (req, res) => {
  if (!req.securityContext || (req.securityContext.role !== 'admin' && !req.securityContext.permissions.includes('*') && !req.securityContext.permissions.includes('admin:settings'))) {
    return res.status(403).json({ success: false, error: 'Acesso negado: requer privilégios de Administrador.' });
  }
  const { username, email, nome, role, senha, password, phone } = req.body || {};
  const pass = senha || password;
  if (!username || !pass) {
    return res.status(400).json({ success: false, error: 'Usuário e senha são obrigatórios.' });
  }
  const cleanUser = String(username).trim().toLowerCase();
  const cleanRole = role || 'vendedor';
  const isTest = process.env.NODE_ENV !== 'production';
  const tenantId = req.securityContext.tenantId || 'automolas_fort';

  try {
    const novoUser = await userRepository.createUser({
      username: cleanUser,
      email: email || (cleanUser.includes('@') ? cleanUser : `${cleanUser}@automolas.com.br`),
      name: nome || cleanUser,
      phone: phone || '',
      password: pass,
      role: cleanRole,
      tenantId,
      allowWeakInTest: isTest,
      memberships: [
        { tenantId, role: cleanRole, permissions: tokenService.BASE_ROLES[cleanRole]?.permissions || ['os:read'] }
      ]
    });

    identityRegistry.registerUser({
      username: cleanUser,
      password: pass,
      passwordHash: novoUser.password_hash,
      salt: novoUser.password_salt,
      memberships: novoUser.memberships
    });

    await recordSecurityAudit({
      tenantId,
      actorId: req.securityContext.actorId,
      action: 'USER_CREATED',
      entity: 'user',
      entityId: novoUser.id,
      details: { username: cleanUser, role: cleanRole }
    });

    return res.status(201).json({ success: true, user: novoUser });
  } catch (err) {
    return res.status(400).json({ success: false, error: err.message });
  }
});

router.put('/api/usuarios/:id', async (req, res) => {
  if (!req.securityContext || (req.securityContext.role !== 'admin' && !req.securityContext.permissions.includes('*') && !req.securityContext.permissions.includes('admin:settings'))) {
    return res.status(403).json({ success: false, error: 'Acesso negado: requer privilégios de Administrador.' });
  }
  const { id } = req.params;
  const { nome, role, status, phone, senha, password } = req.body || {};
  const pass = senha || password;

  try {
    const userAtualizado = await userRepository.updateUser(id, {
      name: nome,
      role,
      status,
      phone,
      password: pass,
      tenantId: req.securityContext.tenantId
    });

    if (userAtualizado) {
      await identityRegistry.syncUser(userAtualizado.username);
    }

    await recordSecurityAudit({
      tenantId: req.securityContext.tenantId,
      actorId: req.securityContext.actorId,
      action: 'USER_UPDATED',
      entity: 'user',
      entityId: id,
      details: { role, status }
    });

    return res.json({ success: true, user: userAtualizado });
  } catch (err) {
    return res.status(400).json({ success: false, error: err.message });
  }
});

router.delete('/api/usuarios/:id', async (req, res) => {
  if (!req.securityContext || (req.securityContext.role !== 'admin' && !req.securityContext.permissions.includes('*') && !req.securityContext.permissions.includes('admin:settings'))) {
    return res.status(403).json({ success: false, error: 'Acesso negado: requer privilégios de Administrador.' });
  }
  const { id } = req.params;
  try {
    await userRepository.deleteUser(id);
    await recordSecurityAudit({
      tenantId: req.securityContext.tenantId,
      actorId: req.securityContext.actorId,
      action: 'USER_DELETED',
      entity: 'user',
      entityId: id
    });
    return res.json({ success: true, message: 'Usuário desativado com sucesso.' });
  } catch (err) {
    return res.status(400).json({ success: false, error: err.message });
  }
});

// ── Trilha de Auditoria (Admin) ──────────────────────────────
router.get('/api/auditoria', async (req, res) => {
  if (!req.securityContext || (req.securityContext.role !== 'admin' && !req.securityContext.permissions.includes('*') && !req.securityContext.permissions.includes('admin:settings'))) {
    return res.status(403).json({ success: false, error: 'Acesso negado: requer privilégios de Administrador.' });
  }
  try {
    const { all } = require('../db');
    const rows = await all('SELECT * FROM security_audit_log ORDER BY created_at DESC LIMIT 100');
    const logs = (rows || []).map(r => {
      let detalhes = {};
      try {
        detalhes = r.details_json ? JSON.parse(r.details_json) : {};
      } catch (_) {}
      return {
        id: r.id,
        timestamp: r.created_at,
        data: r.created_at,
        usuario: r.actor_id,
        role: r.actor_id === 'admin' ? 'admin' : (r.actor_type || 'user'),
        acao: r.action,
        entidade: r.entity,
        detalhes
      };
    });
    return res.json({ success: true, total: logs.length, auditoria: logs });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});


module.exports = router;
