# Especificação Técnica: Prontidão Operacional, Blindagem Não Destrutiva e Liberação do Piloto

**Data:** 22/09/2026  
**Ambiente Alvo:** Host Oficial da Oficina (`AMF01`, Windows 64-bit)  
**Escopo:** Fechamento rigoroso da prontidão operacional sem ampliação de funcionalidades, garantindo preservação integral de dados, backup em dispositivo independente, deploy sob supervisor na porta 3000, credenciais definitivas com auditoria RBAC e sincronização não destrutiva.

---

## 1. Diretrizes Arquiteturais e Requisitos

### 1.1 Proteção Não Destrutiva de Instalador e Seed (Anti-Data-Loss)
- **Instalador (`scripts/instalar_pacote_piloto.cjs`):**
  - Checa se o diretório de destino (`targetDir`) já existe. Se existir e contiver qualquer arquivo, lança erro `DESTINO_JA_EXISTE` e encerra a execução imediatamente sem deletar, truncar ou modificar o conteúdo pré-existente (`fs.rmSync` destrutivo removido do fluxo normal).
- **Seed Operacional do Piloto (`scripts/executar_implantacao_real_piloto.cjs`):**
  - Checa se o banco de dados de destino já existe e contém dados. Se existir e tiver tamanho maior que zero ou usuários já cadastrados, recusa recriar ou limpar o banco, lançando `BANCO_JA_EXISTE` sem apagar arquivos (`patio.db`, `patio.db-wal`, `patio.db-shm`).
- **Seed Demonstrativo (`scripts/seedDemoDataset.js`):**
  - Checa se a chave do tenant demonstrativo já existe antes de inserir. Se existir, recusa com erro em vez de sobrescrever silenciosamente, exigindo `--purge` explícito para recriação intencional.

### 1.2 Backup em Dispositivo Independente / Destino Remoto
- **Dispositivo Independente:**
  - Configuração de unidade de armazenamento dedicada `B:\` (via mapeamento de volume independente no host).
  - Atualização do arquivo `deploy-piloto/.env`: `BACKUP_EXTERNAL_DIR=B:\PatioCRM_Backups` (ou `B:\`).
  - Execução da tarefa agendada do Windows `PatioCRM_Backup_WAL`.
  - Comprovação da geração do pacote físico `package_bck_*` na unidade `B:\`.
  - Validação dos hashes SHA-256 dos arquivos arquivados (`patio.db`, anexos e manifesto).
  - Comprovação de restauração isolada a partir exclusivamente do pacote da unidade `B:\`.

### 1.3 Identificação e Supervisão da Porta 3000
- **Diagnóstico da Instância Atual:**
  - Identificação do processo não supervisionado que ocupa a porta 3000 (PID 17880, iniciado via PowerShell interativo).
  - Finalização graciosa e segura do processo órfão para desocupar a porta.
- **Deploy Correto sob Supervisor:**
  - Inicialização da aplicação oficial a partir de `deploy-piloto/` utilizando `scripts/supervise_patio.cjs`.
  - Comprovação de aquisição da trava atômica `deploy-piloto/locks/patio_supervisor.lock`.
  - Verificação dos endpoints `/health` e `/ready` (HTTP 200).
  - Confirmação de que o WhatsApp está inativo (`DISABLE_WHATSAPP=true` em `deploy-piloto/.env`) e integrações fiscais externas desativadas (`DISABLE_INTEGRATIONS=true`).

### 1.4 Substituição de Credenciais de Exemplo e Auditoria RBAC
- **Credenciais Fortes Definitivas:**
  - Substituição das senhas de exemplo por credenciais de alta entropia atendendo às políticas de segurança (`>= 12` caracteres, maiúsculas, minúsculas, números e caracteres especiais, sem termos comuns):
    - **Gestor:** `gestor@oficina.com.br` / `[PROVISIONADA_VIA_ENV_OU_COFRE]` (`tenant_admin`)
    - **Atendente:** `atendente@oficina.com.br` / `[PROVISIONADA_VIA_ENV_OU_COFRE]` (`atendente`)
    - **Mecânico:** `mecanico@oficina.com.br` / `[PROVISIONADA_VIA_ENV_OU_COFRE]` (`mecanico`)
- **Auditoria de Permissões RBAC:**
  - `tenant_admin`: permissão total operacional e administrativa (`os:*`, `financial:*`, `admin:*`).
  - `atendente`: leitura e abertura de OS, contatos no CRM e orçamentos; bloqueio a configurações administrativas e gestão de backups.
  - `mecanico`: leitura de OS alocada, checklist de vistoria e apontamento de mão de obra; blindagem financeira ativa (valores monetários, custos e margens estritamente bloqueados no payload e no DOM).
- **Homologação E2E de Frontend:**
  - Testes automatizados de jornada via `agent-browser` (Chromium / puppeteer) simulando o login real dos 3 operadores e conferindo a blindagem e comportamento visual da interface Web.

### 1.5 Sincronização Não Destrutiva da Release e Liberação do Piloto
- **Sincronização Não Destrutiva:**
  - Comparação seletiva de arquivos de código (`server.js`, `db.js`, `lib/`, `scripts/`, `public/`) preservando rigorosamente `patio.db`, `.env`, `public/uploads/` e `node_modules/` do deploy.
  - Re-geração e auditoria do manifesto de release oficial.
  - Execução da suíte completa de testes dirigidos (`test-preload.cjs`).
  - Atualização do checklist operacional com evidências práticas de cada etapa.
  - Emissão do parecer conclusivo liberando o piloto controlado (1 oficina, 3 operadores, 5 dias úteis).

---

## 2. Matriz de Não-Regressão e Segurança
- O banco de dados de desenvolvimento raiz `patio.db` permanece 100% intocado.
- Não há perda nem truncamento acidental de dados em diretórios existentes.
- O supervisor mantém tolerância a falhas com reinício automático do processo filho mantendo a trava de instância única.
- WhatsApp Web e Emissão Fiscal SEFAZ permanecem desativados.
