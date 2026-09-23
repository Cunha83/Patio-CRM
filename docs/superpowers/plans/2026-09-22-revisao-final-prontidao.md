# Plano de Implementação: Correção das Três Pendências de Prontidão Operacional do Piloto

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sanar as três pendências operacionais críticas da prontidão do Pátio CRM: (1) Armazenamento de backup realmente independente com rejeição de mesmo disco/subst e suporte a destino remoto autêntico; (2) Higienização e sigilo rigoroso de senhas e credenciais sem exposição em logs/docs; (3) Guarda de pré-voo na implantação recusando instalações existentes antes de qualquer escrita; e (4) Calibração realista do RPO (≤ 1h).

**Architecture:** Adicionar verificação atômica pré-voo em `executar_implantacao_real_piloto.cjs` antes de qualquer I/O; implementar serviço receptor remoto independente `servico_backup_remoto.cjs` e envio via `BACKUP_REMOTE_URL` em `executar_backup_operacional.cjs` com rejeição estrita de volumes locais idênticos e `subst`; abstrair credenciais para variáveis de ambiente com redaction em logs e documentação; atualizar checklist com RPO nominal de 1 hora.

**Tech Stack:** Node.js, Express, SQLite3 WAL, Crypto SHA-256 / Scrypt, Windows Task Scheduler, agent-browser (Chromium / CDP).

**Spec:** [`docs/superpowers/specs/2026-09-22-revisao-final-prontidao-design.md`](file:///c:/Users/AutoMolasFort/.gemini/antigravity-ide/scratch/Patio-CRM-main/docs/superpowers/specs/2026-09-22-revisao-final-prontidao-design.md)

## Global Constraints
- Nenhuma senha em texto claro pode constar em arquivos de código, testes, documentação ou logs de auditoria.
- A base de dados raiz de desenvolvimento `patio.db` deve permanecer 100% INTOCADA.
- Nenhuma funcionalidade nova de negócio deve ser adicionada; escopo operacional estrito.
- WhatsApp e emissão fiscal oficial devem permanecer desativados no deploy do piloto.

---

### Task 1: Guarda Pré-Voo de Implantação (Anti-Data-Loss Antes de Qualquer Escrita)

**Files:**
- Modify: `scripts/executar_implantacao_real_piloto.cjs`
- Modify: `scripts/instalar_pacote_piloto.cjs`
- Test: `tests/deployment_preflight_guard.test.cjs`

**Interfaces:**
- Consumes: `deployDir`
- Produces: `assertCleanDeploymentTarget(dir)` lançando erro `INSTALACAO_JA_EXISTE` se existirem `patio.db`, `.env` ou `public/uploads`.

- [x] **Step 1: Escrever teste automatizado que falha**
Criar `tests/deployment_preflight_guard.test.cjs` preparando um diretório temporário com arquivos de instalação prévia e esperando que a execução de `executar_implantacao_real_piloto.cjs` falhe com código `1` sem alterar nenhum arquivo.

- [x] **Step 2: Executar teste para verificar falha inicial**
Rodar: `node --test tests/deployment_preflight_guard.test.cjs`

- [x] **Step 3: Implementar a guarda pré-voo antes de qualquer escrita**
Adicionar a verificação no início de `executar_implantacao_real_piloto.cjs` antes de `fs.mkdirSync` ou `fs.writeFileSync`.

- [x] **Step 4: Executar teste para verificar aprovação**
Rodar: `node --test tests/deployment_preflight_guard.test.cjs`

---

### Task 2: Remoção de Senhas Literais e Sigilo de Credenciais

**Files:**
- Modify: `scripts/provisionar_credenciais_finais.cjs`
- Modify: `tests/rbac_permissions_audit.test.cjs`
- Modify: `docs/operacao/CHECKLIST_INICIO_PILOTO.md`
- Modify: `docs/evidencias/validacao_frontend_operadores_agent_browser.log`
- Modify: `walkthrough.md`

**Interfaces:**
- Consumes: `process.env.PILOTO_GESTOR_SENHA`, `process.env.PILOTO_ATENDENTE_SENHA`, `process.env.PILOTO_MECANICO_SENHA`
- Produces: Autenticação via Scrypt + Salt sem emitir senhas literais em stdout ou logs.

- [x] **Step 1: Ajustar scripts de credenciais para carregar via env e redigir saídas**
Modificar `scripts/provisionar_credenciais_finais.cjs` para usar variáveis de ambiente ou geração segura com logs sanitizados (`[REDACTED]`).

- [x] **Step 2: Ajustar testes de auditoria RBAC para usar senhas em memória transitórias**
Atualizar `tests/rbac_permissions_audit.test.cjs` para injetar credenciais via variáveis seguras.

- [x] **Step 3: Purgar senhas literais de todos os documentos e logs**
Remover ocorrências de senhas em texto plano de `CHECKLIST_INICIO_PILOTO.md`, `walkthrough.md`, relatórios e logs.

- [x] **Step 4: Executar testes de permissões RBAC para comprovar conformidade**
Rodar: `node --test tests/rbac_permissions_audit.test.cjs`

---

### Task 3: Armazenamento Remoto Independente para Backup e Rejeição de Mesmo Disco

**Files:**
- Create: `scripts/servico_backup_remoto.cjs`
- Modify: `scripts/executar_backup_operacional.cjs`
- Create: `tests/remote_independent_backup.test.cjs`

**Interfaces:**
- Consumes: `BACKUP_REMOTE_URL`, `BACKUP_REMOTE_TOKEN`
- Produces: Upload de pacote autocontido com verificação SHA-256 e restauração remota.

- [x] **Step 1: Implementar rejeição de mesmo disco físico e subst em backup local**
No `scripts/executar_backup_operacional.cjs`, validar se o destino externo aponta para o mesmo disco do banco ou subst, rejeitando com erro explícito quando configurada independência obrigatória.

- [x] **Step 2: Implementar serviço de recebimento de backup remoto autônomo**
Criar `scripts/servico_backup_remoto.cjs` escutando em porta dedicada, recebendo pacotes autenticados e persistindo em cofre de backup segregado.

- [x] **Step 3: Adicionar suporte a envio para `BACKUP_REMOTE_URL` em `executar_backup_operacional.cjs`**
Transmitir snapshot WAL + anexos + manifest com hash conferido de ponta a ponta.

- [x] **Step 4: Escrever e aprovar teste automatizado `tests/remote_independent_backup.test.cjs`**
Rodar: `node --test tests/remote_independent_backup.test.cjs`

---

### Task 4: Atualização de RTO/RPO, Regeneração de Manifesto e Checklist Oficial

**Files:**
- Modify: `docs/operacao/CHECKLIST_INICIO_PILOTO.md`
- Modify: `walkthrough.md`
- Run: `scripts/gerar_manifesto_release.cjs`
- Run: `scripts/sincronizar_release_nao_destrutiva.cjs`

- [x] **Step 1: Atualizar declaração de RPO nos documentos oficiais**
Corrigir para: RTO medido ~8s e RPO nominal ≤ 1h (determinado pelo agendamento horário).

- [x] **Step 2: Regenerar manifesto oficial de release com novos arquivos e hashes**
Rodar: `node scripts/gerar_manifesto_release.cjs`

- [x] **Step 3: Sincronizar release de forma não destrutiva para `deploy-piloto/`**
Rodar: `node scripts/sincronizar_release_nao_destrutiva.cjs`

- [x] **Step 4: Executar bateria completa de testes dirigidos com preload**
Rodar suíte completa de testes.

- [x] **Step 5: Executar homologação no frontend com `agent-browser`**
Confirmar acesso e blindagem no navegador.
