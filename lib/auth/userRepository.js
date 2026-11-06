'use strict';

/**
 * Pátio CRM — Repositório Central de Usuários e Autenticação
 * Fachada Modular (< 100 linhas).
 *
 * Submódulos especializados em lib/auth/:
 * - roles.js: matriz canônica de permissões RBAC
 * - passwordService.js: hash, validação de política, bloqueio e redefinição de senha
 * - userSeed.js: inicialização de usuários padrão (seeding)
 * - userCrud.js: criação, busca, listagem, atualização e autenticação
 */

const roles = require('./roles');
const passwordService = require('./passwordService');
const userSeed = require('./userSeed');
const userCrud = require('./userCrud');

module.exports = {
  // Constantes
  INSECURE_PASSWORDS: passwordService.INSECURE_PASSWORDS,
  ROLE_PERMISSIONS: roles.ROLE_PERMISSIONS,

  // Serviços de Senha e Lockout
  hashPassword: passwordService.hashPassword,
  verifyPassword: passwordService.verifyPassword,
  validatePasswordPolicy: passwordService.validatePasswordPolicy,
  updatePassword: passwordService.updatePassword,
  checkUserLockout: passwordService.checkUserLockout,
  recordFailedAttempt: passwordService.recordFailedAttempt,
  resetFailedAttempts: passwordService.resetFailedAttempts,
  createPasswordResetToken: passwordService.createPasswordResetToken,
  verifyPasswordResetToken: passwordService.verifyPasswordResetToken,
  resetPasswordWithToken: passwordService.resetPasswordWithToken,

  // Operações de Usuário e RBAC
  createUser: userCrud.createUser,
  getUserById: userCrud.getUserById,
  getUserByUsername: userCrud.getUserByUsername,
  authenticateUser: userCrud.authenticateUser,
  addMembership: userCrud.addMembership,
  countUsers: userCrud.countUsers,
  recordTermsConsent: userCrud.recordTermsConsent,
  listUsers: userCrud.listUsers,
  updateUser: userCrud.updateUser,
  deleteUser: userCrud.deleteUser,
  seedBaseUsers: userSeed.seedBaseUsers
};
