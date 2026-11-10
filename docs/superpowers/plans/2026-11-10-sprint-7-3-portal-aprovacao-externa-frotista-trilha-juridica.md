# Plano de Implementação — Sprint 7.3: Portal/Link Tokenizado de Aprovação Externa B2B & Destravamento de Box

## Objetivo
Implementar o motor de links tokenizados seguros para aprovação externa por gestores de frota, com trilha jurídica criptográfica (SHA-256), dupla validação de guardiões (inadimplência e budget de Centro de Custo) e destravamento automático de Box com gargalo `aguardando_aprovacao_frotista`.

---

## Módulos e Guardrails
- `services/quotation/externalFleetApprovalService.js` (NOVO, <= 350 linhas)
- `routes/aprovacao_externa_frotista.routes.js` (NOVO, <= 350 linhas)
- `js/modules/aprovacao_externa_frotista_ui.js` (NOVO, <= 350 linhas)
- `js/modules/aprovacao_externa_frotista_actions.js` (NOVO, <= 350 linhas)
- `tests/sprint73_external_fleet_approval_portal.test.cjs` (NOVO, <= 350 linhas)
- **ARQUIVOS CRÍTICOS INTOCADOS:**
  - `routes/crm_manutencao_oportunidades.routes.js` (343 linhas)
  - `services/billing/fleetBorderoService.js` (341 linhas)
  - `js/modules/orcamento_parcial_ui.js` (339 linhas)
  - `js/modules/crm_conversao_oportunidades_ui.js` (336 linhas)
  - `js/modules/events_patio_os.js` (333 linhas)
  - `services/quotation/partialApprovalService.js` (294 linhas - não inflar, reutilizar via import)

---

## Fases de Execução (TDD)
- **Task 1: Motor de Link Tokenizado e Decisão Externa B2B** (`externalFleetApprovalService.js`)
  - Geração de token criptográfico com invalidação de pendentes anteriores da mesma OS.
  - Consulta pública sanitizada por token (`consultarOrcamentoPorTokenPublico`).
  - Submissão de decisão (`submeterDecisaoExternaFrotista`):
    - Trava de inadimplência frotista (Sprint 7.1).
    - Trava de budget de Centro de Custo (Sprint 5.2).
    - Execução de aprovação parcial via `processarAprovacaoParcial` (Sprint 5.1).
    - Destravamento automático de gargalo de Box `aguardando_aprovacao_frotista` (Sprint 6.3).
    - Trilha jurídica imutável com hash SHA-256 e IP/Documento.
- **Task 2: Endpoints REST** (`aprovacao_externa_frotista.routes.js`)
  - Endpoints de gestão de tokens e endpoints públicos do portal externo do frotista.
  - Registro em `routes/index.js`.
- **Task 3: Interface Visual e Ações DOM** (`aprovacao_externa_frotista_ui.js` & `actions.js`)
  - Painel de auditoria de links, modal de geração de link e modal de preview do portal externo.
  - Listener delegado de cliques (`[data-act]`), mantendo `events_patio_os.js` intocado.
  - Registro em `index.html`.
- **Task 4: Quality Gates e Homologação Final**
  - Modular file size gate (<= 350 linhas).
  - UI dead clicks audit gate.
  - Isolamento de `data/database.json`.
  - Manifesto SHA-256 e clean install test.
  - Suíte completa `npm test` (0 falhas). Commit e push.

