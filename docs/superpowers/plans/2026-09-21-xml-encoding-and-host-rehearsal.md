# Plano de Implementação: Correção de Codificação/Escape XML e Ensaio Operacional no Host

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corrigir a declaração e codificação do XML da tarefa agendada para UTF-8, aplicar escape canônico a caracteres especiais (especialmente `&`), validar os bytes gravados com o parser XML real do Windows (.NET `XmlReader`), preparar o script de ensaio pré-operacional no host com restauração e aferição de etapas (APROVADO/PENDENTE/FALHOU), regenerar o manifesto de release e auditar o checklist com as evidências reais.

**Architecture:** Windows Task Scheduler 2.0 XML Specification, .NET `XmlReader` Parser via PowerShell, SQLite WAL Backup & Disaster Recovery Orchestrator.

**Tech Stack:** Node.js, PowerShell, Windows Task Scheduler API, SQLite WAL.

**Spec:** `docs/superpowers/specs/2026-09-21-xml-encoding-and-host-rehearsal-design.md`

## Global Constraints
- Nenhuma dependência externa nova no `package.json`.
- A base real `patio.db` permanece 100% intocada.
- Todos os testes de processos, travas, XML e ensaios devem rodar em diretórios e portas temporários.
- Preservar rigorosamente `MultipleInstancesPolicy=IgnoreNew`.

---

### Task 1: Correção do Gerador XML (UTF-8 e Escape de Entidades)
**Files:**
- Modify: `scripts/gerar_tarefa_agendada_windows.cjs`
- Output: `docs/operacao/PatioCRM_Backup_WAL.xml`

**Interfaces:**
- `escapeXml(str)`: substitui `&`, `<`, `>`, `"`, `'` por entidades seguras.
- `buildTaskXml(options)`: declara `encoding="UTF-8"`, aplica `escapeXml` e mantém `MultipleInstancesPolicy=IgnoreNew`.
- `gerarArquivoXml()`: grava em UTF-8 e atualiza `docs/operacao/PatioCRM_Backup_WAL.xml`.

- [ ] **Step 1: Implementar escapeXml e declaração UTF-8 em `scripts/gerar_tarefa_agendada_windows.cjs`**
- [ ] **Step 2: Executar o script para regenerar `docs/operacao/PatioCRM_Backup_WAL.xml`**

---

### Task 2: Teste Automatizado com Parser XML Real do Windows
**Files:**
- Modify: `tests/scheduled_task_config.test.cjs`

**Interfaces:**
- Executa PowerShell com `[System.Xml.XmlReader]::Create(path)` para ler o XML gravado no disco.
- Testa caminhos com `&` (ex.: `C:\Oficina & Cia\node.exe`).
- Verifica que o parser aprova sem erro de BOM ou Unicode.
- Verifica a integridade dos nós `<MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>`, `<Interval>PT1H</Interval>` e `<WorkingDirectory>`.

- [ ] **Step 1: Adicionar teste com parser XML real e caminho com `&` em `tests/scheduled_task_config.test.cjs`**
- [ ] **Step 2: Executar `node --test tests/scheduled_task_config.test.cjs` e validar 100% de sucesso**

---

### Task 3: Script e Execução de Ensaio Operacional no Host
**Files:**
- Create: `scripts/ensaio_operacional_host.cjs`
- Output: `docs/evidencias/ensaio_operacional_host_2026-09-21.json`

**Interfaces:**
- Validação de ambiente: dependências do lockfile (`package-lock.json`), caminhos do host, conta de serviço e acesso a `BACKUP_EXTERNAL_DIR`.
- Ensaio de backup físico agendado para o destino externo.
- Ensaio de restauração isolada a partir exclusivamente do pacote externo (boot, login, OS e anexo).
- Emissão do relatório estruturado com status `APROVADO`, `PENDENTE` ou `FALHOU` para cada marco operacional.

- [ ] **Step 1: Criar o script `scripts/ensaio_operacional_host.cjs`**
- [ ] **Step 2: Executar o ensaio e gerar evidência estruturada**

---

### Task 4: Regeneração do Manifesto, Testes Dirigidos e Checklist
**Files:**
- Run: `scripts/gerar_manifesto_release.cjs`
- Output: `docs/operacao/manifesto_release.json`
- Output: `docs/operacao/MANIFESTO_RELEASE_PILOTO_2026-09-21.md`
- Modify: `docs/operacao/CHECKLIST_INICIO_PILOTO.md`
- Modify: `walkthrough.md`

- [ ] **Step 1: Regenerar manifesto de release oficial**
- [ ] **Step 2: Executar bateria de testes dirigidos (supervisor, agendamento, instalação/boot e recuperação)**
- [ ] **Step 3: Atualizar `docs/operacao/CHECKLIST_INICIO_PILOTO.md` e `walkthrough.md` com as evidências reais**
