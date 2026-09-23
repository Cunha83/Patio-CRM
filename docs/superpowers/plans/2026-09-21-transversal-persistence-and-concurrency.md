# Correção Transversal de Persistência, Atomicidade HTTP e Matriz de Chamadores Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminar de ponta a ponta falsos sucessos em todas as operações de escrita da API, implementar mutação serializada atômica em fornecedores, estoque, compras, OS e apontamentos, propagar erros explicitamente e entregar a matriz completa de chamadores auditados.

**Architecture:** Adoção universal de `mutateTenantState` com fila canônica interna para mutações de domínio incremental; preservação de controle otimista estrito em snapshots do cliente (`POST /api/estado`); centralização de propagação de erros em `salvarEstado`/`persistTenantState` para impedir silenciamento de falhas; testes de concorrência HTTP reproduzindo e validando persistência pós-reboot.

**Tech Stack:** Node.js, Express, SQLite3, Better-SQLite3, Node Test Runner (`node:test`), agent-browser (Vercel).

**Spec:** `docs/superpowers/specs/2026-09-21-transversal-persistence-and-concurrency-design.md`

## Global Constraints

- Nunca responder HTTP 200 com `{ success: true }` se a persistência falhar ou for rejeitada no SQLite.
- Preservar rigorosamente a base operacional `patio.db` (todos os testes e benchmarks usam `DB_PATH` temporário em `os.tmpdir()`).
- Não usar `force: true` para mascarar conflitos de concorrência fora de regiões serializadas.
- Preservar integridade de RBAC, auditoria e isolamento multi-tenant.
- Cada cadastro confirmado no teste de concorrência deve ser verificado individualmente por ID no `GET` e após reinício do processo.

---

### Task 1: Teste de Regressão HTTP de Fornecedores (`tests/http_concurrency_fornecedores.test.cjs`)

**Files:**
- Create: `tests/http_concurrency_fornecedores.test.cjs`

**Interfaces:**
- Consumes: `POST /api/fornecedores`, `GET /api/fornecedores`, reinicialização de servidor Express com SQLite temporário.
- Produces: Prova automatizada da concorrência de 20 POSTs simultâneos, comparando IDs confirmados no `GET` e após reinício.

- [ ] **Step 1: Criar o teste de concorrência HTTP `tests/http_concurrency_fornecedores.test.cjs`**
Escrever teste que sobe um servidor Express em porta efêmera com banco temporário, dispara 20 requisições simultâneas via `Promise.all` em `POST /api/fornecedores` com nomes e CNPJs distintos, coleta as respostas e confere no `GET /api/fornecedores` e após encerramento e reinício do servidor.

- [ ] **Step 2: Executar o teste na versão atual para comprovar a falha**
Executar: `node --require ./scripts/test-preload.cjs --test tests/http_concurrency_fornecedores.test.cjs`
Esperado: FAIL (20 respostas de sucesso, mas apenas 1 fornecedor persistido).

---

### Task 2: Migração e Atomicidade de Fornecedores e Compras (Procurement)

**Files:**
- Modify: `server.js:3337-3546`
- Test: `tests/http_concurrency_fornecedores.test.cjs`

**Interfaces:**
- Consumes: `mutateTenantState`, `supplierService`, `procurementService`
- Produces: `/api/fornecedores`, `/api/fornecedores/:id`, `/api/compras/cotacoes`, `/api/compras/pedidos` persistindo atomicamente dentro da fila do tenant.

- [ ] **Step 1: Migrar `POST /api/fornecedores` e `PUT /api/fornecedores/:id` para `mutateTenantState`**
Substituir `getOrLoadState` + `salvarEstado` por `await mutateTenantState(req, (draft) => { ... })`. Verificar `saveRes.ok` e retornar status apropriado (200/201 no sucesso, `saveRes.status || 409` no erro).

- [ ] **Step 2: Migrar rotas de Compras (`/api/compras/cotacoes`, `/api/compras/pedidos`, aprovações e recebimentos)**
Migrar `POST /api/compras/cotacoes`, `POST /api/compras/cotacoes/:id/respostas`, `POST /api/compras/pedidos`, `POST /api/compras/pedidos/:id/aprovar`, `POST /api/compras/pedidos/:id/receber`, `POST /api/compras/pedidos/:id/cancelar` para `mutateTenantState`.

- [ ] **Step 3: Executar o teste `tests/http_concurrency_fornecedores.test.cjs`**
Executar: `node --require ./scripts/test-preload.cjs --test tests/http_concurrency_fornecedores.test.cjs`
Esperado: PASS (20 fornecedores criados, 20 listados no GET e 20 preservados após reinício).

---

### Task 3: Migração e Atomicidade de Estoque/Peças, OS e Apontamentos (Labor)

**Files:**
- Modify: `server.js:3224-3323,3549-3588,3619-3790`
- Create: `tests/http_concurrency_domain.test.cjs`

**Interfaces:**
- Consumes: `mutateTenantState`, `inventoryService`, `laborTrackingService`
- Produces: Operações concorrentes de estoque, apontamentos e OS serializadas e atômicas.

- [ ] **Step 1: Migrar rotas de Peças e Estoque para `mutateTenantState`**
Migrar `POST /api/pecas`, `PUT /api/pecas/:id`, `POST /api/pecas/:id/ajustar`, `POST /api/os/:id/pecas/consumir` e `POST /api/os/:id/pecas/devolver`.

