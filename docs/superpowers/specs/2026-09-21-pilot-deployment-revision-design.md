# Especificação Técnica de Design: Revisão e Correção da Implantação do Piloto

**Data:** 21 de Setembro de 2026  
**Documento de Origem:** `docs/REVISAO_IMPLANTACAO_PILOTO_2026-09-21.md`  
**Escopo:** Correção estrita dos scripts operacionais, procedimentos de contingência, manifesto de release e documentação de implantação do piloto. Núcleo funcional do CRM estritamente preservado.

---

## 1. Objetivos e Critérios de Aceite

1. **Backup Operacional Autocontido com Cópia Externa Verificada (P0):**
   - O backup deve gerar um pacote único contendo: banco SQLite WAL (`VACUUM INTO`), anexos de `uploads/` e `manifest.json` com SHA-256 de cada arquivo do pacote.
   - Preparação atômica em diretório temporário (`.staging_*`) antes da publicação local.
   - Replicar o pacote completo para o destino externo (`BACKUP_EXTERNAL_DIR`).
   - Conferir cada arquivo no destino externo recalculando o hash SHA-256 contra o `manifest.json`.
   - Se o destino externo for configurado/exigido e falhar (destino ausente, inacessível ou hash divergente), retornar código de saída não-zero (`process.exitCode = 1`) e logar erro acionável.
   - O snapshot local válido nunca deve ser destruído por falha na réplica externa.
   - Eliminar `process.exit()` prematuro de blocos `try/catch` para garantir execução do `finally` (fechamento de conexões).

2. **Restauração Operacional Ponta a Ponta com Medição Real (P1):**
   - Implementar ensaio de recuperação usando **estritamente o pacote externo** (sem acesso à base fonte nem ao backup local).
   - Restaurar o banco e os anexos em pasta isolada temporária.
   - Iniciar uma instância de teste do servidor Express em porta efêmera.
   - Autenticar usuário sintético, consultar OS/cliente/veículo e baixar anexo via HTTP conferindo bytes.
   - Medir separadamente: descompactação/cópia, validação de integridade (`PRAGMA integrity_check` e hashes), tempo de boot do servidor e recuperação completa ponta a ponta (E2E).
   - Retirar terminologia enganosa de "RTO 4 ms" e "SLA 5 s" da documentação operacional, rotulando os tempos com precisão técnica.

3. **Supervisor Unificado e Trava Atômica de Instância (P1):**
   - O supervisor (`scripts/supervise_patio.cjs`) deve carregar `.env` e definir explicitamente `HOST` (padrão estrito `127.0.0.1`), `PORT` (3000), `DB_PATH` e `UPLOAD_DIR`.
   - Repassar essas variáveis de ambiente explicitamente para o processo filho.
   - No `server.js`, alinhar o padrão de escuta para `process.env.HOST || '127.0.0.1'` (restringindo o padrão à interface local).
   - Implementar trava atômica de instância via arquivo exclusivo (`locks/patio-supervisor.lock`) com detecção e recuperação de travas abandonadas (checagem de PID ativo via `process.kill(pid, 0)`).
   - Manter a sondagem TCP na porta/host como segunda barreira de proteção.
   - Validar em testes automatizados: inicialização simultânea rejeitada, porta ocupada, recuperação de crash e encerramento limpo.

4. **Manifesto de Release Completo com Recursos de `public/` (P1):**
   - Atualizar `scripts/gerar_manifesto_release.cjs` para incluir páginas e scripts públicos necessários (`public/*.html`, `public/support/*`), excluindo estritamente `public/uploads`, `.env*`, `.db*`, `backups/`, `scratch/` e sessões.
   - Adicionar teste automatizado de validação de instalação limpa a partir do manifesto.
   - Clarificar na documentação que o manifesto SHA-256 é um inventário de integridade de release e não uma assinatura digital PKI nem atestado absoluto de ausência de segredos em runtime.

5. **Checklist Estratificado e Alinhamento de Permissões RBAC (P1):**
   - Reestruturar `docs/operacao/CHECKLIST_INICIO_PILOTO.md` com colunas claras: Implementação de Código, Teste Isolado Automatizado e Instalação Operacional no Host.
   - Alinhar papéis e permissões documentados com o código real de `lib/auth/userRepository.js` (`tenant_admin`, `atendente`, `mecanico`).
   - Declarar explicitamente as pendências físicas que dependem do operador local (mídia externa, agendador Windows e senhas).
   - **Regra de Bloqueio:** Não autorizar a abertura da primeira OS real enquanto o backup externo e a recuperação não forem comprovados no host físico da oficina.

---

## 2. Arquitetura Detalhada dos Componentes

