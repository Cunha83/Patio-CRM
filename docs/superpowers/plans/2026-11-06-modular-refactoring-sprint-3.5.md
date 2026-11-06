# Sprint 3.5: Modularização Completa e Varredura Universal (< 350 Linhas)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Decompor e modularizar 100% dos arquivos de código de produção remanescentes em `js/`, `lib/`, `services/` e `routes/` sob o teto estrito de $\le 350$ linhas, estabelecendo um Quality Gate universal com zero quebra de contratos públicos e 100% dos testes verdes.

**Architecture:** Adoção do padrão Fachada (Facade / Re-export) para preservar 100% dos contratos públicos de `module.exports`, `window.*` e `globalThis.*`. Os arquivos originais tornam-se orquestradores leves (< 180 linhas) delegando a submódulos de responsabilidade única ($\le 350$ linhas cada). Todos os novos módulos frontend são registrados em `index.html` na ordem estrita de dependência.

**Tech Stack:** Node.js (CommonJS), Vanilla JS moderno (ES6+), HTML5/CSS3, SQLite, Test Runner nativo (`node:test`, `node:assert/strict`).

**Spec:** Instruções canônicas de Harness Engineering (`AGENTS.md`) e regras de modularidade estrita ($\le 350$ linhas).

## Global Constraints

- **Teto Estrito:** Nenhum arquivo de código em `js/`, `lib/`, `services/`, `routes/` e `css/` pode ultrapassar 350 linhas.
- **Zero Quebra de Contratos:** Todas as funções, métodos, classes, seletores de ID e chamadas inline devem permanecer inalterados nos pontos de entrada originais.
- **Isolamento de Estado:** Nenhuma suíte de testes pode mutar `data/database.json`. Preload `--require ./scripts/test-preload.cjs` é obrigatório.
- **Sintaxe Limpa:** Todo arquivo gerado deve passar em `node --check <arquivo>`.

## Review Focus

- Sandboxes de teste (`vm.runInContext` e `fs.readFileSync`) que leem arquivos frontend diretamente (ex.: `patio_mechanic_privacy.test.cjs`, `dashboard_metrics.test.cjs`, `voice_assistant_settings.test.cjs`, `patio_render.test.cjs`, `adversarial_audit_regressions.test.cjs`).
- Referências cruzadas e ordem de injeção de `<script>` em `index.html`.
- Preservação da função `esc =` em `js/state.js` para conformidade com asserções de segurança em `adversarial_audit_regressions.test.cjs`.
- Manutenção do objeto `stateRepository` e suas propriedades requeridas pelos serviços do backend.

---

## Estrutura de Tarefas (Sprint 3.5)

### Bloco A: Frontend Core (`js/` e `js/modules/`)

- [ ] **Task 1: Decomposição de `js/patio.js` (1.005 linhas)**
  - Extrair em:
    - `js/modules/patio_os_sheet.js`: Drawer lateral de OS, preenchimento, itens e dados complementares ($\le 350$ linhas).
    - `js/modules/patio_triagem_vistoria.js`: Abertura rápida de OS, triagem técnica e inspeção visual ($\le 350$ linhas).
    - `js/modules/patio_actions_workflow.js`: Transições de status, troca de boxes, impressão e exclusão de OS ($\le 350$ linhas).
  - Manter `js/patio.js` (< 180 linhas) como fachada, reexportando para `window` e `globalThis`.
  - Registrar submódulos em `index.html` antes de `js/patio.js`.
  - Testar com `tests/patio_mechanic_privacy.test.cjs` e `tests/ui_actions_and_bindings_audit.test.cjs`.

- [ ] **Task 2: Decomposição de `js/cadastros.js` (979 linhas) e `js/modules/cadastros_forms.js` (465 linhas)**
  - Extrair `js/cadastros.js` em:
    - `js/modules/cadastros_clientes_veiculos.js`: Listagem, busca e formulários de clientes e veículos ($\le 350$ linhas).
    - `js/modules/cadastros_fornecedores_equipe.js`: Fornecedores, mecânicos e tabela de serviços ($\le 350$ linhas).
  - Extrair `js/modules/cadastros_forms.js` em submódulo auxiliar se necessário.
  - Manter `js/cadastros.js` (< 160 linhas) como fachada com binds preservados.
  - Registrar submódulos em `index.html`.
  - Testar com `tests/ui_actions_and_bindings_audit.test.cjs`.

- [ ] **Task 3: Decomposição de `js/whatsapp.js` (844 linhas)**
  - Extrair em:
    - `js/modules/whatsapp_conexao_qr.js`: Status de conexão, pairing code, QR Code e logs de sessão ($\le 350$ linhas).
    - `js/modules/whatsapp_cobranca_fila.js`: Disparos de cobrança, fila de mensagens, templates e histórico ($\le 350$ linhas).
    - `js/modules/whatsapp_chat_ui.js`: Visualização de mensagens e envio manual ($\le 350$ linhas).
  - Manter `js/whatsapp.js` (< 150 linhas) como orquestrador.
  - Registrar submódulos em `index.html`.
  - Testar com `tests/ui_actions_and_bindings_audit.test.cjs`.

