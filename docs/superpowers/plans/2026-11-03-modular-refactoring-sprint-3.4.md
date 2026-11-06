# Modular Refactoring Sprint 3.4 Implementation Plan: estoque.js, vendas.js e app.js

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Decompor `js/estoque.js` (889 linhas), `js/vendas.js` (752 linhas) e `js/app.js` (863 linhas) em submódulos coesos em `js/modules/` sob o teto estrito de $\le 350$ linhas cada, preservando 100% dos contratos públicos no `window`/`globalThis`, expandindo o Quality Gate e regenerando o manifesto de release.

**Architecture:** Adoção do padrão Fachada/Orquestrador (Zero Quebra de Contratos). Os arquivos principais (`js/estoque.js`, `js/vendas.js`, `js/app.js`) reduzem seu escopo para fachadas/roteadores leves (< 200 linhas) que orquestram a chamada e sincronização dos submódulos em `js/modules/`. Todos os submódulos exportam suas funções no escopo global para garantir compatibilidade com `window` no navegador e `globalThis` em sandboxes VM de testes Node.js.

**Tech Stack:** JavaScript (ES6+ modular SPA nativo sem bundler), Node.js Test Runner (`node:test`, `node:assert/strict`, `node:vm`), HTML5, CSS3.

**Spec:** Instruções da Sprint 3.4 fornecidas pelo usuário e convenções do repositório em `AGENTS.md`.

## Global Constraints
- Teto estrito de tamanho: $\le 350$ linhas em todos os módulos e fachadas.
- Preservação estrita de contratos públicos e binds: todas as funções existentes continuam no escopo global (`window` e `globalThis`).
- Isolamento total de banco: nenhuma suíte de teste pode escrever em `data/database.json`.
- Integridade do manifesto criptográfico: SHA-256 de todos os arquivos rastreados em `docs/operacao/manifesto_release.json`.
- Ordem estrita de carregamento em `index.html`: submódulos carregados imediatamente antes de suas respectivas fachadas.

## Review Focus
- Testes Node VM sem navegador: garantir que funções que dependem de variáveis globais (`S`, `esc`, `brl`, `ico`, `hoje`) não falhem se o ambiente for carregado via `vm.runInContext`.
- Handlers inline do DOM: garantir que `data-act` e atributos `onclick`/`onchange` continuem encontrando as funções globais.
- Integridade de `index.html`: a lista de `<script>` em `index.html` deve manter a ordem exata exigida por `tests/frontend_modules_syntax.test.cjs`.
- Imutabilidade do banco: garantir que `git status --porcelain data/database.json` permaneça vazio.

---

### Task 1: Decomposição de `js/estoque.js` (~889 linhas)
**Files:**
- Create: `js/modules/estoque_catalogo_ui.js`
- Create: `js/modules/estoque_movimentacoes.js`
- Create: `js/modules/estoque_ocr_notas.js`
- Modify: `js/estoque.js`
- Modify: `index.html`
- Verify: `tests/frontend_modules_syntax.test.cjs`, `tests/ui_actions_and_bindings_audit.test.cjs`

Steps:
- [x] 1.1 Extrair `calcularSaldosPeca` e `viewEstoque` para `js/modules/estoque_catalogo_ui.js` ($\le 350$ linhas).
- [x] 1.2 Extrair `abrirModalAjusteEstoque`, `viewNecessidadesCompra`, `viewCotacoesCompra`, `viewPedidosCompra`, `folhaPeca` e `folhaNovaPeca` para `js/modules/estoque_movimentacoes.js` ($\le 350$ linhas).
- [x] 1.3 Extrair `folhaXML`, `lerXML`, `confirmarXML` e `folhaSimulacaoOCR` para `js/modules/estoque_ocr_notas.js` ($\le 350$ linhas).
- [x] 1.4 Reduzir `js/estoque.js` para fachada/orquestrador (< 150 linhas) com garantia de re-exportação para `window` e `globalThis`.
- [x] 1.5 Inserir `<script src="js/modules/estoque_catalogo_ui.js"></script>`, `<script src="js/modules/estoque_movimentacoes.js"></script>` e `<script src="js/modules/estoque_ocr_notas.js"></script>` em `index.html` antes de `js/estoque.js`.
- [x] 1.6 Atualizar `tests/frontend_modules_syntax.test.cjs` com a nova ordem de scripts e validar sintaxe.
- [x] 1.7 Verificar contagem de linhas ($\le 350$) e testes unitários.

---

### Task 2: Decomposição de `js/vendas.js` (~752 linhas)
**Files:**
- Create: `js/modules/vendas_pdv_form.js`
- Create: `js/modules/vendas_lote_acoes.js`
- Modify: `js/vendas.js`
- Modify: `index.html`
- Verify: `tests/frontend_modules_syntax.test.cjs`, `tests/ui_actions_and_bindings_audit.test.cjs`

