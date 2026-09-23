'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');

function computeHash(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

test('P0: Guarda Pré-Voo de Implantação e Anti-Data-Loss Estrito', async (t) => {
  await t.test('1. executar_implantacao_real_piloto recusa instalação existente antes de qualquer escrita', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'patio-preflight-guard-'));
    try {
      // 1. Prepara ambiente com instalação existente
      const originalDb = path.join(tempDir, 'patio.db');
      const originalEnv = path.join(tempDir, '.env');
      const uploadsDir = path.join(tempDir, 'public', 'uploads');
      fs.mkdirSync(uploadsDir, { recursive: true });
      const originalUpload = path.join(uploadsDir, 'laudo_importante.pdf');

      fs.writeFileSync(originalDb, 'DATABASE_REAL_INTOCAVEL_' + Date.now(), 'utf8');
      fs.writeFileSync(originalEnv, 'PORT=9999\r\nMY_PRESERVED_SECRET=secret_12345\r\n', 'utf8');
      fs.writeFileSync(originalUpload, 'ANEXO_OPERACIONAL_PRESERVADO', 'utf8');

      const dbHashBefore = computeHash(originalDb);
      const envContentBefore = fs.readFileSync(originalEnv, 'utf8');
      const uploadHashBefore = computeHash(originalUpload);

      // 2. Executa o script de implantação real apontando para o diretório existente
      const scriptPath = path.join(rootDir, 'scripts', 'executar_implantacao_real_piloto.cjs');
      const res = spawnSync(process.execPath, [scriptPath], {
        cwd: rootDir,
        env: {
          ...process.env,
          DEPLOY_DIR: tempDir,
          NODE_ENV: 'production'
        },
        encoding: 'utf8'
      });

      // 3. Deve falhar com código != 0 e mensagem explícita
      assert.notEqual(res.status, 0, `O script deveria falhar com código != 0 ao detectar instalação existente. Código retornado: ${res.status}`);
      const combinedOutput = (res.stdout || '') + (res.stderr || '');
      assert.ok(
        combinedOutput.includes('INSTALACAO_JA_EXISTE') || combinedOutput.includes('Instalação existente detectada'),
        `Saída deve conter alerta de instalação existente. Obtido: ${combinedOutput}`
      );

      // 4. Preservação estrita: nenhum arquivo pode ter sido alterado ou apagado
      assert.ok(fs.existsSync(originalDb), 'patio.db deve continuar existindo');
      assert.ok(fs.existsSync(originalEnv), '.env deve continuar existindo');
      assert.ok(fs.existsSync(originalUpload), 'Uploads devem continuar existindo');

      const dbHashAfter = computeHash(originalDb);
      const envContentAfter = fs.readFileSync(originalEnv, 'utf8');
      const uploadHashAfter = computeHash(originalUpload);

      assert.equal(dbHashAfter, dbHashBefore, 'O hash de patio.db deve permanecer rigorosamente idêntico');
      assert.equal(envContentAfter, envContentBefore, 'O conteúdo do .env deve permanecer rigorosamente idêntico');
      assert.equal(uploadHashAfter, uploadHashBefore, 'O hash do anexo deve permanecer rigorosamente idêntico');
    } finally {
      try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}
    }
  });

  await t.test('2. instalar_pacote_piloto recusa destino existente contendo arquivos antes de qualquer escrita', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'patio-installer-guard-'));
    try {
      const dummyFile = path.join(tempDir, 'dados_criticos.dat');
      fs.writeFileSync(dummyFile, 'CONTEUDO_CRITICO_DO_CLIENTE', 'utf8');
      const hashBefore = computeHash(dummyFile);

      const installerScript = path.join(rootDir, 'scripts', 'instalar_pacote_piloto.cjs');
      const res = spawnSync(process.execPath, [installerScript, '--target', tempDir], {
        cwd: rootDir,
        encoding: 'utf8'
      });

      assert.notEqual(res.status, 0, 'Instalador deve falhar com código != 0 quando destino contiver arquivos');
      assert.ok(fs.existsSync(dummyFile), 'Arquivo crítico não deve ser apagado');
      assert.equal(computeHash(dummyFile), hashBefore, 'Conteúdo do arquivo não pode ser alterado');
    } finally {
      try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}
    }
  });
});
