# Estabilização Piloto Fase 2: Atomicidade HTTP, Eliminação de Falso Sucesso e Validação E2E Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminar falsos sucessos HTTP em operações concorrentes, garantir persistência real de 20 frotas simultâneas no SQLite, implementar testes negativos de prontidão (503), validar benchmark HTTP real e confirmar a jornada completa no navegador com agent-browser.

**Architecture:** Fila canônica interna de escrita por tenant em `stateRepository.js`, migração de rotas de domínio para `mutateTenantState` com propagação estrita de erro/conflito em `server.js`, correção da verificação real de WhatsApp em `/ready` e flags de arranque, e execução de testes E2E e benchmark HTTP isolados.

**Tech Stack:** Node.js, Express, SQLite3, Better-SQLite3/driver assíncrono, Playwright / agent-browser, Node Test Runner (`node:test`).

**Spec:** docs/superpowers/specs/2026-09-21-estabilizacao-piloto-fase2-design.md

## Global Constraints

- Nunca retornar HTTP 200 ou 201 quando a gravação falhar ou for rejeitada por conflito de versão.
- Preservar a integridade absoluta da base de dados operacional `patio.db` (todos os testes devem utilizar SQLite temporário via `DB_PATH`).
- Não mascarar conflitos de concorrência com `force: true` descontrolado fora de filas serializadas.
- Não efetuar alterações em permissões de segurança ou RBAC para facilitar aprovação de testes.
- Todas as asserções de teste devem ser reproduzíveis com código de saída 0.

---

### Task 1: Fila Canônica Interna de Escrita por Tenant em `lib/repository/stateRepository.js`

**Files:**
- Modify: `lib/repository/stateRepository.js`
- Test: `tests/state_repository.test.cjs`

**Interfaces:**
- Consumes: `createWriteQueue` de `lib/core.js`
- Produces: `getTenantWriteQueue(tenantId)`, `mutateState` com fila padrão interna garantida mesmo se `options.enqueueWrite` for omitido.

- [ ] **Step 1: Escrever teste unitário para `mutateState` sem `options.enqueueWrite`**
Criar/adicionar teste em `tests/state_repository.test.cjs` demonstrando que chamadas concorrentes a `mutateState` sem passar `enqueueWrite` explicitamente utilizam a fila canônica interna por tenant e não perdem updates.

- [ ] **Step 2: Executar o teste para verificar comportamento**
Executar: `node --require ./scripts/test-preload.cjs --test tests/state_repository.test.cjs`

- [ ] **Step 3: Implementar a fila canônica interna em `lib/repository/stateRepository.js`**
Importar `createWriteQueue` de `../core`, inicializar `tenantWriteQueues = new Map()` e garantir que `mutateState` use `options.enqueueWrite || getTenantWriteQueue(tenantId)`.

- [ ] **Step 4: Executar os testes de repositório e garantir aprovação**
Executar: `node --require ./scripts/test-preload.cjs --test tests/state_repository.test.cjs`
Esperado: PASS (todos os testes passam).

---

### Task 2: Teste de Reprodução de Concorrência HTTP em Frotas

**Files:**
- Create: `tests/http_concurrency_frotas.test.cjs`

**Interfaces:**
- Consumes: HTTP POST `/api/frotas`, GET `/api/frotas`, reinicialização do servidor Express com SQLite temporário.
- Produces: Prova automatizada da eliminação de falsos sucessos e persistência de 20 frotas concorrentes.

- [ ] **Step 1: Criar o teste de concorrência HTTP `tests/http_concurrency_frotas.test.cjs`**
O teste deve subir um servidor Express em porta efêmera com `DB_PATH` temporário, autenticar como `crm:write`, disparar 20 requisições simultâneas via `Promise.all` para `POST /api/frotas` com nomes distintos (`Frota Concorrente 1..20`), verificar as respostas, consultar `GET /api/frotas`, reiniciar o servidor e consultar novamente `GET /api/frotas`.

- [ ] **Step 2: Executar o teste na versão atual para comprovar o comportamento**
Executar: `node --require ./scripts/test-preload.cjs --test tests/http_concurrency_frotas.test.cjs`

---

### Task 3: Migração de Endpoints para `mutateTenantState` e Auditoria de Persistência em `server.js`

**Files:**
- Modify: `server.js`

**Interfaces:**
- Consumes: `mutateTenantState`, `persistTenantState`, `salvarEstado`
- Produces: `/api/frotas` retornando HTTP 201 com persistência real, verificação estrita de `saveRes.ok` com status 409/500 explícito onde não houver mutação, flag `DISABLE_WHATSAPP` respeitada no arranque.

- [ ] **Step 1: Migrar `POST /api/frotas` para `mutateTenantState`**
Substituir a leitura e gravação solta de `/api/frotas` por `await mutateTenantState(req, draft => { ... })`. Verificar `result.ok` e retornar status 201 em caso de sucesso e 500/409 caso falhe.

- [ ] **Step 2: Migrar demais endpoints de domínio (`/api/frotas/:id/veiculos`, agendamentos, etc.)**
Garantir que endpoints de criação/modificação de frotas e entidades de domínio utilizem `mutateTenantState` ou verifiquem explicitamente `const s = await persistTenantState(req, state); if (!s?.ok) return res.status(s?.status || 409).json(...);`.

