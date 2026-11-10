# Sprint 5.2 — Conversão de Demanda Reprimida em Nova OS, Fila Ativa de Follow-up & Governança de Orçamento por Centro de Custo B2B

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar o motor de conversão de demandas reprimidas geradas no CRM em novas Ordens de Serviço (total ou parcial) com reserva atômica de estoque, fila priorizada de follow-up com semáforo temporal (vencida/hoje/futura) e histórico de contatos, e governança de orçamento mensal (budget) por Centro de Custo B2B com cálculo de consumo (faturado + comprometido) e bloqueio de alçada configurável.

**Architecture:**
- `services/crm/opportunityConversionService.js` (NOVO, <= 320 linhas): Fila priorizada de follow-up (`vencida`, `hoje`, `futura`), histórico e reagendamento de follow-ups, conversão total ou parcial de oportunidades em novas OSs com verificação e reserva atômica de peças via `inventoryReservationService` e controle de rollback caso o saldo disponível seja insuficiente (`INSUFFICIENT_STOCK`).
- `services/crm/fleetCostCenterService.js` (EVOLUÇÃO, <= 340 linhas): Adição de governança orçamentária (`definirOrcamentoCentroCusto` e `calcularConsumoOrcamentoCentroCusto`), calculando valores faturados, comprometidos, saldo disponível e status (`normal`, `alerta`, `estourado`), integrado ao bloqueio de alçada (`COST_CENTER_BUDGET_EXCEEDED`) com suporte a override.
- Endpoints REST em `routes/crm_manutencao_oportunidades.routes.js` (<= 330 linhas) e `routes/crm_clientes_frotas.routes.js` (<= 310 linhas).
- UI modular em `js/modules/crm_conversao_oportunidades_ui.js` (NOVO, <= 320 linhas) integrada ao `index.html` e a delegações curtas em `js/modules/events_patio_os.js`.

**Tech Stack:** Node.js (test runner nativo `node:test`), Express, JavaScript (ES6+ modular), SHA-256 Release Manifest.

---

## Global Constraints

- Teto modular estrito: nenhum arquivo novo ou modificado pode ultrapassar 350 linhas (`tests/modular_file_size_gate.test.cjs`).
- Zero cliques mortos na UI (`tests/ui_actions_and_bindings_audit.test.cjs`).
- Isolamento absoluto de `data/database.json` em todas as suítes de testes (`git status --porcelain data/database.json` deve retornar vazio).
- Manifesto SHA-256 íntegro (`node scripts/gerar_manifesto_release.cjs` e `tests/clean_install_manifest.test.cjs`).
- 100% dos testes passando (`npm test` com 0 falhas).

---

## Review Focus

1. **Ordenação e Semáforo da Fila de Follow-up:** Assegurar que oportunidades vencidas venham primeiro, seguidas pelas que vencem hoje e pelas futuras, desempatando por criticidade técnica (`alta` > `media` > `baixa`) e maior valor total estimado.
2. **Conversão Seletiva vs. Total:** Ao converter apenas parte dos itens da oportunidade, os itens selecionados devem gerar a nova OS e os itens não selecionados devem permanecer em oportunidade residual aberta (ou oportunidade atualizada com saldo de itens pendentes); ao converter tudo, a oportunidade deve ser marcada como `'convertida'`, impedindo dupla conversão.
3. **Reserva Atômica e Rollback no Estoque:** Se qualquer peça da oportunidade não possuir saldo disponível no momento da conversão, a operação deve abortar lançando `INSUFFICIENT_STOCK` sem criar OS órfã e sem reter reservas parciais sujas.
4. **Cálculo de Consumo de Budget e Bloqueio de Alçada:** O cálculo do orçamento do Centro de Custo deve somar com precisão as OSs faturadas mais as OSs em andamento/aprovadas da competência (`YYYY-MM`). Se `bloquearEstouro === true` e o limite for excedido, a conversão deve rejeitar com `COST_CENTER_BUDGET_EXCEEDED` a menos que `autorizarEstouroAlcada: true` seja explicitamente passado.
5. **Preservação dos Tetos Modulares:** `orcamento_parcial_ui.js` (339 linhas), `fleetBorderoService.js` (341 linhas) e `events_patio_os.js` (304 linhas) não devem sofrer acréscimos volumosos.

