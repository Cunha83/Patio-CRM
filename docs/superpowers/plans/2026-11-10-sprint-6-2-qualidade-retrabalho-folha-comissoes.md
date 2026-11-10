# Sprint 6.2: Checklist Técnico de Qualidade pré-Entrega, Retrabalho em Garantia & Fechamento de Folha de Comissões

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar o checklist de qualidade pré-entrega de suspensão e pesados com bloqueio de liberação, abertura e rastreio de OSs de garantia/retrabalho vinculadas ao mecânico de origem, apuração de folha de comissões com estorno de mão de obra retrabalhada e anulação de bônus por falha de execução, além de gestão de vales/adiantamentos e fechamento com integração financeira a pagar.

**Architecture:** Módulos de domínio desacoplados e estritamente $\le 350$ linhas (`services/patio/qualityWarrantyReworkService.js` e `services/patio/commissionPayrollService.js`), roteamento REST limpo com persistência transacional (`routes/patio_qualidade_folha.routes.js`), UI componentizada dividida em templates (`js/modules/patio_qualidade_folha_ui.js`) e ações com delegação de eventos própria (`js/modules/patio_qualidade_folha_actions.js`), e suíte de testes automatizados com cobertura TDD (`tests/sprint62_quality_rework_commission_payroll.test.cjs`).

**Tech Stack:** Node.js (test runner nativo `node:test` e `node:assert/strict`), Express.js, Vanilla JS (frontend modular com padrão de eventos delegados), isolamento SQLite/State.

---

## Global Constraints
- Limite estrito de tamanho de arquivo: máximo 350 linhas por arquivo em `js/`, `css/`, `lib/`, `routes/`, `services/`.
- `js/modules/events_patio_os.js` (333 linhas) **NÃO deve ser inflado**. Ações de UI da Sprint 6.2 ficam em `js/modules/patio_qualidade_folha_actions.js`.
- Zero cliques mortos: todos os botões e handlers inline devem existir no escopo global e passar em `tests/ui_actions_and_bindings_audit.test.cjs`.
- Isolamento total de estado: `data/database.json` nunca deve sofrer mutação durante testes (`git status --porcelain data/database.json` vazio).
- Manifesto criptográfico SHA-256 íntegro (`docs/operacao/manifesto_release.json` atualizado via `scripts/gerar_manifesto_release.cjs`).
- 100% dos testes aprovados (`npm test` com 0 falhas).

---

## Review Focus
1. Bloqueio de liberação de OS sem checklist aprovado: deve lançar erro `QUALITY_INSPECTION_REQUIRED_OR_FAILED`.
2. Abertura de OS de Garantia/Retrabalho: deve gerar OS com `custoCliente: 0`, `tipoOS: 'garantia_retrabalho'` e registrar `reworkRecords` com `estornarComissao: true` se for falha de execução.
3. Anulação de bônus de eficiência por retrabalho: mecânico com $\ge 1$ retrabalho por falha de execução tem `perdeuBonusPorRetrabalho: true` e `valorBonusEficiencia = 0`.
4. Estorno de comissão e desconto de vales na prévia da folha: dedução exata de `valorEstornoComissaoRetrabalho` e `totalValesDescontar`, gerando `saldoDevedorProximoMes` caso os descontos superem o comissionamento.
5. Fechamento de folha imutável: bloqueio de duplo fechamento e novos vales com `PAYROLL_ALREADY_CLOSED`, com baixa de vales e título a pagar em `state.contas`.

---

## Tasks

### Task 1: Checklist Técnico de Qualidade pré-Entrega e OS de Garantia/Retrabalho
**Files:**
- Create: `services/patio/qualityWarrantyReworkService.js`
- Test: `tests/sprint62_quality_rework_commission_payroll.test.cjs`

- [ ] **Step 1:** Criar `tests/sprint62_quality_rework_commission_payroll.test.cjs` com os testes 1.1 (inspeção de qualidade aprovada vs. reprovada e bloqueio de liberação) e 1.2 (abertura de OS de garantia/retrabalho isenta ao cliente e registro de ocorrência com flag de estorno).
- [ ] **Step 2:** Executar o teste e verificar que falha (RED).
- [ ] **Step 3:** Implementar `services/patio/qualityWarrantyReworkService.js` ($\le 300$ linhas) com as funções `registrarInspecaoQualidadeOS`, `validarLiberacaoQualidadeOS`, `abrirOSGarantiaRetrabalho` e `listarOcorrenciasRetrabalho`.
- [ ] **Step 4:** Executar o teste e confirmar que passa (GREEN).
- [ ] **Step 5:** Verificar tamanho modular ($\le 350$ linhas).

---

