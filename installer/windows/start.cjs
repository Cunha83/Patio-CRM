'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { portAvailable, cleanEnvironment } = require('./setup.cjs');

async function start(root = __dirname, { openBrowser = true } = {}) {
  const config = JSON.parse(fs.readFileSync(path.join(root, 'installation.json'), 'utf8'));
  if (!Number.isInteger(config.port) || config.port < 1024 || config.port > 65535 || !/^piloto_[a-f0-9]{24}$/.test(config.tenant)) throw new Error('Configuracao da instalacao invalida.');
  if (!(await portAvailable(config.port))) throw new Error('Porta ocupada. Verifique se o Patio ja esta aberto; nenhum processo foi encerrado.');
  const app = path.join(root, 'app');
  const env = require(path.join(app, 'node_modules/dotenv')).parse(fs.readFileSync(path.join(app, '.env')));
  // Reaplica limites da distribuicao local mesmo se o host tiver outras variaveis.
  const child = spawn(path.join(root, 'runtime/node.exe'), ['scripts/supervise_patio.cjs'], {
    cwd: app, env: { ...cleanEnvironment(), ...env, HOST: '127.0.0.1', PORT: String(config.port), NODE_ENV: 'production', DISABLE_INTEGRATIONS: 'true', DISABLE_WHATSAPP: 'true' },
    stdio: 'inherit', windowsHide: true
  });
  let exited = false;
  child.on('error', error => { exited = true; console.error(error.message); process.exitCode = 1; });
  child.on('exit', code => { exited = true; process.exitCode = code || 0; });
  // O supervisor recebe Ctrl+C pelo mesmo console e encerra seu filho.
  const onSignal = () => {};
  process.on('SIGINT', onSignal);
  child.once('exit', () => process.off('SIGINT', onSignal));
  const url = `http://127.0.0.1:${config.port}/?tenant=${config.tenant}`;
  const deadline = Date.now() + 45000;
  while (!exited && Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${config.port}/ready`, { signal: AbortSignal.timeout(1500) });
      if (response.ok && (await response.json()).status === 'ready') {
        console.log(`\nPATIO CRM: ${url}\nMantenha esta janela aberta. Ctrl+C encerra o programa.\n`);
        if (openBrowser) {
          const browser = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', 'Start-Process -FilePath $env:PATIO_URL'], { env: { ...cleanEnvironment(), PATIO_URL: url }, stdio: 'ignore', windowsHide: true });
          browser.on('error', () => console.warn('Abra o endereco acima no navegador.'));
        }
        return child;
      }
    } catch (_) { /* Aguarda a inicializacao do SQLite. */ }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  console.error('Servidor nao ficou pronto. Consulte app/logs.');
  return child;
}
if (require.main === module) start().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { start };
