# Plano de Implementação: Unificação da Confirmação de Voz e Recuperação Pós-Falha de Persistência

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unificar os fluxos de confirmação de voz geral (`/api/comando-voz`) e dedicada (`/api/comando-voz/confirmar`), garantindo validação, reserva de concorrência e gravação física durável no SQLite antes do consumo definitivo do token, permitindo recuperação com o mesmo token após falhas de escrita.

**Architecture:** Módulo `securityToken` com suporte a `inFlightTokens` (reserva e liberação em caso de rollback); `voiceActionEngine` com validação desacoplada de consumo imediato; `server.js` consumindo tokens única e exclusivamente após `mutateTenantState` bem-sucedido; testes HTTP cobrindo injeção de falha de escrita, repetição de token, concorrência e isolamento multi-tenant.

**Tech Stack:** Node.js (v24), Express, SQLite (better-sqlite3 WAL), crypto HMAC SHA-256.

**Spec:** `docs/superpowers/specs/2026-09-21-voice-token-persistence-unification-design.md`

## Global Constraints
- Nenhuma resposta de sucesso HTTP 200 pode ser emitida antes da gravação durável no SQLite.
- O token de confirmação só pode ser consumido em `consumedTokens` e `acoesPendentes` após confirmação de escrita física.
- Falhas de escrita não devem destruir o token nem invalidar a ação pendente na memória.
- Tentativas simultâneas com o mesmo token devem ser serializadas/rejeitadas sem duplicação de efeito.
- Base de dados de produção `patio.db` deve ser preservada intacta.

---

### Task 1: Teste de Regressão HTTP Reproduzindo P1 (Falha de Escrita, Retentativa e Concorrência de Token)

**Files:**
- Create: `tests/http_voice_confirmation_recovery.test.cjs`

**Interfaces:**
- Consumes: `/api/comando-voz`, `/api/comando-voz/confirmar`, `/api/estado`
- Produces: Teste automatizado cobrindo:
  1. Solicitação de exclusão de OS via voz -> gera token.
  2. Falha de escrita simulada -> confirmação por texto `{ texto: "confirmar" }` falha e token NÃO é consumido.
  3. Remoção de falha -> repetição da confirmação com o mesmo token é bem-sucedida e OS é excluída no SQLite.
  4. Nova tentativa com o mesmo token falha (anti-replay).
  5. Concorrência: 5 confirmações simultâneas com o mesmo token resultam em exatamente 1 sucesso e 4 rejeições.
  6. Isolamento: operador de outro tenant ou papel não autorizado não pode confirmar o token.

- [x] **Step 1: Criar o arquivo de teste de regressão `tests/http_voice_confirmation_recovery.test.cjs`**
- [x] **Step 2: Executar o teste e observar a falha da retentativa com o código atual**

---

### Task 2: Reserva e Liberação de Tokens em `lib/tokens/securityToken.js`

**Files:**
- Modify: `lib/tokens/securityToken.js`

**Interfaces:**
- Produces: `reservarTokenAcao(token, expected)`, `liberarTokenAcao(token)`, `confirmarConsumoTokenAcao(token, expected)`, `validarTokenAcao(token, expected)`

- [x] **Step 1: Adicionar `inFlightTokens` e implementar `reservarTokenAcao` e `liberarTokenAcao`**
- [x] **Step 2: Exportar as novas funções e atualizar `confirmarConsumoTokenAcao` para limpar `inFlightTokens`**

---

### Task 3: Desacoplamento Seguro e Reserva em `services/voiceActionEngine.js`

**Files:**
- Modify: `services/voiceActionEngine.js`

**Interfaces:**
- Consumes: `reservarTokenAcao`, `liberarTokenAcao`, `confirmarConsumoTokenAcao`
- Produces: `executarAcao` com `autoConsumirToken: false` por padrão para confirmações; `abortarConfirmacaoAcao(token)`; `consumirAcaoPendente(token, context)`

- [x] **Step 1: Ajustar `executarAcao` para intenção `confirmar_acao` para usar `validarTokenAcao` / `reservarTokenAcao` sem consumo imediato**
- [x] **Step 2: Implementar `abortarConfirmacaoAcao` e garantir que `acoesPendentes` não seja deletada antes da gravação**

---

### Task 4: Unificação dos Fluxos em `server.js`

**Files:**
- Modify: `server.js` (`/api/comando-voz` e `/api/comando-voz/confirmar`)

**Interfaces:**
- Consumes: `voiceActionEngine.interpretarEExecutar`, `voiceActionEngine.consumirAcaoPendente`, `voiceActionEngine.abortarConfirmacaoAcao`, `mutateTenantState`

- [x] **Step 1: Atualizar bloco de confirmação em `/api/comando-voz` para aplicar `autoConsumirToken: false` e invocar `consumirAcaoPendente` apenas no sucesso pós-persistência, chamando `abortarConfirmacaoAcao` em caso de falha**
- [x] **Step 2: Atualizar `/api/comando-voz/confirmar` com o mesmo padrão e captura de erro**

---

### Task 5: Validação Completa e Evidências

**Files:**
- Run: `tests/http_voice_confirmation_recovery.test.cjs`
- Run: `tests/voice*.test.cjs`
- Run: Suíte Geral (`tests/*.test.cjs`)
- Run: Benchmark HTTP (`scripts/pilot_http_benchmark.cjs`)
- Run: Homologação no Navegador (`scripts/run_agent_browser_verified.cjs`)
- Modify: `docs/evidencias/MATRIZ_CHAMADORES_PERSISTENCIA_2026-09-21.md`, `docs/evidencias/RELATORIO_ESTABILIZACAO_PILOTO_2026-09-21.md`, `walkthrough.md`

- [x] **Step 1: Executar `tests/http_voice_confirmation_recovery.test.cjs` e verificar aprovação de 100% dos cenários**
- [x] **Step 2: Executar testes de voz e suíte geral completa (525+ testes)**
- [x] **Step 3: Reexecutar benchmark e homologação `agent-browser`**
- [x] **Step 4: Atualizar matriz de chamadores, relatório de estabilização e walkthrough**
