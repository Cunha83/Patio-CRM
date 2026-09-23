# Revisão da entrega de persistência e voz

## Conclusão

O bloqueador anteriormente reproduzido de abertura de OS confirmada sem gravação foi corrigido nos cenários testados. A revisão não sustenta aprovação irrestrita de todos os canais: permanece uma falha de recuperação na confirmação textual pelo endpoint geral de voz.

Recomendação: avançar com preparação do piloto restrito ao núcleo validado, corrigindo ou bloqueando na API a confirmação textual de alto risco antes de habilitá-la. Não é necessário reabrir a migração inteira nem refazer as correções já aprovadas.

## Resultados independentes

- Suíte: **525 testes, 524 aprovados, 0 falhas/cancelados, 1 ignorado, saída 0, duração 68,23 s**. Comando: `node --require ./scripts/test-preload.cjs --test --test-concurrency=2 --test-timeout=120000 tests/*.test.cjs`.
- Os testes existentes de frotas, fornecedores, peças, apontamentos, voz e reinício passaram na suíte.
- Ensaio HTTP adicional: **20 aberturas concorrentes de OS por voz, 20 sucessos, 20 IDs únicos e 20 IDs presentes no GET**.
- Falha de escrita injetada no acesso ao SQLite: comando de abertura retornou HTTP 500, sem sucesso fictício; quantidade de OS permaneceu em 20. Após remover a falha, nova tentativa retornou sucesso e elevou a quantidade a 21.
- Os hashes de `server.js`, repositório, módulo de tokens e motor de voz correspondem aos apresentados no walkthrough.
- As métricas de latência informadas no walkthrough correspondem ao JSON atual consultado. Benchmark e navegador não foram reexecutados nesta revisão.
- Todos os ensaios adicionais usaram subprocessos, bancos e diretórios temporários; as instâncias de teste foram encerradas. Não houve escrita na base operacional.

## P1 — Token consumido antes da persistência na confirmação textual

Reprodução HTTP:

1. Criar uma OS sintética e pedir sua exclusão em `/api/comando-voz`; resposta exige confirmação e fornece token.
2. Injetar falha na gravação do estado.
3. Enviar `{texto:"confirmar"}` em `/api/comando-voz`.
4. A rota retorna HTTP 500 e a OS continua presente, corretamente.
5. Remover a falha e reenviar o token a `/api/comando-voz/confirmar`.
6. A tentativa retorna HTTP 400, “Token já utilizado anteriormente”, apesar de a exclusão nunca ter sido gravada.

Causa: o endpoint dedicado fornece `autoConsumirToken:false` ao motor, mas o endpoint geral executa a intenção `confirmar_acao` sem essa opção. O motor usa consumo automático por padrão. O ajuste feito no endpoint dedicado não cobre a confirmação por texto/fala no endpoint geral.

Impacto comprovado: perda da possibilidade de repetir aquela confirmação após erro de armazenamento. Não houve exclusão indevida nem resposta falsa de sucesso neste ensaio. A operação precisa de uma nova solicitação/token. É uma pendência menor que a perda silenciosa das revisões anteriores, mas contradiz a declaração de consumo somente após persistência em todos os caminhos.

## Prompt pontual para o Antigravity

Leia `docs/REVISAO_PERSISTENCIA_VOZ_2026-09-21.md`. Preserve o núcleo aprovado: 525 testes executados, concorrência de voz corrigida e ausência de falso sucesso no ensaio de falha de escrita.

Corrija somente o caminho restante de confirmação:

1. Acrescente teste HTTP que solicita exclusão de uma OS, injeta falha de escrita, confirma por `{texto:"confirmar"}` no endpoint geral, remove a falha e repete a confirmação com o mesmo token. Antes da correção, a segunda tentativa falha com token já usado.
2. Unifique as confirmações do endpoint geral e do dedicado em um fluxo que valide, aplique e persista antes de consumir definitivamente o token. A reserva/consumo deve impedir execução duplicada concorrente, permitindo recuperação após gravação malsucedida. Preserve vínculo a tenant, usuário, recurso e validade do token.
3. Alternativa mínima para o piloto: rejeitar a intenção de confirmação textual no servidor e orientar o usuário ao botão/endpoint dedicado, mantendo esse caminho testado. Não basta alterar a interface.
4. Teste repetição após falha, confirmação concorrente com o mesmo token e isolamento entre usuários/tenants. Nenhum sucesso antes da gravação, nenhum token perdido por tentativa não persistida e nenhum efeito duplicado.
5. Execute a suíte completa e atualize o walkthrough com o escopo efetivamente habilitado. Não reescreva módulos nem amplie funcionalidades.

## Antes de dados reais

A validação do código não comprova a infraestrutura da oficina. Confirmar backup agendado e monitorado, cópia fora do host, ensaio de restauração e acesso restrito/contas individuais. O guia operacional declara que o agendamento de backup depende da infraestrutura externa. Manter emissão fiscal de produção e mutações de WhatsApp fora do escopo declarado do piloto.

Esta revisão não reexecutou auditoria de dependências nem comprovou resolução dos alertas anteriores. Lazy loading e bloqueio de mutações não removem automaticamente dependências vulneráveis instaladas.

## Evidências

- `docs/evidencias/revisao-voz-2026-09-21/suite.txt`
- `docs/evidencias/revisao-voz-2026-09-21/voz-concorrencia-falha-recuperacao.json`
- `docs/evidencias/revisao-voz-2026-09-21/confirmacao-token-falha.json`

Código da aplicação não alterado nesta revisão.
