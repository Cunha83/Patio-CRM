# Guia de Operação, Monitoramento e Suporte — Pátio CRM

Manual oficial de sustentação, monitoramento em produção, gestão de incidentes e procedimentos de atualização para o **Pátio CRM** (Linha Pesada).

---

## 1. Arquitetura e Requisitos Operacionais

- **Runtime:** Node.js v20.x ou superior (CommonJS).
- **Banco de Dados:** SQLite 3 nativo em modo **WAL (Write-Ahead Logging)** com `PRAGMA synchronous = FULL` e `busy_timeout = 5000`.
- **Arquivos:**
  - `patio.db`: Banco relacional principal (tabelas `kv`, `users`, `memberships`, `billing_*`, `backups`, `erp_outbox`, `security_audit_log`).
  - `patio.db-wal` e `patio.db-shm`: Arquivos temporários de log e memória compartilhada WAL.
  - `public/uploads/`: Diretório de anexos de OS, comprovantes, ordens de compra e fotos de veículos.
- **Porta Padrão:** `3000` (configurável via variável de ambiente `PORT`).

---

## 2. Monitoramento de Saúde da Aplicação

### 2.1 Endpoint de Liveness (`GET /health`)
- **Finalidade:** Verificação se o processo Node.js está vivo e respondendo.
- **Retorno Esperado:** `HTTP 200 OK`
```json
{
  "status": "ok",
  "service": "patio-crm",
  "version": "1.0.0",
  "uptimeSeconds": 1420,
  "memoryUsage": {
    "rss": 85240000,
    "heapTotal": 45000000,
    "heapUsed": 32000000
  },
  "timestamp": "2026-09-14T12:00:00.000Z"
}
```

### 2.2 Endpoint de Readiness (`GET /ready`)
- **Finalidade:** Verificação ativa de todos os subsistemas essenciais antes de direcionar tráfego.
- **Checagens executadas:**
  1. `database`: Teste real com `SELECT 1 as alive` no SQLite.
  2. `storage`: Verificação de permissão de escrita no diretório de uploads.
  3. `writeQueue`: Profundidade da fila de concorrência transacional.
  4. `scheduler`: Batimento de pulso ativo (heartbeat) do agendador multi-tenant.
  5. `billing`: Verificação de credenciais ativas do Asaas em modo produção.
- **Status de Sucesso:** `HTTP 200 OK`
- **Status de Falha:** `HTTP 503 Service Unavailable` com o detalhamento do subsistema degradado.

---

## 3. Provisionamento e Gestão de Administradores

Por motivos rigorosos de segurança em produção, o Pátio CRM **não possui usuário ou senha padrão predefinidos** (como `patio/patio`).

### 3.1 Provisionamento via CLI
Para criar o primeiro administrador com senha criptográfica forte (scrypt):
```bash
# Provisionar administrador da plataforma SaaS (Real Soluções)
node scripts/provision-admin.js --role platform_admin --username admin@realsolucoes.com.br

# Provisionar administrador de uma oficina específica (tenant_admin)
node scripts/provision-admin.js --role tenant_admin --tenant default --username gestor@oficina.com.br --password "MinhaSenhaForte@2026"
```
Se a senha não for informada via `--password`, o script gerará automaticamente uma credencial com alta entropia (16 caracteres alfanuméricos com símbolos).

---

## 4. Durabilidade Transacional, Rotina de Backup e Recuperação Operacional

### 4.1 Durabilidade das Transações
O SQLite opera no modo **WAL (Write-Ahead Logging)** configurado com `PRAGMA synchronous = FULL` e `busy_timeout = 5000`:
- **Garantia de Persistência:** Cada transação confirmada (`COMMIT`) é descarregada para o disco físico com operação de sincronização síncrona (`fsync`) antes de responder ao chamador.
- **Resiliência a Falhas:** Quedas repentinas do processo Node.js ou interrupções de energia não corrompem o arquivo principal (`patio.db`), pois a recuperação de transações pendentes é realizada automaticamente pelo SQLite a partir do journal WAL (`patio.db-wal`) na reinicialização.

