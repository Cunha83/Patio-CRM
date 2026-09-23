# Especificação de Design: Resolução Definitiva de Armazenamento Independente, Segredo Privado e Auditoria da Tarefa Agendada

**Data:** 22 de Setembro de 2026  
**Status:** APROVADO PARA IMPLEMENTAÇÃO (Conforme pré-aprovação expressa do usuário)  
**Escopo:** Eliminação de Fallbacks, Rejeição Estrita de Localhost/Mesmo Disco/Subst, Auditoria Real do Agendador de Tarefas, Rotação Criptográfica de Credenciais e Manutenção do Checklist como Pendente.

---

## 1. Contexto e Motivação

A revisão do usuário identificou com precisão técnica cinco pontos que impediam a liberação formal e auditável:
1. **Armazenamento Realmente Independente:** O uso de um serviço HTTP local em `127.0.0.1:3005` no mesmo host `AMF01` não constitui armazenamento segregado. O sistema deve exigir um dispositivo físico separado (USB/mídia externa) ou outro servidor autêntico, rejeitando explicitamente destinos locais ou no mesmo disco.
2. **Eliminação de Token Fixo e Fallbacks:** O token `PatioRemoteVaultSecretToken2026!` estava hardcoded como fallback. Deve ser completamente expurgado, exigindo configuração privada exclusiva e substituição por token inédito de alta entropia.
3. **Auditoria Efetiva da Tarefa Agendada:** O código `0` retornado por `schtasks /Query` apenas atesta que o comando de consulta foi executado, não que o backup em si foi concluído com integridade. A evidência de execução deve ser inspecionada diretamente na tabela `backups` do banco SQLite operacional e nos recibos/arquivos gravados.
4. **Comprovação de Restauração e Rotação de Credenciais:** Comprovação da recuperação a partir de pacote autônomo e rotação integral das credenciais dos três operadores (Gestor, Atendente e Mecânico) para novas senhas secretas de alta entropia, validando o acesso privado no frontend via `agent-browser`.
5. **Checklist Mantido como Pendente:** O checklist operacional deve permanecer em estado **PENDENTE** até a conclusão e validação de todas as evidências acima, refletindo fielmente que no host físico `AMF01` a proteção externa aguarda a conexão do hardware físico dedicado ou ativação de servidor corporativo.

---

## 2. Arquitetura das Soluções

### 2.1 Guardrails Estritos em `scripts/executar_backup_operacional.cjs`
- **Rejeição de Localhost / Loopback / Mesmo Host:**
  - A função `assertIndependentDestination(sourceDir, targetDir, remoteUrl)` valida tanto destinos de arquivos quanto URLs remotas:
  - Se `remoteUrl` for fornecida:
    - Extrai o `hostname` (`new URL(remoteUrl)`).
    - Se for `localhost`, `127.0.0.1`, `::1`, `0.0.0.0` ou o endereço IP local do próprio host:
      - Lança erro impeditivo: `DESTINO_INVALIDO_LOCAL: O destino remoto aponta para a própria máquina local. Armazenamento independente requer outro servidor autêntico ou dispositivo físico separado.`
  - Se `targetDir` for fornecido:
    - Rejeita unidades mapeadas via `subst` (`DESTINO_INVALIDO_SUBST`).
    - Rejeita pastas no mesmo volume/letra de disco (`DESTINO_INVALIDO_MESMO_DISCO`).
- **Remoção Absoluta de Fallbacks de Token:**
  - Removido qualquer valor padrão para `BACKUP_REMOTE_TOKEN`.
  - Se `remoteUrl` estiver configurada mas `BACKUP_REMOTE_TOKEN` não for fornecido via `.env`/processo privado, lança erro fatal: `CONFIG_SEGURANCA_OBRIGATORIA: BACKUP_REMOTE_TOKEN privado deve ser configurado no ambiente.`

### 2.2 Rotação e Sigilo das Credenciais dos Operadores
- **Geração Segura:**
  - Gera novo `BACKUP_REMOTE_TOKEN` com 64 caracteres hex (`crypto.randomBytes(32).toString('hex')`).
  - Gera 3 senhas secretas de alta entropia (16+ caracteres, alfanuméricos e caracteres especiais) para `PILOTO_GESTOR_SENHA`, `PILOTO_ATENDENTE_SENHA` e `PILOTO_MECANICO_SENHA`.
- **Gravação Segregada:**
  - Gravadas exclusivamente em `deploy-piloto/.env`.
  - Nenhuma senha ou token é impresso em logs, relatórios ou console (`[REDACTED_SECRET]`).
- **Re-Hash no Banco Operacional:**
  - Atualiza `deploy-piloto/patio.db` via `userRepository.updatePassword` utilizando `scrypt` com salt criptográfico individual de 16 bytes.
  - Invalida todas as senhas anteriores: qualquer tentativa de login com credenciais antigas retorna HTTP 401.

### 2.3 Auditoria Real da Tarefa Agendada do Windows
- A comprovação da tarefa não se baseia em `schtasks /Query`.
- Procedimento de auditoria:
  1. Dispara execução explícita via `schtasks /Run /TN "PatioCRM_Backup_WAL"`.
  2. Aguarda a finalização do processo `node.exe` disparado pelo agendador.
  3. Consulta a tabela `backups` no SQLite operacional (`deploy-piloto/patio.db`):
     - `SELECT id, type, filepath, size_bytes, checksum_sha256, status, executed_by, created_at FROM backups ORDER BY created_at DESC LIMIT 1`.
  4. Inspeciona o arquivo `deploy-piloto/logs/backup_alert.json` e logs operacionais.
  5. Valida a existência e integridade do pacote gerado no disco.

### 2.4 Homologação de Restauração e Acesso Privado via `agent-browser`
- **Ensaio de Restauração:**
  - Executa restauração do pacote em diretório isolado de ensaio.
  - Valida manifesto SHA-256 arquivo a arquivo.
  - Executa `PRAGMA integrity_check` no banco restaurado.
  - Sobe servidor temporário isolado e valida autenticação dos 3 operadores.
- **Homologação E2E no Supervisor:**
  - Utiliza `agent-browser` (Chromium / CDP) contra `http://127.0.0.1:3000`.
  - Executa login com as novas credenciais privadas dos 3 operadores.
  - Comprova no DOM:
    - Gestor: Acesso integral a OS e Módulo Financeiro.
    - Atendente: Acesso a OS e Cadastros, sem acesso a backups.
    - Mecânico: Acesso a OS e Boxes, com Blindagem Financeira comprovada (contas a pagar/receber bloqueadas no frontend e omitidas da resposta JSON).

### 2.5 Manutenção do Checklist como PENDENTE
- Em `docs/operacao/CHECKLIST_INICIO_PILOTO.md`:
  - O Critério 2 (Backup em Armazenamento Realmente Independente) é expressamente marcado como **PENDENTE (Aguardando conexão física do dispositivo ou servidor remoto)**.
  - O Parecer Conclusivo é atualizado para **PENDENTE DE HARDWARE EXTERNO / NÃO LIBERADO PARA RPO EXTERNO ATÉ CONEXÃO FÍSICA**.
  - Somente após o hardware físico estar conectado na oficina a liberação final poderá ser atestada.
