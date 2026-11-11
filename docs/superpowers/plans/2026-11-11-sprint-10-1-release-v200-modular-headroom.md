# Plano de Implementação: Sprint 10.1 — Decomposição Modular <= 280L e Homologação Release v2.0.0 Enterprise

> **Branch:** `main`  
> **Status:** Concluído com Sucesso  
> **Metodologia:** Superpowers + Vibe Coding (TDD Red-Green-Refactor, Ponytail Full, Teto Modular Estrito, Verification Before Completion)

---

## 1. Visão Geral e Arquitetura

A **Sprint 10.1 (Fechamento e Homologação da Release v2.0.0 Enterprise)** realiza a refatoração cirúrgica preventiva dos 7 arquivos do sistema que se encontram na faixa de 330 a 347 linhas, trazendo cada um para **<= 280 linhas** (com alvo de <= 250 linhas) e garantindo folga estrutural permanente no projeto:

1. `services/executive/controlTowerService.js` (347L -> 213L)  
   -> Extração de `gerarFilaAlertasCriticosComando` para `services/executive/controlTowerAlertsHelper.js` (160L) com re-export intacto.
2. `routes/crm_manutencao_oportunidades.routes.js` (343L -> 231L)  
   -> Extração das rotas de follow-up e conversão para `routes/crm_oportunidades_conversao.routes.js` (140L) montadas sem quebra.
3. `services/billing/fleetBorderoService.js` (341L -> 269L)  
   -> Extração de `listarOSFaturaveisPorCliente` e `formatarNotificacaoWhatsAppBordero` para `services/billing/fleetBorderoGroupingHelper.js` (95L).
4. `js/modules/orcamento_parcial_ui.js` (340L -> 223L)  
   -> Extração dos handlers de ação para `js/modules/orcamento_parcial_actions.js` (134L).
5. `js/modules/crm_conversao_oportunidades_ui.js` (336L -> 222L)  
   -> Extração das actions para `js/modules/crm_conversao_oportunidades_actions.js` (130L).
6. `js/modules/events_patio_os.js` (333L -> 237L)  
   -> Extração dos sub-handlers de CRM e apontamento para `js/modules/events_patio_os_crm_delegate.js` (155L).
7. `services/fiscal/b2bFiscalClosingService.js` (332L -> 252L)  
   -> Extração de `exportarLoteContabilFiscal` para `services/fiscal/b2bFiscalAccountingExportHelper.js` (70L).

---

## 2. Guardrails de Tamanho e Arquivos

Todos os arquivos refatorados e seus novos submódulos respeitam estritamente:
- Teto individual: **<= 280 linhas** (alvo <= 250 linhas cumprido em 12 dos 14 arquivos; os outros 2 estão em 252L e 269L).
- Zero quebra de contratos públicos (preservação 100% dos métodos exportados e binds em `window`/`globalThis`).
- Isolamento do banco de dados: `data/database.json` nunca alterado por testes.
- Versionamento canônico atualizado para `2.0.0`.

---

## 3. Tarefas de Implementação

- [x] **Task 1: Suíte de Certificação Arquitetural v2.0.0 (TDD RED)**
  - Criar `tests/sprint101_release_v200_modular_headroom.test.cjs`.
  - Executar e confirmar falha inicial (RED em contagem de linhas).
- [x] **Task 2: Refatoração de `controlTowerService.js` (GREEN)**
  - Criar `services/executive/controlTowerAlertsHelper.js`.
  - Atualizar `controlTowerService.js` com re-export.
- [x] **Task 3: Refatoração de `crm_manutencao_oportunidades.routes.js` (GREEN)**
  - Criar `routes/crm_oportunidades_conversao.routes.js`.
  - Atualizar rotas e montar no router principal.
- [x] **Task 4: Refatoração de `fleetBorderoService.js` (GREEN)**
  - Criar `services/billing/fleetBorderoGroupingHelper.js`.
  - Atualizar `fleetBorderoService.js` com re-export.
- [x] **Task 5: Refatoração de `orcamento_parcial_ui.js` (GREEN)**
  - Criar `js/modules/orcamento_parcial_actions.js`.
  - Atualizar `orcamento_parcial_ui.js` e registrar script no `index.html`.
- [x] **Task 6: Refatoração de `crm_conversao_oportunidades_ui.js` (GREEN)**
  - Criar `js/modules/crm_conversao_oportunidades_actions.js`.
  - Atualizar `crm_conversao_oportunidades_ui.js` e registrar script no `index.html`.
- [x] **Task 7: Refatoração de `events_patio_os.js` (GREEN)**
  - Criar `js/modules/events_patio_os_crm_delegate.js`.
  - Atualizar `events_patio_os.js` e registrar script no `index.html`.
- [x] **Task 8: Refatoração de `b2bFiscalClosingService.js` (GREEN)**
  - Criar `services/fiscal/b2bFiscalAccountingExportHelper.js`.
  - Atualizar `b2bFiscalClosingService.js` com re-export.
- [x] **Task 9: Atualização de Versão e Documentação de Release v2.0.0**
  - Atualizar `package.json` para versão `"2.0.0"`.
  - Atualizar `progress.md` e `README.md`.
- [x] **Task 10: Protocolo de Homologação Final e Quality Gates**
  - Suíte Sprint 10.1 (GREEN).
  - Gate Modular de Linhas (`modular_file_size_gate.test.cjs`).
  - Auditoria de UI (`ui_actions_and_bindings_audit.test.cjs`).
  - Smoke E2E (`server_smoke_e2e.test.cjs`).
  - Isolamento do banco verificado.
  - Manifesto SHA-256 regenerado e validado (`clean_install_manifest.test.cjs`).
  - `npm test` completo com 100% de aprovação.
  - Commit semântico e push para `origin/main`.
