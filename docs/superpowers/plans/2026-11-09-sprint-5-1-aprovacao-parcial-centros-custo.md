# Sprint 5.1 — Aprovação Parcial de Orçamentos com Conversão em CRM & Gestão de Centros de Custo B2B

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar o fluxo de aprovação parcial de ordens de serviço/orçamentos com recálculo financeiro e liberação atômica de reservas de estoque para itens não aprovados, conversão automática dos itens adiados/recusados em oportunidades no CRM (`state.opportunities`) com criticidade e agendamento de follow-up, e hierarquia de Centros de Custo para grandes frotistas com integração analítica no fechamento de borderô B2B.

**Architecture:**
- `services/quotation/partialApprovalService.js` (<= 300 linhas): Lógica de aprovação seletiva de itens de serviço e peças, desvinculação/estorno de reservas no inventário, recálculo de totais da OS e criação de oportunidade comercial em `state.opportunities`.
- `services/crm/fleetCostCenterService.js` (<= 280 linhas): CRUD de Centros de Custo em `cliente.centrosCusto`, vinculação a veículos e OSs, e agrupamento/totalização analítica do Borderô de Frotas.
- Integração no motor de faturamento (`services/billing/fleetBorderoCalc.js` e `fleetBorderoService.js`) com discriminação por Centro de Custo.
- Endpoints REST em `routes/os.routes.js`, `routes/crm_manutencao_oportunidades.routes.js` e `routes/crm_clientes_frotas.routes.js`.
- UI modular em `js/modules/orcamento_parcial_ui.js` (<= 320 linhas) integrada ao `index.html` e aos listeners DOM.

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

1. **Ajuste de Reserva de Estoque na Recusa/Adiamento:** Garantir que quando uma peça da OS for recusada ou adiada, qualquer reserva ativa vinculada a ela seja cancelada em `state.partReservations` e registrada em `state.inventoryMovements` (`liberacao_reserva`), recompondo o saldo disponível.
2. **Recálculo Fiel dos Totais da OS:** Os totais da OS (`totalServicos`, `totalPecas`, `total`, `valorTotal`) devem considerar estritamente os itens com status aprovado.
3. **Conversão Precisa em CRM:** Itens adiados ou recusados devem gerar registro em `state.opportunities` com placa, veículo, cliente, itens segregados, valor total estimado, criticidade técnica máxima (`alta` > `media` > `baixa`) e data prevista de follow-up (D+15 para alta, D+30 para média, D+45 para baixa).
4. **Agrupamento de Centros de Custo no Borderô:** Garantir que o espelho analítico de faturamento consolide subtotais de mão de obra e peças segregados por Centro de Custo da transportadora.
5. **Permissões RBAC e Idempotência:** Assegurar que os endpoints exijam permissões adequadas (`os:manage`, `crm:read`, `crm:manage`) e tratem erros com códigos HTTP semânticos (400, 404, 403).

---

### Task 1: Motor de Aprovação Parcial de Orçamentos & Captura de Demanda no CRM (`services/quotation/partialApprovalService.js`)

**Files:**
- Create: `services/quotation/partialApprovalService.js`
- Test: `tests/sprint51_partial_approval_cost_center.test.cjs`

**Interfaces:**
- Consumes: `state.os`, `state.partReservations`, `state.inventoryMovements`, `state.opportunities`
- Produces: `processarAprovacaoParcial`, `listarOportunidadesAdiadas`, `recalcularTotaisOS`

- [ ] **Step 1.1:** Criar teste inicial em `tests/sprint51_partial_approval_cost_center.test.cjs` testando aprovação seletiva de peças e serviços, estorno de reserva de peças adiadas, recálculo financeiro e criação de oportunidade comercial em `state.opportunities`.
- [ ] **Step 1.2:** Executar teste e validar falha (RED).
- [ ] **Step 1.3:** Implementar `services/quotation/partialApprovalService.js` (<= 300 linhas) com:
  - `processarAprovacaoParcial({ tenantId, state, osId, itens, actorId, observacoes, prazoFollowUpDias })`
  - `recalcularTotaisOS(os)`
  - `listarOportunidadesAdiadas({ tenantId, state, clienteId, placa, criticidade })`
- [ ] **Step 1.4:** Executar teste e validar aprovação (GREEN).

---

### Task 2: Gestão de Centros de Custo B2B & Agrupamento no Borderô (`services/crm/fleetCostCenterService.js`)

**Files:**
- Create: `services/crm/fleetCostCenterService.js`
- Modify: `services/billing/fleetBorderoCalc.js`
- Modify: `services/billing/fleetBorderoService.js`
- Test: `tests/sprint51_partial_approval_cost_center.test.cjs`

