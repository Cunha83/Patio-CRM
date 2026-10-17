# Modularização do Frontend (Fase 2) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Decompor os maiores monólitos do frontend (`js/financeiro.js` e `js/cadastros.js`) em módulos especializados sob `js/modules/`, preservando integralmente os contratos com `window`, a ordem no `index.html` e 100% de aprovação na esteira de testes.

**Architecture:** Extração do motor da inteligência financeira para `js/modules/financeiro_analista.js` (~700 linhas) e extração dos formulários e folhas modais de cadastro para `js/modules/cadastros_forms.js` (~450 linhas). Integração ordenada no `index.html`, atualização de `tests/frontend_modules_syntax.test.cjs`, regeneração do manifesto de release e validação integral.

**Tech Stack:** JavaScript Vanilla (ES6/Browser SPA), Node.js Test Runner, HTML5, VM Scripts compilation.

**Spec:** `docs/superpowers/specs/2026-10-16-modularizacao-arquitetura-design.md`

## Global Constraints
- Nenhuma alteração nos contratos de interface pública ou nomes de funções no `window` (`viewFinanceiro`, `blocoVeronicaAnalista`, `folhaCadastro`, etc.).
- Preservação estrita de comportamento em tempo de execução sem dependência de bundlers externos.
- Todos os arquivos `.js` devem compilar perfeitamente no `node:vm` (`new vm.Script()`).
- Suíte completa de testes (`npm.cmd test`) deve passar com 0 falhas.

## Review Focus
1. `blocoVeronicaAnalista` acessando dados reativos em `S` e funções utilitárias monetárias (`brl`, `brlCurto`) sem erros de referência.
2. `folhaCadastro` acessando `S.ui.rascCad` e funções de consulta de CNPJ/Serasa/CEP em escopo global.
3. Ordem de carregamento dos scripts em `index.html` respeitando precedência de dependências.
4. `tests/clean_install_manifest.test.cjs` validando hashes criptográficos recalculados.

---

### Task 1: Extração da Verônica Analista Financeira (`js/modules/financeiro_analista.js`)

**Files:**
- Create: `js/modules/financeiro_analista.js`
- Modify: `js/financeiro.js`
- Modify: `index.html`
- Test: `node --require ./scripts/test-preload.cjs --test tests/frontend_modules_syntax.test.cjs`

**Interfaces:**
- Produces: `obterCaixaAbertoFrontend`, `calcularPrevisaoFrontend`, `calcularControlesInternosFrontend`, `blocoVeronicaAnalista`, `folhaAbrirCaixaVeronica`, `folhaLancamentoCaixaVeronica`, `folhaFecharCaixaVeronica`, `falarParecerVeronica`.
- Consumes: `S`, `brl`, `brlCurto`, `hoje`, `addDias`, `diasEntre`, `dataBR`, `esc`, `ico`, `torrar`, `salvar`, `render`, `renderFolha`, `fecharFolha`.

- [x] **Step 1: Criar `js/modules/financeiro_analista.js` com a extração das rotinas de inteligência e caixa da Verônica.**
- [x] **Step 2: Remover o bloco extraído de `js/financeiro.js` mantendo delegações globais em `window`.**
- [x] **Step 3: Adicionar `js/modules/financeiro_analista.js` no `index.html`.**
- [x] **Step 4: Executar validação de sintaxe VM do módulo.**

---

### Task 2: Extração dos Formulários de Cadastro (`js/modules/cadastros_forms.js`)

**Files:**
- Create: `js/modules/cadastros_forms.js`
- Modify: `js/cadastros.js`
- Modify: `index.html`
- Test: `node --require ./scripts/test-preload.cjs --test tests/frontend_modules_syntax.test.cjs`

**Interfaces:**
- Produces: `folhaCliente`, `folhaCadastro`.
- Consumes: `S`, `C`, `esc`, `ico`, `brl`, `torrar`, `salvar`, `render`, `renderFolha`, `abrirFolha`, `fecharFolha`, `consultarSerasa`, `abrirModalConsultaCliente`, `verificarAutoConsultaCnpj`, `buscarCep`, `consultarPlaca`, `buscarCNPJ`.

- [x] **Step 1: Criar `js/modules/cadastros_forms.js` contendo `folhaCliente` e `folhaCadastro`.**
- [x] **Step 2: Remover o código migrado de `js/cadastros.js` e expor funções em `window`.**
- [x] **Step 3: Registrar `js/modules/cadastros_forms.js` no `index.html`.**
- [x] **Step 4: Executar validação de sintaxe VM do módulo.**

---

### Task 3: Atualização dos Testes de Sintaxe e Dependência de Frontend

**Files:**
- Modify: `tests/frontend_modules_syntax.test.cjs`
- Test: `node --require ./scripts/test-preload.cjs --test tests/frontend_modules_syntax.test.cjs`

- [x] **Step 1: Adicionar os novos módulos na lista `expectedScripts` do teste.**
- [x] **Step 2: Executar `node --require ./scripts/test-preload.cjs --test tests/frontend_modules_syntax.test.cjs` e confirmar aprovação.**

---

### Task 4: Atualização do Manifesto de Release e Verificação Completa

**Files:**
- Update: `docs/operacao/manifesto_release.json`
- Update: `docs/operacao/MANIFESTO_RELEASE_PILOTO_2026-09-21.md`
- Test: `npm.cmd test`

- [x] **Step 1: Executar `node scripts/gerar_manifesto_release.cjs` para atualizar os hashes SHA-256.**
- [x] **Step 2: Executar a suíte completa de testes automatizados (`npm.cmd test`).**
- [x] **Step 3: Confirmar 100% de sucesso (601+ pass, 0 fail).**