Steps:
- [x] 2.1 Extrair `abrirModalNovaVenda`, `folhaNovaVenda`, `adicionarItemRascVenda`, `atualizarItemRascVenda` e `salvarNovaVendaConfirmada` para `js/modules/vendas_pdv_form.js` ($\le 350$ linhas).
- [x] 2.2 Extrair `abrirDetalhesVenda`, `excluirVenda`, `faturarVendaEmEspera`, `enviarVendaWhatsApp` e `acaoEmLoteVendas` para `js/modules/vendas_lote_acoes.js` ($\le 350$ linhas).
- [x] 2.3 Manter `viewVendas` e a fachada orquestradora em `js/vendas.js` (< 250 linhas, $\le 350$ linhas) com re-exportação para `window` e `globalThis`.
- [x] 2.4 Inserir `<script src="js/modules/vendas_pdv_form.js"></script>` e `<script src="js/modules/vendas_lote_acoes.js"></script>` em `index.html` antes de `js/vendas.js`.
- [x] 2.5 Atualizar `tests/frontend_modules_syntax.test.cjs` com a nova ordem e validar sintaxe.
- [x] 2.6 Verificar contagem de linhas ($\le 350$) e testes unitários.

---

### Task 3: Decomposição de `js/app.js` (~863 linhas)
**Files:**
- Create: `js/modules/app_modals_sheets.js`
- Create: `js/modules/app_sync_auth.js`
- Create: `js/modules/app_onboarding_tour.js`
- Modify: `js/app.js`
- Modify: `index.html`
- Verify: `tests/frontend_modules_syntax.test.cjs`, `tests/ui_actions_and_bindings_audit.test.cjs`

Steps:
- [x] 3.1 Extrair `abrirFolha`, `renderFolha`, `fecharFolha`, `abrirModalGenerico`, `fecharModalGenerico` para `js/modules/app_modals_sheets.js` ($\le 350$ linhas).
- [x] 3.2 Extrair rotinas de checagem de versão, polling e verificação de autenticação de sessão para `js/modules/app_sync_auth.js` ($\le 350$ linhas).
- [x] 3.3 Extrair `viewConfiguracoes` e helpers de identidade visual e onboarding para `js/modules/app_onboarding_tour.js` ($\le 350$ linhas).
- [x] 3.4 Manter `render`, `viewPainelInicial`, `blocoTitulosPainel`, `renderGraficosPainel` e `boot` em `js/app.js` (< 280 linhas, $\le 350$ linhas).
- [x] 3.5 Inserir `<script src="js/modules/app_modals_sheets.js"></script>`, `<script src="js/modules/app_sync_auth.js"></script>` e `<script src="js/modules/app_onboarding_tour.js"></script>` em `index.html` antes de `js/app.js`.
- [x] 3.6 Atualizar `tests/frontend_modules_syntax.test.cjs` com a nova ordem e validar sintaxe.
- [x] 3.7 Verificar contagem de linhas ($\le 350$) e testes unitários.

---

### Task 4: Expansão do Quality Gate, Atualização de Documentação e Manifesto SHA-256
**Files:**
- Modify: `tests/modular_file_size_gate.test.cjs`
- Modify: `AGENTS.md`
- Modify: `docs/operacao/manifesto_release.json`
- Verify: `tests/modular_file_size_gate.test.cjs`, `tests/clean_install_manifest.test.cjs`, `tests/server_smoke_e2e.test.cjs`

Steps:
- [x] 4.1 Adicionar `js/estoque.js` (+ `estoque_*.js`), `js/vendas.js` (+ `vendas_*.js`) e `js/app.js` (+ `app_*.js`) no teste `tests/modular_file_size_gate.test.cjs`.
- [x] 4.2 Executar `node --test tests/modular_file_size_gate.test.cjs` e comprovar aprovação de todas as suítes.
- [x] 4.3 Atualizar `AGENTS.md` documentando a arquitetura dos novos submódulos.
- [x] 4.4 Executar `node scripts/gerar_manifesto_release.cjs` para atualizar hashes SHA-256.
- [x] 4.5 Executar `node --require ./scripts/test-preload.cjs --test tests/clean_install_manifest.test.cjs` e `tests/server_smoke_e2e.test.cjs`.

---

### Task 5: Suíte Completa (`npm test`), Commit Semântico e Push
**Files:**
- Verify: Suíte global com 751 testes
- Verify: `git status --porcelain data/database.json`
- Commit: `refactor(ui): modularize estoque.js, vendas.js and app.js under 350-line quality gate`
- Push: `git push origin main`

Steps:
- [x] 5.1 Executar `npm test` e confirmar 0 falhas e aprovação completa de 748 testes (751 testes, 748 pass, 0 fail, 3 skip).
- [x] 5.2 Confirmar que `data/database.json` não sofreu alterações.
- [x] 5.3 Realizar commit semântico com todas as alterações em `js/`, `js/modules/`, `index.html`, `tests/`, `AGENTS.md` e `docs/`.
- [x] 5.4 Executar `git push origin main` e apresentar tabela completa de contagem de linhas.
