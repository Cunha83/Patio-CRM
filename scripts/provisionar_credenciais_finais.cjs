'use strict';

/**
 * PÁTIO CRM — PROVISIONADOR DE CREDENCIAIS DEFINITIVAS DOS OPERADORES
 * Substitui credenciais de exemplo por senhas criptograficamente fortes de alta entropia,
 * assegurando estrita conformidade com a política de senhas de produção.
 */

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const rootDir = path.resolve(__dirname, '..');
const deployDbPath = path.join(rootDir, 'deploy-piloto', 'patio.db');
const targetDb = process.env.DB_PATH ? path.resolve(process.env.DB_PATH) : deployDbPath;

// Carrega variáveis se disponível de deploy-piloto ou raiz
const envPath = fs.existsSync(path.join(rootDir, 'deploy-piloto', '.env'))
  ? path.join(rootDir, 'deploy-piloto', '.env')
  : path.join(rootDir, '.env');
if (fs.existsSync(envPath)) {
  try { require('dotenv').config({ path: envPath }); } catch (_) {}
}

process.env.DB_PATH = targetDb;
process.env.NODE_ENV = 'production';

const { initDB, closeDB, get } = require('../db');
const userRepository = require('../lib/auth/userRepository');

function getOperatorPassword(role) {
  const envKey = `PILOTO_${role.toUpperCase()}_SENHA`;
  if (process.env[envKey] && process.env[envKey].length >= 12) {
    return process.env[envKey];
  }
  // Se não estiver no ambiente, gera senha segura de alta entropia
  const saltHex = crypto.randomBytes(8).toString('hex');
  return `P@t1o!Sec#${role}_${saltHex}`;
}

function getCredenciaisDefinitivas() {
  return [
    {
      username: 'gestor@oficina.com.br',
      password: getOperatorPassword('gestor'),
      name: 'Gestor da Oficina Piloto',
      role: 'tenant_admin',
      tenantId: 'oficina_piloto_01'
    },
    {
      username: 'atendente@oficina.com.br',
      password: getOperatorPassword('atendente'),
      name: 'Atendente de Recepção',
      role: 'atendente',
      tenantId: 'oficina_piloto_01'
    },
    {
      username: 'mecanico@oficina.com.br',
      password: getOperatorPassword('mecanico'),
      name: 'Mecânico Chefe de Box',
      role: 'mecanico',
      tenantId: 'oficina_piloto_01'
    }
  ];
}

async function provisionarCredenciaisFinais() {
  console.log('================================================================');
  console.log(' PÁTIO CRM — PROVISIONAMENTO DE CREDENCIAIS DEFINITIVAS');
  console.log(' Banco:', targetDb);
  console.log('================================================================\n');

  if (!fs.existsSync(targetDb)) {
    throw new Error(`Banco de dados não encontrado em: ${targetDb}`);
  }

  await initDB();

  try {
    const credenciais = getCredenciaisDefinitivas();
    for (const op of credenciais) {
      console.log(`Configurando credencial definitiva para "${op.username}" (${op.role})...`);
      const user = await userRepository.getUserByUsername(op.username);

      if (!user) {
        // Cria usuário se ainda não existir
        await userRepository.createUser({
          username: op.username,
          password: op.password,
          fullName: op.name,
          role: op.role,
          tenantId: op.tenantId,
          allowWeakInTest: false
        });
        console.log(`  ✔ Usuário "${op.username}" criado com nova credencial de alta entropia. [SENHA_PROTEGIDA]`);
      } else {
        // Atualiza a senha existente para a nova senha forte
        await userRepository.updatePassword(user.id, op.password, { allowWeakInTest: false });

        // Confere membership
        const mem = await get('SELECT id FROM memberships WHERE user_id = ? AND tenant_id = ?', [user.id, op.tenantId]);
        if (!mem) {
          await userRepository.addMembership({
            userId: user.id,
            tenantId: op.tenantId,
            role: op.role
          });
        }
        console.log(`  ✔ Senha substituída com sucesso para "${op.username}". [SENHA_PROTEGIDA]`);
      }

      // Validação imediata de autenticação
      const authCheck = await userRepository.authenticateUser(op.username, op.password);
      if (!authCheck.success) {
        throw new Error(`Falha na auto-validação de autenticação para "${op.username}": ${authCheck.error}`);
      }
      console.log(`  ✔ Autenticação testada e aprovada para "${op.username}".`);
    }

    console.log('\n✔ Todas as credenciais foram provisionadas com alta entropia e proteção.');
    return { ok: true, total: credenciais.length };
  } finally {
    await closeDB().catch(() => {});
  }
}

if (require.main === module) {
  provisionarCredenciaisFinais()
    .then(() => process.exit(0))
    .catch(err => {
      console.error('Erro:', err.message);
      process.exit(1);
    });
}

module.exports = {
  provisionarCredenciaisFinais,
  getCredenciaisDefinitivas
};
