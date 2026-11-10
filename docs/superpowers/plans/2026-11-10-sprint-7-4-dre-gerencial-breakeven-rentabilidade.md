# Plano de Execução: Sprint 7.4 — DRE Gerencial Dual, Ponto de Equilíbrio & Rentabilidade por Frota/Box

## Visão Geral
Sprint de fechamento da Fase 7. Implementação do motor de inteligência financeira:
1. DRE Gerencial Dual (Regime de Competência vs. Regime de Caixa)
2. Ponto de Equilíbrio Contábil e Econômico (Break-Even)
3. Ranking de Rentabilidade por Frota B2B e por Box Pesado
4. Integração com a Skill de Analista Financeiro no WhatsApp
5. Endpoints REST, UI/Actions e Verificação Rigorosa

## Guardrails e Limites Arquiteturais
- Teto modular estrito de <= 350 linhas por arquivo.
- `events_patio_os.js` mantido intocado em 333 linhas.
- `routes/crm_manutencao_oportunidades.routes.js` mantido intocado em 343 linhas.
- `services/billing/fleetBorderoService.js` mantido intocado em 341 linhas.
- `js/modules/orcamento_parcial_ui.js` mantido intocado em 339 linhas.
- `js/modules/crm_conversao_oportunidades_ui.js` mantido intocado em 336 linhas.
- Isolamento absoluto de `data/database.json`.

## Tarefas
1. Task 1: Motor DRE Dual, Ponto de Equilíbrio e Rentabilidade (`services/finance/executiveDreBreakEvenService.js`) + Extensão WhatsApp (`services/whatsapp/whatsappAgentSkillsService.js`).
2. Task 2: Rotas REST (`routes/financeiro_dre_rentabilidade.routes.js`) montadas em `routes/index.js`.
3. Task 3: Interface e Ações Frontend (`js/modules/financeiro_dre_rentabilidade_ui.js` e `js/modules/financeiro_dre_rentabilidade_actions.js`) registradas em `index.html`.
4. Task 4: Quality Gates, Clean Install SHA-256 e Homologação Final com `npm test`.

