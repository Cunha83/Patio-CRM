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

router.post('/api/auth/signup', async (req, res) => {
  const { nome, empresa, whatsapp, email, senha, utm_source, utm_medium, utm_campaign, utm_content, referralCode, aceitouTermos } = req.body || {};

  if (!nome || !empresa || !email || !senha) {
    return res.status(400).json({ error: 'Campos obrigatórios: nome, empresa, email, senha.' });
  }

  // Validação rigorosa de política de senhas (mínimo 12 caracteres em produção)
  const isTest = process.env.NODE_ENV !== 'production';
  const pwCheck = userRepository.validatePasswordPolicy(senha, { allowWeakInTest: isTest });
  if (!pwCheck.valid) {
    return res.status(400).json({ error: `Senha inválida: ${pwCheck.errors.join(' ')}` });
  }

  // Gera slug seguro de tenant
  const slugBase = empresa.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '_')
    .slice(0, 20);
  const tenantSlug = `oficina_${slugBase}_${crypto.randomBytes(3).toString('hex')}`;

  try {
    // 3.1 Inicializa o estado padrão da nova oficina
    const newState = getDefaultState(tenantSlug);
    newState.cfg.empresa = empresa.trim();
    if (whatsapp) newState.cfg.fone = whatsapp.trim();
    newState.cfg.contatoResponsavel = nome.trim();

    // 3.2 Vincula Trial Pro de 14 dias
    const trialDays = BILLING_CONFIG.trial.durationDays;
    const now = new Date();
    const trialEnds = new Date(now.getTime() + trialDays * 24 * 60 * 60 * 1000);

    newState.subscription = {
      tenantId: tenantSlug,
      plan: 'trial',
      status: 'trialing',
      startedAt: now.toISOString(),
      trialEndsAt: trialEnds.toISOString(),
      billingCycle: 'mensal',
      features: [...subscriptionService.PLANOS_FEATURES.pro]
    };

    // 3.3 Persiste no SQLite
    await salvarEstado({
      securityContext: { tenantId: tenantSlug, role: 'admin', permissions: ['*'], channel: 'internal' }
    }, newState);

    const userEmail = email.trim().toLowerCase();

    // 3.4 Criação durável de usuário no banco SQLite com Scrypt
    const userRecord = await userRepository.createUser({
      username: userEmail,
      email: userEmail,
      password: senha,
      role: 'tenant_admin',
      tenantId: tenantSlug,
      allowWeakInTest: isTest,
      memberships: [
        { tenantId: tenantSlug, role: 'tenant_admin', permissions: userRepository.ROLE_PERMISSIONS.tenant_admin }
      ]
    });

    // 3.5 Registro de auditoria do aceite dos Termos de Uso e Política de Privacidade
    if (aceitouTermos) {
      await userRepository.recordTermsConsent({
        userId: userRecord.id,
        tenantId: tenantSlug,
        termsVersion: req.body.termsVersion || '1.0',
        privacyVersion: req.body.privacyVersion || '1.0',
        ipAddress: req.ip || req.connection?.remoteAddress,
        userAgent: req.headers['user-agent']
      });
    }

    // 3.6 Registra usuário no IdentityRegistry em memória para autenticação imediata
    identityRegistry.registerUser({
      username: userEmail,
      password: senha,
      passwordHash: userRecord.password_hash,
      salt: userRecord.password_salt,
      memberships: [
        { tenantId: tenantSlug, role: 'tenant_admin', permissions: userRepository.ROLE_PERMISSIONS.tenant_admin }
      ]
    });

    // 3.7 Registra no subsistema de billing
    await billingService.getOrCreateBillingCustomer({
      tenantId: tenantSlug,
      legalName: empresa.trim(),
      email: userEmail,
      phone: whatsapp ? whatsapp.trim() : ''
    });
    await billingService.initializeSubscription({
      tenantId: tenantSlug,
      plan: 'pro',
      status: 'trialing',
      startedAt: now.toISOString()
    });

    // 3.8 Registra telemetria comercial de cadastro e início de trial (sem PII)
    saasTelemetry.recordTenantSignup(tenantSlug, {
      utmSource: utm_source,
      utmMedium: utm_medium,
      utmCampaign: utm_campaign,
      utmContent: utm_content,
      referralCode
    });

    return res.status(201).json({
      ok: true,
      tenantId: tenantSlug,
      user: { username: userEmail, name: nome.trim() },
      subscription: newState.subscription,
      redirect: '/#onboarding'
    });
  } catch (err) {
    console.error('[API /api/auth/signup POST] Erro ao provisionar tenant:', err);
    return res.status(500).json({ error: 'Falha ao provisionar tenant: ' + err.message });
  }
});


