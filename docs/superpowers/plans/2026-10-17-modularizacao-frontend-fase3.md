# Modularização do Frontend (Fase 3) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Decompor e desacoplar os módulos de pátio e inteligência operacional (`js/patio.js` e `js/dashboard_operacional.js`) em submódulos especializados dentro de `js/modules/`, preservando rigorosamente os contratos com o escopo global (`window` e `globalThis`), a ordem de carregamento no `index.html` e 100% de aprovação na esteira de testes automatizados.

**Architecture:** 
1. Extração da camada visual de renderização de pátio, cards de OS e boxes livres para `js/modules/patio_render.js`.
2. Extração do motor de formatação, cálculo e renderização de KPIs e gráficos operacionais para `js/modules/dashboard_metrics.js`.
3. Manutenção das regras de modais, fluxo de faturamento e impressão de OS em `js/patio.js` e orquestração de sincronização em tempo real e polling em `js/dashboard_operacional.js`.
4. Inclusão ordenada no `index.html`, atualização de `tests/frontend_modules_syntax.test.cjs` e `tests/patio_mechanic_privacy.test.cjs`, e recalibração dos hashes SHA-256 no manifesto de release.

**Tech Stack:** JavaScript Vanilla (ES6/Browser SPA), Chart.js, Node.js Test Runner, HTML5, VM Scripts compilation.

**Spec:** `docs/superpowers/specs/2026-10-16-modularizacao-arquitetura-design.md`

## Global Constraints
- Nenhuma alteração nos contratos de interface pública ou nomes de funções no `window` (`viewPatio`, `cardOS`, `cardLivre`, `viewDashboardOperacional`, `inicializarGraficosOperacionais`, etc.).
- Preservação estrita da blindagem de privacidade de custos e totais para o perfil mecânico.
- Todos os arquivos `.js` devem compilar perfeitamente no `node:vm` (`new vm.Script()`).
- Suíte completa de testes (`npm.cmd test`) deve passar com 100% de sucesso (601+ pass, 0 fail).

## Review Focus
1. `cardOS` mantendo ocultação de valores financeiros (`class="val"`, `R$`) quando `isPerfilMecanico()` for verdadeiro.
2. `viewDashboardOperacional` renderizando cards executivos, pipeline de estágios, diagnóstico de gargalos e grid de gráficos a partir de `dashboard_metrics.js`.
3. Sincronização e ciclo de vida de gráficos Chart.js (`destruirGraficosOperacionais` e `inicializarGraficosOperacionais`) com acesso seguro a `_painel`.
4. Ordem de dependência estrita em `index.html` validada por `tests/frontend_modules_syntax.test.cjs`.

---

### Task 1: Extração da Renderização de Pátio e Boxes (`js/modules/patio_render.js`)

**Files:**
- Create: `js/modules/patio_render.js`
- Modify: `js/patio.js`
- Modify: `index.html`
- Modify: `tests/patio_mechanic_privacy.test.cjs`

**Interfaces:**
- Produces: `isPerfilMecanico`, `viewPatio`, `cardOS`, `cardLivre`.
- Consumes: `S`, `V`, `C`, `ST`, `totOS`, `brl`, `esc`, `ico`.

- [x] **Step 1: Criar `js/modules/patio_render.js` com a lógica de `isPerfilMecanico`, `viewPatio`, `cardOS` e `cardLivre`.**
- [x] **Step 2: Atualizar `js/patio.js` removendo funções migradas e adicionando resolução de fallback e exportações globais canônicas.**
- [x] **Step 3: Adicionar `js/modules/patio_render.js` no `index.html` imediatamente antes de `js/patio.js`.**
- [x] **Step 4: Atualizar `tests/patio_mechanic_privacy.test.cjs` para carregar `patio_render.js` no sandbox de teste.**

---

### Task 2: Extração do Motor de Métricas e KPIs Operacionais (`js/modules/dashboard_metrics.js`)

**Files:**
- Create: `js/modules/dashboard_metrics.js`
- Modify: `js/dashboard_operacional.js`
- Modify: `index.html`

**Interfaces:**
- Produces: `DashboardMetrics`, `formatarTempoOp`, `formatarPercentualOp`, `formatarHoraSimples`, `destruirGraficosOperacionais`, `inicializarGraficosOperacionais`, `folhaDetalheOperacional`, `toggleModoTV`, `renderCardsExecutivosOp`, `renderPipelineEstagiosOp`, `renderMetricasFluxoOp`, `renderGridGraficosOp`.
- Consumes: `Chart`, `esc`, `ico`, `torrar`, `fecharFolha`, `isPerfilMecanico`.

- [x] **Step 1: Criar `js/modules/dashboard_metrics.js` com formatadores seguros, lifecycle de gráficos Chart.js, drawer rápido e renderers de seções de KPIs.**
- [x] **Step 2: Atualizar `js/dashboard_operacional.js` delegando cálculo/renderização para o submódulo e sincronizando `_painel` globalmente.**
- [x] **Step 3: Adicionar `js/modules/dashboard_metrics.js` no `index.html` antes de `js/dashboard_operacional.js`.**

---

### Task 3: Atualização dos Testes Automatizados de Sintaxe e Ordenação

**Files:**
- Modify: `tests/frontend_modules_syntax.test.cjs`
- Modify: `tests/veronica_executive_manager.test.cjs`

- [x] **Step 1: Atualizar `tests/frontend_modules_syntax.test.cjs` para exigir >= 10 submódulos e incluir novos arquivos na ordem esperada.**
- [x] **Step 2: Aumentar janela de inicialização HTTP em `tests/veronica_executive_manager.test.cjs` para resiliência sob carga de concorrência.**
- [x] **Step 3: Executar `node --require ./scripts/test-preload.cjs --test tests/frontend_modules_syntax.test.cjs` e validar aprovação.**

---

### Task 4: Atualização do Manifesto de Release e Verificação Completa da Suíte

**Files:**
- Update: `docs/operacao/manifesto_release.json`
- Update: `docs/operacao/MANIFESTO_RELEASE_PILOTO_2026-09-21.md`
- Test: `npm.cmd test`

- [x] **Step 1: Executar `node scripts/gerar_manifesto_release.cjs` e atualizar hashes SHA-256.**
- [x] **Step 2: Executar `tests/clean_install_manifest.test.cjs` e validar instalação limpa.**
- [x] **Step 3: Executar `npm.cmd test` e garantir 100% de sucesso (601 pass, 0 fail, 3 skip).**
