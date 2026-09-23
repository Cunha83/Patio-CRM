# Plano de Implementação: Correção e Revisão da Implantação do Piloto Controlado

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corrigir rigorosamente as falhas de implantação apontadas em `docs/REVISAO_IMPLANTACAO_PILOTO_2026-09-21.md`: backup autocontido com replicação externa verificada, ensaio de recuperação E2E com medição real e retração de métricas fictícias, supervisor unificado com trava atômica de instância, manifesto completo com recursos de `public/`, e checklist estratificado com alinhamento formal de permissões e bloqueio da 1ª OS real.

**Architecture:** Node.js v24, SQLite WAL, Express. Backup atômico com empacotamento em staging, cálculo de hash SHA-256 por arquivo e cópia/verificação em destino externo; trava atômica via `fs.openSync` com flag `wx` e recuperação de PID inativo; testes isolados sem tocar em `patio.db`.

**Tech Stack:** Node.js v24, SQLite3 / Better-SQLite3, Express, Crypto, Supertest / HTTP Client nativo.

**Spec:** `docs/superpowers/specs/2026-09-21-pilot-deployment-revision-design.md`

## Global Constraints
- Preserve o banco real `patio.db` intacto (zero seeds, testes ou purges sobre a base operacional).
- Todos os testes e ensaios devem rodar sob `os.tmpdir()` cumprindo `assertTestResourcePath`.
- Nenhuma nova funcionalidade no CRM nem refatoração não relacionada.
- WhatsApp e integrações fiscais de produção continuam estritamente desligados no piloto.
- Saída não-zero e logs acionáveis sempre que o backup externo configurado falhar.

---

### Task 1: Backup Operacional Autocontido com Cópia Externa Verificada e Saída Confiável (P0)

**Files:**
- Modify: `scripts/executar_backup_operacional.cjs`
- Test: `tests/operational_backup_external.test.cjs`

**Interfaces:**
- Produz pacote em diretório: `<backupDir>/backup_<backupId>_<timestamp>/` contendo `patio.db`, `uploads/` e `manifest.json`.
- Replica e verifica em `BACKUP_EXTERNAL_DIR`.
- Retorna `process.exitCode = 1` se o destino externo falhar/divergir ou estiver indisponível quando configurado.
- Remove `process.exit()` precoce em `try/catch` para permitir fechamento assíncrono seguro em `finally`.

- [ ] **Step 1: Escrever teste automatizado de falha e sucesso do backup operacional**
  Criar `tests/operational_backup_external.test.cjs` cobrindo:
  - Destino externo inexistente com saída não-zero e gravação de alerta.
  - Destino externo válido com cópia de banco, anexos e manifesto SHA-256 verificado.
  - Detecção de cópia externa corrompida (divergência de hash).
- [ ] **Step 2: Executar o teste para verificar falhas**
  Rodar `node --test tests/operational_backup_external.test.cjs`.
- [ ] **Step 3: Implementar a lógica de empacotamento em staging e replicação externa verificada em `scripts/executar_backup_operacional.cjs`**
  Garantir diretório temporário `.staging_*`, manifesto JSON por arquivo, verificação pós-cópia no destino externo e `process.exitCode` no fluxo.
- [ ] **Step 4: Re-executar teste para assegurar aprovação**
  Validar aprovação de todos os casos de teste.

---

### Task 2: Ensaio de Recuperação Operacional E2E com Medição Real e Retração de Métricas Falsas (P1)

**Files:**
- Create: `scripts/testar_restauracao_operacional_e2e.cjs`
- Modify: `scripts/testar_restauracao_isolada.cjs`
- Output: `docs/evidencias/recuperacao_operacional_e2e_2026-09-21.json`

**Interfaces:**
- Recuperação partindo **exclusivamente do pacote externo** (sem acesso à base fonte nem ao backup local).
- Restaura banco e anexos em pasta limpa efêmera.
- Inicia servidor isolado em porta efêmera (ex: 3999) com variáveis apontando para os dados restaurados.
- Executa login HTTP, consulta de OS/veículo/cliente e download de anexo conferindo bytes.
- Mede tempos discretos: descompactação, validação, boot do servidor e recuperação E2E total.

- [ ] **Step 1: Criar o script `scripts/testar_restauracao_operacional_e2e.cjs`**
  Implementar o fluxo completo de desastre total e recuperação ponta a ponta.
- [ ] **Step 2: Executar o ensaio e registrar evidências**
  Executar `node scripts/testar_restauracao_operacional_e2e.cjs` e salvar resultados em `docs/evidencias/recuperacao_operacional_e2e_2026-09-21.json`.
