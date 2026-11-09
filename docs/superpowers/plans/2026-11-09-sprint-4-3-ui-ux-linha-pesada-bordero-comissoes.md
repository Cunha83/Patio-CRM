# Sprint 4.3 — Interface de Usuário (UI/UX) para Linha Pesada, Comissões e Borderô B2B Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar a camada visual e de interação no frontend (UI/UX) do Pátio-CRM para operacionalizar: 1) Check-in e apontamento de conjuntos articulados (Cavalo + Carreta); 2) Tela de Faturamento em Lote de Frotas (Borderô B2B) com live preview e fechamento; 3) Modal de visualização de Borderô com espelho analítico de frota, linhas digitáveis e Pix Copia e Cola; 4) Extrato detalhado de comissões e produtividade por mecânico.

**Architecture:**
- `js/modules/patio_articulado_ui.js`: Componentes visuais para conjuntos articulados no check-in (toggle Cavalo+Carreta, placa/modelo do semirreboque) e na OS (seletor de alvo `cavalo`/`carreta` por item e card de subtotais transparentes).
- `js/modules/financeiro_bordero_ui.js`: Aba "Faturamento de Frotas 🚛" no módulo Financeiro com checklist de OSs faturáveis, filtros por transportadora/período, resumo lateral em tempo real (mão de obra, peças, desconto, retenções ISS/IRRF e total líquido) e gatilho de fechamento.
- `js/modules/financeiro_bordero_modal.js`: Modal de detalhamento do borderô com duplicatas (linha digitável, QR/Pix Copia e Cola), espelho analítico para frotistas e disparo de mensagem WhatsApp formatada.
- `js/modules/analista_comissoes_ui.js`: Extrato analítico de comissões por colaborador, com seletor quinzenal/mensal, filtro por mecânico, tabela detalhada de OSs apontadas e demonstrativo líquido.
- `index.html`: Inclusão ordenada dos 4 novos scripts modulares.
- Event delegates em `events_patio_os.js` e `events_financeiro_caixa.js`: Registro de novos `data-act`.

**Tech Stack:** JavaScript Vanilla (ES6+ / CommonJS friendly), DOM nativo, Design System CSS do Pátio-CRM, Node test runner para harness.

**Spec:** `docs/benchmark_e_gap_analysis_patio_crm_v1.1.2.md`, `docs/SPRINT_4.1_CONTRATOS_E_SCHEMAS.md`, `docs/SPRINT_4.2_CONTRATOS_E_SCHEMAS.md` e prompt da Sprint 4.3.

## Global Constraints

- **Teto Modular Rigoroso:** Todos os arquivos novos e modificados em `js/` e `js/modules/` devem ter **estritamente <= 350 linhas** (`tests/modular_file_size_gate.test.cjs`).
- **Zero Dead Clicks:** 100% dos botões, inputs com `data-act` e handlers inline devem estar vinculados a funções globais válidas e auditados por `tests/ui_actions_and_bindings_audit.test.cjs`.
- **Isolamento de Estado:** `data/database.json` nunca é modificado durante testes.
- **Manifesto Criptográfico:** Atualização de `docs/operacao/manifesto_release.json` e aprovação em `tests/clean_install_manifest.test.cjs`.
- **Suíte Verde:** 100% dos testes da suíte (`npm test`) devem passar sem regressões.

## Review Focus

1. **Persistência de Conjuntos Articulados:** Garantir que alternar o toggle de carreta no modal de abertura de OS preenche corretamente `rasc.tipoEntrada = 'articulado'` e `rasc.carretaPlaca` / `rasc.carretaModelo`.
2. **Apontamento de Alvo em Itens de OS:** Ao adicionar serviço ou peça, permitir que o usuário defina `alvo: 'cavalo' | 'carreta'` e reflita nos subtotais visuais.
3. **Checklist Dinâmico de Borderô:** A seleção/deseleção de OSs na tabela do borderô recalcula instantaneamente os totais de mão de obra, peças, descontos e retenções tributárias no painel lateral.
4. **Cópia de Linha Digitável e Pix:** Botões de cópia no modal de borderô utilizam `navigator.clipboard` com feedback visual toast.
5. **Demonstrativo de Comissões:** Respeitar regras de rateio e exclusão de garantia configuradas no backend.

---

### Task 1: UI de Conjuntos Articulados (Check-in e OS)

**Files:**
- Create: `js/modules/patio_articulado_ui.js`
- Modify: `js/modules/patio_triagem_vistoria.js`
- Modify: `js/modules/patio_os_sheet.js`
- Modify: `index.html`
- Test: `tests/sprint43_ui_components.test.cjs`

