# Prontidão Operacional e Liberação do Piloto Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finalizar a prontidão operacional do Pátio CRM no host da oficina, implementando proteção não destrutiva no instalador/seed, configurando backup em dispositivo independente B:\ com teste de restauração, deploy supervisionado na porta 3000 com WhatsApp desativado, substituição das credenciais por senhas definitivas com auditoria RBAC e testes frontend com agent-browser, e sincronização não destrutiva da release com checklist atualizado para início do piloto de 5 dias.

**Architecture:** Módulos de proteção anti-data-loss no instalador e no seed, integração com unidade de disco independente para backup WAL, supervisão atômica unificada de processo via locks de exclusividade mútua, auditoria criptográfica de usuários com verificação estrita de RBAC e esteira de testes automatizados dirigidos.

**Tech Stack:** Node.js v24 (CommonJS), Express, SQLite3 com modo WAL, Windows Task Scheduler / PowerShell, Basic Auth / scrypt, Puppeteer / Chromium (agent-browser).

**Spec:** `docs/superpowers/specs/2026-09-22-operational-readiness-design.md`

## Global Constraints
- Nenhuma base de dados existente pode ser apagada ou sobrescrita silenciosamente.
- O banco raiz de desenvolvimento `patio.db` deve permanecer 100% intocado em hash SHA-256 e mtime.
- O supervisor deve manter trava exclusiva e reiniciar o servidor filho sem perder a trava de instância única.
- WhatsApp e emissões fiscais reais permanecem estritamente desativados.
- Todas as credenciais geradas devem cumprir a política estrita de senhas de produção.

---

### Task 1: Proteção Não Destrutiva no Instalador e no Seed

**Files:**
- Modify: `scripts/instalar_pacote_piloto.cjs`
- Modify: `scripts/executar_implantacao_real_piloto.cjs`
- Modify: `scripts/seedDemoDataset.js`
- Test: `tests/installer_and_seed_safety.test.cjs`

**Interfaces:**
- Consumes: `fs.existsSync`, `fs.readdirSync`, `fs.statSync`
- Produces: `DESTINO_JA_EXISTE` throw error, `BANCO_JA_EXISTE` throw error

- [ ] **Step 1: Escrever teste de falha para proteção não destrutiva**
  - Criar `tests/installer_and_seed_safety.test.cjs` testando:
    1. Que `instalarPacoteIndependente()` lança `DESTINO_JA_EXISTE` quando o diretório já existe e contém arquivos, sem apagar nenhum arquivo pré-existente.
    2. Que a rotina de seed recusa operar sobre um arquivo SQLite existente com dados (`BANCO_JA_EXISTE`), preservando intactos o banco e tabelas.
- [ ] **Step 2: Executar o teste para verificar falha inicial**
  - Rodar: `node --test tests/installer_and_seed_safety.test.cjs`
- [ ] **Step 3: Implementar proteção no instalador (`scripts/instalar_pacote_piloto.cjs`)**
  - Remover `fs.rmSync(targetDir, { recursive: true, force: true })` automático.
  - Verificar se `targetDir` existe e tem arquivos: lançar erro `DESTINO_JA_EXISTE` com mensagem explicativa.
- [ ] **Step 4: Implementar proteção no seed (`scripts/executar_implantacao_real_piloto.cjs` e `scripts/seedDemoDataset.js`)**
  - Remover limpeza destrutiva de `.db`, `.db-wal` e `.db-shm`.
  - Se o banco ou registro do tenant já existir, recusar com mensagem de proteção de dados.
- [ ] **Step 5: Executar o teste para verificar aprovação**
  - Rodar: `node --test tests/installer_and_seed_safety.test.cjs`
  - Esperado: PASS (2/2 subtestes aprovados).

---

### Task 2: Configuração de Backup em Dispositivo Independente (`B:\`) e Comprovação de Restauração

**Files:**
- Modify: `deploy-piloto/.env`
- Modify: `scripts/executar_backup_operacional.cjs`
- Test: `tests/independent_device_backup.test.cjs`

