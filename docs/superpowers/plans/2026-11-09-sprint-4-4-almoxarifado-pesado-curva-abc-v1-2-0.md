# Sprint 4.4 — Almoxarifado de Linha Pesada (Rastreabilidade de Lotes, Reserva Atômica e Curva ABC) + Fechamento da Release v1.2.0

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar o almoxarifado de alta performance para linha pesada com rastreabilidade de lotes (recall/garantia), reserva atômica por OS (saldo físico vs. reservado vs. disponível), motor de Curva ABC dinâmica com ponto de pedido automático, endpoints de API e integração frontend com fechamento e bump para a release **v1.2.0**.

**Architecture:** Módulos de domínio dedicados em `services/inventory/` (`inventoryBatchService.js`, `inventoryReservationService.js`, `inventoryAbcEngine.js`), agregados no facade `services/inventoryService.js`, expostos via `routes/inventory_heavy.routes.js` e integrados na UI compacta em `js/modules/estoque_pesado_ui.js`. Cada arquivo estritamente $\le 350$ linhas.

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

1. **Rastreio reverso de lotes em recall:** Garantir que ao buscar um lote, todas as OSs (com número, placa, modelo do caminhão e cliente) que consumiram peças daquele lote sejam retornadas com precisão.
2. **Alocação FIFO (PEPS):** Na ausência de lote explícito, o consumo de peças deve debitar dos lotes mais antigos com saldo positivo primeiro.
3. **Integridade da Reserva Atômica:** Não permitir reservar quantidade maior do que o `saldoDisponivel` (`saldoFisico - saldoReservado`).
4. **Baixa e Liberação de Reserva:** A baixa definitiva deve abater físico e reservado na conclusão da OS; o cancelamento deve estornar a reserva sem afetar o físico.
5. **Matemática da Curva ABC:** Classificação precisa de Pareto 80/15/5 e cálculo de ponto de pedido com proteção contra divisão por zero para itens novos.

---

### Task 1: Rastreabilidade de Lotes e Fornecedores (`services/inventory/inventoryBatchService.js`)

**Files:**
- Create: `services/inventory/inventoryBatchService.js`
- Modify: `services/inventoryService.js`
- Test: `tests/heavyInventorySprint44.test.cjs`

- [x] **Step 1.1:** Criar teste inicial em `tests/heavyInventorySprint44.test.cjs` testando entrada de lotes, alocação FIFO e rastreamento reverso de placas por código de lote.
- [x] **Step 1.2:** Executar teste e validar falha (RED).
- [x] **Step 1.3:** Implementar `services/inventory/inventoryBatchService.js` (<= 300 linhas) com `registrarEntradaLote`, `alocarLoteConsumo`, `rastrearLote` e `listarLotesPorPeca`.
- [x] **Step 1.4:** Exportar novos métodos no facade `services/inventoryService.js`.
- [x] **Step 1.5:** Executar teste e validar aprovação (GREEN).

---

### Task 2: Reserva Atômica de Peças por OS (`services/inventory/inventoryReservationService.js`)

**Files:**
- Create: `services/inventory/inventoryReservationService.js`
- Modify: `services/inventoryService.js`
- Test: `tests/heavyInventorySprint44.test.cjs`

- [x] **Step 2.1:** Adicionar casos de teste para `reservarPecasOS`, `efetivarBaixaOS`, `liberarReservaOS` e `obterSaldosDetalhados`.
- [x] **Step 2.2:** Executar teste e validar falha (RED).
- [x] **Step 2.3:** Implementar `services/inventory/inventoryReservationService.js` (<= 320 linhas) com controle estrito de `saldoFisico`, `saldoReservado` e `saldoDisponivel`, impedindo overbooking e integrando baixa definitiva com alocação de lotes.
- [x] **Step 2.4:** Exportar métodos no facade `services/inventoryService.js`.
- [x] **Step 2.5:** Executar teste e validar aprovação (GREEN).

---

### Task 3: Curva ABC Dinâmica e Ponto de Pedido (`services/inventory/inventoryAbcEngine.js`)

