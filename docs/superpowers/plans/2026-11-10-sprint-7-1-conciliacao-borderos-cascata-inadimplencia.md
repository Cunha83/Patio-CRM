# Sprint 7.1: Conciliação Financeira de Borderôs B2B, Baixa em Cascata nas OSs/Comissões & Trava de Inadimplência Frotista

> **Goal:** Implementar o motor de conciliação e liquidação financeira de borderôs frotistas com baixa em cascata (total e parcial cronológica) refletida nas OSs filhas e liberação automática de comissões técnicas retidas sob o gatilho `os_recebida`, além do guardião de crédito e política de inadimplência frotista com trava de aprovação de novas operações e override gerencial auditável.

**Architecture:**
- `services/billing/fleetBorderoSettlementService.js` (<= 350 linhas): Liquidação total e parcial de borderôs B2B, baixa em cascata nas OSs filhas (`pago = true`), atualização de `state.contas`, estorno auditado e extrato de liquidações.
- `services/billing/fleetDelinquencyGuardService.js` (<= 350 linhas): Configuração de limites e tolerâncias de crédito, análise de risco (borderôs vencidos e exposição financeira) e validação de travas com override gerencial em `state.creditOverrideLogs`.
- `routes/financeiro_bordero_inadimplencia.routes.js` (<= 350 linhas): Endpoints REST montados em `routes/index.js`.
- `js/modules/financeiro_bordero_conciliacao_ui.js` (<= 350 linhas): Painel visual de recebíveis B2B, semáforo de crédito e modais de liquidação e política de crédito.
- `js/modules/financeiro_bordero_conciliacao_actions.js` (<= 350 linhas): Handlers e delegação DOM sem alterar `events_patio_os.js`.
- `tests/sprint71_bordero_settlement_delinquency_guard.test.cjs` (<= 350 linhas): Testes unitários, de integração em cascata (Fase 5+6+7), regras de bloqueio e endpoints HTTP.

---

## Tasks

### Task 1: Motor de Conciliação e Baixa em Cascata (`fleetBorderoSettlementService.js`)
- [ ] Criar testes unitários em `tests/sprint71_bordero_settlement_delinquency_guard.test.cjs` para liquidação total com cascata nas OSs (`pago = true`, `statusPagamento = 'pago'`), sincronização com `state.contas` e desbloqueio de comissões `os_recebida`, liquidação parcial cronológica e estorno.
- [ ] Confirmar falha (RED).
- [ ] Implementar `services/billing/fleetBorderoSettlementService.js` (<= 350 linhas).
- [ ] Confirmar aprovação (GREEN).

### Task 2: Guardião de Crédito e Trava de Inadimplência (`fleetDelinquencyGuardService.js`)
- [ ] Adicionar testes para tolerância de atraso, bloqueio por borderô vencido (`FLEET_DELINQUENCY_CREDIT_BLOCKED`), estouro de limite de crédito global e liberação auditada via override com gravação em `state.creditOverrideLogs`.
- [ ] Confirmar falha (RED).
- [ ] Implementar `services/billing/fleetDelinquencyGuardService.js` (<= 350 linhas).
- [ ] Confirmar aprovação (GREEN).

### Task 3: Endpoints REST (`financeiro_bordero_inadimplencia.routes.js`)
- [ ] Adicionar testes de integração HTTP cobrindo as 6 rotas REST.
- [ ] Implementar `routes/financeiro_bordero_inadimplencia.routes.js` (<= 350 linhas) e registrar em `routes/index.js`.
- [ ] Confirmar aprovação (GREEN).

### Task 4: Frontend UI & Eventos (`financeiro_bordero_conciliacao_ui.js` & `actions.js`)
- [ ] Implementar `js/modules/financeiro_bordero_conciliacao_ui.js` (<= 350 linhas) e `js/modules/financeiro_bordero_conciliacao_actions.js` (<= 350 linhas).
- [ ] Registrar ambos em `index.html`.
- [ ] Validar binds no sandbox e rodar `ui_actions_and_bindings_audit.test.cjs`.
- [ ] Confirmar aprovação (GREEN).

### Task 5: Quality Gates, Homologação e Fechamento
- [ ] Validar teto modular (`modular_file_size_gate.test.cjs`).
- [ ] Validar auditoria de UI (`ui_actions_and_bindings_audit.test.cjs`).
- [ ] Verificar isolamento de banco de dados (`data/database.json`).
- [ ] Atualizar manifesto de release (`gerar_manifesto_release.cjs`) e validar (`clean_install_manifest.test.cjs`).
- [ ] Executar suíte completa (`npm test`).
- [ ] Commit semântico e push para `main`.

