'use strict';

/**
 * tests/sprint101_release_v200_modular_headroom.test.cjs
 *
 * Suíte de Testes da Sprint 10.1 (Release v2.0.0 Enterprise):
 * 1. Gate Estrito de Folga Modular: Todos os 7 arquivos críticos e seus novos submódulos <= 285 linhas.
 * 2. Preservação 100% de Contratos Públicos (Fachada / Re-export Backend).
 * 3. Preservação 100% de Contratos Públicos no Window / GlobalThis (Frontend).
 * 4. Metadados e Consistência da Release v2.0.0 Enterprise.
 *
 * Teto Modular: <= 350 linhas
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const rootDir = path.resolve(__dirname, '..');

// Lista dos 7 arquivos críticos que devem ficar <= 285 linhas
const ARQUIVOS_ALVO_HEADROOM = [
  'services/executive/controlTowerService.js',
  'routes/crm_manutencao_oportunidades.routes.js',
  'services/billing/fleetBorderoService.js',
  'js/modules/orcamento_parcial_ui.js',
  'js/modules/crm_conversao_oportunidades_ui.js',
  'js/modules/events_patio_os.js',
  'services/fiscal/b2bFiscalClosingService.js'
];

// Submódulos extraídos que também devem respeitar o limite <= 285 linhas
const SUBMODULOS_EXTRAIDOS = [
  'services/executive/controlTowerAlertsHelper.js',
  'routes/crm_oportunidades_conversao.routes.js',
  'services/billing/fleetBorderoGroupingHelper.js',
  'js/modules/orcamento_parcial_actions.js',
  'js/modules/crm_conversao_oportunidades_actions.js',
  'js/modules/events_patio_os_crm_delegate.js',
  'services/fiscal/b2bFiscalAccountingExportHelper.js'
];

function contarLinhas(relPath) {
  const fullPath = path.join(rootDir, relPath);
  if (!fs.existsSync(fullPath)) return -1;
  const content = fs.readFileSync(fullPath, 'utf8');
  return content.split(/\r?\n/).length;
}

test('Sprint 10.1 — Certificação Arquitetural e Folga Modular v2.0.0', async (t) => {

  await t.test('1. Gate Estrito de Folga Modular (<= 285 Linhas nos 7 Arquivos e Submódulos)', () => {
    const erros = [];

    for (const relPath of ARQUIVOS_ALVO_HEADROOM) {
      const linhas = contarLinhas(relPath);
      assert.ok(linhas > 0, `Arquivo ${relPath} deve existir.`);
      if (linhas > 285) {
        erros.push(`[ALVO CRÍTICO] ${relPath} tem ${linhas} linhas (limite estrito: <= 285)`);
      }
    }

    for (const relPath of SUBMODULOS_EXTRAIDOS) {
      const linhas = contarLinhas(relPath);
      if (linhas === -1) {
        erros.push(`[NOVO SUBMÓDULO] ${relPath} ainda não foi criado.`);
      } else if (linhas > 285) {
        erros.push(`[NOVO SUBMÓDULO] ${relPath} tem ${linhas} linhas (limite estrito: <= 285)`);
      }
    }

    assert.strictEqual(erros.length, 0, `Arquivos fora do limite de folga modular v2.0.0:\n${erros.join('\n')}`);
  });

  await t.test('2. Preservação de Contratos Públicos no Backend (Re-export / Fachada)', () => {
    // 2.1 Torre de Controle
    const controlTowerService = require('../services/executive/controlTowerService');
    assert.strictEqual(typeof controlTowerService.gerarFilaAlertasCriticosComando, 'function');
    assert.strictEqual(typeof controlTowerService.consolidarTorreControleExecutiva360, 'function');
    assert.strictEqual(typeof controlTowerService.dispararBriefingDiarioDiretoriaWhatsApp, 'function');

    // 2.2 Borderô Frotista
    const fleetBorderoService = require('../services/billing/fleetBorderoService');
    assert.strictEqual(typeof fleetBorderoService.listarOSFaturaveisPorCliente, 'function');
    assert.strictEqual(typeof fleetBorderoService.simularPreviaBordero, 'function');
    assert.strictEqual(typeof fleetBorderoService.fecharBordero, 'function');
    assert.strictEqual(typeof fleetBorderoService.cancelarBordero, 'function');
    assert.strictEqual(typeof fleetBorderoService.formatarNotificacaoWhatsAppBordero, 'function');

    // 2.3 Fechamento Fiscal B2B
    const b2bFiscalClosingService = require('../services/fiscal/b2bFiscalClosingService');
    assert.strictEqual(typeof b2bFiscalClosingService.configurarPerfilTributarioOficina, 'function');
    assert.strictEqual(typeof b2bFiscalClosingService.gerarEspelhoFiscalOSOuBordero, 'function');
    assert.strictEqual(typeof b2bFiscalClosingService.emitirLoteNotasFiscaisB2B, 'function');
    assert.strictEqual(typeof b2bFiscalClosingService.exportarLoteContabilFiscal, 'function');
  });

  await t.test('3. Preservação de Contratos Públicos no Frontend (Window / GlobalThis)', () => {
    // Carrega módulos no escopo global
    require('../js/modules/orcamento_parcial_ui');
    if (fs.existsSync(path.join(rootDir, 'js/modules/orcamento_parcial_actions.js'))) {
      require('../js/modules/orcamento_parcial_actions');
    }
    require('../js/modules/crm_conversao_oportunidades_ui');
    if (fs.existsSync(path.join(rootDir, 'js/modules/crm_conversao_oportunidades_actions.js'))) {
      require('../js/modules/crm_conversao_oportunidades_actions');
    }
    if (fs.existsSync(path.join(rootDir, 'js/modules/events_patio_os_crm_delegate.js'))) {
      require('../js/modules/events_patio_os_crm_delegate');
    }
    require('../js/modules/events_patio_os');

    // 3.1 Orçamento Parcial
    assert.strictEqual(typeof globalThis.renderBadgeStatusItemHtml, 'function');
    assert.strictEqual(typeof globalThis.modalAprovacaoParcialHtml, 'function');
    assert.strictEqual(typeof globalThis.abrirModalAprovacaoParcial, 'function');
    assert.strictEqual(typeof globalThis.confirmarAprovacaoParcial, 'function');

    // 3.2 CRM Conversão de Oportunidades
    assert.strictEqual(typeof globalThis.renderFilaFollowUpHtml, 'function');
    assert.strictEqual(typeof globalThis.modalConverterOportunidadeHtml, 'function');
    assert.strictEqual(typeof globalThis.abrirModalConverterOportunidade, 'function');
    assert.strictEqual(typeof globalThis.confirmarConversaoOportunidade, 'function');
    assert.strictEqual(typeof globalThis.abrirModalRegistrarFollowUp, 'function');
    assert.strictEqual(typeof globalThis.confirmarRegistroFollowUp, 'function');

    // 3.3 Eventos de Pátio e OS
    assert.strictEqual(typeof globalThis.tratarEventosPatioOS, 'function');
    assert.strictEqual(typeof globalThis.tratarChangePatioOS, 'function');
    assert.strictEqual(typeof globalThis.textoOrcamento, 'function');
  });

  await t.test('4. Metadados e Consistência da Release v2.0.0 Enterprise', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
    assert.strictEqual(pkg.version, '2.0.0', 'package.json deve registrar versão 2.0.0 da Release Enterprise.');

    const crmRouter = require('../routes/crm_manutencao_oportunidades.routes');
    assert.ok(crmRouter, 'Router de manutenção e oportunidades deve ser exportado.');
  });
});

