'use strict';

// Executado apenas na copia nova; nunca carrega o .env do desenvolvedor.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

async function configure(root, company, tenant, port) {
  const app = path.join(root, 'app');
  if (fs.existsSync(path.join(app, '.env')) || fs.existsSync(path.join(app, 'patio.db'))) {
    throw new Error('Configuracao recusada: dados ou configuracao ja existentes.');
  }
  process.chdir(app);
  // Ambiente explicito para impedir heranca de credenciais/integracoes do host.
  const values = {
    NODE_ENV: 'production', HOST: '127.0.0.1', PORT: String(port),
    DB_PATH: './patio.db', UPLOAD_DIR: './uploads', BACKUP_DIR: './backups',
    DISABLE_INTEGRATIONS: 'true', DISABLE_WHATSAPP: 'true',
    FISCAL_FOCUS_TOKENS: '{}', API_KEY: '', AUTH_USER: '', AUTH_PASSWORD: '',
    GEMINI_API_KEY: '', ASAAS_API_KEY: '', BILLING_MODE: 'sandbox',
    TOKEN_SECRET: crypto.randomBytes(32).toString('hex'),
    FISCAL_ENCRYPTION_KEY: crypto.randomBytes(32).toString('hex')
  };
  Object.assign(process.env, values);
  for (const dir of ['uploads', 'backups', 'logs']) fs.mkdirSync(path.join(app, dir));
  const db = require(path.join(app, 'db.js'));
  try {
    await db.initDB();
    const users = require(path.join(app, 'lib/auth/userRepository.js'));
    const repository = require(path.join(app, 'lib/repository/stateRepository.js'));
    const context = { tenantId: tenant, actorId: 'installer', actorType: 'system', role: 'tenant_admin', permissions: ['*'], channel: 'internal' };
    const state = repository.getDefaultState(tenant);
    state.cfg.empresa = company;
    const saved = await repository.persistState(context, state);
    if (!saved.ok) throw new Error('Falha ao gravar estado inicial: ' + saved.error);
    const credentials = [];
    for (const [name, role] of [['gestor', 'tenant_admin'], ['atendente', 'atendente'], ['mecanico', 'mecanico']]) {
      const username = `${name}@piloto.local`;
      const password = `Aa9!${crypto.randomBytes(18).toString('base64url')}`;
      await users.createUser({ username, password, name, role, tenantId: tenant, allowWeakInTest: false });
      const auth = await users.authenticateUser(username, password);
      if (!auth.success) throw new Error('Falha ao validar usuario provisionado.');
      credentials.push(`${name}: ${username}\r\nSenha: ${password}\r\n`);
    }
    fs.writeFileSync(path.join(app, '.env'), Object.entries(values).map(([k, v]) => `${k}=${v}`).join('\n') + '\n', { flag: 'wx', mode: 0o600 });
    fs.writeFileSync(path.join(root, 'ACESSOS.txt'), `CONFIDENCIAL - ${company}\r\nhttp://127.0.0.1:${port}/?tenant=${tenant}\r\n\r\n${credentials.join('\r\n')}\r\nGuarde em local seguro e remova este arquivo apos armazenar as senhas.\r\n`, { flag: 'wx', mode: 0o600 });
    fs.writeFileSync(path.join(root, 'installation.json'), JSON.stringify({ company, tenant, port, host: '127.0.0.1', installedAt: new Date().toISOString() }, null, 2), { flag: 'wx' });
  } finally {
    await db.closeDB();
  }
}

if (require.main === module) {
  const config = JSON.parse(fs.readFileSync(0, 'utf8'));
  configure(config.root, config.company, config.tenant, config.port).catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
module.exports = { configure };
