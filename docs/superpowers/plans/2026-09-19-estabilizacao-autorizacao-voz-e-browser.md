# Estabilização, Autorização Segura do Motor de Voz e Homologação E2E Observável Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar o princípio de default-deny e RBAC estrito em voiceActionEngine.js e WhatsApp, corrigir fixtures de teste legítimas, expandir testes negativos, decompor a Jornada 2 no navegador em 9 etapas observáveis e gerar o pacote de evidências 5S com SHA-256 e código 0.

**Architecture:** Refatorar a verificação de permissões do motor de voz para exigir papéis e permissões canônicos autenticados sem inferência por substrings de actorId; injetar contextos sanitizados no canal WhatsApp; decompor a Jornada 2 do auditor agent-browser em etapas atômicas (2.a a 2.i) com telemetria e captura automática de falhas; validar 100% da suíte de testes.

**Tech Stack:** Node.js (test runner nativo `node:test`), Express, SQLite, agent-browser (Vercel), crypto (HMAC).

**Spec:** `docs/superpowers/specs/2026-09-18-homologacao-jornadas-browser-design.md`

## Global Constraints
- NUNCA enfraquecer regras de autorização para acomodar testes quebrados; corrigir as fixtures dos testes.
- NUNCA inferir papéis por substrings de actorId ou aceitar context = {} para ações protegidas.
- Preservar todas as correções prévias validadas (isPerfilMecanico, S.perfil, blindagem financeira no DOM/API, integridade de valores para admin).
- Todas as execuções de testes e navegadores devem registrar início, término, duração e código de saída.

---

### Task 1: Default-Deny & RBAC Canônico em services/voiceActionEngine.js

**Files:**
- Modify: `services/voiceActionEngine.js:72-145`
- Test: `tests/voice_security_negative.test.cjs`

**Interfaces:**
- Consumes: `context.role`, `context.permissions`
- Produces: `canReadFinancial(context): boolean`, `canWriteFinancial(context): boolean`, `canDeleteOS(context): boolean`, `canWriteOS(context): boolean`, `canAdjustInventory(context): boolean`, `resolveEffectiveRole(context): string|null`

- [ ] **Step 1: Escrever teste de falha para context = {} e actorId substrings**
- [ ] **Step 2: Verificar que o teste atual falha com as regras frouxas**
- [ ] **Step 3: Refatorar resolveEffectiveRole e funções can* em voiceActionEngine.js aplicando default-deny estrito**
- [ ] **Step 4: Executar testes unitários de segurança de voz para verificar aprovação**

---

### Task 2: Contexto Seguro nos Handlers de WhatsApp em server.js

**Files:**
- Modify: `server.js:7532-7548,8085-8105`
- Test: `tests/voice_security_negative.test.cjs`

**Interfaces:**
- Consumes: `isSenderAdmin`, `isContextOperacao`, `fromNumber`
- Produces: `safeContext` canônico passado para `voiceActionEngine.interpretarEExecutar`

- [ ] **Step 1: Localizar chamadas de voiceActionEngine nos handlers de áudio e texto de WhatsApp**
- [ ] **Step 2: Injetar role e permissions canônicos (tenant_admin com '*' para admin, atendente com os:read/write para grupos operacionais, cliente sem permissões para externos)**
- [ ] **Step 3: Testar sintaxe de server.js com `node -c server.js`**

---

### Task 3: Ajuste de Fixtures Legítimas em technical_intake.test.cjs e inventory_and_procurement.test.cjs

**Files:**
- Modify: `tests/technical_intake.test.cjs:841`
- Modify: `tests/inventory_and_procurement.test.cjs:877,888`
- Test: `node --test tests/technical_intake.test.cjs tests/inventory_and_procurement.test.cjs`

**Interfaces:**
- Consumes: Contextos de teste
- Produces: Fixtures com `role` e `permissions` canônicos legítimos

- [ ] **Step 1: Ajustar teste 17 de technical_intake.test.cjs com role: 'atendente', permissions: ['os:read', 'os:write']**
- [ ] **Step 2: Ajustar teste 29 de inventory_and_procurement.test.cjs com role: 'gerente', permissions: ['inventory:read', 'inventory:write', 'inventory:adjust']**
- [ ] **Step 3: Executar os dois arquivos de teste e validar 100% de aprovação**

---

### Task 4: Expansão da Bateria de Testes Negativos em tests/voice_security_negative.test.cjs

**Files:**
- Modify: `tests/voice_security_negative.test.cjs`
- Test: `node --test tests/voice_security_negative.test.cjs`

**Interfaces:**
- Produces: 6 novos testes unitários negativos e ajuste de resiliência no timeout HTTP do servidor

- [ ] **Step 1: Adicionar testes unitários para context = {}, actorId com substring sem role, actorId admin sem permissões, token inválido**
- [ ] **Step 2: Ajustar polling de inicialização do servidor HTTP para 150 iterações (15s)**
- [ ] **Step 3: Executar `node --test tests/voice_security_negative.test.cjs` e validar aprovação de todos os testes**

---

### Task 5: Decomposição Observável da Jornada 2 em scripts/run_agent_browser_verified.cjs

**Files:**
- Modify: `scripts/run_agent_browser_verified.cjs`
- Test: `node scripts/run_agent_browser_verified.cjs --only-2`

**Interfaces:**
- Produces: `runObservableStep` com medição de início, fim, duração e captura automática de screenshot/DOM em caso de erro

- [ ] **Step 1: Implementar função runObservableStep em scripts/run_agent_browser_verified.cjs**
- [ ] **Step 2: Substituir o bloco monolítico da Jornada 2 pelas etapas 2.a a 2.i**
- [ ] **Step 3: Implementar suporte a fixtures autônomas para execução com flag --only-2**
- [ ] **Step 4: Executar com `--only-2` e validar as 9 etapas observáveis**

---

### Task 6: Validação Completa de Regressão da Suíte de Testes Geral

**Files:**
- Test: `npm test`

- [ ] **Step 1: Executar `npm test` em todo o projeto**
- [ ] **Step 2: Confirmar aprovação de todos os testes sem regressões**

---

### Task 7: Homologação E2E Completa no Navegador e Pacote de Evidências 5S

**Files:**
- Execute: `node scripts/run_agent_browser_verified.cjs`
- Produce: `docs/evidencias/agent-browser-verified.log`, hashes SHA-256 e relatório final

- [ ] **Step 1: Executar auditoria completa das 6 jornadas no navegador com agent-browser**
- [ ] **Step 2: Verificar código de saída 0 e presença de todas as jornadas no log**
- [ ] **Step 3: Calcular hashes SHA-256 dos arquivos alterados e dos logs**
- [ ] **Step 4: Emitir parecer de prontidão operacional 5S**
