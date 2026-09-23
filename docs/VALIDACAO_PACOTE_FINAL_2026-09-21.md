# Validação do pacote operacional — 21/09/2026

Parecer: correção do supervisor confirmada; corrigir a codificação do XML antes de importar a tarefa. Prosseguir depois para o ensaio no host, sem ampliar o escopo funcional.

## Evidências desta revisão

- Executados os testes de supervisor, agendamento, manifesto/boot e backup externo com o preload oficial: **17 aprovados, zero falhas**, saída 0. Log: `evidencias/validacao-pacote-final-2026-09-21/testes-dirigidos.txt`.
- Confirmados reinício após saída 7, resposta HTTP do filho recuperado e rejeição de supervisor concorrente.
- Manifesto: 119 arquivos; teste de conferência SHA-256 aprovado.
- Boot temporário: `/health` e `/ready` aprovados. O teste usa `NODE_PATH` com as dependências existentes; não comprova instalação independente via `npm ci`.
- A suíte completa (545 aprovados e 1 ignorado) e as seis jornadas são resultados informados pelo Antigravity; não foram reexecutados nesta revisão.

## Pendência reproduzida

`scripts/gerar_tarefa_agendada_windows.cjs:24` declara `encoding="UTF-16"`, mas a linha 79 grava UTF-8. O XML entregue mantém essa inconsistência.

Leitura direta do arquivo usando `[System.Xml.XmlReader]::Create(caminho)` e `Read()` falhou com:

> There is no Unicode byte order mark. Cannot switch to Unicode.

Ao substituir somente a declaração por UTF-8 em memória e reler os bytes UTF-8, o parser aprovou. Nenhuma tarefa foi registrada ou alterada nesta revisão. Os testes atuais de agendamento verificam expressões de texto e não a leitura XML dos bytes gravados. A política `IgnoreNew` está presente, mas isso não comprova que o arquivo seja importável.

## Prompt para o Antigravity

Corrija somente o fechamento do pacote operacional do Pátio CRM, mantendo foco no piloto e no 5S:

1. Unifique declaração e gravação do XML em UTF-8 no gerador e regenere o arquivo. Escape os valores interpolados no XML, incluindo caminhos com `&`.
2. Adicione teste de regressão que grave um XML temporário e valide os bytes com parser XML real, incluindo um caminho com `&`. Preserve `IgnoreNew`, o intervalo horário e o diretório de trabalho. Não registre tarefas reais durante testes automatizados.
3. Reexecute os testes dirigidos e regenere o manifesto após a última alteração dos arquivos distribuídos. Atualize o checklist apenas com evidências efetivamente obtidas.
4. Prepare o ensaio no host: instalar dependências pelo lockfile em pasta independente, regenerar o XML com caminhos do host, conferir a conta executora e acesso ao destino externo. Executar a tarefa e conferir resultado e pacote externo; restaurar esse pacote em pasta isolada e validar login, leitura, escrita e anexos. Não substituir dados operacionais.
5. Encerrar com o status de cada passo: aprovado, pendente ou falhou. Não equiparar testes isolados à instalação real. Liberar a primeira OS real somente após os critérios operacionais já definidos no checklist. Não adicionar funcionalidades nem refatorações amplas nesta etapa.

Não é necessário reabrir as correções funcionais já aprovadas. O próximo marco é o ensaio operacional no computador da oficina.
