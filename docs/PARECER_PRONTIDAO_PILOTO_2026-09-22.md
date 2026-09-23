# Parecer de prontidão do piloto — 22/09/2026

## Reavaliação mais recente — 22/09/2026, 17:31 UTC

**Dados reais: liberação ainda pendente.** Conferidos 126 hashes, sem divergências na origem ou no deploy. `/ready` saudável, WhatsApp desativado. Executado `deployment_preflight_guard.test.cjs`: 3 entradas aprovadas, zero falhas (incluindo o pai). O caso de implantação executa o script real em destino temporário com sentinelas; o caso do instalador passa `--target`, opção que o instalador não interpreta, portanto esse caso não comprova por si só a recusa no destino temporário indicado. A recusa do instalador por `options.targetDir` já foi verificada anteriormente.

**Backup ainda local:** resposta atual de `http://127.0.0.1:3005/health` informou `vaultDir` dentro de `C:\Users\AutoMolasFort\.gemini\antigravity-ide\scratch\Patio-CRM-main\PatioCRM_Remote_Vault`, com dois pacotes. Executar outro serviço HTTP no mesmo computador não fornece independência do armazenamento. Os testes de upload/restauração não comprovam sobrevivência à perda desse disco. Conectar dispositivo físico independente ou configurar destino em outro host antes da liberação, sem criar novos serviços locais para simular essa condição.

**Segredo fixo ainda presente:** `servico_backup_remoto.cjs` e `executar_backup_operacional.cjs` usam o mesmo token literal como fallback. Remover o fallback, exigir configuração privada e substituir o token exposto. Os valores não foram reproduzidos neste parecer. A remoção das senhas antigas do código não comprova, sozinha, a rotação das credenciais ativas e sua entrega privada aos operadores.

**Próxima evidência necessária:** execução da tarefa sob sua conta definitiva, resultado da execução da tarefa (não apenas código de sucesso de `schtasks /Query`), pacote em armazenamento realmente independente e restauração isolada desse pacote. RPO de uma hora é objetivo condicionado a backups horários bem-sucedidos; falhas podem ampliar a janela.

As seções seguintes são histórico das verificações anteriores.

## Reavaliação do retorno posterior — 22/09/2026, 13:47 UTC

**Permanece pendente a liberação com dados reais.** Correções confirmadas: `/ready` respondeu `ready`, banco/storage `ok`, WhatsApp e integrações AI/scheduler desativados; os 124 hashes conferem na origem e no deploy. O instalador agora recusa destino não vazio. Seu teste dirigido passou (3 entradas aprovadas no runner, incluindo o teste pai).

Três pendências permanecem comprovadas:

1. **Dispositivo independente não comprovado:** o histórico anexado registra `subst B: C:\Users\AutoMolasFort\PatioCRM_Backups_Externos`. Essa configuração apenas atribui uma letra à pasta em C:. O teste `independent_device_backup.test.cjs` não verifica o dispositivo físico e usa pasta temporária caso B: não exista; portanto, seu sucesso não comprova independência. Nesta sessão, a consulta `subst` não retornou mapeamentos; a evidência do comando é o histórico fornecido. É necessário usar armazenamento efetivamente independente e validar a restauração sob a conta da tarefa.
2. **Credenciais expostas:** as novas senhas estão literais em `scripts/provisionar_credenciais_finais.cjs`, na cópia distribuída desse script e no checklist operacional. Remover as senhas desses artefatos e substituir as credenciais por fluxo privado, sem registrá-las nos relatórios. Não reproduzi os valores nesta revisão.
3. **Proteção de reexecução incompleta:** `executar_implantacao_real_piloto.cjs` ainda sobrescreve `.env` e `uploads/laudo_vistoria_inicial.pdf` antes da verificação do banco. O teste de seed executa um trecho simulado, não o script real; sua aprovação não valida essa proteção. Implementar recusa antes de qualquer escrita em instalação existente e testar o caminho real com banco/configuração/anexo sentinelas temporários.

Não executar ensaios automatizados sobre o destino de backup operacional. Não classificar a recuperação de uma amostra como RPO operacional zero: com backup horário, o intervalo desde o último backup bem-sucedido permanece sujeito a perda.

Após fechar essas pendências, reavaliar os critérios existentes sem adicionar funcionalidades. As observações abaixo registram a revisão anterior e devem ser lidas à luz desta atualização.

**Conclusão:** apto a testes com dados fictícios em ambiente isolado. Ainda não recomendo liberar o piloto com dados reais com base na configuração verificada nesta revisão.

## Verificações realizadas

- Conferência SHA-256 dos 122 arquivos do manifesto na raiz: nenhuma divergência.
- Conferência na instalação `deploy-piloto`: uma divergência em `scripts/instalar_pacote_piloto.cjs`. Os demais 121 arquivos conferem.
- HTTP local em 22/09/2026 às 11:54 UTC: `/health` e `/ready` retornaram 200. `/ready` informou `whatsapp: connected`, `scheduler: active` e `fiscal: homologacao_only`; portanto, não confirma a configuração de integrações desativadas do piloto. Não foi possível identificar com segurança o processo pelo mecanismo de consulta disponível.
- O destino `C:\Users\AutoMolasFort\PatioCRM_Backups_Externos` existe, contém pacotes e é uma pasta comum, sem vínculo/junção informado. Está no mesmo volume C: da instalação. Isso comprova cópia fora da pasta do projeto, não backup fora do host.
- A consulta ao Agendador retornou `Acesso negado`. O resultado 0 e o registro da tarefa permanecem evidências do relatório fornecido; não foram reconfirmados ao vivo nesta revisão.
- Não reexecutei instalador nem orquestrador: ambos contêm operações destrutivas sobre a instalação/base do piloto. Não reexecutei a suíte nesta revisão; os 21 testes foram aprovados na revisão anterior.

## Pendências concretas para dados reais

1. **Proteger reexecuções:** `scripts/instalar_pacote_piloto.cjs:33` remove recursivamente o destino existente. `scripts/executar_implantacao_real_piloto.cjs:131` remove banco, WAL e SHM do deploy antes do seed; o mesmo script sobrescreve `.env`. Fazer os comandos recusarem instalação/base existente sem alterar dados. Manter seed exclusivamente em ambiente descartável. Não executar esses comandos sobre o piloto ativo.
2. **Backup fora do host:** configurar dispositivo independente ou destino remoto, executar a tarefa sob a conta definitiva e restaurar um pacote desse destino em pasta isolada. Não classificar a pasta no mesmo C: como off-site.
3. **Instância correta:** identificar o serviço que ocupa a porta 3000 e iniciar a versão do deploy com seu supervisor e configuração prevista. Confirmar `/ready` com WhatsApp desativado antes dos testes operacionais. Não encerrar processo desconhecido automaticamente.
4. **Credenciais e versão:** substituir as senhas de exemplo divulgadas antes dos dados reais, verificar acesso e permissões dos três perfis e sincronizar a release sem executar o instalador destrutivo. Regenerar/conferir o manifesto após as correções.

## Próximo passo para o Antigravity

Fechar somente as quatro pendências acima, preservando toda base existente. Corrigir o checklist para separar evidência declarada, teste isolado e verificação atual do host. Apresentar evidência da instância ativa, backup em dispositivo independente, restauração e credenciais substituídas. Não declarar liberação com base apenas em HTTP 200, pasta existente ou retorno do ensaio. Após esses critérios, iniciar o piloto controlado já definido: uma oficina, três usuários e cinco dias úteis; manter as emissões oficiais no sistema atual.
