# Sprint 10.2: Evolução do Agente WhatsApp Autônomo & Conector Direto de API Bancária — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar o Agente WhatsApp Multi-Skill de Pátio e Financeiro (Recepção Interativa com Fast Check-in, Analista Financeiro da Gerência com Cobrança PIX/Boleto e Baixa de Extrato PDF/CNAB/OFX) e Conector Direto de API Bancária com Webhook de Liquidação Instantânea, com decomposição modular estrita (teto <= 350 linhas).

**Architecture:** Decomposição de `services/whatsapp/whatsappAgentSkillsService.js` no padrão Fachada Re-Export extraindo `whatsappReceptionPatioSkill.js` e `whatsappFinancialAnalystSkill.js`; criação do serviço `bankDirectApiConnectorService.js`; exposição de rotas REST dedicadas; componentes visuais com listeners delegados no frontend; cobertura TDD completa.

**Tech Stack:** Node.js, Express, JavaScript Vanilla (DOM Delegado), Test Runner Nativo (`node:test`, `node:assert`).

**Spec:** Sprint 10.2 - Solicitação do usuário.

## Global Constraints
- Teto modular: todos os arquivos novos ou modificados devem ter <= 350 linhas.
- `services/whatsapp/whatsappAgentSkillsService.js` deve ser reduzido para <= 200 linhas mantendo 100% de compatibilidade e retrocompatibilidade com a Sprint 7.2.
- `services/whatsapp/whatsappReceptionPatioSkill.js`: <= 260 linhas.
- `services/whatsapp/whatsappFinancialAnalystSkill.js`: <= 270 linhas.
- `services/finance/bankDirectApiConnectorService.js`: <= 260 linhas.
- `routes/whatsapp_banco_autonomo.routes.js`: <= 240 linhas.
- `js/modules/whatsapp_agente_autonomo_ui.js`: <= 280 linhas.
- `js/modules/whatsapp_agente_autonomo_actions.js`: <= 280 linhas.
- `tests/sprint102_whatsapp_autonomous_skills_bank_api.test.cjs`: <= 350 linhas.
- Análise de crédito, emissão de cobrança e conciliação sempre vinculada ao `clienteId`.
- Preservação de dados: `data/database.json` NUNCA deve sofrer mutação por testes.
- Zero cliques mortos na auditoria de UI.

---

### Task 1: Suíte de Testes TDD Red (Sprint 10.2)
**Files:**
- Create: `tests/sprint102_whatsapp_autonomous_skills_bank_api.test.cjs`

- [ ] **Step 1: Escrever teste TDD Red falsificável** cobrindo:
  1. Decomposição modular de `whatsappAgentSkillsService.js` (<= 200 linhas) e preservação dos exports.
  2. Skill Recepção Interativa: Triagem 360º, Fast Check-in via WhatsApp com alocação de box e trava de crédito de `clienteId`, solicitação de link tokenizado de aprovação.
  3. Skill Analista Financeiro: Geração de cobrança PIX/Boleto em `state.paymentCharges`, conciliação e baixa automática via extratos PDF e retorno CNAB no WhatsApp.
  4. Conector API Bancária: Configuração de credenciais com mascaramento de segredos, sincronização direta e webhook instantâneo de liquidação.
  5. Rotas HTTP REST e módulos de UI/Actions.
- [ ] **Step 2: Executar teste e validar falha esperada (RED)**.

---

### Task 2: Submódulo de Recepção Interativa do WhatsApp
**Files:**
- Create: `services/whatsapp/whatsappReceptionPatioSkill.js`

- [ ] **Step 1: Implementar `whatsappReceptionPatioSkill.js` (<= 260 linhas)** com:
  - `extrairPlaca`, `round2`, `gerarId`.
  - Preservação da lógica existente de consulta de box, gargalo, preventiva e prontuário técnico por placa.
  - Implementação de `acaoRecepcao === 'triagem_360'` integrando `realizarTriagemPortariaPorPlaca`.
  - Implementação de `acaoRecepcao === 'fast_checkin_whatsapp'` integrando `registrarFastCheckinPortaria360`.
  - Implementação de `acaoRecepcao === 'solicitar_link_aprovacao'` integrando `gerarLinkTokenAprovacaoFrotista`.
  - `executarSkillRecepcaoInterativaWhatsApp` e `executarSkillRecepcaoPatio`.

---

