'use strict';

const crypto = require('crypto');
const { isValidTenantId } = require('../repository/stateRepository');
const { metrics } = require('../metrics');

function createAuthMiddleware(registry, options = {}) {
  const defaultSingleTenantId = options.defaultSingleTenantId || process.env.DEFAULT_SINGLE_TENANT_ID || null;
  const defaultPublicPrefixes = [
    '/aprovacao/', '/api/aprovacao/', '/health', '/ready',
    '/precos', '/cadastro', '/checkout', '/assinatura',
    '/webhooks/billing', '/api/public/', '/api/auth/signup',
    '/api/auth/login', '/api/auth/recuperar-senha', '/api/auth/resetar-senha',
    '/api/billing/checkout', '/api/billing/pix/qr/'
  ];
  const publicPathPrefixes = options.publicPathPrefixes || defaultPublicPrefixes;

  return async function requireSecurityContext(req, res, next) {
    if (publicPathPrefixes.some(prefix => req.path && (req.path === prefix || req.path === prefix.slice(0, -1) || req.path.startsWith(prefix)))) {
      return next();
    }
    if (registry && registry.initializationPromise) {
      await registry.initializationPromise;
    }
    const t0 = performance.now();
    const auth = registry.authenticate(req);

    if (auth && auth.blocked) {
      metrics.recordAuth({
        latencyMs: performance.now() - t0,
        success: false,
        errorType: auth.error || '403_blocked',
        tenantId: req.headers ? req.headers['x-tenant-id'] : null
      });
      const statusCode = auth.locked ? 423 : 403;
      return res.status(statusCode).json({ error: auth.error, message: auth.message });
    }

    if (!auth) {
      metrics.recordAuth({
        latencyMs: performance.now() - t0,
        success: false,
        errorType: '401_missing_or_invalid_credentials',
        tenantId: req.headers ? req.headers['x-tenant-id'] : null
      });
      if (res && typeof res.setHeader === 'function') {
        res.setHeader('WWW-Authenticate', 'Basic realm="Patio CRM", charset="UTF-8"');
      }
      if (res && typeof res.status === 'function') {
        return res.status(401).json({ error: 'Credenciais ausentes ou inválidas.' });
      }
      return;
    }

    // ── BLOQUEIO DE OPERAÇÕES SE TROCA DE SENHA FOR OBRIGATÓRIA ──
    if (auth.mustChangePassword) {
      const allowedPaths = ['/api/auth/change-password', '/api/auth/logout'];
      if (req.path && !allowedPaths.includes(req.path)) {
        return res.status(403).json({
          error: 'password_change_required',
          message: 'Alteração de senha obrigatória antes de prosseguir com outras operações.'
        });
      }
    }

    // CSRF / Origem em métodos com efeitos colaterais
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      if (req.headers['sec-fetch-site'] === 'cross-site') {
        metrics.recordAuth({
          latencyMs: performance.now() - t0,
          success: false,
          errorType: '403_cross_site_request',
          tenantId: req.headers ? req.headers['x-tenant-id'] : null,
          actorId: auth.actorId
        });
        return res.status(403).json({ error: 'Origem não permitida.' });
      }
      if (req.headers.origin && req.headers.host) {
        try {
          if (new URL(req.headers.origin).host !== req.headers.host) {
            metrics.recordAuth({
              latencyMs: performance.now() - t0,
              success: false,
              errorType: '403_origin_mismatch',
              tenantId: req.headers ? req.headers['x-tenant-id'] : null,
              actorId: auth.actorId
            });
            return res.status(403).json({ error: 'Origem não permitida.' });
          }
        } catch (_) {
          metrics.recordAuth({
            latencyMs: performance.now() - t0,
            success: false,
            errorType: '403_invalid_origin_url',
            tenantId: req.headers ? req.headers['x-tenant-id'] : null,
            actorId: auth.actorId
          });
          return res.status(403).json({ error: 'Origem não permitida.' });
        }
      }
    }

    // ── ROTAS DE PLATAFORMA SAAS (REAL SOLUÇÕES) ──
    if (req.path && req.path.startsWith('/api/platform/')) {
      const isPlatformUser = (auth.actorType === 'api_key' && auth.scopes.includes('*')) ||
        (auth.actorType === 'user' && auth.memberships.some(m => ['platform_admin', 'platform_support'].includes(m.role)));

      if (!isPlatformUser) {
        metrics.recordAuth({
          latencyMs: performance.now() - t0,
          success: false,
          errorType: '403_platform_unauthorized',
          actorId: auth.actorId
        });
        return res.status(403).json({ error: 'Acesso negado: requer privilégios de plataforma SaaS (Real Soluções).' });
      }

      const platformMembership = auth.actorType === 'user'
        ? auth.memberships.find(m => ['platform_admin', 'platform_support'].includes(m.role)) || { role: 'platform_admin' }
        : { role: 'platform_admin' };

      const reqId = req.headers['x-request-id'] || (`req_${Date.now()}_` + crypto.randomBytes(4).toString('hex'));
      req.id = reqId;
      if (res && res.setHeader) res.setHeader('x-request-id', reqId);

      req.securityContext = {
        tenantId: '_platform_',
        actorId: auth.actorId,
        actorType: auth.actorType,
        role: platformMembership.role || 'platform_admin',
        permissions: platformMembership.role === 'platform_admin'
          ? ['platform:read', 'platform:manage', '*']
          : (platformMembership.permissions || ['platform:read', 'platform:support']),
        requestId: reqId,
        channel: 'http'
      };
      const supportAction = req.path === '/api/platform/support/impersonate' || /^\/api\/platform\/support\/sessions\/[^/]+\/close$/.test(req.path);
      const required = ['GET', 'HEAD', 'OPTIONS'].includes(req.method) ? 'platform:read' : (supportAction ? 'platform:support' : 'platform:manage');
      if (!req.securityContext.permissions.includes('*') && !req.securityContext.permissions.includes(required)) {
        return res.status(403).json({ error: 'Permissão de plataforma insuficiente.' });
      }
      return next();
    }

    // Resolução do Tenant Solicitado
    let requestedTenant = req.headers['x-tenant-id'];
    if (typeof requestedTenant === 'string') requestedTenant = requestedTenant.trim();

    if (!requestedTenant && req.query) {
      const qTenant = req.query.tenant || req.query.tenantId;
      if (typeof qTenant === 'string' && qTenant.trim()) {
        requestedTenant = qTenant.trim();
      }
    }

    if (!requestedTenant) {
      // Para assets estáticos do frontend (scripts e CSS) requisitados pelo browser:
      const isStaticAsset = req.path && (req.path.startsWith('/js/') || req.path === '/style.css' || req.path === '/favicon.ico');
      if (isStaticAsset && auth.actorType === 'user' && Array.isArray(auth.memberships) && auth.memberships.length === 1) {
        requestedTenant = auth.memberships[0].tenantId;
      } else if (defaultSingleTenantId) {
        requestedTenant = defaultSingleTenantId;
      } else if (auth.actorType === 'api_key' && auth.tenantId) {
        requestedTenant = auth.tenantId;
      } else {
        metrics.recordAuth({
          latencyMs: performance.now() - t0,
          success: false,
          errorType: '403_missing_tenant',
          actorId: auth.actorId
        });
        return res.status(403).json({ error: 'Acesso negado: identificador de tenant ausente.' });
      }
    }

    if (!isValidTenantId(requestedTenant)) {
      metrics.recordAuth({
        latencyMs: performance.now() - t0,
        success: false,
        errorType: '403_invalid_tenant_id',
        tenantId: requestedTenant,
        actorId: auth.actorId
      });
      return res.status(403).json({ error: 'Acesso negado: identificador de tenant inválido.' });
    }

    // Validação de Associação (Membership / Tenant Binding)
    let isAuthorized = false;
    let permissions = [];
    let role = 'guest';
    let supportSessionData = null;

    // Checagem de Support Session (Impersonation Auditado)
    const supportSessionId = req.headers ? req.headers['x-support-session'] : null;
    if (supportSessionId) {
      try {
        const { getActiveSupportSession } = require('../../services/billing/platformAdminService');
        const session = getActiveSupportSession(supportSessionId);
        if (session && session.tenantId === requestedTenant) {
          const callerId = (auth.actorId || auth.username || '').toLowerCase();
          const isSessionOperator = callerId && callerId === (session.operator || '').toLowerCase();
          const isPlatformCaller = auth.actorType === 'api_key' ||
            (Array.isArray(auth.memberships) && auth.memberships.some(m => ['platform_admin', 'platform_support'].includes(m.role)));

          if (isSessionOperator || isPlatformCaller) {
            isAuthorized = true;
            role = 'platform_support';
            permissions = ['*'];
            supportSessionData = session;
          }
        }
      } catch (_) {}
    }

    if (!isAuthorized && auth.actorType === 'api_key') {
      if (auth.tenantId === requestedTenant || auth.scopes.includes('*')) {
        isAuthorized = true;
        permissions = auth.permissions;
        role = 'service_admin';
      }
    } else if (!isAuthorized && auth.actorType === 'user') {
      const membership = auth.memberships.find(m => m.tenantId === requestedTenant);
      if (membership) {
        isAuthorized = true;
        role = membership.role;
        permissions = membership.permissions || [];
        if (membership.role === 'admin' || membership.role === 'tenant_admin') {
          permissions = [
            'os:read', 'os:write', 'os:delete', 'admin:settings', 'whatsapp:admin',
            'reports:read', 'financial:read', 'financial:write', 'operation:read', 'operation:manage',
            'inspection:read', 'inspection:write', 'quotation:read', 'quotation:write', 'quotation:send',
            'inventory:read', 'inventory:write', 'inventory:adjust', 'purchase:read', 'purchase:write', 'purchase:approve',
            'supplier:read', 'supplier:write', 'labor:read', 'labor:write', 'labor:adjust',
            'productivity:read', 'productivity:manage', 'costing:read', 'pricing:read', 'pricing:recommend', 'pricing:override',
            'profitability:read', 'crm:read', 'crm:write', 'crm:contact', 'maintenance:read', 'maintenance:write', 'maintenance:schedule',
            'appointments:read', 'appointments:write', 'company:settings', 'assistant:settings', 'backup:manage', 'erp:sync',
            'fiscal:read', 'fiscal:write', 'fiscal:cancel', 'fiscal:settings', '*'
          ];
        }
      }
    }

    if (!isAuthorized) {
      metrics.recordAuth({
        latencyMs: performance.now() - t0,
        success: false,
        errorType: '403_unauthorized_tenant',
        tenantId: requestedTenant,
        actorId: auth.actorId
      });
      return res.status(403).json({ error: 'Acesso negado: tenant não autorizado para esta identidade.' });
    }

    metrics.recordAuth({
      latencyMs: performance.now() - t0,
      success: true,
      tenantId: requestedTenant,
      actorId: auth.actorId,
      role
    });

    const reqId = req.headers['x-request-id'] || (`req_${Date.now()}_` + crypto.randomBytes(4).toString('hex'));
    req.id = reqId;
    if (res && res.setHeader) res.setHeader('x-request-id', reqId);

    req.securityContext = {
      tenantId: requestedTenant,
      actorId: auth.actorId,
      actorType: auth.actorType,
      role,
      permissions,
      requestId: reqId,
      channel: 'http',
      supportSession: supportSessionData,
      warningBanner: supportSessionData?.warningBanner || null
    };

    next();
  };
}

module.exports = {
  createAuthMiddleware
};
