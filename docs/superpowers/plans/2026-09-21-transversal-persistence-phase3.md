# Plano de Implementação — Correção Transversal de Persistência & Concorrência de Voz (Fase 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminar transversalmente todo falso sucesso HTTP no Pátio CRM, garantindo que 20 aberturas de OS por voz persistam 20/20 registros comprovados pós-reboot, salvaguardando confirmações de token e aprovação digital, e lançando PersistenceError em falhas de persistência.

**Architecture:** 
1. Helper `salvarEstado` lança `PersistenceError` tipado em `ok: false`, impedindo que erros de concorrência ou I/O sejam ignorados.
2. Em `/api/comando-voz`, separar interpretação (fora do lock) da aplicação de alterações (dentro de `mutateTenantState`).
3. Em `/api/comando-voz/confirmar` e `/api/aprovacao/:token/decidir`, aplicar alterações via `mutateTenantState` consumindo o token somente após confirmação de gravação física.
4. Bloquear mutações autônomas via bot de WhatsApp durante o piloto controlado com resposta amigável de redirecionamento para o Pátio Web/Voz.
5. Atualizar a matriz de 97 chamadores com evidências e testes concretos por endpoint.

**Tech Stack:** Node.js, Express, SQLite3 (WAL mode), Better-SQLite3 / SQLite nativo, Supertest/Fetch HTTP.

**Spec:** `docs/superpowers/specs/2026-09-21-transversal-persistence-phase3-design.md`

## Global Constraints
- NUNCA alterar a base operacional `patio.db`.
- Preservar todas as correções aprovadas da Fase 2 e Fase 3 (frotas, fornecedores, peças, apontamentos, readiness).
- Toda resposta de sucesso de escrita DEVE corresponder a gravação durável confirmada no SQLite pós-reboot.
- Não mascarar conflitos com `force`.
- Preservar isolamento multi-tenant e RBAC em todas as rotas.

---

### Task 1: Regressão HTTP para 20 Aberturas de OS Concorrentes por Voz
**Files:**
- Create: `tests/http_concurrency_voice.test.cjs`
- Run: `node tests/http_concurrency_voice.test.cjs`
**Deliverable:** Teste que reproduz a perda de dados (20 POSTs respondem 200 mas gravam apenas 1 OS no SQLite, `1 !== 20`). Também testa uma operação concorrente de outro domínio (peça/frota) disputando com a voz no mesmo tenant.

### Task 2: Centralização de Erros com `PersistenceError` no `salvarEstado`
**Files:**
- Modify: `server.js`
- Modify: `lib/repository/stateRepository.js`
**Deliverable:** `PersistenceError` lançado por `salvarEstado` quando `ok: false`. Tratamento centralizado nos catches preservando 409 (com conflito e versão) e 500, garantindo que nenhum erro de persistência seja mascarado como HTTP 200.

### Task 3: Separação de Interpretação e Aplicação Atômica em Voz & Tokens
**Files:**
- Modify: `server.js` (rotas `/api/comando-voz` e `/api/comando-voz/confirmar`)
- Modify: `services/voiceActionEngine.js` (se necessário)
**Deliverable:** `/api/comando-voz` interpreta comandos fora do lock e aplica mutações de dados via `mutateTenantState`. Tokens de confirmação de uso único consumidos apenas após persistência confirmada. Teste `tests/http_concurrency_voice.test.cjs` deve passar com 20/20 OSs persistidas e duráveis pós-reboot.

### Task 4: Migração de Aprovação Digital e Bloqueio de Mutações Autônomas do Bot WhatsApp no Piloto
**Files:**
- Modify: `server.js` (rotas `/api/aprovacao/:token/decidir` e bot WhatsApp)
**Deliverable:** Aprovação digital migrada para `mutateTenantState`. Mutações autônomas do bot de WhatsApp bloqueadas no perfil de piloto com aviso claro de canal não suportado para escrita autônoma no piloto.

### Task 5: Matriz de 97 Chamadores Atualizada com Evidências Concretas
**Files:**
- Modify: `docs/evidencias/MATRIZ_CHAMADORES_PERSISTENCIA_2026-09-21.md`
**Deliverable:** Inventário com cada um dos 97 chamadores mapeados com tipo de proteção, teste associado, comportamento sob erro comprovado e ausência de chamadores desprotegidos.

### Task 6: Validação Completa: Benchmark Corrigido, Suíte de Testes e Agent-Browser
**Files:**
- Run: `node scripts/pilot_http_benchmark.cjs`
- Run: `node scripts/run_agent_browser_verified.cjs`
- Run: `node --require ./scripts/test-preload.cjs --test --test-concurrency=2 --test-timeout=120000 tests/*.test.cjs`
- Update: `docs/evidencias/RELATORIO_ESTABILIZACAO_PILOTO_2026-09-21.md`
- Update: `walkthrough.md`
**Deliverable:** Todas as evidências conferidas e documentadas com precisão (incluindo p50/p95 reais do benchmark), zero falhas na suíte geral e homologação agent-browser aprovada.
