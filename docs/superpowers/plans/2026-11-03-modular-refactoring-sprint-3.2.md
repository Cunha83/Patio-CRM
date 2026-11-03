# Plano de Refatoração Modular Sprint 3.2: voiceActionEngine, financeiro.js, CSS e Quality Gate

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Decompor `services/voiceActionEngine.js` (3.057 linhas), `js/financeiro.js` (1.938 linhas) e `style.css` (1.898 linhas) em submódulos de responsabilidade única com teto estrito de $\le 350$ linhas cada, preservando 100% dos contratos públicos via padrão Fachada (Facade / Re-export), e implantar o Quality Gate automatizado de tamanho de arquivos em `tests/modular_file_size_gate.test.cjs`.

**Architecture:** 
- Fachada em CommonJS para `services/voiceActionEngine.js` delegando para submódulos coesos em `services/voice/`.
- Fachada / Orquestrador frontend em `js/financeiro.js` delegando para submódulos em `js/modules/financeiro_*.js`, mantendo variáveis e funções no escopo global/window para compatibilidade com o navegador e sandboxes Node.js VM.
- Agregador CSS via `@import` em `style.css` delegando para folhas temáticas em `css/*.css`.
- Quality Gate automatizado via `tests/modular_file_size_gate.test.cjs` garantindo que nenhum módulo ultrapasse 350 linhas.

**Tech Stack:** Node.js (CommonJS, Built-in Test Runner `node:test`), Vanilla JS / ES6 frontend, CSS3.

---

## Estrutura de Arquivos Planejada

### 1. Submódulos de Voz (`services/voice/`)
- `services/voice/voiceSecurity.js` (< 200 linhas)
- `services/voice/voiceRulesHelpers.js` (< 250 linhas)
- `services/voice/voiceRulesPatterns.js` (< 350 linhas)
- `services/voice/voiceRulesInterpreter.js` (< 350 linhas)
- `services/voice/voiceAIInterpreter.js` (< 200 linhas)
- `services/voice/voiceConfirmationActions.js` (< 200 linhas)
- `services/voice/voicePatioActions.js` (< 350 linhas)
- `services/voice/voiceInventoryActions.js` (< 350 linhas)
- `services/voice/voiceLaborActions.js` (< 350 linhas)
- `services/voice/voiceLaborCostActions.js` (< 100 linhas)
- `services/voice/voicePricingActions.js` (< 300 linhas)
- `services/voice/voiceProfitabilityActions.js` (< 150 linhas)
- `services/voice/voiceFinancialActions.js` (< 350 linhas)
- `services/voice/voiceExecutiveActions.js` (< 350 linhas)
- `services/voice/voiceActionDispatcher.js` (< 200 linhas)
- `services/voiceActionEngine.js` (< 150 linhas - Fachada)

---

### 2. Submódulos Frontend Financeiro (`js/modules/`)
- `js/modules/financeiro_dashboard.js` (< 350 linhas)
- `js/modules/financeiro_dashboard_calc.js` (< 200 linhas)
- `js/modules/financeiro_graficos.js` (< 300 linhas)
- `js/modules/financeiro_titulos.js` (< 350 linhas)
- `js/modules/financeiro_caixa.js` (< 350 linhas)
- `js/modules/financeiro_estorno.js` (< 200 linhas)
- `js/modules/financeiro_dre.js` (< 200 linhas)
- `js/modules/financeiro_pix_hub.js` (< 350 linhas)
- `js/financeiro.js` (< 200 linhas - Fachada)

---

### 3. Modularização de CSS (`css/`)
- `css/variables.css` (< 100 linhas)
- `css/base-layout.css` (< 150 linhas)
- `css/components.css` (< 200 linhas)
- `css/voice-drawer.css` (< 350 linhas)
- `css/voice-modal.css` (< 100 linhas)
- `css/financeiro.css` (< 150 linhas)
- `css/dashboard-operacional.css` (< 200 linhas)
- `css/patio-monday.css` (< 350 linhas)
- `css/patio-monday-cells.css` (< 200 linhas)
- `css/enterprise-nav.css` (< 350 linhas)
- `css/automations-modal.css` (< 200 linhas)
- `css/responsive.css` (< 50 linhas)
- `style.css` (< 30 linhas - Agregador mestre via `@import`)

---

## Tarefas de Execução

