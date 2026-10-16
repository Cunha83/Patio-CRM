# Modularização e Sanitização do Pátio CRM Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Decompor o monólito `server.js` (~8.800 linhas) em serviços, contexto compartilhado e rotas modulares por domínio, garantindo que nenhum endpoint seja quebrado e que todos os testes existentes passem.

**Architecture:** Extração de contexto e persistência para `lib/serverContext.js`, extração de serviços isolados (`services/vehicleLookupService.js`, `services/reportGenerationService.js`, `services/whatsapp/*`), criação de roteadores Express por domínio sob `routes/`, e transformação de `server.js` em um orquestrador conciso (< 200 linhas) que exporta a mesma interface pública de compatibilidade.

**Tech Stack:** Node.js CommonJS, Express, SQLite3, WhatsApp-Web.js, Puppeteer, Google Gen AI.

**Spec:** `docs/superpowers/specs/2026-10-16-modularizacao-arquitetura-design.md`

## Global Constraints
- Zero alteração na interface pública de `module.exports` de `server.js`.
- Preservação estrita de todos os 199 caminhos de rotas e códigos HTTP.
- Todos os testes (`node --require ./scripts/test-preload.cjs --test tests/*.test.cjs`) devem passar.

---

### Task 1: Contexto e Estado Compartilhado (`lib/serverContext.js`)

**Files:**
- Create: `lib/serverContext.js`
- Test: `node --require ./scripts/test-preload.cjs --test tests/core.test.cjs`

**Interfaces:**
- Produces: `identityRegistry`, `authMiddleware`, `requirePermission`, `enqueueWrite`, `nextRevision`, `extractTenantId`, `getTenantKey`, `getOrLoadState`, `salvarEstado`, `persistTenantState`, `persistCurrentState`, `mutateTenantState`, `gerarId`, `escapeHtml`, `safeJsonParse`, mutexes de avaliação, getters/setters para `ai`, `wppClient`, `browserRenderCache`, `passwordResetDeliveryAdapter`.

- [ ] **Step 1: Criar `lib/serverContext.js` com extração limpa e testada.**
- [ ] **Step 2: Validar isolamento e funções utilitárias.**

---

### Task 2: Extração dos Serviços Auxiliares (`services/vehicleLookupService.js` e `services/reportGenerationService.js`)

**Files:**
- Create: `services/vehicleLookupService.js`
- Create: `services/reportGenerationService.js`
- Test: `node --require ./scripts/test-preload.cjs --test tests/core.test.cjs`

- [ ] **Step 1: Extrair `consultarDadosVeiculoOnline` para `services/vehicleLookupService.js`.**
- [ ] **Step 2: Extrair relatórios executivos e indicadores JPG para `services/reportGenerationService.js`.**

---

### Task 3: Extração do Módulo WhatsApp (`services/whatsapp/`)

**Files:**
- Create: `services/whatsapp/whatsappClient.js`
- Create: `services/whatsapp/whatsappHandlers.js`
- Create: `services/whatsapp/whatsappScheduler.js`

- [ ] **Step 1: Extrair o cliente WhatsApp e handlers de mensagem OCR/comandos.**
- [ ] **Step 2: Extrair agendador de relatórios diários.**

---

### Task 4: Criação dos Roteadores Express por Domínio (`routes/`)

**Files:**
- Create: `routes/health.routes.js`
- Create: `routes/state.routes.js`
- Create: `routes/backup.routes.js`
- Create: `routes/os.routes.js`
- Create: `routes/preOs.routes.js`
- Create: `routes/inspection.routes.js`
- Create: `routes/quotation.routes.js`
- Create: `routes/inventory.routes.js`
- Create: `routes/team.routes.js`
- Create: `routes/pricing.routes.js`
- Create: `routes/crm.routes.js`
- Create: `routes/voice.routes.js`
- Create: `routes/operation.routes.js`
- Create: `routes/config.routes.js`
- Create: `routes/auth.routes.js`
- Create: `routes/billing.routes.js`
- Create: `routes/platform.routes.js`
- Create: `routes/whatsapp.routes.js`
- Create: `routes/static.routes.js`
- Create: `routes/index.js`

- [ ] **Step 1: Mapear e migrar cada grupo de rotas com seus middlewares específicos.**
- [ ] **Step 2: Criar `routes/index.js` que agrega e registra todos os roteadores.**

---

### Task 5: Refatoração do `server.js` Orquestrador e Verificação Geral

**Files:**
- Modify: `server.js`
- Test: `node --require ./scripts/test-preload.cjs --test tests/*.test.cjs`

- [ ] **Step 1: Integrar os novos módulos no `server.js` mantendo backward compatibility.**
- [ ] **Step 2: Executar testes de regressão automatizados para certificar zero quebras.**
- [ ] **Step 3: Commit das mudanças do Backend.**

---

### Task 6: Fase 2 - Modularização e Higienização do Frontend (`js/`)

**Files:**
- Modify / Refactor: `js/app.js`, `js/cadastros.js`, etc.
- Verify: Inspeção de integridade dos contratos globais do DOM.