- [ ] **Step 2: Migrar rotas de Equipe e Apontamentos para `mutateTenantState`**
Migrar `POST /api/equipe`, `PUT /api/equipe/:id`, `POST /api/apontamentos/iniciar`, `POST /api/apontamentos/:id/pausar`, `POST /api/apontamentos/:id/retomar`, `POST /api/apontamentos/:id/encerrar`, `POST /api/apontamentos/:id/ajustar`.

- [ ] **Step 3: Criar teste `tests/http_concurrency_domain.test.cjs`**
Testar 10 operações concorrentes de estoque (`POST /api/pecas/:id/ajustar`), 10 apontamentos concorrentes (`POST /api/apontamentos/iniciar`) e operações cruzadas no mesmo tenant.

- [ ] **Step 4: Executar os testes de concorrência de domínio**
Executar: `node --require ./scripts/test-preload.cjs --test tests/http_concurrency_domain.test.cjs`
Esperado: PASS com 100% de persistência durável.

---

### Task 4: Migração dos Sub-fluxos Operacionais (Inspeções, Orçamentos, Pré-OS, Triagem, Fotos, Alertas)

**Files:**
- Modify: `server.js:2373-3164,5343-5434`

**Interfaces:**
- Consumes: `mutateTenantState`, `inspectionService`, `quotationService`, `vehicleReconciliation`
- Produces: Atomicidade serializada nos sub-fluxos operacionais.

- [ ] **Step 1: Migrar rotas de OS, fotos e conciliação**
Migrar `POST /api/os/:id/anexar-foto`, `POST /api/veiculos/conciliar`, `POST /api/os/entrada`.

- [ ] **Step 2: Migrar rotas de Pré-OS e Intake**
Migrar `POST /api/pre-os/triagem`, `POST /api/pre-os/:id/converter`, `POST /api/pre-os/:id/cancelar`, `POST /api/intake/*`.

- [ ] **Step 3: Migrar rotas de Inspeções e Orçamentos**
Migrar `POST /api/inspecoes/*`, `POST /api/orcamentos/*`.

- [ ] **Step 4: Migrar rotas de Alertas Operacionais**
Migrar `POST /api/operacao/alertas/:id/reconhecer` e `POST /api/operacao/avaliar`.

---

### Task 5: Centralização de Erros em `salvarEstado` e Entrega da Matriz de Chamadores

**Files:**
- Modify: `server.js:192-212`
- Create: `docs/evidencias/MATRIZ_CHAMADORES_PERSISTENCIA_2026-09-21.md`

**Interfaces:**
- Produces: `salvarEstado` que propaga erro explicitamente se `!saveRes.ok`; matriz completa dos 97 chamadores auditados com rota, tipo, estratégia de concorrência e tratamento de erro.

- [ ] **Step 1: Ajustar `salvarEstado` e `persistTenantState` para assegurar retorno de erro explícito**
Garantir que se `persistState` retornar `{ ok: false }`, o chamador receba esse objeto sem qualquer silenciamento. Se chamado sem verificação em rotas legadas, garantir que erros de persistência gerem resposta HTTP com código de erro correspondente (`409` ou `500`).

- [ ] **Step 2: Escrever a Matriz Completa dos Chamadores Auditados**
Criar `docs/evidencias/MATRIZ_CHAMADORES_PERSISTENCIA_2026-09-21.md` listando cada um dos 97 chamadores encontrados, categorizados por domínio, estratégia e validação.

---

### Task 6: Atualização do Benchmark HTTP Real com Validação de IDs Persistidos

**Files:**
- Modify: `scripts/pilot_http_benchmark.cjs`
- Output: `docs/evidencias/benchmark_piloto_http_2026-09-21.json`

**Interfaces:**
- Consumes: Servidor Express em porta efêmera.
- Produces: Benchmark com verificação de integridade no banco de dados para todos os IDs criados.

- [ ] **Step 1: Atualizar `scripts/pilot_http_benchmark.cjs`**
Adicionar verificação de IDs gravados no banco SQLite após a execução do lote de escritas, comprovando que 100% dos IDs retornados nas respostas existem no banco de dados.

- [ ] **Step 2: Executar o benchmark HTTP real**
Executar: `node scripts/pilot_http_benchmark.cjs`
Esperado: 100% de persistência comprovada no banco.

---

### Task 7: Validação no Navegador (`agent-browser`), Suíte Completa e Relatórios Finais

**Files:**
- Modify: `docs/evidencias/RELATORIO_ESTABILIZACAO_PILOTO_2026-09-21.md`
- Modify: `walkthrough.md`

**Interfaces:**
- Consumes: `agent-browser`, `tests/*.test.cjs`
- Produces: Homologação no navegador aprovada, suíte de 514+ testes passando, relatórios atualizados com evidências reais.

- [ ] **Step 1: Executar validação no navegador com `agent-browser`**
Executar: `node scripts/run_agent_browser_verified.cjs`
Esperado: 6 jornadas aprovadas com código 0.

- [ ] **Step 2: Executar a suíte completa de testes**
Executar: `node --require ./scripts/test-preload.cjs --test --test-concurrency=2 --test-timeout=120000 tests/*.test.cjs`
Esperado: 100% de aprovação (zero falhas).

- [ ] **Step 3: Atualizar Relatório e Walkthrough**
Atualizar `docs/evidencias/RELATORIO_ESTABILIZACAO_PILOTO_2026-09-21.md` e `walkthrough.md`.
