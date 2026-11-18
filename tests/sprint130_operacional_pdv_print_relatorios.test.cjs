/**
 * Suíte de Testes TDD — Sprint 13.0: Master Patch de Funcionalidades Operacionais
 * (Almoxarifado, PDV Focus & Autocomplete, Markup, Impressão Isolada, Relatórios Pátio, Feedback CNPJ & Contas Caixa)
 * Arquitetura Modular (< 350 linhas).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('Sprint 13.0 — Pilar 1: Redesign Premium da Barra Lateral (Sidebar Industrial Tech)', async (t) => {
  const baseLayoutCss = fs.readFileSync(path.join(__dirname, '../css/base-layout.css'), 'utf8');
  const enterpriseNavCss = fs.readFileSync(path.join(__dirname, '../css/enterprise-nav.css'), 'utf8');

  await t.test('1. Gradiente e borda direita da sidebar (#nav)', () => {
    assert.ok(
      baseLayoutCss.includes('070b14') || baseLayoutCss.includes('#070B14') || enterpriseNavCss.includes('070b14') || enterpriseNavCss.includes('#070B14'),
      'Sidebar deve conter fundo gradiente Industrial Tech iniciando em #070B14'
    );
    assert.ok(
      baseLayoutCss.includes('rgba(59, 130, 246, 0.18)') || enterpriseNavCss.includes('rgba(59, 130, 246, 0.18)'),
      'Sidebar deve ter borda direita iluminada rgba(59, 130, 246, 0.18)'
    );
  });

  await t.test('2. Transições fluidas, hover com deslocamento e item ativo com barra iluminada', () => {
    const combined = baseLayoutCss + '\n' + enterpriseNavCss;
    assert.ok(combined.includes('translateX(4px)'), 'Item da sidebar deve ter deslocamento translateX(4px) no hover');
    assert.ok(combined.includes('#3B82F6') || combined.includes('#3b82f6'), 'Item ativo deve conter indicador azul #3B82F6');
    assert.ok(combined.includes('rgba(59, 130, 246, 0.6)'), 'Item ativo deve conter box-shadow brilhante rgba(59, 130, 246, 0.6)');
  });
});

test('Sprint 13.0 — Pilar 2: Correções Operacionais do Almoxarifado e Compras', async (t) => {
  const estoqueUiCode = fs.readFileSync(path.join(__dirname, '../js/modules/estoque_catalogo_ui.js'), 'utf8');
  const comprasCode = fs.readFileSync(path.join(__dirname, '../js/compras.js'), 'utf8');

  await t.test('3. Almoxarifado: Botões + Novo Item / Peça e + Nova Nota de Entrada', () => {
    assert.ok(
      estoqueUiCode.includes('folhaNovaPeca') && estoqueUiCode.includes('abrirFolha'),
      'Botão de novo item no almoxarifado deve invocar abrirFolha(folhaNovaPeca)'
    );
    assert.ok(
      estoqueUiCode.includes('folhaXML') && estoqueUiCode.includes('abrirFolha'),
      'Botão de nova nota no almoxarifado deve invocar abrirFolha(folhaXML)'
    );
  });

  await t.test('4. Compras: Botão + Nova Nota de Entrada aciona modal de compra', () => {
    assert.ok(
      comprasCode.includes('abrirModalNovaCompra'),
      'Tela de compras deve acionar abrirModalNovaCompra'
    );
  });
});

test('Sprint 13.0 — Pilar 2: Nova Venda (PDV) — Não-destruição de Foco & Busca Dupla', async (t) => {
  const pdvCode = fs.readFileSync(path.join(__dirname, '../js/modules/vendas_pdv_form.js'), 'utf8');

  await t.test('5. Atualização de totais sem re-renderizar innerHTML nos inputs (Preservação de Foco)', () => {
    assert.ok(
      pdvCode.includes('atualizarTotaisVendaNoDOM') || pdvCode.includes('recalcularTotaisVenda'),
      'Deve possuir função de recálculo dinâmico de totais sem destruir o DOM'
    );
    // Verifica que oninput não faz chamada cega a renderFolha() nos inputs de quantidade e valor
    const inputQtdMatch = pdvCode.match(/data-act="venda-item-qtd"[^>]*oninput="([^"]*)"/);
    if (inputQtdMatch) {
      assert.ok(!inputQtdMatch[1].includes('renderFolha()'), 'oninput de quantidade não deve invocar renderFolha()');
    }
  });

  await t.test('6. Busca Dupla por Código SKU e Descrição com Autocomplete Ativo', () => {
    assert.ok(
      pdvCode.includes('buscarPecaPorCodigo') || pdvCode.includes('sku') || pdvCode.includes('filtrarAutocompletePecas'),
      'Deve disponibilizar busca rápida por código/SKU e autocomplete na descrição'
    );
  });
});

test('Sprint 13.0 — Pilar 2: Regra de Negócio: Markup Padrão & Proteção de Margem Mínima', async (t) => {
  const configTabsCode = fs.readFileSync(path.join(__dirname, '../js/modules/agent_config_tabs.js'), 'utf8');
  const comprasModalCode = fs.readFileSync(path.join(__dirname, '../js/modules/compras_nova_modal.js'), 'utf8');
  const pdvCode = fs.readFileSync(path.join(__dirname, '../js/modules/vendas_pdv_form.js'), 'utf8');

  await t.test('7. Markup Padrão da Empresa em Configurações Gerais', () => {
    assert.ok(
      configTabsCode.includes('markupPadrao') || configTabsCode.includes('cfg_markup_padrao'),
      'Aba Geral de Configurações deve possuir campo de Markup Padrão (%)'
    );
  });

  await t.test('8. Entrada de Nota com Markup de Majoração e sugestão de preço de venda', () => {
    assert.ok(
      comprasModalCode.includes('markup') || comprasModalCode.includes('Markup'),
      'Modal de Nova Compra/Entrada deve prever cálculo de markup e preço de venda'
    );
  });

  await t.test('9. Proteção de margem na Nova Venda bloqueando venda abaixo do custo + markup mínimo', () => {
    assert.ok(
      pdvCode.includes('validarPrecoMinimo') || pdvCode.includes('precoMinimo') || pdvCode.includes('bloquearAbaixoCusto'),
      'Deve validar e proteger contra venda abaixo do preço mínimo configurado'
    );
  });
});

test('Sprint 13.0 — Pilar 2: Isolamento Total de Impressão (@media print)', async (t) => {
  const componentsCss = fs.readFileSync(path.join(__dirname, '../css/components.css'), 'utf8');
  const baseLayoutCss = fs.readFileSync(path.join(__dirname, '../css/base-layout.css'), 'utf8');
  const combinedCss = componentsCss + '\n' + baseLayoutCss;

  await t.test('10. Ocultação estrita de sidebar (#nav), topbar, widgets e botões na impressão', () => {
    assert.ok(combinedCss.includes('@media print'), 'Deve conter bloco @media print');
    assert.ok(combinedCss.includes('#nav') && combinedCss.includes('display: none !important'), 'Deve ocultar #nav na impressão');
    assert.ok(combinedCss.includes('.topbar-enterprise') || combinedCss.includes('.topo') || combinedCss.includes('#topbar'), 'Deve ocultar topbar na impressão');
  });
});

test('Sprint 13.0 — Pilar 2: Relatórios do Pátio com Dados Reais', async (t) => {
  const relatoriosViewsCode = fs.readFileSync(path.join(__dirname, '../js/modules/relatorios_conteudo_views.js'), 'utf8');
  const indexHtml = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');

  await t.test('11. Relatórios operacionais do pátio integrados e registrados no index.html', () => {
    assert.ok(
      relatoriosViewsCode.includes('os_periodo') || relatoriosViewsCode.includes('renderRelatorioPatio'),
      'Deve suportar renderização de relatórios do pátio'
    );
    assert.ok(
      indexHtml.includes('relatorios_patio_views.js') || relatoriosViewsCode.includes('produtividade_mecanicos'),
      'Deve ter módulo ou handler de relatórios do pátio ativo'
    );
  });
});

test('Sprint 13.0 — Pilar 2: Feedback Explícito na Consulta de CNPJ e Cadastro de Contas Caixa', async (t) => {
  const consultaCliCode = fs.readFileSync(path.join(__dirname, '../js/modules/consulta_cliente.js'), 'utf8');
  const configTabsCode = fs.readFileSync(path.join(__dirname, '../js/modules/agent_config_tabs.js'), 'utf8');

  await t.test('12. Feedback explícito e orientativo quando chaves de API não configuradas na consulta CNPJ', () => {
    assert.ok(
      consultaCliCode.includes('Chave de API') || consultaCliCode.includes('Configurações > Integrações') || consultaCliCode.includes('INTEGRACAO_NAO_CONFIGURADA'),
      'Deve exibir mensagem orientativa clara se APIs de consulta não estiverem configuradas'
    );
  });

  await t.test('13. Ativação do botão + Nova Conta Caixa na aba de Contas Caixa', () => {
    assert.ok(
      configTabsCode.includes('abrirModalNovaContaCaixa') || configTabsCode.includes('nova-conta-caixa'),
      'Botão de Nova Conta Caixa deve acionar modal funcional de cadastro'
    );
  });
});