**Interfaces:**
- Consumes: `state.clientes`, `state.veiculos`, `state.os`
- Produces: `cadastrarCentroCusto`, `listarCentrosCustoPorCliente`, `atualizarCentroCusto`, `vincularCentroCustoVeiculo`, `vincularCentroCustoOS`, `agruparBorderoPorCentroCusto`

- [ ] **Step 2.1:** Adicionar casos de teste para cadastro de Centros de Custo por cliente, vinculação a veículo/OS, e consolidação agrupada no espelho de Borderô.
- [ ] **Step 2.2:** Executar teste e validar falha (RED).
- [ ] **Step 2.3:** Implementar `services/crm/fleetCostCenterService.js` (<= 280 linhas) com CRUD e agrupamento contábil.
- [ ] **Step 2.4:** Atualizar `services/billing/fleetBorderoCalc.js` e `services/billing/fleetBorderoService.js` para propagar `centroCustoId` e suportar agrupamento e filtro por Centro de Custo.
- [ ] **Step 2.5:** Executar teste e validar aprovação (GREEN).

---

### Task 3: Endpoints REST da Sprint 5.1

**Files:**
- Modify: `routes/os.routes.js`
- Modify: `routes/crm_manutencao_oportunidades.routes.js`
- Modify: `routes/crm_clientes_frotas.routes.js`
- Test: `tests/sprint51_partial_approval_cost_center.test.cjs`

**Interfaces:**
- `POST /api/os/:id/aprovacao-parcial`
- `GET /api/crm/oportunidades-adiadas`
- `POST /api/clientes/:id/centros-custo`
- `GET /api/clientes/:id/centros-custo`

- [ ] **Step 3.1:** Adicionar casos de teste de integração HTTP para os 4 endpoints REST.
- [ ] **Step 3.2:** Executar teste e validar falha (RED).
- [ ] **Step 3.3:** Implementar as rotas em `routes/os.routes.js`, `routes/crm_manutencao_oportunidades.routes.js` e `routes/crm_clientes_frotas.routes.js`, garantindo que nenhum arquivo exceda 350 linhas.
- [ ] **Step 3.4:** Executar teste e validar aprovação (GREEN).

---

### Task 4: Interface de Usuário & Delegação de Eventos (`js/modules/orcamento_parcial_ui.js`)

**Files:**
- Create: `js/modules/orcamento_parcial_ui.js`
- Modify: `index.html`
- Modify: `js/modules/events_patio_os.js`
- Test: `tests/ui_actions_and_bindings_audit.test.cjs`

- [ ] **Step 4.1:** Implementar `js/modules/orcamento_parcial_ui.js` (<= 320 linhas) com funções:
  - `abrirModalAprovacaoParcial(osId)`
  - `renderizarItensAprovacaoParcial(os)`
  - `atualizarResumoAprovacaoParcial()`
  - `confirmarAprovacaoParcial(osId)`
  - `renderizarSeletorCentroCusto(clienteId, osId)`
  - `carregarOportunidadesAdiadas()`
- [ ] **Step 4.2:** Incluir `<script src="js/modules/orcamento_parcial_ui.js"></script>` em `index.html`.
- [ ] **Step 4.3:** Vincular ações no escopo global (`window.abrirModalAprovacaoParcial`, etc.) e delegar eventos em `js/modules/events_patio_os.js`.
- [ ] **Step 4.4:** Executar `node --require ./scripts/test-preload.cjs --test tests/ui_actions_and_bindings_audit.test.cjs` e validar zero cliques mortos.

---

### Task 5: Validação Geral de Quality Gates, Manifesto e Fechamento

**Files:**
- Modify: `tests/modular_file_size_gate.test.cjs`
- Modify: `docs/operacao/manifesto_release.json`
- Modify: `docs/operacao/MANIFESTO_RELEASE_PILOTO_2026-09-21.md`

- [ ] **Step 5.1:** Atualizar `tests/modular_file_size_gate.test.cjs` para incluir os novos arquivos e executar `node --test tests/modular_file_size_gate.test.cjs`.
- [ ] **Step 5.2:** Executar auditoria de ações de UI: `node --require ./scripts/test-preload.cjs --test tests/ui_actions_and_bindings_audit.test.cjs`.
- [ ] **Step 5.3:** Regenerar manifesto com `node scripts/gerar_manifesto_release.cjs` e executar `node --require ./scripts/test-preload.cjs --test tests/clean_install_manifest.test.cjs`.
- [ ] **Step 5.4:** Verificar isolamento de `data/database.json` (`git status --porcelain data/database.json` vazio).
- [ ] **Step 5.5:** Executar a suíte completa de testes: `npm test` (esperado: >= 815 testes verdes, 0 falhas).
- [ ] **Step 5.6:** Criar commit da Sprint 5.1 e realizar push para `origin main`.