---

### Task 1: Motor de Conversão de Demanda e Fila de Follow-up (`services/crm/opportunityConversionService.js`)

**Files:**
- Create: `services/crm/opportunityConversionService.js`
- Test: `tests/sprint52_opportunity_conversion_cost_budget.test.cjs`

**Interfaces:**
- Consumes: `state.opportunities`, `state.os`, `state.pecas`, `state.partReservations`, `state.inventoryMovements`
- Produces: `listarFilaFollowUpDemandaReprimida`, `registrarFollowUpOportunidade`, `converterOportunidadeEmOS`

- [ ] **Step 1.1:** Criar teste inicial em `tests/sprint52_opportunity_conversion_cost_budget.test.cjs` cobrindo listagem ordenada da fila de follow-up com semáforo (`vencida`, `hoje`, `futura`), registro de interações com reagendamento e arquivamento por perda.
- [ ] **Step 1.2:** Executar teste e validar falha (RED).
- [ ] **Step 1.3:** Implementar `listarFilaFollowUpDemandaReprimida` e `registrarFollowUpOportunidade` em `services/crm/opportunityConversionService.js` (<= 320 linhas).
- [ ] **Step 1.4:** Executar teste e validar aprovação (GREEN).

---

### Task 2: Conversão Total/Parcial em OS com Reserva Atômica e Rollback

**Files:**
- Modify: `services/crm/opportunityConversionService.js`
- Test: `tests/sprint52_opportunity_conversion_cost_budget.test.cjs`

**Interfaces:**
- Consumes: `services/inventory/inventoryReservationService.js`
- Produces: `converterOportunidadeEmOS`

- [ ] **Step 2.1:** Adicionar casos de teste para conversão total (status `'convertida'`, `osGeradaId`), conversão parcial (itens pendentes mantidos), bloqueio de dupla conversão e erro `INSUFFICIENT_STOCK` com rollback atômico caso falte estoque de peças.
- [ ] **Step 2.2:** Executar teste e validar falha (RED).
- [ ] **Step 2.3:** Implementar `converterOportunidadeEmOS` em `services/crm/opportunityConversionService.js` com criação atômica da OS em `state.os`, verificação rigorosa de saldo disponível e reversão limpa em caso de erro.
- [ ] **Step 2.4:** Executar teste e validar aprovação (GREEN).

---

### Task 3: Limite Orçamentário (Budget Mensal) e Alçada por Centro de Custo

**Files:**
- Modify: `services/crm/fleetCostCenterService.js`
- Modify: `services/crm/opportunityConversionService.js`
- Test: `tests/sprint52_opportunity_conversion_cost_budget.test.cjs`

**Interfaces:**
- Consumes: `state.costCenters`, `state.clientes`, `state.os`
- Produces: `definirOrcamentoCentroCusto`, `calcularConsumoOrcamentoCentroCusto`, integração de bloqueio `COST_CENTER_BUDGET_EXCEEDED` em `converterOportunidadeEmOS`

- [ ] **Step 3.1:** Adicionar casos de teste para configuração de limite mensal, cálculo de consumo (faturado + comprometido na competência `YYYY-MM`), status (`normal`, `alerta`, `estourado`), bloqueio com erro `COST_CENTER_BUDGET_EXCEEDED` e liberação via `autorizarEstouroAlcada`.
- [ ] **Step 3.2:** Executar teste e validar falha (RED).
- [ ] **Step 3.3:** Implementar `definirOrcamentoCentroCusto` e `calcularConsumoOrcamentoCentroCusto` em `services/crm/fleetCostCenterService.js` (mantendo <= 340 linhas) e conectar a validação em `converterOportunidadeEmOS`.
- [ ] **Step 3.4:** Executar teste e validar aprovação (GREEN).

---

### Task 4: Endpoints REST da Sprint 5.2