- [ ] **Step 1.1:** Criar teste inicial `tests/sprint43_ui_components.test.cjs` com asserções para funções de renderização de conjunto articulado (`renderSeletorArticuladoHtml`, `renderAlvoItemBadge`, `renderSubtotaisArticuladoOS`).
- [ ] **Step 1.2:** Executar o teste e certificar que falha (RED): `node --require ./scripts/test-preload.cjs --test tests/sprint43_ui_components.test.cjs`.
- [ ] **Step 1.3:** Implementar `js/modules/patio_articulado_ui.js` (<= 250 linhas) com renderizadores de seletor de conjunto articulado para nova OS e painel de discriminação de itens na folha de OS.
- [ ] **Step 1.4:** Integrar chamadas nos submódulos `patio_triagem_vistoria.js` e `patio_os_sheet.js` mantendo ambos <= 350 linhas.
- [ ] **Step 1.5:** Registrar `js/modules/patio_articulado_ui.js` em `index.html`.
- [ ] **Step 1.6:** Executar o teste e certificar que passa (GREEN): `node --require ./scripts/test-preload.cjs --test tests/sprint43_ui_components.test.cjs`.

---

### Task 2: Tela de Fechamento de Faturas / Borderô de Frotas

**Files:**
- Create: `js/modules/financeiro_bordero_ui.js`
- Modify: `js/financeiro.js`
- Modify: `index.html`
- Test: `tests/sprint43_ui_components.test.cjs`

- [ ] **Step 2.1:** Adicionar casos de teste em `tests/sprint43_ui_components.test.cjs` para a view de faturamento de frotas (`blocoBorderoFrotas`, cálculo de seleção de OSs, recálculo de retenções).
- [ ] **Step 2.2:** Executar e certificar falha (RED).
- [ ] **Step 2.3:** Implementar `js/modules/financeiro_bordero_ui.js` (<= 300 linhas): seletor de transportadora, tabela com checkboxes, filtros por data, painel lateral de resumo com retenções e ação de geração.
- [ ] **Step 2.4:** Adicionar aba `'bordero'` em `js/financeiro.js` delegando para `blocoBorderoFrotas()`.
- [ ] **Step 2.5:** Registrar script em `index.html`.
- [ ] **Step 2.6:** Executar o teste e certificar que passa (GREEN).

---

### Task 3: Modal de Cobrança e Espelho da Frota

**Files:**
- Create: `js/modules/financeiro_bordero_modal.js`
- Modify: `index.html`
- Test: `tests/sprint43_ui_components.test.cjs`

- [x] **Step 3.1:** Adicionar casos de teste para `modalDetalhesBorderoHtml` e formatação de espelho analítico de frota.
- [x] **Step 3.2:** Executar e certificar falha (RED).
- [x] **Step 3.3:** Implementar `js/modules/financeiro_bordero_modal.js` (<= 280 linhas) com exibição de duplicatas, linha digitável, QR/Pix Copia e Cola, espelho analítico por veículo/conjunto articulado e botão WhatsApp.
- [x] **Step 3.4:** Registrar script em `index.html`.
- [x] **Step 3.5:** Executar o teste e certificar que passa (GREEN).

---

### Task 4: Extrato de Produtividade e Comissões de Mecânicos

**Files:**
- Create: `js/modules/analista_comissoes_ui.js`
- Modify: `js/modules/analista_bi_produtividade.js`
- Modify: `index.html`
- Test: `tests/sprint43_ui_components.test.cjs`

- [x] **Step 4.1:** Adicionar casos de teste para `blocoExtratoComissoesHtml` e filtros quinzenais/mensais.
- [x] **Step 4.2:** Executar e certificar falha (RED).
- [x] **Step 4.3:** Implementar `js/modules/analista_comissoes_ui.js` (<= 250 linhas) com tabela analítica de comissões por OS/mecânico, seletor de período e resumo.
- [x] **Step 4.4:** Adicionar botão/aba em `analista_bi_produtividade.js` para alternar entre "Indicadores Gerais" e "Extrato de Comissões".
- [x] **Step 4.5:** Registrar script em `index.html`.
- [x] **Step 4.6:** Executar o teste e certificar que passa (GREEN).

---

### Task 5: Event Delegates, Quality Gates e Validação Geral

**Files:**
- Modify: `js/modules/events_patio_os.js`
- Modify: `js/modules/events.js`
- Create: `js/modules/events_financeiro_bordero.js`
- Update: `docs/operacao/manifesto_release.json` (via script)

- [x] **Step 5.1:** Mapear novos triggers `data-act` em `events_patio_os.js`, `events.js` e `events_financeiro_bordero.js`.
- [x] **Step 5.2:** Executar auditoria de UI (`tests/ui_actions_and_bindings_audit.test.cjs`) e validar zero dead clicks.
- [x] **Step 5.3:** Executar gate de tamanho modular (`tests/modular_file_size_gate.test.cjs`) e garantir que 100% dos arquivos respeitam <= 350 linhas.
- [x] **Step 5.4:** Regenerar manifesto SHA-256 (`node scripts/gerar_manifesto_release.cjs`) e validar integridade limpa (`tests/clean_install_manifest.test.cjs`).
- [x] **Step 5.5:** Validar isolamento estrito de `data/database.json`.
- [x] **Step 5.6:** Executar a suíte completa de testes (`npm test`) com 100% de sucesso.
