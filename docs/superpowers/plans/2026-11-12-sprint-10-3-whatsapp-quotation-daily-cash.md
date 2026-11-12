# Sprint 10.3 Implementation Plan: WhatsApp Technical Quotation Skill & Daily Cash Register Closing

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the AI Technical Quotator Skill for WhatsApp (quick suspension quotes, inventory lookup, margin floor protection by CMP, customer credit restriction, and OS conversion with inventory reservations) and the Automated Daily Cash Register Closing Engine with discrepancy auditing and SHA-256 cryptographic proof.

**Architecture:** 
- Modular domain decomposition following Facade / Re-Export pattern.
- Every file strictly $\le 350$ lines (new files target $\le 270$ lines).
- Customer credit check centralized on `clienteId` via `fleetDelinquencyGuardService`.
- TDD cycle with falsifiable Red-Green-Refactor tests and zero regression on existing 923 tests.

**Tech Stack:** Node.js native test runner (`node:test`, `node:assert/strict`), Vanilla JavaScript ES6/CommonJS, Express REST routing, SHA-256 via `node:crypto`.

---

## Global Constraints

- 100% of files in `services/`, `routes/`, `js/modules/`, `css/` must be $\le 350$ lines.
- `services/whatsapp/whatsappAgentSkillsService.js` must remain $\le 200$ lines (currently 99 lines).
- `js/modules/events_patio_os.js` must remain strictly untouched (333 lines); delegated click listeners must be in `js/modules/whatsapp_orcamentista_caixa_actions.js`.
- Zero database mutations during tests (`data/database.json` unchanged).
- Verification before completion: all gates, clean install manifest, and full test suite must pass with 0 failures.

---

## Review Focus

1. **CMP Protection Edge Case:** If a part in stock has sale price R$ 400, but recent purchase raised its CMP to R$ 350, with 35% minimum markup the floor is R$ 472.50. The quoted price must be R$ 472.50 with `ajusteMargemCMPAtivado: true`.
2. **Customer Credit Restriction:** Inadimplent customer (`clienteId`) gets `condicaoPagamentoPermitida: 'somente_a_vista_pix'`. OS conversion attempts without `autorizarOverrideCreditoCliente: true` must be blocked with `CLIENT_CREDIT_BLOCKED_FOR_QUOTATION` (422).
3. **Cash Closing Discrepancy Justification:** Any difference between physical money/receipts entered and expected entries ($|\text{divergência}| > 0.01$) without non-empty `justificativaDivergencia` must be rejected with `CASH_DISCREPANCY_JUSTIFICATION_REQUIRED` (400).
4. **Double Closing Prevention:** Attempting to close the same `dataCaixa` twice must be rejected with `CASH_REGISTER_ALREADY_CLOSED` (409).
5. **No Double Counting in Daily Cash:** Settlements that already cascade into OS payments or receivable titles must not be double counted.

---

## Tasks

### Task 1: TDD Red Phase — Comprehensive Test Suite for Sprint 10.3
- [ ] Create `tests/sprint103_whatsapp_quotation_skill_daily_cash.test.cjs` ($\le 350$ lines) covering:
  - Test 1: AI Technical Quotation Skill & CMP Margin Floor Protection + Inventory Availability check.
  - Test 2: OS Conversion with Part Reservations & Customer Credit Lock (`CLIENT_CREDIT_BLOCKED_FOR_QUOTATION`).
  - Test 3: Daily Cash Register Previa, Settled Inflow/Outflow Breakdown and Deduplication.
  - Test 4: Daily Cash Register Closing with Discrepancy Auditing, SHA-256 Hash and Re-closing 409 Lockout.
  - Test 5: REST Routes, UI Components Rendering, and DOM Delegated Actions Audit.
- [ ] Run test suite to verify initial RED state (modules not found / not implemented yet).

