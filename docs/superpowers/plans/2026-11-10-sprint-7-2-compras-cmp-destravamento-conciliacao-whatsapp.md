# Plano de Implementação — Sprint 7.2: Compras Pesadas com CMP, Destravamento de Box, Conciliação Bancária & Agente WhatsApp Multi-Skill

## Objetivo
Implementar o ciclo de compras de peças pesadas com cálculo de Custo Médio Ponderado (CMP), baixa e destravamento automático de Box com gargalo `aguardando_peca`, motor de conciliação bancária multi-formato (PDF, OFX/CNAB, API) e Agente WhatsApp Multi-Skill (Recepção de Pátio e Analista Financeiro da Gerência com RBAC).

---

## Módulos e Guardrails
- `services/inventory/heavyPartsPurchaseOrderService.js` (NOVO, <= 350 linhas)
- `services/finance/bankStatementReconciliationService.js` (NOVO, <= 350 linhas)
- `services/whatsapp/whatsappAgentSkillsService.js` (NOVO, <= 350 linhas)
- `routes/suprimentos_whatsapp_conciliacao.routes.js` (NOVO, <= 350 linhas)
- `js/modules/suprimentos_whatsapp_conciliacao_ui.js` (NOVO, <= 350 linhas)
- `js/modules/suprimentos_whatsapp_conciliacao_actions.js` (NOVO, <= 350 linhas)
- `tests/sprint72_purchases_cmp_whatsapp_reconciliation.test.cjs` (NOVO, <= 350 linhas)
- **ARQUIVOS CRÍTICOS INTOCADOS:**
  - `routes/crm_manutencao_oportunidades.routes.js` (343 linhas)
  - `services/billing/fleetBorderoService.js` (341 linhas)
  - `js/modules/orcamento_parcial_ui.js` (339 linhas)
  - `js/modules/crm_conversao_oportunidades_ui.js` (336 linhas)
  - `js/modules/events_patio_os.js` (333 linhas)

---

## Fases de Execução (TDD)
- **Task 1: Motor de Compras, CMP e Destravamento de Box** (`heavyPartsPurchaseOrderService.js`)
  - Testes: criação de pedido, recebimento de NF com recálculo CMP, geração de Contas a Pagar, reserva atômica na OS, encerramento de gargalo `aguardando_peca` e destravamento do box para `ocupado`.
  - Margem real de peças (`calcularMargemRealOSPecas`).
- **Task 2: Motor de Conciliação Bancária Multi-Formato** (`bankStatementReconciliationService.js`)
  - Testes: parser PDF texto, OFX/CNAB e API JSON.
  - Baixa de borderô B2B em cascata nas OSs e comissões `'os_recebida'`. Baixa de contas a pagar de fornecedores no débito.
- **Task 3: Agente WhatsApp Multi-Skill** (`whatsappAgentSkillsService.js`)
  - Testes: roteamento de intenção, Skill Recepção (consulta de box/gargalo por placa e pré-check-in), Skill Analista Financeiro (RBAC 403 para não gerentes, conciliação de extrato via WhatsApp, briefing executivo).
- **Task 4: Rotas REST** (`suprimentos_whatsapp_conciliacao.routes.js`)
  - Testes HTTP dos endpoints de pedidos, margem, conciliação e webhook do WhatsApp.
- **Task 5: Frontend UI & Event Actions** (`suprimentos_whatsapp_conciliacao_ui.js` & `actions.js`)
  - Componentes, modais e delegação isolada de cliques (`data-act`). Registro no `index.html`.
- **Task 6: Quality Gates & Homologação**
  - Gate de tamanho modular (<= 350 linhas).
  - Gate de cliques mortos (zero dead clicks).
  - Integridade de `data/database.json`.
  - Manifesto SHA-256 e clean install test.
  - Suíte completa `npm test` (0 falhas). Commit e push.

