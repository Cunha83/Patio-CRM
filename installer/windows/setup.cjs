'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const net = require('node:net');
const { spawnSync } = require('node:child_process');
const readline = require('node:readline/promises');

function filesUnder(root, prefix = '') {
  return fs.readdirSync(path.join(root, prefix), { withFileTypes: true }).flatMap(entry => {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isSymbolicLink()) throw new Error(`Link nao permitido no pacote: ${relative}`);
    return entry.isDirectory() ? filesUnder(root, relative) : [relative];
  }).sort();
}

function verifyPackage(root) {
  const expected = JSON.parse(fs.readFileSync(path.join(root, 'SHA256SUMS.json'), 'utf8'));
  const actualFiles = filesUnder(root).filter(file => file !== 'SHA256SUMS.json');
  if (JSON.stringify(actualFiles) !== JSON.stringify(Object.keys(expected).sort())) throw new Error('Inventario do pacote divergente. Extraia novamente o ZIP original.');
  for (const file of actualFiles) {
    const hash = crypto.createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex');
    if (hash !== expected[file]) throw new Error(`Arquivo alterado ou corrompido: ${file}`);
  }
}

function portAvailable(port) {
  return new Promise(resolve => {
    const probe = net.createServer();
    probe.once('error', () => resolve(false));
    probe.listen(port, '127.0.0.1', () => probe.close(() => resolve(true)));
  });
}

function secureDirectory(target) {
  const identity = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', '[System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value'], { encoding: 'utf8', windowsHide: true });
  const sid = identity.stdout?.trim();
  if (identity.status !== 0 || !/^S-1-\d+(?:-\d+)+$/.test(sid)) throw new Error('Nao foi possivel identificar o usuario Windows.');
  const acl = spawnSync('icacls.exe', [target, '/inheritance:r', '/grant:r', `*${sid}:(OI)(CI)F`, '*S-1-5-18:(OI)(CI)F', '*S-1-5-32-544:(OI)(CI)F'], { encoding: 'utf8', windowsHide: true });
  if (acl.status !== 0) throw new Error('Falha ao proteger a pasta de dados com permissoes Windows.');
}

function cleanEnvironment() {
  // Apenas variaveis do sistema necessarias para Node/Windows. Nenhum segredo herdado.
  const keys = new Set(['systemroot', 'windir', 'path', 'pathext', 'comspec', 'temp', 'tmp', 'userprofile', 'localappdata', 'appdata', 'username', 'userdomain', 'homedrive', 'homepath']);
  return Object.fromEntries(Object.entries(process.env).filter(([key]) => keys.has(key.toLowerCase())));
}

async function install({ source = __dirname, company, target, port, shortcut = true }) {
  if (process.platform !== 'win32' || process.arch !== 'x64') throw new Error('Este pacote requer Windows x64.');
  if (typeof company !== 'string' || !company.trim() || company.length > 120 || /[\x00-\x1f<>]/.test(company)) throw new Error('Nome de empresa invalido (1 a 120 caracteres, sem controles ou tags).');
  console.log('Conferindo integridade do pacote...');
  verifyPackage(source);
  const tenant = `piloto_${crypto.randomBytes(12).toString('hex')}`;
  target = path.resolve(target || path.join(process.env.LOCALAPPDATA, 'PatioCRM', tenant));
  if (fs.existsSync(target)) throw new Error('Destino ja existe. Nenhum arquivo foi alterado.');
  if (port === undefined) {
    for (port = 3000; port < 3100 && !(await portAvailable(port)); port++);
    if (port === 3100) throw new Error('Nenhuma porta livre entre 3000 e 3099.');
  }
  if (!Number.isInteger(port) || port < 1024 || port > 65535 || !(await portAvailable(port))) throw new Error('Porta invalida ou ocupada.');
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.mkdirSync(target); // Exclusivo: nunca sobrescreve instalacao concorrente.
  secureDirectory(target);
  console.log('Instalando em:', target);
  for (const name of ['app', 'runtime']) fs.cpSync(path.join(source, name), path.join(target, name), { recursive: true, errorOnExist: true, force: false });
  for (const name of ['Iniciar.cmd', 'start.cjs', 'setup.cjs', 'LEIA-ME.txt']) fs.copyFileSync(path.join(source, name), path.join(target, name));
  const result = spawnSync(path.join(target, 'runtime/node.exe'), [path.join(source, 'configure.cjs')], {
    cwd: target, input: JSON.stringify({ root: target, company: company.trim(), tenant, port }), encoding: 'utf8',
    env: cleanEnvironment(), windowsHide: true, timeout: 120000
  });
  if (result.status !== 0) throw new Error(`Falha na configuracao. Pasta preservada: ${target}\n${result.stderr || result.error?.message || 'Consulte suporte.'}`);
  if (shortcut) {
    const command = "$s=(New-Object -ComObject WScript.Shell).CreateShortcut((Join-Path ([Environment]::GetFolderPath('Desktop')) ('Patio CRM '+$env:PATIO_TENANT+'.lnk'))); $s.TargetPath=Join-Path $env:PATIO_INSTALL 'Iniciar.cmd'; $s.WorkingDirectory=$env:PATIO_INSTALL; $s.Description='Patio CRM - piloto local'; $s.Save()";
    const link = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], { env: { ...cleanEnvironment(), PATIO_INSTALL: target, PATIO_TENANT: tenant }, encoding: 'utf8', windowsHide: true });
    if (link.status !== 0) console.warn('Atalho nao criado. Use Iniciar.cmd na pasta instalada.');
  }
  console.log('Instalacao concluida. Abra Iniciar.cmd ou o atalho da Area de Trabalho.');
  console.log('Credenciais exclusivas em:', path.join(target, 'ACESSOS.txt'));
  return { target, tenant, port };
}

if (require.main === module) {
  (async () => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    let company;
    try {
      console.log('PATIO CRM - instalacao local para testes (Windows x64)');
      company = await rl.question('Nome da empresa: ');
    } finally { rl.close(); }
    await install({ company });
  })().catch(error => { console.error(error.message); process.exitCode = 1; });
}
module.exports = { install, verifyPackage, filesUnder, portAvailable, cleanEnvironment };
