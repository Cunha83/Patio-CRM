# Revisão do pacote de implantação do piloto

## Decisão

O núcleo da aplicação conserva a validação anterior. O pacote operacional ainda precisa de correções antes da primeira OS real. Não se trata de reabrir a estabilização funcional: os problemas identificados são nos novos scripts e nas alegações de prontidão operacional.

## Achados e evidências

### P0 operacional — cópia externa incompleta e falha não sinalizada

Reproduzido executando `scripts/executar_backup_operacional.cjs` em subprocessos com `DB_PATH`, `UPLOAD_DIR` e `BACKUP_DIR` temporários, um anexo sintético e destinos externos também temporários:

| Cenário | Resultado |
|---|---|
| `BACKUP_EXTERNAL_DIR` aponta para diretório inexistente | Emite aviso, mas encerra com **código 0** |
| Destino externo existe | Copia somente `.db`; **não copia o anexo** |

A pasta local de backup contém os anexos; o destino externo não contém. O script também não gera um manifesto de integridade do pacote completo: o hash retornado pelo serviço refere-se ao banco. O agendador pode considerar a tarefa bem-sucedida mesmo sem cópia externa. A perda do host continua implicando perda dos anexos.

Há `process.exit()` dentro do try/catch antes do `finally`; esse encerramento impede que o fechamento assíncrono do banco no finally seja concluído. Usar `process.exitCode` e deixar o processo encerrar após a limpeza.

### P1 — ensaio de recuperação não comprova o RTO anunciado

`scripts/testar_restauracao_isolada.cjs` implementa uma rotina própria de VACUUM/cópia, sem exercitar o novo script operacional. Cria apenas as tabelas `kv` e `backups`, um estado com uma OS/veículo/cliente e um anexo. Não cria nem confere usuários ou logs, apesar da afirmação do walkthrough.

`restoreDurationMs` mede a cópia do banco e do anexo. Não inclui iniciar o servidor, autenticar, consultar a OS ou validar acesso ao anexo. Logo, “4 ms” não comprova RTO operacional nem SLA de 5 segundos. O ensaio é útil como teste sintético de cópia/integridade, mas deve ser rotulado assim até ser ampliado.

### P1 — configuração do supervisor diverge da aplicação

O supervisor não carrega `.env`, calcula `HOST` como `127.0.0.1`, mas não repassa esse valor ao filho; repassa somente `PORT`. O servidor carrega `.env` e usa `0.0.0.0` se HOST não estiver configurado. Portanto, o endereço sondado e o endereço de escuta podem divergir. A documentação não pode afirmar acesso local exclusivo por padrão com essa implementação.

Uma sondagem TCP antes de iniciar também não é trava atômica de instância: dois supervisores simultâneos podem passar na sondagem. Não foi executado o supervisor operacional nesta revisão. Corrigir e ensaiar em ambiente isolado, sem interromper o servidor em uso.

### P1 — manifesto incompleto para identificar a instalação

Os hashes dos **103 arquivos listados conferem**, mas a lista não inclui `public/`, que contém páginas e recursos necessários da aplicação. O arquivo é um inventário parcial de hashes, não um pacote completo congelado e restaurável. Incluir os recursos públicos de aplicação, excluindo seletivamente uploads e dados. Hash SHA-256 não equivale a assinatura digital nem prova ausência de segredos.

O comando `npm test` foi alinhado corretamente à concorrência 2. A suíte funcional completa não foi repetida nesta revisão; foram examinados os novos artefatos operacionais e executados os ensaios dirigidos de backup.

## Prompt para o Antigravity

Leia `docs/REVISAO_IMPLANTACAO_PILOTO_2026-09-21.md`. Preserve o núcleo funcional aprovado. Corrija somente o pacote operacional antes de declarar início com dados reais.

1. Produza um pacote de backup autocontido: SQLite WAL consistente, anexos necessários e manifesto SHA-256 por arquivo. Replicar o pacote completo para o destino externo, conferir hashes no destino e somente então registrar conclusão. Usar diretório temporário de preparação e publicação final identificável; não deixar cópia parcial parecer concluída.
2. Quando cópia externa for exigida e o destino estiver indisponível, retornar saída não zero e registrar falha acionável. Diferenciar snapshot local concluído de proteção externa pendente. Nunca apagar backups válidos para mascarar uma tentativa incompleta. Substituir `process.exit()` dentro de try/catch por encerramento após finally. Usar caminhos absolutos independentes do diretório de trabalho do agendador.
3. Criar regressões isoladas para destino ausente, destino válido com anexos, cópia parcial/corrompida e restauração usando somente o pacote externo. Não acessar a base operacional nesses ensaios.
4. Restaurar o pacote em diretório separado, iniciar um servidor de teste, autenticar um usuário sintético e conferir OS, veículo, cadastro e anexo. Medir cópia, validação e recuperação ponta a ponta separadamente. Retirar “RTO 4 ms” e “SLA 5 s” como garantias operacionais sem ensaio correspondente.
5. Carregar uma única configuração no supervisor e repassar explicitamente HOST, PORT e caminhos ao filho. Padrão local deve ser realmente 127.0.0.1. Garantir instância única com mecanismo atômico e recuperação de trava abandonada. Testar duas partidas simultâneas, porta ocupada, crash/restart e encerramento limpo em ambiente isolado.
6. Ajustar instruções do Agendador para executável Node e caminhos absolutos, diretório de trabalho explícito, ausência de execuções sobrepostas e identidade com acesso ao destino externo. Documentar verificação do resultado da tarefa e do último backup externo validado. Não instalar a tarefa real antes de definir host, identidade e destino.
7. Completar o manifesto com páginas/recursos necessários de `public/`, excluindo `public/uploads` e dados/segredos. Verificar instalação em pasta limpa usando o artefato completo, em vez de tratar o hash parcial como release instalada.
8. Revisar o checklist: script implementado, teste isolado aprovado e instalação operacional verificada são estados diferentes. Corrigir os papéis e permissões documentados para coincidir com o código. Informar exatamente o que depende do operador e não autorizar a primeira OS real enquanto backup externo e recuperação estiverem pendentes.

Entregar logs, testes dos scripts, manifesto atualizado e checklist fiel. Sem novas funcionalidades, sem refatoração do CRM, sem restauração/seed/purge na base real.

## Próxima liberação

Após corrigir o pacote: definir destino externo, instalar/verificar o agendamento sob a identidade correta, trocar senhas e ensaiar recuperação no host de destino. Então iniciar a observação de uma oficina e poucos usuários. O impedimento atual está na continuidade operacional, não no núcleo de persistência já estabilizado.

Evidência reproduzida: `docs/evidencias/revisao-implantacao-2026-09-21/backup-isolado.json`. Nenhum código da aplicação foi alterado nesta revisão e nenhuma rotina foi executada contra o banco operacional.
