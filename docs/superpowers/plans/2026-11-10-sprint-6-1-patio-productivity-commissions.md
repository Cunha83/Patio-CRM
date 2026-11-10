# Sprint 6.1: Produtividade de Pátio, Apontamento de Horas por Mecânico/Box & Motor de Comissionamento Técnico

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar o motor de rastreamento de horas reais de mecânicos e ocupação de boxes por serviço na OS, com validação anti-conflito operacional, pausas auditadas, apuração de índice de eficiência (horas vendidas vs. trabalhadas) e motor de comissionamento técnico com bonificação por meta de produtividade e separação entre comissões liberadas e retidas.

**Architecture:** Módulos de domínio desacoplados e estritamente $\le 350$ linhas (`services/patio/mechanicTimeTrackingService.js` e `services/patio/mechanicProductivityCommissionService.js`), roteamento REST limpo com persistência transacional (`routes/patio_produtividade_comissoes.routes.js`), UI componentizada (`js/modules/patio_produtividade_ui.js`) e suíte de testes automatizados com cobertura TDD (`tests/sprint61_patio_productivity_commissions.test.cjs`).

**Tech Stack:** Node.js (test runner nativo `node:test` e `node:assert/strict`), Express.js, Vanilla JS (frontend modular com padrão de eventos delegados), isolamento SQLite/State.

---

## Global Constraints
- Limite estrito de tamanho de arquivo: máximo 350 linhas por arquivo em `js/`, `css/`, `lib/`, `routes/`, `services/`.
- Zero cliques mortos: todos os botões e handlers inline devem existir no escopo global e passar em `tests/ui_actions_and_bindings_audit.test.cjs`.
- Isolamento total de estado: `data/database.json` nunca deve sofrer mutação durante testes (`git status --porcelain data/database.json` vazio).
- Manifesto criptográfico SHA-256 íntegro (`docs/operacao/manifesto_release.json` atualizado via `scripts/gerar_manifesto_release.cjs`).
- 100% dos testes aprovados (`npm test` com 0 falhas).

---

## Review Focus
1. Conflito de apontamento simultâneo do mesmo mecânico em múltiplos serviços: deve lançar `MECHANIC_ALREADY_ACTIVE_IN_ANOTHER_SERVICE`.
2. Transição inválida de estados no cronômetro (ex: pausar serviço já pausado ou pausar serviço concluído): deve lançar `INVALID_TIMELOG_STATE`.
3. Cálculo preciso de tempo líquido com múltiplas pausas: minutos pausados devem ser rigorosamente subtraídos de `tempoBrutoMinutos`.
4. Segregação de comissões por modalidade de gatilho (`'os_finalizada'` vs `'os_recebida'`): comissões de OSs que ainda não cumpriram o gatilho devem constar em `baseComissionavelRetida` e `valorComissaoRetida`.
5. Rateio justo entre múltiplos mecânicos no mesmo serviço da OS: divisão proporcional com base nas `horasTrabalhadas` de cada um.

---

## Tasks

### Task 1: Motor de Apontamento de Horas por Mecânico & Box
**Files:**
- Create: `services/patio/mechanicTimeTrackingService.js`
- Test: `tests/sprint61_patio_productivity_commissions.test.cjs`

- [ ] **Step 1:** Criar o arquivo de teste `tests/sprint61_patio_productivity_commissions.test.cjs` com os testes 1.1 (ciclo completo de cronômetro com pausas e cálculo de eficiência), 1.2 (regra anti-conflito `MECHANIC_ALREADY_ACTIVE_IN_ANOTHER_SERVICE`) e 1.3 (rejeição de transições inválidas de estado).
- [ ] **Step 2:** Executar o teste e verificar que falha (RED).
- [ ] **Step 3:** Implementar `services/patio/mechanicTimeTrackingService.js` ($\le 300$ linhas) com as funções `iniciarApontamentoServico`, `pausarApontamentoServico`, `retomarApontamentoServico`, `concluirApontamentoServico` e `listarApontamentosPatio`.
- [ ] **Step 4:** Executar o teste e confirmar que passa (GREEN).
- [ ] **Step 5:** Verificar tamanho modular ($\le 350$ linhas).

