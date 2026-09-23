# Correções das cinco falhas da auditoria

## Escopo aplicado

Cinco arquivos de código de origem alterados, um arquivo novo de regressão e manifestos regenerados. Sem alteração de banco operacional, credenciais, dependências, interface ou tarefas agendadas. A cópia `deploy-piloto` e o processo ativo não foram atualizados/reiniciados nesta etapa; os resultados abaixo se referem ao código corrigido, testado em cópia temporária.

| Falha | Correção |
|---|---|
| Mecânico excluía OS e alterava clientes | `server.js` solicita autorização da substituição de estado; `stateRepository.js` confere as mudanças dentro da fila de escrita. Clientes/veículos exigem `crm:write`; criação/alterações de OS exigem `os:write`; exclusões exigem `os:delete`. Preservada a atualização de status de OS existente por mecânico com `labor:write`. Os comandos específicos dos serviços continuam com suas próprias verificações. |
| Nome de pacote apagava o cofre | `servico_backup_remoto.cjs` valida os identificadores antes de qualquer escrita, usa staging exclusivo e não remove pacotes anteriores. Duplicata retorna 409. |
| Backup sem banco era considerado verificado | Cofre exige `patio.db` não vazio, igualdade dos conjuntos de arquivos, caminhos válidos, SHA-256, tamanho e base64 correspondentes. Só publica após validar todos os arquivos. |
| Suporte recebia poderes administrativos e pulava CSRF | `context.js` verifica origem antes do ramo de plataforma, preserva permissões do suporte e exige permissão de gestão nos comandos administrativos. Operações específicas de suporte continuam permitidas com `platform:support`. |
| Loopback IPv6 aceito | `executar_backup_operacional.cjs` normaliza o hostname IPv6, rejeita loopback e URLs inválidas/protocolos diferentes de HTTP(S). Flags explícitas de teste existentes foram preservadas. |

## Validação

- Suíte final em cópia temporária: **571 entradas, 570 aprovadas, zero falhas, 1 ignorada**, 79,28 s.
- Arquivo RBAC dependente da porta 3000 executado separadamente, redirecionado para servidor temporário: **6 aprovadas, zero falhas**.
- Total: **576 aprovações, zero falhas e 1 ignorado**. Contagem inclui testes pais do runner.
- Ignorado: criação de symlink de arquivo impedida por EPERM no Windows, limitação já existente.
- Regressões específicas e compatibilidade financeira: **10 aprovadas**, já incluídas na suíte final.
- Reprodução HTTP da auditoria após a correção: mecânico recebeu 403; leitura posterior confirmou a OS e o cliente intactos.
- Chromium em servidor temporário: nove módulos navegados, cadastro de cliente persistido e zero exceções JavaScript observadas.
- Sintaxe dos cinco arquivos alterados aprovada. Os 128 arquivos conferem com o manifesto regenerado.

Durante a validação, o teste legado revelou o uso do POST de estado pelo mecânico para mudar o andamento da OS. A regra foi ajustada especificamente para preservar esse comportamento, sem liberar exclusão, criação, troca de identificação da OS ou alterações de cadastros. A suíte completa foi reexecutada após o ajuste.

## Evidências e limites

Logs em `docs/evidencias/correcoes-auditoria-2026-09-22/`:

- `suite-correcoes-final.txt`
- `rbac-correcoes.txt`
- `regressao-correcoes.txt`
- `http-audit-deep-results.json`

As falhas corrigidas não dispensam a configuração de armazenamento realmente independente e o ensaio operacional de restauração, pendentes anteriormente. A atualização do processo ativo exige publicar a versão corrigida e reiniciá-lo; não considerar que a instância em execução já recebeu estas alterações. Não foram incluídas atualizações de dependências ou refatorações fora dos cinco itens solicitados.