### Task 2: Service `services/whatsapp/whatsappTechnicalQuotationSkill.js`
- [ ] Implement `gerarPreOrcamentoRapidoSuspensao(state, payload)` with CMP floor, inventory checks and customer delinquency evaluation.
- [ ] Implement `converterPreOrcamentoWhatsAppEmOS(state, preOrcamentoId, options)` with credit lock validation, OS generation, part reservations and optional B2B portal token.
- [ ] Implement `executarSkillOrcamentistaTecnicoWhatsApp(state, payload)` entrypoint.
- [ ] Verify line count $\le 270$ lines.

### Task 3: Service `services/finance/dailyCashRegisterClosingService.js`
- [ ] Implement `apurarPreviaFechamentoCaixaDiario(state, options)` calculating inflows by payment method (PIX, BOLETO, TRANSFERENCIA, CARTAO, DINHEIRO), outflows, and net balances.
- [ ] Implement `fecharCaixaDiarioComAuditoria(state, payload)` with discrepancy audit requirement, SHA-256 tamper-proof hash generation, and duplicate day protection.
- [ ] Implement `gerarRelatorioFechamentoCaixaWhatsApp(state, options)` for executive WhatsApp briefing.
- [ ] Verify line count $\le 270$ lines.

### Task 4: WhatsApp Routing Integration & Facade Update
- [ ] Update `services/whatsapp/whatsappAgentSkillsService.js` to recognize `'SKILL_ORCAMENTISTA_TECNICO'` on quotation intents and re-export the new quotation functions.
- [ ] Maintain `services/whatsapp/whatsappAgentSkillsService.js` $\le 200$ lines.

### Task 5: REST Routes `routes/whatsapp_orcamentista_caixa.routes.js` & `routes/index.js`
- [ ] Create `routes/whatsapp_orcamentista_caixa.routes.js` ($\le 220$ lines) implementing the 5 specified endpoints:
  - `POST /api/whatsapp/agente/orcamentista-tecnico`
  - `POST /api/whatsapp/agente/pre-orcamentos/:id/converter-os`
  - `GET /api/financeiro/caixa-diario/previa`
  - `POST /api/financeiro/caixa-diario/fechar`
  - `POST /api/financeiro/caixa-diario/relatorio-whatsapp`
- [ ] Mount route in `routes/index.js`.

### Task 6: UI Components & Actions (`js/modules/whatsapp_orcamentista_caixa_ui.js` & `actions.js`)
- [ ] Create `js/modules/whatsapp_orcamentista_caixa_ui.js` ($\le 270$ lines) with `renderPainelOrcamentistaECaixaDiarioHtml`, `modalGerarPreOrcamentoWhatsAppHtml`, `modalFecharCaixaDiarioHtml`.
- [ ] Create `js/modules/whatsapp_orcamentista_caixa_actions.js` ($\le 270$ lines) with modal/action functions and delegated `document.addEventListener('click', ...)` for all `data-act`.
- [ ] Register both scripts in `index.html`.
- [ ] Keep `js/modules/events_patio_os.js` strictly untouched.

### Task 7: Verification, Quality Gates & Release Manifest
- [ ] Run Sprint 10.3 tests (must be 100% GREEN).
- [ ] Run modular file size gate: `node --test tests/modular_file_size_gate.test.cjs`.
- [ ] Run UI actions audit: `node --require ./scripts/test-preload.cjs --test tests/ui_actions_and_bindings_audit.test.cjs`.
- [ ] Run server smoke test: `node --require ./scripts/test-preload.cjs --test tests/server_smoke_e2e.test.cjs`.
- [ ] Check DB isolation (`git status --porcelain data/database.json`).
- [ ] Regenerate manifest and run `node --require ./scripts/test-preload.cjs --test tests/clean_install_manifest.test.cjs`.
- [ ] Run full test suite `npm test` ($\ge 928$ passing, 0 failures).
- [ ] Update `progress.md`, commit semantically and push to `origin main`.