---

### Task 2: Motor de Produtividade e Comissionamento Técnico
**Files:**
- Create: `services/patio/mechanicProductivityCommissionService.js`
- Test: `tests/sprint61_patio_productivity_commissions.test.cjs`

- [ ] **Step 1:** Adicionar ao teste `tests/sprint61_patio_productivity_commissions.test.cjs` os testes 2.1 (configuração de regra e cálculo de produtividade com bônus de eficiência), 2.2 (segregação por gatilho `os_finalizada` vs `os_recebida`) e 2.3 (rateio proporcional de múltiplos mecânicos no mesmo serviço e ranking da equipe).
- [ ] **Step 2:** Executar o teste e verificar que falha (RED).
- [ ] **Step 3:** Implementar `services/patio/mechanicProductivityCommissionService.js` ($\le 300$ linhas) com as funções `configurarRegraComissaoMecanico`, `calcularProdutividadeEComissaoMecanico` e `gerarResumoProdutividadeEquipe`.
- [ ] **Step 4:** Executar o teste e confirmar que passa (GREEN).
- [ ] **Step 5:** Verificar tamanho modular ($\le 350$ linhas).

---

### Task 3: Endpoints REST de Apontamentos e Comissões
**Files:**
- Create: `routes/patio_produtividade_comissoes.routes.js`
- Modify: `routes/index.js`
- Test: `tests/sprint61_patio_productivity_commissions.test.cjs`

- [ ] **Step 1:** Adicionar o teste HTTP 3.1 em `tests/sprint61_patio_productivity_commissions.test.cjs` testando os endpoints REST com servidor HTTP real isolado.
- [ ] **Step 2:** Executar o teste e verificar que falha (RED).
- [ ] **Step 3:** Implementar `routes/patio_produtividade_comissoes.routes.js` ($\le 280$ linhas) com as rotas de apontamento (iniciar, pausar, retomar, concluir, listar) e comissões (regra, cálculo/ranking).
- [ ] **Step 4:** Registrar no `routes/index.js` via `app.use(require('./patio_produtividade_comissoes.routes'));`.
- [ ] **Step 5:** Executar o teste e confirmar que passa (GREEN).
- [ ] **Step 6:** Verificar tamanho modular ($\le 350$ linhas).

---

### Task 4: Interface de Usuário e Delegação de Eventos DOM
**Files:**
- Create: `js/modules/patio_produtividade_ui.js`
- Modify: `index.html`
- Modify: `js/modules/events_patio_os.js`
- Test: `tests/sprint61_patio_productivity_commissions.test.cjs`

- [ ] **Step 1:** Adicionar o teste de UI 4.1 em `tests/sprint61_patio_productivity_commissions.test.cjs` validando `renderPainelProdutividadePatioHtml`, `modalIniciarApontamentoHtml`, `modalConfigurarComissaoMecanicoHtml` e os binds em `window`/`globalThis`.
- [ ] **Step 2:** Criar `js/modules/patio_produtividade_ui.js` ($\le 300$ linhas).
- [ ] **Step 3:** Registrar `<script src="js/modules/patio_produtividade_ui.js"></script>` em `index.html`.
- [ ] **Step 4:** Adicionar delegação limpa em `js/modules/events_patio_os.js` cuidando para não ultrapassar 340 linhas.
- [ ] **Step 5:** Executar auditoria de cliques mortos: `node --require ./scripts/test-preload.cjs --test tests/ui_actions_and_bindings_audit.test.cjs`.
- [ ] **Step 6:** Confirmar que todos os testes da Sprint 6.1 passam (GREEN).

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
- [ ] **Step 6:** Executar suíte completa: `npm test` ($\ge 824$ testes passando, 0 falhas).
- [ ] **Step 7:** Commit semântico e push para `main`: `git commit` e `git push origin main`.

