# Sprint 10.5 — Implementation Plan
# [P1] Skill de Cobrança Ativa & Acordo de Dívida por Cliente + [P2] Gateway WhatsApp Real com Idempotência + [P3] Ciclo Autônomo Diário 360º

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar e homologar a Sprint 10.5, fechando a Fase 10 com a Skill de Cobrança Ativa e Acordo de Dívida por Cliente (`clienteId`) com reabilitação imediata de crédito, Adaptador para Gateway WhatsApp Real (Evolution/Cloud API) com validação HMAC, idempotência e fila de retentativas com DLQ, e o Orquestrador do Ciclo Autônomo Diário 360º unificando régua de cobrança, preditiva, fila e briefing executivo.

**Architecture:**
- `services/whatsapp/whatsappCreditRecoverySkill.js`: Gerenciamento da régua de cobrança por cliente (`clienteId`), formalização de termos de acordo com entrada e parcelamento futuro, e liquidação da entrada desbloqueando o crédito do cliente na Portaria e Pátio.
- `services/whatsapp/whatsappGatewayAdapterService.js`: Adaptador para Evolution API / Meta Cloud API com validação HMAC-SHA256, deduplicação por `externalMessageId`, fila de retentativas outbound com backoff/DLQ e extrator de extratos bancários em PDF/OFX.
- `services/whatsapp/whatsappAutonomousCommandCenterService.js`: Orquestrador diário do ciclo autônomo (P1 Cobrança -> P2 Preditiva -> P3 Fila Gateway -> P4 Briefing Diretoria).
- `routes/whatsapp_cobranca_gateway.routes.js`: 8 rotas REST conectadas ao sistema de permissões.
- `js/modules/whatsapp_cobranca_gateway_ui.js` e `actions.js`: Interfaces visuais com abas P1, P2 e P3 e eventos delegados globais com zero cliques mortos.
- `tests/sprint105_credit_recovery_gateway_autonomous.test.cjs`: Suíte TDD abrangente validando os fluxos ponta a ponta.

**Tech Stack:** Node.js, Express, Crypto (HMAC-SHA256), Vanilla JS modular, node:test runner.

---

## Global Constraints
- Todos os arquivos do repositório devem respeitar o teto estrito de `<= 350` linhas (meta `<= 265` linhas para novos arquivos).
- `js/modules/events_patio_os.js` permanece estritamente intocado em 237 linhas.
- A análise, apuração de inadimplência, régua de cobrança, acordo e reabilitação de crédito é estritamente vinculada ao **Cliente (`clienteId`)**, e nunca isolada por frota/placa.
- `data/database.json` nunca deve sofrer mutação durante testes (isolamento via `test-preload.cjs`).
- Zero cliques mortos: todos os botões e links com `data-act` devem possuir handlers implementados.

---

## Review Focus
1. **Desbloqueio Condicional de Crédito:** Certificar que ao liquidar a entrada do acordo via `liquidarEntradaAcordoEDesbloquearCreditoCliente`, borderôs e títulos vencidos originais passam para `renegociado_acordo`, de modo que `avaliarRiscoInadimplenciaFrotista` e `realizarTriagemPortariaPorPlaca` imediatamente considerem o crédito como liberado (`bloqueadoPorInadimplencia: false`).
2. **Idempotência de Webhook:** Garantir que o mesmo `externalMessageId` enviado múltiplas vezes seja processado apenas uma vez, retornando `{ duplicateSkipped: true }`.
3. **Assinatura HMAC:** Rejeitar com 401 (`WEBHOOK_SIGNATURE_INVALID`) caso o secret esteja configurado e o header de assinatura seja inválido.
4. **Fila Outbound com DLQ:** Mover para `dead_letter_falha_permanente` quando `tentativas >= maxTentativasRetry`.
5. **Orquestração Diária 360º:** Executar os 4 passos do ciclo em sequência com gravação em `autonomousCycleLogs`.

---

## Tarefas de Execução

### Task 1: [P1] Skill de Cobrança Ativa, Acordo & Desbloqueio de Crédito
**Files:**
- Create: `services/whatsapp/whatsappCreditRecoverySkill.js`
- Test: `tests/sprint105_credit_recovery_gateway_autonomous.test.cjs`

- [ ] Criar `services/whatsapp/whatsappCreditRecoverySkill.js` (meta <= 265 linhas) implementando:
  - `apurarFilaReguaCobrancaPorCliente(state, { clienteId, dataReferencia } = {})`
  - `dispararReguaCobrancaAtivaWhatsApp(state, { clienteId, estagiosIncluir, responsavel, timestamp } = {})`
  - `formalizarAcordoRenegociacaoDividaCliente(state, payload)`
  - `liquidarEntradaAcordoEDesbloquearCreditoCliente(state, acordoId, { valorPagoEntrada, meioPagamento, idTransacaoBanco, timestamp } = {})`
  - `executarSkillRecuperacaoCreditoWhatsApp(state, payload)`
