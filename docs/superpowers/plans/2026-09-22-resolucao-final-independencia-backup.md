# Plano de Implementação: Resolução Definitiva de Armazenamento Independente, Segredo Privado e Auditoria da Tarefa Agendada

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar e auditar com rigor absoluto os 5 requisitos finais de prontidão operacional: rejeição de loopback/mesmo disco, eliminação de tokens hardcoded e fallbacks, auditoria real da execução da tarefa agendada do Windows, comprovação de restauração com novas credenciais rotacionadas e manutenção honesta do checklist como pendente.

**Architecture:** Módulo de backup com validação estrita de rede e volume local (`assertIndependentDestination`), cofre remoto sem fallbacks de token, gerador criptográfico de senhas e token privado, script de auditoria de execução real de agendamento via inspeção de tabela SQLite e logs, e validação E2E no Chromium via `agent-browser`.

**Tech Stack:** Node.js (CommonJS), SQLite3 (WAL mode), Windows Task Scheduler (`schtasks`), `agent-browser` (CDP / Chromium headless).

**Spec:** `docs/superpowers/specs/2026-09-22-resolucao-final-independencia-backup-design.md`

## Global Constraints

- Proibido qualquer token ou senha hardcoded ou com fallback estático em scripts ou documentação.
- Proibido aceitar `127.0.0.1`, `localhost`, `::1` ou o mesmo disco físico como destino independente de backup.
- O sucesso de `schtasks /Query` NÃO comprova o backup: a auditoria deve conferir o registro no SQLite (`deploy-piloto/patio.db`) e arquivos no disco.
- A base de dados raiz `patio.db` deve permanecer estritamente intocada.
- O checklist operacional em `docs/operacao/CHECKLIST_INICIO_PILOTO.md` deve permanecer com status PENDENTE para proteção externa até que o hardware físico dedicado seja plugado.

---

### Task 1: Blindagem de Independência de Armazenamento e Remoção de Fallbacks

**Files:**
- Modify: `scripts/executar_backup_operacional.cjs`
- Modify: `scripts/servico_backup_remoto.cjs`
- Test: `tests/remote_independent_backup.test.cjs`
- Test: `tests/independent_device_backup.test.cjs`

**Interfaces:**
- Consumes: `process.env.BACKUP_REMOTE_URL`, `process.env.BACKUP_REMOTE_TOKEN`, `process.env.BACKUP_EXTERNAL_DIR`
- Produces: `assertIndependentDestination(sourceDir, targetDir, remoteUrl)` lançando `DESTINO_INVALIDO_LOCAL` se apontar para loopback/mesmo host, e erro `CONFIG_SEGURANCA_OBRIGATORIA` se token privado estiver ausente.

- [ ] **Step 1: Escrever testes que falham ao tentar usar localhost como backup remoto ou token padrão**
- [ ] **Step 2: Rodar os testes e confirmar falha esperada**
- [ ] **Step 3: Implementar validação estrita de loopback e remoção de token default em `scripts/executar_backup_operacional.cjs` e `scripts/servico_backup_remoto.cjs`**
- [ ] **Step 4: Rodar os testes e confirmar aprovação**

---

### Task 2: Rotação Criptográfica de Credenciais dos Operadores e Token de Cofre

**Files:**
- Modify: `deploy-piloto/.env`
- Modify: `scripts/provisionar_credenciais_finais.cjs`
- Test: `tests/rbac_permissions_audit.test.cjs`

**Interfaces:**
- Consumes: `deploy-piloto/patio.db`, `userRepository`
- Produces: 3 novas senhas de alta entropia para Gestor, Atendente e Mecânico; novo token de cofre de 64 hex; atualização de hashes Scrypt no SQLite operacional; senhas antigas retornam 401.

- [ ] **Step 1: Atualizar provisionador para gerar novas senhas inéditas de alta entropia e novo token de 64 caracteres**
- [ ] **Step 2: Aplicar rotação ao banco operacional `deploy-piloto/patio.db` e `.env`**
- [ ] **Step 3: Rodar `tests/rbac_permissions_audit.test.cjs` confirmando que senhas antigas são rejeitadas com 401 e novas senhas autenticam**

---

### Task 3: Execução da Tarefa Agendada e Auditoria do Resultado Real

**Files:**
- Modify: `deploy-piloto/scripts/executar_backup_operacional.cjs` (sincronizado)
- Script de Auditoria: `scripts/auditar_execucao_tarefa_agendada.cjs`
- Test: Execução direta de `schtasks /Run /TN "PatioCRM_Backup_WAL"`

**Interfaces:**
- Consumes: Windows Task Scheduler `\PatioCRM_Backup_WAL`, `deploy-piloto/patio.db` tabela `backups`, `deploy-piloto/logs/`
- Produces: Relatório auditado comprovando o que a tarefa agendada realmente executou, o registro gerado no SQLite, o snapshot local WAL e o alerta caso o hardware externo não esteja plugado.

- [ ] **Step 1: Sincronizar script operacional ajustado para `deploy-piloto/scripts/`**
- [ ] **Step 2: Criar script de auditoria `scripts/auditar_execucao_tarefa_agendada.cjs`**
- [ ] **Step 3: Disparar tarefa agendada via `schtasks /Run` e executar a auditoria profunda da execução**

---

### Task 4: Comprovação de Restauração de Pacote Independente com Novas Credenciais

**Files:**
- Modify: `scripts/comprovar_restauracao_remota_host.cjs`
- Test: Execução isolada em pasta temporária

**Interfaces:**
- Consumes: Pacote de backup completo com `manifest.json`, `patio.db`, `uploads/`
- Produces: Restauração validada por recálculo SHA-256 de todos os arquivos, `PRAGMA integrity_check = ok`, boot do servidor e autenticação dos 3 operadores com as novas credenciais.

- [ ] **Step 1: Ajustar `comprovar_restauracao_remota_host.cjs` para usar as novas credenciais rotacionadas e validar integridade rigorosa**
- [ ] **Step 2: Executar ensaio de restauração e gravar log de evidência em `docs/evidencias/`**

---

### Task 5: Homologação no Frontend via `agent-browser` com Credenciais Privadas

**Files:**
- Script: `scripts/homologar_frontend_agent_browser.cjs`
- Evidência: `docs/evidencias/validacao_frontend_operadores_agent_browser.log`

**Interfaces:**
- Consumes: Servidor supervisionado ativo na porta 3000 (`127.0.0.1:3000`), novas credenciais
- Produces: Sessão Chromium via `agent-browser` navegando em `/?tenant=oficina_piloto_01`, realizando login dos 3 operadores, conferindo montagem do DOM, OSs e Blindagem Financeira para o Mecânico.

- [ ] **Step 1: Criar script de validação via `agent-browser`**
- [ ] **Step 2: Executar o teste e coletar evidências de tela e DOM**

---

### Task 6: Atualização Honesta do Checklist como PENDENTE e Manifesto da Release

**Files:**
- Modify: `docs/operacao/CHECKLIST_INICIO_PILOTO.md`
- Modify: `docs/operacao/MANIFESTO_RELEASE_PILOTO_2026-09-21.md`
- Verification: Executar bateria completa de testes com `test-preload.cjs`

- [ ] **Step 1: Reverter status do Critério 2 e Parecer Conclusivo no checklist para PENDENTE (Aguardando Dispositivo Externo Físico)**
- [ ] **Step 2: Recalcular hashes SHA-256 e atualizar manifesto da release**
- [ ] **Step 3: Executar a suíte completa de testes e gerar `walkthrough.md`**
