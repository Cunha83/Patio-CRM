# Sprint 11.3 — Implementation Plan
# Cofre de Snapshot/Backup Atômico com SHA-256, Auditoria de Integridade Cruzada do ERP & Release v2.1.0 Autonomous Enterprise

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar e homologar a Sprint 11.3, fechando a Fase 11 e certificando a Release v2.1.0 (Autonomous Enterprise) com:
1. Cofre de Snapshot/Restore atômico com verificação anti-adulteração SHA-256 (`services/ops/productionBackupAuditService.js`);
2. Motor de Auditoria de Integridade Cruzada cobrindo os 4 pilares do ERP (Pátio/Boxes, Crédito por clienteId, Estoque CMP e Filas WhatsApp) com opção de auto-reparo de inconsistências leves;
3. Rotas REST (`routes/ops_backup_auditoria.routes.js`) montadas em `routes/index.js`;
4. Painel de UI e Ações (`js/modules/ops_backup_auditoria_ui.js` e `actions.js`) integrados em `index.html` com zero cliques mortos;
5. Suíte TDD abrangente (`tests/sprint113_production_backup_vault_cross_audit.test.cjs`);
6. Bump de versão para `2.1.0` em `package.json`, atualização do `progress.md`, validação de todos os Quality Gates e manifesto SHA-256 limpo.

---

## Global Constraints
- Todos os arquivos do repositório devem permanecer estritamente `<= 350` linhas (meta `<= 260` linhas para novos arquivos).
- `js/modules/events_patio_os.js` permanece estritamente intocado em 237 linhas.
- `data/database.json` nunca deve sofrer mutação durante testes (isolamento via `test-preload.cjs`).
- Zero cliques mortos: todos os botões e links com `data-act` devem possuir handlers implementados.

---

## Tarefas de Execução

### Task 1: [Backend] Cofre de Snapshot/Restore & Auditor de Integridade Cruzada
**Files:**
- Create: `services/ops/productionBackupAuditService.js`
- Test: `tests/sprint113_production_backup_vault_cross_audit.test.cjs`

- [ ] Criar `services/ops/productionBackupAuditService.js` (meta <= 265 linhas) implementando:
  - `gerarSnapshotBackupCriptografado(state, options)`
  - `validarERestaurarSnapshotBackup(state, snapshotInput, options)`
  - `executarAuditoriaIntegridadeCruzadaErp(state, options)`
  - `listarHistoricoSnapshotsEAuditorias(state)`
- [ ] Validar hash SHA-256 anti-tamper (422 se adulterado 1 centavo) e restauração atômica.
- [ ] Validar auditoria dos 4 pilares e auto-reparo de inconsistências leves.

### Task 2: [Backend] Rotas REST & Montagem
**Files:**
- Create: `routes/ops_backup_auditoria.routes.js`
- Modify: `routes/index.js`
- Test: `tests/sprint113_production_backup_vault_cross_audit.test.cjs`

- [ ] Criar `routes/ops_backup_auditoria.routes.js` (meta <= 185 linhas) com 4 endpoints:
  - `POST /api/ops/backups/gerar-snapshot`
  - `POST /api/ops/backups/restaurar-snapshot`
  - `GET  /api/ops/backups/historico`
  - `POST /api/ops/auditoria/integridade-cruzada`
- [ ] Montar em `routes/index.js` antes de `coreLoop.routes`.

### Task 3: [Frontend] Módulos UI, Ações e Registro
**Files:**
- Create: `js/modules/ops_backup_auditoria_ui.js`
- Create: `js/modules/ops_backup_auditoria_actions.js`
- Modify: `index.html`

- [ ] Criar `ops_backup_auditoria_ui.js` com painel de governança, cards de integridade e modais.
- [ ] Criar `ops_backup_auditoria_actions.js` com delegação de eventos click (`data-act`).
- [ ] Registrar ambos os scripts em `index.html`.

### Task 4: [TDD] Suíte de Testes da Sprint 11.3
**Files:**
- Create: `tests/sprint113_production_backup_vault_cross_audit.test.cjs`

- [ ] Implementar suíte de testes (meta <= 350 linhas) cobrindo:
  - Geração de snapshot com checksum SHA-256 determinístico de 64 caracteres.
  - Bloqueio imediato com 422 `BACKUP_INTEGRITY_HASH_MISMATCH` se o backup for adulterado.
  - Exigência de confirmação explícita (`RESTORE_CONFIRMATION_REQUIRED` 400).
  - Restauração atômica devolvendo o estado exato de todas as coleções.
  - Auditoria de integridade detectando box órfão, CMP/estoque negativo, cliente e DLQ.
  - Auto-reparo elevando o `scoreIntegridadeErp`.
  - UI HTML e actions globais.
- [ ] Executar suíte: `node --require ./scripts/test-preload.cjs --test tests/sprint113_production_backup_vault_cross_audit.test.cjs`.

### Task 5: [Release v2.1.0] Quality Gates, Bump de Versão e Homologação Final
- [ ] Atualizar `package.json` para `"version": "2.1.0"`.
- [ ] Atualizar `progress.md` com a Release v2.1.0 Autonomous Enterprise.
- [ ] Executar `node --test tests/modular_file_size_gate.test.cjs`.
- [ ] Executar `node --require ./scripts/test-preload.cjs --test tests/ui_actions_and_bindings_audit.test.cjs`.
- [ ] Executar `node --require ./scripts/test-preload.cjs --test tests/server_smoke_e2e.test.cjs`.
- [ ] Regenerar manifesto: `node scripts/gerar_manifesto_release.cjs`.
- [ ] Certificar instalação limpa: `node --require ./scripts/test-preload.cjs --test tests/clean_install_manifest.test.cjs`.
- [ ] Executar suíte completa: `npm test` (0 falhas).
- [ ] Commit semântico e `git push origin main`.

