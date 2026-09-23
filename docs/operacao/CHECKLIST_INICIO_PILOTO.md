# Checklist Estratificado de Início do Piloto Controlado — Pátio CRM

**Data de Emissão:** 22 de Setembro de 2026  
**Versão do Software:** `1.0.0` (Manifesto Oficial: `docs/operacao/MANIFESTO_RELEASE_PILOTO_2026-09-21.md`)  
**Ambiente Alvo:** Oficina Piloto (1 Unidade, 1 Host Windows, 3 Operadores)  
**Host Físico Comprovado:** `AMF01` (`win32 x64`)  
**Diretório de Deploy:** `C:\Users\AutoMolasFort\.gemini\antigravity-ide\scratch\Patio-CRM-main\deploy-piloto`  
**Destino de Armazenamento Independente:** Dispositivo Físico Segregado Dedicado (`D:\PatioCRM_Backups`) com guardrails estritos contra `subst`, mesmo disco e loopback local (`assertIndependentDestination`)  
**Porta Operacional:** `127.0.0.1:3000` (Supervisionada por `scripts/supervise_patio.cjs`)  
**Status Geral de Liberação:** **PENDENTE (Aguardando Conexão Física do Dispositivo Independente na Oficina)**  

---

## 1. Matriz de Critérios Operacionais de Prontidão

| # | Critério Operacional | Código | Teste Isolado | Instalação no Host | Evidência Comprobatória / Ação Concluída |
|---|---|:---:|:---:|:---:|---|
| **1** | **Proteção Não Destrutiva & Guarda Pré-Voo (Anti-Data-Loss)** | **CONCLUÍDO** | **APROVADO** | **COMPROVADO** | Guarda pré-voo `assertCleanDeploymentTarget` recusa explicitamente destinos contendo `patio.db`, `.env`, `public` ou `server.js` **antes de qualquer escrita no disco**, sem apagar nem sobrescrever arquivos. `scripts/executar_implantacao_real_piloto.cjs` e `scripts/instalar_pacote_piloto.cjs` abortam com código 1. Preservação de banco, `.env` e anexos validada em `tests/deployment_preflight_guard.test.cjs` (3/3 pass). Base original `patio.db` raiz permaneceu 100% intacta. |
| **2** | **Backup em Armazenamento Realmente Independente** | **CONCLUÍDO** | **APROVADO** | **PENDENTE (Hardware)** | Guardrails estritos implementados em `scripts/executar_backup_operacional.cjs` (`assertIndependentDestination`), recusando expressamente unidades `subst`, caminhos no mesmo disco local e URLs apontando para `localhost`/`127.0.0.1`/loopback local (`tests/remote_independent_backup.test.cjs` 7/7 pass e `tests/independent_device_backup.test.cjs` 4/4 pass). Remoção total de fallbacks e tokens fixos (`PatioRemoteVaultSecretToken2026!` eliminado). Tarefa agendada oficial do Windows (`PatioCRM_Backup_WAL`) disparada e auditada com sucesso (`docs/evidencias/auditoria_execucao_tarefa_agendada.json`): registrou novo snapshot no SQLite operacional (`local_completed`), gerou pacote e manifesto SHA-256 e emitiu alerta formal de hardware desconectado (`Destino externo inacessível: "D:\PatioCRM_Backups"`). Restauração autônoma comprovada (`docs/evidencias/comprovacao_restauracao_host.json`, RTO 3.02s). O critério permanece formalmente **PENDENTE** até a conexão física do pendrive USB dedicado na abertura da oficina. |
| **3** | **Agendador de Tarefas do Windows (`IgnoreNew` em UTF-8)** | **CONCLUÍDO** | **APROVADO** | **COMPROVADO** | Tarefa agendada oficial `PatioCRM_Backup_WAL` disparada no Windows Task Scheduler (`schtasks /Run`), executou e foi auditada em profundidade no SQLite de produção e disco (`docs/evidencias/auditoria_execucao_tarefa_agendada.json`). XML UTF-8 validado pelo parser `.NET XmlReader` do Windows, inclusive com escape de `&` (`tests/scheduled_task_config.test.cjs` aprovado com 6/6 pass). |
| **4** | **Instância da Porta 3000 sob Supervisor** | **CONCLUÍDO** | **APROVADO** | **COMPROVADO** | Processo órfão na porta 3000 identificado e encerrado. Deploy oficial ativo sob `scripts/supervise_patio.cjs` com trava de instância em `deploy-piloto/locks/patio-supervisor.lock`. Endpoint `/ready` responde 200 OK (`whatsapp: 'disabled'`, `database: 'ok'`, `status: 'ready'`). Reinício automático e retenção contínua da trava atômica testados com sucesso (`tests/supervisor_isolated.test.cjs` aprovado com 4/4 pass). |
| **5** | **Substituição de Credenciais de Exemplo** | **CONCLUÍDO** | **APROVADO** | **COMPROVADO** | Credenciais de exemplo e senhas expostas anteriormente foram 100% substituídas por novas senhas secretas de alta entropia (geradas via CSPRNG e salvas exclusivamente em `.env` privado). Hashes Scrypt atualizados no SQLite operacional `deploy-piloto/patio.db`. Tentativas com senhas antigas retornam estritamente HTTP 401 Unauthorized (`tests/rbac_permissions_audit.test.cjs` 6/6 pass). Nenhuma credencial em texto claro é publicada em documentação ou logs. |
| **6** | **Auditoria de Permissões RBAC dos Operadores** | **CONCLUÍDO** | **APROVADO** | **COMPROVADO** | **Gestor:** acesso total a OS e módulo financeiro; **Atendente:** leitura/escrita de OS e cadastros, bloqueio total a backups administrativos (403); **Mecânico:** visualização de OS e boxes com Blindagem Financeira ativa (contas a pagar/receber suprimidas do payload). |
| **7** | **Homologação Frontend no Navegador via `agent-browser`** | **CONCLUÍDO** | **APROVADO** | **COMPROVADO** | Testes automatizados executados no Chromium via `agent-browser` na porta 3000 (`scripts/homologar_frontend_agent_browser.cjs`): login dos 3 operadores aprovado, renderização dos elementos DOM (`#app`, `#nav`) confirmada, contagem de OS validada, blindagem financeira do mecânico comprovada no navegador e rejeição de senhas antigas com 401 confirmada (`docs/evidencias/validacao_frontend_operadores_agent_browser.log`). |
| **8** | **Sincronização Não Destrutiva e Manifesto SHA-256** | **CONCLUÍDO** | **APROVADO** | **COMPROVADO** | Release sincronizada para `deploy-piloto/` sem alterar `patio.db` ou `.env`. Manifesto oficial atualizado com integridade auditada por hashes SHA-256. Bateria completa de testes aprovada. |
| **9** | **Desativação Estrita de WhatsApp e Fiscal de Produção** | **CONCLUÍDO** | **APROVADO** | **COMPROVADO** | `DISABLE_WHATSAPP=true` e `DISABLE_INTEGRATIONS=true` ativos no `.env` e confirmados em tempo de execução. Emissão fiscal oficial permanece no ERP legado da oficina. |
| **10** | **Recuperação Operacional e RTO/RPO Calibrados** | **CONCLUÍDO** | **APROVADO** | **COMPROVADO** | Recuperação total comprovada a partir de pacote autocontido (`scripts/comprovar_restauracao_remota_host.cjs`): descompactação, validação de integridade de hashes SHA-256, integridade estrutural SQLite (PRAGMA integrity_check = ok), boot da aplicação em porta isolada, rejeição de credenciais antigas com 401 e login auditado dos 3 operadores. **RTO Medido:** 3.02s. **RPO Nominal:** **≤ 1 hora (até 60 minutos)**, determinado pela periodicidade horária da tarefa agendada (`PT1H`), refletindo fielmente a janela de dados potencialmente não recuperáveis entre ciclos de backup. |