### 4.2 Frequência e Destino dos Backups
- **Mecanismo de Geração:** Utiliza o comando atômico `VACUUM INTO`, gerando uma cópia estática e consistente do banco sem travar operações concorrentes de leitura e escrita.
- **Destino dos Arquivos:** Diretório local configurável via variável de ambiente `BACKUP_DIR` (padrão: `./backups/`). Por segurança de isolamento, a API bloqueia acessos fora da raiz autorizada contra symlinks, junctions e path traversal.
- **Frequência Operacional:** O sistema disponibiliza o serviço de backup (`services/backupService.js`) e endpoint restrito à infraestrutura (`POST /api/backup/executar`). **Não há serviço de cron interno ou agendador embutido no processo Node.js.** A automação periódica (ex: `cron`, `systemd timer` ou `Agendador de Tarefas do Windows`) depende de configuração da infraestrutura da oficina/hospedagem, a ser autorizada e implantada pela equipe responsável. Na ausência de agendador externo, os backups ocorrem sob demanda (manual via CLI ou acionamento administrativo).
- **Integridade Criptográfica:** Cada snapshot gravado gera um hash SHA-256 e validação de páginas via `PRAGMA integrity_check`, registrados na tabela de auditoria `backups`.

### 4.3 Perda de Dados Observada em Ensaio (Análise de RPO)
- **Comportamento em Restauração:** Ao restaurar o banco de dados a partir de um arquivo de backup, **todas as alterações comitadas após o instante daquele snapshot são perdidas**, uma vez que não há replicação contínua ou streaming de WAL para nós secundários.
- **RPO de Política vs. RPO Efetivo:**
  - *Meta de Política:* Um RPO de 1 hora requer que a infraestrutura externa execute o backup atômico a cada 60 minutos e preserve os arquivos com sucesso comprovado.
  - *Estado Atual:* Enquanto não houver agendamento externo ativado e monitorado, o ponto recuperável limita-se ao último backup gerado manualmente. Não é possível declarar RPO < 1h como garantia nativa da aplicação sem a esteira de agendamento em operação.

