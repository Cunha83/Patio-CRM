'use strict';

// Build em pasta nova; somente arquivos de runtime aprovados no manifesto.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { filesUnder, cleanEnvironment } = require('../installer/windows/setup.cjs');
const root = path.resolve(__dirname, '..');
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

function allowed(file) {
  if (/(^|\/)(?:\.env[^/]*|uploads|backups|logs|node_modules)(\/|$)/i.test(file) || /\.(?:db|sqlite|pem|key|pfx|p12)(?:-|$)/i.test(file)) return false;
  return ['server.js', 'db.js', 'index.html', 'style.css', 'package.json', 'package-lock.json', 'scripts/supervise_patio.cjs'].includes(file) || /^(?:lib|services|js|public)\//.test(file);
}

async function build(output) {
  if (process.platform !== 'win32' || process.arch !== 'x64' || !process.version.startsWith('v24.')) throw new Error('Build requer Node 24 no Windows x64.');
  output = path.resolve(output || path.join(root, 'dist', `PatioCRM-Piloto-Windows-x64-${new Date().toISOString().replace(/[:.]/g, '-')}`));
  if (fs.existsSync(output)) throw new Error('Pasta de build ja existe. Use um destino novo.');
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'docs/operacao/manifesto_release.json'), 'utf8'));
  const files = Object.keys(manifest.arquivos).filter(allowed);
  // Confere tudo ANTES de copiar; nenhum banco/segredo local entra no build.
  for (const file of files) {
    const full = path.join(root, file);
    const relative = path.relative(root, fs.realpathSync(full));
    if (relative.startsWith('..') || path.isAbsolute(relative) || hash(full) !== manifest.arquivos[file]) throw new Error(`Fonte divergente do manifesto: ${file}`);
  }
  fs.mkdirSync(path.join(output, 'app'), { recursive: true });
  for (const file of files) {
    const dest = path.join(output, 'app', file);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(path.join(root, file), dest);
  }
  const templates = path.join(root, 'installer/windows');
  for (const file of filesUnder(templates)) fs.copyFileSync(path.join(templates, file), path.join(output, file));
  fs.mkdirSync(path.join(output, 'runtime'));
  fs.copyFileSync(process.execPath, path.join(output, 'runtime/node.exe'));
  const licenseUrl = `https://raw.githubusercontent.com/nodejs/node/${process.version}/LICENSE`;
  const license = await fetch(licenseUrl, { signal: AbortSignal.timeout(30000) });
  if (!license.ok) throw new Error('Nao foi possivel obter a licenca do Node incluido.');
  fs.writeFileSync(path.join(output, 'runtime/LICENSE-Node.txt'), await license.text());
  console.log(`Fontes conferidas: ${files.length}. Instalando dependencias do lockfile em pasta nova...`);
  const npm = path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
  const dependencies = spawnSync(process.execPath, [npm, 'ci', '--omit=dev', '--no-audit', '--no-fund'], {
    cwd: path.join(output, 'app'), stdio: 'inherit', windowsHide: true,
    env: { ...cleanEnvironment(), PUPPETEER_SKIP_DOWNLOAD: 'true' }, timeout: 600000
  });
  if (dependencies.status !== 0) throw new Error('npm ci falhou; pacote nao sera publicado.');
  const sqlite = spawnSync(process.execPath, ['-e', "require('sqlite3'); console.log('SQLite nativo carregado.')"], { cwd: path.join(output, 'app'), encoding: 'utf8', windowsHide: true });
  if (sqlite.status !== 0) throw new Error('Binario SQLite nao carregou: ' + sqlite.stderr);
  fs.writeFileSync(path.join(output, 'BUILD.json'), JSON.stringify({ version: '1.0.0-piloto', node: process.version, platform: process.platform, arch: process.arch, generatedAt: new Date().toISOString(), files: Object.fromEntries(files.map(file => [file, manifest.arquivos[file]])), nodeLicense: licenseUrl }, null, 2));
  const sums = Object.fromEntries(filesUnder(output).map(file => [file, hash(path.join(output, file))]));
  fs.writeFileSync(path.join(output, 'SHA256SUMS.json'), JSON.stringify(sums, null, 2));
  const zip = output + '.zip';
  const archive = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', "Add-Type -AssemblyName System.IO.Compression.FileSystem; [IO.Compression.ZipFile]::CreateFromDirectory($env:PATIO_BUILD, $env:PATIO_ZIP, [IO.Compression.CompressionLevel]::Optimal, $false)"], {
    env: { ...cleanEnvironment(), PATIO_BUILD: output, PATIO_ZIP: zip }, encoding: 'utf8', windowsHide: true, timeout: 600000
  });
  if (archive.status !== 0) throw new Error('Compactacao falhou: ' + archive.stderr);
  fs.writeFileSync(zip + '.sha256', `${hash(zip)}  ${path.basename(zip)}\n`);
  console.log(JSON.stringify({ output, zip, files: Object.keys(sums).length, sizeMB: +(fs.statSync(zip).size / 1024 / 1024).toFixed(2), sha256: hash(zip) }, null, 2));
  return { output, zip };
}
if (require.main === module) build(process.argv[2]).catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { allowed, build };
