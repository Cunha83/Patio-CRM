# Plano de Implementação: Implantação e Operação do Piloto Controlado do Pátio CRM

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preparar o pacote operacional de implantação do piloto controlado para uma oficina pesada diesel, fornecendo versão congelada reprodutível, scripts de backup WAL e restauração isolada comprovados, supervisão de processo Windows, alinhamento de concorrência dos testes e manuais objetivos para os operadores.

**Architecture:** Scripts operacionais Node.js v24 autônomos; backup SQLite WAL com `VACUUM INTO` e arquivamento de uploads; supervisor de processo com detecção ativa de porta TCP; documentação operacional estruturada com checklists de prontidão rigorosos.

**Tech Stack:** Node.js v24, SQLite WAL (better-sqlite3 / sqlite3), Express, PowerShell / Batch scripts.

---

### Task 1: Alinhamento do Comando Oficial de Testes em `package.json`
- [x] Modify: `package.json` (adicionar `--test-concurrency=2` ao script `test`)
- [x] Verify: Executar `npm test` e validar execução idêntica à homologação.

### Task 2: Versão Congelada Reprodutível e Manifesto de Release
- [x] Create: `scripts/gerar_manifesto_release.cjs`
- [x] Create: `docs/operacao/MANIFESTO_RELEASE_PILOTO_2026-09-21.md`
- [x] Produce: Registro de versão, commit, dependências travadas, exclusão rigorosa de segredos/banco/uploads e matriz de hashes SHA-256.

### Task 3: Procedimento Operacional de Backup WAL e Restauração Isolada
- [x] Create: `scripts/executar_backup_operacional.cjs`
- [x] Create: `scripts/testar_restauracao_isolada.cjs`
- [x] Verify: Executar o ensaio de restauração isolada em pasta temporária sem afetar `patio.db` e registrar as evidências de integridade (`PRAGMA integrity_check = ok`).

### Task 4: Execução Supervisionada no Windows com Prevenção de Concorrência
- [x] Create: `scripts/supervise_patio.cjs`
- [x] Create: `scripts/iniciar_piloto.bat`
- [x] Create: `docs/operacao/SUPERVISAO_WINDOWS.md`
- [x] Verify: Testar detecção de porta ocupada (porta 3000) e geração de logs estruturados.

### Task 5: Documentação Operacional, Perfis, Checklists e Roteiro 5S
- [x] Create: `docs/operacao/CONFIGURACAO_PILOTO.md`
- [x] Create: `docs/operacao/CHECKLIST_INICIO_PILOTO.md`
- [x] Create: `docs/operacao/GUIA_OPERACIONAL_PILOTO.md`
- [x] Create: `docs/operacao/ROTINA_FECHAMENTO_DIARIO.md`
- [x] Create: `docs/operacao/REGISTRO_INCIDENTES.md`

### Task 6: Validação Final, Auditoria Frontend com `agent-browser` e Parecer
- [x] Run: `npm test`
- [x] Run: `node scripts/run_agent_browser_verified.cjs`
- [x] Verify: Relatório final de prontidão com itens Comprovados e Pendentes honestamente assinalados.