### Task 1: Decomposição de `services/voiceActionEngine.js` (< 350 linhas por arquivo)
- [x] Criar pasta `services/voice/`.
- [x] Extrair `services/voice/voiceSecurity.js` (< 200 linhas) e checar com `node --check`.
- [x] Extrair `services/voice/voiceRulesHelpers.js` (< 250 linhas) e checar com `node --check`.
- [x] Extrair `services/voice/voiceRulesPatterns.js` (< 350 linhas) e checar com `node --check`.
- [x] Extrair `services/voice/voiceRulesInterpreter.js` (< 350 linhas) e checar com `node --check`.
- [x] Extrair `services/voice/voiceAIInterpreter.js` (< 200 linhas) e checar com `node --check`.
- [x] Extrair `services/voice/voiceConfirmationActions.js` (< 200 linhas) e checar com `node --check`.
- [x] Extrair `services/voice/voicePatioActions.js` (< 350 linhas) e checar com `node --check`.
- [x] Extrair `services/voice/voiceInventoryActions.js` (< 350 linhas) e checar com `node --check`.
- [x] Extrair `services/voice/voiceLaborActions.js` e `services/voice/voiceLaborCostActions.js` (< 350 linhas cada) e checar com `node --check`.
- [x] Extrair `services/voice/voicePricingActions.js` e `services/voice/voiceProfitabilityActions.js` (< 350 linhas cada) e checar com `node --check`.
- [x] Extrair `services/voice/voiceFinancialActions.js` (< 350 linhas) e checar com `node --check`.
- [x] Extrair `services/voice/voiceExecutiveActions.js` (< 350 linhas) e checar com `node --check`.
- [x] Extrair `services/voice/voiceActionDispatcher.js` (< 200 linhas) e checar com `node --check`.
- [x] Refatorar `services/voiceActionEngine.js` para ser a Fachada (< 150 linhas) reexportando as funções originais.
- [x] Validar linha por linha que cada arquivo em `services/voice/` tem $\le 350$ linhas.
- [x] **Verificação:** Executar `node --require ./scripts/test-preload.cjs --test tests/voice.test.cjs tests/voice_financial_and_training.test.cjs tests/voice_security_negative.test.cjs tests/voice_assistant_settings.test.cjs tests/assistente_briefing.test.cjs`.

### Task 2: Decomposição de `js/financeiro.js` (< 350 linhas por arquivo)
- [x] Extrair `js/modules/financeiro_dashboard.js` (< 350 linhas) e checar sintaxe.
- [x] Extrair `js/modules/financeiro_dashboard_calc.js` (< 350 linhas) e checar sintaxe.
- [x] Extrair `js/modules/financeiro_graficos.js` (< 350 linhas) e checar sintaxe.
- [x] Extrair `js/modules/financeiro_titulos.js` (< 350 linhas) e checar sintaxe.
- [x] Extrair `js/modules/financeiro_caixa.js` (< 350 linhas) e checar sintaxe.
- [x] Extrair `js/modules/financeiro_estorno.js` (< 350 linhas) e checar sintaxe.
- [x] Extrair `js/modules/financeiro_dre.js` (< 350 linhas) e checar sintaxe.
- [x] Extrair `js/modules/financeiro_pix_hub.js` (< 350 linhas) e checar sintaxe.
- [x] Refatorar `js/financeiro.js` (< 200 linhas) para conter `viewFinanceiro`, `renderOptionsPlanoDeContas`, delegações e binds em `window`/`globalThis`.
- [x] Atualizar `index.html` incluindo os scripts `js/modules/financeiro_*.js` na ordem exata de dependências.
- [x] Validar que todos os arquivos têm $\le 350$ linhas.
- [x] **Verificação:** Executar `node --test tests/frontend_modules_syntax.test.cjs tests/plano_contas_crud.test.cjs tests/menu_novo_compra.test.cjs`.

### Task 3: Modularização de `style.css` e Quality Gate Automatizado
- [x] Criar diretório `css/`.
- [x] Extrair os blocos temáticos em `css/*.css` com $\le 350$ linhas cada (12 folhas modulares).
- [x] Refatorar `style.css` como agregador `@import` (< 30 linhas).
- [x] Criar teste de quality gate `tests/modular_file_size_gate.test.cjs` validando que:
  - Nenhum módulo de `services/whatsapp/` ultrapassa 350 linhas.
  - Nenhum módulo de `services/financial/` ultrapassa 350 linhas.
  - Nenhum módulo de `services/voice/` ultrapassa 350 linhas.
  - Nenhum módulo de `js/modules/financeiro_*.js` ultrapassa 350 linhas.
  - Nenhuma folha de estilo em `css/*.css` ultrapassa 350 linhas.
  - As fachadas (`services/whatsapp/whatsappHandlers.js`, `services/financialAnalystService.js`, `services/voiceActionEngine.js`, `js/financeiro.js`, `style.css`) têm $\le 350$ linhas.
- [x] **Verificação:** Executar `node --test tests/modular_file_size_gate.test.cjs`.

### Task 4: Atualização de Manifesto, Suíte Completa e Commit Semântico
- [x] Atualizar `docs/operacao/manifesto_release.json` com os novos arquivos e seus SHA-256 via `node scripts/gerar_manifesto_release.cjs`.
- [x] Executar `node --require ./scripts/test-preload.cjs --test tests/clean_install_manifest.test.cjs`.
- [x] Executar a suíte completa de testes (`npm test`) e comprovar $\ge 724$ testes passando, 0 falhas e exit code 0 (resultado: 730 pass, 0 fail, exit code 0).
- [x] Verificar integridade de `data/database.json` via `git status --porcelain data/database.json` (100% intocado).
- [ ] Executar commit semântico: `refactor(voice,ui): modularize voiceActionEngine, financeiro.js and CSS with automated 350-line quality gate`.
- [ ] Apresentar relatório final com contagens de linha e evidências de execução.
