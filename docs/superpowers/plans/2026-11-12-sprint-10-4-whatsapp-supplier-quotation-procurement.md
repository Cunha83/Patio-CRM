# Sprint 10.4 Implementation Plan: WhatsApp Supplier Quotation Skill & Price Memory

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the WhatsApp B2B Supplier Quotation Skill with price memory of previous purchases, minimum-3-supplier rule with interactive buyer inquiry when memory is insufficient, dynamic weighted comparison map (Economic vs. Box Emergency Mode), and automatic generation of Purchase Orders.

**Architecture:** 
- Decoupled into 2 cohesive backend modules:
  1. `services/inventory/supplierPriceMemoryHelper.js` ($\le 220$ lines): historical supplier lookup, last purchase price comparison and minimum-3-supplier validation.
  2. `services/whatsapp/whatsappSupplierQuotationSkill.js` ($\le 265$ lines): quotation opening, interactive supplier completion via WhatsApp, proposal registration with audit, weighted comparison map and Purchase Order conversion.
- Slender hook ($\le 20$ lines) in `services/whatsapp/whatsappAgentSkillsService.js`.
- REST routes in `routes/whatsapp_compras_cotacoes.routes.js` ($\le 220$ lines) mounted in `routes/index.js`.
- Frontend UI & Delegated Actions in `js/modules/whatsapp_compras_cotacoes_ui.js` & `actions.js` ($\le 265$ lines each).
- `js/modules/events_patio_os.js` (237 lines) remains strictly untouched.
- Native TDD Red-Green-Refactor with comprehensive assertions.

**Tech Stack:** Node.js native test runner (`node:test`, `node:assert/strict`), Vanilla JavaScript CommonJS/ES6, Express REST, SHA-256.

---

## Global Constraints

- 100% of files in `services/`, `routes/`, `js/modules/`, `css/` must be $\le 350$ lines.
- `services/inventory/supplierPriceMemoryHelper.js` target $\le 220$ lines.
- `services/whatsapp/whatsappSupplierQuotationSkill.js` target $\le 265$ lines.
- `services/whatsapp/whatsappAgentSkillsService.js` must remain $\le 200$ lines.
- `js/modules/events_patio_os.js` must remain strictly untouched (237 lines).
- Database isolation: `data/database.json` must not be mutated during tests.
- Verification before completion: all gates, clean install manifest, and full test suite must pass with 0 failures.

---

## Review Focus

1. **Minimum 3 Suppliers Rule with Interactive Question:** If an item has only 1 historical supplier in `purchaseOrders`, opening a quote must NOT send an incomplete quote. It must pause with `status: 'aguardando_indicacao_fornecedores'`, set `faltamFornecedoresCount: 2`, and generate the WhatsApp prompt asking for 2 more suppliers.
2. **Interactive Complement:** When the buyer provides the missing suppliers via `complementarFornecedoresCotacaoWhatsApp`, the quote transitions to `'aguardando_propostas'` and triggers the 3 supplier invitations.
3. **Auto-Dispatch when 3+ Known:** If an item already has 3 or more suppliers who previously sold it, the quote automatically selects them and transitions directly to `'aguardando_propostas'`.
4. **Historical Price Comparison & Inversion:** A proposal is classified against the last purchase cost (`ultimoCustoCompraGeral`). In Economic Mode, lowest price wins; in Urgent Box Mode (box blocked), fastest delivery (e.g. 2h vs. 48h) wins even at a higher price.
5. **Full Lifecycle End-to-End:** Approval creates the purchase order in `state.purchaseOrders`. When receiving the invoice (`receberNotaFiscalCompraPecas`), CMP is recalculated and box bottleneck `'aguardando_peca'` is cleared.

---

## Tasks

### Task 1: TDD Red Phase — Comprehensive Test Suite for Sprint 10.4
- [ ] Create `tests/sprint104_whatsapp_supplier_quotation_procurement.test.cjs` ($\le 350$ lines) covering:
  - Test 1: Historical price memory & Minimum 3 suppliers rule (with pause and WhatsApp prompt).
  - Test 2: Interactive supplier complement via WhatsApp reaching 3 suppliers and dispatching invitations.
  - Test 3: Auto-dispatch when 3+ suppliers exist in history.
  - Test 4: Proposal registration, audit against last purchase price, and Weighted Comparison Map (Economic vs. Box Emergency).
  - Test 5: End-to-end approval, purchase order creation, NF reception with CMP update, and box bottleneck unlocking.
  - Test 6: REST routes, UI components rendering, and delegated click actions audit.
- [ ] Run test suite to verify initial RED state.

### Task 2: Module `services/inventory/supplierPriceMemoryHelper.js`
- [ ] Implement `consultarMemoriaFornecedoresEPrecosItem(state, item)`.
- [ ] Implement `selecionarFornecedoresMinimoTresOuPerguntar(state, options)`.
- [ ] Implement `compararPropostaComHistoricoCompras(proposta, memoriaItens)`.
- [ ] Verify line count $\le 220$ lines.

### Task 3: Service `services/whatsapp/whatsappSupplierQuotationSkill.js`
- [ ] Implement `abrirCotacaoFornecedoresWhatsApp(state, payload)` with minimum 3 suppliers rule.
- [ ] Implement `complementarFornecedoresCotacaoWhatsApp(state, cotacaoId, options)`.
- [ ] Implement `registrarPropostaFornecedorWhatsApp(state, cotacaoId, payload)`.
- [ ] Implement `apurarMapaComparativoCotacao(state, cotacaoId, options)`.
- [ ] Implement `aprovarPropostaEGerarPedidoCompra(state, cotacaoId, options)`.
- [ ] Implement `executarSkillComprasFornecedoresWhatsApp(state, payload)`.
- [ ] Verify line count $\le 265$ lines.

### Task 4: Hook in `whatsappAgentSkillsService.js` & Routes
- [ ] Add enxuto hook in `services/whatsapp/whatsappAgentSkillsService.js` for `'SKILL_COMPRAS_FORNECEDORES'`.
- [ ] Create `routes/whatsapp_compras_cotacoes.routes.js` ($\le 220$ lines) with the 7 specified endpoints.
- [ ] Mount route in `routes/index.js`.

### Task 5: UI Components & Actions (`js/modules/whatsapp_compras_cotacoes_ui.js` & `actions.js`)
- [ ] Create `js/modules/whatsapp_compras_cotacoes_ui.js` ($\le 265$ lines).
- [ ] Create `js/modules/whatsapp_compras_cotacoes_actions.js` ($\le 265$ lines).
- [ ] Register both scripts in `index.html`.
- [ ] Verify `js/modules/events_patio_os.js` remains strictly untouched.

### Task 6: Verification, Quality Gates & Release Manifest
- [ ] Run Sprint 10.4 test suite (must be 100% GREEN).
- [ ] Run retrocompatibility suites (10.3, 10.2, 7.2).
- [ ] Run modular file size gate: `node --test tests/modular_file_size_gate.test.cjs`.
- [ ] Run UI actions audit: `node --require ./scripts/test-preload.cjs --test tests/ui_actions_and_bindings_audit.test.cjs`.
- [ ] Check DB isolation (`git status --porcelain data/database.json`).
- [ ] Regenerate manifest and run `node --require ./scripts/test-preload.cjs --test tests/clean_install_manifest.test.cjs`.
- [ ] Run full test suite `npm test` ($\ge 933$ passing, 0 failures).
- [ ] Update `progress.md`, commit semantically and push to `origin main`.

