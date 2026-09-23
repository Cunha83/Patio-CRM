# Revisão independente do walkthrough de estabilização

Data: 21/09/2026. Escopo: leitura do código atual, reprodução HTTP em servidor separado com SQLite temporário, conferência do benchmark e reexecução da suíte. Código da aplicação não alterado nesta revisão.

## Parecer

**NÃO APTO para piloto operacional com dados reais enquanto houver sucesso HTTP sem persistência.** O parecer do walkthrough antecipa uma conclusão não sustentada pelos endpoints atuais.

## P0 reproduzido: sucesso falso em cadastros concorrentes

Em servidor filho isolado (`NODE_ENV=test`, `DISABLE_INTEGRATIONS=true`, `DB_PATH`, `UPLOAD_DIR` e `BACKUP_DIR` temporários, porta efêmera), inicializei um estado vazio por `/api/estado`. Disparei 20 POSTs concorrentes em `/api/frotas`, com nomes distintos, e consultei `/api/frotas` ao terminar.

Resultado real:

```json
{
  "attempts": 20,
  "http200": 20,
  "reportedSuccess": 20,
  "persisted": 1,
  "failures": [],
  "conflictLogs": 19
}
```

O subprocesso foi encerrado após o ensaio. Nenhum cadastro foi enviado ao servidor operacional na porta 3000.

Causa: o repositório agora rejeita snapshots obsoletos, mas `salvarEstado` devolve o resultado sem exigir sucesso e diversas rotas o ignoram. `/api/frotas` chama `persistTenantState` e retorna `success: true` mesmo após conflito. `mutateTenantState` está definido, porém a busca em `server.js` não encontrou chamadas além da própria definição. O teste novo e o benchmark usam `mutateState` diretamente, sem validar esse caminho HTTP.

Também permanecem incrementos manuais de versão antes de `salvarEstado`, inclusive no upload de nota e em fluxos WhatsApp, contrariando a afirmação de remoção completa no walkthrough. Com a comparação agora estrita, esses incrementos precisam ser auditados para evitar rejeições indevidas.

## Evidências adicionais e limites

- Reexecutei a suíte completa com concorrência 2: **506 testes, 505 aprovados, zero falhas/cancelados, 1 ignorado, saída 0, duração 52,22 segundos**. Log: `docs/evidencias/analise-2026-09-21/revisao-walkthrough-suite.txt`. A suíte passa, mas não cobre o falso sucesso HTTP reproduzido acima.
- A correção dos boxes dinâmicos e a mudança da pasta do probe estão presentes no código.
- `tests/readiness_probe.test.cjs` contém dois subtestes: sucesso do `/ready` e versão do `/health`. A contagem de três inclui o teste pai; não há cenário de falha de banco ou storage comprovando 503 nesse arquivo.
- `/ready` considera WhatsApp pronto se `wppClient` existir, mesmo que esteja aguardando QR ou desconectado. `DISABLE_WHATSAPP` aparece na apresentação do status, mas a busca no servidor não encontrou aplicação dessa flag na inicialização do cliente. O agendador também é declarado ativo a partir de configuração, sem confirmar funcionamento.
- O benchmark invoca `getState`/`mutateState` diretamente. Não mede HTTP, autenticação, DOM nem abertura do pátio. A latência denominada escrita inclui fila e mutação. O heap final de 7,51 MB pertence ao processo do benchmark, não ao servidor completo. Não há comparação antes/depois que comprove o ganho de inicialização ou memória atribuído ao lazy loading.
- `GET http://127.0.0.1:3000/health` respondeu HTTP 200, versão 1.0.0. Isso confirma disponibilidade naquele instante, não supervisão durável como serviço/daemon nem prontidão operacional completa.
- Lazy loading não remove as dependências do pacote. Não foi feita nova auditoria npm nesta revisão; não há evidência aqui de eliminação dos alertas anteriores.
- Homologação visual e restauração operacional não foram executadas nesta revisão.

## Prompt de correção para o Antigravity

Reabra a estabilização: o parecer APTO ainda não é sustentado. Leia este documento e corrija o P0 reproduzido sem alterar a base operacional.

1. Crie primeiro uma regressão HTTP real: 20 POSTs concorrentes em `/api/frotas`; todo cadastro confirmado deve existir no GET e após reinício. Se houver conflito, retorne 409 explícito, nunca HTTP 200 com sucesso fictício.
2. Aplique a mutação atômica aos fluxos reais que fazem leitura–alteração–gravação. Audite `salvarEstado`, `persistTenantState`, `persistCurrentState` e chamadas diretas ao repositório, incluindo OS, estoque, fornecedores, tarefas internas e integrações. Não basta definir um helper sem utilizá-lo.
3. Propague falhas de persistência de forma obrigatória. Remova incrementos prematuros de versão nos chamadores; o repositório deve publicar a nova versão após salvar. Preserve rascunhos, RBAC, auditoria e isolamento entre oficinas. Não use `force: true` para contornar conflitos fora de uma região realmente serializada.
4. Torne seguro o contrato de `mutateState`: sem uma fila válida compartilhada, falhar explicitamente ou usar uma fila interna canônica; não prometer atomicidade quando `enqueueWrite` é opcional e a persistência força a gravação.
5. Complete testes de `/ready` com falha real de storage e de banco em ambiente temporário, verificando 503. Use o estado efetivo de WhatsApp/agendador e aplique flags de desativação na inicialização, além da apresentação.
6. Execute benchmark HTTP com dados representativos e jornada no navegador. Rotule separadamente métricas do repositório, da API e da interface. Não anuncie redução de RAM ou de tempo sem medição comparável antes/depois.
7. Execute a suíte completa e os novos testes HTTP, registre saída e contagens, atualize o walkthrough com somente resultados comprovados. Preserve todo trabalho local e não inicie novas integrações externas.

Critério de liberação: nenhum sucesso falso; todas as operações confirmadas persistem após concorrência e reinício; testes e jornada principal aprovados; limitações de segurança/backup explicitadas. Priorize essa correção antes de novas funcionalidades ou refatoração ampla.
