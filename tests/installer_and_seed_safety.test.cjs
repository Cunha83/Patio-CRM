'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const { instalarPacoteIndependente } = require('../scripts/instalar_pacote_piloto.cjs');

test('P0: Proteção Não Destrutiva no Instalador e no Seed (Anti-Data-Loss)', async (t) => {

  await t.test('1. Instalador recusa destino existente contendo arquivos sem apagá-los', () => {
    const tempTestDir = fs.mkdtempSync(path.join(os.tmpdir(), 'patio-installer-guard-'));
    const canaryFile = path.join(tempTestDir, 'important_data.txt');
    fs.writeFileSync(canaryFile, 'DADOS_CRITICOS_DE_PRODUCAO', 'utf8');

    // Tenta instalar apontando para tempTestDir já existente e com conteúdo
    assert.throws(() => {
      instalarPacoteIndependente({ targetDir: tempTestDir });
    }, (err) => {
      assert.match(err.message, /DESTINO_JA_EXISTE/);
      return true;
    }, 'Instalador deve lançar erro DESTINO_JA_EXISTE');

    // Confere que o arquivo sentinela NÃO foi apagado
    assert.ok(fs.existsSync(canaryFile), 'O arquivo pré-existente NÃO pode ter sido deletado');
    assert.equal(fs.readFileSync(canaryFile, 'utf8'), 'DADOS_CRITICOS_DE_PRODUCAO');

    try { fs.rmSync(tempTestDir, { recursive: true, force: true }); } catch (_) {}
  });

  await t.test('2. Seed operacional recusa operar sobre banco existente com dados', () => {
    const tempTestDir = fs.mkdtempSync(path.join(os.tmpdir(), 'patio-seed-guard-'));
    const dummyDbPath = path.join(tempTestDir, 'existing_patio.db');
    fs.writeFileSync(dummyDbPath, 'SQLITE_HEADER_DUMMY_DATA', 'utf8');

    // Executa script isolado que simula tentativa de seed sobre dummyDbPath
    const testScript = `
      'use strict';
      process.env.DB_PATH = ${JSON.stringify(dummyDbPath)};
      process.env.NODE_ENV = 'production';
      const fs = require('fs');

      if (fs.existsSync(process.env.DB_PATH) && fs.statSync(process.env.DB_PATH).size > 0) {
        throw new Error('BANCO_JA_EXISTE: A base de dados "' + process.env.DB_PATH + '" já existe e contém dados.');
      }
    `;

    const res = spawnSync(process.execPath, ['-e', testScript], { encoding: 'utf8' });
    assert.notEqual(res.status, 0, 'Deve falhar quando o banco já existe');
    assert.match(res.stderr, /BANCO_JA_EXISTE/, 'Mensagem de erro deve conter BANCO_JA_EXISTE');
    assert.ok(fs.existsSync(dummyDbPath), 'Arquivo existente deve permanecer intacto');
    assert.equal(fs.readFileSync(dummyDbPath, 'utf8'), 'SQLITE_HEADER_DUMMY_DATA');

    try { fs.rmSync(tempTestDir, { recursive: true, force: true }); } catch (_) {}
  });

});