### 4.4 Tempo de Recuperação no Cenário Sintético Testado (Análise de RTO)
As métricas de recuperação foram medidas em ensaio sintético ponta a ponta ([`tests/e2e_operational_recovery.test.cjs`](file:///c:/Users/AutoMolasFort/.gemini/antigravity-ide/scratch/Patio-CRM-main/tests/e2e_operational_recovery.test.cjs)) sobre base SQLite de aproximadamente **58 KB** (contendo tabelas essenciais de clientes, OSs, veículos, credenciais scrypt, faturamento, outbox ERP e logs de auditoria).

As medições variam de acordo com as condições de execução e carga de CPU/I/O no sistema operacional:

1. **Execução Standalone Isolada (Processo Dedicado em Repouso):**
   - Criação do Backup Atômico WAL (`VACUUM INTO`): **46,22 ms**;
   - Validação de Integridade (SHA-256 + PRAGMA integrity_check): **10,13 ms**;
   - Restauração Física (Cópia Exclusiva + Marcador de Trava Fiscal): **9,83 ms**;
   - Recuperação Operacional Completa (Boot + Auth + Read + Write): **3.395,83 ms**;
   - **RTO Operacional Total Medido:** **3.405,66 ms (~3,41 s)**.

2. **Execução na Suíte Completa Sob Alta Carga Concorrente (`testes-completos-execucao-final.txt`):**
   - Condições: Executado concorrentemente com outros 35 arquivos de teste da suíte, sob competição de I/O de disco e múltiplos processos filhos Node.js no Windows.
   - Criação do Backup Atômico WAL: **56,00 ms**;
   - Validação de Integridade: **8,06 ms**;
   - Restauração Física: **11,44 ms**;
   - Recuperação Operacional (Boot + Auth + Read + Write): **6.256,74 ms**;
   - **RTO Operacional Total Medido:** **6.268,19 ms (~6,27 s)**.

3. **Execução na Suíte Oficial com Manifesto Dinâmico (`testes-completos-execucao-20260916_105048-66ef17.txt`):**
   - Condições: Execução da suíte completa com runner otimizado e cache de disco aquecido.
   - Criação do Backup Atômico WAL: **53,69 ms**;
   - Validação de Integridade: **8,48 ms**;
   - Restauração Física: **9,10 ms**;
   - Recuperação Operacional (Boot + Auth + Read + Write): **2.299,43 ms**;
   - **RTO Operacional Total Medido:** **2.308,53 ms (~2,31 s)**.

- **Limitações Técnicas e Distinção de SLA:**
  - A variação observada (entre ~2,3s e ~6,3s) decorre da latência do comando `child_process.spawn` do Node.js no Windows ao inicializar todo o runtime do Express e conexões SQLite sob diferentes patamares de carga de CPU e disco.
  - Todas as medições foram executadas estritamente em ambiente de desenvolvimento local (Windows x64 / SSD NVMe) com volume de dados sintético reduzido (< 1 MB).
  - **Nenhuma dessas medições constitui ou deve ser transformada em SLA contratual de produção.** O tempo real em ambiente de produção dependerá da infraestrutura de hospedagem (I/O de storage em nuvem, latência de rede, CPU alocada) e do volume real da base de dados (centenas de megabytes ou gigabytes).

### 4.5 Procedimento de Restauração Operacional
1. Encerrar o processo da aplicação: `pm2 stop patio-crm` ou encerrar o serviço de container.
2. Identificar o arquivo de snapshot em `BACKUP_DIR`:
   `SELECT id, filepath, checksum_sha256 FROM backups ORDER BY created_at DESC LIMIT 5;`
3. Executar a validação de integridade antes da cópia:
```javascript
const { restaurarBackup } = require('./services/backupService');
const resultado = await restaurarBackup({
  backupFilepath: './backups/patio__all_snapshot.db',
  verifyOnly: true
});
console.log(resultado.integrityCheck); // Deve retornar "ok"
```
4. Restaurar fisicamente para um arquivo de destino limpo, garantindo a criação do marcador fiscal de trava (`fiscal_restore_locked = true` em `kv`) para impedir emissões acidentais duplicadas antes da conferência manual.
5. Reiniciar o serviço e checar os endpoints `/health` e `/ready`.

---

## 5. Procedimentos de Atualização e Rollback de Versão

### 5.1 Atualização de Versão
1. Executar backup atômico preventivo antes de qualquer modificação:
   `node -e "require('./services/backupService').executarBackupWal({ actorId: 'deploy_pre' })"`
2. Baixar a nova versão do código.
3. Instalar dependências: `npm install --omit=dev`.
4. Executar os testes automatizados de regressão: `npm test`.
5. Reiniciar o servidor Node.js.
6. Verificar o endpoint `/ready`.

### 5.2 Procedimento de Reversão (Rollback)
Em caso de falha pós-deploy:
1. Restaurar o backup pré-deploy através do `services/backupService.js`.
2. Fazer checkout da versão git anterior estável: `git checkout <hash_anterior>`.
3. Reiniciar o serviço e validar `/ready`.

---

## 6. Playbook de Troubleshooting

| Sintoma | Causa Mais Provável | Ação de Correção |
| :--- | :--- | :--- |
| `HTTP 503 /ready: database not_ready` | Banco bloqueado por processo concorrente (`busy_timeout`) | Verificar processos ativos com handle aberto em `patio.db`. Reiniciar processo. |
| `HTTP 401 Credenciais inválidas` | Usuário excedeu 5 tentativas de login e foi bloqueado | Aguardar 15 minutos pelo desbloqueio automático ou executar reset via CLI: `node scripts/provision-admin.js --username <email> --reset-password`. |
| `HTTP 503 /ready: billing unconfigured` | `ASAAS_API_KEY` ausente com `NODE_ENV=production` | Preencher a chave de produção no arquivo `.env`. |
| Erro `SQLITE_CORRUPT` | Queda de energia durante escrita sem UPS | Executar `PRAGMA integrity_check` e restaurar o snapshot mais recente de `backups/`. |
