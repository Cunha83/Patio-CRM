# Design de Engenharia: Implantação e Operação do Piloto Controlado do Pátio CRM

## 1. Contexto e Objetivos

Com a conclusão e auditoria da persistência transacional (P0) e da unificação da confirmação de ações críticas de voz com recuperação de tokens (P1) comprovadas por 528 testes automatizados (saída 0), benchmark de 130 requisições HTTP (100% de conferência física de IDs no SQLite pós-reboot) e 6 jornadas E2E no Chromium via `agent-browser`, o Pátio CRM avança para a **fase de implantação e operação do piloto controlado em ambiente real**.

Conforme estabelecido em `docs/INICIO_PILOTO_CONTROLADO_2026-09-21.md`, o piloto deve:
1. **Preservar o núcleo estabilizado:** Nenhuma funcionalidade nova, nenhuma alteração arquitetural de risco.
2. **Operação controlada:** 1 oficina, 1 processo Node supervisionado, 3 perfis iniciais (Gestor/Admin, Atendimento, Mecânico).
3. **Isolamento estrito:** WhatsApp desativado no ambiente de piloto; emissão fiscal SEFAZ de produção desativada (permanecendo no ERP legado); cobrança automática desativada.
4. **Proteção absoluta de dados:** A base de produção `patio.db` nunca é tocada por ensaios, testes ou seeds.
5. **Garantia de continuidade e recuperação:** Backup físico SQLite WAL via `VACUUM INTO` + anexos arquivados, validação criptográfica SHA-256 e teste operacional de restauração em diretório isolado.
6. **Supervisão no Windows:** Watchdog/supervisor com prevenção de concorrência por porta (EADDRINUSE) e gravação contínua de logs.

---

## 2. Decisões Arquiteturais e Resolução das Dúvidas Operacionais

### 2.1 Dúvida 1: Como realizar Backup WAL Consistente com Anexos sem Impactar a Operação?
- **Problema:** Copiar o arquivo `patio.db` diretamente durante a execução do processo Node em modo WAL causa corrupção de snapshot (páginas divididas entre `patio.db` e `patio.db-wal`). Além disso, cópia de uploads pode colidir com uploads simultâneos.
- **Decisão:** Utilizar a rotina nativa `backupService.executarBackupWal({ includeUploads: true })`:
  1. Executa `VACUUM INTO <caminho_backup>` no SQLite, garantindo integridade transacional sem locks de longa duração.
  2. Arquiva os arquivos de `UPLOAD_DIR` em subdiretório isolado.
  3. Calcula hash SHA-256 do arquivo `.db` gerado.
  4. Registra metadados e checksum na tabela de controle `backups`.
- **Script Operacional:** Fornecer `scripts/executar_backup_operacional.cjs` e agendador Windows via Tarefa Agendada (`schtasks`) a cada 1 hora.
- **Restauração Isolada:** Fornecer `scripts/testar_restauracao_isolada.cjs` para validar restauração em diretório temporário efêmero em `os.tmpdir()`, testando leitura de estado e PRAGMA integrity_check sem interferir com o servidor em execução.

### 2.2 Dúvida 2: Como Supervisionar o Processo Node no Windows e Prevenir Duplicidade?
- **Problema:** No Windows, inicializações múltiplas acidentais geram erros de porta (EADDRINUSE) ou concorrência nociva sobre `patio.db`. Além disso, se o processo cair, a oficina fica desassistida.
- **Decisão:** Implementar `scripts/supervise_patio.cjs`:
  1. Pré-voo de porta: tenta conexão TCP na porta configurada (3000). Se a porta já responder, o supervisor aborta informando o PID ativo para evitar duplicidade.
  2. Monitoramento e reinício: inicia o processo Node filho (`node server.js`) com redirecionamento de logs para `logs/patio-supervisor.log` e `logs/patio-supervisor-err.log`.
  3. Controle de crash loop: se o processo reiniciar mais de 5 vezes em 60 segundos, o supervisor suspende o reinício e aciona alerta no log.
  4. Script de inicialização amigável: `scripts/iniciar_piloto.bat` para inicialização com um clique pelo responsável da oficina.
- **Segurança de Rede:** Configuração documentada para binding restrito a `127.0.0.1` ou IP de rede local privada, com proibição de exposição pública de porta sem túnel/HTTPS reverso.

---

## 3. Estrutura dos Artefatos de Entrega

```
docs/operacao/
├── MANIFESTO_RELEASE_PILOTO_2026-09-21.md   # Manifesto com commit, hashes SHA-256 e exclusões
├── CONFIGURACAO_PILOTO.md                    # Parâmetros de portas, paths, perfis e escopo
├── CHECKLIST_INICIO_PILOTO.md                # Checklist formal com cada item Comprovado ou Pendente
├── GUIA_OPERACIONAL_PILOTO.md                # Instruções para Gestor, Atendimento e Mecânico
├── ROTINA_FECHAMENTO_DIARIO.md               # Passo a passo diário de conferência 5S
├── REGISTRO_INCIDENTES.md                    # Modelo de registro sem dados sensíveis
└── SUPERVISAO_WINDOWS.md                     # Manual de execução contínua e Tarefas Agendadas

scripts/
├── gerar_manifesto_release.cjs               # Gerador automatizado do manifesto com hashes
├── executar_backup_operacional.cjs           # Script autônomo de backup WAL + anexos
├── testar_restauracao_isolada.cjs            # Ensaio de recuperação em diretório temporário
├── supervise_patio.cjs                       # Supervisor Node com detecção de porta e logs
└── iniciar_piloto.bat                        # Inicializador rápido para o operador Windows
```