- [ ] **Step 3: Auditar e eliminar `nextRevision` prematuro em `server.js`**
Remover qualquer linha que atribua manualmente `state.versao = nextRevision(...)` antes da persistência, garantindo que o repositório seja a autoridade única da revisão.

- [ ] **Step 4: Aplicar `process.env.DISABLE_WHATSAPP !== 'true'` no arranque**
No arranque de `server.js`, envolver `iniciarWhatsApp()` na checagem `process.env.DISABLE_WHATSAPP !== 'true'`.

- [ ] **Step 5: Executar o teste `tests/http_concurrency_frotas.test.cjs`**
Executar: `node --require ./scripts/test-preload.cjs --test tests/http_concurrency_frotas.test.cjs`
Esperado: PASS com 20 frotas criadas, 20 frotas listadas no GET e 20 frotas preservadas após reinício.

---

### Task 4: Testes Negativos de Prontidão (`/ready`) e Ajuste da Checagem de WhatsApp

**Files:**
- Modify: `server.js`
- Create: `tests/readiness_probe_negative.test.cjs`
- Modify: `tests/readiness_probe.test.cjs`

**Interfaces:**
- Consumes: `GET /ready`
- Produces: HTTP 503 com `checks.database !== 'ok'` quando SQLite falha, HTTP 503 com `checks.storage !== 'ok'` quando storage falha, e status real de WhatsApp (`connected` vs `initializing` vs `disabled`).

- [ ] **Step 1: Atualizar o cálculo de status de WhatsApp em `/ready` em `server.js`**
Usar `wppClient?.info ? 'connected' : (wppClient ? 'initializing' : 'disabled')` em vez de declarar `ready` prematuramente.

- [ ] **Step 2: Criar teste negativo `tests/readiness_probe_negative.test.cjs`**
Implementar dois cenários de falha real:
1. Fechamento/corrupção de banco: servidor apontando para banco inacessível -> `/ready` responde 503 com `status: 'not_ready'`.
2. Diretório de storage inválido / somente leitura -> `/ready` responde 503 com `status: 'not_ready'`.

- [ ] **Step 3: Executar testes de prontidão (positivo e negativos)**
Executar: `node --require ./scripts/test-preload.cjs --test tests/readiness_probe.test.cjs tests/readiness_probe_negative.test.cjs`
Esperado: PASS em ambos os arquivos.

---

### Task 5: Benchmark HTTP Real com Métricas Decompostas

**Files:**
- Create: `scripts/pilot_http_benchmark.cjs`
- Create: `docs/evidencias/benchmark_piloto_http_2026-09-21.json`

**Interfaces:**
- Consumes: Servidor Express rodando em processo isolado em porta efêmera.
- Produces: Métricas de requisições por segundo (RPS), latência p50/p95 em ms, taxa de sucesso (100%), taxa de conflitos (0%) e consumo de memória (RSS/Heap).

- [ ] **Step 1: Criar script `scripts/pilot_http_benchmark.cjs`**
O script inicia um servidor Express em porta efêmera com SQLite temporário, gera carga de 5 tenants com 10 conexões concorrentes fazendo operações HTTP reais de leitura (`GET /api/estado`), escrita (`POST /api/frotas`) e verificação de prontidão (`GET /ready`). Coleta latências individuais, calcula p50/p95, mede throughput e uso de memória.

- [ ] **Step 2: Executar o benchmark HTTP real**
Executar: `node scripts/pilot_http_benchmark.cjs`
Esperado: Sucesso, saída gerando `docs/evidencias/benchmark_piloto_http_2026-09-21.json`.

---

### Task 6: Validação de Navegador E2E com `agent-browser`

**Files:**
- Modify / Create: `scripts/run_agent_browser_verified.cjs`
- Output: `docs/evidencias/agent_browser_verified_fase2.log`

**Interfaces:**
- Consumes: Frontend web do Pátio CRM rodando no Express, Playwright headless browser / agent-browser.
- Produces: Log de execução E2E comprovando login -> cadastro cliente/veículo -> OS -> box -> recarregamento com persistência confirmada.

- [ ] **Step 1: Executar validação no navegador**
Executar o script de teste do navegador com credenciais válidas em ambiente isolado.

- [ ] **Step 2: Verificar que todos os passos foram concluídos com sucesso**
Confirmar que o log registra cada etapa sem erros de console ou de rede.

---

### Task 7: Execução da Suíte Completa e Parecer Final de Estabilização

**Files:**
- Modify: `docs/evidencias/RELATORIO_ESTABILIZACAO_PILOTO_2026-09-21.md`
- Modify: `walkthrough.md`

**Interfaces:**
- Consumes: Toda a suíte de testes `tests/*.test.cjs`
- Produces: Relatório final de prontidão para piloto operacional, com evidências documentadas e hashes de integridade.

- [ ] **Step 1: Executar a suíte completa de testes**
Executar: `node --require ./scripts/test-preload.cjs --test --test-concurrency=2 --test-timeout=120000 tests/*.test.cjs`
Esperado: 100% de aprovação (0 falhas).

- [ ] **Step 2: Atualizar o relatório formal de evidências**
Documentar os resultados em `docs/evidencias/RELATORIO_ESTABILIZACAO_PILOTO_2026-09-21.md` com os novos números, tempos de resposta, testes negativos e confirmação de zero perda de dados.

- [ ] **Step 3: Atualizar o Walkthrough com evidências completas**
Registrar no `walkthrough.md` as ações executadas e os artefatos gerados.
