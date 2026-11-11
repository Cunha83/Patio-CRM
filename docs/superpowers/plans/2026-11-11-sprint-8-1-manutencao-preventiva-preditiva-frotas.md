# Plano de Execução: Sprint 8.1 — Manutenção Preventiva Preditiva de Frotas Pesadas

## Visão Geral
Abertura da Fase 8 do Pátio-CRM:
1. Motor de Manutenção Preventiva Preditiva de Frotas (`services/crm/fleetPredictiveMaintenanceService.js`)
2. Gancho enxuto no Agente WhatsApp (`services/whatsapp/whatsappAgentSkillsService.js`)
3. Endpoints REST (`routes/crm_preventiva_preditiva.routes.js`) montados em `routes/index.js`
4. Interface e Ações Frontend (`js/modules/crm_preventiva_preditiva_ui.js` e `js/modules/crm_preventiva_preditiva_actions.js`)
5. Suíte de Testes TDD (`tests/sprint81_predictive_maintenance_whatsapp_rule.test.cjs`) e Homologação Final

## Guardrails e Limites Arquiteturais
- Teto modular estrito <= 350 linhas por arquivo.
- `events_patio_os.js` mantido intocado em 333 linhas.
- `routes/crm_manutencao_oportunidades.routes.js` mantido intocado em 343 linhas.
- `services/billing/fleetBorderoService.js` mantido intocado em 341 linhas.
- `js/modules/orcamento_parcial_ui.js` mantido intocado em 339 linhas.
- `js/modules/crm_conversao_oportunidades_ui.js` mantido intocado em 336 linhas.
- `services/quotation/externalFleetApprovalService.js` mantido intocado em 313 linhas.
- `services/finance/executiveDreBreakEvenService.js` mantido intocado em 301 linhas.
- Isolamento absoluto de `data/database.json`.
- Zero cliques mortos (`ui_actions_and_bindings_audit.test.cjs`).

## Tarefas
- Task 1: Motor Preditivo de Preventiva (`fleetPredictiveMaintenanceService.js`) e gancho no WhatsApp (`whatsappAgentSkillsService.js`).
- Task 2: Rotas REST da Preventiva Preditiva (`crm_preventiva_preditiva.routes.js`).
- Task 3: Interface Visual e Ações DOM (`crm_preventiva_preditiva_ui.js` e `crm_preventiva_preditiva_actions.js`).
- Task 4: Quality Gates, Clean Install SHA-256 e Homologação com `npm test`.