- [ ] **Step 3: Atualizar `scripts/testar_restauracao_isolada.cjs`**
  Rotular explicitamente como teste sintético de cópia/integridade e retirar alegações infundadas de usuários/logs ou SLA de 5s.

---

### Task 3: Supervisor Unificado, Escuta Local e Trava Atômica de Instância (P1)

**Files:**
- Modify: `scripts/supervise_patio.cjs`
- Modify: `server.js:6950`
- Create: `tests/supervisor_isolated.test.cjs`

**Interfaces:**
- Supervisor carrega `.env` e define explicitamente `HOST` (padrão `127.0.0.1`), `PORT` (3000), `DB_PATH`, `UPLOAD_DIR`.
- Repassa essas variáveis explicitamente para o processo filho.
- `server.js` alinha padrão de escuta para `process.env.HOST || '127.0.0.1'`.
- Trava atômica via `locks/patio-supervisor.lock` com flag `wx` e recuperação de trava de PID inativo (`process.kill(pid, 0)`).

- [ ] **Step 1: Escrever teste automatizado `tests/supervisor_isolated.test.cjs`**
  Testar duas instâncias simultâneas, detecção de porta ocupada, recuperação de trava abandonada e encerramento limpo.
- [ ] **Step 2: Executar teste e validar falha**
  Rodar `node --test tests/supervisor_isolated.test.cjs`.
- [ ] **Step 3: Implementar a trava atômica e o repasse unificado de ambiente em `scripts/supervise_patio.cjs` e padrão local em `server.js`**
- [ ] **Step 4: Re-executar teste para assegurar aprovação**
  Validar aprovação de todos os casos.

---

### Task 4: Manifesto de Release Completo com Recursos de `public/` (P1)

**Files:**
- Modify: `scripts/gerar_manifesto_release.cjs`
- Output: `docs/operacao/manifesto_release.json`
- Output: `docs/operacao/MANIFESTO_RELEASE_PILOTO_2026-09-21.md`
- Create: `tests/clean_install_manifest.test.cjs`

**Interfaces:**
- Inclui arquivos essenciais de `public/` (`*.html`, `support/*`), excluindo estritamente `public/uploads`, `.env*`, `.db*`, `backups/` e segredos.
- Teste de instalação limpa valida integridade e compilação do pacote a partir do manifesto.

- [ ] **Step 1: Atualizar `scripts/gerar_manifesto_release.cjs`**
  Adicionar `'public'` com exclusão explícita de `public/uploads`.
- [ ] **Step 2: Executar geração do manifesto**
  Rodar `node scripts/gerar_manifesto_release.cjs`.
- [ ] **Step 3: Criar teste de validação de instalação limpa `tests/clean_install_manifest.test.cjs`**
  Garantir que os arquivos mapeados compõem um pacote autocontido com sintaxe válida.
- [ ] **Step 4: Executar e validar teste**
  Rodar `node --test tests/clean_install_manifest.test.cjs`.

---

### Task 5: Checklist Estratificado, Instruções do Agendador e Governança Operacional (P1)

**Files:**
- Modify: `docs/operacao/CHECKLIST_INICIO_PILOTO.md`
- Modify: `docs/operacao/SUPERVISAO_WINDOWS.md`
- Modify: `docs/operacao/CONFIGURACAO_PILOTO.md`
- Modify: `docs/operacao/GUIA_OPERACIONAL_PILOTO.md`

**Interfaces:**
- Checklist com distinção entre Implementação de Código, Teste Isolado e Instalação Operacional no Host.
- Papéis e permissões alinhados ao código (`tenant_admin`, `atendente`, `mecanico`).
- Instruções completas do Agendador com caminhos absolutos, identidade e sem sobreposição (`/NP`).
- Bloqueio explícito da primeira OS real até validação no host físico.

- [ ] **Step 1: Atualizar `docs/operacao/CHECKLIST_INICIO_PILOTO.md` com matriz tripartida e veto à primeira OS real**
- [ ] **Step 2: Atualizar `docs/operacao/SUPERVISAO_WINDOWS.md` com comandos absolutos e conferência de backup externo**
- [ ] **Step 3: Alinhar `docs/operacao/CONFIGURACAO_PILOTO.md` e `GUIA_OPERACIONAL_PILOTO.md` aos papéis exatos de `userRepository.js`**

---

### Task 6: Validação Geral da Suíte de Testes e Auditoria Frontend via `agent-browser`

- [ ] **Step 1: Executar suíte completa de testes:**
  `npm test`
- [ ] **Step 2: Executar validação E2E no frontend via `agent-browser` (Vercel):**
  `node scripts/run_agent_browser_verified.cjs`
- [ ] **Step 3: Atualizar Walkthrough com evidências concretas, hashes e parecer final**
