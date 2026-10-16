const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

const jsDir = path.resolve(__dirname, '..', 'js');
const modulesDir = path.join(jsDir, 'modules');


test('valida sintaxe de todos os arquivos JS do frontend via new vm.Script()', () => {
  const filesToCheck = [
    'icons.js',
    'sync.js',
    'state.js',
    'patio.js',
    'estoque.js',
    'financeiro.js',
    'whatsapp.js',
    'cadastros.js',
    'relatorios.js',
    'dashboard_operacional.js',
    'app.js',
    'voz.js',
    'support-widget.js',
    'fiscal.js'
  ];

  for (const f of filesToCheck) {
    const filePath = path.join(jsDir, f);
    assert.ok(fs.existsSync(filePath), `Arquivo ${f} deve existir`);
    const code = fs.readFileSync(filePath, 'utf8');
    assert.doesNotThrow(() => {
      new vm.Script(code, { filename: f });
    }, `Erro de sintaxe no arquivo ${f}`);
  }

  const moduleFiles = fs.readdirSync(modulesDir).filter(f => f.endsWith('.js'));
  assert.ok(moduleFiles.length >= 6, 'Diretório js/modules deve conter ao menos os 6 módulos extraídos');

  for (const mf of moduleFiles) {
    const filePath = path.join(modulesDir, mf);
    const code = fs.readFileSync(filePath, 'utf8');
    assert.doesNotThrow(() => {
      new vm.Script(code, { filename: `modules/${mf}` });
    }, `Erro de sintaxe no módulo js/modules/${mf}`);
  }
});

test('index.html inclui todos os modulos na ordem correta', () => {
  const indexHtml = fs.readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf8');
  
  const expectedScripts = [
    'js/icons.js',
    'js/sync.js',
    'js/state.js',
    'js/modules/navigation.js',
    'js/modules/integrations.js',
    'js/modules/consulta_cliente.js',
    'js/patio.js',
    'js/estoque.js',
    'js/financeiro.js',
    'js/whatsapp.js',
    'js/modules/cadastros_fiscal.js',
    'js/cadastros.js',
    'js/relatorios.js',
    'js/dashboard_operacional.js',
    'js/modules/agent_config.js',
    'js/app.js',
    'js/modules/events.js',
    'js/voz.js',
    'js/support-widget.js',
    'js/fiscal.js'
  ];

  let lastIndex = -1;
  for (const script of expectedScripts) {
    const idx = indexHtml.indexOf(script);
    assert.ok(idx !== -1, `Script ${script} não encontrado no index.html`);
    assert.ok(idx > lastIndex, `Script ${script} está fora da ordem de dependência esperada`);
    lastIndex = idx;
  }
});
