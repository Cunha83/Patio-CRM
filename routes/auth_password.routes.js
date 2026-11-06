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

router.post('/api/auth/change-password', async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  const userContext = req.securityContext;

  if (!userContext || !userContext.actorId) {
    return res.status(401).json({ error: 'Requer autenticação prévia.' });
  }

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'currentPassword e newPassword são obrigatórios.' });
  }

  const username = userContext.actorId.toLowerCase();
  const clientIp = req.ip || req.connection?.remoteAddress || '';

  try {
    const authCheck = await userRepository.authenticateUser(username, currentPassword);
    if (!authCheck.success) {
      return res.status(401).json({ error: 'Senha atual incorreta.' });
    }

    const isTest = process.env.NODE_ENV !== 'production';
    await userRepository.updatePassword(authCheck.user.id, newPassword, { allowWeakInTest: isTest });
    identityRegistry.invalidateUser(username);

    await recordSecurityAudit({
      tenantId: userContext.tenantId,
      actorId: username,
      action: 'PASSWORD_CHANGED',
      entity: 'user',
      entityId: authCheck.user.id,
      ipAddress: clientIp
    });

    res.json({ success: true, message: 'Senha alterada com sucesso.' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

let passwordResetDeliveryAdapter = null;
function setPasswordResetDeliveryAdapter(adapter) {
  passwordResetDeliveryAdapter = adapter;
}

router.post('/api/auth/recuperar-senha', async (req, res) => {
  const { username, email } = req.body || {};
  const identifier = username || email;
  if (!identifier) {
    return res.status(400).json({ error: 'Informe o e-mail ou nome de usuário.' });
  }

  const clientIp = req.ip || req.connection?.remoteAddress || '';
  const hasDeliveryChannel = Boolean(
    passwordResetDeliveryAdapter ||
    process.env.SMTP_HOST ||
    process.env.MAIL_PROVIDER
  );

  try {
    const tokenInfo = await userRepository.createPasswordResetToken(identifier);
    if (tokenInfo) {
      await recordSecurityAudit({
        actorId: String(identifier).toLowerCase(),
        action: 'PASSWORD_RESET_REQUESTED',
        entity: 'user',
        entityId: tokenInfo.userId,
        ipAddress: clientIp
      });

      if (passwordResetDeliveryAdapter && typeof passwordResetDeliveryAdapter.sendResetLink === 'function') {
        await passwordResetDeliveryAdapter.sendResetLink({
          identifier,
          userId: tokenInfo.userId,
          token: tokenInfo.token,
          expiresAt: tokenInfo.expiresAt
        });
      }
    }

    if (!hasDeliveryChannel) {
      return res.status(200).json({
        success: false,
        status: 'delivery_channel_not_configured',
        message: 'Nenhum provedor de e-mail (SMTP) ou mensageria está configurado nesta instância do Pátio CRM. Para recuperação de acesso, solicite a redefinição diretamente a um Administrador da Oficina no painel administrativo.',
        procedure: 'administrative_reset_required'
      });
    }

    return res.json({
      success: true,
      message: 'Se a conta existir, as instruções de recuperação foram enviadas ao canal cadastrado.'
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/api/auth/resetar-senha', async (req, res) => {
  const { token, newPassword } = req.body || {};
  if (!token || !newPassword) {
    return res.status(400).json({ error: 'token e newPassword são obrigatórios.' });
  }

  const clientIp = req.ip || req.connection?.remoteAddress || '';
  const isTest = process.env.NODE_ENV !== 'production';

  try {
    const result = await userRepository.resetPasswordWithToken(token, newPassword, { allowWeakInTest: isTest });
    identityRegistry.invalidateUser(result.username);

    await recordSecurityAudit({
      actorId: result.username,
      action: 'PASSWORD_RESET_COMPLETED',
      entity: 'user',
      entityId: result.userId,
      ipAddress: clientIp
    });

    res.json({ success: true, message: 'Senha redefinida com sucesso. Faça login com a nova senha.' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});




module.exports = router;