- [ ] Escrever testes unitários e de integração validando os estágios da régua (`preventivo_d_menos_2`, `atraso_d_mais_1`, `bloqueio_credito_d_mais_5`, `acordo_renegociacao_d_mais_15`), cálculo do acordo e desbloqueio de crédito na Portaria Inteligente (`realizarTriagemPortariaPorPlaca`).

### Task 2: [P2] Adaptador Gateway WhatsApp Real (Evolution API / Cloud API) & Fila Outbound
**Files:**
- Create: `services/whatsapp/whatsappGatewayAdapterService.js`
- Test: `tests/sprint105_credit_recovery_gateway_autonomous.test.cjs`

- [ ] Criar `services/whatsapp/whatsappGatewayAdapterService.js` (meta <= 255 linhas) implementando:
  - `configurarInstanciaGatewayWhatsApp(state, payload)`
  - `receberWebhookRealGatewayWhatsApp(state, rawPayload, { signatureHeader, rawBody, ignorarAssinatura, timestamp } = {})`
  - `enfileirarDisparoOutboundWhatsApp(state, { telefoneDestino, mensagemTexto, tipoMidia, referenciaOrigemId, simularFalhaTemporaria, timestamp })`
  - `processarFilaRetentativasOutboundWhatsApp(state, { timestamp } = {})`
- [ ] Escrever testes para validação de assinatura HMAC, idempotência estrita (`processedWebhookMessageIds`), extração de anexos de extrato bancário chamando `processarMensagemAgenteWhatsApp` e política de retentativas na fila outbound com status `'dead_letter_falha_permanente'`.

### Task 3: [P3] Orquestrador do Ciclo Autônomo Diário 360º
**Files:**
- Create: `services/whatsapp/whatsappAutonomousCommandCenterService.js`
- Test: `tests/sprint105_credit_recovery_gateway_autonomous.test.cjs`

- [ ] Criar `services/whatsapp/whatsappAutonomousCommandCenterService.js` (meta <= 220 linhas) implementando:
  - `executarCicloAutonomoDiarioAgenteWhatsApp(state, { dataReferencia, competencia, responsavel, timestamp } = {})`
- [ ] Integrar sequencialmente: Passo 1 (Cobrança) -> Passo 2 (Manutenção Preditiva) -> Passo 3 (Processamento de Fila Outbound) -> Passo 4 (Briefing Diretoria).
- [ ] Gravar em `state.autonomousCycleLogs` com resumo consolidado.

### Task 4: Atualização da Fachada Central & Rotas REST Backend
**Files:**
- Modify: `services/whatsapp/whatsappAgentSkillsService.js` (manter <= 180 linhas)
- Create: `routes/whatsapp_cobranca_gateway.routes.js` (meta <= 230 linhas)
- Modify: `routes/index.js`
- Modify: `services/patio/smartGatehouseCheckinService.js` (ajustar verificação `c.status !== 'renegociado_acordo'`)

- [ ] Atualizar `services/whatsapp/whatsappAgentSkillsService.js` adicionando a intenção `'SKILL_RECUPERACAO_CREDITO'` e exportando as funções da nova skill.
- [ ] Criar `routes/whatsapp_cobranca_gateway.routes.js` com os 8 endpoints REST autenticados com RBAC.
- [ ] Montar em `routes/index.js`.
- [ ] Atualizar `smartGatehouseCheckinService.js` para garantir que títulos com `status === 'renegociado_acordo'` não bloqueiem o check-in na portaria.

### Task 5: Componentes Visuais e Ações de UI Frontend
**Files:**
- Create: `js/modules/whatsapp_cobranca_gateway_ui.js` (meta <= 260 linhas)
- Create: `js/modules/whatsapp_cobranca_gateway_actions.js` (meta <= 260 linhas)
- Modify: `index.html`

- [ ] Criar `js/modules/whatsapp_cobranca_gateway_ui.js` com abas P1, P2 e P3.
- [ ] Criar `js/modules/whatsapp_cobranca_gateway_actions.js` com listeners delegados e binds em `window`/`globalThis`.
- [ ] Registrar os scripts em `index.html`.

### Task 6: Verificação de Gates, Manifesto SHA-256 e Homologação
- [ ] Rodar testes da Sprint 10.5 e sprints integradas: `sprint105`, `sprint104`, `sprint103`, `sprint102`, `sprint93`.
- [ ] Rodar `tests/modular_file_size_gate.test.cjs` (0 arquivos > 350L).
- [ ] Rodar `tests/ui_actions_and_bindings_audit.test.cjs` (0 cliques mortos).
- [ ] Rodar `tests/server_smoke_e2e.test.cjs`.
- [ ] Regenerar manifesto (`scripts/gerar_manifesto_release.cjs`) e validar (`clean_install_manifest.test.cjs`).
- [ ] Rodar `npm test`.
- [ ] Atualizar `progress.md`, commitar e dar push.

