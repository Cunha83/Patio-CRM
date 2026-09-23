# Especificação Técnica de Design: Revisão e Correção do Pacote Operacional

**Data:** 21 de Setembro de 2026  
**Documento de Origem:** `docs/REVISAO_PACOTE_OPERACIONAL_2026-09-21.md`  
**Escopo:** Correção do ciclo de vida da trava do supervisor durante reinícios do processo filho, especificação correta de concorrência no Agendador de Tarefas do Windows (`MultipleInstancesPolicy=IgnoreNew`), rotulagem e ampliação dos testes de instalação limpa e alinhamento do checklist de entrada.

---

## 1. Diagnóstico e Requisitos

### 1.1 Ciclo de Vida da Trava do Supervisor vs Processo Filho (P1)
- **Problema:** A função `startProcess()` em `scripts/supervise_patio.cjs` invocava `acquireInstanceLock()` em cada chamada. Ao ocorrer a queda de um filho, o supervisor aguardava 2 segundos e chamava `startProcess()`. Esta tentava adquirir a trava que já pertencia ao PID do próprio supervisor, detectava o PID ativo, tratava erroneamente como uma instância duplicada concorrente e abortava com código 1.
- **Solução Arquitetural:**
  1. A aquisição da trava atômica de instância (`locks/patio-supervisor.lock`) deve ocorrer **uma única vez** na inicialização do supervisor (`startSupervisor()`).
  2. A trava permanece retida continuamente pelo processo supervisor durante todo o seu ciclo de vida, independentemente de quantas quedas ou reinícios do processo filho ocorram.
  3. A função `spawnChild()` cuida apenas de verificar a porta TCP e instanciar o processo filho (`server.js`), reconectando os pipes de log e anexando os tratadores de saída.
  4. Outro supervisor concorrente que tentar iniciar enquanto o primeiro estiver ativo (mesmo durante o intervalo entre a queda e a reinicialização do filho) continuará bloqueado pela trava atômica.
  5. A liberação da trava (`releaseInstanceLock`) só ocorre quando o supervisor propriamente dito encerra (por `SIGINT`, `SIGTERM`, estouro do limite de crash loop de 5 falhas em 60s ou encerramento do processo).

### 1.2 Correção da Política de Concorrência do Agendador de Tarefas do Windows
- **Problema:** O manual `SUPERVISAO_WINDOWS.md` atribuía à opção `/np` do comando `schtasks` a prevenção de execuções sobrepostas. Na documentação oficial da Microsoft, `/np` significa "Do Not Store Password" (Non-Password), sem efeito sobre concorrência.
- **Solução Arquitetural:**
  1. Utilizar a configuração formal da API do Task Scheduler do Windows: `MultipleInstancesPolicy = IgnoreNew` (se uma execução já estiver em andamento quando o gatilho de 1 hora disparar, a nova instância é descartada sem conflitar com o backup em curso).
  2. Fornecer a definição oficial em XML exportável (`docs/operacao/PatioCRM_Backup_WAL.xml`) e o comando PowerShell correspondente (`New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew`).
  3. Documentar a inspeção e verificação formal da propriedade via PowerShell:
     `Get-ScheduledTask -TaskName "PatioCRM_Backup_WAL" | Select-Object -ExpandProperty Settings | Select-Object MultipleInstancesPolicy`.
  4. Esclarecer a validação de permissões de rede para destinos externos em NAS/SMB.

### 1.3 Rotulagem e Ampliação dos Testes de Instalação Limpa
- **Ajuste:**
  1. Rotular o teste existente em `tests/clean_install_manifest.test.cjs` com precisão técnica: "Cópia, Integridade Criptográfica de Hashes e Sintaxe de Código a partir do Manifesto".
  2. Adicionar teste complementar de "Instalação Funcional em Pasta Limpa": inicializa o servidor em porta efêmera a partir da pasta limpa e verifica a sonda `/health` retornando HTTP 200.

---

## 2. Matriz de Testes e Validação Automatizada

1. **Regressão de Reinício do Supervisor (`tests/supervisor_isolated.test.cjs`):**
   - **Caso 1:** Filho sintético falha na 1ª execução (código 7) e permanece saudável na 2ª execução. Supervisor deve manter a trava continuamente, não cair, executar o reinício e o segundo supervisor concorrente deve ser rejeitado durante todo o ciclo.
   - **Caso 2:** Limite de crash loop (mais de 5 falhas em 60s) aborta o supervisor com segurança e remove a trava.
   - **Caso 3:** Encerramento limpo via `SIGTERM` mata o filho e limpa a trava sem deixar processos órfãos.
   - **Caso 4:** Porta ocupada impede início.
   - **Caso 5:** Recuperação de trava abandonada por PID inativo.

2. **Validação da Configuração do Agendador (`tests/scheduled_task_config.test.cjs`):**
   - Validar XML exportado: nó `<MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>`.
   - Validar caminhos absolutos para `node.exe` e `scripts/executar_backup_operacional.cjs`.
   - Validar ausência de menção enganosa a `/np` como controle de sobreposição.

3. **Regeneração do Manifesto:**
   - Executar `scripts/gerar_manifesto_release.cjs` e atualizar `MANIFESTO_RELEASE_PILOTO_2026-09-21.md` e `manifesto_release.json`.