**Files:**
- Modify: `routes/crm_manutencao_oportunidades.routes.js`
- Modify: `routes/crm_clientes_frotas.routes.js`
- Test: `tests/sprint52_opportunity_conversion_cost_budget.test.cjs`

**Interfaces:**
- `GET /api/crm/oportunidades-adiadas/fila-followup`
- `POST /api/crm/oportunidades-adiadas/:id/follow-up`
- `POST /api/crm/oportunidades-adiadas/:id/converter-os`
- `PATCH /api/clientes/:id/centros-custo/:ccId/orcamento`
- `GET /api/clientes/:id/centros-custo/:ccId/consumo`

- [ ] **Step 4.1:** Adicionar casos de teste de integração HTTP para os 5 novos endpoints REST.
- [ ] **Step 4.2:** Executar teste e validar falha (RED).
- [ ] **Step 4.3:** Implementar as rotas em `routes/crm_manutencao_oportunidades.routes.js` e `routes/crm_clientes_frotas.routes.js`, mantendo cada arquivo <= 350 linhas.
- [ ] **Step 4.4:** Executar teste e validar aprovação (GREEN).

---

### Task 5: Interface de Usuário & Delegação de Eventos

**Files:**
- Create: `js/modules/crm_conversao_oportunidades_ui.js`
- Modify: `index.html`
- Modify: `js/modules/events_patio_os.js`
- Test: `tests/sprint52_opportunity_conversion_cost_budget.test.cjs`
- Test: `tests/ui_actions_and_bindings_audit.test.cjs`

- [ ] **Step 5.1:** Criar `js/modules/crm_conversao_oportunidades_ui.js` (<= 320 linhas) com:
  - `renderFilaFollowUpHtml(fila, resumo)`
  - `modalConverterOportunidadeHtml(oportunidade, centrosCusto, consumoCC)`
  - `modalRegistrarFollowUpHtml(oportunidade)`
  - `abrirModalConverterOportunidade(oportunidadeId)`
  - `confirmarConversaoOportunidade(oportunidadeId)`
  - `abrirModalRegistrarFollowUp(oportunidadeId)`
  - `confirmarRegistroFollowUp(oportunidadeId)`
- [ ] **Step 5.2:** Registrar script em `index.html`.
- [ ] **Step 5.3:** Delegar ações em `js/modules/events_patio_os.js` (`converter-oportunidade-os`, `registrar-followup-oportunidade`, `salvar-orcamento-centro-custo`) mantendo <= 350 linhas.
- [ ] **Step 5.4:** Adicionar testes de UI em `tests/sprint52_opportunity_conversion_cost_budget.test.cjs` e rodar `tests/ui_actions_and_bindings_audit.test.cjs`.

---

### Task 6: Validação Geral de Quality Gates, Manifesto e Fechamento

**Files:**
- Modify: `docs/operacao/manifesto_release.json`
- Modify: `docs/operacao/MANIFESTO_RELEASE_PILOTO_2026-09-21.md`

- [ ] **Step 6.1:** Executar `node --test tests/modular_file_size_gate.test.cjs` (garantir 0 arquivos > 350 linhas).
- [ ] **Step 6.2:** Executar `node --require ./scripts/test-preload.cjs --test tests/ui_actions_and_bindings_audit.test.cjs` (garantir 0 dead clicks).
- [ ] **Step 6.3:** Limpar artefatos transitórios de teste, regenerar manifesto (`node scripts/gerar_manifesto_release.cjs`) e validar com `node --require ./scripts/test-preload.cjs --test tests/clean_install_manifest.test.cjs`.
- [ ] **Step 6.4:** Checar isolamento de `data/database.json` (`git status --porcelain data/database.json` vazio).
- [ ] **Step 6.5:** Executar a suíte completa `npm test` (esperado: >= 817 testes passando, 0 falhas).
- [ ] **Step 6.6:** Atualizar ledger, fazer commit semântico `feat(crm): Sprint 5.2 - Conversao de Demanda Reprimida em OS, Fila de Follow-up e Budget de Centros de Custo` e push para `origin main`.