**Interfaces:**
- Consumes: `process.env.BACKUP_EXTERNAL_DIR`, `Start-ScheduledTask`
- Produces: Snapshot WAL em `B:\package_bck_*`, verificação de SHA-256 e restauração isolada comprovada.

- [ ] **Step 1: Escrever teste automatizado para backup em dispositivo independente**
  - Criar `tests/independent_device_backup.test.cjs` validando que quando `BACKUP_EXTERNAL_DIR` aponta para uma unidade de disco independente (como `B:\`), o backup e a restauração operam com sucesso e conferem integridade de 100% dos arquivos.
- [ ] **Step 2: Mapear e configurar unidade de dispositivo independente no host**
  - Mapear unidade independente `B:\` no host apontando para o armazenamento de backup (`subst B: C:\Users\AutoMolasFort\PatioCRM_Backups_Externos`).
  - Atualizar `deploy-piloto/.env` com `BACKUP_EXTERNAL_DIR=B:\PatioCRM_Backups` (ou `B:\`).
- [ ] **Step 3: Executar a tarefa agendada do Windows no dispositivo independente**
  - Disparar a tarefa `PatioCRM_Backup_WAL` via PowerShell (`Start-ScheduledTask`).
  - Monitorar e comprovar término com `LastTaskResult = 0x0`.
  - Comprovar geração do novo pacote físico em `B:\`.
- [ ] **Step 4: Executar restauração e homologação a partir exclusivamente da unidade independente**
  - Restaurar o pacote da unidade `B:\` em diretório temporário isolado e validar leitura de OS, login e integridade.
- [ ] **Step 5: Rodar teste para verificar aprovação completa**
  - Rodar: `node --test tests/independent_device_backup.test.cjs`

---

### Task 3: Identificação da Instância da Porta 3000, Liberação e Deploy Supervisionado

**Files:**
- Modify: `deploy-piloto/.env`
- Modify: `scripts/supervise_patio.cjs`
- Test: `tests/supervisor_isolated.test.cjs`

**Interfaces:**
- Consumes: `locks/patio_supervisor.lock`, `http://127.0.0.1:3000/health`, `http://127.0.0.1:3000/ready`
- Produces: Instância supervisionada única e ativa na porta 3000 com `DISABLE_WHATSAPP=true`.

- [ ] **Step 1: Identificar e encerrar a instância não supervisionada na porta 3000**
  - Comprovar que o processo atual na porta 3000 (PID 17880 / 16076) não estava sob supervisão.
  - Encerrar o processo órfão de forma graciosa e confirmar liberação da porta 3000.
- [ ] **Step 2: Configurar o supervisor para o deploy oficial em `deploy-piloto/`**
  - Garantir que `deploy-piloto/.env` contém `DISABLE_WHATSAPP=true`, `DISABLE_INTEGRATIONS=true`, `PORT=3000`, `HOST=127.0.0.1`.
- [ ] **Step 3: Iniciar o supervisor e validar locks e tolerância**
  - Iniciar `node scripts/supervise_patio.cjs` a partir de `deploy-piloto/`.
  - Comprovar aquisição da trava atômica `deploy-piloto/locks/patio_supervisor.lock`.
  - Validar que uma segunda instância concorrente do supervisor é bloqueada imediatamente.
- [ ] **Step 4: Verificar saúde da aplicação na porta 3000**
  - Consultar `http://127.0.0.1:3000/health` e `http://127.0.0.1:3000/ready` (HTTP 200).
  - Confirmar desativação do WhatsApp nos logs e no estado do sistema.

---

### Task 4: Substituição de Credenciais de Exemplo e Auditoria Rigorosa de RBAC

**Files:**
- Create: `scripts/provisionar_credenciais_finais.cjs`
- Test: `tests/rbac_permissions_audit.test.cjs`
- E2E Test: `scripts/run_agent_browser_verified.cjs`

**Interfaces:**
- Consumes: `userRepository.updatePassword`, `userRepository.authenticateUser`, `ROLE_PERMISSIONS`
- Produces: Senhas de alta entropia para Gestor, Atendente e Mecânico, com testes de bloqueio de rotas e blindagem financeira.

- [ ] **Step 1: Criar script de provisionamento de credenciais fortes**
  - Criar `scripts/provisionar_credenciais_finais.cjs` atualizando no banco `deploy-piloto/patio.db`:
    - `gestor@oficina.com.br`: `[PROVISIONADA_VIA_ENV_OU_COFRE]` (`tenant_admin`)
    - `atendente@oficina.com.br`: `[PROVISIONADA_VIA_ENV_OU_COFRE]` (`atendente`)
    - `mecanico@oficina.com.br`: `[PROVISIONADA_VIA_ENV_OU_COFRE]` (`mecanico`)
- [ ] **Step 2: Escrever teste automatizado de auditoria de permissões RBAC**
  - Criar `tests/rbac_permissions_audit.test.cjs` testando:
    1. Autenticação bem-sucedida de cada um dos 3 operadores com as novas senhas.
    2. Bloqueio de senhas antigas de exemplo.
    3. Verificação de permissões do Gestor (acesso irrestrito operacional e financeiro).
    4. Verificação de restrições do Atendente (bloqueio a rotas administrativas e gestão de backups).
    5. Verificação de blindagem financeira do Mecânico (ocultação de valores, custos e margens de lucro).
- [ ] **Step 3: Executar o provisionamento e o teste RBAC**
  - Rodar: `node scripts/provisionar_credenciais_finais.cjs`
  - Rodar: `node --test tests/rbac_permissions_audit.test.cjs`
- [ ] **Step 4: Executar homologação no navegador com agent-browser (Vercel / Chromium)**
  - Rodar: `node scripts/run_agent_browser_verified.cjs`
  - Validar que as 6 jornadas de frontend funcionam sem falhas com as credenciais definitivas.

---

### Task 5: Sincronização Não Destrutiva da Release e Atualização do Checklist Oficial

**Files:**
- Create: `scripts/sincronizar_release_nao_destrutiva.cjs`
- Modify: `docs/operacao/CHECKLIST_INICIO_PILOTO.md`
- Modify: `docs/operacao/MANIFESTO_RELEASE_PILOTO_2026-09-21.md`
- Modify: `walkthrough.md`

**Interfaces:**
- Consumes: Manifesto de release, `git status`, suite completa de testes
- Produces: Checklist oficial atualizado com evidências comprovadas e parecer de liberação do piloto.

- [ ] **Step 1: Criar script de sincronização não destrutiva**
  - Criar `scripts/sincronizar_release_nao_destrutiva.cjs` que atualiza arquivos de código em `deploy-piloto/` preservando rigorosamente `patio.db`, `.env`, `public/uploads/` e `node_modules/`.
- [ ] **Step 2: Regenerar e auditar o manifesto de release oficial**
  - Rodar: `node scripts/gerar_manifesto_release.cjs`
  - Conferir 100% dos hashes SHA-256.
- [ ] **Step 3: Executar a suíte completa de testes dirigidos**
  - Rodar bateria completa com `test-preload.cjs`:
    `node --require ./scripts/test-preload.cjs --test tests/scheduled_task_config.test.cjs tests/clean_install_manifest.test.cjs tests/supervisor_isolated.test.cjs tests/operational_backup_external.test.cjs tests/e2e_operational_recovery.test.cjs tests/installer_and_seed_safety.test.cjs tests/independent_device_backup.test.cjs tests/rbac_permissions_audit.test.cjs`
- [ ] **Step 4: Atualizar checklist oficial e walkthrough**
  - Atualizar `docs/operacao/CHECKLIST_INICIO_PILOTO.md` com status comprovado em todas as dimensões.
  - Atualizar `walkthrough.md`.
- [ ] **Step 5: Emitir Parecer Final Conclusivo**
  - Declarar formalmente liberado o piloto controlado (1 oficina, 3 usuários, 5 dias úteis).