// 4. Autenticação Formal: Login, Troca de Senha, Recuperação e Redefinição
router.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'Credenciais ausentes: username e password são obrigatórios.' });
  }

  const cleanUser = String(username).trim().toLowerCase();
  const clientIp = req.ip || req.connection?.remoteAddress || '';

  try {
    const authRes = await userRepository.authenticateUser(cleanUser, password);
    if (!authRes.success) {
      await recordSecurityAudit({
        actorId: cleanUser,
        action: authRes.locked ? 'USER_LOCKED_OUT' : 'USER_LOGIN_FAILED',
        entity: 'user',
        entityId: cleanUser,
        ipAddress: clientIp,
        details: { attempts: authRes.attempts, locked: authRes.locked }
      });

      const statusCode = authRes.locked ? 423 : 401;
      return res.status(statusCode).json({
        error: authRes.locked ? 'account_locked' : 'invalid_credentials',
        message: authRes.error
      });
    }

    const { user } = authRes;
    await recordSecurityAudit({
      tenantId: user.memberships[0]?.tenantId || null,
      actorId: user.username,
      action: 'USER_LOGIN_SUCCESS',
      entity: 'user',
      entityId: user.id,
      ipAddress: clientIp
    });

    identityRegistry.registerUser({
      username: user.username,
      password,
      passwordHash: user.password_hash,
      salt: user.password_salt,
      mustChangePassword: user.mustChangePassword,
      memberships: user.memberships
    });

    const primaryRole = user.role || user.memberships?.[0]?.role || 'admin';
    const primaryTenant = user.memberships?.[0]?.tenantId || 'automolas_fort';
    const permissoes = user.memberships?.[0]?.permissions || tokenService.BASE_ROLES[primaryRole]?.permissions || ['*'];
    const cargo = tokenService.BASE_ROLES[primaryRole]?.cargo || primaryRole;

    const token = tokenService.generateToken({
      userId: user.id,
      username: user.username,
      nome: user.name || user.username,
      cargo,
      role: primaryRole,
      tenantId: primaryTenant,
      permissoes
    });

    return res.json({
      success: true,
      token,
      user: {
        id: user.id,
        username: user.username,
        name: user.name || user.username,
        nome: user.name || user.username,
        cargo,
        role: primaryRole,
        tenantId: primaryTenant,
        permissoes,
        mustChangePassword: user.mustChangePassword,
        memberships: user.memberships
      }
    });
  } catch (err) {
    console.error('[API /api/auth/login POST] Erro:', err);
    res.status(500).json({ error: 'Erro interno ao autenticar usuário.' });
  }
});

router.get('/api/auth/me', async (req, res) => {
  if (!req.securityContext || !req.securityContext.actorId) {
    return res.status(401).json({ success: false, error: 'Requer autenticação prévia.' });
  }
  const ctx = req.securityContext;
  const role = ctx.role || 'admin';
  const cargo = ctx.cargo || tokenService.BASE_ROLES[role]?.cargo || role;
  return res.json({
    success: true,
    user: {
      id: ctx.userId || ctx.actorId,
      username: ctx.actorId,
      nome: ctx.nome || ctx.actorId,
      name: ctx.nome || ctx.actorId,
      cargo,
      role,
      tenantId: ctx.tenantId || 'automolas_fort',
      permissoes: ctx.permissions || tokenService.BASE_ROLES[role]?.permissions || ['*']
    }
  });
});

router.post('/api/auth/logout', async (req, res) => {
  if (req.securityContext?.actorId) {
    await recordSecurityAudit({
      tenantId: req.securityContext.tenantId,
      actorId: req.securityContext.actorId,
      action: 'USER_LOGOUT',
      entity: 'user',
      entityId: req.securityContext.userId
    });
  }
  return res.json({ success: true, message: 'Sessão encerrada com sucesso.' });
});

// ── CRUD de Usuários & Controle de Acesso (RBAC Admin) ────────

module.exports = router;