### 2.1 Componente: Backup Operacional (`scripts/executar_backup_operacional.cjs`)
- **Entrada:** `BACKUP_DIR`, `BACKUP_EXTERNAL_DIR`, `REQUIRE_EXTERNAL_BACKUP`, `DB_PATH`, `UPLOAD_DIR`.
- **Fluxo:**
  1. Cria staging local: `<backupDir>/.staging_<backupId>`
  2. Executa `VACUUM INTO ?` apontando para `<staging>/patio.db`
  3. Copia recursivamente `<uploadDir>` para `<staging>/uploads/`
  4. Gera `<staging>/manifest.json` com `{ backupId, createdAt, files: { "patio.db": { size, sha256 }, "uploads/img.jpg": { size, sha256 } } }`
  5. Move `.staging_<backupId>` para `<backupDir>/backup_<backupId>` (Snapshot local concluído).
  6. Se `BACKUP_EXTERNAL_DIR` estiver configurado ou `REQUIRE_EXTERNAL_BACKUP=true`:
     - Se `BACKUP_EXTERNAL_DIR` inexistente ou inválido: registrar alerta em `logs/backup_alert.json`, emitir erro acionável no stderr e definir `process.exitCode = 1`.
     - Se acessível: copiar todo o pacote para `<BACKUP_EXTERNAL_DIR>/.staging_ext_<backupId>`.
     - Verificar SHA-256 de todos os arquivos no destino externo contra `manifest.json`.
     - Se conferência for 100%: renomear para `<BACKUP_EXTERNAL_DIR>/backup_<backupId>`.
     - Se falhar: remover staging externo, logar erro e definir `process.exitCode = 1`.
  7. Bloco `finally`: aguardar fechamento do banco (`await closeDB()`).

### 2.2 Componente: Ensaio de Recuperação E2E (`scripts/testar_restauracao_operacional_e2e.cjs`)
- **Entrada:** Executável isolado em diretório temporário.
- **Fluxo:**
  1. Cria cenário fonte completo com banco SQLite, usuários (`admin`), estado do pátio (OS, cliente, veículo) e anexo simulado em pasta isolada de testes.
  2. Executa backup operacional gerando pacote local e externo.
  3. Deleta completamente o banco fonte, anexos fonte e backups locais (simulação de desastre total do host).
  4. Restaura exclusivamente a partir do pacote externo:
     - Cópia e descompactação dos arquivos.
     - Validação de SHA-256 e `PRAGMA integrity_check`.
     - Inicialização do servidor em porta de teste efêmera com variáveis apontando para os dados restaurados.
     - Requisições HTTP: Login via POST `/api/auth/login`, leitura de OS e consulta direta do anexo via GET `/uploads/foto_eixo_1.jpg`.
  5. Mede tempos discretos:
     - `unpackDurationMs`
     - `integrityValidationDurationMs`
     - `serverBootDurationMs`
     - `e2eRecoveryDurationMs`
  6. Gera evidência estruturada em `docs/evidencias/recuperacao_operacional_e2e_2026-09-21.json`.

### 2.3 Componente: Supervisor e Trava Atômica (`scripts/supervise_patio.cjs`)
- **Trava de Instância:**
  - Arquivo de trava: `locks/patio-supervisor.lock`.
  - Abertura com flag `wx` (`O_CREAT | O_EXCL`).
  - Se falhar com `EEXIST`: ler PID do arquivo.
    - Se PID estiver morto (`!processKill(pid, 0)`), descartar trava abandonada e adquirir nova trava.
    - Se PID estiver vivo, abortar imediatamente com mensagem explicativa e saída 1.
- **Configuração Unificada:**
  - Carrega `.env` se disponível.
  - Define `HOST` (padrão `127.0.0.1`), `PORT` (padrão `3000`), `DB_PATH`, `UPLOAD_DIR`.
  - Passa todas as variáveis de forma explícita no spawn do processo filho.
- **Servidor (`server.js`):**
  - Alinha padrão de escuta para `process.env.HOST || '127.0.0.1'`.

### 2.4 Componente: Manifesto Completo com Recursos de `public/`
- Adiciona `'public'` a `includePatterns` no script `scripts/gerar_manifesto_release.cjs`.
- Mantém exclusão de `public/uploads` e dados dinâmicos/bancos.
- Regenera `docs/operacao/manifesto_release.json` e `docs/operacao/MANIFESTO_RELEASE_PILOTO_2026-09-21.md`.

### 2.5 Componente: Checklist e Governança Operacional
- Revisa `docs/operacao/CHECKLIST_INICIO_PILOTO.md` com status tripartido: Implementação, Teste Isolado e Instalação Operacional.
- Atualiza manuais operacionais com papéis exatos (`tenant_admin`, `atendente`, `mecanico`) e instruções rigorosas para o Agendador de Tarefas do Windows.