- [ ] **Task 4: Decomposição de `js/compras.js` (762 linhas), `js/voz.js` (796 linhas) e `js/dashboard_operacional.js` (811 linhas)**
  - Extrair `js/compras.js` em submódulos de cotação/pedido ($\le 350$ linhas cada).
  - Extrair `js/voz.js` em submódulos de gravação/TTS preservando `VoiceProviderAdapter` no arquivo raiz ($\le 350$ linhas).
  - Extrair `js/dashboard_operacional.js` em submódulos de KPIs e gráficos ($\le 350$ linhas cada).
  - Atualizar `index.html` e validar com `tests/voice_assistant_settings.test.cjs`.

- [ ] **Task 5: Decomposição de `js/relatorios.js` (1.508 linhas), `js/state.js` (971 linhas), `js/modules/navigation.js` (831 linhas), `js/modules/agent_config.js` (1.338 linhas) e `js/modules/patio_render.js` (549 linhas)**
  - Extrair `js/relatorios.js` em submódulos por tipo de relatório ($\le 350$ linhas cada).
  - Extrair `js/state.js` preservando declaração literal `esc =` e sementes iniciais ($\le 350$ linhas).
  - Extrair `js/modules/navigation.js` em roteamento e abas de menu ($\le 350$ linhas cada).
  - Extrair `js/modules/agent_config.js` em submódulos de configuração de assistente ($\le 350$ linhas cada).
  - Extrair `js/modules/patio_render.js` e `js/modules/dashboard_metrics.js` ($\le 350$ linhas cada).
  - Testar com `tests/patio_render.test.cjs`, `tests/dashboard_metrics.test.cjs` e `tests/adversarial_audit_regressions.test.cjs`.

---

### Bloco B: Backend Libs e Repositórios (`lib/`)

- [ ] **Task 6: Decomposição de `lib/repository/stateRepository.js` (855 linhas)**
  - Extrair em submódulos de persistência especializada em `lib/repository/` (ex.: leitura, escrita atômica, auditoria) $\le 350$ linhas cada.
  - Manter `stateRepository.js` (< 150 linhas) como fachada com todas as funções exportadas e mocks intactos.
  - Testar com `tests/database_safety.test.cjs` e `tests/concurrency_stability.test.cjs`.

- [ ] **Task 7: Decomposição de `lib/auth/userRepository.js` (641 linhas), `lib/serverContext.js` (370 linhas) e `lib/auth/identity.js` (355 linhas)**
  - Extrair funções auxiliares e schemas em submódulos $\le 350$ linhas.
  - Manter fachadas enxutas com contratos intactos.
  - Testar com `tests/fase_b_auth_rbac.test.cjs` e `tests/persistent_auth_and_rbac.test.cjs`.

---

### Bloco C: Backend Rotas (`routes/`)

- [ ] **Task 8: Decomposição de `routes/financial.routes.js` (1.766 linhas) e `routes/coreLoop.routes.js` (1.030 linhas)**
  - Extrair `financial.routes.js` em subrotas modulares:
    - `routes/financial_cash.routes.js` (caixa e sangrias)
    - `routes/financial_titles.routes.js` (contas a pagar/receber)
    - `routes/financial_dre.routes.js` (DRE e relatórios fiscais)
    - `routes/financial_pix.routes.js` (pix e webhooks)
  - Extrair `coreLoop.routes.js` em subrotas de OS, itens e status.
  - Manter arquivos principais como montadores express (`router.use(...)`) $< 100$ linhas.
  - Testar com `tests/financial_dashboard.test.cjs` e `tests/fase_a_core_loop.test.cjs`.

- [ ] **Task 9: Decomposição das Demais Rotas > 350 Linhas (`crm`, `whatsapp`, `config`, `quotation`, `auth`, `voice`, `inventory`, `preOs`)**
  - Modularizar cada rota dividindo handlers complexos em arquivos auxiliares ou subrotas $\le 350$ linhas cada.
  - Testar rotas correspondentes em `tests/`.

---

### Bloco D: Backend Engines e Serviços (`services/`)

- [ ] **Task 10: Decomposição de Engines Críticas (`pricingEngine.js`, `financialEngine.js`, `operationalIntelligenceEngine.js`)**
  - Extrair algoritmos de cálculo em módulos especializados de `services/pricing/`, `services/financial/` e `services/intelligence/` ($\le 350$ linhas cada).
  - Manter fachadas originais com re-exports idênticos.
  - Testar com `tests/pricing_and_profitability.test.cjs`, `tests/financial_dashboard.test.cjs` e `tests/operational_intelligence.test.cjs`.

- [ ] **Task 11: Decomposição dos Demais Serviços > 350 Linhas em `services/`**
  - Modularizar serviços de compras, relatórios, faturamento, estoque, apontamento e agendador WhatsApp.
  - Manter contratos e instâncias compartilhadas.

---

### Bloco E: Quality Gate Universal, Manifesto e Finalização

- [ ] **Task 12: Quality Gate Universal em `tests/modular_file_size_gate.test.cjs`**
  - Expandir teste para varrer recursivamente todas as pastas (`js/`, `lib/`, `services/`, `routes/`, `css/`) garantindo que 100% dos arquivos de código tenham $\le 350$ linhas.
  - Atualizar `AGENTS.md`.
  - Gerar novo manifesto SHA-256 (`node scripts/gerar_manifesto_release.cjs`).
  - Executar verificação completa (`npm test`).
  - Criar commit semântico, tag `v1.1.1` e push final.

