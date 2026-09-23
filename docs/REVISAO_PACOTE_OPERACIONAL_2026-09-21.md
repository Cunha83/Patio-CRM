# Revisão da correção do pacote operacional

## Resultado

As correções de backup externo e inclusão de `public/` no manifesto avançaram e passaram nos testes dirigidos. A recomendação de manter a primeira OS real condicionada à comprovação no host é adequada. Resta corrigir o reinício do supervisor e a instrução de agendamento antes de tratar a supervisão como concluída.

## Evidências desta revisão

- Executei os arquivos `operational_backup_external`, `supervisor_isolated` e `clean_install_manifest` com o preload e concorrência 2: **11 testes aprovados, zero falhas, saída 0**.
- Os **118 hashes** do manifesto conferem; há **10 arquivos de `public/`** incluídos.
- Os testes de backup passaram para destino ausente, pacote externo com anexos e verificação de integridade.
- A suíte completa de 540 testes não foi reexecutada nesta revisão. O ensaio E2E de recuperação e o navegador também não foram reexecutados. Não extrapolar os 11 testes dirigidos para essas verificações.
- O teste denominado instalação limpa copia os arquivos e executa `node --check` em servidor e banco. Comprova integridade/cópia/sintaxe; não comprova instalação de dependências nem boot funcional a partir da pasta limpa.

## P1 reproduzido — supervisor não reinicia o filho após queda

Executei o supervisor com `SERVER_SCRIPT` apontando para um filho sintético que registra seu início e encerra com código 7. Porta, log, lock e caminhos de dados foram temporários; nenhum servidor ou banco operacional foi utilizado.

Resultado:

```json
{"exitCode":1,"childStarts":1,"selfLockRefusal":true}
```

O supervisor detecta a queda e espera 2 segundos. Ao chamar `startProcess()` novamente, tenta adquirir a trava que já pertence ao seu próprio PID. Como o PID está vivo, acusa instância duplicada e encerra com código 1. Portanto, a recuperação automática após crash não funciona, embora os três cenários existentes de supervisor passem. Esses cenários cobrem duplicidade, porta ocupada e trava abandonada; não cobrem reinício do filho.

## Instrução incorreta de agendamento

O manual atribui à opção `/np` a prevenção de execuções sobrepostas. A Microsoft documenta `/np` como execução sem armazenar senha, com recursos locais disponíveis; não é configuração de concorrência. Para não iniciar outra instância quando já houver execução, configurar explicitamente `MultipleInstancesPolicy=IgnoreNew` e conferir a tarefa exportada. Para NAS, validar a identidade e suas permissões reais de rede.

Fontes oficiais: [schtasks create](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/schtasks-create) e [MultipleInstancesPolicy](https://learn.microsoft.com/en-us/windows/win32/taskschd/taskschedulerschema-multipleinstancespolicy-settingstype-element).

## Prompt pontual para o Antigravity

Leia `docs/REVISAO_PACOTE_OPERACIONAL_2026-09-21.md`. Preserve backup, manifesto e núcleo funcional aprovados. Faça somente os ajustes abaixo:

1. Separe aquisição da trava de vida do supervisor da partida/repartida do filho. O mesmo supervisor deve manter sua trava durante o reinício; outro supervisor deve continuar bloqueado. Não libere a exclusividade entre tentativas de reinício.
2. Acrescente teste com filho que falha uma vez e permanece saudável na segunda execução: verificar dois inícios, supervisor ainda vivo e rejeição de segundo supervisor. Teste também o limite de falhas e encerramento limpo sem filho órfão. Usar apenas processos/caminhos temporários.
3. Corrija o manual: `/np` não impede sobreposição. Prepare configuração revisável com `MultipleInstancesPolicy=IgnoreNew`, caminhos absolutos e identidade adequada ao destino. Verifique o XML exportado e a execução real sob essa identidade quando o host/destino forem definidos. Não registrar uma tarefa operacional com credenciais presumidas.
4. Rotule o teste atual de instalação limpa como cópia/integridade/sintaxe. Para declarar instalação funcional comprovada, demonstrar dependências instaladas a partir do lockfile e boot/health em pasta limpa e banco isolado.
5. Reexecute os testes afetados e a suíte; regenere o manifesto após alterar scripts. Atualize o checklist sem apresentar crash/restart como comprovado antes da nova regressão passar.

Critério: supervisor recupera o filho sem perder exclusividade; agendamento não sobrepõe execuções por configuração verificável; primeira OS real continua condicionada a backup externo, recuperação e credenciais no ambiente da oficina. Sem novas funcionalidades ou reabertura das correções do CRM.

Evidências: `docs/evidencias/revisao-pacote-operacional-2026-09-21/testes-dirigidos.txt` e `supervisor-crash.json`. Nenhum código da aplicação foi alterado nesta revisão.