### Task 3: Submódulo de Analista Financeiro & Cobrança PIX/Boleto do WhatsApp
**Files:**
- Create: `services/whatsapp/whatsappFinancialAnalystSkill.js`

- [ ] **Step 1: Implementar `whatsappFinancialAnalystSkill.js` (<= 270 linhas)** com:
  - Guarda RBAC 403 `WHATSAPP_UNAUTHORIZED_MANAGEMENT_SKILL`.
  - Preservação dos briefings executivos (Torre de Controle, DRE Break-Even, Resumo de Caixa).
  - Implementação de `gerarCobrancaPixBoletoWhatsApp` vinculando Borderô ou OS do `clienteId` e gerando registro em `state.paymentCharges`.
  - Implementação de conciliação de extratos via `anexoExtrato` (PDF, CNAB, OFX, API) com baixa de borderôs, comissões de mecânicos e despesas.
  - `executarSkillAnalistaFinanceiroAutonomo` e `executarSkillAnalistaFinanceiroGerencia`.

---

### Task 4: Fachada Re-Export do Agente WhatsApp
**Files:**
- Modify: `services/whatsapp/whatsappAgentSkillsService.js`

- [ ] **Step 1: Refatorar `whatsappAgentSkillsService.js` (<= 200 linhas)**:
  - Importar e re-exportar de `whatsappReceptionPatioSkill.js` e `whatsappFinancialAnalystSkill.js`.
  - Orquestrar `processarMensagemAgenteWhatsApp` com auditoria em `state.whatsappAgentLogs`.
  - Manter 100% dos exports públicos originais.

---

### Task 5: Conector Direto de API Bancária & Webhook de Liquidação
**Files:**
- Create: `services/finance/bankDirectApiConnectorService.js`

- [ ] **Step 1: Implementar `bankDirectApiConnectorService.js` (<= 260 linhas)** com:
  - `configurarCredenciaisApiBanco`: cadastro e mascaramento de segredos em `state.bankApiConnections`.
  - `sincronizarExtratoDiretoApiBanco`: validação, normalização e acionamento de `conciliarExtratoBancarioAutomatico`.
  - `processarWebhookLiquidacaoInstantaneaPixBoleto`: busca por `txid`/`nossoNumero`, quitação de borderô via `liquidarBorderoB2B` (liberação de comissão de mecânicos) ou quitação de OS/título, e marcação em `state.paymentCharges`.

---

### Task 6: Rotas REST do Agente WhatsApp e Banco Direto
**Files:**
- Create: `routes/whatsapp_banco_autonomo.routes.js`
- Modify: `routes/index.js` (ou `server.js`)

- [ ] **Step 1: Implementar `routes/whatsapp_banco_autonomo.routes.js` (<= 240 linhas)** com os 6 endpoints descritos.
- [ ] **Step 2: Montar router no roteador principal**.

---

### Task 7: Interface Visual e Delegação de Eventos DOM
**Files:**
- Create: `js/modules/whatsapp_agente_autonomo_ui.js`
- Create: `js/modules/whatsapp_agente_autonomo_actions.js`
- Modify: `index.html`

- [ ] **Step 1: Implementar `whatsapp_agente_autonomo_ui.js` (<= 280 linhas)**.
- [ ] **Step 2: Implementar `whatsapp_agente_autonomo_actions.js` (<= 280 linhas)** com listener delegado.
- [ ] **Step 3: Incluir `<script>` em `index.html`**.

---

### Task 8: Homologação e Quality Gates Finais
- [ ] **Step 1: Executar `node --require ./scripts/test-preload.cjs --test tests/sprint102_whatsapp_autonomous_skills_bank_api.test.cjs` (GREEN)**.
- [ ] **Step 2: Executar `node --require ./scripts/test-preload.cjs --test tests/sprint72_purchases_cmp_whatsapp_reconciliation.test.cjs`**.
- [ ] **Step 3: Executar `node --test tests/modular_file_size_gate.test.cjs`**.
- [ ] **Step 4: Executar `node --require ./scripts/test-preload.cjs --test tests/ui_actions_and_bindings_audit.test.cjs`**.
- [ ] **Step 5: Regenerar manifesto e validar instalação limpa `clean_install_manifest.test.cjs`**.
- [ ] **Step 6: Executar suíte completa `npm test`**.
- [ ] **Step 7: Atualizar `progress.md`, commitar e dar push**.

