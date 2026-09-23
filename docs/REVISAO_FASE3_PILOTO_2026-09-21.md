# Revisão independente — Fase 3

## Parecer

**Ainda NÃO APTO para o escopo com dados reais declarado no walkthrough.** Houve avanço comprovado em fornecedores, estoque e demais regressões da suíte. Continua existindo o mesmo bloqueador de sucesso HTTP sem persistência em caminhos não migrados. Não é uma exigência nova.

## Verificação executada

- Suíte completa com concorrência 2: **521 testes, 520 aprovados, zero falhas/cancelados, 1 ignorado, saída 0, 66,12 segundos**.
- SHA-256 de `server.js`, `lib/repository/stateRepository.js` e da matriz de chamadores correspondem aos hashes do walkthrough. Não foram conferidos todos os hashes da tabela.
- Ensaio HTTP independente em subprocesso com porta efêmera, banco e diretórios temporários, sem IA nem WhatsApp externos:

| Operação | Pedidos concorrentes | Sucessos HTTP declarados | Registros persistidos no GET |
|---|---:|---:|---:|
| Cadastro de frotas | 20 | 20 | 20 |
| Cadastro de fornecedores | 20 | 20 | 20 |
| Abertura de OS por `/api/comando-voz` | 20 | 20 | **1** |

Na última operação, todas as respostas retornaram `acao: abrir_os`, `success: true`, `ok: true` e IDs de OS distintos. Somente um desses 20 IDs foi encontrado no estado final. Foram usados textos de entrada de veículo com clientes sintéticos distintos, a partir da frase já presente em `tests/voice.test.cjs`. O subprocesso foi encerrado após o ensaio. Não houve escrita na instância operacional.

## Causa e divergência na matriz

`server.js:2311` executa `await salvarEstado(req, projectedState)` sem conferir sucesso. Em `server.js:192`, o helper continua devolvendo diretamente o resultado de `persistState`, inclusive `{ok:false,status:409}`. Como esse resultado não lança exceção, o catch da rota não protege a confirmação enviada ao usuário.

O mesmo padrão ainda é visível em `/api/comando-voz/confirmar` (`server.js:2358`) e na aprovação digital de orçamento (`server.js:5526`), além de chamadas internas. A perda de OS por voz foi reproduzida; as demais rotas citadas foram verificadas por leitura, não por ensaio concorrente nesta revisão.

A matriz atribui “saveRes.ok verificado ou exceção propagada” à chamada da linha 2311. Isso não corresponde ao código. A contagem de chamadores não comprova o tratamento correto de cada um. A fila serializa a gravação, mas não resolve leitura anterior à fila nem converte objetos de erro ignorados em exceções.

## Precisão do benchmark

O arquivo `benchmark_piloto_http_2026-09-21.json` registra `/ready` com **p50 296,92 ms e p95 318,82 ms**. O walkthrough informa **20,30 ms e 31,84 ms**, respectivamente. Corrigir a transcrição usando a evidência efetiva. Esse ajuste documental não é o bloqueador P0.

Não foi reexecutada a homologação no navegador nem o benchmark nesta revisão. As regressões de concorrência de domínio e de reinício existentes foram executadas como parte da suíte completa.

## Prompt corretivo para o Antigravity

Leia `docs/REVISAO_FASE3_PILOTO_2026-09-21.md`. Preserve as correções que já passaram. Resolva a causa transversal restante em vez de continuar corrigindo apenas o próximo endpoint apontado.

1. Crie uma regressão HTTP para `/api/comando-voz`: 20 aberturas de OS simultâneas, clientes sintéticos distintos, conferência dos IDs de todas as respostas de sucesso no GET e após reinício. Primeiro registre a falha no código atual. Inclua uma operação de voz concorrendo com uma gravação de outro domínio.
2. Torne obrigatório o tratamento de falhas nos helpers de gravação. Por exemplo, mantenha o contrato público de `persistState` para quem precisa inspecionar resultados e faça o helper imperativo `salvarEstado` lançar um erro tipado quando `ok !== true`, propagando status e versão atual. Audite os catches para preservar 409 e nunca converter falha em sucesso. Outra solução é aceitável se fornecer a mesma garantia e cobrir todos os chamadores.
3. Separe interpretação de voz e aplicação de alterações: execute o comando autorizado sobre o estado atual em uma região serializada ou devolva conflito explícito recuperável. Não faça chamada externa de IA dentro de uma fila global e não repita automaticamente ações externas. Nunca anuncie “registrei” nem consuma definitivamente uma confirmação de uso único antes de garantir a persistência correspondente.
4. Audite todos os retornos ignorados restantes, especialmente confirmação de voz, aprovação digital e tarefas internas. Para aprovação e tokens, garanta que conflito/falha não deixe o usuário com ação consumida sem alteração durável. Mantenha validação de tenant, permissões e projeção de dados sensíveis.
5. Atualize a matriz com evidência específica para cada chamador. Não classifique um `await salvarEstado(...)` como protegido só porque existe um catch. Registre teste, propagação de erro ou bloqueio explícito da função no piloto. Inclua testes de falha de persistência para comprovar que nenhuma camada responde sucesso nessa situação.
6. Se algum canal opcional não puder ser corrigido nesta entrega, bloqueie suas mutações tanto na API quanto na interface no perfil de piloto e identifique claramente a indisponibilidade. Não basta esconder um botão. Isso permite avaliar um escopo menor de piloto sem expor o caminho defeituoso.
7. Corrija os números de `/ready` no walkthrough; reexecute a suíte, os novos testes HTTP e as jornadas afetadas. Entregue logs, códigos de saída e matriz reconciliada com o código. Não amplie funcionalidades e não altere o banco operacional.

Critério de aceite: toda resposta de sucesso de escrita corresponde a uma alteração durável; conflitos são explícitos; nenhum canal habilitado mantém gravação com erro ignorado; regressões anteriores continuam passando. Declare APTO somente para o escopo efetivamente validado e habilitado.

## Evidências desta revisão

- `docs/evidencias/revisao-fase3-2026-09-21/suite.txt`
- `docs/evidencias/revisao-fase3-2026-09-21/concorrencia-http.json`

Nenhum código da aplicação foi alterado nesta revisão.