### Task 2: Integração de Retrabalho, Vales e Fechamento de Folha de Comissões
**Files:**
- Create: `services/patio/commissionPayrollService.js`
- Test: `tests/sprint62_quality_rework_commission_payroll.test.cjs`

- [ ] **Step 1:** Adicionar ao teste `tests/sprint62_quality_rework_commission_payroll.test.cjs` os testes 2.1 (lançamento de vales e bloqueio em competência fechada), 2.2 (apuração de prévia da folha com estorno de comissão, anulação de bônus de eficiência por retrabalho e desconto de vales) e 2.3 (fechamento definitivo da folha, baixa de vales e geração de título a pagar).
- [ ] **Step 2:** Executar o teste e verificar que falha (RED).
- [ ] **Step 3:** Implementar `services/patio/commissionPayrollService.js` ($\le 320$ linhas) com as funções `registrarValeAdiantamentoMecanico`, `listarValesMecanico`, `calcularPreviaFolhaComissoes` e `fecharFolhaComissoesCompetencia`.
- [ ] **Step 4:** Executar o teste e confirmar que passa (GREEN).
- [ ] **Step 5:** Verificar tamanho modular ($\le 350$ linhas).

---

### Task 3: Endpoints REST de Qualidade, Retrabalho e Folha de Comissões
**Files:**
- Create: `routes/patio_qualidade_folha.routes.js`
- Modify: `routes/index.js`
- Test: `tests/sprint62_quality_rework_commission_payroll.test.cjs`

- [ ] **Step 1:** Adicionar o teste HTTP 3.1 em `tests/sprint62_quality_rework_commission_payroll.test.cjs` cobrindo todas as rotas com servidor HTTP real isolado.
- [ ] **Step 2:** Executar o teste e verificar que falha (RED).
- [ ] **Step 3:** Implementar `routes/patio_qualidade_folha.routes.js` ($\le 280$ linhas) com as rotas de inspeção, liberação, retrabalho, vales e fechamento de folha.
- [ ] **Step 4:** Registrar em `routes/index.js` via `app.use(require('./patio_qualidade_folha.routes'));`.
- [ ] **Step 5:** Executar o teste e confirmar que passa (GREEN).
- [ ] **Step 6:** Verificar tamanho modular ($\le 350$ linhas).

---

### Task 4: Interface de Usuário e Delegação de Ações DOM
**Files:**
- Create: `js/modules/patio_qualidade_folha_ui.js`
- Create: `js/modules/patio_qualidade_folha_actions.js`
- Modify: `index.html`
- Test: `tests/sprint62_quality_rework_commission_payroll.test.cjs`

- [ ] **Step 1:** Adicionar o teste de UI 4.1 em `tests/sprint62_quality_rework_commission_payroll.test.cjs` validando `renderPainelQualidadeFolhaHtml`, `modalInspecaoQualidadeOSHtml`, `modalAbrirRetrabalhoHtml`, `modalFechamentoFolhaComissoesHtml` e os binds em `window`/`globalThis`.
- [ ] **Step 2:** Implementar `js/modules/patio_qualidade_folha_ui.js` ($\le 250$ linhas).
- [ ] **Step 3:** Implementar `js/modules/patio_qualidade_folha_actions.js` ($\le 200$ linhas) com delegação limpa de cliques.
- [ ] **Step 4:** Registrar ambos os `<script>` em `index.html`.
- [ ] **Step 5:** Executar auditoria de cliques mortos: `node --require ./scripts/test-preload.cjs --test tests/ui_actions_and_bindings_audit.test.cjs`.
- [ ] **Step 6:** Confirmar que todos os testes da Sprint 6.2 passam (GREEN).

---

### Task 5: Protocolo de Homologação Final & Quality Gates
**Files:**
- Modify: `docs/operacao/manifesto_release.json` (via script)
- Modify: `docs/operacao/MANIFESTO_RELEASE_PILOTO_2026-09-21.md` (via script)

- [ ] **Step 1:** Executar `node --test tests/modular_file_size_gate.test.cjs` (15/15 PASS, 0 arquivos > 350 linhas).
- [ ] **Step 2:** Executar `node --require ./scripts/test-preload.cjs --test tests/ui_actions_and_bindings_audit.test.cjs`.
- [ ] **Step 3:** Verificar isolamento de `data/database.json`. Descartar qualquer resíduo temporário.
- [ ] **Step 4:** Regenerar manifesto SHA-256: `node scripts/gerar_manifesto_release.cjs`.
- [ ] **Step 5:** Executar `node --require ./scripts/test-preload.cjs --test tests/clean_install_manifest.test.cjs`.
- [ ] **Step 6:** Executar suíte completa: `npm test` ($\ge 832$ testes passando, 0 falhas).
- [ ] **Step 7:** Commit semântico e push para `main`: `git commit` e `git push origin main`.

