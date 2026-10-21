'use strict';
const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const desktop = path.join(process.env.USERPROFILE, 'Desktop');

const targetServidor = path.join(rootDir, 'iniciar_servidor.bat');
const targetApp = path.join(rootDir, 'iniciar_aplicativo.bat');

// Vamos limpar qualquer atalho corrompido ou antigo do CRM na Área de Trabalho
const desktopFiles = fs.readdirSync(desktop);
for (const file of desktopFiles) {
  if ((file.includes('Patio') || file.includes('Pátio') || file.includes('PÃ¡tio')) && file.endsWith('.lnk')) {
    try {
      fs.unlinkSync(path.join(desktop, file));
      console.log('Removido atalho anterior:', file);
    } catch (_) {}
  }
}

// Criação com PowerShell usando Base64 Unicode (garante acentuação perfeita no Windows)
const psScript = `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$wsh = New-Object -ComObject WScript.Shell

$s1 = $wsh.CreateShortcut("${path.join(desktop, 'Pátio CRM - Iniciar Servidor.lnk').replace(/\\/g, '\\\\')}")
$s1.TargetPath = "${targetServidor.replace(/\\/g, '\\\\')}"
$s1.WorkingDirectory = "${rootDir.replace(/\\/g, '\\\\')}"
$s1.Description = "Iniciar Servidor Backend do Pátio CRM"
$s1.IconLocation = "$env:SystemRoot\\System32\\shell32.dll,13"
$s1.Save()

$s2 = $wsh.CreateShortcut("${path.join(desktop, 'Pátio CRM - Iniciar Aplicativo.lnk').replace(/\\/g, '\\\\')}")
$s2.TargetPath = "${targetApp.replace(/\\/g, '\\\\')}"
$s2.WorkingDirectory = "${rootDir.replace(/\\/g, '\\\\')}"
$s2.Description = "Abrir Aplicativo Pátio CRM no Navegador"
$s2.IconLocation = "$env:SystemRoot\\System32\\shell32.dll,220"
$s2.Save()

Write-Output "OK"
`;

const encoded = Buffer.from(psScript, 'utf16le').toString('base64');
const res = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded], {
  encoding: 'utf8'
});

console.log('Resultado PowerShell:', res.stdout ? res.stdout.trim() : res.stderr);

const s1Exists = fs.existsSync(path.join(desktop, 'Pátio CRM - Iniciar Servidor.lnk'));
const s2Exists = fs.existsSync(path.join(desktop, 'Pátio CRM - Iniciar Aplicativo.lnk'));

console.log('Pátio CRM - Iniciar Servidor.lnk criado:', s1Exists);
console.log('Pátio CRM - Iniciar Aplicativo.lnk criado:', s2Exists);