**Files:**
- Create: `services/inventory/inventoryAbcEngine.js`
- Modify: `services/inventoryService.js`
- Test: `tests/heavyInventorySprint44.test.cjs`

- [x] **Step 3.1:** Adicionar casos de teste para classificação da Curva ABC (A: 80%, B: 15%, C: 5%), cálculo de CMD, estoque de segurança e sugestões de compra para itens abaixo do ponto de pedido.
- [x] **Step 3.2:** Executar teste e validar falha (RED).
- [x] **Step 3.3:** Implementar `services/inventory/inventoryAbcEngine.js` (<= 300 linhas) com `calcularCurvaABC` e `obterSugestoesReposicao`.
- [x] **Step 3.4:** Exportar métodos no facade `services/inventoryService.js`.
- [x] **Step 3.5:** Executar teste e validar aprovação (GREEN).

---

### Task 4: Rotas de API Backend (`routes/inventory_heavy.routes.js`)

**Files:**
- Create: `routes/inventory_heavy.routes.js`
- Modify: `routes/inventory.routes.js`
- Test: `tests/heavyInventorySprint44.test.cjs`

- [x] **Step 4.1:** Adicionar casos de teste HTTP E2E para `/api/estoque/lotes/entrada`, `/api/estoque/lotes/rastreio/:loteCodigo`, `/api/estoque/curva-abc` e `/api/estoque/reservas/sincronizar`.
- [x] **Step 4.2:** Executar teste e validar falha (RED).
- [x] **Step 4.3:** Implementar `routes/inventory_heavy.routes.js` (<= 250 linhas) com autenticação RBAC e persistência atômica via `mutateTenantState`.
- [x] **Step 4.4:** Montar o novo roteador em `routes/inventory.routes.js`.
- [x] **Step 4.5:** Executar teste e validar aprovação (GREEN).

---

### Task 5: Camada de Apresentação Frontend (`js/modules/estoque_pesado_ui.js`)

**Files:**
- Create: `js/modules/estoque_pesado_ui.js`
- Modify: `index.html`
- Modify: `js/modules/events_estoque_compras.js`
- Test: `tests/heavyInventorySprint44.test.cjs` e `tests/ui_actions_and_bindings_audit.test.cjs`

- [x] **Step 5.1:** Adicionar testes de interface para renderização dos badges Classe A/B/C, visualização de disponível vs. reservado e modais de rastreio de lote.
- [x] **Step 5.2:** Executar teste e validar falha (RED).
- [x] **Step 5.3:** Implementar `js/modules/estoque_pesado_ui.js` (<= 280 linhas) com indicadores de curva ABC, saldos triplos (Físico/Reservado/Disponível) e modais de rastreabilidade.
- [x] **Step 5.4:** Registrar script em `index.html` e delegar eventos em `events_estoque_compras.js`.
- [x] **Step 5.5:** Executar auditoria de botões (`tests/ui_actions_and_bindings_audit.test.cjs`) e validar zero dead clicks (GREEN).

---

### Task 6: Fechamento da Release v1.2.0, Quality Gates e Git Tag

**Files:**
- Modify: `package.json` (version -> `1.2.0`)
- Modify: `package-lock.json`
- Modify: `index.html` (referências de versão)
- Update: `docs/operacao/manifesto_release.json` (via script)

- [x] **Step 6.1:** Atualizar versão para `1.2.0` em `package.json`, `package-lock.json` e `index.html`.
- [x] **Step 6.2:** Executar gate de tamanho modular (`tests/modular_file_size_gate.test.cjs`) e validar que 100% dos arquivos respeitam <= 350 linhas.
- [x] **Step 6.3:** Regenerar manifesto SHA-256 (`node scripts/gerar_manifesto_release.cjs`) e validar instalação limpa (`tests/clean_install_manifest.test.cjs`).
- [x] **Step 6.4:** Confirmar isolamento absoluto de `data/database.json`.
- [x] **Step 6.5:** Executar suíte completa de testes (`npm test`) com 100% de sucesso.
- [ ] **Step 6.6:** Comitar, criar tag `v1.2.0` e enviar push para `origin main --tags`.

