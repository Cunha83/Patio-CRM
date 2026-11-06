'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const MAX_LINES = 350;
const rootDir = path.resolve(__dirname, '..');

function countLines(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  // Normaliza quebras de linha CRLF/LF
  return content.split(/\r?\n/).length;
}

function getFilesRecursively(dir, extension = '.js') {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...getFilesRecursively(fullPath, extension));
    } else if (entry.name.endsWith(extension)) {
      files.push(fullPath);
    }
  }
  return files;
}

test('Quality Gate de Tamanho Modular de Arquivo (Teto <= 350 Linhas)', async (t) => {
  await t.test('1. Módulos e fachada do WhatsApp (services/whatsapp/ e handlers)', () => {
    const facadePath = path.join(rootDir, 'services', 'whatsapp', 'whatsappHandlers.js');
    assert.ok(fs.existsSync(facadePath), 'Fachada whatsappHandlers.js deve existir');
    const facadeLines = countLines(facadePath);
    assert.ok(
      facadeLines <= MAX_LINES,
      `Fachada whatsappHandlers.js tem ${facadeLines} linhas, excedendo o teto de ${MAX_LINES}`
    );

    const handlersDir = path.join(rootDir, 'services', 'whatsapp', 'handlers');
    const handlerFiles = getFilesRecursively(handlersDir, '.js');
    assert.ok(handlerFiles.length >= 10, 'Deve conter os submódulos de handlers do WhatsApp');

    for (const file of handlerFiles) {
      const rel = path.relative(rootDir, file);
      const lines = countLines(file);
      assert.ok(
        lines <= MAX_LINES,
        `Submódulo ${rel} tem ${lines} linhas, excedendo o teto de ${MAX_LINES}`
      );
    }
  });

  await t.test('2. Módulos e fachada do Financeiro Backend (services/financial/ e financialAnalystService.js)', () => {
    const facadePath = path.join(rootDir, 'services', 'financialAnalystService.js');
    assert.ok(fs.existsSync(facadePath), 'Fachada financialAnalystService.js deve existir');
    const facadeLines = countLines(facadePath);
    assert.ok(
      facadeLines <= MAX_LINES,
      `Fachada financialAnalystService.js tem ${facadeLines} linhas, excedendo o teto de ${MAX_LINES}`
    );

    const financialDir = path.join(rootDir, 'services', 'financial');
    const financialFiles = getFilesRecursively(financialDir, '.js');
    assert.ok(financialFiles.length >= 15, 'Deve conter os submódulos de serviços financeiros');

    for (const file of financialFiles) {
      const rel = path.relative(rootDir, file);
      const lines = countLines(file);
      assert.ok(
        lines <= MAX_LINES,
        `Submódulo ${rel} tem ${lines} linhas, excedendo o teto de ${MAX_LINES}`
      );
    }
  });

  await t.test('3. Módulos e fachada do Voice Action Engine (services/voice/ e voiceActionEngine.js)', () => {
    const facadePath = path.join(rootDir, 'services', 'voiceActionEngine.js');
    assert.ok(fs.existsSync(facadePath), 'Fachada voiceActionEngine.js deve existir');
    const facadeLines = countLines(facadePath);
    assert.ok(
      facadeLines <= MAX_LINES,
      `Fachada voiceActionEngine.js tem ${facadeLines} linhas, excedendo o teto de ${MAX_LINES}`
    );

    const voiceDir = path.join(rootDir, 'services', 'voice');
    const voiceFiles = getFilesRecursively(voiceDir, '.js');
    assert.ok(voiceFiles.length >= 15, 'Deve conter os submódulos de voz');

    for (const file of voiceFiles) {
      const rel = path.relative(rootDir, file);
      const lines = countLines(file);
      assert.ok(
        lines <= MAX_LINES,
        `Submódulo ${rel} tem ${lines} linhas, excedendo o teto de ${MAX_LINES}`
      );
    }
  });

  await t.test('4. Módulos e fachada do Financeiro Frontend (js/financeiro.js, js/modules/financeiro_*.js e analista_*.js)', () => {
    const facadePath = path.join(rootDir, 'js', 'financeiro.js');
    assert.ok(fs.existsSync(facadePath), 'Fachada js/financeiro.js deve existir');
    const facadeLines = countLines(facadePath);
    assert.ok(
      facadeLines <= MAX_LINES,
      `Fachada js/financeiro.js tem ${facadeLines} linhas, excedendo o teto de ${MAX_LINES}`
    );

    const modulesDir = path.join(rootDir, 'js', 'modules');
    const finModuleFiles = fs.readdirSync(modulesDir)
      .filter(f => (f.startsWith('financeiro_') || f.startsWith('analista_')) && f.endsWith('.js'))
      .map(f => path.join(modulesDir, f));

    assert.ok(finModuleFiles.length >= 15, 'Deve conter ao menos 15 submódulos frontend do financeiro e analista');

    for (const file of finModuleFiles) {
      const rel = path.relative(rootDir, file);
      const lines = countLines(file);
      assert.ok(
        lines <= MAX_LINES,
        `Submódulo ${rel} tem ${lines} linhas, excedendo o teto de ${MAX_LINES}`
      );
    }
  });

  await t.test('5. Folhas de estilo modulares e agregador mestre (style.css e css/*.css)', () => {
    const aggregatorPath = path.join(rootDir, 'style.css');
    assert.ok(fs.existsSync(aggregatorPath), 'Agregador style.css deve existir');
    const aggregatorLines = countLines(aggregatorPath);
    assert.ok(
      aggregatorLines <= MAX_LINES,
      `Agregador style.css tem ${aggregatorLines} linhas, excedendo o teto de ${MAX_LINES}`
    );

    const cssDir = path.join(rootDir, 'css');
    const cssFiles = getFilesRecursively(cssDir, '.css');
    assert.ok(cssFiles.length >= 8, 'Deve conter ao menos 8 folhas de estilo modulares em css/');

    for (const file of cssFiles) {
      const rel = path.relative(rootDir, file);
      const lines = countLines(file);
      assert.ok(
        lines <= MAX_LINES,
        `Folha de estilo ${rel} tem ${lines} linhas, excedendo o teto de ${MAX_LINES}`
      );
    }
  });

  await t.test('6. Módulos e fachada de Cadastros e Central Fiscal (cadastros_fiscal*.js, plano_contas*.js)', () => {
    const modulesDir = path.join(rootDir, 'js', 'modules');
    const fiscalFiles = [
      'cadastros_fiscal.js',
      'cadastros_fiscal_regras.js',
      'cadastros_fiscal_nfe.js',
      'cadastros_config_integracoes.js',
      'cadastros_plano_contas.js',
      'cadastros_plano_contas_actions.js'
    ].map(f => path.join(modulesDir, f));

    for (const file of fiscalFiles) {
      assert.ok(fs.existsSync(file), `Módulo fiscal ${path.basename(file)} deve existir`);
      const lines = countLines(file);
      assert.ok(
        lines <= MAX_LINES,
        `Módulo fiscal ${path.basename(file)} tem ${lines} linhas, excedendo o teto de ${MAX_LINES}`
      );
    }
  });

  await t.test('7. Roteador DOM de eventos e submódulos de domínio (events.js e events_*.js)', () => {
    const modulesDir = path.join(rootDir, 'js', 'modules');
    const eventFiles = [
      'events.js',
      'events_patio_os.js',
      'events_patio_boxes.js',
      'events_estoque_compras.js',
      'events_financeiro_caixa.js',
      'events_whatsapp_voz.js',
      'events_cadastros.js',
      'events_sistema_config.js'
    ].map(f => path.join(modulesDir, f));

    for (const file of eventFiles) {
      assert.ok(fs.existsSync(file), `Módulo de evento ${path.basename(file)} deve existir`);
      const lines = countLines(file);
      assert.ok(
        lines <= MAX_LINES,
        `Módulo de evento ${path.basename(file)} tem ${lines} linhas, excedendo o teto de ${MAX_LINES}`
      );
    }
  });

  await t.test('8. Módulos e fachada de Estoque e Almoxarifado (estoque.js e estoque_*.js)', () => {
    const estoqueFiles = [
      path.join(rootDir, 'js', 'estoque.js'),
      path.join(rootDir, 'js', 'modules', 'estoque_catalogo_ui.js'),
      path.join(rootDir, 'js', 'modules', 'estoque_movimentacoes.js'),
      path.join(rootDir, 'js', 'modules', 'estoque_ocr_notas.js')
    ];

    for (const file of estoqueFiles) {
      assert.ok(fs.existsSync(file), `Arquivo de estoque ${path.basename(file)} deve existir`);
      const lines = countLines(file);
      assert.ok(
        lines <= MAX_LINES,
        `Arquivo ${path.basename(file)} tem ${lines} linhas, excedendo o teto de ${MAX_LINES}`
      );
    }
  });

  await t.test('9. Módulos e fachada de Vendas e PDV Balcão (vendas.js e vendas_*.js)', () => {
    const vendasFiles = [
      path.join(rootDir, 'js', 'vendas.js'),
      path.join(rootDir, 'js', 'modules', 'vendas_pdv_form.js'),
      path.join(rootDir, 'js', 'modules', 'vendas_lote_acoes.js')
    ];

    for (const file of vendasFiles) {
      assert.ok(fs.existsSync(file), `Arquivo de vendas ${path.basename(file)} deve existir`);
      const lines = countLines(file);
      assert.ok(
        lines <= MAX_LINES,
        `Arquivo ${path.basename(file)} tem ${lines} linhas, excedendo o teto de ${MAX_LINES}`
      );
    }
  });

  await t.test('10. Módulos e controller principal SPA (app.js e app_*.js)', () => {
    const appFiles = [
      path.join(rootDir, 'js', 'app.js'),
      path.join(rootDir, 'js', 'modules', 'app_modals_sheets.js'),
      path.join(rootDir, 'js', 'modules', 'app_sync_auth.js'),
      path.join(rootDir, 'js', 'modules', 'app_onboarding_tour.js')
    ];

    for (const file of appFiles) {
      assert.ok(fs.existsSync(file), `Arquivo do controller ${path.basename(file)} deve existir`);
      const lines = countLines(file);
      assert.ok(
        lines <= MAX_LINES,
        `Arquivo ${path.basename(file)} tem ${lines} linhas, excedendo o teto de ${MAX_LINES}`
      );
    }
  });
});

