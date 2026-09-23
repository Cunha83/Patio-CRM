#!/usr/bin/env node
'use strict';

/**
 * PÁTIO CRM — SCRIPT DE PROVISIONAMENTO DO PRIMEIRO ADMINISTRADOR
 * Permite a criação explícita e segura do primeiro administrador
 * da plataforma (SaaS) ou de uma oficina específica (tenant_admin).
 */

const crypto = require('crypto');
const { initDB, closeDB } = require('../db');
const userRepository = require('../lib/auth/userRepository');

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].slice(2);
      const next = args[i + 1];
      if (next && !next.startsWith('--')) {
        options[key] = next;
        i++;
      } else {
        options[key] = true;
      }
    }
  }
  return options;
}

function generateSecurePassword(length = 16) {
  const uppers = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lowers = 'abcdefghijkmnopqrstuvwxyz';
  const numbers = '23456789';
  const specials = '!@#$%&*-_=+';
  const allChars = uppers + lowers + numbers + specials;

  let pwd = '';
  pwd += uppers[crypto.randomInt(uppers.length)];
  pwd += lowers[crypto.randomInt(lowers.length)];
  pwd += numbers[crypto.randomInt(numbers.length)];
  pwd += specials[crypto.randomInt(specials.length)];

  for (let i = 4; i < length; i++) {
    pwd += allChars[crypto.randomInt(allChars.length)];
  }

  // Shuffle
  return pwd.split('').sort(() => crypto.randomInt(3) - 1).join('');
}

async function main() {
  const options = parseArgs();
  await initDB();

  try {
    const role = options.role || (options.platform ? 'platform_admin' : 'tenant_admin');
    const tenantId = role === 'platform_admin' ? '_platform_' : (options.tenant || 'default');
    const username = options.username || (role === 'platform_admin' ? 'admin@realsolucoes.com.br' : 'admin@oficina.local');
    const autoGen = !options.password;
    const password = options.password || generateSecurePassword(16);
    const name = options.name || (role === 'platform_admin' ? 'Administrador da Plataforma' : 'Administrador da Oficina');

    console.log('\n======================================================');
    console.log('🔐 [Pátio CRM] Provisionamento de Administrador');
    console.log('======================================================');

    const existing = await userRepository.getUserByUsername(username);
    if (existing) {
      console.log(`⚠️  Usuário "${username}" já existe no banco de dados.`);
      if (options['reset-password']) {
        console.log('🔄 Atualizando senha conforme solicitado (--reset-password)...');
        await userRepository.updatePassword(existing.id, password);
        console.log('✅ Senha redefinida com sucesso.');
        console.log(`👤 Usuário: ${username}`);
        console.log(`🔑 Nova Senha: ${password}`);
      } else {
        console.log('ℹ️  Para resetar a senha, execute com a flag --reset-password.');
      }
      return;
    }

    const user = await userRepository.createUser({
      username,
      password,
      name,
      status: 'active',
      mustChangePassword: autoGen,
      memberships: [
        {
          tenantId,
          role,
          permissions: userRepository.ROLE_PERMISSIONS[role] || ['*']
        }
      ]
    });

    console.log('✅ Administrador provisionado com sucesso no SQLite!');
    console.log('------------------------------------------------------');
    console.log(`👤 ID do Usuário:    ${user.id}`);
    console.log(`📧 Nome de Usuário:  ${user.username}`);
    console.log(`🏢 Oficina / Tenant: ${tenantId}`);
    console.log(`🎖️  Papel (Role):     ${role}`);
    console.log(`🔑 Senha de Acesso:  ${password}`);
    if (autoGen) {
      console.log('⚠️  Senha gerada automaticamente. Altere-a no primeiro login.');
    }
    console.log('======================================================\n');
  } catch (err) {
    console.error('❌ Erro no provisionamento:', err.message);
    process.exitCode = 1;
  } finally {
    await closeDB();
  }
}

if (require.main === module) {
  main();
}

module.exports = { generateSecurePassword, main };
