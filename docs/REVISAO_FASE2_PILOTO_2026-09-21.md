# Revisão independente — Fase 2 do piloto

**Parecer: NÃO APTO para piloto operacional com dados reais enquanto persistir o falso sucesso em gravações.** A correção de frotas está comprovada; o mesmo defeito continua em outras rotas. Trata-se do bloqueador já solicitado na revisão anterior, não de ampliação do escopo.

## O que foi confirmado

- Suíte reexecutada com `node --require ./scripts/test-preload.cjs --test --test-concurrency=2 --test-timeout=120000 tests/*.test.cjs`: **514 testes, 513 aprovados, zero falhas/cancelados, 1 ignorado, saída 0, duração 57,94 s**.
- Ensaio independente de `/api/frotas`: 20 POSTs concorrentes, 20 respostas HTTP 200 com sucesso, 20 registros presentes no GET. A regressão existente de frotas após reinício também passou na suíte.
- Os hashes SHA-256 de `server.js`, `lib/repository/stateRepository.js` e `scripts/run_agent_browser_verified.cjs` correspondem aos três hashes apresentados no walkthrough. Esta revisão não conferiu todos os hashes da tabela.
- As atribuições `versao = nextRevision(...)` antes identificadas não aparecem na busca atual de `server.js`.
- Há log de conclusão das jornadas agent-browser. O log foi inspecionado; o navegador não foi reexecutado nesta revisão.

## P0 ainda reproduzível: fornecedores

No mesmo ensaio independente, em servidor filho com porta efêmera, banco temporário e integrações desativadas, foram enviados 20 cadastros distintos e simultâneos em `/api/fornecedores`.

| Rota | POSTs | HTTP 200 com sucesso | Registros presentes no GET |
|---|---:|---:|---:|
| `/api/frotas` | 20 | 20 | 20 |
| `/api/fornecedores` | 20 | 20 | **1** |

O servidor filho foi encerrado ao terminar; nenhum cadastro foi enviado à instância operacional.

Em `server.js`, a rota de fornecedores continua lendo `getOrLoadState`, modificando o snapshot, executando `await salvarEstado(req, state)` e respondendo `success: true` sem conferir o resultado. `salvarEstado` continua devolvendo o objeto de falha em vez de obrigar o chamador a tratá-lo. Há muitos outros chamadores com o mesmo padrão em OS, estoque, compras, apontamentos e configurações; esses casos precisam ser auditados. A perda foi reproduzida em fornecedores; não se afirma que cada rota restante já foi reproduzida individualmente.

## Precisão das demais evidências

- O teste negativo de storage provoca uma falha real de sistema de arquivos: usa um arquivo onde deveria existir um diretório.
- O teste negativo de banco substitui `db.get` e injeta `Promise.reject(new Error('SQLITE_BUSY...'))`. Ele comprova o tratamento HTTP 503 de uma falha simulada, não um bloqueio real do SQLite. Ajustar a redação do relatório; não é necessário atrasar a correção P0 por essa distinção.
- O benchmark HTTP é um avanço, mas contabiliza sucesso pelo status HTTP, sem conferir todos os registros gravados. A reprodução de fornecedores demonstra por que HTTP 200 sozinho não é prova de integridade. Os RPS também incluem probes e leituras; não equivalem a escritas por segundo.
- Evidências de navegador e de desempenho não substituem testes de concorrência dos endpoints que continuam com o padrão antigo.

## Prompt para o Antigravity

Conclua a correção transversal solicitada na revisão anterior. Leia `docs/REVISAO_FASE2_PILOTO_2026-09-21.md`. A suíte passa e frotas foi corrigida, porém fornecedores ainda retorna 20 sucessos e grava apenas 1 cadastro em concorrência.

1. Adicione uma regressão HTTP para 20 fornecedores distintos simultâneos. Compare os IDs de todas as respostas de sucesso com o GET e repita a conferência após reinício. Execute primeiro no código atual para registrar a falha.
2. Centralize a propagação das falhas de persistência: nenhum `ok:false` pode ser ignorado e virar resposta de sucesso. Preserve 409 para conflito e códigos coerentes para validação/erro de gravação. Ajuste os catches para não transformar indiscriminadamente qualquer falha em 400/500 ou 200.
3. Faça um inventário completo dos chamadores de `salvarEstado`, `persistTenantState`, `persistCurrentState` e `persistState`. Para cada um, registre rota/tarefa, estratégia de concorrência e tratamento do resultado. Não encerre o trabalho após corrigir somente o próximo endpoint apontado.
4. Nas operações de domínio, aplique leitura–mutação–persistência dentro da mesma fila compartilhada. Para snapshots do cliente, preserve conflito otimista explícito e rascunho. Não envolva um snapshot já lido em uma mutação que apenas sobrescreve o estado atual; não use `force` para esconder conflitos. Evite rede externa dentro da fila e repetição de efeitos externos.
5. Cubra fornecedores e ao menos operações representativas de OS, estoque e apontamentos, além de concorrência entre tipos diferentes de operação no mesmo tenant. Todo sucesso deve corresponder a alteração durável; conflitos precisam ser visíveis e recuperáveis. Preserve RBAC e isolamento multi-tenant.
6. Atualize o benchmark para conferir persistência por IDs e tenant, além dos status HTTP. Corrija no walkthrough a classificação da falha SQLite como simulada. Preserve os testes de frotas, boxes e readiness que já passaram.
7. Reexecute suíte completa e jornadas afetadas. Entregue a matriz de chamadores sem pendências silenciosas, contagens, códigos de saída e evidências. Não altere o banco operacional nem acrescente funcionalidades.

Critério de liberação: zero sucesso falso nos caminhos auditados, todas as alterações confirmadas duráveis após concorrência/reinício e evidências coerentes com o escopo testado. Até lá, manter o parecer NÃO APTO para dados reais.

## Arquivos de evidência desta revisão

- `docs/evidencias/revisao-fase2-2026-09-21/suite.txt`
- `docs/evidencias/revisao-fase2-2026-09-21/concorrencia-http.json`

Nenhum código da aplicação foi alterado nesta revisão.
