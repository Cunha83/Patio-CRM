# Plano de Implementação: Correção do Reinício do Supervisor e Política de Agendamento do Piloto

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corrigir a retenção da trava do supervisor durante quedas e reinícios do processo filho, adicionar teste com falha inicial e recuperação bem-sucedida com bloqueio contínuo de concorrentes, configurar a política oficial de não-sobreposição do Agendador de Tarefas do Windows (`MultipleInstancesPolicy=IgnoreNew`), ampliar os testes de instalação limpa e atualizar o manifesto e checklist com as evidências reais.

**Architecture:** Node.js v24, Windows Task Scheduler XML/PowerShell API, Supervisor de Processo com desacoplamento entre trava do processo mestre e ciclo de vida dos filhos.

**Tech Stack:** Node.js, PowerShell, Windows Task Scheduler API, SQLite WAL.

**Spec:** `docs/superpowers/specs/2026-09-21-operational-package-revision-design.md`

## Global Constraints
- Preservar 100% o núcleo funcional do CRM, os scripts de backup externo e o banco operacional `patio.db`.
- Todos os testes de processos, travas e agendamentos devem rodar em diretórios e portas temporários.
- Nenhuma dependência externa nova.

---

### Task 1: Correção do Supervisor para Retenção de Trava em Reinícios do Filho

**Files:**
- Modify: `scripts/supervise_patio.cjs`
- Modify: `tests/supervisor_isolated.test.cjs`

**Interfaces:**
- `acquireInstanceLock()` é chamada uma única vez no início do supervisor.
- `spawnChild()` instancia o filho sem tentar re-adquirir a trava.
- `restartsInLastMinute` gerencia a proteção anti-loop.
- `tests/supervisor_isolated.test.cjs` testa: filho com falha inicial (código 7) que recupera na 2ª vez, com o supervisor vivo e segundo supervisor bloqueado.

- [ ] **Step 1: Escrever teste de reinício com falha inicial e bloqueio contínuo de concorrente em `tests/supervisor_isolated.test.cjs`**
- [ ] **Step 2: Executar teste e validar falha**
- [ ] **Step 3: Refatorar `scripts/supervise_patio.cjs` separando `startSupervisor()` de `spawnChild()`**
- [ ] **Step 4: Re-executar teste e garantir 100% de aprovação**

---

### Task 2: Correção do Agendador de Tarefas do Windows (`MultipleInstancesPolicy=IgnoreNew`)

**Files:**
- Create: `scripts/gerar_tarefa_agendada_windows.cjs`
- Create: `docs/operacao/PatioCRM_Backup_WAL.xml`
- Modify: `docs/operacao/SUPERVISAO_WINDOWS.md`
- Create: `tests/scheduled_task_config.test.cjs`

**Interfaces:**
- `docs/operacao/PatioCRM_Backup_WAL.xml` contém `<MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>`.
- `SUPERVISAO_WINDOWS.md` retira menção incorreta de `/np` como anti-sobreposição e documenta o registro via PowerShell e XML oficial.
- `tests/scheduled_task_config.test.cjs` valida o XML, caminhos e ausência do equívoco de `/np`.

- [ ] **Step 1: Criar script gerador e exportar `docs/operacao/PatioCRM_Backup_WAL.xml`**
- [ ] **Step 2: Atualizar `docs/operacao/SUPERVISAO_WINDOWS.md` com instruções oficiais do Task Scheduler**
- [ ] **Step 3: Criar e rodar `tests/scheduled_task_config.test.cjs` para validar a configuração**

---

### Task 3: Rotulagem e Ampliação dos Testes de Instalação Limpa

**Files:**
- Modify: `tests/clean_install_manifest.test.cjs`

**Interfaces:**
- Rotula teste existente como "Cópia, Integridade Criptográfica e Sintaxe de Código a partir do Manifesto".
- Adiciona teste de boot funcional temporário em diretório limpo verificando `/health`.

- [ ] **Step 1: Atualizar `tests/clean_install_manifest.test.cjs` com rotulagem precisa e teste de boot funcional**
- [ ] **Step 2: Executar `node --test tests/clean_install_manifest.test.cjs` e validar aprovação**

---

### Task 4: Regeneração do Manifesto, Reexecução da Suíte e Atualização do Checklist

**Files:**
- Run: `scripts/gerar_manifesto_release.cjs`
- Output: `docs/operacao/manifesto_release.json`
- Output: `docs/operacao/MANIFESTO_RELEASE_PILOTO_2026-09-21.md`
- Modify: `docs/operacao/CHECKLIST_INICIO_PILOTO.md`
- Run: `npm test`
- Run: `node scripts/run_agent_browser_verified.cjs`
- Output: `walkthrough.md`

- [ ] **Step 1: Regenerar manifesto de release com os scripts atualizados**
- [ ] **Step 2: Reexecutar suíte completa de testes (`npm test`)**
- [ ] **Step 3: Reexecutar validação de frontend via `agent-browser` (Vercel)**
- [ ] **Step 4: Atualizar `docs/operacao/CHECKLIST_INICIO_PILOTO.md` e `walkthrough.md` com as evidências finais reais**