---

## 2. Inventário de Credenciais dos Operadores

| Operador | Perfil RBAC | Usuário / E-mail | Provisionamento | Política de Senhas | Status no Host |
|---|---|---|---|---|:---:|
| **Gestor da Oficina** | `tenant_admin` | `gestor@oficina.com.br` | `PILOTO_GESTOR_SENHA` (Privado / .env) | Alta Entropia (Scrypt + Salt individual) | **ATIVO (200 OK)** |
| **Atendente de Recepção** | `atendente` | `atendente@oficina.com.br` | `PILOTO_ATENDENTE_SENHA` (Privado / .env) | Alta Entropia (Scrypt + Salt individual) | **ATIVO (200 OK)** |
| **Mecânico Chefe de Box** | `mecanico` | `mecanico@oficina.com.br` | `PILOTO_MECANICO_SENHA` (Privado / .env) | Alta Entropia (Scrypt + Salt individual) | **ATIVO (200 OK)** |

> **Nota de Segurança e Sigilo:** Nenhuma senha em texto claro é versionada em repositório ou exposta em relatórios. As credenciais iniciais são entregues diretamente aos operadores por canal seguro físico na abertura da oficina, com exigência de troca de senha no primeiro acesso. Todas as credenciais de desenvolvimento anteriores foram integralmente invalidadas.

---

## 3. Instruções para a Abertura da Oficina

1. **Conexão do Armazenamento Independente:**
   - Conectar o pendrive USB dedicado (formatado em NTFS/exFAT com rótulo `BACKUP_EXT`) em uma porta USB do computador `AMF01`.
   - Certificar-se de que a unidade foi mapeada como `D:\` (ou ajustar `BACKUP_EXTERNAL_DIR` no `.env` caso receba outra letra).
   - O agendador de tarefas (`PatioCRM_Backup_WAL`) passará a replicar e verificar automaticamente os pacotes horários na unidade física.

2. **Acesso ao Sistema pelos Operadores:**
   - Abrir o navegador Google Chrome no computador da oficina.
   - Navegar para: `http://localhost:3000/?tenant=oficina_piloto_01`
   - Inserir o usuário e a senha privada entregue em envelope lacrado.

3. **Verificação Rápida de Saúde:**
   - Acessar `http://localhost:3000/ready` (deve retornar `status: ready`, `database: ok`).

---

## 4. Parecer Formal Conclusivo de Liberação

Em conformidade estrita com os critérios de prudência operacional e transparência de auditoria:

👉 **O PÁTIO CRM ATINGIU PRONTIDÃO TÉCNICA INTEGRAL NO HOST AMF01.**  
👉 **A LIBERAÇÃO FINAL PARA INÍCIO OPERACIONAL PERMANECE PENDENTE DA CONEXÃO FÍSICA DO DISPOSITIVO DE BACKUP (UNIDADE D:\) NA ABERTURA DA OFICINA.**

- **Software, Banco e Supervisor:** 100% prontos, testados e operando na porta 3000 com trava exclusiva.
- **Credenciais e Segurança:** Senhas privadas de alta entropia provisionadas com Scrypt, blindagem financeira comprovada no navegador via `agent-browser` e senhas antigas invalidadas (401).
- **Proteção de Dados:** Backup WAL local ativo de hora em hora. A redundância externa física depende estritamente da inserção do hardware USB no computador pela equipe da oficina.
